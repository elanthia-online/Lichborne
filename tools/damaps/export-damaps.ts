// One-off: turn a Genie maps folder into Da'Maps' own .damap files, each map
// exactly as Da'Maps shows it (side maps folded in, as the build does).
//   node tools/damaps/export-damaps.mjs <Genie maps folder> <out folder>
// Files are named after the map ("The_Crossing.damap"); the map's link name
// (`file`) and the side maps it took in (`includes`) are kept inside.
import fs from 'node:fs'
import path from 'node:path'
import type { GenieZone } from '../../src/renderer/components/panels/mapTypes'
import { readGenieXml, decodeMapFile } from './readGenieXml'
import { mergeSubMaps } from '../../src/renderer/components/panels/damaps/build/genieMerge'
import { zoneToDamap, stringifyDamap, parseDamap } from '../../src/renderer/components/panels/damaps/build/damapFormat'

const [mapsDir, outDir] = process.argv.slice(2)
if (!mapsDir || !outDir) { console.error('usage: export-damaps <Genie maps folder> <out folder>'); process.exit(1) }
fs.mkdirSync(outDir, { recursive: true })

const genie = new Map<string, GenieZone>()
for (const f of fs.readdirSync(mapsDir).filter(f => f.toLowerCase().endsWith('.xml')).sort()) {
  const z = readGenieXml(decodeMapFile(fs.readFileSync(path.join(mapsDir, f))), f)
  if (!z.nodes.length) continue
  let id = z.id || f
  for (let k = 1; genie.has(id); k++) id = `${z.id || f}~${k}`
  z.id = id
  for (const n of z.nodes) n.zoneId = id
  genie.set(id, z)
}
const { zones, parentOf } = mergeSubMaps(genie)
const used = new Set<string>()
let n = 0
for (const z of zones.values()) {
  const m = zoneToDamap(z)
  m.id = z.id
  const kids = [...parentOf].filter(([, p]) => p === z.id).map(([k]) => genie.get(k)!.sourceFile).sort()
  if (kids.length) m.includes = kids
  const text = stringifyDamap(m)
  if (stringifyDamap(parseDamap(text)) !== text) throw new Error('does not read back the same: ' + z.sourceFile)
  const base = (z.name && !/^untitled map$/i.test(z.name) ? z.name : z.sourceFile.replace(/\.xml$/i, '')).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '') || 'Map'
  let name = base
  for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base}_${k}`
  used.add(name.toLowerCase())
  fs.writeFileSync(path.join(outDir, name + '.damap'), text)
  n++
}
console.log(`${n} maps written (${parentOf.size} side maps folded in)`)
