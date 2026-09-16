// formatUptime — the ONE compact phrasing for "how long has this been running" (B394, v0.19.7).
//
// Lich Scripts used to print a script's uptime as a clock (1:23:45) while the
// Overview cards printed a session's as 1h 23m — two readings of the same kind of
// number that disagreed the moment you looked at both. This is the Overview's
// format (it was `shortDuration` in OverviewCard.tsx), moved here so every
// surface says it the same way (pitfall #127).
//
// Takes a DURATION in ms, not a start time, so a caller that owns a clock or
// stops one (a dropped session's card) formats exactly what it means. Seconds
// show under a minute because idle / fresh-start readings need them; above that
// the precision is minutes, which is all a glance needs.

/** '0s' / '45s' / '12m' / '3h' / '3h 5m'. */
export function formatUptime(ms: number): string {
  if (!ms || ms < 1000) return '0s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}
