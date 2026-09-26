// global.d.ts — the renderer's ambient types: `window.api` (the preload bridge) + `__APP_VERSION__`.
//
// TYPES ONLY. `window.api` is the one door between the renderer and the main
// process — the object preload's contextBridge exposes — and this file is its
// declared shape, grouped by subsystem (session lifecycle, the multi-window
// roster, per-session push channels, Lich SQLite readers and command
// injection, profile I/O, Profile Transfer, Session Log, AI, SimuCoin, …).
// The implementation lives in preload; keep the two in lockstep — a method
// declared here but not exposed there is a runtime `undefined`, and one
// exposed there but not declared here is unusable from typed renderer code.
// Payload/result shapes come from `../shared/types` (the single source both
// processes import); don't restate them inline.
//
// Two conventions visible in the signatures: anything about a CHARACTER takes
// a `sessionId`; every `on*` subscription returns its unsubscribe function.
// `__APP_VERSION__` is a build-time constant.

import type {
  AttachCredentials, LoginCredentials, LoginResult, SessionId, SessionRosterPayload, RosterEntry,
  GameEventBatch, ConnectionStatusPayload, RawXmlPayload, ErrorPayload,
  LichScriptsUpdatePayload, SessionLogAppendPayload, SessionLogDay, SessionLogSearchHit,
  SessionLogExportSpec, SessionLogExportResult, SessionLogDiskUsage, SessionLogWindowRow,
  CatchupDigest, CatchupProgress,
  AICapability, AIKeyStatus, AITestResult, AIChatRequest, AIChatChunk, AIChatDone, AIChatError,
  SimuCoinStatus, CharacterNotice, RoutedToast,
} from '../shared/types'

declare global {
  interface Window {
    api: {
      // ── Session lifecycle ─────────────────────────────────────────────────────
      login: (creds: LoginCredentials) => Promise<LoginResult>
      /** Attach to an already-running detachable Lich (`--headless PORT`). */
      loginAttach: (creds: AttachCredentials) => Promise<LoginResult>
      sendCommand: (sessionId: SessionId, command: string) => void
      /** Run `text` as if typed in that character's own command bar (echo + log). */
      sendUserText: (sessionId: SessionId, text: string) => void
      onUserText: (cb: (p: import('../shared/types').UserTextPayload) => void) => () => void
      disconnect: (sessionId: SessionId) => void
      disconnectAwait: (sessionId: SessionId) => Promise<void>
      destroySession: (sessionId: SessionId) => void

      // ── Session roster (multi-window) ─────────────────────────────────────────
      onSessionRoster: (cb: (payload: SessionRosterPayload) => void) => () => void
      getWindowInfo: () => Promise<{ windowId: number; isPrimary: boolean }>
      setSessionName: (sessionId: SessionId, character: string) => void
      // `quiet`: a NEW window opens without taking focus (team login, while
      // the player may already be typing into another character).
      moveSessionToWindow: (sessionId: SessionId, target: 'new' | 'main' | number, opts?: { quiet?: boolean }) => Promise<boolean>
      getOwnedSessions: () => Promise<RosterEntry[]>
      getRoster: () => Promise<RosterEntry[]>
      onSessionAcquire: (cb: (entry: RosterEntry) => void) => () => void
      onSessionRelease: (cb: (sessionId: SessionId) => void) => () => void
      requestReplay: (sessionId: SessionId) => void
      requestSessionReload: (characterId: string) => void
      onSessionReload: (cb: (characterId: string) => void) => () => void

      // ── Per-session push channels ────────────────────────────────────────────
      onGameEvent: (cb: (batch: GameEventBatch) => void) => () => void
      onConnectionStatus: (cb: (status: ConnectionStatusPayload) => void) => () => void
      onError: (cb: (payload: ErrorPayload) => void) => () => void
      onRawXml: (cb: (payload: RawXmlPayload) => void) => () => void
      onShutdownStarting: (cb: (info: { activeCount: number }) => void) => () => void
      debugPanelToggle: (sessionId: SessionId, open: boolean) => void
      sceneActiveToggle: (sessionId: SessionId, active: boolean) => void

      // ── Lich SQLite readers (session-agnostic) ───────────────────────────────
      lichDbInfo:       (lichPath: string) => Promise<unknown>
      lichGetVars:      (lichPath: string, scope?: string) => Promise<{ scope: string; vars: unknown }[]>
      lichGetSettings:  (lichPath: string)                 => Promise<{ name: string; value: string }[]>
      lichGetSessions:  (lichPath: string)                 => Promise<{ pid: number; session_name: string; game_code: string; role: string; state: string; frontend: string; last_heartbeat_at: number | null; started_at: number | null }[]>
      moonsFetchSunData: () => Promise<{ sunRiseAt: number; sunSetAt: number } | null>

      // ── Per-session Lich command injection ───────────────────────────────────
      lichPollScripts:     (sessionId: SessionId)                              => Promise<void>
      lichPauseScript:     (sessionId: SessionId, name: string)                => Promise<void>
      lichResumeScript:    (sessionId: SessionId, name: string)                => Promise<void>
      lichKillScript:      (sessionId: SessionId, name: string)                => Promise<void>
      lichStartScript:     (sessionId: SessionId, name: string, args?: string) => Promise<void>
      onLichScriptsUpdate: (cb: (payload: LichScriptsUpdatePayload) => void) => () => void

      onConnectProgress: (cb: (p: { character: string; message: string }) => void) => () => void
      // v0.20.0 — toasts shown in the window the player is looking at, and
      // "go to this character" across windows (main focuses the owner window
      // and asks it to select the character).
      onCharacterNotice: (cb: (n: CharacterNotice) => void) => () => void
      routeToast: (toast: RoutedToast) => void
      onRoutedToast: (cb: (t: RoutedToast) => void) => () => void
      focusCharacter: (characterId: string) => void
      onSelectCharacter: (cb: (characterId: string) => void) => () => void
      browseFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
      discoverLichPaths: (currentRuby: string, currentLich: string, opts?: { probeDesktop?: boolean; interactive?: boolean }) => Promise<{
        platform: string
        rubyPath: string | null; lichPath: string | null
        rubyAlreadyValid: boolean; lichAlreadyValid: boolean
        baseFolderExists: boolean; rubyVersion: string | null; isWindows: boolean
      }>
      platform: string
      arch: string
      isAppImage: boolean
      secureStorageAvailable: () => Promise<boolean>
      simucoinCheck: (account: string, claim?: boolean) => Promise<SimuCoinStatus>
      simucoinCached: () => Promise<SimuCoinStatus[]>
      simucoinHasPassword: (account: string) => Promise<boolean>
      onUpdateAvailable: (cb: (version: string) => void) => () => void
      onUpdateDownloaded: (cb: () => void) => () => void
      downloadUpdate: () => void
      installUpdate: () => void
      checkForUpdates: () => void
      onUpdaterLog: (cb: (msg: string) => void) => () => void
      onMenuAction: (cb: (payload: { action: string }) => void) => () => void
      onWindowVisibility: (cb: (hidden: boolean) => void) => () => void
      onQuitConfirmRequest: (cb: (req: { id: number; scope: 'app' | 'window'; names: string[] }) => void) => () => void
      quitConfirmShown: (id: number) => void
      quitConfirmRespond: (id: number, ok: boolean) => void
      openUrl: (url: string) => void
      getAppVersion: () => Promise<string>
      writeClipboard: (text: string) => void
      saveTextFile: (opts: { defaultName: string; content: string; filterName?: string; extensions?: string[] }) => Promise<{ ok: boolean; canceled?: boolean; path?: string }>
      flashWindow: () => void
      writeLog: (filename: string, content: string) => void
      browseFolder: () => Promise<string | null>
      listMapDir: (dir: string) => Promise<{ name: string; path: string }[] | null>
      readFile: (filePath: string) => Promise<string | null>
      // Genie parse cache
      genieCacheLoad: (dir: string) => Promise<unknown[] | null>
      genieCacheSave: (dir: string, zones: unknown[]) => Promise<boolean>
      // Lich file-system
      findLichMapFile: (lichPath: string) => Promise<{ jsonPath: string; mapsDir: string } | null>
      readMapImage: (mapsDir: string, imageName: string) => Promise<string | null>
      listLichScripts: (lichPath: string) => Promise<{ name: string; source: 'core' | 'custom'; lastModified: number }[]>
      listLichProfiles:  (lichPath: string) => Promise<string[]>
      writeLichProfile:  (lichPath: string, filename: string, content: string) => Promise<void>
      writeLichScript:   (lichPath: string, name: string, source: 'core' | 'custom', content: string) => Promise<void>
      // Password store
      savePassword:   (account: string, password: string) => Promise<void>
      loadPassword:   (account: string)                   => Promise<string | null>
      deletePassword: (account: string)                   => Promise<void>
      // EAccess preview (Add Character wizard)
      eaccessFetchCharacters: (account: string, password: string, gameCode: string) =>
        Promise<{ ok: true; characters: { key: string; name: string }[] } | { ok: false; error: string }>
      // Profile I/O
      readSharedProfile: () => Promise<unknown | null>
      writeSharedProfile: (data: unknown) => Promise<void>
      readCharacterProfile: (character: string) => Promise<unknown | null>
      writeCharacterProfile: (character: string, data: unknown) => Promise<void>
      listCharacterProfiles: () => Promise<string[]>
      deleteCharacterProfile: (character: string) => Promise<void>
      archiveCharacterProfile: (character: string)         => Promise<boolean>
      restoreCharacterProfile: (character: string)         => Promise<boolean>
      listArchivedProfiles: ()                             => Promise<string[]>
      // Profile Transfer (platform-wide .lb.yaml export/import → Exports/ folder)
      profileTransferExport: (filename: string, yamlText: string) => Promise<string>
      profileTransferListExports: () => Promise<{ name: string; mtimeMs: number }[]>
      profileTransferReadExport: (filename: string) => Promise<string | null>
      profileTransferOpenImportDialog: () => Promise<{ name: string; text: string } | null>
      profileTransferOpenExportsFolder: () => Promise<void>
      // Session Log
      sessionLogAppend: (payload: SessionLogAppendPayload) => void
      sessionLogFlush: (character: string) => void
      sessionLogListDays: (character: string) => Promise<SessionLogDay[]>
      sessionLogReadDay: (character: string, date: string, tailLines: number, beforeLine: number)
        => Promise<{ lines: string[]; totalLines: number }>
      sessionLogSearch: (character: string, query: string, opts: { regex: boolean; fromDate: string; toDate: string })
        => Promise<SessionLogSearchHit[]>
      sessionLogListStreams: (character: string, fromDate: string, toDate?: string) => Promise<string[]>
      sessionLogBuildExport: (character: string, spec: SessionLogExportSpec) => Promise<SessionLogExportResult>
      sessionLogDiskUsage: (character: string) => Promise<SessionLogDiskUsage>
      sessionLogOpenFolder: (character: string) => void
      sessionLogReadWindow: (character: string, fromTs: number, toTs: number, maxRows: number)
        => Promise<SessionLogWindowRow[]>
      sessionLogCatchupDigest: (requestId: string, character: string, fromTs: number, toTs: number, maxBodyChars: number, redactLiterals: string[])
        => Promise<CatchupDigest>
      onCatchupProgress: (cb: (p: CatchupProgress) => void) => () => void
      // AI (BYOK, capability-routed — DESIGN §10)
      aiSetKey:    (cap: AICapability, key: string) => Promise<void>
      aiClearKey:  (cap: AICapability) => Promise<void>
      aiKeyStatus: () => Promise<AIKeyStatus>
      aiTestKey:   (cap: AICapability, model?: string) => Promise<AITestResult>
      aiChat:      (req: AIChatRequest) => void
      aiChatAbort: (requestId: string) => void
      onAIChatChunk: (cb: (c: AIChatChunk) => void) => () => void
      onAIChatDone:  (cb: (d: AIChatDone) => void) => () => void
      onAIChatError: (cb: (er: AIChatError) => void) => () => void
    }
  }
}

export {}

declare global {
  const __APP_VERSION__: string
}
