// ConfirmHost — renders the confirmAction() queue for this window (B370 / B377 /
// B401, v0.19.7).
//
// Mounted ONCE per BrowserWindow at the App root beside ToastHost. Shows the
// head of the queue in the canonical modal chrome (the About look, via the
// shared `.ui-modal*` classes in global.css), portaled to <body> at the
// "confirm" tier (2080 — above every dialog it can be opened from, below
// context menus, pitfall #118(d)). Esc and a backdrop click cancel. The SAFE
// button takes focus — Cancel on a danger confirm — so a reflexive Enter never
// destroys anything. Each request mounts a fresh ConfirmDialog (keyed by id),
// so its useEscapeClose entry lands on top of the stack.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { getConfirmSnapshot, settleConfirm, subscribeConfirm, type ConfirmRequest } from '../confirm'
import { setDialogHomeFocus, useEscapeClose } from '../hooks/useEscapeClose'
import { backdropHandlers } from '../utils/backdropClose'

// `homeFocus` is where the caret belongs when no dialog is open (B376). The
// host registers it with the dialog stack in useEscapeClose, which calls it
// when the last dialog closes and focus has been left nowhere. App passes it
// because only App knows the active session and whether the Overview is up.
export default function ConfirmHost({ homeFocus }: { homeFocus?: () => void }) {
  const homeRef = useRef(homeFocus)
  homeRef.current = homeFocus
  useEffect(() => {
    setDialogHomeFocus(() => homeRef.current?.())
    return () => setDialogHomeFocus(null)
  }, [])
  const req = useSyncExternalStore(subscribeConfirm, getConfirmSnapshot)
  if (!req) return null
  return createPortal(<ConfirmDialog key={req.id} req={req} />, document.body)
}

// A confirm opened while ANOTHER confirm still holds focus (they queue)
// inherits that one's return target, because the button it would otherwise
// remember is about to be removed.
let carriedReturnTo: HTMLElement | null = null

function ConfirmDialog({ req }: { req: ConfirmRequest }) {
  // Where focus was when the confirm opened (read at first render, before the
  // autoFocus below moves it) — handed back when the confirm settles, so the
  // dialog underneath keeps keyboard focus instead of dropping to <body>.
  const [returnTo] = useState(() => {
    const a = document.activeElement as HTMLElement | null
    return a?.closest('.ui-confirm-backdrop') ? carriedReturnTo : a
  })
  const settle = (ok: boolean) => {
    carriedReturnTo = returnTo
    settleConfirm(req.id, ok)
    requestAnimationFrame(() => {
      // Another confirm is up now, and its own autoFocus owns the keyboard.
      if (getConfirmSnapshot()) return
      // The confirmed action may have put focus somewhere on purpose — "+ New"
      // focusing its name field — so only hand focus back when it was left
      // nowhere. Restoring unconditionally stole it back to the button.
      const a = document.activeElement
      if (a && a !== document.body && a.isConnected) return
      if (returnTo && returnTo !== document.body && returnTo.isConnected && returnTo.getClientRects().length > 0) {
        returnTo.focus()
      }
    })
  }
  useEscapeClose(() => settle(false))
  const titleId = `ui-confirm-title-${req.id}`
  return (
    <div className="ui-modal-backdrop ui-confirm-backdrop" {...backdropHandlers(() => settle(false))}>
      <div className="ui-modal ui-modal--small" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ui-modal-head">
          <span className="ui-modal-title" id={titleId}>{req.title}</span>
        </div>
        {(req.message || req.detail) && (
          <div className="ui-modal-body">
            {req.message && <div className="ui-confirm-message">{req.message}</div>}
            {req.detail && <div className="ui-modal-note">{req.detail}</div>}
          </div>
        )}
        <div className="ui-modal-foot">
          <button type="button" className="ui-btn" onClick={() => settle(false)} autoFocus={!!req.danger}>
            {req.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={`ui-btn ${req.danger ? 'ui-btn--danger' : 'ui-btn--primary'}`}
            onClick={() => settle(true)}
            autoFocus={!req.danger}
          >
            {req.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
