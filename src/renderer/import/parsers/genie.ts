// Genie importer — parses Genie's `.cfg` files (`#command {arg} {arg} …` lines)
// into the neutral `ImportResult` / `ImportCandidate` intermediate (types.ts)
// that the Import Wizard previews and mapper.ts converts to native rules. It is
// the only one of the three legacy parsers that yields ALIASES and TRIGGERS.
// Entry point: `parseGenieFiles({ highlights, names, macros, aliases,
// triggers, substitutions, presets, gags, variables })`.
//
// Shared machinery: `parseArgs` walks `{…}` arguments char-by-char, resolving
// Genie's Level-1 escapes (`\\` `\}` `\{`) and leaving runtime escapes (`\x`,
// `\@`) untouched (B137 follow-up, v0.8.10); `stripGenieSlashWrap` treats a
// `/pattern/` or `/pattern/i` value as an EXPLICIT regex regardless of the
// declared type (Globals.cs); `beginswith` imports as a `^`-anchored regex, not
// a substring. Macros and aliases go through the shared
// `parseImportedMacroAction` in SEPARATOR mode — `;`-split, every command
// auto-sends, only an author-written `@` is type-and-wait, `\x`/`\r` are
// import-time noise, `#`-prefixed parts are Genie-internal and filtered.
//
// Per file: highlights.cfg → highlights (type → mode/scope mapping); names.cfg
// → Contacts with per-colour `templateName`; triggers.cfg → triggers via
// `parseActionParts` (B133's alias families for send/var/sound — the send
// forms keep Genie's timing: `#send`/`#do` wait for roundtime, `#put` does
// not, a queue form's leading pause becomes `delayMs`; `##` = literal
// `#`, `#send #X` recursed (B130), `#nop`/`#comment` silently skipped, every
// other `#command` recorded as `dropped` → `partial`; eval `e/…/` triggers
// `unsupported`); gags.cfg → mutes; substitutes.cfg → substitutes (regex, `$N`
// passes through); presets.cfg → `themeVars`; variables.cfg is count-only.
import { ImportResult, ImportHighlight, ImportMacro, ImportAlias, ImportTrigger, ImportMute, ImportSubstitute, ImportEchoAction, ImportVarAction, ImportLogAction, ImportCommandOpts } from '../types'
import { normalizeStreamId } from '../../../shared/streamAliases'
import { parseGenieColor } from '../colorUtils'
import { normalizeGenieKey } from '../keyNormalizer'
import { parseImportedMacroAction } from '../macroAction'

// ── Argument parser ───────────────────────────────────────────────────────────
// Genie uses {curly brace} delimited arguments, possibly quoted with "..."
// e.g. #highlight {regexp} {#FF0000} {some pattern} {class} {Sound.wav}

// B137 follow-up (Sekmeht, v0.8.10): walk character-by-character so we can
// handle Genie's escape sequences inside arguments. Pre-v0.8.10 the parser
// used `line.indexOf('}', i)` which always found the FIRST `}` after `{`,
// even if that `}` was escaped as `\}`. That broke any Genie macro using
// the `\}` escape (e.g. `{\\x;'\}sekmeht @}` — the literal `}` after `'\`
// would terminate the argument prematurely and the rest got dropped).
//
// Resolves Level-1 escapes during extraction:
//   `\\` → `\`   (literal backslash)
//   `\}` → `}`   (literal close-brace, would otherwise terminate the arg)
//   `\{` → `{`   (literal open-brace, less common but standard)
// Other backslash sequences (like `\x` for "clear input" or `\@` for
// "literal @") are LEFT AS-IS — they're runtime escapes, not Level-1
// argument-delimiter escapes. So `\x` and `\@` pass through unchanged
// for downstream handling (`\x` gets stripped by splitAction; `\@` gets
// resolved by Lichborne's `parseCursorMarker` at runtime).
function parseArgs(line: string): string[] {
  const args: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '{') {
      let j = i + 1
      let buf = ''
      while (j < line.length) {
        if (line[j] === '\\' && j + 1 < line.length) {
          const next = line[j + 1]
          if (next === '\\' || next === '}' || next === '{') {
            buf += next
            j += 2
            continue
          }
        }
        if (line[j] === '}') break
        buf += line[j]
        j++
      }
      if (j === line.length) break  // no closing brace — malformed, bail
      args.push(buf)
      i = j + 1
    } else {
      i++
    }
  }
  return args
}

// ── Genie-internal command detection ─────────────────────────────────────────
// Commands starting with # are Genie client commands, not game commands.
// Exception: ## is an escaped # meant to be sent literally.

function isGenieInternal(cmd: string): boolean {
  return cmd.startsWith('#') && !cmd.startsWith('##')
}

// Genie macro/alias action → Lichborne command(s), via the SHARED importer
// helper (macroAction.ts) so Wrayth, Frostbite and Genie all import macros
// identically. Genie is a SEPARATOR client: commands are `;`-separated and
// every one AUTO-SENDS, so nothing gets an `@` appended — a command is
// type-and-wait only if the author wrote an `@` in it (e.g. `assess @`,
// `first @`), which the runtime `parseCursorMarker` honours (incl. mid-string).
//
// Per-segment cleaners: Genie's `\x` is its "clear input box" command — pure
// import-time noise (Lichborne always replaces the bar; **only `@` triggers
// wait-mode**, not `\x` — Sekmeht 2026-06-01), so a leading `\x` is dropped and
// the empty result is filtered; a trailing `\r` (Genie's send marker) is
// redundant since Genie auto-sends, so it's dropped too. `#`-prefixed commands
// are Genie-internal scripting (`#if`/`#put`/`#class`/…) and filtered out
// (`isGenieInternal`); `##x` is an escape for a literal `#x` and is NOT internal.
function parseGenieAction(action: string) {
  return parseImportedMacroAction(action, {
    separator:    /;/g,
    cleanSegment: s => s.replace(/^\\x/, '').replace(/\\r$/, ''),
    isBuiltin:    isGenieInternal,
  })
}

// Strip trailing \r (Genie's "send with enter" marker — Frostborne does this automatically)
function stripSendMarker(s: string): string {
  return s.endsWith('\\r') ? s.slice(0, -2).trim() : s.trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Genie's `/pattern/`, `/pattern/i` wrapping marks an EXPLICIT regex regardless
// of the highlight/trigger type — Globals.cs:1007-1019 strips the leading `/`
// then a trailing `/i` (→ case-insensitive) or `/`. Without this, a slash-
// wrapped pattern imported with the slashes/flag baked in as literal text and
// never matched (e.g. `/The taipan…/i`). Returns the unwrapped body + flags; for
// a non-slash pattern `isRegex` is false and the caller uses the type mapping.
function stripGenieSlashWrap(raw: string): { pattern: string; isRegex: boolean; caseInsensitive: boolean } {
  const p = raw.trim()
  if (!p.startsWith('/')) return { pattern: raw, isRegex: false, caseInsensitive: false }
  let body = p.slice(1)
  let caseInsensitive = false
  if (body.endsWith('/i'))      { caseInsensitive = true; body = body.slice(0, -2) }
  else if (body.endsWith('/'))  { body = body.slice(0, -1) }
  return { pattern: body, isRegex: true, caseInsensitive }
}

// Strip a trailing " /i" case-insensitivity flag from a Genie pattern.
// Returns the cleaned pattern and whether the flag was present.
function stripCaseFlag(raw: string): { pattern: string; caseSensitive: boolean } {
  if (raw.endsWith(' /i')) return { pattern: raw.slice(0, -3), caseSensitive: false }
  return { pattern: raw, caseSensitive: true }
}

// ── Map Genie match type to Frostborne mode ───────────────────────────────────
function mapMatchType(genieType: string): ImportHighlight['matchType'] {
  switch (genieType.toLowerCase()) {
    case 'regexp': return 'regex'
    case 'beginswith':
    case 'line':   return 'phrase'
    default:       return 'text'
  }
}

function mapMatchScope(genieType: string): ImportHighlight['scope'] {
  switch (genieType.toLowerCase()) {
    case 'line':
    case 'beginswith': return 'line'
    default:           return 'match'
  }
}

// ── File parsers ──────────────────────────────────────────────────────────────

function parseHighlights(text: string): ImportHighlight[] {
  const results: ImportHighlight[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#highlight')) continue

    const rest = line.slice('#highlight'.length).trim()
    const args = parseArgs(rest)
    if (args.length < 3) continue

    const [matchTypeRaw, colorRaw, patternRaw, classTag, soundFile] = args
    const { textColor, bgColor } = parseGenieColor(colorRaw)
    const scope = mapMatchScope(matchTypeRaw)

    // Resolve the pattern + match mode. Three cases, in Genie's own precedence:
    //   (1) `/…/`-wrapped → explicit regex (any type); strip slashes + `/i`.
    //   (2) `beginswith` → the line must START WITH the pattern, so anchor it as
    //       a `^`-regex. (Mapping it to a plain substring over-matched: it would
    //       fire on the pattern appearing ANYWHERE in the line, not just the
    //       start — a real fidelity gap vs Genie's HighlightBeginsWithList.)
    //   (3) otherwise → the type mapping (regexp→regex, line→phrase, string→text).
    const slash = stripGenieSlashWrap(patternRaw)
    let pattern: string
    let matchType: ImportHighlight['matchType']
    let caseSensitive: boolean
    if (slash.isRegex) {
      pattern = slash.pattern; matchType = 'regex'; caseSensitive = !slash.caseInsensitive
    } else if (matchTypeRaw.toLowerCase() === 'beginswith') {
      const cf = stripCaseFlag(patternRaw)
      pattern = '^' + escapeRegex(cf.pattern); matchType = 'regex'; caseSensitive = cf.caseSensitive
    } else {
      const cf = stripCaseFlag(patternRaw)
      pattern = cf.pattern; matchType = mapMatchType(matchTypeRaw); caseSensitive = cf.caseSensitive
    }

    results.push({
      kind:        'highlight',
      source:      'genie',
      status:      'ready',
      pattern,
      matchType,
      caseSensitive,
      scope,
      textColor,
      bgColor,
      sourceClass:  classTag || undefined,
      soundFile:   soundFile || undefined,
    })
  }

  return results
}

// `names.cfg`: `#name {#COLOR} {PlayerName}`. Imported as CONTACTS (not
// highlights), with a per-colour `templateName` (`color<HEX>`) so the wizard's
// contacts-apply creates one reusable template per colour and assigns it —
// matching the Frostbite `group=Names` and Wrayth `<names>` paths.
function parseNames(text: string): ImportHighlight[] {
  const results: ImportHighlight[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#name')) continue

    const rest = line.slice('#name'.length).trim()
    const args = parseArgs(rest)
    if (args.length < 2) continue

    const [colorRaw, name] = args
    const pattern = name.trim()
    if (!pattern || seen.has(pattern.toLowerCase())) continue
    seen.add(pattern.toLowerCase())

    const { textColor, bgColor } = parseGenieColor(colorRaw)

    results.push({
      kind:          'highlight',
      source:        'genie',
      status:        'ready',
      pattern,
      matchType:     'text',
      caseSensitive: false,
      scope:         'match',
      textColor,
      bgColor,
      sourceClass:   'names',
      templateName:  textColor ? `color${textColor.replace('#', '').toUpperCase()}` : undefined,
    })
  }

  return results
}

function parseMacros(text: string): ImportMacro[] {
  const results: ImportMacro[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#macro')) continue

    const rest = line.slice('#macro'.length).trim()
    const args = parseArgs(rest)
    if (args.length < 2) continue

    const [keyRaw, actionRaw] = args
    const key = normalizeGenieKey(`{${keyRaw}}`)
    if (!key) continue

    const { commands, hadBuiltin, allBuiltin } = parseGenieAction(actionRaw)

    // All commands were Genie-internal scripting — surface as unsupported
    // rather than silently dropping (uniform with Wrayth/Frostbite).
    if (commands.length === 0) {
      if (allBuiltin) results.push({
        kind: 'macro', source: 'genie', status: 'unsupported',
        statusNote: 'All commands are Genie-internal — nothing to import',
        key, commands: [],
      })
      continue
    }

    // NOTE: `@` is NOT flagged — it's Lichborne's native cursor marker, so
    // `assess @` / `first @` import as working type-and-wait macros (the cursor
    // lands where the `@` is, incl. mid-string). Only unresolved Genie `$vars`
    // get a note.
    const notes: string[] = []
    if (hadBuiltin)                          notes.push('Some Genie-internal commands were removed')
    if (commands.some(c => c.includes('$'))) notes.push('Variable references won\'t resolve — move to a Lich script')

    results.push({
      kind:       'macro',
      source:     'genie',
      status:     notes.length > 0 ? 'partial' : 'ready',
      statusNote: notes.length > 0 ? notes.join('; ') : undefined,
      key,
      commands,
    })
  }

  return results
}

function parseAliases(text: string): ImportAlias[] {
  const results: ImportAlias[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#alias')) continue

    const rest = line.slice('#alias'.length).trim()
    const args = parseArgs(rest)
    if (args.length < 2) continue

    const [input, actionRaw] = args
    const { commands, hadBuiltin } = parseGenieAction(actionRaw)

    if (commands.length === 0) continue

    // `@` is intentionally NOT flagged here either (consistent with macros);
    // it's near-nonexistent in real Genie aliases (which use `$1`/`$rest`).
    const notes: string[] = []
    if (hadBuiltin)                          notes.push('Some Genie-internal commands were removed')
    if (commands.some(c => c.includes('$'))) notes.push('Variable references won\'t resolve — move to a Lich script')

    results.push({
      kind:       'alias',
      source:     'genie',
      status:     notes.length > 0 ? 'partial' : 'ready',
      statusNote: notes.length > 0 ? notes.join('; ') : undefined,
      input:      input.trim(),
      commands,
    })
  }

  return results
}

// ── Gags (#gag / #ignore → suppress a line) ──────────────────────────────────
// `#gag {pattern}` (also `#ignore`). Pattern uses the same `/…/i` slash-wrapping
// as highlights/triggers (reuses stripGenieSlashWrap), else a literal substring.
function parseMutes(text: string): ImportMute[] {
  const results: ImportMute[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#gag') && !line.startsWith('#ignore')) continue

    const rest = line.replace(/^#(?:gag|ignore)\s*/, '')
    const args = parseArgs(rest)
    if (args.length < 1 || !args[0].trim()) continue

    const slash = stripGenieSlashWrap(args[0])
    let pattern: string
    let matchType: ImportMute['matchType']
    let caseSensitive: boolean
    if (slash.isRegex) {
      pattern = slash.pattern; matchType = 'regex'; caseSensitive = !slash.caseInsensitive
    } else {
      const cf = stripCaseFlag(args[0])
      pattern = cf.pattern; matchType = 'phrase'; caseSensitive = cf.caseSensitive
    }

    results.push({ kind: 'mute', source: 'genie', status: 'ready', pattern, matchType, caseSensitive })
  }
  return results
}

// ── Substitutes (#sub / #subs / #substitute → rewrite text) ───────────────────
// `#subs {pattern} {replacement}`. Genie patterns are regex (slash-wrap reuses
// stripGenieSlashWrap) and the replacement uses `$N` capture refs — same syntax
// as our SubstituteRule, so it passes through unchanged.
function parseSubstitutes(text: string): ImportSubstitute[] {
  const results: ImportSubstitute[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#sub')) continue

    const rest = line.replace(/^#(?:substitute|subs|sub)\s*/, '')
    const args = parseArgs(rest)
    if (args.length < 1 || !args[0].trim()) continue

    const slash = stripGenieSlashWrap(args[0])
    results.push({
      kind:          'substitute',
      source:        'genie',
      status:        'ready',
      pattern:       slash.isRegex ? slash.pattern : args[0],
      matchType:     'regex',
      caseSensitive: false,
      replacement:   args[1] ?? '',
    })
  }
  return results
}

// ── Named color words (subset of .NET KnownColor used in #echo) ──────────────
const ECHO_NAMED_COLORS: Record<string, string> = {
  red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00',
  cyan: '#00FFFF', magenta: '#FF00FF', white: '#FFFFFF', black: '#000000',
  orange: '#FFA500', purple: '#800080', pink: '#FFC0CB', gray: '#808080',
  grey: '#808080', silver: '#C0C0C0', gold: '#FFD700', lime: '#00FF00',
  teal: '#008080', navy: '#000080', maroon: '#800000', olive: '#808000',
  aqua: '#00FFFF', fuchsia: '#FF00FF', coral: '#FF7F50', salmon: '#FA8072',
  violet: '#EE82EE', indigo: '#4B0082', crimson: '#DC143C', brown: '#A52A2A',
  turquoise: '#40E0D0', skyblue: '#87CEEB', steelblue: '#4682B4',
  limegreen: '#32CD32', darkred: '#8B0000', darkgreen: '#006400',
  darkblue: '#00008B', darkorange: '#FF8C00', darkviolet: '#9400D3',
  deeppink: '#FF1493', hotpink: '#FF69B4', lightblue: '#ADD8E6',
  lightgreen: '#90EE90', lightyellow: '#FFFFE0', lightcyan: '#E0FFFF',
  lightgray: '#D3D3D3', lightgrey: '#D3D3D3', whitesmoke: '#F5F5F5',
}

function resolveEchoColor(token: string): string | null {
  if (!token) return null
  if (/^#[0-9A-Fa-f]{6}$/.test(token)) return token
  return ECHO_NAMED_COLORS[token.toLowerCase()] ?? null
}

// Parse #echo [color] [>stream] message  OR  #echo [>stream] [color] message
// Color and stream can appear in either order before the message.
function parseEchoAction(raw: string): ImportEchoAction {
  let rest    = raw.trim()
  let stream  = 'log'
  let color: string | null = null

  // Pull off up to two optional tokens (stream or color) before the message.
  // We do two passes so either order works.
  for (let pass = 0; pass < 2; pass++) {
    const next = rest.match(/^(\S+)\s*(.*)$/)
    if (!next) break
    const token = next[1]
    const after = next[2]
    if (token.startsWith('>')) {
      // v0.8.10 (B135): normalize legacy / cross-client stream names —
      // a Genie config with `#echo >talk` or `#echo >whispers` becomes
      // `>conversation`, so the imported trigger echoes to the panel
      // that actually exists in Lichborne instead of a silent dead end.
      stream = normalizeStreamId(token.slice(1) || 'log')
      rest = after
    } else {
      const c = resolveEchoColor(token)
      if (c !== null) {
        color = c
        rest = after
      } else {
        break  // message starts here
      }
    }
  }

  return { stream, color, message: rest }
}

// Split a Genie action string on ; and categorise each part.
function parseActionParts(actionRaw: string): {
  commands:        string[]
  commandOpts:     ImportCommandOpts[]   // index-aligned with `commands`
  echoActions:     ImportEchoAction[]
  varActions:      ImportVarAction[]
  logActions:      ImportLogAction[]
  soundFiles:      string[]
  hasFlash:        boolean
  hasBeep:         boolean
  hasLibrarySound: boolean   // true when a #play arg looks like a Genie built-in name, not a file path
  usedDo:          boolean   // a #do was imported — its stun/web wait is not modelled
  dropped:         string[]
} {
  const parts = actionRaw.split(';').map(s => s.trim()).filter(Boolean)
  const commands:    string[]             = []
  const commandOpts: ImportCommandOpts[]  = []
  // The ONLY writer of `commands`, so `commandOpts` stays index-aligned.
  // Defaults to Lichborne's own default: wait for roundtime, no delay.
  const pushCommand = (cmd: string, opts: ImportCommandOpts = { delayMs: 0, waitForRt: true }) => {
    commands.push(cmd)
    commandOpts.push(opts)
  }
  const echoActions: ImportEchoAction[]  = []
  const varActions:  ImportVarAction[]   = []
  const logActions:  ImportLogAction[]   = []
  const soundFiles:  string[]            = []
  const dropped:     string[]            = []
  let hasFlash        = false
  let hasBeep         = false
  let hasLibrarySound = false
  let usedDo          = false

  // B133 (Sekmeht, v0.8.9): aliases for the cleanly-mappable commands.
  // Genie has multiple #commands that do the same thing (e.g. #put / #send
  // / #q / #que / #queue all "send to game"; #var / #setvar / #setvariable
  // / #tvar / #svar / #tempvar etc. all "set a variable"). Pre-v0.8.9 we
  // only recognized one alias per family and silently dropped the rest.
  // Lichborne doesn't distinguish var scope (temp/saved/string/server)
  // at the action layer — they all set a variable — so the aliases all
  // map to the same `variable` action. See the full Genie command list
  // in CLAUDE.md pitfall #47.
  //
  // The send family differs in TIMING, per Genie's Command.cs (verified against
  // Genie4 source): `#put` and a bare command send at once (SendText); `#send`
  // queues with WaitForRoundtime; `#do` queues waiting out roundtime, stun and
  // webbing; `#queue`/`#que` queue with a delay and no roundtime wait. Every
  // queueing form takes a leading pause in SECONDS (`#send 2 look`), which must
  // come off the command text — it used to import as the command `2 look`.
  // `#q` has no case of its own in Genie's source; it stays with the queue
  // forms because the importer has always accepted it.
  const COMMAND_PREFIX_RE = /^#(send|put|do|q|que|queue)\s+/i
  const VAR_PREFIX_RE     = /^#(?:var|variable|setvar|setvariable|tvar|tempvar|tempvariable|svar)\s+/i
  const SOUND_PREFIX_RE   = /^#(?:play|playsound|playwave)\s+/i

  for (const part of parts) {
    if (!part.startsWith('#')) {
      // Plain game command. Genie sent these at once; here they take the
      // Lichborne default (wait for roundtime) — the reason that default exists.
      const cmd = stripSendMarker(part.replace(/^\\x/, '').trim())
      if (cmd) pushCommand(cmd)
      continue
    }

    // B133: `##text` is Genie's escape for a literal `#text` to send to
    // the game (e.g. a player who actually wants to type `#5` would
    // write `##5`). Strip the leading `#` and treat as plain command.
    if (part.startsWith('##')) {
      const cmd = stripSendMarker(part.slice(1).trim())
      if (cmd) pushCommand(cmd)
      continue
    }

    const lower = part.toLowerCase()

    const sendMatch = part.match(COMMAND_PREFIX_RE)
    if (sendMatch) {
      const verb = sendMatch[1].toLowerCase()
      let body = part.slice(sendMatch[0].length).trim()
      let delayMs = 0
      let pauseMatched = false
      if (verb !== 'put') {
        const pause = body.match(/^(\d+(?:\.\d+)?|\.\d+)(?:\s+|$)/)
        if (pause) {
          pauseMatched = true
          delayMs = Math.round(parseFloat(pause[1]) * 1000)
          body = body.slice(pause[0].length).trim()
        }
      }
      const opts: ImportCommandOpts = { delayMs, waitForRt: verb === 'send' || verb === 'do' }
      const cmd = stripSendMarker(body)
      const isQueueVerb = verb === 'q' || verb === 'que' || verb === 'queue'
      // Genie queue CONTROL, not a command to send: `#send|#do|#queue clear`
      // empties Genie's queue. And `#queue` always takes a delay first — with
      // one word it LISTS the queue, with more it reads the first word as the
      // delay (Command.cs). Imported as-is, these would send "clear" or "look"
      // to DragonRealms, so they are reported as unsupported instead.
      if ((verb !== 'put' && cmd.toLowerCase() === 'clear') || (isQueueVerb && !pauseMatched)) {
        dropped.push(part)
        continue
      }
      if (cmd) {
        // B130 (Jaded, v0.8.9): if the inner content itself starts with `#`,
        // it's a Genie internal command, not a DR command. The common
        // shape is `#send #flash` (Jaded's actual case — someone wrapped a
        // Genie command in `#send`/`#put` thinking they needed to "execute"
        // it; the intent was just `#flash`). Recursively process the inner
        // part instead of pushing it as a literal DR command — DR would
        // reject the unknown command (e.g. "Please rephrase that command")
        // and the trigger would silently spam errors on every match. The
        // recursion goes through THIS function which knows how to map
        // `#flash` → hasFlash, `#beep` → hasBeep, etc.
        if (cmd.startsWith('#')) {
          const inner = parseActionParts(cmd)
          inner.commands.forEach((c, i) => pushCommand(c, inner.commandOpts[i]))
          if (inner.usedDo) usedDo = true
          echoActions.push(...inner.echoActions)
          varActions.push(...inner.varActions)
          logActions.push(...inner.logActions)
          soundFiles.push(...inner.soundFiles)
          if (inner.hasFlash)        hasFlash = true
          if (inner.hasBeep)         hasBeep = true
          if (inner.hasLibrarySound) hasLibrarySound = true
          dropped.push(...inner.dropped)
        } else {
          pushCommand(cmd, opts)
          if (verb === 'do') usedDo = true
        }
      }
    } else if (lower.startsWith('#echo')) {
      const rest = part.slice(5).trim()  // everything after '#echo'
      echoActions.push(parseEchoAction(rest))
    } else if (VAR_PREFIX_RE.test(part)) {
      const body  = part.replace(VAR_PREFIX_RE, '').trim()
      const sp    = body.indexOf(' ')
      const name  = sp === -1 ? body : body.slice(0, sp)
      const value = sp === -1 ? '' : body.slice(sp + 1).trim()
      if (name) varActions.push({ name, value })
    } else if (lower.startsWith('#log ')) {
      const body  = part.slice(5).trim()
      const fileMatch = body.match(/^>(\S+)\s*(.*)$/)
      if (fileMatch) {
        logActions.push({ file: fileMatch[1], message: fileMatch[2] })
      } else {
        logActions.push({ file: '', message: body })
      }
    } else if (SOUND_PREFIX_RE.test(part)) {
      const sound = part.replace(SOUND_PREFIX_RE, '').trim()
      if (sound && sound.toLowerCase() !== 'stop') {
        soundFiles.push(sound)
        // Genie library names have no path separator or audio extension
        const isFilePath = /[/\\]/.test(sound) || /\.(wav|mp3|ogg|aiff?)$/i.test(sound)
        if (!isFilePath) hasLibrarySound = true
      }
    } else if (lower === '#flash') {
      hasFlash = true
    } else if (lower === '#beep' || lower === '#bell') {
      hasBeep = true
    } else if (lower === '#nop' || lower === '#comment' || lower.startsWith('#comment ')) {
      // B133: explicit no-ops. Genie's `#nop` does nothing; `#comment` is
      // a comment line in script files. Drop silently — flagging them as
      // dropped would scare users with a useless "Unsupported: #nop"
      // note in the preview when the user never wanted these to do
      // anything in the first place.
      continue
    } else {
      // B133 (Sekmeht, v0.8.9): catch-all for every other `#command` —
      // surface as dropped so the user sees it in the import preview's
      // "Unsupported actions skipped: #X, #Y" note. Pre-v0.8.9 the
      // unrecognized #commands were silently dropped, so Jaded's
      // `#send #flash` and other malformed shapes appeared to "import
      // cleanly" but produced empty triggers. Now every action that
      // doesn't map to a Lichborne action type leaves a paper trail.
      // Common Genie commands that hit this branch and have no clean
      // Lichborne equivalent: rule-modification (#trigger, #alias,
      // #highlight, #class, etc. — they modify rules at runtime, which
      // Lichborne's static rule model doesn't support), connection
      // control (#connect, #disconnect, #exit, #reconnect), UI control
      // (#statusbar, #window, #position), Genie's scripting flow (#if,
      // #parse, #event, #goto, #pause, #wait, #waitfor), math /
      // random / eval (#math, #evalmath, #random, #eval — Lichborne
      // variable actions only store, don't compute), and mapping /
      // movement (#mapper, #map, #walk, #walkto, #go, #goto, #path).
      // See CLAUDE.md pitfall #47 for the full reasoning.
      dropped.push(part)
    }
    // Everything else (##escaped, #put without body, etc.) is silently skipped
  }

  return { commands, commandOpts, echoActions, varActions, logActions, soundFiles, hasFlash, hasBeep, hasLibrarySound, usedDo, dropped }
}

function parseTriggers(text: string): ImportTrigger[] {
  const results: ImportTrigger[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#trigger')) continue

    const rest = line.slice('#trigger'.length).trim()
    const args = parseArgs(rest)
    if (args.length < 2) continue

    const patternRaw = args[0]
    const actionRaw  = args[1]
    const classTag   = args[2] || undefined

    // Detect eval/variable-watch triggers (e/varname/ prefix)
    const evalMatch = patternRaw.match(/^e\/(.+)\/$/)
    if (evalMatch) {
      // Variable-watch triggers are Phase 3 — note as unsupported for now
      results.push({
        kind: 'trigger', source: 'genie',
        status: 'unsupported',
        statusNote: 'Variable-watch (eval) triggers not yet supported',
        pattern: evalMatch[1], matchType: 'regex', caseSensitive: false,
        commands: [], echoActions: [], varActions: [], logActions: [],
        soundFiles: [], hasFlash: false, hasBeep: false, droppedActions: [],
        classTag,
      })
      continue
    }

    // Genie triggers can be `/…/`-wrapped regex too — strip the slashes/`/i` so
    // the pattern doesn't import with literal slashes (Globals.cs). Triggers are
    // already imported case-insensitive, so the `/i` flag is informational.
    const triggerPattern = stripGenieSlashWrap(patternRaw).pattern

    const {
      commands, commandOpts, echoActions, varActions, logActions,
      soundFiles, hasFlash, hasBeep, hasLibrarySound, usedDo, dropped,
    } = parseActionParts(actionRaw)

    // No importable actions at all — surface as unsupported instead of silently dropping
    const hasAny = commands.length > 0 || echoActions.length > 0 ||
                   varActions.length > 0 || logActions.length > 0 ||
                   soundFiles.length > 0 || hasFlash || hasBeep
    if (!hasAny) {
      results.push({
        kind: 'trigger', source: 'genie', status: 'unsupported',
        statusNote: dropped.length > 0
          ? `Unsupported actions only: ${[...new Set(dropped.map(d => d.split(/\s/)[0]))].join(', ')}`
          : 'No importable actions found',
        pattern: triggerPattern, matchType: 'regex', caseSensitive: false,
        commands: [], echoActions: [], varActions: [], logActions: [],
        soundFiles: [], hasFlash: false, hasBeep: false, droppedActions: dropped,
        classTag,
      })
      continue
    }

    // Determine status. Only genuinely-dropped actions make a trigger `partial`.
    // A sound IS a supported action (it imports as a sound preset and plays), so
    // a Genie library-sound name does NOT downgrade the trigger — uniform with
    // how Frostbite imports highlight sounds as `ready`. We keep an
    // informational note (shown as a tooltip on the `ready` badge) because the
    // specific Genie sound becomes one of Lichborne's built-in presets.
    let status: ImportTrigger['status'] = 'ready'
    const notes: string[] = []
    if (dropped.length > 0) {
      status = 'partial'
      notes.push(`Unsupported actions skipped: ${[...new Set(dropped.map(d => d.split(/\s/)[0]))].join(', ')}`)
    }
    if (hasLibrarySound) {
      notes.push('Genie sound mapped to a built-in preset — change it in the trigger if you want a different one')
    }
    if (usedDo) {
      notes.push('Genie #do also waited while stunned or webbed; here it waits for roundtime only')
    }

    results.push({
      kind:          'trigger',
      source:        'genie',
      status,
      statusNote:    notes.length > 0 ? notes.join('; ') : undefined,
      pattern:       triggerPattern,
      matchType:     'regex',
      caseSensitive: false,
      commands,
      commandOpts,
      echoActions,
      varActions,
      logActions,
      soundFiles,
      hasFlash,
      hasBeep,
      droppedActions: dropped,
      classTag,
    })
  }

  return results
}

// ── Preset → theme variable mapping ──────────────────────────────────────────
// Maps Genie preset names to Frostborne CSS custom-property names.
// Each entry is [channel, cssVar] where channel 'fg' uses the first color arg
// and 'bg' uses the second color arg from the #preset line.

type PresetChannel = 'fg' | 'bg'
type PresetMapping = [PresetChannel, string]

const GENIE_PRESET_MAP: Record<string, PresetMapping[]> = {
  // Default window text and background (only present when user has customized them)
  default:       [['fg', '--text-primary'], ['bg', '--bg-app']],
  // Game text (GameText tab in ThemeEditor)
  creatures:     [['fg', '--preset-bold']],
  speech:        [['fg', '--preset-speech'],   ['bg', '--preset-speech-bg']],
  whispers:      [['fg', '--preset-whisper'],  ['bg', '--preset-whisper-bg']],
  thoughts:      [['fg', '--preset-thought'],  ['bg', '--preset-thought-bg']],
  roomname:      [['fg', '--preset-roomname'], ['bg', '--preset-roomname-bg']],
  roomdesc:      [['fg', '--preset-roomdesc'], ['bg', '--preset-roomdesc-bg']],
  // Vitals — health uses one Genie color mapped to all 4 threshold levels
  health:        [
    ['fg', '--vital-health-ok-end'],    ['bg', '--vital-health-ok-start'],
    ['fg', '--vital-health-mid-end'],   ['bg', '--vital-health-mid-start'],
    ['fg', '--vital-health-low-end'],   ['bg', '--vital-health-low-start'],
    ['fg', '--vital-health-crit-end'],  ['bg', '--vital-health-crit-start'],
  ],
  mana:          [['fg', '--vital-mana-end'],    ['bg', '--vital-mana-start']],
  spirit:        [['fg', '--vital-spirit-end'],  ['bg', '--vital-spirit-start']],
  stamina:       [['fg', '--vital-stamina-end'], ['bg', '--vital-stamina-start']],
  concentration: [['fg', '--vital-conc-end'],    ['bg', '--vital-conc-start']],
  // HUD bars
  roundtime:     [['fg', '--rt-end'], ['bg', '--rt-start']],
  castbar:       [['fg', '--ct-end'], ['bg', '--ct-start']],
}

const PRESET_SKIP = new Set(['inputother', 'inputuser', 'scriptecho', 'familiar'])

function parsePresets(text: string): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('#preset')) continue

    const rest = line.slice('#preset'.length).trim()
    const args = parseArgs(rest)
    // Format: {name} {colorspec_or_fg_bg_pair} {BooleanFlag}
    // args[1] holds the entire color spec — "fg" or "fg, bg" as a comma pair
    // args[2] is "False"/"True" (a visibility flag) — NOT a background color
    if (args.length < 2) continue

    const name = args[0].trim().toLowerCase()
    if (name.includes('.') || PRESET_SKIP.has(name)) continue

    const mappings = GENIE_PRESET_MAP[name]
    if (!mappings) continue

    const { textColor: fg, bgColor: bg } = parseGenieColor(args[1])

    for (const [channel, cssVar] of mappings) {
      const color = channel === 'fg' ? fg : bg
      if (color) vars[cssVar] = color
    }
  }

  return vars
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenieFiles {
  highlights?: string    // highlights.cfg content
  names?: string         // names.cfg content
  macros?: string        // macros.cfg or Profiles/X/macros.cfg content
  aliases?: string       // aliases.cfg or Profiles/X/aliases.cfg content
  triggers?: string      // triggers.cfg content
  substitutions?: string // substitutes.cfg content (counted but not imported)
  presets?: string       // presets.cfg content → mapped to custom theme vars
  gags?: string          // gags.cfg content (counted but not imported — use textsubs.lic)
  variables?: string     // variables.cfg content (counted but not imported — live in Lich Vars)
}

export function parseGenieFiles(files: GenieFiles): ImportResult {
  const highlights = files.highlights ? parseHighlights(files.highlights) : []
  const names      = files.names      ? parseNames(files.names)           : []
  const macros    = files.macros    ? parseMacros(files.macros)       : []
  const aliases   = files.aliases   ? parseAliases(files.aliases)     : []
  const triggers  = files.triggers  ? parseTriggers(files.triggers)   : []

  const themeVars = files.presets ? parsePresets(files.presets) : undefined

  const substitutes = files.substitutions ? parseSubstitutes(files.substitutions) : []
  const mutes = files.gags ? parseMutes(files.gags) : []

  // Variables stay count-only (they live in Lich's Vars). Genie writes the SHORT
  // form `#var` (also covers `#variable`).
  let variablesCount = 0
  if (files.variables) {
    for (const line of files.variables.split('\n')) {
      if (line.trim().startsWith('#var')) variablesCount++
    }
  }

  const unsupportedCount = [
    ...highlights, ...macros, ...aliases, ...triggers,
  ].filter(r => r.status === 'unsupported').length

  return {
    highlights, names, macros, aliases, triggers,
    substitutionCount: 0, unsupportedCount,
    ...(mutes.length > 0 ? { mutes } : {}),
    ...(substitutes.length > 0 ? { substitutes } : {}),
    ...(themeVars && Object.keys(themeVars).length > 0 ? { themeVars } : {}),
    ...(variablesCount > 0 ? { variablesCount } : {}),
  }
}
