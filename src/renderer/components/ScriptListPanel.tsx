// ScriptListPanel — the Lich Scripts panel: the `lichScripts` PanelFrame tab
// listing the Lich scripts currently RUNNING for this session, with
// pause / resume / kill (kill asks first, through InlineConfirm) and a manual
// refresh.
//
// Pure view over props. PanelFrame feeds it `scripts` / `lastUpdated` /
// `pending` and the action callbacks from `useLichBridge`, whose `;listall`
// poll only INJECTS while a Lich Scripts panel is open (the Idea A gate in
// useLichBridge.ts — an unwatched poll can be mis-captured by a script's
// UpstreamHook as typed input). A 1s tick re-renders the uptime / "ago"
// readouts. It is a PANEL, so `.sl-panel` (lich-panels.css) anchors to the
// panel font and sizes children in `em` — the Lich Dashboard MODAL is the one
// that stays `rem`. (`.sl-` is this panel's prefix alone; the Session Log that
// used to share it is `.slog-` since B367.)

import { useState, useEffect } from 'react'
import type { ScriptRecord } from '../../shared/types'
import { formatAgo } from '../utils/formatAgo'
import { formatUptime } from '../utils/formatUptime'
import InlineConfirm from './InlineConfirm'
import '../styles/lich-panels.css'

interface Props {
  scripts:       ScriptRecord[]
  lastUpdated:   number
  pending:       boolean
  onPause:       (name: string) => void
  onResume:      (name: string) => void
  onKill:        (name: string) => void
  onRefresh:     () => void
}

export default function ScriptListPanel({ scripts, lastUpdated, pending, onPause, onResume, onKill, onRefresh }: Props) {
  const [tick, setTick] = useState(0)

  // Tick every second to keep uptime and "ago" displays live
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Suppress TS unused-var warning for tick — it drives the re-render
  void tick
  const now = Date.now()

  // Has Lich EVER answered a poll on this connection? (useLichBridge resets
  // lastUpdated to 0 on disconnect.) B385: this used to key on `!pending &&
  // !lastUpdated`, so while the first poll was in flight the body claimed "No
  // scripts running" before anything had been asked, and a session Lich never
  // answers flipped between two messages every 5s as each poll went pending
  // and timed out. Keying on "answered" alone gives one stable message until
  // there is a real list to show.
  const answered = lastUpdated > 0

  return (
    <div className="sl-panel">
      <div className="sl-header">
        {/* B392: the tab says "Lich Scripts", so the header names the same thing
            (it said "Active Scripts"). */}
        <span className="sl-header-title">Lich Scripts</span>
        <button
          type="button"
          className={`sl-refresh${pending ? ' sl-refresh--spinning' : ''}`}
          onClick={onRefresh}
          title={pending ? 'Already checking — waiting for Lich to reply' : 'Refresh the script list now'}
          aria-label="Refresh the script list"
          disabled={pending}
        >↻</button>
      </div>

      <div className="sl-body">
        {!answered && (
          <div className="sl-empty">
            Waiting for Lich — running scripts show here once it replies. This needs a connection through Lich.
          </div>
        )}
        {answered && scripts.length === 0 && (
          <div className="sl-empty">
            No scripts running. Use <code>;scriptname</code> to start one.
          </div>
        )}
        {scripts.map(s => (
          <div key={s.name} className={`sl-row${s.paused ? ' sl-row--paused' : ''}${s.killing ? ' sl-row--killing' : ''}`}>
            {/* Badge mirrors Lich's folder layout: everything is a Script (S);
                a script in the `custom/` folder is a Custom script (C). */}
            <span
              className={`sl-badge${s.custom ? ' sl-badge--custom' : ' sl-badge--core'}`}
              title={s.custom ? 'Custom script (custom/ folder)' : 'Script'}
            >
              {s.custom ? 'C' : 'S'}
            </span>
            <span className="sl-name">{s.name}</span>
            <span className={`sl-status${s.killing ? ' sl-status--killing' : s.paused ? ' sl-status--paused' : ' sl-status--running'}`}>
              {s.killing ? 'killing' : s.paused ? 'paused' : 'running'}
            </span>
            {/* B394: the same "1h 23m" reading the Overview cards use. */}
            <span className="sl-uptime" title="How long this script has been running">{formatUptime(now - s.firstSeen)}</span>
            <div className="sl-actions">
              {!s.killing && (
                s.paused
                  ? <button type="button" className="sl-btn sl-btn--resume" onClick={() => onResume(s.name)} title="Resume">▶</button>
                  : <button type="button" className="sl-btn sl-btn--pause"  onClick={() => onPause(s.name)}  title="Pause">⏸</button>
              )}
              {/* B401 / B395: the one inline "are you sure" shape, replacing the
                  bespoke "Kill? Yes/No" (whose Yes was white-on-danger). Game-area
                  panel, so the em-sized .sl-btn classes ride through instead of
                  the rem ui-btn (pitfall #45). */}
              {s.killing
                ? <button type="button" className="sl-btn sl-btn--kill" disabled title="Killing — waiting for Lich to stop it">✕</button>
                : <InlineConfirm
                    label="✕"
                    title={`Kill ${s.name}`}
                    // Just "Kill?" — the row already names the script, and the
                    // full name in the question overflowed a narrow docked
                    // panel, pushing the buttons off the right edge.
                    question="Kill?"
                    confirmLabel="Kill"
                    onConfirm={() => onKill(s.name)}
                    buttonClass="sl-btn"
                    dangerClass="sl-btn--kill"
                  />
              }
            </div>
          </div>
        ))}
      </div>

      {/* B385: only claim what's true in each state — a count and a poll
          cadence mean nothing until Lich has answered at least once. */}
      <div className="sl-footer">
        {answered
          ? <>{scripts.length} script{scripts.length !== 1 ? 's' : ''} · updated {formatAgo(lastUpdated, now)} · polls every 5s</>
          : 'No reply from Lich yet'}
      </div>
    </div>
  )
}
