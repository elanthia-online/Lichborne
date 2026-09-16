// confirm — the ONE themed "are you sure?" dialog (B370 / B377 / B401, v0.19.7).
//
// Every destructive action that isn't an editor's own footer Delete asks
// through here, so there is one look, one wording shape and one keyboard
// behaviour instead of six. Call `confirmAction({ … })` and await the boolean;
// ConfirmHost (mounted once per window in App, beside ToastHost) renders the
// head of the queue. Never use window.confirm: it freezes the whole window and
// ignores the theme.
//
// Two helpers cover the common shapes:
//  - `confirmDelete(kind, name?)` — "Delete highlight?" with a danger button.
//  - `confirmDiscard(dirty, action)` — the unsaved-changes guard (B368). It runs
//    `action` straight away when nothing is dirty, otherwise asks first.
//
// Module state is per renderer (each BrowserWindow is its own JS context), so a
// decoupled window has its own queue and host. The snapshot is replaced only
// inside emit(), so useSyncExternalStore sees a cached value (pitfall #129).

export interface ConfirmOptions {
  title: string
  /** The main line — usually the name of the thing being affected. */
  message?: string
  /** Quieter explanation under the message. */
  detail?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive: danger button, and the SAFE button (Cancel) takes focus. */
  danger?: boolean
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number
}

interface Pending extends ConfirmRequest {
  resolve: (ok: boolean) => void
}

let seq = 0
let queue: readonly Pending[] = []
let snapshot: ConfirmRequest | null = null
const listeners = new Set<() => void>()

function emit(): void {
  snapshot = queue[0] ?? null
  for (const l of listeners) l()
}

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    queue = [...queue, { ...opts, id: ++seq, resolve }]
    emit()
  })
}

export function settleConfirm(id: number, ok: boolean): void {
  const req = queue.find(r => r.id === id)
  if (!req) return
  queue = queue.filter(r => r.id !== id)
  emit()
  req.resolve(ok)
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getConfirmSnapshot(): ConfirmRequest | null {
  return snapshot
}

/** "Delete {kind}?" — `name` is shown as the message, e.g. the rule's pattern. */
export function confirmDelete(kind: string, name?: string, detail = "This can't be undone."): Promise<boolean> {
  return confirmAction({
    title: `Delete ${kind}?`,
    message: name || undefined,
    detail,
    confirmLabel: 'Delete',
    danger: true,
  })
}

// One discard question at a time. A second request while one is already up —
// the native menu toggling the same dialog again, which the confirm's scrim
// can't block — would otherwise queue an orphaned prompt for a dialog the first
// answer already closed, and run that dialog's close again from a stale closure.
let discardPending = false

/** Run `action`, asking first if `dirty` (B368). `what` names the draft. */
export function confirmDiscard(dirty: boolean, action: () => void, what?: string): void {
  if (!dirty) { action(); return }
  if (discardPending) return
  discardPending = true
  void confirmAction({
    title: 'Discard unsaved changes?',
    message: what ? `Your changes to ${what} haven't been saved.` : "You have changes that haven't been saved.",
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    danger: true,
  }).then(ok => { discardPending = false; if (ok) action() })
}
