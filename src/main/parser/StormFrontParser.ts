// StormFrontParser — the stateful StormFront/DR XML tokenizer: one raw line in, typed GameEvent[] out.
//
// Where it sits: ConnectionManager 'line' → LichBridge.interceptLine →
// parse(line) here → main.ts's session line handler consumes the events
// (scene derivation, state snapshots and the renderer IPC batch all happen
// there, not here). One instance per Session, alive for the session's
// lifetime; call reset() on every new login (pitfall #4) — stream, style,
// capture and timer state otherwise bleed into the next connection.
//
// What it does: a two-token regex splits each line into tags and text. Tags
// drive a switch in tagStart()/tagEnd() that either mutates parser STATE
// (bold depth, the push/popStream stack, preset, colour stack, mono mode,
// <d>/<a> link context, compass dirs) or emits a TYPED event (vitals,
// indicators/stance, RT/CT/aim timers, room title/id/exits, hands, spell,
// injuries, exp components, stream push/declare/clear, player-info,
// game-exit, launch-url). Text accumulates as styled TextSegments in
// `pendingSegments` and is flushed as one `stream-text` event per stream per
// line; text inside a capture context (component/compdef, preset, prompt,
// inv/spell/right/left) is buffered and interpreted when its tag closes.
// Every `<…>` is consumed by the tokenizer — an unrecognised tag becomes an
// `unknown` event (unless in SILENT_TAGS; main drops these before the IPC
// batch, so it is a parser-level marker only) and its inner text still
// shows, so a new Lich/DR tag can never leak markup into the display.
//
// Invariants a change must keep (each has its own comment at the site):
//  • emit() is the SINGLE chokepoint for every event and takes ONE event —
//    never push to `events` directly, never spread an array into emit(). It
//    maintains the prompt dedup (`lastEmitWasPrompt`): a `>` is suppressed
//    only when the immediately-preceding emitted event was that same prompt,
//    so sub-stream activity (a move's room components) still lets the next
//    prompt through.
//  • Call claimPending() before every `pendingSegments.push`. push/popStream
//    deliberately do NOT flush — DR splits one sentence across consecutive
//    stream blocks on a single physical line, and a flush per transition
//    shredded remote-viewed text mid-word; the buffer is filed under
//    `pendingStream`, the stream it was WRITTEN to, not the one active at
//    flush time.
//  • RT / CT / aim-timer end values are DEFERRED and anchored on the next
//    <prompt time> — server clock, never `value*1000 − Date.now()` (pitfall
//    #87; the file also emits a `server-clock` offset on first sight/drift).
//    Any future server-pushed countdown joins the same pending*/anchor lane.
//  • The prompt is a frame boundary: it resets bold depth, preset, colour
//    stack and link context so a script's unclosed tag can't bleed forward.
//  • Room state has two independent id sources — the `<streamWindow id='main'>`
//    subtitle (three formats, pitfall #65) and `<nav rm>` (pitfall #46) — and
//    a title CHANGE emits the six room sub-stream clears BEFORE the
//    `room-title` event (B121); keep that ordering.
//  • Stream ids are normalized only through the shared alias table
//    (normalizeStreamId returns anything else unchanged — case is preserved).
//  • Hot-path work is gated: the glance-text hand fallback (inferHandsFromGlance,
//    a Profanity-style re-sync for the tags DR doesn't always send) runs behind
//    a cheap `includes()` gate, main-stream only, and yields to a real hand tag
//    on the same line; the scene line capturers run ONLY while
//    `sceneCapturersEnabled` is set from main (§35.6 — zero per-line cost
//    until an Experience is open). Keep that shape for any new per-line scan.
//  • In mono mode (`<output class="mono">`) leading/trailing whitespace IS the
//    layout — don't trim it.
//  • GS4 support (added on top of the original DR-only build): this tokenizer
//    is ONE shared instance for both game families, with no family parameter
//    or per-family config threaded in. DR and GS4 speak the same StormFront/
//    Wrayth wire grammar and their known-vocabulary tag ids DON'T COLLIDE
//    (verified against VellumFE's GemStoneIV-XML-Elements.md and cross-checked
//    against Saga's own DR/GS handling — e.g. `pbarStance`/`mindState`/
//    `encumlevel` are GS4-only, `concentration`/`conclevel` DR-only), so a
//    session's wire never sends the other family's ids and both can be
//    recognized unconditionally. Only content that's genuinely ambiguous
//    between families (none found yet) would need a real `family` gate here —
//    don't add one speculatively; extend the recognized-id lists instead, the
//    same way the progressbar/vitals case does.

import type { GameEvent, StreamTarget, TextSegment, EffectsDialog, EffectsUpdateEvent } from '../../shared/types'
import { STREAM_ID_ALIASES, normalizeStreamId } from '../../shared/streamAliases'
import { runSceneCapturers } from './sceneCapturers'

// GS4's timed-effect dialogs, exact case (verified against real captured GS4
// session fixtures — VellumFE's tests/fixtures/active_*.xml, buffs_progress.xml).
const EFFECTS_DIALOG_IDS = new Set<string>(['Active Spells', 'Buffs', 'Debuffs', 'Cooldowns'])

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

const EXIT_DIR_MAP: [RegExp, string][] = [
  [/\bnorthwest\b/i, 'nw'], [/\bnortheast\b/i, 'ne'],
  [/\bsouthwest\b/i, 'sw'], [/\bsoutheast\b/i, 'se'],
  [/\bnorth\b/i,     'n' ], [/\beast\b/i,      'e' ],
  [/\bsouth\b/i,     's' ], [/\bwest\b/i,       'w' ],
  [/\bup\b/i,        'up'], [/\bdown\b/i,       'dn'],
  [/\bout\b/i,       'out'],
]

function parseExits(text: string): string[] {
  return EXIT_DIR_MAP.filter(([re]) => re.test(text)).map(([, abbr]) => abbr)
}

// Hand-state inference from GLANCE output text (the Profanity fallback —
// ProfanityFE game_text_processor.rb does the same for the empty-hands case).
// DR does NOT push <right>/<left> XML updates for every action that puts an
// item in a hand (custom-verb event items are the known gap), so a hand can
// silently desync from the real game state with no tag ever arriving to fix
// it. GLANCE always reports the complete truth in text, so it doubles as a
// player-reachable re-sync. The single-hand forms imply the other hand is
// empty — glance never omits a held item.
const GLANCE_EMPTY_RE = /^You glance down at your empty hands\./
const GLANCE_BOTH_RE  = /^You are holding (.+?) in your right hand and (.+) in your left(?: hand)?\.$/
const GLANCE_RIGHT_RE = /^You are holding (.+) in your right hand\.$/
const GLANCE_LEFT_RE  = /^You are holding (.+) in your left hand\.$/

// The <right>/<left> tags carry the bare item name ("bamboo folder"); glance
// text carries the article form ("a bamboo folder ..."). Strip the article so
// the inferred value reads like the tag-driven one.
function stripArticle(s: string): string {
  return s.trim().replace(/^(?:a|an|some|the)\s+/i, '')
}

// v0.8.10 (B135): stream id aliases moved to [shared/streamAliases.ts](src/shared/streamAliases.ts)
// so the renderer's echoToStream and the import parsers can apply the same
// normalization. Identity-mapping entries (thoughts → thoughts, etc.) were
// dropped because normalizeStreamId returns the input unchanged when it
// isn't in STREAM_ID_ALIASES — same effect, less duplication.

// Default preset to apply to unstyled segments when emitted on these streams.
// Needed because the protocol sends thoughts/arrivals/deaths as raw text with
// no <preset> tag, so the renderer can't color them without this hint.
const STREAM_DEFAULT_PRESET: Partial<Record<string, string>> = {
  thoughts:  'thought',
  arrivals:  'speech',
  deaths:    'bold',
}

const COMPONENT_STREAM: Record<string, StreamTarget> = {
  'room objs':      'room-objects',
  'room players':   'room-players',
  'room exits':     'room-exits',
  'room desc':      'room',
  'room creatures': 'room-creatures',
  'room extra':     'room-extra',
}

// Known protocol tags that carry no display content — drop silently rather than
// emitting unknown events that pollute the display.
const SILENT_TAGS = new Set([
  // 'd' is handled in tagStart for cmd support; 'a' is handled separately for href links
  // Connection/session metadata
  'app', 'dialogdata', 'settingsinfo', 'identity', 'slot', 'playerid', 'mode',
  // Generic layout/formatting wrappers (self-closing; no text content to suppress)
  'container', 'opendialog', 'exposecontainer', 'clearcontainer',
  // Genie/StormFront UI chrome — quickbars, links, layout (image handled separately for injuries)
  'skin', 'radio', 'link', 'switchquickbar', 'endsetup', 'resource', 'exposestream',
  // Movement navigation frame marker — no display content
  'nav',
])

interface ParsedTag {
  name: string
  attrs: Record<string, string>
  closing: boolean
  selfClosing: boolean
}

function parseAttrs(inner: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /(\w+)=(?:"([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? ''
  }
  return attrs
}

function parseTag(raw: string): ParsedTag {
  const closing = raw.startsWith('</')
  const selfClosing = raw.endsWith('/>')
  const inner = raw.slice(closing ? 2 : 1, selfClosing ? -2 : -1).trim()
  const nameMatch = inner.match(/^[\w:-]+/)
  const name = (nameMatch ? nameMatch[0] : '').toLowerCase()
  return { name, attrs: parseAttrs(inner), closing, selfClosing }
}

interface CaptureContext {
  tag: string
  id?: string
  hasBold?: boolean
}

export class StormFrontParser {
  private boldDepth = 0
  private activeStream: StreamTarget = 'main'
  private streamStack: StreamTarget[] = []
  private currentPreset: string | undefined = undefined
  private colorStack: Array<{ fg?: string; bg?: string }> = []

  private compassDirs: string[] = []
  private linkCmd: string | undefined = undefined
  private linkCmdIsText = false  // true when <d> has no cmd attr; first text node becomes the cmd
  private linkHref: string | undefined = undefined

  private monoMode = false

  private inInjuriesDialog = false
  private injuryBuf: Array<{ id: string; name: string; height: number; width: number }> = []

  // GS4's timed-effect dialogs (Active Spells/Buffs/Debuffs/Cooldowns) — same
  // shape as the injuries capture above: set on <dialogData id='X'> open
  // (X being one of EFFECTS_DIALOG_IDS), populated from nested <progressBar>
  // children, emitted on the matching </dialogData> close. Unlike injuries,
  // this ALWAYS emits on close (including empty — a `clear='t'` dialog with
  // no children is a real state change: the list just cleared).
  private inEffectsDialog: EffectsDialog | null = null
  private effectsBuf: EffectsUpdateEvent['entries'] = []

  private pendingSegments: TextSegment[] = []
  /** Stream the pending buffer belongs to — see `claimPending`. */
  private pendingStream = 'main'
  private events: GameEvent[] = []

  // §35.6 perf gate: scene line capturers run ONLY while the session has an
  // open Experience (set from main via 'scene-active-toggle'). Default OFF —
  // a player who never opens an Experience pays zero per-line cost.
  sceneCapturersEnabled = false

  private captureCtx: CaptureContext | null = null
  private captureBuf = ''
  // v0.8.5 (B117): per-segment view of the captureBuf so component-emit
  // can preserve <pushBold/> spans through the stream-text event. Tracks
  // alongside captureBuf; reset together when a captureCtx closes.
  private captureSegments: TextSegment[] = []

  // Game state for computing the prompt indicator string — matches Genie's prompt logic
  private rtExpires = 0                        // ms timestamp; 0 = no roundtime
  // RT/CT are anchored to the SERVER clock, not the local clock (B-clockskew):
  // the server sends an absolute end-time in <roundTime value> / <castTime value>
  // and its OWN current time in every <prompt time=…>. Comparing the end-time to
  // the local Date.now() (the old approach) inflated the bar by the client/server
  // clock skew (Aubrey's PC was ~minutes behind → RT bar maxed and counted down
  // from a huge number). Frostbite (xmlparserthread.cpp) and Genie (Game.cs) both
  // DEFER the duration calc to the next <prompt> and compute end − promptTime; we
  // mirror that. `lastPromptTime` is the latest server time seen; pending* hold a
  // <roundTime>/<castTime> end-value awaiting the next prompt to anchor it.
  private lastPromptTime = 0                   // server Unix seconds; 0 = none seen yet
  // Last server-clock offset EMITTED (ms). null = never emitted. Re-emitted only
  // on drift > 2s so a per-turn prompt doesn't become a per-turn event.
  private lastClockOffsetMs: number | null = null
  private pendingRtEnd: number | null = null
  private pendingCtEnd: number | null = null
  private pendingAimEnd: number | null = null  // AimTimerDialog firingTimer; 0 = clear
  private stance: '' | 's' | 'K' | 'P' = ''  // '' = standing (no prefix)
  private isHidden    = false
  private isInvisible = false
  private isStunned   = false
  private isWebbed    = false
  private isBleeding  = false
  private isJoined    = false
  private isDead      = false
  private isPoisoned  = false
  private isDiseased  = false
  // UNCONSCIOUS has no indicator tag — DR signals it ONLY as the `U` in the
  // status prompt (`SUP>` = stunned + unconscious + prone), confirmed by Binu
  // (2026-09-15): it needs `set statusprompt` on, and the letter disappears the
  // moment you wake. Neither Genie, Frostbite nor Profanity surfaces it, and
  // Lich's ICONMAP has no entry for it, so the prompt letter is the only source.
  private isUnconscious = false

  // Prompt dedup — DR fires a <prompt> after every server transaction. We show
  // the FIRST prompt after any activity and suppress only EXACT repeats that
  // immediately follow another prompt with nothing in between. Keying on "was the
  // last EMITTED event an identical prompt" (not on the last MAIN text) is what
  // fixes the old gap: a move/look whose output goes to SUB-streams (room title,
  // exits, "also here") counts as activity, so the post-move `>` shows instead of
  // being wrongly swallowed as a duplicate. Maintained via emit() below, which
  // every event push routes through. (statusprompt drift like "H>"→"R>" still
  // shows — the TEXT differs, so it isn't an exact repeat.)
  private lastPromptText = ''
  private lastEmitWasPrompt = false

  // B121 (v0.8.7): last seen streamWindow main subtitle's cleaned title.
  // Used to gate clear-stream emission so a streamWindow re-emit with the
  // same title doesn't wipe just-populated sub-stream data.
  private lastRoomTitle = ''

  // Call when a new connection is established to clear carry-over state
  reset() {
    this.boldDepth     = 0
    this.activeStream  = 'main'
    this.streamStack   = []
    this.currentPreset = undefined
    this.colorStack    = []
    this.pendingSegments = []
    this.pendingStream = 'main'
    this.events        = []
    this.captureCtx    = null
    this.captureBuf    = ''
    this.captureSegments = []
    this.compassDirs       = []
    this.linkCmd           = undefined
    this.linkCmdIsText     = false
    this.linkHref          = undefined
    this.monoMode          = false
    this.inInjuriesDialog  = false
    this.injuryBuf         = []
    this.inEffectsDialog   = null
    this.effectsBuf        = []
    this.lastPromptText    = ''
    this.lastEmitWasPrompt = false
    this.lastRoomTitle     = ''
    this.rtExpires     = 0
    this.lastPromptTime = 0
    // Cleared with the rest of the per-session state (pitfall #4) so a new login
    // re-emits the offset instead of assuming the previous session's.
    this.lastClockOffsetMs = null
    this.pendingRtEnd  = null
    this.pendingCtEnd  = null
    this.pendingAimEnd = null
    this.stance        = ''
    this.isHidden      = false
    this.isInvisible   = false
    this.isStunned     = false
    this.isWebbed      = false
    this.isBleeding    = false
    this.isJoined      = false
    this.isDead        = false
    this.isPoisoned    = false
    this.isDiseased    = false
    this.isUnconscious = false
  }

  // Single chokepoint for every emitted event. Tracks whether the LAST event was
  // a prompt so the prompt handler can suppress only exact back-to-back repeats
  // (any non-prompt event — main OR sub-stream — resets the flag, which is the
  // "break in the pattern" that lets the next `>` through). Route ALL pushes
  // through this rather than this.events.push directly.
  private emit(e: GameEvent) {
    this.lastEmitWasPrompt = e.type === 'stream-text' && e.prompt === true
    this.events.push(e)
  }

  // Extracts a room title + optional roomId from a fragment containing a
  // bracketed title (optionally followed by parens uid) and emits the
  // room-title event, gated clear-streams included. Silently no-ops if the
  // fragment has no `[...]` — a caller passing something bracket-less (GS4's
  // streamwindow subtitle) is a deliberate, safe no-op, not an error; see
  // the parse()-level roomName fallback for GS4's real title source.
  //
  // Extracted from the streamwindow subtitle handler (unchanged logic — this
  // is a pure refactor) so the SAME extraction+emit logic can also run
  // against GS4's inline `<style id="roomName"/>[Title...] (uid)` text,
  // which — verified live (Ilten @ GST, 2026-08-27) — carries the exact same
  // bracket format DR's subtitle does, just delivered a different way.
  private extractAndEmitRoomTitle(fragment: string) {
    const titleMatch = fragment.match(/\[([^\]]+)\]/)
    if (!titleMatch) return
    const inner = titleMatch[1]
    // DR carries the room id in TWO subtitle formats — handle both:
    //   "[Whistling Wood, Barrows - 9479]"   id INSIDE the brackets after " - "
    //   "[Arthelun Ruins, Courtyard] (56107)" id in PARENS after the brackets
    // The parens form is the StormFront standard `[Title] (uid)`, with
    // "(**)" meaning unmapped (e.g. "[The Heavens] (**)" during a
    // telescope flip). Before v0.11.2 only the dash form was parsed, so
    // parens-form rooms got NO roomId — the Lich Map's instant
    // lichDb.get(roomId) lookup never fired and it fell back to the
    // fragile title+desc match (the "stuck until something forces a
    // re-emit" symptom), and $roomid was empty. The parens form also
    // accepts a `u` prefix (`(u12345)`): with Lich's display_uid
    // setting on, Lich REWRITES the native `(12345)` to `(u12345)`
    // (the same game uid, u-prefixed) — `u?` parses both to the bare
    // id so the lichDb lookup is identical (Lich 5.18 review, pitfall
    // #65). Non-numeric parens (`(**)`, `(unknown)`) still miss →
    // roomId stays undefined, preserving the id-absence no-op.
    // Lich 5.20 (#1491/#1500) added an OPT-IN placement that puts the
    // uid INSIDE the brackets: "[Town Square - 1234 - (u230008)]",
    // where 1234 is Lich's own id and 230008 the game's. Neither of
    // the two older patterns matches it — the dash form needs digits
    // at the very end (this ends with ')') and the parens form needs
    // them AFTER the ']' — so the id was lost AND the decorations
    // stayed in the title, which would also break the Genie map's
    // title matching. Strip it first, then fall through as before.
    //
    // Default users see none of this: Lich embeds nothing in the title
    // unless the player opts in, and `<nav rm>` (now sent on every DR
    // arrival) is the primary id source regardless.
    //
    // GS4 support adds a FOURTH shape, verified live (Ilten @ GST,
    // 2026-08-27): a dash-number INSIDE the brackets AND a uid OUTSIDE in
    // parens, BOTH present — "[Town Square, Southwest - 284] (u7046)". 284
    // is the same kind of ambiguous number as case A (Lich's own id, not
    // necessarily the game's); 7046 is the real game uid. And sometimes the
    // dash slot is present but EMPTY — "[Town Square, Southwest - ]
    // (u7046)" — Lich's display_lichid apparently not populated. The digit
    // group below is therefore OPTIONAL (`\d*`, not `\d+`): a bare trailing
    // "- " with nothing after it still needs stripping from the title (it
    // used to survive as a dangling "-" — `.trim()` only removes
    // whitespace, not the dash character itself), even though there's no
    // number to extract as an id in that case.
    const innerUid = inner.match(/\s*-\s*\(u(\d+)\)\s*$/)
    const afterUid = innerUid ? inner.slice(0, innerUid.index) : inner
    const trailMatch = afterUid.match(/\s*-\s*(\d*)\s*$/)
    const cleanTitle = trailMatch
      ? afterUid.slice(0, trailMatch.index).trim()
      : afterUid.trim()
    const trailNum = trailMatch && trailMatch[1] ? parseInt(trailMatch[1], 10) : undefined
    // Checked whenever innerUid didn't already resolve it — regardless of
    // whether trailMatch/trailNum also matched (case D needs BOTH checked,
    // unlike the old either/or). The in-bracket/outside-parens uid is
    // UNAMBIGUOUSLY the game uid, so it wins over the ambiguous dash-number
    // slot whenever both are present — the map indexes both number spaces
    // regardless (MapPanel), so using the dash-number in the rarer case
    // where NEITHER uid form is present still resolves either way.
    const parenMatch = innerUid ? null : fragment.match(/\]\s*\(u?(\d+)\)/)
    const roomId = innerUid
      ? parseInt(innerUid[1], 10)
      : parenMatch
        ? parseInt(parenMatch[1], 10)
        : trailNum
    // B121 (Rakkor, v0.8.7): emit clear-streams for room
    // sub-components BEFORE the room-title event whenever the
    // subtitle CHANGES (new room). DR sends streamWindow
    // before any `<component id='room ...'/>` for the new
    // room, so the clears fire first; components with data
    // then re-populate via their own clear+stream-text
    // emission, while empty sections stay cleared. Without
    // this, if DR omits <nav> AND the new room has no players
    // / creatures / objects component, the previous room's
    // section data carries over until LOOK (which forces
    // every component to re-emit). Using lastRoomTitle as
    // the gate so the clear only fires on actual changes,
    // not every streamWindow repaint.
    if (cleanTitle !== this.lastRoomTitle) {
      this.lastRoomTitle = cleanTitle
      this.emit({ type: 'clear-stream', stream: 'room' })
      this.emit({ type: 'clear-stream', stream: 'room-objects' })
      this.emit({ type: 'clear-stream', stream: 'room-players' })
      this.emit({ type: 'clear-stream', stream: 'room-creatures' })
      this.emit({ type: 'clear-stream', stream: 'room-extra' })
      this.emit({ type: 'clear-stream', stream: 'room-exits' })
    }
    this.emit({
      type: 'room-title',
      title: cleanTitle,
      roomId,
    })
  }

  parse(line: string): GameEvent[] {
    this.events = []
    const isBlankLine = !line.replace(/[\r\n]/g, '').trim()

    const tokenRe = /(<[^>]*>)|([^<]+)/g
    let m: RegExpExecArray | null
    while ((m = tokenRe.exec(line)) !== null) {
      if (m[1]) {
        const tag = parseTag(m[1])
        if (!tag.closing) this.tagStart(tag.name, tag.attrs, tag.selfClosing)
        if (tag.closing)  this.tagEnd(tag.name)
      } else if (m[2]) {
        this.text(m[2])
      }
    }

    this.flushSegments()

    // Glance-text hand re-sync — after the token loop so the suppression check
    // sees any real hand tags this line emitted.
    this.inferHandsFromGlance(line)

    // Guild capture from the `info` output line — the exact source Lich's
    // drinfomon uses for DRStats.guild (drparser.rb NameRaceGuild). Feeds the
    // exp panel's Badging auto-default. Cheap startsWith gate keeps the hot
    // path untouched; main-stream-only so a script echoing an info-shaped
    // line into a panel can't repaint the guild.
    if (line.startsWith('Name:') && this.activeStream === 'main' && this.streamStack.length === 0) {
      // VERBATIM Lich NameRaceGuild (drparser.rb:10) — GREEDY captures with a
      // trailing \b\s+ anchor. A lazy version would stop "Moon Mage" at
      // "Moon"; DR pads the info line with trailing whitespace, which is
      // what lets the greedy guild capture land on the full name.
      const m = line.match(/^Name:\s+\b(.+)\b\s+Race:\s+\b(.+)\b\s+Guild:\s+\b(.+)\b\s+/)
      if (m) this.emit({ type: 'character-guild', name: m[1].trim(), guild: m[3].trim() })
    }

    // GS4 room title fallback — verified live (Ilten @ GST, 2026-08-27): at
    // least some GS4 accounts send a BRACKET-LESS `<streamWindow id='main'
    // subtitle=" - Town Square, Southeast">` (no title/id extractable —
    // extractAndEmitRoomTitle above silently no-ops on it), while the REAL
    // bracketed title+id flows separately as inline text styled
    // `<style id="roomName"/>[Town Square, Southwest - 284] (u7046)` — same
    // bracket format DR's subtitle uses, just delivered a different way.
    // Same main-stream-only safety gate as the guild capture above (a script
    // echoing this shape into a panel can't spoof a room change). Purely
    // additive: if DR ALSO ever sends this inline marker with a title that's
    // already current, extractAndEmitRoomTitle's lastRoomTitle gate makes the
    // second call a harmless no-op repaint, not a duplicate room change.
    if (line.includes('roomName') && this.activeStream === 'main' && this.streamStack.length === 0) {
      const rm = line.match(/<style id=["']roomName["']\s*\/>([^<]*)/)
      if (rm) this.extractAndEmitRoomTitle(rm[1])
    }

    // SceneParser line capturers (DESIGN §35.1) — registry-driven; only
    // corpus-VERIFIED capturers execute. GATED on sceneCapturersEnabled
    // (§35.6 perf contract): until this session has an open Experience, NOT
    // ONE EXTRA OPERATION runs per line — no tag-strip, no entity decode, no
    // gate checks. Main flips the flag via the 'scene-active-toggle' IPC
    // (the debugPanelOpen raw-XML precedent). The stream/preset ctx is the
    // §35.1 suppression: a Lich script echoing speech-shaped text into a
    // custom panel can't mint a phantom scene event. (Cast/arrive/depart
    // events do NOT come from here — SceneParser.derive in main owns those.)
    if (this.sceneCapturersEnabled) {
      const sceneLineEvents = runSceneCapturers(line, { stream: this.activeStream, preset: this.currentPreset })
      for (const e of sceneLineEvents) this.emit(e)
    }

    // Preserve intentional blank lines from the server as empty spacers
    if (isBlankLine && this.events.length === 0) {
      this.emit({
        type: 'stream-text',
        stream: this.activeStream,
        segments: [{ text: '' }],
        timestamp: Date.now(),
      })
    }

    return this.events
  }

  private static readonly URL_RE = /https?:\/\/[^\s<>"']+/g

  /**
   * Claim the pending buffer for the CURRENT stream, flushing first if it
   * still holds text bound for a different one.
   *
   * This is what makes deferring the push/pop flush safe: segments are only
   * ever emitted under the stream they were actually written to, and a line
   * carrying content for two streams still splits at the boundary — it just
   * no longer splits when the stream is the same on both sides.
   *
   * MUST be called before every `pendingSegments.push`.
   */
  private claimPending() {
    if (this.pendingSegments.length > 0 && this.pendingStream !== this.activeStream) this.flushSegments()
    if (this.pendingSegments.length === 0) this.pendingStream = this.activeStream
  }

  private pushSegment(text: string, extra: Partial<TextSegment> = {}) {
    this.claimPending()
    const topColor = this.colorStack[this.colorStack.length - 1]
    this.pendingSegments.push({
      text,
      ...(this.boldDepth > 0 ? { bold: true }                 : {}),
      ...(this.currentPreset ? { preset: this.currentPreset } : {}),
      ...(topColor?.fg       ? { fg: topColor.fg }            : {}),
      ...(topColor?.bg       ? { bg: topColor.bg }            : {}),
      ...(this.linkCmd       ? { cmd: this.linkCmd }           : {}),
      ...(this.linkHref      ? { href: this.linkHref }         : {}),
      ...extra,
    })
  }

  private text(value: string) {
    if (this.captureCtx) {
      const cleaned = decodeEntities(value.replace(/\r/g, ''))
      this.captureBuf += cleaned
      // B117: also accumulate as segments with current bold state so the
      // component-emit can carry per-piece styling. Empty strings would
      // produce a useless empty segment — skip them.
      if (cleaned) {
        this.captureSegments.push({
          text: cleaned,
          ...(this.boldDepth > 0 ? { bold: true } : {}),
        })
      }
      return
    }
    const cleaned = decodeEntities(value.replace(/\r/g, '').replace(/\n$/, ''))
    if (!cleaned) return
    // Skip leading whitespace-only tokens (start of line), but preserve spaces that
    // appear between segments on the same line (e.g. between adjacent <a href> links).
    //
    // NOT IN MONO MODE, where leading whitespace IS the layout. `INV HELP` is
    // the case that exposed this: its indented rows begin with a <d> command
    // link, so the indent arrives as a whitespace-only text token with nothing
    // pending yet and was dropped — every <d>-led row jumped to column 0 while
    // the plain-text rows beside it kept their indent, shearing the table in
    // half. Same reasoning as the mono carve-out in the `preset` capture below.
    if (!cleaned.trim() && this.pendingSegments.length === 0 && !this.monoMode) return
    // <d>TEXT</d> with no cmd attr — first non-empty text node becomes the command
    if (this.linkCmdIsText && !this.linkCmd) {
      const candidate = cleaned.trim()
      if (candidate) this.linkCmd = candidate
    }
    // Inside an explicit link — emit as-is
    if (this.linkHref || this.linkCmd) {
      this.pushSegment(cleaned)
      return
    }
    // Auto-detect bare URLs in plain text and split into href segments
    StormFrontParser.URL_RE.lastIndex = 0
    if (StormFrontParser.URL_RE.test(cleaned)) {
      StormFrontParser.URL_RE.lastIndex = 0
      let last = 0
      let m: RegExpExecArray | null
      while ((m = StormFrontParser.URL_RE.exec(cleaned)) !== null) {
        // Strip trailing sentence punctuation that is almost never part of the URL
        const url = m[0].replace(/[.,;:!?)\]'"]+$/, '')
        if (!url) continue
        if (m.index > last) this.pushSegment(cleaned.slice(last, m.index))
        this.pushSegment(url, { href: url, autoHref: true })
        // Any stripped trailing punctuation becomes plain text
        const stripped = m[0].slice(url.length)
        if (stripped) this.pushSegment(stripped)
        last = m.index + m[0].length
      }
      if (last < cleaned.length) this.pushSegment(cleaned.slice(last))
      return
    }
    this.pushSegment(cleaned)
  }

  private tagStart(name: string, attrs: Record<string, string>, selfClosing: boolean) {
    switch (name) {

      // NOTE both stream cases below deliberately do NOT flush. DR splits a
      // single sentence across CONSECUTIVE pushStream blocks on ONE physical
      // line — shadewatch mirrors, arena view and distant gaze all do it:
      //
      //   ...shatters into a thousand<popStream/><pushStream id="familiar"/> small projectiles!
      //
      // Flushing on every push/pop emitted each fragment as its own line, so
      // remote-viewed text arrived shredded mid-word ("A crimson mist" /
      // " briefly appears around" / " Sheearyn's arms."). Flushing is now
      // deferred to `claimPending`, which fires only when the target stream
      // genuinely changes — so a same-stream pop→push merges, while a real
      // switch (DR's talk-then-main speech double-emit) still splits. The
      // end-of-line flush in parse() closes the line either way.
      case 'pushstream': {
        const id = attrs.id ?? ''
        const target = normalizeStreamId(id)
        this.streamStack.push(this.activeStream)
        this.activeStream = target
        // Always emit stream-push so the renderer can discover new streams
        if (id) this.emit({ type: 'stream-push', stream: target })
        break
      }

      case 'popstream':
        this.activeStream = this.streamStack.pop() ?? 'main'
        break

      case 'pushbold':
        this.boldDepth++
        break

      case 'popbold':
        if (this.boldDepth > 0) this.boldDepth--
        break

      case 'b':
        if (!selfClosing) {
          this.boldDepth++
          if (this.captureCtx) this.captureCtx.hasBold = true
        }
        break

      case 'preset':
        if (!selfClosing) {
          this.currentPreset = (attrs.id ?? '').toLowerCase()
          // Don't overwrite an outer component/compdef capture — text inside a
          // <preset> nested in <component> must accumulate in the component buffer.
          if (!this.captureCtx) {
            this.captureCtx = { tag: 'preset' }
            this.captureBuf = ''
            this.captureSegments = []
          }
        }
        break

      case 'style': {
        // Style is a push/pop marker, not a container — text flows normally after it.
        // <style id='roomName'/> sets the active preset; <style id=''/> clears it.
        // Works for both self-closing and open forms the server may send.
        this.flushSegments()
        const styleId = (attrs.id ?? '').toLowerCase()
        this.currentPreset = styleId || undefined
        break
      }

      case 'color': {
        // Self-closing <color/> has no content to style — skip the push entirely.
        // Without this guard the stack grows permanently because tagEnd is never
        // called for self-closing tags, so the entry would never be popped.
        if (selfClosing) break
        const fg = attrs.fg || undefined
        const bg = attrs.bg || undefined
        this.colorStack.push({ fg, bg })
        break
      }

      case 'compass':
        this.compassDirs = []
        break

      case 'dir':
        if (selfClosing && attrs.value) {
          const raw = attrs.value.toLowerCase()
          this.compassDirs.push(raw === 'down' ? 'dn' : raw)
        }
        break

      case 'progressbar': {
        // GS4 effects dialog child — captured into effectsBuf, NOT treated as
        // a vital/stance bar. Must run BEFORE the lowercased vital-id checks
        // below: a numeric wire id ('905', 'c123') never collides with them,
        // but without this branch these tags were silently dropped (no known
        // id matched, so the if/else chain fell through with no emit).
        if (this.inEffectsDialog) {
          this.effectsBuf.push({
            id:      attrs.id ?? '',
            name:    attrs.text ?? '',
            percent: parseInt(attrs.value ?? '0', 10),
            ...(attrs.time ? { time: attrs.time } : {}),
          })
          break
        }

        const id         = (attrs.id ?? '').toLowerCase()
        const text       = attrs.text ?? ''
        const value      = parseInt(attrs.value ?? '0', 10)
        const customText = attrs.customText === 't' || attrs.customtext === 't'

        if (id === 'pbarstance') {
          // GS4's defense-% bar (id confirmed against VellumFE's
          // GemStoneIV-XML-Elements.md, empirically derived from real GS4
          // session logs). Already game-agnostic — DR simply never sends
          // this id, so no family gate is needed here.
          const label = text.split(/\s+/)[0] ?? ''
          this.emit({ type: 'stance', text: label, value })
        } else if (id === 'health' || id === 'mana' || id === 'spirit' ||
                   id === 'stamina' || id === 'concentration' || id === 'conclevel' ||
                   id === 'mindstate' || id === 'encumlevel') {
          // 'concentration'/'conclevel' are DR-only; 'mindstate'/'encumlevel'
          // are GS4-only (same GemStoneIV-XML-Elements.md source). Both sets
          // are handled unconditionally rather than gated on family: a DR
          // session's wire never sends the GS4 ids and vice versa, so there's
          // no runtime collision, and adding a case here needs no parser
          // constructor/config threading — see the file-header note on why
          // this parser stays a single shared instance across families.
          const normalizedId =
            id === 'conclevel'  ? 'concentration' :
            id === 'encumlevel' ? 'encumbrance'   :
            id === 'mindstate'  ? 'mindstate'      : id
          // Two DIFFERENT, CONFLICTING uses of customText='t' text, verified
          // against a real live GS4 capture (Ilten @ GST, 2026-08-27) after
          // the DR-only assumption below produced a visibly wrong vitals bar
          // ("Health 160/ 100%"). DR's customText vitals (a Barbarian's
          // "inner fire 59%") carry a NAME + trailing percent — value IS the
          // percentage, text is a label to show INSTEAD of the plain name.
          // GS4's health/mana/stamina/spirit ALWAYS carry customText='t' with
          // text="<name> <current>/<max>" (e.g. 'health 160/160') — value is
          // STILL the percentage (100 = full), but current/max as raw numbers
          // live only in text. Try the GS4 cur/max shape FIRST (a trailing
          // "N/M" — DR's label text never contains a slash), falling back to
          // DR's name-extraction shape so that path is untouched.
          const curMaxMatch = customText ? text.match(/(\d+)\s*\/\s*(\d+)\s*$/) : null
          let current = value
          let max = 100
          let label: string | undefined
          if (curMaxMatch) {
            current = parseInt(curMaxMatch[1], 10)
            max = parseInt(curMaxMatch[2], 10)
          } else if (customText) {
            const rawLabel = text.replace(/\s*\d+%?\s*$/, '').trim()
            label = rawLabel ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1) : undefined
          }
          // ATTACH RESYNC. Lich's detachable-client init hardcodes value='0'
          // on every bar and carries the real numbers ONLY in `text` (lich-5
          // global_defs.rb, detachable_client_send_init), so reading `value`
          // painted every vital at ZERO the instant you attached — worse than
          // blank, since a zeroed bar looks like live data and reads as "one
          // hit from dead".
          //
          // THE TEXT IS "health 100/" IN DR — NOT "health 100/100".
          // Lich builds it as "#{XMLData.health}/#{XMLData.max_health}", and it
          // derives both by scanning numbers out of DR's own bar text
          // (xmlparser.rb: `@health, @max_health = text.scan(/-?\d+/)`). DR
          // sends a PERCENTAGE — `text='mana 86%'` (captured live) — which
          // yields ONE number, leaving max_health nil, which interpolates to
          // the empty string. Hence: take the FIRST number in the text and
          // treat a missing or zero max as 100, which is correct for DR
          // because these vitals ARE percentages.
          //
          // Only reached when curMaxMatch above didn't already resolve
          // current/max — a GS4 attach (if that ever exists) would already be
          // customText='t' with a "current/max" shape indistinguishable from
          // this, so curMaxMatch fires first and this never double-applies.
          // Still deliberately narrow beyond that — only when `value` is 0.
          // DR's live bars carry a correct `value` (86 in that capture) and
          // take exactly the path they always did; customText bars
          // ('inner fire 59%') likewise.
          if (!curMaxMatch && value === 0) {
            const textNums = text.match(/-?\d+/g)
            if (textNums !== null && textNums.length > 0) {
              current = Number(textNums[0])
              max = textNums.length > 1 && Number(textNums[1]) > 0 ? Number(textNums[1]) : 100
            }
          }
          this.emit({
            type: 'vital-update',
            id: normalizedId as 'health' | 'mana' | 'spirit' | 'stamina' | 'concentration' | 'mindstate' | 'encumbrance',
            current,
            max,
            ...(label !== undefined ? { label } : {}),
          })
        }
        break
      }

      case 'indicator': {
        const raw = attrs.id ?? ''
        const normalized = raw.replace(/^Icon/i, '').toLowerCase()
        if (normalized) {
          const visible = attrs.visible === 'y'
          if (normalized === 'standing' && visible) { this.stance = '';  this.emit({ type: 'stance', text: 'Standing', value: 0 }) }
          if (normalized === 'sitting'  && visible) { this.stance = 's'; this.emit({ type: 'stance', text: 'Sitting',  value: 0 }) }
          if (normalized === 'kneeling' && visible) { this.stance = 'K'; this.emit({ type: 'stance', text: 'Kneeling', value: 0 }) }
          if (normalized === 'prone'    && visible) { this.stance = 'P'; this.emit({ type: 'stance', text: 'Prone',    value: 0 }) }
          if (normalized === 'hidden')    this.isHidden    = visible
          if (normalized === 'invisible') this.isInvisible = visible
          if (normalized === 'stunned')   this.isStunned   = visible
          if (normalized === 'webbed')    this.isWebbed    = visible
          if (normalized === 'bleeding')  this.isBleeding  = visible
          if (normalized === 'joined')    this.isJoined    = visible
          if (normalized === 'dead')      this.isDead      = visible
          // Poisoned / Diseased — confirmed against Genie's Core/Game.cs:2073–2091
          // case list. Both clients (Frostbite doesn't track these at all)
          // already exposed them as `$poisoned` / `$diseased` reserved
          // variables. Surface via the standard indicator-event path; the
          // renderer's `indicators.poisoned` / `indicators.diseased` map
          // is populated automatically.
          if (normalized === 'poisoned')  this.isPoisoned  = visible
          if (normalized === 'diseased')  this.isDiseased  = visible
          if (!['standing','sitting','kneeling','prone'].includes(normalized)) {
            this.emit({ type: 'indicator', id: normalized, visible })
          }
        }
        break
      }

      case 'roundtime':
        // Defer: store the server END-time, anchor it on the next <prompt>
        // (see the lastPromptTime/pending* field note). The old code emitted
        // value*1000 here and the renderer compared it to Date.now(), which
        // inflated the bar by any client/server clock skew.
        this.pendingRtEnd = parseInt(attrs.value ?? '0', 10)
        break

      case 'casttime':
        this.pendingCtEnd = parseInt(attrs.value ?? '0', 10)
        break

      case 'timer':
        // DR's Aim Timer rides `<dialogData id='AimTimerDialog'><timer
        // id='firingTimer' value='N'/></dialogData>`. `value` is an absolute
        // Unix-seconds END time (when "You think you have your best shot
        // possible now." fires); `value='0'` clears it (best shot reached,
        // focus lost, or initial open). Defer + anchor on the next <prompt>
        // exactly like roundtime/casttime (server-clock, pitfall #87). Only
        // firingTimer is the aim timer — ignore any other timer id (no `unknown`
        // noise). The toggle is in-game (`toggle aim`): disabled → no timer tag
        // is sent → nothing to show.
        if ((attrs.id ?? '').toLowerCase() === 'firingtimer') {
          this.pendingAimEnd = parseInt(attrs.value ?? '0', 10)
        }
        break

      case 'streamwindow': {
        const id    = attrs.id ?? ''
        const lower = id.toLowerCase()
        if (lower === 'main') {
          // Extract room title from subtitle — only 'main' carries this.
          // See extractAndEmitRoomTitle for the format handled. GS4 support:
          // this subtitle is BRACKET-LESS for at least some GS4 accounts
          // (verified live: `subtitle=" - Town Square, Southeast"`, no title
          // brackets, no id) — extractAndEmitRoomTitle silently no-ops when
          // it finds no brackets, and the parse()-level roomName fallback
          // below picks up the real bracketed title from inline text instead.
          if (attrs.subtitle) this.extractAndEmitRoomTitle(attrs.subtitle)
        } else if (id) {
          // Any other streamWindow is a stream declaration — translate the ID
          // the same way pushStream does so that declare and push use the same target.
          const target = normalizeStreamId(id)
          this.emit({
            type: 'stream-declare',
            stream: target,
            title: attrs.title || id,
          })
        }
        break
      }

      case 'exit':
        // Server sends <exit/> after processing QUIT — signals a clean logout.
        // Distinct from an unexpected socket close (network drop, Lich crash).
        this.emit({ type: 'game-exit' })
        break

      case 'launchurl': {
        const src = attrs.src ?? ''
        if (src) {
          const url = src.startsWith('http') ? src : `https://www.play.net${src}`
          this.emit({ type: 'launch-url', url })
        }
        break
      }

      case 'output':
        this.monoMode = (attrs.class === 'mono')
        break

      case 'app':
        if (attrs.char) {
          this.emit({ type: 'player-info', char: attrs.char, game: attrs.game ?? '' })
        }
        break

      case 'nav':
        this.emit({ type: 'clear-stream', stream: 'room' })
        this.emit({ type: 'clear-stream', stream: 'room-objects' })
        this.emit({ type: 'clear-stream', stream: 'room-players' })
        this.emit({ type: 'clear-stream', stream: 'room-exits' })
        // v0.8.8 (Rakkor): DR's <nav rm='X'/> carries the new room id on
        // every transition (Lich's $room variable derives from this). For
        // most transitions DR ALSO sends a fresh <streamWindow id='main'
        // subtitle='[Title - rm]'/> right after which would update both
        // title and roomId via the streamwindow handler above — but DR is
        // occasionally silent about <streamWindow> for some transition
        // shapes (teleports, NPC-induced moves, certain scripted moves),
        // leaving roomState.title / .roomId stuck on the prior room until
        // a manual LOOK forces DR to re-emit. By extracting attrs.rm
        // here we at least keep roomId fresh on those silent transitions.
        // The Lich Map's match path tries `lichDb.get(roomId)` BEFORE
        // falling back to title lookup, so a fresh roomId is sufficient
        // for the indicator to track correctly. Title / desc / sub-stream
        // content still update only on real <streamWindow> + <component>
        // emissions — Room panel will still show stale title in the
        // silent-transition case, but the map snaps right.
        if (attrs.rm) {
          const rm = parseInt(attrs.rm, 10)
          if (!isNaN(rm)) this.emit({ type: 'room-id', roomId: rm })
        }
        break

      case 'clearstream': {
        const id = attrs.id ?? ''
        // v0.8.10: use STREAM_ID_ALIASES directly (not normalizeStreamId) so an
        // id that isn't an alias falls through to COMPONENT_STREAM lookup —
        // normalizeStreamId always returns a string (never undefined) which
        // would short-circuit the COMPONENT_STREAM fallback.
        const stream = STREAM_ID_ALIASES[id] ?? COMPONENT_STREAM[id] ?? (id || null)
        if (stream) this.emit({ type: 'clear-stream', stream })
        break
      }

      case 'component':
      case 'compdef': {
        const id = attrs.id ?? ''
        if (id.startsWith('exp ') || COMPONENT_STREAM[id]) {
          this.captureCtx = { tag: name, id }
          this.captureBuf = ''
          this.captureSegments = []
        }
        break
      }

      case 'inv':
        // <inv id='stow'>item name</inv> — container contents routed to a panel in
        // Stormfront. We have no container panel, so absorb and discard the text.
        if (!selfClosing) { this.captureCtx = { tag: 'inv' }; this.captureBuf = ''; this.captureSegments = [] }
        break

      case 'spell':
        if (!selfClosing) { this.captureCtx = { tag: 'spell' }; this.captureBuf = ''; this.captureSegments = [] }
        break

      case 'right':
        if (!selfClosing) { this.captureCtx = { tag: 'right' }; this.captureBuf = ''; this.captureSegments = [] }
        break

      case 'left':
        if (!selfClosing) { this.captureCtx = { tag: 'left' }; this.captureBuf = ''; this.captureSegments = [] }
        break

      case 'a':
        if (!selfClosing && attrs.href) {
          this.linkHref = attrs.href
        }
        break

      case 'd':
        if (!selfClosing) {
          if (attrs.cmd) {
            this.linkCmd       = attrs.cmd
            this.linkCmdIsText = false
          } else {
            // No cmd attr — the text content IS the command (e.g. <d>south</d>)
            this.linkCmd       = undefined
            this.linkCmdIsText = true
          }
        }
        break

      case 'dialogdata':
        if (attrs.id === 'injuries') {
          this.inInjuriesDialog = true
          this.injuryBuf = []
        } else if (EFFECTS_DIALOG_IDS.has(attrs.id ?? '')) {
          this.inEffectsDialog = attrs.id as EffectsDialog
          this.effectsBuf = []
          // `clear='t'` (a real GS4 shape — see active_spells_clear.xml)
          // arrives SELF-CLOSING (`<dialogData id='Active Spells'
          // clear='t'/>`) — the parse() dispatch above only calls tagEnd()
          // for a real `</dialogData>` closing tag, never for a self-closing
          // one, so without this the "clear" would never finalize: no
          // effects-update emits, and inEffectsDialog sticks open to swallow
          // whatever unrelated <progressBar> arrives next. Finalize
          // immediately here instead; the normal (non-self-closing, has
          // children) shape still finalizes in tagEnd as before.
          if (selfClosing) {
            this.emit({ type: 'effects-update', dialog: this.inEffectsDialog, entries: this.effectsBuf })
            this.inEffectsDialog = null
            this.effectsBuf = []
          }
        }
        break

      case 'image':
        if (this.inInjuriesDialog) {
          this.injuryBuf.push({
            id:     attrs.id     ?? '',
            name:   attrs.name   ?? '',
            height: parseInt(attrs.height ?? '0', 10),
            width:  parseInt(attrs.width  ?? '0', 10),
          })
        }
        break

      case 'prompt': {
        // The prompt carries the SERVER's current time — anchor any pending
        // RT/CT to it: duration = end − serverNow, expressed as a LOCAL-clock
        // expiry (Date.now() + durationMs) so the renderer's countdown is
        // correct regardless of client clock skew. Clamp to [0, 300s] — no real
        // RT exceeds 5 min, and the clamp keeps a bad value from blowing up the
        // bar (Frostbite's `t_to > 300000 ? 300000` cap; Genie does end − gametime
        // too). Fall back to value*1000 only if no server time has ever been seen.
        const t = parseInt(attrs.time ?? '0', 10)
        if (t > 0) {
          this.lastPromptTime = t
          // Surface the server clock as an OFFSET so the renderer can compute
          // absolute moments (the Moons experience's lunar phase) against DR's
          // clock rather than the user's — same reason RT/CT anchor here (B192).
          // Emitted only on first sight and on real drift: a prompt arrives every
          // game turn, and this value is effectively constant for a session, so
          // per-prompt emission would be a per-turn event carrying no news.
          const offsetMs = t * 1000 - Date.now()
          if (this.lastClockOffsetMs === null || Math.abs(offsetMs - this.lastClockOffsetMs) > 2000) {
            this.lastClockOffsetMs = offsetMs
            this.emit({ type: 'server-clock', offsetMs })
          }
        }
        const anchor = t > 0 ? t : this.lastPromptTime
        const anchoredExpiry = (end: number) =>
          anchor > 0 ? Date.now() + Math.max(0, Math.min(300, end - anchor)) * 1000 : end * 1000
        if (this.pendingRtEnd !== null) {
          const expires = anchoredExpiry(this.pendingRtEnd)
          this.rtExpires = expires
          this.emit({ type: 'roundtime', expires })
          this.pendingRtEnd = null
        }
        if (this.pendingCtEnd !== null) {
          this.emit({ type: 'casttime', expires: anchoredExpiry(this.pendingCtEnd) })
          this.pendingCtEnd = null
        }
        if (this.pendingAimEnd !== null) {
          // value 0 = clear (emit expires 0); else anchor the END time to the
          // server clock just like RT/CT.
          const expires = this.pendingAimEnd === 0 ? 0 : anchoredExpiry(this.pendingAimEnd)
          this.emit({ type: 'aimtime', expires })
          this.pendingAimEnd = null
        }
        this.captureCtx = { tag: 'prompt' }
        this.captureBuf = ''
        this.captureSegments = []
        break
      }

      default:
        // Silently drop known protocol tags that carry no display content.
        // Also suppressed inside an effects dialog: real GS4 captures (the
        // Buffs fixture) carry a decorative <label id='lNNN' value='3:44 '.../>
        // sibling beside each <progressBar> — a redundant text rendering of
        // the same duration, safe to ignore rather than surface as noise.
        if (!this.captureCtx && !this.inEffectsDialog && !SILENT_TAGS.has(name)) {
          this.emit({ type: 'unknown', raw: `TAG:${name} ${JSON.stringify(attrs)}` })
        }
        break
    }
  }

  private tagEnd(name: string) {
    if (name === 'b') {
      if (this.boldDepth > 0) this.boldDepth--
      return
    }

    if (name === 'color') {
      this.colorStack.pop()
      return
    }

    if (name === 'a') {
      this.linkHref = undefined
      return
    }

    if (name === 'd') {
      this.linkCmd       = undefined
      this.linkCmdIsText = false
      return
    }

    if (name === 'dialogdata') {
      if (this.inInjuriesDialog && this.injuryBuf.length > 0) {
        this.emit({
          type: 'injury-update',
          parts: Object.fromEntries(this.injuryBuf.map(p => [p.id, p])),
        })
      }
      this.inInjuriesDialog = false
      this.injuryBuf = []
      if (this.inEffectsDialog) {
        // Unlike injuries, ALWAYS emit — an empty entries[] (the clear='t'
        // shape, or a dialog that genuinely has nothing active) is itself a
        // real state change a live effects panel needs to see, not a no-op.
        this.emit({ type: 'effects-update', dialog: this.inEffectsDialog, entries: this.effectsBuf })
        this.inEffectsDialog = null
        this.effectsBuf = []
      }
      return
    }

    if (name === 'compass') {
      // The compass is AUTHORITATIVE for the current room's directional exits.
      // A non-empty compass always emits. An EMPTY `<compass></compass>` emits
      // `exits: []` (clearing) — but ONLY on the real MAIN stream, not inside a
      // pushStream block. Binu (v0.14.1): a genuinely exitless room kept showing
      // the PREVIOUS room's exits because empty compasses were suppressed
      // wholesale; the transition clear-stream ('room-exits') only fires on a
      // room/nav change, so an exit change WITHOUT a transition (or a no-exit
      // room reached without re-firing the title gate) never cleared. The
      // original suppression existed to dodge spurious empty compasses from
      // "intermediate stream updates / Lich-injected refreshes" — those live
      // inside a pushStream, so the main-stream gate (same one the `Name:`
      // detection uses, line ~232) keeps them out while honouring the real
      // game compass. A genuine exitless room now clears immediately.
      if (this.compassDirs.length > 0) {
        this.emit({ type: 'exits', directions: this.compassDirs })
      } else if (this.activeStream === 'main' && this.streamStack.length === 0) {
        this.emit({ type: 'exits', directions: [] })
      }
      this.compassDirs = []
      return
    }

    if (name === 'style') {
      this.flushSegments()
      this.currentPreset = undefined
      return
    }

    if (!this.captureCtx) return

    // </preset> closing while inside a different capture context (e.g. <component>):
    // the component's captureCtx must stay intact, but we still need to clear the
    // currentPreset that was set when the nested <preset> opened — otherwise it
    // leaks into text rendered after the outer capture context closes.
    if (name === 'preset' && this.captureCtx.tag !== 'preset') {
      this.currentPreset = undefined
      return
    }

    if (name !== this.captureCtx.tag) return

    const ctx    = this.captureCtx
    const rawBuf = this.captureBuf
    const text   = rawBuf.trim()
    const capturedSegments = this.captureSegments
    this.captureCtx = null
    this.captureBuf = ''
    this.captureSegments = []

    switch (ctx.tag) {
      case 'preset': {
        // In mono mode preserve leading/trailing spaces — they carry column alignment.
        // Outside mono mode trim normally so stray whitespace doesn't pollute display.
        const content = this.monoMode ? rawBuf.replace(/[\r\n]/g, '') : text
        // Emit captured text with preset style into current stream
        if (content) {
          this.claimPending()
          const topColor = this.colorStack[this.colorStack.length - 1]
          this.pendingSegments.push({
            text: content,
            preset: this.currentPreset,
            ...(this.boldDepth > 0 ? { bold: true }     : {}),
            ...(topColor?.fg       ? { fg: topColor.fg } : {}),
            ...(topColor?.bg       ? { bg: topColor.bg } : {}),
          })
        }
        this.currentPreset = undefined
        break
      }

      case 'component':
      case 'compdef': {
        const id = ctx.id ?? ''
        if (id.startsWith('exp ')) {
          this.emit({ type: 'exp-component', skill: id.slice(4), text, ...(ctx.hasBold ? { rankUp: true } : {}) })
        } else if (id === 'room exits') {
          // Compass XML stays authoritative for the direction TOKENS (map
          // matching, which words are clickable). But the component carries
          // the GAME'S display sentence — "Obvious paths: north." /
          // "Obvious exits: none." / named exits like "out" — which the Room
          // panel shows verbatim (v0.14.7, F52 follow-up: Genie/Profanity
          // print exactly this line; composing from tokens mislabeled
          // paths-vs-exits and dropped the "none." case entirely). Emitted
          // even when empty so a stale sentence clears.
          this.emit({ type: 'room-exits-text', text })
        } else {
          const stream = COMPONENT_STREAM[id]
          if (stream) {
            this.emit({ type: 'clear-stream', stream })
            if (text) {
              // B117: prefer the per-segment view if anything was captured
              // (preserves <pushBold/> spans for monsterbold creatures in
              // the Room panel). Falls back to a single segment with the
              // trimmed text when no captureSegments accumulated.
              const segments = capturedSegments.length > 0 ? capturedSegments : [{ text }]
              this.emit({
                type: 'stream-text',
                stream,
                segments,
                timestamp: Date.now(),
              })
            }
          }
        }
        break
      }

      case 'spell':
        this.emit({ type: 'spell', name: text || 'None' })
        break

      case 'right':
        this.emit({ type: 'hand', hand: 'right', item: text || 'Empty' })
        break

      case 'left':
        this.emit({ type: 'hand', hand: 'left', item: text || 'Empty' })
        break

      case 'prompt': {
        // With statusprompt enabled DR sends the full state string in the tag text
        // (e.g. "H>", "HR>", "s>"). Fall back to ">" if the server sends nothing.
        const prompt = text || '>'
        // Prompts are frame boundaries — clear any lingering inline style state so it
        // doesn't bleed into the next server turn (e.g. crystal whisper bleeding
        // into subsequent movement messages, or orphaned <color> entries from a
        // Lich script that forgot to close its color tag).
        // boldDepth is also reset here because a Lich script outputting a literal '<'
        // (e.g. "health: 60 < 65") can cause <popBold/> to be swallowed by the
        // tokenizer, leaving boldDepth stuck for the rest of the session.
        this.boldDepth     = 0
        this.currentPreset = undefined
        this.colorStack    = []
        this.linkCmd       = undefined
        this.linkCmdIsText = false
        // UNCONSCIOUS comes from the prompt LETTERS, because DR sends no
        // indicator tag for it (see isUnconscious). Only `U` is decoded — the
        // one letter a tester has confirmed; the rest of the alphabet is
        // unverified and guessing it would invent state the game never stated.
        // With statusprompt OFF the text is a bare ">", which carries no
        // letters and therefore never sets this — and never wrongly clears it,
        // since it could not have been set in the first place.
        const gt = prompt.indexOf('>')
        const unconscious = gt > 0 && prompt.slice(0, gt).includes('U')
        // The flag the dedup below reads must be sampled BEFORE the emit:
        // an indicator derived from THIS prompt is not "something happened
        // since the last prompt", so it must not let a repeat `>` through.
        const wasPrompt = this.lastEmitWasPrompt
        if (unconscious !== this.isUnconscious) {
          this.isUnconscious = unconscious
          // Same shape as a real indicator, so it lands in the renderer's
          // indicator map and the `$unconscious` variable with no extra wiring.
          this.emit({ type: 'indicator', id: 'unconscious', visible: unconscious })
        }
        // Show this prompt UNLESS it's an exact repeat of the immediately
        // preceding prompt (i.e. the last emitted event was that same prompt and
        // nothing happened since). Any non-prompt event — main OR a sub-stream
        // (room title/exits/also-here on a move) — clears lastEmitWasPrompt via
        // emit(), so the post-activity `>` shows. A statusprompt state change
        // ("H>"→"R>") differs in text, so it's never an exact repeat and shows.
        if (!(wasPrompt && prompt === this.lastPromptText)) {
          this.lastPromptText = prompt
          this.emit({
            type: 'stream-text',
            stream: 'main',
            segments: [{ text: prompt }],
            timestamp: Date.now(),
            prompt: true,
          })
        }
        break
      }
    }
  }

  // Profanity-style fallback: derive hand state from glance text (see the
  // GLANCE_*_RE docs at the top of the file). Real <right>/<left> tags stay
  // authoritative — inference is skipped when this line already carried a hand
  // tag, and it never runs on stream-routed lines (a Lich script echoing
  // glance-shaped text into a panel must not touch the hand bars). If the
  // server sends both the tags and the text (the healthy case), the two agree
  // on content; only the name length can differ (tag short form vs glance
  // article form), which is cosmetic and corrected by the next tag update.
  private inferHandsFromGlance(rawLine: string) {
    // Cheap substring gate before any regex/strip work runs on the hot path.
    if (!rawLine.includes('You are holding ') && !rawLine.includes('You glance down at')) return
    if (this.activeStream !== 'main' || this.streamStack.length > 0) return
    if (/<(?:push|pop)stream/i.test(rawLine)) return
    if (this.events.some(e => e.type === 'hand')) return

    const text = decodeEntities(rawLine.replace(/<[^>]*>/g, '')).trim()

    if (GLANCE_EMPTY_RE.test(text)) {
      this.emit({ type: 'hand', hand: 'right', item: 'Empty' })
      this.emit({ type: 'hand', hand: 'left',  item: 'Empty' })
      return
    }
    let m = text.match(GLANCE_BOTH_RE)
    if (m) {
      this.emit({ type: 'hand', hand: 'right', item: stripArticle(m[1]) })
      this.emit({ type: 'hand', hand: 'left',  item: stripArticle(m[2]) })
      return
    }
    // The single-hand captures reject anything containing another " in your "
    // phrase: a sentence shape we don't model (e.g. a hypothetical left-first
    // ordering) would otherwise greedy-match its WHOLE tail into one hand and
    // mis-assign garbage. Rejecting turns "unknown shape" into a safe no-op.
    m = text.match(GLANCE_RIGHT_RE)
    if (m && !m[1].includes(' in your ')) {
      this.emit({ type: 'hand', hand: 'right', item: stripArticle(m[1]) })
      this.emit({ type: 'hand', hand: 'left',  item: 'Empty' })
      return
    }
    m = text.match(GLANCE_LEFT_RE)
    if (m && !m[1].includes(' in your ')) {
      this.emit({ type: 'hand', hand: 'left',  item: stripArticle(m[1]) })
      this.emit({ type: 'hand', hand: 'right', item: 'Empty' })
    }
  }

  private flushSegments() {
    if (this.pendingSegments.length === 0) return

    // Genie behaviour: if the line already emitted a typed event (indicator,
    // prompt, vital, etc.) and the only remaining text is whitespace, drop it.
    // This prevents the trailing \n after XML-only lines from becoming a blank line.
    const allWhitespace = this.pendingSegments.every(s => !s.text.trim())
    if (allWhitespace && this.events.length > 0) {
      this.pendingSegments = []
      return
    }

    // The pending buffer belongs to whichever stream was active when its first
    // segment landed — NOT necessarily the one active now, since push/pop no
    // longer flush. Emitting under `activeStream` here would misfile a line
    // whose stream changed after the text was written.
    const defaultPreset = STREAM_DEFAULT_PRESET[this.pendingStream]
    const segments = defaultPreset
      ? this.pendingSegments.map(s =>
          (!s.preset && !s.fg && !s.bg) ? { ...s, preset: defaultPreset } : s)
      : this.pendingSegments

    const evt: GameEvent = {
      type: 'stream-text',
      stream: this.pendingStream,
      segments,
      timestamp: Date.now(),
      ...(this.monoMode ? { mono: true } : {}),
    }
    this.emit(evt)
    this.pendingSegments = []
  }
}
