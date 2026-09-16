// main — the Electron main process: sessions, windows, the IPC surface, menu, updater, shutdown.
//
// This is the hub every other main-side module plugs into. It OWNS:
//  • The SESSION roster — `sessions: Map<SessionId, Session>`; each Session
//    bundles one ConnectionManager (socket), StormFrontParser, SceneParser,
//    LichBridge, its event queue and the replay state. Minted by the LOGIN
//    handler, torn down by `session:destroy` / window close. See "Session
//    model" and "Session roster".
//  • The WINDOW registry — `windows` keyed by webContents id, one PRIMARY
//    (launcher) window plus SECONDARY windows for decoupled characters. Main
//    is the source of truth for which window renders which session
//    (`ownerWindowId`), and every window mirrors the roster. See "Windows",
//    "Session roster" and "IPC: multi-window decouple".
//  • The per-session PIPELINE — wireSession(): raw line → (Debug raw-XML
//    feed) → LichBridge.interceptLine → StormFrontParser.parse → the one-shot
//    B169 Lich flag → SceneParser.derive → eventQueue → scheduleFlush, a
//    leading-edge 16ms coalescer (B172) that ships ONE batch per frame during
//    a flood and records every flushed event into the sticky `stateSnapshot`
//    / scrollback `historyBuffer` for window-takeover replays (pitfall #60).
//  • The whole IPC surface, grouped by the `// ── … ──` banners below:
//    session lifecycle, multi-window decouple + replay, command sends
//    (`SEND_COMMAND` writes the socket; `SEND_USER_TEXT` is forwarded to the
//    OWNER window's GameWindow so it runs the normal input path), Lich script
//    injection, file-system helpers + Lich/Ruby auto-discovery, the Genie
//    parse cache, the Moons sun-anchor fetch, Lich file helpers, passwords,
//    the SGE character preview, profiles, Profile Transfer, clipboard/log
//    helpers, and the updater. The other handler groups are registered from
//    their own modules at load time (sqliteReader, sessionLog, ai, simucoin).
//  • Lich launch coordination lives in ConnectionManager (serializeLichLaunch);
//    main just awaits `connectViaLich` / `connectDirect` per session.
//  • The NATIVE MENU (setupMenu — File·Edit·View·Tools·Lich·Window·Help,
//    click-only items dispatched to the FOCUSED window via sendMenuAction;
//    refreshMenuState scopes the Window items to that window's tab count),
//    the DUAL-FEED auto-updater (checkForUpdatesDualFeed — new home first,
//    legacy repo as fallback; gated off on macOS), the one permission
//    allowlist shared by both permission handlers (pitfall #127), and the
//    SHUTDOWN sequence (confirmCloseThenRun → runSecondaryWindowClose /
//    runAppShutdown, which must end in an explicit app.quit — pitfall #114).
//
// Rules for anyone adding to this file:
//  • Channel names come from the ONE shared `IPC` list in shared/types.ts —
//    never a private map (pitfall #127; an `undefined` channel registers
//    silently on "undefined" and eats every send).
//  • Every per-session push carries `sessionId` and routes via ownerWindow(s)
//    (falls back to the primary so output is never dropped). The single
//    deliberate exception is `window-visibility`, which is about the OS
//    window, not a character.
//  • A window taking over a session (decouple / re-home / reload / and since
//    v0.19.0 the first connect) gets a one-shot replay: set `replayTarget` +
//    `holdingForReplay`, arm scheduleReplayHoldRelease, and never let live and
//    replay overlap. Decouple moves ownership ONLY — the socket, parser and
//    LichBridge are never touched (pitfall #59).
//  • Main owns every session's socket, so nothing here may block: the close
//    confirmation is async (never showMessageBoxSync), the trigger `write-log`
//    path is buffered rather than one appendFileSync per line, and any
//    multi-file scan belongs in a yielding helper (see sessionLog.ts).
//  • On secrets: AI keys and the SimuCoin flow keep credentials inside main,
//    but `password:load` DOES return the saved account password to the
//    renderer — the renderer builds LoginCredentials (with the password) for
//    the LOGIN handler. Don't describe the boundary as stricter than it is.
import { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, clipboard, safeStorage, powerMonitor } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as crypto from 'crypto'
import * as cp from 'child_process'
import { expandHome } from './homePath'
import { autoUpdater } from 'electron-updater'
import { ConnectionManager } from './connection/ConnectionManager'
import { SGEConnection } from './connection/SGEConnection'
import { StormFrontParser } from './parser/StormFrontParser'
import { SceneParser } from './parser/SceneParser'
import { LichBridge } from './lichbridge'
import { registerLichSqliteHandlers } from './lichbridge/sqliteReader'
import { registerSessionLogHandlers, flushAllSessionLogs } from './sessionLog'
import { readSharedProfile, writeSharedProfile, readCharacterProfile, writeCharacterProfile, listCharacterProfiles, deleteCharacterProfile, archiveCharacterProfile, restoreCharacterProfile, listArchivedProfiles, backupAllProfiles, ensureProfilesDir, ensureExportsDir, getExportsDir } from './profiles'
import { savePassword, loadPassword, deletePassword } from './passwords'
import { registerAIHandlers } from './ai'
import { registerSimuCoinHandlers } from './simucoin'
import { restoredBoundsFor, trackWindowState, flushWindowState } from './windowState'
import { IPC } from '../shared/types'
import { makeCharacterId } from '../shared/characterId'
import type {
  AttachCredentials, GameEvent, GameEventBatch, LoginCredentials, LoginResult,
  ConnectionStatusPayload, RawXmlPayload, ErrorPayload, SessionId,
  RosterEntry, SessionRosterPayload,
  UserTextPayload,
} from '../shared/types'
import type { MenuAction } from '../shared/menuActions'

// Channel names come from the ONE shared list (pitfall #127). A private copy
// here is how SEND_USER_TEXT reached `undefined` and silently ate every Quick
// Send in v0.19.0 — see the note on IPC in shared/types.ts.
const CH = IPC

// ── Session model ─────────────────────────────────────────────────────────────
// A Session encapsulates all per-character I/O state: TCP/Lich socket, XML
// parser, command injector, batched event queue, and lifecycle flags. The
// renderer references a session by SessionId; main routes by lookup. Sessions
// are minted on `login`, torn down on explicit `session:destroy`.

interface Session {
  id: SessionId
  connection: ConnectionManager
  parser: StormFrontParser
  // §35: derives typed scene events (cast / arrive / depart) from the room
  // components StormFrontParser emits. Per-session state (Principle #6).
  sceneParser: SceneParser
  lichBridge: LichBridge
  eventQueue: GameEvent[]
  flushScheduled: boolean
  // B172: timestamp of the last event-batch flush, for the leading-edge
  // coalescing throttle in scheduleFlush (idle → flush immediately; during a
  // flood → one batch per FLUSH_COALESCE_MS so the renderer does one render
  // pass per frame instead of one per socket chunk).
  lastFlushAt: number
  cleanDisconnect: boolean
  connected: boolean
  debugPanelOpen: boolean
  // Multi-window (v0.11.0): the webContents id of the window that currently
  // renders this session's GameWindow, and the character identity captured at
  // login. Both feed the roster broadcast (buildRoster). `meta` is null until
  // the LOGIN handler attaches credentials.
  ownerWindowId: number
  meta: { characterId: string; account: string; character: string; game: string; useLich: boolean; attach?: { host: string; port: number } } | null
  // Replay state for a window that takes over rendering this session (decouple /
  // re-home / remount): the LATEST value of each sticky state (vitals, RT/CT,
  // indicators, stance, spell, hands, room title/id, exp, injuries, exits, …),
  // keyed so it's always current REGARDLESS of how long ago it last changed —
  // plus a bounded ring buffer of scrollback history (stream text). A plain ring
  // buffer alone dropped vitals that hadn't changed recently (they fell off the
  // end), so static bars (health at 100% etc.) restored blank — only the ones
  // actively changing survived. The snapshot guarantees every bar comes back.
  stateSnapshot: Map<string, GameEvent>
  historyBuffer: GameEvent[]
  // The window id a replay is owed to, set ONLY when the session is MOVED to a
  // new owner (decouple / re-home). A fresh connect never sets it, so the first
  // window to render a session does NOT get a replay — otherwise the replay
  // (being filled by the same live login stream the GameWindow is already
  // showing) would double every connect line. One-shot: cleared on delivery.
  replayTarget?: number
  // True from the moment of a move until the replay is delivered. While set, live
  // event batches are NOT sent to the window (only recorded into the buffer), so
  // a session still streaming during the handoff can't show events live AND again
  // in the replay (the bulk-connect login double). Live resumes after the replay.
  holdingForReplay?: boolean
  // B169: one-shot — `_flag Display Inventory Boxes 1` sent to Lich after login
  // (player-info) to disarm Lich's tag-eating inventory_boxes_off hook.
  invBoxesFixSent?: boolean
  // Pending auto re-attach (attach sessions only). Held so teardown and a
  // manual reconnect can cancel it — see scheduleReattach / cancelReattach.
  reattachTimer?: ReturnType<typeof setTimeout>
}

const HISTORY_BUFFER_MAX = 600

// Key for the per-session state snapshot: sticky "current state" events return a
// stable key (newer replaces older); history events (stream text, clears) return
// null and go to the scrollback ring buffer instead.
function snapshotKey(evt: GameEvent): string | null {
  switch (evt.type) {
    case 'vital-update':  return `vital:${evt.id}`
    case 'roundtime':     return 'roundtime'
    case 'casttime':      return 'casttime'
    case 'aimtime':       return 'aimtime'
    case 'indicator':     return `indicator:${evt.id}`
    case 'stance':        return 'stance'
    case 'spell':         return 'spell'
    case 'hand':          return `hand:${evt.hand}`
    case 'room-title':    return 'room-title'
    case 'room-id':       return 'room-id'
    case 'exp-component': return `exp:${evt.skill}`
    case 'injury-update': return 'injury'
    // §35: the cast is sticky state — a window taking over the session must
    // repaint the Tableau without waiting for the next room update.
    // scene-arrive/depart stay history events (transient edges; future
    // choreography consumers gate on the batch replay flag, pitfall #60a).
    case 'scene-cast':    return 'scene-cast'
    case 'character-guild': return 'character-guild'
    case 'exits':         return 'exits'
    // v0.14.7: the game's exits SENTENCE ("Obvious exits: none.") is sticky
    // room state like the tokens — a window takeover must repaint it.
    case 'room-exits-text': return 'room-exits-text'
    case 'player-info':   return 'player-info'
    default:              return null
  }
}

const sessions = new Map<SessionId, Session>()

// ── Windows (multi-window, v0.11.0) ──────────────────────────────────────────
// All open windows keyed by their webContents id. The PRIMARY window is the
// launcher window (first created); SECONDARY windows host decoupled characters.
// Per-session output (game events, status, raw XML, errors, script list) routes
// to a session's OWNER window via ownerWindow(); app-global output (auto-update
// banners, menu actions) goes to the primary or focused window.
const windows = new Map<number, BrowserWindow>()
let primaryWindowId = 0
let appClosing = false

function primaryWindow(): BrowserWindow | undefined {
  const w = windows.get(primaryWindowId)
  return w && !w.isDestroyed() ? w : undefined
}
function windowById(id: number): BrowserWindow | undefined {
  const w = windows.get(id)
  return w && !w.isDestroyed() ? w : undefined
}
// The window that should render a session's output. Falls back to the primary
// window if the owner is gone (e.g. a secondary window was closed before its
// sessions were re-homed) so output is never silently dropped.
function ownerWindow(s: Session): BrowserWindow | undefined {
  return windowById(s.ownerWindowId) ?? primaryWindow()
}
function broadcastAll(channel: string, payload?: unknown) {
  for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

function getSession(id: SessionId): Session | undefined {
  return sessions.get(id)
}

function createSession(): Session {
  const id = crypto.randomUUID()
  const connection = new ConnectionManager()
  const parser = new StormFrontParser()
  const sceneParser = new SceneParser()
  const lichBridge = new LichBridge((cmd: string) => connection.send(cmd))
  const s: Session = {
    id, connection, parser, sceneParser, lichBridge,
    eventQueue: [], flushScheduled: false, lastFlushAt: 0,
    cleanDisconnect: false, connected: false, debugPanelOpen: false,
    ownerWindowId: 0, meta: null, stateSnapshot: new Map(), historyBuffer: [],
  }
  wireSession(s)
  sessions.set(id, s)
  refreshMenuState()
  return s
}

// ── Session roster (multi-window, v0.11.0) ───────────────────────────────────
// Main is the source of truth for the list of all sessions across all windows.
// Every window mirrors this; a window renders a GameWindow only for sessions it
// owns (ownerWindowId === its webContents id), but knows about all of them so
// cross-window Quick Send can target a character living in another window.

function rosterEntryFor(s: Session): RosterEntry | null {
  if (!s.meta) return null  // minted but login credentials not yet attached
  return {
    sessionId: s.id,
    characterId: s.meta.characterId,
    account: s.meta.account,
    character: s.meta.character,
    game: s.meta.game,
    useLich: s.meta.useLich,
    connected: s.connected,
    ownerWindowId: s.ownerWindowId,
    attach: s.meta.attach,
  }
}

function buildRoster(): RosterEntry[] {
  const out: RosterEntry[] = []
  for (const s of sessions.values()) {
    const e = rosterEntryFor(s)
    if (e) out.push(e)
  }
  return out
}

function broadcastRoster() {
  broadcastAll(CH.SESSION_ROSTER, { roster: buildRoster() } as SessionRosterPayload)
}

// (B301: makeCharacterId used to be a local copy here, kept in sync with the
// renderer's by a comment alone — it now lives once in shared/characterId.ts,
// imported at the top, so the two processes structurally cannot drift.)

function wireSession(s: Session) {
  s.connection.on('status', (msg: string) => {
    sendStatus(s, false, msg)
  })

  s.connection.on('line', (line: string) => {
    if (s.debugPanelOpen) {
      const payload: RawXmlPayload = { sessionId: s.id, line }
      ownerWindow(s)?.webContents.send(CH.RAW_XML, payload)
    }
    if (!s.lichBridge.interceptLine(line, s.id, ownerWindow(s) ?? null)) return

    const events = s.parser.parse(line)
    for (const evt of events) {
      if (evt.type === 'launch-url') shell.openExternal(evt.url)
      if (evt.type === 'game-exit') s.cleanDisconnect = true
      // B169: disarm Lich's `inventory_boxes_off` downstream hook. Lich installs
      // it BY DEFAULT for stormfront-style front-ends (main.rb:546) and its strip
      // regex is GREEDY (`<inv.+\/inv>`): on a server line that starts with a
      // container tag and carries a hand update BETWEEN two inv blocks (a GET
      // from a container, with the game-side "display inventory windows" account
      // flag on), it swallows the <right>/<left> tag — the true root cause of
      // JadedSoul's B165 hand-bar desyncs. Wrayth escapes because it sends this
      // exact flag at bootstrap; we mimic it ONCE per session after login
      // (player-info = the <app> tag, which arrives AFTER <playerID>, so Lich
      // also persists the preference for future sessions — xmlparser.rb:604).
      // Lich's UpstreamHook CONSUMES the command (returns nil): it never reaches
      // DR and never touches the real account flag. Lich sessions only — sent
      // directly to the game on a direct-SGE connection it WOULD flip the real
      // account flag (and direct connections have no hook, hence no bug).
      if (evt.type === 'player-info' && s.meta?.useLich && !s.invBoxesFixSent) {
        s.invBoxesFixSent = true
        s.connection.send('_flag Display Inventory Boxes 1')
      }
    }
    // Annotated GameEvent[] on purpose (B365): TS infers a type predicate from
    // this filter and narrows the array to "every event but launch-url/unknown",
    // which then rejects the scene events pushed onto it below. The queue takes
    // any GameEvent, so the wide type is the true one.
    const filtered: GameEvent[] = events.filter(e => e.type !== 'launch-url' && e.type !== 'unknown')
    // §35: derive typed scene events (cast / arrive / depart) from this
    // line's room-component events. Appended AFTER the source events so a
    // consumer always sees the underlying clear/stream-text first.
    const sceneEvents = s.sceneParser.derive(filtered)
    if (sceneEvents.length > 0) filtered.push(...sceneEvents)
    if (filtered.length > 0) {
      s.eventQueue.push(...filtered)
      scheduleFlush(s)
    }
  })

  s.connection.on('disconnect', () => {
    const wasClean = s.cleanDisconnect
    s.cleanDisconnect = false
    s.connected = false
    sendStatus(s, false, 'Disconnected', wasClean)
    // ATTACH SESSIONS RE-ATTACH THEMSELVES.
    //
    // Safe here in a way it would NOT be for a login: re-attaching starts no
    // SGE auth, claims no account slot, spawns no Lich, and cannot bounce
    // anyone out of the game. The character never left — Lich still holds the
    // game connection, scripts are still running — so a dropped attach socket
    // is a lost VIEW, not a lost session, and restoring the view is
    // idempotent. That is the whole promise of attach mode, and it is worth
    // nothing if a Wi-Fi blip or a laptop sleep strands the tab.
    //
    // Not attempted after a CLEAN disconnect: the player closing the tab, or
    // typing `exit`, means they wanted out.
    if (!wasClean && s.meta?.attach) scheduleReattach(s)
  })

  s.connection.on('error', (err: Error) => {
    const payload: ErrorPayload = { sessionId: s.id, message: err.message }
    ownerWindow(s)?.webContents.send(CH.ERROR, payload)
  })
}

// B172: leading-edge coalescing. Pre-v0.13.4 this was a bare setImmediate —
// during a Lich flood (fast travel, script spam) every small socket chunk
// became its own IPC batch, and the renderer ran a FULL pipeline pass + React
// render per chunk (several per frame) — the "chunky, not smooth" travel.
// Now: when the queue has been idle ≥ FLUSH_COALESCE_MS the flush is
// immediate (zero added latency for normal play, same as before); during a
// burst, subsequent flushes wait out the remainder of the window, so the
// renderer sees at most ~one batch per frame and renders once per frame.
// Triggers still fire within ~16ms of arrival. Don't lower this below a
// frame, and don't make it trailing-only (that would add latency to EVERY
// line, including sparse interactive play).
const FLUSH_COALESCE_MS = 16

function scheduleFlush(s: Session) {
  if (s.flushScheduled) return
  s.flushScheduled = true
  const sinceLast = Date.now() - s.lastFlushAt
  const delay = sinceLast >= FLUSH_COALESCE_MS ? 0 : FLUSH_COALESCE_MS - sinceLast
  const run = () => {
    if (s.eventQueue.length > 0 && sessions.has(s.id)) {
      const batch: GameEventBatch = { sessionId: s.id, events: s.eventQueue }
      // While holding for a replay (a move is in flight), DON'T send live — the
      // new window will get these via the replay. Sending now would double them
      // (live + replay) for a session still streaming during the handoff.
      if (!s.holdingForReplay) ownerWindow(s)?.webContents.send(CH.GAME_EVENT, batch)
      // Record for later replay (kept disjoint from the pending eventQueue so a
      // replay during a window handoff can't double up): sticky state into the
      // snapshot (latest wins), scrollback into the ring buffer.
      for (const evt of s.eventQueue) {
        const key = snapshotKey(evt)
        if (key) s.stateSnapshot.set(key, evt)
        else s.historyBuffer.push(evt)
      }
      if (s.historyBuffer.length > HISTORY_BUFFER_MAX) {
        s.historyBuffer.splice(0, s.historyBuffer.length - HISTORY_BUFFER_MAX)
      }
      s.eventQueue = []
      s.lastFlushAt = Date.now()
    }
    s.flushScheduled = false
  }
  if (delay <= 0) setImmediate(run)
  else setTimeout(run, delay)
}

function sendStatus(s: Session, connected: boolean, message: string, clean?: boolean) {
  const payload: ConnectionStatusPayload = { sessionId: s.id, connected, message }
  if (clean !== undefined) payload.clean = clean
  ownerWindow(s)?.webContents.send(CH.CONNECTION_STATUS, payload)
  refreshMenuState()
  broadcastRoster()  // roster `connected` mirrors s.connected — keep windows in sync
}

// ── Auto re-attach ───────────────────────────────────────────────────────────
// Backoff schedule for restoring a dropped attach socket. Front-loaded because
// the common cases — a Wi-Fi hiccup, a VPN re-handshake, a laptop waking —
// clear in seconds; then it settles to a 30s heartbeat and stays there
// INDEFINITELY while the tab is open. Deliberately no attempt cap: the whole
// point of attach mode is that the session outlives the client, so the view
// should keep trying to come back for as long as the player leaves the tab
// open — a cap would guarantee that the one time they wanted it back is the
// time it had quietly given up. The player stops it by closing the tab.
const REATTACH_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000]

function reattachDelay(attempt: number): number {
  return REATTACH_BACKOFF_MS[Math.min(attempt, REATTACH_BACKOFF_MS.length - 1)]
}

function scheduleReattach(s: Session, attempt = 0) {
  if (!s.meta?.attach || !sessions.has(s.id)) return
  const delay = reattachDelay(attempt)
  const secs = Math.round(delay / 1000)
  sendStatus(s, false, attempt === 0
    ? `Connection lost — re-attaching in ${secs}s…`
    : `Re-attaching in ${secs}s… (attempt ${attempt + 1})`)
  s.reattachTimer = setTimeout(() => {
    s.reattachTimer = undefined
    // Re-check under the timer: the tab may have been closed, or the player
    // may have reconnected by hand, while we were waiting.
    if (!sessions.has(s.id) || s.connected || !s.meta?.attach) return
    const { host, port } = s.meta.attach
    sendStatus(s, false, `Re-attaching to ${host}:${port}…`)
    s.connection.connectAttach({
      account: s.meta.account, character: s.meta.character,
      game: s.meta.game, host, port,
    })
      .then(() => {
        if (!sessions.has(s.id)) return
        s.connected = true
        sendStatus(s, true, 'Re-attached')
        broadcastRoster()
      })
      .catch(() => {
        // Still down. The listener is gone or unreachable — keep waiting,
        // because a headless Lich that is briefly unreachable is exactly the
        // situation this exists for.
        if (sessions.has(s.id) && !s.connected) scheduleReattach(s, attempt + 1)
      })
  }, delay)
}

function cancelReattach(s: Session) {
  if (s.reattachTimer) { clearTimeout(s.reattachTimer); s.reattachTimer = undefined }
}

function destroySession(id: SessionId) {
  const s = sessions.get(id)
  if (!s) return
  // Kill any pending re-attach FIRST: the timer closes over the session and
  // would otherwise resurrect a socket for a tab that no longer exists.
  cancelReattach(s)
  // Detach listeners before forceDisconnect so any final event from the socket
  // teardown doesn't fire into a session that's mid-removal.
  s.connection.removeAllListeners()
  s.connection.forceDisconnect()
  sessions.delete(id)
  refreshMenuState()
  broadcastRoster()
}

// Register read-only lich.db3 IPC handlers (vars, settings, sessions) — these
// read a shared SQLite file and are session-agnostic.
registerLichSqliteHandlers()

// Register Session Log IPC handlers (append / flush / list / read / search /
// open-folder). The writer buffers per-character and flushes to per-day files.
registerSessionLogHandlers()

// Register AI (BYOK, capability-routed — DESIGN §10) IPC handlers: per-capability
// key management (safeStorage), key test, and streaming text chat. Keys never
// cross back to the renderer; only booleans + streamed text do.
registerAIHandlers()

// SimuCoin claim (F71, DESIGN §42) — app-level (per ACCOUNT, no sessionId).
// Same secret-handling stance as AI: the renderer names an account, main reads
// the password from safeStorage itself, and only a status shape crosses back.
registerSimuCoinHandlers()

// ── Window ────────────────────────────────────────────────────────────────────

// First-launch size and the resize floor, shared with the saved-bounds resolver
// so a restored window can never come back smaller than the window allows. The
// floor's rationale (B178) sits at the minWidth line below.
const WINDOW_SIZE = { width: 1400, height: 900, minWidth: 480, minHeight: 600 }

// B363: packaged Linux window icon (see the call site in createWindow).
function packagedLinuxIcon(): { icon?: string } {
  if (process.platform !== 'linux') return {}
  const icon = path.join(process.resourcesPath, 'icon.png')
  return fs.existsSync(icon) ? { icon } : {}
}

function createWindow(opts?: { secondary?: boolean; stateKey?: string }): BrowserWindow {
  // F109: reopen where this window was last time — size, position, maximized —
  // but only if that still lands on a monitor attached NOW (windowState.ts,
  // shared/windowBounds.ts). The primary is always 'main'; a decoupled window is
  // keyed by the character that opened it, and left untracked if there is none.
  const stateKey = opts?.secondary ? opts.stateKey : 'main'
  const bounds = restoredBoundsFor(stateKey, WINDOW_SIZE)
  const win = new BrowserWindow({
    ...(bounds.x !== undefined && bounds.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    width: bounds.width,
    height: bounds.height,
    // Packaged builds take the window/taskbar icon from the exe (build/icon.ico
    // baked in by electron-builder); this only matters for DEV (`npm start`),
    // where the exe is node_modules' electron.exe (the atom). Missing file
    // fails soft → default icon. Packaged LINUX is the exception (B363): an
    // AppImage has no exe icon to borrow, so without this its windows show a
    // generic icon. The PNG ships via extraResources; guarded so a build
    // without it degrades to exactly the previous behaviour.
    ...(app.isPackaged ? packagedLinuxIcon() : { icon: path.join(app.getAppPath(), 'build', 'icon.ico') }),
    // B178 (Morress): was 900 — users tile multiple windows side by side
    // (4 columns on a 1920 monitor = 480 each), and the old floor hard-stopped
    // the resize drag at ~half screen. The app-bar degrades for narrow widths
    // via CSS media tiers (app-bar.css: wordmark hides, buttons compact, then
    // the inline action buttons collapse into the ⋯ More menu), so 480 stays
    // fully usable. Don't raise this without checking that ladder.
    minWidth: WINDOW_SIZE.minWidth,
    minHeight: WINDOW_SIZE.minHeight,
    backgroundColor: '#1a1a1a',
    title: `Lichborne v${app.getVersion()} | DragonRealms`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep the renderer fully live when minimized / occluded / backgrounded.
      // Electron defaults this to TRUE, which throttles (or pauses) requestAnimationFrame
      // and timers for a background window. Lichborne keeps processing the game stream
      // while minimized (the socket stays connected, events keep arriving), and critical
      // STATE updates are rAF-driven — most importantly the room-state pump (pitfall #20)
      // that feeds roomState.title/desc/exits to the map matcher. With throttling on, a
      // minimized/idle window froze room state on the last room and the map indicator
      // got stuck there until the window was shown and the player typed LOOK (the
      // long-standing "idle/minimized loses my location" report). Multi-session
      // background characters (pitfall #24) need this off too. See pitfall #71.
      backgroundThrottling: false
    }
  })
  const id = win.webContents.id
  windows.set(id, win)
  if (!opts?.secondary) primaryWindowId = id
  // F109: maximize after construction (the saved rect above is the RESTORE
  // size, so un-maximizing lands where the user left it), then keep the saved
  // state current for as long as this window lives.
  if (bounds.maximized) win.maximize()
  // The requested position rides along so windowState can measure B360's
  // Linux/X11 frame-offset creep; absent when Electron centres the window.
  if (stateKey) {
    trackWindowState(win, stateKey,
      bounds.x !== undefined && bounds.y !== undefined && !bounds.maximized
        ? { x: bounds.x, y: bounds.y } : undefined)
  }

  const rendererPath = path.join(__dirname, '../renderer/index.html')

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(rendererPath)
  }

  if (!app.isPackaged) win.webContents.openDevTools()

  // Push the current roster once the window's renderer is live so it starts
  // synced (also covers a dev hot-reload, which keeps the same webContents id).
  win.webContents.on('did-finish-load', () => broadcastRoster())

  // The "Move Character to New Window" menu item depends on the FOCUSED window's
  // character count, so re-evaluate menu state whenever focus changes.
  win.on('focus', () => refreshMenuState())

  // Tell the renderer when its window is genuinely not on screen, so decorative
  // animation can stop. `backgroundThrottling: false` (see webPreferences) keeps
  // this renderer fully live when minimized — deliberately, because the room
  // pump and the game stream must keep running (pitfall #71) — but that also
  // means every CSS animation in the app keeps burning style/paint work nobody
  // can see: the map's ~20, the Experiences' ~24, the highlight text effects,
  // times every mounted character.
  //
  // This CANNOT be driven from `document.hidden` in the renderer: Electron's own
  // docs state `backgroundThrottling: false` also affects the Page Visibility
  // API, so `hidden` very likely never goes true here and `visibilitychange` may
  // never fire (pitfall #96 flagged the existing guards as probably inert for
  // exactly this reason). The window's own lifecycle events are the reliable
  // signal, and they live in main.
  //
  // Deliberately NOT wired to blur/focus: an unfocused window is usually still
  // fully visible — freezing it because you clicked another app would be a
  // visible regression, not an optimization. Only minimize/hide qualify.
  const pushVisibility = (hidden: boolean) => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('window-visibility', hidden)
    }
  }
  win.on('minimize', () => pushVisibility(true))
  win.on('restore',  () => pushVisibility(false))
  win.on('hide',     () => pushVisibility(true))   // macOS Cmd+H / dock hide
  win.on('show',     () => pushVisibility(false))
  // Wayland: Electron emits no 'minimize' there (the compositor doesn't report
  // it), so animations keep running while minimized — performance only (B366c).

  win.on('close', (e) => {
    const isPrimary = id === primaryWindowId
    if (!isPrimary) {
      // Secondary (decoupled) window closing LOGS OUT its character(s) — a
      // graceful disconnect, like closing a tab. To keep a character running,
      // use Window → "Move Character to Main Window" first (re-home), which
      // empties + auto-closes this window without disconnecting.
      if (closingWindows.has(id)) return  // already draining; let destroy() proceed
      // B353: a QUIT closes every window, secondaries included, before the
      // primary's "Quit Lichborne?" can be answered — so handling it here would
      // log this window's character out even if that prompt is then cancelled.
      // Defer to the primary instead: its app-scope confirm lists EVERY
      // connected character, and runAppShutdown destroys this window. (An
      // already-consented quit — installing an update — keeps the old path.)
      // Same during the shutdown drain itself: the drain owns this window.
      if (appClosing || (quitInProgress && !quitAlreadyConfirmed)) { e.preventDefault(); return }
      // preventDefault FIRST — we own the close from here whether or not the
      // user confirms. The `closingWindows` guard is set only once they have,
      // for the same reason as `appClosing` below.
      e.preventDefault()
      confirmCloseThenRun(win, 'window', () => {
        closingWindows.add(id)
        runSecondaryWindowClose(win)
      })
      return
    }
    // Primary window close == app shutdown. Run the graceful drain + flush once
    // across ALL windows, then destroy everything.
    if (appClosing) return  // already in shutdown sequence; let destroy() proceed
    e.preventDefault()
    // `appClosing` is set INSIDE the callback, never before the confirm. If it
    // were set first and the user cancelled, the guard above would short-circuit
    // every subsequent close and the app could never be quit again. Cancelling
    // has to leave the state exactly as it was — pitfall #114's rule that a
    // handler which defers a lifecycle event owns completing it, including the
    // case where it decides not to.
    confirmCloseThenRun(win, 'app', () => {
      appClosing = true
      runAppShutdown()
    })
  })

  win.on('closed', () => {
    windows.delete(id)
    closingWindows.delete(id)
    // Tear down the sessions that lived in this window — every session for the
    // primary (app quit), or just this window's owned sessions for a secondary.
    if (id === primaryWindowId) {
      for (const sid of Array.from(sessions.keys())) destroySession(sid)
    } else {
      for (const s of Array.from(sessions.values())) if (s.ownerWindowId === id) destroySession(s.id)
    }
  })

  return win
}

// Secondary (decoupled) windows mid-close: guards the async graceful-disconnect
// so a second close event (or the final destroy) doesn't re-enter.
const closingWindows = new Set<number>()

// Windows currently showing a close-confirmation, so a second close attempt
// can't stack dialogs. The dialog is parented to `win` (and therefore modal to
// it) so this is belt-and-braces, but a stray app.quit() can also reach here.
const confirmingClose = new Set<number>()

// Set when a quit is ALREADY user-consented through another surface, so the
// confirmation below stands down. Today that is exactly one path: installing an
// update. `autoUpdater.quitAndInstall()` goes through `app.quit()`, which fires
// the window close handler — so without this, clicking "Install update" with 2+
// characters connected would raise a "quit?" dialog the user has effectively
// already answered, and CANCELLING it would silently abandon the install while
// leaving the update staged. Set it immediately before any such quit.
let quitAlreadyConfirmed = false

// B353: true from `before-quit` until the quit is resolved. Electron documents
// `before-quit` as "emitted before the application starts closing its windows",
// so every window's 'close' during a quit sees it set; the secondary handler
// uses it to defer to the primary's app-scope confirm. Cleared when that
// confirm is cancelled — and, as a self-heal, shortly after `before-quit`, so
// no unforeseen path can leave it stuck (a stuck flag would make a decoupled
// window's own X silently do nothing). The self-heal is harmless: the flag is
// only needed during the close pass the quit triggers, and once the primary has
// either proceeded (appClosing takes over) or is showing its confirm, a close
// on a secondary is an ordinary window close again.
let quitInProgress = false
let quitInProgressTimer: NodeJS.Timeout | null = null
const QUIT_CLOSE_PASS_MS = 3000

function clearQuitInProgress() {
  if (quitInProgressTimer) { clearTimeout(quitInProgressTimer); quitInProgressTimer = null }
  quitInProgress = false
}

/**
 * Ask before a close that would LOG CHARACTERS OUT, then run `proceed`.
 *
 * Closing the primary window quits the app and drains every session — including
 * characters living in decoupled windows — so one reflexive click can cost
 * several logged-in characters. In DR that is a real loss: position, roundtime,
 * whatever was in progress, plus the re-login. Sekmeht asked for a guard.
 *
 * Rules this encodes:
 *  - Counts CONNECTED sessions, not tabs. A disconnected tab costs nothing to
 *    close and must not inflate the number (that was the reporting case).
 *  - App scope spans ALL windows, because closing the primary kills decoupled
 *    windows' characters too. Window scope counts only that window's own.
 *  - Threshold is 2. Prompting at one character would prompt on essentially
 *    every quit, and a dialog people learn to click through protects nothing.
 *  - Names the characters rather than just counting them — that is how you
 *    notice an alt you had forgotten is still logged in.
 *
 * ASYNC on purpose. `showMessageBoxSync` would block the main process, and main
 * owns every session socket — so a confirm left sitting open would stall game
 * processing for every character. The async dialog keeps the client live while
 * you decide.
 *
 * A native dialog is a deliberate exception to the one-modal-look standard
 * (UX #10): the close path must not depend on a renderer that may be mid-flood
 * or already unresponsive.
 */
function confirmCloseThenRun(win: BrowserWindow, scope: 'app' | 'window', proceed: () => void) {
  const id = win.webContents.id
  const connected = Array.from(sessions.values())
    .filter(s => s.connected && (scope === 'app' || s.ownerWindowId === id))

  if (quitAlreadyConfirmed) { proceed(); return }
  if (connected.length < 2) { proceed(); return }
  if (confirmingClose.has(id)) return
  confirmingClose.add(id)

  const names = connected
    .map(s => s.meta?.character?.trim() || '(unnamed)')
    .sort((a, b) => a.localeCompare(b))

  askThemed(win, scope, names)
    // The renderer never acked — hung, crashed, or still booting. Fall back to
    // the native dialog so a bad renderer can NEVER make the app unquittable.
    .catch(() => askNative(win, scope, names))
    // B353: a cancelled app-scope confirm ends the quit — clear the flag so a
    // decoupled window's own close works normally again.
    .then(ok => { confirmingClose.delete(id); if (ok) proceed(); else if (scope === 'app') clearQuitInProgress() })
    .catch(() => { confirmingClose.delete(id); if (scope === 'app') clearQuitInProgress() })
}

// How long to wait for the renderer to confirm it received the request. This
// times the ACK, not the user's answer — once acked we wait indefinitely, so a
// slow decision never trips the fallback and stacks two dialogs.
const QUIT_CONFIRM_ACK_MS = 2000
let quitConfirmSeq = 0

/**
 * Ask via the themed in-app modal (UX #10 chrome). Rejects if the renderer
 * doesn't acknowledge within QUIT_CONFIRM_ACK_MS, which is the caller's cue to
 * fall back to native.
 */
function askThemed(win: BrowserWindow, scope: 'app' | 'window', names: string[]): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) {
      reject(new Error('renderer unavailable')); return
    }
    const reqId = ++quitConfirmSeq
    let acked = false
    let settled = false

    const cleanup = () => {
      clearTimeout(timer)
      ipcMain.removeListener('quit-confirm:shown', onShown)
      ipcMain.removeListener('quit-confirm:response', onResponse)
      if (!win.isDestroyed()) {
        win.removeListener('closed', onRendererGone)
        if (!win.webContents.isDestroyed()) {
          win.webContents.removeListener('did-start-navigation', onNavigate)
          win.webContents.removeListener('render-process-gone', onRendererGone)
        }
      }
    }
    const onShown = (_e: Electron.IpcMainEvent, p: { id: number }) => {
      if (p?.id === reqId) acked = true
    }
    const onResponse = (_e: Electron.IpcMainEvent, p: { id: number; ok: boolean }) => {
      if (p?.id !== reqId || settled) return
      settled = true; cleanup(); resolve(!!p.ok)
    }
    // THE RENDERER CAN VANISH AFTER ACKING, AND THE TIMEOUT WILL NOT SAVE US.
    // Once `acked` is true the timer deliberately stands down (so a slow human
    // decision never stacks a second dialog) — which means the promise then
    // settles ONLY on a response. If the renderer reloads (Ctrl+R is a reserved
    // accelerator and stays available) or the render process dies, that
    // response never comes: the promise hangs, `confirmingClose` is never
    // cleared, and every later close short-circuits on it — the app becomes
    // UNQUITTABLE, which is the exact failure the native fallback exists to
    // prevent. Rejecting here routes those cases back to the native dialog.
    const onRendererGone = () => {
      if (settled) return
      settled = true; cleanup(); reject(new Error('renderer gone'))
    }
    const onNavigate = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details?.isMainFrame && !details?.isSameDocument) onRendererGone()
    }
    const timer = setTimeout(() => {
      if (acked || settled) return
      settled = true; cleanup(); reject(new Error('no ack'))
    }, QUIT_CONFIRM_ACK_MS)

    ipcMain.on('quit-confirm:shown', onShown)
    ipcMain.on('quit-confirm:response', onResponse)
    win.once('closed', onRendererGone)
    // Only a real main-frame document swap (a reload) counts. A same-document
    // navigation would leave the modal standing, and treating it as "gone"
    // would stack a native dialog on top of a perfectly good themed one.
    win.webContents.on('did-start-navigation', onNavigate)
    win.webContents.on('render-process-gone', onRendererGone)
    try { win.webContents.send('quit-confirm:request', { id: reqId, scope, names }) }
    catch { settled = true; cleanup(); reject(new Error('send failed')) }
  })
}

/** Native fallback — no renderer involved, so it works when nothing else does. */
function askNative(win: BrowserWindow, scope: 'app' | 'window', names: string[]): Promise<boolean> {
  // The themed path can reject BECAUSE the window went away, so the fallback
  // must not try to parent a dialog to a corpse. Nothing left to confirm —
  // answer "don't proceed" and let the already-running teardown own it.
  if (win.isDestroyed()) return Promise.resolve(false)
  const isApp = scope === 'app'
  return dialog.showMessageBox(win, {
    type: 'warning',
    noLink: true,
    // Cancel is index 0 AND the default, so a reflexive Enter can't end the
    // session. cancelId also maps Esc / the dialog's own close to Cancel.
    buttons: ['Cancel', isApp ? 'Disconnect and Quit' : 'Disconnect and Close'],
    defaultId: 0,
    cancelId: 0,
    title: isApp ? 'Quit Lichborne?' : 'Close Window?',
    message: isApp
      ? `Disconnect ${names.length} characters and quit Lichborne?`
      : `Disconnect ${names.length} characters and close this window?`,
    detail:
      `Still connected:\n${names.map(n => `    • ${n}`).join('\n')}\n\n`
      + 'They will be logged out — anything in progress ends here.'
      + (isApp ? '' : '\n\nTo keep a character running, use Window → "Move Character to Main Window" first.'),
  }).then(({ response }) => response === 1)
}

// Closing a secondary window LOGS OUT its character(s): graceful quickClose
// disconnect + log flush, then destroy the window (whose 'closed' handler tears
// the sessions down). To keep a character running, re-home it first via
// "Move Character to Main Window" (which empties + auto-closes the window with
// no sessions left to disconnect).
function runSecondaryWindowClose(win: BrowserWindow) {
  const id = win.webContents.id
  const owned = Array.from(sessions.values()).filter(s => s.ownerWindowId === id && s.connected)
  owned.forEach(s => { s.connected = false; s.cleanDisconnect = true })
  try { win.webContents.send('shutdown-starting', { activeCount: owned.length }) } catch {}

  const flush = win.isDestroyed()
    ? Promise.resolve(undefined)
    : win.webContents
        .executeJavaScript('window.__flushProfileSaves ? window.__flushProfileSaves() : Promise.resolve()')
        .catch(() => {})
  const drain = owned.length > 0
    ? Promise.all(owned.map(s => s.connection.gracefulDisconnect({ quickClose: true })))
    : Promise.resolve()

  Promise.all([flush, drain]).finally(() => {
    flushAllSessionLogs()
    flushWriteLogs()
    if (!win.isDestroyed()) win.destroy()
  })
}

// App-quit sequence (fired by the PRIMARY window's close). Flushes every
// window's debounced profile saves, backs up YAML + session logs, drains active
// TCP sessions, then destroys all windows. Mirrors the v0.8.0 (B99) single-
// window shutdown but fans the flush across all windows so a decoupled window's
// unsaved settings reach disk too.
function runAppShutdown() {
  const active = Array.from(sessions.values()).filter(s => s.connected)
  active.forEach(s => { s.connected = false; s.cleanDisconnect = true })

  // Tell every window to paint its "Closing…" overlay before the drain begins.
  try { broadcastAll('shutdown-starting', { activeCount: active.length }) }
  catch { /* a renderer may already be unresponsive — overlay is best-effort */ }

  const t0 = Date.now()
  const stamp = (label: string) => console.log(`[shutdown] ${label} +${Date.now() - t0}ms`)
  stamp('start')

  // Flush pending debounced profile saves in EVERY window (each window's
  // GameWindows hold their own), then back up YAML + flush session logs once.
  const flushAll = Promise.all(
    Array.from(windows.values()).map(w =>
      w.isDestroyed()
        ? Promise.resolve(undefined)
        : w.webContents
            .executeJavaScript('window.__flushProfileSaves ? window.__flushProfileSaves() : Promise.resolve()')
            .catch((err: unknown) => console.error('[shutdown] flush failed', err))
    )
  ).finally(() => { backupAllProfiles(); flushAllSessionLogs(); flushWriteLogs(); stamp('flushAndBackup done') })

  // quickClose=true skips the 5s server-ack wait (B99 followup): fire QUIT, give
  // it ~300ms over the local socket, then force-close.
  const drain = active.length > 0
    ? Promise.all(active.map(s => s.connection.gracefulDisconnect({ quickClose: true })))
        .then(() => stamp('drain done'))
    : Promise.resolve()

  Promise.all([flushAll, drain]).finally(() => {
    stamp('destroy')
    for (const w of Array.from(windows.values())) if (!w.isDestroyed()) w.destroy()
    // EXPLICIT QUIT — do not rely on `window-all-closed`.
    // This path is reached by the primary window's close handler, which called
    // preventDefault() to hold the app open for the drain. If the shutdown was
    // triggered by app.quit() (Cmd+Q, File → Quit, the dock menu), that
    // preventDefault CANCELLED the quit — so once the drain is done nothing
    // re-issues it. Windows and Linux happen to recover because
    // `window-all-closed` quits for non-darwin; macOS deliberately does not,
    // which left the app running with zero windows and Force Quit as the only
    // exit (Zithri, v0.18.2). Quitting here fixes every platform at the source
    // and makes the non-darwin branch a redundant safety net rather than the
    // mechanism.
    app.quit()
  })
}

// B354: the system is restarting, shutting down or logging out (powerMonitor
// 'shutdown', Linux + macOS only — registered in whenReady). Without this, a
// system quit reached the primary window's close handler, which ALWAYS
// preventDefaults to run the drain asynchronously — on macOS that reads as the
// app refusing to quit (the OS can report Lichborne interrupted the restart),
// and on Linux the confirm dialog could appear mid-shutdown. Electron's
// contract: preventDefault() asks the OS to wait, and the app must then quit as
// soon as it can — which runAppShutdown's closing app.quit() does. No confirm:
// the user asked the OS to go down, not us.
//
// Unverified on a Mac: Electron's macOS `terminate:` override is what calls
// this handler, and the Dock's Quit (or an AppleScript quit) also arrives as
// `terminate:` — so those may land here too and quit WITHOUT the multi-character
// confirm. ⌘Q and the app menu's Quit are routed around it (see setupMenu).
function onSystemShutdown(e?: { preventDefault?: () => void }) {
  e?.preventDefault?.()
  // Every close from here on is already consented (the pattern install-update
  // uses), so nothing — no window, no stray quit — can raise a dialog now.
  quitAlreadyConfirmed = true
  if (appClosing) return  // a drain is already running; its app.quit() finishes the job
  appClosing = true
  runAppShutdown()
}

// ── IPC: session lifecycle ────────────────────────────────────────────────────

ipcMain.handle(CH.LOGIN, async (event, creds: LoginCredentials): Promise<LoginResult> => {
  const s = createSession()
  // Attach identity + owning window (the window that initiated the connect) so
  // the session appears in the roster broadcast. event.sender.id is the calling
  // window's webContents id — stable for the window's lifetime.
  s.ownerWindowId = event.sender.id
  // HOLD live delivery until this session has a GameWindow to deliver TO.
  //
  // The pipeline is wired the moment the session exists (`wireSession` in
  // `createSession`), but this handler is an invoke that resolves at the END of
  // login — so the renderer does not learn the sessionId, and therefore cannot
  // mount a GameWindow, until after the socket has already produced text. The
  // game's FIRST data is "Please wait for connection to game server."; it was
  // being flushed to a window whose only `onGameEvent` subscriber (GameWindow)
  // did not exist yet, and every listener filters by sessionId, so it went on
  // the floor. Result: a freshly-connected tab sat blank until the game next
  // said something (Sekmeht, noticed on the SECOND character of a Team Login —
  // the first loses the same lines but fills in before you look at it).
  //
  // Holding buffers it instead, and the GameWindow's existing mount-time
  // `session:request-replay` delivers it once and resumes live. This CANNOT
  // double (the reason a fresh connect skipped replay before): the hold means
  // there was no live delivery to double. The release timer is armed AFTER
  // connect resolves — see below.
  s.replayTarget = s.ownerWindowId
  s.holdingForReplay = true
  s.meta = {
    characterId: makeCharacterId(creds.account, creds.character, creds.game),
    account: creds.account,
    character: creds.character,
    game: creds.game,
    useLich: creds.useLich,
  }
  broadcastRoster()

  // Connect PROGRESS (v0.18.0). The ConnectionManager already emits a running
  // commentary ("Launching Lich...", "Waiting for Lich on localhost:11024...",
  // "Getting login key for X...") and wireSession forwards it as a
  // connection-status event — but during LOGIN the renderer has no sessionId
  // yet (this handler is an invoke that resolves at the END), so every one of
  // those messages was dropped on the floor and the user just watched a
  // spinner. Mirror them to the CALLING window on a dedicated channel keyed by
  // character, so the connecting overlay can narrate what's actually happening
  // and a stall is legible ("Waiting for Lich to start... (12s)") instead of
  // looking like a hang.
  const onProgress = (message: string) => {
    if (event.sender.isDestroyed()) return
    event.sender.send('connect-progress', { character: creds.character, message })
  }
  s.connection.on('status', onProgress)
  try {
    if (creds.useLich) {
      await s.connection.connectViaLich(creds)
    } else {
      await s.connection.connectDirect(creds)
    }
    s.connected = true
    sendStatus(s, true, 'Connected')
    // Arm the safety net HERE, not where the hold was set: it both releases the
    // hold and DELIVERS the buffer, and its window has to measure "how long
    // until the renderer mounts the GameWindow", not "how long login takes".
    // Armed at the top it would fire mid-login — into the same void this hold
    // exists to avoid — on any connect that takes longer than 5s, which a Lich
    // launch routinely does.
    scheduleReplayHoldRelease(s)
    return { ok: true, sessionId: s.id }
  } catch (err) {
    destroySession(s.id)
    return { ok: false, error: String(err) }
  } finally {
    // Stop mirroring once login settles — from here the session is real and
    // its status flows through the normal connection-status channel.
    s.connection.off('status', onProgress)
  }
})

// Attach to an already-running detachable Lich session. The same session
// lifecycle as CH.LOGIN — mint, hold-for-replay, roster, progress mirroring —
// with connectAttach in place of the SGE + spawn pipeline. useLich is true by
// definition (the whole point is that Lich is on the other end), which is what
// keeps the Lich Scripts panel polling and the rest of the Lich-only surface
// alive for attached tabs. The B169 inv-boxes `_flag` one-shot keys off the
// player-info event, which an attach never re-emits (Lich sent <app> to its
// FIRST front-end at login) — so it simply never fires here; if the running
// session's original front-end was Wrayth-shaped it was already sent, and if
// not, the greedy-strip exposure is no worse than that session already had.
ipcMain.handle(CH.LOGIN_ATTACH, async (event, creds: AttachCredentials): Promise<LoginResult> => {
  const s = createSession()
  s.ownerWindowId = event.sender.id
  // Same hold as CH.LOGIN and for the same reason: the renderer can't mount a
  // GameWindow until this invoke resolves, and Lich pushes its state resync
  // the moment we attach — without the hold, that resync (the exact vitals /
  // indicators an attached tab needs most) is flushed into a window with no
  // subscriber and dropped on the floor.
  s.replayTarget = s.ownerWindowId
  s.holdingForReplay = true
  s.meta = {
    characterId: makeCharacterId(creds.account, creds.character, creds.game),
    account: creds.account,
    character: creds.character,
    game: creds.game,
    useLich: true,
    // Remembered on the session (and thus the roster) so Reconnect re-attaches
    // to the same listener instead of relaunching a login — in any window.
    attach: { host: creds.host, port: creds.port },
  }
  broadcastRoster()

  const onProgress = (message: string) => {
    if (event.sender.isDestroyed()) return
    event.sender.send('connect-progress', { character: creds.character, message })
  }
  s.connection.on('status', onProgress)
  try {
    await s.connection.connectAttach(creds)
    s.connected = true
    sendStatus(s, true, 'Attached')
    scheduleReplayHoldRelease(s)
    return { ok: true, sessionId: s.id }
  } catch (err) {
    destroySession(s.id)
    return { ok: false, error: String(err) }
  } finally {
    s.connection.off('status', onProgress)
  }
})

// Returns this window's stable id + whether it's the primary (launcher) window.
// The renderer uses the id to filter the roster to sessions it owns, and
// isPrimary to choose its empty-state (primary → Launcher; secondary → a small
// "opening…" placeholder until its decoupled session mounts).
ipcMain.handle('get-window-info', (event) => ({
  windowId: event.sender.id,
  isPrimary: event.sender.id === primaryWindowId,
}))

// App version for the About modal (reads package.json via Electron) — keeps the
// version dynamic in the renderer, never hardcoded.
ipcMain.handle('get-app-version', () => app.getVersion())

// The owner window's GameWindow reports the server-canonical character name
// (from player-info XML) so the roster — and thus other windows' Quick Send —
// shows the right casing.
ipcMain.on('session:set-name', (_event, sessionId: SessionId, character: string) => {
  const s = getSession(sessionId)
  if (s?.meta && s.meta.character !== character) {
    s.meta.character = character
    broadcastRoster()
  }
})

// Safety net for the replay hold: if a moved session's new window never requests
// its replay (e.g. its GameWindow failed to mount), don't hold its live events
// forever. After a few seconds, deliver the buffered history once and resume
// live. Guarded on the same replayTarget so a newer move isn't clobbered.
function scheduleReplayHoldRelease(s: Session) {
  const target = s.replayTarget
  setTimeout(() => {
    if (!s.holdingForReplay || s.replayTarget !== target || !sessions.has(s.id)) return
    s.holdingForReplay = false
    s.replayTarget = undefined
    const win = ownerWindow(s)
    const events = [...s.stateSnapshot.values(), ...s.historyBuffer]
    if (win && events.length > 0) {
      win.webContents.send(CH.GAME_EVENT, { sessionId: s.id, events, replay: true } as GameEventBatch)
    }
  }, 5000)
}

// ── IPC: multi-window decouple (v0.11.0) ─────────────────────────────────────
// Move which window renders a session. 'new' opens a fresh secondary window; a
// numeric id moves the session to an existing window (e.g. re-home to primary).
// The socket/parser/LichBridge are NEVER touched — only ownerWindowId changes,
// so owner-targeted event routing follows the session to its new window.
ipcMain.handle('session:move-window', (_event, sessionId: SessionId, target: 'new' | 'main' | number) => {
  const s = getSession(sessionId)
  if (!s) return
  const sourceWindowId = s.ownerWindowId

  if (target === 'new') {
    // Don't decouple the only character in a window — it'd just leave the source
    // window empty for no benefit. The UI greys this out too; this is the
    // authoritative backstop covering every entry point.
    const ownedCount = Array.from(sessions.values()).filter(x => x.ownerWindowId === sourceWindowId).length
    if (ownedCount <= 1) return
    // F109: key the new window by this character, so decoupling them again
    // reopens their window where it was last left.
    const win = createWindow({ secondary: true, stateKey: s.meta ? `char:${s.meta.characterId}` : undefined })
    s.ownerWindowId = win.webContents.id
    s.replayTarget = win.webContents.id  // this window earned a history replay
    s.holdingForReplay = true            // hold live until the replay is delivered
    scheduleReplayHoldRelease(s)
    // The new window pulls its owned sessions on mount (get-owned-sessions), so
    // no acquire push is needed for it. Tell the source window to drop the tab
    // now. A second of game text may be missed during the window-open handoff
    // (acceptable, like a brief reconnect; the on-disk session log is intact).
    windowById(sourceWindowId)?.webContents.send('session-release', sessionId)
    broadcastRoster()
    refreshMenuState()
    return
  }

  // Move to an already-open window ('main' → primary, or a specific id): push an
  // acquire to it (its renderer is live with a listener), release from source.
  const targetId = target === 'main' ? primaryWindowId : target
  const targetWin = windowById(targetId)
  if (!targetWin || targetId === sourceWindowId) return
  s.ownerWindowId = targetId
  s.replayTarget = targetId  // the receiving window earned a history replay
  s.holdingForReplay = true  // hold live until the replay is delivered
  scheduleReplayHoldRelease(s)
  const entry = rosterEntryFor(s)
  if (entry) targetWin.webContents.send('session-acquire', entry)
  windowById(sourceWindowId)?.webContents.send('session-release', sessionId)
  broadcastRoster()
  refreshMenuState()

  // Auto-close a now-empty SECONDARY source window (its character just left).
  // destroy() skips the 'close' (logout) path — correct, since there's nothing
  // left to disconnect.
  if (sourceWindowId !== primaryWindowId) {
    const stillOwned = Array.from(sessions.values()).some(x => x.ownerWindowId === sourceWindowId)
    if (!stillOwned) windowById(sourceWindowId)?.destroy()
  }
})

// A freshly-loaded window pulls the sessions main has assigned to it (used by a
// new decoupled window on mount, and to recover tabs after a dev hot-reload).
ipcMain.handle('get-owned-sessions', (event): RosterEntry[] =>
  buildRoster().filter(r => r.ownerWindowId === event.sender.id))

// Pull the FULL roster on mount. broadcastRoster() is push-only and fires on
// did-finish-load — a race a freshly-opened window's renderer loses (it
// subscribes after React mounts), so without this pull a decoupled window
// could keep an empty roster and Quick Send (which targets the cross-window
// roster) would render nothing. Mirrors get-owned-sessions' pull-on-mount.
ipcMain.handle('get-roster', (): RosterEntry[] => buildRoster())

// Cross-window remount (Profile Transfer): the modal can run in any window but a
// target character may live in ANOTHER window. After writing the imported
// localStorage working copy (shared across windows), route a reload to the
// session's OWNER window so its GameWindow remounts and re-reads the new state —
// otherwise the owner window's stale in-memory state would overwrite the import
// on its next save (pitfall #56, cross-window).
ipcMain.on('session:reload', (_e, characterId: string) => {
  const s = Array.from(sessions.values()).find(x => x.meta?.characterId === characterId)
  if (!s) return
  // B165 root cause (JadedSoul, confirmed 2026-06-11): an import-triggered
  // remount mounted a fresh GameWindow with default state and NO replay —
  // vitals self-heal on their next change, but DR only re-sends a hand tag
  // when the hand CHANGES, so a long-parked item (Illia's cookbook) showed
  // "Empty" until a manual glance. Arm the same replay the move-window path
  // uses (pitfall #60): the remounted GameWindow's session:request-replay now
  // restores scrollback + every sticky state (hands/vitals/room/spell/RT/…),
  // and the hold prevents live/replay doubling during the remount window.
  // Bonus: the remount no longer clears in-memory scrollback (the old
  // documented tradeoff in pitfall #56).
  s.replayTarget = s.ownerWindowId
  s.holdingForReplay = true
  scheduleReplayHoldRelease(s)
  windowById(s.ownerWindowId)?.webContents.send('session-reload', characterId)
})

// A GameWindow requests a replay of its session's recent history on mount, so a
// decoupled / re-homed / remounted window paints scrollback + room/map/vitals
// instead of starting blank. Delivered as a normal game-event batch flagged
// replay:true to the requesting window only — the renderer rebuilds display +
// state but runs no side effects (no triggers, no logging).
//
// v0.19.0: this is ALSO how a FIRST connect gets its opening text. It used to
// say "fresh sessions have an empty buffer, so this is a harmless no-op on a
// first connect" — which was true of the buffer and wrong about the outcome:
// the login text had already been flushed to a window with no GameWindow
// mounted, so it was lost rather than buffered. Login now holds delivery, so
// the buffer is populated and this is the claim.
ipcMain.on('session:request-replay', (event, sessionId: SessionId) => {
  const s = getSession(sessionId)
  if (!s) return
  // Only replay to the window the session is FOR (replayTarget) — set by a move
  // (decouple / re-home / reload) and, since v0.19.0, by LOGIN itself. Doubling
  // is prevented by the HOLD rather than by withholding the replay: while
  // `holdingForReplay` is set nothing is delivered live, so there is no live
  // copy for this to duplicate. One-shot: cleared on deliver.
  if (s.replayTarget !== event.sender.id) return
  s.replayTarget = undefined
  s.holdingForReplay = false  // replay delivered — resume live delivery
  // Snapshot FIRST (restore current vitals / room / RT / indicators / … — these
  // are always current regardless of age), THEN the scrollback history. This is
  // why static bars (a vital sitting at 100%) come back: their latest value is
  // in the snapshot even if it last changed thousands of events ago.
  const events = [...s.stateSnapshot.values(), ...s.historyBuffer]
  if (events.length === 0) return
  const batch: GameEventBatch = { sessionId: s.id, events, replay: true }
  event.sender.send(CH.GAME_EVENT, batch)
})

ipcMain.on(CH.SEND_COMMAND, (_event, sessionId: SessionId, command: string) => {
  const s = getSession(sessionId)
  if (!s) return
  const trimmed = command.trim().toLowerCase()
  if (trimmed === 'quit' || trimmed === 'exit') s.cleanDisconnect = true
  s.connection.send(command)
})

// v0.19.0: text typed AT a character from somewhere else — the Overview's input
// bar, or Quick Send. Unlike SEND_COMMAND above, this does NOT write to the
// socket: it is forwarded to the window that OWNS the session, whose GameWindow
// runs it through its normal input path, so it resolves aliases, splits on `;`,
// echoes `>cmd`, and reaches command history and the session log.
//
// Main is the hop because the target may live in a DECOUPLED window. A
// renderer-side DOM event only reaches the window that fired it, so Quick Send
// to a character in another window would silently deliver nothing — which is
// exactly the case the previous raw-send path got right by accident (it went
// through main) and a naive fix would have broken.
//
// Silently returns on a dead sessionId, matching SEND_COMMAND: a stale target is
// a no-op, never a crash.
ipcMain.on(CH.SEND_USER_TEXT, (_event, sessionId: SessionId, text: string) => {
  const s = getSession(sessionId)
  if (!s) return
  const payload: UserTextPayload = { sessionId, text }
  ownerWindow(s)?.webContents.send(CH.USER_TEXT, payload)
})

ipcMain.on(CH.DISCONNECT, (_event, sessionId: SessionId) => {
  const s = getSession(sessionId)
  if (!s) return
  // An explicit Disconnect outranks a pending auto re-attach — otherwise the
  // tab the player just closed the connection on springs back to life.
  cancelReattach(s)
  s.cleanDisconnect = true
  sendStatus(s, false, 'Disconnecting...')
  s.connection.gracefulDisconnect().then(() => {
    sendStatus(s, false, 'Disconnected', true)
  })
})

// Awaitable variant of CH.DISCONNECT (v0.8.0). The fire-and-forget channel
// above is fine when the caller doesn't care exactly when the disconnect
// completes (most cases — the connection-status event keeps the UI in sync).
// The auto-disconnect-then-connect flow in the launcher conflict modal DOES
// care: it has to wait for DR's server-side account slot to actually release
// before attempting the next login, otherwise SGE returns "Invalid login key"
// because the old character is still considered connected. Returns when
// gracefulDisconnect resolves (server-acked drop OR 5s timeout floor).
ipcMain.handle('disconnect-await', async (_event, sessionId: SessionId) => {
  const s = getSession(sessionId)
  if (!s) return
  cancelReattach(s)
  s.cleanDisconnect = true
  sendStatus(s, false, 'Disconnecting...')
  await s.connection.gracefulDisconnect()
  sendStatus(s, false, 'Disconnected', true)
})

ipcMain.on(CH.SESSION_DESTROY, (_event, sessionId: SessionId) => {
  destroySession(sessionId)
})

ipcMain.on('debug-panel-toggle', (_e, sessionId: SessionId, open: boolean) => {
  const s = getSession(sessionId)
  if (s) s.debugPanelOpen = open
})

// §35.6 perf gate: scene capturers + scene-event emission run ONLY while the
// session has an open Experience (the owning GameWindow toggles this on
// expAnyOpen changes — the debug-panel-toggle precedent). On activation,
// backfill the current cast immediately (SceneParser tracked it silently)
// so a just-opened Tableau paints without waiting for the next room update.
ipcMain.on('scene-active-toggle', (_e, sessionId: SessionId, active: boolean) => {
  const s = getSession(sessionId)
  if (!s) return
  s.parser.sceneCapturersEnabled = active
  s.sceneParser.setActive(active)
  if (active) {
    s.eventQueue.push(s.sceneParser.snapshotCast())
    scheduleFlush(s)
  }
})

// ── IPC: per-session Lich command injection ──────────────────────────────────

ipcMain.handle('lich:poll-scripts', (_e, sessionId: SessionId) => {
  // LichBridge.pollScriptList (not injector.pollScriptList) so the
  // silent-consume window is armed — the auto-poll response is hidden,
  // a player-typed `;list` is not.
  getSession(sessionId)?.lichBridge.pollScriptList()
})
ipcMain.handle('lich:pause-script', (_e, sessionId: SessionId, name: string) => {
  getSession(sessionId)?.lichBridge.injector.pauseScript(name)
})
ipcMain.handle('lich:resume-script', (_e, sessionId: SessionId, name: string) => {
  getSession(sessionId)?.lichBridge.injector.resumeScript(name)
})
ipcMain.handle('lich:kill-script', (_e, sessionId: SessionId, name: string) => {
  getSession(sessionId)?.lichBridge.injector.killScript(name)
})
ipcMain.handle('lich:start-script', (_e, sessionId: SessionId, name: string, args?: string) => {
  getSession(sessionId)?.lichBridge.injector.startScript(name, args)
})

// ── IPC: file system helpers (session-agnostic) ──────────────────────────────

ipcMain.handle('browse-file', async (_event, filters: { name: string; extensions: string[] }[]) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
  return result.canceled ? null : result.filePaths[0] ?? null
})

// Sort semver-ish version dir names newest-first (shared by the Windows
// Ruby4Lich5 scan and the Linux/Mac rbenv-versions scan).
function sortVersionsDesc(names: string[]): string[] {
  return names.slice().sort((a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return (pb[i] ?? 0) - (pa[i] ?? 0)
    }
    return 0
  })
}

// Best-effort `ruby -v` probe. Lich 5.18+ hard-requires Ruby 4.0 and refuses
// to launch on older interpreters (it surfaces as a failed-launch banner) —
// warning at setup time beats a confusing connect failure. Notably the Fedora
// wiki path installs the SYSTEM Ruby (3.3/3.4 as of Fedora 43), which is
// exactly the trap this catches. Returns null when the probe fails (missing
// file, timeout) — version-unknown is NOT an error condition.
function probeRubyVersion(rubyPath: string): Promise<string | null> {
  return new Promise(resolve => {
    try {
      // windowsHide explicitly: ruby.exe is a console-subsystem binary spawned
      // from a GUI process, and this codebase treats console-window context as
      // load-bearing (see LichConnection's spawn notes). Cheaper to be explicit
      // than to rely on the Node default.
      cp.execFile(expandHome(rubyPath), ['-v'], { timeout: 3000, windowsHide: true }, (err, stdout) => {
        if (err) { resolve(null); return }
        const m = /ruby (\d+\.\d+\.\d+)/.exec(String(stdout))
        resolve(m ? m[1] : null)
      })
    } catch { resolve(null) }
  })
}

// Major version of a probed "x.y.z" string (NaN-safe: an unparsable one reads 0).
function rubyMajor(version: string): number {
  return parseInt(version, 10) || 0
}

// B355: the first candidate that reports Ruby 4 or newer (Lich 5.18+ refuses
// anything older), in candidate order. Sequential, so the common case costs one
// probe; each probe is capped at 3s by probeRubyVersion, and the whole search
// at RUBY_SEARCH_BUDGET_MS, so a pile of broken shims can't stall startup.
const RUBY_SEARCH_BUDGET_MS = 8000
async function firstModernRuby(candidates: string[]): Promise<{ path: string; version: string } | null> {
  const deadline = Date.now() + RUBY_SEARCH_BUDGET_MS
  for (const c of candidates) {
    if (Date.now() > deadline) break
    const version = await probeRubyVersion(c)
    if (version && rubyMajor(version) >= 4) return { path: c, version }
  }
  return null
}

// Per-platform Lich/Ruby auto-discovery (v0.18.0 cross-platform). Probe lists
// come from the official install docs: Windows = the Ruby4Lich5 one-click
// installer layout; Linux/Mac = the elanthia-online wiki (zip extracted to
// ~/Lich5 — BOTH casings probed, Linux filesystems are case-sensitive and the
// wiki itself mixes them; the Mac guide has users drag the folder to
// ~/Desktop/Lich5; Ruby via rbenv on Debian/Mac, system Ruby on Fedora,
// Homebrew as a fallback). Explicit absolute paths everywhere — NEVER resolve
// bare `ruby` from PATH: a GUI app launched from Finder/the dock doesn't
// inherit the shell PATH that makes rbenv shims work.
//
// `probeDesktop` (Mac only): touching ~/Desktop fires the macOS privacy
// consent prompt, so only the setup dialog's explicit Auto Detect passes true
// — the silent startup discovery in App.tsx must never trigger that dialog.
ipcMain.handle('discover-lich-paths', async (_event, currentRuby: string, currentLich: string, opts?: { probeDesktop?: boolean; interactive?: boolean }) => {
  const platform = process.platform
  const result = {
    platform,
    rubyPath:         null as string | null,
    lichPath:         null as string | null,
    rubyAlreadyValid: fs.existsSync(expandHome(currentRuby ?? '')),
    lichAlreadyValid: fs.existsSync(expandHome(currentLich ?? '')),
    baseFolderExists: false,
    rubyVersion:      null as string | null,
    // Back-compat field — LichSetupFields keyed its whole status banner on it
    // pre-v0.18.0. Kept in sync with `platform`.
    isWindows:        platform === 'win32',
  }
  const home = os.homedir()
  // True once the macOS/Linux branch has version-probed (B355), so the
  // interactive probe below doesn't spawn the same `ruby -v` again.
  let rubyProbed = false

  if (platform === 'win32') {
    const base = 'C:\\Ruby4Lich5'
    result.baseFolderExists = fs.existsSync(base)
    if (result.baseFolderExists) {
      if (!result.rubyAlreadyValid) {
        try {
          const versionDirs = sortVersionsDesc(
            fs.readdirSync(base, { withFileTypes: true })
              .filter(e => e.isDirectory() && /^\d+\.\d+\.\d+$/.test(e.name))
              .map(e => e.name)
          )
          for (const v of versionDirs) {
            const candidate = path.join(base, v, 'bin', 'ruby.exe')
            if (fs.existsSync(candidate)) { result.rubyPath = candidate; break }
          }
        } catch {}
      }
      if (!result.lichAlreadyValid) {
        const candidate = path.join(base, 'Lich5', 'lich.rbw')
        if (fs.existsSync(candidate)) result.lichPath = candidate
      }
    }
  } else {
    // Linux + macOS. Lich: the wiki's zip lands in ~/Lich5 (docs also write
    // ~/lich5 — probe both); Mac's guide additionally uses ~/Desktop/Lich5.
    const lichCandidates = [
      path.join(home, 'Lich5', 'lich.rbw'),
      path.join(home, 'lich5', 'lich.rbw'),
      path.join(home, 'lich-5', 'lich.rbw'),
      ...(platform === 'darwin' && opts?.probeDesktop
        ? [path.join(home, 'Desktop', 'Lich5', 'lich.rbw')]
        : []),
    ]
    // Ruby: rbenv shim first (version-agnostic, survives `rbenv global`
    // changes), then concrete rbenv versions newest-first, then the asdf and
    // mise shims, then Homebrew's KEG path before its plain bin (Apple Silicon +
    // Intel prefixes) — Homebrew's `ruby` formula is keg-only, so a Homebrew
    // Ruby lives at opt/ruby/bin and is not linked into bin/ — then, on Linux
    // only, system Ruby. /usr/bin/ruby is dropped on macOS (B355): it is
    // Apple's Ruby 2.6, which Lich 5.18+ refuses to run on.
    const rubyCandidates: string[] = [path.join(home, '.rbenv', 'shims', 'ruby')]
    try {
      const versionsDir = path.join(home, '.rbenv', 'versions')
      const versions = sortVersionsDesc(
        fs.readdirSync(versionsDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && /^\d+\.\d+\.\d+$/.test(e.name))
          .map(e => e.name)
      )
      for (const v of versions) rubyCandidates.push(path.join(versionsDir, v, 'bin', 'ruby'))
    } catch {}
    rubyCandidates.push(
      path.join(home, '.asdf', 'shims', 'ruby'),
      path.join(home, '.local', 'share', 'mise', 'shims', 'ruby'),
      '/opt/homebrew/opt/ruby/bin/ruby', '/usr/local/opt/ruby/bin/ruby',
      '/opt/homebrew/bin/ruby', '/usr/local/bin/ruby',
      ...(platform === 'darwin' ? [] : ['/usr/bin/ruby']),
    )

    result.baseFolderExists = lichCandidates.some(c => fs.existsSync(path.dirname(c)))
    if (!result.lichAlreadyValid) {
      for (const c of lichCandidates) {
        if (fs.existsSync(c)) { result.lichPath = c; break }
      }
    }

    // B355: an EXISTING Ruby is not enough. The silent startup pass used to
    // save the first one that existed, and once saved a path counts as valid,
    // so no later search replaced it — a Mac with only the system Ruby, or a
    // Linux box with an older system Ruby, was pinned to an interpreter Lich
    // refuses. So probe versions here on the silent path too. Off Windows only:
    // the reason the silent path skips `ruby -v` (below) is antivirus
    // heuristics flagging a ruby.exe run at boot, which is a Windows concern.
    const existingRubies = rubyCandidates.filter(c => fs.existsSync(c))
    if (!result.rubyAlreadyValid) {
      const modern = await firstModernRuby(existingRubies)
      if (modern) {
        result.rubyPath = modern.path
        result.rubyVersion = modern.version
      } else if (opts?.probeDesktop || opts?.interactive) {
        // An explicit Auto Detect still offers the first Ruby it found, with
        // its version, so the setup dialog can say WHY it won't work (the
        // Ruby 4 warning) instead of silently finding nothing. The silent path
        // saves nothing rather than an old Ruby.
        const first = existingRubies[0]
        if (first) {
          result.rubyPath = first
          result.rubyVersion = await probeRubyVersion(first)
        }
      }
      rubyProbed = true
    } else if (opts?.probeDesktop || opts?.interactive) {
      // Explicit Auto Detect with a configured Ruby that exists: if it is
      // known to be older than 4, look for a Ruby 4+ and offer it. An UNKNOWN
      // version (probe failed) is not evidence of a problem — leave it be.
      const current = await probeRubyVersion(currentRuby)
      result.rubyVersion = current
      if (current !== null && rubyMajor(current) < 4) {
        const configured = path.resolve(expandHome(currentRuby))
        const modern = await firstModernRuby(existingRubies.filter(c => path.resolve(c) !== configured))
        if (modern) {
          result.rubyPath = modern.path
          result.rubyVersion = modern.version
        }
      }
      rubyProbed = true
    }
  }

  // Version-probe whichever Ruby the user will end up with (freshly found, or
  // the already-valid configured one) — but ONLY for an explicit Auto Detect.
  // The silent startup discovery must not spawn a `ruby -v` child process on
  // every launch: nothing reads rubyVersion on that path, it delays startup by
  // up to the probe timeout, and an unexplained ruby.exe execution at boot is
  // exactly what AV/EDR heuristics flag. Gated on the same opt-in as the mac
  // Desktop probe (this is why the flag is `interactive`, not `probeDesktop`).
  // (Windows only in practice since B355: macOS/Linux probe above.)
  if ((opts?.probeDesktop || opts?.interactive) && !rubyProbed) {
    const effectiveRuby = result.rubyPath ?? (result.rubyAlreadyValid ? currentRuby : null)
    if (effectiveRuby) result.rubyVersion = await probeRubyVersion(effectiveRuby)
  }

  return result
})

// Cross-platform (v0.18.0): whether OS-encrypted password storage is usable.
// Windows (DPAPI) and macOS (Keychain) are always true; Linux needs a secret
// service (GNOME Keyring / KWallet) — false on bare window-manager setups,
// where savePassword silently no-ops. The wizard shows a notice so "remember
// password didn't remember" reads as a missing keyring, not a broken app.
ipcMain.handle('secure-storage-available', () => safeStorage.isEncryptionAvailable())

ipcMain.handle('browse-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('list-map-dir', (_event, dir: string) => {
  try {
    if (!fs.existsSync(dir)) return null  // directory moved/deleted
    return fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.xml'))
      .map(f => ({ name: f, path: path.join(dir, f) }))
  } catch { return null }
})

// expandHome: this is the ONE main-side file reader that receives a
// RENDERER-BUILT path, and the renderer stores Lich paths in their `~` form
// (v0.18.0). Without it, every Lich Dashboard read failed on Linux/macOS.
ipcMain.handle('read-file', (_event, filePath: string) => {
  try { return fs.readFileSync(expandHome(filePath), 'utf-8') } catch { return null }
})

// ── Genie maps parse cache ────────────────────────────────────────────────────
//
// Initial parse of a Genie maps folder (122 XML files, ~thousands of rooms
// total) takes several seconds — DOMParser is synchronous and chunky.
// Cache the parsed result keyed by a fingerprint of the source folder's
// filename + mtime + size set. On subsequent launches, if the fingerprint
// matches we skip parsing entirely and load the precomputed zones in
// ~50 ms (just JSON.parse).
//
// Cache invalidates automatically when:
//   - Any XML in the folder is added/removed
//   - Any XML's mtime or size changes
//   - The selected folder path itself changes
//   - Schema bump (see CACHE_VERSION)
//
// Stored in userData/genie-cache.json. Single file rather than per-zone
// chunks — the whole set is loaded as one read, decoded as one JSON.parse,
// and handed to the renderer as one array.

const GENIE_CACHE_VERSION = 1
const GENIE_CACHE_FILE = path.join(app.getPath('userData'), 'genie-cache.json')

function computeGenieFingerprint(dir: string): string {
  // Sorted `name:mtimeMs:size` segments joined with `|`. Sorting makes the
  // result stable regardless of directory iteration order. Including size
  // alongside mtime catches the edge case where the OS rounds mtime to
  // 1-second resolution and a same-second edit goes unnoticed.
  if (!fs.existsSync(dir)) return ''
  const entries = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.xml'))
    .sort()
    .map(f => {
      const stat = fs.statSync(path.join(dir, f))
      return `${f}:${Math.round(stat.mtimeMs)}:${stat.size}`
    })
  return entries.join('|')
}

ipcMain.handle('genie-cache:load', (_e, dir: string): unknown[] | null => {
  try {
    if (!dir || !fs.existsSync(GENIE_CACHE_FILE)) return null
    const raw = fs.readFileSync(GENIE_CACHE_FILE, 'utf-8')
    const cache = JSON.parse(raw)
    if (cache?.version !== GENIE_CACHE_VERSION) return null
    if (cache?.dir !== dir) return null
    if (cache?.fingerprint !== computeGenieFingerprint(dir)) return null
    if (!Array.isArray(cache.zones)) return null
    return cache.zones
  } catch {
    return null
  }
})

ipcMain.handle('genie-cache:save', (_e, dir: string, zones: unknown[]): boolean => {
  try {
    const payload = {
      version: GENIE_CACHE_VERSION,
      dir,
      fingerprint: computeGenieFingerprint(dir),
      zones,
    }
    fs.writeFileSync(GENIE_CACHE_FILE, JSON.stringify(payload), 'utf-8')
    return true
  } catch (e) {
    console.error('genie-cache:save failed:', e)
    return false
  }
})

// ── Weather & Moons: community sun anchors ────────────────────────────────────
// The dr-scripts Firebase (`moon_data_v2.json`) is the SAME public read-only
// feed moonwatch.lic itself polls — its `s` node carries the most recent
// community-OBSERVED sunrise (`r`) / sunset (`s`) unix epochs, which are
// exactly the two anchors computeSunPhase wants (true day length + phase, no
// 180/180 assumption). Read-only GET, ~once per experience-open (renderer is
// ref-guarded), 10-min cache here as a backstop; every failure path returns
// null and the renderer degrades to the UserVars/observed-prose seeds.
const MOON_DATA_URL = 'https://dr-scripts.firebaseio.com/moon_data_v2.json'
let sunDataCache: { at: number; data: { sunRiseAt: number; sunSetAt: number } | null } | null = null

ipcMain.handle('moons:fetch-sun-data', async (): Promise<{ sunRiseAt: number; sunSetAt: number } | null> => {
  if (sunDataCache && Date.now() - sunDataCache.at < 10 * 60_000) return sunDataCache.data
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 6000)
    const res = await fetch(MOON_DATA_URL, { signal: ctl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as { s?: { r?: number; s?: number } }
    const r = json?.s?.r
    const st = json?.s?.s
    const data = (typeof r === 'number' && typeof st === 'number' && r > 0 && st > 0)
      ? { sunRiseAt: r * 1000, sunSetAt: st * 1000 }
      : null
    sunDataCache = { at: Date.now(), data }
    return data
  } catch (e) {
    console.warn('[moons] sun-data fetch failed:', e)
    sunDataCache = { at: Date.now(), data: null }  // don't hammer on failure
    return null
  }
})

// ── Lich file-system helpers ──────────────────────────────────────────────────

function lichDirFrom(lichPath: string): string {
  // expandHome: Linux/Mac lichPath defaults are `~`-relative (v0.18.0).
  return path.dirname(expandHome(lichPath))
}

ipcMain.handle('find-lich-map-file', (_e, lichPath: string): { jsonPath: string; mapsDir: string } | null => {
  if (!lichPath) return null
  const lichDir = lichDirFrom(lichPath)
  const mapsDir = path.join(lichDir, 'maps')
  // Scan all subdirs under data/ for the highest-sequence map-*.json
  const dataRoot = path.join(lichDir, 'data')
  try {
    const gameDirs = fs.readdirSync(dataRoot, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(dataRoot, e.name))
    const candidates = gameDirs.flatMap(dir => {
      try {
        return fs.readdirSync(dir).flatMap(f => {
          const m = /^map-(\d+)\.json$/i.exec(f)
          if (!m) return []
          const fp = path.join(dir, f)
          try { return [{ fp, seq: parseInt(m[1], 10), mtime: fs.statSync(fp).mtimeMs }] } catch { return [] }
        })
      } catch { return [] }
    }).sort((a, b) => b.seq - a.seq || b.mtime - a.mtime)
    if (candidates.length > 0) return { jsonPath: candidates[0].fp, mapsDir }
  } catch {}
  return null
})

ipcMain.handle('read-map-image', (_e, mapsDir: string, imageName: string): string | null => {
  try { return fs.readFileSync(path.join(mapsDir, imageName)).toString('base64') } catch { return null }
})

ipcMain.handle('list-lich-scripts', (_e, lichPath: string): { name: string; source: 'core' | 'custom'; lastModified: number }[] => {
  if (!lichPath) return []
  const lichDir = lichDirFrom(lichPath)
  const results: { name: string; source: 'core' | 'custom'; lastModified: number }[] = []
  for (const { dir, source } of [
    { dir: path.join(lichDir, 'scripts', 'custom'), source: 'custom' as const },
    { dir: path.join(lichDir, 'scripts'),           source: 'core'   as const },
  ]) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isFile() || !e.name.toLowerCase().endsWith('.lic')) continue
        const stat = fs.statSync(path.join(dir, e.name))
        results.push({ name: e.name.replace(/\.lic$/i, ''), source, lastModified: stat.mtimeMs })
      }
    } catch {}
  }
  return results
})

ipcMain.handle('list-lich-profiles', (_e, lichPath: string): string[] => {
  if (!lichPath) return []
  const profileDir = path.join(lichDirFrom(lichPath), 'scripts', 'profiles')
  try {
    return fs.readdirSync(profileDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
  } catch { return [] }
})

ipcMain.handle('write-lich-profile', (_e, lichPath: string, filename: string, content: string): void => {
  if (!lichPath || !filename) throw new Error('Missing lichPath or filename')
  const profileDir = path.resolve(path.join(lichDirFrom(lichPath), 'scripts', 'profiles'))
  const fullPath = path.resolve(profileDir, filename)
  if (!fullPath.startsWith(profileDir + path.sep) && fullPath !== profileDir) throw new Error('Invalid profile path')
  fs.writeFileSync(fullPath, content, 'utf-8')
})

// Write a .lic script. `source` picks the directory — 'custom' → scripts/custom/
// (the safe, user-owned override dir), 'core' → scripts/ (Lich's own; editing
// these is riskier — a Lich update can overwrite them — so the UI warns first).
// Same path-traversal guard as profiles: the resolved path must stay inside the
// chosen script dir.
ipcMain.handle('write-lich-script', (_e, lichPath: string, name: string, source: 'core' | 'custom', content: string): void => {
  if (!lichPath || !name) throw new Error('Missing lichPath or name')
  const subdir = source === 'custom' ? path.join('scripts', 'custom') : 'scripts'
  const scriptDir = path.resolve(path.join(lichDirFrom(lichPath), subdir))
  const filename = /\.lic$/i.test(name) ? name : `${name}.lic`
  const fullPath = path.resolve(scriptDir, filename)
  if (!fullPath.startsWith(scriptDir + path.sep)) throw new Error('Invalid script path')
  fs.writeFileSync(fullPath, content, 'utf-8')
})

// ── Password IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('password:save',   (_e, account: string, password: string) => savePassword(account, password))
ipcMain.handle('password:load',   (_e, account: string)                   => loadPassword(account))
ipcMain.handle('password:delete', (_e, account: string)                   => deletePassword(account))

// EAccess "preview" — used by the Add Character wizard to fetch the character
// list for an account before the user commits to a login. Each call opens a
// throwaway SGE socket, runs the K/A/G/C handshake, and disconnects. The
// returned list is shown in step 3 of the wizard so the user can pick from
// real characters instead of typing a name. Errors (bad credentials, server
// down) are surfaced to the renderer for inline display.
ipcMain.handle('eaccess:fetch-characters', async (_e, account: string, password: string, gameCode: string) => {
  const sge = new SGEConnection()
  try {
    await sge.connect()
    const chars = await sge.authenticate(account, password, gameCode)
    return { ok: true as const, characters: chars }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  } finally {
    sge.disconnect()
  }
})

// ── Profile IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('profile:read-shared',               ()                               => readSharedProfile())
ipcMain.handle('profile:write-shared',              (_e, data: unknown)              => writeSharedProfile(data))
ipcMain.handle('profile:read-character',            (_e, character: string)          => readCharacterProfile(character))
ipcMain.handle('profile:write-character',           (_e, character: string, data: unknown) => writeCharacterProfile(character, data))
ipcMain.handle('profile:list',                      ()                               => listCharacterProfiles())
ipcMain.handle('profile:delete-character',          (_e, character: string)          => deleteCharacterProfile(character))
// Archive = remove from the launcher WITHOUT destroying the data (v0.18.2).
// Used by the launcher's Remove-account action; restore runs when the account
// is added back, so a returning character keeps its settings.
ipcMain.handle('profile:archive-character',         (_e, character: string)          => archiveCharacterProfile(character))
ipcMain.handle('profile:restore-character',         (_e, character: string)          => restoreCharacterProfile(character))
ipcMain.handle('profile:list-archived',             ()                               => listArchivedProfiles())

// ── Profile Transfer IPC (platform-wide .lb.yaml export/import) ────────────────
// Exports live in a dedicated `Exports/` folder next to `profiles/` (see
// profiles.ts). The renderer hands main a filename + YAML text; main writes it
// into that folder. Imports default to the same folder. The browser
// download/<input type=file> path is NOT used for this feature so the files land
// in a predictable, app-managed location the user can re-import from.
const LB_EXPORT_EXT = /\.lb\.ya?ml$/i

ipcMain.handle('profile-transfer:export', (_e, filename: string, yamlText: string): string => {
  const dir = ensureExportsDir()
  // Sanitize the filename to a bare basename so a malicious/odd name can't
  // escape the Exports folder.
  const safe = path.basename(String(filename)).replace(/[^\w.\-]+/g, '_')
  // Non-destructive: don't silently overwrite a same-named export (two exports
  // of one character on one day collide on the date-stamped name). Insert -2/-3/…
  // before the `.lb.yaml` double-extension so a prior export is never clobbered
  // (Principle #3, B198). The returned full path is what the modal shows the user.
  const m = safe.match(/^(.*?)(\.lb\.ya?ml)$/i)
  const base = m ? m[1] : safe
  const ext = m ? m[2] : ''
  let target = path.join(dir, safe)
  for (let n = 2; fs.existsSync(target) && n < 1000; n++) {
    target = path.join(dir, `${base}-${n}${ext}`)
  }
  fs.writeFileSync(target, yamlText, 'utf8')
  return target
})

ipcMain.handle('profile-transfer:list-exports', (): { name: string; mtimeMs: number }[] => {
  const dir = getExportsDir()
  try {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => LB_EXPORT_EXT.test(f))
      .map(f => {
        let mtimeMs = 0
        try { mtimeMs = fs.statSync(path.join(dir, f)).mtimeMs } catch {}
        return { name: f, mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
  } catch { return [] }
})

ipcMain.handle('profile-transfer:read-export', (_e, filename: string): string | null => {
  const dir = getExportsDir()
  const safe = path.basename(String(filename))
  const target = path.join(dir, safe)
  try {
    if (!fs.existsSync(target)) return null
    return fs.readFileSync(target, 'utf8')
  } catch { return null }
})

ipcMain.handle('profile-transfer:open-import-dialog', async (): Promise<{ name: string; text: string } | null> => {
  const res = await dialog.showOpenDialog({
    title: 'Import Lichborne Profile',
    defaultPath: ensureExportsDir(),
    properties: ['openFile'],
    filters: [
      { name: 'Lichborne Profile', extensions: ['yaml', 'yml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (res.canceled || res.filePaths.length === 0) return null
  const file = res.filePaths[0]
  try { return { name: path.basename(file), text: fs.readFileSync(file, 'utf8') } }
  catch { return null }
})

ipcMain.handle('profile-transfer:open-exports-folder', (): void => {
  shell.openPath(ensureExportsDir())
})

// Generic "save text to a user-picked file" (F45 — Debug CSV export is the
// first consumer). Renderer supplies the content + a default filename + a
// filter; main owns the dialog and the write. Dialog is parented to the
// calling window so it centers correctly in multi-window mode.
ipcMain.handle('save-text-file', async (e, opts: { defaultName: string; content: string; filterName?: string; extensions?: string[] }): Promise<{ ok: boolean; canceled?: boolean; path?: string }> => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const filters = [{ name: opts.filterName ?? 'Text', extensions: opts.extensions ?? ['txt'] }]
  const res = win
    ? await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters })
    : await dialog.showSaveDialog({ defaultPath: opts.defaultName, filters })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    fs.writeFileSync(res.filePath, opts.content, 'utf8')
    return { ok: true, path: res.filePath }
  } catch (err) {
    console.error('[save-text-file] write failed', err)
    return { ok: false }
  }
})

ipcMain.on('write-clipboard', (_e, text: string) => clipboard.writeText(text))
ipcMain.on('open-url', (_e, url: string) => shell.openExternal(url))

ipcMain.on('flash-window', (e) => {
  // Flash the window that asked for attention (the one whose tab wants notice).
  BrowserWindow.fromWebContents(e.sender)?.flashFrame(true)
})

// Trigger `log` action. BUFFERED (v0.18.0 perf audit): this is driven PER
// MATCHING LINE, per session, and the old shape did an existsSync + a full
// open/write/close appendFileSync on EVERY call — ~500µs of BLOCKED main each,
// measured. Main owns every session's socket, so that cost stalls every
// connected character at once (~33ms/sec of blocked main at a modest 65
// fires/sec; ~250ms/sec under flood). Now it buffers per file and flushes on
// the same 1s/100-record cadence sessionLog.ts uses — 2000 lines went from
// ~1015ms of blocked main to ~0.5ms in the benchmark.
const LF = String.fromCharCode(10)
const writeLogBuffers = new Map<string, string[]>()
let writeLogTimer: NodeJS.Timeout | null = null
let writeLogDirReady = false
let writeLogPending = 0

function flushWriteLogs() {
  if (writeLogTimer) { clearTimeout(writeLogTimer); writeLogTimer = null }
  writeLogPending = 0
  if (writeLogBuffers.size === 0) return
  try {
    // B352: {userData}/TriggerLogs, in dev as well as packaged builds. This used
    // to write beside the executable — inside the read-only mount on a Linux
    // AppImage (every line silently dropped by the catch below), inside the .app
    // bundle on macOS, and into the install directory on Windows; the last two
    // are deleted by every upgrade (pitfall #3). Top-level rather than under
    // Logs/, whose subfolders are per-character session-log folders — a
    // character named "triggers" must not collide with this.
    const dir = path.join(app.getPath('userData'), 'TriggerLogs')
    // Once per process, not once per line.
    if (!writeLogDirReady) { fs.mkdirSync(dir, { recursive: true }); writeLogDirReady = true }
    for (const [name, chunk] of writeLogBuffers) {
      if (chunk.length === 0) continue
      try { fs.appendFileSync(path.join(dir, name), chunk.join(''), 'utf8') } catch { /* skip this file */ }
    }
  } catch { /* dir unavailable — drop rather than throw on a background write */ }
  writeLogBuffers.clear()
}

// B352: the file name comes from a user-authored, $var-interpolated trigger
// field, so it must name a plain FILE inside TriggerLogs. path.basename() alone
// splits only on the host's own separator — on macOS/Linux a `\` survives it —
// and '.' / '..' / '' resolve to a directory. Take the last segment after
// EITHER separator, replace the characters Windows forbids (the sessionLog
// safeName set, plus control characters — and ':' on NTFS would otherwise
// write an invisible alternate data stream), and refuse an all-dots name.
function safeTriggerLogName(filename: unknown): string | null {
  const last = String(filename ?? '').split(/[\\/]/).pop() ?? ''
  const name = last.replace(/[\x00-\x1f:*?"<>|]/g, '_').trim()
  return name && !/^\.+$/.test(name) ? name : null
}

ipcMain.on('write-log', (_e, filename: string, content: string) => {
  try {
    const name = safeTriggerLogName(filename)
    if (!name) return
    const buf = writeLogBuffers.get(name)
    if (buf) buf.push(content + LF)
    else writeLogBuffers.set(name, [content + LF])
    writeLogPending++
    if (writeLogPending >= 100) flushWriteLogs()
    else if (!writeLogTimer) writeLogTimer = setTimeout(flushWriteLogs, 1000)
  } catch {}
})
ipcMain.on('download-update',    () => autoUpdater.downloadUpdate())
// Installing an update quits the app; the user consented by clicking Install,
// so the close-confirmation stands down for it (see `quitAlreadyConfirmed`).
ipcMain.on('install-update',     () => {
  quitAlreadyConfirmed = true
  // SELF-HEALING, because this flag disables a safety feature. quitAndInstall()
  // normally tears the app down within a second — so if we are still alive well
  // after it, the install did NOT take (nothing staged, or the OS refused it),
  // and a latched flag would silently let the rest of the session quit without
  // ever confirming. Restoring it is the safe direction: the worst case is one
  // extra prompt on a quit the user meant anyway.
  setTimeout(() => { quitAlreadyConfirmed = false }, 10_000)
  autoUpdater.quitAndInstall()
})
ipcMain.on('check-for-updates',  () => {
  // macOS: auto-update requires a code-signed app (Squirrel.Mac validates the
  // signature chain) and 0.18.0 Mac builds ship unsigned — deliberately, no
  // Apple Developer account (see release.yml). A real check would error
  // confusingly, so answer the menu click with the honest instruction instead.
  // The `[notice] ` prefix (B356) is the contract with the renderer: an
  // updater-log line carrying it is shown on screen as a toast rather than only
  // logged — this one used to reach the console alone, so the user saw
  // "Checking…" flash and no answer.
  if (process.platform === 'darwin') {
    primaryWindow()?.webContents.send('updater-log',
      '[notice] Auto-update is unavailable on macOS (unsigned beta build) — download new versions from GitHub Releases.')
    return
  }
  // This IPC is only ever a user's click (Help → Check for Updates, or the
  // launcher's update button); the startup check calls the function directly.
  void checkForUpdatesDualFeed({ manual: true })
})

// ── Dual-feed update check (Elanthia-Online handover — DESIGN §18.4.1) ──────
// Lichborne is moving from github.com/SekmehtDR/Lichborne to
// github.com/elanthia-online/Lichborne. Every shipped install has the OLD repo
// baked into its app-update.yml (extraResources), so the check tries the new
// home FIRST and falls back to the legacy repo. Correct on both sides of the
// transfer:
//   - BEFORE: elanthia-online/Lichborne doesn't exist (404 on releases.atom)
//     or exists with no releases yet (ERR_UPDATER_NO_PUBLISHED_VERSIONS) —
//     both REJECT checkForUpdates(), and we quietly fall back to the legacy
//     feed, so today's behavior is unchanged.
//   - AFTER: the new feed answers and the legacy entry is never consulted.
//     (GitHub's transfer redirect covers even pre-handover installs, but only
//     until anything named "Lichborne" is re-created under SekmehtDR — this
//     list is what keeps updates working if that redirect is ever severed.)
// setFeedURL() OVERRIDES the baked app-update.yml (electron-updater prefers a
// runtime-set provider over the disk config), and the winning feed's provider
// also serves the subsequent download — so Download/Install ride the same repo
// that answered the check. app-update.yml must still ship (electron-updater
// reads updaterCacheDirName from it). A feed that ANSWERS is authoritative —
// "no update available" does NOT fall through to the next feed — so never
// pre-create a PARTIAL repo at the new home carrying only some releases; the
// transfer itself moves all of them.
const UPDATE_FEEDS = [
  { owner: 'elanthia-online', repo: 'Lichborne' }, // new home — preferred
  { owner: 'SekmehtDR',       repo: 'Lichborne' }, // legacy — pre-transfer, and belt-and-braces after
]
// True while a NON-FINAL feed attempt is in flight. checkForUpdates() both
// rejects AND emits 'error' on failure, and the error handler forwards errors
// to the launcher's updater log — without this gate, every launch before the
// transfer would show a scary ERROR for the (expected) missing new-home repo.
let updaterProbing = false

// Concurrent invocations JOIN the in-flight run (the serializeLichLaunch shape).
// Without this, a menu-click check overlapping the startup check interleaves two
// loops over ONE shared autoUpdater: electron-updater dedups concurrent
// checkForUpdates() onto one promise (AppUpdater.checkForUpdatesPromise), so the
// second loop would (a) log ITS loop-variable's feed name for a check the OTHER
// feed actually answered, and (b) flip updaterProbing under the first loop's
// final attempt, suppressing a real error for one round-trip. One run at a time
// makes both impossible; the reset lives in this function's own finally
// (pitfall #122 — the function that is guarded owns the reset).
let dualFeedRun: Promise<void> | null = null
// B364: whether a USER asked during the current run — set before joining, so a
// click that lands while the startup check is in flight still gets its answer.
let dualFeedManual = false

function checkForUpdatesDualFeed(opts?: { manual?: boolean }): Promise<void> {
  if (opts?.manual) dualFeedManual = true
  if (dualFeedRun) return dualFeedRun
  dualFeedRun = (async () => {
    try {
      for (let i = 0; i < UPDATE_FEEDS.length; i++) {
        const feed = UPDATE_FEEDS[i]
        updaterProbing = i < UPDATE_FEEDS.length - 1
        autoUpdater.setFeedURL({ provider: 'github', owner: feed.owner, repo: feed.repo })
        try {
          const res = await autoUpdater.checkForUpdates()
          // res is null only when the updater is inactive (unpackaged dev build) —
          // don't name a feed that was never actually consulted.
          if (res) {
            primaryWindow()?.webContents.send('updater-log', `Update feed: ${feed.owner}/${feed.repo}`)
          } else if (dualFeedManual) {
            // B364: null means the updater is INACTIVE — an unpackaged build,
            // or an AppImage run without $APPIMAGE (extracted or repackaged,
            // a common FUSE workaround). It emits no event at all, so without
            // this the user's "Checking…" never resolved. Manual checks only:
            // the startup check stays silent, as before.
            primaryWindow()?.webContents.send('updater-log',
              "[notice] This copy of Lichborne can't update itself — download new versions from GitHub Releases.")
          }
          return
        } catch {
          // This feed failed (missing repo / no releases / network) — try the next.
          // Its 'error' event already fired and was suppressed via updaterProbing;
          // the LAST feed's failure reaches the updater log exactly as before.
        } finally {
          updaterProbing = false
        }
      }
    } finally {
      dualFeedRun = null
      dualFeedManual = false
    }
  })()
  return dualFeedRun
}

function setupAutoUpdater() {
  // macOS unsigned builds: skip the startup check entirely (same reason as
  // above — electron-updater would just emit errors against an unsigned app).
  if (process.platform === 'darwin') return
  autoUpdater.autoDownload = false
  // Auto-update UI lives in the primary (launcher) window.
  autoUpdater.on('update-available', (info) => {
    primaryWindow()?.webContents.send('update-available', info.version)
  })
  autoUpdater.on('update-downloaded', () => {
    primaryWindow()?.webContents.send('update-downloaded')
  })
  autoUpdater.on('error', (err) => {
    const msg = err?.message ?? String(err)
    console.error('[auto-updater] error:', msg)
    // A non-final feed attempt failing is EXPECTED (see checkForUpdatesDualFeed)
    // — the fallback handles it; only the last feed's failure reaches the user.
    if (updaterProbing) return
    primaryWindow()?.webContents.send('updater-log', `ERROR: ${msg}`)
  })
  autoUpdater.on('update-not-available', () => {
    primaryWindow()?.webContents.send('updater-log', 'No update available')
  })
  autoUpdater.on('checking-for-update', () => {
    primaryWindow()?.webContents.send('updater-log', 'Checking for update...')
  })
  setTimeout(() => { void checkForUpdatesDualFeed() }, 3000)
}

// Top-chrome redesign Phase 2a: native menu items dispatch a MenuAction to the
// renderer. App routes session actions to the active GameWindow; app actions
// are handled in App directly. See src/shared/menuActions.ts.
function sendMenuAction(action: MenuAction) {
  // The native menu acts on the focused window; fall back to the primary.
  ;(BrowserWindow.getFocusedWindow() ?? primaryWindow())?.webContents.send('menu-action', { action })
}

// Keep the Window menu's character items in sync with session state: Next/
// Previous need 2+ connected characters to be meaningful; Close needs at least
// one open character. Called on every connect/disconnect/tab add/remove.
function refreshMenuState() {
  const m = Menu.getApplicationMenu()
  if (!m) return
  // Every Window-menu item acts on the FOCUSED window's tabs, so scope the
  // enabled state to that window's session count — NOT a global count. In
  // separate-window mode a one-character window would otherwise show
  // Next/Prev/Close enabled even though those actions no-op there.
  const focused = BrowserWindow.getFocusedWindow()
  const focusedOwned = focused
    ? Array.from(sessions.values()).filter(s => s.ownerWindowId === focused.webContents.id).length
    : 0
  const focusedIsSecondary = !!focused && focused.webContents.id !== primaryWindowId

  const next     = m.getMenuItemById('menu-next-character')
  const prev     = m.getMenuItemById('menu-prev-character')
  const close    = m.getMenuItemById('menu-close-character')
  const move     = m.getMenuItemById('menu-move-window')
  const moveMain = m.getMenuItemById('menu-move-main')
  if (next)  next.enabled  = focusedOwned >= 2  // cycle needs 2+ tabs in THIS window
  if (prev)  prev.enabled  = focusedOwned >= 2
  if (close) close.enabled = focusedOwned >= 1  // a tab to close in THIS window
  // Move-to-new-window: pointless when the window holds only one character (it'd
  // just leave the source window empty).
  if (move)  move.enabled  = focusedOwned >= 2
  // Move-to-main: re-home — only meaningful in a SECONDARY (decoupled) window.
  if (moveMain) moveMain.enabled = focusedIsSecondary && focusedOwned >= 1
}

function setupMenu() {
  const isMac = process.platform === 'darwin'
  // macOS convention: the first menu is the application menu (About / Hide /
  // Quit under the app's name); without it the File menu gets mangled into that
  // slot. Windows/Linux get no extra menu (spread of an empty array).
  //
  // Built EXPLICITLY rather than with the `appMenu` role (B361): that role
  // labels its items from `app.name`, which is the package `name` — lowercase
  // "lichborne" — and the fix is NOT `app.setName()`, which would move userData
  // (pitfall #1). About opens our themed About (the menu-action bridge), not
  // the native panel. Quit is a CLICK item calling app.quit(), not the `quit`
  // role. On macOS that role is not run through its JS appMethod — Electron's
  // role table only executes roles marked nonNativeMacOSRole there, and `quit`
  // isn't (read from Electron 43's bundled menu-item-roles) — so it goes out as
  // the native `terminate:`. Electron's macOS `terminate:` override runs the
  // powerMonitor 'shutdown' handler first once one is registered (B354; from
  // Electron's source, NOT verified on a Mac), which would skip the
  // "Quit Lichborne?" confirm for ⌘Q. app.quit() never touches `terminate:`.
  const macAppMenu: Electron.MenuItemConstructorOptions[] = isMac ? [{
    label: 'Lichborne',
    submenu: [
      { label: 'About Lichborne', click: () => sendMenuAction('about') },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { label: 'Hide Lichborne', role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { label: 'Quit Lichborne', accelerator: 'Command+Q', click: () => app.quit() },
    ],
  }] : []
  const menu = Menu.buildFromTemplate([
    ...macAppMenu,
    {
      label: 'File',
      submenu: [
        { label: 'Login with Character…', click: () => sendMenuAction('login-character') },
        { label: 'Team Login…',           click: () => sendMenuAction('bulk-connect') },
        { type: 'separator' },
        { label: 'Export Profile…', click: () => sendMenuAction('profile-export') },
        { label: 'Import Profile…', click: () => sendMenuAction('profile-import') },
        { type: 'separator' },
        {
          label: 'Open Profiles Folder',
          click: () => shell.openPath(ensureProfilesDir()),
        },
        {
          label: 'Open Data Folder',
          click: () => shell.openPath(app.getPath('userData')),
        },
        {
          label: 'Open Installation Directory',
          // APPIMAGE FIRST (Linux). An AppImage runs from a temporary
          // squashfs mount, so `app.getPath('exe')` is something like
          // /tmp/.mount_LichbXXXXXX/usr/bin — a directory that does not
          // survive the app quitting and tells a user nothing about where
          // their install lives. Electron's AppImage launcher exports
          // $APPIMAGE with the real path to the .AppImage file, so open the
          // folder the user actually keeps it in. Unset on every other
          // platform and on a non-AppImage Linux build, which fall through to
          // the exe's own directory.
          click: () => {
            const appImage = process.env.APPIMAGE
            shell.openPath(
              appImage ? path.dirname(appImage)
              : app.isPackaged ? path.dirname(app.getPath('exe'))
              : app.getAppPath()
            )
          },
        },
        { type: 'separator' },
        { label: 'Disconnect', click: () => sendMenuAction('disconnect') },
        // macOS quits from the app menu (Quit Lichborne); a second Quit here
        // only duplicated it (B361).
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find in Log…', click: () => sendMenuAction('find-in-log') },
      ],
    },
    {
      label: 'View',
      submenu: [
        // Lichborne items are click-only (no accelerator) per the native-menu
        // hotkey policy in CLAUDE.md. The Electron role items below keep their
        // own built-in accelerators. "Game Font" = settings.fontSize (game
        // text), NOT Electron's UI zoom (the zoom roles stay below, untouched).
        { label: 'Font', submenu: [
          { label: 'Increase Font Size', click: () => sendMenuAction('font-increase') },
          { label: 'Decrease Font Size', click: () => sendMenuAction('font-decrease') },
          { label: 'Reset Font Size',    click: () => sendMenuAction('font-reset') },
        ] },
        { type: 'separator' },
        // v0.19.0 Views. Click-only like every other Lichborne menu item.
        { label: 'Session / Overview View', click: () => sendMenuAction('toggle-view') },
        { type: 'separator' },
        { label: 'Layout Manager', click: () => sendMenuAction('toggle-panels') },
        { label: 'Show Map',      click: () => sendMenuAction('toggle-maps') },
        { label: 'Experiences',   click: () => sendMenuAction('toggle-experiences') },
        { label: 'Theme…',        click: () => sendMenuAction('toggle-theme') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        // B176 (Binu): "Ctrl++ doesn't zoom in." The zoomIn role's built-in
        // accelerator is CmdOrCtrl+Plus, but on most layouts `+` is SHIFT+`=`
        // — so the chord users actually press (Ctrl with the =/+ key, or
        // Ctrl with numpad +) sends `=` / `numadd` and never matches. Chrome
        // accepts Ctrl+= and Ctrl+numpad+ for exactly this reason. These
        // HIDDEN alias items register the missing accelerators while the
        // visible role items above keep their stock labels/shortcuts (the
        // "never override an Electron-reserved chord" guardrail is about
        // REBINDING built-ins to Lichborne actions — these aliases point at
        // the same built-in zoom behavior, matching how every browser acts).
        // An invisible item's accelerator still registers in Electron.
        { role: 'zoomIn',  accelerator: 'CommandOrControl+=',      visible: false },
        { role: 'zoomIn',  accelerator: 'CommandOrControl+numadd', visible: false },
        { role: 'zoomOut' },
        { role: 'zoomOut', accelerator: 'CommandOrControl+numsub', visible: false },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        // Existing in-app chord (App.tsx) — displayed only (registerAccelerator
        // false), NOT rebound, so App.tsx stays the single handler (no double
        // fire). Per CLAUDE.md native-menu hotkey policy.
        { label: 'Quick Send…', accelerator: 'CmdOrCtrl+Shift+Enter', registerAccelerator: false, click: () => sendMenuAction('quick-send') },
        { type: 'separator' },
        { label: 'Automations…', click: () => sendMenuAction('toggle-automations') },
        { label: 'Contacts…',    click: () => sendMenuAction('toggle-contacts') },
        { type: 'separator' },
        { label: 'Session Log…', click: () => sendMenuAction('toggle-logs') },
        { label: 'Debug…',       click: () => sendMenuAction('toggle-debug') },
        { type: 'separator' },
        { label: 'Settings…',    click: () => sendMenuAction('toggle-settings') },
      ],
    },
    {
      label: 'Lich',
      submenu: [
        { label: 'Lich Dashboard…', click: () => sendMenuAction('toggle-lich') },
      ],
    },
    {
      label: 'Window',
      // B361: on macOS the `window` role makes this NSApp's Windows menu, so
      // the OS lists the open windows (decoupled ones included) below our items.
      ...(isMac ? { role: 'window' as const } : {}),
      submenu: [
        // Enabled-state is scoped to the FOCUSED window's tab count by
        // refreshMenuState() (re-run on connect/disconnect/tab change AND on
        // window focus): Next/Prev need 2+ tabs in that window, Close needs 1+.
        // Next Character shows the existing Ctrl+Tab chord (App.tsx) but does
        // not rebind it (registerAccelerator false). The hint says Ctrl+Tab on
        // macOS too (B361): CmdOrCtrl+Tab would display ⌘⇥, the system app
        // switcher, while the chord Lichborne accepts is ⌃⇥.
        { id: 'menu-next-character',  label: 'Next Character',     enabled: false, accelerator: isMac ? 'Ctrl+Tab' : 'CmdOrCtrl+Tab', registerAccelerator: false, click: () => sendMenuAction('next-character') },
        { id: 'menu-prev-character',  label: 'Previous Character', enabled: false, click: () => sendMenuAction('prev-character') },
        { id: 'menu-close-character', label: 'Close Character',    enabled: false, click: () => sendMenuAction('close-character') },
        { type: 'separator' },
        // Decouple the focused window's active character into its own window…
        { id: 'menu-move-window',     label: 'Move Character to New Window', enabled: false, click: () => sendMenuAction('move-to-new-window') },
        // …or re-home a decoupled window's character back to the main window
        // (only meaningful when the focused window is a decoupled one).
        { id: 'menu-move-main',       label: 'Move Character to Main Window', enabled: false, click: () => sendMenuAction('move-to-main-window') },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'User Guide (TBA)', enabled: false },
        { label: 'Discord', click: () => { void shell.openExternal('https://discord.gg/ZDkXCeR72J') } },
        { type: 'separator' },
        { label: 'GitHub Repository', click: () => { void shell.openExternal('https://github.com/SekmehtDR/Lichborne') } },
        { label: 'Report a Bug…',     click: () => { void shell.openExternal('https://github.com/SekmehtDR/Lichborne/issues') } },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => sendMenuAction('check-updates') },
        { type: 'separator' },
        {
          // Themed in-app modal (AboutModal) rather than a native message box,
          // so it follows the active theme + styles the credit lists. Routed
          // through the menu-action bridge to the focused window.
          label: 'About Lichborne',
          click: () => sendMenuAction('about'),
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}

// Windows taskbar identity (v0.14.7 packaging pass): matches build.appId so
// pinned taskbar icons, notifications, and jump lists group under ONE app
// identity instead of the generic Electron one. Must be set before any
// window is created; harmless on other platforms.
app.setAppUserModelId('com.lichborne.app')

app.whenReady().then(() => {
  // ONE allowlist, shared by BOTH permission handlers. Keeping them in sync is
  // the point — see below.
  //   'local-fonts'   — the system font picker (`queryLocalFonts`, SettingsPanel).
  //                     Not in Electron's permission enum in current type defs,
  //                     but a valid runtime value, hence the `string` param.
  //   'midi'          — the About easter-egg plays its MIDI through the OS synth
  //                     (Web MIDI / Microsoft GS Wavetable Synth).
  //   'notifications' — the trigger `notify` action (useTriggerEngine).
  //
  // Why 'notifications' is listed EXPLICITLY even though notify already worked:
  // it only worked by ACCIDENT. The check handler used to be `() => true`, which
  // blanket-granted every permission CHECK, and `Notification.permission` is a
  // check — so it read 'granted' and the notify action's first branch fired.
  // Meanwhile the REQUEST handler denied 'notifications', so
  // `Notification.requestPermission()` resolved 'denied' while
  // `Notification.permission` read 'granted'. Incoherent, and a landmine: the
  // obvious security hardening — making the check handler mirror the request
  // allowlist — silently KILLS trigger notifications unless 'notifications' is
  // in it. Verified all three states with an Electron harness (v0.18.5):
  //   handlers as they were        → permission 'granted', notify WORKS
  //   allowlist incl. notifications → 'granted', and requestPermission agrees
  //   allowlist WITHOUT it          → 'denied', notify silently does nothing
  //
  // The old `() => true` check handler also granted geolocation, media, serial,
  // HID, USB and the rest to any check. Nothing in the renderer needs those —
  // only queryLocalFonts and requestMIDIAccess route through a permission check
  // (clipboard deliberately goes through main via IPC, pitfall #28) — so the
  // allowlist is both correct and a tightening.
  const ALLOWED_PERMISSIONS = new Set(['local-fonts', 'midi', 'notifications'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission: string, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission: string) =>
    ALLOWED_PERMISSIONS.has(permission))
  createWindow()
  setupMenu()
  if (app.isPackaged) setupAutoUpdater()
  // B354: system restart / shut down / log out. The event exists on Linux and
  // macOS only, so Windows never loads powerMonitor here and is unchanged. The
  // typings declare the listener with no parameter although Electron passes
  // the event (the docs call e.preventDefault()) — hence the rest parameter.
  if (process.platform !== 'win32') {
    powerMonitor.on('shutdown', (...args: unknown[]) =>
      onSystemShutdown(args[0] as { preventDefault?: () => void } | undefined))
  }
})

// B353: mark a quit as in progress before Electron starts closing windows (see
// `quitInProgress`). Never preventDefaults — runAppShutdown's own closing
// app.quit() passes straight through, with no windows left to close.
app.on('before-quit', () => {
  quitInProgress = true
  if (quitInProgressTimer) clearTimeout(quitInProgressTimer)
  quitInProgressTimer = setTimeout(() => { quitInProgressTimer = null; quitInProgress = false }, QUIT_CLOSE_PASS_MS)
})

// Safety net only: the real quit is issued by runAppShutdown() once the drain
// finishes (see there). This still covers any path that ends up with no windows
// without going through that drain. The darwin guard is the platform
// convention — an app with no windows normally stays alive — and it is exactly
// why the shutdown path could not lean on this hook.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// macOS Dock-icon click. No windows at all (not normally reachable — closing the
// primary quits) → create one. Windows that exist but none visible (all
// minimized) → bring the primary back, which macOS otherwise leaves sitting in
// the Dock (B361). Nothing during the shutdown drain.
app.on('activate', (_e, hasVisibleWindows) => {
  if (appClosing) return
  if (BrowserWindow.getAllWindows().length === 0) { createWindow(); return }
  if (!hasVisibleWindows) {
    const w = primaryWindow()
    if (w) {
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    }
  }
})

// F109: the final window-state write. Shutdown DESTROYS windows, which emits no
// 'close', so this is what guarantees a move made just before quitting lands.
app.on('will-quit', () => flushWindowState())
