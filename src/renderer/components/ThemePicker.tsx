// Theme Picker — the portaled modal for choosing a built-in theme (General /
// Guild tabs) or a user's Custom theme, previewing it, and launching the
// ThemeEditor.
//
// Rendered by GameWindow, which owns the persisted state: `currentThemeId`
// and the `myThemes` list arrive as props, and every change is reported UP via
// `onThemeChange(id)` / `onMyThemesChange(list)` — the parent schedules the
// profile save. Picking a theme applies it IMMEDIATELY (`applyTheme` /
// `applyCustomTheme` write the CSS vars) so the whole app previews live;
// "Customize…" / "Edit" open ThemeEditor on a copy with the copy applied, and
// Cancel restores whatever was active before (`prevThemeIdRef`). The preview
// mock reads the same `darkBase`-merged var set `applyTheme` uses, so what it
// shows is what the theme resolves to. Deleting the ACTIVE custom theme falls
// back to `THEMES[0]`, and deleting asks first (B370). Import/Export are JSON
// files via `myThemes` helpers. Chrome is the shared About look (ui.css);
// layout is the `.tp-*` classes in theme-picker.css.

import { useEffect, useId, useRef, useState } from 'react'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { pressable } from '../utils/pressable'
import { confirmDelete } from '../confirm'
import { useUnsavedScope, UnsavedContext } from '../hooks/useUnsaved'
import { createPortal } from 'react-dom'
import { THEMES, applyTheme, applyCustomTheme, darkBase, type Theme, type ThemeVars } from '../themes'
import {
  createCustomThemeFrom, duplicateCustomTheme, exportTheme, importTheme, getBaseThemeName,
  type CustomTheme,
} from '../myThemes'
import ThemeEditor from './ThemeEditor'
import '../styles/theme-picker.css'

type Tab = 'general' | 'guild' | 'custom'

interface Props {
  currentThemeId: string
  myThemes: CustomTheme[]
  onThemeChange: (id: string) => void
  onMyThemesChange: (themes: CustomTheme[]) => void
  onClose: () => void
  /** Bumped by the owner to ask the picker to close (the app-bar Theme button
   *  / native menu toggling it shut). Answered with the same guarded close as
   *  the ✕, so an open Theme Editor with edits asks first (B368). The value
   *  present at mount is ignored — the counter isn't reset between openings. */
  closeRequest?: number
}

function isBaseTheme(t: Theme | CustomTheme): t is Theme {
  return 'category' in t
}

function mergedVars(theme: Theme): ThemeVars {
  return theme.id === 'dark' ? darkBase : { ...darkBase, ...theme.vars }
}

// ── Preview mock ────────────────────────────────────────────────────────────

function PreviewMock({ vars }: { vars: ThemeVars }) {
  const bg      = vars['--bg-base']          ?? '#1a1a1a'
  const border  = vars['--border']           ?? '#333'
  const title   = vars['--room-title-color'] ?? '#eee'
  const desc    = vars['--room-desc-color']  ?? '#bbb'
  const exitBg  = vars['--exit-bg']          ?? '#0d1a0d'
  const exitBrd = vars['--exit-border']      ?? '#1e3a1e'
  const exitTxt = vars['--exit-text']        ?? '#60a840'
  const speech  = vars['--preset-speech']    ?? '#d4af37'
  const text    = vars['--text-primary']     ?? '#ccc'
  const accent  = vars['--accent']           ?? '#c8a840'
  const muted   = vars['--text-muted']       ?? '#888'

  return (
    <div className="tp-mock" style={{ background: bg, borderColor: border }}>
      <div className="tp-mock-swatches">
        <span className="tp-mock-swatch" style={{ background: accent }} />
        <span className="tp-mock-swatch" style={{ background: text, opacity: 0.7 }} />
        <span className="tp-mock-swatch" style={{ background: speech }} />
        <span className="tp-mock-swatch" style={{ background: accent, opacity: 0.35 }} />
      </div>
      <div className="tp-mock-room-name" style={{ color: title }}>The Raven's Crossing</div>
      <div className="tp-mock-room-desc" style={{ color: desc }}>
        You stand in a dimly lit cobblestone alley. Gas lamps flicker overhead, casting long shadows across the worn stones.
      </div>
      <div className="tp-mock-exits">
        {['north', 'east', 'west'].map(d => (
          <span key={d} className="tp-mock-exit"
            style={{ background: exitBg, borderColor: exitBrd, color: exitTxt }}>
            {d}
          </span>
        ))}
      </div>
      <div className="tp-mock-speech" style={{ color: speech }}>
        Serenity says, "Welcome to the realm, traveler."
      </div>
      <div className="tp-mock-text" style={{ color: muted }}>You are standing.</div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ThemePicker({ currentThemeId, myThemes, onThemeChange, onMyThemesChange, onClose, closeRequest }: Props) {
  const generalThemes = THEMES.filter(t => t.category === 'general')
  const guildThemes   = THEMES.filter(t => t.category === 'guild')

  const [tab, setTab] = useState<Tab>(() => {
    if (myThemes.some(t => t.id === currentThemeId)) return 'custom'
    const base = THEMES.find(t => t.id === currentThemeId)
    return base?.category === 'guild' ? 'guild' : 'general'
  })

  const [selectedId, setSelectedId] = useState(currentThemeId)
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null)
  const [isNewTheme,   setIsNewTheme]   = useState(false)
  const prevThemeIdRef = useRef(currentThemeId)
  const importRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // B368: every way the picker closes — its ✕, the backdrop, Esc, and the
  // owner's `closeRequest` — goes through this unsaved-changes scope. The
  // Theme Editor reports its draft into it, so closing the picker while the
  // editor holds edits asks first. Closing with the editor open also undoes
  // its live preview, exactly as the editor's own Cancel does.
  const unsaved = useUnsavedScope()
  function guardedClose() {
    unsaved.guard(() => {
      if (editingTheme) handleEditorCancel()
      onClose()
    })
  }
  const guardedCloseRef = useRef(guardedClose)
  guardedCloseRef.current = guardedClose
  const closeReqAtMount = useRef(closeRequest)
  useEffect(() => {
    if (closeRequest !== undefined && closeRequest !== closeReqAtMount.current) guardedCloseRef.current()
  }, [closeRequest])
  useEscapeClose(guardedClose)

  // B397: open with focus inside the dialog, not left on the app-bar button
  // it covers. The panel itself — there is no field to start in.
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }) }, [])

  function handleTabChange(newTab: Tab) {
    setTab(newTab)
    const pool = newTab === 'general' ? generalThemes : newTab === 'guild' ? guildThemes : myThemes
    const inTab = pool.find(t => t.id === currentThemeId)
    setSelectedId(inTab ? currentThemeId : (pool[0]?.id ?? ''))
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  function handlePickBase(theme: Theme) {
    applyTheme(theme)
    onThemeChange(theme.id)
    setSelectedId(theme.id)
  }

  function handlePickCustom(theme: CustomTheme) {
    applyCustomTheme(theme.vars, theme.id)
    onThemeChange(theme.id)
    setSelectedId(theme.id)
  }

  // ── Customize / edit ──────────────────────────────────────────────────────

  function handleCustomizeBase(base: Theme) {
    prevThemeIdRef.current = currentThemeId
    const copy = createCustomThemeFrom(base, `My ${base.name}`)
    applyCustomTheme(copy.vars)
    setEditingTheme(copy)
    setIsNewTheme(true)
  }

  function handleEditCustom(theme: CustomTheme) {
    prevThemeIdRef.current = currentThemeId
    applyCustomTheme(theme.vars)
    setEditingTheme({ ...theme, vars: { ...theme.vars } })
    setIsNewTheme(false)
  }

  function handleEditorSave(saved: CustomTheme) {
    const updated = isNewTheme
      ? [...myThemes, saved]
      : myThemes.map(t => t.id === saved.id ? saved : t)
    onMyThemesChange(updated)
    applyCustomTheme(saved.vars, saved.id)
    onThemeChange(saved.id)
    setEditingTheme(null)
    setTab('custom')
    setSelectedId(saved.id)
    refocusPanel()
  }

  // The editor took focus when it opened (its name field); when it closes,
  // hand focus back to this dialog rather than leaving it on <body> (B397).
  function refocusPanel() {
    requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
  }

  function handleEditorCancel() {
    const prev = prevThemeIdRef.current
    const base = THEMES.find(t => t.id === prev)
    if (base) applyTheme(base)
    else {
      const custom = myThemes.find(t => t.id === prev)
      if (custom) applyCustomTheme(custom.vars)
    }
    setEditingTheme(null)
    refocusPanel()
  }

  // ── Custom theme actions ──────────────────────────────────────────────────

  function handleDuplicate(theme: CustomTheme) {
    const copy = duplicateCustomTheme(theme)
    onMyThemesChange([...myThemes, copy])
  }

  async function handleDelete(theme: CustomTheme) {
    // B370: this used to delete in one click.
    const active = currentThemeId === theme.id
    const ok = await confirmDelete('theme', theme.name, active
      ? `It's the theme you're using — Lichborne switches to ${THEMES[0].name}. This can't be undone.`
      : undefined)
    if (!ok) return
    const updated = myThemes.filter(t => t.id !== theme.id)
    onMyThemesChange(updated)
    if (currentThemeId === theme.id) {
      applyTheme(THEMES[0])
      onThemeChange(THEMES[0].id)
    }
    setSelectedId(updated[0]?.id ?? '')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const theme = await importTheme(file)
      onMyThemesChange([...myThemes, theme])
      setTab('custom')
      setSelectedId(theme.id)
    } catch { /* ignore bad files */ }
    e.target.value = ''
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const listItems: (Theme | CustomTheme)[] =
    tab === 'general' ? generalThemes :
    tab === 'guild'   ? guildThemes   :
    myThemes

  const selectedBase   = THEMES.find(t => t.id === selectedId)
  const selectedCustom = myThemes.find(t => t.id === selectedId)
  const previewVars: ThemeVars = selectedBase
    ? mergedVars(selectedBase)
    : (selectedCustom?.vars ?? darkBase)
  const selectedName = selectedBase?.name ?? selectedCustom?.name ?? ''

  return createPortal(
    <UnsavedContext.Provider value={unsaved.registry}>
      <div className="tp-backdrop ui-modal-backdrop" {...backdropHandlers(guardedClose)}>
        <div
          className="tp-modal ui-modal ui-modal--standard"
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >

          <div className="ui-modal-head">
            <span className="ui-modal-title" id={titleId}>Theme</span>
            <div className="tp-tabs ui-tabs" role="tablist" aria-label="Theme groups">
              <TabChip active={tab === 'general'} onClick={() => handleTabChange('general')}>General</TabChip>
              <TabChip active={tab === 'guild'} onClick={() => handleTabChange('guild')}>Guild</TabChip>
              <TabChip active={tab === 'custom'} onClick={() => handleTabChange('custom')}>
                Custom{myThemes.length > 0 ? ` (${myThemes.length})` : ''}
              </TabChip>
            </div>
            <button type="button" className="ui-close" onClick={guardedClose} title="Close" aria-label="Close">✕</button>
          </div>

          <div className="tp-body">

            {/* Left: theme list */}
            <div className="tp-list" role="listbox" aria-label="Themes">
              {tab === 'custom' && myThemes.length === 0 ? (
                <div className="tp-list-empty">
                  No custom themes yet.<br />
                  Click <strong>Customize…</strong> on any theme to create one.
                </div>
              ) : (
                listItems.map(item => {
                  const dotBg = isBaseTheme(item)
                    ? item.swatches[0]
                    : (item.vars['--bg-app'] ?? '#111')
                  return (
                    <div
                      key={item.id}
                      className={`tp-list-item${item.id === selectedId ? ' tp-list-item--selected' : ''}`}
                      {...pressable(() => isBaseTheme(item) ? handlePickBase(item) : handlePickCustom(item),
                        { role: 'option', selected: item.id === selectedId })}
                    >
                      <span className="tp-list-dot" style={{ background: dotBg }} />
                      <span className="tp-list-name">{item.name}</span>
                      {item.id === currentThemeId && <span className="tp-list-check">✓</span>}
                    </div>
                  )
                })
              )}

              {tab === 'custom' && (
                <div className="tp-list-import">
                  <button type="button" className="ui-btn ui-btn--sm tp-import-btn" onClick={() => importRef.current?.click()}
                          title="Add a theme from a .json file someone exported from Lichborne">
                    Import theme…
                  </button>
                  <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                </div>
              )}
            </div>

            {/* Right: preview pane */}
            <div className="tp-preview-pane">
              {selectedName ? (
                <>
                  <PreviewMock vars={previewVars} />
                  <div className="tp-preview-meta">
                    <div className="tp-preview-name">
                      {selectedName}
                      {selectedId === currentThemeId && <span className="tp-preview-active"> — Active</span>}
                    </div>
                    {selectedCustom && (
                      <div className="tp-preview-based">Based on {getBaseThemeName(selectedCustom.basedOn)}</div>
                    )}
                    <div className="tp-preview-actions">
                      {selectedBase && (
                        <button type="button" className="ui-btn ui-btn--primary" onClick={() => handleCustomizeBase(selectedBase)}
                                title="Make your own copy of this theme and open it in the editor">
                          Customize…
                        </button>
                      )}
                      {selectedCustom && (
                        <>
                          <button type="button" className="ui-btn ui-btn--primary" onClick={() => handleEditCustom(selectedCustom)}>Edit…</button>
                          <button type="button" className="ui-btn" onClick={() => handleDuplicate(selectedCustom)}
                                  title="Add a copy of this theme to your custom themes">Duplicate</button>
                          <button type="button" className="ui-btn" onClick={() => exportTheme(selectedCustom)}
                                  title="Save this theme as a .json file you can share or import elsewhere">Export</button>
                          <button type="button" className="ui-btn ui-btn--danger" onClick={() => { void handleDelete(selectedCustom) }}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="tp-preview-empty">Select a theme from the list.</div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* `nested`: this dialog's scrim already dims the app, so the editor
          draws none of its own (B405). */}
      {editingTheme && (
        <ThemeEditor
          theme={editingTheme}
          isNew={isNewTheme}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
          nested
        />
      )}
    </UnsavedContext.Provider>,
    document.body,
  )
}

// A chip tab in the header (UX standard #10). Module scope so it's a stable
// component type across renders (UX standard #4).
function TabChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`ui-tab${active ? ' ui-tab--active' : ''}`}
      onClick={onClick}
    >{children}</button>
  )
}
