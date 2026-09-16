// The Overview view's app-level frame (v0.19.0, DESIGN §47).
//
// Owns three things and renders no character data itself:
//   1. the PORTAL HOST — a stable DOM node every GameWindow renders its own card
//      into. Kept ALWAYS MOUNTED (hidden by CSS in Session view) so the node
//      identity never changes; a conditionally-rendered host would give every
//      card a null target on the first frame after a toggle.
//   2. the summary strip — the cross-character reduction, from the store.
//   3. the shared 1 Hz clock — ONE interval for the whole view, published via
//      context, rather than N intervals in N cards. The character tab strip's
//      shared RT tick is the precedent, and its comment explains why a
//      permanent app-level interval is a real cost under
//      `backgroundThrottling: false`.
//
// It is an OVERLAY over the session shells, not a replacement for them: the
// active character's GameWindow stays laid out underneath, so its virtualised
// scrollback keeps measuring and returning to Session view needs no re-snap.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useDigests, useOverviewOptions, digestFlags, useOverviewNow,
  startOverviewClock, stopOverviewClock, setFeedCapacity, setOverviewTarget,
} from '../../overviewStore'
import { planGrid } from '../../overviewLayout'
import OverviewInputBar from './OverviewInputBar'
import { ATTENTION_DEFS, needsAttention, type AttentionFlag } from '../../attention'
import '../../styles/overview.css'

interface Props {
  /** Whether the Overview is the active view. Drives the CSS visibility only. */
  open: boolean
  /** How many characters this window owns — for the empty/one-character copy. */
  characterCount: number
  /**
   * The character Session view is currently on. The input bar FOLLOWS this, so
   * a tab switch made from the Overview retargets it (see OverviewInputBar).
   * `null` before any character is active.
   */
  activeCharacterId: string | null
  /**
   * Receives the portal host node. `MutableRefObject`, not `RefObject` — that is
   * what `useRef<HTMLDivElement | null>(null)` produces and what the `ref=`
   * attribute accepts under the React 18 types.
   */
  hostRef: React.MutableRefObject<HTMLDivElement | null>
}

export default function OverviewShell({ open, characterCount, activeCharacterId, hostRef }: Props) {
  const options = useOverviewOptions()
  // Measured grid box. 0×0 means "not measured yet" and is IGNORED rather than
  // stored — a hidden character tab measures 0×0 (pitfall #24), and letting that
  // through would re-plan the grid to a single column every time you switch
  // tabs. Note this drives STYLE only: nothing is gated on it being non-zero,
  // which is the trap pitfall #83 describes.
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r || r.width <= 0 || r.height <= 0) return
      setBox(prev => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1)
        ? prev : { w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hostRef])

  // B342: click-to-deselect fires only when the MOUSEDOWN also started on empty
  // grid space, so a press on a card that is released over a gap no longer
  // deselects. A NATIVE listener, not React's onMouseDown: the cards are
  // PORTALED in by their GameWindows, so their React events bubble through
  // GameWindow and never reach this grid — a React handler here (or the shared
  // backdropHandlers flag) would simply never hear a mousedown on a card and
  // keep a stale value. Natively the cards ARE descendants of the grid, and this
  // listener runs before any card's React handler could stop the event.
  const downOnEmptyGridRef = useRef(false)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => { downOnEmptyGridRef.current = e.target === el }
    el.addEventListener('mousedown', onDown)
    return () => el.removeEventListener('mousedown', onDown)
  }, [hostRef])

  // B296: subscribe THIS component to the 1 Hz clock. The fresh-per-render
  // `getComputedStyle` read below was justified by "the shell renders on the
  // 1 Hz clock" — which was false: the shell's only changing subscription was
  // options (a clock notify left that snapshot identical, so React bailed), so a
  // `--game-font-size` change never re-planned the grid except by an incidental
  // App re-render (the Settings modal closing masked it). This makes the claim
  // true by construction: the clock only runs while the view is open, a shell
  // render is cheap (the cards are PORTALED — they are GameWindow's children,
  // not re-rendered by this), and font changes now land within a second.
  useOverviewNow()
  // `em` resolved against the GAME font, so every threshold in overviewLayout
  // tracks Settings → Font Size (Principle #9) instead of a fixed pixel guess.
  //
  // Read fresh each render, NOT memoized. There is no dependency that changes
  // when a CSS custom property does, so a memo keyed on the box and the tile
  // size held a stale value until something else happened to invalidate it —
  // and the grid would not re-plan on a font change at all, which is precisely
  // what this is here to make it do. With the clock subscription above, this is
  // a few `getComputedStyle` calls a second, only while the view is open.
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--game-font-size')
  const parsedEm = parseFloat(raw)
  const emPx = Number.isFinite(parsedEm) && parsedEm > 0 ? parsedEm : 12

  const plan = useMemo(
    () => planGrid({
      width: box.w, height: box.h, count: characterCount, emPx,
      tileSize: options.tileSize, feedLines: options.feedLines,
    }),
    [box, characterCount, emPx, options.tileSize, options.feedLines],
  )

  // The shell is the only thing that measures the grid, and the cards are
  // portaled out of reach of any prop or context from here — so the capacity
  // goes through the store.
  useEffect(() => { setFeedCapacity(plan.feedCapacity) }, [plan.feedCapacity])

  // The clock lives in the STORE, not a context here: the cards are portaled, so
  // their React context comes from their GameWindow, not from this component —
  // a provider here would hand every card the default value forever. The
  // interval runs ONLY while the view is open, so Session view costs nothing.
  useEffect(() => {
    if (!open) return
    startOverviewClock()
    return () => stopOverviewClock()
  }, [open])

  return (
    <div className={`ov-shell${open ? '' : ' ov-shell--hidden'}`} aria-hidden={!open}>
      {open && <OverviewSummaryStrip />}
      {/* The host is OUTSIDE the `open` guard on purpose — see the header.
          Columns and the row floor are handed to CSS as custom properties: the
          grid fills the space when there is room (`1fr`) and falls back to the
          floor when there isn't, which is what turns "too many characters" into
          scrolling rather than into unreadable stamps. */}
      <div
        className="ov-grid"
        ref={hostRef}
        // Clicking the EMPTY grid (not a card — cards stop propagation by
        // handling their own click) widens the input bar back to all
        // characters. The gesture reads as "deselect", which is what it is.
        // Both ends must be on empty space (B342, the listener above).
        onClick={e => { if (e.target === e.currentTarget && downOnEmptyGridRef.current) setOverviewTarget(null) }}
        style={{
          ['--ov-cols' as string]: String(plan.columns),
          ['--ov-row-min' as string]: `${plan.rowMinPx}px`,
          // `1fr` for auto (tiles stretch to fill, which is the point); a hard
          // px cap for a manual size, or the override would be inert.
          ['--ov-tile-max' as string]: plan.tileMaxPx === null ? '1fr' : `${plan.tileMaxPx}px`,
        } as React.CSSProperties}
      />
      {open && characterCount <= 1 && <OverviewHint characterCount={characterCount} />}
      {/* Below the grid, where a command bar lives in the game window. Rendered
          only while the view is open so its type-anywhere listener cannot steal
          keystrokes in Session view. */}
      {open && <OverviewInputBar activeCharacterId={activeCharacterId} />}
    </div>
  )
}

// ── Sub-components, all at MODULE scope ──────────────────────────────────────
// UX polish standard #4: a component declared inside a render is a new type on
// every render, so React unmounts and remounts it — and this view re-renders
// whenever a digest lands.

function OverviewSummaryStrip() {
  const digests = useDigests()
  const options = useOverviewOptions()
  const now = useOverviewNow()

  const total = digests.length
  const connected = digests.filter(d => d.connected).length

  // Worst-first, and only flags that are actually present — a strip of zeroes
  // teaches the eye to ignore the strip (UX #1).
  const tally = new Map<AttentionFlag, number>()
  let needing = 0
  for (const d of digests) {
    const flags = digestFlags(d)
    // `idle` is derived HERE rather than pushed: an idle character stops
    // receiving events, so it stops re-rendering, so a push-computed idle flag
    // would never arrive. The digest carries a quantised `lastInboundAt` for
    // exactly this.
    const isIdle = d.connected && d.lastInboundAt > 0
      && now - d.lastInboundAt > options.idleSeconds * 1000
    if (isIdle && !flags.includes('idle')) flags.push('idle')
    // Same predicate as the app-bar badge (one definition, pitfall #127): the
    // informational flags below the floor are still CHIPPED below, they just
    // do not count as a character asking for you.
    if (needsAttention(d.score)) needing++
    for (const f of flags) tally.set(f, (tally.get(f) ?? 0) + 1)
  }
  const chips = [...tally.entries()]
    .sort((a, b) => ATTENTION_DEFS[b[0]].severity - ATTENTION_DEFS[a[0]].severity)

  return (
    <div className="ov-summary">
      <span className="ov-summary-counts">
        <strong>{total}</strong> character{total === 1 ? '' : 's'}
        <span className="ov-summary-sep">·</span>
        <strong>{connected}</strong> connected
      </span>

      {/* B393: "all calm" and the chips are NOT either/or. "All calm" answers
          "does anyone need me?" — but the informational chips below the alert
          floor (idle, mind locked) were hidden behind it, so a parked character
          or a skill at lock vanished from the one strip that summarises every
          character. They sit BESIDE the calm marker now, in their own muted
          treatment, so the strip reads calm and still tells you what it knows
          (UX #1: quiet by default, never by hiding a real signal). */}
      {needing === 0 && (
        <span className="ov-summary-calm"
              title={chips.length > 0
                ? 'Nothing needs your attention right now — the grey chips beside this are informational'
                : 'Nothing needs your attention right now'}>✓ all calm</span>
      )}
      {chips.length > 0 && (
        <span className="ov-summary-flags">
          {chips.map(([flag, n]) => (
            <span key={flag} className={`ov-flag ov-flag--${ATTENTION_DEFS[flag].cls}`} title={ATTENTION_DEFS[flag].desc}>
              {ATTENTION_DEFS[flag].label}{n > 1 ? ` ×${n}` : ''}
            </span>
          ))}
        </span>
      )}

      <span className="ov-summary-mode" title="Card order. Change it with /view sort.">
        sorted by {options.sort === 'attention' ? 'attention' : 'tab order'}
      </span>
    </div>
  )
}

function OverviewHint({ characterCount }: { characterCount: number }) {
  // Explains itself even when empty (UX standard #8b) — a first-time user with
  // one character should learn what this view is FOR without having to guess.
  return (
    <div className="ov-hint">
      {characterCount === 0
        ? 'No characters in this window yet.'
        : 'Overview comes into its own with more than one character — every one you connect gets a live card here.'}
    </div>
  )
}
