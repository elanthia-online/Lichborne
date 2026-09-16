// Highlights editor — the sidebar + detail form that edits the `highlights`
// rule store: pattern (text / phrase / regex, case toggle), line-or-match
// scope, style (colors, bold, text effect), an optional sound, and groups.
//
// Hosted inline by AutomationsPanel, its only caller (the never-rendered
// standalone modal branch was removed in v0.19.7, B408). It runs per
// character via `useCharacter()`,
// and inside the Automations "All Characters" scope that provider is
// re-pointed at the virtual `_global` store, so the same
// `loadHighlights`/`saveHighlights` calls edit global rules unchanged
// (`scope='global'` hides the Groups row; `onMoveScope` renders the F63
// "Applies to" control, which MOVES the draft to the other store). Every
// write is `setRules` → `saveHighlights` (localStorage) → `onSaved` (the
// host's scheduled profile save → YAML); the list is loaded ONCE on mount and
// the host remounts the panel after an import or scope move. The live Preview
// runs the REAL `buildHighlightRegex` + `resolveEffect`/`effectContent`, so
// what it shows is what the game window will paint. Entry points: `prefill`
// (right-click "Highlight …" → unsaved draft, with `initialTestText`) and
// `openRuleId` (slash `/highlight edit`, v0.14.6). There is deliberately NO
// reorder UI — overlap precedence is by match specificity, not list order
// (v0.11.3; see the note above the sidebar). Analytics is opt-in via
// `analyticsOn`. The `.hp-*` classes here are the layout MutePanel /
// SubstitutesPanel mirror.
//
// B368: the draft is compared against `baseline` (the stored rule, or the fresh
// factory draft), and every switch that would replace it — another row, "+ New",
// a prefill, an openRuleId — asks first when it differs; `useReportUnsaved`
// tells the Automations dialog so its close / tab / scope switches ask too.

import { useEffect, useMemo, useRef, useState } from 'react'
import { pressable } from '../utils/pressable'
import { ResizeDivider } from './ResizeDivider'
import InlineConfirm from './InlineConfirm'
import { confirmDelete, confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import {
  type HighlightRule, type HighlightEffect,
  buildHighlightRegex, isValidRegex,
  loadHighlights, saveHighlights, newHighlight,
  HIGHLIGHT_EFFECTS, effectiveEffect, FX_USES_COLOR,
} from '../highlights'
import { resolveEffect, effectContent } from '../utils/highlightEffects'
import { playWavFile } from '../hooks/useTriggerEngine'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { useRuleAnalytics, AnalyticsReview, RuleBadges, ruleListKeyDown } from './AutomationAnalytics'
import { analyzeHighlights } from '../automationHealth'
import GroupPicker from './GroupPicker'
import '../styles/highlights.css'
import { normalizeColorInput, COLOR_INPUT_TITLE } from '../colors'
import '../styles/groups.css'

const PREVIEW_TEXT = "You notice Torgin has a deep cut that is bleeding profusely."

function colorPickerValue(v: string | undefined, fallback = '#000000'): string {
  if (!v || v === 'transparent') return fallback
  return v.startsWith('#') ? v : '#' + v
}

function swatchStyle(color: string): React.CSSProperties {
  if (!color || color === 'transparent') return {}
  return { background: color }
}

interface Props {
  onSaved?: () => void
  prefill?: HighlightRule
  initialTestText?: string
  openRuleId?: string // v0.14.6: open an existing rule for edit (slash /highlight edit)
  analyticsOn?: boolean
  // F37/F63 (v0.15.2): which store this panel is editing ('global' = the
  // Automations panel's All Characters scope — groups row hidden, since global
  // rules are always-active) + the cross-store MOVE callback for the editor's
  // "Applies to" control (the control only renders when a callback is given).
  scope?: 'character' | 'global'
  onMoveScope?: (rule: HighlightRule) => void
}

export default function HighlightsPanel({ onSaved, prefill, initialTestText, openRuleId, analyticsOn = false, scope = 'character', onMoveScope }: Props) {
  const hideGroups = scope === 'global'
  const character = useCharacter()
  const [rules, setRules]       = useState<HighlightRule[]>(() => loadHighlights(character))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const an = useRuleAnalytics(character, rules, analyzeHighlights, analyticsOn, onSaved)
  const [draft, setDraft]       = useState<HighlightRule | null>(null)
  // B368: what the draft is compared against — the stored rule, the fresh
  // "+ New" / prefill draft, or the rule as just saved.
  const [baseline, setBaseline] = useState<HighlightRule | null>(null)
  const [isPendingNew, setIsPendingNew] = useState(false)
  const [testInput, setTestInput] = useState(initialTestText ?? '')
  const [search, setSearch]     = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const appliedOpenRef = useRef<string | undefined>(undefined)

  const dirty = !!draft && !!baseline && differs(draft, baseline)
  useReportUnsaved(dirty)

  useEffect(() => {
    if (!prefill) return
    confirmDiscard(dirty, () => {
      // An EXISTING rule can arrive here too (the Debug Fires "Edit" jump
      // passes the stored rule): that's an edit, not a new rule — treating it
      // as pending would append a second copy with the same id on Save.
      const existing = rules.some(r => r.id === prefill.id)
      setDraft({ ...prefill })
      setBaseline({ ...prefill })
      setSelectedId(prefill.id)
      setIsPendingNew(!existing)
      setTimeout(() => nameInputRef.current?.focus(), 0)
    })
  }, [prefill?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // v0.14.6: open an EXISTING rule by id (slash `/highlight edit`) — the
  // TriggersPanel openRuleId pattern. No-op if the rule was deleted since.
  // Applied ONCE per id: it also re-ran on every `rules` change, so saving a
  // different rule snapped the editor back to this one.
  useEffect(() => {
    // Reset when the request clears, so asking for the SAME rule again later
    // (a second Fires → Edit, a repeated slash `edit`) opens it again.
    if (!openRuleId) { appliedOpenRef.current = undefined; return }
    if (appliedOpenRef.current === openRuleId) return
    const r = rules.find(x => x.id === openRuleId)
    if (!r) return
    appliedOpenRef.current = openRuleId
    confirmDiscard(dirty, () => selectRule(r))
  }, [openRuleId, rules]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live preview ─────────────────────────────────────────────────────────

  const previewSource = testInput || PREVIEW_TEXT

  const previewNodes = useMemo(() => {
    if (!draft) return <span>{previewSource}</span>
    const regex = buildHighlightRegex(draft)
    if (!regex || !draft.pattern.trim()) return <span>{previewSource}</span>

    const rfx = resolveEffect(effectiveEffect(draft.style), draft.style.textColor, draft.style.glowColor)

    if (draft.scope === 'line') {
      regex.lastIndex = 0
      const matched = regex.test(previewSource)
      const lineStyle: React.CSSProperties = matched ? {
        ...(draft.style.bgColor && draft.style.bgColor !== 'transparent'
          ? { backgroundColor: draft.style.bgColor } : {}),
        ...(draft.style.textColor && draft.style.textColor !== 'transparent' && !rfx.colorReplacing
          ? { color: draft.style.textColor } : {}),
        ...(rfx.glowShadow ? { textShadow: rfx.glowShadow } : {}),
        ...(matched ? rfx.vars : {}),
      } : {}
      const cls = matched && rfx.className ? rfx.className : undefined
      const content = matched ? effectContent(previewSource, rfx.perLetter) : previewSource
      return draft.style.bold && matched
        ? <strong className={cls} style={lineStyle}>{content}</strong>
        : <span className={cls} style={lineStyle}>{content}</span>
    }

    // match scope — split and highlight
    regex.lastIndex = 0
    const parts: React.ReactNode[] = []
    let last = 0
    let n = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(previewSource)) !== null) {
      if (m[0].length === 0) { regex.lastIndex++; continue }
      if (m.index > last) parts.push(<span key={n++}>{previewSource.slice(last, m.index)}</span>)
      const hlStyle: React.CSSProperties = {
        ...(draft.style.bgColor && draft.style.bgColor !== 'transparent'
          ? { backgroundColor: draft.style.bgColor } : {}),
        ...(draft.style.textColor && draft.style.textColor !== 'transparent' && !rfx.colorReplacing
          ? { color: draft.style.textColor } : {}),
        ...(rfx.glowShadow ? { textShadow: rfx.glowShadow } : {}),
        ...rfx.vars,
      }
      const word = previewSource.slice(m.index, m.index + m[0].length)
      const cls = `hl-match${rfx.className ? ` ${rfx.className}` : ''}`
      parts.push(draft.style.bold
        ? <strong key={n++} className={cls} style={hlStyle}>{effectContent(word, rfx.perLetter)}</strong>
        : <span key={n++} className={cls} style={hlStyle}>{effectContent(word, rfx.perLetter)}</span>)
      last = m.index + m[0].length
    }
    if (last < previewSource.length) parts.push(<span key={n++}>{previewSource.slice(last)}</span>)
    return <>{parts}</>
  }, [draft, previewSource])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function selectRule(r: HighlightRule) {
    setSelectedId(r.id)
    setDraft({ ...r })
    setBaseline({ ...r })
    setIsPendingNew(false)
    setTestInput('')
  }

  // B368: the user-facing switches — they ask before an unsaved draft is lost.
  function requestSelect(r: HighlightRule) {
    if (r.id === selectedId) return
    confirmDiscard(dirty, () => selectRule(r))
  }

  function createNew() {
    const r = newHighlight()
    setDraft({ ...r })
    setBaseline({ ...r })
    setSelectedId(r.id)
    setIsPendingNew(true)
    setTestInput('')
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  // B379: why Save is unavailable, or null. Shown as the disabled button's
  // title, and checked by saveDraft so Enter can't get round it.
  const saveBlock = !draft ? 'Select a highlight to save'
    : !draft.pattern.trim() ? 'Enter a pattern to save'
    : draft.mode === 'regex' && !isValidRegex(draft.pattern) ? 'Fix the regular expression to save'
    : null

  function saveDraft() {
    if (!draft || saveBlock) return
    const trimmed = { ...draft, pattern: draft.pattern.trim() }
    if (!trimmed.name) trimmed.name = trimmed.pattern
    let updated: HighlightRule[]
    if (isPendingNew) {
      updated = [...rules, trimmed]
    } else {
      updated = rules.map(r => r.id === trimmed.id ? trimmed : r)
    }
    setRules(updated)
    saveHighlights(character, updated)
    setDraft(trimmed)
    setBaseline(trimmed)
    setIsPendingNew(false)
    onSaved?.()
  }

  function discardOrCancel() {
    if (isPendingNew) {
      setSelectedId(null)
      setDraft(null)
      setBaseline(null)
      setIsPendingNew(false)
    } else {
      const original = rules.find(r => r.id === selectedId)
      if (original) { setDraft({ ...original }); setBaseline({ ...original }) }
    }
  }

  function deleteRule() {
    if (!selectedId) return
    deleteRuleById(selectedId)
  }

  function deleteRuleById(id: string) {
    const updated = rules.filter(r => r.id !== id)
    setRules(updated)
    saveHighlights(character, updated)
    if (selectedId === id) {
      setSelectedId(null)
      setDraft(null)
      setBaseline(null)
      setIsPendingNew(false)
    }
    onSaved?.()
  }

  function toggleEnabled(id: string) {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setRules(updated)
    saveHighlights(character, updated)
    // The toggle saves immediately, so the baseline moves with the draft — a
    // row toggle must not read as an unsaved edit.
    if (draft?.id === id) {
      setDraft(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
      setBaseline(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
    }
    onSaved?.()
  }

  // NOTE: there is intentionally NO reorder UI. Overlap precedence is by match
  // specificity (smallest/most-specific highlight wins each property — see
  // renderSegmentFull), so list order doesn't determine which highlight wins;
  // exposing up/down controls would falsely imply a priority mechanism. (v0.11.3)

  // ── Sidebar list item ─────────────────────────────────────────────────────

  function listItemSwatch(r: HighlightRule): React.CSSProperties {
    const color = (r.style.bgColor && r.style.bgColor !== 'transparent') ? r.style.bgColor : r.style.textColor
    if (!color || color === 'transparent') return { background: 'var(--border)', opacity: 0.4 }
    return { background: color }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const body = (
        <div className="hp-body">

          {/* Sidebar */}
          <div className="hp-sidebar">
            <button type="button" className="hp-new-btn" onClick={() => confirmDiscard(dirty, createNew)}>+ New highlight</button>
            <div className="sidebar-search">
              <input
                className="sidebar-search-input"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="sidebar-search-clear" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search">✕</button>
              )}
              {search && (
                <span className="sidebar-search-count">
                  {rules.filter(r => (r.name + ' ' + r.pattern).toLowerCase().includes(search.toLowerCase())).length}/{rules.length}
                </span>
              )}
            </div>
            <div className="hp-list" role="listbox" aria-label="Highlights" onKeyDown={ruleListKeyDown}>
              {rules.length === 0 && !isPendingNew && (
                <div className="hp-empty">No highlights yet.<br />Right-click game text, or use + New highlight.</div>
              )}
              {(search ? rules.filter(r => (r.name + ' ' + r.pattern).toLowerCase().includes(search.toLowerCase())) : rules).map(r => {
                const label = r.name || r.pattern
                return (
                <div
                  key={r.id}
                  className={`hp-list-item${selectedId === r.id ? ' hp-list-item--active' : ''}${!r.enabled ? ' hp-list-item--disabled' : ''}`}
                  {...pressable(() => requestSelect(r), { role: 'option', selected: selectedId === r.id })}
                >
                  <button
                    type="button"
                    className={`hp-toggle${r.enabled ? ' hp-toggle--on' : ''}`}
                    title={r.enabled ? 'Disable' : 'Enable'}
                    aria-label={r.enabled ? 'Disable' : 'Enable'}
                    onClick={e => { e.stopPropagation(); toggleEnabled(r.id) }}
                  />
                  <span className="hp-list-swatch" style={listItemSwatch(r)} />
                  {/* B396: the full label, since the row truncates it. */}
                  <span className="hp-list-label" title={label || undefined}>{label || <em className="hp-unnamed">Unnamed</em>}</span>
                  {an.on ? <RuleBadges ruleId={r.id} report={an.report} stats={an.stats} /> : <span className="hp-list-scope">{r.scope}</span>}
                  {/* B370: a row ✕ deletes something that isn't open, so it asks. */}
                  <button
                    type="button"
                    className="list-item-delete"
                    title="Delete"
                    aria-label={`Delete ${label || 'highlight'}`}
                    onClick={async e => { e.stopPropagation(); if (await confirmDelete('highlight', label)) deleteRuleById(r.id) }}
                  >✕</button>
                </div>
                )
              })}
              {isPendingNew && draft && (
                <div className="hp-list-item hp-list-item--active hp-list-item--pending">
                  <span className="hp-toggle hp-toggle--on" />
                  <span className="hp-list-swatch" style={listItemSwatch(draft)} />
                  <span className="hp-list-label"><em>New highlight…</em></span>
                  <span className="hp-list-scope">{draft.scope}</span>
                </div>
              )}
            </div>
          </div>

          {/* Detail */}
          <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
          <div className="hp-detail">
            {!draft ? (
              <div className="hp-no-selection">Select a highlight or create a new one.</div>
            ) : (
              <>
              <div className="hp-form">

                <div className="hp-field">
                  <label className="hp-label">Label</label>
                  <input
                    ref={nameInputRef}
                    className="hp-input"
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. Bleeding alert (optional)"
                  />
                </div>

                {!hideGroups && (
                <div className="hp-field">
                  <label className="hp-label">Groups</label>
                  <div className="grp-row">
                    <button
                      type="button"
                      className={`grp-all-btn${draft.allGroups ? ' grp-all-btn--on' : ''}`}
                      onClick={() => setDraft({ ...draft, allGroups: !draft.allGroups, groupIds: [] })}
                    >All groups</button>
                    {!draft.allGroups && (
                      <GroupPicker
                        groupIds={draft.groupIds ?? []}
                        onChange={groupIds => setDraft({ ...draft, groupIds })}
                      />
                    )}
                  </div>
                </div>
                )}

                {/* F63: per-rule scope — the inactive side MOVES the rule to the
                    other store (incl. any unsaved edits in the draft). */}
                {onMoveScope && (
                <div className="hp-field">
                  <label className="hp-label">Applies to</label>
                  <div className="rule-scope-row">
                    <button
                      type="button"
                      className={`rule-scope-btn${scope === 'character' ? ' rule-scope-btn--on' : ''}`}
                      disabled={scope === 'character'}
                      onClick={() => onMoveScope(draft)}
                      title={scope === 'character'
                        ? 'This rule belongs to this character'
                        : 'Move this rule to the character you have open — every OTHER character stops getting it'}
                    >This character</button>
                    <button
                      type="button"
                      className={`rule-scope-btn${scope === 'global' ? ' rule-scope-btn--on' : ''}`}
                      disabled={scope === 'global'}
                      onClick={() => onMoveScope(draft)}
                      title={scope === 'global'
                        ? 'This rule applies to every character'
                        : 'Move this rule to All characters — it will fire for every character on every account (group gating is removed; global rules are always active)'}
                    >All characters</button>
                  </div>
                </div>
                )}

                <div className="hp-field">
                  <label className="hp-label">Pattern</label>
                  <div className="hp-pattern-row">
                    <input
                      className={`hp-input hp-input--pattern${draft.mode === 'regex' && draft.pattern && !isValidRegex(draft.pattern) ? ' hp-input--error' : ''}`}
                      value={draft.pattern}
                      onChange={e => setDraft({ ...draft, pattern: e.target.value })}
                      placeholder="Text to match…"
                      onKeyDown={e => { if (e.key === 'Enter') saveDraft() }}
                    />
                    <div className="hp-mode-toggle">
                      {(['text', 'phrase', 'regex'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          className={`hp-mode-btn${draft.mode === m ? ' hp-mode-btn--active' : ''}`}
                          onClick={() => setDraft({ ...draft, mode: m })}
                          title={
                            m === 'text'   ? 'Whole-word match — finds complete words, tolerates whitespace differences' :
                            m === 'phrase' ? 'Exact substring — matches the literal text including spacing and punctuation' :
                                             'Regular expression — full regex syntax'
                          }
                        >
                          {m === 'text' ? 'Text' : m === 'phrase' ? 'Phrase' : 'Regex'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={`hp-mode-btn hp-mode-btn--case${draft.caseSensitive ? ' hp-mode-btn--active' : ''}`}
                      onClick={() => setDraft({ ...draft, caseSensitive: !draft.caseSensitive })}
                      title={draft.caseSensitive ? 'Case-sensitive — click to ignore case' : 'Case-insensitive — click to match exact case'}
                    >
                      Aa
                    </button>
                  </div>
                  {draft.mode === 'regex' && draft.pattern && !isValidRegex(draft.pattern) && (
                    <span className="hp-pattern-error">Invalid regular expression</span>
                  )}
                </div>

                <div className="hp-field">
                  <label className="hp-label">Scope</label>
                  <div className="hp-scope-row">
                    {(['line', 'match'] as const).map(s => (
                      <label key={s} className="hp-radio-label">
                        <input
                          type="radio"
                          name="scope"
                          value={s}
                          checked={draft.scope === s}
                          onChange={() => setDraft({ ...draft, scope: s })}
                        />
                        <span>{s === 'line' ? 'Line — entire line is styled' : 'Match — only matched text is styled'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="hp-field">
                  <label className="hp-label">Style</label>
                  <div className="hp-style-grid">

                    <div className="hp-style-col">
                      <span className="hp-style-sublabel">Text</span>
                      <div className="hp-style-picker-row">
                        <input
                          type="color"
                          className="hp-color-picker"
                          value={colorPickerValue(draft.style.textColor)}
                          onChange={e => setDraft({ ...draft, style: { ...draft.style, textColor: e.target.value } })}
                        />
                        <input
                          className="hp-input hp-input--hex"
                          value={draft.style.textColor}
                          placeholder="transparent"
                          title={COLOR_INPUT_TITLE}
                          onChange={e => setDraft({ ...draft, style: { ...draft.style, textColor: e.target.value } })}
                          onBlur={e => { const v = normalizeColorInput(e.target.value); if (v !== e.target.value) setDraft({ ...draft, style: { ...draft.style, textColor: v } }) }}
                        />
                      </div>
                    </div>

                    <div className="hp-style-col">
                      <span className="hp-style-sublabel">Background</span>
                      <div className="hp-style-picker-row">
                        <div
                          className="hp-color-picker hp-color-checker"
                          style={swatchStyle(draft.style.bgColor)}
                        >
                          <input
                            type="color"
                            className="hp-color-overlay"
                            value={colorPickerValue(draft.style.bgColor)}
                            onChange={e => setDraft({ ...draft, style: { ...draft.style, bgColor: e.target.value } })}
                          />
                        </div>
                        <input
                          className="hp-input hp-input--hex"
                          value={draft.style.bgColor}
                          placeholder="transparent"
                          title={COLOR_INPUT_TITLE}
                          onChange={e => setDraft({ ...draft, style: { ...draft.style, bgColor: e.target.value } })}
                          onBlur={e => { const v = normalizeColorInput(e.target.value); if (v !== e.target.value) setDraft({ ...draft, style: { ...draft.style, bgColor: v } }) }}
                        />
                      </div>
                    </div>

                    <div className="hp-style-col">
                      <label className="hp-style-sublabel">Text effect</label>
                      <select
                        className="hp-input"
                        value={effectiveEffect(draft.style)}
                        onChange={e => {
                          const effect = e.target.value as HighlightEffect
                          // Keep the legacy `glow` flag in sync so anything still
                          // reading it (older exports, analytics) stays correct.
                          setDraft({ ...draft, style: { ...draft.style, effect, glow: effect === 'glow' } })
                        }}
                      >
                        {HIGHLIGHT_EFFECTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {FX_USES_COLOR.has(effectiveEffect(draft.style)) && (
                        <div className="hp-style-picker-row">
                          <input
                            type="color"
                            className="hp-color-picker"
                            value={colorPickerValue(draft.style.glowColor)}
                            onChange={e => setDraft({ ...draft, style: { ...draft.style, glowColor: e.target.value } })}
                          />
                          <input
                            className="hp-input hp-input--hex"
                            value={draft.style.glowColor}
                            title={COLOR_INPUT_TITLE}
                            onChange={e => setDraft({ ...draft, style: { ...draft.style, glowColor: e.target.value } })}
                            onBlur={e => { const v = normalizeColorInput(e.target.value); if (v !== e.target.value) setDraft({ ...draft, style: { ...draft.style, glowColor: v } }) }}
                          />
                        </div>
                      )}
                    </div>

                  </div>
                  <div className="hp-style-checks">
                    <label className="hp-checkbox-label">
                      <input
                        type="checkbox"
                        className="hp-checkbox"
                        checked={draft.style.bold}
                        onChange={e => setDraft({ ...draft, style: { ...draft.style, bold: e.target.checked } })}
                      />
                      <span>Bold</span>
                    </label>
                  </div>
                </div>

                <div className="hp-field">
                  <label className="hp-label">Sound</label>
                  <div className="hp-sound-row">
                    <input
                      className="hp-input hp-input--sound"
                      value={draft.soundFile ?? ''}
                      onChange={e => setDraft({ ...draft, soundFile: e.target.value || undefined })}
                      placeholder="Optional WAV file path…"
                    />
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm"
                      onClick={async () => {
                        const file = await window.api.browseFile([{ name: 'Sound Files', extensions: ['wav', 'mp3', 'ogg'] }])
                        if (file) setDraft(prev => prev ? { ...prev, soundFile: file } : prev)
                      }}
                    >Browse…</button>
                    {draft.soundFile && (
                      <>
                        <button
                          type="button"
                          className="ui-btn ui-btn--sm"
                          title="Test sound"
                          aria-label="Test sound"
                          onClick={() => playWavFile(draft.soundFile!)}
                        >▶</button>
                        <button
                          type="button"
                          className="ui-btn ui-btn--sm ui-btn--ghost"
                          title="Clear sound"
                          aria-label="Clear sound"
                          onClick={() => setDraft({ ...draft, soundFile: undefined })}
                        >✕</button>
                      </>
                    )}
                  </div>
                </div>

                <div className="hp-field hp-field--preview">
                  <label className="hp-label">Preview</label>
                  <div className="hp-preview-box">
                    {previewNodes}
                  </div>
                  <input
                    className="hp-input hp-input--test"
                    value={testInput}
                    onChange={e => setTestInput(e.target.value)}
                    placeholder="Type custom test text…"
                  />
                </div>

              </div>{/* /hp-form — Delete/Revert/Save pinned below as a fixed footer */}

              {/* Footer rail: [Delete] …spacer… [Revert/Cancel] [Save]. B401: the
                  editor's own Delete is the inline two-step. */}
              <div className="hp-actions">
                  {!isPendingNew && (
                    <InlineConfirm question="Delete this highlight?" onConfirm={deleteRule} resetKey={selectedId} />
                  )}
                  <span className="ui-modal-foot-spacer" />
                  <button
                    type="button"
                    className="ui-btn"
                    onClick={discardOrCancel}
                    disabled={!isPendingNew && !dirty}
                    title={!isPendingNew && !dirty ? 'No changes to revert' : undefined}
                  >
                    {isPendingNew ? 'Cancel' : 'Revert'}
                  </button>
                  <button type="button" className="ui-btn ui-btn--primary" onClick={saveDraft}
                    disabled={!!saveBlock} title={saveBlock ?? undefined}>Save</button>
              </div>
              </>
            )}
          </div>

        </div>
  )

  if (!an.on) return body
  return (
    <div className="aa-host">
      <AnalyticsReview rules={rules} report={an.report} stats={an.stats}
        nameOf={r => r.name || r.pattern}
        onJump={id => { const r = rules.find(x => x.id === id); if (r) requestSelect(r) }}
        onReset={an.reset}
        onBulkRemove={ids => {
          const s = new Set(ids); const u = rules.filter(r => !s.has(r.id))
          setRules(u); saveHighlights(character, u)
          // Only drop the editor if its rule was among those removed — an
          // unrelated (possibly unsaved) draft stays open.
          if (selectedId && s.has(selectedId)) {
            setSelectedId(null); setDraft(null); setBaseline(null); setIsPendingNew(false)
          }
          onSaved?.()
        }} />
      {body}
    </div>
  )
}
