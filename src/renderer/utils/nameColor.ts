// Name colour — one stable colour and monogram per person, from their name.
//
// Lifted out of the Living Tableau (v0.20.0) so every surface that shows a
// person as a little badge draws them the SAME way: a character's toast badge
// matches their avatar on the Tableau. Change the recipe here and both follow;
// two copies would drift (pitfall #127).
//
// These are DATA colours, like contact colours, not theme colours: a saturated
// fill with white initials, the sanctioned exception in Principle #4. Any host
// that puts one on an unknown background should give it a theme-derived ring
// (UX #9 rider) so its edge survives light themes.

import { colorHex, readableTextOn } from '../colors'

/** Stable non-negative hash of a string (Java-style). */
export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** The person's colour: a hue from their name, case-insensitive. */
export function nameColor(name: string): string {
  return `hsl(${hashStr(name.toLowerCase()) % 360} 45% 38%)`
}

/** The same colour as `nameColor`, as #rrggbb — for a native colour input,
 *  which shows black for anything that isn't a hex. */
export function nameColorHex(name: string): string {
  const h = hashStr(name.toLowerCase()) % 360, s = 0.45, l = 0.38
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

/** One or two capital letters: the first letters of the first and last words,
 *  skipping articles ("a large rat" → "LR"); a single word gives its first two. */
export function nameInitials(name: string): string {
  const SKIP = new Set(['a', 'an', 'the', 'some'])
  const words = name.split(/\s+/).filter(w => w && !SKIP.has(w.toLowerCase()))
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  return (words[0] ?? name).slice(0, 2).toUpperCase()
}

/** The fill and ink for a person's monogram badge. A colour the player CHOSE
 *  (characterColors) may be anything — pale yellow included — so its initials
 *  go black or white by the fill (readableTextOn) with no halo; the default
 *  name colour is always a mid-dark fill, so white initials with a halo. */
export function monogramStyle(name: string, chosen?: string): { background: string; color: string; textShadow?: string } {
  if (!chosen) return { background: nameColor(name), color: '#fff' }
  const hex = colorHex(chosen)
  if (!hex) return { background: chosen, color: '#fff' }
  const ink = readableTextOn(hex)
  return { background: chosen, color: ink, ...(ink === '#000000' ? { textShadow: 'none' } : {}) }
}
