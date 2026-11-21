// Graph map, world view — every Genie zone on our own drawing of Elanthia (v1.1.0, DESIGN §19.20)
//
// A pure view over `GraphWorld` (graphWorld.ts) and the tables in worldData.ts:
// province shapes on a sea, named places, one bubble per zone at its real spot,
// and the links between zones drawn by the kind of trip they are. Clicking a
// bubble asks the host (GraphMapView) to open that zone; clicking a place name
// opens its Elanthipedia page in the browser.
//
// The drawing is OURS. The official maps are Simutronics' and are not shipped;
// only positions and borders read off them (worldData.ts) are used.
//
// INVARIANTS
//   - Nothing here animates and nothing transitions (the pan group is an SVG
//     transform, which the compositor can't glide anyway), with ONE exception:
//     the "you are here" ping, the same `genie-here-ping` the Lich and Genie
//     maps draw (Sekmeht, v1.1.0: all the maps should agree). Epilepsy safe
//     mode stops it there too.
//   - Label sizes are in SCREEN pixels off the panel font (`fontPx`), divided by
//     the current scale, so they follow the font setting and stay the same size
//     while you zoom; zooming in is what spreads crowded names apart.
//   - A 0×0 measurement (a hidden character tab) is ignored, never drawn from
//     (pitfall #83).
//   - Portal links (Fang Cove's meeting portals reach ten zones) are drawn only
//     for the zone you point at, or the map is a hairball.

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphWorld, WorldZone, LinkKind } from '../../graphWorld'
import { zonesApart, directionTo, worldRoads, stopOf, type WorldRoad } from '../../graphWorld'
import {
  PROVINCE_OUTLINES, PROVINCE_NAMES, PROVINCE_LABEL_POS, WORLD_PLACES, squareByKey, wikiUrl, placeById,
  type Province, type WorldPlace,
} from '../../worldData'

const W = 1000, H = 922            // world units; the official map's shape (1500 x 1383)
const MIN_K = 0.8, MAX_K = 14
const TOWN_LABEL_K = 1.5           // town names appear once you zoom in this far
const ZONE_LABEL_K = 3             // and each map's own name from here
// How fast a bubble grows as you zoom in, against the map: zoom 4× and a
// bubble draws 4^0.35 ≈ 1.6× bigger while the distances between bubbles grow
// 4×. Bubbles sized with the map just became giant overlapping discs; this way
// zooming in SPREADS them apart, which is what zooming is for.
const BUBBLE_GROWTH = 0.35

// ── Layers ────────────────────────────────────────────────────────────────────
// What the world view draws, each switchable from the Layers menu (Sekmeht:
// "toggle elements of the world view"). All on by default; GraphMapView saves
// the choice per character in `graphMapPrefs.world`.
export interface WorldLayers {
  roads: boolean; boats: boolean; sideMaps: boolean; towns: boolean; mapNames: boolean; water: boolean; provinces: boolean; key: boolean
}
export const DEFAULT_WORLD_LAYERS: WorldLayers = { roads: true, boats: true, sideMaps: true, towns: true, mapNames: true, water: true, provinces: true, key: true }
export const WORLD_LAYER_LIST: readonly { id: keyof WorldLayers; label: string; title: string }[] = [
  { id: 'roads',     label: 'Roads',            title: 'The roads between towns, and (zoomed in) the roads inside a town' },
  { id: 'boats',     label: 'Boats & rides',    title: 'Ferries, ships, the gondola, the airship, portals and other rides (portals only show when you point at a map)' },
  { id: 'sideMaps',  label: 'Side maps',        title: "The small maps round each town (gates, tunnels, temples). Off leaves just the towns and big maps; one you're in, or one Find lights, still shows." },
  { id: 'towns',     label: 'Town names',       title: 'City, town and island names. With these off, a map named after a town shows its own name instead (Map names).' },
  { id: 'mapNames',  label: 'Map names',        title: "Each map's own name under its bubble, once zoomed in far enough. With this and Town names off, no names show at all." },
  { id: 'water',     label: 'Water & regions',  title: 'Seas, lakes and bays, and regions like the Velaka Desert and The Waste' },
  { id: 'provinces', label: 'Provinces',        title: 'The coloured provinces and their names. Off draws the land in one plain colour.' },
  { id: 'key',       label: 'Key',              title: 'The key along the bottom that says what the circles and lines mean. Off gives the map that space.' },
]

interface Props {
  world:       GraphWorld
  /** Which layers to draw (all on when absent). */
  layers?:     WorldLayers
  /** The zone the player is in, when known. */
  hereZoneId?: string
  /** Find lens: zone id → how many of its rooms have the thing. Null = no lens. */
  lit?:        Map<string, number> | null
  litLabel?:   string
  onOpenZone:  (zoneId: string) => void
}

const KIND_LABEL: Record<LinkKind, string> = {
  walk: 'Road', athletics: 'Needs Athletics', vessel: 'Boat or other ride', slow: 'Slow going', portal: 'Portal',
}

const PROVINCES = Object.keys(PROVINCE_OUTLINES) as Province[]

const fontPx0 = (box: { font: number } | null): number => box?.font ?? 11

export default memo(function GraphWorldView({ world, layers = DEFAULT_WORLD_LAYERS, hereZoneId, lit = null, litLabel, onOpenZone }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState<{ w: number; h: number; font: number } | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<{ zoneId: string; x: number; y: number } | null>(null)
  const dragRef = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return                      // hidden tab: keep the last real size
      const font = parseFloat(getComputedStyle(el).fontSize) || 11
      setBox(prev => prev && prev.w === w && prev.h === h && prev.font === font ? prev : { w, h, font })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fit the world in the box, centred; `view` pans and zooms on top of that.
  // Room is kept clear at the top (the "Elsewhere" list) and bottom (the key,
  // which a narrow panel drops: every line still says what it is on hover).
  const showKey = !!box && box.w >= 520 && layers.key
  const padTop = world.shelf.length ? fontPx0(box) * 2.6 : 6, padBottom = showKey ? fontPx0(box) * 2.4 : 6
  const fit = box ? Math.min(box.w / W, Math.max(40, box.h - padTop - padBottom) / H) : 1
  const scale = fit * view.k
  const ox = box ? (box.w - W * fit) / 2 : 0
  const oy = box ? padTop + (box.h - padTop - padBottom - H * fit) / 2 : 0
  const px = (v: number) => v / scale              // screen pixels → world units
  // Names shrink a little when the whole world is squeezed into a small panel,
  // and the incidental ones (seas, deserts) wait until there is room.
  const fontPx = fontPx0(box) * Math.min(1, Math.max(0.62, scale / 0.75))
  const roomy = scale >= 0.5
  /** A bubble's radius in world units at the current zoom (see BUBBLE_GROWTH). */
  const rOf = (z: WorldZone) => z.radius * W * Math.pow(view.k, BUBBLE_GROWTH - 1)

  // ── Zoom: the Genie map's recipe (GenieMapView, "Pan / zoom") ──────────────
  // A NATIVE, non-passive wheel listener: React's onWheel is passive, so it
  // can't stop the browser scrolling a parent or Ctrl+wheel zooming the whole
  // window. Wheel events arrive far faster than frames (a touchpad sends
  // several per frame), so they are folded into one factor and applied once per
  // animation frame, anchored on the latest pointer position. Each event is the
  // same 1.15 step the Genie map uses, so the two maps zoom alike.
  const geomRef = useRef({ ox, oy })
  useEffect(() => { geomRef.current = { ox, oy } })
  const wheelAccRef = useRef<{ factor: number; mx: number; my: number } | null>(null)
  const wheelRafRef = useRef<number | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const acc = wheelAccRef.current
      wheelAccRef.current = { factor: (acc ? acc.factor : 1) * (e.deltaY < 0 ? 1.15 : 1 / 1.15), mx: e.clientX - r.left, my: e.clientY - r.top }
      // The card describes whatever was under the pointer; the zoom moves it away.
      setHover(null)
      if (wheelRafRef.current != null) return
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null
        const a = wheelAccRef.current
        wheelAccRef.current = null
        if (!a) return
        const { ox: gx, oy: gy } = geomRef.current
        const mx = a.mx - gx, my = a.my - gy
        setView(v => {
          // Clamp the result, so a burst past a limit lands exactly on it.
          const k = Math.min(MAX_K, Math.max(MIN_K, v.k * a.factor))
          if (k === v.k) return v
          // Keep the point under the pointer where it is.
          const f = k / v.k
          return { k, x: mx - (mx - v.x) * f, y: my - (my - v.y) * f }
        })
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current)
      wheelRafRef.current = null
    }
  }, [])
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    panEndedRef.current = false
    dragRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.px, dy = e.clientY - d.py
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    d.moved = true
    setHover(null)
    setView(v => ({ ...v, x: d.x + dx, y: d.y + dy }))
  }
  // A click fires AFTER mouseup, by which time the drag is over. So a drag that
  // moved leaves a note for that one click: it was the end of a pan, not a pick.
  const panEndedRef = useRef(false)
  const endDrag = () => { if (dragRef.current?.moved) panEndedRef.current = true; dragRef.current = null }
  const wasPan = (): boolean => { const p = panEndedRef.current; panEndedRef.current = false; return p }
  const reset = () => setView({ x: 0, y: 0, k: 1 })

  const allPlaced = useMemo(() => [...world.zones.values()].filter(z => z.pos), [world])
  // With "Side maps" off only the stops are drawn (towns and big maps), but a
  // side map you're in, or one the Find lens lights, still shows: hiding it
  // would hide the answer.
  const placed = useMemo(() => layers.sideMaps ? allPlaced
    : allPlaced.filter(z => stopOf(world, z.zoneId) === z.zoneId || z.zoneId === hereZoneId || (lit?.get(z.zoneId) ?? 0) > 0),
  [allPlaced, layers.sideMaps, world, hereZoneId, lit])
  // A place whose map is on the world (a map named after it) has its name drawn
  // on that map's bubble, so name and bubble can never sit apart, and the
  // bubble doesn't carry a second, smaller copy of the same name.
  const namesakeZone = useMemo(() => {
    const m = new Map<string, WorldZone>()
    for (const z of placed) if (z.namesake && !m.has(z.namesake)) m.set(z.namesake, z)
    return m
  }, [placed])
  const here = hereZoneId ? world.zones.get(hereZoneId) : undefined

  // The land: provinces, islands, and the names that never change.
  const land = useMemo(() => (
    <g>
      {PROVINCES.map(p => (
        <polygon key={p} className={`gx-prov gx-prov--${p}`}
          points={PROVINCE_OUTLINES[p].map(([x, y]) => `${(x * W).toFixed(1)},${(y * H).toFixed(1)}`).join(' ')} />
      ))}
      {WORLD_PLACES.filter(p => p.isle).map(p => (
        <circle key={p.id} className="gx-isle" cx={p.pos[0] * W} cy={p.pos[1] * H} r={p.isle! * W} />
      ))}
    </g>
  ), [])

  // Roads between stops (graphWorld.ts `worldRoads`), not every link: one line
  // per pair of stops and kind, boats as faint curves, and the spokes inside a
  // stop only once zoomed in far enough to read town names.
  const roadSet = useMemo(() => worldRoads(world), [world])
  const roadTitle = (r: WorldRoad) =>
    `${world.zones.get(r.a)!.name} to ${world.zones.get(r.b)!.name}: ${r.notes.length ? r.notes.join('; ') : KIND_LABEL[r.kind]}`
  const roads = useMemo(() => roadSet.roads.map(r => {
    const a = world.zones.get(r.a)!.pos!, b = world.zones.get(r.b)!.pos!
    return (
      <line key={`${r.a}|${r.b}|${r.kind}`} className={`gx-link gx-road gx-link--${r.kind}`} vectorEffect="non-scaling-stroke"
        x1={a[0] * W} y1={a[1] * H} x2={b[0] * W} y2={b[1] * H}>
        <title>{roadTitle(r)}</title>
      </line>
    )
  }), [roadSet, world]) // eslint-disable-line react-hooks/exhaustive-deps
  // Boats bow out to one side, so a ferry reads as a trip over water rather
  // than a road through whatever lies between the two ports.
  const boats = useMemo(() => roadSet.boats.map(r => {
    const a = world.zones.get(r.a)!.pos!, b = world.zones.get(r.b)!.pos!
    const ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H
    const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay
    const cx = mx - dy * 0.18, cy = my + dx * 0.18
    return (
      <path key={`${r.a}|${r.b}`} className="gx-link gx-boat gx-link--vessel" vectorEffect="non-scaling-stroke"
        d={`M${ax.toFixed(1)},${ay.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`}>
        <title>{roadTitle(r)}</title>
      </path>
    )
  }), [roadSet, world]) // eslint-disable-line react-hooks/exhaustive-deps
  const localLinks = useMemo(() => roadSet.local.map(l => {
    const a = world.zones.get(l.a)!.pos!, b = world.zones.get(l.b)!.pos!
    return <line key={`${l.a}|${l.b}`} className={`gx-link gx-local gx-link--${l.kind}`} vectorEffect="non-scaling-stroke"
      x1={a[0] * W} y1={a[1] * H} x2={b[0] * W} y2={b[1] * H} />
  }), [roadSet, world])

  // Every link of the zone you point at, portals included, drawn bolder on top,
  // but only the kinds whose layer is on (Sekmeht: a layer that's off stays
  // off on hover too), and never to a side map the "Side maps" layer hides.
  const shownIds = useMemo(() => new Set(placed.map(z => z.zoneId)), [placed])
  const hoverLinks = useMemo(() => {
    if (!hover) return null
    const kindOn = (k: LinkKind) => (k === 'vessel' || k === 'portal') ? layers.boats : layers.roads
    return world.links.filter(l => (l.a === hover.zoneId || l.b === hover.zoneId)
      && kindOn(l.kind) && shownIds.has(l.a) && shownIds.has(l.b)).map(l => {
      const a = world.zones.get(l.a)!.pos!, b = world.zones.get(l.b)!.pos!
      return <line key={`${l.a}|${l.b}`} className={`gx-link gx-link--${l.kind} gx-link--on`} vectorEffect="non-scaling-stroke"
        x1={a[0] * W} y1={a[1] * H} x2={b[0] * W} y2={b[1] * H} />
    })
  }, [hover, world, layers.boats, layers.roads, shownIds])

  // Which place names are drawn at this zoom. One test, used by the labels AND
  // by the bubbles' own names: a map named after a place hides its own name
  // only when that place's name is actually on screen, or it would have none.
  const placeShown = (id: string): boolean => {
    const p = placeById(id)
    if (!p || !layers.towns) return false
    return p.kind === 'city' || (p.kind === 'quest' && roomy) || ((p.kind === 'town' || p.kind === 'island') && view.k >= TOWN_LABEL_K)
  }

  const openPlace = (p: WorldPlace) => { void window.api.openUrl(wikiUrl(p.wiki ?? p.name)) }

  const hoverZone = hover ? world.zones.get(hover.zoneId) : undefined
  const hoverLinksList = hoverZone ? world.links.filter(l => l.a === hoverZone.zoneId || l.b === hoverZone.zoneId) : []

  return (
    <div className={`gx-world${layers.provinces ? '' : ' gx-world--plain'}`} ref={wrapRef}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={() => { endDrag(); setHover(null) }}>
      {box && (
        <svg className="gx-world-svg" width={box.w} height={box.h}>
          <g transform={`translate(${ox + view.x} ${oy + view.y}) scale(${scale})`}>
            {land}
            {/* Province names, faint and large, behind everything that matters. */}
            {layers.provinces && PROVINCES.map(p => {
              const [cx, cy] = PROVINCE_LABEL_POS[p]
              return <text key={p} className="gx-prov-name" x={cx * W} y={cy * H} fontSize={px(fontPx * 1.7)} textAnchor="middle">{PROVINCE_NAMES[p]}</text>
            })}
            {roomy && layers.water && WORLD_PLACES.filter(p => p.kind === 'water' || p.kind === 'region').map(p => (
              <text key={p.id} className={`gx-label gx-label--${p.kind}`} x={p.pos[0] * W} y={p.pos[1] * H}
                fontSize={px(fontPx * 0.95)} textAnchor="middle" style={{ strokeWidth: px(2) }}>{p.name}</text>
            ))}
            {layers.roads && layers.sideMaps && view.k >= TOWN_LABEL_K && localLinks}
            {layers.boats && boats}
            {layers.roads && roads}
            {hoverLinks}
            {placed.map(z => {
              const n = lit?.get(z.zoneId) ?? 0
              const cls = `gx-zone gx-zone--${z.province ?? 'none'}${lit ? (n ? ' gx-zone--lit' : ' gx-zone--dim') : ''}${z.zoneId === hereZoneId ? ' gx-zone--here' : ''}`
              return (
                <circle key={z.zoneId} className={cls} cx={z.pos![0] * W} cy={z.pos![1] * H} r={rOf(z)} vectorEffect="non-scaling-stroke"
                  onMouseEnter={e => { if (dragRef.current?.moved) return; const r = wrapRef.current!.getBoundingClientRect(); setHover({ zoneId: z.zoneId, x: e.clientX - r.left, y: e.clientY - r.top }) }}
                  onMouseLeave={() => setHover(h => (h?.zoneId === z.zoneId ? null : h))}
                  onClick={() => { if (!wasPan()) onOpenZone(z.zoneId) }} />
              )
            })}
            {/* You are here: the same expanding ping as the Lich and Genie maps
                (`genie-here-ping`, stopped by epilepsy safe mode), under two
                still rings round your zone. */}
            {here?.pos && (
              <g pointerEvents="none">
                <circle className="gx-here-ping genie-here-ping" cx={here.pos[0] * W} cy={here.pos[1] * H} r={rOf(here) + px(4)} vectorEffect="non-scaling-stroke" />
                <circle className="gx-here-ping genie-here-ping genie-here-ping--delayed" cx={here.pos[0] * W} cy={here.pos[1] * H} r={rOf(here) + px(4)} vectorEffect="non-scaling-stroke" />
                <circle className="gx-here" cx={here.pos[0] * W} cy={here.pos[1] * H} r={rOf(here) + px(4)} vectorEffect="non-scaling-stroke" />
                <circle className="gx-here gx-here--outer" cx={here.pos[0] * W} cy={here.pos[1] * H} r={rOf(here) + px(8)} vectorEffect="non-scaling-stroke" />
              </g>
            )}
            {/* Each map's own name under its bubble, once zoomed in far enough
                for them to have room. */}
            {view.k >= ZONE_LABEL_K && layers.mapNames && placed.filter(z => !(z.namesake && placeShown(z.namesake))).map(z => (
              <text key={`n-${z.zoneId}`} className="gx-label gx-label--zone" x={z.pos![0] * W} y={z.pos![1] * H + rOf(z) + px(fontPx * 0.95)}
                fontSize={px(fontPx * 0.8)} textAnchor="middle" style={{ strokeWidth: px(2.5) }}>{z.name}</text>
            ))}
            {/* Place names. Cities always; towns once zoomed in. Click opens
                Elanthipedia. A place with its own map is named just above that
                map's bubble; the others at the spot read off the official map. */}
            {WORLD_PLACES.filter(p => placeShown(p.id)).map(p => {
              const z = namesakeZone.get(p.id)
              const [x, y] = z ? [z.pos![0] * W, z.pos![1] * H - rOf(z) - px(3)] : [p.pos[0] * W, p.pos[1] * H - px(p.kind === 'city' ? 9 : 6)]
              return (
                <text key={p.id} className={`gx-label gx-label--${p.kind}`} x={x} y={y}
                  fontSize={px(fontPx * (p.kind === 'city' ? 1.25 : 0.9))} textAnchor="middle" style={{ strokeWidth: px(3) }}
                  onClick={e => { e.stopPropagation(); if (!wasPan()) openPlace(p) }}>
                  <title>{`${p.name}: open on Elanthipedia`}</title>
                  {p.name}
                </text>
              )
            })}
          </g>
        </svg>
      )}

      {hover && hoverZone && box && (
        <div className="gx-card" style={{
          left: Math.max(6, Math.min(hover.x + 14, box.w - 270)),
          top: hover.y + 14 + 150 > box.h ? Math.max(6, hover.y - 150) : hover.y + 14,
        }}>
          <div className="gx-card-name">{hoverZone.name}</div>
          <div className="gx-card-sub">
            {[hoverZone.province ? PROVINCE_NAMES[hoverZone.province] : null,
              hoverZone.square ? `zone ${hoverZone.square} (${squareByKey(hoverZone.square)?.name})` : null].filter(Boolean).join(' · ')}
          </div>
          <div className="gx-card-line">{hoverZone.rooms} rooms on the Genie map</div>
          {here?.pos && hoverZone.pos && here.zoneId !== hoverZone.zoneId && (() => {
            const n = zonesApart(here.pos!, hoverZone.pos!)
            return <div className="gx-card-line">{n === 0 ? 'In your zone' : `${n} zone${n === 1 ? '' : 's'} away`}, to the {directionTo(here.pos!, hoverZone.pos!)}</div>
          })()}
          {here?.zoneId === hoverZone.zoneId && <div className="gx-card-line gx-card-line--here">You are here</div>}
          {lit && <div className="gx-card-line gx-card-line--lit">{lit.get(hoverZone.zoneId) ?? 0} room{(lit.get(hoverZone.zoneId) ?? 0) === 1 ? '' : 's'} with {litLabel}</div>}
          {hoverLinksList.filter(l => l.kind !== 'walk').slice(0, 5).map(l => {
            const other = world.zones.get(l.a === hoverZone.zoneId ? l.b : l.a)!
            return <div key={`${l.a}|${l.b}`} className={`gx-card-line gx-card-trip gx-card-trip--${l.kind}`}>{other.name}: {l.note || KIND_LABEL[l.kind]}</div>
          })}
          <div className="gx-card-hint">Click to open this map</div>
        </div>
      )}

      {showKey && (
        <div className="gx-key" title="Roads between towns, drawn once per pair. Point at a zone to see all of its own links, portals included; zoom in to see the roads inside a town.">
          {/* What the circles are: a map (sized by rooms, coloured by province),
              an island (land drawn as a circle, its town's map on top), you. */}
          <span className="gx-key-item" title="Each bubble is one Genie map. The more rooms it has, the bigger it is; its colour is its province. Click one to open it.">
            <svg width={22} height={12}><circle className="gx-zone gx-zone--zoluren" cx={5} cy={7} r={2.5} /><circle className="gx-zone gx-zone--zoluren" cx={15} cy={6} r={5} /></svg>Map (bigger = more rooms)
          </span>
          <span className="gx-key-item" title="An island: land drawn as a circle. A town on the island sits on it as its own map bubble.">
            <svg width={14} height={12}><circle className="gx-isle" cx={7} cy={6} r={5} /></svg>Island
          </span>
          <span className="gx-key-item" title="The map you are in, when the game says which room you're in">
            <svg width={14} height={12}><circle className="gx-here" cx={7} cy={6} r={4} /></svg>You are here
          </span>
          <span className="gx-key-sep" aria-hidden="true" />
          {(['walk', 'athletics', 'vessel', 'slow', 'portal'] as LinkKind[]).map(k => (
            <span key={k} className="gx-key-item"><svg width={22} height={8}><line className={`gx-link gx-link--${k} ${k === 'vessel' ? 'gx-boat' : k === 'portal' ? 'gx-link--on' : 'gx-road'}`} x1={1} y1={4} x2={21} y2={4} /></svg>{KIND_LABEL[k]}</span>
          ))}
        </div>
      )}
      <button className="map-btn gx-reset" onClick={reset} title="Show the whole world" aria-label="Show the whole world">⊡</button>

      {/* Maps with no place on the land. One compact list, the same size in a
          wide panel and a narrow one, however many there are. */}
      {world.shelf.length > 0 && (
        <select className="map-select gx-shelf" value="" aria-label="Maps that are not on the land"
          title="Maps with no place on the land: event grounds, arenas, and the Transports map that carries the boats. Pick one to open it."
          onMouseDown={e => e.stopPropagation()}
          onChange={e => { if (e.target.value) onOpenZone(e.target.value) }}>
          <option value="">Elsewhere ({world.shelf.length})…</option>
          {world.shelf.map(id => {
            const z = world.zones.get(id) as WorldZone
            const n = lit?.get(id) ?? 0
            return <option key={id} value={id}>{z.name}{lit && n ? `  (${n} here)` : ''}</option>
          })}
        </select>
      )}
    </div>
  )
})
