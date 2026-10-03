// useTimers — countdown state for the roundtime / cast / aim timer bars.
//
// Takes the three ABSOLUTE expiry timestamps (local-clock ms; 0 = no timer)
// that game events stamp into session state, and returns what a bar needs:
// seconds remaining (`rt`/`ct`/`aim`, floored at 0), the duration each timer
// STARTED with (`*Max`, fixed the moment its expiry changes), and
// `rtPct`/`ctPct` = remaining ÷ start, clamped to 0–100. Consumers include the
// timer strips, every Overview card and the Tableau's readiness rings, so one
// instance runs per bar shown.
//
// The clock is a 10 Hz `setInterval` that exists ONLY while a timer is live —
// and (B292) it must CLEAR ITSELF once every stamp is in the past, because the
// expiry values are never zeroed after a character's first roundtime, so the
// "all zero" bail alone never holds again. Without the self-clear one RT armed
// a permanent tick for the whole session. A new timer event changes a dep and
// re-arms a fresh interval; keep that shape.
//
// THE FIRST FRAME OF A NEW TIMER must be computed from fresh values (v0.20.2,
// Sekmeht: "the roundtime ring flickered before showing the RT animation").
// It used to read two stale ones: `now` from the last tick — which, with the
// interval retired, can be minutes old — and `*Max` from an effect that only
// runs AFTER the render, i.e. the PREVIOUS timer's length. Together they gave
// a percentage far over 100; the Tableau ring's dashoffset transition then
// wound back through dozens of ring lengths to the right value. So the start
// length is fixed during render, keyed on the stamp it belongs to (idempotent:
// a second render with the same stamp changes nothing), the render that sees a
// new stamp counts from the real clock, and the percentages are clamped.

import { useEffect, useRef, useState } from 'react'

type Start = { exp: number; max: number }

/** The start length for `exp`, fixed the first time this stamp is seen. */
function startFor(ref: { current: Start }, exp: number, t: number): number {
  if (ref.current.exp !== exp) ref.current = { exp, max: exp > 0 ? Math.max(0, (exp - t) / 1000) : 0 }
  return ref.current.max
}

export function useTimers(rtExpires: number, ctExpires: number, aimExpires = 0) {
  const [now, setNow] = useState(Date.now())
  const rtRef = useRef<Start>({ exp: 0, max: 0 })
  const ctRef = useRef<Start>({ exp: 0, max: 0 })
  const aimRef = useRef<Start>({ exp: 0, max: 0 })

  useEffect(() => {
    if (rtExpires === 0 && ctExpires === 0 && aimExpires === 0) return
    // B292: the interval must ALSO stop itself once every live stamp is in the
    // past. The expiry timestamps are set by game events and never zeroed, so
    // the all-zero guard above almost never holds again after a character's
    // first roundtime — without the self-clear, one RT armed a permanent 10 Hz
    // tick (× every Overview card, × every character, for the whole session).
    // The final tick still runs setNow, so the bar renders its 0 before the
    // interval dies; a NEW timer event changes a dep and re-arms a fresh one.
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= rtExpires && t >= ctExpires && t >= aimExpires) clearInterval(id)
    }, 100)
    return () => clearInterval(id)
  }, [rtExpires, ctExpires, aimExpires])

  // A stamp this render hasn't seen yet means `now` is stale (the interval may
  // have been retired for a long time): count from the real clock instead.
  // Later renders before the first tick (a layout re-measure, say) must not
  // fall back to the stale tick either, so the clock never reads earlier than
  // the moment the newest stamp was seen.
  const seenAtRef = useRef(0)
  const fresh = rtRef.current.exp !== rtExpires || ctRef.current.exp !== ctExpires || aimRef.current.exp !== aimExpires
  if (fresh) seenAtRef.current = Date.now()
  const t = Math.max(now, seenAtRef.current)
  const rtMax = startFor(rtRef, rtExpires, t)
  const ctMax = startFor(ctRef, ctExpires, t)
  const aimMax = startFor(aimRef, aimExpires, t)

  const rt = rtExpires > 0 ? Math.max(0, (rtExpires - t) / 1000) : 0
  const ct = ctExpires > 0 ? Math.max(0, (ctExpires - t) / 1000) : 0
  const aim = aimExpires > 0 ? Math.max(0, (aimExpires - t) / 1000) : 0
  const pct = (left: number, max: number) => (max > 0 ? Math.min(100, Math.max(0, (left / max) * 100)) : 0)
  const rtPct = pct(rt, rtMax)
  const ctPct = pct(ct, ctMax)

  return { rt, ct, aim, rtMax, ctMax, aimMax, rtPct, ctPct }
}
