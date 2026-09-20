// Weather & Moons (Experience #2, v0.15.0, Beta — DESIGN §34.9). Elanthia's
// sky as a living dial: the three moons arc across the heavens positioned by
// their REMAINING time (moonwatch.lic's orbital constants give each moon's
// up/down duration, so remaining minutes → arc progress), with rise/set
// countdown chips and a day/night backdrop from natively-captured sunrise/
// sunset prose. Weather is the planned next layer.
//
// Data honesty: everything here is as-of the last moonwatch report (crowd-
// sourced via the script's shared Firebase) — countdowns tick down locally
// from `reportedAt`, and the footer shows data age so a stale report never
// masquerades as live truth (§32.4 text-equivalent spirit).
import { memo, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { ExperienceProps } from '../../experiences'
import { MOON_UP_MINUTES, MOON_DOWN_MINUTES, exactSunPhase, detectWeather, moonPhase, moonRemainingMinutes, type MoonPhase, type SunPhase, type CalendarInfo, type WeatherFx } from '../../experiences'

// Season → a little emoji for the date readout (Sekmeht). Colored splashes in an
// otherwise-monochrome strip, one per season.
function seasonIcon(season: string): string {
  const s = season.toLowerCase()
  if (s.includes('winter')) return '❄️'
  if (s.includes('spring')) return '🌱'
  if (s.includes('summer')) return '🌻'
  if (s.includes('fall') || s.includes('autumn')) return '🍂'
  return ''
}

// ── Weather-effect particle layouts (fixed + deterministic, like the star field — no
// Math.random, so renders are reproducible). Snow/rain scatter across the width
// via an index hash; clouds are a hand-placed few. Motion lives in CSS keyframes
// (no React re-render), gated by the ⚙ "Weather effects" layer + epilepsy-safe. */
const SNOW = Array.from({ length: 26 }, (_, i) => ({
  x: ((i * 37 + 11) % 100) / 100,
  r: 0.9 + (i % 3) * 0.35,
  dur: 5 + (i % 5),
  delay: -(i * 0.4),
  sway: (i % 2 ? 1 : -1) * (5 + (i % 3) * 4),
}))
const RAIN = Array.from({ length: 34 }, (_, i) => ({
  x: ((i * 41 + 7) % 100) / 100,
  len: 7 + (i % 3) * 4,
  dur: 0.75 + (i % 4) * 0.15,
  delay: -(i * 0.11),
}))
// Enough bodies for a FULL sky. There used to be four, which is fine for "a few
// scattered clouds" but was all an overcast sky got too — Sekmeht: "it's
// 'completely overcast' but there's only occasional fluffs floating by". The
// count is now sliced by the parsed cover, so light skies still draw the first
// few and only a heavy sky uses the rest. (Overcast ALSO gets a veil — see
// MoonsClouds; a solid sky is a sheet, not more puffs.)
const CLOUDS = [
  { y: 30, s: 1.0,  dur: 64,  delay: 0 },
  { y: 55, s: 0.68, dur: 90,  delay: -34 },
  { y: 20, s: 0.52, dur: 108, delay: -70 },
  { y: 44, s: 0.84, dur: 76,  delay: -18 },
  { y: 12, s: 0.9,  dur: 82,  delay: -52 },
  { y: 64, s: 1.15, dur: 70,  delay: -8 },
  { y: 38, s: 0.6,  dur: 96,  delay: -61 },
  { y: 26, s: 1.05, dur: 58,  delay: -25 },
  { y: 50, s: 0.74, dur: 88,  delay: -44 },
  { y: 8,  s: 0.66, dur: 102, delay: -13 },
]
// Fireflies (F68) — summer dusk/night dots that drift near the ground. Fixed,
// deterministic positions (x-fraction of W, y in viewBox units), each with its
// own float duration/delay so they blink out of sync. No Math.random.
const FIREFLIES = Array.from({ length: 9 }, (_, i) => ({
  x: ((i * 53 + 17) % 100) / 100,
  y: 120 + ((i * 29) % 55),
  dur: 3.5 + (i % 4) * 0.9,
  delay: -(i * 0.7),
  drift: (i % 2 ? 1 : -1) * (4 + (i % 3) * 3),
}))
// Autumn falling leaves (Phase 2) — deterministic, fluttering down over the
// landscape. Gated on anim + ⚙ Seasonal touches + the autumn season. No Math.random.
const LEAVES = Array.from({ length: 11 }, (_, i) => ({
  x: ((i * 47 + 13) % 100) / 100,
  dur: 4 + (i % 4),
  delay: -(i * 0.8),
  sway: (i % 2 ? 1 : -1) * (10 + (i % 3) * 8),
  c: ['#c56a26', '#b23a22', '#d19a2f'][i % 3],
  r: 1.4 + (i % 2) * 0.5,
}))
// F67 shooting stars — RARE streaks on a CLEAR night (clouds hide them). `sx` is
// a fraction of W; `sy` + the `dx`/`dy` travel are viewBox px in the upper sky.
// Deterministic.
//
// RARITY (Sekmeht: "too many falling stars, too rapid"). These used to run
// 8–13s cycles, and because each fires once per cycle the COMBINED rate was
// ~one streak every 1.7 SECONDS — a meteor shower, not a rare event. The cycles
// are now 150–210s, giving roughly one every 30 seconds across all six.
//
// The six paths are KEPT rather than trimmed: variety of position and direction
// is what stops a repeat feeling like the same star looping, and with cycles
// this long you rarely see the same one twice in a sitting. Rarity comes from
// the duration, not from having fewer paths.
//
// Note the duration governs BOTH how often a streak appears AND how fast it
// crosses, so the CSS keyframe's visible window had to shrink to match (the
// travel is ~0.8% of the cycle now, ~1.2–1.7s). Lengthen these without touching
// that and you get slow-motion meteors.
const SHOOTS = [
  { sx: 0.08, sy: 12, dx: 120, dy: 50, dur: 150, delay: 0 },
  { sx: 0.62, sy: 8,  dx: 132, dy: 44, dur: 165, delay: -26 },
  { sx: 0.34, sy: 42, dx: 108, dy: 60, dur: 180, delay: -58 },
  { sx: 0.82, sy: 28, dx: -98, dy: 56, dur: 190, delay: -91 },   // streaks down-LEFT
  { sx: 0.20, sy: 66, dx: 116, dy: 36, dur: 200, delay: -124 },
  { sx: 0.50, sy: 52, dx: 96,  dy: 54, dur: 210, delay: -157 },
]
// Which season is dressing the landscape ('none' = unknown / seasonal touches off).
type LandSeason = 'none' | 'winter' | 'spring' | 'summer' | 'autumn'
// Crepuscular rays across the ground at sunrise/sunset — a fan of beams from the
// sun's horizon point to these x-fractions of W along the bottom edge (some past
// 0/1 so the fan reaches the far corners). Light beams at rise, shadow at set.
const RAY_FRACS = [-0.12, 0.06, 0.24, 0.42, 0.6, 0.78, 0.96, 1.14]
// (Aurora removed — it read as squares of moving colour; Sekmeht.)

// Soft drifting clouds — behind the bodies. Hoisted to module scope (pitfall #4:
// a component defined in render remounts every render, killing the CSS animation).
// Wind blows them across faster.
function MoonsClouds({ W, heavy, wind, cover, deckFill }: { W: number; heavy?: boolean; wind?: boolean; cover?: number; deckFill: string }) {
  // COUNT follows the reported cover (Sekmeht), so "a few scattered clouds" and
  // "completely overcast" no longer draw the same cloudbank. `cover` is 0..1
  // from the weather prose's degree words; the old heavy/not-heavy split is the
  // fallback when nothing graded was parsed.
  //
  // At least one cloud whenever there are clouds at all — a "cloudy" sky that
  // renders an empty heaven contradicts the strip's own text right beside it.
  const n = cover == null
    ? (heavy ? CLOUDS.length : 3)
    : Math.max(1, Math.round(CLOUDS.length * cover))
  const clouds = CLOUDS.slice(0, Math.min(CLOUDS.length, n))
  const speed = wind ? 0.5 : 1
  // A CLOUDIER SKY IS MORE CLOUD, NOT A WASH (Sekmeht: "for very cloudy... it
  // should just be more clouds in the sky"). Beyond raising the COUNT above,
  // cover swells each body so they crowd and overlap, which is how a sky
  // thickens without any all-over layer being drawn.
  const bulk = cover == null ? 1 : 1 + 0.25 * Math.max(0, cover - 0.4)
  // The DECK is reserved for wording that genuinely means a CLOSED sky —
  // "overcast" (0.92) and "completely covered" (1.0). "Very cloudy" (0.85)
  // deliberately gets none: a translucent sheet over the whole sky reads as FOG,
  // a different condition the prose may not have reported at all. Even here it
  // is a gradient that's solid overhead and gone by the horizon (the inverse of
  // a haze), with the drifting bodies riding on top for texture.
  const deck = cover != null && cover >= 0.9 ? (cover - 0.9) / 0.1 : 0
  return (
    <g className="moons-clouds" aria-hidden="true">
      {deck > 0 && <rect x={0} y={0} width={W} height="100%" fill={deckFill} opacity={deck} />}
      {clouds.map((c, i) => (
        <g key={i} transform={`translate(0 ${c.y})`}>
          <g className="moons-cloud" style={{ ['--cw' as string]: `${W}px`, animationDuration: `${c.dur * speed}s`, animationDelay: `${c.delay}s` } as CSSProperties}>
            <g transform={`scale(${c.s * bulk})`}>
              <ellipse cx={0} cy={0} rx={30} ry={12} />
              <ellipse cx={-20} cy={4} rx={18} ry={10} />
              <ellipse cx={22} cy={4} rx={20} ry={10} />
              <ellipse cx={2} cy={-7} rx={17} ry={10} />
            </g>
          </g>
        </g>
      ))}
    </g>
  )
}

// Falling precipitation + storm flash — in FRONT of the bodies, fading out at
// the horizon. Wind blows snow sideways (bigger sway) and slants the rain; a
// storm adds an occasional lightning flash over the whole sky.
//
// NO FOG LAYER (Sekmeht, v0.18.2: "let's avoid the fog effect in general").
// A translucent haze over the scene reads as a washed-out render rather than as
// weather — it dulls the sky gradient, the moons and the landscape all at once,
// and there is no way to make it strong enough to be legible as fog without it
// looking like a bug. `WeatherFx.fog` is still PARSED and still carries its
// meaning (it suppresses shooting stars and floors the cloud cover); it just
// has no layer of its own. Don't re-add one without a fresh ask.
function MoonsPrecip({ W, wx, horizonY }: { W: number; wx: WeatherFx; horizonY: number }) {
  const fast = (base: number) => (wx.heavy ? base * 0.68 : base)
  const wind = !!wx.wind
  return (
    <g aria-hidden="true">
      {wx.storm && <rect x={0} y={0} width={W} height={horizonY} className="moons-lightning" />}
      {wx.snow && (
        <g className="moons-snow">
          {/* Flake count follows the parsed precipitation density, so a flurry
              and a blizzard differ. Falls back to the heavy/light split. */}
          {SNOW.slice(0, wx.precip == null
            ? (wx.heavy ? SNOW.length : 16)
            : Math.max(6, Math.round(SNOW.length * wx.precip))).map((f, i) => (
            <circle key={i} className="moons-snowflake" cx={f.x * W} cy={0} r={f.r}
              style={{ animationDuration: `${fast(f.dur)}s`, animationDelay: `${f.delay}s`, ['--sway' as string]: `${(wind ? f.sway * 2.4 : f.sway)}px`, ['--fall' as string]: `${horizonY}px` } as CSSProperties} />
          ))}
        </g>
      )}
      {wx.rain && (
        <g className="moons-rain">
          {/* Same for rain: a drizzle draws far fewer drops than a downpour. */}
          {RAIN.slice(0, wx.precip == null
            ? (wx.heavy ? RAIN.length : 18)
            : Math.max(8, Math.round(RAIN.length * wx.precip))).map((d, i) => (
            <line key={i} className="moons-raindrop" x1={d.x * W} y1={0} x2={d.x * W + (wind ? 6 : 0)} y2={d.len}
              style={{ animationDuration: `${fast(d.dur)}s`, animationDelay: `${d.delay}s`, ['--windx' as string]: `${wind ? 26 : 0}px`, ['--fall' as string]: `${horizonY}px` } as CSSProperties} />
          ))}
        </g>
      )}
    </g>
  )
}

// Lerp between two #rrggbb hexes → a plain hex (avoids the color-mix-as-SVG-
// attribute gotcha; output goes straight into `fill=`). t is clamped 0..1.
function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t)
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * k)
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * k)
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * k)
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

// Phase 1 landscape (Sekmeht — nature, no buildings) — a persistent scene of
// TREES, a STREAM and a LAKE, ALWAYS drawn (data-free) so the ground reads as a
// real place in daylight. PERSPECTIVE: an element's size scales with how far DOWN
// the ground it sits — small near the horizon (a distant forest edge), large
// toward the bottom (near foreground trees) — and distant pieces fade toward a
// pale haze (atmospheric perspective). Everything is LIGHTER by day and DARKER at
// night; the water reflects the sky (a day→night gradient), and the summer
// fireflies already drift over it. `night` comes from the sun's elevation, so
// day/night works with NO TIME/WEATHER check. Seasonal dressing (snow, autumn
// leaves, spring melt, iced-over lake) is Phase 2, layered ON TOP of this base.
// Module-level, no hooks (pitfall #4); deterministic geometry positioned by
// W-fraction so it fills any panel width (B204). Colours are the Principle #4
// realistic/lore exception (like the map's baked tiles).
// Per-season foliage palette (day colours; `col` lerps them to a dark night tone
// and hazes distant pieces). `edge` is the outline that defines a canopy against a
// similar-value ground (the daytime-contrast fix); pines stay evergreen and only
// gain snow caps in winter.
const SEASON_CFG: Record<LandSeason, {
  canopy: [string, string, string]; canopyNight: string; edge: string; pine: string; pineEdge: string
}> = {
  none:   { canopy: ['#4a7a3c', '#3f6a34', '#568742'], canopyNight: '#101a13', edge: '#24401b', pine: '#2f5e34', pineEdge: '#163a20' },
  spring: { canopy: ['#66a544', '#7ab853', '#8ec763'], canopyNight: '#12241a', edge: '#2f6a2a', pine: '#3a6b3c', pineEdge: '#1e4423' },
  summer: { canopy: ['#357e30', '#2c6b28', '#438f3a'], canopyNight: '#0e1a10', edge: '#173f16', pine: '#265c2a', pineEdge: '#123817' },
  autumn: { canopy: ['#c56a26', '#a83a20', '#d19a2f'], canopyNight: '#1c130b', edge: '#5a2a10', pine: '#4a5a30', pineEdge: '#293516' },
  winter: { canopy: ['#7a8078', '#6c7268', '#868c80'], canopyNight: '#1a1e1b', edge: '#3c433b', pine: '#3a5540', pineEdge: '#1f3a28' },
}
// Spring blossom dot offsets (× canopy radius, from the canopy centre).
const BLOSSOM: Array<[number, number]> = [[-0.45, -0.05], [0.35, 0.15], [0.0, -0.55], [0.5, -0.25], [-0.2, 0.35]]

function MoonsLandscape({ W, horizonY, groundBot, night, season, sun, reflect, gref }: {
  W: number; horizonY: number; groundBot: number; night: number; season: LandSeason
  sun: { x: number; up: number } | null; reflect: Array<{ x: number; color: string; strong: boolean }>
  gref: (n: string) => string
}) {
  const span = groundBot - horizonY
  // depth: 0 at the horizon (far) → 1 at the bottom (near).
  const depth = (y: number) => clamp01((y - horizonY) / span)
  // perspective scale: 0.5 far → ~1.45 near.
  const persp = (y: number) => 0.5 + 0.95 * depth(y)
  const HAZE = '#aab4c0'                                  // pale cool daytime haze
  // Object colour at a given depth: (1) the DAY colour hazed toward pale by
  // distance (far = more haze), then (2) lerped toward its NIGHT colour by `night`.
  const col = (day: string, nightC: string, y: number) =>
    mixHex(mixHex(day, HAZE, (1 - depth(y)) * 0.22), nightC, night)
  const glint = mixHex('#eaf5fb', '#3a4a5e', night)      // water highlight (day→night)
  const snow = mixHex('#f2f7fb', '#63707f', night)       // snow caps (white day → grey night)
  const blossom = mixHex('#f6c9d6', '#5a4550', night)    // spring blossoms
  const shadeOp = 0.26 * (1 - night * 0.5)                // shadow strength (fades at night)
  const cfg = SEASON_CFG[season]
  const P = (f: number) => W * f
  // Cast shadow for an object of half-width `objR` / height `objH` at (cx, baseY).
  // It radiates along the SAME fan as the crepuscular rays: from the sun's horizon
  // point (sun.x, horizonY) THROUGH the object base, so the direction is the radial
  // `(cx − sun.x, baseY − horizonY)`. That makes it point straight down (6 o'clock)
  // for an object under the sun, angle to ~4–5 o'clock toward the far side, and —
  // because baseY − horizonY grows with depth — near-horizon objects cast flatter
  // shadows while foreground ones cast steeper ones (the depth cue). Length grows as
  // the sun sinks; a rotated ellipse renders the angle. Without sun: a soft blob.
  const shadow = (cx: number, baseY: number, objR: number, objH: number) => {
    if (!sun) return <ellipse cx={cx} cy={baseY} rx={objR * 0.8} ry={objR * 0.18} fill="#0e100b" opacity={shadeOp * 0.7} />
    const vx = cx - sun.x, vy = baseY - horizonY                 // radial from the sun's horizon point
    const d = Math.hypot(vx, vy) || 1, ux = vx / d, uy = vy / d
    const L = objH * (0.5 + (1 - sun.up) * 2.8)                  // long when the sun is low
    const mx = cx + ux * L * 0.5, my = baseY + uy * L * 0.5
    const deg = Math.atan2(uy, ux) * 180 / Math.PI
    return <ellipse cx={mx} cy={my} rx={L * 0.5 + objR * 0.3} ry={objR * 0.26} fill="#0e100b"
      opacity={shadeOp * (0.55 + sun.up * 0.45)} transform={`rotate(${deg} ${mx} ${my})`} />
  }
  // A round (deciduous) tree: a contact shadow, trunk, three canopy blobs with an
  // OUTLINE for daytime contrast, then seasonal caps/blossoms. ×persp.
  const roundTree = (id: string, cx: number, baseY: number, uSize: number) => {
    const s = persp(baseY), r = uSize * s, th = r * 1.7, tw = Math.max(1.5, r * 0.26)
    const fy = baseY - th
    const edge = col(cfg.edge, '#0a0f0a', baseY), ew = Math.max(0.4, r * 0.05)
    const blobs = [
      [cx - r * 0.5, fy + r * 0.15, r * 0.72, cfg.canopy[0]],
      [cx + r * 0.5, fy + r * 0.15, r * 0.68, cfg.canopy[1]],
      [cx, fy - r * 0.4, r * 0.82, cfg.canopy[2]],
    ] as const
    return (
      <g key={id}>
        {shadow(cx, baseY, r, th)}
        <rect x={cx - tw / 2} y={fy} width={tw} height={th + r * 0.3} fill={col('#4a3a2a', '#100e14', baseY)} />
        {blobs.map(([bx, by, br, day], i) =>
          <circle key={i} cx={bx} cy={by} r={br} fill={col(day, cfg.canopyNight, baseY)} stroke={edge} strokeWidth={ew} />)}
        {season === 'winter' && blobs.map(([bx, by, br], i) =>
          <circle key={`s${i}`} cx={bx - br * 0.12} cy={by - br * 0.42} r={br * 0.62} fill={snow} opacity={0.92} />)}
        {season === 'spring' && BLOSSOM.map(([ox, oy], i) =>
          <circle key={`bl${i}`} cx={cx + ox * r} cy={fy + oy * r} r={Math.max(0.5, r * 0.13)} fill={blossom} />)}
      </g>
    )
  }
  // A pine (conifer): contact shadow, trunk, three outlined tiers, + winter caps. ×persp.
  const pineTree = (id: string, cx: number, baseY: number, uSize: number) => {
    const s = persp(baseY), r = uSize * s, h = r * 2.4, tw = Math.max(1.4, r * 0.2)
    const g = col(cfg.pine, '#0f1a13', baseY), edge = col(cfg.pineEdge, '#080f0a', baseY), ew = Math.max(0.35, r * 0.045)
    const base = baseY - r * 0.35
    const tri = (cy: number, hw: number, hh: number) => `${cx - hw},${cy} ${cx},${cy - hh} ${cx + hw},${cy}`
    const tiers = [[base, r * 0.85, h * 0.5], [base - h * 0.3, r * 0.68, h * 0.45], [base - h * 0.58, r * 0.48, h * 0.4]] as const
    return (
      <g key={id}>
        {shadow(cx, baseY, r, h)}
        <rect x={cx - tw / 2} y={baseY - r * 0.5} width={tw} height={r * 0.5} fill={col('#443626', '#0f0d13', baseY)} />
        {tiers.map(([cy, hw, hh], i) =>
          <polygon key={i} points={tri(cy, hw, hh)} fill={g} stroke={edge} strokeWidth={ew} strokeLinejoin="round" />)}
        {season === 'winter' && tiers.map(([cy, , hh], i) =>
          <polygon key={`s${i}`} points={tri(cy - hh * 0.42, tiers[i][1] * 0.52, hh * 0.42)} fill={snow} opacity={0.9} />)}
      </g>
    )
  }
  const iced = season === 'winter'
  const lakeFill = iced ? mixHex('#d3e2ea', '#28323e', night) : gref('water')   // frozen → ice
  const streamFill = iced ? mixHex('#c6dae4', '#243040', night) : gref('water')
  const lakeRim = mixHex('#2a3f4e', '#0a1018', night)    // dark rim → defines the pool vs the ground
  const lakeCx = P(0.3), lakeCy = horizonY + 47, lakeRx = W * 0.17, lakeRy = 10

  // ── The river (Binu) ──────────────────────────────────────────────────────
  // Was a constant-width stroked Bézier starting 10px BELOW the horizon, which
  // read as a flat pipe floating in the field. Three things were asked for and
  // all three need the same change of approach:
  //   • PERSPECTIVE — it must narrow with distance. SVG cannot vary
  //     stroke-width along a path, so a stroked line can never taper; the river
  //     is now a filled RIBBON built from sampled left/right banks.
  //   • TOUCHES THE HORIZON — starts exactly at horizonY, so it reads as
  //     flowing down out of the mountains rather than beginning in mid-field.
  //   • CURVIER — a meander, damped toward the horizon so it converges to a
  //     point on the skyline instead of wobbling along it.
  // The descent uses pow(t, 1.6) so distance foreshortens (far stretches bunch
  // up near the horizon and open out toward the viewer) — the same idea as the
  // landscape's `persp`, applied along the river instead of across the ground.
  const RIVER_STEPS = 30
  const riverPts = Array.from({ length: RIVER_STEPS + 1 }, (_, i) => {
    const t = i / RIVER_STEPS
    const y = horizonY + (lakeCy - horizonY) * Math.pow(t, 1.6)
    // Meander damped by `t`: zero swing at the source, widening as it nears.
    const bend = Math.sin(t * Math.PI * 2.1) * 0.05 * t
    const x = P(0.52 + (0.30 - 0.52) * t + bend)
    // Half-width: a hairline at the horizon opening to the lake mouth. Also
    // pow'd, so most of the widening happens in the near half where the eye
    // reads it as approach rather than as a wedge.
    const w = 0.3 + 3.0 * Math.pow(t, 1.5)
    return { x, y, w }
  })
  // Banks down one side and back up the other — offset horizontally rather than
  // perpendicular to the tangent, which is a fine approximation while the river
  // runs mostly vertically and keeps this readable.
  const ribbon = (scale: number) =>
    'M ' + riverPts.map(p => `${p.x - p.w * scale},${p.y}`).join(' L ')
    + ' L ' + [...riverPts].reverse().map(p => `${p.x + p.w * scale},${p.y}`).join(' L ') + ' Z'
  const riverD = ribbon(1)
  const riverGlintD = ribbon(0.34)   // a narrower inner ribbon, tapering with it
  // Reflection columns: for each body over the water, a shimmering vertical streak
  // (+ two ripple dashes), clipped to the lake's height at that x (so it stays on
  // the pool without a clipPath). Empty when iced/none.
  const reflections = reflect.map((rb, i) => {
    const t = (rb.x - lakeCx) / lakeRx
    if (Math.abs(t) > 0.9) return null                    // body not above the pool
    const hH = lakeRy * Math.sqrt(Math.max(0, 1 - t * t)) * 0.9
    const x = rb.x, w = rb.strong ? 2.4 : 1.4
    return (
      <g key={`rf${i}`}>
        <line x1={x} y1={lakeCy - hH} x2={x} y2={lakeCy + hH} stroke={rb.color} strokeWidth={w} strokeLinecap="round" opacity={rb.strong ? 0.5 : 0.42} />
        <line x1={x - w} y1={lakeCy - hH * 0.35} x2={x + w} y2={lakeCy - hH * 0.35} stroke={rb.color} strokeWidth={0.8} strokeLinecap="round" opacity={0.5} />
        <line x1={x - w * 0.8} y1={lakeCy + hH * 0.4} x2={x + w * 0.8} y2={lakeCy + hH * 0.4} stroke={rb.color} strokeWidth={0.7} strokeLinecap="round" opacity={0.38} />
      </g>
    )
  })
  // Distant forest edge along the horizon (small + hazy), mixed pine/round.
  const FAR: Array<[number, 'r' | 'p']> = [[0.08, 'p'], [0.19, 'r'], [0.3, 'p'], [0.63, 'r'], [0.74, 'p'], [0.87, 'r']]
  // Drawn BACK → FRONT: distant forest, then the stream flowing into the lake,
  // then the lake (covers the stream mouth), then mid + large foreground trees.
  return (
    <g aria-hidden="true">
      {FAR.map(([f, t], i) => t === 'p' ? pineTree(`far${i}`, P(f), horizonY + 5, 6) : roundTree(`far${i}`, P(f), horizonY + 5, 6))}
      {/* River winding down out of the hills into the lake — a FILLED ribbon so
          it can taper with distance (see riverPts), meeting the horizon at a
          point and opening to the lake mouth. Reflective / iced fill + a
          narrower inner glint that tapers with it. */}
      <path d={riverD} fill={streamFill} opacity={0.92} />
      <path d={riverGlintD} fill={glint} opacity={0.4} />
      {/* lake — a grounding shadow, then reflective water (or winter ice) with a dark
          rim, the sun/moon reflections, and a couple of surface glints. */}
      <ellipse cx={lakeCx} cy={lakeCy + 2} rx={lakeRx * 1.06} ry={lakeRy + 1} fill="#0d1016" opacity={0.28 * (1 - night * 0.5)} />
      <ellipse cx={lakeCx} cy={lakeCy} rx={lakeRx} ry={lakeRy} fill={lakeFill} stroke={lakeRim} strokeWidth={0.9} />
      {reflections}
      <line x1={lakeCx - lakeRx * 0.4} y1={lakeCy - 3} x2={lakeCx + lakeRx * 0.05} y2={lakeCy - 3} stroke={glint} strokeWidth={0.9} strokeLinecap="round" opacity={0.5} />
      <line x1={lakeCx - lakeRx * 0.1} y1={lakeCy + 4} x2={lakeCx + lakeRx * 0.45} y2={lakeCy + 4} stroke={glint} strokeWidth={0.8} strokeLinecap="round" opacity={0.32} />
      {/* mid trees */}
      {pineTree('mid1', P(0.68), horizonY + 33, 8)}
      {roundTree('mid2', P(0.79), horizonY + 31, 7)}
      {/* large foreground trees (low on the ground) */}
      {roundTree('fr1', P(0.89), horizonY + 58, 10)}
      {pineTree('fr2', P(0.1), horizonY + 56, 10)}
    </g>
  )
}
import { dayOfMonth } from '../../../shared/elanthianTime'

// Compact Elanthian-calendar line (month · year · season · time-of-day) — only
// the fields we have. Fuller detail (day-of-year, year-name, month number) goes
// in the row's tooltip so the visible line stays short.
function calendarLine(cal: CalendarInfo): string {
  const parts: string[] = []
  // Day-of-MONTH from the TIME command's day-of-YEAR (months are a uniform 40
  // days — src/shared/elanthianTime.ts) → a natural date, e.g. day 43 in Ka'len
  // → "4 Ka'len the Sea Drake".
  if (cal.dayOfYear != null && cal.monthName) parts.push(`${dayOfMonth(cal.dayOfYear)} ${cal.monthName}`)
  else if (cal.monthName) parts.push(cal.monthName)
  else if (cal.dayOfYear != null) parts.push(`Day ${cal.dayOfYear}`)
  if (cal.year != null) parts.push(`${cal.year} A.V.`)
  if (cal.season) parts.push(`${seasonIcon(cal.season)} ${cal.season}`.trim())
  // time-of-day ("late evening") is NOT shown here — it's appended to the
  // on-sky Day/Night label instead (Sekmeht), e.g. "Night (late evening)".
  // Still surfaced in this row's tooltip via calendarTooltip.
  return parts.join(' · ') || 'unknown'
}
function calendarTooltip(cal: CalendarInfo): string {
  const bits: string[] = []
  if (cal.dayOfYear != null && cal.monthName) bits.push(`${dayOfMonth(cal.dayOfYear)} ${cal.monthName}${cal.monthNum ? ` (month ${cal.monthNum})` : ''}`)
  else if (cal.monthName) bits.push(`Month: ${cal.monthName}`)
  if (cal.dayOfYear != null && cal.year != null) bits.push(`Day ${cal.dayOfYear} of ${cal.year} A.V. — 0-indexed, as TIME reports`)
  if (cal.yearName) bits.push(`Year of the ${cal.yearName}`)
  if (cal.season) bits.push(`Season: ${cal.season}`)
  if (cal.timeOfDay) bits.push(`Time of day: ${cal.timeOfDay}`)
  return bits.join('\n')
}

// Time-of-day word for the on-sky label (v0.17.0) — derived
// from the SAME sun elevation the gradient uses, so the word always agrees with
// the backdrop. High/low sun → Day/Night; in the low-sun band, "climbing" (sun
// heading up) → Dawn, "sinking" → Dusk. Sun data we already have; no new feed.
function skyPhaseLabel(sp: SunPhase): string {
  const elev = (sp.day ? 1 : -1) * Math.sin(Math.PI * sp.progress)
  if (elev > 0.35) return 'Day'
  if (elev < -0.35) return 'Night'
  const climbing = sp.day ? sp.progress < 0.5 : sp.progress >= 0.5
  return climbing ? 'Dawn' : 'Dusk'
}

// DR lore colors (fixed hues, like game data — not theme vars), styled from
// the in-game moon descriptions (Sekmeht, 2026-07-08): KATAMBA is the largest,
// "black as soot and encircled by a faint, miasmatic atmosphere" — near-black
// disc, charcoal rim so it reads on the night sky, a wide faint haze halo.
// YAVASH is "impossible to miss day or night", wrapped in "a thick and
// rapidly moving atmosphere that glows with ruby and crimson hues" — vivid
// blood-red disc with a strong crimson glow halo. XIBAR is the smallest and
// closest, "lacks any sort of atmosphere", "silvery-blue glow of its vast and
// pristine ice fields" — crisp silvery-blue disc with a silver-blue ice glow.
// Each moon now carries a soft primary-colour SKY glow (Sekmeht) — the `glow`
// hue — rendered as a small radial bloom behind the disc.
// Fills reference the <defs> radial gradients below (lit from upper-left).
interface MoonStyle {
  // The base disc fill is the per-instance gradient `${uid}-moon-<key>` (built at
  // render — see `gref`), not a shared constant, so multiple character tabs don't
  // collide on one `#lb-moon-*` id.
  // The disc OUTLINE reads as the body's ATMOSPHERE (Sekmeht) — distinct from
  // `glow`, which is the halo it throws into the sky. So the outline is driven
  // by what each moon's own lore text says it has, and the three genuinely
  // differ (see MOON_LORE, which is the spec here):
  //   Yavash  — "a THICK, rapidly moving atmosphere glows with ruby and
  //             crimson hues" → the most pronounced rim of the three.
  //   Katamba — "encircled by a FAINT, miasmatic atmosphere" → a thin violet
  //             veil, not the neutral grey it used to wear.
  //   Xibar   — "STRIPPED OF ANY ATMOSPHERE" → atmo 0, NO rim at all. A pale
  //             edge on an airless body is exactly the halo it cannot have; its
  //             brightness comes from ice FIELDS, i.e. the surface, so the limb
  //             should simply be where the disc ends.
  rim: string
  /** Atmosphere thickness, 0..1 — scales the outline's width and opacity. 0
   *  removes it outright. `rim` stays a colour regardless, because the rise/set
   *  transition rings still key off it. */
  atmo: number
  r: number
  label: string
  glow?: string          // soft SKY halo colour; ABSENT = this moon sheds no light (Katamba)
                         // (Sekmeht/Elanthipedia lore): Xibar a
                         // silvery-blue glow through Elanthia's atmosphere, Yavash a
                         // vivid ruby/crimson, and Katamba EMITS SHADOW — a BLACK halo
                         // that darkens its surroundings by day (invisible at night;
                         // day-scaled at the paint site, not the gradient).
  glowStrength?: number  // multiplier on the glow opacity (default 1; >1 = more intense)
  glowR?: number         // halo radius as a multiple of the disc r (default 1.85)
  // F69 sun-lit tones: lit hemisphere → mid → shadowed far side (darker than the
  // static gradient's base). The dynamic per-moon gradient (built at render from
  // the sun direction) interpolates these.
  tones: { lit: string; mid: string; shadow: string }
}
// Lore colours mirror the Elanthipedia descriptions + the in-game illustrations
// (Sekmeht): Katamba soot-black with faint grey mottle and a thin atmospheric rim,
// emitting shadow; Yavash a pure ruby/crimson cloud deck (NO orange); Xibar vivid
// saturated ice-blue in myriad shades, with a silvery-blue atmospheric sky glow.
const MOON_STYLE: Record<MoonKey, MoonStyle> = {
  // `atmo` follows each moon's own lore (see the MoonStyle note + MOON_LORE).
  // Katamba's rim also moved off neutral grey onto a violet-grey: "miasmatic"
  // is the word its lore uses, and its sky halo is already dark violet — a
  // colourless ring read as a generic outline rather than that atmosphere.
  // Katamba has NO `glow` — deliberately, and that absence is what drives it
  // (see the glow gradient + disc layers, which both key off the field rather
  // than the name). It is black as soot and sheds nothing; it carried a
  // miasmatic violet haze until 2026-09-06, when Sekmeht had it removed.
  katamba: { rim: '#6b5f7a', atmo: 0.4, r: 13, label: 'Katamba', tones: { lit: '#332d3a', mid: '#161219', shadow: '#050409' } },
  yavash:  { rim: '#ff8496', atmo: 1,   r: 9,  label: 'Yavash',  glow: '#e01430', glowStrength: 1.25, glowR: 2.0, tones: { lit: '#f0384e', mid: '#a01828', shadow: '#3a0810' } },
  xibar:   { rim: '#88bce6', atmo: 0,   r: 7,  label: 'Xibar',   glow: '#dbe9f5', tones: { lit: '#5db4f7', mid: '#2472db', shadow: '#123f8f' } },
}

type MoonKey = 'katamba' | 'yavash' | 'xibar'
const MOON_KEYS: MoonKey[] = ['katamba', 'yavash', 'xibar']
// Visual depth, furthest→closest (Sekmeht): the Sun is the furthest layer (drawn
// first, behind every moon), then Yavash, then Katamba, then Xibar (closest). The
// disc passes paint moons back→front in this order so an overlap stacks correctly.
// Chip/text/def passes keep MOON_KEYS order (order-neutral there).
const MOON_DEPTH: Record<MoonKey, number> = { yavash: 0, katamba: 1, xibar: 2 }

// F64a — the LIT region of a phased disc, in local coords centred on (0,0) with
// the lit limb toward +x. Caller rotates the group so +x points at the sun.
//
// `c` = cos(phase angle) = 1 − 2·illum: +1 new (nothing lit), 0 quarter (half),
// −1 full (all lit). The terminator is an ellipse of semi-axis r·|c| sharing the
// disc's poles, and the SWEEP FLAG is what turns a crescent into a gibbous:
//   c > 0  → the terminator bulges the same way as the limb → thin crescent
//   c = 0  → rx 0, a straight line → exactly half
//   c < 0  → it bulges the other way → gibbous, reaching the full disc at −1
// Both degenerate ends behave: at c=+1 the two arcs coincide and enclose no
// area (new), at c=−1 they form the whole circle (full).
//
// Used through a MASK rather than painted directly — see the render — so the
// shadow is the complement and F69's lit gradient keeps painting the disc
// underneath. Deriving a separate "shadow path" by mirroring the flags does NOT
// work (it degenerates to zero area at new, exactly when the shadow should be
// the whole disc); one path plus a mask is correct at every phase.
// F64a — the at-a-glance pill's dot, drawn as the moon's ACTUAL phase.
//
// The pill already spent this space on a plain colour dot, so the phase costs
// nothing to show and stops being a tooltip-only fact (UX standard #8: the UI
// should explain itself without a hover). Module-level, not defined inside the
// render (standard #4).
//
// No <mask> here on purpose: at ~7px a mask is invisible precision, and mask
// ids would need per-instance namespacing (pitfall #95). Painting the lit path
// OVER a dark disc gives the same read with no ids at all.
//
// Orientation is the conventional one — waxing lit on the right, waning on the
// left — rather than the scene's sun-relative angle. At this size a tilted
// terminator reads as a rendering artefact, and the convention is what people
// recognise from a calendar.
function PhaseDot({ phase, color, size }: { phase: MoonPhase; color: string; size: number }) {
  const r = size / 2
  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} aria-hidden
         style={{ display: 'block', borderRadius: '50%' }}>
      <circle cx={0} cy={0} r={r} fill="#0b0d14" />
      <path d={litPath(r, 1 - 2 * phase.illum)} fill={color}
            transform={phase.waxing ? undefined : 'scale(-1,1)'} />
      <circle cx={0} cy={0} r={r - 0.3} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={0.6} />
    </svg>
  )
}

export function litPath(r: number, c: number): string {
  const rx = Math.abs(r * c)
  // SWEEP DIRECTION — the whole shape turns on this, and it was INVERTED in the
  // first cut (Sekmeht spotted it: Xibar rendered as a lens/wedge, never a
  // crescent). SVG's y axis points DOWN, so sweep=1 is clockwise on screen:
  // from the BOTTOM, clockwise heads LEFT and counter-clockwise heads RIGHT.
  //   c > 0 (crescent, under half lit): the terminator must bulge INTO the lit
  //         side (rightward) to cut the right semicircle down to a sliver → 0
  //   c < 0 (gibbous, over half lit):   it bulges away (leftward), adding to
  //         the right semicircle → 1
  // Check it against the ends, which is how the inversion was caught:
  //   c = +1 (new)  → rx = r, the return arc retraces the right limb → NO area
  //   c =  0 (quarter) → rx = 0, a straight terminator → exactly half
  //   c = −1 (full) → rx = r, bulges left → the whole circle
  // Getting these backwards renders a new moon as full and a full moon as
  // nothing, with every phase between it wrong — and it is invisible to the
  // phase MATH tests, so tmp-moon-harness asserts these three paths directly.
  const sweep = c > 0 ? 0 : 1
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${sweep} 0 ${-r} Z`
}

// Sky geometry (SVG viewBox units). HEIGHT is fixed; WIDTH is derived per
// render from the drawing area's REAL aspect ratio (measured below), so the
// viewBox always matches the window shape — no letterboxing, which means a
// horizontal resize genuinely WIDENS the horizon (text neither moves nor
// rescales) and a vertical resize scales the whole drawing uniformly. The
// first cut used a fixed 400×220 box: single-axis resizes letterboxed and
// walked the content around, and the below-horizon chips (y ≈ 231) were drawn
// OUTSIDE the 220-high box and clipped — every element must fit inside H, and
// the horizon leaves ~19px margin below the deepest chip for exactly that
// reason (deepest = mid-underground: HORIZON_Y + UNDER_DEPTH + disc + chip).
const H = 250
const HORIZON_Y = 180
const ARC_RY = 145
const UNDER_DEPTH = 28        // the underground arc's deepest dip below the horizon
const BASE_W = 400            // pre-measure fallback + the min/max clamp anchor
const ARC_MARGIN = 36         // horizon padding each side of the arc's ends
// Star positions as (x-fraction of W, y) so they spread with a wide sky.
// Star field (deterministic, no Math.random). Each star has a brightness `b` and a
// `reveal` threshold: BRIGHT stars appear early in the evening, FAINTER ones only as
// the sky darkens toward true midnight (a "light pollution clearing" effect, driven
// by `nightDepth` which peaks at midnight). `fx` is a fraction of W; `y` is a viewBox
// coord in the sky band above the horizon.
const STARS = Array.from({ length: 70 }, (_, i) => {
  const b = 0.28 + ((i * 29) % 72) / 100                              // brightness 0.28..1.0
  return {
    fx: ((i * 61 + 13) % 100) / 100,
    y: 6 + ((i * 43 + 7) % 160),                                      // sky band (above the horizon)
    b,
    // faint → reveals nearer midnight. Clamp inlined (clamp01 is declared later —
    // this array is built at module load, so calling it here would hit the TDZ).
    reveal: Math.max(0, Math.min(1, (1 - b) * 1.05 + ((i * 17) % 14) / 100 - 0.04)),
    r: b > 0.82 ? 1.4 : b > 0.6 ? 1.0 : 0.7,
    dur: 2.4 + ((i * 13) % 32) / 10,                                  // twinkle 2.4..5.6s
    delay: -((i * 7) % 55) / 10,
  }
})

// Position along the sky arc for an UP moon: progress 0 (just risen) → 1
// (about to set), on a half-ellipse above the horizon. Orientation as DRAWN:
// bodies RISE at the RIGHT end (x = cx+rx) and SET at the LEFT (x = cx−rx),
// so the full cycle runs counterclockwise (right → over the top → left →
// back under the earth → right). underPos MUST mirror these endpoints — the
// first cut ran the underground leg the wrong way, so a freshly-set moon sat
// at the rise point (the "Katamba looks ready to rise" bug).
function skyPos(progress: number, cx: number, rx: number): { x: number; y: number } {
  const theta = Math.PI * (1 - progress)
  // progress 0: theta=π, −cos(π)=+1 → x = cx+rx (RIGHT). progress 1: −cos(0)=−1 → cx−rx (LEFT).
  return { x: cx + rx * Math.cos(theta) * -1, y: HORIZON_Y - ARC_RY * Math.sin(theta) }
}

// Position along the UNDERGROUND return arc for a DOWN moon: progress 0 (just
// set — the LEFT end, where the sky arc finishes) → 1 (about to rise — the
// RIGHT end, where the sky arc starts), on a shallow dip below the horizon.
// The two arcs share endpoints, so a moon's whole cycle is one continuous
// counterclockwise loop and a rising moon surfaces exactly where it waited.
function underPos(progress: number, cx: number, rx: number): { x: number; y: number } {
  const theta = Math.PI * (1 - progress) // progress 0: cos(π)=−1 → cx−rx (LEFT); progress 1: cos(0)=+1 → cx+rx (RIGHT)
  return { x: cx + rx * Math.cos(theta), y: HORIZON_Y + UNDER_DEPTH * Math.sin(theta) }
}

// Continuous remaining minutes (a FLOAT — see moonRemainingMinutes). Geometry
// uses it raw so the moon glides; anything TEXTUAL goes through remLabel.
const remainingMinutes = moonRemainingMinutes

/** Whole minutes for DISPLAY. Rounds to nearest (closest to the truth), but
 *  never renders "0m" while the event is still ahead — 0 is reserved for
 *  "now", which every caller already branches on via `rem <= 0`. */
const remLabel = (r: number) => (r <= 0 ? 0 : Math.max(1, Math.round(r)))

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// Lore cards (hover <title> on each body — polish #8: the UI explains
// itself). Condensed from the in-game moon descriptions Sekmeht supplied;
// the practical "rises/sets at ~H:MM" line is appended at render time.
const MOON_LORE: Record<MoonKey, string> = {
  katamba: 'The largest of the three moons, black as soot — burnt, the historians say, by the breath of the World Dragon — and encircled by a faint, miasmatic atmosphere. Katamba dominates the tides of Elanthia.',
  yavash:  'The most distant moon, impossible to miss day or night: a thick, rapidly moving atmosphere glows with ruby and crimson hues. Moon Mage spells tap its violence as celestial fire.',
  xibar:   'The closest and smallest moon, stripped of any atmosphere. Myriad shades of blue, dominated by the silvery-blue glow of its vast and pristine ice fields.',
}
const SUN_LORE = 'The Elanthian Sun — its rising and setting mark the days of the provinces; each full circuit of the heavens takes six hours of mortal time.'

// F64 — each moon's share of "moonlight", 0..1 of its own maximum.
//
// THIS IS A LORE QUANTITY, NOT A PHOTOMETRIC ONE — the distinction matters and
// the code has to hold both at once.
//
// Katamba counted ZERO here at first, on the reasoning that a black moon emits
// nothing. That is right about PHOTONS and wrong about DragonRealms (Sekmeht):
// Moon Mages draw on Katamba as moonlight regardless of it being black, so for
// the Moon Mage hook this figure exists to serve, it counts — and it counts
// heavily, being the largest of the three and the one its own lore says
// "dominates the tides of Elanthia".
//
// What did NOT change is anything VISIBLE. Katamba drives no glow, no disc
// brightening and no lake reflection, because all three depict light you can
// see and it genuinely sheds none — as of 2026-09-06 it has no halo at all
// (Sekmeht had the violet haze removed). So: dark to the eye, bright to a Moon
// Mage. Don't "reconcile" the two by making one follow the other; they answer
// different questions.
//
// Weights are RELATIVE presentation values, not mined game constants (the
// standing rule against inventing DR math) — they sum to 1 so all three, full
// and overhead, reads as a maximally bright night.
const MOONLIGHT_WEIGHT: Record<MoonKey, number> = { katamba: 0.4, yavash: 0.32, xibar: 0.28 }

/** Combined moonlight right now, 0..1. Each up moon contributes its lit
 *  fraction × how high it rides (a moon at the horizon sheds less than one
 *  overhead) × its own output. Needs phase, so it only became computable with
 *  F64a. Returns null when nothing is known yet rather than a confident 0. */
function moonlightNow(
  ups: { k: MoonKey; progress: number }[],
  phases: Partial<Record<MoonKey, MoonPhase>>,
): number | null {
  if (!ups.length) return 0
  let total = 0, known = 0
  for (const u of ups) {
    const p = phases[u.k]
    if (!p) continue
    known++
    // progress 0→1 across the visible arc, so sin(π·progress) peaks at the top.
    total += p.illum * Math.sin(Math.PI * u.progress) * MOONLIGHT_WEIGHT[u.k]
  }
  return known ? Math.min(1, total) : null
}

function fmtClock(msEpoch: number): string {
  return new Date(msEpoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Horizon silhouette — a deterministic ridgeline of peaks rising from the
// horizon (fixed height table, no randomness — pitfall-#70-style: same W in,
// same path out, so re-renders never reshape the mountains). Two ridges
// (far/near) give depth; drawn BEFORE the bodies so a rising moon emerges in
// front of the peaks with its chip/rings unobscured.
const RIDGE_HEIGHTS = [7, 12, 5, 14, 8, 4, 11, 6, 13, 9, 5, 10]
function ridgePath(w: number, scale: number, offset: number): string {
  const seg = 34
  let d = `M 0 ${HORIZON_Y}`
  let x = 0
  let i = offset
  while (x < w) {
    const nx = Math.min(w, x + seg)
    const h = RIDGE_HEIGHTS[i % RIDGE_HEIGHTS.length] * scale
    d += ` L ${x + seg / 2} ${HORIZON_Y - h} L ${nx} ${HORIZON_Y - (i % 3 === 0 ? 2 * scale : 0)}`
    x = nx
    i++
  }
  return d + ` L ${w} ${HORIZON_Y} Z`
}

// Slow expanding (rising) / contracting (setting) horizon rings — rendered
// while a body sits near a transition. Gated on epilepsy-safe upstream.
function TransitionRings({ x, y, r, color, kind }: { x: number; y: number; r: number; color: string; kind: 'rise' | 'set' }) {
  const cls = kind === 'rise' ? 'moons-ring-rise' : 'moons-ring-set'
  return (
    <>
      <circle className={cls} cx={x} cy={y} r={r} stroke={color} fill="none" style={{ ['--ring-r' as string]: `${r}px`, ['--ring-R' as string]: `${r * 2.4}px` }} />
      <circle className={cls} cx={x} cy={y} r={r} stroke={color} fill="none" style={{ ['--ring-r' as string]: `${r}px`, ['--ring-R' as string]: `${r * 2.4}px`, animationDelay: '1.6s' }} />
    </>
  )
}

function MoonsExperience({ moons, hidden, settings, weather, calendar, serverClockOffsetMs = 0, onSyncSky }: ExperienceProps) {
  // UNIQUE gradient-id prefix per instance (React useId, sanitized to id-safe
  // chars). CRITICAL: every character tab mounts its own Moons SVG, and SVG
  // `url(#id)` resolves to the FIRST matching id in the whole document — so shared
  // ids let a hidden tab's (differently-stated / userSpaceOnUse) gradients hijack
  // the visible tab's fills, stripping the visuals (char1 → moonwatch on char2 →
  // back to char1 = blank). A per-instance prefix keeps each SVG's gradients its own.
  const uid = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const gref = (name: string) => `url(#${uid}-${name})`
  // Tick every 2s while data is present so the countdowns + positions drift in
  // real time between moonwatch reports. (Said "30s" until v0.19.9 — stale
  // since v0.17.0 dropped it to 2s. Anything whose cost was justified against
  // the old period needs re-reading: the sky layers' CSS transition was exactly
  // that, and had become a permanent animation.)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!moons) return
    // Advance the scene often (2s) so the bodies' positions AND everything derived
    // from the sun's position — shadows, crepuscular rays, lake reflections — all
    // move together in sub-pixel steps (smooth, in sync), instead of a jerky 30s
    // redraw. The whole render is cheap and only runs while the experience is open.
    const t = setInterval(() => setTick(x => x + 1), 2_000)
    return () => clearInterval(t)
  }, [moons])

  // Measure the drawing area so the viewBox width can match its aspect (see
  // the geometry note above). 0×0 measurements are IGNORED (pitfall #83 — a
  // hidden character tab is display:none and must not blow away the last real
  // size); width quantized to 8 viewBox units to avoid re-render churn while
  // dragging a resize. Keyed on `!!moons` because the sky div only mounts once
  // data exists (the empty state renders a different tree).
  const skyRef = useRef<HTMLDivElement | null>(null)
  const [dynW, setDynW] = useState<number | null>(null)
  useEffect(() => {
    const el = skyRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r || r.width <= 0 || r.height <= 0) return
      // Width ceiling is a DEGENERATE-MEASUREMENT guard, not a layout feature.
      // It was 1100, which a merely-maximized wide panel exceeds (aspect ≥ 4.4
      // × H=250) — the clamp then letterboxed the SVG under `xMidYMax meet`,
      // so the ground/ridges sat centered with side gaps while the HTML sky
      // layers kept filling the container (B204, Sekmeht's screenshot). 5000
      // covers any real monitor edge-to-edge (a 5120px-wide strip at 250px
      // tall is aspect ~20 → w = 5120… clamped only past that) while still
      // bounding the ridge path against a transient sliver measurement
      // (e.g. 2000×2px mid-drag → aspect 1000 → w would be 250,000).
      const w = Math.max(300, Math.min(5000, H * (r.width / r.height)))
      setDynW(Math.round(w / 8) * 8)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!moons])

  if (!moons) {
    return (
      <div className="moons-empty">
        <div className="moons-empty-title">Waiting for moon data…</div>
        <div className="moons-empty-body">
          This sky is fed by the community <b>moonwatch</b> script. On any Lich character, run
          {' '}<code>;moonwatch window</code> — its Moons feed (crowd-sourced by players across Elanthia)
          starts this display automatically. Sunrise and sunset are read from the game itself as they happen.
        </div>
      </div>
    )
  }

  const now = Date.now()
  // F64a — lunar phase. Computed on DR's clock, not ours (pitfall #87 / B192):
  // this is absolute-time math with no runtime feedback, so a skewed client
  // clock would silently render the wrong moon forever.
  //
  // Deliberately independent of `moons`: phase is a pure function of the time,
  // so it works for a DIRECT-SGE player who has no moonwatch stream at all and
  // therefore no rise/set data. Don't gate it on moon state arriving.
  const serverNow = now + serverClockOffsetMs
  const phases: Partial<Record<MoonKey, MoonPhase>> = {}
  for (const k of MOON_KEYS) {
    const p = moonPhase(k, serverNow)
    if (p) phases[k] = p
  }
  // Per-layer ⚙ toggles — each hides EXACTLY its own layer (Sekmeht: the old
  // combined "Sun & sky" conflated hiding the sun with flattening the sky).
  const showSun = !hidden?.sun
  const showSky = !hidden?.sky
  // Countdown + name labels default OFF (the orrery pill carries that info now) —
  // shown ONLY when explicitly enabled (hidden.x === false). Matches `optionShown`
  // for a `defaultHidden: true` option in the registry.
  const showCountdowns = hidden?.countdowns === false
  const showNames = hidden?.names === false
  const showHorizon = !hidden?.horizon
  const showLandscape = !hidden?.landscape   // Phase 1 nature scene: trees, stream, lake (always-on, day/night)
  const showEffects = !hidden?.effects
  const showWeather = !hidden?.weather
  const showCalendar = !hidden?.calendar
  const showWeatherFx = !hidden?.weatherfx
  // Newer per-layer toggles (Sekmeht — everything toggleable).
  const showSunGlow = !hidden?.sunglow      // sun-centric sky glow + twilight afterglow
  const showRays = !hidden?.rays            // crepuscular sunrise/sunset ground rays
  const showMoonGlow = !hidden?.moonglow    // soft primary-colour glow around each moon
  const showSunlight = !hidden?.sunlight    // F69 sun-lit moon terminator + specular
  const showPhase    = !hidden?.phase       // F64a real crescent/gibbous disc shape
  const showPill = !hidden?.pill            // the frosted orrery pill above the footer
  const showSeasonal = !hidden?.seasonal    // fireflies / winter snow
  // Detected weather conditions (snow/rain/clouds/fog/…) from the prose, driving
  // the sky effects. Null when indoors / not yet checked. Motion is gated below
  // by the ⚙ layer + epilepsy-safe; `clear` sets no flags so nothing renders.
  // A PLAIN const (NOT useMemo): this runs AFTER the `if (!moons) return` early
  // return above, so a hook here would change the hook count when moon data
  // arrives → "rendered more hooks than last render" crash. detectWeather is
  // cheap (a few regexes), so recomputing per render is fine.
  const wx = weather && !weather.indoor && weather.text ? detectWeather(weather.text) : null
  const weatherFxOn = showWeatherFx && !settings.epilepsySafe && !!wx
  // Live sun phase from the observed rise/set anchors (the 360-minute cycle is
  // real-time periodic, so day/night AUTO-ADVANCES — no stale binary flip).
  // Computed regardless of the sun toggle: the SKY needs it even with the
  // sun disc hidden.
  // The sun is COMPUTED, not observed (v0.18.4). It used to be derived from
  // whichever sunrise/sunset prose we happened to have witnessed, with an even
  // 180/180 day assumed until both had been seen — but Elanthia's daylight
  // swings 120→240 rois across the year, so mid-spring ran ~26 min short and
  // the sun read minutes ahead of the community site. `exactSunPhase` is
  // moonwatch's own model, ported verbatim, so we agree with the script and
  // the site by construction — and it needs neither Lich nor a transition to
  // witness, so it works direct-SGE from the first frame.
  const sunPhase = exactSunPhase(serverNow)
  // Realistic continuous sky (Sekmeht): blend weights from the sun's
  // ELEVATION — sin(π·progress), positive by day, negative by night — so the
  // backdrop brightens toward noon, glows warm near the horizon (sunrise AND
  // sunset), deepens toward midnight, and pre-lightens before dawn. The
  // weights drive stacked gradient layers (night base → day → zenith →
  // twilight, CSS opacity-crossfaded); the discrete `sky` class remains for
  // TEXT color + the unknown-state dusk fallback (a text color can't blend).
  // The sun's GEOMETRIC elevation — always available (does NOT depend on the
  // "Living sky" toggle). Sun glow / crepuscular rays / moon-lighting use THIS, so
  // they stay on their own ⚙ toggles even with Living sky off (bug: they all
  // shared `elev`, so unchecking Living sky silently killed them and left night
  // moons lit with the daylight fallback).
  const sunElev = sunPhase ? (sunPhase.day ? 1 : -1) * Math.sin(Math.PI * sunPhase.progress) : null
  // `elev` is the sky-GRADIENT weight source — it follows the Living sky toggle.
  const elev = showSky ? sunElev : null
  // QUANTISED to 2dp, and that is load-bearing rather than tidiness (v0.19.9).
  // These three drive the `opacity` of four FULL-PANEL `.moons-layer` divs that
  // carry a CSS `transition`. The scene ticks every 2s, and an unrounded weight
  // differs on every single tick — so each tick re-armed the transition before
  // the previous one could finish, leaving four panel-sized layers in a
  // permanent, never-completing opacity transition, day and night, regardless
  // of weather or any ⚙ layer. Rounding means the value only changes when it
  // changes VISIBLY (1% of opacity), which for a sun that crosses the sky over
  // real hours is rarely — so the transition fires, completes, and stops.
  // 1% steps are imperceptible against a gradient backdrop.
  const q = (v: number) => Math.round(v * 100) / 100
  const wDay   = elev == null ? 0 : q(clamp01(elev / 0.5))             // full blue by ~30° up
  const wZen   = elev == null ? 0 : q(clamp01((elev - 0.6) / 0.4))     // extra brightness at high noon
  const wTwi   = elev == null ? 0 : q(clamp01(1 - Math.abs(elev) / 0.35)) // warm band hugging the horizon
  const wNight = elev == null ? 0 : clamp01(-elev / 0.35)           // stars + depth past twilight
  // Night DEPTH — 0 at sunset/sunrise, peaking at 1 at true midnight (sunElev −1).
  // Unlike wNight (which saturates just past dusk), this keeps deepening, so fainter
  // stars can reveal the closer it gets to midnight (the light-pollution effect).
  const nightDepth = sunElev == null ? 0 : clamp01(-sunElev)
  const sky = elev == null ? 'dusk' : elev > 0.18 ? 'day' : elev < -0.18 ? 'night' : 'dusk'
  // Continuous TEXT contrast + a HALO (Sekmeht: near sunset the class still said
  // "day" → dark grey text on an already-dark sky; and the bright DAY sky washed
  // out the dark text). Text lightness lerps AGAINST the sky brightness — dark ink
  // while the sky is bright (wDay ≥ 0.75), fully light once it dims (wDay ≤ 0.45),
  // a steep ramp between so it never lingers mid-grey over the mid-toned twilight
  // band. The HALO is the OPPOSITE lightness (a light outline behind dark day-text,
  // a dark one behind light night-text) so scene text stays legible over ANY sky.
  // Inline color/`--moons-halo` override the class defaults; elev unknown = no halo.
  const sceneInk = elev == null ? null : (() => {
    const t = clamp01((0.75 - wDay) / 0.3)
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t)
    return {
      color: `rgb(${lerp(29, 232)}, ${lerp(48, 228)}, ${lerp(72, 240)})`,
      // Halo = the OPPOSITE EXTREME of the ink, FLIPPED at the midpoint (NOT a
      // lerp): a lerped halo went grey exactly where the text went grey (the
      // narrow mid-transition sun angle), so it stopped separating the text. The
      // flip keeps it fully light-behind-dark / dark-behind-light at every angle
      // (day/night are already at the extremes, so they're unchanged). Used by
      // the SVG scene-text stroke AND the strip text-shadow.
      halo:  t >= 0.5 ? 'rgba(5, 7, 15, 0.82)' : 'rgba(250, 250, 255, 0.82)',
      // Header/footer STRIP background — the OPPOSITE EXTREME of the ink, FLIPPED at
      // the midpoint (NOT a lerp) so it always contrasts the strip text even mid-
      // transition (a lerped band went the SAME mid-grey as the ink there → zero
      // contrast; a text-shadow fixed that but a blurred shadow QUIVERS as the text
      // re-rasterizes during the color transition — Sekmeht). A solid fill can't
      // quiver. The flip is a one-time day↔night strip swap (natural), not a shake.
      band:  t >= 0.5 ? 'rgba(8, 11, 20, 0.66)' : 'rgba(250, 250, 255, 0.64)',
    }
  })()

  const up = MOON_KEYS.filter(k => moons[k]?.up)
  const down = MOON_KEYS.filter(k => moons[k] && !moons[k]!.up)

  // Derived per-render geometry — W tracks the measured aspect, so the
  // viewBox always fills the drawing area edge to edge (no letterboxing).
  const W = dynW ?? BASE_W
  const CX = W / 2
  const ARC_RX = CX - ARC_MARGIN

  // Rising/setting effects (Sekmeht): gentle horizon rings while a body is
  // within ~7% of a transition. Suppressed by the ⚙ layer toggle AND
  // (independently) by the epilepsy-safe accessibility setting.
  const anim = showEffects && !settings.epilepsySafe
  const NEAR = 0.07

  // Footer "next event": the soonest MOON transition (the sun's own chip
  // already carries its countdown, so a sun-next would just duplicate it).
  const nextMoon = MOON_KEYS
    .filter(k => moons[k])
    .map(k => ({ k, rem: remainingMinutes(moons[k]!, moons.reportedAt, now), up: moons[k]!.up }))
    .sort((a, b) => a.rem - b.rem)[0]

  // Countdown-chip collision avoidance (the Tableau bubble-spacing idea in
  // miniature): chips claim space in draw order (sun → up moons → down
  // moons); a colliding SKY chip steps down a line (open sky below), an
  // UNDERGROUND chip flips above its disc (names sit beside, so above is
  // free — and stepping down would leave the viewBox). Width is a per-char
  // ESTIMATE — generous spacing, not measurement (the B184 bubble lesson).
  // The list is rebuilt every render, so placement is pure + deterministic.
  const placedChips: Array<{ x: number; y: number; w: number }> = []
  const placeChip = (x: number, yStart: number, text: string, kind: 'sky' | 'under', bodyY: number, bodyR: number): number => {
    const w = text.length * 5.4
    let y = yStart
    for (let tries = 0; tries < 4; tries++) {
      const hit = placedChips.some(c => Math.abs(c.x - x) < (c.w + w) / 2 + 8 && Math.abs(c.y - y) < 12)
      if (!hit) break
      y = kind === 'under' && y === yStart ? bodyY - bodyR - 8 : y + 13
    }
    placedChips.push({ x, y, w })
    return y
  }

  // Body positions computed ONCE per render, shared by the DISC passes
  // (drawn behind the ground/ridges) and the TEXT pass (always on top) —
  // see the draw-order note in the SVG below.
  const SUN_R = 13
  const upBodies = up.map(k => {
    const rem = remainingMinutes(moons[k]!, moons.reportedAt, now)
    const progress = Math.min(1, Math.max(0, 1 - rem / MOON_UP_MINUTES[k]))
    return { k, s: MOON_STYLE[k], rem, progress, ...skyPos(progress, CX, ARC_RX) }
  })
  // A SET body must not crawl the slow underground arc (spanning the whole
  // down-time → it looks "stuck" as a half-disc at the horizon for ~40 min).
  // Instead it SINKS below in a fixed short window right after set, EMERGES in a
  // fixed window just before rise, and is HIDDEN (null) the rest of the time —
  // the orrery pill carries the rise countdown while it's gone. downMin = the
  // body's full down duration; remMin = minutes until it rises. Sets at the LEFT
  // horizon end, rises at the RIGHT.
  const SET_MIN = 4
  const setX = CX - ARC_RX
  const riseX = CX + ARC_RX
  const crestPos = (downMin: number, remMin: number, r: number): { x: number; y: number; kind: 'set' | 'rise' } | null => {
    const belowY = (frac: number) => HORIZON_Y + clamp01(frac) * (r + 8)   // horizon (0) → fully below (1)
    const tSince = downMin - remMin                                        // minutes since it set
    // `tSince >= 0` guards moonwatch drift (a reported rise countdown > the body's
    // whole down duration → negative tSince), which would otherwise pin a visible
    // half-disc at the horizon instead of hiding it (the "stuck" bug this avoids).
    if (tSince >= 0 && tSince < SET_MIN) return { x: setX, y: belowY(tSince / SET_MIN), kind: 'set' }
    if (remMin < SET_MIN) return { x: riseX, y: belowY(remMin / SET_MIN), kind: 'rise' }
    return null   // buried deep → hidden
  }
  const downBodies = down.map(k => {
    const rem = remainingMinutes(moons[k]!, moons.reportedAt, now)
    return { k, s: MOON_STYLE[k], rem, crest: crestPos(MOON_DOWN_MINUTES[k], rem, MOON_STYLE[k].r) }
  })
  const sunBody = showSun && sunPhase?.day ? skyPos(sunPhase.progress, CX, ARC_RX) : null
  const sunCrest = showSun && sunPhase && !sunPhase.day ? crestPos(sunPhase.phaseMin, sunPhase.toNextMin, SUN_R) : null

  // TRANSIT SILHOUETTE (Sekmeht, v0.18.3). A moon near NEW is drawn as almost
  // nothing — correct against open sky, where a real unlit limb genuinely is
  // invisible — but it means a moon crossing the SUN vanishes at exactly the
  // moment it should be most obvious: "I saw the sun setting then realised
  // Xibar was there too, but Xibar was invisible."
  //
  // Against a bright source an unlit moon reads as a DARK DISC, so the closer a
  // moon is to the sun the more it earns a shadowed rim. Two factors multiply,
  // and both matter: PROXIMITY (nothing at all when they are far apart, so the
  // rest of the sky is unchanged) and how UNLIT it is (a gibbous moon already
  // reads on its own; a new one needs the help). The pairing means the effect
  // only ever appears in the situation that motivated it.
  //
  // Squared falloff so it eases in rather than switching on at a threshold.
  const sunOnScreen = sunBody && sunPhase?.day ? { x: sunBody.x, y: sunBody.y } : sunCrest ? { x: sunCrest.x, y: sunCrest.y } : null
  const transitNearness = (mx: number, my: number, mr: number): number => {
    if (!sunOnScreen) return 0
    const d = Math.hypot(mx - sunOnScreen.x, my - sunOnScreen.y)
    // Reach a little past touching, so the silhouette fades in as they close
    // rather than popping the instant the discs overlap.
    const reach = SUN_R + mr + 26
    const near = clamp01(1 - d / reach)
    return near * near
  }

  // ── Bucket B (F67–F70) derivations ──────────────────────────────────────
  // Season comes from the Elanthian calendar (undefined until TIME is checked);
  // ambient life is also gated on a clear-ish sky and the ⚙ effects layer +
  // epilepsy-safe (via `anim`, defined above).
  const season = calendar?.season?.toLowerCase() ?? ''
  const isWinter = season.includes('winter')
  const isSummer = season.includes('summer')
  const isSpring = season.includes('spring')
  const isFall = season.includes('autumn') || season.includes('fall')
  // Which season dresses the landscape — only when the season is known AND the ⚙
  // "Seasonal touches" layer is on; otherwise the neutral base scene.
  const landSeason: LandSeason = !showSeasonal ? 'none'
    : isWinter ? 'winter' : isSpring ? 'spring' : isSummer ? 'summer' : isFall ? 'autumn' : 'none'
  const isNight = wNight > 0.35
  const isDusk = sky === 'dusk'
  const clearSky = !wx || (!!wx.clear && !wx.clouds && !wx.fog && !wx.storm)
  // Opaque horizon-ground colours (season + weather) — the background that
  // OCCLUDES set bodies. Winter = snow (greyer when wet); summer = green earth;
  // otherwise a NEUTRAL daytime landscape (a muted slate-green — NOT black, so the
  // scene reads nicely in daylight BEFORE TIME/WEATHER is checked, and for
  // spring/autumn; the night shade below darkens it after dark). Rain/storm damps
  // each toward a wetter, darker tone. (Before this, the default was near-black
  // and looked like a void under a bright blue sky — Sekmeht.)
  const wet = !!wx && (!!wx.rain || !!wx.storm)
  const snowLand = isWinter && showSeasonal   // snowy ground + ridge caps (⚙ Seasonal touches)
  // Day/night shade over the LANDSCAPE (Sekmeht): the ground is lit + normal by
  // day and falls into shadow at night — a dark overlay whose opacity tracks the
  // sun's elevation (0 by day, deepening through dusk, deepest at night, lifting
  // through dawn). Complements the crepuscular sunset shadow rays. Follows the
  // sun's geometric elevation (sunElev), so it's independent of the ⚙ toggles.
  const groundShade = sunElev == null ? 0 : clamp01((0.25 - sunElev) / 0.55) * 0.62
  // Landscape night factor (0 by day → 1 well after sundown) — drives the nature
  // scene's day/night colouring + the water reflection gradient. From sunElev, so
  // it works with no TIME check (like groundShade above).
  const landNight = sunElev == null ? 0 : clamp01(-sunElev / 0.3)
  const ground: { top: string; bot: string } =
    snowLand ? (wet ? { top: '#93a0b2', bot: '#6b7688' } : { top: '#b7c3d3', bot: '#8996ab' })
    : isSummer ? (wet ? { top: '#2c3520', bot: '#1d2416' } : { top: '#3f4a2c', bot: '#2b331d' })
    : (wet ? { top: '#42423b', bot: '#2d2d28' } : { top: '#5a5a52', bot: '#42423b' })   // neutral (less green) so foliage/water read against it
  // F69 — the sun as a LIGHT SOURCE for the moons. Its arc position is used
  // regardless of the ⚙ sun-disc toggle (a hidden sun still lights the sky), and
  // its light COLOR + STRENGTH come from elevation: bright warm-white at noon,
  // golden near the horizon (golden hour), dim + cool underground at night.
  const sunLightPos = sunPhase
    ? (sunPhase.day ? skyPos(sunPhase.progress, CX, ARC_RX) : underPos(sunPhase.progress, CX, ARC_RX))
    : null
  const sunLight = ((): { color: string; strength: number } => {
    if (sunElev == null) return { color: '#fff4d8', strength: 0.55 }
    if (sunElev > 0.35) return { color: '#fff6e2', strength: 1 }
    if (sunElev > -0.05) {
      const g = clamp01((0.35 - sunElev) / 0.4)                 // 0 high → 1 at horizon
      return { color: `rgb(255, ${Math.round(246 - g * 74)}, ${Math.round(226 - g * 150)})`, strength: 1 - g * 0.22 }
    }
    return { color: '#9fb4d6', strength: 0.32 }                 // night: faint cool earthshine
  })()
  // Per-moon lit-gradient center (bbox 0..1) offset toward the sun, so each disc
  // reads as lit from the sun's on-screen direction. Also returns the unit vector
  // for the specular rim highlight. No sun → null (fall back to the flat fill).
  const litCenter = (mx: number, my: number) => {
    if (!sunLightPos) return null
    const dx = sunLightPos.x - mx, dy = sunLightPos.y - my
    const len = Math.hypot(dx, dy) || 1
    return { cx: clamp01(0.5 + (dx / len) * 0.42), cy: clamp01(0.5 + (dy / len) * 0.42), lx: dx / len, ly: dy / len }
  }
  const sunMix = (base: string) => `color-mix(in srgb, ${sunLight.color} ${Math.round(sunLight.strength * 48)}%, ${base})`
  // WHICH SIDE IS LIT — and the single answer everything reads.
  //
  // A PHASED moon no longer tilts to face the sun (Sekmeht, v0.18.2). The
  // terminator stays on the moon's own vertical axis and the phase simply
  // crosses it: lit on the RIGHT while waxing, on the LEFT while waning — the
  // orientation a calendar uses, and already what the pill's PhaseDot draws, so
  // the two surfaces now agree. A sun-tracking tilt is the truer thing for a
  // sphere, but on a flat stylised sky it reads as the moon being knocked
  // askew, and it made one phase look like different shapes at dusk and at
  // midnight.
  //
  // The mask's orientation, the lit gradient's centre and the specular rim all
  // consume THIS, so they cannot disagree with each other — a fixed terminator
  // with a sun-tracking highlight would put the bright spot on the dark side.
  //
  // Unphased (⚙ Phase off, or no phase data) the disc is full, so there is no
  // terminator to contradict and the sun-relative shading is kept. Null still
  // means "no sun" and still falls back to the flat fill — unchanged.
  const litAim = (k: MoonKey, lit: ReturnType<typeof litCenter>) => {
    if (!lit) return null
    const p = phases[k]
    if (!showPhase || !p) return lit
    const s = p.waxing ? 1 : -1
    return { cx: clamp01(0.5 + s * 0.42), cy: 0.5, lx: s, ly: 0 }
  }
  const upLit = upBodies.map(b => ({ b, lit: litAim(b.k, litCenter(b.x, b.y)), phase: phases[b.k] }))
  // F64 — combined moonlight, the Moon Mage hook. Only meaningful at night: by
  // day the sun drowns it, and reporting "strong moonlight" at noon would read
  // as a bug rather than a nicety.
  const moonlight = sunElev != null && sunElev < 0 ? moonlightNow(upBodies, phases) : null

  // F65 — CONJUNCTIONS: moons riding close together in the sky.
  //
  // Measured in SCREEN distance against the pair's own radii, not in arc
  // progress. Progress is normalised per-moon across arcs of different lengths
  // (177m vs 174m), so equal progress is not quite the same sky position — and
  // what a player means by "they're together" is what they can see. Scaling by
  // (rA+rB) also keeps the test fair between big Katamba and small Xibar.
  const conjunctions = upBodies.flatMap((a, i) =>
    upBodies.slice(i + 1)
      .map(b => ({ a, b, gap: Math.hypot(a.x - b.x, a.y - b.y) / (a.s.r + b.s.r) }))
      .filter(p => p.gap < 2.6))
  // All three mutually close reads as one event, not three pairs — a triple is
  // the rare thing worth naming.
  const tripleConjunction = conjunctions.length === 3
  // Landscape sun (drives DIRECTIONAL object shadows — like the crepuscular ground
  // rays, tree shadows fan away from the sun's screen position and lengthen as it
  // sinks). Only by day; null at dusk/night → soft ambient shadows instead.
  const landSun = sunLightPos && sunElev != null && sunElev > 0.02
    ? { x: sunLightPos.x, up: clamp01(sunElev) } : null
  // Lake reflections (Sekmeht): the sun (by day) + the LIT moons cast shimmering
  // columns on the water where they pass above it. Skipped entirely when the
  // lake is iced over (winter).
  //
  // "Which moons give light" is asked in FIVE places — the glow gradient, the
  // disc bloom, the earthshine wash, the toward-full brightening, and here — so
  // all five read the same `glow` FIELD rather than name-checking Katamba
  // (pitfall #127: paths answering one question must share the source, or they
  // drift the day one of them is edited). It happens to select the same moon
  // today; the point is that it cannot stop doing so.
  const lakeReflect: Array<{ x: number; color: string; strong: boolean }> =
    (showLandscape && landSeason !== 'winter')
      ? [
          ...(sunPhase?.day && sunLightPos ? [{ x: sunLightPos.x, color: '#ffe08a', strong: true }] : []),
          ...upBodies.filter(b => !!b.s.glow).map(b => ({
            x: b.x, color: b.k === 'yavash' ? '#ff5a6e' : '#7fc0ff', strong: false,
          })),
        ]
      : []

  // Sun-CENTRIC sky glow (Sekmeht): the day's brightness follows the SUN, not the
  // horizon. A broad warm-white bloom around the sun high in the day, tightening
  // and warming toward gold as the sun nears the horizon (so sunrise/sunset glow
  // tracks the sun through dawn/dusk), then fading out as it drops below — so
  // NIGHT STAYS NIGHT. Rendered as a userSpace radial centered on the sun.
  const sunGlow = (() => {
    if (sunElev == null || !sunLightPos || !showSunGlow) return null
    // TWILIGHT glow (Sekmeht): full by day and it PERSISTS below the horizon —
    // fading OUT through dusk after the sun sets, and fading IN through pre-dawn
    // before it rises — so the sky keeps "a tiny bit of light" until FORMAL night.
    // It's anchored at the sun's horizon crossing and CLAMPED to the horizon once
    // the sun is below (a horizon afterglow, not the sun dragged deep down). It
    // reaches 0 by sunElev = -TWILIGHT (formal night) → no deep-night leak. Uses
    // sunElev (not elev) so it's independent of the Living-sky toggle.
    const TWILIGHT = 0.16
    const vis = clamp01((sunElev + TWILIGHT) / (0.1 + TWILIGHT))
    if (vis <= 0) return null
    const g = clamp01((0.45 - sunElev) / 0.55)              // 0 high noon → ~1 near/below horizon (warmth)
    return {
      x: sunLightPos.x,
      y: Math.min(sunLightPos.y, HORIZON_Y),                // horizon afterglow when the sun is below
      color: `rgb(255, ${Math.round(245 - g * 72)}, ${Math.round(216 - g * 150)})`,
      opacity: Math.min(0.72, vis * (0.4 + g * 0.2)),
      radius: (0.62 - g * 0.16) * W,
    }
  })()

  // Crepuscular ground light/shadow (Sekmeht): when the sun is low, rays fan from
  // its horizon crossing point across the landscape — warm LIGHT beams that
  // illuminate at sunRISE, dark SHADOW rays at sunSET (rising = sun climbing).
  // Anchored at the sun's horizon x; fades out as the sun climbs past golden hour.
  const groundLight = (() => {
    if (sunElev == null || !sunLightPos || !sunPhase?.day || !showRays) return null
    const low = clamp01((0.34 - sunElev) / 0.34)   // 1 at the horizon → 0 by mid-morning
    if (low <= 0.03) return null
    return { x: Math.max(6, Math.min(W - 6, sunLightPos.x)), low, rising: sunPhase.progress < 0.5 }
  })()

  // At-a-glance orrery pill (Sekmeht): a frosted, theme-matched readout centered
  // above the footer — the Sun + three moons, each with the time to its NEXT
  // transition (SETS if currently up, RISES if down). Dot colours are saturated
  // lore hues chosen to read on the themed glass (the raw rims are too pale).
  const fmtDur = (m: number) => (m <= 0 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`)
  // ONE phase description, shared by the scene discs and the pill so the two can
  // never describe the same moon differently (the B234 lesson).
  //
  // Marked "(computed)" deliberately: rise/set times come from moonwatch's
  // observed feed, but phase has NOTHING to self-correct against — the script
  // says so itself, and only 4 of the 8 wordings are confirmed against the
  // game's `observe` verb. The sun already distinguishes observed from assumed;
  // phase gets the same honesty rather than being presented as fact.
  //
  // Phase buckets run ~28h, so the countdown is formatted in days+hours past a
  // day — "1d 4h" reads, "28h 0m" does not.
  const phaseLines = (k: MoonKey): string => {
    const p = phases[k]
    if (!p) return ''
    const mins = Math.round(p.secondsToNext / 60)
    const next = mins >= 1440
      ? `${Math.floor(mins / 1440)}d ${Math.round((mins % 1440) / 60)}h`
      : fmtDur(mins)
    // "Now:" / "Next:" LABEL the pair. Both lines were already here, but the
    // current phase was a bare lowercase name ("new · 2% lit") sitting above a
    // line that plainly announces itself ("waxing crescent in ~1d 4h"), so it
    // skimmed as preamble and the tooltip read as if it only told you what was
    // coming (Sekmeht: "add the current phase — it shows when the next one is").
    // The data never changed; it just wasn't saying which was which.
    return `\n\nNow: ${p.name} · ${Math.round(p.illum * 100)}% lit (computed)`
      + `\nNext: ${p.nextName} in ~${next}`
      // (A Katamba-specific "the black moon..." line used to hang off the end
      // here, explaining why a dark moon can read as "full" and still raise the
      // moonlight figure. Removed at Sekmeht's ask, v0.18.2 — the combined-
      // moonlight tooltip already makes that point, and repeating it on every
      // Katamba hover made the shortest tooltip the longest one.)
  }
  // The header's "moons" segment names only the NEXT body due to rise or set, so
  // its tooltip is where the other two get a voice — one line each, current phase
  // included. This segment carried NO tooltip at all, which made the header the
  // one moon surface you could hover and learn nothing from, even though the
  // scene discs and the pill cells both explain themselves.
  const moonsSegTip = MOON_KEYS.filter(k => moons[k]).map(k => {
    const m = moons[k]!
    const p = phases[k]
    const rem = remainingMinutes(m, moons.reportedAt, now)
    const when = rem <= 0
      ? (m.up ? 'setting now' : 'rising now')
      : `${m.up ? 'sets' : 'rises'} in ${fmtDur(remLabel(rem))}`
    return p
      ? `${MOON_STYLE[k].label} — ${p.name}, ${Math.round(p.illum * 100)}% lit · ${when}`
      : `${MOON_STYLE[k].label} — ${when}`
  }).join('\n')
  // Provenance, same as everywhere else phase is shown: rise/set is observed
  // through moonwatch, phase is computed here and has nothing to correct against.
  const moonsSegTitle = `Each moon, the phase it is in now, and its next rise or set.\n\n${moonsSegTip}\n\nRise and set come from moonwatch; phases are computed.`
  // Pill chips mirror the corrected lore colours (see MOON_STYLE): golden sun,
  // soot-dark Katamba (the shadow moon, which sheds no light and now throws no
  // halo either), ruby Yavash, vivid ice-blue Xibar.
  const PILL_DOT: Record<string, string> = { sun: '#f5b921', katamba: '#2b2733', yavash: '#e0203f', xibar: '#3f90ea' }
  const pillBodies: Array<{ key: string; label: string; up: boolean; min: number; assumed: boolean }> = [
    ...(sunPhase ? [{ key: 'sun', label: 'Sun', up: sunPhase.day, min: sunPhase.toNextMin, assumed: !!sunPhase.assumed }] : []),
    ...MOON_KEYS.filter(k => moons[k]).map(k => ({
      key: k, label: MOON_STYLE[k].label, up: !!moons[k]!.up,
      min: remLabel(remainingMinutes(moons[k]!, moons.reportedAt, now)), assumed: false,
    })),
  ]

  // Consolidated data-freshness (Sekmeht): no visible per-segment ages at all —
  // instead the ⟳ refresh button's TOOLTIP carries the "last data received"
  // stats, broken down by source (moonwatch = crowd feed; weather/date = your
  // session's silent pulls) so the data-honesty signal (§32.4 — stale must never
  // read as live) is one hover away without cluttering the strips with three
  // competing "just now"s. moons.reportedAt always exists here.
  // B412: clock TIMES, not "12s ago". A native tooltip can't update while it's
  // showing — Chromium hides it when its text changes — and this scene
  // re-renders every 2s, so a relative age made the tooltip blink for as long as
  // you hovered it (pitfall #145). The ⟳ turning amber still says when the data
  // is old. The date is added only for a reading from an earlier day.
  const clock = (ts: number) => {
    const d = new Date(ts)
    return d.toDateString() === new Date(now).toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const freshnessTitle = 'Last data received —\n' + [
    `Moonwatch (moons/sun): ${clock(moons.reportedAt)}`,
    weather ? `Weather: ${clock(weather.observedAt)}` : null,
    calendar ? `Date: ${clock(calendar.observedAt)}` : null,
  ].filter(Boolean).join('\n')
  // "Stale" = the game-pull data (weather + date — what ⟳ refreshes; the
  // moonwatch moons extrapolate live from orbital math, so THEIR age doesn't make
  // the panel look stale) is over 10 min old, or never fetched. When stale we
  // NUDGE — the ⟳ turns amber + gently pulses (epilepsy-safe → amber, no pulse) —
  // never a forced auto-refresh (Sekmeht: "I don't want to forcefully update").
  const STALE_MS = 10 * 60 * 1000
  const gameDataAt = Math.max(weather?.observedAt ?? 0, calendar?.observedAt ?? 0)
  const stale = !!onSyncSky && now - gameDataAt > STALE_MS
  const syncTitle =
    (stale ? '⚠ Weather/date is over 10 min old — click to refresh.\n\n' : '') +
    `Check the weather & date now — silent (sends TIME + WEATHER; nothing shows in the game window).\n\n${freshnessTitle}`
  const syncClass = `moons-foot-sync${stale ? ' moons-foot-sync--stale' : ''}${stale && !settings.epilepsySafe ? ' moons-foot-sync--pulse' : ''}`

  return (
    <div className={`moons-scene moons-scene--${sky}`} style={sceneInk ? ({ color: sceneInk.color, '--moons-halo': sceneInk.halo, '--moons-band': sceneInk.band } as CSSProperties) : undefined}>
      {/* Header strip — the "what's in the sky now" row (sky · moons · weather),
          a full-width band at the TOP mirroring the footer band at the bottom
          (Sekmeht). Normal-flow sibling above .moons-sky, so the moons/sun (which
          live in the sky) never overlap it. The ⟳ lives on the date footer (it
          syncs both); it only appears here when the date row is hidden. */}
      {(((showSky || showSun) && sunPhase) || nextMoon || showWeather) && (
        <div className="moons-header">
          <div className="moons-foot-row">
            {(showSky || showSun) && sunPhase && (
              <span className="moons-foot-seg">
                <span className="moons-foot-key">sky</span>
                <span className="moons-foot-v">
                  {showSky && (sunPhase.day ? '☀ day' : '☾ night')}
                  {showSky && showSun && ' · '}
                  {showSun && <>{sunPhase.day ? 'sun sets in ' : 'sun rises in '}{sunPhase.assumed ? '≈' : ''}{sunPhase.toNextMin}m</>}
                  {/* F64 — moonlight rides the SKY segment because that is what
                      it describes, and because appending to an existing segment
                      cannot re-flow the strip the way a new pill cell did.
                      Night only (the sun drowns it by day) and silent below a
                      faint threshold: a dark night should read as clean rather
                      than as a label reporting nothing (UX standard #1). */}
                  {moonlight != null && moonlight > 0.02 && (
                    <span title={`Combined moonlight from the moons currently up — about ${Math.round(moonlight * 100)}% of a bright night.\nCounts all three: Katamba is black and brightens nothing you can see, but Moon Mages draw on it as moonlight all the same.`}>
                      {' · '}{moonlight > 0.66 ? 'bright' : moonlight > 0.33 ? 'moderate' : 'faint'} moonlight
                    </span>
                  )}
                </span>
              </span>
            )}
            {(showSky || showSun) && sunPhase && nextMoon && <span className="moons-foot-sep">|</span>}
            {nextMoon && (
              <span className="moons-foot-seg" title={moonsSegTitle}>
                <span className="moons-foot-key">moons</span>
                <span className="moons-foot-v">
                  {MOON_STYLE[nextMoon.k].label} {nextMoon.up
                    ? (nextMoon.rem <= 0 ? 'setting…' : `sets in ${remLabel(nextMoon.rem)}m`)
                    : (nextMoon.rem <= 0 ? 'rising…' : `rises in ${remLabel(nextMoon.rem)}m`)}
                  {/* F65 — spelled out rather than the "Y+X" initials an earlier
                      pass used: a two-letter code is exactly the label that
                      needs explaining, which UX standard #8 says not to ship.
                      The pairing sits in the tooltip so the strip stays short. */}
                  {conjunctions.length > 0 && (
                    <span title={tripleConjunction
                      ? 'All three moons are riding together in the sky.'
                      : conjunctions.map(({ a, b }) => `${a.s.label} and ${b.s.label} are close together in the sky.`).join('\n')}>
                      {' · '}{tripleConjunction ? 'triple conjunction' : 'conjunction'}
                    </span>
                  )}
                </span>
              </span>
            )}
            {(((showSky || showSun) && sunPhase) || nextMoon) && showWeather && <span className="moons-foot-sep">|</span>}
            {showWeather && (
              <span className="moons-foot-seg" title="The last weather you observed (silent WEATHER / any sky-glance), shown verbatim.">
                <span className="moons-foot-key">weather</span>
                {weather?.indoor ? (
                  <span className="moons-foot-none"><span className="moons-foot-glyph">⌂</span> sky not visible — step outside</span>
                ) : weather ? (
                  <span className="moons-foot-v">{weather.text}</span>
                ) : (
                  <span className="moons-foot-none">not checked yet</span>
                )}
              </span>
            )}
            {/* ⟳ at the end of the header too (Sekmeht — the footer one is easy
                to miss). Always present when a sync handler exists, mirroring the
                footer's; both fire the SAME silent TIME+WEATHER pull with the same
                tooltip — which also carries the "last data received" freshness
                stats (Sekmeht) — so whichever strip the eye lands on (weather up
                top / date below) the refresh + freshness is within reach. */}
            {onSyncSky && (
              <button type="button" className={syncClass} title={syncTitle} onClick={onSyncSky}>⟳</button>
            )}
          </div>
        </div>
      )}
      <div ref={skyRef} className="moons-sky">
      {/* Continuous-sky gradient stack (bottom → top: night base, day blue,
          noon zenith, warm horizon twilight), opacity-crossfaded from the
          elevation weights. Unknown sun (elev null) → no layers; the scene
          class's static dusk shows through. */}
      {elev != null && (
        <>
          <div className="moons-layer moons-layer--night" />
          <div className="moons-layer moons-layer--day" style={{ opacity: wDay }} />
          <div className="moons-layer moons-layer--zenith" style={{ opacity: wZen }} />
          <div className="moons-layer moons-layer--twilight" style={{ opacity: wTwi }} />
        </>
      )}
      {/* xMidYMax meet is only the CLAMP fallback (degenerate measurements
          hit the 300/5000 W bounds — B204: the old 1100 ceiling triggered on
          ordinary maximized panels and letterboxed the ground): drawing
          pinned to the bottom so residual letterbox space goes above the sky,
          never under the ground. */}
      <svg className="moons-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet">
        <defs>
          {/* Lore surfaces (see MOON_STYLE note): soot-black Katamba, ruby
              Yavash under its glowing cloud deck, silvery-blue Xibar ice. */}
          <radialGradient id={`${uid}-moon-katamba`} cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#332d3a" />
            <stop offset="65%" stopColor="#16121c" />
            <stop offset="100%" stopColor="#0b0910" />
          </radialGradient>
          <radialGradient id={`${uid}-moon-yavash`} cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#ef3d4e" />
            <stop offset="55%" stopColor="#a81c2e" />
            <stop offset="100%" stopColor="#4e0c16" />
          </radialGradient>
          <radialGradient id={`${uid}-moon-xibar`} cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#6fb8f7" />
            <stop offset="60%" stopColor="#2f79dd" />
            <stop offset="100%" stopColor="#17509e" />
          </radialGradient>
          {/* THE SUN IS A LIGHT SOURCE, NOT A BALL (Sekmeht, v0.18.3: "it isn't a
              3D yellow ball like it looks now").
              Two things made it read as a sphere, and both are fixed here:
                (a) the highlight was OFF-CENTRE (cx/cy 40%), which is how you
                    shade a lit sphere — the sun has no visible shading at all,
                    it is uniformly blinding;
                (b) the rim ended on an opaque darker orange, giving it a hard
                    edge and a "far side".
              Now: centred, hot near-white core, and the last stop is fully
              TRANSPARENT so the disc has no edge to find — it dissolves into the
              halo below, which in turn dissolves into the sky's sunglow wash.
              Three layers, each feathering into the next. */}
          <radialGradient id={`${uid}-sun`} cx="50%" cy="50%" r="62%">
            <stop offset="0%"   stopColor="#fffdf2" />
            <stop offset="34%"  stopColor="#fff3c4" />
            <stop offset="68%"  stopColor="#f8ce4e" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f6c243" stopOpacity="0" />
          </radialGradient>
          {/* Halo — replaces two FLAT translucent circles whose own edges were
              visible as faint rings. A single smooth falloff instead, carrying
              the disc outward until it meets the sky glow. */}
          <radialGradient id={`${uid}-sun-halo`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#ffe9a8" stopOpacity="0.5" />
            <stop offset="30%"  stopColor="#f8ce4e" stopOpacity="0.28" />
            <stop offset="62%"  stopColor="#f2ba3e" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#e09a28" stopOpacity="0" />
          </radialGradient>
          {/* A touch of blur ACROSS the disc — the hazy surface. Scaled off
              SUN_R so it holds at any zoom, and the filter region is generous
              because a blur clipped by its own box gets a hard edge back, which
              is the one thing this is here to remove. */}
          <filter id={`${uid}-sun-soft`} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation={SUN_R * 0.16} />
          </filter>
          {/* Reflective water for the lake + stream (⚙ Trees & water) — a sky
              reflection: lighter at the far edge, deeper near, day → night. */}
          <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={mixHex('#9fbcd6', '#1b2636', landNight)} />
            <stop offset="100%" stopColor={mixHex('#5f86a4', '#0e141e', landNight)} />
          </linearGradient>
          {/* SUN OCCLUDER — every up-moon punched out of the sun's layer.
              The sun is already painted BEFORE the moons, so paint order was
              never the problem: since F64a masks each moon to its LIT part, the
              unlit limb is fully TRANSPARENT, and an overlapping sun shone
              straight through the moon's dark side (Sekmeht: "the Sun should be
              behind all of the moons"). A moon is an opaque sphere — it must
              hide what is behind it whether or not that side is lit.
              Subtractive rather than additive on purpose: painting an opaque
              disc behind each moon would need to match the SKY, and the sky is
              an HTML gradient layer under the SVG, so nothing here can sample
              it. Punching the moons out of the SUN needs no colour at all.
              Full disc radius, so the shadowed limb occludes exactly like the
              lit one. Per-instance id (pitfall #95). */}
          <mask id={`${uid}-sun-occl`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={HORIZON_Y}>
            <rect x={0} y={0} width={W} height={HORIZON_Y} fill="#fff" />
            {upLit.map(({ b }) => <circle key={b.k} cx={b.x} cy={b.y} r={b.s.r} fill="#000" />)}
          </mask>
          {/* Overcast DECK — solid overhead, gone by the horizon. Rendering
              overcast as a flat all-over wash instead made it read as haze
              (Sekmeht), which is exactly the look we no longer draw at all.
              Per-instance id (pitfall #95) — passed to MoonsClouds. */}
          <linearGradient id={`${uid}-deck`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#9aa0ad" stopOpacity="0.55" />
            <stop offset="55%"  stopColor="#9aa0ad" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#9aa0ad" stopOpacity="0" />
          </linearGradient>
          {/* F69 — per-up-moon SUN-LIT gradients: highlight offset toward the sun,
              lit stop tinted by the sun's colour/strength, fading to the moon's
              shadowed far side (the terminator). Rebuilt each render from the sun
              direction (a few gradients, deterministic — no perf concern). */}
          {upLit.map(({ b, lit }) => lit && (
            <radialGradient key={`dyn-${b.k}`} id={`${uid}-moon-dyn-${b.k}`} cx={`${lit.cx * 100}%`} cy={`${lit.cy * 100}%`} r="78%">
              {/* color-mix goes via style (CSS property) — reliable, unlike a raw SVG attribute. */}
              <stop offset="0%"   style={{ stopColor: sunMix(b.s.tones.lit) }} />
              <stop offset="42%"  stopColor={b.s.tones.lit} />
              <stop offset="72%"  stopColor={b.s.tones.mid} />
              <stop offset="100%" stopColor={b.s.tones.shadow} />
            </radialGradient>
          ))}
          {/* Soft primary-colour SKY glow per moon (Sekmeht) — a small radial bloom
              behind each up-moon in its lore hue. */}
          {/* A moon with no `glow` gets no gradient — the FIELD is the switch,
              not a name check, so this and the disc layer below can never
              disagree about which moons glow. Katamba is the one without. */}
          {MOON_KEYS.map(k => {
            const glow = MOON_STYLE[k].glow
            if (!glow) return null
            const gs = MOON_STYLE[k].glowStrength ?? 1
            return (
              <radialGradient key={`glow-${k}`} id={`${uid}-glow-${k}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor={glow} stopOpacity={0.45 * gs} />
                <stop offset="55%"  stopColor={glow} stopOpacity={0.2 * gs} />
                <stop offset="100%" stopColor={glow} stopOpacity="0" />
              </radialGradient>
            )
          })}
          {/* F67 — shooting-star tail (transparent → bright along its length). */}
          <linearGradient id={`${uid}-shoot`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#eaf2ff" stopOpacity="0" />
            <stop offset="100%" stopColor="#eaf2ff" stopOpacity="1" />
          </linearGradient>
        </defs>
        {/* Sun-centric sky glow — a warm radial bloom centered on the sun (behind
            everything), so the brightest point of the day sky follows the sun and
            warms into sunrise/sunset. Absent at night. */}
        {sunGlow && (
          <>
            <radialGradient id={`${uid}-sunglow`} gradientUnits="userSpaceOnUse" cx={sunGlow.x} cy={sunGlow.y} r={sunGlow.radius}>
              <stop offset="0%"   stopColor={sunGlow.color} stopOpacity={sunGlow.opacity} />
              <stop offset="50%"  stopColor={sunGlow.color} stopOpacity={sunGlow.opacity * 0.45} />
              <stop offset="100%" stopColor={sunGlow.color} stopOpacity={0} />
            </radialGradient>
            <rect x={0} y={0} width={W} height={HORIZON_Y} fill={gref('sunglow')} />
          </>
        )}
        {/* Star field — brighter stars appear at dusk, fainter ones reveal the closer
            it gets to true midnight (light pollution clearing): each star's `opacity`
            is its brightness gated by `nightDepth` vs its own `reveal` threshold. The
            TWINKLE animation rides `fill-opacity` (independent of the reveal opacity,
            so the two multiply) when the effects layer is on; static otherwise. */}
        {showSky && nightDepth > 0.02 && (
          <g className="moons-stars" aria-hidden="true">
            {STARS.map((s, i) => {
              const op = clamp01((nightDepth - s.reveal) / 0.28) * s.b
              return op < 0.015 ? null : (
                <circle key={i} className={anim ? 'moons-star' : undefined}
                  style={anim ? { animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` } : undefined}
                  cx={s.fx * W} cy={s.y} r={s.r} fill="#dfe9ff" opacity={op} />
              )
            })}
          </g>
        )}
        {/* The arc path the moons ride — a halo pass (opposite-lightness of the
            sky ink, like the scene text) UNDER the dashed guide so it reads on a
            bright day AND a dark night. Same geometry, drawn twice. */}
        {(() => {
          const arcD = `M ${CX - ARC_RX} ${HORIZON_Y} A ${ARC_RX} ${ARC_RY} 0 0 1 ${CX + ARC_RX} ${HORIZON_Y}`
          return (
            <>
              {/* Fade the arc into the horizon at BOTH ends. A track that simply
                  stops dead where it meets the ground is most of what made this
                  read as a drawn diagram line; letting it arrive and depart
                  makes it a path the bodies travel. Horizontal gradient because
                  the arc spans CX±ARC_RX. Per-instance id (pitfall #95). */}
              <mask id={`${uid}-arcfade`} maskUnits="userSpaceOnUse"
                    x={CX - ARC_RX} y={0} width={ARC_RX * 2} height={HORIZON_Y + 2}>
                <linearGradient id={`${uid}-arcfadeg`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor="#000" />
                  <stop offset="13%"  stopColor="#fff" />
                  <stop offset="87%"  stopColor="#fff" />
                  <stop offset="100%" stopColor="#000" />
                </linearGradient>
                <rect x={CX - ARC_RX} y={0} width={ARC_RX * 2} height={HORIZON_Y + 2}
                      fill={`url(#${uid}-arcfadeg)`} />
              </mask>
              <g mask={`url(#${uid}-arcfade)`}>
                <path d={arcD} className="moons-arc-halo" fill="none" />
                <path d={arcD} className="moons-arc-guide" fill="none" />
              </g>
            </>
          )
        })()}

        {/* ── DRAW ORDER (Sekmeht, v0.17.0): bodies are drawn BEHIND an OPAQUE
            horizon ground, so a body that has set SINKS behind the horizon and,
            once fully below, is HIDDEN (the orrery pill carries its rise time).
            Down bodies render only while CRESTING (sinking just after set /
            emerging just before rise); text is UP-bodies only. ────────────────
            1. sky + cresting DISCS   (behind the ground)
            2. OPAQUE GROUND          (season/weather background — occludes set bodies)
            3. horizon + RIDGES
            4. weather + phase label
            5. UP-body TEXT           (names + chips, always legible)
            Titles (hover lore-cards) ride the disc groups. */}

        {/* 1 — day sun (behind the ground, so it sinks behind the horizon as it sets) */}
        {sunBody && sunPhase?.day && (
          <g mask={upLit.length > 0 ? gref('sun-occl') : undefined}>
            <title>{`${SUN_LORE}\n\nSets at ~${fmtClock(now + sunPhase.toNextMin * 60_000)} (${sunPhase.assumed ? '≈' : ''}${sunPhase.toNextMin}m)`}</title>
            <circle cx={sunBody.x} cy={sunBody.y} r={SUN_R * 2.7} fill={gref('sun-halo')} />
            <circle cx={sunBody.x} cy={sunBody.y} r={SUN_R * 1.08} fill={gref('sun')} filter={gref('sun-soft')} />
            {anim && sunPhase.progress <= NEAR && <TransitionRings x={sunBody.x} y={sunBody.y} r={16} color="#f8ce4e" kind="rise" />}
            {anim && sunPhase.progress >= 1 - NEAR && <TransitionRings x={sunBody.x} y={sunBody.y} r={16} color="#f8ce4e" kind="set" />}
          </g>
        )}
        {/* cresting DOWN sun — solid, full-size, only during the fixed sink (just
            after set) / emerge (just before rise) window; hidden through the night. */}
        {sunCrest && (
          <g mask={upLit.length > 0 ? gref('sun-occl') : undefined}>
            <title>{`${SUN_LORE}\n\nRises at ~${fmtClock(now + sunPhase!.toNextMin * 60_000)} (${sunPhase!.assumed ? '≈' : ''}${sunPhase!.toNextMin}m)`}</title>
            {/* Same haze at the horizon — this is where the glow is most of
                what you actually see of it. */}
            <circle cx={sunCrest.x} cy={sunCrest.y} r={SUN_R * 2.7} fill={gref('sun-halo')} />
            <circle cx={sunCrest.x} cy={sunCrest.y} r={SUN_R * 1.08} fill={gref('sun')} filter={gref('sun-soft')} />
            {anim && <TransitionRings x={sunCrest.x} y={sunCrest.y} r={SUN_R + 4} color={sunCrest.kind === 'rise' ? '#f8ce4e' : '#e09a28'} kind={sunCrest.kind} />}
          </g>
        )}
        {/* up moon discs (F69 sun-lit) — behind the ground; painted back→front
            (Yavash → Katamba → Xibar) so overlaps respect MOON_DEPTH. */}
        {[...upLit].sort((a, b) => MOON_DEPTH[a.b.k] - MOON_DEPTH[b.b.k]).map(({ b, lit, phase }) => (
          <g key={b.k}>
            <title>{`${MOON_LORE[b.k]}\n\n${b.rem <= 0 ? 'Setting any moment' : `Sets at ~${fmtClock(now + b.rem * 60_000)} (${remLabel(b.rem)}m)`}${phaseLines(b.k)}`}</title>
            {/* Transit silhouette — FIRST in the group, so a partly-lit moon
                still paints its crescent over the top and only the shadowed
                part reads dark. Rides the ⚙ Phase layer: with phases off every
                moon is a full disc and there is nothing to rescue. */}
            {showPhase && phase && (() => {
              const strength = transitNearness(b.x, b.y, b.s.r) * (1 - phase.illum)
              if (strength < 0.02) return null
              return (
                <>
                  {/* Body: a touch of shadow so the disc separates from the
                      glare rather than being a bare ring on nothing. */}
                  <circle cx={b.x} cy={b.y} r={b.s.r} fill="#0b0d14" opacity={0.55 * strength} />
                  {/* Rim: what actually makes it legible. Slightly lighter than
                      the fill so the edge stays visible against a dark sky too,
                      which is where a setting sun puts it. */}
                  <circle cx={b.x} cy={b.y} r={b.s.r} fill="none"
                    stroke="#1b2030" strokeOpacity={0.9 * strength} strokeWidth={1.1} />
                </>
              )
            })()}
            {/* Soft primary-colour glow behind the disc (Sekmeht, ⚙ Moon glow).
                KATAMBA HAS NONE (Sekmeht, 2026-09-06). It used to carry a
                miasmatic dark-violet haze curved against sun elevation — the one
                "glow" that was a shadow rather than light. Removed outright: the
                moon is black as soot and sheds nothing, so the truest rendering
                is nothing at all, and its soot disc + violet-grey rim already
                identify it. Its `glow`/`glowStrength`/`glowR` fields and its
                gradient went with it rather than lingering as dead data.
                Do not reinstate it without a fresh ask. */}
            {showMoonGlow && b.s.glow && (() => {
              // Glow scales with the LIT FRACTION (Sekmeht): a full moon floods
              // the sky, a thin crescent barely marks it. Superlinear on purpose
              // — real moonlight behaves that way (a full moon is many times a
              // half moon, not twice), so a linear ramp reads flat and washed.
              //
              // Phase-off (⚙) keeps the old uniform look — one toggle, one idea.
              const illum = showPhase && phase ? phase.illum : 1
              const baseR = b.s.r * (b.s.glowR ?? 1.85)
              return (
                <>
                  {/* Wide outer bloom — only near full, and this is what makes a
                      full moon feel like it is lighting the sky rather than just
                      being a brighter dot. Fades in over the last third. */}
                  {illum > 0.62 && (
                    <circle cx={b.x} cy={b.y} r={baseR * (1.5 + 0.9 * illum)} fill={gref(`glow-${b.k}`)}
                      opacity={0.42 * ((illum - 0.62) / 0.38)} />
                  )}
                  <circle cx={b.x} cy={b.y} r={baseR * (0.62 + 0.72 * illum)} fill={gref(`glow-${b.k}`)}
                    opacity={clamp01(0.05 + 1.25 * Math.pow(illum, 1.5))} />
                </>
              )
            })()}
            {/* ── F64a: the moon is only its LIT PART ────────────────────────
                Rewritten (Sekmeht): the first version drew a full disc and laid
                a dark shadow over it, which renders as a painted ball. That is
                not how a moon looks. From Earth the unlit limb is INVISIBLE —
                against a bright day sky it vanishes completely, and at night it
                is black on black. You never see a dark disc; you see a crescent
                hanging in nothing.
                So the disc is MASKED to the lit region and the unlit side is
                simply not drawn. What remains of the sphere comes from two real
                effects: EARTHSHINE (the ashen "old moon in the new moon's arms",
                strongest at thin crescent and only visible at night) and the
                moon's own halo, which is what hints at the full circle when
                almost nothing is lit. */}
            {(() => {
              const phasing = showPhase && !!lit && !!phase
              const illum = phasing ? phase!.illum : 1
              const maskId = `${uid}-lit-${b.k}`
              return (
                <>
                  {/* Mask = show ONLY the lit region. NOT rotated: as of
                      v0.18.2 the terminator stays on the moon's own axis and
                      the phase crosses it (see litAim). Per-instance id (#95). */}
                  {phasing && illum < 0.995 && (
                    <>
                      {/* SOFT TERMINATOR (Sekmeht: "a sharp cutoff on the blue"
                          reads wrong). The real day/night line on a sphere is
                          gradual — sunlight grazes the surface there — so a hard
                          mask edge looks like a cutout rather than a lit body.
                          A small blur on the mask does it.
                          The OUTER limb stays crisp because the masked element
                          is itself a circle of radius r: the blur can only eat
                          inward, which shows up as a faint limb darkening — also
                          a real effect, so it flatters rather than hurts.
                          Scaled to the moon's radius so Xibar (r 7) and Katamba
                          (r 13) get the same softness in proportion, with a
                          floor so the smallest moon still gets some. */}
                      <filter id={`${uid}-soft-${b.k}`} x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation={Math.max(0.55, b.s.r * 0.16)} />
                      </filter>
                      <mask id={maskId} maskUnits="userSpaceOnUse"
                            x={b.x - b.s.r - 3} y={b.y - b.s.r - 3} width={b.s.r * 2 + 6} height={b.s.r * 2 + 6}>
                        {/* No rotation: the terminator sits on the moon's own
                            axis and the phase crosses it. `litPath` draws the lit
                            limb toward +x, so waning simply mirrors — identical to
                            PhaseDot, which is why the pill and the sky agree. */}
                        <g transform={`translate(${b.x} ${b.y})${phase!.waxing ? '' : ' scale(-1,1)'}`}>
                          <path d={litPath(b.s.r, 1 - 2 * illum)} fill="#fff"
                                filter={`url(#${uid}-soft-${b.k})`} />
                        </g>
                      </mask>
                    </>
                  )}
                  {/* EARTHSHINE — the unlit sphere, barely there. Night only:
                      in daylight the real dark limb is genuinely invisible, and
                      a grey disc against a blue sky is the exact artefact this
                      rewrite removes. Strongest near new, fading as the lit part
                      takes over. A moon that sheds no light gets none — for
                      Katamba this is a dark wash on an already-soot disc, which
                      adds nothing to a night sky. (Keyed on the `glow` FIELD
                      like every other "does this moon shine" test; the older
                      justification here cited its violet haze, which no longer
                      exists.) */}
                  {phasing && illum < 0.9 && !!b.s.glow && sunElev != null && sunElev < -0.05 && (
                    <circle cx={b.x} cy={b.y} r={b.s.r} fill={b.s.tones.shadow}
                      opacity={0.30 * (1 - illum)} />
                  )}
                  {/* The faint full outline — "you can see the sphere because it
                      glows". Keeps a nearly-new moon locatable instead of
                      popping out of existence, and is dimmer by day, when the
                      sky would wash it out anyway.
                      Scaled by `atmo` as well: airless Xibar gets a dimmer hint
                      than the two moons with atmospheres, since on a body with
                      nothing to catch the light this must not read as a glowing
                      shell — it is a locate-me affordance, nothing more. */}
                  {phasing && illum < 0.9 && (
                    <circle cx={b.x} cy={b.y} r={b.s.r} fill="none" stroke={b.s.rim} strokeWidth={0.75}
                      opacity={(sunElev != null && sunElev > 0 ? 0.16 : 0.3) * (1 - illum) * (0.45 + 0.55 * b.s.atmo)} />
                  )}
                  {/* Everything that paints the moon proper, clipped to the lit
                      region. F69's directional gradient and the specular still
                      apply — they just no longer bleed onto a side that should
                      not be visible at all. */}
                  <g mask={phasing && illum < 0.995 ? `url(#${maskId})` : undefined}>
                    {/* The outline IS the atmosphere — thick on Yavash, a faint
                        veil on Katamba, and absent on airless Xibar, whose limb
                        is simply where the disc ends. */}
                    <circle cx={b.x} cy={b.y} r={b.s.r} fill={lit && showSunlight ? gref(`moon-dyn-${b.k}`) : gref(`moon-${b.k}`)}
                      stroke={b.s.atmo > 0 ? b.s.rim : 'none'}
                      strokeWidth={0.7 + 0.9 * b.s.atmo}
                      strokeOpacity={0.45 + 0.55 * b.s.atmo} />
                    {/* Brighter toward full — a full moon should read as a
                        brighter OBJECT, not merely one wearing a bigger halo. A
                        wash of the moon's OWN lit tone, so Yavash stays ruby and
                        Xibar stays ice rather than bleaching toward each other. */}
                    {showPhase && phase && !!b.s.glow && phase.illum > 0.55 && (
                      <circle cx={b.x} cy={b.y} r={b.s.r} fill={b.s.tones.lit}
                        opacity={0.3 * ((phase.illum - 0.55) / 0.45)} />
                    )}
                    {lit && showSunlight && sunLight.strength > 0.35 && (
                      <circle cx={b.x + lit.lx * b.s.r * 0.4} cy={b.y + lit.ly * b.s.r * 0.4} r={b.s.r * 0.5}
                        fill={sunLight.color} opacity={0.18 * sunLight.strength} />
                    )}
                  </g>
                </>
              )
            })()}
            {anim && b.progress <= NEAR && <TransitionRings x={b.x} y={b.y} r={b.s.r + 3} color={b.s.rim} kind="rise" />}
            {anim && b.progress >= 1 - NEAR && <TransitionRings x={b.x} y={b.y} r={b.s.r + 3} color={b.s.rim} kind="set" />}
          </g>
        ))}
        {/* F65 — conjunction highlight: a soft halo spanning each close pair,
            drawn UNDER nothing in particular but after the discs so it reads as
            a shared glow rather than a line between two objects. Deliberately
            quiet (UX standard #1) — a conjunction is a "look up" nudge, not an
            alert, and it already announces itself in the pill. Gated on the
            moon-glow layer since it is the same kind of ornament. */}
        {showMoonGlow && conjunctions.map(({ a, b }) => {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          const span = Math.hypot(a.x - b.x, a.y - b.y) / 2 + Math.max(a.s.r, b.s.r) + 4
          return (
            <ellipse key={`cj-${a.k}-${b.k}`} cx={mx} cy={my}
              rx={span} ry={Math.max(a.s.r, b.s.r) + 5}
              transform={`rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI} ${mx} ${my})`}
              fill="none" stroke="#dbe9f5" strokeWidth={1} opacity={0.22} />
          )
        })}
        {/* cresting DOWN moons — solid, full-size, only during the fixed sink/emerge
            window; hidden the rest of the time (the pill carries the rise time). */}
        {[...downBodies].sort((a, b) => MOON_DEPTH[a.k] - MOON_DEPTH[b.k]).map(b => b.crest && (
          <g key={b.k}>
            <title>{`${MOON_LORE[b.k]}\n\n${b.rem <= 0 ? 'Rising any moment' : `Rises at ~${fmtClock(now + b.rem * 60_000)} (${remLabel(b.rem)}m)`}${phaseLines(b.k)}`}</title>
            <circle cx={b.crest.x} cy={b.crest.y} r={b.s.r} fill={gref(`moon-${b.k}`)}
              stroke={b.s.atmo > 0 ? b.s.rim : 'none'}
              strokeWidth={0.7 + 0.9 * b.s.atmo}
              strokeOpacity={0.45 + 0.55 * b.s.atmo} />
            {anim && <TransitionRings x={b.crest.x} y={b.crest.y} r={b.s.r + 4} color={b.s.rim} kind={b.crest.kind} />}
          </g>
        ))}

        {/* (Weather clouds + shooting stars moved to the FRONT layers below — the
            day/night FX sit in the foreground over the scene, the weather over them.) */}

        {/* 2 — OPAQUE horizon ground: the bottom half is a real background that
            OCCLUDES any set body (Sekmeht), tinted by season + weather. */}
        <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={ground.top} />
          <stop offset="100%" stopColor={ground.bot} />
        </linearGradient>
        <rect x={0} y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill={gref('ground')} />

        {/* Crepuscular ground rays (Sekmeht) — a fan from the sun's horizon point
            across the landscape: warm LIGHT beams at sunrise, dark SHADOW at
            sunset, with a warm light pool at the crossing point. Drawn OVER the
            ground but UNDER the ridges (mountains stay backlit silhouettes). Whole
            group fades with `low` as the sun leaves golden hour. */}
        {groundLight && (
          <g className="moons-ground-fx" opacity={groundLight.low} aria-hidden="true">
            <linearGradient id={`${uid}-ray-light`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ffdca0" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffdca0" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-ray-shadow`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#05070d" stopOpacity="0" />
              <stop offset="100%" stopColor="#05070d" stopOpacity="0.6" />
            </linearGradient>
            <radialGradient id={`${uid}-gpool`} gradientUnits="userSpaceOnUse" cx={groundLight.x} cy={HORIZON_Y} r={W * 0.45}>
              <stop offset="0%"   stopColor="#ffe0a0" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffe0a0" stopOpacity="0" />
            </radialGradient>
            {/* The warm light POOL at the crossing point stays here, under the
                landscape: it is light lying ON the ground, so trees and water
                should sit on top of it. Only the ray FAN moved (see below). */}
            <rect x={0} y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill={gref('gpool')} />
          </g>
        )}

        {/* 3 — horizon + silhouette (setting bodies slip behind the peaks AND the ground) */}
        <line x1={8} y1={HORIZON_Y} x2={W - 8} y2={HORIZON_Y} className="moons-horizon" />
        {showHorizon && (
          <>
            <path d={ridgePath(W, 1.5, 5)} className={`moons-ridge moons-ridge--far${snowLand ? ' moons-ridge--snow' : ''}`} />
            <path d={ridgePath(W, 1, 0)} className={`moons-ridge moons-ridge--near${snowLand ? ' moons-ridge--snow' : ''}`} />
            {/* F70 — a snow line traced along the near ridge tops in winter (⚙ Seasonal touches). */}
            {snowLand && <path d={ridgePath(W, 1, 0)} className="moons-ridge-snowcap" fill="none" />}
          </>
        )}
        {/* Day/night landscape shade — darkens the ground at night, lifts by day
            (Sekmeht). DIRECTIONAL: a radial anchored at the sun's horizon crossing,
            so the side where the sun rises/sets stays lit longest and the far side
            falls into shadow first (the shade sweeps across as the sun moves).
            Over the ground + rays so the sunset shadow deepens into night and dawn
            light lifts it. */}
        {groundShade > 0.01 && sunLightPos && (
          <>
            <radialGradient id={`${uid}-shade`} gradientUnits="userSpaceOnUse"
              cx={Math.max(0, Math.min(W, sunLightPos.x))} cy={HORIZON_Y} r={W * 0.85}>
              <stop offset="0%"   stopColor="#03050b" stopOpacity={groundShade * 0.35} />
              <stop offset="100%" stopColor="#03050b" stopOpacity={groundShade} />
            </radialGradient>
            <rect x={0} y={HORIZON_Y} width={W} height={H - HORIZON_Y} fill={gref('shade')} />
          </>
        )}
        {/* Phase 1 nature scene — trees, a stream and a lake, drawn OVER the ground
            + night shade so its own night-aware colouring reads on top. Always-on
            (no data needed); `landNight` from the sun elevation drives the day/night
            colouring + water reflection, so it works without a TIME check. */}
        {showLandscape && (
          <MoonsLandscape W={W} horizonY={HORIZON_Y} groundBot={H} night={landNight} season={landSeason}
            sun={landSun} reflect={lakeReflect} gref={gref} />
        )}
        {/* Crepuscular ray FAN — drawn AFTER the landscape so the beams sweep
            ACROSS the lake and river rather than being buried under them (Binu).
            That is also the truer read: these are beams scattering in the AIR
            between the viewer and the scene, so they belong in front of the
            water and the trees, not behind. Only the fan moved — the ground
            light-pool stays under the landscape, because that is light lying ON
            the ground. Mountains still stay backlit silhouettes: the ridges are
            at the horizon, where the fan converges to a point. */}
        {groundLight && (
          <g className="moons-ground-fx" opacity={groundLight.low} aria-hidden="true">
            {RAY_FRACS.map((frac, i) => {
              const tx = frac * W
              const bw = 7 + (i % 3) * 4
              return (
                <polygon key={i}
                  className={anim && groundLight.rising ? 'moons-ray moons-ray--anim' : 'moons-ray'}
                  points={`${groundLight.x},${HORIZON_Y} ${tx - bw},${H} ${tx + bw},${H}`}
                  fill={gref(groundLight.rising ? 'ray-light' : 'ray-shadow')}
                  style={anim && groundLight.rising ? { animationDelay: `${-(i * 1.3)}s` } : undefined} />
              )
            })}
          </g>
        )}
        {/* ── DAY/NIGHT FX — FOREGROUND (over the whole scene), but BEHIND the
            weather FX below (Sekmeht). ─────────────────────────────────────── */}
        {/* F67 — shooting stars streak across the upper sky on a CLEAR night (clouds
            hide them, as in real life); a few staggered so one flashes every few
            seconds. Each carries its own path/timing via CSS custom properties. */}
        {anim && isNight && clearSky && (
          <g aria-hidden="true">
            {SHOOTS.map((s, i) => {
              const x0 = s.sx * W, len = Math.hypot(s.dx, s.dy) || 1
              return (
                <g key={i} className="moons-shooting" style={{
                  ['--sx' as string]: `${x0}px`, ['--sy' as string]: `${s.sy}px`,
                  ['--ex' as string]: `${x0 + s.dx}px`, ['--ey' as string]: `${s.sy + s.dy}px`,
                  ['--dur' as string]: `${s.dur}s`, animationDelay: `${s.delay}s`,
                } as CSSProperties}>
                  <line x1={0} y1={0} x2={(s.dx / len) * 16} y2={(s.dy / len) * 16}
                    stroke={gref('shoot')} strokeWidth={1.4} strokeLinecap="round" />
                </g>
              )
            })}
          </g>
        )}
        {/* F68 — fireflies on summer dusk/nights, drifting near the ground (in
            FRONT of the landscape). */}
        {anim && showSeasonal && isSummer && (isNight || isDusk) && clearSky && (
          <g className="moons-fireflies" aria-hidden="true">
            {FIREFLIES.map((f, i) => (
              <circle key={i} className="moons-firefly" cx={f.x * W} cy={f.y} r={1.15}
                style={{ animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, ['--drift' as string]: `${f.drift}px` } as CSSProperties} />
            ))}
          </g>
        )}
        {/* Phase 2 — autumn leaves fluttering down over the landscape (⚙ Seasonal
            touches; epilepsy-safe / the ⚙ Effects layer disable it via `anim`). */}
        {anim && showLandscape && showSeasonal && isFall && (
          <g className="moons-leaves" aria-hidden="true">
            {LEAVES.map((l, i) => (
              <ellipse key={i} className="moons-leaf" cx={l.x * W} cy={HORIZON_Y - 8} rx={l.r * 1.35} ry={l.r * 0.65}
                fill={mixHex(l.c, '#2e2015', landNight)}
                style={{ animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s`, ['--fall' as string]: `${H - HORIZON_Y + 14}px`, ['--sway' as string]: `${l.sway}px` } as CSSProperties} />
            ))}
          </g>
        )}

        {/* ── WEATHER FX — FRONTMOST (over the day/night FX + the whole scene). ── */}
        {/* Clouds drift across the upper sky, over the bodies + shooting stars. */}
        {weatherFxOn && wx.clouds && <MoonsClouds W={W} heavy={wx.heavy} wind={wx.wind} cover={wx.cover} deckFill={gref('deck')} />}
        {/* Precipitation, fading at the horizon (⚙ "Weather effects"). Fog is
            deliberately absent — see MoonsPrecip. */}
        {weatherFxOn && (wx.snow || wx.rain || wx.storm) && <MoonsPrecip W={W} wx={wx} horizonY={HORIZON_Y} />}

        {/* Time-of-day word on the sky — CENTERED just above the horizon (clear of
            the moons/sun that rise and set at the left/right ends), from the sun's
            elevation (v0.17.0). Follows the ⚙ "Living sky" layer since it names the
            same sky the gradient paints. When TIME has been captured, the fine
            Elanthian daypart is appended in parens (Sekmeht) — "Night (late
            evening)" — so it moved off the footer date line. */}
        {showSky && sunPhase && (() => {
          const phase = skyPhaseLabel(sunPhase)
          const dp = calendar?.timeOfDay
          // The fine daypart goes on its OWN line below, in a smaller font
          // (Sekmeht) — suppressed when it's the same word as the phase
          // (avoid "Dawn / (dawn)").
          const showDp = !!dp && dp.toLowerCase() !== phase.toLowerCase()
          return (
            <>
              <text x={CX} y={HORIZON_Y - (showDp ? 44 : 28)} className="moons-phase-label" textAnchor="middle">{phase}</text>
              {showDp && <text x={CX} y={HORIZON_Y - 29} className="moons-phase-label moons-phase-sub" textAnchor="middle">({dp})</text>}
            </>
          )
        })()}

        {/* 5 — UP-body text, always on top (placeChip claims run sun → up moons).
            Only the DAY sun / UP moons get scene text; set bodies are gone and the
            orrery pill carries their rise times. */}
        {sunBody && sunPhase?.day && (() => {
          const r = SUN_R
          const t = `sets in ${sunPhase.assumed ? '≈' : ''}${sunPhase.toNextMin}m`
          return (
            <g>
              {showNames && <text x={sunBody.x} y={sunBody.y - r - 8} className="moons-name" textAnchor="middle">Sun</text>}
              {showCountdowns && (
                <text x={sunBody.x} y={placeChip(sunBody.x, sunBody.y + r + 12, t, 'sky', sunBody.y, r)} className="moons-chip" textAnchor="middle">{t}</text>
              )}
            </g>
          )
        })()}
        {upBodies.map(b => {
          const t = b.rem <= 0 ? 'setting…' : `sets in ${remLabel(b.rem)}m`
          return (
            <g key={`t-${b.k}`}>
              {showNames && <text x={b.x} y={b.y - b.s.r - 6} className="moons-name" textAnchor="middle">{b.s.label}</text>}
              {showCountdowns && (
                <text x={b.x} y={placeChip(b.x, b.y + b.s.r + 12, t, 'sky', b.y, b.s.r)} className="moons-chip" textAnchor="middle">{t}</text>
              )}
            </g>
          )
        })}
        {/* (down-moon text removed — the orrery pill carries each set body's rise time) */}
      </svg>
      {/* Frosted orrery pill — floats over the lower sky, centered just above the
          footer. Sun + moons with their next rise/set. */}
      {showPill && pillBodies.length > 0 && (
        <div className="moons-pill" role="group" aria-label="Sun and moons — next rise/set times">
          {pillBodies.map(b => {
            // F64a — the phase belongs in the TOOLTIP, not on the face of the
            // pill: three names as long as "waning gibbous" would swamp a strip
            // this size. It is marked "computed" because unlike the rise/set
            // times (observed, via moonwatch) phase has no feed to correct
            // against — the same provenance honesty the sun's data-age carries.
            const ph = b.key === 'sun' ? undefined : phases[b.key as MoonKey]
            // Same phase text as the scene disc — one formatter, so hovering the
            // moon and hovering its pill cell can never say different things.
            const tip = `${b.label} — ${b.up ? 'sets' : 'rises'} in ${b.assumed ? '≈' : ''}${fmtDur(b.min)}`
              + (ph ? phaseLines(b.key as MoonKey) : '')
            return (
              // The visible row is symbolic (↑/↓), so the accessible name spells
              // it out — a screen reader announcing "down 1h 12m" would be
              // meaningless on its own.
              <div key={b.key} className="moons-pill-cell" title={tip}
                   aria-label={`${b.label} ${b.up ? 'sets' : 'rises'} in ${fmtDur(b.min)}`}>
                <span className="moons-pill-name">
                  {/* The dot IS the phase for a moon — same footprint the plain
                      dot already had. The sun keeps its solid disc: it has no
                      phase, and a phased sun would be nonsense. */}
                  {ph
                    ? <PhaseDot phase={ph} color={PILL_DOT[b.key]} size={9} />
                    : <span className="moons-pill-dot" style={{ background: PILL_DOT[b.key], boxShadow: `0 0 5px ${PILL_DOT[b.key]}` }} />}
                  {b.label}
                </span>
                {/* ↑ rises / ↓ sets (Sekmeht) — the direction the body is about
                    to travel, which is the natural read and drops ~5 characters
                    from every cell. A body that is UP next SETS (↓); one that is
                    down next RISES (↑).
                    A bare glyph is not self-explanatory (UX standard #8), so the
                    words survive in the cell's tooltip AND its aria-label — the
                    tooltip is on the always-visible affordance, which is where
                    that rule wants it. */}
                <span className="moons-pill-time">
                  <span className="moons-pill-dir" aria-hidden>{b.up ? '↓' : '↑'}</span>
                  {b.assumed ? '≈' : ''}{fmtDur(b.min)}
                </span>
              </div>
            )
          })}
          {/* Moonlight (F64) and conjunctions (F65) deliberately do NOT live
              here. They are SKY-WIDE facts, not per-body ones, so they belong in
              the header strip beside "day/night" — and adding conditional cells
              to a wrap-centred pill made the whole row re-centre and re-wrap the
              moment one appeared (UX standard #2: nothing should pop in or out
              as data arrives). The pill stays exactly Sun + the moons it knows. */}
        </div>
      )}
      </div>

      {/* Footer — now just the Elanthian date (the sky/moons/weather row moved to
          the top pill above). The ⟳ here SILENTLY sends TIME + WEATHER (no echo,
          replies consumed) — it refreshes both the date and the pill's weather. */}
      {showCalendar && (
        <div className="moons-footer" title="The Elanthian date (from TIME). ⟳ refreshes the date and the weather up top, silently.">
          <div className="moons-foot-row">
            <span className="moons-foot-seg" title={calendar ? calendarTooltip(calendar) : 'The Elanthian date, month, year, season and time of day (from TIME). Click ⟳ to check — silent (nothing shows in the game window).'}>
              <span className="moons-foot-key">date</span>
              {calendar ? (
                <span className="moons-foot-v">{calendarLine(calendar)}</span>
              ) : (
                <span className="moons-foot-none">not checked yet</span>
              )}
            </span>
            {onSyncSky && (
              <button type="button" className={syncClass} title={syncTitle} onClick={onSyncSky}>⟳</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// memo (pitfall #82c): GameWindow re-renders every game batch; this only needs
// to when the moons/sun state or the ⚙ options change.
export default memo(MoonsExperience)
