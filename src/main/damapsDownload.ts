// Da'Maps download — fetches the Da'Maps maps (.damap files) from their own
// GitHub repository and keeps them in a folder Lichborne owns,
// `{userData}/DaMaps`.
//
// The maps live at github.com/Kaesken/Da-Maps, in its `maps/` folder, so they
// can be fixed and published without a new Lichborne release. This is the same
// download as the Genie maps (genieMapsDownload.ts, whose zip reader and
// download it reuses), with the same rule: the folder is never emptied until
// the new copy is ready.
//   1. download the branch archive into memory (capped);
//   2. read it, check every entry's CRC, and take only `maps/*.damap` and
//      `maps/index.json`; refuse it unless it holds a plausible set of maps;
//   3. write them into `DaMaps.new`, with the marker file;
//   4. swap: DaMaps → DaMaps.old, DaMaps.new → DaMaps, then delete the old
//      copy. A failed swap puts the old folder back.
// A failed download, a truncated zip or a GitHub error page leaves the maps
// you had exactly as they were (Principle #3). Only these three fixed paths
// under userData are ever deleted.
//
// The app builds Da'Maps' map from these files and Lich's map
// (renderer: damaps/damapsWorld.ts); main only fetches and reads them.
//
// Kept free of electron imports, like the Genie download, so a plain-node
// harness can drive it with a fake fetch.
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import type { DaMapsStatus, DaMapsProgress, DaMapsResult, DaMapsFiles } from '../shared/types'
import {
  download, readZip, readZipEntry, relativeParts, renameRetrying, removeDir, FOLDER_IN_USE, type FetchLike,
} from './genieMapsDownload'

export const DAMAPS_ZIP_URL = 'https://github.com/Kaesken/Da-Maps/archive/refs/heads/main.zip'
/** A file in the repository at a commit (or 'main'): the floors' pictures are fetched from here. */
export const DAMAPS_RAW_URL = 'https://raw.githubusercontent.com/Kaesken/Da-Maps'
export const DAMAPS_SOURCE  = 'https://github.com/Kaesken/Da-Maps'
export const DAMAPS_DIRNAME = 'DaMaps'
export const DAMAPS_MARKER  = '.lichborne-damaps.json'

const MAX_UNPACKED_BYTES = 256 * 1024 * 1024   // ~14 MB today
const MIN_MAPS           = 10                  // 116 today

export interface DaMapsMarker {
  source: string
  commit: string | null
  installedAt: number
  maps: number
}

export type { DaMapsStatus, DaMapsProgress, DaMapsResult, DaMapsFiles }

export function damapsDir(userData: string): string {
  return path.join(userData, DAMAPS_DIRNAME)
}

const isDamap = (name: string) => /\.damap$/i.test(name)

/** What is installed now. Never throws. */
export function readDaMapsStatus(userData: string): DaMapsStatus {
  const dir = damapsDir(userData)
  const none: DaMapsStatus = { dir, installed: false, commit: null, installedAt: null, maps: null }
  let maps = 0
  try { maps = fs.readdirSync(dir).filter(isDamap).length } catch { return none }
  if (!maps) return none
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, DAMAPS_MARKER), 'utf-8')) as Partial<DaMapsMarker>
    return {
      dir, installed: true, maps,
      commit: typeof m.commit === 'string' ? m.commit : null,
      installedAt: typeof m.installedAt === 'number' ? m.installedAt : null,
    }
  } catch {
    return { ...none, installed: true, maps }
  }
}

/** Every installed .damap file's text, for the app's build. */
export async function readDaMapsFiles(userData: string): Promise<DaMapsFiles> {
  const status = readDaMapsStatus(userData)
  if (!status.installed) return { status, files: [] }
  const names = (await fsp.readdir(status.dir)).filter(isDamap).sort()
  const files = await Promise.all(names.map(async name => ({ name, text: await fsp.readFile(path.join(status.dir, name), 'utf-8') })))
  return { status, files }
}

/** Write the maps out of the archive into `dest` (empty or absent). */
export async function extractDaMapsZip(
  buf: Buffer,
  dest: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ maps: number; commit: string | null }> {
  const { entries, comment } = readZip(buf)
  // Every entry sits under one top folder (`Da-Maps-main/`); the maps are in
  // its `maps/` folder. Anything else in the repository is left out.
  const first = entries.find(e => e.name.includes('/'))
  const top = first ? first.name.slice(0, first.name.indexOf('/') + 1) : ''
  if (!top || top === '/' || !entries.every(e => e.name.startsWith(top))) {
    throw new Error("the zip is not laid out like the Da'Maps repository")
  }
  const take: { name: string; e: (typeof entries)[number] }[] = []
  let unpacked = 0
  for (const e of entries) {
    if (e.dir) continue
    const parts = relativeParts(e.name, top)
    if (!parts || parts.length !== 2 || parts[0] !== 'maps') continue
    const name = parts[1]
    if (!isDamap(name) && name !== 'index.json') continue
    unpacked += e.size
    take.push({ name, e })
  }
  const maps = take.filter(t => isDamap(t.name)).length
  if (unpacked > MAX_UNPACKED_BYTES) throw new Error('the zip unpacks to more than Lichborne expects')
  if (maps < MIN_MAPS) throw new Error(`the download doesn't look like the Da'Maps maps (${maps} map files)`)

  const root = path.resolve(dest)
  await fsp.mkdir(root, { recursive: true })
  let done = 0
  for (const { name, e } of take) {
    const target = path.resolve(root, name)
    if (!target.startsWith(root + path.sep)) throw new Error(`unsafe file name in the zip: "${e.name}"`)
    await fsp.writeFile(target, await readZipEntry(buf, e))
    onProgress?.(++done, take.length)
  }
  const sha = comment.trim()
  return { maps, commit: /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null }
}

let inflight: Promise<DaMapsResult> | null = null

/** Download and install (or replace) the maps. A second call while one runs joins it. */
export function installDaMaps(opts: {
  userData: string
  fetchImpl: FetchLike
  url?: string
  onProgress?: (p: DaMapsProgress) => void
}): Promise<DaMapsResult> {
  if (inflight) return inflight
  inflight = runInstall(opts).finally(() => { inflight = null })
  return inflight
}

async function runInstall({ userData, fetchImpl, url = DAMAPS_ZIP_URL, onProgress }: {
  userData: string
  fetchImpl: FetchLike
  url?: string
  onProgress?: (p: DaMapsProgress) => void
}): Promise<DaMapsResult> {
  const dir = damapsDir(userData)
  const staging = dir + '.new'
  const old = dir + '.old'
  try {
    // Leftovers from a run killed part-way: `.old` is the last good copy only
    // when DaMaps itself is missing.
    if (!fs.existsSync(dir) && fs.existsSync(old)) await renameRetrying(old, dir)
    await removeDir(staging)
    await removeDir(old)

    const zip = await download(fetchImpl, url, (received, total) =>
      onProgress?.({ phase: 'download', received, total }))
    const { maps, commit } = await extractDaMapsZip(zip, staging, (done, total) =>
      onProgress?.({ phase: 'extract', done, total }))
    const marker: DaMapsMarker = { source: DAMAPS_SOURCE, commit, installedAt: Date.now(), maps }
    await fsp.writeFile(path.join(staging, DAMAPS_MARKER), JSON.stringify(marker, null, 2), 'utf-8')

    onProgress?.({ phase: 'replace' })
    const hadOld = fs.existsSync(dir)
    if (hadOld) {
      try { await renameRetrying(dir, old) } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        if (process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
          throw new Error(FOLDER_IN_USE.replace('the Genie maps folder', "the Da'Maps folder"))
        }
        throw e
      }
    }
    try {
      await renameRetrying(staging, dir)
    } catch (e) {
      if (hadOld) { try { await renameRetrying(old, dir) } catch { /* left as .old; restored next run */ } }
      throw e
    }
    if (hadOld) await removeDir(old).catch(() => { /* removed next run */ })
    return { ok: true, status: readDaMapsStatus(userData) }
  } catch (e) {
    await removeDir(staging).catch(() => {})
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Pictures ────────────────────────────────────────────────────────────────
// A floor's painted picture (made by the DaMaps Editor) is NOT part of the
// download: a full set would be many times the size of the maps, and most
// players never open most maps. Each is fetched the first time someone opens
// its map with pictures turned on, from the same commit as the maps they have,
// and kept in DaMaps/art. An Update replaces the whole folder, art included, so
// a changed picture is fetched again next time.

const ART_NAME = /^[^\\/:*?"<>|]+\.(png|webp|jpe?g)$/i
const artInflight = new Map<string, Promise<Buffer | null>>()

/** The bytes of a floor's picture, from the cache or GitHub. Null when it can't be had. */
export function readDaMapsArt(userData: string, file: string, fetchImpl: FetchLike): Promise<Buffer | null> {
  if (!ART_NAME.test(file) || file.startsWith('.')) return Promise.resolve(null)
  const key = file.toLowerCase()
  const running = artInflight.get(key)
  if (running) return running
  const job = fetchArt(userData, file, fetchImpl).finally(() => artInflight.delete(key))
  artInflight.set(key, job)
  return job
}

async function fetchArt(userData: string, file: string, fetchImpl: FetchLike): Promise<Buffer | null> {
  const status = readDaMapsStatus(userData)
  if (!status.installed) return null
  const cached = path.join(status.dir, 'art', file)
  try { return await fsp.readFile(cached) } catch { /* not fetched yet */ }
  const url = `${DAMAPS_RAW_URL}/${status.commit ?? 'main'}/art/${encodeURIComponent(file)}`
  let bytes: Buffer
  try { bytes = await download(fetchImpl, url, () => {}) } catch (e) {
    console.warn(`[Da'Maps] picture ${file}: ${(e as Error).message}`)
    return null
  }
  // keep it, unless the maps were updated meanwhile (then it may be the old picture)
  if (readDaMapsStatus(userData).commit === status.commit) {
    try {
      await fsp.mkdir(path.dirname(cached), { recursive: true })
      const tmp = `${cached}.${process.pid}.tmp`
      await fsp.writeFile(tmp, bytes)
      await fsp.rename(tmp, cached)
    } catch { /* cache only: it's fetched again next time */ }
  }
  return bytes
}
