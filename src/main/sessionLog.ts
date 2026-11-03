// sessionLog — the Session Log on disk: per-character daily files, and every `session-log:*` IPC (DESIGN §28, v0.7.0).
//
// Main's half of the Session Log. The renderer decides WHAT is captured
// (GameWindow.logToSession → `session-log:append`); this file owns everything
// after that: a per-character buffered WRITER (1s / 100-record flush, forced
// at 5000) into {userData}/Logs/{Character}/{Character}_YYYY-MM-DD.log, the
// background MAINTENANCE pass (gzip closed days to `.log.gz`, prune by
// `retentionDays`, cap raw `.log` bytes by `maxRawMB` — never today's file,
// never an archive), and all the READ side: list-days, the paginated tail,
// search, the per-day stream-tag list, disk usage, the Export builder, a
// time-window reader, and the Catch Me Up digest. registerSessionLogHandlers()
// is called once from main.ts; flushAllSessionLogs() runs on graceful shutdown.
//
// Rules that hold the whole file together:
//  • Every reader goes through resolveDayFile() + readLogFile() (plain wins
//    over `.gz`, gunzip is transparent), and every read handler FLUSHES the
//    character's buffer first so a read reflects the live session.
//  • Two line formats are accepted forever — the trimmed `[HH:MM:SS][stream]`
//    (the date is in the filename) and the legacy dated form — via
//    EXPORT_LINE_RE; the renderer's tail parser must keep accepting both too.
//  • Big data never crosses IPC: the Export builder and the digest take a spec
//    and return a small result; only the requested slice of a day is ever sent.
//  • Anything that walks many day-files is ASYNC and yields between days
//    (search, listStreams, the digest) — main owns every session's socket, so
//    a synchronous multi-file scan freezes EVERY connected character at once.
//    readWindow() is the one synchronous walker and is for short windows only.
//  • A TIME window is filtered here, never approximated by a line count
//    (pitfall #92; `maxRows` is a transport tail, not the bound).
//  • The Catch Me Up digest (buildCatchupDigest) is the AI feature's reader:
//    it tallies ranks/hits/deaths/work orders/banking over the RAW rows BEFORE
//    dedup (identical lines are separate real events), dedups on text alone
//    (DR double-emits speech — pitfall #49), skips the state-readout streams
//    in DIGEST_SKIP_STREAMS (keep it in sync with CATCHUP_SKIP_STREAMS in
//    GameWindow), and redacts ONLY the AI-bound body via redactForAI — the log
//    on disk stays pristine. Its game math (coin ratios, the damage ladder) is
//    mirrored from verified sources; never invent DR constants here.
import { app, ipcMain, shell, dialog, clipboard } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import type {
  SessionLogRecord, SessionLogAppendPayload, SessionLogDay, SessionLogSearchHit,
  SessionLogExportSpec, SessionLogExportResult, SessionLogDiskUsage, SessionLogWindowRow,
  CatchupDigest, CatchupProgress, CatchupThread,
} from '../shared/types'
import { redactForAI } from '../shared/redact'
import { isProfileKey } from '../shared/profileKey'

// ── Session Log writer ────────────────────────────────────────────────────────
// Per-character buffered writer. Captured records arrive from the renderer via
// `session-log:append`, accumulate in an in-memory buffer, and flush to disk on
// a 1s timer (or immediately when the buffer crosses FLUSH_THRESHOLD). Files are
// per-character per-day: {userData}/Logs/{Character}/{Character}_YYYY-MM-DD.log
//
// Lives in userData (not the install dir) so logs survive NSIS upgrades — same
// reasoning as the profiles directory migration.
//
// Size management (v0.7.0):
//  - On-disk line format is trimmed: `[HH:MM:SS][stream] text` — the day is
//    already in the filename, so repeating the date (and milliseconds) on every
//    line was pure overhead. Parsers still accept the old dated format.
//  - Closed (non-today) day-files are gzip-compressed to `.log.gz` (~85-90%
//    smaller). Today's file stays plain text — it's being appended to, and it's
//    the one a user is most likely to grep directly.
//  - Two retention limits: `retentionDays` (delete day-files older than N days,
//    compressed or not) and `maxRawMB` (a cap on *uncompressed* .log bytes,
//    never touching .gz archives — see enforceRawSizeCap).

const FLUSH_INTERVAL_MS = 1000
const FLUSH_THRESHOLD   = 100
// Cap the in-memory buffer so a runaway flood (heavy combat) force-flushes
// instead of growing unbounded.
const MAX_BUFFER        = 5000

interface CharBuffer {
  character: string                              // original-case name for paths
  records: SessionLogRecord[]
  timer: ReturnType<typeof setTimeout> | null
  retentionDays: number
  compress: boolean
  maxRawMB: number
  knownDayFiles: Set<string>                     // date strings already on disk
  maintainedOnce: boolean                        // session-start maintenance done
  maintaining: boolean                           // maintenance pass in flight
}

// Keyed by lowercased character so casing variants don't create dupes.
const buffers = new Map<string, CharBuffer>()

function logsRoot(): string {
  return path.join(app.getPath('userData'), 'Logs')
}

// DR character names are alphanumeric (plus apostrophes for some races, which
// are filename-safe). Strip path-dangerous characters defensively anyway.
function safeName(character: string): string {
  return (character.trim() || 'Unknown').replace(/[/\\:*?"<>|]/g, '_')
}

function charDir(character: string): string {
  return path.join(logsRoot(), safeName(character))
}

// The plain (uncompressed, writable) path for a day. Today's file always lives
// here; closed days may exist only as `${this}.gz`.
function dayFilePath(character: string, date: string): string {
  return path.join(charDir(character), `${safeName(character)}_${date}.log`)
}

function pad(n: number, w = 2): string { return String(n).padStart(w, '0') }

function dateOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Clock-only stamp for the trimmed on-disk line format. The date is in the
// filename, so it isn't repeated per line.
function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Full date+time stamp — used only for the export summary header.
function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// One record → one file line: `[HH:MM:SS][stream] text`. Strip embedded
// newlines so the line-per-record invariant holds (game text is single-line,
// but a malformed Lich echo could contain a \n — collapse rather than corrupt).
function formatLine(r: SessionLogRecord): string {
  const text = r.text.replace(/[\r\n]+/g, ' ')
  return `[${formatClock(r.ts)}][${r.stream}] ${text}\n`
}

function getBuffer(character: string, retentionDays: number, compress: boolean, maxRawMB: number): CharBuffer {
  const key = character.toLowerCase()
  let buf = buffers.get(key)
  if (!buf) {
    buf = {
      character, records: [], timer: null,
      retentionDays, compress, maxRawMB,
      knownDayFiles: new Set(), maintainedOnce: false, maintaining: false,
    }
    buffers.set(key, buf)
  }
  buf.retentionDays = retentionDays
  buf.compress = compress
  buf.maxRawMB = maxRawMB
  return buf
}

function flushBuffer(buf: CharBuffer): void {
  if (buf.timer) { clearTimeout(buf.timer); buf.timer = null }
  if (buf.records.length === 0) return
  const records = buf.records
  buf.records = []

  // Group by day so a flush spanning midnight writes into the right files.
  const byDay = new Map<string, string[]>()
  for (const r of records) {
    const date = dateOf(r.ts)
    let lines = byDay.get(date)
    if (!lines) { lines = []; byDay.set(date, lines) }
    lines.push(formatLine(r))
  }

  try {
    fs.mkdirSync(charDir(buf.character), { recursive: true })
  } catch (err) {
    console.error('[sessionLog] mkdir failed for', buf.character, err)
    return
  }

  let anyNewFile = false
  for (const [date, lines] of byDay) {
    const file = dayFilePath(buf.character, date)
    const isNewFile = !buf.knownDayFiles.has(date) && !fs.existsSync(file)
    try {
      fs.appendFileSync(file, lines.join(''), 'utf8')
      buf.knownDayFiles.add(date)
      if (isNewFile) anyNewFile = true
    } catch (err) {
      console.error('[sessionLog] append failed for', file, err)
    }
  }

  // Maintenance (compress closed days, prune by age, enforce the raw cap) runs
  // once at session start and again whenever a new day-file rolls over — the
  // cheap moments to check, and exactly when each limit could need enforcing.
  if (anyNewFile || !buf.maintainedOnce) {
    buf.maintainedOnce = true
    void maintain(buf)
  }
}

function scheduleFlush(buf: CharBuffer): void {
  if (buf.records.length >= FLUSH_THRESHOLD || buf.records.length >= MAX_BUFFER) {
    flushBuffer(buf)
    return
  }
  if (buf.timer) return
  buf.timer = setTimeout(() => flushBuffer(buf), FLUSH_INTERVAL_MS)
}

// ── Maintenance: compression + retention + size cap ───────────────────────────

// Compress + prune + cap, in that order. Async (compression streams off the
// main thread) and self-guarded so overlapping flushes don't double-run it.
async function maintain(buf: CharBuffer): Promise<void> {
  if (buf.maintaining) return
  buf.maintaining = true
  try {
    if (buf.compress) await compressClosedLogs(buf.character)
    pruneOldLogs(buf.character, buf.retentionDays)
    enforceRawSizeCap(buf.character, buf.maxRawMB)
  } catch (err) {
    console.error('[sessionLog] maintenance failed for', buf.character, err)
  } finally {
    buf.maintaining = false
  }
}

// Gzip one file via a stream (never blocks the main thread on a large file).
// Writes to `${dst}.tmp` then renames so an interrupted run never leaves a
// half-written archive that looks real.
function gzipFile(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmp = dst + '.tmp'
    const rs = fs.createReadStream(src)
    const gz = zlib.createGzip()
    const ws = fs.createWriteStream(tmp)
    const fail = (err: Error) => {
      rs.destroy(); gz.destroy(); ws.destroy()
      try { fs.unlinkSync(tmp) } catch { /* nothing to clean */ }
      reject(err)
    }
    rs.on('error', fail)
    gz.on('error', fail)
    ws.on('error', fail)
    ws.on('finish', () => {
      try { fs.renameSync(tmp, dst); resolve() }
      catch (err) { reject(err as Error) }
    })
    rs.pipe(gz).pipe(ws)
  })
}

// Gzip every closed (non-today) day-file that isn't already compressed.
async function compressClosedLogs(character: string): Promise<void> {
  const dir = charDir(character)
  let entries: string[]
  try { entries = fs.readdirSync(dir) } catch { return }
  const today = dateOf(Date.now())
  const re = /_(\d{4}-\d{2}-\d{2})\.log$/
  for (const name of entries) {
    const m = re.exec(name)
    if (!m || m[1] === today) continue
    const src = path.join(dir, name)
    const gz = src + '.gz'
    try {
      if (fs.existsSync(gz)) {
        // A stray uncompressed copy beside a finished archive — drop it.
        fs.unlinkSync(src)
        continue
      }
      await gzipFile(src, gz)
      fs.unlinkSync(src)
    } catch (err) {
      console.error('[sessionLog] compress failed for', name, err)
    }
  }
}

// Delete day-files (compressed or not) older than retentionDays.
function pruneOldLogs(character: string, retentionDays: number): void {
  if (retentionDays <= 0) return
  const dir = charDir(character)
  let entries: string[]
  try { entries = fs.readdirSync(dir) } catch { return }
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const dateRe = /_(\d{4}-\d{2}-\d{2})\.log(\.gz)?$/
  for (const name of entries) {
    const m = dateRe.exec(name)
    if (!m) continue
    const fileDate = new Date(`${m[1]}T00:00:00`).getTime()
    if (fileDate < cutoff) {
      try { fs.unlinkSync(path.join(dir, name)) }
      catch (err) { console.error('[sessionLog] prune failed for', name, err) }
    }
  }
}

// Enforce the uncompressed-size cap. Counts and prunes ONLY raw `.log` files —
// `.log.gz` archives are exempt (governed solely by day-based retention), and
// today's live file is never touched. With compression on, raw files are just
// today's, so this is effectively dormant; with compression off it is the real
// bound on the folder's footprint.
function enforceRawSizeCap(character: string, maxRawMB: number): void {
  if (!maxRawMB || maxRawMB <= 0) return
  const dir = charDir(character)
  let entries: string[]
  try { entries = fs.readdirSync(dir) } catch { return }
  const today = dateOf(Date.now())
  const re = /_(\d{4}-\d{2}-\d{2})\.log$/   // uncompressed .log only
  const files: { date: string; path: string; size: number }[] = []
  for (const name of entries) {
    const m = re.exec(name)
    if (!m || m[1] === today) continue       // never the live file
    const fp = path.join(dir, name)
    try { files.push({ date: m[1], path: fp, size: fs.statSync(fp).size }) } catch { /* skip */ }
  }
  let total = files.reduce((n, f) => n + f.size, 0)
  const budget = maxRawMB * 1024 * 1024
  if (total <= budget) return
  files.sort((a, b) => a.date.localeCompare(b.date))   // oldest first
  for (const f of files) {
    if (total <= budget) break
    try { fs.unlinkSync(f.path); total -= f.size }
    catch (err) { console.error('[sessionLog] size-cap prune failed for', f.path, err) }
  }
}

// Flush every character's buffer — called on graceful window close.
export function flushAllSessionLogs(): void {
  for (const buf of buffers.values()) flushBuffer(buf)
}

// ── Read helpers ──────────────────────────────────────────────────────────────

// Read a `.log` or `.log.gz` file to text, decompressing transparently.
function readLogFile(filePath: string): string | null {
  try {
    if (filePath.endsWith('.gz')) {
      return zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8')
    }
    return fs.readFileSync(filePath, 'utf8')
  } catch { return null }
}

// The on-disk file for a day, plain or compressed (plain wins if both exist).
function resolveDayFile(character: string, date: string): string | null {
  const base = dayFilePath(character, date)
  if (fs.existsSync(base)) return base
  if (fs.existsSync(base + '.gz')) return base + '.gz'
  return null
}

function listDays(character: string): SessionLogDay[] {
  const dir = charDir(character)
  let entries: string[]
  try { entries = fs.readdirSync(dir) } catch { return [] }
  const dateRe = /_(\d{4}-\d{2}-\d{2})\.log(\.gz)?$/
  const byDate = new Map<string, SessionLogDay>()
  for (const name of entries) {
    const m = dateRe.exec(name)
    if (!m) continue
    const fp = path.join(dir, name)
    let size = 0
    try { size = fs.statSync(fp).size } catch { /* size stays 0 */ }
    const existing = byDate.get(m[1])
    // Prefer the plain .log if a day somehow has both forms.
    if (!existing || (existing.path.endsWith('.gz') && !name.endsWith('.gz'))) {
      byDate.set(m[1], { date: m[1], path: fp, size })
    }
  }
  // Newest first.
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

// Read one day-file and return its lines. `tailLines` (when > 0) returns only
// the last N lines; `beforeLine` paginates further back. The whole file is read
// into main's memory transiently — the renderer only ever receives the
// requested slice, never the whole file.
function readDay(character: string, date: string, tailLines: number, beforeLine: number): {
  lines: string[]
  totalLines: number
} {
  const file = resolveDayFile(character, date)
  const raw = file ? readLogFile(file) : null
  if (raw == null) return { lines: [], totalLines: 0 }
  const all = raw.split('\n')
  // Trailing newline yields an empty final element — drop it.
  if (all.length > 0 && all[all.length - 1] === '') all.pop()
  const totalLines = all.length
  if (tailLines <= 0) return { lines: all, totalLines }
  // beforeLine is an index from the end: 0 = the very tail, 200 = skip the
  // last 200 lines (used by "load older" pagination).
  const end = Math.max(0, totalLines - beforeLine)
  const start = Math.max(0, end - tailLines)
  return { lines: all.slice(start, end), totalLines }
}

// Read every logged line whose timestamp falls inside [fromTs, toTs], across the
// day-file(s) the window spans. GROUNDWORK for the future log-analysis AI feature
// (DESIGN §10.4) — currently UNWIRED (Catch Me Up reverted to screen-only, §10.3).
// Kept because it carries pitfall #92's lesson and is exactly what that feature needs.
//
// The filtering MUST happen here, in main. The renderer originally asked for "the
// last N lines of the day-file" and filtered by time itself — but N is a LINE cap
// being used to satisfy a TIME window, and a busy character blows straight through
// it: Agan logs ~820 lines/min (81k in a day, mostly inv/spells), so an 8000-line
// tail reached back only 6.2 MINUTES. An 11-minute request silently returned ~6
// minutes of data and reported the truncated count as if it were the whole window.
// Never bound a time window with a line count. (Sekmeht, v0.16.0.)
//
// `maxRows` is a transport guard only, applied as a TAIL (most recent wins) — the
// caller's real bound is a character budget far smaller than this.
function readWindow(
  character: string, fromTs: number, toTs: number, maxRows: number,
): SessionLogWindowRow[] {
  const rows: SessionLogWindowRow[] = []
  const day  = new Date(fromTs); day.setHours(0, 0, 0, 0)
  const last = new Date(toTs);   last.setHours(0, 0, 0, 0)
  // Guard the loop, not the data. Raised 8 → 366 so a Catch Me Up can span up to a
  // year (Sekmeht). NOTE: this SYNCHRONOUS reader is fine for the short windows the
  // log viewer uses — for a long catchup window use `buildCatchupDigest`, which
  // walks day by day and YIELDS between days; looping a year (~29M lines) without
  // yielding would block main and freeze every session, not just the caller's.
  for (let i = 0; i < 366 && day.getTime() <= last.getTime(); i++) {
    const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    const file = resolveDayFile(character, date)
    const raw = file ? readLogFile(file) : null
    if (raw != null) {
      for (const line of raw.split('\n')) {
        const m = EXPORT_LINE_RE.exec(line)
        if (!m) continue
        const ts = new Date(`${m[1] || date}T${m[2]}`).getTime()
        if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) continue
        rows.push({ ts, stream: m[3] || 'main', text: m[4] })
      }
    }
    day.setDate(day.getDate() + 1)
  }
  rows.sort((a, b) => a.ts - b.ts)
  return rows.length > maxRows ? rows.slice(-maxRows) : rows
}

// Streams that are STATE readouts (they clear+rewrite) rather than history — the
// same set the renderer skips for Catch Me Up. Feeding these to a summary sends a
// stale TABLE instead of events (measured: 1,173 `spells` + 2,574 `inv` lines in a
// single 11-minute window). Keep in sync with CATCHUP_SKIP_STREAMS in GameWindow.
const DIGEST_SKIP_STREAMS = new Set([
  'exp', 'inv', 'spells', 'activespells', 'percwindow', 'moonwindow', 'lichscripts', 'debug', 'raw', 'lbai',
])
// Conservative speaker match. DR speech is "<Name> says, ..." / asks / exclaims /
// whispers. Deliberately narrow: a missed thread costs a little context, a WRONG
// one puts words in someone's mouth. `You` is excluded — that's the player, not a
// correspondent. (Not yet corpus-verified for every locale/emote form — treat as
// the conservative floor and widen only against a real capture, §35 discipline.)
const DIGEST_SPEECH_RE = /^([A-Z][\w''-]{1,20}(?: [A-Z][\w''-]{1,20})?) (?:says|asks|exclaims|whispers)[ ,]/
const yieldToLoop = () => new Promise<void>(r => setImmediate(r))

// Build a COMPACT digest of a time window, day by day, yielding between days so a
// long window can't block main. `onProgress` drives the UI's "working on it" status
// across EVERY phase (reading → deduping → extracting), not just the log read.
async function buildCatchupDigest(
  character: string, fromTs: number, toTs: number, maxBodyChars: number, redactLiterals: string[],
  onProgress: (p: { phase: 'reading' | 'deduping' | 'extracting'; done: number; total: number; lines: number }) => void,
): Promise<CatchupDigest> {
  const day  = new Date(fromTs); day.setHours(0, 0, 0, 0)
  const last = new Date(toTs);   last.setHours(0, 0, 0, 0)
  const totalDays = Math.min(366, Math.floor((last.getTime() - day.getTime()) / 86_400_000) + 1)

  const rows: Array<{ ts: number; stream: string; text: string }> = []
  let daysScanned = 0
  for (let i = 0; i < 366 && day.getTime() <= last.getTime(); i++) {
    const date = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
    const file = resolveDayFile(character, date)
    const raw = file ? readLogFile(file) : null
    if (raw != null) {
      for (const line of raw.split('\n')) {
        const m = EXPORT_LINE_RE.exec(line)
        if (!m) continue
        const stream = (m[3] || 'main').toLowerCase()
        if (DIGEST_SKIP_STREAMS.has(stream)) continue
        const ts = new Date(`${m[1] || date}T${m[2]}`).getTime()
        if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) continue
        const text = m[4]
        if (!text || !text.trim()) continue
        // Bare prompts carry no information for a summary and are extremely
        // high-volume; the DRExpMonitor line is the learning-rate (mindstate)
        // TICKER, which churns constantly and is not an event. Both are dropped
        // here so they can't crowd out real content in the sample. (Ranks come
        // from the game's own "You've gained a new rank in …" message instead.)
        if (/^[A-Za-z]?>$/.test(text.trim()) || text.startsWith('DRExpMonitor:')) continue
        rows.push({ ts, stream, text })
      }
    }
    daysScanned++
    onProgress({ phase: 'reading', done: daysScanned, total: totalDays, lines: rows.length })
    day.setDate(day.getDate() + 1)
    await yieldToLoop()          // keep main responsive across a year of files
  }
  rows.sort((a, b) => a.ts - b.ts)
  const totalLines = rows.length
  const coveredFrom = rows.length ? rows[0].ts : null

  // ── RANKS gained, tallied BEFORE dedup. The real message (verified capture,
  // Sekmeht): "You've gained a new rank in your overall defensive maneuvering."
  // — one rank per line, so the tally is a COUNT of matching lines per skill.
  //
  // Do NOT use the `DRExpMonitor: Arcana(+2), ...` lines for this: that is the
  // community script's LEARNING-RATE (mindstate) ticker, not ranks. Counting it
  // as ranks inflates the number wildly — nearly shipped exactly that mistake.
  // Those ticker lines are filtered out of the sample below as pure churn.
  //
  // CRITICAL: this runs over `rows`, NOT the deduped `kept` — two identical rank
  // lines are two REAL ranks, and dedup would silently halve the tally. Any future
  // COUNTING extractor must likewise tally pre-dedup.
  const expTally = new Map<string, number>()
  for (const r of rows) {
    // Straight or curly apostrophe; optional trailing period.
    const m = /^You['’]ve gained a new rank in (.+?)\.?$/.exec(r.text)
    if (!m) continue
    const skill = m[1].replace(/^your\s+/i, '').trim()
    if (skill) expTally.set(skill, (expTally.get(skill) ?? 0) + 1)
  }
  const exp = [...expTally.entries()]
    .map(([skill, ranks]) => ({ skill, ranks }))
    .sort((a, b) => b.ranks - a.ranks)

  // ── Combat damage TAKEN, also tallied pre-dedup (identical hits are separate
  // real hits). Verified capture (Sekmeht), stream `combat`:
  //   "* A lava drake bares its teeth and swings at you.  You attempt to dodge.
  //    The flaming tail lands a light hit (1/23) to your chest."
  // Two independent reads, so a failure of one doesn't poison the other:
  //  • DAMAGE — "lands a <level> (n/m) to your <part>", where <level> is a full
  //    DR damage descriptor ending in "hit" OR "strike" — the ladder ALTERNATES
  //    the two ("good hit" vs "good strike", "heavy strike", "powerful strike"),
  //    so a "hit"-only pattern silently MISSED every strike-level hit (real bug,
  //    caught from GM Kodius's verified damage-values list). Requires the body
  //    part, so a miss/parry/dodge can never inflate the count.
  //  • ATTACKER — the subject of the "* <Attacker> <verb>s …" opener. Best-effort
  //    by nature: DR combat narration is largely anonymous (§32.1), so this is the
  //    line's own subject, NOT an inference about who dealt the damage.
  // Body part must run to the end of the clause — a plain `\b` stops at the first
  // word boundary and turns "left leg" into "left" (caught in verification).
  const DAMAGE_RE = /\blands? an? ([a-z -]+? (?:hit|strike)) \((\d+)\/(\d+)\) to your ([a-z ]+?)\s*(?=[.!,]|$)/i
  const ATTACKER_RE = /^\*\s+(?:An?|The)\s+([a-z][a-z' -]{2,30}?)\s+[a-z]+(?:s|es)\b/i
  // VERIFIED severity ladder (GM Kodius, via Sekmeht), least → most. Ranked by the
  // FULL descriptor because "good hit" and "good strike" are ADJACENT-but-distinct
  // levels. The no-damage descriptors (grazing/glancing/…) aren't here — they're
  // phrased differently and never match DAMAGE_RE, so they can't be counted.
  const HIT_LADDER = [
    'light hit', 'good hit', 'good strike', 'solid hit', 'hard hit', 'strong hit',
    'heavy strike', 'very heavy hit', 'extremely heavy hit', 'powerful strike',
    'massive strike', 'awesome strike', 'vicious strike', 'earth-shaking strike',
    'demolishing hit', 'spine-rattling strike', 'devastating hit', 'overwhelming strike',
    'obliterating hit', 'annihilating strike', 'cataclysmic strike', 'apocalyptic strike',
  ]
  const atk = new Map<string, number>()
  const part = new Map<string, number>()
  let totalHits = 0
  let worst: string | null = null
  for (const r of rows) {
    const d = DAMAGE_RE.exec(r.text)
    if (!d) continue            // only landed-damage lines — a miss/parry/arrival is not a hit
    totalHits++
    const p = d[4].trim()
    part.set(p, (part.get(p) ?? 0) + 1)
    const lvl = d[1].trim().toLowerCase()   // full descriptor, e.g. "very heavy hit"
    if (HIT_LADDER.includes(lvl) && (worst == null || HIT_LADDER.indexOf(lvl) > HIT_LADDER.indexOf(worst))) worst = lvl
    // Attacker is counted ONLY on a line that landed damage — so `atk` is hits-per-
    // attacker (reconciles with totalHits) and a MISS or a creature ARRIVAL line
    // ("* A lava drake arrives from the north.") can never inflate it. Best-effort:
    // a hit line without the "* <Attacker>" opener leaves that hit unattributed.
    const a = ATTACKER_RE.exec(r.text)
    if (a) { const n = a[1].trim(); atk.set(n, (atk.get(n) ?? 0) + 1) }
  }
  const combat = {
    attackers: [...atk.entries()].map(([name, hits]) => ({ name, hits })).sort((x, y) => y.hits - x.hits).slice(0, 12),
    byPart:    [...part.entries()].map(([p, hits]) => ({ part: p, hits })).sort((x, y) => y.hits - x.hits),
    worst, totalHits,
  }

  // ── Banking. Verified capture (Sekmeht), from the DRBanking Lich script:
  //   "DRBanking: Updated Shard balance to 5331 platinum, 7 silver, 7 bronze"
  // NOTE this is a BALANCE SNAPSHOT per town, not a deposit amount — so money
  // FLOW is the change between the first and last snapshot in the window. The
  // amounts are kept as VERBATIM strings: converting DR's coin denominations to a
  // single number needs exchange ratios I have not verified, and inventing them
  // would produce confidently wrong totals. The model reports "went from X to Y".
  const bankFirst = new Map<string, string>()
  const bankLast  = new Map<string, string>()
  const bankHits  = new Map<string, number>()
  for (const r of rows) {
    const m = /^DRBanking:\s*Updated\s+(.+?)\s+balance to\s+(.+?)\s*$/.exec(r.text)
    if (!m) continue
    const town = m[1].trim()
    if (!bankFirst.has(town)) bankFirst.set(town, m[2].trim())
    bankLast.set(town, m[2].trim())
    bankHits.set(town, (bankHits.get(town) ?? 0) + 1)
  }
  // Coin denomination → copper, VERIFIED from Lich drbanking.rb DENOMINATION_VALUES
  // (not invented — the exact ratios within one currency). Lets us reduce a balance
  // string to a single number and report real money FLOW (net change) per town.
  const DENOM: Record<string, number> = { platinum: 10_000, gold: 1_000, silver: 100, bronze: 10, copper: 1 }
  const toCopper = (balance: string): number => {
    let c = 0
    for (const g of balance.matchAll(/(\d[\d,]*)\s+(platinum|gold|silver|bronze|copper)/gi)) {
      c += Number(g[1].replace(/,/g, '')) * (DENOM[g[2].toLowerCase()] ?? 1)
    }
    return c
  }
  const banking = [...bankLast.entries()].map(([town, last]) => {
    const first = bankFirst.get(town) ?? last
    return { town, first, last, netCopper: toCopper(last) - toCopper(first), updates: bankHits.get(town) ?? 0 }
  })

  // ── Work orders. Verified capture (Sekmeht), crafting turn-in:
  //   "You hand Serric your logbook and bundled items, and are given 4,624
  //    Dokoras in return."
  // One line = one completed order, so the count is the number of matches — hence
  // tallied pre-dedup like the others (identical turn-ins are separate orders).
  // Payment is summed PER CURRENCY NAME (Dokoras is one town's local coin; others
  // differ) — no cross-currency math, which would need unverified exchange rates.
  const woEarned = new Map<string, number>()
  let workorders = 0
  for (const r of rows) {
    const m = /^You hand (\S+) your logbook[^.]*?\band are given ([\d,]+)\s+([A-Za-z]+) in return/.exec(r.text)
    if (!m) continue
    workorders++
    const amt = Number(m[2].replace(/,/g, ''))
    if (Number.isFinite(amt)) woEarned.set(m[3], (woEarned.get(m[3]) ?? 0) + amt)
  }
  const workorderPay = [...woEarned.entries()].map(([currency, total]) => ({ currency, total }))

  // ── Deaths, tallied pre-dedup (dying twice is two deaths). Pattern from
  // Sekmeht's own notification script (battle-tested against live DR). A dedicated
  // "directed speech" extractor was removed as REDUNDANT: those lines are in the
  // body already, and a bare "N lines were addressed to you" count told the model
  // nothing it couldn't see — the `threads` speaker list is the useful anchor.
  const deaths: number[] = []
  for (const r of rows) {
    if (/^Your death cry echoes in your brain\b/i.test(r.text)) deaths.push(r.ts)
  }

  // ── Dedup. Grinding repeats the same line thousands of times; collapsing it is
  // what makes a long window affordable at all. Keyed on TEXT ALONE (not
  // stream+text) — the SAME reason the screen path does (pitfall #49): DR
  // double-emits speech (once inside the pushStream block, once to `main`), so a
  // stream+text key keeps BOTH copies — doubling the body AND the per-speaker
  // "who spoke" count (derived from `kept`). Every COUNTING tally runs over raw
  // `rows` ABOVE, so dedup never changes a fact — only what the model reads.
  onProgress({ phase: 'deduping', done: 0, total: totalLines, lines: totalLines })
  await yieldToLoop()
  const seen = new Set<string>()
  const kept: Array<{ ts: number; stream: string; text: string }> = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const key = r.text
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(r)
    if ((i & 0x3fff) === 0) { onProgress({ phase: 'deduping', done: i, total: totalLines, lines: totalLines }); await yieldToLoop() }
  }

  // ── Extract the speaker list ("who was most talkative") — a soft anchor for the
  // summary. Counted over the DEDUPED lines so it matches what the model sees in
  // the body (an exact-repeat spammer collapses); the verbatim speech is in the
  // body, so we keep only who + count here (no re-shipping lines — that was waste).
  onProgress({ phase: 'extracting', done: 0, total: kept.length, lines: totalLines })
  await yieldToLoop()
  const byWho = new Map<string, number>()
  for (let i = 0; i < kept.length; i++) {
    const m = DIGEST_SPEECH_RE.exec(kept[i].text)
    if (m && m[1] !== 'You') byWho.set(m[1], (byWho.get(m[1]) ?? 0) + 1)
    if ((i & 0x3fff) === 0) { onProgress({ phase: 'extracting', done: i, total: kept.length, lines: totalLines }); await yieldToLoop() }
  }
  const threads: CatchupThread[] = [...byWho.entries()]
    .map(([who, count]) => ({ who, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // FULL deduped narrative for the AI to analyse — NOT a sample (Sekmeht:
  // "analyze everything ... just have particular insight into certain things").
  // The extractions above are EMPHASIS/anchors, not a substitute for the content.
  // Rendered stream-tagged. If it still exceeds the caller's budget, keep the MOST
  // RECENT that fits (a "what did I miss" weights recent) — but the tallies above
  // already cover the WHOLE window, so a trimmed narrative never loses the counts,
  // and the header says when this happened. Dedup is what makes "everything"
  // affordable: grinding's repetition collapses, so a realistic window's UNIQUE
  // content is a fraction of its raw size.
  const rendered = kept.map(r => (r.stream === 'main' ? r.text : `[${r.stream}] ${r.text}`))
  let bodyStart = 0
  let bodyChars = rendered.reduce((n, s) => n + s.length + 1, 0)
  while (bodyStart < rendered.length && bodyChars > maxBodyChars) {
    bodyChars -= rendered[bodyStart].length + 1
    bodyStart++
  }
  // REDACT sensitive content on the way to the AI ONLY — the log on disk is
  // untouched (Sekmeht: the log must stay pristine; scrub only the AI copy). Done
  // on the final (trimmed) body so we redact ≤ budget lines, not every raw row.
  const body = rendered.slice(bodyStart).map(line => redactForAI(line, redactLiterals))

  return {
    from: fromTs, to: toTs, coveredFrom,
    totalLines, keptLines: kept.length, duplicates: totalLines - kept.length,
    daysScanned, threads, exp, combat, banking, workorders, workorderPay, deaths,
    body, truncated: bodyStart > 0,
  }
}

// ASYNC + yields between days — same reasoning as listStreams. Measured ~2.9s
// of BLOCKED main on a 30-day preset over real data, during which no session's
// socket drains and every connected character stalls together.
async function searchLogs(
  character: string,
  query: string,
  opts: { regex: boolean; fromDate: string; toDate: string },
): Promise<SessionLogSearchHit[]> {
  if (!query.trim()) return []
  let matcher: (line: string) => boolean
  if (opts.regex) {
    let re: RegExp
    try { re = new RegExp(query, 'i') } catch { return [] }
    matcher = (line) => re.test(line)
  } else {
    const q = query.toLowerCase()
    matcher = (line) => line.toLowerCase().includes(q)
  }
  const results: SessionLogSearchHit[] = []
  for (const day of listDays(character)) {
    if (day.date < opts.fromDate || day.date > opts.toDate) continue
    const raw = readLogFile(day.path)
    if (raw == null) continue
    const all = raw.split('\n')
    if (all.length > 0 && all[all.length - 1] === '') all.pop()
    const total = all.length
    for (let i = 0; i < all.length; i++) {
      const line = all[i]
      if (line && matcher(line)) results.push({ date: day.date, lineNo: i + 1, total, line })
      if (results.length >= 1000) return results  // hard cap
    }
    await yieldToLoop()   // let sockets drain between day-files
  }
  return results
}

// Scan day-files in a date range for the set of distinct [stream] tags they
// contain. Cheap (a regex over each line's prefix) and gives the Recent Tail /
// Quick Search / Export modals their stream-checkbox list without a hardcoded
// stream registry. fromDate === toDate scans a single day.
const STREAM_TAG_RE = /^\[[^\]]*\]\[([^\]]*)\]/

// Per-day stream sets, keyed by path+mtime+size. A CLOSED day-file never
// changes, so a repeat range scan (the Export builder re-runs this on every
// date-range tweak) costs nothing after the first pass.
const streamSetCache = new Map<string, string[]>()

// ASYNC + yields between days (v0.18.0 perf audit). Measured at ~2.9s of
// BLOCKED main over one tester's 23 day-files (61MB gz) — and main owns every
// session's socket, so for those seconds EVERY connected character freezes at
// once, then the backlog arrives in a burst. Yielding per day bounds the block
// to a single file and lets sockets drain in between. Same shape as
// buildCatchupDigest, which already does this.
async function listStreams(character: string, fromDate: string, toDate: string): Promise<string[]> {
  const streams = new Set<string>()
  for (const day of listDays(character)) {
    if (day.date < fromDate || day.date > toDate) continue
    let key: string | null = null
    try {
      const st = fs.statSync(day.path)
      key = day.path + ':' + st.mtimeMs + ':' + st.size
      const hit = streamSetCache.get(key)
      if (hit) { for (const v of hit) streams.add(v); await yieldToLoop(); continue }
    } catch { /* stat failed — fall through and read */ }
    const raw = readLogFile(day.path)
    if (raw == null) continue
    const found = new Set<string>()
    for (const line of raw.split('\n')) {
      const m = STREAM_TAG_RE.exec(line)
      if (m) found.add(m[1])
    }
    for (const v of found) streams.add(v)
    if (key) streamSetCache.set(key, [...found])
    await yieldToLoop()
  }
  return [...streams].sort()
}

function diskUsage(character: string): SessionLogDiskUsage {
  const dir = charDir(character)
  let entries: string[]
  try { entries = fs.readdirSync(dir) }
  catch { return { totalBytes: 0, rawBytes: 0, archiveBytes: 0, dayCount: 0 } }
  const re = /_(\d{4}-\d{2}-\d{2})\.log(\.gz)?$/
  let totalBytes = 0, rawBytes = 0, archiveBytes = 0
  const dates = new Set<string>()
  for (const name of entries) {
    const m = re.exec(name)
    if (!m) continue
    let size = 0
    try { size = fs.statSync(path.join(dir, name)).size } catch { /* size stays 0 */ }
    totalBytes += size
    if (name.endsWith('.gz')) archiveBytes += size
    else rawBytes += size
    dates.add(m[1])
  }
  return { totalBytes, rawBytes, archiveBytes, dayCount: dates.size }
}

// ── Export builder ("Create Log file From") ───────────────────────────────────
// Reads day-files in a range, filters by stream, optionally dedups, and formats
// each line per the spec. All of this stays in main — only the small spec and a
// stats result cross IPC, never the (potentially huge) line data itself.

// Accepts both the trimmed format (`[HH:MM:SS]`) and the legacy dated format
// (`[YYYY-MM-DD HH:MM:SS.mmm]`) so already-written logs still export.
const EXPORT_LINE_RE = /^\[(?:(\d{4}-\d{2}-\d{2}) )?(\d{2}:\d{2}:\d{2})(?:\.\d{3})?\]\[([^\]]*)\] ?(.*)$/

interface ExportRow { date: string; time: string; streams: string[]; text: string }

// Day-files in [fromDate, toDate], oldest-first (listDays is newest-first).
function daysInRange(character: string, fromDate: string, toDate: string): SessionLogDay[] {
  return listDays(character)
    .filter(d => d.date >= fromDate && d.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Combined collection: all selected streams interleaved in chronological order.
// dedup collapses consecutive identical text, merging the stream tags.
function collectCombined(character: string, spec: SessionLogExportSpec): {
  rows: ExportRow[]; counts: Map<string, number>
} {
  const want = new Set(spec.streams)
  const counts = new Map<string, number>()
  const rows: ExportRow[] = []
  for (const day of daysInRange(character, spec.fromDate, spec.toDate)) {
    const raw = readLogFile(day.path)
    if (raw == null) continue
    for (const line of raw.split('\n')) {
      const m = EXPORT_LINE_RE.exec(line)
      if (!m || !want.has(m[3])) continue
      counts.set(m[3], (counts.get(m[3]) ?? 0) + 1)
      const prev = rows[rows.length - 1]
      if (spec.dedup && prev && prev.text === m[4]) {
        if (!prev.streams.includes(m[3])) prev.streams.push(m[3])
        continue
      }
      // m[1] (date) is present only on legacy lines; trimmed lines take the
      // date from the day-file they live in.
      rows.push({ date: m[1] || day.date, time: m[2], streams: [m[3]], text: m[4] })
    }
  }
  return { rows, counts }
}

// Per-stream collection for split-file export — one bucket per stream, dedup
// applied within each stream independently.
function collectPerStream(character: string, spec: SessionLogExportSpec): Map<string, {
  rows: ExportRow[]; raw: number
}> {
  const buckets = new Map<string, { rows: ExportRow[]; raw: number }>()
  for (const s of spec.streams) buckets.set(s, { rows: [], raw: 0 })
  for (const day of daysInRange(character, spec.fromDate, spec.toDate)) {
    const raw = readLogFile(day.path)
    if (raw == null) continue
    for (const line of raw.split('\n')) {
      const m = EXPORT_LINE_RE.exec(line)
      if (!m) continue
      const bucket = buckets.get(m[3])
      if (!bucket) continue
      bucket.raw++
      const prev = bucket.rows[bucket.rows.length - 1]
      if (spec.dedup && prev && prev.text === m[4]) continue
      bucket.rows.push({ date: m[1] || day.date, time: m[2], streams: [m[3]], text: m[4] })
    }
  }
  return buckets
}

function formatExportRow(r: ExportRow, spec: SessionLogExportSpec): string {
  const parts: string[] = []
  if (spec.includeTimestamps) parts.push(`[${r.date} ${r.time}]`)
  if (spec.includeStreamTags)  parts.push(`[${r.streams.join(', ')}]`)
  parts.push(r.text)
  return parts.join(' ')
}

function exportHeader(
  character: string, spec: SessionLogExportSpec,
  streams: string[], counts: Map<string, number>, lineCount: number,
): string {
  const per = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([s, n]) => `${s} ${n}`).join(', ')
  return [
    `# Lichborne session log export`,
    `# Character: ${character}`,
    `# Range:     ${spec.fromDate} .. ${spec.toDate}`,
    `# Streams:   ${streams.slice().sort().join(', ') || '(none)'}`,
    `# Lines:     ${lineCount}${per ? `  (${per})` : ''}`,
    `# Generated: ${formatTimestamp(Date.now())}`,
    ``, ``,
  ].join('\n')
}

function assembleFile(
  character: string, spec: SessionLogExportSpec,
  rows: ExportRow[], streams: string[], counts: Map<string, number>,
): string {
  const body = rows.map(r => formatExportRow(r, spec)).join('\n')
  const head = spec.summary ? exportHeader(character, spec, streams, counts, rows.length) : ''
  return head + body + (body ? '\n' : '')
}

// ── IPC registration ──────────────────────────────────────────────────────────

let registered = false

export function registerSessionLogHandlers(): void {
  if (registered) return
  registered = true

  ipcMain.on('session-log:append', (_e, payload: SessionLogAppendPayload) => {
    if (!payload?.character || !Array.isArray(payload.records) || payload.records.length === 0) return
    // Log folders are per profile key (DESIGN §56.7.3); a bare name would
    // start a second folder beside the migrated one.
    if (!isProfileKey(payload.character)) {
      console.error(`[sessionLog] dropping records for "${payload.character}": not a Name@SHARD key`)
      return
    }
    const buf = getBuffer(
      payload.character,
      payload.retentionDays ?? 30,
      payload.compress ?? true,
      payload.maxRawMB ?? 0,
    )
    buf.records.push(...payload.records)
    scheduleFlush(buf)
  })

  ipcMain.on('session-log:flush', (_e, character: string) => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
  })

  ipcMain.handle('session-log:list-days', (_e, character: string): SessionLogDay[] => {
    return listDays(character)
  })

  ipcMain.handle('session-log:read-day', (_e, character: string, date: string, tailLines: number, beforeLine: number) => {
    // Flush any pending records for this character first so the read reflects
    // the live session, not just what happened to be flushed to disk already.
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    return readDay(character, date, tailLines, beforeLine)
  })

  // Future log-analysis feature (§10.4, unwired): every logged line in a TIME
  // window. Filters in main (see
  // readWindow) — never bound a time window with a line cap.
  ipcMain.handle('session-log:read-window', (_e, character: string, fromTs: number, toTs: number, maxRows: number) => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    return readWindow(character, fromTs, toTs, maxRows)
  })

  // Catch Me Up over the log. Runs the WHOLE pipeline in main and returns only the
  // compact digest (build-export precedent). Progress is pushed back to the ASKING
  // window on `session-log:catchup-progress` so the UI can say what it's doing for
  // every phase — a 1-year window is minutes of gunzipping, not an instant call.
  // `redactLiterals` = extra strings scrubbed from the AI copy (the account
  // username). Generic credential/PIN patterns are handled by redactForAI itself.
  ipcMain.handle('session-log:catchup-digest', async (e, requestId: string, character: string, fromTs: number, toTs: number, maxBodyChars: number, redactLiterals: string[]): Promise<CatchupDigest> => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    const send = (p: { phase: 'reading' | 'deduping' | 'extracting'; done: number; total: number; lines: number }) => {
      // The sender can go away mid-run (tab closed, window decoupled) — never throw.
      if (!e.sender.isDestroyed()) e.sender.send('session-log:catchup-progress', { requestId, ...p } as CatchupProgress)
    }
    return buildCatchupDigest(character, fromTs, toTs, maxBodyChars, redactLiterals ?? [], send)
  })

  ipcMain.handle('session-log:search', async (_e, character: string, query: string, opts: { regex: boolean; fromDate: string; toDate: string }) => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    return searchLogs(character, query, opts)
  })

  // toDate defaults to fromDate (single-day scan) — the Recent/Search views
  // pass one date, the Export builder passes a range.
  ipcMain.handle('session-log:list-streams', async (_e, character: string, fromDate: string, toDate?: string): Promise<string[]> => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    return listStreams(character, fromDate, toDate ?? fromDate)
  })

  ipcMain.handle('session-log:disk-usage', (_e, character: string): SessionLogDiskUsage => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    return diskUsage(character)
  })

  ipcMain.on('session-log:open-folder', (_e, character: string) => {
    const dir = charDir(character)
    try { fs.mkdirSync(dir, { recursive: true }) } catch { /* openPath will surface it */ }
    shell.openPath(dir)
  })

  // "Create Log file From" — build a clean transcript from a date range +
  // stream selection and either save it (one file, or one per stream) or copy
  // it to the clipboard. The renderer sends only the spec; main does all the
  // reading, filtering, formatting, and writing.
  ipcMain.handle('session-log:build-export', async (_e, character: string, spec: SessionLogExportSpec): Promise<SessionLogExportResult> => {
    const buf = buffers.get(character?.toLowerCase() ?? '')
    if (buf) flushBuffer(buf)
    if (!spec?.streams || spec.streams.length === 0) return { ok: false, empty: true }

    // Clipboard — always combined.
    if (spec.target === 'clipboard') {
      const { rows, counts } = collectCombined(character, spec)
      if (rows.length === 0) return { ok: false, empty: true }
      clipboard.writeText(assembleFile(character, spec, rows, spec.streams, counts))
      return { ok: true, lineCount: rows.length }
    }

    // File, split per stream — pick a folder, write one file per stream.
    if (spec.splitPerStream) {
      const buckets = collectPerStream(character, spec)
      const total = [...buckets.values()].reduce((n, b) => n + b.rows.length, 0)
      if (total === 0) return { ok: false, empty: true }
      const res = await dialog.showOpenDialog({
        title: 'Choose a folder for the split log files',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
      const dir = res.filePaths[0]
      let fileCount = 0
      for (const [stream, bucket] of buckets) {
        if (bucket.rows.length === 0) continue
        const counts = new Map([[stream, bucket.raw]])
        const content = assembleFile(character, spec, bucket.rows, [stream], counts)
        const fname = `${safeName(character)}_${spec.fromDate}_to_${spec.toDate}_${safeName(stream)}.txt`
        try { fs.writeFileSync(path.join(dir, fname), content, 'utf8'); fileCount++ }
        catch (err) { console.error('[sessionLog] split export write failed', err) }
      }
      return { ok: true, lineCount: total, fileCount, location: dir }
    }

    // File, combined — single save dialog.
    const { rows, counts } = collectCombined(character, spec)
    if (rows.length === 0) return { ok: false, empty: true }
    const res = await dialog.showSaveDialog({
      defaultPath: `${safeName(character)}_${spec.fromDate}_to_${spec.toDate}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    // Windows/macOS append the filter's extension when the user types a bare
    // name; GTK does NOT, so a Linux user who types "mylog" would get an
    // extension-less file. Add it ourselves when there isn't one.
    const outPath = path.extname(res.filePath) ? res.filePath : `${res.filePath}.txt`
    try { fs.writeFileSync(outPath, assembleFile(character, spec, rows, spec.streams, counts), 'utf8') }
    catch (err) { console.error('[sessionLog] export write failed', err); return { ok: false } }
    return { ok: true, lineCount: rows.length, location: outPath }
  })
}
