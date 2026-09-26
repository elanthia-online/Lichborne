// ToastHost (DESIGN.md §37.6) — renders the toast stack for this window.
// Mounted ONCE per BrowserWindow at the App root (each decoupled window runs its
// own renderer, so each gets its own host — same isolation as the theme hook).
// Listens for the `lichborne:toast` CustomEvent dispatched by showToast().
//
// v0.20.0:
//   - a toast with a `key` MERGES into the visible toast with that key (updated
//     in place, same position, timer restarted) rather than stacking;
//   - `people` render as coloured monogram badges — the character's chosen
//     colour (characterColors), else the Tableau colour (utils/nameColor) —
//     clickable when the toast itself isn't;
//   - hovering or focusing a toast holds it open, so it can't vanish while you
//     reach for a badge. Letting go gives back the time it had left — at least
//     LEAVE_GRACE_MS — so holding never shortens a toast.

import { useEffect, useRef, useState } from 'react'
import { TOAST_EVENT, type ToastOptions, type ToastPerson } from '../toasts'
import { monogramStyle, nameInitials } from '../utils/nameColor'
import { characterColor, useCharacterColors } from '../characterColors'
import '../styles/toasts.css'

interface ActiveToast {
  id: number
  opts: ToastOptions
  kind: NonNullable<ToastOptions['kind']>
  duration: number
}

const MAX_STACK = 5
/** Time left after the pointer leaves a toast it was holding open. */
const LEAVE_GRACE_MS = 2500

let toastId = 1

function durationOf(o: ToastOptions): number {
  return o.durationMs ?? ((o.kind ?? 'info') === 'error' ? 10000 : 4000)
}

// Hoisted (UX #4): a component defined inside the host's render would be a new
// type every render and remount its buttons, losing focus mid-Tab.
function PersonBadge({ p, onPick, withName }: { p: ToastPerson; onPick?: () => void; withName?: boolean }) {
  const chosen = characterColor(useCharacterColors(), { characterId: p.characterId, name: p.name })
  const mono = (
    <span className="toast-person-mono" style={monogramStyle(p.name, chosen)} aria-hidden="true">
      {nameInitials(p.name)}
    </span>
  )
  if (!onPick) return (
    <span className="toast-person">
      {mono}
      {withName && <span className="toast-person-name">{p.label ?? p.name}</span>}
    </span>
  )
  return (
    <button
      type="button"
      className="toast-person toast-person--chip"
      title={p.title ?? `Go to ${p.label ?? p.name}`}
      // Only the click needs stopping (the toast body would dismiss). Keys are
      // left alone: a chip only exists on a toast with no key handler of its
      // own, and swallowing them would eat Esc from the dialog underneath.
      onClick={e => { e.stopPropagation(); onPick() }}
    >
      {mono}
      <span className="toast-person-name">{p.label ?? p.name}</span>
    </button>
  )
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const toastsRef = useRef<ActiveToast[]>([])
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  // When each toast's timer fires, and what it had left when a hover or focus
  // paused it — so pausing never SHORTENS a toast. Hover and focus are held
  // SEPARATELY: one sharing flag let the mouse leaving re-arm a toast whose
  // chip still had keyboard focus, and it vanished under the focus.
  const deadlinesRef = useRef<Map<number, number>>(new Map())
  const heldRef = useRef<Map<number, { left: number; hover: boolean; focus: boolean }>>(new Map())

  const commit = (next: ActiveToast[]) => {
    toastsRef.current = next
    setToasts(next)
  }

  const clearTimer = (id: number) => {
    const h = timersRef.current.get(id)
    if (h) { clearTimeout(h); timersRef.current.delete(id) }
  }

  const forget = (id: number) => {
    clearTimer(id)
    deadlinesRef.current.delete(id)
    heldRef.current.delete(id)
  }

  const dismiss = (id: number) => {
    forget(id)
    commit(toastsRef.current.filter(x => x.id !== id))
  }

  const arm = (id: number, ms: number) => {
    clearTimer(id)
    heldRef.current.delete(id)
    deadlinesRef.current.set(id, Date.now() + ms)
    timersRef.current.set(id, setTimeout(() => {
      timersRef.current.delete(id)
      deadlinesRef.current.delete(id)
      commit(toastsRef.current.filter(x => x.id !== id))
    }, ms))
  }

  // Hover or keyboard focus holds a toast open...
  const hold = (id: number, by: 'hover' | 'focus') => {
    const h = heldRef.current.get(id)
    if (h) { h[by] = true; return }
    if (!timersRef.current.has(id)) return
    heldRef.current.set(id, {
      left: Math.max(0, (deadlinesRef.current.get(id) ?? 0) - Date.now()),
      hover: by === 'hover', focus: by === 'focus',
    })
    clearTimer(id)
  }
  // ...and letting go of BOTH gives back what it had left, never less than a
  // moment to read it.
  const release = (id: number, by: 'hover' | 'focus') => {
    const h = heldRef.current.get(id)
    if (!h) return
    h[by] = false
    if (h.hover || h.focus) return
    arm(id, Math.max(h.left, LEAVE_GRACE_MS))
  }

  // Show `opts` in place of toast `id` (a merge, or a person taken off it);
  // null dismisses it.
  const replace = (id: number, opts: ToastOptions | null) => {
    if (!opts) { dismiss(id); return }
    const updated: ActiveToast = { id, opts, kind: opts.kind ?? 'info', duration: durationOf(opts) }
    commit(toastsRef.current.map(t => (t.id === id ? updated : t)))
    // Held under the pointer or focus: stay held, with the fresh duration to
    // come back to.
    const h = heldRef.current.get(id)
    if (h) h.left = updated.duration
    else arm(id, updated.duration)
  }

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastOptions>).detail
      if (!d || !d.message) return
      const list = toastsRef.current
      const same = d.key ? list.find(t => t.opts.key === d.key) : undefined
      if (same) {
        // Update in place: same id (no re-entry animation), same position.
        const next = d.merge ? d.merge(same.opts) : d
        // A merge that changed nothing (a withdraw of someone not on it) must
        // not restart the toast's timer.
        if (next !== same.opts) replace(same.id, next)
        return
      }
      if (d.onlyIfShown) return
      const t: ActiveToast = { id: toastId++, opts: d, kind: d.kind ?? 'info', duration: durationOf(d) }
      // Full stack: make room by dropping the oldest toast NOT being held —
      // never the one under the pointer or holding keyboard focus.
      let kept = list
      while (kept.length >= MAX_STACK) {
        const victim = kept.find(x => !heldRef.current.has(x.id)) ?? kept[0]
        forget(victim.id)
        kept = kept.filter(x => x !== victim)
      }
      commit([...kept, t])
      arm(t.id, t.duration)
    }
    document.addEventListener(TOAST_EVENT, onToast)
    const timers = timersRef.current
    return () => {
      document.removeEventListener(TOAST_EVENT, onToast)
      for (const h of timers.values()) clearTimeout(h)
      timers.clear()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(t => {
        const o = t.opts
        const people = o.people ?? []
        const single = people.length === 1
        return (
          <div
            key={t.id}
            className={`toast toast--${t.kind}`}
            onClick={() => { dismiss(t.id); o.onClick?.() }}
            onMouseEnter={() => hold(t.id, 'hover')}
            onMouseLeave={() => release(t.id, 'hover')}
            onFocus={() => hold(t.id, 'focus')}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release(t.id, 'focus') }}
            title={o.clickHint ?? 'Click to dismiss'}
            // A toast that DOES something (go to a character) must be reachable
            // without the mouse (pitfall #142): a tab stop, and Enter/Space.
            {...(o.onClick ? {
              role: 'button',
              tabIndex: 0,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                dismiss(t.id)
                o.onClick?.()
              },
            } : {})}
          >
            {(o.title || single) && (
              <div className="toast-title">
                {single && <PersonBadge p={people[0]} />}
                {o.title && <span>{o.title}</span>}
              </div>
            )}
            {people.length > 1 && (
              <div className="toast-people">
                {people.map(p => (
                  <PersonBadge
                    // characterId, not name: the same name on DR and DR Test
                    // is two characters.
                    key={p.characterId ?? p.name}
                    p={p}
                    withName
                    // A clickable toast is one target; badges stay decoration.
                    // Clicking a badge takes that person OFF the toast (when
                    // the toast knows how) rather than throwing the rest away.
                    onPick={!o.onClick && p.onClick ? () => {
                      if (o.withoutPerson) replace(t.id, o.withoutPerson(p))
                      else dismiss(t.id)
                      p.onClick?.()
                    } : undefined}
                  />
                ))}
              </div>
            )}
            <div className="toast-message">{o.message}</div>
          </div>
        )
      })}
    </div>
  )
}
