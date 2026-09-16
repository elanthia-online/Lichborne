// useEscapeClose — Esc closes the TOPMOST open dialog, and only that one (B341, v0.19.7).
//
// Every dialog calls `useEscapeClose(onClose)` once. Registrations form a
// mount-ordered stack, and ONE window-level keydown listener closes the most
// recently mounted live entry and stops the key there — so a single Esc can
// never close two dialogs (it used to, where two dialogs each had their own
// document listener).
//
// Why the WINDOW BUBBLE phase, not document capture: it is the last stop a
// keydown makes, so everything nearer the target gets first refusal — a search
// box clearing its text, the slash palette, a dropdown or context menu inside
// the dialog, and the Quit confirmation's capture-phase handler (z 10000, it
// must always win). Any of those that consumes Esc must call preventDefault()
// or stopPropagation(); this listener then leaves the key alone. The rule for
// new code: if you handle Escape yourself, preventDefault it.
//
// `enabled: false` means "this is not a dialog right now" — the entry is
// SKIPPED and Esc falls through to the dialog beneath (a rule editor embedded
// inside Automations, Quick Send with nothing to show). It is NOT the way to
// ignore Esc while a dialog is busy: to swallow the key during a save or an
// attach, keep the entry enabled and pass a close that does nothing while busy
// (`() => { if (!busy) onCancel() }`), mirroring a disabled ✕. Pass `ref` for
// a dialog that is NOT portaled to document.body: a hidden character tab stays
// mounted (pitfall #24), so its inline dialogs stay registered, and an entry
// whose element has no layout box is skipped rather than closed behind the
// user's back.
//
// FOCUS (B375 / B376). The stack is also the one place that knows when the
// first dialog opens and the last one closes, so it owns two focus rules:
//  - When a dialog opens over NO other dialog and the command bar (or the
//    Overview's input bar) still holds focus, that input is blurred. A dialog
//    opened from the native menu or a slash command used to leave the caret in
//    the covered bar, so typing went nowhere visible and Enter reached the game.
//  - When the last live dialog closes and focus has been left nowhere (<body>)
//    or on the app-bar button that opened it, the registered home-focus
//    callback runs — App's, which puts the caret back in the active command bar
//    (or the Overview input bar). It runs a frame later, so a dialog with its
//    own restore (Quick Send, B343) acts first and wins.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

interface Entry {
  close: { current: () => void }
  enabled: { current: boolean }
  el: { current: RefObject<HTMLElement | null> | undefined }
}

const stack: Entry[] = []

function isLive(entry: Entry): boolean {
  if (!entry.enabled.current) return false
  const ref = entry.el.current
  if (ref) {
    const node = ref.current
    if (!node || node.getClientRects().length === 0) return false
  }
  return true
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i]
    if (!isLive(entry)) continue
    e.preventDefault()
    e.stopPropagation()
    entry.close.current()
    return
  }
}

export function useEscapeClose(
  onClose: () => void,
  opts: { enabled?: boolean; ref?: RefObject<HTMLElement | null> } = {},
): void {
  const close = useRef(onClose)
  const enabled = useRef(opts.enabled ?? true)
  const el = useRef(opts.ref)
  // Latest-closure refs, refreshed after every commit so the stack entry never
  // calls a stale onClose (pitfall #31) and its position in the stack — which
  // is its mount order — never changes when the props do.
  useLayoutEffect(() => {
    close.current = onClose
    enabled.current = opts.enabled ?? true
    el.current = opts.ref
  })
  useEffect(() => {
    const entry: Entry = { close, enabled, el }
    const firstLive = !stack.some(isLive)
    stack.push(entry)
    if (stack.length === 1) window.addEventListener('keydown', onKeyDown)
    if (firstLive && isLive(entry)) blurCoveredInput()
    return () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKeyDown)
      if (!stack.some(isLive)) scheduleHomeFocus()
    }
  }, [])
}

// ── Focus (B375 / B376) ──────────────────────────────────────────────────────

let homeFocus: (() => void) | null = null

/** App registers where the caret belongs when no dialog is open. */
export function setDialogHomeFocus(fn: (() => void) | null): void {
  homeFocus = fn
}

// The inputs a dialog covers: the session command bar and the Overview's bar.
const COVERED_INPUTS = '.command-input, .ov-inputbar-input'

function blurCoveredInput(): void {
  const a = document.activeElement
  if (a instanceof HTMLElement && a.matches(COVERED_INPUTS)) a.blur()
}

function scheduleHomeFocus(): void {
  // A frame later: the dialog's DOM is gone by then, and a dialog that restores
  // focus itself (Quick Send) has already done so — this only fills the gap.
  // StrictMode's dev remount pushes the entry straight back, so the live check
  // below also stops this firing for a dialog that never actually closed.
  requestAnimationFrame(() => {
    if (!homeFocus || stack.some(isLive)) return
    const a = document.activeElement
    const lost = !a || a === document.body || !(a as HTMLElement).isConnected
    const onOpener = a instanceof HTMLElement && a.closest('.app-bar') !== null
    if (lost || onOpener) homeFocus()
  })
}
