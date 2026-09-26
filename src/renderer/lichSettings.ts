// Shared Lich/advanced-connect settings used by both LoginScreen (login form)
// and SettingsPanel (in-session edits). Persisted to localStorage; replicated
// to _shared.yaml by callers so concurrent Electron processes stay in sync.

import type { GameFamily } from '../shared/types'

// Cross-platform (v0.18.0): which OS we're on, from the preload bridge.
// Guarded so non-renderer contexts (the tmp-* harnesses stub window.api
// without a platform field) fall back to Windows behavior.
const PLATFORM: string =
  (typeof window !== 'undefined' && window.api?.platform) || 'win32'
export const IS_MAC = PLATFORM === 'darwin'
export const IS_WINDOWS = PLATFORM === 'win32'

// Per-platform Lich/Ruby defaults, matching each OS's canonical install
// (Windows: the Ruby4Lich5 one-click installer; Linux/Mac: the elanthia-online
// wiki — Lich zip in ~/Lich5, Ruby via rbenv on Debian/Mac or the system Ruby
// on Fedora). Non-Windows paths are `~`-relative; MAIN expands them at every
// consumption point (expandHome — launch, lich.db3, maps/scripts, discovery).
// Never default to bare `ruby`: a GUI app launched from Finder/the dock lacks
// the shell PATH that makes rbenv shims resolve.
// Non-Windows default is deliberately EMPTY, not a plausible path like
// /usr/bin/ruby. Discovery skips its candidate scan whenever the configured
// interpreter already exists (`rubyAlreadyValid`), and on Linux/macOS the
// system Ruby almost always exists — but it's typically 3.x, which current
// Lich refuses to run. A "valid" default would therefore pin users to an
// unusable interpreter and stop the rbenv 4.x scan from ever running. Empty
// fails existsSync, so discovery walks its priority list (rbenv shim → rbenv
// versions newest-first → Homebrew → /usr/local → /usr/bin) and the system
// Ruby is still found — as the LAST resort it should be.
export const DEFAULT_RUBY =
  IS_WINDOWS ? 'C:\\Ruby4Lich5\\4.0.0\\bin\\ruby.exe' : ''
export const DEFAULT_LICH =
  IS_WINDOWS ? 'C:\\Ruby4Lich5\\Lich5\\lich.rbw'
  :            '~/Lich5/lich.rbw'
export const DEFAULT_LICH_PORT = 11024

export const ADV_KEY = 'lichborne.advancedSettings'

// v0.8.0 dropped `lichDelay` and `hideLichWindow` from this type.
// * `lichDelay` was the pre-v0.7.0 fixed wait-before-connect timer. After the
//   connect-with-retry rework it was only used as a `Math.max(..., 30)` floor
//   for the timeout cap in ConnectionManager — pure UI noise. Main now uses a
//   hardcoded 30s cap; bumping it is a one-line code change if ever needed.
// * `hideLichWindow` was a per-user toggle for showing Lich's console window.
//   The hidden path already pipes stderr and surfaces crashes via the error
//   banner, so the visible console gave nothing the banner doesn't. Always
//   hidden now.
// Old localStorage / YAML containing either field is a harmless no-op — the
// type drop just means they're ignored at read time.
export interface AdvancedSettings {
  useLich: boolean
  lichPath: string
  rubyPath: string
  lichPort: number
  portLocked: boolean
  lichMode: '--stormfront' | '--genie' | '--wizard' | '--avalon' | '--frostbite'
  modeLocked: boolean
  showAdvanced: boolean
}

export const ADV_DEFAULTS: AdvancedSettings = {
  useLich: true,
  lichPath: DEFAULT_LICH,
  rubyPath: DEFAULT_RUBY,
  lichPort: DEFAULT_LICH_PORT,
  portLocked: true,
  lichMode: '--stormfront',
  modeLocked: true,
  showAdvanced: false,
}

export function loadAdvanced(): AdvancedSettings {
  try {
    return { ...ADV_DEFAULTS, ...JSON.parse(localStorage.getItem(ADV_KEY) ?? '{}'), showAdvanced: false }
  } catch { return { ...ADV_DEFAULTS } }
}

export function saveAdvanced(s: AdvancedSettings) {
  localStorage.setItem(ADV_KEY, JSON.stringify(s))
}

export function gameCodeFromPort(port: number): string {
  if (port === 11624) return 'DRT'
  if (port === 11124) return 'DRX'
  if (port === 11324) return 'DRF'
  return 'DR'
}

// Catalog of supported games — the single source of truth for per-shard
// connection parameters. Each entry maps a game code to:
//   • port:          the Lich front-end port (one per shard by convention —
//                    Lich's force-mode listener binds to the SAME port
//                    number it uses to connect to that shard's real game
//                    server, per lib/main/main.rb / argv_options.rb)
//   • lichArguments: the CLI flags Lich expects so it routes to that shard
//                    (v0.8.0 — until then runConnect dropped this and Lich
//                    always launched with '--dragonrealms', sending every
//                    character to DR regardless of saved game)
// Used by runConnect / AddCharacterWizard / LichSetupFields.
export interface GameOption {
  code: string
  name: string
  port: number
  lichArguments: string
  family: GameFamily
}

// GS4 ports/flags verified against lich-5's own
// lib/common/authentication/login_helpers.rb (GEMSTONE_FLAGS/resolved
// instance codes: GS3/GSX/GST/GSF) and lib/main/argv_options.rb's
// handle_gemstone_connection/handle_shattered_connection (game_port values) —
// NOT guessed. GS4 has no bare-default flag like DR's fallback: Lich only
// resolves a GemStone instance when `--gemstone`/`--gs` (or the standalone
// `--shattered`) is present, so every GS4 entry below carries an explicit flag.
export const GAMES: GameOption[] = [
  { code: 'DR',  name: 'DragonRealms Prime',      port: 11024, lichArguments: '--dragonrealms',            family: 'DR' },
  { code: 'DRX', name: 'DragonRealms Platinum',   port: 11124, lichArguments: '--platinum --dragonrealms', family: 'DR' },
  { code: 'DRT', name: 'DragonRealms Prime Test', port: 11624, lichArguments: '--test --dragonrealms',     family: 'DR' },
  { code: 'DRF', name: 'DragonRealms The Fallen', port: 11324, lichArguments: '--fallen',                  family: 'DR' },
  { code: 'GS3', name: 'GemStone IV Prime',       port: 10024, lichArguments: '--gemstone',                family: 'GS4' },
  { code: 'GSX', name: 'GemStone IV Platinum',    port: 10124, lichArguments: '--gemstone --platinum',     family: 'GS4' },
  { code: 'GST', name: 'GemStone IV Test',        port: 10624, lichArguments: '--gemstone --test',         family: 'GS4' },
  { code: 'GSF', name: 'GemStone IV Shattered',   port: 10324, lichArguments: '--shattered',                family: 'GS4' },
]

export function gameOptionFromPort(port: number): GameOption {
  return GAMES.find(g => g.port === port) ?? GAMES[0]
}

// Look up a game by its code, with a safe fallback. Used by anywhere that
// needs to derive port + lichArguments from a saved character.game field.
export function gameOptionByCode(code: string): GameOption {
  return GAMES.find(g => g.code === code) ?? GAMES[0]
}
