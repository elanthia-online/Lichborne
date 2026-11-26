// Runs export-damaps.ts (bundled with esbuild). See that file.
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const bundle = path.join(here, '.export-damaps.cjs')
await build({ entryPoints: [path.join(here, 'export-damaps.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'error' })
execFileSync(process.execPath, [bundle, ...process.argv.slice(2).map(a => path.resolve(a))], { stdio: 'inherit' })
