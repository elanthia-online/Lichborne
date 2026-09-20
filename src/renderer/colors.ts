// Named colors — the managed, curated palette (DESIGN §37.2, v0.14.6).
// THREE tiers, resolved in precedence order (first hit wins):
//
//   1. CURATED  — Lichborne's promoted 16: hand-tuned for READABILITY on game
//                 backgrounds (our `red` is #ff5050, not CSS's harsh #ff0000).
//                 These are what /colors shows and the palette chips offer.
//   2. CUSTOM   — the user's palette ("Your colors"): made in Automations →
//                 Colors, from any color field, or `/colors add "Buff drop"
//                 #ff9040`. App-wide (a color vocabulary is shared, like
//                 themes): localStorage working copy + SharedProfile.customColors
//                 → _shared.yaml (Principle #1). May shadow WEB names, never
//                 CURATED ones. Since v0.19.8 (F115) these are LINKED, not
//                 copied — see the custom-color section below.
//   3. WEB      — the full standard CSS/web color set (~148 names). This is
//                 GENIE'S vocabulary (its ColorCode.cs accepts every .NET
//                 KnownColor web name — "Lime", "DodgerBlue", …), so DR players
//                 keep their muscle memory. Accepted everywhere, not listed in
//                 /colors (a wall of 148 rows) — the list mentions they work.
//
// All lookups use own-property guards (a bare obj[t] walks the prototype
// chain — "constructor" would resolve to a FUNCTION; a real caught bug).
// Node-safe: the tmp harness bundles this module, so every localStorage /
// window access is existence-guarded.

import { safeSetItem } from './characterScope'

export const CURATED_COLORS: Record<string, string> = {
  red: '#ff5050', green: '#4caf50', blue: '#4f9cff', yellow: '#e8c840',
  orange: '#ff9040', purple: '#b070ff', pink: '#ff70b0', cyan: '#40d0e0',
  teal: '#2fb0a0', gold: '#ffd700', white: '#ffffff', black: '#000000',
  gray: '#909090', grey: '#909090', brown: '#a06a40', magenta: '#e050e0',
  lime: '#a0e040',
}

// The standard CSS named colors (the web/X11 set — Genie-compatible input).
export const WEB_COLORS: Record<string, string> = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
  azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', blanchedalmond: '#ffebcd',
  blueviolet: '#8a2be2', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc',
  crimson: '#dc143c', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgrey: '#a9a9a9', darkgreen: '#006400', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
  darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', goldenrod: '#daa520',
  greenyellow: '#adff2f', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
  indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
  lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3', lightgreen: '#90ee90', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', limegreen: '#32cd32', linen: '#faf0e6',
  maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3',
  mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa',
  mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orangered: '#ff4500',
  orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f',
  plum: '#dda0dd', powderblue: '#b0e0e6', rosybrown: '#bc8f8f', royalblue: '#4169e1',
  saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb',
  slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', thistle: '#d8bfd8',
  tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
  whitesmoke: '#f5f5f5', yellowgreen: '#9acd32',
}

// ── Custom colors: the linked palette (F115, v0.19.8 — DESIGN §49) ───────────
//
// Choosing one of YOUR colors in a color field stores a LINK, not a copy of
// the hex: `var(--lb-color-<id>, #fallback)`. Every window defines
// `--lb-color-<id>` on its root from the palette (`applyPaletteVars`), and
// every place that paints a color already puts the field's string straight
// into inline CSS — so a linked color needed no render-path change, costs
// nothing per line, and editing the color repaints everything using it.
//
// The FALLBACK is the hex at link time. If the entry is ever gone (deleted for
// good, or a Transfer to a machine without it), the text keeps that color
// instead of going blank — Principle #3.
//
// `id` is the identity, so a rename keeps every link. Entries saved before
// v0.19.8 have no id; `coerceCustomColors` gives them `legacyColorId(name)`,
// which is DETERMINISTIC — the same id on every load and every machine even
// before it is saved, so a link minted in one session still resolves in the
// next.
//
// `retired`: removing a color only retires it. It leaves the pickers and name
// resolution, but its variable stays defined, so nothing already using it
// changes color. A permanent delete is a separate, explicit act.
//
// Three places genuinely need a concrete hex rather than a link — a native
// color input, luminance math, and a trigger echo's text-segment fg — and they
// go through `colorHex`. Themes never link: a theme must not depend on the
// palette existing (§37.2), so ThemeEditor keeps calling `resolveColor`.
export interface CustomColor {
  id: string
  name: string
  hex: string
  retired?: boolean
}

export const COLOR_VAR_PREFIX = '--lb-color-'
/** Same-window change event (a `storage` event never fires in the writer). */
export const PALETTE_CHANGED_EVENT = 'lichborne:palette-changed'

const CUSTOM_KEY = 'lichborne.customColors'
const hasOwn = (obj: object, k: string) => Object.prototype.hasOwnProperty.call(obj, k)
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const LINK_RE = /^\s*var\(\s*--lb-color-([A-Za-z0-9_-]+)\s*(?:,\s*([^)]*?)\s*)?\)\s*$/

// In-memory cache of the custom list; invalidated on save and on cross-window
// storage events so resolveColor stays cheap on hot paths. Its identity only
// changes when the palette does, which is what lets `usePalette` hand it to
// useSyncExternalStore as a snapshot (pitfall #129).
let customCache: CustomColor[] | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== CUSTOM_KEY) return
    customCache = null
    applyPaletteVars()
    notifyPaletteChanged()
  })
}

function notifyPaletteChanged(): void {
  if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
    document.dispatchEvent(new CustomEvent(PALETTE_CHANGED_EVENT))
  }
}

/** The id an entry saved before v0.19.8 is known by — deterministic from its name. */
export function legacyColorId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'color'
}

/** A fresh id that isn't in `existing`. */
export function newColorId(existing: CustomColor[]): string {
  const taken = new Set(existing.map(c => c.id))
  for (;;) {
    const id = 'c' + Math.random().toString(36).slice(2, 10)
    if (id.length > 4 && !taken.has(id)) return id
  }
}

/**
 * A stored hex made safe to paint with: expanded, lowercased, alpha dropped
 * (a color input can't show it), and an unusable value repaired to a neutral
 * grey rather than dropped — the name and id survive so the Colors tab can fix
 * it. An invalid hex used to ride through into `colorLink`, which minted
 * `var(--lb-color-x, not a color)`: the variable is undefined for a color that
 * isn't in the list, so the invalid fallback was the only value CSS had and the
 * whole declaration was dropped, painting the text unstyled.
 */
function normalizeHex(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (HEX_RE.test(t)) return expandHex(t)
  const alpha = /^#([0-9a-f]{6})[0-9a-f]{2}$/.exec(t)   // #rrggbbaa → #rrggbb
  if (alpha) return '#' + alpha[1]
  return '#888888'
}

/**
 * Normalize stored entries — localStorage, `_shared.yaml`, a Transfer bag.
 * Never throws, never drops a valid entry. Unknown fields ride through (a
 * spread, not a rebuild — pitfall #121).
 *
 * TWO PASSES, and the order is load-bearing: every explicit stored id is
 * RESERVED first, then the id-less entries get name slugs. One pass let an
 * earlier id-less entry take a slug (`buff-drop-2`) that a later entry already
 * owned as its real id, renaming that entry — and every rule linked to it then
 * resolved to nothing and froze at its fallback hex, which is exactly what the
 * id indirection exists to prevent.
 */
export function coerceCustomColors(raw: unknown): CustomColor[] {
  if (!Array.isArray(raw)) return []
  const rows: { r: Record<string, unknown>; id: string | null; name: string }[] = []
  const taken = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    if (typeof r.name !== 'string' || typeof r.hex !== 'string' || !r.name.trim()) continue
    // A tidy name is the cross-machine identity (mergeCustomColors matches on
    // it) and what every by-name lookup compares against, so a stored
    // "  Ember  " must not be a color you can see but can never name.
    const name = tidyColorName(r.name)
    const id = typeof r.id === 'string' && ID_RE.test(r.id) && !taken.has(r.id) ? r.id : null
    if (id) taken.add(id)
    rows.push({ r, id, name })
  }
  const out: CustomColor[] = []
  for (const row of rows) {
    let id = row.id
    if (!id) {
      id = legacyColorId(row.name)
      if (taken.has(id)) {
        let n = 2
        while (taken.has(`${id}-${n}`)) n++
        id = `${id}-${n}`
      }
      taken.add(id)
    }
    const entry = { ...row.r, id, name: row.name, hex: normalizeHex(row.r.hex as string) } as CustomColor
    if (row.r.retired !== true) delete entry.retired
    out.push(entry)
  }
  return out
}

/** Every entry, retired included (links to a retired color must still resolve). */
export function loadCustomColors(): CustomColor[] {
  if (customCache) return customCache
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    customCache = coerceCustomColors(raw ? JSON.parse(raw) : [])
  } catch { customCache = [] }
  return customCache
}

/** The colors to OFFER — the palette minus retired entries. */
export function activeCustomColors(list: CustomColor[] = loadCustomColors()): CustomColor[] {
  return list.filter(c => !c.retired)
}

export function saveCustomColors(list: CustomColor[]): void {
  customCache = coerceCustomColors(list)
  if (typeof localStorage !== 'undefined') safeSetItem(CUSTOM_KEY, JSON.stringify(customCache))
  applyPaletteVars()
  notifyPaletteChanged()
}

// The ids whose variable this window has set, so a permanently deleted color's
// variable is removed rather than left painting a stale value.
let appliedVarIds = new Set<string>()

/**
 * Define `--lb-color-<id>` on this window's root for every palette entry,
 * retired ones included. Runs at module load (the last statement of this file,
 * so every constant above exists — the Moons TDZ lesson), after every save,
 * and on a cross-window `storage` event. Theme application only ever calls
 * setProperty for its own variables, so these survive a theme switch.
 */
export function applyPaletteVars(): void {
  if (typeof document === 'undefined') return
  const style = document.documentElement?.style
  if (!style || typeof style.setProperty !== 'function') return
  const next = new Set<string>()
  for (const c of loadCustomColors()) {
    if (!HEX_RE.test(c.hex.trim())) continue
    style.setProperty(COLOR_VAR_PREFIX + c.id, c.hex.trim())
    next.add(c.id)
  }
  for (const id of appliedVarIds) if (!next.has(id)) style.removeProperty(COLOR_VAR_PREFIX + id)
  appliedVarIds = next
}

/** Strict #hex check (what /colors add requires for the value). */
export function isHexColor(token: string): boolean {
  return HEX_RE.test(token.trim())
}

/** '#abc' → '#aabbcc'; anything else unchanged. A native color input only takes six digits. */
export function expandHex(hex: string): string {
  const m = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex.trim())
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : hex.trim().toLowerCase()
}

export function findCustomColor(id: string): CustomColor | null {
  return loadCustomColors().find(c => c.id === id) ?? null
}

/** One of your colors by name (case-insensitive). Retired entries only when asked. */
export function findCustomColorByName(name: string, includeRetired = false): CustomColor | null {
  const t = tidyColorName(name).toLowerCase()
  return loadCustomColors().find(c => (includeRetired || !c.retired) && c.name.toLowerCase() === t) ?? null
}

/** The value a color field stores to follow `c`. */
export function colorLink(c: CustomColor): string {
  return `var(${COLOR_VAR_PREFIX}${c.id}, ${expandHex(c.hex)})`
}

/** Parse a stored link. `fallback` is null when absent or not a hex. */
export function parseColorLink(value: string | null | undefined): { id: string; fallback: string | null } | null {
  if (!value || value.indexOf(COLOR_VAR_PREFIX) < 0) return null
  const m = LINK_RE.exec(value)
  if (!m) return null
  const fb = m[2]?.trim()
  return { id: m[1], fallback: fb && HEX_RE.test(fb) ? fb : null }
}

/** The palette entry a value links to (retired included), or null. */
export function linkedColor(value: string | null | undefined): CustomColor | null {
  const link = parseColorLink(value)
  return link ? findCustomColor(link.id) : null
}

/**
 * A concrete '#hex' for a color value, for the few consumers that need one.
 * A link resolves through the palette, then its fallback; a color name
 * resolves; 'transparent', '' and free text (a `$variable`) give null.
 */
export function colorHex(value: string | null | undefined): string | null {
  if (!value) return null
  const link = parseColorLink(value)
  if (link) {
    const c = findCustomColor(link.id)
    return c && HEX_RE.test(c.hex.trim()) ? c.hex.trim() : link.fallback
  }
  const t = value.trim()
  if (!t || t.toLowerCase() === 'transparent') return null
  return resolveColor(t)
}

/** A short label for a color value: a link's color NAME, else the value itself. */
export function colorLabel(value: string | null | undefined): string {
  const c = linkedColor(value)
  if (c) return c.name
  const link = parseColorLink(value)
  return link ? (link.fallback ?? 'a removed color') : (value ?? '')
}

/**
 * Walk every STRING in a value tree. The two functions below both ask
 * `parseColorLink` whether a string IS a link, rather than running a regex over
 * the whole tree: a regex also matched `--lb-color-…` inside ordinary text, so
 * a rewrite could corrupt a rule's PATTERN, and the `JSON.parse(JSON.stringify())`
 * it needed dropped `undefined` properties and turned Dates into strings across
 * the entire imported bundle.
 * `map` returning null leaves the string as it is; arrays and plain objects are
 * rebuilt, anything else (a Date, a class instance) passes through untouched.
 */
function walkStrings<T>(data: T, map: (s: string) => string | null): T {
  if (typeof data === 'string') return (map(data) ?? data) as unknown as T
  if (Array.isArray(data)) return data.map(v => walkStrings(v, map)) as unknown as T
  if (data && typeof data === 'object' && Object.getPrototypeOf(data) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(data as Record<string, unknown>)) {
      out[k] = walkStrings((data as Record<string, unknown>)[k], map)
    }
    return out as unknown as T
  }
  return data
}

/** Every palette id linked anywhere in a value (a Transfer bag, a rule list). */
export function collectColorLinkIds(data: unknown): Set<string> {
  const ids = new Set<string>()
  walkStrings(data, s => { const l = parseColorLink(s); if (l) ids.add(l.id); return null })
  return ids
}

/** Rewrite link ids through `remap` (from → to) anywhere in a value. */
export function remapColorLinks<T>(data: T, remap: Record<string, string>): T {
  if (Object.keys(remap).length === 0) return data
  return walkStrings(data, s => {
    const link = parseColorLink(s)
    if (!link || !hasOwn(remap, link.id)) return null
    return `var(${COLOR_VAR_PREFIX}${remap[link.id]}${link.fallback ? `, ${link.fallback}` : ''})`
  })
}

/**
 * Merge incoming palette entries (a Transfer) into `local`.
 *  - same NAME          → the same color; `takeValues` copies the incoming hex
 *                         and un-retires it. A differing incoming id is rewritten
 *                         to the local one, so it goes in `remap`.
 *  - new name           → added; if its id is already taken here by a DIFFERENT
 *                         color it gets a fresh one, also via `remap`.
 * `takeValues` is the Named Colors category ("the imported value wins"); the
 * colors a bundle's rules merely link to are added when missing but never
 * overwrite yours.
 *
 * The NAME is the identity ACROSS machines; an id is only an identity WITHIN
 * one. Matching by id first let an id-less bundle — whose ids are slugs minted
 * from names, `-2` disambiguators and all — collide with an unrelated local
 * color and overwrite its value, repainting every rule linked to it in a
 * stranger's color.
 */
export function mergeCustomColors(
  local: CustomColor[], incoming: CustomColor[], takeValues: boolean,
): { list: CustomColor[]; remap: Record<string, string>; changed: boolean } {
  const list = local.map(c => ({ ...c }))
  const remap: Record<string, string> = {}
  let changed = false
  for (const raw of incoming) {
    const inc = { ...raw, name: tidyColorName(raw.name), hex: normalizeHex(raw.hex) }
    // Tidy BOTH sides: `local` normally arrives through coerceCustomColors, but
    // a caller handing over a raw list must not mint a near-duplicate entry that
    // differs only by whitespace.
    const match = list.find(c => tidyColorName(c.name).toLowerCase() === inc.name.toLowerCase())
    if (match) {
      if (match.id !== inc.id) remap[inc.id] = match.id
      if (takeValues) {
        if (match.hex !== inc.hex) { match.hex = inc.hex; changed = true }
        // Taking the exporter's palette means taking it whole: a removed local
        // color of that name comes back, as `/colors add` already does.
        if (match.retired) { delete match.retired; changed = true }
      }
      continue
    }
    const id = list.some(c => c.id === inc.id) ? newColorId(list) : inc.id
    if (id !== inc.id) remap[inc.id] = id
    list.push({ ...inc, id })
    changed = true
  }
  return { list, remap, changed }
}

/**
 * Resolve a color token to '#hex', or null. Precedence: curated > custom >
 * web > raw #hex. Case-insensitive. Always a HEX — the theme editor's resolver,
 * where a link must never be stored (§37.2). Retired colors don't resolve.
 */
export function resolveColor(token: string): string | null {
  const t = token.trim().toLowerCase()
  if (hasOwn(CURATED_COLORS, t)) return CURATED_COLORS[t]
  const custom = findCustomColorByName(t)
  if (custom) return custom.hex
  if (hasOwn(WEB_COLORS, t)) return WEB_COLORS[t]
  if (HEX_RE.test(t)) return t
  return null
}

/**
 * Like `resolveColor`, but one of YOUR colors resolves to a LINK, so the field
 * follows later edits to it. Built-in and web names and #hex still give a hex
 * (a built-in never changes, so there is nothing to follow). What rule fields
 * and the slash commands use.
 */
export function resolveColorChoice(token: string): string | null {
  const t = token.trim().toLowerCase()
  if (!t) return null
  if (hasOwn(CURATED_COLORS, t)) return CURATED_COLORS[t]
  const custom = findCustomColorByName(t)
  if (custom) return colorLink(custom)
  if (hasOwn(WEB_COLORS, t)) return WEB_COLORS[t]
  if (HEX_RE.test(t)) return t
  return null
}

export interface ColorSuggestion {
  name: string
  hex: string
  /** What picking it stores: a link for one of yours, a hex otherwise. */
  value: string
  kind: 'yours' | 'built-in' | 'web'
}

/**
 * Suggestions for a color name being TYPED into a color field (ColorField's
 * type-ahead). Your colors first — they're the ones that link — then the
 * built-ins, then web names; within each group a prefix match beats a match
 * elsewhere in the name. Your colors match anywhere in the name ("drop" finds
 * "Buff drop"); built-in and web names only by prefix, and web names only from
 * 3 characters, so typing "b" isn't a wall of blues. Nothing for a #hex, a
 * `$variable`, a link or an empty box. Capped at `limit`.
 */
export function suggestColors(query: string, palette: CustomColor[] = loadCustomColors(), limit = 8): ColorSuggestion[] {
  const q = tidyColorName(query).toLowerCase()
  if (!q || q.startsWith('#') || q.startsWith('$') || parseColorLink(q)) return []
  const byPrefixFirst = <T extends { name: string }>(list: T[]) =>
    [...list].sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))

  const yours = byPrefixFirst(activeCustomColors(palette).filter(c => c.name.toLowerCase().includes(q)))
    .map(c => ({ name: c.name, hex: expandHex(c.hex), value: colorLink(c), kind: 'yours' as const }))
  const builtIns = Object.entries(CURATED_COLORS)
    .filter(([n]) => n !== 'grey' && n.startsWith(q))
    .map(([n, h]) => ({ name: n, hex: h, value: h, kind: 'built-in' as const }))
  const web = q.length < 3 ? [] : Object.entries(WEB_COLORS)
    .filter(([n]) => n.startsWith(q) && !hasOwn(CURATED_COLORS, n))
    .map(([n, h]) => ({ name: n, hex: h, value: h, kind: 'web' as const }))

  return [...yours, ...builtIns, ...web].slice(0, limit)
}

/**
 * Editor text-field normalizer: resolve a typed color NAME on COMMIT
 * (blur/Enter — never on change, or typing "red…" would hijack "rebeccapurple"
 * mid-word). One of your colors becomes a link. Non-names ('transparent', a
 * partial hex, '', a `$variable`, an existing link) pass through unchanged.
 */
/**
 * The ONE answer to "is this typed token a hex, and what is it?" — `#rgb`,
 * `#rrggbb`, and the bare `rrggbb` / `rgb` a user pastes without the hash, all
 * expanded to a lowercase `#rrggbb`. Null for anything else.
 *
 * It exists because there were two answers and they disagreed: ColorField's
 * `commitDraft` accepted a bare six-digit hex but rejected `#fff`, while
 * `normalizeColorInput` did the exact opposite — so the same keystrokes gave
 * different results depending on which host you were typing in, and one of
 * those results was dead text that painted nothing. `hexLuminance` below
 * already accepted a bare hex, so the file was arguing with itself. Both
 * callers now ask this (pitfall #127).
 */
export function hexFromTyped(token: string): string | null {
  const t = token.trim()
  const body = t.startsWith('#') ? t : '#' + t
  return HEX_RE.test(body) ? expandHex(body) : null
}

export function normalizeColorInput(value: string, opts?: { link?: boolean }): string {
  const t = value.trim()
  if (!t || t.startsWith('#') || parseColorLink(t)) return value
  // `link: false` COPIES instead: the name resolves to the hex it stands for
  // right now, with nothing left pointing at the palette. That is what the
  // Theme Editor wants — a theme is handed to other people, so it must not
  // depend on a palette entry only its author has (DESIGN 37.2, 49).
  // A NAME still wins — `red` is the curated red, not a hex — but a bare
  // `3fb950` now resolves instead of being stored as text that paints nothing.
  const named = opts?.link === false ? resolveColor(t) : resolveColorChoice(t)
  return named ?? hexFromTyped(t) ?? value
}

/** Shared tooltip for rule-editor color text fields (ColorField). */
export const COLOR_INPUT_TITLE = 'A #hex value or a color name (red, lime, or one of yours). One of your colors stays linked, so changing it later changes this too.'

/** The Theme Editor's version: a theme always stores a fixed hex, never a link (§37.2). */
export const THEME_COLOR_INPUT_TITLE = 'A #hex value or a color name (red, lime, or one of yours). Names become a fixed #hex when you leave the field.'

/** Perceptual luminance of a '#hex' color, 0 (black) … 1 (white). */
export function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(hex.trim())
  if (!m) return 0.5
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Black or white, whichever reads better as text ON a fill of `hex` (WCAG 2
 * contrast). For text drawn on top of a USER'S color, where no theme variable
 * can know what's underneath — the Colors tab's "as a background" preview. The
 * two literals are the data exception to Principle #4: the fill is data, so the
 * ink has to be picked from the data too.
 */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(hex.trim())
  if (!m) return '#000000'
  const full = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const lin = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000000' : '#ffffff'
}

/**
 * Theme-contrast backing for color SWATCH text (the /colors rows, the palette
 * color chips): color names are drawn IN their color, so on a dark theme
 * `black`/`navy` vanish and on a light theme `white`/`ivory`/`snow` do. When a
 * color's luminance sits too close to the surface it renders on, return a
 * neutral backing chip color ('#hex') to draw behind it — light colors get a
 * dark chip, dark colors a light one — else null (most colors need nothing).
 * `surfaceVar` is the CSS var of the surface (--bg-app for the game window,
 * --bg-raised for the palette popover). DOM-guarded for the node harness,
 * where the fallback assumes a dark surface (the default theme).
 */
export function contrastBackingFor(hex: string, surfaceVar = '--bg-app'): string | null {
  let surfaceL = 0.1 // dark-theme assumption when no DOM (harness) or unparsable var
  if (typeof document !== 'undefined') {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(surfaceVar).trim()
    if (raw) surfaceL = hexLuminance(raw)
  }
  const colorL = hexLuminance(hex)
  if (Math.abs(colorL - surfaceL) >= 0.18) return null
  return surfaceL > 0.5 ? '#2a2e35' : '#e9e9e9'
}

/** Trim and collapse inner whitespace — the form a color name is stored and compared in. */
export function tidyColorName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Format rules for a color name (uniqueness is the caller's job — it knows the
 * list and whether it is renaming). Spaces are allowed since v0.19.8 ("Buff
 * drop" reads better than "buffdrop"); a slash command quotes them. A name may
 * not shadow a built-in, which always wins name resolution.
 */
export function validateCustomColorName(name: string): string | null {
  const n = tidyColorName(name)
  if (n.length < 2) return 'Give the color a name of at least 2 characters.'
  if (n.length > 24) return 'Color names are up to 24 characters.'
  if (!/^[A-Za-z][A-Za-z0-9 '-]*$/.test(n)) return 'Color names start with a letter and use letters, numbers, spaces, dashes or apostrophes.'
  if (hasOwn(CURATED_COLORS, n.toLowerCase())) return `"${n}" is a built-in color. Pick another name.`
  return null
}

// Define the palette's variables before anything renders. LAST on purpose:
// every constant this reaches is declared above (pitfall: a module-level call
// that reaches a later `const` is a load-time TDZ crash).
applyPaletteVars()
