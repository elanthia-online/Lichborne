// Per-character localStorage scoping. Each character's per-tab state lives
// under `lichborne.{name@shard}.{suffix}` (the lowercased profile key, DESIGN
// §56.7.3) so two tabs in the same app instance can independently read/write
// without clobbering each other.
//
// Shared keys (account, advancedSettings, mapDir, genieMapsDir, myThemes,
// rememberPassword) stay unnamespaced — they apply to all characters.
//
// YAML files (profiles/{Name@SHARD}.yaml) remain authoritative. localStorage
// is just a fast cache that gets repopulated from YAML on each login.

import { showToast } from './toasts'

export function normalizeCharacter(character: string): string {
  return character.trim().toLowerCase() || '_'
}

// Every scope is a profile key, `Name@SHARD` (DESIGN §56.7.3), or the virtual
// `_global`. A bare name is a caller that missed the key: it reads and writes
// a scope nothing saves, so say so (once per scope) rather than stay silent.
const warnedScopes = new Set<string>()
export function scopedKey(character: string, suffix: string): string {
  const scope = normalizeCharacter(character)
  if (!scope.includes('@') && !scope.startsWith('_') && !warnedScopes.has(scope)) {
    warnedScopes.add(scope)
    console.error(`[storage] scopedKey("${character}", "${suffix}"): not a Name@SHARD profile key`)
  }
  return `lichborne.${scope}.${suffix}`
}

// ── Global rules scope (F37, v0.15.2) ────────────────────────────────────────
// Cross-character highlights/triggers/macros/aliases live under a VIRTUAL
// character scope: `lichborne._global.*`. The rule stores + editor panels work
// on it UNCHANGED (they only ever see `scopedKey(character, ...)`); the
// bridge to disk is _shared.yaml (buildSharedProfile/importSharedProfile read
// and write these keys), NOT a per-character YAML — there is no `_global`
// character profile and no session for it. The leading underscore can't
// collide with a real DR character name (alphabetic only).
export const GLOBAL_RULES_SCOPE = '_global'

// Global rules are ALWAYS-ACTIVE by design — groups/modes are per-character
// concepts (their nanoid ids differ per character, so gating could never
// match cross-character). Applied at every runtime merge point so a
// hand-edited YAML can't smuggle a group-gated global in.
export function asGlobalRules<T extends { groupIds?: string[]; allGroups?: boolean }>(rules: T[]): T[] {
  return rules.map(r => ({ ...r, groupIds: [], allGroups: true }))
}

// Quota-safe localStorage write. A character with thousands of imported rules
// (× several characters in ONE localStorage) can exceed the ~5MB origin quota —
// a bare setItem then THROWS and the write is silently lost, which reads back as
// "I deleted a rule but it came back on reopen" (the YAML/cache still has the old
// list). Returns false + surfaces a one-shot warning instead of throwing, so a
// save failure is visible rather than silent. JadedSoul: delete-recreates bug.
let storageWarned = false
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    console.error('[storage] write failed (quota exceeded?):', key, e)
    if (!storageWarned) {
      storageWarned = true
      // Non-blocking toast (v0.14.5, DESIGN §37.6) — was a window.alert, which
      // froze the whole renderer mid-play. Same one-shot semantics; the
      // console.error above still fires on EVERY failed write.
      showToast({
        kind: 'error',
        durationMs: 15000,
        title: 'Lichborne could not save — storage is full',
        message:
          'This usually means a very large number of automation rules ' +
          '(often from importing duplicates). Open Automations → turn on Analytics → ' +
          '“Remove duplicate copies” to free space, then try again. ' +
          'Your YAML profile backups are unaffected.',
      })
    }
    return false
  }
}
