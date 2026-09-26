// preload — the contextBridge boundary. Everything the renderer may ask of the
// main process is a method on `window.api`, defined here (typed for the
// renderer in src/renderer/global.d.ts — keep the two in lockstep).
//
//  • Channel names come from THE ONE shared IPC map (`const CH = IPC`,
//    shared/types.ts). Main and preload each used to keep a private partial
//    copy, and a channel present in one but not the other registered a
//    listener on the literal channel "undefined" — silent in both directions
//    (pitfall #127). Import the shared map; never re-fork it.
//  • Every `on*` push subscription RETURNS its unsubscribe function — renderer
//    effects rely on that for cleanup.
//  • Per-session calls take the SessionId main's login minted, threaded by the
//    renderer through every call (Principle #6). App-level surfaces (updater,
//    profile I/O, SimuCoin — which is per ACCOUNT) deliberately take none.
//  • AI keys travel one way: set/clear go down; aiKeyStatus returns booleans
//    only — a key never comes back up.
//  • `platform` / `arch` / `isAppImage` are plain values, not calls — the
//    sandboxed preload can read `process` synchronously, saving platform-
//    branching UI an IPC round-trip.
//
// The method-level contracts (why disconnectAwait exists, why sendUserText
// echoes while sendCommand writes straight to the socket, why catchup returns
// a digest instead of rows) live in the inline comments below — read the
// neighbours before adding a sibling method.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  GameEventBatch, ConnectionStatusPayload, RawXmlPayload, ErrorPayload,
  LichScriptsUpdatePayload, LoginResult, SessionId, SessionRosterPayload, RosterEntry,
  SessionLogAppendPayload, SessionLogDay, SessionLogSearchHit,
  SessionLogExportSpec, SessionLogExportResult, SessionLogDiskUsage, SessionLogWindowRow,
  CatchupDigest, CatchupProgress,
  AICapability, AIKeyStatus, AITestResult, AIChatRequest, AIChatChunk, AIChatDone, AIChatError,
  SimuCoinStatus, UserTextPayload, CharacterNotice, RoutedToast,
} from '../shared/types'

// One shared list — see the note on IPC in shared/types.ts.
const CH = IPC

contextBridge.exposeInMainWorld('api', {
  // ── Session lifecycle ────────────────────────────────────────────────────────
  // login mints a fresh SessionId in main on success. Renderer keeps that id and
  // threads it through every per-session call below.
  login: (creds: unknown): Promise<LoginResult> =>
    ipcRenderer.invoke(CH.LOGIN, creds),

  // Attach to an already-running detachable Lich session (no SGE, no spawn —
  // AttachCredentials, not LoginCredentials).
  loginAttach: (creds: unknown): Promise<LoginResult> =>
    ipcRenderer.invoke(CH.LOGIN_ATTACH, creds),

  sendCommand: (sessionId: SessionId, command: string) =>
    ipcRenderer.send(CH.SEND_COMMAND, sessionId, command),

  // v0.19.0: run `text` as if it had been typed in that character's own command
  // bar. Main routes it to the OWNING window (the target may be in a decoupled
  // one), whose GameWindow puts it through `dispatchUserText` — so it echoes and
  // logs, unlike `sendCommand`, which writes straight to the socket.
  sendUserText: (sessionId: SessionId, text: string) =>
    ipcRenderer.send(CH.SEND_USER_TEXT, sessionId, text),

  disconnect: (sessionId: SessionId) =>
    ipcRenderer.send(CH.DISCONNECT, sessionId),

  // Awaitable disconnect (v0.8.0). Use when the caller needs the disconnect
  // to actually complete before doing the next thing — specifically the
  // launcher's conflict-resolution flow, which auto-disconnects the existing
  // session then connects a new character on the same account. Without
  // awaiting, the SGE server still sees the old session and rejects the new
  // login with "Invalid login key".
  disconnectAwait: (sessionId: SessionId): Promise<void> =>
    ipcRenderer.invoke('disconnect-await', sessionId),

  // Explicit teardown — call when the renderer is done with a session entry
  // (tab closed, app shutting down). Idempotent: main looks up by id and
  // silently no-ops if the session has already been removed.
  destroySession: (sessionId: SessionId) =>
    ipcRenderer.send(CH.SESSION_DESTROY, sessionId),

  // ── Session roster (multi-window, v0.11.0) ────────────────────────────────────
  // The roster is main's authoritative list of every session across all windows.
  // getWindowInfo returns this window's stable id + whether it's primary, so the
  // renderer can tell which roster entries it owns and pick its empty-state.
  // setSessionName reports the server-canonical character name up.
  onSessionRoster: (cb: (payload: SessionRosterPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: SessionRosterPayload) => cb(payload)
    ipcRenderer.on(CH.SESSION_ROSTER, listener)
    return () => ipcRenderer.removeListener(CH.SESSION_ROSTER, listener)
  },
  getWindowInfo: (): Promise<{ windowId: number; isPrimary: boolean }> =>
    ipcRenderer.invoke('get-window-info'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  setSessionName: (sessionId: SessionId, character: string) =>
    ipcRenderer.send('session:set-name', sessionId, character),

  // ── Decouple (move a character to its own / another window) ───────────────────
  moveSessionToWindow: (sessionId: SessionId, target: 'new' | 'main' | number, opts?: { quiet?: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('session:move-window', sessionId, target, opts),
  getOwnedSessions: (): Promise<RosterEntry[]> => ipcRenderer.invoke('get-owned-sessions'),
  // Pull the full cross-window roster on mount (the onSessionRoster push is
  // race-prone for a freshly-opened window — it may subscribe after main's
  // broadcast). Lets Quick Send target characters in other windows immediately.
  getRoster: (): Promise<RosterEntry[]> => ipcRenderer.invoke('get-roster'),
  onSessionAcquire: (cb: (entry: RosterEntry) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, entry: RosterEntry) => cb(entry)
    ipcRenderer.on('session-acquire', listener)
    return () => ipcRenderer.removeListener('session-acquire', listener)
  },
  onSessionRelease: (cb: (sessionId: SessionId) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, sessionId: SessionId) => cb(sessionId)
    ipcRenderer.on('session-release', listener)
    return () => ipcRenderer.removeListener('session-release', listener)
  },
  // Ask main to replay this session's recent history (render-only) so a window
  // that just took over the session paints scrollback + room/vitals immediately.
  requestReplay: (sessionId: SessionId) => ipcRenderer.send('session:request-replay', sessionId),

  // Profile Transfer: ask the session's OWNER window (which may be a different
  // window) to remount its GameWindow so it re-reads the imported state.
  requestSessionReload: (characterId: string) => ipcRenderer.send('session:reload', characterId),
  onSessionReload: (cb: (characterId: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, characterId: string) => cb(characterId)
    ipcRenderer.on('session-reload', listener)
    return () => ipcRenderer.removeListener('session-reload', listener)
  },

  // ── Per-session push channels ───────────────────────────────────────────────
  // All four carry sessionId in their payload. The renderer's SessionsContext
  // routes each event to the matching tab.
  onUserText: (cb: (p: UserTextPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: UserTextPayload) => cb(p)
    ipcRenderer.on(CH.USER_TEXT, listener)
    return () => ipcRenderer.removeListener(CH.USER_TEXT, listener)
  },

  onGameEvent: (cb: (batch: GameEventBatch) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, batch: GameEventBatch) => cb(batch)
    ipcRenderer.on(CH.GAME_EVENT, listener)
    return () => ipcRenderer.removeListener(CH.GAME_EVENT, listener)
  },

  onConnectionStatus: (cb: (status: ConnectionStatusPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: ConnectionStatusPayload) => cb(status)
    ipcRenderer.on(CH.CONNECTION_STATUS, listener)
    return () => ipcRenderer.removeListener(CH.CONNECTION_STATUS, listener)
  },

  onError: (cb: (payload: ErrorPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: ErrorPayload) => cb(payload)
    ipcRenderer.on(CH.ERROR, listener)
    return () => ipcRenderer.removeListener(CH.ERROR, listener)
  },

  onRawXml: (cb: (payload: RawXmlPayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: RawXmlPayload) => cb(payload)
    ipcRenderer.on(CH.RAW_XML, listener)
    return () => ipcRenderer.removeListener(CH.RAW_XML, listener)
  },

  // Fired by main when the user has triggered window close and shutdown is
  // about to begin (v0.8.0, B99). Renderer uses this to paint a "Closing…"
  // overlay so the up-to-5s graceful-disconnect wait doesn't look like a
  // frozen window. The renderer can't cancel — main has already called
  // e.preventDefault and committed to the shutdown sequence; this is just
  // a visual heads-up.
  onShutdownStarting: (cb: (info: { activeCount: number }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, info: { activeCount: number }) => cb(info)
    ipcRenderer.on('shutdown-starting', listener)
    return () => ipcRenderer.removeListener('shutdown-starting', listener)
  },

  // Connect progress during LOGIN (v0.18.0) — the ConnectionManager's running
  // commentary, keyed by character. The session has no id in the renderer yet
  // (login is an invoke that resolves at the end), so this is how the
  // connecting overlay narrates the attempt.
  // ── Cross-window toasts (v0.20.0) ──────────────────────────────────────────
  onCharacterNotice: (cb: (n: CharacterNotice) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, n: CharacterNotice) => cb(n)
    ipcRenderer.on(CH.CHARACTER_NOTICE, listener)
    return () => ipcRenderer.removeListener(CH.CHARACTER_NOTICE, listener)
  },
  routeToast: (toast: RoutedToast) => ipcRenderer.send(CH.ROUTE_TOAST, toast),
  onRoutedToast: (cb: (t: RoutedToast) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, t: RoutedToast) => cb(t)
    ipcRenderer.on(CH.ROUTED_TOAST, listener)
    return () => ipcRenderer.removeListener(CH.ROUTED_TOAST, listener)
  },
  focusCharacter: (characterId: string) => ipcRenderer.send(CH.FOCUS_CHARACTER, characterId),
  onSelectCharacter: (cb: (characterId: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on(CH.SELECT_CHARACTER, listener)
    return () => ipcRenderer.removeListener(CH.SELECT_CHARACTER, listener)
  },
  onConnectProgress: (cb: (p: { character: string; message: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: { character: string; message: string }) => cb(p)
    ipcRenderer.on('connect-progress', listener)
    return () => ipcRenderer.removeListener('connect-progress', listener)
  },

  browseFile: (filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('browse-file', filters),

  // opts.probeDesktop (Mac): only the setup dialog's explicit Auto Detect
  // passes true — probing ~/Desktop fires the macOS privacy prompt, which must
  // never appear from the silent startup discovery (App.tsx).
  discoverLichPaths: (currentRuby: string, currentLich: string, opts?: { probeDesktop?: boolean; interactive?: boolean }): Promise<{
    platform: NodeJS.Platform
    rubyPath: string | null; lichPath: string | null
    rubyAlreadyValid: boolean; lichAlreadyValid: boolean
    baseFolderExists: boolean; rubyVersion: string | null; isWindows: boolean
  }> => ipcRenderer.invoke('discover-lich-paths', currentRuby, currentLich, opts),

  // Cross-platform (v0.18.0): which OS this renderer runs on ('win32' |
  // 'darwin' | 'linux'). process.platform is available in the sandboxed
  // preload; exposing it here saves an async IPC round-trip for UI that
  // branches on platform (defaults, chords, setup copy).
  platform: process.platform,
  // For SUPPORT: a tester saying "I'm on 0.18.3" does not say whether that is
  // Windows x64, macOS arm64 or a Linux AppImage — and those three behave
  // differently (unsigned + no auto-update on mac, AppImage paths on linux).
  // Surfaced in Help → About so it is answerable without a round-trip.
  arch: process.arch,
  isAppImage: !!process.env.APPIMAGE,

  // Whether safeStorage-backed password saving works (false on Linux without
  // a secret service — GNOME Keyring / KWallet).
  secureStorageAvailable: (): Promise<boolean> => ipcRenderer.invoke('secure-storage-available'),

  // ── SimuCoin (F71, v0.18.0 — DESIGN §42) ────────────────────────────────────
  // App-level, per ACCOUNT (no sessionId). The renderer never sends or receives
  // a password — it names an account and gets a SimuCoinStatus back.
  // `claim: true` actually claims when coins are waiting; false = check only.
  simucoinCheck: (account: string, claim = false): Promise<SimuCoinStatus> =>
    ipcRenderer.invoke('simucoin:check', account, claim),
  simucoinCached: (): Promise<SimuCoinStatus[]> => ipcRenderer.invoke('simucoin:cached'),
  simucoinHasPassword: (account: string): Promise<boolean> =>
    ipcRenderer.invoke('simucoin:has-password', account),

  onUpdateAvailable: (cb: (version: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, version: string) => cb(version)
    ipcRenderer.on('update-available', listener)
    return () => ipcRenderer.removeListener('update-available', listener)
  },

  onUpdateDownloaded: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('update-downloaded', listener)
    return () => ipcRenderer.removeListener('update-downloaded', listener)
  },

  downloadUpdate:   () => ipcRenderer.send('download-update'),
  installUpdate:    () => ipcRenderer.send('install-update'),
  checkForUpdates:  () => ipcRenderer.send('check-for-updates'),

  onUpdaterLog: (cb: (msg: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, msg: string) => cb(msg)
    ipcRenderer.on('updater-log', listener)
    return () => ipcRenderer.removeListener('updater-log', listener)
  },

  // Native application menu → renderer. Carries a MenuAction string; App routes
  // session actions to the active GameWindow and handles app actions directly.
  // (Top-chrome redesign Phase 2a — see src/shared/menuActions.ts.)
  onMenuAction: (cb: (payload: { action: string }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: { action: string }) => cb(payload)
    ipcRenderer.on('menu-action', listener)
    return () => ipcRenderer.removeListener('menu-action', listener)
  },

  // Close confirmation. Main asks, then BLOCKS the close on the answer — so the
  // renderer must ack (`quitConfirmShown`) as soon as it has actually rendered
  // the modal. If that ack doesn't arrive, main falls back to a native dialog
  // so a hung renderer can never make the app unquittable.
  onQuitConfirmRequest: (cb: (req: { id: number; scope: 'app' | 'window'; names: string[] }) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, req: { id: number; scope: 'app' | 'window'; names: string[] }) => cb(req)
    ipcRenderer.on('quit-confirm:request', listener)
    return () => ipcRenderer.removeListener('quit-confirm:request', listener)
  },
  quitConfirmShown: (id: number) => ipcRenderer.send('quit-confirm:shown', { id }),
  quitConfirmRespond: (id: number, ok: boolean) => ipcRenderer.send('quit-confirm:response', { id, ok }),

  // True when this window is minimized / hidden. Main is the source of truth
  // because `document.hidden` is not trustworthy under `backgroundThrottling:
  // false` — see the emitter in main.ts createWindow, and pitfall #96.
  onWindowVisibility: (cb: (hidden: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, hidden: boolean) => cb(hidden)
    ipcRenderer.on('window-visibility', listener)
    return () => ipcRenderer.removeListener('window-visibility', listener)
  },

  debugPanelToggle: (sessionId: SessionId, open: boolean) =>
    ipcRenderer.send('debug-panel-toggle', sessionId, open),

  // §35.6: scene capturers + scene-event emission gate (per session).
  sceneActiveToggle: (sessionId: SessionId, active: boolean) =>
    ipcRenderer.send('scene-active-toggle', sessionId, active),

  // ── Lich SQLite readers (session-agnostic — read the shared lich.db3) ────────
  lichDbInfo:       (lichPath: string):                    Promise<unknown>                            => ipcRenderer.invoke('lich:db-info', lichPath),
  lichGetVars:      (lichPath: string, scope?: string):    Promise<{ scope: string; vars: unknown }[]> => ipcRenderer.invoke('lich:get-vars', lichPath, scope),
  lichGetSettings:  (lichPath: string):                    Promise<{ name: string; value: string }[]>  => ipcRenderer.invoke('lich:get-settings', lichPath),
  lichGetSessions:  (lichPath: string):                    Promise<{ pid: number; session_name: string; game_code: string; role: string; state: string; frontend: string; last_heartbeat_at: number | null; started_at: number | null }[]> => ipcRenderer.invoke('lich:get-sessions', lichPath),

  // ── Weather & Moons: community sun anchors (dr-scripts Firebase, read-only) ──
  moonsFetchSunData: (): Promise<{ sunRiseAt: number; sunSetAt: number } | null> => ipcRenderer.invoke('moons:fetch-sun-data'),

  // ── Lich command injection (per-session — commands route to that character's Lich) ──
  lichPollScripts:  (sessionId: SessionId):                                    Promise<void>   => ipcRenderer.invoke('lich:poll-scripts', sessionId),
  lichPauseScript:  (sessionId: SessionId, name: string):                      Promise<void>   => ipcRenderer.invoke('lich:pause-script', sessionId, name),
  lichResumeScript: (sessionId: SessionId, name: string):                      Promise<void>   => ipcRenderer.invoke('lich:resume-script', sessionId, name),
  lichKillScript:   (sessionId: SessionId, name: string):                      Promise<void>   => ipcRenderer.invoke('lich:kill-script', sessionId, name),
  lichStartScript:  (sessionId: SessionId, name: string, args?: string):       Promise<void>   => ipcRenderer.invoke('lich:start-script', sessionId, name, args),
  onLichScriptsUpdate: (cb: (payload: LichScriptsUpdatePayload) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: LichScriptsUpdatePayload) => cb(payload)
    ipcRenderer.on('lich:scripts-update', listener)
    return () => ipcRenderer.removeListener('lich:scripts-update', listener)
  },
  openUrl: (url: string) => ipcRenderer.send('open-url', url),
  writeClipboard: (text: string) => ipcRenderer.send('write-clipboard', text),
  saveTextFile: (opts: { defaultName: string; content: string; filterName?: string; extensions?: string[] }): Promise<{ ok: boolean; canceled?: boolean; path?: string }> =>
    ipcRenderer.invoke('save-text-file', opts),

  flashWindow: () => ipcRenderer.send('flash-window'),
  writeLog: (filename: string, content: string) => ipcRenderer.send('write-log', filename, content),

  browseFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('browse-folder'),

  listMapDir: (dir: string): Promise<{ name: string; path: string }[]> =>
    ipcRenderer.invoke('list-map-dir', dir),

  readFile: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('read-file', filePath),

  // Genie parse cache — see main.ts handlers for details.
  // `load` returns the array of parsed zones if the cache fingerprint
  // matches the current folder state, or `null` if cache is stale /
  // missing / for a different folder.
  // `save` writes the parsed zones with a current fingerprint; called
  // by the renderer after a successful full parse.
  genieCacheLoad: (dir: string): Promise<unknown[] | null> =>
    ipcRenderer.invoke('genie-cache:load', dir),
  genieCacheSave: (dir: string, zones: unknown[]): Promise<boolean> =>
    ipcRenderer.invoke('genie-cache:save', dir, zones),

  findLichMapFile: (lichPath: string, family?: 'DR' | 'GS4'): Promise<{ jsonPath: string; mapsDir: string } | null> =>
    ipcRenderer.invoke('find-lich-map-file', lichPath, family),

  readMapImage: (mapsDir: string, imageName: string): Promise<string | null> =>
    ipcRenderer.invoke('read-map-image', mapsDir, imageName),

  listLichScripts: (lichPath: string): Promise<{ name: string; source: 'core' | 'custom'; lastModified: number }[]> =>
    ipcRenderer.invoke('list-lich-scripts', lichPath),

  listLichProfiles: (lichPath: string): Promise<string[]> =>
    ipcRenderer.invoke('list-lich-profiles', lichPath),

  writeLichProfile: (lichPath: string, filename: string, content: string): Promise<void> =>
    ipcRenderer.invoke('write-lich-profile', lichPath, filename, content),
  writeLichScript: (lichPath: string, name: string, source: 'core' | 'custom', content: string): Promise<void> =>
    ipcRenderer.invoke('write-lich-script', lichPath, name, source, content),

  // ── Password store ───────────────────────────────────────────────────────────
  savePassword:   (account: string, password: string): Promise<void>          => ipcRenderer.invoke('password:save',   account, password),
  loadPassword:   (account: string):                   Promise<string | null> => ipcRenderer.invoke('password:load',   account),
  deletePassword: (account: string):                   Promise<void>          => ipcRenderer.invoke('password:delete', account),

  // ── EAccess preview (Add Character wizard) ──────────────────────────────────
  eaccessFetchCharacters: (account: string, password: string, gameCode: string):
    Promise<{ ok: true; characters: { key: string; name: string }[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('eaccess:fetch-characters', account, password, gameCode),

  // ── Profile I/O ─────────────────────────────────────────────────────────────
  readSharedProfile:    ():                                        Promise<unknown | null> => ipcRenderer.invoke('profile:read-shared'),
  writeSharedProfile:   (data: unknown):                          Promise<void>           => ipcRenderer.invoke('profile:write-shared', data),
  readCharacterProfile: (character: string):                      Promise<unknown | null> => ipcRenderer.invoke('profile:read-character', character),
  writeCharacterProfile:(character: string, data: unknown):       Promise<void>           => ipcRenderer.invoke('profile:write-character', character, data),
  listCharacterProfiles:():                                        Promise<string[]>       => ipcRenderer.invoke('profile:list'),
  deleteCharacterProfile:(character: string):                      Promise<void>           => ipcRenderer.invoke('profile:delete-character', character),
  archiveCharacterProfile:(character: string):                     Promise<boolean>        => ipcRenderer.invoke('profile:archive-character', character),
  restoreCharacterProfile:(character: string):                     Promise<boolean>        => ipcRenderer.invoke('profile:restore-character', character),
  listArchivedProfiles:():                                         Promise<string[]>       => ipcRenderer.invoke('profile:list-archived'),

  // ── Profile Transfer (platform-wide .lb.yaml export/import → Exports/ folder) ──
  profileTransferExport:           (filename: string, yamlText: string):  Promise<string>                                 => ipcRenderer.invoke('profile-transfer:export', filename, yamlText),
  profileTransferListExports:      ():                                     Promise<{ name: string; mtimeMs: number }[]>    => ipcRenderer.invoke('profile-transfer:list-exports'),
  profileTransferReadExport:       (filename: string):                    Promise<string | null>                          => ipcRenderer.invoke('profile-transfer:read-export', filename),
  profileTransferOpenImportDialog: ():                                     Promise<{ name: string; text: string } | null>  => ipcRenderer.invoke('profile-transfer:open-import-dialog'),
  profileTransferOpenExportsFolder:():                                     Promise<void>                                   => ipcRenderer.invoke('profile-transfer:open-exports-folder'),

  // ── Session Log ─────────────────────────────────────────────────────────────
  sessionLogAppend:   (payload: SessionLogAppendPayload): void => ipcRenderer.send('session-log:append', payload),
  sessionLogFlush:    (character: string):                void => ipcRenderer.send('session-log:flush', character),
  sessionLogListDays: (character: string): Promise<SessionLogDay[]> =>
    ipcRenderer.invoke('session-log:list-days', character),
  sessionLogReadDay:  (character: string, date: string, tailLines: number, beforeLine: number):
    Promise<{ lines: string[]; totalLines: number }> =>
    ipcRenderer.invoke('session-log:read-day', character, date, tailLines, beforeLine),
  sessionLogSearch:   (character: string, query: string, opts: { regex: boolean; fromDate: string; toDate: string }):
    Promise<SessionLogSearchHit[]> =>
    ipcRenderer.invoke('session-log:search', character, query, opts),
  sessionLogListStreams: (character: string, fromDate: string, toDate?: string): Promise<string[]> =>
    ipcRenderer.invoke('session-log:list-streams', character, fromDate, toDate),
  sessionLogBuildExport: (character: string, spec: SessionLogExportSpec): Promise<SessionLogExportResult> =>
    ipcRenderer.invoke('session-log:build-export', character, spec),
  sessionLogDiskUsage: (character: string): Promise<SessionLogDiskUsage> =>
    ipcRenderer.invoke('session-log:disk-usage', character),
  sessionLogOpenFolder: (character: string): void => ipcRenderer.send('session-log:open-folder', character),
  // GROUNDWORK for the future log-analysis AI feature (DESIGN §10.4) — NOT yet
  // wired to anything (Catch Me Up reverted to screen-only, §10.3). Returns every
  // logged line in [fromTs, toTs], filtered in MAIN because a busy character logs
  // 80k+ lines/day and a line-capped tail can't bound a TIME window (pitfall #92).
  sessionLogReadWindow: (character: string, fromTs: number, toTs: number, maxRows: number): Promise<SessionLogWindowRow[]> =>
    ipcRenderer.invoke('session-log:read-window', character, fromTs, toTs, maxRows),

  // Catch Me Up over the LOG (v0.17.1). The whole pipeline (read → dedup →
  // extract) runs in MAIN and only the compact digest comes back — a 1-year
  // window is ~29M lines, so rows must never cross IPC. Progress is pushed on
  // `session-log:catchup-progress` for EVERY phase so the UI can say what it's
  // doing (Sekmeht: "Working on it" during parsing/dedup/extraction, not just the
  // final summary). Filter by requestId — every window hears the channel.
  sessionLogCatchupDigest: (requestId: string, character: string, fromTs: number, toTs: number, maxBodyChars: number, redactLiterals: string[]): Promise<CatchupDigest> =>
    ipcRenderer.invoke('session-log:catchup-digest', requestId, character, fromTs, toTs, maxBodyChars, redactLiterals),
  onCatchupProgress: (cb: (p: CatchupProgress) => void) => {
    const h = (_e: unknown, p: CatchupProgress) => cb(p)
    ipcRenderer.on('session-log:catchup-progress', h)
    return () => ipcRenderer.removeListener('session-log:catchup-progress', h)
  },

  // ── AI (BYOK, capability-routed — DESIGN §10) ────────────────────────────────
  // Keys go DOWN (set/clear) but never come back up — aiKeyStatus returns only
  // booleans. Chat is fire-and-stream: aiChat sends, the on* channels stream
  // chunks/done/error back keyed by requestId.
  aiSetKey:    (cap: AICapability, key: string): Promise<void>       => ipcRenderer.invoke('ai:set-key', cap, key),
  aiClearKey:  (cap: AICapability):              Promise<void>       => ipcRenderer.invoke('ai:clear-key', cap),
  aiKeyStatus: ():                               Promise<AIKeyStatus> => ipcRenderer.invoke('ai:key-status'),
  aiTestKey:   (cap: AICapability, model?: string): Promise<AITestResult> => ipcRenderer.invoke('ai:test-key', cap, model),
  aiChat:      (req: AIChatRequest): void => ipcRenderer.send('ai:chat', req),
  aiChatAbort: (requestId: string):  void => ipcRenderer.send('ai:chat-abort', requestId),
  onAIChatChunk: (cb: (c: AIChatChunk) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, c: AIChatChunk) => cb(c)
    ipcRenderer.on('ai:chat-chunk', listener)
    return () => ipcRenderer.removeListener('ai:chat-chunk', listener)
  },
  onAIChatDone: (cb: (d: AIChatDone) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, d: AIChatDone) => cb(d)
    ipcRenderer.on('ai:chat-done', listener)
    return () => ipcRenderer.removeListener('ai:chat-done', listener)
  },
  onAIChatError: (cb: (er: AIChatError) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, er: AIChatError) => cb(er)
    ipcRenderer.on('ai:chat-error', listener)
    return () => ipcRenderer.removeListener('ai:chat-error', listener)
  },
})
