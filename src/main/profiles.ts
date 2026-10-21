// profiles — disk I/O for the YAML profile store, {userData}/profiles/ (DESIGN §20).
//
// YAML is truth for user state (Principle #1): `_shared.yaml` plus one
// `{Character}.yaml` each. This file owns PATHS and RAW read/write only —
// payloads are `unknown` here; profile shape, versioning and migrations are
// the caller's concern. What it does own:
//
//  • Atomic writes (writeFileAtomic: fsync'd tmp + rename) so a crash mid-save
//    can't corrupt a profile, and QUARANTINE of a file that can't be parsed:
//    it is moved aside rather than overwritten by the next save (v0.20.4).
//  • The one-time v0.6.4 legacy migration (install-dir → userData; the NSIS
//    uninstaller wiped $INSTDIR on every upgrade — pitfall #3). It runs at
//    first access via getProfilesDir(), copies without deleting the legacy dir.
//  • Timestamped rolling backups ({name}.yaml.{ts}.bak, retention 5), written
//    by backupAllProfiles() on clean shutdown.
//  • Sibling folders: Exports/ (Profile Transfer .lb.yaml bundles, F38) and
//    profiles/Archive/ (v0.18.2 — removing an ACCOUNT moves its characters'
//    YAMLs here instead of deleting; see the Archive section for why it must
//    stay a subdirectory of profiles/).
//
// ensureProfilesDir() is the canonical accessor; go through it (or the
// read/write functions here) rather than composing profile paths elsewhere.
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { writeFileAtomic, readFileRetrying, quarantineFile, isPlainObject, hasQuarantinedCopy, takeQuarantineNotices } from './atomicWrite'

// v0.6.4: profiles moved from `<install-dir>/profiles/` to `<userData>/profiles/`
// (= `%APPDATA%\Lichborne\profiles\` on Windows). The legacy install-dir location
// got wiped by the NSIS uninstaller on every upgrade because electron-builder's
// NSIS template runs the previous version's uninstaller before extracting the
// new one, removing everything inside $INSTDIR. userData is owned by Electron,
// lives outside the install footprint, and is the standard place for user data
// in every other Electron app — it survives upgrades and uninstalls (unless the
// user explicitly opts in to data removal via nsis.deleteAppDataOnUninstall).

// Internal helper — returns the canonical path without triggering migration.
// Used by the migration routine itself (which would otherwise recurse).
function _profilesDirPath(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'profiles')
  return path.join(app.getAppPath(), 'profiles')
}

// Pre-v0.6.4 production location. Migration only — never written to going forward.
function _legacyProfilesDirPath(): string | null {
  if (!app.isPackaged) return null
  return path.join(path.dirname(app.getPath('exe')), 'profiles')
}

// One-time migration: copy YAML/backup files from the legacy install-dir
// location to the new userData location if (a) legacy dir exists and has YAMLs,
// AND (b) the new location is empty or missing. Idempotent — once the new dir
// has any YAML, this is a no-op. Does NOT delete the legacy directory — leaves
// it alone so a user with concerns can verify before manually removing.
let _migrationChecked = false
function migrateLegacyProfilesDir(): void {
  if (_migrationChecked) return
  _migrationChecked = true
  const legacy = _legacyProfilesDirPath()
  if (!legacy) return
  try {
    if (!fs.existsSync(legacy)) return
    const target = _profilesDirPath()
    const targetHasYaml = fs.existsSync(target)
      && fs.readdirSync(target).some(f => f.endsWith('.yaml'))
    if (targetHasYaml) return
    const yamlLike = fs.readdirSync(legacy).filter(f => /\.(yaml|bak)$/.test(f))
    if (yamlLike.length === 0) return
    if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true })
    for (const name of yamlLike) {
      try { fs.copyFileSync(path.join(legacy, name), path.join(target, name)) }
      catch (e) { console.warn(`[profiles] migrate copy failed for ${name}:`, e) }
    }
    console.log(`[profiles] Migrated ${yamlLike.length} legacy file(s) from ${legacy} -> ${target}`)
  } catch (e) {
    console.warn('[profiles] Legacy profile migration check failed:', e)
  }
}

// Public accessor — every read/write path goes through this, so the migration
// check runs once at first access. After the first call, the `_migrationChecked`
// flag makes subsequent calls trivial.
function getProfilesDir(): string {
  migrateLegacyProfilesDir()
  return _profilesDirPath()
}

// Exported variant that GUARANTEES the directory exists on disk. Used by the
// "Open Profiles Folder" menu item: clicking it must always succeed even on a
// fresh install where no profile has been written yet (without this, Windows
// shows a "cannot find" dialog because the path is computed but never created).
export function ensureProfilesDir(): string {
  const dir = getProfilesDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── Exports folder (Profile Transfer feature) ────────────────────────────────
// Sibling of `profiles/` in userData ({userData}/Exports packaged,
// {appPath}/Exports in dev). Holds `.lb.yaml` profile-transfer bundles the
// user produces via Launcher → Transfer → Export, and is the default location
// the import file picker opens into. Mirrors the profiles-dir base-dir logic
// so the two folders live side by side. No legacy migration — this is new.
export function getExportsDir(): string {
  if (app.isPackaged) return path.join(app.getPath('userData'), 'Exports')
  return path.join(app.getAppPath(), 'Exports')
}

export function ensureExportsDir(): string {
  const dir = getExportsDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Paths a save must NOT write over right now, and why:
//  • 'unmovable' — the file is damaged and couldn't be moved aside, so it is
//    still the only copy of whatever it held;
//  • 'unreadable' — the file couldn't be READ (locked by antivirus, the indexer,
//    another process). It is probably fine; it just isn't available.
// A block lifts when the file is gone, or (unmovable) when it finally moves
// aside, or (unreadable) when a READ through readProfileFile succeeds. The
// first version lifted 'unreadable' on main's own raw re-read at write time,
// which let a save through whose renderer side had read nothing — it wrote a
// profile that never merged favorite, notes and the other launcher fields
// (second bug check). Every saver reads first, so the next save re-reads,
// lifts the block, and merges properly.
const blocked = new Map<string, 'unmovable' | 'unreadable'>()

// What was moved aside this session, for the launcher to tell the player
// (otherwise the character just vanishes from the list with no reason given).
// One queue for every quarantine, including the password / AI-key stores.
export function takeProfileNotices(): { file: string; keptAs: string | null }[] {
  return takeQuarantineNotices()
}

function stillBlocked(file: string): boolean {
  const why = blocked.get(file)
  if (!why) return false
  if (!fs.existsSync(file)) { blocked.delete(file); return false }
  if (why === 'unreadable') return true
  if (quarantineFile(file, `${path.basename(file)} could not be read`)) { blocked.delete(file); return false }
  return true
}

function atomicWriteFile(targetPath: string, content: string): void {
  if (stillBlocked(targetPath)) {
    // Thrown, not swallowed: the renderer's save then fails visibly in the
    // console instead of believing it succeeded.
    throw new Error(`not overwriting ${path.basename(targetPath)}: it can't be read right now`)
  }
  writeFileAtomic(targetPath, content)
}

// Reads and parses a profile.
//  • A file that won't PARSE to an object (a syntax error, an empty or truncated
//    file after a crash) used to read exactly like "no file", and the next
//    connect wrote a blank profile over it. It is now moved aside to
//    `{name}.unreadable-{ts}` first (v0.20.4, Principle #3).
//  • A file that can't be READ right now is left exactly where it is and
//    blocked from being overwritten; that is a lock, not damage.
// A leftover `.tmp` is NOT promoted when the file is missing: since v0.20.4 the
// writer never deletes the target first, so a missing file with a `.tmp` is a
// file the player deleted or archived, and a truncated YAML can still parse
// (second bug check — it brought deleted characters back).
function readProfileFile(file: string): unknown | null {
  if (!fs.existsSync(file)) return null
  let text: string
  try { text = readFileRetrying(file) }
  catch (err) {
    console.warn(`[persist] ${path.basename(file)} can't be read right now`, err)
    blocked.set(file, 'unreadable')
    return null
  }
  let parsed: unknown
  try { parsed = yaml.load(text) }
  catch (err) { console.warn(`[persist] ${path.basename(file)} is not valid YAML`, err); parsed = undefined }
  if (isPlainObject(parsed)) { blocked.delete(file); return parsed }
  const keptAs = quarantineFile(file, `${path.basename(file)} could not be read`)
  if (keptAs) blocked.delete(file); else blocked.set(file, 'unmovable')
  return null
}

export function readSharedProfile(): unknown | null {
  return readProfileFile(path.join(getProfilesDir(), '_shared.yaml'))
}

export function writeSharedProfile(data: unknown): void {
  ensureProfilesDir()
  atomicWriteFile(
    path.join(getProfilesDir(), '_shared.yaml'),
    yaml.dump(data, { lineWidth: 120, noRefs: true }),
  )
}

export function readCharacterProfile(character: string): unknown | null {
  return readProfileFile(path.join(getProfilesDir(), `${character}.yaml`))
}

// Whether a character has a profile file at all. The connect path asks BEFORE
// reading: when the file exists but turns out unreadable or from a newer
// version, the local working copy is the best copy of the user's settings and
// must not be cleared (see importCharacterProfile's callers).
export function characterProfileExists(character: string): boolean {
  const file = path.join(getProfilesDir(), `${character}.yaml`)
  // A file moved aside as unreadable counts. The launcher reads every profile at
  // startup, so by the time a player connects, a damaged file has usually
  // ALREADY been moved; answering "no file" then cleared the very working copy
  // the move was meant to protect (v0.20.4 bug check).
  return fs.existsSync(file) || hasQuarantinedCopy(file)
}

export function writeCharacterProfile(character: string, data: unknown): void {
  ensureProfilesDir()
  atomicWriteFile(
    path.join(getProfilesDir(), `${character}.yaml`),
    yaml.dump(data, { lineWidth: 120, noRefs: true }),
  )
}

export function listCharacterProfiles(): string[] {
  try {
    const dir = getProfilesDir()
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.yaml') && f !== '_shared.yaml')
      .map(f => f.replace(/\.yaml$/, ''))
  } catch { return [] }
}

// Deletes a character's profile YAML and its rolling backup. Used by the
// Launcher's right-click → Delete action. Silently no-ops if the file is
// already gone. The saved password (keyed by account, not character) is
// intentionally left alone — multiple characters may share an account.
// ── Archive (v0.18.2) ───────────────────────────────────────────────────────
// Removing an ACCOUNT from the launcher must not destroy the characters on it
// (Sekmeht: "the characters' profiles and logs should remain, just in case they
// are added back at another time"). So their YAMLs are MOVED here rather than
// deleted, and re-adding the account puts them back with their themes, layout,
// automations and contacts intact.
//
// It lives INSIDE profiles/ deliberately: both directory readers filter on
// `.endsWith('.yaml')` (listCharacterProfiles, and backupAllProfiles through
// it), so a subdirectory is invisible to them and the archive cannot leak back
// into the launcher's character list. If you ever change that filter to
// something looser, exclude this folder explicitly.
//
// Logs are NOT touched by any of this — they live under {userData}/Logs and
// nothing here reaches them, so a returning character keeps its history with a
// gap for the time it was away.
export function getArchiveDir(): string {
  return path.join(getProfilesDir(), 'Archive')
}

function ensureArchiveDir(): string {
  const dir = getArchiveDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Character names with an archived profile waiting to be restored. */
export function listArchivedProfiles(): string[] {
  try {
    const dir = getArchiveDir()
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.yaml'))
      .map(f => f.replace(/\.yaml$/, ''))
  } catch { return [] }
}

// Move one profile (and its backups, so the live folder is left clean) into the
// archive. Returns false only if there was nothing to move.
//
// `renameSync` with a copy+unlink fallback: a rename is atomic within a volume,
// but userData can sit on a different filesystem from a redirected profiles
// folder, where rename throws EXDEV.
function moveProfile(character: string, fromDir: string, toDir: string): boolean {
  const src = path.join(fromDir, `${character}.yaml`)
  if (!fs.existsSync(src)) return false
  // A leftover .tmp from a failed save must not outlive the profile it belonged to.
  try { fs.rmSync(`${src}.tmp`, { force: true }) } catch { /* harmless */ }
  const dest = path.join(toDir, `${character}.yaml`)
  const move = (a: string, b: string) => {
    try {
      fs.renameSync(a, b)
    } catch {
      fs.copyFileSync(a, b)
      fs.unlinkSync(a)
    }
  }
  try {
    move(src, dest)
  } catch (err) {
    console.error('[profiles] archive move failed for', src, err)
    return false
  }
  // Backups follow the profile so the source folder does not accumulate
  // orphaned .bak files for a character that is no longer there.
  for (const backup of backupFilesFor(src)) {
    try { move(backup, path.join(toDir, path.basename(backup))) } catch { /* best effort */ }
  }
  return true
}

/** Move a character's profile OUT of the launcher's view, keeping the data. */
export function archiveCharacterProfile(character: string): boolean {
  const to = ensureArchiveDir()
  return moveProfile(character, getProfilesDir(), to)
}

/** Put an archived profile back. No-ops (false) if nothing is archived. */
export function restoreCharacterProfile(character: string): boolean {
  const from = getArchiveDir()
  if (!fs.existsSync(from)) return false
  // Never clobber a live profile with an archived one — if a character of the
  // same name was created while this was archived, the LIVE file wins and the
  // archived copy stays put rather than silently replacing real settings.
  if (fs.existsSync(path.join(getProfilesDir(), `${character}.yaml`))) return false
  return moveProfile(character, from, ensureProfilesDir())
}

export function deleteCharacterProfile(character: string): void {
  const dir = getProfilesDir()
  const target = path.join(dir, `${character}.yaml`)
  try { if (fs.existsSync(target)) fs.unlinkSync(target) } catch (err) {
    console.error('[profiles] delete failed for', target, err)
  }
  try { fs.rmSync(`${target}.tmp`, { force: true }) } catch { /* harmless */ }
  // Remove every backup that belongs to this character — both legacy
  // {name}.yaml.bak and the new timestamped {name}.yaml.{ts}.bak.
  for (const backup of backupFilesFor(target)) {
    try { fs.unlinkSync(backup) } catch (err) {
      console.error('[profiles] backup delete failed for', backup, err)
    }
  }
}

// ── Backups ───────────────────────────────────────────────────────────────────
// Timestamped rolling backups: every clean shutdown writes a new
// {name}.yaml.{YYYY-MM-DDTHH-MM-SS}.bak alongside the live file, then prunes
// older copies so only the N most recent remain. Timestamps prevent a corrupt
// shutdown from overwriting the last known-good copy (the prior single-.bak
// scheme would silently replace yesterday's good backup with today's bad one).
// Backups stay in profiles/ next to the live files — no separate directory to
// manage.

const BACKUP_RETENTION = 5

function backupTimestamp(d: Date = new Date()): string {
  // Filesystem-safe ISO-ish: 2026-05-16T11-33-45
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

// Matches both legacy `{name}.yaml.bak` and timestamped `{name}.yaml.{ts}.bak`
// so old backups from earlier versions are still recognized for pruning/cleanup.
function backupFilesFor(targetPath: string): string[] {
  const dir = path.dirname(targetPath)
  const base = path.basename(targetPath)
  try {
    return fs.readdirSync(dir)
      .filter(f => f === `${base}.bak` || (f.startsWith(`${base}.`) && f.endsWith('.bak')))
      .map(f => path.join(dir, f))
  } catch { return [] }
}

function pruneOldBackups(targetPath: string, keep: number): void {
  const all = backupFilesFor(targetPath)
  if (all.length <= keep) return
  // Sort by mtime descending — keep `keep` newest, unlink the rest. mtime
  // works whether the file is legacy (`{name}.yaml.bak`) or timestamped.
  const sorted = all
    .map(p => ({ p, mtime: (() => { try { return fs.statSync(p).mtimeMs } catch { return 0 } })() }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const { p } of sorted.slice(keep)) {
    try { fs.unlinkSync(p) } catch (err) { console.error('[profiles] prune failed for', p, err) }
  }
}

function copyToBackup(targetPath: string): void {
  if (!fs.existsSync(targetPath)) return
  const backupPath = `${targetPath}.${backupTimestamp()}.bak`
  try {
    fs.copyFileSync(targetPath, backupPath)
    pruneOldBackups(targetPath, BACKUP_RETENTION)
  } catch (err) {
    console.error('[profiles] backup failed for', targetPath, err)
  }
}

export function backupAllProfiles(): void {
  const dir = getProfilesDir()
  if (!fs.existsSync(dir)) return
  // Never back up a file we know is damaged or unreadable: rotation keeps 5,
  // and copies of a broken file would push the good backups out.
  const backup = (file: string) => { if (!blocked.has(file)) copyToBackup(file) }
  backup(path.join(dir, '_shared.yaml'))
  for (const character of listCharacterProfiles()) {
    backup(path.join(dir, `${character}.yaml`))
  }
}
