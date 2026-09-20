// useLichBridge — the Lich Scripts panel's running-script list + pause/resume/kill.
//
// PER SESSION: the list is refreshed by asking main to inject `;listall`
// (`lichPollScripts`) every POLL_INTERVAL_MS; main intercepts Lich's reply and
// pushes it back on `onLichScriptsUpdate`, which this hook filters by
// `sessionId`. Everything resets on disconnect, and every effect is keyed on
// `[connected, sessionId]` so a reconnect re-arms cleanly. `custom` on each
// record is a cross-reference against the Lich install's custom/ folder
// (`listLichScripts`, path read from `lichborne.advancedSettings`).
//
// TWO INVARIANTS, both from tester reports:
//  • THE POLL SENDS NOTHING UNLESS `shouldPollRef.current` IS TRUE (Idea A,
//    Binu, v0.13.1). `;listall` rides the same front-end socket Lich hands to
//    scripts' UpstreamHooks, so an unwatched poll can be captured as if the
//    player TYPED it (global_defs.rb:2225 — hooks run before `;` handling).
//    The caller sets that ref from "is a Lich Scripts panel open"; don't
//    un-gate it, and don't move the poll somewhere unconditional.
//  • A script missing from one poll LINGERS for LINGER_MS before it is dropped
//    (kill/restart cycles can straddle a poll boundary) — EXCEPT one the user
//    killed here, which drops immediately (`killingRef`).
// One `pending` flag + PENDING_TIMEOUT_MS stop polls stacking on a slow reply.

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ScriptRecord, SessionId } from '../../shared/types'

const POLL_INTERVAL_MS   = 5000
const PENDING_TIMEOUT_MS = 3000
// Scripts absent from a poll are kept visible for this long before removal.
// Covers transient kill/restart cycles (e.g. T2 relaunching buff) which
// complete in well under a second but may span a poll boundary.
const LINGER_MS = 8000

function getLichPath(): string {
  try {
    return JSON.parse(localStorage.getItem('lichborne.advancedSettings') ?? '{}').lichPath ?? ''
  } catch { return '' }
}

export function useLichBridge(sessionId: SessionId, connected: boolean, shouldPollRef?: { current: boolean }) {
  const [scripts, setScripts]       = useState<ScriptRecord[]>([])
  const [lastUpdated, setLastUpdated] = useState(0)
  const [pending, setPending]       = useState(false)

  const firstSeenRef     = useRef<Map<string, number>>(new Map())
  const lastSeenRef      = useRef<Map<string, number>>(new Map())
  const lastKnownRef     = useRef<Map<string, { paused: boolean }>>(new Map())
  // Signature of the last COMMITTED script list, so an unchanged `;listall`
  // reply doesn't mint a new array and re-render GameWindow (see the commit
  // site below).
  const lastSigRef       = useRef<string>('')
  const killingRef       = useRef<Set<string>>(new Set())
  const customNamesRef   = useRef<Set<string>>(new Set())
  const pendingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef       = useRef(false)

  // Load custom script names once on connect for cross-reference
  useEffect(() => {
    if (!connected) return
    const lichPath = getLichPath()
    if (!lichPath) return
    window.api.listLichScripts(lichPath).then(list => {
      customNamesRef.current = new Set(
        list.filter(s => s.source === 'custom').map(s => s.name)
      )
    })
  }, [connected])

  // Subscribe to script list updates pushed from the main process intercept
  useEffect(() => {
    if (!connected) {
      setScripts([])
      setLastUpdated(0)
      firstSeenRef.current.clear()
      lastSeenRef.current.clear()
      lastKnownRef.current.clear()
      killingRef.current.clear()
      return
    }

    const unsub = window.api.onLichScriptsUpdate((payload) => {
      if (payload.sessionId !== sessionId) return
      const raw = payload.entries
      if (pendingTimerRef.current) { clearTimeout(pendingTimerRef.current); pendingTimerRef.current = null }
      pendingRef.current = false
      setPending(false)

      const now  = Date.now()
      const seen = new Set(raw.map(r => r.name))

      // Update lastSeen and lastKnown for every confirmed-active script
      for (const r of raw) {
        lastSeenRef.current.set(r.name, now)
        lastKnownRef.current.set(r.name, { paused: r.paused })
        if (!firstSeenRef.current.has(r.name)) firstSeenRef.current.set(r.name, now)
      }

      // Evict scripts absent beyond the linger window, or immediately if intentionally killed.
      // Killed scripts skip the linger window — T2-style restarts never go through killingRef.
      for (const name of firstSeenRef.current.keys()) {
        const ls = lastSeenRef.current.get(name) ?? 0
        const gone = !seen.has(name)
        const lingerExpired = now - ls > LINGER_MS
        const killedAndGone = gone && killingRef.current.has(name)
        if (gone && (lingerExpired || killedAndGone)) {
          firstSeenRef.current.delete(name)
          lastSeenRef.current.delete(name)
          lastKnownRef.current.delete(name)
          killingRef.current.delete(name)
        }
      }

      // Merge: confirmed active scripts + scripts still within linger window
      const merged = new Map<string, { paused: boolean }>()
      for (const r of raw) merged.set(r.name, { paused: r.paused })
      for (const [name, ls] of lastSeenRef.current.entries()) {
        if (!merged.has(name) && now - ls <= LINGER_MS) {
          merged.set(name, lastKnownRef.current.get(name) ?? { paused: false })
        }
      }

      const next = Array.from(merged.entries()).map(([name, state]) => ({
        name,
        paused:    state.paused,
        custom:    customNamesRef.current.has(name),
        firstSeen: firstSeenRef.current.get(name) ?? now,
        killing:   killingRef.current.has(name),
      })).sort((a, b) => b.firstSeen - a.firstSeen)

      // Commit only on a REAL change (v0.19.9). This hook lives at GameWindow
      // scope, so each setState here re-renders the entire GameWindow — and
      // `;listall` answers every 5s with a byte-identical list the whole time
      // nothing is starting or stopping, which is the overwhelmingly common
      // case. Minting a fresh array unconditionally made every reply a full
      // re-render for no visible change. `firstSeen` is excluded from the
      // signature deliberately: it is assigned once per script and preserved
      // across polls, so it cannot differ without the name set differing.
      const sig = next.map(s => `${s.name}|${s.paused}|${s.custom}|${s.killing}`).join('\n')
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig
        setScripts(next)
      }
      // `lastUpdated` deliberately advances on EVERY reply, changed or not. It
      // drives the panel's "updated Ns ago" footer, which reports when the feed
      // last ANSWERED — not when it last differed. Gating it on the signature
      // would make a perfectly live poll read "updated 5m ago" whenever the
      // script list happened to be stable, which is the same mistake the Spell
      // Monitor's feed readout documents (report ARRIVAL, never last-change).
      setLastUpdated(now)
    })

    return unsub
  }, [connected, sessionId])

  // Poll loop — fires immediately on connect, then every POLL_INTERVAL_MS
  useEffect(() => {
    if (!connected) return

    function poll() {
      // Idea A (Binu, v0.13.1): when no Lich Scripts panel is open, inject
      // NOTHING. `;listall` travels the same front-end socket Lich hands to
      // scripts (e.g. automap's UpstreamHook), so an unwatched 5s poll can be
      // mis-captured as a typed movement command (Lich's do_client runs
      // UpstreamHook BEFORE handling `;` commands — global_defs.rb:2225). The
      // interval still ticks but sends nothing while closed; opening the panel
      // fires one immediate seed via the caller's refresh().
      if (shouldPollRef && !shouldPollRef.current) return
      if (pendingRef.current) return  // skip if previous poll hasn't responded
      pendingRef.current = true
      setPending(true)
      window.api.lichPollScripts(sessionId)
      pendingTimerRef.current = setTimeout(() => {
        pendingRef.current = false
        setPending(false)
        pendingTimerRef.current = null
      }, PENDING_TIMEOUT_MS)
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      clearInterval(interval)
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
      pendingRef.current = false
    }
  }, [connected, sessionId])

  const pauseScript  = useCallback((name: string) => window.api.lichPauseScript(sessionId, name),  [sessionId])
  const resumeScript = useCallback((name: string) => window.api.lichResumeScript(sessionId, name), [sessionId])
  const killScript   = useCallback((name: string) => {
    killingRef.current.add(name)
    // Optimistically reflect the killing state before the next poll
    setScripts(prev => prev.map(s => s.name === name ? { ...s, killing: true } : s))
    window.api.lichKillScript(sessionId, name)
  }, [sessionId])
  const refresh      = useCallback(() => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    window.api.lichPollScripts(sessionId)
    pendingTimerRef.current = setTimeout(() => {
      pendingRef.current = false
      setPending(false)
    }, PENDING_TIMEOUT_MS)
  }, [sessionId])

  return { scripts, lastUpdated, pending, pauseScript, resumeScript, killScript, refresh }
}
