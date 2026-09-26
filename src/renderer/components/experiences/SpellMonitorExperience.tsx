// Spell Monitor (Experience #3, DESIGN §34.9) — everything currently on you as
// a grid of live countdowns. `memo`'d (pitfall #82c) so it renders on ITS
// inputs, not every game batch.
//
// A PURE VIEW over typed state. The parsing lives in experiences.ts
// (`parseSpellLine` / `deriveSpellState`) and runs in GameWindow, which owns
// the per-effect max ceiling; nothing here touches game text. The ⚙ content
// layers are gated at the top (`optionShown`), one option per visual layer.
//
// What the body does, in order:
//   • the CLOCK: a self-retiring 1s tick that exists only while a timed effect
//     is still counting down (B292 — an interval that never clears is a
//     session-long cost). It retires once the last one reaches zero, because
//     nothing further changes until the game repaints;
//   • ORDERING by `spellSortRank`: lapsing → counting down → no countdown →
//     permanent (UX #3 — the thing about to drop is the thing you act on);
//   • each CELL: an optional skill badge, the name (or its abbreviation), what
//     remains, and a bar whose denominator is a STATED percentage when the game
//     gave one, else the highest roisaen seen this session (DR never states a
//     full duration, so that ceiling has to be learned).
//
// HONESTY RULES, all deliberate:
//   • DR reports WHOLE roisaen, so we display whole minutes and never a
//     seconds countdown — `29:00` would claim a precision the game never gave
//     us. The final minute reads "<1m"; the BAR may move smoothly, because a
//     proportion is not a claim about precision.
//   • An effect we could not parse is still SHOWN, carrying whatever the game
//     put in its parentheses. Never hide something the game says is on you.
//   • ENDING IS TWO STAGES, and both are visible, because they are two
//     different facts. When our countdown reaches zero the cell says "expired"
//     — the time we were given has elapsed, which is the moment you act. Only
//     when the game STOPS LISTING the effect does it become `kind: 'ended'`,
//     grey and spent. The second is the authoritative one: DR floors its
//     roisaen, so our clock can reach zero with up to 59 seconds still to run,
//     and a repaint may hand an "expired" cell more time and send it back to
//     counting down. Never collapse the two into one signal.
//   • The five `SpellKind`s are NOT interchangeable: `fading` is the most urgent
//     state DR can report and `permanent` the calmest, so the `untimed` layer
//     hides the quiet kinds but never `fading`, and only permanent/unknown are
//     muted. Each non-timed kind shows the game's own word rather than a faked
//     duration.
//   • A name absent from the badge table gets NO badge and its full name — an
//     unknown effect must never receive a wrong badge. Thief Khri are the known
//     gap (they appear in percWindow but not in Lich's base-spells.yaml).
//
// Layout: bounded by construction (`max-height` + scroll, pitfall #109 — the
// effect count is user data and a buff stack must not grow without limit), the
// root anchors the em chain to --panel-font-size/--game-font-size so A−/A+ and
// the Settings font both reach it (pitfall #58a), and numbers are tabular so a
// ticking value can never reflow its cell (pitfall #103).
import { Fragment, memo, useEffect, useState } from 'react'
import type { ExperienceProps, SpellEffect } from '../../experiences'
import { liveSpellEffects, spellBand, spellSortRank, groupSpells, spellSlotText, spellSlotAside, spellExpired, spellEndedRemainingMs, spellEndedCountdownLabel, spellPulseCadenceLabel, optionShown, experienceById, SPELL_ENDED_TTL_MS } from '../../experiences'
import { formatAgo } from '../../utils/formatAgo'
import { lookupSpell } from '../../spellData'
import '../../styles/experiences.css'

const MIN_MS = 60_000

// Bar fill 0…1, or null for an effect that should have no bar at all. A STATED
// percentage wins over the learned ceiling — it is a true proportion, where
// `max` is only "the most we happen to have seen". With neither, a timed effect
// shows a full bar rather than an empty one, since empty would read as "about
// to expire" on something we simply know nothing about yet.
function barFraction(e: SpellEffect, now: number): number | null {
  if (e.kind === 'permanent' || e.kind === 'unknown') return null
  if (e.kind === 'fading') return 0
  // A SPENT cell's bar drains its one-roisan grace rather than a spell duration
  // — the cell has no duration left to show, and this is the same question the
  // bar always answers ("how much of this is left?") pointed at the only clock
  // still running on it. It also disambiguates the countdown beside the word:
  // a shrinking bar reads as time REMAINING, where a bare "45s" next to "ended"
  // could as easily be read as time elapsed since.
  if (e.kind === 'ended') {
    const left = spellEndedRemainingMs(e, now)
    return left === null ? null : Math.max(0, Math.min(1, left / SPELL_ENDED_TTL_MS))
  }
  if (e.percent !== null && e.kind === 'percent') return Math.max(0, Math.min(1, e.percent / 100))
  if (e.expiresAt === null) return null
  // Past the anchor the bar is EMPTY, and that takes precedence over the
  // no-ceiling fallback below: once the countdown we were given has run out we
  // are no longer in the "we know nothing yet" case, and a full bar beside the
  // word "expired" would contradict itself. (Reachable whenever `max` is 0 —
  // a reading of `(0 roisaen)` learns a zero ceiling.)
  if (e.expiresAt <= now) return 0
  if (!e.max) return 1
  const left = (e.expiresAt - now) / MIN_MS
  return Math.max(0, Math.min(1, left / e.max))
}

function SpellCell({ effect, now, showBars, showUrgency, pulse, showBadges, useAbbrev }: {
  effect: SpellEffect; now: number; showBars: boolean; showUrgency: boolean; pulse: boolean
  showBadges: boolean; useAbbrev: boolean
}) {
  // Badge + abbreviation both come from Lich's base-spells.yaml, snapshotted at
  // build time (spellData.ts). A name we don't know simply has no entry, so it
  // renders with no badge and its full name — never a wrong badge. Thief Khri
  // are the known gap: they appear in percWindow but not in that file.
  const ref = lookupSpell(effect.name)
  const u = showUrgency ? spellBand(effect, now) : 'none'
  // ONE line of text per cell, always — see spellSlotText. The optional note row
  // this replaced made its cell taller, and a grid row takes the height of its
  // tallest cell, so one note stretched every cell beside it.
  const slot = spellSlotText(effect, now)
  // The smaller reading beside it: a spent cell's clear-out countdown, or a
  // timed effect's charge level.
  const aside = spellSlotAside(effect, now)
  // '' for everything that is not a spent cell inside its grace (tooltip only).
  const endedIn = spellEndedCountdownLabel(effect, now)
  const bar = barFraction(effect, now)
  const cls = [
    'sm-cell',
    u !== 'none' ? 'sm-cell--' + u : '',
    u === 'crit' && pulse ? 'sm-cell--pulse' : '',
    // Muted = background information. A 'fading' effect has NO countdown either,
    // but it is the most urgent thing on screen, so it must never be quieted
    // along with the permanents.
    effect.kind === 'permanent' || effect.kind === 'unknown' ? 'sm-cell--untimed' : '',
    // STAGE ONE of the two-stage end: our countdown has run out while the game
    // is STILL listing the effect. Marked independently of the urgency layer,
    // because "the time you were told has elapsed" is a STATE rather than a
    // colour band — turning the traffic light off must not hide it.
    spellExpired(effect, now) ? 'sm-cell--expired' : '',
    // STAGE TWO — SPENT: the game stopped listing it, which is the only thing
    // that settles it. Greyed rather than removed, so you can see WHAT lapsed
    // and needs recasting. Distinct from `--untimed`, which is quiet-but-live.
    effect.kind === 'ended' ? 'sm-cell--ended' : '',
  ].filter(Boolean).join(' ')
  // Abbreviations only where we actually have one — 12 spells in Lich's data
  // carry no `abbrev`, and a blank cell would be worse than a long name.
  const shownName = useAbbrev && ref?.a ? ref.a : effect.name
  // The tooltip adds facts the cell does NOT already show (UX #8) — never a
  // restatement of the label. Under abbreviation it carries the full name,
  // which is the one thing the cell has stopped saying.
  const title = [
    shownName === effect.name ? effect.name : effect.name + ' (' + shownName + ')',
    ref ? ref.l + (ref.g ? ' · ' + ref.g : '') : null,
    effect.kind === 'timed'
      ? effect.roisaen + ' roisaen when last reported' + (effect.max ? ' · longest seen ' + effect.max : '')
        + (effect.note ? ' · the game said "' + effect.note + '"' : '')
      : effect.kind === 'fading'    ? 'fading — about to lapse'
      : effect.kind === 'permanent' ? 'no expiry'
      // The full reading, since the slot may ellipsize a compound one.
      : effect.kind === 'percent'   ? (effect.note ?? effect.percent + '%')
      // A spent cell's leftover reading is what the game said BEFORE it ended.
      // It's no longer true, so it's labelled as history and never shown in the slot.
      : effect.kind === 'ended'     ? (effect.note ? 'last reported as "' + effect.note + '"' : null)
      : effect.note ?? 'no countdown reported',
    // The two end stages are one word apart on screen and mean different
    // things, so the tooltip spells out which one you are looking at (UX #8 —
    // a label that names a state without saying what it means is half-built).
    spellExpired(effect, now)
      ? 'the time the game gave has run out, but it is still listed — it may have up to a roisan left'
      : effect.kind === 'ended'
        ? 'the game has stopped listing it, so it is no longer in effect'
          // B412: no ticking number here. A native tooltip can't update while
          // it's showing — Chromium hides it when its text changes — so a live
          // countdown made this one blink every second (pitfall #145). The cell
          // itself shows the seconds.
          + (endedIn ? ' — it clears from the grid when its bar runs out' : '')
        : null,
  ].filter(Boolean).join(' — ')
  return (
    <div className={cls} title={title}>
      <div className="sm-cell-top">
        {showBadges && ref && (
          <span className={'sm-badge sm-badge--' + ref.b.toLowerCase()} aria-hidden="true">{ref.b}</span>
        )}
        <span className="sm-name">{shownName}</span>
        {slot && <span className="sm-time">{slot}</span>}
        {/* The secondary reading, smaller: how long before a spent cell clears
            itself, or a timed effect's charge. Its own element rather than
            folded into the slot, so the WORD stays the primary fact and the
            number reads as secondary — and so the slot keeps being one fact,
            which is what makes it testable. */}
        {aside && <span className="sm-aside">{aside}</span>}
      </div>
      {/* While bars are on, the bar slot is ALWAYS there, so a cell with no bar
          (a permanent or unknown effect) is exactly as tall as one with a bar.
          `--none` hides the track without giving its space back. */}
      {showBars && (
        <div className={bar === null ? 'sm-bar sm-bar--none' : 'sm-bar'} aria-hidden="true">
          {/* scaleX, not width — the bar drains continuously, and a width
              transition would invalidate layout every frame for every bar.
              See the .sm-bar-fill rule.

              ROUNDED to 3dp, and that is what stops the transition running
              forever (v0.19.9). `.sm-bar-fill` carries `transition: transform
              1s linear` and this component re-renders on a 1 Hz clock — so an
              unrounded float produced a DIFFERENT style string every tick and
              re-armed the transition at the exact moment the previous one
              would have finished. Every bar was therefore permanently
              animating, which is the compositing cost DESIGN §45.10 flagged as
              unmeasured ("N permanently-transitioning bars"). At 3dp a bar only
              re-animates when it moves by 0.1% of its width — sub-pixel on any
              real panel — so a long buff now sits still between real changes. */}
          {bar !== null && (
            <span className="sm-bar-fill" style={{ transform: 'scaleX(' + Math.round(bar * 1000) / 1000 + ')' }} />
          )}
        </div>
      )}
    </div>
  )
}

export default memo(function SpellMonitorExperience({ spells, spellsPulse, settings, hidden }: ExperienceProps) {
  const def = experienceById('spellmonitor')
  const opts = def?.options ?? []
  const shown = (id: string) => {
    const o = opts.find(x => x.id === id)
    return o ? optionShown(hidden, o) : true
  }
  const showBars    = shown('bars')
  const showUrgency = shown('urgency')
  const showUntimed = shown('untimed')
  const showBadges  = shown('badges')
  const useAbbrev   = shown('abbrev')
  const keepEnded   = shown('expired')
  // Lives INSIDE the header bar, so it follows that layer (Sekmeht): hiding the
  // header hides this too. Its own option then means "show the feed status in
  // the header", never "show it somewhere else".
  const showUpdated = shown('updated') && shown('header')
  // Motion is decoration, colour is signal (UX #9b): epilepsy-safe drops the
  // pulse but KEEPS the urgency colour, so the accessible path loses nothing.
  const pulse = shown('pulse') && !settings.epilepsySafe

  // A 1s clock that exists ONLY while something is counting down, and clears
  // itself once everything has expired (B292 — the expiry values never zero
  // themselves, so a bare "is anything set" guard would arm a permanent tick).
  const [now, setNow] = useState(() => Date.now())
  // The next moment the DISPLAY changes, still in the future — not merely the
  // next expiry. Two sources feed it:
  //   • a timed effect reaching its anchor (the cell flips to "expired"), and
  //   • a spent cell reaching the end of its one-roisan grace (it leaves).
  // Both must be in here. Bidding only on live expiries let the clock retire
  // while a greyed "ended" cell was still on screen, and with nothing ticking,
  // `now` froze — so the cell sat there past its grace until DR happened to
  // repaint, which on a repaint-on-change feed can be many minutes.
  // The FUTURE filter is equally load-bearing: the interval self-clears at
  // `soonest`, so if that moment stayed in the value the dep never changed, no
  // new interval was armed, and every other countdown froze behind it. Bidding
  // only on `> now` makes each moment advance the dep to the following one, and
  // the chain ends naturally at null when nothing further is due.
  let soonestAcc: number | null = null
  const bidTick = (t: number) => {
    if (t > now && (soonestAcc === null || t < soonestAcc)) soonestAcc = t
  }
  for (const e of spells?.effects ?? []) if (e.expiresAt !== null) bidTick(e.expiresAt)
  if (keepEnded) for (const e of spells?.ended ?? []) if (e.endedAt !== null) bidTick(e.endedAt + SPELL_ENDED_TTL_MS)
  const soonest: number | null = soonestAcc
  // The feed status is the one readout with NO deadline to bid: "updated 3s ago"
  // changes every second for as long as it is on screen, so it keeps the clock
  // running instead of scheduling a wake-up. That is a permanent 1 Hz render
  // while the readout is on — the deliberate cost of the readout, which is why it
  // is a ⚙ layer you can switch off, and it is bounded by MOUNT: a background
  // tab unmounts this component, so it never ticks for a character you are not
  // looking at.
  useEffect(() => {
    if (!showUpdated && soonest === null) return
    setNow(Date.now())
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      // Only a countdown-ONLY clock retires (B292). With the strip on there is
      // always something to update, so it runs until unmount.
      if (!showUpdated && soonest !== null && t >= soonest) clearInterval(id)   // last tick still renders the 0 state
    }, 1000)
    return () => clearInterval(id)
  }, [soonest, showUpdated])

  // FEED LIVENESS. Read from a REF (see SpellPulse) — a ref read during render
  // is normally a smell, but it is safe and correct here for two reasons: the
  // value is used for DISPLAY ONLY (nothing derives state from it, no ref is
  // mutated), and this component re-renders every second on its own clock
  // whenever the readout is shown, so the reading can never sit stale. The
  // alternative — a plain prop — would change identity on every repaint and
  // re-render Moons and the Tableau along with it.
  const feed = spellsPulse?.current
  const feedAt = feed?.at ?? 0
  const feedCadence = feed ? spellPulseCadenceLabel(feed) : ''
  // UX #8: the strip's two numbers mean different things and neither is
  // self-evident, so the tooltip says which is which — and, importantly, that a
  // still grid is not a broken one.
  const feedTitle = feedAt
    ? 'When DragonRealms last sent this list' + (feedCadence ? ', and how often it has been sending it lately' : '')
      + '. The list itself only changes when your effects do, so this number ticking up beside a grid that is sitting still means the feed is fine — nothing has changed.'
    : 'Waiting for DragonRealms to send the spell list. It arrives on its own — nothing to do.'

  const live = liveSpellEffects(spells, now, keepEnded)
  // The `untimed` layer hides readings that carry no countdown — but NEVER a
  // 'fading' one. DR saying an effect is lapsing right now is the most urgent
  // thing the window can show, and a toggle meant for background information
  // must not be able to swallow it.
  const visible = live.filter(e => showUntimed || e.kind === 'timed' || e.kind === 'fading')
  // Soonest-expiring first (UX #3 — the thing about to drop is the thing you act
  // on), with untimed effects last: they have no urgency to sort by and are the
  // least likely thing you're watching for. Turning the option off keeps DR's
  // own order, which some players read positionally and which — unlike ours —
  // never rearranges itself as timers cross.
  const ordered = shown('sortByTime')
    ? [...visible].sort((a, b) => {
        // Kind first (lapsing → counting down → no countdown → permanent), then
        // soonest expiry within the timed band, then name for a stable tie.
        const r = spellSortRank(a) - spellSortRank(b)
        if (r !== 0) return r
        if (a.expiresAt !== null && b.expiresAt !== null) return a.expiresAt - b.expiresAt
        return a.name.localeCompare(b.name)
      })
    : visible

  return (
    <div className="sm-scene">
      {shown('header') && (
        <div className="sm-head">
          {/* B392: the window's own name, the one its tab, the shelf and the +
              menu use — "Active Spells" named the plain Active Spells PANEL,
              the very thing this Experience's id is chosen not to collide with. */}
          <span className="sm-head-title">Spell Monitor</span>
          {showUpdated && (
            <span className="sm-head-feed" title={feedTitle}>
              {feedAt
                ? <>updated {formatAgo(feedAt, now)}{feedCadence && <span className="sm-head-feed-dim"> · {feedCadence}</span>}</>
                // Deliberately NOT "waiting for the game…": the empty state
                // already says that, and printing it twice in one small window
                // is the noise UX #1 exists to remove. This reports the FEED, so
                // it states the feed's fact and leaves the prose to the body.
                : 'no update yet'}
            </span>
          )}
          {ordered.length > 0 && <span className="sm-head-count">{ordered.length}</span>}
        </div>
      )}
      {ordered.length === 0 ? (
        // The empty state TEACHES (UX #8): a first-time user with nothing up
        // should still learn what this window is for and where the same
        // information lives in text.
        <div className="sm-empty">
          {/* "Nothing is up" and "everything up is filtered out" are different
              facts, and claiming the first while the second is true is simply
              false — turn off "Untimed effects" while only untimed ones are on
              you and the window would have insisted you had nothing. */}
          {live.length > 0 ? (
            <>
              <div className="sm-empty-line">Nothing to show with the current view.</div>
              <div className="sm-empty-hint">
                {live.length === 1 ? 'One effect is' : `${live.length} effects are`} active but
                hidden — turn on “Untimed effects” in ⚙ to see {live.length === 1 ? 'it' : 'them'}.
              </div>
            </>
          ) : (
            <>
              <div className="sm-empty-line">No active spells, abilities or effects.</div>
              <div className="sm-empty-hint">
                {spells
                  ? 'Any spell or ability used on you appears here with its countdown.'
                  : 'Waiting for the game — spells and abilities appear here as soon as one is on you.'}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="sm-grid">
          {shown('groupBySkill')
            // Grouped: `ordered` is already in its final within-group order, and
            // groupSpells preserves it — so this composes with "Soonest first"
            // rather than overriding it. The heading spans every column
            // (grid-column: 1/-1) so the grid keeps flowing underneath it.
            ? groupSpells(ordered, lookupSpell).map(g => (
                <Fragment key={g.label}>
                  <div className="sm-group">
                    <span className="sm-group-name">{g.label}</span>
                    <span className="sm-group-count">{g.effects.length}</span>
                  </div>
                  {g.effects.map(e => (
                    <SpellCell key={e.name} effect={e} now={now}
                      showBars={showBars} showUrgency={showUrgency} pulse={pulse}
                      showBadges={showBadges} useAbbrev={useAbbrev} />
                  ))}
                </Fragment>
              ))
            : ordered.map(e => (
                <SpellCell key={e.name} effect={e} now={now}
                  showBars={showBars} showUrgency={showUrgency} pulse={pulse}
                  showBadges={showBadges} useAbbrev={useAbbrev} />
              ))}
        </div>
      )}
    </div>
  )
})
