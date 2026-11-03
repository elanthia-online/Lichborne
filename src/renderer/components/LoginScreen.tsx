// LoginScreen — the LEGACY single-character login form, kept as the type host
// for `SessionInfo`.
//
// Nothing renders this component any more: the Launcher + AddCharacterWizard
// own the modern connect flow, and every import of this file elsewhere
// (App, SessionsContext, GameWindow, LichDashboard) is `import type
// { SessionInfo }`. The form itself still shows the old shape of a connect —
// build `LoginCredentials`, `window.api.login`, then import the character's
// YAML into localStorage and export shared + character profiles before
// handing `onConnected` a `SessionInfo`. Two limits its own comments record:
// the game is INFERRED from the global `lichPort` (this screen has no
// `character.game` to consult — the wizard supersedes it for multi-shard
// setups), and `document.title` is owned by AppShell, not here. It shares
// `LichSetupFields` (wrapped in `.login-form` for CSS scoping) with the
// Lich Setup dialog. Don't extend it; add to the Launcher/Wizard path instead.

import { profileKey } from '../../shared/profileKey'
import { useState, useEffect, useRef } from 'react'
import { LoginCredentials } from '../../shared/types'
import { exportSharedProfile, exportCharacterProfile, importSharedProfile, importCharacterProfile, clearCharacterLocalStorage } from '../profile'
import { useSessions } from '../SessionsContext'
import {
  type AdvancedSettings,
  loadAdvanced,
  saveAdvanced,
  gameCodeFromPort,
  gameOptionByCode,
  effectiveRichStream,
} from '../lichSettings'
import LichSetupFields from './LichSetupFields'
import '../styles/login.css'

const ACCOUNT_KEY  = 'lichborne.account'
const REMEMBER_KEY = 'lichborne.rememberPassword'

import type { SessionId } from '../../shared/types'

export interface SessionInfo {
  sessionId: SessionId
  account: string
  character: string
  game: string
  useLich: boolean
  // Attach mode: the detachable listener this session came from.
  // Presence flips the tab's Reconnect from relaunch-login to re-attach.
  attach?: { host: string; port: number }
  // The Lich install this session started from (DESIGN §56.7.1); read through
  // useSessionLichPath. Absent on sessions from before it was carried.
  lichPath?: string
}

interface Props {
  onConnected: (session: SessionInfo) => void
  // When true, this LoginScreen is mounted as the "Add Character" modal over
  // existing tabs. In that mode it doesn't touch document.title (the active
  // tab's GameWindow owns it).
  isModal?: boolean
}

export default function LoginScreen({ onConnected, isModal = false }: Props) {
  const { sessions } = useSessions()
  const [account, setAccount] = useState(() => localStorage.getItem(ACCOUNT_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [character, setCharacter] = useState('')
  const [rememberPassword, setRememberPassword] = useState(() => localStorage.getItem(REMEMBER_KEY) === 'true')

  const [adv, setAdv] = useState<AdvancedSettings>(loadAdvanced)
  const { useLich, lichPath, rubyPath, lichPort, lichMode, showAdvanced } = adv
  function setAdv1<K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) {
    setAdv(prev => ({ ...prev, [key]: value }))
  }
  const [statusLog, setStatusLog] = useState<string[]>([])
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const statusLogRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef(account)
  const characterRef = useRef(character)
  const advRef = useRef(adv)
  useEffect(() => { accountRef.current = account }, [account])
  useEffect(() => { characterRef.current = character }, [character])
  useEffect(() => { advRef.current = adv }, [adv])

  useEffect(() => {
    saveAdvanced(adv)
    // Write _shared.yaml so a second instance opening concurrently gets current
    // settings — separate Electron processes can't share localStorage (LevelDB lock).
    const t = setTimeout(() => exportSharedProfile().catch(console.error), 1000)
    return () => clearTimeout(t)
  }, [adv])
  // document.title is owned by AppShell now — it watches the active session
  // and re-applies on tab switch / add / disconnect.

  useEffect(() => {
    if (!account) return
    let cancelled = false
    window.api.loadPassword(account).then(pw => { if (!cancelled && pw !== null) setPassword(pw) })
    return () => { cancelled = true }
  }, [account])

  // Load _shared.yaml on startup → refresh login form with saved account and Lich settings
  useEffect(() => {
    importSharedProfile().then(() => {
      setAdv(loadAdvanced())
      setAccount(localStorage.getItem(ACCOUNT_KEY) ?? '')
    }).catch(console.error)
  }, [])

  useEffect(() => {
    const el = statusLogRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [statusLog])

  useEffect(() => {
    // Status pushes carry sessionId now, but the login screen only ever has one
    // connect attempt in flight at a time so unfiltered append is fine here.
    const unsub = window.api.onConnectionStatus((s) => {
      setStatusLog(prev => [...prev, s.message])
    })
    const unsubErr = window.api.onError((payload) => {
      setError(payload.message)
      setStatusLog(prev => [...prev, `ERROR: ${payload.message}`])
      setConnecting(false)
    })
    return () => { unsub(); unsubErr() }
  }, [])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!character.trim()) {
      setError('Please enter your character name.')
      return
    }

    // DragonRealms allows only one active character per SimuCo account. If a
    // session for this account is already connected, blocking here avoids the
    // server-side kick (which surfaces to the player as a confusing "Invalid
    // login key" error and would drop their existing character).
    const conflict = sessions.find(s => s.account.toLowerCase() === account.toLowerCase() && s.status.connected)
    if (conflict) {
      setError(`${conflict.character} is already connected on account ${account}. Disconnect them first to log in another character on this account.`)
      return
    }

    setError('')
    setStatusLog([])
    setConnecting(true)

    // LoginScreen is the legacy single-character path (Launcher/Wizard own the
    // modern flow per CLAUDE.md). Game is inferred from the global lichPort
    // here since this screen has no character.game field to consult — the
    // wizard supersedes this for any multi-shard setup.
    const inferredGame = gameCodeFromPort(lichPort)
    const gameOpt = gameOptionByCode(inferredGame)
    const creds: LoginCredentials = {
      account,
      password,
      character: character.trim(),
      game: inferredGame,
      lichArguments: gameOpt.lichArguments,
      useLich,
      lichPath,
      rubyPath,
      lichPort: gameOpt.port,
      lichMode,
      richStream: effectiveRichStream(adv),
    }

    const result = await window.api.login(creds)
    if (!result.ok) {
      // Defense-in-depth: if the same-account guard above somehow misses (a
      // race where the existing session is mid-disconnect, or Simu's error
      // wording changes), translate the cryptic "Invalid login key" into a
      // hint about the most common cause.
      const raw = result.error ?? 'Connection failed'
      const friendly = /invalid login key/i.test(raw)
        ? `${raw} — this usually means another character on account ${account} is already connected. Disconnect them first.`
        : raw
      setError(friendly)
      setConnecting(false)
      return
    }

    if (rememberPassword) window.api.savePassword(account, password)
    else                  window.api.deletePassword(account)

    const acc = accountRef.current
    const chr = characterRef.current.trim()
    const curAdv = advRef.current
    const game = gameCodeFromPort(curAdv.lichPort)

    // Import character YAML first so saved settings repopulate localStorage.
    // Missing YAML → clear stale localStorage so the new profile starts blank.
    const key = profileKey(chr, game)   // DESIGN §56.7.3
    try {
      const loaded = await importCharacterProfile(key)
      if (!loaded) clearCharacterLocalStorage(key)
    } catch (err) { console.error(err) }

    try {
      await Promise.all([
        exportSharedProfile(),
        exportCharacterProfile(acc, key, game, curAdv.useLich),
      ])
    } catch (err) { console.error(err) }

    onConnected({ sessionId: result.sessionId, account: acc, character: chr, game, useLich: curAdv.useLich })
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <h1>Lichborne</h1>
          <p>DragonRealms Client</p>
          <p className="login-version">v{__APP_VERSION__}</p>
        </div>

        {connecting ? (
          <div className="connecting-state">
            <div className="spinner" />
            <div className="status-log" ref={statusLogRef}>
              {statusLog.length === 0 && <span className="status-log-line">Starting...</span>}
              {statusLog.map((line, i) => (
                <span key={i} className={`status-log-line${line.startsWith('ERROR') ? ' status-log-error' : ''}`}>
                  {line}
                </span>
              ))}
            </div>
          </div>
        ) : (
        <form onSubmit={handleConnect} className="login-form">
          <label>
            Account Name
            <input
              type="text"
              value={account}
              onChange={e => { setAccount(e.target.value); localStorage.setItem(ACCOUNT_KEY, e.target.value) }}
              autoComplete="username"
              autoFocus
              required
              disabled={connecting}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={connecting}
            />
          </label>

          <label>
            Character Name
            <input
              type="text"
              value={character}
              onChange={e => setCharacter(e.target.value)}
              placeholder="e.g. Katasha"
              required
              disabled={connecting}
            />
          </label>

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={e => {
                  const val = e.target.checked
                  setRememberPassword(val)
                  localStorage.setItem(REMEMBER_KEY, String(val))
                }}
                disabled={connecting}
              />
              Remember password
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useLich}
                onChange={e => setAdv1('useLich', e.target.checked)}
                disabled={connecting}
              />
              Connect via Lich (recommended)
            </label>
          </div>

          <div className="advanced-toggle" onClick={() => !connecting && setAdv1('showAdvanced', !showAdvanced)}>
            {showAdvanced ? '▾' : '▸'} Advanced / Lich Settings
          </div>

          {showAdvanced && (
            <div className="advanced-panel">
              <LichSetupFields adv={adv} setAdv={setAdv} disabled={connecting} />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn-primary">
            {useLich ? '⚡ Connect via Lich' : '⬡ Connect Direct'}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
