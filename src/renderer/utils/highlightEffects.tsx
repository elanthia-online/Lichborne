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
    // Falls back to the TEXT colour, exactly as the `--fx-c2` line below already
    // does. Without it a glow with no accent colour produced no shadow at all —
    // so picking Glow on a contact name did nothing, because a template's
    // `glowColor` is optional and starts undefined (a highlight's defaults to a
    // real hex, which is why only contacts showed it). Silent, and it looked
    // identical to having chosen no effect.
    const g = glowColor || textColor
    return {
      className: '', colorReplacing: false, vars: {}, perLetter: false,
      glowShadow: g ? `0 0 6px ${g}, 0 0 14px ${g}` : null,
    }
  }
  return {
    className: `hl-fx-${e}`,
    colorReplacing: FX_COLOR_REPLACING.has(e),
    // NOT `currentColor`: the clip-text effects paint `color: transparent` on
    // this very element, so currentColor resolves to TRANSPARENT and a Shimmer
    // with no colour of its own rendered as a white band on nothing. A theme
    // variable is the closest honest stand-in for "the text colour it would
    // otherwise have", and it self-corrects on light and dark (pitfall #34).
    vars: { '--fx-c1': textColor || 'var(--text-primary)', '--fx-c2': glowColor || textColor || 'var(--text-primary)' } as CSSProperties,
    glowShadow: null,
    perLetter: e === 'wave' || e === 'bounce',
  }
}

// wave / bounce animate per LETTER, so split into character spans (staggered by
// --i in CSS); everything else renders the plain string.
//
// `startIndex` continues the stagger across a run that a caller had to split
// into several elements — the app-bar wordmark paints "Lich" and "borne" in
// two different theme colours, and a highlighted line is split into runs and
// segments. Without an offset each piece would restart the wave at zero and
// break it mid-word. Defaults to 0, so a single-run caller is unaffected.
//
// Each WORD's letters sit inside a `white-space: nowrap` `.hl-fx-word`. The
// letters are inline-blocks, and Chromium treats the boundary between two
// inline-blocks as a line-break opportunity, so without the grouping a wave
// on a long line wrapped mid-word ("charl" / "ie" — measured in Electron 43).
// Whitespace stays outside the groups, so a line still wraps at its spaces.
export function effectContent(text: string, perLetter: boolean, startIndex = 0): ReactNode {
  if (!perLetter) return text
  const nodes: ReactNode[] = []
  let i = startIndex
  for (const token of text.split(/(\s+)/)) {
    if (!token) continue
    const first = i
    const letters = [...token].map(ch => {
      const n = i++
      return <span key={n} className="hl-fx-ch" style={{ '--i': n } as CSSProperties}>{ch}</span>
    })
    if (/^\s/.test(token)) nodes.push(...letters)
    else nodes.push(<span key={`w${first}`} className="hl-fx-word">{letters}</span>)
  }
  return nodes
}
