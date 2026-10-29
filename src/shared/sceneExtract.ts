// Scene cast extraction (SceneParser §35.2/§35.3 — `cast-players` /
// `cast-creatures`). The rules MIRROR Lich drinfomon's battle-tested logic
// (Ruby4Lich5/Lich5/lib/dragonrealms/drinfomon/drdefs.rb — extract_pcs /
// NPC_SCAN / DEAD_NPC); provenance per pattern is noted inline. Shared
// module: the SceneParser (main) is the canonical consumer; pure functions
// over TextSegment[] so a corpus harness can exercise the real code.
import type { TextSegment, ScenePlayer, SceneCreature } from './types'

// Lich DRDefsPattern.PLAYER_STATUS: / (who|whose body)? ?(has|is|appears|glows) .+/
const PLAYER_STATUS = / (?:(?:who|whose body) )?(?:has|is|appears|glows) .+$/
// Lich DRDefsPattern.TRAILING_AND: / and (?<last>.*)$/
const TRAILING_AND = / and (.*)$/
// Lich DRDefsPattern.SITTING / LYING_DOWN (checked BEFORE the status strip).
// Each matches the default long form AND the "(sitting)"/"(prone)" SHORT form
// DR emits under the HidePostStrings option (Lich drdefs #4529, synced from
// Lich 5.18 #1442). The parenthetical strip in extractScenePlayers (` \(.+\)`)
// removes the "(prone)"/"(sitting)" suffix before name extraction, so posture
// is captured while the name still resolves.
const SITTING = /who is sitting|\(sitting\)/i
const LYING_DOWN = /who is lying down|\(prone\)/i
// Sekmeht corpus 2026-06-12: "Also here: Agan who is hiding." — a noticed
// hider keeps their room-list entry with this status.
const HIDING = /who is hiding/i
// Sekmeht corpus: "the body of Priestess Aenigma who is lying down" — a
// dead player stays in the list wrapped in this prefix.
const BODY_OF = /^the body of /i
// Lich DRDefsPattern.DEAD_NPC
const DEAD_NPC = /which appears dead|\(dead\)/
// Lich DRDefsPattern.LEADING_ARTICLE (+ small counts, which DR also uses)
const LEADING_ARTICLE = /^(?:a|an|some|two|three|four|five|six|seven|eight|nine|ten) /

// Lich normalize_trailing_and: DR lists have no Oxford comma — only the
// TRAILING " and " becomes a comma (so "Lord and Lady X" mid-list survives
// everywhere except as the final entry, same tradeoff Lich accepts).
function normalizeTrailingAnd(text: string): string {
  const m = text.match(TRAILING_AND)
  return m ? text.replace(TRAILING_AND, `, ${m[1]}`) : text
}

// "Also here: Lord Rakkor, Binu who is sitting and Sekmeht." → ScenePlayer[]
// (Lich extract_pcs: split ', ', strip status tail + parenthetical, name =
// last word.)
export function extractScenePlayers(segs: TextSegment[]): ScenePlayer[] {
  const text = segs.map(s => s.text).join('')
    .replace(/^\s*(also here:|also in the room:)\s*/i, '')
    .replace(/[.!]\s*$/, '')
  if (!text.trim()) return []
  const seen = new Set<string>()
  const out: ScenePlayer[] = []
  for (const chunk of normalizeTrailingAnd(text).split(', ')) {
    const posture: ScenePlayer['posture'] = HIDING.test(chunk) ? 'hiding'
      : SITTING.test(chunk) ? 'sitting'
      : LYING_DOWN.test(chunk) ? 'prone' : undefined
    const dead = BODY_OF.test(chunk)
    const cleaned = chunk.replace(BODY_OF, '').replace(PLAYER_STATUS, '').replace(/ \(.+\)/, '').trim()
    // The name is the last CAPITALIZED word — not the bare last word (Lich's
    // PLAYER_NAME `\w+$`). Flavor tails without a "who is/has" anchor survive
    // the status strip ("Alytte covered in autumn leaves") and the bare rule
    // minted a player named "leaves" (Sekmeht's screenshot). DR names are
    // always capitalized; a chunk with NO capitalized word is skipped
    // entirely rather than guessed at.
    const caps = cleaned.match(/[A-Z][\w']*/g)
    const name = caps?.[caps.length - 1]
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push({ name, descriptor: cleaned, ...(posture ? { posture } : {}), ...(dead ? { dead: true } : {}) })
  }
  return out
}

// Creatures from the BOLD spans of 'room objs' (Lich NPC_SCAN: NPCs are the
// <pushBold/>…<popBold/> spans — our parser carries that as segment.bold,
// B117; non-bold objs text is scenery) and/or the dedicated 'room creatures'
// component when DR sends one. Callers pass each source separately and merge.
export function extractSceneCreaturesFromBold(segs: TextSegment[]): SceneCreature[] {
  const out: SceneCreature[] = []
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i].bold) continue
    // A creature is a RUN of consecutive bold segments, not one segment. The
    // rich stream (v0.21.0) bolds an article and a link together, `<pushBold/>
    // <pushBold/>a <a …>jeol moradu</a><popBold/><popBold/>`, which the link
    // tag splits into "a " and "jeol moradu"; read separately they made a
    // phantom creature called "a". Legacy sends one segment per creature.
    let text = ''
    while (i < segs.length && segs[i].bold) text += segs[i++].text
    if (!text.trim()) { i--; continue }
    // Lich's NPC_SCAN spans PAST </popBold>: the corpse marker ("… which
    // appears dead" / "… (dead)") trails the bold span as PLAIN text, so
    // check the head of the following non-bold segment (harness-caught).
    const next = segs[i]
    const deadHint = !!next && !next.bold && /^\s*(?:which appears dead|\(dead\))/.test(next.text)
    pushCreature(out, text, deadHint)
    i--
  }
  return out
}

export function extractSceneCreaturesFromText(segs: TextSegment[]): SceneCreature[] {
  const text = segs.map(s => s.text).join('')
    .replace(/^\s*you (also )?see\s*/i, '')
    .replace(/[.!]\s*$/, '')
  if (!text.trim()) return []
  const out: SceneCreature[] = []
  for (const chunk of normalizeTrailingAnd(text).split(', ')) pushCreature(out, chunk, false)
  return out
}

function pushCreature(out: SceneCreature[], raw: string, deadHint: boolean) {
  const dead = deadHint || DEAD_NPC.test(raw)
  const cleaned = raw.replace(DEAD_NPC, '').replace(/[.,]\s*$/, '').trim()
    .replace(LEADING_ARTICLE, '')
  if (!cleaned) return
  // Identical creatures COUNT instead of collapsing (Sekmeht corpus: five
  // "a lava drake" spans in one room — Lich ordinals them; we tally, and
  // deadCount tracks HOW MANY are corpses so the Tableau can grey exactly
  // that many individual figures).
  const existing = out.find(c => c.name.toLowerCase() === cleaned.toLowerCase())
  if (existing) {
    existing.count = (existing.count ?? 1) + 1
    if (dead) {
      existing.dead = true
      existing.deadCount = (existing.deadCount ?? 0) + 1
    }
    return
  }
  out.push({ name: cleaned, ...(dead ? { dead: true, deadCount: 1 } : {}) })
}

export function mergeSceneCreatures(...lists: SceneCreature[][]): SceneCreature[] {
  const out: SceneCreature[] = []
  const byKey = new Map<string, SceneCreature>()
  for (const list of lists) {
    for (const c of list) {
      const key = c.name.toLowerCase()
      const existing = byKey.get(key)
      if (existing) {
        // Same room seen through two components — take the larger tallies.
        if ((c.count ?? 1) > (existing.count ?? 1)) existing.count = c.count
        if ((c.deadCount ?? 0) > (existing.deadCount ?? 0)) existing.deadCount = c.deadCount
        if (c.dead) existing.dead = true
        continue
      }
      const copy = { ...c }
      byKey.set(key, copy)
      out.push(copy)
    }
  }
  return out
}

/** A creature name from a room-objects list, with its link id on the rich stream. */
export interface RosterName { name: string; exist?: string }

/**
 * The creatures in a room-objects list: each run of CONSECUTIVE bold segments
 * is one name. Legacy bolds a creature in one span (`<pushBold/>a jeol
 * moradu<popBold/>`, one segment). The rich stream doubles the bold around an
 * article and a link (`<pushBold/><pushBold/>a <a …>jeol moradu</a><popBold/><popBold/>`),
 * which the link tag splits into two bold segments, "a " and "jeol moradu";
 * counted separately they made a phantom creature called "a". The run's link id
 * comes with it.
 */
export function boldRuns(segs: TextSegment[]): RosterName[] {
  const out: RosterName[] = []
  let text = '', exist: string | undefined
  const end = () => {
    const name = text.trim()
    if (name) out.push(exist ? { name, exist } : { name })
    text = ''; exist = undefined
  }
  for (const s of segs) {
    if (s.bold) { text += s.text; exist ??= s.exist }
    else end()
  }
  end()
  return out
}
