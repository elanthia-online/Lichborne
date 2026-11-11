// VitalsBar — the health/mana/concentration/stamina/spirit bar strip, in
// regular or opt-in compact (acronym-label) form.
//
// Pure display: renders only the vitals present in the `vitals` prop, in fixed
// order. Guild-renamed vitals arrive through `labels` (the parser's
// progressbar customText — a Barbarian's "Inner Fire" mana); compact mode
// derives its acronym from that LIVE label (IF, not I), so don't replace the
// derivation with a fixed map.
//
// `text` is what each bar says beside its name, as in Wrayth: the percentage
// (the default), the game's own numbers ("310/355"; GemStone IV only — DR
// sends percentages, so `values` falls back to the percent there), or nothing
// (`label`: the fill carries the level). Whatever is not shown is in the
// tooltip, so the numbers are always one hover away.

import '../styles/vitalsbar.css'
import type { VitalsText } from '../settings'

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
  /** The text beside each name (Settings → Layout → Vitals bar text). */
  text?: VitalsText
  /** Whether `current`/`max` are the game's own numbers (GemStone IV). DR's
   *  vitals are already percentages (max 100), so `values` shows the percent. */
  hasValues?: boolean
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

/** A vital's numbers as the game sends them: "310/355". */
function valuesText(v: VitalState): string {
  return `${Math.round(v.current)}/${Math.round(v.max)}`
}

export default function VitalsBar({ vitals, labels, compact = false, thresholds = SESSION_HEALTH_THRESHOLDS, text = 'percent', hasValues = false }: Props) {
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
          const percent = `${Math.round(pct)}%`
          const showValues = text === 'values' && hasValues
          const shown = v.max <= 0 || text === 'label' ? '' : showValues ? valuesText(v) : percent
          // The full reading — name, percent and (GS4) the numbers — for the
          // tooltip whenever the bar text leaves any of it out.
          const full = v.max > 0 ? `${fullLabel}: ${percent}${hasValues ? ` (${valuesText(v)})` : ''}` : fullLabel
          // GS4 always hides one of the two readings (percent or numbers).
          const leftOut = compact || text === 'label' || hasValues
          return (
            // B333: compact mode shows only an acronym (H / M / IF…), so the
            // tooltip spells it out; so does any text mode that leaves the
            // percent or the numbers out.
            <div key={id} className="vital-bar" title={leftOut ? full : undefined}>
              <div className="vital-track">
                {/* Clamped fill only: GS4 mana can run above its max (558/508,
                    a mana boost; the game's own bar shows 100), and the text
                    beside it keeps the true percentage. */}
                <div className={vitalFillClass(id, pct, thresholds)} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className="vital-text">
                {/* GS4 support: shows the COMPUTED percentage, not raw
                    `current` — verified live against a real GS4 capture
                    (Ilten @ GST, 2026-08-27), whose health/mana/stamina/
                    spirit current/max are real numbers (e.g. 160/160), not
                    the 0-100 percentage DR's vitals always were. This is a
                    no-op for DR (max is always 100 there, so pct === current
                    already) and a real fix for GS4 (100%, not "160%"). */}
                {label}{shown ? `${sep}${shown}` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
