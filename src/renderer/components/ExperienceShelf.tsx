import { useId, useRef } from 'react'
import { EXPERIENCES } from '../experiences'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import '../styles/experiences.css'

// The Experiences shelf (DESIGN.md §34.5) — the app-bar "Experiences" button
// opens this picker of registered Experiences with open/close toggles.
// Closing an Experience never loses anything (rects persist); reopening
// restores it where it was.
//
// B400/B404: a modal dialog (scrim + Esc + backdrop-close), so it wears the ONE
// dialog look — the shared `ui-modal-*` structure over the `--modal-*` tokens
// (UX standard #10) — and says so to assistive tech (`role="dialog"`,
// `aria-modal`, titled by its header). Only the shelf's own layout and rows are
// styled in experiences.css.
interface Props {
  openIds: Set<string>
  onToggle: (id: string) => void
  onClose: () => void
}

export default function ExperienceShelf({ openIds, onToggle, onClose }: Props) {
  // B341: Esc closes the shelf. Rendered inline in GameWindow (not portaled),
  // so pass the root — a hidden character tab's shelf has no layout box and is
  // skipped rather than closed behind the user's back.
  const rootRef = useRef<HTMLDivElement>(null)
  useEscapeClose(onClose, { ref: rootRef })
  const titleId = useId()
  return (
    <div ref={rootRef} className="ui-modal-backdrop exp-shelf-backdrop" {...backdropHandlers(() => onClose())}>
      <div className="ui-modal exp-shelf" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ui-modal-head">
          <span className="ui-modal-title" id={titleId}>Lichborne Experiences</span>
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>
        <div className="ui-modal-body exp-shelf-body">
          {EXPERIENCES.map(def => {
            const isOpen = openIds.has(def.id)
            return (
              <div key={def.id} className={`exp-shelf-row${isOpen ? ' exp-shelf-row--open' : ''}`}>
                <div className="exp-shelf-row-main">
                  <div className="exp-shelf-row-head">
                    <span className="exp-shelf-label">{def.label}</span>
                    {def.badge && <span className="exp-shelf-badge">{def.badge}</span>}
                  </div>
                  {/* Full "text equivalent" kept as a hover tooltip rather than a
                      visible line — it cluttered every row. */}
                  <div className="exp-shelf-desc" title={`Also available as text — ${def.textEquivalent}`}>{def.desc}</div>
                </div>
                {/* The accent (primary) chip marks an OPEN Experience, the same
                    state the row's accent border shows. The aria-label names the
                    Experience, since "Open"/"Close" alone doesn't say what. */}
                <button
                  type="button"
                  className={`ui-btn ui-btn--sm${isOpen ? ' ui-btn--primary' : ''}`}
                  aria-label={`${isOpen ? 'Close' : 'Open'} ${def.label}`}
                  onClick={() => onToggle(def.id)}
                >{isOpen ? 'Close' : 'Open'}</button>
              </div>
            )
          })}
        </div>
        <div className="ui-modal-note exp-shelf-note">Experiences add to your game text — they never replace it.</div>
      </div>
    </div>
  )
}
