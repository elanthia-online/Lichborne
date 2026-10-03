// tableauBackdrop — the Living Tableau's sense of PLACE (v0.20.2).
//
// Every room gets a quiet backdrop built in LAYERS from what its description
// says (tableauScene.ts reads it — this file only draws):
//   sky     a band tinted by the time of day, from the server clock (no Lich
//           needed); stars at night
//   far     what's on the horizon: peaks, hills, dunes, the sea, a distant town
//   mid     what stands in front of it: pines, trees, palms, rooftops, castle
//           walls, ruins, standing stones, a farm, gravestones, reeds
//   near    water and the way through: a waterfall, surf, a lake, a lava glow,
//           and a bridge when there is one
//   ground  under the figures: a faint road, river, furrows or floorboards,
//           over a tint for the kind of ground
// Indoors swaps the horizon for a wall (a hall, temple, shop or home) and a
// cave for a ceiling of stalactites.
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
import type { SceneSpec, Enclosure } from './tableauScene'

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
      for (let x = 0; x <= 400; x += 25 + p.r() * 30) d += ` L${n1(x)},${n1(4 + p.r() * 20)} L${n1(x + 14)},${n1(22 + p.r() * 10)}`
      p.path(FAR, d + ' L400,40 Z')
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
    case 'trees':
      for (let x = -6; x < 406; x += 12 + r() * 16) {
        const h = 12 + r() * 16, w = 6 + r() * 6
        p.rect(MID, x - 0.8, 40 - h * 0.5, 1.6, h * 0.5)
        p.circle(MID, x, 40 - h * 0.7, w)
        if (r() < 0.6) p.circle(MID, x + w * 0.7, 40 - h * 0.55, w * 0.75)
      }
      break
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
    case 'buildings':
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

// ── ground (under the figures) ─────────────────────────────────────────────
// A 400×100 box, stretched to the floor of the stage; everything converges on
// a vanishing point at the middle of the horizon.
function drawGround(p: Painter, s: SceneSpec): void {
  const { r } = p
  if (s.enclosure === 'indoor') {
    for (let x = -400; x <= 800; x += 80) p.path('tb-line tb-line--faint', `M200,0 L${x},100`)
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
  else if (scene.enclosure === 'cave') drawCave(horizon, scene)
  else {
    if (sky === 'night') for (let i = 0; i < 18; i++) horizon.circle('tb-star', horizon.r() * 400, horizon.r() * 18, 0.35 + horizon.r() * 0.45)
    drawFar(horizon, scene)
    drawMid(horizon, scene)
    drawNear(horizon, scene)
  }
  const ground = painter(seed ^ 0x5bd1e995)
  drawGround(ground, scene)
  return (
    <div className={`tableau-backdrop tableau-backdrop--${scene.enclosure} tableau-ground--${scene.ground} tableau-sky--${sky}`} aria-hidden="true">
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
