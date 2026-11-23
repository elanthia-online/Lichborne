// sync-map-art — list the painted map backgrounds that exist.
//
//   node tools/damaps/sync-map-art.mjs
//
// Put a finished PNG in src/renderer/public/damaps-art/ under the same folder
// and name the guide had (e.g. Zoluren/The Crossing.png), then run this. It
// reads tools/damaps/map-art.json (where every guide sits on its map) and
// writes src/renderer/public/damaps-art/art.json with the maps that have art.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const artDir = path.resolve(here, '../../src/renderer/public/damaps-art')
const all = JSON.parse(fs.readFileSync(path.join(here, 'map-art.json'), 'utf8'))
const maps = all.maps.filter(m => fs.existsSync(path.join(artDir, m.file)))
fs.writeFileSync(path.join(artDir, 'art.json'), JSON.stringify({ version: 1, maps }, null, 1))
console.log(`${maps.length} map(s) with art: ${maps.map(m => m.name).join(', ') || 'none'}`)
