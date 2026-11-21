// Graph map world layout — where each Genie zone sits in Elanthia (v1.1.0, DESIGN §19.20)
//
// Pure: takes the Genie zones, the bridge (graphBridge.ts) and Lich's rooms, and
// returns a position, province and neighbours for every zone, using the tables
// in worldData.ts. No React, no window; harnessed by tmp-graph-map.
//
// HOW A ZONE GETS ITS PLACE
//   1. Each matched room is located on its own: the Lich map's IMAGE NAME
//      carries the wiki map number ("Forfedhdar, 121, Boar Clan.gif"), which
//      names a town (MAP_PLACE) or a grid square (ZONE_GRID). Rooms whose image
//      has no number fall back to a place name found in Lich's `location` or in
//      the image name.
//   2. The zone sits at the average of its rooms, so a map that spans two
//      squares lands between them.
//   3. A zone with too few located rooms takes the average of the zones it
//      links to, if they are close together. Otherwise it goes on the SHELF
//      (events, arenas, the Transports hub): shown in a row, not on the land.
//   4. Bubbles that overlap are pushed apart a little, deterministically.
//
// INVARIANTS
//   - Genie file numbers are never used as wiki map numbers (they differ).
//   - Nothing here moves a ROOM. This is zone-level only.
//   - Same input, same layout: no randomness, zones visited in their given order.
//   - The data decides what KIND of trip a link is; WORLD_ROUTES only supplies
//     a better name for a trip the data already calls a boat, a swim or slow.

import type { GenieZone, LichRoom } from './components/panels/mapTypes'
import type { GraphBridge, ZoneLink } from './graphBridge'
import { isBoundaryNode } from './graphBridge'
import { runSliced, runSync, type Steps } from './timeSlice'
import {
  ZONE_GRID, WORLD_PLACES, MAP_PLACE, WORLD_ROUTES, GRID_SIZE, squarePos, placeById, squareByKey,
  type Pos, type Province, type RouteKind, type GridSquare, type WorldPlace,
} from './worldData'

export type LinkKind = RouteKind | 'portal'

export interface WorldZone {
  zoneId:   string
  file:     string
  name:     string
  pos:      Pos | null              // null: on the shelf
  anchor:   Pos | null              // where the data put it, before overlaps were eased
  radius:   number                  // bubble size, as a fraction of the world's width
  rooms:    number
  located:  number                  // rooms that could be placed on the world
  province: Province | null
  square:   string | null           // the grid square most of it is in
  squares:  string[]                // every square holding a fair share of it
  places:   string[]                // WORLD_PLACES ids it covers
  wikiMaps: string[]                // wiki map numbers its rooms come from, most rooms first
  placedBy: 'rooms' | 'neighbours' | 'shelf'
  /** The WORLD_PLACES id this zone IS (its name is the place's name). The
   *  view draws that place's label on this bubble, so the two can't disagree. */
  namesake?: string
  /** How step 3b settled it: 'place' = on its namesake's spot; 'side' =
   *  touching the bigger map it hangs off, on the side Genie draws it. */
  settled?: 'place' | 'side'
  /** The bigger map this one was packed beside (step 3b), when it was. */
  parent?: string
}

export interface WorldLink {
  a: string; b: string              // zone ids, a < b
  kind: LinkKind
  note: string                      // a few words naming the trip, '' for a plain road
  drawn: boolean                    // Genie draws this link (a boundary room); false = Lich or the Transports map only
}

export interface GraphWorld {
  zones: Map<string, WorldZone>
  links: WorldLink[]
  shelf: string[]                   // zone ids with no place on the land, in zone order
}

// ── Locating one room ─────────────────────────────────────────────────────────

/** The wiki map number in a Lich map image name, or null. Two naming styles are
 *  in use: "Province, 121, Name.gif" and "province-121-name-<stamp>.png". */
export function wikiMapOfImage(image: string | undefined): string | null {
  if (!image) return null
  const m = /^[^,]+,\s*(\d{1,3}[a-z]?)(?=[,\s])/i.exec(image) ?? /^[a-z]+-(?:map)?(\d{1,3}[a-z]?)-/i.exec(image)
  return m ? m[1].toLowerCase() : null
}

interface Spot { pos: Pos; square?: string; place?: string; province?: Province }

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A small whole number from a map's id (FNV-1a), the same every run. */
function idAngle(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) % 997
}

const SQUARES_BY_MAP = new Map<string, GridSquare[]>()
const SQUARES_BY_BASE = new Map<string, GridSquare[]>()
for (const s of ZONE_GRID) for (const m of s.maps) {
  let l = SQUARES_BY_MAP.get(m); if (!l) SQUARES_BY_MAP.set(m, l = []); l.push(s)
  const base = m.replace(/[a-z]$/, '')
  let b = SQUARES_BY_BASE.get(base); if (!b) SQUARES_BY_BASE.set(base, b = []); if (!b.includes(s)) b.push(s)
}

function spotOfPlace(id: string): Spot | null {
  const p = placeById(id)
  return p ? { pos: p.pos, square: p.square, place: p.id, province: p.province } : null
}

function spotOfSquares(list: GridSquare[]): Spot {
  if (list.length === 1) return { pos: squarePos(list[0]), square: list[0].key, province: list[0].province }
  let x = 0, y = 0
  for (const s of list) { const p = squarePos(s); x += p[0]; y += p[1] }
  return { pos: [x / list.length, y / list.length], square: list[0].key, province: list[0].province }
}

function spotOfMap(num: string): Spot | null {
  const place = MAP_PLACE[num]
  if (place) return spotOfPlace(place)
  const exact = SQUARES_BY_MAP.get(num)
  if (exact) return spotOfSquares(exact)
  const base = num.replace(/[a-z]$/, '')
  if (base !== num && MAP_PLACE[base]) return spotOfPlace(MAP_PLACE[base])
  const near = SQUARES_BY_BASE.get(base)
  return near ? spotOfSquares(near) : null
}

// Names a room's `location` or image may carry, longest first so "Tiger Clan"
// is tried before "Tiger". Short names are left out: they match by accident.
const NAME_SPOTS: { key: string; spot: Spot }[] = []
{
  const seen = new Set<string>()
  const add = (name: string, spot: Spot) => {
    const k = norm(name)
    if (k.length < 5 || seen.has(k)) return
    seen.add(k); NAME_SPOTS.push({ key: k, spot })
  }
  for (const p of WORLD_PLACES) {
    if (p.kind === 'water' || p.kind === 'region') continue
    const spot: Spot = { pos: p.pos, square: p.square, place: p.id, province: p.province }
    add(p.name, spot)
    for (const a of p.also ?? []) add(a, spot)
  }
  for (const s of ZONE_GRID) {
    const spot: Spot = { pos: squarePos(s), square: s.key, province: s.province }
    add(s.name, spot)
    for (const a of s.also ?? []) add(a, spot)
  }
  NAME_SPOTS.sort((a, b) => b.key.length - a.key.length || (a.key < b.key ? -1 : 1))
}

const textCache = new Map<string, Spot | null>()
function spotOfText(text: string | undefined): Spot | null {
  if (!text) return null
  let hit = textCache.get(text)
  if (hit !== undefined) return hit
  const t = norm(text)
  hit = null
  if (t.length >= 5) {
    for (const e of NAME_SPOTS) if (t === e.key) { hit = e.spot; break }
    if (!hit) for (const e of NAME_SPOTS) if (t.includes(e.key)) { hit = e.spot; break }
  }
  textCache.set(text, hit)
  return hit
}

/** Where one Lich room is in the world, or null when its data doesn't say. */
export function locateRoom(room: LichRoom): (Spot & { wikiMap: string | null }) | null {
  const num = wikiMapOfImage(room.image)
  const spot = (num ? spotOfMap(num) : null) ?? spotOfText(room.location) ?? spotOfText(room.image)
  return spot ? { ...spot, wikiMap: num } : null
}

// ── Link kinds ────────────────────────────────────────────────────────────────

// Words that mean you board something. Docks and piers are left out: you walk onto those.
const VESSEL_RE = /\b(ferry|barge|skiff|galley|gondola|mammoth|balloon|airship|dirigible|gangplank|boat|ship)\b/
const PORTAL_RE = /\b(portal|moongate|shimmering archway)\b/
// Swimming and real climbs. Stairs, steps and ladders are a climb in name only.
const EFFORT_RE = /^(?:rt )?(?:swim|dive|climb(?! .*\b(?:stair|stairs|staircase|stairway|step|steps|ladder)\b))\b/
const LONG_TRIP = 60   // seconds: past this a link is a ride, not a walk

/** What kind of trip a set of crossing commands and a travel time describe. */
export function classifyLink(allMoves: readonly string[], minTime: number | null): LinkKind {
  const moves = allMoves.filter(m => m && m !== 'none')
  if (moves.length && moves.every(m => PORTAL_RE.test(m))) return 'portal'
  if (moves.some(m => VESSEL_RE.test(m))) return 'vessel'
  if (moves.length && moves.every(m => EFFORT_RE.test(m))) return 'athletics'
  // A long travel time with no effort in it is a ride: a ferry, an airship, a
  // ship. Lich times those; Genie usually routes them through its Transports map.
  if (minTime != null && minTime >= LONG_TRIP) return 'vessel'
  if (minTime != null && minTime >= 8) return 'slow'
  return 'walk'
}

const titleCase = (s: string): string => s.replace(/\b[a-z]/g, c => c.toUpperCase())

/** A few words for a trip, from the commands that make it; '' when they say nothing useful. */
function noteFromMoves(kind: LinkKind, moves: readonly string[]): string {
  if (kind === 'walk' || kind === 'slow') return ''
  if (kind === 'athletics') {
    const pick = moves.find(m => /^(?:rt )?(?:swim|dive)\b/.test(m)) ?? moves.find(m => EFFORT_RE.test(m))
    return pick ? titleCase(pick.replace(/^rt /, '')) : ''
  }
  const pick = moves.find(m => (kind === 'vessel' ? VESSEL_RE : PORTAL_RE).test(m))
  return pick ? titleCase(pick.replace(/^(?:rt |go |join )/, '')) : ''
}

const DEFAULT_NOTE: Record<LinkKind, string> = {
  walk: '', slow: 'Slow going', vessel: 'A ride', athletics: 'Needs Athletics', portal: 'A portal',
}

// ── Building the world ────────────────────────────────────────────────────────

const SHARE = 0.15          // a square or place counts for a zone at this share of its located rooms
const NEAR_SPREAD = 0.22    // linked zones further apart than this can't place an unlocated zone between them
const NEAR_PARENT = 0.75 / 11 // a smaller linked map within this of a bigger one is drawn touching it (step 3b)
const GAP = 0.003
const MAX_DRIFT = 0.055     // how far easing overlaps may move a bubble from its true spot (about half a grid square)

// Bubble size grows with the square root of the room count, so AREA follows
// rooms: the Crossing (1,000 rooms) is about 0.027 across-half, a 20-room map 0.008.
function radiusFor(rooms: number): number { return 0.0045 + 0.0007 * Math.sqrt(Math.max(1, rooms)) }

const isHub = (z: GenieZone): boolean => /transport/i.test(z.sourceFile) || /transport/i.test(z.name)

function prettyName(z: GenieZone): string {
  const fromFile = z.sourceFile.replace(/\.xml$/i, '').replace(/^Map[0-9A-Za-z]*?_/, '').replace(/_/g, ' ').trim()
  return fromFile || z.name || z.id
}

/** Place every zone on the world, in one go. */
export function buildGraphWorld(zones: Map<string, GenieZone>, bridge: GraphBridge, lichById: Map<number, LichRoom>): GraphWorld {
  return runSync(worldSteps(zones, bridge, lichById))
}

/** The same, in slices of about BUDGET_MS so the window keeps drawing (timeSlice.ts). */
export function buildGraphWorldAsync(
  zones: Map<string, GenieZone>, bridge: GraphBridge, lichById: Map<number, LichRoom>, pause?: () => Promise<void>,
): Promise<GraphWorld> {
  return runSliced(worldSteps(zones, bridge, lichById), pause)
}

function* worldSteps(
  zones: Map<string, GenieZone>,
  bridge: GraphBridge,
  lichById: Map<number, LichRoom>,
): Steps<GraphWorld> {
  const out = new Map<string, WorldZone>()
  const hubs = new Set<string>()

  // 1 + 2: locate rooms, average per zone.
  let step = 0
  for (const [zoneId, zone] of zones) {
    yield
    const zb = bridge.zones.get(zoneId)
    const rooms = zb?.rooms ?? zone.nodes.filter(n => !isBoundaryNode(n)).length
    if (isHub(zone)) hubs.add(zoneId)
    let x = 0, y = 0, located = 0
    const squares = new Map<string, number>(), places = new Map<string, number>()
    const provinces = new Map<Province, number>(), maps = new Map<string, number>()
    if (zb) for (const m of zb.matches.values()) {
      if ((++step & 255) === 0) yield
      const room = lichById.get(m.lichId)
      const spot = room ? locateRoom(room) : null
      if (!spot) continue
      located++; x += spot.pos[0]; y += spot.pos[1]
      if (spot.square)   squares.set(spot.square, (squares.get(spot.square) ?? 0) + 1)
      if (spot.place)    places.set(spot.place, (places.get(spot.place) ?? 0) + 1)
      if (spot.province) provinces.set(spot.province, (provinces.get(spot.province) ?? 0) + 1)
      if (spot.wikiMap)  maps.set(spot.wikiMap, (maps.get(spot.wikiMap) ?? 0) + 1)
    }
    const top = <K,>(m: Map<K, number>): K[] => [...m].sort((p, q) => q[1] - p[1] || (String(p[0]) < String(q[0]) ? -1 : 1)).map(e => e[0])
    const fair = <K,>(m: Map<K, number>): K[] => top(m).filter(k => m.get(k)! >= located * SHARE)
    const enough = !hubs.has(zoneId) && (located >= 3 || (rooms > 0 && located / rooms >= 0.25))
    const anchor: Pos | null = enough ? [x / located, y / located] : null
    const sqList = enough ? fair(squares) : []
    const placeList = enough ? fair(places) : []
    // The square's best-known town counts as a place the zone covers.
    for (const k of sqList) { const p = squareByKey(k)?.place; if (p && !placeList.includes(p)) placeList.push(p) }
    out.set(zoneId, {
      zoneId, file: zone.sourceFile, name: prettyName(zone),
      pos: anchor, anchor, radius: radiusFor(rooms), rooms, located,
      province: enough ? (top(provinces)[0] ?? null) : null,
      square: sqList[0] ?? null, squares: sqList, places: placeList,
      wikiMaps: enough ? top(maps).slice(0, 6) : [],
      placedBy: enough ? 'rooms' : 'shelf',
    })
  }

  // 3: a zone the rooms couldn't place sits between the zones it links to.
  const linked = new Map<string, Set<string>>()
  for (const l of bridge.zoneLinks) {
    if (hubs.has(l.a) || hubs.has(l.b)) continue
    // A portal reaches anywhere; it says nothing about where a zone is.
    if (classifyLink(l.moves, l.minTime) === 'portal') continue
    if (!linked.has(l.a)) linked.set(l.a, new Set()); linked.get(l.a)!.add(l.b)
    if (!linked.has(l.b)) linked.set(l.b, new Set()); linked.get(l.b)!.add(l.a)
  }
  for (let pass = 0; pass < 2; pass++) {
    const moves: [WorldZone, Pos, WorldZone[]][] = []
    for (const z of out.values()) {
      if (z.pos || hubs.has(z.zoneId)) continue
      const near = [...(linked.get(z.zoneId) ?? [])].map(id => out.get(id)!).filter(o => o?.pos)
      if (!near.length) continue
      let spread = 0
      for (const p of near) for (const q of near) spread = Math.max(spread, Math.hypot(p.pos![0] - q.pos![0], p.pos![1] - q.pos![1]))
      if (spread > NEAR_SPREAD) continue
      let x = 0, y = 0
      for (const p of near) { x += p.pos![0]; y += p.pos![1] }
      moves.push([z, [x / near.length, y / near.length], near])
    }
    for (const [z, pos, near] of moves) {
      z.pos = z.anchor = pos; z.placedBy = 'neighbours'
      const big = near.slice().sort((p, q) => q.rooms - p.rooms)[0]
      z.province = big.province; z.square = big.square; z.squares = big.square ? [big.square] : []
    }
    if (!moves.length) break
  }

  // 3b: settle each map against its neighbours (Sekmeht's review: "if multiple
  // zones indicate the Crossing, they all belong pretty close together").
  // Two rules, in this order:
  //
  //   PLACE: a map NAMED after a place ("Boar Clan", "Throne City") sits on that
  //   place's spot, the one read off the official map, unless a bigger map
  //   already covers that spot (Tiger Clan's spot is inside the Crossing's
  //   bubble). Its rooms' average can wander a square away on a map that also
  //   holds the countryside, and then the bubble and its own name disagreed.
  //
  //   SIDE: a small map whose data puts it at or beside a bigger map it joins
  //   (every Crossing side map lands "at the Crossing"; a map known only by its
  //   grid square lands on the square's centre) is drawn TOUCHING that map, on
  //   the side Genie draws it: the bigger map's boundary rooms for it sit on its
  //   north edge, its east edge, and so on. Where Genie has no one side, it
  //   keeps the direction its data gave it, else takes the first free spot.
  //   Bigger maps first, so a chain (Crossing → West Gate → …) works out, and a
  //   spot already taken is skipped by turning round the parent in small steps.
  //
  // Before this, every "at the Crossing" map started on one point and the
  // overlap easing threw them out in arbitrary directions: Tiger Clan ended up
  // south-east of the Crossing, half a square from its own name.
  const genieSide = new Map<string, Map<string, [number, number]>>()   // big → small → unit vector
  for (const big of out.values()) {
    const gz = zones.get(big.zoneId), zb = bridge.zones.get(big.zoneId)
    if (!big.pos || !gz || !zb || gz.nodes.length < 2) continue
    yield
    let cx = 0, cy = 0
    for (const n of gz.nodes) { cx += n.x; cy += n.y }
    cx /= gz.nodes.length; cy /= gz.nodes.length
    const nodeById = new Map(gz.nodes.map(n => [n.id, n]))
    const dirs = new Map<string, [number, number, number]>()
    for (const e of zb.exits) {
      if (e.via !== 'genie') continue
      const n = nodeById.get(e.nodeId)
      if (!n) continue
      const dx = n.x - cx, dy = n.y - cy, len = Math.hypot(dx, dy)
      if (len < 1) continue
      const acc = dirs.get(e.toZone) ?? [0, 0, 0]
      acc[0] += dx / len; acc[1] += dy / len; acc[2]++
      dirs.set(e.toZone, acc)
    }
    const sides = new Map<string, [number, number]>()
    for (const [to, [sx, sy, count]] of dirs) {
      const len = Math.hypot(sx, sy)
      // Exits on opposite edges cancel out: then Genie has no one side to offer.
      if (len / count >= 0.35) sides.set(to, [sx / len, sy / len])
    }
    genieSide.set(big.zoneId, sides)
  }
  const dist = (a: Pos, b: Pos) => Math.hypot(a[0] - b[0], a[1] - b[1])

  // PLACE.
  const placeByName = new Map<string, WorldPlace>()
  for (const p of WORLD_PLACES) {
    if (p.kind === 'water' || p.kind === 'region') continue
    for (const n of [p.name, p.name.replace(/^the /i, '')]) if (!placeByName.has(norm(n))) placeByName.set(norm(n), p)
  }
  const pinned = new Set<string>()
  // A named map whose place is under a bigger map's bubble (Tiger Clan's spot
  // is inside the Crossing's) goes beside that map, on the label's side.
  const aim = new Map<string, { parent: string; dir: [number, number] }>()
  for (const z of out.values()) {
    // The place's own name, not its other spellings: Ratha's include "Reshalia
    // Trade Road", which is a road out of Ratha, not Ratha. "X Village" is X.
    const p = placeByName.get(norm(z.name)) ?? placeByName.get(norm(z.name.replace(/ village$/i, '')))
    if (!p || !z.pos || hubs.has(z.zoneId)) continue
    // Far from where its rooms say: then the name is a coincidence, not this place.
    if (z.anchor && dist(z.anchor, p.pos) > 2.5 / 11) continue
    z.namesake = p.id
    let cover: WorldZone | null = null
    for (const o of out.values()) {
      if (o !== z && o.anchor && o.rooms > z.rooms && dist(o.anchor, p.pos) < o.radius + z.radius && (!cover || o.rooms > cover.rooms)) cover = o
    }
    if (cover) {
      aim.set(z.zoneId, { parent: cover.zoneId, dir: [p.pos[0] - cover.anchor![0], p.pos[1] - cover.anchor![1]] })
      continue
    }
    z.anchor = z.pos = [p.pos[0], p.pos[1]]
    z.settled = 'place'
    pinned.add(z.zoneId)
  }

  // SIDE. Parents are picked on the data's own positions, before anything moves.
  // In order: the town a map is NAMED after ("Crossing Temple", "Riverhaven
  // North Gate", "Shard West Gate": a gate road's bubble sits at its gate even
  // when the road runs on for a square or more, with its links showing where it
  // goes); then a map Genie draws it beside; then the biggest nearby map.
  const parentOf = new Map<string, string>()
  const familyOf = (z: WorldZone): WorldZone | null => {
    let best: WorldZone | null = null
    for (const y of out.values()) {
      if (y === z || !y.anchor || y.rooms <= z.rooms || hubs.has(y.zoneId)) continue
      const n = y.name.toLowerCase()
      if (!z.name.toLowerCase().startsWith(n + ' ')) continue
      if (dist(y.anchor, z.anchor!) > 2 / 11) continue
      if (!best || n.length > best.name.length) best = y
    }
    return best
  }
  for (const z of out.values()) {
    if (!z.anchor || pinned.has(z.zoneId) || hubs.has(z.zoneId)) continue
    const aimed = aim.get(z.zoneId)
    if (aimed) { parentOf.set(z.zoneId, aimed.parent); continue }
    const fam = familyOf(z)
    if (fam) { parentOf.set(z.zoneId, fam.zoneId); continue }
    let best: WorldZone | null = null, bestKey = -1
    for (const id of linked.get(z.zoneId) ?? []) {
      const y = out.get(id)
      if (!y?.anchor || y.rooms <= z.rooms || dist(y.anchor, z.anchor) > NEAR_PARENT) continue
      const key = (genieSide.get(y.zoneId)?.has(z.zoneId) ? 1e7 : 0) + y.rooms
      if (key > bestKey) { best = y; bestKey = key }
    }
    // Not linked to anything near, but its data puts it inside a bigger map's
    // bubble (Vineyard "at the Crossing", Maelshyve's Fortress at Zaulfung):
    // drawn touching that map, or the easing throws it out in any direction.
    if (!best) for (const y of out.values()) {
      if (y === z || !y.anchor || y.rooms <= z.rooms || hubs.has(y.zoneId)) continue
      if (dist(y.anchor, z.anchor) < y.radius + z.radius && (!best || y.rooms > best.rooms)) best = y
    }
    if (best) parentOf.set(z.zoneId, best.zoneId)
  }
  const children = new Map<string, WorldZone[]>()
  for (const [c, p] of parentOf) { let l = children.get(p); if (!l) children.set(p, l = []); l.push(out.get(c)!) }
  // Everything that is NOT waiting to be packed holds its spot and blocks it.
  for (const [c, p] of parentOf) out.get(c)!.parent = p
  const settledList: WorldZone[] = [...out.values()].filter(z => z.pos && !parentOf.has(z.zoneId))
  const free = (pos: Pos, z: WorldZone) => settledList.every(o => o === z || dist(o.pos!, pos) >= o.radius + z.radius + GAP * 0.5)
  const bySize = [...out.values()].filter(z => z.pos).sort((a, b) => b.rooms - a.rooms || (a.zoneId < b.zoneId ? -1 : 1))
  for (const big of bySize) {
    const kids = children.get(big.zoneId)
    if (!kids) continue
    yield
    // Biggest first round the parent, so the small ones fill the gaps.
    for (const z of kids.sort((a, b) => b.rooms - a.rooms || (a.zoneId < b.zoneId ? -1 : 1))) {
      const g = genieSide.get(big.zoneId)?.get(z.zoneId)
      const off: [number, number] = [z.anchor![0] - big.anchor![0], z.anchor![1] - big.anchor![1]]
      const offLen = Math.hypot(off[0], off[1])
      const aimed = aim.get(z.zoneId)
      const base = aimed ? Math.atan2(aimed.dir[1], aimed.dir[0])
        : g ? Math.atan2(g[1], g[0])
        : offLen > big.radius * 0.5 ? Math.atan2(off[1], off[0])
        // No side from anything: an angle from the map's own id, so it stays put
        // when an unrelated town moves. It used to come from how many maps were
        // already placed, which reshuffled side maps all over the world.
        : (idAngle(z.zoneId) * 2.399963) % (Math.PI * 2)
      // The right SIDE matters more than touching: within 24° of it on the
      // first ring or one out, then within 60° on the first three rings, and
      // only then anywhere round the first ring. Around a busy city (the Crossing has fifteen side
      // maps) turning all the way round put Jadewater Mansion south of the
      // Crossing when Genie draws it north.
      let spot: Pos | null = null
      const tryRing = (ring: number, maxK: number) => {
        const r = big.radius + z.radius + GAP + ring * z.radius * 2
        for (let k = 0; k <= maxK && !spot; k++) {
          const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 15)
          const at: Pos = [big.anchor![0] + Math.cos(a) * r, big.anchor![1] + Math.sin(a) * r]
          if (free(at, z)) spot = at
        }
      }
      // A map whose own label says which way it lies (Tiger Clan) keeps that
      // direction even a ring further out; the rest stay close and turn a bit.
      const order = aimed ? [[0, 4], [1, 4], [2, 4], [0, 10], [1, 10], [2, 10]] : [[0, 4], [1, 4], [0, 10], [1, 10], [2, 10]]
      for (const [ring, maxK] of order) if (!spot) tryRing(ring, maxK)
      if (!spot) tryRing(0, 30)   // anywhere
      z.anchor = z.pos = spot ?? [big.anchor![0] + Math.cos(base) * (big.radius + z.radius + GAP), big.anchor![1] + Math.sin(base) * (big.radius + z.radius + GAP)]
      z.settled = 'side'
      settledList.push(z)
    }
  }

  // 4: ease overlaps. Each round every overlapping pair pushes apart (the pushes
  // are summed first, then applied, so the order of pairs doesn't matter), then
  // each bubble is pulled a little way home. A bubble may never end more than
  // MAX_DRIFT from where the data put it: around a city the side maps are
  // allowed to touch rather than be thrown into the next province.
  const placed = [...out.values()].filter(z => z.pos)
  const p = placed.map(z => [z.pos![0], z.pos![1]] as [number, number])
  for (let it = 0; it < 200; it++) {
    yield
    const f = placed.map(() => [0, 0] as [number, number])
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      let dx = p[j][0] - p[i][0], dy = p[j][1] - p[i][1]
      let d = Math.hypot(dx, dy)
      const min = placed[i].radius + placed[j].radius + GAP
      if (d >= min) continue
      if (d < 1e-6) { const a = (i * 2.399963 + j * 0.61803) % (Math.PI * 2); dx = Math.cos(a); dy = Math.sin(a); d = 1 }
      // By area, the bigger bubble moves less: a city stays put, its side maps
      // move. A map on its own place's spot never moves (step 3b, PLACE).
      const fi = pinned.has(placed[i].zoneId), fj = pinned.has(placed[j].zoneId)
      if (fi && fj) continue
      const ai = placed[i].radius ** 2, aj = placed[j].radius ** 2
      const wi = fi ? 0 : fj ? 1 : aj / (ai + aj)
      const push = (min - d) / d * 0.5
      f[i][0] -= dx * push * wi;       f[i][1] -= dy * push * wi
      f[j][0] += dx * push * (1 - wi); f[j][1] += dy * push * (1 - wi)
    }
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i].anchor!
      let x = p[i][0] + f[i][0], y = p[i][1] + f[i][1]
      x += (a[0] - x) * 0.03; y += (a[1] - y) * 0.03
      const off = Math.hypot(x - a[0], y - a[1])
      if (off > MAX_DRIFT) { x = a[0] + (x - a[0]) * MAX_DRIFT / off; y = a[1] + (y - a[1]) * MAX_DRIFT / off }
      p[i][0] = Math.min(0.985, Math.max(0.015, x)); p[i][1] = Math.min(0.985, Math.max(0.015, y))
    }
  }
  placed.forEach((z, i) => { z.pos = [Number(p[i][0].toFixed(4)), Number(p[i][1].toFixed(4))] })

  const shelf: string[] = []
  for (const z of out.values()) if (!z.pos) { z.placedBy = 'shelf'; shelf.push(z.zoneId) }

  // Links. Rides through the Transports map join the zones on each vessel.
  const links = new Map<string, WorldLink>()
  const put = (a: string, b: string, kind: LinkKind, note: string, drawn: boolean) => {
    if (a === b || !out.get(a)?.pos || !out.get(b)?.pos) return
    const [x, y] = a < b ? [a, b] : [b, a]
    const k = `${x}\u0000${y}`
    const prev = links.get(k)
    // A road beats nothing; a named ride is added to a road's note but a road stays a road.
    if (!prev) { links.set(k, { a: x, b: y, kind, note, drawn }); return }
    if (prev.kind === 'walk' || kind === prev.kind) { if (!prev.note && note) prev.note = note; prev.drawn ||= drawn; return }
    if (kind === 'walk') { prev.kind = 'walk'; prev.note = ''; prev.drawn ||= drawn }
  }
  const routesBetween = (a: WorldZone, b: WorldZone) => WORLD_ROUTES.filter(r =>
    (a.places.includes(r.a) && b.places.includes(r.b)) || (a.places.includes(r.b) && b.places.includes(r.a)))
  const routeNote = (a: WorldZone, b: WorldZone, kind: LinkKind): string =>
    routesBetween(a, b).find(r => r.kind === kind)?.note ?? ''
  for (const l of bridge.zoneLinks) {
    if (hubs.has(l.a) || hubs.has(l.b)) continue
    const za = out.get(l.a), zb = out.get(l.b)
    if (!za || !zb) continue
    let kind = classifyLink(l.moves, l.minTime)
    // When all the data knows is that the trip is long, the Travel map's own
    // word for this pair of places says what kind of long trip it is.
    if ((kind === 'vessel' || kind === 'slow') && !l.moves.some(m => VESSEL_RE.test(m)) && !routeNote(za, zb, kind)) {
      const named = routesBetween(za, zb)
      if (named.length && named.every(r => r.kind === named[0].kind)) kind = named[0].kind
    }
    put(l.a, l.b, kind, kind === 'walk' ? '' : (routeNote(za, zb, kind) || noteFromMoves(kind, l.moves)), l.genie > 0)
  }
  for (const hubId of hubs) for (const ride of hubRides(zones.get(hubId)!, zones)) {
    for (let i = 0; i < ride.zones.length; i++) for (let j = i + 1; j < ride.zones.length; j++) {
      const za = out.get(ride.zones[i]), zb = out.get(ride.zones[j])
      if (!za || !zb) continue
      put(za.zoneId, zb.zoneId, 'vessel', routeNote(za, zb, 'vessel') || ride.name, false)
    }
  }
  for (const l of links.values()) if (!l.note) l.note = DEFAULT_NOTE[l.kind]
  const list = [...links.values()].sort((u, v) => u.a === v.a ? (u.b < v.b ? -1 : 1) : (u.a < v.a ? -1 : 1))
  return { zones: out, links: list, shelf }
}

/** The vessels in Genie's Transports map: each group of joined rooms is one
 *  ride, and its boundary rooms name the zones it calls at. */
export function hubRides(hub: GenieZone, zones: Map<string, GenieZone>): { name: string; zones: string[] }[] {
  const fileToZone = new Map<string, string>()
  for (const [id, z] of zones) fileToZone.set(z.sourceFile.toLowerCase(), id)
  const byId = new Map(hub.nodes.map(n => [n.id, n]))
  const adj = new Map<number, Set<number>>()
  const join = (a: number, b: number) => {
    if (!byId.has(a) || !byId.has(b)) return
    if (!adj.has(a)) adj.set(a, new Set()); adj.get(a)!.add(b)
    if (!adj.has(b)) adj.set(b, new Set()); adj.get(b)!.add(a)
  }
  for (const n of hub.nodes) for (const a of n.arcs) join(n.id, a.destination)
  const seen = new Set<number>()
  const rides: { name: string; zones: string[] }[] = []
  for (const start of hub.nodes) {
    if (seen.has(start.id)) continue
    const group: number[] = []
    const stack = [start.id]
    seen.add(start.id)
    while (stack.length) {
      const id = stack.pop()!
      group.push(id)
      for (const o of adj.get(id) ?? []) if (!seen.has(o)) { seen.add(o); stack.push(o) }
    }
    const calls: string[] = []
    let name = ''
    for (const id of group) {
      const n = byId.get(id)!
      if (isBoundaryNode(n)) {
        const file = (n.note ?? '').split('|').map(s => s.trim().toLowerCase()).find(s => s.endsWith('.xml'))
        const z = file ? fileToZone.get(file) : undefined
        if (z && !calls.includes(z)) calls.push(z)
      } else if (!name) name = n.name
    }
    if (calls.length >= 2) rides.push({ name: name.replace(/^\[+|\]+$/g, '').split(',')[0].trim() || 'A ride', zones: calls })
  }
  return rides
}

// ── Reading the layout ────────────────────────────────────────────────────────

/** The grid cell a position falls in, as the wiki counts it (y up from the bottom). */
export function cellOf(pos: Pos): { x: number; y: number } {
  const c = (v: number) => Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(v * GRID_SIZE)))
  return { x: c(pos[0]), y: GRID_SIZE - 1 - c(pos[1]) }
}

/** Whole zones between two positions by the wiki's rule (straight line, rounded down). */
export function zonesApart(a: Pos, b: Pos): number {
  const p = cellOf(a), q = cellOf(b)
  return Math.floor(Math.hypot(p.x - q.x, p.y - q.y))
}

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const

/** The compass direction from one position to another (screen y grows southward). */
export function directionTo(from: Pos, to: Pos): typeof COMPASS[number] {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0])
  return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]
}

// ── Roads: the world view's links, decluttered ───────────────────────────────
//
// Drawing every link at once was "information overload" (Sekmeht): 122 lines,
// a ring of spokes round every city and long boat lines over the land. So the
// view draws ROADS between STOPS. A stop is a town or a big map, together with
// the small maps packed round it (its gates, tunnels, temple). Links inside a
// stop are LOCAL and drawn only when zoomed in; links between stops become one
// road per pair and kind; boats one faint curve per pair. Pointing at a map
// still shows every one of its own links.

/** The stop a zone belongs to: follow `parent` up, stopping at a zone named
 *  after a place (Tiger Clan is its own stop even though it is packed beside
 *  the Crossing). */
export function stopOf(world: GraphWorld, zoneId: string): string {
  let z = world.zones.get(zoneId)
  const seen = new Set<string>()
  while (z && z.parent && !z.namesake && !seen.has(z.zoneId)) {
    seen.add(z.zoneId)
    z = world.zones.get(z.parent)
  }
  return z?.zoneId ?? zoneId
}

export interface WorldRoad {
  a: string; b: string        // STOP zone ids, a < b
  kind: LinkKind              // walk / athletics / slow / vessel
  notes: string[]             // the different trips this road stands for, '' left out
  links: WorldLink[]          // the zone links behind it
}

export interface WorldRoads {
  roads: WorldRoad[]          // between stops, by land
  boats: WorldRoad[]          // between stops, by water or air
  local: WorldLink[]          // inside a stop
}

/** Group the world's links into roads, boats and local links. Portals and links
 *  to event maps are left out entirely (the view draws them only for the map you
 *  point at). Both ends
 *  must be on the land; a link to a map on the shelf has nowhere to go. */
export function worldRoads(world: GraphWorld): WorldRoads {
  const roads = new Map<string, WorldRoad>(), boats = new Map<string, WorldRoad>()
  const local: WorldLink[] = []
  // A map where paid quest events are held (Hollow Eve at Andreshlew) is joined
  // to its town by an ordinary exit, but it's a seasonal event, not a highway:
  // drawn as a bold road it ran from the Crossing straight across the sea.
  const event = (id: string) => !!world.zones.get(id)?.places.some(p => placeById(p)?.kind === 'quest')
  for (const l of world.links) {
    if (l.kind === 'portal') continue
    if (!world.zones.get(l.a)?.pos || !world.zones.get(l.b)?.pos) continue
    if (event(l.a) || event(l.b)) continue
    const sa = stopOf(world, l.a), sb = stopOf(world, l.b)
    if (sa === sb) { local.push(l); continue }
    const [a, b] = sa < sb ? [sa, sb] : [sb, sa]
    const into = l.kind === 'vessel' ? boats : roads
    const key = `${a}|${b}|${l.kind}`
    let r = into.get(key)
    if (!r) into.set(key, r = { a, b, kind: l.kind, notes: [], links: [] })
    r.links.push(l)
    if (l.note && !r.notes.includes(l.note)) r.notes.push(l.note)
  }
  // A walking road between two stops makes a slow one between the same two
  // redundant on the map (the walk is the road); a swim stays, as a shortcut.
  for (const [key, r] of roads) {
    if (r.kind === 'slow' && roads.has(`${r.a}|${r.b}|walk`)) roads.delete(key)
  }
  return { roads: [...roads.values()], boats: [...boats.values()], local }
}

export type { ZoneLink }
