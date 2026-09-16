// Slash Commands ("Client Commands", DESIGN.md §37) — keyboard-speed client
// control from the command bar. A `/`-leading line NEVER reaches the game:
// known commands execute, unknown commands fail closed with a hint, and `//x`
// escapes to send a literal `/x`. Intercepted at the top of GameWindow's
// dispatchUserText (the canonical typed-input path, pitfall #31).
//
// REGISTRY, NOT IF-CHAIN (the §35 capturer-registry philosophy): the single
// SLASH_COMMANDS array drives the parser, the palette's command list +
// signatures + live validation, and /help. Adding a command = one entry here.
//
// Executors mutate through the EXISTING rails only — the SlashContext the
// GameWindow builds wraps the same save/set/saveProfile calls a panel save
// makes, so a slash-created rule is byte-compatible with an editor-created one.

import { newHighlight, type HighlightRule, HIGHLIGHT_EFFECTS } from './highlights'
import { CMD_HISTORY_MIN_MAX } from './commandHistorySettings'
import { newMute, type MuteRule } from './mutes'
import { newSubstitute, type SubstituteRule } from './substitutes'
import { newContact, newTemplate, formatLastSeen, DR_GUILDS, type Contact, type ContactTemplate } from './contacts'
import { newAlias, type AliasRule } from './macros'
import { newTrigger, type TriggerRule } from './triggers'

// Automations-panel tabs an `edit` verb can open (Phase 2). Matches the
// AutomationsPanel Tab union for the tabs that support open-by-rule-id.
export type SlashEditorTab = 'highlights' | 'triggers' | 'mutes' | 'substitutes' | 'aliases'

// ── Context the GameWindow provides ─────────────────────────────────────────

export interface SlashContext {
  character: string
  getHighlights: () => HighlightRule[]
  applyHighlights: (rules: HighlightRule[]) => void   // save + setState + saveProfile
  getMutes: () => MuteRule[]
  applyMutes: (rules: MuteRule[]) => void
  getSubstitutes: () => SubstituteRule[]
  applySubstitutes: (rules: SubstituteRule[]) => void
  // Contacts: apply = saveContacts + setContacts TOGETHER (+ saveProfile) — the
  // pitfall-#36 blessed path; the B119 cleanup effect then drops any in-flight
  // room-tracking buffer so a stale flush can't clobber the slash edit.
  getContacts: () => Contact[]
  applyContacts: (contacts: Contact[]) => void
  getContactTemplates: () => ContactTemplate[]
  applyContactTemplates: (templates: ContactTemplate[]) => void
  getAliases: () => AliasRule[]
  applyAliases: (rules: AliasRule[]) => void
  getTriggers: () => TriggerRule[]
  applyTriggers: (rules: TriggerRule[]) => void
  getMainTimestamps: () => boolean
  /** App-wide command-history minimum length (F82). Read/write via the ctx so
   *  the registry stays pure — it never touches storage itself. */
  getCommandHistoryMinLength: () => number
  setCommandHistoryMinLength: (n: number) => void
  toggleMainTimestamps: () => void
  /** Views (v0.19.0, DESIGN §47). Same rule as the history settings above: the
   *  registry entry stays a dumb matcher and every read/write goes through the
   *  ctx, so the command can never diverge from what the toggle does. */
  getViewMode: () => 'session' | 'overview'
  setViewMode: (m: 'session' | 'overview') => void
  getOverviewOptions: () => Record<string, unknown>
  setOverviewOptions: (patch: Record<string, unknown>) => void
  /** Which stream THIS character's Overview card shows (per character). */
  getOverviewStream: () => string
  setOverviewStream: (id: string) => void
  /** One row per character, for `/view status` — the keyboard path to the grid. */
  getOverviewSummary: () => { character: string; connected: boolean; healthPct: number | null; flags: string[] }[]
  // Phase 2 `edit` verbs: open the Automations panel at `tab` with the rule
  // selected in its detail pane (the TriggersPanel openRuleId pattern).
  openRuleEditor: (tab: SlashEditorTab, ruleId: string) => void
  // ── Phase 3: client control (DESIGN §37.5). These drive UI STATE, so the
  // integration lives in GameWindow's implementations; executors stay dumb
  // matchers + messengers. ──
  getModes: () => { id: string; name: string }[]
  getActiveModeId: () => string | null
  applyMode: (id: string) => void
  clearMode: () => void
  getGroups: () => { id: string; name: string; on: boolean }[]
  setGroupOn: (id: string, on: boolean) => void
  getThemes: () => { id: string; name: string }[]     // built-ins + custom
  getCurrentThemeId: () => string
  applyThemeId: (id: string) => void
  getOpenableStreams: () => string[]                  // builtin panel types + discovered
  getOpenPanels: () => string[]                       // mode-appropriate (pitfall #79)
  openPanel: (id: string) => 'opened' | 'focused'
  closePanel: (id: string) => boolean                 // false = wasn't open
  openLogSearch: (query: string) => void
  clearMain: () => void
  // Managed named colors (v0.14.6): customs are APP-WIDE (a color vocabulary
  // is shared, like themes) — apply = saveCustomColors + scheduleSharedProfileSave.
  getCustomColors: () => CustomColor[]
  applyCustomColors: (list: CustomColor[]) => void
  // ── AI (BYOK — DESIGN §10). getAIState reads the app-wide config sync + the
  // main-fetched key-presence flag; setAIEnabled flips the master toggle;
  // aiCatchup fires the async Catch Me Up (consent gate + stream) in GameWindow
  // and reports whether it started, needs consent, or is disabled. ──
  getAIState: () => { enabled: boolean; keyPresent: boolean; model: string }
  setAIEnabled: (on: boolean) => void
  // minutes = how far back to summarize; null = the default window (see runCatchup).
  aiCatchup: (minutes: number | null) => 'started' | 'consent' | 'disabled' | 'nokey'
  aiCancel: () => boolean   // true if a run was actually in flight and got stopped
  // ── SimuCoin (F71, DESIGN §42) — app-level, per ACCOUNT. The registry stays
  // pure: GameWindow supplies these, delegating to the App-owned state so the
  // slash path and the coin button drive exactly the same lifecycle. Runs are
  // ASYNC (a store round-trip) while executors are synchronous, so simucoinRun
  // returns only whether it STARTED. The OUTCOME is reported separately: when
  // each account's run settles, GameWindow appends its `simucoinRowText` line
  // to the window that issued the command (plus the toast + coin popover).
  // Without that, `/simucoin check` said "Checking the SimuCoin store…" and
  // then nothing — the one command whose whole purpose is to answer "do I have
  // coins?" never answered it (Sekmeht, 2026-07-27). ──
  simucoinStatus: () => SimuCoinRow[]
  simucoinRun: (claim: boolean, account?: string) =>
    'started' | 'none' | 'unconsented' | 'unknown-account' | 'busy'
}

// One account's outcome, in the shape the slash layer renders.
export type SimuCoinRow = {
  account: string; state: string
  balance: number | null; amount: number | null; message: string | null
}

// The ONE formatter for an account's result line. Shared by the bare
// `/simucoin` status readout AND by the async report `/simucoin check` and
// `claim` emit when their store round-trip finishes — so "what did it find?"
// reads identically no matter which command asked. Keep it that way: a second
// copy is how the two drift into describing the same state differently.
export function simucoinRowText(r: SimuCoinRow): string {
  const bal = r.balance != null ? `${r.balance} SimuCoins` : 'balance unknown'
  if (r.state === 'claimable')   return `${r.account}: ${r.amount} FREE SimuCoins ready to claim (${bal}) — /simucoin claim`
  if (r.state === 'claimed')     return `${r.account}: claimed ${r.amount} (${bal})`
  if (r.state === 'auth-failed') return `${r.account}: sign-in failed${r.message ? ` — ${r.message}` : ''}`
  if (r.state === 'error')       return `${r.account}: store unreachable${r.message ? ` — ${r.message}` : ''}`
  return `${r.account}: nothing to claim${r.message ? ` — ${r.message}` : ''} (${bal})`
}

// A result line is usually a plain string (rendered as internal-system text).
// A RICH line carries colored runs — e.g. /colors renders each name in its own
// color. `color` is a '#hex'; GameWindow maps it onto TextSegment.fg (inline
// color wins over the preset's CSS, the B200 mechanics).
export interface SlashRichSeg { text: string; color?: string }
export type SlashLine = string | { rich: SlashRichSeg[] }

export interface SlashResult {
  ok: boolean
  lines: SlashLine[]   // client-styled lines echoed into the main window
}

/** Plain text of a result line (for the Session Log + tests). */
export function slashLineText(l: SlashLine): string {
  return typeof l === 'string' ? l : l.rich.map(s => s.text).join('')
}

// ── Colors ───────────────────────────────────────────────────────────────────
// The palette lives in colors.ts (curated 16 > user customs > the standard web
// set — Genie's vocabulary). Re-exported so palette/consumers keep one import.

import { CURATED_COLORS, WEB_COLORS, resolveColor, isHexColor, validateCustomColorName, type CustomColor } from './colors'
import { modelLabel } from './aiConfig'
export { resolveColor }

/** True when a token was probably MEANT as a color (for targeted error text). */
function looksLikeColor(token: string): boolean {
  return token.startsWith('#') || resolveColor(token) !== null
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

export interface SlashToken {
  value: string
  quoted: boolean
  key?: string      // present for key=value tokens (key lowercased)
}

// Splits on whitespace, honoring "double quotes" (with \" escapes) and
// key=value pairs whose value may itself be quoted (mode=regex, name="my rule").
export function tokenizeSlash(input: string): SlashToken[] {
  const out: SlashToken[] = []
  let i = 0
  const n = input.length
  while (i < n) {
    while (i < n && /\s/.test(input[i])) i++
    if (i >= n) break
    let key: string | undefined
    // key= prefix (bare word followed by '=')
    const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*)=/.exec(input.slice(i))
    if (keyMatch) { key = keyMatch[1].toLowerCase(); i += keyMatch[0].length }
    let value = ''
    let quoted = false
    if (input[i] === '"') {
      quoted = true
      i++
      while (i < n) {
        if (input[i] === '\\' && input[i + 1] === '"') { value += '"'; i += 2; continue }
        if (input[i] === '"') { i++; break }
        value += input[i++]
      }
    } else {
      while (i < n && !/\s/.test(input[i])) value += input[i++]
    }
    out.push({ value, quoted, key })
  }
  return out
}

// ── Registry ─────────────────────────────────────────────────────────────────

export interface SlashArgSpec {
  name: string                       // display name in the signature
  required: boolean
  kind: 'string' | 'color' | 'word'
  hint?: string
  // A required arg is normally also required NON-EMPTY (`/highlight add ""`
  // must not mint a dead empty-pattern rule). Set allowEmpty for the rare arg
  // where '' is meaningful — e.g. /sub add's replacement ("" = delete the text).
  allowEmpty?: boolean
}

export interface SlashOptionSpec {
  key: string
  values?: string[]                  // enum; omitted = free string
  hint: string
}

export interface SlashCommandSpec {
  noun: string
  nounAliases: string[]
  verb: string                       // '' = noun-only command (e.g. /timestamps on)
  args: SlashArgSpec[]               // positional
  options: SlashOptionSpec[]         // key=value
  flags: string[]                    // bare booleans
  description: string
  example: string
  run: (ctx: SlashContext, p: ParsedSlash) => SlashResult
}

export interface ParsedSlash {
  args: string[]                        // positional values, in spec order
  options: Record<string, string>
  flags: Set<string>
}

const err = (...lines: SlashLine[]): SlashResult => ({ ok: false, lines })
const ok = (...lines: SlashLine[]): SlashResult => ({ ok: true, lines })

// Shared summary formatters (also used by /list output).
const hlSummary = (r: HighlightRule) =>
  `"${r.pattern}" (${r.style.textColor}${r.style.bgColor !== 'transparent' ? ` on ${r.style.bgColor}` : ''}${r.style.bold ? ', bold' : ''}${r.style.glow ? ', glow' : ''}, ${r.scope}, ${r.mode})`
const muteSummary = (r: MuteRule) =>
  `"${r.pattern}" (${r.scope === 'line' ? 'hides line' : 'strips match'}, ${r.mode}${r.stream ? `, ${r.stream} only` : ''})`
const subSummary = (r: SubstituteRule) =>
  `"${r.pattern}" → "${r.replacement}" (${r.mode})`

// Generic remove-by-pattern-or-name across a rule list.
function removeRules<T extends { pattern: string; name: string }>(
  rules: T[], target: string,
): { kept: T[]; removed: T[] } {
  const t = target.toLowerCase()
  const removed = rules.filter(r => r.pattern.toLowerCase() === t || (r.name && r.name.toLowerCase() === t))
  return { kept: rules.filter(r => !removed.includes(r)), removed }
}

// Phase 2 `edit` verb body, shared by every editable rule type: find by the
// noun's match field (pattern/input) or name, open the editor, report.
function editRule<T extends { id: string; name: string }>(
  ctx: SlashContext, tab: SlashEditorTab, kind: string, rules: T[], target: string, fieldOf: (r: T) => string,
): SlashResult {
  const t = target.toLowerCase()
  const matches = rules.filter(r => fieldOf(r).toLowerCase() === t || (r.name && r.name.toLowerCase() === t))
  if (matches.length === 0) return err(`No ${kind} matches "${target}" (by ${kind === 'alias' ? 'input' : 'pattern'} or name) — /${kind === 'substitute' ? 'sub' : kind} list to see them.`)
  ctx.openRuleEditor(tab, matches[0].id)
  return ok(`Opened "${fieldOf(matches[0])}" in the editor${matches.length > 1 ? ` (first of ${matches.length} matches)` : ''}.`)
}

function listRules<T>(kind: string, rules: T[], filter: string | undefined, summarize: (r: T) => string, patternOf: (r: T) => string, where = 'the Automations panel'): SlashResult {
  const f = filter?.toLowerCase()
  const matched = f ? rules.filter(r => patternOf(r).toLowerCase().includes(f)) : rules
  if (matched.length === 0) return ok(f ? `No ${kind}s match "${filter}".` : `No ${kind}s defined.`)
  const MAX = 15
  const lines = matched.slice(0, MAX).map(r => `  · ${summarize(r)}`)
  if (matched.length > MAX) lines.push(`  … and ${matched.length - MAX} more (see ${where}).`)
  return ok(`${matched.length} ${kind}${matched.length === 1 ? '' : 's'}${f ? ` matching "${filter}"` : ''}:`, ...lines)
}

// `/ai catchup 30m` — a free-form duration. Type whatever you actually mean:
//   27m · 4m · 90 (bare = minutes) · 2h · 2.7h · 1.5h · 1h30m · 1h30
// Fractions are allowed on either unit and the result is rounded to whole
// minutes. Returns minutes, or null when the token isn't a duration at all.
// Ceiling raised 24h → 1 YEAR in v0.17.1: Catch Me Up now reads the session LOG
// (day-by-day in main), so long windows are supported. The 24h cap was a leftover
// from the screen-only era (the screen buffer couldn't reach past a few thousand
// lines anyway). Keep it aligned with the largest CATCHUP_TIERS window.
export const CATCHUP_MAX_MINUTES = 366 * 24 * 60
export function parseDuration(token: string): number | null {
  const t = token.trim().toLowerCase()
  if (!t) return null
  const num = String.raw`\d+(?:\.\d+)?`
  // Combined form first, so "1h30m" doesn't get mistaken for a bare "1h".
  const combo = new RegExp(`^(${num})\\s*h\\s*(${num})\\s*m?$`).exec(t)
  // Units (Sekmeht): m=minute, h=hour, d=day, mo=month, y=year. `mo` MUST be
  // matched before `m` — the alternation is longest-first, otherwise "2mo" would
  // read as 2 minutes with a stray "o" (and, with `$` anchored, fail outright).
  // Bare number = minutes, as before.
  const UNIT_MINUTES: Record<string, number> = {
    m: 1, h: 60, d: 60 * 24, mo: 60 * 24 * 30, y: 60 * 24 * 365,
  }
  const single = combo ? null : new RegExp(`^(${num})\\s*(mo|m|h|d|y)?$`).exec(t)
  let mins: number
  if (combo) {
    mins = Number(combo[1]) * 60 + Number(combo[2])
  } else if (single) {
    mins = Number(single[1]) * (UNIT_MINUTES[single[2] ?? 'm'] ?? 1)
  } else {
    return null
  }
  if (!Number.isFinite(mins)) return null
  const rounded = Math.round(mins)
  return rounded > 0 ? rounded : null   // "0.2m" rounds to nothing — reject it
}

const MODE_OPT: SlashOptionSpec = { key: 'mode', values: ['text', 'phrase', 'regex'], hint: 'how the pattern matches (text = whole words, phrase = exact substring, regex)' }
const CASE_OPT: SlashOptionSpec = { key: 'case', values: ['on', 'off'], hint: 'case-sensitive matching' }

export const SLASH_COMMANDS: SlashCommandSpec[] = [
  // ── /highlight ──────────────────────────────────────────────────────────
  {
    noun: 'highlight', nounAliases: ['hl'], verb: 'add',
    args: [
      { name: '"pattern"', required: true, kind: 'string', hint: 'the text to highlight' },
      { name: 'color', required: false, kind: 'color', hint: 'named color or #hex (default gold) — /colors shows them' },
    ],
    options: [
      { key: 'bg', hint: 'background color (named or #hex)' },
      MODE_OPT,
      { key: 'scope', values: ['match', 'line'], hint: 'color just the match, or the whole line' },
      CASE_OPT,
      { key: 'effect', values: HIGHLIGHT_EFFECTS.map(e => e.value), hint: 'a text effect: glow, shimmer, rainbow, pulse, gold, gradient, fire, frost, neon, wave, bounce' },
      { key: 'name', hint: 'a label for the rule' },
    ],
    flags: ['bold', 'glow'],
    description: 'Create a highlight for matching text',
    example: '/highlight add "dragon" gold effect=shimmer',
    run: (ctx, p) => {
      const [pattern, colorTok] = p.args
      const rule = newHighlight(pattern, (p.options.scope as 'match' | 'line') ?? 'match')
      if (colorTok) {
        const c = resolveColor(colorTok)
        if (!c) return err(`"${colorTok}" isn't a color — use a name (red, blue, gold, …) or #hex.`)
        rule.style.textColor = c
        rule.style.glowColor = c
      }
      if (p.options.bg) {
        const c = resolveColor(p.options.bg)
        if (!c) return err(`bg "${p.options.bg}" isn't a color — use a name or #hex.`)
        rule.style.bgColor = c
      }
      if (p.options.mode) rule.mode = p.options.mode as HighlightRule['mode']
      if (p.options.case) rule.caseSensitive = p.options.case === 'on'
      if (p.options.name) rule.name = p.options.name
      if (p.options.effect) {
        const fx = p.options.effect.toLowerCase()
        if (!HIGHLIGHT_EFFECTS.some(e => e.value === fx)) return err(`"${p.options.effect}" isn't an effect — try glow, shimmer, rainbow, pulse, gold, gradient, fire, frost, neon, wave, or bounce.`)
        rule.style.effect = fx as HighlightRule['style']['effect']
        rule.style.glow = fx === 'glow'
      }
      if (p.flags.has('bold')) rule.style.bold = true
      if (p.flags.has('glow')) rule.style.glow = true
      if (rule.mode === 'regex') { try { new RegExp(rule.pattern) } catch { return err(`"${rule.pattern}" isn't a valid regex.`) } }
      ctx.applyHighlights([...ctx.getHighlights(), rule])
      return ok(`Highlight added: ${hlSummary(rule)}`)
    },
  },
  {
    noun: 'highlight', nounAliases: ['hl'], verb: 'remove',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the rule(s) to remove' }],
    options: [], flags: [],
    description: 'Remove highlight(s) by pattern or name',
    example: '/highlight remove "goblin"',
    run: (ctx, p) => {
      const { kept, removed } = removeRules(ctx.getHighlights(), p.args[0])
      if (removed.length === 0) return err(`No highlight matches "${p.args[0]}" (by pattern or name).`)
      ctx.applyHighlights(kept)
      return ok(`Removed ${removed.length} highlight${removed.length === 1 ? '' : 's'}: ${removed.map(r => `"${r.pattern}"`).join(', ')}`)
    },
  },
  {
    noun: 'highlight', nounAliases: ['hl'], verb: 'list',
    args: [{ name: 'filter', required: false, kind: 'string', hint: 'only show patterns containing this' }],
    options: [], flags: [],
    description: 'List highlights (optionally filtered)',
    example: '/highlight list gob',
    run: (ctx, p) => listRules('highlight', ctx.getHighlights(), p.args[0], hlSummary, r => r.pattern),
  },
  {
    noun: 'highlight', nounAliases: ['hl'], verb: 'edit',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the highlight to edit' }],
    options: [], flags: [],
    description: 'Open a highlight in the Automations editor',
    example: '/highlight edit "goblin"',
    run: (ctx, p) => editRule(ctx, 'highlights', 'highlight', ctx.getHighlights(), p.args[0].trim(), r => r.pattern),
  },

  // ── /mute ───────────────────────────────────────────────────────────────
  {
    noun: 'mute', nounAliases: ['gag'], verb: 'add',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'lines matching this get hidden' }],
    options: [
      { key: 'scope', values: ['line', 'match'], hint: 'hide the whole line, or strip just the matched text' },
      MODE_OPT,
      CASE_OPT,
      { key: 'name', hint: 'a label for the rule' },
    ],
    flags: [],
    description: 'Hide lines (or strip text) matching a pattern',
    example: '/mute add "swirling fog"',
    run: (ctx, p) => {
      const rule = newMute(p.args[0], (p.options.mode as MuteRule['mode']) ?? 'phrase')
      if (p.options.scope) rule.scope = p.options.scope as MuteRule['scope']
      if (p.options.case) rule.caseSensitive = p.options.case === 'on'
      if (p.options.name) rule.name = p.options.name
      if (rule.mode === 'regex') { try { new RegExp(rule.pattern) } catch { return err(`"${rule.pattern}" isn't a valid regex.`) } }
      ctx.applyMutes([...ctx.getMutes(), rule])
      return ok(`Mute added: ${muteSummary(rule)}`)
    },
  },
  {
    noun: 'mute', nounAliases: ['gag'], verb: 'remove',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the rule(s) to remove' }],
    options: [], flags: [],
    description: 'Remove mute(s) by pattern or name',
    example: '/mute remove "swirling fog"',
    run: (ctx, p) => {
      const { kept, removed } = removeRules(ctx.getMutes(), p.args[0])
      if (removed.length === 0) return err(`No mute matches "${p.args[0]}" (by pattern or name).`)
      ctx.applyMutes(kept)
      return ok(`Removed ${removed.length} mute${removed.length === 1 ? '' : 's'}: ${removed.map(r => `"${r.pattern}"`).join(', ')}`)
    },
  },
  {
    noun: 'mute', nounAliases: ['gag'], verb: 'list',
    args: [{ name: 'filter', required: false, kind: 'string', hint: 'only show patterns containing this' }],
    options: [], flags: [],
    description: 'List mutes (optionally filtered)',
    example: '/mute list',
    run: (ctx, p) => listRules('mute', ctx.getMutes(), p.args[0], muteSummary, r => r.pattern),
  },
  {
    noun: 'mute', nounAliases: ['gag'], verb: 'edit',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the mute to edit' }],
    options: [], flags: [],
    description: 'Open a mute in the Automations editor',
    example: '/mute edit "swirling fog"',
    run: (ctx, p) => editRule(ctx, 'mutes', 'mute', ctx.getMutes(), p.args[0].trim(), r => r.pattern),
  },

  // ── /sub ────────────────────────────────────────────────────────────────
  {
    noun: 'sub', nounAliases: ['substitute'], verb: 'add',
    args: [
      { name: '"pattern"', required: true, kind: 'string', hint: 'the text to rewrite' },
      { name: '"replacement"', required: true, kind: 'string', allowEmpty: true, hint: 'what it becomes ($1, $& capture refs ok; "" deletes the text)' },
    ],
    options: [MODE_OPT, CASE_OPT, { key: 'name', hint: 'a label for the rule' }],
    flags: [],
    description: 'Rewrite matching text into something else',
    example: '/sub add "a musty odor" "STINK"',
    run: (ctx, p) => {
      const rule = newSubstitute(p.args[0], p.args[1])
      if (p.options.mode) rule.mode = p.options.mode as SubstituteRule['mode']
      if (p.options.case) rule.caseSensitive = p.options.case === 'on'
      if (p.options.name) rule.name = p.options.name
      if (rule.mode === 'regex') { try { new RegExp(rule.pattern) } catch { return err(`"${rule.pattern}" isn't a valid regex.`) } }
      ctx.applySubstitutes([...ctx.getSubstitutes(), rule])
      return ok(`Substitute added: ${subSummary(rule)}`)
    },
  },
  {
    noun: 'sub', nounAliases: ['substitute'], verb: 'remove',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the rule(s) to remove' }],
    options: [], flags: [],
    description: 'Remove substitute(s) by pattern or name',
    example: '/sub remove "a musty odor"',
    run: (ctx, p) => {
      const { kept, removed } = removeRules(ctx.getSubstitutes(), p.args[0])
      if (removed.length === 0) return err(`No substitute matches "${p.args[0]}" (by pattern or name).`)
      ctx.applySubstitutes(kept)
      return ok(`Removed ${removed.length} substitute${removed.length === 1 ? '' : 's'}: ${removed.map(r => `"${r.pattern}"`).join(', ')}`)
    },
  },
  {
    noun: 'sub', nounAliases: ['substitute'], verb: 'list',
    args: [{ name: 'filter', required: false, kind: 'string', hint: 'only show patterns containing this' }],
    options: [], flags: [],
    description: 'List substitutes (optionally filtered)',
    example: '/sub list',
    run: (ctx, p) => listRules('substitute', ctx.getSubstitutes(), p.args[0], subSummary, r => r.pattern),
  },
  {
    noun: 'sub', nounAliases: ['substitute'], verb: 'edit',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the substitute to edit' }],
    options: [], flags: [],
    description: 'Open a substitute in the Automations editor',
    example: '/sub edit "a musty odor"',
    run: (ctx, p) => editRule(ctx, 'substitutes', 'substitute', ctx.getSubstitutes(), p.args[0].trim(), r => r.pattern),
  },

  // ── /alias ──────────────────────────────────────────────────────────────
  {
    noun: 'alias', nounAliases: ['aliases'], verb: 'add',
    args: [
      { name: '"input"', required: true, kind: 'string', hint: 'what you type (the first word(s) of a command)' },
      { name: '"commands"', required: true, kind: 'string', hint: 'what gets sent — separate multiple with ; ($1 $rest args ok)' },
    ],
    options: [
      { key: 'delay', hint: 'ms between each command (e.g. delay=500)' },
      { key: 'name', hint: 'a label for the rule' },
    ],
    flags: ['passthrough'],
    description: 'Create a typed-command alias',
    example: '/alias add "hh" "health;heal"',
    run: (ctx, p) => {
      const input = p.args[0].trim()
      const aliases = ctx.getAliases()
      if (aliases.some(a => a.input.toLowerCase() === input.toLowerCase()))
        return err(`An alias "${input}" already exists — /alias edit "${input}" to change it, or /alias remove first.`)
      const commands = p.args[1].split(';').map(c => c.trim()).filter(Boolean)
      if (commands.length === 0) return err('The alias needs at least one command to send.')
      let delayMs = 0
      if (p.options.delay !== undefined) {
        delayMs = Number(p.options.delay)
        if (!Number.isFinite(delayMs) || delayMs < 0) return err(`delay= must be a number of milliseconds — not "${p.options.delay}".`)
      }
      const rule = newAlias(input)
      rule.commands = commands
      rule.delayMs = delayMs
      if (p.options.name) rule.name = p.options.name
      if (p.flags.has('passthrough')) rule.passThrough = true
      ctx.applyAliases([...aliases, rule])
      return ok(`Alias added: "${input}" → ${commands.join('; ')}${delayMs ? ` (${delayMs}ms between)` : ''}`)
    },
  },
  {
    noun: 'alias', nounAliases: ['aliases'], verb: 'remove',
    args: [{ name: '"input"', required: true, kind: 'string', hint: 'input or name of the alias(es) to remove' }],
    options: [], flags: [],
    description: 'Remove alias(es) by input or name',
    example: '/alias remove "hh"',
    run: (ctx, p) => {
      const t = p.args[0].trim().toLowerCase()
      const aliases = ctx.getAliases()
      const removed = aliases.filter(a => a.input.toLowerCase() === t || (a.name && a.name.toLowerCase() === t))
      if (removed.length === 0) return err(`No alias matches "${p.args[0]}" (by input or name).`)
      ctx.applyAliases(aliases.filter(a => !removed.includes(a)))
      return ok(`Removed ${removed.length} alias${removed.length === 1 ? '' : 'es'}: ${removed.map(a => `"${a.input}"`).join(', ')}`)
    },
  },
  {
    noun: 'alias', nounAliases: ['aliases'], verb: 'list',
    args: [{ name: 'filter', required: false, kind: 'string', hint: 'only show inputs containing this' }],
    options: [], flags: [],
    description: 'List aliases (optionally filtered)',
    example: '/alias list',
    run: (ctx, p) => listRules('alias', ctx.getAliases(), p.args[0],
      a => `"${a.input}" → ${a.commands.join('; ')}${a.delayMs ? ` (${a.delayMs}ms)` : ''}${a.passThrough ? ' +passthrough' : ''}`,
      a => a.input),
  },
  {
    noun: 'alias', nounAliases: ['aliases'], verb: 'edit',
    args: [{ name: '"input"', required: true, kind: 'string', hint: 'input or name of the alias to edit' }],
    options: [], flags: [],
    description: 'Open an alias in the Automations editor',
    example: '/alias edit "hh"',
    run: (ctx, p) => editRule(ctx, 'aliases', 'alias', ctx.getAliases(), p.args[0].trim(), a => a.input),
  },

  // ── /trigger (quick-form) ───────────────────────────────────────────────
  {
    noun: 'trigger', nounAliases: ['triggers'], verb: 'add',
    args: [
      { name: '"pattern"', required: true, kind: 'string', hint: 'the game text to react to' },
      { name: 'do', required: false, kind: 'word', hint: 'the word "do" (reads nicely; optional)' },
      { name: '"command"', required: false, kind: 'string', hint: 'the command to send when it fires' },
    ],
    options: [
      MODE_OPT,
      CASE_OPT,
      { key: 'cooldown', hint: 'seconds before it can fire again (e.g. cooldown=10)' },
      { key: 'name', hint: 'a label for the rule' },
    ],
    flags: ['once'],
    description: 'Quick trigger: when text matches, send a command (gates/multi-action in the editor)',
    example: '/trigger add "You feel fully rested" do "stand"',
    run: (ctx, p) => {
      // Accept both `"pattern" do "command"` and `"pattern" "command"` — the
      // literal `do` is readable sugar, not load-bearing.
      const [pattern, a, b] = p.args
      const command = (a === 'do' ? b : a)?.trim()
      if (!command) return err(`Missing the command to send — e.g. ${'`'}/trigger add "You feel fully rested" do "stand"${'`'}`)
      const rule = newTrigger(pattern)
      if (p.options.mode) rule.mode = p.options.mode as TriggerRule['mode']
      if (p.options.case) rule.caseSensitive = p.options.case === 'on'
      if (p.options.name) rule.name = p.options.name
      if (p.options.cooldown !== undefined) {
        const cd = Number(p.options.cooldown)
        if (!Number.isFinite(cd) || cd < 0) return err(`cooldown= must be a number of seconds — not "${p.options.cooldown}".`)
        rule.cooldownSeconds = cd
      }
      if (p.flags.has('once')) rule.oneShot = true
      if (rule.mode === 'regex') { try { new RegExp(rule.pattern) } catch { return err(`"${rule.pattern}" isn't a valid regex.`) } }
      rule.actions[0].command = command   // newTrigger ships with one command action
      ctx.applyTriggers([...ctx.getTriggers(), rule])
      return ok(`Trigger added: "${pattern}" → ${command}${rule.cooldownSeconds ? ` (cooldown ${rule.cooldownSeconds}s)` : ''}${rule.oneShot ? ' (once)' : ''} — gates/more actions in the editor (/trigger edit).`)
    },
  },
  {
    noun: 'trigger', nounAliases: ['triggers'], verb: 'remove',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the trigger(s) to remove' }],
    options: [], flags: [],
    description: 'Remove trigger(s) by pattern or name',
    example: '/trigger remove "You feel fully rested"',
    run: (ctx, p) => {
      const { kept, removed } = removeRules(ctx.getTriggers(), p.args[0])
      if (removed.length === 0) return err(`No trigger matches "${p.args[0]}" (by pattern or name).`)
      ctx.applyTriggers(kept)
      return ok(`Removed ${removed.length} trigger${removed.length === 1 ? '' : 's'}: ${removed.map(r => `"${r.pattern}"`).join(', ')}`)
    },
  },
  {
    noun: 'trigger', nounAliases: ['triggers'], verb: 'list',
    args: [{ name: 'filter', required: false, kind: 'string', hint: 'only show patterns containing this' }],
    options: [], flags: [],
    description: 'List triggers (optionally filtered)',
    example: '/trigger list',
    run: (ctx, p) => listRules('trigger', ctx.getTriggers(), p.args[0],
      r => {
        const act = r.actions[0]
        const what = act?.type === 'command' && act.command ? act.command : `${r.actions.length} action${r.actions.length === 1 ? '' : 's'}`
        return `"${r.pattern}" → ${what} (${r.watchStream}, ${r.mode}${r.cooldownSeconds ? `, cd ${r.cooldownSeconds}s` : ''}${r.oneShot ? ', once' : ''})`
      },
      r => r.pattern),
  },
  {
    noun: 'trigger', nounAliases: ['triggers'], verb: 'edit',
    args: [{ name: '"pattern"', required: true, kind: 'string', hint: 'pattern or name of the trigger to edit' }],
    options: [], flags: [],
    description: 'Open a trigger in the Automations editor',
    example: '/trigger edit "You feel fully rested"',
    run: (ctx, p) => editRule(ctx, 'triggers', 'trigger', ctx.getTriggers(), p.args[0].trim(), r => r.pattern),
  },

  // ── /contact ────────────────────────────────────────────────────────────
  {
    noun: 'contact', nounAliases: ['contacts'], verb: 'add',
    args: [
      { name: '"name"', required: true, kind: 'string', hint: 'the player name (one word)' },
      { name: 'template', required: false, kind: 'string', hint: 'an existing template (e.g. Friends, Enemies)' },
    ],
    options: [
      { key: 'template', hint: 'same as the positional template' },
      { key: 'guild', hint: `their guild (${DR_GUILDS.filter(g => g !== 'Unknown').slice(0, 3).join(', ')}, …)` },
      { key: 'notes', hint: 'a note on the contact' },
    ],
    flags: [],
    description: 'Add a player as a contact (or move one to a template)',
    example: '/contact add "Bob" Friends',
    run: (ctx, p) => {
      const rawName = p.args[0].trim()
      if (!/^[A-Za-z][A-Za-z'-]*$/.test(rawName)) return err(`"${rawName}" doesn't look like a player name (one word, letters only).`)
      const name = rawName[0].toUpperCase() + rawName.slice(1)
      // Resolve template by name (case-insensitive) — must EXIST; a typo must
      // not silently mint an empty template (that's /template add's job).
      const tplName = p.options.template ?? p.args[1]
      let template: ContactTemplate | null = null
      if (tplName) {
        template = ctx.getContactTemplates().find(t => t.name.toLowerCase() === tplName.toLowerCase()) ?? null
        if (!template) {
          const names = ctx.getContactTemplates().map(t => t.name).join(', ')
          return err(`No contact template "${tplName}". You have: ${names || '(none)'}. Create one with /template add.`)
        }
      }
      let guild: string | undefined
      if (p.options.guild) {
        guild = DR_GUILDS.find(g => g.toLowerCase() === p.options.guild.toLowerCase())
        if (!guild) return err(`"${p.options.guild}" isn't a DR guild (${DR_GUILDS.join(', ')}).`)
      }
      const contacts = ctx.getContacts()
      const existing = contacts.find(c => c.name.toLowerCase() === name.toLowerCase())
      if (existing) {
        // "Add Bob to Enemies" is the same gesture whether or not he's already a
        // contact — with a template (or guild/notes) given, UPDATE those fields.
        if (!template && !guild && !p.options.notes) return err(`${existing.name} is already a contact. Give a template to move them: /contact add "${existing.name}" Enemies`)
        const updated = contacts.map(c => c === existing ? {
          ...c,
          ...(template ? { templateId: template.id } : {}),
          ...(guild ? { guild } : {}),
          ...(p.options.notes ? { notes: p.options.notes } : {}),
        } : c)
        ctx.applyContacts(updated)
        return ok(`${existing.name} updated${template ? ` — moved to ${template.name}` : ''}.`)
      }
      const contact = newContact()
      contact.name = name
      if (template) contact.templateId = template.id
      if (guild) contact.guild = guild
      if (p.options.notes) contact.notes = p.options.notes
      ctx.applyContacts([...contacts, contact])
      return ok(`Contact added: ${name}${template ? ` (${template.name})` : ' (no template)'}`)
    },
  },
  {
    noun: 'contact', nounAliases: ['contacts'], verb: 'remove',
    args: [{ name: '"name"', required: true, kind: 'string', hint: 'the contact to remove' }],
    options: [], flags: [],
    description: 'Remove a contact by name',
    example: '/contact remove "Bob"',
    run: (ctx, p) => {
      const t = p.args[0].trim().toLowerCase()
      const contacts = ctx.getContacts()
      const removed = contacts.filter(c => c.name.toLowerCase() === t)
      if (removed.length === 0) return err(`No contact named "${p.args[0]}".`)
      ctx.applyContacts(contacts.filter(c => !removed.includes(c)))
      return ok(`Removed contact ${removed.map(c => c.name).join(', ')}.`)
    },
  },
  {
    noun: 'contact', nounAliases: ['contacts'], verb: 'list',
    args: [{ name: 'filter', required: false, kind: 'string', hint: 'only show names containing this' }],
    options: [], flags: [],
    description: 'List contacts (name · template · last seen)',
    example: '/contact list',
    run: (ctx, p) => {
      const templates = ctx.getContactTemplates()
      return listRules('contact', ctx.getContacts(), p.args[0],
        c => `${c.name}${c.templateId ? ` [${templates.find(t => t.id === c.templateId)?.name ?? '?'}]` : ''} — seen ${formatLastSeen(c.lastSeen)}`,
        c => c.name, 'the Contacts panel')
    },
  },

  // ── /template (contact templates) ───────────────────────────────────────
  {
    noun: 'template', nounAliases: ['tpl', 'templates'], verb: 'add',
    args: [
      { name: '"name"', required: true, kind: 'string', hint: 'the template name (e.g. Watchlist)' },
      { name: 'color', required: false, kind: 'color', hint: 'name color — named color or #hex (/colors shows them)' },
    ],
    options: [
      { key: 'bg', hint: 'background color behind the name' },
      { key: 'tag', hint: 'a prefix shown before the name, e.g. tag="[W]"' },
    ],
    flags: ['bold'],
    description: 'Create a contact template (a reusable name style)',
    example: '/template add "Watchlist" orange tag="[W]"',
    run: (ctx, p) => {
      const name = p.args[0].trim()
      if (!name) return err('The template needs a name.')
      const templates = ctx.getContactTemplates()
      if (templates.some(t => t.name.toLowerCase() === name.toLowerCase()))
        return err(`A template named "${name}" already exists — /contact add "Name" ${name} assigns it.`)
      const tpl = newTemplate()
      tpl.name = name
      if (p.args[1]) {
        const c = resolveColor(p.args[1])
        if (!c) return err(`"${p.args[1]}" isn't a color — use a name (red, blue, gold, …) or #hex.`)
        tpl.textColor = c
        tpl.tagColor = c   // the built-ins pair tag color with text color
      }
      if (p.options.bg) {
        const c = resolveColor(p.options.bg)
        if (!c) return err(`bg "${p.options.bg}" isn't a color — use a name or #hex.`)
        tpl.bgColor = c
      }
      if (p.options.tag) tpl.tagText = p.options.tag
      if (p.flags.has('bold')) tpl.bold = true
      ctx.applyContactTemplates([...templates, tpl])
      return ok(`Template added: ${name} (${tpl.textColor}${tpl.tagText ? `, tag ${tpl.tagText}` : ''}${tpl.bold ? ', bold' : ''}) — /contact add "Name" ${name} assigns it.`)
    },
  },
  {
    noun: 'template', nounAliases: ['tpl', 'templates'], verb: 'remove',
    args: [{ name: '"name"', required: true, kind: 'string', hint: 'the template to remove' }],
    options: [], flags: [],
    description: 'Remove a contact template (its contacts stay, unstyled)',
    example: '/template remove "Watchlist"',
    run: (ctx, p) => {
      const t = p.args[0].trim().toLowerCase()
      const templates = ctx.getContactTemplates()
      const removed = templates.filter(x => x.name.toLowerCase() === t)
      if (removed.length === 0) return err(`No template named "${p.args[0]}". You have: ${templates.map(x => x.name).join(', ')}.`)
      // Mirror ContactsPanel.deleteTemplate: remove the template only; member
      // contacts keep their entry (their templateId dangles harmlessly — the
      // renderer's template lookup already tolerates a missing id).
      ctx.applyContactTemplates(templates.filter(x => !removed.includes(x)))
      const memberCount = ctx.getContacts().filter(c => removed.some(x => x.id === c.templateId)).length
      const lines = [`Removed template ${removed.map(x => x.name).join(', ')}${memberCount ? ` — ${memberCount} contact${memberCount === 1 ? ' keeps its entry but loses' : 's keep their entries but lose'} the styling.` : '.'}`]
      if (removed.some(x => x.isDefault)) lines.push('  (Friends/Enemies are built-ins — a removed built-in returns next session.)')
      return { ok: true, lines }
    },
  },
  {
    noun: 'template', nounAliases: ['tpl', 'templates'], verb: 'list',
    args: [], options: [], flags: [],
    description: 'List contact templates and how many contacts use each',
    example: '/template list',
    run: (ctx) => {
      const templates = ctx.getContactTemplates()
      const contacts = ctx.getContacts()
      if (templates.length === 0) return ok('No contact templates. Create one: /template add "Watchlist" orange')
      return ok(`${templates.length} template${templates.length === 1 ? '' : 's'}:`,
        ...templates.map(t => {
          const n = contacts.filter(c => c.templateId === t.id).length
          return `  · ${t.name} (${t.textColor}${t.tagText ? `, tag ${t.tagText}` : ''}${t.bold ? ', bold' : ''}) — ${n} contact${n === 1 ? '' : 's'}`
        }))
    },
  },

  // ── Phase 3: client control ─────────────────────────────────────────────
  {
    noun: 'mode', nounAliases: ['modes'], verb: '',
    args: [{ name: 'name', required: false, kind: 'string', hint: 'the mode to switch to; "none" clears; omit to list' }],
    options: [], flags: [],
    description: 'Switch Group Mode (bare /mode lists them)',
    example: '/mode Hunting',
    run: (ctx, p) => {
      const modes = ctx.getModes()
      const target = p.args[0]?.trim()
      const m = target ? modes.find(x => x.name.toLowerCase() === target.toLowerCase()) : undefined
      // Bare `/mode` lists — and so does the literal `list` (users type it by
      // analogy with the other nouns). A REAL mode named "list" wins the match
      // above, so the sugar can't shadow it.
      if (!target || (!m && target.toLowerCase() === 'list')) {
        if (modes.length === 0) return ok('No modes defined — create them in Automations → Groups.')
        const activeId = ctx.getActiveModeId()
        return ok('Modes (● = active · /mode <name> to switch, /mode none to clear):',
          ...modes.map(x => `  ${x.id === activeId ? '●' : '·'} ${x.name}`))
      }
      if (!m && target.toLowerCase() === 'none') { ctx.clearMode(); return ok('Mode cleared — ungrouped rules only.') }
      if (!m) return err(`No mode "${target}". You have: ${modes.map(x => x.name).join(', ') || '(none)'}.`)
      ctx.applyMode(m.id)
      return ok(`Mode: ${m.name}`)
    },
  },
  {
    noun: 'group', nounAliases: ['groups'], verb: 'on',
    args: [{ name: '"name"', required: true, kind: 'string', hint: 'the group to turn on' }],
    options: [], flags: [],
    description: 'Turn a rule group ON',
    example: '/group on Hunting',
    run: (ctx, p) => {
      const g = ctx.getGroups().find(x => x.name.toLowerCase() === p.args[0].trim().toLowerCase())
      if (!g) return err(`No group "${p.args[0]}". You have: ${ctx.getGroups().map(x => x.name).join(', ') || '(none)'}.`)
      if (g.on) return ok(`Group ${g.name} is already on.`)
      ctx.setGroupOn(g.id, true)
      return ok(`Group ON: ${g.name}`)
    },
  },
  {
    noun: 'group', nounAliases: ['groups'], verb: 'off',
    args: [{ name: '"name"', required: true, kind: 'string', hint: 'the group to turn off' }],
    options: [], flags: [],
    description: 'Turn a rule group OFF',
    example: '/group off Roleplay',
    run: (ctx, p) => {
      const g = ctx.getGroups().find(x => x.name.toLowerCase() === p.args[0].trim().toLowerCase())
      if (!g) return err(`No group "${p.args[0]}". You have: ${ctx.getGroups().map(x => x.name).join(', ') || '(none)'}.`)
      if (!g.on) return ok(`Group ${g.name} is already off.`)
      ctx.setGroupOn(g.id, false)
      return ok(`Group OFF: ${g.name}`)
    },
  },
  {
    noun: 'group', nounAliases: ['groups'], verb: 'list',
    args: [], options: [], flags: [],
    description: 'List rule groups and their on/off state',
    example: '/group list',
    run: (ctx) => {
      const gs = ctx.getGroups()
      if (gs.length === 0) return ok('No groups defined — create them in Automations → Groups.')
      return ok('Groups (● = on · /group on|off <name>):', ...gs.map(g => `  ${g.on ? '●' : '·'} ${g.name}`))
    },
  },
  {
    noun: 'panel', nounAliases: ['panels', 'stream'], verb: 'open',
    args: [{ name: 'stream', required: true, kind: 'string', hint: 'a panel/stream name (thoughts, deaths, a Lich stream, …)' }],
    options: [], flags: [],
    description: 'Open a stream panel (focuses it if already open)',
    example: '/panel open thoughts',
    run: (ctx, p) => {
      const target = p.args[0].trim()
      const avail = ctx.getOpenableStreams()
      // Stream ids preserve case (Principle #5) — match case-insensitively but
      // OPEN with the canonical id so a Lich stream like `LichScripts` routes.
      const id = avail.find(s => s.toLowerCase() === target.toLowerCase())
      if (!id) return err(`No stream "${target}". Available: ${avail.join(', ')}. (Lich-script streams appear once the script pushes to them.)`)
      const result = ctx.openPanel(id)
      return ok(result === 'focused' ? `${id} is already open — focused it.` : `Panel opened: ${id}`)
    },
  },
  {
    noun: 'panel', nounAliases: ['panels', 'stream'], verb: 'close',
    args: [{ name: 'stream', required: true, kind: 'string', hint: 'the open panel to close' }],
    options: [], flags: [],
    description: 'Close an open stream panel',
    example: '/panel close deaths',
    run: (ctx, p) => {
      const target = p.args[0].trim()
      const open = ctx.getOpenPanels()
      const id = open.find(s => s.toLowerCase() === target.toLowerCase())
      if (!id) return err(`"${target}" isn't open. Open panels: ${open.join(', ') || '(none)'}.`)
      return ctx.closePanel(id) ? ok(`Panel closed: ${id}`) : err(`Couldn't close "${id}".`)
    },
  },
  {
    noun: 'panel', nounAliases: ['panels', 'stream'], verb: 'list',
    args: [], options: [], flags: [],
    description: 'List open panels and available streams',
    example: '/panel list',
    run: (ctx) => {
      const open = ctx.getOpenPanels()
      const avail = ctx.getOpenableStreams().filter(s => !open.some(o => o.toLowerCase() === s.toLowerCase()))
      if (open.length === 0 && avail.length === 0) return ok('No streams known yet.')
      return ok('Streams (● = open · /panel open|close <name>):',
        ...open.map(s => `  ● ${s}`),
        ...avail.map(s => `  · ${s}`))
    },
  },
  {
    noun: 'theme', nounAliases: ['themes'], verb: '',
    args: [{ name: 'name', required: false, kind: 'string', hint: 'a theme name or id; omit to list' }],
    options: [], flags: [],
    description: 'Switch theme (bare /theme lists them)',
    example: '/theme parchment',
    run: (ctx, p) => {
      const themes = ctx.getThemes()
      const target = p.args[0]?.trim()
      // Bare `/theme` lists — and so does the literal `list` (typed by analogy
      // with the other nouns), unless a theme is actually named/id'd "list".
      const isListSugar = !!target && target.toLowerCase() === 'list'
        && !themes.some(x => x.id.toLowerCase() === 'list' || x.name.toLowerCase() === 'list')
      if (!target || isListSugar) {
        const cur = ctx.getCurrentThemeId()
        return ok('Themes (● = current · /theme <name>):', ...themes.map(t => `  ${t.id === cur ? '●' : '·'} ${t.name}${t.name.toLowerCase() !== t.id ? ` (${t.id})` : ''}`))
      }
      const t = target.toLowerCase()
      // Id match first (unique); then name — two built-ins can SHARE a display
      // name (pitfall #35: dark "Classic" + light "Classic"), so an ambiguous
      // name errors with the ids instead of guessing.
      const byId = themes.find(x => x.id.toLowerCase() === t)
      const byName = themes.filter(x => x.name.toLowerCase() === t)
      const pick = byId ?? (byName.length === 1 ? byName[0] : null)
      if (!pick) {
        if (byName.length > 1) return err(`Two themes are named "${target}" — use the id: ${byName.map(x => x.id).join(' or ')}.`)
        return err(`No theme "${target}". You have: ${themes.map(x => x.name).join(', ')}.`)
      }
      ctx.applyThemeId(pick.id)
      return ok(`Theme: ${pick.name}${pick.name.toLowerCase() !== pick.id ? ` (${pick.id})` : ''}`)
    },
  },
  {
    noun: 'log', nounAliases: ['logs'], verb: 'search',
    args: [{ name: '"text"', required: false, kind: 'string', hint: 'what to search for; omit to open Search empty' }],
    options: [], flags: [],
    description: 'Open the Session Log in Quick Search',
    example: '/log search "wedding"',
    run: (ctx, p) => {
      const q = p.args[0] ?? ''
      ctx.openLogSearch(q)
      return ok(q ? `Searching the Session Log for "${q}"…` : 'Session Log search opened.')
    },
  },
  {
    noun: 'clear', nounAliases: [], verb: '',
    args: [], options: [], flags: [],
    description: 'Clear the main game window (the Session Log keeps everything)',
    example: '/clear',
    run: (ctx) => {
      ctx.clearMain()
      return ok('Main window cleared.')
    },
  },
  {
    noun: 'colors', nounAliases: ['color', 'colours', 'colour'], verb: '',
    args: [], options: [], flags: [],
    description: 'Show the named colors, each in its own color',
    example: '/colors',
    run: (ctx) => {
      // grey is an alias spelling of gray — one row, both spellings shown.
      const curated = Object.entries(CURATED_COLORS).filter(([n]) => n !== 'grey')
      const custom = ctx.getCustomColors()
      const row = (name: string, hex: string) => ({ rich: [
        { text: '  ' },
        { text: '██ ', color: hex },
        { text: name.padEnd(14), color: hex },
        { text: hex },
      ] })
      return ok(
        'Named colors — use them anywhere a color is accepted (name or #hex like #FF8800):',
        ...curated.map(([name, hex]) => row(name === 'gray' ? 'gray / grey' : name, hex)),
        ...(custom.length ? ['Yours (/colors add "name" #hex · /colors remove "name"):'] : []),
        ...custom.map(c => row(c.name, c.hex)),
        'All standard web color names work too (Lime, DodgerBlue, Crimson, …) — /colors list shows every one.',
        `e.g. /highlight add "goblin" orange · /template add "Watchlist" #8800ff${custom.length ? '' : ' · add your own: /colors add "ember" #ff6a30'}`,
      )
    },
  },
  {
    noun: 'colors', nounAliases: ['color', 'colours', 'colour'], verb: 'list',
    args: [], options: [], flags: [],
    description: 'The FULL color list — curated, yours, and every web name',
    example: '/colors list',
    run: (ctx) => {
      // Compact colored GRID (4 names per row) — 148 one-per-line rows would
      // drown the scrollback. Names only; bare /colors shows hex for the
      // curated/custom sets (web names are used BY name, not copied as hex).
      const grid = (entries: [string, string][]): SlashLine[] => {
        const rows: SlashLine[] = []
        for (let i = 0; i < entries.length; i += 4) {
          rows.push({ rich: [
            { text: '  ' },
            ...entries.slice(i, i + 4).map(([name, hex]) => ({ text: name.padEnd(22), color: hex })),
          ] })
        }
        return rows
      }
      const custom = ctx.getCustomColors()
      // Platform categories, EACH always shown (consistent shape — an empty
      // Custom section still teaches that the category exists and how to fill
      // it, UX polish standard #2/#8).
      return ok(
        'Managed named colors — every category; every name works anywhere a color is accepted:',
        '(Names too close to your theme\'s background sit on a small light/dark contrast bar — that\'s just a reading aid for this list, not part of the color.)',
        `■ Curated (${Object.keys(CURATED_COLORS).length - 1}) — Lichborne's readable core; these win when a web name overlaps:`,
        ...grid(Object.entries(CURATED_COLORS).filter(([n]) => n !== 'grey')),
        `■ Custom (${custom.length}) — yours, app-wide, managed with /colors add|remove:`,
        ...(custom.length
          ? grid(custom.map(c => [c.name, c.hex] as [string, string]))
          : ['  (none yet — /colors add "ember" #ff6a30)']),
        `■ Web (${Object.keys(WEB_COLORS).length}) — the standard web/CSS names (the Genie set):`,
        ...grid(Object.entries(WEB_COLORS)),
        '/colors shows the short list with hex values · /help colors explains the commands.',
      )
    },
  },
  {
    noun: 'colors', nounAliases: ['color', 'colours', 'colour'], verb: 'add',
    args: [
      { name: '"name"', required: true, kind: 'string', hint: 'the new color\'s name (one word)' },
      { name: '#hex', required: true, kind: 'word', hint: 'its value, e.g. #ff6a30' },
    ],
    options: [], flags: [],
    description: 'Add your own named color (app-wide, works everywhere)',
    example: '/colors add "ember" #ff6a30',
    run: (ctx, p) => {
      const name = p.args[0].trim().toLowerCase()
      const nameErr = validateCustomColorName(name)
      if (nameErr) return err(nameErr)
      if (!isHexColor(p.args[1])) return err(`"${p.args[1]}" isn't a #hex value — e.g. /colors add "${name}" #ff6a30. (Name a color BY a color: /colors shows the hex to copy.)`)
      const hex = p.args[1].trim().toLowerCase()
      const custom = ctx.getCustomColors()
      const existing = custom.find(c => c.name.toLowerCase() === name)
      if (existing) {
        // Re-adding an existing name UPDATES it. Resolve-at-entry semantics:
        // already-created rules keep the hex they stored — only future uses
        // pick up the new value (say so, or the "update" looks broken).
        ctx.applyCustomColors(custom.map(c => c === existing ? { name, hex } : c))
        return ok({ rich: [{ text: 'Color updated: ' }, { text: `██ ${name}`, color: hex }, { text: ` ${hex} — new uses get this value; existing rules keep what they stored.` }] })
      }
      ctx.applyCustomColors([...custom, { name, hex }])
      return ok({ rich: [{ text: 'Color added: ' }, { text: `██ ${name}`, color: hex }, { text: ` ${hex} — use it anywhere a color is accepted.` }] })
    },
  },
  {
    noun: 'colors', nounAliases: ['color', 'colours', 'colour'], verb: 'remove',
    args: [{ name: '"name"', required: true, kind: 'string', hint: 'the custom color to remove' }],
    options: [], flags: [],
    description: 'Remove one of your custom named colors',
    example: '/colors remove "ember"',
    run: (ctx, p) => {
      const name = p.args[0].trim().toLowerCase()
      if (Object.prototype.hasOwnProperty.call(CURATED_COLORS, name))
        return err(`"${name}" is a built-in color — built-ins can't be removed.`)
      const custom = ctx.getCustomColors()
      const removed = custom.filter(c => c.name.toLowerCase() === name)
      if (removed.length === 0) return err(`No custom color "${name}". Yours: ${custom.map(c => c.name).join(', ') || '(none yet — /colors add "name" #hex)'}.`)
      ctx.applyCustomColors(custom.filter(c => !removed.includes(c)))
      return ok(`Removed color "${name}" — rules that used it keep the hex they stored.`)
    },
  },

  // ── /timestamps ─────────────────────────────────────────────────────────
  {
    // BARE + VERBS (the /ai, /colors shape): the bare form reports, the verbs
    // change things. Do NOT add a `status` verb — the palette suppresses the
    // bare commit for such nouns, and a status verb would duplicate the bare
    // output as a second identical row (see NOUNS_WITH_VERBS in SlashPalette).
    noun: 'history', nounAliases: ['hist'], verb: '',
    args: [], options: [], flags: [],
    description: 'Show how command history is remembered',
    example: '/history',
    run: (ctx) => {
      const n = ctx.getCommandHistoryMinLength()
      return ok(n <= 0
        ? 'Command history: remembering every command (no minimum length).'
        : `Command history: only commands of ${n}+ characters are remembered. Slash commands are always kept.`)
    },
  },
  {
    noun: 'history', nounAliases: ['hist'], verb: 'min',
    args: [{ name: 'length', required: true, kind: 'word', hint: `0-${CMD_HISTORY_MIN_MAX} — 0 remembers everything` }],
    options: [], flags: [],
    description: 'Set the shortest command worth remembering for up-arrow recall',
    example: '/history min 3',
    run: (ctx, p) => {
      const raw = p.args[0]
      const n = Number(raw)
      if (!/^\d+$/.test(raw) || !Number.isFinite(n) || n > CMD_HISTORY_MIN_MAX) {
        return err(`/history min takes a whole number 0-${CMD_HISTORY_MIN_MAX} — not "${raw}". 0 remembers everything.`)
      }
      ctx.setCommandHistoryMinLength(n)
      return ok(n === 0
        ? 'Command history: remembering every command.'
        : `Command history: commands under ${n} characters are no longer remembered (slash commands still are). Existing history is unchanged.`)
    },
  },
  {
    noun: 'timestamps', nounAliases: ['ts'], verb: '',
    args: [{ name: 'on|off', required: false, kind: 'word', hint: 'omit to toggle' }],
    options: [], flags: [],
    description: 'Toggle [HH:MM] timestamps on the main window',
    example: '/timestamps on',
    run: (ctx, p) => {
      const want = p.args[0]?.toLowerCase()
      if (want && want !== 'on' && want !== 'off') return err(`/timestamps takes "on", "off", or nothing (toggle) — not "${p.args[0]}".`)
      const cur = ctx.getMainTimestamps()
      const next = want ? want === 'on' : !cur
      if (next !== cur) ctx.toggleMainTimestamps()
      return ok(`Main-window timestamps ${next ? 'ON' : 'OFF'}.`)
    },
  },

  // ── /view (Views — DESIGN §47) ────────────────────────────────────────────
  // A bare+verbs noun like /ai and /colors: the BARE form reports status and
  // toggles, the verbs switch and configure. Per the palette rule there is
  // deliberately NO `status` verb — the bare form already covers it, and adding
  // one would render two identical rows in the palette.
  {
    noun: 'view', nounAliases: ['views'], verb: '',
    args: [{ name: 'session|overview', required: false, kind: 'word', hint: 'omit to toggle' }],
    options: [], flags: [],
    description: 'Switch between the Session and Overview views',
    example: '/view overview',
    run: (ctx, p) => {
      const want = p.args[0]?.toLowerCase()
      if (want && want !== 'session' && want !== 'overview') {
        return err(`/view takes "session", "overview", or nothing (toggle) — not "${p.args[0]}".`)
      }
      const cur = ctx.getViewMode()
      const next = want ? (want as 'session' | 'overview') : (cur === 'overview' ? 'session' : 'overview')
      if (next !== cur) ctx.setViewMode(next)
      const n = ctx.getOverviewSummary().length
      return ok(next === 'overview'
        ? `Overview — ${n} character${n === 1 ? '' : 's'} in this window.`
        : 'Session view.')
    },
  },
  {
    noun: 'view', nounAliases: ['views'], verb: 'status',
    args: [], options: [], flags: [],
    description: 'List every character with whatever needs your attention',
    example: '/view status',
    run: (ctx) => {
      const rows = ctx.getOverviewSummary()
      if (rows.length === 0) return ok('No characters in this window.')
      // Worst first — the same severity order the cards sort by, so the text
      // path and the grid can never disagree about what matters most.
      return ok(...rows.map(r => {
        const hp = r.healthPct !== null ? ` ${r.healthPct}%` : ''
        const flags = r.flags.length > 0 ? ` — ${r.flags.join(', ')}` : ''
        return `${r.character}${r.connected ? hp : ' (offline)'}${flags}`
      }))
    },
  },
  {
    noun: 'view', nounAliases: ['views'], verb: 'stream',
    args: [{ name: 'stream', required: false, kind: 'word', hint: 'stream id, or "main" for the game window; omit to report' }],
    options: [], flags: [],
    description: "Choose which stream THIS character's Overview card shows",
    example: '/view stream conversation',
    run: (ctx, p) => {
      // Per CHARACTER, unlike everything else under /view — it matches the
      // dropdown on the card, which is deliberately per-card so a crafter can
      // sit on `main` while a character in a social spot watches conversation.
      const want = p.args[0]
      if (!want) return ok(`This card is showing: ${ctx.getOverviewStream()}.`)
      // Ids preserve case end-to-end (Principle #5), so the RAW argument is
      // stored — never lowercased.
      const id = want === 'off' ? 'main' : want.trim()
      ctx.setOverviewStream(id)
      return ok(id === 'main'
        ? 'Overview card showing the game window.'
        : `Overview card showing "${id}".`)
    },
  },
  {
    noun: 'view', nounAliases: ['views'], verb: 'sort',
    args: [{ name: 'attention|tab', required: true, kind: 'word' }],
    options: [], flags: [],
    description: 'Order the Overview cards by attention, or by tab position',
    example: '/view sort tab',
    run: (ctx, p) => {
      const want = p.args[0]?.toLowerCase()
      if (want !== 'attention' && want !== 'tab') return err(`/view sort takes "attention" or "tab" — not "${p.args[0]}".`)
      ctx.setOverviewOptions({ sort: want })
      return ok(`Overview sorted by ${want === 'attention' ? 'attention' : 'tab order'}.`)
    },
  },
  {
    noun: 'view', nounAliases: ['views'], verb: 'set',
    args: [],
    options: [
      { key: 'feed',     hint: 'lines of game text per card, 0–20 (0 = off)' },
      { key: 'tiles',    values: ['auto', 'small', 'medium', 'large'], hint: 'tile size — auto fills the space, the rest pin a width' },
      { key: 'density',  values: ['comfortable', 'compact'], hint: 'how tightly a card packs' },
      { key: 'idle',     hint: 'seconds of silence before a character reads as idle' },
      { key: 'health',   hint: 'percent below which a character reads as hurt' },
      { key: 'critical', hint: 'percent below which a character is critical — also what makes a card pulse' },
      { key: 'pulse',    values: ['on', 'off'], hint: 'alert on a dead or critical character — the card pulses, and the taskbar flashes if you are looking elsewhere' },
      // The one option with a real runtime cost — the hint has to say so
      // (UX standard #8): it turns on scene capture for EVERY open character,
      // not just this one, which is why it defaults off.
      { key: 'speech',   values: ['on', 'off'], hint: 'flag when somebody speaks to a character — turns on scene capture for every open character' },
      { key: 'vitals',     values: ['on', 'off'], hint: 'show the vitals bar on each card' },
      // B293: `conditions` and `timers` were missing while their four siblings
      // were offered — two of the six card-section toggles were mouse-only
      // (Principle #11 lockstep). Order mirrors the card top-to-bottom.
      { key: 'conditions', values: ['on', 'off'], hint: 'show the condition chips (bleeding, stunned, spoken to…)' },
      { key: 'room',       values: ['on', 'off'], hint: 'show the room and who is in it' },
      { key: 'exp',        values: ['on', 'off'], hint: 'show the session stat chips' },
      { key: 'injuries',   values: ['on', 'off'], hint: 'show the wound chip' },
      { key: 'timers',     values: ['on', 'off'], hint: 'show the RT / Cast / Aim strip on each card' },
    ],
    flags: [],
    description: 'Configure what the Overview cards show',
    example: '/view set feed=10 density=compact',
    run: (ctx, p) => {
      const patch: Record<string, unknown> = {}
      const onOff = (v: string): boolean | null => v === 'on' ? true : v === 'off' ? false : null
      const applied: string[] = []
      for (const [k, raw] of Object.entries(p.options)) {
        const v = raw.toLowerCase()
        switch (k) {
          case 'feed': {
            const n = parseInt(v, 10)
            if (!Number.isFinite(n) || n < 0 || n > 20) return err(`feed= takes 0–20 lines — not "${raw}".`)
            patch.feedLines = n; applied.push(`feed ${n}`); break
          }
          case 'density': {
            if (v !== 'comfortable' && v !== 'compact') return err(`density= takes "comfortable" or "compact" — not "${raw}".`)
            patch.density = v; applied.push(`density ${v}`); break
          }
          case 'tiles': {
            if (v !== 'auto' && v !== 'small' && v !== 'medium' && v !== 'large') {
              return err(`tiles= takes "auto", "small", "medium" or "large" — not "${raw}".`)
            }
            patch.tileSize = v; applied.push(`tiles ${v}`); break
          }
          case 'idle': {
            const n = parseInt(v, 10)
            if (!Number.isFinite(n) || n < 10 || n > 3600) return err(`idle= takes 10–3600 seconds — not "${raw}".`)
            patch.idleSeconds = n; applied.push(`idle ${n}s`); break
          }
          case 'health': {
            const n = parseInt(v, 10)
            if (!Number.isFinite(n) || n < 1 || n > 99) return err(`health= takes 1–99 percent — not "${raw}".`)
            patch.healthLowPct = n; applied.push(`hurt below ${n}%`); break
          }
          case 'critical': {
            const n = parseInt(v, 10)
            if (!Number.isFinite(n) || n < 1 || n > 99) return err(`critical= takes 1–99 percent — not "${raw}".`)
            patch.healthCritPct = n; applied.push(`critical below ${n}%`); break
          }
          default: {
            const key = ({ speech: 'watchSpeech', pulse: 'alertPulse', vitals: 'showVitals', conditions: 'showConditions', room: 'showRoom', exp: 'showExp', injuries: 'showInjuries', timers: 'showTimers' } as Record<string, string>)[k]
            if (!key) return err(`/view set does not know "${k}". Try /help view set.`)
            const b = onOff(v)
            if (b === null) return err(`${k}= takes "on" or "off" — not "${raw}".`)
            patch[key] = b; applied.push(`${k} ${b ? 'on' : 'off'}`); break
          }
        }
      }
      if (applied.length === 0) return err('/view set needs at least one setting, e.g. /view set feed=10.')
      ctx.setOverviewOptions(patch)
      return ok(`Overview: ${applied.join(' · ')}.`)
    },
  },

  // ── /ai (BYOK — DESIGN §10) ───────────────────────────────────────────────
  // Bare /ai (verb '') reports status; on/off flip the master toggle; catchup
  // fires Catch Me Up; key points at Settings (a key is never typed into the
  // command bar — it would land in history + the palette). The async work lives
  // in GameWindow's ctx.aiCatchup; these executors stay sync matchers.
  {
    noun: 'ai', nounAliases: [], verb: '',
    args: [], options: [], flags: [],
    description: 'Show AI status (on/off, key, model)',
    example: '/ai',
    run: (ctx) => {
      const s = ctx.getAIState()
      return ok(`AI: ${s.enabled ? 'ON' : 'OFF'} · key ${s.keyPresent ? 'set' : 'NOT set'} · model ${modelLabel(s.model)}`)
    },
  },
  {
    noun: 'ai', nounAliases: [], verb: 'on',
    args: [], options: [], flags: [],
    description: 'Enable AI features',
    example: '/ai on',
    run: (ctx) => {
      ctx.setAIEnabled(true)
      return ok(ctx.getAIState().keyPresent
        ? 'AI features enabled.'
        : 'AI features enabled — but no API key yet. Add one in Settings → AI.')
    },
  },
  {
    noun: 'ai', nounAliases: [], verb: 'off',
    args: [], options: [], flags: [],
    description: 'Disable AI features',
    example: '/ai off',
    run: (ctx) => {
      ctx.setAIEnabled(false)
      return ok('AI features disabled.')
    },
  },
  {
    noun: 'ai', nounAliases: [], verb: 'key',
    args: [], options: [], flags: [],
    description: 'Where to set your API key',
    example: '/ai key',
    run: () => ok('Set your Anthropic API key in Settings → AI (stored encrypted on this machine — not typed here).'),
  },
  {
    noun: 'ai', nounAliases: [], verb: 'catchup',
    args: [{ name: 'duration', required: false, kind: 'word', hint: 'how far back — 30m · 2h · 1.5h · 7d · 1mo · 1y (m/h/d/mo/y; bare = minutes). Omit = the last 30m. Big windows (days+) read a LOT of log and cost more on your key — use sparingly' }],
    options: [], flags: [],
    description: 'Summarize what you missed (AI) — reads your log; default 30m. /ai catchup 2h',
    example: '/ai catchup 1.5h',
    run: (ctx, p) => {
      const tok = p.args[0]?.trim()
      let minutes: number | null = null
      if (tok) {
        minutes = parseDuration(tok)
        if (minutes === null) return err(`"${tok}" isn't a duration — try 30m, 2h, 7d, 1mo, or 1y.`)
        if (minutes > CATCHUP_MAX_MINUTES) return err('The most you can catch up on at once is 1 year (1y).')
      }
      const st = ctx.aiCatchup(minutes)
      if (st === 'disabled') return err('AI is off — /ai on to enable (set a key in Settings → AI first).')
      if (st === 'nokey')    return err('No API key yet — add one in Settings → AI.')
      if (st === 'consent')  return ok('One-time AI disclosure opened — accept it to continue.')
      return ok()   // 'started' — GameWindow renders the streaming summary line itself
    },
  },
  {
    noun: 'ai', nounAliases: [], verb: 'stop',
    args: [], options: [], flags: [],
    description: 'Stop an AI response that is still streaming',
    example: '/ai stop',
    run: (ctx) => ctx.aiCancel()
      ? ok()                                  // GameWindow marks the line "(stopped)"
      : err('Nothing is running.'),
  },

  // ── SimuCoin (F71, DESIGN §42) ────────────────────────────────────────────
  // A bare+verbs noun (the `/colors` shape) — so `simucoin` MUST be in
  // NOUNS_WITH_VERBS in SlashPalette, or the verbs never list or Tab-complete,
  // and the bare form owns "status" (no redundant status verb).
  {
    noun: 'simucoin', nounAliases: ['sc', 'simucoins'], verb: '',
    args: [], options: [], flags: [],
    description: 'Show your SimuCoin balance and whether free coins are waiting',
    example: '/simucoin',
    run: (ctx) => {
      const rows = ctx.simucoinStatus()
      if (rows.length === 0) {
        return err('SimuCoin checking is not set up — enable an account in Settings → SimuCoins.')
      }
      return ok(...rows.map(simucoinRowText))
    },
  },
  {
    noun: 'simucoin', nounAliases: ['sc', 'simucoins'], verb: 'check',
    args: [{ name: 'account', required: false, kind: 'word', hint: 'which account — omit to check every enabled account' }],
    options: [], flags: [],
    description: 'Re-check the store now (does not claim)',
    example: '/simucoin check',
    run: (ctx, p) => {
      const st = ctx.simucoinRun(false, p.args[0]?.trim() || undefined)
      if (st === 'unconsented')     return err('That account is not enabled for SimuCoin checking — turn it on in Settings → SimuCoins.')
      if (st === 'unknown-account') return err(`No such account: "${p.args[0]}".`)
      if (st === 'none')            return err('No accounts are enabled for SimuCoin checking — turn one on in Settings → SimuCoins.')
      if (st === 'busy')            return err('Already checking — give it a moment.')
      // Says results FOLLOW — the run is async, so this line is not the answer.
      return ok('Checking the SimuCoin store — results appear here when each account finishes…')
    },
  },
  {
    noun: 'simucoin', nounAliases: ['sc', 'simucoins'], verb: 'claim',
    args: [{ name: 'account', required: false, kind: 'word', hint: 'which account — omit to claim for every enabled account' }],
    options: [], flags: [],
    description: 'Claim any free SimuCoins waiting on your account',
    example: '/simucoin claim',
    run: (ctx, p) => {
      const st = ctx.simucoinRun(true, p.args[0]?.trim() || undefined)
      if (st === 'unconsented')     return err('That account is not enabled for SimuCoin checking — turn it on in Settings → SimuCoins.')
      if (st === 'unknown-account') return err(`No such account: "${p.args[0]}".`)
      if (st === 'none')            return err('No accounts are enabled for SimuCoin checking — turn one on in Settings → SimuCoins.')
      if (st === 'busy')            return err('Already working — give it a moment.')
      return ok('Claiming — results appear here when each account finishes…')
    },
  },

]

// Noun-level blurbs for the bare /help listing — one PLAIN-LANGUAGE line per
// noun (38 per-command lines is a wall; a novice needs "what is this FOR").
// NEW NOUN ⇒ add a line here (pre-merge check #5 covers it); a missing noun
// falls back to its first entry's description, so /help never omits a command.
const NOUN_HELP: Record<string, string> = {
  highlight:  'Color text that matters (a creature, your name, a rare drop)',
  mute:       'Hide lines you never want to see (spam, weather, a chatty NPC)',
  sub:        'Rewrite matching text into something shorter or clearer',
  alias:      'Typed shortcuts — one word expands into full commands',
  history:    'Control which commands the up-arrow remembers',
  view:       'Switch between one character (Session) and all of them at once (Overview)',
  trigger:    'React to game text automatically (text matches → command sends)',
  contact:    'Track players — their names get colored everywhere they appear',
  template:   'Reusable name styles (like Friends/Enemies) to file contacts under',
  mode:       'Switch which rule groups are active, all at once',
  group:      'Turn a single rule group on or off',
  panel:      'Open or close stream panels (thoughts, deaths, combat, …)',
  theme:      'Change how the whole app looks',
  log:        'Search everything that happened in your saved session history',
  timestamps: 'Show the time next to each line in the main window',
  clear:      'Wipe the main window (your Session Log still keeps everything)',
  colors:     'The named colors — see them, add your own (/colors add "ember" #ff6a30)',
  ai:         'AI features (bring your own key) — /ai catchup 30m summarizes what happened',
  simucoin:   'Your free monthly SimuCoins — see the balance and claim what is waiting',
  help:       'This list — /help <command> explains one in detail',
}

// /help is registry-driven but self-referential, so it's built after the array.
SLASH_COMMANDS.push({
  noun: 'help', nounAliases: ['?'], verb: '',
  args: [
    { name: 'command', required: false, kind: 'word', hint: 'a command to explain (e.g. highlight)' },
    { name: 'verb', required: false, kind: 'word', hint: 'narrow to one verb (e.g. add)' },
  ],
  options: [], flags: [],
  description: 'List client commands, or explain one',
  example: '/help highlight',
  run: (_ctx, p) => {
    const topic = p.args[0]?.toLowerCase().replace(/^\//, '')
    if (topic) {
      // ── Detail view: every verb of the noun (optionally narrowed), with the
      // per-arg and per-option HINTS spelled out — the palette shows these
      // while typing, but /help is where a novice reads them at leisure.
      const verbFilter = p.args[1]?.toLowerCase()
      let matches = SLASH_COMMANDS.filter(c => c.noun === topic || c.nounAliases.includes(topic))
      if (matches.length === 0) return err(`No client command "/${topic}". Type /help for the list.`)
      if (verbFilter) {
        const narrowed = matches.filter(c => c.verb === verbFilter)
        if (narrowed.length === 0) return err(`/${matches[0].noun} has no "${verbFilter}" — its verbs: ${matches.map(c => c.verb || '(none)').join(', ')}.`)
        matches = narrowed
      }
      const lines: string[] = []
      for (const c of matches) {
        lines.push(`${signatureOf(c)}`)
        lines.push(`    ${c.description} — e.g. ${c.example}`)
        const argHints = c.args.filter(a => a.hint).map(a => `${a.name}: ${a.hint}`)
        if (argHints.length) lines.push(`    ${argHints.join(' · ')}`)
        const optHints = [
          ...c.options.map(o => `${o.key}=: ${o.hint}`),
          ...(c.flags.length ? [`flags: ${c.flags.join(', ')}`] : []),
        ]
        if (optHints.length) lines.push(`    ${optHints.join(' · ')}`)
      }
      lines.push('Reminder: <angle brackets> = required, [square brackets] = optional, "quotes" around multi-word text.')
      return ok(...lines)
    }
    // ── Overview: ONE line per noun, plain language, then a syntax primer.
    const seenNouns = new Set<string>()
    const rows: { label: string; what: string }[] = []
    for (const c of SLASH_COMMANDS) {
      if (seenNouns.has(c.noun)) continue
      seenNouns.add(c.noun)
      const all = SLASH_COMMANDS.filter(x => x.noun === c.noun)
      const verbs = all.map(x => x.verb).filter(Boolean)
      const hasBare = all.some(x => x.verb === '')
      // A noun can have a bare form AND verbs (/colors lists; /colors add|remove
      // manage) — bracket the verbs so the bare form reads as the default.
      const label = verbs.length
        ? (hasBare ? `/${c.noun} [${verbs.join('|')}]` : `/${c.noun} ${verbs.join('|')}`)
        : `/${c.noun}${c.args[0] ? ` [${c.args[0].name}]` : ''}`
      rows.push({ label, what: NOUN_HELP[c.noun] ?? c.description })
    }
    const width = Math.max(...rows.map(r => r.label.length)) + 2
    return ok(
      'Client commands — these control Lichborne itself; nothing here is ever sent to the game.',
      ...rows.map(r => `  ${r.label.padEnd(width)}${r.what}`),
      'How to type them: put multi-word text in "quotes" · extras are key=value (mode=regex) · colors are names (/colors shows them) or #hex.',
      'Tip: just type / to browse — Tab completes, Enter runs, Esc closes. A typo can never reach the game; type "//" to send a literal "/" line.',
      '/help <command> explains one in detail (e.g. /help highlight).',
    )
  },
})

// ── Parsing + execution ──────────────────────────────────────────────────────

export function signatureOf(c: SlashCommandSpec): string {
  const parts = [`/${c.noun}${c.verb ? ' ' + c.verb : ''}`]
  for (const a of c.args) parts.push(a.required ? `<${a.name}>` : `[${a.name}]`)
  for (const o of c.options) parts.push(`[${o.key}=${o.values ? o.values.join('|') : '…'}]`)
  for (const f of c.flags) parts.push(`[${f}]`)
  return parts.join(' ')
}

function findCommand(noun: string, verb: string | undefined): { cmd?: SlashCommandSpec; nounKnown: boolean } {
  const n = noun.toLowerCase()
  const forNoun = SLASH_COMMANDS.filter(c => c.noun === n || c.nounAliases.includes(n))
  if (forNoun.length === 0) return { nounKnown: false }
  // A noun can have BOTH verb entries and a noun-only entry (/colors lists,
  // /colors add creates). Verb match wins; the noun-only form is the fallback,
  // so its first ARGUMENT can't be mistaken for a verb (`/mode Hunting` — no
  // verb "hunting" exists → falls to the noun-only /mode).
  const v = verb?.toLowerCase()
  const verbMatch = v ? forNoun.find(c => c.verb === v) : undefined
  if (verbMatch) return { cmd: verbMatch, nounKnown: true }
  const nounOnly = forNoun.find(c => c.verb === '')
  if (nounOnly) return { cmd: nounOnly, nounKnown: true }
  return { cmd: undefined, nounKnown: true }
}

export interface SlashParse {
  cmd?: SlashCommandSpec
  parsed?: ParsedSlash
  error?: string          // set when the input can't execute as-is
  nounKnown: boolean      // the first token matched a registered noun
}

/** Parse (without executing) — shared by runSlash and the palette's validator. */
export function parseSlash(input: string): SlashParse {
  const body = input.replace(/^\//, '')
  const tokens = tokenizeSlash(body)
  if (tokens.length === 0) return { nounKnown: false, error: 'Type a command — /help lists them.' }
  const noun = tokens[0].value
  const { cmd: nounOnlyOrVerb, nounKnown } = findCommand(noun, tokens[1]?.value)
  if (!nounKnown) return { nounKnown: false, error: `Unknown client command "/${noun}" — /help lists them. ("//" sends a literal "/" line to the game.)` }
  const cmd = nounOnlyOrVerb
  if (!cmd) {
    const verbs = SLASH_COMMANDS.filter(c => c.noun === noun.toLowerCase() || c.nounAliases.includes(noun.toLowerCase())).map(c => c.verb)
    return { nounKnown: true, error: `/${noun} needs a verb: ${verbs.join(' | ')}.` }
  }
  // Consume tokens after noun (+verb).
  const rest = tokens.slice(cmd.verb ? 2 : 1)
  const parsed: ParsedSlash = { args: [], options: {}, flags: new Set() }
  for (const t of rest) {
    if (t.key) {
      const spec = cmd.options.find(o => o.key === t.key)
      if (!spec) return { cmd, nounKnown: true, error: `Unknown option "${t.key}=" for ${signatureOf(cmd)}.` }
      if (spec.values && !spec.values.includes(t.value.toLowerCase()))
        return { cmd, nounKnown: true, error: `${t.key}= must be ${spec.values.join(' | ')} — not "${t.value}".` }
      parsed.options[t.key] = spec.values ? t.value.toLowerCase() : t.value
    } else if (!t.quoted && cmd.flags.includes(t.value.toLowerCase())) {
      parsed.flags.add(t.value.toLowerCase())
    } else if (parsed.args.length < cmd.args.length) {
      const spec = cmd.args[parsed.args.length]
      if (spec.kind === 'color' && !t.quoted && !resolveColor(t.value) && !looksLikeColor(t.value))
        return { cmd, nounKnown: true, error: `Unexpected "${t.value}" — expected a ${spec.name} (or an option like ${cmd.options[0] ? cmd.options[0].key + '=…' : '…'}).` }
      parsed.args.push(t.value)
    } else {
      return { cmd, nounKnown: true, error: `Unexpected argument "${t.value}" for ${signatureOf(cmd)}.` }
    }
  }
  // Required args must also be NON-EMPTY unless the spec opts out (allowEmpty):
  // `/highlight add ""` would otherwise mint a dead empty-pattern rule that
  // clutters the panel and shows up as "broken" in Analytics.
  const missing = cmd.args.filter((a, i) =>
    a.required && (parsed.args[i] === undefined || (!a.allowEmpty && parsed.args[i].trim() === '')))
  if (missing.length > 0)
    return { cmd, parsed, nounKnown: true, error: `Missing ${missing.map(a => a.name).join(', ')} — e.g. ${cmd.example}` }
  return { cmd, parsed, nounKnown: true }
}

/** Execute a slash line. `input` includes the leading '/'. Never throws. */
export function runSlash(input: string, ctx: SlashContext): SlashResult {
  try {
    const p = parseSlash(input)
    if (p.error || !p.cmd || !p.parsed) return err(p.error ?? 'Could not parse that command — /help lists the syntax.')
    return p.cmd.run(ctx, p.parsed)
  } catch (e) {
    console.error('[slash] command failed:', input, e)
    return err('That command hit an internal error — check the console (View → Toggle Developer Tools) and report it.') // B351: the chord differs per OS
  }
}
