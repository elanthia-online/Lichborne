// Da'Maps — fold Genie sub-maps into the map they belong to.
//
// The Genie maps split a town into a main map plus sub-maps for buildings and
// side areas ("Map1m_Crossing_Jadewater_Mansion" belongs to "Map1_Crossing"),
// joined by boundary markers (stub nodes whose note names the other file).
// Genie's client shows them one at a time; Da'Maps shows one connected map:
//
//  - a sub-map is a zone whose id is its parent's number plus letters (1m, 2a,
//    67a), smaller than its parent, with one or two doors each way (tunnel
//    networks that open all over town stay separate);
//    its parent is the map it links to most (Crossing Temple, "2a", links to
//    the Crossing even though Genie numbers it under Lake of Dreams);
//  - it's set down with its entrance where the parent's marker for it sat,
//    or as close as it fits without its box covering any of the parent's
//    rooms;
//  - the marker is replaced by the real entrance room, and the sub-map's own
//    marker pointing back is replaced by the parent's door room, so the
//    door → entrance line is drawn like any other exit.
//
// Pure; returns new zone objects and leaves the input untouched.

import type { GenieZone, GenieNode, GenieArc } from '../../mapTypes'
import { isStub } from './genieMatch'

const SUBMAP_ID = /^(\d+)([a-z]+)$/i
const PAD = 14          // clear space kept round a sub-map
const STEP = 10         // search step when the ideal spot is taken
const MAX_R = 900       // how far from its marker a sub-map may move

export interface MergedZones {
  zones: Map<string, GenieZone>
  /** sub-map zone id → the zone it was folded into */
  parentOf: Map<string, string>
}

function stubFile(n: GenieNode): string {
  return (n.note?.match(/[^|]*\.xml/i)?.[0] ?? '').trim().toLowerCase()
}

export function mergeSubMaps(input: Map<string, GenieZone>): MergedZones {
  const byFile = new Map<string, string>()
  for (const z of input.values()) byFile.set(z.sourceFile.toLowerCase(), z.id)

  // How strongly each pair of maps is linked by boundary markers.
  // markers[a][b] = how many boundary markers on map a lead to map b
  const markers = new Map<string, Map<string, number>>()
  for (const z of input.values()) for (const n of z.nodes) {
    if (!isStub(n)) continue
    const t = byFile.get(stubFile(n))
    if (!t || t === z.id) continue
    if (!markers.has(z.id)) markers.set(z.id, new Map())
    markers.get(z.id)!.set(t, (markers.get(z.id)!.get(t) ?? 0) + 1)
  }
  const count = (a: string, b: string) => markers.get(a)?.get(b) ?? 0

  // Each sub-map's parent.
  const parentOf = new Map<string, string>()
  for (const z of input.values()) {
    const m = SUBMAP_ID.exec(z.id)
    if (!m || Number(m[1]) >= 500) continue          // 500+ are festival/quest maps
    // Only a building-like sub-map: one or two doors each way. Tunnel and
    // passage networks (thief passages, escape tunnels) open all over town,
    // so folding them in would draw lines across it; they stay their own map.
    const outAll = [...(markers.get(z.id)?.values() ?? [])].reduce((x, y) => x + y, 0)
    let inAll = 0
    for (const m of markers.values()) inAll += m.get(z.id) ?? 0
    if (outAll > 3 || inAll > 3) continue
    const best = [...(markers.get(z.id) ?? new Map<string, number>()).keys()]
      .filter(o => (input.get(o)?.nodes.length ?? 0) > z.nodes.length)
      .map(o => [o, count(o, z.id), count(z.id, o)] as const)
      .filter(([, inbound, outbound]) => inbound >= 1 && inbound <= 2 && outbound <= 2)
      .sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]))[0]
    if (best) parentOf.set(z.id, best[0])
  }
  // Follow chains up to a map that isn't itself folded in (no cycles).
  const rootOf = (id: string) => {
    const seen = new Set<string>()
    let r = id
    while (parentOf.has(r) && !seen.has(r)) { seen.add(r); r = parentOf.get(r)! }
    return r
  }
  const childrenOf = new Map<string, string[]>()
  for (const c of parentOf.keys()) {
    const root = rootOf(c)
    if (root === c) continue
    if (!childrenOf.has(root)) childrenOf.set(root, [])
    childrenOf.get(root)!.push(c)
  }

  const out = new Map<string, GenieZone>()
  const folded = new Map<string, string>()
  for (const z of input.values()) {
    if (parentOf.has(z.id) && rootOf(z.id) !== z.id) continue
    const kids = childrenOf.get(z.id)
    if (!kids?.length) { out.set(z.id, z); continue }
    out.set(z.id, foldInto(z, kids.map(k => input.get(k)!), byFile))
    for (const k of kids) folded.set(k, z.id)
  }
  return { zones: out, parentOf: folded }
}

function foldInto(parent: GenieZone, kids: GenieZone[], byFile: Map<string, string>): GenieZone {
  const group = new Set([parent.id, ...kids.map(k => k.id)])
  const nodes: GenieNode[] = parent.nodes.map(n => ({ ...n, arcs: n.arcs.map(a => ({ ...a })) }))
  const labels = [...parent.labels]
  const byId = new Map(nodes.map(n => [n.id, n]))
  let nextId = Math.max(0, ...nodes.map(n => n.id)) + 1

  const pending = [...kids]
  // Place sub-maps that hang off what's already placed first, biggest first,
  // so a chain (Crossing → Temple → Temple crypt) lands in order.
  const stubsTo = (zoneId: string) => nodes.filter(n => isStub(n) && byFile.get(stubFile(n)) === zoneId)
  for (let guard = 0; pending.length && guard < 100; guard++) {
    pending.sort((a, b) => (stubsTo(b.id).length ? 1 : 0) - (stubsTo(a.id).length ? 1 : 0) || b.nodes.length - a.nodes.length)
    const kid = pending.shift()!
    const markers = stubsTo(kid.id)
    const real = kid.nodes.filter(n => !(isStub(n) && group.has(byFile.get(stubFile(n)) ?? '')))
    if (!real.length) continue

    // The entrance: the room the parent's marker names.
    const marker = markers[0]
    const entrance = (marker && real.find(n => n.name === marker.name)) ?? real[0]
    const ideal = marker ? [marker.x - entrance.x, marker.y - entrance.y, marker.z - entrance.z] : [0, 0, 0]

    // Its box must not cover any room already on this map (markers for it
    // are about to go, so they don't count).
    const markerIds = new Set(markers.map(m => m.id))
    const xs = real.map(n => n.x), ys = real.map(n => n.y)
    const bx1 = Math.min(...xs) - PAD, by1 = Math.min(...ys) - PAD, bx2 = Math.max(...xs) + PAD, by2 = Math.max(...ys) + PAD
    const zs = new Set(real.map(n => n.z + ideal[2]))
    const others = nodes.filter(n => !markerIds.has(n.id) && zs.has(n.z))
    const fits = (dx: number, dy: number) => !others.some(n => n.x >= bx1 + dx && n.x <= bx2 + dx && n.y >= by1 + dy && n.y <= by2 + dy)
    let off: [number, number] | null = fits(ideal[0], ideal[1]) ? [ideal[0], ideal[1]] : null
    for (let r = STEP; !off && r <= MAX_R; r += STEP) {
      let best: [number, number] | null = null, bd = Infinity
      for (let i = -r; i <= r; i += STEP) for (const [dx, dy] of [[i, -r], [i, r], [-r, i], [r, i]]) {
        const d = dx * dx + dy * dy
        if (d < bd && fits(ideal[0] + dx, ideal[1] + dy)) { bd = d; best = [ideal[0] + dx, ideal[1] + dy] }
      }
      off = best
    }
    if (!off) {
      // Nowhere near: below everything.
      const maxY = Math.max(...nodes.map(n => n.y))
      off = [ideal[0], maxY + PAD * 2 - by1]
    }

    // Copy the sub-map's rooms in under fresh ids.
    const idMap = new Map<number, number>()
    for (const n of real) idMap.set(n.id, nextId++)
    // Its markers pointing back into this group: stand-ins for the parent's
    // door room (the room the parent marker's exit leads from).
    const doorOf = new Map<number, number>()
    for (const n of kid.nodes) {
      if (idMap.has(n.id)) continue
      const target = byFile.get(stubFile(n))
      const m = markers.find(mk => mk.name === entrance.name) ?? markers[0]
      const door = m?.arcs.map(a => a.destination).find(d => d && byId.has(d) && !isStub(byId.get(d)!))
      if (target && door !== undefined) doorOf.set(n.id, door)
    }
    // A marker whose parent door couldn't be found stands for the parent room
    // of the same name, when there is exactly one.
    const kidById = new Map(kid.nodes.map(n => [n.id, n]))
    const idMapValues = new Set(idMap.values())
    const parentByName = (name: string) => {
      const hits = nodes.filter(p => p.name === name && !isStub(p) && !idMapValues.has(p.id))
      return hits.length === 1 ? hits[0].id : undefined
    }
    for (const n of real) {
      const arcs: GenieArc[] = []
      for (const a of n.arcs) {
        let d = idMap.get(a.destination) ?? doorOf.get(a.destination)
        if (d === undefined && a.destination) {
          // Never keep the sub-map's own number: on the parent map it names
          // an unrelated room (Crossing Temple's gate drew a line to Magen
          // Road this way). Use the same-named parent room, else no line.
          const k = kidById.get(a.destination)
          d = k ? parentByName(k.name) : undefined
          arcs.push({ ...a, destination: d ?? 0 })
          continue
        }
        arcs.push(d !== undefined ? { ...a, destination: d } : { ...a })
      }
      const copy: GenieNode = { ...n, id: idMap.get(n.id)!, x: n.x + off[0], y: n.y + off[1], z: n.z + ideal[2], zoneId: parent.id, zoneName: parent.name, arcs }
      nodes.push(copy)
      byId.set(copy.id, copy)
    }
    for (const l of kid.labels) labels.push({ ...l, x: l.x + off[0], y: l.y + off[1], z: l.z + ideal[2] })

    // Replace each parent marker for this sub-map with the matching room.
    for (const m of markers) {
      const into = real.find(n => n.name === m.name) ?? entrance
      const newId = idMap.get(into.id)!
      for (const n of nodes) for (const a of n.arcs) if (a.destination === m.id) a.destination = newId
      const i = nodes.indexOf(m)
      if (i >= 0) nodes.splice(i, 1)
      byId.delete(m.id)
    }
  }

  return { ...parent, nodes, labels }
}
