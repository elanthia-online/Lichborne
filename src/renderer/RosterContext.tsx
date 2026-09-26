// RosterContext — this window's mirror of main's cross-window session roster (v0.11.0).
//
// APP-LEVEL (the outermost provider in App.tsx), not per-session: main owns the
// authoritative list of every session in every window and broadcasts it on
// each change; this context mirrors it and exposes `roster` (everywhere),
// `windowId`, `isPrimary` (null until known — treat as primary while unknown)
// and `myRoster` (the entries this window owns). This window's own TABS are
// still driven by SessionsContext; this is the cross-window awareness layer
// (cross-window Quick Send targets read `roster`).
//
// INVARIANT: the mount effect must both SUBSCRIBE to pushes AND PULL the current
// roster. Push-only loses the race with main's did-finish-load broadcast in a
// freshly-opened window and leaves `roster` empty with nothing to heal it —
// the comment inside the effect explains the ordering. Don't make it push-only.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RosterEntry } from '../shared/types'

// Multi-window (v0.11.0). The roster is main's authoritative list of EVERY
// session across ALL windows; main broadcasts it on every change. This context
// mirrors it in the renderer and exposes:
//   • roster    — all sessions everywhere (for cross-window Quick Send targets)
//   • windowId  — this window's stable webContents id
//   • myRoster  — the subset this window owns (ownerWindowId === windowId)
//
// Phase 1 is additive: the roster is populated and available but the existing
// render path still flows through SessionsContext. Phase 2 flips GameWindow
// rendering to derive from `myRoster`; Phase 4 points Quick Send at `roster`.

interface RosterContextValue {
  roster: RosterEntry[]
  windowId: number | null
  isPrimary: boolean | null   // null until known; treat as primary while unknown
  myRoster: RosterEntry[]
}

const RosterContext = createContext<RosterContextValue | null>(null)

export function RosterProvider({ children }: { children: ReactNode }) {
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [info, setInfo] = useState<{ windowId: number; isPrimary: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.getWindowInfo().then(i => { if (!cancelled) setInfo(i) }).catch(() => {})
    // Subscribe to future pushes AND pull the current roster now. The push
    // (onSessionRoster) fires on main's did-finish-load broadcast — a race a
    // freshly-opened window's renderer loses, leaving `roster` empty so Quick
    // Send (cross-window roster-targeted) renders nothing in a decoupled
    // window. The pull seeds it deterministically on mount. Pull resolves after
    // subscribe is set up, so a push that arrives in between isn't lost; if the
    // pull resolves last it just reasserts the same authoritative list.
    const unsub = window.api.onSessionRoster(payload => setRoster(payload.roster))
    window.api.getRoster().then(r => { if (!cancelled) setRoster(r) }).catch(() => {})
    return () => { cancelled = true; unsub() }
  }, [])

  const windowId = info?.windowId ?? null
  const isPrimary = info ? info.isPrimary : null

  const myRoster = useMemo(
    () => (windowId == null ? roster : roster.filter(r => r.ownerWindowId === windowId)),
    [roster, windowId],
  )

  const value = useMemo<RosterContextValue>(
    () => ({ roster, windowId, isPrimary, myRoster }),
    [roster, windowId, isPrimary, myRoster],
  )

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>
}

/** The roster, or null outside a RosterProvider — for components that can also
 *  render where there is none (a harness, a standalone host). */
export function useRosterOptional(): RosterContextValue | null {
  return useContext(RosterContext)
}

export function useRoster(): RosterContextValue {
  const ctx = useContext(RosterContext)
  if (!ctx) throw new Error('useRoster must be used within RosterProvider')
  return ctx
}
