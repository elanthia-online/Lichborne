// Content-identity keys for automation rules (F63, v0.15.2) — THE single
// definition of "these two rules are the same rule" for every dedup surface:
// Profile Transfer's append-merge, Transfer's global-awareness (skip a
// per-character import that already exists as a global), and the per-rule
// scope MOVE (don't create a duplicate in the target store; report "already
// exists" instead). Extracted verbatim from profileTransfer.ts so the move
// action and Transfer can never drift on what counts as a duplicate. The move
// also needs `sameRuleContent` (below) before it drops its own copy: a matching
// key only proves the rules COLLIDE, not that they're the same.
//
// Identity is CONTENT, deliberately ignoring: id (regenerated on import),
// name (a label, not behavior), enabled, and group gating (per-character —
// meaningless across scopes). Trigger identity is pattern-only (not actions)
// — the established Transfer behavior since F38; keep the surfaces consistent
// rather than "improving" one of them. The one exception is a Variable-change
// trigger, which has no pattern and is identified by the variable it watches
// (see trKey).

export type RuleKeyFn = (item: unknown) => string

export function hlKey(it: unknown): string {
  const h = it as { pattern?: string; scope?: string; caseSensitive?: boolean }
  const p = h.caseSensitive ? (h.pattern ?? '') : (h.pattern ?? '').toLowerCase()
  return `${p}|${h.scope ?? 'match'}|${h.caseSensitive ? 1 : 0}`
}

export function trKey(it: unknown): string {
  const t = it as { pattern?: string; caseSensitive?: boolean; triggerType?: string; watchVariable?: string }
  // A Variable-change trigger has no pattern (it is ''), so pattern-only
  // identity made EVERY variable trigger "the same rule" — and the same as any
  // blank text trigger. That key feeds deletes: the scope move removes the
  // source when the target "already has it", and Transfer's append-merge skips
  // "duplicates", so a variable trigger silently vanished in both. Its identity
  // is the variable it watches. Text triggers keep the established key exactly.
  if (t.triggerType === 'variable') return `var:${(t.watchVariable ?? '').trim().toLowerCase()}`
  const p = t.caseSensitive ? (t.pattern ?? '') : (t.pattern ?? '').toLowerCase()
  return `${p}|${t.caseSensitive ? 1 : 0}`
}

export function maKey(it: unknown): string {
  return String((it as { key?: string }).key ?? '').toLowerCase()
}

export function alKey(it: unknown): string {
  return String((it as { input?: string }).input ?? '').toLowerCase()
}

export function muteKey(it: unknown): string {
  const g = it as { pattern?: string; mode?: string; scope?: string; caseSensitive?: boolean }
  const p = g.caseSensitive ? (g.pattern ?? '') : (g.pattern ?? '').toLowerCase()
  return `${p}|${g.mode ?? 'phrase'}|${g.scope ?? 'line'}|${g.caseSensitive ? 1 : 0}`
}

export function subKey(it: unknown): string {
  const g = it as { pattern?: string; mode?: string; replacement?: string; caseSensitive?: boolean }
  const p = g.caseSensitive ? (g.pattern ?? '') : (g.pattern ?? '').toLowerCase()
  return `${p}|${g.mode ?? 'phrase'}|${g.replacement ?? ''}|${g.caseSensitive ? 1 : 0}`
}

// ── Full content equality ─────────────────────────────────────────────────────
//
// The keys above say two rules are the SAME RULE (same pattern / key / input).
// That is enough to refuse a duplicate, but not to throw one copy away: two
// triggers with one pattern can do entirely different things. The scope move
// uses this to tell "an exact copy is already there" (safe to drop ours) from
// "a different rule shares the pattern" (refuse, lose nothing).
//
// Derived from the WHOLE record rather than a list of named fields, because a
// hand-listed signature silently goes stale as fields are added and this one
// decides a removal (pitfall #130, B439). Ignored: every `id` at any depth
// (a trigger's actions carry random ids), and the top-level fields that don't
// travel between scopes or aren't behavior — name and group gating. `enabled`
// DOES count: dropping an enabled rule in favour of a disabled twin would
// quietly switch the rule off.
// `undefined` values are dropped, so an absent field equals an unset one.
const CONTENT_IGNORED_TOP = new Set(['id', 'name', 'groupIds', 'allGroups'])

function canonical(v: unknown, top: boolean): unknown {
  if (Array.isArray(v)) return v.map(x => canonical(x, false))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      if (k === 'id' || (top && CONTENT_IGNORED_TOP.has(k))) continue
      const x = (v as Record<string, unknown>)[k]
      if (x === undefined) continue
      out[k] = canonical(x, false)
    }
    return out
  }
  return v
}

// `normalize` fills in a rule type's defaults first (triggerCompareForm), so a
// rule saved before a field existed equals one saved after. `includeGating`
// counts group gating as content: moving a rule INTO a character where a copy
// is gated to a group must not silently make it group-gated.
export function sameRuleContent(
  a: unknown, b: unknown,
  opts: { normalize?: (r: unknown) => unknown; includeGating?: boolean } = {},
): boolean {
  const n = opts.normalize ?? ((r: unknown) => r)
  const c = (r: unknown) => {
    const v = canonical(n(r), true) as Record<string, unknown>
    if (opts.includeGating) {
      const g = r as { groupIds?: string[]; allGroups?: boolean }
      v.__gating = { allGroups: g.allGroups ?? false, groupIds: [...(g.groupIds ?? [])].sort() }
    }
    return JSON.stringify(v)
  }
  return c(a) === c(b)
}

// The global-capable rule types share this lookup (F37 shipped the first
// four; mutes/substitutes joined at Sekmeht's ask in the same release).
export const GLOBAL_RULE_KEYS = {
  highlights:  hlKey,
  triggers:    trKey,
  macros:      maKey,
  aliases:     alKey,
  mutes:       muteKey,
  substitutes: subKey,
} as const

export type GlobalRuleType = keyof typeof GLOBAL_RULE_KEYS
