// Effects panel (GS4) — the game's four timed-effect dialogs in one list:
// Debuffs, Cooldowns, Buffs, Active Spells, each a section with its rows.
//
// Pure view over GameWindow's `EffectsState` (one block per dialog, from
// `effects-update`); the time math lives in gsEffects.ts. Layout follows
// ProfanityFE's EffectsWindow: every section always renders its header (UX
// standard #2), rows keep the game's order so nothing jumps as times change,
// a fill bar behind each row shows the share left (the progressBar `value`),
// and a Buff or Spell about to run out warns (gsEffects.isWarning).
//
// The 1s clock is HERE, not in GameWindow: a tick in GameWindow would
// re-render the whole character every second (B172). It runs only while some
// row still counts down, so a panel of Indefinite effects is idle.
import { memo, useEffect, useState } from 'react'
import type { EffectEntry } from '../../../shared/types'
import {
  EFFECT_SECTIONS, anyTicking, formatRemaining, isWarning, remainingSeconds,
  type EffectsState,
} from '../../gsEffects'

interface Props {
  effects: EffectsState
}

const INDEFINITE_TIP = 'No set duration — it lasts until something ends it.'

// Module-level (UX standard #4): a component defined inside the panel would
// be a new type every second and remount every row.
function EffectRow({ entry, at, now, warns }: { entry: EffectEntry; at: number; now: number; warns: boolean }) {
  const left = remainingSeconds(entry, at, now)
  const state = left === null ? 'indef' : left === 0 ? 'ending' : warns && isWarning(entry, left) ? 'warn' : 'normal'
  const pct = Math.max(0, Math.min(100, entry.percent))
  return (
    <div className={`gs-effects-row gs-effects-row--${state}`}>
      <span className="gs-effects-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      {/* The title is for a name the ellipsis cut short. */}
      <span className="gs-effects-name" title={entry.name}>{entry.name}</span>
      <span
        className="gs-effects-time"
        title={left === null ? INDEFINITE_TIP : left === 0 ? 'Time is up — the game has not removed it yet.' : `${pct}% of its duration left`}
      >
        {left === null ? '∞' : formatRemaining(left)}
      </span>
    </div>
  )
}

function EffectSection({ label, cls, desc, warns, entries, at, now }: {
  label: string; cls: string; desc: string; warns: boolean; entries: EffectEntry[]; at: number; now: number
}) {
  const empty = entries.length === 0
  return (
    <div className={`gs-effects-section gs-effects-section--${cls}${empty ? ' gs-effects-section--empty' : ''}`}>
      <div className="gs-effects-label" title={desc}>
        <span>{label}</span>
        {!empty && <span className="gs-effects-count">{entries.length}</span>}
      </div>
      {entries.map((e, i) => <EffectRow key={`${e.id}#${i}`} entry={e} at={at} now={now} warns={warns} />)}
    </div>
  )
}

function EffectsPanel({ effects }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const ticking = anyTicking(effects, now)
  useEffect(() => {
    // A new block resets the base, so read the clock as it lands rather than
    // showing up to a second of the old reading.
    setNow(Date.now())
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ticking, effects])

  const received = EFFECT_SECTIONS.some(s => effects[s.dialog])
  return (
    <div className="gs-effects-panel">
      {!received && (
        <div className="gs-effects-waiting" title="GemStone sends these at login and whenever one changes.">
          No effect timers yet.
        </div>
      )}
      {EFFECT_SECTIONS.map(s => {
        const block = effects[s.dialog]
        return (
          <EffectSection
            key={s.dialog}
            label={s.label} cls={s.cls} desc={s.desc} warns={s.warns}
            entries={block?.entries ?? EMPTY}
            at={block?.at ?? 0}
            now={now}
          />
        )
      })}
    </div>
  )
}

const EMPTY: EffectEntry[] = []

export default memo(EffectsPanel)
