// Da'Maps — one Genie map floor turned into a Da'Maps area.
//
// Positions, lines, colours and place names come from the Genie map exactly as
// its makers drew them. Each square is backed by the Lich room it matched
// (genieMatch.ts), which supplies indoor/outdoor, forage, hunting, services and
// the id for `;go2`. Squares with no Lich match are still drawn, so the map is
// whole, but can't be travelled to by clicking.
//
// Area keys are `g:<zoneId>@<level>`; Genie maps can have several floors.

import type { GenieZone, GenieNode, LichRoom } from '../../mapTypes'
import { lichTitle, normalizeMatchKey } from '../../mapTypes'
import {
  type DaArea, type DaArc, type DaBuilding, type DaRoom,
  classifyMove, splitTags, isIndoor, buildingName, placeLabelsAndOutlines,
} from '../daMapsData'
import { isStub, nodeKey, type GenieMatch } from './genieMatch'

export const GENIE_ROOM_SIZE = 8

export const genieAreaKey = (zoneId: string, level: number) => `g:${zoneId}@${level}`
export function parseGenieAreaKey(key: string): { zoneId: string; level: number } | null {
  const m = /^g:(.*)@(-?\d+)$/.exec(key)
  return m ? { zoneId: m[1], level: Number(m[2]) } : null
}

/** the floors a Genie map has, ground floor first */
export function genieLevels(zone: GenieZone): number[] {
  const s = new Set(zone.nodes.filter(n => !isStub(n)).map(n => n.z))
  if (!s.size) s.add(0)
  return [...s].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b))
}

/** Genie map file name → its zone id, for boundary markers ("Map7_NE_Gate.xml"). */
export function zoneIdByFile(zones: Map<string, GenieZone>): Map<string, string> {
  const m = new Map<string, string>()
  for (const z of zones.values()) m.set(z.sourceFile.toLowerCase(), z.id)
  return m
}

export function buildGenieArea(
  zone: GenieZone, level: number, match: GenieMatch,
  lichDb: Map<number, LichRoom>, fileToZone: Map<string, string>,
  /** the area key a Lich room is drawn in, for exits that leave this one */
  areaOfLich: (lichId: number) => string = () => '',
): DaArea {
  // A boundary marker belongs on the floor of the room it's joined to: Genie
  // sometimes parks one on another floor so it doesn't crowd the map, which
  // would leave it floating there with no line.
  const nodeZ = new Map(zone.nodes.map(n => [n.id, n.z]))
  const zOf = (n: GenieNode) => {
    if (!isStub(n)) return n.z
    for (const a of n.arcs) { const z = a.destination ? nodeZ.get(a.destination) : undefined; if (z !== undefined) return z }
    return n.z
  }
  const rooms: DaRoom[] = []
  const byId = new Map<number, DaRoom>()      // keyed by Genie node id (unique in a zone)
  const byLich = new Map<number, DaRoom>()

  for (const n of zone.nodes) {
    if (zOf(n) !== level) continue
    if (!n.name.trim()) continue            // unnamed placeholder squares
    const lid = match.lichOf.get(nodeKey(zone.id, n.id)) ?? null
    const r = lid !== null ? lichDb.get(lid) : undefined
    const tags = splitTags(r?.tags)
    const exits = r ? Object.values(r.wayto ?? {}).filter((m): m is string => typeof m === 'string') : n.arcs.map(a => a.move)
    let stubTo: string | undefined
    if (isStub(n)) {
      const file = (n.note!.match(/[^|]*\.xml/i)?.[0] ?? '').trim().toLowerCase()
      const z = fileToZone.get(file)
      if (z) stubTo = genieAreaKey(z, 0)
    }
    const room: DaRoom = {
      id: n.id,
      lich: stubTo ? null : lid,
      fill: n.color && n.color.toUpperCase() !== '#FFFFFF' ? n.color : undefined,
      stubTo,
      x: n.x, y: n.y, size: GENIE_ROOM_SIZE,
      lx: 0, ly: 0,
      title: r ? lichTitle(r) : n.name.replace(/^\[+|\]+$/g, ''),
      indoor: r ? isIndoor(r) : false,
      category: tags.category,
      forage: tags.forage, hunting: tags.hunting, services: tags.services,
      exits,
      crossTo: stubTo ? [stubTo] : [],
      label: '',
      building: null,
      location: r?.location ?? '',
    }
    rooms.push(room)
    byId.set(room.id, room)
    if (room.lich !== null && !byLich.has(room.lich)) byLich.set(room.lich, room)
  }

  // Lines, as the map's makers drew them (hidden arcs stay hidden).
  const seen = new Set<string>()
  const arcs: DaArc[] = []
  for (const n of zone.nodes) {
    if (!byId.has(n.id)) continue
    for (const a of n.arcs) {
      if (a.hidden || !byId.has(a.destination) || a.destination === n.id) continue
      const k = n.id < a.destination ? `${n.id}-${a.destination}` : `${a.destination}-${n.id}`
      if (seen.has(k)) continue
      seen.add(k)
      arcs.push({ a: n.id, b: a.destination, cat: classifyMove(a.move) })
    }
  }

  // The moves into and out of "?" squares (rooms Lich's map doesn't have), so
  // Da'Maps can walk the part of a route go2 can't. Hidden arcs count: they
  // aren't drawn, but they're still a way through.
  // Genie helper scripts (`script autoclimbup`, `.travel`, …) don't exist in
  // Lichborne and aren't needed there (Kaesken, 2026-11-22): such a step is
  // left out, so a route that needs it isn't offered rather than stopping on it.
  const genieScript = (m: string) => /^\s*(?:script\s|\.)/i.test(m)
  const moves = new Map<string, string>()
  const unmapped = (id: number) => { const r = byId.get(id); return !!r && r.lich === null && !r.stubTo }
  for (const n of zone.nodes) {
    if (!byId.has(n.id)) continue
    for (const a of n.arcs) {
      if (!a.move || genieScript(a.move) || !byId.has(a.destination) || a.destination === n.id) continue
      if (!unmapped(n.id) && !unmapped(a.destination)) continue
      const k = `${n.id}>${a.destination}`
      // Genie's `#send N cmd` (send after N seconds) becomes the walker's own
      // `-N cmd` wait; any other Genie #command leaves the step out.
      const move = a.move.replace(/(^|;)\s*#send\s+(\d+)\s+/gi, '$1-$2 ')
      if (/(^|;)\s*#/.test(move)) continue
      if (!moves.has(k)) moves.set(k, move)
    }
  }

  // A ↗ marker from the map file stands for a room on the next map: find that
  // Lich room, so right-click can go2 there. It's the room its door's Lich
  // exits lead to by the same move, or else the one with the marker's name.
  for (const r of rooms) {
    if (!r.stubTo) continue
    const stub = zone.nodes.find(n => n.id === r.id)!
    const found = new Set<number>()
    for (const d of zone.nodes) {
      const toStub = d.arcs.find(a => a.destination === r.id)
      const fromStub = stub.arcs.find(a => a.destination === d.id)
      if (!toStub && !fromStub) continue
      const door = match.lichOf.get(nodeKey(zone.id, d.id))
      const way = door !== undefined ? lichDb.get(door)?.wayto ?? {} : {}
      const byMove = toStub ? Object.entries(way).filter(([, mv]) => mv === toStub.move).map(([k]) => Number(k)) : []
      const byName = Object.keys(way).map(Number).filter(k => {
        const t = lichDb.get(k)
        return t && normalizeMatchKey(lichTitle(t)) === normalizeMatchKey(stub.name)
      })
      const pick = byMove.length === 1 ? byMove : byName
      if (pick.length === 1) found.add(pick[0])
    }
    const own = match.stubLichOf.get(nodeKey(zone.id, r.id))
    r.goTo = own ?? (found.size === 1 ? [...found][0] : undefined)
  }

  // ── No square left unattached ────────────────────────────────────────────
  // Some squares have no drawn line: the Genie map hides their exit (a long
  // `go portal`), the exit leads to another floor or map, or the map's makers
  // never drew one. For each such square, in order:
  //   1. draw its hidden exits after all;
  //   2. draw Lich's exits to rooms on this floor;
  //   3. for exits to another floor or map, set a small ↗ marker right beside
  //      it (click it to go there), joined to it by a short line.
  const degree = new Map<number, number>()
  const bump = (id: number) => degree.set(id, (degree.get(id) ?? 0) + 1)
  for (const a of arcs) { bump(a.a); bump(a.b) }
  const addArc = (a: number, b: number, move: string) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(k)) return
    seen.add(k)
    arcs.push({ a, b, cat: classifyMove(move) })
    bump(a); bump(b)
  }
  const nodeById = new Map(zone.nodes.map(n => [n.id, n]))
  let nextMarker = -1
  const near = (x: number, y: number) => rooms.some(o => Math.abs(o.x - x) < GENIE_ROOM_SIZE + 2 && Math.abs(o.y - y) < GENIE_ROOM_SIZE + 2)
  const addMarker = (from: DaRoom, to: string, title: string, goTo?: number) => {
    if (!to) return false
    const step = GENIE_ROOM_SIZE * 2
    const spots: [number, number][] = [[step, 0], [0, -step], [-step, 0], [0, step], [step, -step], [-step, -step], [-step, step], [step, step]]
    const spot = spots.find(([dx, dy]) => !near(from.x + dx, from.y + dy))
    if (!spot) return false
    const m: DaRoom = {
      id: nextMarker--, lich: null, stubTo: to, goTo,
      x: from.x + spot[0], y: from.y + spot[1], size: GENIE_ROOM_SIZE,
      lx: 0, ly: 0, title, indoor: false, category: null, forage: [], hunting: [], services: [],
      exits: [], crossTo: [to], label: '', building: null, location: '',
    }
    rooms.push(m); byId.set(m.id, m)
    addArc(from.id, m.id, 'go')
    return true
  }
  for (const r of [...rooms]) {
    if (degree.get(r.id) || r.stubTo) continue
    const n = nodeById.get(r.id)!
    // 1. hidden exits on this floor
    for (const a of n.arcs) if (a.hidden && byId.has(a.destination) && a.destination !== r.id) addArc(r.id, a.destination, a.move)
    if (degree.get(r.id)) continue
    // 2. Lich's exits to rooms on this floor
    const lr = r.lich !== null ? lichDb.get(r.lich) : undefined
    const out: { lich: number; move: string }[] = []
    for (const [k, mv] of Object.entries(lr?.wayto ?? {})) if (typeof mv === 'string') out.push({ lich: Number(k), move: mv })
    for (const o of out) { const t = byLich.get(o.lich); if (t && t.id !== r.id) addArc(r.id, t.id, o.move) }
    if (degree.get(r.id)) continue
    // 3. a marker for an exit to another floor or map
    let done = false
    for (const a of n.arcs) {
      const d = a.destination ? nodeById.get(a.destination) : undefined
      if (d && d.z !== level) { done = addMarker(r, genieAreaKey(zone.id, d.z), `${d.z > level ? 'Up' : 'Down'} to ${d.name}`, match.lichOf.get(nodeKey(zone.id, d.id))); if (done) break }
    }
    if (!done) for (const o of out) {
      const key = areaOfLich(o.lich)
      if (key && key !== genieAreaKey(zone.id, level)) {
        const t = lichDb.get(o.lich)
        done = addMarker(r, key, t ? lichTitle(t) : 'Another map', o.lich)
        if (done) break
      }
    }
  }

  // 4. What's still alone is something the map's makers drew without an exit:
  //    a ↗ marker set beside its door, a maze square (its exits are random,
  //    so Genie draws none), or a cell you're put in. Join it to the nearest
  //    square it belongs with: for a marker, any room; for a maze square, its
  //    maze neighbours; otherwise a room of the same building.
  const dist = (a: DaRoom, b: DaRoom) => Math.hypot(a.x - b.x, a.y - b.y)
  const MAX_NEAR = GENIE_ROOM_SIZE * 8
  for (const r of [...rooms]) {
    if (degree.get(r.id)) continue
    const n = nodeById.get(r.id)
    const maze = !r.stubTo && !!n && n.arcs.length > 0 && n.arcs.every(a => !a.destination)
    const others = rooms.filter(o => o.id !== r.id && dist(o, r) <= MAX_NEAR)
    if (maze) {
      // its maze neighbours: same-named squares one step away
      const step = Math.min(...others.filter(o => o.title === r.title).map(o => dist(o, r)), Infinity)
      for (const o of others) if (o.title === r.title && dist(o, r) <= step * 1.5) addArc(r.id, o.id, 'go')
      if (degree.get(r.id)) continue
    }
    const pick = (list: DaRoom[]) => list.sort((a, b) => dist(a, r) - dist(b, r))[0]
    const target = r.stubTo
      ? pick(others.filter(o => !o.stubTo))
      : pick(others.filter(o => !o.stubTo && buildingName(o.title) === buildingName(r.title))) ?? pick(others.filter(o => !o.stubTo))
    // a marker is always beside its door, however sparse the map round it
    const far = !target && r.stubTo ? pick(rooms.filter(o => o.id !== r.id && !o.stubTo)) : undefined
    if (target ?? far) addArc(r.id, (target ?? far)!.id, 'go')
  }

  // No square on top of another. A few Genie squares share a spot (a marker
  // drawn over its door, two ferry decks, a copy-pasted room); the later one,
  // markers first, moves to the nearest free spot. Its lines follow it.
  // A grid of cells one spacing wide, so "is anything within a spacing of
  // here" looks at nine cells instead of every square (the big maps have over
  // a thousand squares; checking each against all was most of the build).
  const S = GENIE_ROOM_SIZE
  const CELL = S + 2
  const grid = new Map<string, DaRoom[]>()
  const cellOf = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
  for (const o of rooms) { const k = cellOf(o.x, o.y); const c = grid.get(k); if (c) c.push(o); else grid.set(k, [o]) }
  const within = (r: DaRoom, x: number, y: number, d: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const o of grid.get(`${cx + i},${cy + j}`) ?? []) {
        if (o !== r && Math.abs(o.x - x) < d && Math.abs(o.y - y) < d) return true
      }
    }
    return false
  }
  const clash = (r: DaRoom, x: number, y: number) => within(r, x, y, S + 2)
  const order = [...rooms].sort((p, q) => Number(!!q.stubTo) - Number(!!p.stubTo))
  for (const r of order) {
    if (!within(r, r.x, r.y, S)) continue
    search: for (let ring = 1; ring <= 30; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (const dy of [-ring, ring]) {
        for (const [px, py] of [[dx, dy], [dy, dx]]) {
          const x = r.x + px * (S + 2), y = r.y + py * (S + 2)
          if (!clash(r, x, y)) {
            const from = grid.get(cellOf(r.x, r.y))!
            from.splice(from.indexOf(r), 1)
            r.x = x; r.y = y
            const k = cellOf(x, y); const c = grid.get(k); if (c) c.push(r); else grid.set(k, [r])
            break search
          }
        }
      }
    }
  }

  // Buildings: indoor rooms joined on the map that share a name.
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let p = x
    while ((parent.get(p) ?? p) !== p) p = parent.get(p)!
    parent.set(x, p)
    return p
  }
  for (const r of rooms) if (r.indoor) parent.set(r.id, r.id)
  for (const a of arcs) {
    const p = byId.get(a.a)!, q = byId.get(a.b)!
    if (!p.indoor || !q.indoor || buildingName(p.title) !== buildingName(q.title)) continue
    const ra = find(p.id), rb = find(q.id)
    if (ra !== rb) parent.set(ra, rb)
  }
  const groups = new Map<number, DaRoom[]>()
  for (const r of rooms) {
    if (!r.indoor) continue
    const g = find(r.id)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(r)
  }
  const buildings: DaBuilding[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const pad = 3
    const b: DaBuilding = {
      name: buildingName(members[0].title), outline: true, lx: 0, ly: 0, showLabel: false,
      rooms: members.map(m => m.id),
      x1: Math.min(...members.map(m => m.x - m.size / 2)) - pad,
      y1: Math.min(...members.map(m => m.y - m.size / 2)) - pad,
      x2: Math.max(...members.map(m => m.x + m.size / 2)) + pad,
      y2: Math.max(...members.map(m => m.y + m.size / 2)) + pad,
    }
    const idx = buildings.push(b) - 1
    for (const m of members) m.building = idx
  }
  // Outlines only where they wrap nothing else; Genie's own place names are
  // the labels, so none are added.
  placeLabelsAndOutlines(rooms, buildings, arcs, byId, { labels: false })

  const texts = zone.labels.filter(l => l.z === level && l.text).map(l => ({ text: l.text, x: l.x, y: l.y }))
  const xs = rooms.map(r => r.x).concat(texts.map(t => t.x)), ys = rooms.map(r => r.y).concat(texts.map(t => t.y))
  const bbox = rooms.length
    ? { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
    : { x1: 0, y1: 0, x2: 100, y2: 100 }

  const levels = genieLevels(zone)
  const name = zone.name + (levels.length > 1 ? (level === 0 ? '' : ` (floor ${level > 0 ? '+' : ''}${level})`) : '')
  return { image: genieAreaKey(zone.id, level), name, rooms, byId, byLich, arcs, buildings, bbox, texts, moves }
}
