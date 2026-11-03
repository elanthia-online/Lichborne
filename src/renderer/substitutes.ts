// Substitutes — rewrite matching game text into something else (the other
// "Text Modification" feature; the first is Mutes). Per-character automation
// rule, same shape/lifecycle as highlights (Principle #1: rides the dynamic
// `state.*` map, no profile-shape change), group-gated via `isRuleActive`.
// See DESIGN.md §31. Phase 2 applies to the main story window, per-segment.
//
// Replacement uses JS-native `$N` capture-group syntax (`$1`, `$2`, `$&` = whole
// match, `$$` = literal `$`) — which matches Genie's `$N`; the Frostbite
// importer converts its `\N`/`\0` form to `$N`/`$&`. Game-state vars
// (`$health`, …) are NOT interpolated here (capture groups only — that's what
// the source clients use); a future phase could add them.

import { literalGate } from './regexLiteral'
import { scopedKey, safeSetItem } from './characterScope'
import type { TextSegment } from '../shared/types'

export interface SubstituteRule {
  id: string
  name: string
  enabled: boolean
  pattern: string
  mode: 'text' | 'phrase' | 'regex'
  caseSensitive: boolean
  replacement: string    // may contain $1, $2, $& …
  stream?: string        // optional stream scope (absent = all). Phase-3 honored.
  groupIds: string[]
  allGroups: boolean
}

const storageKey = (character: string) => scopedKey(character, 'substitutes')

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// GLOBAL regex so `.replace(re, replacement)` rewrites every occurrence in a
// segment. Mode handling mirrors `buildHighlightRegex`.
export function buildSubstituteRegex(rule: SubstituteRule): RegExp | null {
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

export function loadSubstitutes(character: string): SubstituteRule[] {
  try {
    const raw = localStorage.getItem(storageKey(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

// Returns the write's success flag (false = quota, already toasted) — see
// saveHighlights' note; the F63 scope move aborts on a failed target write.
export function saveSubstitutes(character: string, rules: SubstituteRule[]): boolean {
  return safeSetItem(storageKey(character), JSON.stringify(rules))
}

export function newSubstitute(pattern = '', replacement = ''): SubstituteRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    pattern,
    mode: 'phrase',
    caseSensitive: false,
    replacement,
    groupIds: [],
    allGroups: true,
  }
}

export interface CompiledSubstitute {
  rule: SubstituteRule
  regex: RegExp
  /** See CompiledMute.fastLower — pitfall #82a. Substitutes were the worst
      offender: the rule list ran per SEGMENT and again over the joined line,
      so cost was rules × (segments + 1) regex scans per line, unconditionally,
      for every open stream panel. */
  fastLower: string | null
}

export function compileSubstitutes(
  rules: SubstituteRule[],
  isActive: (groupIds: string[], allGroups: boolean) => boolean,
): CompiledSubstitute[] {
  const out: CompiledSubstitute[] = []
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (!isActive(rule.groupIds ?? [], rule.allGroups ?? true)) continue
    const regex = buildSubstituteRegex(rule)
    if (regex) out.push({ rule, regex, fastLower: literalGate(rule.mode, rule.pattern) })
  }
  return out
}

// Apply active substitutes to a line's segments.
//
// Substitutes are a LINE-level rewrite in every sibling client — Genie's
// `ParseSubstitutions` and Frostbite's `alter->substitute` both run on the
// whole plain-line text. DR fragments a STYLED line into multiple TextSegments:
// a Gweth thought arrives as `<preset id='thought'>[Personal] Your mind hears
// X thinking, </preset>"<to you>" "msg"` — i.e. TWO segments — so a regex that
// spans the boundary (with capture groups, e.g. Cherisse's
// `^\[(.*)\] Your mind hears (.*) thinking,"<to you>" (.*)`) can NEVER match if
// we only test per-segment. (lnet thoughts come through Lich as one unbroken
// segment, which is exactly why those "worked" and the game's own thoughts
// didn't — B195.)
//
// Each rule matches the WHOLE line, and the result is mapped back onto the
// segments, so styling survives wherever the rule didn't touch (B564/B565). The
// rich stream splits a line at every linked name, which made the old per-segment
// pass match `^`/`$` at each link, and the old collapse flatten a whole line (its
// bold and links) for one match that spanned a name:
//  • a match inside one segment is replaced in place and keeps that segment's
//    styling and link;
//  • a match that crosses a boundary becomes its own segment, styled like the
//    segment it starts in — VISUAL fields only, never link fields, so the new
//    text can't inherit a stray click target (pitfall #89).
// Returns the SAME array reference when nothing changed (so the caller's
// identity check can skip the line rebuild). `onFired` (Automation Analytics,
// v0.14.4) reports each substitute that changed the line, once per line.
export function applySubstitutesToSegments(
  segments: TextSegment[],
  subs: CompiledSubstitute[],
  onFired?: (ruleId: string) => void,
): TextSegment[] {
  if (subs.length === 0) return segments

  // ONE lowercase of the whole line for every gate (pitfall #82a).
  const lower = segments.map(s => s.text).join('').toLowerCase()
  const live = subs.filter(s => !s.fastLower || lower.includes(s.fastLower))
  if (live.length === 0) return segments

  let current = segments
  for (const s of live) {
    const next = applyOneSubstitute(current, s)
    if (next !== current) { current = next; onFired?.(s.rule.id) }
  }
  return current
}

// `$&`, `$1`, `$<name>`… exactly as String.prototype.replace expands them. The
// callback form of replace can't be used here: the result has to be placed by
// match position across segments.
function expandReplacement(rep: string, m: RegExpExecArray, text: string): string {
  if (!rep.includes('$')) return rep
  return rep.replace(/\$(?:\$|&|`|'|(\d\d?)|<([^>]*)>)/g, (tok, num: string | undefined, name: string | undefined) => {
    if (tok === '$$') return '$'
    if (tok === '$&') return m[0]
    if (tok === '$`') return text.slice(0, m.index)
    if (tok === "$'") return text.slice(m.index + m[0].length)
    if (name !== undefined) return m.groups ? (m.groups[name] ?? '') : tok
    if (num !== undefined) {
      const groups = m.length - 1
      const n = parseInt(num, 10)
      if (n >= 1 && n <= groups) return m[n] ?? ''
      // `$12` with one group is `$1` then a literal 2.
      if (num.length === 2) {
        const first = parseInt(num[0], 10)
        if (first >= 1 && first <= groups) return (m[first] ?? '') + num[1]
      }
    }
    return tok
  })
}

function applyOneSubstitute(segments: TextSegment[], s: CompiledSubstitute): TextSegment[] {
  const text = segments.map(seg => seg.text).join('')
  const matches: { start: number; end: number; rep: string }[] = []
  let changed = false
  s.regex.lastIndex = 0
  let hit: RegExpExecArray | null
  while ((hit = s.regex.exec(text)) !== null) {
    const rep = expandReplacement(s.rule.replacement, hit, text)
    if (rep !== hit[0]) changed = true
    matches.push({ start: hit.index, end: hit.index + hit[0].length, rep })
    if (hit[0].length === 0) s.regex.lastIndex++   // zero-width match (pitfall #29)
    if (!s.regex.global) break
  }
  if (!changed) return segments

  // Segment boundaries: `starts[i]` is where segment i begins in the line.
  const starts: number[] = []
  let at = 0
  for (const seg of segments) { starts.push(at); at += seg.text.length }
  const segAt = (pos: number): number => {
    for (let i = segments.length - 1; i >= 0; i--) if (pos >= starts[i] && (pos < starts[i] + segments[i].text.length)) return i
    return segments.length - 1
  }

  // Pieces in order, each tagged with its source segment (-1 = a match that
  // crossed a boundary), then merged per source so an in-segment match stays
  // one segment.
  const pieces: { src: number; text: string; visual?: TextSegment }[] = []
  const copyRange = (from: number, to: number) => {
    if (to <= from) return
    for (let i = 0; i < segments.length; i++) {
      const a = Math.max(from, starts[i]), b = Math.min(to, starts[i] + segments[i].text.length)
      if (b > a) pieces.push({ src: i, text: text.slice(a, b) })
    }
  }
  let pos = 0
  for (const m of matches) {
    copyRange(pos, m.start)
    const first = segAt(m.start)
    const inside = m.end <= starts[first] + segments[first].text.length
    if (m.rep) {
      if (inside) pieces.push({ src: first, text: m.rep })
      else {
        const base = segments[first]
        const visual: TextSegment = { text: '' }
        if (base.preset !== undefined) visual.preset = base.preset
        if (base.bold) visual.bold = true
        if (base.fg !== undefined) visual.fg = base.fg
        if (base.bg !== undefined) visual.bg = base.bg
        pieces.push({ src: -1, text: m.rep, visual })
      }
    }
    pos = m.end
  }
  copyRange(pos, text.length)

  const out: TextSegment[] = []
  let lastSrc: number | null = null
  for (const p of pieces) {
    if (p.src !== -1 && p.src === lastSrc) {
      out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + p.text }
    } else {
      out.push(p.src === -1 ? { ...p.visual, text: p.text } : { ...segments[p.src], text: p.text })
    }
    lastSrc = p.src
  }
  return out
}
