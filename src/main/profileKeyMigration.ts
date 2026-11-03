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
// each `lichborne.{name}.` scope) and acknowledge. A crash between the two
// keeps the file, and the next start hands it over again.

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

function readPending(): ProfileKeyRename[] {
  try {
    const v = JSON.parse(fs.readFileSync(renamesFile(), 'utf8'))
    return Array.isArray(v) ? v.filter(r => r && typeof r.from === 'string' && typeof r.to === 'string') : []
  } catch { return [] }
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
    try {
      fs.mkdirSync(backupDir, { recursive: true })
      fs.copyFileSync(src, path.join(backupDir, f))
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
    // The NAME, not the file name: localStorage scopes and log folders were
    // named after the session's character, which can differ in case.
    out.push({ from: name.trim(), to: key, file: base })
    console.log(`[profile-keys] ${f} → ${key}.yaml`)
  }
  return out
}

// sessionLog.ts's safeName, which names the folder and the files in it.
function logSafe(s: string): string {
  return (s.trim() || 'Unknown').replace(/[/\\:*?"<>|]/g, '_')
}

function migrateLogs(logsRoot: string, r: ProfileKeyRename): void {
  // By the character's name, else the file's (they differ only in case).
  const byName = path.join(logsRoot, logSafe(r.from))
  const byFile = r.file ? path.join(logsRoot, logSafe(r.file)) : byName
  const from = fs.existsSync(byName) ? byName : byFile
  const oldBase = from === byName ? r.from : (r.file ?? r.from)
  const to = path.join(logsRoot, logSafe(r.to))
  if (!fs.existsSync(from) || fs.existsSync(to)) return
  try { move(from, to) } catch (err) {
    console.error(`[profile-keys] could not move the log folder for ${r.from}`, err)
    return
  }
  const oldPrefix = `${logSafe(oldBase)}_`
  let entries: string[] = []
  try { entries = fs.readdirSync(to) } catch { return }
  for (const e of entries) {
    if (!e.startsWith(oldPrefix)) continue
    try { move(path.join(to, e), path.join(to, `${logSafe(r.to)}_${e.slice(oldPrefix.length)}`)) } catch { /* best effort */ }
  }
}

/** Run once at startup. Returns every rename still waiting for the renderer. */
export function migrateProfileKeys(profilesDir: string, logsRoot: string): ProfileKeyRename[] {
  const backup = path.join(profilesDir, BACKUP_DIR)
  const renames = [
    ...migrateDir(profilesDir, backup),
    ...migrateDir(path.join(profilesDir, 'Archive'), path.join(backup, 'Archive')),
  ]
  for (const r of renames) migrateLogs(logsRoot, r)
  if (renames.length) {
    const pending = [...readPending(), ...renames]
    try { fs.writeFileSync(renamesFile(), JSON.stringify(pending, null, 1)) } catch (err) {
      console.error('[profile-keys] could not record the renames for localStorage', err)
    }
  }
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
