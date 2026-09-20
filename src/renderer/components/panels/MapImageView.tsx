// Lich Map view — the image-tile renderer behind MapPanel's "Lich Map" mode.
// Draws the current room's Lich map tile (read via `readMapImage`, cached as a
// data URL per image) inside a pan/zoom SVG, with one clickable rect per room
// on that tile from `image_coords`, and the sonar "you are here" locator
// (v0.8.2) on the current room.
//
// It does NO room matching of its own: `currentRoom` arrives resolved from
// MapPanel (game uid → Lich id → title+description), and this view only
// renders it — the NEEDS MAPPING banner is the `roomTitle && !currentRoom`
// case. Interaction: left-click pins a local `bfsPath` preview (gold), right-
// click / "Walk here" delegates the walk to Lich's `;go2 <id>` (v0.8.2 — one
// fire-and-forget send; `;k go2` stops it), search matches room titles.
// Zoom is per-character (`scopedKey('lichMapScale')`, default 1.5, saved
// debounced 400ms). Every centring path bails on a 0×0 SVG and a
// `ResizeObserver` recentres on the 0→size transition (B132 — an inactive tab
// is display:none and would otherwise strand the camera).
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { LichRoom } from './mapTypes'
import { lichTitle, bfsPath } from './mapTypes'
import { scopedKey } from '../../characterScope'
import { useCharacter } from '../../CharacterContext'
import { useProfileSaver } from '../../hooks/useProfileSaver'

interface Props {
  lichDb:     Map<number, LichRoom>
  imageIndex: Map<string, LichRoom[]>
  mapsDir:    string
  currentRoom: LichRoom | undefined
  roomTitle:   string
  roomId?:     number
  onSendCommand: (cmd: string) => void
}

interface Transform { x: number; y: number; scale: number }

const MIN_SCALE = 0.1
const MAX_SCALE = 8

// Default Lich Map zoom for a character who has never set one. Was an
// effective scale 3 (hardcoded in the image-onload centering handler),
// which testers found far too close. 1.5 shows ~4× the surrounding
// area; the chosen zoom is then persisted per-character so it only
// matters on the very first view.
const DEFAULT_LICH_SCALE = 1.5

function loadLichScale(character: string): number {
  try {
    const raw = localStorage.getItem(scopedKey(character, 'lichMapScale'))
    if (raw == null) return DEFAULT_LICH_SCALE
    const n = parseFloat(raw)
    if (!Number.isFinite(n)) return DEFAULT_LICH_SCALE
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, n))
  } catch { return DEFAULT_LICH_SCALE }
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'image/gif'
}

// ── Tile cache (LRU, bounded) ────────────────────────────────────────────────
//
// Before v0.19.9 the tile cache had NO eviction of any kind — one base64
// data URL per map image ever viewed, retained for as long as the component
// stayed mounted. Measured on a real install: 273 tiles, 26.9 MB on disk,
// ~35.7 MB once base64'd (base64 is 4/3 of binary).
//
// Two things made that worse than it looks. In Windowed Panels mode a map
// window never unmounts, so "as long as mounted" means the whole session —
// the Static-Panels mitigation (PanelFrame renders only the active tab, so
// switching away drops the cache) simply doesn't apply. And each entry costs
// a DECODED bitmap in compositor memory on top of the JS string, which is
// why both the renderer AND the GPU process were observed climbing together
// while travelling.
//
// 30 is far more than any travel path revisits, so the hit rate is unchanged
// in practice; a miss costs one IPC read that already has a loading state.
const MAX_CACHED_TILES = 30

/** Read a tile, refreshing its recency. Returns undefined on a miss. */
function tileGet(cache: Map<string, string>, key: string): string | undefined {
  const hit = cache.get(key)
  if (hit === undefined) return undefined
  // Re-insert so iteration order tracks recency — this is the whole reason
  // the eviction below is an LRU and not a FIFO.
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

/** Store a tile, evicting least-recently-used entries past the cap. */
function tilePut(cache: Map<string, string>, key: string, value: string): void {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > MAX_CACHED_TILES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export default function MapImageView({
  lichDb, imageIndex, mapsDir, currentRoom, roomTitle, roomId, onSendCommand,
}: Props) {
  const character    = useCharacter()
  const saveProfile  = useProfileSaver()
  const [imageDataUrl,  setImageDataUrl]  = useState<string | null>(null)
  const [imageSize,     setImageSize]     = useState<{ w: number; h: number } | null>(null)
  const [imageLoading,  setImageLoading]  = useState(false)
  const imageCache   = useRef<Map<string, string>>(new Map())
  const loadingImage = useRef<string>('')

  // Zoom restored from the character's profile (falls back to
  // DEFAULT_LICH_SCALE). x/y start at 0 — the image-onload / room-change
  // effects re-centre on the current room using the restored scale.
  const [transform,  setTransform]  = useState<Transform>(() => ({ x: 0, y: 0, scale: loadLichScale(character) }))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hoveredId,  setHoveredId]  = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [pathRooms,  setPathRooms]  = useState<Set<number>>(new Set())
  const [searchText, setSearchText] = useState('')
  const svgRef  = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ ox: number; oy: number; tx: number; ty: number } | null>(null)
  // Mirrors transform.scale so the image-onload centering handler
  // (closure over an empty dep array) reads the live zoom rather than
  // a hardcoded constant.
  const scaleRef = useRef(transform.scale)
  useEffect(() => { scaleRef.current = transform.scale }, [transform.scale])

  // Persist the zoom per-character, debounced 400ms so a wheel gesture
  // writes once. Skips the mount-time run so simply opening the panel
  // doesn't schedule a spurious profile save.
  const scaleSaveInit = useRef(true)
  useEffect(() => {
    if (scaleSaveInit.current) { scaleSaveInit.current = false; return }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(scopedKey(character, 'lichMapScale'), String(transform.scale))
        saveProfile()
      } catch { /* localStorage unavailable — non-fatal */ }
    }, 400)
    return () => clearTimeout(t)
  }, [transform.scale, character, saveProfile])

  const currentImageName = currentRoom?.image ?? null

  // ── Image loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentImageName || !mapsDir) return
    const cached = tileGet(imageCache.current, currentImageName)
    if (cached !== undefined) {
      setImageDataUrl(cached)
      return
    }
    if (loadingImage.current === currentImageName) return
    loadingImage.current = currentImageName
    setImageLoading(true)
    window.api.readMapImage(mapsDir, currentImageName).then(base64 => {
      loadingImage.current = ''
      if (!base64) { setImageLoading(false); return }
      const dataUrl = `data:${mimeFor(currentImageName)};base64,${base64}`
      tilePut(imageCache.current, currentImageName, dataUrl)
      setImageDataUrl(dataUrl)
      setImageLoading(false)
    })
  }, [currentImageName, mapsDir])

  // ── Measure image and center on current room when image loads ───────────────

  useEffect(() => {
    if (!imageDataUrl) return
    const img = new Image()
    img.onload = () => {
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight })
      const svg = svgRef.current
      if (!svg) return
      // B132 (Sekmeht, v0.8.9): bail when SVG measures 0×0 (inactive tab,
      // display:none). Without this we'd write a garbage transform
      // (x = -cx*scale because clientWidth/2 = 0/2 = 0) that strands the
      // camera in a corner when the tab is shown again. The
      // ResizeObserver below re-centers on the 0→size transition.
      if (!svg.clientWidth || !svg.clientHeight) return
      if (currentRoom?.image_coords) {
        const [x1, y1, x2, y2] = currentRoom.image_coords
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
        // Centre at the player's persisted zoom, not a hardcoded scale.
        const s = scaleRef.current
        setTransform({ scale: s, x: svg.clientWidth / 2 - cx * s, y: svg.clientHeight / 2 - cy * s })
      }
    }
    img.src = imageDataUrl
  }, [imageDataUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-center when room changes (same image) ────────────────────────────────

  useEffect(() => {
    if (!currentRoom?.image_coords || !imageDataUrl) return
    const svg = svgRef.current
    if (!svg) return
    // B132 (Sekmeht, v0.8.9): same 0×0 bail as the image-onload effect
    // above. While the character's tab is inactive, every room change
    // would otherwise write a garbage transform.
    if (!svg.clientWidth || !svg.clientHeight) return
    const [x1, y1, x2, y2] = currentRoom.image_coords
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
    setTransform(prev => ({
      ...prev,
      x: svg.clientWidth  / 2 - cx * prev.scale,
      y: svg.clientHeight / 2 - cy * prev.scale,
    }))
  }, [currentRoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pan / zoom ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = svg!.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setTransform(prev => {
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * delta))
        return { scale: s, x: mx - (mx - prev.x) * (s / prev.scale), y: my - (my - prev.y) * (s / prev.scale) }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    dragRef.current = { ox: e.clientX, oy: e.clientY, tx: transform.x, ty: transform.y }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (dragRef.current) {
      const { tx, ty, ox, oy } = dragRef.current
      setTransform(prev => ({ ...prev, x: tx + (e.clientX - ox), y: ty + (e.clientY - oy) }))
      setTooltipPos(null)
    } else setTooltipPos({ x: e.clientX, y: e.clientY })
  }
  function onMouseUp()    { dragRef.current = null }
  function onMouseLeave() { dragRef.current = null; setTooltipPos(null) }

  // ── Search ──────────────────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return []
    const results: LichRoom[] = []
    for (const [, rooms] of imageIndex) {
      for (const r of rooms) {
        if (lichTitle(r).toLowerCase().includes(q)) results.push(r)
        if (results.length >= 50) return results
      }
    }
    return results
  }, [searchText, imageIndex])

  // ── Walk ────────────────────────────────────────────────────────────────────

  // v0.8.2: Lich Map movement now delegates to Lich's `;go2` script instead
  // of the previous step-by-step BFS walker. `;go2 <room-id>` handles locked
  // doors, hidden exits, blocked paths, retries, and roundtime — all the
  // things the local timer-based walker fought with (any block killed the
  // walk and left the user stranded). One IPC send, fire-and-forget; if the
  // user wants to stop it they can type `;k go2` in the command bar.
  // The local BFS in `bfsPath` is still used for the visual path-pin on
  // left-click (a static preview), and `walkSteps` still shows the step
  // count on the Walk Here button label as a distance cue.
  function walkToRoom(targetId: number) {
    onSendCommand(`;go2 ${targetId}`)
  }

  // ── Rooms on current image ──────────────────────────────────────────────────

  const roomsOnImage = useMemo(() =>
    currentImageName ? (imageIndex.get(currentImageName) ?? []) : [],
  [currentImageName, imageIndex])

  const selectedRoom = selectedId !== null ? lichDb.get(selectedId) : null
  const canWalk = selectedRoom && currentRoom && selectedRoom.id !== currentRoom.id
  const walkSteps = useMemo(() =>
    canWalk ? bfsPath(lichDb, currentRoom!.id, selectedRoom!.id).length : 0,
  [canWalk, currentRoom, selectedRoom, lichDb])

  // ── Room rects ──────────────────────────────────────────────────────────────

  const roomRects = useMemo(() => {
    if (!imageSize) return null
    return roomsOnImage.map(room => {
      const coords = room.image_coords
      if (!coords) return null
      const [x1, y1, x2, y2] = coords
      const w = x2 - x1, h = y2 - y1
      const isCurrent  = room.id === currentRoom?.id
      const isSelected = room.id === selectedId
      const isHovered  = room.id === hoveredId
      const isOnPath   = pathRooms.has(room.id)
      const isAdjacent = currentRoom ? Object.keys(currentRoom.wayto).includes(String(room.id)) : false

      let fill = 'rgba(255,255,255,0.06)', stroke = 'rgba(255,255,255,0.2)', strokeW = 0.5
      if (isAdjacent)            { fill = 'rgba(180,140,40,0.18)'; stroke = 'rgba(200,160,60,0.7)'; strokeW = 0.8 }
      if (isOnPath)              { fill = 'rgba(180,140,40,0.30)'; stroke = '#d4a820'; strokeW = 1.0 }
      if (isSelected)            { fill = 'rgba(40,100,180,0.35)'; stroke = '#50a0d8'; strokeW = 1.0 }
      if (isHovered && !isSelected) { fill = 'rgba(200,160,60,0.25)'; stroke = '#c09040'; strokeW = 1.0 }
      // v0.8.2: bumped the current-room fill alpha down (0.45 → 0.30) since
      // the sonar locator ring below is now the primary "you are here" cue.
      // Stroke pushed to saturated lime to match the sonar accent. Both go
      // through CSS vars (--lich-here-fill, --lich-here-color) with lime
      // fallbacks so themes can re-pick without touching code.
      if (isCurrent)             { fill = 'var(--lich-here-fill, rgba(0,255,128,0.30))'; stroke = 'var(--lich-here-color, #00ff80)'; strokeW = 1.2 }

      return (
        <g key={room.id}
          onClick={e => {
            // Left-click: pin the BFS path from current to clicked room
            // (visual preview, no walking). Same-room click clears.
            // Right-click runs the walk — see onContextMenu below.
            e.stopPropagation()
            if (selectedId === room.id) {
              setSelectedId(null)
              setPathRooms(new Set())
              return
            }
            setSelectedId(room.id)
            if (currentRoom && room.id !== currentRoom.id) {
              const path = bfsPath(lichDb, currentRoom.id, room.id)
              const set = new Set<number>()
              let cur = currentRoom.id
              for (const cmd of path) {
                const r = lichDb.get(cur)
                const destStr = Object.entries(r?.wayto ?? {}).find(([, c]) => c === cmd && typeof c === 'string')?.[0]
                if (destStr) { const dest = parseInt(destStr, 10); set.add(dest); cur = dest }
              }
              setPathRooms(set)
            }
          }}
          onContextMenu={e => {
            e.preventDefault()
            e.stopPropagation()
            if (currentRoom && room.id !== currentRoom.id) walkToRoom(room.id)
          }}
          onMouseEnter={() => setHoveredId(room.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{ cursor: 'pointer' }}
        >
          <rect x={x1} y={y1} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeW / transform.scale} rx={0.5 / transform.scale} />
          {isCurrent && (() => {
            // v0.8.2: sonar locator — mirrors the Genie Maps "you are here"
            // pattern adapted to the per-room bounding box. Replaces the
            // earlier opacity-pulse rect which was invisible on white/cream
            // Lich Map tiles (the prior #40e080 stroke disappeared into
            // green map backgrounds, and the pulse was too subtle).
            // Layers (drawn in render order, so later sits on top):
            //   1. Two expanding ping circles (CSS `genie-here-ping`,
            //      staggered ~1s apart for a continuous outward wave).
            //   2. Dark backdrop ring — guaranteed contrast against any
            //      background, especially the white/cream Lich tiles.
            //   3. Bright lime accent ring on top — the identity anchor.
            // `vectorEffect="non-scaling-stroke"` keeps every stroke a
            // constant pixel width regardless of the user's map zoom; the
            // radius itself is in image coordinates so the ring scales with
            // the room rect (one-room-wide on a small room, larger on a
            // multi-tile room).
            const cx = (x1 + x2) / 2
            const cy = (y1 + y2) / 2
            // The translucent PINGS sweep outward from just outside the rect —
            // they fade, so they read through text. The opaque SOLID ring sits
            // INSIDE the room rect (Sekmeht) so its band never sprawls over a
            // neighbouring room's label with no way to read through it.
            const ringR  = Math.max(w, h) / 2 + 3   // ping base
            const solidR = Math.min(w, h) / 2        // solid ring — fits inside the rect
            return (
              <>
                <circle className="genie-here-ping" cx={cx} cy={cy} r={ringR}
                        fill="none" stroke="var(--lich-here-color, #00ff80)"
                        strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                <circle className="genie-here-ping genie-here-ping--delayed" cx={cx} cy={cy} r={ringR}
                        fill="none" stroke="var(--lich-here-color, #00ff80)"
                        strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                <circle cx={cx} cy={cy} r={solidR}
                        fill="none" stroke="var(--lich-here-backdrop, rgba(0,0,0,0.55))"
                        strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <circle cx={cx} cy={cy} r={solidR}
                        fill="none" stroke="var(--lich-here-color, #00ff80)"
                        strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {/* v0.8.2: bullseye centre dot — pins the exact room when
                    multiple rooms sit inside the ring radius (dense areas
                    like the Crossing market). Dark backdrop + bright accent
                    on top, same dual-contrast trick as the ring. Sized
                    relative to the room rect so it stays proportional at
                    any zoom. */}
                <circle cx={cx} cy={cy} r={Math.max(1.5, Math.min(w, h) * 0.15)}
                        fill="var(--lich-here-backdrop, rgba(0,0,0,0.55))" />
                <circle cx={cx} cy={cy} r={Math.max(0.9, Math.min(w, h) * 0.10)}
                        fill="var(--lich-here-color, #00ff80)" />
              </>
            )
          })()}
        </g>
      )
    })
  }, [roomsOnImage, currentRoom, selectedId, hoveredId, pathRooms, lichDb, transform.scale, imageSize]) // eslint-disable-line react-hooks/exhaustive-deps

  const recenter = useCallback(() => {
    if (!currentRoom?.image_coords) return
    const svg = svgRef.current; if (!svg) return
    // B132: bail when dimensions are 0 — same as the auto-centering
    // effects above. The ◆ button uses this callback too; nothing to
    // do if there's no viewport yet.
    if (!svg.clientWidth || !svg.clientHeight) return
    const [x1, y1, x2, y2] = currentRoom.image_coords
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
    setTransform(prev => ({ ...prev, x: svg.clientWidth / 2 - cx * prev.scale, y: svg.clientHeight / 2 - cy * prev.scale }))
  }, [currentRoom])

  // B132 (Sekmeht, v0.8.9): direct port of GenieMapView's B88 fix
  // (v0.7.0) — Lich Map had the same bug class but never got the
  // fix. Recenter on the player when the SVG regains a layout box.
  // While a character's tab is inactive its GameWindow is display:none,
  // so svg.clientWidth/Height read 0. The auto-centering effects above
  // now bail in that case instead of writing garbage, but they also
  // never fire when the tab eventually shows again (currentRoom hasn't
  // necessarily changed since the bail). This ResizeObserver catches
  // the 0→size transition (tab becoming visible) and calls recenter()
  // so the camera snaps to the player's current room.
  // `recenterRef` mirrors the latest `recenter` callback so the
  // ResizeObserver effect can stay `[]`-stable — re-attaching a fresh
  // observer on every currentRoom change would churn unnecessarily.
  const recenterRef = useRef(recenter)
  useEffect(() => { recenterRef.current = recenter }, [recenter])
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const ro = new ResizeObserver(() => {
      if (svg.clientWidth > 0 && svg.clientHeight > 0) recenterRef.current()
    })
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="map-view-wrap">
      {/* Search bar */}
      <div className="map-subbar">
        <input className="map-search" placeholder="Search rooms…" value={searchText}
          onChange={e => setSearchText(e.target.value)} spellCheck={false} />
        {currentRoom && (
          <button className="map-btn map-btn--sm" onClick={recenter} title="Re-center on current room">◆</button>
        )}
        {/* v0.8.2: stop-walking button removed — movement now delegates to
            `;go2`, which runs server-side; the user can stop it with
            `;k go2` in the command bar (same way they'd kill any Lich
            script). The local timer-based walker that needed a Stop button
            is gone. */}
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="map-search-results">
          {searchResults.map(r => (
            <div key={r.id}
              className={`map-search-item${r.id === selectedId ? ' map-search-item--active' : ''}`}
              onClick={() => {
                setSelectedId(r.id); setSearchText('')
                if (r.image === currentImageName && r.image_coords) {
                  const svg = svgRef.current; if (!svg) return
                  const [x1, y1, x2, y2] = r.image_coords
                  setTransform(prev => ({ ...prev, x: svg.clientWidth / 2 - ((x1+x2)/2) * prev.scale, y: svg.clientHeight / 2 - ((y1+y2)/2) * prev.scale }))
                }
              }}
            >
              <span className="map-search-name">{lichTitle(r)}</span>
              {r.location && <span className="map-search-note">{r.location}</span>}
              <span className="map-search-id">#{r.id}</span>
            </div>
          ))}
        </div>
      )}

      {/* Location not in Lich map — high-visibility warning style.
          Mirrors MapGraphView's banner so the same diagnostic stands out
          identically in both views. */}
      {roomTitle && !currentRoom && (
        <div className="map-location-unknown map-location-unknown--needs-mapping">
          <span className="map-location-unknown-icon">⚠</span>
          <span className="map-location-unknown-text">
            {roomId !== undefined
              ? `Lich #${roomId} not in map`
              : 'Location not in Lich map'}
          </span>
          <span className="map-location-unknown-room">{roomTitle}</span>
          <span className="map-location-unknown-tag">NEEDS MAPPING</span>
        </div>
      )}

      {/* Canvas */}
      <div className="map-canvas-wrap">
        {imageLoading && <div className="map-overlay"><span className="map-loading">Loading map image…</span></div>}
        {!currentRoom && !roomTitle && !imageLoading && (
          <div className="map-empty">
            <div className="map-empty-icon">🗺</div>
            <div className="map-empty-msg">Waiting for room…</div>
            <div className="map-empty-sub">Map appears once you enter the game</div>
          </div>
        )}
        {currentRoom && !currentRoom.image && !imageLoading && (
          <div className="map-empty">
            <div className="map-empty-icon">🗺</div>
            <div className="map-empty-msg">No map image for this area</div>
            <div className="map-empty-sub">{lichTitle(currentRoom)}</div>
          </div>
        )}
        <svg ref={svgRef} className="map-svg"
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
          onClick={() => { setSelectedId(null); setPathRooms(new Set()) }}
          style={{ cursor: dragRef.current ? 'grabbing' : 'grab', display: imageDataUrl ? 'block' : 'none' }}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {imageDataUrl && imageSize && (
              <image href={imageDataUrl} width={imageSize.w} height={imageSize.h}
                style={{ imageRendering: transform.scale >= 2 ? 'pixelated' : 'auto' }} />
            )}
            {roomRects}
          </g>
        </svg>
      </div>

      {/* Bottom bar */}
      <div className="map-bottom-bar">
        {currentRoom && <span className="map-room-id-badge map-room-id-badge--found" title={`Lich #${currentRoom.id}`}>#{currentRoom.id}</span>}
        {roomTitle && !currentRoom && <span className="map-room-id-badge map-room-id-badge--missing">?</span>}
        {currentRoom && <span className="map-status-text" style={{ flex: 1 }}>{lichTitle(currentRoom)}</span>}
      </div>

      {/* Room detail */}
      {selectedRoom && (
        <div className="map-detail">
          <div className="map-detail-header">
            <span className="map-detail-name">{lichTitle(selectedRoom)}</span>
            <span className="map-detail-id">#{selectedRoom.id}</span>
          </div>
          {selectedRoom.location && <div className="map-detail-desc">{selectedRoom.location}</div>}
          {selectedRoom.description[0] && <div className="map-detail-desc">{selectedRoom.description[0]}</div>}
          <div className="map-detail-exits">
            {Object.entries(selectedRoom.wayto).map(([destId, cmd]) => (
              typeof cmd === 'string' && (
                <span key={destId} className="map-detail-exit"
                  title={`→ #${destId}`} onClick={() => onSendCommand(cmd)}>{cmd}</span>
              )
            ))}
          </div>
          {canWalk && (
            // v0.8.2: button now sends `;go2 <id>` via walkToRoom (fire-and-
            // forget). No more local stop/walking state — `;k go2` in the
            // command bar cancels it. Step count is still shown as a
            // distance cue (computed from the local BFS, same as before).
            <button className="map-walk-btn"
              onClick={() => walkToRoom(selectedRoom.id)}
              title={`Sends ;go2 ${selectedRoom.id} to Lich`}>
              {`▶ Walk here  (${walkSteps} steps)`}
            </button>
          )}
          {selectedRoom.id === currentRoom?.id && <div className="map-detail-here">◆ You are here</div>}
        </div>
      )}

      {/* Hover tooltip */}
      {(() => {
        const r = hoveredId !== null ? lichDb.get(hoveredId) : null
        if (!r || !tooltipPos) return null
        const left = Math.min(tooltipPos.x + 14, window.innerWidth  - 230)
        const top  = Math.min(tooltipPos.y -  8, window.innerHeight - 90)
        const showActionHint = currentRoom && r.id !== currentRoom.id
        return (
          <div className="map-tooltip" style={{ left, top }}>
            <div className="map-tooltip-id">#{r.id}</div>
            <div className="map-tooltip-name">{lichTitle(r)}</div>
            {r.location && <div className="map-tooltip-zone">{r.location}</div>}
            {r.tags && r.tags.length > 0 && <div className="map-tooltip-note">{r.tags.join(' · ')}</div>}
            {showActionHint && (
              <div className="map-tooltip-note" style={{ fontStyle: 'italic' }}>
                Left-click: pin path · Right-click: walk
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
