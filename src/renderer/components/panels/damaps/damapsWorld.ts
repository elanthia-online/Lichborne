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
  return { image: a.key, name: a.name, rooms, byId, byLich, arcs, buildings, bbox, texts, moves, ...(a.art ? { art: a.art } : {}) }
}

// ── Pictures (painted backgrounds) ───────────────────────────────────────────
// A floor's picture is made by the DaMaps Editor and lives in the Da'Maps
// repository's art/ folder; the map file says where it sits (DaWorldArea.art).
// Main fetches it the first time it's shown and keeps it (damapsDownload.ts).

const artUrls = new Map<string, Promise<string | null>>()
/** A floor's picture as an object URL, or null when it can't be had. Fetched once per file. */
export function loadDaPicture(file: string): Promise<string | null> {
  let p = artUrls.get(file)
  if (!p) {
    p = window.api.daMapsArt(file).then(bytes => {
      if (!bytes) { artUrls.delete(file); return null }
      const type = /\.webp$/i.test(file) ? 'image/webp' : /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png'
      return URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
    }, () => { artUrls.delete(file); return null })
    artUrls.set(file, p)
  }
  return p
}
/** Forget the pictures (the maps were updated, so a picture may have changed). */
export function forgetDaPictures() {
  for (const p of artUrls.values()) p.then(u => { if (u) URL.revokeObjectURL(u) })
  artUrls.clear()
}
