// NumberField — the one number input (v0.20.4). A plain controlled
// <input type="number"> decides on EVERY keystroke whether what is typed so far
// is a finished number, so a half-typed value is treated as final: backspacing
// "12" leaves "1" and a clamp snaps it to the minimum, an empty box is refused
// or saved as 0, and "365" passes through 3 and 36 on the way. Every numeric
// field in the app had a variant of that, so they all use this instead
// (UX standard #12: one control, not per-dialog copies).
//
// The box holds exactly what you type, as a DRAFT, and only a committed value
// reaches `onCommit`:
//   • Enter, blur, ↑/↓, or the spinner arrows commit; an out-of-range number
//     is clamped then, and the box shows the clamped value.
//   • Esc puts back the value the field had when you started editing (even
//     in `live` mode, where typing has already been committed). An empty or
//     invalid draft on blur reverts to the last committed value. Never the
//     default, never the minimum.
//   • `live` also commits while typing, but only a draft that is already a
//     valid, in-range number. Use it for previews and editor drafts; leave it
//     off where a passing value would do something (log retention).
//
// Esc is preventDefault'ed only when there is a draft to throw away, so a
// clean field still lets Esc close its dialog (pitfall #141).
import { useState, type CSSProperties } from 'react'

export interface NumberFieldProps {
  value: number
  onCommit: (n: number) => void
  min: number
  max: number
  step?: number
  /** Decimal places kept (0 = whole numbers, the default). */
  decimals?: number
  /** Commit valid in-range values while typing, not just on Enter/blur. */
  live?: boolean
  className?: string
  id?: string
  title?: string
  disabled?: boolean
  style?: CSSProperties
  'aria-label'?: string
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

export default function NumberField({
  value: valueIn, onCommit, min, max, step = 1, decimals = 0, live = false,
  className, id, title, disabled, style, 'aria-label': ariaLabel,
}: NumberFieldProps) {
  // A rule saved by an older build can lack the field (a macro's `delayMs`),
  // and a NaN would otherwise survive a ↑/↓ step and be saved as null. Treat a
  // non-number as the minimum.
  const value = Number.isFinite(valueIn) ? valueIn : min
  const [draft, setDraft] = useState<string | null>(null)
  // The value when editing began, for Esc. `live` commits as you type, so the
  // prop alone no longer remembers it.
  const [start, setStart] = useState<number | null>(null)

  // Number(), not parseInt: Chromium accepts "1e3" as a number, which parseInt
  // read as 1. Whole-number fields round rather than truncate (12.7 → 13).
  const parse = (raw: string): number | null => {
    if (raw.trim() === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return decimals > 0 ? n : Math.round(n)
  }
  const clamp = (n: number) => roundTo(Math.max(min, Math.min(max, n)), decimals)
  const send = (n: number) => { if (n !== value) onCommit(n) }

  // What a commit would store right now: the clamped draft, or the current
  // value when the draft is empty or invalid (that reverts).
  const committed = (): number => {
    const n = draft === null ? null : parse(draft)
    return n === null ? value : clamp(n)
  }

  // Enter / blur: clamp a real number, revert anything else. The committed
  // value becomes the new Esc point, so Esc after an Enter doesn't undo it.
  const commit = () => {
    if (draft === null) return
    const next = committed()
    send(next)
    setStart(next)
    setDraft(null)
  }

  // ↑/↓ move to the next point on the step grid, like the native spinner
  // (37 with step 50 goes to 50, not 87).
  const stepBy = (dir: 1 | -1) => {
    const base = (draft !== null ? parse(draft) : null) ?? value
    const eps = 1e-9
    const next = dir > 0
      ? (Math.floor(base / step + eps) + 1) * step
      : (Math.ceil(base / step - eps) - 1) * step
    send(clamp(next))
    setStart(clamp(next))   // a step is a commit: Esc mustn't undo it
    setDraft(null)
  }

  const shown = decimals > 0 ? String(roundTo(value, decimals)) : String(value)

  return (
    <input
      type="number"
      id={id}
      className={className}
      title={title}
      style={style}
      aria-label={ariaLabel}
      disabled={disabled}
      min={min} max={max} step={step}
      value={draft ?? shown}
      onChange={e => {
        const raw = e.target.value
        const n = parse(raw)
        // A spinner click (or wheel) arrives as a plain Event; typing arrives
        // as an InputEvent. A step is a deliberate value, so commit it now.
        if (!(e.nativeEvent instanceof InputEvent)) {
          if (n !== null) { send(clamp(n)); setStart(clamp(n)) }
          setDraft(null)
          return
        }
        setDraft(raw)
        if (live && n !== null && n >= min && n <= max) send(roundTo(n, decimals))
      }}
      onFocus={() => setStart(value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          // An editor around this field may save on Enter (enterToSave) — and
          // its handler runs in this same keydown with the value from BEFORE
          // this commit, so it saved a stale number (a delay typed as 40000
          // saved the last live value, 4000). When this Enter changes the
          // value, it stops here: the first Enter commits, the next one saves.
          if (draft !== null && committed() !== value) { e.preventDefault(); e.stopPropagation() }
          commit()
        }
        else if (e.key === 'Escape' && draft !== null) {
          e.preventDefault()
          if (start !== null) send(start)
          setDraft(null)
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          stepBy(e.key === 'ArrowUp' ? 1 : -1)
        }
      }}
    />
  )
}
