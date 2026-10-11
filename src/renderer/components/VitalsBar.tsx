// VitalsBar — the health/mana/concentration/stamina/spirit bar strip, in
// regular or opt-in compact (acronym-label) form.
//
// Pure display: renders only the vitals present in the `vitals` prop, in fixed
// order. Guild-renamed vitals arrive through `labels` (the parser's
// progressbar customText — a Barbarian's "Inner Fire" mana); compact mode
// derives its acronym from that LIVE label (IF, not I), so don't replace the
// derivation with a fixed map.

import '../styles/vitalsbar.css'

interface VitalState {
  current: number
  max: number
}

/** The two health boundaries a band is cut at. Structurally the same fields as
 *  the Overview's `AttentionThresholds`, so a card can pass its options as-is. */
export interface HealthThresholds {
  healthCritPct: number
  healthLowPct: number
}

interface Props {
  vitals: Record<string, VitalState>
  labels?: Record<string, string>
  compact?: boolean
  /** B382: the boundaries the health fill's colour bands are cut at. The
   *  Overview card passes its configurable attention thresholds so its bar and
   *  its header percentage (and its Critical/Hurt chips) agree; omitted, the
   *  game window's bar keeps its long-standing bands. */
  thresholds?: HealthThresholds
}

const VITAL_ORDER = ['health', 'mana', 'concentration', 'stamina', 'spirit'] as const
const VITAL_LABELS: Record<string, string> = {
  health: 'Health', mana: 'Mana', concentration: 'Concentration', stamina: 'Stamina', spirit: 'Spirit',
}

/** Above the low threshold there is one more, quieter band before "fine". It
 *  has no flag behind it on either surface — a gradient toward trouble. */
export const HEALTH_WARN_PCT = 80

/** The game window's bands, unchanged since they shipped. Deliberately NOT the
 *  Overview's thresholds (B382): those are Overview options, set with
 *  `/view set`, and recolouring the Session bar from an Overview command would
 *  be a surprising reach across views. */
export const SESSION_HEALTH_THRESHOLDS: HealthThresholds = { healthCritPct: 30, healthLowPct: 50 }

export type HealthBand = 'crit' | 'low' | 'mid' | 'ok'

/**
 * B382: the ONE place a health percentage becomes a colour band. The Overview
 * card's header percentage and its vitals bar both come through here with the
 * same thresholds, so one card can never show two health colours again (the
 * bar used a hardcoded 30/50/80 while the header used the configurable ones).
 */
export function healthBand(pct: number, t: HealthThresholds): HealthBand {
  if (pct < t.healthCritPct) return 'crit'
  if (pct < t.healthLowPct)  return 'low'
  if (pct < HEALTH_WARN_PCT) return 'mid'
  return 'ok'
}

function vitalFillClass(id: string, pct: number, t: HealthThresholds): string {
  if (id === 'health') return `vital-fill vital-fill--health-${healthBand(pct, t)}`
  return `vital-fill vital-fill--${id}`
}

export default function VitalsBar({ vitals, labels, compact = false, thresholds = SESSION_HEALTH_THRESHOLDS }: Props) {
  return (
    <div className={`vitals-strip${compact ? ' vitals-strip--compact' : ''}`}>
      <div className="vitals-row">
        {VITAL_ORDER.filter(id => vitals[id] !== undefined).map(id => {
          const v = vitals[id]
          const pct = v.max > 0 ? (v.current / v.max) * 100 : 0
          const fullLabel = labels?.[id] ?? VITAL_LABELS[id]
          // Compact derives an acronym from the live label — first letter of
          // each word: Health→H, Mana→M, Concentration→C, Fatigue→F, Spirit→S.
          // Building it from the label (not a fixed map) means guild renames
          // sent via customText='t' come through correctly — a Barbarian's
          // "Inner Fire" mana becomes IF, not just I. (StormFrontParser sends
          // the full label; see the progressbar customText handler.)
          const label = compact
            ? fullLabel.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase()).join('')
            : fullLabel
          const sep = compact ? ': ' : ' '
          return (
            // B333: compact mode shows only an acronym (H / M / IF…), so the
            // tooltip spells it out; regular mode already shows the full name.
            <div key={id} className="vital-bar"
              title={compact ? `${fullLabel}${v.max > 0 ? `: ${v.current}%` : ''}` : undefined}>
              <div className="vital-track">
                <div className={vitalFillClass(id, pct, thresholds)} style={{ width: `${pct}%` }} />
              </div>
              <span className="vital-text">
                {/* GS4 support: shows the COMPUTED percentage, not raw
                    `current` — verified live against a real GS4 capture
                    (Ilten @ GST, 2026-08-27), whose health/mana/stamina/
                    spirit current/max are real numbers (e.g. 160/160), not
                    the 0-100 percentage DR's vitals always were. This is a
                    no-op for DR (max is always 100 there, so pct === current
                    already) and a real fix for GS4 (100%, not "160%"). */}
                {label}{v.max > 0 ? `${sep}${Math.round(pct)}%` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
