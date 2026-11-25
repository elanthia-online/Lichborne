// Da'Maps map file (.damap): Da'Maps' own editable map format.
//
// One file is one map (all its floors): rooms with their position, title,
// descriptions, colour and exits, plus free-standing place names. It is plain
// JSON, one room per line, so a change shows up as a readable diff in a pull
// request. The maps live in their own repository (github.com/Kaesken/Da-Maps,
// `maps/`), which Lichborne downloads. The DaMaps Editor (a separate
// map-making program, not in this repo) reads and writes them, and the
// Da'Maps build (buildWorld.ts) reads every one. In the command-line build,
// which can also read Genie map files, a .damap whose `file` names a Genie map
// replaces it; any other .damap is added as a new map.
// The build turns a .damap into the same in-memory shape a Genie XML file
// becomes (`damapToZone`), so matching to Lich, building outlines and the
// "?" room walks all work the same. Nothing here runs a Genie script.
//
// Pure, no Node or DOM: the build and the editor bundle the same code.

import type { GenieZone, GenieNode } from '../../mapTypes'

export const DAMAP_FORMAT = 'damap'
export const DAMAP_VERSION = 1

/** Directions a square's exit can go. The first ten draw a line in the direction named. */
export const EXIT_KINDS = [
  'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest',
  'up', 'down', 'out', 'go', 'climb',
] as const

export interface DaMapExit {
  /** room id this exit leads to (on this map); 0 = somewhere not on this map */
  to:      number
  /** which way (EXIT_KINDS); 'go' and 'climb' are any other command */
  exit:    string
  /** the command that walks it, e.g. "north", "go door", "climb ladder" */
  move:    string
  /** a real path that isn't drawn as a line (it would cross the map) */
  hidden?: boolean
}

export interface DaMapRoom {
  id:           number
  x:            number
  y:            number
  /** floor: 0 is the ground floor, 1 upstairs, -1 down */
  z:            number
  title:        string
  /** the room's description text, one entry per version the game shows */
  descriptions: string[]
  /** '#RRGGBB', or absent for none */
  color?:       string
  /** other names for the room (used to find it by name) */
  aliases?:     string[]
  /** this square is a doorway to another map: that map's file name */
  linksTo?:     string
  /** Lich room number, when the automatic match gets it wrong or can't find one */
  lich?:        number
  exits:        DaMapExit[]
}

export interface DaMapLabel {
  text: string
  x:    number
  y:    number
  z:    number
}

export interface DaMapFile {
  format:  typeof DAMAP_FORMAT
  version: number
  /** short map id, e.g. "1" (the Genie zone id when the map came from one) */
  id:      string
  name:    string
  /** the map's link name ("Map1_Crossing.xml"); doorways in other maps point at it.
   *  This, not the .damap file's own name, is what identifies the map. */
  file:    string
  /** other link names this map answers to: the Genie side maps folded into it
   *  (the Crossing holds the Jadewater, the temple, the market plaza…) */
  includes?: string[]
  rooms:   DaMapRoom[]
  labels:  DaMapLabel[]
}

export function emptyDamap(name = 'New map'): DaMapFile {
  const slug = name.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'New_map'
  return { format: DAMAP_FORMAT, version: DAMAP_VERSION, id: `dm-${slug.toLowerCase()}`, name, file: `DaMap_${slug}.xml`, rooms: [], labels: [] }
}

// ── Read / check ────────────────────────────────────────────────────────────

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const COLOR_RE = /^#[0-9A-F]{6}$/i

/** Read a .damap file's text. Throws with a plain sentence when it isn't one. */
export function parseDamap(text: string): DaMapFile {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error("This isn't a Da'Maps map file (it isn't readable JSON).") }
  const o = raw as Record<string, unknown>
  if (!o || typeof o !== 'object' || o.format !== DAMAP_FORMAT) throw new Error("This isn't a Da'Maps map file.")
  if (num(o.version) > DAMAP_VERSION) throw new Error(`This map was saved by a newer editor (version ${o.version}). Update the editor to open it.`)
  const rooms = Array.isArray(o.rooms) ? o.rooms : []
  const labels = Array.isArray(o.labels) ? o.labels : []
  const out: DaMapFile = {
    format: DAMAP_FORMAT, version: DAMAP_VERSION,
    id: str(o.id) || 'dm-map', name: str(o.name) || 'Unnamed map', file: str(o.file) || 'DaMap_Unnamed.xml',
    rooms: rooms.map((r0): DaMapRoom => {
      const r = r0 as Record<string, unknown>
      const room: DaMapRoom = {
        id: Math.trunc(num(r.id)), x: num(r.x), y: num(r.y), z: Math.trunc(num(r.z)),
        title: str(r.title),
        descriptions: Array.isArray(r.descriptions) ? r.descriptions.filter((d): d is string => typeof d === 'string') : [],
        exits: (Array.isArray(r.exits) ? r.exits : []).map((e0): DaMapExit => {
          const e = e0 as Record<string, unknown>
          const ex: DaMapExit = { to: Math.trunc(num(e.to)), exit: str(e.exit) || 'go', move: str(e.move) }
          if (e.hidden === true) ex.hidden = true
          return ex
        }),
      }
      const c = str(r.color).trim()
      if (COLOR_RE.test(c)) room.color = c.toUpperCase()
      if (Array.isArray(r.aliases)) {
        const a = r.aliases.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
        if (a.length) room.aliases = a
      }
      if (str(r.linksTo).trim()) room.linksTo = str(r.linksTo).trim()
      if (num(r.lich) > 0) room.lich = Math.trunc(num(r.lich))
      return room
    }),
    labels: labels.map((l0): DaMapLabel => {
      const l = l0 as Record<string, unknown>
      return { text: str(l.text), x: num(l.x), y: num(l.y), z: Math.trunc(num(l.z)) }
    }),
  }
  if (!out.file.toLowerCase().endsWith('.xml')) out.file += '.xml'
  if (Array.isArray(o.includes)) {
    const inc = o.includes.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
    if (inc.length) out.includes = inc
  }
  return out
}

/** Problems worth telling the person about before they share a map. Empty = fine. */
export function checkDamap(m: DaMapFile): string[] {
  const out: string[] = []
  const ids = new Set<number>()
  const dupes = new Set<number>()
  for (const r of m.rooms) { if (ids.has(r.id)) dupes.add(r.id); ids.add(r.id) }
  if (dupes.size) out.push(`${dupes.size} room number${dupes.size === 1 ? ' is' : 's are'} used twice (${[...dupes].slice(0, 5).join(', ')})`)
  const untitled = m.rooms.filter(r => !r.title.trim() && !r.linksTo).length
  if (untitled) out.push(`${untitled} room${untitled === 1 ? ' has' : 's have'} no title`)
  let broken = 0
  for (const r of m.rooms) for (const e of r.exits) if (e.to && !ids.has(e.to)) broken++
  if (broken) out.push(`${broken} exit${broken === 1 ? ' leads' : 's lead'} to a room that isn't on this map`)
  const lone = m.rooms.filter(r => !r.exits.length && !m.rooms.some(o => o.exits.some(e => e.to === r.id))).length
  if (lone) out.push(`${lone} room${lone === 1 ? ' has' : 's have'} no exits`)
  return out
}

/**
 * JSON with one room per line, so a saved map diffs cleanly. Rooms stay in the
 * map's own order (new ones at the end): the Lich matcher breaks ties by order,
 * so sorting them would change which Lich room a square gets.
 */
export function stringifyDamap(m: DaMapFile): string {
  const clean: DaMapFile = {
    format: DAMAP_FORMAT, version: DAMAP_VERSION, id: m.id, name: m.name, file: m.file,
    rooms: m.rooms.map(r => {
      const o: DaMapRoom = { id: r.id, x: r.x, y: r.y, z: r.z, title: r.title, descriptions: r.descriptions, exits: r.exits.map(e => (e.hidden ? { to: e.to, exit: e.exit, move: e.move, hidden: true } : { to: e.to, exit: e.exit, move: e.move })) }
      if (r.color) o.color = r.color
      if (r.aliases?.length) o.aliases = r.aliases
      if (r.linksTo) o.linksTo = r.linksTo
      if (r.lich) o.lich = r.lich
      return o
    }),
    labels: m.labels,
  }
  // One room (and one place name) per line: small files, and a change to a room
  // shows up as a one-line diff.
  const head = JSON.stringify({ format: clean.format, version: clean.version, id: clean.id, name: clean.name, file: clean.file, ...(m.includes?.length ? { includes: m.includes } : {}) }, null, 1).slice(0, -2)
  const list = (xs: unknown[]) => xs.length ? '[\n' + xs.map(x => '  ' + JSON.stringify(x)).join(',\n') + '\n ]' : '[]'
  return `${head},\n "rooms": ${list(clean.rooms)},\n "labels": ${list(clean.labels)}\n}\n`
}

// ── Genie zone <-> .damap ───────────────────────────────────────────────────

const isMapFile = (s: string) => /\.xml$/i.test(s.trim())

/** A Genie map (already read by readGenieXml) as a .damap, for "Import Genie map". */
export function zoneToDamap(zone: GenieZone): DaMapFile {
  return {
    format: DAMAP_FORMAT, version: DAMAP_VERSION,
    id: zone.id || zone.sourceFile.replace(/\.xml$/i, ''),
    name: zone.name, file: zone.sourceFile,
    rooms: zone.nodes.map(n => {
      const parts = (n.note ?? '').split('|').map(s => s.trim()).filter(Boolean)
      const room: DaMapRoom = {
        id: n.id, x: n.x, y: n.y, z: n.z, title: n.name, descriptions: [...n.descriptions],
        exits: n.arcs.map(a => (a.hidden
          ? { to: a.destination, exit: a.exit || 'go', move: a.move, hidden: true }
          : { to: a.destination, exit: a.exit || 'go', move: a.move })),
      }
      if (n.color && COLOR_RE.test(n.color)) room.color = n.color.toUpperCase()
      const aliases = parts.filter(p => !isMapFile(p))
      if (aliases.length) room.aliases = aliases
      const link = parts.find(isMapFile)
      if (link) room.linksTo = link
      return room
    }),
    labels: zone.labels.map(l => ({ ...l })),
  }
}

/** A .damap as the map shape the Da'Maps build reads (the same one a Genie XML becomes). */
export function damapToZone(m: DaMapFile): GenieZone {
  return {
    name: m.name, id: m.id, sourceFile: m.file,
    nodes: m.rooms.map((r): GenieNode => {
      const note = [...(r.aliases ?? []), ...(r.linksTo ? [r.linksTo] : [])].join('|')
      const n: GenieNode = {
        id: r.id, name: r.title, descriptions: [...r.descriptions], x: r.x, y: r.y, z: r.z,
        color: r.color, note: note || undefined, zoneName: m.name, zoneId: m.id,
        arcs: r.exits.map(e => ({ exit: e.exit, move: e.move, destination: e.to, hidden: !!e.hidden })),
      }
      if (r.lich) n.lichId = r.lich
      return n
    }),
    labels: m.labels.map(l => ({ ...l })),
  }
}

// ── Editing helpers (used by the editor) ────────────────────────────────────

const OPPOSITE: Record<string, string> = {
  north: 'south', south: 'north', east: 'west', west: 'east',
  northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest',
  up: 'down', down: 'up',
}
export const oppositeExit = (exit: string): string | null => OPPOSITE[exit] ?? null

/** The compass direction from one square to another (screen y grows downward). */
export function directionBetween(ax: number, ay: number, bx: number, by: number): string {
  const ang = Math.atan2(ay - by, bx - ax) * 180 / Math.PI   // 0 = east, 90 = north
  const dirs = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast']
  return dirs[((Math.round(ang / 45) % 8) + 8) % 8]
}
