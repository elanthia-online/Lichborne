// Named Bulk Connect sets (F85, v0.18.3 — Binu).
//
// Bulk Connect logged in one character from EVERY saved account, with no way to
// leave an account out. Binu: *"let's say I want to spend the day farming, I
// have a set named farm that logs in my best farming character from whichever
// accounts I want"* — so a set is a named TEAM, not a named account.
//
// A set stores PROFILE KEYS, `Name@SHARD` (DESIGN §56.7.3), since the same
// name can be a different character on another shard. A set written before
// that holds bare names, and `coerce` turns each into its key
// (keyForLegacyName). Before keys it stored CHARACTER NAMES. The account is derivable from the character
// (and a character can move accounts about as often as never), so storing names
// keeps a set meaningful even if the picker's grouping changes. Names that no
// longer exist are dropped at LOAD time rather than pruned on disk — a set that
// mentions an archived character should come back intact if that character is
// restored (F79 archives rather than deletes).
//
// APP-WIDE: a set spans accounts by definition, so it cannot live in a
// character profile. Rides `SharedProfile.bulkSets` → `_shared.yaml` with the
// three registrations Principle #1 requires.

import { keyForLegacyName } from './legacyProfileNames'

export interface BulkSet {
  name: string
  /** Profile keys (`Name@SHARD`), at most one per account (DR allows one active each). */
  characters: string[]
  /** Pinned into the launcher's Favorites block — Sekmeht: "think of
   *  favorites as their quick select to things", so it holds both characters
   *  and teams rather than characters alone. */
  favorite?: boolean
  /** Free-form notes, shown on the team's row. Same idea as a character
   *  profile's notes: what this team is FOR. */
  notes?: string
}

const KEY = 'lichborne.bulkSets'

/** Longest name we will store — keeps the dropdown from being unusable. */
export const BULK_SET_NAME_MAX = 32

function coerce(raw: unknown): BulkSet[] {
  if (!Array.isArray(raw)) return []
  const out: BulkSet[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const r = item as Partial<BulkSet> | null
    const name = typeof r?.name === 'string' ? r.name.trim().slice(0, BULK_SET_NAME_MAX) : ''
    if (!name) continue
    // Case-insensitive uniqueness: two sets called "Farm" and "farm" are one
    // set as far as anyone reading the dropdown is concerned.
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    const characters = Array.isArray(r?.characters)
      ? r!.characters.filter((c): c is string => typeof c === 'string' && !!c.trim()).map(keyForLegacyName)
      : []
    if (characters.length === 0) continue
    seen.add(key)
    // Copy EVERY field: coerce rebuilds the object and saveBulkSets runs it on
    // the way out, so anything omitted here is silently destroyed on the next
    // save rather than merely ignored on load.
    const favorite = r?.favorite === true
    const notes = typeof r?.notes === 'string' ? r.notes : undefined
    out.push({ name, characters, ...(favorite ? { favorite } : {}), ...(notes ? { notes } : {}) })
  }
  return out
}

export function loadBulkSets(): BulkSet[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? coerce(JSON.parse(raw)) : []
  } catch { return [] }
}

/** Storage key, exported so a cross-window `storage` listener can match it. */
export const BULK_SETS_KEY = KEY

/**
 * Fired after any write, so surfaces showing the team list refresh.
 *
 * A `storage` event NEVER fires in the window that made the write, so the
 * launcher's Teams section stayed stale after the picker saved a team — save,
 * Cancel, and the team wasn't there (Sekmeht). Same trap as the
 * analytics-changed / ai-key-changed / simucoin-changed precedents.
 *
 * Dispatched from `saveBulkSets` itself rather than from each call site, so
 * every writer is covered and no future one can forget.
 */
export const BULK_SETS_CHANGED_EVENT = 'lichborne:bulk-sets-changed'

export function saveBulkSets(sets: BulkSet[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(coerce(sets))) }
  catch (e) { console.error('[bulk-sets] write failed:', e) }
  // Outside the try: a quota failure still leaves the in-memory list changed,
  // and a listener re-reading is harmless either way.
  try { document.dispatchEvent(new CustomEvent(BULK_SETS_CHANGED_EVENT)) }
  catch { /* never throw from a notification */ }
}

/**
 * Add or REPLACE a set by name (case-insensitive), keeping list order stable so
 * re-saving an existing set doesn't move it in the dropdown.
 */
export function upsertBulkSet(sets: BulkSet[], set: BulkSet): BulkSet[] {
  const i = sets.findIndex(s => s.name.toLowerCase() === set.name.toLowerCase())
  if (i < 0) return [...sets, set]
  const next = sets.slice()
  // PRESERVE the fields the caller didn't supply. Team Login knows only the
  // name and the roster, so a plain overwrite would silently wipe the notes
  // and the favorite pin every time you re-saved a team from there — a
  // destructive edit disguised as an update.
  next[i] = { ...sets[i], ...set }
  return next
}

export function removeBulkSet(sets: BulkSet[], name: string): BulkSet[] {
  return sets.filter(s => s.name.toLowerCase() !== name.toLowerCase())
}
