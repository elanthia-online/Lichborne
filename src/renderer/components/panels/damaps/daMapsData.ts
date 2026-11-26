// Da'Maps — data layer.
//
// Da'Maps draws its OWN map (damapsWorld.ts), built in the app from the .damap
// maps downloaded from the Da'Maps repository. Each square on it carries a Lich room
// id, so everything about a room comes from Lich's map database at run time:
//   - identity, travel and "you are here" = Lich room ids (+ `;go2`)
//   - room categories / forage / hunting = Lich `tags`
//   - indoor vs outdoor = "Obvious exits" (indoor) vs "Obvious paths" (outdoor)
//
// It also keeps a small local store of what players FIND when they forage in a
// room, captured from the game text by
// `daMapsObserveLine` / `daMapsObserveCommand` (called from GameWindow).

import type { LichRoom } from '../mapTypes'

/** The display name, kept in one place so it is easy to rename later. */
import { FORAGE_ITEMS } from './forageItems'

export const DA_MAPS_NAME = "Da'Maps"

// ── Arc categories (same three as the Genie view, so the theme vars line up) ──

export type DaArcCategory = 'cardinal' | 'climb' | 'go'

const CARDINALS = new Set([
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw',
  'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
])

export function classifyMove(move: string): DaArcCategory {
  const m = move.trim().toLowerCase()
  if (CARDINALS.has(m)) return 'cardinal'
  if (/^climb\b/.test(m)) return 'climb'
  return 'go'   // go/up/down/out/swim/StringProc (;e …) — anything non-cardinal
}

export const DA_ARC_COLOR: Record<DaArcCategory, string> = {
  cardinal: 'var(--map-arc-cardinal, #888)',
  climb:    'var(--map-arc-vertical, #d4a574)',
  go:       'var(--map-arc-special, #ffb74d)',
}

// ── Room categories from Lich tags (colours match COLOR_LEGEND hexes) ─────────

export interface DaCategory { color: string; name: string; desc: string }

export const DA_CATEGORIES: Record<string, DaCategory> = {
  transport: { color: '#FF00FF', name: 'Fuchsia',    desc: 'Transport (portal, etc.)' },
  healer:    { color: '#00BF80', name: 'Mint',       desc: 'Healer' },
  guild:     { color: '#FF8000', name: 'Orange',     desc: 'Guild' },
  stat:      { color: '#FFFF00', name: 'Yellow',     desc: 'Stat training' },
  shop:      { color: '#FF0000', name: 'Red',        desc: 'Shop' },
  service:   { color: '#00FF00', name: 'Lime',       desc: 'Interesting room (bank, vault, etc.)' },
  water:     { color: '#0000FF', name: 'Blue',       desc: 'Water (swimming)' },
  shrine:    { color: '#A6A3D9', name: 'Periwinkle', desc: 'Shrine' },
}

const TAG_CATEGORY: Record<string, string> = {
  portal: 'transport', nexus: 'transport', ferry: 'transport',
  npchealer: 'healer',
  empath: 'guild', cleric: 'guild', bard: 'guild', paladin: 'guild', moonmage: 'guild',
  trader: 'guild', ranger: 'guild', thief: 'guild', barbarian: 'guild', necromancer: 'guild',
  warriormage: 'guild', 'warrior mage': 'guild', commoner: 'guild',
  stamina: 'stat', wisdom: 'stat', intelligence: 'stat', charisma: 'stat', agility: 'stat',
  strength: 'stat', discipline: 'stat', reflex: 'stat',
  gemshop: 'shop', 'gem shop': 'shop', weaponshop: 'shop', armorshop: 'shop', pawnshop: 'shop',
  pawn: 'shop', furrier: 'shop', tannery: 'shop', 'general store': 'shop', shop: 'shop',
  locksmith: 'shop', herbalist: 'shop', grocer: 'shop',
  bank: 'service', exchange: 'service', vault: 'service', debt: 'service', jail: 'service',
  registration: 'service', mail: 'service', stable: 'service', stables: 'service',
  caravan_stable: 'service', repair: 'service', forging: 'service', outfitting: 'service',
  engineering: 'service', alchemy: 'service', origami: 'service', trashbin: 'service',
  shrine: 'shrine',
}

// Tags that are neither forage items nor hunting areas.
const NON_FORAGE = new Set([
  ...Object.keys(TAG_CATEGORY), 'town', 'carousel', 'lich-map-no-uid-room', 'intercessor',
  'wisdom', 'stable', 'debt',
])

// Order is a guild's priority when it has several (healer beats shop, etc.).
const CATEGORY_PRIORITY = ['transport', 'healer', 'guild', 'stat', 'shop', 'service', 'shrine', 'water']

// ── Area model ────────────────────────────────────────────────────────────────

export interface DaRoom {
  id:       number           // unique within the area (the Lich id when it has one)
  lich:     number | null    // the Lich room behind this square (null = not matched)
  fill?:    string           // colour set by the map maker (the map file)
  stubTo?:  string           // area key this square stands in for (a ↗ marker to another map)
  goTo?:    number           // for a ↗ marker: the Lich room on the other side (go2 target)
  x:        number           // centre, in the area tile's pixel space
  y:        number
  size:     number           // drawn square size
  title:    string
  indoor:   boolean
  category: string | null    // key into DA_CATEGORIES
  forage:   string[]         // from Lich tags
  hunting:  string[]         // from Lich tags (creature/hunting-area tags)
  services: string[]         // the category-ish tags, for the details panel
  exits:    string[]         // wayto commands, as Lich lists them
  crossTo:  string[]         // other area tiles this room leads to
  label:    string           // place name drawn beside the room ('' = none)
  lx:       number           // where the label goes (text start, baseline)
  ly:       number
  building: number | null    // index into DaArea.buildings (indoor rooms only)
  location: string
}

export interface DaArc { a: number; b: number; cat: DaArcCategory }

export interface DaBuilding {
  name:  string
  rooms: number[]
  x1: number; y1: number; x2: number; y2: number
  outline: boolean   // false when a dotted box would overlap other rooms or boxes
  lx: number; ly: number; showLabel: boolean
}

export interface DaArea {
  image:     string
  /** the floor's painted picture, a file in the Da'Maps repository's art/ folder */
  art?:      { file: string; x: number; y: number; scale: number; width: number; height: number }
  name:      string
  rooms:     DaRoom[]
  byId:      Map<number, DaRoom>
  arcs:      DaArc[]
  buildings: DaBuilding[]
  bbox:      { x1: number; y1: number; x2: number; y2: number }
  /** the square for a Lich room id */
  byLich:    Map<number, DaRoom>
  /** free-standing place names drawn by the map maker (the map file) */
  texts?:    { text: string; x: number; y: number }[]
  /** The Genie map's move from one square to another, where either end isn't
   *  in Lich's map (a "?" square), keyed `from>to`: go2 can't walk those, so
   *  Da'Maps' walk does (damaps/daMapsWalk.ts). */
  moves?:    Map<string, string>
}

/** "zoluren-1-crossing-1377284934.png" → "Zoluren 1 Crossing". */
export function areaDisplayName(image: string): string {
  if (image.startsWith('~')) return `${image.slice(1)} (unmapped)`
  let s = image.replace(/\.(png|gif|jpe?g)$/i, '')
  s = s.replace(/[-_ ]\d{9,}$/, '')            // trailing upload timestamps
  s = s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s.replace(/\b([a-z])/g, c => c.toUpperCase())
}

// ── Provinces (for the Global view) ─────────────────────────────────────────

export const PROVINCE_ORDER = ['Zoluren', 'Therengia', 'Ilithi', 'Forfedhdar', "Qi'Reshalia", 'Taisidon', 'Other']

const PROVINCE_BY_PREFIX: Record<string, string> = {
  zoluren: 'Zoluren', therengia: 'Therengia', forfedhdar: 'Forfedhdar',
  ilithi: 'Ilithi', ilitha: 'Ilithi', ilithia: 'Ilithi', illithi: 'Ilithi',
  qi: "Qi'Reshalia", taisidon: 'Taisidon',
}

/** Which province an area belongs to: the tile name's prefix, else its rooms' location. */
export function areaProvince(image: string, rooms: LichRoom[]): string {
  const prefix = image.split(/[,\-_ ]/)[0].trim().toLowerCase()
  if (PROVINCE_BY_PREFIX[prefix]) return PROVINCE_BY_PREFIX[prefix]
  const counts = new Map<string, number>()
  for (const r of rooms) {
    const l = (r.location ?? '').trim()
    if (l) counts.set(l, (counts.get(l) ?? 0) + 1)
  }
  for (const [loc] of [...counts].sort((x, y) => y[1] - x[1])) {
    const hit = PROVINCE_ORDER.find(p => p.toLowerCase() === loc.toLowerCase())
    if (hit) return hit
  }
  return 'Other'
}

export function buildingName(title: string): string {
  const i = title.indexOf(',')
  return (i > 0 ? title.slice(0, i) : title).trim()
}

export function isIndoor(r: LichRoom): boolean {
  const p = (r.paths ?? [])[0] ?? ''
  return /^Obvious exits/i.test(p)
}

// A tag counts as forage only when it names something that can be foraged
// (dr-scripts' list), allowing a describing word in front ("oak limb",
// "sprig of lavender") and singular or plural. Everything else Lich tags a room
// with (NPCs like "priestess", shops, room nicknames like "tgs") is not forage.
const singular = (w: string) => w.replace(/ies$/, 'y').replace(/ie$/, 'y').replace(/(?<=[sxz]|ch|sh)es$/, '').replace(/(?<!s)s$/, '')
const FORAGE_NAMES = FORAGE_ITEMS.map(i => i.split(' ').map(singular).join(' '))
export function isForageTag(tag: string): boolean {
  const t = tag.toLowerCase().split(/\s+/).map(singular).join(' ')
  return FORAGE_NAMES.some(i => t === i || t.endsWith(' ' + i))
}

export function splitTags(tags: string[] | undefined): { forage: string[]; hunting: string[]; services: string[]; category: string | null } {
  const forage: string[] = [], hunting: string[] = [], services: string[] = []
  let best: string | null = null
  for (const raw of tags ?? []) {
    if (typeof raw !== 'string') continue   // the map DB has a few null tags
    const t = raw.trim()
    if (!t || t.startsWith('meta:')) continue
    const key = t.toLowerCase()
    const cat = TAG_CATEGORY[key]
    if (cat) {
      services.push(t)
      if (best === null || CATEGORY_PRIORITY.indexOf(cat) < CATEGORY_PRIORITY.indexOf(best)) best = cat
      continue
    }
    if (NON_FORAGE.has(key)) continue
    // Hunting-area tags are snake_case ids ("pale_grey_death_squirrels").
    if (key.includes('_')) { hunting.push(t.replace(/_/g, ' ').replace(/\d+$/, '').trim()); continue }
    if (isForageTag(t)) forage.push(t)
  }
  return { forage, hunting: [...new Set(hunting)], services, category: best }
}

// ── Observations: forage finds, seen by players ───────────────────────────────
// (Mana is not kept here.)

export interface ForageFind  { n: number; at: number }
export interface DaObservations {
  forage: Record<string, Record<string, ForageFind>>            // by Lich room id → item
}

const OBS_KEY = 'lichborne.damaps.observations.v1'
export const DA_OBS_EVENT = 'lichborne:damaps-observed'

let obsCache: DaObservations | null = null

export function loadObservations(): DaObservations {
  if (obsCache) return obsCache
  try {
    const raw = localStorage.getItem(OBS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    obsCache = {
      forage: parsed?.forage && typeof parsed.forage === 'object' ? parsed.forage : {},
    }
    // Mana readings stored by earlier test builds are dropped.
    if (parsed && 'mana' in parsed) localStorage.setItem(OBS_KEY, JSON.stringify(obsCache))
  } catch {
    obsCache = { forage: {} }
  }
  return obsCache!
}

function saveObservations(o: DaObservations): void {
  obsCache = o
  try { localStorage.setItem(OBS_KEY, JSON.stringify(o)) } catch { /* quota — keep in memory */ }
  try { document.dispatchEvent(new CustomEvent(DA_OBS_EVENT)) } catch { /* no DOM */ }
}

export function recordForage(roomId: number, item: string): void {
  const o = loadObservations()
  const key = item.trim().toLowerCase()
  if (!key) return
  const room = { ...(o.forage[roomId] ?? {}) }
  room[key] = { n: (room[key]?.n ?? 0) + 1, at: Date.now() }
  saveObservations({ ...o, forage: { ...o.forage, [roomId]: room } })
}

// ── Capture from the game stream ──────────────────────────────────────────────
//
// GameWindow calls `daMapsObserveCommand` for every command it sends and
// `daMapsObserveLine` for every main-stream line. Both are cheap no-ops unless
// the player recently sent FORAGE. The room a find belongs to is the one the map
// last resolved (`daMapsSetRoom`, fed by MapPanel). The FORAGE wording is a
// first guess; verify against real output and adjust FORAGE_FIND_RE if needed.

const currentRoomByChar = new Map<string, { id: number }>()
const pendingForage     = new Map<string, { at: number; item: string }>()
const WINDOW_MS = 10_000

export function daMapsSetRoom(character: string, roomId: number | undefined): void {
  if (roomId === undefined) currentRoomByChar.delete(character)
  else currentRoomByChar.set(character, { id: roomId })
}

export function daMapsObserveCommand(character: string, cmd: string): void {
  const c = cmd.trim().toLowerCase()
  const f = /^forag(?:e|)\b\s*(.*)$/.exec(c)
  if (f) pendingForage.set(character, { at: Date.now(), item: f[1].trim() })
}

const FORAGE_FIND_RE = /\b(?:find|found|manage to find|come up with|gather)\s+(?:a|an|some|several)\s+([a-z][a-z' -]{1,40}?)(?=[.!,]|\s+(?:and|which|that|among|in|from)\b)/i
const FORAGE_FAIL_RE = /\b(?:unable to find|fail to find|find nothing|don't find|do not find)\b/i

export function daMapsObserveLine(character: string, line: string): void {
  const now = Date.now()

  const f = pendingForage.get(character)
  if (f !== undefined) {
    if (now - f.at > WINDOW_MS) { pendingForage.delete(character); return }
    if (FORAGE_FAIL_RE.test(line)) { pendingForage.delete(character); return }
    const m = FORAGE_FIND_RE.exec(line)
    if (m) {
      const room = currentRoomByChar.get(character)
      if (room !== undefined) recordForage(room.id, m[1])
      pendingForage.delete(character)
    }
  }
}

// ── No-overlap pass: building outlines and labels ────────────────────────────

export const LABEL_FONT = 9
/** labels are drawn exactly this wide per character (SVG textLength), so their
 * boxes here match the screen at any zoom */
export const CHAR_W = LABEL_FONT * 0.6
type Box = [number, number, number, number]   // x1, y1, x2, y2

function boxesHit(a: Box, b: Box, pad = 0): boolean {
  return a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad
}

/** Grid of boxes for overlap tests. */
class BoxGrid {
  private cells = new Map<string, Box[]>()
  constructor(private cell = 40) {}
  private keys(b: Box): string[] {
    const out: string[] = []
    for (let x = Math.floor(b[0] / this.cell); x <= Math.floor(b[2] / this.cell); x++)
      for (let y = Math.floor(b[1] / this.cell); y <= Math.floor(b[3] / this.cell); y++) out.push(x + ',' + y)
    return out
  }
  add(b: Box) { for (const k of this.keys(b)) { if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k)!.push(b) } }
  /** every stored box whose cells overlap `b` (may repeat) */
  within(b: Box): Box[] {
    const out = new Set<Box>()
    for (const k of this.keys(b)) for (const o of this.cells.get(k) ?? []) out.add(o)
    return [...out]
  }
  hits(b: Box, pad = 0): boolean {
    for (const k of this.keys(b)) for (const o of this.cells.get(k) ?? []) if (boxesHit(b, o, pad)) return true
    return false
  }
}

/**
 * Nothing on the map may overlap. A building's dotted outline is only drawn
 * when it wraps no other room and touches no other outline; each label goes
 * in the first spot around its room/building that's clear of every room
 * square and every other label, or isn't drawn.
 */
export function placeLabelsAndOutlines(rooms: DaRoom[], buildings: DaBuilding[], arcs: DaArc[], byId: Map<number, DaRoom>, opts: { labels: boolean } = { labels: true }) {
  const roomGrid = new BoxGrid()
  const roomBox = (r: DaRoom): Box => [r.x - r.size / 2, r.y - r.size / 2, r.x + r.size / 2, r.y + r.size / 2]
  for (const r of rooms) roomGrid.add(roomBox(r))

  // Outlines, smallest first so a small building wins over a sprawling one.
  const outlineGrid = new BoxGrid(80)
  const order = buildings.map((_, i) => i).sort((a, b) => {
    const A = buildings[a], B = buildings[b]
    return (A.x2 - A.x1) * (A.y2 - A.y1) - (B.x2 - B.x1) * (B.y2 - B.y1)
  })
  const members = new Map<number, Set<number>>()
  buildings.forEach((b, i) => members.set(i, new Set(b.rooms)))
  for (const i of order) {
    const b = buildings[i]
    const box: Box = [b.x1, b.y1, b.x2, b.y2]
    const mine = members.get(i)!
    const foreign = rooms.some(r => !mine.has(r.id) && boxesHit(roomBox(r), box, 1))
    b.outline = !foreign && !outlineGrid.hits(box, 2)
    if (b.outline) outlineGrid.add(box)
  }

  const labelGrid = new BoxGrid()
  // Lines, as boxes along their length, so labels can be kept off them.
  const lineSegs: [number, number, number, number][] = arcs.map(a => {
    const p = byId.get(a.a)!, q = byId.get(a.b)!
    return [p.x, p.y, q.x, q.y]
  })
  const lineGrid = new BoxGrid()
  const segOf = new Map<Box, [number, number, number, number]>()
  for (const sg of lineSegs) {
    const b: Box = [Math.min(sg[0], sg[2]), Math.min(sg[1], sg[3]), Math.max(sg[0], sg[2]), Math.max(sg[1], sg[3])]
    lineGrid.add(b); segOf.set(b, sg)
  }
  const onLine = (box: Box) => lineGrid.within(box).some(b => segHitsRect(segOf.get(b)!, box))
  const outlineBoxes: Box[] = buildings.filter(b => b.outline).map(b => [b.x1, b.y1, b.x2, b.y2])
  const onOutline = (box: Box) => outlineBoxes.some(o => boxesHit(box, o) && !(box[0] > o[0] && box[2] < o[2] && box[1] > o[1] && box[3] < o[3]))
  const fits = (box: Box) => !roomGrid.hits(box, 1.5) && !labelGrid.hits(box, 2) && !onLine(box) && !onOutline(box)
  const tryPlace = (text: string, spots: [number, number][]): [number, number] | null => {
    const w = text.length * CHAR_W, h = LABEL_FONT
    for (const [x, y] of spots) {
      const box: Box = [x, y - h + 1, x + w, y + 2]
      if (fits(box)) { labelGrid.add(box); return [x, y] }
    }
    return null
  }

  if (!opts.labels) return
  // Building names first (they name a whole group), then room landmarks.
  const byIdLocal = new Map(rooms.map(r => [r.id, r]))
  for (const b of buildings) {
    if (!b.name) continue
    if (!b.outline) {
      // No outline to hang the name on: name one of its rooms instead, so the
      // label sits right beside the rooms it describes.
      const r = b.rooms.map(id => byIdLocal.get(id)!).find(m => !m.label)
      if (r) r.label = b.name
      continue
    }
    const w = b.name.length * CHAR_W
    const at = tryPlace(b.name, [
      [b.x1, b.y2 + LABEL_FONT], [b.x1, b.y1 - 3],
      [b.x2 - w, b.y2 + LABEL_FONT], [b.x2 - w, b.y1 - 3],
      [b.x2 + 3, (b.y1 + b.y2) / 2 + 3], [b.x1 - w - 3, (b.y1 + b.y2) / 2 + 3],
    ])
    b.showLabel = !!at
    if (at) [b.lx, b.ly] = at
  }
  for (const r of rooms) {
    if (!r.label) continue
    const w = r.label.length * CHAR_W, h = r.size / 2
    const at = tryPlace(r.label, [
      [r.x + h + 3, r.y + 3], [r.x - h - 3 - w, r.y + 3],
      [r.x - w / 2, r.y - h - 3], [r.x - w / 2, r.y + h + LABEL_FONT],
      [r.x + h + 3, r.y - h - 2], [r.x + h + 3, r.y + h + LABEL_FONT - 1],
    ])
    if (at) [r.lx, r.ly] = at
    else r.label = ''
  }
}

/** does the segment cross the (non-square) rectangle? */
function segHitsRect(seg: [number, number, number, number], r: Box): boolean {
  const [x1, y1, x2, y2] = seg
  const dx = x2 - x1, dy = y2 - y1
  let t0 = 0, t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  return clip(-dx, x1 - r[0]) && clip(dx, r[2] - x1) && clip(-dy, y1 - r[1]) && clip(dy, r[3] - y1)
}
