// atomicWrite — crash-safe file replacement for the files users can't afford to
// lose (profiles, saved passwords, AI keys), and quarantine for a file we can't
// read (v0.20.4 persistence pass, DESIGN §53.7).
//
// writeFileAtomic writes the new content to `{target}.tmp`, flushes it to disk,
// then renames it over the target. A crash at any point leaves either the old
// file or the new one, never a truncated mix. The old profile writer deleted
// the target BEFORE renaming, on the belief that a rename can't replace an
// existing file on Windows; Node's rename does replace it (libuv uses
// MOVEFILE_REPLACE_EXISTING), so that delete only opened a window in which a
// crash left no file at all. A rename CAN fail transiently on Windows while
// antivirus or the search indexer holds the file, so it is retried briefly,
// then falls back to COPYING the tmp over the target. The target is never
// deleted first: if every attempt fails the old file is still there and the
// error is thrown, so the caller knows the save didn't happen.
//
// quarantineFile moves an unreadable file aside to
// `{name}.unreadable-{timestamp}` instead of letting a later save overwrite it
// (Principle #3: never silently destroy a file the code doesn't understand).
//
// IMPORTANT distinction (the v0.20.4 bug check): a file that won't PARSE is
// damaged and is moved aside; a file that can't be READ right now (EBUSY,
// EPERM, EACCES while something holds it) is fine and must be left alone, and
// nothing may write over it until it reads again.
import * as fs from 'fs'
import * as path from 'path'

const RENAME_RETRIES = 5
const RENAME_RETRY_MS = 40

function sleepSync(ms: number): void {
  // A short synchronous wait inside a synchronous IPC handler; Atomics.wait on
  // a private buffer blocks without spinning. If a runtime ever refuses it, a
  // retry simply happens sooner.
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* retry immediately */ }
}

const READ_RETRIES = 6
const READ_RETRY_MS = 50

/**
 * readFileSync, retried briefly while the file is LOCKED (EBUSY/EPERM/EACCES:
 * antivirus or the search indexer holding it, usually for milliseconds). A read
 * that fails on a lock makes callers skip the import, and the next save then
 * rebuilds the file from whatever the working copy holds, which on a fresh
 * machine is nothing (final v0.20.4 check). Retrying shrinks that window to a
 * lock lasting longer than ~300ms. Other errors, and a lock that outlasts the
 * retries, are thrown as before. Synchronous on purpose: callers are sync IPC
 * handlers, and the wait only happens on a lock.
 */
export function readFileRetrying(file: string): string {
  let lastErr: unknown
  for (let i = 0; i < READ_RETRIES; i++) {
    try { return fs.readFileSync(file, 'utf8') } catch (err) {
      lastErr = err
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') break
      sleepSync(READ_RETRY_MS)
    }
  }
  throw lastErr
}

export function writeFileAtomic(target: string, content: string, opts?: { mode?: number }): void {
  const tmp = `${target}.tmp`
  const fd = fs.openSync(tmp, 'w', opts?.mode)
  try {
    fs.writeFileSync(fd, content, 'utf8')   // loops on partial writes
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  let lastErr: unknown
  for (let i = 0; i < RENAME_RETRIES; i++) {
    try { fs.renameSync(tmp, target); return } catch (err) {
      lastErr = err
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') break
      sleepSync(RENAME_RETRY_MS)
    }
  }
  // Last resort: copy over the target (it may be locked against a rename but
  // not against a write). Never delete the target first.
  try {
    fs.copyFileSync(tmp, target)
    try { fs.rmSync(tmp, { force: true }) } catch { /* leftover tmp is harmless */ }
  } catch {
    throw lastErr
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

// What was moved aside (or couldn't be), for the renderer to tell the player.
// Every quarantine goes through here — profiles AND the password / AI-key
// stores — so a damaged store doesn't just look like "it forgot my passwords".
// A file that can't be moved is reported ONCE per run: it is re-tried on every
// save, and a toast per attempt would repeat every few seconds.
const notices: { file: string; keptAs: string | null }[] = []
const reportedUnmovable = new Set<string>()
export function takeQuarantineNotices(): { file: string; keptAs: string | null }[] {
  return notices.splice(0)
}

/** Moves `file` aside so nothing overwrites it. Returns the new path, or null. */
export function quarantineFile(file: string, why: string): string | null {
  const dest = `${file}.unreadable-${stamp()}`
  try {
    fs.renameSync(file, dest)
    console.warn(`[persist] ${why}: kept the original as ${dest}`)
    notices.push({ file: path.basename(file), keptAs: path.basename(dest) })
    reportedUnmovable.delete(file)
    return dest
  } catch (err) {
    console.error(`[persist] ${why}: could not move ${file} aside`, err)
    if (!reportedUnmovable.has(file)) {
      reportedUnmovable.add(file)
      notices.push({ file: path.basename(file), keptAs: null })
    }
    return null
  }
}

/** Whether a file was ever moved aside by quarantineFile. Case-insensitive:
 *  on Windows and macOS `Bob.yaml` and `bob.yaml` are the same file. */
export function hasQuarantinedCopy(file: string): boolean {
  try {
    const base = (path.basename(file) + '.unreadable-').toLowerCase()
    return fs.readdirSync(path.dirname(file)).some(f => f.toLowerCase().startsWith(base))
  } catch { return false }
}

/** A parsed file is usable only as a plain object. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Reads a small JSON key→value store (saved passwords, AI keys).
 *   • missing file → {}
 *   • can't be read right now (locked) → null: callers must NOT write
 *   • won't parse → moved aside, then {} (or null if it couldn't be moved)
 */
export function readJsonStore(file: string): Record<string, string> | null {
  if (!fs.existsSync(file)) return {}
  let text: string
  try { text = readFileRetrying(file) }
  catch (err) { console.error(`[persist] ${path.basename(file)} can't be read right now`, err); return null }
  try {
    const parsed: unknown = JSON.parse(text)
    if (isPlainObject(parsed)) return parsed as Record<string, string>
  } catch { /* falls through to quarantine */ }
  return quarantineFile(file, `${path.basename(file)} could not be read`) ? {} : null
}
