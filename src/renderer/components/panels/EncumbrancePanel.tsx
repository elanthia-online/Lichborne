// GS4 Encumbrance panel — the game's `encum` dialog: the load level (0-100)
// with its name ("Light", "Heavy") and the game's own description of how the
// load affects you. A pure view over GameWindow's state from the parser's
// `gs-encumbrance` event. Its own panel, as in Saga 0.10.7; it shares the
// GS4 Experience panel's row and bar styling (gsx-*).
import { memo } from 'react'
import type { GsEncumbranceEvent } from '../../../shared/types'
import { Bar } from './GsExperiencePanel'

export type GsEncumbranceState = Omit<GsEncumbranceEvent, 'type'>

// The tint only echoes the game's own name, which carries the meaning: a
// light load reads as fine, a heavy one as a problem.
function encClass(level: number): string {
  return level <= 20 ? 'gsx-enc--ok' : level <= 50 ? 'gsx-enc--mid' : 'gsx-enc--heavy'
}

function EncumbrancePanel({ enc }: { enc: GsEncumbranceState | null }) {
  return (
    <div className="gsx-panel">
      {!enc ? (
        <div className="gsx-waiting" title="GemStone sends it at login and whenever your load changes.">
          No encumbrance reading yet.
        </div>
      ) : (
        <div className={encClass(enc.level)}>
          <div className="gsx-row" title="How much your load is slowing you, as the game reports it.">
            <span className="gsx-mind">{enc.text || 'None'}</span>
            <span className="gsx-num">{enc.level}%</span>
          </div>
          <Bar pct={enc.level} cls="gsx-bar--enc" />
          {enc.description && <div className="gsx-caption">{enc.description}</div>}
        </div>
      )}
    </div>
  )
}

export default memo(EncumbrancePanel)
