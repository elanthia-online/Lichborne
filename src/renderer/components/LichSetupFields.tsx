// LichSetupFields — the ONE editor for the pre-connect Lich configuration:
// Ruby path, Lich path (lich.rbw), the Lich Frontend flag (+ its lock), an
// Auto Detect button with its result banner, and a read-only Games List of
// shard → Lich port from `GAMES`.
//
// Controlled: `adv` in, `setAdv(updater)` out — it never persists anything
// itself. Two render sites host it, both wrapping it in `.login-form` for the
// input/label styling it relies on: LichSetupDialog (the launcher ⚙, and what
// Settings opens) with `alwaysShowFields`, and the legacy LoginScreen, where
// direct-connect collapses it to a one-line note. Two probes, deliberately
// different: the per-field ✓/✕ is a debounced, unprompted existence check
// that reads ONLY the `*AlreadyValid` flags (so it can never imply a path is
// fine because one was found elsewhere) and keeps `probeDesktop` OFF; Auto
// Detect is the only call that passes `probeDesktop: true`, because probing
// the Mac Desktop raises a macOS privacy prompt that must follow a click.
// Platform copy comes from `IS_WINDOWS` / `IS_MAC`; the Ruby-version advisory
// is phrased conditionally because it reads the RUBY version, not Lich's.

import { useState, useEffect } from 'react'
import { type AdvancedSettings, type LichInstall, ADV_DEFAULTS, GAMES, IS_WINDOWS, IS_MAC, richStreamSettingText, effectiveRichStream, RICH_STREAM_DEFAULT_LABEL } from '../lichSettings'
import type { GameFamily, RichStreamMode } from '../../shared/types'
import { gameFamilyName } from '../../shared/types'
import LichInstallFields, { pathKindProblem } from './LichInstallFields'

// Platform-aware copy (v0.18.0): where the canonical Lich install lives and
// what the interpreter file is called — Windows = the Ruby4Lich5 one-click
// installer; Linux/Mac = the elanthia-online wiki layout (~/Lich5, rbenv).
const LICH_HOME_LABEL = IS_WINDOWS ? 'C:\\Ruby4Lich5' : IS_MAC ? '~/Lich5 (or ~/Desktop/Lich5)' : '~/Lich5'
const RUBY_FILE_LABEL = IS_WINDOWS ? 'ruby.exe' : 'ruby'
// Shown under a Ruby/Lich warning so the player has somewhere to go.
const LICH_INSTALL_GUIDE = 'https://github.com/elanthia-online/lich-5/wiki/Documentation-for-Installing-and-Upgrading-Lich'

// One game's install row (DESIGN §56.7.1). Module scope, so its open state
// survives the parent's re-renders (UX #4). "Same as above" REMOVES the entry
// (B544: only an explicit choice is stored); "Its own install" seeds an empty
// one, which loadAdvanced drops again if it is closed without a Lich path.
function GameInstallRow({ family, adv, setAdv, disabled }: {
  family: GameFamily
  adv: AdvancedSettings
  setAdv: Props['setAdv']
  disabled: boolean
}) {
  const stored = adv.installs?.[family]
  const [own, setOwn] = useState(stored !== undefined)
  // The last install this row held. "Same as above" deletes the entry and
  // Lich Setup saves every edit at once, so without this a Same → Its own
  // round trip came back blank; Edit Profile's row restores its value the
  // same way.
  const [lastOwn, setLastOwn] = useState<LichInstall | undefined>(stored)
  function setInstall(next: LichInstall | undefined) {
    if (next) setLastOwn(next)
    setAdv(prev => {
      const installs = { ...prev.installs }
      if (next) installs[family] = next
      else delete installs[family]
      return { ...prev, installs: Object.keys(installs).length ? installs : undefined }
    })
  }
  return (
    <div className="lich-game-install">
      <label>
        {gameFamilyName(family)}
        <select
          value={own ? 'own' : 'same'}
          disabled={disabled}
          onChange={e => {
            const o = e.target.value === 'own'
            setOwn(o)
            setInstall(o ? (stored ?? lastOwn ?? { lichPath: '', rubyPath: '' }) : undefined)
          }}
        >
          <option value="same">Same as the install above</option>
          <option value="own">Its own install</option>
        </select>
      </label>
      {own && (
        <LichInstallFields
          value={stored ?? { lichPath: '', rubyPath: '' }}
          onChange={setInstall}
          inheritedRuby={adv.rubyPath}
          disabled={disabled}
        />
      )}
    </div>
  )
}

type DiscoveryResult = Awaited<ReturnType<typeof window.api.discoverLichPaths>> | null

interface Props {
  adv: AdvancedSettings
  setAdv: (updater: (prev: AdvancedSettings) => AdvancedSettings) => void
  disabled?: boolean
  // When true the component renders even if useLich is false (e.g. inside
  // SettingsPanel where the user may want to configure Lich preemptively).
  // When false (login form context), an inline note replaces the fields if
  // direct-connect is selected.
  alwaysShowFields?: boolean
}

export default function LichSetupFields({ adv, setAdv, disabled = false, alwaysShowFields = false }: Props) {
  // v0.8.0 dropped `lichDelay` and `hideLichWindow` from AdvancedSettings —
  // delay was vestigial after the connect-with-retry rework (the only use was
  // a `Math.max(..., 30)` floor in ConnectionManager, now hardcoded to 30s);
  // the hide-window toggle is gone because Lich always launches hidden now
  // (stderr is still piped to the error banner, so the visible cmd.exe console
  // offered no diagnostic value the banner doesn't).
  const { useLich, lichPath, rubyPath, lichMode, modeLocked } = adv
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult>(null)
  // Do the CURRENTLY CONFIGURED paths exist? Answered on open and whenever a
  // path is edited, independently of Auto Detect.
  //
  // Until v0.18.2 the ✓/✕ next to each field derived from `discoveryResult`,
  // which is null until Auto Detect is clicked — so opening Lich Setup on a
  // machine with an EMPTY Ruby path (the deliberate macOS/Linux default) showed
  // no ✕, no warning, nothing at all. The one screen that could have told our
  // first Mac tester what was wrong stayed silent unless he happened to press a
  // button (Sekmeht: "is there an indicator saying the lich path is invalid?").
  //
  // Uses ONLY the *AlreadyValid flags — "does this path exist" — never the
  // discovered candidates, so it cannot imply a path is fine because one was
  // found elsewhere. probeDesktop is off: this runs unprompted, and the Desktop
  // probe raises a macOS privacy dialog that must only ever follow a click.
  const [pathsExist, setPathsExist] = useState<{ ruby: boolean; lich: boolean; rich: boolean } | null>(null)
  useEffect(() => {
    if (!useLich && !alwaysShowFields) return
    let cancelled = false
    // Debounced: this fires per keystroke while a path is being typed.
    const t = setTimeout(() => {
      window.api.discoverLichPaths(rubyPath, lichPath)
        .then(r => { if (!cancelled) setPathsExist({ ruby: r.rubyAlreadyValid, lich: r.lichAlreadyValid, rich: r.richStreamSupported }) })
        .catch(() => { if (!cancelled) setPathsExist(null) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [rubyPath, lichPath, useLich, alwaysShowFields])

  function setAdv1<K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) {
    setAdv(prev => ({ ...prev, [key]: value }))
  }

  // Reset discovery banner if the parent toggles useLich off then on again.
  useEffect(() => {
    if (!useLich && !alwaysShowFields) setDiscoveryResult(null)
  }, [useLich, alwaysShowFields])

  async function runDiscovery() {
    // probeDesktop: the Mac wiki install lands in ~/Desktop/Lich5, and probing
    // the Desktop fires the macOS privacy consent prompt — acceptable here
    // (the user just clicked Auto Detect), never from silent startup discovery.
    const found = await window.api.discoverLichPaths(rubyPath, lichPath, { probeDesktop: true, interactive: true })
    setDiscoveryResult(found)
    if (found.rubyPath) setAdv1('rubyPath', found.rubyPath)
    if (found.lichPath) setAdv1('lichPath', found.lichPath)
  }

  if (!useLich && !alwaysShowFields) {
    return <p className="advanced-direct-note">No advanced settings for connecting directly.</p>
  }

  // Pre-v0.18.0 this keyed on isWindows (discovery early-returned empty on
  // other platforms); the handler now probes every platform, so the banner
  // renders everywhere.
  const dr = discoveryResult
  // The BANNER still speaks for the last Auto Detect (it reports what discovery
  // found). The per-field icons prefer the live existence check, so they always
  // describe the path actually in the box — falling back to the discovery view
  // only before the first check resolves.
  // The same wrong-kind check the per-game and per-character rows run
  // (pathKindProblem): a swapped default install showed two ✓ and failed to
  // launch, while the rows beneath it would have flagged it.
  const kindProblem = pathKindProblem(lichPath, rubyPath)
  const rubyExists = pathsExist ? pathsExist.ruby : dr ? (dr.rubyAlreadyValid || dr.rubyPath !== null) : null
  const lichExists = pathsExist ? pathsExist.lich : dr ? (dr.lichAlreadyValid || dr.lichPath !== null) : null
  const rubyOk = kindProblem?.ruby ? false : rubyExists
  const lichOk = kindProblem?.lich ? false : lichExists
  // Banner-only view, so the Auto Detect summary keeps its original meaning.
  const drRubyOk = dr ? (dr.rubyAlreadyValid || dr.rubyPath !== null) : null
  const drLichOk = dr ? (dr.lichAlreadyValid || dr.lichPath !== null) : null

  let statusEl: React.ReactNode = null
  if (dr) {
    const rubyNew = dr.rubyPath !== null
    const lichNew = dr.lichPath !== null
    let type: 'ok' | 'warn' | 'error'
    let msg: string
    if (!dr.baseFolderExists && !drRubyOk && !drLichOk) {
      type = 'error'
      msg = `No ${LICH_HOME_LABEL} folder found. If Lich is installed somewhere else, use Browse to pick ${RUBY_FILE_LABEL} and lich.rbw. If it isn't installed yet, install it first, then click Auto-detect.`
    } else if (drRubyOk && drLichOk) {
      if (dr.rubyMovedToCurrent && !lichNew) {
        // A working Ruby that was pinned to one version folder, now on
        // Ruby4Lich5's `current` link (rubyCurrent.ts in main). Named from
        // the real path, since the install may not be on C:.
        const link = (dr.rubyPath ?? '').replace(/[\\/]bin[\\/]rubyw?\.exe$/i, '')
        type = 'ok'
        msg = `Ruby now uses ${link}, which the Ruby for Lich installer keeps pointed at your newest Ruby. Nothing else to do.`
      } else if (rubyNew || lichNew) {
        const found = [rubyNew && 'Ruby', lichNew && 'Lich5'].filter(Boolean).join(' and ')
        type = 'ok'
        msg = `${found} path${rubyNew && lichNew ? 's' : ''} auto-discovered — verify before connecting.`
      } else {
        type = 'ok'
        msg = 'Both paths verified successfully.'
      }
    } else if (!drRubyOk && !drLichOk) {
      type = 'warn'
      msg = `Ruby and Lich5 weren't found in ${LICH_HOME_LABEL}. Install or repair Lich, then click Auto-detect again, or use Browse to pick ${RUBY_FILE_LABEL} and lich.rbw yourself.`
    } else if (!drRubyOk) {
      type = 'warn'
      msg = IS_WINDOWS
        ? `Ruby (${RUBY_FILE_LABEL}) wasn't found. Reinstall Ruby for Lich (it also restores C:\\Ruby4Lich5\\current), then click Auto-detect again, or use Browse to pick ${RUBY_FILE_LABEL} yourself.`
        : `Ruby (${RUBY_FILE_LABEL}) wasn't found. Install Ruby 4, then click Auto-detect again, or use Browse to pick it yourself.`
    } else {
      type = 'warn'
      msg = `Lich5 (lich.rbw) wasn't found in ${LICH_HOME_LABEL}. Install or repair Lich, then click Auto-detect again, or use Browse to pick lich.rbw yourself.`
    }
    statusEl = (
      <div className={`lich-discovery-status lich-discovery-status--${type}`}>
        <span className="lich-discovery-icon">{type === 'ok' ? '✓' : type === 'warn' ? '⚠' : '✕'}</span>
        <span>
          {msg}
          {type !== 'ok' && (
            <>
              {' '}
              <a
                href={LICH_INSTALL_GUIDE}
                title={LICH_INSTALL_GUIDE}
                onClick={e => { e.preventDefault(); window.api.openUrl(LICH_INSTALL_GUIDE) }}
              >
                Lich install guide
              </a>
            </>
          )}
        </span>
      </div>
    )
  }

  // Ruby-version advisory (v0.18.0): Lich 5.18+ hard-requires Ruby 4.0 and
  // refuses to launch on older interpreters — surface it at setup time instead
  // of as a cryptic failed-launch banner. The Fedora wiki path installs the
  // system Ruby (3.3/3.4), which is exactly this trap. Version-unknown
  // (rubyVersion null) is silent — the probe is best-effort.
  const rubyMajor = dr?.rubyVersion ? parseInt(dr.rubyVersion.split('.')[0], 10) : null
  const rubyVersionEl = rubyMajor !== null && rubyMajor < 4 ? (
    <div className="lich-discovery-status lich-discovery-status--warn">
      <span className="lich-discovery-icon">⚠</span>
      {/* Reads the RUBY version, not Lich's — so it's phrased conditionally.
          A user deliberately pinned to Lich 5.17 on Ruby 3.x is fine, and
          shouldn't be told a failure is coming that isn't. */}
      <span>{`Ruby ${dr!.rubyVersion} detected — if you're on Lich 5.18 or newer it requires Ruby 4.0+ and won't start. Upgrade Ruby (rbenv install 4.0.5) or point the path at a newer interpreter.`}</span>
    </div>
  ) : null

  return (
    <>
      <div className="lich-detect-row">
        <button
          type="button"
          className="btn-auto-detect"
          onClick={runDiscovery}
          title={`Look for Ruby and lich.rbw in the usual install location (${LICH_HOME_LABEL}) and fill in what's found`}
        >
          ↺ Auto-detect
        </button>
      </div>
      {statusEl}
      {rubyVersionEl}
      <label>
        {`Ruby path (${RUBY_FILE_LABEL})`}
        <div className="path-input-row">
          <input
            type="text"
            value={rubyPath}
            onChange={e => setAdv1('rubyPath', e.target.value)}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn-browse"
            disabled={disabled}
            onClick={async () => {
              // The .exe filter is Windows-only — Linux/Mac ruby binaries have
              // no extension, so an exe filter would hide them entirely.
              const p = await window.api.browseFile(
                IS_WINDOWS
                  ? [{ name: 'Ruby Executable', extensions: ['exe'] }]
                  : [{ name: 'All Files', extensions: ['*'] }]
              )
              if (p) setAdv1('rubyPath', p)
            }}
          >Browse…</button>
          {rubyOk === true  && <span className="path-status-icon path-status-icon--valid">✓</span>}
          {rubyOk === false && <span className="path-status-icon path-status-icon--invalid">✕</span>}
        </div>
      </label>
      <label>
        Lich path (lich.rbw)
        <div className="path-input-row">
          <input
            type="text"
            value={lichPath}
            onChange={e => setAdv1('lichPath', e.target.value)}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn-browse"
            disabled={disabled}
            onClick={async () => {
              const p = await window.api.browseFile([{ name: 'Lich Script', extensions: ['rbw', 'rb'] }])
              if (p) setAdv1('lichPath', p)
            }}
          >Browse…</button>
          {lichOk === true  && <span className="path-status-icon path-status-icon--valid">✓</span>}
          {lichOk === false && <span className="path-status-icon path-status-icon--invalid">✕</span>}
        </div>
      </label>
      {kindProblem && (
        <div className="lich-discovery-status lich-discovery-status--warn" role="alert">
          <span className="lich-discovery-icon">⚠</span>
          <span>{kindProblem.message}</span>
          {kindProblem.swapped && (
            <button
              type="button"
              className="ui-btn"
              disabled={disabled}
              onClick={() => setAdv(prev => ({ ...prev, lichPath: prev.rubyPath, rubyPath: prev.lichPath }))}
            >Swap them</button>
          )}
        </div>
      )}
      {/* "Frontend" is Lich's own term for these flags — each (--stormfront,
          --wizard, --avalon, --frostbite, --genie) sets Lich's $frontend
          (lib/main/argv_options.rb: determine_frontend / $frontend). Labeled to
          match so the value lines up with Lich docs / support requests. */}
      <label>
        Lich frontend
        <div className="port-input-row">
          <select
            value={lichMode}
            onChange={e => setAdv1('lichMode', e.target.value as AdvancedSettings['lichMode'])}
            disabled={disabled || modeLocked}
            className={modeLocked ? 'port-locked' : ''}
          >
            <option value="--stormfront">--stormfront</option>
            <option value="--wizard">--wizard</option>
            <option value="--avalon">--avalon</option>
            <option value="--frostbite">--frostbite</option>
            <option value="--genie">--genie</option>
          </select>
          <button
            type="button"
            className={`btn-lock ${modeLocked ? 'btn-lock--locked' : 'btn-lock--unlocked'}`}
            // An icon-only button: the tooltip is its label, so it says what
            // the click does — locking also resets the frontend (UX #8).
            title={modeLocked
              ? 'Unlock to choose a different frontend'
              : `Lock to the recommended frontend (${ADV_DEFAULTS.lichMode})`}
            aria-label={modeLocked ? 'Unlock frontend' : 'Lock frontend'}
            disabled={disabled}
            onClick={() => setAdv(prev => ({
              ...prev,
              modeLocked: !prev.modeLocked,
              ...(!prev.modeLocked ? { lichMode: ADV_DEFAULTS.lichMode } : {}),
            }))}
          >
            {modeLocked ? '🔒' : '🔓'}
          </button>
        </div>
      </label>

      {/* DragonRealms' rich ("Saga") stream (v0.21.0, DESIGN §55.11). The line
          under it reads the CONFIGURED install, which is what 'auto' checks at
          connect; it says nothing until the path check has answered. */}
      <label>
        Game stream
        <select
          value={adv.richStream === undefined || adv.richStream === 'auto' ? 'default' : adv.richStream}
          onChange={e => {
            // 'default' REMOVES the key (B544): no choice is stored as absent,
            // so Lichborne's default can change later and reach this machine.
            const v = e.target.value
            setAdv1('richStream', v === 'default' ? undefined : (v as RichStreamMode))
          }}
          disabled={disabled}
          title={richStreamSettingText(adv)}
        >
          <option value="default">{RICH_STREAM_DEFAULT_LABEL}</option>
          <option value="off">Legacy stream</option>
          <option value="on">Rich (Saga) always</option>
        </select>
      </label>
      <div className="ui-hint lich-stream-hint">
        {richStreamSettingText(adv)}{' '}
        {effectiveRichStream(adv) !== 'off' && pathsExist && (pathsExist.rich
          ? 'Your default Lich supports it.'
          : effectiveRichStream(adv) === 'auto'
            ? "Your default Lich doesn't yet: update Lich to 5.23.0 or later. Until then you get the legacy stream."
            : "Your default Lich doesn't yet: update Lich to 5.23.0 or later, or the game will answer the request once as an unknown command.")}
        {' '}Direct connections (no Lich) always use the legacy stream. Takes effect on your next connect.
      </div>

      {/* Per-game installs (DESIGN §56.7.1): Lich Setup only, never the
          legacy LoginScreen, which connects from the default install. */}
      {alwaysShowFields && (
        <>
          <div className="ui-section-label ui-section-label--rule">Lich install by game</div>
          <div className="ui-hint lich-stream-hint">
            Every character uses the install above unless its game has its own. Give a game its own install to run its characters from a different Lich folder; a single character can have its own in Edit Profile. Takes effect on the next connect.
          </div>
          {(['DR', 'GS4'] as const).map(f => (
            <GameInstallRow key={f} family={f} adv={adv} setAdv={setAdv} disabled={disabled} />
          ))}
        </>
      )}

      {/* Read-only inventory of the game shards and the Lich front-end port each
          one uses by convention. Surfaced here so users can verify against their
          local Lich install. The actual game-per-character is picked in the Add
          Character wizard; nothing in this block is configurable. */}
      <div className="games-list">
        <div className="games-list-label">Games list</div>
        <div className="games-list-grid">
          {GAMES.map(g => (
            <div key={g.code} className="games-list-item">
              <span className="games-list-code">{g.code}</span>
              <span className="games-list-name">{g.name}</span>
              <span className="games-list-port">port {g.port}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
