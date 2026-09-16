// Text-effect resolution — turns a `HighlightEffect` (glow / wave / bounce / …)
// into the class + inline-style bits a render site applies to a styled run.
//
// ONE resolver serves BOTH consumers of effects — highlight matches (hl-match)
// and contact-template names — so the effect CSS (`hl-fx-*` in highlights.css)
// is written once. Contract a caller must honour: when `colorReplacing` is true
// the effect supplies the colour itself, so the caller must SKIP its inline
// `color`; `glow` stays an inline text-shadow (identical to pre-effects
// rendering); `wave`/`bounce` animate per LETTER, so `effectContent` splits the
// text into `--i`-staggered character spans and everything else renders the
// plain string.
import type { CSSProperties, ReactNode } from 'react'
import type { HighlightEffect } from '../highlights'
import { FX_COLOR_REPLACING } from '../highlights'

// Shared resolution of a text EFFECT into the class + style bits a render site
// applies. Used by BOTH highlights (hl-match) and contact-template names, so the
// effect CSS (hl-fx-* in highlights.css) is written once and reused.
export interface ResolvedEffect {
  className: string          // '' or 'hl-fx-<effect>' (glow/none add no class)
  colorReplacing: boolean    // caller must SKIP the inline color (the effect provides it)
  vars: CSSProperties        // --fx-c1 / --fx-c2 for effects that use the user's colours
  glowShadow: string | null  // text-shadow for 'glow' (kept inline, like before)
  perLetter: boolean         // wave / bounce split the text into letters
}

export function resolveEffect(
  effect: HighlightEffect | null | undefined,
  textColor: string | null,
  glowColor: string | null,
): ResolvedEffect {
  const e = effect && effect !== 'none' ? effect : null
  if (!e) return { className: '', colorReplacing: false, vars: {}, glowShadow: null, perLetter: false }
  // Glow stays an inline text-shadow (identical to the pre-effects rendering).
  if (e === 'glow') {
    return {
      className: '', colorReplacing: false, vars: {}, perLetter: false,
      glowShadow: glowColor ? `0 0 6px ${glowColor}, 0 0 14px ${glowColor}` : null,
    }
  }
  return {
    className: `hl-fx-${e}`,
    colorReplacing: FX_COLOR_REPLACING.has(e),
    vars: { '--fx-c1': textColor || 'currentColor', '--fx-c2': glowColor || textColor || '#ffffff' } as CSSProperties,
    glowShadow: null,
    perLetter: e === 'wave' || e === 'bounce',
  }
}

// wave / bounce animate per LETTER, so split into character spans (staggered by
// --i in CSS); everything else renders the plain string.
//
// `startIndex` continues the stagger across a run that a caller had to split
// into several elements — the app-bar wordmark paints "Lich" and "borne" in
// two different theme colours, and without an offset the second span would
// restart the wave at zero and break it mid-word. Defaults to 0, so every
// single-run caller is unaffected.
export function effectContent(text: string, perLetter: boolean, startIndex = 0): ReactNode {
  if (!perLetter) return text
  return [...text].map((ch, i) => (
    <span key={i} className="hl-fx-ch" style={{ '--i': startIndex + i } as CSSProperties}>{ch}</span>
  ))
}
