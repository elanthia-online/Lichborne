// Team Login panel — one surface for the whole of a team login (v0.20.0).
//
// Replaces the old two-step flow (a progress card naming only the character
// currently connecting, then a text summary). Every member of the team is a
// TILE from the start: waiting → connecting (with the live connect step) →
// READY (health and room fill in as game data arrives) → or failed / skipped.
// The run itself lives in App (`runBulkConnect`); this file only draws it.
//
// You don't have to wait for the end. A READY tile can be played at once.
// A single click CHOOSES a character (the footer's primary button becomes
// "Play <name>"); a double-click, or Enter on a tile, plays it straight away.
// Playing steps the panel aside into the app-bar PILL (`TeamLoginPill`) and the rest
// keep connecting in the background, arriving as tabs that do not take focus
// (SessionsContext `activate: false`). Clicking the pill brings the panel back.
// Until you choose, the first READY character in team order is the choice.
// When the run finishes, a panel that is still open becomes the "start with
// whom?" screen.
//
// Two performance rules carried over from the old overlay (v0.18.0 audit):
// the per-second connect step and the live stats are subscribed to INSIDE each
// tile, never held in App — App's state changes only when a member changes
// state, so the game windows underneath don't re-render once a second.
//
// Chrome: the house modal look (UX standard #10, `--modal-*` tokens) and the
// shared controls from ui.css (#12). Esc collapses the panel while the run is
// going (it never cancels a login) and closes it once the run is done.

import { useEffect, useRef, useState } from 'react'
import type { LauncherCharacter } from './Launcher'
import type { CharacterId } from '../SessionsContext'
import { useDigests } from '../overviewStore'
import { guildLabel } from './CharacterNotesEditor'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { characterColor, useCharacterColors } from '../characterColors'
import { makeCharacterId } from '../../shared/characterId'
import { monogramStyle, nameInitials } from '../utils/nameColor'
import '../styles/team-login.css'

export type TeamMemberStatus = 'waiting' | 'connecting' | 'ready' | 'failed' | 'skipped'

export interface TeamMember {
  pick: LauncherCharacter
  status: TeamMemberStatus
  /** Set once connected. Also set for a character moved to its own window. */
  characterId?: CharacterId
  /** Opened in its own OS window ("Open each in its own window"). */
  inOwnWindow?: boolean
  error?: string
  /** When this member started connecting (epoch ms) — a connect step older
   *  than this belongs to an earlier attempt and is not shown. */
  startedAt?: number
}

export interface TeamRun {
  members: TeamMember[]
  /** The loop has finished (or was stopped and has finished its last login). */
  done: boolean
  /** Stop was pressed: the login in flight lands, the rest are skipped. */
  stopping: boolean
  /** Panel shown (true) or folded into the app-bar pill (false). */
  expanded: boolean
  /** The character the player chose with Play. Tracked, not inferred from the
   *  active tab: the first character to connect becomes active on its own (a
   *  window has to show someone), and must not read "Playing" before anyone
   *  was actually picked. */
  played?: CharacterId
}

export function teamCounts(run: TeamRun) {
  const c = { ready: 0, failed: 0, skipped: 0, pending: 0, total: run.members.length }
  for (const m of run.members) {
    if (m.status === 'ready') c.ready++
    else if (m.status === 'failed') c.failed++
    else if (m.status === 'skipped') c.skipped++
    else c.pending++
  }
  return c
}

// ── Tile pieces (module level, so they survive re-renders — UX #4) ─────────────

// ── Connect steps ─────────────────────────────────────────────────────────────
//
// Main narrates each login ("Step 2 of 5 · Signing in…") on `connect-progress`.
// They are recorded HERE, at module level, not in the tile: a tile unmounts
// whenever the panel folds into the pill, and a tile-owned listener both lost
// the last step (it reopened on "Starting…") and missed every step that
// arrived while folded. `trackConnectSteps` is idempotent; App calls it when a
// run starts, and a tile calls it too in case it mounts first.
const lastStep = new Map<string, { message: string; at: number }>()
const stepListeners = new Set<() => void>()
let stepUnsub: (() => void) | null = null

export function trackConnectSteps(): void {
  if (stepUnsub) return
  stepUnsub = window.api.onConnectProgress(p => {
    lastStep.set(p.character, { message: p.message, at: Date.now() })
    for (const fn of stepListeners) fn()
  })
}

// Seconds on the SAME step before the tile says so. Normal steps take a second
// or two; a Lich wait narrates its own counter. Past this, "still waiting" is
// the honest reading, and it's what makes a stall visible instead of silent.
const STALL_AFTER_S = 15

function TileStep({ character, since }: { character: string; since: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    trackConnectSteps()
    const fn = () => force(n => n + 1)
    stepListeners.add(fn)
    // A 1s tick drives the stall counter. It lives in this leaf only, and only
    // while a character is connecting, so nothing else re-renders.
    const t = setInterval(fn, 1000)
    return () => { stepListeners.delete(fn); clearInterval(t) }
  }, [])
  const rec = lastStep.get(character)
  const step = rec && rec.at >= since ? rec : null
  const stuck = Math.floor((Date.now() - (step?.at ?? since)) / 1000)
  return (
    <div className="tlr-tile-step">
      {step?.message ?? 'Starting…'}
      {stuck >= STALL_AFTER_S && <span className="tlr-tile-stall"> · still waiting ({stuck}s)</span>}
    </div>
  )
}

// Health and room for a connected character, from the Overview's always-on
// digest store. Characters in OTHER windows publish to their own window's
// store, so they show nothing here — the tile says where they are instead.
function TileStats({ characterId }: { characterId: CharacterId }) {
  const d = useDigests().find(x => x.characterId === characterId)
  if (!d || (d.healthPct === null && !d.room)) {
    return <div className="tlr-tile-meta">Loading game data…</div>
  }
  return (
    <>
      {d.healthPct !== null && <div className="tlr-tile-health" title="Health">❤&#xFE0E; {Math.round(d.healthPct)}%</div>}
      {d.room && <div className="tlr-tile-room" title={d.room}>{d.room}</div>}
    </>
  )
}

const STATUS_WORD: Record<TeamMemberStatus, string> = {
  waiting: 'Waiting', connecting: 'Connecting', ready: 'Ready', failed: 'Failed', skipped: 'Skipped',
}

function Tile({ m, playing, closed, selected, canRetry, onSelect, onPlay, onRetry, tileRef }: {
  m: TeamMember
  playing: boolean
  /** READY, but the player has closed its tab since. */
  closed: boolean
  selected: boolean
  canRetry: boolean
  onSelect: () => void
  onPlay: () => void
  onRetry: () => void
  tileRef: (el: HTMLButtonElement | null) => void
}) {
  const guild = guildLabel(m.pick.guild)
  const sub = [guild, m.pick.circle ? `Circle ${m.pick.circle}` : ''].filter(Boolean).join(' · ')
  const playable = m.status === 'ready' && !m.inOwnWindow && !closed
  // The colour picked for this character in Edit Profile (v0.20.0): its badge,
  // and the ring when it's the chosen tile. Absent → the automatic colour and
  // the theme accent, exactly as before.
  const chosenColor = characterColor(useCharacterColors(), {
    characterId: makeCharacterId(m.pick.account, m.pick.name, m.pick.game),
  })
  const badge = m.status === 'ready' ? (playing ? 'Playing' : 'Ready') : STATUS_WORD[m.status]
  const title = m.status === 'ready'
    ? closed ? `${m.pick.name}'s tab was closed. Connect again from the launcher.`
      : m.inOwnWindow ? `${m.pick.name} opened in its own window.`
      : playing ? `You're playing ${m.pick.name}.`
      : `Click to choose ${m.pick.name}, then press Play. Double-click to play now.`
    : m.status === 'connecting' ? `${m.pick.name} is connecting.`
    : m.status === 'waiting' ? `${m.pick.name} connects after the characters before it.`
    : m.status === 'skipped' ? `${m.pick.name} was skipped because you pressed Stop.`
    // The whole reason: the tile clamps it to three lines.
    : `${m.pick.name} didn't connect: ${m.error ?? 'unknown error'}`

  return (
    // The hover text sits on the WRAPPER so it covers the whole tile —
    // the Play/Retry buttons carry their own.
    <div
      className={`tlr-tile tlr-tile--${m.status}${playing ? ' tlr-tile--playing' : ''}${selected ? ' tlr-tile--selected' : ''}`}
      title={title}
      style={chosenColor ? { ['--char-color' as string]: chosenColor } as React.CSSProperties : undefined}
    >
      {/* A playable tile is a choice: click chooses, double-click (or Enter)
          plays. Until it's playable the button is disabled, which also takes
          it out of the Tab order and out of the arrow-key roving below. */}
      <button
        ref={tileRef}
        type="button"
        className="tlr-tile-main"
        onClick={playable ? onSelect : undefined}
        onDoubleClick={playable ? onPlay : undefined}
        onKeyDown={playable ? e => {
          // Enter plays; Space stays the native click, which chooses.
          if (e.key !== 'Enter') return
          e.preventDefault()
          onPlay()
        } : undefined}
        disabled={!playable}
        aria-pressed={playable ? selected : undefined}
      >
        <div className="tlr-tile-head">
          <span className="tlr-tile-dot" aria-hidden="true" />
          <span className="tlr-tile-mono" style={monogramStyle(m.pick.name, chosenColor)} aria-hidden="true">
            {nameInitials(m.pick.name)}
          </span>
          <span className="tlr-tile-name">{m.pick.name}</span>
        </div>
        {sub && <div className="tlr-tile-sub">{sub}</div>}
        <div className="tlr-tile-badge">{badge}</div>
        <div className="tlr-tile-body">
          {m.status === 'connecting' && (
            <>
              <TileStep character={m.pick.name} since={m.startedAt ?? 0} />
              <div className="tlr-tile-bar" aria-hidden="true"><div className="tlr-tile-bar-fill" /></div>
            </>
          )}
          {m.status === 'ready' && m.characterId && !m.inOwnWindow && !closed && <TileStats characterId={m.characterId} />}
          {closed && <div className="tlr-tile-meta">Tab closed</div>}
          {m.status === 'ready' && m.inOwnWindow && <div className="tlr-tile-meta">In its own window</div>}
          {m.status === 'failed' && <div className="tlr-tile-error">{m.error}</div>}
          {m.status === 'skipped' && <div className="tlr-tile-meta">Connect it any time from the launcher.</div>}
        </div>
      </button>
      {m.status === 'failed' && (
        <button
          type="button"
          className="ui-btn ui-btn--sm tlr-tile-action"
          onClick={onRetry}
          disabled={!canRetry}
          title={canRetry ? `Try ${m.pick.name} again` : 'You can retry once the rest of the team has finished connecting'}
        >Retry</button>
      )}
    </div>
  )
}

// The footer's "Play <name>" button. Every member's label is stacked in one grid
// cell and only the chosen one shows, so the button is always as wide as the
// longest name on the team: a width that followed the choice re-wrapped the
// hint beside it and moved the whole panel as you clicked between tiles
// (Sekmeht; pitfall #103). Hoisted (UX #4).
function PlayButton({ run, choice, onPlay, title }: {
  run: TeamRun
  choice: number
  onPlay: (index: number) => void
  title?: string
}) {
  return (
    <button type="button" className="ui-btn ui-btn--primary ui-btn--stable" onClick={() => onPlay(choice)} title={title}>
      {run.members.map((m, i) => (
        <span
          key={`${m.pick.account}|${m.pick.name}`}
          className={`ui-btn-label${i === choice ? '' : ' ui-btn-label--off'}`}
          aria-hidden={i !== choice}
        >Play {m.pick.name}</span>
      ))}
    </button>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

interface PanelProps {
  run: TeamRun
  activeId: CharacterId | null
  /** How many characters are in THIS window (Overview needs two or more). */
  windowCharacterCount: number
  /** Characters with a tab in this window. A READY member missing from here had
   *  its tab closed, and can't be played from the panel. */
  openIds: Set<string>
  /** False until a character is connected in this window: the pill lives in
   *  the app bar, which only exists once one is, so hiding the panel before
   *  then would leave nothing on screen to bring it back. */
  canCollapse: boolean
  onPlay: (index: number) => void
  onRetry: (index: number) => void
  onStop: () => void
  onCollapse: () => void
  onClose: () => void
  onOverview: () => void
}

export function TeamLoginPanel({ run, activeId, windowCharacterCount, openIds, canCollapse, onPlay, onRetry, onStop, onCollapse, onClose, onOverview }: PanelProps) {
  const c = teamCounts(run)
  // Esc steps the panel aside while the run is going (it never cancels a
  // login); once it's done, Esc closes it, like Close. With nowhere to step
  // aside to yet, Esc does nothing — the dialog stays registered either way,
  // so the key can't fall through to whatever is underneath (pitfall #141d).
  useEscapeClose(run.done ? onClose : canCollapse ? onCollapse : () => {})

  // A tile can be played while it's READY, in this window, and its tab is open.
  const isPlayable = (i: number) => {
    const m = run.members[i]
    return !!m && m.status === 'ready' && !m.inOwnWindow && !!m.characterId && openIds.has(m.characterId)
  }
  // The default choice: the first READY character in team order. A click
  // overrides it for as long as that character stays playable.
  const firstReady = run.members.findIndex((_, i) => isPlayable(i))
  const [chosen, setChosen] = useState<number | null>(null)
  const choice = chosen !== null && isPlayable(chosen) ? chosen : firstReady
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  // When the run finishes with the panel open, put focus on the chosen tile,
  // so Enter plays it. Before that, focus the panel itself (the dialog stack
  // needs focus inside the dialog, not in the command bar behind it).
  useEffect(() => {
    if (run.done && choice >= 0) tileRefs.current[choice]?.focus()
    else panelRef.current?.focus()
  }, [run.done]) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrow keys move between the playable tiles, and the choice moves with the
  // focus, so the footer button always names the tile you're on.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const live = tileRefs.current
      .map((el, idx) => ({ el, idx }))
      .filter((t): t is { el: HTMLButtonElement; idx: number } => !!t.el && !t.el.disabled)
    if (live.length === 0) return
    e.preventDefault()
    const i = live.findIndex(t => t.el === document.activeElement)
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
    const next = live[i < 0 ? 0 : back ? (i - 1 + live.length) % live.length : (i + 1) % live.length]
    next.el.focus()
    setChosen(next.idx)
  }

  const connectingIdx = run.members.findIndex(m => m.status === 'connecting')
  const status = !run.done
    ? run.stopping
      ? `Stopping after ${run.members[connectingIdx]?.pick.name ?? 'this character'}…`
      : `Connecting ${Math.min(c.ready + c.failed + 1, c.total)} of ${c.total}`
    : c.failed === 0 && c.skipped === 0
      ? `All ${c.ready} connected.`
      : [`${c.ready} connected`, c.failed ? `${c.failed} didn't connect` : '', c.skipped ? `${c.skipped} skipped` : ''].filter(Boolean).join(', ') + '.'
  const hint = !run.done
    ? choice >= 0 ? 'Choose a ready character and press Play, or double-click it. The rest keep connecting.' : 'Characters connect one at a time.'
    : choice >= 0 ? 'Choose who to start with, then press Play. Double-click a character to go straight there.' : ''

  return (
    <div className="ui-modal-backdrop tlr-backdrop">
      <div
        ref={panelRef}
        className="ui-modal tlr-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tlr-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ui-modal-head tlr-head">
          <span id="tlr-title" className="ui-modal-title tlr-title">Team login</span>
          <span className="tlr-head-count">{c.ready} of {c.total} ready</span>
          {(run.done || canCollapse) && <button
            type="button"
            className="ui-close"
            onClick={run.done ? onClose : onCollapse}
            title={run.done ? 'Close' : 'Hide — the team keeps connecting (reopen it from the app bar)'}
            aria-label={run.done ? 'Close' : 'Hide'}
          >✕</button>}
        </div>

        <div
          className="tlr-grid"
          style={{
            '--tlr-cols': Math.max(1, Math.min(run.members.length, 4)),
            '--tlr-cols-narrow': Math.max(1, Math.min(run.members.length, 2)),
          } as React.CSSProperties}
        >
          {run.members.map((m, i) => (
            <Tile
              key={`${m.pick.account}|${m.pick.name}`}
              m={m}
              playing={!!m.characterId && m.characterId === run.played && m.characterId === activeId}
              closed={m.status === 'ready' && !m.inOwnWindow && !!m.characterId && !openIds.has(m.characterId)}
              selected={i === choice}
              canRetry={run.done}
              onSelect={() => setChosen(i)}
              onPlay={() => onPlay(i)}
              onRetry={() => onRetry(i)}
              tileRef={el => { tileRefs.current[i] = el }}
            />
          ))}
        </div>

        <div className="ui-modal-foot tlr-foot">
          <div className="tlr-foot-text">
            <div className="tlr-status">{status}</div>
            {hint && <div className="tlr-hint">{hint}</div>}
          </div>
          {!run.done && (
            <>
            <button
              type="button"
              className="ui-btn"
              onClick={onStop}
              disabled={run.stopping || connectingIdx < 0 || !run.members.some(m => m.status === 'waiting')}
              title={run.members.some(m => m.status === 'waiting')
                ? 'Finish the character connecting now, then skip the rest'
                : 'Nothing left to skip — this is the last character'}
            >{run.stopping ? 'Stopping…' : 'Stop'}</button>
            {choice >= 0 && (
              <PlayButton run={run} choice={choice} onPlay={onPlay}
                title="Start playing now. The rest of the team keeps connecting" />
            )}
            </>
          )}
          {run.done && (
            <>
              {windowCharacterCount >= 2 && (
                <button type="button" className="ui-btn" onClick={onOverview}
                  title="See every character in this window at once">Overview</button>
              )}
              {choice >= 0 ? (
                <PlayButton run={run} choice={choice} onPlay={onPlay} />
              ) : (
                <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>Close</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── One character ──────────────────────────────────────────────────────────────
//
// A single Connect (a launcher card, the + window) wears the same look as a
// team run — one tile with the live connect step, the stall counter and the
// progress bar (Sekmeht: "I really like the look and feel… something like this
// but for the single character"). It replaces the old spinner card. It only
// DRAWS: App's single-connect flow (pendingConnect, its Cancel, the account-
// conflict prompt, errors) is unchanged, which is why this takes a character
// and a cancel rather than a TeamRun.
//
// Mounted when a connect starts and unmounted when it ends (App renders it
// keyed on the character), so `since` is this attempt's start: the tile ignores
// a previous attempt's last step (TileStep filters on it).
export function SoloConnectPanel({ character, onCancel }: {
  character: LauncherCharacter
  onCancel: () => void
}) {
  const [since] = useState(() => Date.now())
  const panelRef = useRef<HTMLDivElement>(null)
  // Esc = Cancel (B341), as the old card did. A mounted dialog, so it sits on
  // top of the Esc stack — above the + window it may have been opened from.
  useEscapeClose(onCancel)
  useEffect(() => { panelRef.current?.focus() }, [])
  const member: TeamMember = { pick: character, status: 'connecting', startedAt: since }
  return (
    <div className="ui-modal-backdrop tlr-backdrop">
      <div
        ref={panelRef}
        className="ui-modal tlr-panel tlr-panel--solo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tlr-solo-title"
        tabIndex={-1}
      >
        <div className="ui-modal-head tlr-head">
          <span id="tlr-solo-title" className="ui-modal-title tlr-title">Logging in</span>
          <span className="tlr-head-count" />
          <button type="button" className="ui-close" onClick={onCancel} title="Cancel" aria-label="Cancel">✕</button>
        </div>
        <div className="tlr-grid" style={{ '--tlr-cols': 1, '--tlr-cols-narrow': 1 } as React.CSSProperties}>
          <Tile
            m={member}
            playing={false}
            closed={false}
            selected={false}
            canRetry={false}
            onSelect={() => {}}
            onPlay={() => {}}
            onRetry={() => {}}
            tileRef={() => {}}
          />
        </div>
        <div className="ui-modal-foot tlr-foot">
          <div className="tlr-foot-text">
            <div className="tlr-status">Connecting {character.name}…</div>
            <div className="tlr-hint">Your tab opens as soon as the game lets you in.</div>
          </div>
          <button type="button" className="ui-btn" onClick={onCancel}
            title="Stop this login — nothing is added. One already under way finishes in the background first">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── App-bar pill ───────────────────────────────────────────────────────────────

export function TeamLoginPill({ run, onOpen }: { run: TeamRun; onOpen: () => void }) {
  const c = teamCounts(run)
  const state = !run.done ? 'running' : c.failed > 0 ? 'failed' : 'done'
  const label = state === 'running' ? `Team login · ${c.ready} of ${c.total}`
    : state === 'failed' ? `Team login · ${c.failed} failed`
    : `Team login · ${c.ready} connected`
  return (
    <button
      type="button"
      className={`tlr-pill tlr-pill--${state}`}
      onClick={onOpen}
      title={state === 'running'
        ? 'Your team is still connecting. Click to see every character (or to Stop).'
        : state === 'failed' ? "Some characters didn't connect. Click to see why, or to retry."
        : 'Team login finished. Click for details.'}
    >
      <span className="tlr-pill-icon" aria-hidden="true">
        {state === 'running' ? <span className="tlr-pill-spin" /> : state === 'failed' ? '⚠︎' : '✓'}
      </span>
      <span className="tlr-pill-label">{label}</span>
    </button>
  )
}
