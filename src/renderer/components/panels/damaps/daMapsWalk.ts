// Da'Maps walk — getting to and from "?" squares (rooms Lich's map doesn't have).
//
// go2 only knows Lich's map, so it can't take you into a room Lich hasn't
// mapped, and it can't start from one either. Rather than change go2, a route
// is split into LEGS: go2 does every stretch it can, and Lichborne's own walker
// (genieWalk.ts, the one the Genie map uses) does the steps into and out of the
// "?" squares, from the Genie map's own moves (DaArea.moves). Each leg ends on
// a known square, and DaMapsView starts the next one when you get there.
//
// Pure, so it can be harnessed. DaMapsView owns running the legs and finding
// the player on a "?" square (locateUnmapped).

import type { DaArea, DaRoom } from './daMapsData'
import { normalizeMatchKey } from '../mapTypes'

export type DaLeg =
  /** `;go2 <lich>`; it ends on the square `to` */
  | { kind: 'go2'; lich: number; to: number }
  /** Genie moves, one per step; squares[0] is where it starts, the last one where it ends */
  | { kind: 'walk'; moves: string[]; squares: number[] }

export interface DaRoute { legs: DaLeg[]; target: number }

/** A square go2 can reach (a Lich room, not a ↗ marker). */
export function isKnown(r: DaRoom | undefined): boolean { return !!r && r.lich !== null && !r.stubTo }
/** A "?" square: on the Genie map, not in Lich's. */
export function isUnmapped(r: DaRoom | undefined): boolean { return !!r && r.lich === null && !r.stubTo }

/** The square a leg ends on. */
export function legEnd(l: DaLeg): number { return l.kind === 'go2' ? l.to : l.squares[l.squares.length - 1] }

// Steps that touch a "?" square cost more, so the route uses go2 wherever it can.
const UNMAPPED_COST = 3

interface Edge { to: number; cost: number }

/** The ways out of each square: between two Lich rooms go2 knows the way;
 *  anything touching a "?" square needs the Genie map's move for that direction. */
function edges(area: DaArea, reverse: boolean): Map<number, Edge[]> {
  const out = new Map<number, Edge[]>()
  const add = (a: number, b: number, cost: number) => {
    const [f, t] = reverse ? [b, a] : [a, b]
    if (!out.has(f)) out.set(f, [])
    out.get(f)!.push({ to: t, cost })
  }
  for (const arc of area.arcs) {
    const a = area.byId.get(arc.a), b = area.byId.get(arc.b)
    if (!a || !b || a.stubTo || b.stubTo) continue
    if (isKnown(a) && isKnown(b)) { add(a.id, b.id, 1); add(b.id, a.id, 1); continue }
    if (area.moves?.has(`${a.id}>${b.id}`)) add(a.id, b.id, UNMAPPED_COST)
    if (area.moves?.has(`${b.id}>${a.id}`)) add(b.id, a.id, UNMAPPED_COST)
  }
  return out
}

/** Cheapest path by step cost. `stop` ends the search at the first square it accepts. */
function dijkstra(g: Map<number, Edge[]>, from: number, stop: (id: number) => boolean): number[] | null {
  const dist = new Map<number, number>([[from, 0]])
  const prev = new Map<number, number>()
  const done = new Set<number>()
  // small graphs (a map is at most a few thousand squares): a sorted frontier is plenty
  const open: number[] = [from]
  while (open.length) {
    let bi = 0
    for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i
    const cur = open.splice(bi, 1)[0]
    if (done.has(cur)) continue
    done.add(cur)
    if (stop(cur)) {
      const path = [cur]
      for (let p = cur; prev.has(p); ) { p = prev.get(p)!; path.push(p) }
      return path.reverse()
    }
    for (const e of g.get(cur) ?? []) {
      const d = dist.get(cur)! + e.cost
      if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); prev.set(e.to, cur); open.push(e.to) }
    }
  }
  return null
}

/** Cut a path of squares into legs. */
function legsOf(area: DaArea, p: number[]): DaLeg[] {
  const known = (i: number) => isKnown(area.byId.get(p[i]))
  const lichOf = (i: number) => area.byId.get(p[i])!.lich!
  const legs: DaLeg[] = []
  const n = p.length - 1
  let i = 0
  while (i < n) {
    if (known(i)) {
      let j = i + 1
      while (j <= n && known(j)) j++
      if (j > n) { legs.push({ kind: 'go2', lich: lichOf(n), to: p[n] }); break }
      const k = j - 1
      if (k > i) { legs.push({ kind: 'go2', lich: lichOf(k), to: p[k] }); i = k }
    }
    let m = i + 1
    while (m < n && !known(m)) m++
    const squares = p.slice(i, m + 1)
    const moves = squares.slice(1).map((s, x) => area.moves!.get(`${squares[x]}>${s}`)!)
    const last = legs[legs.length - 1]
    if (last?.kind === 'walk') { last.moves.push(...moves); last.squares.push(...squares.slice(1)) }
    else legs.push({ kind: 'walk', moves, squares })
    i = m
  }
  return legs
}

/**
 * A route to square `to` on this map. `from` is the square you're on, or null
 * when you aren't on this map (or we don't know where): then the route starts
 * with a go2 to the known square nearest the target.
 * Returns null when a plain `;go2` does the whole job (both ends are Lich rooms).
 */
export function planDaRoute(area: DaArea, from: number | null, to: number): DaRoute | { error: string } | null {
  const target = area.byId.get(to)
  if (!target || target.stubTo) return { error: 'that square is a marker for another map' }
  const start = from !== null ? area.byId.get(from) : undefined
  if (isKnown(target) && (!start || isKnown(start))) return null
  if (start && start.id === target.id) return { error: "you're already there" }

  if (start) {
    const p = dijkstra(edges(area, false), start.id, id => id === to)
    if (!p) return { error: `no way there on the map from ${start.title}` }
    return { legs: legsOf(area, p), target: to }
  }
  // Not on this map: work back from the target to the nearest square go2 knows.
  const back = dijkstra(edges(area, true), to, id => isKnown(area.byId.get(id)))
  if (!back) return { error: 'no room Lich knows leads there on this map' }
  const p = back.reverse()
  return { legs: [{ kind: 'go2', lich: area.byId.get(p[0])!.lich!, to: p[0] }, ...legsOf(area, p)], target: to }
}

/**
 * Which "?" square you're on, when Lich's map can't say: the "?" square on
 * this map with the room's title (a tie goes to the one next to `near`, the
 * square you were last seen on; otherwise nobody wins).
 */
export function locateUnmapped(
  area: DaArea, title: string, near: number | null,
): DaRoom | undefined {
  const key = normalizeMatchKey(title)
  if (!key) return undefined
  const hits = area.rooms.filter(r => isUnmapped(r) && normalizeMatchKey(r.title) === key)
  if (hits.length <= 1) return hits[0]
  if (near === null) return undefined
  const next = new Set<number>()
  for (const a of area.arcs) { if (a.a === near) next.add(a.b); if (a.b === near) next.add(a.a) }
  const close = hits.filter(r => r.id === near || next.has(r.id))
  return close.length === 1 ? close[0] : undefined
}
