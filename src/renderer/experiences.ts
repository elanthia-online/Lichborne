// Lichborne Experiences — the registry (DESIGN.md §34.3). An Experience is a
// registered, graphical, floating surface hosted over the game layout by the
// ExperienceLayer (both layout modes). Experiences are NOT panels and NOT
// streams: they have their own id space (never in discoveredStreams or the
// tab arrays — collision-safe by construction), their own scopedKey
// persistence (`experiences` — rides the dynamic state: pipeline into YAML,
// no profile-shape change), and their own TRANSFER_CATEGORIES category.
//
// Adding a future Experience = ONE entry in EXPERIENCES + its component
// (§34.8 checklist). No PanelType union change, no Panel Manager edits, no
// discovery-filter audit. If a change here seems to need a panel-system file,
// the design is drifting back to §34.2's rejected models — stop and re-read.
import type { ComponentType } from 'react'
import type { RoomState, ScenePlayer, SceneCreature } from '../shared/types'
import type { CombatRange, AssessEntity } from '../shared/combatExtract'
import { sunPositionAt } from '../shared/elanthianSun'
import { ROISAN_SECONDS, ANLAS_ROISAEN } from '../shared/elanthianTime'
import type { AppSettings } from './settings'
import type { Contact, ContactTemplate } from './contacts'
import type { FloatRect } from './freeLayout'
import TableauExperience from './components/experiences/TableauExperience'
import MoonsExperience from './components/experiences/MoonsExperience'
import SpellMonitorExperience from './components/experiences/SpellMonitorExperience'

// ── Weather & Moons state (Experience #2, v0.15.0) ─────────────────────────
// Source of truth: the community `moonwatch.lic` script (read 2026-07-07,
// C:/Ruby4Lich5/Lich5/scripts/moonwatch.lic). It crowd-sources moon events via
// a shared Firebase and pushes ONE line into the `moonWindow` stream whenever
// state changes: `[k]+(90) [y]-(59) [x]-(88)` — always all three moons, order
// Katamba/Yavash/Xibar; `+(N)` = up, sets in N MINUTES (real minutes);
// `-(N)` = down, rises in N minutes. The script also detects sunrise/sunset
// from GAME PROSE (regexes mirrored in SUN_RISE_RE/SUN_SET_RE below) — we
// capture those lines natively, so day/night works without Lich.

export interface MoonInfo {
  up: boolean
  minutes: number   // remaining minutes AT reportedAt, exactly as the script floored it
  /** When `minutes` last stepped DOWN by exactly 1 within the same arc.
   *  moonwatch reports `floor(seconds / 60)`, so at the instant of a clean step
   *  the TRUE remaining was exactly `minutes` — an exact anchor we can then
   *  interpolate from continuously. Undefined until the first clean step is
   *  seen (first sight of a moon, or a rise/set jump), where
   *  `moonRemainingMinutes` falls back to the mid-bucket estimate. */
  anchorAt?: number
}

export interface MoonsState {
  katamba?: MoonInfo
  yavash?: MoonInfo
  xibar?: MoonInfo
  reportedAt: number          // when the moonWindow line arrived (countdown anchor)
  // Most recent OBSERVED sunrise / sunset moments (ms epoch). The sun cycle is
  // periodic in real time (SUN_CYCLE_MINUTES), so one observed transition
  // anchors the phase indefinitely — computeSunPhase() derives live day/night
  // + sun position from these.
  sun?: { riseAt?: number; setAt?: number }
}

// The sun's full cycle is 360 REAL MINUTES rise-to-rise — moonwatch.lic's own
// constant (`minutes_to_next_sun_event`, line 138: `360 - delta - elapsed`).
// Day length is derived from the observed rise→set gap, exactly as the script
// derives it from its two Firebase timestamps; with only one transition
// observed we assume an even 180/180 split until the other lands.
export const SUN_CYCLE_MINUTES = 360

export interface SunPhase {
  day: boolean
  progress: number      // 0..1 through the CURRENT phase (day: rise→set; night: set→rise)
  toNextMin: number     // minutes until the next transition
  phaseMin: number      // total minutes of the CURRENT phase (day length or night length)
  assumed: boolean      // true when the day length is the 180/180 assumption
}

/**
 * The sun, COMPUTED — the authoritative source as of v0.18.4.
 *
 * Wraps `sunPositionAt` (the verbatim moonwatch.lic port in
 * [elanthianSun.ts](src/shared/elanthianSun.ts)) in the `SunPhase` shape the
 * scene already renders. Never "assumed": the day length comes from the game's
 * own per-day-of-year tables rather than the even 180/180 split
 * `computeSunPhase` had to guess at, which is what ran the sun minutes fast.
 *
 * `serverUnixMs` MUST be server time (pitfall #87/B192) — same rule as
 * `moonPhase`, and for the same reason.
 */
export function exactSunPhase(serverUnixMs: number): SunPhase {
  const p = sunPositionAt(serverUnixMs / 1000)
  return {
    day: p.up,
    progress: Math.min(1, Math.max(0, p.progress)),
    toNextMin: Math.max(0, Math.round(p.secondsToNext / 60)),
    phaseMin: Math.round(p.phaseSec / 60),
    assumed: false,
  }
}

/** SUPERSEDED by `exactSunPhase` — kept only until the computed model has been
 *  confirmed against the community site across a full DR year (the observed
 *  anchors it reads are a real-world cross-check we do not want to delete on
 *  day one). Derives the phase from observed sunrise/sunset prose, assuming an
 *  even 180/180 day when it has seen only one transition. That assumption is
 *  the bug: Elanthia's daylight runs 120→240 rois across the seasons. */
export function computeSunPhase(sun: { riseAt?: number; setAt?: number }, now: number): SunPhase | null {
  const cycleMs = SUN_CYCLE_MINUTES * 60_000
  let dayMs = cycleMs / 2
  let assumed = true
  if (sun.riseAt != null && sun.setAt != null) {
    const gap = ((sun.setAt - sun.riseAt) % cycleMs + cycleMs) % cycleMs
    if (gap > 0) { dayMs = gap; assumed = false }
  }
  // Normalize to a rise anchor: a set observation IS the phase point `dayMs`.
  const anchor = sun.riseAt != null
    ? sun.riseAt
    : sun.setAt != null ? sun.setAt - dayMs : null
  if (anchor == null || now < anchor) return null
  const phase = ((now - anchor) % cycleMs + cycleMs) % cycleMs
  const day = phase < dayMs
  const progress = day ? phase / dayMs : (phase - dayMs) / (cycleMs - dayMs)
  const toNextMin = Math.max(0, Math.round(((day ? dayMs - phase : cycleMs - phase)) / 60_000))
  const phaseMin = Math.round((day ? dayMs : cycleMs - dayMs) / 60_000)
  return { day, progress: Math.min(1, progress), toNextMin, phaseMin, assumed }
}

const MOON_KEYS_ALL = ['katamba', 'yavash', 'xibar'] as const

/** True remaining, in minutes, at the instant moonwatch's floored countdown
 *  steps down to N — it steps at `seconds == 60N + 59`, not at `60N`. */
const STEP_TOP_MIN = 59 / 60

// Orbital constants — moonwatch.lic's own `Moons::CONSTANTS` (re-read against
// v4.5.0): `cycle` = rise→rise, `visible` = rise→set, both in SECONDS. These
// are v4.2+'s OLS-FIT FRACTIONAL periods; the script switched to them precisely
// so predicted phase stops drifting, and we carried its PRE-v4.2 rounded
// integers (177/177/174 up, 174/175/172 down) long after. Five of those six
// were SHORT — up to 0.78 min — and since arc position is
// `1 − remaining/duration`, a short duration renders the moon BEHIND the real
// sky. Derived here rather than hand-rounded so the two can never drift again.
const MOON_CYCLE_SEC:   Record<string, number> = { katamba: 21_088.611, yavash: 21_129.564, xibar: 20_848.143 }
const MOON_VISIBLE_SEC: Record<string, number> = { katamba: 10_602,     yavash: 10_624,     xibar: 10_482 }

/** Each moon's time ABOVE the horizon, in minutes (rise→set). */
export const MOON_UP_MINUTES: Record<string, number> = {
  katamba: MOON_VISIBLE_SEC.katamba / 60,
  yavash:  MOON_VISIBLE_SEC.yavash  / 60,
  xibar:   MOON_VISIBLE_SEC.xibar   / 60,
}
/** Each moon's time BELOW the horizon, in minutes (set→next rise). */
export const MOON_DOWN_MINUTES: Record<string, number> = {
  katamba: (MOON_CYCLE_SEC.katamba - MOON_VISIBLE_SEC.katamba) / 60,
  yavash:  (MOON_CYCLE_SEC.yavash  - MOON_VISIBLE_SEC.yavash)  / 60,
  xibar:   (MOON_CYCLE_SEC.xibar   - MOON_VISIBLE_SEC.xibar)   / 60,
}

/**
 * Remaining minutes for a moon RIGHT NOW — continuous, never a stairstep.
 *
 * The old shape subtracted `Math.floor(elapsed / 60_000)`, so the value (and
 * therefore the arc position derived from it) changed only once per whole
 * minute: the moon froze for 60s while the real sky kept moving, then jumped.
 * Because flooring elapsed can only ever HOLD THE MOON BACK, the error was
 * one-sided — 0 → 0.98 min behind, sawtooth, every minute.
 *
 * `anchorAt` (set by `mergeMoonReport` on a clean 1-minute step) is an EXACT
 * moment — but NOT the one you would first guess, and getting this wrong cost
 * a release. The script reports `floor(seconds / 60)`, so the displayed value
 * becomes `M` when `seconds` hits `60M + 59`, i.e. when the true remaining is
 * `M + 59/60` — the TOP of the bucket, very nearly `M + 1`. Anchoring at `M`
 * instead ran the moons a constant minute fast (Lichborne 70m against the
 * website's 71m). Hence STEP_TOP_MIN.
 *
 * Before the first step lands we only know the script floored, i.e. the truth
 * was uniformly somewhere in `[minutes, minutes+1)` — so take the midpoint,
 * which bounds the error at ±0.5 min either way. It self-corrects within 60s,
 * when the moon's own tick arrives.
 *
 * Returns a FLOAT for geometry; round at the point of DISPLAY.
 */
export function moonRemainingMinutes(info: MoonInfo, reportedAt: number, now: number): number {
  const exact = info.anchorAt != null
  const anchor = exact ? info.anchorAt! : reportedAt
  const base = exact ? info.minutes + STEP_TOP_MIN : info.minutes + 0.5
  return Math.max(0, base - (now - anchor) / 60_000)
}

/**
 * Fold a fresh moonwatch report into the previous one, stamping the exact
 * anchor described above.
 *
 * MERGE, never replace — a moon absent from one line (malformed/partial) must
 * never vanish from the sky; its countdown drifts until the next full report,
 * which is the lesser evil. The normal all-three line overwrites everything.
 *
 * The anchor rules, in order:
 *  - same arc, value UNCHANGED → carry the existing anchor. The script also
 *    re-pushes on a 60s heartbeat and whenever ANY of the three ticks, so most
 *    reports do not move a given moon and must not discard its anchor.
 *  - same arc, value stepped down by exactly 1 → the tick just happened, so
 *    NOW is an exact anchor.
 *  - anything else (first sight, or the big jump when a moon rises/sets, where
 *    the new value is floored mid-bucket) → no anchor; estimate until the next
 *    clean step.
 */
export function mergeMoonReport(
  prev: Pick<MoonsState, 'katamba' | 'yavash' | 'xibar'> | null | undefined,
  parsed: Pick<MoonsState, 'katamba' | 'yavash' | 'xibar'>,
  at: number,
): Pick<MoonsState, 'katamba' | 'yavash' | 'xibar'> {
  const out: Pick<MoonsState, 'katamba' | 'yavash' | 'xibar'> =
    { katamba: prev?.katamba, yavash: prev?.yavash, xibar: prev?.xibar }
  for (const k of MOON_KEYS_ALL) {
    const next = parsed[k]
    if (!next) continue
    const before = out[k]
    let anchorAt: number | undefined
    if (before && before.up === next.up) {
      if (before.minutes === next.minutes) anchorAt = before.anchorAt
      else if (before.minutes - next.minutes === 1) anchorAt = at
    }
    out[k] = { up: next.up, minutes: next.minutes, anchorAt }
  }
  return out
}

// ── Lunar phase (F64a, DESIGN §34.9) ────────────────────────────────────────
//
// A PURE function of time. These are the DR CLIENT's own hard-coded constants
// (its `DR_MOONS` sidereal periods and `DR_EPOCH_SKEW_SECONDS`), mined from
// moonwatch.lic v4.5.0 `Moons.phase` and recorded in Knowledge.md §16. They are
// explicitly NOT moonwatch's calibrated synodic constants, so they carry no
// per-character offset and are identical on every instance.
//
// The consequence worth protecting: **phase needs neither Lich nor moonwatch.**
// A direct-SGE player gets correctly-phased moons even though the rise/set
// timers (which DO come from the moonwatch stream) are unavailable to them.
// Don't make any of this depend on `moons` state arriving.
const SIDEREAL_ROIS: Record<string, number> = { katamba: 14_847, xibar: 9_983, yavash: 16_171 }
const PHASE_EPOCH_SKEW_ROIS = 80_895        // client DR_EPOCH_SKEW_SECONDS 4_853_700 / 60
const PHASE_DAYS_PER_YEAR = 400

/** The eight phases in cycle order; index 0 is the [0,45°) bucket. */
export const MOON_PHASE_NAMES = [
  'new', 'waxing crescent', 'first quarter', 'waxing gibbous',
  'full', 'waning gibbous', 'third quarter', 'waning crescent',
] as const

export interface MoonPhase {
  index: number        // 0..7 into MOON_PHASE_NAMES
  name: string
  angle: number        // 0..359 — phase angle; 0 = new, 180 = full
  /** Lit fraction of the disc, 0..1. Drives BOTH the rendered shape and F64's
   *  moonlight strength, so the two can never disagree. */
  illum: number
  /** true while waxing (angle < 180) — which limb is lit. */
  waxing: boolean
  nextName: string
  secondsToNext: number
}

/**
 * A moon's phase at an absolute moment.
 *
 * `serverUnixMs` MUST be server time, not `Date.now()` — this is absolute-time
 * math, so a skewed client clock silently shifts the answer (pitfall #87/B192).
 * Callers get it from `ServerClockEvent`'s offset.
 *
 * Integer division throughout, mirroring the Ruby verbatim — using floats here
 * moves bucket boundaries by up to a few hours.
 */
export function moonPhase(moon: string, serverUnixMs: number): MoonPhase | null {
  const sidereal = SIDEREAL_ROIS[moon]
  if (!sidereal) return null
  const min = Math.floor(serverUnixMs / 60_000)
  const orbital = Math.floor(((min % sidereal) * 360) / sidereal)
  const doy = Math.floor((min + PHASE_EPOCH_SKEW_ROIS) / 360) % PHASE_DAYS_PER_YEAR
  const angle = (orbital + Math.floor((doy * 360) / PHASE_DAYS_PER_YEAR)) % 360
  const index = Math.floor((angle * 8) / 360) % 8
  // Average of the orbital rate and the day-of-year rate — good to a few minutes
  // across a bucket that lasts ~a day, which is all a display in hours needs.
  const rate = (360 / sidereal) + ((360 / PHASE_DAYS_PER_YEAR) / 360)
  return {
    index,
    name: MOON_PHASE_NAMES[index],
    angle,
    illum: (1 - Math.cos((angle * Math.PI) / 180)) / 2,
    waxing: angle < 180,
    nextName: MOON_PHASE_NAMES[(index + 1) % 8],
    secondsToNext: Math.round(((45 - (angle % 45)) / rate) * 60),
  }
}

const MOON_BY_LETTER: Record<string, 'katamba' | 'yavash' | 'xibar'> = { k: 'katamba', y: 'yavash', x: 'xibar' }

/** Parse a moonwatch stream line (`[k]+(90) [y]-(59) [x]-(88)`), or null.
 * The count can be NEGATIVE: moonwatch's timer is `(predicted event − now)`,
 * so in the gap between the predicted and the OBSERVED transition it reports
 * e.g. `[x]-(-2)` ("overdue to rise"). A parser that rejects the minus drops
 * that moon from the report — the original "Xibar vanishes just before it
 * rises" bug. Consumers treat negative remaining as 0 ("any moment"). */
export function parseMoonLine(text: string): Pick<MoonsState, 'katamba' | 'yavash' | 'xibar'> | null {
  const re = /\[([kyx])\]([+-])\((-?\d+)\)/g
  let m: RegExpExecArray | null
  const out: Partial<Record<'katamba' | 'yavash' | 'xibar', MoonInfo>> = {}
  while ((m = re.exec(text)) !== null) {
    out[MOON_BY_LETTER[m[1]]] = { up: m[2] === '+', minutes: parseInt(m[3], 10) }
  }
  return Object.keys(out).length > 0 ? out : null
}

// Sunrise / sunset prose — VERBATIM from moonwatch.lic's own detection (lines
// 210–219); these are the DR ambient lines that announce the transitions.
export const SUN_RISE_RE = /heralding another fine day|rises to create the new day|as the sun rises, hidden|as the sun rises behind it|faintest hint of the rising sun|The rising sun slowly|Night slowly turns into day as the horizon/
export const SUN_SET_RE = /The sun sinks below the horizon|night slowly drapes its starry banner|sun slowly sinks behind the scattered clouds and vanishes|grey light fades into a heavy mantle of black/

// Weather (§34.9 Tier 2) — DR has NO passive weather feed (verified: no XML tag,
// no DRStats field, no community script stores it; the ONLY source is the WEATHER
// command / a natural sky-glance). WEATHER has THREE outcomes (Elanthipedia):
//   1. outdoors                       → "You glance up at the sky." + <conditions>
//   2. indoors WITH a window/door/portal opening out → "You glance outside." + <conditions>
//   3. indoors, fully enclosed        → "That's a bit hard to do while inside."
// So both glance markers (1 & 2) mean "the weather line follows on the NEXT main
// line" — this regex matches EITHER, and we show that line VERBATIM. Case 3 is a
// GENERIC command refusal (other commands emit it too), so it's NOT matched here;
// it's read as "can't see the sky" ONLY inside an explicit ⟳ sync (see GameWindow)
// — otherwise it's ignored and the last-known weather persists with its age.
export const WEATHER_GLANCE_RE = /^You glance (?:up at the sky|outside)\b/

// Last-observed weather line (the prose after a sky-glance) + when we saw it.
export interface WeatherInfo {
  text: string        // verbatim, e.g. "The starry skies above are marred by a few dark clouds."
  observedAt: number  // ms epoch — the footer shows age so stale weather never reads as live
  // Set when a ⟳ sync was answered by DR's "hard to do while inside" refusal —
  // i.e. the sky isn't visible from here. Only ever set from an EXPLICIT sync
  // (the generic refusal is never matched passively — see GameWindow).
  indoor?: boolean
}

// Weather CONDITIONS detected from the prose by keyword (the Moons experience
// renders a matching sky effect: snow/rain/clouds/fog). DR has no structured
// weather, so we classify its ambient sentences — deliberately generous keyword
// sets (Sekmeht). Precipitation implies clouds; `clear` only when nothing else.
export interface WeatherFx {
  clear?: boolean
  clouds?: boolean
  rain?: boolean
  snow?: boolean
  storm?: boolean
  // PARSED BUT NOT DRAWN as of v0.18.2 (Sekmeht: "avoid the fog effect in
  // general") — a haze layer washed the whole scene out rather than reading as
  // weather. The flag is still meaningful and still used: it suppresses shooting
  // stars and floors the cloud cover, because an obscured sky is an obscured sky
  // whether or not we render the murk. See MoonsPrecip.
  fog?: boolean
  wind?: boolean
  heavy?: boolean   // intensity → denser/faster effect
  /** Cloud COVER, 0..1 — how much sky is hidden, from DR's own degree words
   *  ("a few scattered" → "completely overcast"). Drives how many clouds the
   *  scene draws, so severity reads at a glance. Conditions impose a floor: a
   *  storm cannot be a clear sky no matter what adjective precedes it. */
  cover?: number
  /** Precipitation density, 0..1 — "light drizzle" vs "torrential downpour". */
  precip?: number
}

export function detectWeather(text: string): WeatherFx {
  const t = text.toLowerCase()
  const has = (re: RegExp) => re.test(t)
  const fx: WeatherFx = {}
  // Leading `\b` on each set so a keyword only matches at a WORD start — avoids
  // mid-word false positives ("terrain"→rain, "unclear"→clear, "regale"→gale).
  // Stems (drizzl/sprinkl/breez/…) still match their inflections (drizzling, …).
  // `gale` lives ONLY in wind — a gale is strong wind, not a thunderstorm.
  if (has(/\b(snow|flurr|blizzard|sleet|wintry)/))                          fx.snow = true
  if (has(/\b(rain|drizzl|shower|downpour|deluge|sprinkl|pelt)/))           fx.rain = true
  if (has(/\b(storm|thunder|lightning|tempest|squall)/))                    fx.storm = true
  // `cloud(?!less)` — "cloudLESS" is the opposite of cloudy, and matching it as
  // clouds made a cloudless sky render overcast: `clear` is unset further down
  // whenever clouds are set, so the word defeated itself. Found by the severity
  // harness, not by eye.
  if (has(/\b(cloud(?!less)|overcast|dreary|gloom|grey sk|gray sk|leaden|sullen|dark sk)/)) fx.clouds = true
  if (has(/\b(fog|mist|haz[ey]|murk|smog|shroud)/))                         fx.fog = true
  if (has(/\b(wind|breez|gust|blustery|blowing|gale)/))                     fx.wind = true
  if (has(/\b(clear|cloudless|sunny|bright|starry|starlit|fair skies|calm|serene|placid)/)) fx.clear = true
  if (has(/\b(heav|thick|hard|torrential|fierce|driving|strong|violent|raging)/))  fx.heavy = true
  // Precipitation and storms come from clouds; a storm also drives heavy rain.
  if (fx.storm) { fx.rain = true; fx.heavy = true }
  if (fx.snow || fx.rain || fx.storm) fx.clouds = true
  // "Clear" is only truly clear when nothing's in the sky (a "starry sky marred
  // by clouds" mentions both — that's partly-cloudy, not clear).
  if (fx.clouds || fx.rain || fx.snow || fx.storm || fx.fog) fx.clear = false

  // ── SEVERITY (Sekmeht) ────────────────────────────────────────────────────
  // The flags above answer "are there clouds?"; `cover` answers "HOW MANY", so
  // the scene can actually draw "a few scattered clouds" differently from
  // "completely overcast" instead of rendering one fixed cloudbank for both.
  //
  // DR grades its sky prose with degree words, so they are the signal — read
  // MOST SPECIFIC FIRST, because the phrases overlap ("a FEW scattered clouds"
  // contains "scattered"; "very cloudy" and "cloudy" share a stem). The first
  // match wins and the rest are skipped.
  const DEGREES: [RegExp, number][] = [
    [/\b(completely|entirely|totally|utterly|solid|unbroken|blanket)/, 1],
    [/\b(overcast|leaden|sullen|dreary|gloom)/,                        0.92],
    [/\b(very|heav|thick|dense|dark)/,                                 0.85],
    [/\b(mostly|largely|widely)/,                                      0.72],
    [/\b(partly|partially|somewhat|patch|broken|here and there)/,      0.45],
    [/\b(scattered|occasional|drifting|wisp|thin|light|faint)/,        0.3],
    [/\b(a few|few|couple|handful|sparse|slight)/,                     0.2],
  ]
  const degree = DEGREES.find(([re]) => has(re))?.[1]

  // FLOORS: some conditions imply cover regardless of the adjectives, because
  // you cannot have a storm through a clear sky (Sekmeht). A stated degree can
  // still push cover HIGHER than its floor, never lower — "a few clouds" during
  // a thunderstorm is not a description we should believe over "thunderstorm".
  const floor =
      fx.storm ? 0.95
    : fx.snow || fx.rain ? 0.75
    : fx.fog ? 0.5
    : fx.clouds ? 0.35
    : 0
  fx.cover = fx.clear && !fx.clouds ? 0 : Math.max(floor, degree ?? 0)
  // Precipitation density rides the same wording, so "light drizzle" and
  // "torrential downpour" are not the same wall of rain.
  if (fx.rain || fx.snow) fx.precip = Math.max(0.35, fx.heavy ? 0.95 : (degree ?? 0.6))
  return fx
}

// Elanthian calendar (from the TIME command, §34.9 Tier 2). Like weather, DR has
// no passive feed — TIME is a pull. The ⟳ sends it SILENTLY (no echo, reply
// consumed) alongside WEATHER. Line 4 (the skill-dependent fine clock) is not
// modeled. Fields are optional so a partial/verbatim-fallback read still shows.
export interface CalendarInfo {
  year?: number        // 457 — years since the Victory (the A.V. year)
  dayOfYear?: number   // 43  — days into the year
  monthNum?: number    // 2
  monthName?: string   // "Ka'len the Sea Drake"
  yearName?: string    // "Golden Panther"
  season?: string      // "winter"
  timeOfDay?: string   // "evening" — the game's OWN word (complements the sun label)
  observedAt: number   // ms epoch
}

// TIME output templates — DR's fixed sentences; only the fill-in words vary, so
// they parse cleanly (verified against a real TIME capture). Anchored/tolerant
// of trailing punctuation. Line 4 ("You're positive it's N roisaen after the
// Anlas of …") carries a skill-dependent confidence prefix and is deliberately
// NOT parsed (least sky-relevant; would need more samples to model safely).
const TIME_YEAR_RE = /^It has been (\d+) years?, (\d+) days? since the Victory/
const TIME_MONTH_RE = /^It is the (\d+)(?:st|nd|rd|th) month of (.+?) in the year of the (.+?)\.?\s*$/
const TIME_SEASON_RE = /^It is currently (.+?) and it is (.+?)\.?\s*$/

// Parse ONE TIME line into whatever calendar fields it carries; null for a
// non-calendar line. Caller accumulates across the (up to) three matching lines.
export function parseTimeLine(line: string): Partial<CalendarInfo> | null {
  let m = TIME_YEAR_RE.exec(line)
  if (m) return { year: Number(m[1]), dayOfYear: Number(m[2]) }
  m = TIME_MONTH_RE.exec(line)
  if (m) return { monthNum: Number(m[1]), monthName: m[2].trim(), yearName: m[3].trim() }
  m = TIME_SEASON_RE.exec(line)
  if (m) return { season: m[1].trim(), timeOfDay: m[2].trim() }
  return null
}

// The typed cast from main's SceneParser (§35) — GameWindow accumulates the
// scene-cast events into this shape and hands it to every Experience.
export interface SceneCast {
  players: ScenePlayer[]
  creatures: SceneCreature[]
}

// One recent utterance (a scene-speech event + receive timestamp). GameWindow
// keeps a small capped buffer; consumers expire by `ts` (bubbles fade).
export interface SceneSpeechItem {
  id: number
  speaker: string
  // 'emote' rides the same buffer: same TTL/figure-matching, rendered as an
  // action caption under the avatar instead of a bubble (§32.2).
  channel: 'say' | 'yell' | 'whisper' | 'thought' | 'ooc' | 'emote'
  text: string
  toYou?: boolean
  target?: string   // directed-speech recipient ('You' when it's the player)
  ts: number
}

// Shared props bag every Experience component receives from GameWindow.
// Per-session by construction (passed from the owning GameWindow — Principle
// #6). Extend ADDITIVELY when a new Experience needs more game state; never
// raw stream-text where a typed event exists (§34.8 #2).
// One recent arrival/departure (cast-diff event + movement-hint garnish) —
// drives entrance/exit choreography; consumers expire by `ts`.
export interface SceneMoveItem {
  id: number
  name: string
  kind: 'arrive' | 'depart'
  direction?: string
  reason?: 'logoff'
  ts: number
}

// v0.16.x (G1 Combat HUD facet of X1, DESIGN §32.1): live combat state for the
// HUD layers on the Tableau. Timestamps are STABLE epoch-ms expiries — the
// component ticks internally via `useTimers` (like the isolated TimerDisplay),
// so passing these never re-renders GameWindow every frame. stance/hands are
// the foreground readout. Absent for non-combat Experiences (Moons ignores it).
// Phase 1 uses existing typed state only; range/facing (the CombatParser) is
// Phase 2 and adds fields here additively.
export interface ExperienceCombatState {
  rtExpires: number
  ctExpires: number
  aimExpires: number
  stance: string      // '' when unknown
  leftHand: string    // 'Empty' when empty-handed
  rightHand: string
  // Combat position vs opponent, −9…+9 (+ = you lead), parsed from DR's balance
  // status line (combatExtract, Lich #1400). null = never seen; 0 = even.
  position: number | null
  // Combat balance 0…11 (0 = completely imbalanced, 11 = incredibly balanced),
  // the sibling of position on the same line (combatExtract). null = never seen.
  balance: number | null
  // Closest incoming threat's range ("… closes to melee range on you"), or null
  // (combatExtract, corpus-mined). Shown only while combat is live.
  range: CombatRange | null
  // ASSESS snapshot — per-creature tactical positions (facing/flank/behind +
  // range + id), latest first-to-last as the game listed them. Empty when none.
  assess: AssessEntity[]
  // When `assess` was captured (Date.now()); consumers age it out (on-demand).
  assessAt: number
}

// ── Spell Monitor state (Experience #3, v0.19.5) ───────────────────────────
// Source: DR's own `percWindow` stream (aliased to `spells` at the parser —
// streamAliases.ts). It is a clear-and-rewrite STATE stream: every refresh is
// `<clearStream id='percWindow'/>` then one line per active effect, so
// `streamLines.spells` is already an exact mirror of the current block (the
// clear is applied in GameWindow's batch commit) and no accumulator is needed.
//
// A line is `<Name> (<N> roisaen)` — DR writes the singular `roisan` at 1 — or
// carries a non-numeric state instead, e.g. `Trabe Chalice (intact, fading)`.
// 1 roisan = 1 real minute (ROISAN_SECONDS, elanthianTime.ts).
//
// PARSING IS TOLERANT BY DESIGN: an unrecognised shape becomes an UNTIMED
// effect carrying whatever was in the parentheses, never a dropped line — we
// must never silently hide something the game says is on you (Principle #3's
// spirit applied to display).

/** What DR told us about an effect's remaining life. The four non-timed kinds
 *  are NOT interchangeable and must not be collapsed back into one "untimed"
 *  bucket — `fading` is the most urgent state there is, while `permanent` is
 *  the calmest, and lumping them together (the first implementation) rendered
 *  a lapsing spell as quiet background information. */
export type SpellKind = 'timed' | 'fading' | 'permanent' | 'percent' | 'unknown' | 'ended'

export interface SpellEffect {
  /** Effect name, exactly as DR wrote it (minus the trailing parenthetical). */
  name: string
  /** What kind of reading DR gave — see SpellKind. */
  kind: SpellKind
  /** Absolute expiry (epoch ms); null unless `kind === 'timed'`. */
  expiresAt: number | null
  /** Whole roisaen DR last reported (anlaen already converted), else null. */
  roisaen: number | null
  /** A percentage the game stated outright (`Osrel Meraud (94%)`). Unlike `max`
   *  this is a TRUE proportion, so the bar and the band prefer it. */
  percent: number | null
  /** The parenthetical when it carried more than a timer, else null. */
  note: string | null
  /** Highest roisaen ever seen for this effect this session — the denominator
   *  for the duration bar, which DR never tells us (the `rtMaxRef` idea). */
  max: number | null
  /** When DR's block stopped listing this effect, i.e. when we LEARNED it had
   *  ended. Set only on `kind: 'ended'`. */
  endedAt: number | null
}

/** How long a spent effect stays on screen after the game drops it: **one
 *  roisan** (Sekmeht, 2026-09-06) — the game's own unit, which is the right
 *  scale for "you just lost this, recast it" and keeps the list from
 *  accumulating a session's worth of history. Derived from `ROISAN_SECONDS`
 *  rather than written as 60_000, so it stays tied to the unit it means. */
export const SPELL_ENDED_TTL_MS = ROISAN_SECONDS * 1000

export interface SpellState {
  effects: SpellEffect[]
  /**
   * Effects DR has STOPPED listing — the authoritative "this ended" signal
   * (Sekmeht, 2026-09-06), newest first.
   *
   * Our own countdown cannot supply this. The anchor floors DR's whole roisaen,
   * so our clock reaches zero up to a minute EARLY; treating that as "ended"
   * both lies and — because a repaint re-anchors a spell that is still up —
   * flickers. Absence from the next block is the game telling us outright, and
   * it is exactly the moment the first implementation instead DELETED the cell,
   * throwing away the only reliable evidence it ever gets.
   */
  ended: SpellEffect[]
  /**
   * When the block this state came from was received (the countdown anchor).
   *
   * NOT "when the game last pulsed" — the delta gate only commits a new state
   * when something MEANINGFULLY changed, so this can sit still for many minutes
   * while DR repaints constantly. The feed's liveness is a different fact and
   * lives in `SpellPulse`; do not use this to answer "is the feed alive?".
   */
  reportedAt: number
}

/**
 * FEED LIVENESS — when DR last repainted the block, and how often it tends to.
 *
 * Deliberately SEPARATE from `SpellState`, and the separation is the whole
 * point (pitfall #105: volatile tracking data must not share an identity with
 * render data). A pulse timestamp changes on every repaint, whereas the state
 * changes only when the spells actually change — folding the two together
 * would mint a new `SpellState` identity per pulse and re-render EVERY mounted
 * Experience, since Moons and the Tableau receive the same props (pitfall
 * #82c). That is precisely the churn the delta gate exists to prevent.
 *
 * So this rides a REF instead of a prop value: a ref object's identity never
 * changes, so it breaks no memo, and only the one readout that wants it reads
 * it. See `spellsPulse` in ExperienceProps.
 */
export interface SpellPulse {
  /** When the last NON-EMPTY block arrived; 0 before the first one. */
  at: number
  /** Recent inter-arrival gaps in ms, oldest first, capped at SPELL_PULSE_SAMPLES. */
  gaps: number[]
}

/** How many gaps to keep. Enough for a stable median, few enough that the
 *  figure follows a cadence CHANGE within a few pulses rather than averaging
 *  over a session's worth of history. */
export const SPELL_PULSE_SAMPLES = 8

/** Minimum gaps before we'll state a cadence at all. One gap is not a rate,
 *  and a wrong "every ~2s" is worse than saying nothing (Principle #10). */
export const SPELL_PULSE_MIN_SAMPLES = 3

export const emptySpellPulse = (): SpellPulse => ({ at: 0, gaps: [] })

/**
 * Below this, two arrivals are ONE repaint as far as cadence is concerned.
 *
 * DR sends a `clearStream` and then the lines, and main's flush coalescing is
 * LEADING-EDGE on a 16ms window (pitfall #82d) — so when the client is idle the
 * clear flushes immediately and the lines follow in the next batch. That is one
 * repaint reaching us as two arrivals, and counting the ~16ms between them as a
 * cadence sample would drag the median toward zero exactly when the reader is
 * sitting still watching the strip. The timestamp still advances (both really
 * did arrive); only the GAP is discarded.
 *
 * Comfortably above the coalescing window and far below any plausible DR
 * cadence — repaints follow game turns, not milliseconds.
 */
export const SPELL_PULSE_COALESCE_MS = 250

/** Fold a new block arrival into the pulse record. Pure — returns a new value.
 *  The FIRST arrival records no gap (there is nothing to measure from). */
export function recordSpellPulse(prev: SpellPulse, at: number): SpellPulse {
  if (!prev.at) return { at, gaps: [] }
  const gap = at - prev.at
  // Non-positive: the clock moved backwards, or two blocks shared a
  // millisecond. Sub-threshold: one repaint split across two flushes. Neither
  // is a cadence sample, but both are real arrivals — so `at` still advances.
  if (gap <= 0 || gap < SPELL_PULSE_COALESCE_MS) return { at, gaps: prev.gaps }
  return { at, gaps: [...prev.gaps, gap].slice(-SPELL_PULSE_SAMPLES) }
}

/**
 * The typical gap between repaints in ms, or null when we cannot say yet.
 *
 * MEDIAN, not mean: one long pause (you alt-tabbed, the game went quiet) would
 * drag a mean far off the rate you are actually seeing, and the reader is
 * asking "when should I expect the next one?" — which the middle sample answers
 * and the average does not.
 */
export function spellPulseTypicalMs(p: SpellPulse): number | null {
  if (p.gaps.length < SPELL_PULSE_MIN_SAMPLES) return null
  const sorted = [...p.gaps].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** The cadence as it is printed ('every ~6s'), or '' when we cannot say.
 *  Rounded to whole seconds, floored at 1 — DR's repaints are not sub-second
 *  events and "every ~0s" would read as broken. */
export function spellPulseCadenceLabel(p: SpellPulse): string {
  const ms = spellPulseTypicalMs(p)
  if (ms === null) return ''
  return 'every ~' + Math.max(1, Math.round(ms / 1000)) + 's'
}

/** Parse ONE percWindow line into a raw reading, or null for a blank line.
 *  Never returns null for non-blank input — an unrecognised shape still yields
 *  a named effect (see the tolerance note above). */
export interface SpellReading {
  name: string
  kind: SpellKind
  roisaen: number | null
  percent: number | null
  note: string | null
}

/**
 * Parse ONE percWindow line, or null for a blank one. Never returns null for
 * non-blank input — an unrecognised shape still yields a named effect.
 *
 * The shape catalogue is taken from LICH'S OWN PARSER
 * (`lib/common/xmlparser.rb`, the `@dr_active_spell_tracking` branch), whose
 * comments enumerate the real lines verbatim. Mirroring a verified parser
 * rather than inventing one is the Knowledge.md convention, and it is how the
 * four gaps below were found — every one of them was silently mishandled by a
 * first version written from a single captured block:
 *
 *   Landslide (4 roisaen)            timed, plural
 *   Khri Sagacity  (1 roisan)        timed, SINGULAR — DR uses both
 *   Stellar Collector  (0%, 4 anlaen)  ANLAEN: 1 anlas = 30 roisaen
 *   Cure Disease  (Fading)           about to lapse — Lich reads duration 0
 *   Hydra Hex  (Indefinite)          effectively permanent
 *   Persistence of Mana  (OM)        ditto ("Osrel Meraud")
 *   Osrel Meraud  (94%)              a stated percentage, not a time
 *   <barbarian ability>  (…)         "inexact duration verbiage" catch-all
 *
 * Note the DOUBLE SPACE before several parentheticals — `\s*` absorbs it.
 */
export function parseSpellLine(text: string): SpellReading | null {
  const t = text.trim()
  if (!t) return null
  // Trailing parenthetical, if any. Anchored at the END so a name containing
  // parentheses keeps them (only the last group is the status) — Lich takes
  // everything up to the FIRST '(' instead, which would truncate such a name.
  const m = t.match(/^(.*?)\s*\(([^()]*)\)$/)
  if (!m) return { name: t, kind: 'unknown', roisaen: null, percent: null, note: null }
  const name = (m[1].trim() || t)
  const inner = m[2].trim()

  // A percentage may stand alone (`94%`) or lead a compound reading
  // (`0%, 4 anlaen`), so capture it first and let a duration outrank it below:
  // the percentage is a CHARGE level, the duration is when the thing ends.
  const pct = inner.match(/(\d+)\s*%/)
  const percent = pct ? parseInt(pct[1], 10) : null

  // Duration, in either unit DR uses. Singular AND plural roisan/roisaen — a
  // plural-only pattern silently drops every effect in its final minute — and
  // ANLAEN, which a roisaen-only pattern drops entirely (Stellar Collector).
  const dur = inner.match(/(\d+)\s*(roisae?n|anlaen|anlas)\b/i)
  if (dur) {
    const n = parseInt(dur[1], 10)
    const roisaen = /^anla/i.test(dur[2]) ? n * ANLAS_ROISAEN : n
    return { name, kind: 'timed', roisaen, percent, note: percent !== null ? inner : null }
  }

  // "Fading" ALONE is the opposite of untimed: Lich reads it as duration 0, i.e.
  // lapsing right now. Treating it as a quiet note (the first implementation)
  // showed the most urgent thing on screen as calm background information.
  //
  // The anchors are load-bearing and mirror Lich exactly. Its duration group sits
  // immediately after the '(' — `\((?<duration>\d+|Indefinite|OM|Fading)` — so
  // `(Fading)` matches but `(intact, fading)` does NOT; that one falls to Lich's
  // catch-all and reads as long-lived. A liberal `\bfading\b` would have painted
  // every Trabe Chalice permanently red, which is exactly the noise the traffic
  // light exists to avoid. Match the word, not the substring.
  if (/^fading$/i.test(inner)) return { name, kind: 'fading', roisaen: null, percent, note: inner }
  // Indefinite / OM (Osrel Meraud) — Lich reads both as effectively permanent.
  if (/^(indefinite|om)$/i.test(inner)) return { name, kind: 'permanent', roisaen: null, percent: null, note: inner }
  if (percent !== null) return { name, kind: 'percent', roisaen: null, percent, note: inner }
  // Anything else DR chose to say (a Barbarian's "inexact duration verbiage"):
  // keep BOTH halves — the effect is real and the note is what the game said.
  return { name, kind: 'unknown', roisaen: null, percent: null, note: inner || null }
}

/** One line's worth of what `deriveSpellState` needs — structurally satisfied
 *  by `TextLine` without importing it (keeps this module free of the renderer
 *  line model, so the harness can drive it with plain objects). */
export interface SpellSourceLine {
  segments: { text: string }[]
  timestamp: number
}

/** Whole real minutes one roisan is worth, in ms (1 roisan = 1 real minute —
 *  elanthianTime.ts is the platform-wide reference; never hardcode 60_000). */
const ROISAN_MS = ROISAN_SECONDS * 1000

/**
 * Turn one percWindow block into `SpellState`, or return null when the reading
 * is MATERIALLY THE SAME as `prev` (see the delta gate below).
 *
 * PURE — it neither reads nor writes a ref (pitfall #70: the impure memo that
 * mutated refs mid-render double-counted under StrictMode). The caller owns the
 * `maxByName` record and commits whatever comes back, in ONE effect.
 *
 * Expiries anchor on each LINE'S OWN `timestamp` — its RECEIPT time — rather than
 * one `Date.now()` for the whole block. Note what that does NOT buy: `mkLine` in
 * GameWindow stamps `Date.now()` and ignores the `timestamp` the StreamTextEvent
 * carries, so a pitfall-#60 REPLAY re-dates the block to the replay moment and
 * every remaining time is inflated by however stale the replayed block was. That
 * error is bounded and self-correcting — the gate below compares reported against
 * predicted, an inflated anchor makes predicted exceed reported, and the state
 * re-anchors as soon as the gap passes a roisan (i.e. on DR's next repaint). Making
 * it truly replay-correct means teaching `mkLine` to use `evt.timestamp`, which
 * changes every stream's timestamp display and is deliberately out of scope here.
 *
 * THE DELTA GATE (returning null) is what keeps this cheap. DR repaints the
 * whole block on its own cadence, and a repaint that merely confirms 29 → 28
 * tells us nothing our own clock doesn't already know. Committing a new object
 * for it would mint a fresh prop identity on the shared Experience props bag —
 * re-rendering every mounted Experience (pitfall #82c) — and re-anchor every
 * countdown, which reads as jitter. So we commit only on a real change: the
 * effect set changed, a note changed, a max grew, or a timer diverged from what
 * we predicted by more than a roisan (a recast, or genuine drift).
 */
export function deriveSpellState(
  lines: readonly SpellSourceLine[],
  maxByName: Readonly<Record<string, number>>,
  prev: SpellState | null,
): { state: SpellState; maxByName: Record<string, number> } | null {
  const reportedAt = lines.length > 0 ? lines[lines.length - 1].timestamp : Date.now()
  const nextMax: Record<string, number> = { ...maxByName }
  let maxGrew = false
  const effects: SpellEffect[] = []
  for (const line of lines) {
    const parsed = parseSpellLine(line.segments.map(s => s.text).join(''))
    if (!parsed) continue
    let max: number | null = null
    if (parsed.roisaen !== null) {
      const seen = nextMax[parsed.name]
      // A recast RAISES the ceiling; it never falls while the effect is up, so
      // the bar reads as genuinely draining and refilling rather than rescaling
      // under you. (DR never tells us a spell's full duration — this is the
      // only way to have a denominator at all.)
      if (seen === undefined || parsed.roisaen > seen) { nextMax[parsed.name] = parsed.roisaen; maxGrew = true }
      max = nextMax[parsed.name]
    }
    effects.push({
      name: parsed.name,
      kind: parsed.kind,
      roisaen: parsed.roisaen,
      percent: parsed.percent,
      note: parsed.note,
      expiresAt: parsed.roisaen === null ? null : line.timestamp + parsed.roisaen * ROISAN_MS,
      max,
      endedAt: null,
    })
  }

  // DEPARTURES — the authoritative end-of-effect signal. Anything the previous
  // block listed that this one does not has ended, and the game just said so.
  // Prior `ended` entries carry forward, except any that CAME BACK (a recast
  // reappears in the block and must not also sit in the graveyard) or that have
  // aged past the TTL, which bounds the list without needing a timer anywhere.
  const liveNames = new Set(effects.map(e => e.name))
  const departed: SpellEffect[] = (prev?.effects ?? [])
    .filter(e => !liveNames.has(e.name))
    .map(e => ({ ...e, kind: 'ended' as const, expiresAt: null, endedAt: reportedAt }))
  const carried = (prev?.ended ?? []).filter(e =>
    !liveNames.has(e.name) && reportedAt - (e.endedAt ?? 0) < SPELL_ENDED_TTL_MS)
  // Newest first, and a name appears once: a fresh departure supersedes any
  // older record of the same effect.
  const departedNames = new Set(departed.map(e => e.name))
  const ended = [...departed, ...carried.filter(e => !departedNames.has(e.name))]

  const state: SpellState = { effects, ended, reportedAt }
  if (!prev) return { state, maxByName: nextMax }
  // A departure or a return is always meaningful — the gate must never swallow
  // the one signal that tells us something ended.
  if (departed.length > 0 || (prev.ended ?? []).length !== ended.length) return { state, maxByName: nextMax }
  if (maxGrew || prev.effects.length !== effects.length) return { state, maxByName: nextMax }
  // Compare BY NAME, not by index. An index-paired comparison silently assumes
  // DR emits the block in a stable order — an assumption we have never verified,
  // and one that fails the moment the game sorts by remaining time (the entries
  // would cross as they tick). Under that assumption the gate degrades to
  // "commit on every repaint", i.e. exactly the churn it exists to prevent, with
  // nothing to show that it stopped working. Keying by name removes the
  // assumption outright, and costs nothing: the consumer sorts for display, so
  // the order DR chose is not information we carry.
  const prevByName = new Map(prev.effects.map(e => [e.name, e]))
  for (const a of effects) {
    const b = prevByName.get(a.name)
    if (!b || a.note !== b.note) return { state, maxByName: nextMax }
    // A KIND change is always meaningful — 'timed' → 'fading' is a spell about
    // to lapse, and the gate must never swallow that.
    if (a.kind !== b.kind || a.percent !== b.percent) return { state, maxByName: nextMax }
    if ((a.expiresAt === null) !== (b.expiresAt === null)) return { state, maxByName: nextMax }
    if (a.expiresAt !== null && b.expiresAt !== null) {
      // What the PREVIOUS anchor says should be left, at the moment DR reported.
      const predicted = (b.expiresAt - reportedAt) / ROISAN_MS
      if (Math.abs(predicted - (a.roisaen ?? 0)) > 1) return { state, maxByName: nextMax }
    }
  }
  return null   // same reading — keep prev, so its identity (and countdowns) hold
}

/** How far through its life an effect is, as a traffic light. Named for the
 *  `--vital-health-{ok,mid,crit}-*` ramp it renders in — a draining spell is the
 *  same idea as a draining health bar, and reusing that ramp means the Spell
 *  Monitor inherits both the per-theme values and the COLOUR-BLIND rewrite
 *  (`applySettingsToDOM` turns `ok` teal for deuteranopia) for free. */
export type SpellBand = 'none' | 'ok' | 'mid' | 'crit'

// Proportional thresholds — "green when full, yellow midway, red near the end".
const BAND_MID_FRAC  = 0.5
const BAND_CRIT_FRAC = 0.2
// Absolute thresholds, in roisaen/minutes remaining. These are the SAFETY NET
// below; they are not the primary signal.
const BAND_MID_MIN  = 5
const BAND_CRIT_MIN = 1

const BAND_RANK: Record<SpellBand, number> = { none: 0, ok: 1, mid: 2, crit: 3 }

/**
 * The band an effect should render in — the MORE URGENT of a proportional and
 * an absolute reading.
 *
 * WHY BOTH, and why this is not over-engineering: the proportion's denominator
 * is LEARNED (`max` = the highest reading we have ever seen), because DR never
 * states a spell's full duration. On the first block after you connect, every
 * effect has `max === its current reading` — so a purely proportional band
 * paints the WHOLE GRID GREEN, including a buff with two minutes left. That is
 * the normal startup state, not an edge case, and it is exactly the moment the
 * display most needs to be right.
 *
 * So the absolute reading acts as a floor that cannot be fooled by a denominator
 * we had to guess, while the proportion supplies the gradient across a spell's
 * life. Taking the worse of the two is always defensible: an effect is only ever
 * shown as calmer than it is if BOTH readings agree it is calm.
 */
export function spellBand(effect: SpellEffect, now: number): SpellBand {
  // Already gone — spent, not urgent. The cell greys out instead, so a
  // traffic-light colour here would fight that.
  if (effect.kind === 'ended') return 'none'
  // DR said this one is lapsing right now — the most urgent thing on screen,
  // and no arithmetic can improve on the game saying so outright.
  if (effect.kind === 'fading') return 'crit'
  // Permanent effects never run down, so a traffic light would be noise.
  if (effect.kind === 'permanent') return 'none'
  // A STATED percentage beats the learned ceiling: it is a true proportion,
  // where `max` is only "the most we have happened to see".
  if (effect.expiresAt === null) {
    // `!= null` and a finiteness guard, not `=== null`: an effect arriving
    // without the field (an older shape, a hand-built object) made `undefined`
    // slip past a strict check, and NaN then failed every threshold and landed
    // on 'ok' — the CALMEST band. A missing reading must fail toward "no
    // colour", never toward "this one is fine".
    if (effect.percent == null || !Number.isFinite(effect.percent)) return 'none'
    const f = effect.percent / 100
    return f <= BAND_CRIT_FRAC ? 'crit' : f <= BAND_MID_FRAC ? 'mid' : 'ok'
  }
  const leftMin = (effect.expiresAt - now) / (ROISAN_SECONDS * 1000)
  const abs: SpellBand = leftMin <= BAND_CRIT_MIN ? 'crit' : leftMin <= BAND_MID_MIN ? 'mid' : 'ok'
  // No learned ceiling yet ⇒ no meaningful proportion; lean entirely on `abs`.
  const frac = effect.max ? leftMin / effect.max : 1
  const prop: SpellBand = frac <= BAND_CRIT_FRAC ? 'crit' : frac <= BAND_MID_FRAC ? 'mid' : 'ok'
  return BAND_RANK[abs] >= BAND_RANK[prop] ? abs : prop
}

/** Display order: what is lapsing first, then what is running out soonest, then
 *  the readings that carry no countdown, with permanents last — they are
 *  background, not something you are waiting on. */
export function spellSortRank(e: SpellEffect): number {
  switch (e.kind) {
    case 'fading':    return 0
    case 'timed':     return 1
    case 'percent':   return 2
    case 'unknown':   return 3
    case 'permanent': return 4
    // Spent effects fall to the BOTTOM. They are a reminder to recast, not
    // something counting down, and they are greyed — floating them to the top
    // would fight that de-emphasis.
    case 'ended':     return 5
  }
}

// Group order for the Spell Monitor's "Group by skill" layer. FIXED, not derived
// from what is currently up: a group list that re-orders itself as effects come
// and go would reshuffle the grid while you are reading it — the same churn that
// made "Soonest first" opt-in. Magic skills lead in the order DR itself tends to
// list them, then the supplementary caster categories, then the Barbarian/Bard
// ability types. No character sees both halves in bulk (a Bard is the only
// overlap, with Screams), so one flat order serves every guild.
const SPELL_GROUP_ORDER = [
  'Augmentation', 'Utility', 'Warding', 'Debilitation', 'Targeted Magic',
  'Cantrip', 'Metamagic',
  'Form', 'Berserk', 'Meditation', 'Roar', 'Scream',
]
/** Bucket for anything absent from the badge table — Thief Khri above all, who
 *  have no entry at all, so grouping is inert for them and everything lands
 *  here. It sorts last, and it is a real bucket rather than a dropped effect. */
export const SPELL_GROUP_OTHER = 'Other'

export interface SpellGroup {
  label: string
  /** Badge letter for the group, '' when unknown. */
  badge: string
  effects: SpellEffect[]
}

/**
 * Partition effects into display groups, in the fixed order above.
 *
 * Takes the lookup as a PARAMETER rather than importing the generated table, so
 * this stays pure and harnessable and `experiences.ts` gains no dependency on
 * `spellData.ts`. WITHIN a group the caller's order is preserved untouched —
 * which is what lets this compose with "Soonest first" instead of fighting it:
 * sort first, then group, and each group is internally sorted too.
 */
export function groupSpells(
  effects: readonly SpellEffect[],
  ref: (name: string) => { b: string; l: string } | undefined,
): SpellGroup[] {
  const map = new Map<string, SpellGroup>()
  for (const e of effects) {
    const r = ref(e.name)
    const label = r?.l ?? SPELL_GROUP_OTHER
    let g = map.get(label)
    if (!g) { g = { label, badge: r?.b ?? '', effects: [] }; map.set(label, g) }
    g.effects.push(e)
  }
  return [...map.values()].sort((a, b) => {
    const ia = SPELL_GROUP_ORDER.indexOf(a.label)
    const ib = SPELL_GROUP_ORDER.indexOf(b.label)
    // Anything not in the fixed order (Other, or a category Lich adds later that
    // we have not placed yet) sorts last, alphabetically among its peers — so a
    // new label appears predictably at the end rather than silently first.
    if (ia === -1 && ib === -1) return a.label.localeCompare(b.label)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

/**
 * What a cell prints for "time remaining". WHOLE MINUTES, never seconds: DR
 * reports whole roisaen, so `29:00` would claim a precision the game never gave
 * us. The non-timed kinds each show the game's OWN word rather than a faked
 * duration.
 *
 * Pure and exported (rather than living in the component) so it can be locked
 * alongside `spellNoteText` — the pair is what produced a real display bug, and
 * neither reads correctly in isolation.
 */
/**
 * STAGE ONE of the two-stage end (Sekmeht, 2026-09-06): our countdown has run
 * out, but the game is STILL listing the effect.
 *
 * This is not the same fact as `kind: 'ended'` and the two must stay separate.
 * This one says *"the time we were told has elapsed"* — worth seeing, because it
 * is the moment you would act. `ended` says *"the game has stopped listing it,
 * so it is genuinely no longer in effect"* — the confirmation. Only the second
 * is authoritative: DR floors its roisaen, so at "1 roisan" up to 59 further
 * seconds may remain, and a repaint can legitimately hand this cell more time
 * and send it back to counting down.
 */
export function spellExpired(e: SpellEffect, now: number): boolean {
  return e.kind === 'timed' && e.expiresAt !== null && e.expiresAt <= now
}

export function spellRemainingLabel(e: SpellEffect, now: number): string {
  // Stage two — the game stopped listing it. Confirmed gone.
  if (e.kind === 'ended')     return 'ended'
  if (e.kind === 'fading')    return 'fading'
  if (e.kind === 'permanent') return '∞'
  if (e.kind === 'percent')   return String(e.percent) + '%'
  if (e.expiresAt === null)   return ''
  // Stage one — our countdown reached zero while the game still lists it. Said
  // outright rather than left as "<1m", because the timer running out is itself
  // the thing you are watching for. It may flick back to a count if the game
  // then reports more time; that is the floor tolerance showing, not an error.
  if (spellExpired(e, now))   return 'expired'
  const left = (e.expiresAt - now) / (ROISAN_SECONDS * 1000)
  if (left <= 1) return '<1m'
  return Math.floor(left) + 'm'
}

/**
 * How long a SPENT cell has left before it clears itself, in ms — or null when
 * the effect is not spent (or carries no `endedAt`, which a hand-built object
 * might not).
 *
 * This countdown is OURS, and that is what makes it honest to show in SECONDS
 * while every other time in this window is whole minutes. The minutes rule
 * exists because DR reports whole roisaen, so a ticking `28:04` would claim a
 * precision the GAME never gave us — but the one-roisan grace is measured by
 * `endedAt`, a timestamp we stamped ourselves, against a constant we chose.
 * We know it to the millisecond, so a second-resolution countdown states
 * exactly what we know and no more. Do not "align" it to the minutes rule.
 *
 * Returns null rather than 0 at the boundary: at that moment `liveSpellEffects`
 * has already dropped the cell, so there is nothing left to label.
 */
export function spellEndedRemainingMs(e: SpellEffect, now: number): number | null {
  if (e.kind !== 'ended' || e.endedAt === null) return null
  const left = e.endedAt + SPELL_ENDED_TTL_MS - now
  return left > 0 ? left : null
}

/** The spent cell's clear-out countdown as it is printed, or '' for none.
 *  Seconds, rounded UP, so it counts 60 → 1 and never shows a bare "0s". */
export function spellEndedCountdownLabel(e: SpellEffect, now: number): string {
  const left = spellEndedRemainingMs(e, now)
  return left === null ? '' : Math.ceil(left / 1000) + 's'
}

/**
 * What the game's parenthetical adds beyond the label, or '' for none. It used
 * to print as its own row under the name; since v0.19.7 `spellSlotText` decides
 * where it goes, so a cell never grows a second line.
 *
 * The note exists to add what the LABEL does not already say. For a `fading` or
 * bare-percentage reading the parenthetical IS the label — "Fading" under
 * "fading", "94%" under "94%" — and rendering both repeated the word
 * (Sekmeht's `Tenebrous Sense (Fading)` screenshot).
 *
 * The test is a case-insensitive comparison against the label, NOT a switch on
 * `kind`, because a COMPOUND reading has to survive: "0%, fading" against a
 * "0%" label genuinely adds the word fading. Permanents are excluded outright —
 * their ∞ says it, and the exact word is in the tooltip.
 */
export function spellNoteText(e: SpellEffect, label: string): string {
  const note = e.note?.trim() ?? ''
  if (!note || e.kind === 'permanent') return ''
  return note.toLowerCase() === label.trim().toLowerCase() ? '' : note
}

/**
 * The ONE piece of text a cell's time slot shows (v0.19.7).
 *
 * A cell is always a single line plus a bar slot. It used to grow a second row
 * for the note, and because a grid row takes the height of its tallest cell,
 * one note stretched every cell beside it (Sekmeht's screenshot: a spent cell's
 * leftover "Fading" grew the whole row).
 *
 * So the note no longer gets a row. Where the game's parenthetical says MORE
 * than our label, it takes the slot instead: for fading, percent and unknown
 * readings the note is the fuller statement of the same reading ("0%, fading",
 * "intact, fading").
 * - A TIMED effect keeps its ticking minutes. Its note is a snapshot beside a
 *   live countdown, and the one fact it adds (a charge level) goes to
 *   `spellSlotAside`.
 * - A SPENT one keeps "ended". Its last reading no longer applies.
 * Nothing is lost either way: the cell's tooltip carries the full parenthetical.
 */
export function spellSlotText(e: SpellEffect, now: number): string {
  const label = spellRemainingLabel(e, now)
  if (e.kind === 'timed' || e.kind === 'ended') return label
  return spellNoteText(e, label) || label
}

/**
 * The small secondary reading beside the slot, or '' for none:
 * - a spent cell's clear-out countdown ("34s");
 * - a timed effect's stated charge level (`0%, 4 anlaen` → "0%"), the one fact
 *   its note adds to the minutes.
 */
export function spellSlotAside(e: SpellEffect, now: number): string {
  if (e.kind === 'ended') return spellEndedCountdownLabel(e, now)
  if (e.kind === 'timed' && e.percent !== null) return e.percent + '%'
  return ''
}

/**
 * What to render: everything DR currently lists, plus — when the ⚙ "Ended
 * effects" layer is on — the recently-departed entries, greyed.
 *
 * NOTE what is NOT filtered here: a timed effect whose anchor has run past is
 * still returned. An earlier version dropped it, which was a guess dressed as a
 * fact — our anchor floors DR's roisaen, so the clock can hit zero while the
 * spell is comfortably still up. The game listing it is the evidence it is
 * live; the game dropping it is the evidence it is not. Neither is ours to
 * invent.
 */
export function liveSpellEffects(state: SpellState | undefined, now: number, includeEnded = false): SpellEffect[] {
  if (!state) return []
  if (!includeEnded) return [...state.effects]
  return [
    ...state.effects,
    ...state.ended.filter(e => now - (e.endedAt ?? 0) < SPELL_ENDED_TTL_MS),
  ]
}

export interface ExperienceProps {
  character: string
  /** This character's id (account::character::game) — for lookups a name can't
   *  answer, e.g. its chosen colour when two of your characters share a name. */
  characterId?: string
  roomState: RoomState
  sceneCast: SceneCast
  speech: SceneSpeechItem[]
  moves: SceneMoveItem[]
  // The player's own indicator states (hidden/invisible/bleeding/dead/… —
  // lowercase ids, pitfall #15; the same state the Icon Bar renders) so the
  // self figure can wear them.
  indicators: Record<string, boolean>
  contacts: Contact[]
  contactTemplates: ContactTemplate[]
  settings: AppSettings
  isActive: boolean
  // Open the contact CARD (the same ContactPopover in-text name clicks use)
  // at the given screen position — contact figures in a scene are clickable.
  onOpenContact?: (contactId: string, x: number, y: number) => void
  // Send a game command as if the user issued it (echoes + logs, pitfall #86) —
  // for user-initiated actions inside an Experience, e.g. clicking a creature to
  // `face #id` from the combat arena. NOT for automation (AI never sends).
  onCommand?: (cmd: string) => void
  // v0.14.7: content layers the user toggled OFF via the window's ⚙ popover
  // (option-id → true; see ExperienceDef.options). Absent = show everything.
  hidden?: Record<string, boolean>
  // v0.15.0 (Weather & Moons): the parsed moonwatch state + observed sun
  // transitions. Absent until a moonWindow line has arrived this session.
  moons?: MoonsState
  /** DR's clock minus ours, in ms (F64a). Add to `Date.now()` for server time.
   *  Lunar phase is absolute-time math, so it must not run on the user's clock
   *  (pitfall #87 / B192). 0 = no prompt seen yet, i.e. assume they agree. */
  serverClockOffsetMs?: number
  // v0.16.x (G1 Combat HUD facet): live combat state for the Tableau's HUD
  // layers (readiness rings / threat markers / danger frame / stance+hands).
  combat?: ExperienceCombatState
  // v0.17.0 (Moons Tier 2): last-observed weather line, captured off the stream
  // after a sky-glance. Absent until the first glance/WEATHER this session.
  weather?: WeatherInfo
  // v0.17.0 (Moons Tier 2): last-observed Elanthian calendar (from TIME).
  calendar?: CalendarInfo
  // v0.19.5 (Spell Monitor, Experience #3): the parsed percWindow readout —
  // every effect currently on you with an absolute expiry. Derived in
  // GameWindow from `streamLines.spells` and only re-committed on a real
  // change (see deriveSpellState's delta gate), so its identity is stable
  // across DR's redundant repaints. Absent until the first block arrives,
  // which is what drives the component's empty state.
  spells?: SpellState
  // FEED LIVENESS, carried by REF on purpose (see SpellPulse). The value inside
  // changes on every repaint; the ref object never does, so passing it breaks
  // no memo and costs the other Experiences nothing. A component reading it
  // must own a clock that re-renders it — a ref write triggers no render.
  spellsPulse?: { current: SpellPulse }
  // Refresh the sky info: SILENTLY send TIME + WEATHER (no echo, replies consumed)
  // and arm the indoor-refusal window. One click updates both readouts.
  onSyncSky?: () => void
}

// A user-toggleable content layer of an Experience (v0.14.7, Sekmeht: "click
// checkboxes for data they want to see, for example Thoughts on/off").
// Registry-driven like everything else: the ExperienceLayer's ⚙ popover
// renders one checkbox per entry; the component gates on
// `hidden[option.id]`. All layers default VISIBLE (hidden map empty).
export interface ExperienceOptionDef {
  id: string
  label: string
  desc: string   // tooltip — the UI explains itself (polish standard #8)
  // Layers default VISIBLE. Set true to default a layer OFF (still user-toggleable);
  // the `hidden` map only stores explicit choices, so the default is respected when
  // the key is absent (see `optionShown` / `defaultHiddenMap`).
  defaultHidden?: boolean
}

// Is an option's layer currently SHOWN? Respects `defaultHidden` when the user
// hasn't explicitly toggled it (key absent). Use everywhere the ⚙ checkbox
// checked-state and the component gating are derived, so they always agree.
export function optionShown(hidden: Record<string, boolean> | undefined, opt: { id: string; defaultHidden?: boolean }): boolean {
  const v = hidden?.[opt.id]
  return v === undefined ? !opt.defaultHidden : !v
}

// The seed `hidden` map for a NEW instance — only the default-OFF layers, stored
// explicitly so the default persists into the profile.
export function defaultHiddenMap(def: ExperienceDef): Record<string, boolean> {
  const h: Record<string, boolean> = {}
  for (const o of def.options ?? []) if (o.defaultHidden) h[o.id] = true
  return h
}

export interface ExperienceDef {
  id: string                  // own id space, disjoint from streams/panels
  label: string               // user-facing name shown on the shelf
  kind: 'instrument' | 'scene'
  desc: string                // one-liner for the shelf catalog row
  component: ComponentType<ExperienceProps>
  defaultRect: FloatRect      // fractional, like FloatWindow rects (§33.2)
  /**
   * Resize FLOOR in px, when the shared panel minimum is wrong for this scene.
   *
   * A floating Experience is `kind: 'panel'`, so it inherits `MIN_WIN_PX`
   * (180×110) — sized for a panel of text, and too tall for an instrument whose
   * natural shape is a STRIP. The chrome bars hit exactly this and got per-kind
   * floors for it (`minSizeFor` in freeLayout.ts); this is the same escape
   * hatch declared per Experience instead, because "how short can this usefully
   * be?" is a property of the SCENE, not of the window kind.
   *
   * Only declare one for a scene that genuinely wants to be thin. A sky or a
   * tableau needs height to mean anything, and the default floor is a fair
   * guard against dragging one into an unusable sliver.
   */
  minSize?: { w: number; h: number }
  chrome: 'standard' | 'compact'  // compact = minimal chrome for HUD instruments (future)
  multiInstance?: boolean     // default false; reserved (the model allows it)
  // Optional maturity/status badge shown on the shelf row and in the window
  // title — e.g. 'Beta' while an Experience is still under tester iteration.
  badge?: string
  // Toggleable content layers (the ⚙ popover). Omit for none.
  options?: ExperienceOptionDef[]
  // REQUIRED (§32.4 accessibility contract): what existing text/state surface
  // carries the same information. Shown on the shelf row.
  textEquivalent: string
}

export const EXPERIENCES: ExperienceDef[] = [
  {
    id: 'tableau',
    label: 'Living Tableau',
    kind: 'scene',
    desc: 'Your room as a living scene — everyone present becomes an avatar in their contact colors, with speech bubbles, choreographed arrivals and departures, and a combat cockpit when you fight.',
    component: TableauExperience,
    defaultRect: { x: 0.22, y: 0.08, w: 0.52, h: 0.58 },
    chrome: 'standard',
    badge: 'Beta',
    options: [
      { id: 'speech',    label: 'Speech bubbles', desc: 'Says and OOC as comic bubbles by each speaker.' },
      { id: 'yells',     label: 'Yells',          desc: 'Yelled speech (bigger, louder bubbles).' },
      { id: 'whispers',  label: 'Whispers',       desc: 'Whispers as dotted, private bubbles.' },
      { id: 'thoughts',  label: 'Thoughts',       desc: 'Gweth/telepathy as wisps drifting at the edges.' },
      { id: 'emotes',    label: 'Emotes',         desc: 'Action captions under the acting figure.' },
      { id: 'creatures', label: 'Creatures',      desc: 'Creature figures lining the back of the scene.' },
      { id: 'moves',     label: 'Arrivals & departures', desc: 'Walk-ins from their direction and fading ghosts on the way out.' },
      // Combat HUD facet (G1, DESIGN §32.1) — layers auto-reveal while combat is
      // live (a roundtime/cast/aim timer or a wound condition is active).
      { id: 'readiness', label: 'Readiness ring',  desc: 'Roundtime sweeps as a ring hugging your figure (with thin cast/aim arcs) so you can see when you can act.' },
      { id: 'threat',    label: 'Threat markers',  desc: 'In the ASSESS view, creatures at melee range flare as engaged (actively attacking you). Harmless bystanders are never flagged.' },
      { id: 'danger',    label: 'Danger pulse',    desc: 'Your figure pulses in alarm when you are stunned, webbed, bleeding, poisoned or diseased.' },
      { id: 'position',  label: 'Combat gauges',   desc: 'A readout under your figure with balance and position meters (foe ↔ even ↔ you) and the closest incoming threat\'s range.' },
    ],
    textEquivalent: 'The main window and Room panel: "Also here:" players, "You also see" creatures, and the comms streams carry everything the scene shows; the vitals/timer bar and icon bar carry the combat state (roundtime, cast, aim, stance, hands and conditions).',
  },
  {
    // Renamed "Weather & Moons" → "Moons" (Sekmeht, 2026-07-08). The id stays
    // 'moons' (persisted instances + `exp:moons` tabs reference it). Distinct
    // from moonwatch's "Moons" STREAM by the [e] badge (+ menu AND tab strip).
    id: 'moons',
    label: 'Moons',
    kind: 'instrument',
    desc: 'Elanthia\'s sky as a living dial — the three moons and the sun arc across the heavens with live rise/set countdowns, weather, and the Elanthian date. Powered by the community moonwatch script.',
    component: MoonsExperience,
    defaultRect: { x: 0.3, y: 0.05, w: 0.4, h: 0.34 },
    chrome: 'standard',
    badge: 'Beta',
    // One option per visual LAYER, each accurate about exactly what it hides
    // (v0.15.1, Sekmeht: "why would I want sun & sky?" — the old combined
    // toggle conflated hiding the sun with flattening the backdrop).
    options: [
      { id: 'sun',        label: 'The Sun',            desc: 'The sun itself — riding the sky arc by day, sinking behind the horizon at sunset and hidden through the night.' },
      { id: 'sunglow',    label: 'Sun glow & twilight', desc: 'The warm glow that follows the sun across the sky, plus the afterglow that lingers at dusk and the faint light that returns before dawn.' },
      { id: 'rays',       label: 'Sunrise / sunset rays', desc: 'Light beams at sunrise and shadow rays at sunset, fanning across the landscape from the sun\'s point on the horizon. (Epilepsy-safe disables the shimmer.)' },
      { id: 'sky',        label: 'Living sky',         desc: 'The backdrop that follows the day: bright at noon, warm at sunrise and sunset, starry at night. Off = a neutral dusk sky.' },
      { id: 'moonglow',   label: 'Moon glow',          desc: 'A soft glow around each moon in its own lore colour — ruby Yavash, silver-blue Xibar, dusky Katamba.' },
      { id: 'sunlight',   label: 'Sun-lit moons',      desc: 'Each moon lit from the sun\'s direction, with a bright side fading to a shadowed one (a terminator). Off = evenly-lit discs.' },
      { id: 'phase',      label: 'Moon phases',        desc: 'Each moon shows its true shape — crescent, quarter, gibbous or full — computed from Elanthia\'s own orbits, and brightens as it fills: a full moon floods the sky, a thin crescent barely marks it. Off = evenly-lit whole discs. Works without Lich or moonwatch.' },
      { id: 'pill',       label: 'At-a-glance panel',  desc: 'The frosted panel above the footer showing the Sun and three moons with the time to each one\'s next rise or set.' },
      { id: 'countdowns', label: 'Countdown labels',   desc: 'The "sets in 88m" / "rises in 152m" chips under each body. Off by default — the at-a-glance panel already shows these.', defaultHidden: true },
      { id: 'names',      label: 'Name labels',        desc: 'The Katamba / Yavash / Xibar / Sun name plates on each body. Off by default — the at-a-glance panel already names them.', defaultHidden: true },
      { id: 'horizon',    label: 'Horizon silhouette', desc: 'The mountain ridgeline along the horizon.' },
      { id: 'landscape',  label: 'Trees & water',      desc: 'A nature scene below the horizon — a distant forest, foreground trees, a winding stream and a reflective lake, lit by day and dark by night. Always shown (no TIME check needed); seasons dress it further.' },
      { id: 'seasonal',   label: 'Seasonal touches',   desc: 'Dresses the landscape by season — snow, snow-capped trees and an iced-over lake in winter; blossoms in spring; lush greens and fireflies on summer nights; autumn colours and falling leaves. (Needs the season from a TIME check; epilepsy-safe / Effects-off disables the moving parts.)' },
      { id: 'effects',    label: 'Rise & set effects', desc: 'The gentle horizon rings while a body rises or sets, plus star twinkle and the occasional shooting star. (The epilepsy-safe accessibility setting also disables these.)' },
      { id: 'weather',    label: 'Weather',            desc: 'The last sky prose you observed (after WEATHER or any sky-glance), shown verbatim. Click ⟳ to check the weather now.' },
      { id: 'weatherfx',  label: 'Weather effects',    desc: 'Live sky animation matching the detected weather — falling snow or rain, drifting clouds, an overcast deck. (The epilepsy-safe accessibility setting also disables these.)' },
      { id: 'calendar',   label: 'Calendar',           desc: 'The Elanthian date, month, year, season and time of day (from the TIME command). Click ⟳ to refresh — it and the weather are checked silently.' },
    ],
    textEquivalent: 'The Moons stream panel (moonwatch\'s own window) and `perceive moons`; sunrise/sunset announce themselves in the main window; weather is the WEATHER command / any sky-glance.',
  },
  {
    // Experience #3 (v0.19.5). The id is deliberately NOT 'spells': tab ids are
    // namespaced `exp:<id>` so there'd be no technical collision with the
    // `spells` PANEL, but Moons already taught us the human cost of a shared
    // name (the [e] badge exists because the Moons experience and moonwatch's
    // Moons STREAM read identically in a tab strip). A distinct id avoids
    // repeating that.
    id: 'spellmonitor',
    label: 'Spell Monitor',
    kind: 'instrument',
    desc: 'Everything currently on you as a grid of live countdowns — each running green while full, yellow past halfway and red as it nears its end.',
    component: SpellMonitorExperience,
    // Wide and short: it's a strip of cells, not a scene.
    defaultRect: { x: 0.25, y: 0.06, w: 0.5, h: 0.24 },
    // A GRID OF SHORT CELLS — and "a strip across the top of the window" is how
    // this was conceived in the first place — so it must be able to shrink to
    // about one row. The 110px panel floor blocked that with ~25px to spare
    // (Sekmeht), which reads as the window simply refusing to get smaller.
    // 48px is roughly one cell row plus the grid's padding at the default font,
    // and low enough to hug the content with the header bar OFF (the feed
    // status lives inside that header, so it costs no row of its own).
    // Width keeps the shared floor: the grid's `minmax(11em, 1fr)` columns make
    // a narrower window useless, so there is nothing to gain there.
    minSize: { w: 180, h: 48 },
    chrome: 'standard',
    badge: 'Beta',
    // One option per visual LAYER, each accurate about exactly what it hides.
    options: [
      { id: 'bars',    label: 'Duration bars',   desc: 'A depleting bar under each effect, drawn against the longest duration seen for it this session (the game never states a spell’s full length, so the bar learns it from a recast).' },
      { id: 'urgency', label: 'Traffic-light colours', desc: 'Each effect runs green while it is full, yellow past the halfway mark, and red as it nears its end — in the same colours as your health bar, so they follow your theme and your colour-blind setting. Off = every cell uses one neutral colour.' },
      { id: 'expired', label: 'Ended effects',  desc: 'Keep an effect on screen once the game stops listing it — greyed and marked "ended" — so you can see exactly what lapsed and needs recasting rather than having it quietly vanish. It clears when you recast it, and after one roisan on its own. An effect whose countdown has simply run out is always shown, marked "expired", until the game settles it either way.' },
      { id: 'untimed', label: 'Untimed effects', desc: 'Effects the game reports without a countdown, such as a Trabe Chalice reading “intact, fading”. Shown last, after everything with a timer.' },
      { id: 'pulse',   label: 'Expiry pulse',    desc: 'A cell that has gone red pulses to catch your eye. (The epilepsy-safe accessibility setting also disables this; the red colour stays either way.)' },
      { id: 'badges',  label: 'Skill badges',    desc: 'A letter chip on each effect for its magic skill or ability type — [A]ugmentation, [W]arding, [F]orm and so on — each in its own colour, so you can pick out one kind at a glance. Hover a chip for the full name. (Colours are editable in the Theme Editor under HUD.)' },
      { id: 'abbrev',  label: 'Abbreviations',   desc: 'Show the game\'s short spell name instead of the full one — ECRY rather than Eillie\'s Cry — so what you read is what you type to renew it. Off by default; effects with no known abbreviation keep their full name either way.', defaultHidden: true },
      { id: 'sortByTime', label: 'Soonest first', desc: 'Re-order the grid by how much time is left, so whatever is about to run out sits first (and anything the game marks as fading leads). Off by default — the grid keeps the order the game itself lists them in, which stays put as timers tick.', defaultHidden: true },
      { id: 'groupBySkill', label: 'Group by skill', desc: 'Gather effects under a heading for their magic skill or ability type — Wards together, Augmentations together; for a Barbarian, Forms, Berserks, Meditations and Roars each in their own block. Off by default. Combines with "Soonest first", which then orders within each group.', defaultHidden: true },
      { id: 'header',  label: 'Header bar',      desc: 'The "Active Spells" strip across the top — its count, and the feed status if that layer is on. Off reclaims a row, which is what lets this shrink to a bare grid of cells; worth it when hosting this as a narrow panel tab.' },
      { id: 'updated', label: 'Feed status',      desc: 'Show in the header bar when the game last refreshed this list, and roughly how often it does — so a motionless grid reads as "nothing has changed" rather than "something is broken". Needs the header bar, and hides with it.' },
    ],
    textEquivalent: 'The Active Spells panel — the game’s own percWindow readout, listing each effect and the roisaen remaining on it.',
  },
]

export function experienceById(id: string): ExperienceDef | undefined {
  return EXPERIENCES.find(e => e.id === id)
}

// ── Open-instance persistence ──────────────────────────────────────────────
// One scopedKey (`experiences`) holds every instance the user has ever
// opened. `open: false` instances KEEP their rect/z so the shelf's
// "reopen never loses anything" promise (§34.5) holds — closing is a
// visibility toggle, not a delete.
export interface ExperienceInstance {
  id: string          // ExperienceDef id (multiInstance unsupported for now)
  rect: FloatRect
  z: number
  showTitle: boolean
  open: boolean
  // v0.14.7 per-instance view options — both OPTIONAL (older saved instances
  // load unchanged; rides the same scopedKey → YAML → Transfer for free).
  // fontSize: the A+/A− override in px (absent = the global game font, the
  // F31 model). hidden: option-id → true for content layers toggled OFF via
  // the ⚙ popover (absent/empty = everything visible).
  fontSize?: number
  hidden?: Record<string, boolean>
}

export function loadExperiences(key: string): ExperienceInstance[] {
  const raw = localStorage.getItem(key)
  if (raw == null) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(isInstance)
  } catch { /* corrupt → start empty; the registry defaults rebuild on open */ }
  return []
}

export function saveExperiences(key: string, list: ExperienceInstance[]): void {
  localStorage.setItem(key, JSON.stringify(list))
}

function isInstance(v: unknown): v is ExperienceInstance {
  const o = v as ExperienceInstance
  return !!o && typeof o.id === 'string' && !!o.rect
    && typeof o.rect.x === 'number' && typeof o.rect.y === 'number'
    && typeof o.rect.w === 'number' && typeof o.rect.h === 'number'
    && typeof o.z === 'number' && typeof o.open === 'boolean'
}
