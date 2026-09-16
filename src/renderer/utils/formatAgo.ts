// formatAgo — the ONE phrasing for "how long since this last happened".
//
// Shared deliberately (pitfall #127). Two surfaces answer this same question —
// the Lich Scripts footer ("updated 3s ago · polls every 5s") and the Spell
// Monitor's header readout — and if each formatted its own, they would drift into
// "3s ago" versus "3 seconds ago" the first time either was touched. The
// wording is user-visible, so it belongs in one place.
//
// `now` is a parameter rather than an internal `Date.now()` so a caller that
// owns a clock (the Spell Monitor ticks its own `now` state) formats against
// exactly the instant it rendered, instead of a second read that can straddle a
// boundary and print a value one off from everything else in the same frame.

/** '' for "never happened", else 'just now' / 'Ns ago' / 'Nm ago' / 'Nh ago'. */
export function formatAgo(ts: number, now: number = Date.now()): string {
  if (!ts) return ''
  const secs = Math.floor((now - ts) / 1000)
  // A clock that has gone backwards (a resync, a machine sleeping) must not
  // print a negative age — the honest reading is "as of right now".
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}
