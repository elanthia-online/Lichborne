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
import { memo, useContext, useMemo, useState } from 'react'
import type { CreatureStatus, RoomState, TextSegment } from '../../../shared/types'
import { useContacts } from '../../ContactsContext'
import { useHighlights } from '../../HighlightsContext'
import { renderSegmentFull, renderHighlightedLine } from '../../utils/renderSegmentFull'
import { DIR_WORDS } from '../../exitWords'
import { presetEffectContent } from '../../utils/renderSegment'
import { useTextStylesVersion } from '../../textStyles'
import { boldRuns } from '../../../shared/sceneExtract'
import { GameLinkContext, hasOwnClick } from '../../gameLinks'
import ContextMenu, { type CtxItem } from '../ContextMenu'

interface Props {
  room: RoomState
  // The creatures' states from <crtrStatus> (see markCreatureStates).
  roster?: CreatureStatus[] | null
  onSendCommand: (cmd: string) => void
}

// A creature's state in the room's objects line (v0.21.0, after ProfanityFE
// #265). The game reports each creature's whole state in a <crtrStatus> tag;
// the parser pairs those with the line's bold names into the roster. The first
// of these flags that is set is the one shown: a dead creature is often also
// sleeping and prone, and dead must win.
const CREATURE_STATES = ['dead', 'sleeping', 'prone'] as const
type CreatureState = typeof CREATURE_STATES[number]
const STATE_WORD: Record<CreatureState, string> = { dead: 'dead', sleeping: 'asleep', prone: 'prone' }

function creatureState(flags: string[]): CreatureState | null {
  for (const s of CREATURE_STATES) if (flags.includes(s)) return s
  return null
}

// Give each marked creature's bold segments a `creature-<state>` preset, which
// panels.css colours. Pairing is the parser's own (flushRoster): by the game's
// id when the names are links (rich stream), otherwise by position and only
// when the counts match, so a list and roster that disagree mark nothing.
// Returns the same array when nothing changes, so the memo above holds.
export function markCreatureStates(segs: TextSegment[], roster: CreatureStatus[] | null | undefined): { segs: TextSegment[]; states: CreatureState[] } {
  if (!roster || roster.length === 0) return { segs, states: [] }
  const runs: { from: number; to: number; exist?: string }[] = []
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i].bold) continue
    const last = runs[runs.length - 1]
    if (last && last.to === i - 1) { last.to = i; last.exist ??= segs[i].exist }
    else runs.push({ from: i, to: i, exist: segs[i].exist })
  }
  // A run of only whitespace is not a name (boldRuns skips them too).
  const named = runs.filter(r => segs.slice(r.from, r.to + 1).some(s => s.text.trim()))
  const byId = named.some(r => r.exist)
  if (!byId && named.length !== roster.length) return { segs, states: [] }
  let out: TextSegment[] | null = null
  const states: CreatureState[] = []
  named.forEach((r, i) => {
    const status = byId ? roster.find(c => c.id === r.exist) : roster[i]
    const state = status ? creatureState(status.flags) : null
    if (!state) return
    states.push(state)
    out ??= segs.slice()
    for (let j = r.from; j <= r.to; j++) {
      // Leave a segment the game styled itself; only plain monsterbold changes.
      if (out[j].preset && out[j].preset !== 'bold') continue
      out[j] = { ...out[j], preset: `creature-${state}` }
    }
  })
  return { segs: out ?? segs, states }
}

// Compass token → full direction word (display text AND the command a click
// sends) lives in exitWords.ts, shared with the floating compass.

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
export default memo(function RoomPanel({ room, roster, onSendCommand }: Props) {
  const { contacts, templates, nameRegex, onContactClick } = useContacts()
  // v0.8.8 (Rakkor): include lineRules so user line-mode highlights paint
  // the prose lines the same way they paint the main scroll's "You also
  // see ..." / "Also here: ..." lines. Applied PER LINE (each component
  // sentence computes its own line style off its own joined text), so a
  // player-matching rule paints only the "Also here:" line. Skipped on
  // `desc` (multi-sentence prose; a single match would over-paint).
  const { matchRules, lineRules } = useHighlights()
  // v0.20.1: repaint the title when the room-name text style changes.
  useTextStylesVersion()
  // Game links (rich stream, v0.21.0): a click or right-click on a linked
  // player, creature or object opens its menu, as in the main window.
  const linkMenu = useContext(GameLinkContext)
  const [linkMenuAt, setLinkMenuAt] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null)
  const openLinkMenu = (e: React.MouseEvent, contextMenu: boolean) => {
    const t = e.target as Element
    // A right-click inside the (portaled) menu bubbles here through React and
    // was already claimed by it (pitfall #164).
    if (e.defaultPrevented) return
    if (!linkMenu || (!contextMenu && (hasOwnClick(t) || window.getSelection()?.toString()))) return
    const items = linkMenu(t, e.clientX, e.clientY)
    if (!items.length) return
    if (contextMenu) e.preventDefault()
    setLinkMenuAt({ x: e.clientX, y: e.clientY, items })
  }

  // Dead, sleeping and prone creatures in the objects line (markCreatureStates).
  const marked = useMemo(() => markCreatureStates(room.objects, roster), [room.objects, roster])

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
  // One creature per RUN of bold segments: the rich stream bolds an article and
  // a link as two segments ("a ", "jeol moradu"), which counted twice.
  const creatureCount = boldRuns(room.creatures).length + boldRuns(room.objects).length
  // The chip's tooltip says what the grey and italic names mean (UX #8).
  const stateNote = CREATURE_STATES
    .map(s => [s, marked.states.filter(x => x === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${STATE_WORD[s]}`)
    .join(', ')
  const chipTitle = `${creatureCount} creature${creatureCount === 1 ? '' : 's'} here (bold entries in the room)`
    + (stateNote ? `: ${stateNote}. Dead creatures are greyed, sleeping ones in italics, prone ones underlined.` : '')

  return (
    <div className="room-panel" onClick={e => openLinkMenu(e, false)} onContextMenu={e => openLinkMenu(e, true)}>
      {room.title && (
        <div className="room-panel-title">
          <span className="room-panel-title-text">{presetEffectContent(`[${room.title}]`, 'roomname', 'var(--room-title-color)') ?? `[${room.title}]`}</span>
          {creatureCount > 0 && (
            <span className="room-creature-chip" title={chipTitle}>
              ⚔ {creatureCount}
            </span>
          )}
        </div>
      )}
      {room.desc && (
        <div className="room-panel-desc">{renderString(room.desc, 1)}</div>
      )}
      {proseLine(marked.segs, 2)}
      {proseLine(room.creatures, 3)}
      {proseLine(room.players, 4)}
      {proseLine(room.extra, 5)}
      {renderExitsLine(room, onSendCommand)}
      {linkMenuAt && (
        <ContextMenu x={linkMenuAt.x} y={linkMenuAt.y} onClose={() => setLinkMenuAt(null)} items={linkMenuAt.items} />
      )}
    </div>
  )
})
