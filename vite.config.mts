import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

// An ES module (.mts), so Vite loads it natively and there is no CommonJS dirname.
const root = path.dirname(fileURLToPath(import.meta.url))

const pkg = JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    // Source maps let the DevTools performance profiler resolve minified names
    // (Lx, Pu, kj…) back to real functions. OPT-IN, because `files: ["dist/**/*"]`
    // sweeps them into the asar: the renderer map alone is ~4.3MB (3x the 1.4MB
    // bundle it describes), and main.js.map adds ~1.6MB more. They cost nothing
    // at runtime — nothing reads a map unless DevTools is open — so this is
    // install-size hygiene, not a speed fix.
    //
    // Turn on for a profiling build:  LB_SOURCEMAPS=1 npm run build
    // (build-main.mjs reads the same flag, so one variable covers both.)
    sourcemap: !!process.env.LB_SOURCEMAPS,
    // Vite 8 bundles with Rolldown (was rollupOptions). One iife file, no code
    // splitting: an iife can't split, so Rolldown turns splitting off itself.
    // One file by design, so the 500 kB per-chunk warning only ever says that.
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      output: {
        format: 'iife',
      }
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(root, 'src/shared')
    }
  }
})
