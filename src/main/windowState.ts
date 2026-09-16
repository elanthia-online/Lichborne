// Window state persistence — each window reopens at its last size, position and
// maximized state (F109, v0.19.7).
//
// Stored in {userData}/window-state.json, deliberately NOT in _shared.yaml or a
// character profile: it describes THIS machine's monitors, and a profile moved
// to another machine (Transfer, a copied profiles folder) must not carry
// coordinates for screens that machine doesn't have. Same machine-local stance
// as genie-cache.json and ai-keys.json.
//
// Keys: 'main' for the primary window; `char:<characterId>` for a decoupled
// window, named after the character that opened it, so decoupling that
// character again reopens its window where it was.
//
// CAPTURE, THEN FLUSH. Bounds are captured into memory on every move / resize /
// (un)maximize and on close, and only the FILE write is debounced. That split is
// load-bearing: shutdown and the re-home auto-close DESTROY windows, and
// `win.destroy()` emits no 'close' event, so anything that waited for close to
// read the bounds would miss them. The in-memory copy is already current, and
// `flushWindowState()` runs on will-quit for the last write.
//
// `getNormalBounds()`, never `getBounds()`: it returns the restored-state rect
// whether the window is maximized, minimized or fullscreen. A minimized window
// on Windows reports bogus coordinates (-32000) from `getBounds()`.
//
// A missing, unreadable or unknown-version file reads as empty and is simply
// overwritten by the next save. It is a disposable geometry cache, not user
// content, so Principle #3 (preserve what we can't process) doesn't apply.
// Validation against the CURRENT monitors lives in shared/windowBounds.ts.

import { app, screen, type BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import {
  resolveWindowBounds, isSavedWindowBounds,
  type SavedWindowBounds, type Rect, type ResolvedBounds, type BoundsDefaults,
} from '../shared/windowBounds'

const FILE_NAME = 'window-state.json'
const VERSION = 1
const WRITE_DEBOUNCE_MS = 500

let cache: Record<string, SavedWindowBounds> | null = null
let writeTimer: NodeJS.Timeout | null = null

function filePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function load(): Record<string, SavedWindowBounds> {
  if (cache) return cache
  const next: Record<string, SavedWindowBounds> = {}
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'))
    if (raw && raw.version === VERSION && raw.windows && typeof raw.windows === 'object') {
      for (const [key, value] of Object.entries(raw.windows)) {
        if (isSavedWindowBounds(value)) next[key] = value
      }
    }
  } catch {
    // Missing (first launch) or unreadable — start empty; the next save replaces it.
  }
  cache = next
  return cache
}

function writeNow(): void {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null }
  if (!cache) return
  try {
    const target = filePath()
    const tmp = `${target}.tmp`
    // Write-then-rename so a crash mid-write can never leave a half file behind.
    // Owner-only (B366d, hardening — the content is harmless geometry). `mode`
    // applies only when the file is CREATED, so a stale temp file left by a
    // crash is chmod'ed too; Windows keeps its ACL-based defaults.
    fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, windows: cache }, null, 2), { mode: 0o600 })
    if (process.platform !== 'win32') { try { fs.chmodSync(tmp, 0o600) } catch { /* best effort */ } }
    fs.renameSync(tmp, target)
  } catch (err) {
    console.warn('[window-state] save failed:', err)
  }
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(writeNow, WRITE_DEBOUNCE_MS)
}

/** Writes any pending change immediately. Call on quit. */
export function flushWindowState(): void {
  if (writeTimer) writeNow()
}

/**
 * The bounds a window should open with: its saved state when that still lands
 * on an attached display, otherwise the defaults. `key` undefined ⇒ defaults.
 * Must be called after `app` is ready (it reads `screen`).
 */
export function restoredBoundsFor(key: string | undefined, defaults: BoundsDefaults): ResolvedBounds {
  const saved = key ? load()[key] : undefined
  const primary = screen.getPrimaryDisplay()
  const areas: Rect[] = [
    primary.workArea,
    ...screen.getAllDisplays().filter(d => d.id !== primary.id).map(d => d.workArea),
  ]
  return resolveWindowBounds(saved, areas, defaults)
}

// B360 (Linux/X11): some window managers report a window's position including
// its frame but apply a requested one without it (or the reverse), so saving
// the reported position and requesting it next launch shifts the window by the
// title-bar height every time. The creep is measured once per window — the
// position we asked for against the one reported once the window is up — and
// subtracted from every later save, so what we store is what we must REQUEST
// to land where the window actually is. Only a small non-zero difference counts
// as creep: a large one is a clamp (the window didn't fit), or Wayland, which
// reports 0,0 and ignores the requested position anyway. (A Wayland window
// restored within 64px of 0,0 does read as "creep"; the correction then just
// re-saves the requested position, which the compositor ignores — harmless.)
// A move the user makes in the first moments after launch could be mistaken
// for creep too; bounded by the same 64px.
const CREEP_MAX_PX = 64
const CREEP_SETTLE_MS = 300     // after the window is first shown, for the WM to place it
const CREEP_FALLBACK_MS = 2000  // if neither show event is seen

/**
 * Keeps `key`'s saved state current for as long as `win` lives.
 *
 * @param requested  the x/y the window was created with, when a saved position
 *                   was restored (absent when Electron centred it, or when it
 *                   opened maximized) — used only for the Linux creep check.
 */
export function trackWindowState(win: BrowserWindow, key: string, requested?: { x: number; y: number }): void {
  let offset = { dx: 0, dy: 0 }  // B360; stays zero everywhere but Linux-with-creep
  const capture = () => {
    if (win.isDestroyed()) return
    // B362: never record a FULLSCREEN frame. isMaximized() reads false in
    // fullscreen, and whether getNormalBounds() then returns the pre-fullscreen
    // rect is platform-dependent (macOS may hand back the screen-sized frame),
    // so skip entirely and keep the last windowed rect; 'leave-full-screen'
    // captures again once the window is back.
    if (win.isFullScreen()) return
    const b = win.getNormalBounds()
    load()[key] = {
      x: b.x - offset.dx, y: b.y - offset.dy,
      width: b.width, height: b.height, maximized: win.isMaximized(),
    }
    scheduleWrite()
  }
  win.on('resize', capture)
  win.on('move', capture)
  win.on('maximize', capture)
  win.on('unmaximize', capture)
  win.on('leave-full-screen', capture)
  win.on('close', () => { capture(); writeNow() })

  if (process.platform === 'linux' && requested) {
    let measured = false
    let fallback: NodeJS.Timeout | undefined
    const measure = () => {
      if (measured || win.isDestroyed()) return
      measured = true
      if (fallback) clearTimeout(fallback)
      // A maximized/fullscreen/minimized window's reported rect says nothing
      // about where the WM put a normal one.
      if (win.isMaximized() || win.isFullScreen() || win.isMinimized()) return
      const b = win.getNormalBounds()
      const dx = b.x - requested.x
      const dy = b.y - requested.y
      if ((dx !== 0 || dy !== 0) && Math.abs(dx) <= CREEP_MAX_PX && Math.abs(dy) <= CREEP_MAX_PX) {
        offset = { dx, dy }
        capture()  // re-save anything captured before the offset was known
      }
    }
    const settle = () => { setTimeout(measure, CREEP_SETTLE_MS) }
    win.once('ready-to-show', settle)
    win.once('show', settle)
    fallback = setTimeout(measure, CREEP_FALLBACK_MS)
  }
}
