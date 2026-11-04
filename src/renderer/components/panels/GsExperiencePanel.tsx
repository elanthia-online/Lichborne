// GS4 experience panel — what the `exp` tab shows for a GemStone IV
// character (DR's is ExpPanel). A pure view over GameWindow's state from the
// parser's `gs-experience` event (the `expr` dialog). Encumbrance is its own
// panel (EncumbrancePanel), as it is in Saga.
//
// Modelled on Saga 0.10.7's Experience window, limited to what the 184 GS4
// captures carry (Principle #10): level, the mind bar's field experience,
// experience to the next level (to the next training point at 100+, Saga's
// TP↑), Experience / Ascension / Total, the RPA and Gift of Lumnis boosts,
// and training points (PTPs / MTPs / ATPs — sent once at login in their own
// `expr` block, lich-5's gs_saga_login.xml fixture). Fash'lo'nae's Tutelage
// never appears in the captures or fixtures, so it is not drawn. The level bar below 100 and the "of cap"
// figure follow Saga's code; every capture is a level-100 character far past
// the 7,572,500 cap, so neither has been seen with real data.
import { memo } from 'react'
import type { GsExperienceEvent } from '../../../shared/types'

export type GsExperienceState = Omit<GsExperienceEvent, 'type'>

interface Props {
  exp: GsExperienceState | null
}

// Saga's "percent capped" base: experience at the level-100 cap.
const EXP_CAP = 7_572_500

const fmt = (n: number) => n.toLocaleString()

// Module-level (UX standard #4).
function Stat({ label, value, tip }: { label: string; value: string; tip: string }) {
  return (
    <div className="gsx-stat" title={tip}>
      <span className="gsx-stat-label">{label}</span>
      <span className="gsx-stat-value">{value}</span>
    </div>
  )
}

export function Bar({ pct, cls }: { pct: number; cls: string }) {
  return (
    <div className={`gsx-bar ${cls}`} aria-hidden="true">
      <span className="gsx-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

function GsExperiencePanel({ exp }: Props) {
  const level = exp?.level ?? 0
  const fieldMax = exp?.fieldExpMax ?? 0
  const fieldPct = fieldMax > 0 ? Math.round(((exp?.fieldExp ?? 0) / fieldMax) * 100) : (exp?.mindValue ?? 0)
  const total = Math.max(0, exp?.totalExp ?? 0) + Math.max(0, exp?.ascensionExp ?? 0)
  const capped = Math.trunc((total / EXP_CAP) * 100)
  const rpa = exp?.rpa ?? 0
  const lumnis = exp?.lumnis ?? 0

  return (
    <div className="gsx-panel">
      {!exp ? (
        <div className="gsx-waiting" title="GemStone sends it at login and with every experience pulse.">
          No experience reading yet.
        </div>
      ) : (
        <>
          <div className="gsx-head">
            <span className="gsx-level">{level > 0 ? `Level ${level}` : 'Level —'}</span>
            {rpa > 0 && (
              <span className="gsx-chip" title={`Rapid Percentage Absorption: you absorb experience at ${rpa}× the normal rate.`}>RPA ×{rpa}</span>
            )}
            {lumnis > 0 && (
              <span className="gsx-chip" title={`Gift of Lumnis, stage ${lumnis}: bonus experience while it lasts.`}>Lumnis {lumnis}</span>
            )}
          </div>

          <div className="gsx-row" title="Field experience waiting to be absorbed, out of the most your mind can hold.">
            <span className="gsx-mind">{exp.mindText || 'Mind'}</span>
            {fieldMax > 0 && <span className="gsx-num">{fmt(exp.fieldExp ?? 0)} / {fmt(fieldMax)} ({fieldPct}%)</span>}
          </div>
          <Bar pct={fieldPct} cls="gsx-bar--mind" />

          {level > 0 && level < 100 && exp.nextLvlPercent !== undefined && (
            <>
              <div className="gsx-row" title="How far you are toward your next level.">
                <span>Toward level {level + 1}</span>
                <span className="gsx-num">{exp.nextLvlPercent}%</span>
              </div>
              <Bar pct={exp.nextLvlPercent} cls="gsx-bar--level" />
            </>
          )}

          <div className="gsx-stats">
            {exp.untilNext !== undefined && exp.untilNext > 0 && (
              level >= 100
                ? <Stat label="To next TP" value={fmt(exp.untilNext)} tip="Experience left until your next training point (past level 100, experience earns training points instead of levels)." />
                : <Stat label="To next level" value={fmt(exp.untilNext)} tip={`Experience left until level ${level + 1}.`} />
            )}
            {exp.totalExp !== undefined && <Stat label="Experience" value={fmt(exp.totalExp)} tip="Your experience total, without ascension experience." />}
            {exp.ascensionExp !== undefined && exp.ascensionExp > 0 && <Stat label="Ascension" value={fmt(exp.ascensionExp)} tip="Experience earned toward ascension abilities, after the level cap." />}
            {exp.ascensionExp !== undefined && exp.ascensionExp > 0 && <Stat label="Total" value={fmt(total)} tip="Experience plus ascension experience — the Total Exp line of EXP." />}
            {exp.ptps !== undefined && <Stat label="PTPs" value={fmt(exp.ptps)} tip={`Physical training points${exp.p2m ? ` (${fmt(exp.p2m)} converted to mental so far)` : ''}. Sent at login.`} />}
            {exp.mtps !== undefined && <Stat label="MTPs" value={fmt(exp.mtps)} tip={`Mental training points${exp.m2p ? ` (${fmt(exp.m2p)} converted to physical so far)` : ''}. Sent at login.`} />}
            {exp.atps !== undefined && <Stat label="ATPs" value={fmt(exp.atps)} tip="Ascension training points available to spend. Sent at login." />}
            {total > 0 && capped < 100 && <Stat label="Of cap" value={`${capped}%`} tip={`Your total experience as a share of the level-100 cap (${fmt(EXP_CAP)}).`} />}
          </div>
        </>
      )}

    </div>
  )
}

export default memo(GsExperiencePanel)
