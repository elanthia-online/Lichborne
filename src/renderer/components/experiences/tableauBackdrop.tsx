// tableauBackdrop — the Living Tableau's sense of PLACE (v0.20.2, v0.20.3).
//
// Every room gets a quiet backdrop built in LAYERS from what its description
// says (tableauScene.ts reads it — this file only draws):
//   sky     a band tinted by the time of day, from the server clock (no Lich
//           needed); stars at night
//   far     what's on the horizon: peaks, hills, dunes, the sea, a distant town
//   mid     what stands in front of it: pines, trees, palms, jungle, savannah,
//           dead trees, rooftops, castle walls, ruins, a shrine, a farm,
//           gravestones, reeds — or a TOWN in its own style (drawTown)
//   near    water and the way through: a waterfall, surf, a lake, a lava glow,
//           and a bridge when there is one
//   props   up to four things standing in front (drawProps), class PROP: a
//           step stronger than the scenery so they don't vanish into it
//   ground  under the figures: a faint road, river, furrows, paving or
//           floorboards, a rug or a sunken pool, over a tint for the ground
// Indoors swaps the horizon for a wall: its material, its light and up to
// three furnishings in fixed slots (drawComposedInterior), or the picture of
// its kind (hall, temple, shop, home) when nothing is named. A cave is drawn
// by kind (natural, tunnel, mine, sewer, ice), with its props.
// Shape budget (v0.20.3, every room in the map): mean 47 shapes, worst 237.
//
// Invariants:
//  - STATIC. No animation at all — the backdrop is the one layer that must
//    cost nothing per frame (pitfall #160's GPU lesson). It re-renders only
//    when the room or the time-of-day band changes (memo).
//  - THEME-SAFE by construction: every colour is a low-percentage color-mix
//    over the theme's own scene text (or a fixed hue mixed toward transparent),
//    so it tints rather than paints, and figure names keep their contrast on
//    light and dark themes alike.
//  - DETERMINISTIC: a room's shapes come from a hash of its title, so the same
//    room always looks the same, and two rooms of a kind differ.
//  - A wrong guess only changes some faint shapes and a tint.

import { memo } from 'react'
import { hashStr } from '../../utils/nameColor'
import type { SceneSpec, Enclosure, Walls, Light, Fixture, Ware, Prop, Pavement } from './tableauScene'
import type { TownStyle } from './tableauPlaces'

export type SkyBand = 'dawn' | 'day' | 'dusk' | 'night' | 'none'

/** The sky's band from the sun: the last and first sliver of each phase are
 *  dawn and dusk. `null` (no sun yet) reads as day. Indoors has none. */
export function skyBandOf(sun: { day: boolean; progress: number } | null, enclosure: Enclosure): SkyBand {
  if (enclosure !== 'outdoor') return 'none'
  if (!sun) return 'day'
  if (sun.day) return sun.progress < 0.06 ? 'dawn' : sun.progress > 0.94 ? 'dusk' : 'day'
  return sun.progress < 0.05 ? 'dusk' : sun.progress > 0.93 ? 'dawn' : 'night'
}

// A tiny deterministic generator, so a room's shapes are always the same.
function rng(seed: number) {
  let s = seed || 1
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

const n1 = (v: number) => v.toFixed(1)

// Class names for the three depths. Far is the faintest.
const FAR = 'tb-sil tb-sil--far'
const MID = 'tb-sil'
// Props stand IN FRONT of the scenery, a step stronger, so a signpost or a
// grazing horse doesn't vanish into the tree line behind it.
const PROP = 'tb-sil tb-sil--prop'
const LINE = 'tb-line'

// Draws into a list with unique keys. Every horizon shape lives in a 400×40
// box whose bottom edge is the horizon; the ground art in a 400×100 box whose
// top edge is the horizon.
function painter(seed: number) {
  const out: React.ReactNode[] = []
  let k = 0
  const r = rng(seed)
  return {
    out, r,
    path: (cls: string, d: string) => { out.push(<path key={k++} className={cls} d={d} />) },
    rect: (cls: string, x: number, y: number, w: number, h: number) => { out.push(<rect key={k++} className={cls} x={n1(x)} y={n1(y)} width={n1(w)} height={n1(h)} />) },
    circle: (cls: string, cx: number, cy: number, rad: number) => { out.push(<circle key={k++} className={cls} cx={n1(cx)} cy={n1(cy)} r={n1(rad)} />) },
    ellipse: (cls: string, cx: number, cy: number, rx: number, ry: number) => { out.push(<ellipse key={k++} className={cls} cx={n1(cx)} cy={n1(cy)} rx={n1(rx)} ry={n1(ry)} />) },
  }
}
type Painter = ReturnType<typeof painter>

// A rolling line of hills from `base` (higher y = lower on screen).
function hills(p: Painter, cls: string, base: number, amp: number) {
  let d = `M0,40 L0,${base}`
  for (let x = 0; x <= 400; x += 40) d += ` Q${n1(x + 20)},${n1(base - amp * (0.4 + p.r()))} ${x + 40},${n1(base - amp * 0.2 * p.r())}`
  p.path(cls, d + ' L400,40 Z')
}

// A band of water across the bottom of the horizon, with faint ripples.
function water(p: Painter, top: number, ripples: number) {
  p.rect('tb-water', 0, top, 400, 40 - top)
  for (let i = 0; i < ripples; i++) {
    const y = top + 2 + i * ((38 - top) / Math.max(1, ripples)), x0 = p.r() * 60
    let d = `M${n1(x0)},${n1(y)}`
    for (let x = x0; x < 400; x += 16) d += ' q4,-1 8,0 t8,0'
    p.path('tb-line tb-line--faint', d)
  }
}

// ── far ────────────────────────────────────────────────────────────────────
function drawFar(p: Painter, s: SceneSpec) {
  switch (s.far) {
    case 'peaks': {
      hills(p, FAR, 30, 6)
      let d = 'M0,40'
      const tips: [number, number][] = []
      for (let x = 0; x <= 400; x += 25 + p.r() * 30) {
        const y = 4 + p.r() * 20
        tips.push([x, y])
        d += ` L${n1(x)},${n1(y)} L${n1(x + 14)},${n1(22 + p.r() * 10)}`
      }
      p.path(FAR, d + ' L400,40 Z')
      if (s.snowcaps) snowcaps(p, tips.filter(([, y]) => y < 16))
      break
    }
    case 'hills': hills(p, FAR, 28, 8); break
    case 'dunes': {
      hills(p, FAR, 30, 5)
      // Long low crests, each with a sharp windward line.
      for (let x = -40; x < 400; x += 70 + p.r() * 60) {
        const w = 90 + p.r() * 70, h = 5 + p.r() * 6, peak = x + w * (0.55 + p.r() * 0.2)
        p.path(FAR, `M${n1(x)},40 Q${n1(peak - w * 0.2)},${n1(40 - h)} ${n1(peak)},${n1(40 - h * 1.1)} L${n1(x + w)},40 Z`)
        p.path('tb-line tb-line--faint', `M${n1(peak)},${n1(40 - h * 1.1)} Q${n1(peak + w * 0.15)},${n1(40 - h * 0.5)} ${n1(x + w)},40`)
      }
      break
    }
    case 'sea':
      // The open sea: a flat horizon and nothing behind it.
      p.rect('tb-water', 0, 30, 400, 10)
      p.path('tb-line', 'M0,30 L400,30')
      break
    case 'skyline': {
      if (s.town) { drawTown(p, s.town, FAR, 0.65, false); break }
      hills(p, FAR, 33, 4)
      for (let x = -4; x < 404;) {
        const w = 8 + p.r() * 14, h = 6 + p.r() * 16
        p.rect(FAR, x, 40 - h, w, h)
        if (p.r() < 0.2) p.path(FAR, `M${n1(x + w / 2 - 2)},${n1(40 - h)} L${n1(x + w / 2)},${n1(40 - h - 8)} L${n1(x + w / 2 + 2)},${n1(40 - h)} Z`)
        x += w + p.r() * 3
      }
      break
    }
  }
}

// ── mid ────────────────────────────────────────────────────────────────────
function pine(p: Painter, x: number, h: number, w: number, cls: string) {
  // Two or three stacked tiers, narrowing to the top.
  const tiers = h > 18 ? 3 : 2
  for (let i = 0; i < tiers; i++) {
    const top = 40 - h + (i * h) / (tiers + 1), bot = 40 - (h * (tiers - 1 - i)) / (tiers + 1) * 0.8
    const ww = w * (0.55 + (i / tiers) * 0.6)
    p.path(cls, `M${n1(x - ww / 2)},${n1(bot)} L${n1(x)},${n1(top)} L${n1(x + ww / 2)},${n1(bot)} Z`)
  }
  p.rect(cls, x - 0.6, 37, 1.2, 3)
}

function drawMid(p: Painter, s: SceneSpec) {
  const { r } = p
  switch (s.mid) {
    case 'pines':
      for (let x = -4; x < 406; x += 7 + r() * 11) pine(p, x, 12 + r() * 20, 7 + r() * 5, MID)
      break
    case 'trees': {
      // Crowns and trunks as ONE path each: overlapping sub-paths with the same
      // winding fill once, so the see-through crowns no longer darken where
      // they overlap into a pile of bubbles (and it is two shapes, not dozens).
      let crowns = '', trunks = ''
      const disc = (cx: number, cy: number, rad: number) => `M${n1(cx - rad)},${n1(cy)}a${n1(rad)},${n1(rad)} 0 1,0 ${n1(rad * 2)},0a${n1(rad)},${n1(rad)} 0 1,0 ${n1(-rad * 2)},0`
      for (let x = -6; x < 406; x += 12 + r() * 16) {
        const h = 12 + r() * 16, w = 6 + r() * 6
        trunks += `M${n1(x - 0.8)},40v${n1(-h * 0.5)}h1.6v${n1(h * 0.5)}Z`
        crowns += disc(x, 40 - h * 0.7, w)
        if (r() < 0.6) crowns += disc(x + w * 0.7, 40 - h * 0.55, w * 0.75)
      }
      p.path(MID, trunks)
      p.path(MID, crowns)
      break
    }
    case 'palms':
      for (let x = 10 + r() * 30; x < 400; x += 40 + r() * 60) {
        const h = 22 + r() * 12, lean = (r() - 0.5) * 14, tx = x + lean, ty = 40 - h
        p.path('tb-line tb-trunk', `M${n1(x)},40 Q${n1(x + lean * 0.2)},${n1(40 - h * 0.6)} ${n1(tx)},${n1(ty)}`)
        for (let f = 0; f < 6; f++) {
          const a = (f / 6) * Math.PI * 2 + r() * 0.4, len = 8 + r() * 5
          const ex = tx + Math.cos(a) * len, ey = ty + Math.abs(Math.sin(a)) * len * 0.6 + 2
          p.path('tb-line tb-frond', `M${n1(tx)},${n1(ty)} Q${n1((tx + ex) / 2)},${n1(ty - 3)} ${n1(ex)},${n1(ey)}`)
        }
      }
      break
    case 'jungle': drawJungle(p); break
    case 'savannah': drawSavannah(p); break
    case 'deadtrees': drawDeadTrees(p); break
    case 'buildings':
      if (s.town) { drawTown(p, s.town, MID, 1, true); break }
      for (let x = -4; x < 404;) {
        const w = 16 + r() * 26, h = 10 + r() * 22
        p.rect(MID, x, 40 - h, w, h)
        if (r() < 0.5) p.path(MID, `M${n1(x - 1)},${n1(40 - h)} L${n1(x + w / 2)},${n1(40 - h - 7)} L${n1(x + w + 1)},${n1(40 - h)} Z`)
        if (r() < 0.25) p.rect(MID, x + w * 0.7, 40 - h - 9, 3, 9)
        if (r() < 0.35) p.rect('tb-window', x + w * 0.3, 40 - h * 0.6, 3, 4)
        x += w + 1 + r() * 4
      }
      break
    case 'fort': {
      // A curtain wall with crenellations, broken by square towers.
      const top = 24
      let d = `M0,40 L0,${top}`
      for (let x = 0; x < 400; x += 6) d += ` L${x},${top - 3} L${x + 3},${top - 3} L${x + 3},${top} L${x + 6},${top}`
      p.path(MID, d + ' L400,40 Z')
      for (let x = 20 + r() * 40; x < 400; x += 90 + r() * 50) {
        const w = 18 + r() * 8, tt = 6 + r() * 6
        let t = `M${n1(x)},40 L${n1(x)},${n1(tt)}`
        for (let cx = x; cx < x + w - 1; cx += 4) t += ` L${n1(cx)},${n1(tt - 3)} L${n1(cx + 2)},${n1(tt - 3)} L${n1(cx + 2)},${n1(tt)} L${n1(cx + 4)},${n1(tt)}`
        p.path(MID, t + ` L${n1(x + w)},${n1(tt)} L${n1(x + w)},40 Z`)
        p.path('tb-window', `M${n1(x + w / 2 - 1)},${n1(tt + 10)} l0,5 l2,0 l0,-5 q-1,-2 -2,0 Z`)
        if (r() < 0.5) p.path(LINE, `M${n1(x + w / 2)},${n1(tt - 3)} l0,-8 l6,2 l-6,2`)
      }
      break
    }
    case 'ruins':
      if (s.town === 'ruins') { drawTown(p, 'ruins', MID, 1, true); break }
      for (let x = -10; x < 410; x += 30 + r() * 40) {
        if (r() < 0.55) {
          // A broken wall: a jagged top, sometimes a gap.
          const w = 20 + r() * 30, base = 14 + r() * 14
          let d = `M${n1(x)},40 L${n1(x)},${n1(40 - base)}`
          for (let cx = x; cx < x + w; cx += 4 + r() * 5) d += ` L${n1(cx)},${n1(40 - base + (r() - 0.3) * base * 0.7)}`
          p.path(MID, d + ` L${n1(x + w)},${n1(40 - base * 0.3)} L${n1(x + w)},40 Z`)
        } else {
          // A column snapped at a slant, rubble at its foot.
          const h = 10 + r() * 20, w = 4 + r() * 2
          p.path(MID, `M${n1(x)},40 L${n1(x)},${n1(40 - h)} L${n1(x + w)},${n1(40 - h + (r() - 0.5) * 6)} L${n1(x + w)},40 Z`)
          p.path(MID, `M${n1(x - 5)},40 Q${n1(x + w / 2)},${n1(36 - r() * 3)} ${n1(x + w + 6)},40 Z`)
        }
      }
      break
    case 'shrine': {
      hills(p, MID, 37, 2)
      const cx = 140 + r() * 120
      // A ring of standing stones, and an obelisk behind them.
      p.path(MID, `M${n1(cx - 3)},40 L${n1(cx - 2.5)},10 L${n1(cx)},5 L${n1(cx + 2.5)},10 L${n1(cx + 3)},40 Z`)
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue
        const x = cx + i * 13 + (r() - 0.5) * 3, h = 8 + r() * 8 - Math.abs(i)
        p.path(MID, `M${n1(x - 2.5)},40 L${n1(x - 2)},${n1(40 - h)} Q${n1(x)},${n1(40 - h - 2)} ${n1(x + 2)},${n1(40 - h)} L${n1(x + 2.5)},40 Z`)
      }
      break
    }
    case 'farm': {
      // A fence line, a barn, haystacks and a lone tree.
      p.path(LINE, 'M0,35 L400,35 M0,38 L400,38')
      for (let x = 2; x < 400; x += 14) p.path(LINE, `M${x},33 L${x},40`)
      const bx = 40 + r() * 280, bw = 30 + r() * 12
      p.rect(MID, bx, 26, bw, 14)
      p.path(MID, `M${n1(bx - 2)},26 L${n1(bx + bw * 0.2)},18 L${n1(bx + bw * 0.8)},18 L${n1(bx + bw + 2)},26 Z`)
      p.path('tb-window', `M${n1(bx + bw / 2 - 4)},40 l0,-9 l8,0 l0,9 Z`)
      for (let i = 0; i < 3; i++) {
        const hx = (bx + bw + 30 + i * 22 + r() * 30) % 400
        p.path(MID, `M${n1(hx - 6)},40 Q${n1(hx)},${n1(28 + r() * 3)} ${n1(hx + 6)},40 Z`)
      }
      const tx = (bx + 200) % 400
      p.rect(MID, tx - 0.8, 28, 1.6, 12)
      p.circle(MID, tx, 26, 7)
      break
    }
    case 'graves': {
      // Headstones and crosses in rough rows, under a bare tree.
      for (let x = 4; x < 400; x += 10 + r() * 14) {
        const h = 5 + r() * 7, w = 3.5 + r() * 2.5
        if (r() < 0.3) {
          p.rect(MID, x - 0.6, 40 - h - 3, 1.2, h + 3)
          p.rect(MID, x - 2.5, 40 - h, 5, 1.2)
        } else {
          p.path(MID, `M${n1(x)},40 L${n1(x)},${n1(40 - h)} Q${n1(x + w / 2)},${n1(40 - h - w * 0.7)} ${n1(x + w)},${n1(40 - h)} L${n1(x + w)},40 Z`)
        }
      }
      const tx = 50 + r() * 300
      p.path('tb-line tb-trunk', `M${n1(tx)},40 L${n1(tx)},18 M${n1(tx)},26 L${n1(tx - 9)},16 M${n1(tx)},22 L${n1(tx + 8)},12 M${n1(tx + 4)},17 L${n1(tx + 10)},16 M${n1(tx - 5)},21 L${n1(tx - 8)},24`)
      break
    }
    case 'reeds':
      for (let x = 0; x < 400; x += 6 + r() * 14) {
        if (r() < 0.25) {
          const h = 14 + r() * 12
          p.path(LINE, `M${n1(x)},40 L${n1(x)},${n1(40 - h)} M${n1(x)},${n1(40 - h * 0.6)} L${n1(x + 5)},${n1(40 - h * 0.8)} M${n1(x)},${n1(40 - h * 0.4)} L${n1(x - 4)},${n1(40 - h * 0.55)}`)
        } else {
          const h = 4 + r() * 6
          p.path(LINE, `M${n1(x)},40 L${n1(x + 1)},${n1(40 - h)} M${n1(x + 2)},40 L${n1(x + 3)},${n1(40 - h * 0.8)}`)
          if (r() < 0.2) p.ellipse(MID, x + 1, 40 - h - 1, 0.8, 2)
        }
      }
      break
  }
}

// ── near (on the horizon) ──────────────────────────────────────────────────
function drawNear(p: Painter, s: SceneSpec) {
  const { r } = p
  switch (s.near) {
    case 'falls': {
      // A rock face with water pouring off it into a misty pool.
      const x = 120 + r() * 160, w = 10 + r() * 6
      p.path(MID, `M${n1(x - 40)},40 L${n1(x - 30)},6 L${n1(x - 6)},2 L${n1(x + w + 6)},4 L${n1(x + w + 34)},10 L${n1(x + w + 46)},40 Z`)
      p.path('tb-falls', `M${n1(x)},4 L${n1(x + w)},4 L${n1(x + w + 3)},38 L${n1(x - 3)},38 Z`)
      for (let i = 0; i < 4; i++) p.path('tb-line tb-line--faint', `M${n1(x + 2 + i * (w - 4) / 3)},6 L${n1(x + 1 + i * (w - 2) / 3)},36`)
      p.rect('tb-water', 0, 37, 400, 3)
      p.ellipse('tb-mist', x + w / 2, 37, w * 1.6, 3.5)
      break
    }
    case 'surf':
      water(p, 30, 6)
      for (let x = r() * 30; x < 400; x += 26 + r() * 30) p.path('tb-line tb-foam', `M${n1(x)},39 q5,-2 10,0`)
      break
    case 'lake': {
      water(p, 34, 3)
      p.path('tb-line', 'M0,34 L400,34')
      break
    }
    case 'river':
      // Shown on the ground; a glint where it meets the horizon.
      p.rect('tb-water', 180 + r() * 40, 37, 30, 3)
      break
    case 'lava':
      p.rect('tb-lava', 0, 32, 400, 8)
      break
  }
  if (s.bridge) {
    if (s.near !== 'surf' && s.near !== 'lake' && s.far !== 'sea') water(p, 31, 3)
    p.path('tb-line tb-line--bold', 'M40,40 Q200,6 360,40')
    p.path('tb-line tb-line--bold', 'M30,26 Q200,0 370,26')
    // Posts stand from the deck down to the arch, each end read off its own
    // curve (bug check: two stand-in parabolas met neither, and the middle
    // post had no length at all).
    for (let x = 60; x <= 340; x += 28) p.path(LINE, `M${x},${n1(qy(x, 30, 26, 0, 370, 26))} L${x},${n1(qy(x, 40, 40, 6, 360, 40))}`)
  }
}

// The height of a symmetric quadratic curve (control point midway in x) at x.
function qy(x: number, x0: number, y0: number, cy: number, x2: number, y2: number) {
  const t = (x - x0) / (x2 - x0)
  return (1 - t) ** 2 * y0 + 2 * t * (1 - t) * cy + t * t * y2
}

// ── indoors and caves ──────────────────────────────────────────────────────
function drawInterior(p: Painter, s: SceneSpec) {
  const { r } = p
  p.rect('tb-wall', 0, 0, 400, 40)
  // v0.20.3: a room that names its furnishings (or what it sells) is composed
  // from them; one that names none keeps the picture of its kind, now on its
  // own wall material and in its own light.
  if (s.fixtures.some(f => !ON_FLOOR.has(f)) || (s.wares && s.wares !== 'general')) { drawComposedInterior(p, s); return }
  drawWallMaterial(p, s.walls !== 'plain' ? s.walls : (s.town && WALL_OF_TOWN[s.town]) || 'plain')
  if (s.light) drawLight(p, s.light)
  switch (s.interior) {
    case 'temple': {
      // Tall glass lancets, columns, and an altar with candles.
      for (let x = 30; x < 400; x += 70) {
        p.rect(MID, x, 0, 7, 40)
        p.path('tb-glass', `M${x + 22},32 L${x + 22},12 Q${x + 31},-2 ${x + 40},12 L${x + 40},32 Z`)
        p.path('tb-line tb-line--faint', `M${x + 31},6 L${x + 31},32 M${x + 22},20 L${x + 40},20`)
      }
      const ax = 175 + r() * 20
      p.rect(MID, ax, 31, 50, 9)
      p.rect(MID, ax - 3, 30, 56, 2)
      for (const cx of [ax + 6, ax + 25, ax + 44]) { p.rect(MID, cx - 0.8, 25, 1.6, 5); p.ellipse('tb-flame', cx, 23.6, 1.2, 2) }
      break
    }
    case 'shop': {
      // Shelves of goods behind a long counter.
      for (const y of [10, 20, 29]) {
        p.path(LINE, `M0,${y} L400,${y}`)
        for (let x = 2; x < 400; x += 3 + r() * 6) {
          if (r() < 0.25) continue
          const h = 2.5 + r() * 5, w = 1.5 + r() * 3
          if (r() < 0.4) p.path(MID, `M${n1(x)},${y} l0,${n1(-h * 0.6)} q${n1(w / 2)},${n1(-h * 0.5)} ${n1(w)},0 l0,${n1(h * 0.6)} Z`)
          else p.rect(MID, x, y - h, w, h)
        }
      }
      p.rect(MID, 0, 33, 400, 7)
      p.path(LINE, 'M0,33 L400,33')
      break
    }
    case 'home': {
      // Beams overhead, a cross-paned window, and a hearth.
      for (const y of [2, 6]) p.path(LINE, `M0,${y} L400,${y}`)
      for (let x = 30 + r() * 30; x < 400; x += 120 + r() * 40) p.rect(MID, x, 0, 4, 40)
      const wx = 50 + r() * 80
      p.rect('tb-window', wx, 12, 22, 16)
      p.path(LINE, `M${n1(wx + 11)},12 L${n1(wx + 11)},28 M${n1(wx)},20 L${n1(wx + 22)},20`)
      const hx = 220 + r() * 90
      p.path(MID, `M${n1(hx - 18)},40 L${n1(hx - 18)},18 L${n1(hx + 18)},18 L${n1(hx + 18)},40 Z`)
      p.rect(MID, hx - 22, 16, 44, 2.5)
      p.path('tb-hearth', `M${n1(hx - 10)},40 L${n1(hx - 10)},29 Q${n1(hx)},22 ${n1(hx + 10)},29 L${n1(hx + 10)},40 Z`)
      p.ellipse('tb-flame', hx, 37, 5, 3)
      break
    }
    default:
      // A hall: pillars and arched windows.
      for (let x = 20; x < 400; x += 60 + r() * 20) {
        p.rect(MID, x, 0, 6, 40)
        if (r() < 0.6) p.path('tb-window', `M${n1(x + 18)},34 L${n1(x + 18)},16 Q${n1(x + 27)},6 ${n1(x + 36)},16 L${n1(x + 36)},34 Z`)
      }
  }
}

function drawCave(p: Painter, s: SceneSpec) {
  const { r } = p
  if (s.town === 'dwarven' && s.caveKind === 'natural') s = { ...s, caveKind: 'tunnel' }
  if (drawCaveKind(p, s)) {
    if (s.near === 'lake' || s.near === 'river') water(p, 35, 2)
    if (s.near === 'lava') p.rect('tb-lava', 0, 32, 400, 8)
    return
  }
  // Stalactites hang from the TOP of the band; stalagmites rise to meet them.
  let d = 'M0,0'
  for (let x = 0; x <= 400; x += 8 + r() * 14) d += ` L${n1(x)},${n1(2 + r() * 4)} L${n1(x + 4)},${n1(8 + r() * 22)}`
  p.path(MID, d + ' L400,0 Z')
  for (let x = r() * 30; x < 400; x += 18 + r() * 40) {
    const h = 4 + r() * 10, w = 3 + r() * 4
    p.path(FAR, `M${n1(x)},40 L${n1(x + w / 2)},${n1(40 - h)} L${n1(x + w)},40 Z`)
  }
  if (s.near === 'lake' || s.near === 'river' || s.near === 'falls') water(p, 35, 2)
  if (s.near === 'lava') p.rect('tb-lava', 0, 32, 400, 8)
}

// ── towns (v0.20.3) ────────────────────────────────────────────────────────
// A town's buildings in its own style (tableauPlaces.ts). One drawer per
// style, used for the mid-ground at full height and for a distant skyline at
// about two-thirds (`hs`, fainter class). Each keeps to the shape budget of
// the plain buildings it replaces: a row of a dozen or so pieces, no more.

function gable(p: Painter, cls: string, x: number, w: number, top: number, rise: number) {
  p.path(cls, `M${n1(x - 1)},${n1(top)} L${n1(x + w / 2)},${n1(top - rise)} L${n1(x + w + 1)},${n1(top)} Z`)
}
function archDoor(p: Painter, cls: string, x: number, w: number, h: number, base = 40) {
  p.path(cls, `M${n1(x)},${n1(base)} L${n1(x)},${n1(base - h + w / 2)} Q${n1(x + w / 2)},${n1(base - h - w / 3)} ${n1(x + w)},${n1(base - h + w / 2)} L${n1(x + w)},${n1(base)} Z`)
}
function palm(p: Painter, x: number, h: number) {
  const { r } = p, lean = (r() - 0.5) * 10, tx = x + lean, ty = 40 - h
  p.path('tb-line tb-trunk', `M${n1(x)},40 Q${n1(x + lean * 0.2)},${n1(40 - h * 0.6)} ${n1(tx)},${n1(ty)}`)
  for (let f = 0; f < 5; f++) {
    const a = (f / 5) * Math.PI * 2 + r() * 0.4, len = 6 + r() * 4
    p.path('tb-line tb-frond', `M${n1(tx)},${n1(ty)} Q${n1(tx + Math.cos(a) * len / 2)},${n1(ty - 2)} ${n1(tx + Math.cos(a) * len)},${n1(ty + Math.abs(Math.sin(a)) * len * 0.6 + 2)}`)
  }
}

function drawTown(p: Painter, style: TownStyle, cls: string, hs: number, mid: boolean) {
  const { r } = p
  const win = (x: number, y: number, w = 3, h = 4) => { if (mid && r() < 0.4) p.rect('tb-window', x, y, w, h) }
  switch (style) {
    case 'river':
      // Gabled stone and timber houses with chimneys; now and then a temple spire.
      for (let x = -4; x < 404;) {
        const w = 16 + r() * 24, h = (10 + r() * 18) * hs
        if (r() < 0.12) {
          p.rect(cls, x + w / 2 - 3, 40 - h - 14 * hs, 6, h + 14 * hs)
          p.path(cls, `M${n1(x + w / 2 - 4)},${n1(40 - h - 14 * hs)} L${n1(x + w / 2)},${n1(40 - h - 26 * hs)} L${n1(x + w / 2 + 4)},${n1(40 - h - 14 * hs)} Z`)
        }
        p.rect(cls, x, 40 - h, w, h)
        gable(p, cls, x, w, 40 - h, 6 * hs)
        if (r() < 0.45) p.rect(cls, x + w * 0.72, 40 - h - 8 * hs, 2.5, 6 * hs)
        win(x + w * 0.3, 40 - h * 0.6)
        x += w + 1 + r() * 3
      }
      break
    case 'harbor': {
      // Houses on stilts over the water, a boardwalk, and the masts of moored ships.
      p.rect('tb-water', 0, 35, 400, 5)
      p.path(LINE, 'M0,33 L400,33')
      for (let x = -4; x < 404;) {
        const w = 14 + r() * 14, h = (8 + r() * 10) * hs
        p.rect(cls, x, 33 - h, w, h)
        gable(p, cls, x, w, 33 - h, 5 * hs)
        for (let sx = x + 2; sx < x + w; sx += 6) p.path(LINE, `M${n1(sx)},33 L${n1(sx)},40`)
        win(x + w * 0.4, 33 - h * 0.65)
        x += w + 3 + r() * 8
      }
      for (let i = 0; i < 3; i++) {
        const mx = 30 + r() * 340, mh = (16 + r() * 12) * hs
        p.path(LINE, `M${n1(mx)},37 L${n1(mx)},${n1(37 - mh)} M${n1(mx - 6)},${n1(37 - mh * 0.7)} L${n1(mx + 6)},${n1(37 - mh * 0.7)}`)
        p.path(FAR, `M${n1(mx + 1)},${n1(37 - mh * 0.9)} L${n1(mx + 1)},${n1(37 - mh * 0.3)} L${n1(mx + 9)},${n1(37 - mh * 0.35)} Z`)
      }
      break
    }
    case 'tiers':
      // Terraces stepping up a cliff, each carrying a row of white buildings,
      // with a colonnade along the lowest.
      for (let t = 2; t >= 0; t--) {
        const base = 40 - t * 9 * hs
        // The terrace wall under each upper tier, so the rows read as steps up a cliff.
        if (t > 0) p.rect(FAR, 0, base, 400, 9 * hs)
        p.path(LINE, `M0,${n1(base)} L400,${n1(base)}`)
        for (let x = -4 + t * 7; x < 404;) {
          const w = 13 + r() * 16, h = (5 + r() * 6) * hs
          p.rect(t === 0 ? cls : FAR, x, base - h, w, h)
          if (r() < 0.3) p.path(t === 0 ? cls : FAR, `M${n1(x)},${n1(base - h)} Q${n1(x + w / 2)},${n1(base - h - w * 0.5)} ${n1(x + w)},${n1(base - h)} Z`)
          x += w + 2 + r() * 5
        }
      }
      // A colonnade along part of the lowest tier (the whole width cost ~70 shapes).
      if (mid) for (let x = 60 + r() * 60; x < 300; x += 14) {
        p.rect(cls, x, 33, 2, 7)
        p.path('tb-line tb-line--faint', `M${n1(x + 2)},34 Q${n1(x + 8)},30 ${n1(x + 14)},34`)
      }
      break
    case 'floating': {
      // Platforms on piles over shallow water, joined by little bridges, and a bell tower.
      p.rect('tb-water', 0, 33, 400, 7)
      let prev = -1
      for (let x = 6 + r() * 10; x < 400;) {
        const w = 22 + r() * 18, h = (8 + r() * 14) * hs
        p.rect(cls, x - 2, 31, w + 4, 2)
        for (let sx = x; sx <= x + w; sx += 7) p.path(LINE, `M${n1(sx)},33 L${n1(sx)},40`)
        p.rect(cls, x, 31 - h, w, h)
        if (r() < 0.5) gable(p, cls, x, w, 31 - h, 5 * hs)
        win(x + w * 0.35, 31 - h * 0.6)
        if (prev >= 0) p.path(LINE, `M${n1(prev)},31 Q${n1((prev + x) / 2)},26 ${n1(x - 2)},31`)
        prev = x + w + 2
        x += w + 10 + r() * 14
      }
      const bx = 150 + r() * 100
      p.rect(cls, bx, 31 - 30 * hs, 7, 30 * hs)
      p.path(cls, `M${n1(bx - 1)},${n1(31 - 30 * hs)} L${n1(bx + 3.5)},${n1(31 - 38 * hs)} L${n1(bx + 8)},${n1(31 - 30 * hs)} Z`)
      if (mid) archDoor(p, 'tb-window', bx + 2, 3, 5, 31 - 22 * hs)
      break
    }
    case 'sandstone':
      // Flat roofs with parapets, domes and slender towers, palms between.
      for (let x = -4; x < 404;) {
        const kind = r(), w = 14 + r() * 20, h = (8 + r() * 14) * hs
        if (kind < 0.18) {
          const th = (22 + r() * 10) * hs
          p.rect(cls, x, 40 - th, 4, th)
          p.circle(cls, x + 2, 40 - th - 1.5, 3)
          p.path(LINE, `M${n1(x + 2)},${n1(40 - th - 4)} L${n1(x + 2)},${n1(40 - th - 8)}`)
          x += 8
          continue
        }
        p.rect(cls, x, 40 - h, w, h)
        if (kind < 0.5) p.path(cls, `M${n1(x + w * 0.15)},${n1(40 - h)} Q${n1(x + w / 2)},${n1(40 - h - w * 0.55)} ${n1(x + w * 0.85)},${n1(40 - h)} Z`)
        else for (let cx = x; cx < x + w - 2; cx += 4) p.rect(cls, cx, 40 - h - 2, 2, 2)
        if (mid && r() < 0.5) archDoor(p, 'tb-window', x + w * 0.4, 3, 5, 40 - h * 0.3)
        if (mid && r() < 0.3) palm(p, x + w + 4, 22 + r() * 8)
        x += w + 2 + r() * 5
      }
      break
    case 'crystal': {
      // Slender spires tipped with crystal, a great tower among them, and a bridge.
      const great = 160 + r() * 80
      for (let x = 4; x < 400; x += 16 + r() * 22) {
        const isGreat = Math.abs(x - great) < 12
        const h = (isGreat ? 36 : 14 + r() * 18) * hs, w = isGreat ? 9 : 4 + r() * 4
        p.path(cls, `M${n1(x - w / 2)},40 L${n1(x - w * 0.3)},${n1(40 - h)} L${n1(x + w * 0.3)},${n1(40 - h)} L${n1(x + w / 2)},40 Z`)
        p.path('tb-crystal', `M${n1(x)},${n1(40 - h - 7 * hs)} L${n1(x + w * 0.35)},${n1(40 - h)} L${n1(x - w * 0.35)},${n1(40 - h)} Z`)
        if (r() < 0.35) p.rect(cls, x + w, 40 - h * 0.4, 8 + r() * 8, h * 0.4)
      }
      if (mid) p.path('tb-line tb-line--bold', `M${n1(40 + r() * 40)},30 Q200,16 ${n1(320 + r() * 40)},30`)
      break
    }
    case 'elven': {
      // One great tree with platforms and small houses in its branches.
      const cx = 120 + r() * 160
      p.path(cls, `M${n1(cx - 9)},40 Q${n1(cx - 4)},28 ${n1(cx - 3)},${n1(40 - 30 * hs)} L${n1(cx + 3)},${n1(40 - 30 * hs)} Q${n1(cx + 4)},28 ${n1(cx + 9)},40 Z`)
      for (let i = 0; i < 6; i++) p.circle(cls, cx + (r() - 0.5) * 50, 40 - (28 + r() * 10) * hs, (9 + r() * 7) * hs)
      for (const [dx, y] of [[-26, 26], [18, 22]] as const) {
        p.rect(cls, cx + dx, y * hs + 40 * (1 - hs), 16, 1.6)
        p.rect(cls, cx + dx + 4, (y - 6) * hs + 40 * (1 - hs), 8, 6 * hs)
        gable(p, cls, cx + dx + 4, 8, (y - 6) * hs + 40 * (1 - hs), 3)
      }
      for (let x = 10; x < 400; x += 26 + r() * 30) {
        if (Math.abs(x - cx) < 40) continue
        const h = (10 + r() * 10) * hs
        p.rect(cls, x - 0.8, 40 - h * 0.5, 1.6, h * 0.5)
        p.circle(cls, x, 40 - h * 0.75, 5 + r() * 3)
      }
      break
    }
    case 'dwarven': {
      // A rock face with doorways, windows and a balcony carved into it, and a waterwheel.
      let d = `M0,40 L0,${n1(40 - 26 * hs)}`
      for (let x = 0; x <= 400; x += 20) d += ` L${x},${n1(40 - (24 + r() * 10) * hs)}`
      p.path(FAR, d + ' L400,40 Z')
      for (let x = 20 + r() * 20; x < 380; x += 40 + r() * 30) {
        archDoor(p, mid ? 'tb-window' : cls, x, 7, 11 * hs)
        if (r() < 0.5) {
          p.rect(mid ? 'tb-window' : cls, x + 1, 40 - 20 * hs, 5, 3)
          p.path(LINE, `M${n1(x - 4)},${n1(40 - 16 * hs)} L${n1(x + 11)},${n1(40 - 16 * hs)}`)
        }
      }
      if (mid) {
        const wx = 330 + r() * 40, wr = 9
        p.circle('tb-line', wx, 40 - wr, wr)
        for (let a = 0; a < 6; a++) p.path(LINE, `M${n1(wx)},${n1(40 - wr)} L${n1(wx + Math.cos(a * Math.PI / 3) * wr)},${n1(40 - wr + Math.sin(a * Math.PI / 3) * wr)}`)
        p.rect('tb-water', wx - 14, 37, 30, 3)
      }
      break
    }
    case 'logs':
      // Log cabins with steep roofs among firs.
      for (let x = -4; x < 404;) {
        if (r() < 0.45) { pine(p, x + 4, 14 + r() * 14, 7, cls); x += 10 + r() * 6; continue }
        const w = 16 + r() * 12, h = (7 + r() * 6) * hs
        p.rect(cls, x, 40 - h, w, h)
        for (let y = 40 - h + 2.5; y < 40; y += 3.5) p.path('tb-line tb-line--faint', `M${n1(x)},${n1(y)} L${n1(x + w)},${n1(y)}`)
        gable(p, cls, x, w, 40 - h, 8 * hs)
        win(x + w * 0.4, 40 - h * 0.7)
        x += w + 4 + r() * 8
      }
      break
    case 'clan': {
      // Longhouses with curved roofs, a stretch of palisade, a carved pole.
      for (let x = 10 + r() * 30; x < 400; x += 80 + r() * 50) {
        const w = 40 + r() * 26, h = (8 + r() * 4) * hs
        p.path(cls, `M${n1(x)},40 L${n1(x)},${n1(40 - h)} Q${n1(x + w / 2)},${n1(40 - h * 2)} ${n1(x + w)},${n1(40 - h)} L${n1(x + w)},40 Z`)
        if (mid) archDoor(p, 'tb-window', x + w / 2 - 3, 6, h * 0.8)
      }
      const px = r() * 200
      for (let x = px; x < px + 120; x += 4) p.path(cls, `M${n1(x)},40 L${n1(x)},${n1(40 - 11 * hs)} L${n1(x + 1.5)},${n1(40 - 13 * hs)} L${n1(x + 3)},${n1(40 - 11 * hs)} L${n1(x + 3)},40 Z`)
      const tx = 300 + r() * 80
      p.rect(cls, tx, 40 - 24 * hs, 3, 24 * hs)
      for (let y = 40 - 22 * hs; y < 36; y += 5) p.path(LINE, `M${n1(tx - 2)},${n1(y)} L${n1(tx + 5)},${n1(y)}`)
      break
    }
    case 'tents':
      // Felt and hide tents, round and peaked, poles through the tops, a banner.
      for (let x = 8 + r() * 20; x < 400; x += 26 + r() * 30) {
        const w = 14 + r() * 10, h = (9 + r() * 7) * hs
        if (r() < 0.5) {
          p.path(cls, `M${n1(x)},40 L${n1(x)},${n1(40 - h * 0.6)} Q${n1(x + w / 2)},${n1(40 - h * 1.3)} ${n1(x + w)},${n1(40 - h * 0.6)} L${n1(x + w)},40 Z`)
        } else {
          p.path(cls, `M${n1(x)},40 L${n1(x + w / 2)},${n1(40 - h)} L${n1(x + w)},40 Z`)
          p.path(LINE, `M${n1(x + w / 2 - 2)},${n1(40 - h - 3)} L${n1(x + w / 2)},${n1(40 - h)} L${n1(x + w / 2 + 2)},${n1(40 - h - 3)}`)
        }
        if (mid) p.path('tb-line', `M${n1(x + w / 2)},40 L${n1(x + w / 2)},${n1(40 - h * 0.45)}`)
      }
      if (mid) {
        const bx = 60 + r() * 280
        p.path(LINE, `M${n1(bx)},40 L${n1(bx)},10`)
        p.path('tb-banner', `M${n1(bx)},10 L${n1(bx + 12)},12 L${n1(bx)},16 Z`)
      }
      break
    case 'ruins': {
      // Broken colonnades, a cracked dome, empty arches.
      for (let x = 6; x < 400; x += 9 + r() * 4) {
        if (r() < 0.3) continue
        const h = (8 + r() * 16) * hs
        p.path(cls, `M${n1(x)},40 L${n1(x)},${n1(40 - h)} L${n1(x + 3)},${n1(40 - h + (r() - 0.5) * 4)} L${n1(x + 3)},40 Z`)
      }
      const dx = 60 + r() * 260, dw = 40
      p.path(cls, `M${n1(dx)},40 L${n1(dx)},${n1(40 - 14 * hs)} Q${n1(dx + dw * 0.3)},${n1(40 - 30 * hs)} ${n1(dx + dw * 0.55)},${n1(40 - 26 * hs)} L${n1(dx + dw * 0.6)},${n1(40 - 20 * hs)} L${n1(dx + dw * 0.7)},${n1(40 - 23 * hs)} L${n1(dx + dw)},${n1(40 - 14 * hs)} L${n1(dx + dw)},40 Z`)
      for (let i = 0; i < 3; i++) archDoor(p, 'tb-wall', dx + 5 + i * 11, 7, 10 * hs)
      break
    }
    case 'fortress': {
      // A keep on a height: a hill, a curtain wall, towers.
      hills(p, FAR, 34, 6)
      const kx = 140 + r() * 120, top = 40 - 30 * hs
      p.rect(cls, kx, top, 26, 40 - top)
      for (let cx = kx; cx < kx + 26; cx += 4) p.rect(cls, cx, top - 3, 2, 3)
      p.rect(cls, kx - 30, top + 10 * hs, 30, 40 - top - 10 * hs)
      p.rect(cls, kx + 26, top + 12 * hs, 34, 40 - top - 12 * hs)
      if (mid) archDoor(p, 'tb-window', kx + 10, 6, 9)
      break
    }
  }
}

// ── terrains (v0.20.3) ─────────────────────────────────────────────────────

// A smoking cone on the horizon: volcanic country (Dirge, Sicle Grove, the
// lava fields). The plume is a few still puffs, drifting with the wind.
function volcano(p: Painter) {
  const { r } = p
  // Low enough that the plume stays inside the band, and a step stronger than
  // the far hills (gallery review: behind a skyline it all but vanished).
  const x = 60 + r() * 280, w = 80 + r() * 30, top = 16 + r() * 4
  p.path(MID, `M${n1(x - w / 2)},40 L${n1(x - 7)},${n1(top)} L${n1(x - 3)},${n1(top + 2)} L${n1(x + 3)},${n1(top + 1)} L${n1(x + 7)},${n1(top)} L${n1(x + w / 2)},40 Z`)
  p.ellipse('tb-lava', x, top + 0.8, 6, 1.2)
  const drift = r() < 0.5 ? -1 : 1
  for (let i = 0; i < 5; i++) p.ellipse('tb-smoke', x + drift * i * 5, top - 3 - i * 3, 4 + i * 2.2, 2.2 + i * 0.9)
}

// Snow on the peaks drawn by drawFar: a pale cap on each tip.
function snowcaps(p: Painter, tips: [number, number][]) {
  for (const [x, y] of tips) p.path('tb-snow', `M${n1(x)},${n1(y)} L${n1(x - 4)},${n1(y + 5)} L${n1(x - 1)},${n1(y + 4)} L${n1(x + 1.5)},${n1(y + 5.5)} L${n1(x + 4.5)},${n1(y + 5)} Z`)
}

// A canopy as ONE scalloped shape per layer: overlapping see-through circles
// stack up and brighten each other into a wall of bubbles (gallery review).
function canopy(p: Painter, cls: string, base: number, bump: number) {
  let d = `M0,40 L0,${n1(base)}`
  for (let x = 0; x < 400;) {
    const w = 10 + p.r() * 12
    d += ` Q${n1(x + w / 2)},${n1(base - bump * (0.6 + p.r() * 0.6))} ${n1(x + w)},${n1(base + (p.r() - 0.5) * 2)}`
    x += w
  }
  p.path(cls, d + ' L400,40 Z')
}

function drawJungle(p: Painter) {
  const { r } = p
  // Two layers of dense canopy, palms standing above, vines hanging down.
  canopy(p, FAR, 18, 6)
  canopy(p, MID, 26, 5)
  for (let x = 8 + r() * 10; x < 400; x += 14 + r() * 18) p.path(LINE, `M${n1(x)},${n1(25 + r() * 3)} q2,5 0,${n1(7 + r() * 6)}`)
  for (let x = 30 + r() * 40; x < 400; x += 100 + r() * 70) palm(p, x, 32 + r() * 5)
}

// Moorland: low heather humps along the horizon and a lone standing stone.
function drawMoor(p: Painter) {
  const { r } = p
  for (let x = r() * 10; x < 400; x += 9 + r() * 12) p.ellipse(FAR, x, 39.5, 5 + r() * 5, 1.6 + r() * 1.4)
  const sx = 40 + r() * 320
  p.path(MID, `M${n1(sx - 2.5)},40 L${n1(sx - 2)},${n1(28 + r() * 3)} Q${n1(sx)},${n1(26)} ${n1(sx + 2)},${n1(29)} L${n1(sx + 2.5)},40 Z`)
}

function drawSavannah(p: Painter) {
  const { r } = p
  // Flat grass to the horizon and a few lone flat-topped trees.
  p.path('tb-line tb-line--faint', 'M0,36 L400,36')
  for (let x = 40 + r() * 60; x < 400; x += 110 + r() * 90) {
    const h = 14 + r() * 8, w = 16 + r() * 10
    p.path('tb-line tb-trunk', `M${n1(x)},40 L${n1(x)},${n1(40 - h)} M${n1(x)},${n1(40 - h * 0.6)} L${n1(x - 5)},${n1(40 - h)} M${n1(x)},${n1(40 - h * 0.7)} L${n1(x + 6)},${n1(40 - h)}`)
    p.ellipse(MID, x, 40 - h - 1.5, w / 2, 2.6)
  }
  for (let x = r() * 12; x < 400; x += 10 + r() * 14) p.path(LINE, `M${n1(x)},40 L${n1(x + 1)},${n1(36 - r() * 3)} M${n1(x + 2)},40 L${n1(x + 3)},${n1(37 - r() * 2)}`)
}

function drawDeadTrees(p: Painter) {
  const { r } = p
  // Bare trunks forking into thin branches.
  for (let x = 6 + r() * 20; x < 400; x += 28 + r() * 40) {
    const h = 16 + r() * 16
    let d = `M${n1(x)},40 L${n1(x + (r() - 0.5) * 3)},${n1(40 - h)}`
    for (let b = 0; b < 3; b++) {
      const y = 40 - h * (0.45 + b * 0.18), side = b % 2 ? 1 : -1, len = 5 + r() * 6
      d += ` M${n1(x)},${n1(y)} L${n1(x + side * len)},${n1(y - len * 0.8)} l${n1(side * 2)},${n1(-2)}`
    }
    p.path('tb-line tb-trunk', d)
  }
}

// Caves by kind. The natural cavern (stalactites) stays drawCave's default.
function drawCaveKind(p: Painter, s: SceneSpec): boolean {
  const { r } = p
  switch (s.caveKind) {
    case 'sewer':
      // Brick arches over a channel of water.
      for (let x = -20; x < 420; x += 70) {
        p.path(MID, `M${x},40 L${x},14 Q${x + 35},-6 ${x + 70},14 L${x + 70},40 L${x + 62},40 L${x + 62},16 Q${x + 35},2 ${x + 8},16 L${x + 8},40 Z`)
        for (let y = 18; y < 40; y += 5) p.path('tb-line tb-line--faint', `M${x},${y} L${x + 8},${y} M${x + 62},${y} L${x + 70},${y}`)
      }
      p.rect('tb-water', 0, 34, 400, 6)
      return true
    case 'mine':
      // Timber supports in a row, receding, and a lantern.
      for (let x = 10 + r() * 20; x < 400; x += 60 + r() * 20) {
        p.rect(MID, x, 8, 3, 32)
        p.rect(MID, x + 30, 8, 3, 32)
        p.rect(MID, x - 3, 6, 39, 3)
        if (r() < 0.4) p.ellipse('tb-flame', x + 16, 12, 1.4, 2)
      }
      p.path('tb-line tb-line--faint', 'M0,4 L400,4')
      return true
    case 'ice':
      // Long pale icicles from the ceiling, a glassy floor line.
      for (let x = 0; x < 400; x += 6 + r() * 10) p.path('tb-ice', `M${n1(x)},0 L${n1(x + 2 + r() * 2)},${n1(6 + r() * 24)} L${n1(x + 5)},0 Z`)
      p.path('tb-line', 'M0,39 L400,39')
      return true
    case 'tunnel':
      // A carved passage: a squared arch, dressed stone, torches.
      for (let x = 30; x < 400; x += 120) {
        archDoor(p, 'tb-wall', x, 50, 34)
        p.path('tb-line', `M${x},40 L${x},${23} Q${x + 25},-4 ${x + 50},23 L${x + 50},40`)
        p.ellipse('tb-flame', x - 8, 18, 1.5, 2.4)
      }
      return true
  }
  return false
}

// ── indoors, composed (v0.20.3) ────────────────────────────────────────────
// The back wall wears its material, the light hangs or burns where it would,
// and up to three furnishings each get a stretch of wall — the first in the
// middle, then left, then right. A shop's wares go on its shelves, racks and
// cases. Rooms whose description names no furnishing keep the v0.20.2 picture
// of their kind (temple, shop, home, hall).

const WALL_OF_TOWN: Partial<Record<TownStyle, Walls>> = {
  dwarven: 'stone', sandstone: 'stone', fortress: 'stone', ruins: 'stone', crystal: 'marble', tiers: 'marble',
  logs: 'wood', clan: 'wood', elven: 'wood', harbor: 'wood', floating: 'wood', tents: 'canvas', river: 'plaster',
}

function drawWallMaterial(p: Painter, walls: Walls) {
  const { r } = p
  switch (walls) {
    case 'stone': {
      // Coursed blocks, as ONE path (one element per joint was ~140 shapes).
      let d = ''
      for (let y = 6, row = 0; y < 40; y += 6, row++) {
        d += `M0,${y} L400,${y}`
        for (let x = (row % 2) * 9; x < 400; x += 18) d += `M${x},${y - 6} L${x},${y}`
      }
      p.path('tb-line tb-line--faint', d)
      break
    }
    case 'marble':
      for (let i = 0; i < 5; i++) {
        const x = r() * 400
        p.path('tb-line tb-line--faint', `M${n1(x)},0 Q${n1(x + 20 + r() * 20)},${n1(12 + r() * 10)} ${n1(x + 6)},${n1(24 + r() * 10)} T${n1(x + 30)},40`)
      }
      p.path(LINE, 'M0,30 L400,30')
      break
    case 'wood': {
      let d = ''
      for (let x = 8; x < 400; x += 9 + r() * 4) d += `M${n1(x)},0 L${n1(x)},40`
      p.path('tb-line tb-line--faint', d)
      p.path(LINE, 'M0,3 L400,3')
      break
    }
    case 'plaster':
      p.path(LINE, 'M0,28 L400,28')
      p.path('tb-line tb-line--faint', 'M0,30 L400,30')
      break
    case 'canvas':
      // A tent: the roof slopes down from a centre pole; the walls hang in swags.
      p.path('tb-line', 'M200,0 L200,40')
      for (let x = -100; x <= 500; x += 60) p.path('tb-line tb-line--faint', `M200,0 L${x},14`)
      for (let x = 0; x < 400; x += 50) p.path('tb-line tb-line--faint', `M${x},14 Q${x + 25},20 ${x + 50},14`)
      break
    case 'earth':
      for (let i = 0; i < 14; i++) p.ellipse('tb-wall', r() * 400, r() * 36, 6 + r() * 10, 2 + r() * 3)
      break
    case 'metal': {
      // Seams with rivets: two paths in all.
      let seams = '', rivets = ''
      for (const y of [10, 22, 34]) {
        seams += `M0,${y} L400,${y}`
        for (let x = 6; x < 400; x += 16) rivets += `M${x - 0.6},${y - 2.6}h1.2v1.2h-1.2Z`
      }
      p.path('tb-line tb-line--faint', seams)
      p.path(MID, rivets)
      break
    }
  }
}

// One item of a ware, standing on a shelf at (x, y) within width w.
function ware(p: Painter, kind: Ware, x: number, y: number, w: number) {
  const { r } = p
  switch (kind) {
    case 'alchemy':
    case 'drink':
      if (r() < 0.5) { p.circle(MID, x + w / 2, y - 2, Math.min(2.2, w / 2.5)); p.rect(MID, x + w / 2 - 0.6, y - 5.5, 1.2, 2.5) }
      else { p.rect(MID, x + w * 0.3, y - 5, w * 0.4, 5); p.rect(MID, x + w * 0.38, y - 6.5, w * 0.24, 1.5) }
      break
    case 'books': {
      let d = ''
      for (let bx = x; bx < x + w - 1; bx += 1.6 + r()) { const h = 3.5 + r() * 2; d += `M${n1(bx)},${n1(y)}v${n1(-h)}h1.2v${n1(h)}Z` }
      p.path(MID, d)
      break
    }
    case 'jewelry':
      p.rect('tb-glass', x, y - 4, w, 4)
      p.circle('tb-crystal', x + w * (0.3 + r() * 0.4), y - 2, 0.8)
      break
    case 'food':
      p.ellipse(MID, x + w / 2, y - 1.5, w / 2 - 0.5, 1.6)
      if (r() < 0.5) p.ellipse(MID, x + w / 2, y - 3.6, w / 3, 1.3)
      break
    case 'flowers':
      p.rect(MID, x + w / 2 - 1.2, y - 3, 2.4, 3)
      for (let i = 0; i < 3; i++) p.circle('tb-bloom', x + w / 2 + (i - 1) * 1.6, y - 4.5 - r() * 1.5, 0.9)
      break
    case 'coin':
      for (let i = 0; i < 3; i++) p.ellipse('tb-coin', x + w / 2, y - 0.6 - i * 1.1, w / 3, 0.6)
      break
    case 'music':
      p.circle(MID, x + w / 2, y - 2, 2)
      p.path(LINE, `M${n1(x + w / 2)},${n1(y - 3.5)} L${n1(x + w / 2 + 2)},${n1(y - 8)}`)
      break
    default:
      // General goods, tools and the rest: boxes and jars of differing heights.
      if (r() < 0.4) p.path(MID, `M${n1(x)},${n1(y)} l0,-2.5 q${n1(w / 2)},-2.4 ${n1(w)},0 l0,2.5 Z`)
      else p.rect(MID, x, y - 2 - r() * 3, w, 2 + r() * 3)
  }
}

// One item hung from a rail at (x, y).
function hung(p: Painter, kind: Ware, x: number, y: number) {
  const { r } = p
  p.path('tb-line tb-line--faint', `M${n1(x)},${n1(y)} l0,1.5`)
  switch (kind) {
    case 'weapons':
      p.path('tb-line', `M${n1(x)},${n1(y + 1.5)} L${n1(x)},${n1(y + 13 + r() * 5)} M${n1(x - 2)},${n1(y + 4)} L${n1(x + 2)},${n1(y + 4)}`)
      break
    case 'armor':
      p.path(MID, `M${n1(x - 3.5)},${n1(y + 2)} L${n1(x + 3.5)},${n1(y + 2)} L${n1(x + 3)},${n1(y + 8)} Q${n1(x)},${n1(y + 11)} ${n1(x - 3)},${n1(y + 8)} Z`)
      break
    case 'clothing':
      p.path(MID, `M${n1(x - 2)},${n1(y + 1.5)} L${n1(x + 2)},${n1(y + 1.5)} L${n1(x + 4)},${n1(y + 10 + r() * 3)} L${n1(x - 4)},${n1(y + 10 + r() * 3)} Z`)
      break
    case 'furs':
      p.path(MID, `M${n1(x - 2.5)},${n1(y + 1.5)} Q${n1(x - 4)},${n1(y + 6)} ${n1(x - 2)},${n1(y + 11)} L${n1(x + 2)},${n1(y + 11)} Q${n1(x + 4)},${n1(y + 6)} ${n1(x + 2.5)},${n1(y + 1.5)} Z`)
      break
    case 'tools':
      p.path('tb-line', `M${n1(x)},${n1(y + 1.5)} L${n1(x)},${n1(y + 10)}`)
      p.rect(MID, x - 2, y + 1.5, 4, 2)
      break
    default:
      p.ellipse(MID, x, y + 4.5, 2.2, 3)
  }
}

function fixture(p: Painter, f: Fixture, x0: number, x1: number, wares: Ware | null) {
  const { r } = p
  const w = x1 - x0, cx = (x0 + x1) / 2
  const goods: Ware = wares ?? 'general'
  switch (f) {
    case 'shelves':
    case 'books':
      // At most ~14 items a shelf, whatever the slot's width (the shape budget).
      for (const y of [11, 20, 29]) {
        p.path(LINE, `M${n1(x0)},${y} L${n1(x1)},${y}`)
        const step = Math.max(5, (x1 - x0) / 14)
        for (let x = x0 + 2; x < x1 - 6; x += step + r() * 3) if (r() > 0.15) ware(p, f === 'books' ? 'books' : goods, x, y, 4)
      }
      break
    case 'racks':
      p.path('tb-line tb-line--bold', `M${n1(x0 + 4)},9 L${n1(x1 - 4)},9`)
      for (let x = x0 + 8; x < x1 - 6; x += Math.max(9, (x1 - x0) / 14) + r() * 4) hung(p, goods, x, 9)
      break
    case 'cases':
      for (let x = x0 + 4; x < x1 - 20; x += 30) {
        p.rect(MID, x, 34, 24, 6)
        p.rect('tb-glass', x, 26, 24, 8)
        for (let i = 0; i < 3; i++) ware(p, goods, x + 2 + i * 7, 33.5, 5)
      }
      break
    case 'counter':
      p.rect(MID, x0, 31, w, 9)
      p.path(LINE, `M${n1(x0)},31 L${n1(x1)},31`)
      for (let x = x0 + 6; x < x1 - 8; x += 12 + r() * 10) if (r() < 0.6) ware(p, goods, x, 31, 5)
      break
    case 'tables':
      for (let x = x0 + 6; x < x1 - 20; x += 36 + r() * 10) {
        p.rect(MID, x, 31, 22, 1.8)
        p.rect(MID, x + 2, 32, 1.4, 8); p.rect(MID, x + 18.6, 32, 1.4, 8)
        if (r() < 0.5) p.rect(MID, x + 8, 28.5, 3, 2.5)
      }
      break
    case 'benches':
      for (let x = x0 + 4; x < x1 - 30; x += 40) {
        p.rect(MID, x, 34, 32, 1.8)
        p.rect(MID, x + 2, 35, 1.4, 5); p.rect(MID, x + 28.6, 35, 1.4, 5)
        p.rect(MID, x, 29, 32, 1.2)
      }
      break
    case 'bar':
      p.path(LINE, `M${n1(x0)},16 L${n1(x1)},16`)
      for (let x = x0 + 3; x < x1 - 4; x += 4 + r() * 3) ware(p, 'drink', x, 16, 3)
      p.rect(MID, x0, 29, w, 11)
      for (let x = x0 + 8; x < x1 - 4; x += 16) { p.circle(MID, x, 33, 2.2); p.rect(MID, x - 0.6, 33, 1.2, 7) }
      break
    case 'hearth':
      p.path(MID, `M${n1(cx - 18)},40 L${n1(cx - 18)},18 L${n1(cx + 18)},18 L${n1(cx + 18)},40 Z`)
      p.rect(MID, cx - 22, 16, 44, 2.5)
      p.path('tb-hearth', `M${n1(cx - 10)},40 L${n1(cx - 10)},29 Q${n1(cx)},22 ${n1(cx + 10)},29 L${n1(cx + 10)},40 Z`)
      p.ellipse('tb-flame', cx, 37, 5, 3)
      break
    case 'stairs':
      // A staircase in outline: the treads and a rail, not seven solid blocks.
      for (let i = 0; i < 7; i++) p.rect(FAR, x0 + 6 + i * (w - 12) / 7, 40 - (i + 1) * 4.5, (w - 12) / 7 + 0.5, 1.5)
      p.path(LINE, `M${n1(x0 + 6)},${n1(40 - 4.5)} L${n1(x1 - 6)},${n1(40 - 31.5)} M${n1(x0 + 6)},${n1(40 - 11)} L${n1(x1 - 6)},${n1(40 - 38)}`)
      break
    case 'columns':
      for (let x = x0 + 8; x < x1 - 4; x += 30) { p.rect(MID, x, 2, 6, 38); p.rect(MID, x - 1.5, 0, 9, 2.5); p.rect(MID, x - 1.5, 37.5, 9, 2.5) }
      break
    case 'windows':
      for (let x = x0 + 12; x < x1 - 18; x += 40) {
        p.path('tb-window', `M${x},28 L${x},12 Q${x + 9},3 ${x + 18},12 L${x + 18},28 Z`)
        p.path(LINE, `M${x + 9},6 L${x + 9},28 M${x},18 L${x + 18},18`)
      }
      break
    case 'stainedglass':
      for (let x = cx - 26; x <= cx + 10; x += 18) {
        p.path('tb-glass', `M${n1(x)},32 L${n1(x)},10 Q${n1(x + 8)},-2 ${n1(x + 16)},10 L${n1(x + 16)},32 Z`)
        p.circle('tb-bloom', x + 8, 12, 2.5)
        p.path('tb-line tb-line--faint', `M${n1(x + 8)},4 L${n1(x + 8)},32 M${n1(x)},20 L${n1(x + 16)},20`)
      }
      break
    case 'tapestries':
      for (let x = x0 + 8; x < x1 - 18; x += 34) {
        p.rect('tb-tapestry', x, 4, 18, 22)
        p.path('tb-line tb-line--faint', `M${x + 3},10 L${x + 15},10 M${x + 3},20 L${x + 15},20 M${x},26 l2,2 l2,-2 l2,2 l2,-2 l2,2 l2,-2 l2,2 l2,-2 l2,2`)
      }
      break
    case 'chandelier':
      p.path(LINE, `M${n1(cx)},0 L${n1(cx)},8`)
      p.ellipse('tb-line', cx, 10, 14, 2.5)
      for (let i = -2; i <= 2; i++) p.ellipse('tb-flame', cx + i * 6, 7.5, 0.9, 1.5)
      break
    case 'bed':
      p.rect(MID, cx - 26, 33, 52, 5)
      p.rect(MID, cx - 28, 24, 4, 16)
      p.rect(MID, cx + 24, 30, 4, 10)
      p.ellipse(MID, cx - 18, 31.5, 6, 2)
      break
    case 'desk':
      p.rect(MID, cx - 18, 30, 36, 2)
      p.rect(MID, cx - 18, 32, 10, 8); p.rect(MID, cx + 15, 32, 3, 8)
      p.rect('tb-wall', cx - 2, 28.6, 9, 1.4)
      p.ellipse('tb-flame', cx + 12, 27, 1, 1.6)
      break
    case 'altar':
      p.rect(MID, cx - 22, 31, 44, 9)
      p.rect(MID, cx - 25, 30, 50, 2)
      for (const ax of [cx - 14, cx, cx + 14]) { p.rect(MID, ax - 0.8, 25, 1.6, 5); p.ellipse('tb-flame', ax, 23.6, 1.2, 2) }
      break
    case 'forge':
      p.path(MID, `M${n1(cx - 22)},40 L${n1(cx - 22)},22 L${n1(cx - 10)},6 L${n1(cx + 2)},6 L${n1(cx + 14)},22 L${n1(cx + 14)},40 Z`)
      p.path('tb-hearth', `M${n1(cx - 14)},40 L${n1(cx - 14)},30 L${n1(cx + 6)},30 L${n1(cx + 6)},40 Z`)
      p.ellipse('tb-flame', cx - 4, 36, 7, 3)
      p.path(MID, `M${n1(cx + 22)},33 L${n1(cx + 40)},33 L${n1(cx + 36)},36 L${n1(cx + 33)},36 L${n1(cx + 33)},40 L${n1(cx + 29)},40 L${n1(cx + 29)},36 L${n1(cx + 26)},36 Z`)
      break
    case 'barrels':
      for (let x = x0 + 6; x < x1 - 12; x += 13 + r() * 6) {
        if (r() < 0.5) { p.ellipse(MID, x + 5, 34, 5, 6); p.path('tb-line tb-line--faint', `M${n1(x)},32 L${n1(x + 10)},32 M${n1(x)},36 L${n1(x + 10)},36`) }
        else { p.rect(MID, x, 30, 10, 10); p.path('tb-line tb-line--faint', `M${n1(x)},30 L${n1(x + 10)},40 M${n1(x + 10)},30 L${n1(x)},40`) }
      }
      break
    case 'plants':
      for (let x = x0 + 10; x < x1 - 10; x += 40 + r() * 20) {
        p.path(MID, `M${n1(x - 4)},34 L${n1(x + 4)},34 L${n1(x + 3)},40 L${n1(x - 3)},40 Z`)
        for (let i = 0; i < 4; i++) p.ellipse(MID, x + (i - 1.5) * 3, 30 - (i % 2) * 2, 2.2, 3.5)
      }
      break
    // ── The prop round (v0.20.3) ───────────────────────────────────────────
    case 'statue': {
      // A figure on a plinth; two when the slot is wide.
      const xs = w > 160 ? [x0 + w * 0.3, x1 - w * 0.3] : [cx]
      for (const sx of xs) {
        p.path(MID, `M${n1(sx - 6)},40 h12 v-8 h-12 Z M${n1(sx - 7.5)},32 h15 v-1.6 h-15 Z M${n1(sx - 3.5)},30.4 L${n1(sx - 3)},16 Q${n1(sx)},14 ${n1(sx + 3)},16 L${n1(sx + 3.5)},30.4 Z`)
        p.circle(MID, sx, 12, 2.6)
      }
      break
    }
    case 'paintings':
      // Framed pictures along the wall, each with a faint horizon in it.
      for (let x = x0 + 8; x < x1 - 22; x += 30 + r() * 10) {
        const pw = 16 + r() * 6, ph = 11 + r() * 5, y = 6 + r() * 4
        p.rect(MID, x - 1.4, y - 1.4, pw + 2.8, ph + 2.8)
        p.rect('tb-canvas', x, y, pw, ph)
        p.path('tb-line tb-line--faint', `M${n1(x)},${n1(y + ph * 0.65)} Q${n1(x + pw * 0.4)},${n1(y + ph * 0.35)} ${n1(x + pw)},${n1(y + ph * 0.6)}`)
      }
      break
    case 'mirror':
      // A tall oval glass on a stand.
      p.ellipse(MID, cx, 19, 7.4, 11.4)
      p.ellipse('tb-glass', cx, 19, 5.8, 9.8)
      p.path('tb-line tb-line--faint', `M${n1(cx - 3)},14 L${n1(cx - 1)},11 M${n1(cx - 3)},19 L${n1(cx + 1)},13`)
      p.path(LINE, `M${n1(cx)},30.4 L${n1(cx)},37 M${n1(cx - 6)},40 L${n1(cx)},37 L${n1(cx + 6)},40`)
      break
    case 'mannequins':
      // Dress forms on their poles.
      for (let x = x0 + 14; x < x1 - 10; x += 26 + r() * 6) {
        p.path(MID, `M${n1(x - 4)},12 Q${n1(x - 6)},16 ${n1(x - 3.5)},20 Q${n1(x - 6.5)},26 ${n1(x - 5)},30 L${n1(x + 5)},30 Q${n1(x + 6.5)},26 ${n1(x + 3.5)},20 Q${n1(x + 6)},16 ${n1(x + 4)},12 Z M${n1(x - 0.9)},9 h1.8 v3 h-1.8 Z M${n1(x - 0.6)},30 h1.2 v8.5 h-1.2 Z`)
        p.ellipse(MID, x, 39.2, 4.5, 0.9)
      }
      break
    case 'workbench':
      // A bench with tools hung on the wall above and a vise at one end.
      p.path('tb-line tb-line--bold', `M${n1(cx - 26)},10 L${n1(cx + 26)},10`)
      for (let x = cx - 20; x < cx + 22; x += 9 + r() * 4) hung(p, 'tools', x, 10)
      p.path(MID, `M${n1(cx - 30)},29 h60 v2 h-60 Z M${n1(cx - 28)},31 h2 v9 h-2 Z M${n1(cx + 26)},31 h2 v9 h-2 Z M${n1(cx - 28)},36 h56 v1.2 h-56 Z M${n1(cx + 18)},25 h6 v4 h-6 Z`)
      for (let x = cx - 22; x < cx + 12; x += 8 + r() * 6) if (r() < 0.6) p.rect(MID, x, 27, 3 + r() * 3, 2)
      break
    case 'stage': {
      // A raised stage with its curtains drawn back.
      const sx0 = x0 + 4, sx1 = x1 - 4
      p.rect(MID, sx0, 33, sx1 - sx0, 7)
      p.path(LINE, `M${n1(sx0)},33 L${n1(sx1)},33`)
      p.path('tb-tapestry', `M${n1(sx0)},0 L${n1(sx0 + 22)},0 Q${n1(sx0 + 10)},14 ${n1(sx0 + 8)},33 L${n1(sx0)},33 Z M${n1(sx1)},0 L${n1(sx1 - 22)},0 Q${n1(sx1 - 10)},14 ${n1(sx1 - 8)},33 L${n1(sx1)},33 Z`)
      let v = `M${n1(sx0)},0 L${n1(sx1)},0 L${n1(sx1)},3`
      for (let x = sx1; x > sx0; x -= 12) v += ` Q${n1(x - 6)},7 ${n1(Math.max(sx0, x - 12))},3`
      p.path('tb-tapestry', v + ' Z')
      break
    }
    case 'pool':
    case 'rug':
      // Drawn on the floor (drawGround).
      break
    case 'door':
      archDoor(p, 'tb-wall', cx - 9, 18, 30)
      p.path(LINE, `M${n1(cx - 9)},40 L${n1(cx - 9)},19 Q${n1(cx)},6 ${n1(cx + 9)},19 L${n1(cx + 9)},40 M${n1(cx)},12 L${n1(cx)},40`)
      p.circle(LINE, cx + 4, 28, 0.7)
      break
  }
}

// What lights the room: drawn where it would hang or burn.
function drawLight(p: Painter, light: Light) {
  const { r } = p
  switch (light) {
    case 'lanterns':
      for (let x = 50 + r() * 30; x < 400; x += 110 + r() * 40) {
        p.path(LINE, `M${n1(x)},0 L${n1(x)},5`)
        p.rect(MID, x - 2, 5, 4, 5)
        p.ellipse('tb-flame', x, 7.5, 1, 1.6)
      }
      break
    case 'orbs':
      for (let x = 40 + r() * 30; x < 400; x += 90 + r() * 40) {
        p.path('tb-line tb-line--faint', `M${n1(x)},0 L${n1(x)},6`)
        p.circle('tb-orb', x, 8, 2.6)
      }
      break
    case 'candles':
      for (let x = 30 + r() * 30; x < 400; x += 70 + r() * 50) { p.rect(MID, x - 0.8, 24, 1.6, 4); p.ellipse('tb-flame', x, 22.6, 1, 1.8) }
      break
    case 'torches':
      for (let x = 40 + r() * 40; x < 400; x += 120 + r() * 40) {
        p.path(LINE, `M${n1(x)},20 L${n1(x + 3)},14`)
        p.ellipse('tb-flame', x + 3.4, 12.2, 1.6, 2.6)
      }
      break
    case 'daylight':
      for (let x = 60 + r() * 60; x < 400; x += 150) p.path('tb-shaft', `M${n1(x)},0 L${n1(x + 16)},0 L${n1(x + 46)},40 L${n1(x + 22)},40 Z`)
      break
    case 'fire':
      break   // the hearth or forge carries it
  }
}

// Fixtures drawn on the floor (drawGround), not against the wall.
const ON_FLOOR = new Set<Fixture>(['rug', 'pool'])

function drawComposedInterior(p: Painter, s: SceneSpec) {
  const walls = s.walls !== 'plain' ? s.walls : (s.town && WALL_OF_TOWN[s.town]) || 'plain'
  drawWallMaterial(p, walls)
  let fx = s.fixtures.filter(f => !ON_FLOOR.has(f))
  // A shop that says what it sells but names nowhere to put it gets shelves.
  if (s.wares && s.wares !== 'general' && !fx.some(f => f === 'shelves' || f === 'racks' || f === 'cases' || f === 'counter' || f === 'bar' || f === 'mannequins')) {
    const holder: Fixture = s.wares === 'weapons' || s.wares === 'armor' || s.wares === 'clothing' || s.wares === 'furs' ? 'racks' : 'shelves'
    fx = [holder, ...fx].slice(0, 3)
  }
  // Slots: the first fixture takes the middle, then left, then right.
  const SLOTS: [number, number][] = fx.length === 1 ? [[60, 340]] : fx.length === 2 ? [[205, 395], [5, 195]] : [[140, 260], [5, 135], [265, 395]]
  fx.forEach((f, i) => fixture(p, f, SLOTS[i][0], SLOTS[i][1], s.wares))
  if (s.light) drawLight(p, s.light)
}

// ── outdoor props (v0.20.3) ────────────────────────────────────────────────
// Up to three things standing in the scene, in front of the mid-ground: the
// first a little left of centre, then left, then right, so the middle of the
// stage (where the figures stand) stays clear.

function prop(p: Painter, kind: Prop, x: number, town: TownStyle | null) {
  const { r } = p
  switch (kind) {
    case 'tower': {
      // A tall landmark tower — broader than any spire around it, with a gallery
      // ring near the top; in a crystal city its tip is crystal and it glows.
      const w = 13
      p.path(PROP, `M${n1(x - w / 2)},40 L${n1(x - w * 0.32)},8 L${n1(x + w * 0.32)},8 L${n1(x + w / 2)},40 Z`)
      for (const y of [14, 22, 30]) p.rect('tb-window', x - 0.8, y, 1.6, 3)
      p.rect(PROP, x - w * 0.42, 10, w * 0.84, 1.6)
      if (town === 'crystal') {
        p.ellipse('tb-halo', x, 6, 9, 7)
        p.path('tb-crystal', `M${n1(x - w * 0.36)},8 L${n1(x)},0 L${n1(x + w * 0.36)},8 Z`)
      } else {
        p.path(PROP, `M${n1(x - w * 0.4)},8 L${n1(x)},1 L${n1(x + w * 0.4)},8 Z`)
      }
      break
    }
    case 'fountain':
      p.ellipse(PROP, x, 38, 16, 2.5)
      p.rect(PROP, x - 14, 34, 28, 4)
      p.rect(PROP, x - 2, 22, 4, 12)
      p.ellipse(PROP, x, 22, 7, 1.6)
      for (const d of [-1, 1]) p.path('tb-spray', `M${n1(x)},20 Q${n1(x + d * 8)},12 ${n1(x + d * 12)},33`)
      break
    case 'statue':
      p.rect(PROP, x - 6, 32, 12, 8)
      p.rect(PROP, x - 7.5, 31, 15, 1.6)
      p.circle(PROP, x, 13, 2.6)
      p.path(PROP, `M${n1(x - 3.5)},31 L${n1(x - 3)},17 Q${n1(x)},15 ${n1(x + 3)},17 L${n1(x + 3.5)},31 Z`)
      p.path(LINE, `M${n1(x + 3)},19 L${n1(x + 7)},12`)
      break
    case 'well':
      p.rect(PROP, x - 9, 32, 18, 8)
      p.ellipse(PROP, x, 32, 9, 1.6)
      p.path(LINE, `M${n1(x - 8)},32 L${n1(x - 8)},20 M${n1(x + 8)},32 L${n1(x + 8)},20 M${n1(x)},21 L${n1(x)},27`)
      p.path(PROP, `M${n1(x - 12)},21 L${n1(x)},15 L${n1(x + 12)},21 Z`)
      p.rect(PROP, x - 1.5, 27, 3, 3)
      break
    case 'benches':
      for (const dx of [-14, 8]) {
        p.rect(PROP, x + dx, 35, 14, 1.4)
        p.rect(PROP, x + dx + 1, 36, 1.2, 4); p.rect(PROP, x + dx + 11.8, 36, 1.2, 4)
        p.rect(PROP, x + dx, 31.5, 14, 1)
      }
      break
    case 'stalls':
      for (const dx of [-22, 4]) {
        p.rect(PROP, x + dx, 33, 18, 7)
        p.path(LINE, `M${n1(x + dx + 1)},33 L${n1(x + dx + 1)},24 M${n1(x + dx + 17)},33 L${n1(x + dx + 17)},24`)
        p.path('tb-awning', `M${n1(x + dx - 2)},26 L${n1(x + dx + 20)},26 L${n1(x + dx + 18)},22 L${n1(x + dx)},22 Z`)
        for (let i = 0; i < 3; i++) p.rect(PROP, x + dx + 3 + i * 5, 31, 3, 2)
      }
      break
    case 'tents':
      p.path(PROP, `M${n1(x - 14)},40 L${n1(x)},22 L${n1(x + 14)},40 Z`)
      p.path('tb-wall', `M${n1(x - 3)},40 L${n1(x)},31 L${n1(x + 3)},40 Z`)
      p.path(LINE, `M${n1(x - 2)},20 L${n1(x)},22 L${n1(x + 2)},20`)
      break
    case 'fence':
      p.path(LINE, `M${n1(x - 40)},33 L${n1(x + 40)},33 M${n1(x - 40)},37 L${n1(x + 40)},37`)
      for (let fx = x - 40; fx <= x + 40; fx += 10) p.rect(PROP, fx - 0.8, 30, 1.6, 10)
      break
    case 'gate':
      p.rect(PROP, x - 16, 16, 5, 24)
      p.rect(PROP, x + 11, 16, 5, 24)
      p.path('tb-line tb-line--bold', `M${n1(x - 11)},19 Q${n1(x)},10 ${n1(x + 11)},19`)
      for (let gx = x - 9; gx <= x + 9; gx += 3) p.path(LINE, `M${n1(gx)},${n1(17 + Math.abs(gx - x) * 0.25)} L${n1(gx)},40`)
      break
    case 'dock':
      p.rect('tb-water', x - 60, 36, 120, 4)
      p.rect(PROP, x - 40, 33, 80, 2)
      for (let px = x - 38; px <= x + 38; px += 12) p.path(LINE, `M${n1(px)},35 L${n1(px)},40`)
      p.path(LINE, `M${n1(x + 36)},33 L${n1(x + 36)},27`)
      break
    case 'boats': {
      const d = r() < 0.5 ? -1 : 1
      p.rect('tb-water', x - 40, 36, 80, 4)
      p.path(PROP, `M${n1(x - 16)},34 L${n1(x + 16)},34 L${n1(x + 11)},38.5 L${n1(x - 11)},38.5 Z`)
      p.path(LINE, `M${n1(x)},34 L${n1(x)},16`)
      p.path(FAR, `M${n1(x + d)},17 L${n1(x + d)},32 L${n1(x + d * 12)},31 Z`)
      break
    }
    case 'campfire':
      p.path(PROP, `M${n1(x - 7)},39 L${n1(x + 7)},36.5 L${n1(x + 7.5)},38 L${n1(x - 6.5)},40 Z M${n1(x - 7)},36.5 L${n1(x + 7)},39 L${n1(x + 6.5)},40 L${n1(x - 7.5)},38 Z`)
      p.ellipse('tb-flame', x, 34.5, 3.4, 4)
      for (let i = 0; i < 3; i++) p.ellipse('tb-smoke', x + i * 2, 27 - i * 5, 2 + i, 1.4 + i * 0.6)
      for (let a = 0; a < 7; a++) p.circle(PROP, x + Math.cos(a) * 9, 39.5 + Math.sin(a) * 0.6, 1.1)
      break
    case 'flowers':
      for (let i = 0; i < 9; i++) {
        const fx = x - 26 + i * 6.5 + r() * 3, h = 3 + r() * 4
        p.path(LINE, `M${n1(fx)},40 L${n1(fx)},${n1(40 - h)}`)
        p.circle('tb-bloom', fx, 40 - h - 0.8, 1.3)
      }
      break
    case 'lampposts':
      for (const dx of [-24, 24]) {
        p.rect(PROP, x + dx - 0.8, 16, 1.6, 24)
        p.rect(PROP, x + dx - 2.5, 12, 5, 4)
        p.ellipse('tb-flame', x + dx, 14, 1.2, 1.6)
      }
      break
    case 'bones':
      p.circle(PROP, x - 8, 37, 2.6)
      p.path('tb-line', `M${n1(x - 4)},38 Q${n1(x + 4)},31 ${n1(x + 12)},38 M${n1(x - 1)},37 L${n1(x)},34 M${n1(x + 3)},36 L${n1(x + 4)},33 M${n1(x + 7)},36 L${n1(x + 8)},33.5 M${n1(x + 14)},39 L${n1(x + 22)},38`)
      break
    // ── From the whole-map coverage scan (v0.20.3) ─────────────────────────
    case 'boulders':
      for (const [dx, w, h] of [[-14, 14, 9], [2, 10, 6], [14, 7, 4]] as const) {
        const bx = x + dx
        p.path(PROP, `M${n1(bx - w / 2)},40 Q${n1(bx - w / 2)},${n1(40 - h)} ${n1(bx - w * 0.1)},${n1(40 - h * 1.05)} Q${n1(bx + w / 2)},${n1(40 - h * 0.9)} ${n1(bx + w / 2)},40 Z`)
      }
      break
    case 'door': {
      // A building front with its door (outdoors only: a cave never draws one).
      p.rect(PROP, x - 16, 16, 32, 24)
      p.path(PROP, `M${n1(x - 18)},16 L${n1(x)},9 L${n1(x + 18)},16 Z`)
      archDoor(p, 'tb-wall', x - 4, 8, 13)
      p.path(LINE, `M${n1(x - 4)},40 L${n1(x - 4)},31 Q${n1(x)},25 ${n1(x + 4)},31 L${n1(x + 4)},40`)
      p.circle(LINE, x + 2.4, 34, 0.5)
      p.rect(PROP, x - 7, 39, 14, 1)
      break
    }
    case 'arch':
      // A free-standing stone arch.
      p.path(PROP, `M${n1(x - 16)},40 L${n1(x - 16)},20 Q${n1(x)},4 ${n1(x + 16)},20 L${n1(x + 16)},40 L${n1(x + 10)},40 L${n1(x + 10)},22 Q${n1(x)},12 ${n1(x - 10)},22 L${n1(x - 10)},40 Z`)
      p.path('tb-line tb-line--faint', `M${n1(x - 16)},25 L${n1(x - 10)},25 M${n1(x + 10)},25 L${n1(x + 16)},25`)
      break
    case 'shrubs': {
      // A low row of bushes as one scalloped shape (no see-through stacking).
      let d = `M${n1(x - 26)},40`
      for (let bx = x - 26; bx < x + 26;) { const w = 7 + r() * 6; d += ` Q${n1(bx + w / 2)},${n1(31 - r() * 4)} ${n1(bx + w)},40`; bx += w }
      p.path(PROP, d + ' Z')
      break
    }
    case 'vines':
      // A low old wall overgrown with ivy and moss.
      p.rect(FAR, x - 22, 30, 44, 10)
      for (let vx = x - 20; vx < x + 20; vx += 4 + r() * 3) {
        p.path(LINE, `M${n1(vx)},29 q${n1((r() - 0.5) * 3)},5 0,${n1(6 + r() * 5)}`)
        p.ellipse(PROP, vx + 1, 30 + r() * 6, 1.6, 1.1)
      }
      break
    case 'birds': {
      // A few birds in the sky (static).
      const by = 4 + r() * 6
      let d = ''
      for (let i = 0; i < 4; i++) {
        const bx = x - 30 + i * 18 + r() * 8, yy = by + r() * 6, s2 = 2 + r() * 1.5
        d += `M${n1(bx - s2)},${n1(yy)} Q${n1(bx - s2 / 2)},${n1(yy - s2 * 0.7)} ${n1(bx)},${n1(yy)} Q${n1(bx + s2 / 2)},${n1(yy - s2 * 0.7)} ${n1(bx + s2)},${n1(yy)}`
      }
      p.path(LINE, d)
      break
    }
    case 'sign':
      // A signpost with a hanging board.
      p.rect(PROP, x - 0.9, 18, 1.8, 22)
      p.rect(PROP, x - 0.9, 18, 13, 1.4)
      p.path(LINE, `M${n1(x + 4)},19.4 L${n1(x + 4)},23 M${n1(x + 10)},19.4 L${n1(x + 10)},23`)
      p.rect(PROP, x + 2.5, 23, 9, 6)
      break
    case 'crystals':
      for (const [dx, h, lean] of [[-10, 14, -3], [-4, 20, -1], [2, 16, 2], [8, 11, 4], [13, 7, 5]] as const) {
        const cx = x + dx
        p.path('tb-crystal', `M${n1(cx - 2.2)},40 L${n1(cx + lean - 1)},${n1(40 - h + 2)} L${n1(cx + lean)},${n1(40 - h)} L${n1(cx + lean + 1)},${n1(40 - h + 2)} L${n1(cx + 2.2)},40 Z`)
      }
      break
    case 'tree': {
      // One big broadleaf tree standing on its own.
      const h = 30 + r() * 6
      p.path(PROP, `M${n1(x - 2.5)},40 Q${n1(x - 1)},${n1(40 - h * 0.4)} ${n1(x - 1.5)},${n1(40 - h * 0.6)} L${n1(x + 1.5)},${n1(40 - h * 0.6)} Q${n1(x + 1)},${n1(40 - h * 0.4)} ${n1(x + 2.5)},40 Z`)
      p.circle(PROP, x, 40 - h * 0.78, h * 0.32)
      break
    }
    case 'rubble':
      for (let i = 0; i < 7; i++) {
        const rx = x - 18 + i * 6 + r() * 3, w = 3 + r() * 4, h = 2 + r() * 3
        p.path(PROP, `M${n1(rx)},40 L${n1(rx + r())},${n1(40 - h)} L${n1(rx + w)},${n1(40 - h * (0.6 + r() * 0.5))} L${n1(rx + w + 0.5)},40 Z`)
      }
      break
    case 'cart':
      p.rect(PROP, x - 12, 29, 24, 6)
      p.path(LINE, `M${n1(x - 12)},29 L${n1(x - 14)},25 M${n1(x + 12)},29 L${n1(x + 14)},25 M${n1(x + 12)},32 L${n1(x + 24)},36`)
      p.circle('tb-line', x - 6, 36.5, 3.5)
      p.circle('tb-line', x + 6, 36.5, 3.5)
      break
    case 'mushrooms':
      for (const [dx, h, w] of [[-6, 5, 5], [0, 7, 7], [6, 4, 4], [10, 3, 3]] as const) {
        const mx = x + dx
        p.rect(PROP, mx - 0.6, 40 - h, 1.2, h)
        p.path(PROP, `M${n1(mx - w / 2)},${n1(40 - h + 0.5)} Q${n1(mx)},${n1(40 - h - w * 0.55)} ${n1(mx + w / 2)},${n1(40 - h + 0.5)} Z`)
      }
      break
    case 'webs': {
      // A web strung in the top corner nearest the slot.
      const cx = x < 200 ? 0 : 400, dir = x < 200 ? 1 : -1
      let d = ''
      for (let a = 0; a < 5; a++) { const ang = (a / 4) * (Math.PI / 2); d += `M${cx},0 L${n1(cx + dir * Math.cos(ang) * 30)},${n1(Math.sin(ang) * 30)}` }
      for (const rr of [9, 17, 25]) d += `M${n1(cx + dir * rr)},0 Q${n1(cx + dir * rr * 0.75)},${n1(rr * 0.75)} ${cx},${rr}`
      p.path('tb-line tb-line--faint', d)
      break
    }
    case 'banners':
      for (const dx of [-12, 12]) {
        p.rect(PROP, x + dx - 0.7, 8, 1.4, 32)
        p.path('tb-banner', `M${n1(x + dx + 0.7)},9 L${n1(x + dx + 9)},9 L${n1(x + dx + 9)},21 L${n1(x + dx + 4.8)},18 L${n1(x + dx + 0.7)},21 Z`)
      }
      break
    case 'animals':
      // A horse or cow, and a smaller one (a sheep or goat), grazing.
      for (const [dx, s2] of [[-8, 1], [10, 0.6]] as const) {
        const ax = x + dx
        p.ellipse(PROP, ax, 40 - 7 * s2, 7 * s2, 3.4 * s2)
        p.path(PROP, `M${n1(ax + 6 * s2)},${n1(40 - 8 * s2)} L${n1(ax + 10 * s2)},${n1(40 - 6 * s2)} L${n1(ax + 9 * s2)},${n1(40 - 3.5 * s2)} L${n1(ax + 6 * s2)},${n1(40 - 5.5 * s2)} Z`)
        p.path(LINE, `M${n1(ax - 4.5 * s2)},${n1(40 - 4 * s2)} L${n1(ax - 4.5 * s2)},40 M${n1(ax - 2 * s2)},${n1(40 - 4 * s2)} L${n1(ax - 2 * s2)},40 M${n1(ax + 3 * s2)},${n1(40 - 4 * s2)} L${n1(ax + 3 * s2)},40 M${n1(ax + 5 * s2)},${n1(40 - 4 * s2)} L${n1(ax + 5 * s2)},40`)
      }
      break
    case 'smoke':
      for (let i = 0; i < 4; i++) p.ellipse('tb-smoke', x + i * 3, 26 - i * 6, 2.5 + i * 1.4, 1.6 + i * 0.7)
      break
    case 'logs':
      p.path(PROP, `M${n1(x - 24)},39 L${n1(x + 20)},36 L${n1(x + 21)},39.5 L${n1(x - 23)},40 Z`)
      p.ellipse(PROP, x + 21, 37.7, 1.4, 1.9)
      p.path(LINE, `M${n1(x - 6)},37 L${n1(x - 9)},33`)
      break
    // ── The prop round (v0.20.3) ───────────────────────────────────────────
    case 'obelisk': {
      // A needle of stone with a pointed cap, and two rough standing stones.
      let d = `M${n1(x - 4)},40 L${n1(x - 2.6)},8 L${n1(x)},2 L${n1(x + 2.6)},8 L${n1(x + 4)},40 Z`
      for (const [dx, h] of [[-17, 14], [15, 10]] as const) {
        const bx = x + dx
        d += `M${n1(bx - 3)},40 L${n1(bx - 3.4)},${n1(43 - h)} Q${n1(bx)},${n1(39 - h)} ${n1(bx + 3)},${n1(42 - h)} L${n1(bx + 3.2)},40 Z`
      }
      p.path(PROP, d)
      p.path('tb-line tb-line--faint', `M${n1(x)},13 L${n1(x)},34`)
      break
    }
    case 'pillars': {
      // A short colonnade: two columns under a lintel, the third snapped off.
      let d = `M${n1(x - 30)},11.5 h34 v2.5 h-34 Z`
      for (const dx of [-24, -2]) {
        const cx = x + dx
        d += `M${n1(cx - 2.5)},16 h5 v22.5 h-5 Z M${n1(cx - 4)},14 h8 v2 h-8 Z M${n1(cx - 4)},38.5 h8 v1.5 h-8 Z`
      }
      const cx = x + 20
      d += `M${n1(cx - 2.5)},38.5 L${n1(cx - 2.5)},24 L${n1(cx - 0.5)},26.5 L${n1(cx + 1)},23 L${n1(cx + 2.5)},25.5 L${n1(cx + 2.5)},38.5 Z M${n1(cx - 4)},38.5 h8 v1.5 h-8 Z`
      p.path(PROP, d)
      break
    }
    case 'pool': {
      // A pond rimmed with stones.
      p.ellipse('tb-pool', x, 37.6, 26, 3.2)
      let d = ''
      for (let a = 0; a < 12; a++) {
        const ang = Math.PI * (a / 11), sx = x + Math.cos(ang) * 26, sy = 37.6 + Math.sin(ang) * 3.2
        d += `M${n1(sx - 1.6)},${n1(sy + 0.6)} Q${n1(sx)},${n1(sy - 1.6)} ${n1(sx + 1.6)},${n1(sy + 0.6)} Z`
      }
      p.path(PROP, d)
      p.path('tb-line tb-line--faint', `M${n1(x - 10)},37.6 q3,-0.8 6,0 t6,0`)
      break
    }
    case 'hut': {
      // A small hut with a thatched roof.
      p.rect(PROP, x - 11, 29, 22, 11)
      p.path(PROP, `M${n1(x - 16)},30 L${n1(x)},17 L${n1(x + 16)},30 Z`)
      p.path('tb-line tb-line--faint', `M${n1(x - 8)},27 L${n1(x - 4)},23 M${n1(x + 4)},23 L${n1(x + 8)},27 M${n1(x - 11)},30 L${n1(x + 11)},30`)
      archDoor(p, 'tb-wall', x - 3, 6, 8)
      break
    }
    case 'arbor': {
      // An open garden gazebo: four posts under a domed roof.
      let d = `M${n1(x - 18)},38.5 h36 v1.5 h-36 Z M${n1(x - 19)},24 Q${n1(x)},8 ${n1(x + 19)},24 Z M${n1(x - 0.6)},12.5 v-4 h1.2 v4 Z`
      for (const dx of [-15, -5, 5, 15]) d += `M${n1(x + dx - 0.7)},24 h1.4 v14.5 h-1.4 Z`
      p.path(PROP, d)
      p.path('tb-line tb-line--faint', `M${n1(x - 15)},27 L${n1(x + 15)},27 M${n1(x - 15)},30 L${n1(x - 5)},27 M${n1(x + 5)},27 L${n1(x + 15)},30`)
      break
    }
    case 'brazier':
      // A fire bowl on a tripod.
      p.path(LINE, `M${n1(x - 4.5)},40 L${n1(x)},31 L${n1(x + 4.5)},40 M${n1(x)},31 L${n1(x)},40`)
      p.path(PROP, `M${n1(x - 6)},30.5 Q${n1(x)},35.5 ${n1(x + 6)},30.5 Z`)
      p.ellipse('tb-flame', x, 28, 3, 3.6)
      p.ellipse('tb-smoke', x + 1.5, 20, 2.4, 1.6)
      break
    case 'bell':
      // A bell hanging in a little roofed frame.
      p.path(PROP, `M${n1(x - 9)},19 h1.6 v21 h-1.6 Z M${n1(x + 7.4)},19 h1.6 v21 h-1.6 Z M${n1(x - 12)},19 L${n1(x)},12.5 L${n1(x + 12)},19 Z`
        + `M${n1(x - 3.5)},30 Q${n1(x - 3.5)},22.5 ${n1(x)},22 Q${n1(x + 3.5)},22.5 ${n1(x + 3.5)},30 L${n1(x + 4.6)},31 L${n1(x - 4.6)},31 Z`)
      p.path(LINE, `M${n1(x)},19 L${n1(x)},22 M${n1(x)},31 L${n1(x)},33`)
      break
    case 'crates': {
      // Crates stacked two and one, with a barrel beside.
      let d = '', lines = ''
      for (const [cx, cy] of [[x - 12, 31], [x - 1, 31], [x - 6.5, 22]] as const) {
        d += `M${n1(cx)},${cy} h10 v9 h-10 Z`
        lines += `M${n1(cx)},${cy} L${n1(cx + 10)},${cy + 9} M${n1(cx + 10)},${cy} L${n1(cx)},${cy + 9}`
      }
      p.path(PROP, d)
      p.path('tb-line tb-line--faint', lines + `M${n1(x + 12)},32.5 h10 M${n1(x + 12)},37 h10`)
      p.ellipse(PROP, x + 17, 34.5, 5, 5.5)
      break
    }
    case 'nest': {
      // A nest in the fork of a bare snag.
      p.path('tb-line tb-trunk', `M${n1(x)},40 L${n1(x + 1.5)},17 M${n1(x + 1)},27 L${n1(x + 12)},16 M${n1(x + 1.5)},22 L${n1(x - 9)},13`)
      p.path(PROP, `M${n1(x - 8)},16 Q${n1(x + 2)},25 ${n1(x + 12)},16 Q${n1(x + 2)},19 ${n1(x - 8)},16 Z`)
      p.path('tb-line tb-line--faint', `M${n1(x - 6)},17.5 L${n1(x + 10)},19.5 M${n1(x - 5)},19.5 L${n1(x + 9)},17`)
      break
    }
    case 'stalactites': {
      // Drips from the roof over the slot, and mounds rising to meet them.
      let d = `M${n1(x - 34)},0`
      for (let sx = x - 34; sx < x + 34; sx += 6 + r() * 6) d += ` L${n1(sx + 2.5)},${n1(6 + r() * 14)} L${n1(sx + 5)},${n1(1 + r() * 2)}`
      d += ` L${n1(x + 34)},0 Z`
      for (let sx = x - 26; sx < x + 26; sx += 10 + r() * 8) { const h = 4 + r() * 7; d += `M${n1(sx)},40 L${n1(sx + 2.4)},${n1(40 - h)} L${n1(sx + 4.8)},40 Z` }
      p.path(PROP, d)
      break
    }
  }
}

function drawProps(p: Painter, s: SceneSpec) {
  // Up to four: a little left of centre, then left, right, and right of centre.
  const AT = [150, 60, 330, 250]
  s.props.forEach((k, i) => prop(p, k, AT[i] + (p.r() - 0.5) * 20, s.town))
}

// Paving under the figures (v0.20.3), in perspective toward the horizon's
// middle. One path each, so a busy street costs one shape.
function drawPavement(p: Painter, kind: Pavement) {
  let d = ''
  switch (kind) {
    case 'cobbles':
      for (let x = -600; x <= 1000; x += 30) d += `M200,0 L${x},100`
      for (const y of [5, 11, 18, 26, 36, 48, 62, 79, 98]) d += `M0,${y} L400,${y}`
      break
    case 'flagstones':
      for (let x = -400; x <= 800; x += 60) d += `M200,0 L${x},100`
      for (const y of [9, 22, 40, 64, 94]) d += `M0,${y} L400,${y}`
      break
    case 'planks':
      for (let x = -400; x <= 800; x += 24) d += `M200,0 L${x},100`
      break
    case 'mosaic':
      // A medallion set in the floor: rings and spokes.
      p.ellipse('tb-line', 200, 58, 110, 26)
      p.ellipse('tb-line tb-line--faint', 200, 58, 70, 16)
      for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; d += `M${(200 + Math.cos(t) * 70).toFixed(1)},${(58 + Math.sin(t) * 16).toFixed(1)} L${(200 + Math.cos(t) * 110).toFixed(1)},${(58 + Math.sin(t) * 26).toFixed(1)}` }
      p.ellipse('tb-coin', 200, 58, 16, 4)
      break
  }
  if (d) p.path('tb-line tb-line--faint', d)
}

// ── ground (under the figures) ─────────────────────────────────────────────
// A 400×100 box, stretched to the floor of the stage; everything converges on
// a vanishing point at the middle of the horizon.
function drawGround(p: Painter, s: SceneSpec): void {
  const { r } = p
  if (s.pavement) drawPavement(p, s.pavement)
  if (s.enclosure === 'indoor') {
    if (!s.pavement) for (let x = -400; x <= 800; x += 80) p.path('tb-line tb-line--faint', `M200,0 L${x},100`)
    // A sunken pool, or a rug, on the floor in perspective.
    if (s.fixtures.includes('pool')) {
      p.path('tb-line', 'M134,16 L266,16 L322,64 L78,64 Z')
      p.path('tb-pool', 'M138,19 L262,19 L313,61 L87,61 Z')
      p.path('tb-line tb-line--faint', 'M150,32 q6,-2 12,0 t12,0 M228,44 q6,-2 12,0 t12,0 M118,52 q6,-2 12,0 t12,0')
    } else if (s.fixtures.includes('rug')) p.path('tb-rug', 'M150,30 L250,30 L300,80 L100,80 Z')
    return
  }
  if (s.ground === 'swamp') for (let i = 0; i < 5; i++) p.ellipse('tb-water', 30 + r() * 340, 20 + r() * 70, 14 + r() * 20, 2 + r() * 3)
  if (s.ground === 'lava' || s.near === 'lava') {
    for (let i = 0; i < 4; i++) {
      let x = 20 + r() * 360, y = 20 + r() * 30, d = `M${n1(x)},${n1(y)}`
      for (let j = 0; j < 5; j++) { x += (r() - 0.5) * 50; y += 6 + r() * 10; d += ` L${n1(x)},${n1(y)}` }
      p.path('tb-line tb-crack', d)
    }
  }
  if (s.mid === 'farm') for (let x = -300; x <= 700; x += 40) p.path('tb-line tb-line--faint', `M200,0 L${x},100`)
  if (s.near === 'river' && s.enclosure === 'outdoor') {
    const side = r() < 0.5 ? -1 : 1
    p.path('tb-water', `M190,0 L215,0 C${n1(200 + side * 60)},40 ${n1(200 - side * 40)},60 ${n1(200 + side * 120)},100 L${n1(200 + side * 120 - 70)},100 C${n1(200 - side * 70)},60 ${n1(200 + side * 30)},40 190,0 Z`)
  }
  if (s.near === 'road') {
    // A road narrowing into the distance, with a faint worn line down it.
    p.path('tb-road', 'M186,0 L214,0 L282,100 L118,100 Z')
    p.path('tb-line tb-line--faint tb-dash', 'M200,4 L200,100')
  }
}

export const TableauBackdrop = memo(function TableauBackdrop({ scene, sky, seedKey }: { scene: SceneSpec; sky: SkyBand; seedKey: string }) {
  const seed = hashStr(seedKey)
  const horizon = painter(seed)
  if (scene.enclosure === 'indoor') drawInterior(horizon, scene)
  else if (scene.enclosure === 'cave') { drawCave(horizon, scene); if (scene.props.length) drawProps(horizon, scene) }
  else {
    if (sky === 'night') for (let i = 0; i < 18; i++) horizon.circle('tb-star', horizon.r() * 400, horizon.r() * 18, 0.35 + horizon.r() * 0.45)
    // In volcanic country the cone IS the horizon: a far skyline gives way to
    // low hills, and the cone stands in front of them, behind what is near.
    drawFar(horizon, scene.volcanic && scene.far === 'skyline' ? { ...scene, far: 'hills' } : scene)
    if (scene.volcanic && scene.far !== 'sea') volcano(horizon)
    drawMid(horizon, scene)
    drawNear(horizon, scene)
    if (scene.props.length) drawProps(horizon, scene)
    if (scene.ground === 'moor' && scene.mid === 'none') drawMoor(horizon)
    // Haze: two bands, denser at the ground.
    if (scene.haze) { horizon.rect('tb-haze', 0, 24, 400, 16); horizon.rect('tb-haze', 0, 32, 400, 8) }
  }
  const ground = painter(seed ^ 0x5bd1e995)
  drawGround(ground, scene)
  return (
    <div className={`tableau-backdrop tableau-backdrop--${scene.enclosure} tableau-ground--${scene.ground} tableau-sky--${sky}${scene.volcanic ? ' tableau-backdrop--volcanic' : ''}`} aria-hidden="true">
      {ground.out.length > 0 && (
        <svg className="tableau-groundart" viewBox="0 0 400 100" preserveAspectRatio="none">{ground.out}</svg>
      )}
      <svg className="tableau-horizon" viewBox="0 0 400 40" preserveAspectRatio="xMidYMax slice">{horizon.out}</svg>
    </div>
  )
})

// ── Weather on the scene (v0.20.2) ─────────────────────────────────────────
// From the last weather reading (the same `detectWeather` the Moons sky uses):
// a few soft clouds in the sky band, and rain or snow falling across the stage.
// Fog is deliberately not drawn — a haze washes the scene out (Sekmeht, Moons
// v0.18.2) — and a storm is heavier rain, never a lightning flash (an
// epilepsy-safe concern). The particles are the ONE continuous animation the
// Tableau runs, so they are few, CSS-only, positioned by index (no randomness
// per render), dropped entirely under epilepsy-safe, and paused with the
// window like every other animation.
export const TableauWeather = memo(function TableauWeather({ fx, still }: { fx: { rain?: boolean; snow?: boolean; storm?: boolean; clouds?: boolean }; still?: boolean }) {
  const rain = fx.rain || fx.storm
  // Epilepsy-safe (still): no particles at all. Freezing them instead left a
  // row of rain stubs along the top edge (bug check); the clouds stay.
  const n = still ? 0 : fx.snow ? 22 : rain ? (fx.storm ? 34 : 24) : 0
  const drops: React.ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const x = (i * 37 + 11) % 100
    const delay = ((i * 53) % 100) / 100
    const dur = fx.snow ? 5 + ((i * 7) % 5) : 0.9 + ((i * 3) % 5) / 10
    drops.push(
      <span
        key={i}
        className={fx.snow ? 'tw-flake' : 'tw-drop'}
        style={{ left: `${x}%`, animationDelay: `${(-delay * dur).toFixed(2)}s`, animationDuration: `${dur.toFixed(2)}s` }}
      />,
    )
  }
  return (
    <div className="tableau-weather" aria-hidden="true">
      {(fx.clouds || rain || fx.snow) && (
        <svg className="tableau-clouds" viewBox="0 0 400 40" preserveAspectRatio="xMidYMin slice">
          {[30, 120, 230, 330].map((cx, i) => (
            <g key={cx} className="tw-cloud">
              <ellipse cx={cx} cy={10 + (i % 2) * 4} rx={34} ry={7} />
              <ellipse cx={cx + 18} cy={7 + (i % 2) * 4} rx={20} ry={6} />
            </g>
          ))}
        </svg>
      )}
      {drops}
    </div>
  )
})
