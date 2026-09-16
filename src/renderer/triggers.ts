// Triggers — the rule SHAPE, storage, regex compile, and editor catalogues (the engine is elsewhere).
//
// A `TriggerRule` is WHEN (a text pattern on a watched stream, OR a watched
// game variable) + optional state GATES (health < 50 and stance = …) + THEN
// (an ordered list of `TriggerAction`s: command / echo / notify / sound /
// webhook / variable / flash / beep / log), with cooldown, one-shot, and the
// shared `groupIds` + `allGroups` gating every rule type carries. This file
// owns that shape, the per-character store (`scopedKey(character,'triggers')`;
// `saveTriggers` goes through `safeSetItem` and RETURNS the write's success so
// the F63 scope move can abort on a failed target write), the factories, the
// regex compile, `$var` interpolation, and the option lists the editor
// renders. Evaluation lives in hooks/useTriggerEngine.ts.
//
// `buildTriggerRegex`: `text` mode splits on whitespace, escapes each token,
// wraps it in `\b` only where the token itself starts/ends with a word char,
// and joins with `\s+`; `phrase` is one escaped literal; `regex` is raw.
// Case-insensitive unless the rule says otherwise; empty or invalid → null.
// `interpolate` replaces `$name` from the vars map and leaves an UNKNOWN
// `$name` as literal text. `INTERPOLATABLE_VARS` is the editor's DISPLAY list
// of those vars — the values are built by the engine's `buildVars`, so a var
// added to one belongs in the other. `newTrigger` defaults `watchStream` to
// `'main'`, not `'any'` (B128, Jaded, v0.8.9 — DR routes speech to both
// `main` and the conversation stream, so `'any'` double-fired).

export type ActionType = 'command' | 'echo' | 'notify' | 'sound' | 'webhook' | 'variable' | 'flash' | 'beep' | 'log'

export type WatchStream = 'any' | string

export type GateVariable =
  | 'health' | 'mana' | 'stamina' | 'spirit' | 'concentration'
  | 'rt' | 'stance' | 'spell'
  | 'bleeding' | 'stunned' | 'dead' | 'hidden' | 'invisible'
  | 'room'

export type GateOperator = '<' | '<=' | '>' | '>=' | '=' | '!='

export interface StateGate {
  id: string
  variable: GateVariable
  operator: GateOperator
  value: string
  connector: 'and' | 'or'  // how this gate joins with the previous result (ignored on first gate)
}

export interface TriggerAction {
  id: string
  type: ActionType
  // command
  command?: string
  delayMs?: number
  // echo
  echoMessage?: string
  echoStream?: string
  echoColor?: string
  // notify
  notifyTitle?: string
  notifyBody?: string
  // sound
  soundPreset?: 'chime' | 'alert' | 'alarm' | 'ping'
  soundFile?: string   // WAV/audio file path — takes priority over soundPreset when set
  // webhook
  webhookUrl?: string
  webhookMessage?: string
  // variable
  varName?: string
  varValue?: string
  // log
  logFile?: string
  logMessage?: string
}

export type TriggerType = 'text' | 'variable'

export interface TriggerRule {
  id: string
  name: string
  enabled: boolean
  triggerType: TriggerType   // 'text' (default) or 'variable'
  // text trigger fields
  pattern: string
  mode: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  watchStream: WatchStream
  // variable trigger fields
  watchVariable?: string     // variable name to watch (triggerType === 'variable')
  // shared
  gates: StateGate[]
  cooldownSeconds: number
  oneShot: boolean
  actions: TriggerAction[]
  groupIds: string[]
  allGroups: boolean
}

import { scopedKey, safeSetItem } from './characterScope'

const storageKey = (character: string) => scopedKey(character, 'triggers')

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildTriggerRegex(rule: TriggerRule): RegExp | null {
  try {
    if (!rule.pattern.trim()) return null
    let source: string
    if (rule.mode === 'regex') {
      source = rule.pattern
    } else if (rule.mode === 'text') {
      source = rule.pattern
        .trim()
        .split(/\s+/)
        .map(token => {
          const esc = escapeRegex(token)
          const pre = /^\w/.test(token) ? '\\b' : ''
          const suf = /\w$/.test(token) ? '\\b' : ''
          return `${pre}${esc}${suf}`
        })
        .join('\\s+')
    } else {
      source = escapeRegex(rule.pattern)
    }
    return new RegExp(source, rule.caseSensitive ? '' : 'i')
  } catch {
    return null
  }
}

export function isValidTriggerRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true } catch { return false }
}

export function loadTriggers(character: string): TriggerRule[] {
  try {
    const raw = localStorage.getItem(storageKey(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

// Returns the write's success flag (false = quota, already toasted) — see
// saveHighlights' note; the F63 scope move aborts on a failed target write.
export function saveTriggers(character: string, rules: TriggerRule[]): boolean {
  return safeSetItem(storageKey(character), JSON.stringify(rules))
}

export function newTriggerAction(type: ActionType = 'command'): TriggerAction {
  return {
    id: crypto.randomUUID(),
    type,
    command: '',
    delayMs: 0,
    echoMessage: '',
    echoStream: 'log',
    echoColor: '',
    notifyTitle: 'Lichborne',
    notifyBody: '$line',
    soundPreset: 'chime',
    webhookUrl: '',
    webhookMessage: '$line',
    varName: '',
    varValue: '',
    logFile: '',
    logMessage: '$line',
  }
}

export function newTrigger(pattern = ''): TriggerRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    triggerType: 'text',
    pattern,
    mode: 'text',
    caseSensitive: false,
    // B128 (Jaded, v0.8.9): default to 'main' (was 'any'). 'any' caused
    // speech triggers to double-fire because DR routes "Bob says X" into
    // both `main` and `conversations` streams. 'main' is the right
    // default — users who want a stream-specific trigger can change it.
    watchStream: 'main',
    watchVariable: '',
    gates: [],
    cooldownSeconds: 0,
    oneShot: false,
    actions: [newTriggerAction('command')],
    groupIds: [],
    allGroups: true,
  }
}

export function newGate(): StateGate {
  return { id: crypto.randomUUID(), variable: 'health', operator: '<', value: '50', connector: 'and' }
}

// Interpolates $var references in a template string.
// Built-in vars come from the engine context; user vars from Variable actions.
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$(\w+)/g, (_, key) => vars[key] ?? `$${key}`)
}

export const GATE_VARIABLES: { value: GateVariable; label: string; numeric: boolean }[] = [
  { value: 'health',        label: 'Health %',       numeric: true  },
  { value: 'mana',          label: 'Mana %',          numeric: true  },
  { value: 'stamina',       label: 'Stamina %',       numeric: true  },
  { value: 'spirit',        label: 'Spirit %',        numeric: true  },
  { value: 'concentration', label: 'Concentration %', numeric: true  },
  { value: 'rt',            label: 'Roundtime (sec)', numeric: true  },
  { value: 'stance',        label: 'Stance',          numeric: false },
  { value: 'spell',         label: 'Prepared spell',  numeric: false },
  { value: 'room',          label: 'Room name',       numeric: false },
  { value: 'bleeding',      label: 'Bleeding',        numeric: false },
  { value: 'stunned',       label: 'Stunned',         numeric: false },
  { value: 'dead',          label: 'Dead',            numeric: false },
  { value: 'hidden',        label: 'Hidden',          numeric: false },
  { value: 'invisible',     label: 'Invisible',       numeric: false },
]

export const NUMERIC_OPERATORS: GateOperator[] = ['<', '<=', '>', '>=', '=', '!=']
export const STRING_OPERATORS:  GateOperator[] = ['=', '!=']

export const INTERPOLATABLE_VARS: { name: string; desc: string }[] = [
  { name: 'match',         desc: 'matched text (same as $0)' },
  { name: '0',             desc: 'full matched text' },
  { name: '1',             desc: 'first capture group' },
  { name: '2',             desc: 'second capture group' },
  { name: '3',             desc: 'third capture group' },
  { name: 'name',          desc: 'named capture group — (?<name>…) → $name' },
  { name: 'line',          desc: 'full matched line' },
  { name: 'characterName', desc: 'logged-in character name' },
  { name: 'date',          desc: 'current date' },
  { name: 'time',          desc: 'current time' },
  { name: 'timestamp',     desc: 'epoch milliseconds' },
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

export const WATCH_STREAM_OPTIONS = [
  { value: 'any',           label: 'Any stream' },
  { value: 'main',          label: 'Main' },
  { value: 'thoughts',      label: 'Thoughts' },
  { value: 'arrivals',      label: 'Arrivals' },
  { value: 'conversation',  label: 'Conversation'  },
  { value: 'deaths',        label: 'Deaths' },
  { value: 'spells',        label: 'Active Spells' },
  { value: 'familiar',      label: 'Familiar' },
  { value: 'log',           label: 'Log' },
]
