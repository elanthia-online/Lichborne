// Combat prose extraction — the first CombatParser signal (DESIGN §32.4/§32.1,
// the G1 Combat HUD facet of X1). Pure functions over a game line so a harness
// can exercise the real code (the sceneExtract precedent). Range / facing /
// target stay Phase 2; this is COMBAT POSITION only, the easy slice.
//
// Position rides DR's balance STATUS LINE (prose, not a structured element):
//   "[You're battered (71%), winded (100%), incredibly balanced and in dominating position.]"
//   "You are solidly balanced and opponent has slight advantage."
// We MINE Lich's now-verified pattern verbatim (drinfomon drparser.rb @ 5.18
// #1398/#1400, drvariables.rb DR_POSITION_VALUES) — Lich validated it against
// an 11,388-line real-combat sample, so the regex + table are the provenance.
// signed magnitude: + = you hold the advantage, − = your opponent does, 0 even.

// drvariables.rb DR_POSITION_VALUES — VERBATIM, order preserved (the negative
// "opponent …" forms are listed first). Order is load-bearing for the
// alternation: no phrase is a textual prefix of another at the match anchor, so
// first-alternative matching (JS, like Ruby's Regexp.union) resolves correctly.
export const DR_POSITION_VALUES: [phrase: string, value: number][] = [
  ['opponent overwhelming you', -9],
  ['opponent dominating', -8],
  ['opponent in excellent position', -7],
  ['opponent in superior position', -6],
  ['opponent in very strong position', -5],
  ['opponent in strong position', -4],
  ['opponent in good position', -3],
  ['opponent in better position', -2],
  ['opponent has slight advantage', -1],
  ['no advantage', 0],
  ['have slight advantage', 1],
  ['in better position', 2],
  ['in good position', 3],
  ['in strong position', 4],
  ['in very strong position', 5],
  ['in superior position', 6],
  ['in excellent position', 7],
  ['in dominating position', 8],
  ['overwhelming opponent', 9],
  ['overwhelming your opponent', 9],
]

// drparser.rb PositionValue = /balanced? (?:and|with) (?<position>…keys…)/.
// The phrases are letters/spaces only (no regex specials), so joining with `|`
// in table order reproduces Ruby's Regexp.union.
const POSITION_RE = new RegExp(
  `balanced? (?:and|with) (${DR_POSITION_VALUES.map(([p]) => p).join('|')})`,
)

// Returns the signed position (−9…+9) if the line carries a balance-status
// position clause, else null (no position on this line — leave the last value).
// 0 is a VALID result ("no advantage" = even contest), distinct from null.
export function parseCombatPosition(line: string): number | null {
  const m = POSITION_RE.exec(line)
  if (!m) return null
  const found = DR_POSITION_VALUES.find(([p]) => p === m[1])
  return found ? found[1] : null
}

// A short tier word for a signed position, for a compact HUD label (the sign /
// side conveys who leads; this gives the magnitude tier). Mirrors DR's own
// phrasing tiers so it reads familiarly.
const POSITION_TIERS = ['even', 'slight', 'better', 'good', 'strong', 'very strong', 'superior', 'excellent', 'dominating', 'overwhelming']
export function positionLabel(value: number): string {
  return POSITION_TIERS[Math.abs(value)] ?? ''
}

// ── Combat BALANCE (how ready/stable you are to act, the sibling of position on
// the same status line) ─────────────────────────────────────────────────────
// drvariables.rb DR_BALANCE_VALUES — VERBATIM, worst→best; the INDEX is the
// value (0 = completely imbalanced … 11 = incredibly balanced), exactly as
// Lich's `DRStats.balance = DR_BALANCE_VALUES.index(match[:balance])`.
export const DR_BALANCE_VALUES = [
  'completely', 'hopelessly', 'extremely', 'very badly', 'badly',
  'somewhat off', 'off', 'slightly off', 'solidly', 'nimbly', 'adeptly', 'incredibly',
]
export const BALANCE_MAX = DR_BALANCE_VALUES.length - 1  // 11

// drparser.rb BalanceValue = /^(?:You are|\[You're)(?:.*,)? (?<balance>…) balanced?\b/ —
// the `(?:.*,)?` skips the wound prefix up to the LAST comma; `balanced?` covers
// "balance"/"balanced" (the "off balance" form). Verbatim from Lich.
const BALANCE_RE = new RegExp(
  `^(?:You are|\\[You're)(?:.*,)? (${DR_BALANCE_VALUES.join('|')}) balanced?\\b`,
)

// Balance index 0…11 if the line carries a balance status, else null.
export function parseCombatBalance(line: string): number | null {
  const m = BALANCE_RE.exec(line)
  if (!m) return null
  const i = DR_BALANCE_VALUES.indexOf(m[1])
  return i >= 0 ? i : null
}

// A readable label for a balance index (for the gauge tooltip). "off" → "off
// balance"; everything else → "<adverb> balanced".
// The three worst are the game's "imbalanced"/"unbalanced" (bug check, v0.20.2:
// read off real logs — "completely imbalanced", "hopelessly unbalanced",
// "extremely imbalanced"); writing them "…balanced" said the opposite.
export function balanceLabel(value: number): string {
  const w = DR_BALANCE_VALUES[value]
  if (!w) return ''
  if (w === 'hopelessly') return 'hopelessly unbalanced'
  if (w === 'completely' || w === 'extremely') return `${w} imbalanced`
  return w.endsWith('off') || w === 'off' ? `${w} balance` : `${w} balanced`
}

// ── Combat RANGE (the closest incoming threat's range to you) ────────────────
// Mined from real combat capture (corpus/2026-06-12-combat-lavadrakes.xml):
//   "The lava drake closes to melee range on you!"
//   "The lava drake closes to pole weapon range on you!"
//   "You notice a lava drake as it stealthily closes to pole weapon range on you."
// The clause is always "closes to <range> range on you". DR's engagement bands,
// nearest→farthest: melee < pole (pole weapon) < missile. `RANGE_ORDER` indexes
// them for the gauge. SCOPE (honest, Principle #10): this tracks the LAST
// incoming "closes to … on you" — the closest threat's range — NOT per-creature
// range or which drake. Precise per-creature engagement + disengage detection is
// Phase 2 (needs a fuller fight corpus + a disengage-signal design). The
// consumer clears it on room change and only shows it while combat is live, so a
// stale value can't linger past the fight.
export type CombatRange = 'melee' | 'pole' | 'missile'
export const RANGE_ORDER: CombatRange[] = ['melee', 'pole', 'missile']

const RANGE_RE = /closes to ([\w ]+?) range on you\b/
const RANGE_ALIASES: Record<string, CombatRange> = {
  'melee': 'melee',
  'pole': 'pole',
  'pole weapon': 'pole',
  'missile': 'missile',
}

// The closest incoming threat's range if this line reports one closing on you,
// else null (leave the last value). Unknown range words → null (don't guess a
// gauge position for a band we don't model).
export function parseCombatRange(line: string): CombatRange | null {
  const m = RANGE_RE.exec(line)
  if (!m) return null
  return RANGE_ALIASES[m[1].trim().toLowerCase()] ?? null
}

export function rangeLabel(range: CombatRange): string {
  return range === 'pole' ? 'pole' : range
}

// ── ASSESS (combat situation) — per-creature tactical positions ──────────────
// DR's ASSESS emits one entity per line on the `assess` stream, each carrying a
// relation to its target (facing/flanking/behind you, moving-to-flank, advancing
// on…), a range, a status, and an id (from `<d cmd='look #id'>`). `parseAssessLine`
// MIRRORS Lich's `parse_assess_line` VERBATIM (xmlparser.rb #1413). `ids` is the
// ordered list of look-ids scraped from the line's <d cmd='look #…'> tags.
//
// IDENTITY LIVES IN `id`, NOT `number`: the number is DR's reusable targeting slot
// (a dead drake's slot is recycled — corpus 2026-07-17: slot #1 went 48407408 →
// 48430408 after the first died), so key figures on `id`. Creatures have POSITIVE
// ids, PCs NEGATIVE (→ `pc`). `self` marks the "You (…) are facing …" line, which
// is the player's orientation anchor (everything else is relative to it).
export type AssessRange = 'melee' | 'pole' | 'missile'

const ASSESS_RANGES: Record<string, AssessRange> = {
  'melee': 'melee', 'pole weapon': 'pole', 'missile': 'missile',
}
// Verbatim from Lich's ASSESS_RELATION. "moving to flank" normalises to "flanking".
const ASSESS_RELATION = /^(moving to flank|flanking|facing|behind|in front of|beside|advancing on|next to|to (?:the )?(?:left|right) of)\s+(.+)$/i
const ASSESS_MAIN = /^(.+?)\s+\((?:(\d+):\s*)?([^)]*)\)\s+(?:is|are)\s+(.+?)\s+at\s+(melee|pole weapon|missile)\s+range\b/i

export interface AssessEntity {
  name: string
  id: string | null          // look-id; null for the self line
  number: number | null      // DR targeting slot (reused on death — NOT identity)
  status: string             // balance + flags, e.g. "stunned and extremely imbalanced"
  relation: string           // facing / flanking / behind / advancing on / …
  target: string | null      // 'you' or another entity's name
  targetId: string | null
  targetNumber: number | null
  range: AssessRange
  self: boolean
  pc: boolean
}

// Parse ONE reconstructed assess line + its ordered look-ids. null for the header
// ("You assess your combat situation…") and trailing status lines ("(You are also
// defending…)", "You appear to be having difficulty…") — they don't match.
export function parseAssessLine(rawText: string, ids: string[]): AssessEntity | null {
  let text = (rawText ?? '').trim()
  if (!text) return null
  if (/assess your combat situation/i.test(text)) return null
  // drop the trailing "  | F" face-hint token
  text = text.replace(/\s+\|\s+\S+\s*$/, '').trim()

  const m = text.match(ASSESS_MAIN)
  if (!m) return null
  const name = m[1].trim()
  const number = m[2] ? parseInt(m[2], 10) : null
  const status = m[3].trim()
  const range = ASSESS_RANGES[m[5].toLowerCase()]
  let rest = m[4].trim()

  // the target may carry its own assess number, e.g. "facing a jeol moradu (2)"
  let targetNumber: number | null = null
  const tn = rest.match(/\((\d+)\)\s*$/)
  if (tn) { targetNumber = parseInt(tn[1], 10); rest = rest.replace(/\s*\(\d+\)\s*$/, '').trim() }

  let relation: string
  let target: string | null
  const rm = rest.match(ASSESS_RELATION)
  if (rm) { relation = rm[1].toLowerCase(); target = rm[2].trim() }
  else { relation = rest.toLowerCase(); target = null }
  if (relation === 'moving to flank') relation = 'flanking'

  const isSelf = name.toLowerCase() === 'you'
  let subjectId: string | null
  let targetId: string | null
  if (isSelf) { subjectId = null; targetId = ids[0] ?? null }
  else {
    subjectId = ids[0] ?? null
    targetId = (target && /^you$/i.test(target)) ? null : (ids[1] ?? null)
  }
  const pc = (subjectId ?? '').startsWith('-')

  return { name, id: subjectId, number, status, relation, target, targetId, targetNumber, range, self: isSelf, pc }
}

// ── ENGAGEMENT (who you are closing with, or who is closing on you) — v0.20.2 ─
// ASSESS is on-demand, but the game narrates every change of range as it
// happens. These lines are what keep a duel's range live between assesses.
// Every pattern is VERBATIM from a two-sided capture (Agan advancing on Sekmeht,
// 2026-09-29), one per line of the game's own wording:
//   the one advancing sees            the one advanced on sees
//   "You begin to advance on X."      "X begins to advance on you!"
//   "You close to pole weapon         "X closes to pole weapon range on you!"
//      range on X."
//   "You close to melee range on X."  "X closes to melee range on you!"
//   "You are already advancing on X."
//   "You are already at melee with X."
//   "You retreat back to pole range."   (no name: you back off from everyone)
//   "You retreat from combat."          (despite the wording, NOT an end)
// Retreating is ONE STEP back per retreat (Sekmeht): melee → pole ("retreat
// back to pole range"), then pole → missile ("retreat from combat"). It never
// goes past missile, and the fight goes on at missile range.
// The same wording covers creatures ("The lava drake closes to melee range on
// you!"); the consumer decides which names it cares about.
// A fight ENDS when an ASSESS comes back listing no one (Sekmeht: the other
// side left, went out of sight, or it's over). The consumer detects that at the
// assess block's prompt and feeds `disengage`; no game LINE ever produces it.
// The OTHER side's view (Agan's capture, 2026-09-30):
//   "Sekmeht retreats from you."   — one step back, for that player only
//   "You notice Sekmeht as he stealthily closes to melee range on you."
//                                  — a hidden player closing; the creature form
//                                    ("You notice a lava drake as it …") parses
//                                    too, and the consumer ignores non-players.
export type EngagementEvent =
  | { kind: 'advance'; name: string; by: 'you' | 'them' }
  | { kind: 'range'; name: string; by: 'you' | 'them'; range: AssessRange }
  /** `range` = the band named in the line; null = one step back (the line
   *  doesn't name one). */
  /** `name` = only that one stepped back ("X retreats from you"); absent =
   *  you backed off from everyone. */
  | { kind: 'retreat'; range: AssessRange | null; name?: string }
  /** The fight is over — from an empty ASSESS, never from a line. */
  | { kind: 'disengage' }
  /** An ASSESS stated this player's range: bring an existing record in line
   *  with it. Never creates one (assess-only duels are drawn from the
   *  snapshot itself). Needed because the OTHER side's retreat never reaches
   *  you as a line, so a record can sit at melee while you're at missile. */
  | { kind: 'sync'; name: string; range: AssessRange }

// "pole weapon" when closing, plain "pole" when retreating — both are real.
const ENGAGE_RANGE = '(melee|pole weapon|pole|missile)'
const ENGAGE_RANGES: Record<string, AssessRange> = {
  'melee': 'melee', 'pole weapon': 'pole', 'pole': 'pole', 'missile': 'missile',
}
const YOU_ADVANCE   = /^You (?:begin to advance|are already advancing) on (.+?)\.$/
const YOU_CLOSE     = new RegExp(`^You close to ${ENGAGE_RANGE} range on (.+?)\\.$`)
const YOU_AT_MELEE  = /^You are already at melee with (.+?)\.$/
const YOU_RETREAT   = new RegExp(`^You retreat back to ${ENGAGE_RANGE} range\\.$`)
const YOU_RETREAT_OUT = /^You retreat from combat\.$/
const THEY_ADVANCE  = /^(.+?) begins to advance on you!$/
const THEY_CLOSE    = new RegExp(`^(.+?) closes to ${ENGAGE_RANGE} range on you[!.]$`)
const THEY_RETREAT  = /^(.+?) retreats from you\.$/
const THEY_SNEAK    = new RegExp(`^You notice (.+?) as (?:he|she|it|they) stealthily closes? to ${ENGAGE_RANGE} range on you[!.]$`)

/** Cheap substring pre-check for the per-line hot path (pitfall #82a). */
export function mayBeEngagementLine(line: string): boolean {
  return line.includes('advanc') || line.includes(' range on ') || line.includes('retreat') || line.includes('at melee with')
}

/** One engagement line → its event, or null for anything else. */
export function parseEngagementLine(rawLine: string): EngagementEvent | null {
  const line = (rawLine ?? '').trim()
  if (!line) return null
  let m: RegExpExecArray | null
  if (YOU_RETREAT_OUT.test(line)) return { kind: 'retreat', range: null }
  if ((m = YOU_RETREAT.exec(line))) return { kind: 'retreat', range: ENGAGE_RANGES[m[1]] }
  if ((m = YOU_CLOSE.exec(line))) return { kind: 'range', name: m[2].trim(), by: 'you', range: ENGAGE_RANGES[m[1]] }
  if ((m = YOU_AT_MELEE.exec(line))) return { kind: 'range', name: m[1].trim(), by: 'you', range: 'melee' }
  if ((m = YOU_ADVANCE.exec(line))) return { kind: 'advance', name: m[1].trim(), by: 'you' }
  if ((m = THEY_SNEAK.exec(line))) return { kind: 'range', name: m[1].trim(), by: 'them', range: ENGAGE_RANGES[m[2]] }
  if (line.startsWith('You ')) return null
  if ((m = THEY_RETREAT.exec(line))) return { kind: 'retreat', range: null, name: m[1].trim() }
  if ((m = THEY_CLOSE.exec(line))) return { kind: 'range', name: m[1].trim(), by: 'them', range: ENGAGE_RANGES[m[2]] }
  if ((m = THEY_ADVANCE.exec(line))) return { kind: 'advance', name: m[1].trim(), by: 'them' }
  return null
}

export interface Engagement {
  name: string
  range: AssessRange
  /** Who is doing the closing. */
  by: 'you' | 'them'
  /** Date.now() of the last line about it. */
  at: number
}

/** An engagement nothing has mentioned for this long is dropped. Long, because
 *  a fight at melee produces no range lines at all; it is only the backstop for
 *  an end we never see (the other side retreating). */
export const ENGAGE_TTL_MS = 10 * 60_000
const ENGAGE_MAX = 12
const RANGE_RANK: Record<AssessRange, number> = { melee: 0, pole: 1, missile: 2 }

/** One band farther out, stopping at missile (one retreat). */
export function stepOutRange(r: AssessRange): AssessRange {
  return r === 'melee' ? 'pole' : 'missile'
}

/** Apply one event to the list. Pure: returns a new list, or the same one when
 *  nothing changed. */
export function applyEngagement(list: Engagement[], ev: EngagementEvent, now: number): Engagement[] {
  const live = list.filter(e => now - e.at < ENGAGE_TTL_MS)
  const base = live.length === list.length ? list : live
  if (ev.kind === 'disengage') return base.length ? [] : base
  if (ev.kind === 'sync') {
    const k = ev.name.toLowerCase()
    const i = base.findIndex(e => e.name.toLowerCase() === k)
    if (i < 0 || base[i].range === ev.range) return base
    const next = base.slice()
    next[i] = { ...base[i], range: ev.range, at: now }
    return next
  }
  if (ev.kind === 'retreat') {
    // You backed off: a named band means nobody is closer than it; an unnamed
    // one is a single step out. Never past missile.
    let changed = false
    const only = ev.name?.toLowerCase()
    const next = base.map(e => {
      if (only && e.name.toLowerCase() !== only) return e
      const to = ev.range ?? stepOutRange(e.range)
      if (RANGE_RANK[e.range] >= RANGE_RANK[to]) return e
      changed = true
      return { ...e, range: to, at: now }
    })
    return changed ? next : base
  }
  const key = ev.name.toLowerCase()
  const prev = base.find(e => e.name.toLowerCase() === key)
  // A fresh advance starts at missile range: both captures' ASSESS right after
  // "begin to advance" reads "at missile range". A re-advance keeps a known
  // pole or missile (you may have retreated only to pole) — but NEVER melee:
  // at melee the game says "You are already at melee with…", so an advance
  // proves the record's melee is stale (the other side backed off and that
  // line never reached you; Sekmeht, 2026-09-30) and missile is the reading
  // both captures show at the start of an advance.
  const range = ev.kind === 'range' ? ev.range
    : (prev && prev.range !== 'melee' ? prev.range : 'missile')
  const entry: Engagement = { name: ev.name, range, by: ev.by, at: now }
  const rest = base.filter(e => e.name.toLowerCase() !== key)
  return [...rest, entry].slice(-ENGAGE_MAX)
}

// Balance from an ASSESS status ("solidly balanced", "extremely imbalanced",
// "somewhat off balance"), v0.20.2. Your own assess line — "You (solidly
// balanced) are facing …" — is the only balance reading a fight that is still
// closing gives you; the status line parseCombatBalance reads arrives only with
// an attack. Same DR_BALANCE_VALUES index, longest words first so "very badly"
// isn't read as "badly" and "slightly off" not as "off".
const ASSESS_BALANCE_RE = new RegExp(
  // \\b, not \b: inside a template string \b is a BACKSPACE character, and the
  // pattern silently matched nothing (caught by the harness, D4–D10).
  `\\b(${[...DR_BALANCE_VALUES].sort((a, b) => b.length - a.length).join('|')}) (?:im|un)?balanced?\\b`,
)
export function balanceFromAssessStatus(status: string): number | null {
  const m = ASSESS_BALANCE_RE.exec(status ?? '')
  if (!m) return null
  const i = DR_BALANCE_VALUES.indexOf(m[1])
  return i >= 0 ? i : null
}

// Split an ASSESS status into its balance and its other states, v0.20.2 —
// "hidden and slightly off balance" → { balance: <slightly off>, flags:
// ['hidden'] }. The raw phrase is too long to sit under a figure; the balance
// reads as a short label and each other state as its own chip.
export function splitAssessStatus(status: string): { balance: number | null; flags: string[] } {
  const raw = (status ?? '').trim()
  const m = ASSESS_BALANCE_RE.exec(raw)
  const balance = m ? DR_BALANCE_VALUES.indexOf(m[1]) : -1
  const rest = m ? raw.slice(0, m.index) + raw.slice(m.index + m[0].length) : raw
  const flags = rest.split(/\s*(?:,|\band\b)\s*/).map(f => f.trim()).filter(Boolean)
  return { balance: balance >= 0 ? balance : null, flags }
}

// ── STRIKES (attacks on you, and how they ended) — v0.20.2 ────────────────────
// So the Tableau can show your character reacting: a dodge, a block, a parry,
// a hit. Every shape is VERBATIM from captures (combat stream):
//   "* A rock troll thrusts a sharp pine sapling at you.  You dodge."          (Sekmeht)
//   "* A rock troll slices a sharp pine sapling at you.  You evade."           (Sekmeht)
//   "* A golden jackal bites at you.  You block solidly with a small demonscale shield …" (Sekmeht)
//   "* A lava drake darts forward and slashes at you.  You knock aside some of the fiery claws with a bastard sword." (corpus)
//   "* Moving inexpertly, a musk hog charges wide at you.  You evade."         (Frostbite mock.xml — adverb opener)
//   "* … slams its balled fist at you.  You fail to evade."                    (mock.xml — no outcome yet)
//   "You attempt to evade.  The fist lands a light hit to your right leg."     (mock.xml — no "(n/m)")
//   "The flaming tail lands a light hit (1/23) to your chest."                 (Sekmeht — with it)
// The hit wording is the session-log extractor's (sessionLog.ts DAMAGE_RE),
// with the "(n/m)" made optional because both forms are in captures. "You fail
// to" / "You attempt to" are NOT outcomes — a hit line follows, or nothing.
// The attacker is only the TEXT before "at you": combat narration carries no
// creature id, so naming a figure is the caller's job, and only when unambiguous.
export type StrikeOutcome = 'dodge' | 'block' | 'parry' | 'hit'
export interface StrikeEvent {
  id: number
  at: number
  outcome: StrikeOutcome
  /** The attack sentence's opening, before "at you" (lowercase), or null. */
  attacker: string | null
  /** For a hit: "light hit", "heavy strike", … and the body part. */
  severity?: string
  part?: string
}

const STRIKE_HIT_RE = /\blands? an? ([a-z -]+? (?:hit|strike))(?: \(\d+\/\d+\))? to your ([a-z ]+?)\s*(?=[.!,]|$)/i

// A PARRY, in every wording DR uses for it (Sekmeht, 2026-10-01, a zweihander
// and a bracer): "You <verb> <how much> of the <weapon> with <yours>." — knock
// aside, counter, fend off, turn aside, beat off, deflect, slap away, repulse,
// and "some" / "most" / "little" of it. Matched by that SHAPE so a wording not
// in the capture still reads as a parry. (Dodge, evade and block are tested
// first; none of them has "of".)
// "of THE/A/ITS …" (bug check): the parried thing is the attack or weapon,
// never yours — "You lose some of your footing" is not a parry.
const STRIKE_PARRY_RE = /\bYou [a-z]+(?: [a-z]+)? (?:some|most|little|much|all|part|a bit|bits) of (?:the|an?|its|his|her|their)\b/
// The stomp has no "at you": "An ice archon attempts to stomp on your left leg,
// and you raise your weapon to deflect part of the foot so it lands next to you
// instead of on you." — a deflect with your weapon, so a parry.
const STRIKE_DEFLECT_RE = /^(.+?) attempts to [a-z]+ (?:on|at) your [a-z ]+?, and you raise your weapon to deflect\b/i
// …and the stomp you step away from: "An ice archon attempts to stomp on your
// right hand, but you manage to get out of the way in time." — a dodge.
const STRIKE_SIDESTEP_RE = /^(.+?) attempts to [a-z]+ (?:on|at) your [a-z ]+?, but you manage to get out of the way\b/i

export function mayBeStrikeLine(text: string): boolean {
  return text.includes(' at you') || text.includes(' to your ') || text.includes('raise your weapon to deflect')
    || text.includes('get out of the way')
}

export function parseStrikeLine(text: string): Omit<StrikeEvent, 'id' | 'at'> | null {
  const t = text.trim()
  // Quoted speech is not a blow (bug check): Agan says, "…lands a light hit to
  // your chest." would otherwise fire a strike.
  if (t.includes(', "')) return null
  // " at you" as a WORD: indexOf found it inside "at your" ("Grinning at your
  // misfortune, a goblin swings at you" named the attacker "grinning").
  const atM = / at you\b/.exec(t)
  const at = atM ? atM.index : -1
  const attacker = t.startsWith('*') && at > 0 ? t.slice(1, at).trim().toLowerCase() : null
  const hit = STRIKE_HIT_RE.exec(t)
  if (hit) return { outcome: 'hit', attacker, severity: hit[1].toLowerCase(), part: hit[2].toLowerCase() }
  const deflect = STRIKE_DEFLECT_RE.exec(t)
  if (deflect) return { outcome: 'parry', attacker: deflect[1].trim().toLowerCase() }
  const sidestep = STRIKE_SIDESTEP_RE.exec(t)
  if (sidestep) return { outcome: 'dodge', attacker: sidestep[1].trim().toLowerCase() }
  if (at < 0) return null
  const rest = t.slice(at)
  if (/\bYou (?:fail|attempt) to\b/.test(rest)) return null
  if (/\bYou (?:dodge|evade)\b/.test(rest)) return { outcome: 'dodge', attacker }
  if (/\bYou block\b/.test(rest)) return { outcome: 'block', attacker }
  if (STRIKE_PARRY_RE.test(rest)) return { outcome: 'parry', attacker }
  return null
}

// ── FACING (v0.20.2) ──────────────────────────────────────────────────────
// The game's reply when you turn to a creature (by FACE, or on its own after a
// kill). Verbatim from Agan's captures, 2026-10-02:
//   "You turn to face a rock troll."
//   "You turn to face a rock troll, leaving the rock troll on your flank at melee!"
//   "You turn to face a rock troll, leaving the black-backed jackal on your flank at missile range!"
// The reply never carries an id — the FACE #id command that caused it does,
// which the consumer remembers. `prev` is your old target, now beside you.
export interface FaceReply {
  target: string
  prev: { name: string; relation: string; range: AssessRange | null } | null
}
const FACE_REPLY_RE = /^You turn to face (.+?)(?:, leaving (.+?) (?:on your (\w+)|behind you)(?: at (melee|pole weapon|pole|missile)(?: range)?)?)?[.!]$/
const FACE_SIDE: Record<string, string> = { flank: 'flanking', back: 'behind', front: 'facing' }
export function parseFaceReply(rawLine: string): FaceReply | null {
  const m = FACE_REPLY_RE.exec((rawLine ?? '').trim())
  if (!m) return null
  return {
    target: m[1].trim(),
    prev: m[2] ? {
      name: m[2].trim(),
      relation: m[3] ? (FACE_SIDE[m[3]] ?? 'flanking') : 'behind',
      range: m[4] ? ENGAGE_RANGES[m[4]] : null,
    } : null,
  }
}
