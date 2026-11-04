// legacyProfileNames — what a bare character name from before profile keys
// means now (DESIGN §56.7.3).
//
// Teams (`bulkSets`) and Reconnect Last (`lastSessionCharacters`) in
// _shared.yaml named characters by name alone. The startup migration knows
// where each name's profile went (Thoren → Thoren@DRX); that map is kept here
// for good, because an older _shared.yaml can be imported long after the
// migration ran. A name the map doesn't know is DR Prime, which is what every
// character was before GemStone IV support.

import { isProfileKey, profileKey } from '../shared/profileKey'

const KEY = 'lichborne.profileKeyRenames'
// Names whose entry came from a LIVE profile. Kept beside the map so a later
// start can't let an archived rename overwrite one.
const LIVE_KEY = 'lichborne.profileKeyRenames.live'

function loadLive(): Set<string> {
  if (unsaved) return new Set([...loadLiveStored(), ...unsaved.live])
  return loadLiveStored()
}

function loadLiveStored(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(LIVE_KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch { return new Set() }
}

// The map this window computed but couldn't store yet (storage full). Read
// alongside the stored one, so a bare name resolves correctly for the rest of
// this session; applyProfileKeyRenames keeps the list unacknowledged until the
// write lands, so a later start stores it once there is room.
let unsaved: { map: Record<string, string>; live: string[] } | null = null

function loadStored(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {}
  } catch { return {} }
}

function load(): Record<string, string> {
  return unsaved ? { ...loadStored(), ...unsaved.map } : loadStored()
}

/** Remember the migration's old→new names (merged into any kept before).
 *  A live profile wins over an archived one for the same name: live `Bob.yaml`
 *  (DR) beside `Archive/Bob.yaml` (DRX) must map Bob to `Bob@DR`, or a legacy
 *  team or Reconnect Last entry would point at the archived character.
 *  Returns whether the map reached storage. On a full storage it is kept in
 *  memory for this session, and the caller must not acknowledge the renames
 *  until a later call stores it (review of #10). */
export function rememberLegacyNames(renames: { from: string; to: string; archived?: true }[]): boolean {
  const map = load()
  const live = loadLive()
  for (const { from, to, archived } of renames) {
    const name = from.toLowerCase()
    if (archived) {
      if (!live.has(name)) map[name] = to
    } else {
      map[name] = to
      live.add(name)
    }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
    localStorage.setItem(LIVE_KEY, JSON.stringify([...live]))
    unsaved = null
    return true
  } catch {
    unsaved = { map, live: [...live] }
    return false
  }
}

/** In memory only, never stored: a window other than the one that ran the
 *  migration holds the pending renames the same way, live over archived, so
 *  its shared save can't write a DRX member as DR. */
export function seedLegacyNames(renames: { from: string; to: string; archived?: true }[]): void {
  const map: Record<string, string> = { ...(unsaved?.map ?? {}) }
  const live = new Set(unsaved?.live ?? [])
  for (const { from, to, archived } of renames) {
    const name = from.toLowerCase()
    if (archived) { if (!live.has(name) && !(name in map)) map[name] = to }
    else { map[name] = to; live.add(name) }
  }
  unsaved = { map, live: [...live] }
}

/** A team member or similar: a key stays as it is; a bare name becomes its key. */
export function keyForLegacyName(nameOrKey: string): string {
  if (isProfileKey(nameOrKey)) return nameOrKey
  return load()[nameOrKey.trim().toLowerCase()] ?? profileKey(nameOrKey, 'DR')
}
