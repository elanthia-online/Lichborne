// Attention model for the Overview view (v0.19.0, DESIGN §47).
//
// The one thing that makes a multi-character dashboard worth LEAVING OPEN: a
// per-character answer to "does this one need me right now?", severity-ordered
// so the reading order, the chip order and the sort order are all the same list
// (UX polish standard #3).
//
// PURE BY DESIGN — no React, no localStorage, no imports from the renderer. It
// takes a plain snapshot and a clock and returns flags. That is what lets it be
// covered by tmp-rules-harness, which is where a severity table quietly drifts
// out of agreement with the UI otherwise.

export type AttentionFlag =
  | 'dead'
  | 'disconnected'
  | 'health-crit'
  | 'bleeding'
  | 'stunned'
  | 'poisoned'
  | 'diseased'
  | 'health-low'
  | 'webbed'
  | 'spoken-to'
  | 'idle'
  | 'mind-lock'

export interface AttentionDef {
  /** Higher = more urgent. Drives chip order, card order and the summary count. */
  severity: number
  /** Chip text — one or two words, no punctuation. */
  label: string
  /** `title=` text. Every chip explains itself (UX standard #8). */
  desc: string
  /** CSS modifier suffix, e.g. `ov-flag--dead`. */
  cls: string
}

// Severity ladder. Ordering rationale: things you cannot recover from sit above
// things you can, and a state the GAME put you in sits above one you chose.
export const ATTENTION_DEFS: Record<AttentionFlag, AttentionDef> = {
  dead:         { severity: 100, label: 'Dead',        cls: 'dead',        desc: 'This character is dead. Decay is running.' },
  disconnected: { severity:  95, label: 'Offline',     cls: 'offline',     desc: 'The connection dropped. Use Reconnect in the app bar, or the tab or card menu.' },
  'health-crit':{ severity:  90, label: 'Critical',    cls: 'crit',        desc: 'Health is below the critical threshold.' },
  bleeding:     { severity:  80, label: 'Bleeding',    cls: 'bleeding',    desc: 'Actively losing health to a bleed.' },
  stunned:      { severity:  70, label: 'Stunned',     cls: 'stunned',     desc: 'Stunned — commands will not go through.' },
  poisoned:     { severity:  62, label: 'Poisoned',    cls: 'poisoned',    desc: 'Poisoned.' },
  diseased:     { severity:  60, label: 'Diseased',    cls: 'diseased',    desc: 'Diseased.' },
  'health-low': { severity:  50, label: 'Hurt',        cls: 'low',         desc: 'Health is below the low threshold.' },
  webbed:       { severity:  45, label: 'Webbed',      cls: 'webbed',      desc: 'Webbed — movement is blocked.' },
  'spoken-to':  { severity:  40, label: 'Spoken to',   cls: 'spoken',      desc: 'Somebody addressed this character recently.' },
  idle:         { severity:  30, label: 'Idle',        cls: 'idle',        desc: 'No game text has arrived for a while.' },
  'mind-lock':  { severity:  20, label: 'Mind locked', cls: 'lock',        desc: 'One or more skills are saturated and can learn no more.' },
}

/** Severity-descending. Frozen so a caller cannot sort it in place. */
export const ATTENTION_ORDER: readonly AttentionFlag[] = Object.freeze(
  (Object.keys(ATTENTION_DEFS) as AttentionFlag[])
    .sort((a, b) => ATTENTION_DEFS[b].severity - ATTENTION_DEFS[a].severity),
)

export interface AttentionThresholds {
  healthCritPct: number
  healthLowPct: number
  idleSeconds: number
  freeToActSeconds: number
  spokeToYouSeconds: number
}

export const DEFAULT_THRESHOLDS: AttentionThresholds = {
  healthCritPct: 25,
  healthLowPct: 50,
  idleSeconds: 180,
  freeToActSeconds: 10,
  spokeToYouSeconds: 60,
}

export interface AttentionInput {
  connected: boolean
  dead: boolean
  bleeding: boolean
  stunned: boolean
  poisoned: boolean
  diseased: boolean
  webbed: boolean
  /** null when no health vital has arrived yet — treated as UNKNOWN, never as 0. */
  healthPct: number | null
  /** ms timestamp of the last inbound game text; 0 when nothing has arrived. */
  lastInboundAt: number
  /** ms timestamp of the last line addressed to this character; 0 if never. */
  lastSpokeToYouAt: number
  /** Absolute expiry timestamps, 0 when inactive (same shape the parser emits). */
  rtExpires: number
  ctExpires: number
  /** Count of skills at mind lock. */
  lockedSkills: number
}

export interface AttentionResult {
  /** Severity-descending. Empty = calm. */
  flags: AttentionFlag[]
  /** Severity of the worst flag; 0 when calm. Drives sort and the summary. */
  score: number
}

export function computeAttention(
  i: AttentionInput,
  now: number,
  t: AttentionThresholds = DEFAULT_THRESHOLDS,
): AttentionResult {
  const flags: AttentionFlag[] = []

  // A disconnected character reports NOTHING else. Its vitals/indicators are the
  // last values before the drop, so surfacing "bleeding" on a dead socket would
  // be reporting a stale fact as a live one.
  if (!i.connected) {
    flags.push('disconnected')
    return { flags, score: ATTENTION_DEFS.disconnected.severity }
  }

  if (i.dead) flags.push('dead')
  // healthPct === null means "no vital yet" (a just-connected character), which
  // must read CALM, not critical — comparing null with < would make 0 < 25 true.
  if (i.healthPct !== null) {
    if (i.healthPct < t.healthCritPct) flags.push('health-crit')
    else if (i.healthPct < t.healthLowPct) flags.push('health-low')
  }
  if (i.bleeding) flags.push('bleeding')
  if (i.stunned)  flags.push('stunned')
  if (i.poisoned) flags.push('poisoned')
  if (i.diseased) flags.push('diseased')
  if (i.webbed)   flags.push('webbed')

  if (i.lastSpokeToYouAt > 0 && now - i.lastSpokeToYouAt < t.spokeToYouSeconds * 1000) {
    flags.push('spoken-to')
  }

  const idleMs = i.lastInboundAt > 0 ? now - i.lastInboundAt : 0
  if (i.lastInboundAt > 0 && idleMs > t.idleSeconds * 1000) flags.push('idle')

  if (i.lockedSkills > 0) flags.push('mind-lock')

  flags.sort((a, b) => ATTENTION_DEFS[b].severity - ATTENTION_DEFS[a].severity)
  const score = flags.length > 0 ? ATTENTION_DEFS[flags[0]].severity : 0

  // REMOVED in v0.19.0 (B274): a `free-to-act` flag used to be appended here.
  // It was unreachable in practice — its condition is ELAPSED idle time, but
  // this runs inside a push-driven memo that only evaluates when text has just
  // arrived, so the idle clock was always ~0. `idle` has the same shape and is
  // solved by consumers re-deriving it against the shared 1 Hz clock; nothing
  // re-derived this one. It was also redundant with `idle` at a 10s threshold:
  // it would have lit for nearly every quiet character, which is the noise UX
  // standard #1 exists to prevent. `freeToActSeconds` is retained in the
  // thresholds (harmless, no Settings knob) so no stored profile changes shape.
  return { flags, score }
}

/**
 * CSS `order` for a card. Lower paints first, so a HIGHER score must produce a
 * LOWER order. `index` is the character's tab position, which breaks ties so the
 * grid never reshuffles two equally-calm characters between renders.
 *
 * Score is a coarse severity BUCKET, not a continuous value, which is what stops
 * a card hopping every time health ticks 51% → 49%.
 */
/**
 * The severity at or above which a character is "asking for you".
 *
 * Everything below is INFORMATIONAL — worth a chip on the card, never worth
 * claiming attention. The two that sit below it are exactly the two that would
 * otherwise be permanent: `mind-lock` is the NORMAL state of any character
 * grinding a skill, and `idle` is the normal state of one you parked on purpose.
 * A badge that counts those is a badge you learn to ignore, which costs you the
 * one time it means something.
 *
 * 40 = `spoken-to`, the lowest flag that is genuinely about you.
 */
export const ATTENTION_ALERT_FLOOR = 40

/**
 * ONE definition of "needs attention", shared by the app-bar badge and the
 * summary strip. They answer the same question and must not drift (pitfall
 * #127); the strip still SHOWS the informational chips, it just does not count
 * them as needing you.
 */
export function needsAttention(score: number): boolean {
  return score >= ATTENTION_ALERT_FLOOR
}

export function attentionOrder(score: number, index: number): number {
  return (100 - score) * 1000 + index
}
