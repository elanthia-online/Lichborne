// Triggers editor — the WHEN → THEN → TEST form that edits the `triggers`
// rule store. WHEN: fires on Game Text (a text / phrase / regex pattern on a
// chosen watch stream) or on a Variable Change (`watchVariable`), with a
// cooldown, one-shot, and AND/OR state-gate conditions. THEN: an ordered
// list of action cards (command · echo · notify · sound · flash · beep · log
// · webhook · variable), each with `$var` pickers from `INTERPOLATABLE_VARS`.
// TEST: a sample line + stream run through the REAL `buildTriggerRegex` and
// `interpolate` (with placeholder vars) to show what would fire.
//
// Hosted inline by AutomationsPanel, its only caller (the never-rendered
// standalone modal branch was removed in v0.19.7, B408). Unsaved edits are
// tracked against `baseline` and guarded the HighlightsPanel way (B368).
// Per character via `useCharacter()` — in the Automations
// "All Characters" scope that provider is re-pointed at the virtual `_global`
// store, so `loadTriggers`/`saveTriggers` edit global rules unchanged
// (`scope='global'` hides Groups; `onMoveScope` renders the F63 "Applies to"
// control, which MOVES the draft). Every write is `setRules` →
// `saveTriggers` (localStorage) → `onSaved` (the host's scheduled profile
// save → YAML); the list loads ONCE on mount. Entry points: `prefillPattern`
// (right-click "Trigger …" → `newTrigger(pattern)` as an unsaved draft) and
// `openRuleId` (v0.8.2, the Debug Fires-tab GOTO — the pattern the other rule
// panels later copied; a no-op if the rule was deleted). The action editing
// here is the FULL editor; slash `/trigger` only fills the built-in command
// action. Classes are `.trg-*`. Analytics is opt-in via `analyticsOn`.

import { Fragment, useEffect, useRef, useState } from 'react'
import { pressable } from '../utils/pressable'
import { ResizeDivider } from './ResizeDivider'
import InlineConfirm from './InlineConfirm'
import { confirmDelete, confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import {
  type TriggerRule, type TriggerAction, type StateGate, type ActionType,
  type GateVariable, type GateOperator,
  loadTriggers, saveTriggers, newTrigger, newTriggerAction, newGate,
  buildTriggerRegex, isValidTriggerRegex,
  interpolate,
  GATE_VARIABLES, NUMERIC_OPERATORS, STRING_OPERATORS,
  INTERPOLATABLE_VARS, WATCH_STREAM_OPTIONS,
} from '../triggers'
import { playWavFile } from '../hooks/useTriggerEngine'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { useRuleAnalytics, AnalyticsReview, RuleBadges, ruleListKeyDown, enterToSave } from './AutomationAnalytics'
import { analyzeTriggers } from '../automationHealth'
import GroupPicker from './GroupPicker'
import '../styles/triggers.css'
import { normalizeColorInput, COLOR_INPUT_TITLE } from '../colors'
import { IS_MAC } from '../lichSettings'
import '../styles/groups.css'

const ACTION_LABELS: Record<ActionType, string> = {
  command:  '⌨ Command',
  echo:     '📢 Echo',
  notify:   '🔔 Notify',
  sound:    '🔊 Sound',
  webhook:  '🔗 Webhook',
  variable: '📋 Variable',
  flash:    '⚡ Flash',
  beep:     '🔔 Beep',
  log:      '📄 Log',
}

const ACTION_TYPES: ActionType[] = ['command', 'echo', 'notify', 'sound', 'flash', 'beep', 'log', 'webhook', 'variable']

// B379: why a draft can't be saved, or null. A text trigger with no pattern
// used to save (buildTriggerRegex returns null for it, so it never fired); a
// variable trigger needs the variable it watches instead of a pattern.
function triggerSaveBlock(d: TriggerRule | null): string | null {
  if (!d) return 'Select a trigger to save'
  if ((d.triggerType ?? 'text') === 'text') {
    if (!d.pattern.trim()) return 'Enter a pattern to save'
    if (d.mode === 'regex' && !isValidTriggerRegex(d.pattern)) return 'Fix the regular expression to save'
  } else if (!d.watchVariable?.trim()) {
    return 'Enter the variable to watch'
  }
  if (d.actions.every(a => a.type === 'command' && !a.command?.trim())) return 'Enter a command, or add another action'
  return null
}

interface Props {
  onSaved?: () => void
  prefillPattern?: string
  openRuleId?: string // v0.8.2: open an existing trigger for edit (Fires GOTO)
  analyticsOn?: boolean
  // F37/F63 (v0.15.2): which store this panel edits ('global' = All Characters
  // scope — groups row hidden) + the cross-store MOVE callback for the
  // editor's "Applies to" control (only rendered when a callback is given).
  scope?: 'character' | 'global'
  onMoveScope?: (rule: TriggerRule) => void
}

// ── VarPicker ─────────────────────────────────────────────────────────────────

interface VarPickerProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  value: string
  onChange: (v: string) => void
}

function VarPicker({ inputRef, value, onChange }: VarPickerProps) {
  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const varName = e.target.value
    if (!varName) return
    const el = inputRef.current
    const pos = el ? (el.selectionStart ?? value.length) : value.length
    const next = value.slice(0, pos) + `$${varName}` + value.slice(pos)
    onChange(next)
    e.target.value = ''
    setTimeout(() => {
      el?.focus()
      const newPos = pos + varName.length + 1
      el?.setSelectionRange(newPos, newPos)
    }, 0)
  }

  return (
    <select className="trg-var-select" defaultValue="" onChange={handleSelect}>
      <option value="" disabled>$var</option>
      {INTERPOLATABLE_VARS.map(v => (
        <option key={v.name} value={v.name}>${v.name} — {v.desc}</option>
      ))}
    </select>
  )
}

// ── Inline input + var-picker row ────────────────────────────────────────────

interface VarInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function VarInputRow({ label, value, onChange, placeholder }: VarInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="trg-action-row">
      <label className="trg-label">{label}</label>
      <input
        ref={inputRef}
        className="trg-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <VarPicker inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLTextAreaElement>} value={value} onChange={onChange} />
    </div>
  )
}

// ── Single action card ────────────────────────────────────────────────────────

interface ActionCardProps {
  action: TriggerAction
  canRemove: boolean
  onChange: (updated: TriggerAction) => void
  onRemove: () => void
}

function ActionCard({ action, canRemove, onChange, onRemove }: ActionCardProps) {
  const actionRef = useRef(action)
  actionRef.current = action
  const up = (patch: Partial<TriggerAction>) => onChange({ ...action, ...patch })

  return (
    <div className="trg-action-card">
      <div className="trg-action-header">
        <select
          className="trg-action-type-select"
          value={action.type}
          onChange={e => up({ type: e.target.value as ActionType })}
        >
          {ACTION_TYPES.map(t => (
            <option key={t} value={t}>{ACTION_LABELS[t]}</option>
          ))}
        </select>
        {canRemove && (
          <button type="button" className="trg-action-remove" onClick={onRemove} title="Remove action" aria-label="Remove action">×</button>
        )}
      </div>

      <div className="trg-action-fields">
        {action.type === 'command' && (
          <>
            <VarInputRow
              label="Command"
              value={action.command ?? ''}
              onChange={v => up({ command: v })}
              placeholder="e.g. get herb"
            />
            <div className="trg-action-row">
              <label className="trg-label">Delay</label>
              <input
                className="trg-input trg-cooldown-input"
                type="number"
                min={0}
                max={30000}
                value={action.delayMs ?? 0}
                onChange={e => up({ delayMs: Math.max(0, parseInt(e.target.value) || 0) })}
              />
              <span className="trg-delay-unit">ms</span>
            </div>
          </>
        )}

        {action.type === 'echo' && (
          <>
            <VarInputRow
              label="Message"
              value={action.echoMessage ?? ''}
              onChange={v => up({ echoMessage: v })}
              placeholder="Message to echo…"
            />
            <div className="trg-action-row">
              <label className="trg-label">Stream</label>
              <input
                className="trg-input"
                value={action.echoStream ?? 'log'}
                onChange={e => up({ echoStream: e.target.value })}
                placeholder="log"
              />
            </div>
            <div className="trg-action-row">
              <label className="trg-label">Color</label>
              <input
                type="color"
                className="trg-color-swatch"
                value={action.echoColor && action.echoColor.startsWith('#') ? action.echoColor : '#c8c8c8'}
                onChange={e => up({ echoColor: e.target.value })}
              />
              <input
                className="trg-input trg-input--hex"
                value={action.echoColor ?? ''}
                title={COLOR_INPUT_TITLE}
                onChange={e => up({ echoColor: e.target.value })}
                onBlur={e => { const v = normalizeColorInput(e.target.value); if (v !== e.target.value) up({ echoColor: v }) }}
                placeholder="(default color)"
              />
            </div>
          </>
        )}
        {action.type === 'flash' && (
          <div className="trg-action-note">Flashes the application in the OS taskbar to draw attention.</div>
        )}
        {action.type === 'beep' && (
          <div className="trg-action-note">Plays a short system beep sound.</div>
        )}
        {action.type === 'log' && (
          <>
            <div className="trg-action-row">
              <label className="trg-label">File</label>
              <input
                className="trg-input"
                value={action.logFile ?? ''}
                onChange={e => up({ logFile: e.target.value })}
                placeholder="e.g. Ranklog-$characterName.txt"
              />
            </div>
            <VarInputRow
              label="Message"
              value={action.logMessage ?? ''}
              onChange={v => up({ logMessage: v })}
              placeholder="Text to append to the file…"
            />
            {/* B352: say where the file lands (main writes it under userData). */}
            <div className="trg-action-note">
              Saved in the TriggerLogs folder inside Lichborne's data folder.
            </div>
          </>
        )}

        {action.type === 'notify' && (
          <>
            <VarInputRow
              label="Title"
              value={action.notifyTitle ?? 'Lichborne'}
              onChange={v => up({ notifyTitle: v })}
              placeholder="Notification title"
            />
            <VarInputRow
              label="Body"
              value={action.notifyBody ?? ''}
              onChange={v => up({ notifyBody: v })}
              placeholder="$line"
            />
            {IS_MAC && (
              // B359: mirrors the Dock bounce useTriggerEngine adds on macOS.
              <div className="trg-action-note">
                On macOS this also bounces the Dock icon, in case the notification doesn't appear.
              </div>
            )}
          </>
        )}

        {action.type === 'sound' && (
          <>
            <div className="trg-action-row">
              <label className="trg-label">Preset</label>
              <div className="trg-sound-pills">
                {(['chime', 'alert', 'alarm', 'ping'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`trg-sound-pill${!action.soundFile && (action.soundPreset ?? 'chime') === s ? ' trg-sound-pill--active' : ''}${action.soundFile ? ' trg-sound-pill--dim' : ''}`}
                    onClick={() => up({ soundPreset: s, soundFile: undefined })}
                    title={action.soundFile ? 'Clear WAV file to use a preset' : undefined}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="trg-action-row">
              <label className="trg-label">WAV file</label>
              <div className="trg-sound-file-row">
                <input
                  className="trg-input trg-input--sound"
                  value={action.soundFile ?? ''}
                  onChange={e => up({ soundFile: e.target.value || undefined })}
                  placeholder="Optional — overrides preset"
                />
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={async () => {
                    const file = await window.api.browseFile([{ name: 'Sound Files', extensions: ['wav', 'mp3', 'ogg'] }])
                    if (file) onChange({ ...actionRef.current, soundFile: file })
                  }}
                >Browse…</button>
                {action.soundFile && (
                  <>
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm"
                      title="Test sound"
                      aria-label="Test sound"
                      onClick={() => playWavFile(action.soundFile!)}
                    >▶</button>
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm ui-btn--ghost"
                      title="Clear WAV file"
                      aria-label="Clear WAV file"
                      onClick={() => up({ soundFile: undefined })}
                    >✕</button>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {action.type === 'webhook' && (
          <>
            <div className="trg-action-row">
              <label className="trg-label">URL</label>
              <input
                className="trg-input"
                value={action.webhookUrl ?? ''}
                onChange={e => up({ webhookUrl: e.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
              />
            </div>
            <VarInputRow
              label="Message"
              value={action.webhookMessage ?? ''}
              onChange={v => up({ webhookMessage: v })}
              placeholder="$line"
            />
          </>
        )}

        {action.type === 'variable' && (
          <>
            <div className="trg-action-row">
              <label className="trg-label">Name</label>
              <input
                className="trg-input"
                value={action.varName ?? ''}
                onChange={e => up({ varName: e.target.value.replace(/\W/g, '') })}
                placeholder="myVar"
              />
            </div>
            <VarInputRow
              label="Value"
              value={action.varValue ?? ''}
              onChange={v => up({ varValue: v })}
              placeholder="value or $match"
            />
          </>
        )}
      </div>
    </div>
  )
}

// ── Gate row ─────────────────────────────────────────────────────────────────

interface GateRowProps {
  gate: StateGate
  onChange: (g: StateGate) => void
  onRemove: () => void
}

function GateRow({ gate, onChange, onRemove }: GateRowProps) {
  const varDef = GATE_VARIABLES.find(v => v.value === gate.variable)
  const ops = varDef?.numeric ? NUMERIC_OPERATORS : STRING_OPERATORS

  return (
    <div className="trg-gate-row">
      <select
        className="trg-select"
        value={gate.variable}
        onChange={e => {
          const newVar = e.target.value as GateVariable
          const newVarDef = GATE_VARIABLES.find(v => v.value === newVar)
          const defaultOp: GateOperator = newVarDef?.numeric ? '<' : '='
          onChange({ ...gate, variable: newVar, operator: defaultOp })
        }}
      >
        {GATE_VARIABLES.map(v => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
      </select>
      <select
        className="trg-select trg-gate-select--op"
        value={gate.operator}
        onChange={e => onChange({ ...gate, operator: e.target.value as GateOperator })}
      >
        {ops.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      <input
        className="trg-input trg-gate-value"
        value={gate.value}
        onChange={e => onChange({ ...gate, value: e.target.value })}
        placeholder={varDef?.numeric ? '50' : 'value'}
      />
      <button type="button" className="trg-gate-remove" onClick={onRemove} title="Remove condition" aria-label="Remove condition">×</button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function TriggersPanel({ onSaved, prefillPattern, openRuleId, analyticsOn = false, scope = 'character', onMoveScope }: Props) {
  const hideGroups = scope === 'global'
  const character = useCharacter()
  const [rules, setRules]       = useState<TriggerRule[]>(() => loadTriggers(character))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const an = useRuleAnalytics(character, rules, analyzeTriggers, analyticsOn, onSaved)
  const [draft, setDraft]       = useState<TriggerRule | null>(null)
  // B368: what the draft is compared against (stored / fresh / just saved).
  const [baseline, setBaseline] = useState<TriggerRule | null>(null)
  const [isPendingNew, setIsPendingNew] = useState(false)
  const [search, setSearch]     = useState('')
  const [testInput, setTestInput] = useState('')
  const [testStream, setTestStream] = useState('main')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const appliedOpenRef = useRef<string | undefined>(undefined)

  const dirty = !!draft && !!baseline && differs(draft, baseline)
  useReportUnsaved(dirty)

  useEffect(() => {
    if (!prefillPattern) return
    confirmDiscard(dirty, () => {
      const r = newTrigger(prefillPattern)
      setDraft({ ...r })
      setBaseline({ ...r })
      setSelectedId(r.id)
      setIsPendingNew(true)
      setTimeout(() => nameInputRef.current?.focus(), 0)
    })
  }, [prefillPattern]) // eslint-disable-line react-hooks/exhaustive-deps

  // v0.8.2: open EXISTING trigger by id (Fires GOTO). Re-runs when openRuleId
  // changes so clicking → on a different fire entry switches the editor's
  // draft. Looks up against the current rules list — if the rule was deleted
  // since the fire was logged, this is a no-op (the user just sees the
  // empty editor pane, no crash). Applied ONCE per id: it also re-ran on every
  // `rules` change, so saving another trigger snapped the editor back here.
  useEffect(() => {
    // Reset when the request clears, so a second Fires → Edit on the SAME
    // trigger (after something else opened the editor) opens it again.
    if (!openRuleId) { appliedOpenRef.current = undefined; return }
    if (appliedOpenRef.current === openRuleId) return
    const r = rules.find(x => x.id === openRuleId)
    if (!r) return
    appliedOpenRef.current = openRuleId
    confirmDiscard(dirty, () => {
      setDraft({ ...r })
      setBaseline({ ...r })
      setSelectedId(r.id)
      setIsPendingNew(false)
    })
  }, [openRuleId, rules]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Test result ──────────────────────────────────────────────────────────

  function computeTest(): { match: boolean; matchText: string; actionSummary: string } {
    if (!draft || !testInput.trim()) return { match: false, matchText: '', actionSummary: '' }
    const regex = buildTriggerRegex(draft)
    if (!regex) return { match: false, matchText: '', actionSummary: '' }

    if (draft.watchStream !== 'any' && draft.watchStream !== testStream) {
      return { match: false, matchText: '', actionSummary: 'Stream filter: no match' }
    }

    regex.lastIndex = 0
    const m = regex.exec(testInput)
    if (!m) return { match: false, matchText: '', actionSummary: '' }

    const now = new Date()
    const sampleVars = {
      match: m[0], '0': m[0], '1': m[1] ?? '', '2': m[2] ?? '', '3': m[3] ?? '',
      line: testInput,
      characterName: 'Adventurer',
      date: now.toLocaleDateString(), time: now.toLocaleTimeString(),
      health: '100', mana: '100', stamina: '100', spirit: '100', concentration: '100',
      rt: '0', stance: 'standing', spell: 'None',
      left: 'Empty', right: 'Empty',
      room: 'Test Room',
    }
    const summary = draft.actions.map(a => {
      switch (a.type) {
        case 'command':  return `Command: "${interpolate(a.command ?? '', sampleVars)}"`
        case 'echo':     return `Echo → ${a.echoStream ?? 'log'}${a.echoColor ? ` [${a.echoColor}]` : ''}: "${interpolate(a.echoMessage ?? '', sampleVars)}"`
        case 'notify':   return `Notify: "${interpolate(a.notifyTitle ?? 'Lichborne', sampleVars)}"`
        case 'sound':    return a.soundFile ? `Sound: ${a.soundFile.split(/[\\/]/).pop()}` : `Sound: ${a.soundPreset ?? 'chime'}`
        case 'flash':    return 'Flash window'
        case 'beep':     return 'Beep'
        case 'log':      return `Log → ${interpolate(a.logFile ?? '', sampleVars)}: "${interpolate(a.logMessage ?? '', sampleVars)}"`
        case 'webhook':  return `Webhook → ${a.webhookUrl ? a.webhookUrl.slice(0, 30) + '…' : '(no url)'}`
        case 'variable': return `Set $${a.varName ?? '?'} = "${interpolate(a.varValue ?? '', sampleVars)}"`
        default:         return a.type
      }
    }).join('\n')

    return { match: true, matchText: m[0], actionSummary: summary }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function selectRule(r: TriggerRule) {
    setSelectedId(r.id)
    setDraft({ ...r })
    setBaseline({ ...r })
    setIsPendingNew(false)
    setTestInput('')
  }

  // B368: the user-facing switches — they ask before an unsaved draft is lost.
  function requestSelect(r: TriggerRule) {
    if (r.id === selectedId) return
    confirmDiscard(dirty, () => selectRule(r))
  }

  function createNew() {
    const r = newTrigger()
    setDraft({ ...r })
    setBaseline({ ...r })
    setSelectedId(r.id)
    setIsPendingNew(true)
    setTestInput('')
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  const saveBlock = triggerSaveBlock(draft)

  function saveDraft() {
    if (!draft || saveBlock) return
    const trimmed = { ...draft, pattern: draft.pattern.trim() }
    if (!trimmed.name) trimmed.name = trimmed.pattern || trimmed.watchVariable?.trim() || 'Unnamed trigger'
    let updated: TriggerRule[]
    if (isPendingNew) {
      updated = [...rules, trimmed]
    } else {
      updated = rules.map(r => r.id === trimmed.id ? trimmed : r)
    }
    setRules(updated)
    saveTriggers(character, updated)
    onSaved?.()
    setDraft(trimmed)
    setBaseline(trimmed)
    setIsPendingNew(false)
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
    saveTriggers(character, updated)
    onSaved?.()
    if (selectedId === id) {
      setSelectedId(null)
      setDraft(null)
      setBaseline(null)
      setIsPendingNew(false)
    }
  }

  function toggleEnabled(id: string) {
    const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
    setRules(updated)
    saveTriggers(character, updated)
    onSaved?.()
    // Saved immediately, so the baseline moves too — not an unsaved edit.
    if (draft?.id === id) {
      setDraft(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
      setBaseline(prev => prev ? { ...prev, enabled: !prev.enabled } : prev)
    }
  }

  function updateAction(actionId: string, updated: TriggerAction) {
    if (!draft) return
    setDraft({ ...draft, actions: draft.actions.map(a => a.id === actionId ? updated : a) })
  }

  function removeAction(actionId: string) {
    if (!draft) return
    setDraft({ ...draft, actions: draft.actions.filter(a => a.id !== actionId) })
  }

  function addAction() {
    if (!draft) return
    setDraft({ ...draft, actions: [...draft.actions, newTriggerAction('command')] })
  }

  function updateGate(gateId: string, updated: StateGate) {
    if (!draft) return
    setDraft({ ...draft, gates: draft.gates.map(g => g.id === gateId ? updated : g) })
  }

  function removeGate(gateId: string) {
    if (!draft) return
    setDraft({ ...draft, gates: draft.gates.filter(g => g.id !== gateId) })
  }

  function addGate() {
    if (!draft) return
    setDraft({ ...draft, gates: [...draft.gates, newGate()] })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const testResult = draft ? computeTest() : null

  const body = (
        <div className="trg-body">

          {/* Sidebar */}
          <div className="trg-sidebar">
            <button type="button" className="trg-new-btn" onClick={() => confirmDiscard(dirty, createNew)}>+ New trigger</button>
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
                  {rules.filter(r => (r.name + ' ' + r.pattern).toLowerCase().includes(search.toLowerCase())).length}/{rules.length}
                </span>
              )}
            </div>
            <div className="trg-list" role="listbox" aria-label="Triggers" onKeyDown={ruleListKeyDown}>
              {rules.length === 0 && !isPendingNew && (
                <div className="trg-empty">No triggers yet.<br />Right-click game text, or use + New trigger.</div>
              )}
              {(search ? rules.filter(r => (r.name + ' ' + r.pattern).toLowerCase().includes(search.toLowerCase())) : rules).map(r => {
                const label = r.name || r.pattern || r.watchVariable
                return (
                <div
                  key={r.id}
                  className={`trg-list-item${selectedId === r.id ? ' trg-list-item--active' : ''}${!r.enabled ? ' trg-list-item--disabled' : ''}`}
                  {...pressable(() => requestSelect(r), { role: 'option', selected: selectedId === r.id })}
                >
                  <button
                    type="button"
                    className={`trg-toggle${r.enabled ? ' trg-toggle--on' : ''}`}
                    title={r.enabled ? 'Disable' : 'Enable'}
                    aria-label={r.enabled ? 'Disable' : 'Enable'}
                    onClick={e => { e.stopPropagation(); toggleEnabled(r.id) }}
                  />
                  {/* B396: the full label, since the row truncates it. */}
                  <span className="trg-list-label" title={label || undefined}>{label || <em>Unnamed</em>}</span>
                  <div className="trg-list-badges" style={{ marginLeft: 'auto' }}>
                    {r.actions.slice(0, 3).map(a => (
                      <span key={a.id} className="trg-badge" title={ACTION_LABELS[a.type]}>
                        {a.type === 'command' ? '⌨' : a.type === 'echo' ? '📢' : a.type === 'notify' ? '🔔' : a.type === 'sound' ? '🔊' : a.type === 'flash' ? '⚡' : a.type === 'beep' ? '🔔' : a.type === 'log' ? '📄' : a.type === 'webhook' ? '🔗' : '📋'}
                      </span>
                    ))}
                    {r.actions.length > 3 && <span className="trg-badge">+{r.actions.length - 3}</span>}
                  </div>
                  {an.on && <RuleBadges ruleId={r.id} report={an.report} stats={an.stats} />}
                  {/* B370: a row ✕ deletes something that isn't open, so it asks. */}
                  <button
                    type="button"
                    className="list-item-delete"
                    title="Delete"
                    aria-label={`Delete ${label || 'trigger'}`}
                    onClick={async e => { e.stopPropagation(); if (await confirmDelete('trigger', label)) deleteRuleById(r.id) }}
                  >✕</button>
                </div>
                )
              })}
              {isPendingNew && draft && (
                <div className="trg-list-item trg-list-item--active trg-list-item--pending">
                  <span className="trg-toggle trg-toggle--on" />
                  <span className="trg-list-label"><em>New trigger…</em></span>
                </div>
              )}
            </div>
          </div>

          {/* Detail */}
          <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
          <div className="trg-detail">
            {!draft ? (
              <div className="trg-no-selection">Select a trigger or create a new one.</div>
            ) : (
              <>
                {/* B389: Enter in a single-line field saves (not the Test field). */}
                <div className="trg-form" onKeyDown={enterToSave(saveDraft)}>

                  {/* ── WHEN ── */}
                  <div className="trg-section">
                    <div className="trg-section-header">
                      <span className="trg-section-title">When</span>
                      <div className="trg-section-line" />
                    </div>

                    <div className="trg-field">
                      <label className="trg-label">Label</label>
                      <input
                        ref={nameInputRef}
                        className="trg-input"
                        value={draft.name}
                        onChange={e => setDraft({ ...draft, name: e.target.value })}
                        placeholder="e.g. Foraging find (optional)"
                      />
                    </div>

                    {!hideGroups && (
                    <div className="trg-field">
                      <label className="trg-label">Groups</label>
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

                    {/* F63: per-rule scope — the inactive side MOVES the rule
                        to the other store (incl. any unsaved draft edits). */}
                    {onMoveScope && (
                    <div className="trg-field">
                      <label className="trg-label">Applies to</label>
                      <div className="rule-scope-row">
                        <button
                          type="button"
                          className={`rule-scope-btn${scope === 'character' ? ' rule-scope-btn--on' : ''}`}
                          disabled={scope === 'character'}
                          onClick={() => onMoveScope(draft)}
                          title={scope === 'character'
                            ? 'This trigger belongs to this character'
                            : 'Move this trigger to the character you have open — every OTHER character stops getting it'}
                        >This character</button>
                        <button
                          type="button"
                          className={`rule-scope-btn${scope === 'global' ? ' rule-scope-btn--on' : ''}`}
                          disabled={scope === 'global'}
                          onClick={() => onMoveScope(draft)}
                          title={scope === 'global'
                            ? 'This trigger applies to every character'
                            : 'Move this trigger to All characters — it will fire for every character on every account (group gating is removed; global rules are always active)'}
                        >All characters</button>
                      </div>
                    </div>
                    )}

                    <div className="trg-field">
                      <label className="trg-label">Fires on</label>
                      <div className="trg-mode-toggle">
                        {(['text', 'variable'] as const).map(tt => (
                          <button
                            key={tt}
                            type="button"
                            className={`trg-mode-btn${(draft.triggerType ?? 'text') === tt ? ' trg-mode-btn--active' : ''}`}
                            onClick={() => setDraft({ ...draft, triggerType: tt })}
                            title={tt === 'text' ? 'Fires when game text matches a pattern' : 'Fires when a variable changes value'}
                          >
                            {tt === 'text' ? 'Game text' : 'Variable change'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(draft.triggerType ?? 'text') === 'text' ? (
                    <div className="trg-field">
                      <label className="trg-label">Pattern</label>
                      <div className="trg-pattern-row">
                        <input
                          className={`trg-input trg-input--pattern${draft.mode === 'regex' && draft.pattern && !isValidTriggerRegex(draft.pattern) ? ' trg-input--error' : ''}`}
                          value={draft.pattern}
                          onChange={e => setDraft({ ...draft, pattern: e.target.value })}
                          placeholder="Text to match…"
                        />
                        <div className="trg-mode-toggle">
                          {(['text', 'phrase', 'regex'] as const).map(m => (
                            <button
                              key={m}
                              type="button"
                              className={`trg-mode-btn${draft.mode === m ? ' trg-mode-btn--active' : ''}`}
                              onClick={() => setDraft({ ...draft, mode: m })}
                              title={
                                m === 'text'   ? 'Whole-word match' :
                                m === 'phrase' ? 'Exact substring' : 'Regular expression'
                              }
                            >
                              {m === 'text' ? 'Text' : m === 'phrase' ? 'Phrase' : 'Regex'}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className={`trg-mode-btn trg-mode-btn--case${draft.caseSensitive ? ' trg-mode-btn--active' : ''}`}
                          onClick={() => setDraft({ ...draft, caseSensitive: !draft.caseSensitive })}
                          title={draft.caseSensitive ? 'Case-sensitive' : 'Case-insensitive'}
                        >
                          Aa
                        </button>
                      </div>
                      {draft.mode === 'regex' && draft.pattern && !isValidTriggerRegex(draft.pattern) && (
                        <span className="trg-pattern-error">Invalid regular expression</span>
                      )}
                    </div>
                    ) : (
                    <div className="trg-field">
                      <label className="trg-label">Watch variable</label>
                      <input
                        className="trg-input"
                        value={draft.watchVariable ?? ''}
                        onChange={e => setDraft({ ...draft, watchVariable: e.target.value })}
                        placeholder="e.g. health, mana, myVar"
                      />
                      <div className="trg-pattern-hint">Fires whenever this variable's value changes.</div>
                    </div>
                    )}

                    <div className="trg-meta-row">
                      <div className="trg-field">
                        <label className="trg-label">Watch stream</label>
                        <select
                          className="trg-select"
                          value={draft.watchStream}
                          onChange={e => setDraft({ ...draft, watchStream: e.target.value })}
                          disabled={(draft.triggerType ?? 'text') === 'variable'}
                        >
                          {WATCH_STREAM_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="trg-field">
                        <label className="trg-label">Cooldown</label>
                        <div className="trg-cooldown-row">
                          <input
                            className="trg-input trg-cooldown-input"
                            type="number"
                            min={0}
                            max={3600}
                            value={draft.cooldownSeconds}
                            onChange={e => setDraft({ ...draft, cooldownSeconds: Math.max(0, parseFloat(e.target.value) || 0) })}
                          />
                          <span className="trg-cooldown-unit">sec</span>
                          <label className="trg-checkbox-label">
                            <input
                              type="checkbox"
                              className="trg-checkbox"
                              checked={draft.oneShot}
                              onChange={e => setDraft({ ...draft, oneShot: e.target.checked })}
                            />
                            One-shot
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* State gates */}
                    <div className="trg-field">
                      <label className="trg-label">Conditions</label>
                      <div className="trg-gates-list">
                        {draft.gates.map((g, idx) => (
                          <Fragment key={g.id}>
                            {idx > 0 && (
                              <button
                                type="button"
                                className={`trg-gate-connector-btn${(g.connector ?? 'and') === 'or' ? ' trg-gate-connector-btn--or' : ''}`}
                                onClick={() => updateGate(g.id, { ...g, connector: (g.connector ?? 'and') === 'and' ? 'or' : 'and' })}
                                title="Click to toggle AND / OR"
                              >
                                {(g.connector ?? 'and').toUpperCase()}
                              </button>
                            )}
                            <GateRow
                              gate={g}
                              onChange={updated => updateGate(g.id, updated)}
                              onRemove={() => removeGate(g.id)}
                            />
                          </Fragment>
                        ))}
                        <button type="button" className="trg-add-gate-btn" onClick={addGate}>
                          + Add condition
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── THEN ── */}
                  <div className="trg-section">
                    <div className="trg-section-header">
                      <span className="trg-section-title">Then</span>
                      <div className="trg-section-line" />
                    </div>

                    <div className="trg-action-list">
                      {draft.actions.map(action => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          canRemove={draft.actions.length > 1}
                          onChange={updated => updateAction(action.id, updated)}
                          onRemove={() => removeAction(action.id)}
                        />
                      ))}
                    </div>

                    <button type="button" className="trg-add-action-btn" onClick={addAction}>
                      + Add action
                    </button>
                  </div>

                  {/* ── TEST ── */}
                  <div className="trg-section">
                    <div className="trg-section-header">
                      <span className="trg-section-title">Test</span>
                      <div className="trg-section-line" />
                    </div>

                    <div className="trg-test-row" data-enter-save="off">
                      <input
                        className="trg-input"
                        style={{ flex: 1 }}
                        value={testInput}
                        onChange={e => setTestInput(e.target.value)}
                        placeholder="Type a sample game line…"
                      />
                      <select
                        className="trg-select trg-test-stream"
                        value={testStream}
                        onChange={e => setTestStream(e.target.value)}
                      >
                        {WATCH_STREAM_OPTIONS.filter(o => o.value !== 'any').map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    {testInput && testResult && (
                      <div>
                        <div className={`trg-test-result${testResult.match ? ' trg-test-result--match' : ' trg-test-result--no-match'}`}>
                          {testResult.match ? `✓ Would fire — matched "${testResult.matchText}"` : '✗ No match'}
                        </div>
                        {testResult.match && testResult.actionSummary && (
                          <pre className="trg-test-actions">{testResult.actionSummary}</pre>
                        )}
                        {!testResult.match && testResult.actionSummary && (
                          <div className="trg-test-actions">{testResult.actionSummary}</div>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                {/* Footer rail: [Delete] …spacer… [Revert/Cancel] [Save]. */}
                <div className="trg-actions">
                  {!isPendingNew && (
                    <InlineConfirm question="Delete this trigger?" onConfirm={deleteRule} resetKey={selectedId} />
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
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    onClick={saveDraft}
                    disabled={!!saveBlock}
                    title={saveBlock ?? undefined}
                  >
                    Save
                  </button>
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
          setRules(u); saveTriggers(character, u)
          // Only drop the editor if its rule was among those removed.
          if (selectedId && s.has(selectedId)) {
            setSelectedId(null); setDraft(null); setBaseline(null); setIsPendingNew(false)
          }
          onSaved?.()
        }} />
      {body}
    </div>
  )
}
