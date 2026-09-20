// Animated / decorative text effects. All are CSS-driven on the matched span and
// respect the epilepsy-safe setting (they freeze to a still version). The color-
// carrying ones (rainbow/shimmer/gold/fire/frost/neon/gradient) REPLACE the text
// colour; bold / background / glow still layer on. wave/bounce are per-letter.
export type HighlightEffect =
  | 'none' | 'glow' | 'shimmer' | 'rainbow' | 'pulse' | 'gold' | 'gradient'
  | 'fire' | 'frost' | 'neon' | 'wave' | 'bounce'

// The single "Text effect" menu (replaces the old glow checkbox — Glow is now
// just the first effect). Order = None, Glow, then the fun ones.
export const HIGHLIGHT_EFFECTS: { value: HighlightEffect; label: string }[] = [
  { value: 'none',     label: 'None' },
  { value: 'glow',     label: 'Glow' },
  { value: 'shimmer',  label: 'Shimmer' },
  { value: 'rainbow',  label: 'Rainbow' },
  { value: 'pulse',    label: 'Pulse' },
  { value: 'gold',     label: 'Gold' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'fire',     label: 'Fire' },
  { value: 'frost',    label: 'Frost' },
  { value: 'neon',     label: 'Neon' },
  { value: 'wave',     label: 'Wave' },
  { value: 'bounce',   label: 'Bounce' },
]

// Effects that PROVIDE the text colour (via background-clip:text / a gradient),
// so the renderer must NOT set an inline `color` (it would override the effect).
export const FX_COLOR_REPLACING = new Set<HighlightEffect>(['shimmer', 'rainbow', 'gold', 'gradient', 'fire', 'frost'])

// The effect a rule actually shows — folds the LEGACY `glow: true` boolean into
// the new effect model so old rules render (and edit) as effect 'glow' with no
// migration. An explicit non-'none' effect always wins.
export function effectiveEffect(s: HighlightStyle): HighlightEffect {
  if (s.effect && s.effect !== 'none') return s.effect
  return s.glow ? 'glow' : 'none'
}

// Which effects use the glowColor as their accent, so the editor offers a
// colour picker for them: glow's shadow and gradient's 2nd stop.
//
// NEON IS NOT ONE OF THEM. `.hl-fx-neon` glows in `--fx-c1`, the TEXT colour
// (highlights.css) — `--fx-c2`, which carries glowColor, is read by exactly one
// rule, `.hl-fx-gradient`. Listing neon here rendered an "Effect color" box that
// the user could set and save and that changed nothing. Pointing the CSS at
// --fx-c2 instead was considered and rejected: a highlight's glowColor DEFAULTS
// to #e8c840, so every existing neon rule would suddenly glow gold.
export const FX_USES_COLOR = new Set<HighlightEffect>(['glow', 'gradient'])

/**
 * The accent colour an effect falls back to when nothing else supplies one.
 *
 * Every effect-colour field in the app advertises this as its default swatch
 * and placeholder, so it has to be REAL somewhere: `resolveEffect` resolves
 * glow as `glowColor || textColor`, and a surface where BOTH can be empty
 * therefore renders a selected Glow as nothing at all. A highlight can't hit
 * that (newHighlight sets both) and neither can a contact template
 * (normalizeTemplate defaults textColor), but a trigger echo can — its colour
 * field legitimately means "leave it the default colour" — so `echoLineStyle`
 * applies this. One constant, so the field's promise and the resolver cannot
 * drift apart. */
export const DEFAULT_FX_COLOR = '#ffd060'

/**
 * The painted effects that carry their OWN fixed palette, so the color you pick
 * does nothing to them (B445).
 *
 * All six `colorReplacing` effects clip a gradient to the glyphs, but only
 * Shimmer and Gradient read `--fx-c1`/`--fx-c2`; these four hardcode their
 * gradients in highlights.css, because the palette IS the effect — a blue Gold
 * or a green Fire is not the thing you asked for. So the fix is not to tint
 * them, it is to say so: a color field that silently does nothing reads as a
 * broken color field (Sekmeht set a #FFFF00 echo and got gold).
 */
export const FX_FIXED_PALETTE = new Set<HighlightEffect>(['rainbow', 'gold', 'fire', 'frost'])

/**
 * The clip-text effects whose gradient runs HORIZONTALLY, so splitting a line
 * into runs visibly breaks them (B444).
 *
 * Fire is deliberately absent: its gradient is `0deg` (vertical) and sized
 * `auto 220%`, so a horizontal split doesn't change what it paints. Glow, pulse,
 * neon, wave and bounce aren't gradients at all. These five are the whole of the
 * problem, and the only ones given line-wide gradient geometry.
 */
export const FX_HORIZONTAL_GRADIENT = new Set<HighlightEffect>(
  ['shimmer', 'rainbow', 'gold', 'frost', 'gradient'])

/**
 * One sentence explaining what an effect does with the chosen color, or null
 * when there is nothing surprising to say. Shared by every editor that offers
 * effects so the three cannot word it differently — or fix it in only one
 * place (pitfall #127). The field stays VISIBLE and editable: it goes live
 * again the moment the effect is switched back to None.
 */
export function effectColorNote(effect: HighlightEffect | undefined | null): string | null {
  if (!effect || !FX_FIXED_PALETTE.has(effect)) return null
  const label = HIGHLIGHT_EFFECTS.find(o => o.value === effect)?.label ?? effect
  return `${label} paints its own colours — the colour above won't tint it.`
}

export interface HighlightStyle {
  textColor: string   // hex or 'transparent'
  bgColor: string     // hex or 'transparent'
  bold: boolean
  glow: boolean
  glowColor: string   // hex — color of the text-shadow glow
  // Optional animated/decorative effect. Undefined / 'none' === plain (the
  // default — existing rules load unchanged, no profile-shape change).
  effect?: HighlightEffect
}

export interface HighlightRule {
  id: string
  name: string
  enabled: boolean
  pattern: string
  mode: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  scope: 'match' | 'line'
  style: HighlightStyle
  priority: number
  groupIds: string[]
  allGroups: boolean
  soundFile?: string   // optional WAV/audio file path to play on match
}

import { scopedKey, safeSetItem } from './characterScope'

const storageKey = (character: string) => scopedKey(character, 'highlights')

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildHighlightRegex(rule: HighlightRule): RegExp | null {
  try {
    if (!rule.pattern.trim()) return null
    let source: string
    if (rule.mode === 'regex') {
      source = rule.pattern
    } else if (rule.mode === 'text') {
      // Apply \b per-token so multi-word patterns and special chars all work.
      // Tokens are joined with \s+ so whitespace differences don't break matches.
      source = rule.pattern
        .trim()
        .split(/\s+/)
        .map(token => {
          const esc = escapeRegex(token)
          const pre = /^\w/.test(token) ? '\\b' : ''
          const suf = /\w$/.test(token) ? '\\b' : ''
          return `${pre}${esc}${suf}`
        })
        .join('\\s+')
    } else {
      // phrase — exact literal substring, escape only regex special chars
      source = escapeRegex(rule.pattern)
    }
    return new RegExp(`(${source})`, rule.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

export function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true } catch { return false }
}

export function loadHighlights(character: string): HighlightRule[] {
  try {
    const raw = localStorage.getItem(storageKey(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

// Returns safeSetItem's success flag (false = quota failure, already toasted)
// so transactional callers — the F63 scope MOVE — can abort instead of
// removing a rule whose new home never persisted. Ordinary callers ignore it.
export function saveHighlights(character: string, rules: HighlightRule[]): boolean {
  return safeSetItem(storageKey(character), JSON.stringify(rules))
}

export function newHighlight(pattern = '', scope: 'match' | 'line' = 'line'): HighlightRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    pattern,
    mode: 'text',
    caseSensitive: true,
    scope,
    style: {
      textColor: '#e8c840',
      bgColor: 'transparent',
      bold: false,
      glow: false,
      glowColor: '#e8c840',
    },
    priority: 0,
    groupIds: [],
    allGroups: true,
  }
}
