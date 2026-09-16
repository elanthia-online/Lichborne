// One character's Overview card (v0.19.0, DESIGN §47).
//
// Rendered BY its own GameWindow through a portal into OverviewShell's grid, so
// it escapes the `display:none` session shell (becoming visible) while KEEPING
// its React context — which is what gives it `vitals`, `roomState`, `lines` and
// the per-session Highlights/Contacts providers with no new plumbing at all
// (the pitfall #57 problem, solved by the tree/DOM split rather than worked
// around).
//
// Read-only by design: the card answers "does this character need me?". A click
// selects it (the input bar's target AND the active tab — one selection, B320),
// and a double-click lands you in its Session view. Quick Send already covers
// sending a command to another character.

import { memo, useMemo } from 'react'
import { useTimers } from '../../hooks/useTimers'
import type { TextLine, RoomState, InjuryState, TextSegment } from '../../../shared/types'
import type { CompiledRule } from '../../HighlightsContext'
import type { Contact, ContactTemplate } from '../../contacts'
import type { AppSettings } from '../../settings'
import type { OverviewOptions } from '../../overviewStore'
import type { SessionStats } from '../../hooks/useSessionStats'
import { ATTENTION_DEFS, attentionOrder, needsAttention, type AttentionThresholds } from '../../attention'
import { summarizeInjuries, WOUND_LABEL, type InjurySummary } from '../../injuryParse'
import { compactExpRows, type SortMode } from '../../expParse'
// From the STORE, not a context: this card is PORTALED, so its React context
// comes from its GameWindow — a provider on OverviewShell would never reach it.
import { useOverviewNow, useFeedCapacity } from '../../overviewStore'
import { TextLineRow } from '../TextLineRow'
import VitalsBar, { healthBand, type HealthBand } from '../VitalsBar'
import { formatUptime } from '../../utils/formatUptime'

/**
 * Highlight / contact rules, threaded down from GameWindow so a card renders text
 * EXACTLY as the game window does — the same rule the prompt lines answer to.
 *
 * An earlier version passed empty arrays deliberately, to hit `TextLineRow`'s
 * `hasExtras` short-circuit and skip the ruleset pass entirely. That was a real
 * saving and the wrong trade: a dashboard whose text is missing the colours you
 * built to make things jump out is a dashboard you cannot scan (Sekmeht).
 *
 * It stays affordable because `TextLineRow` is memoized and these props are
 * REFERENTIALLY STABLE — `matchRules`/`lineRules` come from `useCompiledHighlights`,
 * and `renderContacts` is the identity-stable array (pitfall #105: the volatile
 * one churns on every room change as presence tracking writes to it). So the
 * ruleset runs ONCE per new line per card, not per frame. Passing the volatile
 * contacts array here would silently turn that into a full re-highlight of every
 * visible line on every room change, for every character.
 */
export interface CardRules {
  matchRules: CompiledRule[]
  lineRules: CompiledRule[]
  contacts: Contact[]
  templates: ContactTemplate[]
  nameRegex: RegExp | null
}


interface Props {
  characterId: string
  character: string
  game: string
  useLich: boolean
  connected: boolean
  /** Tab position — breaks sort ties so equally-calm cards never reshuffle. */
  index: number
  settings: AppSettings
  options: OverviewOptions
  vitals: Record<string, { current: number; max: number }>
  vitalLabels: Record<string, string>
  indicators: Record<string, boolean>
  stance: string
  spell: string
  rightHand: string
  leftHand: string
  roomState: RoomState
  injuryState: InjuryState
  /** Absolute expiry stamps (0 = not running) for the RT / Cast / Aim strip. */
  rtExpires: number
  ctExpires: number
  aimExpires: number
  /** Raw skill map — rendered as the compact experience view when `exp` is the
   *  selected stream. Not a text stream, which is exactly why it needs this. */
  expSkills: Record<string, string>
  pinnedSkills: Set<string>
  rankUpSkills: Set<string>
  expSort: SortMode
  expSortDesc: boolean
  lines: TextLine[]
  /** The selected stream's OWN buffer (what its panel renders) — history included. */
  streamLines: TextLine[]
  /** Parallel capture, for a stream whose lines were redirected into main. */
  monitorLines: TextLine[]
  /** Highlight/contact rules — the SAME references the main window renders with. */
  rules: CardRules
  /** Whether the SELECTED stream has timestamps on, per that character's setting. */
  showTimestamp: boolean
  /** Which stream this card's feed is showing. `main` = the game window. */
  streamId: string
  /** Streams offered in the dropdown, in display order. */
  streamChoices: { id: string; label: string }[]
  onStreamChange: (id: string) => void
  stats: SessionStats
  /** Single click — SELECT this card as the input bar's target. */
  onSelect: () => void
  /** Double click — leave the Overview for this character's session. */
  onOpen: () => void
  /** True when this card is one of the input bar's targets: it alone, or —
   *  under All characters — every connected card. */
  selected: boolean
  /** Opens the per-character action menu at a point. Absent → no menu. */
  onMenu?: (x: number, y: number) => void
}

function OverviewCardImpl(p: Props) {
  const now = useOverviewNow()
  const { options: o, stats } = p

  const injuries = useMemo(() => summarizeInjuries(p.injuryState), [p.injuryState])
  // Prompt lines are KEPT. An earlier version filtered them as dead space, which
  // was defensible when the feed was six lines — but the feed now fills the tile,
  // and without the `>` the combat text runs together as a wall (Sekmeht's
  // side-by-side). Those prompts are the beat between rounds, and the parser has
  // already collapsed redundant consecutive ones (pitfall #88), so what reaches
  // `lines` is the right density already.
  //
  // The governing rule: the card should read like the game window. Any deviation
  // from how the main scroll renders the same text is a surprise, not a feature.
  //
  // Slice to what FITS, not to the user's setting. `feedLines` is a floor
  // ("guarantee me at least this many"), and now that the feed absorbs leftover
  // height, slicing to it left a full-screen tile showing six lines pinned to
  // the bottom of a very tall box with a void above them.
  const capacity = useFeedCapacity()
  // The feed shows whichever stream the card's dropdown selects.
  const feed = useMemo(() => {
    if (o.feedLines <= 0) return []
    // B291: the shell publishes the corrected capacity in an EFFECT, so when the
    // user flips the feed 0→N the options land on this render while the store
    // still holds 0 — and `slice(-0)` is `slice(0)`, the WHOLE scrollback (up to
    // 2400 TextLineRows × every open character) committed for one frame before
    // the real capacity arrives. One empty frame instead: the feed was off a
    // moment ago, so nobody can see it.
    if (capacity <= 0) return []
    if (p.streamId === 'main') return p.lines.slice(-capacity)
    // MERGE the stream's own buffer with the parallel capture, because neither
    // is sufficient alone:
    //   • `streamLines` holds everything that ROUTED to the stream — including
    //     history from before you picked it, which is what stops a card reading
    //     "Nothing on log yet" while that character's Log panel is full.
    //   • the capture holds lines that were redirected INTO main instead
    //     (an unwatched stream with a STREAM_FALLBACK entry never reaches
    //     `streamLines`).
    // Both push the SAME line object, so a line present in both dedupes by id,
    // and ids are monotonic — so sorting by id restores chronological order
    // across the two sources without comparing timestamps.
    if (p.monitorLines.length === 0) return p.streamLines.slice(-capacity)
    if (p.streamLines.length === 0) return p.monitorLines.slice(-capacity)
    // Slice BEFORE merging. Both sources are chronological, so the last N of the
    // merge can only come from the last N of each — and `streamLines` runs to
    // MAX_STREAM_LINES, so merging them whole would build and sort ~560 entries
    // to keep 60, on every batch that touches this stream.
    const byId = new Map<number, TextLine>()
    for (const l of p.streamLines.slice(-capacity)) byId.set(l.id, l)
    for (const l of p.monitorLines.slice(-capacity)) byId.set(l.id, l)
    return [...byId.values()].sort((a, b) => a.id - b.id).slice(-capacity)
  }, [p.streamId, p.lines, p.streamLines, p.monitorLines, o.feedLines, capacity])

  const health = p.vitals.health
  const healthPct = health && health.max > 0 ? Math.round((health.current / health.max) * 100) : null

  // `idle` is re-derived here off the shared 1 Hz clock rather than inside the
  // stats hook, so it advances without a game event having to arrive.
  const idleMs = stats.lastInboundAt > 0 ? now - stats.lastInboundAt : 0
  const idle = p.connected && idleMs > o.idleSeconds * 1000

  const order = o.sort === 'tab'
    ? p.index
    : attentionOrder(stats.score, p.index)

  // `needsAttention`, not `score > 0` — the same floor the badge and the summary
  // strip use. Without it a mind-locked character (score 20, the NORMAL state of
  // anything grinding a skill) wore a permanent amber border, which trains the
  // eye to stop reading borders at all.
  const tone = !p.connected ? 'offline'
    : stats.score >= 70 ? 'urgent'
    : needsAttention(stats.score) ? 'alert'
    : 'calm'

  // Binu: a card should announce itself when a character is genuinely in
  // trouble, rather than waiting to be looked at. Deliberately narrow — dead, or
  // health under the CRITICAL threshold (not the merely-hurt one). A pulse that
  // fires often is a pulse you stop seeing. Motion is dropped entirely under
  // epilepsy-safe / reduced-motion; the colour, which is the actual signal,
  // stays (polish standard #9b).
  const pulsing = p.connected && o.alertPulse
    && (!!p.indicators.dead || (healthPct !== null && healthPct < o.healthCritPct))

  // The selected stream's display name, from the same list the dropdown renders
  // (B385). Falls back to the id only for a stream the list doesn't carry.
  const streamLabel = p.streamChoices.find(c => c.id === p.streamId)?.label ?? p.streamId

  return (
    <div
      className={[
        'ov-card',
        `ov-card--${tone}`,
        pulsing ? 'ov-card--pulse' : '',
        p.selected ? 'ov-card--selected' : '',
        o.density === 'compact' ? 'ov-card--compact' : '',
      ].filter(Boolean).join(' ')}
      style={{
        order,
        // C1: `--game-font-size` is a DOCUMENT-ROOT var written only by the
        // ACTIVE character (applySettingsToDOM is gated on isActive), while the
        // font size is a PER-CHARACTER setting. Without this re-map every card
        // would render at the active character's size. Same mechanism PanelFrame
        // uses for its per-panel A−/A+ override.
        ['--game-font-size' as string]: `${p.settings.largePrint ? 18 : p.settings.fontSize}px`,
        // (B297: a `--ov-feed-lines` custom property used to be written here,
        // with a comment crediting it for preventing the grid "quiver". It had
        // ZERO consumers — the quiver is actually prevented by the grid row
        // floor + `.ov-card { overflow: hidden }` + the feed's flex/clip in
        // overview.css. Removed so nobody hunts a mechanism that doesn't exist.)
      } as React.CSSProperties}
      role="button"
      tabIndex={0}
      title={`Click to select ${p.character} · double-click to open in Session view`}
      // A single click SELECTS rather than navigates (Sekmeht): the Overview
      // should not bounce you into a session by accident. Double-click and the
      // card menu are the deliberate ways out. Selecting means the input bar's
      // target AND the active tab (B320) — one selection — without leaving the
      // view. The stray single click a double-click also fires is harmless: it
      // selects the character you are about to open anyway.
      onClick={p.onSelect}
      onDoubleClick={p.onOpen}
      onKeyDown={e => {
        // Space selects, Enter opens — the keyboard equivalents of the two
        // mouse gestures, so neither is reachable only by pointer.
        if (e.key === ' ') { e.preventDefault(); p.onSelect() }
        else if (e.key === 'Enter') { e.preventDefault(); p.onOpen() }
      }}
      /* Right-click anywhere on the card, exactly like the character tab. */
      onContextMenu={e => { if (p.onMenu) { e.preventDefault(); p.onMenu(e.clientX, e.clientY) } }}
    >
      <CardHead
        character={p.character} game={p.game} useLich={p.useLich}
        connected={p.connected} healthPct={healthPct}
        thresholds={o} onMenu={p.onMenu}
      />

      {/* The wound chip lives IN the flag row rather than owning a band of its
          own: it is an attention signal like the rest, it removes one of the
          card's eight stacked bands, and because this row is height-reserved a
          wound appearing no longer nudges everything below it. */}
      <FlagRow
        flags={stats.flags} idle={idle} connected={p.connected}
        wound={o.showInjuries && injuries.woundCount > 0 ? injuries : null}
      />

      {o.showTimers && (
        <CardTimers rtExpires={p.rtExpires} ctExpires={p.ctExpires} aimExpires={p.aimExpires}
                    timerStyle={p.settings.timerStyle} />
      )}

      {o.showVitals && (
        <div className="ov-card-vitals">
          {/* ALWAYS compact, regardless of the density option. Five full labels
              ("Concentration", a Barbarian's "Inner Fire") cannot fit across a
              ~300px card at any density — they overran their bars and collided
              with each other in Sekmeht's first screenshot. Density controls the
              CARD's spacing; it cannot argue with the width of the word.
              B382: `thresholds={o}` — the SAME boundaries the header percentage
              and the Critical/Hurt chips use, so the bar's colour agrees with
              them instead of running its own hardcoded 30/50/80. */}
          <VitalsBar vitals={p.vitals} labels={p.vitalLabels} compact thresholds={o} />
        </div>
      )}

      {o.showConditions && (
        <ConditionLine
          stance={p.stance} indicators={p.indicators}
          rightHand={p.rightHand} leftHand={p.leftHand} spell={p.spell}
        />
      )}

      {o.showRoom && <RoomLine roomState={p.roomState} />}

      {o.showExp && <StatRow stats={stats} now={now} idleMs={idleMs} connected={p.connected} />}

      {/* Stream selector — labels the feed AND changes it. Every interactive
          control inside the card must stop propagation, or using it also fires
          the card's click-to-open and drops you into Session view (the card
          root is a button). `onClick` alone is not enough: a native select
          also emits mousedown/keydown that would bubble the same way. */}
      {o.feedLines > 0 && p.streamChoices.length > 1 && (
        <div
          className="ov-card-streampick"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <select
            className="ov-card-streamsel"
            /* Drives the "not on the game window" styling — a non-default
               selection stays legible without hover, so you can tell at a glance
               which cards are showing something other than the game window. */
            data-main={p.streamId === 'main' ? 'true' : 'false'}
            value={p.streamId}
            onChange={e => p.onStreamChange(e.target.value)}
            title="Which stream this card shows"
            aria-label={`Stream shown for ${p.character}`}
          >
            {p.streamChoices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}

      {o.feedLines > 0 && p.streamId === 'exp' && (
        <CardExp skills={p.expSkills} pinned={p.pinnedSkills} rankUp={p.rankUpSkills}
                 mode={p.expSort} desc={p.expSortDesc} />
      )}

      {o.feedLines > 0 && p.streamId !== 'exp' && (
        <div className="ov-card-feed" aria-label={`${streamLabel} for ${p.character}`}>
          {feed.length === 0
            /* Names the stream: on a non-main selection "No text yet" alone
               reads like something is broken, when it usually means nobody has
               said anything (UX standard #8b — explain the empty state).
               B385: by its DISPLAY label (the one the dropdown shows), never
               the raw stream id — "Nothing on logons yet" named an internal. */
            ? <div className="ov-card-dim ov-card-feed-empty">
                {p.streamId === 'main' ? 'No text yet.' : `Nothing on ${streamLabel} yet.`}
              </div>
            : feed.map(line => (
              <TextLineRow
                key={line.id}
                line={line}
                // No highlight/contact pass: TextLineRow short-circuits when
                // nameRegex is null and matchRules is empty, so a card costs a
                // plain render rather than a second run of the whole ruleset.
                // The game's own colours (presets, monsterbold) still show.
                matchRules={p.rules.matchRules}
                lineRules={p.rules.lineRules}
                contacts={p.rules.contacts}
                templates={p.rules.templates}
                nameRegex={p.rules.nameRegex}
                autoLinkUrls={false}
                showTimestamp={p.showTimestamp}
              />
            ))}
        </div>
      )}

    </div>
  )
}

// ── Sub-components, ALL at module scope ──────────────────────────────────────
// UX polish standard #4: a component declared inside a render is a brand-new
// type every render, so React remounts it and any state it owns is lost. This
// card re-renders on every game line, which is exactly the condition that turns
// that mistake into a visible bug.

/**
 * RT / Cast / Aim, as three thin lanes (Binu: "a little RT/Cast/Aim time bar
 * somewhere on each pane"). On a dashboard the question this answers is "who can
 * act right now", which is exactly what you cannot get by tabbing around.
 *
 * MEMO'd, and that is the whole design. `useTimers` runs a 100ms interval while
 * anything is counting, and the card around it is deliberately NOT memo'd (see
 * the note on the default export) — so calling `useTimers` at card level would
 * re-render the entire card, feed included, ten times a second per character in
 * combat. Confined to this leaf, the tick repaints three divs. Its props are
 * three primitives, so a card re-render caused by anything else does not reach
 * it either.
 *
 * The interval only exists while a timer is live: `useTimers` returns early at
 * all-zero AND self-clears once every stamp is in the past (B292 — the stamps
 * are set by events and never zeroed, so before the self-clear one roundtime
 * armed a permanent 10 Hz tick per card). A calm dashboard pays nothing — the
 * §35.6 "free until used" rule the rest of the view follows.
 *
 * The strip's HEIGHT is always reserved, even with nothing running: cards must
 * not resize when a roundtime starts, which is the quiver this view has already
 * been bitten by once.
 *
 * Same colour vars as the game command bar (`--rt-end` / `--ct-end` /
 * `--aim-end`), so a lane means the same thing in both places, and the same
 * precedence — aim renders BEHIND cast, because cast is the PvP-critical one.
 *
 * B393: it also honours Settings → Timer Style the way the command bar's
 * TimerDisplay does — one chip per remaining second in `chips`, a draining bar
 * in `bar` — so a player who reads roundtime as chips reads it the same way on
 * every card. `timerStyle` is a string primitive, so the memo still holds.
 *
 * B393: the bar drains by `transform: scaleX()`, NEVER `width`. It is in a
 * continuous transition for the whole of every roundtime, and a `width`
 * transition invalidates layout every animation frame — per lane, per card, per
 * character in combat. scaleX is compositor-only (the Spell Monitor bar's lesson;
 * same family as pitfall #126).
 */
const CardTimers = memo(function CardTimers({ rtExpires, ctExpires, aimExpires, timerStyle }: {
  rtExpires: number; ctExpires: number; aimExpires: number; timerStyle: string
}) {
  const { rt, ct, aim, rtMax, rtPct, ctPct, ctMax, aimMax } = useTimers(rtExpires, ctExpires, aimExpires)

  if (timerStyle === 'chips') {
    // One chip per remaining second, capped at the timer's starting length —
    // the command bar's exact count. Aim and cast share the lower lane as two
    // stacked rows (aim first, so cast paints over it); chips are fixed-width,
    // so the n-th second of each row lands at the same x and a longer aim shows
    // as green sticking out past cast, just as it does in the command bar.
    const chips = (secs: number, max: number, kind: 'rt' | 'ct' | 'aim') =>
      Array.from({ length: Math.min(Math.ceil(secs), Math.round(max)) },
        (_, i) => <div key={i} className={`ov-timer-chip ov-timer-chip--${kind}`} />)
    return (
      <div className="ov-card-timers" aria-hidden>
        <div className="ov-timer-lane">
          {rt > 0 && <div className="ov-timer-chips">{chips(rt, rtMax, 'rt')}</div>}
        </div>
        <div className="ov-timer-lane">
          {aim > 0 && <div className="ov-timer-chips">{chips(aim, aimMax, 'aim')}</div>}
          {ct  > 0 && <div className="ov-timer-chips">{chips(ct, ctMax, 'ct')}</div>}
        </div>
      </div>
    )
  }

  // Aim is scaled against CAST's max when cast is running, so the two widths are
  // comparable in absolute seconds rather than each as a share of its own max —
  // the same reasoning as the command bar's TimerDisplay.
  const aimScaleMax = ctMax > 0 ? ctMax : aimMax
  const aimPct = aimScaleMax > 0 ? Math.min(100, (aim / aimScaleMax) * 100) : 0
  const scale = (pct: number) => ({ transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})` })
  return (
    <div className="ov-card-timers" aria-hidden>
      <div className="ov-timer-lane">
        {rt > 0 && <div className="ov-timer-fill ov-timer-fill--rt" style={scale(rtPct)} />}
      </div>
      <div className="ov-timer-lane">
        {aim > 0 && <div className="ov-timer-fill ov-timer-fill--aim" style={scale(aimPct)} />}
        {ct  > 0 && <div className="ov-timer-fill ov-timer-fill--ct"  style={scale(ctPct)} />}
      </div>
    </div>
  )
})

/**
 * The compact experience view, on a card (Sekmeht, v0.19.1).
 *
 * Experience is NOT a text stream — it is a state map rebuilt from
 * `exp-component` events — which is why picking it in the card's stream dropdown
 * renders THIS instead of a feed. It was previously excluded from that dropdown
 * for the correct reason that a feed of it could only ever say "nothing yet";
 * that stopped being true the moment the card could render the state.
 *
 * The FILTER and the ORDER come from `expParse` (`compactExpRows`), shared with
 * ExpPanel so the two surfaces can never disagree about which skills are
 * training or how they sort. The MARKUP is deliberately not shared: the panel's
 * rows carry pin buttons and an RXP footer, and a card is a read-only glance.
 * Pins are still honoured for ORDERING — the skills you pinned are the ones you
 * want at the top of a small tile — there is simply no button to toggle them.
 *
 * MEMO'd on the skills map: `compactExpRows` parses every entry (and the sort
 * comparator parses again), while a card re-renders on every game line. That
 * memo is the difference between free and forty regexes per line per character.
 *
 * Top-anchored, unlike the text feed. A feed clips its OLDEST line off the top
 * because the newest matters most; a table's first row is its most important, so
 * this one clips the tail and says how many it dropped rather than pretending
 * the list is complete.
 */
const CardExp = memo(function CardExp({ skills, pinned, rankUp, mode, desc }: {
  skills: Record<string, string>; pinned: Set<string>; rankUp: Set<string>
  mode: SortMode; desc: boolean
}) {
  const rows = useMemo(() => compactExpRows(skills, pinned, mode, desc), [skills, pinned, mode, desc])
  const tdp = (skills['tdp'] ?? '').match(/(\d+)/)?.[1]

  return (
    <div className="ov-card-exp">
      <div className="ov-exp-top">
        <span className="ov-exp-title">EXP</span>
        <span className="ov-exp-stat"><span className="ov-exp-lbl">Learning</span>{rows.length}</span>
        {tdp && <span className="ov-exp-stat"><span className="ov-exp-lbl">TDP</span>{tdp}</span>}
      </div>
      {rows.length === 0
        // B385: an EMPTY map means no experience data has arrived yet (the map
        // keeps a key for every component once the game has sent one), so it
        // must not claim "nothing training" before it could possibly know.
        ? <div className="ov-card-dim">
            {Object.keys(skills).length === 0 ? 'Waiting for experience data.' : 'No skills actively training.'}
          </div>
        : (
          <div className="ov-exp-rows">
            {rows.map(r => (
              <div key={r.skill}
                   className={`ov-exp-row ov-exp-row--${r.bucket}${rankUp.has(r.skill) ? ' ov-exp-row--rankup' : ''}${pinned.has(r.skill) ? ' ov-exp-row--pinned' : ''}`}
                   title={`${r.skill} — rank ${r.rank}, ${r.pctStr}, mindstate ${r.mindstateIdx}/34`}>
                <span className="ov-exp-name">{r.skill}</span>
                <span className="ov-exp-rank">{r.rank}</span>
                <span className="ov-exp-pct">{r.pctStr}</span>
                <span className="ov-exp-rate">{r.mindstateIdx}/34</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
})

function CardHead({ character, game, useLich, connected, healthPct, thresholds, onMenu }: {
  character: string; game: string; useLich: boolean
  connected: boolean; healthPct: number | null
  thresholds: AttentionThresholds
  onMenu?: (x: number, y: number) => void
}) {
  return (
    <div className="ov-card-head">
      <span className="ov-card-name">{character}</span>
      <span className={`ov-card-mode ov-card-mode--${useLich ? 'lich' : 'direct'}`}
            title={useLich ? 'Connected through Lich' : 'Connected directly to the game'}>
        {useLich ? 'L' : 'D'}
      </span>
      <span className="ov-card-game" title="Game shard">{game}</span>
      <span className="ov-card-head-spacer" />
      {/* No "current" chip (B320): which tab is active is the tab strip's job,
          and on a card it read as "selected" beside the input bar's target. */}
      {connected && healthPct !== null && (
        <span className={`ov-card-hp ${healthClass(healthPct, thresholds)}`} title="Health">{healthPct}%</span>
      )}
      <span className={`ov-card-dot${connected ? '' : ' ov-card-dot--off'}`}
            title={connected ? 'Connected' : 'Disconnected'} />
      {/* Right-click on the card does the same thing, matching the tab — but a
          right-click-only action is one most people never find (the same lesson
          the stream selector taught). The button makes it discoverable; both
          open the identical menu. */}
      {onMenu && (
        <button
          className="ov-card-menu"
          title={`Actions for ${character}`}
          aria-label={`Actions for ${character}`}
          onClick={e => { e.stopPropagation(); onMenu(e.clientX, e.clientY) }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >⋯</button>
      )}
    </div>
  )
}

/**
 * The header percentage and the Critical/Hurt CHIPS must agree — they are the
 * same fact stated twice, and they were computed two different ways.
 *
 * These buckets were hardcoded 80/50/30 while the flags use the CONFIGURABLE
 * `healthCritPct` (25) / `healthLowPct` (50), so even at defaults a character at
 * 27% showed a red number beside a chip that only said "Hurt" — the number
 * screaming while the chip shrugged — and raising `healthCritPct` diverged them
 * further. Driving both from the same thresholds makes red mean exactly
 * "Critical" and orange exactly "Hurt", whatever the user has configured.
 *
 * `warn` keeps a soft band above the low threshold with no flag behind it: a
 * gradient toward trouble, deliberately quieter than anything that chips.
 *
 * B382: the banding itself is VitalsBar's `healthBand`, the same function the
 * card's vitals bar colours its fill with — so the percentage and the bar
 * beneath it can no longer disagree either. Only the class names differ.
 */
const HP_CLASS: Record<HealthBand, string> = {
  crit: 'ov-hp--crit', low: 'ov-hp--bad', mid: 'ov-hp--warn', ok: 'ov-hp--ok',
}
function healthClass(pct: number, t: AttentionThresholds): string {
  return HP_CLASS[healthBand(pct, t)]
}

function FlagRow({ flags, idle, connected, wound }: {
  flags: readonly string[]; idle: boolean; connected: boolean
  wound: InjurySummary | null
}) {
  // `idle` is clock-derived, so it is merged in here rather than coming from the
  // stats hook's snapshot (which only re-runs on a game event).
  const all = idle && connected && !flags.includes('idle') ? [...flags, 'idle'] : [...flags]
  const woundChip = wound && (
    <span
      key="wound"
      className={`ov-flag ov-flag--wound-${wound.worstWound}`}
      title={
        `${WOUND_LABEL[wound.worstWound] ?? 'Wounded'}${wound.worstParts.length ? ` — ${wound.worstParts.join(', ')}` : ''}`
        + (wound.scarCount > 0 ? ` · ${wound.scarCount} scar${wound.scarCount === 1 ? '' : 's'} (healed, not counted)` : '')
      }
    >
      {WOUND_LABEL[wound.worstWound] ?? 'Wounded'} ×{wound.woundCount}
    </span>
  )

  // A clean card must read clean AT A GLANCE (UX #1) — one affirmative marker,
  // never a row of zeroes.
  if (all.length === 0 && !woundChip) {
    return <div className="ov-card-flags"><span className="ov-flag ov-flag--calm" title="Nothing needs your attention">✓ calm</span></div>
  }
  return (
    <div className="ov-card-flags">
      {all.map(f => {
        const def = ATTENTION_DEFS[f as keyof typeof ATTENTION_DEFS]
        if (!def) return null
        return <span key={f} className={`ov-flag ov-flag--${def.cls}`} title={def.desc}>{def.label}</span>
      })}
      {woundChip}
    </div>
  )
}

/**
 * Only what is NOT normal (Binu). `IconBar` renders every slot unconditionally —
 * hands read "Empty", spell reads "None", stance always shows "Standing" — which
 * is exactly right for a game-area strip, where a fixed position you can glance
 * at without reading is the whole point. In a tile it spends a full band saying
 * nothing happened (UX polish standard #1).
 *
 * It also DUPLICATED the flag row: bleeding / stunned / dead / poisoned /
 * diseased / webbed are attention flags already, so they are deliberately absent
 * here. What's left is the quiet context the flags don't carry — a posture that
 * isn't upright, a state you chose (hidden, invisible, joined), what you're
 * holding, and what you have prepared.
 *
 * Height-reserved, so a card doesn't resize the moment you draw a weapon.
 */
function ConditionLine({ stance, indicators, rightHand, leftHand, spell }: {
  stance: string; indicators: Record<string, boolean>
  rightHand: string; leftHand: string; spell: string
}) {
  const bits: React.ReactNode[] = []

  // Standing is the default posture and says nothing; anything else is a
  // liability worth seeing (Binu listed kneeling and prone by name).
  const st = (stance || '').trim()
  if (st && st.toLowerCase() !== 'standing') {
    bits.push(<span key="stance" className="ov-cond ov-cond--warn" title="Posture">{st}</span>)
  }
  // Only the indicators that are NOT already attention chips.
  //
  // The tooltip has to SAY something the chip does not (UX standard #8): these
  // used to pass `title={label}`, so hovering "Joined" explained "Joined". The
  // Joined wording is the one that carries real information, and it is taken
  // from IconBar's tester-corrected note (Cherisse/Agan): DR's IconJOINED marks
  // the FOLLOWER, so a group LEADER correctly shows nothing.
  const INDICATORS = [
    ['hidden',    'Hidden',    'Hiding — not visible to others in the room'],
    ['invisible', 'Invisible', 'Invisible to others in the room'],
    ['joined',    'Joined',    'Joined to another character and following them. A group LEADER does not show this.'],
  ] as const
  for (const [key, label, desc] of INDICATORS) {
    if (indicators[key]) bits.push(<span key={key} className="ov-cond" title={desc}>{label}</span>)
  }

  const held = [leftHand, rightHand].filter(h => h && h !== 'Empty')
  if (held.length > 0) {
    bits.push(<span key="hands" className="ov-cond ov-cond--held" title={`Holding: ${held.join(' · ')}`}>{held.join(' · ')}</span>)
  }
  if (spell && spell !== 'None') {
    bits.push(<span key="spell" className="ov-cond ov-cond--spell" title="Prepared spell">{spell}</span>)
  }

  return <div className="ov-card-cond">{bits}</div>
}

function segText(segs: TextSegment[] | undefined): string {
  return (segs ?? []).map(s => s.text).join('').trim()
}

function RoomLine({ roomState }: { roomState: RoomState }) {
  // Occupancy comes from `roomState`, NOT `sceneCast`: the scene capturers are
  // gated off unless an Experience is open (§35.6), so sceneCast is empty for
  // most users, whereas the `<component id='room players'>` path is ungated.
  const players = segText(roomState.players)
  const creatures = segText(roomState.creatures)
  const title = roomState.title || '—'
  // ONE occupancy line, always rendered and height-reserved: creatures and
  // players each came with their own conditional row before, so the card
  // resized whenever something walked in or out. Creatures lead because they
  // are the half you need to notice.
  return (
    <div className="ov-card-room">
      <div className="ov-card-roomname" title={title}>{title}</div>
      <div className="ov-card-here" title={[creatures, players].filter(Boolean).join(' ')}>
        {creatures && <span className="ov-card-here--hostile">{creatures}</span>}
        {creatures && players ? ' ' : null}
        {players && <span>{players}</span>}
      </div>
    </div>
  )
}

function StatRow({ stats, now, idleMs, connected }: {
  stats: SessionStats; now: number; idleMs: number; connected: boolean
}) {
  // B287: the clock STOPS at the drop — a disconnected card answers "how long
  // did the session run", never "up 0s" (the old hard reset) and never a figure
  // that keeps growing after the socket died.
  const uptime = stats.startedAt > 0 ? (stats.stoppedAt > 0 ? stats.stoppedAt : now) - stats.startedAt : 0
  return (
    <div className="ov-card-stats">
      <Stat label="up" value={formatUptime(uptime)}
        title={connected ? 'How long this connection has been up' : 'How long the session ran before it dropped'} />
      <Stat label="idle" value={connected ? formatUptime(idleMs) : '—'} title="Time since the last game text arrived" />
      {/* Evaluated NOW, not read off the render-time value: a quiet character
          stops re-rendering its GameWindow, so the stored rate would freeze
          instead of decaying. This card re-renders every second. */}
      {/* "lines", not "lpm" — every other label here is a word, and an
          initialism nobody can expand is not a glance-readable label (UX #8). */}
      <Stat label="lines" value={String(stats.linesPerMinNow())} title="Lines of game text in the last minute" />
      {/* Quiet by default (UX #1): a counter at zero says nothing, so it is not
          rendered at all. The chips that ARE here all mean something. */}
      {stats.ranks > 0 && <Stat label="ranks" value={String(stats.ranks)} title="Ranks gained this session" />}
      {stats.roomsVisited > 1 && <Stat label="rooms" value={String(stats.roomsVisited)} title="Distinct rooms visited this session" />}
      {stats.deaths > 0 && <Stat label="deaths" value={String(stats.deaths)} title="Deaths this session" />}
      {stats.lockedSkills > 0 && (
        <Stat label="locked" value={String(stats.lockedSkills)}
              title="Skills at mind lock — they can absorb no more field experience" />
      )}
    </div>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title: string }) {
  return (
    <span className="ov-stat" title={title}>
      <span className="ov-stat-label">{label}</span>
      <span className="ov-stat-value">{value}</span>
    </span>
  )
}

// Deliberately NOT memo'd. `stats` comes back as a fresh object from
// `useSessionStats` on every GameWindow render, so a shallow compare could never
// bail — the wrapper would be a props comparison that always fails, dressed up
// as protection. Memoizing `stats` is not the answer either: its fields
// (linesPerMin, lastInboundAt, flags) genuinely change during play, so a stable
// identity would mean a card rendering stale numbers.
//
// This is fine because the card is rendered from inside GameWindow's own render
// pass: it re-renders exactly when that character re-renders, never on another
// character's traffic. The expensive work is memoized where it actually is
// expensive — `summarizeExp`, `summarizeInjuries` and the feed slice.
export default OverviewCardImpl
