// profileKey — what a character's stored data is filed under (DESIGN §56.7.3).
//
// A character is its NAME on a SHARD: a GS3 Tysong and a GSF Tysong are two
// characters with their own settings and layout. So everything filed per
// character (the profile YAML, its `lichborne.{key}.*` localStorage scope, the
// Session Log folder) uses `Name@SHARD`, never the bare name.
//
// One derivation, shared by main (the migration, the guards) and the renderer
// (every storage call), so a session's key always matches its file.
//
//  • A TEST shard folds into its Prime (DRT → DR, GST → GS3): each test
//    instance is a mirror copy of Prime, so a character uses its Prime
//    profile there, and the launcher's Test toggle flips a profile's `game`
//    between the two without changing the file (Sekmeht, 2026-11-03). That
//    leaves five profile shards: DR, DRX, DRF, GS3, GSF.
//  • '@' because it never occurs in a game character name, is filename-safe on
//    every platform, and is not '.', which the `lichborne.{scope}.` prefix
//    scans split on.

export const PROFILE_KEY_SEP = '@'

/** Each test shard and the Prime it mirrors. */
export const TEST_SHARDS: Record<string, string> = { DRT: 'DR', GST: 'GS3' }

/** The shard a profile is filed under: the game code, a test shard folded into its Prime. */
export function profileShard(game: string | undefined): string {
  const code = (game ?? '').trim().toUpperCase() || 'DR'
  return TEST_SHARDS[code] ?? code
}

/** For a Prime or its test shard: both codes, so a toggle can flip between them. */
export function testPair(game: string): { prime: string; test: string } | null {
  const prime = profileShard(game)
  const test = Object.keys(TEST_SHARDS).find(t => TEST_SHARDS[t] === prime)
  return test ? { prime, test } : null
}

/** `Name@SHARD` for a character's name and game code. */
export function profileKey(name: string, game: string | undefined): string {
  return `${name.trim()}${PROFILE_KEY_SEP}${profileShard(game)}`
}

/** Whether a string is already a profile key (rather than a bare name). */
export function isProfileKey(s: string): boolean {
  return s.includes(PROFILE_KEY_SEP)
}

/** The character name a key was made from (a bare name returns itself). */
export function profileNameOf(key: string): string {
  const i = key.lastIndexOf(PROFILE_KEY_SEP)
  return i < 0 ? key : key.slice(0, i)
}

/** The shard a key was made from, or undefined for a bare name. */
export function profileShardOf(key: string): string | undefined {
  const i = key.lastIndexOf(PROFILE_KEY_SEP)
  return i < 0 ? undefined : key.slice(i + 1)
}
