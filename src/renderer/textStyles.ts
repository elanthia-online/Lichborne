// Text styles — per-character font, size, weight, slant, case and effect for
// each KIND of game text (room names, speech, thoughts, …), v0.20.1.
//
// The game tags its text with presets (`roomname`, `speech`, …) and every
// renderer already stamps them as `data-preset` (renderSegment). A theme gives
// each preset a COLOUR; this module gives each one a LOOK. Nothing here is
// set by default: an absent field means "leave it as it is today", so a
// character with no text styles renders byte-identically to before.
//
// Two delivery paths, deliberately split:
// - Font / size / weight / slant / case are plain CSS, written as ONE generated
//   <style> element (`applyTextStyles`). A stylesheet rather than CSS variables
//   because an unset variable in a declaration does not fall back to the rule
//   BEFORE it — it resets the property, which would strip the room name's
//   default bold. Rules are emitted only for fields the player actually set.
// - The EFFECT needs markup (per-letter spans, an inner span for clip-text
//   effects — pitfall #148), so `renderSegment` asks `presetEffect()` and wraps
//   the text itself. Rows are memoized, so they subscribe to `useTextStylesVersion`
//   to repaint when a style changes.
//
// Like the game font, this follows the ACTIVE character: `applySettingsToDOM`
// calls `applyTextStyles` for whoever owns the document. Mono lines (the
// `exp`/`inv` tables) are excluded from the font rules so their columns
// never shift.

import { useSyncExternalStore } from 'react'
import type { HighlightEffect } from './highlights'

/** The text kinds a player can restyle. The ids are the parser's preset ids. */
export type TextStyleId = 'roomname' | 'roomdesc' | 'speech' | 'whisper' | 'thought' | 'bold' | 'command-echo'

export interface TextStyle {
  /** A raw font name or a FONT_FAMILIES key. Absent = the game font. */
  font?: string
  /** Size as a percent of the game font (60–250). Absent = 100. */
  size?: number
  weight?: 'normal' | 'bold'
  italic?: boolean
  caps?: 'small-caps' | 'uppercase'
  /** Absent or 'none' = no effect. 'gradient' is not offered (it needs a
   *  second colour this editor doesn't have). */
  effect?: HighlightEffect
}

export type TextStyles = Partial<Record<TextStyleId, TextStyle>>

export interface TextStyleTarget {
  id: TextStyleId
  label: string
  /** What this text is, for the Settings row. */
  desc: string
  /** A plausible line of it, for the live preview. */
  sample: string
  /** The theme variable that colours it — an effect draws in this colour. */
  colorVar: string
  /** Extra elements that show the same text outside the game stream. */
  alsoSelectors?: string[]
  /** The effects this kind offers. Absent = all of TEXT_STYLE_EFFECTS. */
  effects?: HighlightEffect[]
}

/** The calm effects, for long text. A room description is a paragraph of
 *  ~360 characters (median, captured session) and several are on screen while
 *  you travel: Wave and Bounce animate EVERY character, and the moving
 *  gradients (Shimmer, Rainbow, Gold, Fire, Frost) repaint the whole paragraph
 *  every frame. Glow is static, Pulse animates opacity (compositor-only) and
 *  Neon changes only at a few keyframes. */
export const PARAGRAPH_EFFECTS: HighlightEffect[] = ['none', 'glow', 'pulse', 'neon']

export const TEXT_STYLE_TARGETS: TextStyleTarget[] = [
  { id: 'roomname', label: 'Room names', desc: 'The [Title] line each time you enter a room, and the Room panel\'s title.',
    sample: '[The Crossing, Town Green North]', colorVar: '--preset-roomname', alsoSelectors: ['.room-panel-title-text'] },
  { id: 'roomdesc', label: 'Room descriptions', desc: 'The paragraph describing the room. The Room panel takes its font and size, but not its effect.',
    sample: 'Tall oaks shade a lawn of close-cropped grass.', colorVar: '--preset-roomdesc', alsoSelectors: ['.room-panel-desc'],
    effects: PARAGRAPH_EFFECTS },
  { id: 'speech', label: 'Speech', desc: 'The "Name says," part of what people say — the game colours only that part, not the quote.',
    sample: 'Vayne says, "Watch your step."', colorVar: '--preset-speech' },
  { id: 'whisper', label: 'Whispers', desc: 'The "Name whispers," part of a whisper.',
    sample: 'Kaela whispers, "Over here."', colorVar: '--preset-whisper' },
  { id: 'thought', label: 'Thoughts', desc: 'Telepathy and gweth thoughts.',
    sample: '[General] Your mind hears Kaela thinking, "Low mana."', colorVar: '--preset-thought' },
  { id: 'bold', label: 'Bold text', desc: 'What the game makes bold: creatures in the room, deaths, some messages.',
    sample: 'a large black rat', colorVar: '--preset-bold' },
  { id: 'command-echo', label: 'Your commands', desc: 'The echo of what you type, together with the prompt it sits on.',
    sample: '>look', colorVar: '--preset-cmd' },
]

export const TEXT_STYLE_EFFECTS: HighlightEffect[] =
  ['none', 'glow', 'shimmer', 'rainbow', 'pulse', 'gold', 'fire', 'frost', 'neon', 'wave', 'bounce']

export const TEXT_SIZE_MIN = 60
export const TEXT_SIZE_MAX = 250

const IDS = new Set<string>(TEXT_STYLE_TARGETS.map(t => t.id))
const EFFECTS = new Set<string>(TEXT_STYLE_EFFECTS)

/** The effects a kind of text offers (the editor's list, and what loading
 *  keeps). */
export function effectsFor(id: TextStyleId): HighlightEffect[] {
  return TEXT_STYLE_TARGETS.find(t => t.id === id)?.effects ?? TEXT_STYLE_EFFECTS
}

/** Effects that paint in their OWN fixed colours, pale ones (white, ice blue,
 *  near-white gold, yellow) — they wash out on a light background. Fire is
 *  left out: its body is red and orange, which still reads. */
export const PALE_EFFECTS: ReadonlySet<HighlightEffect> = new Set<HighlightEffect>(['shimmer', 'rainbow', 'gold', 'frost'])

/** Whether a computed CSS colour (`rgb(…)`, `rgba(…)` or `color(srgb …)`, as
 *  getComputedStyle reports them) is light — relative luminance above 0.5.
 *  Null when the string isn't one of those shapes. */
export function isLightComputedColor(css: string): boolean | null {
  let r: number, g: number, b: number
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(css)
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(css)
  if (rgb) { r = +rgb[1] / 255; g = +rgb[2] / 255; b = +rgb[3] / 255 }
  else if (srgb) { r = +srgb[1]; g = +srgb[2]; b = +srgb[3] }
  else return null
  const lin = (v: number) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.5
}

// A font name lands inside CSS, so anything that could close the string or the
// rule goes. Real font names never contain these.
function cleanFont(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.replace(/['"\\;{}<>]/g, '').trim()
  return s || undefined
}

/** One style, validated field by field. Unknown or out-of-range values are
 *  dropped (never clamped into something the player didn't pick), so a
 *  hand-edited profile can't break a render. Returns null when nothing is set.
 *  With `id`, an effect that kind doesn't offer is dropped too. */
export function coerceTextStyle(raw: unknown, id?: TextStyleId): TextStyle | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: TextStyle = {}
  const font = cleanFont(r.font)
  if (font) out.font = font
  if (typeof r.size === 'number' && Number.isFinite(r.size) && r.size !== 100) {
    out.size = Math.round(Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, r.size)))
  }
  if (r.weight === 'normal' || r.weight === 'bold') out.weight = r.weight
  if (typeof r.italic === 'boolean') out.italic = r.italic
  if (r.caps === 'small-caps' || r.caps === 'uppercase') out.caps = r.caps
  if (typeof r.effect === 'string' && r.effect !== 'none' && EFFECTS.has(r.effect)
      && (!id || effectsFor(id).includes(r.effect as HighlightEffect))) out.effect = r.effect as HighlightEffect
  return Object.keys(out).length ? out : null
}

/** The whole map, keeping only known kinds that have something set. */
export function coerceTextStyles(raw: unknown): TextStyles {
  const out: TextStyles = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!IDS.has(id)) continue
    const s = coerceTextStyle(v, id as TextStyleId)
    if (s) out[id as TextStyleId] = s
  }
  return out
}

/** The CSS declarations for one style, or '' when it sets none of them. */
export function textStyleDeclarations(s: TextStyle, resolveFont: (f: string) => string): string {
  const d: string[] = []
  if (s.font) d.push(`font-family: ${resolveFont(s.font)}`)
  if (s.size) d.push(`font-size: ${s.size}%`)
  if (s.weight === 'bold') d.push('font-weight: var(--ui-bold-weight)')
  if (s.weight === 'normal') d.push('font-weight: var(--game-text-weight, 400)')
  if (s.italic === true) d.push('font-style: italic')
  if (s.italic === false) d.push('font-style: normal')
  if (s.caps === 'small-caps') d.push('font-variant-caps: small-caps')
  if (s.caps === 'uppercase') d.push('text-transform: uppercase')
  return d.join('; ')
}

/** The generated stylesheet. The doubled attribute raises specificity just
 *  enough to win over panels.css's own `[data-preset]` rules without leaning
 *  on source order; `:not(.text-line--mono *)` keeps mono tables aligned.
 *
 *  `[data-ts]` is the wrapper renderSegmentFull puts round a segment that a
 *  highlight or a contact name SPLIT into runs: the matched runs carry no
 *  `data-preset`, so without it "Vayne" (a contact) would drop out of a speech
 *  style while " says," kept it. The unmatched runs inside that wrapper carry
 *  the preset again, so their size is reset to 100% or it would compound (150%
 *  of 150%); every other declaration is the same value twice and harmless. */
export function textStylesCss(styles: TextStyles, resolveFont: (f: string) => string): string {
  const rules: string[] = []
  for (const t of TEXT_STYLE_TARGETS) {
    const s = styles[t.id]
    if (!s) continue
    const decl = textStyleDeclarations(s, resolveFont)
    if (!decl) continue
    const sel = [
      `[data-preset="${t.id}"][data-preset]:not(.text-line--mono *)`,
      `[data-ts="${t.id}"]:not(.text-line--mono *)`,
      ...(t.alsoSelectors ?? []),
    ]
    rules.push(`${sel.join(', ')} { ${decl} }`)
    // Same specificity as the first selector and LATER in the sheet, so it wins.
    if (s.size) rules.push(`[data-ts="${t.id}"] [data-preset="${t.id}"][data-preset] { font-size: 100% }`)
  }
  return rules.join('\n')
}

// ── The per-window store ────────────────────────────────────────────────────

let current: TextStyles = {}
let currentKey = '{}'
// Only EFFECTS need rows to re-render; everything else is the stylesheet, which
// repaints by itself. Bumping the version on a size click would re-run the whole
// highlight ruleset over every mounted row (main window, panels, Overview) on
// every click of −/+.
let effectKey = JSON.stringify(TEXT_STYLE_TARGETS.map(() => ''))
let version = 0
const listeners = new Set<() => void>()
const STYLE_ID = 'lb-text-styles'

/** Apply a character's text styles to this window: the stylesheet, and a
 *  version bump so memoized rows repaint their effects. A no-op when nothing
 *  changed, which is the common case (it runs on every settings apply). */
export function applyTextStyles(raw: unknown, resolveFont: (f: string) => string): void {
  const styles = coerceTextStyles(raw)
  const key = JSON.stringify(styles)
  if (key === currentKey && document.getElementById(STYLE_ID)) return
  current = styles
  currentKey = key
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = textStylesCss(styles, resolveFont)
  const nextEffectKey = JSON.stringify(TEXT_STYLE_TARGETS.map(t => styles[t.id]?.effect ?? ''))
  if (nextEffectKey === effectKey) return
  effectKey = nextEffectKey
  version++
  for (const l of listeners) l()
}

/** The effect a preset wears, and the colour to draw it in. Null when none. */
export function presetEffect(preset: string | undefined): { effect: HighlightEffect; colorVar: string } | null {
  if (!preset) return null
  const s = current[preset as TextStyleId]
  if (!s?.effect) return null
  const t = TEXT_STYLE_TARGETS.find(x => x.id === preset)
  return t ? { effect: s.effect, colorVar: t.colorVar } : null
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
/** The current version — what `useTextStylesVersion` reports. */
export const getVersion = () => version

/** A number that changes whenever the text styles do. A memoized row calls it
 *  so it repaints an effect when the player changes one in Settings. */
export function useTextStylesVersion(): number {
  return useSyncExternalStore(subscribe, getVersion)
}
