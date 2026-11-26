// Map panel — the per-character host for BOTH map views: 'image' (Lich Map,
// MapImageView) and 'genie' (Genie Maps, GenieMapView), switched by the
// toolbar and persisted under `scopedKey('mapViewMode')` (legacy 'graph' /
// 'lich-graph' selections migrate to 'genie'). Receives this GameWindow's live
// room signals (`roomTitle` / `roomDesc` / `roomExits` / `roomId`) and owns the
// DATA both views consume.
//
// Lich side: loads Lich's `map-*.json` and builds the indexes — `lichDb` by
// Lich `id`, `uidIndex` by the GAME uid (a different number space — Lich 5.20
// review), exact + normalized title indexes, and `imageIndex` by tile. The
// current room resolves uid → Lich id → `findRoom` title+description (both id
// spaces are tried because the subtitle slot is ambiguous); a no-match is
// debounced 400ms so the NEEDS-MAPPING banner can't flash mid-move (B109), and
// the DB reloads only on a real `lichMapVersion` CHANGE after mount (B174).
// Genie side: loads every zone XML from the shared `lichborne.genieMapsDir`
// progressively (generation-counted so a stale load aborts), through main's
// fingerprinted parse cache first, disambiguating duplicate zone ids the way
// Frostbite's mapreader does. `geniePersistRef` keeps the Genie view's zone +
// resolver breadcrumb alive across a view switch — one ref per instance, never
// module scope (pitfall #6). `memo`'d (B172): props are room primitives +
// stable callbacks, so it renders on room change, not every GameWindow render.
import { memo, useState, useRef, useEffect, useCallback, Component, type ReactNode } from 'react'
import type { LichRoom, GenieZone } from './mapTypes'
import { findRoom, parseGenieZone, lichTitle, normalizeMatchKey } from './mapTypes'
import { scheduleSharedProfileSave } from '../../profile'
import { scopedKey } from '../../characterScope'
import { useCharacter } from '../../CharacterContext'
import { useProfileSaver } from '../../hooks/useProfileSaver'
import MapImageView from './MapImageView'
import GenieMapView, { type GenieMatch } from './GenieMapView'
import DaMapsView from './DaMapsView'
import { DA_MAPS_NAME, daMapsSetRoom } from './damaps/daMapsData'
import GraphMapView, { type GraphData } from './GraphMapView'
import { buildGraphBridgeAsync } from '../../graphBridge'
import { buildGraphWorldAsync } from '../../graphWorld'
import { buildAtlasAsync, type Atlas } from '../../graphAtlas'
import type { GameFamily, GenieMapsProgress, GenieMapsStatus, MapDataFile } from '../../../shared/types'
import { showToast } from '../../toasts'
import { IS_WINDOWS } from '../../lichSettings'
import { useSessionLichPath } from '../../sessionLich'
import LichSetupDialog from '../LichSetupDialog'
import '../../styles/map-panel.css'

interface Props {
  roomTitle?: string
  roomDesc?:  string
  roomExits?: string[]   // live compass tokens ('e','nw',…) — Genie matcher exit-set discriminator
  roomId?:    number
  lichMapVersion?: number
  onSendCommand: (cmd: string) => void
  large?: boolean
  mapAnimations?: boolean   // Settings → Genie Map Animations; gates the per-room effects (the camera never glides, v0.20.5)
  // GS4 support: Lich Map works for both families (Lich saves per-game map
  // data — see findLichMapFile's comment in main.ts) but there is no GS4
  // Genie map data, so the Genie Maps view is gated off and 'image' is
  // forced regardless of a saved preference (e.g. one copied in via Profile
  // Transfer from a DR character). Undefined behaves like 'DR' (every
  // pre-GS4 call site).
  gameFamily?: GameFamily
}

const GENIE_DIR_KEY  = 'lichborne.genieMapsDir'
const GENIE_DIR_EVENT = 'lichborne:genie-maps-dir'

// ── Shared parse caches — module scope, DELIBERATELY (v0.19.9) ───────────────
//
// Both datasets below describe the WORLD, not a character: Lich's map database
// and the parsed Genie zones are identical for everyone. They were nonetheless
// parsed into per-COMPONENT state, so every mounted MapPanel held its own full
// copy — and MapPanel is per-character AND has two mount sites (the panel tab,
// `PanelFrame`, and the Maps overlay in GameWindow). Measured on a real
// install: 14.7 MB of Lich map JSON (~52k rooms) plus a 12.3 MB Genie cache,
// so a four-character session with maps showing could hold eight copies of
// ~27 MB of source before counting the 2–4× JSON→heap expansion.
//
// Caching here is safe precisely because the parsed values are IMMUTABLE and
// global. Everything per-character stays component state — `currentRoom`, the
// Genie breadcrumb (`geniePersistRef`, whose own comment rightly forbids
// hoisting it), zoom, view mode. That split is what keeps pitfall #6's
// per-session isolation intact: we share the world, never the session.
//
// Each cache keys on its SOURCE PATH, so a new map file (repository.lic
// downloads timestamped `map-<n>.json`) misses naturally. The in-flight
// promise is the other half: two panels mounting in the same frame — which is
// exactly what happens when you connect a second character, or open the Maps
// overlay over an existing panel — would otherwise both parse. Rejections are
// never cached; only a completed parse is stored.

type LichDbBundle = {
  db:    Map<number, LichRoom>
  byUid: Map<number, LichRoom>
  ti:    Map<string, LichRoom[]>
  tn:    Map<string, LichRoom[]>
  ii:    Map<string, LichRoom[]>
}

// One entry per map FILE PATH, not one for the whole app (v1.1.0): a DR and a
// GemStone character read different files (and a character can run from its
// own Lich install, DESIGN §56.7.1). With a single slot each load evicted the
// other's, so opening one character's map re-parsed the whole file whenever the
// other game's map had loaded since. Storing a file drops the other files in
// its folder (Lich's older `map-<n>.json`), so the cache holds one map per
// folder in use and never grows with Lich's downloads.
const lichDbCaches = new Map<string, { key: string; data: LichDbBundle }>()
let lichDbInflight: { key: string; p: Promise<LichDbBundle> } | null = null
const fileDir = (p: string) => p.replace(/[\\/][^\\/]*$/, '')

/** The cached map for this exact file version, if any. */
function lichDbCached(key: string): LichDbBundle | undefined {
  const e = lichDbCaches.get(key.slice(0, key.lastIndexOf('|')))
  return e?.key === key ? e.data : undefined
}

// Told to every MapPanel in this window when a NEW copy of shared map data
// lands (a parse, not a cache hit), so a panel still holding the old copy
// takes the new one. Without it, a ↺ in one character's map, or a change one
// panel noticed first, left the other characters on the old maps and kept two
// copies in memory.
const MAP_DATA_EVENT = 'lichborne:map-data-loaded'
const announceMapData = () => setTimeout(() => window.dispatchEvent(new Event(MAP_DATA_EVENT)), 0)

/** Parse Lich's map JSON into the five lookup structures, once per file path
 *  AND version (`stamp` = time and size, from main): a rewritten file at the
 *  same path is a new key, an unchanged one is served from memory (v1.1.0). */
function loadLichBundle(jsonPath: string, force: boolean, stamp = ''): Promise<LichDbBundle> {
  const key = `${jsonPath}|${stamp}`
  if (force) {
    if (lichDbCaches.get(jsonPath)?.key === key) lichDbCaches.delete(jsonPath)
    if (lichDbInflight?.key === key) lichDbInflight = null
  }
  const hit = lichDbCached(key)
  if (hit) return Promise.resolve(hit)
  if (lichDbInflight?.key === key) return lichDbInflight.p

  const p = (async (): Promise<LichDbBundle> => {
    const raw = await window.api.readFile(jsonPath)
    if (!raw) throw new Error('Could not read map file')
    const rooms: LichRoom[] = JSON.parse(raw)
    const db    = new Map<number, LichRoom>()
    // SECOND index, keyed by the GAME uid (Lich 5.20 review).
    //
    // `r.id` is LICH's own room id; `r.uid` is the game's. They are different
    // number spaces — in a real DR map, ids run 1–52274 while uids run up to
    // 9.8 million, and only 471 of 15,521 uids collide with any id. The
    // `roomId` we look up with comes from `<nav rm>` and the subtitle marker,
    // which Lich's own code calls "the authoritative room UID" — i.e. the GAME
    // id. So an id-only index missed ~97% of lookups and fell through to the
    // fragile title+desc match every time, which is the "map lost me" symptom.
    //
    // This is not a 5.20 regression; 5.20 is what makes it FIXABLE. DR now
    // emits `<nav rm>` on EVERY arrival, so the uid is reliably present rather
    // than only when the player had the game's ShowRoomID flag on.
    const byUid = new Map<number, LichRoom>()
    const ti    = new Map<string, LichRoom[]>()
    const tn    = new Map<string, LichRoom[]>()
    const ii    = new Map<string, LichRoom[]>()
    for (const r of rooms) {
      if (typeof r?.id !== 'number') continue
      db.set(r.id, r)
      // A room can carry several uids (merged/aliased rooms), so index each.
      if (Array.isArray(r.uid)) {
        for (const u of r.uid) if (typeof u === 'number' && u > 0) byUid.set(u, r)
      }
      const t = lichTitle(r)
      if (t) {
        if (!ti.has(t)) ti.set(t, []); ti.get(t)!.push(r)
        const k = normalizeMatchKey(t)
        if (k) { if (!tn.has(k)) tn.set(k, []); tn.get(k)!.push(r) }
      }
      if (r.image) { if (!ii.has(r.image)) ii.set(r.image, []); ii.get(r.image)!.push(r) }
    }
    const data = { db, byUid, ti, tn, ii }
    const dir = fileDir(jsonPath)
    for (const p of [...lichDbCaches.keys()]) if (p !== jsonPath && fileDir(p) === dir) lichDbCaches.delete(p)
    lichDbCaches.set(jsonPath, { key, data })
    announceMapData()
    return data
  })()

  lichDbInflight = { key, p }
  // Drop the in-flight entry either way; a rejection must not be memoized, or
  // one transient read failure would poison every later mount.
  p.finally(() => { if (lichDbInflight?.p === p) lichDbInflight = null }).catch(() => {})
  return p
}

/** The Lich room for a room NUMBER from the game. The game's uid first; then
 *  Lich's own id, which `display_lichid` puts in the same subtitle slot, but
 *  only when that room's title is the room you're in. An unmapped room's game
 *  number can be some other room's Lich id: Metal Repair in the Crossing
 *  matched a room in Qi'Reshalia, and the toolbar and the Lich Map's marker
 *  went there (v1.1.0, Sekmeht). With display_lichid the number IS this
 *  room's id, so its title always agrees. One rule for every lookup by number:
 *  the Lich Map, the toolbar label and the Graph map's marker. */
function roomForNumber(byUid: Map<number, LichRoom>, db: Map<number, LichRoom>, id: number, title: string): LichRoom | undefined {
  const byGame = byUid.get(id)
  if (byGame) return byGame
  const r = db.get(id)
  return r && normalizeMatchKey(lichTitle(r)) === normalizeMatchKey(title) ? r : undefined
}

let genieCache:    { key: string; data: Map<string, GenieZone> } | null = null
let genieInflight: { key: string; p: Promise<Map<string, GenieZone> | null> } | null = null

/** The Genie disk-cache fast path, shared across panels. Null = cold, caller parses XML. */
function loadGenieCached(dir: string): Promise<Map<string, GenieZone> | null> {
  if (genieCache?.key === dir)    return Promise.resolve(genieCache.data)
  if (genieInflight?.key === dir) return genieInflight.p

  const p = (async (): Promise<Map<string, GenieZone> | null> => {
    const cached = await window.api.genieCacheLoad(dir)
    if (!cached || !Array.isArray(cached) || cached.length === 0) return null
    const zones = new Map<string, GenieZone>()
    for (const z of cached as GenieZone[]) if (z?.id) zones.set(z.id, z)
    if (zones.size === 0) return null
    genieCache = { key: dir, data: zones }
    announceMapData()
    return zones
  })()

  genieInflight = { key: dir, p }
  p.finally(() => { if (genieInflight?.p === p) genieInflight = null }).catch(() => {})
  return p
}

/** Publish a freshly XML-parsed zone set so sibling panels skip the cold path. */
function primeGenieCache(dir: string, zones: Map<string, GenieZone>): void {
  if (zones.size > 0) { genieCache = { key: dir, data: zones }; announceMapData() }
}

/** Forget the parsed zones for `dir` — its files were just replaced at the same path. */
function bustGenieCache(dir: string): void {
  if (genieCache && samePath(genieCache.key, dir))       genieCache = null
  if (genieInflight && samePath(genieInflight.key, dir)) genieInflight = null
}

// ── Graph map data (v1.1.0) — the same rule: the world is shared ─────────────
//
// The bridge between the two maps, the world layout and the atlas of things all
// describe the WORLD, so they are built once per app and handed to every
// MapPanel, keyed by the IDENTITY of the shared Lich room map and Genie zone
// map above (a reload of either makes a new Map, so a stale build misses on its
// own). The in-flight promise is kept for the two-panels-in-one-frame case.
// What a character is looking at (lens, zone, world or zone) stays in
// GraphMapView's own state.

let graphCache:    { db: Map<number, LichRoom>; zones: Map<string, GenieZone>; data: GraphData } | null = null
let graphInflight: { db: Map<number, LichRoom>; zones: Map<string, GenieZone>; p: Promise<GraphData> } | null = null

/** Match the two maps and place every zone on the world, once per pair of datasets. */
function loadGraphData(db: Map<number, LichRoom>, zones: Map<string, GenieZone>): Promise<GraphData> {
  if (graphCache?.db === db && graphCache.zones === zones) return Promise.resolve(graphCache.data)
  if (graphInflight?.db === db && graphInflight.zones === zones) return graphInflight.p
  const p = (async (): Promise<GraphData> => {
    // In slices of about 8 ms (timeSlice.ts), so the window keeps drawing, and a
    // zoom keeps its frames, while a quarter-second of matching runs.
    const bridge = await buildGraphBridgeAsync(zones, db.values())
    const data = { bridge, world: await buildGraphWorldAsync(zones, bridge, db) }
    graphCache = { db, zones, data }
    return data
  })()
  graphInflight = { db, zones, p }
  p.finally(() => { if (graphInflight?.p === p) graphInflight = null }).catch(() => {})
  return p
}

type AtlasBundle = { atlas: Atlas; files: MapDataFile[] }
let atlasCache:    { db: Map<number, LichRoom>; lichPath: string; stamp: string; data: AtlasBundle } | null = null
let atlasInflight: { db: Map<number, LichRoom>; lichPath: string; stamp: string; p: Promise<AtlasBundle> } | null = null

/** What is where: Lich's data files (read in main) merged with the map's own
 *  tags. Keyed by the files' sizes and times too, so a dr-scripts update that
 *  rewrites them mid-session is picked up the next time a map asks (v1.1.0);
 *  asking costs a few stats in main, and nothing is rebuilt unless they changed. */
async function loadAtlas(db: Map<number, LichRoom>, lichPath: string): Promise<AtlasBundle> {
  const stamp = await window.api.lichMapDataStamp(lichPath).catch(() => '')
  if (atlasCache?.db === db && atlasCache.lichPath === lichPath && atlasCache.stamp === stamp) return atlasCache.data
  if (atlasInflight?.db === db && atlasInflight.lichPath === lichPath && atlasInflight.stamp === stamp) return atlasInflight.p
  const p = (async (): Promise<AtlasBundle> => {
    // A failed read still gives a working atlas from the map's tags.
    const res = await window.api.lichMapData(lichPath).catch(() => ({ rows: [], files: [] }))
    const data = { atlas: await buildAtlasAsync(res.rows, db.values()), files: res.files }
    const fresher = atlasCache?.db === db && atlasCache.lichPath === lichPath
    atlasCache = { db, lichPath, stamp, data }
    // Same map, newer data files: other panels showing Graph take it too.
    if (fresher) announceMapData()
    return data
  })()
  atlasInflight = { db, lichPath, stamp, p }
  p.finally(() => { if (atlasInflight?.p === p) atlasInflight = null }).catch(() => {})
  return p
}

// The Genie folder's fingerprint (main's `name:mtime:size` list) at the time
// its zones were loaded, per folder. A map compares it with the folder's
// current one when it is shown or the window regains focus, so a folder
// updated while Lichborne runs (Genie's own updater, a git pull) is reloaded.
const genieSeenFp = new Map<string, string>()

/** Folder paths compared loosely. A trailing separator never matters; case and
 *  `\` vs `/` only on Windows. On Linux (and a case-sensitive Mac volume)
 *  `Maps` and `maps` are different folders, and `\` is a legal file name
 *  character, so there only the trailing `/` is ignored. */
function samePath(a: string, b: string): boolean {
  const n = (p: string) => IS_WINDOWS
    ? p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()
    : p.replace(/\/+$/, '')
  return !!a && !!b && n(a) === n(b)
}

/** The download's progress as a few words for the map toolbar. */
function genieJobText(p: GenieMapsProgress): string {
  if (p.phase === 'download') {
    if (p.total) return `${Math.round(p.received / p.total * 100)}%`
    return `${(p.received / 1048576).toFixed(1)} MB`
  }
  if (p.phase === 'extract') return 'unpacking'
  return 'finishing'
}

// ── What the Graph map needs (v1.1.0) ─────────────────────────────────────────
//
// The Graph map is an ADD-ON over two maps: Lich's map and the Genie maps. Until
// both are on this computer its button is greyed, and clicking it opens this
// checklist instead of a half-working map: one row per map, each saying whether
// it's there and, when it isn't, the one thing to do about it. Once both are
// there the same view becomes the Graph map with no further click. Module
// scope, not inside MapPanel, so its buttons keep focus across re-renders
// (UX standard #4).
type LichNeed = 'ready' | 'no-lich-path' | 'no-map-file' | 'error'
type GenieNeed = 'ready' | 'loading' | 'missing' | 'empty'

/** One phrase for the greyed Graph button's tooltip: what's missing. */
function graphMissingText(lich: LichNeed, genie: GenieNeed): string {
  const l = lich !== 'ready', g = genie !== 'ready'
  if (l && g) return "Lich's map and the Genie maps"
  if (l) return "Lich's map"
  return genie === 'loading' ? 'the Genie maps (still loading)' : 'the Genie maps'
}

export function GraphNeeds({ lich, lichError, lichRooms, genie, genieMaps, genieDir, genieJob, genieProgress,
  onLichSetup, onRetryLich, onDownload, onPickFolder }: {
  lich: LichNeed; lichError: string | null; lichRooms: number
  genie: GenieNeed; genieMaps: number; genieDir: string; genieJob: string | null
  genieProgress: { loaded: number; total: number } | null
  onLichSetup: () => void; onRetryLich: () => void; onDownload: () => void; onPickFolder: () => void
}) {
  const lichText = lich === 'ready' ? `Found: ${lichRooms.toLocaleString()} rooms.`
    : lich === 'no-lich-path' ? "Lich isn't set up on this computer. Tell Lichborne where it is in Lich Setup."
    : lich === 'no-map-file' ? "Lich is set up, but its map file (map-*.json) isn't in its data folder yet."
    : `Couldn't read Lich's map${lichError ? `: ${lichError.replace(/^Error:\s*/, '').replace(/\.$/, '')}` : ''}.`
  const genieText = genie === 'ready' ? `Found: ${genieMaps} maps.`
    : genie === 'loading' ? `Loading${genieProgress ? ` (${genieProgress.loaded}/${genieProgress.total})` : '…'}`
    : genie === 'empty' ? `No maps could be read from ${genieDir}.`
    : 'Not set up yet. About 4 MB, from the Genie maps team on GitHub.'
  return (
    <div className="map-canvas-wrap">
      <div className="map-empty gx-needs">
        <div className="map-empty-icon">🗺</div>
        <div className="map-empty-msg">The Graph map joins two maps</div>
        <div className="gx-needs-what">
          Genie's hand-drawn rooms, with what Lich knows on top: your exact room,
          things to find (forage, hunting, shops, shrines), and the whole world.
        </div>
        <ul className="gx-needs-list">
          <li className={`gx-needs-row${lich === 'ready' ? ' gx-needs-row--ok' : ''}`}>
            <span className="gx-needs-mark" aria-hidden="true">{lich === 'ready' ? '✓' : '○'}</span>
            <span className="gx-needs-name">Lich's map</span>
            <span className="gx-needs-state">{lichText}</span>
            {lich !== 'ready' && (
              <span className="gx-needs-act">
                {lich === 'error'
                  ? <button className="map-btn" onClick={onRetryLich}>↺ Try again</button>
                  : <button className="map-btn map-btn--primary" onClick={onLichSetup}>Lich Setup…</button>}
              </span>
            )}
          </li>
          <li className={`gx-needs-row${genie === 'ready' ? ' gx-needs-row--ok' : ''}`}>
            <span className="gx-needs-mark" aria-hidden="true">{genie === 'ready' ? '✓' : '○'}</span>
            <span className="gx-needs-name">The Genie maps</span>
            <span className="gx-needs-state">{genieText}</span>
            {(genie === 'missing' || genie === 'empty') && (
              <span className="gx-needs-act">
                <button className="map-btn map-btn--primary" onClick={onDownload} disabled={!!genieJob}
                  title="Download the Genie maps from GitHub into Lichborne's own folder">
                  {genieJob ? `Downloading… ${/\d/.test(genieJob) ? genieJob : ''}`.trim() : '⇩ Download Genie maps'}
                </button>
                {!genieJob && (
                  <button className="map-btn" onClick={onPickFolder}
                    title="Use a Genie maps folder you already have, such as Genie's own Maps folder">📁 Use a folder…</button>
                )}
              </span>
            )}
          </li>
        </ul>
        <div className="gx-needs-note">
          The Graph map opens here by itself once both are found. It works on a
          direct connection too; only its Go button needs Lich running, since it
          sends <code>;go2</code>.
        </div>
      </div>
    </div>
  )
}

// Da'Maps is experimental: if it ever throws while rendering, show the error
// inside the map panel instead of taking the whole window down with it.
class DaMapsBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) { return { error: String((e as Error)?.stack ?? e) } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="map-canvas-wrap">
        <div className="map-empty" style={{ pointerEvents: 'auto' }}>
          <div className="map-empty-icon">⚠</div>
          <div className="map-empty-msg">Da'Maps hit an error</div>
          <pre className="map-empty-sub" style={{ whiteSpace: 'pre-wrap', textAlign: 'left', maxHeight: 200, overflow: 'auto', userSelect: 'text' }}>{this.state.error}</pre>
          <button className="map-btn" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      </div>
    )
  }
}

// B172: memoized — the map re-renders when the room actually changes (its
// props are room primitives + stable callbacks), not on every GameWindow
// render (vitals ticks, main-text batches).
export default memo(function MapPanel({ roomTitle = '', roomDesc = '', roomExits, roomId, lichMapVersion = 0, onSendCommand, large = false, mapAnimations = false, gameFamily }: Props) {
  const character = useCharacter()
  const saveProfile = useProfileSaver()
  const isGS4 = gameFamily === 'GS4'
  // The install this character's session started from (DESIGN §56.7.1): a GS4
  // character on its own install reads that install's maps/.
  const lichPath = useSessionLichPath()

  // ── View mode (per-character) ────────────────────────────────────────────────
  // Two views: 'image' (Lich Map — image-tile renderer) and 'genie' (Genie
  // Maps — XML-based community-curated map graph). The Lich Graph view was
  // removed in this rev; old saved 'lich-graph' / 'graph' selections fall
  // back to 'genie'. GS4 support: there is no GS4 Genie map data, so a GS4
  // character is FORCED to 'image' regardless of a saved 'genie' preference
  // (e.g. one that arrived via Profile Transfer's Panel Layout category from
  // a DR character) — checked first, before the normal saved-value read.
  // 'combined' is the Graph map (v1.1.0). It is NOT stored as 'graph': that
  // word belongs to a view removed in v0.6.3, and saves that still hold it
  // migrate to 'genie' below, which must keep working.
  // A character that has never picked a view starts UNDECIDED (null) and is
  // given one once Lich's map has loaded or failed (the effect after the
  // derived state below): the Lich Map when Lich's map is there, else Genie
  // Maps, which needs no Lich (Sekmeht: a new player without Lich gets the map
  // that works for them). Nothing is drawn before then anyway (every view waits
  // for dbStatus), and null is never saved, so "never picked" stays knowable.
  const [viewMode, setViewMode] = useState<'image' | 'genie' | 'combined' | 'damaps' | null>(() => {
    if (isGS4) return 'image'
    try {
      const v = localStorage.getItem(scopedKey(character, 'mapViewMode'))
      if (v === 'image' || v === 'genie' || v === 'combined' || v === 'damaps') return v
      if (v === 'graph' || v === 'lich-graph') return 'genie'  // migrate legacy selection
      return null
    } catch { return 'image' }
  })
  useEffect(() => {
    if (viewMode === null) return
    try {
      localStorage.setItem(scopedKey(character, 'mapViewMode'), viewMode)
      saveProfile()
    } catch {}
  }, [character, viewMode, saveProfile])

  // ── Lich database ────────────────────────────────────────────────────────────
  const [dbStatus, setDbStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [dbError,  setDbError]  = useState<string | null>(null)
  // State maps are passed as props to sub-components
  const [lichDb,     setLichDb]     = useState<Map<number, LichRoom>>(new Map())
  const [imageIndex, setImageIndex] = useState<Map<string, LichRoom[]>>(new Map())
  // Title index is only used for lookups — ref avoids prop drilling
  const titleIndex     = useRef<Map<string, LichRoom[]>>(new Map())
  const uidIndex       = useRef<Map<number, LichRoom>>(new Map())
  // Secondary index keyed by normalizeMatchKey(title). Used as a forgiving
  // fallback when the exact-case lookup misses — fixes case/bracket/whitespace
  // drift between Lich titles and Genie node names. Same value lists; just a
  // different key derivation.
  const normTitleIndex = useRef<Map<string, LichRoom[]>>(new Map())
  const mapsDirRef = useRef<string>('')
  // Which map-*.json the Lich map came from (`path|time:size`), so a newer or
  // rewritten one can be noticed.
  const loadedMapFileRef = useRef<string>('')

  // ── Current room ─────────────────────────────────────────────────────────────
  const [currentRoom, setCurrentRoom] = useState<LichRoom | undefined>()
  const roomTitleRef = useRef(roomTitle)
  const roomDescRef  = useRef(roomDesc)
  const roomIdRef    = useRef(roomId)
  useEffect(() => { roomTitleRef.current = roomTitle }, [roomTitle])
  useEffect(() => { roomDescRef.current  = roomDesc  }, [roomDesc])
  useEffect(() => { roomIdRef.current    = roomId    }, [roomId])

  // ── Genie augmentation ───────────────────────────────────────────────────────
  const [genieMapsDir, setGenieMapsDir] = useState<string>(() => {
    try { return localStorage.getItem(GENIE_DIR_KEY) ?? '' } catch { return '' }
  })
  const [genieStatus,   setGenieStatus]   = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [genieProgress, setGenieProgress] = useState<{ loaded: number; total: number } | null>(null)
  // Parsed Genie zones, keyed by `zone.id` attribute (Genie XML's per-file
  // numeric id, typically matching the map number in the filename).
  // Populated by `loadGenie` below; consumed by GenieMapView.
  const [genieZones, setGenieZones] = useState<Map<string, GenieZone>>(new Map())
  const genieGenRef = useRef(0)  // incremented on each load start/cancel to abort stale loads
  // Genie view state that must OUTLIVE the view switch. Switching to the Lich
  // map unmounts GenieMapView, which used to drop both the displayed zone and
  // the resolver's breadcrumb — and without the breadcrumb an ambiguous
  // same-titled room can fail to resolve, stranding the map on "waiting for
  // game data" with no way back. MapPanel is per-CHARACTER and stays mounted
  // across the switch, so it holds them. One ref per MapPanel instance means
  // no cross-session bleed (pitfall #6) — never hoist this to module scope.
  // `scale` is the zoom, so World → Zone and a switch between map views come
  // back at the zoom you left (Sekmeht: "it just needs to remember the zoom").
  const geniePersistRef = useRef<{ zoneId: string; level: number; prev: GenieMatch | null; scale?: number }>(
    { zoneId: '', level: 0, prev: null })

  // ── Load Lich JSON ───────────────────────────────────────────────────────────

  // `force` busts the shared cache — used by the ↺ button, the player asking
  // for a re-read whatever the file looks like. Every other reload goes
  // through refreshLichDbIfChanged below.
  const loadLichDb = useCallback(async (force = false) => {
    if (!lichPath) { setDbStatus('error'); setDbError('no-lich-path'); return }
    setDbStatus('loading')
    const result = await window.api.findLichMapFile(lichPath, gameFamily)
    // `missing: 'lich'`: no Lich at that path at all (main checks, ~ expanded),
    // which reads as "the Lich Map needs Lich", not "a map file is missing".
    if (!result || 'missing' in result) { setDbStatus('error'); setDbError(result ? 'no-lich-path' : 'no-map-file'); return }
    mapsDirRef.current = result.mapsDir
    loadedMapFileRef.current = `${result.jsonPath}|${result.stamp ?? ''}`
    try {
      // Parsed once per file path across every mounted MapPanel — see the
      // shared-cache note at module scope. The maps handed back are read-only
      // as far as this component is concerned; nothing below mutates them.
      const { db, byUid, ti, tn, ii } = await loadLichBundle(result.jsonPath, force, result.stamp ?? '')
      titleIndex.current     = ti
      normTitleIndex.current = tn
      uidIndex.current       = byUid
      setLichDb(db)
      setImageIndex(ii)
      setDbStatus('ready')
      setCurrentRoom(
        roomIdRef.current !== undefined
          ? (roomForNumber(byUid, db, roomIdRef.current, roomTitleRef.current)
             ?? findRoom(ti, roomTitleRef.current, roomDescRef.current, tn))
          : findRoom(ti, roomTitleRef.current, roomDescRef.current, tn)
      )
    } catch (e) {
      setDbStatus('error')
      setDbError(String(e))
    }
  }, [lichPath]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLichDb() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload only when Lich's newest map file differs from the one loaded (a new
  // file, or the same file rewritten: path, time and size are compared). A
  // reload puts the panel on "Loading…" and remounts the map view, so it must
  // not run for nothing: Lich prints "--- Map loaded" at the start of every
  // Lich session, for a file Lichborne usually already has (v1.1.0).
  const refreshLichDbIfChanged = useCallback(async () => {
    if (!lichPath || dbStatus !== 'ready') { if (dbStatus === 'error') loadLichDb(); return }
    const r = await window.api.findLichMapFile(lichPath, gameFamily).catch(() => null)
    if (r && !('missing' in r) && `${r.jsonPath}|${r.stamp ?? ''}` !== loadedMapFileRef.current) loadLichDb()
  }, [lichPath, dbStatus, gameFamily, loadLichDb])

  // ── Auto-reload when repository.lic downloads a new map database ────────────

  // B174: fire only on a version CHANGE after mount. The old `=== 0` guard
  // only skipped the very first render of a session — once Lich had printed
  // "--- Map loaded" (version ≥ 1), every REMOUNT of this panel ran the
  // mount-effect load AND this effect = the whole multi-second Lich JSON
  // parsed twice back-to-back. Initializing the ref to the mount-time version
  // makes mount-loading the mount effect's job alone.
  const lastMapVersionRef = useRef(lichMapVersion)
  useEffect(() => {
    if (lichMapVersion === lastMapVersionRef.current) return
    lastMapVersionRef.current = lichMapVersion
    // Not forced: the cache key includes the file's time and size, so a
    // rewritten file at the same path is already a different key (v1.1.0).
    // The whole check, not just Lich's map: this line comes as a Lich session
    // starts, which is also when Lich syncs its scripts and data files from its
    // repository (new hunting grounds, shops…), so the Graph map's Find looks too.
    // A map that wasn't there before (a new player's first Lich session
    // downloads it) is loaded outright; the check only compares a loaded one.
    if (dbStatus === 'error') void loadLichDb()
    else recheckRef.current()
  }, [lichMapVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Match current room when title/desc changes ───────────────────────────────
  //
  // During fast movement the room title, description, and id update across
  // separate render commits — there's a brief window where the title has
  // advanced to the new room but the description / id haven't caught up,
  // so `findRoom` returns undefined and the "NEEDS MAPPING" banner flashes
  // for a single frame before the next prop settles and the match resolves.
  // (B109)
  //
  // Match resolved → commit immediately so the indicator tracks the player.
  // No match → delay the `setCurrentRoom(undefined)` by 400ms. If a real
  // match arrives in the meantime, the effect's cleanup cancels the timer
  // and the banner never paints. If the player genuinely is in an unmapped
  // room and stays there, the 400ms wait is imperceptible before the
  // diagnostic appears.
  useEffect(() => {
    if (dbStatus !== 'ready') return
    // uid FIRST, then Lich's own id, then title+desc. Both id spaces are tried
    // because the subtitle's " - NNNN" slot is genuinely ambiguous: it holds the
    // GAME's room number natively, but Lich's `display_lichid` puts its OWN id
    // in the same place, and nothing in the text distinguishes them. Trying both
    // maps makes the lookup correct either way instead of guessing.
    const found = roomId !== undefined
      ? (roomForNumber(uidIndex.current, lichDb, roomId, roomTitle)
         ?? findRoom(titleIndex.current, roomTitle, roomDesc, normTitleIndex.current))
      : findRoom(titleIndex.current, roomTitle, roomDesc, normTitleIndex.current)
    if (found) {
      setCurrentRoom(found)
      return
    }
    const h = setTimeout(() => setCurrentRoom(undefined), 400)
    return () => clearTimeout(h)
  }, [roomTitle, roomDesc, roomId, dbStatus, lichDb])

  // Da'Maps: tell the PERCEIVE / FORAGE capture which Lich room this character
  // is standing in, so a reading is filed under the right room.
  useEffect(() => {
    daMapsSetRoom(character, currentRoom?.id)
  }, [character, currentRoom])

  // ── Load Genie XML progressively ─────────────────────────────────────────────
  //
  // Genie Map view consumes parsed zones directly — no Lich-room matching, no
  // augment plumbing, no orphan tracking. The XML's own coordinates are
  // authoritative. This is dramatically simpler than the previous Lich-Graph
  // augmentation pipeline (which has been removed along with that view).

  const loadGenie = useCallback(async (dir: string) => {
    // GemStone uses Lich's map only (no Genie maps exist for it, Tysong): a GS4
    // panel never shows the Genie or Graph views, so it never loads them, even
    // with the app-wide Genie folder set by a DragonRealms character.
    if (!dir || isGS4) return
    const gen = ++genieGenRef.current
    setGenieStatus('loading')
    setGenieProgress(null)
    setGenieZones(new Map())

    try {
      // Cache fast path, now shared across panels (see the module-scope note).
      // Main process checks a fingerprint (XML filenames + mtimes + sizes)
      // against the on-disk cache; returns the parsed zones if they match,
      // null otherwise. On a typical re-launch this skips the multi-second
      // DOMParser pass and gets the user to a ready map in ~50ms — and on a
      // SECOND panel it now costs nothing at all, where it used to re-parse
      // the whole 12 MB cache into a second Map.
      // The folder's state BEFORE reading it, so a change made during the read
      // still counts as a change next time. A panel served from another panel's
      // in-memory copy keeps that copy's fingerprint, so if the folder changed
      // since, its own check notices.
      const fpBefore = await window.api.genieCacheFingerprint(dir).catch(() => '')
      const fromMemory = !!genieCache && samePath(genieCache.key, dir)
      const cachedMap = await loadGenieCached(dir)
      if (gen !== genieGenRef.current) return
      if (cachedMap) {
        if (!fromMemory || !genieSeenFp.has(dir)) genieSeenFp.set(dir, fpBefore)
        setGenieZones(cachedMap)
        setGenieStatus('ready')
        return
      }

      const files = await window.api.listMapDir(dir)
      if (gen !== genieGenRef.current) return
      if (!files) throw new Error('Cannot list Genie maps directory')
      const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml'))
      setGenieProgress({ loaded: 0, total: xmlFiles.length })

      const newZones = new Map<string, GenieZone>()

      for (let i = 0; i < xmlFiles.length; i++) {
        try {
          const xml = await window.api.readFile(xmlFiles[i].path)
          if (!xml) continue
          const zone = parseGenieZone(xml, xmlFiles[i].name)
          if (!zone) continue

          // Disambiguate zone ids:
          //   - Empty id (XML missing `<zone id>`): fall back to filename-derived id.
          //   - Duplicate id across files: append a letter suffix ('a', 'b', ...).
          // Mirrors Frostbite's ids[] collision handling in mapreader.cpp.
          let id = zone.id || zone.name || xmlFiles[i].name
          if (newZones.has(id)) {
            const base = id
            let suffix = 0
            do {
              suffix++
              id = `${base}${String.fromCharCode(96 + suffix)}` // a, b, c...
            } while (newZones.has(id))
          }
          zone.id = id
          for (const n of zone.nodes) n.zoneId = id
          newZones.set(id, zone)
        } catch { /* skip malformed zone */ }

        // Update progress every 5 files to avoid flooding renders
        if (i % 5 === 4 || i === xmlFiles.length - 1) {
          setGenieProgress({ loaded: i + 1, total: xmlFiles.length })
          await new Promise<void>(r => setTimeout(r, 0))
          if (gen !== genieGenRef.current) return
        }
      }

      if (gen !== genieGenRef.current) return
      // Publish to the shared cache BEFORE the disk write, so a sibling panel
      // mounting right now takes the in-memory copy rather than repeating the
      // whole DOMParser pass.
      primeGenieCache(dir, newZones)
      genieSeenFp.set(dir, fpBefore)
      setGenieZones(newZones)
      setGenieStatus('ready')

      // Write the cache so subsequent loads hit the fast path. Fire-and-
      // forget — cache write failure shouldn't block the user from seeing
      // the freshly-parsed map. It is stamped with the fingerprint taken
      // BEFORE parsing: files changed during the parse then don't match, and
      // the next load re-reads them instead of trusting this copy.
      window.api.genieCacheSave(dir, [...newZones.values()], fpBefore).catch(err => {
        console.error('Failed to save Genie parse cache:', err)
      })
    } catch {
      if (gen === genieGenRef.current) setGenieStatus('error')
    }
  }, [])

  // Start the Genie load once the Lich map has settled (ready or not there).
  // Only for a folder not already loaded, or after an error: a Lich map RELOAD
  // also ends in 'ready', and re-running the load then emptied the Genie maps
  // and loaded them again, which on the Graph map flashed its checklist and
  // remounted the map (v1.1.0). Folder changes and updates load explicitly.
  const genieLoadedDirRef = useRef('')
  useEffect(() => {
    if (!genieMapsDir || (dbStatus !== 'ready' && dbStatus !== 'error')) return
    if (genieLoadedDirRef.current === genieMapsDir && genieStatus !== 'error') return
    genieLoadedDirRef.current = genieMapsDir
    loadGenie(genieMapsDir)
  }, [genieMapsDir, dbStatus, loadGenie]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Noticing new maps (v1.1.0) ───────────────────────────────────────────────
  //
  // Both map sets are updated often: Lich downloads a new map-<n>.json, dr-scripts
  // rewrites its data files, Genie (or a git pull) updates the XML. An open map
  // asks whether anything changed each time a map view is shown and when the
  // window regains focus (at most every 30 s): a readdir for Lich, a stat per
  // file for the rest, all in main. Nothing is re-read unless something did
  // change. No background polling, by decision (DESIGN §19.19). Lich's own
  // "--- Map loaded" line still reloads straight away (GameWindow).
  const [atlasCheck, setAtlasCheck] = useState(0)
  const checkingRef = useRef(false)
  const lastCheckRef = useRef(0)
  const recheckRef = useRef<() => void>(() => {})
  recheckRef.current = () => {
    if (checkingRef.current) return
    checkingRef.current = true
    lastCheckRef.current = Date.now()
    void (async () => {
      try {
        if (dbStatus === 'ready') await refreshLichDbIfChanged()
        if (genieReady && genieMapsDir) {
          const fp = await window.api.genieCacheFingerprint(genieMapsDir).catch(() => '')
          const seen = genieSeenFp.get(genieMapsDir)
          if (fp && seen !== undefined && fp !== seen) { bustGenieCache(genieMapsDir); loadGenie(genieMapsDir) }
        }
        if (viewMode === 'combined') setAtlasCheck(n => n + 1)
      } finally { checkingRef.current = false }
    })()
  }
  // When a map view is shown, and each time both loads finish. The second half
  // matters for a map opened again after a Genie update: the panel takes the
  // Genie maps already in memory, and only this check notices they changed.
  // Cheap when nothing did (a listing and a few stats in main), and it settles:
  // a reload it starts ends with nothing left to change.
  const mapsSettled = dbStatus !== 'loading' && genieStatus !== 'loading'
  useEffect(() => { if (mapsSettled) recheckRef.current() }, [viewMode, mapsSettled])

  // Another panel in this window loaded a newer copy of shared map data: take
  // it, so every character shows the same maps and the old copy can be freed.
  // Only a panel that is settled acts (the one that did the loading is still
  // 'loading' in this closure), and taking a copy is a cache hit, which loads
  // nothing and announces nothing, so this can't ping-pong.
  const adoptRef = useRef<() => void>(() => {})
  adoptRef.current = () => {
    if (!mapsSettled) return
    if (dbStatus === 'ready') {
      const mine = loadedMapFileRef.current
      const path = mine.slice(0, mine.lastIndexOf('|'))
      const shared = lichDbCaches.get(path)
      if (shared && shared.data.db !== lichDb) { void loadLichDb(); return }
      // Our file was dropped for a newer one in the same folder (Lich downloaded
      // map-<n+1>.json and another panel loaded it): look for the newest file.
      // Not a return: if it finds nothing new, the Genie maps still get checked.
      if (!shared) void refreshLichDbIfChanged()
    }
    if (genieReady && genieMapsDir && genieCache && samePath(genieCache.key, genieMapsDir) && genieCache.data !== genieZones) {
      genieLoadedDirRef.current = genieMapsDir
      void loadGenie(genieMapsDir)
      return
    }
    if (viewMode === 'combined') setAtlasCheck(n => n + 1)
  }
  useEffect(() => {
    const on = () => adoptRef.current()
    window.addEventListener(MAP_DATA_EVENT, on)
    return () => window.removeEventListener(MAP_DATA_EVENT, on)
  }, [])
  // Also each time this panel settles: a ↺ elsewhere announces Lich's map and
  // then the Genie maps, and a panel still taking the first is not settled when
  // the second arrives. Adopting one thing per settle walks through them both.
  useEffect(() => { if (mapsSettled) adoptRef.current() }, [mapsSettled])

  // ↺: the player asking for a re-read, whatever the files look like. Lich's
  // map is always re-read (forced past the shared cache). On Genie Maps and
  // Graph the Genie maps are too: their in-memory copy is dropped and they come
  // back from main's disk cache, which re-parses only if the folder changed.
  // A new Lich map means a new atlas, so Lich's data files are re-read with it.
  const reloadMaps = () => {
    void loadLichDb(true)
    if (viewMode !== 'image' && genieMapsDir) {
      bustGenieCache(genieMapsDir)
      genieLoadedDirRef.current = genieMapsDir
      void loadGenie(genieMapsDir)
    }
  }
  useEffect(() => {
    const onFocus = () => { if (Date.now() - lastCheckRef.current >= 30_000) recheckRef.current() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // ── Genie folder controls ────────────────────────────────────────────────────

  // The folder is ONE app-wide setting (`lichborne.genieMapsDir`), but every
  // MapPanel reads it into its own state at mount. So a change made here is
  // announced to the other panels in this window (a DOM event) and reaches
  // other windows through the `storage` event, and each panel adopts it.
  function setSharedGenieDir(dir: string) {
    if (dir) localStorage.setItem(GENIE_DIR_KEY, dir)
    else localStorage.removeItem(GENIE_DIR_KEY)
    scheduleSharedProfileSave()
    setGenieMapsDir(dir)
    window.dispatchEvent(new CustomEvent(GENIE_DIR_EVENT, { detail: dir }))
  }

  async function pickGenieFolder() {
    // Start in the folder in use, so the 📁 button shows where your maps are.
    const dir = await window.api.browseFolder(genieDirRef.current || undefined)
    if (!dir) return
    setSharedGenieDir(dir)
  }

  function clearGenieFolder() {
    genieGenRef.current++  // abort any in-flight load
    genieLoadedDirRef.current = ''   // picking the same folder again must load it
    setSharedGenieDir('')
    setGenieStatus('idle')
    setGenieProgress(null)
    setGenieZones(new Map())
  }

  const genieDirRef = useRef(genieMapsDir)
  genieDirRef.current = genieMapsDir
  useEffect(() => {
    const adopt = (dir: string) => { if (dir !== genieDirRef.current) setGenieMapsDir(dir) }
    const onLocal = (e: Event) => adopt(String((e as CustomEvent).detail ?? ''))
    const onStorage = (e: StorageEvent) => { if (e.key === GENIE_DIR_KEY) adopt(e.newValue ?? '') }
    window.addEventListener(GENIE_DIR_EVENT, onLocal)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(GENIE_DIR_EVENT, onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // ── Genie maps download (v1.0.2) ─────────────────────────────────────────────
  //
  // Lichborne keeps its own copy of GenieClient/Maps in {userData}/GenieMaps
  // (main/genieMapsDownload.ts). Main broadcasts progress and the finished
  // status to every window, so every open map shows the job and reloads when
  // the files under it are replaced. Downloading while the map uses a folder
  // of your own switches the app-wide setting to this copy, so every open map
  // follows (setSharedGenieDir); the folder you picked is never touched.
  const [managedMaps, setManagedMaps] = useState<GenieMapsStatus | null>(null)
  const [genieJob, setGenieJob] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    window.api.genieMapsStatus().then(s => {
      if (!live) return
      setManagedMaps(s)
      // Already downloaded but no folder chosen: use the download rather than
      // showing the setup screen again. A folder the player picked is kept.
      if (s.installed && !genieDirRef.current) setSharedGenieDir(s.dir)
    }).catch(() => {})
    const offProgress = window.api.onGenieMapsProgress(p => setGenieJob(p.phase === 'done' ? null : genieJobText(p)))
    const offUpdated = window.api.onGenieMapsUpdated(s => {
      setManagedMaps(s)
      bustGenieCache(s.dir)
      // A first download with no folder chosen: use it now. Main sends this
      // just BEFORE the download's own reply, and the progress 'done' between
      // them would otherwise show the Download button again for a moment.
      if (!genieDirRef.current) { setSharedGenieDir(s.dir); return }
      if (samePath(genieDirRef.current, s.dir)) loadGenie(genieDirRef.current)
    })
    return () => { live = false; offProgress(); offUpdated() }
  }, [loadGenie])

  async function downloadGenieMaps() {
    const wasInstalled = !!managedMaps?.installed
    setGenieJob('starting')
    let r: Awaited<ReturnType<typeof window.api.genieMapsInstall>>
    try { r = await window.api.genieMapsInstall() }
    catch (e) { r = { ok: false, error: String((e as Error)?.message ?? e) } }
    if (!r.ok) {
      setGenieJob(null)
      showToast({
        kind: 'error',
        title: "Couldn't download the Genie maps",
        // A message that already ends a sentence (the folder-in-use one) must
        // not gain a second full stop.
        message: r.error
          ? `${r.error[0].toUpperCase()}${r.error.slice(1).replace(/\.\s*$/, '')}. Nothing was changed.`
          : 'Nothing was changed.',
      })
      return
    }
    setManagedMaps(r.status)
    if (!samePath(genieDirRef.current, r.status.dir)) setSharedGenieDir(r.status.dir)
    showToast({
      kind: 'success',
      title: wasInstalled ? 'Genie maps updated' : 'Genie maps downloaded',
      message: `${r.status.maps ?? 'The'} maps from GitHub are ready.`,
    })
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const genieLoading = genieStatus === 'loading'
  const genieReady   = genieStatus === 'ready'

  // What the Graph map still needs (see GraphNeeds at module scope). Graph is
  // usable only with both maps; otherwise its button is greyed and opens the
  // checklist, so a player always sees what to add rather than dead controls.
  const lichNeed: LichNeed = dbStatus === 'ready' ? 'ready'
    : dbError === 'no-lich-path' || dbError === 'no-map-file' ? dbError : 'error'
  // A folder that is set but still 'idle' is about to load (the load effect
  // runs just after Lich's map settles): 'loading', or the checklist would show
  // "Not set up yet" with a Download button for that one frame.
  const genieNeed: GenieNeed = genieReady && genieZones.size > 0 ? 'ready'
    : genieLoading || (genieMapsDir && genieStatus === 'idle') ? 'loading'
    : genieMapsDir ? 'empty' : 'missing'
  const graphUsable = lichNeed === 'ready' && genieNeed === 'ready'
  // A new character's first view (see the viewMode state): decided once, when
  // Lich's map has settled.
  useEffect(() => {
    if (viewMode !== null || (dbStatus !== 'ready' && dbStatus !== 'error')) return
    setViewMode(dbStatus === 'ready' ? 'image' : 'genie')
  }, [viewMode, dbStatus])
  // Lich Setup opens from the map's own empty states. The session's Lich path
  // is read fresh each render (useSessionLichPath falls back to the default
  // install), so closing the dialog re-tries the load with whatever was set.
  const [showLichSetup, setShowLichSetup] = useState(false)
  const [lichRetry, setLichRetry] = useState(0)
  useEffect(() => { if (lichRetry) loadLichDb() }, [lichRetry]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Graph map data ───────────────────────────────────────────────────────────
  // Built only once the Graph view is asked for and both datasets are loaded.
  // The results are tagged with the datasets they were built from, so a reload
  // of either map shows "matching…" again instead of a stale match.
  const [graph, setGraph] = useState<{ db: Map<number, LichRoom>; zones: Map<string, GenieZone>; data: GraphData } | null>(null)
  const [atlasData, setAtlasData] = useState<{ db: Map<number, LichRoom>; data: AtlasBundle } | null>(null)
  const [graphFailed, setGraphFailed] = useState(false)
  const wantGraph = viewMode === 'combined' && dbStatus === 'ready' && genieReady && genieZones.size > 0
  useEffect(() => {
    if (!wantGraph) return
    let live = true
    setGraphFailed(false)
    loadGraphData(lichDb, genieZones)
      .then(data => { if (live) setGraph({ db: lichDb, zones: genieZones, data }) })
      // Said on screen, not only in the console: "still matching" forever would
      // read as a slow machine rather than a failure (pitfall #197).
      .catch(err => { console.error('[graph map] matching the maps failed:', err); if (live) setGraphFailed(true) })
    return () => { live = false }
  }, [wantGraph, lichDb, genieZones])
  useEffect(() => {
    if (!wantGraph || !lichPath) return
    let live = true
    // Same bundle back (nothing changed): keep the state as it is, no re-render.
    loadAtlas(lichDb, lichPath).then(data => { if (live) setAtlasData(prev => prev && prev.db === lichDb && prev.data === data ? prev : { db: lichDb, data }) }).catch(() => {})
    return () => { live = false }
  }, [wantGraph, lichDb, lichPath, atlasCheck])
  // Starting to type in Find asks whether Lich's data files changed (a few
  // stats in main). Lich syncs them from its repository as a session starts,
  // which can be after the map read them, so a hunting ground added that way
  // is findable without a restart. Nothing is re-read unless they did change.
  const recheckAtlas = useCallback(() => setAtlasCheck(n => n + 1), [])
  const graphNow = graph && graph.db === lichDb && graph.zones === genieZones ? graph.data : null
  const atlasNow = atlasData && atlasData.db === lichDb ? atlasData.data : null
  // The Graph map places you by ROOM NUMBER only. `currentRoom` above also
  // falls back to a title-and-description guess, which is right for the Lich
  // map's "where am I" but would let a guess overrule the Genie map's own
  // matching here. Both number spaces are tried, as above (the game's uid, then
  // Lich's own id: the subtitle's number slot can hold either). The Lich-id
  // hit must also have the room's TITLE: an unmapped room's game number can
  // equal some other room's Lich id, and a wrong room here puts the marker in
  // another town and ranks Go from there. With display_lichid the number IS
  // this room's id, so its title always agrees.
  const roomByNumber = dbStatus === 'ready' && roomId !== undefined
    ? roomForNumber(uidIndex.current, lichDb, roomId, roomTitle)
    : undefined

  // One set of props for the Genie map, whether it is shown plain (Genie Maps)
  // or inside the Graph map with layers on top.
  const genieViewProps = {
    zones: genieZones, roomTitle, roomDesc, roomExits, onSendCommand,
    genieMapsDir, genieLoading, genieReady, genieProgress,
    onPickGenieFolder: pickGenieFolder, onClearGenieFolder: clearGenieFolder,
    managedMaps, usingManagedMaps: !!managedMaps && samePath(genieMapsDir, managedMaps.dir),
    genieJob, onDownloadGenieMaps: downloadGenieMaps,
    mapAnimations, persist: geniePersistRef.current,
  }
  const progressPct  = genieProgress
    ? Math.round(genieProgress.loaded / genieProgress.total * 100)
    : 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={`map-panel${large ? ' map-panel--large' : ''}`}>

      {/* Toolbar */}
      <div className="map-toolbar">
        {dbStatus === 'loading' && (
          <span className="map-hint map-hint--indexing">Loading Lich map…</span>
        )}
        {(dbStatus === 'ready' || dbStatus === 'error') && (
          <>
            {/* Greyed (still clickable, like Graph) when Lich's map isn't
                there: the click opens the screen that says why and offers
                Lich Setup and the Genie map (Sekmeht: a player without Lich
                should see only Genie Maps as ready). */}
            <button
              className={`map-btn map-btn--sm${viewMode === 'image' ? ' map-btn--active' : ''}${dbStatus === 'error' ? ' map-btn--locked' : ''}`}
              onClick={() => setViewMode('image')}
              title={dbStatus === 'error'
                ? "Lich Map — drawn from Lich's own map files, which aren't on this computer yet: click to see how to set it up"
                : 'Lich Map — drawn from Lich\'s own map files and pictures'}
            >Lich Map</button>
            {/* GS4 support: no GS4 Genie map data exists, so this view is
                DR-only — hidden rather than shown-disabled (UX standard #1,
                quiet by default: a permanently-inert button teaches nothing). */}
            {!isGS4 && (
              <button
                className={`map-btn map-btn--sm${viewMode === 'genie' ? ' map-btn--active' : ''}`}
                onClick={() => setViewMode('genie')}
                title="Genie Maps — community-maintained XML map files"
              >Genie Maps</button>
            )}
            {/* Graph map (v1.1.0): Genie's layout with what Lich knows on top.
                DR only, like Genie Maps. It's an add-on over both maps, so until
                both are here it is greyed — but still clickable, because the
                click is how you find out what to add (the GraphNeeds checklist).
                A truly disabled button would explain itself only on hover. */}
            {!isGS4 && (
              <button
                className={`map-btn map-btn--sm${viewMode === 'combined' ? ' map-btn--active' : ''}${graphUsable ? '' : ' map-btn--locked'}`}
                onClick={() => setViewMode('combined')}
                title={graphUsable
                  ? "Graph — the Genie maps and Lich's map joined: your exact room, things to find and go to, and the whole world"
                  : `Graph — the Genie maps and Lich's map joined. Needs ${graphMissingText(lichNeed, genieNeed)}: click to see how to add ${lichNeed !== 'ready' && genieNeed !== 'ready' ? 'them' : 'it'}.`}
              >Graph</button>
            )}
            {!isGS4 && (
              <button
                className={`map-btn map-btn--sm${viewMode === 'damaps' ? ' map-btn--active' : ''}`}
                onClick={() => setViewMode('damaps')}
                disabled={dbStatus !== 'ready'}
                title={dbStatus === 'ready'
                  ? `${DA_MAPS_NAME} — Lich map data in the Genie style, with forage and painted maps`
                  : `${DA_MAPS_NAME} needs the Lich map database`}
              >{DA_MAPS_NAME}</button>
            )}
            <button
              className="map-btn map-btn--sm"
              // force — this is the user explicitly asking for a re-read, so it
              // must bypass the shared module cache. Passing `loadLichDb` bare
              // would hand React's MouseEvent in as `force` (truthy by
              // accident, and a type error); serving the cache here would make
              // the button silently do nothing.
              onClick={reloadMaps}
              disabled={!mapsSettled}
              title={!mapsSettled ? 'Loading the maps…' : viewMode === 'image' || !genieMapsDir
                ? "Reload Lich's map from disk"
                : "Reload the maps from disk: Lich's map and the Genie maps (and, for Graph, Lich's data files). Use it after updating any of them."}
            >↺</button>

            <span className="map-toolbar-location" title={currentRoom?.location ?? ''}>
              {currentRoom ? (currentRoom.location ?? lichTitle(currentRoom)) : ''}
            </span>
          </>
        )}
      </div>

      {/* Genie progress bar */}
      {genieLoading && genieProgress && (
        <div className="map-genie-progress">
          <div className="map-genie-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {/* Loading spinner */}
      {dbStatus === 'loading' && (
        <div className="map-canvas-wrap">
          <div className="map-overlay">
            <span className="map-loading">Loading Lich map database…</span>
          </div>
        </div>
      )}

      {/* Image tab error (Lich not available) */}
      {dbStatus === 'error' && (viewMode === 'image' || viewMode === 'damaps') && (
        <div className="map-canvas-wrap">
          {/* The Lich Map is drawn from Lich's own files, so without Lich it
              says so and points at the two ways forward: tell Lichborne where
              Lich is, or use the Genie map, which needs no Lich at all. */}
          {dbError === 'no-lich-path' && (
            <div className="map-empty">
              <div className="map-empty-icon">🗺</div>
              <div className="map-empty-msg">The Lich Map needs Lich</div>
              <div className="map-empty-sub">
                It's drawn from Lich's own map files, and Lich isn't set up on this computer.
                {!isGS4 && ' The Genie map works without it.'}
              </div>
              <div className="genie-maps-actions">
                <button className="map-btn map-btn--primary" onClick={() => setShowLichSetup(true)}>Lich Setup…</button>
                {!isGS4 && <button className="map-btn" onClick={() => setViewMode('genie')}>Open Genie Maps</button>}
              </div>
            </div>
          )}
          {dbError === 'no-map-file' && (
            <div className="map-empty">
              <div className="map-empty-icon">🗺</div>
              <div className="map-empty-msg">Lich's map file wasn't found</div>
              <div className="map-empty-sub">Expected map-*.json in Lich's data/{isGS4 ? 'GS…' : 'DR…'} folder</div>
              <div className="genie-maps-actions">
                <button className="map-btn" onClick={() => setShowLichSetup(true)}>Lich Setup…</button>
                <button className="map-btn" onClick={() => loadLichDb(true)}>↺ Look again</button>
                {!isGS4 && <button className="map-btn" onClick={() => setViewMode('genie')}>Open Genie Maps</button>}
              </div>
            </div>
          )}
          {dbError && dbError !== 'no-lich-path' && dbError !== 'no-map-file' && (
            <div className="map-empty">
              <div className="map-empty-icon">⚠</div>
              <div className="map-empty-msg">Error loading map</div>
              <div className="map-empty-sub">{dbError}</div>
            </div>
          )}
        </div>
      )}

      {/* Sub-views */}
      {dbStatus === 'ready' && viewMode === 'image' && (
        <MapImageView
          lichDb={lichDb}
          imageIndex={imageIndex}
          mapsDir={mapsDirRef.current}
          currentRoom={currentRoom}
          roomTitle={roomTitle}
          roomId={roomId}
          onSendCommand={onSendCommand}
          onShowGenie={() => setViewMode('genie')}
        />
      )}
      {dbStatus === 'ready' && viewMode === 'damaps' && (
        <DaMapsBoundary>
          <DaMapsView
            lichDb={lichDb}
            currentRoom={currentRoom}
            character={character}
            roomTitle={roomTitle}
            roomId={roomId}
            onSendCommand={onSendCommand}
          />
        </DaMapsBoundary>
      )}
      {viewMode === 'genie' && (dbStatus === 'ready' || dbStatus === 'error') && (
        <GenieMapView {...genieViewProps} />
      )}
      {/* Graph map. Until both maps are here it shows what's missing and how
          to add it; it turns into the Graph map by itself once they are. */}
      {viewMode === 'combined' && (dbStatus === 'ready' || dbStatus === 'error') && !graphUsable && (
        <GraphNeeds
          lich={lichNeed} lichError={dbError} lichRooms={lichDb.size}
          genie={genieNeed} genieMaps={genieZones.size} genieDir={genieMapsDir}
          genieJob={genieJob} genieProgress={genieProgress}
          onLichSetup={() => setShowLichSetup(true)} onRetryLich={() => loadLichDb(true)}
          onDownload={downloadGenieMaps} onPickFolder={pickGenieFolder}
        />
      )}
      {viewMode === 'combined' && graphUsable && (
        <GraphMapView
          genie={genieViewProps}
          lichDb={lichDb}
          currentRoom={roomByNumber}
          graph={graphNow}
          graphFailed={graphFailed}
          atlas={atlasNow?.atlas ?? null}
          atlasFiles={atlasNow?.files ?? null}
          onFindStart={recheckAtlas}
        />
      )}
      {/* Portaled at the wizard tier (600), so it sits above the Maps overlay
          (250) too. Closing it re-tries the Lich map with the path just set. */}
      {showLichSetup && (
        <LichSetupDialog onClose={() => { setShowLichSetup(false); setLichRetry(n => n + 1) }} />
      )}
    </div>
  )
})
