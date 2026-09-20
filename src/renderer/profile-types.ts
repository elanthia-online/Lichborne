// Profile types — the on-disk shape of the two YAML profile files (types only).
//
// Two records, two files:
//  • `SharedProfile` → `_shared.yaml` (profileVersion 1): everything APP-WIDE —
//    account, Lich/Ruby advanced settings, map folders, the game definitions,
//    custom themes, and one optional block per app-wide feature (session log,
//    analytics, teams, command history, Overview options, named colours,
//    last-session snapshot, the six global rule lists, AI config, SimuCoin).
//  • `CharacterProfile` → `{Character}.yaml` (profileVersion 2): the identity /
//    launcher fields, the boot-fallback `theme`, and `state` — a DYNAMIC map
//    that mirrors that character's `lichborne.{character}.*` localStorage
//    keys 1:1.
//
// The v2 `state` map is why a NEW PER-CHARACTER setting needs nothing here:
// write to a `scopedKey` and the round-trip is automatic. A new SHARED setting
// DOES need a typed entry here (plus its build/import lines in profile.ts).
// Every addition follows the same shape — OPTIONAL, with a comment naming the
// version it landed in and what an older file defaults to — so adding a field
// is never a breaking change; renaming or retyping one is (see profile.ts for
// the version constants + migrations). Two blocks (`ai`, `simucoin`) are
// deliberately NOT Profile Transfer categories: machine-local / credential-
// gated. profile.ts is the only place that BUILDS or APPLIES the full shape;
// the Launcher's read-modify-write helpers patch launcher-owned top-level
// fields (favorite/hidden/notes/game/useLich…) directly through
// `window.api.writeCharacterProfile` — pitfall #26. This file imports types only.

import type { CustomTheme } from './myThemes'
import type { SessionLogSettings } from './sessionLogSettings'
import type { AIConfig } from './aiConfig'
import type { BulkSet } from './bulkSets'

// ── Shared (_shared.yaml) ─────────────────────────────────────────────────────

export interface GameDefinition {
  name: string
  gameCode: string
  lichPort: number
  lichArguments: string
}

export interface SharedAdvancedSettings {
  lichPath: string
  rubyPath: string
  lichClientFlag: string
  lichPort: number
  portLocked: boolean
  modeLocked: boolean
  // v0.8.0 dropped `lichDelay` and `hideLichWindow`. See lichSettings.ts for
  // the rationale. Old _shared.yaml files with these keys parse fine and the
  // values are silently ignored on import — no migration needed.
}

export interface SharedProfile {
  profileVersion: 1
  account: string
  advancedSettings: SharedAdvancedSettings
  mapDir: string
  genieMapsDir: string
  games: Record<string, GameDefinition>
  myThemes: CustomTheme[]
  // Session Log preferences — app-wide, not per-character. Optional so a
  // pre-v0.7.0 _shared.yaml without it still imports (defaults fill in).
  sessionLog?: SessionLogSettings
  // Bulk Connect "open each character in its own window" preference (v0.11.0).
  // App-wide, persisted here. Optional → older files default it to false.
  bulkConnectSeparateWindows?: boolean
  // Automation Analytics master toggle (v0.14.4). App-wide, off by default —
  // when on, per-rule usage tracking runs + the health UI appears in the
  // Automations panel. Optional → older files default it to false. The stats
  // DATA is per-character (state.automationStats); only this enable flag is shared.
  automationAnalytics?: boolean
  // Named Bulk Connect sets (F85, v0.18.3 — Binu): a "team" of characters,
  // at most one per account, launched together. App-wide by definition — a set
  // spans accounts, so it cannot live in a character profile. Optional → older
  // files default to []. Stores NAMES; unknown ones are ignored at load rather
  // than pruned, so a set survives a character being archived and restored.
  /** Saved teams. Uses the REAL BulkSet type rather than an inline shape:
   *  the inline one omitted `favorite` and `notes`, so the round-trip only
   *  preserved them by structural-typing accident, and the first edit that
   *  rebuilt an entry would have dropped them with nothing to warn you. */
  bulkSets?: BulkSet[]
  // Command-history preferences (F82, v0.18.3). App-wide: the history DATA is
  // per-character (state.commandHistory), but how recall should BEHAVE is a
  // set-once preference, like the Session Log settings. Optional → older files
  // default to minLength 0, which is exactly the pre-F82 behaviour.
  commandHistory?: { minLength: number }
  // Overview view display options (v0.19.0 Views, DESIGN §47). App-wide because
  // the Overview is BY DEFINITION cross-character — a per-character copy has no
  // answer to "whose wins when three are open", and it would break the moment a
  // character is decoupled into its own window. The view MODE is deliberately
  // NOT here: it is per-window ephemeral, so a decoupled window is never forced
  // into whatever view the main window is in. Optional → older files default to
  // DEFAULT_OVERVIEW_OPTIONS, which is exactly the pre-v0.19 behaviour.
  // `unknown` rather than a structural type: `applyOverviewState` rebuilds the
  // record field by field on the way in, so the validation lives in one place
  // (the store) instead of being half-asserted by the profile type.
  overview?: { options: unknown }
  // User-defined named colors (v0.14.6, `/colors add`). App-wide — a color
  // vocabulary is shared like themes. Optional → older files default to [].
  // F115 (v0.19.8): `id` is what rules LINK to, `retired` a removed color
  // that still paints what uses it. Both optional: an entry from an older file
  // gets a deterministic id from its name on load (colors.ts).
  customColors?: { id?: string; name: string; hex: string; retired?: boolean }[]
  // "Reconnect last session" snapshot (F62, v0.15.2) — the character set that
  // was live (across all windows) the last time any session was open. Written
  // by the primary window on every non-empty roster change. Optional → older
  // files default to [] (no reconnect offer).
  lastSessionCharacters?: { account: string; name: string }[]
  // Global cross-character rules (F37, v0.15.2) — apply to EVERY character,
  // merged at runtime after each character's own rules. Stored here (not in
  // any {Character}.yaml) because they're deliberately not character-bound;
  // the localStorage working copies live under the virtual `_global` scope
  // (characterScope.GLOBAL_RULES_SCOPE). Always-active — group gating is
  // per-character and is normalized away. Loose `unknown[]` typing avoids a
  // profile-types → rule-module import web; the rule stores validate shape on
  // load exactly as they do for per-character lists. Optional → older files
  // default to [] (no globals).
  sharedHighlights?: unknown[]
  sharedTriggers?: unknown[]
  sharedMacros?: unknown[]
  sharedAliases?: unknown[]
  sharedMutes?: unknown[]
  sharedSubstitutes?: unknown[]
  // AI feature config (v0.16.0, DESIGN §10) — app-wide, BYOK. The NON-SECRET
  // config only: master enable, chosen text model, per-feature consent flags.
  // The API key never rides YAML — it lives in main's safeStorage (ai-keys.json,
  // the passwords.json precedent). Optional → older files default to disabled.
  // Deliberately NOT a Profile Transfer category (machine-local; automationStats
  // precedent).
  ai?: AIConfig
  // SimuCoin claim settings, per ACCOUNT (F71, v0.18.0, DESIGN §42) — app-wide
  // because an allotment belongs to an account, not a character. Both flags
  // default OFF: `consented` gates ALL network access (the user saw the
  // disclosure), `autoClaim` chooses claim-on-find vs. click-the-coin. No
  // credential rides here — the store login reuses passwords.json/safeStorage.
  // Optional → older files default to {} (feature invisible). Deliberately NOT
  // a Profile Transfer category (machine-local + credential-gated; the ai /
  // automationStats precedent).
  simucoin?: Record<string, { consented: boolean; autoClaim: boolean }>
}

// ── Character ({Character}.yaml) ──────────────────────────────────────────────
//
// v2 (current): everything per-character state lives under `state`, which mirrors
// localStorage `lichborne.{character}.*` keys 1:1. Adding a new feature that
// uses `scopedKey(character, ...)` requires no profile-system changes — the
// round-trip is automatic. The top-level fields are kept human-readable for
// quick identification.
export interface CharacterProfile {
  profileVersion: 2
  account: string
  character: string
  game: string
  useLich: boolean
  // v0.8.0: optional soft-delete flag. Hidden characters keep their full
  // profile (automations, theme, layout) but don't render in the launcher
  // grid unless the user toggles "Show hidden" on the top bar. Optional so
  // existing profiles without the field parse fine — undefined === visible.
  hidden?: boolean
  // v0.8.0: pinned to the launcher's Favorites section at the top. Tile
  // still appears in its account / game section too — Favorites is a
  // quick-access mirror, not a re-categorization. Hidden overrides
  // favorite — a hidden tile doesn't show in Favorites unless "Show
  // hidden" is on. Optional; undefined === not favorited.
  favorite?: boolean
  // v0.8.0: per-character launcher metadata. Edited via the Notes editor
  // modal (Edit Profile… in the tile ⋯ menu). All optional — undefined
  // means "not set" and is rendered as empty / hidden on the tile.
  guild?: string         // canonical guild key (lowercase, matches themes.ts entries: 'empath', 'moonmage', etc.)
  circle?: number        // character circle / level — surfaced on the tile meta line
  notes?: string         // free-text notes (multi-line); when non-empty, the tile shows a ✎ indicator
  // Attach mode: the detachable Lich listener this character was last
  // attached to (`lich --login Char --headless PORT`). Written on every
  // successful attach; read by the tile ⋯ menu's "⇋ Attach" action and the
  // Attach modal's autofill, so a re-attach never needs the host/port retyped.
  // Launcher-owned like hidden/favorite (preserved by exportCharacterProfile's
  // read-merge-write). Optional — undefined means never attached.
  attach?: { host: string; port: number }
  theme: string                            // boot-fallback theme (shared)
  state: Record<string, unknown>           // dynamic map of localStorage scope
}

