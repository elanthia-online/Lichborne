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
import { memo, useState, useRef, useEffect, useCallback } from 'react'
import type { LichRoom, GenieZone } from './mapTypes'
import { findRoom, parseGenieZone, lichTitle, normalizeMatchKey } from './mapTypes'
import { scheduleSharedProfileSave } from '../../profile'
import { scopedKey } from '../../characterScope'
import { useCharacter } from '../../CharacterContext'
import { useProfileSaver } from '../../hooks/useProfileSaver'
import MapImageView from './MapImageView'
import GenieMapView, { type GenieMatch } from './GenieMapView'
import '../../styles/map-panel.css'

interface Props {
  roomTitle?: string
  roomDesc?:  string
  roomExits?: string[]   // live compass tokens ('e','nw',…) — Genie matcher exit-set discriminator
  roomId?:    number
  lichMapVersion?: number
  onSendCommand: (cmd: string) => void
  large?: boolean
  mapAnimations?: boolean   // Settings → Genie Map Animations; gates per-room effects AND the camera glide
}

const GENIE_DIR_KEY  = 'lichborne.genieMapsDir'

function getLichPath(): string {
  try {
    const adv = JSON.parse(localStorage.getItem('lichborne.advancedSettings') ?? '{}')
    return adv.lichPath ?? ''
  } catch { return '' }
}

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

let lichDbCache:    { key: string; data: LichDbBundle } | null = null
let lichDbInflight: { key: string; p: Promise<LichDbBundle> } | null = null

/** Parse Lich's map JSON into the five lookup structures, once per file path. */
function loadLichBundle(jsonPath: string, force: boolean): Promise<LichDbBundle> {
  if (force) {
    if (lichDbCache?.key === jsonPath)    lichDbCache = null
    if (lichDbInflight?.key === jsonPath) lichDbInflight = null
  }
  if (lichDbCache?.key === jsonPath)    return Promise.resolve(lichDbCache.data)
  if (lichDbInflight?.key === jsonPath) return lichDbInflight.p

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
    lichDbCache = { key: jsonPath, data }
    return data
  })()

  lichDbInflight = { key: jsonPath, p }
  // Drop the in-flight entry either way; a rejection must not be memoized, or
  // one transient read failure would poison every later mount.
  p.finally(() => { if (lichDbInflight?.p === p) lichDbInflight = null }).catch(() => {})
  return p
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
    return zones
  })()

  genieInflight = { key: dir, p }
  p.finally(() => { if (genieInflight?.p === p) genieInflight = null }).catch(() => {})
  return p
}

/** Publish a freshly XML-parsed zone set so sibling panels skip the cold path. */
function primeGenieCache(dir: string, zones: Map<string, GenieZone>): void {
  if (zones.size > 0) genieCache = { key: dir, data: zones }
}

// B172: memoized — the map re-renders when the room actually changes (its
// props are room primitives + stable callbacks), not on every GameWindow
// render (vitals ticks, main-text batches).
export default memo(function MapPanel({ roomTitle = '', roomDesc = '', roomExits, roomId, lichMapVersion = 0, onSendCommand, large = false, mapAnimations = true }: Props) {
  const character = useCharacter()
  const saveProfile = useProfileSaver()

  // ── View mode (per-character) ────────────────────────────────────────────────
  // Two views: 'image' (Lich Map — image-tile renderer) and 'genie' (Genie
  // Maps — XML-based community-curated map graph). The Lich Graph view was
  // removed in this rev; old saved 'lich-graph' / 'graph' selections fall
  // back to 'genie'.
  const [viewMode, setViewMode] = useState<'image' | 'genie'>(() => {
    try {
      const v = localStorage.getItem(scopedKey(character, 'mapViewMode'))
      if (v === 'image' || v === 'genie') return v
      if (v === 'graph' || v === 'lich-graph') return 'genie'  // migrate legacy selection
      return 'image'
    } catch { return 'image' }
  })
  useEffect(() => {
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
  const geniePersistRef = useRef<{ zoneId: string; level: number; prev: GenieMatch | null }>(
    { zoneId: '', level: 0, prev: null })

  // ── Load Lich JSON ───────────────────────────────────────────────────────────

  // `force` busts the shared cache — used only by the repository.lic reload
  // below, where the file may have been rewritten at the SAME path and so
  // would otherwise be served stale from the module cache.
  const loadLichDb = useCallback(async (force = false) => {
    const lichPath = getLichPath()
    if (!lichPath) { setDbStatus('error'); setDbError('no-lich-path'); return }
    setDbStatus('loading')
    const result = await window.api.findLichMapFile(lichPath)
    if (!result) { setDbStatus('error'); setDbError('no-map-file'); return }
    mapsDirRef.current = result.mapsDir
    try {
      // Parsed once per file path across every mounted MapPanel — see the
      // shared-cache note at module scope. The maps handed back are read-only
      // as far as this component is concerned; nothing below mutates them.
      const { db, byUid, ti, tn, ii } = await loadLichBundle(result.jsonPath, force)
      titleIndex.current     = ti
      normTitleIndex.current = tn
      uidIndex.current       = byUid
      setLichDb(db)
      setImageIndex(ii)
      setDbStatus('ready')
      setCurrentRoom(
        roomIdRef.current !== undefined
          ? (byUid.get(roomIdRef.current) ?? db.get(roomIdRef.current)
             ?? findRoom(ti, roomTitleRef.current, roomDescRef.current, tn))
          : findRoom(ti, roomTitleRef.current, roomDescRef.current, tn)
      )
    } catch (e) {
      setDbStatus('error')
      setDbError(String(e))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLichDb() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    // force — Lich just rewrote the database, so the shared module cache for
    // this path is stale by definition.
    loadLichDb(true)
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
      ? (uidIndex.current.get(roomId) ?? lichDb.get(roomId)
         ?? findRoom(titleIndex.current, roomTitle, roomDesc, normTitleIndex.current))
      : findRoom(titleIndex.current, roomTitle, roomDesc, normTitleIndex.current)
    if (found) {
      setCurrentRoom(found)
      return
    }
    const h = setTimeout(() => setCurrentRoom(undefined), 400)
    return () => clearTimeout(h)
  }, [roomTitle, roomDesc, roomId, dbStatus, lichDb])

  // ── Load Genie XML progressively ─────────────────────────────────────────────
  //
  // Genie Map view consumes parsed zones directly — no Lich-room matching, no
  // augment plumbing, no orphan tracking. The XML's own coordinates are
  // authoritative. This is dramatically simpler than the previous Lich-Graph
  // augmentation pipeline (which has been removed along with that view).

  const loadGenie = useCallback(async (dir: string) => {
    if (!dir) return
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
      const cachedMap = await loadGenieCached(dir)
      if (gen !== genieGenRef.current) return
      if (cachedMap) {
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
      setGenieZones(newZones)
      setGenieStatus('ready')

      // Write the cache so subsequent loads hit the fast path. Fire-and-
      // forget — cache write failure shouldn't block the user from seeing
      // the freshly-parsed map.
      window.api.genieCacheSave(dir, [...newZones.values()]).catch(err => {
        console.error('Failed to save Genie parse cache:', err)
      })
    } catch {
      if (gen === genieGenRef.current) setGenieStatus('error')
    }
  }, [])

  useEffect(() => {
    if (genieMapsDir && (dbStatus === 'ready' || dbStatus === 'error')) loadGenie(genieMapsDir)
  }, [genieMapsDir, dbStatus, loadGenie])

  // ── Genie folder controls ────────────────────────────────────────────────────

  async function pickGenieFolder() {
    const dir = await window.api.browseFolder()
    if (!dir) return
    localStorage.setItem(GENIE_DIR_KEY, dir)
    scheduleSharedProfileSave()
    setGenieMapsDir(dir)
  }

  function clearGenieFolder() {
    genieGenRef.current++  // abort any in-flight load
    localStorage.removeItem(GENIE_DIR_KEY)
    scheduleSharedProfileSave()
    setGenieMapsDir('')
    setGenieStatus('idle')
    setGenieProgress(null)
    setGenieZones(new Map())
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const genieLoading = genieStatus === 'loading'
  const genieReady   = genieStatus === 'ready'
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
            <button
              className={`map-btn map-btn--sm${viewMode === 'image' ? ' map-btn--active' : ''}`}
              onClick={() => setViewMode('image')}
              title={dbStatus === 'error' ? 'Requires Lich' : 'Lich image-tile view'}
            >Lich Map</button>
            <button
              className={`map-btn map-btn--sm${viewMode === 'genie' ? ' map-btn--active' : ''}`}
              onClick={() => setViewMode('genie')}
              title="Genie Maps — community-maintained XML map files"
            >Genie Maps</button>
            <button
              className="map-btn map-btn--sm"
              // force — this is the user explicitly asking for a re-read, so it
              // must bypass the shared module cache. Passing `loadLichDb` bare
              // would hand React's MouseEvent in as `force` (truthy by
              // accident, and a type error); serving the cache here would make
              // the button silently do nothing.
              onClick={() => loadLichDb(true)}
              title="Reload Lich map database"
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
      {dbStatus === 'error' && viewMode === 'image' && (
        <div className="map-canvas-wrap">
          {dbError === 'no-lich-path' && (
            <div className="map-empty">
              <div className="map-empty-icon">🗺</div>
              <div className="map-empty-msg">Lich path not configured</div>
              <div className="map-empty-sub">Set your Lich path in Settings → Advanced / Lich</div>
            </div>
          )}
          {dbError === 'no-map-file' && (
            <div className="map-empty">
              <div className="map-empty-icon">🗺</div>
              <div className="map-empty-msg">Lich map database not found</div>
              <div className="map-empty-sub">Expected map-*.json in Lich's data/DR/ folder</div>
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
        />
      )}
      {viewMode === 'genie' && (dbStatus === 'ready' || dbStatus === 'error') && (
        <GenieMapView
          zones={genieZones}
          roomTitle={roomTitle}
          roomDesc={roomDesc}
          roomExits={roomExits}
          onSendCommand={onSendCommand}
          genieMapsDir={genieMapsDir}
          genieLoading={genieLoading}
          genieReady={genieReady}
          genieProgress={genieProgress}
          onPickGenieFolder={pickGenieFolder}
          onClearGenieFolder={clearGenieFolder}
          mapAnimations={mapAnimations}
          persist={geniePersistRef.current}
        />
      )}
    </div>
  )
})
