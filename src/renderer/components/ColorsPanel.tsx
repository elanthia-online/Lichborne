// Colors tab — make, name and manage YOUR colors (F115, v0.19.8; DESIGN §49).
// Requested by Elore (then "Aubrey"): "if I want to change that color then
// it'll change everyone who was in that group with one click."
//
// A color made here can be picked in any color field (ColorField), which then
// stores a LINK to it — so editing a color here repaints every highlight,
// trigger echo, contact template and group using it, at once, in every window.
// The palette is APP-WIDE (all characters, _shared.yaml), which is why the
// Automations scope switch is disabled on this tab.
//
// Three kinds of row in the sidebar, one listbox:
//   • Your colors — editable: name + color, the usual draft / Revert / Save.
//   • Built-in    — the curated 16, read-only; "Make an editable copy".
//   • Removed     — shown only when there are any. Removing a color RETIRES it
//                   (out of every color list, variable still defined, so nothing
//                   using it changes). From here: Restore, or Delete for good.
//
// "Used by" and the row counts come from colorUsage.ts and cover THIS
// character plus All-characters rules — the UI says so, because another
// character's rules can use the same color. They're re-read on mount; the
// panel remounts on every tab switch, so an edit made in another tab shows.

import { useMemo, useRef, useState } from 'react'
import { pressable } from '../utils/pressable'
import { ResizeDivider } from './ResizeDivider'
import InlineConfirm from './InlineConfirm'
import { confirmDiscard } from '../confirm'
import { useReportUnsaved, differs } from '../hooks/useUnsaved'
import { ruleListKeyDown } from './AutomationAnalytics'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { usePalette, savePalette } from './ColorField'
import {
  CURATED_COLORS, type CustomColor, contrastBackingFor, expandHex, findCustomColorByName,
  isHexColor, newColorId, readableTextOn, resolveColor, tidyColorName, validateCustomColorName,
} from '../colors'
import { showToast } from '../toasts'
import { collectColorUses, loadColorUseSources, type ColorUse } from '../colorUsage'
import '../styles/highlights.css'
import '../styles/colors-panel.css'

const BUILT_INS = Object.entries(CURATED_COLORS).filter(([n]) => n !== 'grey')

type Selection =
  | { kind: 'color'; id: string }
  | { kind: 'builtin'; name: string }
  | null

interface Draft { name: string; hex: string }

const KIND_LABEL: Record<ColorUse['kind'], string> = {
  highlight: 'Highlight', trigger: 'Trigger', template: 'Contact template', group: 'Group',
}

export default function ColorsPanel() {
  const character = useCharacter()
  const palette = usePalette()
  const [selection, setSelection] = useState<Selection>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [baseline, setBaseline] = useState<Draft | null>(null)
  const [pending, setPending] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const active = useMemo(() => palette.filter(c => !c.retired), [palette])
  const retired = useMemo(() => palette.filter(c => c.retired), [palette])
  // Re-read with the palette: a "Save as a color…" in another editor can't add
  // uses while this tab is showing, but a restore can bring counts back.
  const uses = useMemo(() => collectColorUses(loadColorUseSources(character)), [character, palette])

  const selectedColor = selection?.kind === 'color' ? palette.find(c => c.id === selection.id) ?? null : null
  const dirty = !!draft && !!baseline && differs(draft, baseline)
  // Like the Groups editor: an untouched "+ New color" is not an unsaved edit.
  useReportUnsaved(dirty)

  // ── Selection ───────────────────────────────────────────────────────────

  function openColor(c: CustomColor) {
    setSelection({ kind: 'color', id: c.id })
    const d = { name: c.name, hex: c.hex }
    setDraft(c.retired ? null : d)
    setBaseline(c.retired ? null : d)
    setPending(false)
  }

  function openBuiltin(name: string) {
    setSelection({ kind: 'builtin', name })
    setDraft(null); setBaseline(null); setPending(false)
  }

  // Every switch that would drop an edit asks first (B368).
  const request = (fn: () => void) => confirmDiscard(dirty, fn)

  function startNew(name = '', hex = '#ff9040') {
    setSelection(null)
    setDraft({ name, hex })
    setBaseline({ name, hex })
    setPending(true)
    setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select() }, 0)
  }

  function copyBuiltin(name: string, hex: string) {
    let candidate = `My ${name}`
    for (let n = 2; findCustomColorByName(candidate, true); n++) candidate = `My ${name} ${n}`
    startNew(candidate, hex)
  }

  // ── Save / revert / remove ──────────────────────────────────────────────

  const editingId = pending ? null : selectedColor?.id ?? null
  const saveBlock = !draft ? 'Select a color to save'
    : validateCustomColorName(draft.name)
    ?? (() => {
      const clash = findCustomColorByName(draft.name, true)
      if (clash && clash.id !== editingId) {
        return clash.retired
          ? `"${clash.name}" is a removed color. Restore it instead, or pick another name.`
          : `You already have a color named "${clash.name}".`
      }
      return !isHexColor(draft.hex) ? 'Enter a color as #hex, e.g. #ff9040' : null
    })()

  function save() {
    if (!draft || saveBlock) return
    const name = tidyColorName(draft.name)
    const hex = expandHex(draft.hex)
    if (pending) {
      const color: CustomColor = { id: newColorId(palette), name, hex }
      savePalette([...palette, color])
      setSelection({ kind: 'color', id: color.id })
      setPending(false)
    } else if (editingId) {
      // The palette is app-wide and another window can delete a color for good
      // while this editor is open. `palette.map` would then match nothing and
      // write the list back UNCHANGED, while the two setState calls below
      // marked the draft clean — so the edit vanished silently, from a Save
      // button that had been enabled. Say so and keep the draft dirty instead.
      if (!palette.some(c => c.id === editingId)) {
        showToast({ kind: 'error', title: 'Nothing was saved',
          message: `“${name}” was deleted in another window, so there was nothing to update. Your changes are still here — use + New color to save them as a new one.` })
        return
      }
      savePalette(palette.map(c => c.id === editingId ? { ...c, name, hex } : c))
    }
    setDraft({ name, hex })
    setBaseline({ name, hex })
  }

  function revert() {
    if (pending) { setDraft(null); setBaseline(null); setPending(false); return }
    if (selectedColor) { const d = { name: selectedColor.name, hex: selectedColor.hex }; setDraft(d); setBaseline(d) }
  }

  function retire(id: string) {
    savePalette(palette.map(c => c.id === id ? { ...c, retired: true } : c))
    setSelection(null); setDraft(null); setBaseline(null)
  }

  function restore(id: string) {
    const next = palette.map(c => {
      if (c.id !== id) return c
      const { retired: _drop, ...rest } = c
      return rest
    })
    savePalette(next)
    const c = next.find(x => x.id === id)
    if (c) openColor(c)
  }

  function deleteForGood(id: string) {
    savePalette(palette.filter(c => c.id !== id))
    setSelection(null); setDraft(null); setBaseline(null)
  }

  // ── Render helpers ──────────────────────────────────────────────────────

  function usedBy(id: string, what: string) {
    const list = uses.get(id) ?? []
    return (
      <div className="hp-field">
        <label className="hp-label">Used by</label>
        {list.length === 0 ? (
          <div className="ui-hint">
            Nothing here uses {what} yet. Pick it in any color field: highlights, trigger echoes, contact templates or groups.
          </div>
        ) : (
          <ul className="clr-uses">
            {list.map(u => (
              <li key={`${u.kind}:${u.scope}:${u.id}`} className="clr-use">
                <span className="clr-use-kind">{KIND_LABEL[u.kind]}{u.scope === 'global' ? ' · All characters' : ''}</span>
                <span className="clr-use-label" title={u.label}>{u.label}</span>
                <span className="clr-use-fields">{u.fields.join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="ui-hint">Counts {character}’s rules and All-characters rules. Your other characters may use it too.</div>
      </div>
    )
  }

  function preview(hex: string) {
    const valid = isHexColor(hex)
    const shown = valid ? expandHex(hex) : null
    const lowContrast = !!shown && !!contrastBackingFor(shown, '--bg-app')
    return (
      <div className="hp-field">
        <label className="hp-label">Preview</label>
        <div className="hp-preview-box clr-preview">
          {shown ? (
            <>
              <div style={{ color: shown }}>Your spell of Minor Physical Protection fades.</div>
              {/* The ink is picked from the fill, which is the user's color —
                  no theme variable can know what's under it. */}
              <div><span className="clr-preview-bg" style={{ background: shown, color: readableTextOn(shown) }}>as a background</span></div>
            </>
          ) : (
            <div className="clr-preview-empty">Enter a #hex color to see it here.</div>
          )}
        </div>
        {lowContrast && (
          <div className="ui-hint">Hard to read as text on this theme’s background.</div>
        )}
      </div>
    )
  }

  const builtinSel = selection?.kind === 'builtin' ? BUILT_INS.find(([n]) => n === selection.name) ?? null : null

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="hp-body">
      <div className="hp-sidebar">
        <button type="button" className="hp-new-btn" onClick={() => request(() => startNew())}>+ New color</button>
        <div className="hp-list" role="listbox" aria-label="Colors" onKeyDown={ruleListKeyDown}>
          <div className="clr-group-label" role="presentation">Your colors</div>
          {active.length === 0 && !pending && (
            <div className="hp-empty">No colors yet. Use + New color, or “Save as a color…” in any color field.</div>
          )}
          {active.map(c => {
            const count = uses.get(c.id)?.length ?? 0
            const on = selection?.kind === 'color' && selection.id === c.id
            return (
              <div
                key={c.id}
                className={`hp-list-item${on ? ' hp-list-item--active' : ''}`}
                {...pressable(() => { if (!on) request(() => openColor(c)) }, { role: 'option', selected: on })}
              >
                <span className="hp-list-swatch" style={{ background: c.hex }} />
                <span className="hp-list-label" title={c.name}>{c.name}</span>
                {count > 0 && (
                  <span className="clr-count" title={`Used by ${count} ${count === 1 ? 'rule' : 'rules'} here`}>{count}</span>
                )}
              </div>
            )
          })}
          {pending && draft && (
            <div className="hp-list-item hp-list-item--active hp-list-item--pending">
              <span className="hp-list-swatch" style={{ background: isHexColor(draft.hex) ? draft.hex : undefined }} />
              <span className="hp-list-label"><em>New color…</em></span>
            </div>
          )}

          <div className="clr-group-label" role="presentation">Built-in</div>
          {BUILT_INS.map(([name, hex]) => {
            const on = selection?.kind === 'builtin' && selection.name === name
            return (
              <div
                key={name}
                className={`hp-list-item${on ? ' hp-list-item--active' : ''}`}
                {...pressable(() => { if (!on) request(() => openBuiltin(name)) }, { role: 'option', selected: on })}
              >
                <span className="hp-list-swatch" style={{ background: hex }} />
                <span className="hp-list-label">{name}</span>
              </div>
            )
          })}

          {retired.length > 0 && (
            <>
              <div className="clr-group-label" role="presentation"
                title="Removed colors are out of every color list, but anything already using one keeps its color">Removed</div>
              {retired.map(c => {
                const on = selection?.kind === 'color' && selection.id === c.id
                return (
                  <div
                    key={c.id}
                    className={`hp-list-item clr-row--removed${on ? ' hp-list-item--active' : ''}`}
                    {...pressable(() => { if (!on) request(() => openColor(c)) }, { role: 'option', selected: on })}
                  >
                    <span className="hp-list-swatch" style={{ background: c.hex }} />
                    <span className="hp-list-label" title={c.name}>{c.name}</span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
      <div className="hp-detail">
        {draft ? (
          <>
            <div className="hp-form">
              <div className="hp-field">
                <label className="hp-label" htmlFor="clr-name">Name</label>
                <input
                  id="clr-name"
                  ref={nameRef}
                  className="hp-input"
                  value={draft.name}
                  maxLength={24}
                  placeholder="e.g. Buff drop"
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') save() }}
                />
              </div>
              <div className="hp-field">
                <label className="hp-label">Color</label>
                <div className="clr-color-row">
                  <input
                    type="color"
                    className="hp-color-picker"
                    aria-label="Pick the color"
                    value={isHexColor(draft.hex) ? expandHex(draft.hex) : '#888888'}
                    onChange={e => setDraft({ ...draft, hex: e.target.value })}
                  />
                  <input
                    className="hp-input ui-field--code clr-hex"
                    aria-label="Color as #hex"
                    value={draft.hex}
                    title="A #hex value, or a built-in or web color name (converted when you leave the field)"
                    onChange={e => setDraft({ ...draft, hex: e.target.value })}
                    onBlur={e => {
                      const t = e.target.value.trim()
                      // A palette color is always a plain hex, never a link.
                      const h = t.startsWith('#') ? t : resolveColor(t)
                      if (h && h !== e.target.value) setDraft({ ...draft, hex: h })
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') save() }}
                  />
                </div>
                <div className="ui-hint">
                  {pending
                    ? 'Once saved, pick it in any color field. Anything you link to it follows later changes.'
                    : 'Saving a new color here repaints everything linked to it, right away.'}
                </div>
              </div>
              {preview(draft.hex)}
              {!pending && selectedColor && usedBy(selectedColor.id, 'this color')}
            </div>
            <div className="hp-actions">
              {!pending && selectedColor && (
                <InlineConfirm
                  label="Remove"
                  confirmLabel="Remove"
                  question="Remove this color?"
                  title="Takes it out of every color list. Anything already using it keeps its color, and you can restore it."
                  onConfirm={() => retire(selectedColor.id)}
                  resetKey={selectedColor.id}
                />
              )}
              <span className="ui-modal-foot-spacer" />
              <button
                type="button"
                className="ui-btn"
                onClick={revert}
                disabled={!pending && !dirty}
                title={!pending && !dirty ? 'No changes to revert' : undefined}
              >{pending ? 'Cancel' : 'Revert'}</button>
              <button
                type="button"
                className="ui-btn ui-btn--primary"
                onClick={save}
                disabled={!!saveBlock}
                title={saveBlock ?? undefined}
              >Save</button>
            </div>
          </>
        ) : selectedColor?.retired ? (
          <>
            <div className="hp-form">
              <div className="hp-field">
                <label className="hp-label">Removed color</label>
                <div className="clr-readonly"><span className="clr-readonly-swatch" style={{ background: selectedColor.hex }} />{selectedColor.name} · {selectedColor.hex}</div>
                <div className="ui-hint">It’s out of every color list. Anything that already uses it keeps this color.</div>
              </div>
              {preview(selectedColor.hex)}
              {usedBy(selectedColor.id, 'this color')}
            </div>
            <div className="hp-actions">
              <InlineConfirm
                label="Delete for good"
                question="Delete for good?"
                title="Anything still linked to it keeps the color it had when it was linked, but stops following any color you can edit."
                onConfirm={() => deleteForGood(selectedColor.id)}
                resetKey={selectedColor.id}
              />
              <span className="ui-modal-foot-spacer" />
              <button type="button" className="ui-btn ui-btn--primary" onClick={() => restore(selectedColor.id)}>Restore</button>
            </div>
          </>
        ) : builtinSel ? (
          <>
            <div className="hp-form">
              <div className="hp-field">
                <label className="hp-label">Built-in color</label>
                <div className="clr-readonly"><span className="clr-readonly-swatch" style={{ background: builtinSel[1] }} />{builtinSel[0]} · {builtinSel[1]}</div>
                <div className="ui-hint">
                  Built-in colors never change, so picking one copies its value. Make an editable copy to get a color you can tune and link to.
                </div>
              </div>
              {preview(builtinSel[1])}
            </div>
            <div className="hp-actions">
              <span className="ui-modal-foot-spacer" />
              <button type="button" className="ui-btn ui-btn--primary" onClick={() => copyBuiltin(builtinSel[0], builtinSel[1])}>
                Make an editable copy
              </button>
            </div>
          </>
        ) : (
          <div className="hp-no-selection clr-intro">
            <p>Name the colors you use again and again, like “Buff drop” or “Danger”.</p>
            <p>Pick them in any highlight, trigger echo, contact template or group. Change one here and everything using it changes with it.</p>
            <p>Your colors are shared by all your characters.</p>
          </div>
        )}
      </div>
    </div>
  )
}
