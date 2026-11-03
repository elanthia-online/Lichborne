// rawRecorder — "Capture XML": the game stream to disk, on demand (v0.21.0,
// Sekmeht 2026-10-29).
//
// While capture is on for a session, main appends every line it receives from
// Lich (or the game, on a direct connection), stamped with the local time, to
// `{userData}/Logs/raw/{Character}_{YYYY-MM-DD}.xml`. The point is diagnosis:
// a thing noticed in play can be cut out of the file by the clock and replayed
// through the real parser and the render harness (`tmp-v0210-rich/replayraw.ts`),
// with the character's profile YAML as the settings that were in force.
//
// Switched by the Debug panel's "Capture XML" button and `/log xml on|off`,
// per SESSION, in released builds as much as from source. Nothing persists:
// the flag dies with the session (destroySession stops it), so it cannot be
// left on across a restart. Of what the player SENDS only the first word of each
// command is stamped, and the login key never reaches it; what is recorded is the
// material the session log already keeps, whispers included, and it isn't
// redacted, so a file should be looked over before it is shared. No retention: the
// player deletes the folder when it grows, even during a capture (each write makes
// sure the folder exists).
//
// Writes are buffered like the session log: one appendFile per second per
// character, and a synchronous flush at stop and at shutdown.
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

const FLUSH_MS = 1000
const MAX_BUFFERED_LINES = 20_000
const enabled = new Set<string>()   // character keys with capture on
const writers = new Map<string, { file: string; buf: string[]; timer: ReturnType<typeof setTimeout> | null }>()

function safeName(character: string): string {
  return character.replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'
}
// Case-blind: a session's name can change case when the game reports it, and that
// must not orphan a capture started under the old spelling.
function keyFor(character: string): string {
  return safeName(character).toLowerCase()
}
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}
export function rawCaptureDir(): string {
  return path.join(app.getPath('userData'), 'Logs', 'raw')
}
function fileFor(character: string): string {
  return path.join(rawCaptureDir(), `${safeName(character)}_${today()}.xml`)
}

function flush(key: string): void {
  const w = writers.get(key)
  if (!w) return
  if (w.timer) { clearTimeout(w.timer); w.timer = null }
  if (w.buf.length === 0) return
  const text = w.buf.join('')
  try {
    // The player may delete the folder mid-capture (B584).
    fs.mkdirSync(rawCaptureDir(), { recursive: true })
    fs.appendFileSync(w.file, text)
    w.buf = []
  } catch (e) {
    // Keep the lines for the next try; a stuck disk must not grow this forever.
    console.warn('[rawRecorder] append failed:', e)
    if (w.buf.length > MAX_BUFFERED_LINES) w.buf = w.buf.slice(-MAX_BUFFERED_LINES)
  }
}

export function isRawCaptureOn(character: string): boolean {
  return enabled.has(keyFor(character))
}

/** Start capturing for a character; returns the file being written, or null if it can't be written. */
export function startRawCapture(character: string): string | null {
  const file = fileFor(character)
  try {
    fs.mkdirSync(rawCaptureDir(), { recursive: true })
    fs.appendFileSync(file, `[${stamp()}] <!-- Lichborne ${app.getVersion()}: capture started -->\n`)
  } catch (e) {
    console.warn('[rawRecorder] start failed:', e)
    return null
  }
  enabled.add(keyFor(character))
  return file
}

/** Stop capturing for a character, flushing what is buffered. */
export function stopRawCapture(character: string): void {
  const key = keyFor(character)
  if (!enabled.delete(key)) return
  for (const k of writers.keys()) if (k.startsWith(key + '_')) flush(k)
  try { fs.appendFileSync(fileFor(character), `[${stamp()}] <!-- capture stopped -->\n`) } catch { /* ignore */ }
}

/** Append one received line (with its own line ending) if capture is on. */
export function recordRawLine(character: string, line: string): void {
  const key = keyFor(character)
  if (!enabled.has(key)) return
  const wkey = `${key}_${today()}`
  let w = writers.get(wkey)
  if (!w) {
    w = { file: fileFor(character), buf: [], timer: null }
    writers.set(wkey, w)
  }
  w.buf.push(`[${stamp()}] ${line.endsWith('\n') ? line : line + '\n'}`)
  if (!w.timer) w.timer = setTimeout(() => flush(wkey), FLUSH_MS)
}

/** Synchronous flush of every buffer — for shutdown. */
export function flushRawRecorders(): void {
  for (const key of writers.keys()) flush(key)
}
