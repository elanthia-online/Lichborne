// Read a Genie map XML file into the GenieZone shape, without a DOM (this runs
// in Node, at map-build time only). Same result as the app's parseGenieZone:
// zone name/id, nodes with descriptions, position, colour, note and arcs, and
// the free-standing <label> place names.

import type { GenieZone, GenieNode } from '../../src/renderer/components/panels/mapTypes'

const NAMED: Record<string, string> = {
  aqua: '#00FFFF', blue: '#0000FF', lime: '#00FF00', red: '#FF0000', white: '#FFFFFF',
  yellow: '#FFFF00', fuchsia: '#FF00FF', magenta: '#FF00FF', orange: '#FF8000', purple: '#800080',
  navy: '#000080', green: '#008000', black: '#000000', gray: '#808080', grey: '#808080',
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m)

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = decode(m[3] ?? m[4] ?? '')
  return out
}
const color = (raw?: string) => {
  if (!raw) return undefined
  return NAMED[raw.toLowerCase()] ?? raw.replace(/^#+/, '#').toUpperCase()
}

export function readGenieXml(xml: string, sourceFile: string): GenieZone {
  const zoneTag = /<zone\b([^>]*)>/i.exec(xml)
  const za = zoneTag ? attrs(zoneTag[1]) : {}
  const zone: GenieZone = {
    name: za.name ?? sourceFile.replace(/\.xml$/i, ''), id: za.id ?? '',
    sourceFile, nodes: [], labels: [],
  }
  for (const m of xml.matchAll(/<node\b([^>]*?)(\/>|>([\s\S]*?)<\/node>)/gi)) {
    const a = attrs(m[1])
    const body = m[3] ?? ''
    const pos = /<position\b([^>]*)\/?>/i.exec(body)
    const p = pos ? attrs(pos[1]) : {}
    const node: GenieNode = {
      id: parseInt(a.id ?? '0', 10),
      name: a.name ?? '',
      descriptions: [...body.matchAll(/<description>([\s\S]*?)<\/description>/gi)].map(d => decode(d[1])),
      x: parseInt(p.x ?? '0', 10), y: parseInt(p.y ?? '0', 10), z: parseInt(p.z ?? '0', 10),
      color: color(a.color), note: a.note,
      zoneName: zone.name, zoneId: zone.id,
      arcs: [...body.matchAll(/<arc\b([^>]*?)\/?>/gi)].map(x => {
        const r = attrs(x[1])
        return { exit: r.exit ?? '', move: r.move ?? '', destination: parseInt(r.destination ?? '0', 10), hidden: (r.hidden ?? '').toLowerCase() === 'true' }
      }),
    }
    zone.nodes.push(node)
  }
  // labels sit directly under <zone>, outside any <node>
  const outside = xml.replace(/<node\b[\s\S]*?<\/node>/gi, '')
  for (const m of outside.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const a = attrs(m[1])
    const pos = /<position\b([^>]*)\/?>/i.exec(m[2])
    if (!pos) continue
    const p = attrs(pos[1])
    zone.labels.push({ text: a.text ?? '', x: parseInt(p.x ?? '0', 10), y: parseInt(p.y ?? '0', 10), z: parseInt(p.z ?? '0', 10) })
  }
  return zone
}
