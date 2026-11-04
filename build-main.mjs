import { build } from 'esbuild'
import { rmSync } from 'fs'

const common = {
  bundle: true,
  platform: 'node',
  // Matches the Node bundled in the current Electron (45 → Node 24.22). Bump in
  // lockstep with Electron majors (check: ELECTRON_RUN_AS_NODE=1 electron -p
  // process.versions.node).
  target: 'node24',
  external: ['electron', 'better-sqlite3'],
  // Opt-in — see the matching note in vite.config.mts. Same flag drives both,
  // so `LB_SOURCEMAPS=1 npm run build` gives you a fully mapped profiling
  // build of main AND renderer, and a plain build ships neither.
  sourcemap: !!process.env.LB_SOURCEMAPS,
  // v0.21.0 (C8): shrink main.js (943 KB unminified). Syntax + whitespace only
  // — identifiers are kept so stack traces and Function.name stay readable.
  minifySyntax: true,
  minifyWhitespace: true,
}

await build({
  ...common,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main/main.js',
})

await build({
  ...common,
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/main/preload.js',
})

// esbuild has no emptyOutDir (Vite does), so it never removes files it didn't
// write this run. Without this, turning sourcemaps back OFF leaves the maps
// from the last mapped build sitting in dist/main — and `files: ["dist/**/*"]`
// packages whatever is there, so ~1.7MB of stale, now-WRONG maps would ship
// silently and forever. Sweep them whenever maps are off.
if (!common.sourcemap) {
  for (const f of ['dist/main/main.js.map', 'dist/main/preload.js.map']) {
    rmSync(f, { force: true })
  }
}

console.log(`Main process built successfully.${common.sourcemap ? ' (with sourcemaps)' : ''}`)
