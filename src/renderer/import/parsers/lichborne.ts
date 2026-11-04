// v0.8.4 (F29): Lichborne-to-Lichborne import. Reads a YAML file produced
// by the Automations panel's Export button and surfaces its contents in
// the standard import wizard preview. Since the source data is already in
// our native shape (HighlightRule / TriggerRule / MacroRule / AliasRule
// objects), the parser does a near pass-through into ImportCandidate
// records — the wizard's preview UI uses ImportCandidate fields, so a
// thin wrapper around each rule keeps the existing preview logic working
// without a parallel UI path. Groups, modes, contacts, and contact
// templates aren't ImportCandidates (they're not "rules") and ride along
// in `nativeGroups` / `nativeModes` / `nativeContacts` /
// `nativeContactTemplates` on the result; the wizard's apply step writes
// them directly via the existing save functions.

import * as yaml from 'js-yaml'
import { nanoid } from 'nanoid'
import type {
  ImportHighlight, ImportMacro, ImportAlias, ImportTrigger, ImportResult,
} from '../types'
import type { HighlightRule } from '../../highlights'
import type { TriggerRule, TriggerAction } from '../../triggers'
import type { MacroRule, AliasRule } from '../../macros'
import { normalizeStreamId } from '../../../shared/streamAliases'

// File shape declared loosely — the rules arrays carry the full native
// HighlightRule / TriggerRule / MacroRule / AliasRule shape produced by
// AutomationsPanel's `buildAutomationsExport` (which calls loadHighlights
// etc., yielding the in-memory rule objects). The ImportCandidate
// build below reads the subset of fields it needs for the wizard preview;
// the nativeRules build (B124) carries the full objects through with
// fresh ids so the apply step can save them without going through the
// lossy ImportCandidate → mapper translation.
interface LichborneExportFile {
  formatVersion: number
  exportedFrom?: string
  exportedBy?: string
  exportedAt?: string
  highlights?: Partial<HighlightRule>[]
  triggers?:   Partial<TriggerRule>[]
  macros?:     Partial<MacroRule>[]
  aliases?:    Partial<AliasRule>[]
  groups?: unknown[]
  modes?: unknown[]
  contacts?: unknown[]
  contactTemplates?: unknown[]
  // v0.8.5: optional layout block. Absent in v1 exports, present in v2.
  // The importer applies any keys that ARE present; missing keys mean
  // "leave the importing character's existing value alone."
  layout?: {
    mainTopAdded?:    boolean
    topAdded?:        boolean
    midAdded?:        boolean
    bottomAdded?:     boolean
    mainTopTabs?:     unknown[]
    topTabs?:         unknown[]
    midTabs?:         unknown[]
    bottomTabs?:      unknown[]
    mainTopActiveId?: string
    topActiveId?:     string
    midActiveId?:     string
    bottomActiveId?:  string
    mainTopHeight?:   number
    topHeight?:       number
    midHeight?:       number
    panelWidth?:      number
    panelFontSizes?:  Record<string, number>
  }
}

export function parseLichborneYaml(text: string): ImportResult {
  let doc: LichborneExportFile
  try {
    const parsed = yaml.load(text)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('not an object')
    }
    doc = parsed as LichborneExportFile
  } catch (e) {
    return emptyResult(`Could not parse YAML: ${String(e)}`)
  }
  if (typeof doc.formatVersion !== 'number') {
    return emptyResult('Missing formatVersion — is this a Lichborne export file?')
  }
  if (doc.formatVersion > 2) {
    return emptyResult(`Export file format v${doc.formatVersion} is newer than this Lichborne supports — please update.`)
  }

  // ImportCandidate build — drives the wizard preview UI. Only the fields
  // the preview renders need to live here. Anything else round-trips via
  // nativeRules below.
  const highlights: ImportHighlight[] = (doc.highlights ?? []).map(h => ({
    kind: 'highlight',
    source: 'lichborne',
    status: 'ready',
    pattern: h.pattern ?? '',
    matchType: h.mode ?? 'text',
    caseSensitive: !!h.caseSensitive,
    scope: h.scope ?? 'match',
    textColor: h.style?.textColor ?? null,
    bgColor: h.style?.bgColor ?? null,
    ...(h.soundFile ? { soundFile: h.soundFile } : {}),
  }))

  const triggers: ImportTrigger[] = (doc.triggers ?? []).map(t => ({
    kind: 'trigger',
    source: 'lichborne',
    status: 'ready',
    pattern: t.pattern ?? '',
    matchType: t.mode ?? 'text',
    caseSensitive: !!t.caseSensitive,
    // ImportTrigger.commands is preview-only (the actual F29 import applies via
    // nativeRules, pitfall #42). A TriggerRule has no top-level `commands` field —
    // its commands live in `actions[]` as command-type actions — so derive them.
    commands: (t.actions ?? [])
      .filter(a => a.type === 'command')
      .map(a => a.command ?? '')
      .filter(c => c.length > 0),
    echoActions: [],
    varActions: [],
    logActions: [],
    soundFiles: [],
    hasFlash: false,
    hasBeep: false,
    droppedActions: [],
  }))

  const macros: ImportMacro[] = (doc.macros ?? []).map(m => ({
    kind: 'macro',
    source: 'lichborne',
    status: 'ready',
    key: m.key ?? '',
    commands: m.commands ?? [],
  }))

  const aliases: ImportAlias[] = (doc.aliases ?? []).map(a => ({
    kind: 'alias',
    source: 'lichborne',
    status: 'ready',
    input: a.input ?? '',
    commands: a.commands ?? [],
  }))

  // B124 (v0.8.7): nativeRules build — full rule objects with fresh ids,
  // index-aligned with the ImportCandidate arrays above. The apply step
  // in ImportWizard prefers these so bold/glow/groupIds/allGroups/name/
  // enabled/gates/oneShot/watchStream/cooldownSeconds/action ordering all
  // survive Lichborne→Lichborne round-trips. Ids are regenerated to avoid
  // collisions when the same export is imported twice or imported back
  // into the source character; nested action ids on triggers regenerate
  // too. Source-character ids are intentionally discarded.
  const nativeHighlights: HighlightRule[] = (doc.highlights ?? []).map(h => ({
    ...(h as HighlightRule),
    id: nanoid(),
  }))
  const nativeTriggers: TriggerRule[] = (doc.triggers ?? []).map(t => {
    const tr = t as TriggerRule
    // v0.8.10 (B135): a pre-v0.8.10 Lichborne export could carry
    // watchStream='conversations' (now plural-deprecated) or echo
    // actions with echoStream='conversations'/'talk'/'whispers'.
    // Normalize on import so the recipient's saved trigger references
    // the canonical 'conversation' id (or whatever the alias maps to)
    // instead of a panel id that no longer exists post-rename.
    return {
      ...tr,
      id: nanoid(),
      ...(tr.watchStream ? { watchStream: normalizeStreamId(tr.watchStream) as TriggerRule['watchStream'] } : {}),
      actions: (tr.actions ?? []).map((a: TriggerAction) => ({
        ...a,
        id: nanoid(),
        ...(a.echoStream ? { echoStream: normalizeStreamId(a.echoStream) } : {}),
      })),
    }
  })
  const nativeMacros: MacroRule[] = (doc.macros ?? []).map(m => ({
    ...(m as MacroRule),
    id: nanoid(),
  }))
  const nativeAliases: AliasRule[] = (doc.aliases ?? []).map(a => ({
    ...(a as AliasRule),
    id: nanoid(),
  }))

  return {
    highlights,
    names: [],
    triggers,
    macros,
    aliases,
    substitutionCount: 0,
    unsupportedCount: 0,
    nativeGroups: doc.groups,
    nativeModes: doc.modes,
    nativeContacts: doc.contacts,
    nativeContactTemplates: doc.contactTemplates,
    nativeLayout: doc.layout,
    nativeRules: {
      highlights: nativeHighlights,
      triggers:   nativeTriggers,
      macros:     nativeMacros,
      aliases:    nativeAliases,
    },
  }
}

function emptyResult(errorNote: string): ImportResult {
  // The wizard checks `result` for null; we return a result with the error
  // surfaced via a status note on a single dummy highlight. Cleaner would
  // be a top-level error field on ImportResult — punt that to a follow-up.
  return {
    highlights: [{
      kind: 'highlight',
      source: 'lichborne',
      status: 'unsupported',
      statusNote: errorNote,
      pattern: '(parse error)',
      matchType: 'text',
      caseSensitive: false,
      scope: 'match',
      textColor: null,
      bgColor: null,
    }],
    names: [],
    triggers: [],
    macros: [],
    aliases: [],
    substitutionCount: 0,
    unsupportedCount: 1,
  }
}
