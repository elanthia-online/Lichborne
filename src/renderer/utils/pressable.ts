// pressable — keyboard parity for a clickable element that isn't a <button> (B335, v0.19.7).
//
// A clickable div/span can't be reached with Tab and ignores Enter/Space.
// Spread `pressable(onPress)` onto it to give it a role, a tab stop, and
// Enter/Space activation; the global :focus-visible ring (global.css) then
// shows on keyboard focus with no per-component CSS. Prefer a real <button>
// where the markup allows it — this is for rows, tabs and cards whose layout a
// button would disturb.
//
// Keys pressed on a NESTED control (a delete ✕ inside a row, an input in a
// tab) are ignored here: `e.target !== e.currentTarget`, so the child keeps
// its own Enter/Space.
import type { KeyboardEvent } from 'react'

export function activateOnKey(onPress: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPress()
    }
  }
}

export function pressable(
  onPress: () => void,
  opts: { role?: 'button' | 'tab' | 'option' | 'menuitem'; selected?: boolean; disabled?: boolean } = {},
) {
  const role = opts.role ?? 'button'
  return {
    role,
    tabIndex: opts.disabled ? -1 : 0,
    'aria-disabled': opts.disabled ? true : undefined,
    'aria-pressed': role === 'button' ? opts.selected : undefined,
    'aria-selected': role === 'tab' || role === 'option' ? opts.selected : undefined,
    onClick: opts.disabled ? undefined : () => onPress(),
    onKeyDown: opts.disabled ? undefined : activateOnKey(onPress),
  }
}
