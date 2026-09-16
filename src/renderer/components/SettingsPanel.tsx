// Settings panel — the one modal that edits BOTH kinds of setting, and the
// split is the thing to understand before adding a row:
//   - PER-CHARACTER `AppSettings` (Display · Accessibility · Layout ·
//     Behavior's first three rows): `set(key, value)` → `onChange({…})`; the
//     parent (GameWindow, which renders this) owns persistence. The Layout
//     radios grey out in Windowed Panels (`layoutMode`), where those bars are
//     windows of their own.
//   - APP-WIDE blocks that live in `_shared.yaml`, each held as local state
//     and flushed on change: Session Log (`SessionLogSettings`, a
//     read-modify-write of ONLY the capture/retention fields so the Logs
//     modal's own prefs aren't clobbered), AI (`AIConfig` — the KEY itself
//     lives in main's safeStorage and only its presence is shown; a save
//     RE-QUERIES rather than assuming success), SimuCoins (`SimuCoinConfig`,
//     persisted from an identity-guarded EFFECT — never inside a setState
//     updater — with all three of save + `scheduleSharedProfileSave` +
//     `SIMUCOIN_CHANGED_EVENT`, and adopting changes made in another window),
//     command-history minimum length (F82) and the Overview options
//     (v0.19.0, through overviewStore).
// F61 search + nav rail: every row has a `vis(section, …labels)` boolean and
// every section a `sec*` flag; `SECTION_NAMES`, the `sectionRendered` map and
// the `ref`'d section wrappers MUST stay in sync or the rail offers a jump to
// nothing (`jumpToSection` lands the coin popover's "Set up in Settings…").
// Lich Setup is NOT embedded — the row opens the shared `LichSetupDialog`.
// The font picker enumerates installed fonts via `queryLocalFonts` and
// detects monospace with a canvas width test; `LEGACY_KEYS` migrates retired
// preset keys, and `cascadia` is deliberately NOT one of them (see below).

import { useState, useEffect, useRef, useId } from 'react'
import { loadCommandHistorySettings, saveCommandHistorySettings, CMD_HISTORY_MIN_MAX } from '../commandHistorySettings'
import { useOverviewOptions, setOverviewOptions, MAX_FEED_LINES, type OverviewOptions } from '../overviewStore'
import { backdropHandlers } from '../utils/backdropClose'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { pressable } from '../utils/pressable'
import { confirmAction } from '../confirm'
import { createPortal } from 'react-dom'
import type { SessionLogDiskUsage, SimuCoinStatus } from '../../shared/types'
import { FONT_FAMILIES, FONT_FAMILY_LABELS, DEFAULT_SETTINGS, resolveFontFamily, type AppSettings } from '../settings'
import { HIGHLIGHT_EFFECTS, type HighlightEffect } from '../highlights'
// The preview is painted by the SAME builder the app bar uses, so what you
// pick here is exactly what you get up there (pitfall #127 / B281).
import { paintBrandMark } from '../utils/brandMark'
import { type SessionLogSettings, loadSessionLogSettings, saveSessionLogSettings } from '../sessionLogSettings'
import { type AIConfig, loadAIConfig, saveAIConfig, AI_TEXT_MODELS } from '../aiConfig'
import { aiSessionUsage } from '../ai/aiClient'
import { exportSharedProfile, scheduleSharedProfileSave } from '../profile'
import {
  loadSimuCoinConfig, saveSimuCoinConfig, accountConfig, setAccountConfig,
  simucoinStateText, simucoinBalanceText, SIMUCOIN_DISCLOSURE, SIMUCOIN_CHANGED_EVENT, SIMUCOIN_KEY,
  type SimuCoinConfig, type SimuCoinAccountConfig,
} from '../simucoinConfig'
import LichSetupDialog from './LichSetupDialog'
import '../styles/settings.css'
import '../styles/login.css'

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<{ family: string }[]>
  }
}

// Transparent migration: legacy preset keys stored in settings → actual font name.
//
// NOTE: 'cascadia' is intentionally NOT in this map (v0.7.1). It IS the active
// default value in DEFAULT_SETTINGS, not a legacy preset — migrating it to
// 'Cascadia Code' loses the wide FONT_FAMILIES fallback chain ('Cascadia Code'
// → 'Fira Code' → 'Consolas' → monospace) and replaces it with the narrower
// `'Cascadia Code', monospace` form. On a machine that doesn't have Cascadia
// installed (e.g. plain Win10 with no Windows Terminal), that change made the
// font visibly flip from Consolas to generic monospace the moment a fresh
// user opened Settings. The 'cascadia' key stays through the FONT_FAMILIES
// lookup forever; only the other three preset keys (which were truly retired)
// migrate to a real font name. B348: those names are Windows fonts, so off
// Windows they rely on settings.ts `resolveFontFamily` giving each the right
// tail (Segoe UI → system sans, Georgia → serif, Lucida Console → Menlo/DejaVu)
// rather than generic monospace.
const LEGACY_KEYS: Record<string, string> = {
  terminal: 'Lucida Console',
  sansserif: 'Segoe UI',
  serif:     'Georgia',
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const PREVIEW_LINES = [
  { text: '[The Crossing, Town Square]',           cls: 'sp-preview-roomname' },
  { text: 'A bustling square at the heart of the city.' },
  { text: 'Vayne says, "Watch your step."',         cls: 'sp-preview-speech'   },
  { text: 'You sense Kaela thinking, "Low mana."', cls: 'sp-preview-thought'  },
  { text: 'The troll swings at you and connects!', cls: 'sp-preview-bold'     },
]

interface Props {
  settings: AppSettings
  character: string                 // owning character — for "Open Logs Folder"
  onChange: (s: AppSettings) => void
  layoutMode?: 'panels' | 'free'    // §33 — grey out panel-only toggles in Windowed Panels
  onClose: () => void
  // SimuCoin (F71, DESIGN §42) — app-level, per ACCOUNT, threaded down from App
  // via GameWindow. Setup lives HERE as of v0.18.1 (it used to be inline in the
  // app-bar coin popover, which repeated the whole consent disclosure once per
  // account and grew past the viewport for a user with 7 of them). Absent →
  // the section simply doesn't render.
  simucoin?: {
    accounts: string[]
    withPassword: Set<string>
    statuses: Record<string, SimuCoinStatus>
    busy: Set<string>
    run: (account: string, claim: boolean) => Promise<unknown>
  }
  /** F61 nav rail target: scroll this section into view on open. Set when the
   *  coin popover's "Set up in Settings…" opened us, so the user LANDS on
   *  SimuCoins instead of hunting a long modal for it. */
  jumpToSection?: string
}

function Toggle({ label, checked, onChange, description }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  description?: string
}) {
  // B335: a real <button role="switch">, so Tab reaches it and Space/Enter
  // flip it. A <button> is labelable, so the wrapping <label> now forwards a
  // click on the label text to it (the old div made that click do nothing). A
  // click on the button itself activates it once, and the label adds no second
  // click, so it can never toggle twice.
  return (
    <label className="sp-toggle-row">
      <div className="sp-toggle-text">
        <span className="sp-toggle-label">{label}</span>
        {description && <span className="sp-toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`sp-toggle${checked ? ' sp-toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="sp-toggle-thumb" />
      </button>
    </label>
  )
}

function RadioGroup<T extends string>({ label, value, options, onChange, disabled, disabledHint }: {
  label: string
  value: T
  options: { value: T; label: string; description?: string }[]
  onChange: (v: T) => void
  disabled?: boolean
  disabledHint?: string
}) {
  return (
    <div className={`sp-radio-group${disabled ? ' sp-radio-group--disabled' : ''}`}>
      <div className="sp-field-label">
        {label}
        {disabled && disabledHint && <span className="sp-field-hint"> — {disabledHint}</span>}
      </div>
      {options.map(opt => (
        <label key={opt.value} className={`sp-radio-row${value === opt.value ? ' sp-radio-row--active' : ''}`}>
          <input type="radio" checked={value === opt.value} disabled={disabled} onChange={() => onChange(opt.value)} />
          <div className="sp-radio-text">
            <span className="sp-radio-label">{opt.label}</span>
            {opt.description && <span className="sp-radio-desc">{opt.description}</span>}
          </div>
        </label>
      ))}
    </div>
  )
}

// ── F61: settings search + section nav ─────────────────────────────────
// Section names in render order — drives the nav rail. Keep in sync with the
// `sec*` section wrappers in the JSX below.
const SECTION_NAMES = ['Display', 'Accessibility', 'Layout', 'Overview', 'Behavior', 'Session Log', 'AI', 'SimuCoins', 'Lich Setup'] as const

// Row-visibility helper for the global settings filter: empty query shows
// everything; otherwise a row stays visible when the (lowercased, trimmed)
// query appears in its section name or any of its label texts / keywords.
// Module-scope on purpose (UX polish standard #4 — no inline component
// types / helpers recreated per render).
function rowVisible(q: string, section: string, ...labels: string[]): boolean {
  if (!q) return true
  if (section.toLowerCase().includes(q)) return true
  return labels.some(l => l.toLowerCase().includes(q))
}

export default function SettingsPanel({ settings, character, onChange, layoutMode, onClose, simucoin, jumpToSection }: Props) {
  // Esc closes (B327/B341). While the search box holds text it consumes the
  // first Esc to clear itself; an empty search lets Esc fall through here.
  useEscapeClose(onClose)
  const titleId = useId()
  // B397: open with the caret in the search box — the first thing you reach
  // for in a long settings list — instead of nowhere.
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { searchRef.current?.focus({ preventScroll: true }) }, [])
  const inWindowed = layoutMode === 'free'
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [monoFonts,   setMonoFonts]   = useState<Set<string>>(new Set())
  const [fontQuery,   setFontQuery]   = useState('')
  const [fontFilter,  setFontFilter]  = useState<'all' | 'mono'>('all')
  const fontListRef = useRef<HTMLDivElement>(null)

  // ── Lich Setup ──────────────────────────────────────────────────────────
  // The full path/port/mode editor lives in the shared LichSetupDialog (the
  // same one the Launcher's "⚙ Lich Setup" button opens); this panel just
  // launches it so the two surfaces stay identical and we don't embed a second
  // copy of the fields here. The dialog (z-index 600) stacks above Settings.
  const [showLichSetup, setShowLichSetup] = useState(false)

  // Session Log sub-options are collapsed by default so the section is short —
  // the user sees the master toggle plus a disclosure hinting more is there.
  const [logExpanded, setLogExpanded] = useState(false)

  // F61: global settings filter (separate from the font-family sp-font-search)
  // + section refs for the nav rail's scrollIntoView jumps. Refs, not ids —
  // the modal portals to document.body, so ids could collide if a second
  // SettingsPanel is ever mounted in the same document.
  const [query, setQuery] = useState('')
  // F82 (Qij, via Sekmeht) — APP-WIDE, so it lives in _shared.yaml rather than
  // per-character `settings`. Held in local state and flushed on change, the
  // same shape the Session Log block uses.
  const [cmdHist, setCmdHist] = useState(() => loadCommandHistorySettings())
  function setCmdHistMin(n: number) {
    const next = { minLength: Math.max(0, Math.min(CMD_HISTORY_MIN_MAX, n)) }
    setCmdHist(next)
    saveCommandHistorySettings(next)
    scheduleSharedProfileSave()
  }

  // Views (v0.19.0). Also APP-WIDE, so it follows the same shape: read the
  // store, write through it, flush _shared.yaml. `useOverviewOptions` keeps this
  // in step if `/view set` changes something while Settings is open.
  const ovOptions = useOverviewOptions()
  function setOv(patch: Partial<OverviewOptions>) {
    setOverviewOptions(patch)
    scheduleSharedProfileSave()
  }

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Land on a requested section (the coin popover's "Set up in Settings…").
  // Deferred a frame so the section refs are populated and the modal has laid
  // out; `block:'start'` matches what the nav rail's own buttons do. Silently
  // no-ops if that section isn't currently rendered (e.g. filtered out).
  useEffect(() => {
    if (!jumpToSection) return
    const id = requestAnimationFrame(() => {
      sectionRefs.current[jumpToSection]?.scrollIntoView({ behavior: 'auto', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [jumpToSection])

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    onChange({ ...settings, [key]: value })
  }

  // B370: this ran in one click, from a button 8px from the ✕. The detail
  // names what DEFAULT_SETTINGS actually covers — the per-character
  // AppSettings, per-panel text sizes included — and what it leaves alone.
  async function resetToDefaults() {
    const ok = await confirmAction({
      title: 'Reset settings to defaults?',
      message: `Display, accessibility, layout and behavior settings for ${character} go back to their defaults.`,
      detail: 'That includes the font, line height, text weight and any per-panel text sizes. Settings shared by every character — Overview, command history, Session Log, AI and SimuCoins — are not changed.',
      confirmLabel: 'Reset',
      danger: true,
    })
    if (ok) onChange({ ...DEFAULT_SETTINGS })
  }

  // ── Session Log settings (app-wide — _shared.yaml, not per-character) ────
  // Working copy in localStorage, debounced exportSharedProfile keeps
  // _shared.yaml current (same pattern LichSetupDialog uses for adv). The save is a read-modify-
  // write of only the capture/retention fields this panel owns, so it can't
  // clobber the filter / export prefs the Logs modal owns (relevant only if
  // both modals are open at once).
  const [logCfg, setLogCfg] = useState<SessionLogSettings>(loadSessionLogSettings)
  useEffect(() => {
    saveSessionLogSettings({
      ...loadSessionLogSettings(),
      enabled:         logCfg.enabled,
      captureMain:     logCfg.captureMain,
      captureStreams:  logCfg.captureStreams,
      captureCommands: logCfg.captureCommands,
      captureSystem:   logCfg.captureSystem,
      retentionDays:   logCfg.retentionDays,
      compress:        logCfg.compress,
      maxRawMB:        logCfg.maxRawMB,
    })
    const t = setTimeout(() => exportSharedProfile().catch(console.error), 1000)
    return () => clearTimeout(t)
  }, [logCfg])
  function setLog<K extends keyof SessionLogSettings>(key: K, value: SessionLogSettings[K]) {
    setLogCfg(c => ({ ...c, [key]: value }))
  }

  // ── AI config (app-wide — _shared.yaml, not per-character; DESIGN §10) ────
  // Same pattern as the Session Log block: a localStorage working copy + a
  // debounced exportSharedProfile. The API KEY is separate — it lives in main's
  // safeStorage and only its presence (a boolean) is surfaced here.
  const [aiCfg, setAiCfg] = useState<AIConfig>(loadAIConfig)

  // ── SimuCoin (F71, DESIGN §42) ─────────────────────────────────────────────
  const [scCfg, setScCfg] = useState<SimuCoinConfig>(loadSimuCoinConfig)

  // Only accounts with a SAVED PASSWORD can be enabled — the store sign-in has
  // no other credential source (DESIGN §42), so offering the rest would be a
  // toggle that can't work.
  const scAccounts = (simucoin?.accounts ?? []).filter(a => simucoin?.withPassword.has(a))
  const scNoPassword = (simucoin?.accounts ?? []).length - scAccounts.length

  // Write path (Principle #1): localStorage working copy → scheduled
  // _shared.yaml save → a same-window notification so the app-bar coin updates
  // NOW (a `storage` event never fires in the writing window — see
  // simucoinConfig.ts). All three, or one of the surfaces goes stale.
  //
  // Persisted from an EFFECT, exactly like aiCfg above — never from inside the
  // setState updater. StrictMode double-invokes updaters, so a side effect
  // scheduled there runs twice (the v0.17.0 About-modal lesson); here that
  // would double-dispatch the change event on every toggle.
  //
  // The identity guard makes this fire ONLY on a real edit: initialised to the
  // loaded config, so the mount pass is a no-op, and StrictMode's second mount
  // pass is too (same object). Only setScCfg mints a new object.
  const scSavedRef = useRef(scCfg)
  useEffect(() => {
    if (scSavedRef.current === scCfg) return
    scSavedRef.current = scCfg
    saveSimuCoinConfig(scCfg)
    scheduleSharedProfileSave()
    document.dispatchEvent(new CustomEvent(SIMUCOIN_CHANGED_EVENT))
  }, [scCfg])

  // Typed off the interface, NOT a restated inline shape — a hand-copied
  // `Partial<{ consented; autoClaim }>` silently excludes every field added to
  // the record later, which is how a new field gets quietly dropped at the
  // write path (pitfall #121's "the type has to follow" rider).
  function setSc(account: string, patch: Partial<SimuCoinAccountConfig>) {
    setScCfg(prev => setAccountConfig(prev, account, patch))
  }

  // Adopt changes made ELSEWHERE, or this panel writes a stale snapshot over
  // them: with Settings open in two windows, toggling an account here would
  // persist our whole `scCfg` and silently undo a consent change the other
  // window just made. Consent is the one setting where a silent revert matters
  // (App.runSimucoin re-reads localStorage at the choke point, so whatever
  // lands there IS the truth). `storage` covers the other window; the custom
  // event covers our own — it never fires in the window that wrote.
  //
  // scSavedRef is updated FIRST so the persist effect above treats the adopted
  // value as already-saved. Without that it would re-save and re-dispatch,
  // and two open panels would ping-pong the event between them.
  useEffect(() => {
    const adopt = () => { const c = loadSimuCoinConfig(); scSavedRef.current = c; setScCfg(c) }
    const onStorage = (e: StorageEvent) => { if (e.key === SIMUCOIN_KEY) adopt() }
    window.addEventListener('storage', onStorage)
    document.addEventListener(SIMUCOIN_CHANGED_EVENT, adopt)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener(SIMUCOIN_CHANGED_EVENT, adopt)
    }
  }, [])
  const [aiKeyPresent, setAiKeyPresent] = useState(false)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestMsg, setAiTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    window.api.aiKeyStatus().then(s => setAiKeyPresent(s.text)).catch(() => {})
  }, [])
  useEffect(() => {
    saveAIConfig(aiCfg)
    const t = setTimeout(() => exportSharedProfile().catch(console.error), 1000)
    return () => clearTimeout(t)
  }, [aiCfg])
  function setAi<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setAiCfg(c => ({ ...c, [key]: value }))
  }
  async function saveAiKey() {
    const key = aiKeyInput.trim()
    if (!key) return
    await window.api.aiSetKey('text', key)
    // RE-QUERY instead of assuming success. setAIKey() silently no-ops when
    // the OS has no credential store — on Linux with no keyring (GNOME
    // Keyring / KWallet) that meant a green "✓ Key saved" for a key that was
    // never written, and every later AI call reporting "no key configured"
    // with no way to find out why. Trusting the write is the bug; this is
    // honest on every platform (Windows/macOS always have a store, so their
    // behaviour is unchanged).
    const present = await window.api.aiKeyStatus().then(s => s.text).catch(() => false)
    setAiKeyPresent(present)
    if (!present) {
      setAiTestMsg({ ok: false, text: "Couldn't save the key — no OS credential store is available. On Linux, install GNOME Keyring or KWallet, then try again." })
      return
    }
    setAiKeyInput('')
    setAiTestMsg(null)
    // Tell any mounted GameWindow to re-fetch key presence — its aiKeyPresentRef
    // is fetched once on mount, so /ai status would otherwise stay stale until
    // reconnect (a cross-window `storage` event never fires in the writing window,
    // and the key isn't in localStorage anyway — hence a same-doc CustomEvent).
    document.dispatchEvent(new CustomEvent('lichborne:ai-key-changed'))
  }
  async function clearAiKey() {
    // B370: deleting the saved key used to take one click.
    const ok = await confirmAction({
      title: 'Delete the saved API key?',
      message: 'Your Anthropic API key is removed from this machine.',
      detail: "AI features stop working until you save a key again. This can't be undone.",
      confirmLabel: 'Delete key',
      danger: true,
    })
    if (!ok) return
    await window.api.aiClearKey('text')
    setAiKeyPresent(false)
    setAiTestMsg(null)
    document.dispatchEvent(new CustomEvent('lichborne:ai-key-changed'))
  }
  async function testAiKey() {
    setAiTesting(true)
    setAiTestMsg(null)
    try {
      const r = await window.api.aiTestKey('text', aiCfg.textModel)
      setAiTestMsg(r.ok ? { ok: true, text: 'Key works.' } : { ok: false, text: r.error ?? 'Test failed.' })
    } finally {
      setAiTesting(false)
    }
  }

  // ── Session Log disk usage ──────────────────────────────────────────────
  const [logUsage, setLogUsage] = useState<SessionLogDiskUsage | null>(null)
  useEffect(() => {
    let cancelled = false
    window.api.sessionLogDiskUsage(character)
      .then(u => { if (!cancelled) setLogUsage(u) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [character])

  // Migrate legacy preset key → font name on first open
  useEffect(() => {
    if (LEGACY_KEYS[settings.fontFamily]) set('fontFamily', LEGACY_KEYS[settings.fontFamily])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Enumerate installed system fonts and detect monospace via canvas width test
  useEffect(() => {
    window.queryLocalFonts?.()
      .then(fonts => {
        const families = [...new Set(fonts.map(f => f.family))].sort()
        setSystemFonts(families)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        const mono = new Set<string>()
        for (const family of families) {
          ctx.font = `16px '${family}'`
          if (ctx.measureText('i').width === ctx.measureText('W').width) mono.add(family)
        }
        setMonoFonts(mono)
      })
      .catch(() => {})
  }, [])

  // Scroll selected font into view whenever the list loads, filter, or selection changes
  useEffect(() => {
    if (fontQuery) return
    fontListRef.current?.querySelector('.sp-font-item--active')
      ?.scrollIntoView({ block: 'nearest' })
  }, [settings.fontFamily, systemFonts, fontQuery, fontFilter])

  const baseList = fontFilter === 'mono' ? systemFonts.filter(f => monoFonts.has(f)) : systemFonts
  const filteredFonts = fontQuery
    ? baseList.filter(f => f.toLowerCase().includes(fontQuery.toLowerCase()))
    : baseList

  // When `settings.fontFamily` is a preset key like 'cascadia', no installed
  // font name matches it literally — the FONT_FAMILIES chain resolves it at
  // render time but the picker's `name === settings.fontFamily` comparison
  // would never highlight anything. Resolve to the FIRST font in the chain
  // (the preferred face) so the list shows the correct active row. For an
  // explicit font name the value passes through unchanged.
  const activeFontName = (() => {
    const chain = FONT_FAMILIES[settings.fontFamily]
    if (!chain) return settings.fontFamily
    const first = chain.match(/^'([^']+)'/)
    return first ? first[1] : settings.fontFamily
  })()

  // ── F61: per-row visibility for the global settings filter ──────────────
  // One boolean per existing row, applied mechanically as `{vX && (…)}` in
  // the JSX below. A section shows while any of its rows match; the nav rail
  // hides while a query is active.
  const q = query.trim().toLowerCase()
  const searching = q !== ''
  const vis = (section: string, ...labels: string[]) => rowVisible(q, section, ...labels)

  const vFontFamily    = vis('Display', 'Font family', 'monospace')
  const vFontSize      = vis('Display', 'Font size', 'game text')
  const vLineHeight    = vis('Display', 'Line height')
  const vTextWeight    = vis('Display', 'Text weight')
  const vPreview       = vis('Display', 'Preview', 'font')
  const vBrandEffect   = vis('Display', 'Wordmark effect', 'lichborne', 'brand', 'logo', 'title', 'app bar', 'rainbow', 'glow')
  const secDisplay     = vFontFamily || vFontSize || vLineHeight || vTextWeight || vPreview || vBrandEffect
  // Live wordmark preview for the row below — same builder as the app bar.
  const brandPreview   = paintBrandMark(settings.brandEffect)

  const vLargePrint    = vis('Accessibility', 'Large print')
  const vHighContrast  = vis('Accessibility', 'High contrast')
  const vEpilepsy      = vis('Accessibility', 'Epilepsy safe mode', 'animations')
  const vColorBlind    = vis('Accessibility', 'Color blind mode', 'deuteranopia', 'protanopia', 'tritanopia')
  const secAccess      = vLargePrint || vHighContrast || vEpilepsy || vColorBlind

  const vVitalsPos     = vis('Layout', 'Vitals bar position')
  const vCompactVitals = vis('Layout', 'Compact vitals')
  const vCompactExp    = vis('Layout', 'Compact experience panel')
  const vIconBarPos    = vis('Layout', 'Icon bar position', 'status bar', 'compass')
  // B336: the label spells out roundtime / cast time; the old "RT / CT" stays
  // as a search term for anyone who knows it by the abbreviation.
  const vTimerStyle    = vis('Layout', 'Roundtime / cast time timer style', 'RT / CT', 'roundtime')
  const secLayout      = vVitalsPos || vCompactVitals || vCompactExp || vIconBarPos || vTimerStyle

  // Views (v0.19.0). App-wide, like Session Log / AI / SimuCoins — the Overview
  // is cross-character by definition, so these can't be per-character settings.
  const vOvFeed        = vis('Overview', 'Text feed', 'overview', 'dashboard', 'views', 'card')
  const vOvTiles       = vis('Overview', 'Tile size', 'overview', 'tiles', 'grid', 'columns', 'scale', 'views')
  const vOvDensity     = vis('Overview', 'Card density', 'overview', 'compact', 'views')
  const vOvSort        = vis('Overview', 'Card order', 'overview', 'attention', 'sort', 'views')
  const vOvSections    = vis('Overview', 'Card sections', 'overview', 'vitals', 'room', 'injuries', 'views')
  const vOvIdle        = vis('Overview', 'Idle after', 'overview', 'attention', 'views')
  const vOvSpeech      = vis('Overview', 'Flag when someone speaks', 'overview', 'attention', 'speech', 'views')
  const vOvPulse       = vis('Overview', 'Flash a card when a character is critical', 'overview', 'pulse', 'alert', 'flash', 'health', 'views')
  const secOverview    = vOvFeed || vOvDensity || vOvSort || vOvSections || vOvIdle || vOvSpeech || vOvPulse || vOvTiles

  const vAutoLink      = vis('Behavior', 'Auto-link URLs')
  const vWebSafety     = vis('Behavior', 'Web link safety', 'bounce')
  const vMapAnim       = vis('Behavior', 'Genie map animations')
  // The command-history row used to render whenever Behavior did, so a search
  // for "history" found nothing — and a search for "links" showed it anyway.
  const vCmdHist       = vis('Behavior', 'Remember commands of at least', 'command history', 'up-arrow', 'recall')
  const secBehavior    = vAutoLink || vWebSafety || vMapAnim || vCmdHist

  const vAiEnable      = vis('AI', 'Enable AI features', 'artificial intelligence', 'byok')
  const vAiKey         = vis('AI', 'Anthropic API key', 'claude', 'byok')
  const vAiModel       = vis('AI', 'Text model', 'haiku', 'sonnet', 'opus', 'fable')
  const vAiPersona     = vis('AI', 'Response voice', 'persona', 'style', 'personality', 'tone')
  const vAiUsage       = vis('AI', 'Usage this session', 'tokens', 'cost')
  const secAI          = vAiEnable || vAiKey || vAiModel || vAiPersona || vAiUsage

  const vScAccounts    = vis('SimuCoins', 'SimuCoins', 'simucoin', 'store', 'claim', 'free coins', 'monthly')
  // No accounts (or none with a saved password) → nothing to configure, so the
  // section stays hidden rather than showing an empty header.
  const secSimuCoin    = vScAccounts && scAccounts.length > 0

  const vLogEnabled    = vis('Session Log', 'Enable session logging')
  const vLogOptions    = vis('Session Log', 'Logging options')
  const vLogMain       = vis('Session Log', 'Game text')
  const vLogStreams    = vis('Session Log', 'Stream content')
  const vLogCommands   = vis('Session Log', 'Commands')
  const vLogSystem     = vis('Session Log', 'System messages')
  const vLogCompress   = vis('Session Log', 'Compress old logs')
  const vLogRetention  = vis('Session Log', 'Keep logs for', 'retention')
  const vLogMaxRaw     = vis('Session Log', 'Cap uncompressed logs')
  const vLogUsage      = vis('Session Log', 'Disk usage')
  const vLogFiles      = vis('Session Log', 'Log files', 'Open logs folder')
  const anyLogSub      = vLogMain || vLogStreams || vLogCommands || vLogSystem
                      || vLogCompress || vLogRetention || vLogMaxRaw || vLogUsage || vLogFiles
  const showLogBlock   = vLogOptions || anyLogSub
  // Section header shows only if something under it will actually render —
  // the sub-option block is gated on logCfg.enabled, so a sub-row match with
  // logging disabled must not leave a bare header.
  const secSessionLog  = vLogEnabled || (logCfg.enabled && showLogBlock)
  // Display-level courtesy while searching: a matched sub-row must be VISIBLE
  // (requirement of the filter), so the sublist force-opens without touching
  // the user's logExpanded state.
  const logListOpen    = logExpanded || (searching && anyLogSub)

  const vLichRow       = vis('Lich Setup', 'Lich path, port & mode', 'launch', 'connect')
  const secLichSetup   = vLichRow

  // Which sections actually render — drives the nav rail so it can't offer a
  // jump to a section that isn't on screen. Keys MUST match SECTION_NAMES.
  const sectionRendered: Record<string, boolean> = {
    Display: secDisplay,
    Accessibility: secAccess,
    Layout: secLayout,
    Overview: secOverview,
    Behavior: secBehavior,
    'Session Log': secSessionLog,
    AI: secAI,
    SimuCoins: secSimuCoin,
    'Lich Setup': secLichSetup,
  }

  // Derived from the same map as the nav rail, so a section can't render
  // while the "No settings match" line also shows — Overview and SimuCoins
  // were missing from a hand-written list, so searching "overview" said
  // nothing matched directly above the Overview section.
  const noMatches = searching && !Object.values(sectionRendered).some(Boolean)

  return createPortal(
    <div className="sp-backdrop ui-modal-backdrop" {...backdropHandlers(() => onClose())}>
      <div className="sp-modal ui-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>

        <div className="ui-modal-head">
          <span className="ui-modal-title" id={titleId}>Settings</span>
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        {/* F61: global settings filter — separate from the font list's sp-font-search */}
        <div className="sp-searchbar">
          <input
            ref={searchRef}
            type="text"
            className="sp-search-input"
            aria-label="Search settings"
            placeholder="Search settings…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            // Esc with text clears the search and is consumed (preventDefault), so
            // Settings stays open. An empty search lets Esc through to close it.
            onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') } }}
          />
          {query !== '' && (
            <button className="sp-search-clear" onClick={() => setQuery('')} title="Clear search" aria-label="Clear search">×</button>
          )}
        </div>

        <div className="sp-content">

          {/* F61: section nav rail — hidden while a search query is active */}
          {!searching && (
            <nav className="sp-nav">
              {/* Only offer sections that are actually RENDERED. Every section
                  used to be unconditional when no search was active, so mapping
                  SECTION_NAMES straight through was safe — SimuCoins is the
                  first one that can legitimately be absent (it hides when no
                  account has a saved password), and an ungated rail gave it a
                  nav button whose scrollIntoView silently hit a null ref. Any
                  future conditional section must be added to this map too. */}
              {SECTION_NAMES.filter(name => sectionRendered[name]).map(name => (
                <button
                  key={name}
                  className="sp-nav-item"
                  onClick={() => sectionRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {name}
                </button>
              ))}
            </nav>
          )}

          <div className="sp-body">

          {noMatches && (
            <div className="sp-search-empty">No settings match “{query.trim()}”</div>
          )}

          {/* ── Display ─────────────────────────────────────────── */}
          {secDisplay && <section className="sp-sec" ref={el => { sectionRefs.current['Display'] = el }}>
          <div className="sp-section-label">Display</div>

          {vFontFamily && (
          <div className="sp-font-picker">
            <div className="sp-font-picker-header">
              <span className="sp-field-label">Font family</span>
              <span className="sp-font-current">{FONT_FAMILY_LABELS[settings.fontFamily] ?? settings.fontFamily}</span>
            </div>
            <div className="sp-font-filters ui-tabs" role="group" aria-label="Show fonts">
              <button type="button" aria-pressed={fontFilter === 'all'}
                      className={`ui-tab${fontFilter === 'all' ? ' ui-tab--active' : ''}`}
                      onClick={() => setFontFilter('all')}>All</button>
              <button type="button" aria-pressed={fontFilter === 'mono'}
                      className={`ui-tab${fontFilter === 'mono' ? ' ui-tab--active' : ''}`}
                      onClick={() => setFontFilter('mono')}
                      title="Only fonts where every character is the same width — keeps columns in game tables lined up">Monospace</button>
            </div>
            <input
              type="text"
              className="sp-font-search"
              placeholder={systemFonts.length === 0 ? 'Loading fonts…' : 'Filter fonts…'}
              value={fontQuery}
              onChange={e => setFontQuery(e.target.value)}
            />
            <div className="sp-font-list" ref={fontListRef} role="listbox" aria-label="Font family">
              {filteredFonts.map(name => (
                <div
                  key={name}
                  className={`sp-font-item${name === activeFontName ? ' sp-font-item--active' : ''}`}
                  {...pressable(() => { set('fontFamily', name); setFontQuery('') },
                    { role: 'option', selected: name === activeFontName })}
                  // Render each entry in its own face so the picker doubles as
                  // a visual preview — Binu's request (v0.7.1). No fallback
                  // family: the list is sourced from `queryLocalFonts()` so
                  // every name is guaranteed installed. `'X', inherit` is
                  // invalid CSS (the `inherit` keyword can't appear in a
                  // font-family list, only as the sole value), and most
                  // browsers silently discard the whole declaration when
                  // they see it — which made the first cut of this feature
                  // a no-op.
                  style={{ fontFamily: `'${name.replace(/'/g, "\\'")}'` }}
                >
                  {name}
                </div>
              ))}
              {filteredFonts.length === 0 && fontQuery && (
                <div className="sp-font-empty">No matches</div>
              )}
            </div>
          </div>
          )}

          {vFontSize && (
          <div className="sp-field-row">
            <label className="sp-field-label" htmlFor="sp-font-size">
              Font size <span className="sp-field-hint">(game text)</span>
            </label>
            <div className="sp-number-row">
              <button className="sp-num-btn" onClick={() => set('fontSize', Math.max(10, settings.fontSize - 1))}>−</button>
              <input
                id="sp-font-size"
                type="number" min={10} max={24} step={1}
                value={settings.fontSize}
                onChange={e => set('fontSize', Math.max(10, Math.min(24, parseInt(e.target.value) || 14)))}
                className="sp-number-input"
              />
              <span className="sp-number-unit">px</span>
              <button className="sp-num-btn" onClick={() => set('fontSize', Math.min(24, settings.fontSize + 1))}>+</button>
            </div>
          </div>
          )}

          {vLineHeight && (
          <div className="sp-field-row">
            <label className="sp-field-label" htmlFor="sp-line-height">Line height</label>
            <select
              id="sp-line-height"
              className="sp-select"
              value={settings.lineHeight}
              onChange={e => set('lineHeight', parseFloat(e.target.value))}
            >
              <option value={1.2}>Compact (1.2)</option>
              <option value={1.5}>Normal (1.5)</option>
              <option value={1.8}>Relaxed (1.8)</option>
              <option value={2.0}>Double (2.0)</option>
            </select>
          </div>
          )}

          {/* B113: text weight tuning. Positive = faux-bold via stroke
              widening (useful on light themes where Chromium DirectWrite
              renders thinner than GDI ClearType in apps like Frostbite).
              Negative = lower font-weight (only renders thinner on fonts
              with light weights; Cascadia Code default ships 200/300/350,
              Consolas / Lucida Console silently fall back to 400). */}
          {vTextWeight && (
          <div className="sp-field-row">
            <label className="sp-field-label" htmlFor="sp-text-weight">Text weight</label>
            <select
              id="sp-text-weight"
              className="sp-select"
              value={settings.textWeight}
              onChange={e => set('textWeight', parseFloat(e.target.value))}
              title="Tunes game text weight. Positive thickens via stroke (helps on light themes). Negative thins via font-weight (only visible on fonts that ship light weights, like Cascadia Code)."
            >
              <option value={-0.6}>Thinnest (-0.6)</option>
              <option value={-0.4}>Thinner (-0.4)</option>
              <option value={-0.2}>Slightly thinner (-0.2)</option>
              <option value={0}>Default</option>
              <option value={0.2}>Slightly bolder (+0.2)</option>
              <option value={0.4}>Bolder (+0.4)</option>
              <option value={0.6}>Boldest (+0.6)</option>
            </select>
          </div>
          )}

          {vPreview && (
          <div className="sp-preview">
            <div className="sp-preview-label">Preview</div>
            <div
              className="sp-preview-body"
              style={{
                // B348: the same resolver the game text uses, tail included.
                fontFamily: resolveFontFamily(settings.fontFamily),
                fontSize: `${settings.largePrint ? 18 : settings.fontSize}px`,
                lineHeight: settings.largePrint ? 1.8 : settings.lineHeight,
                // B113: mirror the live text-weight tuning into the
                // preview so users can see the chosen rendering before
                // applying. Positive → stroke widening; negative →
                // font-weight reduction (only visible on fonts that
                // ship light weights, like Cascadia Code).
                WebkitTextStroke: settings.textWeight > 0 ? `${settings.textWeight}px currentColor` : undefined,
                fontWeight: settings.textWeight < 0
                  ? Math.max(100, Math.round(400 + settings.textWeight * 500))
                  : undefined,
              }}
            >
              {PREVIEW_LINES.map((line, i) => (
                <div key={i} className={line.cls ?? ''}>{line.text}</div>
              ))}
            </div>
          </div>

          )}

          {/* v0.19.7: the app-bar wordmark's text effect. Per character, so a
              multi-boxer can tell at a glance which one is in front. The
              effect vocabulary is shared with highlights and contact
              templates, so there is one effect system and one stylesheet. */}
          {vBrandEffect && (<>
          <div className="sp-field-row">
            <label className="sp-field-label" htmlFor="sp-brand-effect">Wordmark effect</label>
            {/* Deliberately reuses `.app-bar-brand` rather than a lookalike
                class: same rule, so the preview cannot drift from the bar
                (pitfall #113). The content comes from the shared painter. */}
            <span className="app-bar-brand">
              <span
                className={brandPreview.className ? `app-bar-wordmark ${brandPreview.className}` : 'app-bar-wordmark'}
                style={brandPreview.style}
              >{brandPreview.content}</span>
            </span>
            <select
              id="sp-brand-effect"
              className="sp-select"
              value={settings.brandEffect}
              onChange={e => set('brandEffect', e.target.value as HighlightEffect)}
            >
              {HIGHLIGHT_EFFECTS.map(fx => (
                <option key={fx.value} value={fx.value}>
                  {fx.value === 'none' ? 'Static (theme colours)' : fx.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sp-field-desc">
            Styles the <strong>Lichborne</strong> wordmark in the top-left corner. <strong>Static</strong> takes
            its colours from your theme, the way it always has; anything else paints over it. This is
            per character, so each one can look a little different — the bar shows the effect of the
            character you're currently on. Animated effects hold still under Epilepsy safe mode.
          </div>
          </>)}
          </section>}

          {/* ── Accessibility ────────────────────────────────────── */}
          {secAccess && <section className="sp-sec" ref={el => { sectionRefs.current['Accessibility'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">Accessibility</div>

          {vLargePrint && <Toggle
            label="Large print"
            description="Larger game text and more spacing throughout the interface"
            checked={settings.largePrint}
            onChange={v => set('largePrint', v)}
          />}

          {vHighContrast && <Toggle
            label="High contrast"
            description="Black background, white text, yellow accent — overrides theme colors"
            checked={settings.highContrast}
            onChange={v => set('highContrast', v)}
          />}

          {vEpilepsy && <Toggle
            label="Epilepsy safe mode"
            description="Disables all pulsing animations (RT bar, status indicators)"
            checked={settings.epilepsySafe}
            onChange={v => set('epilepsySafe', v)}
          />}

          {vColorBlind && <RadioGroup
            label="Color blind mode"
            value={settings.colorBlind}
            onChange={v => set('colorBlind', v)}
            options={[
              { value: 'none',         label: 'Off' },
              { value: 'deuteranopia', label: 'Deuteranopia',  description: 'Red-green (green-weak) — shifts greens to teal, reds to orange/magenta' },
              { value: 'protanopia',   label: 'Protanopia',    description: 'Red-green (red-weak) — shifts reds to amber/yellow, greens to teal' },
              { value: 'tritanopia',   label: 'Tritanopia',    description: 'Blue-yellow — shifts blues to purple, cyans to pink' },
            ]}
          />}
          </section>}

          {/* ── Layout ───────────────────────────────────────────── */}
          {secLayout && <section className="sp-sec" ref={el => { sectionRefs.current['Layout'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">Layout</div>

          {vVitalsPos && <RadioGroup
            label="Vitals bar position"
            value={settings.vitalsBarPosition}
            onChange={v => set('vitalsBarPosition', v)}
            disabled={inWindowed}
            disabledHint="Vitals is its own window in Windowed Panels"
            options={[
              { value: 'top',    label: 'Top',    description: 'Vitals below the toolbar' },
              { value: 'bottom', label: 'Bottom', description: 'Vitals above the command bar' },
            ]}
          />}

          {vCompactVitals && <Toggle
            label="Compact vitals"
            description="Slimmer half-height bars with short labels (H: 100%) — frees up ~half a line of game text"
            checked={settings.compactVitals}
            onChange={v => set('compactVitals', v)}
          />}

          {vCompactExp && <Toggle
            label="Compact experience panel"
            description="Text-forward Exp panel: Skill · Ranks · % · learning-rate, with simple summary bars — no progress bars or pickers"
            checked={settings.compactExp}
            onChange={v => set('compactExp', v)}
          />}

          {vIconBarPos && <RadioGroup
            label="Icon bar position"
            value={settings.iconBarPosition}
            onChange={v => set('iconBarPosition', v)}
            disabled={inWindowed}
            disabledHint="Status bar is its own window in Windowed Panels"
            options={[
              { value: 'top',    label: 'Top',    description: 'Stance, timers, hands, and compass below the toolbar' },
              { value: 'bottom', label: 'Bottom', description: 'Stance, timers, hands, and compass above the command bar' },
            ]}
          />}

          {vTimerStyle && <RadioGroup
            label="Roundtime / cast time timer style"
            value={settings.timerStyle}
            onChange={v => set('timerStyle', v)}
            options={[
              { value: 'chips', label: 'Chips', description: 'One chip per second — chips disappear as time counts down' },
              { value: 'bar',   label: 'Bar',   description: 'Classic draining strip that shrinks with remaining time' },
            ]}
          />}
          </section>}

          {/* ── Overview (v0.19.0 Views, DESIGN §47) ─────────────── */}
          {secOverview && <section className="sp-sec" ref={el => { sectionRefs.current['Overview'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">Overview</div>

          {vOvSort && <RadioGroup
            label="Card order"
            value={ovOptions.sort}
            onChange={v => setOv({ sort: v })}
            options={[
              /* Default first. Tab order is the default because attention-sorting
                 MOVES cards while you are watching them. */
              { value: 'tab',       label: 'By tab order',  description: 'Cards stay put, in the order of the character tabs (default)' },
              { value: 'attention', label: 'By attention', description: 'Whoever needs you most sorts to the top — cards move as things change' },
            ]}
          />}

          {vOvTiles && <RadioGroup
            label="Tile size"
            value={ovOptions.tileSize}
            onChange={v => setOv({ tileSize: v })}
            options={[
              { value: 'auto',   label: 'Automatic', description: 'Fill the space: one character is full-screen, two split it. Never shrinks below readable — past that the grid scrolls.' },
              { value: 'large',  label: 'Large',     description: 'Few, detailed tiles. Everything on a card, long text feed.' },
              { value: 'medium', label: 'Medium',    description: 'A fixed middling size regardless of how many characters are up.' },
              { value: 'small',  label: 'Small',     description: 'Many dense tiles — for running a lot of characters at once.' },
            ]}
          />}

          {vOvDensity && <RadioGroup
            label="Card density"
            value={ovOptions.density}
            onChange={v => setOv({ density: v })}
            options={[
              { value: 'comfortable', label: 'Comfortable', description: 'Full-height vitals bars and roomier cards' },
              { value: 'compact',     label: 'Compact',      description: 'Short labels and tighter spacing — fits more characters on screen' },
            ]}
          />}

          {vOvFeed && <div className="sp-toggle-row">
            <div className="sp-toggle-text">
              <div className="sp-toggle-label">Text feed</div>
              <div className="sp-toggle-desc">
                Lines of live game text on each card. 0 turns the feed off, which
                makes the cards much shorter.
              </div>
            </div>
            <input
              type="number" min={0} max={MAX_FEED_LINES}
              className="sp-number-input"
              value={ovOptions.feedLines}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (Number.isFinite(n)) setOv({ feedLines: n })
              }}
            />
          </div>}

          {vOvIdle && <div className="sp-toggle-row">
            <div className="sp-toggle-text">
              <div className="sp-toggle-label">Idle after</div>
              <div className="sp-toggle-desc">
                Seconds of silence before a character is flagged as idle on its card.
              </div>
            </div>
            <input
              type="number" min={10} max={3600}
              className="sp-number-input"
              value={ovOptions.idleSeconds}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                if (Number.isFinite(n)) setOv({ idleSeconds: n })
              }}
            />
          </div>}

          {vOvPulse && <Toggle
            label="Alert me when a character is critical"
            description="The character's card pulses, and if Lichborne isn't the window you're looking at, its taskbar entry flashes too. Only fires when a character dies or drops below the critical health threshold — not for ordinary damage. Under epilepsy-safe or reduced-motion the movement stops but the red stays."
            checked={ovOptions.alertPulse}
            onChange={v => setOv({ alertPulse: v })}
          />}

          {vOvSpeech && <Toggle
            label="Flag when someone speaks to a character"
            description="Shows a 'Spoken to' chip when a character is addressed. Costs a little: it turns on scene capture for EVERY connected character, not just one — which is why it is off by default."
            checked={ovOptions.watchSpeech}
            onChange={v => setOv({ watchSpeech: v })}
          />}

          {vOvSections && <>
            <Toggle label="Show vitals on cards" description="The health/mana/stamina bars."
                    checked={ovOptions.showVitals} onChange={v => setOv({ showVitals: v })} />
            <Toggle label="Show conditions on cards" description="Stance, hands, prepared spell and the status icons."
                    checked={ovOptions.showConditions} onChange={v => setOv({ showConditions: v })} />
            <Toggle label="Show room on cards" description="Room name, plus who and what is in it."
                    checked={ovOptions.showRoom} onChange={v => setOv({ showRoom: v })} />
            <Toggle label="Show session stats on cards" description="Uptime, idle, lines per minute, ranks gained, rooms visited."
                    checked={ovOptions.showExp} onChange={v => setOv({ showExp: v })} />
            <Toggle label="Show wounds on cards" description="The worst active wound. Scars are healed history and are never counted here."
                    checked={ovOptions.showInjuries} onChange={v => setOv({ showInjuries: v })} />
            <Toggle label="Show roundtime on cards" description="A thin RT / Cast / Aim strip, so you can see who is free to act."
                    checked={ovOptions.showTimers} onChange={v => setOv({ showTimers: v })} />
          </>}
          </section>}

          {/* ── Behavior ─────────────────────────────────────────── */}
          {secBehavior && <section className="sp-sec" ref={el => { sectionRefs.current['Behavior'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">Behavior</div>

          {vAutoLink && <Toggle
            label="Auto-link URLs"
            description="Detect http/https URLs in game text and make them clickable"
            checked={settings.autoLinkUrls}
            onChange={v => set('autoLinkUrls', v)}
          />}

          {vWebSafety && <Toggle
            label="Web link safety"
            description="Route external URL clicks through Simu's bounce page (play.net/bounce/redirect.asp) — shows a 'you are leaving Play.net' warning before opening any link from game text or a script. Matches Genie's behavior."
            checked={settings.webLinkSafety}
            onChange={v => set('webLinkSafety', v)}
          />}

          {vMapAnim && <Toggle
            label="Genie map animations"
            description="Genie Maps motion — per-room effects (shop glints, water ripples, sparkles) and the camera glide as it follows you. Turn off if the map feels sluggish; the map then snaps instantly with no effects."
            checked={settings.mapAnimations}
            onChange={v => set('mapAnimations', v)}
          />}

          {/* F82 — app-wide (all characters), unlike everything above it in
              this section. The hint says so, because a Behavior section that
              silently mixes scopes is the kind of thing that surprises people
              later. */}
          {vCmdHist && (<>
          <div className="sp-field-row">
            <label className="sp-field-label" htmlFor="sp-cmdhist-min">
              Remember commands of at least{' '}
              <span className="sp-field-hint">(0 = remember everything · all characters)</span>
            </label>
            <div className="sp-number-row">
              <button className="sp-num-btn" onClick={() => setCmdHistMin(cmdHist.minLength - 1)}>−</button>
              <input
                id="sp-cmdhist-min"
                type="number" min={0} max={CMD_HISTORY_MIN_MAX} step={1}
                value={cmdHist.minLength}
                onChange={e => setCmdHistMin(parseInt(e.target.value) || 0)}
                className="sp-number-input"
              />
              <button className="sp-num-btn" onClick={() => setCmdHistMin(cmdHist.minLength + 1)}>+</button>
              <span className="sp-field-hint">characters</span>
            </div>
          </div>
          <div className="sp-field-desc">
            {cmdHist.minLength <= 0
              ? 'Every command you type is kept for up-arrow recall.'
              : `Commands under ${cmdHist.minLength} characters — "n", "se" and the like — are no longer kept, so up-arrow reaches the ones you actually want. Slash commands are always kept, and existing history is left alone.`}
          </div>
          </>)}
          </section>}

          {/* ── Session Log ─────────────────────────────────────── */}
          {/* App-wide settings — shared across all characters (_shared.yaml). */}
          {secSessionLog && <section className="sp-sec" ref={el => { sectionRefs.current['Session Log'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">Session Log</div>

          {vLogEnabled && <Toggle
            label="Enable session logging"
            description="Write game text to dated log files on disk. Applies to every character. Logs stay on your computer and are never sent anywhere."
            checked={logCfg.enabled}
            onChange={v => setLog('enabled', v)}
          />}

          {logCfg.enabled && showLogBlock && (
            <>
              <button
                type="button"
                className="sp-disclosure"
                onClick={() => setLogExpanded(e => !e)}
                aria-expanded={logListOpen}
              >
                <span className="sp-disclosure-arrow">{logListOpen ? '▾' : '▸'}</span>
                Logging options
              </button>
              {logListOpen && (
            <div className="sp-sublist">
              {(vLogOptions || vLogMain) && <Toggle
                label="Game text"
                description="The main game window — room text, speech, combat narration"
                checked={logCfg.captureMain}
                onChange={v => setLog('captureMain', v)}
              />}
              {(vLogOptions || vLogStreams) && <Toggle
                label="Stream content"
                description="Thoughts, combat, death, and any script-driven streams (LichScripts, etc.)"
                checked={logCfg.captureStreams}
                onChange={v => setLog('captureStreams', v)}
              />}
              {(vLogOptions || vLogCommands) && <Toggle
                label="Commands"
                description="Echo of the commands you type, prefixed with >"
                checked={logCfg.captureCommands}
                onChange={v => setLog('captureCommands', v)}
              />}
              {(vLogOptions || vLogSystem) && <Toggle
                label="System messages"
                description="Connect / disconnect notices"
                checked={logCfg.captureSystem}
                onChange={v => setLog('captureSystem', v)}
              />}

              {(vLogOptions || vLogCompress) && <Toggle
                label="Compress old logs"
                description="Gzip yesterday-and-older day-files — about 85% smaller. Today's log stays plain text; the in-client viewer reads compressed logs transparently."
                checked={logCfg.compress}
                onChange={v => setLog('compress', v)}
              />}

              {(vLogOptions || vLogRetention) && (
              <div className="sp-field-row">
                <label className="sp-field-label" htmlFor="sp-log-retention">
                  Keep logs for <span className="sp-field-hint">(0 = forever)</span>
                </label>
                <div className="sp-number-row">
                  <button
                    className="sp-num-btn"
                    onClick={() => setLog('retentionDays', Math.max(0, logCfg.retentionDays - 1))}
                  >−</button>
                  <input
                    id="sp-log-retention"
                    type="number" min={0} max={3650} step={1}
                    value={logCfg.retentionDays}
                    onChange={e => setLog('retentionDays', Math.max(0, Math.min(3650, parseInt(e.target.value) || 0)))}
                    className="sp-number-input"
                  />
                  <span className="sp-number-unit">days</span>
                  <button
                    className="sp-num-btn"
                    onClick={() => setLog('retentionDays', Math.min(3650, logCfg.retentionDays + 1))}
                  >+</button>
                </div>
              </div>
              )}

              {(vLogOptions || vLogMaxRaw) && (
              <div className="sp-field-row">
                <label className="sp-field-label" htmlFor="sp-log-maxraw">
                  Cap uncompressed logs <span className="sp-field-hint">(0 = no cap)</span>
                </label>
                <div className="sp-number-row">
                  <button
                    className="sp-num-btn"
                    onClick={() => setLog('maxRawMB', Math.max(0, logCfg.maxRawMB - 50))}
                  >−</button>
                  <input
                    id="sp-log-maxraw"
                    type="number" min={0} max={100000} step={50}
                    value={logCfg.maxRawMB}
                    onChange={e => setLog('maxRawMB', Math.max(0, Math.min(100000, parseInt(e.target.value) || 0)))}
                    className="sp-number-input"
                  />
                  <span className="sp-number-unit">MB</span>
                  <button
                    className="sp-num-btn"
                    onClick={() => setLog('maxRawMB', Math.min(100000, logCfg.maxRawMB + 50))}
                  >+</button>
                </div>
              </div>
              )}

              {(vLogOptions || vLogUsage) && (
              <div className="sp-field-row">
                <span className="sp-field-label">
                  Disk usage
                  {logUsage && (
                    <span className="sp-field-hint"> · {logUsage.dayCount} day{logUsage.dayCount === 1 ? '' : 's'}</span>
                  )}
                </span>
                <span className="sp-log-usage">
                  {logUsage
                    ? `${formatBytes(logUsage.totalBytes)}${logUsage.archiveBytes > 0 ? ` · ${formatBytes(logUsage.archiveBytes)} compressed` : ''}`
                    : '…'}
                </span>
              </div>
              )}

              {(vLogOptions || vLogFiles) && (
              <div className="sp-field-row">
                <span className="sp-field-label">Log files</span>
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={() => window.api.sessionLogOpenFolder(character)}
                >
                  Open logs folder
                </button>
              </div>
              )}
            </div>
              )}
            </>
          )}
          </section>}

          {/* ── Lich Setup ──────────────────────────────────────── */}
          {/* ── AI ───────────────────────────────────────────────── */}
          {secAI && <section className="sp-sec" ref={el => { sectionRefs.current['AI'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">AI</div>

          {vAiEnable && <Toggle
            label="Enable AI features"
            description="Bring your own Anthropic (Claude) API key. Off by default — nothing is sent anywhere unless you enable a feature and accept its disclosure. AI advises, composes, and summarizes; it never issues game commands."
            checked={aiCfg.enabled}
            onChange={v => setAi('enabled', v)}
          />}

          {vAiKey && <>
            <div className="sp-field-row">
              <span className="sp-field-label">
                Anthropic API key
                {/* Not "DPAPI" — that's the Windows backend only; macOS uses
                    Keychain and Linux libsecret/KWallet (v0.18.0). */}
                <span className="sp-field-hint"> · stored encrypted on this machine using your OS credential store, never in your profile</span>
              </span>
            </div>
            <div className="sp-ai-key-row">
              <input
                className="sp-ai-key-input"
                type="password"
                placeholder={aiKeyPresent ? '•••••••••••• (saved)' : 'sk-ant-…'}
                value={aiKeyInput}
                onChange={e => setAiKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveAiKey() }}
              />
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!aiKeyInput.trim()} onClick={saveAiKey}
                      title={aiKeyInput.trim() ? undefined : 'Type or paste a key first'}>Save</button>
              <button type="button" className="ui-btn ui-btn--sm" disabled={!aiKeyPresent || aiTesting} onClick={testAiKey}
                      title={!aiKeyPresent ? 'Save a key first' : aiTesting ? 'Already testing' : 'Check that the saved key works'}>
                {aiTesting ? 'Testing…' : 'Test'}
              </button>
              {/* "Delete", not "Clear" (B407): it destroys the saved key, and asks first. */}
              <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" disabled={!aiKeyPresent} onClick={() => { void clearAiKey() }}
                      title={aiKeyPresent ? 'Remove the saved key from this machine' : 'No key is saved'}>Delete</button>
            </div>
            {aiTestMsg
              ? <div className={`sp-ai-status ${aiTestMsg.ok ? 'sp-ai-status--ok' : 'sp-ai-status--err'}`}>{aiTestMsg.text}</div>
              : aiKeyPresent && <div className="sp-ai-status sp-ai-status--ok">✓ Key saved</div>}
          </>}

          {vAiModel && <>
            <RadioGroup
              label="Text model"
              value={aiCfg.textModel}
              options={AI_TEXT_MODELS.map(m => ({ value: m.id, label: m.label }))}
              onChange={v => setAi('textModel', v)}
            />
            <div className="sp-ai-hint">Used by Catch Me Up and future AI features. Higher tiers cost more per request (billed to your own API key).</div>
          </>}

          {vAiPersona && <>
            <div className="sp-field-row">
              <span className="sp-field-label">
                Response voice
                <span className="sp-field-hint"> · optional — give the AI a personality; leave blank for the default</span>
              </span>
            </div>
            <div className="sp-ai-key-row">
              <input
                className="sp-ai-key-input sp-ai-persona-input"
                type="text"
                maxLength={120}
                placeholder="e.g. a 90s TV news anchor, a salty pirate…"
                value={aiCfg.persona}
                onChange={e => setAi('persona', e.target.value)}
              />
            </div>
            <div className="sp-ai-hint">Flavours <em>how</em> summaries are written — never the facts. Have fun with it; blank keeps the current warm, natural voice.</div>
          </>}

          {vAiUsage && (() => {
            const u = aiSessionUsage()
            // Quiet by default (UX standard #1): a fresh session reads clean, not a
            // row of zeros — the token breakdown appears once something's been used.
            return (
              <div className="sp-field-row">
                <span className="sp-field-label">
                  Usage this session
                  <span className="sp-field-hint">{u.requests === 0
                    ? ' · not used yet'
                    : ` · ${u.requests} request${u.requests === 1 ? '' : 's'} · ${u.inputTokens.toLocaleString()} in / ${u.outputTokens.toLocaleString()} out tokens`}</span>
                </span>
              </div>
            )
          })()}
          </section>}

          {/* ── SimuCoins ────────────────────────────────────────── */}
          {secSimuCoin && simucoin && <section className="sp-sec" ref={el => { sectionRefs.current['SimuCoins'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">SimuCoins</div>

          <div className="sp-ai-hint">
            Simutronics gives subscribers a free SimuCoin allotment every month. It has to be
            claimed manually and it expires if you don't — enable an account here and Lichborne
            checks it once per launch, then lights the coin in the top bar when coins are waiting.
          </div>
          {/* The DESIGN §42.3 disclosure sits directly above the controls that
              act on it — the same shape the AI section uses, and the reason the
              coin popover can now simply point here. It comes from the one
              SIMUCOIN_DISCLOSURE string so no two surfaces can end up
              promising different things about the user's password. */}
          <div className="sp-ai-hint"><strong>What gets sent:</strong> {SIMUCOIN_DISCLOSURE}</div>

          {scAccounts.map(account => {
            const ac = accountConfig(scCfg, account)
            const isBusy = simucoin.busy.has(account)
            const balanceLine = simucoinBalanceText(ac)
            return (
              <div className="sp-sc-account" key={account}>
                <Toggle
                  label={account}
                  description={ac.consented
                    ? simucoinStateText(simucoin.statuses[account], isBusy)
                    : 'Off — nothing is sent to the store for this account.'}
                  checked={ac.consented}
                  onChange={v => {
                    // Turning OFF also clears auto-claim, so re-enabling later
                    // can never silently resume claiming unprompted — and drops
                    // the cached balance, which is data about an account the
                    // user has just told us to stop touching.
                    setSc(account, v
                      ? { consented: true }
                      : { consented: false, autoClaim: false, lastBalance: undefined, lastCheckedAt: undefined })
                    if (v) void simucoin.run(account, false)   // first check right away
                  }}
                />
                {ac.consented && (
                  <div className="sp-sc-sub">
                    {/* Balance sits directly under the STATE line (the Toggle's
                        description) and is deliberately quieter: the state line
                        answers "do I need to do something", this answers "what
                        do I have, and how current is that". Renders nothing at
                        all when never checked — no placeholder dash. */}
                    {balanceLine && <div className="sp-sc-balance">{balanceLine}</div>}
                    <Toggle
                      label="Claim automatically"
                      description="Claim as soon as coins are found, instead of waiting for you to click the coin."
                      checked={ac.autoClaim}
                      onChange={v => setSc(account, { autoClaim: v })}
                    />
                    <div className="sp-field-row">
                      <span className="sp-field-hint">Checked once per launch — no background polling.</span>
                      <button type="button" className="ui-btn ui-btn--sm" disabled={isBusy}
                        title={isBusy ? 'Already checking this account' : undefined}
                        onClick={() => { void simucoin.run(account, false) }}>
                        {isBusy ? 'Checking…' : 'Check now'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {scNoPassword > 0 && (
            <div className="sp-ai-hint">
              {scNoPassword} account{scNoPassword === 1 ? ' is' : 's are'} not listed because
              {scNoPassword === 1 ? ' it has' : ' they have'} no saved password — signing in to the
              store has no other credential to use.
            </div>
          )}
          </section>}

          {secLichSetup && <section className="sp-sec" ref={el => { sectionRefs.current['Lich Setup'] = el }}>
          <div className="sp-divider" />
          <div className="sp-section-label">Lich Setup</div>

          <div className="sp-field-row">
            <span className="sp-field-label">
              Lich path, port &amp; mode
              <span className="sp-field-hint"> · how Lichborne launches and connects to Lich</span>
            </span>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setShowLichSetup(true)}>
              Open Lich Setup…
            </button>
          </div>
          </section>}

          </div>
        </div>

        {/* B370: Reset to defaults used to sit in the header 8px from the ✕
            and ran in one click. It lives at the foot now, in the house footer
            order — [destructive] … [Close] — and asks first. */}
        <div className="ui-modal-foot">
          <button type="button" className="ui-btn ui-btn--danger" onClick={() => { void resetToDefaults() }}
                  title={`Font, accessibility, layout and behavior settings for ${character}`}>
            Reset to defaults
          </button>
          <span className="ui-modal-foot-spacer" />
          <button type="button" className="ui-btn" onClick={onClose}>Close</button>
        </div>
      </div>

      {/* B405: Settings' scrim already dims the screen, so Lich Setup's stays clear. */}
      {showLichSetup && <LichSetupDialog nested onClose={() => setShowLichSetup(false)} />}
    </div>,
    document.body,
  )
}
