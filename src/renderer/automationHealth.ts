// Automation Analytics (v0.14.4) — STATIC health analysis. Pure functions over a
// rule list; no runtime data, no perf cost (run on-demand when an Automations tab
// renders, never per game line). Finds the cruft players can't see:
//   broken    — won't compile / can never fire (regex builder returns null;
//               a macro with no key; an alias with no input)
//   duplicate — two+ rules with IDENTICAL effect (visual identity for highlights,
//               pattern+actions for triggers, etc.) — the import-era clutter
//   noop      — a rule that does nothing (highlight with no visual effect; a
//               trigger/macro/alias with no commands)
//   conflict  — macros bound to the SAME key (matchKeyCombo -> first wins, rest
//               dead) or aliases sharing the SAME trigger input
//   obsolete  — NOT an exact duplicate, but REDUNDANT: a literal rule whose whole
//               pattern is already matched by ANOTHER rule with the SAME effect
//               (the classic "a broad regex highlight already covers my plain
//               `bronze` highlight"). Deleting it changes nothing visible.
//
// Reuses the existing per-type regex builders so "broken" means exactly what the
// runtime means by "won't compile."

import { buildHighlightRegex, effectiveEffect, type HighlightRule } from './highlights'
import { buildTriggerRegex, type TriggerRule } from './triggers'
import { buildMuteRegex, type MuteRule } from './mutes'
import { buildSubstituteRegex, type SubstituteRule } from './substitutes'
import type { MacroRule, AliasRule } from './macros'

export type IssueKind = 'broken' | 'duplicate' | 'noop' | 'conflict' | 'obsolete'

export interface HealthReport {
  byRule: Record<string, IssueKind[]>  // ruleId -> issues it has (may be several)
  duplicateGroups: string[][]          // each inner array = ruleIds identical to each other
  conflictGroups: string[][]           // macros sharing a key / aliases sharing an input
  brokenIds: string[]
  noopIds: string[]
  obsolete: { id: string; by: string }[]  // `id` is redundant; `by` already covers it
}

function emptyReport(): HealthReport {
  return { byRule: {}, duplicateGroups: [], conflictGroups: [], brokenIds: [], noopIds: [], obsolete: [] }
}

function add(report: HealthReport, id: string, kind: IssueKind): void {
  const cur = report.byRule[id] ?? (report.byRule[id] = [])
  if (!cur.includes(kind)) cur.push(kind)
}

// Group rules by an identity key; any key shared by 2+ rules is a duplicate set.
function groupBy<T extends { id: string }>(rules: T[], keyOf: (r: T) => string): string[][] {
  const map = new Map<string, string[]>()
  for (const r of rules) {
    const k = keyOf(r)
    const arr = map.get(k) ?? []
    arr.push(r.id)
    map.set(k, arr)
  }
  return [...map.values()].filter(g => g.length > 1)
}

// A text/phrase rule's plain pattern string (the thing we can test as a literal),
// or null for regex-mode rules (whose pattern is itself a regex, not a string).
const literalOfMode = (mode: string, pattern: string): string | null =>
  (mode === 'text' || mode === 'phrase') ? pattern.trim() : null

// OBSOLETE detection. A LITERAL rule A is obsolete if another rule B (different
// pattern, SAME effect) FULLY matches A's literal — B already does the same thing
// wherever A would fire, so A is redundant. We only test literal (text/phrase)
// rules as CANDIDATES (a regex pattern can't be reliably tested as a plain
// string), but the COVERER B can be ANY compilable rule — so the headline case
// "a broad regex highlight already covers my plain `bronze` highlight" is caught.
// Requiring the match to span the WHOLE literal (`m[0] === lit`) avoids false
// positives like "bronze" obsoleting "bronze sword" (B matches only part). Two
// different literals can't mutually full-cover, so there's no double-flagging;
// the literal is flagged and the broader coverer is kept.
function findObsolete<T extends { id: string }>(
  rules: T[],
  regexOf: (r: T) => RegExp | null,
  literalOf: (r: T) => string | null,
  effectKey: (r: T) => string,
): { id: string; by: string }[] {
  // Only SAME-EFFECT rules can shadow each other, so bucket by effect first — a
  // naive O(n²) over thousands of rules would jank the panel; realistic rulesets
  // have diverse styles, so the buckets stay small.
  const byEffect = new Map<string, { id: string; re: RegExp | null; lit: string | null }[]>()
  for (const r of rules) {
    const eff = effectKey(r)
    const arr = byEffect.get(eff) ?? []
    arr.push({ id: r.id, re: regexOf(r), lit: literalOf(r) })
    byEffect.set(eff, arr)
  }
  const out: { id: string; by: string }[] = []
  for (const group of byEffect.values()) {
    if (group.length < 2) continue
    const coverers = group.filter(g => g.re)   // only compilable rules can cover
    for (const A of group) {
      if (!A.lit) continue
      for (const B of coverers) {
        if (B.id === A.id || B.lit === A.lit) continue
        B.re!.lastIndex = 0
        const m = B.re!.exec(A.lit)
        if (m && m[0] === A.lit) { out.push({ id: A.id, by: B.id }); break }
      }
    }
  }
  return out
}

// ===== Highlights =====
export function analyzeHighlights(rules: HighlightRule[]): HealthReport {
  const report = emptyReport()
  for (const r of rules) {
    if (buildHighlightRegex(r) === null) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }
    const s = r.style
    // `effectiveEffect`, not the legacy `glow` bool: an effect-only rule (no
    // colour, no background, no bold, effect = Rainbow) paints plenty, and was
    // being reported as "the rule does nothing".
    const noVisual = s.textColor === 'transparent' && s.bgColor === 'transparent'
      && !s.bold && effectiveEffect(s) === 'none'
    if (noVisual) { add(report, r.id, 'noop'); report.noopIds.push(r.id) }
  }
  // `effect` MUST be in this key. Without it two rules that differ only by
  // Shimmer vs Fire hashed the same, so "Remove duplicate copies (keep one of
  // each)" deleted one of them — silent data loss driven by a property the key
  // forgot (pitfall #121's shape, one layer up).
  report.duplicateGroups = groupBy(rules, r =>
    [r.mode, r.scope, r.caseSensitive, r.pattern,
     r.style.textColor, r.style.bgColor, r.style.bold,
     effectiveEffect(r.style), r.style.glowColor].join(' '))
  for (const g of report.duplicateGroups) for (const id of g) add(report, id, 'duplicate')
  // OBSOLETE for highlights is COVERAGE-based, per the user's model: "if a regex
  // rule can capture a text/phrase item, that item is obsolete" — regardless of
  // scope (line OR match) and regardless of style. So: COVERER = regex-mode rules
  // only; CANDIDATE = text/phrase rules; ONE bucket (no scope/style in the key),
  // so a broad regex shadows a specific literal even when colored/scoped
  // differently. The `m[0] === lit` full-match rule in findObsolete still means a
  // regex only flags a literal whose WHOLE pattern it matches (a partial overlap —
  // e.g. `joins the .+` vs "A steeply…road joins the trail" — is NOT flagged).
  // NOTE: because style/scope are ignored, removing one CAN change appearance (the
  // v0.11.3 specificity model makes a smaller literal match win its own color; a
  // line rule styles the whole line) — so it's a REVIEW signal and the UI says
  // "may change styling — review", not "safe to remove".
  report.obsolete = findObsolete(rules,
    r => r.mode === 'regex' ? buildHighlightRegex(r) : null,
    r => literalOfMode(r.mode, r.pattern),
    () => 'hl')
  for (const o of report.obsolete) add(report, o.id, 'obsolete')
  return report
}

// ===== Triggers =====
function actionSig(r: TriggerRule): string {
  // Identity that ignores per-action ids/order-noise but captures what it DOES —
  // DERIVED from the action's own fields, never a hand-written list.
  //
  // It used to name six: type, command, echoMessage, varName/varValue and the
  // two sound fields. Every other field was invisible to it, so two triggers
  // differing ONLY in an echo's stream or colour, a notify title, a webhook URL,
  // a log file or a delay hashed identically — the duplicate report grouped
  // them, and "Remove duplicate copies" deletes all but the first of each group.
  // Two genuinely different triggers could therefore be silently reduced to one.
  // (F118's four echo style fields would have been four more of these; deriving
  // the signature means the next field added is covered for free — pitfall #130,
  // never hand-maintain a key list.)
  //
  // Falsy values are dropped so "unset" and "explicitly off/empty/zero" agree,
  // and keys are sorted so property order can't change the result. Erring toward
  // MORE distinct signatures is the safe direction: a missed duplicate costs a
  // stale report row, a false one costs the user a rule.
  return r.actions.map(a => {
    const fields = Object.entries(a as unknown as Record<string, unknown>)
      .filter(([k, v]) => k !== 'id' && v !== undefined && v !== null && v !== '' && v !== false && v !== 0)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    return JSON.stringify(fields)
  }).join('|')
}
export function analyzeTriggers(rules: TriggerRule[]): HealthReport {
  const report = emptyReport()
  for (const r of rules) {
    // A 'variable' trigger has no pattern regex; only text triggers can be "broken" by regex.
    if (r.triggerType !== 'variable' && buildTriggerRegex(r) === null) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }
    if (r.triggerType === 'variable' && !r.watchVariable?.trim()) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }
    if (r.actions.length === 0) { add(report, r.id, 'noop'); report.noopIds.push(r.id) }
  }
  report.duplicateGroups = groupBy(rules, r =>
    [r.triggerType, r.pattern, r.mode, r.caseSensitive, r.watchStream, r.watchVariable ?? '', actionSig(r)].join(' '))
  for (const g of report.duplicateGroups) for (const id of g) add(report, id, 'duplicate')
  report.obsolete = findObsolete(rules,
    r => r.triggerType !== 'variable' ? buildTriggerRegex(r) : null,
    r => r.triggerType !== 'variable' ? literalOfMode(r.mode, r.pattern) : null,
    r => [r.triggerType, actionSig(r)].join('|'))
  for (const o of report.obsolete) add(report, o.id, 'obsolete')
  return report
}

// ===== Mutes =====
export function analyzeMutes(rules: MuteRule[]): HealthReport {
  const report = emptyReport()
  for (const r of rules) {
    if (buildMuteRegex(r) === null) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }
  }
  report.duplicateGroups = groupBy(rules, r =>
    [r.mode, r.scope, r.caseSensitive, r.pattern, r.stream ?? ''].join(' '))
  for (const g of report.duplicateGroups) for (const id of g) add(report, id, 'duplicate')
  report.obsolete = findObsolete(rules, buildMuteRegex,
    r => literalOfMode(r.mode, r.pattern),
    r => [r.scope, r.stream ?? ''].join('|'))
  for (const o of report.obsolete) add(report, o.id, 'obsolete')
  return report
}

// ===== Substitutes =====
export function analyzeSubstitutes(rules: SubstituteRule[]): HealthReport {
  const report = emptyReport()
  for (const r of rules) {
    if (buildSubstituteRegex(r) === null) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }
  }
  report.duplicateGroups = groupBy(rules, r =>
    [r.mode, r.caseSensitive, r.pattern, r.replacement, r.stream ?? ''].join(' '))
  for (const g of report.duplicateGroups) for (const id of g) add(report, id, 'duplicate')
  // NOTE: a substitute's replacement can carry $N capture refs whose meaning
  // depends on the pattern, so same-replacement-string is a heuristic effect key
  // (informational — the user reviews before removing).
  report.obsolete = findObsolete(rules, buildSubstituteRegex,
    r => literalOfMode(r.mode, r.pattern),
    r => [r.replacement, r.stream ?? ''].join('|'))
  for (const o of report.obsolete) add(report, o.id, 'obsolete')
  return report
}

// ===== Macros =====  (input-triggered: no text-coverage "obsolete"; key CONFLICT
// is the redundancy signal here)
export function analyzeMacros(rules: MacroRule[]): HealthReport {
  const report = emptyReport()
  for (const r of rules) {
    if (!r.key.trim()) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }   // no key = can never fire
    if (r.commands.every(c => !c.trim())) { add(report, r.id, 'noop'); report.noopIds.push(r.id) }
  }
  // Duplicate = same key + same commands. Conflict = same key among ENABLED
  // macros (matchKeyCombo returns the first; the rest are dead bindings).
  report.duplicateGroups = groupBy(rules, r => [r.key.trim().toLowerCase(), r.commands.join(' ')].join(''))
  for (const g of report.duplicateGroups) for (const id of g) add(report, id, 'duplicate')
  report.conflictGroups = groupBy(rules.filter(r => r.enabled && r.key.trim()), r => r.key.trim().toLowerCase())
  for (const g of report.conflictGroups) for (const id of g) add(report, id, 'conflict')
  return report
}

// ===== Aliases =====
export function analyzeAliases(rules: AliasRule[]): HealthReport {
  const report = emptyReport()
  for (const r of rules) {
    if (!r.input.trim()) { add(report, r.id, 'broken'); report.brokenIds.push(r.id) }
    if (r.commands.every(c => !c.trim()) && !r.passThrough) { add(report, r.id, 'noop'); report.noopIds.push(r.id) }
  }
  report.duplicateGroups = groupBy(rules, r =>
    [r.caseSensitive ? r.input.trim() : r.input.trim().toLowerCase(), r.commands.join(' ')].join(''))
  for (const g of report.duplicateGroups) for (const id of g) add(report, id, 'duplicate')
  // Conflict = same input among ENABLED aliases (resolveAlias returns the first match).
  report.conflictGroups = groupBy(rules.filter(r => r.enabled && r.input.trim()),
    r => r.caseSensitive ? r.input.trim() : r.input.trim().toLowerCase())
  for (const g of report.conflictGroups) for (const id of g) add(report, id, 'conflict')
  return report
}
