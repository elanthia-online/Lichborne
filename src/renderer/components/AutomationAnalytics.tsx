// Automation Analytics (v0.14.4) — shared UI for the per-tab health + usage view.
// Each Automations sub-panel renders <AnalyticsReview> at the top of its list and
// drops <RuleBadges> into each row, gated on the app-wide toggle. The analysis is
// pure (automationHealth.ts); the usage counts come from automationStats.ts.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { loadStats, resetStats, type AutomationStats } from '../automationStats'
import type { HealthReport, IssueKind } from '../automationHealth'
import { pressable } from '../utils/pressable'
import { confirmAction } from '../confirm'

// ── Shared rule-editor helpers ───────────────────────────────────────────────
// Every Automations rule editor already imports this module, so the two small
// keyboard behaviours they share live here rather than in five copies.

/** B396: ↑/↓ in a rule list moves to the previous/next row and SELECTS it, by
 *  clicking the row — so it goes through the panel's own guarded select (the
 *  B368 discard prompt included). Spread as `onKeyDown` on the list element;
 *  rows are the `role="option"` elements `pressable` renders. */
export function ruleListKeyDown(e: ReactKeyboardEvent<HTMLElement>): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const opts = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'))
  if (opts.length === 0) return
  e.preventDefault()
  let from = opts.findIndex(o => o.contains(document.activeElement))
  if (from < 0) from = opts.findIndex(o => o.getAttribute('aria-selected') === 'true')
  const step = e.key === 'ArrowDown' ? 1 : -1
  const next = from < 0 ? 0 : Math.max(0, Math.min(opts.length - 1, from + step))
  if (next === from) return
  opts[next].focus()
  opts[next].click()
}

/** B389: Enter in a single-line field of a rule form saves, the way the
 *  Highlights pattern field always has. Spread as `onKeyDown` on the form.
 *  Textareas, selects, buttons and non-text inputs keep their own Enter, and
 *  anything inside `data-enter-save="off"` (a Test field) is left alone. The
 *  macro key recorder never reaches this: it captures keys at the window and
 *  stops them there. */
export function enterToSave(save: () => void) {
  return (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return
    const t = e.target
    if (!(t instanceof HTMLInputElement)) return
    if (['checkbox', 'radio', 'color', 'button', 'submit', 'file', 'range'].includes(t.type)) return
    if (t.closest('[data-enter-save="off"]')) return
    e.preventDefault()
    save()
  }
}

const EMPTY_REPORT: HealthReport = { byRule: {}, duplicateGroups: [], conflictGroups: [], brokenIds: [], noopIds: [], obsolete: [] }
const EMPTY_STATS: AutomationStats = { trackingSince: 0, rules: {} }

const ISSUE_TITLE: Record<IssueKind, string> = {
  broken:    'Won’t compile / can never fire',
  duplicate: 'Identical to another rule',
  noop:      'Has no effect',
  conflict:  'Shares a key/name with another rule — only the first one fires',
  obsolete:  'A regex rule already matches this — review (styling may differ)',
}
const ISSUE_ICON: Record<IssueKind, string> = { broken: '⚠', duplicate: '⧉', noop: '∅', conflict: '⌨', obsolete: '♻' }

export function useRuleAnalytics<T extends { id: string }>(
  character: string,
  rules: T[],
  analyze: (rules: T[]) => HealthReport,
  on: boolean,
  // Called AFTER a Reset clears the stats, so the panel can persist the cleared
  // map to the profile YAML (typically the panel's onSaved → scheduled profile
  // save). Without it, Reset only clears localStorage and the old counts re-seed
  // from YAML on next launch (importCharacterProfile). Optional — a missing one
  // just means "clears now, persists on the next incidental profile save."
  onAfterReset?: () => void,
): { on: boolean; report: HealthReport; stats: AutomationStats; reset: () => void } {
  const [nonce, setNonce] = useState(0)
  const report = useMemo(() => (on ? analyze(rules) : EMPTY_REPORT), [rules, on, analyze])
  // Live-refresh while the panel is open: recordFire MUTATES the cached stats
  // object in place (same reference), and the panel reads it only on render — so
  // without a periodic bump the counts never update on screen and Reset would
  // look like a no-op. The interval re-reads every 2s (cheap; the heavier
  // analyze() memo is keyed on [rules,on], not nonce, so it does NOT re-run).
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setNonce(n => n + 1), 2000)
    return () => clearInterval(id)
  }, [on])
  // Recompute on each nonce bump AND on reset (resetStats swaps in a fresh object).
  const stats = useMemo(() => {
    void nonce
    return on ? { ...loadStats(character) } : EMPTY_STATS
  }, [on, character, nonce])
  const reset = useCallback(() => { resetStats(character); setNonce(n => n + 1); onAfterReset?.() }, [character, onAfterReset])
  return { on, report, stats, reset }
}

export function RuleBadges({ ruleId, report, stats }: { ruleId: string; report: HealthReport; stats: AutomationStats }) {
  const issues = report.byRule[ruleId]
  const fires = stats.rules[ruleId]?.fires ?? 0
  // Clean + unfired rows render a faint dash — most of a big list is this, so a
  // loud 💤 per row was pure noise (the Quiet SECTION already lists them).
  if (!issues && fires === 0) return <span className="aa-badges aa-badges--idle" title="Not fired since tracking began">·</span>
  return (
    <span className="aa-badges">
      {fires > 0 && <span className="aa-fires" title={`Fired ${fires.toLocaleString()} time${fires === 1 ? '' : 's'}`}>{fires.toLocaleString()}</span>}
      {issues?.map(k => <span key={k} className={`aa-issue aa-issue--${k}`} title={ISSUE_TITLE[k]}>{ISSUE_ICON[k]}</span>)}
    </span>
  )
}

// ── Review sub-pieces — MODULE LEVEL on purpose ──────────────────────────────
// These were originally defined INSIDE AnalyticsReview's render. That made them
// a NEW component type on every render, so React remounted every <details> on
// each re-render (the panel re-renders on every incoming game line + the 2s
// live-refresh) — wiping the user's expand/collapse state. Native <details>
// open state only survives if the element isn't remounted, which requires a
// STABLE component type. Keep these here.
type AANav = { name: (id: string) => string; onJump: (id: string) => void }
// Cap entries rendered per section — a bloated ruleset has 1000s of duplicates.
const AA_CAP = 200

function AAJump({ id, nav }: { id: string; nav: AANav }) {
  return <button className="aa-jump" onClick={() => nav.onJump(id)}>{nav.name(id)}</button>
}
function AANameList({ ids, nav }: { ids: string[]; nav: AANav }) {
  return <span className="aa-names">{ids.slice(0, AA_CAP).map((id, i) => <span key={id}>{i > 0 && <span className="aa-sep">,</span>}<AAJump id={id} nav={nav} /></span>)}</span>
}
function AAMore({ n }: { n: number }) {
  return n > AA_CAP ? <div className="aa-more">…and {(n - AA_CAP).toLocaleString()} more</div> : null
}
function AAChip({ kind, n, label, keepZero, title }: { kind: string; n: number; label: string; keepZero?: boolean; title?: string }) {
  if (n === 0 && !keepZero) return null   // hide zero-count issue chips to declutter the bar
  return <span title={title} className={`aa-chip aa-chip--${kind}${n === 0 ? ' aa-chip--zero' : ''}`}>{n.toLocaleString()} {label}</span>
}
// Every category is ALWAYS rendered as a collapsible <details> (even at count 0,
// where it shows "None") so the panel reads as a consistent report card — you can
// expand any category and the set of rows never shifts as counts change.
function AASection({ kind, icon, label, count, warn, desc, children }: {
  kind: string; icon: string; label: string; count: number; warn?: boolean; desc?: string; children: React.ReactNode
}) {
  const empty = count === 0
  return (
    <details className={`aa-sec${warn && !empty ? ' aa-sec--warn' : ''}${empty ? ' aa-sec--empty' : ''}`}>
      {/* title on the summary = a hover tooltip that explains the category even
          when it's collapsed; the desc below repeats it on expand (incl. when the
          section is empty) so the meaning is never hidden. Self-explaining UI —
          UX/UI polish standard #8 in CLAUDE.md. */}
      <summary className="aa-sec-sum" title={desc}>
        <span className="aa-sec-icon">{icon}</span>
        <span className="aa-sec-name">{label}</span>
        <span className={`aa-sec-count aa-sec-count--${kind}`}>{count.toLocaleString()}</span>
      </summary>
      <div className="aa-sec-body">
        {desc && <div className="aa-sec-desc">{desc}</div>}
        {empty ? <div className="aa-sec-none">None.</div> : children}
      </div>
    </details>
  )
}

export function AnalyticsReview<T extends { id: string }>({
  rules, report, stats, nameOf, onJump, onReset, onBulkRemove,
}: {
  rules: T[]
  report: HealthReport
  stats: AutomationStats
  nameOf: (r: T) => string
  onJump: (id: string) => void
  onReset: () => void
  // Remove the given rule ids in one save (used by "Remove duplicate copies").
  onBulkRemove?: (ids: string[]) => void
}) {
  // For each duplicate set, keep the FIRST and delete the rest.
  // B377: the themed confirm, never window.confirm (it froze the whole window
  // and ignored the theme). The ids are captured before the await.
  const dupCopies = report.duplicateGroups.flatMap(g => g.slice(1))
  const removeDuplicates = async () => {
    if (!onBulkRemove || dupCopies.length === 0) return
    const ids = dupCopies
    const ok = await confirmAction({
      title: 'Remove duplicate copies?',
      message: `${ids.length.toLocaleString()} duplicate ${ids.length === 1 ? 'copy' : 'copies'} will be removed. One of each identical set is kept.`,
      detail: "This can't be undone here — your YAML profile backups still have the old version.",
      confirmLabel: 'Remove copies',
      danger: true,
    })
    if (ok) onBulkRemove(ids)
  }
  const obsoleteIds = report.obsolete.map(o => o.id)
  const removeObsolete = async () => {
    if (!onBulkRemove || obsoleteIds.length === 0) return
    const ids = obsoleteIds
    const ok = await confirmAction({
      title: 'Remove obsolete rules?',
      message: `${ids.length.toLocaleString()} ${ids.length === 1 ? 'rule is' : 'rules are'} already matched by a broader regex and will be removed.`,
      detail: "Removing can change styling where a rule's color or scope differs from the regex, so review the list first. This can't be undone here — your YAML profile backups still have the old version.",
      confirmLabel: 'Remove rules',
      danger: true,
    })
    if (ok) onBulkRemove(ids)
  }
  // B370: clearing every usage count is destructive, so it asks first.
  const confirmReset = async () => {
    const ok = await confirmAction({
      title: 'Reset usage stats?',
      message: 'Fire counts and last-fired times for every rule here go back to zero.',
      detail: "Your rules aren't changed. This can't be undone.",
      confirmLabel: 'Reset',
      danger: true,
    })
    if (ok) onReset()
  }
  const [open, setOpen] = useState(true)
  const byId = useMemo(() => new Map(rules.map(r => [r.id, r])), [rules])
  const name = (id: string) => { const r = byId.get(id); return r ? (nameOf(r).trim() || '(unnamed)') : '(deleted)' }

  const quiet = rules.filter(r => (stats.rules[r.id]?.fires ?? 0) === 0)
  const top = rules
    .map(r => ({ r, fires: stats.rules[r.id]?.fires ?? 0 }))
    .filter(x => x.fires > 0)
    .sort((a, b) => b.fires - a.fires)
    .slice(0, 100)

  const nIssues = report.brokenIds.length + report.duplicateGroups.length + report.noopIds.length + report.conflictGroups.length + report.obsolete.length
  const since = stats.trackingSince ? new Date(stats.trackingSince).toLocaleDateString() : '—'

  const nav: AANav = { name, onJump }

  return (
    <div className="aa-review">
      {/* B335: keyboard-reachable disclosure. pressable ignores keys aimed at
          the nested Reset button, which keeps its own click. */}
      <div className="aa-bar" {...pressable(() => setOpen(o => !o))} aria-expanded={open}>
        <span className="aa-chevron">{open ? '▾' : '▸'}</span>
        <span className="aa-title">{'\u{1F4CA}'} Automation health</span>
        <span className="aa-chips">
          {nIssues === 0
            ? <span className="aa-chip aa-chip--ok" title="No broken, duplicate, conflicting, obsolete, or empty rules">{'\u{2713}'} no issues</span>
            : <>
                <AAChip kind="broken" n={report.brokenIds.length} label="broken" title={ISSUE_TITLE.broken} />
                <AAChip kind="conflict" n={report.conflictGroups.length} label={report.conflictGroups.length === 1 ? 'conflict' : 'conflicts'} title={ISSUE_TITLE.conflict} />
                <AAChip kind="dup" n={report.duplicateGroups.length} label={report.duplicateGroups.length === 1 ? 'duplicate' : 'duplicates'} title={ISSUE_TITLE.duplicate} />
                <AAChip kind="obsolete" n={report.obsolete.length} label="obsolete" title={ISSUE_TITLE.obsolete} />
                <AAChip kind="noop" n={report.noopIds.length} label="no-op" title={ISSUE_TITLE.noop} />
              </>}
          <AAChip kind="quiet" n={quiet.length} label="quiet" keepZero title="Rules that haven’t fired since tracking began" />
        </span>
        <span className="aa-spacer" />
        <span className="aa-since" title="Usage tracking started on this date">since {since}</span>
        <button type="button" className="aa-reset" onClick={e => { e.stopPropagation(); void confirmReset() }} title="Clear all usage stats for this character">Reset</button>
      </div>

      {open && (
        <div className="aa-body">
          {nIssues === 0 && quiet.length === 0 && top.length === 0 && (
            <div className="aa-empty-msg">No usage yet — counts will appear here as your rules fire.</div>
          )}
          {nIssues === 0 && (quiet.length > 0 || top.length > 0) && (
            <div className="aa-clean">{'\u{2713}'} Nothing broken, duplicate, conflicting, obsolete, or empty — this list is clean.</div>
          )}

          <AASection key="broken" kind="broken" icon={ISSUE_ICON.broken} label="Broken" count={report.brokenIds.length} warn
            desc="Won’t compile, so it can never fire — usually an invalid regex, or a macro with no key / an alias with no input. Fix the pattern or delete it.">
            <AANameList ids={report.brokenIds} nav={nav} /><AAMore n={report.brokenIds.length} />
          </AASection>

          <AASection key="conflict" kind="conflict" icon={ISSUE_ICON.conflict} label="Conflicts" count={report.conflictGroups.length} warn
            desc="Two rules share the same key or name — only the first one fires, the rest are dead (e.g. two macros both bound to Ctrl+2).">
            {report.conflictGroups.slice(0, AA_CAP).map((g, i) => <div key={i} className="aa-set"><AANameList ids={g} nav={nav} /></div>)}
            <AAMore n={report.conflictGroups.length} />
          </AASection>

          <AASection key="dup" kind="dup" icon={ISSUE_ICON.duplicate} label="Duplicate sets" count={report.duplicateGroups.length}
            desc="Two or more identical rules — same pattern, scope, and style. Keep one of each set and delete the rest (the button does this for you).">
            {onBulkRemove && dupCopies.length > 0 && (
              <button type="button" className="ui-btn ui-btn--danger ui-btn--sm aa-action" onClick={() => void removeDuplicates()}>
                {'\u{1F9F9}'} Remove {dupCopies.length.toLocaleString()} duplicate copies (keep one of each)
              </button>
            )}
            {report.duplicateGroups.slice(0, AA_CAP).map((g, i) => (
              <div key={i} className="aa-set"><span className="aa-set-n">{g.length}×</span> <AANameList ids={g} nav={nav} /></div>
            ))}
            <AAMore n={report.duplicateGroups.length} />
          </AASection>

          <AASection key="obsolete" kind="obsolete" icon={ISSUE_ICON.obsolete} label="Obsolete (covered by regex)" count={report.obsolete.length}
            desc={'A regex rule already matches everything this text/phrase rule matches — e.g. “joins the .+” covers “joins the adventure”. Removing may change styling if the two differ in color or scope, so review before removing.'}>
            {onBulkRemove && obsoleteIds.length > 0 && (
              <button type="button" className="ui-btn ui-btn--danger ui-btn--sm aa-action" onClick={() => void removeObsolete()}>
                {'\u{1F9F9}'} Remove {obsoleteIds.length.toLocaleString()} covered rules (review first)
              </button>
            )}
            {report.obsolete.slice(0, AA_CAP).map(o => (
              <div key={o.id} className="aa-set"><AAJump id={o.id} nav={nav} /> <span className="aa-set-by">→ covered by</span> <AAJump id={o.by} nav={nav} /></div>
            ))}
            <AAMore n={report.obsolete.length} />
          </AASection>

          <AASection key="noop" kind="noop" icon={ISSUE_ICON.noop} label="No effect" count={report.noopIds.length}
            desc="The rule does nothing — a highlight with no color/bold/glow, or a trigger/macro/alias with no commands.">
            <AANameList ids={report.noopIds} nav={nav} /><AAMore n={report.noopIds.length} />
          </AASection>

          <div className="aa-usage-label">Usage</div>

          <AASection key="top" kind="top" icon={'\u{1F525}'} label="Top used" count={top.length}
            desc="Your most-fired rules since tracking began — the ones doing the most work.">
            {top.map(x => (
              <div key={x.r.id} className="aa-top-row"><AAJump id={x.r.id} nav={nav} /> <span className="aa-fires-inline">{x.fires.toLocaleString()}</span></div>
            ))}
          </AASection>

          <AASection key="quiet" kind="quiet" icon={'\u{1F4A4}'} label="Quiet (not fired)" count={quiet.length}
            desc="Not fired since tracking began — but rare-but-valid rules (death, rare loot) live here too, so “quiet” doesn’t mean “delete.”">
            <AANameList ids={quiet.map(r => r.id)} nav={nav} /><AAMore n={quiet.length} />
          </AASection>
        </div>
      )}
    </div>
  )
}
