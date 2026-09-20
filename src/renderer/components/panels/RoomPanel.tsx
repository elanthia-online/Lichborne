// Room panel — the structured room view (v0.14.7 redesign, F52): title (+ a
// creature-count chip), description, then the game's own component sentences
// verbatim ("You also see …", "Also here: …") and a clickable "Obvious paths:"
// line LAST, in game order. Pure view over GameWindow's `RoomState`.
//
// The one thing that is uniquely ours is the PAINT: every prose line goes
// through `renderHighlightedLine` with the session's contacts, match-scope and
// line-scope highlights — the same entry point the main scroll uses, so the
// panel styles the same content the same way (pitfall #44; B111/B115/B117/
// B428). Line-scope rules are
// applied PER sentence and skipped on `desc`. Exit words the compass confirms
// are linkified and send the FULL direction word (`dn` is not a valid DR
// command); the exits sentence follows Genie's normalization (" none." /
// trailing period) with a compass-composed fallback mid-transition.
//
// `memo`'d (B172): it re-runs the rule passes over every section per render,
// so it must render only when the room (or, via context, rules/contacts)
// actually changes — both consumed context values are useMemo'd in GameWindow.
import { memo } from 'react'
import type { RoomState, TextSegment } from '../../../shared/types'
import { useContacts } from '../../ContactsContext'
import { useHighlights } from '../../HighlightsContext'
import { renderSegmentFull, renderHighlightedLine } from '../../utils/renderSegmentFull'

interface Props {
  room: RoomState
  onSendCommand: (cmd: string) => void
}

// Compass token → the full direction WORD. Doubles as the display text and the
// command sent on click (full words are always-valid DR commands — the raw
// compass token 'dn' is not).
const DIR_WORDS: Record<string, string> = {
  n:   'north',
  ne:  'northeast',
  e:   'east',
  se:  'southeast',
  s:   'south',
  sw:  'southwest',
  w:   'west',
  nw:  'northwest',
  up:  'up',
  dn:  'down',
  out: 'out',
}

// v0.14.7 (F52 follow-up, Sekmeht's Weaving Room screenshots): the exits line
// is the GAME'S OWN sentence from the room exits component — "Obvious paths:
// north." / "Obvious exits: none." — shown verbatim like Genie's room window
// (we previously composed it from compass tokens, which guessed paths-vs-exits
// wording and showed NOTHING for exitless rooms). Direction words the compass
// confirms are linkified (click walks, sending the full word); everything else
// — the lead-in, "none.", named exits — renders as plain text.
function renderExitsLine(room: RoomState, onSendCommand: (cmd: string) => void) {
  const words = room.exits.map(t => DIR_WORDS[t] ?? t)
  let sentence = room.exitsText?.trim() ?? ''
  // Genie's exact normalization (Game.cs UpdateRoom, lines 978-988): DR's
  // component can arrive as the BARE label ("Obvious exits:") for an exitless
  // room — Genie appends " none." itself, and a trailing period when missing.
  // Same code, made Lichborne-appropriate below (we additionally linkify).
  if (sentence.endsWith(':')) sentence += ' none.'
  else if (sentence && !sentence.endsWith('.')) sentence += '.'
  // Fallback when the component sentence hasn't arrived (e.g. mid-transition):
  // compose from the compass tokens, the pre-fix behavior.
  if (!sentence && words.length) sentence = `Obvious paths: ${words.join(', ')}.`
  if (!sentence) return null
  const linkable = new Set(words)
  // Split on word boundaries and linkify the compass-confirmed direction words.
  const parts = sentence.split(/\b/)
  return (
    <div className="room-panel-line room-exits-line">
      {parts.map((part, i) => linkable.has(part.toLowerCase())
        ? (
          <span
            key={i}
            className="room-exit-link"
            title={`Walk ${part.toLowerCase()}`}
            onClick={() => onSendCommand(part.toLowerCase())}
          >{part}</span>
        )
        : <span key={i}>{part}</span>)}
    </div>
  )
}

// v0.14.7 room redesign: the panel reads like the GAME writes it — title,
// description, then the component sentences verbatim ("You also see …",
// "Also here: …"), and a clickable "Obvious paths: north, east." line LAST
// (game order). This is the model all three sibling clients converge on
// (Genie/Frostbite print the component text verbatim; Profanity keeps the
// native exit links clickable) — the old labeled sections ("Objects" /
// "Creatures" / "Extra") + full-word exit BUTTONS read as an over-engineered
// form, per tester feedback. What stays uniquely ours is the PAINT: contact
// colors/click-for-card, user highlights/mutes, and monsterbold — applied to
// the prose exactly as in the main scroll (pitfall #44).
//
// B172: memoized — RoomPanel re-runs its highlight/contact passes over every
// section on each render, so it should render only when the room (or, via
// context, the rules/contacts) actually changes — not on every GameWindow
// render. Both consumed context values are useMemo'd in GameWindow.
export default memo(function RoomPanel({ room, onSendCommand }: Props) {
  const { contacts, templates, nameRegex, onContactClick } = useContacts()
  // v0.8.8 (Rakkor): include lineRules so user line-mode highlights paint
  // the prose lines the same way they paint the main scroll's "You also
  // see ..." / "Also here: ..." lines. Applied PER LINE (each component
  // sentence computes its own line style off its own joined text), so a
  // player-matching rule paints only the "Also here:" line. Skipped on
  // `desc` (multi-sentence prose; a single match would over-paint).
  const { matchRules, lineRules } = useHighlights()

  const hasContent = room.title || room.desc || room.exits.length > 0 || room.exitsText
    || room.objects.length > 0 || room.creatures.length > 0
    || room.players.length > 0 || room.extra.length > 0

  if (!hasContent) {
    return <div className="room-panel room-panel--empty">Waiting for room data…</div>
  }

  // B111 + B117: every prose line goes through the same `renderHighlightedLine`
  // the main scroll uses, so contact names, highlights (match AND line scope,
  // B428) and DR's <pushBold/> creature styling paint exactly like the
  // main-scroll copy. It joins the line and scans it once (B115, B172).
  function renderSegments(segments: TextSegment[], keyBase: number) {
    const { style, nodes } = renderHighlightedLine(segments, {
      matchRules, lineRules, contacts, templates, nameRegex,
      onContactClick, onSendCommand,
      autoLinkUrls: false, webLinkSafety: false,
      keyBase,
    })
    return { nodes, style: style ?? undefined }
  }

  // desc is still a string (kept so MapPanel's roomDesc string API stays
  // unchanged); wrap it as a single segment for the same renderSegmentFull
  // treatment as the prose lines.
  function renderString(text: string, key: number) {
    return renderSegmentFull(
      { text }, key,
      contacts, templates, nameRegex, matchRules,
      onContactClick, onSendCommand,
      false, false,
    )
  }

  // A prose line: the component sentence verbatim, painted. No labels — the
  // game's own lead-ins ("You also see", "Also here:") say what each line is.
  function proseLine(segments: TextSegment[], keyBase: number) {
    if (segments.length === 0) return null
    const r = renderSegments(segments, keyBase)
    return <div className="room-panel-line" style={r.style}>{r.nodes}</div>
  }

  // Creature count for the title chip — one per monsterbold span, the same
  // approximation Genie's $monstercount uses (counts <b> nodes; "two rats"
  // in one span counts once). Only shown when > 0 (quiet by default).
  const creatureCount = [...room.creatures, ...room.objects].filter(s => s.bold && s.text.trim()).length

  return (
    <div className="room-panel">
      {room.title && (
        <div className="room-panel-title">
          <span className="room-panel-title-text">[{room.title}]</span>
          {creatureCount > 0 && (
            <span className="room-creature-chip" title={`${creatureCount} creature${creatureCount === 1 ? '' : 's'} here (bold entries in the room)`}>
              ⚔ {creatureCount}
            </span>
          )}
        </div>
      )}
      {room.desc && (
        <div className="room-panel-desc">{renderString(room.desc, 1)}</div>
      )}
      {proseLine(room.objects, 2)}
      {proseLine(room.creatures, 3)}
      {proseLine(room.players, 4)}
      {proseLine(room.extra, 5)}
      {renderExitsLine(room, onSendCommand)}
    </div>
  )
})
