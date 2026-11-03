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

function load(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, string> : {}
  } catch { return {} }
}

/** Remember the migration's old→new names (merged into any kept before). */
export function rememberLegacyNames(renames: { from: string; to: string }[]): void {
  const map = load()
  for (const { from, to } of renames) map[from.toLowerCase()] = to
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* the DR Prime fallback still applies */ }
}

/** A team member or similar: a key stays as it is; a bare name becomes its key. */
export function keyForLegacyName(nameOrKey: string): string {
  if (isProfileKey(nameOrKey)) return nameOrKey
  return load()[nameOrKey.trim().toLowerCase()] ?? profileKey(nameOrKey, 'DR')
}
