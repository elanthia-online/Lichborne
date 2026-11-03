// profileKeyMigration — the one-time move from name-keyed to `Name@SHARD`-keyed
// character data (DESIGN §56.7.3). Runs at app-ready, before the first window.
//
// What moves, for every legacy `profiles/{Name}.yaml` (and the same in
// profiles/Archive/):
//   • the YAML → `{Name}@{SHARD}.yaml`, with its `.bak` backups;
//   • the Session Log folder `Logs/{Name}/` → `Logs/{Name}@{SHARD}/`, and each
//     `{Name}_YYYY-MM-DD.log[.gz]` inside it (the day list is built from that
//     prefix).
// The key comes from the file's OWN `character` and `game` — the same inputs
// loadCharacterCards reads — so a pre-GS4 profile lands on its DR shard (DR
// Prime when it names no game), and the key a session derives matches its file.
//
// Safety (Principles #3, #8):
//   • every legacy YAML is COPIED to profiles/PreKeyBackup/ first, and nothing
//     is ever deleted;
//   • a file that can't be READ right now (locked) is left where it is; one
//     that won't PARSE is moved aside exactly as readProfileFile would, so the
//     launcher's "couldn't be read" notice still reaches the player;
//   • a target that already exists wins, and the legacy file goes into the
//     backup folder rather than staying live, where it would show as a second
//     tile (an older build writing `Name.yaml` again after a migration);
//   • it is idempotent: a second run finds no legacy names and does nothing.
//
// The renderer owns localStorage, so the old→new names are written to
// {userData}/profile-key-renames.json for the primary window to apply (move
// each `lichborne.{name}.` scope) and acknowledge. Each rename is recorded the
// moment its YAML moves, not after the whole pass: the next start finds no
// legacy names, so a rename not on record by then would never reach the
// renderer. A crash before the acknowledgement keeps the file, and the next
// start hands it over again.
//
// A log folder that can't move right now (a day file held open on Windows)
// stays on {userData}/profile-key-log-moves.json and is retried at every start,
// file by file, never overwriting a day the new folder already has.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { isProfileKey, profileKey } from '../shared/profileKey'
import { quarantineFile } from './atomicWrite'

export interface ProfileKeyRename { from: string; to: string; file?: string }

const BACKUP_DIR = 'PreKeyBackup'

function renamesFile(): string {
  return path.join(app.getPath('userData'), 'profile-key-renames.json')
}

function move(a: string, b: string): void {
  try { fs.renameSync(a, b) } catch { fs.copyFileSync(a, b); fs.unlinkSync(a) }
}

function logMovesFile(): string {
  return path.join(app.getPath('userData'), 'profile-key-log-moves.json')
}

function readList(file: string): ProfileKeyRename[] {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(v) ? v.filter(r => r && typeof r.from === 'string' && typeof r.to === 'string') : []
  } catch { return [] }
}

function writeList(file: string, list: ProfileKeyRename[], what: string): boolean {
  try {
    if (list.length) fs.writeFileSync(file, JSON.stringify(list, null, 1))
    else fs.rmSync(file, { force: true })
    return true
  } catch (err) {
    console.error(`[profile-keys] could not record ${what}`, err)
    return false
  }
}

function readPending(): ProfileKeyRename[] {
  return readList(renamesFile())
}

/** Put one rename on record for the renderer (localStorage) and the log move.
 *  False when it can't be: the caller then leaves the YAML where it is. */
function recordRename(r: ProfileKeyRename): boolean {
  return writeList(renamesFile(), [...readPending(), r], 'the rename for localStorage')
    && writeList(logMovesFile(), [...readList(logMovesFile()), r], 'the log folder move')
}

/** `dir/name`, or a stamped sibling when that is taken: a backup never overwrites a backup. */
function freeBackupPath(dir: string, name: string): string {
  const first = path.join(dir, name)
  if (!fs.existsSync(first)) return first
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(dir, name.replace(/\.yaml$/, `.${stamp}.yaml`))
}

/** Rename one folder's legacy profiles. `backupDir` receives a copy of each. */
function migrateDir(dir: string, backupDir: string): ProfileKeyRename[] {
  if (!fs.existsSync(dir)) return []
  let files: string[]
  try { files = fs.readdirSync(dir) } catch { return [] }
  const out: ProfileKeyRename[] = []
  for (const f of files) {
    if (!f.endsWith('.yaml') || f === '_shared.yaml') continue
    const base = f.slice(0, -'.yaml'.length)
    if (isProfileKey(base)) continue
    const src = path.join(dir, f)
    let text: string
    try { text = fs.readFileSync(src, 'utf8') } catch (err) {
      console.warn(`[profile-keys] ${f} can't be read right now; left as it is`, err)
      continue
    }
    let parsed: unknown
    try { parsed = yaml.load(text) } catch { parsed = undefined }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      quarantineFile(src, `${f} could not be read`)
      continue
    }
    const p = parsed as { character?: unknown; game?: unknown }
    const name = typeof p.character === 'string' && p.character.trim() ? p.character : base
    const key = profileKey(name, typeof p.game === 'string' ? p.game : undefined)
    const dest = path.join(dir, `${key}.yaml`)
    if (fs.existsSync(dest)) {
      try {
        fs.mkdirSync(backupDir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        move(src, path.join(backupDir, `${base}.superseded-${stamp}.yaml`))
        console.warn(`[profile-keys] ${key}.yaml already exists; ${f} moved to ${path.basename(backupDir)}/`)
      } catch (err) {
        console.error(`[profile-keys] could not move ${f} aside`, err)
      }
      continue
    }
    // On record BEFORE the move. Once the YAML has its new name the next start
    // finds nothing legacy, so an unrecorded rename would never reach
    // localStorage or the log folder. Recorded but not moved (the move below
    // fails) is harmless: the scope and log folder go where the YAML will land
    // on the next start, which retries the move and records it again.
    // The NAME, not the file name: localStorage scopes and log folders were
    // named after the session's character, which can differ in case.
    const rename = { from: name.trim(), to: key, file: base }
    if (!recordRename(rename)) {
      console.error(`[profile-keys] ${f} left as it is until its rename can be recorded`)
      continue
    }
    try {
      fs.mkdirSync(backupDir, { recursive: true })
      // PreKeyBackup/ is the way back from a one-way migration, so a later
      // run (an older build wrote Name.yaml again) must not overwrite it.
      fs.copyFileSync(src, freeBackupPath(backupDir, f))
      move(src, dest)
    } catch (err) {
      console.error(`[profile-keys] could not move ${f}`, err)
      continue
    }
    // Its rolling backups follow it, renamed to the new base.
    for (const b of files) {
      if (b === `${f}.bak` || (b.startsWith(`${f}.`) && b.endsWith('.bak'))) {
        try { move(path.join(dir, b), path.join(dir, `${key}.yaml${b.slice(f.length)}`)) } catch { /* best effort */ }
      }
    }
    out.push(rename)
    console.log(`[profile-keys] ${f} → ${key}.yaml`)
  }
  return out
}

// sessionLog.ts's safeName, which names the folder and the files in it.
function logSafe(s: string): string {
  return (s.trim() || 'Unknown').replace(/[/\\:*?"<>|]/g, '_')
}

/** Move one character's log folder. True when nothing is left to retry. */
function migrateLogs(logsRoot: string, r: ProfileKeyRename): boolean {
  // By the character's name, else the file's (they differ only in case).
  const byName = path.join(logsRoot, logSafe(r.from))
  const byFile = r.file ? path.join(logsRoot, logSafe(r.file)) : byName
  const from = fs.existsSync(byName) ? byName : byFile
  if (!fs.existsSync(from)) return true
  const oldBase = from === byName ? r.from : (r.file ?? r.from)
  const oldPrefix = `${logSafe(oldBase)}_`
  const newPrefix = `${logSafe(r.to)}_`
  const to = path.join(logsRoot, logSafe(r.to))
  const dayName = (e: string) => (e.startsWith(oldPrefix) ? newPrefix + e.slice(oldPrefix.length) : e)

  // The whole folder at once when nothing is there yet; then its day files.
  if (!fs.existsSync(to)) {
    try {
      fs.renameSync(from, to)
      let entries: string[] = []
      try { entries = fs.readdirSync(to) } catch { /* the folder moved; names stay old */ }
      for (const e of entries) {
        if (dayName(e) === e) continue
        try { fs.renameSync(path.join(to, e), path.join(to, dayName(e))) } catch { /* listDays reads any prefix */ }
      }
      return true
    } catch (err) {
      console.warn(`[profile-keys] could not move the log folder for ${r.from} as a whole; moving its files`, err)
    }
  }

  // File by file: what can move now moves, the rest is retried next start. A
  // day the new folder already has is kept where it is, never overwritten.
  try { fs.mkdirSync(to, { recursive: true }) } catch (err) {
    console.error(`[profile-keys] could not create ${logSafe(r.to)}/`, err)
    return false
  }
  let entries: string[]
  try { entries = fs.readdirSync(from) } catch { return false }
  let failed = 0
  for (const e of entries) {
    const dest = path.join(to, dayName(e))
    if (fs.existsSync(dest)) {
      console.warn(`[profile-keys] ${path.basename(from)}/${e} kept: ${logSafe(r.to)}/ already has ${dayName(e)}`)
      continue
    }
    try { move(path.join(from, e), dest) } catch (err) {
      failed++
      console.warn(`[profile-keys] could not move ${path.basename(from)}/${e}; will retry next start`, err)
    }
  }
  if (failed === 0) { try { fs.rmdirSync(from) } catch { /* a kept day is still in it */ } }
  return failed === 0
}

/** Run at every startup (a no-op once nothing is legacy). Returns every rename still waiting for the renderer. */
export function migrateProfileKeys(profilesDir: string, logsRoot: string): ProfileKeyRename[] {
  const backup = path.join(profilesDir, BACKUP_DIR)
  migrateDir(profilesDir, backup)
  migrateDir(path.join(profilesDir, 'Archive'), path.join(backup, 'Archive'))
  // Every log move on record, this run's and any an earlier start couldn't finish.
  const logMoves = readList(logMovesFile())
  if (logMoves.length) writeList(logMovesFile(), logMoves.filter(r => !migrateLogs(logsRoot, r)), 'the log folder moves left')
  return readPending()
}

/** The renames the renderer still has to apply to localStorage. */
export function pendingProfileKeyRenames(): ProfileKeyRename[] {
  return readPending()
}

/** The renderer applied them: forget the list. */
export function ackProfileKeyRenames(): void {
  try { fs.rmSync(renamesFile(), { force: true }) } catch { /* harmless */ }
}
