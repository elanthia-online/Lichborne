// Da'Maps — build Da'Maps' map from .damap files and Lich's map database.
//
// The .damap maps come from the Da'Maps repository on GitHub
// (github.com/Kaesken/Da-Maps), downloaded into Lichborne's own data folder by
// main/damapsDownload.ts. Each square on a map is matched to a Lich room, and
// that has to be done against the player's own Lich map, so the build runs in
// the app (damapsWorld.ts) whenever the maps or Lich's map change. The same
// code backs the command-line build (tools/damaps/build.ts), which can also
// mix in Genie map files.
//
// Steps: parse each .damap, fold any Genie maps' side maps into their towns,
// match every square to a Lich room (genieMatch.ts), and turn each map floor
// into a Da'Maps area (genieArea.ts): squares, lines, place names, building
// outlines and the Genie moves for "?" squares.
//
// Written as steps that `yield` (timeSlice.ts), so the app can run it in small
// pieces and keep drawing; `runSync` gives the same answer in one go.
//
// Pure: no React, no DOM, no files.

import type { GenieZone, LichRoom } from '../../mapTypes'
import { areaProvince } from '../daMapsData'
import { DA_WORLD_VERSION, type DaWorldArea, type DaWorldFile, type DaWorldRoom } from '../worldFile'
import type { Steps } from '../../../../timeSlice'
import { parseDamap, damapToZone } from './damapFormat'
import { mergeSubMaps } from './genieMerge'
import { matchSteps } from './genieMatch'
import { buildGenieArea, genieAreaKey, genieLevels, zoneIdByFile } from './genieArea'

export interface DamapText { name: string; text: string }

export interface BuildInput {
  /** the .damap files, by file name */
  damaps: DamapText[]
  lichDb: Map<number, LichRoom>
  /** Genie maps to add (command-line build only); a .damap naming the same file wins */
  genie?: { file: string; zone: GenieZone }[]
  /** for the record in the file: what the maps and Lich's map were */
  sources?: { maps?: string; lich?: string }
}

export interface BuildResult {
  file: DaWorldFile
  /** one line per thing worth saying (a skipped file, a fold) */
  log: string[]
  squares: number
  matched: number
  /** squares with no line to any other square */
  lone: number
}

/** a place name further than this outside its map's squares is a stray label and is dropped */
const LABEL_REACH = 200

function nearRooms(rooms: { x: number; y: number }[], x: number, y: number): boolean {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const r of rooms) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x); y2 = Math.max(y2, r.y) }
  return x >= x1 - LABEL_REACH && x <= x2 + LABEL_REACH && y >= y1 - LABEL_REACH && y <= y2 + LABEL_REACH
}

const r1 = (v: number) => Math.round(v * 10) / 10

export function* buildWorldSteps({ damaps: texts, lichDb, genie: genieIn = [], sources }: BuildInput): Steps<BuildResult> {
  const log: string[] = []

  // ── .damap maps ──
  // Already whole (side maps folded in), so they skip the fold. Sorted by file
  // name so the result doesn't depend on the order the files were read in.
  const damaps: { zone: GenieZone; includes: string[] }[] = []
  const covered = new Set<string>()        // link names a .damap answers to
  for (const { name, text } of [...texts].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    try {
      const m = parseDamap(text)
      const names = [m.file, ...(m.includes ?? [])].map(x => x.toLowerCase())
      if (names.some(n => covered.has(n))) { log.push(`skipped ${name}: another .damap is already ${m.file}`); continue }
      names.forEach(n => covered.add(n))
      damaps.push({ zone: damapToZone(m), includes: m.includes ?? [] })
    } catch (e) { log.push(`skipped ${name}: ${(e as Error).message}`) }
    yield
  }

  // ── Genie maps (command line only) ──
  const genie = new Map<string, GenieZone>()
  let replaced = 0
  for (const { file, zone: z } of genieIn) {
    if (covered.has(file.toLowerCase())) { replaced++; continue }
    if (!z.nodes.length) continue
    // the same id in two files (an old event copy beside the current map) gets a suffix
    let id = z.id || file
    for (let k = 1; genie.has(id); k++) id = `${z.id || file}~${k}`
    z.id = id
    for (const n of z.nodes) n.zoneId = id
    genie.set(id, z)
  }

  // ── Fold, match ──
  const folded = mergeSubMaps(genie)
  // One list, in link-name order (the matcher breaks ties by order).
  const all = [...folded.zones.values()]
  for (const { zone } of damaps) {
    if (!zone.nodes.length) continue
    let id = zone.id
    for (let k = 1; all.some(z => z.id === id); k++) id = `${zone.id}~${k}`
    zone.id = id
    for (const n of zone.nodes) n.zoneId = id
    all.push(zone)
  }
  all.sort((a, b) => (a.sourceFile < b.sourceFile ? -1 : a.sourceFile > b.sourceFile ? 1 : 0))
  const zones = new Map(all.map(z => [z.id, z]))
  yield
  const match = yield* matchSteps(zones, lichDb)
  const fileToZone = zoneIdByFile(genie)
  for (const [file, id] of fileToZone) { const p = folded.parentOf.get(id); if (p) fileToZone.set(file, p) }
  for (const { zone, includes } of damaps) {
    fileToZone.set(zone.sourceFile.toLowerCase(), zone.id)
    for (const f of includes) fileToZone.set(f.toLowerCase(), zone.id)
  }
  if (genieIn.length && damaps.length) log.push(`.damap maps: ${damaps.length} (${replaced} Genie files they cover were skipped)`)
  if (folded.parentOf.size) log.push(`folded in: ${[...folded.parentOf].map(([c, p]) => `${c}→${p}`).join(' ')}`)

  const levelOf = new Map<string, Map<number, number>>()     // zone → node id → floor
  for (const z of zones.values()) levelOf.set(z.id, new Map(z.nodes.map(n => [n.id, n.z])))
  const keysOf = new Map<number, string>()
  for (const [lid, nodes] of match.nodesOf) {
    const { zoneId, nodeId } = nodes[0]
    const z = levelOf.get(zoneId)?.get(nodeId)
    if (z !== undefined) keysOf.set(lid, genieAreaKey(zoneId, z))
  }
  yield

  // ── Areas ──
  const areas: DaWorldArea[] = []
  let squares = 0, matched = 0, lone = 0
  for (const zone of zones.values()) {
    const levels = genieLevels(zone)
    const floors = levels.map(l => genieAreaKey(zone.id, l))
    for (const level of levels) {
      const a = buildGenieArea(zone, level, match, lichDb, fileToZone, id => keysOf.get(id) ?? '')
      yield
      if (!a.rooms.length) continue
      const deg = new Set<number>()
      for (const arc of a.arcs) { deg.add(arc.a); deg.add(arc.b) }
      for (const r of a.rooms) { squares++; if (r.lich !== null) matched++; if (!deg.has(r.id)) lone++ }
      const lichRoomsHere = a.rooms.map(r => (r.lich !== null ? lichDb.get(r.lich) : undefined)).filter((r): r is LichRoom => !!r)
      areas.push({
        key: a.image,
        name: a.name,
        province: areaProvince(zone.name, lichRoomsHere),
        floors,
        rooms: a.rooms.map((r): DaWorldRoom => [r.id, r.lich ?? 0, r1(r.x), r1(r.y), r.fill ?? '', r.stubTo ?? '', r.title, r.goTo ?? 0]),
        lines: a.arcs.map(x => [x.a, x.b, x.cat === 'cardinal' ? 0 : x.cat === 'climb' ? 1 : 2]),
        texts: (a.texts ?? []).filter(t => nearRooms(a.rooms, t.x, t.y)).map(t => [t.text, t.x, t.y]),
        buildings: a.buildings.map(b => [b.name, r1(b.x1), r1(b.y1), r1(b.x2), r1(b.y2), b.rooms, b.outline ? 1 : 0]),
        moves: [...(a.moves ?? [])].map(([k, m]): [number, number, string] => {
          const [f, t] = k.split('>').map(Number)
          return [f, t, m]
        }),
      })
    }
  }
  // A marker naming a floor that has no rooms points at the map's first floor.
  const keys = new Set(areas.map(a => a.key))
  for (const a of areas) for (const r of a.rooms) {
    if (r[5] && !keys.has(r[5])) {
      const zoneOf = r[5].replace(/@-?\d+$/, '')
      r[5] = areas.find(x => x.key.startsWith(zoneOf + '@'))?.floors[0] ?? ''
    }
  }

  const maps = sources?.maps ?? [genieIn.length ? `${genieIn.length} Genie map files` : '', damaps.length ? `${damaps.length} .damap maps` : ''].filter(Boolean).join(' + ')
  const file: DaWorldFile = {
    version: DA_WORLD_VERSION,
    made: new Date().toISOString().slice(0, 10),
    sources: { maps, lich: sources?.lich ?? '' },
    stats: { areas: areas.length, squares, matched },
    areas,
  }
  return { file, log, squares, matched, lone }
}
