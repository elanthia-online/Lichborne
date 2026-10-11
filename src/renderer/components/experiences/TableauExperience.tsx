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
//     and a self personal-space push. A player figure has a right-click menu
//     (v0.20.1; Enter opens it from the keyboard): Say to… / Whisper to… type
//     the start of the line into the command bar via `onDirect`, and a
//     contact also gets their card;
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
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hashStr, monogramStyle, nameColor, nameInitials } from '../../utils/nameColor'
import { activateOnKey } from '../../utils/pressable'
import { CONDITION_TITLES } from '../../attention'
import ContextMenu, { type CtxItem } from '../ContextMenu'
import { characterColor, characterColorsByName, useCharacterColors } from '../../characterColors'
import { useRosterOptional } from '../../RosterContext'
import type { Contact, ContactTemplate } from '../../contacts'
import type { ExperienceProps, SceneSpeechItem, SceneMoveItem, FaceTurn } from '../../experiences'
import { healthBand, SESSION_HEALTH_THRESHOLDS } from '../VitalsBar'
import { groupHealthOf, exactSunPhase, detectWeather, type GroupMember, type SceneMoment } from '../../experiences'
import { TableauBackdrop, TableauWeather, skyBandOf } from './tableauBackdrop'
import { sceneOf } from './tableauScene'
import { PLACES } from './tableauPlaces'
import { solveBattlefield, type BattleEdge, type Battlefield, type Pt } from '../../battlefield'
import type { SceneCreature, CreatureStatus } from '../../../shared/types'
import { useTimers } from '../../hooks/useTimers'
import { positionLabel, balanceLabel, RANGE_ORDER, ENGAGE_TTL_MS, splitAssessStatus, type AssessRange, type AssessEntity, type StrikeEvent, type Engagement } from '../../../shared/combatExtract'

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
// The relation as ONE short word, for a creature fighting someone else (the
// badge beside it says who).
const SHORT_REL: Record<string, string> = {
  'facing': 'facing', 'in front of': 'front', 'advancing on': 'advancing', 'behind': 'behind',
  'flanking': 'flank', 'beside': 'beside', 'next to': 'beside', 'to the left of': 'left',
  'to the right of': 'right', 'to left of': 'left', 'to right of': 'right',
}
function assessZone(rel: string): 'front' | 'flank' | 'behind' {
  if (rel === 'facing' || rel === 'in front of' || rel === 'advancing on') return 'front'
  if (rel === 'behind') return 'behind'
  return 'flank'
}
// A creature "reeling" (about to fall / can't defend) — worth flagging.
const ASSESS_REELING = /stunned|imbalanced|unbalanced/i
const ASSESS_ZONE_ORDER: Record<string, number> = { front: 0, flank: 1, behind: 2 }
// Is an assessed creature on YOU? In a group the game's assess lists every
// fight in the room — "A rock troll (1) is facing Sekmeht" — so a creature's
// relation is only about you when its target is you (v0.20.2, Sekmeht). No
// target at all is read as you, as before.
const assessOnYou = (e: { target: string | null }) => !e.target || /^you$/i.test(e.target)
const stripArticle = (s: string) => s.replace(/^(?:an?|the|some)\s+/i, '')
// ── Fight lines (v0.20.2) ──────────────────────────────────────────────────
// One line per pair of figures fighting each other, from the assess. Keys:
// 'self', 'p:<name>', 'c:<creature id>'. A line needs both ends on stage: the
// creature in the arena (shownCreatures) and the player in the room. Players
// fighting YOU are left to the duel line; players fighting EACH OTHER are drawn
// here, and the side they are on is the point (Sekmeht): an outsider on a
// member of your group is 'hostile', two members are 'group', two strangers
// 'other'. Exported for the harness.
// DIRECTION (Sekmeht: "who's facing which one"): `aRel` is how a stands
// toward b (facing / flanking / behind …), `bRel` how b stands toward a; a
// pair the assess lists from both sides carries both, and draws an arrow at
// each end.
export type MeshLink = {
  key: string; a: string; b: string; kind: 'you' | 'group' | 'hostile' | 'other'; range: AssessRange
  aRel: string | null; bRel: string | null
}
export function computeFightLinks(
  assess: readonly AssessEntity[], shownCreatures: Set<string>,
  playerKeys: Set<string>, groupNames: Set<string>,
): MeshLink[] {
  const out: MeshLink[] = []
  const seen = new Set<string>()
  const byKey = new Map<string, MeshLink>()
  // `from` stands `rel` toward `to`.
  const link = (from: string, to: string, kind: MeshLink['kind'], range: AssessRange, rel: string) => {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`
    const have = byKey.get(key)
    if (have) {
      if (have.a === from) have.aRel = have.aRel ?? rel
      else have.bRel = have.bRel ?? rel
      return
    }
    seen.add(key)
    const l: MeshLink = { key, a: from, b: to, kind, range, aRel: rel, bRel: null }
    byKey.set(key, l)
    out.push(l)
  }
  const whoKind = (name: string): MeshLink['kind'] => (groupNames.has(name.toLowerCase()) ? 'group' : 'other')
  const isCreature = (id: string | null): boolean => !!id && !id.startsWith('-') && shownCreatures.has(id)
  for (const e of assess) {
    if (e.self) { if (isCreature(e.targetId)) link('self', `c:${e.targetId}`, 'you', e.range, e.relation); continue }
    if (e.pc) {
      if (assessOnYou(e) || !playerKeys.has(e.name.toLowerCase())) continue
      if (isCreature(e.targetId)) {
        link(`p:${e.name.toLowerCase()}`, `c:${e.targetId}`, whoKind(e.name), e.range, e.relation)
      } else if (e.target && e.targetId?.startsWith('-') && playerKeys.has(e.target.toLowerCase())) {
        const inA = groupNames.has(e.name.toLowerCase()), inB = groupNames.has(e.target.toLowerCase())
        const kind: MeshLink['kind'] = inA && inB ? 'group' : inA || inB ? 'hostile' : 'other'
        link(`p:${e.name.toLowerCase()}`, `p:${e.target.toLowerCase()}`, kind, e.range, e.relation)
      }
      continue
    }
    if (!isCreature(e.id)) continue
    if (assessOnYou(e)) link(`c:${e.id}`, 'self', 'you', e.range, e.relation)
    else if (e.target && e.targetId?.startsWith('-') && playerKeys.has(e.target.toLowerCase())) {
      link(`c:${e.id}`, `p:${e.target.toLowerCase()}`, whoKind(e.target), e.range, e.relation)
    }
  }
  return out
}

// Who is on each player (v0.20.2, Sekmeht: "who or what's focusing on a group
// member"): every creature or player in the assess facing, flanking or behind
// them, as a short name ("rock troll 1"). Not you — you have your own
// readouts. Keyed by lowercase player name. Exported for the harness.
export function computeFocus(assess: readonly AssessEntity[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const e of assess) {
    if (e.self || assessOnYou(e) || !e.target || !e.targetId?.startsWith('-')) continue
    const k = e.target.toLowerCase()
    const who = e.pc ? e.name : `${stripArticle(e.name)}${e.number != null ? ` ${e.number}` : ''}`
    const list = out.get(k) ?? []
    list.push(who)
    out.set(k, list)
  }
  return out
}
const EMPTY_FOCUS = new Map<string, string[]>()

const ASSESS_TTL_MS = 30_000  // assess is on-demand/script-driven; age it out after a fight

// ── Player combat (v0.20.2) ────────────────────────────────────────────────
// A duel = another PLAYER in the room who is engaged with you: listed in your
// ASSESS as facing/advancing on you (or as your own target), or named in the
// game's range narration ("You close to melee range on Sekmeht", "Agan closes
// to pole weapon range on you!"). Whichever of the two is NEWER wins, so a
// fresh assess can end an engagement by not listing them, and a range line
// moves the tether without waiting for the next assess.
interface Duel {
  name: string
  key: string
  range: AssessRange
  /** Who is doing the closing, when known. */
  by: 'you' | 'them' | null
  /** How they stand toward you (assess relation), when assess saw them. */
  theirs: string | null
  /** How YOU stand toward them (your own assess line), when they are your
   *  target. With `theirs`, the two arrowheads on the line (v0.20.2). */
  mine: string | null
  status: string
  /** Their look/face id (negative for players), from assess. */
  id: string | null
  isTarget: boolean
  /** In combat with you but no longer in sight — hidden, invisible or gone.
   *  Drawn as a "?" placeholder until an empty assess ends it (Sekmeht). */
  lost: boolean
}
const RANGE_WORD: Record<AssessRange, string> = { melee: 'melee', pole: 'pole', missile: 'missile' }
// How far a duelist steps from their seat toward you, per range. Missile stays
// near the seat; melee comes all the way in (held just outside your personal
// space by the self-clear pass).
const DUEL_PULL: Record<AssessRange, number> = { missile: 0.2, pole: 0.55, melee: 1 }

// `known` = names already seen IN THE ROOM as a player while fighting you. A
// duelist who then drops out of the room list stays, marked `lost`. Only those
// names can be lost: the range narration also covers creatures ("The lava drake
// closes to…"), and a creature must never become a "?" player placeholder.
export function computeDuels(
  combat: ExperienceProps['combat'],
  playerKeys: Set<string>,
  now: number,
  known: Set<string> = new Set(),
): Map<string, Duel> {
  const out = new Map<string, Duel>()
  if (!combat) return out
  // For players the snapshot is kept as long as an engagement could be (the
  // creature arena's 30s age-out is about corpses and wanderers, which a duel
  // doesn't have). A room change or an EMPTY assess clears it upstream.
  const assessOk = combat.assess.length > 0 && now - combat.assessAt < ENGAGE_TTL_MS
  const selfLine = assessOk ? combat.assess.find(e => e.self) : undefined
  // Walked out (or logged off) after this was seen: that fight is over. The
  // game sends no closing line when someone simply leaves, so without this a
  // departed duelist lingered as a "?" for up to ENGAGE_TTL_MS (bug check). A
  // player who HIDES leaves no direction, so is not here and keeps their "?".
  const leftSince = (key: string, since: number) => (combat.walkedOut?.[key] ?? 0) > since
  if (assessOk) {
    for (const e of combat.assess) {
      if (e.self || !e.pc) continue
      const key = e.name.toLowerCase()
      if ((!playerKeys.has(key) && !known.has(key)) || leftSince(key, combat.assessAt)) continue
      const towardYou = !!e.target && /^you$/i.test(e.target)
      const isTarget = !!e.id && selfLine?.targetId === e.id
      if (!towardYou && !isTarget) continue    // their fight with someone else
      // Their line is about YOU only when it targets you. When they're your
      // target but fighting someone else, their range and advance are about
      // THAT fight (bug check): take the range and the closing from your own
      // line, or the tether read "Agan, melee, closing on you" at missile.
      out.set(key, {
        name: e.name, key, range: towardYou ? e.range : selfLine!.range,
        by: towardYou && e.relation === 'advancing on' ? 'them' : (isTarget && selfLine?.relation === 'advancing on' ? 'you' : null),
        theirs: towardYou ? e.relation : null,
        mine: isTarget ? selfLine!.relation : null,
        status: e.status, id: e.id, isTarget, lost: !playerKeys.has(key),
      })
    }
    // Your OWN line names your target even when theirs is missing — e.g. you
    // are hidden, so they aren't facing you and the game lists only
    // "You (hidden and incredibly balanced) are facing Agan at missile range."
    // (Sekmeht). A player target (negative id) in the room is a duel from your
    // side alone: range and relation from your line, no stance of theirs.
    const tgt = selfLine?.target
    if (selfLine && tgt && selfLine.targetId?.startsWith('-')) {
      const key = tgt.toLowerCase()
      if ((playerKeys.has(key) || known.has(key)) && !out.has(key) && !leftSince(key, combat.assessAt)) {
        out.set(key, {
          name: tgt, key, range: selfLine.range,
          by: selfLine.relation === 'advancing on' ? 'you' : null,
          theirs: null, mine: selfLine.relation, status: '', id: selfLine.targetId, isTarget: true,
          lost: !playerKeys.has(key),
        })
      }
    }
  }
  for (const g of combat.engagements) {
    const key = g.name.toLowerCase()
    if ((!playerKeys.has(key) && !known.has(key)) || now - g.at >= ENGAGE_TTL_MS || leftSince(key, g.at)) continue
    // A newer assess is the game's own word: listed → keep its detail, not
    // listed → that engagement is over.
    if (assessOk && combat.assessAt > g.at) continue
    const d = out.get(key)
    out.set(key, {
      ...(d ?? { name: g.name, key, theirs: null, mine: null, status: '', id: null, isTarget: false }),
      range: g.range, by: g.by, lost: !playerKeys.has(key),
    })
  }
  return out
}
// Normalise a creature name for cast↔assess reconciliation: lowercase + strip a
// leading article/number word (the same set sceneExtract's LEADING_ARTICLE
// strips from the cast, plus "the"), applied to BOTH sides so "A lava drake"
// (assess, article kept) matches "lava drake" (cast, article already stripped).
const ASSESS_NAME_ARTICLE = /^(?:a|an|the|some|two|three|four|five|six|seven|eight|nine|ten)\s+/
const normAssessName = (n: string) => n.toLowerCase().replace(ASSESS_NAME_ARTICLE, '').trim()

// The ASSESS PICTURE KEPT CURRENT between assesses (v0.20.2, Sekmeht: "this
// doesn't do anything until the assess fires off"). An assess is a snapshot;
// the game keeps telling us things after it, and each correction here holds
// only until the NEXT assess replaces the picture:
//  1. The ROSTER (DR's <crtrStatus>, by id) — a creature it no longer lists has
//     left the room (decayed, skinned, walked off) and is dropped.
//  2. RANGE LINES newer than the assess ("The rock troll closes to melee range
//     on you!"). A player is exact by name. A creature is anonymous, so among
//     same-named living creatures on you (or your target) the one NOT already
//     at that range is the one that moved.
//  3. Your last TURN TO FACE, newer than the assess: exact when a FACE #id
//     caused it, else by name when only one living creature fits; your old
//     target takes the place the reply names ("…on your flank at melee").
// Pure and exported for the harness. Never mutates its input.
export function correctAssess(
  assess: readonly AssessEntity[], assessAt: number,
  face: FaceTurn | null | undefined, engagements: readonly Engagement[] | undefined,
  roster: readonly CreatureStatus[] | null | undefined,
): AssessEntity[] {
  if (assess.length === 0) return assess as AssessEntity[]
  const live = roster ? new Map(roster.map(c => [c.id, c])) : null
  const out = assess
    .filter(e => e.self || e.pc || !e.id || !live || live.has(e.id))
    .map(e => ({ ...e }))
  const isDead = (id: string | null) => !!id && !!live?.get(id)?.flags.includes('dead')
  const self = out.find(e => e.self)
  for (const g of engagements ?? []) {
    if (g.at <= assessAt) continue
    const pc = out.find(e => e.pc && e.name.toLowerCase() === g.name.toLowerCase())
    if (pc) {
      if (assessOnYou(pc)) pc.range = g.range
      if (self && self.targetId && self.targetId === pc.id) self.range = g.range
      continue
    }
    const k = normAssessName(g.name)
    const mover = out.find(e => !e.self && !e.pc && !!e.id && !isDead(e.id)
      && normAssessName(e.name) === k && (assessOnYou(e) || e.id === self?.targetId) && e.range !== g.range)
    if (mover) {
      mover.range = g.range
      if (self && self.targetId === mover.id) self.range = g.range
    }
  }
  if (face && face.at > assessAt) {
    const alive = out.filter(e => !e.self && !e.pc && !!e.id && !isDead(e.id))
    const k = normAssessName(face.targetName)
    const named = alive.filter(e => normAssessName(e.name) === k)
    const onYou = named.filter(assessOnYou)
    // The id from a FACE #id counts only when the reply names the same kind of
    // creature (bug check): a FACE that got no reply leaves the id armed, and a
    // kill's automatic turn to something else would otherwise inherit it.
    const byId = face.targetId ? alive.find(e => e.id === face.targetId && normAssessName(e.name) === k) : undefined
    const tgt = byId ?? (onYou.length === 1 ? onYou[0] : named.length === 1 ? named[0] : undefined)
    if (tgt) {
      const oldId = self?.targetId ?? null
      if (self) {
        Object.assign(self, { target: tgt.name, targetId: tgt.id, targetNumber: tgt.number, relation: 'facing', range: tgt.range })
      } else {
        out.unshift({ name: 'You', id: null, number: null, status: '', relation: 'facing', target: tgt.name, targetId: tgt.id, targetNumber: tgt.number, range: tgt.range, self: true, pc: false })
      }
      if (assessOnYou(tgt)) tgt.relation = 'facing'
      const prev = face.prev
      if (prev && oldId && oldId !== tgt.id) {
        const old = out.find(e => e.id === oldId)
        if (old && !old.pc && normAssessName(old.name) === normAssessName(prev.name)) {
          if (assessOnYou(old)) old.relation = prev.relation
          if (prev.range) old.range = prev.range
        }
      }
    }
  }
  return out
}

/** The live states a <crtrStatus> can carry that are worth a word on a figure
 *  (Lich's CRTR_STATUS_FLAGS), in display order. */
const CRTR_STATE_WORDS: [string, string][] = [
  ['sleeping', 'unconscious'], ['stunned', 'stunned'], ['webbed', 'webbed'], ['immobile', 'held'],
  ['rooted', 'rooted'], ['disoriented', 'dazed'], ['calmed', 'calmed'], ['prone', 'down'],
  ['kneeling', 'kneeling'], ['sitting', 'sitting'], ['hidden', 'hidden'],
]
/** A roster creature fighting you: no "disengaged", and not asleep or dead. */
export function rosterEngaged(flags: readonly string[] | undefined): boolean {
  return !!flags && !flags.includes('disengaged') && !flags.includes('sleeping') && !flags.includes('dead')
}
export function creatureStateWords(flags: readonly string[] | undefined): string[] {
  if (!flags || flags.includes('dead')) return []
  const words = CRTR_STATE_WORDS.filter(([f]) => flags.includes(f)).map(([, w]) => w)
  // "Unconscious" already lies down; saying "down" too is noise.
  return words.includes('unconscious') ? words.filter(w => w !== 'down') : words
}

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
function BipolarGauge({ label, frac, title }: { label: string; frac: number | null; title: string }) {
  // A red → yellow → green SPECTRUM track (Sekmeht 2026-07-17: yellow neutral,
  // green toward +, red toward −) with a needle marking where you sit. `frac`
  // is −1…+1; the needle at 50 + frac·50% lands on the matching colour.
  // null = the game hasn't reported it yet: the track shows muted, with no
  // needle, so the panel keeps one shape (UX #2) without inventing a reading.
  return (
    <div className={`tableau-gauge tableau-gauge--bipolar${frac === null ? ' tableau-gauge--unknown' : ''}`} title={title}>
      <span className="tableau-gauge-label">{label}</span>
      <span className="tableau-gauge-track">
        <span className="tableau-gauge-center" />
        {frac !== null && <span className="tableau-gauge-mark" style={{ left: `${50 + frac * 50}%` }} />}
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
// Leader and health marks under a group member (v0.20.2). Quiet by default:
// nothing at all for a healthy follower (UX #1).
// HEALTH is a small meter in the same colours as your own health bar, filled to
// the bottom of the word's 10% band with the band itself shaded beyond it — the
// game gives a range, not a number, and the meter shows exactly that much.
function GroupTags({ member, focus }: { member: GroupMember; focus?: string[] }) {
  const health = groupHealthOf(member.status)
  const on = focus?.length ?? 0
  if (!member.leader && !health && on === 0) return null
  const band = health ? healthBand(health.lo, SESSION_HEALTH_THRESHOLDS) : null
  return (
    <div className="tableau-group-tags">
      {member.leader && <span className="tableau-group-chip tableau-group-chip--lead">Leader</span>}
      {health && (
        <span
          className={`tableau-group-chip tableau-group-health tableau-group-health--${band}`}
          title={health.known
            ? `${member.name} is ${member.status.toLowerCase()} — ${health.hi === 0 ? 'under 1%' : `about ${health.lo}–${health.hi}%`} health. (The word from GROUP; each one is a 10% step of the health bar.)`
            : `${member.name} is ${member.status.toLowerCase()} — most likely under 40% health. (A word below the ones seen so far.)`}
        >
          <span className="tableau-group-health-bar" aria-hidden="true">
            <span className={`vital-fill vital-fill--health-${band}`} style={{ width: `${health.lo}%` }} />
            <span className="tableau-group-health-range" style={{ left: `${health.lo}%`, width: `${health.hi + 1 - health.lo}%` }} />
          </span>
          {member.status}
        </span>
      )}
      {on > 0 && (
        <span
          className="tableau-group-chip tableau-group-chip--focus"
          title={`On ${member.name} (from your last assess): ${focus!.join(', ')}`}
        >{on} on them</span>
      )}
    </div>
  )
}

// A small SKULL for the dead (v0.20.2, Sekmeht — was a gravestone): the Dead
// list, the mark that rises where a creature falls, and (v0.20.4, Sekmeht —
// was a ✕) the avatar of your own dead figure and of a dead creature. Drawn in the text
// colour, not the emoji, which can arrive as a full-colour picture on some
// systems (pitfall #125).
function Skull() {
  return (
    <svg className="tableau-grave" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 0.9 C3.1 0.9 1.3 2.9 1.3 5.3 c0 1.6 0.8 2.7 1.9 3.4 V10.9 h5.6 V8.7 c1.1-0.7 1.9-1.8 1.9-3.4 C10.7 2.9 8.9 0.9 6 0.9 Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="4.3" cy="5.5" r="1.15" fill="currentColor" />
      <circle cx="7.7" cy="5.5" r="1.15" fill="currentColor" />
      <path d="M6 6.9 l-0.6 1.1 h1.2 Z" fill="currentColor" />
      <path d="M4.8 10.9 v-1.1 M6 10.9 v-1.1 M7.2 10.9 v-1.1" stroke="currentColor" strokeWidth="0.7" />
    </svg>
  )
}

// How long a moment's flourish stays up (v0.20.2).
const MOMENT_SHOW_MS = 2400

// One re-render when a transient (a strike, a moment, a puff) runs out, so it
// clears without waiting for the next game event.
// The earliest deadline still ahead, or 0 when none is.
function nextDeadline(ds: readonly number[]): number {
  const now = Date.now()
  let best = 0
  for (const d of ds) if (d > now && (best === 0 || d < best)) best = d
  return best
}
function useExpiryTick(deadline: number) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const wait = deadline - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => setTick(x => x + 1), wait + 30)
    return () => clearTimeout(t)
  }, [deadline])
}

// Emotes as POSES (v0.20.2): the emote's verb, mapped to a small one-shot
// movement of the figure — a bow dips, a wave wiggles, a laugh bounces. The
// caption still says exactly what happened; the pose only animates it.
const POSES: [RegExp, string][] = [
  [/^(bow|curts(y|ie)|kneel|nod|genuflect)/, 'dip'],
  [/^(wave|salute|beckon|gesture)/, 'wave'],
  [/^(laugh|giggle|chuckle|grin|smile|snicker|cackle|beam)/, 'bounce'],
  [/^(jump|hop|cheer|leap|bounce)/, 'hop'],
  [/^(dance|twirl|spin|pirouette)/, 'spin'],
  [/^(shrug)/, 'shrug'],
  [/^(cr(y|ie)|sigh|frown|pout|sniff|weep|sob|mope)/, 'droop'],
  [/^(shiver|shake|tremble|shudder|quiver)/, 'shake'],
  [/^(hug|embrace|cuddle|kiss)/, 'pulse'],
]
export function poseOf(emoteText: string): string | null {
  const verb = (emoteText.trim().split(/\s+/)[1] ?? '').toLowerCase().replace(/[^a-z]/g, '')
  for (const [re, pose] of POSES) if (re.test(verb)) return pose
  return null
}

// How long a strike's reaction stays up (v0.20.2).
const STRIKE_SHOW_MS = 1600
// The word that floats up off your figure: short, readable at a glance.
function strikeLabel(s: StrikeEvent): string {
  switch (s.outcome) {
    case 'dodge': return 'Dodge!'
    case 'block': return 'Block!'
    case 'parry': return 'Parry!'
    default: {
      const sev = s.severity ? s.severity[0].toUpperCase() + s.severity.slice(1) : 'Hit'
      return s.part ? `${sev} · ${s.part}` : sev
    }
  }
}

// ── The key (v0.20.2, Sekmeht: "I'm still not clear on all of the lines,
// dotted, the colors") ─────────────────────────────────────────────────────
// What every line, arrow, ring and chip means, one click away in the header.
// The swatches REUSE the scene's own classes (tableau-mesh-line--you, the
// arrow fills, the chips), so the key can never drift from what is drawn.
function KeyLine({ cls, dashed }: { cls: string; dashed?: boolean }) {
  return (
    <svg className="tableau-key-swatch" viewBox="0 0 34 10" aria-hidden="true">
      <line x1="2" y1="5" x2="32" y2="5" className={cls} style={dashed === false ? { strokeDasharray: 'none' } : undefined} />
    </svg>
  )
}
function KeyArrow({ zone }: { zone: 'front' | 'flank' | 'behind' }) {
  return (
    <svg className="tableau-key-swatch" viewBox="0 0 34 10" aria-hidden="true">
      <line x1="2" y1="5" x2="24" y2="5" className="tableau-mesh-line" style={{ strokeDasharray: 'none' }} />
      <path d="M22,0 L32,5 L22,10 z" className={'tableau-mesh-arrow tableau-mesh-arrow--' + zone} />
    </svg>
  )
}
function KeyRow({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return <div className="tableau-key-row"><span className="tableau-key-sw">{swatch}</span><span>{children}</span></div>
}
// A stand-in figure for the key: the scene's own avatar classes on a tiny
// circle, so "faded", "dashed" and "greyed" read exactly as they do on stage.
function KeyFig({ cls }: { cls: string }) {
  return <span className={'tableau-key-fig ' + cls} />
}
// The example name used in the key's swatches. Neutral on purpose: the key is
// shipped copy, so it must not name a real player.
const KEY_EXAMPLE = 'Ash'
export function TableauKey({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="tableau-key"
      role="region"
      aria-label="What the scene shows"
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
    >
      <div className="tableau-key-head">
        <span>What the scene shows</span>
        <button type="button" className="tableau-key-close" onClick={onClose} onKeyDown={activateOnKey(onClose)} aria-label="Close">✕</button>
      </div>
      <p className="tableau-key-intro">
        <b>Social</b> is how the scene normally looks: people stand around you and those talking drift together.
        A player fighting you takes centre stage, joined to you by a line, while everyone else steps aside to the left.
        Switch on ⚙ <b>Combat view</b> (off to start) and every fight is laid out this way: after you <b>ASSESS</b>,
        everyone in a fight moves to where it puts them. It goes back to Social 30 seconds after your last assess,
        unless something is still on you.
      </p>

      <div className="tableau-key-section">People</div>
      <KeyRow swatch={<span className="tableau-key-glyph tableau-key-star">✦</span>}>A star after the name, and a ring round them: one of your contacts, in their contact colour (your own characters keep their own colour)</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--green" />}>Green ring: in your group, standing in a row with you</KeyRow>
      <KeyRow swatch={<span className="tableau-group-chip tableau-group-chip--lead">Leader</span>}>Your group's leader</KeyRow>
      <KeyRow swatch={<span className="tableau-group-health-bar" style={{ width: '3em' }}><span className="vital-fill vital-fill--health-mid" style={{ width: '70%' }} /><span className="tableau-group-health-range" style={{ left: '70%', width: '10%' }} /></span>}>Under a group member: their health, with the game's word for it. Filled to the bottom of that word's 10% step, the shaded part is the rest of it (battered = 70–79%).</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--faded" />}>At the end of your group's row, faded: a member in another room</KeyRow>
      <KeyRow swatch={<KeyFig cls="tableau-key-fig--unseen" />}>Faded with a dashed edge: hiding or invisible. They appear while they speak.</KeyRow>
      <KeyRow swatch={<KeyFig cls="tableau-key-fig--dead" />}>Greyed: a dead player, until a resurrection stands them up</KeyRow>
      <KeyRow swatch={<KeyFig cls="tableau-key-fig--ghost" />}>Fading as it walks off: someone who just left</KeyRow>

      <div className="tableau-key-section">Talk</div>
      <KeyRow swatch={<span className="tableau-key-bubble">say</span>}>A bubble by the speaker: said, asked, exclaimed or OOC</KeyRow>
      <KeyRow swatch={<span className="tableau-key-bubble tableau-key-bubble--yell">YELL</span>}>A heavy red edge: yelled</KeyRow>
      <KeyRow swatch={<span className="tableau-key-bubble tableau-key-bubble--whisper">psst</span>}>A dashed edge, in italics: whispered</KeyRow>
      <KeyRow swatch={<span className="tableau-key-caption">bows</span>}>Small italics under a figure: an emote. The figure acts it out too.</KeyRow>
      <KeyRow swatch={<span className="tableau-key-wisp">…</span>}>The log in the bottom-left: thoughts (telepathy), newest at the bottom</KeyRow>

      <div className="tableau-key-section">On you</div>
      <KeyRow swatch={<span className="tableau-key-rings"><i className="r" /><i className="c" /><i className="a" /></span>}>Rings round you, inside out: roundtime, cast, aim, in the colours of your timer bars. Each drains as it runs out.</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph">BAL</span>}>The gauges: your balance, your position against your foe, and your range. They wake when a fight does (a blow either way, or another player engaging you) and fade about ten seconds after it goes quiet.</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--red" />}>A red pulse round you: stunned, webbed, bleeding, poisoned or diseased</KeyRow>
      <KeyRow swatch={<span className="tableau-self-chip" style={{ color: 'var(--ind-hidden-color)', borderColor: 'var(--ind-hidden-border)' }}>Hidden</span>}>Words under you: your conditions, and whether you are sitting, kneeling or prone, in your icon bar's colours. Past three, a "+N" names the rest.</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph tableau-key-pop">Parry!</span>}>A word floating up: how you met an attack (dodge, block, parry) or where it hit</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--spell" />}>A violet glow, with the spell's name under you: preparing a spell. A gold burst: a new rank.</KeyRow>

      <div className="tableau-key-section">Creatures</div>
      <KeyRow swatch={<svg className="tableau-key-swatch tableau-key-swatch--sq" viewBox="0 0 24 24" aria-hidden="true"><g className="tableau-crosshair tableau-crosshair--you" style={{ position: 'static' }}><circle cx="12" cy="12" r="8.5" /><path d="M12 0.5v6M12 17.5v6M0.5 12h6M17.5 12h6" /></g></svg>}>Crosshair: someone is facing it, in their own colour. Two facing it: a + and an ×. (Also on a player you or your group face.)</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--gold" />}>Gold ring: your target</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--red" />}>Red glow: at melee range with you</KeyRow>
      <KeyRow swatch={<span className="tableau-assess-tags"><span className="tableau-assess-rel tableau-assess-rel--front">facing you</span></span>}>Where it stands to you: <b>orange</b> in front, <b>blue</b> flanking, <b>red</b> behind. An outlined chip ("facing {KEY_EXAMPLE}") means it is on someone else, and the creature is faded.</KeyRow>
      <KeyRow swatch={<span className="tableau-assess-tags"><span className="tableau-assess-rng tableau-assess-rng--melee">M</span></span>}>Its range: <b>M</b>elee, <b>P</b>ole, <b>R</b>anged (missile)</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph">3</span>}>The small number: the game's target number for it</KeyRow>
      <KeyRow swatch={<span className="tableau-key-who"><span className="tableau-who" style={monogramStyle(KEY_EXAMPLE)}>{KEY_EXAMPLE.slice(0, 2).toUpperCase()}</span>flank</span>}>A badge in someone's colour: it is on them (here, flanking {KEY_EXAMPLE})</KeyRow>
      <KeyRow swatch={<span className="tableau-assess-state">stunned</span>}>A quiet word: how it is (unconscious, down, stunned, asleep…)</KeyRow>
      <KeyRow swatch={<span className="tableau-key-dot tableau-key-dot--new" />}>A dashed outline, no chips: it arrived after your last assess</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph tableau-key-skull"><Skull /></span>}>Skull: dead. It stays where it fell, greyed, until its body decays or is skinned. The small Dead list top-right holds corpses with no place on stage.</KeyRow>

      <div className="tableau-key-section">Fight lines (after an assess)</div>
      <KeyRow swatch={<KeyLine cls="tableau-mesh-line tableau-mesh-line--you" dashed={false} />}>You, and what you are fighting</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-mesh-line tableau-mesh-line--group" dashed={false} />}>A member of your group, and what they are fighting</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-mesh-line tableau-mesh-line--hostile" dashed={false} />}>Someone outside your group fighting one of your group</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-mesh-line" dashed={false} />}>Anyone else's fight</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-mesh-line tableau-mesh-line--you" />}><b>Dashed</b> (as here): pole or missile range. <b>Solid</b>: melee.</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-mesh-line tableau-mesh-line--you tableau-mesh-line--faced" dashed={false} />}><b>Thicker</b>: the one they are facing (their target)</KeyRow>
      <KeyRow swatch={<KeyArrow zone="front" />}>Arrows point from whoever is facing, at their target. <b>Orange</b>: in front of it.</KeyRow>
      <KeyRow swatch={<KeyArrow zone="flank" />}><b>Blue</b>: at its side, flanking it</KeyRow>
      <KeyRow swatch={<KeyArrow zone="behind" />}><b>Red</b>: behind it</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph">⇤</span>}>Small and dimmed on the left: not in the fight</KeyRow>

      <div className="tableau-key-section">A player fighting you</div>
      <KeyRow swatch={<KeyArrow zone="front" />}>One line, labelled with the range. The arrowhead is at THEIR end when you face them, at YOURS when they face you, and at both ends when you face each other.</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-tether" />}>Grey dashes: missile range</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-tether tableau-tether--pole" />}>Amber dashes: pole range</KeyRow>
      <KeyRow swatch={<KeyLine cls="tableau-tether tableau-tether--melee" dashed={false} />}>Solid red: melee</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph">⇢</span>}>Dashes that move: someone is closing in, toward whoever is being closed on</KeyRow>
      <KeyRow swatch={<span className="tableau-key-glyph">?</span>}>A faint dotted line to a "?": they have gone out of sight. Search, or assess to clear it.</KeyRow>
    </div>
  )
}

// The rings own the 10 Hz timer clock (bug check, v0.20.2): useTimers in the
// Tableau body re-rendered the WHOLE scene ten times a second for every
// roundtime — battlefield, overlap passes, line measuring and all — when only
// these sweeps move. The scene needs just "is a timer running", which it reads
// from the expiry stamps and one wake-up at the last one.
function TimedRings({ rtExpires, ctExpires, aimExpires }: { rtExpires: number; ctExpires: number; aimExpires: number }) {
  const { aim, rtPct, ctPct, aimMax } = useTimers(rtExpires, ctExpires, aimExpires)
  return <CombatRings rtPct={rtPct} ctPct={ctPct} aimPct={aimMax > 0 ? (aim / aimMax) * 100 : 0} />
}
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
// Figure scale on the duel bench (v0.20.2): small enough that the bench reads
// as set aside, large enough to still recognise who is there.
const BENCH_SC = 0.7
type LatchedPos = { x: number; y: number; sc: number; benched: boolean }
// Figure scale in your group's row: a touch larger than the bench — these are
// your people.
const GROUP_SC = 0.8
// How far along the open stage an opponent stands from you, per range.
const DUEL_REACH = { missile: 1, pole: 0.7, melee: 0.42 } as const
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
// Your posture as a chip (F135, v0.20.3, Sekmeht), from `combat.stance`, which the
// game's posture indicators set (the Icon Bar's stance chip reads the same
// state). Standing shows nothing: the line stays quiet unless it's unusual.
const SELF_POSTURES: Record<string, string> = { sitting: 'Sitting', kneeling: 'Kneeling', prone: 'Prone' }
// Condition chips shown on your one reserved line; any more fold into "+N".
const MAX_CONDITION_CHIPS = 3

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
function TableauExperience({ character, characterId, roomState, sceneCast, speech: rawSpeech, moves: rawMoves, indicators, contacts, contactTemplates, settings, isActive, onOpenContact, onCommand, onDirect, guild, hidden, combat: combatIn, group, serverClockOffsetMs, weather, place }: ExperienceProps) {
  // The assess picture kept current between assesses (correctAssess, above):
  // every reader below — duels, fight lines, the battlefield, crosshairs — sees
  // the corrected list without knowing it was corrected.
  // The ROSTER is trusted only while it AGREES with the room's own creature
  // list (Sekmeht, 2026-10-02: walking into a room showed no creatures until an
  // assess). A move clears it, and if the new room's list ever arrives without
  // its <crtrStatus> tags it stays empty — which then hid every creature the
  // room list plainly shows. Same count (living + dead) = the same refresh;
  // anything else falls back to the name-based display it had before.
  const castTotal = sceneCast.creatures.reduce((n, c) => n + (c.count ?? 1), 0)
  const trustedRoster = useMemo(
    () => (combatIn?.roster && combatIn.roster.length === castTotal ? combatIn.roster : null),
    [combatIn?.roster, castTotal])
  const combat = useMemo(() => (!combatIn ? combatIn : {
    ...combatIn,
    roster: trustedRoster,
    assess: combatIn.assess.length > 0
      ? correctAssess(combatIn.assess, combatIn.assessAt, combatIn.face, combatIn.engagements, trustedRoster)
      : combatIn.assess,
  }), [combatIn, trustedRoster])
  // The room's creatures by id (DR's <crtrStatus>); null when not sent or not trusted.
  const rosterById = useMemo(() => (trustedRoster ? new Map(trustedRoster.map(c => [c.id, c])) : null), [trustedRoster])
  // v0.20.1: the player right-click menu — who it's for, where it opened, and
  // whether the keyboard opened it (then focus goes into the menu).
  const [figMenu, setFigMenu] = useState<{ x: number; y: number; name: string; contactId?: string; keyboard: boolean } | null>(null)
  // Stable, because ContextMenu re-binds its outside-click listener whenever
  // onClose changes and this scene re-renders on every bubble tick.
  const closeFigMenu = useCallback(() => setFigMenu(null), [])
  // The menu is portaled to <body>, so switching characters would leave it
  // floating over the other one — and a pick would type into a hidden bar.
  useEffect(() => { if (!isActive) setFigMenu(null) }, [isActive])
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
  // The game font this window ACTUALLY renders at. The window's A−/A+ (and a
  // panel tab's) override --game-font-size on its own subtree, so the global
  // settings.fontSize is wrong whenever someone has zoomed — and every size
  // estimate below (the spacing pass, the bench, the bubbles) then ran small,
  // which is how zoomed-in figures overlapped (v0.20.2, Sekmeht).
  const [gameFs, setGameFs] = useState(0)
  useLayoutEffect(() => {
    const st = sceneRef.current
    const g = st ? parseFloat(getComputedStyle(st).getPropertyValue('--game-font-size')) : 0
    if (g > 0) setGameFs(prev => (prev === g ? prev : g))
    const h = gaugeRef.current?.offsetHeight ?? 0
    setGaugeH(prev => (prev === h ? prev : h))
    const s = statusRef.current?.offsetHeight ?? 0
    setStatusH(prev => (prev === s ? prev : s))
    const w = wispsRef.current?.offsetHeight ?? 0
    setWispH(prev => (prev === w ? prev : w))
  })

  // Speech ages on its own, with no new event to show it: a bubble or wisp
  // runs out (BUBBLE_TTL_MS), a talker's pull toward the conversation circle
  // steps down (every PROMOTE_TTL_MS / 20 — the 5% steps below), and a speaker
  // loses their promoted seat (PROMOTE_TTL_MS). Wake for the EARLIEST of those
  // and nothing else (perf pass, v0.20.2). It used to re-render the whole scene
  // once a second for two minutes after anyone spoke, so a chatty room never
  // stopped redrawing — in every character's Tableau at once (pitfall #139: wake
  // for each thing that ages, never on a clock).
  const speechWake = (() => {
    const t = Date.now()
    const step = PROMOTE_TTL_MS / 20
    let best = 0
    const consider = (d: number) => { if (d > t && (best === 0 || d < best)) best = d }
    for (const s of speech) {
      consider(s.ts + BUBBLE_TTL_MS)
      if (s.channel === 'thought') continue
      const age = t - s.ts
      if (age >= PROMOTE_TTL_MS) continue
      consider(s.ts + PROMOTE_TTL_MS)
      // The next age at which round((1 - age/W) * 20) changes.
      consider(s.ts + (Math.floor(age / step - 0.5) + 1.5) * step)
    }
    return best
  })()
  useExpiryTick(speechWake)

  // ── Combat HUD facet (G1, DESIGN §32.1) ─────────────────────────────────────
  // Layers round your figure: the readiness rings (while a timer runs; they
  // tick inside TimedRings, pitfall #168), the danger pulse (while a condition
  // lasts), and the gauges, which show only while you are FIGHTING (below).
  // Threat styling on creatures comes from the assess, never from this.
  const timerEnd = Math.max(combat?.rtExpires ?? 0, combat?.ctExpires ?? 0, combat?.aimExpires ?? 0)
  const timersLive = timerEnd > Date.now()
  useExpiryTick(timerEnd)
  const danger = !hidden?.danger && DANGER_KEYS.some(k => indicators[k])
  // Player combat (v0.20.2). Computed early because an engagement also counts as
  // combat: a duel that is all positioning has no roundtime and no wounds, so
  // without it the gauges never woke for one.
  const knownDuelistsRef = useRef(new Set<string>())
  const duels = hidden?.duel ? new Map<string, Duel>()
    : computeDuels(combat, new Set(players.map(p => p.name.toLowerCase())), Date.now(), knownDuelistsRef.current)
  // Remember who has been seen as a player while fighting you, so they can be
  // shown as lost (not dropped) if they slip out of sight. After render, so the
  // set is never written mid-render (pitfall #70); a name is only ever added.
  useEffect(() => {
    for (const d of duels.values()) if (!d.lost) knownDuelistsRef.current.add(d.key)
  })
  // Combat HAPPENING (v0.20.2, Sekmeht: "anytime someone forces an attack on
  // you it should come up immediately"): a blow in either direction in the
  // last couple of seconds. The game prints a combat line for every swing at
  // you or by you, so this is live the whole time a fight is, with no timer of
  // your own running; the sticky hold below carries it between swings. One
  // re-render when the pulse runs out lets the hold start counting.
  const PULSE_MS = 2500
  const pulseAt = combat?.pulseAt ?? 0
  const pulseLive = Date.now() - pulseAt < PULSE_MS
  useExpiryTick(pulseAt ? pulseAt + PULSE_MS : 0)
  // Only FIGHTING counts — a blow or a balance reading (the pulse), or a player
  // duel. NOT a roundtime and NOT a condition: a crafting script runs back-to-
  // back roundtimes for hours, and bleeding or a disease can outlast a fight by
  // far, and either one held the gauges up in a quiet town (Sekmeht, shaping,
  // 2026-10-02). The rings still show your roundtime and the avatar still pulses
  // for a wound; those are their own layers.
  const combatLive = duels.size > 0 || pulseLive
  // "In combat" is STICKY — once a real combat signal fires it stays true
  // briefly after things go quiet, so the cockpit doesn't flicker off in the gap
  // between blows.
  // Starts IN combat when it is already live, so a Tableau opened mid-fight
  // shows its gauges from the first frame rather than one effect later.
  const [inCombat, setInCombat] = useState(combatLive)
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
  // Held past its 30s while the ROSTER says the fight is still on (v0.20.2): a
  // creature from it still engaged with you. The corrections above keep that
  // picture current; ENGAGE_TTL_MS bounds it. A CORPSE does not hold it
  // (Sekmeht): a kill that ends the fight left the combat view up for as long as
  // the body lay there, up to ten minutes. Corpses keep their place without it.
  const assessAge = combat && combat.assess.length > 0 ? Date.now() - combat.assessAt : Infinity
  // "On you" = no disengaged flag AND awake (bug check): a sleeping creature
  // carries no disengaged flag either, and held the arena for ten minutes.
  const rosterHolds = !!rosterById && assessAge < ENGAGE_TTL_MS && combat!.assess.some(e =>
    !e.self && !e.pc && !!e.id && rosterEngaged(rosterById.get(e.id)?.flags))
  const showAssess = !hidden?.creatures && !!combat && combat.assess.length > 0 && (assessAge < ASSESS_TTL_MS || rosterHolds)
  // Other players' fights from the same assess (v0.20.2): hunting together, the
  // game lists "Sekmeht (incredibly balanced) is facing a rock troll (1) at
  // melee range." Shown as a small "vs rock troll" tag under that player — not
  // a duel (that's only someone engaged with YOU).
  const allyFights = new Map<string, AssessEntity>()
  if (showAssess) {
    for (const e of combat!.assess) {
      if (e.self || !e.pc || assessOnYou(e)) continue
      allyFights.set(e.name.toLowerCase(), e)
    }
  }
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
  // With the roster, who is here and who is dead is KNOWN by id — correctAssess
  // already dropped everyone it no longer lists, and the dead stay (drawn as
  // corpses). The name-count reconciliation below is only the fallback for a
  // connection that never sends <crtrStatus>.
  const deadIds = new Set(rosterById ? assessRaw.filter(e => rosterById.get(e.id!)?.flags.includes('dead')).map(e => e.id!) : [])
  // Which of a name's copies to drop when there are more than are alive: the
  // one YOU were facing first (bug check) — you most likely just killed it — and
  // then from the end, as before. Dropping blindly from the end kept your dead
  // target crosshaired "facing you" while the live one vanished.
  const selfTargetId = showAssess ? combat!.assess.find(e => e.self)?.targetId : undefined
  const assessByName = new Map<string, AssessEntity[]>()
  for (const e of assessRaw) {
    const k = normAssessName(e.name)
    assessByName.set(k, [...(assessByName.get(k) ?? []), e])
  }
  const assessDropped = new Set<AssessEntity>()
  for (const [k, list] of assessByName) {
    let excess = list.length - (liveAssessCap.get(k) ?? 0)
    if (excess <= 0) continue
    const order = [...list.filter(e => e.id === selfTargetId), ...[...list].reverse().filter(e => e.id !== selfTargetId)]
    for (const e of order) { if (excess-- <= 0) break; assessDropped.add(e) }
  }
  const assessReconciled = assessRaw.filter(e => !assessDropped.has(e))
  // Safety net: if reconciliation dropped EVERYTHING but the cast still lists
  // live creatures, the names disagree between assess and the room-creature
  // parse — show the raw snapshot rather than blank the arena (which REPLACES
  // the normal creature figures, so a blank = no creatures at all). Never worse
  // than pre-fix. When the cast is empty (you left / all decayed), blanking is
  // correct, so this fallback deliberately doesn't fire there.
  const assessCreatures = rosterById ? assessRaw
    : (assessReconciled.length === 0 && assessRaw.length > 0 && liveAssessCap.size > 0)
      ? assessRaw
      : assessReconciled
  // The living ones — what the battlefield lays out and fight lines join.
  const assessLiving = deadIds.size > 0 ? assessCreatures.filter(e => !deadIds.has(e.id!)) : assessCreatures
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
    // In 5% steps (bug check): a smooth decay moved every talker a hair on
    // every render, re-arming their 400ms slide so it never finished
    // (pitfall #160). A step changes a position only when it means something.
    e.score += Math.round((1 - age / CHAT_WINDOW_MS) * 20) / 20
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
  // ── Place: the backdrop (v0.20.2) ─────────────────────────────────────────
  // The kind of place from the room's name and description (tableauScene),
  // and the time of day from the
  // server clock (exactSunPhase — no Lich needed). Re-derived per minute.
  const scene = useMemo(
    () => sceneOf(roomState.title ?? '', roomState.desc ?? '', place ? PLACES[place] : null),
    [roomState.title, roomState.desc, place],
  )
  const skyMinute = Math.floor((Date.now() + (serverClockOffsetMs ?? 0)) / 60_000)
  const sky = useMemo(() => skyBandOf(exactSunPhase(skyMinute * 60_000), scene.enclosure), [skyMinute, scene.enclosure])

  // ── Strikes on you (v0.20.2) ──────────────────────────────────────────────
  // The newest few, shown for STRIKE_SHOW_MS: a word floats off your figure,
  // your figure flashes, and the attacker flashes when it's unambiguous. One
  // re-render after the newest expires so it clears without waiting for an event.
  const strikesAll = !hidden?.reactions && combat ? (combat.strikes ?? []) : []
  const liveStrikes = strikesAll.filter(st => Date.now() - st.at < STRIKE_SHOW_MS)
  const newestStrike = strikesAll[strikesAll.length - 1]
  const [, setStrikeTick] = useState(0)
  useEffect(() => {
    if (!newestStrike) return
    const wait = newestStrike.at + STRIKE_SHOW_MS + 50 - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => setStrikeTick(x => x + 1), wait)
    return () => clearTimeout(t)
  }, [newestStrike?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Moments, the spell, the weather, your hands (v0.20.2) ────────────────
  const momentsAll = !hidden?.moments && combat ? (combat.moments ?? []) : []
  const liveMoments: SceneMoment[] = momentsAll.filter(m => Date.now() - m.at < MOMENT_SHOW_MS)
  const newestMoment = momentsAll[momentsAll.length - 1]
  // A spell building: a glow round you, its name under you.
  const preparing = !hidden?.moments && combat?.spell && combat.spell !== 'None' ? combat.spell : ''
  // Weather from the last reading, if it's recent and you're outside.
  // Memoized on its inputs: a fresh object each render would re-render the
  // particle layer on every 10 Hz timer tick for nothing.
  const wxOn = !hidden?.weather && !!weather && !weather.indoor && scene.enclosure === 'outdoor'
    && Date.now() - weather.observedAt < 30 * 60_000
  const wxFx = useMemo(() => (wxOn && weather ? detectWeather(weather.text) : null), [wxOn, weather?.text])  // eslint-disable-line react-hooks/exhaustive-deps
  // Opt-in (defaultHidden, Sekmeht): shown only when switched ON explicitly.
  // Both slots always, L then R, so the row is one fixed line: an empty hand
  // keeps its (invisible) place. Chips that came and went, or wrapped to a
  // second line for a long item, changed the figure's height and bobbed your
  // avatar every time you drew or stowed something (Sekmeht).
  const handsOn = hidden?.hands === false
  // Your conditions (hidden, stunned, joined…) under your figure: on unless
  // switched off in the ⚙ (Sekmeht).
  const conditionsOn = !hidden?.conditions
  const handSlots = ([['L', combat?.leftHand], ['R', combat?.rightHand]] as const)
    .map(([side, item]) => ({ side, item: item && item !== 'Empty' ? item : null }))

  // The key panel (v0.20.2): what every line, arrow and colour means.
  const [showKey, setShowKey] = useState(false)

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
  // Anyone you're fighting seats first of all (v0.20.2): a duelist lost in the
  // "+N others" crowd would be the one figure that matters most, missing.
  const seatRank = (name: string) => {
    const k = name.toLowerCase()
    return (duels.has(k) ? 2 : 0) + (recentSpeakers.has(k) ? 1 : 0)
  }
  const prioritized = recentSpeakers.size === 0 && duels.size === 0 ? players
    : [...players].sort((a, b) => seatRank(b.name) - seatRank(a.name))
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

  // ── Social and Combat views (v0.20.2, Sekmeht) ──────────────────────────
  // SOCIAL: people standing around — the conversation circle, the arc, your
  // group in a row beside you. COMBAT, for any fight, creatures or players:
  // everyone in a fight is placed by the battlefield solver from the assess
  // (who faces whom, who is behind or flanking, at what range — see
  // battlefield.ts), your group's members beside you on your baseline, other
  // players' fights in their own clusters above, and everyone NOT fighting on
  // a BENCH down the left edge so they don't pull focus. It is combat while an
  // assess is fresh or a player is engaged with you, social once it's over;
  // every move glides. ⚙ "Combat view" off keeps the social view (a duel then
  // still clears a stage: the bench plus duel slots, the pre-battlefield way).
  const groupList = !hidden?.group && group ? group.members : []
  const playerKeys = new Set(players.map(p => p.name.toLowerCase()))
  // Off by default (Sekmeht): only an explicit ON in the ⚙ turns it on, the
  // same reading as Your hands (an absent key is the default).
  const battleWanted = hidden?.battle === false && (showAssess || duels.size > 0)
  const battleInputs = battleWanted ? {
    assess: showAssess ? combat!.assess : [],
    shownCreatures: showAssess ? assessLiving.map(e => e.id ?? '').filter(Boolean) : [],
    playerKeys: [...playerKeys].sort(),
    groupNames: groupList.map(m => m.name.toLowerCase()).sort(),
    // A player engaged with you before any assess: placed from the range
    // narration, facing you.
    extraEdges: [...duels.values()].filter(d => !d.lost).map((d): BattleEdge =>
      ({ from: `p:${d.key}`, to: 'self', rel: d.theirs ?? 'facing', range: d.range })),
    teamNodes: groupList.map(m => playerKeys.has(m.name.toLowerCase()) ? `p:${m.name.toLowerCase()}` : `a:${m.name.toLowerCase()}`),
  } : null
  const battleKey = battleInputs ? JSON.stringify([showAssess ? combat!.assessAt : 0, battleInputs]) : ''
  const battlePrevRef = useRef<Map<string, Pt> | undefined>(undefined)
  const battle: Battlefield | null = useMemo(() => {
    if (!battleInputs) return null
    return solveBattlefield(battleInputs.assess, {
      shownCreatures: new Set(battleInputs.shownCreatures),
      playerKeys: new Set(battleInputs.playerKeys),
      groupNames: new Set(battleInputs.groupNames),
      extraEdges: battleInputs.extraEdges,
      teamNodes: battleInputs.teamNodes,
      prev: battlePrevRef.current,
    })
  }, [battleKey])  // eslint-disable-line react-hooks/exhaustive-deps
  // Remember this solve for the next one's warm start (after commit, never
  // during render — pitfall #70).
  useEffect(() => { if (battle) battlePrevRef.current = battle.raw }, [battle])
  const inBattle = (k: string) => !!battle?.pos.has(`p:${k}`)
  // Combat (the bench) whenever the battlefield is up, and for a duel even with
  // the combat view switched off.
  const benchMode = duels.size > 0 || battle !== null
  // Unseen speakers: a voice with no room-list entry (hiding, invisible, a
  // ghost). Spoke-then-LEFT is excluded — a departure newer than the bubble
  // means their ghost already walked them out. One definition, used by the
  // bench (which seats them) and the shadow figures below.
  const isUnseenSpeaker = (b: SceneSpeechItem) => {
    const k = b.speaker.toLowerCase()
    return !selfKeys.has(k)
      && !players.some(p => p.name.toLowerCase() === k)
      && !moves.some(mv => mv.kind === 'depart' && mv.name.toLowerCase() === k && mv.ts > b.ts)
  }
  // Arrangement auto-switch: the intimate arc up to 12, the two-row
  // amphitheater beyond (Sekmeht's big-gathering case). Never while benched —
  // the crowd isn't on the arc then.
  const isLarge = !benchMode && players.length > SEAT_COUNT
  const seatCount = isLarge ? SEAT_COUNT_LARGE : SEAT_COUNT
  // The figure em in px, and the creature row's bottom edge (% of the stage),
  // shared by the bench, the duel slots and the spacing pass.
  const baseEm = (gameFs || settings.fontSize || 12) * fitScale
  const creatureRowTop = !hidden?.creatures && creatures.length > 0 ? (isLarge ? 13 : 21) : null
  const creatureBottom = creatureRowTop === null || sceneSize.h === 0 ? 0
    : creatureRowTop + ((5 * baseEm * (isLarge ? 0.84 : 1)) / 2) / sceneSize.h * 100
  // ── Your group, beside you (v0.20.2, Sekmeht) ─────────────────────────
  // Your group stands in a ROW with you along the bottom — one team facing the
  // creatures across the stage, the fight lines running between them. Present
  // members nearest, alternating right and left of you; members somewhere else
  // faded at the outer ends; "+N" when the row is full. Their details (leader,
  // health, what is on them) sit under each, the way yours sit under you. A
  // member who engages you in a fight goes centre stage like any opponent.
  // While the row stands you keep your foreground spot rather than drifting
  // toward a conversation, so the row stays lined up with you.
  //
  // Your foreground height, computed here because the row is laid out from it;
  // the gauge clamp further down lands on exactly this value.
  const selfRowY = showGauges && gaugeH > 0 && sceneSize.h > 0
    ? Math.min(78, Math.max(46, ((sceneSize.h - (2 * gaugeH + statusH)) / sceneSize.h) * 100))
    : 78
  const groupPosByKey = new Map<string, { x: number; y: number; depth: number }>()
  const groupAway: { m: GroupMember; x: number; y: number }[] = []
  let groupCrowd: { x: number; y: number; n: number } | null = null
  if (!battle) {
    const entries = [
      ...groupList.filter(m => playerKeys.has(m.name.toLowerCase()) && !duels.has(m.name.toLowerCase())),
      ...groupList.filter(m => !playerKeys.has(m.name.toLowerCase())),
    ]
    if (entries.length > 0) {
      const W = sceneSize.w || 600, H = sceneSize.h || 300
      const pad = 0.6 * baseEm
      const slotW = 6 * baseEm * GROUP_SC
      const selfHalf = 3.8 * baseEm             // your figure, rings included
      const sx = W / 2                          // you stand at the centre
      const rightN = Math.max(0, Math.floor((W - pad - (sx + selfHalf)) / slotW))
      const leftN = Math.max(0, Math.floor((sx - selfHalf - pad) / slotW))
      // Nearest first, right then left: R0, L0, R1, L1, …
      const order: { side: 1 | -1; k: number }[] = []
      for (let k = 0; order.length < rightN + leftN; k++) {
        if (k < rightN) order.push({ side: 1, k })
        if (k < leftN) order.push({ side: -1, k })
      }
      // Line the AVATARS up with yours: your figure carries more below its
      // avatar (the ring margin, the gauges' clearance) than a member's does.
      const y = selfRowY - (0.85 * baseEm) / H * 100
      const at = (i: number) => ({ x: (sx + order[i].side * (selfHalf + slotW * (order[i].k + 0.5))) / W * 100, y })
      const cap = order.length
      if (cap > 0) {
        const fit = entries.length > cap ? cap - 1 : entries.length
        entries.slice(0, fit).forEach((m, i) => {
          const p = at(i)
          if (playerKeys.has(m.name.toLowerCase())) groupPosByKey.set(m.name.toLowerCase(), { ...p, depth: 0 })
          else groupAway.push({ m, ...p })
        })
        if (entries.length > fit) groupCrowd = { ...at(fit), n: entries.length - fit }
      }
    }
  }
  const groupRow = groupPosByKey.size > 0 || groupAway.length > 0 || groupCrowd !== null

  const benchPosByKey = new Map<string, { x: number; y: number; depth: number }>()
  // Bench spots for unseen bystanders who are speaking, so their shadow
  // figure (and its bubble) sits with everyone else not in the fight.
  const benchUnseenPos = new Map<string, { x: number; y: number; depth: number }>()
  let benchLabel: { x: number; y: number } | null = null
  let benchCrowd: { x: number; y: number } | null = null
  let benchRightPx = 0
  let seated: typeof players
  let overflow: number
  if (benchMode) {
    // Laid out in pixels (a hidden tab measures 0×0 — any size will do then).
    // One column, a second when the first is full, then "+N".
    const W = sceneSize.w || 600, H = sceneSize.h || 300
    const pad = 0.6 * baseEm
    const slotW = 5.2 * baseEm * BENCH_SC
    const slotH = 3.9 * baseEm * BENCH_SC
    const labelH = 1.1 * baseEm
    const top = pad
    // Stop short of the thought log in the bottom-left corner when it has
    // anything in it.
    // …and above your group's row, when there is one.
    const bottom = Math.min((wisps.length > 0 ? 0.68 : 0.97) * H,
      groupRow ? (selfRowY / 100) * H - 3.6 * baseEm : Infinity)
    const rows = Math.max(1, Math.floor((bottom - top - labelH) / slotH))
    const fighters = prioritized.filter(p => duels.has(p.name.toLowerCase()) || inBattle(p.name.toLowerCase()))
    // Your group never sits on the bench: they stand with you.
    const others = prioritized.filter(p => !fighters.includes(p) && !groupPosByKey.has(p.name.toLowerCase()))
    // Speaking first: an unseen voice needs a head for its bubble to point at.
    const unseen = [...bubbles.values()].filter(isUnseenSpeaker)
      .map(b => b.speaker.toLowerCase()).filter(k => !duels.has(k))
    const total = unseen.length + others.length
    const cols = total > rows ? 2 : 1
    const cap = rows * cols
    const fit = total > cap ? cap - 1 : total
    const unseenN = Math.min(unseen.length, fit)
    const shownN = fit - unseenN
    const slot = (i: number) => {
      const row = cols === 2 ? Math.floor(i / 2) : i
      const col = cols === 2 ? i % 2 : 0
      return { x: (pad + slotW * (col + 0.5)) / W * 100, y: (top + labelH + slotH * (row + 0.5)) / H * 100 }
    }
    unseen.slice(0, unseenN).forEach((k, i) => benchUnseenPos.set(k, { ...slot(i), depth: 0 }))
    others.slice(0, shownN).forEach((p, i) => benchPosByKey.set(p.name.toLowerCase(), { ...slot(unseenN + i), depth: 0 }))
    if (others.length > shownN) benchCrowd = slot(fit)
    if (total > 0) {
      // Centred over the column(s), like the figures in them.
      benchLabel = { x: (pad + slotW * cols / 2) / W * 100, y: top / H * 100 }
      benchRightPx = pad + slotW * cols
    }
    seated = [...fighters, ...prioritized.filter(p => groupPosByKey.has(p.name.toLowerCase())), ...others.slice(0, shownN)]
    overflow = others.length - shownN
  } else {
    const rest = prioritized.filter(p => !groupPosByKey.has(p.name.toLowerCase()))
    seated = [...rest.slice(0, seatCount), ...prioritized.filter(p => groupPosByKey.has(p.name.toLowerCase()))]
    overflow = rest.length - Math.min(rest.length, seatCount)
  }
  // The battlefield onto the stage: uniform scale (a melee length is the same
  // on both axes), in the space right of the bench, YOU on the bottom line
  // (your foreground height, clear of the gauges).
  const battlePos = new Map<string, { x: number; y: number; depth: number }>()
  if (battle) {
    const W = sceneSize.w || 600, H = sceneSize.h || 300
    const leftPx = benchRightPx > 0 ? benchRightPx + 2.2 * baseEm : 2.8 * baseEm
    const rightPx = W - 2.8 * baseEm
    const topPx = 2.6 * baseEm
    const bottomPx = (selfRowY / 100) * H
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of battle.pos.values()) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y) }
    const spanX = Math.max(0.01, maxX - minX), spanY = Math.max(0.01, maxY - minY)
    const sc = Math.max(0, Math.min((rightPx - leftPx) / spanX, (bottomPx - topPx) / spanY, 6 * baseEm))
    const offX = leftPx + ((rightPx - leftPx) - (maxX - minX) * sc) / 2 - minX * sc
    const offY = bottomPx - maxY * sc
    for (const [k, p] of battle.pos) {
      battlePos.set(k, { x: ((p.x * sc + offX) / W) * 100, y: ((p.y * sc + offY) / H) * 100, depth: 1 })
    }
    // Nobody on anybody (v0.20.2, Sekmeht's crowded-troll shot): the solver
    // keeps figures a melee length apart, but in a small panel a melee length
    // can come out smaller than a figure — a creature with its name and chips
    // is several ems wide. So relax the placed figures in PIXELS against their
    // estimated boxes; you hold still, everyone else steps aside, all kept on
    // the stage. Estimates in the figure's em: a generous one only means air.
    {
      const em = baseEm
      const boxes: { k: string; x: number; y: number; hw: number; hh: number; fixed: boolean }[] = []
      for (const [k, p] of battlePos) {
        let wEm = 4, hEm = 4.6
        if (k === 'self') {
          // YOU are two boxes, not one (B509, v0.20.3): measured in the live render,
          // your figure is centred on its position and runs from the avatar
          // (top) through your name (5.76em of it) down to the status lines,
          // which are 12em wide (1.0em conditions, 1.2em hands, 0.5em gap).
          // The old single 6.2×6.6em guess sat too LOW on the avatar, so a
          // creature in front was placed into it, its "facing you" tag over
          // your circle; worst with your hands shown, which push the avatar
          // up. A narrow upper box keeps flankers from being shoved out by
          // the wide status lines below. Both boxes are fixed: you hold still.
          const statusEm = (handsOn || conditionsOn) ? 0.5 + (handsOn ? 1.2 : 0) + (conditionsOn ? 1.0 : 0) : 0
          const top = (p.y / 100) * H - ((5.76 + statusEm) * em) / 2
          const x = (p.x / 100) * W
          // The readiness rings are drawn OUTSIDE the avatar, about 0.6em above
          // its top, so the upper box starts there: a creature's tag must clear
          // the rings, not just the circle.
          const RING = 0.6
          boxes.push({ k, x, y: top + (2.88 - RING / 2) * em, hw: 3.1 * em, hh: (2.88 + RING / 2) * em, fixed: true })
          if (statusEm > 0) {
            // The status lines run from 0.5em below the name to the bottom.
            const sTop = top + (5.76 + 0.5) * em, sBottom = top + (5.76 + statusEm) * em
            boxes.push({ k: 'self:status', x, y: (sTop + sBottom) / 2, hw: 6 * em, hh: (sBottom - sTop) / 2, fixed: true })
          }
          continue
        }
        if (k.startsWith('c:')) {
          const e = assessCreatures.find(a => `c:${a.id}` === k)
          const rel = e ? (assessOnYou(e) ? (ASSESS_LABEL[e.relation] ?? e.relation) : `SE ${SHORT_REL[e.relation] ?? e.relation}`) : ''
          const chipChars = rel.length + 3
          wEm = Math.min(13, Math.max((e?.name.length ?? 8) * 0.5, chipChars * 0.4 + 1.2))
          hEm = 5.2
        } else if (k.startsWith('p:')) {
          wEm = Math.max(3.4, k.length * 0.5) + 1
          hEm = 5
        }
        boxes.push({ k, x: (p.x / 100) * W, y: (p.y / 100) * H, hw: (wEm * em) / 2, hh: (hEm * em) / 2, fixed: k === 'self' })
      }
      for (let it = 0; it < 40; it++) {
        let moved = false
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j]
            if (a.fixed && b.fixed) continue   // your two boxes never move each other
            const ox = a.hw + b.hw - Math.abs(a.x - b.x)
            const oy = a.hh + b.hh - Math.abs(a.y - b.y)
            if (ox <= 0 || oy <= 0) continue
            moved = true
            const alongX = ox <= oy
            const d = (alongX ? ox : oy) + 1
            const sgn = alongX ? Math.sign(a.x - b.x) || (a.k < b.k ? -1 : 1) : Math.sign(a.y - b.y) || (a.k < b.k ? -1 : 1)
            const shareA = a.fixed ? 0 : b.fixed ? 1 : 0.5
            if (alongX) { a.x += sgn * d * shareA; b.x -= sgn * d * (1 - shareA) }
            else { a.y += sgn * d * shareA; b.y -= sgn * d * (1 - shareA) }
          }
        }
        for (const b of boxes) {
          if (b.fixed) continue
          b.x = Math.min(W - b.hw - 2, Math.max(leftPx - 1.2 * em + b.hw, b.x))
          b.y = Math.min(H - b.hh - 2, Math.max(b.hh + 2, b.y))
        }
        if (!moved) break
      }
      // Fixed boxes (you) never moved, and their box centres aren't your
      // position, so only the figures that stepped aside are written back.
      for (const b of boxes) if (!b.fixed) battlePos.set(b.k, { x: (b.x / W) * 100, y: (b.y / H) * 100, depth: 1 })
    }
    // Members in another room: faded, at the ends of your line.
    for (const m of groupList) {
      const at = battlePos.get(`a:${m.name.toLowerCase()}`)
      if (at) groupAway.push({ m, x: at.x, y: at.y })
    }
  }

  const seatKey = `${seatCount}:${seated.map(p => p.name).join(' ')}`
  const seats = useMemo(() => assignSeats(seated.map(p => p.name), seatCount), [seatKey])  // eslint-disable-line react-hooks/exhaustive-deps

  // Positions resolved ONCE so self-gravity can aim at a partner's actual
  // spot (circle or seat) rather than re-deriving it.
  const seatedPosByKey = new Map<string, { x: number; y: number; depth: number }>()
  for (const p of seated) {
    const k = p.name.toLowerCase()
    const g = groupPosByKey.get(k) ?? battlePos.get(`p:${k}`)
    if (g) { seatedPosByKey.set(k, g); continue }
    if (benchMode) {
      // Duelists are placed once your own spot is final (below).
      const b = benchPosByKey.get(k)
      if (b) seatedPosByKey.set(k, b)
      continue
    }
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
  if (selfChatE && !benchMode && !groupRow) {
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
  {
    const b = battlePos.get('self')
    if (b) selfPos = { x: b.x, y: b.y }
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
  // Duel pull (v0.20.2): a player engaged with you steps toward you as the range
  // closes, so the line between you gets shorter along with the range word. It
  // runs before the self-clear below, which keeps a melee duelist beside you
  // rather than on top of you.
  // On the duel stage each opponent gets a SLOT instead: a direction fanned
  // across the open stage above you (up-right for one, spread for several)
  // and a distance by range, computed in pixels so it holds at any panel
  // shape, never closer than clear of your own figure. A lost opponent's "?"
  // and a hidden one speaking use the same slot, so nothing jumps.
  const duelSlotByKey = new Map<string, { x: number; y: number; depth: number }>()
  if (benchMode) {
    const W = sceneSize.w || 600, H = sceneSize.h || 300
    const sx = selfPos.x / 100 * W, sy = selfPos.y / 100 * H
    const topY = Math.max(creatureBottom / 100 * H + 2.4 * baseEm, 2.4 * baseEm)
    const leftX = benchRightPx + 2.6 * baseEm
    const rightX = W - 2.6 * baseEm
    const list = [...duels.values()].filter(d => !inBattle(d.key)).sort((a, b) => (a.key < b.key ? -1 : 1))
    const minD = 5.4 * baseEm
    list.forEach((d, i) => {
      const deg = list.length === 1 ? -50 : -20 - i * (120 / (list.length - 1))
      const a = (deg * Math.PI) / 180
      const reachX = Math.max(0, Math.cos(a) >= 0 ? rightX - sx : sx - leftX)
      let dx = Math.cos(a) * reachX * DUEL_REACH[d.range]
      let dy = Math.sin(a) * Math.max(0, sy - topY) * DUEL_REACH[d.range]
      const len = Math.hypot(dx, dy)
      if (len < minD) {
        if (len > 0.1) { dx *= minD / len; dy *= minD / len }
        else { dx = Math.cos(a) * minD; dy = Math.sin(a) * minD }
      }
      duelSlotByKey.set(d.key, {
        x: Math.min(97, Math.max(3, ((sx + dx) / W) * 100)),
        y: Math.min(95, Math.max(3, ((sy + dy) / H) * 100)),
        depth: 1,
      })
    })
    for (const p of seated) {
      const k = p.name.toLowerCase()
      const s = duelSlotByKey.get(k)
      if (s && !inBattle(k)) seatedPosByKey.set(k, s)
    }
  } else {
    for (const d of duels.values()) {
      const pos = seatedPosByKey.get(d.key)
      if (!pos) continue
      const dx = pos.x - selfPos.x, dy = pos.y - selfPos.y
      const dist = Math.hypot(dx, dy)
      if (dist < 0.1) continue
      const want = Math.max(SELF_CLEAR_R + 3, dist * (1 - DUEL_PULL[d.range]))
      if (want >= dist) continue
      const k = want / dist
      seatedPosByKey.set(d.key, { ...pos, x: selfPos.x + dx * k, y: selfPos.y + dy * k })
    }
  }
  for (const [k, pos] of seatedPosByKey) {
    // The duel slots already keep clear of you, in pixels; the bench is fixed.
    if (selfKeys.has(k) || benchMode || groupPosByKey.has(k)) continue
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

  // Lost duelists (v0.20.2): where their "?" placeholder stands — the same hash
  // seat their departure ghost and an unseen speaker use, so it appears where
  // they faded. A lost duelist who is speaking from hiding is already drawn as
  // an unseen speaker; that figure carries the tether instead.
  const lostPosByKey = new Map<string, { x: number; y: number; depth: number }>()
  for (const d of duels.values()) {
    if (d.lost && !bubbles.has(d.key)) lostPosByKey.set(d.key, duelSlotByKey.get(d.key) ?? seatPos(hashStr(d.key) % seatCount, seatCount))
  }

  // ── Spacing pass (v0.20.2) — nobody stands on anybody ────────────────────
  // Seats, the conversation circle, the duel pull and the self-clear are each
  // placed on their own, so two figures could land on one spot (Sekmeht: Agan,
  // pulled toward you, on top of Urbaj). One last relaxation over every player
  // figure's estimated on-screen box pushes overlapping pairs apart along the
  // axis that overlaps least, keeps everyone off YOUR figure, and keeps players
  // below the creature row. It runs from the computed positions every render,
  // so it is deterministic (no drift, no jitter) and the 400ms figure glide
  // turns each nudge into a step aside. Box sizes are ESTIMATES in the figure's
  // own em (game font × fit × depth scale); a generous estimate only means a
  // little more air between people.
  if (sceneSize.w > 0 && sceneSize.h > 0) {
    const W = sceneSize.w, H = sceneSize.h
    type Box = { key: string; x: number; y: number; dy: number; hw: number; hh: number; fixed: boolean; lost: boolean }
    const ownW = W / 100, ownH = H / 100   // % → px per axis
    const boxes: Box[] = []
    const addBox = (key: string, pos: { x: number; y: number; depth: number }, name: string, extraEm: number, dy: number, lost: boolean) => {
      // A benched figure is smaller and FIXED: the bench is laid out already,
      // and only the people centre stage step around it.
      const benched = benchPosByKey.has(key) || groupPosByKey.has(key) || battlePos.has(`p:${key}`)
      const colSc = benchPosByKey.has(key) ? BENCH_SC : groupPosByKey.has(key) ? GROUP_SC : null
      const em = baseEm * (isLarge ? 0.84 : 1) * (colSc ?? 0.8 + pos.depth * 0.25)
      const wEm = Math.max(2.6, Math.min(4.8, name.length * 0.42)) + 0.7
      const hEm = 3.8 + extraEm + 0.5
      boxes.push({ key, x: pos.x, y: pos.y + dy, dy, hw: (wEm * em / 2) / W * 100, hh: (hEm * em / 2) / H * 100, fixed: benched, lost })
    }
    for (const p of seated) {
      const k = p.name.toLowerCase()
      const pos = seatedPosByKey.get(k)
      if (!pos) continue
      const d = duels.get(k)
      addBox(k, pos, p.name, d ? (d.status ? 1.8 : 1.1) : 0, p.posture ? 3 : 0, false)
    }
    for (const [k, pos] of lostPosByKey) addBox(k, pos, duels.get(k)?.name ?? k, 0, 0, true)
    // You: fixed — everyone else steps around you. Avatar 3.2em, name, and
    // the status chips under it.
    const selfEm = baseEm
    boxes.push({ key: '__self', x: selfPos.x, y: selfPos.y, dy: 0, hw: (5 * selfEm / 2) / W * 100, hh: (6 * selfEm / 2) / H * 100, fixed: true, lost: false })
    for (let iter = 0; iter < 16; iter++) {
      let moved = false
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j]
          if (a.fixed && b.fixed) continue
          const ox = a.hw + b.hw - Math.abs(a.x - b.x)
          const oy = a.hh + b.hh - Math.abs(a.y - b.y)
          if (ox <= 0 || oy <= 0) continue
          moved = true
          // Separate along the axis with the smaller overlap in PIXELS (the %
          // axes are different lengths). Ties break on name so it's stable.
          const alongX = ox * W <= oy * H
          const delta = (alongX ? ox : oy) + 0.2
          const da = alongX ? a.x - b.x : a.y - b.y
          const dir = da !== 0 ? Math.sign(da) : (a.key < b.key ? -1 : 1)
          const shareA = a.fixed ? 0 : b.fixed ? 1 : 0.5
          const shareB = 1 - shareA
          if (alongX) { a.x += dir * delta * shareA; b.x -= dir * delta * shareB }
          else { a.y += dir * delta * shareA; b.y -= dir * delta * shareB }
        }
      }
      for (const bx of boxes) {
        if (bx.fixed) continue
        bx.x = Math.min(100 - bx.hw - 1, Math.max(bx.hw + 1, bx.x))
        bx.y = Math.min(96 - bx.hh, Math.max(Math.max(bx.hh + 1, creatureBottom + bx.hh), bx.y))
      }
      // Keep bystanders off the duel line (v0.20.2): someone sitting on the
      // line between you and your opponent hides it and its range label
      // (Sekmeht's screenshot, Garem on the Sekmeht–Agan line). Push them
      // sideways off the segment; the ends are left alone (that's you and the
      // duelist themselves).
      for (const db of boxes) {
        if (!duels.has(db.key)) continue
        const ax = selfPos.x * ownW, ay = selfPos.y * ownH
        const vx = db.x * ownW - ax, vy = db.y * ownH - ay
        const len2 = vx * vx + vy * vy
        if (len2 < 1) continue
        for (const c of boxes) {
          if (c.fixed || c === db || duels.has(c.key)) continue
          const cx = c.x * ownW, cy = c.y * ownH
          const t = ((cx - ax) * vx + (cy - ay) * vy) / len2
          if (t <= 0.08 || t >= 0.92) continue
          let nx = cx - (ax + t * vx), ny = cy - (ay + t * vy)
          const d = Math.hypot(nx, ny)
          const need = Math.max(c.hw * ownW, c.hh * ownH) * 0.9
          if (d >= need) continue
          if (d < 0.5) { nx = -vy; ny = vx }        // dead on the line: go perpendicular
          const n = Math.hypot(nx, ny)
          c.x += (nx / n) * (need - d) / ownW
          c.y += (ny / n) * (need - d) / ownH
          moved = true
        }
      }
      if (!moved) break
    }
    for (const bx of boxes) {
      if (bx.fixed) continue
      const target = bx.lost ? lostPosByKey : seatedPosByKey
      const pos = target.get(bx.key)
      if (pos) target.set(bx.key, { ...pos, x: bx.x, y: bx.y - bx.dy })
    }
  }

  // Tether geometry (v0.20.2). The line must join the avatar CIRCLES, but a
  // figure is positioned by the centre of its whole block (avatar + name +
  // chips), so % maths from the positions put the ends below the circles
  // (Sekmeht's screenshot). Instead, after each render, measure the real avatar
  // centres and write them straight onto the line and its label — no React
  // state, so no re-render. Figures glide (400ms left/top) and slide in (650ms),
  // so keep re-measuring each frame for TETHER_SETTLE_MS after every render and
  // then until two frames agree. Stopping on the first two equal frames alone
  // was the "line through the circle, then it snaps" bug: an `ease` glide
  // barely moves in its first frames, so the loop quit before the figure did.
  // A hidden character tab measures 0×0 and is skipped (pitfall #24).
  const tetherEls = useRef(new Map<string, { line?: SVGLineElement | null; label?: HTMLDivElement | null }>())
  const tetherRef = (key: string, part: 'line' | 'label') => (el: SVGLineElement | HTMLDivElement | null) => {
    const m = tetherEls.current
    const e = m.get(key) ?? {}
    if (part === 'line') e.line = el as SVGLineElement | null
    else e.label = el as HTMLDivElement | null
    m.set(key, e)
  }
  // ── Fight lines (v0.20.2, Sekmeht) ───────────────────────────────────────
  // The whole fight as a mesh: a faint line from every fighter to every
  // creature they are on — you, your group, anyone else — straight from the
  // assess, which in a shared room lists every fight ("A rock troll (1) is
  // facing Sekmeht", "Sekmeht … is facing a rock troll (1)"). Endpoints are
  // figure keys: 'self', 'p:<name>', 'c:<creature id>'; one line per pair, so
  // a troll on Sekmeht that he is also facing is drawn once. Coloured by WHO:
  // you, a member of your group (from the GROUP list), or someone else.
  // Player-versus-player stays the duel line's job.
  const meshUid = 'mesh' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const isFacer = (end: string) => end === 'self' || end.startsWith('p:')
  const focusOn = showAssess ? computeFocus(combat!.assess) : EMPTY_FOCUS

  // Which creature figure to flash for each strike: only when exactly ONE
  // figure on stage matches the attack's wording. Combat narration carries no
  // id (§32.1), so three rock trolls means none of them flashes — never the
  // wrong one.
  const attackFlash = new Map<string, number>()
  if (liveStrikes.length > 0) {
    const figs: { key: string; name: string }[] = showAssess && assessLiving.length > 0
      ? assessLiving.map(e => ({ key: `c:${e.id}`, name: stripArticle(e.name).toLowerCase() }))
      // The roster row (no assess) keys its figures by id.
      : rosterById && combat!.roster!.every(c => c.name)
        ? combat!.roster!.filter(c => !c.flags.includes('dead')).slice(0, 10).map(c => ({ key: `c:${c.id}`, name: stripArticle(c.name!).toLowerCase() }))
      : creatures.flatMap(c => {
          const total = c.count ?? 1
          const deadN = c.deadCount ?? (c.dead ? total : 0)
          const out: { key: string; name: string }[] = []
          for (let i = deadN; i < total; i++) out.push({ key: `cr-${c.name}-${i + 1}`, name: stripArticle(c.name).toLowerCase() })
          return out
        }).slice(0, 10)
    for (const st of liveStrikes) {
      if (!st.attacker) continue
      const match = figs.filter(f => f.name.length > 2 && st.attacker!.includes(f.name))
      if (match.length === 1) attackFlash.set(match[0].key, st.id)
    }
  }

  // Who is FACING each creature (v0.20.2, Sekmeht: "which one I'm facing",
  // "who in my group is facing who"): your own line's target, and each group
  // member's. Shown on the creature as "your target" / "Agan's target", and the
  // facing player's line drawn heavier.
  const facedBy = new Map<string, string[]>()
  if (showAssess) {
    const groupNames = new Set((group?.members ?? []).map(m => m.name.toLowerCase()))
    for (const e of combat!.assess) {
      if (!e.targetId || e.targetId.startsWith('-') || deadIds.has(e.targetId)) continue   // never a crosshair on a corpse
      const who = e.self ? 'you' : e.pc && groupNames.has(e.name.toLowerCase()) ? e.name : null
      if (!who) continue
      facedBy.set(e.targetId, [...(facedBy.get(e.targetId) ?? []), who])
    }
  }
  // The same for PLAYERS (v0.20.2, Sekmeht: "crosshairs on him"): a player you,
  // or someone in your group, is facing — keyed by lowercase name. Kept on the
  // DUEL's terms, not the creature arena's: the Player combat layer, and an
  // assess as old as a duel may be (ENGAGE_TTL_MS). On the creature rule (30s,
  // and the Creatures layer) the crosshair vanished while the duel line's
  // arrowhead still said you were facing him.
  const facedByPlayer = new Map<string, string[]>()
  if (!hidden?.duel && combat && combat.assess.length > 0 && Date.now() - combat.assessAt < ENGAGE_TTL_MS) {
    const groupNames = new Set((group?.members ?? []).map(m => m.name.toLowerCase()))
    for (const e of combat!.assess) {
      if (!e.targetId?.startsWith('-') || !e.target) continue
      const who = e.self ? 'you' : e.pc && groupNames.has(e.name.toLowerCase()) ? e.name : null
      if (!who) continue
      const k = e.target.toLowerCase()
      facedByPlayer.set(k, [...(facedByPlayer.get(k) ?? []), who])
    }
  }
  // A person's own Tableau colour (v0.20.2, Sekmeht): the colour their avatar
  // wears, so a crosshair or a badge says WHOSE it is at a glance. You by your
  // character colour (as your own figure), anyone else by their avatar colour.
  const personColor = (who: string): string =>
    who === 'you' || who.toLowerCase() === character.toLowerCase()
      ? (characterColor(charColors, { characterId }) ?? avatarColor(character, contacts, contactTemplates, myColors, ownNames).color)
      : avatarColor(who, contacts, contactTemplates, myColors, ownNames).color
  const facedLabel = (list: string[]) => {
    const others = list.filter(w => w !== 'you')
    const you = list.includes('you')
    if (others.length === 0) return 'your target'
    const names = others.map(n => `${n}'s`).join(' + ')
    return you ? `yours + ${names}` : `${names} target`
  }

  // The creature row runs BETWEEN the side columns, and when your figure has
  // been lifted into the row (a short stage clamps it up off the gauges) it
  // leaves a gap over you, so no creature sits on your head (Sekmeht).
  const creatureLo = benchRightPx > 0 && sceneSize.w > 0 ? Math.max(8, (benchRightPx + 0.8 * baseEm) / sceneSize.w * 100) : 8
  // The dead (v0.20.2, Sekmeht). With DR's ROSTER (<crtrStatus>, by id) a
  // creature dies WHERE IT STOOD: its figure freezes at its last place, greys
  // and steps back, a skull on it, until DR stops listing it (decayed, skinned).
  // The living re-lay out around it. The small "Dead" list in the corner is for
  // corpses with no place on stage — dead before you looked, or past the cap.
  // Without the crtrList (a connection that never sends the tag) the old name-
  // counted list stands in, as before.
  const creaturePosRef = useRef(new Map<string, { name: string; x: number; y: number }>())
  const corpsePosRef = useRef(new Map<string, { x: number; y: number }>())
  // A corpse's place: frozen once seen, else where it stood a moment ago (the
  // previous commit's positions — read only, never written in render).
  const corpseAt = (id: string): { x: number; y: number } | undefined => {
    const f = corpsePosRef.current.get(id)
    if (f) return f
    const p = creaturePosRef.current.get(`c:${id}`)
    return p ? { x: p.x, y: p.y } : undefined
  }
  const crtrList = rosterById ? combat!.roster! : null
  const rosterDead = (id: string) => !!rosterById?.get(id)?.flags.includes('dead')
  // The arena (an assess is up): its creatures, plus anyone ALIVE the crtrList
  // lists that the assess didn't (they arrived after it) — shown unassessed.
  const arenaMode = !hidden?.creatures && showAssess && assessCreatures.length > 0
  const assessedIds = new Set(assessCreatures.map(e => e.id!))
  // A dead extra stays only when it has a place to lie (bug check: an arrival
  // that died after your assess vanished into the corner list).
  const rosterExtras = arenaMode && crtrList ? crtrList.filter(c => !assessedIds.has(c.id) && (!c.flags.includes('dead') || !!corpseAt(c.id))) : []
  // No assess: the crtrList IS the row when every name paired, in the room
  // list's own order, so each creature keeps its slot and a corpse stays in it.
  const rosterRow = !hidden?.creatures && !arenaMode && crtrList && crtrList.every(c => c.name) ? crtrList : null
  const ROW_CAP = 10
  const deadList: { name: string; n: number }[] = []
  const addDead = (name: string, n: number) => {
    const have = deadList.find(d => d.name === name)
    if (have) have.n += n
    else deadList.push({ name, n })
  }
  if (crtrList && !hidden?.creatures) {
    const onStage = new Set<string>()
    if (arenaMode) {
      for (const e of assessCreatures) { if (!deadIds.has(e.id!) || corpseAt(e.id!)) onStage.add(e.id!) }
      for (const c of rosterExtras) onStage.add(c.id)
    }
    else if (rosterRow) rosterRow.slice(0, ROW_CAP).forEach(c => onStage.add(c.id))
    for (const c of crtrList) if (c.flags.includes('dead') && !onStage.has(c.id)) addDead(stripArticle(c.name ?? 'creature'), 1)
  } else {
    for (const c of creatures) {
      const n = c.deadCount ?? (c.dead ? (c.count ?? 1) : 0)
      if (n > 0) addDead(c.name, n)
    }
  }
  const creatureHi = deadList.length > 0 && sceneSize.w > 0
    ? Math.min(92, Math.max(50, (sceneSize.w - 10 * baseEm) / sceneSize.w * 100))
    : 92
  const selfTopPct = sceneSize.h > 0 ? selfPos.y - (3.6 * baseEm) / sceneSize.h * 100 : 100
  const selfGap = selfTopPct < creatureBottom + 2 && sceneSize.w > 0 ? (4.4 * baseEm) / sceneSize.w * 100 : 0
  const creatureX = (i: number, slots: number) => {
    const segs: [number, number][] = selfGap > 0 && selfPos.x - selfGap > creatureLo + 4 && selfPos.x + selfGap < creatureHi - 4
      ? [[creatureLo, selfPos.x - selfGap], [selfPos.x + selfGap, creatureHi]]
      : [[creatureLo, creatureHi]]
    const total = segs.reduce((t, [a, b]) => t + (b - a), 0)
    let d = ((i + 0.5) / Math.max(slots, 1)) * total
    for (const [a, b] of segs) { if (d <= b - a) return a + d; d -= b - a }
    return creatureHi
  }
  // Where each creature figure is drawn this render — the ONE place positions
  // are decided; the render below reads it, so they can never disagree.
  const creatureFigPos = new Map<string, { name: string; x: number; y: number }>()
  if (!hidden?.creatures) {
    if (arenaMode) {
      const rowY = isLarge ? 13 : 20
      const rowItems: { key: string; name: string }[] = []
      for (const e of assessCreatures) {
        const key = `c:${e.id}`
        if (!deadIds.has(e.id!) && !battlePos.has(key)) rowItems.push({ key, name: stripArticle(e.name).toLowerCase() })
      }
      for (const c of rosterExtras) {
        const key = `c:${c.id}`
        const name = stripArticle(c.name ?? 'creature').toLowerCase()
        if (c.flags.includes('dead')) { const cp = corpseAt(c.id); if (cp) creatureFigPos.set(key, { name, ...cp }) }
        else rowItems.push({ key, name })
      }
      rowItems.forEach((r, i) => creatureFigPos.set(r.key, { name: r.name, x: creatureX(i, rowItems.length), y: rowY }))
      for (const e of assessCreatures) {
        const key = `c:${e.id}`
        const name = stripArticle(e.name).toLowerCase()
        if (deadIds.has(e.id!)) {
          const cp = corpseAt(e.id!)
          if (cp) creatureFigPos.set(key, { name, ...cp })
          continue
        }
        const bp = battlePos.get(key)
        if (bp) creatureFigPos.set(key, { name, x: bp.x, y: bp.y })
      }
    } else if (rosterRow) {
      const shownR = rosterRow.slice(0, ROW_CAP)
      const livingOver = rosterRow.slice(ROW_CAP).some(c => !c.flags.includes('dead'))
      const slots = shownR.length + (livingOver ? 1 : 0)
      shownR.forEach((c, i) => {
        const cp = c.flags.includes('dead') ? corpsePosRef.current.get(c.id) : undefined
        creatureFigPos.set(`c:${c.id}`, { name: stripArticle(c.name!).toLowerCase(), x: cp?.x ?? creatureX(i, slots), y: cp?.y ?? (isLarge ? 13 : 22) })
      })
    } else {
      const inst: { key: string; name: string }[] = []
      for (const c of creatures) {
        const total = c.count ?? 1
        const deadN = c.deadCount ?? (c.dead ? total : 0)
        for (let i = deadN; i < total; i++) inst.push({ key: `cr-${c.name}-${i + 1}`, name: stripArticle(c.name).toLowerCase() })
      }
      const shownInst = inst.slice(0, 10)
      const slots = shownInst.length + (inst.length > 10 ? 1 : 0)
      shownInst.forEach((f, i) => creatureFigPos.set(f.key, { name: f.name, x: creatureX(i, slots), y: isLarge ? 13 : 22 }))
    }
  }
  // After render: freeze each corpse where it fell, forget the ones DR stopped
  // listing, then remember where everyone stood (never during render, #70).
  useEffect(() => {
    // Only while the roster is TRUSTED (bug check): a render where it briefly
    // disagrees with the room list has no roster, so every corpse read as gone
    // and lost the place it fell; that render's positions are keyed by name,
    // not id, so remembering them would lose it too. Leave both alone.
    if (!crtrList) return
    for (const c of crtrList) {
      if (!c.flags.includes('dead') || corpsePosRef.current.has(c.id)) continue
      const p = creatureFigPos.get(`c:${c.id}`)
      if (p) corpsePosRef.current.set(c.id, { x: p.x, y: p.y })
    }
    for (const id of [...corpsePosRef.current.keys()]) if (!rosterDead(id)) corpsePosRef.current.delete(id)
    creaturePosRef.current = creatureFigPos
  })
  // ONE wake-up at the EARLIEST thing that ages (bug check): a moment or puff
  // running out, the creature arena's 30s age-out, a duel's 10-minute one, the
  // sky's next minute, the weather reading going stale. Each was read against
  // the clock at render time with nothing to re-render when it lapsed, so in a
  // quiet room an ended fight stayed drawn indefinitely (pitfall #139).
  const assessAtMs = combat && combat.assess.length > 0 ? combat.assessAt : 0
  useExpiryTick(nextDeadline([
    newestMoment ? newestMoment.at + MOMENT_SHOW_MS : 0,
    assessAtMs ? assessAtMs + ASSESS_TTL_MS : 0,
    assessAtMs ? assessAtMs + ENGAGE_TTL_MS : 0,
    ...(combat?.engagements ?? []).map(g => g.at + ENGAGE_TTL_MS),
    (skyMinute + 1) * 60_000 - (serverClockOffsetMs ?? 0),
    weather ? weather.observedAt + 30 * 60_000 : 0,
  ]))

  const meshLinks = !hidden?.mesh && showAssess
    ? computeFightLinks(combat!.assess, new Set(assessLiving.map(e => e.id ?? '')), playerKeys,
        new Set((group?.members ?? []).map(m => m.name.toLowerCase())))
    : []

  // A player with a fight line already shows what they face; the text tag
  // under them is then only clutter.
  const meshPlayers = new Set<string>()
  for (const l of meshLinks) for (const end of [l.a, l.b]) if (end.startsWith('p:')) meshPlayers.add(end.slice(2))
  const hasLinks = duels.size > 0 || meshLinks.length > 0
  useLayoutEffect(() => {
    const stage = sceneRef.current
    if (!stage || !hasLinks) return
    let raf = 0, stable = 0, last = ''
    const until = performance.now() + 750
    const centre = (el: Element, sr: DOMRect) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top }
    }
    const tick = () => {
      const sr = stage.getBoundingClientRect()
      if (sr.width === 0 || sr.height === 0) return
      const selfEl = stage.querySelector('[data-tether-self]')
      const a = selfEl ? centre(selfEl, sr) : { x: 0, y: 0 }
      let sig = `${Math.round(a.x)},${Math.round(a.y)}`
      // Fight lines: each joins two figures named by data-fig; a line whose
      // figure isn't on stage (a creature past the row's cap) is hidden.
      for (const ln of Array.from(stage.querySelectorAll<SVGLineElement>('line[data-mesh-a]'))) {
        const ea = stage.querySelector(`[data-fig="${ln.dataset.meshA}"]`)
        const eb = stage.querySelector(`[data-fig="${ln.dataset.meshB}"]`)
        if (!ea || !eb) { ln.style.visibility = 'hidden'; continue }
        ln.style.visibility = ''
        const p = centre(ea, sr), q = centre(eb, sr)
        // Where each end meets its figure (v0.20.2, Sekmeht: "they need to connect
        // to the creature's name or the box"). A CREATURE has a fixed PIN: under
        // its chips at the centre when the line comes from below (the usual case —
        // you and your group are below), over its icon from above, at the side of
        // its block, level with the icon, from the side. Meeting the block wherever
        // the ray happened to cross it put the arrow at an arbitrary spot under the
        // chips. A PERSON's end stops at the edge of their circle, aimed at the
        // other end's pin.
        const pinOf = (el: Element, key: string | undefined, other: { x: number; y: number }) => {
          const box = key?.startsWith('c:') ? el.closest('.tableau-figure') : null
          if (!box) return null
          const r = box.getBoundingClientRect(), av = el.getBoundingClientRect()
          const cx = av.left + av.width / 2 - sr.left, cy = av.top + av.height / 2 - sr.top
          const top = av.top - sr.top, bottom = r.bottom - sr.top, left = r.left - sr.left, right = r.right - sr.left
          if (other.y > bottom) return { x: cx, y: bottom + 3 }
          if (other.y < top) return { x: cx, y: top - 3 }
          return { x: other.x < cx ? left - 3 : right + 3, y: cy }
        }
        const pinA = pinOf(ea, ln.dataset.meshA, q)
        const pinB = pinOf(eb, ln.dataset.meshB, pinA ?? p)
        const edge = (el: Element, c: { x: number; y: number }, toward: { x: number; y: number }) => {
          const dx = toward.x - c.x, dy = toward.y - c.y
          const len = Math.hypot(dx, dy) || 1
          const r = el.getBoundingClientRect().width / 2 + 3
          return len > r + 4 ? { x: c.x + (dx / len) * r, y: c.y + (dy / len) * r } : c
        }
        const p1 = pinA ?? edge(ea, p, pinB ?? q)
        const q1 = pinB ?? edge(eb, q, pinA ?? p)
        ln.setAttribute('x1', p1.x.toFixed(1)); ln.setAttribute('y1', p1.y.toFixed(1))
        ln.setAttribute('x2', q1.x.toFixed(1)); ln.setAttribute('y2', q1.y.toFixed(1))
        sig += `|${Math.round(p.x)},${Math.round(p.y)},${Math.round(q.x)},${Math.round(q.y)}`
      }
      for (const el of selfEl ? Array.from(stage.querySelectorAll<HTMLElement>('[data-tether]')) : []) {
        const parts = tetherEls.current.get(el.dataset.tether ?? '')
        if (!parts?.line) continue
        const b = centre(el, sr)
        // Ends stop at the edge of each circle (v0.20.2), so the arrowheads —
        // who is facing whom — sit outside the figures instead of under them.
        const trim = (from: { x: number; y: number }, to: { x: number; y: number }, fig: Element) => {
          const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1
          const r = fig.getBoundingClientRect().width / 2 + 3
          return len > 2 * r + 8 ? { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r } : from
        }
        const a1 = trim(a, b, selfEl!), b1 = trim(b, a, el)
        parts.line.setAttribute('x1', a1.x.toFixed(1)); parts.line.setAttribute('y1', a1.y.toFixed(1))
        parts.line.setAttribute('x2', b1.x.toFixed(1)); parts.line.setAttribute('y2', b1.y.toFixed(1))
        if (parts.label) {
          parts.label.style.left = `${((a.x + b.x) / 2).toFixed(1)}px`
          parts.label.style.top = `${((a.y + b.y) / 2).toFixed(1)}px`
        }
        sig += `|${Math.round(b.x)},${Math.round(b.y)}`
      }
      if (sig === last) { if (++stable >= 2 && performance.now() > until) return } else { last = sig; stable = 0 }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  })

  const descExcerpt = useMemo(() => {
    const d = roomState.desc.trim()
    if (!d) return ''
    const firstSentence = d.match(/^.*?[.!?](\s|$)/)?.[0] ?? d
    return firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}…` : firstSentence
  }, [roomState.desc])

  const bubbleFor = (name: string) => bubbles.get(name.toLowerCase())

  // Where each figure was last DRAWN, so a departure ghost leaves from there
  // (v0.20.2). It used to start at the name's hashed arc seat, which is not
  // even the figure's real seat (seats probe past collisions), and during a
  // fight put a benched player's ghost mid-stage, running off across it. Each
  // ghost latches its spot the first time it renders, because its figure is
  // gone from the next commit's positions.
  const lastPosRef = useRef(new Map<string, LatchedPos>())
  const ghostPosRef = useRef(new Map<number, LatchedPos>())
  useEffect(() => {
    const m = new Map<string, LatchedPos>()
    for (const [k, pos] of seatedPosByKey) {
      const benched = benchPosByKey.has(k) || groupPosByKey.has(k)
      const sc = benchPosByKey.has(k) ? BENCH_SC : groupPosByKey.has(k) ? GROUP_SC : 0.8 + pos.depth * 0.25
      m.set(k, { x: pos.x, y: pos.y, sc, benched })
    }
    lastPosRef.current = m
    const live = new Set(ghosts.map(g => g.id))
    for (const id of ghostPosRef.current.keys()) if (!live.has(id)) ghostPosRef.current.delete(id)
  })
  const ghostPos = (g: SceneMoveItem): LatchedPos => {
    let p = ghostPosRef.current.get(g.id)
    if (!p) {
      const seat = seatPos(hashStr(g.name.toLowerCase()) % seatCount, seatCount)
      p = lastPosRef.current.get(g.name.toLowerCase())
        ?? { x: seat.x, y: seat.y, sc: 0.8 + seat.depth * 0.25, benched: false }
      ghostPosRef.current.set(g.id, p)
    }
    return p
  }

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
  // During a fight, a bystander's shadow sits on the bench and an opponent's
  // in their duel slot.
  const unseenList = [...bubbles.values()]
    .filter(isUnseenSpeaker)
    .map(b => {
      const k = b.speaker.toLowerCase()
      const benched = benchUnseenPos.get(k)
      return {
        speaker: b.speaker,
        benched: !!benched,
        pos: duelSlotByKey.get(k) ?? benched ?? seatPos(hashStr(k) % seatCount, seatCount),
        tint: avatarColor(b.speaker, contacts, contactTemplates, myColors, ownNames).color,
      }
    })
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
  const fs = gameFs || settings.fontSize || 12
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
        {/* The "?" sits beside the title (bug check): in the corner it lay over
            a floating window's ✕, so aiming for Close hit the key. Space presses
            it too (activateOnKey), or the type-anywhere handler took the key. */}
        <div className="tableau-room-title-row">
          <div className="tableau-room-title">{roomState.title || 'Somewhere in Elanthia'}</div>
          <button
            type="button"
            className={`tableau-key-btn${showKey ? ' tableau-key-btn--on' : ''}`}
            onClick={() => setShowKey(v => !v)}
            onKeyDown={e => {
              if (e.key === 'Escape' && showKey) { e.preventDefault(); setShowKey(false); return }
              activateOnKey(() => setShowKey(v => !v))(e)
            }}
            aria-pressed={showKey}
            aria-label="What the lines and colours mean"
            title="What the lines, arrows, rings and colours mean"
          >?</button>
        </div>
        {descExcerpt && <div className="tableau-room-desc">{descExcerpt}</div>}
      </div>
      {/* The key lives in the SCENE, not the stage (bug check): the stage's
          fit-to-size font shrank it unreadable in a small panel, and the
          stage's speech bubbles painted over it. */}
      {showKey && <TableauKey onClose={() => setShowKey(false)} />}
      {/* The STAGE holds every figure + bubble, kept SEPARATE from the header so
          NPCs/avatars can never render over the room title/description at close
          zoom or odd aspect ratios (Sekmeht 2026-07-17). sceneRef measures the
          stage, so bubble layout stays inside it too. */}
      <div ref={sceneRef} className="tableau-stage" style={{ ['--tableau-fit' as string]: fitScale } as React.CSSProperties}>
      {/* The place (v0.20.2): a layered scene from the room's description
          (tableauScene.ts) and a sky by time of day. Static, behind everything. */}
      {!hidden?.scenery && <TableauBackdrop scene={scene} sky={sky} seedKey={roomState.title || ''} />}
      {wxFx && (wxFx.rain || wxFx.snow || wxFx.storm || wxFx.clouds) && <TableauWeather fx={wxFx} still={!!settings.epilepsySafe} />}
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

      {/* Fight lines (v0.20.2): the mesh of who is fighting what. Drawn first,
          under every figure; endpoints come from the measuring effect. */}
      {meshLinks.length > 0 && (
        <svg className="tableau-mesh" aria-hidden="true">
          {/* One arrowhead per relation zone, in the creature chips' colours.
              Ids are per instance (pitfall #95: url(#id) resolves document-wide). */}
          <defs>
            {(['front', 'flank', 'behind'] as const).map(z => (
              <marker
                key={z} id={`${meshUid}-${z}`} viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className={`tableau-mesh-arrow tableau-mesh-arrow--${z}`} />
              </marker>
            ))}
          </defs>
          {meshLinks.map(l => (
            // isFacer: a person's end (you or a player), so "their end has a
            // relation" means they are facing the other end.
            <line
              key={l.key} data-mesh-a={l.a} data-mesh-b={l.b}
              className={`tableau-mesh-line tableau-mesh-line--${l.kind} tableau-mesh-line--${l.range}${(isFacer(l.a) && l.aRel) || (isFacer(l.b) && l.bRel) ? ' tableau-mesh-line--faced' : ''}`}
              markerEnd={l.aRel ? `url(#${meshUid}-${assessZone(l.aRel)})` : undefined}
              markerStart={l.bRel ? `url(#${meshUid}-${assessZone(l.bRel)})` : undefined}
            />
          ))}
        </svg>
      )}

      {/* Player combat tethers (v0.20.2): a line from you to each player engaged
          with you, coloured and labelled by range. Dashes march toward whoever is
          being closed on while someone is advancing (not at melee, not under
          epilepsy-safe). Drawn before the figures so they sit on top. */}
      {duels.size > 0 && (() => {
        // Only duelists with a figure on stage can be joined; the endpoints are
        // written by the measuring effect above.
        const shown = [...duels.values()].filter(d => seatedPosByKey.has(d.key) || lostPosByKey.has(d.key) || (d.lost && bubbles.has(d.key)))
        if (shown.length === 0) return null
        const closing = (d: Duel) => d.by !== null && d.range !== 'melee' && !calm
        return (
          <>
            <svg className="tableau-tethers" aria-hidden="true">
              {/* Arrowheads (v0.20.2, Sekmeht: "who is facing who"): one at THEIR
                  end when you face them, one at YOURS when they face you, in the
                  same relation colours as the fight lines. Own ids — the mesh's
                  defs are only in the document while it has lines. */}
              <defs>
                {(['front', 'flank', 'behind'] as const).map(z => (
                  <marker
                    key={z} id={`${meshUid}-t-${z}`} viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" className={`tableau-mesh-arrow tableau-mesh-arrow--${z}`} />
                  </marker>
                ))}
              </defs>
              {shown.map(d => (
                <line
                  key={d.key} ref={tetherRef(d.key, 'line')}
                  markerEnd={!d.lost && d.mine ? `url(#${meshUid}-t-${assessZone(d.mine)})` : undefined}
                  markerStart={!d.lost && d.theirs ? `url(#${meshUid}-t-${assessZone(d.theirs)})` : undefined}
                  className={d.lost ? 'tableau-tether tableau-tether--lost'
                    : `tableau-tether tableau-tether--${d.range}${closing(d) ? ' tableau-tether--closing' : ''}${closing(d) && d.by === 'them' ? ' tableau-tether--inbound' : ''}`}
                />
              ))}
            </svg>
            {shown.map(d => (
              <div
                key={`tl-${d.key}`} ref={tetherRef(d.key, 'label')}
                className={`tableau-tether-label tableau-tether-label--${d.lost ? 'lost' : d.range}`}
                title={d.lost
                  ? `${d.name} — out of sight. Last known at ${RANGE_WORD[d.range]} range.`
                  : `${d.name} is at ${RANGE_WORD[d.range]} range${d.by === 'you' ? ' — you are closing on them' : d.by === 'them' ? ' — they are closing on you' : ''}`}
              >{d.lost ? '?' : RANGE_WORD[d.range]}</div>
            ))}
          </>
        )
      })()}

      {/* Creatures along the back of the scene — every individual gets its
          OWN figure (Sekmeht: "show me these guys" — four blademasters are
          four monsters, not a ×4 badge), in MONSTERBOLD (--preset-bold), the
          same visual language the main window uses for them. The dead are in
          the Dead list instead (v0.20.2); >10 living overflow to "+N more". */}
      {(() => {
        // Assess arena (B): id'd creatures placed in a row sorted front → flank
        // → behind, each tagged with its relation to you + range, melee = engaged
        // (attacking), your target ringed, reeling ones flagged; click to `face`.
        if (showAssess && assessCreatures.length > 0) {
          // Yours first (front → flank → behind), then those on someone else.
          const sorted = [...assessCreatures].sort((a, b) =>
            (assessOnYou(a) ? 0 : 1) - (assessOnYou(b) ? 0 : 1)
            || ASSESS_ZONE_ORDER[assessZone(a.relation)] - ASSESS_ZONE_ORDER[assessZone(b.relation)])
          // Positions come from creatureFigPos (decided once, above): the
          // battlefield, the row, or — for the dead — where each one fell.
          return (
            <>
              {sorted.map(e => {
                const pos = creatureFigPos.get(`c:${e.id}`)
                if (!pos) return null
                const dead = deadIds.has(e.id!)
                if (dead) {
                  // A corpse where it fell (v0.20.2, Sekmeht): greyed, set back,
                  // a skull in place of its number, no lines or chips — until DR
                  // stops listing it (decayed, skinned).
                  return (
                    <div
                      key={`as-${e.id}`}
                      className="tableau-figure tableau-figure--creature tableau-figure--assess tableau-assess--corpse"
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      title={`${e.name}${e.number != null ? ` #${e.number}` : ''} — dead. It stays until its body decays or is skinned.`}
                    >
                      <div className="tableau-avatar tableau-avatar--creature" data-fig={`c:${e.id}`}>
                        {initials(e.name)}
                        <span className="tableau-corpse-skull"><Skull /></span>
                      </div>
                      <div className="tableau-name">{e.name}</div>
                    </div>
                  )
                }
                const zone = assessZone(e.relation)
                const isTarget = e.id === assessTargetId
                const mine = assessOnYou(e)
                const states = creatureStateWords(rosterById?.get(e.id!)?.flags)
                const reeling = ASSESS_REELING.test(e.status) || states.length > 0
                const rangeCh = e.range === 'melee' ? 'M' : e.range === 'pole' ? 'P' : 'R'
                return (
                  <div
                    key={`as-${e.id}`}
                    className={`tableau-figure tableau-figure--creature tableau-figure--assess tableau-assess--${zone}${isTarget ? ' tableau-assess--target' : ''}${showEngaged && mine && e.range === 'melee' ? ' tableau-assess--engaged' : ''}${mine ? '' : ' tableau-assess--elsewhere'}${reeling ? ' tableau-assess--reeling' : ''}${onCommand ? ' tableau-assess--clickable' : ''}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={`${e.name}${e.number != null ? ` #${e.number}` : ''} — ${mine ? (ASSESS_LABEL[e.relation] ?? e.relation) : `${e.relation} ${e.target}`}, ${e.range} range${e.status ? ` (${e.status})` : ''}${states.length ? ` — ${states.join(', ')}` : ''}${facedBy.has(e.id ?? '') ? ` — ${facedLabel(facedBy.get(e.id ?? '')!)}` : isTarget ? ' — your target' : ''}${onCommand ? '\nClick to face' : ''}`}
                    onClick={onCommand && e.id ? () => onCommand(`face #${e.id}`) : undefined}
                    role={onCommand ? 'button' : undefined}
                    // Keyboard parity (bug check, pitfall #142): a role="button"
                    // with no tab stop, unlike every other figure here.
                    tabIndex={onCommand && e.id ? 0 : undefined}
                    aria-label={onCommand && e.id ? `Face ${e.name}${e.number != null ? ` ${e.number}` : ''}` : undefined}
                    onKeyDown={onCommand && e.id ? activateOnKey(() => onCommand(`face #${e.id}`)) : undefined}
                  >
                    <div className="tableau-avatar tableau-avatar--creature" data-fig={`c:${e.id}`}>
                      {initials(e.name)}
                      {e.number != null && <span className="tableau-assess-num">{e.number}</span>}
                      {attackFlash.has(`c:${e.id}`) && <span key={`atk-${attackFlash.get(`c:${e.id}`)}`} className="tableau-attack-flash" aria-hidden="true" />}
                      {/* One crosshair per person facing it, in THEIR colour; a
                          second is turned 45° so two never hide each other. */}
                      {(facedBy.get(e.id ?? '') ?? []).slice(0, 2).map((who, i) => (
                        <svg
                          key={who}
                          className={`tableau-crosshair${who === 'you' ? ' tableau-crosshair--you' : ''}${i === 1 ? ' tableau-crosshair--alt' : ''}`}
                          style={{ stroke: personColor(who) }}
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="8.5" />
                          <path d="M12 0.5v6M12 17.5v6M0.5 12h6M17.5 12h6" />
                        </svg>
                      ))}
                    </div>
                    <div className="tableau-name">{e.name}</div>
                    <div className="tableau-assess-tags">
                      {mine
                        ? <span className={`tableau-assess-rel tableau-assess-rel--${zone}`}>{ASSESS_LABEL[e.relation] ?? e.relation}</span>
                        : (
                          // On someone else (v0.20.2): a short word and a tiny badge
                          // in THEIR colour, not "flanking Sekmeht" spelled out.
                          <span className={`tableau-assess-rel tableau-assess-rel--${zone}`}>
                            <span className="tableau-who" style={monogramStyle(e.target ?? '', personColor(e.target ?? ''))}>{initials(e.target ?? '')}</span>
                            {SHORT_REL[e.relation] ?? e.relation}
                          </span>
                        )}
                      <span className={`tableau-assess-rng tableau-assess-rng--${e.range}`}>{rangeCh}</span>
                      {states.length > 0 && <span className="tableau-assess-state">{states.join(' · ')}</span>}
                    </div>
                  </div>
                )
              })}
              {/* Here since your assess (the roster lists them, the assess doesn't):
                  no relation yet — just who and how they are. */}
              {rosterExtras.map(c => {
                const pos = creatureFigPos.get(`c:${c.id}`)
                if (!pos) return null
                if (c.flags.includes('dead')) {
                  return (
                    <div
                      key={`as-${c.id}`}
                      className="tableau-figure tableau-figure--creature tableau-figure--assess tableau-assess--corpse"
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      title={`${c.name ?? 'A creature'} — dead. It stays until its body decays or is skinned.`}
                    >
                      <div className="tableau-avatar tableau-avatar--creature" data-fig={`c:${c.id}`}>
                        {initials(c.name ?? '?')}
                        <span className="tableau-corpse-skull"><Skull /></span>
                      </div>
                      <div className="tableau-name">{c.name ?? 'creature'}</div>
                    </div>
                  )
                }
                const states = creatureStateWords(c.flags)
                const onYou = rosterEngaged(c.flags)
                return (
                  <div
                    key={`as-${c.id}`}
                    className={`tableau-figure tableau-figure--creature tableau-figure--assess tableau-assess--unassessed${onYou ? '' : ' tableau-assess--elsewhere'}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={`${c.name ?? 'A creature'} — here since your last assess${onYou ? ', engaged with you' : ''}${states.length ? ` — ${states.join(', ')}` : ''}. Assess to see where it stands.`}
                  >
                    <div className="tableau-avatar tableau-avatar--creature" data-fig={`c:${c.id}`}>{initials(c.name ?? '?')}</div>
                    <div className="tableau-name">{c.name ?? 'creature'}</div>
                    {states.length > 0 && <div className="tableau-assess-tags"><span className="tableau-assess-state">{states.join(' · ')}</span></div>}
                  </div>
                )
              })}
            </>
          )
        }
        // No assess, but the ROSTER: the row in the room list's own order, each
        // creature in its own slot, a corpse lying in its slot until it's gone.
        if (rosterRow) {
          const shownR = rosterRow.slice(0, 10)
          const livingOver = rosterRow.slice(10).filter(c => !c.flags.includes('dead')).length
          return (
            <>
              {shownR.map(c => {
                const pos = creatureFigPos.get(`c:${c.id}`)
                if (!pos) return null
                const dead = c.flags.includes('dead')
                const states = creatureStateWords(c.flags)
                return (
                  <div
                    key={`as-${c.id}`}
                    className={`tableau-figure tableau-figure--creature${dead ? ' tableau-assess--corpse' : ''}${states.length ? ' tableau-assess--reeling' : ''}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={`${c.name}${dead ? ' — dead. It stays until its body decays or is skinned.' : states.length ? ` — ${states.join(', ')}` : ''}`}
                  >
                    <div className="tableau-avatar tableau-avatar--creature" data-fig={`c:${c.id}`}>
                      {initials(c.name!)}
                      {dead && <span className="tableau-corpse-skull"><Skull /></span>}
                      {!dead && attackFlash.has(`c:${c.id}`) && <span key={`atk-${attackFlash.get(`c:${c.id}`)}`} className="tableau-attack-flash" aria-hidden="true" />}
                    </div>
                    <div className="tableau-name">{c.name}</div>
                    {!dead && states.length > 0 && <div className="tableau-assess-tags"><span className="tableau-assess-state">{states.join(' · ')}</span></div>}
                  </div>
                )
              })}
              {livingOver > 0 && (
                <div className="tableau-figure tableau-figure--creature" style={{ left: `${Math.min(94, creatureHi + 2)}%`, top: isLarge ? '13%' : '22%' }} title={`${livingOver} more creatures`}>
                  <div className="tableau-avatar tableau-avatar--creature">+{livingOver}</div>
                  <div className="tableau-name">more</div>
                </div>
              )}
            </>
          )
        }
        const instances: { name: string; dead: boolean; ord: number; total: number }[] = []
        for (const c of creatures) {
          const total = c.count ?? 1
          const deadN = c.deadCount ?? (c.dead ? total : 0)
          // The dead are in the Dead list; the row is the living.
          for (let i = deadN; i < total; i++) instances.push({ name: c.name, dead: false, ord: i + 1, total })
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
                style={{ left: `${creatureX(i, slots)}%`, top }}
                title={`${c.name}${c.total > 1 ? ` #${c.ord}` : ''}${c.dead ? ' (dead)' : ''}`}
              >
                <div className="tableau-avatar tableau-avatar--creature">
                  {c.dead ? <Skull /> : initials(c.name)}
                  {attackFlash.has(`cr-${c.name}-${c.ord}`) && <span key={`atk-${attackFlash.get(`cr-${c.name}-${c.ord}`)}`} className="tableau-attack-flash" aria-hidden="true" />}
                </div>
                <div className="tableau-name">{c.name}</div>
              </div>
            ))}
            {extra > 0 && (
              <div className="tableau-figure tableau-figure--creature" style={{ left: `${Math.min(94, creatureHi + 2)}%`, top }} title={`${extra} more creatures`}>
                <div className="tableau-avatar tableau-avatar--creature">+{extra}</div>
                <div className="tableau-name">more</div>
              </div>
            )}
          </>
        )
      })()}

      {/* The Dead list (v0.20.2): corpses until they decay, top-right. */}
      {deadList.length > 0 && (
        <div className="tableau-dead" title="Creatures lying dead here. Each stays listed until its body decays.">
          <div className="tableau-dead-label">Dead</div>
          {deadList.slice(0, 6).map(d => (
            <div key={d.name} className="tableau-dead-item">
              <Skull />
              <span className="tableau-dead-name">{d.name}</span>
              {d.n > 1 && <span className="tableau-dead-n">×{d.n}</span>}
            </div>
          ))}
          {deadList.length > 6 && <div className="tableau-dead-item tableau-dead-more">+{deadList.length - 6} more</div>}
        </div>
      )}

      {/* Departure ghosts — the figure lingers briefly, walking out toward
          its exit direction (or dissolving in place on a logoff). */}
      {ghosts.map(g => {
        const pos = ghostPos(g)
        // A bench ghost fades where it sat: walking to an east exit would carry
        // it straight across the fight.
        const v = g.direction && !pos.benched ? DIR_VECTOR[g.direction] : null
        const sc = pos.sc
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
        const sc = u.benched ? BENCH_SC : 0.8 + u.pos.depth * 0.25
        return (
          <div
            key={`unseen-${u.speaker}`}
            className="tableau-figure tableau-figure--unseen tableau-figure--speaking"
            style={{ left: `${u.pos.x}%`, top: `${u.pos.y}%`, transform: `translate(-50%, -50%) scale(${sc})`, '--fig-sc': `${sc}` } as React.CSSProperties}
            title={`${u.speaker} — speaking from hiding (or invisible)`}
          >
            <div className="tableau-avatar tableau-avatar--unseen" style={{ background: u.tint }} data-tether={duels.has(u.speaker.toLowerCase()) ? u.speaker.toLowerCase() : undefined}>{initials(u.speaker)}</div>
            <div className="tableau-name">{u.speaker}?</div>
          </div>
        )
      })}

      {/* Lost duelists (v0.20.2, Sekmeht): someone in combat with you who has
          gone out of sight — hidden, invisible, or gone. A "?" stays where they
          were, still joined to you, as the cue to SEARCH for them or check the
          log. An empty assess (the game saying the fight is over) removes it;
          their reappearing turns it back into their real figure. */}
      {[...lostPosByKey].map(([k, pos]) => {
        const d = duels.get(k)!
        const sc = 0.8 + pos.depth * 0.25
        const left = [...moves].reverse().find(mv => mv.kind === 'depart' && mv.name.toLowerCase() === k)
        const how = left?.direction ? `Last seen going ${left.direction}. ` : ''
        const tip = `${d.name} was in combat with you and can't be seen now — hidden, invisible, or gone. ${how}Search for them, or check the log. An assess that comes back empty clears this.${onCommand ? '\nRight-click for options' : ''}`
        const openMenu = (x: number, y: number, keyboard: boolean) => setFigMenu({ x, y, name: d.name, keyboard })
        return (
          <div
            key={`lost-${k}`}
            className={`tableau-figure tableau-figure--lost${onCommand ? ' tableau-figure--menu' : ''}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%, -50%) scale(${sc})`, '--fig-sc': `${sc}` } as React.CSSProperties}
            title={tip}
            onContextMenu={onCommand ? (e => { e.preventDefault(); openMenu(e.clientX, e.clientY, false) }) : undefined}
            {...(onCommand ? {
              role: 'button', tabIndex: 0, 'aria-haspopup': 'menu' as const, 'aria-label': `${d.name}, out of sight — options`,
              onKeyDown: activateOnKey(() => {
                const el = document.activeElement as HTMLElement | null
                const r = el?.getBoundingClientRect()
                openMenu(r ? r.left + r.width / 2 : 0, r ? r.bottom : 0, true)
              }),
            } : {})}
          >
            <div className="tableau-avatar tableau-avatar--lost" data-tether={k}>?</div>
            <div className="tableau-name">{d.name}?</div>
          </div>
        )
      })}

      {/* Your group's row (v0.20.2): members somewhere else, faded at the
          outer ends. Members here are drawn with everyone else (they keep their
          speech, menus and entrances). */}
      {groupAway.map(({ m, x, y }) => (
        <div
          key={`away-${m.name}`}
          className={`tableau-figure tableau-figure--group tableau-figure--away${onCommand ? ' tableau-figure--menu' : ''}`}
          style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scale(${GROUP_SC})`, '--fig-sc': `${GROUP_SC}` } as React.CSSProperties}
          title={`${m.name} — in your group, not in this room${m.leader ? ' (leader)' : ''}. ${m.status}.${onCommand ? '\nRight-click for options' : ''}`}
          onContextMenu={onCommand ? (e => { e.preventDefault(); setFigMenu({ x: e.clientX, y: e.clientY, name: m.name, keyboard: false }) }) : undefined}
          {...(onCommand ? {
            role: 'button', tabIndex: 0, 'aria-haspopup': 'menu' as const, 'aria-label': `${m.name}, in your group, elsewhere — options`,
            onKeyDown: activateOnKey(() => {
              const el = document.activeElement as HTMLElement | null
              const r = el?.getBoundingClientRect()
              setFigMenu({ x: r ? r.left + r.width / 2 : 0, y: r ? r.bottom : 0, name: m.name, keyboard: true })
            }),
          } : {})}
        >
          <div className="tableau-avatar tableau-avatar--away" style={monogramStyle(m.name, avatarColor(m.name, contacts, contactTemplates, myColors, ownNames).color)}>{initials(m.name)}</div>
          <div className="tableau-name">{m.name}</div>
          <GroupTags member={m} />
        </div>
      ))}
      {groupCrowd && (
        <div
          className="tableau-figure tableau-figure--crowd tableau-figure--group"
          style={{ left: `${groupCrowd.x}%`, top: `${groupCrowd.y}%`, transform: `translate(-50%, -50%) scale(${GROUP_SC})` }}
          title={`${groupCrowd.n} more in your group`}
        >
          <div className="tableau-avatar tableau-avatar--crowd">+{groupCrowd.n}</div>
          <div className="tableau-name">more</div>
        </div>
      )}

      {/* The duel bench's caption (v0.20.2): says what the column is. */}
      {benchLabel && (
        <div
          className="tableau-bench-label"
          style={{ left: `${benchLabel.x}%`, top: `${benchLabel.y}%` }}
          title="Everyone else in the room, set aside while you are fighting another player. They go back to their seats when the fight ends."
        >Also here</div>
      )}

      {/* Seated players — quiet folks on the arc, talkers in the circle */}
      {seated.map(p => {
        const chatKey = p.name.toLowerCase()
        const pos = seatedPosByKey.get(chatKey) ?? seatPos(seats.get(p.name) ?? 0, seatCount)
        const { color, isContact } = avatarColor(p.name, contacts, contactTemplates, myColors, ownNames)
        // v0.20.1 (Sekmeht): every interaction with a person is on ONE right-click
        // menu — Say to… / Whisper to…, plus the contact card (the same
        // ContactPopover in-text name clicks use) for a contact. More verbs go
        // on the same menu. A plain left-click does nothing.
        const contact = isContact ? contacts.find(c => c.name && c.name.toLowerCase() === chatKey) : undefined
        const hasCard = !!(contact && onOpenContact)
        const hasMenu = !!onDirect || hasCard
        const duel = duels.get(chatKey)
        const duelTip = duel
          ? `\nIn combat with you: ${RANGE_WORD[duel.range]} range${duel.theirs ? `, ${ASSESS_LABEL[duel.theirs] ?? duel.theirs}` : ''}${duel.status ? ` (${duel.status})` : ''}${duel.isTarget ? ' — your target' : ''}`
          : ''
        const groupTip = groupPosByKey.has(chatKey)
          ? `\nIn your group${groupList.find(m => m.name.toLowerCase() === chatKey)?.leader ? ' (leader)' : ''}: ${groupList.find(m => m.name.toLowerCase() === chatKey)?.status ?? ''}`
          : ''
        const tip = `${p.posture ? `${p.descriptor} (${POSTURE_LABEL[p.posture]})` : p.descriptor}${p.dead ? ' (dead)' : ''}${groupTip}${duelTip}${hasMenu ? (duel ? '\nRight-click for options' : ' — right-click for options') : ''}`
        const openMenu = (x: number, y: number, keyboard: boolean) =>
          setFigMenu({ x, y, name: p.name, contactId: hasCard ? contact!.id : undefined, keyboard })
        const bubble = bubbleFor(p.name)
        const benched = benchPosByKey.has(chatKey)
        const gm = groupList.find(m => m.name.toLowerCase() === chatKey)
        const sc = benched ? BENCH_SC : gm ? GROUP_SC : 0.8 + pos.depth * 0.25
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
            className={`tableau-figure${isContact ? ' tableau-figure--contact' : ''}${hasMenu ? ' tableau-figure--menu' : ''}${p.posture ? ' tableau-figure--seated-posture' : ''}${p.posture === 'hiding' ? ' tableau-figure--hiding' : ''}${p.dead ? ' tableau-figure--player-dead' : ''}${bubble ? ' tableau-figure--speaking' : ''}${entry ? ' tableau-figure--enter' : ''}${duel ? ` tableau-figure--duel tableau-duel--${duel.range}` : ''}${duel?.isTarget ? ' tableau-duel--target' : ''}${benched ? ' tableau-figure--bench' : ''}${gm ? ' tableau-figure--group' : ''}`}
            style={style}
            title={tip}
            onContextMenu={hasMenu ? (e => { e.preventDefault(); openMenu(e.clientX, e.clientY, false) }) : undefined}
            // Keyboard parity (pitfall #142): Tab reaches a figure and Enter/Space
            // opens the same menu at the figure, with focus in it.
            {...(hasMenu ? {
              role: 'button', tabIndex: 0, 'aria-haspopup': 'menu' as const, 'aria-label': `${p.name} — options`,
              onKeyDown: activateOnKey(() => {
                const el = document.activeElement as HTMLElement | null
                const r = el?.getBoundingClientRect()
                openMenu(r ? r.left + r.width / 2 : 0, r ? r.bottom : 0, true)
              }),
            } : {})}
          >
            {renderCaption(bubble, sc)}
            {(() => {
              const av = (
                <div className="tableau-avatar" style={monogramStyle(p.name, color)} data-tether={duel ? chatKey : undefined} data-fig={`p:${chatKey}`}>
                  {initials(p.name)}
                  {(facedByPlayer.get(chatKey) ?? []).slice(0, 2).map((who, i) => (
                    <svg
                      key={who}
                      className={`tableau-crosshair${who === 'you' ? ' tableau-crosshair--you' : ''}${i === 1 ? ' tableau-crosshair--alt' : ''}`}
                      style={{ stroke: personColor(who) }}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 0.5v6M12 17.5v6M0.5 12h6M17.5 12h6" />
                    </svg>
                  ))}
                </div>
              )
              const pose = !hidden?.poses && bubble?.channel === 'emote' ? poseOf(bubble.text) : null
              return pose ? <span key={`pose-${bubble!.id}`} className={`tableau-pose tableau-pose--${pose}`}>{av}</span> : av
            })()}
            <div className="tableau-name">{p.name}</div>
            {gm && <GroupTags member={gm} focus={focusOn.get(chatKey)} />}
            {!duel && allyFights.has(chatKey) && !meshPlayers.has(chatKey) && (() => {
              const a = allyFights.get(chatKey)!
              // The number is the badge on that creature's figure; the id says
              // whether it is the very one you are facing (both sides' assess
              // carry the same look-id).
              const shared = !!a.targetId && a.targetId === assessTargetId
              return (
                <div
                  className={`tableau-ally-fight${shared ? ' tableau-ally-fight--shared' : ''}`}
                  title={`${p.name} is ${a.relation} ${a.target}${a.targetNumber != null ? ` (${a.targetNumber})` : ''} at ${a.range} range${a.status ? ` — ${a.status}` : ''}${shared ? ' — the same one you are facing' : ''}`}
                >
                  <span className="tableau-ally-fight-vs">{a.relation} {stripArticle(a.target ?? '')}{a.targetNumber != null ? ` ${a.targetNumber}` : ''}</span>
                  {shared && <span className="tableau-ally-fight-same">same as you</span>}
                  <span className={`tableau-assess-rng tableau-assess-rng--${a.range}`}>{RANGE_LETTER[a.range]}</span>
                </div>
              )
            })()}
            {/* Player combat readout (v0.20.2): how they stand toward you and
                the range, the same chips the creature arena uses, then their
                balance as the game states it. */}
            {duel && (() => {
              // The raw status ("hidden and slightly off balance") is too long
              // to sit under a figure: states become chips beside the range,
              // the balance a short line. The tooltip keeps the full phrase.
              const st = splitAssessStatus(duel.status)
              return (
                <>
                  <div className="tableau-assess-tags tableau-duel-tags">
                    {duel.theirs && (
                      <span className={`tableau-assess-rel tableau-assess-rel--${assessZone(duel.theirs)}`}>{ASSESS_LABEL[duel.theirs] ?? duel.theirs}</span>
                    )}
                    <span className={`tableau-assess-rng tableau-assess-rng--${duel.range}`}>{RANGE_LETTER[duel.range]}</span>
                    {st.flags.map(f => <span key={f} className="tableau-duel-flag">{f}</span>)}
                  </div>
                  {st.balance !== null && <div className="tableau-duel-status">{balanceLabel(st.balance)}</div>}
                </>
              )
            })()}
          </div>
        )
      })}

      {overflow > 0 && (
        <div
          className={`tableau-figure tableau-figure--crowd${benchCrowd ? ' tableau-figure--bench' : ''}`}
          style={benchCrowd
            ? { left: `${benchCrowd.x}%`, top: `${benchCrowd.y}%`, transform: `translate(-50%, -50%) scale(${BENCH_SC})` }
            : { left: '92%', top: '30%' }}
        >
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
        // Danger conditions first, then your posture, then the quieter states
        // (hidden, invisible, joined). Posture wears the Icon Bar's own stance
        // colours; dead implies lying down, so it shows no posture chip.
        const postureKey = (combat?.stance ?? '').toLowerCase()
        const posture = !indicators.dead ? SELF_POSTURES[postureKey] : undefined
        const chipOf = (key: string, label: string, vars: 'ind' | 'stance') => ({
          key, label, title: CONDITION_TITLES[key],
          color: `var(--${vars}-${key}-color)`, border: `var(--${vars}-${key}-border)`,
        })
        const activeStatuses = SELF_STATUSES.filter(s => indicators[s.key])
        const selfStatuses = [
          ...activeStatuses.filter(s => SELF_RING_KEYS.includes(s.key)).map(s => chipOf(s.key, s.label, 'ind')),
          ...(posture ? [chipOf(postureKey, posture, 'stance')] : []),
          ...activeStatuses.filter(s => !SELF_RING_KEYS.includes(s.key)).map(s => chipOf(s.key, s.label, 'ind')),
        ]
        const ringKey = SELF_RING_KEYS.find(k => indicators[k])
        const selfCls = `tableau-figure tableau-figure--self`
          + (selfBubble ? ' tableau-figure--speaking' : '')
          + (indicators.dead ? ' tableau-figure--player-dead' : '')
          + (indicators.hidden ? ' tableau-figure--self-hidden' : '')
          + (indicators.invisible ? ' tableau-figure--self-invisible' : '')
        // By id first: two of your characters can share a name, and this
        // figure is THIS session's, whose tab and card look up by id.
        // monogramStyle picks readable ink — a picked colour can be pale.
        const selfInk = monogramStyle(character,
          characterColor(charColors, { characterId }) ?? avatarColor(character, contacts, contactTemplates, myColors, ownNames).color)
        const avatarStyle = {
          ...selfInk,
          // Dark ink on a pale fill has no halo, so the dead skull drops its
          // shadow too (it stands in for the halo an SVG doesn't get).
          ...(selfInk.textShadow === 'none' ? { '--skull-halo': 'none' } : {}),
          ...(ringKey ? { '--self-ring': `var(--ind-${ringKey}-color)`, '--self-glow': `var(--ind-${ringKey}-glow)` } : {}),
        } as React.CSSProperties
        return (
          <div className={selfCls} style={{ left: `${selfPos.x}%`, top: `${selfPos.y}%` }}>
            {renderCaption(selfBubble)}
            <div className="tableau-self-core">
              {preparing && <span className="tableau-spellglow" aria-hidden="true" />}
              {showReadiness && (
                <TimedRings rtExpires={combat?.rtExpires ?? 0} ctExpires={combat?.ctExpires ?? 0} aimExpires={combat?.aimExpires ?? 0} />
              )}
              {(() => {
              const selfPose = !hidden?.poses && selfBubble?.channel === 'emote' ? poseOf(selfBubble.text) : null
              const selfAvatar = (
              <div
                className={`tableau-avatar tableau-avatar--self${danger ? ' tableau-avatar--danger' : ''}${danger && !calm ? ' tableau-avatar--danger-anim' : ''}`}
                style={avatarStyle}
                data-tether-self=""
                data-fig="self"
                title={danger ? 'In danger' : undefined}
              >
                {indicators.dead ? <Skull /> : initials(character)}
              </div>
              )
              return selfPose ? <span key={`pose-${selfBubble!.id}`} className={`tableau-pose tableau-pose--${selfPose}`}>{selfAvatar}</span> : selfAvatar
              })()}
              {/* Strikes (v0.20.2): the newest one flashes round you, and the
                  words float up off your figure — keyed per strike so each
                  plays once, then is gone. */}
              {liveStrikes.length > 0 && (() => {
                const last = liveStrikes[liveStrikes.length - 1]
                return <span key={`react-${last.id}`} className={`tableau-react tableau-react--${last.outcome}`} aria-hidden="true" />
              })()}
              {liveMoments.length > 0 && (
                <span key={`burst-${liveMoments[liveMoments.length - 1].id}`} className="tableau-burst" aria-hidden="true" />
              )}
              {(liveStrikes.length > 0 || liveMoments.length > 0) && (
                <div className="tableau-pops" aria-hidden="true">
                  {[
                    ...liveStrikes.map(st => ({ id: st.id, at: st.at, cls: st.outcome, text: strikeLabel(st) })),
                    ...liveMoments.map(m => ({ id: m.id, at: m.at, cls: 'rank', text: `Rank up! ${m.text}` })),
                  ].sort((a, b) => a.at - b.at || a.id - b.id).slice(-3).map((it, i, arr) => (
                    <span
                      key={it.id}
                      className={`tableau-pop tableau-pop--${it.cls}`}
                      style={{ ['--pop-row' as string]: arr.length - 1 - i } as React.CSSProperties}
                    >{it.text}</span>
                  ))}
                </div>
              )}
              {preparing && <span className="tableau-spell-caption" title={`Preparing ${preparing}`}>{preparing}</span>}
            </div>
            <div className="tableau-name">{character}</div>
              {(handsOn || conditionsOn) && <div className="tableau-self-status" ref={statusRef}>
                {/* What's in your hands (v0.20.2), before your conditions: its
                    own one-line row, the left hand on the left. */}
                {handsOn && (() => {
                  // One hand holding something (the usual case): it sits
                  // centred under you. Both: left on the left, right on the
                  // right. Neither: the row stays, empty, so nothing moves.
                  const held = handSlots.filter(h => h.item)
                  const shown = held.length === 1 ? held : handSlots
                  return (
                    <div className={`tableau-hands${held.length === 1 ? ' tableau-hands--one' : ''}`}>
                      {shown.map(h => {
                        // Long names lose their describing words first, never
                        // the noun: "forester's stonebow" → "forest… stonebow".
                        const name = (h.item ?? 'empty').trim()
                        const sp = name.lastIndexOf(' ')
                        return (
                          <span
                            key={`hand-${h.side}`}
                            className={`tableau-self-chip tableau-hand-chip tableau-hand-chip--${h.side === 'L' ? 'left' : 'right'}${h.item ? '' : ' tableau-hand-chip--empty'}`}
                            title={h.item ? `${h.side === 'R' ? 'Right' : 'Left'} hand: ${h.item}` : undefined}
                            aria-hidden={h.item ? undefined : true}
                            aria-label={h.item ? `${h.side === 'R' ? 'Right' : 'Left'} hand: ${name}` : undefined}
                          >
                            <b>{h.side}</b>
                            {sp > 0 && <span className="tableau-hand-adj">{name.slice(0, sp)}</span>}
                            <span className="tableau-hand-noun">{sp > 0 ? name.slice(sp + 1) : name}</span>
                          </span>
                        )
                      })}
                    </div>
                  )
                })()}
                {/* Your conditions: a line that is ALWAYS there, one row high,
                    so a condition coming or going (hidden, stunned…) never
                    moves your figure (Sekmeht). Danger first; past three, a
                    "+N" whose tooltip names the rest. */}
                {conditionsOn && <div className="tableau-conditions">
                  {selfStatuses.length === 0 && <span className="tableau-self-chip tableau-self-chip--placeholder" aria-hidden="true">·</span>}
                  {selfStatuses.slice(0, MAX_CONDITION_CHIPS).map(s => (
                    <span
                      key={s.key}
                      className="tableau-self-chip"
                      title={s.title}
                      style={{ color: s.color, borderColor: s.border } as React.CSSProperties}
                    >{s.label}</span>
                  ))}
                  {selfStatuses.length > MAX_CONDITION_CHIPS && (
                    <span className="tableau-self-chip tableau-self-chip--more" title={selfStatuses.slice(MAX_CONDITION_CHIPS).map(s => s.label).join(', ')}>
                      +{selfStatuses.length - MAX_CONDITION_CHIPS}
                    </span>
                  )}
                </div>}
              </div>}
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
          {/* All three rows whenever the panel shows (v0.20.2): a fight that is
              still closing has a range and often a balance (from your assess)
              but no position yet, and a panel that grows a row mid-fight reads
              as the gauge vanishing and coming back. */}
          <BipolarGauge label="BAL" frac={balFrac}
            title={bal !== null ? `Balance: ${balanceLabel(bal)} (solidly = baseline)` : 'Balance: not reported yet — the game states it in your assess and after an attack'} />
          <BipolarGauge label="POS" frac={posFrac}
            title={pos !== null
              ? `Position: ${positionLabel(pos)}${pos !== 0 ? (pos > 0 ? ' (you lead)' : ' (foe leads)') : ' (even)'}`
              : 'Position: not reported yet — the game states it after an attack'} />
          {(
            <div className={`tableau-gauge tableau-gauge--range${range === null ? ' tableau-gauge--unknown' : ''}`}
              title={range !== null ? `Combat range: ${range} — the latest from something closing on you, or you closing on someone` : 'Combat range: not reported yet'}>
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

      </div>

      {figMenu && (() => {
        const m = figMenu
        const items: CtxItem[] = []
        const lostDuel = duels.get(m.name.toLowerCase())?.lost === true
        // Touch (v0.20.4, Sekmeht): an EMPATH touches someone to start healing
        // them, so it leads the menu, above a divider — and only for an empath,
        // and only for someone actually in the room. Sent, like Look. The guild
        // is what the game said on your own `info` sheet, else Edit Profile's
        // Guild; until either is known the item doesn't appear.
        if (onCommand && /^empaths?$/i.test((guild ?? '').trim()) && playerKeys.has(m.name.toLowerCase())) {
          items.push({ label: `Touch ${m.name}`, onClick: () => onCommand(`touch ${m.name}`) })
          items.push({ label: null })
        }
        if (onDirect && !lostDuel) {
          items.push({ label: `Say to ${m.name}…`, onClick: () => onDirect('say', m.name) })
          items.push({ label: `Whisper to ${m.name}…`, onClick: () => onDirect('whisper', m.name) })
        }
        // Look (v0.20.2, Sekmeht): only someone actually in the room. By their
        // id when an assess has named it (a player's is negative, e.g.
        // `look #-10155641`), which can't pick the wrong person; by name otherwise.
        if (onCommand && playerKeys.has(m.name.toLowerCase())) {
          const pcId = combat?.assess.find(e => e.pc && e.name.toLowerCase() === m.name.toLowerCase())?.id
            ?? combat?.assess.find(e => e.targetId?.startsWith('-') && e.target?.toLowerCase() === m.name.toLowerCase())?.targetId
          items.push({ label: `Look at ${m.name}`, onClick: () => onCommand(pcId ? `look #${pcId}` : `look ${m.name}`) })
        }
        if (m.contactId && onOpenContact) {
          if (items.length) items.push({ label: null })
          items.push({ label: 'Contact card', onClick: () => onOpenContact(m.contactId!, m.x, m.y) })
        }
        // In combat with you (v0.20.2): turn to face them, or re-assess. Sent,
        // not typed — the same kind of action as clicking a creature to face
        // it. Face needs their id, which only an assess provides; nothing here
        // starts or escalates a fight.
        const md = duels.get(m.name.toLowerCase())
        if (md && onCommand) {
          if (items.length) items.push({ label: null })
          // Out of sight: SEARCH is how you find someone hidden (Sekmeht).
          if (md.lost) items.push({ label: `Search for ${m.name}`, onClick: () => onCommand('search') })
          else if (md.id) items.push({ label: `Face ${m.name}`, onClick: () => onCommand(`face #${md.id}`) })
          items.push({ label: 'Assess the fight', onClick: () => onCommand('assess') })
        }
        // Group (v0.20.2), from GROUP HELP's verbs. Offered by what the GROUP
        // list says about you: a leader can promote, order a retreat or add
        // someone; anyone grouped can leave; someone ungrouped can add (and so
        // start a group) or join. Read from the game's list even when the
        // column is switched off. Sent, like Face — each is one deliberate verb.
        if (onCommand && !lostDuel) {
          const gm = group?.members.find(x => x.name.toLowerCase() === m.name.toLowerCase())
          const grouped = !!group && group.members.length > 0
          const g: CtxItem[] = []
          const send = (label: string, cmd: string) => g.push({ label, onClick: () => onCommand(cmd) })
          if (gm) {
            if (group!.youLead && !gm.leader) send(`Make ${m.name} the leader`, `group leader ${m.name}`)
            if (group!.youLead) send('Order the group to retreat', 'group retreat')
            send('Leave the group', 'leave')
            send('Refresh the group list', 'group list')
          } else {
            if (!grouped || group!.youLead) send(`Add ${m.name} to your group`, `group ${m.name}`)
            if (!grouped) send(`Join ${m.name}'s group`, `join ${m.name}`)
          }
          if (g.length) { if (items.length) items.push({ label: null }); items.push(...g) }
        }
        // Keyed per opening, so a second keyboard-opened menu mounts afresh and
        // focusFirst runs again.
        return <ContextMenu key={`${m.name}:${m.x}:${m.y}`} x={m.x} y={m.y} items={items} onClose={closeFigMenu} focusFirst={m.keyboard} />
      })()}
    </div>
  )
}

export default memo(TableauExperience)
