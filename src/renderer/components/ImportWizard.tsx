// Import Wizard — "Import from another client": Wrayth (one XML), Genie
// (.cfg files) or Frostbite (.ini files) → the neutral `ImportResult` from
// the parsers under ../import → `mapImportResult` (+ `mapMute` /
// `mapSubstitute`) → THIS character's rule stores. Four steps: source →
// preview → confirm → done. Lichborne→Lichborne moved to the Launcher's
// Transfer in v0.10.0; the `nativeRules` / `nativeLayout` / `nativeGroups`…
// branches in `doImport` are left from that era and the legacy parsers never
// populate them (`parse()` returns null for a `lichborne` source).
//
// Rendered by AutomationsPanel inside its `CharacterProvider`, so
// `useCharacter()` names the target; writes go straight to `saveHighlights`
// / `saveTriggers` / `saveMacros` / `saveAliases` / `saveMutes` /
// `saveSubstitutes` / `saveContacts` / `saveContactTemplates` (localStorage)
// and `onSaved` lets the host remount its panels and schedule the profile
// save; `onThemeSaved` fires when presets became an "Imported from X" custom
// theme in `myThemes`. Invariants worth keeping: EVERY save is gated on the
// category having selected content (B127 — in BOTH merge modes an import
// touches only the categories it carries, so a Wrayth file with no triggers
// can never wipe your Genie ones); duplicates are flagged in the preview by
// CONTENT key (`hlContentKey` / `trContentKey`, macros by key, aliases by
// input, contacts by name) and Append skips them with the SAME keys, while
// everything stays pre-selected because unchecking a duplicate under Replace
// would wipe the original; incoming macros are deduped by key first-wins
// (v0.11.1, Wrayth's 10 sets); names become Contacts with per-colour
// templates found-or-created by NAME; "Select all" never selects an
// `unsupported` row. Variables / scripts / alert highlights / quick buttons
// are counted and reported as "belong in Lich", never imported.

import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { backdropHandlers } from '../utils/backdropClose'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { pressable } from '../utils/pressable'
import { createPortal } from 'react-dom'
import { ImportResult, ImportSource } from '../import/types'
import { parseGenieFiles } from '../import/parsers/genie'
import { parseWraythXml } from '../import/parsers/wrayth'
import { parseFrostbiteFiles } from '../import/parsers/frostbite'
import { mapImportResult, mapMute, mapSubstitute, MergeStrategy, type MappedRules } from '../import/mapper'
import { loadMutes, saveMutes } from '../mutes'
import { loadSubstitutes, saveSubstitutes } from '../substitutes'
import { loadHighlights, saveHighlights, type HighlightRule } from '../highlights'
import { loadMacros, saveMacros, loadAliases, saveAliases, type MacroRule, type AliasRule } from '../macros'
import { loadTriggers, saveTriggers, type TriggerRule } from '../triggers'
import { loadMyThemes, saveMyThemes, createCustomThemeFrom } from '../myThemes'
import { THEMES } from '../themes'
import { type Contact, type ContactTemplate, loadContacts, saveContacts, loadContactTemplates, saveContactTemplates } from '../contacts'
import { type RuleGroup, type GameMode, loadGroups, saveGroups, loadModes, saveModes } from '../groups'
import { loadSettings, saveSettings } from '../settings'
import { scopedKey } from '../characterScope'
import { useCharacter } from '../CharacterContext'
import '../styles/import-wizard.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'source' | 'preview' | 'confirm' | 'done'
type PreviewTab = 'highlights' | 'macros' | 'aliases' | 'triggers' | 'mutes' | 'substitutes' | 'contacts' | 'theme'

// Friendly display labels for Genie preset → Frostborne CSS variable mappings
const THEME_VAR_LABELS: Record<string, string> = {
  '--text-primary':            'Default text color',
  '--bg-app':                  'Window background',
  '--preset-bold':             'Bold / Monster text',
  '--preset-bold-bg':          'Bold / Monster background',
  '--preset-cmd':              'Command echo text',
  '--preset-cmd-bg':           'Command echo background',
  '--link-color':              'Link text',
  '--preset-speech':           'Speech text',
  '--preset-speech-bg':        'Speech background',
  '--preset-whisper':          'Whisper text',
  '--preset-whisper-bg':       'Whisper background',
  '--preset-thought':          'Thought text',
  '--preset-thought-bg':       'Thought background',
  '--preset-roomname':         'Room name text',
  '--preset-roomname-bg':      'Room name background',
  '--preset-roomdesc':         'Room description text',
  '--preset-roomdesc-bg':      'Room description background',
  '--vital-health-ok-end':     'Health bar (OK) color',
  '--vital-health-ok-start':   'Health bar (OK) gradient start',
  '--vital-health-mid-end':    'Health bar (mid) color',
  '--vital-health-mid-start':  'Health bar (mid) gradient start',
  '--vital-health-low-end':    'Health bar (low) color',
  '--vital-health-low-start':  'Health bar (low) gradient start',
  '--vital-health-crit-end':   'Health bar (critical) color',
  '--vital-health-crit-start': 'Health bar (critical) gradient start',
  '--vital-mana-end':          'Mana bar color',
  '--vital-mana-start':        'Mana bar gradient start',
  '--vital-conc-end':          'Concentration bar color',
  '--vital-conc-start':        'Concentration bar gradient start',
  '--vital-stamina-end':       'Stamina bar color',
  '--vital-stamina-start':     'Stamina bar gradient start',
  '--vital-spirit-end':        'Spirit bar color',
  '--vital-spirit-start':      'Spirit bar gradient start',
  '--rt-end':                  'Roundtime bar color',
  '--rt-start':                'Roundtime bar gradient start',
  '--ct-end':                  'Cast bar color',
  '--ct-start':                'Cast bar gradient start',
}

// F29 follow-up: content-based dedup keys. Highlights and triggers can
// legitimately share patterns (different colors / actions on the same
// match), so we include scope and case-sensitivity to make "duplicate"
// mean "matches the same text in the same way," not just "matches the
// same text." Macros and aliases are keyed by their unique binding
// (one Ctrl+Enter per character, one "hunt" alias).
function hlContentKey(pattern: string, scope: string, caseSensitive: boolean): string {
  const p = caseSensitive ? pattern : pattern.toLowerCase()
  return `${p}|${scope}|${caseSensitive ? 1 : 0}`
}
function trContentKey(pattern: string, caseSensitive: boolean): string {
  const p = caseSensitive ? pattern : pattern.toLowerCase()
  return `${p}|${caseSensitive ? 1 : 0}`
}

interface FileSlot {
  label: string
  hint: string
  key: string
}

const GENIE_SLOTS: FileSlot[] = [
  { key: 'highlights',  label: 'highlights.cfg',  hint: 'Text highlights' },
  { key: 'names',       label: 'names.cfg',        hint: 'Names → Contacts (per-colour templates)' },
  { key: 'macros',      label: 'macros.cfg',       hint: 'Keyboard macros (global or per-character)' },
  { key: 'aliases',     label: 'aliases.cfg',      hint: 'Aliases (global or per-character)' },
  { key: 'triggers',    label: 'triggers.cfg',     hint: 'Triggers' },
  { key: 'presets',     label: 'presets.cfg',      hint: 'Color presets → custom theme' },
  { key: 'gags',        label: 'gags.cfg',         hint: 'Gags → Mutes (hide lines)' },
  { key: 'substitutes', label: 'substitutes.cfg',  hint: 'Substitutions → Substitutes (rewrite text)' },
  { key: 'variables',   label: 'variables.cfg',    hint: 'Variables (counted, not imported — live in Lich Vars)' },
]

const FROSTBITE_SLOTS: FileSlot[] = [
  { key: 'highlights',  label: 'highlights.ini',  hint: 'Text highlights' },
  { key: 'macros',      label: 'macros.ini',       hint: 'Keyboard macros' },
  { key: 'ignores',     label: 'ignores.ini',      hint: 'Ignores → Mutes (hide lines)' },
  { key: 'substitutes', label: 'substitutes.ini',  hint: 'Substitutions → Substitutes (rewrite text)' },
  { key: 'general',     label: 'general.ini',      hint: 'Window colors → theme; quick buttons (counted)' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function allIndices(len: number): Set<number> {
  return new Set(Array.from({ length: len }, (_, i) => i))
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string ?? '')
    reader.onerror = reject
    reader.readAsText(file)
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose:       () => void
  onSaved?:      () => void
  onThemeSaved?: (themeId: string) => void   // called after a custom theme is created from presets
  // B405: set when opened OVER another dialog (Automations). The backdrop then
  // stays transparent — it still catches the outside click — so the screen
  // isn't darkened twice.
  nested?:       boolean
}

export default function ImportWizard({ onClose, onSaved, onThemeSaved, nested = false }: Props) {
  useEscapeClose(onClose)
  const titleId = useId()
  // B397: open with focus INSIDE the dialog. Step 1 has no field, so the panel
  // itself takes it (tabIndex -1); Tab then reaches the source cards.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { panelRef.current?.focus() }, [])
  const character = useCharacter()
  const [step, setStep]         = useState<Step>('source')
  const [source, setSource]     = useState<ImportSource | null>(null)
  const [fileTexts, setFileTexts] = useState<Record<string, string>>({})
  const [result, setResult]     = useState<ImportResult | null>(null)
  const [previewTab, setPreviewTab] = useState<PreviewTab>('highlights')
  const [merge, setMerge]       = useState<MergeStrategy>('append')
  const [doneStats, setDoneStats] = useState<string>('')

  // Selection sets (indices into result arrays)
  const [selH, setSelH] = useState<Set<number>>(new Set())
  const [selM, setSelM] = useState<Set<number>>(new Set())
  const [selA, setSelA] = useState<Set<number>>(new Set())
  const [selT, setSelT] = useState<Set<number>>(new Set())
  const [selMu, setSelMu] = useState<Set<number>>(new Set())
  const [selSub, setSelSub] = useState<Set<number>>(new Set())
  const [selC, setSelC] = useState<Set<number>>(new Set())

  // F29 follow-up: per-index "duplicate of existing entry" flags, computed
  // when entering the preview step so the UI can badge them and start them
  // unchecked. Set IS index-based (matches sel* sets). Content-based
  // comparison: highlights by pattern+scope+caseSensitivity; triggers by
  // pattern+caseSensitivity; macros by key; aliases by input. Names not
  // included (the existing contact import path already dedups by name).
  const [dupH, setDupH] = useState<Set<number>>(new Set())
  const [dupM, setDupM] = useState<Set<number>>(new Set())
  const [dupA, setDupA] = useState<Set<number>>(new Set())
  const [dupT, setDupT] = useState<Set<number>>(new Set())
  const [dupMu, setDupMu] = useState<Set<number>>(new Set())
  const [dupSub, setDupSub] = useState<Set<number>>(new Set())
  const [dupC, setDupC] = useState<Set<number>>(new Set())
  // Toggle: "Hide items already in this profile" — filters preview rows
  // and uncheck-all / select-all act on visible rows only.
  const [hideExisting, setHideExisting] = useState(false)
  const [selTheme, setSelTheme] = useState(false)
  // F29-layout (v0.8.5): include the imported panel layout snapshot.
  // The confirm screen surfaces a toggle so the user can opt out — the
  // current layout would otherwise be overwritten on apply.
  const [selLayout, setSelLayout] = useState(false)

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── File loading ────────────────────────────────────────────────────────────

  async function handleFileChange(key: string, file: File | undefined) {
    if (!file) return
    const text = await readFileText(file)
    setFileTexts(prev => ({ ...prev, [key]: text }))
  }

  // ── Parse ───────────────────────────────────────────────────────────────────

  function parse(): ImportResult | null {
    if (source === 'genie') {
      return parseGenieFiles({
        highlights:    fileTexts['highlights'],
        names:         fileTexts['names'],
        macros:        fileTexts['macros'],
        aliases:       fileTexts['aliases'],
        triggers:      fileTexts['triggers'],
        presets:       fileTexts['presets'],
        substitutions: fileTexts['substitutes'],
        gags:          fileTexts['gags'],
        variables:     fileTexts['variables'],
      })
    }
    if (source === 'wrayth') {
      const xml = fileTexts['xml']
      if (!xml) return null
      return parseWraythXml(xml)
    }
    if (source === 'frostbite') {
      return parseFrostbiteFiles({
        highlights:  fileTexts['highlights'],
        macros:      fileTexts['macros'],
        ignores:     fileTexts['ignores'],
        substitutes: fileTexts['substitutes'],
        general:     fileTexts['general'],
      })
    }
    // Lichborne→Lichborne import moved to the platform-wide Transfer feature
    // (Launcher → Transfer) in v0.10.0. This wizard is legacy-client only.
    return null
  }

  function goToPreview() {
    const r = parse()
    if (!r) return
    setResult(r)

    // F29 follow-up: compute "already exists" sets per type. Pre-build keys
    // from the existing rules on this character; flag any incoming item
    // whose key matches as a duplicate. Auto-deselect duplicates so the
    // default import is "everything new"; user can still tick them to
    // overwrite or just to make the import a no-op for that row.
    const existingHl = loadHighlights(character)
    const existingTr = loadTriggers(character)
    const existingMa = loadMacros(character)
    const existingAl = loadAliases(character)
    const hlExist = new Set(existingHl.map(h => hlContentKey(h.pattern, h.scope, h.caseSensitive)))
    const trExist = new Set(existingTr.map(t => trContentKey(t.pattern, t.caseSensitive)))
    const maExist = new Set(existingMa.map(m => m.key.toLowerCase()).filter(Boolean))
    const alExist = new Set(existingAl.map(a => a.input.toLowerCase()).filter(Boolean))

    const existingMu = loadMutes(character)
    const muKey = (pattern: string, mode: string, scope: string, cs: boolean) => `${cs ? pattern : pattern.toLowerCase()}|${mode}|${scope}|${cs ? 1 : 0}`
    const muExist = new Set(existingMu.map(m => muKey(m.pattern, m.mode, m.scope, m.caseSensitive)))
    const existingSub = loadSubstitutes(character)
    const subKey = (pattern: string, mode: string, repl: string, cs: boolean) => `${cs ? pattern : pattern.toLowerCase()}|${mode}|${repl}|${cs ? 1 : 0}`
    const subExist = new Set(existingSub.map(s => subKey(s.pattern, s.mode, s.replacement, s.caseSensitive)))
    // Names import as CONTACTS, so the "already exists" check must look in the
    // contacts store (by name), not highlights — otherwise the same names are
    // offered every re-import with no EXISTS flag (the append-apply already
    // skips them, but the preview never said so).
    const contactExist = new Set(loadContacts(character).map(c => c.name.toLowerCase()))

    const dH = new Set<number>(); r.highlights.forEach((h, i) => { if (hlExist.has(hlContentKey(h.pattern, h.scope, h.caseSensitive))) dH.add(i) })
    const dT = new Set<number>(); r.triggers  .forEach((t, i) => { if (trExist.has(trContentKey(t.pattern, t.caseSensitive))) dT.add(i) })
    const dM = new Set<number>(); r.macros    .forEach((m, i) => { if (m.key && maExist.has(m.key.toLowerCase())) dM.add(i) })
    const dA = new Set<number>(); r.aliases   .forEach((a, i) => { if (a.input && alExist.has(a.input.toLowerCase())) dA.add(i) })
    const dMu = new Set<number>(); (r.mutes ?? []).forEach((m, i) => { if (muExist.has(muKey(m.pattern, m.matchType, 'line', m.caseSensitive))) dMu.add(i) })
    const dSub = new Set<number>(); (r.substitutes ?? []).forEach((s, i) => { if (subExist.has(subKey(s.pattern, s.matchType, s.replacement, s.caseSensitive))) dSub.add(i) })
    const dC = new Set<number>(); r.names.forEach((n, i) => { if (contactExist.has(n.pattern.toLowerCase())) dC.add(i) })
    setDupH(dH); setDupT(dT); setDupM(dM); setDupA(dA); setDupMu(dMu); setDupSub(dSub); setDupC(dC)

    // Pre-select all ready/partial items, INCLUDING duplicates. (Earlier
    // draft auto-unchecked duplicates here, but that broke Replace merge:
    // if the user switched to Replace, the unchecked duplicates would be
    // wiped from their profile along with everything else, leaving them
    // with neither the imported version nor their original. Better to
    // ship everything checked by default — duplicates are visually
    // flagged with the EXISTS badge, the "Hide items already in this
    // profile" toggle declutters the view, and append-time dedup silently
    // skips them with a count reported on the done screen.)
    setSelH(new Set(r.highlights.map((h, i) => h.status !== 'unsupported' ? i : -1).filter(i => i >= 0)))
    setSelM(new Set(r.macros    .map((m, i) => m.status !== 'unsupported' ? i : -1).filter(i => i >= 0)))
    setSelA(new Set(r.aliases   .map((a, i) => a.status !== 'unsupported' ? i : -1).filter(i => i >= 0)))
    setSelT(new Set(r.triggers  .map((t, i) => t.status !== 'unsupported' ? i : -1).filter(i => i >= 0)))
    setSelMu(new Set((r.mutes ?? []).map((m, i) => m.status !== 'unsupported' ? i : -1).filter(i => i >= 0)))
    setSelSub(new Set((r.substitutes ?? []).map((s, i) => s.status !== 'unsupported' ? i : -1).filter(i => i >= 0)))
    setSelC(allIndices(r.names.length))
    // Pre-select theme import if presets were found
    setSelTheme(!!(r.themeVars && Object.keys(r.themeVars).length > 0))
    // Pre-select layout import if the file carries a layout block.
    setSelLayout(!!r.nativeLayout)
    // Default preview tab to the FIRST type that has content (same order as the
    // tab bar). Must cover EVERY tab — a substitutes-only or mutes-only import
    // previously fell through to the empty 'triggers' tab ("No importable
    // triggers found") even though Substitutes/Mutes was the only real tab.
    const firstTab: PreviewTab =
      r.highlights.length > 0                              ? 'highlights' :
      r.names.length > 0                                   ? 'contacts'   :
      r.macros.length > 0                                  ? 'macros'     :
      r.aliases.length > 0                                 ? 'aliases'    :
      r.triggers.length > 0                                ? 'triggers'   :
      (r.mutes?.length ?? 0) > 0                           ? 'mutes'      :
      (r.substitutes?.length ?? 0) > 0                     ? 'substitutes':
      (r.themeVars && Object.keys(r.themeVars).length > 0) ? 'theme'      :
                                                             'highlights'
    setPreviewTab(firstTab)
    setStep('preview')
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function doImport() {
    if (!result) return
    // B124 (v0.8.7): for Lichborne→Lichborne imports the parser emits
    // `nativeRules` containing the full HighlightRule/TriggerRule/MacroRule/
    // AliasRule objects (with fresh ids), index-aligned with the
    // ImportCandidate arrays. Prefer those over the mapper output so we
    // don't silently strip fields the ImportCandidate intermediate doesn't
    // model (bold/glow, gates/oneShot/watchStream/cooldownSeconds/echo
    // color/action ordering, groupIds/allGroups/name/enabled on every rule
    // type). Other parsers leave nativeRules undefined → mapper path runs
    // unchanged. Selection filtering uses the same indices since the
    // parser builds both arrays in lockstep.
    const native = result.nativeRules
    const mapped: MappedRules = native
      ? {
          highlights: (native.highlights ?? []).filter((_, i) => selH.has(i)) as HighlightRule[],
          triggers:   (native.triggers   ?? []).filter((_, i) => selT.has(i)) as TriggerRule[],
          macros:     (native.macros     ?? []).filter((_, i) => selM.has(i)) as MacroRule[],
          aliases:    (native.aliases    ?? []).filter((_, i) => selA.has(i)) as AliasRule[],
        }
      : mapImportResult(result, selH, selM, selA, selT)

    // v0.11.1 (Wrayth all-sets): de-dupe the incoming macros by key binding,
    // first-wins. Wrayth's 10 macro sets can bind the same key (e.g. F1 in
    // set 1 and set 2); the parser flags later ones `partial`, but if the
    // user leaves both checked we must still persist only ONE binding per key
    // (Lichborne has a single keybinding set). This guards both merge modes —
    // the existing dedup below only compares against the EXISTING profile, not
    // within the batch.
    {
      const seenKeys = new Set<string>()
      mapped.macros = mapped.macros.filter(m => {
        const k = m.key.toLowerCase()
        if (!k) return true
        if (seenKeys.has(k)) return false
        seenKeys.add(k)
        return true
      })
    }

    // F29 follow-up: dedup against existing entries on append merge so a
    // re-import (or an import into a profile that already has the seeded
    // defaults like Ctrl+Enter → {RepeatLast}) doesn't pile up duplicates.
    // Per-type dedup keys:
    //   - Highlights/Triggers: by id (UUID — same rule from the same
    //     export). Pattern-match would be wrong since users legitimately
    //     have multiple rules with the same pattern but different colors.
    //   - Macros: by id OR key binding (one Ctrl+Enter per character).
    //   - Aliases: by id OR input (one "hunt" alias makes sense).
    //   - Native (groups/modes/contacts/contact templates): handled below
    //     with their own dedup, see further down.
    // Replace merge bypasses dedup — the user explicitly opted to wipe and
    // overwrite, and we should honor that.
    let skipped = { highlights: 0, triggers: 0, macros: 0, aliases: 0 }
    let toSave = mapped
    // B127 (Jaded, v0.8.9): EVERY save call below is now gated on
    // `mapped[type].length > 0`. The bug: a Wrayth import (which produces
    // zero triggers / zero aliases — Wrayth's XML format doesn't carry
    // them) was wiping the user's previously-imported Genie triggers /
    // aliases on Replace mode, because the save call ran with an empty
    // array. Append mode was also implicated when the user deselected a
    // category but the file had data for it. Per-type guards make
    // BOTH modes safe: an import only touches categories where it has
    // selected content. Replace mode now means "replace the categories
    // I'm importing, not wipe everything else" — which is what every
    // tester intuitively expected.
    if (merge === 'append') {
      const existingHl = loadHighlights(character)
      const existingTr = loadTriggers(character)
      const existingMa = loadMacros(character)
      const existingAl = loadAliases(character)
      // Match the preview's content-based duplicate semantics so the
      // "skipped N already present" message reflects what the user
      // already saw flagged in the preview. mapper.ts assigns fresh
      // ids on every import (nanoid), so id-based dedup wouldn't
      // catch anything for highlights/triggers anyway.
      const hlExist = new Set(existingHl.map(h => hlContentKey(h.pattern, h.scope, h.caseSensitive)))
      const trExist = new Set(existingTr.map(t => trContentKey(t.pattern, t.caseSensitive)))
      const maKeys = new Set(existingMa.map(r => r.key.toLowerCase()).filter(Boolean))
      const alIn   = new Set(existingAl.map(r => r.input.toLowerCase()).filter(Boolean))

      const keepHl = mapped.highlights.filter(r => !hlExist.has(hlContentKey(r.pattern, r.scope, r.caseSensitive)))
      const keepTr = mapped.triggers  .filter(r => !trExist.has(trContentKey(r.pattern, r.caseSensitive)))
      const keepMa = mapped.macros    .filter(r => !maKeys.has(r.key.toLowerCase()))
      const keepAl = mapped.aliases   .filter(r => !alIn.has(r.input.toLowerCase()))

      skipped = {
        highlights: mapped.highlights.length - keepHl.length,
        triggers:   mapped.triggers.length   - keepTr.length,
        macros:     mapped.macros.length     - keepMa.length,
        aliases:    mapped.aliases.length    - keepAl.length,
      }
      toSave = { highlights: keepHl, triggers: keepTr, macros: keepMa, aliases: keepAl }

      // Per-type guards (B127): skip the save entirely when the import has
      // nothing in that category. Even though `[...existing, ...[]]` is
      // a mathematical no-op, skipping the save call removes any chance
      // of a defensive bug in load/save round-tripping wiping the data.
      if (mapped.highlights.length > 0) saveHighlights(character, [...existingHl, ...keepHl])
      if (mapped.macros.length     > 0) saveMacros    (character, [...existingMa, ...keepMa])
      if (mapped.aliases.length    > 0) saveAliases   (character, [...existingAl, ...keepAl])
      if (mapped.triggers.length   > 0) saveTriggers  (character, [...existingTr, ...keepTr])
    } else {
      // Per-type guards (B127): Replace mode now only replaces categories
      // that actually have incoming data. Wrayth → Replace no longer wipes
      // your Genie triggers because Wrayth has zero triggers to import.
      if (mapped.highlights.length > 0) saveHighlights(character, mapped.highlights)
      if (mapped.macros.length     > 0) saveMacros    (character, mapped.macros)
      if (mapped.aliases.length    > 0) saveAliases   (character, mapped.aliases)
      if (mapped.triggers.length   > 0) saveTriggers  (character, mapped.triggers)
    }

    // Mutes (DESIGN.md §31): applied outside mapImportResult (which only covers
    // the 4 core rule types). Same append-dedup / replace semantics, gated on
    // having selected content (B127).
    const selectedMutes = (result.mutes ?? []).filter((m, i) => selMu.has(i) && m.status !== 'unsupported').map(mapMute)
    if (selectedMutes.length > 0) {
      const muKey = (m: { pattern: string; mode: string; scope: string; caseSensitive: boolean }) =>
        `${m.caseSensitive ? m.pattern : m.pattern.toLowerCase()}|${m.mode}|${m.scope}|${m.caseSensitive ? 1 : 0}`
      if (merge === 'append') {
        const existingMu = loadMutes(character)
        const muExist = new Set(existingMu.map(muKey))
        const keepMu = selectedMutes.filter(m => !muExist.has(muKey(m)))
        if (keepMu.length > 0) saveMutes(character, [...existingMu, ...keepMu])
      } else {
        saveMutes(character, selectedMutes)
      }
    }

    // Substitutes (DESIGN.md §31): same apply shape as mutes.
    const selectedSubs = (result.substitutes ?? []).filter((s, i) => selSub.has(i) && s.status !== 'unsupported').map(mapSubstitute)
    if (selectedSubs.length > 0) {
      const subKey = (s: { pattern: string; mode: string; replacement: string; caseSensitive: boolean }) =>
        `${s.caseSensitive ? s.pattern : s.pattern.toLowerCase()}|${s.mode}|${s.replacement}|${s.caseSensitive ? 1 : 0}`
      if (merge === 'append') {
        const existingSub = loadSubstitutes(character)
        const subExist = new Set(existingSub.map(subKey))
        const keepSub = selectedSubs.filter(s => !subExist.has(subKey(s)))
        if (keepSub.length > 0) saveSubstitutes(character, [...existingSub, ...keepSub])
      } else {
        saveSubstitutes(character, selectedSubs)
      }
    }

    // F29: Lichborne-native data (groups / modes / contacts / contact
    // templates). Bulk apply, no per-item selection — the user can edit
    // individual items in their respective panels post-import. Append
    // merge de-dupes by id; replace merge overwrites the whole list.
    // B127 (Jaded, v0.8.9): same per-type guard pattern as the rules
    // block above — only save a category when the import actually has
    // data for it. The outer `result.nativeX && Array.isArray(...)`
    // check passes for an EMPTY array too (empty arrays are truthy and
    // pass Array.isArray), so a Lichborne F29 export from a character
    // with no groups would have hit Replace mode and wiped the
    // recipient's groups. Adding `.length > 0` to each block stops
    // that.
    if (result.nativeGroups && Array.isArray(result.nativeGroups) && result.nativeGroups.length > 0) {
      const incoming = result.nativeGroups as RuleGroup[]
      if (merge === 'append') {
        const existing = loadGroups(character)
        const seen = new Set(existing.map(g => g.id))
        saveGroups(character, [...existing, ...incoming.filter(g => !seen.has(g.id))])
      } else {
        saveGroups(character, incoming)
      }
    }
    if (result.nativeModes && Array.isArray(result.nativeModes) && result.nativeModes.length > 0) {
      const incoming = result.nativeModes as GameMode[]
      if (merge === 'append') {
        const existing = loadModes(character)
        const seen = new Set(existing.map(m => m.id))
        saveModes(character, [...existing, ...incoming.filter(m => !seen.has(m.id))])
      } else {
        saveModes(character, incoming)
      }
    }
    if (result.nativeContactTemplates && Array.isArray(result.nativeContactTemplates) && result.nativeContactTemplates.length > 0) {
      const incoming = result.nativeContactTemplates as ContactTemplate[]
      if (merge === 'append') {
        const existing = loadContactTemplates(character)
        const seen = new Set(existing.map(t => t.id))
        saveContactTemplates(character, [...existing, ...incoming.filter(t => !seen.has(t.id))])
      } else {
        saveContactTemplates(character, incoming)
      }
    }
    if (result.nativeContacts && Array.isArray(result.nativeContacts) && result.nativeContacts.length > 0) {
      const incoming = result.nativeContacts as Contact[]
      if (merge === 'append') {
        const existing = loadContacts(character)
        const seen = new Set(existing.map(c => c.name.toLowerCase()))
        saveContacts(character, [...existing, ...incoming.filter(c => !seen.has(c.name.toLowerCase()))])
      } else {
        saveContacts(character, incoming)
      }
    }

    // F29-layout (v0.8.5): apply panel layout snapshot if the user opted
    // in. Writes each present key back to localStorage; missing keys mean
    // "leave the existing value alone." panelFontSizes goes onto the
    // settings object (where it lives at rest). GameWindow reads layout
    // from these keys on mount, so the changes take effect on the next
    // reconnect / character re-mount (the done screen notes this).
    if (selLayout && result.nativeLayout && typeof result.nativeLayout === 'object') {
      const layout = result.nativeLayout as Record<string, unknown>
      const k = (suffix: string) => scopedKey(character, suffix)
      const writeBool = (suffix: string) => {
        const v = layout[suffix]
        if (typeof v === 'boolean') localStorage.setItem(k(suffix), v ? '1' : '0')
      }
      const writeStr = (suffix: string) => {
        const v = layout[suffix]
        if (typeof v === 'string') localStorage.setItem(k(suffix), v)
      }
      const writeNum = (suffix: string) => {
        const v = layout[suffix]
        if (typeof v === 'number' && isFinite(v)) localStorage.setItem(k(suffix), String(v))
      }
      const writeJSON = (suffix: string) => {
        const v = layout[suffix]
        if (Array.isArray(v)) localStorage.setItem(k(suffix), JSON.stringify(v))
      }
      writeBool('mainTopAdded'); writeBool('topAdded'); writeBool('midAdded'); writeBool('bottomAdded')
      writeJSON('mainTopTabs');  writeJSON('topTabs');  writeJSON('midTabs');  writeJSON('bottomTabs')
      writeStr('mainTopActiveId'); writeStr('topActiveId'); writeStr('midActiveId'); writeStr('bottomActiveId')
      writeNum('mainTopHeight'); writeNum('topHeight'); writeNum('midHeight')
      writeNum('panelWidth')
      // panelFontSizes goes onto the settings object — read, merge, save.
      const fontSizes = layout.panelFontSizes
      if (fontSizes && typeof fontSizes === 'object' && !Array.isArray(fontSizes)) {
        const settings = loadSettings(character)
        const merged = { ...settings, panelFontSizes: { ...(settings.panelFontSizes ?? {}), ...(fontSizes as Record<string, number>) } }
        saveSettings(character, merged)
      }
    }

    // Import name highlights as Contacts. v0.11.1 (Wrayth): each unique name
    // color becomes a reusable contact template named `colorNN` (the parser
    // stamps `templateName` per name). Group selected names by templateName,
    // find-or-create the template (by name, reusing an existing same-named
    // one so re-imports don't pile up duplicates), and assign each new
    // contact's templateId. Templates go through saveContactTemplates here,
    // NOT the nativeContactTemplates path (which id-dedups — wrong for these
    // freshly-generated ids).
    if (selC.size > 0) {
      const existingContacts = loadContacts(character)
      const existingNames = new Set(existingContacts.map(c => c.name.toLowerCase()))

      const existingTemplates = loadContactTemplates(character)
      const templatesByName = new Map(existingTemplates.map(t => [t.name.toLowerCase(), t]))
      const newTemplates: ContactTemplate[] = []

      const ensureTemplate = (name: string, textColor: string | null): string | null => {
        const key = name.toLowerCase()
        const found = templatesByName.get(key)
        if (found) return found.id
        const tpl: ContactTemplate = {
          id:         crypto.randomUUID(),
          name,
          textColor:  textColor || '#C8C8C8',
          bgColor:    'transparent',
          bold:       false,
          tagText:    '',
          tagColor:   textColor || '#C8C8C8',
          tagBgColor: 'transparent',
          groupIds:   [],
          allGroups:  true,
        }
        templatesByName.set(key, tpl)
        newTemplates.push(tpl)
        return tpl.id
      }

      const newContacts: Contact[] = []
      for (const i of selC) {
        const n = result.names[i]
        if (!n || existingNames.has(n.pattern.toLowerCase())) continue
        const templateId = n.templateName ? ensureTemplate(n.templateName, n.textColor) : null
        newContacts.push({
          id:         crypto.randomUUID(),
          name:       n.pattern,
          templateId,
          guild:      'Unknown',
          circle:     '',
          notes:      '',
          lastSeen:   null,
          lastRoom:   null,
        })
      }
      if (newTemplates.length > 0) {
        saveContactTemplates(character, [...existingTemplates, ...newTemplates])
      }
      if (newContacts.length > 0) {
        saveContacts(character, [...existingContacts, ...newContacts])
      }
    }

    // Create custom theme from presets if selected
    if (selTheme && result.themeVars && Object.keys(result.themeVars).length > 0) {
      const sourceName = source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Import'
      const classicTheme = THEMES.find(t => t.id === 'classic') ?? THEMES[0]
      const newTheme = createCustomThemeFrom(classicTheme, `Imported from ${sourceName}`)
      Object.assign(newTheme.vars, result.themeVars)
      saveMyThemes([...loadMyThemes(), newTheme])
      onThemeSaved?.(newTheme.id)
    }

    const parts: string[] = []
    if (toSave.highlights.length) parts.push(`${toSave.highlights.length} highlights`)
    if (selC.size > 0)            parts.push(`${selC.size} contacts`)
    if (toSave.macros.length)     parts.push(`${toSave.macros.length} macros`)
    if (toSave.aliases.length)    parts.push(`${toSave.aliases.length} aliases`)
    if (toSave.triggers.length)   parts.push(`${toSave.triggers.length} triggers`)
    if (selectedMutes.length)     parts.push(`${selectedMutes.length} mutes`)
    if (selectedSubs.length)      parts.push(`${selectedSubs.length} substitutes`)
    // F29: native counts from a Lichborne export
    if (result.nativeGroups?.length)           parts.push(`${result.nativeGroups.length} groups`)
    if (result.nativeModes?.length)            parts.push(`${result.nativeModes.length} modes`)
    if (result.nativeContacts?.length)         parts.push(`${result.nativeContacts.length} contacts`)
    if (result.nativeContactTemplates?.length) parts.push(`${result.nativeContactTemplates.length} contact templates`)
    if (selTheme && result.themeVars && Object.keys(result.themeVars).length > 0)
      parts.push('1 theme')
    if (selLayout && result.nativeLayout) parts.push('panel layout (reconnect to apply)')

    // F29 follow-up: report duplicates that were skipped so the user
    // knows nothing was silently dropped without a reason.
    const skipTotal = skipped.highlights + skipped.triggers + skipped.macros + skipped.aliases
    let statsMsg = parts.join(', ') || 'nothing'
    if (skipTotal > 0) {
      const skipParts: string[] = []
      if (skipped.highlights) skipParts.push(`${skipped.highlights} highlights`)
      if (skipped.triggers)   skipParts.push(`${skipped.triggers} triggers`)
      if (skipped.macros)     skipParts.push(`${skipped.macros} macros`)
      if (skipped.aliases)    skipParts.push(`${skipped.aliases} aliases`)
      statsMsg += ` (skipped ${skipParts.join(', ')} already present)`
    }

    setDoneStats(statsMsg)
    setStep('done')
    onSaved?.()
  }

  // ── Selection helpers ───────────────────────────────────────────────────────

  function toggleSel(set: Set<number>, idx: number, setter: (s: Set<number>) => void) {
    const next = new Set(set)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setter(next)
  }

  function selectAllTab(tab: PreviewTab, all: boolean) {
    if (!result) return
    // "Select all" selects only SELECTABLE (non-unsupported) rows — same as the
    // default selection — so it can't pull in `unsupported` items (whose
    // checkboxes are disabled), e.g. the Frostbite mind-state subs deliberately
    // held back. (Was `allIndices(length)`, which selected unsupported too.)
    const sel = (items: { status: string }[]) =>
      new Set(items.map((it, i) => it.status !== 'unsupported' ? i : -1).filter(i => i >= 0))
    if (tab === 'highlights') setSelH(all ? sel(result.highlights) : new Set())
    if (tab === 'macros')     setSelM(all ? sel(result.macros)     : new Set())
    if (tab === 'aliases')    setSelA(all ? sel(result.aliases)    : new Set())
    if (tab === 'triggers')   setSelT(all ? sel(result.triggers)   : new Set())
    if (tab === 'mutes')      setSelMu(all ? sel(result.mutes ?? []) : new Set())
    if (tab === 'substitutes') setSelSub(all ? sel(result.substitutes ?? []) : new Set())
    if (tab === 'contacts')   setSelC(all ? sel(result.names)      : new Set())
    // 'theme' tab uses selTheme toggle — not handled here
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const totalSelected = selH.size + selM.size + selA.size + selT.size + selMu.size + selSub.size + selC.size

  function renderStepDots() {
    const steps: Array<{ id: Step; label: string }> = [
      { id: 'source',  label: '1' },
      { id: 'preview', label: '2' },
      { id: 'confirm', label: '3' },
    ]
    const order: Step[] = ['source', 'preview', 'confirm', 'done']
    const cur = order.indexOf(step)
    return (
      <div className="iw-step-indicator">
        {steps.map((s, i) => {
          const idx = order.indexOf(s.id)
          const active = step === s.id
          const done   = cur > idx
          // A keyed Fragment: the bare `<>` in this map carried no key, so
          // React warned on every render of the header.
          return (
            <Fragment key={s.id}>
              {i > 0 && <div className="iw-step-sep" />}
              <div
                className={`iw-step-dot${active ? ' iw-step-dot--active' : done ? ' iw-step-dot--done' : ''}`}
              >
                {done ? '✓' : s.label}
              </div>
            </Fragment>
          )
        })}
      </div>
    )
  }

  function renderStatusBadge(status: string, note?: string) {
    return (
      <span className={`iw-status-badge iw-status-badge--${status}`} title={note}>
        {status === 'partial' ? 'partial' : status === 'unsupported' ? 'skip' : 'ready'}
      </span>
    )
  }

  // ── Step 1: Source ──────────────────────────────────────────────────────────

  const hasAnyFile = Object.keys(fileTexts).length > 0

  function renderStep1() {
    const cards: Array<{ id: ImportSource; name: string; desc: string }> = [
      { id: 'wrayth',    name: 'Wrayth',    desc: 'Single XML settings file' },
      { id: 'genie',     name: 'Genie',     desc: 'Config folder (.cfg files)' },
      { id: 'frostbite', name: 'Frostbite', desc: 'Profile folder (.ini files)' },
    ]

    const slots: FileSlot[] =
      source === 'genie'     ? GENIE_SLOTS :
      source === 'frostbite' ? FROSTBITE_SLOTS :
      source === 'wrayth'    ? [{ key: 'xml', label: 'settings.xml', hint: 'Wrayth XML export' }] :
      []

    return (
      <>
        <div className="iw-scope-notice">
          Lichborne imports <strong>display preferences</strong> — highlights, colors, key bindings, themes,
          and text rules (mutes &amp; substitutes). Variables and complex automation belong in Lich.
        </div>
        <div className="iw-source-grid">
          {cards.map(c => (
            <div
              key={c.id}
              className={`iw-source-card${source === c.id ? ' iw-source-card--selected' : ''}`}
              // B335: a clickable card was unreachable by Tab, although its
              // :focus-visible ring was already styled.
              {...pressable(() => {
                setSource(c.id)
                setFileTexts({})
                // B131 (v0.8.9): force merge to 'append' when switching
                // to Lichborne source — Replace mode isn't offered for
                // self-imports, but the wizard's `merge` state could
                // carry over from a prior legacy-client selection.
                if (c.id === 'lichborne') setMerge('append')
              }, { selected: source === c.id })}
            >
              <div className="iw-source-card-name">{c.name}</div>
              <div className="iw-source-card-desc">{c.desc}</div>
            </div>
          ))}
        </div>

        {source && (
          <div className="iw-drop-section">
            <div className="iw-drop-label">Load files</div>
            <div className="iw-file-rows">
              {slots.map(slot => (
                <div key={slot.key} className="iw-file-row">
                  <div className="iw-file-row-name">
                    {slot.label}<br /><span>{slot.hint}</span>
                  </div>
                  <div className="iw-file-input-wrap">
                    {slot.key in fileTexts
                      ? <span className="iw-file-chosen">✓ loaded</span>
                      : <span className="iw-file-none">Not loaded</span>
                    }
                    <button
                      type="button"
                      className="ui-btn ui-btn--sm"
                      onClick={() => fileInputRefs.current[slot.key]?.click()}
                    >
                      Browse…
                    </button>
                    <input
                      type="file"
                      style={{ display: 'none' }}
                      accept=".cfg,.ini,.xml,.yaml,.yml"
                      ref={el => { fileInputRefs.current[slot.key] = el }}
                      onChange={e => handleFileChange(slot.key, e.target.files?.[0])}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Step 2: Preview ─────────────────────────────────────────────────────────

  function renderStep2() {
    if (!result) return null

    const themeVarCount = result.themeVars ? Object.keys(result.themeVars).length : 0
    const allTabs: Array<{ id: PreviewTab; label: string; count: number }> = [
      { id: 'highlights', label: 'Highlights',   count: result.highlights.length },
      { id: 'contacts',   label: 'Contacts',     count: result.names.length      },
      { id: 'macros',     label: 'Macros',        count: result.macros.length     },
      { id: 'aliases',    label: 'Aliases',       count: result.aliases.length    },
      { id: 'triggers',   label: 'Triggers',      count: result.triggers.length   },
      { id: 'mutes',      label: 'Mutes',         count: (result.mutes ?? []).length },
      { id: 'substitutes', label: 'Substitutes',  count: (result.substitutes ?? []).length },
      { id: 'theme',      label: 'Theme colors',  count: themeVarCount            },
    ]
    const tabs = allTabs.filter(t => t.count > 0)

    return (
      <>
        <div className="ui-tabs iw-preview-tabs" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={previewTab === t.id}
              className={`ui-tab${previewTab === t.id ? ' ui-tab--active' : ''}`}
              onClick={() => setPreviewTab(t.id)}
            >
              {t.label}
              <span className="iw-preview-tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="iw-select-bar">
          {previewTab === 'theme' ? (
            <label className="iw-select-bar-toggle">
              <input
                type="checkbox"
                checked={selTheme}
                onChange={e => setSelTheme(e.target.checked)}
                style={{ accentColor: 'var(--accent)', marginRight: 6 }}
              />
              Create "Imported from {source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Import'}" custom theme with these colors
            </label>
          ) : (
            <>
              <button className="iw-select-bar-btn" onClick={() => selectAllTab(previewTab, true)}>Select all</button>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>·</span>
              <button className="iw-select-bar-btn" onClick={() => selectAllTab(previewTab, false)}>Deselect all</button>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginLeft: 12 }}>·</span>
              <label className="iw-select-bar-toggle" style={{ marginLeft: 12, fontSize: '0.78rem' }}>
                <input
                  type="checkbox"
                  checked={hideExisting}
                  onChange={e => setHideExisting(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', marginRight: 6 }}
                />
                Hide items already in this profile
              </label>
            </>
          )}
        </div>

        {previewTab === 'highlights' && (
          result.highlights.length === 0
            ? <div className="iw-empty">No highlights found</div>
            : <table className="iw-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Pattern</th>
                    <th>Mode</th>
                    <th>Color</th>
                    <th>Sound</th>
                    <th>Group</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.highlights.map((h, i) => {
                    const isDup = dupH.has(i)
                    if (hideExisting && isDup) return null
                    return (
                      <tr key={i} className={`${h.status === 'unsupported' ? 'iw-row--unsupported' : ''}${isDup ? ' iw-row--exists' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selH.has(i)}
                            disabled={h.status === 'unsupported'}
                            onChange={() => toggleSel(selH, i, setSelH)}
                          />
                        </td>
                        <td>
                          <span
                            className="iw-hl-preview"
                            title={h.pattern}
                            style={{
                              color: h.textColor ?? undefined,
                              ...(h.bgColor && h.bgColor !== 'transparent' ? { background: h.bgColor } : {}),
                            }}
                          >
                            {h.pattern}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {h.matchType}{h.scope === 'line' ? ' · whole line' : ''}
                        </td>
                        <td>
                          <span className="iw-swatch-pair">
                            {h.textColor
                              ? <span className="iw-color-swatch" style={{ background: h.textColor }} title={`Text ${h.textColor}`} />
                              : <span className="iw-color-none">—</span>
                            }
                            {h.bgColor && h.bgColor !== 'transparent'
                              ? <span className="iw-color-swatch" style={{ background: h.bgColor }} title={`Background ${h.bgColor}`} />
                              : null
                            }
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }} title={h.soundFile}>
                          {h.soundFile
                            ? <span className="iw-sound-tag">🔊 {h.soundFile.split(/[\\/]/).pop()}</span>
                            : <span className="iw-color-none">—</span>
                          }
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{h.sourceClass ?? '—'}</td>
                        <td>{isDup ? <span className="iw-exists-badge" title="Already in your profile">EXISTS</span> : renderStatusBadge(h.status, h.statusNote)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        )}

        {previewTab === 'macros' && (
          result.macros.length === 0
            ? <div className="iw-empty">No macros found</div>
            : <table className="iw-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Key</th>
                    <th>Command(s)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.macros.map((m, i) => {
                    const isDup = dupM.has(i)
                    if (hideExisting && isDup) return null
                    return (
                      <tr key={i} className={`${m.status === 'unsupported' ? 'iw-row--unsupported' : ''}${isDup ? ' iw-row--exists' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selM.has(i)}
                            disabled={m.status === 'unsupported'}
                            onChange={() => toggleSel(selM, i, setSelM)}
                          />
                        </td>
                        <td style={{ fontFamily: 'var(--code-font-family)', fontSize: '0.78rem' }}>{m.key}</td>
                        <td><span className="iw-pattern" title={m.commands.join('; ')}>{m.commands.join('; ')}</span></td>
                        <td>{isDup ? <span className="iw-exists-badge" title="Already in your profile">EXISTS</span> : renderStatusBadge(m.status, m.statusNote)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        )}

        {previewTab === 'aliases' && (
          result.aliases.length === 0
            ? <div className="iw-empty">No aliases found</div>
            : <table className="iw-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Input</th>
                    <th>Command(s)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.aliases.map((a, i) => {
                    const isDup = dupA.has(i)
                    if (hideExisting && isDup) return null
                    return (
                      <tr key={i} className={`${a.status === 'unsupported' ? 'iw-row--unsupported' : ''}${isDup ? ' iw-row--exists' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selA.has(i)}
                            disabled={a.status === 'unsupported'}
                            onChange={() => toggleSel(selA, i, setSelA)}
                          />
                        </td>
                        <td style={{ fontFamily: 'var(--code-font-family)', fontSize: '0.78rem' }}>{a.input}</td>
                        <td><span className="iw-pattern" title={a.commands.join('; ')}>{a.commands.join('; ')}</span></td>
                        <td>{isDup ? <span className="iw-exists-badge" title="Already in your profile">EXISTS</span> : renderStatusBadge(a.status, a.statusNote)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        )}

        {previewTab === 'triggers' && (
          result.triggers.length === 0
            ? <div className="iw-empty">No importable triggers found</div>
            : <table className="iw-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Pattern</th>
                    <th>Action(s)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.triggers.map((t, i) => {
                    const isDup = dupT.has(i)
                    if (hideExisting && isDup) return null
                    return (
                      <tr key={i} className={`${t.status === 'unsupported' ? 'iw-row--unsupported' : ''}${isDup ? ' iw-row--exists' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selT.has(i)}
                            disabled={t.status === 'unsupported'}
                            onChange={() => toggleSel(selT, i, setSelT)}
                          />
                        </td>
                        <td><span className="iw-pattern" title={t.pattern}>{t.pattern}</span></td>
                        <td><span className="iw-pattern" title={t.commands.join('; ')}>{t.commands.join('; ')}</span></td>
                        <td>{isDup ? <span className="iw-exists-badge" title="Already in your profile">EXISTS</span> : renderStatusBadge(t.status, t.statusNote)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        )}

        {previewTab === 'mutes' && (
          (result.mutes ?? []).length === 0
            ? <div className="iw-empty">No mutes found</div>
            : <table className="iw-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Pattern (hides matching lines)</th>
                    <th>Mode</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.mutes ?? []).map((m, i) => {
                    const isDup = dupMu.has(i)
                    if (hideExisting && isDup) return null
                    return (
                      <tr key={i} className={`${m.status === 'unsupported' ? 'iw-row--unsupported' : ''}${isDup ? ' iw-row--exists' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selMu.has(i)}
                            disabled={m.status === 'unsupported'}
                            onChange={() => toggleSel(selMu, i, setSelMu)}
                          />
                        </td>
                        <td><span className="iw-pattern" title={m.pattern}>{m.pattern}</span></td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{m.matchType}</td>
                        <td>{isDup ? <span className="iw-exists-badge" title="Already in your profile">EXISTS</span> : renderStatusBadge(m.status, m.statusNote)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        )}

        {previewTab === 'substitutes' && (
          (result.substitutes ?? []).length === 0
            ? <div className="iw-empty">No substitutes found</div>
            : <table className="iw-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Find</th>
                    <th>Replace with</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.substitutes ?? []).map((s, i) => {
                    const isDup = dupSub.has(i)
                    if (hideExisting && isDup) return null
                    return (
                      <tr key={i} className={`${s.status === 'unsupported' ? 'iw-row--unsupported' : ''}${isDup ? ' iw-row--exists' : ''}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selSub.has(i)}
                            disabled={s.status === 'unsupported'}
                            onChange={() => toggleSel(selSub, i, setSelSub)}
                          />
                        </td>
                        <td><span className="iw-pattern" title={s.pattern}>{s.pattern}</span></td>
                        <td><span className="iw-pattern" title={s.replacement}>{s.replacement || <span className="iw-color-none">(removed)</span>}</span></td>
                        <td>{isDup ? <span className="iw-exists-badge" title="Already in your profile">EXISTS</span> : renderStatusBadge(s.status, s.statusNote)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
        )}

        {previewTab === 'contacts' && (
          result.names.length === 0
            ? <div className="iw-empty">No name highlights found</div>
            : <>
                <div className="iw-sub-notice" style={{ marginBottom: 8 }}>
                  Selected names are added to Contacts. Each unique color becomes a
                  reusable contact template named <code>colorNN</code> — rename it in the
                  Contacts panel (e.g. "Friends") and every contact using it updates.
                </div>
                <table className="iw-table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}></th>
                      <th>Name</th>
                      <th>Template</th>
                      <th>Text color</th>
                      <th>Background</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.names.map((n, i) => {
                      const isDup = dupC.has(i)
                      if (hideExisting && isDup) return null
                      return (
                      <tr key={i} className={isDup ? 'iw-row--exists' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selC.has(i)}
                            onChange={() => toggleSel(selC, i, setSelC)}
                          />
                        </td>
                        <td>{n.pattern}</td>
                        <td>{n.templateName ?? <span className="iw-color-none">—</span>}</td>
                        <td>
                          {n.textColor
                            ? <span className="iw-color-swatch" style={{ background: n.textColor }} title={n.textColor} />
                            : <span className="iw-color-none">—</span>
                          }
                        </td>
                        <td>
                          {n.bgColor
                            ? <span className="iw-color-swatch" style={{ background: n.bgColor }} title={n.bgColor} />
                            : <span className="iw-color-none">—</span>
                          }
                        </td>
                        <td>{isDup
                          ? <span className="iw-exists-badge" title="Already in your Contacts">EXISTS</span>
                          : renderStatusBadge(n.status, n.statusNote)}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
        )}

        {previewTab === 'theme' && (
          result.themeVars && Object.keys(result.themeVars).length > 0
            ? <table className="iw-table">
                <thead>
                  <tr>
                    <th>Element</th>
                    <th>Color</th>
                    <th>CSS variable</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.themeVars).map(([cssVar, color]) => (
                    <tr key={cssVar}>
                      <td style={{ fontSize: '0.82rem' }}>
                        {THEME_VAR_LABELS[cssVar] ?? cssVar}
                      </td>
                      <td>
                        {color === 'transparent'
                          ? <span className="iw-color-none">transparent</span>
                          : <span className="iw-color-swatch" style={{ background: color }} title={color} />
                        }
                        <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--code-font-family)' }}>
                          {color}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--code-font-family)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {cssVar}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            : <div className="iw-empty">No theme colors found in presets.cfg</div>
        )}

        {(result.variablesCount ?? 0) > 0 && (
          <div className="iw-sub-notice">
            {result.variablesCount} variable{result.variablesCount !== 1 ? 's' : ''} found —
            these live in Lich's Vars system. Reference them in your scripts, not the client.
          </div>
        )}
      </>
    )
  }

  // ── Step 3: Confirm ─────────────────────────────────────────────────────────

  function renderStep3() {
    return (
      <>
        <table className="iw-summary-table">
          <tbody>
            <tr><td>Highlights</td><td><span className="iw-summary-count">{selH.size}</span></td></tr>
            <tr><td>Contacts</td>  <td><span className="iw-summary-count">{selC.size}</span></td></tr>
            <tr><td>Macros</td>    <td><span className="iw-summary-count">{selM.size}</span></td></tr>
            <tr><td>Aliases</td>   <td><span className="iw-summary-count">{selA.size}</span></td></tr>
            <tr><td>Triggers</td>  <td><span className="iw-summary-count">{selT.size}</span></td></tr>
            <tr><td>Mutes</td>     <td><span className="iw-summary-count">{selMu.size}</span></td></tr>
            <tr><td>Substitutes</td><td><span className="iw-summary-count">{selSub.size}</span></td></tr>
            {result?.themeVars && Object.keys(result.themeVars).length > 0 && (
              <tr>
                <td>Theme</td>
                <td>
                  <span className="iw-summary-count">
                    {selTheme
                      ? `"Imported from ${source ? source.charAt(0).toUpperCase() + source.slice(1) : 'Import'}" (${Object.keys(result.themeVars).length} vars)`
                      : 'skipped'}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {(() => {
          const lichRows: Array<{ label: string; count: number; note: string }> = []
          if ((result?.variablesCount ?? 0) > 0)
            lichRows.push({ label: 'Variables', count: result!.variablesCount!, note: 'These live in Lich\'s Vars system' })
          if ((result?.scriptsCount ?? 0) > 0)
            lichRows.push({ label: 'Lich scripts', count: result!.scriptsCount!, note: 'Run in Lich, not the client' })
          if ((result?.alertHighlightCount ?? 0) > 0)
            lichRows.push({ label: 'Alert highlights', count: result!.alertHighlightCount!, note: 'Health/stun thresholds — no Lichborne equivalent yet' })
          if ((result?.quickButtonCount ?? 0) > 0)
            lichRows.push({ label: 'Quick buttons', count: result!.quickButtonCount!, note: 'No quick-button bar in Lichborne — recreate as macros or Lich aliases' })

          if (lichRows.length === 0) return null
          return (
            <div className="iw-lich-section">
              <div className="iw-lich-section-title">These belong in Lich</div>
              <table className="iw-summary-table iw-summary-table--lich">
                <tbody>
                  {lichRows.map(row => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td><span className="iw-summary-count iw-summary-count--lich">{row.count}</span></td>
                      <td className="iw-lich-note">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}

        <div className="iw-merge-label">Merge strategy</div>
        <div className="iw-merge-options">
          <label className="iw-merge-option">
            <input type="radio" name="merge" value="append" checked={merge === 'append'} onChange={() => setMerge('append')} />
            <div>
              <div className="iw-merge-option-title">Append</div>
              <div className="iw-merge-option-desc">
                {source === 'lichborne'
                  ? 'Add imported rules alongside your existing ones; duplicates (same pattern + scope + case for highlights/triggers, same key for macros, same input for aliases) are skipped automatically.'
                  : 'Add imported rules alongside your existing ones'}
              </div>
            </div>
          </label>
          {/* B131 (Jaded → Sekmeht, v0.8.9): Replace mode is hidden for
              Lichborne→Lichborne imports. Self-imports are "merge my
              setup from another character" — Replace mode (wipe my
              existing rules of each type the import has data for) is
              never what users want for that workflow, and the surprise
              factor when it does wipe is high. Users who genuinely want
              to start fresh can delete their rules manually first, then
              import via Append. Legacy clients (Wrayth/Genie/Frostbite)
              still show Replace because "wipe my stuff and use the
              clean import as my new baseline" is a legitimate workflow
              when adopting a fresh config from another tool. */}
          {source !== 'lichborne' && (
            <label className="iw-merge-option">
              <input type="radio" name="merge" value="replace" checked={merge === 'replace'} onChange={() => setMerge('replace')} />
              <div>
                <div className="iw-merge-option-title">Replace all</div>
                <div className="iw-merge-option-desc">For each category the import has data for, delete your existing rules of that type and replace with the import. Categories the import doesn't touch are left alone.</div>
              </div>
            </label>
          )}
        </div>

        {/* F29-layout (v0.8.5): opt-in for the panel layout snapshot.
            Only shown when the file actually carries one. Append-vs-replace
            above is for RULES; layout is always overwritten when checked
            (there's no append-mode for panel state), so the wording calls
            that out. The user has to reconnect / re-mount the character
            for the new layout to take effect, also noted. */}
        {result?.nativeLayout && (
          <label className="iw-select-bar-toggle" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={selLayout}
              onChange={e => setSelLayout(e.target.checked)}
              style={{ accentColor: 'var(--accent)', marginRight: 6 }}
            />
            Apply imported panel layout (zones, sizes, font overrides) — overwrites your current layout and takes effect after reconnect.
          </label>
        )}
      </>
    )
  }

  // ── Step done ────────────────────────────────────────────────────────────────

  function renderDone() {
    return (
      <div className="iw-success">
        <div className="iw-success-icon">✓</div>
        <div className="iw-success-title">Import complete</div>
        <div className="iw-success-desc">Imported {doneStats}. All rules are active immediately.</div>
      </div>
    )
  }

  // ── Footer ───────────────────────────────────────────────────────────────────

  function renderFooter() {
    // Footer rail order (UX standard #10): info …spacer… [Cancel/Back] [Primary].
    if (step === 'done') {
      return (
        <div className="ui-modal-foot">
          <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>Close</button>
        </div>
      )
    }
    if (step === 'source') {
      return (
        <div className="ui-modal-foot">
          <span className="iw-footer-info">
            {source ? `${Object.keys(fileTexts).length} file(s) loaded` : 'Select a client above'}
          </span>
          <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!source || !hasAnyFile}
            title={!source ? 'Pick the client you are importing from' : !hasAnyFile ? 'Load at least one file' : undefined}
            onClick={goToPreview}
          >
            Preview →
          </button>
        </div>
      )
    }
    if (step === 'preview') {
      const hasThemeVars = !!(result?.themeVars && Object.keys(result.themeVars).length > 0)
      const canContinue  = totalSelected > 0 || (selTheme && hasThemeVars)
      return (
        <div className="ui-modal-foot">
          <span className="iw-footer-info">
            {totalSelected - selC.size} rule{(totalSelected - selC.size) !== 1 ? 's' : ''}
            {selC.size > 0 ? `, ${selC.size} contact${selC.size !== 1 ? 's' : ''}` : ''}
            {selTheme && hasThemeVars ? ' + theme' : ''} selected
          </span>
          <button type="button" className="ui-btn" onClick={() => setStep('source')}>← Back</button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!canContinue}
            title={!canContinue ? 'Tick at least one item to import' : undefined}
            onClick={() => setStep('confirm')}
          >
            Confirm →
          </button>
        </div>
      )
    }
    if (step === 'confirm') {
      return (
        <div className="ui-modal-foot">
          <button type="button" className="ui-btn" onClick={() => setStep('preview')}>← Back</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={doImport}>
            Import
          </button>
        </div>
      )
    }
    return null
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  // B378: a backdrop click closes only when nothing would be lost — the first
  // step and the finished screen. It used to pass `step !== 'done'`, which is
  // backwards: a stray click dropped a preview or a confirm on the floor, and
  // the one screen with nothing left to lose ignored the click.
  const backdropCloses = step === 'source' || step === 'done'

  const modal = (
    <div
      className={`iw-backdrop${nested ? ' iw-backdrop--nested' : ''}`}
      {...backdropHandlers(() => onClose(), backdropCloses)}
    >
      <div
        ref={panelRef}
        className="iw-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >

        <div className="iw-header">
          <span className="iw-title" id={titleId}>Import from another client</span>
          {step !== 'done' && renderStepDots()}
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        <div className="iw-body">
          {step === 'source'  && renderStep1()}
          {step === 'preview' && renderStep2()}
          {step === 'confirm' && renderStep3()}
          {step === 'done'    && renderDone()}
        </div>

        {renderFooter()}

      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
