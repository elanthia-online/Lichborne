// ── Alias Rule ──────────────────────────────────────────────────────────────
// An alias maps a short command (what the player types) to one or more game
// commands. The player types "hunt" and the client sends "stalk" or a whole
// sequence. Arguments after the matched prefix are captured as $1, $2, $rest.

export interface AliasRule {
  id: string
  name: string
  enabled: boolean
  input: string          // prefix to match (first word(s) of typed command)
  caseSensitive: boolean
  commands: string[]     // ordered list of commands to send; supports $1 $2 $rest $health etc.
  delayMs: number        // ms between each command in the sequence (0 = instant)
  passThrough: boolean   // also send the original typed input after alias commands
  groupIds: string[]
  allGroups: boolean
}

// ── Macro Rule ──────────────────────────────────────────────────────────────
// A macro fires when the player presses a key combination, regardless of focus.

export interface MacroRule {
  id: string
  name: string
  enabled: boolean
  key: string            // combo string e.g. "F1", "Ctrl+F5", "Alt+1", "Ctrl+Shift+F2"
  commands: string[]     // supports $health $mana $stance $spell $left $right $room $rt
  delayMs: number
  groupIds: string[]
  allGroups: boolean
}

// ── Storage ──────────────────────────────────────────────────────────────────

import { scopedKey, safeSetItem } from './characterScope'

const aliasKey = (character: string) => scopedKey(character, 'aliases')
const macroKey = (character: string) => scopedKey(character, 'macros')

export function loadAliases(character: string): AliasRule[] {
  try {
    const raw = localStorage.getItem(aliasKey(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

// Returns the write's success flag (false = quota, already toasted) — see
// saveHighlights' note; the F63 scope move aborts on a failed target write.
export function saveAliases(character: string, rules: AliasRule[]): boolean {
  return safeSetItem(aliasKey(character), JSON.stringify(rules))
}

export function loadMacros(character: string): MacroRule[] {
  try {
    const raw = localStorage.getItem(macroKey(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function saveMacros(character: string, rules: MacroRule[]): boolean {
  return safeSetItem(macroKey(character), JSON.stringify(rules))
}

// ── Factories ─────────────────────────────────────────────────────────────────

export function newAlias(input = ''): AliasRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    input,
    caseSensitive: false,
    commands: [''],
    delayMs: 0,
    passThrough: false,
    groupIds: [],
    allGroups: true,
  }
}

export function newMacro(key = ''): MacroRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    key,
    commands: [''],
    delayMs: 0,
    groupIds: [],
    allGroups: true,
  }
}

// ── Key combo handling ────────────────────────────────────────────────────────

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS'])

const NUMPAD_CODE_MAP: Record<string, string> = {
  NumpadSubtract: 'Num-',  NumpadAdd:      'Num+',
  NumpadMultiply: 'Num*',  NumpadDivide:   'Num/',
  NumpadDecimal:  'Num.',  NumpadEnter:    'NumEnter',
  Numpad0: 'Num0', Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3',
  Numpad4: 'Num4', Numpad5: 'Num5', Numpad6: 'Num6', Numpad7: 'Num7',
  Numpad8: 'Num8', Numpad9: 'Num9',
}

// B347: on macOS, Option REWRITES the character a key produces (Option+T is
// `†`, Option+E is a dead key), so `e.key` can't name an Option chord. These
// are the physical keys we name from `e.code` instead, as a US layout names
// them — the same string Windows gets from `e.key` for that chord, so a macro
// imported or transferred from Windows (`Alt+T`, `Alt+Shift+!`) matches.
// [unshifted, shifted]; letters are uppercased either way, as today.
const MAC_OPTION_CODE_MAP: Record<string, [string, string]> = {
  Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'],
  Digit5: ['5', '%'], Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'],
  Digit9: ['9', '('], Digit0: ['0', ')'],
  Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'],
  Period: ['.', '>'], Slash: ['/', '?'], Backquote: ['`', '~'],
  // Option+Space types a non-breaking space, which would display as a blank.
  Space: ['Space', 'Space'],
}

/** `mac` is passed in (never read from lichSettings) so this file stays
 *  bundleable by the tmp-cmd-harness without a window.api stub. */
export interface KeyComboOptions { mac?: boolean }

function comboFromKey(e: KeyboardEvent, mods: string[]): string {
  const key = e.key
  // e.code distinguishes numpad keys from their keyboard twins (e.g. NumpadSubtract vs Minus)
  const display = NUMPAD_CODE_MAP[e.code]
    ?? (key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key)
  return [...mods, display].join('+')
}

function comboMods(e: KeyboardEvent): string[] | null {
  // Meta chords (Cmd on macOS, Win key elsewhere) are NEVER macro-bindable —
  // bail so they can't match anything. Without this, formatKeyCombo ignored
  // metaKey entirely, so on a Mac Cmd+C formatted as plain 'C' and a macro
  // bound to bare C would swallow the OS copy chord (v0.18.0 cross-platform).
  // No stored combo can contain a Meta modifier (this same function records
  // combos in the Macros editor), so nothing legitimate is lost.
  if (e.metaKey) return null
  if (MODIFIER_KEYS.has(e.key)) return null
  const mods: string[] = []
  if (e.ctrlKey)  mods.push('Ctrl')
  if (e.altKey)   mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  return mods
}

export function formatKeyCombo(e: KeyboardEvent, opts: KeyComboOptions = {}): string {
  const mods = comboMods(e)
  if (!mods) return ''
  // B347: a mac Option chord is named from the PHYSICAL key. Numpad keys keep
  // NUMPAD_CODE_MAP; anything not listed (F-keys, arrows, Enter — whose e.key
  // is a name, not a character Option can rewrite) falls through to e.key.
  if (opts.mac && e.altKey && !NUMPAD_CODE_MAP[e.code]) {
    const code = e.code ?? ''
    const letter = /^Key([A-Z])$/.exec(code)
    if (letter) return [...mods, letter[1]].join('+')
    const mapped = MAC_OPTION_CODE_MAP[code]
    if (mapped) return [...mods, mapped[e.shiftKey ? 1 : 0]].join('+')
  }
  return comboFromKey(e, mods)
}

export function matchKeyCombo(combo: string, e: KeyboardEvent, opts: KeyComboOptions = {}): boolean {
  if (!combo) return false
  if (formatKeyCombo(e, opts) === combo) return true
  // B347: before the fix a Mac recorded Option chords from e.key (`Alt+†`).
  // Keep those firing: on mac, the legacy e.key form still matches too.
  if (opts.mac && e.altKey) {
    const mods = comboMods(e)
    return !!mods && comboFromKey(e, mods) === combo
  }
  return false
}

// ── Typed-input command separator (F59, v0.15.2) ─────────────────────────────
// Genie's model: `n;n;e` typed in the command bar is three commands. Rules:
//   - A line whose first non-space char is ';' is a LICH command — returned
//     verbatim, never split (Lich commands can legally contain ';', e.g.
//     `;e Vars['x'] = 'a;b'` — splitting would corrupt them).
//   - Otherwise split on ';', with `\;` escaping a literal ';' (the escape is
//     resolved in the returned parts). Parts are trimmed; empties dropped.
// The separator is hardcoded ';' (Genie's default separatorchar — the import
// layer makes the same assumption, see import/macroAction.ts). Slash commands
// never reach this: dispatchUserText handles a '/'-leading line first.
export function splitTypedCommands(text: string): string[] {
  if (text.trimStart().startsWith(';')) return [text]
  const parts: string[] = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === ';') { cur += ';'; i++; continue }
    if (text[i] === ';') { parts.push(cur); cur = ''; continue }
    cur += text[i]
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

// ── Interpolation ─────────────────────────────────────────────────────────────

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$(\w+)/g, (_, key) => vars[key] ?? `$${key}`)
}

// ── Cursor marker (B137, v0.8.10) ─────────────────────────────────────────────
// `@` in a macro command is the cursor-position marker (matches Genie's
// FormMain.cs:1140 behavior and Wrayth's convention — both Stormfront-family
// clients use `@` for the same purpose). When a macro command contains an
// unescaped `@`:
//   1. The macro fires "type-and-wait" mode instead of "send" mode
//   2. The text is typed into the command bar (without sending)
//   3. The cursor lands where the first `@` was, ready for the user to finish
//      typing and press Enter manually
//
// Escape: `\@` represents a literal `@` character — the backslash is stripped
// and the `@` becomes part of the typed text without acting as a marker. So a
// macro like `email me\@example.com` types `email me@example.com` AND sends
// (no unescaped @ remains, so it's send-mode).
//
// Multiple `@` characters: the FIRST unescaped `@` is the cursor position; any
// additional unescaped `@` chars are stripped from the text (matches Genie's
// `sText.Replace("@", "")` followed by `sText.IndexOf("@")` for cursor pos —
// only the first @ matters for positioning, all are removed from the result).
//
// Returns null when the command has no unescaped `@` — caller treats as a
// normal send-mode command (escape handling for `\@` in send-mode is
// intentionally NOT applied; users who want a literal `@` in a sent command
// don't need to escape it).
export interface CursorMarker {
  text: string       // command text with all @ stripped and \@ resolved to literal @
  cursorPos: number  // index where the first unescaped @ was in the original
}

export function parseCursorMarker(command: string): CursorMarker | null {
  let text = ''
  let cursorPos = -1
  let i = 0
  while (i < command.length) {
    if (command[i] === '\\' && command[i + 1] === '@') {
      // Escaped: literal @ in output (no cursor marker)
      text += '@'
      i += 2
    } else if (command[i] === '@') {
      // Unescaped @: cursor marker. First one wins; all are stripped.
      if (cursorPos === -1) cursorPos = text.length
      i += 1
    } else {
      text += command[i]
      i += 1
    }
  }
  if (cursorPos === -1) return null
  return { text, cursorPos }
}

// ── Alias resolution ──────────────────────────────────────────────────────────
// Returns expanded commands + timing config, or null if no alias matched.

export function resolveAlias(
  rawInput: string,
  aliases: AliasRule[],
  gameVars: Record<string, string>,
): { commands: string[]; delayMs: number; passThrough: boolean; ruleId: string } | null {
  const trimmed = rawInput.trim()
  if (!trimmed) return null

  for (const alias of aliases) {
    if (!alias.enabled || !alias.input.trim()) continue

    const pattern = alias.input.trim()
    const compare = (a: string, b: string) =>
      alias.caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase()

    if (!compare(trimmed.slice(0, pattern.length), pattern)) continue
    const after = trimmed.slice(pattern.length)
    // "hunt" must not match "hunter" — require whitespace or end after the prefix
    if (after.length > 0 && !/^\s/.test(after)) continue

    const argStr   = after.trim()
    const argWords = argStr ? argStr.split(/\s+/) : []
    const argVars: Record<string, string> = { rest: argStr }
    argWords.forEach((w, i) => { argVars[String(i + 1)] = w })

    const vars     = { ...gameVars, ...argVars }
    const commands = alias.commands.map(c => interpolate(c, vars).trim()).filter(Boolean)

    return { commands, delayMs: alias.delayMs, passThrough: alias.passThrough, ruleId: alias.id }
  }
  return null
}

// ── Macro resolution ──────────────────────────────────────────────────────────

export function resolveMacro(
  e: KeyboardEvent,
  macros: MacroRule[],
  gameVars: Record<string, string>,
  opts: KeyComboOptions = {},
): { commands: string[]; delayMs: number; ruleId: string } | null {
  for (const macro of macros) {
    if (!macro.enabled || !macro.key) continue
    if (matchKeyCombo(macro.key, e, opts)) {
      const commands = macro.commands.map(c => interpolate(c, gameVars).trim()).filter(Boolean)
      return { commands, delayMs: macro.delayMs, ruleId: macro.id }
    }
  }
  return null
}

// ── Interpolatable variable lists (for editor UI) ─────────────────────────────

export const ALIAS_VARS: { name: string; desc: string }[] = [
  { name: '1',    desc: 'first argument word' },
  { name: '2',    desc: 'second argument word' },
  { name: '3',    desc: 'third argument word' },
  { name: 'rest', desc: 'all arguments joined' },
  { name: 'health', desc: 'health %' },
  { name: 'mana',   desc: 'mana %' },
  { name: 'stance', desc: 'current stance' },
  { name: 'spell',  desc: 'prepared spell' },
  { name: 'left',   desc: 'left hand item' },
  { name: 'right',  desc: 'right hand item' },
  { name: 'room',   desc: 'room name' },
  { name: 'roomid', desc: 'room id number' },
  { name: 'exits',  desc: 'room exits (comma-separated)' },
]

export const MACRO_VARS: { name: string; desc: string }[] = [
  { name: 'health',        desc: 'health %' },
  { name: 'mana',          desc: 'mana %' },
  { name: 'stamina',       desc: 'stamina %' },
  { name: 'spirit',        desc: 'spirit %' },
  { name: 'concentration', desc: 'concentration %' },
  { name: 'rt',            desc: 'roundtime seconds' },
  { name: 'ct',            desc: 'cast time seconds' },
  { name: 'stance',        desc: 'current stance' },
  { name: 'spell',         desc: 'prepared spell' },
  { name: 'left',          desc: 'left hand item' },
  { name: 'right',         desc: 'right hand item' },
  { name: 'room',          desc: 'room name' },
  { name: 'roomid',        desc: 'room id number' },
  { name: 'exits',         desc: 'room exits (comma-separated)' },
  { name: 'bleeding',      desc: 'true/false' },
  { name: 'poisoned',      desc: 'true/false' },
  { name: 'diseased',      desc: 'true/false' },
  { name: 'stunned',       desc: 'true/false' },
  { name: 'unconscious',   desc: 'true/false (needs statusprompt)' },
  { name: 'webbed',        desc: 'true/false' },
  { name: 'joined',        desc: 'true/false' },
  { name: 'hidden',        desc: 'true/false' },
  { name: 'invisible',     desc: 'true/false' },
  { name: 'dead',          desc: 'true/false' },
]

// ── Special macro tokens (v0.8.3) ─────────────────────────────────────────────
// A token is a `{Name}` placeholder a macro can use as its command text. When
// the macro fires the token is resolved at dispatch time, not at definition
// time — so it can reference live state (the player's command history, what's
// currently typed in the command bar). Tokens are matched only when they
// occupy an entire command entry (`cmd.trim() === '{Token}'`). Mixed text
// like `cast spell ; {RepeatLast}` is sent literally — keeps the parser
// trivial and matches Frostbite's surface syntax. Seeded into new character
// profiles as Ctrl+Enter / Alt+Enter / NumpadEnter macros so the
// Stormfront/Wrayth repeat-command convention works out of the box.

export type MacroTokenName =
  | 'RepeatLast'
  | 'RepeatSecondToLast'
  | 'ReturnOrRepeatLast'

export const MACRO_TOKENS: { name: MacroTokenName; desc: string }[] = [
  { name: 'RepeatLast',         desc: 'send the previous command you typed' },
  { name: 'RepeatSecondToLast', desc: 'send the command before that' },
  { name: 'ReturnOrRepeatLast', desc: 'if the command bar has text, send it; otherwise send the last command' },
]

const MACRO_TOKEN_NAMES = new Set<string>(MACRO_TOKENS.map(t => t.name))

export function getMacroToken(cmd: string): MacroTokenName | null {
  const m = cmd.trim().match(/^\{(\w+)\}$/)
  if (!m) return null
  return MACRO_TOKEN_NAMES.has(m[1]) ? (m[1] as MacroTokenName) : null
}
