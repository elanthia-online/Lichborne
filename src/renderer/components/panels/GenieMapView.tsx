// Genie Maps view — the SVG graph renderer behind MapPanel's "Genie Maps" mode.
// Draws one zone at a time at the hand-curated coordinates in the Genie XML
// (no auto-layout, no BFS placement, no zone stitching), with Genie's own
// rendering rules mirrored from MapForm.cs (8×8 rects CENTRED on the XML
// position, arcs through the position, labels at +1/+1). MapPanel owns the
// parsed `zones`; this component owns view state (zone, level, pan/zoom) and
// the current-room MATCH. It is a big file, so the orientation lives in its
// `// ──` section comments — this header is the index:
//
//   • "Genie Map view" — the original design note. Its "title alone, no
//     description disambig" paragraph is HISTORY; the resolver below is the
//     live behaviour.
//   • "Exit-set matching" + "Current-room resolver (pure, testable)" — the
//     matching signals. Genie data carries NO game room ids, so identity is
//     TITLE (the candidate pool) + DESCRIPTION + EXIT-SET + graph adjacency,
//     mirroring GenieMaps' own `Node.Compare`. `resolveGenieRoom` is a pure
//     module-level function; ONE effect in the component owns the breadcrumb
//     (`prevLocationRef`) and the cross-zone hold counter (`staleCountRef`),
//     writes the BREADCRUMB back to MapPanel's `persist` so a view switch
//     doesn't lose it (the hold counter is deliberately NOT persisted — it
//     starts fresh on remount), and is idempotency-gated for StrictMode.
//     Exits are ADDITIVE,
//     never a pre-filter (pitfall #70 — read it before touching the ladder).
//   • "BFS over Genie arcs within a zone" / "Click-to-walk" — left-click PINS
//     a path (or, on a cross-zone stub, switches zone); right-click WALKS via
//     `sendWalkPath`, one command per `WALK_STEP_MS`. Handlers in the node
//     layer's deps read their inputs from `walkCtxRef` so their identities
//     stay stable and the whole-zone `nodeRects` memo holds.
//   • "Fit-to-view + center-on-current" / "Pan / zoom" — the follow camera is
//     a `useLayoutEffect` (same paint frame as the indicator's new position);
//     `snapTransform` drops the glide for big jumps; a `ResizeObserver`
//     recentres when a hidden (0×0) tab regains its size.
//   • "Memoized SVG layers" — every hook MUST sit above the "Render guards"
//     early returns (hook order is load-bearing, React #310). Per-colour
//     category effects render only while `showEffects` (still + animations
//     on) and only for the `EFFECT_CAP` nearest rooms; the pan group wears
//     ONE of two freeze classes — `genie-anim-off` (setting off) or
//     `genie-pan-dragging` (drag / motion / zoom).
import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import type { GenieZone, GenieNode } from './mapTypes'
import { noteAliases, COLOR_LEGEND, normalizeDesc, normalizeMatchKey } from './mapTypes'

// ── Genie Map view ────────────────────────────────────────────────────────────
//
// Frostbite/Genie-style map rendering. One zone visible at a time. Rooms are
// drawn at the (x, y) coords stored directly in the Genie XML — no auto-
// layout, no BFS, no zone stitching. The Genie maps team has hand-curated the
// spatial layout; we trust it as authoritative.
//
// Data flow:
//   MapPanel parses every *.xml from the user's Genie maps folder into
//   GenieZone objects, stores them in a Map keyed by zone id, and passes the
//   Map here as a prop. This component owns view state (current zone, level,
//   pan/zoom) but not the data itself.
//
// Current-room highlight:
//   Match Lich's current room title against every Genie node's `name`. When
//   we find a match (and the player is now in a different zone than the one
//   displayed), auto-switch zones. Title alone, no description disambig — the
//   simplest path that works for the 95% case. Refinement later if needed.
//
// Click-to-walk:
//   BFS over Genie arcs within the current zone from the player's node to
//   the clicked node. Collects each arc's `move` command and sends them
//   sequentially. Cross-zone walks are out of scope for v1; clicking a
//   cross-zone exit just switches the visible zone.

// Panel-font anchor for the map's READING surfaces (hover tooltip, legend) —
// the per-panel A+/A− chain with the global game font as fallback (pitfall
// #58). ×0.9 keeps them a touch smaller than game text (≈11px at default 12).
// SVG node GLYPHS (↗, tool markers) deliberately stay geometry-sized.
const PANEL_FONT = 'calc(var(--panel-font-size, var(--game-font-size, 12px)) * 0.9)'

interface Props {
  zones:        Map<string, GenieZone>     // zoneId → GenieZone
  roomTitle:    string                      // current Lich room title
  roomDesc?:    string                      // current Lich room description — disambiguates title collisions
  roomExits?:   string[]                    // live compass tokens ('e','nw',…) — exit-set discriminator (mirrors Genie's Node.Compare)
  onSendCommand: (cmd: string) => void
  /** Survives the Lich/Genie view switch, which unmounts this component.
   *  Owned by MapPanel (one per character — never share across sessions);
   *  mutated in place, so writing to it never triggers a render. */
  persist?: { zoneId: string; level: number; prev: GenieMatch | null }
  // Genie folder picker — surfaced inline so the view is usable standalone
  // when no folder is configured yet.
  genieMapsDir:        string
  genieLoading:        boolean
  genieReady:          boolean
  genieProgress:       { loaded: number; total: number } | null
  onPickGenieFolder:   () => void
  onClearGenieFolder:  () => void
  // Genie Map Animations toggle (Settings). When false the map
  // permanently wears the drag/walk animation-pause AND the camera
  // glide is disabled (snaps instead). One switch for all map motion.
  mapAnimations?:      boolean
}

interface Transform { x: number; y: number; scale: number }

const MIN_SCALE = 0.2
const MAX_SCALE = 6
// Node rect width/height in Genie pixel space. Genie uses 8×8 rects
// (MapForm.cs:1767 — `DrawRectangle(borderPen, oWhere.X, oWhere.Y,
// 8 * m_Scale, 8 * m_Scale)`). The critical detail — verified against
// Genie's `ConvertPoint(n.Position, 4 * m_Scale)` (MapForm.cs:187–193)
// which SUBTRACTS the offset — is that the rect is CENTERED on the XML
// position, not top-left anchored. So the rect spans
// `(pos − 4, pos − 4)` to `(pos + 4, pos + 4)`. The Genie maps team
// places labels and arc endpoints assuming this center anchoring; getting
// it wrong shifts every node down-right by 4px and visibly misaligns
// labels against their clusters (Binu: "the B of Bundles is too far
// behind the room").
//
// Arcs in Genie are `DrawLine(pen, ConvertPoint(a.Position),
// ConvertPoint(b.Position))` — they go directly through the XML
// position, which is the rect center. So arc endpoints are `(node.x,
// node.y)`, NOT `(node.x + radius, node.y + radius)`.
const NODE_SIZE = 8
const NODE_RADIUS = NODE_SIZE / 2

// Label glyph offset. Genie's label drawing (MapForm.cs:1901–1924) sets
// the rect top-left at `(position.X, position.Y)` and then calls
// `DrawString(text, font, brush, r.X + 1, r.Y + 1)` — a 1px inset that
// pushes the visible glyph slightly inside its bounding rect. We mirror
// the +1 here so labels sit where Genie draws them at its reference
// font scale.
const LABEL_X_NUDGE = 1
const LABEL_Y_NUDGE = 1
const WALK_STEP_MS = 600        // delay between sequenced walk commands

// Arc color categories — mirrors Genie's logic in Mapper/MapForm.cs:
//   - "climb" exits get their own color (lineclimb).
//   - "go" + "up"/"down"/"out" share a color (linego) — typically doors,
//     portals, or vertical traversal you can't see a line for naturally.
//   - everything else (cardinals + diagonals) gets the default line color.
type ArcCategory = 'cardinal' | 'climb' | 'go'

function classifyArc(exit: string): ArcCategory {
  const e = exit.toLowerCase().trim()
  if (e === 'climb') return 'climb'
  if (e === 'go' || e === 'up' || e === 'down' || e === 'out') return 'go'
  return 'cardinal'
}

const ARC_COLOR_VAR: Record<ArcCategory, string> = {
  cardinal: 'var(--map-arc-cardinal, #888)',
  climb:    'var(--map-arc-vertical, #d4a574)',
  go:       'var(--map-arc-special, #ffb74d)',
}

// ── Exit-set matching (mirrors Genie's Node.Compare) ──────────────────────────
//
// The real GenieMaps client identifies a room by NAME + EXIT-SET + DESCRIPTION
// together (NodeList.cs `Node.Compare` / `CardinalCount`). The exit set is a
// strong, always-fresh discriminator that survives a stale/empty description
// while the player is running — exactly the signal Lichborne was missing, which
// let ambiguous same-titled rooms (40+ "Whistling Wood, Barrows" nodes) resolve
// to file order. Genie counts every arc as part of room identity EXCEPT `go`
// and `climb` (non-directional named moves) — so up/down/out DO count.
//
// Genie XML stores full-word exits ("northwest"); Lichborne's live compass uses
// abbreviations ("nw", "dn"). Canonicalize both to one token form.
const EXIT_CANON: Record<string, string> = {
  north: 'n',  n: 'n',
  northeast: 'ne', ne: 'ne',
  east: 'e',   e: 'e',
  southeast: 'se', se: 'se',
  south: 's',  s: 's',
  southwest: 'sw', sw: 'sw',
  west: 'w',   w: 'w',
  northwest: 'nw', nw: 'nw',
  up: 'up',    u: 'up',
  down: 'dn',  dn: 'dn', d: 'dn',
  out: 'out',
}

// A Genie node's directional-exit set (excludes go/climb — they don't
// participate in room identity, matching CardinalCount).
function cardinalExitSet(node: GenieNode): Set<string> {
  const s = new Set<string>()
  for (const a of node.arcs) {
    const e = a.exit.toLowerCase().trim()
    if (e === 'go' || e === 'climb') continue
    const c = EXIT_CANON[e]
    if (c) s.add(c)
  }
  return s
}

// The live room's directional-exit set from the compass tokens.
function liveExitSet(roomExits: string[] | undefined): Set<string> {
  const s = new Set<string>()
  for (const raw of roomExits ?? []) {
    const c = EXIT_CANON[raw.toLowerCase().trim()]
    if (c) s.add(c)
  }
  return s
}

function exitsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

// a ⊇ b — node has at least every live exit (tolerates a Genie map that lists
// an extra exit the live room hasn't surfaced yet).
function exitsSuperset(a: Set<string>, b: Set<string>): boolean {
  for (const x of b) if (!a.has(x)) return false
  return true
}

// ── Current-room resolver (pure, testable) ────────────────────────────────────
//
// A title-matched Genie candidate. `isStub` marks cross-zone boundary markers
// so the resolver can prefer real rooms.
export type GenieMatch = { zone: GenieZone; node: GenieNode; isStub: boolean }

// A node is a cross-zone stub if any of its `note` aliases points at another
// zone's .xml file. Pure — only depends on the node.
function isStubNodeFn(n: GenieNode): boolean {
  return noteAliases(n.note).some(a => a.toLowerCase().endsWith('.xml'))
}

// B110: how many consecutive different-zone-but-low-confidence titles we hold
// the breadcrumb through before conceding the player really moved. Three room
// titles in a row all wanting the same other zone is strong evidence of a real
// move, not a parser glitch.
const STALE_ZONE_ESCAPE = 3

// Resolve the player's current room from a title-matched candidate pool, the
// way GenieMaps' own client does (NAME already applied to build `pool`; here we
// disambiguate by DESCRIPTION + EXIT-SET + graph ADJACENCY — NodeList.cs
// `Node.Compare`). This is a PURE function: same inputs → same outputs, no refs,
// no side effects. The caller persists `prev` (last match) and `staleCount`
// (cross-zone hold counter) and threads them back in. Returns the resolved
// match (or null when the pool is empty) plus the next `staleCount`.
//
// Design rules learned the hard way (see pitfall #70):
//  - EXITS ARE ADDITIVE, never a pre-filter before adjacency. Genie maps can
//    have imperfect exit data for a room and DR's live exits can lag a frame;
//    pre-filtering by exits excluded the correct neighbour and broke adjacency
//    that worked before exits existed. `exitMatched` only picks the best blind
//    guess and corroborates a cross-zone move.
//  - The cross-zone hold is EXIT-AWARE: it commits to the new zone immediately
//    when the guess is exit-corroborated OR when `prev`'s own exits no longer
//    match the live exits (so `prev` provably isn't where we are), and only
//    holds `prev` when exits are unknown or still consistent — otherwise it
//    stranded the marker on recall/teleport/walk-through-unmapped.
function resolveGenieRoom(
  pool:               GenieMatch[],
  normDesc:           string,                  // already normalizeDesc()'d ('' if none)
  liveExits:          Set<string>,             // canonical live exit set (empty if unknown)
  prev:               GenieMatch | null,
  sourceFileToZoneId: Map<string, string>,
  staleCount:         number,
): { match: GenieMatch | null; staleCount: number } {
  if (pool.length === 0) return { match: null, staleCount: 0 }
  if (pool.length === 1) return { match: pool[0], staleCount: 0 }

  // (1) Description EXACT, unique — Genie's authoritative test. With the inline
  // <preset id='roomDesc'> now captured into roomState.desc this resolves the
  // common case immediately. Commit only when exactly one node carries it.
  if (normDesc) {
    const hits = pool.filter(c => c.node.descriptions.some(d => normalizeDesc(d) === normDesc))
    if (hits.length === 1) return { match: hits[0], staleCount: 0 }
  }

  // (2) Exit-set EQUALITY, unique — strong, always-fresh signal that survives a
  // stale description while the player runs.
  if (liveExits.size > 0) {
    const hits = pool.filter(c => exitsEqual(cardinalExitSet(c.node), liveExits))
    if (hits.length === 1) return { match: hits[0], staleCount: 0 }
  }

  // (3) Description SUBSTRING, unique — Genie's stored descriptions are routinely
  // a truncation of the live look; accept containment either way when it
  // resolves to exactly one candidate and both strings are ≥24 chars (B148/B150).
  if (normDesc && normDesc.length >= 24) {
    const hits = pool.filter(c => c.node.descriptions.some(d => {
      const dn = normalizeDesc(d)
      return dn.length >= 24 && (dn.includes(normDesc) || normDesc.includes(dn))
    }))
    if (hits.length === 1) return { match: hits[0], staleCount: 0 }
  }

  // Exit-matched candidates — ADDITIVE only (best guess + cross-zone
  // corroboration). Prefer exact equality, else superset of the live exits.
  const exitMatched = liveExits.size > 0
    ? (() => {
        const eq = pool.filter(c => exitsEqual(cardinalExitSet(c.node), liveExits))
        return eq.length > 0 ? eq : pool.filter(c => exitsSuperset(cardinalExitSet(c.node), liveExits))
      })()
    : []

  // (4) Graph adjacency over the FULL pool — you walked here from `prev`, so this
  // room must be a neighbour of it. Prefer a neighbour whose exits also match.
  if (prev) {
    const sameZoneAdj = pool.filter(c =>
      c.zone === prev.zone && (
        prev.node.arcs.some(a => a.destination === c.node.id) ||
        c.node.arcs.some(a => a.destination === prev.node.id)
      ))
    if (sameZoneAdj.length > 0) {
      const best = sameZoneAdj.find(c => exitMatched.includes(c)) ?? sameZoneAdj[0]
      return { match: best, staleCount: 0 }
    }
    // Cross-zone adjacency via stubs — you walked across a Genie-mapped boundary.
    const crossAdj = pool.find(c => {
      if (c.zone === prev.zone) return false
      return prev.node.arcs.some(arc => {
        const dest = prev.zone.nodes.find(n => n.id === arc.destination)
        if (!dest || !isStubNodeFn(dest)) return false
        const stubXml = noteAliases(dest.note).find(a => a.toLowerCase().endsWith('.xml'))
        if (!stubXml) return false
        return sourceFileToZoneId.get(stubXml.toLowerCase()) === c.zone.id
      })
    })
    if (crossAdj) return { match: crossAdj, staleCount: 0 }
  }

  // Best blind guess: an exit-matched node if we have one, else file order.
  const guess = exitMatched.length > 0 ? exitMatched[0] : pool[0]

  // (5) Exit-aware conservative cross-zone hold (B110).
  if (prev && guess.zone !== prev.zone) {
    const liveKnown          = liveExits.size > 0
    const guessCorroborated  = liveKnown && exitsSuperset(cardinalExitSet(guess.node), liveExits)
    const prevStillPlausible = !liveKnown || exitsSuperset(cardinalExitSet(prev.node), liveExits)
    if (guessCorroborated || !prevStillPlausible) return { match: guess, staleCount: 0 }
    if (staleCount >= STALE_ZONE_ESCAPE)           return { match: guess, staleCount: 0 }
    return { match: prev, staleCount: staleCount + 1 }
  }
  return { match: guess, staleCount: 0 }
}

// Visual-effect categorization for COLOR_LEGEND nodes. All recognized
// colors get a translucent aura behind their rect; subsets get additional
// animated effects that reinforce the room's category. Each effect family
// is implemented as a CSS keyframe (see map-panel.css) so the animation
// itself is GPU-composited and the only React work is rendering 1-4 extra
// SVG elements per affected node.
//
// Mote effect — the magical 4 share a "small drifting circles" structure
// but each gets its own motion motif: vortex (Transport), outward drift
// (Shrine), slow rise (Favor Altar), fast rise (Stat Training).
type MoteEffect = 'vortex' | 'drift' | 'rise-slow' | 'rise-fast'
const MOTE_EFFECTS: Record<string, MoteEffect> = {
  '#FF00FF': 'vortex',     // Transport — magical portal (rotating)
  '#A6A3D9': 'drift',      // Shrine — sacred (outward NSEW)
  '#800080': 'rise-slow',  // Favor Altar — divine (offerings rising)
  '#FFFF00': 'rise-fast',  // Stat Training — effort climbing (faster)
}

const HEARTBEAT_COLORS = new Set<string>([
  '#00BF80', // Auto-Healer — lub-dub medical pulse
])
const COIN_GLINT_COLORS = new Set<string>([
  '#FF0000', // Shop — gold catching the light along the border
])
const RIPPLE_COLORS = new Set<string>([
  '#0000FF', // Water — concentric rings expanding outward
])
const BUBBLE_COLORS = new Set<string>([
  '#000080', // Underwater — small bubbles drift upward and pop
])

// Tier 3B — hazard / utility effects.
const CAUTION_COLORS = new Set<string>([
  '#FFBF00', // Obstacle — slow blink, warning beacon
])
const IMPLODE_COLORS = new Set<string>([
  '#400040', // Depart — inward-shrinking ring, somber finality
])
const XP_RISE_COLORS = new Set<string>([
  '#FF8000', // Guildleader — rising gold particles, "level up here"
])
const LEAF_FALL_COLORS = new Set<string>([
  '#008000', // Lumberjacking — green leaves drift down from below the node
])
const DIRT_FALL_COLORS = new Set<string>([
  '#993300', // Mining — brown dirt/rubble falls straight down from below the node
  '#C2B280', // Ranger Trailhead — same falling motion, sandy tan particle color
])
// Per-room particle color for dirt-fall. Mining uses a warm rusty
// brown (visible against the dark map background); Trailhead uses
// lighter sandy tan (trail dust). Same keyframe, different colors so
// each category keeps a distinct visual identity. The original
// Mining color (#4a2810) was so dark it disappeared against the
// dark map background — testers couldn't see the falling particles
// on mining rooms at all. Lifted to a brighter rusty-brown so the
// dirt actually reads as falling debris.
function dirtParticleColor(roomColor: string): string {
  return roomColor === '#C2B280' ? '#a08858' : '#b06030'
}

// Mote contrast color — picks a mote fill that contrasts with the
// room's own color regardless of whether that color is light or dark.
// Earlier we always pulled toward white, which worked for Transport
// (fuchsia) and Favor Altar (purple) but made the motes nearly
// invisible on light backgrounds like Shrine (periwinkle) and Stat
// Training (yellow). Now we measure relative luminance — light
// backgrounds mix toward dark, dark backgrounds mix toward white —
// so every magical category has high mote-to-background contrast.
// Falls back gracefully for unrecognized hex strings (returns the
// input as-is so SVG fill still works).
function getMoteContrastColor(hex: string): string {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) return hex
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  // Standard ITU-R BT.601 luminance — good enough for "light vs dark"
  // decisions on saturated UI colors; we don't need sRGB linear math.
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 0.5
    ? `color-mix(in srgb, ${hex} 35%, #1a1a1a)`  // light bg → dark motes
    : `color-mix(in srgb, ${hex} 25%, #ffffff)`  // dark bg → light motes
}

// Tool glyphs — small centered icon rendered on the rect for gathering
// rooms. The trailing U+FE0E ("text variation selector") forces text
// presentation in browsers that might otherwise render these as colored
// emoji. Stubs always win — a stub-AND-mining room shows ↗, not the
// pickaxe, because the cross-zone identity is more important than the
// resource category.
const TOOL_GLYPHS: Record<string, string> = {
  '#993300': '⛏︎', // Mining — pickaxe (U+26CF)
  '#008000': '🪓︎', // Lumberjacking — axe (U+1FA93)
}

// Aura modifiers — applied as a class on the aura rect itself,
// modulating its opacity / position rather than spawning new elements.
const AURA_FIRE_COLORS = new Set<string>([
  '#00FF00', // Interesting Room — irregular flicker on the aura, like
            //                     the room glows with firelight.
            //                     Rooms in this set also get a slightly
            //                     larger aura (auraScale = 1.3× vs the
            //                     default 1.125×) so the flicker has
            //                     more diffuse area to glow through.
])
// Categories that get a stronger static aura without animation. The
// extra weight just reads as "this room matters" without competing
// with the animated categories.
const AURA_INTENSIFIED_COLORS = new Set<string>([
  '#FF8000', // Guildleader — formal, strong steady glow
])
// Player Housing (#00FFFF, aqua) and Ranger Trailhead (#C2B280, sand) are
// intentionally absent from every modifier set — they keep the plain default
// aura. Housing rooms are everywhere, so a flicker on each was visual noise.

// Stable empty-node array — the `nearbyNodes` memo returns this exact ref when
// effects are off so the downstream effect memos see an unchanged dep and skip
// recomputation entirely.
const EMPTY_NODES: GenieNode[] = []

// Backstop cap on how many rooms animate at once. A dense zone (the Crossing)
// has 100+ colored rooms; animating every one is ~hundreds of SVG elements all
// forcing Recalculate Style every frame (profiling: ~29% of frame budget idle
// in town). Effects are normally viewport-culled (see `nearbyNodes`); this cap
// only bites when the player is zoomed far enough out that more than this many
// rooms are on screen at once — at which point the effects are tiny specks
// anyway, so showing the EFFECT_CAP nearest the viewport centre is plenty.
const EFFECT_CAP = 30

// ── BFS over Genie arcs within a zone ──────────────────────────────────────
// Returns a list of `move` commands from `fromId` to `toId`, or [] if no
// path exists within the zone. Skips:
//   - cross-zone arcs (destination not in this zone) — require Lich-side
//     navigation that v1 doesn't hook up
//   - arcs with empty `move` commands — would result in `sendCommand('')`
//     hitting the game socket as a bare newline, which is a real game-text
//     glitch. Malformed XML or missing `move=` attributes can produce these.
function bfsZonePath(zone: GenieZone, fromId: number, toId: number): string[] {
  if (fromId === toId) return []
  const nodes = new Map(zone.nodes.map(n => [n.id, n]))
  const visited = new Set<number>([fromId])
  const queue: { id: number; path: string[] }[] = [{ id: fromId, path: [] }]
  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    const node = nodes.get(id)
    if (!node) continue
    for (const arc of node.arcs) {
      const dest = arc.destination
      if (visited.has(dest)) continue
      if (!nodes.has(dest)) continue
      if (!arc.move || !arc.move.trim()) continue   // skip empty moves
      const newPath = [...path, arc.move]
      if (dest === toId) return newPath
      visited.add(dest)
      queue.push({ id: dest, path: newPath })
    }
  }
  return []
}

// Same BFS shape, but returns the sequence of room IDs visited rather
// than the move commands. Used by the hover-path-preview overlay so we
// can draw line segments between consecutive rooms on the route. Kept
// separate from `bfsZonePath` for clarity — the cost of running BFS
// twice (once for preview, once on click) is trivial vs. the
// readability cost of multiplexing one function over two return shapes.
function bfsZoneRoomPath(zone: GenieZone, fromId: number, toId: number): number[] {
  if (fromId === toId) return []
  const nodes = new Map(zone.nodes.map(n => [n.id, n]))
  const visited = new Set<number>([fromId])
  const queue: { id: number; path: number[] }[] = [{ id: fromId, path: [fromId] }]
  while (queue.length > 0) {
    const { id, path } = queue.shift()!
    const node = nodes.get(id)
    if (!node) continue
    for (const arc of node.arcs) {
      const dest = arc.destination
      if (visited.has(dest)) continue
      if (!nodes.has(dest)) continue
      if (!arc.move || !arc.move.trim()) continue
      const newPath = [...path, dest]
      if (dest === toId) return newPath
      visited.add(dest)
      queue.push({ id: dest, path: newPath })
    }
  }
  return []
}

export default function GenieMapView({
  zones, roomTitle, roomDesc = '', roomExits, onSendCommand,
  genieMapsDir, genieLoading, genieReady, genieProgress,
  onPickGenieFolder, onClearGenieFolder, mapAnimations = true, persist,
}: Props) {
  // SEEDED FROM MapPanel's persist ref, not from nothing. Switching to the Lich
  // map UNMOUNTS this view (MapPanel renders it conditionally), so a fresh
  // mount used to lose both the displayed zone and — worse — the resolver's
  // breadcrumb. With no breadcrumb, tiers 5/5b/6 of resolveGenieRoom have
  // nothing to walk from, so an ambiguous same-titled room can resolve to
  // null; `currentLocation` then stays null, the auto-switch below never
  // fires, and the view sits on "N zones loaded · waiting for game data"
  // indefinitely, because the resolve effect only re-runs when pool / desc /
  // exits change and none of those move between same-titled rooms. Sekmeht hit
  // exactly that: Genie → Lich map → back → stuck until a manual zone pick.
  //
  // MapPanel outlives the switch, so it holds the state and we seed from it.
  // Deliberately NOT solved by keeping this view permanently mounted: that
  // would add ~1000 SVG nodes per CHARACTER for anyone parked on the Lich map.
  const [currentZoneId, setCurrentZoneId] = useState<string>(() => persist?.zoneId ?? '')
  const [currentLevel,  setCurrentLevel]  = useState<number>(() => persist?.level ?? 0)
  const [transform,     setTransform]     = useState<Transform>({ x: 0, y: 0, scale: 1 })
  // Tracks the transform we last painted with, so we can detect a
  // large jump (zone switch via stub, ◆ from far away, fit-to-view)
  // and SNAP rather than letting the 150ms transition "race across"
  // the screen. Per-walk-step deltas are tiny (one room ≈ 8px world
  // units × scale) so they stay under the threshold and keep smooth.
  const prevTransformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  useEffect(() => { prevTransformRef.current = transform }, [transform])
  // Tracks the indicator's previous WORLD position. `snapTransform`
  // above only sees the pan delta — when follow is OFF (the user is
  // browsing) the pan doesn't move, so a teleport / cross-cluster
  // jump would leave the indicator transitioning ("racing") across
  // the static map. This ref lets the indicator snap on its own
  // large jumps regardless of follow state.
  const prevIndicatorPosRef = useRef<{ x: number; y: number } | null>(null)
  const [selectedId,    setSelectedId]    = useState<number | null>(null)
  const [hoveredId,     setHoveredId]     = useState<number | null>(null)
  const [tooltipPos,    setTooltipPos]    = useState<{ x: number; y: number } | null>(null)
  const [walking,       setWalking]       = useState(false)
  const [isDragging,    setIsDragging]    = useState(false)
  const [showLegend,    setShowLegend]    = useState(false)
  // Follow mode: when true, the camera keeps the current room centered
  // on every walk. Turned off automatically when the user manually pans
  // or zooms (so the map doesn't fight them), turned back on by the ◆
  // "Center on me" button. Genie / Frostbite use the same model. The
  // previous margin-snap logic caused visible quivering at high walk
  // rates because each step snapped the camera to the safe-zone edge,
  // creating a vibration at the boundary; always-centering removes that
  // because the camera delta exactly matches the player's world delta.
  const [followPlayer, setFollowPlayer] = useState(true)
  // Active-motion flag — true while the player is actively walking
  // (any currentLocation change within the last MOTION_QUIET_MS). The
  // pan group applies the `genie-pan-dragging` class while this is
  // true, pausing all category animations on descendants. Performance
  // profiling showed walking across a populated zone burned ~16% of
  // frame budget on Recalculate Style for the continuously-running
  // animations even though the user wasn't dragging — pausing during
  // motion frees that budget for React reconciliation + camera follow.
  const [inMotion, setInMotion] = useState(false)
  const motionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirror of `inMotion` for the stable (empty-dep) hover callbacks — they
  // must not re-create on every motion toggle or `nodeRects` would rebuild.
  const inMotionRef = useRef(false)
  const svgRef    = useRef<SVGSVGElement | null>(null)
  const dragRef   = useRef<{ ox: number; oy: number; tx: number; ty: number } | null>(null)
  const walkTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cleanup any in-flight walk timers on unmount or zone change.
  useEffect(() => () => walkTimers.current.forEach(clearTimeout), [])
  useEffect(() => {
    walkTimers.current.forEach(clearTimeout)
    walkTimers.current = []
    setWalking(false)
    // Also clear UI selection state — without this, a node id selected
    // in zone A keeps its gold outline if zone B happens to have a node
    // with the same numeric id (very common across zones since ids are
    // per-file). Same for hover state, which would otherwise show a
    // stale tooltip until the next mouse move.
    setSelectedId(null)
    setHoveredId(null)
    setTooltipPos(null)
  }, [currentZoneId])

  // Mirror the displayed zone/level into MapPanel so they survive the view
  // switch that unmounts us. Its OWN effect on purpose: folding it into the
  // zone-change cleanup above would have added `currentLevel` to that effect's
  // deps, and a level change would then clear walk timers mid-walk.
  useEffect(() => {
    if (persist) { persist.zoneId = currentZoneId; persist.level = currentLevel }
  }, [currentZoneId, currentLevel, persist])

  // UI hover/selection reset on level change. Selection or hover may
  // point to a room that's no longer visible on the new floor; if that
  // floor happens to have a different room with the same numeric id,
  // the glow silently jumps to that unrelated room. Walk timers are
  // intentionally NOT cleared here — click-to-walk paths can include
  // up/down arcs, so a legitimate walk crosses levels mid-sequence.
  useEffect(() => {
    setSelectedId(null)
    setHoveredId(null)
    setTooltipPos(null)
  }, [currentLevel])

  // ── Stub-aware lookup helpers ────────────────────────────────────────────
  //
  // A "stub" is a 1-room cross-zone marker — the Genie map convention is to
  // include a single node in zone A representing where you'd enter zone B,
  // with `note` pointing to zone B's .xml filename (e.g. Fang Cove has a
  // "Shard, East Bridge" node with note="Map66_STR3.xml"). The real Shard
  // room lives in Shard's own XML; the Fang Cove node is just a marker.
  // We must prefer real rooms over stubs when matching the player's title,
  // otherwise the view sticks on the wrong zone.
  const isStubNode = useCallback((n: GenieNode) => isStubNodeFn(n), [])

  // Resolve a stub's .xml note to the target zone, if loaded. Used by the
  // stub-click handler to switch zones.
  const sourceFileToZoneId = useMemo(() => {
    const m = new Map<string, string>()
    for (const zone of zones.values()) {
      if (zone.sourceFile) m.set(zone.sourceFile.toLowerCase(), zone.id)
    }
    return m
  }, [zones])

  // Indexed title → candidates. Built once per zones change so the per-walk
  // match cost is O(1) instead of O(zones × nodes). Each value preserves
  // stub-ness so the consumer can prefer real rooms.
  //
  // Two indexes built in lockstep:
  //   - `byTitle`: exact-case Lich title → candidates
  //   - `byNormalized`: normalizeMatchKey(title) → candidates
  // The Lich title and the Genie node `name` frequently disagree on
  // bracket-stripping, leading/trailing whitespace, or case (Lich
  // `"[Bank]"` vs Genie `"Bank"`). MapPanel's `findRoom` uses both
  // indexes for the same reason; GenieMapView needs the same fallback
  // or stylistic mismatches make whole clusters invisible to the "you
  // are here" marker.
  const titleLookup = useMemo(() => {
    const byTitle      = new Map<string, GenieMatch[]>()
    const byNormalized = new Map<string, GenieMatch[]>()
    const push = (m: Map<string, GenieMatch[]>, k: string, v: GenieMatch) => {
      if (!k) return
      const arr = m.get(k) ?? []
      arr.push(v)
      m.set(k, arr)
    }
    for (const zone of zones.values()) {
      for (const node of zone.nodes) {
        const stub = isStubNode(node)
        const entry: GenieMatch = { zone, node, isStub: stub }
        // Index by the canonical name plus any non-.xml aliases.
        const keys: string[] = [node.name]
        for (const a of noteAliases(node.note)) {
          if (!a.toLowerCase().endsWith('.xml')) keys.push(a)
        }
        for (const k of keys) {
          push(byTitle, k, entry)
          push(byNormalized, normalizeMatchKey(k), entry)
        }
      }
    }
    return { byTitle, byNormalized }
  }, [zones, isStubNode])

  // Match the current Lich room title to a Genie node. Many zones reuse
  // the same title across many rooms (e.g. Shard has SEVEN rooms titled
  // "Shard, Moonstone Street" — #78–#85). Title-only lookup makes the
  // "here" marker stick on whichever was indexed first while the player
  // actually walks east through #79, #80, etc. Use the room description
  // as a tiebreaker — Genie's own findRoom helper in mapTypes.ts does
  // the same. Prefer non-stub matches in either case so cross-zone
  // marker nodes never win.
  //
  // Build the title-matched candidate pool (PURE memo). The resolver
  // (resolveGenieRoom, module-level) disambiguates within it by desc + exits +
  // adjacency. Prefer non-stub matches so cross-zone boundary markers never win.
  const pool = useMemo<GenieMatch[]>(() => {
    if (!roomTitle) return []
    const target = roomTitle.trim()
    // MERGE both lookups before non-stub filtering, otherwise the
    // exact-case lookup can return ONLY stubs (e.g., a stub in the
    // previous zone pointing to the real room's zone), the "is empty?"
    // check fails so the normalized lookup never runs, and we pick
    // the stub — which lives in the WRONG zone. This caused the
    // "marker stuck at Segoltha while player is in the Crossing" bug:
    // the title matched a Segoltha stub exactly but the real Crossing
    // room was only reachable through the normalized form.
    //
    // De-dupe by Entry identity (same object can appear under both
    // exact-case and normalized keys when the title has no drift).
    const byTitleHits = titleLookup.byTitle.get(target) ?? []
    const byNormHits  = titleLookup.byNormalized.get(normalizeMatchKey(target)) ?? []
    const seen = new Set<typeof byTitleHits[number]>()
    const candidates: typeof byTitleHits = []
    for (const c of byTitleHits) { if (!seen.has(c)) { seen.add(c); candidates.push(c) } }
    for (const c of byNormHits)  { if (!seen.has(c)) { seen.add(c); candidates.push(c) } }
    if (candidates.length === 0) return []
    const nonStubs = candidates.filter(c => !c.isStub)
    return nonStubs.length > 0 ? nonStubs : candidates
  }, [titleLookup, roomTitle])

  // Current location is resolved by a PURE function (resolveGenieRoom) driven
  // from a SINGLE effect — not the old impure memo that mutated refs as it
  // computed (which double-counted under StrictMode's double-invoke and made the
  // cross-zone hold behave differently in dev vs packaged builds). The breadcrumb
  // (`prevLocationRef`) and the cross-zone hold counter (`staleCountRef`) are
  // advanced in exactly ONE place here, deterministically, after the resolve.
  const [currentLocation, setCurrentLocation] = useState<GenieMatch | null>(() => persist?.prev ?? null)
  // Seeded too — this is the breadcrumb the resolution ladder walks from, and
  // losing it across a view switch is what left the map unrecoverable.
  const prevLocationRef = useRef<GenieMatch | null>(persist?.prev ?? null)
  const staleCountRef   = useRef(0)
  // Idempotency gate: StrictMode invokes effects twice on mount, and the effect
  // mutates refs — without this the breadcrumb / stale counter would advance
  // twice for one room. Re-resolve only when an input actually changed (pool
  // identity, desc, or exits). pool/desc/exits all derive from the same
  // roomState, so they're coherent per render.
  const lastResolveRef = useRef<{ pool: GenieMatch[]; desc: string; exits: string } | null>(null)
  useEffect(() => {
    const exitsKey = (roomExits ?? []).join(',')
    const last = lastResolveRef.current
    if (last && last.pool === pool && last.desc === roomDesc && last.exits === exitsKey) return
    lastResolveRef.current = { pool, desc: roomDesc, exits: exitsKey }
    const { match, staleCount } = resolveGenieRoom(
      pool,
      normalizeDesc(roomDesc),
      liveExitSet(roomExits),
      prevLocationRef.current,
      sourceFileToZoneId,
      staleCountRef.current,
    )
    staleCountRef.current = staleCount
    // Advance the breadcrumb only on a real (non-null) match so a transient
    // unmatched title (unmapped zone) doesn't wipe it.
    if (match) prevLocationRef.current = match
    if (match && persist) persist.prev = match
    setCurrentLocation(curr => (curr === match ? curr : match))
  }, [pool, roomDesc, roomExits, sourceFileToZoneId, persist])

  // SELF-HEAL. Two ways the displayed zone can end up pointing at nothing: a
  // fresh mount before the first resolve lands, and a cross-zone stub whose
  // target XML isn't among the loaded zones (`setCurrentZoneId(target)` on a
  // stub click doesn't verify it exists). Either leaves `activeZone`
  // undefined, which renders the "waiting for game data" placeholder with no
  // path back — the auto-switch below only fires when `currentLocation`
  // CHANGES, and standing still never changes it. Adopting the player's own
  // zone whenever the displayed one is invalid costs nothing and can't fight
  // manual browsing, because a zone the user picked from the dropdown is by
  // definition present in `zones`.
  useEffect(() => {
    if (!currentLocation) return
    if (currentZoneId && zones.has(currentZoneId)) return
    setCurrentZoneId(currentLocation.zone.id)
    setCurrentLevel(currentLocation.node.z)
  }, [currentLocation, currentZoneId, zones])

  // Auto-switch displayed zone ONLY when `currentLocation` itself changes —
  // i.e., the player walked. We deliberately do NOT depend on currentZoneId
  // / currentLevel here, so manually picking a zone from the dropdown does
  // not get yanked back to the player's actual zone. The "◆ Center on me"
  // button is the explicit way to snap back to where the player is.
  //
  // `lastLocationRef` is initialized to `null` (NOT to the first value of
  // `currentLocation`) so the effect actually fires on first mount when the
  // game is already connected and `roomTitle` is populated — otherwise the
  // initial-value-equality check bails immediately and the user has to click
  // ◆ to pick up where they are. The ref tracks the previous applied
  // location, so the first time we see any non-null `currentLocation` it
  // differs and we apply it.
  const lastLocationRef = useRef<typeof currentLocation>(null)
  useEffect(() => {
    if (!currentLocation) return
    if (currentLocation === lastLocationRef.current) return
    lastLocationRef.current = currentLocation
    setCurrentZoneId(currentLocation.zone.id)
    setCurrentLevel(currentLocation.node.z)
  }, [currentLocation])

  // Motion-detect: while the player is travelling, `inMotion` is true and the
  // animated per-category effects are not rendered at all (see `showEffects`).
  // Resets a quiet-window timer on every room change; effects re-mount only
  // once no new room has arrived for MOTION_QUIET_MS.
  //
  // 600ms: long enough to ride through a sub-600ms running cadence (effects
  // stay off for the whole run, no per-step mount/unmount churn), short enough
  // that effects feel responsive when the player actually stops. Now that the
  // effect set is viewport-culled + capped (see `nearbyNodes`) the re-mount is
  // cheap, so the window can be tighter than the original 1.5s without the
  // tear-up/tear-down cost — and healers animate continuously regardless, so
  // the map is never fully "dead" mid-run.
  //
  // `prevLocationForMotionRef` skips the FIRST currentLocation transition
  // (null → non-null on game connect or first valid match). Without this
  // sentinel, the effects would drop out for MOTION_QUIET_MS the instant
  // they connect, even though no walking has occurred. Real walks all
  // have a non-null prev value; the only time prev is null is the very
  // first arrival (or post-disconnect re-arrival, which is functionally
  // the same as a fresh connect).
  const MOTION_QUIET_MS = 600
  const prevLocationForMotionRef = useRef<typeof currentLocation>(null)
  useEffect(() => {
    const prev = prevLocationForMotionRef.current
    prevLocationForMotionRef.current = currentLocation
    if (!currentLocation) return
    if (!prev) return                       // first non-null = connect, not a walk
    if (prev === currentLocation) return    // no actual change
    setInMotion(true)
    inMotionRef.current = true
    // Drop any stale hover the moment travel begins — the map is about to
    // scroll out from under the cursor, and we suppress hover updates while
    // in motion (see onNodeHoverEnter), so a lingering hover would stick.
    setHoveredId(null)
    setTooltipPos(null)
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current)
    motionTimerRef.current = setTimeout(() => {
      setInMotion(false)
      inMotionRef.current = false
      motionTimerRef.current = null
    }, MOTION_QUIET_MS)
  }, [currentLocation])

  // Clear the pinned path once the player arrives at the pinned room.
  // Otherwise the gold pin outline lingers on the room you're now on and
  // the BFS path is a 0-length stub. `selectedId` doubles as the pin id
  // (left-click sets it; same-room left-click clears it).
  useEffect(() => {
    if (selectedId == null) return
    if (!currentLocation) return
    if (currentLocation.zone.id !== currentZoneId) return
    if (currentLocation.node.id === selectedId) setSelectedId(null)
  }, [currentLocation, currentZoneId, selectedId])

  // Clean up the motion timer on unmount.
  useEffect(() => () => {
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current)
  }, [])

  // ── Active zone + its node bookkeeping ─────────────────────────────────
  //
  // Note: we deliberately do NOT auto-pick a default zone when the user has
  // no current location. The map waits for either the player to walk
  // (auto-switch effect above) or the user to manually pick a zone from
  // the dropdown. Auto-picking an arbitrary "first zone" (typically
  // Droughtman's Maze, since alphabetical filesystem order puts it near
  // the top) is confusing and serves no purpose pre-connect.
  const activeZone = currentZoneId ? zones.get(currentZoneId) : undefined

  // Levels available in the active zone (for the floor-select chips).
  const zoneLevels = useMemo(() => {
    if (!activeZone) return []
    const s = new Set<number>()
    for (const n of activeZone.nodes) s.add(n.z)
    return [...s].sort((a, b) => a - b)
  }, [activeZone])

  // Nodes visible on the current floor — index by id for arc destination lookup.
  const visibleNodes = useMemo(() => {
    if (!activeZone) return [] as GenieNode[]
    return activeZone.nodes.filter(n => n.z === currentLevel)
  }, [activeZone, currentLevel])

  // Labels visible on the current floor — Temple of Light, Stormwill Tower,
  // Dira Buyer, Doors, Barber, etc. The Genie maps team scatters these to
  // name landmarks that aren't tied to a specific room.
  const visibleLabels = useMemo(() => {
    if (!activeZone) return []
    return activeZone.labels.filter(l => l.z === currentLevel && l.text)
  }, [activeZone, currentLevel])

  const visibleById = useMemo(() => {
    const m = new Map<number, GenieNode>()
    for (const n of visibleNodes) m.set(n.id, n)
    return m
  }, [visibleNodes])

  // Zone bbox for initial fit-to-view. Includes label positions so labels
  // at the edge of the map don't get clipped on first fit.
  const zoneBbox = useMemo(() => {
    if (visibleNodes.length === 0 && visibleLabels.length === 0) return null
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of visibleNodes) {
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
    }
    for (const l of visibleLabels) {
      if (l.x < minX) minX = l.x
      if (l.x > maxX) maxX = l.x
      if (l.y < minY) minY = l.y
      if (l.y > maxY) maxY = l.y
    }
    return { minX, maxX, minY, maxY }
  }, [visibleNodes, visibleLabels])

  // ── Fit-to-view + center-on-current ─────────────────────────────────────
  const fitToView = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !zoneBbox) return
    const w = svg.clientWidth, h = svg.clientHeight
    if (!w || !h) return
    const bboxW = Math.max(1, zoneBbox.maxX - zoneBbox.minX)
    const bboxH = Math.max(1, zoneBbox.maxY - zoneBbox.minY)
    const margin = 40
    const scale = Math.min(
      (w - 2 * margin) / bboxW,
      (h - 2 * margin) / bboxH,
      MAX_SCALE,
    )
    const cx = (zoneBbox.minX + zoneBbox.maxX) / 2
    const cy = (zoneBbox.minY + zoneBbox.maxY) / 2
    setTransform({ scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale })
  }, [zoneBbox])

  // ◆ button — "take me to my location." Switches to the player's zone if
  // we're browsing somewhere else, then centers the viewport on the player's
  // node. Also re-enables follow-mode so subsequent walks auto-track.
  const centerOnCurrent = useCallback(() => {
    if (!currentLocation) return
    setFollowPlayer(true)
    if (currentLocation.zone.id !== currentZoneId) {
      setCurrentZoneId(currentLocation.zone.id)
      setCurrentLevel(currentLocation.node.z)
      // The fit/center effect below will pick this up on next render.
      return
    }
    if (currentLocation.node.z !== currentLevel) {
      setCurrentLevel(currentLocation.node.z)
      return
    }
    const svg = svgRef.current
    if (!svg) return
    // Bail if the SVG has no layout box — an inactive character's GameWindow
    // is display:none, so clientWidth/Height read 0. Centering against 0 would
    // write a garbage transform (x = -cx*scale) that strands the camera in a
    // corner once the tab is shown again.
    const w = svg.clientWidth, h = svg.clientHeight
    if (!w || !h) return
    // The XML position IS the rect center (rects are anchored at
    // `pos − radius`), so center the viewport on the XML coord directly.
    const cx = currentLocation.node.x
    const cy = currentLocation.node.y
    setTransform(prev => ({
      ...prev,
      x: w / 2 - cx * prev.scale,
      y: h / 2 - cy * prev.scale,
    }))
  }, [currentLocation, currentZoneId, currentLevel])

  // Fit / center when the zone or level changes. Prefer centering on the
  // player's current room (more useful "I see myself") and fall back to
  // fitting the whole zone when the player isn't in the visible zone
  // (manual zone-browsing).
  const lastFitRef = useRef<string>('')
  useEffect(() => {
    const key = `${currentZoneId}:${currentLevel}`
    if (lastFitRef.current === key) return
    lastFitRef.current = key
    // Wait a frame so the SVG has its layout dimensions.
    const t = setTimeout(() => {
      // "Here" means the player is on the DISPLAYED LEVEL, not merely in the
      // displayed zone. `centerOnCurrent` is the ◆ button's "take me to my
      // location", and part of its job there is to snap the level to the
      // player's — correct when you asked to be taken to yourself, wrong when
      // it is only being borrowed to FRAME a level you deliberately browsed
      // to. Without the level check, picking z=1 while standing on z=0
      // rendered z=1 and then yanked it straight back to z=0 a tick later
      // (Sekmeht, on 69: Shard West Gate — "I can see the z level 1 map for a
      // second"). Browsing a level the player is not on now fits that level's
      // own content, which is what the user asked to see.
      const playerHere = currentLocation
        && currentLocation.zone.id === currentZoneId
        && currentLocation.node.z === currentLevel
      if (playerHere) centerOnCurrent()
      else            fitToView()
    }, 0)
    return () => clearTimeout(t)
  }, [currentZoneId, currentLevel, fitToView, centerOnCurrent, currentLocation])

  // Follow-the-player: when in follow mode, every walk re-centers the
  // viewport on the current room. useLayoutEffect (not useEffect) so the
  // camera state update lands in the SAME paint frame as the indicator
  // position change — otherwise the indicator paints one frame at its
  // new world position before the camera catches up, showing as a flash.
  //
  // Gating intentionally uses `visibleById.get(currentLocation.node.id)`
  // — the SAME lookup the indicator uses (see `currentNode` below) — so
  // "marker visible" and "camera following" are guaranteed to stay in
  // lock-step. Earlier this effect gated on its own zone/level equality
  // checks against `currentLocation`, which could diverge from the
  // indicator's gate by one render: marker rendered, camera bailed,
  // leaving the player off-center until the next walk re-fired the deps.
  //
  // rAF retry guards the rare case where the SVG's clientWidth reads 0
  // (mid-resize, mid-mount); without it a transient 0-dimension read
  // silently skips the centering and the marker drifts to the edge.
  const followNode = followPlayer && currentLocation && currentLocation.zone.id === currentZoneId
    ? visibleById.get(currentLocation.node.id)
    : undefined
  useLayoutEffect(() => {
    if (!followNode) return
    let raf = 0
    const center = (): boolean => {
      const svg = svgRef.current
      if (!svg) return false
      const w = svg.clientWidth, h = svg.clientHeight
      if (!w || !h) return false
      const cx = followNode.x, cy = followNode.y
      setTransform(prev => {
        const nx = w / 2 - cx * prev.scale
        const ny = h / 2 - cy * prev.scale
        if (nx === prev.x && ny === prev.y) return prev
        return { ...prev, x: nx, y: ny }
      })
      return true
    }
    if (!center()) raf = requestAnimationFrame(() => center())
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [followNode])

  // Recenter on the player when the map regains a layout box. While a
  // character's tab is inactive its GameWindow is display:none, so the SVG
  // measures 0×0 and the follow camera above can't track — the transform goes
  // stale as the character travels in the background. The follow effect only
  // re-fires on a move, so tabbing back to a character that walked while
  // hidden would otherwise leave the camera rooms away. A ResizeObserver on
  // the SVG (wired in `setSvgRef` below — NOT a mount-time effect, because the
  // SVG mounts late, after the Genie-loading early-return clears; cf. B58)
  // catches the 0→size transition when the tab is shown and re-centers.
  // `recenterRef` carries the current closure so `setSvgRef` stays `[]`-stable.
  const recenterOnPlayer = () => {
    const svg = svgRef.current
    if (!svg) return
    const w = svg.clientWidth, h = svg.clientHeight
    if (!w || !h) return
    if (!followPlayer || !currentLocation || currentLocation.zone.id !== currentZoneId) return
    const node = visibleById.get(currentLocation.node.id)
    if (!node) return
    setTransform(prev => {
      const nx = w / 2 - node.x * prev.scale
      const ny = h / 2 - node.y * prev.scale
      if (nx === prev.x && ny === prev.y) return prev
      return { ...prev, x: nx, y: ny }
    })
  }
  const recenterRef = useRef(recenterOnPlayer)
  recenterRef.current = recenterOnPlayer

  // ── Pan / zoom ─────────────────────────────────────────────────────────
  //
  // Wheel must be attached as NON-passive so we can preventDefault and stop
  // the browser from scrolling the page (or panel). React's onWheel prop
  // attaches passively by default, which silently ignores preventDefault on
  // most browsers and logs a console warning. Solution: use a callback ref
  // to wire the listener manually with { passive: false }.
  // ACTIVE ZOOM, treated like an active drag.
  //
  // A wheel tick scales by 1.15 (15%) while `snapTransform` only drops the
  // camera glide above 20%, so ordinary zooming kept the 150ms transition ON
  // and animated a SCALE change across ~1057 SVG node groups, several times a
  // second. A scale change re-rasterizes the whole subtree — unlike the Lich
  // map, which is a bitmap the GPU scales for free, which is exactly why that
  // one feels smooth and this one did not (Sekmeht). Transitioning a
  // continuous user input is also pointless lag in its own right: the glide
  // exists for follow-camera WALK steps, not for the wheel under your finger.
  const [zooming, setZooming] = useState(false)
  const zoomQuietRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wheel deltas COALESCE into one rAF-batched transform update.
  //
  // A wheel fires well above 60Hz (free-spin wheels and Precision touchpads
  // burst far higher), and this handler used to call setTransform once per
  // EVENT — so a single flick asked for more re-renders, and more full-SVG
  // re-rasterizations, than there were frames to draw them in. That is the
  // choppiness: not one slow frame, but many frames' worth of work queued
  // against one frame's budget.
  //
  // Why zoom and not drag: dragging changes only translate, so the CTM SCALE
  // is constant and the rasterized subtree is reused. Zooming changes scale,
  // which re-rasterizes ~1057 node groups AND recomputes stroke geometry for
  // every `vectorEffect="non-scaling-stroke"` element (the node rects, the
  // arcs) because non-scaling stroke width is defined against the CTM. That
  // cost is inherent to the drawing; what we control is how OFTEN it is paid.
  // Coalescing pins it to at most once per frame.
  //
  // The accumulator multiplies the zoom factors and keeps the LATEST cursor
  // position as the anchor — the pointer moves negligibly inside one frame,
  // and anchoring to the last position is what makes the zoom still track
  // under the cursor.
  const wheelAccumRef = useRef<{ factor: number; mx: number; my: number } | null>(null)
  const wheelRafRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (zoomQuietRef.current) clearTimeout(zoomQuietRef.current)
    if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current)
  }, [])

  const setSvgRef = useCallback((el: SVGSVGElement | null) => {
    const prev = svgRef.current
    if (prev) {
      if ((prev as any).__wheelHandler) {
        prev.removeEventListener('wheel', (prev as any).__wheelHandler)
      }
      const prevRo = (prev as any).__resizeObserver as ResizeObserver | undefined
      if (prevRo) prevRo.disconnect()
    }
    svgRef.current = el
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Manual zoom disables follow-mode — same reasoning as drag. Both of
      // these are idempotent: React bails out of a re-render when the value is
      // unchanged, so re-setting them per event during a burst is free after
      // the first one.
      setFollowPlayer(false)
      setZooming(true)
      if (zoomQuietRef.current) clearTimeout(zoomQuietRef.current)
      zoomQuietRef.current = setTimeout(() => setZooming(false), 180)

      // Fold this notch into the pending accumulator (see the ref decls).
      const step = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const acc = wheelAccumRef.current
      wheelAccumRef.current = { factor: (acc ? acc.factor : 1) * step, mx, my }

      // One frame, one transform commit, however many notches arrived.
      if (wheelRafRef.current != null) return
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null
        const a = wheelAccumRef.current
        wheelAccumRef.current = null
        if (!a) return
        setTransform(prevT => {
          // Clamp the RESULT, not the factor, so a burst that overshoots
          // MAX_SCALE still lands exactly on the limit instead of being
          // rejected — and so the anchor math below uses the scale actually
          // applied. Bail on a no-op (already at a limit) to avoid minting a
          // new transform object that would re-render for nothing.
          const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prevT.scale * a.factor))
          if (newScale === prevT.scale) return prevT
          const worldX = (a.mx - prevT.x) / prevT.scale
          const worldY = (a.my - prevT.y) / prevT.scale
          return { scale: newScale, x: a.mx - worldX * newScale, y: a.my - worldY * newScale }
        })
      })
    }
    ;(el as any).__wheelHandler = handler
    el.addEventListener('wheel', handler, { passive: false })

    // ResizeObserver — recenters the camera when the map regains a layout box
    // (the inactive tab being shown again, or a real panel resize). Wired here,
    // on the element callback ref, because the SVG mounts after GenieMapView's
    // Genie-loading early-return — a mount-time `useEffect` would see a null
    // ref and never attach. A 0×0 callback is the tab being hidden; ignore it.
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) recenterRef.current()
    })
    ro.observe(el)
    ;(el as any).__resizeObserver = ro
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    dragRef.current = { ox: e.clientX, oy: e.clientY, tx: transform.x, ty: transform.y }
    setIsDragging(true)
    // Manual drag disables follow-mode so the camera doesn't snap back
    // to the player on the next walk. Re-enable via the ◆ button.
    setFollowPlayer(false)
  }, [transform])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Capture by const to avoid a race between the null-check and the state
    // update: dragRef.current can be cleared by `endDrag` between the two
    // accesses if a mouseup races in.
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.ox
    const dy = e.clientY - d.oy
    setTransform(prev => ({ ...prev, x: d.tx + dx, y: d.ty + dy }))
  }, [])

  const endDrag = useCallback(() => {
    dragRef.current = null
    setIsDragging(false)
  }, [])

  // ── Click-to-walk ───────────────────────────────────────────────────────
  // Optional `onComplete` fires after the last walk command is sent.
  // Used by stub-click navigation to defer the zone switch until the
  // player has actually walked to the boundary room.
  const sendWalkPath = useCallback((commands: string[], onComplete?: () => void) => {
    walkTimers.current.forEach(clearTimeout)
    walkTimers.current = []
    if (commands.length === 0) { onComplete?.(); return }
    setWalking(true)
    commands.forEach((cmd, i) => {
      const t = setTimeout(() => {
        onSendCommand(cmd)
        if (i === commands.length - 1) {
          setWalking(false)
          onComplete?.()
        }
      }, i * WALK_STEP_MS)
      walkTimers.current.push(t)
    })
  }, [onSendCommand])

  const stopWalk = useCallback(() => {
    walkTimers.current.forEach(clearTimeout)
    walkTimers.current = []
    setWalking(false)
  }, [])

  // Left-click — pins the path to the clicked node (no walking). For stubs
  // (cross-zone markers), left-click instead switches the displayed zone
  // to the stub's target XML, since "pin a path" doesn't make sense across
  // zone boundaries. Clicking the same node toggles the pin off.
  //
  // Walking moved to right-click (see `onNodeContextMenu`) so users can
  // study a route before committing to it.
  const onNodeClick = useCallback((node: GenieNode) => {
    if (isStubNode(node)) {
      // Resolve the stub's `.xml` note to a loaded zone and switch.
      const stubXml = noteAliases(node.note).find(a => a.toLowerCase().endsWith('.xml'))
      const target  = stubXml ? sourceFileToZoneId.get(stubXml.toLowerCase()) : undefined
      if (!target) return
      const targetZone = zones.get(target)
      if (!targetZone) return

      // Find the reciprocal entry room — the target zone's stub
      // pointing back to OUR zone — so we can position the new view
      // sensibly without zooming out. Most map stubs are reciprocal
      // pairs: zone A's stub for B references B.xml, and zone B's
      // stub for A references A.xml. Match on filename.
      const sourceFile = activeZone?.sourceFile?.toLowerCase()
      const entryNode = sourceFile
        ? targetZone.nodes.find(n =>
            noteAliases(n.note).some(a => a.toLowerCase() === sourceFile)
          )
        : undefined

      const targetLevels = new Set(targetZone.nodes.map(n => n.z))
      const newLevel = entryNode?.z ?? (targetLevels.size > 0 ? Math.min(...targetLevels) : 0)

      // Suppress the fit/center effect's auto-fit-to-zone behavior —
      // we want to preserve the user's zoom across stub navigation,
      // not zoom out to encompass the whole new map. Pre-setting
      // `lastFitRef` to the new key makes the effect's key check bail
      // on the next render. Without this, the fit/center effect's
      // `playerHere = false` branch would fire `fitToView()` and
      // dramatically change scale on every cross-zone stub click.
      lastFitRef.current = `${target}:${newLevel}`

      // Center on the entry room at the CURRENT scale (preserves
      // user's zoom level). Fall back to leaving the camera where it
      // is if no reciprocal entry was found — the user can fit-to-view
      // manually with ⊡ if they need orientation.
      if (entryNode) {
        const svg = svgRef.current
        if (svg) {
          const w = svg.clientWidth, h = svg.clientHeight
          if (w && h) {
            setTransform(prev => ({
              ...prev,
              x: w / 2 - entryNode.x * prev.scale,
              y: h / 2 - entryNode.y * prev.scale,
            }))
          }
        }
      }

      setCurrentZoneId(target)
      setCurrentLevel(newLevel)
      setSelectedId(null)
      // Browsing a different zone implicitly leaves follow-mode —
      // the player isn't on the displayed map anymore. The ◆ button
      // re-enables follow AND yanks the displayed zone back to the
      // player's actual location.
      setFollowPlayer(false)
      return
    }
    // Regular node: toggle the pinned path. Same-node click clears.
    setSelectedId(prev => prev === node.id ? null : node.id)
  }, [isStubNode, sourceFileToZoneId, zones, activeZone])

  // Right-click — walk to the clicked node. Mirrors the old left-click
  // walking behavior. Suppresses the browser context menu via preventDefault.
  // For stubs we walk TO the boundary room (the stub IS a real room in the
  // current zone). The displayed map does NOT auto-switch on walk
  // completion — see `currentLocation` auto-switch comment; the game can
  // block any walk step, so we let the room-title signal drive zone changes
  // and never race ahead of the player.
  //
  // PERF — this callback MUST keep a stable identity. It is a dep of the
  // `nodeRects` memo, so when it closed over `currentLocation` directly it got
  // a new identity on EVERY ROOM CHANGE, invalidating the memo and rebuilding
  // the entire node layer — ~1057 <g> groups in the biggest zone — on every
  // single step the player took. Measured with the real node count
  // (tmp-map-perf/react-bench): 8.4ms of React commit time per room change
  // versus 0.34ms when the memo holds. That is half a frame budget spent
  // re-creating markers whose geometry did not change, and it is exactly what
  // made the map feel sluggish during heavy movement.
  //
  // The fix is the latest-closure ref (pitfall #31): the handler's INPUTS live
  // in a ref that updates every render, so the handler itself never changes
  // identity. `nodeRects` now rebuilds only when the zone/level actually
  // changes (via `visibleNodes`), which is the only time the markers differ.
  // Do NOT put `currentLocation` (or anything else that ticks per room) back
  // into this dep array.
  const walkCtxRef = useRef({ activeZone, currentLocation, currentZoneId, sendWalkPath })
  useEffect(() => {
    walkCtxRef.current = { activeZone, currentLocation, currentZoneId, sendWalkPath }
  }, [activeZone, currentLocation, currentZoneId, sendWalkPath])

  const onNodeContextMenu = useCallback((node: GenieNode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const { activeZone: zone, currentLocation: loc, currentZoneId: zoneId, sendWalkPath: walk } =
      walkCtxRef.current
    if (!loc) return
    if (loc.zone.id !== zoneId) return
    if (loc.node.id === node.id) return
    const path = bfsZonePath(zone!, loc.node.id, node.id)
    if (path.length === 0) return
    walk(path)
  }, [])

  // Hover handlers — pointer position relative to the canvas for the tooltip.
  // Skip work entirely while the user is panning. We can't rely on a
  // parent `pointer-events: none` toggle to suppress hover during drag
  // because the same toggle would break click dispatch (mousedown sets
  // isDragging before click fires, so the click target would shift off
  // the node). Gate at the React layer instead.
  const onNodeHoverEnter = useCallback((node: GenieNode, e: React.MouseEvent) => {
    // Skip hover work while panning OR travelling — during travel the map
    // scrolls under a stationary cursor, firing a storm of enter/leave events
    // (the `pointerout` cost in profiling); processing them just churns
    // re-renders for hover state the player isn't actually driving.
    if (dragRef.current || inMotionRef.current) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    setHoveredId(node.id)
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])
  const onNodeHoverLeave = useCallback(() => {
    setHoveredId(null)
    setTooltipPos(null)
  }, [])

  // Hovered node lookup for the tooltip body.
  const hoveredNode = useMemo(
    () => hoveredId != null ? visibleNodes.find(n => n.id === hoveredId) : undefined,
    [hoveredId, visibleNodes]
  )

  // ── Sorted zone list for the dropdown ──────────────────────────────────
  //
  // Genie zone ids are alphanumeric strings like "1", "1a", "10", "107a", etc.
  // Plain lexicographic sort puts "10" before "1a" before "2" — readable as a
  // string but unhelpful for navigation, since subzones get separated from
  // their parent number. Natural sort compares digit-runs numerically and
  // letter-runs alphabetically, so the order becomes:
  //
  //   1, 1a, 1j, 1l, 1m, 2, 2a, 2d, 4, 4a, 10, 11, 12a, 13, 14b, 14c, 14d,
  //   30, 30a, 30b, 31, 31a, ... 105, 106, 107, 107a, 108, ... 150
  //
  // — subzones cluster with their parent number, big numbers come last.
  const sortedZones = useMemo(() => {
    const parts = (s: string) => s.match(/(\d+)|(\D+)/g) ?? []
    const natCmp = (a: string, b: string): number => {
      const ap = parts(a), bp = parts(b)
      const n = Math.min(ap.length, bp.length)
      for (let i = 0; i < n; i++) {
        const x = ap[i], y = bp[i]
        const xn = /^\d/.test(x), yn = /^\d/.test(y)
        if (xn && yn) {
          const d = parseInt(x, 10) - parseInt(y, 10)
          if (d !== 0) return d
        } else if (!xn && !yn) {
          const d = x.localeCompare(y)
          if (d !== 0) return d
        } else {
          return xn ? -1 : 1
        }
      }
      return ap.length - bp.length
    }
    return [...zones.values()].sort((a, b) => natCmp(a.id, b.id))
  }, [zones])

  // ── Memoized SVG layers ────────────────────────────────────────────────
  //
  // The expensive parts of the canvas (arcs and node rects) depend only on
  // the current zone + level + which node is current/selected — NOT on the
  // pan/zoom transform. Without memoization, every drag move recomputed and
  // re-rendered all ~6,000 SVG elements for a large zone like Crossing,
  // crashing Electron's renderer.
  //
  // IMPORTANT: every useMemo / useCallback / useEffect must live BEFORE the
  // early-return guards below, or the hook count changes between renders and
  // React throws error #310 ("Rendered more hooks than during the previous
  // render"). This file's hook order is load-bearing — please keep new hooks
  // above the `if (!genieMapsDir) ...` early returns.
  //
  // `vectorEffect="non-scaling-stroke"` tells SVG to keep stroke widths
  // constant in screen space regardless of the parent transform's scale,
  // so we don't need React to dynamically adjust them per zoom level.
  // Free-floating map labels — "Temple of Light", "Stormwill Tower", "Dira
  // Buyer", "Doors", "Barber", etc. Genie XML provides these per-zone with
  // their own position.
  //
  // Anchoring convention: both Genie (.NET `DrawString`) and Frostbite (Qt
  // `QGraphicsTextItem.setPos`) place the TOP OF THE TEXT BOUNDING BOX at
  // the XML position. That bbox top includes a small ascender margin above
  // the cap height of capital letters. SVG's `text-before-edge` baseline
  // matches this exactly — the "before-edge" of the em box (its top,
  // including ascender space) sits at y.
  //
  // Earlier we tried `hanging` baseline, which aligns the TOP OF CAPITALS
  // at y instead. That rendered every label ~2–3px higher than Genie/
  // Frostbite show it, causing visible overlap with nodes positioned just
  // above the label. `text-before-edge` is the closest 1:1 with the
  // reference clients.
  const labelTexts = useMemo(() => (
    visibleLabels.map((l, i) => (
      <text
        key={`label-${i}-${l.x}-${l.y}`}
        x={l.x + LABEL_X_NUDGE}
        y={l.y + LABEL_Y_NUDGE}
        fontStyle="italic"
        fill="var(--map-text-muted, #aaa)"
        textAnchor="start"
        dominantBaseline="text-before-edge"
        // Pull font-size from the panel-font chain (pitfall #58): the
        // per-panel A+/A− override (`--panel-font-size`, set on the
        // panel-frame-body wrapper and inherited into this SVG) falls back
        // to the global game font (`--game-font-size`, set by settings.ts).
        // Skipping the panel var was the bug behind "A+/A− does nothing on
        // Genie Maps while the global setting works" (Sekmeht, v0.14.7).
        // Then scale to 80%: Genie's XML positions labels assuming a
        // specific text width — at scales much below 80% the visibly
        // narrower labels appear left-shifted relative to their target
        // clusters (because the same top-left anchor gives the smaller
        // text less rightward extent). 0.8 stays close to Genie's
        // calibrated width while still being a touch smaller than game
        // text. Falls back to 12px when both vars are unset (× 0.8 = ~9.6px).
        style={{ userSelect: 'none', fontSize: 'calc(var(--panel-font-size, var(--game-font-size, 12px)) * 0.8)' }}
        pointerEvents="none"
      >
        {l.text}
      </text>
    ))
  ), [visibleLabels])

  // Arcs collapsed into one combined `<path>` PER CATEGORY (cardinal /
  // climb / go) — three elements total instead of one `<line>` per arc.
  // A dense zone (Crossing, Shard) has thousands of arcs, and Chromium's
  // compositor was spending ~50% of frame time on Layerize keeping each
  // line as its own paint-tracked element. Multiple `M x,y L x,y` segments
  // in a single path are drawn as one shape; same visual output, ~1000×
  // fewer composited elements. Genie's own renderer takes the same
  // approach (one Graphics.DrawLine call per arc, but a single GDI draw
  // batch for the frame).
  //
  // Rendered in TWO passes — see the JSX below — to solve the "arc
  // disappears into a dense cluster" legibility problem:
  //   - Under-pass: full opacity, drawn beneath nodeRects. Looks
  //     unchanged outside clusters; gets hidden by rect fills inside
  //     them.
  //   - Over-pass: faint opacity, drawn ON TOP of nodeRects. Inside a
  //     cluster the line shows as a dim trace across rect fills so you
  //     can see exactly which room a line lands on. Outside clusters
  //     this pass adds a barely-visible second stroke (negligible).
  // Building the path data once and rendering twice keeps the memo
  // cheap; the over-pass uses a distinct key prefix to avoid React key
  // collisions with the under-pass.
  const arcSegs = useMemo(() => {
    const segs: Record<ArcCategory, string[]> = { cardinal: [], climb: [], go: [] }
    for (const node of visibleNodes) {
      for (const arc of node.arcs) {
        // Hidden arcs: walkable but not drawn — see top-of-file comment.
        if (arc.hidden) continue
        const dest = visibleById.get(arc.destination)
        if (!dest) continue
        segs[classifyArc(arc.exit)].push(`M${node.x},${node.y}L${dest.x},${dest.y}`)
      }
    }
    return segs
  }, [visibleNodes, visibleById])

  // PERF: the SEGMENTS are memoized above, but the `.join('')` that turns them
  // into path `d` strings is the expensive half — a big zone has ~2,400
  // segments, so each pass allocates ~40KB of string. Running it inline meant
  // six large joins (3 categories x 2 passes) on EVERY render: every mousemove
  // of a drag, every room change, every parent re-render. Measured at ~0.15ms
  // and ~78KB of garbage per render for nothing — the `d` values only change
  // when `arcSegs` does. Memoizing on `[arcSegs]` makes both passes free
  // between zone/level changes, and hands React the same element references so
  // it can skip the subtree entirely.
  const { under: arcPathsUnder, over: arcPathsOver } = useMemo(() => {
    const build = (opacity: number, keyPrefix: string) => (
      (Object.keys(arcSegs) as ArcCategory[]).map(cat => {
        const d = arcSegs[cat].join('')
        if (!d) return null
        return (
          <path
            key={`${keyPrefix}-${cat}`}
            d={d}
            stroke={ARC_COLOR_VAR[cat]}
            strokeWidth={1}
            fill="none"
            opacity={opacity}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )
      })
    )
    return { under: build(0.7, 'arcs-under'), over: build(0.35, 'arcs-over') }
  }, [arcSegs])

  const currentNodeId = currentLocation?.zone.id === currentZoneId
    ? currentLocation?.node.id
    : undefined

  // Which COLOR_LEGEND entries actually appear on this floor. The legend
  // shows only colors that are present so unused entries don't clutter it.
  const zoneColors = useMemo(() => {
    const used = new Set<string>()
    for (const n of visibleNodes) {
      if (n.color && COLOR_LEGEND[n.color]) used.add(n.color)
    }
    return [...used]
  }, [visibleNodes])

  // Which arc categories appear on this floor — drives the arc-legend section.
  const arcCategories = useMemo(() => {
    const used = new Set<ArcCategory>()
    for (const n of visibleNodes) {
      for (const a of n.arcs) {
        if (a.hidden) continue
        if (!visibleById.has(a.destination)) continue
        used.add(classifyArc(a.exit))
      }
    }
    return [...used]
  }, [visibleNodes, visibleById])

  // Stub-mark category — shown in legend only when there's at least one
  // cross-zone stub node visible on the current floor.
  const hasStubs = useMemo(
    () => visibleNodes.some(isStubNode),
    [visibleNodes, isStubNode]
  )

  // Whether the animated per-category effects render at all. False while
  // panning, travelling, or with map animations off — when false the effects
  // are not mounted (no DOM, no compositor layers, no Layerize/Paint/Recalc
  // Style). They re-mount once the player has been still for MOTION_QUIET_MS.
  const showEffects = mapAnimations && !isDragging && !inMotion && !zooming

  // The node set the animated effects iterate. When effects are off it's the
  // stable EMPTY_NODES ref, so the effect memos below skip recomputation
  // entirely during travel. When on, it's the rooms inside the current
  // viewport — what actually animates tracks the current pan + zoom, so a
  // zoomed-in view animates only the handful of rooms on screen and panning
  // moves the live region with the eye. EFFECT_CAP is a backstop for
  // zoomed-way-out views (keeps the count bounded regardless of zone density).
  //
  // svgRef dimensions are read imperatively (not a dep) — `transform` already
  // changes on every camera move and on the resize-driven re-fit, so the memo
  // re-runs whenever the viewport could have changed.
  const nearbyNodes = useMemo<GenieNode[]>(() => {
    if (!showEffects || visibleNodes.length === 0) return EMPTY_NODES
    const svg = svgRef.current
    const W = svg?.clientWidth ?? 0
    const H = svg?.clientHeight ?? 0
    if (W <= 0 || H <= 0) {
      // SVG not laid out yet — fall back to a plain cap.
      return visibleNodes.length <= EFFECT_CAP ? visibleNodes : visibleNodes.slice(0, EFFECT_CAP)
    }
    const { x: tx, y: ty, scale } = transform
    const M = 48   // screen-px margin so effects just off-edge still count
    const inView = visibleNodes.filter(n => {
      const sx = n.x * scale + tx
      const sy = n.y * scale + ty
      return sx >= -M && sx <= W + M && sy >= -M && sy <= H + M
    })
    if (inView.length <= EFFECT_CAP) return inView
    // Zoomed far out — keep the EFFECT_CAP nearest the viewport centre.
    const cx = (W / 2 - tx) / scale
    const cy = (H / 2 - ty) / scale
    return inView
      .sort((p, q) =>
        ((p.x - cx) ** 2 + (p.y - cy) ** 2) - ((q.x - cx) ** 2 + (q.y - cy) ** 2))
      .slice(0, EFFECT_CAP)
  }, [showEffects, visibleNodes, transform])

  // Aura layer — soft translucent square behind every COLOR_LEGEND-tagged
  // room. One element per colored node, rendered BEFORE arcs so arc lines
  // paint over auras (auras shouldn't compete visually with structural
  // map information).
  //
  // Sizing: 1.125× the rect (1px overhang per side). Tight enough that
  // adjacent rooms touching at 0-gap don't produce wide overlap blooms.
  //
  // Per-color modifiers (applied as className):
  //   - AURA_FIRE_COLORS: irregular flicker (Interesting Room) +
  //     larger aura size (see auraScale below) for diffuse firelight
  //   - AURA_INTENSIFIED_COLORS: stronger static opacity, no animation
  //     (Guildleader, Housing)
  // Default opacity is 0.15; intensified gets 0.28.
  const auras = useMemo(() => (
    visibleNodes
      .filter(n => n.color && COLOR_LEGEND[n.color])
      .map(n => {
        const intensified = AURA_INTENSIFIED_COLORS.has(n.color!)
        const fire        = AURA_FIRE_COLORS.has(n.color!)
        const cls = fire ? 'genie-aura-fire' : undefined
        // Skip the `opacity` SVG attribute when an animated class is
        // applied — the keyframe owns opacity, and setting both creates
        // attribute-vs-CSS ambiguity. CSS wins per SVG2 spec, but the
        // cleaner contract is "if animated, opacity is owned by CSS."
        // Non-animated rooms still use the inline attribute as before.
        const opacityAttr = fire ? undefined : (intensified ? 0.28 : 0.15)
        // Fire auras (Lime) get a slightly larger halo so the flicker
        // has more area to "glow" through — without bumping size the
        // irregular opacity changes read as a tiny pulse instead of a
        // diffuse firelight. Every other category stays at 1.125× to
        // avoid blooming into adjacent rooms.
        const auraScale = fire ? 1.3 : 1.125
        const auraSize = NODE_SIZE * auraScale
        const auraOffset = auraSize / 2
        return (
          <rect
            key={`aura-${n.id}`}
            className={cls}
            x={n.x - auraOffset}
            y={n.y - auraOffset}
            width={auraSize}
            height={auraSize}
            fill={n.color}
            opacity={opacityAttr}
            rx={2}
            ry={2}
            pointerEvents="none"
          />
        )
      })
  ), [visibleNodes])

  // Sparkle motes for the "magical 4" — Transport, Shrine, Favor Altar,
  // Stat Training. Each color picks a motion motif from MOTE_EFFECTS:
  //
  //   vortex     — 3 motes orbiting the rect (Transport)
  //   drift      — 4 motes drifting outward NSEW (Shrine)
  //   rise-slow  — 3 motes rising slowly (Favor Altar)
  //   rise-fast  — 3 motes rising quickly (Stat Training)
  //
  // All effects share the same per-mote size (r=0.7) and the room's
  // own color as the fill, so the four motifs feel like a family — they
  // differ in motion, not in look.
  const sparkles = useMemo(() => {
    const out: React.ReactNode[] = []
    for (const n of nearbyNodes) {
      if (!n.color) continue
      const effect = MOTE_EFFECTS[n.color]
      if (!effect) continue
      // Contrast-aware mote color — see getMoteContrastColor() above.
      // Light backgrounds (periwinkle, yellow) get dark-tinted motes;
      // dark backgrounds (fuchsia, purple) get pale-tinted motes.
      // Always pulling toward white left motes invisible on the light-
      // background categories.
      const litColor = getMoteContrastColor(n.color)
      if (effect === 'rise-slow' || effect === 'rise-fast') {
        const cls = effect === 'rise-slow' ? 'genie-mote-rise-slow' : 'genie-mote-rise-fast'
        const duration = effect === 'rise-slow' ? 3.2 : 1.6
        // Three motes with staggered delays so one is always visible.
        out.push(
          <circle key={`spk-${n.id}-0`} className={cls}
            cx={n.x - 2.5} cy={n.y + 1} r={0.7}
            style={{ fill: litColor }} pointerEvents="none" />,
          <circle key={`spk-${n.id}-1`} className={cls}
            cx={n.x} cy={n.y + 2} r={0.7}
            style={{ fill: litColor, animationDelay: `${duration / 3}s` }}
            pointerEvents="none" />,
          <circle key={`spk-${n.id}-2`} className={cls}
            cx={n.x + 2.5} cy={n.y + 1} r={0.7}
            style={{ fill: litColor, animationDelay: `${(duration * 2) / 3}s` }}
            pointerEvents="none" />,
        )
      } else if (effect === 'drift') {
        // Four motes drift outward NSEW; per-direction keyframes handle
        // the actual translate, and animation-delay (set in CSS class)
        // spaces them out so the four-way drift reads as a continuous
        // outward emanation.
        out.push(
          <circle key={`spk-${n.id}-N`} className="genie-mote-drift-n"
            cx={n.x} cy={n.y - 0.5} r={0.7}
            style={{ fill: litColor }} pointerEvents="none" />,
          <circle key={`spk-${n.id}-S`} className="genie-mote-drift-s"
            cx={n.x} cy={n.y + 0.5} r={0.7}
            style={{ fill: litColor }} pointerEvents="none" />,
          <circle key={`spk-${n.id}-E`} className="genie-mote-drift-e"
            cx={n.x + 0.5} cy={n.y} r={0.7}
            style={{ fill: litColor }} pointerEvents="none" />,
          <circle key={`spk-${n.id}-W`} className="genie-mote-drift-w"
            cx={n.x - 0.5} cy={n.y} r={0.7}
            style={{ fill: litColor }} pointerEvents="none" />,
        )
      } else if (effect === 'vortex') {
        // Three motes orbiting the node center, positioned at 120°
        // intervals. Each circle gets its own absolute `transformOrigin`
        // pointing at the node center; the CSS rotation animation
        // pivots each mote around that exact point. The earlier `<g>`
        // wrapper used `transform-box: fill-box; transform-origin:
        // center`, which pivots the bounding-box center — for 3 points
        // at 120° spacing the bbox is asymmetric (x range -2.2 to +3.7)
        // so the orbit center landed ~0.75px right of the actual node.
        // Per-mote inline origin fixes that cleanly.
        const origin = `${n.x}px ${n.y}px`
        out.push(
          <circle key={`spk-${n.id}-v0`} className="genie-mote-vortex"
            cx={n.x + 3}    cy={n.y}       r={0.7}
            style={{ fill: litColor, transformOrigin: origin }}
            opacity={0.85} pointerEvents="none" />,
          <circle key={`spk-${n.id}-v1`} className="genie-mote-vortex"
            cx={n.x - 1.5}  cy={n.y + 2.6} r={0.7}
            style={{ fill: litColor, transformOrigin: origin }}
            opacity={0.85} pointerEvents="none" />,
          <circle key={`spk-${n.id}-v2`} className="genie-mote-vortex"
            cx={n.x - 1.5}  cy={n.y - 2.6} r={0.7}
            style={{ fill: litColor, transformOrigin: origin }}
            opacity={0.85} pointerEvents="none" />,
        )
      }
    }
    return out
  }, [nearbyNodes])

  // Caution ring — Obstacle (amber). Stroke around the rect with slow
  // on/off opacity blink, like a warning beacon. Same structure as the
  // healer heartbeat ring, different rhythm (square wave instead of
  // ECG double-beat).
  const cautionRings = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && CAUTION_COLORS.has(n.color))
      .map(n => (
        <rect
          key={`caution-${n.id}`}
          className="genie-caution"
          x={n.x - NODE_RADIUS - 1}
          y={n.y - NODE_RADIUS - 1}
          width={NODE_SIZE + 2}
          height={NODE_SIZE + 2}
          fill="none"
          stroke={n.color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))
  ), [nearbyNodes])

  // Implode — Depart (eggplant). Two staggered rings start large and
  // shrink inward while fading. Opposite direction from water ripples,
  // so the room's energy reads as "collapsing inward" — somber finality
  // appropriate for a Depart Room.
  const implodes = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && IMPLODE_COLORS.has(n.color))
      .flatMap(n => [
        <circle
          key={`imp-${n.id}-0`}
          className="genie-implode"
          cx={n.x} cy={n.y} r={5}
          fill="none"
          stroke="#a878a8"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
        <circle
          key={`imp-${n.id}-1`}
          className="genie-implode genie-implode--d1"
          cx={n.x} cy={n.y} r={5}
          fill="none"
          stroke="#a878a8"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
      ])
  ), [nearbyNodes])

  // XP rise — Guildleader (orange). Two small gold particles rise
  // from the bottom edge of the rect upward past the top, fading at
  // both ends. Visual metaphor for "leveling up here" — universal
  // video-game shorthand for XP gain. Two particles with staggered
  // delays so the column always has something rising. Center column
  // (cx = n.x) rather than offset, so it reads as a single intentional
  // stream. Start cy = n.y + 4 (rect bottom edge) matches the leaf/
  // dirt fall starting position — particles emerge from a rect edge
  // rather than from inside the rect, consistent visual language for
  // every "particles per room" effect.
  const xpRises = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && XP_RISE_COLORS.has(n.color))
      .flatMap(n => [
        <circle
          key={`xp-${n.id}-0`}
          className="genie-xp-rise"
          cx={n.x} cy={n.y + 4} r={0.7}
          fill="#ffd060"
          pointerEvents="none"
        />,
        <circle
          key={`xp-${n.id}-1`}
          className="genie-xp-rise genie-xp-rise--d1"
          cx={n.x} cy={n.y + 4} r={0.7}
          fill="#ffd060"
          pointerEvents="none"
        />,
      ])
  ), [nearbyNodes])

  // Leaf fall — Lumberjacking (green). Three small green dots start
  // at the bottom edge of the rect and drift downward past it,
  // fading out as they fall. Slight horizontal wobble in the CSS
  // keyframe so each leaf reads as wafting rather than dropping
  // straight down. Staggered delays keep the column populated.
  // Particle colors vary slightly across the three to suggest
  // mixed foliage.
  const leafFalls = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && LEAF_FALL_COLORS.has(n.color))
      .flatMap(n => [
        <circle key={`leaf-${n.id}-0`} className="genie-leaf-fall"
          cx={n.x - 1.5} cy={n.y + 4} r={0.6}
          fill="#5a9028" pointerEvents="none" />,
        <circle key={`leaf-${n.id}-1`} className="genie-leaf-fall genie-leaf-fall--d1"
          cx={n.x + 0.5} cy={n.y + 4} r={0.6}
          fill="#3a7018" pointerEvents="none" />,
        <circle key={`leaf-${n.id}-2`} className="genie-leaf-fall genie-leaf-fall--d2"
          cx={n.x + 2} cy={n.y + 4} r={0.55}
          fill="#4a8020" pointerEvents="none" />,
      ])
  ), [nearbyNodes])

  // Dirt fall — Mining (sienna) + Ranger Trailhead (sand). Brown
  // particles fall straight down (no wobble — dirt has weight) at a
  // faster rate than leaves. Particle color varies by room: dark
  // brown for Mining (broken stone / ore), lighter tan for Trailhead
  // (trail dust). Three staggered particles per node.
  const dirtFalls = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && DIRT_FALL_COLORS.has(n.color))
      .flatMap(n => {
        const c = dirtParticleColor(n.color!)
        return [
          <circle key={`dirt-${n.id}-0`} className="genie-dirt-fall"
            cx={n.x - 1.5} cy={n.y + 4} r={0.45}
            fill={c} pointerEvents="none" />,
          <circle key={`dirt-${n.id}-1`} className="genie-dirt-fall genie-dirt-fall--d1"
            cx={n.x + 0.5} cy={n.y + 4} r={0.5}
            fill={c} pointerEvents="none" />,
          <circle key={`dirt-${n.id}-2`} className="genie-dirt-fall genie-dirt-fall--d2"
            cx={n.x + 1.8} cy={n.y + 4} r={0.4}
            fill={c} pointerEvents="none" />,
        ]
      })
  ), [nearbyNodes])

  // Heartbeat ring for Auto-Healer (mint). A single rect wrapping the
  // node, fill=none with an animated-opacity stroke in the room's mint
  // color. The CSS keyframe (genie-heartbeat) follows an ECG-style
  // double-beat rhythm — two close peaks then a longer rest. Sits just
  // outside the node's own 1px border so the heartbeat reads as a
  // pulse-ring rather than a fill change.
  //
  // PRIORITY effect: healers iterate the full `visibleNodes` (not the
  // viewport-culled `nearbyNodes`) and render outside the `showEffects` gate,
  // so a healer pulses everywhere in the zone and keeps pulsing during travel.
  // Healers are rare (a handful per zone) so always-on is cheap, and finding
  // one fast matters. Still respects the `mapAnimations` master switch.
  const heartbeats = useMemo(() => (
    visibleNodes
      .filter(n => n.color && HEARTBEAT_COLORS.has(n.color))
      .map(n => (
        <rect
          key={`heartbeat-${n.id}`}
          className="genie-heartbeat"
          x={n.x - NODE_RADIUS - 1}
          y={n.y - NODE_RADIUS - 1}
          width={NODE_SIZE + 2}
          height={NODE_SIZE + 2}
          fill="none"
          stroke={n.color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))
  ), [visibleNodes])

  // Coin glint for Shop (red). A gold dash slides around the rect's
  // perimeter via stroke-dasharray + dashoffset animation. With
  // dasharray=[4, 28] (perimeter = 4×NODE_SIZE = 32), exactly one
  // short bright segment is visible at any time; the keyframe shifts
  // it through the full perimeter on a slow loop. Reads as light
  // catching gold — commerce signal that contrasts with the rect's
  // red fill instead of competing with it.
  const coinGlints = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && COIN_GLINT_COLORS.has(n.color))
      .map(n => (
        <rect
          key={`glint-${n.id}`}
          className="genie-coin-glint"
          x={n.x - NODE_RADIUS}
          y={n.y - NODE_RADIUS}
          width={NODE_SIZE}
          height={NODE_SIZE}
          fill="none"
          stroke="#FFD060"
          strokeWidth={1.5}
          strokeDasharray="4 28"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))
  ), [nearbyNodes])

  // Water ripples — Water (blue) rooms. Three concentric circles
  // centered on the node, each scaled outward by CSS `transform: scale`
  // while fading. Staggered delays (0 / 0.7s / 1.4s over a 2.1s cycle)
  // produce a continuous wave of expanding rings.
  //
  // The stroke uses a LIGHT cyan (#a0d8ff), NOT the room's own #0000FF —
  // the rect's fill is full blue, so a same-color stroke would be
  // invisible inside the rect (where the ripple starts). Light cyan
  // reads against both the blue rect and the dark map background as
  // the ring grows past the rect edge.
  const ripples = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && RIPPLE_COLORS.has(n.color))
      .flatMap(n => [
        <circle
          key={`rip-${n.id}-0`}
          className="genie-ripple"
          cx={n.x} cy={n.y} r={5}
          fill="none"
          stroke="#a0d8ff"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
        <circle
          key={`rip-${n.id}-1`}
          className="genie-ripple genie-ripple--d1"
          cx={n.x} cy={n.y} r={5}
          fill="none"
          stroke="#a0d8ff"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
        <circle
          key={`rip-${n.id}-2`}
          className="genie-ripple genie-ripple--d2"
          cx={n.x} cy={n.y} r={5}
          fill="none"
          stroke="#a0d8ff"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />,
      ])
  ), [nearbyNodes])

  // Bubbles — Underwater (navy) rooms. Two small circles per node start
  // near the bottom of the rect, rise upward past the top edge, and pop
  // out of existence with a brief scale-up at the end. Cyan-white fill
  // (#a0d8ff) at low opacity so the bubble reads against the dark navy
  // fill of the room. Distinct from sparkles (slower, smaller, different
  // motion endpoint with the "pop") so underwater feels like a different
  // category from the magical 4.
  const bubbles = useMemo(() => (
    nearbyNodes
      .filter(n => n.color && BUBBLE_COLORS.has(n.color))
      .flatMap(n => [
        <circle
          key={`bub-${n.id}-0`}
          className="genie-bubble"
          cx={n.x - 1.8} cy={n.y + 3} r={1.8}
          fill="#ffffff"
          pointerEvents="none"
        />,
        <circle
          key={`bub-${n.id}-1`}
          className="genie-bubble genie-bubble--d1"
          cx={n.x + 1.8} cy={n.y + 3} r={1.8}
          fill="#ffffff"
          pointerEvents="none"
        />,
      ])
  ), [nearbyNodes])

  // Static-per-zone node rectangles. Critically: this memo's dep array
  // does NOT include `currentNodeId` or `selectedId`. Those used to
  // change the rect's stroke / draw a halo circle inline, which forced
  // the entire array (hundreds-thousands of <g> elements) to rebuild
  // every walk step. On rapid walks that produced the visible
  // stutter/tearing. Both highlights now render as separate single
  // elements layered on top (currentIndicator / selectedIndicator
  // below), so walking only re-renders one circle.
  const nodeRects = useMemo(() => (
    visibleNodes.map(node => {
      const stub = isStubNode(node)
      const fill = node.color ?? (stub ? 'var(--map-bg, #1a1a1a)' : 'var(--map-node-fill, #ccc)')
      // Node rectangles are CENTERED on the XML position. Genie computes
      // its draw origin as `ConvertPoint(n.Position, 4 * m_Scale)` which
      // subtracts the offset (MapForm.cs:187–193), then draws an 8×8 rect
      // from there. Net effect: rect top-left at `(pos − 4, pos − 4)`,
      // rect center at `(pos.x, pos.y)`. The Genie maps team places labels
      // assuming this center anchoring; using top-left here shifts every
      // node down-right by 4px and visibly misaligns clusters.
      return (
        <g
          key={`node-${node.id}`}
          onClick={() => onNodeClick(node)}
          onContextMenu={e => onNodeContextMenu(node, e)}
          onMouseEnter={e => onNodeHoverEnter(node, e)}
          onMouseLeave={onNodeHoverLeave}
          style={{ cursor: 'pointer' }}
        >
          <rect
            x={node.x - NODE_RADIUS}
            y={node.y - NODE_RADIUS}
            width={NODE_SIZE}
            height={NODE_SIZE}
            fill={fill}
            stroke={stub ? 'var(--map-arc-special, #ffb74d)' : 'var(--map-node-stroke, #444)'}
            strokeWidth={1}
            strokeDasharray={stub ? '2 1.5' : undefined}
            vectorEffect="non-scaling-stroke"
          />
          {stub && (
            // Cross-zone marker glyph — same ↗ shown in the legend.
            // Centered on the rect; small but readable at default zoom
            // and grows with the user's font-size setting. Drawn as a
            // child of the node `<g>` so hit-testing for hover/click
            // still works through the glyph (text inherits the parent's
            // cursor: pointer style).
            <text
              x={node.x}
              y={node.y}
              fontSize={NODE_SIZE + 2}
              fontWeight="bold"
              fill="var(--map-arc-special, #ffb74d)"
              textAnchor="middle"
              dominantBaseline="central"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >↗</text>
          )}
          {!stub && node.color && TOOL_GLYPHS[node.color] && (
            // Tool glyph — pickaxe for Mining, axe for Lumberjacking.
            // Sized roughly half the stub glyph (5px vs 10px) so the
            // tool reads as a small inset marker, not a dominant
            // category banner like the cross-zone arrow. White fill
            // so it reads on both the sienna and green room colors.
            // Stubs preempt this slot so a cross-zone exit in a
            // mining cluster shows ↗, not the pickaxe.
            <text
              x={node.x}
              y={node.y}
              fontSize={5}
              fill="#ffffff"
              textAnchor="middle"
              dominantBaseline="central"
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >{TOOL_GLYPHS[node.color]}</text>
          )}
        </g>
      )
    })
  ), [visibleNodes, isStubNode, onNodeClick, onNodeContextMenu, onNodeHoverEnter, onNodeHoverLeave])

  // Selected-room outline — a single overlay <rect> drawn on top of
  // nodeRects. Re-renders only when `selectedId` or the underlying node
  // moves, not on every walk step.
  const selectedNode = selectedId != null ? visibleById.get(selectedId) : undefined
  const selectedIndicator = selectedNode && (
    <rect
      x={selectedNode.x - NODE_RADIUS}
      y={selectedNode.y - NODE_RADIUS}
      width={NODE_SIZE}
      height={NODE_SIZE}
      fill="none"
      stroke="var(--accent, gold)"
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  )

  // Hover indicator — a single overlay rect glowing white-ish on the
  // hovered room. Hoisted out of nodeRects (same pattern as selected /
  // current) so a mouse move over the canvas only re-renders this one
  // element instead of every room. Color distinct from gold (selected)
  // and green (current) so the three states coexist visually without
  // ambiguity. Skipped when the user is hovering the room they're
  // already on, or the room they've selected, since those highlights
  // already cover the spot.
  const hoverNode = hoveredId != null ? visibleById.get(hoveredId) : undefined
  const hoverIndicator = hoverNode && hoverNode.id !== currentNodeId && hoverNode.id !== selectedId && (
    <rect
      x={hoverNode.x - NODE_RADIUS - 1}
      y={hoverNode.y - NODE_RADIUS - 1}
      width={NODE_SIZE + 2}
      height={NODE_SIZE + 2}
      fill="none"
      stroke="rgba(255, 255, 255, 0.85)"
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  )

  // Path preview — when the user hovers a room they can walk to, run
  // BFS from the player to that room and draw the route as a brighter
  // line over the normal arcs. Recomputes only when the hovered room
  // (or player position) changes. Compact `M x,y L x,y M x,y L x,y…`
  // path string keeps the cost to a single SVG element regardless of
  // route length.
  const hoverPathSegs = useMemo(() => {
    if (hoveredId == null) return ''
    if (!currentLocation || currentLocation.zone.id !== currentZoneId) return ''
    if (currentLocation.node.id === hoveredId) return ''
    if (!activeZone) return ''
    const ids = bfsZoneRoomPath(activeZone, currentLocation.node.id, hoveredId)
    if (ids.length < 2) return ''
    const segs: string[] = []
    for (let i = 0; i < ids.length - 1; i++) {
      const a = visibleById.get(ids[i])
      const b = visibleById.get(ids[i + 1])
      if (!a || !b) continue
      segs.push(`M${a.x},${a.y}L${b.x},${b.y}`)
    }
    return segs.join('')
  }, [hoveredId, currentLocation, currentZoneId, activeZone, visibleById])

  const hoverPathIndicator = hoverPathSegs && (
    <path
      d={hoverPathSegs}
      stroke="var(--map-current-color, #4caf50)"
      strokeWidth={2.5}
      fill="none"
      opacity={0.85}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )

  // Pinned path — drawn from the player to the LEFT-CLICKED node. Same
  // BFS routing as hover-path, but persists across mouse moves so users
  // can study a route before committing. Right-click the destination to
  // actually walk it. Gold to match the selected-node outline and stand
  // apart from the green hover-path.
  const pinnedPathSegs = useMemo(() => {
    if (selectedId == null) return ''
    if (!currentLocation || currentLocation.zone.id !== currentZoneId) return ''
    if (currentLocation.node.id === selectedId) return ''
    if (!activeZone) return ''
    const ids = bfsZoneRoomPath(activeZone, currentLocation.node.id, selectedId)
    if (ids.length < 2) return ''
    const segs: string[] = []
    for (let i = 0; i < ids.length - 1; i++) {
      const a = visibleById.get(ids[i])
      const b = visibleById.get(ids[i + 1])
      if (!a || !b) continue
      segs.push(`M${a.x},${a.y}L${b.x},${b.y}`)
    }
    return segs.join('')
  }, [selectedId, currentLocation, currentZoneId, activeZone, visibleById])

  const pinnedPathIndicator = pinnedPathSegs && (
    <path
      d={pinnedPathSegs}
      stroke="var(--accent, gold)"
      strokeWidth={2.5}
      fill="none"
      opacity={0.85}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )

  // Current-room halo — a single overlay rendered as the LAST child of
  // the SVG transform group, so it paints on top of every other element
  // (rooms, labels, arcs, selection). Re-renders only when
  // `currentNodeId` changes — not on every drag/zoom.
  //
  // Two concentric circles: a translucent dark backdrop ring at the
  // outer radius gives contrast against bright/colored rooms (so the
  // green halo reads clearly even when surrounded by red shops or lime
  // economic-room markers), and a thicker bright stroke on top is the
  // halo itself. Without the backdrop, the halo dissolved into
  // similarly-colored adjacent rooms and "looked behind" them.
  const currentNode = currentNodeId != null ? visibleById.get(currentNodeId) : undefined

  // Large-jump detection — shared by the pan group AND the "you are
  // here" indicator so the two transition (or snap) in LOCKSTEP. This
  // is the fix for indicator "bounce" during walks: the indicator
  // lives inside the pan group, so its on-screen position is
  // panTransform ∘ indicatorTransform. If only the pan transitions and
  // the indicator's world position jumps instantly, the indicator sits
  // off-centre for 150ms then slides back — every step. Giving the
  // indicator a MATCHED transition makes the two interpolations
  // cancel: lerp(panA,panB,f) + lerp(roomA,roomB,f) = centre for all
  // f, so the indicator stays pinned at screen centre while the map
  // slides beneath it. They must also SNAP together, hence one shared
  // flag. Walk steps stay well under 600px; zone switches / ◆ / fit
  // exceed it. Scale jumps > 20% snap too (wheel zoom's 1.15×/tick is
  // below the threshold and keeps its smooth transition).
  const snapTransform = (() => {
    const prev = prevTransformRef.current
    const dx = transform.x - prev.x, dy = transform.y - prev.y
    const ds = Math.abs(transform.scale - prev.scale) / Math.max(prev.scale, 0.001)
    return (dx * dx + dy * dy) > 600 * 600 || ds > 0.2
  })()

  // Indicator-specific snap — true on first appearance (nothing to
  // transition from) or when the player's room jumped a large WORLD
  // distance (teleport, room-pump cap discard, zone switch while
  // follow is off). 120 world units ≈ many rooms — a normal walk
  // step between adjacent rooms is well under it, so single steps
  // still transition smoothly. ORed with `snapTransform` so the
  // indicator snaps whenever EITHER the camera or its own room
  // jumped far.
  const indicatorSnap = (() => {
    if (!currentNode) return false
    const prev = prevIndicatorPosRef.current
    if (!prev) return true
    const dx = currentNode.x - prev.x, dy = currentNode.y - prev.y
    return (dx * dx + dy * dy) > 120 * 120
  })()
  useEffect(() => {
    prevIndicatorPosRef.current = currentNode ? { x: currentNode.x, y: currentNode.y } : null
  }, [currentNode])

  // Locator ring radius — 1.3125× NODE_SIZE (was 1.75×; trimmed 25%
  // per tester feedback that the ring read too large around the room).
  // Sonar-ping base radius. The PINGS keep this larger radius — they're
  // translucent and fade as they expand, so they read through any text they
  // sweep over (Sekmeht). The SOLID ring below uses SOLID_R instead.
  const INDICATOR_R = NODE_SIZE * 1.3125
  // The opaque solid ring sits TIGHT on the node square (Sekmeht): at
  // INDICATOR_R its stroke band sprawled ~6px past the node and crossed
  // neighbouring room labels with no way to read through. Node-fitting radius
  // confines that opaque band to the node itself.
  const SOLID_R = NODE_SIZE * 0.5
  const currentIndicator = currentNode && (
    <g
      pointerEvents="none"
      className={!isDragging && !zooming && mapAnimations ? 'genie-pan-smooth' : undefined}
      style={{
        // Transitions in lockstep with the pan group (same class) so
        // the halo stays centred instead of bouncing. Snaps when the
        // camera jumped far (`snapTransform`) OR the indicator's own
        // room jumped far (`indicatorSnap` — covers follow-off jumps).
        transform: `translate(${currentNode.x}px, ${currentNode.y}px)`,
        ...((snapTransform || indicatorSnap) ? { transition: 'none' as const } : {}),
      }}
    >
      {/* Sonar pings — two expanding rings staggered half a cycle apart
          so a fresh ring emanates every ~1s. Drawn FIRST so the crisp
          solid ring always paints on top and the exact room stays
          unambiguous. `non-scaling-stroke` keeps the expanding ring a
          thin constant-width line as it grows. The CSS-scale animates
          around the circle's own centre (cx/cy = 0). */}
      <circle
        className="genie-here-ping"
        cx={0} cy={0} r={INDICATOR_R}
        fill="none"
        stroke="var(--map-current-color, #4caf50)"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        className="genie-here-ping genie-here-ping--delayed"
        cx={0} cy={0} r={INDICATOR_R}
        fill="none"
        stroke="var(--map-current-color, #4caf50)"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* Solid ring — dark backdrop stroke for contrast against bright
          rooms, bright green stroke on top. Always crisp, never moves. Sized
          to SOLID_R (the node square) + thinner strokes so it reads as a tight
          ring ON the node rather than an opaque band sprawling over labels. */}
      <circle
        cx={0}
        cy={0}
        r={SOLID_R}
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={0}
        cy={0}
        r={SOLID_R}
        fill="none"
        stroke="var(--map-current-color, #4caf50)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        opacity={1}
      />
      {/* v0.8.2: bullseye centre dot. In dense clusters where multiple
          rooms sit inside the same sonar ring radius, the dot pins the
          exact room at a glance. Dark backdrop dot + bright accent dot
          on top, same dual-contrast trick the ring uses. Radius scales
          with the indicator; at typical zooms this is a 3-4px dot. */}
      <circle cx={0} cy={0} r={2}   fill="rgba(0,0,0,0.55)" />
      <circle cx={0} cy={0} r={1.2} fill="var(--map-current-color, #4caf50)" />
    </g>
  )

  // ── Render guards ──────────────────────────────────────────────────────
  if (!genieMapsDir) {
    return (
      <div className="map-canvas-wrap">
        <div className="map-empty">
          <div className="map-empty-icon">🗺</div>
          <div className="map-empty-msg">No Genie maps folder set</div>
          <div className="map-empty-sub">
            Genie Maps need a folder of community-maintained XML map files.
            <br />
            Download from the <a href="https://github.com/elanthia-online/scripts" target="_blank" rel="noreferrer">elanthia-online maps</a> and point Lichborne at the folder.
          </div>
          <button className="map-btn" onClick={onPickGenieFolder} style={{ marginTop: 12, pointerEvents: 'auto' }}>
            📁 Pick Genie maps folder…
          </button>
        </div>
      </div>
    )
  }

  if (genieLoading) {
    return (
      <div className="map-canvas-wrap">
        <div className="map-overlay">
          <span className="map-loading">
            Loading Genie maps{genieProgress ? ` (${genieProgress.loaded}/${genieProgress.total})` : '…'}
          </span>
        </div>
      </div>
    )
  }

  if (!genieReady || zones.size === 0) {
    return (
      <div className="map-canvas-wrap">
        <div className="map-empty">
          <div className="map-empty-icon">🗺</div>
          <div className="map-empty-msg">No zones loaded</div>
          <div className="map-empty-sub">
            Folder: <code>{genieMapsDir}</code>
            <br />
            No <code>.xml</code> files were parsed.
          </div>
          <button className="map-btn" onClick={onPickGenieFolder} style={{ marginTop: 12, pointerEvents: 'auto' }}>
            📁 Pick a different folder…
          </button>
        </div>
      </div>
    )
  }

  return (
    // `flex: 1; min-height: 0` is inherited from `.map-canvas-wrap` —
    // we add `display: flex; flex-direction: column` to lay out the
    // internal toolbar/subbar/canvas/footer. NO inline `height: 100%`:
    // it would override the CSS flex sizing and at narrow panel
    // heights pushes the MapPanel's outer toolbar (Lich/Genie tabs)
    // off-screen because the wrap tries to be 100% of the *parent*
    // before the parent has subtracted its own children's heights.
    <div className="map-canvas-wrap" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Toolbar */}
      <div className="map-toolbar" style={{ flexShrink: 0 }}>
        <button className="map-btn" onClick={onPickGenieFolder}
          title={`Choose the Genie maps folder (current: ${genieMapsDir})`}
          aria-label="Choose the Genie maps folder">📁</button>
        <select
          className="map-select"
          aria-label="Zone"
          title="Zone — follows you automatically as you move; pick one to browse it"
          value={currentZoneId}
          onChange={e => {
            setCurrentZoneId(e.target.value)
            const z = zones.get(e.target.value)
            if (z) {
              const levels = new Set(z.nodes.map(n => n.z))
              setCurrentLevel(levels.size > 0 ? Math.min(...levels) : 0)
            }
          }}
          style={{ minWidth: 200 }}
        >
          <option value="">— Browse a zone —</option>
          {sortedZones.map(z => (
            <option key={z.id} value={z.id}>{z.id}: {z.name}</option>
          ))}
        </select>
        <span className="map-toolbar-location">
          {currentLocation
            ? `📍 ${currentLocation.zone.name === activeZone?.name ? 'here' : currentLocation.zone.name}`
            : ''}
        </span>
      </div>

      {/* Subbar — level chips + fit / center / stop-walk + legend toggle */}
      <div className="map-subbar" style={{ flexShrink: 0 }}>
        <button
          className={`map-btn${followPlayer && currentLocation ? ' map-btn--active' : ''}`}
          onClick={centerOnCurrent}
          disabled={!currentLocation}
          // B336: a disabled button says WHY it's disabled.
          title={!currentLocation
            ? 'Take me to my current room — unavailable until your room is matched on these Genie maps (move or LOOK)'
            : followPlayer ? 'Following — manual pan or zoom to release' : 'Take me to my current room (enables follow)'}
        >◆</button>
        <button className="map-btn" onClick={fitToView} title="Fit zone to view">⊡</button>
        <button
          className={`map-btn${showLegend ? ' map-btn--active' : ''}`}
          onClick={() => setShowLegend(s => !s)}
          disabled={zoneColors.length === 0 && arcCategories.length === 0 && !hasStubs}
          title={zoneColors.length === 0 && arcCategories.length === 0 && !hasStubs
            ? 'Legend — nothing to explain on this level (no coloured rooms, path types or cross-zone exits)'
            : showLegend ? 'Hide the legend' : 'Show the legend (room colours, path types, cross-zone exits)'}
        >▤</button>
        {walking && (
          <button className="map-btn" onClick={stopWalk} title="Stop walk">■</button>
        )}
        {zoneLevels.length > 1 && (
          <span className="map-level-chips"
            title="Map levels — this zone stacks some areas (upstairs, underground) on separate levels">
            z:
            {zoneLevels.map(z => (
              <button
                key={z}
                className={`map-chip${z === currentLevel ? ' map-chip--active' : ''}`}
                onClick={() => setCurrentLevel(z)}
                title={z === currentLevel ? `Showing level ${z}` : `Show level ${z} of this zone`}
                aria-pressed={z === currentLevel}
              >{z}</button>
            ))}
          </span>
        )}
        <span style={{ flex: 1 }} />
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Waiting placeholder — shown when there's no active zone yet.
            Common case: Genie maps loaded but the player hasn't connected
            (or hasn't entered a room with a Genie match) and the user
            hasn't manually picked a zone from the dropdown.
            Uses the shared .map-empty-* classes rather than inline styles, so
            it is themed and sized by exactly the same rules as its sibling
            empty states ("No Genie maps folder set", "No zones loaded")
            instead of carrying its own copy of them. */}
        {!activeZone && (
          <div className="map-overlay" style={{ pointerEvents: 'none' }}>
            <div className="map-empty">
              <div className="map-empty-icon">🗺</div>
              <div className="map-empty-msg">{zones.size} zones loaded · waiting for game data</div>
              <div className="map-empty-sub">
                Connect to a character, or pick a zone from the dropdown above to browse.
              </div>
            </div>
          </div>
        )}
        <svg
          ref={setSvgRef}
          style={{ width: '100%', height: '100%', background: 'var(--map-bg, #1a1a1a)', cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onContextMenu={e => e.preventDefault()}
        >
          {/*
            Pan/zoom group.
            - `willChange: transform` promotes the subtree to its own
              composited layer so dragging doesn't force a full re-paint of
              the rest of the panel.
            - We do NOT toggle `pointer-events` here based on drag state:
              `isDragging` flips to true on mousedown, before `click` fires,
              and turning off pointer-events at that point makes the click
              target the SVG root instead of the inner node `<g>` — which
              silently breaks click-to-walk. Hover work is short-circuited
              inside `onNodeHoverEnter` instead (see dragRef check there).
          */}
          <g
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              willChange: 'transform',
              // `snapTransform` (shared with the indicator) skips the
              // transition for big jumps — zone switch, ◆ from afar,
              // fit-to-view — which at 150ms would visibly "race across"
              // the screen. Walk steps stay smooth.
              ...(snapTransform ? { transition: 'none' as const } : {}),
            }}
            // Class hooks (mutually exclusive freeze classes + an
            // independent transition class):
            //   1. `genie-anim-off` — persistent freeze when the player
            //      has turned off `mapAnimations` (Settings → Genie Map
            //      Animations). Pauses EVERY descendant animation,
            //      including the locator sonar ping.
            //   2. `genie-pan-dragging` — transient freeze while
            //      panning/walking. Pauses category animations but
            //      EXEMPTS the ping (you still want to see yourself
            //      mid-walk). Only used when animations are on.
            //   3. `genie-pan-smooth` — CSS transition on `transform`
            //      for the camera glide. Gated on `mapAnimations` (the
            //      same Settings toggle), suppressed while `isDragging`.
            //      Independent of the freeze classes.
            className={[
              !mapAnimations
                ? 'genie-anim-off'
                : (isDragging || inMotion || zooming) ? 'genie-pan-dragging' : '',
              !isDragging && !zooming && mapAnimations ? 'genie-pan-smooth' : '',
            ].filter(Boolean).join(' ') || undefined}
          >
            {/* Aura layer — soft translucent halos behind COLOR_LEGEND
                rooms (shops, healers, stat trainers, etc.). Drawn first
                so every other layer paints over them; auras are
                background "this room is special" signaling, not foreground. */}
            {auras}
            {/* Arc UNDER-pass — full opacity. Drawn first so node rects
                paint on top; outside clusters this is the only arc layer
                you ever see. Inside clusters the rects hide this layer —
                that's where the over-pass takes over. */}
            {arcPathsUnder}
            {/* Floating labels — landmark names like "Temple of Light",
                "Barber", etc. Below nodes so room markers paint on top. */}
            {labelTexts}
            {/* Nodes — base layer, memoized per zone. */}
            {nodeRects}
            {/* Arc OVER-pass — faint trace drawn on top of rect fills so
                a line entering a dense cluster stays visible all the way
                to its endpoint. Outside clusters this is barely
                perceptible; inside clusters it answers "which room does
                this arc actually connect to?" */}
            {arcPathsOver}
            {/* Healer heartbeats — PRIORITY effect: rendered whenever map
                animations are on at all (even mid-travel), zone-wide, so a
                healer is always findable. Cheap (healers are rare). */}
            {mapAnimations && heartbeats}
            {/* Animated per-category effects — sparkles, coin glints, ripples,
                bubbles, caution/implode rings, leaf/dirt falls, XP rises. Each
                animates `transform`/`opacity`, so each is its own compositor
                layer. Mounted ONLY when `showEffects` (animations on, not
                panning, not travelling) — during travel they're omitted
                entirely so there are no layers to churn. They re-mount once
                the player has been still for MOTION_QUIET_MS, and the set is
                viewport-culled (see `nearbyNodes`). */}
            {showEffects && (
              <>
                {sparkles}
                {coinGlints}
                {ripples}
                {bubbles}
                {cautionRings}
                {implodes}
                {leafFalls}
                {dirtFalls}
                {xpRises}
              </>
            )}
            {/* Hover path preview — bright line tracing the BFS route from
                the player to the hovered room. Sits above the arc layers
                so it visually wins over them, but below the indicators so
                the gold "selected" and green "you are here" markers still
                read clearly. */}
            {pinnedPathIndicator}
            {hoverPathIndicator}
            {/* Hover indicator — subtle white outline on the hovered
                room itself. Distinct from selected (gold) and current
                (green) so all three highlights coexist. */}
            {hoverIndicator}
            {/* Selection + current-room indicators are hoisted out of
                nodeRects so walking / clicking only re-renders these two
                elements instead of the entire node array. */}
            {selectedIndicator}
            {currentIndicator}
          </g>
        </svg>

        {/* Hover tooltip. Floats at cursor in screen pixels (not SVG world
            coords). Skipped when hovering empty space or while the user is
            mid-drag. Built block-by-block from whatever node data is
            available — every section is conditional so unset fields don't
            render an empty line. */}
        {hoveredNode && tooltipPos && !isDragging && (() => {
          const stub        = isStubNode(hoveredNode)
          const stubXml     = stub ? noteAliases(hoveredNode.note).find(a => a.toLowerCase().endsWith('.xml')) : undefined
          const stubTarget  = stubXml ? sourceFileToZoneId.get(stubXml.toLowerCase()) : undefined
          const stubZone    = stubTarget ? zones.get(stubTarget) : undefined
          const aliasNotes  = noteAliases(hoveredNode.note).filter(a => !a.toLowerCase().endsWith('.xml'))
          const colorEntry  = hoveredNode.color ? COLOR_LEGEND[hoveredNode.color] : undefined
          const exitsLine   = hoveredNode.arcs
            .filter(a => a.exit || a.move)
            .map(a => a.exit || a.move)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(', ')
          // Tooltip is anchored at the cursor + (12, 12), but on a small
          // panel (or near a canvas edge) that ideal position can push
          // it outside the canvas bounds. Strategy:
          //   1. Cap the tooltip's max width to the available canvas
          //      space (minus padding) — on narrow panels the tooltip
          //      shrinks so its content wraps tighter rather than
          //      overflowing.
          //   2. Flip to the opposite side of the cursor when the ideal
          //      position would still overflow.
          //   3. Clamp the final position so even when canvas < ideal
          //      tooltip width, the tooltip is pinned inside the canvas.
          // Heights are harder — content is variable and we don't
          // measure it — so we use a conservative estimate for the flip
          // decision and don't clamp the bottom edge (lets tall tooltips
          // run past on extreme cases rather than truncating content).
          const TT_MAX_W = 320
          const TT_MIN_W = 80
          const TT_EST_H = 180
          const EDGE_PAD = 6
          const canvas   = svgRef.current
          const canvasW  = canvas?.clientWidth  ?? Number.POSITIVE_INFINITY
          const canvasH  = canvas?.clientHeight ?? Number.POSITIVE_INFINITY
          const ttW = Math.max(TT_MIN_W, Math.min(TT_MAX_W, canvasW - 2 * EDGE_PAD))
          const flipX = tooltipPos.x + 12 + ttW > canvasW
          const flipY = tooltipPos.y + 12 + TT_EST_H > canvasH
          const idealLeft = flipX ? tooltipPos.x - 12 - ttW : tooltipPos.x + 12
          const idealTop  = flipY ? tooltipPos.y - 12 - TT_EST_H : tooltipPos.y + 12
          // Clamp left so the tooltip stays inside the canvas regardless
          // of cursor position. Top is only floored at EDGE_PAD — tooltips
          // can run past the bottom on extremely tall content rather than
          // clipping it.
          const left = Math.max(EDGE_PAD, Math.min(idealLeft, canvasW - ttW - EDGE_PAD))
          const top  = Math.max(EDGE_PAD, idealTop)
          return (
            <div
              style={{
                position: 'absolute',
                left,
                top,
                maxWidth: ttW,
                padding: '6px 9px',
                background: 'var(--map-chrome-bg, rgba(20, 20, 22, 0.95))',
                border: '1px solid var(--map-border, #555)',
                borderRadius: 4,
                fontSize: PANEL_FONT,
                color: 'var(--map-text, #ddd)',
                pointerEvents: 'none',
                zIndex: 10,
                lineHeight: 1.4,
              }}
            >
              {/* Room name — primary heading */}
              <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                {hoveredNode.name || '(unnamed room)'}
              </div>

              {/* Map / room ID — Genie's per-zone numeric ID; useful for
                  scripts that target specific rooms. Zone ID is the Genie
                  XML zone attribute (e.g., 67 for Shard). */}
              <div style={{ color: 'var(--map-text-muted, #888)', fontSize: '0.91em', marginBottom: 2 }}>
                Map {hoveredNode.zoneId || '?'}: {hoveredNode.zoneName || '?'} · Room #{hoveredNode.id}
              </div>

              {/* Stub: amber callout naming where the boundary leads. The
                  "what happens on click" guidance lives at the bottom of
                  the tooltip with the regular click-to-walk hint, so this
                  line stays purely descriptive. */}
              {stub && (
                <div style={{ color: 'var(--map-arc-special, #ffb74d)', fontSize: '0.91em', marginBottom: 2 }}>
                  ↗ Cross-zone exit{stubZone ? ` → ${stubZone.name}` : stubXml ? ` → ${stubXml}` : ''}
                </div>
              )}

              {/* Color category — what the Genie maps team's color
                  convention says this room is (shop, healer, etc.). Only
                  shown when the room has a recognized legend color. */}
              {colorEntry && (
                <div style={{ fontSize: '0.91em', marginBottom: 2 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8,
                    background: hoveredNode.color, marginRight: 5,
                    border: '1px solid var(--map-border, #555)',
                    verticalAlign: 'middle',
                  }} />
                  <span style={{ color: 'var(--map-text, #ddd)' }}>{colorEntry.name}</span>
                  <span style={{ color: 'var(--map-text-muted, #888)' }}> — {colorEntry.desc}</span>
                </div>
              )}

              {/* Aliases — note-field entries that aren't xml stub markers.
                  These are the alternate names Genie indexes the room by
                  ("First Land Herald|Herald|newspaper|news stand"). */}
              {aliasNotes.length > 0 && (
                <div style={{ color: 'var(--map-text-muted, #888)', fontSize: '0.91em', marginBottom: 2 }}>
                  Aliases: {aliasNotes.join(', ')}
                </div>
              )}

              {/* Exits list — direction names from the room's arcs. Includes
                  hidden arcs (they're walkable; we just don't draw their
                  lines on the canvas). */}
              {exitsLine && (
                <div style={{ color: 'var(--map-text-muted, #888)', fontSize: '0.91em' }}>
                  Exits: {exitsLine}
                </div>
              )}

              {/* Action hint — what each click button does. Left-click is
                  zone-switch for stubs and pin-a-path for regular rooms;
                  right-click walks. Pinning doesn't teleport the displayed
                  view across zone boundaries either — the auto-zone-switch
                  on title change is the authoritative trigger. */}
              {currentLocation && currentLocation.zone.id === currentZoneId && currentLocation.node.id !== hoveredNode.id && (
                <div style={{ color: 'var(--map-text-muted, #888)', fontSize: '0.91em', marginTop: 2, fontStyle: 'italic' }}>
                  {stub
                    ? <>Left-click: go to {stubZone?.name ?? stubXml ?? 'next zone'}<br/>Right-click: walk to boundary</>
                    : <>Left-click: pin path<br/>Right-click: walk here</>}
                </div>
              )}
            </div>
          )
        })()}

        {/* Legend overlay — only categories present in the current floor. */}
        {showLegend && (zoneColors.length > 0 || arcCategories.length > 0 || hasStubs) && (
          <div
            style={{
              position: 'absolute',
              top: 8, right: 8, bottom: 8,   // bottom anchor so the box can't outgrow the canvas
              maxWidth: 260,
              padding: '6px 9px',
              background: 'var(--map-chrome-bg, rgba(20, 20, 22, 0.95))',
              border: '1px solid var(--map-border, #555)',
              borderRadius: 4,
              fontSize: PANEL_FONT,
              color: 'var(--map-text, #ddd)',
              zIndex: 5,
              overflowY: 'auto',              // scroll when content exceeds available height
              overscrollBehavior: 'contain',   // don't bubble wheel events to the map
            }}
          >
            {/* Layout pattern for every row: swatch / icon on the left, all
                text in a single flex-1 column on the right. Putting name +
                description inside one container lets the text reflow as one
                wrapped block instead of fighting each other as siblings. */}

            {/* Room colors */}
            {zoneColors.length > 0 && (
              <>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.91em', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Room colors
                </div>
                {zoneColors.map(color => {
                  const entry = COLOR_LEGEND[color]
                  return (
                    <div key={color} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                      <span style={{
                        flexShrink: 0,
                        display: 'inline-block', width: 10, height: 10,
                        background: color, border: '1px solid var(--map-border, #555)',
                        alignSelf: 'center',
                      }} />
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 'bold' }}>{entry?.name}</span>
                        <span style={{ color: 'var(--map-text-muted, #888)' }}> — {entry?.desc}</span>
                      </span>
                    </div>
                  )
                })}
              </>
            )}

            {/* Arc colors */}
            {arcCategories.length > 0 && (
              <>
                <div style={{
                  fontWeight: 'bold', fontSize: '0.91em', textTransform: 'uppercase', letterSpacing: 0.5,
                  marginTop: zoneColors.length > 0 ? 8 : 0, marginBottom: 4,
                }}>
                  Arc types
                </div>
                {arcCategories.map(cat => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                    <svg width={14} height={10} style={{ flexShrink: 0, alignSelf: 'center' }}>
                      <line x1={1} y1={5} x2={13} y2={5} stroke={ARC_COLOR_VAR[cat]} strokeWidth={1.5} />
                    </svg>
                    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                      <span style={{ fontWeight: 'bold' }}>
                        {cat === 'cardinal' ? 'Cardinal' : cat === 'climb' ? 'Climb' : 'Go / Door / Up / Down'}
                      </span>
                      <span style={{ color: 'var(--map-text-muted, #888)' }}>
                        {cat === 'cardinal' ? ' — north/south/east/west/etc.'
                        : cat === 'climb'    ? ' — ladders, stairs, climb exits'
                        :                       ' — go-target rooms (doors, portals)'}
                      </span>
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Cross-zone stub marker */}
            {hasStubs && (
              <>
                <div style={{
                  fontWeight: 'bold', fontSize: '0.91em', textTransform: 'uppercase', letterSpacing: 0.5,
                  marginTop: (zoneColors.length > 0 || arcCategories.length > 0) ? 8 : 0, marginBottom: 4,
                }}>
                  Cross-zone exits
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <svg width={14} height={14} style={{ flexShrink: 0, alignSelf: 'center' }}>
                    <rect x={2} y={2} width={10} height={10} fill="none"
                          stroke="var(--map-arc-special, #ffb74d)" strokeWidth={1} strokeDasharray="2 1.5" />
                    <text x={7} y={11} fontSize={9} fill="var(--map-arc-special, #ffb74d)" textAnchor="middle">↗</text>
                  </svg>
                  <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35, color: 'var(--map-text-muted, #888)' }}>
                    Left-click: switch to that zone · Right-click: walk to boundary
                  </span>
                </div>
              </>
            )}

            {/* Room glyphs — small icons rendered ON the rect for
                specific gathering categories. Listed only when those
                rooms actually appear on the current floor (same
                contextual gating as the color/arc sections). */}
            {(() => {
              const showPickaxe = visibleNodes.some(n => n.color === '#993300')
              const showAxe     = visibleNodes.some(n => n.color === '#008000')
              if (!showPickaxe && !showAxe) return null
              const headerTop = (zoneColors.length > 0 || arcCategories.length > 0 || hasStubs) ? 8 : 0
              return (
                <>
                  <div style={{
                    fontWeight: 'bold', fontSize: '0.91em', textTransform: 'uppercase', letterSpacing: 0.5,
                    marginTop: headerTop, marginBottom: 4,
                  }}>
                    Room glyphs
                  </div>
                  {showPickaxe && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                      <span style={{
                        flexShrink: 0, width: 12, textAlign: 'center',
                        fontWeight: 'bold', alignSelf: 'center',
                      }}>{TOOL_GLYPHS['#993300']}</span>
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 'bold' }}>Pickaxe</span>
                        <span style={{ color: 'var(--map-text-muted, #888)' }}> — Mining room</span>
                      </span>
                    </div>
                  )}
                  {showAxe && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                      <span style={{
                        flexShrink: 0, width: 12, textAlign: 'center',
                        fontWeight: 'bold', alignSelf: 'center',
                      }}>{TOOL_GLYPHS['#008000']}</span>
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 'bold' }}>Axe</span>
                        <span style={{ color: 'var(--map-text-muted, #888)' }}> — Lumberjacking room</span>
                      </span>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* Footer status. fontSize is deliberately fixed px (B201) — toolbar
          chrome, not reading text; the reading surfaces (tooltip, legend) sit
          on the panel font via PANEL_FONT. Don't "fix" this to em. */}
      <div style={{
        flexShrink: 0, padding: '4px 8px', fontSize: 11,
        color: 'var(--map-text-muted, #888)',
        borderTop: '1px solid var(--map-border-subtle, #333)',
      }}>
        {activeZone ? `${activeZone.name} · ${visibleNodes.length} rooms` : ''}
        {zones.size > 0 && ` · ${zones.size} zones loaded`}
      </div>
    </div>
  )
}
