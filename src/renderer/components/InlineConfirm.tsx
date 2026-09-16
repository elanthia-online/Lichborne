// InlineConfirm — the two-step destructive button (B401, v0.19.7).
//
// There are exactly TWO "are you sure?" shapes in Lichborne. This is the
// inline one, for when the thing being destroyed is the one already on screen:
// an editor's own footer Delete for the rule it is editing, a running script's
// Kill. Everything else — a row ✕, Reset to defaults, a bulk remove — asks
// through confirmAction() / confirmDelete() in confirm.ts.
//
// First click ARMS it: the button becomes the question plus a danger confirm
// and a Cancel, and focus moves to Cancel (the safe choice, as in ConfirmHost),
// so a reflexive Enter never destroys anything. Esc disarms WITHOUT closing
// the dialog underneath — preventDefault makes the useEscapeClose stack bail
// (pitfall #141). It also disarms when `resetKey` changes, e.g. when the
// editor selects another rule.
//
// Buttons default to the rem-sized `ui-btn` chrome, which suits dialogs. A
// game-area panel whose text scales with the font setting (pitfall #45) passes
// its own em-sized classes through `buttonClass` / `dangerClass` instead.
import { useEffect, useRef, useState } from 'react'

export default function InlineConfirm({
  label = 'Delete',
  question,
  confirmLabel = 'Delete',
  onConfirm,
  disabled,
  title,
  small,
  resetKey,
  buttonClass = 'ui-btn',
  dangerClass = 'ui-btn--danger',
}: {
  /** The resting button's text. */
  label?: string
  /** Shown while armed, e.g. "Delete this highlight?" */
  question: string
  confirmLabel?: string
  onConfirm: () => void
  disabled?: boolean
  /** Tooltip for the resting button. */
  title?: string
  /** Adds `ui-btn--sm` (only meaningful with the default classes). */
  small?: boolean
  /** Disarm whenever this changes. */
  resetKey?: unknown
  /** Base class for all three buttons. */
  buttonClass?: string
  /** Added to the resting button and the confirm button. */
  dangerClass?: string
}) {
  const [armed, setArmed] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setArmed(false) }, [resetKey])
  useEffect(() => { if (armed) cancelRef.current?.focus() }, [armed])

  const base = small && buttonClass === 'ui-btn' ? 'ui-btn ui-btn--sm' : buttonClass
  const danger = `${base} ${dangerClass}`

  if (!armed) {
    return (
      <button type="button" className={danger} disabled={disabled} title={title} onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }
  return (
    <span
      className="ui-inline-confirm"
      role="group"
      aria-label={question}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); setArmed(false) }
      }}
    >
      <span className="ui-inline-confirm-text">{question}</span>
      <button type="button" className={danger} onClick={() => { setArmed(false); onConfirm() }}>
        {confirmLabel}
      </button>
      <button type="button" ref={cancelRef} className={base} onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  )
}
