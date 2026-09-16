// The "Lichborne" wordmark's painted form — shared by the app bar and by the
// Settings preview that lets you choose it (v0.19.7).
//
// It exists as a shared builder for the reason B281 recorded: a preview and the
// real surface are two code paths answering "what does this look like", and
// when they are two COPIES they drift — a contact template's effect previewed
// as flat colour for a whole release because of exactly that. One builder, both
// callers, no drift possible.
//
// The effect vocabulary is `HighlightEffect`, the same one highlights and
// contact templates use, so the `hl-fx-*` CSS in highlights.css is written once
// and every consumer inherits its epilepsy-safe freeze for free (UX #9b — the
// animation stops, the colour distinction stays).

import type { CSSProperties, ReactNode } from 'react'
import type { HighlightEffect } from '../highlights'
import { resolveEffect, effectContent } from './highlightEffects'

// The wordmark's two halves, which the theme paints in `--accent` and
// `--accent-dim`. Kept as constants so the per-letter stagger offset below is
// derived from the word rather than a hardcoded 4 that could silently drift.
const BRAND_HEAD = 'Lich'
const BRAND_TAIL = 'borne'

export interface BrandPaint {
  /** Effect class, or '' for the static default. */
  className: string
  /** The effect's colour vars, plus the inline glow shadow when it is 'glow'. */
  style: CSSProperties
  content: ReactNode
}

/**
 * Paint the wordmark for one `brandEffect` value.
 *
 * `'none'` (and an absent value — the no-session empty state) returns the
 * original two-tone markup with no class and no style, so the default is
 * byte-identical to what the bar rendered before this setting existed.
 */
export function paintBrandMark(effect: HighlightEffect | null | undefined): BrandPaint {
  // The theme's accent pair feeds the effect's own colour vars, so effects
  // built on them (gradient, shimmer, neon) stay theme-derived instead of
  // hardcoding a hue. Custom properties hold `var()` references fine; the
  // effects carrying a fixed palette (rainbow, gold, fire, frost) ignore them.
  const fx = resolveEffect(effect, 'var(--accent)', 'var(--accent-dim)')
  return {
    className: fx.className,
    style: { ...fx.vars, ...(fx.glowShadow ? { textShadow: fx.glowShadow } : {}) },
    // A colour-replacing effect paints the glyphs itself, so it renders as ONE
    // run and the gradient flows across the whole word; applying our colours
    // under it would only fight it.
    //
    // EVERYTHING ELSE keeps the two-tone `--accent` / `--accent-dim` brand,
    // per-letter effects included. That matters: wave and bounce are NOT
    // colour-replacing, so if they drop these spans they inherit whatever the
    // app bar happens to pass down — and `.app-bar` sets no `color`, so they
    // rendered plain white instead of taking the theme (reported by Sekmeht).
    // The stagger stays continuous across the split via `startIndex`.
    content: fx.colorReplacing
      ? effectContent(BRAND_HEAD + BRAND_TAIL, fx.perLetter)
      : <>
          <span className="toolbar-title-lich">{effectContent(BRAND_HEAD, fx.perLetter)}</span>
          <span className="toolbar-title-borne">{effectContent(BRAND_TAIL, fx.perLetter, BRAND_HEAD.length)}</span>
        </>,
  }
}
