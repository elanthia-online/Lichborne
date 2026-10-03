// Profiles — the bridge between localStorage (the working copy) and the YAML files (the truth).
//
// The renderer works out of localStorage; this file is what moves that state
// to and from `_shared.yaml` / `{Character}.yaml` on disk (through
// `window.api.read*/write*Profile` — main owns the files). Nothing else
// builds or applies the FULL profile shape; the one other writer is the
// Launcher's read-modify-write helpers, which patch launcher-owned top-level
// fields (favorite/hidden/notes/game/useLich…) directly — and which
// `exportCharacterProfile` must therefore preserve, not clobber (pitfall #26).
//
// THE MODEL: `buildCharacterProfile` SCANS every `lichborne.{character}.*`
// key into the dynamic `state` map, and `importCharacterProfile` writes every
// `state` entry back to its `scopedKey` — so a new per-character setting needs
// NO plumbing here. `buildSharedProfile` is the opposite shape: one explicit
// line per app-wide field, each read FRESH from localStorage by its own loader
// at build time (`overview` is the one that goes through its store instead).
// Adding a shared setting = a `SharedProfile` type entry + a build line + an
// import line.
//
// INVARIANTS (each has a comment at its site):
//  • `exportCharacterProfile` is READ-MERGE-WRITE (B97, v0.8.0): the GameWindow
//    is authoritative for `theme` + `state` ONLY; game / useLich / hidden /
//    favorite / guild / circle / notes are launcher-owned and preserved from
//    the YAML on every save. Don't write `buildCharacterProfile`'s output
//    verbatim.
//  • Schema versions (SHARED 1 / CHARACTER 2) are bumped only for a breaking
//    change, with a migration registered in profile-migrations.ts keyed by the
//    SOURCE version. `runMigrations` returns null for a FUTURE-version file
//    and the import is then SKIPPED with a warning — the YAML is never
//    clobbered by code that doesn't understand it.
//  • Saves are DEBOUNCED (2.5s), one timer PER CHARACTER (`scheduleProfileSave`)
//    plus one for `_shared.yaml`; `flushPendingProfileSaves` fires them all
//    immediately for the before-close path.
//  • The six global rule lists (F37, v0.15.2) live under the virtual `_global`
//    scope and ride `_shared.yaml`, accessed by RAW key here so this file
//    imports no rule modules; the stores re-validate on load.

import type { SharedProfile, CharacterProfile } from './profile-types'
import { loadMyThemes, saveMyThemes } from './myThemes'
import { scopedKey, normalizeCharacter, GLOBAL_RULES_SCOPE } from './characterScope'
import { sharedMigrations, characterMigrations, runMigrations } from './profile-migrations'
import { loadBulkSets, saveBulkSets } from './bulkSets'
import { loadCommandHistorySettings, saveCommandHistorySettings } from './commandHistorySettings'
import { loadCharacterNoticesEnabled, saveCharacterNoticesEnabled } from './characterNotices'
import { loadCharacterColors, storeCharacterColors, coerceCharacterColors } from './characterColors'
import { getOverviewPersisted, applyOverviewState } from './overviewStore'
import { loadSessionLogSettings, saveSessionLogSettings, DEFAULT_SESSION_LOG_SETTINGS } from './sessionLogSettings'
import { loadAIConfig, saveAIConfig, DEFAULT_AI_CONFIG } from './aiConfig'
import { loadCustomColors, saveCustomColors, coerceCustomColors } from './colors'
import { DEFAULT_RUBY, DEFAULT_LICH } from './lichSettings'
import { loadSimuCoinConfig, saveSimuCoinConfig, coerceSimuCoinConfig } from './simucoinConfig'

// ── Default game definitions ──────────────────────────────────────────────────
// Written once when creating _shared.yaml; user can edit the file to add more.

// GS4 rows mirror lichSettings.ts's GAMES table — see that file's comment for
// the lich-5 source citation (login_helpers.rb / argv_options.rb) backing the
// ports/flags.
const DEFAULT_GAMES = {
  DR:  { name: 'DragonRealms Prime',      gameCode: 'DR',  lichPort: 11024, lichArguments: '--dragonrealms' },
  DRT: { name: 'DragonRealms Prime Test',  gameCode: 'DRT', lichPort: 11624, lichArguments: '--test --dragonrealms' },
  DRX: { name: 'DragonRealms Platinum',    gameCode: 'DRX', lichPort: 11124, lichArguments: '--platinum --dragonrealms' },
  DRF: { name: 'DragonRealms The Fallen',  gameCode: 'DRF', lichPort: 11324, lichArguments: '--fallen' },
  GS3: { name: 'GemStone IV Prime',       gameCode: 'GS3', lichPort: 10024, lichArguments: '--gemstone' },
  GSX: { name: 'GemStone IV Platinum',    gameCode: 'GSX', lichPort: 10124, lichArguments: '--gemstone --platinum' },
  GST: { name: 'GemStone IV Test',        gameCode: 'GST', lichPort: 10624, lichArguments: '--gemstone --test' },
  GSF: { name: 'GemStone IV Shattered',   gameCode: 'GSF', lichPort: 10324, lichArguments: '--shattered' },
}

// Schema versions for the two profile files. Bumped only when a breaking
// change ships — register a migration in `profile-migrations.ts` keyed by the
// PREVIOUS version (e.g. bumping CHARACTER from 2 → 3 means add
// `characterMigrations[2]` that upgrades v2-shaped data into v3-shaped data).
const SHARED_PROFILE_VERSION    = 1 as const
const CHARACTER_PROFILE_VERSION = 2 as const

// ── Last session (F62, v0.15.2) ──────────────────────────────────────────────
// "Reconnect last session": the primary window snapshots the live roster (ALL
// windows) here whenever it's NON-EMPTY — non-empty-only so the shutdown drain
// or a manual disconnect-all can never wipe the last good set (a stale offer
// on the launcher is harmless; an emptied one loses the feature). Rides
// _shared.yaml like bulkConnectSeparateWindows.

export interface LastSessionEntry { account: string; name: string }
const LAST_SESSION_KEY = 'lichborne.lastSessionCharacters'

export function loadLastSessionCharacters(): LastSessionEntry[] {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((e): e is LastSessionEntry =>
          !!e && typeof e.account === 'string' && typeof e.name === 'string')
      : []
  } catch { return [] }
}

export function saveLastSessionCharacters(entries: LastSessionEntry[]): void {
  try { localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(entries)) } catch { /* quota — skip */ }
}

// ── Global rules bridge (F37, v0.15.2) ────────────────────────────────────────
// The four cross-character rule lists live at `lichborne._global.*` in
// localStorage (the virtual scope — see characterScope.GLOBAL_RULES_SCOPE) and
// ride _shared.yaml, NOT any {Character}.yaml. Raw key access here (not the
// rule modules) keeps profile.ts free of rule-module imports; the stores
// re-validate shape on load exactly as they do for per-character lists.

function loadGlobalList(suffix: string): unknown[] {
  try {
    const raw = localStorage.getItem(scopedKey(GLOBAL_RULES_SCOPE, suffix))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveGlobalList(suffix: string, list: unknown[]): void {
  try { localStorage.setItem(scopedKey(GLOBAL_RULES_SCOPE, suffix), JSON.stringify(list)) } catch { /* quota — skip */ }
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildSharedProfile(): SharedProfile {
  const adv = (() => {
    try { return JSON.parse(localStorage.getItem('lichborne.advancedSettings') ?? '{}') } catch { return {} }
  })()

  return {
    profileVersion:   SHARED_PROFILE_VERSION,
    account:          localStorage.getItem('lichborne.account') ?? '',
    advancedSettings: {
      // Per-platform defaults (v0.18.0) — the single source is lichSettings.
      lichPath:       adv.lichPath       ?? DEFAULT_LICH,
      rubyPath:       adv.rubyPath       ?? DEFAULT_RUBY,
      lichClientFlag: adv.lichMode       ?? '--stormfront',
      lichPort:       adv.lichPort       ?? 11024,
      portLocked:     adv.portLocked     ?? true,
      modeLocked:     adv.modeLocked     ?? true,
    },
    mapDir:      localStorage.getItem('lichborne.mapDir')      ?? '',
    genieMapsDir: localStorage.getItem('lichborne.genieMapsDir') ?? '',
    games:       DEFAULT_GAMES,
    myThemes:  loadMyThemes(),
    sessionLog: loadSessionLogSettings(),
    ai:         loadAIConfig(),
    bulkConnectSeparateWindows: localStorage.getItem('lichborne.bulkConnectSeparateWindows') === 'true',
    automationAnalytics: localStorage.getItem('lichborne.automationAnalytics') === 'true',
    commandHistory: loadCommandHistorySettings(),
    characterNotices: loadCharacterNoticesEnabled(),
    characterColors: loadCharacterColors(),
    overview:   getOverviewPersisted(),
    bulkSets:   loadBulkSets(),
    customColors: loadCustomColors(),
    simucoin:   loadSimuCoinConfig(),
    lastSessionCharacters: loadLastSessionCharacters(),
    sharedHighlights:  loadGlobalList('highlights'),
    sharedTriggers:    loadGlobalList('triggers'),
    sharedMacros:      loadGlobalList('macros'),
    sharedAliases:     loadGlobalList('aliases'),
    sharedMutes:       loadGlobalList('mutes'),
    sharedSubstitutes: loadGlobalList('substitutes'),
  }
}

// Build a v2 character profile by scanning ALL localStorage keys under
// `lichborne.{character}.*` and capturing them into `state`. Adding a new
// per-character setting just requires writing to scopedKey(character, ...);
// the profile system picks it up automatically with no further plumbing.
export function buildCharacterProfile(
  account: string,
  character: string,
  game: string,
  useLich: boolean,
): CharacterProfile {
  const state: Record<string, unknown> = {}
  const prefix = `lichborne.${normalizeCharacter(character)}.`
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(prefix)) continue
    const suffix = key.slice(prefix.length)
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    // Round-trip the value type: try JSON, fall back to raw string. Mirrors how
    // each subsystem stores its data (some JSON, some plain strings).
    try { state[suffix] = JSON.parse(raw) } catch { state[suffix] = raw }
  }

  return {
    profileVersion: CHARACTER_PROFILE_VERSION,
    account,
    character,
    game,
    useLich,
    theme: localStorage.getItem('lichborne.theme') ?? 'classic',
    state,
  }
}

// ── Export (localStorage → YAML file) ────────────────────────────────────────

export async function exportSharedProfile(): Promise<void> {
  await window.api.writeSharedProfile(buildSharedProfile())
}

export async function exportCharacterProfile(
  account: string,
  character: string,
  game: string,
  useLich: boolean,
): Promise<void> {
  // Read-merge-write so launcher-managed fields survive a save triggered from
  // the GameWindow (v0.8.0, B97). `buildCharacterProfile` only knows about
  // {account, character, game, useLich, theme, state} — when the active
  // GameWindow's debounced save fires (every 2.5s after any per-character
  // settings change), the old code wrote that shape verbatim and silently
  // stripped every field the launcher owns: favorite, hidden, notes, guild,
  // circle. So toggling a pill, opening a panel, or any other ambient
  // activity on a logged-in character was un-favoriting them. The same
  // mechanism reverted launcher-edited game/useLich back to the stale
  // session.game / session.useLich the GameWindow was holding.
  //
  // Fix: pull the existing YAML, then merge with `built` winning ONLY on the
  // fields the GameWindow has authoritative state for (theme, state). Game,
  // useLich, and the launcher-only fields stay whatever the YAML currently
  // says — that's where the launcher's writes land.
  const existing = await window.api.readCharacterProfile(character).catch(() => null) as Partial<CharacterProfile> | null
  const built = buildCharacterProfile(account, character, game, useLich)
  const merged: CharacterProfile = existing
    ? {
        ...built,
        // Launcher owns these — preserve whatever the YAML currently has.
        game:     existing.game     ?? built.game,
        useLich:  existing.useLich  ?? built.useLich,
        hidden:   existing.hidden,
        favorite: existing.favorite,
        guild:    existing.guild,
        circle:   existing.circle,
        notes:    existing.notes,
        attach:   existing.attach,
      }
    : built
  await window.api.writeCharacterProfile(character, merged)
}

// ── Import (YAML file → localStorage) ────────────────────────────────────────

export async function importSharedProfile(): Promise<void> {
  const raw = await window.api.readSharedProfile()
  if (!raw || typeof raw !== 'object') return

  // Version check + migrate. Files predating the version field (no
  // `profileVersion` key, this was the only state from v0.6.0–v0.6.2) are
  // treated as v1 — same shape as current. Future-version files are skipped
  // with a warning so a downgrade or hand-edit can rescue them; we never
  // clobber a YAML we don't understand.
  const rawObj = raw as Record<string, unknown>
  const fileVersion = typeof rawObj.profileVersion === 'number' ? rawObj.profileVersion : 1
  const migrated = runMigrations(rawObj, fileVersion, SHARED_PROFILE_VERSION, sharedMigrations)
  if (migrated === null) {
    console.warn(`[profile] _shared.yaml is version ${fileVersion}, expected ${SHARED_PROFILE_VERSION}. Skipping import.`)
    return
  }
  const data = migrated as Partial<SharedProfile>

  if (data.account) localStorage.setItem('lichborne.account', data.account)

  // advancedSettings — merge into existing so unknown keys are preserved
  if (data.advancedSettings) {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem('lichborne.advancedSettings') ?? '{}') } catch { return {} }
    })()
    const adv = data.advancedSettings
    localStorage.setItem('lichborne.advancedSettings', JSON.stringify({
      ...existing,
      lichPath:       adv.lichPath       ?? existing.lichPath,
      rubyPath:       adv.rubyPath       ?? existing.rubyPath,
      lichMode:       adv.lichClientFlag ?? existing.lichMode,
      lichPort:       adv.lichPort       ?? existing.lichPort,
      portLocked:     adv.portLocked     ?? existing.portLocked,
      modeLocked:     adv.modeLocked     ?? existing.modeLocked,
    }))
  }

  if (data.mapDir)      localStorage.setItem('lichborne.mapDir',      data.mapDir)
  if (data.genieMapsDir) localStorage.setItem('lichborne.genieMapsDir', data.genieMapsDir)
  if (data.myThemes)    saveMyThemes(data.myThemes)

  // Session Log settings — app-wide. Merge over defaults so a partial or
  // absent block (older _shared.yaml) still yields a complete settings object.
  if (data.sessionLog) {
    saveSessionLogSettings({ ...DEFAULT_SESSION_LOG_SETTINGS, ...data.sessionLog })
  }

  if (data.bulkConnectSeparateWindows !== undefined) {
    localStorage.setItem('lichborne.bulkConnectSeparateWindows', String(data.bulkConnectSeparateWindows))
  }

  // AI config — app-wide, non-secret. Merge over defaults so a partial/older
  // block still yields a complete config. The API key is NOT here (safeStorage).
  if (data.ai) {
    saveAIConfig({
      ...DEFAULT_AI_CONFIG,
      ...data.ai,
      consent: (data.ai.consent && typeof data.ai.consent === 'object') ? data.ai.consent : {},
    })
  }

  if (Array.isArray(data.lastSessionCharacters)) {
    saveLastSessionCharacters(data.lastSessionCharacters)
  }

  if (Array.isArray(data.sharedHighlights))  saveGlobalList('highlights',  data.sharedHighlights)
  if (Array.isArray(data.sharedTriggers))    saveGlobalList('triggers',    data.sharedTriggers)
  if (Array.isArray(data.sharedMacros))      saveGlobalList('macros',      data.sharedMacros)
  if (Array.isArray(data.sharedAliases))     saveGlobalList('aliases',     data.sharedAliases)
  if (Array.isArray(data.sharedMutes))       saveGlobalList('mutes',       data.sharedMutes)
  if (Array.isArray(data.sharedSubstitutes)) saveGlobalList('substitutes', data.sharedSubstitutes)

  if (data.automationAnalytics !== undefined) {
    localStorage.setItem('lichborne.automationAnalytics', String(data.automationAnalytics))
  }

  // Coerced on the way in (the loader clamps too), so a hand-edited or
  // future-version value can never disable recall outright.
  if (Array.isArray(data.bulkSets)) saveBulkSets(data.bulkSets)

  if (data.commandHistory && typeof data.commandHistory === 'object') {
    saveCommandHistorySettings(data.commandHistory as { minLength: number })
  }

  // Only a real boolean is taken; anything else leaves the default (on).
  if (typeof data.characterNotices === 'boolean') saveCharacterNoticesEnabled(data.characterNotices)

  // Character colours: coerced (a hand-edited YAML can't smuggle in a non-string),
  // and only when present, so an older file never wipes colours set since.
  if (data.characterColors && typeof data.characterColors === 'object') {
    storeCharacterColors(coerceCharacterColors(data.characterColors))
  }

  // Overview options (v0.19.0 Views). applyOverviewState REBUILDS the record
  // field by field, so a hand-edited or future-version block can never introduce
  // an option the app does not expect.
  if (data.overview && typeof data.overview === 'object') applyOverviewState(data.overview)

  // F115: coerce, never a bare filter — an entry saved before v0.19.8 has no
  // id, and gets the SAME deterministic one every load gives it, so links made
  // against it keep resolving.
  if (Array.isArray(data.customColors)) {
    saveCustomColors(coerceCustomColors(data.customColors))
  }

  // SimuCoin per-account settings (F71). saveSimuCoinConfig writes verbatim, so
  // coerce here the same way loadSimuCoinConfig does — a hand-edited YAML must
  // never yield a half-shaped record that reads as consented.
  if (data.simucoin && typeof data.simucoin === 'object' && !Array.isArray(data.simucoin)) {
    // Shares coerceSimuCoinConfig with loadSimuCoinConfig — this used to be an
    // inline copy, and the copy silently STRIPPED every field added to the
    // record later. Because it also restated the type inline, tsc couldn't see
    // the drift. See the note on coerceSimuCoinConfig before touching this.
    saveSimuCoinConfig(coerceSimuCoinConfig(data.simucoin))
  }
}

export async function importCharacterProfile(character: string): Promise<CharacterProfile | null> {
  const raw = await window.api.readCharacterProfile(character)
  if (!raw || typeof raw !== 'object') return null

  // Version check + migrate. Files that already stamp `profileVersion: 2`
  // (v0.6.0+) are passed through unchanged because the registry's at the
  // current schema. Future-version files are refused with a warning so the
  // on-disk YAML is preserved for downgrade/recovery rather than overwritten.
  const rawObj = raw as Record<string, unknown>
  const fileVersion = typeof rawObj.profileVersion === 'number' ? rawObj.profileVersion : 2
  const migrated = runMigrations(rawObj, fileVersion, CHARACTER_PROFILE_VERSION, characterMigrations)
  if (migrated === null) {
    console.warn(`[profile] ${character}.yaml is version ${fileVersion}, expected ${CHARACTER_PROFILE_VERSION}. Skipping import.`)
    return null
  }
  const data = migrated as Partial<CharacterProfile>

  // Shared boot-fallback theme
  if (data.theme) localStorage.setItem('lichborne.theme', data.theme)

  // v2 dynamic state map. Pre-v0.6.0 profiles aren't supported — testers wipe
  // profiles/{Character}.yaml to start fresh.
  if (data.state && typeof data.state === 'object') {
    for (const [suffix, value] of Object.entries(data.state)) {
      if (value === undefined || value === null) continue
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      localStorage.setItem(scopedKey(character, suffix), stringValue)
    }
  }

  return buildCharacterProfile(
    data.account ?? '',
    data.character ?? character,
    data.game ?? 'DR',
    data.useLich ?? true,
  )
}

// ── Clear character localStorage ─────────────────────────────────────────────
// Wipes every `lichborne.{character}.*` key so a fresh character profile
// starts blank rather than inheriting whatever was last in this localStorage.
// Dynamic — no hand-maintained list of suffixes.

export function clearCharacterLocalStorage(character: string): void {
  const prefix = `lichborne.${normalizeCharacter(character)}.`
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) toRemove.push(key)
  }
  for (const key of toRemove) localStorage.removeItem(key)
}

// ── Debounced auto-save ───────────────────────────────────────────────────────

let _sharedSaveTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleSharedProfileSave(delayMs = 2500): void {
  if (_sharedSaveTimer) clearTimeout(_sharedSaveTimer)
  _sharedSaveTimer = setTimeout(() => {
    _sharedSaveTimer = null
    exportSharedProfile().catch(console.error)
  }, delayMs)
}

// Per-character debounce — two concurrently-active characters each get their
// own pending timer + context so a save scheduled for char A is never overwritten
// by a save scheduled for char B (and vice versa).
interface PendingSave {
  timer:    ReturnType<typeof setTimeout>
  account:  string
  character: string
  game:     string
  useLich:  boolean
}

const _saveTimers = new Map<string, PendingSave>()

export function scheduleProfileSave(
  account: string,
  character: string,
  game: string,
  useLich: boolean,
  delayMs = 2500,
): void {
  const key = normalizeCharacter(character)
  const existing = _saveTimers.get(key)
  if (existing) clearTimeout(existing.timer)
  const timer = setTimeout(() => {
    _saveTimers.delete(key)
    exportCharacterProfile(account, character, game, useLich).catch(console.error)
  }, delayMs)
  _saveTimers.set(key, { timer, account, character, game, useLich })
}

// Fire every pending debounced save IMMEDIATELY and wait for all writes to
// complete. Called from the renderer's before-close handler so the latest
// in-memory state always reaches disk before the window destroys.
export async function flushPendingProfileSaves(): Promise<void> {
  const pending = Array.from(_saveTimers.values())
  for (const p of pending) clearTimeout(p.timer)
  _saveTimers.clear()
  if (_sharedSaveTimer) {
    clearTimeout(_sharedSaveTimer)
    _sharedSaveTimer = null
  }
  await Promise.all([
    exportSharedProfile().catch(console.error),
    ...pending.map(p => exportCharacterProfile(p.account, p.character, p.game, p.useLich).catch(console.error)),
  ])
}
