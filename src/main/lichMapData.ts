// Lich map data — reads where things are from Lich's own data files (v1.1.0, DESIGN §19.20)
//
// dr-scripts ships YAML files in `{Lich}/scripts/data/` that its scripts use to
// find things: hunting grounds, forage items, town services, shrines, mining
// and lumber areas, climbing and swimming practice. Each names LICH room ids.
// The Graph map's Find lens shows them on the map. This file turns the seven
// files below into flat `MapDataRow`s; nothing else in Lichborne parses them.
//
// Read-only: Lichborne never writes in Lich's folders.
//
// TOLERANT BY DESIGN. These are other people's files and they change. Every
// reader takes `unknown` and keeps only the shapes it recognises, so a new key
// or a restructured entry costs that entry, never the file, and a file that
// won't load costs only its category. A file that is MISSING and one that is
// BROKEN are reported differently (`missing` / `error`), so the view can say
// "no hunting data" rather than showing an empty list as if nothing existed
// (pitfall #197).
//
// YAML: these are Ruby (Psych, YAML 1.1) files with anchors, `<<` merges and
// `19_242`-style numbers, so they are loaded with the 1.1 schema plus the merge
// tag, the same as the Lich Dashboard (pitfall #201). The default schema reads
// `<<` as a literal key.
//
// RANK RANGES live in COMMENTS above each hunting ground ("# https://…  90-130"),
// which a YAML parser throws away, so `commentRanges` reads them from the raw
// text. Best effort: a ground with no readable comment simply has no range.
//
// Kept free of electron imports so a plain-node harness can run it.
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { MapDataCategory, MapDataFile, MapDataResult, MapDataRow } from '../shared/types'

const SCHEMA = yaml.YAML11_SCHEMA.withTags(yaml.mergeTag)

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** A Lich room id from a YAML value, or null. */
function toId(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null
  if (typeof v === 'string' && /^\d[\d_]*$/.test(v.trim())) return Number(v.replace(/_/g, ''))
  return null
}
function toIds(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  const out: number[] = []
  for (const e of v) { const id = toId(e) ?? (isObj(e) ? toId(e.id) ?? toId(e.room) : null); if (id != null) out.push(id) }
  return out
}

/** "metal_repair" → "Metal repair". */
export function prettyKey(k: string): string {
  const s = k.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Rank or skill ranges written in the comments above a key, by key name.
 *  For each `  name:` line, the comment lines directly above it are scanned
 *  for a trailing "90-130" (a "?" after it is allowed). Several comments above
 *  one key (a ground with two creatures) widen the range to cover them all. */
export function commentRanges(text: string): Map<string, string> {
  const out = new Map<string, string>()
  let lo: number | null = null, hi: number | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const comment = /^\s*#(.*)$/.exec(line)
    if (comment) {
      const m = /(\d{1,4})\s*-\s*(\d{1,4})\+?\??\s*$/.exec(comment[1])
      if (m) {
        const a = Number(m[1]), b = Number(m[2])
        if (a <= b) { lo = lo == null ? a : Math.min(lo, a); hi = hi == null ? b : Math.max(hi, b) }
      }
      continue
    }
    const key = /^\s{0,4}(?:- )?([A-Za-z0-9_']+):?\s*$/.exec(line)
    if (key && lo != null && hi != null && !out.has(key[1])) out.set(key[1], `${lo}-${hi}`)
    if (line.trim() !== '') { lo = null; hi = null }
  }
  return out
}

// ── One reader per file ───────────────────────────────────────────────────────

function readTown(doc: unknown): MapDataRow[] {
  if (!isObj(doc)) return []
  const rows: MapDataRow[] = []
  for (const [town, services] of Object.entries(doc)) {
    if (!isObj(services)) continue
    for (const [key, v] of Object.entries(services)) {
      if (key === 'currency') continue
      const name = prettyKey(key)
      if (isObj(v)) {
        const id = toId(v.id)
        if (id != null) {
          rows.push({ category: 'town', town, name, rooms: [id], note: typeof v.name === 'string' ? v.name : undefined })
          continue
        }
        // A group, e.g. guild_leaders: { Barbarian: { name, id }, … }.
        for (const [sub, sv] of Object.entries(v)) {
          const sid = isObj(sv) ? toId(sv.id) : toId(sv)
          if (sid == null) continue
          rows.push({ category: 'town', town, name: `${name}: ${prettyKey(sub)}`, rooms: [sid], note: isObj(sv) && typeof sv.name === 'string' ? sv.name : undefined })
        }
      } else {
        const ids = toIds(v)
        if (ids.length) rows.push({ category: 'town', town, name, rooms: ids })
      }
    }
  }
  return rows
}

function readHunting(doc: unknown, text: string): MapDataRow[] {
  if (!isObj(doc)) return []
  const ranges = commentRanges(text)
  // Which town a ground is listed under, when the file says.
  const townOf = new Map<string, string>()
  if (isObj(doc.hunting_areas_by_town)) {
    for (const [town, list] of Object.entries(doc.hunting_areas_by_town)) {
      if (Array.isArray(list)) for (const z of list) if (typeof z === 'string' && !townOf.has(z)) townOf.set(z, town)
    }
  }
  const rows: MapDataRow[] = []
  const note = (key: string) => { const r = ranges.get(key); return r ? `ranks ${r}` : undefined }
  if (isObj(doc.hunting_zones)) {
    for (const [key, v] of Object.entries(doc.hunting_zones)) {
      const ids = toIds(v)
      if (ids.length) rows.push({ category: 'hunting', name: prettyKey(key), town: townOf.get(key), rooms: ids, note: note(key) })
    }
  }
  if (isObj(doc.escort_zones)) {
    for (const [key, v] of Object.entries(doc.escort_zones)) {
      const id = isObj(v) ? toId(v.base) : null
      if (id == null) continue
      const n = note(key)
      rows.push({ category: 'hunting', name: prettyKey(key), town: townOf.get(key), rooms: [id], note: n ? `${n}, way in` : 'way in' })
    }
  }
  return rows
}

function readForage(doc: unknown): MapDataRow[] {
  const list = isObj(doc) ? doc.foragables : null
  if (!Array.isArray(list)) return []
  const rows: MapDataRow[] = []
  for (const e of list) {
    if (!isObj(e) || typeof e.item !== 'string') continue
    const ids = toIds(e.rooms)
    if (ids.length) rows.push({ category: 'forage', name: e.item, rooms: ids })
  }
  return rows
}

function readShrines(doc: unknown): MapDataRow[] {
  const towns = isObj(doc) ? doc.shrines : null
  if (!isObj(towns)) return []
  const rows: MapDataRow[] = []
  for (const [town, list] of Object.entries(towns)) {
    if (!Array.isArray(list)) continue
    for (const e of list) {
      if (!isObj(e)) continue
      const id = toId(e.start_room)
      const name = typeof e.location === 'string' ? e.location.trim() : ''
      if (id != null && name) rows.push({ category: 'shrine', town, name, rooms: [id] })
    }
  }
  return rows
}

function readAreas(doc: unknown, rootKey: string, category: MapDataCategory): MapDataRow[] {
  const areas = isObj(doc) ? doc[rootKey] : null
  if (!isObj(areas)) return []
  const rows: MapDataRow[] = []
  for (const [key, v] of Object.entries(areas)) {
    const ids = toIds(v)
    if (ids.length) rows.push({ category, name: prettyKey(key), rooms: ids })
  }
  return rows
}

function readAthletics(doc: unknown, text: string): MapDataRow[] {
  if (!isObj(doc)) return []
  const ranges = commentRanges(text)
  const rows: MapDataRow[] = []
  if (isObj(doc.athletics_options)) {
    for (const [town, list] of Object.entries(doc.athletics_options)) {
      const ids = toIds(list)
      if (ids.length) rows.push({ category: 'climbing', town: prettyKey(town), name: 'Climbing spots', rooms: ids })
    }
  }
  if (isObj(doc.practice_options)) {
    for (const [key, v] of Object.entries(doc.practice_options)) {
      const id = isObj(v) ? toId(v.id) : null
      if (id == null) continue
      const r = ranges.get(key)
      rows.push({ category: 'climbing', name: prettyKey(key), rooms: [id], note: r ? `Athletics ${r}` : undefined })
    }
  }
  if (isObj(doc.swimming_options)) {
    for (const [key, v] of Object.entries(doc.swimming_options)) {
      const ids = isObj(v) ? toIds(v.rooms) : []
      if (!ids.length) continue
      const r = ranges.get(key)
      rows.push({ category: 'swimming', name: prettyKey(key), rooms: ids, note: r ? `Athletics ${r}` : undefined })
    }
  }
  return rows
}

const FILES: { file: string; read: (doc: unknown, text: string) => MapDataRow[] }[] = [
  { file: 'base-town.yaml',      read: readTown },
  { file: 'base-hunting.yaml',   read: readHunting },
  { file: 'base-forage.yaml',    read: readForage },
  { file: 'base-shrines.yaml',   read: readShrines },
  { file: 'base-mining.yaml',    read: doc => readAreas(doc, 'mining_buddy_rooms', 'mining') },
  { file: 'base-lumber.yaml',    read: doc => readAreas(doc, 'lumber_buddy_rooms', 'lumber') },
  { file: 'base-athletics.yaml', read: readAthletics },
]

/** Parse one file's text. Exported for the harness. */
export function parseMapDataFile(file: string, text: string): MapDataRow[] {
  const spec = FILES.find(f => f.file === file)
  if (!spec) return []
  const doc = text.trim() ? yaml.load(text, { schema: SCHEMA }) : null
  const rows = spec.read(doc, text)
  for (const r of rows) r.rooms = [...new Set(r.rooms)]
  return rows
}

// One result per data folder, reused while no file's size or time has changed.
let cache: { dir: string; stamp: string; result: MapDataResult } | null = null

async function statAll(dataDir: string): Promise<{ stamp: string; stats: Map<string, fs.Stats | null> }> {
  const stamps: string[] = []
  const stats = new Map<string, fs.Stats | null>()
  for (const f of FILES) {
    let st: fs.Stats | null = null
    try { st = await fs.promises.stat(path.join(dataDir, f.file)) } catch { st = null }
    stats.set(f.file, st)
    stamps.push(st ? `${f.file}:${st.size}:${st.mtimeMs}` : `${f.file}:-`)
  }
  return { stamp: stamps.join('|'), stats }
}

/** The data files' sizes and times as one string: changes whenever any file
 *  does (a dr-scripts update rewrites them). Lets the renderer ask "changed?"
 *  without the rows crossing IPC. */
export async function lichMapDataStamp(dataDir: string): Promise<string> {
  return (await statAll(dataDir)).stamp
}

/** Read every data file in `dataDir` (`{Lich}/scripts/data`). Never throws. */
export async function readLichMapData(dataDir: string): Promise<MapDataResult> {
  const { stamp, stats } = await statAll(dataDir)
  if (cache && cache.dir === dataDir && cache.stamp === stamp) return cache.result

  const rows: MapDataRow[] = []
  const files: MapDataFile[] = []
  for (const f of FILES) {
    if (!stats.get(f.file)) { files.push({ file: f.file, rows: 0, missing: true }); continue }
    try {
      const text = await fs.promises.readFile(path.join(dataDir, f.file), 'utf8')
      const got = parseMapDataFile(f.file, text)
      rows.push(...got)
      files.push({ file: f.file, rows: got.length })
    } catch (e) {
      files.push({ file: f.file, rows: 0, error: e instanceof Error ? e.message.split('\n')[0] : String(e) })
    }
    // These files run to hundreds of KB; let the game sockets breathe between them.
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  const result = { rows, files, stamp }
  cache = { dir: dataDir, stamp, result }
  return result
}
