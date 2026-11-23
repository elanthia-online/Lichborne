// Da'Maps — match the rooms on the player's Genie maps to Lich rooms.
//
// Genie's map XML (the community GenieClient/Maps repository, which players
// keep in their Genie Maps folder) was laid out by hand, room by room. Da'Maps
// uses it ONLY for where each room is drawn. Everything else is Lich's: each
// Genie room is matched to a Lich room id, and that id is what the side panel,
// forage notes and right-click `;go2` use. No Genie id leaves this file.
//
// A Genie room carries a title, its descriptions and its exits, the same three
// things GenieMaps' own client matches on (Node.Compare). The ladder:
//   1. title → Lich rooms with that title (one → done)
//   2. a matching description narrows it (one → done)
//   3. the same set of compass exits narrows it (one → done)
//   4. its neighbours on the Genie map: the Lich candidate whose exits lead to
//      the Lich rooms its Genie neighbours already matched (repeat until
//      nothing changes)
// When Lich has an old copy of a room beside the real one, the real one (it
// has the game's room number) wins. Anything still ambiguous stays unmatched
// rather than guessed: it's drawn,
// but has no Lich room behind it.
//
// Pure and React-free.

import type { GenieZone, GenieNode, LichRoom } from '../../src/renderer/components/panels/mapTypes'
import { lichTitle, normalizeMatchKey } from '../../src/renderer/components/panels/mapTypes'

export interface GenieMatch {
  /** `${zoneId}:${nodeId}` → Lich room id */
  lichOf: Map<string, number>
  /** Lich room id → every Genie node drawn for it (a room can sit on two maps) */
  nodesOf: Map<number, { zoneId: string; nodeId: number }[]>
  /** a ↗ marker → the Lich room it stands for on the next map (for go2), by its name and description */
  stubLichOf: Map<string, number>
  stats: { nodes: number; matched: number; stubs: number }
}

export const nodeKey = (zoneId: string, nodeId: number) => `${zoneId}:${nodeId}`

/** A boundary marker standing in for a room on another Genie map. */
export function isStub(n: GenieNode): boolean {
  return !!n.note && /\.xml\b/i.test(n.note)
}

const COMPASS: Record<string, string> = {
  n: 'n', north: 'n', s: 's', south: 's', e: 'e', east: 'e', w: 'w', west: 'w',
  ne: 'ne', northeast: 'ne', nw: 'nw', northwest: 'nw', se: 'se', southeast: 'se', sw: 'sw', southwest: 'sw',
  u: 'u', up: 'u', d: 'd', down: 'd', out: 'out',
}
const exitKey = (m: unknown) => typeof m === 'string' ? COMPASS[m.trim().toLowerCase()] : undefined
const descKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** a room the game itself knows (Lich has its game room number) */
function hasGameId(r: LichRoom): boolean {
  const u = (r as { uid?: unknown }).uid
  return Array.isArray(u) ? u.length > 0 : typeof u === 'number'
}

function lichExits(r: LichRoom): string {
  const s = new Set<string>()
  for (const m of Object.values(r.wayto ?? {})) { const k = exitKey(m); if (k) s.add(k) }
  return [...s].sort().join(',')
}
function genieExits(n: GenieNode): string {
  const s = new Set<string>()
  for (const a of n.arcs) { const k = exitKey(a.move) ?? exitKey(a.exit); if (k) s.add(k) }
  return [...s].sort().join(',')
}

export function matchGenieToLich(zones: Map<string, GenieZone>, lichDb: Map<number, LichRoom>): GenieMatch {
  const byTitle = new Map<string, LichRoom[]>()
  for (const r of lichDb.values()) {
    const t = normalizeMatchKey(lichTitle(r))
    if (!t) continue
    if (!byTitle.has(t)) byTitle.set(t, [])
    byTitle.get(t)!.push(r)
  }
  const lichDesc = new Map<number, Set<string>>()
  const descOf = (r: LichRoom) => {
    let s = lichDesc.get(r.id)
    if (!s) {
      const d = (r as { description?: unknown }).description
      s = new Set((Array.isArray(d) ? d : typeof d === 'string' ? [d] : []).filter((x): x is string => typeof x === 'string').map(descKey))
      lichDesc.set(r.id, s)
    }
    return s
  }

  // Lich and Genie sometimes word a description slightly differently (a
  // trailing sentence added since); the opening is the stable part.
  const head = (d: string) => d.slice(0, 60)
  const byDescHead = new Map<string, LichRoom[]>()
  for (const r of lichDb.values()) for (const d of descOf(r)) {
    if (d.length < 30) continue
    const h = head(d)
    if (!byDescHead.has(h)) byDescHead.set(h, [])
    byDescHead.get(h)!.push(r)
  }

  const lichOf = new Map<string, number>()
  const stubLichOf = new Map<string, number>()
  const pending: { zone: GenieZone; node: GenieNode; cands: LichRoom[] }[] = []
  let total = 0, stubs = 0

  for (const zone of zones.values()) {
    for (const node of zone.nodes) {
      if (isStub(node)) {
        stubs++
        // A marker carries its room's name and description: match it the same
        // way, but only as a go2 target (it isn't drawn as that room).
        // Description exact, then its opening, then the name alone if it's unique.
        const nd = new Set(node.descriptions.map(descKey))
        const nh = new Set([...nd].map(head))
        const named = byTitle.get(normalizeMatchKey(node.name)) ?? []
        let c = named.filter(r => [...descOf(r)].some(d => nd.has(d)))
        if (!c.length) c = named.filter(r => [...descOf(r)].some(d => nh.has(head(d))))
        if (!c.length) c = named
        if (c.length > 1) { const real = c.filter(hasGameId); if (real.length) c = real }
        if (c.length === 1) stubLichOf.set(nodeKey(zone.id, node.id), c[0].id)
        continue
      }
      total++
      const nd = new Set(node.descriptions.map(descKey))
      const nh = new Set([...nd].map(head))
      let cands = byTitle.get(normalizeMatchKey(node.name)) ?? []
      if (cands.length === 0) {
        // Renamed room: find it by its description instead.
        const seen = new Set<LichRoom>()
        for (const h of nh) for (const r of byDescHead.get(h) ?? []) seen.add(r)
        cands = [...seen]
        if (cands.length === 0) continue
      }
      if (cands.length > 1) {
        const byDesc = cands.filter(c => [...descOf(c)].some(d => nd.has(d)))
        if (byDesc.length) cands = byDesc
        else {
          const byHead = cands.filter(c => [...descOf(c)].some(d => nh.has(head(d))))
          if (byHead.length) cands = byHead
        }
      }
      if (cands.length > 1) {
        const ge = genieExits(node)
        const byExits = cands.filter(c => lichExits(c) === ge)
        if (byExits.length) cands = byExits
      }
      if (cands.length > 1) {
        // Lich sometimes keeps an old copy of a room beside the real one (same
        // name and exits, the room's other description, no game room number).
        // The real one is the one the game knows: it has a game room number.
        const real = cands.filter(hasGameId)
        if (real.length) cands = real
      }
      if (cands.length === 1) lichOf.set(nodeKey(zone.id, node.id), cands[0].id)
      else pending.push({ zone, node, cands })
    }
  }

  // Neighbours: settle the rest from rooms already matched around them.
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    let progress = false
    for (let i = pending.length - 1; i >= 0; i--) {
      const { zone, node, cands } = pending[i]
      const nbrLich: number[] = []
      for (const a of node.arcs) {
        const l = lichOf.get(nodeKey(zone.id, a.destination))
        if (l !== undefined) nbrLich.push(l)
      }
      if (!nbrLich.length) continue
      let best: LichRoom | null = null, bestN = 0, tie = false
      for (const c of cands) {
        let n = 0
        for (const l of nbrLich) {
          if (c.wayto && Object.prototype.hasOwnProperty.call(c.wayto, String(l))) n++
          else if (lichDb.get(l)?.wayto && Object.prototype.hasOwnProperty.call(lichDb.get(l)!.wayto, String(c.id))) n++
        }
        if (n > bestN) { bestN = n; best = c; tie = false } else if (n === bestN && n > 0) tie = true
      }
      if (best && !tie) {
        lichOf.set(nodeKey(zone.id, node.id), best.id)
        pending.splice(i, 1)
        progress = true
      }
    }
    if (!progress) break
  }

  const nodesOf = new Map<number, { zoneId: string; nodeId: number }[]>()
  for (const [k, lid] of lichOf) {
    const i = k.lastIndexOf(':')
    const entry = { zoneId: k.slice(0, i), nodeId: Number(k.slice(i + 1)) }
    if (!nodesOf.has(lid)) nodesOf.set(lid, [])
    nodesOf.get(lid)!.push(entry)
  }
  return { lichOf, nodesOf, stubLichOf, stats: { nodes: total, matched: lichOf.size, stubs } }
}
