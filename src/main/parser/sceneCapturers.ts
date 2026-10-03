// SceneParser line-capturer registry (DESIGN.md §35.1). Sekmeht's design
// rule: every scene event is ONE registry entry — gate (cheap substring
// pre-check, the pitfall-#82a discipline) + match + provenance + status —
// never a hardcoded if-chain. Adding an event to capture = adding an entry.
//
// STATUS GOVERNS EXECUTION (§35.4): only `verified` capturers run live, and
// `verified` means the pattern was exercised against REAL captured lines
// (the corpus named in `provenance`), not just drafted from documentation.
// The speech capturers below were verified 2026-06-12 against Frostbite's
// real captured session (C:/temp/Frostbite-Dev/frostbite/support/mock.xml —
// the same capture that proved the B165 hand-tag parsing) via
// tmp-scene-harness/run.mjs, which replays the verbatim lines through THIS
// module bundled for real (Iron rule: never a reimplementation).
//
// DEDUP BY STREAM GATING: DR double-emits speech — once inside the
// pushStream block (talk/whispers/thoughts) and once outside to main
// (pitfall #49; mock.xml:536-537 shows the pair verbatim). Each capturer
// therefore matches ONLY in its home stream(s); the main-stream duplicate is
// deliberately ignored, so one utterance = one event by construction.
//
// PRESET IS NOT A SPEECH SIGNAL: DR reuses preset id='speech'/'thought' for
// STAT-TABLE alignment (mock.xml:460-461) — the verb/shape regex is the
// signal; ctx.preset is advisory only.
import type { GameEvent, SceneSpeechEvent } from '../../shared/types'

export interface SceneCtx {
  stream: string     // the parser's active stream when the line arrived
  preset?: string    // line-level preset approximation (advisory — see above)
}

export interface SceneCapturer {
  id: string
  // Cheap gate: a lowercase literal that MUST appear in the line for the
  // regex to possibly match. Checked against the lowercased tag-stripped line.
  gate: string
  match: (line: string, ctx: SceneCtx) => GameEvent | null
  provenance: string
  status: 'verified' | 'unverified'
}

function speech(
  channel: SceneSpeechEvent['channel'],
  speaker: string,
  text: string,
  toYou?: boolean,
  target?: string,
): SceneSpeechEvent {
  return {
    type: 'scene-speech', channel, speaker, text,
    ...(toYou ? { toYou: true } : {}),
    ...(target ? { target } : {}),
  }
}

// ── Verified capturers (corpus: mock.xml — line refs in provenance) ────────

// Tag-stripped shapes: `You say, "…"` / `Boromir asks, "…"` plus the manner
// forms Sekmeht's live capture surfaced (2026-06-12, corpus/2026-06-12-says-
// accents-crowd.xml): a lowercase ADVERB can precede the verb (`Linanna
// softly says,` / `Harsh quietly says,`) and a manner clause can follow it
// (`Aenigma says in a melodic accent,` / `asks in a rustic accent,`) — so
// the verb is followed by anything quote-free up to the comma. The
// speaker+verb live inside <preset id='speech'>, the quote follows outside;
// tag-strip flattens that. One-word speakers only (PC names are single
// words) — multi-word NPC speakers ("The Dwarven driver says") are a
// deliberate miss for now; the lowercase-adverb group can't eat a
// capitalized name word, so it doesn't change that. KNOWN GAP (corpus
// wanted): language says with NO quote ("says something in Gerenshuge").
const speechSay: SceneCapturer = {
  id: 'speech-say',
  gate: '"',
  match(line, ctx) {
    if (ctx.stream !== 'conversation') return null
    // Optional directed target ("You say to Agan,") captured BEFORE the
    // manner-clause wildcard would otherwise swallow it.
    let m = line.match(/^(?<speaker>You|[A-Z][\w']*) (?:[a-z]+ )?(?:says?|asks?|exclaims?)(?: to (?<target>[A-Z][\w']*))?[^,"]*, "(?<text>[^"]*)"/)
    if (m?.groups) return speech('say', m.groups.speaker, m.groups.text, undefined, m.groups.target)
    // Disembodied speakers (Sekmeht corpus 2026-06-12): hidden/invisible —
    // `You hear the voice of Agan say, "Ello."` (no room-list entry → the
    // Tableau's unseen-presence rule manifests a shadowed figure) — and DEAD
    // — `You hear the ghostly voice of Aenigma exclaim in a melodic accent,
    // "I'm little!"` (the body IS in the list, so the bubble lands on it).
    m = line.match(/^You hear the (?:ghostly )?voice of (?<speaker>[A-Z][\w']*) (?:[a-z]+ )?(?:says?|asks?|exclaims?)[^,"]*, "(?<text>[^"]*)"/)
    if (m?.groups) return speech('say', m.groups.speaker, m.groups.text)
    return null
  },
  provenance: 'mock.xml:536/:702/:734 (plain say/ask); corpus/2026-06-12-says-accents-crowd.xml (accent + softly forms; "You hear the voice of X say" hidden-speaker form — Sekmeht live capture) — talk stream, main duplicate ignored',
  status: 'verified',
}

// `You yell, "Hello."` / `Frodo yells, "Hello."` — yells ride the talk
// stream wrapped in <b>, not a preset (mock.xml:729). Same flattened shape.
const speechYell: SceneCapturer = {
  id: 'speech-yell',
  gate: 'yell',
  match(line, ctx) {
    if (ctx.stream !== 'conversation') return null
    const m = line.match(/^(?<speaker>You|[A-Z][\w']*) yells?,? "(?<text>[^"]*)"/)
    return m?.groups ? speech('yell', m.groups.speaker, m.groups.text) : null
  },
  provenance: 'mock.xml:729 (You yell), :775 (Frodo yells) — <b>-wrapped on the talk stream',
  status: 'verified',
}

// `Smith whispers, "…"` (to you) / `Frodo whispers to your group, "…"` /
// `You whisper to Binu, "…"` (own form drafted — not present in the corpus;
// it shares the home stream + shape family, flagged for corpus confirmation).
const speechWhisper: SceneCapturer = {
  id: 'speech-whisper',
  gate: 'whisper',
  match(line, ctx) {
    // The whispers stream COLLAPSES into 'conversation' (STREAM_ID_ALIASES —
    // the Genie/Frostbite aggregate model), so whispers share say's home
    // stream; the verb shape is the channel discriminator.
    if (ctx.stream !== 'conversation') return null
    let m = line.match(/^(?<speaker>[A-Z][\w']*) whispers(?<grp> to your group)?,? "(?<text>[^"]*)"/)
    if (m?.groups) return speech('whisper', m.groups.speaker, m.groups.text, !m.groups.grp, m.groups.grp ? undefined : 'You')
    m = line.match(/^You whisper to (?<target>[A-Z][\w']*),? "(?<text>[^"]*)"/)
    if (m?.groups) return speech('whisper', 'You', m.groups.text, undefined, m.groups.target)
    return null
  },
  provenance: 'mock.xml:708 (Smith whispers → to you), :705 (Frodo whispers to your group); "You whisper to Agan," own form corpus-confirmed (Sekmeht live capture 2026-06-12)',
  status: 'verified',
}

// Thoughts/ESP — three real shapes: gweth relay (`Your mind hears Puff
// thinking, "…"`, thoughts stream), ESP bracket (`[Frodo] "…"`, thoughts
// stream; a leading `"<to you>"` chunk marks a directed thought), and
// directed telepathy (`You hear Sauron's faded thoughts in your head
// saying, "…"` — which rides the TALK stream, mock.xml:882). The speaker is
// NOT physically present (§32.2 — consumers must never seat a body).
const speechThought: SceneCapturer = {
  id: 'speech-thought',
  gate: '"',
  match(line, ctx) {
    if (ctx.stream === 'thoughts') {
      let m = line.match(/^Your mind hears (?<speaker>[A-Z][\w']*) thinking,?\s*"(?<text>[^"]*)"/)
      if (m?.groups) return speech('thought', m.groups.speaker, m.groups.text)
      m = line.match(/^\[(?<speaker>[A-Z][\w']*)\]\s*(?<rest>.*)$/)
      if (m?.groups) {
        let rest = m.groups.rest.trim()
        let toYou = false
        const directed = rest.match(/^"<to you>"\s*/)
        if (directed) { toYou = true; rest = rest.slice(directed[0].length) }
        return speech('thought', m.groups.speaker, rest.replace(/^"|"$/g, ''), toYou)
      }
      return null
    }
    if (ctx.stream === 'conversation') {
      const m = line.match(/^You hear (?<speaker>[A-Z][\w']*)'s (?:[\w]+ )?thoughts in your head saying,?\s*"(?<text>[^"]*)"/)
      if (m?.groups) return speech('thought', m.groups.speaker, m.groups.text, true)
    }
    return null
  },
  provenance: 'mock.xml:656 (mind hears … thinking), :678/:887 (ESP bracket, incl. <to you>), :882/:890 (thoughts-in-your-head on the talk stream)',
  status: 'verified',
}

// Movement HINTS (Sekmeht's live corpus, 2026-06-12): plain main-text lines.
// FOUR observed shapes: `Magus Champion Deimeter just arrived.` (walk-in, NO
// direction), `Druid of the Spire Waydren wades into view coming from the
// west.` (arrival WITH origin — some movement styles announce it),
// `Magus Champion Deimeter runs west.` / `Waydren wades east, moving with
// the strong current.` (departures, direction possibly mid-sentence with a
// trailing clause; the verb varies with pace/style so it's an open
// `[a-z]+`), and `Crysthya just left.` (left the GAME — logoff). Titles
// precede the name; the NAME is the last capitalized word before the
// lowercase verb. These are hints, NOT authoritative: SceneParser only
// consults them when the cast diff actually fires for that name, so an
// over-match on prose is harmless by design (which is why the open verb,
// trailing clause, and empty gate are acceptable here).
const DIRECTION_WORDS = 'north|northeast|east|southeast|south|southwest|west|northwest|up|down|out'
// Title prefixes can contain LOWERCASE connectors ("Druid of the Spire
// Waydren", "Bard of Stars Eionelthaniel") — so the prefix accepts any words
// and the NAME is the last capitalized word before the verb; the anchored
// tail (just arrived/into view/direction-final) is what disambiguates.
const NAME_PREFIX = `(?:[\\w']+\\s)*(?<name>[A-Z][\\w']*)`
const RE_JUST = new RegExp(`^${NAME_PREFIX} just (?<what>arrived|left)\\.$`)
// "wades into view coming from the west." (origin known) AND "fades into
// view." (coming out of invisibility — no direction; Sekmeht corpus).
const RE_INTO_VIEW = new RegExp(`^${NAME_PREFIX} [a-z]+ into view(?:(?: coming)? from the (?<dir>${DIRECTION_WORDS}))?\\.$`)
const RE_DEPART = new RegExp(`^${NAME_PREFIX} [a-z]+ (?<dir>${DIRECTION_WORDS})(?:\\.|,.*\\.)$`)
const movementHint: SceneCapturer = {
  id: 'movement-hint',
  gate: '',   // movement lines share no literal; the anchored regexes are the filter
  match(line, ctx) {
    if (ctx.stream !== 'main') return null
    let m = line.match(RE_JUST)
    if (m?.groups) {
      return { type: 'scene-move-hint', name: m.groups.name, kind: m.groups.what === 'arrived' ? 'arrive' : 'logoff' }
    }
    m = line.match(RE_INTO_VIEW)
    if (m?.groups) {
      return { type: 'scene-move-hint', name: m.groups.name, kind: 'arrive', direction: m.groups.dir }
    }
    m = line.match(RE_DEPART)
    if (m?.groups) {
      return { type: 'scene-move-hint', name: m.groups.name, kind: 'depart', direction: m.groups.dir }
    }
    return null
  },
  provenance: 'corpus/2026-06-12-says-accents-crowd.xml (Sekmeht live): just arrived/left, runs west, wades into view coming from the west, wades east + trailing clause',
  status: 'verified',
}

// Emotes (Sekmeht corpus 2026-06-12): a PARENTHESIZED main-text line —
// `(Agan laughs.)` — actor = first word, then ANYTHING to the closing paren.
// The §35.3 catalog feared emotes had no structural marker; the parens ARE
// one. Sekmeht's rule: emotes are ALWAYS THIRD-PERSON — `act laughs` shows
// as `(Sekmeht laughs.)` even to yourself, never `(You …)` — so consumers
// must match the actor against the CHARACTER NAME for own-emotes (the `You`
// alternative below is defensive only).
const emoteCaption: SceneCapturer = {
  id: 'emote-caption',
  gate: '(',
  match(line, ctx) {
    if (ctx.stream !== 'main') return null
    // Sekmeht's rule: the character's NAME, then ANYTHING up to the closing
    // paren — so the inner match is unrestricted (`.*`), not [^()]*.
    // The name must be followed by a SPACE and a lowercase verb (v0.20.2): the
    // game puts its own notices in parentheses too — "(Roundtime: 30 seconds.)"
    // after GO PATH matched the old `Name\b.*` shape and drew a speaker called
    // "Roundtime:" on the Tableau (Sekmeht). An emote is always "Name verbs".
    const m = line.match(/^\((?<inner>(?:You|[A-Z][\w']*)\s+[a-z].*)\)$/)
    if (!m?.groups) return null
    const inner = m.groups.inner
    return { type: 'scene-emote', actor: inner.split(/\s+/)[0], text: inner }
  },
  provenance: 'corpus/2026-06-12-says-accents-crowd.xml: "(Agan laughs.)" (Sekmeht live capture)',
  status: 'verified',
}

// Logons-stream notices (Sekmeht corpus 2026-06-12): the `logons` stream
// (aliased to the `arrivals` panel) emits `* Miniature Slimjack Twosacks
// joins the adventure.` — global realm notices, not room events; the name is
// the last word before the verb phrase. Logoff/death-notice shapes are still
// corpus-pending; extend this capturer when they land.
const logonEvents: SceneCapturer = {
  id: 'logon-events',
  gate: 'joins the adventure',
  match(line, ctx) {
    if (ctx.stream !== 'arrivals') return null
    const m = line.match(/^\*\s+(?:[\w']+\s)*(?<name>[A-Z][\w']*) joins the adventure\.$/)
    return m?.groups ? { type: 'scene-logon', name: m.groups.name } : null
  },
  provenance: 'corpus/2026-06-12-combat-lavadrakes.xml: "* Miniature Slimjack Twosacks joins the adventure." (Sekmeht live capture)',
  status: 'verified',
}

export const SCENE_CAPTURERS: SceneCapturer[] = [
  speechSay,
  speechYell,
  speechWhisper,
  speechThought,
  movementHint,
  emoteCaption,
  logonEvents,
]

const LIVE_CAPTURERS = SCENE_CAPTURERS.filter(c => c.status === 'verified')

// Minimal XML entity decode for the tag-stripped line (the parser's own
// decodeEntities runs in its text() path, which this raw-line view bypasses).
// mock.xml:899: `You say, "&lt;x&gt;."` must bubble as `<x>.`.
function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// Runs the VERIFIED capturers against one RAW line (tags stripped here,
// after the early-out, so the per-line cost is zero when nothing is
// verified — and one cheap strip+decode when capturers exist). Called from
// StormFrontParser.parse() after the token loop (the pitfall-#78 call-site
// precedent).
export function runSceneCapturers(rawLine: string, ctx: SceneCtx): GameEvent[] {
  if (LIVE_CAPTURERS.length === 0) return []
  if (rawLine.length > 4000) return []  // sanity cap — speech lines are short
  const line = decodeEntities(rawLine.replace(/<[^>]*>/g, '')).trim()
  if (!line) return []
  const out: GameEvent[] = []
  const lower = line.toLowerCase()
  for (const c of LIVE_CAPTURERS) {
    if (c.gate && !lower.includes(c.gate)) continue  // '' gate = anchored-regex-only capturer
    const evt = c.match(line, ctx)
    if (evt) out.push(evt)
  }
  return out
}
