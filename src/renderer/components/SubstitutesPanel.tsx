// Substitutes editor — the Automations tab that edits the `substitutes` rule
// store (DESIGN §31). What a substitute IS is described in the block below
// the imports; this panel is MutePanel's structural twin.
//
// Rendered by AutomationsPanel inside a `CharacterProvider`: `useCharacter()`
// names the store this panel edits, and in the F37 "All Characters" scope
// that provider is re-pointed at the virtual `_global` character, so the same
// `loadSubstitutes`/`saveSubstitutes` calls land on the global keys unchanged.
// Every write goes through ONE `persist()`: set state → `saveSubstitutes`
// (localStorage) → `onSaved` (the host's scheduled profile save → YAML). The
// list is loaded ONCE on mount — the host remounts the panel (its
// `importNonce` key) after an import or a scope move. Entry points besides
// the sidebar: `prefill` (a right-click "Substitute …" arrives as an unsaved
// draft) and `openRuleId` (slash `/sub edit`). `scope='global'` hides the
// Groups row; `onMoveScope` renders the F63 "Applies to" control, which MOVES
// the draft to the other store. Analytics (`useRuleAnalytics` +
// `AnalyticsReview`) is opt-in via `analyticsOn`. The per-rule "Apply to"
// stream restrict reuses `STREAM_OPTIONS` from mutes.ts.

import { useEffect, useRef, useState } from 'react'
import { ResizeDivider } from './ResizeDivider'
import { pressable } from '../utils/pressable'
import InlineConfirm from './InlineConfirm'
import { confirmDelete, confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import { loadSubstitutes, saveSubstitutes, newSubstitute, type SubstituteRule } from '../substitutes'
import { STREAM_OPTIONS } from '../mutes'
import { isValidRegex } from '../highlights'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { useRuleAnalytics, AnalyticsReview, RuleBadges, ruleListKeyDown } from './AutomationAnalytics'
import { analyzeSubstitutes } from '../automationHealth'
import GroupPicker from './GroupPicker'
import '../styles/highlights.css'
import '../styles/groups.css'

// Substitutes editor (DESIGN.md §31) — the other Text Modification feature
// (alongside Mutes). Rewrites matching game text into the replacement string
// (`$1`, `$2`, `$&` capture-group refs). Mirrors the Highlights/Mute panel's
// `hp-*` layout/classes. Display-only; the Session Log keeps the raw text.

interface Props {
  onSaved?: () => void
  prefill?: SubstituteRule   // from the game-window right-click "Substitute …"
  openRuleId?: string        // v0.14.6: open an existing rule for edit (slash /sub edit)
  analyticsOn?: boolean
  // F37/F63 (v0.15.2): which store this panel edits ('global' = All Characters
  // scope — groups row hidden) + the cross-store MOVE callback for the
  // editor's "Applies to" control (only rendered when a callback is given).
  scope?: 'character' | 'global'
  onMoveScope?: (rule: SubstituteRule) => void
}

export default function SubstitutesPanel({ onSaved, prefill, openRuleId, analyticsOn = false, scope = 'character', onMoveScope }: Props) {
  const hideGroups = scope === 'global'
  const character = useCharacter()
  const [rules, setRules]   = useState<SubstituteRule[]>(() => loadSubstitutes(character))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const an = useRuleAnalytics(character, rules, analyzeSubstitutes, analyticsOn, onSaved)
  const [draft, setDraft]   = useState<SubstituteRule | null>(null)
  // B368: what the draft is compared against (stored / fresh / just saved).
  const [baseline, setBaseline] = useState<SubstituteRule | null>(null)
  const [isPendingNew, setIsPendingNew] = useState(false)
  const [search, setSearch] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const appliedOpenRef = useRef<string | undefined>(undefined)

  const dirty = !!draft && !!baseline && differs(draft, baseline)
  useReportUnsaved(dirty)

  // A "Substitute …" from the game-window right-click arrives as a new draft.
  useEffect(() => {
    if (!prefill) return
    confirmDiscard(dirty, () => {
      setDraft({ ...prefill })
      setBaseline({ ...prefill })
      setSelectedId(prefill.id)
      setIsPendingNew(true)
      setTimeout(() => nameInputRef.current?.focus(), 0)
    })
  }, [prefill?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // v0.14.6: open an EXISTING rule by id (slash `/sub edit`) — the
  // TriggersPanel openRuleId pattern. No-op if the rule was deleted since.
  // Applied once per id, so a later save doesn't snap the editor back.
  useEffect(() => {
    // Reset when the request clears, so asking for the same rule again opens it.
    if (!openRuleId) { appliedOpenRef.current = undefined; return }
    if (appliedOpenRef.current === openRuleId) return
    const r = rules.find(x => x.id === openRuleId)
    if (!r) return
    appliedOpenRef.current = openRuleId
    confirmDiscard(dirty, () => selectRule(r))
  }, [openRuleId, rules]) // eslint-disable-line react-hooks/exhaustive-deps

  function selectRule(r: SubstituteRule) {
    setSelectedId(r.id)
    setDraft({ ...r })
    setBaseline({ ...r })
    setIsPendingNew(false)
  }

  // B368: the user-facing switches — they ask before an unsaved draft is lost.
  function requestSelect(r: SubstituteRule) {
    if (r.id === selectedId) return
    confirmDiscard(dirty, () => selectRule(r))
  }

  function createNew() {
    const r = newSubstitute()
    setDraft(r)
    setBaseline({ ...r })
    setSelectedId(r.id)
    setIsPendingNew(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function persist(updated: SubstituteRule[]) {
    setRules(updated)
    saveSubstitutes(character, updated)
    onSaved?.()
  }

  const regexInvalid = !!draft && draft.mode === 'regex' && !!draft.pattern && !isValidRegex(draft.pattern)
  // B379: why Save is unavailable (the disabled button's title), or null.
  const saveBlock = !draft ? 'Select a substitute to save'
    : !draft.pattern.trim() ? 'Fill in Find to save'
    : regexInvalid ? 'Fix the regular expression to save'
    : null

  // The rule as it is stored. Shared by Save and the "Applies to" move — the
  // move stores it too (in the other list), so the two can't store it
  // differently (an untrimmed pattern would miss its twin there).
  function finalized(d: SubstituteRule): SubstituteRule {
    const t = { ...d, pattern: d.pattern.trim() }
    if (!t.name) t.name = t.pattern
    return t
  }

  function saveDraft() {
    if (!draft || saveBlock) return
    const trimmed = finalized(draft)
    persist(isPendingNew ? [...rules, trimmed] : rules.map(r => r.id === trimmed.id ? trimmed : r))
    setDraft(trimmed)
    setBaseline(trimmed)
    setIsPendingNew(false)
  }

  function discardOrCancel() {
    if (isPendingNew) {
      setSelectedId(null); setDraft(null); setBaseline(null); setIsPendingNew(false)
    } else {
      const original = rules.find(r => r.id === selectedId)
      if (original) { setDraft({ ...original }); setBaseline({ ...original }) }
    }
  }

  function deleteRuleById(id: string) {
    persist(rules.filter(r => r.id !== id))
    if (selectedId === id) { setSelectedId(null); setDraft(null); setBaseline(null); setIsPendingNew(false) }
  }

  function toggleEnabled(id: string) {
    persist(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    // Saved immediately, so the baseline moves too — not an unsaved edit.
    if (draft?.id === id) {
      setDraft(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
      setBaseline(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
    }
  }

  const filtered = search
    ? rules.filter(r => (r.name + ' ' + r.pattern + ' ' + r.replacement).toLowerCase().includes(search.toLowerCase()))
    : rules

  const subBody = (
    <div className="hp-body">
      {/* Sidebar */}
      <div className="hp-sidebar">
        <button type="button" className="hp-new-btn" onClick={() => confirmDiscard(dirty, createNew)}>+ New substitute</button>
        <div className="sidebar-search">
          <input
            className="sidebar-search-input"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="sidebar-search-clear" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search">✕</button>}
          {search && <span className="sidebar-search-count">{filtered.length}/{rules.length}</span>}
        </div>
        <div className="hp-list" role="listbox" aria-label="Substitutes" onKeyDown={ruleListKeyDown}>
          {rules.length === 0 && !isPendingNew && (
            <div className="hp-empty">No substitutes yet.<br />Use + New substitute to rewrite game text.</div>
          )}
          {filtered.map(r => {
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
              {/* B396: the full label, since the row truncates it. */}
              <span className="hp-list-label" title={label || undefined}>{label || <em className="hp-unnamed">Unnamed</em>}</span>
              {an.on ? <RuleBadges ruleId={r.id} report={an.report} stats={an.stats} /> : <span className="hp-list-scope">{r.mode}</span>}
              {/* B370: a row ✕ deletes something that isn't open, so it asks. */}
              <button
                type="button"
                className="list-item-delete"
                title="Delete"
                aria-label={`Delete ${label || 'substitute'}`}
                onClick={async e => { e.stopPropagation(); if (await confirmDelete('substitute', label)) deleteRuleById(r.id) }}
              >✕</button>
            </div>
            )
          })}
          {isPendingNew && draft && (
            <div className="hp-list-item hp-list-item--active hp-list-item--pending">
              <span className="hp-toggle hp-toggle--on" />
              <span className="hp-list-label"><em>New substitute…</em></span>
              <span className="hp-list-scope">{draft.mode}</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail */}
      <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
      <div className="hp-detail">
        {!draft ? (
          <div className="hp-no-selection">Select a substitute or create a new one.<br />Substituted text is shown in the window; the Session Log keeps the original.</div>
        ) : (
          <div className="hp-form">
            <div className="hp-field">
              <label className="hp-label">Label</label>
              <input
                ref={nameInputRef}
                className="hp-input"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Shorten mind-states (optional)"
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

            {/* F63: per-rule scope — the inactive side MOVES the substitute to
                the other store (incl. any unsaved draft edits). */}
            {onMoveScope && (
            <div className="hp-field">
              <label className="hp-label">Applies to</label>
              <div className="rule-scope-row">
                <button
                  type="button"
                  className={`rule-scope-btn${scope === 'character' ? ' rule-scope-btn--on' : ''}`}
                  disabled={scope === 'character' || !!saveBlock}
                  onClick={() => onMoveScope(finalized(draft))}
                  title={scope === 'character'
                    ? 'This substitute belongs to this character'
                    : saveBlock ? `${saveBlock}, then you can move it`
                    : 'Move this substitute to the character you have open — every OTHER character stops getting it'}
                >This character</button>
                <button
                  type="button"
                  className={`rule-scope-btn${scope === 'global' ? ' rule-scope-btn--on' : ''}`}
                  disabled={scope === 'global' || !!saveBlock}
                  onClick={() => onMoveScope(finalized(draft))}
                  title={scope === 'global'
                    ? 'This substitute applies to every character'
                    : saveBlock ? `${saveBlock}, then you can move it`
                    : 'Move this substitute to All characters — it will rewrite this text for every character on every account'}
                >All characters</button>
              </div>
            </div>
            )}

            <div className="hp-field">
              <label className="hp-label">Find</label>
              <div className="hp-pattern-row">
                <input
                  className={`hp-input hp-input--pattern${regexInvalid ? ' hp-input--error' : ''}`}
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
                        m === 'text'   ? 'Whole-word match' :
                        m === 'phrase' ? 'Exact substring (contains)' :
                                         'Regular expression (use $1, $2… in Replace)'
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
              {regexInvalid && <span className="hp-pattern-error">Invalid regular expression</span>}
            </div>

            <div className="hp-field">
              <label className="hp-label">Replace with</label>
              <input
                className="hp-input hp-input--code"
                value={draft.replacement}
                onChange={e => setDraft({ ...draft, replacement: e.target.value })}
                placeholder="Replacement text — use $1, $2 for regex capture groups"
                onKeyDown={e => { if (e.key === 'Enter') saveDraft() }}
              />
            </div>

            <div className="hp-field">
              <label className="hp-label">Apply to</label>
              <select
                className="hp-input"
                value={draft.stream ?? ''}
                onChange={e => setDraft({ ...draft, stream: e.target.value || undefined })}
              >
                {STREAM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Footer rail: [Delete] …spacer… [Revert/Cancel] [Save]. */}
            <div className="hp-actions">
              {!isPendingNew && (
                <InlineConfirm question="Delete this substitute?" onConfirm={() => deleteRuleById(draft.id)} resetKey={selectedId} />
              )}
              <span className="ui-modal-foot-spacer" />
              <button
                type="button"
                className="ui-btn"
                onClick={discardOrCancel}
                disabled={!isPendingNew && !dirty}
                title={!isPendingNew && !dirty ? 'No changes to revert' : undefined}
              >{isPendingNew ? 'Cancel' : 'Revert'}</button>
              <button type="button" className="ui-btn ui-btn--primary" onClick={saveDraft} disabled={!!saveBlock} title={saveBlock ?? undefined}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (!an.on) return subBody
  return (
    <div className="aa-host">
      <AnalyticsReview rules={rules} report={an.report} stats={an.stats}
        nameOf={r => r.name || r.pattern}
        onJump={id => { const r = rules.find(x => x.id === id); if (r) requestSelect(r) }}
        onReset={an.reset}
        onBulkRemove={ids => {
          const s = new Set(ids); const u = rules.filter(r => !s.has(r.id))
          persist(u)
          // Only drop the editor if its rule was among those removed.
          if (selectedId && s.has(selectedId)) { setSelectedId(null); setDraft(null); setBaseline(null); setIsPendingNew(false) }
        }} />
      {subBody}
    </div>
  )
}
