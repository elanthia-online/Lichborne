// Groups & Modes tab — the editor for rule GROUPS (which display rules are
// active) and MODES (named on/off sets of groups with an optional hotkey).
//
// Rendered by AutomationsPanel as its `groups` tab. It owns no persistence of
// its own: every edit goes through `useGroups()` (GroupsContext), whose
// `setGroups`/`setModes` write state AND save it for the current character.
// Two side effects a developer should keep: deleting a group also strips its
// id from every mode's `enabledGroups` (and from an open mode draft), and
// deleting the ACTIVE mode calls `clearMode()` so no stale mode stays applied.
// "Apply" saves the draft first, then applies it via `applyModeObject`. The
// hotkey field is MacrosPanel's `KeyBindingField`, reused so mode hotkeys
// capture keys the same way macros do.
//
// v0.19.7: "+ New" opens a PENDING draft like the rule editors — nothing is
// written until Save, so an abandoned one leaves no "New Group" behind (B388).
// Each editor tracks its draft against a baseline and asks before a switch
// would drop unsaved edits; the flag is reported to the Automations dialog
// (B368).

import { useRef, useState } from 'react'
import { type RuleGroup, type GameMode, newGroup, newMode } from '../groups'
import { useGroups } from './GroupsContext'
import { KeyBindingField } from './MacrosPanel'
import { normalizeColorInput, COLOR_INPUT_TITLE } from '../colors'
import { pressable } from '../utils/pressable'
import InlineConfirm from './InlineConfirm'
import { confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import { ruleListKeyDown } from './AutomationAnalytics'
import '../styles/groups.css'

export default function GroupsModesTab() {
  const {
    groups, modes, activeModeId,
    setGroups, setModes, applyModeObject, clearMode,
  } = useGroups()

  const [selGroupId, setSelGroupId] = useState<string | null>(null)
  const [selModeId,  setSelModeId]  = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState<RuleGroup | null>(null)
  const [modeDraft,  setModeDraft]  = useState<GameMode  | null>(null)
  // B368: what each draft is compared against (stored / fresh / just saved).
  const [groupBase,  setGroupBase]  = useState<RuleGroup | null>(null)
  const [modeBase,   setModeBase]   = useState<GameMode  | null>(null)
  // B388: true while the draft is a "+ New" that hasn't been saved yet.
  const [groupPending, setGroupPending] = useState(false)
  const [modePending,  setModePending]  = useState(false)
  const groupNameRef = useRef<HTMLInputElement>(null)
  const modeNameRef  = useRef<HTMLInputElement>(null)

  const groupDirty = !!groupDraft && !!groupBase && differs(groupDraft, groupBase)
  const modeDirty  = !!modeDraft  && !!modeBase  && differs(modeDraft, modeBase)
  useReportUnsaved(groupDirty || modeDirty)

  // ── Groups ────────────────────────────────────────────────────────────────

  function selectGroup(g: RuleGroup) {
    setSelGroupId(g.id)
    setGroupDraft({ ...g })
    setGroupBase({ ...g })
    setGroupPending(false)
  }

  function requestSelectGroup(g: RuleGroup) {
    if (g.id === selGroupId) return
    confirmDiscard(groupDirty, () => selectGroup(g))
  }

  function createGroup() {
    const g = newGroup()
    setSelGroupId(g.id)
    setGroupDraft({ ...g })
    setGroupBase({ ...g })
    setGroupPending(true)
    setTimeout(() => { groupNameRef.current?.focus(); groupNameRef.current?.select() }, 0)
  }

  const groupSaveBlock = !groupDraft ? 'Select a group to save'
    : !groupDraft.name.trim() ? 'Enter a name to save'
    : null

  function saveGroup() {
    if (!groupDraft || groupSaveBlock) return
    const saved = { ...groupDraft, name: groupDraft.name.trim() }
    setGroups(groupPending ? [...groups, saved] : groups.map(g => g.id === saved.id ? saved : g))
    setGroupDraft(saved)
    setGroupBase(saved)
    setGroupPending(false)
  }

  function cancelOrRevertGroup() {
    if (groupPending) {
      setSelGroupId(null); setGroupDraft(null); setGroupBase(null); setGroupPending(false)
      return
    }
    const g = groups.find(x => x.id === selGroupId)
    if (g) { setGroupDraft({ ...g }); setGroupBase({ ...g }) }
  }

  function deleteGroup() {
    if (!selGroupId) return
    const id = selGroupId
    setGroups(groups.filter(g => g.id !== id))
    setModes(modes.map(m => ({
      ...m,
      enabledGroups: m.enabledGroups.filter(x => x !== id),
    })))
    // An open mode editor loses the id too, so saving it can't write the
    // deleted group back — draft and baseline together, so it doesn't read
    // as an edit.
    const strip = (m: GameMode | null): GameMode | null =>
      m && m.enabledGroups.includes(id) ? { ...m, enabledGroups: m.enabledGroups.filter(x => x !== id) } : m
    setModeDraft(strip)
    setModeBase(strip)
    setSelGroupId(null)
    setGroupDraft(null)
    setGroupBase(null)
  }

  // ── Modes ─────────────────────────────────────────────────────────────────

  function selectMode(m: GameMode) {
    setSelModeId(m.id)
    setModeDraft({ ...m })
    setModeBase({ ...m })
    setModePending(false)
  }

  function requestSelectMode(m: GameMode) {
    if (m.id === selModeId) return
    confirmDiscard(modeDirty, () => selectMode(m))
  }

  function createMode() {
    const m = newMode()
    setSelModeId(m.id)
    setModeDraft({ ...m })
    setModeBase({ ...m })
    setModePending(true)
    setTimeout(() => { modeNameRef.current?.focus(); modeNameRef.current?.select() }, 0)
  }

  const modeSaveBlock = !modeDraft ? 'Select a mode to save'
    : !modeDraft.name.trim() ? 'Enter a name to save'
    : null

  /** Saves the draft and returns what was saved (null if it couldn't be). */
  function saveMode(): GameMode | null {
    if (!modeDraft || modeSaveBlock) return null
    const saved = { ...modeDraft, name: modeDraft.name.trim() }
    setModes(modePending ? [...modes, saved] : modes.map(m => m.id === saved.id ? saved : m))
    setModeDraft(saved)
    setModeBase(saved)
    setModePending(false)
    return saved
  }

  function cancelOrRevertMode() {
    if (modePending) {
      setSelModeId(null); setModeDraft(null); setModeBase(null); setModePending(false)
      return
    }
    const m = modes.find(x => x.id === selModeId)
    if (m) { setModeDraft({ ...m }); setModeBase({ ...m }) }
  }

  function deleteMode() {
    if (!selModeId) return
    setModes(modes.filter(m => m.id !== selModeId))
    if (activeModeId === selModeId) clearMode()
    setSelModeId(null)
    setModeDraft(null)
    setModeBase(null)
  }

  function toggleGroupInMode(groupId: string) {
    if (!modeDraft) return
    const has = modeDraft.enabledGroups.includes(groupId)
    setModeDraft({
      ...modeDraft,
      enabledGroups: has
        ? modeDraft.enabledGroups.filter(id => id !== groupId)
        : [...modeDraft.enabledGroups, groupId],
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="gm-wrap">
      <div className="gm-lich-notice">
        Groups control which display rules (highlights, triggers, macros, aliases) are active.
        Complex automation — variables, triggers with logic, substitution — belongs in a Lich script.
      </div>
    <div className="gm-body">

      {/* ── Groups panel ── */}
      <div className="gm-panel">
        <div className="gm-panel-header">
          <span className="gm-panel-title">Groups</span>
          <button type="button" className="gm-new-btn" onClick={() => confirmDiscard(groupDirty, createGroup)}>+ New group</button>
        </div>
        <div className="gm-list" role="listbox" aria-label="Groups" onKeyDown={ruleListKeyDown}>
          {groups.length === 0 && !groupPending && (
            <div className="ui-empty">No groups yet.</div>
          )}
          {groups.map(g => (
            <div
              key={g.id}
              className={`gm-list-item${selGroupId === g.id ? ' gm-list-item--active' : ''}`}
              {...pressable(() => requestSelectGroup(g), { role: 'option', selected: selGroupId === g.id })}
            >
              <span className="gm-list-dot" style={{ background: g.color }} />
              <span className="gm-list-name" title={g.name}>{g.name}</span>
            </div>
          ))}
          {groupPending && groupDraft && (
            <div className="gm-list-item gm-list-item--active gm-list-item--pending">
              <span className="gm-list-dot" style={{ background: groupDraft.color }} />
              <span className="gm-list-name"><em>New group…</em></span>
            </div>
          )}
        </div>

        {groupDraft ? (
          <div className="gm-detail">
            <div className="gm-field">
              <label className="gm-label">Name</label>
              <input
                ref={groupNameRef}
                className="gm-input"
                value={groupDraft.name}
                onChange={e => setGroupDraft({ ...groupDraft, name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') saveGroup() }}
              />
            </div>
            <div className="gm-field">
              <label className="gm-label">Color</label>
              <div className="gm-color-row">
                <input
                  type="color"
                  className="gm-color-picker"
                  value={groupDraft.color}
                  onChange={e => setGroupDraft({ ...groupDraft, color: e.target.value })}
                />
                <input
                  className="gm-input gm-color-hex"
                  value={groupDraft.color}
                  title={COLOR_INPUT_TITLE}
                  onChange={e => setGroupDraft({ ...groupDraft, color: e.target.value })}
                  onBlur={e => { const v = normalizeColorInput(e.target.value); if (v !== e.target.value) setGroupDraft({ ...groupDraft, color: v }) }}
                  onKeyDown={e => { if (e.key === 'Enter') saveGroup() }}
                />
              </div>
            </div>
            <div className="gm-actions">
              {!groupPending && (
                <InlineConfirm
                  question="Delete this group?"
                  title="Deletes the group and takes it out of every mode"
                  onConfirm={deleteGroup}
                  resetKey={selGroupId}
                />
              )}
              <span className="ui-modal-foot-spacer" />
              <button
                type="button"
                className="ui-btn"
                onClick={cancelOrRevertGroup}
                disabled={!groupPending && !groupDirty}
                title={!groupPending && !groupDirty ? 'No changes to revert' : undefined}
              >{groupPending ? 'Cancel' : 'Revert'}</button>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={saveGroup}
                disabled={!!groupSaveBlock}
                title={groupSaveBlock ?? undefined}
              >Save</button>
            </div>
          </div>
        ) : (
          <div className="gm-no-selection">Select a group, or use + New group.</div>
        )}
      </div>

      {/* ── Modes panel ── */}
      <div className="gm-panel">
        <div className="gm-panel-header">
          <span className="gm-panel-title">Modes</span>
          <button type="button" className="gm-new-btn" onClick={() => confirmDiscard(modeDirty, createMode)}>+ New mode</button>
        </div>
        <div className="gm-list" role="listbox" aria-label="Modes" onKeyDown={ruleListKeyDown}>
          {modes.length === 0 && !modePending && (
            <div className="ui-empty">No modes yet.</div>
          )}
          {modes.map(m => (
            <div
              key={m.id}
              className={`gm-list-item${selModeId === m.id ? ' gm-list-item--active' : ''}`}
              {...pressable(() => requestSelectMode(m), { role: 'option', selected: selModeId === m.id })}
            >
              <span className={`gm-list-mode-dot${activeModeId === m.id ? ' gm-list-mode-dot--on' : ''}`}>
                {activeModeId === m.id ? '●' : '○'}
              </span>
              <span className="gm-list-name" title={m.name}>{m.name}</span>
              {activeModeId === m.id && (
                <span className="gm-list-mode-active">active</span>
              )}
            </div>
          ))}
          {modePending && modeDraft && (
            <div className="gm-list-item gm-list-item--active gm-list-item--pending">
              <span className="gm-list-mode-dot">○</span>
              <span className="gm-list-name"><em>New mode…</em></span>
            </div>
          )}
        </div>

        {modeDraft ? (
          <div className="gm-detail">
            <div className="gm-field">
              <label className="gm-label">Name</label>
              <input
                ref={modeNameRef}
                className="gm-input"
                value={modeDraft.name}
                onChange={e => setModeDraft({ ...modeDraft, name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') saveMode() }}
              />
            </div>
            <div className="gm-field">
              <label className="gm-label">Hotkey</label>
              <KeyBindingField
                value={modeDraft.hotkey ?? ''}
                onChange={v => setModeDraft({ ...modeDraft, hotkey: v || undefined })}
              />
            </div>
            {groups.length > 0 && (
              <div className="gm-field">
                <label className="gm-label">Active groups</label>
                <div className="gm-group-toggles">
                  {groups.map(g => (
                    <label key={g.id} className="gm-group-toggle-row">
                      <input
                        type="checkbox"
                        checked={modeDraft.enabledGroups.includes(g.id)}
                        onChange={() => toggleGroupInMode(g.id)}
                      />
                      <span className="gm-group-toggle-dot" style={{ background: g.color }} />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="gm-actions">
              {!modePending && (
                <InlineConfirm
                  question="Delete this mode?"
                  title={activeModeId === modeDraft.id ? 'Deletes the mode and turns it off' : undefined}
                  onConfirm={deleteMode}
                  resetKey={selModeId}
                />
              )}
              <span className="ui-modal-foot-spacer" />
              <button
                type="button"
                className="ui-btn"
                onClick={cancelOrRevertMode}
                disabled={!modePending && !modeDirty}
                title={!modePending && !modeDirty ? 'No changes to revert' : undefined}
              >{modePending ? 'Cancel' : 'Revert'}</button>
              <button
                type="button"
                className="ui-btn"
                onClick={() => saveMode()}
                disabled={!!modeSaveBlock}
                title={modeSaveBlock ?? undefined}
              >Save</button>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={() => { const m = saveMode(); if (m) applyModeObject(m) }}
                disabled={!!modeSaveBlock}
                title={modeSaveBlock ?? 'Saves the mode, then switches its groups on and the rest off'}
              >
                {activeModeId === modeDraft.id ? 'Re-apply' : 'Apply'}
              </button>
            </div>
          </div>
        ) : (
          <div className="gm-no-selection">Select a mode, or use + New mode.</div>
        )}
      </div>

    </div>
    </div>
  )
}
