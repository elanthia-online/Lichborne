// Map data model + shared helpers for BOTH map views — the types and pure
// functions MapPanel, MapImageView (Lich Map) and GenieMapView (Genie Maps)
// import; no React, no state.
//
// Two data sources, two number spaces. `LichRoom` is a row of Lich's map JSON:
// `id` is LICH's own room id, `uid` the GAME's (a different space — the
// `<nav rm>` / subtitle lookup supplies a GAME id, which is why the map must
// index both; Lich 5.20 review). `GenieZone` / `GenieNode` / `GenieArc` /
// `GenieLabel` are the Genie XML shape, produced by `parseGenieZone` (renderer
// DOMParser; throws on `<parsererror>` so a broken file is skipped rather than
// loaded as an empty zone; node colours normalized to canonical hex so effect
// lookups keyed by hex don't silently miss). Genie data carries NO game room
// ids — its matching is title + description (+ exits, in GenieMapView).
//
// `findRoom` is the Lich Map's title+description FALLBACK for when the room-id
// lookup misses (exact-case title → normalized title; then description
// EXACT → SUBSTRING at ≥24 chars, only when it resolves to exactly one
// candidate — B148/B150). `bfsPath` walks Lich `wayto` for the Lich Map's
// left-click path preview and step count. `COLOR_LEGEND` is the community's
// canonical node-colour meanings, surfaced by GenieMapView's legend overlay.

// ── Lich JSON room ────────────────────────────────────────────────────────────

export interface LichRoom {
  id:            number
  title:         string[]
  description:   string[]
  paths?:        string[]
  location?:     string
  wayto:         Record<string, string>
  timeto?:       Record<string, number>
  image?:        string
  image_coords?: [number, number, number, number]
  tags?:         string[]
  /**
   * The GAME's room ids for this room — a different number space from `id`,
   * which is LICH's own. A room can carry several (merged or aliased rooms).
   *
   * Present in Lich's map JSON all along but never modelled here, which is
   * why the map indexed only by `id` and the `<nav rm>` / subtitle lookup —
   * which supplies the GAME id — missed almost every time (Lich 5.20 review).
   */
  uid?:          number[]
}

// ── Genie XML types ───────────────────────────────────────────────────────────

export interface GenieArc {
  exit:        string
  move:        string
  destination: number  // Genie node ID (not used for navigation)
  // Genie XML marks some arcs as `hidden="True"` to indicate "this is a
  // real walkable path but don't draw a line for it on the map." Typical
  // for `go temple`, `go portal`, etc. — destinations that physically sit
  // far from the source room and would stretch ugly cross-map lines.
  // We respect this for rendering but keep the arc available for BFS
  // path-finding (it's still walkable; just not pretty).
  hidden:      boolean
}

export interface GenieNode {
  id:           number
  name:         string
  descriptions: string[]
  x:            number
  y:            number
  z:            number
  color?:       string
  note?:        string
  zoneName:     string
  zoneId:       string
  arcs:         GenieArc[]
  /** Da'Maps build only: a Lich room number set by hand in a .damap file
   *  (tools/damaps/damapFormat.ts), used instead of the automatic match */
  lichId?:      number
}

// Free-floating text label on the map. Genie XML scatters these across
// zones to name landmarks that aren't tied to a specific node — "Temple of
// Light", "Stormwill Tower", "Warrior Mage", etc. Each has its own
// position. Frostbite renders them as text items in the SVG scene; we do
// the same.
export interface GenieLabel {
  text: string
  x:    number
  y:    number
  z:    number
}

export interface GenieZone {
  name:       string
  id:         string
  // Original XML filename (e.g. "Map66_STR3.xml"). Used to resolve cross-zone
  // stub nodes whose `note` field points to another zone's filename, so
  // clicking a boundary stub can switch to the target zone.
  sourceFile: string
  nodes:      GenieNode[]
  labels:     GenieLabel[]
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function lichTitle(room: LichRoom): string {
  const t = (room.title ?? [])[0] ?? ''
  return t.replace(/^\[+/, '').replace(/\]+$/, '').trim()
}

// Lowercase + bracket-strip + whitespace-collapse. Used as a forgiving secondary
// key when an exact-case lookup misses — fixes the common drift between Lich
// titles ("Bank") and Genie node names ("bank" / "[Bank]" / "Bank ").
export function normalizeMatchKey(s: string): string {
  return s.replace(/^\[+/, '').replace(/\]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normalizeDesc(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function shortName(name: string): string {
  const parts = name.split(',')
  return (parts[parts.length - 1] ?? name).trim()
}

export function noteAliases(note: string | undefined): string[] {
  if (!note) return []
  return note.split('|').map(s => s.trim()).filter(Boolean)
}

export function findRoom(
  titleIndex: Map<string, LichRoom[]>,
  gameTitle: string,
  gameDesc: string,
  normTitleIndex?: Map<string, LichRoom[]>,
): LichRoom | undefined {
  if (!gameTitle) return undefined
  // Try exact-case match first; fall back to the normalized index when nothing
  // hits. The fallback fixes the case-drift / bracket-drift class of misses
  // without expanding the search space when an exact match exists.
  let candidates = titleIndex.get(gameTitle) ?? []
  if (candidates.length === 0 && normTitleIndex) {
    candidates = normTitleIndex.get(normalizeMatchKey(gameTitle)) ?? []
  }
  if (candidates.length === 0) return undefined
  if (candidates.length === 1) return candidates[0]
  const normDesc = normalizeDesc(gameDesc)
  if (normDesc) {
    const exact = candidates.find(r =>
      (r.description ?? []).some(d => normalizeDesc(d) === normDesc)
    )
    if (exact) return exact
    // Substring fallback (parallels GenieMapView's currentLocation, B148/B150).
    // Stored descriptions (Lich db OR Genie) are often a truncation of the live
    // look, so exact equality misses on a real ambiguous room. Accept
    // containment in either direction, but only when it resolves to exactly ONE
    // candidate and both strings are long enough to be meaningful — so a generic
    // shared description can't mis-disambiguate. This is the fallback path the
    // Lich Map takes when roomId lookup misses (id is the primary, exact signal).
    if (normDesc.length >= 24) {
      const subHits = candidates.filter(r =>
        (r.description ?? []).some(d => {
          const dn = normalizeDesc(d)
          return dn.length >= 24 && (dn.includes(normDesc) || normDesc.includes(dn))
        })
      )
      if (subHits.length === 1) return subHits[0]
    }
  }
  return undefined
}

// BFS path-finding via Lich wayto — returns sequence of move commands
export function bfsPath(
  roomDb: Map<number, LichRoom>,
  fromId: number,
  toId:   number,
): string[] {
  if (fromId === toId) return []
  const visited = new Set<number>([fromId])
  const queue: { id: number; path: string[] }[] = [{ id: fromId, path: [] }]
  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    const room = roomDb.get(id)
    if (!room?.wayto) continue
    for (const [destStr, cmd] of Object.entries(room.wayto)) {
      if (typeof cmd !== 'string') continue
      const dest = parseInt(destStr, 10)
      if (visited.has(dest)) continue
      visited.add(dest)
      const newPath = [...path, cmd]
      if (dest === toId) return newPath
      queue.push({ id: dest, path: newPath })
    }
  }
  return []
}

// ── Genie XML parser (runs in renderer via DOMParser) ─────────────────────────

// Named-color → hex normalization. Some Genie map XMLs use CSS color
// names (`color="Blue"`) instead of hex codes (`color="#0000FF"`). The
// rect's fill works either way because both are valid CSS colors, but
// downstream effect lookups (`COLOR_LEGEND`, sparkle/heartbeat/ripple
// sets) are keyed by hex — so a `color="Blue"` room would render plain
// blue without any aura or effect. Convert at parse time so the rest
// of the system sees a single canonical hex form.
//
// Only the names actually present in the community maps folder are
// listed here. Unknown named colors fall through to the existing hex
// normalization (which uppercases them); they'll render as the
// browser-recognised CSS color but get no effect — same as before.
const NAMED_COLOR_HEX: Record<string, string> = {
  aqua:  '#00FFFF',
  blue:  '#0000FF',
  lime:  '#00FF00',
  red:   '#FF0000',
  white: '#FFFFFF',
}

function normalizeNodeColor(raw: string | null): string | undefined {
  if (!raw) return undefined
  const named = NAMED_COLOR_HEX[raw.toLowerCase()]
  if (named) return named
  return raw.replace(/^#+/, '#').toUpperCase()
}

export function parseGenieZone(xml: string, sourceFile: string): GenieZone {
  const doc  = new DOMParser().parseFromString(xml, 'application/xml')
  // DOMParser doesn't throw on malformed XML — it returns a document
  // containing a `<parsererror>` element. Without this check a broken
  // file silently becomes a zone with 0 nodes and 0 labels, which then
  // pollutes the loaded set. Throw so the caller's try/catch can skip it.
  const parseErr = doc.querySelector('parsererror')
  if (parseErr) throw new Error(`Malformed XML in ${sourceFile}: ${parseErr.textContent?.slice(0, 200) ?? 'parse error'}`)
  const zoneEl = doc.querySelector('zone')
  // Strip .xml extension for the fallback display name; keep the full filename
  // as sourceFile for cross-zone stub resolution.
  const fallbackName = sourceFile.replace(/\.xml$/i, '')
  const zone: GenieZone = {
    name:       zoneEl?.getAttribute('name') ?? fallbackName,
    id:         zoneEl?.getAttribute('id')   ?? '',
    sourceFile,
    nodes:      [],
    labels:     [],
  }
  // Parse free-floating labels. Genie XML uses `<label text="..."><position
  // x=".." y=".." z=".."/></label>` for landmarks that aren't tied to a
  // node (Temple of Light, Stormwill Tower, Dira Buyer, etc.). Parse
  // directly off the document so we don't get confused by `<label>` elements
  // that might appear inside other parents.
  for (const labelEl of Array.from(doc.querySelectorAll('zone > label'))) {
    const pos = labelEl.querySelector('position')
    if (!pos) continue
    zone.labels.push({
      text: labelEl.getAttribute('text') ?? '',
      x:    parseInt(pos.getAttribute('x') ?? '0', 10),
      y:    parseInt(pos.getAttribute('y') ?? '0', 10),
      z:    parseInt(pos.getAttribute('z') ?? '0', 10),
    })
  }

  for (const nodeEl of Array.from(doc.querySelectorAll('node'))) {
    const pos   = nodeEl.querySelector('position')
    const descs = Array.from(nodeEl.querySelectorAll('description')).map(d => d.textContent ?? '')
    const arcs  = Array.from(nodeEl.querySelectorAll('arc')).map(a => ({
      exit:        a.getAttribute('exit')        ?? '',
      move:        a.getAttribute('move')        ?? '',
      destination: parseInt(a.getAttribute('destination') ?? '0', 10),
      // Genie XML uses `hidden="True"` (capitalized) but accept any case.
      hidden:      (a.getAttribute('hidden') ?? '').toLowerCase() === 'true',
    }))
    zone.nodes.push({
      id:           parseInt(nodeEl.getAttribute('id')   ?? '0', 10),
      name:         nodeEl.getAttribute('name')          ?? '',
      descriptions: descs,
      x:            parseInt(pos?.getAttribute('x') ?? '0', 10),
      y:            parseInt(pos?.getAttribute('y') ?? '0', 10),
      z:            parseInt(pos?.getAttribute('z') ?? '0', 10),
      color:        normalizeNodeColor(nodeEl.getAttribute('color')),
      note:         nodeEl.getAttribute('note')          ?? undefined,
      zoneName:     zone.name,
      zoneId:       zone.id,
      arcs,
    })
  }
  return zone
}

// ── Genie color legend ─────────────────────────────────────────────────────
//
// Community-canonical color meanings used by the Genie maps team. Each hex
// value here corresponds to a `<node ... color="...">` attribute in Genie
// XML; the description is what that color signals about the room. Surfaced
// in GenieMapView's legend overlay (▤ button) when a zone uses these colors.

export const COLOR_LEGEND: Record<string, { name: string; desc: string }> = {
  '#FF00FF': { name: 'Fuchsia',    desc: 'Transport (Portal, etc.)' },
  '#00FF00': { name: 'Lime',       desc: 'Interesting Room (Economic, etc.)' },
  '#FF8000': { name: 'Orange',     desc: 'Guildleader' },
  '#00BF80': { name: 'Mint',       desc: 'Auto-Healer' },
  '#FF0000': { name: 'Red',        desc: 'Shop' },
  '#FFFF00': { name: 'Yellow',     desc: 'Stat Training' },
  '#0000FF': { name: 'Blue',       desc: 'Water (Swimming)' },
  '#000080': { name: 'Navy',       desc: 'Underwater (Drowning)' },
  '#FFBF00': { name: 'Amber',      desc: 'Obstacle (Roundtime)' },
  '#993300': { name: 'Sienna',     desc: 'Mining' },
  '#008000': { name: 'Green',      desc: 'Lumberjacking' },
  '#C2B280': { name: 'Sand',       desc: 'Ranger Trailhead' },
  '#00FFFF': { name: 'Aqua',       desc: 'Player Housing' },
  '#A6A3D9': { name: 'Periwinkle', desc: 'Shrine (Pilgrim Badge)' },
  '#400040': { name: 'Eggplant',   desc: 'Depart Room' },
  '#800080': { name: 'Purple',     desc: 'Favor Altar' },
}
