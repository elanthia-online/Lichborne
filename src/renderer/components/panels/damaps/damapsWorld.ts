// Da'Maps — its own map.
//
// Da'Maps' map of the world (a DaWorldFile, worldFile.ts) holds every area,
// every room square with its position, colour and Lich room id, the lines
// between them, the place names and the building outlines. It is built here,
// in the app, from two things:
//   - the .damap maps, downloaded from the Da'Maps repository on GitHub into
//     Lichborne's own data folder (main/damapsDownload.ts), so a map fix
//     reaches players without a new Lichborne release;
//   - the player's own Lich map, which every square is matched against.
// The build (build/buildWorld.ts) is time-sliced so the window keeps drawing,
// and the result is kept until either input changes: a new download (the
// maps' commit or install time) or a reloaded Lich map (a new lichDb object).
// Every Da'Maps view asks for it with the same two, so they share one build.
//
// At run time each square is filled in from the Lich room it carries (indoor,
// forage, hunting, services, exits), which is also what the forage notes
// and `;go2` use.

import type { LichRoom } from '../mapTypes'
import { lichTitle } from '../mapTypes'
import {
  type DaArea, type DaArc, type DaArcCategory, type DaBuilding, type DaRoom,
  splitTags, isIndoor,
} from './daMapsData'
import type { DaWorldArea, DaWorldFile } from './worldFile'
import { buildWorldSteps, type BuildResult } from './build/buildWorld'
import { runSliced } from '../../../timeSlice'

export * from './worldFile'

/** square size on Da'Maps' map, in map units */
export const DA_ROOM_SIZE = 8

const CATS: DaArcCategory[] = ['cardinal', 'climb', 'go']

export interface DaWorld {
  file: DaWorldFile
  byKey: Map<string, DaWorldArea>
  /** Lich room id → every area key it's drawn in */
  keysOf: Map<number, string[]>
  /** one area per map for Global: each map's ground floor */
  globalKeys: string[]
}

function readJson(url: string): Promise<unknown> {
  // XHR, not fetch: fetch of a file:// resource is unreliable in Electron.
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('GET', url)
    x.responseType = 'text'
    x.onload = () => {
      if (x.status !== 0 && x.status !== 200) { reject(new Error(`HTTP ${x.status}`)); return }
      try { resolve(JSON.parse(x.responseText)) } catch (e) { reject(e) }
    }
    x.onerror = () => reject(new Error(`couldn't read ${url}`))
    x.send()
  })
}

let built: { lichDb: Map<number, LichRoom>; stamp: string; promise: Promise<DaWorld | null> } | null = null

/** Which download the maps are. */
function statusStamp(s: { installed: boolean; commit: string | null; installedAt: number | null; maps: number | null }): string {
  // The commit when the download had one (an Update that found nothing new
  // then rebuilds nothing), else the install time.
  return s.installed ? `${s.commit ?? s.installedAt ?? ''}|${s.maps ?? ''}` : ''
}

/**
 * Da'Maps' map, built from the downloaded maps and this Lich map. Null when no
 * maps are downloaded yet. Built once per (maps, Lich map); every Da'Maps view
 * shares it.
 */
export function loadDaWorld(lichDb: Map<number, LichRoom>): Promise<DaWorld | null> {
  return window.api.daMapsStatus().then(status => {
    const stamp = statusStamp(status)
    if (built && built.lichDb === lichDb && built.stamp === stamp) return built.promise
    const promise = !status.installed ? Promise.resolve(null) : window.api.daMapsRead().then(async ({ status: s, files }) => {
      if (!files.length) return null
      const r: BuildResult = await runSliced(buildWorldSteps({
        damaps: files, lichDb,
        sources: { maps: `${files.length} .damap maps${s.commit ? ` (${s.commit.slice(0, 7)})` : ''}`, lich: `${lichDb.size} rooms` },
      }))
      for (const line of r.log) console.warn(`[Da'Maps] ${line}`)
      return indexWorld(r.file)
    })
    const entry = { lichDb, stamp, promise }
    built = entry
    promise.catch(() => { if (built === entry) built = null })
    return promise
  })
}

function indexWorld(file: DaWorldFile): DaWorld {
  const byKey = new Map(file.areas.map(a => [a.key, a]))
  const keysOf = new Map<number, string[]>()
  for (const a of file.areas) for (const r of a.rooms) {
    if (!r[1]) continue
    if (!keysOf.has(r[1])) keysOf.set(r[1], [])
    const ks = keysOf.get(r[1])!
    if (!ks.includes(a.key)) ks.push(a.key)
  }
  const globalKeys = file.areas.filter(a => a.floors[0] === a.key).map(a => a.key)
  return { file, byKey, keysOf, globalKeys }
}

/** One area of Da'Maps' map, filled in from the Lich rooms its squares carry. */
export function hydrateArea(a: DaWorldArea, lichDb: Map<number, LichRoom>): DaArea {
  const rooms: DaRoom[] = []
  const byId = new Map<number, DaRoom>()
  const byLich = new Map<number, DaRoom>()
  for (const [id, lid, x, y, fill, to, title, goTo] of a.rooms) {
    const lr = lid ? lichDb.get(lid) : undefined
    const tags = splitTags(lr?.tags)
    const room: DaRoom = {
      id, lich: lid || null,
      fill: fill || undefined, stubTo: to || undefined, goTo: (to && goTo) || undefined,
      x, y, size: DA_ROOM_SIZE, lx: 0, ly: 0,
      title: lr ? lichTitle(lr) : title,
      indoor: lr ? isIndoor(lr) : false,
      category: tags.category,
      forage: tags.forage, hunting: tags.hunting, services: tags.services,
      exits: lr ? Object.values(lr.wayto ?? {}).filter((m): m is string => typeof m === 'string') : [],
      crossTo: to ? [to] : [],
      label: '', building: null, location: lr?.location ?? '',
    }
    rooms.push(room)
    byId.set(id, room)
    if (room.lich !== null && !byLich.has(room.lich)) byLich.set(room.lich, room)
  }
  const arcs: DaArc[] = a.lines.filter(([x, y]) => byId.has(x) && byId.has(y)).map(([x, y, c]) => ({ a: x, b: y, cat: CATS[c] ?? 'go' }))
  const buildings: DaBuilding[] = a.buildings.map(([name, x1, y1, x2, y2, ids, outline]) => ({
    name, x1, y1, x2, y2, rooms: ids, outline: !!outline, lx: 0, ly: 0, showLabel: false,
  }))
  buildings.forEach((b, i) => { for (const id of b.rooms) { const r = byId.get(id); if (r) r.building = i } })
  const texts = a.texts.map(([text, x, y]) => ({ text, x, y }))
  const moves = new Map((a.moves ?? []).map(([f, t, m]) => [`${f}>${t}`, m]))
  const xs = rooms.map(r => r.x).concat(texts.map(t => t.x)), ys = rooms.map(r => r.y).concat(texts.map(t => t.y))
  const bbox = rooms.length
    ? { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }
    : { x1: 0, y1: 0, x2: 100, y2: 100 }
  return { image: a.key, name: a.name, rooms, byId, byLich, arcs, buildings, bbox, texts, moves }
}

// ── Map art (painted backgrounds) ────────────────────────────────────────────
// Kaesken paints a background for each map over the guide PNGs that
// tools/damaps/export-map-art.py makes. The finished PNGs live in
// src/renderer/public/damaps-art/, and tools/damaps/sync-map-art.mjs writes
// damaps-art/art.json listing only the maps that have one. Each entry says
// where its image sits on the map: its top-left (x, y) in map units and its
// pixel size at `scale` pixels per map unit.

export interface DaArt { key: string; file: string; x: number; y: number; scale: number; width: number; height: number }

let artLoading: Promise<Map<string, DaArt>> | null = null
/** The painted backgrounds, by area key. Empty when there are none. */
export function loadDaArt(): Promise<Map<string, DaArt>> {
  if (!artLoading) {
    artLoading = readJson('./damaps-art/art.json')
      .then(raw => {
        const maps = (raw as { maps?: DaArt[] })?.maps
        return new Map((Array.isArray(maps) ? maps : []).map(m => [m.key, m]))
      })
      .catch(() => new Map<string, DaArt>())
  }
  return artLoading
}
