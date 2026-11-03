// Mutes (a.k.a. Gags / Ignores) — suppress a matching line from the game window.
// One of the two "Text Modification" features (the other is Substitutes).
// Per-character automation rule, same shape/lifecycle as highlights (Principle
// #1: rides the dynamic `state.*` map, no profile-shape change), group-gated via
// `isRuleActive`. See DESIGN.md §31. Phase 1 applies to the main story window;
// the optional `stream` scope is stored now and honored in Phase 2.

import { literalGate } from './regexLiteral'
import { scopedKey, safeSetItem } from './characterScope'

export interface MuteRule {
  id: string
  name: string
  enabled: boolean
  pattern: string
  mode: 'text' | 'phrase' | 'regex'
  // What gets removed when a line matches (mirrors HighlightRule.scope):
  //   'line'  = hide the entire line (the typical "gag/ignore").
  //   'match' = remove only the matched text, keep the rest of the line.
  scope: 'line' | 'match'
  caseSensitive: boolean
  stream?: string        // optional stream scope (absent = all). Phase-2 honored.
  groupIds: string[]
  allGroups: boolean
}

const storageKey = (character: string) => scopedKey(character, 'mutes')

// Common display streams a mute/substitute can be restricted to ('' = all,
// the GLOBAL default). Shared by the Mute and Substitute editors. The values
// are the stream ids the render pass keys on ('main' = the main window).
export const STREAM_OPTIONS: { value: string; label: string }[] = [
  { value: '',             label: 'All streams (everywhere)' },
  { value: 'main',         label: 'Main only' },
  { value: 'thoughts',     label: 'Thoughts' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'combat',       label: 'Combat' },
  { value: 'deaths',       label: 'Deaths' },
  { value: 'arrivals',     label: 'Arrivals' },
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A GLOBAL regex — `match`-scope mutes use `.replace(re, '')` to strip every
// occurrence, and `line`-scope uses `.test()` (lastIndex reset before each call,
// since the regex is shared across lines). Mode handling mirrors
// `buildHighlightRegex`: text = word-boundary tokens, phrase = literal
// substring, regex = raw source.
export function buildMuteRegex(rule: MuteRule): RegExp | null {
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
    return new RegExp(source, rule.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

export function loadMutes(character: string): MuteRule[] {
  try {
    const raw = localStorage.getItem(storageKey(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

// Returns the write's success flag (false = quota, already toasted) — see
// saveHighlights' note; the F63 scope move aborts on a failed target write.
export function saveMutes(character: string, rules: MuteRule[]): boolean {
  return safeSetItem(storageKey(character), JSON.stringify(rules))
}

export function newMute(pattern = '', mode: MuteRule['mode'] = 'phrase'): MuteRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    pattern,
    mode,
    scope: 'line',   // typical: hide the whole line
    caseSensitive: false,
    groupIds: [],
    allGroups: true,
  }
}

// A compiled, group-active mute ready for the render hot-path.
export interface CompiledMute {
  rule: MuteRule
  regex: RegExp
  /** Cheap pre-check: a lowercase literal guaranteed present in any match, or
      null when none could be extracted. Pitfall #82a — every rule-evaluation
      site gates on this BEFORE running its regex. Mutes and substitutes were
      the only two engines missing it (v0.18.0 perf audit): substitutes ran the
      full rule list per SEGMENT and again over the joined line, so a 90-rule
      import cost ~27µs/line unconditionally, ~9x what the gate costs. */
  fastLower: string | null
}

// Compile + gate the enabled mutes for the current active groups. `isActive`
// is the caller's `(groupIds, allGroups) => boolean` (groups.isRuleActive
// closed over the active group states) so this module stays dependency-light.
export function compileMutes(
  rules: MuteRule[],
  isActive: (groupIds: string[], allGroups: boolean) => boolean,
): CompiledMute[] {
  const out: CompiledMute[] = []
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (!isActive(rule.groupIds ?? [], rule.allGroups ?? true)) continue
    const regex = buildMuteRegex(rule)
    if (regex) out.push({ rule, regex, fastLower: literalGate(rule.mode, rule.pattern) })
  }
  return out
}

// Apply active mutes to one line's segments.
//   • returns `null`  → DROP the whole line (a `line`-scope mute matched, or a
//     `match`-scope strip emptied the line);
//   • returns the same `segments` reference → unchanged;
//   • returns a NEW array → `match`-scope mutes stripped some text.
// `segments` is any array of objects carrying a `text` string (only `text` is
// read/rewritten). `match`-scope matches against the WHOLE line and cuts the
// matched range out of whichever segments it covers (B563/B564): the rich stream
// splits a line at every linked name, so a per-segment match missed anything
// spanning a name and let `^`/`$` match at each link. Blank lines never mute.
// `onFired` (Automation Analytics, v0.14.4) is invoked with a mute's ruleId each
// time it actually removes/strips text — wired only when analytics is on, so it
// rides the existing match loop at ~no cost.
export function applyMutesToSegments<T extends { text: string }>(
  segments: T[],
  mutes: CompiledMute[],
  onFired?: (ruleId: string) => void,
): T[] | null {
  if (mutes.length === 0) return segments
  const lineText = segments.map(s => s.text).join('')
  if (!lineText.trim()) return segments
  // ONE lowercase per line, shared by every gate below (pitfall #82a).
  const lower = lineText.toLowerCase()

  // line-scope: any match → drop the whole line.
  for (const m of mutes) {
    if (m.rule.scope === 'line') {
      if (m.fastLower && !lower.includes(m.fastLower)) continue
      m.regex.lastIndex = 0
      if (m.regex.test(lineText)) { onFired?.(m.rule.id); return null }
    }
  }

  // match-scope: strip the matched text out of each segment, then tidy the gap
  // the removal leaves so "the healer Quentin." → "the healer." (not "… .").
  // Gate against the WHOLE line: a rule whose literal appears nowhere in the
  // line cannot match any segment of it, so it's skipped for every segment.
  const matchMutes = mutes.filter(m =>
    m.rule.scope === 'match' && (!m.fastLower || lower.includes(m.fastLower)))
  if (matchMutes.length === 0) return segments

  let current = segments
  let changed = false
  for (const m of matchMutes) {
    const text = current.map(s => s.text).join('')
    const ranges: Array<[number, number]> = []
    m.regex.lastIndex = 0
    let hit: RegExpExecArray | null
    while ((hit = m.regex.exec(text)) !== null) {
      if (hit[0].length > 0) ranges.push([hit.index, hit.index + hit[0].length])
      else m.regex.lastIndex++   // zero-width match (pitfall #29)
      if (!m.regex.global) break
    }
    if (ranges.length === 0) continue
    onFired?.(m.rule.id)
    changed = true
    let start = 0
    current = current.map(seg => {
      const end = start + seg.text.length
      let kept = ''
      let pos = start
      for (const [a, b] of ranges) {
        if (b <= pos || a >= end) continue
        if (a > pos) kept += text.slice(pos, a)
        pos = Math.max(pos, Math.min(b, end))
      }
      if (pos === start && !ranges.some(([a, b]) => a < end && b > start)) { start = end; return seg }
      if (pos < end) kept += text.slice(pos, end)
      start = end
      // Collapse the double-space left behind, and drop a space now dangling
      // before punctuation.
      return { ...seg, text: kept.replace(/ {2,}/g, ' ').replace(/ +([.,;:!?…)\]'"]+)/g, '$1') } as T
    })
  }
  if (!changed) return segments

  let out = current.filter(s => s.text.length > 0)
  // Tidy the seams the removal created (the matched text may have been its own
  // styled segment): collapse a space-space boundary, drop a space left before
  // punctuation in the next piece, and trim a leading/trailing space the removal
  // left at the line edges.
  for (let i = 0; i < out.length - 1; i++) {
    if (/\s$/.test(out[i].text) && /^\s/.test(out[i + 1].text)) {
      out[i + 1] = { ...out[i + 1], text: out[i + 1].text.replace(/^\s+/, '') } as T
    }
    if (/\s$/.test(out[i].text) && /^[.,;:!?…)\]]/.test(out[i + 1].text)) {
      out[i] = { ...out[i], text: out[i].text.replace(/\s+$/, '') } as T
    }
  }
  if (out.length > 0) {
    if (/^\s/.test(out[0].text))                   out[0]              = { ...out[0],              text: out[0].text.replace(/^\s+/, '') } as T
    const lastI = out.length - 1
    if (/\s$/.test(out[lastI].text))               out[lastI]          = { ...out[lastI],          text: out[lastI].text.replace(/\s+$/, '') } as T
    out = out.filter(s => s.text.length > 0)
  }
  if (out.length === 0 || out.every(s => !s.text.trim())) return null
  return out
}
