// Graph map bridge — matches Genie map rooms to Lich map rooms (v1.1.0, DESIGN §19.20)
//
// The Graph map draws rooms where GENIE puts them and says what LICH knows about
// them. This file is the join: pure, no React, no window, no storage, so the
// `tmp-graph-map` harness can run it against the real datasets.
//
// What it produces, per Genie zone: which Lich room each Genie node is (and HOW
// we know), the links Lich has that Genie doesn't draw, the Lich rooms that hang
// off a node but have no Genie node anywhere ("beyond the map"), and the node
// that leads to each neighbouring zone. Across zones: `lichToNodes` (a Lich room
// can sit in two zone files) and the zone-to-zone links.
//
// INVARIANTS
//   - A wrong match is worse than no match: the view sends `;go2 <lich id>` for a
//     matched room, so a tie stays UNMATCHED. Never "pick the first".
//   - Rooms are never given a position from Lich's directions. This file only
//     says which existing Genie node a Lich room is; a Lich room with no Genie
//     node is listed under the node it connects to, with no coordinates.
//   - Deterministic: the same zones and rooms give the same bridge (zones and
//     nodes are visited in their given order; ties never depend on Map order).
//   - `how` says what settled the match: 'desc' (title + description),
//     'neighbours' (a description tie, settled by Lich links to rooms already
//     matched beside it), 'title' (the only Lich room with that title, no
//     description in common, and a neighbour link vouching for it).
//   - A title is never enough by itself: towns share whole buildings by name.

import type { GenieNode, GenieZone, LichRoom } from './components/panels/mapTypes'
import { normalizeDesc, normalizeMatchKey, noteAliases, lichTitle } from './components/panels/mapTypes'
import { runSliced, runSync, type Steps } from './timeSlice'

export type MatchHow = 'desc' | 'neighbours' | 'title'

export interface BridgeMatch { lichId: number; how: MatchHow }

/** A link Lich has between two rooms of one zone that Genie doesn't draw. */
export interface ExtraLink {
  from: number          // Genie node id
  to:   number          // Genie node id
  move: string          // Lich's command, or '' when it is a script snippet
  conditional: boolean  // Lich works the move or its time out with a script (`;e …`)
}

/** A Lich room reachable from a matched node that no Genie zone has. */
export interface BeyondRoom { lichId: number; title: string; move: string }

/** A node that leads into another zone (a Genie boundary room, or a Lich link). */
export interface ZoneExit { nodeId: number; toZone: string; via: 'genie' | 'lich' }

export interface ZoneBridge {
  zoneId:     string
  matches:    Map<number, BridgeMatch>     // Genie node id → Lich room
  byLich:     Map<number, number>          // Lich room id → Genie node id (first in zone order)
  extraLinks: ExtraLink[]
  beyond:     Map<number, BeyondRoom[]>    // Genie node id → rooms beyond the map
  exits:      ZoneExit[]
  rooms:      number                       // nodes that are real rooms (boundary rooms excluded)
  matched:    number
}

export interface ZoneLink {
  a: string; b: string        // zone ids, a < b
  genie:   number             // boundary rooms joining them (both directions)
  lich:    number             // Lich links joining them (both directions)
  minTime: number | null      // quickest numeric Lich travel time across, if any
  moves:   string[]           // the distinct commands that cross (at most 6), for naming the trip
}

export interface GraphBridge {
  zones:       Map<string, ZoneBridge>
  lichToNodes: Map<number, { zoneId: string; nodeId: number }[]>
  zoneLinks:   ZoneLink[]
  stats: { rooms: number; matched: number; byDesc: number; byNeighbours: number; byTitle: number; lichMatched: number; outOfPlace: number; staleCopies: number }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/** True for a Genie boundary room: its note names another zone's XML file. */
export function isBoundaryNode(n: GenieNode): boolean {
  return noteAliases(n.note).some(a => a.toLowerCase().endsWith('.xml'))
}

function boundaryTarget(n: GenieNode): string | undefined {
  return noteAliases(n.note).find(a => a.toLowerCase().endsWith('.xml'))?.toLowerCase()
}

const DIR_WORDS: Record<string, string> = {
  n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w',
  ne: 'ne', northeast: 'ne', nw: 'nw', northwest: 'nw', se: 'se', southeast: 'se', sw: 'sw', southwest: 'sw',
  up: 'up', u: 'up', down: 'dn', d: 'dn', dn: 'dn', out: 'out',
}

/** The plain-direction exits of a Genie node, as short tokens, sorted. */
function genieDirs(n: GenieNode): string {
  const s = new Set<string>()
  for (const a of n.arcs) { const d = DIR_WORDS[a.exit.trim().toLowerCase()]; if (d) s.add(d) }
  return [...s].sort().join(',')
}

/** The plain-direction exits of a Lich room, as short tokens, sorted. */
function lichDirs(r: LichRoom): string {
  const s = new Set<string>()
  for (const cmd of Object.values(r.wayto ?? {})) {
    if (typeof cmd !== 'string') continue
    const d = DIR_WORDS[cmd.trim().toLowerCase()]
    if (d) s.add(d)
  }
  return [...s].sort().join(',')
}

const isScript = (v: unknown): boolean => typeof v === 'string' && v.trimStart().startsWith(';e')

/** True when a Genie move and a Lich command are the same step: the same words,
 *  or the same compass direction spelled two ways ("ne" / "northeast"). */
function sameMove(genie: string | undefined, lich: unknown): boolean {
  if (!genie || typeof lich !== 'string') return false
  const g = genie.trim().toLowerCase(), l = lich.trim().toLowerCase()
  if (!g || !l) return false
  if (g === l) return true
  const gd = DIR_WORDS[g], ld = DIR_WORDS[l]
  return gd != null && gd === ld
}

// ── Builder ───────────────────────────────────────────────────────────────────
//
// Two passes, because "beyond the map" and zone links need every zone matched
// first. Every pass is a GENERATOR that yields at cheap checkpoints (every few
// hundred rooms or nodes), so the async build can hand the thread back to the
// browser between them (timeSlice.ts). The sync build runs the same steps
// straight through: one body of code, so the two can't disagree.

interface Builder {
  zoneIds: string[]
  indexRooms(rooms: Iterable<LichRoom>): Steps<void>
  matchZone(zoneId: string): Steps<void>
  dropLookAlikes(): Steps<void>
  linkZone(zoneId: string): Steps<void>
  finish(): GraphBridge
}

function createBuilder(zones: Map<string, GenieZone>): Builder {
  const lichById = new Map<number, LichRoom>()
  const byTitle  = new Map<string, LichRoom[]>()
  function* indexRooms(rooms: Iterable<LichRoom>): Steps<void> {
    let n = 0
    for (const r of rooms) {
      if ((++n & 511) === 0) yield
      if (typeof r?.id !== 'number') continue
      lichById.set(r.id, r)
      const seen = new Set<string>()
      for (const t of r.title ?? []) {
        const k = normalizeMatchKey(t ?? '')
        if (!k || seen.has(k)) continue
        seen.add(k)
        let list = byTitle.get(k)
        if (!list) byTitle.set(k, list = [])
        list.push(r)
      }
    }
  }

  const descCache = new Map<number, string[]>()
  const lichDescs = (r: LichRoom): string[] => {
    let d = descCache.get(r.id)
    if (!d) descCache.set(r.id, d = (r.description ?? []).map(x => normalizeDesc(x ?? '')).filter(Boolean))
    return d
  }

  // Lich's map holds some STALE COPIES: a second room with the same title and
  // description as a real one, but no game room number and no links of its own
  // beyond the real room's (Shard's Coin Exchange is 19280 with uid 2014102, and
  // 19281 with neither). The copy tied with the real room, so neither matched,
  // the Coin Exchange showed as "beyond the map" though Genie draws it (Sekmeht).
  // A copy can never be the room the game reports you in, so it is dropped from
  // a candidate list, but only when ALL of this holds, so two genuinely different
  // look-alike rooms (identical alleys in two towns) still tie:
  //   - exactly one candidate in the list has a game room number;
  //   - the copy has none;
  //   - the copy's descriptions are all among that room's;
  //   - every room the copy leads to, that room leads to as well.
  const hasUid = (r: LichRoom) => Array.isArray(r.uid) && r.uid.length > 0
  const dropStaleCopies = (list: LichRoom[]): LichRoom[] => {
    if (list.length < 2) return list
    const real = list.filter(hasUid)
    if (real.length !== 1) return list
    const keep = real[0]
    const keepDescs = new Set(lichDescs(keep))
    const keepTo = new Set(Object.keys(keep.wayto ?? {}))
    const out = list.filter(r => r === keep || hasUid(r)
      || !(lichDescs(r).every(d => keepDescs.has(d)) && Object.keys(r.wayto ?? {}).every(to => keepTo.has(to))))
    if (out.length !== list.length) stats.staleCopies += list.length - out.length
    return out
  }

  const fileToZone = new Map<string, string>()
  for (const [id, z] of zones) if (z.sourceFile) fileToZone.set(z.sourceFile.toLowerCase(), id)

  const out = new Map<string, ZoneBridge>()
  const lichToNodes = new Map<number, { zoneId: string; nodeId: number }[]>()
  const linkAcc = new Map<string, ZoneLink>()
  const stats = { rooms: 0, matched: 0, byDesc: 0, byNeighbours: 0, byTitle: 0, lichMatched: 0, outOfPlace: 0, staleCopies: 0 }

  const noteLink = (a: string, b: string, kind: 'genie' | 'lich', time: number | null, moves: string[]) => {
    if (a === b) return
    const [x, y] = a < b ? [a, b] : [b, a]
    const k = `${x}\u0000${y}`
    let l = linkAcc.get(k)
    if (!l) linkAcc.set(k, l = { a: x, b: y, genie: 0, lich: 0, minTime: null, moves: [] })
    l[kind]++
    if (time != null && (l.minTime == null || time < l.minTime)) l.minTime = time
    for (const m of moves) {
      const t = m.trim().toLowerCase()
      if (t && l.moves.length < 6 && !l.moves.includes(t)) l.moves.push(t)
    }
  }

  // A zone's nodes by id, built once per zone.
  const nodeIndexCache = new Map<GenieZone, Map<number, GenieNode>>()
  const nodeIndexOf = (zone: GenieZone): Map<number, GenieNode> => {
    let m = nodeIndexCache.get(zone)
    if (!m) nodeIndexCache.set(zone, m = new Map(zone.nodes.map(n => [n.id, n])))
    return m
  }

  // Which nodes point at each node of a zone, built once per zone when linking.
  const inboundCache = new Map<GenieZone, Map<number, GenieNode[]>>()
  const inboundOf = (zone: GenieZone): Map<number, GenieNode[]> => {
    let m = inboundCache.get(zone)
    if (!m) {
      inboundCache.set(zone, m = new Map())
      for (const n of zone.nodes) for (const a of n.arcs) {
        let l = m.get(a.destination)
        if (!l) m.set(a.destination, l = [])
        if (!l.includes(n)) l.push(n)
      }
    }
    return m
  }

  function* matchZone(zoneId: string): Steps<void> {
    const zone = zones.get(zoneId)
    if (!zone) return
    const zb: ZoneBridge = {
      zoneId, matches: new Map(), byLich: new Map(), extraLinks: [], beyond: new Map(), exits: [], rooms: 0, matched: 0,
    }
    out.set(zoneId, zb)

    const nodeById = new Map<number, GenieNode>()
    for (const n of zone.nodes) nodeById.set(n.id, n)
    // Who points AT each node, so a neighbour check sees links in both directions.
    const inbound = new Map<number, number[]>()
    for (const n of zone.nodes) for (const a of n.arcs) {
      let l = inbound.get(a.destination)
      if (!l) inbound.set(a.destination, l = [])
      l.push(n.id)
    }

    // Candidates still tied after the title/description rungs, with the least
    // neighbour evidence each needs (a description tie needs less than a bare title).
    const pools = new Map<number, { cands: LichRoom[]; need: number; titleOnly?: boolean }>()
    const set = (n: GenieNode, r: LichRoom, how: MatchHow) => {
      zb.matches.set(n.id, { lichId: r.id, how })
      if (!zb.byLich.has(r.id)) zb.byLich.set(r.id, n.id)
    }

    let step = 0
    for (const n of zone.nodes) {
      if ((++step & 127) === 0) yield
      if (isBoundaryNode(n)) continue
      zb.rooms++
      const cands = dropStaleCopies(byTitle.get(normalizeMatchKey(n.name)) ?? [])
      if (cands.length === 0) continue
      const nd = n.descriptions.map(d => normalizeDesc(d)).filter(Boolean)

      let hits = nd.length ? cands.filter(r => lichDescs(r).some(d => nd.includes(d))) : []
      if (hits.length === 0 && nd.length) {
        // A stored description is often a cut-down copy of the other side's.
        // Containment either way, both long enough to mean something (B148/B150).
        hits = cands.filter(r => lichDescs(r).some(d => d.length >= 24 &&
          nd.some(g => g.length >= 24 && (d.includes(g) || g.includes(d)))))
      }
      if (hits.length === 1) { set(n, hits[0], 'desc'); continue }
      if (hits.length > 1)   { pools.set(n.id, { cands: hits, need: 1 }); continue }
      // No description agrees. A title alone is not enough, even when only one
      // Lich room has it: towns share whole buildings by name (every Traders'
      // Guild has an "Auction Hall"), and Lich may only have mapped one of them.
      // So a neighbour has to vouch: one link when the title is unique and the
      // plain exits agree, two otherwise.
      const sure = cands.length === 1 && genieDirs(n) === lichDirs(cands[0])
      pools.set(n.id, { cands, need: sure ? 1 : 2, titleOnly: cands.length === 1 })
    }

    // Neighbours rung: a tied candidate wins when it alone is joined, in Lich's
    // links, to the most rooms already matched beside this node. Repeat until a
    // pass matches nothing; each pass only reads matches made BEFORE it began,
    // so the result does not depend on node order within a pass.
    //
    // A link in the same DIRECTION counts double. Without that, two identical
    // rooms either side of a fountain both "link to the fountain" and tie; with
    // it, the one Genie puts west of the fountain is the one Lich walks east from.
    for (let round = 0; round < 12 && pools.size; round++) {
      const found: [GenieNode, LichRoom, MatchHow][] = []
      // Pausing inside a pass is safe: the pass only collects into `found`.
      for (const [nodeId, pool] of pools) {
        if ((++step & 127) === 0) yield
        const n = nodeById.get(nodeId)!
        // Matched neighbours: the Lich room, and the Genie move to it / from it.
        const near = new Map<number, { out?: string; back?: string }>()
        for (const a of n.arcs) {
          const m = zb.matches.get(a.destination)
          if (!m) continue
          const e = near.get(m.lichId) ?? {}
          e.out ??= a.move || a.exit
          near.set(m.lichId, e)
        }
        for (const src of inbound.get(nodeId) ?? []) {
          const m = zb.matches.get(src)
          if (!m) continue
          const e = near.get(m.lichId) ?? {}
          if (e.back == null) {
            const arc = nodeById.get(src)?.arcs.find(a => a.destination === nodeId)
            if (arc) e.back = arc.move || arc.exit
          }
          near.set(m.lichId, e)
        }
        if (near.size === 0) continue
        let best: LichRoom | null = null, bestScore = 0, bestLinks = 0, tie = false
        for (const c of pool.cands) {
          if (zb.byLich.has(c.id)) continue   // already another node of this zone
          let score = 0, links = 0
          for (const [id, moves] of near) {
            const out  = c.wayto?.[String(id)]
            const back = lichById.get(id)?.wayto?.[String(c.id)]
            if (out == null && back == null) continue
            links++
            score += (out != null && sameMove(moves.out, out)) || (back != null && sameMove(moves.back, back)) ? 2 : 1
          }
          if (score > bestScore) { best = c; bestScore = score; bestLinks = links; tie = false }
          else if (score === bestScore && score > 0) tie = true
        }
        if (best && !tie && bestLinks >= pool.need) found.push([n, best, pool.titleOnly ? 'title' : 'neighbours'])
      }
      if (found.length === 0) break
      // Two nodes may have picked the same Lich room in one pass; that is a tie.
      const picks = new Map<number, number>()
      for (const [, r] of found) picks.set(r.id, (picks.get(r.id) ?? 0) + 1)
      let made = 0
      for (const [n, r, how] of found) {
        if (picks.get(r.id)! > 1 || zb.byLich.has(r.id)) continue
        set(n, r, how); pools.delete(n.id); made++
      }
      if (made === 0) break
    }

    // Two nodes of one zone on the same Lich room: at most one of them is that
    // room (Genie drew two look-alike rooms, Lich has one that fits). Keep the
    // one its neighbours vouch for; with no clear winner, neither keeps it.
    const claims = new Map<number, number[]>()
    for (const [nodeId, m] of zb.matches) {
      let l = claims.get(m.lichId)
      if (!l) claims.set(m.lichId, l = [])
      l.push(nodeId)
    }
    const dropped: number[] = []
    for (const [lichId, nodeIds] of claims) {
      if (nodeIds.length < 2) continue
      const room = lichById.get(lichId)
      let keep = -1, bestScore = 0, tie = false
      for (const nodeId of nodeIds) {
        const n = nodeById.get(nodeId)!
        const near = new Set<number>()
        for (const a of n.arcs) { const m = zb.matches.get(a.destination); if (m && m.lichId !== lichId) near.add(m.lichId) }
        for (const src of inbound.get(nodeId) ?? []) { const m = zb.matches.get(src); if (m && m.lichId !== lichId) near.add(m.lichId) }
        let score = 0
        for (const id of near) {
          if (room?.wayto && String(id) in room.wayto) score++
          else { const o = lichById.get(id); if (o?.wayto && String(lichId) in o.wayto) score++ }
        }
        if (score > bestScore) { keep = nodeId; bestScore = score; tie = false }
        else if (score === bestScore && score > 0) tie = true
      }
      for (const nodeId of nodeIds) if (tie || nodeId !== keep) dropped.push(nodeId)
    }
    if (dropped.length) {
      for (const nodeId of dropped) zb.matches.delete(nodeId)
      zb.byLich.clear()
      for (const n of zone.nodes) { const m = zb.matches.get(n.id); if (m) zb.byLich.set(m.lichId, n.id) }
    }

    // A match whose matched neighbours are ALL strangers to it in Lich's links
    // is in the wrong place: a look-alike room (a shop interior, a stretch of
    // road) whose real twin is in another town. But a stranger makes its honest
    // neighbour look like one too, so a match is only dropped when one of the
    // neighbours it disagrees with is itself backed by somebody else. Every
    // match is judged against the matches as they stand, then the wrong ones go
    // together, so the outcome does not depend on node order.
    const backed = new Set<number>()                 // nodes some neighbour agrees with
    const strangers = new Map<number, number[]>()    // node → matched neighbours, when none agree
    for (const [nodeId, m] of zb.matches) {
      const n = nodeById.get(nodeId)!
      const room = lichById.get(m.lichId)
      const near: number[] = []
      let agree = false
      const check = (otherNode: number) => {
        const o = zb.matches.get(otherNode)
        if (!o || o.lichId === m.lichId) return
        near.push(otherNode)
        if (agree) return
        if (room?.wayto && String(o.lichId) in room.wayto) agree = true
        else { const r = lichById.get(o.lichId); if (r?.wayto && String(m.lichId) in r.wayto) agree = true }
      }
      for (const a of n.arcs) check(a.destination)
      for (const src of inbound.get(nodeId) ?? []) check(src)
      if (agree) backed.add(nodeId)
      else if (near.length) strangers.set(nodeId, near)
    }
    const wrong: number[] = []
    for (const [nodeId, near] of strangers) if (near.some(o => backed.has(o))) wrong.push(nodeId)
    if (wrong.length) {
      stats.outOfPlace += wrong.length
      for (const nodeId of wrong) zb.matches.delete(nodeId)
      zb.byLich.clear()
      for (const n of zone.nodes) { const m = zb.matches.get(n.id); if (m && !zb.byLich.has(m.lichId)) zb.byLich.set(m.lichId, n.id) }
    }

    for (const n of zone.nodes) {
      const m = zb.matches.get(n.id)
      if (!m) continue
      zb.matched++
      let l = lichToNodes.get(m.lichId)
      if (!l) lichToNodes.set(m.lichId, l = [])
      l.push({ zoneId, nodeId: n.id })
      if (m.how === 'desc') stats.byDesc++
      else if (m.how === 'neighbours') stats.byNeighbours++
      else stats.byTitle++
    }
    stats.rooms += zb.rooms
    stats.matched += zb.matched
  }

  /** True when a neighbour of the node is matched to a room Lich links with this
   *  node's room, i.e. the surroundings agree that the match is in the right place. */
  function vouchedFor(zoneId: string, nodeId: number): boolean {
    const zone = zones.get(zoneId), zb = out.get(zoneId)
    const m = zb?.matches.get(nodeId)
    if (!zone || !zb || !m) return false
    const room = lichById.get(m.lichId)
    const near: number[] = []
    const node = nodeIndexOf(zone).get(nodeId)
    if (node) for (const a of node.arcs) { const o = zb.matches.get(a.destination); if (o) near.push(o.lichId) }
    for (const src of inboundOf(zone).get(nodeId) ?? []) { const o = zb.matches.get(src.id); if (o) near.push(o.lichId) }
    for (const id of near) {
      if (id === m.lichId) continue
      if (room?.wayto && String(id) in room.wayto) return true
      const o = lichById.get(id)
      if (o?.wayto && String(m.lichId) in o.wayto) return true
    }
    return false
  }

  /** A Lich room matched in several zones is either a room two maps both draw
   *  (a gate), or look-alike rooms in different towns of which Lich has one.
   *  Where the surroundings vouch for some of the matches and not others, the
   *  unvouched ones are the look-alikes: drop them. Run once, between passes. */
  function* dropLookAlikes(): Steps<void> {
    let n = 0
    for (const [lichId, list] of lichToNodes) {
      if ((++n & 1023) === 0) yield
      const zonesHit = new Set(list.map(e => e.zoneId))
      if (zonesHit.size < 2) continue
      const good = list.filter(e => vouchedFor(e.zoneId, e.nodeId))
      if (good.length === 0 || good.length === list.length) continue
      for (const e of list) {
        if (good.includes(e)) continue
        const zb = out.get(e.zoneId)!
        const how = zb.matches.get(e.nodeId)?.how
        zb.matches.delete(e.nodeId)
        if (zb.byLich.get(lichId) === e.nodeId) zb.byLich.delete(lichId)
        zb.matched--; stats.matched--
        if (how === 'desc') stats.byDesc--
        else if (how === 'neighbours') stats.byNeighbours--
        else stats.byTitle--
      }
      lichToNodes.set(lichId, good)
    }
  }

  function* linkZone(zoneId: string): Steps<void> {
    const zone = zones.get(zoneId)
    const zb = out.get(zoneId)
    if (!zone || !zb) return

    let step = 0
    for (const n of zone.nodes) {
      if ((++step & 127) === 0) yield
      // Genie boundary rooms: the room that leads to the boundary is the exit.
      const target = boundaryTarget(n)
      if (target) {
        const toZone = fileToZone.get(target)
        if (toZone && toZone !== zoneId) {
          zb.exits.push({ nodeId: n.id, toZone, via: 'genie' })
          // The commands that step ONTO the boundary room are how you cross.
          const into: string[] = []
          for (const src of inboundOf(zone).get(n.id) ?? []) {
            for (const a of src.arcs) if (a.destination === n.id) into.push(a.move)
          }
          noteLink(zoneId, toZone, 'genie', null, into)
        }
        continue
      }
      const m = zb.matches.get(n.id)
      if (!m) continue
      const room = lichById.get(m.lichId)
      if (!room?.wayto) continue
      const drawn = new Set<number>()
      for (const a of n.arcs) drawn.add(a.destination)

      for (const [destStr, cmd] of Object.entries(room.wayto)) {
        const destId = Number(destStr)
        if (!Number.isFinite(destId) || destId === room.id) continue
        const rawTime = room.timeto?.[destStr] as unknown
        const conditional = isScript(cmd) || isScript(rawTime)
        const move = typeof cmd === 'string' && !isScript(cmd) ? cmd : ''
        const here = zb.byLich.get(destId)
        if (here != null) {
          if (here !== n.id && !drawn.has(here)) zb.extraLinks.push({ from: n.id, to: here, move, conditional })
          continue
        }
        const elsewhere = lichToNodes.get(destId)
        if (elsewhere?.length) {
          const time = typeof rawTime === 'number' ? rawTime : null
          const seen = new Set<string>()
          for (const e of elsewhere) {
            if (e.zoneId === zoneId || seen.has(e.zoneId)) continue
            seen.add(e.zoneId)
            zb.exits.push({ nodeId: n.id, toZone: e.zoneId, via: 'lich' })
            noteLink(zoneId, e.zoneId, 'lich', time, move ? [move] : [])
          }
          continue
        }
        const dest = lichById.get(destId)
        if (!dest) continue
        // Genie DRAWS this room right beside this one, so it isn't "beyond the
        // map" (listing it said a room was missing that is on screen next door;
        // Sekmeht). Three ways that shows, all a drawn neighbour of the same name:
        //   - the neighbour is unmatched (a tie, a description that differs);
        //   - the neighbour is matched to a Lich room this one reaches by the
        //     SAME command: one command can't lead two places, so the other is a
        //     stale copy, whatever its description says (the Shard Consulate's
        //     foyer goes `west` to Silk Strings 15405 and to 12855, an old copy
        //     with the room's former wording and no game number);
        //   - the neighbour is matched to this room's TWIN: same descriptions,
        //     and this one has no game room number (a stale copy; the Shard bank
        //     leads to both Coin Exchange rooms).
        // A matched neighbour that is merely same-NAMED isn't enough: whole
        // stretches share a name ("Prairie"), and a room really missing from
        // Genie must still show.
        // And in the same direction: the Lich step must be the Genie arc's step
        // (a scripted step has no direction to compare, so the name decides).
        const destKey = normalizeMatchKey(lichTitle(dest))
        if (n.arcs.some(a => {
          const d = nodeIndexOf(zone).get(a.destination)
          if (!d || normalizeMatchKey(d.name) !== destKey) return false
          if (move && !sameMove(a.move, move) && !sameMove(a.exit, move)) return false
          const dm = zb.matches.get(a.destination)
          if (!dm) return true
          if (typeof cmd === 'string' && !isScript(cmd) && room.wayto?.[String(dm.lichId)] === cmd) return true
          const twin = lichById.get(dm.lichId)
          if (!twin || hasUid(dest)) return false
          const td = new Set(lichDescs(twin))
          return lichDescs(dest).length > 0 && lichDescs(dest).every(x => td.has(x))
        })) continue
        let l = zb.beyond.get(n.id)
        if (!l) zb.beyond.set(n.id, l = [])
        const title = normalizeTitleForShow(dest)
        l.push({ lichId: destId, title, move })
      }
    }
  }

  function finish(): GraphBridge {
    stats.lichMatched = lichToNodes.size
    const zoneLinks = [...linkAcc.values()].sort((p, q) => p.a === q.a ? (p.b < q.b ? -1 : 1) : (p.a < q.a ? -1 : 1))
    return { zones: out, lichToNodes, zoneLinks, stats }
  }

  return { zoneIds: [...zones.keys()], indexRooms, matchZone, dropLookAlikes, linkZone, finish }
}

function normalizeTitleForShow(r: LichRoom): string {
  const t = (r.title ?? [])[0] ?? ''
  return t.replace(/^\[+/, '').replace(/\]+$/, '').trim() || `Room ${r.id}`
}

/** Every step of the build, in order. */
function* bridgeSteps(zones: Map<string, GenieZone>, rooms: Iterable<LichRoom>): Steps<GraphBridge> {
  const b = createBuilder(zones)
  yield* b.indexRooms(rooms)
  for (const id of b.zoneIds) { yield* b.matchZone(id); yield }
  yield* b.dropLookAlikes()
  for (const id of b.zoneIds) { yield* b.linkZone(id); yield }
  return b.finish()
}

/** Build the whole bridge in one go (about a quarter of a second on the full world). */
export function buildGraphBridge(zones: Map<string, GenieZone>, rooms: Iterable<LichRoom>): GraphBridge {
  return runSync(bridgeSteps(zones, rooms))
}

/** The same build in slices of about BUDGET_MS, handing the thread back to the
 *  browser (`pause`, default `yieldToBrowser`) between them, so a window that is
 *  drawing the map or zooming keeps its frames while the match runs. */
export function buildGraphBridgeAsync(
  zones: Map<string, GenieZone>,
  rooms: Iterable<LichRoom>,
  pause?: () => Promise<void>,
): Promise<GraphBridge> {
  return runSliced(bridgeSteps(zones, rooms), pause)
}

/** The Genie node to show for a Lich room: the one in `preferZone` when the room
 *  is drawn there, else its only node, else undefined (drawn in several zones
 *  and none of them preferred, so the caller falls back to its own matching). */
export function nodeForLichRoom(
  bridge: GraphBridge, lichId: number, preferZone?: string,
): { zoneId: string; nodeId: number } | undefined {
  const list = bridge.lichToNodes.get(lichId)
  if (!list?.length) return undefined
  if (preferZone) { const hit = list.find(e => e.zoneId === preferZone); if (hit) return hit }
  const zonesHit = new Set(list.map(e => e.zoneId))
  return zonesHit.size === 1 ? list[0] : undefined
}
