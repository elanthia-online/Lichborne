// App — the renderer's root: one BrowserWindow's shell, its character tabs, and everything app-level.
//
// `App` mounts the two APP-LEVEL providers — `RosterProvider` (main's
// cross-window session list) and `SessionsProvider` (this window's tabs) —
// around `AppShell`, the single component that owns everything above the
// per-character GameWindows. The ~1/s connect commentary is subscribed to
// INSIDE the Team Login tiles (TeamLoginPanel's TileStep), never held here, so
// it re-renders one line, not every game window (v0.18.0 perf audit).
//
// WHAT AppShell OWNS (each block below carries its own history):
//  • The session RENDER: every session gets a `.session-shell` that is hidden
//    by CSS (`display:none`), NEVER unmounted, when inactive — keyed
//    `${characterId}:${reloadNonce}` so bumping a nonce remounts that
//    GameWindow to re-read its localStorage working copy after a live profile
//    import (cross-window via `onSessionReload`). Each GameWindow is wrapped in
//    its PER-SESSION `CharacterProvider` + `GroupsProvider`; the socket lives in
//    main, so neither a remount nor a window move touches the connection.
//  • ONE connect flow, `runConnect` — password → `login` IPC →
//    `importCharacterProfile` → `exportCharacterProfile` → `addSession` —
//    reused by the launcher card (1.5s grace window + a Cancel honoured even
//    mid-flight), the tab-menu Reconnect, the same-account conflict resolve
//    (awaited disconnect + one 2s retry, v0.8.0), and Team Login
//    (`runBulkConnect`, F21 v0.8.0; sequential, Stop-not-Cancel v0.18.4).
//    `pendingCancelledRef` is reset at the TOP of `runConnect`, not by callers.
//  • The launcher / Add Character wizard / Lich Setup / Profile Transfer /
//    About / Quick Send / quit-confirm modals, the auto-update banner, and the
//    B99 "Closing…" overlay (delayed 250ms so instant shutdowns never flash it).
//  • Views (v0.19.0, DESIGN §47): the per-window, EPHEMERAL view mode; the
//    Overview is an OVERLAY over the session shells (they stay laid out so the
//    active scrollback stays measured) with an always-mounted portal host;
//    focus is moved out on entry and back on exit; theme ownership is FROZEN
//    on the character that was active when the Overview opened (v0.19.1); an
//    emptied window drops back to Session view.
//  • Multi-window (v0.11.0): the decouple-sync effect PULLS this window's
//    owned sessions on mount and reacts to PUSHED acquire/release; the
//    cross-window `storage` listener re-applies the theme and re-seeds the
//    Overview options (the ONE shared setting read from module memory).
//  • F62 (v0.15.2): the "Reconnect Last" snapshot — primary window only,
//    connected roster entries only, non-empty only — and its account-conflict
//    chooser, with eligibility in the PURE `planReconnect` (reconnectPlan.ts).
//  • The menu-action bridge: native-menu actions arrive on `onMenuAction`;
//    SESSION actions are re-dispatched as the `lichborne:session-action` DOM
//    event (only the ACTIVE GameWindow acts), APP actions run here through a
//    latest-closure ref. App-level chrome cannot read per-session contexts —
//    that bridge (and props) is how it reaches a character.
//  • App keyboard chords (§13.7): Ctrl/Cmd+1–9, Ctrl+Tab, Ctrl+Shift+Enter;
//    every tab switch refocuses the active command bar — never one the
//    Overview is covering. `document.title` has its single writer here.
//  • Cold start: `importSharedProfile` → silent Lich-path discovery (no
//    Desktop probe, DESIGN §41.3) → `sharedReady`, which gates the SimuCoin
//    startup pass (F71, DESIGN §42): app-level and per ACCOUNT, consent
//    RE-READ at the one choke point (`runSimucoin`), network pass in the
//    PRIMARY window once per launch, secondaries seeded from main's cache.
//  • `window.__flushProfileSaves` — main invokes it on close; it flushes every
//    pending debounced save AND re-exports every open character's profile so
//    a write that never scheduled a save still reaches YAML.
//  • `data-window-hidden` on <html>, stamped from main's per-window visibility
//    signal (`document.hidden` is unreliable here — pitfall #96).

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import type { SessionInfo } from './components/LoginScreen'
import Launcher, { loadCharacterCards, saveCharacterAttach, type LauncherCharacter } from './components/Launcher'
import AddCharacterWizard from './components/AddCharacterWizard'
import AttachModal from './components/AttachModal'
import LichSetupDialog from './components/LichSetupDialog'
import ProfileTransferModal from './components/ProfileTransferModal'
import AboutModal from './components/AboutModal'
import QuitConfirmModal, { type QuitConfirmRequest } from './components/QuitConfirmModal'
import GameWindow from './components/GameWindow'
import AppBar from './components/AppBar'
import QuickSend from './components/QuickSend'
import BulkConnectPicker from './components/BulkConnectPicker'
import { showToast } from './toasts'
import { characterNoticeToast, withdrawNotice, supersededBy, loadCharacterNoticesEnabled } from './characterNotices'

// B356/B364: the contract with main — an `updater-log` message starting with
// this is shown as a toast (prefix stripped); every other one is console-only.
const UPDATER_NOTICE_PREFIX = '[notice] '
import ToastHost from './components/ToastHost'
import ConfirmHost from './components/ConfirmHost'
import { GroupsProvider } from './components/GroupsContext'
import { SessionsProvider, useSessions, makeCharacterId, type CharacterId } from './SessionsContext'
import { TeamLoginPanel, SoloConnectPanel, TeamLoginPill, teamCounts, trackConnectSteps, type TeamRun, type TeamMember } from './components/TeamLoginPanel'
import { RosterProvider, useRoster } from './RosterContext'
import { CharacterProvider } from './CharacterContext'
import { flushPendingProfileSaves, exportCharacterProfile, importCharacterProfile, clearCharacterLocalStorage, importSharedProfile, exportSharedProfile, saveLastSessionCharacters, scheduleSharedProfileSave } from './profile'
import { planReconnect } from './reconnectPlan'
import { loadAdvanced, saveAdvanced, gameOptionByCode, IS_MAC } from './lichSettings'
import { initTheme } from './themes'
import type { LoginCredentials, SessionId, RosterEntry, SimuCoinStatus } from '../shared/types'
import { isSessionAction } from '../shared/menuActions'
import { simucoinToast } from './components/SimuCoinButton'
import { loadSimuCoinConfig, saveSimuCoinConfig, accountConfig, rememberBalance, SIMUCOIN_CHANGED_EVENT } from './simucoinConfig'
import OverviewShell from './components/overview/OverviewShell'
import { useViewMode, setViewMode, toggleViewMode, loadOverviewState, OVERVIEW_KEY } from './overviewStore'
import { backdropHandlers } from './utils/backdropClose'
import { useEscapeClose } from './hooks/useEscapeClose'

// Exposed to main via mainWindow.webContents.executeJavaScript on shutdown so
// every debounced profile save fires before the window destroys. Returns a
// Promise that main awaits before backing up + closing.
declare global {
  interface Window {
    __flushProfileSaves?: () => Promise<void>
  }
}

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready'

// Attach mode: last successful attach, for prefilling the modal.
// Deliberately GLOBAL (not per-character scoped) — it answers "what did I
// attach to most recently", which is the right default when the modal opens
// blank. Per-character targets live on the profile (CharacterProfile.attach).
const ATTACH_LAST_KEY = 'lichborne.attach.last'

export default function App() {
  return (
    <RosterProvider>
      <SessionsProvider>
        <AppShell />
      </SessionsProvider>
    </RosterProvider>
  )
}

// The + tab's "Connect a character" dialog (F113). Its own component so it
// MOUNTS when it opens: useEscapeClose's stack is mount-ordered, and a hook in
// AppShell gated on `enabled: showAdd` would sit at the BOTTOM of the stack,
// beneath per-session dialogs mounted after it — Esc would then close + from
// under whatever is on top of it (B341).
function AddCharacterModal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEscapeClose(onClose)
  return (
    // B342: backdropHandlers, so a press inside the launcher (a tile, its
    // scrollbar) that is released over the scrim no longer closes the dialog.
    <div className="add-character-modal" {...backdropHandlers(onClose)}>
      {/* The house modal chrome (UX standard #10, the About Lichborne look;
          F113): the PANEL is the dialog surface — an accent header band with
          the title and the ✕, then the Launcher as the scrolling body. The ✕
          lives in the header, not inside the Launcher, because the launcher
          is the scroll container and would carry it away. (B321: it once sat
          against the full-window backdrop, in the window's corner, where
          nobody saw it.) */}
      <div className="add-character-panel" role="dialog" aria-modal="true" aria-labelledby="add-character-title">
        <div className="add-character-head">
          <span id="add-character-title" className="add-character-title">Connect a character</span>
          <button
            type="button"
            className="ui-close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// An Esc-to-close entry for an inline App-level dialog, registered while that
// dialog is MOUNTED — so it stacks above whatever was already open, and Esc
// closes it rather than the + window underneath (B341).
function EscToClose({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose)
  return null
}

function AppShell() {
  const { sessions, activeId, addSession, removeSession, setActive, updateStatus } = useSessions()
  const { isPrimary, roster } = useRoster()

  // ── Views (v0.19.0, DESIGN §47) ───────────────────────────────────────────
  // The mode is PER-WINDOW and ephemeral: each BrowserWindow has its own store
  // instance, which is what a decoupled window showing one character wants —
  // it has no business being forced into the main window's view. Only the
  // display OPTIONS persist (app-wide, `_shared.yaml`).
  const view = useViewMode()
  const viewRef = useRef(view)
  viewRef.current = view
  // Portal target every GameWindow renders its Overview card into.
  const overviewHostRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => { loadOverviewState() }, [])

  // Entering the Overview must take focus OUT of whatever the overlay is about
  // to cover. The overlay leaves the session shell laid out on purpose (so its
  // scrollback stays measured), so a focused command bar stays focusable
  // underneath it — and the most common way to switch is typing `/view overview`
  // IN that bar, which leaves the caret sitting right there. Without this,
  // everything typed next lands in an invisible input and Enter sends it.
  // Leaving it must put focus BACK, or the first thing you type after returning
  // goes nowhere and you have to click the bar first — the same papercut the
  // Ctrl+# refocus below exists to prevent, reached by a different route.
  useEffect(() => {
    if (view === 'overview') {
      const el = document.activeElement as HTMLElement | null
      if (el && el.closest('.session-shell')) el.blur()
      return
    }
    // A frame, so the shell's visibility has committed before we query: an
    // input inside a display:none subtree is not focusable and focus() no-ops.
    const id = requestAnimationFrame(() => {
      if (viewRef.current === 'overview') return
      const el = document.querySelector(
        '.session-shell:not(.session-shell--hidden) .command-input'
      ) as HTMLInputElement | null
      el?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [view])

  // THEME OWNERSHIP while the Overview is open (Sekmeht, v0.19.1).
  //
  // Exactly one GameWindow writes the theme + per-character settings to the
  // document, and it was always the ACTIVE character — so clicking a tab from
  // the Overview handed ownership over and re-themed the whole dashboard under
  // you. Freezing WHO owns it (rather than freezing the apply itself) is what
  // fixes that without breaking anything: the owner's effect still re-runs when
  // the theme or its settings change, so a theme picked from the Overview still
  // lands; it just no longer moves house every time you click a tab.
  //
  // On LEAVING, ownership returns to whoever is active — so the character you
  // land on applies its own theme, and ordinary tab switching in Session view
  // behaves exactly as it always has.
  //
  // Known and accepted (Sekmeht): settings edited in the Overview belong to the
  // ACTIVE character, which may not be the owner, so they show up when you
  // leave. That matches Session view, where editing a background character's
  // settings does not touch the document either — and each card already re-maps
  // its own font inline, so only the summary strip and input bar are affected.
  const [frozenThemeOwner, setFrozenThemeOwner] = useState<string | null>(null)
  useEffect(() => {
    if (view === 'overview') setFrozenThemeOwner(prev => prev ?? activeId ?? null)
    else setFrozenThemeOwner(null)
  }, [view, activeId])
  // Fall back to the active character if the frozen owner has since been closed,
  // or nothing would own the document at all.
  const themeOwnerId = view === 'overview' && frozenThemeOwner
    && sessions.some(s => s.characterId === frozenThemeOwner)
    ? frozenThemeOwner
    : activeId

  // A window that empties drops back to Session view. The mode is per-window
  // state that outlives the characters in it, so closing your last character
  // while in the Overview would otherwise land the NEXT one you connect in a
  // dashboard showing a single card, rather than in the game.
  useEffect(() => {
    if (sessions.length === 0 && view === 'overview') setViewMode('session')
  }, [sessions.length, view])

  // Characters mid-reconnect via the tab-menu "Reconnect" — drives a "connecting"
  // indicator on the tab (the launcher's connecting overlay isn't visible for a
  // tab reconnect). Added on reconnect start, removed when runConnect settles.
  const [reconnectingIds, setReconnectingIds] = useState<Set<CharacterId>>(() => new Set())

  // ── Multi-window decouple sync (v0.11.0) ──────────────────────────────────────
  // Keep this window's tab set aligned with the sessions main has assigned to it.
  // On mount we PULL the sessions main owns for this window (a new decoupled
  // window mounts with its session already assigned; also recovers tabs after a
  // dev hot-reload). Thereafter main PUSHES acquire/release as characters move
  // between windows. addSession/removeSession are window-local — the socket lives
  // in main and is NOT touched by a move (a GameWindow unmount doesn't disconnect).
  const sessionsRef = useRef(sessions)
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => {
    const addOwned = (e: RosterEntry) => {
      if (sessionsRef.current.some(s => s.sessionId === e.sessionId)) return
      const cid = addSession({
        sessionId: e.sessionId, account: e.account,
        character: e.character, game: e.game, useLich: e.useLich,
        // Attach target rides the roster so a decoupled / re-homed attach
        // session keeps its re-attach path in the new window.
        attach: e.attach,
      })
      updateStatus(cid, { connected: e.connected })
    }
    window.api.getOwnedSessions().then(owned => owned.forEach(addOwned)).catch(() => {})
    const unsubAcquire = window.api.onSessionAcquire(addOwned)
    const unsubRelease = window.api.onSessionRelease(sessionId => {
      const rec = sessionsRef.current.find(s => s.sessionId === sessionId)
      if (rec) removeSession(rec.characterId)
    })
    return () => { unsubAcquire(); unsubRelease() }
  }, [addSession, removeSession, updateStatus])

  // ── Cross-window toasts (v0.20.0) ──────────────────────────────────────────
  // Main sends these only to the FOCUSED window (it picks where the player is
  // looking), so each shows once. Listeners subscribe once and read live state
  // through refs.
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  useEffect(() => {
    const goTo = (characterId: string) => () => window.api.focusCharacter(characterId)
    // A character is in the game / dropped / reconnected. The rules for when
    // to stay quiet live in characterNotices.ts (and its harness).
    const unsubNotice = window.api.onCharacterNotice(n => {
      // Connected in front of the player: they know, and it's about to be the
      // tab they're looking at. A DROP still shows.
      if (n.kind !== 'dropped' && foregroundConnectsRef.current.has(n.character.toLowerCase())) return
      const run = teamRunRef.current
      const toast = characterNoticeToast(n, {
        enabled: loadCharacterNoticesEnabled(),
        viewingId: viewRef.current === 'session' ? activeIdRef.current : null,
        // By NAME too: main announces a login from inside its handler, before
        // the renderer's await returns and the tile learns its characterId.
        inOpenTeamPanel: !!run?.expanded && run.members.some(m =>
          m.characterId === n.characterId || m.pick.name.toLowerCase() === n.character.toLowerCase()),
      }, goTo)
      // Newer news about a character takes it off the older, opposite toast —
      // a reconnect must not leave it listed as "disconnected". Only touches a
      // toast already on screen; runs even when this notice itself is quiet.
      for (const k of supersededBy(n.kind)) showToast(withdrawNotice(k, n.characterId, goTo))
      if (toast) showToast(toast)
    })
    // A trigger's Toast action, from this window or another.
    const unsubRouted = window.api.onRoutedToast(t => {
      showToast({
        kind: t.kind, title: t.title, message: t.message,
        ...(t.character ? { people: [{ name: t.character, characterId: t.characterId }] } : {}),
        ...(t.characterId ? { onClick: goTo(t.characterId), clickHint: 'Click to go to that character' } : {}),
      })
    })
    // "Go to this character", arriving after main focused this window. Leaves
    // the Overview so the character is actually on screen.
    const unsubSelect = window.api.onSelectCharacter(characterId => {
      if (!sessionsRef.current.some(s => s.characterId === characterId)) return
      setActive(characterId)
      if (viewRef.current === 'overview') setViewMode('session')
    })
    return () => { unsubNotice(); unsubRouted(); unsubSelect() }
  }, [setActive])

  // F62 (v0.15.2): snapshot the live character set for the launcher's
  // "Reconnect Last" button. Reads the ROSTER (all windows) so decoupled
  // characters are included; PRIMARY window only (one writer, no cross-window
  // duplicate writes); NON-EMPTY only, so the shutdown drain / a manual
  // disconnect-all can never wipe the last good set (a stale offer is
  // harmless — App filters already-connected characters at reconnect time).
  // scheduleSharedProfileSave keeps _shared.yaml in step, because
  // importSharedProfile re-seeds localStorage from YAML on next launch and a
  // never-exported snapshot would be rolled back by it.
  useEffect(() => {
    // CONNECTED entries only (v0.15.2 bug check): a roster entry can be a
    // DISCONNECTED tab still open in the bar — "last session" means who was
    // actually on, and a roster of only dead tabs must not overwrite the last
    // good set (the same `.connected` convention the single-tile conflict
    // check has always used).
    const live = roster.filter(r => r.connected)
    if (!isPrimary || live.length === 0) return
    const seen = new Set<string>()
    const entries = live
      .map(r => ({ account: r.account, name: r.character }))
      .filter(e => {
        const k = `${e.account}:${e.name}`.toLowerCase()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    saveLastSessionCharacters(entries)
    scheduleSharedProfileSave()
  }, [roster, isPrimary])

  // F62 + feel-pass fix (Sekmeht): reconnect eligibility respects DR's ONE
  // CHARACTER PER ACCOUNT rule. The first cut only skipped characters that
  // were THEMSELVES connected, so reconnecting a saved character onto an
  // account where a DIFFERENT character was live bounced the live one — the
  // exact vetting BulkConnectPicker does at the account level (buildBulkGroups)
  // that going straight to runBulkConnect skipped. Per Sekmeht's follow-up,
  // an account conflict is not silently skipped: a chooser modal lists each
  // conflicted account and the player picks per account — KEEP the connected
  // character (default) or SWITCH to the saved one (awaited disconnect first,
  // the continueWithDisconnect model). Nothing connects until the player
  // confirms; Cancel connects nothing. Conflict detection uses the ROSTER
  // (all windows), and roster entries carry the sessionId, so a switch can
  // disconnect a character living in a decoupled window too.
  type ReconnectConflict = { saved: LauncherCharacter; connectedName: string; connectedSessionId: SessionId; account: string; choice: 'keep' | 'switch' }
  const [reconnectPrompt, setReconnectPrompt] = useState<{ todo: LauncherCharacter[]; conflicts: ReconnectConflict[] } | null>(null)
  const [reconnectBusy, setReconnectBusy] = useState(false)

  // Everyone logged in across ALL windows. Feeds the launcher's Teams rows so
  // they grey the members Connect will skip — planReconnect reads the same
  // roster, so the row's count and the actual outcome cannot disagree.
  const connectedCharacterNames = useMemo(
    () => roster.filter(r => r.character).map(r => r.character as string), [roster])

  // Teams row ⋯ → Edit. Opens Team Login with that team already loaded, so
  // "edit" means the surface you built it on rather than a second editor.
  function openTeamForEdit(setName: string) {
    void loadCharacterCards().then(cards => {
      if (!cards.length) return
      setBulkPickerSet(setName)
      setBulkPickerSource(cards)
    })
  }

  // A team login already running: refuse up front, before anything is
  // disconnected (the Keep/Switch chooser's "switch" logs characters out first,
  // and runBulkConnect's own guard would only refuse AFTER that).
  function teamRunBusy(): boolean {
    if (!teamRunRef.current || teamRunRef.current.done) return false
    showToast({ title: 'A team login is already running', message: 'Wait for it to finish, or open it from the Team login pill and Stop it.' })
    return true
  }

  function handleReconnectLast(picks: LauncherCharacter[]) {
    if (reconnectPrompt) return
    if (teamRunBusy()) return
    // Eligibility lives in the PURE planReconnect (reconnectPlan.ts) so the
    // rules harness locks it: connected-only roster reads, already-on skips,
    // account conflicts → chooser rows, one-per-account batch dedup.
    const plan = planReconnect(picks, roster)
    if (plan.conflicts.length === 0) {
      if (plan.todo.length === 0) return
      const separate = localStorage.getItem('lichborne.bulkConnectSeparateWindows') === 'true'
      void runBulkConnect(plan.todo, separate)
      return
    }
    setReconnectPrompt({
      todo: plan.todo,
      conflicts: plan.conflicts.map(c => ({ ...c, choice: 'keep' as const })),
    })
  }

  function setReconnectChoice(index: number, choice: 'keep' | 'switch') {
    setReconnectPrompt(p => p && { ...p, conflicts: p.conflicts.map((c, i) => i === index ? { ...c, choice } : c) })
  }

  async function confirmReconnectPrompt() {
    if (!reconnectPrompt || reconnectBusy) return
    if (teamRunBusy()) { setReconnectPrompt(null); return }
    const { todo, conflicts } = reconnectPrompt
    setReconnectBusy(true)
    try {
      const switched = conflicts.filter(c => c.choice === 'switch')
      for (const c of switched) {
        // Awaited (NOT fire-and-forget) so SGE sees the slot free — the
        // continueWithDisconnect rationale. The disconnected tab stays open.
        await window.api.disconnectAwait(c.connectedSessionId)
      }
      // DR's server-side slot release can lag the disconnect ack by a beat;
      // one grace pause before the batch instead of per-character retries.
      if (switched.length > 0) await new Promise(r => setTimeout(r, 2000))
      const finalPicks = [...todo, ...switched.map(c => c.saved)]
      setReconnectPrompt(null)
      setReconnectBusy(false)
      if (finalPicks.length > 0) {
        const separate = localStorage.getItem('lichborne.bulkConnectSeparateWindows') === 'true'
        await runBulkConnect(finalPicks, separate)
      }
    } catch (err) {
      setConnectError(`Failed to disconnect: ${String(err)}`)
      setReconnectPrompt(null)
      setReconnectBusy(false)
    }
  }
  const [showAdd, setShowAdd] = useState(false)
  // The Add modal renders the Launcher (cards) so the user can pick a saved
  // character. Clicking "+ Add account" inside the Launcher opens the wizard
  // by setting showWizard. wizardPrefillAccount carries the account name when
  // the wizard is opened via "↺ Refresh" on a launcher account header (v0.8.0).
  const [showWizard, setShowWizard] = useState(false)
  const [wizardPrefillAccount, setWizardPrefillAccount] = useState<string | undefined>(undefined)
  // Why the wizard was opened, when it was not the user asking for it. Shown at
  // the top of step 1 so an involuntary trip there explains itself.
  const [wizardReason, setWizardReason] = useState<string | undefined>(undefined)
  // Bumped each time the wizard adds tiles — Launcher useEffect-keyed on this
  // re-fetches the profiles list so newly-discovered characters appear.
  const [launcherRefreshKey, setLauncherRefreshKey] = useState(0)
  // Bulk Connect (v0.8.0, F21). Two states across the lifecycle:
  //  - bulkPickerSource: Launcher passed its character list → picker modal open
  //  - teamRun: the sequential connect and its outcome, drawn by the Team Login
  //    panel / app-bar pill (TeamLoginPanel.tsx, v0.20.0 — replaced the old
  //    progress card + text summary)
  const [bulkPickerSource, setBulkPickerSource] = useState<LauncherCharacter[] | null>(null)
  // Team to preload when the picker opens from a Teams row's Edit (null = a
  // normal Team Login, nothing preselected).
  const [bulkPickerSet, setBulkPickerSet] = useState<string | null>(null)
  // The team run. State for RENDER, mirrored in a ref for the async loop and
  // the panel handlers, which would otherwise read a stale closure. Writes go
  // through setTeamRun so the two can never disagree — and never through a
  // setState updater, which StrictMode may run twice.
  const [teamRun, setTeamRunState] = useState<TeamRun | null>(null)
  const teamRunRef = useRef<TeamRun | null>(null)
  // "Open each in its own window", remembered for a Retry after the run.
  const teamSeparateRef = useRef(false)
  // Hides the ✓ pill a few seconds after a clean finish.
  const teamPillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Which characters have a tab in THIS window — a READY tile whose tab the
  // player has since closed must not offer Play.
  const openCharacterIds = useMemo(() => new Set(sessions.map(s => s.characterId)), [sessions])
  // The pill and the placeholder tabs live in the app bar, which exists only
  // while a character is open. If the player closes every tab while the panel
  // is folded, bring the panel back — otherwise the run (and any failure's
  // Retry) would have nowhere on screen to be found.
  useEffect(() => {
    const r = teamRunRef.current
    if (r && !r.expanded && sessions.length === 0) patchTeam({ expanded: true })
  }, [sessions.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // NOTE: the live connect commentary deliberately does NOT live in AppShell
  // state. It updates ~once per SECOND during a Lich wait, and GameWindow is
  // not memoized (its onDisconnect is an inline arrow), so holding it here
  // re-rendered EVERY connected character's game window once a second for up
  // to 30s — a real hitch while other characters are playing. It lives in the
  // tile's TileStep leaf (TeamLoginPanel) instead — for a single connect too,
  // via SoloConnectPanel — which subscribes itself; nothing else in the tree
  // re-renders when a step arrives (v0.18.0 perf audit).
  // Set by the panel's Stop button; read at the top of each loop iteration in
  // runBulkConnect (a ref, because the loop closure cannot see state).
  const bulkStopRef = useRef(false)
  const [showLichSetup, setShowLichSetup] = useState(false)
  const [showQuickSend, setShowQuickSend] = useState<{ initialCommand: string } | null>(null)
  // Profile Transfer (Launcher → Transfer). AppShell hosts the modal because it
  // owns `sessions` (to tell active targets apart) and the per-session reload
  // nonces (to remount a session after a live import). Opened via the
  // `lichborne:open-profile-transfer` custom event the Launcher dispatches.
  const [showProfileTransfer, setShowProfileTransfer] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [quitConfirm, setQuitConfirm] = useState<QuitConfirmRequest | null>(null)
  // Per-session remount key suffix. Bumping a character's nonce changes its
  // GameWindow `key`, forcing a full remount that re-reads all per-character
  // state from localStorage — used to commit a live profile import into a
  // running (focused OR backgrounded) session. The socket lives in main, so the
  // remount doesn't drop the connection.
  const [reloadNonces, setReloadNonces] = useState<Record<string, number>>({})
  // Visible "Closing…" overlay shown while main is shutting down (v0.8.0,
  // B99). Without it, the up-to-5s gracefulDisconnect wait looks like a
  // frozen window — OS animations stall and the user sees nothing happen.
  // Main sends 'shutdown-starting' with the active-session count the moment
  // it intercepts the window close; this state flips on, the overlay paints,
  // and the window destroys shortly after.
  const [shutdownInfo, setShutdownInfo] = useState<{ activeCount: number } | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateVersion, setUpdateVersion] = useState('')
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [upToDate, setUpToDate] = useState(false)

  // Connect-from-card state: when the user clicks [Connect →] on a Launcher
  // card, we show a "Connecting to <name>… [Cancel]" overlay for a brief grace
  // window (1.5s) before firing the actual login IPC. Lets accidental clicks be
  // backed out before any network traffic.
  const [pendingConnect, setPendingConnect] = useState<LauncherCharacter | null>(null)
  const [connectError,    setConnectError]    = useState<string>('')
  // Attach-to-running-Lich modal (see runAttach). Opened via
  // openAttachModal, which loads the prefill (last attach) and the saved
  // per-character targets (for name → host:port autofill) before showing it.
  const [showAttach, setShowAttach] = useState(false)
  const [attachInitial, setAttachInitial] = useState<{ character: string; host: string; port: number } | null>(null)
  const [attachKnown, setAttachKnown] = useState<Record<string, { host: string; port: number }>>({})
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingCancelledRef = useRef(false)

  // v0.8.0: when the user picks a character whose account already has another
  // character connected, we show a confirmation modal instead of flat-out
  // refusing. On Continue we await-disconnect the conflicting session and
  // then start the new connect (with a single 2s retry to ride out DR's
  // server-side account-slot release lag). The conflicting tab is NOT
  // removed — it stays in the bar in disconnected state, same as if the user
  // had pressed the in-tab Disconnect button. They can close it via X or
  // re-login to it later.
  const [pendingConflict, setPendingConflict] = useState<{
    incoming: LauncherCharacter
    conflict: { character: string; sessionId: SessionId; characterId: CharacterId; game: string }
  } | null>(null)
  const [conflictBusy, setConflictBusy] = useState(false)

  // __flushProfileSaves is called by main's window-close handler. It fires every
  // pending debounced save AND unconditionally saves every active character's
  // profile as a defense-in-depth measure: any per-character localStorage write
  // that wrote a value but didn't also call scheduleProfileSave still reaches
  // YAML before the window destroys. Without this, settings toggled on the
  // map's label dropdown / panel layout / exp sort / etc. would be lost on
  // close if no other change triggered a save in the same session.
  //
  // Re-binds whenever `sessions` changes so the closure always sees the current
  // list. Main only invokes this once on close, so there's no race window.
  useEffect(() => {
    window.__flushProfileSaves = async () => {
      await flushPendingProfileSaves()
      await Promise.all(sessions.map(s =>
        exportCharacterProfile(s.account, s.character, s.game, s.useLich).catch(console.error)
      ))
    }
    return () => { delete window.__flushProfileSaves }
  }, [sessions])

  // v0.8.0 (B99): listen for the shutdown-starting signal from main and flip
  // the "Closing…" overlay on so the graceful-disconnect wait gets visible
  // feedback. v0.8.1: delayed-show. Backups + Lich socket.end() typically
  // finish well under 250ms; painting the overlay immediately makes it flash
  // for users whose shutdown is actually instantaneous. We arm a 250ms timer
  // on the signal — if main destroys the window before it fires (the common
  // case), no overlay paints. Only genuinely slow shutdowns (hung network,
  // huge backup) ever surface the overlay.
  const OVERLAY_DELAY_MS = 250
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = window.api.onShutdownStarting((info) => {
      timer = setTimeout(() => setShutdownInfo(info), OVERLAY_DELAY_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [])

  // Single source of truth for document.title. Re-fires on tab switch (activeId)
  // and on the active session's character / game / connection-status changes.
  // GameWindow and LoginScreen no longer touch document.title — they'd each
  // write only on specific events (player-info / disconnect) and the title
  // would stall on whatever was last written when the user switched tabs.
  const activeSession = activeId ? sessions.find(s => s.characterId === activeId) : null
  const activeCharacter = activeSession?.character ?? ''
  const activeGame      = activeSession?.game ?? ''
  const activeConnected = activeSession?.status.connected ?? false
  useEffect(() => {
    if (!activeSession) {
      document.title = `DR [Not connected] | Lichborne v${__APP_VERSION__}`
    } else {
      const state = activeConnected ? 'Connected' : 'Disconnected'
      document.title = `${activeCharacter} · ${activeGame} [${state}] | Lichborne v${__APP_VERSION__}`
    }
  // activeSession is intentionally not in deps — its identity changes on every
  // sessions array update; we re-derive title from the primitive fields only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacter, activeGame, activeConnected])

  // Refocus the active GameWindow's command input after a tab switch — and
  // (B343) as the fallback when Quick Send closes. The session-shell DOM toggle
  // happens on the next React commit, so we wait a frame before querying.
  // Selector is "the one visible session-shell" since hidden ones are
  // display:none and their inputs aren't focusable anyway. (Bug: Ctrl+# used to
  // leave focus wherever it was — usually nowhere — so testers had to click the
  // bar before they could type.) Reads only a ref and the DOM, so it is stable.
  const refocusActiveCommandBar = useCallback(() => {
    // v0.19.0 Views: NEVER refocus into a command bar the Overview is
    // covering. The overlay deliberately leaves the active session shell
    // laid out (so its virtualised scrollback stays measured), which means
    // the shell is not `--hidden` and this selector still finds its input —
    // focusing it would put the caret in an invisible field where typing goes
    // nowhere visible and Enter still sends to the game.
    if (viewRef.current === 'overview') return
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '.session-shell:not(.session-shell--hidden) .command-input'
      ) as HTMLInputElement | null
      el?.focus()
    })
  }, [])

  // B343: closing Quick Send left keyboard focus NOWHERE — unmounting the modal
  // drops focus to <body>, so ↑ history and Enter did nothing until you
  // clicked. It now puts focus back where it was when Quick Send opened (which
  // may be a dialog's field it was opened over, not the command bar), falling
  // back to the command bar — or, in the Overview, the Overview's own input
  // bar, since the covered command bar must never take focus (pitfall #131).
  const quickSendReturnFocusRef = useRef<HTMLElement | null>(null)
  const openQuickSend = useCallback((initialCommand: string) => {
    quickSendReturnFocusRef.current = document.activeElement as HTMLElement | null
    setShowQuickSend({ initialCommand })
  }, [])
  const closeQuickSend = useCallback(() => {
    setShowQuickSend(null)
    const prev = quickSendReturnFocusRef.current
    quickSendReturnFocusRef.current = null
    // A frame, so the modal has unmounted before focus moves.
    requestAnimationFrame(() => {
      const overview = viewRef.current === 'overview'
      if (prev && prev !== document.body && prev.isConnected
          && prev.getClientRects().length > 0            // still laid out (not a hidden tab)
          && !(overview && prev.closest('.session-shell'))) {
        prev.focus()
        return
      }
      if (overview) {
        (document.querySelector('.ov-inputbar-input') as HTMLInputElement | null)?.focus()
        return
      }
      refocusActiveCommandBar()
    })
  }, [refocusActiveCommandBar])

  // B376: where keyboard focus goes when the LAST dialog closes and left it
  // nowhere — handed to the dialog stack (useEscapeClose) through ConfirmHost.
  // The Overview's own input bar in the Overview (the covered command bar must
  // never take focus, pitfall #131), otherwise the active command bar.
  const dialogHomeFocus = useCallback(() => {
    if (viewRef.current === 'overview') {
      (document.querySelector('.ov-inputbar-input') as HTMLInputElement | null)?.focus()
      return
    }
    refocusActiveCommandBar()
  }, [refocusActiveCommandBar])

  // §13.7 — App-level keyboard shortcuts. Ctrl+1..9 jump to a tab by slot;
  // Ctrl+Tab cycles to the next connected character; Ctrl+Shift+Enter opens
  // the Quick-Send overlay. The active GameWindow's local keydown handler
  // already early-returns when not active, so these don't collide.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cross-platform (v0.18.0): on macOS the primary chord modifier is Cmd
      // (metaKey); Ctrl variants STAY live there too (additive — the Windows
      // chords are documented muscle memory and never break). On Windows/Linux
      // metaKey is the OS key, which the OS mostly intercepts before we see it
      // — accepting it here is inert.
      const primaryMod = e.ctrlKey || (IS_MAC && e.metaKey)
      // Ctrl+Shift+Enter (Cmd+Shift+Enter on Mac): Quick-Send — works even from
      // a text field so a player can hit it from the main command bar. Prefill
      // with whatever's currently typed into the active command bar so the
      // player can immediately retarget a command they were composing.
      if (primaryMod && e.shiftKey && e.key === 'Enter') {
        // Gate on CONNECTED characters, not open tabs — `sessions` includes
        // disconnected ones, so with a single dead tab this opened a modal
        // whose only content was "No connected characters" and a permanently
        // greyed Send (v0.18.0 bug check).
        if (!roster.some(r => r.connected)) return
        e.preventDefault()
        const srcInput = document.querySelector(
          '.session-shell:not(.session-shell--hidden) .command-input'
        ) as HTMLInputElement | null
        openQuickSend(srcInput?.value ?? '')
        return
      }
      // Ctrl+1..9 and Ctrl+Tab fire regardless of text-field focus — the whole
      // point of tab-switch hotkeys is "jump from wherever your hands are."
      // Neither chord has a text-editing meaning, so allowing them inside the
      // command bar is the right call. (Mac: Cmd+1..9 is the platform's own
      // jump-to-tab convention; Ctrl+Tab works on Mac keyboards too.)
      if (primaryMod && !e.shiftKey && !e.altKey) {
        if (e.key === 'Tab') {
          if (sessions.length < 2) return
          e.preventDefault()
          const idx = activeId ? sessions.findIndex(s => s.characterId === activeId) : -1
          const nextIdx = (idx + 1) % sessions.length
          setActive(sessions[nextIdx].characterId)
          refocusActiveCommandBar()
          return
        }
        if (e.key >= '1' && e.key <= '9') {
          const slot = parseInt(e.key, 10) - 1
          if (slot < sessions.length) {
            e.preventDefault()
            setActive(sessions[slot].characterId)
            refocusActiveCommandBar()
          }
        }
      }
    }
    // v0.8.6 (Rakkor): the prompt marker `>` next to the active command
    // bar dispatches this event when clicked, opening QuickSend with the
    // currently-typed command (mirrors Ctrl+Shift+Enter exactly). Custom
    // event avoids threading an onOpenQuickSend prop through to every
    // GameWindow when AppShell already owns the modal state.
    function onOpenQuickSend() {
      if (sessions.length === 0) return
      const srcInput = document.querySelector(
        '.session-shell:not(.session-shell--hidden) .command-input'
      ) as HTMLInputElement | null
      openQuickSend(srcInput?.value ?? '')
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('lichborne:open-quick-send', onOpenQuickSend)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('lichborne:open-quick-send', onOpenQuickSend)
    }
  }, [sessions, activeId, setActive, refocusActiveCommandBar, openQuickSend])

  // Profile Transfer open hook — the Launcher's "Transfer" button dispatches
  // this. Empty deps: opening just flips the boolean; the modal reads live
  // `sessions` via props at render time.
  useEffect(() => {
    const open = () => setShowProfileTransfer(true)
    document.addEventListener('lichborne:open-profile-transfer', open)
    return () => document.removeEventListener('lichborne:open-profile-transfer', open)
  }, [])

  // Native-menu (and future app-bar) action bridge — Phase 2a/2b. Session
  // actions are re-dispatched as a DOM event that only the ACTIVE GameWindow
  // handles (guarded on its isActiveRef); app-level actions run here via a
  // latest-closure ref so they see live sessions/activeId. Subscriber is
  // registered once (empty deps).
  const runAppActionRef = useRef<(action: string) => void>(() => {})
  useEffect(() => {
    runAppActionRef.current = (action: string) => {
      switch (action) {
        case 'quick-send':      document.dispatchEvent(new CustomEvent('lichborne:open-quick-send')); break
        // B330: Transfer (z 300) would open UNDER the + window (1000) and look
        // like nothing happened, so + closes first.
        case 'profile-export':
        case 'profile-import':  setShowAdd(false); setShowProfileTransfer(true); break
        case 'login-character': setShowAdd(true); break  // same as the "+" tab — character picker + add-account button
        case 'bulk-connect':    void loadCharacterCards().then(cards => { if (cards.length) setBulkPickerSource(cards) }); break
        case 'close-character': if (activeId) handleCloseTab(activeId); break
        case 'next-character':
        case 'prev-character': {
          if (sessions.length < 2) break
          const idx = activeId ? sessions.findIndex(s => s.characterId === activeId) : 0
          const delta = action === 'next-character' ? 1 : -1
          const ni = (idx + delta + sessions.length) % sessions.length
          setActive(sessions[ni].characterId)
          break
        }
        case 'check-updates':   handleCheckForUpdates(); break
        case 'about':           setShowAbout(true); break
        // An APP action, not a session one: it acts on the window and must work
        // with no active character.
        case 'toggle-view':     toggleViewMode(); break
      }
    }
  })
  useEffect(() => {
    const off = window.api.onMenuAction?.(({ action }) => {
      if (isSessionAction(action)) {
        // B330: every session action either opens a per-session panel (z
        // 100–400, far below the + window's 1000 — Tools → Settings "did
        // nothing" until + was closed) or acts on the active character, which
        // the + window is covering. Close + so the result is visible. The
        // app-bar buttons skip this path, but they sit under + anyway.
        setShowAdd(false)
        document.dispatchEvent(new CustomEvent('lichborne:session-action', { detail: { action } }))
      } else {
        runAppActionRef.current?.(action)
      }
    })
    return () => off?.()
  }, [])

  // Remount a single session's GameWindow (by characterId) so it re-reads its
  // per-character state from localStorage after a live profile import.
  const reloadSession = useCallback((characterId: string) => {
    setReloadNonces(prev => ({ ...prev, [characterId]: (prev[characterId] ?? 0) + 1 }))
  }, [])

  // Cross-window remount (Profile Transfer): main routes a reload request to the
  // window that OWNS the session, so a target character living in another window
  // re-reads its imported localStorage working copy live. Fires only in the
  // owner window (only it gets the message).
  useEffect(() => window.api.onSessionReload(reloadSession), [reloadSession])

  // Cross-window THEME sync (v0.11.0). The theme is a single global localStorage
  // key applied to each window's own document; without this, changing the theme
  // (or editing the active custom theme) in one window leaves OTHER windows on
  // the old look until they remount. The DOM `storage` event fires in every
  // OTHER same-origin window when localStorage changes, so we re-apply the saved
  // theme there. (The window that made the change applied it directly and does
  // not get its own storage event — no double-apply.) initTheme re-runs the
  // accessibility-overlay hook too, so this window's active character keeps its
  // overlays (pitfall #33).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'lichborne.theme' || e.key === 'lichborne.myThemes') initTheme()
      // v0.19.0 Overview options. Every OTHER field of SharedProfile is read
      // FRESH from localStorage inside `buildSharedProfile` (`loadMyThemes()`,
      // `loadAIConfig()`, `getItem(...)`, …), and localStorage is shared across
      // windows — so a flush from any window is automatically current. The
      // overview block is the ONE that reads MODULE MEMORY
      // (`getOverviewPersisted()`, deliberately, so an unflushed working copy
      // cannot overwrite a live change). That makes it the one shared setting a
      // second window could silently revert: window B holds the options it had
      // at launch, and any shared save it happens to make writes them back over
      // window A's change in `_shared.yaml`. Re-seeding memory here keeps the
      // two in step, which fixes the stale-display half as well.
      if (e.key === OVERVIEW_KEY) loadOverviewState()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Close confirmation requested by main (2+ characters would be logged out).
  // The ack is sent from the SAME effect that receives the request rather than
  // from the modal, so main learns the renderer is alive even if the modal's
  // own render were to throw — the ack is about liveness, not about paint.
  useEffect(() => {
    const off = window.api.onQuitConfirmRequest?.(req => {
      setQuitConfirm(req)
      window.api.quitConfirmShown?.(req.id)
    })
    return () => off?.()
  }, [])

  // Stamp `data-window-hidden` on <html> while this window is minimized/hidden
  // so decorative animation can pause (global.css). Main owns the signal —
  // `document.hidden` is unreliable under `backgroundThrottling: false`, see
  // the emitter in main.ts createWindow and pitfall #96.
  //
  // Per-WINDOW, not per-character: it is the OS window that is off screen, and
  // each BrowserWindow has its own document, so each stamps its own root.
  // Nothing here touches game state — only whether animations advance.
  useEffect(() => {
    const off = window.api.onWindowVisibility?.(hidden => {
      document.documentElement.dataset.windowHidden = hidden ? 'true' : 'false'
    })
    return () => off?.()
  }, [])

  // v0.8.6: refocus the active GameWindow's command bar whenever the active
  // character changes — covers tab CLICKS in addition to the Ctrl+Tab /
  // Ctrl+# keyboard paths that already refocus explicitly above. Requested
  // by Rakkor (TheTargonian) — clicking a tab left focus wherever it was,
  // forcing testers to click the bar again before they could type.
  // requestAnimationFrame waits for the session-shell hidden-class flip
  // before the input becomes focusable.
  //
  // This was a VERBATIM copy of `refocusActiveCommandBar` minus its Overview
  // guard, so switching character — by clicking a card, a tab, or Ctrl+Tab /
  // Ctrl+1-9 — put the caret in the command bar the Overview is covering:
  // typing showed nothing and Enter still reached the game (pitfall #131, the
  // B375 failure through a path that fix missed). Call the guarded helper
  // rather than keeping a second copy of it (pitfall #127).
  useEffect(() => {
    if (!activeId) return
    refocusActiveCommandBar()
  }, [activeId, refocusActiveCommandBar])

  // First-run / cold-start path:
  //   1. Pull _shared.yaml into localStorage so loadAdvanced() returns whatever
  //      was last saved (Lich paths, port, account, etc.). LoginScreen used to
  //      own this import; now AppShell does it because the launcher never
  //      mounts LoginScreen.
  //   2. If Lich paths still don't validate, run the silent discovery against
  //      C:\Ruby4Lich5 and write any newly-discovered paths back. This means a
  //      fresh install where Lich is in its default location ends up with the
  //      wizard's Lich radio enabled by default — no manual setup required.
  // ── SimuCoin state (F71, v0.18.0 — DESIGN §42) ──────────────────────────────
  // Declared before the effects that use them. App-level, per ACCOUNT: App owns
  // this because it has the launcher's account list and the check lifecycle;
  // AppBar hosts the coin button and GameWindow only reads it for /simucoin.
  const [sharedReady, setSharedReady] = useState(false)
  const [scStatuses, setScStatuses] = useState<Record<string, SimuCoinStatus>>({})
  const [scBusy, setScBusy] = useState<Set<string>>(() => new Set())
  const [scAccounts, setScAccounts] = useState<string[]>([])
  const [scWithPassword, setScWithPassword] = useState<Set<string>>(() => new Set())
  // Latches once the launch-time store pass has run, so re-enumerations
  // (launcherRefreshKey) refresh the account LIST without re-checking.
  const scCheckedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    importSharedProfile().then(async () => {
      if (cancelled) return
      const adv = loadAdvanced()
      // probeDesktop deliberately NOT passed — the silent startup discovery must
      // never trigger the macOS Desktop privacy prompt (only the setup dialog's
      // explicit Auto Detect does, DESIGN §41.3).
      const discovered = await window.api.discoverLichPaths(adv.rubyPath, adv.lichPath).catch(() => null)
      // sharedReady gates the SimuCoin startup pass. It MUST be set even when
      // discovery yields nothing — the inner .catch() above turns a rejection
      // into null, so the outer .catch() below can never fire for that case,
      // and an early return here would leave the flag false forever (coin
      // button empty, /simucoin dead, no error anywhere).
      if (cancelled) return
      if (!discovered) { setSharedReady(true); return }
      const changes: Partial<typeof adv> = {}
      if (discovered.rubyPath) changes.rubyPath = discovered.rubyPath
      if (discovered.lichPath) changes.lichPath = discovered.lichPath
      if (Object.keys(changes).length > 0) {
        const next = { ...adv, ...changes }
        saveAdvanced(next)
        exportSharedProfile().catch(console.error)
      }
      if (!cancelled) setSharedReady(true)
    }).catch(err => { console.error(err); if (!cancelled) setSharedReady(true) })
    return () => { cancelled = true }
  }, [])

  // One run for one account. `quiet` suppresses the failure toasts on the
  // automatic startup pass — a store outage must not greet the user with an
  // error banner they didn't ask for; the coin popover still shows the reason.
  const runSimucoin = useCallback(async (account: string, claim: boolean, quiet = false) => {
    // CONSENT IS RE-CHECKED HERE, at the single choke point every caller goes
    // through (coin popover, /simucoin, startup pass). The popover reads its
    // config once at mount, so in a second window it can be STALE — without
    // this, "Turn off" in window A leaves window B's button live and one click
    // would sign in to the store for an account whose consent was revoked.
    // Read fresh from localStorage, never from React state.
    if (!accountConfig(loadSimuCoinConfig(), account).consented) return null
    setScBusy(prev => new Set(prev).add(account))
    try {
      const st = await window.api.simucoinCheck(account, claim)
      setScStatuses(prev => ({ ...prev, [account]: st }))
      // Remember the balance so it survives a restart — main's status cache is
      // in-memory only, so without this Settings reads "Not checked yet" every
      // launch until the startup pass finishes. This is the ONE place every
      // check route converges (startup pass, the coin's Check now, /simucoin),
      // so recording it here needs no bookkeeping at the call sites.
      // `rememberBalance` no-ops on a failed check, so a store outage keeps the
      // previous figure and its real age rather than blanking it.
      const withBalance = rememberBalance(loadSimuCoinConfig(), account, st)
      saveSimuCoinConfig(withBalance)
      scheduleSharedProfileSave()
      // A `storage` event never fires in the window that wrote it, so the
      // surfaces in THIS window need the same nudge Settings uses.
      window.dispatchEvent(new CustomEvent(SIMUCOIN_CHANGED_EVENT))
      if (!quiet || st.state === 'claimed' || st.state === 'claimable') simucoinToast(st)
      // RETURN the status so a caller can report it the moment it lands.
      // `/simucoin check` needs this: reading it back from `scStatuses` would
      // race React's state flush (the setState above has not committed when
      // this promise resolves), so the caller would format a stale row.
      return st
    } catch (err) {
      console.error('[simucoin]', err)
      return null
    } finally {
      setScBusy(prev => { const n = new Set(prev); n.delete(account); return n })
    }
  }, [])

  // Startup pass: enumerate accounts, learn which have a saved password, then
  // check the accounts the user explicitly opted in (claiming when that
  // account's auto-claim is on). Runs after the shared profile is imported so
  // the consent config is the YAML truth, not a stale localStorage copy.
  // Deliberately once per launch — no background polling (DESIGN §42.2).
  //
  // ONLY THE PRIMARY WINDOW CHECKS (the F62 pattern above). Every window runs
  // this shell, so without the gate a window opened LATER — decouple a
  // character an hour in — would fire a whole fresh store pass, re-signing in
  // for every consented account and re-claiming for auto-claim ones. Secondary
  // windows instead SEED from main's cached statuses so their coin button
  // still renders the truth without touching the network.
  //
  // The account ENUMERATION runs in every window (the popover needs it) and
  // re-runs on launcherRefreshKey, so an account added by the wizard mid-session
  // becomes visible to the feature without a restart.
  useEffect(() => {
    if (!sharedReady) return
    let cancelled = false
    void (async () => {
      const cards = await loadCharacterCards().catch(() => [] as LauncherCharacter[])
      if (cancelled) return
      const accounts = Array.from(new Set(cards.map(c => c.account).filter(Boolean))).sort()
      setScAccounts(accounts)

      const flags = await Promise.all(accounts.map(a =>
        window.api.simucoinHasPassword(a).catch(() => false)))
      if (cancelled) return
      const withPw = new Set(accounts.filter((_, i) => flags[i]))
      setScWithPassword(withPw)

      // Seed from whatever main already learned this session (cheap, no
      // network) — covers secondary windows AND a re-enumeration after the
      // wizard adds an account.
      const cached = await window.api.simucoinCached().catch(() => [])
      if (cancelled) return
      if (cached.length > 0) {
        setScStatuses(prev => {
          const next = { ...prev }
          for (const st of cached) next[st.account] = st
          return next
        })
      }
      // The network pass is ONCE PER LAUNCH, not once per enumeration — the
      // effect also re-runs on launcherRefreshKey (a wizard-added account),
      // and that must refresh the LIST without triggering a second round of
      // store sign-ins/claims.
      if (!isPrimary || scCheckedRef.current) return
      scCheckedRef.current = true

      const cfg = loadSimuCoinConfig()
      for (const account of accounts) {
        if (cancelled) return
        const ac = accountConfig(cfg, account)
        if (!ac.consented || !withPw.has(account)) continue
        // Sequential: two accounts signing in to the store at once is both
        // rude and racy. Main serializes globally too (one cookie jar), so
        // this is belt-and-braces, not the only guard.
        await runSimucoin(account, ac.autoClaim, true)
      }
    })()
    return () => { cancelled = true }
  }, [sharedReady, runSimucoin, isPrimary, launcherRefreshKey])

  const simucoin = useMemo(() => ({
    accounts: scAccounts,
    withPassword: scWithPassword,
    statuses: scStatuses,
    busy: scBusy,
    // `quiet` suppresses the per-account toast so a caller acting on SEVERAL
    // accounts at once (the coin's "Collect available coins") can report the
    // whole batch in ONE toast instead of stacking N of them.
    run: (account: string, claim: boolean, quiet?: boolean) => runSimucoin(account, claim, quiet),
  }), [scAccounts, scWithPassword, scStatuses, scBusy, runSimucoin])

  useEffect(() => {
    const unsubAvailable = window.api.onUpdateAvailable((version) => {
      setUpdateVersion(version)
      setUpdateState('available')
      setUpdateDismissed(false)
    })
    const unsubDownloaded = window.api.onUpdateDownloaded(() => {
      setUpdateState('ready')
      setUpdateDismissed(false)
    })
    const unsubLog = window.api.onUpdaterLog((msg) => {
      console.log('[auto-updater]', msg)
      setChecking(false)
      // B356/B364: main marks a message meant for the USER with this prefix
      // (macOS has no auto-update; an extracted AppImage can't update). Before
      // this they only reached the console, so "Checking…" flashed and nothing
      // else happened.
      if (msg.startsWith(UPDATER_NOTICE_PREFIX)) {
        showToast({ title: 'Updates', message: msg.slice(UPDATER_NOTICE_PREFIX.length), durationMs: 10000 })
        return
      }
      if (msg === 'No update available') setUpToDate(true)
    })
    return () => { unsubAvailable(); unsubDownloaded(); unsubLog() }
  }, [])

  function handleDownload() {
    setUpdateState('downloading')
    window.api.downloadUpdate()
  }

  function handleCheckForUpdates() {
    setChecking(true)
    setUpToDate(false)
    setUpdateDismissed(false)
    window.api.checkForUpdates()
  }

  // `quiet`: a team login's background connect. The tab is added without
  // taking focus (you may already be playing another character), and no
  // dialog is closed — the player may have opened one since the run began.
  function handleConnected(info: SessionInfo, opts?: { quiet?: boolean }): CharacterId {
    if (opts?.quiet) return addSession(info, { activate: false })
    const id = addSession(info)
    setShowAdd(false)
    setShowWizard(false)
    return id
  }

  // Card click → grace window → actual connect. The grace window is cancellable
  // via the [Cancel] button rendered inside the overlay. We don't fire any IPC
  // until the timer expires.
  function handleCardConnect(c: LauncherCharacter) {
    if (pendingConnect) return  // already connecting; ignore double-clicks
    if (pendingConflict) return // resolution modal already open

    // ATTACH TILES ATTACH. A tile with a saved target treats Connect
    // as "put me in that running session" — not as "start a login", which for
    // a stub tile can only dead-end in the Add Account wizard asking for a
    // password that doesn't exist. This branch also BYPASSES the same-account
    // conflict modal below: that guard protects a NEW login against DR's
    // one-per-account law, but an attach joins a session that is already on
    // — and stub tiles all share the 'attach' placeholder account, so the
    // guard would cross-flag unrelated characters. The per-CHARACTER cases
    // are handled in prepareTileAttach (focus a live tab, revive a dead one),
    // and the target-is-down case falls back inside attachFromCard.
    if (c.attach) {
      if (prepareTileAttach(c) === 'focused') return
      setConnectError('')
      pendingCancelledRef.current = false
      setPendingConnect(c)
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null
        if (pendingCancelledRef.current) return
        attachFromCard(c).catch(err => {
          setConnectError(String(err))
          setPendingConnect(null)
        })
      }, 1500)
      return
    }

    // Same-account guard. DR allows only one active character per account at
    // a time — pre-v0.8.0 this was a flat refusal (`setConnectError(...)`).
    // Now we surface a confirmation modal: the user can either disconnect the
    // conflicting session and continue, or cancel and manage it themselves.
    const conflict = sessions.find(s => s.account.toLowerCase() === c.account.toLowerCase() && s.status.connected)
    if (conflict) {
      setPendingConflict({
        incoming: c,
        conflict: {
          character: conflict.character,
          sessionId: conflict.sessionId,
          characterId: conflict.characterId,
          game: conflict.game,
        },
      })
      return
    }

    setConnectError('')
    pendingCancelledRef.current = false
    setPendingConnect(c)
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null
      if (pendingCancelledRef.current) return
      runConnect(c).catch(err => {
        setConnectError(String(err))
        setPendingConnect(null)
      })
    }, 1500)
  }

  // Resolve a pending account conflict by disconnecting the conflicting
  // session and starting the new connect. The disconnect is awaited (NOT
  // fire-and-forget) so SGE sees the slot as free by the time we try the new
  // login — otherwise it returns "Invalid login key" because the old session
  // is still considered connected.
  //
  // Single 2-second retry on the new connect: DR's server-side account-slot
  // release sometimes lags our local disconnect-ack by a beat. One retry
  // catches the common race without complicating the UX. Both attempts fail
  // → the user sees the real error and can retry manually from the launcher.
  async function continueWithDisconnect() {
    if (!pendingConflict) return
    const { incoming, conflict } = pendingConflict
    setConflictBusy(true)
    try {
      await window.api.disconnectAwait(conflict.sessionId)
      // The disconnected tab stays in the bar (in disconnected state) — we
      // intentionally don't destroy/remove it. User decides whether to close
      // it via X or re-login to it later. Matches the in-tab Disconnect
      // button's behaviour.
      setPendingConflict(null)
      setConflictBusy(false)
      try {
        await runConnect(incoming)
      } catch (err1) {
        // Retry once after 2s — see comment above.
        await new Promise(r => setTimeout(r, 2000))
        try {
          await runConnect(incoming)
        } catch {
          setConnectError(String(err1))
          setPendingConnect(null)
        }
      }
    } catch (err) {
      setConnectError(`Failed to disconnect ${conflict.character}: ${String(err)}`)
      setPendingConflict(null)
      setConflictBusy(false)
    }
  }

  function cancelConflict() {
    if (conflictBusy) return
    setPendingConflict(null)
  }

  function cancelPendingConnect() {
    pendingCancelledRef.current = true
    if (pendingTimerRef.current) {
      // Still in the 1.5s grace window — nothing has been attempted, so this
      // is a clean, instant cancel with no side effects.
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    } else {
      // The login is ALREADY in flight and there is no abort for it, so the
      // attempt runs to completion and `runConnect` tears the session down on
      // arrival. Say so: the account slot stays busy until then, and a user who
      // immediately tries another character on the same account would otherwise
      // hit a bare "invalid login key" with no idea why.
      showToast({
        title: 'Cancelling',
        message: 'The connection attempt has to finish before that account is free again — nothing will be added.',
      })
    }
    setPendingConnect(null)
  }

  // Characters being connected IN FRONT of the player (a tile's Connect, the
  // tab menu's Reconnect, the attach dialog). Main announces "is in the game"
  // from inside its login handler — before this window has switched to the new
  // tab — so without this every ordinary connect toasted about itself (and a
  // cancelled one about a character being logged straight back out). Released
  // a little after the connect settles: main's notice can land a moment before
  // the login call returns. Quiet team connects never go in here.
  const foregroundConnectsRef = useRef(new Set<string>())
  function markForeground(name: string): () => void {
    const key = name.toLowerCase()
    foregroundConnectsRef.current.add(key)
    return () => { setTimeout(() => foregroundConnectsRef.current.delete(key), 2000) }
  }

  async function runConnect(c: LauncherCharacter) {
    const release = markForeground(c.name)
    try { await runConnectBody(c) } finally { release() }
  }

  async function runConnectBody(c: LauncherCharacter) {
    // EVERY entry starts uncancelled. `handleCardConnect` resets this before
    // its grace timer, but three other paths reach here — the tab menu's
    // Reconnect, and both attempts of the account-conflict resolve — and none
    // of them did. So after any cancelled connect, the stale `true` made the
    // next one return instantly and silently: a Reconnect that spun and did
    // nothing, with no error to explain it. Resetting at the top is safe
    // because cancellation during THIS attempt is set after this line runs.
    pendingCancelledRef.current = false
    const adv = loadAdvanced()
    const password = await window.api.loadPassword(c.account)
    if (password === null) {
      // No saved password → we cannot connect, so send the user to the one
      // screen that can capture it. WITH A REASON: bare, this looks like the
      // app forgetting the character and demanding it be added again — our
      // first macOS tester read exactly that ("keeps getting me to try and add
      // an acct") and reported it as a Lich failure, when Lich was never
      // reached. The wizard is prefilled with the account below.
      localStorage.setItem('lichborne.account', c.account)
      setPendingConnect(null)
      setShowAdd(false)
      setWizardReason(`Lichborne needs the password for account "${c.account}" to connect ${c.name}. ` + 'It is not saved on this machine — enter it below to continue.')
      setShowWizard(true)
      return
    }

    // Derive Lich port + CLI args from the character's saved game (v0.8.0).
    // Before this, runConnect used `adv.lichPort` — the GLOBAL last-saved port
    // from _shared.yaml — which meant a character configured for DRT/DRX/DRF
    // silently routed to whatever shard the global port pointed at (usually
    // DR). The character's saved `game` field is now the authority; the
    // global `adv.lichPort` is only used as a fallback default for the wizard.
    const gameOpt = gameOptionByCode(c.game)
    const creds: LoginCredentials = {
      account:       c.account,
      password,
      character:     c.name,
      game:          c.game,
      lichArguments: gameOpt.lichArguments,
      useLich:       c.useLich,
      lichPath:      adv.lichPath,
      rubyPath:      adv.rubyPath,
      lichPort:      gameOpt.port,
      lichMode:      adv.lichMode,
    }

    // CANCEL, honoured for real (Sekmeht: "there's no way to stop it until you
    // login, then have to logout").
    //
    // The Cancel button already existed but only worked during the 1.5s grace
    // window before `runConnect` started — after that it hid the overlay while
    // the login carried on in main, so the character connected anyway and had
    // to be logged out by hand. A button that stops working after a second and
    // a half is worse than no button.
    //
    // `window.api.login` has no abort, so cancellation is honoured at the two
    // points either side of it: skip the work entirely if the user bailed
    // during the password read, and TEAR DOWN the session if the login had
    // already landed. Doing it before `handleConnected` is what matters — the
    // tab is never added, so a cancelled connect never flashes a session into
    // existence and out again.
    if (pendingCancelledRef.current) return

    const result = await window.api.login(creds)
    if (pendingCancelledRef.current) {
      // Landed anyway (it was in flight when Cancel was pressed). Close it out
      // so we don't strand a live connection with no tab attached to it.
      if (result.ok && result.sessionId) {
        try { await window.api.disconnectAwait(result.sessionId) } catch (err) { console.error(err) }
      }
      return
    }
    if (!result.ok) {
      const raw = result.error ?? 'Connection failed'
      const friendly = /invalid login key/i.test(raw)
        ? `${raw} — another character on account ${c.account} may already be connected.`
        : raw
      setConnectError(friendly)
      setPendingConnect(null)
      return
    }

    // Game comes from the character's own profile — that's where the wizard
    // recorded the user's pick at creation time. Deriving it from adv.lichPort
    // was wrong because lichPort is global (always the Lich front-end port,
    // not a per-shard port).
    try {
      const loaded = await importCharacterProfile(c.name)
      if (!loaded) clearCharacterLocalStorage(c.name)
    } catch (err) { console.error(err) }
    try {
      await exportCharacterProfile(c.account, c.name, c.game, c.useLich)
    } catch (err) { console.error(err) }

    // Last check: the profile import/export above is awaited, so Cancel can
    // land in that window too.
    if (pendingCancelledRef.current) {
      try { await window.api.disconnectAwait(result.sessionId) } catch (err) { console.error(err) }
      return
    }

    setPendingConnect(null)
    handleConnected({
      sessionId: result.sessionId,
      account:   c.account,
      character: c.name,
      game:      c.game,
      useLich:   c.useLich,
    })
  }

  // Attach to an already-running detachable Lich session.
  // Returns null on success, or the error sentence for the caller to surface
  // (the modal shows it inline and stays open for a fix-and-retry — a closed
  // modal plus the launcher error banner would throw away the typed
  // host/port; the tile / Reconnect paths route it to the error banner).
  //
  // No password, no SGE, no pendingConnect grace window: there's no network
  // side effect worth backing out of — a failed attach touches nothing.
  //
  // Identity: `fixed` pins account+game when the caller already KNOWS them —
  // the tile ⋯ menu and the tab's Reconnect, where re-resolving could drift
  // (a missing profile would resolve to the 'attach' placeholder, mint a
  // different characterId, and open a SECOND tab instead of reviving the
  // one being reconnected). The modal path leaves it unset and resolves from
  // the character's profile YAML when one exists, else placeholders
  // ('attach' / 'DR'). Resolving the REAL account when known is what keeps
  // the roster and the one-per-account conflict planner truthful — an
  // attached character genuinely holds its account's slot in game — and
  // keeps the ambient profile export (exportCharacterProfile's
  // read-merge-write, where `built` wins on account) writing the same
  // account back instead of clobbering it.
  async function runAttach(...args: Parameters<typeof runAttachBody>): Promise<string | null> {
    // A quiet (team) attach isn't in front of the player — it SHOULD toast.
    const release = args[6] ? () => {} : markForeground(args[0])
    try { return await runAttachBody(...args) } finally { release() }
  }

  async function runAttachBody(
    character: string,
    host: string,
    port: number,
    fixed?: { account: string; game: string },
    // Card-path cancellation (the pendingConnect overlay's Cancel). Checked
    // after the attach lands: the session is destroyed instead of becoming a
    // tab. Destroy = detach for attach mode, so the running Lich session is
    // untouched — unlike a cancelled LOGIN, nothing needs to run to
    // completion first. Only the Connect-button path passes this; the modal
    // and menu paths have no Cancel racing them.
    cancelled?: { current: boolean },
    // Out-param filled with the new sessionId on success. An out-param rather
    // than a richer return type because the modal's onAttach contract is
    // "error sentence or null", and only the bulk path needs the id (to
    // honour "open each in its own window").
    out?: { sessionId?: SessionId; characterId?: CharacterId },
    // A team login's background attach: no focus change, no dialog closed.
    quiet?: boolean,
  ): Promise<string | null> {
    let account = fixed?.account ?? 'attach'
    let game = fixed?.game ?? 'DR'
    if (!fixed) {
      try {
        const existing = await window.api.readCharacterProfile(character)
          .catch(() => null) as { account?: string; game?: string } | null
        if (existing?.account) account = existing.account
        if (existing?.game) game = existing.game
      } catch { /* no profile — placeholders stand */ }
    }

    const result = await window.api.loginAttach({ account, character, game, host, port })
    if (!result.ok) return result.error ?? 'Attach failed'

    if (cancelled?.current) {
      window.api.destroySession(result.sessionId)
      return null
    }

    // Same per-character profile load as runConnect, so an attached tab gets
    // the character's saved layout, highlights, macros and theme.
    try {
      const loaded = await importCharacterProfile(character)
      if (!loaded) clearCharacterLocalStorage(character)
    } catch (err) { console.error(err) }

    // REMEMBER THE TARGET — the reason this feature is usable twice. Saved on
    // success only (a failed target isn't worth prefilling), to two homes:
    // the character's profile YAML (drives the tile ⋯ menu's one-click
    // re-attach and the modal's name → host:port autofill; creates a stub
    // profile for an attach-only character, which is exactly the tile the
    // next session starts from) and the global last-attach key (prefills the
    // modal when it opens blank). The refreshKey bump makes a just-created
    // stub tile appear without a restart.
    try { localStorage.setItem(ATTACH_LAST_KEY, JSON.stringify({ character, host, port })) } catch { /* ignore */ }
    try {
      await saveCharacterAttach(character, account, game, { host, port })
      setLauncherRefreshKey(k => k + 1)
    } catch (err) {
      // SAY SO. A console.error alone made a failed save look identical to
      // the collapsed-section bug this code also fixes: no tile, no reason.
      // The attach itself has already succeeded — the character is on — so
      // this is a toast, not an error banner: what was lost is the shortcut
      // back, not the session.
      console.error('Failed to save the attach target', err)
      showToast({
        title: 'Attached, but the target was not saved',
        message: `${character} is connected, but Lichborne could not write its profile, so no tile will remember ${host}:${port}.`,
      })
    }

    if (!quiet) setShowAttach(false)
    const characterId = handleConnected({
      sessionId: result.sessionId,
      account,
      character,
      game,
      useLich: true,
      attach: { host, port },
    }, { quiet })
    if (out) { out.sessionId = result.sessionId; out.characterId = characterId }
    return null
  }

  // The modal's attach. Wraps runAttach with the same per-character guard the
  // tile paths get from prepareTileAttach — the modal takes a TYPED name, so
  // it is the one place a player can aim a second attach at a character that
  // is already on. Without this, addSession replaces the record on the
  // matching characterId: the first tab vanishes, its session is orphaned in
  // main (still attached, no longer reachable), and it looks like attaching
  // the second character "replaced" the first instead of adding to it.
  async function runAttachFromModal(character: string, host: string, port: number): Promise<string | null> {
    const name = character.trim()
    const existing = sessions.find(s => s.character.toLowerCase() === name.toLowerCase())
    if (existing?.status.connected) {
      // Already on: show it rather than attaching a duplicate. Lich would
      // accept a second front-end happily — the problem is on our side.
      setActive(existing.characterId)
      setShowAttach(false)
      showToast({
        title: `${existing.character} is already attached`,
        message: 'Switched to its tab. To attach a different character, use its own name and its own Lich port.',
      })
      return null
    }
    if (existing) window.api.destroySession(existing.sessionId)
    return runAttach(name, host, port)
  }

  // Open the Attach modal with its memory loaded: the per-character targets
  // (for autofill as the name is typed) and the last successful attach (for
  // the blank-open prefill). Both are best-effort — the modal works empty.
  async function openAttachModal() {
    let known: Record<string, { host: string; port: number }> = {}
    try {
      const cards = await loadCharacterCards()
      for (const c of cards) if (c.attach) known[c.name.toLowerCase()] = c.attach
    } catch { /* no tiles yet — nothing to autofill */ }
    let initial: { character: string; host: string; port: number } | null = null
    try { initial = JSON.parse(localStorage.getItem(ATTACH_LAST_KEY) ?? 'null') } catch { /* ignore */ }
    setAttachKnown(known)
    setAttachInitial(initial)
    setShowAttach(true)
  }

  // Shared pre-flight for every attach that starts from a tile. A character
  // with a CONNECTED tab just gets focused — a second attach would work at
  // the protocol level (Lich takes multiple front-ends) but the new record
  // replaces the old one on characterId, orphaning a live session in main.
  // A disconnected tab is torn down so the revived session replaces it
  // cleanly instead of leaking the dead socket's session entry.
  // Idempotent — handleCardConnect calls it early (to skip the connecting
  // overlay for a no-op) and tryAttachPick calls it again for the callers
  // that don't pre-check; main's destroySession no-ops on an unknown id.
  function prepareTileAttach(c: LauncherCharacter, quiet?: boolean): 'focused' | 'ready' {
    // sessionsRef, not `sessions`: the team loop calls this minutes after the
    // render it started in, and a stale list could destroy the wrong session.
    const existing = sessionsRef.current.find(s => s.character.toLowerCase() === c.name.toLowerCase())
    if (existing?.status.connected) {
      if (!quiet) setActive(existing.characterId)
      return 'focused'
    }
    if (existing) window.api.destroySession(existing.sessionId)
    return 'ready'
  }

  // Attach one saved-target character, and decide what a failure MEANS.
  // Shared by every entry point that starts from a tile — the Connect button
  // and the bulk paths (Reconnect Last / Team Login) — so they can't drift on
  // the one judgement call in the feature: when nothing is listening at the
  // target, was the click "join that session" or "get me into the game"?
  // Answer: the latter, whenever a real login is possible. A stub tile has no
  // account to log in with, so its failure is terminal and says why.
  //
  //   { ok: true }       attached; the tab exists. `sessionId` is set for a
  //                      NEW session and absent when an existing tab was
  //                      focused — the bulk path uses that to decide whether
  //                      there is anything to move to its own window.
  //   { fallback: true } nothing listening, but this tile CAN log in normally
  //   { error }          surface it
  async function tryAttachPick(
    c: LauncherCharacter,
    cancelled?: { current: boolean },
    quiet?: boolean,
  ): Promise<{ ok: true; sessionId?: SessionId; characterId?: CharacterId } | { fallback: true } | { error: string }> {
    const target = c.attach
    if (!target) return { fallback: true }
    // Already open: hand back THAT tab's id. An attach-only tile's account is a
    // placeholder, so an id computed from the tile needn't match the real tab.
    if (prepareTileAttach(c, quiet) === 'focused') {
      return { ok: true, characterId: sessionsRef.current.find(s => s.character.toLowerCase() === c.name.toLowerCase())?.characterId }
    }
    const out: { sessionId?: SessionId; characterId?: CharacterId } = {}
    const err = await runAttach(
      c.name, target.host, target.port,
      { account: c.account, game: c.game },
      cancelled,
      out,
      quiet,
    )
    if (err === null) return { ok: true, sessionId: out.sessionId, characterId: out.characterId }
    const nothingListening = /Nothing accepted the connection/i.test(err)
    const canLogin = !!c.account && c.account.toLowerCase() !== 'attach'
    if (nothingListening && canLogin) return { fallback: true }
    return {
      error: nothingListening && !canLogin
        ? `${err} This tile has no saved account, so there is no normal login to fall back to.`
        : err,
    }
  }

  // The Connect-button attach (see handleCardConnect's attach branch).
  async function attachFromCard(c: LauncherCharacter) {
    const outcome = await tryAttachPick(c, pendingCancelledRef)
    if ('ok' in outcome) { setPendingConnect(null); return }
    if ('fallback' in outcome) { await runConnect(c); return }
    setConnectError(outcome.error)
    setPendingConnect(null)
  }

  // One-click re-attach from a tile's ⋯ menu (target saved on the profile).
  // Errors surface on the launcher's existing error banner — the tile flow
  // has no modal to carry an inline message. No fallback-to-login here: the
  // menu item names the target explicitly, so failing loudly is the honest
  // response (the Connect button is the entry point that falls back).
  function attachFromTile(c: LauncherCharacter) {
    if (!c.attach) return
    if (prepareTileAttach(c) === 'focused') return
    runAttach(c.name, c.attach.host, c.attach.port, { account: c.account, game: c.game })
      .then(err => { if (err) setConnectError(err) })
      .catch(err => setConnectError(String(err)))
  }

  // ── Team login (F21 v0.8.0; panel + play-while-loading v0.20.0) ────────────
  //
  // Walks the confirmed picks ONE AT A TIME (Lich serves one front-end per
  // launch, and DR allows one character per account — see serializeLichLaunch).
  // Every character connects QUIETLY: its tab is added without taking focus, so
  // the screen behind the panel stays still and a character the player has
  // already started playing keeps the keyboard. The Team Login panel draws the
  // run (TeamLoginPanel.tsx); playing a READY character folds it into the
  // app-bar pill while the rest keep going. Per-character errors never abort
  // the sequence.
  function setTeamRun(next: TeamRun | null) {
    teamRunRef.current = next
    setTeamRunState(next)
  }
  function patchTeam(patch: Partial<TeamRun>) {
    const r = teamRunRef.current
    if (r) setTeamRun({ ...r, ...patch })
  }
  function patchMember(i: number, patch: Partial<TeamMember>) {
    const r = teamRunRef.current
    if (r) setTeamRun({ ...r, members: r.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  }
  function clearTeamPillTimer() {
    if (teamPillTimerRef.current) { clearTimeout(teamPillTimerRef.current); teamPillTimerRef.current = null }
  }
  function closeTeamRun() {
    clearTeamPillTimer()
    setTeamRun(null)
  }
  // "Open each in its own window": the first character to connect stays here,
  // and each later one moves out. Judged by who is READY in this window, so a
  // failed first pick doesn't leave this window without the team's first
  // character (and a Retry after the run follows the same rule).
  function hasReadyHere(except: number): boolean {
    return (teamRunRef.current?.members ?? []).some((m, j) => j !== except && m.status === 'ready' && !m.inOwnWindow)
  }

  // Connect ONE team member, quietly. Shared by the run and by Retry.
  async function connectTeamMember(
    c: LauncherCharacter, moveToOwnWindow: boolean,
  ): Promise<{ characterId: CharacterId; inOwnWindow: boolean } | { error: string }> {
    try {
      // ATTACH FIRST for a saved-target character (Reconnect Last / Team
      // Login / a saved set). Without this the batch ran the login flow for
      // an attach tile and died on "No saved password" — an attach-only
      // stub has no password to find, and even a real account would be
      // starting a SECOND Lich against a headless session that is still
      // logged in. tryAttachPick is shared with the tile Connect button, so
      // the fallback judgement can't drift between them.
      if (c.attach) {
        const outcome = await tryAttachPick(c, undefined, true)
        if ('ok' in outcome) {
          // `sessionId` is absent when an already-open tab was found rather
          // than attached — nothing new to move, and moving a tab the player
          // already had open would be a surprise.
          // Main may refuse the move (it never empties a window); only its
          // answer says whether the character really left.
          const own = moveToOwnWindow && !!outcome.sessionId
            && await window.api.moveSessionToWindow(outcome.sessionId, 'new', { quiet: true })
          return { characterId: outcome.characterId ?? makeCharacterId(c.account, c.name, c.game), inOwnWindow: !!own }
        }
        if ('error' in outcome) return { error: outcome.error }
        // fallback → fall through to the normal login path below.
      }
      const adv = loadAdvanced()
      const password = await window.api.loadPassword(c.account)
      if (password === null) return { error: 'No saved password — add it with Add account' }
      const gameOpt = gameOptionByCode(c.game)
      const creds: LoginCredentials = {
        account: c.account, password, character: c.name,
        game: c.game, lichArguments: gameOpt.lichArguments,
        useLich: c.useLich, lichPath: adv.lichPath, rubyPath: adv.rubyPath,
        lichPort: gameOpt.port, lichMode: adv.lichMode,
      }
      const result = await window.api.login(creds)
      if (!result.ok) return { error: result.error ?? 'Connection failed' }
      try {
        const loaded = await importCharacterProfile(c.name)
        if (!loaded) clearCharacterLocalStorage(c.name)
      } catch (err) { console.error(err) }
      try {
        await exportCharacterProfile(c.account, c.name, c.game, c.useLich)
      } catch (err) { console.error(err) }
      const characterId = handleConnected({
        sessionId: result.sessionId,
        account: c.account,
        character: c.name,
        game: c.game,
        useLich: c.useLich,
      }, { quiet: true })
      // `quiet`: the new window opens WITHOUT taking focus (main's
      // showInactive), so a player typing into another character keeps it.
      // Main may refuse (it never empties a window) — use its answer.
      const own = moveToOwnWindow
        && await window.api.moveSessionToWindow(result.sessionId, 'new', { quiet: true })
      return { characterId, inOwnWindow: !!own }
    } catch (err) {
      return { error: String(err) }
    }
  }

  async function runBulkConnect(picks: LauncherCharacter[], separateWindows = false) {
    setBulkPickerSource(null)
    setBulkPickerSet(null)
    // Every team launch funnels through here — Team Login, a Teams row, Reconnect
    // Last, the Keep/Switch chooser — so this is where a launch started from the
    // + tab's compact launcher closes that modal, the way a single-character
    // connect does. Otherwise it is still sitting there when the run ends.
    setShowAdd(false)
    if (picks.length === 0) return
    // One run at a time: two loops would interleave logins on one account slot
    // and write one panel. A FINISHED run (a pill left up by a failure) is
    // simply replaced.
    if (teamRunRef.current && !teamRunRef.current.done) {
      showToast({ title: 'A team login is already running', message: 'Click the Team login pill in the app bar to see it, or Stop it there first.' })
      return
    }
    clearTeamPillTimer()
    // STOP, not cancel (Sekmeht: the individual connect got a Cancel and a team
    // login had none). Deliberately weaker than the single-character Cancel,
    // and the label says so. `window.api.login` cannot be aborted, so the
    // character mid-flight is going to land whatever we do — and tearing it
    // down would throw away a wait of up to 30s and leave its account slot
    // churning. So Stop means "attempt no MORE characters": the current one
    // finishes and is kept, the remainder are skipped and reported as such.
    bulkStopRef.current = false
    teamSeparateRef.current = separateWindows
    trackConnectSteps()
    setTeamRun({
      members: picks.map(p => ({ pick: p, status: 'waiting' })),
      done: false, stopping: false, expanded: true,
    })
    for (let i = 0; i < picks.length; i++) {
      if (bulkStopRef.current) {
        const r = teamRunRef.current
        if (r) setTeamRun({ ...r, members: r.members.map((m, j) => (j >= i ? { ...m, status: 'skipped' } : m)) })
        break
      }
      patchMember(i, { status: 'connecting', error: undefined, startedAt: Date.now() })
      const out = await connectTeamMember(picks[i], separateWindows && hasReadyHere(i))
      patchMember(i, 'error' in out
        ? { status: 'failed', error: out.error }
        : { status: 'ready', characterId: out.characterId, inOwnWindow: out.inOwnWindow })
    }
    finishTeamRun()
  }

  // The run (or a Retry) is over. A panel still on screen just shows the
  // outcome. If the player went off to play, it lands as a TOAST instead —
  // never by reopening the panel over what they're typing — and the pill
  // either retires (all good) or stays amber until they look (a failure).
  function finishTeamRun() {
    const r = teamRunRef.current
    if (!r) return
    const next: TeamRun = { ...r, done: true, stopping: false }
    setTeamRun(next)
    if (next.expanded) return
    const c = teamCounts(next)
    const skipped = c.skipped ? `, ${c.skipped} skipped` : ''
    if (c.failed > 0) {
      const names = next.members.filter(m => m.status === 'failed').map(m => m.pick.name).join(', ')
      showToast({
        kind: 'error',
        title: 'Team login finished',
        message: `${c.ready} connected${skipped}. ${names} didn't connect — click the Team login pill in the app bar for why, or to retry.`,
      })
      return
    }
    showToast({ kind: 'success', message: `Team login finished: ${c.ready} connected${skipped}.` })
    teamPillTimerRef.current = setTimeout(() => {
      teamPillTimerRef.current = null
      // Only if it's still the finished run nobody reopened.
      const cur = teamRunRef.current
      if (cur && cur.done && !cur.expanded) setTeamRun(null)
    }, 4000)
  }

  // Retry one failed character, after the run. It goes through the same quiet
  // connect, so it can't take focus either.
  async function retryTeamMember(i: number) {
    const r = teamRunRef.current
    if (!r || !r.done || r.members[i]?.status !== 'failed') return
    const pick = r.members[i].pick
    setTeamRun({ ...r, done: false, members: r.members.map((m, j) => (j === i ? { ...m, status: 'connecting', error: undefined, startedAt: Date.now() } : m)) })
    const out = await connectTeamMember(pick, teamSeparateRef.current && hasReadyHere(i))
    patchMember(i, 'error' in out
      ? { status: 'failed', error: out.error }
      : { status: 'ready', characterId: out.characterId, inOwnWindow: out.inOwnWindow })
    finishTeamRun()
  }

  // Play a READY character: switch to it, and get the panel out of the way —
  // closed when there's nothing left to report, folded into the pill while
  // the run goes on or a failure still wants attention.
  function playTeamMember(i: number) {
    const r = teamRunRef.current
    const m = r?.members[i]
    if (!r || !m?.characterId || m.status !== 'ready' || m.inOwnWindow) return
    // The player may have closed that tab since it connected.
    if (!sessionsRef.current.some(s => s.characterId === m.characterId)) return
    setActive(m.characterId)
    if (viewRef.current === 'overview') setViewMode('session')
    if (r.done && teamCounts(r).failed === 0) closeTeamRun()
    else patchTeam({ expanded: false, played: m.characterId })
  }

  function openTeamOverview() {
    setViewMode('overview')
    const r = teamRunRef.current
    if (r && teamCounts(r).failed === 0) closeTeamRun()
    else patchTeam({ expanded: false })
  }

  // Build per-account groups for the BulkConnectPicker. Filters out hidden
  // tiles (not eligible for bulk), marks an account as "already connected"
  // if any of its characters has an active session.
  function buildBulkGroups(characters: LauncherCharacter[]) {
    const byAccount = new Map<string, LauncherCharacter[]>()
    for (const c of characters) {
      if (c.hidden) continue
      const list = byAccount.get(c.account) ?? []
      list.push(c)
      byAccount.set(c.account, list)
    }
    const accountsSorted = [...byAccount.keys()].sort((a, b) => a.localeCompare(b))
    return accountsSorted.map(account => {
      const candidates = byAccount.get(account)!
      const activeOnAccount = sessions.find(
        s => s.account.toLowerCase() === account.toLowerCase() && s.status.connected
      )
      return {
        account,
        candidates: candidates.sort((a, b) => a.name.localeCompare(b.name)),
        alreadyConnected: activeOnAccount ? activeOnAccount.character : null,
      }
    })
  }

  function handleCloseTab(id: CharacterId) {
    const target = sessions.find(s => s.characterId === id)
    if (target) {
      // Only fire the graceful-disconnect IPC if the session is actually still
      // connected. For a tab that's already disconnected (death, server drop,
      // earlier user disconnect), the IPC would queue a phantom QUIT against a
      // dead socket and hold a 5s gracefulDisconnect timer for no reason.
      if (target.status.connected) {
        window.api.disconnect(target.sessionId)
      }
      window.api.destroySession(target.sessionId)
    }
    removeSession(id)
  }

  // Tab right-click "Reconnect" (shown only on a disconnected tab): one-click
  // re-login of that specific character, no picker. Tears down the dead session
  // in main first (so it isn't orphaned) — same as the Login button's destroy —
  // then re-runs the connect flow. On success runConnect → handleConnected →
  // addSession REPLACES the existing record by characterId (its reconnect-in-tab
  // path: status resets to connected), so the tab un-greys and the still-mounted
  // GameWindow (keyed by characterId, not sessionId) picks up the new sessionId
  // via its sessionIdRef. On failure, surface the error in the picker so the
  // user can retry (the connecting/error UI lives in the Launcher).
  function handleReconnectTab(id: CharacterId) {
    const s = sessions.find(x => x.characterId === id)
    if (!s || s.status.connected) return
    window.api.destroySession(s.sessionId)
    // Attach sessions re-ATTACH to their saved listener — running the normal
    // login here would spawn a SECOND Lich against an account whose headless
    // session is still logged in, and DR would bounce one of them. Identity
    // is pinned from the session record (see runAttach's `fixed` note) so the
    // revived tab keeps the same characterId and replaces this one.
    if (s.attach) {
      const { host, port } = s.attach
      setReconnectingIds(prev => new Set(prev).add(id))
      runAttach(s.character, host, port, { account: s.account, game: s.game })
        .then(err => { if (err) { setConnectError(err); setShowAdd(true) } })
        .catch(err => { setConnectError(String(err)); setShowAdd(true) })
        .finally(() => setReconnectingIds(prev => { const n = new Set(prev); n.delete(id); return n }))
      return
    }
    const c: LauncherCharacter = {
      name: s.character, account: s.account, game: s.game, useLich: s.useLich,
      hidden: false, favorite: false,
    }
    setReconnectingIds(prev => new Set(prev).add(id))
    runConnect(c)
      .catch(err => {
        setConnectError(String(err))
        setShowAdd(true)
      })
      .finally(() => setReconnectingIds(prev => { const n = new Set(prev); n.delete(id); return n }))
  }

  const isEmpty       = sessions.length === 0
  // A secondary (decoupled) window must NOT show the full Launcher when empty —
  // it briefly has no sessions before its moved-in character mounts, and shows a
  // small placeholder instead. Unknown (isPrimary === null) is treated as primary
  // so the launcher window's cold start isn't delayed.
  const showFullLogin = isEmpty && isPrimary !== false
  const showModalLogin = !isEmpty && showAdd

  function openAddNew() {
    // "+ Add character" routes to the wizard regardless of whether the empty-
    // state launcher or the modal-state launcher invoked it. The wizard is the
    // single place where a brand-new character.yaml is created.
    setShowAdd(false)
    setShowWizard(true)
  }

  // Cleanup pending timer on unmount.
  useEffect(() => () => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Toast stack (DESIGN §37.6) — one host per BrowserWindow; any module
          surfaces a notice via showToast() (e.g. safeSetItem's quota warning). */}
      <ToastHost />
      {/* The confirm queue (confirmAction / confirmDelete / confirmDiscard) —
          one host per window, above every dialog it can be opened from. */}
      <ConfirmHost homeFocus={dialogHomeFocus} />
      {(updateState !== 'idle' && !updateDismissed) && (
        <div className="update-banner">
          {updateState === 'available' && (
            <>
              <span>Update v{updateVersion} available</span>
              <button className="update-btn" onClick={handleDownload}>Download</button>
            </>
          )}
          {updateState === 'downloading' && <span>Downloading update…</span>}
          {updateState === 'ready' && (
            <>
              <span>Update ready to install</span>
              <button className="update-btn update-btn--install" onClick={() => window.api.installUpdate()}>Restart &amp; Install</button>
            </>
          )}
          <button className="update-dismiss" onClick={() => setUpdateDismissed(true)} title="Dismiss">✕</button>
        </div>
      )}
      {showFullLogin && (updateState === 'idle' || updateDismissed) && (
        <div className="update-check-bar">
          {upToDate && <span className="update-up-to-date">You're up to date</span>}
          <button className="update-btn-check" onClick={handleCheckForUpdates} disabled={checking}>
            {checking ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
      )}

      {!isEmpty && (
        <AppBar
          onAdd={() => setShowAdd(true)}
          onClose={handleCloseTab}
          onReconnect={handleReconnectTab}
          reconnectingIds={reconnectingIds}
          simucoin={simucoin}
          teamPill={teamRun && !teamRun.expanded
            ? <TeamLoginPill run={teamRun} onOpen={() => { clearTeamPillTimer(); patchTeam({ expanded: true }) }} />
            : null}
          // A running team's characters that have no tab yet (waiting,
          // connecting, failed) show as placeholder tabs. A connected one has
          // its real tab; one in its own window lives elsewhere; a skipped one
          // was the player's choice and needs nothing.
          pendingTabs={teamRun?.members
            .filter(m => m.status === 'waiting' || m.status === 'connecting' || m.status === 'failed')
            // A real tab already here for this character (it just landed and
            // the tile hasn't caught up, or an old one is being re-logged):
            // don't show a placeholder beside it.
            .filter(m => !sessions.some(s => s.character.toLowerCase() === m.pick.name.toLowerCase()))
            .map(m => ({ key: `${m.pick.account}|${m.pick.name}`, name: m.pick.name, game: m.pick.game, status: m.status as 'waiting' | 'connecting' | 'failed' }))}
          onPendingClick={() => { clearTeamPillTimer(); patchTeam({ expanded: true }) }}
        />
      )}

      {/* v0.19.0 Views: `position: relative` makes this the containing block for
          the Overview overlay. Verified safe — every absolutely-positioned
          game-area element already resolves against a LOCAL positioned ancestor
          (.text-area / .cmd-input-wrap), so nothing was relying on the viewport. */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {showFullLogin ? (
          <Launcher
            refreshKey={launcherRefreshKey}
            onConnect={handleCardConnect}
            onBulkConnect={(characters) => setBulkPickerSource(characters)}
            /* F85 — a saved set skips the picker. Routed through
               handleReconnectLast because it already does everything a set
               launch needs: one-per-account dedup, skipping characters already
               on, and the per-account KEEP/SWITCH chooser when an account is
               busy with someone else. */
            onConnectSet={handleReconnectLast}
            /* Who a team row should grey out. Roster = every window's sessions,
               so a character connected in a DECOUPLED window counts too — the
               same source planReconnect skips against, which is what keeps the
               row's promise ("Connect 2") equal to what actually happens. */
            connectedNames={connectedCharacterNames}
            onEditSet={openTeamForEdit}
            onReconnectLast={handleReconnectLast}
            onAddNew={openAddNew}
            onAttach={() => { void openAttachModal() }}
            onAttachCharacter={attachFromTile}
            onRefreshAccount={(account) => {
              setWizardPrefillAccount(account)
              setShowWizard(true)
            }}
            onOpenLichSetup={() => setShowLichSetup(true)}
            connectingName={pendingConnect?.name ?? null}
            connectError={connectError}
            onDismissError={() => setConnectError('')}
          />
        ) : isEmpty ? (
          // Secondary window with no character (just opened and awaiting its
          // moved-in session, or its character was closed / re-homed away).
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontStyle: 'italic', background: 'var(--bg-app)',
          }}>
            No character in this window.
          </div>
        ) : (
          <>
          {/* The Overview is an OVERLAY, not a third branch: the session shells
              keep their existing visibility, so the active character's Virtuoso
              stays measured and coming back needs no scroll re-snap. The grid
              host is always mounted (hidden by CSS) so every card's portal
              target has a stable identity. */}
          <OverviewShell open={view === 'overview'} characterCount={sessions.length}
                         activeCharacterId={activeId} hostRef={overviewHostRef} />
          {sessions.map((s, si) => (
            <div
              // Reload nonce suffix: bumping it (via reloadSession) forces this
              // GameWindow to remount and re-read per-character state from
              // localStorage — used to commit a live profile import.
              key={`${s.characterId}:${reloadNonces[s.characterId] ?? 0}`}
              className={`session-shell${s.characterId === activeId ? '' : ' session-shell--hidden'}`}
            >
              <CharacterProvider character={s.character}>
                <GroupsProvider character={s.character}>
                  <GameWindow
                    session={{
                      sessionId: s.sessionId,
                      account: s.account,
                      character: s.character,
                      game: s.game,
                      useLich: s.useLich,
                    }}
                    isActive={s.characterId === activeId}
                    ownsTheme={s.characterId === themeOwnerId}
                    // v0.19.0 Views. `overviewHostRef` is a REF OBJECT, not an
                    // element — referentially stable forever, so it can never
                    // invalidate a memoized child (pitfall #82c). `overviewIndex`
                    // is the tab position, which breaks attention-sort ties so
                    // equally-calm cards never reshuffle between renders.
                    viewMode={view}
                    overviewHost={overviewHostRef}
                    overviewIndex={si}
                    onOpenInSession={() => { setActive(s.characterId); setViewMode('session') }}
                    /* Views: the Overview card offers the same per-character
                       actions the tab's right-click menu does (Sekmeht), built
                       from one shared definition so they cannot drift. */
                    onCloseCharacter={handleCloseTab}
                    onReconnectCharacter={handleReconnectTab}
                    onDisconnect={() => {
                      window.api.destroySession(s.sessionId)
                      removeSession(s.characterId)
                      // Clicking the toolbar's Login button (visible after a
                      // disconnect) was previously a dead end — it closed the
                      // tab and dropped the player on whichever other tab was
                      // active, with no path to actually re-login. Now we also
                      // surface the login UI: if this was the last session,
                      // AppShell re-renders the full-screen LoginScreen
                      // automatically (showAdd is moot when empty). If other
                      // tabs remain, opening the Add Character modal lets them
                      // re-add this character (or a different one) immediately.
                      setShowAdd(true)
                    }}
                    simucoin={simucoin}
                  />
                </GroupsProvider>
              </CharacterProvider>
            </div>
          ))}
          </>
        )}
      </div>

      {showAttach && (
        <AttachModal
          onCancel={() => setShowAttach(false)}
          onAttach={runAttachFromModal}
          initial={attachInitial}
          known={attachKnown}
        />
      )}

      {showModalLogin && (
        <AddCharacterModal onClose={() => setShowAdd(false)}>
          <Launcher
            refreshKey={launcherRefreshKey}
            onConnect={handleCardConnect}
            onBulkConnect={(characters) => setBulkPickerSource(characters)}
            /* F85 — a saved set skips the picker. Routed through
               handleReconnectLast because it already does everything a set
               launch needs: one-per-account dedup, skipping characters already
               on, and the per-account KEEP/SWITCH chooser when an account is
               busy with someone else. */
            onConnectSet={handleReconnectLast}
            /* Who a team row should grey out. Roster = every window's sessions,
               so a character connected in a DECOUPLED window counts too — the
               same source planReconnect skips against, which is what keeps the
               row's promise ("Connect 2") equal to what actually happens. */
            connectedNames={connectedCharacterNames}
            onEditSet={openTeamForEdit}
            onReconnectLast={handleReconnectLast}
            onAddNew={openAddNew}
            onAttach={() => { void openAttachModal() }}
            onAttachCharacter={attachFromTile}
            onRefreshAccount={(account) => {
              setShowAdd(false)
              setWizardPrefillAccount(account)
              setShowWizard(true)
            }}
            onOpenLichSetup={() => setShowLichSetup(true)}
            compact
            connectingName={pendingConnect?.name ?? null}
            connectError={connectError}
            onDismissError={() => setConnectError('')}
          />
        </AddCharacterModal>
      )}

      {showWizard && (
        <AddCharacterWizard
          onCompleted={(addedCount) => {
            setShowWizard(false)
            setWizardPrefillAccount(undefined)
            setWizardReason(undefined)
            if (addedCount > 0) setLauncherRefreshKey(k => k + 1)
          }}
          onCancel={() => {
            setShowWizard(false)
            setWizardPrefillAccount(undefined)
            setWizardReason(undefined)
          }}
          onOpenLichSetup={() => setShowLichSetup(true)}
          prefillAccount={wizardPrefillAccount}
          reason={wizardReason}
        />
      )}

      {/* B405: opened from the Add Account wizard's footer, the wizard's scrim
          already dims the screen, so Lich Setup's stays clear. */}
      {showLichSetup && <LichSetupDialog nested={showWizard} onClose={() => setShowLichSetup(false)} />}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {quitConfirm && (
        <QuitConfirmModal
          req={quitConfirm}
          onAnswer={ok => {
            // Clear FIRST: on "quit" the shutdown overlay takes over, and on
            // cancel the modal must go away even if the IPC send throws.
            setQuitConfirm(null)
            window.api.quitConfirmRespond?.(quitConfirm.id, ok)
          }}
        />
      )}

      {showProfileTransfer && (
        <ProfileTransferModal
          // Active targets come from the ROSTER (every window's connected
          // characters), not just this window — so a character open in another
          // window is correctly treated as active (localStorage working-copy
          // write + cross-window remount), not as an inactive YAML merge that
          // its owner window would overwrite on save.
          sessions={roster.filter(r => r.connected).map(r => ({ character: r.character, characterId: r.characterId }))}
          reloadSession={(cid) => window.api.requestSessionReload(cid)}
          onClose={() => setShowProfileTransfer(false)}
        />
      )}

      {/* A single character's login wears the Team Login look: one tile with
          the live step, the stall counter and the bar (Sekmeht). It only DRAWS —
          this pendingConnect flow still owns cancel, conflicts and errors. Keyed
          on the character so each attempt mounts fresh (its tile then ignores
          the previous attempt's last step), and Esc = Cancel from inside it
          (B341: without its own entry, Esc would close the + window beneath). */}
      {pendingConnect && (
        <SoloConnectPanel
          key={`${pendingConnect.account}|${pendingConnect.name}`}
          character={pendingConnect}
          onCancel={cancelPendingConnect}
        />
      )}

      {pendingConflict && (
        // B342: backdropHandlers — a drag that ends on the scrim no longer
        // cancels. cancelConflict is a no-op mid-disconnect, so Esc (B341) is
        // swallowed then rather than falling through.
        <div className="launcher-connecting" {...backdropHandlers(cancelConflict, !conflictBusy)}>
          <EscToClose onClose={cancelConflict} />
          <div className="launcher-connecting-card launcher-dialog">
            <div className="launcher-dialog-head">Account already in use</div>
            <div className="launcher-dialog-body">
              <div>
                <span className="launcher-connecting-name">{pendingConflict.conflict.character}</span>{' '}
                is currently connected on account <strong>{pendingConflict.incoming.account}</strong>{' '}
                ({pendingConflict.conflict.game}).
              </div>
              <div className="launcher-dialog-note">
                DragonRealms only allows one character per account at a time. Continue and{' '}
                {pendingConflict.conflict.character} will be disconnected automatically before{' '}
                {pendingConflict.incoming.name} ({pendingConflict.incoming.game}) connects.
                The disconnected tab stays open in case you want to log back into it later.
              </div>
            </div>
            <div className="launcher-dialog-foot">
              <button className="launcher-connecting-cancel" onClick={cancelConflict} disabled={conflictBusy}>
                Cancel
              </button>
              <button
                className="launcher-connecting-cancel launcher-connecting-cancel--primary"
                onClick={continueWithDisconnect}
                disabled={conflictBusy}
              >
                {conflictBusy
                  ? `Disconnecting ${pendingConflict.conflict.character}…`
                  : `Disconnect ${pendingConflict.conflict.character} and continue`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* F62 account-conflict chooser — Reconnect Last found saved characters
          whose accounts are occupied by OTHER characters. Per account the
          player keeps the connected character or switches to the saved one;
          nothing connects until Confirm (Sekmeht: choose, don't skip). */}
      {reconnectPrompt && (
        // B342 / B341 — as the conflict dialog above; mid-switch neither closes.
        <div className="launcher-connecting" {...backdropHandlers(() => setReconnectPrompt(null), !reconnectBusy)}>
          <EscToClose onClose={() => { if (!reconnectBusy) setReconnectPrompt(null) }} />
          <div className="launcher-connecting-card launcher-dialog">
            <div className="launcher-dialog-head">Choose who plays each account</div>
            <div className="launcher-dialog-body">
              <div>Some accounts from your last session already have a character connected.</div>
              <div className="launcher-dialog-note">
                DragonRealms allows one character per account at a time — choose which character to
                use on each account. Switching disconnects the current character first (its tab stays
                open in case you want to log back into it later).
              </div>
              {reconnectPrompt.conflicts.map((c, i) => (
                <div key={`${c.account}:${c.saved.name}`} className="launcher-choice-row">
                  <span className="launcher-choice-account">{c.account}:</span>
                  <button
                    className={`launcher-connecting-cancel${c.choice === 'keep' ? ' launcher-connecting-cancel--primary' : ''}`}
                    onClick={() => setReconnectChoice(i, 'keep')}
                    disabled={reconnectBusy}
                    title={`Stay connected as ${c.connectedName}; ${c.saved.name} is not reconnected`}
                  >
                    Keep {c.connectedName}
                  </button>
                  <button
                    className={`launcher-connecting-cancel${c.choice === 'switch' ? ' launcher-connecting-cancel--primary' : ''}`}
                    onClick={() => setReconnectChoice(i, 'switch')}
                    disabled={reconnectBusy}
                    title={`Disconnect ${c.connectedName}, then connect ${c.saved.name}`}
                  >
                    Switch to {c.saved.name}
                  </button>
                </div>
              ))}
              {reconnectPrompt.todo.length > 0 && (
                <div className="launcher-dialog-note">
                  {reconnectPrompt.todo.map(t => t.name).join(', ')} will connect on Confirm (no conflicts).
                </div>
              )}
            </div>
            <div className="launcher-dialog-foot">
              <button className="launcher-connecting-cancel" onClick={() => { if (!reconnectBusy) setReconnectPrompt(null) }} disabled={reconnectBusy}>
                Cancel
              </button>
              <button
                className="launcher-connecting-cancel launcher-connecting-cancel--primary"
                onClick={confirmReconnectPrompt}
                disabled={reconnectBusy}
              >
                {reconnectBusy ? 'Switching…' : 'Confirm and connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuickSend && (
        <QuickSend
          initialCommand={showQuickSend.initialCommand}
          onClose={closeQuickSend}  // B343: restores focus as it closes
        />
      )}

      {/* Bulk Connect picker — selection modal. Confirm → runBulkConnect. */}
      {bulkPickerSource && (
        <BulkConnectPicker
          groups={buildBulkGroups(bulkPickerSource)}
          initialSetName={bulkPickerSet}
          onCancel={() => { setBulkPickerSource(null); setBulkPickerSet(null) }}
          onConfirm={runBulkConnect}
        />
      )}

      {/* Team Login (v0.20.0) — one panel for the whole run: a tile per
          character, playable the moment it's READY. Folded into the app-bar
          pill while the player is off playing (see runBulkConnect). */}
      {teamRun?.expanded && (
        <TeamLoginPanel
          run={teamRun}
          activeId={activeId}
          windowCharacterCount={sessions.length}
          openIds={openCharacterIds}
          canCollapse={sessions.length > 0}
          onPlay={playTeamMember}
          onRetry={i => { void retryTeamMember(i) }}
          onStop={() => { bulkStopRef.current = true; patchTeam({ stopping: true }) }}
          onCollapse={() => patchTeam({ expanded: false })}
          onClose={closeTeamRun}
          onOverview={openTeamOverview}
        />
      )}

      {/* v0.8.0 (B99): "Closing…" overlay covers the up-to-5s graceful-
          disconnect wait so the window doesn't look frozen. Inline styles
          keep this self-contained — no separate CSS file needed for one
          short-lived element that paints once and then the window destroys. */}
      {/* B374: the scrim is `.launcher-connecting`'s own var(--modal-scrim)
          rather than a hand-rolled rgba. The z-index STAYS at the Quit tier
          (10000, pitfall #118(d)) on purpose: this is the last thing the window
          ever paints, and it must cover every surface — toasts, context menus,
          About — while the drain runs. */}
      {shutdownInfo && (
        <div className="launcher-connecting" style={{ zIndex: 10000 }}>
          <div className="launcher-connecting-card">
            <div className="launcher-spinner" />
            <div className="launcher-connecting-text">
              {/* Two messages by active-session count. The "no sessions" case
                  isn't really *saving* profiles (we only rewrite ones the
                  GameWindow modified — see B97) — it's mostly backing up
                  every YAML to .bak as the crash-recovery safety net. The
                  copy reflects that. v0.8.0 wording polish. */}
              {shutdownInfo.activeCount > 0
                ? `Closing — disconnecting ${shutdownInfo.activeCount} ${shutdownInfo.activeCount === 1 ? 'character' : 'characters'}…`
                : 'Closing — backing up profiles…'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
