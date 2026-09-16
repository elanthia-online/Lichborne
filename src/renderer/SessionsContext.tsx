// SessionsContext — the list of character tabs THIS WINDOW renders, and which is active.
//
// APP-LEVEL (mounted once in App.tsx, inside RosterProvider), not per-session.
// Owns `sessions` (one `SessionRecord` per tab), `activeId`, and the mutators
// GameWindow/App drive: add / remove / setActive / updateStatus /
// updateCharacterName. The cross-window picture lives in RosterContext; this
// is the window-local render source.
//
// Three things to hold:
//  • A tab's identity is `CharacterId` (account + character + game shard) —
//    computed ONCE in shared/characterId.ts (B301) and re-exported from here.
//    `addSession` REPLACES an existing record with that id (a reconnect inside
//    the same tab) and resets its status to DEFAULT_STATUS (B96, v0.8.0).
//  • `SessionStatus` is the SMALL snapshot the tab bar / app-bar read (health,
//    RT, indicators, which overlay panels are open). GameWindow pushes it via
//    `updateStatus`, which BAILS when no field changed so a vital tick doesn't
//    re-render the tab strip — that check is a hand-written field-by-field
//    chain, so a NEW `SessionStatus` field MUST be added to it, or changes to
//    that field alone never re-render anything.
//  • The provider value is `useMemo`'d over stable callbacks; keep it so.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SessionInfo } from './components/LoginScreen'
import type { SessionId } from '../shared/types'
import type { HighlightEffect } from './highlights'

// CharacterId is the stable identity of a tab — survives reconnects within
// the tab. v0.8.0: includes the game shard so the same character on a
// different shard gets a separate tab (Sekmeht-DRT and Sekmeht-DR are
// independent tabs, not the same tab renamed). DR's one-character-per-account
// rule still prevents both from being CONNECTED simultaneously — the conflict
// modal handles that case — but a tester can have one shard's tab live and
// the other in disconnected state for re-login.
export type CharacterId = string

// B301: the formula lives ONCE in shared/characterId.ts (main imports the same
// module, so the processes cannot drift). Imported-then-re-exported (a bare
// `export … from` would not bind the name for this file's own use below), and
// re-exported because this is where renderer code has always imported it from.
import { makeCharacterId } from '../shared/characterId'
export { makeCharacterId }

// Snapshot of game-state signals that the tab bar (and any other consumer)
// needs to render glyphs/health/dim state. GameWindow pushes updates via
// updateStatus whenever its underlying vitals/indicators/RT/connection change.
export interface SessionStatus {
  connected: boolean
  healthPct: number | null  // null when no health vital received yet
  rtExpires: number         // 0 when no RT active; ms timestamp otherwise
  bleeding: boolean
  stunned: boolean
  dead: boolean
  // Which app-bar overlay panels are open for THIS session, so the app-level
  // app-bar can light up the matching button for the ACTIVE session (the
  // per-session toolbar that used to show this was removed in 2c). Only the
  // four buttons that had an active state before: Debug, Logs, Maps, Lich.
  panelDebug: boolean
  panelLogs: boolean
  panelMap: boolean
  panelLich: boolean
  panelManager: boolean
  panelAutomations: boolean
  panelSettings: boolean
  panelContacts: boolean
  panelTheme: boolean
  // §34.5: the Experiences SHELF is open. Not "any Experience is showing" —
  // a docked Experience tab is permanent layout, so that never went dark (B346).
  panelExperiences: boolean
  // v0.19.7: this character's app-bar wordmark effect (`settings.brandEffect`).
  // The app bar is app-level chrome and cannot read per-session state, so the
  // value rides the status snapshot — the pitfall #57 "reflect via useSessions"
  // pattern the connection dot and the panel flags already use. A scalar, so it
  // works with the `!==` gate below; REMEMBER to add any new field there too
  // (pitfall #130 — an omitted term is written but never re-renders anything).
  brandEffect: HighlightEffect
}

const DEFAULT_STATUS: SessionStatus = {
  connected: true,
  healthPct: null,
  rtExpires: 0,
  bleeding: false,
  stunned: false,
  dead: false,
  panelDebug: false,
  panelLogs: false,
  panelMap: false,
  panelLich: false,
  panelManager: false,
  panelAutomations: false,
  panelSettings: false,
  panelContacts: false,
  panelTheme: false,
  panelExperiences: false,
  brandEffect: 'none',
}

export interface SessionRecord {
  characterId: CharacterId
  sessionId: SessionId
  account: string
  character: string
  game: string
  useLich: boolean
  // Attach mode: set when this session attached to a running Lich —
  // Reconnect re-attaches here instead of relaunching a login.
  attach?: { host: string; port: number }
  status: SessionStatus
}

interface SessionsContextValue {
  sessions: SessionRecord[]
  activeId: CharacterId | null
  setActive: (id: CharacterId) => void
  addSession: (info: SessionInfo) => CharacterId
  removeSession: (id: CharacterId) => void
  getSession: (id: CharacterId) => SessionRecord | undefined
  updateStatus: (id: CharacterId, partial: Partial<SessionStatus>) => void
  // Update the display name of a session to the server-canonical case (from
  // the player-info XML event). The user may have typed "sekmeht" but the
  // server says "Sekmeht" — show the server's casing in the tab bar and title.
  // The characterId is unchanged (it's lowercased) so all lookups still work.
  updateCharacterName: (id: CharacterId, character: string) => void
}

const SessionsContext = createContext<SessionsContextValue | null>(null)

export function SessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [activeId, setActiveId] = useState<CharacterId | null>(null)

  const addSession = useCallback((info: SessionInfo): CharacterId => {
    const characterId = makeCharacterId(info.account, info.character, info.game)
    setSessions(prev => {
      // Replace if a session for this characterId already exists (reconnect
      // within an existing tab). Otherwise append. Either way the status
      // resets to DEFAULT_STATUS — addSession is only called after a
      // successful login IPC, so `connected: true` is correct, and the prior
      // session's vitals/indicators are stale (the disconnect cleared them
      // in-game anyway). v0.8.0 (B96): the previous code preserved
      // `prev[existing].status` on reconnect, which carried the old
      // `connected: false` from a user-initiated Disconnect into the new
      // session — tab stayed greyed out even though main was fully connected.
      const existing = prev.findIndex(s => s.characterId === characterId)
      const record: SessionRecord = {
        characterId,
        sessionId: info.sessionId,
        account: info.account,
        character: info.character,
        game: info.game,
        useLich: info.useLich,
        attach: info.attach,
        status: { ...DEFAULT_STATUS },
      }
      if (existing >= 0) {
        const next = prev.slice()
        next[existing] = record
        return next
      }
      return [...prev, record]
    })
    setActiveId(characterId)
    return characterId
  }, [])

  const removeSession = useCallback((id: CharacterId) => {
    setSessions(prev => {
      const next = prev.filter(s => s.characterId !== id)
      setActiveId(curr => {
        if (curr !== id) return curr
        return next.length > 0 ? next[next.length - 1].characterId : null
      })
      return next
    })
  }, [])

  const setActive = useCallback((id: CharacterId) => {
    setActiveId(id)
  }, [])

  const getSession = useCallback((id: CharacterId) => {
    return sessions.find(s => s.characterId === id)
  }, [sessions])

  const updateCharacterName = useCallback((id: CharacterId, character: string) => {
    setSessions(prev => {
      const idx = prev.findIndex(s => s.characterId === id)
      if (idx < 0 || prev[idx].character === character) return prev
      const arr = prev.slice()
      arr[idx] = { ...prev[idx], character }
      return arr
    })
  }, [])

  const updateStatus = useCallback((id: CharacterId, partial: Partial<SessionStatus>) => {
    setSessions(prev => {
      const idx = prev.findIndex(s => s.characterId === id)
      if (idx < 0) return prev
      const curr = prev[idx].status
      const next: SessionStatus = { ...curr, ...partial }
      // Bail when nothing really changed — avoids spurious re-renders of the
      // tab bar on every vital tick when health/etc. haven't moved.
      if (next.connected === curr.connected
          && next.healthPct === curr.healthPct
          && next.rtExpires === curr.rtExpires
          && next.bleeding === curr.bleeding
          && next.stunned  === curr.stunned
          && next.dead === curr.dead
          && next.panelDebug === curr.panelDebug
          && next.panelLogs === curr.panelLogs
          && next.panelMap === curr.panelMap
          && next.panelLich === curr.panelLich
          && next.panelManager === curr.panelManager
          && next.panelAutomations === curr.panelAutomations
          && next.panelSettings === curr.panelSettings
          && next.panelContacts === curr.panelContacts
          && next.panelTheme === curr.panelTheme
          && next.panelExperiences === curr.panelExperiences
          && next.brandEffect === curr.brandEffect) return prev
      const arr = prev.slice()
      arr[idx] = { ...prev[idx], status: next }
      return arr
    })
  }, [])

  const value = useMemo<SessionsContextValue>(() => ({
    sessions, activeId, setActive, addSession, removeSession, getSession, updateStatus, updateCharacterName,
  }), [sessions, activeId, setActive, addSession, removeSession, getSession, updateStatus, updateCharacterName])

  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>
}

export function useSessions(): SessionsContextValue {
  const ctx = useContext(SessionsContext)
  if (!ctx) throw new Error('useSessions must be used within SessionsProvider')
  return ctx
}
