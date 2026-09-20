// Modal-backdrop close handlers — the shared mousedown+click pair a dialog spreads
// onto its backdrop div so "click the empty area" closes it.
//
// Closing requires BOTH the mousedown and the click to land on the backdrop
// element itself, so a text-selection drag that starts inside the dialog and
// ends on the backdrop can never dismiss it (the full reasoning is the comment
// below). Pure DOM-event logic with one module-level variable — no React state,
// no dependency on which modal is hosting it.
import type { MouseEvent } from 'react'

// Spread onto a modal's backdrop div: `<div className="…-backdrop" {...backdropHandlers(onClose)}>`.
//
// Fixes the "the window closes when I drag a text selection off it" bug: a
// `click` whose mousedown started INSIDE the modal (e.g. selecting text in a
// field) but whose mouseup lands on the backdrop fires with `target ===
// backdrop`, so the old `onClick` closed the modal and lost the user's work.
// We now close ONLY when the mousedown ALSO started on the backdrop itself — an
// actual click on the empty area, never a drag that ended there.
//
// It records the ELEMENT the press started on, not a "was it a backdrop?"
// boolean. A dialog can be rendered as a React child of another dialog's
// backdrop (Lich Setup inside Settings, the Add Account wizard's prompts), and
// then one mousedown bubbles through BOTH backdrops' handlers: a boolean was set
// true by the inner handler and immediately reset false by the outer one, so a
// click outside the inner dialog did nothing (visible once nested backdrops
// went transparent, B405). The target is the same for every handler the event
// passes through, so recording it is idempotent, and the outer backdrop's click
// check fails on its own because the target is not the outer element.
//
// One module-level variable is safe: only one mousedown→click sequence is ever
// in flight (the user has one mouse).
let downTarget: EventTarget | null = null

// Forget the press in flight, so the `click` that follows can't close a
// backdrop. A popover that dismisses itself on an outside mousedown calls this:
// the press already did its job (closing the popover) and must not ALSO be read
// as a press on the dialog underneath, or one click outside a color menu would
// close the menu AND the dialog hosting it. The React root's handler above runs
// first (it is attached below `document`), so by the time a document-level
// listener calls this, `downTarget` has already been recorded.
export function cancelBackdropPress(): void {
  downTarget = null
}

export function backdropHandlers(onClose: () => void, enabled = true) {
  return {
    onMouseDown: (e: MouseEvent) => { downTarget = e.target },
    onClick: (e: MouseEvent) => {
      if (enabled && downTarget === e.currentTarget && e.target === e.currentTarget) onClose()
    },
  }
}
