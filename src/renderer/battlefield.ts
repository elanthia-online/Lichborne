// battlefield.ts — the Tableau's tactical layout (v0.20.2, Sekmeht).
//
// Turns one ASSESS into positions: who stands where, relative to whom. Every
// assess line is one entity's place relative to ONE other —
//   "You … are behind a black-backed jackal (1) at missile range."
//   "A black-backed jackal (1…) is facing Agan at melee range."
// — read against the TARGET's facing (each fighter faces whoever it is
// fighting): "facing"/"advancing on" puts the entity in front of its target,
// "behind" on the far side, "flanking" (and its left/right forms) to a side;
// the range sets the distance. That example therefore lays out as
//   You ──(missile)── jackal ──(melee)── Agan
// in a line, which is exactly what the game is describing.
//
// SOLVED, not placed: each relation is a spring pulling an entity toward the
// spot its line describes, iterated until it settles, with a little
// repulsion so nobody stacks. Assess lines are each one creature's own view
// and can disagree; springs settle on a best fit instead of breaking.
//
// CLUSTERS (Sekmeht: include every fight in the room, and show your group as
// a group): each separate fight is solved on its own, then arranged —
//   - YOUR fight at the bottom centre;
//   - each GROUP member's fight that doesn't touch yours beside it on the same
//     baseline, so your team reads as one front line;
//   - everyone else's fights in a band above.
//
// Invariants:
//  - PURE (no React, no DOM) — the harness runs it on real captures.
//  - Every cluster is solved around an ANCHOR (you, else a group member, else
//    a player) and rotated so the anchor faces up the screen; the view reads
//    from your side and never spins.
//  - WARM-STARTED from the previous solve (`prev`, positions relative to each
//    cluster's anchor, before rotation): "flanking" doesn't say left or
//    right, so a cold solve could mirror a flanker on every assess. Starting
//    from where everyone was keeps them on their side.

import type { AssessEntity, AssessRange } from '../shared/combatExtract'

export type Pt = { x: number; y: number }

/** Distance per range, in "melee lengths". */
const DIST: Record<AssessRange, number> = { melee: 1, pole: 1.7, missile: 2.6 }
const ITERATIONS = 140
const STEP = 0.25
const MIN_GAP = 0.85
/** Space between clusters, in melee lengths. */
const CLUSTER_GAP = 1.4

export interface BattleEdge { from: string; to: string; rel: string; range: AssessRange }
export type ClusterKind = 'you' | 'group' | 'other'

export interface BattleInputs {
  /** Creature look-ids drawn on the stage. */
  shownCreatures: Set<string>
  /** Lowercase names of players in the room. */
  playerKeys: Set<string>
  /** Lowercase names of your group's members. */
  groupNames: Set<string>
  /** The previous solve's `raw`, for a warm start. */
  prev?: Map<string, Pt>
  /** Relations the assess doesn't carry — a player who has engaged you before
   *  any assess, placed from the range narration. */
  extraEdges?: BattleEdge[]
  /** Your group's members not fighting ('p:<name>' here, 'a:<name>' in another
   *  room): placed beside you on your baseline, so the team stays together. */
  teamNodes?: string[]
}

export interface Battlefield {
  /** Final positions, you at (0,0) facing up (−y); unit = one melee length. */
  pos: Map<string, Pt>
  /** Per-cluster positions before arrangement — pass back as `prev`. */
  raw: Map<string, Pt>
  edges: BattleEdge[]
  clusters: { kind: ClusterKind; keys: string[] }[]
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const unit = (v: Pt): Pt => {
  const d = Math.hypot(v.x, v.y)
  return d > 1e-6 ? { x: v.x / d, y: v.y / d } : { x: 0, y: -1 }
}

/** The figure key for an assess line's subject, or null if it isn't on stage. */
function subjectKey(e: AssessEntity, inp: BattleInputs): string | null {
  if (e.self) return 'self'
  if (e.pc) return inp.playerKeys.has(e.name.toLowerCase()) ? `p:${e.name.toLowerCase()}` : null
  return e.id && inp.shownCreatures.has(e.id) ? `c:${e.id}` : null
}
/** The figure key for its target ("you" → self). */
function targetKey(e: AssessEntity, inp: BattleInputs): string | null {
  if (!e.target || /^you$/i.test(e.target)) return e.self ? null : 'self'
  if (e.targetId?.startsWith('-')) return inp.playerKeys.has(e.target.toLowerCase()) ? `p:${e.target.toLowerCase()}` : null
  return e.targetId && inp.shownCreatures.has(e.targetId) ? `c:${e.targetId}` : null
}

/** Every relation between two figures on stage. */
export function battleEdges(assess: readonly AssessEntity[], inp: BattleInputs): BattleEdge[] {
  const out: BattleEdge[] = []
  for (const e of assess) {
    const from = subjectKey(e, inp)
    const to = targetKey(e, inp)
    if (from && to && from !== to) out.push({ from, to, rel: e.relation, range: e.range })
  }
  return out
}

/** Where `rel` puts an entity relative to a target facing `h`. `side` picks a flank. */
function offset(rel: string, h: Pt, side: number): Pt {
  const right = { x: -h.y, y: h.x }
  switch (rel) {
    case 'behind': return { x: -h.x, y: -h.y }
    case 'flanking': case 'beside': case 'next to': case 'moving to flank':
      return { x: right.x * side, y: right.y * side }
    case 'to the left of': case 'to left of': return { x: -right.x, y: -right.y }
    case 'to the right of': case 'to right of': return right
    default: return h    // facing / in front of / advancing on
  }
}

/** Solve one cluster around `anchor` (fixed at the origin). Returns positions
 *  before rotation (`raw`) and after rotating the anchor to face up (`pos`). */
function solveCluster(keys: string[], E: BattleEdge[], anchor: string, prev?: Map<string, Pt>) {
  const P = new Map<string, Pt>()
  for (const k of keys) {
    const was = prev?.get(k)
    if (was) { P.set(k, { ...was }); continue }
    if (k === anchor) { P.set(k, { x: 0, y: 0 }); continue }
    const a = ((hash(k) % 360) * Math.PI) / 180
    P.set(k, { x: Math.cos(a) * 2, y: Math.sin(a) * 2 })
  }
  const ownTarget = new Map<string, string>()
  const attackers = new Map<string, string[]>()
  for (const e of E) {
    if (!ownTarget.has(e.from)) ownTarget.set(e.from, e.to)
    attackers.set(e.to, [...(attackers.get(e.to) ?? []), e.from])
  }
  // Each figure faces its own target; failing that, whoever is on it.
  const heading = (k: string): Pt => {
    const p = P.get(k)!
    const t = ownTarget.get(k)
    if (t) return unit({ x: P.get(t)!.x - p.x, y: P.get(t)!.y - p.y })
    const at = attackers.get(k)
    if (at && at.length) {
      let cx = 0, cy = 0
      for (const a of at) { cx += P.get(a)!.x; cy += P.get(a)!.y }
      return unit({ x: cx / at.length - p.x, y: cy / at.length - p.y })
    }
    return k === anchor ? { x: 0, y: -1 } : { x: 0, y: 1 }
  }
  const recentre = () => {
    const s = P.get(anchor)!
    if (s.x === 0 && s.y === 0) return
    const dx = s.x, dy = s.y
    for (const p of P.values()) { p.x -= dx; p.y -= dy }
  }
  recentre()
  for (let it = 0; it < ITERATIONS; it++) {
    for (const e of E) {
      const pt = P.get(e.to)!, pf = P.get(e.from)!
      const h = heading(e.to)
      // Which flank: the side it's already on (warm start keeps it), else seeded.
      const vx = pf.x - pt.x, vy = pf.y - pt.y
      const cross = h.x * vy - h.y * vx
      const side = Math.abs(cross) > 1e-3 ? Math.sign(cross) : (hash(e.from) % 2 ? 1 : -1)
      const o = offset(e.rel, h, side)
      const d = DIST[e.range]
      const ex = pt.x + o.x * d - pf.x, ey = pt.y + o.y * d - pf.y
      if (e.from === anchor) { pt.x -= ex * STEP; pt.y -= ey * STEP }
      else if (e.to === anchor) { pf.x += ex * STEP; pf.y += ey * STEP }
      else { pf.x += ex * STEP * 0.6; pf.y += ey * STEP * 0.6; pt.x -= ex * STEP * 0.4; pt.y -= ey * STEP * 0.4 }
    }
    // Nobody on top of anybody.
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = P.get(keys[i])!, b = P.get(keys[j])!
        let dx = b.x - a.x, dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= MIN_GAP) continue
        if (d < 1e-4) { const ang = ((hash(keys[i] + keys[j]) % 360) * Math.PI) / 180; dx = Math.cos(ang); dy = Math.sin(ang); d = 1 }
        const push = (MIN_GAP - d) / 2
        a.x -= (dx / d) * push; a.y -= (dy / d) * push
        b.x += (dx / d) * push; b.y += (dy / d) * push
      }
    }
    recentre()
  }
  const raw = new Map<string, Pt>()
  for (const [k, p] of P) raw.set(k, { ...p })
  const h = heading(anchor)
  const ang = -Math.PI / 2 - Math.atan2(h.y, h.x)
  const c = Math.cos(ang), s = Math.sin(ang)
  const pos = new Map<string, Pt>()
  for (const [k, p] of P) pos.set(k, { x: p.x * c - p.y * s, y: p.x * s + p.y * c })
  return { pos, raw }
}

type Box = { minX: number; maxX: number; minY: number; maxY: number }
const boxOf = (m: Map<string, Pt>): Box => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of m.values()) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
  return { minX, maxX, minY, maxY }
}

export function solveBattlefield(assess: readonly AssessEntity[], inp: BattleInputs): Battlefield | null {
  const fromAssess = battleEdges(assess, inp)
  const have = new Set(fromAssess.map(e => `${e.from}|${e.to}`))
  const edges = [...fromAssess, ...(inp.extraEdges ?? []).filter(e => !have.has(`${e.from}|${e.to}`) && !have.has(`${e.to}|${e.from}`))]
  if (edges.length === 0) return null

  // Clusters = connected pieces of the relation graph. You are always one,
  // even with nobody on you, so the team row has its anchor.
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = k
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(k, r)
    return r
  }
  const add = (k: string) => { if (!parent.has(k)) parent.set(k, k) }
  add('self')
  for (const k of inp.teamNodes ?? []) add(k)
  for (const e of edges) { add(e.from); add(e.to); parent.set(find(e.from), find(e.to)) }
  const groups = new Map<string, string[]>()
  for (const k of parent.keys()) {
    const r = find(k)
    groups.set(r, [...(groups.get(r) ?? []), k])
  }
  const isGroup = (k: string) => k.startsWith('a:') || (k.startsWith('p:') && inp.groupNames.has(k.slice(2)))
  const clusters = [...groups.values()].map(keys => {
    keys.sort()
    const kind: ClusterKind = keys.includes('self') ? 'you' : keys.some(isGroup) ? 'group' : 'other'
    const anchor = kind === 'you' ? 'self'
      : keys.find(isGroup) ?? keys.find(k => k.startsWith('p:')) ?? keys[0]
    return { kind, keys, anchor }
  })
  // An outsiders' cluster with no player at all (creatures only) can't be
  // read as anyone's fight — leave those to the creature row.
  const placed = clusters.filter(c => c.kind !== 'other' || c.keys.some(k => k.startsWith('p:')))
  // Nothing left to lay out (bug check): every edge was in a creatures-only
  // fight, so no placed cluster fights anything. Without this a battlefield of
  // you standing alone came back, and the stage benched every player for it.
  if (!placed.some(c => edges.some(e => c.keys.includes(e.from)))) return null

  const raw = new Map<string, Pt>()
  const solved = placed.map(c => {
    const E = edges.filter(e => c.keys.includes(e.from))
    const r = solveCluster(c.keys, E, c.anchor, inp.prev)
    for (const [k, p] of r.raw) raw.set(k, p)
    return { ...c, pos: r.pos, box: boxOf(r.pos) }
  })

  // Arrange: you at the centre; group fights beside you, nearest first,
  // right then left, anchors on your baseline; everyone else in a band above.
  const pos = new Map<string, Pt>()
  const you = solved.find(c => c.kind === 'you')!
  for (const [k, p] of you.pos) pos.set(k, p)
  let right = you.box.maxX, left = you.box.minX
  let teamTop = you.box.minY
  // Members in a fight nearest you, then the idle and the away.
  solved.filter(c => c.kind === 'group')
    .sort((a, b) => b.keys.length - a.keys.length || (a.keys[0] < b.keys[0] ? -1 : 1))
    .forEach((c, i) => {
    const goRight = i % 2 === 0
    const dx = goRight ? right + CLUSTER_GAP - c.box.minX : left - CLUSTER_GAP - c.box.maxX
    if (goRight) right = c.box.maxX + dx; else left = c.box.minX + dx
    teamTop = Math.min(teamTop, c.box.minY)
    for (const [k, p] of c.pos) pos.set(k, { x: p.x + dx, y: p.y })
  })
  const others = solved.filter(c => c.kind === 'other')
  if (others.length) {
    const width = others.reduce((w, c) => w + (c.box.maxX - c.box.minX), 0) + CLUSTER_GAP * (others.length - 1)
    let x = (left + right) / 2 - width / 2
    for (const c of others) {
      const dx = x - c.box.minX
      const dy = teamTop - CLUSTER_GAP - c.box.maxY
      for (const [k, p] of c.pos) pos.set(k, { x: p.x + dx, y: p.y + dy })
      x += (c.box.maxX - c.box.minX) + CLUSTER_GAP
    }
  }
  return { pos, raw, edges, clusters: solved.map(c => ({ kind: c.kind, keys: c.keys })) }
}
