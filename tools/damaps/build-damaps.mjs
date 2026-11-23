// build-damaps — make Da'Maps' own map file from a folder of Genie maps and
// Lich's map database (see build.ts for what it does).
//
//   node tools/damaps/build-damaps.mjs <Genie maps folder> <Lich map-NNNN.json>
//
// Writes src/renderer/public/damaps-world.json, which
// is committed. Bundles build.ts with esbuild (already a dev dependency) and
// runs it.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const [mapsDir, lichFile] = process.argv.slice(2)
if (!mapsDir || !lichFile) {
  console.error('usage: node tools/damaps/build-damaps.mjs <Genie maps folder> <Lich map-NNNN.json>')
  process.exit(1)
}
const bundle = path.join(here, '.build-damaps.cjs')
await build({ entryPoints: [path.join(here, 'build.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'error' })
const out = path.join(root, 'src/renderer/public/damaps-world.json')
execFileSync(process.execPath, [bundle, path.resolve(mapsDir), path.resolve(lichFile), out], { stdio: 'inherit' })
