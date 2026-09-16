// Themes — the CSS custom-property palette, the built-in theme catalog, and how a theme is applied.
//
// Every colour the UI paints comes from a `--*` custom property on the document
// root; this file defines them. THE MODEL IS MERGE-OVER-`darkBase`:
//
//  • `darkBase` is the ONE complete set of vars (it IS the "Dark" theme, whose
//    catalog entry carries `vars: {}`). Every other built-in theme below is a
//    PARTIAL override, and `applyTheme` / `applyCustomTheme` always spread it
//    over `darkBase` — so a theme (built-in or custom) can never leave a var
//    undefined, and a var added to `darkBase` reaches every theme for free.
//  • `MAP_STRUCTURAL_CASCADE` — the map's structural colours, wired to the
//    general palette as `var(--bg-app)` etc. — is spread into `darkBase` AND
//    re-applied LAST in both apply functions, so a theme's pinned `--map-*`
//    literal is INERT (Binu's "map won't follow App Background" bug). Only
//    the semantic map cues (`--map-arc-*`, `--map-current-color`,
//    `--map-select-color`) stay per-theme. Don't pin structural map vars.
//  • Palettes that must stay legible on every theme without per-theme work
//    (the `--syntax-*` tokens, the `--experience-*` vars, §34.7) are defined
//    ONCE here as `color-mix(...)` / `var(...)` toward the general palette —
//    the pitfall #34 / #63 cascade rule. Prefer that shape over a literal.
//
// Applying writes each var to the root, records the theme id under
// `lichborne.theme`, then calls the post-apply hook (`registerThemeAppliedHook`,
// B114, v0.8.4) so the accessibility overlays in settings.ts — which share
// these keys — are re-applied after EVERY theme write; settings.ts can't be
// imported here (circular), so GameWindow registers that callback. `initTheme`
// resolves the saved id against `THEMES`, then the custom themes in
// `lichborne.myThemes`, then falls back to the first built-in.
//
// The catalog is keyed by `id` ONLY — two built-ins (`classic`, `classic-light`)
// share the display name "Classic" and differ by swatch, so never look a theme
// up by name.

export interface ThemeVars { [key: string]: string }

export interface Theme {
  id: string
  name: string
  category: 'general' | 'guild'
  vars: ThemeVars
  swatches: [string, string, string] // bg, accent, text
}

// ── Dark (base) — all CSS custom properties ────────────────────────────────

// Structural automap colors ALWAYS cascade from the general palette, so the map
// follows App Background / Game Text / borders on EVERY theme — and live-updates
// in the Theme Editor (which only exposes the general vars). Spread into darkBase
// AND re-applied LAST in applyTheme/applyCustomTheme, so a built-in theme's stale
// per-theme `--map-*` literal can't win — that pin was the bug Binu reported
// (v0.13.x): editing a theme's App Background moved every surface except the map.
// Only the SEMANTIC cues stay per-theme (`--map-arc-*`, `--map-current-color`,
// `--map-select-color`) since those need hand-tuned legibility per background.
export const MAP_STRUCTURAL_CASCADE: ThemeVars = {
  '--map-bg':            'var(--bg-app)',
  '--map-chrome-bg':     'var(--bg-raised)',
  '--map-border':        'var(--border)',
  '--map-border-subtle': 'var(--border-subtle)',
  '--map-text':          'var(--text-secondary)',
  '--map-text-muted':    'var(--text-muted)',
  '--map-btn-bg':        'var(--bg-base)',
  '--map-btn-border':    'var(--border)',
  '--map-select-bg':     'var(--bg-sunken)',
  '--map-node-fill':     'var(--bg-raised)',
  '--map-node-stroke':   'var(--border)',
  '--map-dot':           'var(--border-subtle)',
}

export const darkBase: ThemeVars = {
  '--bg-app':    '#0f0f0f',
  '--bg-base':   '#1a1a1a',
  '--bg-raised': '#1e1e1e',
  '--bg-sunken': '#111111',
  '--bg-input':  '#0d0d0d',
  '--bg-hover':  '#222222',
  '--bg-active': '#171717',
  '--bg-btn':    '#2a2a2a',

  '--text-primary':   '#d4c9a8',
  '--text-secondary': '#aaaaaa',
  '--text-muted':     '#888888',
  '--text-dim':       '#7e7e7e',
  '--text-faint':     '#6e6e6e',

  '--border':        '#3c3c3c',
  '--border-subtle': '#2d2d2d',
  '--border-faint':  '#252525',

  '--accent':     '#c8a840',
  '--accent-dim': '#8b6914',
  '--accent-bg':  '#1c1500',

  '--color-danger':        '#e06c6c',
  '--color-danger-dim':    '#c04040',
  '--color-danger-bg':     '#2e1a1a',
  '--color-danger-border': '#5a2d2d',
  '--color-success':       '#5cb85c',
  // B402: the one WARNING hue (stale, waiting, caution). Defined ONCE, here,
  // with no per-theme overrides: a fixed amber mixed toward --text-primary —
  // the pitfall-#63 idiom — so it stays legible on light and dark themes
  // alike. Status UI uses this instead of a hand-picked amber.
  '--color-warning':       'color-mix(in srgb, #d99a1e 80%, var(--text-primary))',

  '--scrollbar-track':       '#111111',
  '--scrollbar-thumb':       '#555555',
  '--scrollbar-thumb-hover': '#747474',

  '--link-color':     '#6a9fd8',
  '--cmd-link-color': 'inherit',

  '--preset-speech':   '#d4af37',
  '--preset-whisper':  '#b09848',
  '--preset-thought':  '#5bc8c8',
  '--preset-roomname': '#ffffff',
  '--preset-roomdesc': '#c8c8c8',
  '--preset-bold':     '#ffff00',
  '--preset-expiry':   '#d97706',
  '--preset-store':    '#5cb85c',
  '--preset-cmd':      '#6a8a6a',

  '--preset-speech-bg':   'transparent',
  '--preset-whisper-bg':  'transparent',
  '--preset-thought-bg':  'transparent',
  '--preset-roomname-bg': 'transparent',
  '--preset-roomdesc-bg': 'transparent',
  '--preset-bold-bg':     'transparent',
  '--preset-expiry-bg':   'transparent',
  '--preset-store-bg':    'transparent',
  '--preset-cmd-bg':      'transparent',

  // Syntax-highlight palette (Lich Dashboard YAML/var preview, Debug panel).
  // Defined once here; each value blends a fixed hue toward the theme's own
  // --text-primary so the token stays a distinct hue but contrast self-corrects
  // on light themes — no per-theme overrides needed (pitfall #34/#55).
  '--syntax-key':     'color-mix(in srgb, #4a90c0 66%, var(--text-primary))',
  '--syntax-string':  'color-mix(in srgb, #6aa84f 66%, var(--text-primary))',
  '--syntax-number':  'color-mix(in srgb, #cc7a40 70%, var(--text-primary))',
  '--syntax-literal': 'color-mix(in srgb, #4a90c0 70%, var(--text-primary))',
  '--syntax-comment': 'color-mix(in srgb, #6a9955 60%, var(--text-primary))',
  '--syntax-meta':    'color-mix(in srgb, #b06ab0 66%, var(--text-primary))',
  '--syntax-type':    'color-mix(in srgb, #3fa6a0 66%, var(--text-primary))',
  '--syntax-symbol':  'color-mix(in srgb, #c2a23a 70%, var(--text-primary))',

  '--vital-health-ok-start':   '#1a5a1a',
  '--vital-health-ok-end':     '#3a9a3a',
  '--vital-health-mid-start':  '#6a5a00',
  '--vital-health-mid-end':    '#c8a820',
  '--vital-health-low-start':  '#7a3800',
  '--vital-health-low-end':    '#d06820',
  '--vital-health-crit-start': '#6a0e0e',
  '--vital-health-crit-end':   '#c83030',
  '--vital-mana-start':        '#1a2a7a',
  '--vital-mana-end':          '#3060c8',
  '--vital-conc-start':        '#0a4848',
  '--vital-conc-end':          '#2898a0',
  '--vital-stamina-start':     '#6a2a00',
  '--vital-stamina-end':       '#c06828',
  '--vital-spirit-start':      '#3a1068',
  '--vital-spirit-end':        '#8848c0',

  '--rt-start': '#8a2010',
  '--rt-end':   '#d05828',
  '--rt-glow':  'rgba(208, 88, 40, 0.7)',
  '--ct-start': '#102070',
  '--ct-end':   '#3878c8',
  '--ct-glow':  'rgba(56, 120, 200, 0.7)',
  // Aim Timer (DR firingTimer) — green; stacks under CT in the command bar.
  // darkBase-only: every theme merges over this, so the green is consistent
  // everywhere (no theme overrides it). Saturated fill, reads on all themes.
  '--aim-start': '#1a6b2e',
  '--aim-end':   '#2ea043',
  '--aim-glow':  'rgba(46, 160, 67, 0.7)',

  '--stance-standing-color':  '#7eda7e',
  '--stance-standing-border': '#2a4a2a',
  '--stance-standing-bg':     '#0d1a0d',
  '--stance-kneeling-color':  '#f0c040',
  '--stance-kneeling-border': '#5a4010',
  '--stance-kneeling-bg':     '#1a1400',
  '--stance-prone-color':     '#f08848',
  '--stance-prone-border':    '#5a3010',
  '--stance-prone-bg':        '#1c0e00',
  '--stance-sitting-color':   '#70b0f0',
  '--stance-sitting-border':  '#1e3a68',
  '--stance-sitting-bg':      '#06101e',

  '--ind-inactive-color':  '#aaaaaa',
  '--ind-inactive-bg':     '#181818',
  '--ind-inactive-border': '#383838',

  '--ind-dead-color':  '#ff7070',
  '--ind-dead-bg':     '#280a0a',
  '--ind-dead-border': '#601010',
  '--ind-dead-glow':   'rgba(255, 80, 80, 0.35)',

  '--ind-stunned-color':  '#f8d848',
  '--ind-stunned-bg':     '#1e1800',
  '--ind-stunned-border': '#504200',
  '--ind-stunned-glow':   'rgba(240, 200, 40, 0.3)',

  '--ind-bleeding-color':  '#ff6060',
  '--ind-bleeding-bg':     '#200606',
  '--ind-bleeding-border': '#580a0a',
  '--ind-bleeding-glow':   'rgba(255, 80, 80, 0.3)',

  '--ind-webbed-color':  '#48e0e0',
  '--ind-webbed-bg':     '#001e1e',
  '--ind-webbed-border': '#0a4848',
  '--ind-webbed-glow':   'rgba(48, 200, 200, 0.3)',

  '--ind-invisible-color':  '#c8a0ff',
  '--ind-invisible-bg':     '#100828',
  '--ind-invisible-border': '#301860',
  '--ind-invisible-glow':   'rgba(180, 128, 255, 0.3)',

  '--ind-hidden-color':  '#68e068',
  '--ind-hidden-bg':     '#061a06',
  '--ind-hidden-border': '#104010',
  '--ind-hidden-glow':   'rgba(80, 210, 80, 0.3)',

  '--ind-joined-color':  '#68b8ff',
  '--ind-joined-bg':     '#061428',
  '--ind-joined-border': '#103058',
  '--ind-joined-glow':   'rgba(80, 160, 255, 0.3)',

  // Poisoned — toxic green. Sickly-bright so it reads as "wrong" against
  // the neutral indicator palette but not so red it competes with bleed.
  '--ind-poisoned-color':  '#5fc758',
  '--ind-poisoned-bg':     '#0a1e08',
  '--ind-poisoned-border': '#1c4a18',
  '--ind-poisoned-glow':   'rgba(95, 200, 90, 0.3)',

  // Diseased — mustard / sickly yellow-green. Adjacent to poisoned on the
  // hue wheel but desaturated and shifted yellow so the two states are
  // visually distinguishable when one supersedes the other in the slot.
  '--ind-diseased-color':  '#c0b048',
  '--ind-diseased-bg':     '#1a1808',
  '--ind-diseased-border': '#4a4218',
  '--ind-diseased-glow':   'rgba(200, 180, 70, 0.28)',

  '--compass-active-text':     '#70e870',
  '--compass-active-glow':     'rgba(80, 210, 80, 0.35)',
  '--compass-inactive-text':   '#7a7a7a',
  '--compass-center-text':     '#565656',

  // v0.8.4 (B112): panel body-text vars cascade from the general --text-*
  // scale by default. So when a user sets "Game text" / "Labels" / etc. in
  // the Theme Editor, the equivalent text inside each structured panel
  // (Hand status, Room sections, Exp rows…) follows automatically — no need
  // to find the same ~10 specialty rows and set them one by one. Built-in
  // themes that explicitly override a specialty var still win via the
  // applyTheme merge. Held / active states keep their accent colors because
  // they ARE the visual cue (a held weapon should pop against body text).
  '--hand-label-color':   'var(--text-dim)',
  '--hand-empty-color':   'var(--text-muted)',
  '--hand-held-color':    '#e8d898',
  '--spell-empty-color':  'var(--text-muted)',
  '--spell-active-color': '#d0a8ff',
  '--spell-active-glow':  'rgba(190, 140, 255, 0.45)',

  '--room-title-color':    '#e8e8e8',
  '--room-desc-color':     '#b8b8b8',
  '--room-section-color':  'var(--text-dim)',
  '--room-content-color':  'var(--text-muted)',
  '--exit-bg':             '#0d1a0d',
  '--exit-border':         '#1e3a1e',
  '--exit-text':           '#60a840',
  '--exit-bg-hover':       '#142014',
  '--exit-border-hover':   '#366030',
  '--exit-text-hover':     '#90d860',

  '--exp-skill-color':     'var(--text-secondary)',
  '--exp-rank-color':      '#777777',
  '--exp-pct-color':       '#777777',
  '--exp-mindstate-color': 'var(--text-dim)',
  '--exp-rate-color':      'var(--text-dim)',
  '--exp-bar-bg':          '#181818',
  '--exp-locked-skill':    '#d07030',
  '--exp-locked-mind':     '#a05020',
  '--exp-locked-rate':     '#7a3a10',
  '--exp-bar-low':         '#4caf7d',
  '--exp-bar-mid':         '#d4a017',
  '--exp-bar-high':        '#d4621a',
  '--exp-bar-locked':      '#cc4444',

  // ── Automap ────────────────────────────────────────────────────────────────
  // Structural colors (bg / chrome / text / borders / node fills / dots) cascade
  // from the general palette via MAP_STRUCTURAL_CASCADE (above) — re-applied last
  // on theme apply so NO theme can pin them (that pin was Binu's "map won't
  // follow App Background" bug). Only the SEMANTIC cues live per-theme below:
  ...MAP_STRUCTURAL_CASCADE,
  // Lichborne Experiences (§34.7): defined ONCE here, cascading from the
  // general palette (pitfalls #34/#63) — every theme inherits correct values
  // with no per-theme overrides. NOTE the prefix is --experience-*, NOT
  // --exp-* (taken by the experience-POINTS panel, e.g. --exp-bar-locked
  // above). Avatar fills are DATA colors (contact template / name-hash),
  // not theme vars.
  // --bg-app, NOT --bg-base: floating windows (.fl-window) sit on --bg-app,
  // and the Tableau must read as the same surface family as its sibling
  // panel windows (B186 — it stood out darker on the default theme).
  '--experience-scene-bg':    'var(--bg-app)',
  '--experience-scene-text':  'var(--text-secondary)',
  '--experience-scene-muted': 'var(--text-dim)',
  '--experience-chip-border': 'var(--border)',
  // Spell Monitor traffic light (v0.19.5): green while full → amber past halfway
  // → red near the end.
  //
  // These are DELIBERATELY NOT the `--vital-health-*` ramp, which was the first
  // implementation and was wrong. That ramp means "this theme's health bar",
  // not "traffic light", and two shipped themes prove the difference: `classic`
  // pulls its vitals verbatim from Genie's presets.cfg, where health is RED AT
  // FULL (`--vital-health-ok-end: #dd0000`), so a full spell would have screamed
  // "expiring"; and `terminal` is monochrome, so its mid stop is green and the
  // middle band vanished. Reusing a var whose SEMANTICS differ from your need is
  // the pitfall #34/#75 family — the cascade must follow meaning, not hue.
  //
  // Defined ONCE here in the pitfall-#63 `--syntax-*` shape: a fixed hue mixed
  // toward `var(--text-primary)`, which resolves in each theme's own context at
  // use time. So every theme gets a value that keeps its MEANING while its
  // CONTRAST self-corrects — darkened against a light background, brightened
  // against a dark one — with no per-theme work and no way for a theme to
  // silently invert the signal. A theme may still override deliberately.
  //
  // The hues are MID-TONE on purpose (UX standard #9's SimuCoin lesson): a true
  // yellow measures ~1.5:1 on a white theme and simply disappears, so the middle
  // band is an AMBER. There is no yellow that survives both ends.
  '--spell-band-ok':   'color-mix(in srgb, #35b04a 75%, var(--text-primary))',
  '--spell-band-mid':  'color-mix(in srgb, #e0a81c 75%, var(--text-primary))',
  '--spell-band-crit': 'color-mix(in srgb, #e04040 75%, var(--text-primary))',
  // Spell Monitor SKILL BADGES — one hue per magic skill / ability type, so a
  // glance groups "all my Augmentations" without reading a word. Same
  // self-correcting mix as the bands, and all twelve are exposed in the Theme
  // Editor's HUD tab so they are genuinely user-editable rather than only
  // themeable (Sekmeht asked for changeable badge colours).
  //
  // Hues deliberately AVOID the band greens/ambers/reds where they can: the
  // badge chip and the traffic light share a cell, and the badge identifies
  // while the light alarms — two colour systems that must not be confused.
  // A character realistically sees at most ~7 of these at once (one guild's
  // skills, or a Barbarian's ability types), so cross-group reuse would have
  // been safe; they are kept distinct anyway so no pairing is correct only by
  // luck (pitfall #55).
  '--spell-badge-a': 'color-mix(in srgb, #2e9d8f 75%, var(--text-primary))',  // Augmentation
  '--spell-badge-u': 'color-mix(in srgb, #6b7f99 75%, var(--text-primary))',  // Utility
  '--spell-badge-t': 'color-mix(in srgb, #c0517a 75%, var(--text-primary))',  // Targeted Magic
  '--spell-badge-d': 'color-mix(in srgb, #8a5cc0 75%, var(--text-primary))',  // Debilitation
  '--spell-badge-w': 'color-mix(in srgb, #3f7fc0 75%, var(--text-primary))',  // Warding
  '--spell-badge-c': 'color-mix(in srgb, #7d7d7d 75%, var(--text-primary))',  // Cantrip
  '--spell-badge-x': 'color-mix(in srgb, #a87838 75%, var(--text-primary))',  // Metamagic
  '--spell-badge-f': 'color-mix(in srgb, #4e9c3a 75%, var(--text-primary))',  // Form
  '--spell-badge-b': 'color-mix(in srgb, #c05a30 75%, var(--text-primary))',  // Berserk
  '--spell-badge-m': 'color-mix(in srgb, #5f8fb0 75%, var(--text-primary))',  // Meditation
  '--spell-badge-r': 'color-mix(in srgb, #b0863a 75%, var(--text-primary))',  // Roar
  '--spell-badge-s': 'color-mix(in srgb, #a8579a 75%, var(--text-primary))',  // Scream
  // Moons experience — the ONLY themeable cue in an otherwise realistic sky
  // (sky gradients, moon lore colors, shadow landscape are fixed nature/lore
  // data, the Principle #4 exception like the map's baked tiles). This tints the
  // instrument OVERLAY (the arc path the bodies travel) so the scene carries the
  // theme's signature colour; the CSS blends it toward the sky-contrast ink so
  // it stays legible on any sky. Follows the --map-arc-* semantic-cue precedent.
  '--moons-guide': 'var(--accent)',
  '--map-select-color':  'var(--accent)',
  '--map-arc-cardinal':  '#8a7050',
  '--map-arc-vertical':  '#d4a020',
  '--map-arc-special':   '#6a9060',
  '--map-arc-hidden':    '#8a6030',
  '--map-current-color': '#50e038',
  // v0.8.2: Lich Map "you are here" sonar locator — themable trio.
  // `--lich-here-color`    bright accent stroke (sonar ping rings + solid ring)
  // `--lich-here-backdrop` dark contrast halo under the solid ring; guarantees
  //                        visibility on white/cream Lich Map tiles. Keep the
  //                        alpha so it darkens whatever's underneath rather
  //                        than punching a flat black ring.
  // `--lich-here-fill`     room-rect fill tint — softer than the ring so the
  //                        ring stays the focal point.
  // Lime by default (Lich PNG/GIF tiles run cream/white, so saturated lime
  // pops where Genie's muted #4caf50 would wash out). Themes can override
  // either color independently from Genie's `--map-current-color`.
  '--lich-here-color':    '#00ff80',
  '--lich-here-backdrop': 'rgba(0,0,0,0.55)',
  '--lich-here-fill':     'rgba(0,255,128,0.30)',

  '--bg-deep': 'rgba(0, 0, 0, 0.35)',

  '--exp-sleep-1': '#8b6914',
  '--exp-sleep-2': '#c8a840',

  '--injury-wound1-color': '#c8aa00',
  '--injury-wound2-color': '#d26400',
  '--injury-wound3-color': '#c81e1e',
}

// ── General theme overrides (partial — merged with darkBase on apply) ───────

const darker: ThemeVars = {
  '--bg-app':    '#060606',
  '--bg-base':   '#111111',
  '--bg-raised': '#161616',
  '--bg-sunken': '#080808',
  '--bg-input':  '#050505',
  '--bg-hover':  '#1a1a1a',
  '--bg-active': '#0f0f0f',
  '--bg-btn':    '#222222',
  '--text-primary':   '#ccc2a0',
  '--text-secondary': '#999999',
  '--text-muted':     '#787878',
  '--text-dim':       '#696969',
  '--text-faint':     '#5c5c5c',
  '--border':        '#2b2b2b',
  '--border-subtle': '#1c1c1c',
  '--border-faint':  '#191919',
  '--accent':     '#d9b840',
  '--accent-dim': '#9a7818',
  '--accent-bg':  '#191200',
  '--scrollbar-track':       '#0a0a0a',
  '--scrollbar-thumb':       '#3a3a3a',
  '--scrollbar-thumb-hover': '#5a5a5a',
  '--exp-bar-bg':          '#111111',
  '--ind-inactive-bg':     '#111111',
  '--ind-inactive-border': '#2e2e2e',
  '--map-bg':            '#080605',
  '--map-chrome-bg':     '#0e0b05',
  '--map-border':        '#221808',
  '--map-border-subtle': '#181208',
  '--map-text':          '#a89060',
  '--map-text-muted':    '#6a4828',
  '--map-btn-bg':        '#181208',
  '--map-btn-border':    '#322508',
  '--map-select-bg':     '#060504',
  '--map-node-fill':     '#301e0c',
  '--map-node-stroke':   '#604818',
}

const slate: ThemeVars = {
  '--bg-app':    '#0d1117',
  '--bg-base':   '#161b22',
  '--bg-raised': '#1c2128',
  '--bg-sunken': '#0d1117',
  '--bg-input':  '#010409',
  '--bg-hover':  '#21262d',
  '--bg-active': '#161b22',
  '--bg-btn':    '#21262d',
  '--text-primary':   '#c9d1d9',
  '--text-secondary': '#8b949e',
  '--text-muted':     '#6e7681',
  '--text-dim':       '#545b65',
  '--text-faint':     '#4d535c',
  '--border':        '#30363d',
  '--border-subtle': '#21262d',
  '--border-faint':  '#161b22',
  '--accent':     '#58a6ff',
  '--accent-dim': '#1f6feb',
  '--accent-bg':  '#0d1d38',
  '--scrollbar-track':       '#0d1117',
  '--scrollbar-thumb':       '#30363d',
  '--scrollbar-thumb-hover': '#484f58',
  '--preset-speech':   '#79c0ff',
  '--preset-whisper':  '#56d364',
  '--preset-thought':  '#7ee787',
  '--preset-roomname': '#f0f6fc',
  '--preset-roomdesc': '#c9d1d9',
  '--preset-bold':     '#f0f6fc',
  '--preset-expiry':   '#e3b341',
  '--preset-store':    '#3fb950',
  '--vital-mana-start': '#0d1d38',
  '--vital-mana-end':   '#1f6feb',
  '--compass-active-text':     '#58a6ff',
  '--compass-active-glow':     'rgba(88, 166, 255, 0.35)',
  '--exit-text':       '#3fb950',
  '--exit-bg':         '#0d1a10',
  '--exit-border':     '#1e3a22',
  '--exit-text-hover': '#56d364',
  '--exp-locked-skill': '#e3b341',
  '--exp-locked-mind':  '#b88a28',
  '--exp-locked-rate':  '#8a6010',
  '--ind-inactive-bg':     '#161b22',
  '--ind-inactive-border': '#30363d',
  '--exp-bar-bg': '#161b22',
  '--map-bg':            '#0d1117',
  '--map-chrome-bg':     '#161b22',
  '--map-border':        '#30363d',
  '--map-border-subtle': '#21262d',
  '--map-text':          '#8b949e',
  '--map-text-muted':    '#484f58',
  '--map-btn-bg':        '#21262d',
  '--map-btn-border':    '#30363d',
  '--map-select-bg':     '#0d1117',
  '--map-select-color':  '#58a6ff',
  '--map-node-fill':     '#1c2128',
  '--map-node-stroke':   '#30363d',
  '--map-arc-cardinal':  '#6e7681',
  '--map-arc-vertical':  '#58a6ff',
  '--map-arc-special':   '#3fb950',
  '--map-arc-hidden':    '#484f58',
  '--map-dot':           '#21262d',
  '--map-current-color': '#3fb950',
}

const ivory: ThemeVars = {
  '--link-color': '#1a5a9a',
  '--bg-app':    '#ffffff',
  '--bg-base':   '#f5f5f5',
  '--bg-raised': '#efefef',
  '--bg-sunken': '#fafafa',
  '--bg-input':  '#ffffff',
  '--bg-hover':  '#e8e8e8',
  '--bg-active': '#f0f0f0',
  '--bg-btn':    '#e0e0e0',

  '--text-primary':   '#1a1a1a',
  '--text-secondary': '#4a4a4a',
  '--text-muted':     '#767676',
  '--text-dim':       '#939393',
  '--text-faint':     '#9e9e9e',

  '--border':        '#d0d0d0',
  '--border-subtle': '#e0e0e0',
  '--border-faint':  '#ebebeb',

  '--accent':     '#3d4580',
  '--accent-dim': '#2a3060',
  '--accent-bg':  '#eef0f8',

  '--color-danger':        '#c03030',
  '--color-danger-dim':    '#9a2020',
  '--color-danger-bg':     '#fce8e8',
  '--color-danger-border': '#e8a0a0',
  '--color-success':       '#2a7a2a',

  '--scrollbar-track':       '#f0f0f0',
  '--scrollbar-thumb':       '#c0c0c0',
  '--scrollbar-thumb-hover': '#a0a0a0',

  '--preset-speech':   '#7a4a00',
  '--preset-whisper':  '#1a6060',
  '--preset-thought':  '#5a2080',
  '--preset-roomname': '#111111',
  '--preset-roomdesc': '#2a2a2a',
  '--preset-bold':     '#000000',
  '--preset-expiry':   '#b84800',
  '--preset-store':    '#1a6a2a',
  '--preset-cmd':      '#585858',

  '--vital-health-ok-start':   '#3a8a3a',
  '--vital-health-ok-end':     '#58c858',
  '--vital-health-mid-start':  '#9a8010',
  '--vital-health-mid-end':    '#d8b820',
  '--vital-health-low-start':  '#b05000',
  '--vital-health-low-end':    '#e07820',
  '--vital-health-crit-start': '#a01818',
  '--vital-health-crit-end':   '#d83030',
  '--vital-mana-start':        '#2a4aa8',
  '--vital-mana-end':          '#4878e8',
  '--vital-conc-start':        '#207878',
  '--vital-conc-end':          '#3ab0b8',
  '--vital-stamina-start':     '#8a4a18',
  '--vital-stamina-end':       '#d07838',
  '--vital-spirit-start':      '#5a2888',
  '--vital-spirit-end':        '#9858d8',

  '--rt-start': '#c04010',
  '--rt-end':   '#e86030',
  '--rt-glow':  'rgba(200, 60, 20, 0.35)',
  '--ct-start': '#1a3890',
  '--ct-end':   '#4070d0',
  '--ct-glow':  'rgba(40, 80, 190, 0.35)',

  '--stance-standing-color':  '#1a6a1a',
  '--stance-standing-border': '#70b870',
  '--stance-standing-bg':     '#e8f8e8',
  '--stance-kneeling-color':  '#8a6000',
  '--stance-kneeling-border': '#c8a020',
  '--stance-kneeling-bg':     '#fdf8e0',
  '--stance-prone-color':     '#8a4000',
  '--stance-prone-border':    '#c87820',
  '--stance-prone-bg':        '#fef0d8',
  '--stance-sitting-color':   '#1a4888',
  '--stance-sitting-border':  '#5888c8',
  '--stance-sitting-bg':      '#e8f0fc',

  '--ind-inactive-color':  '#808080',
  '--ind-inactive-bg':     '#ebebeb',
  '--ind-inactive-border': '#c8c8c8',

  '--ind-dead-color':  '#b02020',
  '--ind-dead-bg':     '#fce8e8',
  '--ind-dead-border': '#e09090',
  '--ind-dead-glow':   'rgba(180, 30, 30, 0.15)',

  '--ind-stunned-color':  '#8a6000',
  '--ind-stunned-bg':     '#fdf8d8',
  '--ind-stunned-border': '#c8a020',
  '--ind-stunned-glow':   'rgba(180, 140, 0, 0.15)',

  '--ind-bleeding-color':  '#b02020',
  '--ind-bleeding-bg':     '#fce8e8',
  '--ind-bleeding-border': '#e08888',
  '--ind-bleeding-glow':   'rgba(180, 30, 30, 0.15)',

  '--ind-webbed-color':  '#1a6868',
  '--ind-webbed-bg':     '#d8f0f0',
  '--ind-webbed-border': '#70b8b8',
  '--ind-webbed-glow':   'rgba(20, 150, 150, 0.15)',

  '--ind-invisible-color':  '#5a2080',
  '--ind-invisible-bg':     '#f0e0f8',
  '--ind-invisible-border': '#b878d8',
  '--ind-invisible-glow':   'rgba(120, 40, 180, 0.15)',

  '--ind-hidden-color':  '#1a6a1a',
  '--ind-hidden-bg':     '#e8f8e8',
  '--ind-hidden-border': '#78c078',
  '--ind-hidden-glow':   'rgba(40, 160, 40, 0.15)',

  '--ind-joined-color':  '#1a4888',
  '--ind-joined-bg':     '#e8f0fc',
  '--ind-joined-border': '#7088d8',
  '--ind-joined-glow':   'rgba(40, 100, 200, 0.15)',

  '--ind-poisoned-color':  '#2a6a18',
  '--ind-poisoned-bg':     '#e8f6dc',
  '--ind-poisoned-border': '#78b860',
  '--ind-poisoned-glow':   'rgba(50, 150, 40, 0.15)',

  '--ind-diseased-color':  '#806818',
  '--ind-diseased-bg':     '#f8efd0',
  '--ind-diseased-border': '#c0a850',
  '--ind-diseased-glow':   'rgba(170, 140, 40, 0.15)',

  '--compass-active-text':     '#1a6a1a',
  '--compass-active-glow':     'rgba(40, 160, 40, 0.2)',
  '--compass-inactive-text':   '#a0a0a0',
  '--compass-center-text':     '#d0d0d0',

  '--hand-label-color':   '#909090',
  '--hand-empty-color':   '#a0a0a0',
  '--hand-held-color':    '#2a1800',
  '--spell-empty-color':  '#a0a0a0',
  '--spell-active-color': '#5a2080',
  '--spell-active-glow':  'rgba(120, 40, 180, 0.25)',

  '--room-title-color':   '#111111',
  '--room-desc-color':    '#2a2a2a',
  '--room-section-color': '#909090',
  '--room-content-color': '#606060',
  '--exit-bg':            '#e8f8e8',
  '--exit-border':        '#70b870',
  '--exit-text':          '#1a6a1a',
  '--exit-bg-hover':      '#d8f0d8',
  '--exit-border-hover':  '#40a040',
  '--exit-text-hover':    '#0a4a0a',

  '--exp-skill-color':     '#2a2a2a',
  '--exp-rank-color':      '#505050',
  '--exp-pct-color':       '#505050',
  '--exp-mindstate-color': '#505050',
  '--exp-rate-color':      '#707070',
  '--exp-bar-bg':          '#f0f0f0',
  '--exp-locked-skill':    '#b84800',
  '--exp-locked-mind':     '#8a3400',
  '--exp-locked-rate':     '#6a2000',
  '--map-bg':            '#f5f5f5',
  '--map-chrome-bg':     '#efefef',
  '--map-border':        '#d0d0d0',
  '--map-border-subtle': '#e0e0e0',
  '--map-text':          '#4a4a4a',
  '--map-text-muted':    '#909090',
  '--map-btn-bg':        '#e0e0e0',
  '--map-btn-border':    '#c0c0c0',
  '--map-select-bg':     '#f8f8f8',
  '--map-select-color':  '#3d4580',
  '--map-node-fill':     '#e8e0d8',
  '--map-node-stroke':   '#a0a0a0',
  '--map-arc-cardinal':  '#6a7080',
  '--map-arc-vertical':  '#3d4580',
  '--map-arc-special':   '#2a7a2a',
  '--map-arc-hidden':    '#a0a0a0',
  '--map-dot':           '#d0d0d0',
  '--map-current-color': '#2a7a2a',
}

const mist: ThemeVars = {
  '--link-color': '#1a5aa0',
  '--bg-app':    '#e6eaef',
  '--bg-base':   '#ebeef3',
  '--bg-raised': '#f0f3f6',
  '--bg-sunken': '#e0e4ea',
  '--bg-input':  '#f5f7f9',
  '--bg-hover':  '#d8dce2',
  '--bg-active': '#e2e6eb',
  '--bg-btn':    '#d4d8de',

  '--text-primary':   '#1c2028',
  '--text-secondary': '#404858',
  '--text-muted':     '#687080',
  '--text-dim':       '#838d9d',
  '--text-faint':     '#939ba9',

  '--border':        '#c0c8d4',
  '--border-subtle': '#d0d8e4',
  '--border-faint':  '#dde4ed',

  '--accent':     '#2a6ab0',
  '--accent-dim': '#1a4a88',
  '--accent-bg':  '#dde8f5',

  '--color-danger':        '#b82828',
  '--color-danger-dim':    '#901818',
  '--color-danger-bg':     '#f5e0e0',
  '--color-danger-border': '#d89090',
  '--color-success':       '#286828',

  '--scrollbar-track':       '#dde2e8',
  '--scrollbar-thumb':       '#b0b8c4',
  '--scrollbar-thumb-hover': '#909aaa',

  '--preset-speech':   '#8a5000',
  '--preset-whisper':  '#1a6868',
  '--preset-thought':  '#5a2888',
  '--preset-roomname': '#181c24',
  '--preset-roomdesc': '#303848',
  '--preset-bold':     '#0a0e16',
  '--preset-expiry':   '#b04800',
  '--preset-store':    '#226228',
  '--preset-cmd':      '#5a6270',

  '--vital-health-ok-start':   '#388038',
  '--vital-health-ok-end':     '#56c056',
  '--vital-health-mid-start':  '#988010',
  '--vital-health-mid-end':    '#d4b018',
  '--vital-health-low-start':  '#a84c00',
  '--vital-health-low-end':    '#d87020',
  '--vital-health-crit-start': '#981818',
  '--vital-health-crit-end':   '#d02828',
  '--vital-mana-start':        '#2848a0',
  '--vital-mana-end':          '#4070d8',
  '--vital-conc-start':        '#1e7070',
  '--vital-conc-end':          '#38a8b0',
  '--vital-stamina-start':     '#884818',
  '--vital-stamina-end':       '#c87030',
  '--vital-spirit-start':      '#58288a',
  '--vital-spirit-end':        '#9050d0',

  '--rt-start': '#b83808',
  '--rt-end':   '#e05820',
  '--rt-glow':  'rgba(190, 60, 20, 0.3)',
  '--ct-start': '#183888',
  '--ct-end':   '#3868c8',
  '--ct-glow':  'rgba(38, 80, 180, 0.3)',

  '--stance-standing-color':  '#226822',
  '--stance-standing-border': '#68b068',
  '--stance-standing-bg':     '#e0f0e0',
  '--stance-kneeling-color':  '#886000',
  '--stance-kneeling-border': '#c09820',
  '--stance-kneeling-bg':     '#f8f0d8',
  '--stance-prone-color':     '#884000',
  '--stance-prone-border':    '#c07018',
  '--stance-prone-bg':        '#f8e8d0',
  '--stance-sitting-color':   '#1a4880',
  '--stance-sitting-border':  '#5080c0',
  '--stance-sitting-bg':      '#dce8f8',

  '--ind-inactive-color':  '#788090',
  '--ind-inactive-bg':     '#dde2e8',
  '--ind-inactive-border': '#b8c0cc',

  '--ind-dead-color':  '#a82020',
  '--ind-dead-bg':     '#f0e0e0',
  '--ind-dead-border': '#d08888',
  '--ind-dead-glow':   'rgba(168, 30, 30, 0.12)',

  '--ind-stunned-color':  '#886000',
  '--ind-stunned-bg':     '#f8f0d0',
  '--ind-stunned-border': '#c09818',
  '--ind-stunned-glow':   'rgba(168, 128, 0, 0.12)',

  '--ind-bleeding-color':  '#a82020',
  '--ind-bleeding-bg':     '#f0e0e0',
  '--ind-bleeding-border': '#d08080',
  '--ind-bleeding-glow':   'rgba(168, 30, 30, 0.12)',

  '--ind-webbed-color':  '#1a6868',
  '--ind-webbed-bg':     '#d0eaea',
  '--ind-webbed-border': '#68b0b0',
  '--ind-webbed-glow':   'rgba(20, 148, 148, 0.12)',

  '--ind-invisible-color':  '#582080',
  '--ind-invisible-bg':     '#ead8f0',
  '--ind-invisible-border': '#a870d0',
  '--ind-invisible-glow':   'rgba(110, 40, 170, 0.12)',

  '--ind-hidden-color':  '#226822',
  '--ind-hidden-bg':     '#e0f0e0',
  '--ind-hidden-border': '#70b870',
  '--ind-hidden-glow':   'rgba(40, 155, 40, 0.12)',

  '--ind-joined-color':  '#1a4880',
  '--ind-joined-bg':     '#d8e8f4',
  '--ind-joined-border': '#6888c8',
  '--ind-joined-glow':   'rgba(38, 98, 190, 0.12)',

  '--ind-poisoned-color':  '#286618',
  '--ind-poisoned-bg':     '#dceadc',
  '--ind-poisoned-border': '#70b058',
  '--ind-poisoned-glow':   'rgba(46, 142, 36, 0.12)',

  '--ind-diseased-color':  '#7a6418',
  '--ind-diseased-bg':     '#f0ebc8',
  '--ind-diseased-border': '#b8a048',
  '--ind-diseased-glow':   'rgba(160, 130, 36, 0.12)',

  '--compass-active-text':     '#226822',
  '--compass-active-glow':     'rgba(40, 155, 40, 0.18)',
  '--compass-inactive-text':   '#909aaa',
  '--compass-center-text':     '#c8d0d8',

  '--hand-label-color':   '#808898',
  '--hand-empty-color':   '#909aaa',
  '--hand-held-color':    '#1c2028',
  '--spell-empty-color':  '#909aaa',
  '--spell-active-color': '#582080',
  '--spell-active-glow':  'rgba(110, 40, 170, 0.22)',

  '--room-title-color':   '#1c2028',
  '--room-desc-color':    '#303848',
  '--room-section-color': '#808898',
  '--room-content-color': '#586070',
  '--exit-bg':            '#e0f0e0',
  '--exit-border':        '#68b068',
  '--exit-text':          '#226822',
  '--exit-bg-hover':      '#cce8cc',
  '--exit-border-hover':  '#409840',
  '--exit-text-hover':    '#0a4a0a',

  '--exp-skill-color':     '#303848',
  '--exp-rank-color':      '#505868',
  '--exp-pct-color':       '#505868',
  '--exp-mindstate-color': '#505868',
  '--exp-rate-color':      '#687080',
  '--exp-bar-bg':          '#dde2e8',
  '--exp-locked-skill':    '#b04800',
  '--exp-locked-mind':     '#883400',
  '--exp-locked-rate':     '#682000',
  '--map-bg':            '#e6eaef',
  '--map-chrome-bg':     '#dde2e8',
  '--map-border':        '#c0c8d4',
  '--map-border-subtle': '#d0d8e4',
  '--map-text':          '#404858',
  '--map-text-muted':    '#687080',
  '--map-btn-bg':        '#d4d8de',
  '--map-btn-border':    '#b0b8c4',
  '--map-select-bg':     '#e8ecf0',
  '--map-select-color':  '#2a6ab0',
  '--map-node-fill':     '#d8dce2',
  '--map-node-stroke':   '#909aaa',
  '--map-arc-cardinal':  '#607080',
  '--map-arc-vertical':  '#2a6ab0',
  '--map-arc-special':   '#226822',
  '--map-arc-hidden':    '#909aaa',
  '--map-dot':           '#c0c8d4',
  '--map-current-color': '#226822',
}

const parchment: ThemeVars = {
  '--link-color': '#2a4a9a',
  '--bg-app':    '#f0ead8',
  '--bg-base':   '#ede5cf',
  '--bg-raised': '#e8dfc8',
  '--bg-sunken': '#f5f0e0',
  '--bg-input':  '#faf6ea',
  '--bg-hover':  '#dfd8c0',
  '--bg-active': '#e4dcc8',
  '--bg-btn':    '#d8d0b8',
  '--text-primary':   '#2a1f0e',
  '--text-secondary': '#5a4a2a',
  '--text-muted':     '#8a7050',
  '--text-dim':       '#a4865b',
  '--text-faint':     '#ab8e61',
  '--border':        '#c0a878',
  '--border-subtle': '#d4bc90',
  '--border-faint':  '#e0cca8',
  '--accent':     '#8b4c00',
  '--accent-dim': '#6a3800',
  '--accent-bg':  '#f0d8a0',
  '--color-danger':        '#c03030',
  '--color-danger-dim':    '#a02020',
  '--color-danger-bg':     '#f8d8d8',
  '--color-danger-border': '#e09090',
  '--color-success':       '#2a7a2a',
  '--scrollbar-track':       '#e0d8c0',
  '--scrollbar-thumb':       '#c0a870',
  '--scrollbar-thumb-hover': '#a08850',
  '--preset-speech':   '#7a3000',
  '--preset-whisper':  '#5a4010',
  '--preset-thought':  '#0a5a5a',
  '--preset-roomname': '#1a1a1a',
  '--preset-roomdesc': '#3a3030',
  '--preset-bold':     '#000000',
  '--preset-expiry':   '#c06000',
  '--preset-store':    '#2a7a2a',
  '--preset-cmd':      '#4a6a4a',
  '--vital-health-ok-start':   '#2a6a2a',
  '--vital-health-ok-end':     '#50a050',
  '--vital-health-mid-start':  '#8a7000',
  '--vital-health-mid-end':    '#d8b828',
  '--vital-health-low-start':  '#9a4800',
  '--vital-health-low-end':    '#e07828',
  '--vital-health-crit-start': '#8a1a1a',
  '--vital-health-crit-end':   '#e04040',
  '--vital-mana-start':        '#2a3a9a',
  '--vital-mana-end':          '#4878e8',
  '--vital-conc-start':        '#1a5858',
  '--vital-conc-end':          '#38a8b8',
  '--vital-stamina-start':     '#7a3a10',
  '--vital-stamina-end':       '#c87838',
  '--vital-spirit-start':      '#5a2088',
  '--vital-spirit-end':        '#9858d8',
  '--rt-start': '#c04010',
  '--rt-end':   '#f07030',
  '--rt-glow':  'rgba(200, 80, 20, 0.5)',
  '--ct-start': '#103488',
  '--ct-end':   '#3888f0',
  '--ct-glow':  'rgba(40, 100, 220, 0.5)',
  '--stance-standing-color':  '#2a7a2a',
  '--stance-standing-border': '#70b870',
  '--stance-standing-bg':     '#d8f0d8',
  '--stance-kneeling-color':  '#9a6800',
  '--stance-kneeling-border': '#d8a830',
  '--stance-kneeling-bg':     '#fff8d0',
  '--stance-prone-color':     '#9a5000',
  '--stance-prone-border':    '#d87830',
  '--stance-prone-bg':        '#fff0d8',
  '--stance-sitting-color':   '#205090',
  '--stance-sitting-border':  '#6090d0',
  '--stance-sitting-bg':      '#d8e8f8',
  '--ind-inactive-color':  '#9a8870',
  '--ind-inactive-bg':     '#e8e0d0',
  '--ind-inactive-border': '#c8b898',
  '--ind-dead-color':      '#c03030',
  '--ind-dead-bg':         '#f8d8d8',
  '--ind-dead-border':     '#e09090',
  '--ind-dead-glow':       'rgba(200, 40, 40, 0.25)',
  '--ind-stunned-color':   '#8a6800',
  '--ind-stunned-bg':      '#fff8c8',
  '--ind-stunned-border':  '#d0a820',
  '--ind-stunned-glow':    'rgba(200, 160, 0, 0.25)',
  '--ind-bleeding-color':  '#c02020',
  '--ind-bleeding-bg':     '#f8d8d8',
  '--ind-bleeding-border': '#e08888',
  '--ind-bleeding-glow':   'rgba(200, 40, 40, 0.25)',
  '--ind-webbed-color':    '#186868',
  '--ind-webbed-bg':       '#d0f0f0',
  '--ind-webbed-border':   '#70c0c0',
  '--ind-webbed-glow':     'rgba(20, 160, 160, 0.25)',
  '--ind-invisible-color': '#5a2080',
  '--ind-invisible-bg':    '#f0d8f8',
  '--ind-invisible-border':'#b870e0',
  '--ind-invisible-glow':  'rgba(140, 40, 200, 0.2)',
  '--ind-hidden-color':    '#1a6a1a',
  '--ind-hidden-bg':       '#d8f0d8',
  '--ind-hidden-border':   '#70c070',
  '--ind-hidden-glow':     'rgba(40, 170, 40, 0.25)',
  '--ind-joined-color':    '#1a4888',
  '--ind-joined-bg':       '#d8e8f8',
  '--ind-joined-border':   '#70a0e0',
  '--ind-joined-glow':     'rgba(40, 100, 220, 0.25)',
  '--ind-poisoned-color':  '#2a6818',
  '--ind-poisoned-bg':     '#dceedc',
  '--ind-poisoned-border': '#78b860',
  '--ind-poisoned-glow':   'rgba(50, 150, 40, 0.22)',
  '--ind-diseased-color':  '#806818',
  '--ind-diseased-bg':     '#f0eac8',
  '--ind-diseased-border': '#c0a850',
  '--ind-diseased-glow':   'rgba(170, 140, 40, 0.22)',
  '--compass-active-text':     '#1a6a1a',
  '--compass-active-glow':     'rgba(40, 160, 40, 0.3)',
  '--compass-inactive-text':   '#a09070',
  '--compass-center-text':     '#c8b090',
  '--hand-label-color':   '#9a8060',
  '--hand-empty-color':   '#a09070',
  '--hand-held-color':    '#4a2800',
  '--spell-empty-color':  '#a09070',
  '--spell-active-color': '#5a0880',
  '--spell-active-glow':  'rgba(120, 20, 180, 0.3)',
  '--room-title-color':   '#1a1a1a',
  '--room-desc-color':    '#3a3030',
  '--room-section-color': '#9a8060',
  '--room-content-color': '#6a5840',
  '--exit-bg':            '#d8f0d8',
  '--exit-border':        '#70c070',
  '--exit-text':          '#1a6a1a',
  '--exit-bg-hover':      '#c0e8c0',
  '--exit-border-hover':  '#40a040',
  '--exit-text-hover':    '#0a4a0a',
  '--exp-skill-color':     '#4a3820',
  '--exp-rank-color':      '#7a6040',
  '--exp-pct-color':       '#7a6040',
  '--exp-mindstate-color': '#7a6040',
  '--exp-rate-color':      '#9a8060',
  '--exp-bar-bg':          '#e8e0d0',
  '--exp-locked-skill':    '#c06000',
  '--exp-locked-mind':     '#a04800',
  '--exp-locked-rate':     '#783800',
  '--map-bg':            '#e8dfc8',
  '--map-chrome-bg':     '#e0d8c0',
  '--map-border':        '#c0a878',
  '--map-border-subtle': '#d4bc90',
  '--map-text':          '#5a4a2a',
  '--map-text-muted':    '#9a8060',
  '--map-btn-bg':        '#d8d0b8',
  '--map-btn-border':    '#b8a070',
  '--map-select-bg':     '#ede5cf',
  '--map-select-color':  '#8b4c00',
  '--map-node-fill':     '#d4c8a8',
  '--map-node-stroke':   '#9a8860',
  '--map-arc-cardinal':  '#7a6040',
  '--map-arc-vertical':  '#8b4c00',
  '--map-arc-special':   '#2a6a2a',
  '--map-arc-hidden':    '#9a8060',
  '--map-dot':           '#c8b890',
  '--map-current-color': '#2a6a2a',
}

const terminal: ThemeVars = {
  '--link-color': '#00cc66',
  '--bg-app':    '#000000',
  '--bg-base':   '#030e03',
  '--bg-raised': '#050d05',
  '--bg-sunken': '#010801',
  '--bg-input':  '#000000',
  '--bg-hover':  '#071407',
  '--bg-active': '#040c04',
  '--bg-btn':    '#061206',
  '--text-primary':   '#00ff41',
  '--text-secondary': '#00cc33',
  '--text-muted':     '#00992a',
  '--text-dim':       '#00701e',
  '--text-faint':     '#00601c',
  '--border':        '#003a10',
  '--border-subtle': '#002808',
  '--border-faint':  '#011501',
  '--accent':     '#00ff41',
  '--accent-dim': '#00aa2a',
  '--accent-bg':  '#001a08',
  '--color-danger':        '#ff4444',
  '--color-danger-dim':    '#cc2222',
  '--color-danger-bg':     '#200000',
  '--color-danger-border': '#440000',
  '--color-success':       '#00ff41',
  '--scrollbar-track':       '#010a01',
  '--scrollbar-thumb':       '#005518',
  '--scrollbar-thumb-hover': '#00882a',
  '--preset-speech':   '#00ff41',
  '--preset-whisper':  '#00cc33',
  '--preset-thought':  '#00e8e8',
  '--preset-roomname': '#00ff41',
  '--preset-roomdesc': '#00cc33',
  '--preset-bold':     '#00ff41',
  '--preset-expiry':   '#a0ff00',
  '--preset-store':    '#00ff41',
  '--preset-cmd':      '#008820',
  '--vital-health-ok-start':   '#004a10',
  '--vital-health-ok-end':     '#00cc33',
  '--vital-health-mid-start':  '#006a00',
  '--vital-health-mid-end':    '#00aa20',
  '--vital-health-low-start':  '#004400',
  '--vital-health-low-end':    '#008818',
  '--vital-health-crit-start': '#200000',
  '--vital-health-crit-end':   '#880000',
  '--vital-mana-start':        '#002a10',
  '--vital-mana-end':          '#009930',
  '--vital-conc-start':        '#003010',
  '--vital-conc-end':          '#00aa40',
  '--vital-stamina-start':     '#003a00',
  '--vital-stamina-end':       '#00bb20',
  '--vital-spirit-start':      '#002808',
  '--vital-spirit-end':        '#008830',
  '--rt-start': '#660000',
  '--rt-end':   '#cc0000',
  '--rt-glow':  'rgba(200, 0, 0, 0.6)',
  '--ct-start': '#004400',
  '--ct-end':   '#00aa20',
  '--ct-glow':  'rgba(0, 170, 32, 0.6)',
  '--stance-standing-color':  '#00ff41',
  '--stance-standing-border': '#005518',
  '--stance-standing-bg':     '#001408',
  '--stance-kneeling-color':  '#a0ff00',
  '--stance-kneeling-border': '#3a5800',
  '--stance-kneeling-bg':     '#0d1400',
  '--stance-prone-color':     '#ffaa00',
  '--stance-prone-border':    '#554000',
  '--stance-prone-bg':        '#140e00',
  '--stance-sitting-color':   '#00ffaa',
  '--stance-sitting-border':  '#004a30',
  '--stance-sitting-bg':      '#001408',
  '--ind-inactive-color':  '#005518',
  '--ind-inactive-bg':     '#020e02',
  '--ind-inactive-border': '#003a10',
  '--compass-active-text':     '#00ff41',
  '--compass-active-glow':     'rgba(0, 255, 65, 0.4)',
  '--compass-inactive-text':   '#005518',
  '--compass-center-text':     '#003010',
  '--hand-label-color':   '#006620',
  '--hand-empty-color':   '#005518',
  '--hand-held-color':    '#00ff41',
  '--spell-empty-color':  '#005518',
  '--spell-active-color': '#a0ff00',
  '--spell-active-glow':  'rgba(160, 255, 0, 0.45)',
  '--room-title-color':    '#00ff41',
  '--room-desc-color':     '#00cc33',
  '--room-section-color':  '#006620',
  '--room-content-color':  '#009930',
  '--exit-bg':             '#001a08',
  '--exit-border':         '#005518',
  '--exit-text':           '#00ff41',
  '--exit-bg-hover':       '#002810',
  '--exit-border-hover':   '#00aa2a',
  '--exit-text-hover':     '#80ff80',
  '--exp-skill-color':     '#00cc33',
  '--exp-rank-color':      '#009930',
  '--exp-pct-color':       '#009930',
  '--exp-mindstate-color': '#009930',
  '--exp-rate-color':      '#006620',
  '--exp-bar-bg':          '#020e02',
  '--exp-locked-skill':    '#a0ff00',
  '--exp-locked-mind':     '#80cc00',
  '--exp-locked-rate':     '#609900',
  '--map-bg':            '#000000',
  '--map-chrome-bg':     '#030e03',
  '--map-border':        '#003a10',
  '--map-border-subtle': '#002808',
  '--map-text':          '#00cc33',
  '--map-text-muted':    '#005c18',
  '--map-btn-bg':        '#061206',
  '--map-btn-border':    '#003a10',
  '--map-select-bg':     '#000000',
  '--map-select-color':  '#00ff41',
  '--map-node-fill':     '#061206',
  '--map-node-stroke':   '#005518',
  '--map-arc-cardinal':  '#009930',
  '--map-arc-vertical':  '#00ff41',
  '--map-arc-special':   '#00c8c8',
  '--map-arc-hidden':    '#006620',
  '--map-dot':           '#001a08',
  '--map-current-color': '#00ff41',
}

// ── Guild theme overrides — palettes from DESIGN.md Section 6.5 ────────────
// Each uses spec bg as --bg-app; bg-base/raised/sunken are derived tints.

const barbarian: ThemeVars = {
  // Blood and ash, primal warrior — bg #1a0f0a, text #d4b896, accent #8b1a1a
  '--bg-app':    '#1a0f0a',
  '--bg-base':   '#231410',
  '--bg-raised': '#291818',
  '--bg-sunken': '#150c08',
  '--bg-hover':  '#2e1c14',
  '--bg-active': '#1e1210',
  '--bg-btn':    '#332018',
  '--text-primary':   '#d4b896',
  '--text-secondary': '#b09878',
  '--text-muted':     '#8a7258',
  '--border':        '#3a2018',
  '--border-subtle': '#2a1610',
  '--accent':     '#8b1a1a',
  '--accent-dim': '#5a0808',
  '--accent-bg':  '#200808',
  '--preset-speech':  '#c04040',
  '--preset-whisper': '#902828',
  '--exp-bar-bg': '#1c1008',
  '--ind-inactive-bg':     '#1c1008',
  '--ind-inactive-border': '#3a2018',
  '--exit-text':       '#c04040',
  '--exit-bg':         '#1a0808',
  '--exit-border':     '#4a1010',
  '--exit-text-hover': '#e06060',
  '--map-bg':            '#1a0f0a',
  '--map-chrome-bg':     '#231410',
  '--map-border':        '#3a2018',
  '--map-border-subtle': '#2a1610',
  '--map-text':          '#b09878',
  '--map-text-muted':    '#8a6040',
  '--map-btn-bg':        '#291818',
  '--map-btn-border':    '#4a2820',
  '--map-select-bg':     '#150c08',
  '--map-select-color':  '#c04040',
  '--map-node-fill':     '#2a1810',
  '--map-node-stroke':   '#6a2818',
  '--map-arc-cardinal':  '#804030',
  '--map-arc-vertical':  '#c04040',
  '--map-arc-special':   '#806040',
  '--map-arc-hidden':    '#602818',
  '--map-dot':           '#2a1610',
  '--map-current-color': '#e06040',
}

const bard: ThemeVars = {
  // Theatrical gold, warm parchment — bg #1a1020, text #e8d5a0, accent #c08030
  '--bg-app':    '#1a1020',
  '--bg-base':   '#221528',
  '--bg-raised': '#281830',
  '--bg-sunken': '#140c18',
  '--bg-hover':  '#2e1c38',
  '--bg-active': '#1e1228',
  '--bg-btn':    '#342040',
  '--text-primary':   '#e8d5a0',
  '--text-secondary': '#baa880',
  '--text-muted':     '#907a60',
  '--border':        '#3a2848',
  '--border-subtle': '#281a38',
  '--accent':     '#c08030',
  '--accent-dim': '#885010',
  '--accent-bg':  '#1e1400',
  '--preset-speech':  '#e0a040',
  '--preset-whisper': '#b07828',
  '--preset-thought': '#c8a0e8',
  '--spell-active-color': '#c8a0e8',
  '--spell-active-glow':  'rgba(200, 160, 232, 0.45)',
  '--exp-bar-bg': '#1c1228',
  '--ind-inactive-bg':     '#1c1228',
  '--ind-inactive-border': '#3a2848',
  '--map-bg':            '#1a1020',
  '--map-chrome-bg':     '#221528',
  '--map-border':        '#3a2848',
  '--map-border-subtle': '#281a38',
  '--map-text':          '#baa880',
  '--map-text-muted':    '#7a6878',
  '--map-btn-bg':        '#281830',
  '--map-btn-border':    '#4a3860',
  '--map-select-bg':     '#140c18',
  '--map-select-color':  '#e0a040',
  '--map-node-fill':     '#281830',
  '--map-node-stroke':   '#5a3878',
  '--map-arc-cardinal':  '#907850',
  '--map-arc-vertical':  '#e0a040',
  '--map-arc-special':   '#a850c0',
  '--map-arc-hidden':    '#6a4860',
  '--map-dot':           '#281a38',
  '--map-current-color': '#c8a0e8',
}

const cleric: ThemeVars = {
  // Cathedral light, holy gold — bg #0d1020, text #e8eaf0, accent #c8a840
  '--bg-app':    '#0d1020',
  '--bg-base':   '#141828',
  '--bg-raised': '#181c30',
  '--bg-sunken': '#0a0e1a',
  '--bg-hover':  '#1e2238',
  '--bg-active': '#111620',
  '--bg-btn':    '#242840',
  '--text-primary':   '#e8eaf0',
  '--text-secondary': '#b0b8d0',
  '--text-muted':     '#808898',
  '--border':        '#282e48',
  '--border-subtle': '#1c2030',
  '--accent':     '#c8a840',
  '--accent-dim': '#8b6a10',
  '--accent-bg':  '#1c1800',
  '--preset-speech':  '#f0d870',
  '--preset-whisper': '#c0a840',
  '--vital-spirit-start': '#4a3800',
  '--vital-spirit-end':   '#a87800',
  '--spell-active-color': '#f0e890',
  '--spell-active-glow':  'rgba(240, 232, 144, 0.45)',
  '--compass-active-text':   '#f0d870',
  '--compass-active-glow':   'rgba(240, 216, 112, 0.4)',
  '--exp-bar-bg': '#121620',
  '--ind-inactive-bg':     '#121620',
  '--ind-inactive-border': '#282e48',
  '--exit-text':       '#c8a840',
  '--exit-bg':         '#181600',
  '--exit-border':     '#504000',
  '--exit-text-hover': '#f0d050',
  '--map-bg':            '#0d1020',
  '--map-chrome-bg':     '#141828',
  '--map-border':        '#282e48',
  '--map-border-subtle': '#1c2030',
  '--map-text':          '#b0b8d0',
  '--map-text-muted':    '#707898',
  '--map-btn-bg':        '#181c30',
  '--map-btn-border':    '#303858',
  '--map-select-bg':     '#0a0e1a',
  '--map-select-color':  '#c8a840',
  '--map-node-fill':     '#181c30',
  '--map-node-stroke':   '#383e60',
  '--map-arc-cardinal':  '#7080b0',
  '--map-arc-vertical':  '#c8a840',
  '--map-arc-special':   '#6080a0',
  '--map-arc-hidden':    '#404870',
  '--map-dot':           '#1c2030',
  '--map-current-color': '#f0d870',
}

const empath: ThemeVars = {
  // Soft greens, healing light — bg #0d1a12, text #d8f0d8, accent #60b870
  '--bg-app':    '#0d1a12',
  '--bg-base':   '#131e18',
  '--bg-raised': '#182218',
  '--bg-sunken': '#0a160e',
  '--bg-hover':  '#1e2c1e',
  '--bg-active': '#111e14',
  '--bg-btn':    '#243028',
  '--text-primary':   '#d8f0d8',
  '--text-secondary': '#a0c8a0',
  '--text-muted':     '#6a9870',
  '--border':        '#2a4030',
  '--border-subtle': '#1c3020',
  '--accent':     '#60b870',
  '--accent-dim': '#388048',
  '--accent-bg':  '#0e2014',
  '--preset-speech':  '#80d890',
  '--preset-whisper': '#60a870',
  '--vital-health-ok-start':   '#186a28',
  '--vital-health-ok-end':     '#40b858',
  '--vital-spirit-start':      '#1a5a30',
  '--vital-spirit-end':        '#40a860',
  '--spell-active-color': '#80d890',
  '--spell-active-glow':  'rgba(128, 216, 144, 0.45)',
  '--compass-active-text':   '#80d890',
  '--compass-active-glow':   'rgba(96, 184, 112, 0.4)',
  '--exp-bar-bg': '#101c14',
  '--ind-inactive-bg':     '#101c14',
  '--ind-inactive-border': '#2a4030',
  '--exit-text':       '#80d890',
  '--exit-bg':         '#0c1e10',
  '--exit-border':     '#2a5030',
  '--exit-text-hover': '#a8f0b0',
  '--map-bg':            '#0d1a12',
  '--map-chrome-bg':     '#131e18',
  '--map-border':        '#2a4030',
  '--map-border-subtle': '#1c3020',
  '--map-text':          '#a0c8a0',
  '--map-text-muted':    '#6a9870',
  '--map-btn-bg':        '#182218',
  '--map-btn-border':    '#2a4030',
  '--map-select-bg':     '#0a160e',
  '--map-select-color':  '#60b870',
  '--map-node-fill':     '#182218',
  '--map-node-stroke':   '#388048',
  '--map-arc-cardinal':  '#508860',
  '--map-arc-vertical':  '#80d890',
  '--map-arc-special':   '#50a878',
  '--map-arc-hidden':    '#386048',
  '--map-dot':           '#1c3020',
  '--map-current-color': '#80d890',
}

const moonmage: ThemeVars = {
  // Night sky, starlight blue — bg #07091a, text #c8d8f8, accent #7878d8
  '--bg-app':    '#07091a',
  '--bg-base':   '#0e1228',
  '--bg-raised': '#121630',
  '--bg-sunken': '#050818',
  '--bg-hover':  '#161a38',
  '--bg-active': '#0c1020',
  '--bg-btn':    '#1c2040',
  '--text-primary':   '#c8d8f8',
  '--text-secondary': '#8898c8',
  '--text-muted':     '#5a6898',
  '--border':        '#202858',
  '--border-subtle': '#141c40',
  '--accent':     '#7878d8',
  '--accent-dim': '#4040a0',
  '--accent-bg':  '#0c0e28',
  '--preset-speech':  '#90b0f0',
  '--preset-whisper': '#6878c0',
  '--preset-thought': '#c0a0ff',
  '--vital-mana-start':   '#1a0c60',
  '--vital-mana-end':     '#5050c8',
  '--vital-spirit-start': '#160a48',
  '--vital-spirit-end':   '#4040b0',
  '--spell-active-color': '#c0a8ff',
  '--spell-active-glow':  'rgba(192, 168, 255, 0.5)',
  '--compass-active-text':     '#9898e8',
  '--compass-active-glow':     'rgba(120, 120, 216, 0.4)',
  '--exp-bar-bg': '#0c1020',
  '--ind-inactive-bg':     '#0c1020',
  '--ind-inactive-border': '#202858',
  '--map-bg':            '#07091a',
  '--map-chrome-bg':     '#0e1228',
  '--map-border':        '#202858',
  '--map-border-subtle': '#141c40',
  '--map-text':          '#8898c8',
  '--map-text-muted':    '#5a6898',
  '--map-btn-bg':        '#121630',
  '--map-btn-border':    '#282e58',
  '--map-select-bg':     '#050818',
  '--map-select-color':  '#7878d8',
  '--map-node-fill':     '#121630',
  '--map-node-stroke':   '#3a4480',
  '--map-arc-cardinal':  '#5a6898',
  '--map-arc-vertical':  '#7878d8',
  '--map-arc-special':   '#a060c0',
  '--map-arc-hidden':    '#3a4870',
  '--map-dot':           '#141c40',
  '--map-current-color': '#9898e8',
}

const necromancer: ThemeVars = {
  // Pure black, bone and decay — bg #0a0a0a, text #c8c8b0, accent #50a050
  '--bg-app':    '#0a0a0a',
  '--bg-base':   '#141414',
  '--bg-raised': '#181818',
  '--bg-sunken': '#080808',
  '--bg-hover':  '#1e1e1e',
  '--bg-active': '#111111',
  '--bg-btn':    '#242424',
  '--text-primary':   '#c8c8b0',
  '--text-secondary': '#909088',
  '--text-muted':     '#606060',
  '--border':        '#2c2c20',
  '--border-subtle': '#201e18',
  '--accent':     '#50a050',
  '--accent-dim': '#287828',
  '--accent-bg':  '#0c1a0c',
  '--preset-speech':  '#70b870',
  '--preset-whisper': '#508850',
  '--vital-health-ok-start':   '#0a3a10',
  '--vital-health-ok-end':     '#30880a',
  '--vital-spirit-start':      '#2a1860',
  '--vital-spirit-end':        '#6030c0',
  '--spell-active-color': '#88cc80',
  '--spell-active-glow':  'rgba(136, 204, 128, 0.4)',
  '--exp-bar-bg': '#111111',
  '--ind-inactive-bg':     '#141414',
  '--ind-inactive-border': '#2c2c20',
  '--map-bg':            '#0a0a0a',
  '--map-chrome-bg':     '#141414',
  '--map-border':        '#2c2c20',
  '--map-border-subtle': '#201e18',
  '--map-text':          '#909088',
  '--map-text-muted':    '#656558',
  '--map-btn-bg':        '#181818',
  '--map-btn-border':    '#303028',
  '--map-select-bg':     '#080808',
  '--map-select-color':  '#50a050',
  '--map-node-fill':     '#181818',
  '--map-node-stroke':   '#287828',
  '--map-arc-cardinal':  '#407040',
  '--map-arc-vertical':  '#50a050',
  '--map-arc-special':   '#408090',
  '--map-arc-hidden':    '#286028',
  '--map-dot':           '#201e18',
  '--map-current-color': '#88cc80',
}

const paladin: ThemeVars = {
  // Steel blue, noble silver — bg #0d1220, text #f0f0f8, accent #8898d8
  '--bg-app':    '#0d1220',
  '--bg-base':   '#141a28',
  '--bg-raised': '#181e30',
  '--bg-sunken': '#0a1018',
  '--bg-hover':  '#1c2238',
  '--bg-active': '#111828',
  '--bg-btn':    '#222840',
  '--text-primary':   '#f0f0f8',
  '--text-secondary': '#b0b8d0',
  '--text-muted':     '#7880a0',
  '--border':        '#28304a',
  '--border-subtle': '#1c2438',
  '--accent':     '#8898d8',
  '--accent-dim': '#4858a8',
  '--accent-bg':  '#0e1430',
  '--preset-speech':  '#a8c0f8',
  '--preset-whisper': '#7888c0',
  '--vital-mana-start':   '#0c2068',
  '--vital-mana-end':     '#2860d0',
  '--vital-spirit-start': '#1c2858',
  '--vital-spirit-end':   '#4060c8',
  '--spell-active-color': '#a8c0f8',
  '--spell-active-glow':  'rgba(168, 192, 248, 0.45)',
  '--compass-active-text':   '#a0b8e8',
  '--compass-active-glow':   'rgba(136, 152, 216, 0.4)',
  '--exit-text':       '#a0b8e8',
  '--exit-bg':         '#0e1430',
  '--exit-border':     '#3048a0',
  '--exit-text-hover': '#c0d8ff',
  '--exp-bar-bg': '#121828',
  '--ind-inactive-bg':     '#121828',
  '--ind-inactive-border': '#28304a',
  '--map-bg':            '#0d1220',
  '--map-chrome-bg':     '#141a28',
  '--map-border':        '#28304a',
  '--map-border-subtle': '#1c2438',
  '--map-text':          '#b0b8d0',
  '--map-text-muted':    '#7a84a0',
  '--map-btn-bg':        '#181e30',
  '--map-btn-border':    '#303858',
  '--map-select-bg':     '#0a1018',
  '--map-select-color':  '#8898d8',
  '--map-node-fill':     '#181e30',
  '--map-node-stroke':   '#4858a8',
  '--map-arc-cardinal':  '#6878b8',
  '--map-arc-vertical':  '#8898d8',
  '--map-arc-special':   '#6088a0',
  '--map-arc-hidden':    '#485070',
  '--map-dot':           '#1c2438',
  '--map-current-color': '#a8c0f8',
}

const ranger: ThemeVars = {
  // Forest floor, bark and moss — bg #0f1a0a, text #c8d8b0, accent #6a8a40
  '--bg-app':    '#0f1a0a',
  '--bg-base':   '#141e0e',
  '--bg-raised': '#182412',
  '--bg-sunken': '#0c1608',
  '--bg-hover':  '#1e2c14',
  '--bg-active': '#121c0e',
  '--bg-btn':    '#24341a',
  '--text-primary':   '#c8d8b0',
  '--text-secondary': '#90a870',
  '--text-muted':     '#607050',
  '--border':        '#2a3818',
  '--border-subtle': '#1e2c10',
  '--accent':     '#6a8a40',
  '--accent-dim': '#3a5818',
  '--accent-bg':  '#101800',
  '--preset-speech':  '#88c050',
  '--preset-whisper': '#608030',
  '--vital-health-ok-start':   '#1e5a10',
  '--vital-health-ok-end':     '#50b020',
  '--vital-stamina-start':     '#3a5200',
  '--vital-stamina-end':       '#88b000',
  '--compass-active-text':     '#88c050',
  '--compass-active-glow':     'rgba(136, 192, 80, 0.4)',
  '--exit-text':       '#88c050',
  '--exit-bg':         '#101800',
  '--exit-border':     '#3a5818',
  '--exit-text-hover': '#b8f070',
  '--exp-bar-bg': '#121c0e',
  '--ind-inactive-bg':     '#121c0e',
  '--ind-inactive-border': '#2a3818',
  '--map-bg':            '#0f1a0a',
  '--map-chrome-bg':     '#141e0e',
  '--map-border':        '#2a3818',
  '--map-border-subtle': '#1e2c10',
  '--map-text':          '#90a870',
  '--map-text-muted':    '#688050',
  '--map-btn-bg':        '#182412',
  '--map-btn-border':    '#2c3c18',
  '--map-select-bg':     '#0c1608',
  '--map-select-color':  '#6a8a40',
  '--map-node-fill':     '#182412',
  '--map-node-stroke':   '#3a5818',
  '--map-arc-cardinal':  '#507040',
  '--map-arc-vertical':  '#88c050',
  '--map-arc-special':   '#508848',
  '--map-arc-hidden':    '#486030',
  '--map-dot':           '#1e2c10',
  '--map-current-color': '#88c050',
}

const thief: ThemeVars = {
  // Deep shadow, tarnished coin — bg #111118, text #a8a8b8, accent #a87830
  '--bg-app':    '#111118',
  '--bg-base':   '#181820',
  '--bg-raised': '#1c1c28',
  '--bg-sunken': '#0e0e16',
  '--bg-hover':  '#222230',
  '--bg-active': '#151520',
  '--bg-btn':    '#282838',
  '--text-primary':   '#a8a8b8',
  '--text-secondary': '#7878a0',
  '--text-muted':     '#505070',
  '--border':        '#2c2c48',
  '--border-subtle': '#201e38',
  '--accent':     '#a87830',
  '--accent-dim': '#704e10',
  '--accent-bg':  '#1a1400',
  '--preset-speech':  '#c09040',
  '--preset-whisper': '#907028',
  '--spell-active-color': '#c09040',
  '--spell-active-glow':  'rgba(192, 144, 64, 0.4)',
  '--ind-hidden-color':   '#c8c8d8',
  '--ind-hidden-bg':      '#1c1c28',
  '--ind-hidden-border':  '#484878',
  '--ind-hidden-glow':    'rgba(200, 200, 216, 0.35)',
  '--exp-bar-bg': '#161620',
  '--ind-inactive-bg':     '#161620',
  '--ind-inactive-border': '#2c2c48',
  '--map-bg':            '#111118',
  '--map-chrome-bg':     '#181820',
  '--map-border':        '#2c2c48',
  '--map-border-subtle': '#201e38',
  '--map-text':          '#7878a0',
  '--map-text-muted':    '#585878',
  '--map-btn-bg':        '#1c1c28',
  '--map-btn-border':    '#303048',
  '--map-select-bg':     '#0e0e16',
  '--map-select-color':  '#a87830',
  '--map-node-fill':     '#1c1c28',
  '--map-node-stroke':   '#404068',
  '--map-arc-cardinal':  '#6060a0',
  '--map-arc-vertical':  '#a87830',
  '--map-arc-special':   '#507060',
  '--map-arc-hidden':    '#404068',
  '--map-dot':           '#201e38',
  '--map-current-color': '#c8c8d8',
}

const trader: ThemeVars = {
  // Merchant brown, rich gold — bg #180e05, text #e8d090, accent #c89020
  '--bg-app':    '#180e05',
  '--bg-base':   '#201408',
  '--bg-raised': '#261a0c',
  '--bg-sunken': '#140c04',
  '--bg-hover':  '#2c1e0e',
  '--bg-active': '#1c1208',
  '--bg-btn':    '#342814',
  '--text-primary':   '#e8d090',
  '--text-secondary': '#c0a860',
  '--text-muted':     '#907840',
  '--border':        '#3c2810',
  '--border-subtle': '#2a1c08',
  '--accent':     '#c89020',
  '--accent-dim': '#906010',
  '--accent-bg':  '#1e1400',
  '--preset-speech':  '#e0b030',
  '--preset-whisper': '#b08020',
  '--vital-stamina-start': '#6a3a00',
  '--vital-stamina-end':   '#d08020',
  '--exit-text':       '#e0b030',
  '--exit-bg':         '#1a1000',
  '--exit-border':     '#4c3008',
  '--exit-text-hover': '#f8d060',
  '--exp-bar-bg': '#1c1208',
  '--ind-inactive-bg':     '#1c1208',
  '--ind-inactive-border': '#3c2810',
  '--map-bg':            '#180e05',
  '--map-chrome-bg':     '#201408',
  '--map-border':        '#3c2810',
  '--map-border-subtle': '#2a1c08',
  '--map-text':          '#c0a860',
  '--map-text-muted':    '#907850',
  '--map-btn-bg':        '#261a0c',
  '--map-btn-border':    '#4a3018',
  '--map-select-bg':     '#140c04',
  '--map-select-color':  '#c89020',
  '--map-node-fill':     '#261a0c',
  '--map-node-stroke':   '#6a4818',
  '--map-arc-cardinal':  '#987040',
  '--map-arc-vertical':  '#d09020',
  '--map-arc-special':   '#708060',
  '--map-arc-hidden':    '#6a4818',
  '--map-dot':           '#2a1c08',
  '--map-current-color': '#e0b030',
}

const warriormage: ThemeVars = {
  // Arcane storm, elemental fire — bg #0f0f1a, text #e0d8f8, accent #c86020
  '--bg-app':    '#0f0f1a',
  '--bg-base':   '#181828',
  '--bg-raised': '#1c1c30',
  '--bg-sunken': '#0c0c16',
  '--bg-hover':  '#222238',
  '--bg-active': '#141420',
  '--bg-btn':    '#282840',
  '--text-primary':   '#e0d8f8',
  '--text-secondary': '#a8a0d0',
  '--text-muted':     '#7068a0',
  '--border':        '#2a2848',
  '--border-subtle': '#1c1a38',
  '--accent':     '#c86020',
  '--accent-dim': '#903808',
  '--accent-bg':  '#200c00',
  '--preset-speech':  '#e07830',
  '--preset-whisper': '#b05018',
  '--vital-mana-start':    '#0a1868',
  '--vital-mana-end':      '#2050d0',
  '--vital-stamina-start': '#6a3000',
  '--vital-stamina-end':   '#d06018',
  '--spell-active-color': '#e07830',
  '--spell-active-glow':  'rgba(224, 120, 48, 0.45)',
  '--rt-start': '#b05000',
  '--rt-end':   '#e89020',
  '--rt-glow':  'rgba(232, 144, 32, 0.7)',
  '--exp-bar-bg': '#141420',
  '--ind-inactive-bg':     '#141420',
  '--ind-inactive-border': '#2a2848',
  '--map-bg':            '#0f0f1a',
  '--map-chrome-bg':     '#181828',
  '--map-border':        '#2a2848',
  '--map-border-subtle': '#1c1a38',
  '--map-text':          '#a8a0d0',
  '--map-text-muted':    '#686090',
  '--map-btn-bg':        '#1c1c30',
  '--map-btn-border':    '#303048',
  '--map-select-bg':     '#0c0c16',
  '--map-select-color':  '#c86020',
  '--map-node-fill':     '#1c1c30',
  '--map-node-stroke':   '#3a3870',
  '--map-arc-cardinal':  '#6870b0',
  '--map-arc-vertical':  '#c86020',
  '--map-arc-special':   '#a050d0',
  '--map-arc-hidden':    '#604070',
  '--map-dot':           '#1c1a38',
  '--map-current-color': '#e07830',
}

const commoner: ThemeVars = {
  // Plain cloth, road dust — bg #141210, text #c8b89a, accent #7a6a50
  '--bg-app':    '#141210',
  '--bg-base':   '#1c1a18',
  '--bg-raised': '#201e1c',
  '--bg-sunken': '#111010',
  '--bg-hover':  '#262420',
  '--bg-active': '#181614',
  '--bg-btn':    '#2c2a24',
  '--text-primary':   '#c8b89a',
  '--text-secondary': '#a09078',
  '--text-muted':     '#786858',
  '--border':        '#302c24',
  '--border-subtle': '#242018',
  '--accent':     '#7a6a50',
  '--accent-dim': '#504430',
  '--accent-bg':  '#1c1810',
  '--preset-speech':  '#c0a870',
  '--preset-whisper': '#907850',
  '--exp-bar-bg': '#181614',
  '--ind-inactive-bg':     '#181614',
  '--ind-inactive-border': '#302c24',
  '--map-bg':            '#141210',
  '--map-chrome-bg':     '#1c1a18',
  '--map-border':        '#302c24',
  '--map-border-subtle': '#242018',
  '--map-text':          '#a09078',
  '--map-text-muted':    '#807060',
  '--map-btn-bg':        '#201e1c',
  '--map-btn-border':    '#382e24',
  '--map-select-bg':     '#111010',
  '--map-select-color':  '#7a6a50',
  '--map-node-fill':     '#201e1c',
  '--map-node-stroke':   '#504030',
  '--map-arc-cardinal':  '#786850',
  '--map-arc-vertical':  '#a08050',
  '--map-arc-special':   '#607060',
  '--map-arc-hidden':    '#584838',
  '--map-dot':           '#242018',
  '--map-current-color': '#c0a870',
}

const classic: ThemeVars = {
  // Pure black canvas, WhiteSmoke text — mirrors Genie's out-of-box presets.cfg defaults
  '--bg-app':    '#000000',  // game stream canvas stays true black
  '--bg-base':   '#0e0e0e',  // panel backgrounds — lifted enough to frame UI
  '--bg-raised': '#181818',  // raised surfaces (cards, dropdowns)
  '--bg-sunken': '#080808',  // recessed areas (input wells, inset panels)
  '--bg-input':  '#0a0a0a',
  '--bg-hover':  '#222222',  // needs a clear visible step up from base
  '--bg-active': '#1a1a1a',
  '--bg-btn':    '#242424',  // buttons must read against base

  '--text-primary':   '#f5f5f5',  // WhiteSmoke — Genie's exact default output color
  '--text-secondary': '#c8c8c8',  // slightly brighter for UI labels
  '--text-muted':     '#909090',  // muted UI text — still passes WCAG AA on lifted bg
  '--text-dim':       '#6f6f6f',
  '--text-faint':     '#656565',

  '--border':        '#3c3c3c',  // visible separation between panels
  '--border-subtle': '#282828',  // section dividers
  '--border-faint':  '#1c1c1c',  // very light structural lines

  '--accent':     '#c8905a',  // Warm peach — derived from Genie roomname #FFDBBF
  '--accent-dim': '#8a5e2a',  // brighter dim so interactive focus rings show
  '--accent-bg':  '#1e1208',  // lifted so accent-tinted areas are visible

  '--scrollbar-track':       '#080808',
  '--scrollbar-thumb':       '#3a3a3a',
  '--scrollbar-thumb-hover': '#585858',

  // Preset colors — exact values from Genie presets.cfg
  '--preset-speech':   '#ffccb2',  // Genie speech
  '--preset-whisper':  '#bfffff',  // Genie whispers
  '--preset-thought':  '#f9c5f9',  // Genie thoughts
  '--preset-roomname': '#ffdbbf',  // Genie roomname fg
  '--preset-roomdesc': '#f5f5f5',  // Genie roomdesc (WhiteSmoke)
  '--preset-bold':     '#ffff00',
  '--preset-expiry':   '#ff8000',  // Genie stamina orange
  '--preset-store':    '#00e686',  // Genie mana green
  '--preset-cmd':      '#c0c0c0',  // Genie inputuser silver

  '--preset-roomname-bg': '#1a0b00',  // Softened from Genie's #331600 dark brown

  // Vitals — pulled directly from Genie presets.cfg bar colors
  '--vital-health-ok-start':   '#3a0000',
  '--vital-health-ok-end':     '#dd0000',  // Genie health #FF0000
  '--vital-health-mid-start':  '#3a1a00',
  '--vital-health-mid-end':    '#cc4400',
  '--vital-health-low-start':  '#2a0000',
  '--vital-health-low-end':    '#992200',
  '--vital-health-crit-start': '#1e0000',
  '--vital-health-crit-end':   '#660000',
  '--vital-mana-start':        '#001e10',
  '--vital-mana-end':          '#00c870',  // Genie mana #00E686
  '--vital-conc-start':        '#28002a',
  '--vital-conc-end':          '#cc00cc',  // Genie concentration #FF00FF
  '--vital-stamina-start':     '#301400',
  '--vital-stamina-end':       '#cc6600',  // Genie stamina #FF8000
  '--vital-spirit-start':      '#080e1e',
  '--vital-spirit-end':        '#4878d0',  // Genie spirit #75A2FF

  // Roundtime — Genie uses #FF0000 on #400000; cast timer uses concentration magenta
  '--rt-start': '#400000',
  '--rt-end':   '#cc0000',
  '--rt-glow':  'rgba(200, 0, 0, 0.65)',
  '--ct-start': '#28002a',
  '--ct-end':   '#aa00cc',
  '--ct-glow':  'rgba(160, 0, 200, 0.6)',

  '--stance-standing-color':  '#00e686',
  '--stance-standing-border': '#004a28',
  '--stance-standing-bg':     '#001408',
  '--stance-kneeling-color':  '#f0c040',
  '--stance-kneeling-border': '#5a4010',
  '--stance-kneeling-bg':     '#161000',
  '--stance-prone-color':     '#ff8000',
  '--stance-prone-border':    '#5a2800',
  '--stance-prone-bg':        '#160800',
  '--stance-sitting-color':   '#75a2ff',
  '--stance-sitting-border':  '#1e3066',
  '--stance-sitting-bg':      '#060c1e',

  '--ind-inactive-color':  '#555555',
  '--ind-inactive-bg':     '#0a0a0a',
  '--ind-inactive-border': '#1e1e1e',

  '--ind-dead-color':  '#ff4444',
  '--ind-dead-bg':     '#200000',
  '--ind-dead-border': '#550000',
  '--ind-dead-glow':   'rgba(255, 50, 50, 0.4)',

  '--ind-stunned-color':  '#ff8000',
  '--ind-stunned-bg':     '#1e0e00',
  '--ind-stunned-border': '#4a2000',
  '--ind-stunned-glow':   'rgba(255, 128, 0, 0.35)',

  '--ind-bleeding-color':  '#ff4040',
  '--ind-bleeding-bg':     '#1a0000',
  '--ind-bleeding-border': '#4a0000',
  '--ind-bleeding-glow':   'rgba(255, 60, 60, 0.35)',

  '--ind-webbed-color':  '#00e8ff',
  '--ind-webbed-bg':     '#001a1e',
  '--ind-webbed-border': '#004858',
  '--ind-webbed-glow':   'rgba(0, 230, 255, 0.3)',

  '--ind-invisible-color':  '#f9c5f9',
  '--ind-invisible-bg':     '#160016',
  '--ind-invisible-border': '#440044',
  '--ind-invisible-glow':   'rgba(249, 197, 249, 0.3)',

  '--ind-hidden-color':  '#80c040',
  '--ind-hidden-bg':     '#0c1400',
  '--ind-hidden-border': '#2a4400',
  '--ind-hidden-glow':   'rgba(120, 190, 60, 0.3)',

  '--ind-joined-color':  '#75a2ff',
  '--ind-joined-bg':     '#060e1e',
  '--ind-joined-border': '#142050',
  '--ind-joined-glow':   'rgba(117, 162, 255, 0.3)',

  '--ind-poisoned-color':  '#68d030',
  '--ind-poisoned-bg':     '#0a1a04',
  '--ind-poisoned-border': '#1c4810',
  '--ind-poisoned-glow':   'rgba(104, 208, 48, 0.35)',

  '--ind-diseased-color':  '#d8c850',
  '--ind-diseased-bg':     '#1c1a08',
  '--ind-diseased-border': '#544c18',
  '--ind-diseased-glow':   'rgba(216, 200, 80, 0.3)',

  '--compass-active-text':     '#00e686',
  '--compass-active-glow':     'rgba(0, 230, 134, 0.4)',
  '--compass-inactive-text':   '#767676',
  '--compass-center-text':     '#585858',

  '--hand-label-color':   '#707070',
  '--hand-empty-color':   '#808080',
  '--hand-held-color':    '#ffdbbf',  // Genie roomname peach
  '--spell-empty-color':  '#808080',
  '--spell-active-color': '#f9c5f9',  // Genie thoughts pink
  '--spell-active-glow':  'rgba(249, 197, 249, 0.4)',

  '--room-title-color':   '#ffdbbf',  // Genie roomname
  '--room-desc-color':    '#f5f5f5',  // Genie roomdesc WhiteSmoke
  '--room-section-color': '#666666',
  '--room-content-color': '#a0a0a0',
  '--exit-bg':            '#100800',
  '--exit-border':        '#3a2400',
  '--exit-text':          '#80b840',
  '--exit-bg-hover':      '#1a1200',
  '--exit-border-hover':  '#5a3c00',
  '--exit-text-hover':    '#b0e060',

  '--exp-skill-color':     '#c0c0c0',
  '--exp-rank-color':      '#a0a0a0',
  '--exp-pct-color':       '#a0a0a0',
  '--exp-mindstate-color': '#a0a0a0',
  '--exp-rate-color':      '#707070',
  '--exp-bar-bg':          '#080808',
  '--exp-locked-skill':    '#ffcc00',
  '--exp-locked-mind':     '#cc9900',
  '--exp-locked-rate':     '#996600',
  '--map-bg':            '#000000',
  '--map-chrome-bg':     '#0e0e0e',
  '--map-border':        '#3c3c3c',
  '--map-border-subtle': '#282828',
  '--map-text':          '#c8c8c8',
  '--map-text-muted':    '#606060',
  '--map-btn-bg':        '#181818',
  '--map-btn-border':    '#3c3c3c',
  '--map-select-bg':     '#0a0a0a',
  '--map-select-color':  '#c8905a',
  '--map-node-fill':     '#1a1a1a',
  '--map-node-stroke':   '#404040',
  '--map-arc-cardinal':  '#808080',
  '--map-arc-vertical':  '#c8905a',
  '--map-arc-special':   '#80b840',
  '--map-arc-hidden':    '#606060',
  '--map-dot':           '#282828',
  '--map-current-color': '#00e686',
}

// v0.8.6: Classic Light — a paper-white companion to the dark Classic
// theme. Originally Rakkor's "My Ivory" custom build; promoted to a
// built-in so it ships with Lichborne and survives profile resets.
// Same indigo accent as Ivory but with hand-tuned room/exp/map colors
// for stronger contrast on a true #ffffff canvas.
const classicLight: ThemeVars = {
  '--bg-app':    '#ffffff',
  '--bg-base':   '#ffffff',
  '--bg-raised': '#efefef',
  '--bg-sunken': '#fafafa',
  '--bg-input':  '#ffffff',
  '--bg-hover':  '#e8e8e8',
  '--bg-active': '#f0f0f0',
  '--bg-btn':    '#e0e0e0',

  '--text-primary':   '#1a1a1a',
  '--text-secondary': '#4a4a4a',
  '--text-muted':     '#767676',
  // dim/faint must be LIGHTER than muted on a light theme (least-emphasis =
  // toward the white bg). They were pure black pre-v0.11.2 — an inverted ramp
  // that rendered "faint" decorative text MORE prominent than body text.
  '--text-dim':       '#969696',
  '--text-faint':     '#a6a6a6',

  '--border':         '#d0d0d0',
  '--border-subtle':  '#e0e0e0',
  '--border-faint':   '#ebebeb',

  '--accent':     '#3d4580',
  '--accent-dim': '#2a3060',
  '--accent-bg':  '#eef0f8',

  '--color-danger':        '#c03030',
  '--color-danger-dim':    '#9a2020',
  '--color-danger-bg':     '#fce8e8',
  '--color-danger-border': '#e8a0a0',
  '--color-success':       '#2a7a2a',

  '--scrollbar-track':       '#f0f0f0',
  '--scrollbar-thumb':       '#c0c0c0',
  '--scrollbar-thumb-hover': '#a0a0a0',

  '--link-color':     '#1a5a9a',
  '--cmd-link-color': 'inherit',

  '--preset-speech':   '#4a956e',
  '--preset-whisper':  '#00aaff',
  '--preset-thought':  '#000000',
  '--preset-roomname': '#111111',
  '--preset-roomdesc': '#2a2a2a',
  '--preset-bold':     '#ff5500',
  '--preset-expiry':   '#b84800',
  '--preset-store':    '#1a6a2a',
  '--preset-cmd':      '#585858',

  '--preset-speech-bg':   'transparent',
  '--preset-whisper-bg':  'transparent',
  '--preset-thought-bg':  'transparent',
  '--preset-roomname-bg': 'transparent',
  '--preset-roomdesc-bg': 'transparent',
  '--preset-bold-bg':     'transparent',
  '--preset-expiry-bg':   'transparent',
  '--preset-store-bg':    'transparent',
  '--preset-cmd-bg':      'transparent',

  '--vital-health-ok-start':   '#3a8a3a',
  '--vital-health-ok-end':     '#58c858',
  '--vital-health-mid-start':  '#9a8010',
  '--vital-health-mid-end':    '#d8b820',
  '--vital-health-low-start':  '#b05000',
  '--vital-health-low-end':    '#e07820',
  '--vital-health-crit-start': '#a01818',
  '--vital-health-crit-end':   '#d83030',
  '--vital-mana-start':        '#2a4aa8',
  '--vital-mana-end':          '#4878e8',
  '--vital-conc-start':        '#207878',
  '--vital-conc-end':          '#3ab0b8',
  '--vital-stamina-start':     '#8a4a18',
  '--vital-stamina-end':       '#d07838',
  '--vital-spirit-start':      '#5a2888',
  '--vital-spirit-end':        '#9858d8',

  '--rt-start': '#c04010',
  '--rt-end':   '#e86030',
  '--rt-glow':  'rgba(200, 60, 20, 0.35)',
  '--ct-start': '#1a3890',
  '--ct-end':   '#4070d0',
  '--ct-glow':  'rgba(40, 80, 190, 0.35)',

  '--stance-standing-color':  '#1a6a1a',
  '--stance-standing-border': '#70b870',
  '--stance-standing-bg':     '#e8f8e8',
  '--stance-kneeling-color':  '#8a6000',
  '--stance-kneeling-border': '#c8a020',
  '--stance-kneeling-bg':     '#fdf8e0',
  '--stance-prone-color':     '#8a4000',
  '--stance-prone-border':    '#c87820',
  '--stance-prone-bg':        '#fef0d8',
  '--stance-sitting-color':   '#1a4888',
  '--stance-sitting-border':  '#5888c8',
  '--stance-sitting-bg':      '#e8f0fc',

  '--ind-inactive-color':  '#808080',
  '--ind-inactive-bg':     '#ebebeb',
  '--ind-inactive-border': '#c8c8c8',
  '--ind-dead-color':      '#b02020',
  '--ind-dead-bg':         '#fce8e8',
  '--ind-dead-border':     '#e09090',
  '--ind-dead-glow':       'rgba(180, 30, 30, 0.15)',
  '--ind-stunned-color':   '#8a6000',
  '--ind-stunned-bg':      '#fdf8d8',
  '--ind-stunned-border':  '#c8a020',
  '--ind-stunned-glow':    'rgba(180, 140, 0, 0.15)',
  '--ind-bleeding-color':  '#b02020',
  '--ind-bleeding-bg':     '#fce8e8',
  '--ind-bleeding-border': '#e08888',
  '--ind-bleeding-glow':   'rgba(180, 30, 30, 0.15)',
  '--ind-webbed-color':    '#1a6868',
  '--ind-webbed-bg':       '#d8f0f0',
  '--ind-webbed-border':   '#70b8b8',
  '--ind-webbed-glow':     'rgba(20, 150, 150, 0.15)',
  '--ind-invisible-color': '#5a2080',
  '--ind-invisible-bg':    '#f0e0f8',
  '--ind-invisible-border':'#b878d8',
  '--ind-invisible-glow':  'rgba(120, 40, 180, 0.15)',
  '--ind-hidden-color':    '#1a6a1a',
  '--ind-hidden-bg':       '#e8f8e8',
  '--ind-hidden-border':   '#78c078',
  '--ind-hidden-glow':     'rgba(40, 160, 40, 0.15)',
  '--ind-joined-color':    '#1a4888',
  '--ind-joined-bg':       '#e8f0fc',
  '--ind-joined-border':   '#7088d8',
  '--ind-joined-glow':     'rgba(40, 100, 200, 0.15)',
  '--ind-poisoned-color':  '#2a6a18',
  '--ind-poisoned-bg':     '#e8f6dc',
  '--ind-poisoned-border': '#78b860',
  '--ind-poisoned-glow':   'rgba(50, 150, 40, 0.15)',
  '--ind-diseased-color':  '#806818',
  '--ind-diseased-bg':     '#f8efd0',
  '--ind-diseased-border': '#c0a850',
  '--ind-diseased-glow':   'rgba(170, 140, 40, 0.15)',

  '--compass-active-text':   '#1a6a1a',
  '--compass-active-glow':   'rgba(40, 160, 40, 0.2)',
  '--compass-inactive-text': '#a0a0a0',
  '--compass-center-text':   '#d0d0d0',

  '--hand-label-color':   '#909090',
  '--hand-empty-color':   '#a0a0a0',
  '--hand-held-color':    '#2a1800',
  '--spell-empty-color':  '#a0a0a0',
  '--spell-active-color': '#5a2080',
  '--spell-active-glow':  'rgba(120, 40, 180, 0.25)',

  '--room-title-color':   '#111111',
  '--room-desc-color':    '#2a2a2a',
  '--room-section-color': '#909090',
  '--room-content-color': '#111111',
  '--exit-bg':            '#e8f8e8',
  '--exit-border':        '#70b870',
  '--exit-text':          '#1a6a1a',
  '--exit-bg-hover':      '#d8f0d8',
  '--exit-border-hover':  '#40a040',
  '--exit-text-hover':    '#0a4a0a',

  '--exp-skill-color':     '#2a2a2a',
  '--exp-rank-color':      '#505050',
  '--exp-pct-color':       '#505050',
  '--exp-mindstate-color': '#505050',
  '--exp-rate-color':      '#707070',
  '--exp-bar-bg':          '#f0f0f0',
  '--exp-locked-skill':    '#b84800',
  '--exp-locked-mind':     '#8a3400',
  '--exp-locked-rate':     '#6a2000',
  '--exp-bar-low':         '#4caf7d',
  '--exp-bar-mid':         '#d4a017',
  '--exp-bar-high':        '#d4621a',
  '--exp-bar-locked':      '#cc4444',

  '--map-bg':            '#f5f5f5',
  '--map-chrome-bg':     '#efefef',
  '--map-border':        '#d0d0d0',
  '--map-border-subtle': '#e0e0e0',
  '--map-text':          '#4a4a4a',
  '--map-text-muted':    '#909090',
  '--map-btn-bg':        '#e0e0e0',
  '--map-btn-border':    '#c0c0c0',
  '--map-select-bg':     '#f8f8f8',
  '--map-select-color':  '#3d4580',
  '--map-node-fill':     '#e8e0d8',
  '--map-node-stroke':   '#a0a0a0',
  '--map-arc-cardinal':  '#6a7080',
  '--map-arc-vertical':  '#3d4580',
  '--map-arc-special':   '#2a7a2a',
  '--map-arc-hidden':    '#a0a0a0',
  '--map-dot':           '#d0d0d0',
  '--map-current-color': '#2a7a2a',

  '--lich-here-color':    '#00ff80',
  '--lich-here-backdrop': 'rgba(0,0,0,0.55)',
  '--lich-here-fill':     'rgba(0,255,128,0.30)',

  '--bg-deep': 'rgba(0, 0, 0, 0.35)',

  '--exp-sleep-1': '#8b6914',
  '--exp-sleep-2': '#c8a840',

  '--injury-wound1-color': '#c8aa00',
  '--injury-wound2-color': '#d26400',
  '--injury-wound3-color': '#c81e1e',
}

// ── Theme catalog ──────────────────────────────────────────────────────────

export const THEMES: Theme[] = [
  // General themes (alphabetical)
  { id: 'classic',       name: 'Classic',       category: 'general', vars: classic,      swatches: ['#000000', '#c8905a', '#f5f5f5'] },
  { id: 'classic-light', name: 'Classic',       category: 'general', vars: classicLight, swatches: ['#ffffff', '#3d4580', '#1a1a1a'] },
  { id: 'dark',          name: 'Dark',          category: 'general', vars: {},           swatches: ['#0f0f0f', '#c8a840', '#d4c9a8'] },
  { id: 'darker',     name: 'Darker',     category: 'general', vars: darker,     swatches: ['#060606', '#d9b840', '#ccc2a0'] },
  { id: 'ivory',      name: 'Ivory',      category: 'general', vars: ivory,      swatches: ['#ffffff', '#3d4580', '#1a1a1a'] },
  { id: 'mist',       name: 'Mist',       category: 'general', vars: mist,       swatches: ['#e6eaef', '#2a6ab0', '#1c2028'] },
  { id: 'parchment',  name: 'Parchment',  category: 'general', vars: parchment,  swatches: ['#f0ead8', '#8b4c00', '#2a1f0e'] },
  { id: 'slate',      name: 'Slate',      category: 'general', vars: slate,      swatches: ['#0d1117', '#58a6ff', '#c9d1d9'] },
  { id: 'terminal',   name: 'Terminal',   category: 'general', vars: terminal,   swatches: ['#000000', '#00ff41', '#00ff41'] },
  // Guild themes
  { id: 'barbarian',   name: 'Barbarian',   category: 'guild', vars: barbarian,   swatches: ['#1a0f0a', '#8b1a1a', '#d4b896'] },
  { id: 'bard',        name: 'Bard',        category: 'guild', vars: bard,        swatches: ['#1a1020', '#c08030', '#e8d5a0'] },
  { id: 'cleric',      name: 'Cleric',      category: 'guild', vars: cleric,      swatches: ['#0d1020', '#c8a840', '#e8eaf0'] },
  { id: 'commoner',    name: 'Commoner',    category: 'guild', vars: commoner,    swatches: ['#141210', '#7a6a50', '#c8b89a'] },
  { id: 'empath',      name: 'Empath',      category: 'guild', vars: empath,      swatches: ['#0d1a12', '#60b870', '#d8f0d8'] },
  { id: 'moonmage',    name: 'Moon Mage',   category: 'guild', vars: moonmage,    swatches: ['#07091a', '#7878d8', '#c8d8f8'] },
  { id: 'necromancer', name: 'Necromancer', category: 'guild', vars: necromancer, swatches: ['#0a0a0a', '#50a050', '#c8c8b0'] },
  { id: 'paladin',     name: 'Paladin',     category: 'guild', vars: paladin,     swatches: ['#0d1220', '#8898d8', '#f0f0f8'] },
  { id: 'ranger',      name: 'Ranger',      category: 'guild', vars: ranger,      swatches: ['#0f1a0a', '#6a8a40', '#c8d8b0'] },
  { id: 'thief',       name: 'Thief',       category: 'guild', vars: thief,       swatches: ['#111118', '#a87830', '#a8a8b8'] },
  { id: 'trader',      name: 'Trader',      category: 'guild', vars: trader,      swatches: ['#180e05', '#c89020', '#e8d090'] },
  { id: 'warriormage', name: 'Warrior Mage',category: 'guild', vars: warriormage, swatches: ['#0f0f1a', '#c86020', '#e0d8f8'] },
]

// v0.8.4 (B114): post-apply hook so accessibility overlays (high contrast,
// color blind) get re-applied immediately after any theme write. Without
// this, applyTheme / applyCustomTheme overwrite the overlay vars and leave
// them dead until something else triggers re-apply — e.g. ThemeEditor
// live-editing repeatedly clobbered the colorblind overlay until save.
// settings.ts can't be imported here without a circular dep, so GameWindow
// (the live owner of AppSettings) registers a callback that closes over
// its current settings state.
let postApplyHook: (() => void) | null = null
export function registerThemeAppliedHook(fn: (() => void) | null): void {
  postApplyHook = fn
}

export function applyTheme(theme: Theme): void {
  // MAP_STRUCTURAL_CASCADE applied LAST so a built-in theme's pinned --map-*
  // literals can't override the cascade (Binu's map-doesn't-follow-theme bug).
  const base: ThemeVars = theme.id === 'dark' ? darkBase : { ...darkBase, ...theme.vars }
  const vars: ThemeVars = { ...base, ...MAP_STRUCTURAL_CASCADE }
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value)
  }
  localStorage.setItem('lichborne.theme', theme.id)
  postApplyHook?.()
}

export function applyCustomTheme(vars: ThemeVars, id?: string): void {
  // MAP_STRUCTURAL_CASCADE last — see applyTheme (forces the map to follow the
  // general palette even for a custom theme carrying inherited --map-* literals).
  const merged: ThemeVars = { ...darkBase, ...vars, ...MAP_STRUCTURAL_CASCADE }
  for (const [key, value] of Object.entries(merged)) {
    document.documentElement.style.setProperty(key, value)
  }
  if (id) localStorage.setItem('lichborne.theme', id)
  postApplyHook?.()
}

export function initTheme(): void {
  const savedId = localStorage.getItem('lichborne.theme') ?? 'classic'
  const base = THEMES.find(t => t.id === savedId)
  if (base) { applyTheme(base); return }
  try {
    const customs = JSON.parse(localStorage.getItem('lichborne.myThemes') ?? '[]')
    const custom = customs.find((t: { id: string; vars: ThemeVars }) => t.id === savedId)
    if (custom) { applyCustomTheme(custom.vars); return }
  } catch { /* ignore */ }
  applyTheme(THEMES[0])
}
