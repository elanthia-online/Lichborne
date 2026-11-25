// Genie maps download — fetches the community Genie maps from GitHub and keeps
// them in a folder Lichborne owns, `{userData}/GenieMaps` (v1.0.2).
//
// The source is the branch archive GitHub serves for GenieClient/Maps
// (`GENIE_MAPS_ZIP_URL`). Every entry in it sits under one top folder
// (`Maps-main/`); that folder is stripped, so the map XMLs land directly in
// GenieMaps, the shape Genie and Lichborne both expect. The archive's zip
// comment is the commit it was cut from; it is kept in the marker file.
//
// An install never empties the folder until the new copy is ready:
//   1. download the whole zip into memory (about 4 MB today; capped);
//   2. read it, check every entry's CRC, and refuse it unless it holds a
//      plausible set of maps (`MIN_MAPS` top-level Map*.xml);
//   3. extract into `GenieMaps.new`, write the marker file;
//   4. swap: GenieMaps → GenieMaps.old, GenieMaps.new → GenieMaps, then delete
//      the old copy. A failed swap puts the old folder back.
// So a failed download, a truncated zip or a GitHub error page leaves the
// existing maps exactly as they were (Principle #3).
//
// It only ever deletes these three fixed paths under userData. A folder the
// player picked themselves is never touched.
//
// The zip reader is hand-rolled (the codebase's no-new-dependency habit):
// stored and deflated entries only; ZIP64, encryption and multi-disk archives
// are refused rather than guessed at. Entry names are checked so nothing can
// be written outside the staging folder.
//
// Kept free of electron imports: main passes `net.fetch` in, so a plain-node
// harness can drive it with a fake fetch.
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import * as zlib from 'zlib'
import { promisify } from 'util'
import type { GenieMapsStatus, GenieMapsProgress, GenieMapsResult } from '../shared/types'

const inflateRaw = promisify(zlib.inflateRaw)

export const GENIE_MAPS_ZIP_URL = 'https://github.com/GenieClient/Maps/archive/refs/heads/main.zip'
export const GENIE_MAPS_SOURCE  = 'https://github.com/GenieClient/Maps'
export const GENIE_MAPS_DIRNAME = 'GenieMaps'
export const GENIE_MAPS_MARKER  = '.lichborne-genie-maps.json'

const MAX_ZIP_BYTES      = 64 * 1024 * 1024    // the archive is ~4 MB
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024   // ~18 MB today
const MAX_ENTRIES        = 10_000              // 163 today
const MIN_MAPS           = 10                  // ~120 top-level Map*.xml today
const IDLE_TIMEOUT_MS    = 30_000              // no bytes for this long = give up

export interface GenieMapsMarker {
  source: string
  commit: string | null
  installedAt: number
  maps: number
}

export type { GenieMapsStatus, GenieMapsProgress, GenieMapsResult }

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  body: ReadableStream<Uint8Array> | null
}>

export function genieMapsDir(userData: string): string {
  return path.join(userData, GENIE_MAPS_DIRNAME)
}

/** What is installed in the managed folder now. Never throws. */
export function readGenieMapsStatus(userData: string): GenieMapsStatus {
  const dir = genieMapsDir(userData)
  const none: GenieMapsStatus = { dir, installed: false, commit: null, installedAt: null, maps: null }
  try {
    const raw = fs.readFileSync(path.join(dir, GENIE_MAPS_MARKER), 'utf-8')
    const m = JSON.parse(raw) as Partial<GenieMapsMarker>
    return {
      dir,
      installed: true,
      commit: typeof m.commit === 'string' ? m.commit : null,
      installedAt: typeof m.installedAt === 'number' ? m.installedAt : null,
      maps: typeof m.maps === 'number' ? m.maps : null,
    }
  } catch {
    // No marker: installed only if the folder still holds map files (a marker
    // lost to a hand edit shouldn't make the player download again).
    try {
      const maps = fs.readdirSync(dir).filter(isTopLevelMap).length
      return maps > 0 ? { ...none, installed: true, maps } : none
    } catch { return none }
  }
}

function isTopLevelMap(name: string): boolean {
  return /^map.*\.xml$/i.test(name)
}

// ── Zip reading ───────────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string          // as stored, '/'-separated
  dir: boolean
  method: number
  crc: number
  compressedSize: number
  size: number
  dataStart: number
}

export interface ZipArchive {
  entries: ZipEntry[]
  comment: string
}

export function readZip(buf: Buffer): ZipArchive {
  const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50
  // End of central directory: 22 bytes, plus a comment of up to 65535.
  const lowest = Math.max(0, buf.length - 22 - 0xffff)
  let eocd = -1
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const disk = buf.readUInt16LE(eocd + 4)
  const cdDisk = buf.readUInt16LE(eocd + 6)
  const count = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const commentLen = buf.readUInt16LE(eocd + 20)
  if (disk !== 0 || cdDisk !== 0) throw new Error('multi-part zip files are not supported')
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported')
  }
  if (count > MAX_ENTRIES) throw new Error(`too many files in the zip (${count})`)
  if (cdOffset + cdSize > eocd) throw new Error('the zip is damaged (directory out of range)')
  const comment = buf.toString('utf-8', eocd + 22, Math.min(buf.length, eocd + 22 + commentLen))

  const entries: ZipEntry[] = []
  let p = cdOffset
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN) throw new Error('the zip is damaged (directory)')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compressedSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const fileCommentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString((flags & 0x0800) ? 'utf-8' : 'latin1', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + fileCommentLen

    if (flags & 0x0001) throw new Error('encrypted zip files are not supported')
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported')
    }
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOC) {
      throw new Error('the zip is damaged (file header)')
    }
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    if (dataStart + compressedSize > buf.length) throw new Error('the zip is damaged (file data)')
    entries.push({ name, dir: name.endsWith('/'), method, crc, compressedSize, size, dataStart })
  }
  return { entries, comment }
}

export async function readZipEntry(buf: Buffer, e: ZipEntry): Promise<Buffer> {
  const raw = buf.subarray(e.dataStart, e.dataStart + e.compressedSize)
  let data: Buffer
  if (e.method === 0) data = Buffer.from(raw)
  else if (e.method === 8) data = await inflateRaw(raw, { maxOutputLength: Math.max(1, e.size) + 1024 }) as Buffer
  else throw new Error(`"${e.name}" uses a compression method Lichborne can't read (${e.method})`)
  if (data.length !== e.size) throw new Error(`"${e.name}" is damaged (wrong size)`)
  if ((zlib.crc32(data) >>> 0) !== (e.crc >>> 0)) throw new Error(`"${e.name}" is damaged (checksum)`)
  return data
}

/**
 * The path below the archive's top folder, split into parts, or null when the
 * entry is the top folder itself. Throws on any name that could escape the
 * destination or that Windows can't hold.
 */
export function relativeParts(name: string, top: string): string[] | null {
  if (!name.startsWith(top)) throw new Error(`"${name}" is outside the archive's folder`)
  const rest = name.slice(top.length).replace(/\/+$/, '')
  if (!rest) return null
  const parts = rest.split('/')
  for (const part of parts) {
    if (!part || part === '.' || part === '..') throw new Error(`unsafe file name in the zip: "${name}"`)
    if (/[\\:*?"<>|\x00-\x1f]/.test(part)) throw new Error(`unsafe file name in the zip: "${name}"`)
  }
  return parts
}

function topFolder(entries: ZipEntry[]): string {
  const first = entries.find(e => e.name.includes('/'))
  const top = first ? first.name.slice(0, first.name.indexOf('/') + 1) : ''
  if (!top || top === '/' || !entries.every(e => e.name.startsWith(top))) {
    throw new Error('the zip is not laid out like the Genie maps archive')
  }
  return top
}

/** Extract into `dest` (which must be empty or absent). Returns the number of top-level maps. */
export async function extractGenieZip(
  buf: Buffer,
  dest: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ maps: number; commit: string | null }> {
  const { entries, comment } = readZip(buf)
  const top = topFolder(entries)
  const plan: { parts: string[]; e: ZipEntry }[] = []
  let unpacked = 0, maps = 0
  for (const e of entries) {
    const parts = relativeParts(e.name, top)
    if (!parts) continue
    if (!e.dir) {
      unpacked += e.size
      if (parts.length === 1 && isTopLevelMap(parts[0])) maps++
    }
    plan.push({ parts, e })
  }
  if (unpacked > MAX_UNPACKED_BYTES) throw new Error('the zip unpacks to more than Lichborne expects')
  if (maps < MIN_MAPS) throw new Error(`the download doesn't look like the Genie maps (${maps} map files)`)

  const root = path.resolve(dest)
  await fsp.mkdir(root, { recursive: true })
  const files = plan.filter(x => !x.e.dir)
  let done = 0
  for (const { parts, e } of plan) {
    const target = path.resolve(root, ...parts)
    if (!target.startsWith(root + path.sep)) throw new Error(`unsafe file name in the zip: "${e.name}"`)
    if (e.dir) { await fsp.mkdir(target, { recursive: true }); continue }
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.writeFile(target, await readZipEntry(buf, e))
    done++
    onProgress?.(done, files.length)
  }
  const sha = comment.trim()
  return { maps, commit: /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null }
}

// ── Download ──────────────────────────────────────────────────────────────────

export async function download(fetchImpl: FetchLike, url: string, onProgress: (received: number, total: number | null) => void): Promise<Buffer> {
  const ctrl = new AbortController()
  let idle: ReturnType<typeof setTimeout> | null = null
  const arm = () => {
    if (idle) clearTimeout(idle)
    idle = setTimeout(() => ctrl.abort(), IDLE_TIMEOUT_MS)
  }
  arm()
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'Accept': 'application/zip, application/octet-stream' } })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const lenHeader = Number(res.headers.get('content-length'))
    const total = Number.isFinite(lenHeader) && lenHeader > 0 ? lenHeader : null
    if (total !== null && total > MAX_ZIP_BYTES) throw new Error('the download is larger than Lichborne expects')
    if (!res.body) throw new Error('GitHub sent an empty reply')
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      arm()
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      if (received > MAX_ZIP_BYTES) { ctrl.abort(); throw new Error('the download is larger than Lichborne expects') }
      chunks.push(value)
      onProgress(received, total)
    }
    if (total !== null && received !== total) throw new Error('the download was cut short')
    return Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)))
  } catch (e) {
    if (ctrl.signal.aborted && !(e instanceof Error && /larger than/.test(e.message))) {
      throw new Error('the download stalled')
    }
    throw e
  } finally {
    if (idle) clearTimeout(idle)
  }
}

// ── Install ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Rename with a few retries: on Windows a virus scanner can hold a just-written file. */
export async function renameRetrying(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { await fsp.rename(from, to); return } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (i >= 8 || (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES')) throw e
      await sleep(150 * (i + 1))
    }
  }
}

export async function removeDir(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

/** The message when the maps folder can't be moved aside (Sekmeht hit it with
 *  Explorer open on its "Copy These to Genie's Scripts Folder" subfolder). */
export const FOLDER_IN_USE =
  "Windows wouldn't let Lichborne replace the Genie maps folder, because it or a folder inside it is open in File Explorer or another program. Close that window and try again."

let inflight: Promise<GenieMapsResult> | null = null

/**
 * Download and install (or replace) the managed Genie maps. One run at a time:
 * a second call while one is running joins it.
 */
export function installGenieMaps(opts: {
  userData: string
  fetchImpl: FetchLike
  url?: string
  onProgress?: (p: GenieMapsProgress) => void
}): Promise<GenieMapsResult> {
  if (inflight) return inflight
  inflight = runInstall(opts).finally(() => { inflight = null })
  return inflight
}

async function runInstall({ userData, fetchImpl, url = GENIE_MAPS_ZIP_URL, onProgress }: {
  userData: string
  fetchImpl: FetchLike
  url?: string
  onProgress?: (p: GenieMapsProgress) => void
}): Promise<GenieMapsResult> {
  const dir = genieMapsDir(userData)
  const staging = dir + '.new'
  const old = dir + '.old'
  try {
    // Leftovers from a run that was killed part-way. `.old` is only ever a
    // copy that a finished swap had already replaced, unless GenieMaps itself
    // is missing — then it is the last good copy, so put it back.
    if (!fs.existsSync(dir) && fs.existsSync(old)) await renameRetrying(old, dir)
    await removeDir(staging)
    await removeDir(old)

    const zip = await download(fetchImpl, url, (received, total) =>
      onProgress?.({ phase: 'download', received, total }))
    const { maps, commit } = await extractGenieZip(zip, staging, (done, total) =>
      onProgress?.({ phase: 'extract', done, total }))
    const marker: GenieMapsMarker = { source: GENIE_MAPS_SOURCE, commit, installedAt: Date.now(), maps }
    await fsp.writeFile(path.join(staging, GENIE_MAPS_MARKER), JSON.stringify(marker, null, 2), 'utf-8')

    onProgress?.({ phase: 'replace' })
    const hadOld = fs.existsSync(dir)
    if (hadOld) {
      try { await renameRetrying(dir, old) } catch (e) {
        // Windows won't rename a folder while File Explorer (or any program)
        // has it, or a folder inside it, open; nine retries over ~5 s didn't
        // outlast it, so it isn't a virus scanner's moment. Nothing has been
        // touched yet. Say what to do rather than echo "EPERM … rename".
        const code = (e as NodeJS.ErrnoException).code
        // Windows only: on Linux and macOS an open folder can be renamed, and
        // EACCES there is a real permissions problem worth showing as it is.
        if (process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) throw new Error(FOLDER_IN_USE)
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
    return { ok: true, status: readGenieMapsStatus(userData) }
  } catch (e) {
    await removeDir(staging).catch(() => {})
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
