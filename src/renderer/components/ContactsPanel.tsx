// Contacts panel — the modal that edits a character's CONTACTS (who: name,
// template, guild/circle, notes, plus the read-only last-seen + F34 encounter
// stats) and their TEMPLATES (how they paint: text/bg color, bold, a text
// effect, an optional tag with its own effect, and group gating).
//
// Rendered by GameWindow, portaled to document.body, in the canonical modal
// chrome (ui.css primitives). Per character via `useCharacter()`. Both tabs
// share ONE two-pane layout — a sidebar with + New, search and a scrolling list
// beside a detail pane — and the same classes (v0.20.0: Templates used to be
// an accordion with no search, and behaved nothing like Contacts). Each editor
// keeps a draft beside a BASELINE, so it knows when an edit would be lost and
// asks before switching item, starting "+ New" or closing (B368); a draft
// whose id isn't stored yet is a pending NEW item, written only on Save (B388).
// Every write re-reads storage first (GameWindow's presence tracking writes
// there while this is open) and calls `onSaved`, so the host reloads its copy
// and schedules the profile save (B371). `openContactId` selects a contact on
// open. The one invariant the file states for itself: EVERY preview here goes
// through `paintContactText` — the same builder `renderSegmentFull` uses for
// game text — so there is ONE definition of how a template looks and no second
// copy to drift (a rainbow template used to preview as flat colour). Deleting
// a template does not touch the contacts that referenced it; their
// `templateId` just stops resolving (`getTemplate` returns null). Color fields
// are the shared ColorField (F115): one of your colors stays LINKED, and a
// typed color name resolves on blur and again on Save (`normalizeColorInput`).

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { backdropHandlers } from '../utils/backdropClose'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { differs } from '../hooks/useUnsaved'
import { pressable } from '../utils/pressable'
import { confirmAction, confirmDelete, confirmDiscard } from '../confirm'
import InlineConfirm from './InlineConfirm'
import { ResizeDivider } from './ResizeDivider'
import {
  type Contact, type ContactTemplate,
  loadContacts, saveContacts,
  loadContactTemplates, saveContactTemplates,
  newContact, newTemplate,
  DR_GUILDS,
  formatLastSeen, formatDuration,
} from '../contacts'
import { ContactRun } from '../utils/contactStyle'
import { useCharacter } from '../CharacterContext'
import { scopedKey } from '../characterScope'
import { type HighlightEffect, HIGHLIGHT_EFFECTS, FX_USES_COLOR, DEFAULT_FX_COLOR, effectColorNote } from '../highlights'
import GroupPicker from './GroupPicker'
import '../styles/contacts.css'
import { normalizeColorInput } from '../colors'
import ColorField, { ColorManageContext } from './ColorField'
import '../styles/groups.css'

type Tab = 'contacts' | 'templates'

// B396: the list is sorted by name, case-insensitively. Unnamed entries (the
// pre-B388 "+ New" saved a blank contact straight away) sort last so they
// don't crowd the top.
function compareContacts(a: Contact, b: Contact): number {
  const an = a.name.trim()
  const bn = b.name.trim()
  if (!an !== !bn) return an ? -1 : 1
  return an.localeCompare(bn, undefined, { sensitivity: 'base' })
}

// The presence stats GameWindow keeps writing to storage while this panel is
// open (F34). A save takes them from storage, never from the draft — the
// draft's copies are as old as the moment the contact was opened.
function withLiveTracking(edited: Contact, stored: Contact | undefined): Contact {
  if (!stored) return edited
  return {
    ...edited,
    lastSeen: stored.lastSeen,
    lastRoom: stored.lastRoom,
    encounterCount: stored.encounterCount,
    timeSpentMs: stored.timeSpentMs,
    lastEncounterAt: stored.lastEncounterAt,
  }
}

// Enter saves a template without the colour field ever blurring (B389), so
// typed colour NAMES resolve here as well as on blur — templates store hex.
function withResolvedColors(t: ContactTemplate): ContactTemplate {
  return {
    ...t,
    textColor: normalizeColorInput(t.textColor),
    bgColor: normalizeColorInput(t.bgColor),
    tagColor: normalizeColorInput(t.tagColor),
    tagBgColor: normalizeColorInput(t.tagBgColor),
    glowColor: t.glowColor === undefined ? undefined : normalizeColorInput(t.glowColor),
    tagGlowColor: t.tagGlowColor === undefined ? undefined : normalizeColorInput(t.tagGlowColor),
  }
}

interface Props {
  onClose: () => void
  onSaved?: () => void
  openContactId?: string | null
  /** Bumped by GameWindow when the app bar or the native menu toggles this
   *  dialog closed; answered with the same guarded close as the ✕ (B368). */
  closeRequest?: number
  /** F115: opens Automations → Colors, for every color field's "Manage colors…". */
  onManageColors?: () => void
}

/**
 * Template previews that render EXACTLY as game text does.
 *
 * They used to build a plain `style={{ color }}`, so a rainbow template previewed
 * as flat colour and you only found the effect by spotting that contact in play
 * (Sekmeht). Both now go through `paintContactText`, the same builder
 * `renderSegmentFull` uses — the point is not that they look similar, it is that
 * there is ONE definition and no second place to forget.
 */
function TagPreviewText({ tpl }: { tpl: ContactTemplate }) {
  return <ContactRun text={tpl.tagText} color={tpl.tagColor} bgColor={tpl.tagBgColor}
    bold={tpl.tagBold} effect={tpl.tagEffect} glowColor={tpl.tagGlowColor} />
}

/** A template's TAG, painted, for a list row that supplies its own wrapper. */
function listTag(tpl: ContactTemplate) {
  return <TagPreviewText tpl={tpl} />
}

/** A template's NAME, painted, for a list row that supplies its own wrapper. */
function TplNameText({ tpl, name }: { tpl: ContactTemplate; name: string }) {
  return <ContactRun text={name} color={tpl.textColor} bgColor={tpl.bgColor}
    bold={tpl.bold} effect={tpl.effect} glowColor={tpl.glowColor} />
}

function TplPreviewText({ tpl, name }: { tpl: ContactTemplate; name: string }) {
  return (
    <>
      {tpl.tagText && <><TagPreviewText tpl={tpl} />{' '}</>}
      <TplNameText tpl={tpl} name={name} />
    </>
  )
}

export default function ContactsPanel({ onClose, onSaved, openContactId, closeRequest, onManageColors }: Props) {
  const character = useCharacter()
  const titleId = useId()
  const [tab, setTab]                 = useState<Tab>('contacts')
  const [contacts, setContacts]       = useState<Contact[]>(() => loadContacts(character))
  const [templates, setTemplates]     = useState<ContactTemplate[]>(() => loadContactTemplates(character))
  // Each editor's draft sits beside a BASELINE — the stored item it was opened
  // from, the fresh factory draft for "+ New", the saved item after Save — so
  // `dirty` means "there is something to lose" (B368).
  const [draft, setDraft]             = useState<Contact | null>(null)
  const [baseline, setBaseline]       = useState<Contact | null>(null)
  const [tplDraft, setTplDraft]       = useState<ContactTemplate | null>(null)
  const [tplBaseline, setTplBaseline] = useState<ContactTemplate | null>(null)
  // The Templates tab has the Contacts tab's own sidebar: search + a list that
  // scrolls (v0.20.0 — it used to be an accordion with neither).
  const [tplSearch, setTplSearch]     = useState('')
  const tplSearchRef                  = useRef<HTMLInputElement>(null)
  const tplListRef                    = useRef<HTMLDivElement>(null)
  const tplNameRef                    = useRef<HTMLInputElement>(null)
  const [search, setSearch]           = useState('')
  const nameInputRef                  = useRef<HTMLInputElement>(null)
  const searchRef                     = useRef<HTMLInputElement>(null)
  const listRef                       = useRef<HTMLDivElement>(null)

  // B388: a draft whose id isn't in the stored list is a pending NEW item.
  // Nothing is written until Save, so an abandoned "+ New" leaves no blank
  // "Unnamed" / empty template behind.
  const isNewContact = !!draft && !contacts.some(c => c.id === draft.id)
  const selectedId   = draft && !isNewContact ? draft.id : null
  const contactDirty = !!draft && !!baseline && differs(draft, baseline)
  const tplIsNew     = !!tplDraft && !templates.some(t => t.id === tplDraft.id)
  const tplDirty     = !!tplDraft && !!tplBaseline && differs(tplDraft, tplBaseline)
  const contactLabel = draft?.name.trim() || (isNewContact ? 'the new contact' : 'this contact')
  const tplLabel     = tplDraft?.name.trim() || (tplIsNew ? 'the new template' : 'this template')

  // Closing drops both drafts, so it asks first when either is dirty (B368) —
  // for the ✕, the backdrop and Esc alike. The Contacts/Templates switch does
  // NOT ask: both drafts live here, not in the tab bodies, so a tab switch
  // keeps them intact and there is nothing to discard.
  function requestClose() {
    const what = contactDirty && tplDirty ? undefined : contactDirty ? contactLabel : tplDirty ? tplLabel : undefined
    confirmDiscard(contactDirty || tplDirty, onClose, what)
  }
  useEscapeClose(requestClose)

  // The app-bar Contacts button and the native menu close this dialog through
  // GameWindow, which bumps `closeRequest` rather than unmounting us so an
  // unsaved draft still asks first (B368). The counter carries over between
  // openings, so the value we mounted with is not a request.
  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose
  const closeReqAtMount = useRef(closeRequest)
  useEffect(() => {
    if (closeRequest !== undefined && closeRequest !== closeReqAtMount.current) requestCloseRef.current()
  }, [closeRequest])

  useEffect(() => {
    const c = openContactId ? contacts.find(c => c.id === openContactId) : undefined
    if (c) {
      openContact(c)
      setTimeout(() => nameInputRef.current?.focus(), 0)
    } else {
      // B397: open ready to type into the search box.
      searchRef.current?.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Switching to Templates puts you in its search box, as opening the dialog
  // does for Contacts (B397). Skips the mount, which the effect above owns.
  const tabMounted = useRef(false)
  useEffect(() => {
    if (!tabMounted.current) { tabMounted.current = true; return }
    if (tab === 'templates' && !tplDraft) tplSearchRef.current?.focus()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  function getTemplate(id: string | null): ContactTemplate | null {
    return templates.find(t => t.id === id) ?? null
  }

  // ── Writes ─────────────────────────────────────────────────────────
  // Every write is a read-modify-write against STORAGE, not this panel's
  // mount-time copy: GameWindow's presence tracking (F34) keeps writing
  // last-seen and encounter stats while the panel is open, and writing the
  // snapshot back would rewind every contact's stats to the moment the panel
  // opened. Each commit calls onSaved, which reloads GameWindow's copy and
  // schedules the profile save (pitfall #36). New contacts, new templates and
  // template deletes used to skip it, so a deleted template kept colouring
  // names in game text (B371).

  function commitContacts(next: Contact[]) {
    saveContacts(character, next)
    setContacts(next)
    onSaved?.()
  }

  function commitTemplates(next: ContactTemplate[]) {
    saveContactTemplates(character, next)
    setTemplates(next)
    onSaved?.()
  }

  // ── Contacts tab ───────────────────────────────────────────────────

  function openContact(c: Contact) {
    setDraft({ ...c })
    setBaseline({ ...c })
  }

  function patchDraft(patch: Partial<Contact>) {
    setDraft(prev => prev && { ...prev, ...patch })
  }

  function focusContactRow(id: string) {
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-contact-id="${CSS.escape(id)}"]`)?.focus()
    })
  }

  function selectContact(c: Contact, focusRow = false) {
    // Re-picking the open contact must not reset its draft.
    if (draft?.id === c.id) {
      if (focusRow) focusContactRow(c.id)
      return
    }
    confirmDiscard(contactDirty, () => {
      openContact(c)
      if (focusRow) focusContactRow(c.id)
    }, contactLabel)
  }

  function createNew() {
    confirmDiscard(contactDirty, () => {
      const c = newContact()
      setDraft(c)
      setBaseline(c)
      setTimeout(() => nameInputRef.current?.focus(), 0)
    }, contactLabel)
  }

  function saveDraft() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return
    const current = loadContacts(character)
    const stored = current.find(c => c.id === draft.id)
    const saved = withLiveTracking({ ...draft, name }, stored)
    commitContacts(stored ? current.map(c => (c.id === saved.id ? saved : c)) : [...current, saved])
    setDraft(saved)
    setBaseline(saved)
  }

  function revertDraft() {
    if (baseline) setDraft({ ...baseline })
  }

  function cancelNewContact() {
    setDraft(null)
    setBaseline(null)
  }

  function deleteContactById(id: string) {
    commitContacts(loadContacts(character).filter(c => c.id !== id))
    setDraft(d => (d?.id === id ? null : d))
    setBaseline(b => (b?.id === id ? null : b))
  }

  // B370: the row ✕ is a one-click destroy on something that isn't open in
  // the editor, so it asks through the shared confirm.
  async function confirmDeleteRow(c: Contact) {
    if (!(await confirmDelete('contact', c.name.trim() || undefined))) return
    deleteContactById(c.id)
  }

  async function resetStats() {
    if (!draft || isNewContact) return
    const id = draft.id
    const ok = await confirmAction({
      title: 'Reset encounter stats?',
      message: draft.name.trim() || undefined,
      detail: "Encounters and time encountered go back to zero. This can't be undone.",
      confirmLabel: 'Reset',
      danger: true,
    })
    if (!ok) return
    // Only the stats are written. Any unsaved edit in the form stays pending —
    // the old Reset saved the whole draft, edits included.
    const zero = { encounterCount: 0, timeSpentMs: 0, lastEncounterAt: undefined }
    commitContacts(loadContacts(character).map(c => (c.id === id ? { ...c, ...zero } : c)))
    setDraft(d => (d && d.id === id ? { ...d, ...zero } : d))
    setBaseline(b => (b && b.id === id ? { ...b, ...zero } : b))
  }

  function onContactEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      saveDraft()
    }
  }

  const visibleContacts = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? contacts.filter(c =>
          c.name.toLowerCase().includes(q) || c.guild.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q))
      : [...contacts]
    return list.sort(compareContacts)
  }, [contacts, search])

  // B396: ↑/↓ move the selection — through the guarded select, so a dirty
  // draft still asks first. ↑ from the top row returns to the search box.
  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (visibleContacts.length === 0) return
    e.preventDefault()
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-contact-id]')
    const from = row?.dataset.contactId ?? selectedId
    const at = from ? visibleContacts.findIndex(c => c.id === from) : -1
    if (e.key === 'ArrowUp' && at === 0) { searchRef.current?.focus(); return }
    const step = e.key === 'ArrowDown' ? 1 : -1
    const next = at < 0
      ? (step === 1 ? 0 : visibleContacts.length - 1)
      : Math.min(visibleContacts.length - 1, Math.max(0, at + step))
    selectContact(visibleContacts[next], true)
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && search) {
      // Clears the search instead of closing the dialog (pitfall #141).
      e.preventDefault()
      setSearch('')
    } else if (e.key === 'ArrowDown' && visibleContacts.length > 0) {
      e.preventDefault()
      selectContact(visibleContacts.find(c => c.id === selectedId) ?? visibleContacts[0], true)
    }
  }

  // ── Templates tab ──────────────────────────────────────────────────

  function openTemplate(t: ContactTemplate) {
    setTplDraft({ ...t })
    setTplBaseline({ ...t })
  }

  function patchTpl(patch: Partial<ContactTemplate>) {
    setTplDraft(prev => prev && { ...prev, ...patch })
  }

  function focusTplRow(id: string) {
    requestAnimationFrame(() => {
      tplListRef.current?.querySelector<HTMLElement>(`[data-tpl-id="${CSS.escape(id)}"]`)?.focus()
    })
  }

  // Selecting another template asks first when the open one has unsaved changes,
  // exactly as selecting another contact does.
  function startEditTemplate(t: ContactTemplate, focusRow = false) {
    if (tplDraft?.id === t.id) {
      if (focusRow) focusTplRow(t.id)
      return
    }
    confirmDiscard(tplDirty, () => {
      openTemplate(t)
      if (focusRow) focusTplRow(t.id)
    }, tplLabel)
  }

  // Search matches the template's name and its tag, in stored order (the
  // built-in Friends / Enemies stay first).
  const visibleTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase()
    return q
      ? templates.filter(t => t.name.toLowerCase().includes(q) || t.tagText.toLowerCase().includes(q))
      : templates
  }, [templates, tplSearch])

  // The Contacts list's keyboard, mirrored: ↑/↓ through the list (guarded),
  // ↑ from the top row back to the search box.
  function onTplListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (visibleTemplates.length === 0) return
    e.preventDefault()
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-tpl-id]')
    const from = row?.dataset.tplId ?? (tplIsNew ? null : tplDraft?.id ?? null)
    const at = from ? visibleTemplates.findIndex(t => t.id === from) : -1
    if (e.key === 'ArrowUp' && at === 0) { tplSearchRef.current?.focus(); return }
    const step = e.key === 'ArrowDown' ? 1 : -1
    const next = at < 0
      ? (step === 1 ? 0 : visibleTemplates.length - 1)
      : Math.min(visibleTemplates.length - 1, Math.max(0, at + step))
    startEditTemplate(visibleTemplates[next], true)
  }

  function onTplSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && tplSearch) {
      // Clears the search instead of closing the dialog (pitfall #141).
      e.preventDefault()
      setTplSearch('')
    } else if (e.key === 'ArrowDown' && visibleTemplates.length > 0) {
      e.preventDefault()
      startEditTemplate(visibleTemplates.find(t => t.id === tplDraft?.id) ?? visibleTemplates[0], true)
    }
  }

  // How many contacts a template's deletion would affect — ONE count and
  // wording for the row ✕ and the editor's Delete (pitfall #127).
  function tplUses(id: string): string | null {
    const uses = contacts.filter(c => c.templateId === id).length
    return uses === 0 ? null : `${uses} contact${uses === 1 ? ' uses' : 's use'} it`
  }

  async function confirmDeleteTplRow(t: ContactTemplate) {
    const uses = tplUses(t.id)
    const ok = await confirmDelete('template', t.name.trim() || undefined,
      uses ? `${uses} and will fall back to no template. This can't be undone.` : "This can't be undone.")
    if (ok) deleteTemplate(t.id)
  }

  function closeTemplateEditor() {
    // Focus goes back where you came from — the row, or the search box for a
    // new template that was never saved — rather than onto nothing when the
    // button that had it unmounts.
    const back = tplDraft && !tplIsNew ? tplDraft.id : null
    setTplDraft(null)
    setTplBaseline(null)
    if (back) focusTplRow(back)
    else requestAnimationFrame(() => tplSearchRef.current?.focus())
  }

  function addTemplate() {
    confirmDiscard(tplDirty, () => {
      openTemplate(newTemplate())
      setTimeout(() => tplNameRef.current?.focus(), 0)
    }, tplLabel)
  }

  function saveTemplate() {
    if (!tplDraft) return
    const name = tplDraft.name.trim()
    if (!name) return
    const saved = withResolvedColors({ ...tplDraft, name })
    const current = loadContactTemplates(character)
    commitTemplates(current.some(t => t.id === saved.id)
      ? current.map(t => (t.id === saved.id ? saved : t))
      : [...current, saved])
    // Stays selected, as a saved contact does: the list keeps its place and
    // ↑/↓ still work. (It used to close, which dropped the selection and left
    // focus on nothing.)
    openTemplate(saved)
  }

  function deleteTemplate(id: string) {
    commitTemplates(loadContactTemplates(character).filter(t => t.id !== id))
    setTplDraft(d => (d?.id === id ? null : d))
    setTplBaseline(b => (b?.id === id ? null : b))
  }

  function tplDeleteQuestion(id: string): string {
    const uses = tplUses(id)
    return uses ? `Delete this template? ${uses}.` : 'Delete this template?'
  }

  function onTplEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      saveTemplate()
    }
  }

  // A render helper, not a component — called inline, so it never becomes a
  // new component type per render (UX standard #4).
  /**
   * The template editor, in labelled ZONES rather than one long ladder of rows
   * (Sekmeht: "add some dividers so it doesn't look so cluttered… when you
   * select an effect new color boxes pop up and your eyes get overloaded").
   *
   * Each zone is its own grid, so a row that appears when you pick an effect
   * reflows only WITHIN its zone instead of shuffling every field after it —
   * which is what made a new box feel like the whole form moved. The heading is
   * the shared labelled hairline (`ui-section-label--rule`, UX #5/#12), and the
   * tag's styling only appears once there is a tag to style (UX #1).
   */
  function renderTemplateEditor(d: ContactTemplate) {
    const hasTag = d.tagText.trim() !== ''
    const named = d.name.trim() !== ''
    const effectRow = (
      label: string, value: HighlightEffect | undefined, onPick: (fx: HighlightEffect | undefined) => void,
    ) => (
      <div className="cp-tpl-edit-row">
        <label className="cp-label">{label}</label>
        {/* 'none' CLEARS the field rather than storing the string: storing it
            marked an untouched card dirty after a no-op pick, and left
            `effect: 'none'` where absent is what "no effect" means. */}
        <select className="ui-field cp-select" value={value ?? 'none'}
          onChange={e => {
            const fx = e.target.value as HighlightEffect
            onPick(fx === 'none' ? undefined : fx)
          }}>
          {HIGHLIGHT_EFFECTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
    // B445: four effects carry their own palette, so the colour above is inert
    // for them; saying so beats a field that silently does nothing.
    //
    // It gets its OWN full-width row rather than sitting beside the select.
    // `.cp-tpl-edit-row` is a flex row inside a ~270px grid cell (B434), so a
    // third child would squeeze the dropdown and grow the whole grid row to fit
    // a wrapped sentence — a grid row takes the height of its tallest cell, so
    // one note would stretch every field beside it (the B411 shape).
    const effectNoteRow = (value: HighlightEffect | undefined) => {
      const note = effectColorNote(value)
      return note ? (
        <div className="cp-tpl-edit-row cp-tpl-edit-row--wide">
          <div className="ui-hint">{note}</div>
        </div>
      ) : null
    }
    const boldRow = (label: string, text: string, on: boolean, onToggle: (v: boolean) => void) => (
      <div className="cp-tpl-edit-row">
        <label className="cp-label">{label}</label>
        <label className="cp-checkbox-label">
          <input type="checkbox" className="cp-checkbox" checked={on}
            onChange={e => onToggle(e.target.checked)} />
          <span>{text}</span>
        </label>
      </div>
    )
    return (
      <div className="cp-tpl-edit">
        <div className="cp-tpl-zone">
          <div className="cp-tpl-edit-row cp-tpl-edit-row--wide">
            <label className="cp-label">Template name</label>
            {/* Focused for + New template only (addTemplate), not on every open:
                arrowing through the list must keep focus in the list. */}
            <input ref={tplNameRef} className="ui-field" value={d.name}
              placeholder="e.g. Friends"
              onChange={e => patchTpl({ name: e.target.value })}
              onKeyDown={onTplEnter} />
          </div>
        </div>

        <div className="ui-section-label ui-section-label--rule">Contact name</div>
        <div className="cp-tpl-zone">
          <div className="cp-tpl-edit-row">
            <label className="cp-label">Color</label>
            <ColorField label="Name color" value={d.textColor}
              onChange={v => patchTpl({ textColor: v })} onEnter={saveTemplate} />
          </div>
          <div className="cp-tpl-edit-row">
            <label className="cp-label">Background</label>
            <ColorField label="Name background" value={d.bgColor} placeholder="none"
              none={{ value: 'transparent', label: 'No background' }}
              onChange={v => patchTpl({ bgColor: v })} onEnter={saveTemplate} />
          </div>
          {boldRow('Bold', 'Bold name text', d.bold ?? false, bold => patchTpl({ bold }))}
          {effectRow('Effect', d.effect, effect => patchTpl({ effect }))}
          {effectNoteRow(d.effect)}
          {FX_USES_COLOR.has(d.effect ?? 'none') && (
            <div className="cp-tpl-edit-row">
              <label className="cp-label">Effect color</label>
              <ColorField label="Effect color" value={d.glowColor ?? ''} placeholder={DEFAULT_FX_COLOR} defaultSwatch={DEFAULT_FX_COLOR}
                onChange={v => patchTpl({ glowColor: v })} onEnter={saveTemplate} />
            </div>
          )}
        </div>

        <div className="ui-section-label ui-section-label--rule">Tag</div>
        <div className="cp-tpl-zone">
          <div className="cp-tpl-edit-row cp-tpl-edit-row--wide">
            <label className="cp-label">Text</label>
            <input className="ui-field" value={d.tagText}
              onChange={e => patchTpl({ tagText: e.target.value })}
              onKeyDown={onTplEnter}
              placeholder="e.g. [Enemy]  (blank = no tag)" />
          </div>
          {/* Everything that STYLES the tag waits until there is a tag — a
              control for something that doesn't exist is noise (UX #1), and it
              was half this card's clutter. The values are kept, so clearing the
              text and typing it again brings the styling back. */}
          {hasTag && (
            <>
              <div className="cp-tpl-edit-row">
                <label className="cp-label">Color</label>
                <ColorField label="Tag color" value={d.tagColor}
                  onChange={v => patchTpl({ tagColor: v })} onEnter={saveTemplate} />
              </div>
              <div className="cp-tpl-edit-row">
                <label className="cp-label">Background</label>
                <ColorField label="Tag background" value={d.tagBgColor} placeholder="none"
                  none={{ value: 'transparent', label: 'No background' }}
                  onChange={v => patchTpl({ tagBgColor: v })} onEnter={saveTemplate} />
              </div>
              {boldRow('Bold', 'Bold tag text', d.tagBold ?? false, tagBold => patchTpl({ tagBold }))}
              {effectRow('Effect', d.tagEffect, tagEffect => patchTpl({ tagEffect }))}
              {effectNoteRow(d.tagEffect)}
              {FX_USES_COLOR.has(d.tagEffect ?? 'none') && (
                <div className="cp-tpl-edit-row">
                  <label className="cp-label">Effect color</label>
                  <ColorField label="Tag effect color" value={d.tagGlowColor ?? ''} placeholder={DEFAULT_FX_COLOR} defaultSwatch={DEFAULT_FX_COLOR}
                    onChange={v => patchTpl({ tagGlowColor: v })} onEnter={saveTemplate} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="ui-section-label ui-section-label--rule">Preview</div>
        <div className="cp-tpl-zone">
          <div className="cp-tpl-edit-row cp-tpl-edit-row--wide">
            <span className="cp-tpl-preview"><TplPreviewText tpl={d} name={d.name || 'Name'} /></span>
          </div>
        </div>

        <div className="ui-section-label ui-section-label--rule">Applies to</div>
        <div className="cp-tpl-zone">
          <div className="cp-tpl-edit-row cp-tpl-edit-row--wide">
            <div className="grp-row">
              <button
                type="button"
                className={`grp-all-btn${d.allGroups ? ' grp-all-btn--on' : ''}`}
                title="On: the template applies whatever mode or groups are active. Off: pick the groups it belongs to."
                onClick={() => patchTpl({ allGroups: !d.allGroups, groupIds: [] })}
              >All groups</button>
              {!d.allGroups && (
                <GroupPicker
                  groupIds={d.groupIds ?? []}
                  onChange={groupIds => patchTpl({ groupIds })}
                />
              )}
            </div>
          </div>
        </div>

        <div className="cp-tpl-edit-actions">
          {/* No Delete on the built-in Friends / Enemies: the template loader
              re-adds a missing default on every read, so a deletion couldn't
              stick — it came back the moment anything re-read storage. */}
          {!tplIsNew && !d.isDefault && (
            <InlineConfirm
              question={tplDeleteQuestion(d.id)}
              onConfirm={() => deleteTemplate(d.id)}
              resetKey={d.id}
            />
          )}
          <span className="ui-modal-foot-spacer" />
          <button type="button" className="ui-btn" onClick={closeTemplateEditor}>
            {tplDirty || tplIsNew ? 'Cancel' : 'Close'}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            onClick={saveTemplate}
            disabled={!named}
            title={named ? undefined : 'Enter a name to save'}
          >Save</button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────

  const modal = (
    <div className="ui-modal-backdrop cp-backdrop" {...backdropHandlers(requestClose)}>
      <div className="ui-modal ui-modal--standard" role="dialog" aria-modal="true" aria-labelledby={titleId}>

        <div className="ui-modal-head cp-header">
          <span id={titleId} className="ui-modal-title cp-title">Contacts</span>
          <div className="ui-tabs" role="tablist" aria-label="Contacts sections">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'contacts'}
              className={`ui-tab${tab === 'contacts' ? ' ui-tab--active' : ''}`}
              onClick={() => setTab('contacts')}
            >Contacts</button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'templates'}
              className={`ui-tab${tab === 'templates' ? ' ui-tab--active' : ''}`}
              onClick={() => setTab('templates')}
            >Templates</button>
          </div>
          <button type="button" className="ui-close" onClick={requestClose} title="Close" aria-label="Close">✕</button>
        </div>

        {tab === 'contacts' && (
          <div className="cp-body">
            <div className="cp-sidebar">
              <button type="button" className="cp-new-btn" onClick={createNew}>+ New contact</button>
              <div className="sidebar-search">
                <input
                  ref={searchRef}
                  className="sidebar-search-input"
                  placeholder="Search contacts…"
                  aria-label="Search contacts"
                  title="Matches name, guild and notes"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                />
                {search && (
                  <button
                    type="button"
                    className="sidebar-search-clear"
                    onClick={() => { setSearch(''); searchRef.current?.focus() }}
                    title="Clear search"
                    aria-label="Clear search"
                  >✕</button>
                )}
                {search && (
                  <span className="sidebar-search-count">{visibleContacts.length} of {contacts.length}</span>
                )}
              </div>
              <div ref={listRef} className="cp-list" role="listbox" aria-label="Contacts" onKeyDown={onListKeyDown}>
                {isNewContact && (
                  <div className="cp-list-item cp-list-item--active cp-list-item--pending" role="option" aria-selected="true">
                    <span className="cp-list-name">
                      {draft?.name.trim() || <em className="cp-unnamed">New contact</em>}
                    </span>
                  </div>
                )}
                {contacts.length === 0 && !isNewContact && (
                  <div className="ui-empty">
                    No contacts yet. Use + New contact to add someone, then give them a template to colour their name in game text.
                  </div>
                )}
                {contacts.length > 0 && visibleContacts.length === 0 && (
                  <div className="ui-empty">No contacts match “{search.trim()}”.</div>
                )}
                {visibleContacts.map(c => {
                  const tpl = getTemplate(c.templateId)
                  const name = c.name.trim()
                  const active = selectedId === c.id
                  return (
                    <div
                      key={c.id}
                      data-contact-id={c.id}
                      className={`cp-list-item${active ? ' cp-list-item--active' : ''}`}
                      {...pressable(() => selectContact(c), { role: 'option', selected: active })}
                    >
                      {/* Through the shared painter like every other preview:
                          a colour-replacing template (rainbow, shimmer, …) is
                          deliberately NOT given its flat textColor by the game,
                          so hand-painting one here showed a colour the game
                          never paints — the drift the builder exists to stop,
                          just moved to the left pane. */}
                      {tpl?.tagText && <span className="cp-list-tag">{listTag(tpl)}{' '}</span>}
                      <span
                        className="cp-list-name"
                        title={name ? (c.guild && c.guild !== 'Unknown' ? `${name} — ${c.guild}` : name) : undefined}
                      >
                        {name
                          ? (tpl ? <TplNameText tpl={tpl} name={name} /> : name)
                          : <em className="cp-unnamed">Unnamed</em>}
                      </span>
                      <button
                        type="button"
                        className="list-item-delete"
                        title="Delete contact"
                        aria-label={`Delete ${name || 'unnamed contact'}`}
                        onClick={e => { e.stopPropagation(); void confirmDeleteRow(c) }}
                      >✕</button>
                    </div>
                  )
                })}
              </div>
            </div>

            <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
            <div className="cp-detail">
              {!draft ? (
                <div className="cp-no-selection">Select a contact, or add one with + New contact.</div>
              ) : (
                <div className="cp-form">
                  <div className="cp-field">
                    <label className="cp-label">Name</label>
                    <input
                      ref={nameInputRef}
                      className="ui-field"
                      value={draft.name}
                      onChange={e => patchDraft({ name: e.target.value })}
                      placeholder="Character name"
                      onKeyDown={onContactEnter}
                    />
                  </div>

                  <div className="cp-field">
                    <label className="cp-label">Template</label>
                    <select
                      className="ui-field cp-select"
                      value={draft.templateId ?? ''}
                      onChange={e => patchDraft({ templateId: e.target.value || null })}
                    >
                      <option value="">(none)</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    {draft.templateId && (() => {
                      const tpl = getTemplate(draft.templateId)
                      return tpl ? (
                        <span className="cp-tpl-preview">
                          <span className="cp-tpl-preview-swatch" style={{ background: tpl.textColor }} />
                          <TplPreviewText tpl={tpl} name={draft.name || 'Name'} />
                        </span>
                      ) : null
                    })()}
                  </div>

                  <div className="cp-field-row">
                    <div className="cp-field">
                      <label className="cp-label">Guild</label>
                      <select
                        className="ui-field cp-select"
                        value={draft.guild}
                        onChange={e => patchDraft({ guild: e.target.value })}
                      >
                        {DR_GUILDS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="cp-field">
                      <label className="cp-label">Circle</label>
                      <input
                        className="ui-field"
                        value={draft.circle}
                        onChange={e => patchDraft({ circle: e.target.value })}
                        onKeyDown={onContactEnter}
                        placeholder="e.g. ~50"
                      />
                    </div>
                  </div>

                  <div className="cp-field cp-field--readonly">
                    <label className="cp-label">Last seen</label>
                    <span className="cp-readonly-value">
                      {formatLastSeen(draft.lastSeen)}
                      {draft.lastRoom && <span className="cp-last-room"> — {draft.lastRoom}</span>}
                    </span>
                  </div>

                  {/* F34 (v0.8.6): per-client social stats. Encounters
                      counts standing-next-to-each-other moments (with a
                      10-min cooldown so cycling doesn't inflate the
                      number). Time encountered accumulates one minute per
                      polling tick while the contact is in the room. Both
                      grow ONLY while Lichborne is open and connected — the
                      tooltips say so. Reset button per-contact because the
                      per-client limitation makes counts occasionally
                      non-representative (imports, partial sessions, etc.). */}
                  <div className="cp-field cp-field--readonly cp-field--stats">
                    <div className="cp-stat-row">
                      <div
                        className="cp-stat-item"
                        title="Times you've been in the same room, counted at most once every 10 minutes and only while Lichborne is connected"
                      >
                        <label className="cp-label">Encounters</label>
                        <span className="cp-readonly-value">{draft.encounterCount ?? 0}</span>
                      </div>
                      <div
                        className="cp-stat-item"
                        title="Time spent in the same room, counted a minute at a time while Lichborne is connected"
                      >
                        <label className="cp-label">Time encountered</label>
                        <span className="cp-readonly-value">{formatDuration(draft.timeSpentMs ?? 0)}</span>
                      </div>
                      <button
                        type="button"
                        className="ui-btn ui-btn--sm cp-stat-reset"
                        disabled={isNewContact}
                        title={isNewContact
                          ? 'Save the contact first'
                          : 'Set Encounters and Time encountered back to zero for this contact'}
                        onClick={() => { void resetStats() }}
                      >Reset</button>
                    </div>
                  </div>

                  <div className="cp-field cp-field--grow">
                    <label className="cp-label">Notes</label>
                    <textarea
                      className="ui-field cp-textarea"
                      value={draft.notes}
                      onChange={e => patchDraft({ notes: e.target.value })}
                      placeholder="Optional notes about this person…"
                    />
                  </div>

                  <div className="cp-actions">
                    {!isNewContact && (
                      <InlineConfirm
                        question="Delete this contact?"
                        onConfirm={() => deleteContactById(draft.id)}
                        resetKey={draft.id}
                      />
                    )}
                    <span className="ui-modal-foot-spacer" />
                    {isNewContact ? (
                      <button type="button" className="ui-btn" onClick={cancelNewContact}>Cancel</button>
                    ) : (
                      <button
                        type="button"
                        className="ui-btn"
                        onClick={revertDraft}
                        disabled={!contactDirty}
                        title={contactDirty ? 'Discard your changes to this contact' : 'No changes to revert'}
                      >Revert</button>
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn--primary"
                      onClick={saveDraft}
                      disabled={!draft.name.trim()}
                      title={draft.name.trim() ? undefined : 'Enter a name to save'}
                    >Save</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'templates' && (
          // The Contacts tab's layout, class for class: a sidebar with + New,
          // search and a list that scrolls, beside a detail pane holding the
          // editor. Sharing the classes keeps the two tabs from drifting apart
          // (pitfall #113) — restyle one and both follow.
          <div className="cp-body">
            <div className="cp-sidebar">
              <button type="button" className="cp-new-btn" onClick={addTemplate}>+ New template</button>
              <div className="sidebar-search">
                <input
                  ref={tplSearchRef}
                  className="sidebar-search-input"
                  placeholder="Search templates…"
                  aria-label="Search templates"
                  value={tplSearch}
                  onChange={e => setTplSearch(e.target.value)}
                  onKeyDown={onTplSearchKeyDown}
                />
                {tplSearch && (
                  <button
                    type="button"
                    className="sidebar-search-clear"
                    onClick={() => { setTplSearch(''); tplSearchRef.current?.focus() }}
                    title="Clear search"
                    aria-label="Clear search"
                  >✕</button>
                )}
                {tplSearch && (
                  <span className="sidebar-search-count">{visibleTemplates.length} of {templates.length}</span>
                )}
              </div>
              <div ref={tplListRef} className="cp-list" role="listbox" aria-label="Templates" onKeyDown={onTplListKeyDown}>
                {/* A pending new template has no stored row yet (B388): this
                    marks where the draft is, as the Contacts list does. */}
                {tplIsNew && (
                  <div className="cp-list-item cp-list-item--active cp-list-item--pending" role="option" aria-selected="true">
                    <span className="cp-list-name">
                      {tplDraft?.name.trim() || <em className="cp-unnamed">New template</em>}
                    </span>
                  </div>
                )}
                {templates.length === 0 && !tplIsNew && (
                  <div className="ui-empty">No templates yet.</div>
                )}
                {templates.length > 0 && visibleTemplates.length === 0 && (
                  <div className="ui-empty">No templates match “{tplSearch.trim()}”.</div>
                )}
                {visibleTemplates.map(t => {
                  const active = !tplIsNew && tplDraft?.id === t.id
                  const name = t.name.trim()
                  return (
                    <div
                      key={t.id}
                      data-tpl-id={t.id}
                      className={`cp-list-item${active ? ' cp-list-item--active' : ''}`}
                      {...pressable(() => startEditTemplate(t), { role: 'option', selected: active })}
                    >
                      {/* The name through the shared painter, so the row previews
                          the template exactly as the game paints it (B281). */}
                      {/* Tag then name, in the same spans a contact row uses, so
                          one tag reads the same size in both lists. */}
                      {t.tagText && <span className="cp-list-tag">{listTag(t)}{' '}</span>}
                      <span className="cp-list-name" title={name || undefined}>
                        {name ? <TplNameText tpl={t} name={name} /> : <em className="cp-unnamed">Unnamed</em>}
                      </span>
                      {/* No ✕ on the built-in Friends / Enemies: the loader
                          re-adds a missing default on every read. */}
                      {!t.isDefault && (
                        <button
                          type="button"
                          className="list-item-delete"
                          title="Delete template"
                          aria-label={`Delete ${name || 'unnamed template'}`}
                          onClick={e => { e.stopPropagation(); void confirmDeleteTplRow(t) }}
                        >✕</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <ResizeDivider storageKey={scopedKey(character, 'automationsSidebarWidth')} />
            <div className="cp-detail">
              {!tplDraft ? (
                <div className="cp-no-selection">
                  Select a template, or add one with + New template. A template sets how a contact's name looks in game text — colour, bold, an effect, and an optional tag such as [Enemy].
                </div>
              ) : (
                <div className="cp-form">{renderTemplateEditor(tplDraft)}</div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )

  return createPortal(
    <ColorManageContext.Provider value={onManageColors ?? null}>{modal}</ColorManageContext.Provider>,
    document.body,
  )
}
