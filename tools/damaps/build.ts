// Build Da'Maps' own map (src/renderer/public/damaps-world.json).
//
//   node tools/damaps/build-damaps.mjs <Genie maps folder> <Lich map-NNNN.json>
//
// Reads the Genie map XML files in the folder (top level only, the way Genie
// loads them), folds building sub-maps into their towns, matches every square
// to a Lich room, makes sure every square has a line, works out the dotted
// building outlines, and writes the lot as Da'Maps' own file. The app then
// reads only that file. Re-run it when the maps or Lich's map change.

import fs from 'node:fs'
import path from 'node:path'
import type { GenieZone, LichRoom } from '../../src/renderer/components/panels/mapTypes'
import { areaProvince } from '../../src/renderer/components/panels/damaps/daMapsData'
import {
  DA_WORLD_VERSION, type DaWorldArea, type DaWorldFile, type DaWorldRoom,
} from '../../src/renderer/components/panels/damaps/damapsWorld'
import { readGenieXml } from './readGenieXml'
import { mergeSubMaps } from './genieMerge'
import { matchGenieToLich } from './genieMatch'
import { buildGenieArea, genieAreaKey, genieLevels, zoneIdByFile } from './genieArea'

const [mapsDir, lichFile, outFile] = process.argv.slice(2)
if (!mapsDir || !lichFile || !outFile) {
  console.error('usage: build-damaps <Genie maps folder> <Lich map-NNNN.json> <out.json>')
  process.exit(1)
}

// ── Read ─────────────────────────────────────────────────────────────────────
const lichRooms: LichRoom[] = JSON.parse(fs.readFileSync(lichFile, 'utf8'))
const lichDb = new Map(lichRooms.map(r => [r.id, r]))

const files = fs.readdirSync(mapsDir).filter(f => f.toLowerCase().endsWith('.xml')).sort()
const zones = new Map<string, GenieZone>()
for (const f of files) {
  let z: GenieZone
  try { z = readGenieXml(fs.readFileSync(path.join(mapsDir, f), 'utf8'), f) }
  catch (e) { console.warn(`skipped ${f}: ${(e as Error).message}`); continue }
  if (!z.nodes.length) continue
  // the same id in two files (an old event copy beside the current map) gets a suffix
  let id = z.id || f
  for (let k = 1; zones.has(id); k++) id = `${z.id || f}~${k}`
  z.id = id
  for (const n of z.nodes) n.zoneId = id
  zones.set(id, z)
}

// ── Fold, match ──────────────────────────────────────────────────────────────
const merged = mergeSubMaps(zones)
const match = matchGenieToLich(merged.zones, lichDb)
const fileToZone = zoneIdByFile(zones)
for (const [file, id] of fileToZone) { const p = merged.parentOf.get(id); if (p) fileToZone.set(file, p) }

const keysOf = new Map<number, string>()
for (const [lid, nodes] of match.nodesOf) {
  const { zoneId, nodeId } = nodes[0]
  const n = merged.zones.get(zoneId)?.nodes.find(x => x.id === nodeId)
  if (n) keysOf.set(lid, genieAreaKey(zoneId, n.z))
}

const LABEL_REACH = 200
function nearRooms(rooms: { x: number; y: number }[], x: number, y: number): boolean {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const r of rooms) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x); y2 = Math.max(y2, r.y) }
  return x >= x1 - LABEL_REACH && x <= x2 + LABEL_REACH && y >= y1 - LABEL_REACH && y <= y2 + LABEL_REACH
}

// ── Areas ────────────────────────────────────────────────────────────────────
const areas: DaWorldArea[] = []
let squares = 0, matched = 0, lone = 0
const r1 = (v: number) => Math.round(v * 10) / 10
for (const zone of merged.zones.values()) {
  const levels = genieLevels(zone)
  const floors = levels.map(l => genieAreaKey(zone.id, l))
  for (const level of levels) {
    const a = buildGenieArea(zone, level, match, lichDb, fileToZone, id => keysOf.get(id) ?? '')
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
      // a place name far outside the map (a stray label in the source) is dropped
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

const out: DaWorldFile = {
  version: DA_WORLD_VERSION,
  made: new Date().toISOString().slice(0, 10),
  sources: { maps: `${files.length} Genie map files`, lich: path.basename(lichFile) },
  stats: { areas: areas.length, squares, matched },
  areas,
}
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(out))
console.log(`Da'Maps: ${areas.length} areas, ${squares} squares, ${matched} matched to Lich (${(100 * matched / squares).toFixed(1)}%), ${lone} without a line`)
console.log(`folded in: ${[...merged.parentOf].map(([c, p]) => `${c}→${p}`).join(' ')}`)
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB)`)
