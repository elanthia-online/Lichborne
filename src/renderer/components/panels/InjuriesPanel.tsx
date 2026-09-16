// Injuries panel — a read-only list of wounded/scarred body parts, grouped by
// the `SECTIONS` tables in injuryParse.ts.
//
// Pure view: it takes GameWindow's `InjuryState` (per-part `<image name>` from
// DR's `injuries` dialog) and runs every part through the SHARED `parseInjury`
// (the Lich-mirroring parser that also feeds the Overview card, B224) — this
// file deliberately owns no parsing of its own. Two display rules it upholds:
// a SCAR is healed history, not damage, so it renders on the muted
// `injury-scar` class with the scar label; and "No active wounds." is shown
// whenever no WOUND is present, even if scars remain.
import type { InjuryState } from '../../../shared/types'
// v0.19.0: the part tables, the Lich-mirroring parser and its B224 reasoning
// moved to a shared module so the Overview card summarises wounds the same way
// this panel lists them. Duplicating that logic is exactly how B224 happened.
import {
  SECTIONS, PART_LABELS, parseInjury, WOUND_CLASS, WOUND_LABEL, SCAR_LABEL,
} from '../../injuryParse'

interface Props {
  parts: InjuryState
}

export default function InjuriesPanel({ parts }: Props) {
  const state: Record<string, { wound: number; scar: number }> = {}
  for (const [id, p] of Object.entries(parts)) state[id] = parseInjury(p.name)
  const anyWound = Object.values(state).some(s => s.wound > 0)
  const anyScar  = Object.values(state).some(s => s.scar > 0)
  // An empty parts map is the NORMAL reading for an unhurt character, not "no
  // data yet": DR pushes its injuries dialog when something CHANGES, so a
  // healthy character may never send one (a full captured login session
  // contains none). B385 briefly made this say "Waiting for injury data", which
  // then sat there all session — wrong in the common case, where the old
  // affirmative line was right. It stays, with a tooltip saying when it moves.
  // Once a dialog lands, the B224 wound-vs-scar rules below take over unchanged.
  const noData = Object.keys(parts).length === 0

  return (
    <div className="injuries-panel">
      {noData ? (
        <div className="injuries-clear" title="Wounds appear here as the game reports them.">No active wounds.</div>
      ) : !anyWound && !anyScar ? (
        <div className="injuries-clear">No active wounds.</div>
      ) : (
        <>
          {!anyWound && <div className="injuries-clear">No active wounds.</div>}
          {SECTIONS.map(({ label, ids }) => {
            // Wounds first, then scars — a scar is history, not damage.
            const rows = ids.filter(id => state[id] && (state[id].wound > 0 || state[id].scar > 0))
            if (rows.length === 0) return null
            return (
              <div key={label} className="injuries-section">
                <div className="injuries-section-label">{label}</div>
                {rows.map(id => {
                  const { wound, scar } = state[id]
                  const isScar = wound === 0
                  return (
                    <div key={id} className={`injuries-part ${isScar ? 'injury-scar' : WOUND_CLASS[wound]}`}>
                      <span className="injuries-part-name">{PART_LABELS[id] ?? id}</span>
                      <span className="injuries-part-severity">
                        {isScar ? SCAR_LABEL[scar] : WOUND_LABEL[wound]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
