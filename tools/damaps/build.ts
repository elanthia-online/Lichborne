// Build Da'Maps' map from the command line (for checking a change to the maps
// or to the build; the app builds it itself, see damaps/damapsWorld.ts).
//
//   node tools/damaps/build-damaps.mjs <.damap folder> <Lich map-NNNN.json> [out.json] [Genie maps folder]
//
// Runs the same build the app does (build/buildWorld.ts) and prints its
// numbers. With an out file it also writes the built map as JSON. A Genie maps
// folder adds its maps (top level only, the way Genie loads them); a .damap
// with the same link name wins.

import fs from 'node:fs'
import path from 'node:path'
import type { GenieZone, LichRoom } from '../../src/renderer/components/panels/mapTypes'
import { buildWorldSteps } from '../../src/renderer/components/panels/damaps/build/buildWorld'
import { runSync } from '../../src/renderer/timeSlice'
import { readGenieXml, decodeMapFile } from './readGenieXml'

const [damapDir, lichFile, outFile, mapsDir] = process.argv.slice(2)
if (!damapDir || !lichFile) {
  console.error('usage: build-damaps <.damap folder> <Lich map-NNNN.json> [out.json] [Genie maps folder]')
  process.exit(1)
}

const t0 = Date.now()
const lichRooms: LichRoom[] = JSON.parse(fs.readFileSync(lichFile, 'utf8'))
const lichDb = new Map(lichRooms.map(r => [r.id, r]))

const damaps = fs.readdirSync(damapDir).filter(f => f.toLowerCase().endsWith('.damap')).sort()
  .map(name => ({ name, text: fs.readFileSync(path.join(damapDir, name), 'utf8') }))

const genie: { file: string; zone: GenieZone }[] = []
if (mapsDir) {
  for (const f of fs.readdirSync(mapsDir).filter(f => f.toLowerCase().endsWith('.xml')).sort()) {
    try { genie.push({ file: f, zone: readGenieXml(decodeMapFile(fs.readFileSync(path.join(mapsDir, f))), f) }) }
    catch (e) { console.warn(`skipped ${f}: ${(e as Error).message}`) }
  }
}

const t1 = Date.now()
const r = runSync(buildWorldSteps({ damaps, lichDb, genie, sources: { lich: path.basename(lichFile) } }))
const t2 = Date.now()
for (const line of r.log) console.log(line)
const { areas } = r.file.stats
console.log(`Da'Maps: ${areas} areas, ${r.squares} squares, ${r.matched} matched to Lich (${(100 * r.matched / r.squares).toFixed(1)}%), ${r.lone} without a line`)
console.log(`read ${t1 - t0} ms, build ${t2 - t1} ms`)
if (outFile) {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(r.file))
  console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1e6).toFixed(2)} MB)`)
}
