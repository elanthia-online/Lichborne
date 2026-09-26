// Import mapper — converts the neutral `ImportCandidate` intermediate (types.ts,
// produced by the Wrayth / Genie / Frostbite parsers) into native Lichborne
// rule objects the Import Wizard merges into the active profile.
//
// One `mapX` per rule type (highlight / mute / substitute / macro / alias /
// trigger), plus `mapImportResult`, which applies the wizard's selection sets
// by INDEX over the candidate arrays. Every mapped rule gets a fresh `nanoid`,
// a blank name, `enabled: true`, and `groupIds: [] + allGroups: true` (the
// shared group-gating shape). Choices baked in here: imported mutes are
// always `line` scope (every source client's gag hides the whole line);
// imported triggers watch `main`, not `any` (B128 — DR double-routes speech,
// so watch-all double-fired); a trigger sound that is a real audio FILE is
// preserved verbatim as `soundFile`, and only a built-in sound NAME falls
// back to the closest `soundPreset`. Fields the intermediate does not model
// take defaults — which is exactly why Lichborne-native imports bypass this
// mapper via `ImportResult.nativeRules` (see types.ts).
import { nanoid } from 'nanoid'
import { ImportResult, ImportHighlight, ImportMacro, ImportAlias, ImportTrigger, ImportMute, ImportSubstitute } from './types'
import { HighlightRule, HighlightStyle } from '../highlights'
import { MacroRule, AliasRule } from '../macros'
import { TriggerRule, TriggerAction } from '../triggers'
import { MuteRule } from '../mutes'
import { SubstituteRule } from '../substitutes'

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultStyle(textColor: string | null, bgColor: string | null): HighlightStyle {
  return {
    textColor: textColor ?? '#ffffff',
    bgColor:   bgColor  ?? 'transparent',
    bold:      false,
    glow:      false,
    glowColor: '#ffffff',
  }
}

// Map a sound filename to the closest Frostborne sound preset
function mapSoundPreset(file: string): TriggerAction['soundPreset'] {
  const lower = file.toLowerCase()
  if (lower.includes('alert') || lower.includes('alarm'))  return 'alert'
  if (lower.includes('chime') || lower.includes('ding'))   return 'chime'
  if (lower.includes('ping'))                              return 'ping'
  return 'alarm'
}

// A real audio FILE (a path or an audio extension) vs a source-client built-in
// sound NAME (Genie's `MiniFanfare1`, etc.). The `sound` TriggerAction supports
// a `soundFile` (a WAV/audio path the engine plays via playWavFile, taking
// priority over `soundPreset`), so an actual file is preserved verbatim;
// a built-in name has no file to play, so it falls back to the closest preset.
function isAudioFile(s: string): boolean {
  return /[/\\]/.test(s) || /\.(wav|mp3|ogg|aiff?|m4a|aac|flac)$/i.test(s)
}

// ── Highlight mapper ──────────────────────────────────────────────────────────

export function mapHighlight(h: ImportHighlight, priority: number): HighlightRule {
  return {
    id:            nanoid(),
    name:          '',
    enabled:       true,
    pattern:       h.pattern,
    mode:          h.matchType,
    caseSensitive: h.caseSensitive,
    scope:         h.scope,
    style:         defaultStyle(h.textColor, h.bgColor),
    priority,
    groupIds:      [],
    allGroups:     true,
    ...(h.soundFile ? { soundFile: h.soundFile } : {}),
  }
}

// ── Mute mapper ──────────────────────────────────────────────────────────────

export function mapMute(g: ImportMute): MuteRule {
  return {
    id:            nanoid(),
    name:          '',
    enabled:       true,
    pattern:       g.pattern,
    mode:          g.matchType,
    scope:         'line',   // every client's gag/ignore hides the whole line
    caseSensitive: g.caseSensitive,
    ...(g.stream ? { stream: g.stream } : {}),
    groupIds:      [],
    allGroups:     true,
  }
}

// ── Substitute mapper ─────────────────────────────────────────────────────────

export function mapSubstitute(s: ImportSubstitute): SubstituteRule {
  return {
    id:            nanoid(),
    name:          '',
    enabled:       true,
    pattern:       s.pattern,
    mode:          s.matchType,
    caseSensitive: s.caseSensitive,
    replacement:   s.replacement,
    ...(s.stream ? { stream: s.stream } : {}),
    groupIds:      [],
    allGroups:     true,
  }
}

// ── Macro mapper ──────────────────────────────────────────────────────────────

export function mapMacro(m: ImportMacro): MacroRule {
  return {
    id:        nanoid(),
    name:      '',
    enabled:   true,
    key:       m.key,
    commands:  m.commands,
    delayMs:   0,
    groupIds:  [],
    allGroups: true,
  }
}

// ── Alias mapper ──────────────────────────────────────────────────────────────

export function mapAlias(a: ImportAlias): AliasRule {
  return {
    id:            nanoid(),
    name:          '',
    enabled:       true,
    input:         a.input,
    caseSensitive: false,
    commands:      a.commands,
    delayMs:       0,
    passThrough:   false,
    groupIds:      [],
    allGroups:     true,
  }
}

// ── Trigger mapper ────────────────────────────────────────────────────────────

export function mapTrigger(t: ImportTrigger): TriggerRule {
  const actions: TriggerAction[] = []

  t.commands.forEach((cmd, i) => {
    // `commandOpts` is index-aligned with `commands` when a source knows the
    // timing (Genie's #send/#put/#queue). Without it the command takes the
    // Lichborne defaults: no delay, and `waitForRt` left absent = wait.
    const o = t.commandOpts?.[i]
    actions.push({
      id: nanoid(), type: 'command', command: cmd, delayMs: o?.delayMs ?? 0,
      ...(o ? { waitForRt: o.waitForRt } : {}),
    })
  })

  for (const echo of (t.echoActions ?? [])) {
    actions.push({
      id:           nanoid(),
      type:         'echo',
      echoMessage:  echo.message,
      echoStream:   echo.stream,
      echoColor:    echo.color ?? '',
    })
  }

  for (const v of (t.varActions ?? [])) {
    actions.push({ id: nanoid(), type: 'variable', varName: v.name, varValue: v.value })
  }

  for (const log of (t.logActions ?? [])) {
    actions.push({ id: nanoid(), type: 'log', logFile: log.file, logMessage: log.message })
  }

  for (const sound of (t.soundFiles ?? [])) {
    // Preserve a real WAV/audio file exactly (the engine plays it); only a
    // built-in sound NAME falls back to a preset.
    actions.push(isAudioFile(sound)
      ? { id: nanoid(), type: 'sound', soundFile: sound }
      : { id: nanoid(), type: 'sound', soundPreset: mapSoundPreset(sound) })
  }

  if (t.hasFlash) actions.push({ id: nanoid(), type: 'flash' })
  if (t.hasBeep)  actions.push({ id: nanoid(), type: 'beep' })

  return {
    id:              nanoid(),
    name:            '',
    enabled:         true,
    triggerType:     'text',
    pattern:         t.pattern,
    mode:            t.matchType,
    caseSensitive:   t.caseSensitive,
    // B128 (Jaded, v0.8.9): imported triggers default to 'main', not 'any'.
    // 'any' caused double-fires for speech triggers — DR routes "Bob says X"
    // into both `main` and `conversations` streams, so a watch-all trigger
    // fired twice. Imported triggers from legacy clients (Wrayth/Genie/
    // Frostbite) all originally watched the main game text stream, so
    // 'main' matches the source semantics. Users who want a trigger that
    // fires on a custom stream can change watchStream after import.
    watchStream:     'main',
    gates:           [],
    cooldownSeconds: 0,
    oneShot:         false,
    actions,
    groupIds:        [],
    allGroups:       true,
  }
}

// ── Merge strategy ────────────────────────────────────────────────────────────

export type MergeStrategy = 'append' | 'replace'

export interface MappedRules {
  highlights: HighlightRule[]
  macros:     MacroRule[]
  aliases:    AliasRule[]
  triggers:   TriggerRule[]
}

/**
 * Convert a filtered ImportResult (selected candidates only) into Frostborne
 * rule objects ready to be merged into the active profile.
 */
export function mapImportResult(
  result: ImportResult,
  selectedHighlights: Set<number>,
  selectedMacros:     Set<number>,
  selectedAliases:    Set<number>,
  selectedTriggers:   Set<number>,
  startPriority:      number = 0,
): MappedRules {
  const highlights: HighlightRule[] = []
  const triggers:   TriggerRule[]   = []

  result.highlights.forEach((h, i) => {
    if (!selectedHighlights.has(i)) return
    highlights.push(mapHighlight(h, startPriority + i))
  })

  result.triggers.forEach((t, i) => {
    if (!selectedTriggers.has(i)) return
    triggers.push(mapTrigger(t))
  })

  const macros = result.macros
    .filter((_, i) => selectedMacros.has(i))
    .map(mapMacro)

  const aliases = result.aliases
    .filter((_, i) => selectedAliases.has(i))
    .map(mapAlias)

  return { highlights, macros, aliases, triggers }
}
