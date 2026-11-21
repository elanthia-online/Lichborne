// Graph map atlas — what is where, and how far (v1.1.0, DESIGN §19.20)
//
// Pure helpers behind the Graph map's Find box. No React, no window.
//
// FIND: `buildAtlas` merges two sources into one list of "things", each a name
// and the Lich room ids that have it:
//   - rows main read from Lich's data files (hunting grounds, forage, town
//     services, shrines, mining, lumber, practice spots) — `MapDataRow`;
//   - the Lich map's own room `tags` (minus bookkeeping tags).
// A tag that names the same thing as a data row ("plague_wraiths", "jadice
// flower") is folded into that row, so nothing is listed twice. With no data
// files at all the atlas is just the tags, and still works.
//
// TRAVEL TIME: `travelTimes` is a shortest-path sweep over Lich's own links and
// their travel times from one room. It only RANKS rooms (which found room is
// nearest, for Find's Go button); the seconds are too rough to show, so the
// Travel time lens that coloured rooms by them was removed during v1.1.0
// testing. It never walks anyone (Lich's go2 does that). A link whose time Lich works out with a
// script snippet (premium, guild or quest routes) can't be known here, since
// Lichborne runs no scripts, so those links are left out and counted.
//
// Every room id here is a LICH id (the map's `id`), not the game's uid.

import type { LichRoom } from './components/panels/mapTypes'
import type { MapDataCategory, MapDataRow } from '../shared/types'
import { runSliced, runSync, type Steps } from './timeSlice'

export type ThingCategory = MapDataCategory | 'tag'

export interface Thing {
  id:       string
  category: ThingCategory
  name:     string
  town?:    string
  rooms:    number[]
  note?:    string
}

export interface Atlas {
  things:    Thing[]
  byId:      Map<string, Thing>
  /** Lich room id → the things found there. */
  inRoom:    Map<number, Thing[]>
  /** Which categories came from Lich's data files (the rest is map tags only). */
  fromFiles: Set<ThingCategory>
}

export const CATEGORY_LABEL: Record<ThingCategory, string> = {
  hunting: 'Hunting ground', forage: 'Forage', town: 'Town service', shrine: 'Shrine',
  mining: 'Mining', lumber: 'Lumber', climbing: 'Climbing', swimming: 'Swimming', tag: 'Lich tag',
}

// Listing order when two things match a search equally well.
const CATEGORY_RANK: Record<ThingCategory, number> = {
  town: 0, hunting: 1, forage: 2, shrine: 3, mining: 4, lumber: 5, climbing: 6, swimming: 7, tag: 8,
}

/** One spelling for comparing names: lower case, "_" as a space, single spaces. */
export function thingKey(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

// Tags that are the map's own bookkeeping, not something to look for.
const SKIP_TAG = /^(meta:|lich-map-|urchin-)/i

/** Build the atlas in one go. */
export function buildAtlas(rows: readonly MapDataRow[], lichRooms: Iterable<LichRoom>): Atlas {
  return runSync(atlasSteps(rows, lichRooms))
}

/** The same, in slices of about BUDGET_MS so the window keeps drawing (timeSlice.ts). */
export function buildAtlasAsync(rows: readonly MapDataRow[], lichRooms: Iterable<LichRoom>, pause?: () => Promise<void>): Promise<Atlas> {
  return runSliced(atlasSteps(rows, lichRooms), pause)
}

function* atlasSteps(rows: readonly MapDataRow[], lichRooms: Iterable<LichRoom>): Steps<Atlas> {
  const byId = new Map<string, Thing>()
  const fromFiles = new Set<ThingCategory>()
  // Things a map tag may fold into: by name alone, town left out.
  const foldable = new Map<string, Thing>()
  // Each thing's rooms as a set while building: a forage item lists a thousand
  // rooms, and checking an array for each one was quadratic.
  const roomSets = new Map<Thing, Set<number>>()
  const addRoom = (t: Thing, id: number) => {
    let s = roomSets.get(t)
    if (!s) roomSets.set(t, s = new Set(t.rooms))
    if (!s.has(id)) { s.add(id); t.rooms.push(id) }
  }

  let step = 0
  for (const r of rows) {
    if ((++step & 63) === 0) yield
    if (!r.rooms?.length || !r.name) continue
    const id = `${r.category}:${thingKey(r.town ?? '')}:${thingKey(r.name)}`
    let t = byId.get(id)
    if (!t) {
      byId.set(id, t = { id, category: r.category, name: r.name, town: r.town, rooms: [], note: r.note })
      if (r.category === 'forage' || r.category === 'hunting') foldable.set(thingKey(r.name), t)
    }
    for (const room of r.rooms) addRoom(t, room)
    fromFiles.add(r.category)
  }

  const tagRooms = new Map<string, { name: string; rooms: Set<number> }>()
  for (const room of lichRooms) {
    if ((++step & 1023) === 0) yield
    if (typeof room?.id !== 'number' || !room.tags?.length) continue
    for (const tag of room.tags) {
      if (typeof tag !== 'string' || !tag.trim() || SKIP_TAG.test(tag)) continue
      const key = thingKey(tag)
      let e = tagRooms.get(key)
      if (!e) tagRooms.set(key, e = { name: tag.replace(/_/g, ' ').trim(), rooms: new Set() })
      e.rooms.add(room.id)
    }
  }
  for (const [key, e] of tagRooms) {
    if ((++step & 127) === 0) yield
    const into = foldable.get(key)
    if (into) {
      for (const id of e.rooms) addRoom(into, id)
      continue
    }
    const id = `tag::${key}`
    byId.set(id, { id, category: 'tag', name: e.name, rooms: [...e.rooms] })
  }
  yield

  // Sort keys worked out once, not once per comparison.
  const keyOf = new Map<Thing, string>()
  for (const t of byId.values()) keyOf.set(t, thingKey(t.name))
  const things = [...byId.values()].sort((a, b) =>
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || keyOf.get(a)!.localeCompare(keyOf.get(b)!) || (a.town ?? '').localeCompare(b.town ?? ''))
  yield
  const inRoom = new Map<number, Thing[]>()
  for (const t of things) {
    if ((++step & 63) === 0) yield
    for (const id of t.rooms) {
      let l = inRoom.get(id)
      if (!l) inRoom.set(id, l = [])
      l.push(t)
    }
  }
  return { things, byId, inRoom, fromFiles }
}

/** "Gemshop · Crossing" / "Plague wraiths · ranks 90-130". */
export function thingLabel(t: Thing): string {
  return [t.name, t.town, t.note].filter(Boolean).join(' · ')
}

/** Things matching what was typed, best first. Every word typed must appear
 *  in the name, the town or the category; a name that STARTS with the text wins. */
export function searchAtlas(atlas: Atlas, query: string, limit = 12): Thing[] {
  const q = thingKey(query)
  if (!q) return []
  const words = q.split(' ')
  const scored: [number, Thing][] = []
  for (const t of atlas.things) {
    const name = thingKey(t.name), town = thingKey(t.town ?? ''), cat = CATEGORY_LABEL[t.category].toLowerCase()
    const hay = `${name} ${town} ${cat}`
    if (!words.every(w => hay.includes(w))) continue
    let score = 0
    if (name === q) score = 100
    else if (name.startsWith(q)) score = 80
    else if (name.split(' ').some(w => w.startsWith(words[0]))) score = 60
    else if (name.includes(q)) score = 40
    else score = 20
    // A real place beats a bare tag of the same quality; more rooms is a mild tiebreak.
    score -= CATEGORY_RANK[t.category]
    score += Math.min(4, Math.log10(t.rooms.length + 1))
    scored.push([score, t])
  }
  scored.sort((a, b) => b[0] - a[0] || thingKey(a[1].name).localeCompare(thingKey(b[1].name)) || (a[1].town ?? '').localeCompare(b[1].town ?? ''))
  return scored.slice(0, limit).map(e => e[1])
}

// ── Travel time ───────────────────────────────────────────────────────────────

export interface TravelTimes {
  /** Lich room id → seconds from the start, for every room that can be reached. */
  seconds: Map<number, number>
  /** Links left out because Lich works their time out with a script. */
  skipped: number
}

const DEFAULT_STEP = 0.2   // Lich's own default for a link with no time

/** Seconds from `fromId` to every room Lich can route to, by its own times.
 *  `scriptedCost`: count a link whose time Lich works out with a script (boats,
 *  premium, guild and quest routes) at this many seconds instead of leaving it
 *  out. For RANKING only (Go's nearest room): go2 itself runs those scripts, so
 *  leaving them out made whole regions look unreachable. A link Lich marks as
 *  closed (`null`) is always left out.
 *  `stopAt`: stop as soon as one of these rooms is reached. Rooms come off the
 *  queue nearest first, so that room IS the nearest of them, and the search
 *  needn't cover the whole world (a sweep of ~52k rooms ran on the window's
 *  thread each time you stopped with Find on). `seconds` then holds only the
 *  rooms reached so far. */
export function travelTimes(lichById: Map<number, LichRoom>, fromId: number, opts?: { scriptedCost?: number; stopAt?: ReadonlySet<number> }): TravelTimes {
  const scriptedCost = opts?.scriptedCost
  const stopAt = opts?.stopAt
  const seconds = new Map<number, number>()
  let skipped = 0
  if (!lichById.has(fromId)) return { seconds, skipped }
  // A small binary heap of [seconds, room id].
  const heap: [number, number][] = [[0, fromId]]
  const push = (e: [number, number]) => {
    heap.push(e)
    let i = heap.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
  }
  const pop = (): [number, number] => {
    const top = heap[0], last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]; i = m
      }
    }
    return top
  }
  const best = new Map<number, number>([[fromId, 0]])
  while (heap.length) {
    const [d, id] = pop()
    if (seconds.has(id)) continue
    seconds.set(id, d)
    if (stopAt?.has(id)) break
    const room = lichById.get(id)
    if (!room?.wayto) continue
    for (const [destStr, cmd] of Object.entries(room.wayto)) {
      const dest = Number(destStr)
      if (seconds.has(dest) || !lichById.has(dest)) continue
      const raw = room.timeto?.[destStr] as unknown
      // A script snippet for the move or its time: Lich decides at run time.
      const scripted = typeof raw === 'string' || (typeof cmd === 'string' && cmd.trimStart().startsWith(';e') && typeof raw !== 'number')
      if (raw === null || (scripted && scriptedCost == null)) { skipped++; continue }
      const step = scripted ? scriptedCost! : typeof raw === 'number' && raw >= 0 ? raw : DEFAULT_STEP
      const nd = d + step
      const prev = best.get(dest)
      if (prev == null || nd < prev) { best.set(dest, nd); push([nd, dest]) }
    }
  }
  return { seconds, skipped }
}

