// Settings — per-character display & accessibility settings, and how they reach the DOM.
//
// `AppSettings` is the PER-CHARACTER settings record: game font size / family
// / line height, large print, high contrast, colour-blind mode, epilepsy-safe,
// vitals/icon bar positions, compact vitals / compact exp, timer style, URL
// auto-linking + web-link safety (F23), map animations, text weight (B113),
// and the per-panel font overrides (F31, `panelFontSizes`). Each field's own
// comment carries its history. Stored under `scopedKey(character,'settings')`
// and loaded by spreading the saved JSON over DEFAULT_SETTINGS, so a field a
// previous version never wrote just takes its default. `loadSettings()` with
// NO character is the boot path and returns pure defaults. Session Log
// preferences are deliberately NOT here — they're app-wide (see
// sessionLogSettings.ts).
//
// `applySettingsToDOM` is the single writer of the game-area CSS vars
// (`--game-font-size` / `--game-line-height` / `--game-font-family` / the
// text-weight pair), the large-print root font size, `data-epilepsy-safe`,
// and then the two OVERLAYS — high contrast first, colour-blind after it so
// the more specific semantics win. Those overlay keys are the SAME custom
// properties the theme sets (`--bg-*`, `--text-*`, `--vital-*`, …), so any
// theme write must be followed by a re-apply of this function or the overlay
// is silently erased. `initSettings` runs it once at boot with defaults.

import type { ThemeVars } from './themes'
// Type-only, so it is erased at compile time and adds no runtime dependency
// on the (much larger) highlights module.
import type { HighlightEffect } from './highlights'

export interface AppSettings {
  fontSize: number       // game text size in px, 10–24
  fontFamily: string     // legacy preset key OR raw installed font name
  lineHeight: number     // 1.2 / 1.5 / 1.8 / 2.0
  largePrint: boolean
  highContrast: boolean
  colorBlind: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia'
  epilepsySafe: boolean
  vitalsBarPosition: 'top' | 'bottom'
  iconBarPosition: 'top' | 'bottom'
  // v0.10.0 (Rakkor): dense vitals strip — ~half-height bars with
  // first-letter labels ("H: 100%") instead of the full "Health 100%".
  // Reclaims ~half a text line. Default OFF so no existing user's look
  // changes unexpectedly. Per-character; rides the Display & Accessibility
  // Transfer category automatically (it's a field on `settings`).
  compactVitals: boolean
  // Compact, text-forward Experience panel (Rakkor/Morress) — Skill · Ranks · %
  // · (n/34) with simplified top/bottom summary bars, no progress bars/pickers.
  compactExp: boolean
  timerStyle: 'bar' | 'chips'
  autoLinkUrls: boolean
  // v0.8.1 (F23): when true, external URL clicks route through Simu's
  // bounce page (https://www.play.net/bounce/redirect.asp?URL=...) which
  // shows a "you are leaving Play.net" confirmation. Matches Genie's
  // `bWebLinkSafety` setting. On by default — safer for users who don't
  // trust every script-emitted URL.
  webLinkSafety: boolean
  mapAnimations: boolean   // Genie Maps motion — per-room category effects AND the camera glide; on by default
  // v0.8.4 (B113): text-weight offset for game text. Positive values
  // (0.2–0.6) add faux-bold via -webkit-text-stroke to compensate for
  // Chromium DirectWrite's lighter rendering vs Frostbite's GDI ClearType
  // — most useful on light themes where DirectWrite's grey fringe reads
  // as "not black enough" even at #000. Negative values (-0.4, -0.2) drop
  // the CSS font-weight below the default 400 (-0.4 → 200, -0.2 → 300).
  // The negative path only renders thinner on fonts that ship light
  // weights — Cascadia Code (default) has 200/300/400/500/600/700;
  // Consolas/Lucida Console fall back to 400 (no visible change). 0 is
  // the renderer's default; UI caps at ±0.6 (above ~0.5 the stroke looks
  // blurry rather than bold).
  textWeight: number
  // v0.8.5 (F31): per-panel font-size overrides keyed by tab id. Tab ids
  // are stable across zone moves, so this travels with the panel even
  // if the user drags it from Main-Top to Top-Right. Unset (no entry)
  // means "use the global --game-font-size." Bounds 8–24 enforced at
  // the UI layer. Persists via the existing settings save pipeline.
  panelFontSizes: Record<string, number>
  // v0.19.7: the text effect worn by the "Lichborne" wordmark in the app bar,
  // reusing the SAME `HighlightEffect` vocabulary as highlights and contact
  // templates — one effect system, one stylesheet (pitfall #127). 'none' is
  // the default and means "inherit the theme", i.e. the accent / accent-dim
  // two-tone the brand has always had. Purely cosmetic: it identifies which
  // character you are looking at, so it is per-character on purpose, and the
  // app bar reads the ACTIVE session's value through SessionStatus.
  brandEffect: HighlightEffect
  // NOTE: Session Log preferences are NOT here — they are app-wide, not
  // per-character. See sessionLogSettings.ts (stored in _shared.yaml).
}

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 12,
  // 'cascadia' is a key into FONT_FAMILIES — resolves to
  // "'Cascadia Code', 'Fira Code', 'Consolas', monospace". Cascadia Code
  // is bundled with Windows Terminal (and stock with Windows 11) so it's
  // present on most installs. Critically it ships with weights 200–700
  // (200/300/350/400/500/600/700) — Consolas only has 400 and 700, which
  // made every "semibold" emphasis in the UI fall back to full-bold and
  // produced the "everything is too bold" reports. Cascadia honours the
  // intermediate weights so the hierarchy reads softer (v0.7.1 follow-up).
  // Users on Consolas explicitly (via existing profile) keep it; only
  // fresh installs / unset characters get the new default.
  fontFamily: 'cascadia',
  lineHeight: 1.2,
  largePrint: false,
  highContrast: false,
  colorBlind: 'none',
  epilepsySafe: false,
  vitalsBarPosition: 'bottom',
  iconBarPosition: 'top',
  compactVitals: false,
  compactExp: false,
  timerStyle: 'chips',
  autoLinkUrls: true,
  webLinkSafety: true,
  mapAnimations: true,
  textWeight: 0,
  panelFontSizes: {},
  // Static — the wordmark takes its colours from the theme, as it always has.
  brandEffect: 'none',
}

// v0.18.0 cross-platform: Menlo (macOS) and DejaVu/Liberation (Linux) appended
// to the monospace stacks — Cascadia/Consolas/Lucida are Windows fonts, and
// without named fallbacks the other platforms fell to the browser's generic
// monospace pick. Appended AFTER the Windows names so Windows rendering is
// byte-identical.
// B348: the cross-platform TAILS, shared by the presets below and by any raw
// font name (a Windows font arriving via Transfer, or the Segoe UI / Georgia /
// Lucida Console that SettingsPanel's LEGACY_KEYS migrates to). Declared ABOVE
// FONT_FAMILIES, which builds from them at module load.
const MONO_TAIL  = "'Menlo', 'DejaVu Sans Mono', monospace"
const SANS_TAIL  = "system-ui, -apple-system, sans-serif"
const SERIF_TAIL = "'Times New Roman', 'Liberation Serif', serif"

export const FONT_FAMILIES: Record<string, string> = {
  cascadia:  `'Cascadia Code', 'Fira Code', 'Consolas', ${MONO_TAIL}`,
  terminal:  "'Lucida Console', 'Courier New', 'Menlo', 'Liberation Mono', monospace",
  sansserif: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif:     `Georgia, ${SERIF_TAIL}`,
}

// B348: which tail a RAW font name gets. Before this every raw name fell to
// bare `monospace`, so a sans or serif preference rendered in the platform's
// generic monospace wherever the named font isn't installed (Segoe UI on a
// Mac). Mono keywords win first ("DejaVu Sans Mono" is mono, not sans); an
// unrecognised name keeps the mono tail, which is today's behaviour.
const SANS_FONTS = new Set([
  'segoe ui', 'segoe ui variable', 'arial', 'helvetica', 'helvetica neue', 'verdana',
  'tahoma', 'calibri', 'candara', 'corbel', 'trebuchet ms', 'lucida grande', 'ubuntu',
  'roboto', 'inter', 'cantarell', 'century gothic', 'sf pro', 'sf pro text',
  'sf pro display', 'san francisco',
])
const SERIF_FONTS = new Set([
  'georgia', 'times new roman', 'times', 'cambria', 'constantia', 'palatino',
  'palatino linotype', 'book antiqua', 'garamond', 'baskerville', 'charter', 'hoefler text',
])
function fontFallbackTail(name: string): string {
  const n = name.trim().toLowerCase()
  if (/\b(mono|code|console|courier|terminal|typewriter)\b/.test(n)) return MONO_TAIL
  if (SERIF_FONTS.has(n) || (/\bserif\b/.test(n) && !/\bsans\b/.test(n))) return SERIF_TAIL
  if (SANS_FONTS.has(n) || /\bsans\b/.test(n)) return SANS_TAIL
  return MONO_TAIL
}

/** The CSS font-family value for a stored setting: a preset key's chain, or a
 *  raw font name followed by the matching cross-platform tail (B348). */
export function resolveFontFamily(font: string): string {
  return FONT_FAMILIES[font] ?? `'${font}', ${fontFallbackTail(font)}`
}

export const FONT_FAMILY_LABELS: Record<string, string> = {
  cascadia:  'Cascadia Code (default)',
  terminal:  'Lucida Console',
  sansserif: 'System Sans-Serif',
  serif:     'Serif (Georgia)',
}

import { scopedKey } from './characterScope'

const storageKey = (character: string) => scopedKey(character, 'settings')

export function loadSettings(character?: string): AppSettings {
  // No character (boot path): return defaults. Character-scoped settings are
  // loaded once a GameWindow mounts for that character.
  if (!character) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(storageKey(character)) ?? '{}') }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export function saveSettings(character: string, s: AppSettings): void {
  localStorage.setItem(storageKey(character), JSON.stringify(s))
}

// ── High Contrast overlay vars ────────────────────────────────────────────

const HIGH_CONTRAST_VARS: Partial<ThemeVars> = {
  '--bg-app':    '#000000',
  '--bg-base':   '#000000',
  '--bg-raised': '#111111',
  '--bg-sunken': '#000000',
  '--bg-input':  '#000000',
  '--bg-hover':  '#1a1a1a',
  '--bg-active': '#000000',
  '--bg-btn':    '#111111',
  '--text-primary':   '#ffffff',
  '--text-secondary': '#ffffff',
  '--text-muted':     '#e0e0e0',
  '--text-dim':       '#c0c0c0',
  '--text-faint':     '#888888',
  '--border':        '#ffffff',
  '--border-subtle': '#888888',
  '--border-faint':  '#444444',
  '--accent':     '#ffff00',
  '--accent-dim': '#cccc00',
  '--accent-bg':  '#111100',
  '--preset-speech':   '#ffff00',
  '--preset-whisper':  '#cccc00',
  '--preset-thought':  '#00ffff',
  '--preset-roomname': '#ffffff',
  '--preset-roomdesc': '#e0e0e0',
  '--preset-bold':     '#ffffff',
  '--preset-expiry':   '#ff8800',
  '--preset-store':    '#00ff88',
  '--room-title-color':   '#ffffff',
  '--room-desc-color':    '#e0e0e0',
  '--room-section-color': '#aaaaaa',
  '--exit-text':       '#00ff88',
  '--exit-bg':         '#001a08',
  '--exit-border':     '#007730',
  '--exit-text-hover': '#88ffcc',
  '--exit-bg-hover':   '#003010',
  '--exit-border-hover': '#00aa50',
  '--scrollbar-thumb':       '#888888',
  '--scrollbar-thumb-hover': '#cccccc',
}

// ── Color Blind overlay vars ──────────────────────────────────────────────

const COLORBLIND_VARS: Record<string, Partial<ThemeVars>> = {
  // Deuteranopia — green deficiency: can't distinguish red/green
  // Shift greens (health-ok, hidden, exits, compass) to teal/blue;
  // shift reds (bleeding, dead) to orange/magenta
  deuteranopia: {
    '--vital-health-ok-start': '#0a5a6a',
    '--vital-health-ok-end':   '#18a8b8',
    // Spell Monitor traffic light: GREEN is the problem stop, so it moves to the
    // same teal the health bar uses here. Amber and red are left alone — teal /
    // amber / red separate comfortably for a deuteranope.
    '--spell-band-ok':   'color-mix(in srgb, #18a8b8 80%, var(--text-primary))',
    '--ind-hidden-color':  '#60a8ff',
    '--ind-hidden-bg':     '#061428',
    '--ind-hidden-border': '#103058',
    '--ind-hidden-glow':   'rgba(96, 168, 255, 0.3)',
    '--ind-bleeding-color':  '#ff9040',
    '--ind-bleeding-bg':     '#1e0e00',
    '--ind-bleeding-border': '#582000',
    '--ind-bleeding-glow':   'rgba(255, 144, 64, 0.3)',
    '--ind-dead-color':  '#ff60c0',
    '--ind-dead-bg':     '#200820',
    '--ind-dead-border': '#601040',
    '--ind-dead-glow':   'rgba(255, 80, 192, 0.35)',
    '--exit-text':       '#28c8c8',
    '--exit-border':     '#1a5858',
    '--exit-text-hover': '#60e8e8',
    '--exit-border-hover': '#2a8888',
    '--compass-active-text':   '#28c8c8',
    '--compass-active-glow':   'rgba(40, 200, 200, 0.35)',
  },

  // Protanopia — red deficiency: reds appear very dark/black
  // Shift reds (health-crit, health-low, bleeding, dead, RT) to amber/orange/yellow
  protanopia: {
    '--vital-health-crit-start': '#7a5500',
    '--vital-health-crit-end':   '#e8a800',
    // Spell Monitor traffic light. The vitals' own answer does NOT transfer: it
    // turns crit AMBER, which is exactly our MID band, so the two most urgent
    // states would collide. Move green→teal (as deuteranopia does) and keep red
    // but LIGHTEN it — a protanope reads red as very dark, so lightness carries
    // the separation from amber alongside hue. Colour is the secondary cue
    // either way: the bar's LENGTH and the printed time say the same thing (§34.7).
    '--spell-band-ok':   'color-mix(in srgb, #18a8b8 80%, var(--text-primary))',
    '--spell-band-crit': 'color-mix(in srgb, #ff7a5a 85%, var(--text-primary))',
    '--vital-health-low-start':  '#7a4800',
    '--vital-health-low-end':    '#e09000',
    '--ind-bleeding-color':  '#ff8030',
    '--ind-bleeding-bg':     '#1e0c00',
    '--ind-bleeding-border': '#501800',
    '--ind-bleeding-glow':   'rgba(255, 128, 48, 0.3)',
    '--ind-dead-color':  '#ffb820',
    '--ind-dead-bg':     '#1e1000',
    '--ind-dead-border': '#584000',
    '--ind-dead-glow':   'rgba(255, 184, 32, 0.35)',
    '--rt-start': '#7a5500',
    '--rt-end':   '#e09010',
    '--rt-glow':  'rgba(224, 144, 16, 0.7)',
    '--exit-text':       '#28c8c8',
    '--exit-border':     '#1a5858',
    '--exit-text-hover': '#60e8e8',
    '--exit-border-hover': '#2a8888',
    '--compass-active-text':   '#28c8c8',
    '--compass-active-glow':   'rgba(40, 200, 200, 0.35)',
  },

  // Tritanopia — blue-yellow deficiency: can't distinguish blue/yellow
  // Shift blues (mana, CT, webbed, joined, sitting) to purple/green/orange
  tritanopia: {
    '--vital-mana-start': '#4a1080',
    '--vital-mana-end':   '#8830d0',
    '--ct-start': '#0a5a20',
    '--ct-end':   '#20b850',
    '--ct-glow':  'rgba(32, 184, 80, 0.7)',
    '--stance-sitting-color':  '#c070f0',
    '--stance-sitting-border': '#502878',
    '--stance-sitting-bg':     '#150830',
    '--ind-webbed-color':  '#e060f0',
    '--ind-webbed-bg':     '#180828',
    '--ind-webbed-border': '#481060',
    '--ind-webbed-glow':   'rgba(224, 96, 240, 0.3)',
    '--ind-joined-color':  '#f09030',
    '--ind-joined-bg':     '#1e0e00',
    '--ind-joined-border': '#502000',
    '--ind-joined-glow':   'rgba(240, 144, 48, 0.3)',
  },
}

// ── Apply to DOM ──────────────────────────────────────────────────────────

function setVar(key: string, value: string) {
  document.documentElement.style.setProperty(key, value)
}

export function applySettingsToDOM(s: AppSettings): void {
  const root = document.documentElement

  // Font vars (large print overrides size + line height)
  const fontSize   = s.largePrint ? 18 : s.fontSize
  const lineHeight = s.largePrint ? 1.8 : s.lineHeight
  setVar('--game-font-size',   `${fontSize}px`)
  setVar('--game-line-height', `${lineHeight}`)
  setVar('--game-font-family', resolveFontFamily(s.fontFamily))
  // B113: textWeight = 0 → default font-weight 400, no stroke (no change
  // vs pre-B113). Positive values add a -webkit-text-stroke for faux-bold.
  // Negative values lower CSS font-weight below 400 — only visible on
  // fonts that ship light weights (Cascadia Code has 200/300/350; Consolas
  // falls back to 400 silently). Values are CSS unit-less weight steps:
  // each ±0.2 maps to ±100 weight units (or ±0.X px stroke on the bold side).
  const w = s.textWeight
  if (w > 0) {
    setVar('--game-text-stroke', `${w}px`)
    setVar('--game-text-weight', '400')
  } else if (w < 0) {
    setVar('--game-text-stroke', '0')
    // -0.2 → 300, -0.4 → 200, -0.6 → 100. Round to nearest 100 for clean fallback.
    const weight = Math.max(100, Math.round(400 + w * 500))
    setVar('--game-text-weight', String(weight))
  } else {
    setVar('--game-text-stroke', '0')
    setVar('--game-text-weight', '400')
  }

  // Scale entire UI for large print
  root.style.fontSize = s.largePrint ? '16px' : ''

  // Data attributes (CSS-driven behaviors)
  root.setAttribute('data-epilepsy-safe', s.epilepsySafe ? 'true' : 'false')

  // High contrast overlay
  if (s.highContrast) {
    for (const [k, v] of Object.entries(HIGH_CONTRAST_VARS)) if (v) setVar(k, v)
  }

  // Color blind overlay (applied after high contrast so specific semantics win)
  if (s.colorBlind !== 'none') {
    const overrides = COLORBLIND_VARS[s.colorBlind] ?? {}
    for (const [k, v] of Object.entries(overrides)) if (v) setVar(k, v)
  }
}

export function initSettings(): void {
  applySettingsToDOM(loadSettings())
}
