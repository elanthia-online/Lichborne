// Import intermediate — the neutral `ImportCandidate` shapes every legacy-client
// parser (wrayth.ts / genie.ts / frostbite.ts) produces, and the `ImportResult`
// bundle the Import Wizard previews. mapper.ts converts these to native
// Lichborne rule types; the intermediate itself is only for the wizard's
// preview/selection UI.
//
// Deliberately NOT the full native rule shape (no bold/glow, gates, oneShot,
// groupIds, name, enabled …) — it models the union of the three source
// formats. That is why `ImportResult.nativeRules` exists (B124, v0.8.7): a
// Lichborne-native import carries the complete rule objects index-aligned
// with the candidate arrays and the wizard prefers them, bypassing the
// mapper. Every candidate carries a `status` (`ready` / `partial` /
// `unsupported`) + `statusNote` that the preview surfaces; `names` are
// highlights re-routed to Contacts, with `templateName` grouping them into
// per-colour contact templates.
//
// Adding a rule type here means: the candidate interface, its slot in
// `ImportResult`, a `mapX` in mapper.ts, and an apply branch in the wizard.

export type ImportSource = 'wrayth' | 'genie' | 'frostbite' | 'lichborne'

export type ImportStatus =
  | 'ready'         // fully importable
  | 'partial'       // importable with caveats (e.g. color missing)
  | 'unsupported'   // cannot be imported (e.g. client-internal commands)

export interface ImportHighlight {
  kind: 'highlight'
  source: ImportSource
  status: ImportStatus
  statusNote?: string
  pattern: string
  matchType: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  scope: 'match' | 'line'
  textColor: string | null    // hex, or null if undecodable
  bgColor: string | null
  sourceClass?: string        // Genie class tag, Frostbite group — informational only
  soundFile?: string          // if present stored directly on the HighlightRule; no companion trigger
  // Wrayth <names> import: the auto-generated contact-template name this entry
  // belongs to (one per unique palette color, e.g. "color41"). The wizard's
  // contacts apply step groups names by this and find-or-creates a
  // ContactTemplate, assigning each new Contact's templateId. Only set on the
  // `names` array for Wrayth; undefined elsewhere.
  templateName?: string
}

export interface ImportMute {
  kind: 'mute'
  source: ImportSource
  status: ImportStatus
  statusNote?: string
  pattern: string
  matchType: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  stream?: string        // optional stream scope (Frostbite target); undefined = all
}

export interface ImportSubstitute {
  kind: 'substitute'
  source: ImportSource
  status: ImportStatus
  statusNote?: string
  pattern: string
  matchType: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  replacement: string    // normalized to $N capture-group syntax
  stream?: string
}

export interface ImportMacro {
  kind: 'macro'
  source: ImportSource
  status: ImportStatus
  statusNote?: string
  key: string           // normalised to Frostborne format e.g. "Ctrl+F1"
  commands: string[]    // clean game commands only; internal commands stripped
}

export interface ImportAlias {
  kind: 'alias'
  source: ImportSource
  status: ImportStatus
  statusNote?: string
  input: string
  commands: string[]
}

export interface ImportEchoAction {
  stream:  string
  color:   string | null
  message: string
}

export interface ImportVarAction {
  name:  string
  value: string
}

export interface ImportLogAction {
  file:    string
  message: string
}

export interface ImportCommandOpts {
  delayMs:   number
  waitForRt: boolean
}

export interface ImportTrigger {
  kind: 'trigger'
  source: ImportSource
  status: ImportStatus
  statusNote?: string
  pattern: string
  matchType: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  commands:    string[]           // #send / #put actions
  /** Per-command timing, INDEX-ALIGNED with `commands` (Genie sets it; other
   *  sources omit it and the commands take Lichborne's defaults). Written only
   *  through genie.ts's `pushCommand`, so the two arrays cannot drift. */
  commandOpts?: ImportCommandOpts[]
  echoActions: ImportEchoAction[]
  varActions:  ImportVarAction[]
  logActions:  ImportLogAction[]
  soundFiles:  string[]           // #play actions
  hasFlash:    boolean
  hasBeep:     boolean
  classTag?:   string             // 3rd {arg} — informational
  droppedActions: string[]        // #if, #event, #statusbar, #class — noted but not imported
}

export type ImportCandidate =
  | ImportHighlight
  | ImportMacro
  | ImportAlias
  | ImportTrigger

export interface ImportResult {
  highlights: ImportHighlight[]
  names: ImportHighlight[]      // name highlights → imported as Contacts, not Highlights
  macros: ImportMacro[]
  aliases: ImportAlias[]
  triggers: ImportTrigger[]
  mutes?: ImportMute[]          // Mutes (Gags / Ignores) → imported as MuteRule (DESIGN.md §31)
  substitutes?: ImportSubstitute[] // Substitutes → imported as SubstituteRule (DESIGN.md §31)
  substitutionCount: number     // legacy count (no longer surfaced once `substitutes` imports)
  unsupportedCount: number
  themeVars?: Record<string, string>  // CSS vars mapped from Genie/Frostbite/Wrayth presets
  // "Belongs in Lich" counts — surfaced on confirm screen, never imported
  alertHighlightCount?: number  // Frostbite [AlertHighlight] health/stun threshold entries
  quickButtonCount?: number     // Frostbite general.ini [QuickButton] entries (no LB equivalent)
  gagsCount?: number            // Genie gags.cfg rule count
  variablesCount?: number       // Genie variables.cfg entry count
  scriptsCount?: number         // Wrayth <scripts> block entry count
  // v0.8.4 (F29): Lichborne-native data carried straight through — these
  // are already in our own format so the parser doesn't need to convert
  // them to ImportCandidate shape. The Lichborne import path applies
  // them directly; other parsers leave them undefined.
  nativeGroups?: unknown[]            // RuleGroup[] (loose type to avoid circular import)
  nativeModes?: unknown[]             // GameMode[]
  nativeContacts?: unknown[]          // Contact[]
  nativeContactTemplates?: unknown[]  // ContactTemplate[]
  // v0.8.5 (F29-layout): panel layout snapshot when present in a v2+
  // Lichborne export. Loose shape — typed at the apply site.
  nativeLayout?: unknown
  // B124 (v0.8.7): for Lichborne→Lichborne imports, the full native rule
  // objects with fresh ids — index-aligned with the highlights/triggers/
  // macros/aliases ImportCandidate arrays above, so the wizard's selection
  // indices apply to both. The wizard's apply step prefers these over
  // ImportCandidate→mapper output to avoid silent loss of fields the
  // intermediate doesn't model (bold/glow on highlights; gates/oneShot/
  // watchStream/action ordering on triggers; groupIds/allGroups/name/
  // enabled on every rule type). Other parsers leave this undefined and
  // the wizard falls back to the legacy ImportCandidate path.
  nativeRules?: {
    highlights?: unknown[]  // HighlightRule[]
    triggers?:   unknown[]  // TriggerRule[]
    macros?:     unknown[]  // MacroRule[]
    aliases?:    unknown[]  // AliasRule[]
  }
}
