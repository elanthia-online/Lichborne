// Shared Lich/advanced-connect settings used by both LoginScreen (login form)
// and SettingsPanel (in-session edits). Persisted to localStorage; replicated
// to _shared.yaml by callers so concurrent Electron processes stay in sync.

import { RICH_STREAM_DEFAULT, gameFamilyFromCode, type GameFamily, type RichStreamMode } from '../shared/types'

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
  // DragonRealms' rich ("Saga") stream through Lich (v0.21.0, DESIGN §55.11):
  // see RichStreamMode in shared/types.ts. ABSENT = no choice made, which
  // resolves to RICH_STREAM_DEFAULT (rich when Lich supports it) at every use via
  // effectiveRichStream(). It is stored only when the player picks a mode
  // (B544): saveAdvanced writes the whole object, so a stored default would
  // become a permanent "choice" and a later change of the default would reach
  // nobody. 'auto' = on whenever the Lich install supports it (5.23.0+).
  richStream?: RichStreamMode
  // Per-game Lich installs (DESIGN §56.7.1). ABSENT for a game = it uses the
  // default install above (`lichPath` / `rubyPath`). Stored only when the
  // player sets one, by the same rule as richStream, so the default keeps
  // reaching everyone who never chose.
  installs?: Partial<Record<GameFamily, LichInstall>>
}

/** A Lich install: lich.rbw and the Ruby that runs it. They travel together,
 *  because Lich 5.18+ refuses to start on an older Ruby. An empty rubyPath
 *  means "the default install's Ruby". */
export interface LichInstall {
  lichPath: string
  rubyPath: string
}

/** Where a resolved install came from, for /lich install and the UI. */
export type LichInstallSource = 'character' | 'game' | 'default'

export interface ResolvedLichInstall extends LichInstall {
  source: LichInstallSource
}

/** A stored install, or undefined for anything without a Lich path. */
export function coerceLichInstall(v: unknown): LichInstall | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (typeof o.lichPath !== 'string' || !o.lichPath.trim()) return undefined
  return { lichPath: o.lichPath, rubyPath: typeof o.rubyPath === 'string' ? o.rubyPath : '' }
}

/** Stored per-game installs, keeping only readable entries; undefined when none. */
export function coerceInstalls(v: unknown): AdvancedSettings['installs'] {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const out: Partial<Record<GameFamily, LichInstall>> = {}
  for (const fam of ['DR', 'GS4'] as const) {
    const inst = coerceLichInstall(o[fam])
    if (inst) out[fam] = inst
  }
  return Object.keys(out).length ? out : undefined
}

/** The install a character on `game` uses: its own override, else its game's
 *  install, else the default. Pure, so the harness can drive it. */
export function resolveLichInstall(
  adv: Pick<AdvancedSettings, 'lichPath' | 'rubyPath' | 'installs'>,
  game: string,
  override?: LichInstall,
): ResolvedLichInstall {
  const pick = (inst: LichInstall, source: LichInstallSource): ResolvedLichInstall =>
    ({ lichPath: inst.lichPath, rubyPath: inst.rubyPath || adv.rubyPath, source })
  if (override?.lichPath) return pick(override, 'character')
  const forGame = adv.installs?.[gameFamilyFromCode(game)]
  if (forGame?.lichPath) return pick(forGame, 'game')
  return { lichPath: adv.lichPath, rubyPath: adv.rubyPath, source: 'default' }
}

/** resolveLichInstall for a saved character, reading its override from its
 *  profile at connect time. Read fresh rather than taken from a launcher card,
 *  because a tab's Reconnect builds its card from the session record. */
export async function resolveCharacterLichInstall(
  adv: AdvancedSettings,
  character: string,
  game: string,
): Promise<ResolvedLichInstall> {
  const raw = await window.api.readCharacterProfile(character).catch(() => null)
  const override = raw && typeof raw === 'object' ? coerceLichInstall((raw as { lich?: unknown }).lich) : undefined
  return resolveLichInstall(adv, game, override)
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
  // richStream deliberately absent: see the field's comment.
}

/** A stored mode, or undefined for "no choice" (and for anything unreadable). */
export function coerceRichStream(v: unknown): RichStreamMode | undefined {
  return v === 'on' || v === 'off' || v === 'auto' ? v : undefined
}

/** The mode a connection uses: the player's choice, else Lichborne's default. */
export function effectiveRichStream(adv: Pick<AdvancedSettings, 'richStream'>): RichStreamMode {
  return adv.richStream ?? RICH_STREAM_DEFAULT
}

/** The label for the "no choice" option, shared by Lich Setup and /richstream. */
export const RICH_STREAM_DEFAULT_LABEL = 'Rich (Saga) stream (default)'

// One sentence per mode, shared by Lich Setup and /richstream so they can't
// describe the same setting differently. For an UNSET setting, callers show
// richStreamSettingText(), which names the default and then its sentence.
export function richStreamModeText(mode: RichStreamMode): string {
  switch (mode) {
    case 'auto': return 'Rich (Saga) — Lichborne asks for it whenever your Lich supports it (5.23.0 or later); older Lich gets the legacy stream.'
    case 'on':   return 'Always — asked for on every Lich connection, including an attach to another machine.'
    case 'off':  return 'Legacy stream — the older stream, as before v0.21.0. Lich 5.23 or later converts the rich one for you.'
  }
}

/** The setting as a sentence: the chosen mode's, or the default named as such. */
export function richStreamSettingText(adv: Pick<AdvancedSettings, 'richStream'>): string {
  const text = richStreamModeText(effectiveRichStream(adv))
  return adv.richStream === undefined ? `Default: ${text}` : text
}

export function loadAdvanced(): AdvancedSettings {
  try {
    const s = { ...ADV_DEFAULTS, ...JSON.parse(localStorage.getItem(ADV_KEY) ?? '{}'), showAdvanced: false }
    return { ...s, richStream: coerceRichStream(s.richStream), installs: coerceInstalls(s.installs) }
  } catch { return { ...ADV_DEFAULTS } }
}

export function saveAdvanced(s: AdvancedSettings) {
  localStorage.setItem(ADV_KEY, JSON.stringify(s))
}

export function gameCodeFromPort(port: number): string {
  return gameOptionFromPort(port).code
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
