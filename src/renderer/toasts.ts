// Toast notifications (DESIGN.md §37.6) — a tiny no-dependency dispatch layer so
// ANY module (React or not — e.g. characterScope's quota guard) can surface a
// non-blocking notice. showToast() fires a CustomEvent; the ToastHost component
// (mounted once per window at the App root) listens and renders the stack.
// Deliberately fire-and-forget: if no host is mounted yet (very early startup),
// the toast is dropped — callers that MUST be heard also console.error.

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

/** A person a toast is about, drawn as a coloured monogram badge: the colour
 *  you chose for that character in Edit Profile, else the same colour as their
 *  Living Tableau avatar (utils/nameColor). */
export interface ToastPerson {
  name: string
  /** What the badge says, when it should differ from `name` (e.g. the same
   *  character on two shards: "Sekmeht (DRT)"). The initials and colour always
   *  come from `name`. */
  label?: string
  /** One of YOUR characters: its chosen colour (Edit Profile) paints the badge.
   *  Without it, a chosen colour is still found by name. */
  characterId?: string
  /** When set, the badge is a button (e.g. "go to this character"). Only
   *  honoured on a toast WITHOUT its own onClick — a clickable toast is one
   *  target, not several. */
  onClick?: () => void
  title?: string
}

export interface ToastOptions {
  kind?: ToastKind      // default 'info'
  title?: string        // optional bold first line
  message: string
  durationMs?: number   // default: 4000 (info/success/warning), 10000 (error)
  /** Run when the toast is clicked (it's dismissed either way). v0.20.0:
   *  character notices use it to go to the character. */
  onClick?: () => void
  /** Hover text for a clickable toast. Default "Click to dismiss". */
  clickHint?: string
  /** Who the toast is about. One person renders as a badge before the title;
   *  several render as a row of badges under it. */
  people?: ToastPerson[]
  /** Toasts sharing a key MERGE while one is still on screen: the visible toast
   *  is updated in place (and its timer restarted) instead of a new one
   *  stacking. v0.20.0: several characters dropping at once is ONE toast. */
  key?: string
  /** How to combine with the visible toast of the same key. Given that toast's
   *  options, returns the options to show. Without it, the new toast replaces
   *  the old one. */
  merge?: (prev: ToastOptions) => ToastOptions | null
  /** The caller's own bookkeeping, carried untouched so `merge` can read it. */
  data?: unknown
  /** Only UPDATE a toast already on screen with this `key` — never show a new
   *  one. A `merge` returning null then dismisses it. (Taking a character off a
   *  "disconnected" toast when it reconnects, without ever raising one.) */
  onlyIfShown?: boolean
  /** A person's badge was clicked: what the toast becomes without them, or null
   *  to dismiss it. Without this, clicking a badge dismisses the whole toast. */
  withoutPerson?: (p: ToastPerson) => ToastOptions | null
}

export const TOAST_EVENT = 'lichborne:toast'

export function showToast(opts: ToastOptions): void {
  try {
    document.dispatchEvent(new CustomEvent<ToastOptions>(TOAST_EVENT, { detail: opts }))
  } catch { /* never throw from a notification */ }
}
