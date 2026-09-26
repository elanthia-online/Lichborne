// Character colours (v0.20.0) — an optional colour you pick for each of YOUR
// characters in the launcher's Edit Profile, used wherever Lichborne draws that
// character as a person: their toast badge, their figure in the Living Tableau
// (and when another of your characters stands in the same room), their Team
// Login tile, and the selection ring on their Overview card.
//
// No colour chosen → every surface falls back exactly as before (the Tableau's
// contact/name-hash colour, utils/nameColor), so this is purely additive.
//
// STORAGE: app-wide, in `_shared.yaml` (`SharedProfile.characterColors`), keyed
// by `account::character` (lowercase) — the characterId WITHOUT its shard, so
// the launcher's DR ↔ Test toggle (same profile, different characterId) keeps
// the colour, and the same character on DR and DR Test shares one. Not the bare
// name: profiles are keyed by name only and two same-named characters on
// different accounts already collide there (BUGS.md Known Limitations) — this
// doesn't copy that. Pass a characterId anywhere; `colorKey` reduces it. Shared rather than per-character because every window must read
// it synchronously (a toast about a character in ANOTHER window) and a change
// must reach every window at once. localStorage is the working copy; the same-
// window event plus the cross-window `storage` event invalidate the cache.
// Deliberately NOT a Transfer category: it's identity, like guild and notes.
//
// A value is anything a rule colour can be (DESIGN §49): a hex, or a LINK to one
// of your named colours (`var(--lb-color-<id>, #fallback)`), so recolouring the
// named colour recolours the character. Put it straight into CSS; call
// colorHex() only when a hex is really needed (pitfall #149).

import { useSyncExternalStore } from 'react'
import { colorHex } from './colors'

const KEY = 'lichborne.characterColors'
export const CHARACTER_COLORS_EVENT = 'lichborne:character-colors-changed'

export type CharacterColors = Record<string, string>

/** The storage key for a characterId (account::character::game) or an
 *  already-reduced key: `account::character`, lowercase. */
export function colorKey(characterIdOrKey: string): string {
  const parts = characterIdOrKey.toLowerCase().split('::')
  return parts.length >= 2 ? `${parts[0]}::${parts[1]}` : parts[0]
}

/** Keep only non-empty string values under non-empty keys, keyed by
 *  `colorKey` (so a map written with full characterIds, as the first v0.20.0
 *  builds did, reads correctly; the first entry per key wins). Rebuilds, so it
 *  is the ONE place a stored map is trusted (pitfall #121). */
export function coerceCharacterColors(raw: unknown): CharacterColors {
  const out: CharacterColors = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== 'string' || !k.trim() || typeof v !== 'string' || !v.trim()) continue
    const key = colorKey(k.trim())
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = v.trim()
  }
  return out
}

/** A value any surface can paint: a hex or a named-colour link. Anything else
 *  (a half-typed name, a hand-edited YAML) would make every `color-mix()` that
 *  reads it invalid — the tab loses its tint, borders fall back to the text
 *  colour — so it is treated as no colour at all. */
export function isPaintableColor(value: string): boolean {
  return !!colorHex(value)
}

export function loadCharacterColors(): CharacterColors {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? coerceCharacterColors(JSON.parse(raw)) : {}
  } catch { return {} }
}

/** Write the whole map (the shared-profile import path). */
export function storeCharacterColors(map: CharacterColors): void {
  try { localStorage.setItem(KEY, JSON.stringify(coerceCharacterColors(map))) }
  catch (e) { console.error('[characterColors] write failed:', e) }
  invalidateCharacterColors()
}

/** Set or clear one character's colour. The caller also schedules the
 *  shared-profile save (profile.ts imports this module, not the reverse). */
export function setCharacterColor(characterId: string, color: string | null): void {
  const map = loadCharacterColors()
  const key = colorKey(characterId)
  if (color && color.trim() && isPaintableColor(color.trim())) map[key] = color.trim()
  else delete map[key]
  storeCharacterColors(map)
}

// ── Reading it in React ───────────────────────────────────────────────────────
// A cached snapshot, replaced only when the data changes: useSyncExternalStore
// re-renders forever if getSnapshot returns a fresh object (pitfall #129).

let cache: CharacterColors | null = null
const EMPTY: CharacterColors = {}

export function invalidateCharacterColors(): void {
  cache = null
  try { document.dispatchEvent(new CustomEvent(CHARACTER_COLORS_EVENT)) } catch { /* no DOM */ }
}

// Another window wrote it: its localStorage write is visible here, and the
// storage event is how we hear (it never fires in the writing window). Module-
// level rather than per subscriber, so the cache can't go stale during a
// stretch with nothing subscribed.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === null) invalidateCharacterColors()
  })
}

function snapshot(): CharacterColors {
  if (!cache) cache = loadCharacterColors()
  return cache
}

function subscribe(onChange: () => void): () => void {
  // invalidateCharacterColors has already dropped the cache.
  document.addEventListener(CHARACTER_COLORS_EVENT, onChange)
  return () => document.removeEventListener(CHARACTER_COLORS_EVENT, onChange)
}

export function useCharacterColors(): CharacterColors {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

/** The name part of a key (account::character), lowercased. */
function nameOf(key: string): string {
  const parts = key.split('::')
  return (parts.length >= 2 ? parts[1] : key).toLowerCase()
}

/** A character's chosen colour by id, else by name (the Tableau knows only
 *  names). Two of your characters sharing a name on different accounts: the
 *  first one saved wins, which is the best a name can do. Only a paintable
 *  value is ever returned. */
export function characterColor(map: CharacterColors, opts: { characterId?: string; name?: string }): string | undefined {
  const ok = (v: string | undefined) => (v && isPaintableColor(v) ? v : undefined)
  if (opts.characterId) {
    const key = colorKey(opts.characterId)
    if (Object.prototype.hasOwnProperty.call(map, key)) return ok(map[key])
  }
  if (!opts.name) return undefined
  const want = opts.name.toLowerCase()
  for (const [key, color] of Object.entries(map)) if (nameOf(key) === want) return ok(color)
  return undefined
}

/** Name (lowercase) → colour, for surfaces that look people up by name many
 *  times per render. */
export function characterColorsByName(map: CharacterColors): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, color] of Object.entries(map)) {
    const n = nameOf(key)
    if (!out.has(n) && isPaintableColor(color)) out.set(n, color)
  }
  return out
}
