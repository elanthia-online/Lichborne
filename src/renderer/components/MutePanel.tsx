// Mutes editor — the Automations tab that edits the `mutes` rule store
// (DESIGN §31). What a mute IS is described in the block below the imports.
//
// Rendered by AutomationsPanel inside a `CharacterProvider`: `useCharacter()`
// names the store this panel edits, and in the F37 "All Characters" scope
// that provider is re-pointed at the virtual `_global` character, so the same
// `loadMutes`/`saveMutes` calls land on the global keys unchanged. Every write
// goes through ONE `persist()`: set state → `saveMutes` (localStorage) →
// `onSaved` (the host's scheduled profile save → YAML). The list is loaded
// ONCE on mount — the host remounts the panel (its `importNonce` key) after
// an import or a scope move. Entry points besides the sidebar: `prefill` (a
// right-click "Mute …" arrives as an unsaved draft) and `openRuleId` (slash
// `/mute edit`, the TriggersPanel pattern). `scope='global'` hides the Groups
// row (global rules are always-active); `onMoveScope` renders the F63
// "Applies to" control, which MOVES the draft to the other store. The
// Analytics wrapper (`useRuleAnalytics` + `AnalyticsReview`) is opt-in via
// `analyticsOn`. Substitutes have their own sibling panel (SubstitutesPanel).

import { useEffect, useRef, useState } from 'react'
import { ResizeDivider } from './ResizeDivider'
import { pressable } from '../utils/pressable'
import InlineConfirm from './InlineConfirm'
import { confirmDelete, confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import { loadMutes, saveMutes, newMute, STREAM_OPTIONS, type MuteRule } from '../mutes'
import { isValidRegex } from '../highlights'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { useRuleAnalytics, AnalyticsReview, RuleBadges, ruleListKeyDown } from './AutomationAnalytics'
import { analyzeMutes } from '../automationHealth'
import GroupPicker from './GroupPicker'
import '../styles/highlights.css'
import '../styles/groups.css'

// Mute (a.k.a. Gag / Ignore) editor (DESIGN.md §31).
// Mirrors the Highlights panel's `hp-*` layout/classes for a consistent look.
// A mute removes matching game text: `line` scope hides the whole line (the
// typical use), `match` scope strips only the matched text. The raw line is
// still saved to the Session Log. (Substitutes — the other Text Modification
// feature — join this panel in Phase 2.)

interface Props {
  onSaved?: () => void
  prefill?: MuteRule   // from the game-window right-click "Mute …"
  openRuleId?: string  // v0.14.6: open an existing rule for edit (slash /mute edit)
  analyticsOn?: boolean
  // F37/F63 (v0.15.2): which store this panel edits ('global' = All Characters
  // scope — groups row hidden) + the cross-store MOVE callback for the
  // editor's "Applies to" control (only rendered when a callback is given).
  scope?: 'character' | 'global'
  onMoveScope?: (rule: MuteRule) => void
}

export default function MutePanel({ onSaved, prefill, openRuleId, analyticsOn = false, scope = 'character', onMoveScope }: Props) {
  const hideGroups = scope === 'global'
  const character = useCharacter()
  const [rules, setRules]   = useState<MuteRule[]>(() => loadMutes(character))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const an = useRuleAnalytics(character, rules, analyzeMutes, analyticsOn, onSaved)
  const [draft, setDraft]   = useState<MuteRule | null>(null)
  // B368: what the draft is compared against (stored / fresh / just saved).
  const [baseline, setBaseline] = useState<MuteRule | null>(null)
  const [isPendingNew, setIsPendingNew] = useState(false)
  const [search, setSearch] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const appliedOpenRef = useRef<string | undefined>(undefined)

  const dirty = !!draft && !!baseline && differs(draft, baseline)
  useReportUnsaved(dirty)

  // A "Mute …" from the game-window right-click arrives as a new (unsaved) draft.
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

  // v0.14.6: open an EXISTING rule by id (slash `/mute edit`) — the
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

  function selectRule(r: MuteRule) {
    setSelectedId(r.id)
    setDraft({ ...r })
    setBaseline({ ...r })
    setIsPendingNew(false)
  }

  // B368: the user-facing switches — they ask before an unsaved draft is lost.
  function requestSelect(r: MuteRule) {
    if (r.id === selectedId) return
    confirmDiscard(dirty, () => selectRule(r))
  }

  function createNew() {
    const r = newMute()
    setDraft(r)
    setBaseline({ ...r })
    setSelectedId(r.id)
    setIsPendingNew(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function persist(updated: MuteRule[]) {
    setRules(updated)
    saveMutes(character, updated)
    onSaved?.()
  }

  const regexInvalid = !!draft && draft.mode === 'regex' && !!draft.pattern && !isValidRegex(draft.pattern)
  // B379: why Save is unavailable (the disabled button's title), or null.
  const saveBlock = !draft ? 'Select a mute to save'
    : !draft.pattern.trim() ? 'Enter a pattern to save'
    : regexInvalid ? 'Fix the regular expression to save'
    : null

  // The rule as it is stored. Shared by Save and the "Applies to" move — the
  // move stores it too (in the other list), so the two can't store it
  // differently (an untrimmed pattern would miss its twin there).
  function finalized(d: MuteRule): MuteRule {
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
    ? rules.filter(r => (r.name + ' ' + r.pattern).toLowerCase().includes(search.toLowerCase()))
    : rules

  const muteBody = (
    <div className="hp-body">
      {/* Sidebar */}
      <div className="hp-sidebar">
        <button type="button" className="hp-new-btn" onClick={() => confirmDiscard(dirty, createNew)}>+ New mute</button>
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
        <div className="hp-list" role="listbox" aria-label="Mutes" onKeyDown={ruleListKeyDown}>
          {rules.length === 0 && !isPendingNew && (
            <div className="hp-empty">No mutes yet.<br />Use + New mute to hide text from the window.</div>
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
              {an.on ? <RuleBadges ruleId={r.id} report={an.report} stats={an.stats} /> : <span className="hp-list-scope">{r.scope}</span>}
              {/* B370: a row ✕ deletes something that isn't open, so it asks. */}
              <button
                type="button"
                className="list-item-delete"
                title="Delete"
                aria-label={`Delete ${label || 'mute'}`}
                onClick={async e => { e.stopPropagation(); if (await confirmDelete('mute', label)) deleteRuleById(r.id) }}
              >✕</button>
            </div>
            )
          })}
          {isPendingNew && draft && (
            <div className="hp-list-item hp-list-item--active hp-list-item--pending">
              <span className="hp-toggle hp-toggle--on" />
              <span className="hp-list-label"><em>New mute…</em></span>
              <span className="hp-list-scope">{draft.scope}</span>
            </div>
          )}
        </div>
      </div>

      {/* Detail */}
      <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
      <div className="hp-detail">
        {!draft ? (
          <div className="hp-no-selection">Select a mute or create a new one.<br />Muted text is hidden from the window but still saved to your Session Log.</div>
        ) : (
          <div className="hp-form">
            <div className="hp-field">
              <label className="hp-label">Label</label>
              <input
                ref={nameInputRef}
                className="hp-input"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Hide arrivals (optional)"
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

            {/* F63: per-rule scope — the inactive side MOVES the mute to the
                other store (incl. any unsaved draft edits). */}
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
                    ? 'This mute belongs to this character'
                    : saveBlock ? `${saveBlock}, then you can move it`
                    : 'Move this mute to the character you have open — every OTHER character stops getting it'}
                >This character</button>
                <button
                  type="button"
                  className={`rule-scope-btn${scope === 'global' ? ' rule-scope-btn--on' : ''}`}
                  disabled={scope === 'global' || !!saveBlock}
                  onClick={() => onMoveScope(finalized(draft))}
                  title={scope === 'global'
                    ? 'This mute applies to every character'
                    : saveBlock ? `${saveBlock}, then you can move it`
                    : 'Move this mute to All characters — it will hide this text for every character on every account'}
                >All characters</button>
              </div>
            </div>
            )}

            <div className="hp-field">
              <label className="hp-label">Pattern</label>
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
                                         'Regular expression'
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
              <label className="hp-label">Remove</label>
              <div className="hp-scope-row">
                {(['line', 'match'] as const).map(s => (
                  <label key={s} className="hp-radio-label">
                    <input
                      type="radio"
                      name="mute-scope"
                      value={s}
                      checked={draft.scope === s}
                      onChange={() => setDraft({ ...draft, scope: s })}
                    />
                    <span>{s === 'line' ? 'Line — hide the whole line' : 'Match — remove only the matched text'}</span>
                  </label>
                ))}
              </div>
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
                <InlineConfirm question="Delete this mute?" onConfirm={() => deleteRuleById(draft.id)} resetKey={selectedId} />
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

  if (!an.on) return muteBody
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
      {muteBody}
    </div>
  )
}
