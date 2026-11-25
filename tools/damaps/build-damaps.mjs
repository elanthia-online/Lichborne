// build-damaps — run Da'Maps' build from the command line (see build.ts).
//
//   node tools/damaps/build-damaps.mjs <.damap folder> <Lich map-NNNN.json> [out.json] [Genie maps folder]
//
// The .damap folder is a checkout of github.com/Kaesken/Da-Maps (its maps/
// folder). Bundles build.ts with esbuild (already a dev dependency) and runs it.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('usage: node tools/damaps/build-damaps.mjs <.damap folder> <Lich map-NNNN.json> [out.json] [Genie maps folder]')
  process.exit(1)
}
const bundle = path.join(here, '.build-damaps.cjs')
await build({ entryPoints: [path.join(here, 'build.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'error' })
execFileSync(process.execPath, [bundle, ...args.map((a, i) => (a && i !== 2 ? path.resolve(a) : a))], { stdio: 'inherit' })
