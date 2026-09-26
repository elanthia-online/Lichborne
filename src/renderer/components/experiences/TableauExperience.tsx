// Living Tableau (Experience X1, DESIGN §32.2 / §34.9) — the room as a scene:
// every player a procedural avatar at a stable seat, creatures along the back,
// you foreground-centre, speech as bubbles. `memo`'d (pitfall #82c) so it
// re-renders on ITS inputs, not every game batch.
//
// A PURE VIEW over typed scene state. The cast/speech/moves arrive as
// `ExperienceProps` from GameWindow (fed by main's SceneParser, §35 — the
// Lich-derived text extraction lives in src/shared/sceneExtract.ts, NOT here);
// combat state rides the `combat` prop; the window's ⚙ content layers are
// gated ONCE at the top of the component (`hidden` → identity-stable filtered
// arrays, because effects key on those identities). Nothing here parses game
// text.
//
// What the body does, in order — each block carries its own comment:
//   • seating: `assignSeats` / `seatPos` (name-hash seats, the 12-seat arc
//     that auto-switches to the 26-seat amphitheater, "+N others" overflow,
//     promote-on-speak), then CONVERSATION GRAVITY (`circlePos` — talkers drift
//     into an inner circle, directed speech pulls pairs together, self gravity)
//     and a self personal-space push;
//   • choreography: entrances slide in from their origin edge, departures
//     linger as ghosts (skipped under epilepsy-safe), thoughts are WISPS in the
//     bottom-left log and never a body (§32.2);
//   • the COMBAT FACET (G1, DESIGN §32.1): readiness rings on the avatar
//     (`CombatRings`, ticking inside `useTimers`), the danger pulse, a sticky
//     `inCombat` hold, BAL/POS bipolar gauges + RNG pinned to the stage bottom,
//     and the ASSESS arena — id'd creatures by relation, reconciled by NAME
//     COUNT against the live cast so the dead/departed never linger, corpses in
//     a row above, click → `face #id`, aged out after `ASSESS_TTL_MS`;
//   • the BUBBLE LAYER: laid out in scene-PIXEL space outside the scaled
//     figure tree so bubbles keep the game-font size, collision-aware and
//     newest-first — out of headroom DROPS (never clamps), except the first.
//
// Layout invariants: the stage is measured with a 0×0 guard (pitfall #83);
// gauge / status-chip / wisp heights are MEASURED in a layout effect so the
// self figure and bubbles are held clear of them; the fit-to-container scale
// is WIDTH-dominant; bubble spacing derives from the game font (pitfall #45).
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hashStr, monogramStyle, nameColor, nameInitials } from '../../utils/nameColor'
import { characterColor, characterColorsByName, useCharacterColors } from '../../characterColors'
import { useRosterOptional } from '../../RosterContext'
import type { Contact, ContactTemplate } from '../../contacts'
import type { ExperienceProps, SceneSpeechItem, SceneMoveItem } from '../../experiences'
import type { SceneCreature } from '../../../shared/types'
import { useTimers } from '../../hooks/useTimers'
import { positionLabel, balanceLabel, RANGE_ORDER } from '../../../shared/combatExtract'

// Combat conditions that raise the danger pulse on the PLAYER avatar (a subset
// of SELF_RING_KEYS — 'dead' is its own state, it greys the self figure rather
// than raising alarm).
const DANGER_KEYS = ['bleeding', 'stunned', 'webbed', 'poisoned', 'diseased']

// Range band → single-letter label for the RNG row: Melee / Pole / Ranged.
const RANGE_LETTER: Record<string, string> = { melee: 'M', pole: 'P', missile: 'R' }

// ── Assess (combat arena) relation helpers ──────────────────────────────────
// Coarse zone (for tint + sort) and a short human label per assess relation.
const ASSESS_LABEL: Record<string, string> = {
  'facing': 'facing you', 'in front of': 'in front', 'advancing on': 'advancing',
  'behind': 'behind you', 'flanking': 'flanking', 'beside': 'beside you',
  'next to': 'next to you', 'to the left of': 'left flank', 'to the right of': 'right flank',
  'to left of': 'left flank', 'to right of': 'right flank',
}
function assessZone(rel: string): 'front' | 'flank' | 'behind' {
  if (rel === 'facing' || rel === 'in front of' || rel === 'advancing on') return 'front'
  if (rel === 'behind') return 'behind'
  return 'flank'
}
// A creature "reeling" (about to fall / can't defend) — worth flagging.
const ASSESS_REELING = /stunned|imbalanced|unbalanced/i
const ASSESS_ZONE_ORDER: Record<string, number> = { front: 0, flank: 1, behind: 2 }
const ASSESS_TTL_MS = 30_000  // assess is on-demand/script-driven; age it out after a fight
// Normalise a creature name for cast↔assess reconciliation: lowercase + strip a
// leading article/number word (the same set sceneExtract's LEADING_ARTICLE
// strips from the cast, plus "the"), applied to BOTH sides so "A lava drake"
// (assess, article kept) matches "lava drake" (cast, article already stripped).
const ASSESS_NAME_ARTICLE = /^(?:a|an|the|some|two|three|four|five|six|seven|eight|nine|ten)\s+/
const normAssessName = (n: string) => n.toLowerCase().replace(ASSESS_NAME_ARTICLE, '').trim()

// The READINESS RING around the player avatar (DESIGN §32.1 — the combat HUD
// "sits around the player's bubble", Sekmeht 2026-07-16). ONE cooldown sweep,
// not a stack of look-alike rings: RT is the thick outer arc over a faint full
// track (so it reads as "filling back up"), and CT/aim are thin inner accent
// arcs shown only while they run — differentiated by weight + colour. Range /
// balance / position live in the gauge panel below the figure, NOT as more
// rings. Stateless; re-renders with its parent on the useTimers clock so the
// sweep animates. Module-scope so it isn't a fresh component type each render.
// A BIPOLAR gauge — a centre baseline with the fill growing toward "you"/good
// (green, right) or "foe"/bad (red, left). `frac` is a signed −1…+1 reading:
// position uses pos/9 (even = 0 centre); balance uses (level − "solidly")
// normalised per side (Sekmeht 2026-07-17: "solidly balanced" IS the baseline —
// above it is a bonus, below it is off-balance), so both read the same way.
function BipolarGauge({ label, frac, title }: { label: string; frac: number; title: string }) {
  // A red → yellow → green SPECTRUM track (Sekmeht 2026-07-17: yellow neutral,
  // green toward +, red toward −) with a needle marking where you sit. `frac`
  // is −1…+1; the needle at 50 + frac·50% lands on the matching colour.
  return (
    <div className="tableau-gauge tableau-gauge--bipolar" title={title}>
      <span className="tableau-gauge-label">{label}</span>
      <span className="tableau-gauge-track">
        <span className="tableau-gauge-center" />
        <span className="tableau-gauge-mark" style={{ left: `${50 + frac * 50}%` }} />
      </span>
    </div>
  )
}

// Three readiness RINGS around the avatar (DESIGN §32.1), fixed inner → outer:
// Roundtime, Cast, Aim (Sekmeht 2026-07-17) — each in its command-bar timer
// colour (var --rt/ct/aim-end, matching the bars and theme-correct), shown only
// while that timer runs. Each = a faint track + a depleting sweep; distinct by
// radius + colour (the range bands that made this a look-alike stack moved to
// the gauge panel). Stateless; re-renders with its parent on the useTimers clock.
function CombatRings({ rtPct, ctPct, aimPct }: { rtPct: number; ctPct: number; aimPct: number }) {
  const rings = [
    { on: rtPct > 0,  pct: rtPct,  r: 25, cls: 'rt'  },   // inner  — Roundtime
    { on: ctPct > 0,  pct: ctPct,  r: 32, cls: 'ct'  },   // middle — Cast
    { on: aimPct > 0, pct: aimPct, r: 39, cls: 'aim' },   // outer  — Aim
  ].filter(x => x.on)
  if (rings.length === 0) return null
  return (
    <svg className="tableau-combat-rings" viewBox="0 0 100 100" aria-hidden="true">
      {rings.map(x => {
        const c = 2 * Math.PI * x.r
        return (
          <g key={x.cls}>
            <circle className="tableau-cr-track" cx="50" cy="50" r={x.r} fill="none" />
            <circle className={`tableau-cr-ready tableau-cr-ready--${x.cls}`}
              cx="50" cy="50" r={x.r} fill="none"
              strokeDasharray={c} strokeDashoffset={c * (1 - x.pct / 100)}
              transform="rotate(-90 50 50)" />
          </g>
        )
      })}
    </svg>
  )
}

// Stable empties for the v0.14.7 ⚙ content-layer toggles — a fresh [] per
// render would defeat the effects keyed on these arrays' identities.
const EMPTY_MOVES: SceneMoveItem[] = []
const EMPTY_CREATURES: SceneCreature[] = []

// Living Tableau (X1, DESIGN.md §32.2 / §34.9) — Phase 1 CAST KERNEL.
// A PURE VIEW over the typed scene state: the cast arrives as `scene-cast`
// events from main's SceneParser (§35 — Lich-derived extraction lives there,
// in src/shared/sceneExtract.ts, NOT here). Every player gets a procedural
// avatar (initials + Contact color) at a STABLE seat (name hash → arc
// position), creatures line the back, you sit foreground center. Speech
// bubbles / choreographed entrances / AI backdrops land in later phases
// (§34.9 Phases 2–3) as the speech capturers verify against corpus.


// Stable seating (§32.2): hash the name to a preferred seat on the arc and
// linear-probe collisions. Names are processed SORTED so probe results don't
// depend on arrival order — a member keeps their seat across room updates.
//
// TWO ARRANGEMENTS (Sekmeht, 2026-06-12): the single 12-seat arc reads
// beautifully up to a dozen people; big gatherings auto-switch to a two-row
// AMPHITHEATER (26 seats — a higher back arc of smaller figures + a closer
// front arc) before overflowing into the "+N others" chip. The switch is
// automatic on crossing SEAT_COUNT; figures glide (CSS left/top transition),
// so the relayout morphs instead of snapping.
const SEAT_COUNT = 12
const SEAT_COUNT_LARGE = 26
const LARGE_BACK_ROW = 14   // seats 0..13 = back arc; 14..25 = front arc

function assignSeats(names: string[], seatCount: number): Map<string, number> {
  const taken = new Set<number>()
  const seats = new Map<string, number>()
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    let seat = hashStr(name.toLowerCase()) % seatCount
    let tries = 0
    while (taken.has(seat) && tries < seatCount) { seat = (seat + 1) % seatCount; tries++ }
    taken.add(seat)
    seats.set(name, seat)
  }
  return seats
}

// Seat index → scene position (% of the scene box). Edge seats sit higher
// (farther away), center seats deeper — the player is foreground.
function seatPos(idx: number, seatCount: number): { x: number; y: number; depth: number } {
  if (seatCount <= SEAT_COUNT) {
    const t = (idx + 0.5) / seatCount
    const depth = Math.sin(t * Math.PI)        // 0 at edges → 1 at center
    return { x: 6 + t * 88, y: 34 + depth * 22, depth }
  }
  // Amphitheater: back row shallow and high, front row deeper and low.
  if (idx < LARGE_BACK_ROW) {
    const t = (idx + 0.5) / LARGE_BACK_ROW
    const bow = Math.sin(t * Math.PI)
    return { x: 4 + t * 92, y: 28 + bow * 10, depth: 0.15 + bow * 0.2 }
  }
  const t = (idx - LARGE_BACK_ROW + 0.5) / (SEAT_COUNT_LARGE - LARGE_BACK_ROW)
  const bow = Math.sin(t * Math.PI)
  return { x: 8 + t * 84, y: 46 + bow * 14, depth: 0.55 + bow * 0.45 }
}

// Procedural avatar color, in order (Sekmeht, v0.20.0):
//   1. the colour YOU picked for one of your own characters (Edit Profile →
//      characterColors);
//   2. one of YOUR characters with no colour picked: the automatic name colour
//      — the same one its toasts, tab and launcher badge use. Never a contact
//      template's, even when you've filed your own character as a contact: that
//      made Sekmeht purple here and teal everywhere else;
//   3. anyone else who is a Contact: their template's text colour (the
//      per-person colour system contacts already are);
//   4. everyone else: the stable hue from their name (utils/nameColor).
// "Your characters" = `own`: this Tableau's own character, every character of
// yours connected right now, and any you've picked a colour for.
// These are DATA colors, not theme colors — saturated fills, white-halo text
// (the sanctioned literal — Principle #4).
function avatarColor(
  name: string, contacts: Contact[], templates: ContactTemplate[],
  mine?: Map<string, string>, own?: Set<string>,
): { color: string; isContact: boolean } {
  const key = name.toLowerCase()
  const c = contacts.find(c => c.name && c.name.toLowerCase() === key)
  const picked = mine?.get(key)
  if (picked) return { color: picked, isContact: !!c }
  if (own?.has(key)) return { color: nameColor(name), isContact: !!c }
  if (c?.templateId) {
    const t = templates.find(t => t.id === c.templateId)
    if (t?.textColor) return { color: t.textColor, isContact: true }
  }
  return { color: nameColor(name), isContact: !!c }
}

// The shared monogram (utils/nameColor), so toast badges match these avatars.
const initials = nameInitials

const POSTURE_LABEL: Record<string, string> = { sitting: 'sitting', prone: 'lying down', hiding: 'hiding' }

// Self-figure status (Sekmeht: "the Tableau needs to show when I'M hidden,
// invisible, dead, bleeding…"). Same indicator ids the Icon Bar renders
// (lowercase, pitfall #15); each chip/ring reuses the Icon Bar's themed
// --ind-* var family. The FIRST active entry of the ring set drives the
// avatar's ring/glow color (the Icon Bar's own danger-first priority).
const SELF_STATUSES: { key: string; label: string }[] = [
  { key: 'bleeding', label: 'Bleeding' },
  { key: 'stunned', label: 'Stunned' },
  { key: 'dead', label: 'Dead' },
  { key: 'webbed', label: 'Webbed' },
  { key: 'poisoned', label: 'Poisoned' },
  { key: 'diseased', label: 'Diseased' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'invisible', label: 'Invisible' },
  { key: 'joined', label: 'Joined' },
]
const SELF_RING_KEYS = ['bleeding', 'stunned', 'dead', 'webbed', 'poisoned', 'diseased']

// How long a bubble stays up. Long enough to read a sentence, short enough
// that the scene doesn't wallpaper with stale chatter.
const BUBBLE_TTL_MS = 14_000

// The social-recency window: promote-on-speak seating AND conversation
// gravity both read it (longer than the bubble TTL so seats/positions don't
// churn the moment a bubble fades).
const PROMOTE_TTL_MS = 120_000

// Choreography windows: an arriving figure slides in from its origin edge,
// a departing one lingers as a ghost walking out toward its exit direction.
const ENTER_MS = 900
const GHOST_MS = 1_700

// Direction → screen-edge unit vector (where the mover came from / went to).
// `up` rises off the top, `down`/`out` sink off the bottom.
const DIR_VECTOR: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  northeast: [0.8, -0.8], northwest: [-0.8, -0.8],
  southeast: [0.8, 0.8], southwest: [-0.8, 0.8],
  up: [0, -1], down: [0, 1], out: [0, 1],
}

// memo()'d (pitfall #82c): GameWindow re-renders on EVERY game batch; the
// Tableau only needs to when its own inputs change (cast/speech/moves are
// state objects with stable identities between changes). The default export
// wraps this at the bottom of the file.
function TableauExperience({ character, characterId, roomState, sceneCast, speech: rawSpeech, moves: rawMoves, indicators, contacts, contactTemplates, settings, onOpenContact, onCommand, hidden, combat }: ExperienceProps) {
  // Your own characters' chosen colours, by name (the scene only knows names).
  const charColors = useCharacterColors()
  const myColors = useMemo(() => characterColorsByName(charColors), [charColors])
  // Your own characters (see avatarColor): never painted a contact colour.
  const roster = useRosterOptional()?.roster
  const ownNames = useMemo(() => {
    const out = new Set<string>([character.toLowerCase(), ...myColors.keys()])
    for (const r of roster ?? []) out.add(r.character.toLowerCase())
    return out
  }, [character, myColors, roster])
  const players = sceneCast.players
  // v0.14.7 content-layer toggles (the window's ⚙ popover, ExperienceDef
  // options): gate each layer HERE, at the single entry point, so every
  // downstream consumer (bubbles, wisps, captions, choreography, figures)
  // inherits the filter. useMemo keeps the filtered arrays' identities stable
  // per input — several effects key on `speech`/`moves`, and a fresh array
  // every render would re-run them continuously (this component is memo'd;
  // its internal effects deserve the same discipline).
  const speech = useMemo(() => {
    if (!hidden) return rawSpeech
    const layerOf: Record<string, string> = { say: 'speech', ooc: 'speech', yell: 'yells', whisper: 'whispers', thought: 'thoughts', emote: 'emotes' }
    const filtered = rawSpeech.filter(s => !hidden[layerOf[s.channel] ?? 'speech'])
    return filtered.length === rawSpeech.length ? rawSpeech : filtered
  }, [rawSpeech, hidden])
  const moves = hidden?.moves ? EMPTY_MOVES : rawMoves
  const creatures = hidden?.creatures ? EMPTY_CREATURES : sceneCast.creatures

  // Scene px size — the bubble layer lays out in pixels (collision spacing
  // needs real geometry). Pitfall-#83 guard: ignore 0×0 (hidden tab).
  const sceneRef = useRef<HTMLDivElement>(null)
  const [sceneSize, setSceneSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = sceneRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (w > 0 && h > 0) setSceneSize(s => (s.w === w && s.h === h ? s : { w, h }))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  // Measured height of the bottom-pinned gauge panel, so the self figure can be
  // held clear of it in a short stage (Sekmeht 2026-07-17: in a constricted
  // panel the self's NAME overlapped the gauge bars). Measured (not estimated)
  // so it tracks the font size + fit-scale automatically. useLayoutEffect reads
  // offsetHeight AFTER layout but BEFORE paint, so the clamp lands the same
  // frame the gauges appear (no one-frame overlap flash).
  const gaugeRef = useRef<HTMLDivElement>(null)
  const [gaugeH, setGaugeH] = useState(0)
  // The self's status chips hang BELOW its name, so they extend the figure's
  // footprint downward by an amount the gauge clamp can't guess — with
  // "Bleeding" up, the chip landed on top of the BAL bar (Sekmeht). Measured
  // rather than estimated because the row grows with the number of active
  // indicators and with the per-window font. Same layout-effect timing as the
  // gauges: after layout, before paint, so there's no one-frame overlap flash.
  const statusRef = useRef<HTMLDivElement>(null)
  const [statusH, setStatusH] = useState(0)
  // The thought log's height, for the same reason the gauges' is measured: the
  // bubble layer reserves the bottom band both of them sit in, so a bubble
  // can't land on top of either (they are all TEXT — a bubble over the wisps
  // is two unreadable things, not one).
  const wispsRef = useRef<HTMLDivElement>(null)
  const [wispH, setWispH] = useState(0)
  useLayoutEffect(() => {
    const h = gaugeRef.current?.offsetHeight ?? 0
    setGaugeH(prev => (prev === h ? prev : h))
    const s = statusRef.current?.offsetHeight ?? 0
    setStatusH(prev => (prev === s ? prev : s))
    const w = wispsRef.current?.offsetHeight ?? 0
    setWispH(prev => (prev === w ? prev : w))
  })

  // Re-render once a second while any bubble is still live so expiry is
  // visible without new events; the interval retires itself once everything
  // has aged out (and restarts on the next speech via the deps).
  const [, setBubbleTick] = useState(0)
  useEffect(() => {
    if (speech.length === 0) return
    const newest = speech[speech.length - 1].ts
    if (Date.now() - newest > BUBBLE_TTL_MS) return
    const t = setInterval(() => {
      setBubbleTick(x => x + 1)
      if (Date.now() - newest > BUBBLE_TTL_MS + 1000) clearInterval(t)
    }, 1000)
    return () => clearInterval(t)
  }, [speech])

  // ── Combat HUD facet (G1, DESIGN §32.1) ─────────────────────────────────────
  // Layers on the scene that auto-reveal while combat is live, using existing
  // typed state only (RT/CT/aim timers + self indicators + stance/hands). The
  // timers tick INSIDE useTimers (100ms self-retiring interval, like the command
  // bar's TimerDisplay), so GameWindow doesn't re-render every frame. Range/
  // facing/engagement (the CombatParser) is Phase 2 — threat here means "combat
  // is live", not true range-close engagement.
  const { aim, rtPct, ctPct, aimMax } = useTimers(
    combat?.rtExpires ?? 0, combat?.ctExpires ?? 0, combat?.aimExpires ?? 0)
  const aimPct = aimMax > 0 ? (aim / aimMax) * 100 : 0
  const timersLive = rtPct > 0 || ctPct > 0 || aimPct > 0
  const danger = !hidden?.danger && DANGER_KEYS.some(k => indicators[k])
  const combatLive = timersLive || danger
  // "In combat" is STICKY — once a real combat signal (a timer or a wound) fires
  // it stays true briefly after things go quiet, so the cockpit doesn't flicker
  // off in the gap between attacks (your RT hits 0 while you wait your turn).
  const [inCombat, setInCombat] = useState(false)
  useEffect(() => {
    if (combatLive) { setInCombat(true); return }
    if (!inCombat) return
    const t = setTimeout(() => setInCombat(false), 8000)
    return () => clearTimeout(t)
  }, [combatLive, inCombat])
  const pos = combat?.position ?? null
  const bal = combat?.balance ?? null
  const range = combat?.range ?? null
  // Signed −1…+1 gauge readings. Position is symmetric (pos/9, even = 0). Balance
  // is anchored at "solidly" (index 8) = the ready baseline, normalised per side
  // (+1…+3 above → incredibly, −1…−8 below → completely) so above reads green,
  // below reads red — the same bipolar shape as position (Sekmeht 2026-07-17).
  const posFrac = pos === null ? null : pos / 9
  const balFrac = bal === null ? null : ((bal - 8) >= 0 ? (bal - 8) / 3 : (bal - 8) / 8)
  const showReadiness = !hidden?.readiness && timersLive
  // The "engaged" flare (a creature attacking you) — driven by ASSESS (which
  // knows who's actually at melee range), NOT a blanket "combat is live" flag.
  // The old blanket marker flared EVERY creature while in combat, so a harmless
  // NPC that wandered in got flagged as a threat (Sekmeht 2026-07-18). Only the
  // assess arena can tell friend from foe, so threat styling lives there.
  const showEngaged = !hidden?.threat
  // Gauges render once there's data (last-known BAL/POS/RNG), but FADE out when
  // combat goes idle rather than persisting forever (Sekmeht 2026-07-17: "let's
  // do the combat fade" — reversing the earlier "just leave these on"). They
  // stay rendered while faded (opacity, not unmount) so they snap back the
  // instant combat resumes; the fade itself rides the `!inCombat` class +
  // asymmetric CSS transition (quick in, slow out) through the 8s inCombat hold.
  // The ⚙ "Combat gauges" layer (hidden.position) is still the hard on/off.
  const showGauges = !hidden?.position && (bal !== null || pos !== null || range !== null)
  // Assess arena (B): show id'd creatures by their relation to you when a fresh
  // assess is in hand (ages out after ASSESS_TTL_MS — it's on-demand). Self/PC
  // rows are excluded; the self row's target is your current target.
  const showAssess = !hidden?.creatures && !!combat && combat.assess.length > 0 && (Date.now() - combat.assessAt) < ASSESS_TTL_MS
  // Reconcile the assess SNAPSHOT against the LIVE creature cast (Sekmeht
  // 2026-07-17: "killing them doesn't update — they stay alive until a new
  // creature enters; some NPCs remain a threat after moving on"). Assess is
  // on-demand, so a creature you've since KILLED or that DECAYED/left lingers in
  // the arena — drawn alive and still --engaged ("a threat") — until the 30s TTL
  // or the next assess. The SceneParser cast (`creatures`) IS live (death/decay
  // diffing), so it's the truth for who's still here. Creature death is
  // ANONYMOUS (no id in the narration — the arena keys on id, the cast on name),
  // so reconcile by NAME COUNT: keep at most the ALIVE count per name (dropping
  // the dead/decayed excess, and any name the cast no longer lists at all → cap
  // 0). The specific surviving id may differ from reality, but no dead/departed
  // creature shows — which is the fix. Only runs when creatures aren't hidden
  // (showAssess already gates that), so `creatures` is the real cast here.
  const liveAssessCap = new Map<string, number>()
  for (const c of creatures) {
    const total = c.count ?? 1
    const alive = Math.max(0, total - (c.deadCount ?? (c.dead ? total : 0)))
    if (alive > 0) {
      const k = normAssessName(c.name)
      liveAssessCap.set(k, (liveAssessCap.get(k) ?? 0) + alive)
    }
  }
  const assessRaw = showAssess ? combat!.assess.filter(e => !e.self && !e.pc && !!e.id) : []
  const assessSeen = new Map<string, number>()
  const assessReconciled = assessRaw.filter(e => {
    const k = normAssessName(e.name)
    const used = assessSeen.get(k) ?? 0
    if (used >= (liveAssessCap.get(k) ?? 0)) return false
    assessSeen.set(k, used + 1)
    return true
  })
  // Safety net: if reconciliation dropped EVERYTHING but the cast still lists
  // live creatures, the names disagree between assess and the room-creature
  // parse — show the raw snapshot rather than blank the arena (which REPLACES
  // the normal creature figures, so a blank = no creatures at all). Never worse
  // than pre-fix. When the cast is empty (you left / all decayed), blanking is
  // correct, so this fallback deliberately doesn't fire there.
  const assessCreatures = (assessReconciled.length === 0 && assessRaw.length > 0 && liveAssessCap.size > 0)
    ? assessRaw
    : assessReconciled
  const assessTargetId = showAssess ? (combat!.assess.find(e => e.self)?.targetId ?? null) : null
  // No pulsing under the epilepsy-safe accessibility setting (the ring depletion
  // is a smooth transition, not a flashing loop, so it stays).
  const calm = settings.epilepsySafe

  // Latest live utterance per speaker → bubble over their seat. Thoughts are
  // telepathic — the speaker is NOT physically present (§32.2), so they
  // surface as wisps at the scene edge, never as a body/bubble in the room.
  const now = Date.now()
  const bubbles = new Map<string, SceneSpeechItem>()
  const wisps: SceneSpeechItem[] = []
  for (const s of speech) {
    if (now - s.ts > BUBBLE_TTL_MS) continue
    if (s.channel === 'thought') { wisps.push(s); continue }
    bubbles.set(s.speaker.toLowerCase(), s)   // newest-last wins
  }
  const anySpeaking = bubbles.size > 0

  // ── Conversation gravity (Sekmeht's design, 2026-06-12) ──────────────────
  // Talkers drift into an inner conversation circle — the chattiest end up
  // nearest the middle; directed speech ("say to Agan", whispers) pulls the
  // pair toward each other; quiet people stay seated back on the arc. The
  // figures' left/top transition turns score changes into a slow social
  // drift instead of jumps. Scores decay over CHAT_WINDOW (the same window
  // as promote-on-speak), so a lull releases people back to their seats.
  const CHAT_WINDOW_MS = PROMOTE_TTL_MS
  const selfKeys = new Set(['you', character.toLowerCase()])
  const chat = new Map<string, { score: number; partner?: string; partnerTs: number }>()
  for (const s of speech) {
    if (s.channel === 'thought') continue
    const age = now - s.ts
    if (age > CHAT_WINDOW_MS) continue
    const key = s.speaker.toLowerCase()
    const e = chat.get(key) ?? { score: 0, partnerTs: 0 }
    e.score += 1 - age / CHAT_WINDOW_MS
    if (s.target && s.ts >= e.partnerTs) { e.partner = s.target.toLowerCase(); e.partnerTs = s.ts }
    chat.set(key, e)
  }
  let maxChat = 0
  for (const [k, e] of chat) { if (!selfKeys.has(k) && e.score > maxChat) maxChat = e.score }

  const hashAngle = (key: string) => ((hashStr(key) % 360) * Math.PI) / 180
  const circMean = (a: number, b: number) =>
    Math.atan2((Math.sin(a) + Math.sin(b)) / 2, (Math.cos(a) + Math.cos(b)) / 2)
  // Conversation-circle position for a CHATTY player: ellipse around the
  // scene's social center, radius shrinking with chattiness.
  const circlePos = (key: string): { x: number; y: number; depth: number } => {
    const e = chat.get(key)!
    const norm = maxChat > 0 ? e.score / maxChat : 0
    const radius = 34 - 20 * norm                     // chattiest innermost
    let angle = hashAngle(key)
    const partner = e.partner
    if (partner) {
      if (selfKeys.has(partner)) {
        // Talking to YOU → drift toward your foreground seat (bottom).
        angle = circMean(angle, Math.PI / 2)
      } else if (players.some(q => q.name.toLowerCase() === partner)) {
        // Mutual pairs converge on the same mean; the ±offset keeps the two
        // side by side instead of stacked.
        angle = circMean(hashAngle(key), hashAngle(partner)) + (key < partner ? -0.24 : 0.24)
      }
    }
    const x = Math.min(93, Math.max(7, 50 + Math.cos(angle) * radius))
    const y = Math.min(60, Math.max(29, 47 + Math.sin(angle) * radius * 0.5))
    return { x, y, depth: 0.55 + norm * 0.45 }
  }

  // Choreography state from recent moves: entrances (slide in from the
  // origin edge when the hint carried one) and departure ghosts (the figure
  // lingers, walking out toward its exit direction; a logoff dissolves in
  // place). Epilepsy-safe skips ghosts entirely (a frozen duplicate figure
  // is worse than none — the CSS kills animations, so gate the RENDER).
  const entrances = new Map<string, SceneMoveItem>()
  const ghosts: SceneMoveItem[] = []
  for (const mv of moves) {
    const age = now - mv.ts
    if (mv.kind === 'arrive' && age < ENTER_MS) {
      entrances.set(mv.name.toLowerCase(), mv)
    } else if (
      mv.kind === 'depart' && age < GHOST_MS && !settings.epilepsySafe &&
      !players.some(p => p.name.toLowerCase() === mv.name.toLowerCase())
    ) {
      ghosts.push(mv)
    }
  }
  // One re-render after the newest move's animations end, so ghosts retire
  // and entrance classes drop without waiting for the next game event.
  const [, setMoveTick] = useState(0)
  useEffect(() => {
    if (moves.length === 0) return
    const wait = GHOST_MS + 100 - (Date.now() - moves[moves.length - 1].ts)
    if (wait <= 0) return
    const t = setTimeout(() => setMoveTick(x => x + 1), wait)
    return () => clearTimeout(t)
  }, [moves])

  // Crowd cap + PROMOTE-ON-SPEAK (§32.2): real avatars for SEAT_COUNT, a
  // "+N others" silhouette for the rest — but recent SPEAKERS seat first.
  // Without this, a packed room (Sekmeht's 25-player capture; 50+ festivals)
  // silently dropped bubbles for anyone in the crowd, which read as "speech
  // stopped working." The promotion window is much longer than the bubble
  // TTL so a seat doesn't churn away the moment a bubble fades; the sort is
  // stable, so non-speakers keep their relative order.
  const recentSpeakers = new Set(
    speech.filter(s => s.channel !== 'thought' && now - s.ts < PROMOTE_TTL_MS)
          .map(s => s.speaker.toLowerCase()),
  )
  const prioritized = recentSpeakers.size === 0 ? players
    : [...players].sort((a, b) =>
        Number(recentSpeakers.has(b.name.toLowerCase())) - Number(recentSpeakers.has(a.name.toLowerCase())))
  // Arrangement auto-switch: the intimate arc up to 12, the two-row
  // amphitheater beyond (Sekmeht's big-gathering case).
  const isLarge = players.length > SEAT_COUNT
  const seatCount = isLarge ? SEAT_COUNT_LARGE : SEAT_COUNT
  const seated = prioritized.slice(0, seatCount)
  const overflow = players.length - seated.length
  const seatKey = `${seatCount}:${seated.map(p => p.name).join(' ')}`
  const seats = useMemo(() => assignSeats(seated.map(p => p.name), seatCount), [seatKey])  // eslint-disable-line react-hooks/exhaustive-deps

  // Positions resolved ONCE so self-gravity can aim at a partner's actual
  // spot (circle or seat) rather than re-deriving it.
  const seatedPosByKey = new Map<string, { x: number; y: number; depth: number }>()
  for (const p of seated) {
    const k = p.name.toLowerCase()
    seatedPosByKey.set(k, chat.has(k) ? circlePos(k) : seatPos(seats.get(p.name) ?? 0, seatCount))
  }

  // Self gravity (Sekmeht): you're part of the conversation too. Talking at
  // all floats you up from the foreground toward the social center; talking
  // TO someone drifts you toward them (they drift toward you via the
  // selfKeys pull in circlePos — the pair closes from both sides). Quiet for
  // a couple of minutes → you settle back to your foreground seat.
  const SELF_BASE = { x: 50, y: 78 }
  let selfPos = SELF_BASE
  const selfChatE = chat.get('you') ?? chat.get(character.toLowerCase())
  if (selfChatE) {
    const selfScore = (chat.get('you')?.score ?? 0) + (chat.get(character.toLowerCase())?.score ?? 0)
    const norm = Math.min(1, selfScore / (maxChat > 0 ? maxChat : selfScore))
    let target = { x: 50, y: 47 }
    if (selfChatE.partner && !selfKeys.has(selfChatE.partner)) {
      const pp = seatedPosByKey.get(selfChatE.partner)
      if (pp) target = pp
    }
    const pull = 0.55 * Math.max(0.45, norm)
    selfPos = {
      x: SELF_BASE.x + (target.x - SELF_BASE.x) * pull,
      // Never fully merge into the crowd — you stay foreground-most.
      y: Math.max(58, SELF_BASE.y + (target.y - SELF_BASE.y) * pull),
    }
  }

  // Fit-to-container scale (Sekmeht 2026-07-17). Figures are %-POSITIONED but
  // em-SIZED, so at a fixed font a small stage keeps figures full-size while the
  // % gaps collapse and they overlap; scaling the stage font by its size makes
  // the em sizes track the box so the % spacing reads the same at every size.
  // WIDTH-DOMINANT: horizontal crowding (figures side-by-side across the width)
  // is the real overlap constraint; figures are %-positioned so they never
  // overflow VERTICALLY by position, and the gauges are bottom-pinned (not hung
  // under the self), so height almost never needs to constrain. An early version
  // weighted height equally (ref 500) and a normal wide-short panel tab
  // (~715×250) fit to ~0.5 → 6px figures = "way too tiny, have to A+ a lot"
  // (Sekmeht). Now width drives it with only a GENTLE height floor (ref 240).
  // Capped at 1 (never past base — A−/A+ owns zoom-in) and floored at 0.6.
  const FIT_REF_W = 520, FIT_REF_H = 240
  const fitScale = sceneSize.w > 0 && sceneSize.h > 0
    ? Math.min(1, Math.max(0.6, Math.min(sceneSize.w / FIT_REF_W, sceneSize.h / FIT_REF_H)))
    : 1

  // Hold the self figure CLEAR of the bottom-pinned gauge panel in a short stage
  // (Sekmeht 2026-07-17: in a constricted panel the self's NAME overlapped the
  // gauge bars). Reserve ~2× the measured gauge height from the bottom (gauge
  // zone + the self's own avatar/name below its centre — the two are ~equal
  // heights at the same font), and clamp the self's y up so it clears it. Only
  // limits in a SHORT stage: in a tall one the reserve is a small %, so the
  // min() keeps the normal foreground y (78%). Measured gaugeH tracks font/fit
  // automatically. Floored at 46% so an extreme-short box doesn't shove the self
  // up into the seated band. Applied to selfPos IN PLACE so the self's speech
  // bubble anchor (below) and the figure render both use the clamped position.
  // `statusH` extends the reserve because the chips hang below the name and so
  // are the true bottom of the self block whenever any indicator is up.
  if (showGauges && gaugeH > 0 && sceneSize.h > 0) {
    const clearY = Math.max(46, ((sceneSize.h - (2 * gaugeH + statusH)) / sceneSize.h) * 100)
    if (clearY < selfPos.y) selfPos = { x: selfPos.x, y: clearY }
  }

  // Keep OTHER figures out of the SELF's personal space (Sekmeht 2026-07-20: a
  // seated player landing right behind your own avatar makes it unreadable — the
  // z-index puts you in front, but their name/avatar still clutters around you).
  // The self-gravity floats you UP toward the conversation (min y≈58%) so a
  // centre-seated player (y≈56%) — or a partner you've drifted onto — can end up
  // stacked on you. Push any seated figure within SELF_CLEAR_R of the FINAL
  // selfPos out to that radius along the self→figure vector (straight up if it's
  // dead-centre on you), clamped on-screen. Figures can still be ADJACENT (a
  // chat pair reads as together), just never fully overlapping the self. This
  // runs after the float + gauge-clamp so it uses the self's real position, and
  // mutates seatedPosByKey so the bubble anchors + figure render both follow.
  const SELF_CLEAR_R = 12
  for (const [k, pos] of seatedPosByKey) {
    if (selfKeys.has(k)) continue
    const dx = pos.x - selfPos.x, dy = pos.y - selfPos.y
    const d = Math.hypot(dx, dy)
    if (d >= SELF_CLEAR_R) continue
    const ux = d > 0.1 ? dx / d : 0
    const uy = d > 0.1 ? dy / d : -1   // exactly on the self → shove straight up
    const push = SELF_CLEAR_R - d
    seatedPosByKey.set(k, {
      ...pos,
      x: Math.min(96, Math.max(4, pos.x + ux * push)),
      y: Math.min(90, Math.max(6, pos.y + uy * push)),
    })
  }

  const descExcerpt = useMemo(() => {
    const d = roomState.desc.trim()
    if (!d) return ''
    const firstSentence = d.match(/^.*?[.!?](\s|$)/)?.[0] ?? d
    return firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}…` : firstSentence
  }, [roomState.desc])

  const bubbleFor = (name: string) => bubbles.get(name.toLowerCase())

  // Emote action captions stay attached under their figure (§32.2); the
  // inline counter-scale cancels the figure's depth scale so captions read
  // at a constant size.
  const renderCaption = (b: SceneSpeechItem | undefined, figScale = 1) =>
    b && b.channel === 'emote'
      ? <div className="tableau-caption" style={{ transform: `translateX(-50%) scale(${(1 / figScale).toFixed(3)})`, transformOrigin: '50% 0' }}>{b.text}</div>
      : null

  // Unseen speakers (hiding / invisible / disembodied ghostly voices with no
  // room-list entry — Sekmeht's rule), resolved ONCE: the shadow figure and
  // the bubble layer share these anchors. Spoke-then-LEFT is excluded (a
  // departure newer than the bubble means the ghost already walked them out).
  const unseenList = [...bubbles.values()]
    .filter(b => !selfKeys.has(b.speaker.toLowerCase())
      && !players.some(p => p.name.toLowerCase() === b.speaker.toLowerCase())
      && !moves.some(mv => mv.kind === 'depart'
        && mv.name.toLowerCase() === b.speaker.toLowerCase() && mv.ts > b.ts))
    .map(b => ({
      speaker: b.speaker,
      pos: seatPos(hashStr(b.speaker.toLowerCase()) % seatCount, seatCount),
      tint: avatarColor(b.speaker, contacts, contactTemplates, myColors, ownNames).color,
    }))
  const unseenPosByKey = new Map(unseenList.map(u => [u.speaker.toLowerCase(), u.pos]))

  // ── The bubble LAYER (Sekmeht UX pass) ────────────────────────────────────
  // Bubbles live OUTSIDE the scaled figure tree, in scene-pixel space: every
  // bubble renders at the same GAME-FONT size no matter how small/far its
  // speaker's figure is (the amphitheater's tiny back row included), carries
  // the speaker's NAME (a crowded layout can push a bubble away from its
  // head), and the placement is COLLISION-AWARE — the newest bubble claims
  // the spot nearest its speaker, earlier ones are pushed upward out of the
  // way, so bubbles never overlap. The tail offset keeps aiming at the
  // speaker even when the bubble had to shift.
  type LaidBubble = { key: string; item: SceneSpeechItem; tint: string; left: number; top: number; tailDx: number; z: number }
  const laidBubbles: LaidBubble[] = []
  const fs = settings.fontSize || 12
  const bubbleMaxW = Math.min(16 * fs, Math.max(10 * fs, sceneSize.w * 0.55))
  if (sceneSize.w > 0) {
    const W = sceneSize.w, H = sceneSize.h
    // Spacing derived from the game font, not fixed px (pitfall #45's family).
    // These were 8 / 10 / 4 / 14 raw pixels, so at font 20+ the bubbles crowded
    // each other and the tail crept toward the corner while the text around
    // them grew.
    const GAP = 0.7 * fs          // breathing room between bubbles
    const LIFT = 0.85 * fs        // how far above a blocker to retry
    const EDGE = 0.35 * fs        // keep clear of the stage sides
    const TAIL_INSET = 1.15 * fs  // tail stays this far inside the bubble's corner
    const topLimit = 2.6 * fs     // below the room title / description header
    const placed: { l: number; t: number; r: number; b: number }[] = []
    // Reserve the bottom band. The thought log (bottom-LEFT) and the
    // BAL/POS/RNG panel (bottom-CENTRE) both live there and the bubble layer
    // knew about neither. One full-width rect covers both and costs nothing:
    // bubbles grow UPWARD from their speaker's head, so this only ever binds
    // for a figure standing unusually low.
    const bottomReserve = Math.max(gaugeH, wispH)
    if (bottomReserve > 0) placed.push({ l: 0, t: H - bottomReserve - GAP, r: W, b: H })
    const entries = [...bubbles.values()]
      .filter(b => b.channel !== 'emote')
      .sort((a, b) => b.ts - a.ts)      // newest first = closest to its speaker
      .slice(0, 12)                     // runaway guard only; the real limit is
                                        // "what fits", enforced per-bubble below
    entries.forEach((b, i) => {
      const k = b.speaker.toLowerCase()
      const anchor = selfKeys.has(k) ? selfPos : (seatedPosByKey.get(k) ?? unseenPosByKey.get(k))
      if (!anchor) return
      const ax = (anchor.x / 100) * W
      const ay = (anchor.y / 100) * H
      // Geometry ESTIMATE for spacing only — CSS does the real wrapping; a
      // slightly-generous estimate just means slightly-generous spacing.
      const textW = b.text.length * 0.54 * fs + 2.2 * fs
      const w = Math.min(bubbleMaxW, textW)
      const rows = Math.max(1, Math.ceil(textW / bubbleMaxW))
      // + name row + padding + tail. Adds to ~2.6em in reality (0.94 name,
      // 0.28 its margin, 0.8 padding, 0.76 tail), so 2.3 was UNDER-generous and
      // let bubbles touch. Err high — an over-estimate is only extra spacing.
      const h = rows * 1.4 * fs + 2.8 * fs
      const cx = Math.min(W - w / 2 - EDGE, Math.max(w / 2 + EDGE, ax))
      let bottom = ay - (selfKeys.has(k) ? 3.0 : 2.4) * fs   // clear the avatar head
      let guard = 0
      while (guard++ < 12) {
        const t = bottom - h
        const hit = placed.find(p => cx - w / 2 < p.r + GAP && cx + w / 2 > p.l - GAP && t < p.b + GAP && bottom > p.t - GAP)
        if (!hit) break
        bottom = hit.t - LIFT      // bump above the bubble in the way
      }
      let top = bottom - h
      // OUT OF HEADROOM → DROP IT, never clamp. Clamping to the header was the
      // overlap bug: it shoved the bubble back DOWN into the very space the
      // loop had just spent twelve iterations escaping, and then recorded the
      // clamped rect in `placed` while the loop had tested the unclamped one,
      // so the two disagreed for everything laid afterwards. Because `entries`
      // is newest-first, whatever runs out of room is the OLDEST speech in the
      // room — dropping it keeps the live conversation and discards what was
      // already unreadable. This is also what replaced the arbitrary cap of 6:
      // the column now holds exactly as much as the panel can show.
      if (top < topLimit) {
        // ...EXCEPT the first one placed. Dropping unconditionally regressed a
        // SHORT stage — a panel-tab Tableau where the speaker sits high enough
        // that even one bubble won't fit above them — into showing NO speech at
        // all, which is worse than the overlap this replaced. `laidBubbles` is
        // still empty here only for the newest entry (they are sorted
        // newest-first), so clamping it can't collide with another BUBBLE.
        // It can still land on the reserved bottom band in a stage too short
        // for either — accepted: showing the live line beats showing none.
        // Everything after it still drops.
        if (laidBubbles.length > 0) return
        top = topLimit
      }
      placed.push({ l: cx - w / 2, t: top, r: cx + w / 2, b: top + h })
      laidBubbles.push({
        key: `${b.speaker}-${b.id}`, item: b,
        tint: avatarColor(b.speaker, contacts, contactTemplates, myColors, ownNames).color,
        left: cx, top,
        tailDx: Math.max(-(w / 2 - TAIL_INSET), Math.min(w / 2 - TAIL_INSET, ax - cx)),
        z: 40 - i,                 // newest stacks on top
      })
    })
  }

  return (
    <div className={`tableau-scene${anySpeaking ? ' tableau-scene--focus' : ''}${isLarge ? ' tableau-scene--large' : ''}`}>
      <div className="tableau-header">
        <div className="tableau-room-title">{roomState.title || 'Somewhere in Elanthia'}</div>
        {descExcerpt && <div className="tableau-room-desc">{descExcerpt}</div>}
      </div>
      {/* The STAGE holds every figure + bubble, kept SEPARATE from the header so
          NPCs/avatars can never render over the room title/description at close
          zoom or odd aspect ratios (Sekmeht 2026-07-17). sceneRef measures the
          stage, so bubble layout stays inside it too. */}
      <div ref={sceneRef} className="tableau-stage" style={{ ['--tableau-fit' as string]: fitScale } as React.CSSProperties}>
      {/* Combat HUD facet (G1): the cockpit — readiness/range rings, danger
          pulse and position gauge — renders AROUND the player avatar below
          (Sekmeht 2026-07-16: "the combat flavor should sit around the player's
          bubble" — rings/dials/gauges, no floating corner text). */}

      {/* Thought/ESP wisps — telepathy drifts at the scene edge; the speaker
          gets NO body in the room (§32.2's phantom rule). */}
      {wisps.length > 0 && (
        <div className="tableau-wisps" ref={wispsRef}>
          {wisps.slice(-3).map(w => (
            <div key={w.id} className="tableau-wisp">
              <span className="tableau-wisp-speaker">{w.speaker}</span>
              {w.toYou && <span className="tableau-wisp-toyou"> (to you)</span>}
              {' '}{w.text}
            </div>
          ))}
        </div>
      )}

      {/* Creatures along the back of the scene — every individual gets its
          OWN figure (Sekmeht: "show me these guys" — four blademasters are
          four monsters, not a ×4 badge), in MONSTERBOLD (--preset-bold), the
          same visual language the main window uses for them. Exactly deadCount
          of each tally render as corpses; >10 overflow to a "+N more" chip. */}
      {(() => {
        // Assess arena (B): id'd creatures placed in a row sorted front → flank
        // → behind, each tagged with its relation to you + range, melee = engaged
        // (attacking), your target ringed, reeling ones flagged; click to `face`.
        if (showAssess && assessCreatures.length > 0) {
          const sorted = [...assessCreatures].sort(
            (a, b) => ASSESS_ZONE_ORDER[assessZone(a.relation)] - ASSESS_ZONE_ORDER[assessZone(b.relation)])
          const slots = sorted.length
          const top = isLarge ? '13%' : '20%'
          // Dead creatures REMAIN as corpses until they DECAY out of the live
          // cast (Sekmeht 2026-07-18: "when creatures die, keep their icons").
          // A corpse has no assess relation, so it isn't in `assessCreatures`
          // (reconciliation caps that at the ALIVE count) — pull the dead tally
          // straight from the cast and render them as a ✕ row ABOVE the live
          // tactical row (further "back", out of the fight). Capped at 10.
          const deadInstances: { name: string; ord: number }[] = []
          for (const c of creatures) {
            const deadN = c.deadCount ?? (c.dead ? (c.count ?? 1) : 0)
            for (let i = 0; i < deadN; i++) deadInstances.push({ name: c.name, ord: i + 1 })
          }
          const deadShown = deadInstances.slice(0, 10)
          const deadSlots = deadShown.length
          const deadTop = isLarge ? '5%' : '7%'
          return (
            <>
              {deadShown.map((c, i) => (
                <div
                  key={`asdead-${c.name}-${c.ord}`}
                  className="tableau-figure tableau-figure--creature tableau-figure--dead"
                  style={{ left: `${8 + ((i + 0.5) / Math.max(deadSlots, 1)) * 84}%`, top: deadTop }}
                  title={`${c.name} (dead)`}
                >
                  <div className="tableau-avatar tableau-avatar--creature">✕</div>
                  <div className="tableau-name">{c.name}</div>
                </div>
              ))}
              {sorted.map((e, i) => {
                const zone = assessZone(e.relation)
                const isTarget = e.id === assessTargetId
                const reeling = ASSESS_REELING.test(e.status)
                const rangeCh = e.range === 'melee' ? 'M' : e.range === 'pole' ? 'P' : 'R'
                return (
                  <div
                    key={`as-${e.id}`}
                    className={`tableau-figure tableau-figure--creature tableau-figure--assess tableau-assess--${zone}${isTarget ? ' tableau-assess--target' : ''}${showEngaged && e.range === 'melee' ? ' tableau-assess--engaged' : ''}${reeling ? ' tableau-assess--reeling' : ''}${onCommand ? ' tableau-assess--clickable' : ''}`}
                    style={{ left: `${8 + ((i + 0.5) / Math.max(slots, 1)) * 84}%`, top }}
                    title={`${e.name}${e.number != null ? ` #${e.number}` : ''} — ${ASSESS_LABEL[e.relation] ?? e.relation}, ${e.range} range${e.status ? ` (${e.status})` : ''}${isTarget ? ' — your target' : ''}${onCommand ? '\nClick to face' : ''}`}
                    onClick={onCommand && e.id ? () => onCommand(`face #${e.id}`) : undefined}
                    role={onCommand ? 'button' : undefined}
                  >
                    <div className="tableau-avatar tableau-avatar--creature">
                      {initials(e.name)}
                      {e.number != null && <span className="tableau-assess-num">{e.number}</span>}
                    </div>
                    <div className="tableau-name">{e.name}</div>
                    <div className="tableau-assess-tags">
                      <span className={`tableau-assess-rel tableau-assess-rel--${zone}`}>{ASSESS_LABEL[e.relation] ?? e.relation}</span>
                      <span className={`tableau-assess-rng tableau-assess-rng--${e.range}`}>{rangeCh}</span>
                    </div>
                  </div>
                )
              })}
            </>
          )
        }
        const instances: { name: string; dead: boolean; ord: number; total: number }[] = []
        for (const c of creatures) {
          const total = c.count ?? 1
          const deadN = c.deadCount ?? (c.dead ? total : 0)
          for (let i = 0; i < total; i++) instances.push({ name: c.name, dead: i < deadN, ord: i + 1, total })
        }
        const shown = instances.slice(0, 10)
        const extra = instances.length - shown.length
        const slots = shown.length + (extra > 0 ? 1 : 0)
        const top = isLarge ? '13%' : '22%'
        return (
          <>
            {shown.map((c, i) => (
              <div
                key={`cr-${c.name}-${c.ord}`}
                className={`tableau-figure tableau-figure--creature${c.dead ? ' tableau-figure--dead' : ''}`}
                style={{ left: `${8 + ((i + 0.5) / Math.max(slots, 1)) * 84}%`, top }}
                title={`${c.name}${c.total > 1 ? ` #${c.ord}` : ''}${c.dead ? ' (dead)' : ''}`}
              >
                <div className="tableau-avatar tableau-avatar--creature">{c.dead ? '✕' : initials(c.name)}</div>
                <div className="tableau-name">{c.name}</div>
              </div>
            ))}
            {extra > 0 && (
              <div className="tableau-figure tableau-figure--creature" style={{ left: '94%', top }} title={`${extra} more creatures`}>
                <div className="tableau-avatar tableau-avatar--creature">+{extra}</div>
                <div className="tableau-name">more</div>
              </div>
            )}
          </>
        )
      })()}

      {/* Departure ghosts — the figure lingers briefly, walking out toward
          its exit direction (or dissolving in place on a logoff). */}
      {ghosts.map(g => {
        const pos = seatPos(hashStr(g.name.toLowerCase()) % seatCount, seatCount)
        const v = g.direction ? DIR_VECTOR[g.direction] : null
        const sc = 0.8 + pos.depth * 0.25
        const style = {
          left: `${pos.x}%`, top: `${pos.y}%`,
          '--gx': v ? `${Math.round(v[0] * 110)}px` : '0px',
          '--gy': v ? `${Math.round(v[1] * 110)}px` : '0px',
          '--fig-sc': `${sc}`,
        } as React.CSSProperties
        return (
          <div key={`ghost-${g.id}`} className="tableau-figure tableau-figure--ghost" style={style}>
            <div className="tableau-avatar" style={monogramStyle(g.name, avatarColor(g.name, contacts, contactTemplates, myColors, ownNames).color)}>{initials(g.name)}</div>
            <div className="tableau-name">{g.name}</div>
          </div>
        )
      })}

      {/* Unseen speakers — a shadowed presence manifests so the bubble layer
          has a head to point at (Sekmeht's hiding/invisible/ghost rule). */}
      {unseenList.map(u => {
        const sc = 0.8 + u.pos.depth * 0.25
        return (
          <div
            key={`unseen-${u.speaker}`}
            className="tableau-figure tableau-figure--unseen tableau-figure--speaking"
            style={{ left: `${u.pos.x}%`, top: `${u.pos.y}%`, transform: `translate(-50%, -50%) scale(${sc})`, '--fig-sc': `${sc}` } as React.CSSProperties}
            title={`${u.speaker} — speaking from hiding (or invisible)`}
          >
            <div className="tableau-avatar tableau-avatar--unseen" style={{ background: u.tint }}>{initials(u.speaker)}</div>
            <div className="tableau-name">{u.speaker}?</div>
          </div>
        )
      })}

      {/* Seated players — quiet folks on the arc, talkers in the circle */}
      {seated.map(p => {
        const chatKey = p.name.toLowerCase()
        const pos = seatedPosByKey.get(chatKey) ?? seatPos(seats.get(p.name) ?? 0, seatCount)
        const { color, isContact } = avatarColor(p.name, contacts, contactTemplates, myColors, ownNames)
        // Contacts are clickable: the figure opens their contact card (the same
        // ContactPopover that in-text name clicks use).
        const contact = isContact ? contacts.find(c => c.name && c.name.toLowerCase() === chatKey) : undefined
        const clickable = !!(contact && onOpenContact)
        const tip = `${p.posture ? `${p.descriptor} (${POSTURE_LABEL[p.posture]})` : p.descriptor}${p.dead ? ' (dead)' : ''}${clickable ? ' — click for contact card' : ''}`
        const bubble = bubbleFor(p.name)
        const sc = 0.8 + pos.depth * 0.25
        const entry = entrances.get(p.name.toLowerCase())
        const ev = entry?.direction ? DIR_VECTOR[entry.direction] : null
        const style = {
          left: `${pos.x}%`, top: `${pos.y + (p.posture ? 3 : 0)}%`,
          transform: `translate(-50%, -50%) scale(${sc})`,
          '--fig-sc': `${sc}`,
          // Entrance start offset: from the origin edge when known, else a
          // small rise (the plain "just arrived" walk-in).
          ...(entry ? { '--ex': ev ? `${Math.round(ev[0] * 90)}px` : '0px', '--ey': ev ? `${Math.round(ev[1] * 90)}px` : '14px' } : {}),
        } as React.CSSProperties
        return (
          <div
            key={p.name}
            className={`tableau-figure${isContact ? ' tableau-figure--contact' : ''}${clickable ? ' tableau-figure--clickable' : ''}${p.posture ? ' tableau-figure--seated-posture' : ''}${p.posture === 'hiding' ? ' tableau-figure--hiding' : ''}${p.dead ? ' tableau-figure--player-dead' : ''}${bubble ? ' tableau-figure--speaking' : ''}${entry ? ' tableau-figure--enter' : ''}`}
            style={style}
            title={tip}
            onClick={clickable ? (e => onOpenContact!(contact!.id, e.clientX, e.clientY)) : undefined}
          >
            {renderCaption(bubble, sc)}
            <div className="tableau-avatar" style={monogramStyle(p.name, color)}>{initials(p.name)}</div>
            <div className="tableau-name">{p.name}</div>
          </div>
        )
      })}

      {overflow > 0 && (
        <div className="tableau-figure tableau-figure--crowd" style={{ left: '92%', top: '30%' }}>
          <div className="tableau-avatar tableau-avatar--crowd">+{overflow}</div>
          <div className="tableau-name">others</div>
        </div>
      )}

      {/* You — foreground center, wearing your own indicator states (the Icon
          Bar's data and its themed --ind-* colors): hidden/invisible shadow the
          figure, dead greys it, the most urgent condition colors the avatar
          ring, and every active state gets a labeled chip. Own speech arrives
          as 'You'; own EMOTES are third-person (actor = the character's name),
          so the bubble check covers both. */}
      {(() => {
        const selfBubble = bubbleFor('you') ?? bubbleFor(character)
        const selfStatuses = SELF_STATUSES.filter(s => indicators[s.key])
        const ringKey = SELF_RING_KEYS.find(k => indicators[k])
        const selfCls = `tableau-figure tableau-figure--self`
          + (selfBubble ? ' tableau-figure--speaking' : '')
          + (indicators.dead ? ' tableau-figure--player-dead' : '')
          + (indicators.hidden ? ' tableau-figure--self-hidden' : '')
          + (indicators.invisible ? ' tableau-figure--self-invisible' : '')
        const avatarStyle = {
          // By id first: two of your characters can share a name, and this
          // figure is THIS session's, whose tab and card look up by id.
          // monogramStyle picks readable ink — a picked colour can be pale.
          ...monogramStyle(character,
            characterColor(charColors, { characterId }) ?? avatarColor(character, contacts, contactTemplates, myColors, ownNames).color),
          ...(ringKey ? { '--self-ring': `var(--ind-${ringKey}-color)`, '--self-glow': `var(--ind-${ringKey}-glow)` } : {}),
        } as React.CSSProperties
        return (
          <div className={selfCls} style={{ left: `${selfPos.x}%`, top: `${selfPos.y}%` }}>
            {renderCaption(selfBubble)}
            <div className="tableau-self-core">
              {showReadiness && (
                <CombatRings rtPct={rtPct} ctPct={ctPct} aimPct={aimPct} />
              )}
              <div
                className={`tableau-avatar tableau-avatar--self${danger ? ' tableau-avatar--danger' : ''}${danger && !calm ? ' tableau-avatar--danger-anim' : ''}`}
                style={avatarStyle}
                title={danger ? 'In danger' : undefined}
              >
                {indicators.dead ? '✕' : initials(character)}
              </div>
            </div>
            <div className="tableau-name">{character}</div>
            {selfStatuses.length > 0 && (
              <div className="tableau-self-status" ref={statusRef}>
                {selfStatuses.map(s => (
                  <span
                    key={s.key}
                    className="tableau-self-chip"
                    style={{ color: `var(--ind-${s.key}-color)`, borderColor: `var(--ind-${s.key}-border)` } as React.CSSProperties}
                  >{s.label}</span>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Combat gauge readout (BAL/POS/RNG) — PINNED to the stage bottom-centre
          rather than hung under the self figure (Sekmeht 2026-07-17). Hanging it
          off the self (at y:78%) forced the fit-scale to reserve vertical room
          for it, which shrank the whole scene in a short panel tab; anchored to
          the bottom it can never clip regardless of container height, so the fit
          can stay generous. Fades with combat via --idle (the inCombat gate). */}
      {showGauges && (
        <div ref={gaugeRef} className={`tableau-combat-gauges${!inCombat ? ' tableau-combat-gauges--idle' : ''}`} aria-hidden="true">
          {bal !== null && balFrac !== null && (
            <BipolarGauge label="BAL" frac={balFrac} title={`Balance: ${balanceLabel(bal)} (solidly = baseline)`} />
          )}
          {pos !== null && posFrac !== null && (
            <BipolarGauge label="POS" frac={posFrac}
              title={`Position: ${positionLabel(pos)}${pos !== 0 ? (pos > 0 ? ' (you lead)' : ' (foe leads)') : ' (even)'}`} />
          )}
          {range !== null && (
            <div className="tableau-gauge tableau-gauge--range" title={`Closest threat: ${range} range`}>
              <span className="tableau-gauge-label">RNG</span>
              <span className="tableau-range-pips">
                {RANGE_ORDER.map(r => (
                  <span key={r} data-r={r} className={`tableau-range-pip${r === range ? ' tableau-range-pip--on' : ''}`}>
                    {RANGE_LETTER[r]}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* The bubble layer — constant game-font size, collision-spaced,
          speaker-named, newest on top. */}
      {laidBubbles.map(lb => (
        <div
          key={lb.key}
          className={`tableau-bubble tableau-bubble--${lb.item.channel}${lb.item.toYou ? ' tableau-bubble--toyou' : ''}`}
          style={{
            left: lb.left, top: lb.top, zIndex: lb.z, maxWidth: bubbleMaxW,
            '--bubble-tint': lb.tint, '--tail-dx': `${Math.round(lb.tailDx)}px`,
          } as React.CSSProperties}
        >
          <span className="tableau-bubble-speaker">
            {selfKeys.has(lb.item.speaker.toLowerCase()) ? character : lb.item.speaker}
            {lb.item.channel === 'whisper' ? (lb.item.toYou ? ' whispers to you' : ' whispers') : ''}
            {lb.item.channel === 'yell' ? ' yells' : ''}
          </span>
          {lb.item.text}
        </div>
      ))}

      {players.length === 0 && creatures.length === 0 && (
        <div className="tableau-empty">No one else is here.</div>
      )}
      </div>
    </div>
  )
}

export default memo(TableauExperience)
