// build-damaps — make Da'Maps' own map file from a folder of Genie maps and
// Lich's map database (see build.ts for what it does).
//
//   node tools/damaps/build-damaps.mjs <Lich map-NNNN.json>
//
// Also reads Da'Maps' own .damap maps from tools/damaps/maps/ (see damapFormat.ts).
// Writes src/renderer/public/damaps-world.json, which
// is committed. Bundles build.ts with esbuild (already a dev dependency) and
// runs it.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
// Normally just the Lich map: every map comes from tools/damaps/maps/*.damap.
// A Genie maps folder can still be given first; a .damap with the same file
// name wins over the Genie one.
const args = process.argv.slice(2)
const [mapsDir, lichFile] = args.length === 1 ? ['', args[0]] : args
if (!lichFile) {
  console.error('usage: node tools/damaps/build-damaps.mjs [Genie maps folder] <Lich map-NNNN.json>')
  process.exit(1)
}
const bundle = path.join(here, '.build-damaps.cjs')
await build({ entryPoints: [path.join(here, 'build.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'error' })
const out = path.join(root, 'src/renderer/public/damaps-world.json')
// Da'Maps' own maps (.damap files from the DaMaps Editor) are read from tools/damaps/maps/.
execFileSync(process.execPath, [bundle, mapsDir ? path.resolve(mapsDir) : '', path.resolve(lichFile), out, path.join(here, 'maps')], { stdio: 'inherit' })
