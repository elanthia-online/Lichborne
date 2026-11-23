// Da'Maps view — the third map mode behind MapPanel ("Lich Map" / "Genie Maps"
// / "Da'Maps"). Draws Da'Maps' OWN map (damaps/damapsWorld.ts, built once by
// tools/damaps/build-damaps.mjs); it reads no other map while you play. Every
// square carries a Lich room id, which supplies the room details, the
// forage notes (damaps/daMapsData.ts) and `;go2`.
//
// Interaction model:
//   - hover a room        → the side panel's "Room" tab shows it
//   - left-click a room   → pin it in the "Room" tab (click again to unpin);
//                           a ↗ marker opens the map it leads to
//   - right-click a room  → `;go2 <lich id>`; for a "?" square (not in Lich's
//                           map) go2 goes as far as it can and Lichborne's own
//                           walker does the rest (damaps/daMapsWalk.ts)
//   - drag to pan, wheel to zoom
import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import type { LichRoom } from './mapTypes'
import { COLOR_LEGEND } from './mapTypes'
import { loadDaWorld, loadDaArt, hydrateArea, DA_ROOM_SIZE, type DaWorld, type DaArt } from './damaps/damapsWorld'
import { lichTitle, normalizeMatchKey } from './mapTypes'
import { planDaRoute, locateUnmapped, legEnd, isUnmapped, type DaLeg } from './damaps/daMapsWalk'
import { useGenieWalk } from '../../GenieWalkContext'
import { showToast } from '../../toasts'
import {
  DA_MAPS_NAME, DA_ARC_COLOR, DA_CATEGORIES, DA_OBS_EVENT,
  LABEL_FONT, CHAR_W, loadObservations, PROVINCE_ORDER,
  type DaArea, type DaRoom, type DaArcCategory, type DaObservations,
} from './damaps/daMapsData'

interface Props {
  lichDb:        Map<number, LichRoom>
  currentRoom?:  LichRoom
  character:     string
  /** the game's room title and number, for finding you on a "?" square */
  roomTitle?:    string
  roomId?:       number
  onSendCommand: (cmd: string) => void
}

interface Transform { x: number; y: number; scale: number }

const PANEL_FONT = 'calc(var(--panel-font-size, var(--game-font-size, 12px)) * 0.9)'
const MIN_SCALE = 0.05
const MAX_SCALE = 8
/** At or above this zoom, indoor rooms are drawn; below it, buildings are outlines. */
const INDOOR_SCALE = 1.4
/** The zoom a map opens at when you're on it, centred on you (Kaesken: a set
 *  zoom rather than fitting the whole map). You can zoom from there. */
const OPEN_SCALE = 2
/** A map's floors share one set of coordinates, so they're one map to the camera. */
const mapOf = (areaKey: string) => areaKey.replace(/@-?\d+$/, '')
const PANEL_W = 270
// Global view layout (world units): each area is a thumbnail in a grid cell,
// grouped by province.
const G_COLS = 10, G_CELL = 240, G_THUMB = 200, G_HEAD = 70

interface WorldArea {
  image: string; name: string; province: string; rooms: number
  x: number; y: number          // cell top-left
  s: number; ox: number; oy: number   // thumbnail transform (area px → world)
  area: DaArea
}
interface World { areas: WorldArea[]; byImage: Map<string, WorldArea>; heads: { name: string; y: number }[]; w: number; h: number }

/** Da'Maps' own map, with each area filled in from Lich on first use. */
interface MapSource {
  globalKeys: string[]
  area(key: string): DaArea | null
  /** the area to show for a Lich room; `prefer` keeps the map you're on when the room is on two */
  areaOf(lichId: number, prefer?: string): string
  province(key: string): string
  /** rooms on a map, from the file (no hydration) */
  roomCount(key: string): number
  /** the floors of this area's map, ground floor first */
  floors(key: string): string[]
  stats: { squares: number; matched: number }
}

function worldSource(w: DaWorld, lichDb: Map<number, LichRoom>): MapSource {
  const cache = new Map<string, DaArea>()
  const zoneOf = (key: string) => key.replace(/@-?\d+$/, '')
  return {
    globalKeys: w.globalKeys,
    area(key) {
      let a = cache.get(key)
      if (!a) {
        const wa = w.byKey.get(key)
        if (!wa) return null
        a = hydrateArea(wa, lichDb)
        cache.set(key, a)
      }
      return a
    },
    areaOf(id, prefer) {
      const keys = w.keysOf.get(id) ?? []
      if (prefer && keys.includes(prefer)) return prefer
      return (prefer && keys.find(k => zoneOf(k) === zoneOf(prefer))) || keys[0] || ''
    },
    province: key => w.byKey.get(key)?.province ?? 'Other',
    roomCount: key => w.byKey.get(key)?.rooms.length ?? 0,
    floors: key => w.byKey.get(key)?.floors ?? [key],
    stats: { squares: w.file.stats.squares, matched: w.file.stats.matched },
  }
}
const sourceCache = new WeakMap<Map<number, LichRoom>, { world: DaWorld; src: MapSource }>()
function getSource(world: DaWorld, lichDb: Map<number, LichRoom>): MapSource {
  const hit = sourceCache.get(lichDb)
  if (hit && hit.world === world) return hit.src
  const src = worldSource(world, lichDb)
  sourceCache.set(lichDb, { world, src })
  return src
}

function buildWorld(src: MapSource, only: string): World {
  const groups = new Map<string, WorldArea[]>()
  for (const image of src.globalKeys) {
    const area = src.area(image)
    if (!area || area.rooms.length === 0) continue
    const province = src.province(image)
    if (province !== only) continue
    const bw = Math.max(1, area.bbox.x2 - area.bbox.x1), bh = Math.max(1, area.bbox.y2 - area.bbox.y1)
    // capped so a tiny area (1-3 rooms) isn't blown up to fill its cell
    const sc = Math.min(G_THUMB / bw, G_THUMB / bh, 1.5)
    const wa: WorldArea = { image, name: area.name, province, rooms: area.rooms.length, x: 0, y: 0, s: sc, ox: 0, oy: 0, area }
    if (!groups.has(province)) groups.set(province, [])
    groups.get(province)!.push(wa)
  }
  const areas: WorldArea[] = [], heads: { name: string; y: number }[] = []
  let y = 0
  for (const prov of PROVINCE_ORDER) {
    const list = (groups.get(prov) ?? []).sort((a, b) => a.name.localeCompare(b.name))
    if (!list.length) continue
    heads.push({ name: prov === 'Other' ? 'Elsewhere' : prov, y: y + 44 })
    y += G_HEAD
    list.forEach((wa, i) => {
      wa.x = (i % G_COLS) * G_CELL
      wa.y = y + Math.floor(i / G_COLS) * G_CELL
      const bw = (wa.area.bbox.x2 - wa.area.bbox.x1) * wa.s, bh = (wa.area.bbox.y2 - wa.area.bbox.y1) * wa.s
      wa.ox = wa.x + (G_CELL - bw) / 2 - wa.area.bbox.x1 * wa.s
      wa.oy = wa.y + 10 + (G_THUMB - bh) / 2 - wa.area.bbox.y1 * wa.s
      areas.push(wa)
    })
    y += Math.ceil(list.length / G_COLS) * G_CELL
  }
  return { areas, byImage: new Map(areas.map(a => [a.image, a])), heads, w: G_COLS * G_CELL, h: y }
}
// one World per province, built the first time that province is opened
const worldCache = new WeakMap<MapSource, Map<string, World>>()
/** "Zoluren 1 Crossing" → "Crossing": the province heading already says where. */
function shortAreaName(name: string): string {
  const out = name.replace(/^(zoluren|therengia|ilithi|ilitha|ilithia|forfedhdar|qi|taisidon)\b\s*/i, '')
    .replace(/^[A-Za-z]?-?\d+[a-z]?\b\s*/, '')
  return out || name
}

const sectionHead: CSSProperties = {
  fontWeight: 'bold', fontSize: '0.91em', textTransform: 'uppercase', letterSpacing: 0.5,
  marginTop: 8, marginBottom: 4,
}
const muted: CSSProperties = { color: 'var(--map-text-muted, #888)' }

/** Black or white, whichever reads better on a square's fill colour. */
function inkOn(fill: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(fill)
  if (!m) return 'var(--map-text, #ddd)'
  const n = parseInt(m[1], 16)
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 140 ? '#000' : '#fff'
}

/** "You are here", the same sonar ping as Lichborne's other maps: two rings
 *  expanding half a cycle apart (map-panel.css `.genie-here-ping`, stopped by
 *  epilepsy-safe mode) over a solid ring on the square. */
function HerePing({ x, y, size }: { x: number; y: number; size: number }) {
  const ping = size * 1.3125, solid = size * 0.5
  const c = 'var(--map-current-color, #4caf50)'
  return (
    <g pointerEvents="none" style={{ transform: `translate(${x}px, ${y}px)` }}>
      <circle className="genie-here-ping" r={ping} fill="none" stroke={c} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <circle className="genie-here-ping genie-here-ping--delayed" r={ping} fill="none" stroke={c} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <circle r={solid} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      <circle r={solid} fill="none" stroke={c} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </g>
  )
}

export default function DaMapsView({ lichDb, currentRoom, character, roomTitle, roomId, onSendCommand }: Props) {
  // Da'Maps' own map, loaded once (a separate chunk).
  const [daWorld, setDaWorld] = useState<DaWorld | null>(null)
  const [worldError, setWorldError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadDaWorld().then(w => { if (live) setDaWorld(w) }, e => { if (live) setWorldError(String(e?.message ?? e)) })
    return () => { live = false }
  }, [])
  if (!daWorld) {
    return (
      <div className="map-overlay">
        <div className="map-empty">
          <div className="map-empty-icon">🗺</div>
          <div className="map-empty-msg">{worldError ? `Couldn't load ${DA_MAPS_NAME}'s map` : `Loading ${DA_MAPS_NAME}…`}</div>
          {worldError && <div className="map-empty-sub">{worldError}</div>}
        </div>
      </div>
    )
  }
  return <DaMapsCanvas world={daWorld} lichDb={lichDb} currentRoom={currentRoom} character={character}
    roomTitle={roomTitle ?? ''} roomId={roomId} onSendCommand={onSendCommand} />
}

// ── The province map (Global's first view) ──────────────────────────────────
// A rough sketch of the lands, not to scale: each province is one clickable
// shape (Kaesken's layout). Hues are fixed per province, mixed with the map's
// own background and text so they hold on light and dark themes. Maps that
// belong to no province (events, mazes, transports) are "Elsewhere".
const PROVINCE_SHAPES: { id: string; hue: string; points: string; lx: number; ly: number }[] = [
  { id: 'Therengia', hue: '#4f9a5c', lx: 240, ly: 110,
    points: '0,0 479,0 486,80 464,152 474,247 400,249 289,262 124,237 54,187 0,157' },
  { id: 'Forfedhdar', hue: '#a8834c', lx: 105, ly: 365,
    points: '0,157 54,187 124,237 289,262 254,277 219,332 207,402 219,455 184,472 89,522 0,535' },
  { id: 'Zoluren', hue: '#5277c4', lx: 360, ly: 350,
    points: '289,262 400,249 474,247 497,272 487,317 504,427 369,437 219,455 207,402 219,332 254,277' },
  { id: 'Ilithi', hue: '#b0505c', lx: 290, ly: 565,
    points: '0,535 89,522 184,472 219,455 369,437 504,427 519,477 566,477 534,520 599,520 644,562 627,625 494,639 0,639' },
  { id: "Qi'Reshalia", hue: '#9a62bd', lx: 612, ly: 320,
    points: '520,190 640,180 707,215 712,330 690,440 610,465 548,455 512,385 505,280' },
  { id: 'Taisidon', hue: '#8c8c8c', lx: 688, ly: 576,
    points: '664,592 700,586 714,610 694,634 664,628' },
]

export function ProvinceMap({ counts, here, hover, onHover, onOpen, rightInset }: {
  counts: Map<string, number>; here: string | null; hover: string | null
  onHover: (p: string | null) => void; onOpen: (p: string) => void; rightInset: number
}) {
  const elsewhere = counts.get('Other') ?? 0
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, right: rightInset, background: 'var(--map-bg, #111)' }}
      onMouseLeave={() => onHover(null)}>
      <svg viewBox="-24 -24 768 700" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x={612} y={110} fontSize={13} fontStyle="italic" textAnchor="middle" pointerEvents="none"
          style={{ fill: 'var(--map-text-muted, #888)', fontFamily: 'var(--font-mono, monospace)' }}>Reshal Sea</text>
        {PROVINCE_SHAPES.map(p => {
          const n = counts.get(p.id) ?? 0
          const on = n > 0
          const hot = on && hover === p.id
          const isHere = here === p.id
          return (
            <g key={p.id} style={{ cursor: on ? 'pointer' : 'default' }}
              onMouseEnter={() => onHover(on ? p.id : null)}
              onClick={() => { if (on) onOpen(p.id) }}>
              <title>{on ? `${p.id}: ${n} map${n === 1 ? '' : 's'}. Click to list them.` : `${p.id}: no maps yet`}</title>
              <polygon points={p.points} strokeLinejoin="round" style={{
                fill: `color-mix(in srgb, ${p.hue} ${hot ? 52 : on ? 32 : 12}%, var(--map-bg, #111))`,
                stroke: `color-mix(in srgb, ${p.hue} ${hot ? 90 : 55}%, var(--map-text, #ddd))`,
                strokeWidth: hot ? 2.5 : 1.5,
                transition: 'fill 120ms',
              }} />
              {p.id !== 'Taisidon' ? (
                <>
                  <text x={p.lx} y={p.ly} fontSize={24} fontWeight="bold" textAnchor="middle" pointerEvents="none"
                    style={{ fill: 'var(--map-text, #ddd)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.12em' }}>
                    {p.id.toUpperCase()}</text>
                  <text x={p.lx} y={p.ly + 22} fontSize={13} textAnchor="middle" pointerEvents="none"
                    style={{ fill: 'var(--map-text-muted, #999)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {on ? `${n} map${n === 1 ? '' : 's'}` : 'no maps yet'}{isHere ? ' · you are here' : ''}</text>
                </>
              ) : (
                <text x={p.lx} y={p.ly} fontSize={13} textAnchor="middle" pointerEvents="none"
                  style={{ fill: 'var(--map-text, #ddd)', fontFamily: 'var(--font-mono, monospace)' }}>
                  Taisidon{isHere ? ' · here' : ''}</text>
              )}
            </g>
          )
        })}
        {/* your province's outline last, so its neighbours don't paint over it */}
        {PROVINCE_SHAPES.filter(p => p.id === here).map(p => (
          <polygon key="here" points={p.points} fill="none" strokeLinejoin="round" pointerEvents="none"
            style={{ stroke: 'var(--map-current-color, #4caf50)', strokeWidth: 3 }} />
        ))}
      </svg>
      {elsewhere > 0 && (
        <button className={`map-btn${here === 'Other' ? ' map-btn--active' : ''}`}
          style={{ position: 'absolute', left: 10, bottom: 10 }}
          onMouseEnter={() => onHover('Other')} onClick={() => onOpen('Other')}
          title="Maps that belong to no province: events, mazes, transports and the like">
          Elsewhere · {elsewhere} map{elsewhere === 1 ? '' : 's'}{here === 'Other' ? ' · here' : ''}
        </button>
      )}
    </div>
  )
}

// ── Walking to "?" squares ───────────────────────────────────────────────────
// A route in progress, one per character. Module scope so it survives the view
// being closed and reopened (the walker and go2 keep going either way).
interface RouteRun {
  label:  string     // the target's name
  area:   string     // the map the route is on
  legs:   DaLeg[]
  i:      number     // the leg under way
  /** the walker's name for the leg under way: where that leg ends */
  legLabel: string
}
const routeRuns = new Map<string, RouteRun>()
/** game room number → the "?" square it was on, learnt while walking (per character, this session) */
const seenSquares = new Map<string, Map<number, { area: string; square: number }>>()
function seenFor(character: string) {
  let m = seenSquares.get(character)
  if (!m) { m = new Map(); seenSquares.set(character, m) }
  return m
}
/** how long go2 gets to reach the end of its leg */
const GO2_LEG_MS = 10 * 60_000

function DaMapsCanvas({ world: daWorld, lichDb, currentRoom, character, roomTitle, roomId, onSendCommand }: {
  world: DaWorld; lichDb: Map<number, LichRoom>; currentRoom?: LichRoom; character: string
  roomTitle: string; roomId?: number; onSendCommand: (cmd: string) => void
}) {
  // ── Areas ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'local' | 'global'>('local')
  const src = useMemo(() => getSource(daWorld, lichDb), [daWorld, lichDb])
  // Global opens on a map of the provinces (Kaesken); clicking one lists its
  // maps. A province's maps are laid out the first time it's opened, then cached.
  const [province, setProvince] = useState<string | null>(null)
  const world = useMemo(() => {
    if (mode !== 'global' || !province) return null
    let byProv = worldCache.get(src)
    if (!byProv) { byProv = new Map(); worldCache.set(src, byProv) }
    let w = byProv.get(province)
    if (!w) { w = buildWorld(src, province); byProv.set(province, w) }
    return w
  }, [mode, src, province])
  const [hoverArea, setHoverArea] = useState<string | null>(null)
  const [hoverProv, setHoverProv] = useState<string | null>(null)
  /** maps (ground floors with rooms) per province, for the province map */
  const provinceCounts = useMemo(() => {
    const c = new Map<string, number>()
    for (const k of src.globalKeys) {
      if (src.roomCount(k) === 0) continue
      const p = src.province(k)
      c.set(p, (c.get(p) ?? 0) + 1)
    }
    return c
  }, [src])
  function openProvince(p: string | null) {
    globalTfRef.current = null
    setHoverArea(null)
    setProvince(p)
  }

  const [areaImage, setAreaImage] = useState<string>('')
  // Where you are when Lich's map doesn't know the room: a "?" square.
  const [unmappedHere, setUnmappedHere] = useState<{ area: string; square: number } | null>(null)
  const hereImage = currentRoom ? src.areaOf(currentRoom.id, areaImage) : unmappedHere?.area ?? ''
  const [followPlayer, setFollowPlayer] = useState(true)
  const hereProvince = hereImage ? src.province(src.floors(hereImage)[0] ?? hereImage) : null
  const area = useMemo(() => src.area(areaImage), [src, areaImage])
  // The painted background for this map, if one has been made (map art).
  const [artByKey, setArtByKey] = useState<Map<string, DaArt> | null>(null)
  useEffect(() => { let live = true; loadDaArt().then(m => { if (live) setArtByKey(m) }); return () => { live = false } }, [])
  const art = area ? artByKey?.get(area.image) : undefined
  const hasArt = !!art
  useEffect(() => { if (!areaImage && hereImage) setAreaImage(hereImage) }, [areaImage, hereImage])
  // A different source (Genie maps just loaded) uses different area keys.
  useEffect(() => { setAreaImage(currentRoom ? src.areaOf(currentRoom.id) : '') }, [src]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera ─────────────────────────────────────────────────────────────────
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ sx: number; sy: number; tx: number; ty: number; moved: boolean } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const fitToView = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !area) return
    const W = svg.clientWidth, H = svg.clientHeight
    const bw = Math.max(1, area.bbox.x2 - area.bbox.x1), bh = Math.max(1, area.bbox.y2 - area.bbox.y1)
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min((W - 60) / bw, (H - 60) / bh)))
    setTransform({
      scale,
      x: W / 2 - ((area.bbox.x1 + area.bbox.x2) / 2) * scale,
      y: H / 2 - ((area.bbox.y1 + area.bbox.y2) / 2) * scale,
    })
  }, [area])

  /** Centre on a room. `scale` is a floor for the zoom, or the exact zoom with `exact`. */
  const centerOn = useCallback((room: DaRoom, minScale = 0, exact = false) => {
    const svg = svgRef.current
    if (!svg) return
    setTransform(t => {
      const scale = exact ? minScale : Math.max(t.scale, minScale)
      return { scale, x: svg.clientWidth / 2 - room.x * scale, y: svg.clientHeight / 2 - room.y * scale }
    })
  }, [])

  // Follow the player across areas; recentre when they move (only while following).
  const hereRoom = !area ? undefined
    : currentRoom ? area.byLich.get(currentRoom.id)
    : unmappedHere?.area === area.image ? area.byId.get(unmappedHere.square) : undefined
  useEffect(() => {
    if (followPlayer && hereImage && hereImage !== areaImage) setAreaImage(hereImage)
  }, [followPlayer, hereImage, areaImage])
  const fittedFor = useRef('')
  useEffect(() => {
    if (mode !== 'local' || !area || fittedFor.current === area.image) return
    const sameMap = !!fittedFor.current && mapOf(fittedFor.current) === mapOf(area.image)
    fittedFor.current = area.image
    // Another floor of the same map: the floors are drawn in the same place,
    // so keep the zoom and position (Kaesken: switching floors used to re-fit
    // each one and jump about). While following, just slide to keep you in view.
    if (sameMap) {
      if (followPlayer && hereRoom) centerOn(hereRoom)
      return
    }
    // A new map: centre on you at the opening zoom; if you're not on it, show it all.
    requestAnimationFrame(() => {
      if (followPlayer && hereRoom) centerOn(hereRoom, OPEN_SCALE, true)
      else fitToView()
    })
  }, [area, fitToView, followPlayer, hereRoom, centerOn, mode])
  useEffect(() => {
    if (mode === 'local' && followPlayer && hereRoom && fittedFor.current === area?.image) centerOn(hereRoom)
  }, [hereRoom?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Finding you on a "?" square ───────────────────────────────────────────
  // Lich's map has no entry for these rooms, so `currentRoom` is empty there.
  // In order: a room number we've seen on a square before, the square the
  // walk says you're on, then the room title among the "?" squares of the map
  // you were last on (a tie goes to the one next to where you were).
  const walkApi = useGenieWalk()
  const walkStatus = walkApi?.status ?? null
  const runRef = useRef<RouteRun | null>(routeRuns.get(character) ?? null)
  const [run, setRunState] = useState<RouteRun | null>(runRef.current)
  const setRun = useCallback((r: RouteRun | null) => {
    runRef.current = r
    if (r) routeRuns.set(character, r); else routeRuns.delete(character)
    setRunState(r ? { ...r } : null)
  }, [character])
  const lastPlaceRef = useRef<{ area: string; square: number } | null>(null)
  /** where a finished walk left you, by the game's room number there (it's
   *  read a moment after the walk ends, as the number can lag a frame) */
  const walkPinRef = useRef<{ roomId: number; place: { area: string; square: number } } | null>(null)
  const roomIdRef = useRef(roomId)
  roomIdRef.current = roomId
  const areaImageRef = useRef(areaImage)
  areaImageRef.current = areaImage
  useEffect(() => {
    if (currentRoom) {
      setUnmappedHere(null)
      const k = src.areaOf(currentRoom.id, areaImageRef.current)
      const sq = k ? src.area(k)?.byLich.get(currentRoom.id) : undefined
      if (sq) lastPlaceRef.current = { area: k, square: sq.id }
      return
    }
    const seen = seenFor(character)
    const place = (p: { area: string; square: number }) => {
      setUnmappedHere(p)
      lastPlaceRef.current = p
      // The room number can lag the walk by a frame, so it's remembered only
      // once the room's title agrees with the square's.
      const sq = src.area(p.area)?.byId.get(p.square)
      if (roomId != null && sq && normalizeMatchKey(sq.title) === normalizeMatchKey(roomTitle)) seen.set(roomId, p)
    }
    const known = roomId != null ? seen.get(roomId) ?? (walkPinRef.current?.roomId === roomId ? walkPinRef.current.place : undefined) : undefined
    if (known) { place(known); return }
    const r = runRef.current, leg = r?.legs[r.i]
    if (r && leg?.kind === 'walk' && walkStatus && walkStatus.label === r.legLabel) {
      const sq = leg.squares[Math.min(walkStatus.done, leg.squares.length - 1)]
      if (isUnmapped(src.area(r.area)?.byId.get(sq))) { place({ area: r.area, square: sq }); return }
    }
    const last = lastPlaceRef.current
    const key = last?.area ?? areaImageRef.current
    const a = key ? src.area(key) : null
    const hit = a && roomTitle ? locateUnmapped(a, roomTitle, last?.area === key ? last.square : null) : undefined
    if (hit && a) { place({ area: a.image, square: hit.id }); return }
    setUnmappedHere(null)
  }, [currentRoom, roomId, roomTitle, walkStatus?.done, src, character]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Running a route ────────────────────────────────────────────────────────
  // Each leg ends on a known square; reaching it starts the next leg.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  useEffect(() => () => clearTimers(), [])
  const endRun = useCallback((why?: string) => {
    clearTimers()
    const r = runRef.current
    setRun(null)
    if (why && r) showToast({ kind: 'warning', title: `Walk to ${r.label} stopped`, message: why })
  }, [setRun])
  const startLeg = useCallback((r: RouteRun, i: number) => {
    clearTimers()
    const leg = r.legs[i]
    const endSq = src.area(r.area)?.byId.get(legEnd(leg))
    // the walker names the end of ITS leg, so "Arrived at …" is true when it says it
    const legLabel = i === r.legs.length - 1 ? r.label : endSq?.title || r.label
    const next: RouteRun = { ...r, i, legLabel }
    setRun(next)
    const go = () => {
      if (runRef.current !== next) return
      if (leg.kind === 'go2') {
        onSendCommand(`;go2 ${leg.lich}`)
        timers.current.push(setTimeout(() => endRun("go2 didn't get there in 10 minutes."), GO2_LEG_MS))
        return
      }
      if (!walkApi) { endRun("walking isn't available here."); return }
      walkApi.start(leg.moves, legLabel, arrived => {
        if (runRef.current !== next) return
        // stopped part-way: the walker has said why in the game window
        if (!arrived) { endRun(); return }
        if (isUnmapped(endSq)) {
          const p = { area: r.area, square: legEnd(leg) }
          setUnmappedHere(p); lastPlaceRef.current = p
          // the room number can lag the last step by a frame
          setTimeout(() => {
            if (roomIdRef.current == null) return
            walkPinRef.current = { roomId: roomIdRef.current, place: p }
            seenFor(character).set(roomIdRef.current, p)
          }, 300)
        }
        nextLeg()
      })
    }
    // a short breath between legs, so the next one doesn't trip over the last
    if (i === 0) go(); else timers.current.push(setTimeout(go, 400))
  }, [setRun, endRun, onSendCommand, walkApi, src, character]) // eslint-disable-line react-hooks/exhaustive-deps
  const nextLegRef = useRef<() => void>(() => {})
  const nextLeg = () => nextLegRef.current()
  nextLegRef.current = () => {
    const r = runRef.current
    if (!r) return
    if (r.i + 1 >= r.legs.length) { clearTimers(); setRun(null); return }
    startLeg(r, r.i + 1)
  }
  // go2 leg: done when Lich says you're in its room
  useEffect(() => {
    const r = runRef.current, leg = r?.legs[r.i]
    if (leg?.kind === 'go2' && currentRoom?.id === leg.lich) nextLeg()
  }, [currentRoom?.id, run?.i]) // eslint-disable-line react-hooks/exhaustive-deps

  const cancelRun = useCallback(() => {
    const r = runRef.current, leg = r?.legs[r.i]
    if (leg?.kind === 'go2') onSendCommand(';kill go2')
    else walkApi?.stop()
    endRun()
  }, [onSendCommand, walkApi, endRun])

  /** Right-click: `;go2`, or a route when either end is a "?" square. */
  const goTo = (r: DaRoom) => {
    if (r.stubTo) { if (r.goTo != null) onSendCommand(`;go2 ${r.goTo}`); return }
    if (!area) return
    const plan = planDaRoute(area, hereRoom?.id ?? null, r.id)
    if (plan === null) { if (r.lich !== null) onSendCommand(`;go2 ${r.lich}`); return }
    const label = r.title || 'that room'
    if ('error' in plan) { showToast({ kind: 'warning', title: `Can't walk to ${label}`, message: plan.error[0].toUpperCase() + plan.error.slice(1) + '.' }); return }
    if (!walkApi) { showToast({ kind: 'warning', title: `Can't walk to ${label}`, message: 'Walking isn\'t available here.' }); return }
    if (runRef.current) cancelRun()
    startLeg({ label, area: area.image, legs: plan.legs, i: 0, legLabel: label }, 0)
  }
  const goToRef = useRef(goTo)
  goToRef.current = goTo

  // Switching views: Global remembers where you left it; on first open it
  // centres on the area you're in. Local re-fits its area when you come back.
  const globalTfRef = useRef<Transform | null>(null)
  const localTfRef = useRef<Transform | null>(null)
  function switchMode(next: 'local' | 'global') {
    if (next === mode) { if (next === 'global' && province) openProvince(null); return }
    if (mode === 'global') globalTfRef.current = transform
    else localTfRef.current = transform
    setMode(next)
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (mode === 'global' && world) {
      if (globalTfRef.current) { setTransform(globalTfRef.current); return }
      const W = svg.clientWidth || 800, H = svg.clientHeight || 600
      const here = hereImage ? world.byImage.get(hereImage) : undefined
      if (here) {
        const sc = 0.9
        setTransform({ scale: sc, x: W / 2 - (here.x + G_CELL / 2) * sc, y: H / 2 - (here.y + G_CELL / 2) * sc })
      } else {
        const sc = Math.max(MIN_SCALE, (W - 40) / world.w)
        setTransform({ scale: sc, x: (W - world.w * sc) / 2, y: 20 })
      }
    } else if (mode === 'local') {
      if (localTfRef.current && fittedFor.current === area?.image) setTransform(localTfRef.current)
    }
  }, [mode, world]) // eslint-disable-line react-hooks/exhaustive-deps

  function openArea(key: string) {
    // a marker may name a map's floor 0 when its ground floor is another level
    const image = src.area(key) ? key : (src.floors(key)[0] ?? key)
    setAreaImage(image)
    setFollowPlayer(image === hereImage)
    localTfRef.current = null
    fittedFor.current = ''        // from Global: frame it afresh, even another floor of the last map
    setMode('local')
  }

  // Wheel zoom around the cursor. Native listener so preventDefault works.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.001)
      setTransform(t => {
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor))
        const k = scale / t.scale
        return { scale, x: mx - (mx - t.x) * k, y: my - (my - t.y) * k }
      })
      setFollowPlayer(false)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: transform.x, ty: transform.y, moved: false }
  }
  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) { d.moved = true; setIsDragging(true); setFollowPlayer(false) }
    const { tx, ty } = d
    setTransform(t => ({ ...t, x: tx + dx, y: ty + dy }))
  }
  function endDrag() {
    // Let the click handler see `moved` first, then clear on the next tick.
    setTimeout(() => { dragRef.current = null }, 0)
    setIsDragging(false)
  }

  // ── Hover / pin / panel ────────────────────────────────────────────────────
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [hoverBuilding, setHoverBuilding] = useState<number | null>(null)
  const [pinnedId, setPinnedId] = useState<number | null>(null)
  const [showPanel, setShowPanel] = useState(true)
  const [tab, setTab] = useState<'legend' | 'room'>('room')
  useEffect(() => { setHoverId(null); setHoverBuilding(null); setPinnedId(null); setHoverArea(null) }, [areaImage, mode])

  // Every room is always drawn; indoor rooms sit inside a dotted building outline.
  const showIndoor = true

  // Observations (forage) — re-read when the capture records something.
  const [obs, setObs] = useState<DaObservations>(() => loadObservations())
  useEffect(() => {
    const h = () => setObs({ ...loadObservations() })
    document.addEventListener(DA_OBS_EVENT, h)
    return () => document.removeEventListener(DA_OBS_EVENT, h)
  }, [])

  // ── Drawing ────────────────────────────────────────────────────────────────
  const arcPaths = useMemo(() => {
    if (!area) return null
    const d: Record<DaArcCategory, string[]> = { cardinal: [], climb: [], go: [] }
    for (const arc of area.arcs) {
      const a = area.byId.get(arc.a)!, b = area.byId.get(arc.b)!
      if (!showIndoor && (a.indoor || b.indoor)) {
        // Zoomed out: keep only lines that touch the street, and end them at
        // the building outline's room, so doors still read as connections.
        if (a.indoor && b.indoor) continue
      }
      d[arc.cat].push(`M${a.x},${a.y}L${b.x},${b.y}`)
    }
    return (['cardinal', 'climb', 'go'] as DaArcCategory[]).map(cat => d[cat].length > 0 && (
      <path key={cat} d={d[cat].join('')} stroke={DA_ARC_COLOR[cat]} strokeWidth={1}
        fill="none" opacity={0.75} vectorEffect="non-scaling-stroke" pointerEvents="none" />
    ))
  }, [area, showIndoor])

  // No building outlines (Kaesken, 2026-11-21): the dotted boxes only caught
  // some of the indoor rooms, and indoor areas will be shown in the map art.
  // Building names still sit beside their rooms.

  const roomRects = useMemo(() => {
    if (!area) return null
    return area.rooms.filter(r => showIndoor || !r.indoor).map(r => {
      // The Genie map maker's colour wins; otherwise the Lich tags' category.
      const fill = r.fill ?? (r.category ? DA_CATEGORIES[r.category].color : undefined)
      const s = r.size
      return (
        <g key={r.id}>
          {hasArt && (
            // Over painted art a grey square can sink into grey stone, so it
            // gets a dark rim with a pale edge on top: it reads on light
            // pavement and dark roofs alike, and changes nothing without art.
            <rect x={r.x - s / 2} y={r.y - s / 2} width={s} height={s} fill="none"
              stroke="rgba(0,0,0,0.7)" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          )}
          <rect x={r.x - s / 2} y={r.y - s / 2} width={s} height={s}
            fill={fill ?? 'var(--map-node-fill, #2a2a2a)'}
            stroke={fill ? (hasArt ? 'rgba(255,255,255,0.45)' : 'none') : hasArt ? 'rgba(235,235,235,0.85)' : 'var(--map-node-stroke, #555)'}
            strokeWidth={1} vectorEffect="non-scaling-stroke"
            strokeDasharray={r.lich === null && !r.stubTo ? '1.5 1.5' : undefined}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => { if (!dragRef.current?.moved) { setHoverId(r.id); setHoverBuilding(null) } }}
            onClick={() => {
              if (dragRef.current?.moved) return
              if (r.stubTo) { openArea(r.stubTo); return }
              setPinnedId(p => (p === r.id ? null : r.id))
              setTab('room'); setShowPanel(true)
            }}
            onContextMenu={e => { e.preventDefault(); goToRef.current(r) }}
          />
          {r.stubTo && (
            <text x={r.x} y={r.y} fontSize={s + 2} fontWeight="bold" fill="var(--map-arc-special, #ffb74d)"
              textAnchor="middle" dominantBaseline="central" pointerEvents="none">↗</text>
          )}
          {r.lich === null && !r.stubTo && (
            // not in Lich's map yet: a "?" so mappers can spot it
            <text x={r.x} y={r.y + 0.3} fontSize={s} fontWeight="bold" fill={fill ? inkOn(fill) : 'var(--map-text, #ddd)'}
              textAnchor="middle" dominantBaseline="central" pointerEvents="none">?</text>
          )}
        </g>
      )
    })
  }, [area, showIndoor, hasArt, src]) // eslint-disable-line react-hooks/exhaustive-deps

  const labels = useMemo(() => {
    if (!area) return null
    const roomLabels = area.rooms.filter(r => r.label && (showIndoor || !r.indoor)).map(r => (
      <text key={`r${r.id}`} x={r.lx} y={r.ly} fontSize={LABEL_FONT}
        textLength={r.label.length * CHAR_W} lengthAdjust="spacingAndGlyphs" fontStyle="italic"
        fill="var(--map-text-muted, #999)" pointerEvents="none"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.label}</text>
    ))
    // Genie maps: the place names their makers set down.
    const texts = (area.texts ?? []).map((t, i) => (
      <text key={`t${i}`} x={t.x + 1} y={t.y + 1} fontSize={LABEL_FONT} fontStyle="italic"
        dominantBaseline="text-before-edge" fill="var(--map-text-muted, #999)" pointerEvents="none"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}>{t.text}</text>
    ))
    return [...texts, ...roomLabels, ...area.buildings
      .filter(b => b.name && b.showLabel)
      .map((b, i) => (
        <text key={`l${i}`} x={b.lx} y={b.ly} fontSize={LABEL_FONT}
          textLength={b.name.length * CHAR_W} lengthAdjust="spacingAndGlyphs" fontStyle="italic"
          fill="var(--map-text-muted, #999)" pointerEvents="none"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}>{b.name}</text>
      ))]
  }, [area, showIndoor])

  // Route preview, as in Genie Maps: the shortest walk along the drawn lines
  // from your square to the one under the pointer (green), or to the pinned
  // one (gold). Only inside the map you're on.
  const neighbours = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const a of area?.arcs ?? []) {
      if (!m.has(a.a)) m.set(a.a, [])
      if (!m.has(a.b)) m.set(a.b, [])
      m.get(a.a)!.push(a.b); m.get(a.b)!.push(a.a)
    }
    return m
  }, [area])
  const routeTo = useCallback((to: number | null): string => {
    if (!area || !hereRoom || to === null || to === hereRoom.id) return ''
    const prev = new Map<number, number>([[hereRoom.id, hereRoom.id]])
    const queue = [hereRoom.id]
    for (let i = 0; i < queue.length && !prev.has(to); i++) {
      for (const n of neighbours.get(queue[i]) ?? []) if (!prev.has(n)) { prev.set(n, queue[i]); queue.push(n) }
    }
    if (!prev.has(to)) return ''
    let d = ''
    for (let id = to; id !== hereRoom.id; id = prev.get(id)!) {
      const a = area.byId.get(id)!, b = area.byId.get(prev.get(id)!)!
      d += `M${a.x},${a.y}L${b.x},${b.y}`
    }
    return d
  }, [area, hereRoom, neighbours])
  const hoverRoute = useMemo(() => routeTo(hoverId), [routeTo, hoverId])
  const pinnedRoute = useMemo(() => routeTo(pinnedId), [routeTo, pinnedId])
  const routePath = (d: string, stroke: string) => d && (
    <path d={d} stroke={stroke} strokeWidth={2.5} fill="none" opacity={0.85}
      vectorEffect="non-scaling-stroke" pointerEvents="none" strokeLinecap="round" strokeLinejoin="round" />
  )

  const highlight = (id: number | null, stroke: string) => {
    if (!area || id === null) return null
    const r = area.byId.get(id)
    if (!r || (!showIndoor && r.indoor)) return null
    const s = r.size + 4
    return <rect x={r.x - s / 2} y={r.y - s / 2} width={s} height={s} fill="none" stroke={stroke}
      strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
  }

  // ── Global view: every area as a thumbnail of all its rooms ──────────────
  const globalLayer = useMemo(() => {
    if (!world) return null
    return (
      <>
        {world.heads.map(h => (
          <text key={h.name} x={0} y={h.y} fontSize={30} fontStyle="italic" fill="var(--map-text, #ccc)"
            pointerEvents="none" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{h.name}</text>
        ))}
        {world.areas.map(wa => {
          const byFill = new Map<string, string[]>()
          for (const r of wa.area.rooms) {
            const fill = r.fill ?? (r.category ? DA_CATEGORIES[r.category].color : 'var(--map-node-stroke, #555)')
            const sz = Math.max(r.size, 2 / wa.s)
            if (!byFill.has(fill)) byFill.set(fill, [])
            byFill.get(fill)!.push(`M${r.x - sz / 2},${r.y - sz / 2}h${sz}v${sz}h${-sz}z`)
          }
          const arcs = wa.area.arcs.map(a => {
            const p = wa.area.byId.get(a.a)!, q = wa.area.byId.get(a.b)!
            return `M${p.x},${p.y}L${q.x},${q.y}`
          }).join('')
          return (
            <g key={wa.image}>
              <rect x={wa.x + 4} y={wa.y + 4} width={G_CELL - 8} height={G_CELL - 8} rx={6}
                fill="var(--map-node-fill, #222)" fillOpacity={0.35}
                stroke="var(--map-border, #444)" strokeWidth={1} vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => { if (!dragRef.current?.moved) setHoverArea(wa.image) }}
                onClick={() => { if (!dragRef.current?.moved) openArea(wa.image) }} />
              <g transform={`translate(${wa.ox} ${wa.oy}) scale(${wa.s})`} pointerEvents="none">
                <path d={arcs} stroke="var(--map-arc-cardinal, #666)" strokeWidth={1} fill="none"
                  vectorEffect="non-scaling-stroke" opacity={0.7} />
                {[...byFill].map(([fill, d]) => <path key={fill} d={d.join('')} fill={fill} />)}
              </g>
              <text x={wa.x + G_CELL / 2} y={wa.y + G_CELL - 12} fontSize={13} textAnchor="middle"
                fill="var(--map-text-muted, #999)" pointerEvents="none"
                style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                {(n => n.length > 30 ? n.slice(0, 29) + '…' : n)(shortAreaName(wa.name))}
              </text>
            </g>
          )
        })}
      </>
    )
  }, [world]) // eslint-disable-line react-hooks/exhaustive-deps

  const globalHere = (() => {
    if (!world || !hereImage) return null
    const wa = world.byImage.get(hereImage)
    const r = currentRoom ? wa?.area.byLich.get(currentRoom.id) : unmappedHere ? wa?.area.byId.get(unmappedHere.square) : undefined
    if (!wa || !r) return null
    const cx = wa.ox + r.x * wa.s, cy = wa.oy + r.y * wa.s
    return (
      <g pointerEvents="none">
        <rect x={wa.x + 4} y={wa.y + 4} width={G_CELL - 8} height={G_CELL - 8} rx={6} fill="none"
          stroke="var(--map-current-color, #4caf50)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <HerePing x={cx} y={cy} size={Math.max(6, DA_ROOM_SIZE * wa.s)} />
      </g>
    )
  })()
  const globalHover = (() => {
    if (!world || !hoverArea) return null
    const wa = world.byImage.get(hoverArea)
    if (!wa) return null
    return <rect x={wa.x + 4} y={wa.y + 4} width={G_CELL - 8} height={G_CELL - 8} rx={6} fill="none"
      stroke="var(--map-text, #eee)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
  })()
  const hoveredWorldArea = world && hoverArea ? world.byImage.get(hoverArea) : undefined

  const hereIndicator = hereRoom && (
    <g pointerEvents="none">
      {!showIndoor && hereRoom.indoor && hereRoom.building !== null && (() => {
        const b = area!.buildings[hereRoom.building!]
        return <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1} fill="none"
          stroke="var(--map-current-color, #4caf50)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      })()}
      <HerePing x={hereRoom.x} y={hereRoom.y} size={hereRoom.size} />
    </g>
  )

  // ── Side panel content ─────────────────────────────────────────────────────
  const shownId = pinnedId ?? hoverId ?? (hereRoom ? hereRoom.id : null)
  const shownRoom = area && shownId !== null ? area.byId.get(shownId) : undefined
  const shownSource = pinnedId !== null ? 'pinned' : hoverId !== null ? 'hovered' : 'your room'
  const shownBuilding = hoverBuilding !== null && pinnedId === null && area ? area.buildings[hoverBuilding] : undefined

  // Legend: the map's own room colours (the community colour meanings), then
  // the Lich-tag categories that colour a square the map left plain.
  const legendColors = useMemo(() => {
    const fills = new Set((area?.rooms ?? []).map(r => r.fill?.toUpperCase()).filter(Boolean))
    const cats = new Set((area?.rooms ?? []).filter(r => !r.fill).map(r => r.category).filter((c): c is string => !!c))
    return [
      ...Object.entries(COLOR_LEGEND)
        .filter(([hex]) => mode === 'global' || fills.has(hex))
        .map(([hex, c]) => ({ key: hex, color: hex, name: c.name, desc: c.desc })),
      ...Object.keys(DA_CATEGORIES).filter(k => mode !== 'global' && cats.has(k))
        .map(k => ({ key: k, color: DA_CATEGORIES[k].color, name: DA_CATEGORIES[k].name, desc: DA_CATEGORIES[k].desc })),
    ]
  }, [area, mode])
  const presentArcs = useMemo(() => {
    if (!area) return []
    const s = new Set(area.arcs.map(a => a.cat))
    return (['cardinal', 'go', 'climb'] as DaArcCategory[]).filter(c => s.has(c))
  }, [area])

  function roomDetails(r: DaRoom) {
    if (r.stubTo) {
      const to = src.area(r.stubTo)
      return (
        <>
          {r.title && r.title !== to?.name && <div style={muted}>{r.title}</div>}
          <div style={{ fontWeight: 'bold' }}>{to?.name ?? 'Another map'}</div>
          {r.goTo != null && <div style={muted}>Lich #{r.goTo}</div>}
          <div style={{ ...muted, marginTop: 6, fontStyle: 'italic' }}>
            Click to open that map{r.goTo != null ? ' · Right-click: go2 there' : ''}
          </div>
        </>
      )
    }
    if (r.lich === null) {
      return (
        <>
          <div style={{ fontWeight: 'bold' }}>{r.title || '(unnamed room)'}</div>
          <div style={{ ...muted, marginTop: 6 }}>
            Not in Lich's map yet. Right-click to walk there: go2 takes you as far as it can, then Lichborne walks the rest.
          </div>
        </>
      )
    }
    const found = obs.forage[r.lich] ?? {}
    const foundItems = Object.entries(found).sort((a, b) => b[1].n - a[1].n)
    const lichForage = r.forage.filter(f => !found[f.toLowerCase()])
    return (
      <>
        <div style={{ ...muted, fontSize: '0.91em' }}>{shownSource}</div>
        <div style={{ fontWeight: 'bold', marginTop: 2 }}>{r.title || '(unnamed room)'}</div>
        <div style={{ ...muted, fontSize: '0.91em' }}>
          Lich #{r.lich} · {r.indoor ? 'indoor' : 'outdoor'}{r.location ? ` · ${r.location}` : ''}
        </div>

        <div style={sectionHead}>Forage</div>
        {foundItems.length === 0 && lichForage.length === 0 && <div style={muted}>Nothing known yet</div>}
        {foundItems.map(([item, f]) => (
          <div key={item}>· {item} <span style={muted}>(found {f.n}×)</span></div>
        ))}
        {lichForage.map(item => <div key={item}>· {item}</div>)}

        {r.hunting.length > 0 && (
          <>
            <div style={sectionHead}>Hunting</div>
            {r.hunting.map(h => <div key={h}>· {h}</div>)}
          </>
        )}
        {r.services.length > 0 && (
          <>
            <div style={sectionHead}>Here</div>
            <div>{r.services.join(', ')}</div>
          </>
        )}
        <div style={sectionHead}>Exits</div>
        <div style={muted}>{r.exits.filter(e => !e.startsWith(';')).join(', ') || '—'}</div>
        <div style={{ ...muted, marginTop: 8, fontStyle: 'italic' }}>
          Right-click: go2 here · Left-click: pin
        </div>
      </>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const unplaced = currentRoom && !hereImage

  return (
    <div className="map-canvas-wrap" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="map-toolbar" style={{ flexShrink: 0 }}>
        <button className={`map-btn map-btn--sm${mode === 'local' ? ' map-btn--active' : ''}`}
          onClick={() => switchMode('local')} title="Local — the area you're in (or the one you opened from Global)">Local</button>
        <button className={`map-btn map-btn--sm${mode === 'global' ? ' map-btn--active' : ''}`}
          onClick={() => switchMode('global')} title="Global — a map of the provinces. Click one to list its maps.">Global</button>
        {mode === 'global' && province && (
          <button className="map-btn map-btn--sm" onClick={() => openProvince(null)}
            title="Back to the map of the provinces">◂ Provinces</button>
        )}
        <span className="map-toolbar-location">
          {mode === 'global'
            ? (province === 'Other' ? 'Elsewhere' : province ?? 'Provinces')
            : area ? `${area.name}${hereRoom ? ' · 📍 here' : ''}` : ''}
        </span>
      </div>

      <div className="map-subbar" style={{ flexShrink: 0 }}>
        <button className={`map-btn${followPlayer && hereImage ? ' map-btn--active' : ''}`}
          disabled={!hereImage}
          title={hereImage ? 'Take me to my current room (enables follow)' : 'Your current room has no Da\'Maps position'}
          onClick={() => {
            setFollowPlayer(true)
            if (mode === 'global') { localTfRef.current = null; setMode('local') }
            if (hereImage !== areaImage) setAreaImage(hereImage)
            else if (hereRoom) centerOn(hereRoom, INDOOR_SCALE)
          }}>◆</button>
        <button className="map-btn" disabled={mode === 'global' && !province}
          title={mode === 'global' ? 'Fit all of this province\'s maps to view' : 'Fit area to view'}
          onClick={() => {
            setFollowPlayer(false)
            if (mode === 'global' && world && svgRef.current) {
              const W = svgRef.current.clientWidth, H = svgRef.current.clientHeight
              const sc = Math.max(MIN_SCALE, Math.min((W - 40) / world.w, (H - 40) / world.h))
              setTransform({ scale: sc, x: (W - world.w * sc) / 2, y: 20 })
            } else fitToView()
          }}>⊡</button>
        <button className={`map-btn${showPanel ? ' map-btn--active' : ''}`} onClick={() => setShowPanel(s => !s)}
          title={showPanel ? 'Hide the side panel' : 'Show the side panel (legend and room details)'}>▤</button>
        {mode === 'local' && area && src.floors(area.image).length > 1 && (
          <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6, alignItems: 'center' }} title="This map has more than one floor">
            <span style={muted}>Floor</span>
            {src.floors(area.image).map(k => {
              const lv = Number(/@(-?\d+)$/.exec(k)?.[1] ?? 0)
              return (
                <button key={k} className={`map-btn map-btn--sm${k === area.image ? ' map-btn--active' : ''}`}
                  onClick={() => { setAreaImage(k); setFollowPlayer(k === hereImage) }}>
                  {lv === 0 ? 'Ground' : lv > 0 ? `+${lv}` : lv}
                </button>
              )
            })}
          </span>
        )}
        <span style={{ flex: 1 }} />
      </div>

      {unplaced && (
        <div className="map-hint" style={{ padding: '3px 8px', color: 'var(--map-arc-special, #ffb74d)', flexShrink: 0 }}>
          ⚑ Your room ({lichTitle(currentRoom!)}, Lich #{currentRoom!.id}) isn't on {DA_MAPS_NAME} yet
        </div>
      )}

      {run && (() => {
        const leg = run.legs[run.i]
        const what = leg.kind === 'go2'
          ? `go2 to ${src.area(run.area)?.byId.get(leg.to)?.title ?? `Lich #${leg.lich}`}`
          : `walking ${leg.moves.length} step${leg.moves.length === 1 ? '' : 's'}`
        return (
          <div className="map-hint" style={{ padding: '3px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}
            title={'A "?" room isn\'t in Lich\'s map, so go2 does what it can and Lichborne walks the rest.'}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Walking to {run.label}: {what}{run.legs.length > 1 ? ` (part ${run.i + 1} of ${run.legs.length})` : ''}
            </span>
            <button className="map-btn map-btn--sm" onClick={cancelRun} title="Stop this walk">Stop</button>
          </div>
        )
      })()}

      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {mode === 'local' && !area && (
          <div className="map-overlay" style={{ pointerEvents: 'none' }}>
            <div className="map-empty">
              <div className="map-empty-icon">🗺</div>
              <div className="map-empty-msg">Waiting for your room</div>
              <div className="map-empty-sub">Move or LOOK in game, or open Global to pick an area.</div>
            </div>
          </div>
        )}
        <svg ref={svgRef}
          style={{ width: '100%', height: '100%', background: 'var(--map-bg, #111)', cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag}
          onMouseLeave={endDrag}  // hover is sticky: the panel keeps the last room while you read it
          onContextMenu={e => e.preventDefault()}>
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {mode === 'global' ? (
              <>
                {globalLayer}
                {globalHover}
                {globalHere}
              </>
            ) : (
              <>
                {art && (
                  <image href={'./damaps-art/' + art.file.split('/').map(encodeURIComponent).join('/')}
                    x={art.x} y={art.y} width={art.width / art.scale} height={art.height / art.scale}
                    preserveAspectRatio="none" pointerEvents="none" />
                )}
                {arcPaths}
                {labels}
                {roomRects}
                {routePath(pinnedRoute, 'var(--accent, gold)')}
                {routePath(hoverRoute, 'var(--map-current-color, #4caf50)')}
                {highlight(pinnedId, 'var(--map-select-color, #e0a050)')}
                {highlight(hoverId, 'var(--map-text, #eee)')}
                {hereIndicator}
              </>
            )}
          </g>
        </svg>

        {mode === 'global' && !province && (
          <ProvinceMap counts={provinceCounts} here={hereProvince} hover={hoverProv}
            onHover={setHoverProv} onOpen={openProvince} rightInset={showPanel ? PANEL_W + 16 : 0} />
        )}

        {showPanel && (mode === 'global' || area) && (
          <div style={{
            position: 'absolute', top: 8, right: 8, bottom: 8, width: PANEL_W, maxWidth: '45%',
            display: 'flex', flexDirection: 'column',
            background: 'var(--map-chrome-bg, rgba(20, 20, 22, 0.95))',
            border: '1px solid var(--map-border, #555)', borderRadius: 4,
            fontSize: PANEL_FONT, color: 'var(--map-text, #ddd)', zIndex: 5,
          }}>
            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '6px 9px', lineHeight: 1.4 }}>
              {tab === 'legend' && (
                <>
                  {legendColors.length > 0 && <div style={{ ...sectionHead, marginTop: 0 }}>Room colors</div>}
                  {legendColors.map(c => {
                    return (
                      <div key={c.key} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                        <span style={{ flexShrink: 0, width: 10, height: 10, background: c.color, alignSelf: 'center',
                          border: '1px solid var(--map-border, #555)' }} />
                        <span><b>{c.name}</b><span style={muted}> — {c.desc}</span></span>
                      </div>
                    )
                  })}
                  {presentArcs.length > 0 && <div style={sectionHead}>Arc types</div>}
                  {presentArcs.map(cat => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                      <svg width={14} height={10} style={{ flexShrink: 0, alignSelf: 'center' }}>
                        <line x1={1} y1={5} x2={13} y2={5} stroke={DA_ARC_COLOR[cat]} strokeWidth={1.5} />
                      </svg>
                      <span><b>{cat === 'cardinal' ? 'Cardinal' : cat === 'climb' ? 'Climb' : 'Go / Door / Up / Down'}</b>
                        <span style={muted}>{cat === 'cardinal' ? ' — north/south/east/west/etc.' : cat === 'climb' ? ' — ladders, stairs, climb exits' : ' — doors, portals, swim, scripted moves'}</span></span>
                    </div>
                  ))}
                  <div style={sectionHead}>Other</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                    <svg width={14} height={14} style={{ flexShrink: 0, alignSelf: 'center' }}>
                      <rect x={1} y={1} width={12} height={12} rx={2} fill="none" stroke="var(--map-node-stroke, #555)" strokeDasharray="3 2" />
                    </svg>
                    <span style={muted}>Building (indoor rooms)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                    <svg width={14} height={14} style={{ flexShrink: 0, alignSelf: 'center' }}>
                      <rect x={1} y={1} width={12} height={12} fill="var(--map-node-fill, #2a2a2a)" stroke="var(--map-node-stroke, #555)" strokeDasharray="1.5 1.5" />
                      <text x={7} y={7.5} fontSize={10} fontWeight="bold" fill="var(--map-text, #ddd)" textAnchor="middle" dominantBaseline="central">?</text>
                    </svg>
                    <span style={muted}>Not in Lich's map yet (go2 gets you close, Lichborne walks the rest)</span>
                  </div>
                  <div style={{ ...muted, marginTop: 8 }}>Right-click any room to <code>;go2</code> there. A "?" room is walked: go2 does the part Lich knows, then Lichborne takes the steps go2 can't.</div>
                </>
              )}
              {tab === 'room' && mode === 'global' && !province && (
                hoverProv ? (
                  <>
                    <div style={{ ...muted, fontSize: '0.91em' }}>hovered province</div>
                    <div style={{ fontWeight: 'bold', marginTop: 2 }}>{hoverProv === 'Other' ? 'Elsewhere' : hoverProv}</div>
                    <div style={muted}>{provinceCounts.get(hoverProv) ?? 0} maps{hoverProv === hereProvince ? ' · you are here' : ''}</div>
                    <div style={{ ...muted, marginTop: 8, fontStyle: 'italic' }}>Click to list its maps</div>
                  </>
                ) : (
                  <div style={muted}>Hover a province to see what's in it. Click one to list its maps.</div>
                )
              )}
              {tab === 'room' && mode === 'global' && province && (
                hoveredWorldArea ? (
                  <>
                    <div style={{ ...muted, fontSize: '0.91em' }}>hovered area</div>
                    <div style={{ fontWeight: 'bold', marginTop: 2 }}>{hoveredWorldArea.name}</div>
                    <div style={muted}>{hoveredWorldArea.province} · {hoveredWorldArea.rooms} rooms</div>
                    <div style={{ ...muted, marginTop: 8, fontStyle: 'italic' }}>Click to open it in Local</div>
                  </>
                ) : (
                  <div style={muted}>Hover an area to see what it is. Click one to open it.</div>
                )
              )}
              {tab === 'room' && mode === 'local' && (
                shownBuilding ? (
                  <>
                    <div style={{ ...muted, fontSize: '0.91em' }}>hovered building</div>
                    <div style={{ fontWeight: 'bold', marginTop: 2 }}>{shownBuilding.name || 'Building'}</div>
                    <div style={muted}>{shownBuilding.rooms.length} indoor room{shownBuilding.rooms.length === 1 ? '' : 's'} — zoom in to see them.</div>
                    <div style={{ ...muted, marginTop: 8, fontStyle: 'italic' }}>Right-click: go2 to its entrance</div>
                  </>
                ) : shownRoom ? roomDetails(shownRoom) : (
                  <div style={muted}>Hover a room to see its forage.</div>
                )
              )}
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--map-border, #555)', flexShrink: 0 }}>
              {(['legend', 'room'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
                  style={{
                    flex: 1, padding: '5px 4px', cursor: 'pointer', fontSize: PANEL_FONT,
                    background: tab === t ? 'var(--map-btn-bg, #222)' : 'transparent',
                    color: tab === t ? 'var(--map-select-color, #e0a050)' : 'var(--map-text-muted, #888)',
                    border: 'none', borderTop: tab === t ? '2px solid var(--map-select-color, #e0a050)' : '2px solid transparent',
                  }}>{t === 'legend' ? 'Map legend' : 'Room'}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, padding: '4px 8px', fontSize: 11, color: 'var(--map-text-muted, #888)',
        borderTop: '1px solid var(--map-border-subtle, #333)' }}>
        {DA_MAPS_NAME}{mode === 'global'
          ? (world ? ` · ${province === 'Other' ? 'Elsewhere' : province} · ${world.areas.length} maps · ${world.areas.reduce((n, a) => n + a.rooms, 0)} rooms`
            : ` · ${[...provinceCounts.values()].reduce((n, c) => n + c, 0)} maps in ${provinceCounts.size} provinces`)
          : (area ? ` · ${area.name} · ${area.rooms.length} rooms` : '')}
      </div>
    </div>
  )
}
