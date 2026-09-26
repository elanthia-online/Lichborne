// Macros panel — ONE component that edits TWO rule stores behind an internal
// tab: ALIASES (`aliases` — "when I type X, send these commands", with
// `$1`/`$2`/`$rest`, pass-through and a per-command delay) and KEY BINDINGS
// (`macros` — a recorded key combo → commands, with `$vars` and `{Token}`
// playback such as RepeatLast).
//
// AutomationsPanel hosts it TWICE, once per `initialTab`, and `initialTab` is
// read once on mount — which is why the host keys the two tabs distinctly.
// That host is its only caller: the never-rendered standalone modal branch
// (with its own Aliases/Key Bindings tab switch) was removed in v0.19.7, B408.
// Unsaved edits are tracked against a baseline per editor and guarded the
// HighlightsPanel way (B368). Per
// character via `useCharacter()` (re-pointed at the virtual `_global` store
// in the Automations "All Characters" scope — `scope='global'` hides the
// Groups rows, and `onMoveScope(type, rule)` carries WHICH store because this
// panel hosts both). Every write is `setX` → `saveAliases`/`saveMacros`
// (localStorage) → `onSaved` (the host's scheduled profile save → YAML);
// lists load ONCE on mount. Exports `KeyBindingField` (the Record-a-combo
// control, built on `formatKeyCombo`) — GroupsModesTab reuses it for mode
// hotkeys. The command inputs document the `@` cursor convention (B137,
// v0.8.10): an unescaped `@` makes a command "type and wait", `\@` is a
// literal. `openAliasId` (v0.14.6) opens an existing alias for `/alias edit`.
// Analytics is opt-in via `analyticsOn`, one review per tab.

import { useEffect, useRef, useState } from 'react'
import { pressable } from '../utils/pressable'
import { ResizeDivider } from './ResizeDivider'
import VarMenu from './VarMenu'
import InlineConfirm from './InlineConfirm'
import { confirmDelete, confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import {
  type AliasRule, type MacroRule,
  loadAliases, saveAliases, newAlias,
  loadMacros,  saveMacros,  newMacro,
  formatKeyCombo,
  ALIAS_VARS, MACRO_VARS, MACRO_TOKENS,
} from '../macros'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { IS_MAC } from '../lichSettings'
import { useRuleAnalytics, AnalyticsReview, RuleBadges, ruleListKeyDown, enterToSave } from './AutomationAnalytics'
import { analyzeMacros, analyzeAliases } from '../automationHealth'
import GroupPicker from './GroupPicker'
import '../styles/macros.css'
import '../styles/groups.css'

type Tab = 'aliases' | 'macros'

interface Props {
  onSaved?:     () => void
  initialTab?:  'aliases' | 'macros'
  openAliasId?: string // v0.14.6: open an existing alias for edit (slash /alias edit)
  // v0.20.0: open an existing macro — the "Applies to" move reopens the rule
  // it moved, and macros were the one type with no way to be opened.
  openMacroId?: string
  analyticsOn?: boolean
  // F37/F63 (v0.15.2): which store this panel edits ('global' = All Characters
  // scope — groups rows hidden) + the cross-store MOVE callback for the
  // editors' "Applies to" controls. This panel hosts BOTH macro and alias
  // editors (internal tab), so the callback carries the type.
  scope?: 'character' | 'global'
  onMoveScope?: (type: 'macros' | 'aliases', rule: MacroRule | AliasRule) => void
}

// ── Var Picker ────────────────────────────────────────────────────────────────

// The shared "$" insert menu (VarMenu.tsx), shaped for this panel: the $vars,
// then — macros only — the {Tokens}, which replay history rather than read state.
function MaVarPicker({ inputRef, value, onChange, vars, tokens }: {
  inputRef: React.RefObject<HTMLInputElement>
  value: string
  onChange: (v: string) => void
  vars: { name: string; desc: string }[]
  // v0.8.3: optional {Name} tokens (RepeatLast etc.). Only the macro editor
  // passes these — aliases don't support token playback.
  tokens?: { name: string; desc: string }[]
}) {
  return (
    <VarMenu
      inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLTextAreaElement>}
      value={value}
      onChange={onChange}
      title="Insert variable or token"
      sections={[
        { items: vars.map(v => ({ label: `$${v.name}`, insert: `$${v.name}`, desc: v.desc })) },
        { title: 'Special tokens', items: (tokens ?? []).map(t => ({ label: `{${t.name}}`, insert: `{${t.name}}`, desc: t.desc })) },
      ]}
    />
  )
}

// ── Command List ──────────────────────────────────────────────────────────────

interface CommandListProps {
  commands: string[]
  onChange: (commands: string[]) => void
  vars: { name: string; desc: string }[]
  tokens?: { name: string; desc: string }[]
}

function CommandList({ commands, onChange, vars, tokens }: CommandListProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function update(i: number, val: string) {
    const next = [...commands]; next[i] = val; onChange(next)
  }
  function remove(i: number) {
    const next = commands.filter((_, j) => j !== i)
    onChange(next.length ? next : [''])
  }

  return (
    <div className="ma-cmd-list">
      {commands.map((cmd, i) => {
        const iRef = { current: refs.current[i] ?? null } as React.RefObject<HTMLInputElement>
        return (
          <div key={i} className="ma-cmd-row">
            <input
              ref={el => { refs.current[i] = el }}
              className="ma-input ma-input--cmd"
              value={cmd}
              onChange={e => update(i, e.target.value)}
              placeholder="Command to send…"
              spellCheck={false}
              // B137 (v0.8.10): include `@` in a command to make it
              // "type and wait" — the macro types the text into the
              // command bar, places the cursor where the `@` was, and
              // waits for you to finish typing and press Enter
              // yourself. Use `\@` for a literal `@` character. Matches
              // Genie / Wrayth / Stormfront convention.
              title={
                'Include `@` to mark where the cursor should land — Lichborne will\n'
                + 'type the text and wait for you to finish typing instead of sending.\n'
                + 'Example: `arrange @` types "arrange " and waits for the target.\n'
                + 'Use `\\@` for a literal `@` character.'
              }
            />
            <MaVarPicker inputRef={iRef} value={cmd} onChange={v => update(i, v)} vars={vars} tokens={tokens} />
            {commands.length > 1 && (
              <button className="ma-cmd-remove" type="button" onClick={() => remove(i)} title="Remove command" aria-label="Remove command">×</button>
            )}
          </div>
        )
      })}
      <button className="ma-add-cmd-btn" type="button" onClick={() => onChange([...commands, ''])}>+ Add command</button>
    </div>
  )
}

// ── Key Binding Field ─────────────────────────────────────────────────────────

interface KeyBindingFieldProps {
  value: string
  onChange: (v: string) => void
}

export function KeyBindingField({ value, onChange }: KeyBindingFieldProps) {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(false); return }
      // B347: on a Mac, record Option chords by physical key (`Alt+T`, not `Alt+†`).
      const combo = formatKeyCombo(e, { mac: IS_MAC })
      if (combo) { onChange(combo); setRecording(false) }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [recording, onChange])

  function clear() {
    onChange('')
    setRecording(false)
  }

  return (
    <div className="ma-key-field">
      <div className={`ma-key-display${recording ? ' ma-key-display--listening' : ''}${!value && !recording ? ' ma-key-display--empty' : ''}`}>
        {recording ? 'Press a key combination…' : (value || 'Not set')}
      </div>
      <button
        className={`ma-record-btn${recording ? ' ma-record-btn--active' : ''}`}
        type="button"
        onClick={() => setRecording(r => !r)}
      >
        {recording ? '■ Cancel' : '● Record'}
      </button>
      {value && !recording && (
        <button className="ma-clear-btn" type="button" onClick={clear} title="Clear binding" aria-label="Clear binding">✕</button>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function MacrosPanel({ onSaved, initialTab, openAliasId, openMacroId, analyticsOn = false, scope = 'character', onMoveScope }: Props) {
  // The key recorder above preventDefaults every key it captures, Esc
  // included, so cancelling a recording never closes the Automations dialog.
  const hideGroups = scope === 'global'
  // Fixed for the life of the instance (the host keys the two tabs apart).
  const [tab]                   = useState<Tab>(initialTab ?? 'aliases')
  const character = useCharacter()
  const [aliases, setAliases]   = useState<AliasRule[]>(() => loadAliases(character))
  const [macros,  setMacros]    = useState<MacroRule[]>(() => loadMacros(character))
  const anAlias = useRuleAnalytics(character, aliases, analyzeAliases, analyticsOn, onSaved)
  const anMacro = useRuleAnalytics(character, macros,  analyzeMacros,  analyticsOn, onSaved)

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [aliasDraft,   setAliasDraft]   = useState<AliasRule | null>(null)
  const [macroDraft,   setMacroDraft]   = useState<MacroRule | null>(null)
  // B368: what each draft is compared against (stored / fresh / just saved).
  const [aliasBase,    setAliasBase]    = useState<AliasRule | null>(null)
  const [macroBase,    setMacroBase]    = useState<MacroRule | null>(null)
  const [isPendingNew, setIsPendingNew] = useState(false)
  const [search,       setSearch]       = useState('')

  const nameInputRef = useRef<HTMLInputElement>(null)
  const appliedOpenRef = useRef<string | undefined>(undefined)

  const aliasDirty = !!aliasDraft && !!aliasBase && differs(aliasDraft, aliasBase)
  const macroDirty = !!macroDraft && !!macroBase && differs(macroDraft, macroBase)
  useReportUnsaved(aliasDirty || macroDirty)

  // v0.14.6: open an EXISTING alias by id (slash `/alias edit`) — the
  // TriggersPanel openRuleId pattern. The host passes initialTab='aliases'
  // alongside, so `tab` is already right. No-op if the alias was deleted.
  // Applied once per id, so a later save doesn't snap the editor back.
  useEffect(() => {
    // Reset when the request clears, so asking for the same alias again opens it.
    if (!openAliasId) { appliedOpenRef.current = undefined; return }
    if (appliedOpenRef.current === openAliasId) return
    const r = aliases.find(x => x.id === openAliasId)
    if (!r) return
    appliedOpenRef.current = openAliasId
    confirmDiscard(aliasDirty, () => selectAlias(r))
  }, [openAliasId, aliases]) // eslint-disable-line react-hooks/exhaustive-deps

  // The same for a macro. Its own applied-ref, so an alias request and a macro
  // request can never cancel each other out.
  const appliedMacroOpenRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!openMacroId) { appliedMacroOpenRef.current = undefined; return }
    if (appliedMacroOpenRef.current === openMacroId) return
    const r = macros.find(x => x.id === openMacroId)
    if (!r) return
    appliedMacroOpenRef.current = openMacroId
    confirmDiscard(macroDirty, () => selectMacro(r))
  }, [openMacroId, macros]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Alias CRUD ──────────────────────────────────────────────────────────────

  function selectAlias(r: AliasRule) {
    setSelectedId(r.id)
    setAliasDraft({ ...r })
    setAliasBase({ ...r })
    setIsPendingNew(false)
  }

  function requestSelectAlias(r: AliasRule) {
    if (r.id === selectedId) return
    confirmDiscard(aliasDirty, () => selectAlias(r))
  }

  function createAlias() {
    const r = newAlias()
    setAliasDraft({ ...r })
    setAliasBase({ ...r })
    setSelectedId(r.id)
    setIsPendingNew(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  // B379: why Save is unavailable (the disabled button's title), or null.
  const aliasSaveBlock = !aliasDraft ? 'Select an alias to save'
    : !aliasDraft.input.trim() ? 'Enter what you type to use the alias'
    : !aliasDraft.commands.some(c => c.trim()) ? 'Enter at least one command to save'
    : null

  // The rule as it is stored. Shared by Save and the "Applies to" move — the
  // move stores it too (in the other list), so the two can't store it
  // differently (an untrimmed pattern would miss its twin there).
  function finalizedAlias(d: AliasRule): AliasRule {
    const t = { ...d, input: d.input.trim() }
    if (!t.name) t.name = t.input
    t.commands = t.commands.filter(c => c.trim())
    return t
  }

  function saveAlias() {
    if (!aliasDraft || aliasSaveBlock) return
    const trimmed = finalizedAlias(aliasDraft)
    const updated = isPendingNew
      ? [...aliases, trimmed]
      : aliases.map(r => r.id === trimmed.id ? trimmed : r)
    setAliases(updated)
    saveAliases(character, updated)
    onSaved?.()
    setAliasDraft(trimmed)
    setAliasBase(trimmed)
    setIsPendingNew(false)
  }

  function revertAlias() {
    if (isPendingNew) {
      setSelectedId(null); setAliasDraft(null); setAliasBase(null); setIsPendingNew(false)
    } else {
      const orig = aliases.find(r => r.id === selectedId)
      if (orig) { setAliasDraft({ ...orig }); setAliasBase({ ...orig }) }
    }
  }

  function deleteAlias() {
    if (!selectedId) return
    deleteAliasById(selectedId)
  }

  function deleteAliasById(id: string) {
    const updated = aliases.filter(r => r.id !== id)
    setAliases(updated)
    saveAliases(character, updated)
    onSaved?.()
    if (selectedId === id) {
      setSelectedId(null); setAliasDraft(null); setAliasBase(null)
      setIsPendingNew(false)
    }
  }

  function toggleAlias(id: string) {
    const updated = aliases.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setAliases(updated)
    saveAliases(character, updated)
    onSaved?.()
    // Saved immediately, so the baseline moves too — not an unsaved edit.
    if (aliasDraft?.id === id) {
      setAliasDraft(p => p ? { ...p, enabled: !p.enabled } : p)
      setAliasBase(p => p ? { ...p, enabled: !p.enabled } : p)
    }
  }

  // ── Macro CRUD ──────────────────────────────────────────────────────────────

  function selectMacro(r: MacroRule) {
    setSelectedId(r.id)
    setMacroDraft({ ...r })
    setMacroBase({ ...r })
    setIsPendingNew(false)
  }

  function requestSelectMacro(r: MacroRule) {
    if (r.id === selectedId) return
    confirmDiscard(macroDirty, () => selectMacro(r))
  }

  function createMacro() {
    const r = newMacro()
    setMacroDraft({ ...r })
    setMacroBase({ ...r })
    setSelectedId(r.id)
    setIsPendingNew(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  // B379: a macro with no key can never fire (Automation Analytics already
  // lists it as broken), so a key is required, not just a label.
  const macroSaveBlock = !macroDraft ? 'Select a macro to save'
    : !macroDraft.key ? 'Record a key combination to save'
    : !macroDraft.commands.some(c => c.trim()) ? 'Enter at least one command to save'
    : null

  function finalizedMacro(d: MacroRule): MacroRule {
    const t = { ...d }
    if (!t.name) t.name = t.key
    t.commands = t.commands.filter(c => c.trim())
    return t
  }

  function saveMacro() {
    if (!macroDraft || macroSaveBlock) return
    const trimmed = finalizedMacro(macroDraft)
    const updated = isPendingNew
      ? [...macros, trimmed]
      : macros.map(r => r.id === trimmed.id ? trimmed : r)
    setMacros(updated)
    saveMacros(character, updated)
    onSaved?.()
    setMacroDraft(trimmed)
    setMacroBase(trimmed)
    setIsPendingNew(false)
  }

  function revertMacro() {
    if (isPendingNew) {
      setSelectedId(null); setMacroDraft(null); setMacroBase(null); setIsPendingNew(false)
    } else {
      const orig = macros.find(r => r.id === selectedId)
      if (orig) { setMacroDraft({ ...orig }); setMacroBase({ ...orig }) }
    }
  }

  function deleteMacro() {
    if (!selectedId) return
    deleteMacroById(selectedId)
  }

  function deleteMacroById(id: string) {
    const updated = macros.filter(r => r.id !== id)
    setMacros(updated)
    saveMacros(character, updated)
    onSaved?.()
    if (selectedId === id) {
      setSelectedId(null); setMacroDraft(null); setMacroBase(null)
      setIsPendingNew(false)
    }
  }

  function toggleMacro(id: string) {
    const updated = macros.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setMacros(updated)
    saveMacros(character, updated)
    onSaved?.()
    // Saved immediately, so the baseline moves too — not an unsaved edit.
    if (macroDraft?.id === id) {
      setMacroDraft(p => p ? { ...p, enabled: !p.enabled } : p)
      setMacroBase(p => p ? { ...p, enabled: !p.enabled } : p)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const body = (
        <div className="ma-body">

          {/* ── ALIASES TAB ─────────────────────────────────────────────────── */}
          {tab === 'aliases' && (
            <>
              <div className="ma-sidebar">
                <button type="button" className="ma-new-btn" onClick={() => confirmDiscard(aliasDirty, createAlias)}>+ New alias</button>
                <div className="sidebar-search">
                  <input
                    className="sidebar-search-input"
                    placeholder="Search…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && <button className="sidebar-search-clear" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search">✕</button>}
                  {search && (
                    <span className="sidebar-search-count">
                      {aliases.filter(r => (r.name + ' ' + r.input + ' ' + r.commands.join(' ')).toLowerCase().includes(search.toLowerCase())).length}/{aliases.length}
                    </span>
                  )}
                </div>
                <div className="ma-list" role="listbox" aria-label="Aliases" onKeyDown={ruleListKeyDown}>
                  {aliases.length === 0 && !isPendingNew && (
                    <div className="ma-empty">
                      Speed up your adventure.<br />
                      Create shortcuts for commands you use every day.
                    </div>
                  )}
                  {(search ? aliases.filter(r => (r.name + ' ' + r.input + ' ' + r.commands.join(' ')).toLowerCase().includes(search.toLowerCase())) : aliases).map(r => {
                    const label = r.name || r.input
                    return (
                    <div
                      key={r.id}
                      className={`ma-list-item${selectedId === r.id ? ' ma-list-item--active' : ''}${!r.enabled ? ' ma-list-item--disabled' : ''}`}
                      {...pressable(() => requestSelectAlias(r), { role: 'option', selected: selectedId === r.id })}
                    >
                      <button
                        type="button"
                        className={`ma-toggle${r.enabled ? ' ma-toggle--on' : ''}`}
                        title={r.enabled ? 'Disable' : 'Enable'}
                        aria-label={r.enabled ? 'Disable' : 'Enable'}
                        onClick={e => { e.stopPropagation(); toggleAlias(r.id) }}
                      />
                      {/* B396: the full label, since the row truncates it. */}
                      <span className="ma-list-label" title={label || undefined}>{label || <em className="ma-unnamed">Unnamed</em>}</span>
                      {anAlias.on ? <RuleBadges ruleId={r.id} report={anAlias.report} stats={anAlias.stats} /> : <span className="ma-list-arrow">→</span>}
                      {/* B370: a row ✕ deletes something that isn't open, so it asks. */}
                      <button
                        type="button"
                        className="list-item-delete"
                        title="Delete"
                        aria-label={`Delete ${label || 'alias'}`}
                        onClick={async e => { e.stopPropagation(); if (await confirmDelete('alias', label)) deleteAliasById(r.id) }}
                      >✕</button>
                    </div>
                    )
                  })}
                  {isPendingNew && aliasDraft && (
                    <div className="ma-list-item ma-list-item--active ma-list-item--pending">
                      <span className="ma-toggle ma-toggle--on" />
                      <span className="ma-list-label"><em>New alias…</em></span>
                      <span className="ma-list-arrow">→</span>
                    </div>
                  )}
                </div>
              </div>

              <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
              <div className="ma-detail">
                {!aliasDraft ? (
                  <div className="ma-no-selection">Select an alias or create a new one.</div>
                ) : (
                  // B389: Enter in a single-line field saves.
                  <div className="ma-form" onKeyDown={enterToSave(saveAlias)}>

                    <div className="ma-section">
                      <label className="ma-section-label">Label</label>
                      <input
                        ref={nameInputRef}
                        className="ma-input"
                        value={aliasDraft.name}
                        onChange={e => setAliasDraft({ ...aliasDraft, name: e.target.value })}
                        placeholder="e.g. Quick hunt (optional)"
                      />
                    </div>

                    {!hideGroups && (
                    <div className="ma-section">
                      <label className="ma-section-label">Groups</label>
                      <div className="grp-row">
                        <button
                          type="button"
                          className={`grp-all-btn${aliasDraft.allGroups ? ' grp-all-btn--on' : ''}`}
                          onClick={() => setAliasDraft({ ...aliasDraft, allGroups: !aliasDraft.allGroups, groupIds: [] })}
                        >All groups</button>
                        {!aliasDraft.allGroups && (
                          <GroupPicker
                            groupIds={aliasDraft.groupIds ?? []}
                            onChange={groupIds => setAliasDraft({ ...aliasDraft, groupIds })}
                          />
                        )}
                      </div>
                    </div>
                    )}

                    {/* F63: per-rule scope — the inactive side MOVES the alias
                        to the other store (incl. any unsaved draft edits). */}
                    {onMoveScope && (
                    <div className="ma-section">
                      <label className="ma-section-label">Applies to</label>
                      <div className="rule-scope-row">
                        <button
                          type="button"
                          className={`rule-scope-btn${scope === 'character' ? ' rule-scope-btn--on' : ''}`}
                          disabled={scope === 'character' || !!aliasSaveBlock}
                          onClick={() => onMoveScope('aliases', finalizedAlias(aliasDraft))}
                          title={scope === 'character'
                            ? 'This alias belongs to this character'
                            : aliasSaveBlock ? `${aliasSaveBlock}, then you can move it`
                            : 'Move this alias to the character you have open — every OTHER character stops getting it'}
                        >This character</button>
                        <button
                          type="button"
                          className={`rule-scope-btn${scope === 'global' ? ' rule-scope-btn--on' : ''}`}
                          disabled={scope === 'global' || !!aliasSaveBlock}
                          onClick={() => onMoveScope('aliases', finalizedAlias(aliasDraft))}
                          title={scope === 'global'
                            ? 'This alias applies to every character'
                            : aliasSaveBlock ? `${aliasSaveBlock}, then you can move it`
                            : 'Move this alias to All characters — it will work for every character on every account'}
                        >All characters</button>
                      </div>
                    </div>
                    )}

                    <div className="ma-section">
                      <label className="ma-section-label">When I type</label>
                      <div className="ma-input-row">
                        <input
                          className="ma-input ma-input--flex ma-input--code"
                          value={aliasDraft.input}
                          onChange={e => setAliasDraft({ ...aliasDraft, input: e.target.value })}
                          placeholder="e.g. hunt"
                          spellCheck={false}
                        />
                        <button
                          className={`ma-case-btn${aliasDraft.caseSensitive ? ' ma-case-btn--active' : ''}`}
                          type="button"
                          title={aliasDraft.caseSensitive ? 'Case-sensitive — click to ignore case' : 'Case-insensitive — click to match exact case'}
                          onClick={() => setAliasDraft({ ...aliasDraft, caseSensitive: !aliasDraft.caseSensitive })}
                        >
                          Aa
                        </button>
                      </div>
                      <span className="ma-hint">
                        Matches the first word(s). Use $1, $2, $rest to capture what follows.
                      </span>
                    </div>

                    <div className="ma-section ma-section--grow">
                      <label className="ma-section-label">Send these commands</label>
                      <CommandList
                        commands={aliasDraft.commands}
                        onChange={commands => setAliasDraft({ ...aliasDraft, commands })}
                        vars={ALIAS_VARS}
                      />
                    </div>

                    <div className="ma-section">
                      <label className="ma-section-label">Settings</label>
                      <div className="ma-settings-row">
                        <div className="ma-delay-row">
                          <span className="ma-settings-label">Delay between commands</span>
                          <input
                            className="ma-input ma-delay-input"
                            type="number"
                            min={0}
                            max={30000}
                            value={aliasDraft.delayMs}
                            onChange={e => setAliasDraft({ ...aliasDraft, delayMs: Math.max(0, parseInt(e.target.value) || 0) })}
                          />
                          <span className="ma-delay-unit">ms</span>
                        </div>
                        <label className="ma-checkbox-row">
                          <input
                            type="checkbox"
                            className="ma-checkbox"
                            checked={aliasDraft.passThrough}
                            onChange={e => setAliasDraft({ ...aliasDraft, passThrough: e.target.checked })}
                          />
                          <span>Also send my original input (pass-through)</span>
                        </label>
                      </div>
                    </div>

                    {/* Footer rail: [Delete] …spacer… [Revert/Cancel] [Save]. */}
                    <div className="ma-actions">
                      {!isPendingNew && (
                        <InlineConfirm question="Delete this alias?" onConfirm={deleteAlias} resetKey={selectedId} />
                      )}
                      <span className="ui-modal-foot-spacer" />
                      <button
                        type="button"
                        className="ui-btn"
                        onClick={revertAlias}
                        disabled={!isPendingNew && !aliasDirty}
                        title={!isPendingNew && !aliasDirty ? 'No changes to revert' : undefined}
                      >
                        {isPendingNew ? 'Cancel' : 'Revert'}
                      </button>
                      <button type="button" className="ui-btn ui-btn--primary" onClick={saveAlias} disabled={!!aliasSaveBlock} title={aliasSaveBlock ?? undefined}>
                        Save
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </>
          )}

          {/* ── MACROS TAB ──────────────────────────────────────────────────── */}
          {tab === 'macros' && (
            <>
              <div className="ma-sidebar">
                <button type="button" className="ma-new-btn" onClick={() => confirmDiscard(macroDirty, createMacro)}>+ New macro</button>
                <div className="sidebar-search">
                  <input
                    className="sidebar-search-input"
                    placeholder="Search…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && <button className="sidebar-search-clear" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search">✕</button>}
                  {search && (
                    <span className="sidebar-search-count">
                      {macros.filter(r => (r.name + ' ' + r.key + ' ' + r.commands.join(' ')).toLowerCase().includes(search.toLowerCase())).length}/{macros.length}
                    </span>
                  )}
                </div>
                <div className="ma-list" role="listbox" aria-label="Macros" onKeyDown={ruleListKeyDown}>
                  {macros.length === 0 && !isPendingNew && (
                    <div className="ma-empty">
                      Bind your most-used commands<br />
                      to a single keypress.
                    </div>
                  )}
                  {(search ? macros.filter(r => (r.name + ' ' + r.key + ' ' + r.commands.join(' ')).toLowerCase().includes(search.toLowerCase())) : macros).map(r => {
                    const label = r.name || r.commands[0]
                    return (
                    <div
                      key={r.id}
                      className={`ma-list-item${selectedId === r.id ? ' ma-list-item--active' : ''}${!r.enabled ? ' ma-list-item--disabled' : ''}`}
                      {...pressable(() => requestSelectMacro(r), { role: 'option', selected: selectedId === r.id })}
                    >
                      <button
                        type="button"
                        className={`ma-toggle${r.enabled ? ' ma-toggle--on' : ''}`}
                        title={r.enabled ? 'Disable' : 'Enable'}
                        aria-label={r.enabled ? 'Disable' : 'Enable'}
                        onClick={e => { e.stopPropagation(); toggleMacro(r.id) }}
                      />
                      {r.key
                        ? <span className="ma-key-badge">{r.key}</span>
                        : <span className="ma-key-badge ma-key-badge--unset" title="No key recorded">—</span>
                      }
                      {/* B396: the full label, since the row truncates it. */}
                      <span className="ma-list-label" title={label || undefined}>{label || <em className="ma-unnamed">Unnamed</em>}</span>
                      {anMacro.on && <RuleBadges ruleId={r.id} report={anMacro.report} stats={anMacro.stats} />}
                      {/* B370: a row ✕ deletes something that isn't open, so it asks. */}
                      <button
                        type="button"
                        className="list-item-delete"
                        title="Delete"
                        aria-label={`Delete ${label || r.key || 'macro'}`}
                        onClick={async e => { e.stopPropagation(); if (await confirmDelete('macro', label || r.key)) deleteMacroById(r.id) }}
                      >✕</button>
                    </div>
                    )
                  })}
                  {isPendingNew && macroDraft && (
                    <div className="ma-list-item ma-list-item--active ma-list-item--pending">
                      <span className="ma-toggle ma-toggle--on" />
                      <span className="ma-key-badge ma-key-badge--unset">—</span>
                      <span className="ma-list-label"><em>New macro…</em></span>
                    </div>
                  )}
                </div>
              </div>

              <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
              <div className="ma-detail">
                {!macroDraft ? (
                  <div className="ma-no-selection">Select a macro or create a new one.</div>
                ) : (
                  // B389: Enter in a single-line field saves. The key recorder
                  // is untouched — it captures keys at the window while recording.
                  <div className="ma-form" onKeyDown={enterToSave(saveMacro)}>

                    <div className="ma-section">
                      <label className="ma-section-label">Label</label>
                      <input
                        ref={nameInputRef}
                        className="ma-input"
                        value={macroDraft.name}
                        onChange={e => setMacroDraft({ ...macroDraft, name: e.target.value })}
                        placeholder="e.g. Attack macro (optional)"
                      />
                    </div>

                    {!hideGroups && (
                    <div className="ma-section">
                      <label className="ma-section-label">Groups</label>
                      <div className="grp-row">
                        <button
                          type="button"
                          className={`grp-all-btn${macroDraft.allGroups ? ' grp-all-btn--on' : ''}`}
                          onClick={() => setMacroDraft({ ...macroDraft, allGroups: !macroDraft.allGroups, groupIds: [] })}
                        >All groups</button>
                        {!macroDraft.allGroups && (
                          <GroupPicker
                            groupIds={macroDraft.groupIds ?? []}
                            onChange={groupIds => setMacroDraft({ ...macroDraft, groupIds })}
                          />
                        )}
                      </div>
                    </div>
                    )}

                    {/* F63: per-rule scope — the inactive side MOVES the macro
                        to the other store (incl. any unsaved draft edits). */}
                    {onMoveScope && (
                    <div className="ma-section">
                      <label className="ma-section-label">Applies to</label>
                      <div className="rule-scope-row">
                        <button
                          type="button"
                          className={`rule-scope-btn${scope === 'character' ? ' rule-scope-btn--on' : ''}`}
                          disabled={scope === 'character' || !!macroSaveBlock}
                          onClick={() => onMoveScope('macros', finalizedMacro(macroDraft))}
                          title={scope === 'character'
                            ? 'This macro belongs to this character'
                            : macroSaveBlock ? `${macroSaveBlock}, then you can move it`
                            : 'Move this macro to the character you have open — every OTHER character stops getting it'}
                        >This character</button>
                        <button
                          type="button"
                          className={`rule-scope-btn${scope === 'global' ? ' rule-scope-btn--on' : ''}`}
                          disabled={scope === 'global' || !!macroSaveBlock}
                          onClick={() => onMoveScope('macros', finalizedMacro(macroDraft))}
                          title={scope === 'global'
                            ? 'This macro applies to every character'
                            : macroSaveBlock ? `${macroSaveBlock}, then you can move it`
                            : 'Move this macro to All characters — its key will work for every character on every account'}
                        >All characters</button>
                      </div>
                    </div>
                    )}

                    <div className="ma-section">
                      <label className="ma-section-label">Key binding</label>
                      <KeyBindingField
                        value={macroDraft.key}
                        onChange={key => setMacroDraft({ ...macroDraft, key })}
                      />
                      <span className="ma-hint">
                        Click Record, then press any key combination. Macros fire globally — even while typing.
                      </span>
                    </div>

                    <div className="ma-section ma-section--grow">
                      <label className="ma-section-label">Send these commands</label>
                      <CommandList
                        commands={macroDraft.commands}
                        onChange={commands => setMacroDraft({ ...macroDraft, commands })}
                        vars={MACRO_VARS}
                        tokens={MACRO_TOKENS}
                      />
                    </div>

                    <div className="ma-section">
                      <label className="ma-section-label">Settings</label>
                      <div className="ma-delay-row">
                        <span className="ma-settings-label">Delay between commands</span>
                        <input
                          className="ma-input ma-delay-input"
                          type="number"
                          min={0}
                          max={30000}
                          value={macroDraft.delayMs}
                          onChange={e => setMacroDraft({ ...macroDraft, delayMs: Math.max(0, parseInt(e.target.value) || 0) })}
                        />
                        <span className="ma-delay-unit">ms</span>
                      </div>
                    </div>

                    {/* Footer rail: [Delete] …spacer… [Revert/Cancel] [Save]. */}
                    <div className="ma-actions">
                      {!isPendingNew && (
                        <InlineConfirm question="Delete this macro?" onConfirm={deleteMacro} resetKey={selectedId} />
                      )}
                      <span className="ui-modal-foot-spacer" />
                      <button
                        type="button"
                        className="ui-btn"
                        onClick={revertMacro}
                        disabled={!isPendingNew && !macroDirty}
                        title={!isPendingNew && !macroDirty ? 'No changes to revert' : undefined}
                      >
                        {isPendingNew ? 'Cancel' : 'Revert'}
                      </button>
                      <button type="button" className="ui-btn ui-btn--primary" onClick={saveMacro} disabled={!!macroSaveBlock} title={macroSaveBlock ?? undefined}>
                        Save
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </>
          )}

        </div>
  )

  // Analytics banner for the ACTIVE tab (aliases vs key-bindings). A bulk
  // remove drops the open editor only if its rule was among those removed.
  const review = tab === 'aliases'
    ? (anAlias.on && <AnalyticsReview rules={aliases} report={anAlias.report} stats={anAlias.stats}
        nameOf={r => r.name || r.input}
        onJump={id => { const r = aliases.find(x => x.id === id); if (r) requestSelectAlias(r) }}
        onReset={anAlias.reset}
        onBulkRemove={ids => {
          const s = new Set(ids); const u = aliases.filter(r => !s.has(r.id))
          setAliases(u); saveAliases(character, u)
          if (selectedId && s.has(selectedId)) { setSelectedId(null); setAliasDraft(null); setAliasBase(null); setIsPendingNew(false) }
          onSaved?.()
        }} />)
    : (anMacro.on && <AnalyticsReview rules={macros} report={anMacro.report} stats={anMacro.stats}
        nameOf={r => r.name || r.key}
        onJump={id => { const r = macros.find(x => x.id === id); if (r) requestSelectMacro(r) }}
        onReset={anMacro.reset}
        onBulkRemove={ids => {
          const s = new Set(ids); const u = macros.filter(r => !s.has(r.id))
          setMacros(u); saveMacros(character, u)
          if (selectedId && s.has(selectedId)) { setSelectedId(null); setMacroDraft(null); setMacroBase(null); setIsPendingNew(false) }
          onSaved?.()
        }} />)
  return review ? <div className="aa-host">{review}{body}</div> : body
}
