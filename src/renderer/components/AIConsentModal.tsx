import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import '../styles/ai-consent.css'

// One-time per-feature disclosure gate (DESIGN §10, guardrail #2). Nothing is
// sent to the AI provider until the user accepts this. Wears the shared About
// look (ui.css .ui-modal*, B400) so it holds up on light themes.
export default function AIConsentModal({ title, body, provider, onAccept, onDecline }: {
  title: string
  body: string
  provider: string
  onAccept: () => void
  onDecline: () => void
}) {
  // Esc declines, like Cancel, the ✕ and the backdrop: nothing is sent without
  // an explicit accept.
  useEscapeClose(onDecline)
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  // B397: focus lands on the panel, not on either button — a reflexive Enter
  // must never accept a disclosure the user hasn't read.
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }) }, [])
  return createPortal(
    <div className="aic-backdrop ui-modal-backdrop" {...backdropHandlers(() => onDecline())}>
      <div
        className="aic-modal ui-modal ui-modal--small"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ui-modal-head">
          <span className="ui-modal-title aic-title" id={titleId}>{title}</span>
          <button type="button" className="ui-close" onClick={onDecline} title="Close" aria-label="Close">✕</button>
        </div>
        <div className="ui-modal-body">
          <p>{body}</p>
          <p className="ui-modal-note">
            This sends recent game text (including player names) to <strong>{provider}</strong> to
            generate the result, <strong>billed to your own API key</strong>. Nothing is sent unless
            you accept. AI advises and summarizes — it never issues game commands.
          </p>
        </div>
        <div className="ui-modal-foot">
          <button type="button" className="ui-btn" onClick={onDecline}>Cancel</button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={onAccept}>Send &amp; continue</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
