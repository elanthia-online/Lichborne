// Graph map — Genie's layout with Lich's knowledge on top (v1.1.0, DESIGN §19.20)
//
// The third map view. It owns no map data: MapPanel loads the Genie zones, the
// Lich rooms, the bridge between them (graphBridge.ts), the world layout
// (graphWorld.ts) and the atlas of things (graphAtlas.ts) and hands them in.
// This component holds what the PLAYER chose (world or zone, which lens, which
// toggles) and turns the data into the two views:
//
//   ZONE   GenieMapView, unchanged, plus a `GenieOverlay`: your marker placed by
//          the game's room number, the Find lens that lights rooms, Lich-only
//          links, markers for rooms beyond the map, and right-click handed to
//          Lich's `;go2` when the character is on Lich.
//   WORLD  GraphWorldView: every zone on the world, lit by the Find lens.
//
// A Travel time lens (rooms coloured by seconds from you) shipped in the first
// v1.1.0 test builds and was removed: Lich's `timeto` numbers are too rough to
// show as times (Sekmeht). They still RANK rooms, which is all Find's "Go" needs
// to pick the nearest one, and it is the same ranking `;go2` itself walks by.
//
// INVARIANTS
//   - Genie decides where a room is drawn. Nothing here gives a room a position.
//   - `;go2` is only sent for a room Lich knows, and only when this character
//     is connected through Lich; everything else falls through to the Genie
//     walker (v1.0.2). The walk itself is Lich's, not ours.
//   - The ranking is worked out only while Find has more than one room, and
//     only for the room you have SETTLED in (not once per room mid-run).
//   - The `exact` match object handed to GenieMapView is the same object for
//     the same room, or its resolve effect would re-run every render.
//   - Per-character choices live under scopedKey('graphMapPrefs'); written only
//     when one actually changes (pitfall #191).

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import GenieMapView, { type GenieMapViewProps, type GenieOverlay, type GenieMatch } from './GenieMapView'
import GraphWorldView, { DEFAULT_WORLD_LAYERS, WORLD_LAYER_LIST, type WorldLayers } from './GraphWorldView'
import type { GenieNode, GenieZone, LichRoom } from './mapTypes'
import { lichTitle } from './mapTypes'
import type { GraphBridge } from '../../graphBridge'
import { nodeForLichRoom } from '../../graphBridge'
import type { GraphWorld } from '../../graphWorld'
import {
  type Atlas, type Thing, searchAtlas, thingLabel, travelTimes, CATEGORY_LABEL,
} from '../../graphAtlas'
import { useGenieWalk } from '../../GenieWalkContext'
import { scopedKey } from '../../characterScope'
import { useCharacter } from '../../CharacterContext'
import { useProfileSaver } from '../../hooks/useProfileSaver'
import { useSessionUsesLich } from '../../sessionLich'
import type { MapDataFile } from '../../../shared/types'
import '../../styles/graph-map.css'

export interface GraphData { bridge: GraphBridge; world: GraphWorld }

interface Props {
  genie:        Omit<GenieMapViewProps, 'overlay'>
  lichDb:       Map<number, LichRoom>
  currentRoom?: LichRoom
  /** Null while the two maps are still being matched. */
  graph:        GraphData | null
  /** The matching failed (an error, not "still working"). */
  graphFailed?: boolean
  atlas:        Atlas | null
  atlasFiles:   MapDataFile[] | null
  /** Called when the player starts using Find: the host checks Lich's data
   *  files for changes then (cheap), so newly synced ones are searchable. */
  onFindStart?: () => void
}

type Lens = 'none' | 'find'
interface Prefs { level: 'zone' | 'world'; lens: Lens; find: string | null; links: boolean; beyond: boolean; world: WorldLayers }
const DEFAULT_PREFS: Prefs = { level: 'zone', lens: 'none', find: null, links: true, beyond: true, world: DEFAULT_WORLD_LAYERS }

/** The world view's layers, each read on its own: a missing or broken one is
 *  ON, so a save from before the Layers menu (no `world` at all) shows
 *  everything, and a new layer added later starts on for everyone. */
function coerceLayers(o: unknown): WorldLayers {
  const src = o && typeof o === 'object' ? o as Partial<Record<keyof WorldLayers, unknown>> : {}
  const out = { ...DEFAULT_WORLD_LAYERS }
  for (const k of Object.keys(DEFAULT_WORLD_LAYERS) as (keyof WorldLayers)[]) if (typeof src[k] === 'boolean') out[k] = src[k] as boolean
  return out
}

function loadPrefs(character: string): Prefs {
  try {
    const o = JSON.parse(localStorage.getItem(scopedKey(character, 'graphMapPrefs')) ?? 'null') as Partial<Prefs> | null
    if (!o || typeof o !== 'object') return DEFAULT_PREFS
    return {
      level:  o.level === 'world' || o.level === 'zone' ? o.level : DEFAULT_PREFS.level,
      // 'time' was the removed Travel time lens: a saved one reads as no lens.
      lens:   o.lens === 'find' || o.lens === 'none' ? o.lens : DEFAULT_PREFS.lens,
      find:   typeof o.find === 'string' ? o.find : DEFAULT_PREFS.find,
      links:  typeof o.links === 'boolean' ? o.links : DEFAULT_PREFS.links,
      beyond: typeof o.beyond === 'boolean' ? o.beyond : DEFAULT_PREFS.beyond,
      world:  coerceLayers(o.world),
    }
  } catch { return DEFAULT_PREFS }
}

/** The world view's Layers ▾ menu: one button that opens a short checklist.
 *  Seven chips would overflow the bar, which must keep one size. Hoisted to
 *  module scope so its open state survives the map's re-renders (UX #4). Esc
 *  closes the list and is consumed, so it can't also close the Maps window
 *  behind it (pitfall #141); Space is handled here, or the type-anywhere key
 *  handler would send it to the command bar (pitfall #165). */
function LayersMenu({ layers, onChange }: { layers: WorldLayers; onChange: (l: WorldLayers) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const firstRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    firstRef.current?.focus()
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const off = WORLD_LAYER_LIST.filter(l => !layers[l.id]).length
  const flip = (id: keyof WorldLayers) => onChange({ ...layers, [id]: !layers[id] })
  return (
    <span className="gx-layers" ref={wrapRef}
      onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) } }}>
      <button className={`map-btn gx-layers-btn${open ? ' map-btn--active' : ''}`} aria-haspopup="true" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        title={off ? `What the world view draws: ${off} of ${WORLD_LAYER_LIST.length} layers are hidden` : 'What the world view draws: roads, boats, side maps, names and provinces'}>
        Layers{off ? ` (${WORLD_LAYER_LIST.length - off}/${WORLD_LAYER_LIST.length})` : ''} ▾
      </button>
      {open && (
        <div className="gx-find-list gx-layers-list" role="menu" aria-label="World layers">
          {WORLD_LAYER_LIST.map((l, i) => (
            <button key={l.id} ref={i === 0 ? firstRef : undefined} type="button" role="menuitemcheckbox" aria-checked={layers[l.id]}
              className={`gx-layers-item gx-toggle${layers[l.id] ? ' gx-toggle--on' : ''}`} title={l.title}
              onClick={() => flip(l.id)}
              onKeyDown={e => {
                if (e.key === ' ') { e.preventDefault(); flip(l.id) }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const items = [...(wrapRef.current?.querySelectorAll<HTMLButtonElement>('.gx-layers-item') ?? [])]
                  const at = items.indexOf(e.currentTarget)
                  items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
                }
              }}>{l.label}</button>
          ))}
        </div>
      )}
    </span>
  )
}

const SETTLE_MS = 500   // stand still this long before the nearest room is worked out again
const SCRIPTED_COST = 30 // seconds a scripted link (a boat, a portal) counts as, for ranking only

export default memo(function GraphMapView({ genie, lichDb, currentRoom, graph, graphFailed = false, atlas, atlasFiles, onFindStart }: Props) {
  const character = useCharacter()
  const saveProfile = useProfileSaver()
  const usesLich = useSessionUsesLich()

  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(character))
  const savedRef = useRef(JSON.stringify(prefs))
  useEffect(() => {
    const s = JSON.stringify(prefs)
    if (s === savedRef.current) return
    savedRef.current = s
    try { localStorage.setItem(scopedKey(character, 'graphMapPrefs'), s); saveProfile() } catch { /* a full store: the choice still holds for this session */ }
  }, [prefs, character, saveProfile])
  const patch = useCallback((p: Partial<Prefs>) => setPrefs(prev => ({ ...prev, ...p })), [])

  // ── Where you are ───────────────────────────────────────────────────────────
  // The zone your room was last found in. A gate room drawn on two maps stays
  // on the map you were already on, instead of flipping between them.
  const lastZoneRef = useRef<string | undefined>(undefined)
  const zones = genie.zones
  // The map on screen, reported by the Genie view (declared here because the
  // match below reads it).
  const [shown, setShown] = useState<{ zoneId: string; level: number }>({ zoneId: '', level: 0 })
  const exact = useMemo<GenieMatch | null>(() => {
    if (!graph || !currentRoom) return null
    // A room drawn on two maps: the copy on the map ON SCREEN first (the Genie
    // view may have followed you there while room numbers weren't arriving, so
    // the last exact match can be a map behind), then the last exact match's.
    const onShown = shown.zoneId ? nodeForLichRoom(graph.bridge, currentRoom.id, shown.zoneId) : undefined
    const hit = onShown?.zoneId === shown.zoneId ? onShown : nodeForLichRoom(graph.bridge, currentRoom.id, lastZoneRef.current)
    if (!hit) return null
    const zone = zones.get(hit.zoneId)
    const node = zone?.nodes.find(n => n.id === hit.nodeId)
    return zone && node ? { zone, node, isStub: false } : null
  }, [graph, currentRoom, zones, shown.zoneId])
  useEffect(() => { if (exact) lastZoneRef.current = exact.zone.id }, [exact])

  // The room "nearest" is measured from: yours, once you stop moving.
  const roomId = currentRoom?.id
  const [settledRoom, setSettledRoom] = useState<number | undefined>(roomId)
  useEffect(() => {
    if (roomId === settledRoom) return
    const t = setTimeout(() => setSettledRoom(roomId), settledRoom === undefined ? 0 : SETTLE_MS)
    return () => clearTimeout(t)
  }, [roomId, settledRoom])

  // ── What the zone view is showing ───────────────────────────────────────────
  const onZone = useCallback((zoneId: string, level: number) => {
    setShown(p => (p.zoneId === zoneId && p.level === level ? p : { zoneId, level }))
  }, [])
  const [ask, setAsk] = useState<{ zoneId: string; seq: number } | null>(null)
  const zoneBridge = graph?.bridge.zones.get(shown.zoneId)

  // ── Lenses ──────────────────────────────────────────────────────────────────
  const thing: Thing | undefined = prefs.find && atlas ? atlas.byId.get(prefs.find) : undefined
  const lens: Lens = prefs.lens === 'find' && !thing ? 'none' : prefs.lens
  // Lich's travel times from where you stand, used ONLY to rank: which of the
  // thing's rooms is nearest. Not needed when there is just one room. Links
  // whose time Lich works out with a script (boats, portals, premium and guild
  // routes) count as SCRIPTED_COST seconds rather than being left out: go2 runs
  // those scripts itself, and leaving them out cut whole regions off (from the
  // Storm Bulls, 7,600 rooms and every Adan'f ground were "unreachable", and
  // Go was greyed out; Sekmeht, live).
  // Stops at the first of the thing's rooms it reaches, which is the nearest.
  const travel = useMemo(
    () => (lens === 'find' && thing && thing.rooms.length > 1 && settledRoom != null
      ? travelTimes(lichDb, settledRoom, { scriptedCost: SCRIPTED_COST, stopAt: new Set(thing.rooms) }) : null),
    [lens, thing, settledRoom, lichDb])

  const tints = useMemo(() => {
    if (!zoneBridge || prefs.level !== 'zone' || lens !== 'find' || !thing) return null
    const m = new Map<number, string>()
    const has = new Set(thing.rooms)
    for (const [nodeId, match] of zoneBridge.matches) if (has.has(match.lichId)) m.set(nodeId, 'var(--gx-find)')
    return m
  }, [zoneBridge, prefs.level, lens, thing])

  // Find lens, across the world: how many of each zone's rooms have the thing,
  // and the room "Go" walks to (the nearest by Lich's own route times, or the
  // only one). Every room counts for "Go", drawn on a Genie map or not: `;go2`
  // finds its own way.
  const found = useMemo(() => {
    if (lens !== 'find' || !thing || !graph) return null
    const perZone = new Map<string, number>()
    let onMaps = 0
    for (const id of thing.rooms) {
      const nodes = graph.bridge.lichToNodes.get(id)
      if (!nodes?.length) continue
      onMaps++
      const seen = new Set<string>()
      for (const n of nodes) { if (seen.has(n.zoneId)) continue; seen.add(n.zoneId); perZone.set(n.zoneId, (perZone.get(n.zoneId) ?? 0) + 1) }
    }
    let target: number | null = null
    if (thing.rooms.length === 1) target = thing.rooms[0]
    else if (travel) {
      let best = Infinity
      for (const id of thing.rooms) {
        const s = travel.seconds.get(id)
        if (s != null && s < best) { best = s; target = id }
      }
    }
    const targetZoneId = target != null ? graph.bridge.lichToNodes.get(target)?.[0]?.zoneId : undefined
    // Why there is no target, when there isn't one: Lich doesn't know where you
    // are (nothing to rank from), or it does and has no route to any of them.
    const noRoute = target == null && travel != null
    return { perZone, onMaps, target, targetZoneId, noRoute, standingIn: target != null && target === settledRoom }
  }, [lens, thing, graph, travel, settledRoom])

  // "Go": Lich walks you to that room. A running Genie walk is stopped first,
  // as right-click does, so only one of them walks you.
  const walker = useGenieWalk()
  const goToFound = () => {
    if (!found?.target) return
    if (walker?.status) walker.stop()
    genie.onSendCommand(`;go2 ${found.target}`)
  }

  const links = prefs.links ? zoneBridge?.extraLinks ?? null : null
  const beyond = useMemo(() => {
    if (!prefs.beyond || !zoneBridge?.beyond.size) return null
    const m = new Map<number, number>()
    for (const [nodeId, list] of zoneBridge.beyond) m.set(nodeId, list.length)
    return m
  }, [prefs.beyond, zoneBridge])

  // ── What a room's card and right-click do ───────────────────────────────────
  const send = genie.onSendCommand
  // The room you're in is never a `;go2` target: walking to it sends a useless
  // command AND stops a Genie walk. Returning false hands the click back to the
  // Genie map, whose own "that's where you are" check then does nothing.
  const walkTo = useCallback((zone: GenieZone, node: GenieNode): boolean => {
    if (!usesLich || !graph) return false
    const m = graph.bridge.zones.get(zone.id)?.matches.get(node.id)
    if (!m || m.lichId === roomId) return false
    send(`;go2 ${m.lichId}`)
    return true
  }, [usesLich, graph, send, roomId])
  const walkHint = useCallback((zone: GenieZone, node: GenieNode): string | null => {
    if (!usesLich || !graph) return null
    const m = graph.bridge.zones.get(zone.id)?.matches.get(node.id)
    return m && m.lichId !== roomId ? `Lich walks you here (;go2 ${m.lichId})` : null
  }, [usesLich, graph, roomId])
  // Labelled facts for the room card (GenieMapView draws them as a grid).
  const hoverLines = useCallback((zone: GenieZone, node: GenieNode): { label: string; text: string }[] => {
    if (!graph) return [{ label: 'Lich', text: 'still matching this map to Lich\'s…' }]
    const zb = graph.bridge.zones.get(zone.id)
    const m = zb?.matches.get(node.id)
    if (!m) return [{ label: 'Lich', text: 'no room matched to this one' }]
    const room = lichDb.get(m.lichId)
    const lines = [{ label: 'Lich', text: `room ${m.lichId}${room?.uid?.length ? ` · game room ${room.uid[0]}` : ''}` }]
    const here = atlas?.inRoom.get(m.lichId)
    if (here?.length) {
      const names = here.slice(0, 6).map(t => t.town ? `${t.name} (${t.town})` : t.name)
      lines.push({ label: 'Here', text: `${names.join(', ')}${here.length > 6 ? `, and ${here.length - 6} more` : ''}` })
    }
    const out = zb?.beyond.get(node.id)
    if (out?.length) {
      lines.push({ label: 'Beyond', text: `${out.slice(0, 3).map(r => r.move ? `${r.title} (${r.move})` : r.title).join('; ')}${out.length > 3 ? `, and ${out.length - 3} more` : ''}` })
    }
    return lines
  }, [graph, lichDb, atlas])

  // Where the Genie map puts its zone list and navigation buttons: a span in
  // our bar, so the Graph map has ONE row of controls instead of three.
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null)
  const overlay = useMemo<GenieOverlay>(() => ({
    exact, zoneId: shown.zoneId, tints, fade: !!tints, links, beyond, walkTo, walkHint, hoverLines, onZone, showZone: ask,
    embedded: true, navSlot,
  }), [exact, shown.zoneId, tints, links, beyond, walkTo, walkHint, hoverLines, onZone, ask, navSlot])

  // ── Find box ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const results = useMemo(() => (open && atlas ? searchAtlas(atlas, query, 14) : []), [open, atlas, query])
  const rootRef = useRef<HTMLDivElement | null>(null)
  const findRef = useRef<HTMLSpanElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // The list is a fixed width, but never wider than the room to the map's
  // right edge: in a narrow panel it would run off the side and be cut off.
  const [listMax, setListMax] = useState<number | undefined>(undefined)
  const listShown = open && !!query.trim()
  useLayoutEffect(() => {
    if (!listShown) return
    const root = rootRef.current, box = findRef.current
    if (!root || !box) return
    const room = Math.floor(root.getBoundingClientRect().right - box.getBoundingClientRect().left - 6)
    setListMax(m => (room > 0 && room !== m ? room : m))
  }, [listShown])
  // ↓ / ↑ past the visible rows scrolls the list to keep the highlighted row
  // in view. The list's own scrollTop, never scrollIntoView, which would also
  // scroll the app's root (pitfall #109).
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelectorAll<HTMLElement>('.gx-find-row')[cursor]
    if (!list || !row) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight
  }, [cursor, results])
  // Picking leaves the zoom and position alone (Sekmeht: "the zoom resets to
  // zoomed out pretty far"). It used to fit the whole map, which on a big one
  // threw away where you were looking; ⊡ does that when you want it.
  const pick = (t: Thing) => { patch({ find: t.id, lens: 'find' }); setQuery(''); setOpen(false) }
  const onFindKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[cursor]) pick(results[cursor]) }
    else if (e.key === 'Escape' && (open || query)) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery('') }
  }
  const missingFiles = atlasFiles?.filter(f => f.missing || f.error) ?? []
  const findTitle = !atlas ? 'Reading what Lich knows about each room…'
    : `Find a forage item, a hunting ground, a shop, a shrine… and light up every room that has it.${
      atlasFiles && missingFiles.length === atlasFiles.length ? ' Lich\'s data files weren\'t found, so this searches the Lich map\'s own tags only.'
        : missingFiles.length ? ` (Not read: ${missingFiles.map(f => f.file).join(', ')}.)` : ''}`

  // ── Footer ──────────────────────────────────────────────────────────────────
  // Everything that REPORTS sits in one quiet line under the map, where the
  // Genie map keeps its own; the bar above holds only things you click.
  const hasMaps = zones.size > 0
  // What is on screen: the world, a "matching…" placeholder, or the Genie map
  // (which is also the fallback at World level when there is nothing to match).
  const showing: 'world' | 'matching' | 'zone' =
    prefs.level === 'world' && graph ? 'world'
      : prefs.level === 'world' && hasMaps && !graphFailed ? 'matching'
      : 'zone'
  const isZone = showing === 'zone'
  let status: React.ReactNode = null
  if (!graph) {
    status = graphFailed ? 'The two maps couldn\'t be matched. The Genie map still works; ↺ above tries again.'
      : 'Matching the Genie maps to Lich\'s map…'
  } else if (lens === 'find' && thing && found) {
    const hereN = isZone ? (tints?.size ?? 0) : null
    status = <>
      <span>{hereN != null ? `${hereN} here · ` : ''}{found.onMaps} room{found.onMaps === 1 ? '' : 's'} in {found.perZone.size} map{found.perZone.size === 1 ? '' : 's'}</span>
      {found.standingIn ? <span> · you are standing in one</span>
        : found.target != null && thing.rooms.length > 1 && <span title="The nearest by Lich's own route times, the same ones ;go2 walks by. Boats, portals and other scripted routes count as half a minute each, so this is a good guess rather than an exact one.">
          {` · nearest: ${(lichDb.get(found.target) && lichTitle(lichDb.get(found.target)!)) || `Lich room ${found.target}`}`}
          {found.targetZoneId && (found.targetZoneId !== shown.zoneId || !isZone) ? ` (${graph.world.zones.get(found.targetZoneId)?.name ?? ''})` : ''}
        </span>}
    </>
  } else if (isZone && zoneBridge) {
    status = <span title="How many of this map's rooms were matched to a room in Lich's map. The rest are rooms Lich hasn't mapped, or look-alikes it couldn't tell apart.">
      Lich knows {zoneBridge.matched} of {zoneBridge.rooms} rooms
    </span>
  } else if (showing === 'world') {
    status = 'Point at a map to see how far it is and how you get there; click it to open it.'
  }
  const footerPlace = isZone ? zones.get(shown.zoneId)?.name : 'Elanthia'

  return (
    <div className="gx-root" ref={rootRef}>
      {/* Two rows, each with one job, instead of one row that wraps wherever
          it runs out of room (which split Go from the chip it belongs to).
          Row 1: which map, and what's drawn on it. Row 2: finding things. */}
      <div className="map-subbar gx-bar">
       <div className="gx-row">
        <span className="gx-seg" role="group" aria-label="World or zone">
          <button className={`map-btn map-btn--sm${prefs.level === 'world' ? ' map-btn--active' : ''}`} aria-pressed={prefs.level === 'world'}
            onClick={() => { setAsk(null); patch({ level: 'world' }) }}
            title="World: every map as a bubble on Elanthia, joined by how you travel between them">World</button>
          <button className={`map-btn map-btn--sm${prefs.level === 'zone' ? ' map-btn--active' : ''}`} aria-pressed={prefs.level === 'zone'}
            onClick={() => { setAsk(null); patch({ level: 'zone' }) }}
            title="Zone: one map, drawn the way Genie draws it, with what Lich knows on top">Zone</button>
        </span>
        {/* The Genie map's zone list, ◆ ⊡ ▤ and levels land here (zone only). */}
        {isZone && <span className="gx-nav" ref={setNavSlot} />}
        {/* Layers: quiet chips, on or off, under a "Show" label, at the right. */}
        {isZone && (
          <span className="gx-show" role="group" aria-label="Show on the map">
            <span className="gx-show-label">Show</span>
            <button className={`map-btn gx-toggle${prefs.links ? ' gx-toggle--on' : ''}`} aria-pressed={prefs.links}
              onClick={() => patch({ links: !prefs.links })}
              title={`Lich links: dashed lines for ways Lich knows that Genie doesn't draw${zoneBridge ? ` (${zoneBridge.extraLinks.length} on this map; dotted ones depend on your character)` : ''}`}>Lich links</button>
            <button className={`map-btn gx-toggle${prefs.beyond ? ' gx-toggle--on' : ''}`} aria-pressed={prefs.beyond}
              onClick={() => patch({ beyond: !prefs.beyond })}
              title={`Rooms beyond the map: a framed room with a count on its corner leads to rooms Lich has and Genie doesn't${zoneBridge ? ` (${zoneBridge.beyond.size} here)` : ''}. Point at the room to see them.`}>Beyond</button>
          </span>
        )}
        {showing === 'world' && (
          <span className="gx-show" role="group" aria-label="Show on the world">
            <LayersMenu layers={prefs.world} onChange={world => patch({ world })} />
          </span>
        )}
       </div>
       <div className="gx-row gx-row--find">
        <span className="gx-find" ref={findRef}>
          <input className="gx-find-input" type="text" value={query} placeholder={thing && lens === 'find' ? 'Find something else…' : 'Find: jadice, rats, bank…'} disabled={!atlas}
            title={findTitle} aria-label="Find things on the map" spellCheck={false}
            onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(0) }}
            onFocus={() => { setOpen(true); onFindStart?.() }} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onFindKey} />
          {listShown && (
            <div className="gx-find-list gx-find-results" role="listbox" ref={listRef} style={listMax ? { maxWidth: listMax } : undefined}>
              {results.length === 0 && <div className="gx-find-none">Nothing by that name</div>}
              {/* Four fixed columns (name · detail · kind · rooms) so every row
                  lines up; anything too long is trimmed and the row's tooltip
                  carries the whole of it. */}
              {results.map((t, i) => {
                const detail = [t.town, t.note].filter(Boolean).join(' · ')
                const kind = CATEGORY_LABEL[t.category]
                const rooms = `${t.rooms.length} room${t.rooms.length === 1 ? '' : 's'}`
                return (
                  <button key={t.id} role="option" aria-selected={i === cursor} className={`gx-find-row${i === cursor ? ' gx-find-row--on' : ''}`}
                    title={[t.name, detail, kind, rooms].filter(Boolean).join(' · ')}
                    onMouseDown={e => { e.preventDefault(); pick(t) }} onMouseEnter={() => setCursor(i)}>
                    <span className="gx-find-name">{t.name}</span>
                    <span className="gx-find-detail">{detail}</span>
                    <span className="gx-find-kind">{kind}</span>
                    <span className="gx-find-count">{t.rooms.length}</span>
                  </button>
                )
              })}
            </div>
          )}
        </span>
        {/* What is being looked for, as a chip beside the box; ✕ stops looking. */}
        {lens === 'find' && thing && (
          <span className="gx-pill" title={`${CATEGORY_LABEL[thing.category]}: ${thingLabel(thing)}`}>
            <span className="gx-pill-name">{thing.name}</span>
            <button className="gx-pill-x" onClick={() => patch({ find: null, lens: 'none' })} title="Stop looking for this" aria-label={`Stop looking for ${thing.name}`}>✕</button>
          </span>
        )}
        {/* Go: Lich walks you to the room (the nearest one when there are several). */}
        {lens === 'find' && thing && (() => {
          const why = !usesLich ? 'Go needs this character connected through Lich (it sends ;go2). Right-click a lit room to walk there with the Genie map instead.'
            : !found ? 'Still matching this map to Lich\'s…'
            : found.standingIn ? 'You are standing in one already'
            : found.noRoute ? 'Lich\'s map has no route from here to any of these rooms'
            : found.target == null ? 'To pick the nearest, Lich has to know your room: move or LOOK'
            : null
          return (
            <button className="map-btn map-btn--sm gx-go" onClick={goToFound} disabled={!!why}
              title={why ?? `Lich walks you to ${thing.rooms.length > 1 ? 'the nearest' : 'it'}: ;go2 ${found!.target}. Type ;k go2 to stop.`}>Go ▸</button>
          )
        })()}
       </div>
      </div>

      {/* The world needs the match. With no Genie maps at all, or a failed
          match, the Genie view is shown: it has the setup screen, and it still
          works as a plain map. */}
      {showing === 'world' && graph
        ? <GraphWorldView world={graph.world} layers={prefs.world} hereZoneId={exact?.zone.id ?? lastZoneRef.current}
            lit={found?.perZone ?? null} litLabel={thing ? thing.name : undefined}
            onOpenZone={zoneId => { setAsk(a => ({ zoneId, seq: (a?.seq ?? 0) + 1 })); patch({ level: 'zone' }) }} />
        : showing === 'matching'
          ? <div className="map-canvas-wrap"><div className="map-overlay"><span className="map-loading">Matching the Genie maps to Lich's map…</span></div></div>
          : <GenieMapView {...genie} overlay={overlay} />}

      {/* No footer over the setup screen (no Genie maps yet): it speaks for itself. */}
      {hasMaps && (
        <div className="gx-footer">
          <span className="gx-foot-main">
            {footerPlace && <span className="gx-foot-place">{footerPlace}</span>}
            {footerPlace && status && <span className="gx-foot-sep" aria-hidden="true">·</span>}
            {status}
          </span>
          {/* A Genie walk in progress: status, so the footer and not the bar. */}
          {walker?.status && (
            <span className="gx-foot-walk">
              <span className="genie-walk-status"
                title={`Walking to ${walker.status.label}. Each step waits for the game to show the next room.`}>
                <span className="genie-walk-label">→ {walker.status.label}</span>
                <span className="genie-walk-count">{walker.status.done}/{walker.status.total}</span>
              </span>
              <button className="map-btn map-btn--sm" onClick={walker.stop} title="Stop the walk">■</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
})
