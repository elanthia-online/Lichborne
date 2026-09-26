// --- Game family (GS4 support, added alongside the original DR-only build) ---

// DR and GS4 share the same StormFront/Wrayth wire protocol (same tags, same
// tokenizer grammar) — they differ only in which stream/indicator/component
// ids are meaningful and in game-specific domain systems (skills, spells,
// combat). `family` is the ONE discriminator everything else branches on.
// Deliberately NOT stored on LoginCredentials/CharacterProfile — every shard
// code (DR/DRX/DRT/DRF/GS3/GSX/GST/GSF) already encodes its family in its
// prefix, so `gameFamilyFromCode` derives it on demand instead of threading a
// second, redundant field through every connection/profile path.
export type GameFamily = 'DR' | 'GS4'

// Mirrors the same prefix-check both Saga (`gameFamilyFromCode`) and VellumFE
// (`GameType::from_game_string`) use to derive family from a shard code —
// independently converged on by two unrelated sibling clients, so it's the
// safe default rule: anything not starting with "DR" is GS4.
//
// Empty/unset code defaults to DR, NOT the general "anything else is GS4"
// rule — this app was DR-only before GS4 support existed, and every other
// game-code lookup already treats empty/unknown as DR (gameOptionByCode /
// gameOptionFromPort both fall back to GAMES[0], the DR entry). An empty
// `session.game` is a real, reachable state (e.g. a not-yet-fully-loaded
// session) — applying the general rule to it would misclassify every
// existing DR character as GS4 the instant this function is used anywhere,
// silently hiding DR-only UI (the exp panel, Genie maps) for them.
export function gameFamilyFromCode(code: string): GameFamily {
  const trimmed = code.trim().toUpperCase()
  if (!trimmed) return 'DR'
  return trimmed.startsWith('DR') ? 'DR' : 'GS4'
}

// --- Session identity ---

// Opaque identifier minted by the main process on successful login. Renderer
// threads this through every per-session IPC call so main can route to the
// correct ConnectionManager / parser / lich child process. Single instance of
// the app supports many concurrent sessions, one per logged-in character.
export type SessionId = string

// --- Lich script tracking ---

export interface ScriptRecord {
  name: string
  paused: boolean
  custom: boolean
  firstSeen: number  // Date.now() at first poll that showed this script
  killing?: boolean // kill sent, waiting for next poll to confirm removal
}

export interface ScriptPaletteEntry {
  label: string
  command: string
}

export interface LoginCredentials {
  account: string
  password: string
  character: string
  // Game shard code (DR / DRX / DRT / DRF). v0.8.0 — was previously dropped
  // on the way to main, which silently routed every Lich-mode connect to DR
  // regardless of the saved character.game. Now it flows through to both the
  // SGE G-handshake (`G\t<code>` selects which character list / login key)
  // AND `lichArguments` below (which selects Lich's per-shard front-end port
  // and runtime mode).
  game: string
  // Lich CLI flags appended after the mode flag — e.g. '--dragonrealms',
  // '--test --dragonrealms', '--platinum --dragonrealms', '--fallen'.
  // Resolved by the renderer from DEFAULT_GAMES[game]; passed through so
  // LichConnection.launch can spawn Lich with the correct per-shard mode
  // without main needing its own game→args lookup.
  lichArguments: string
  useLich: boolean
  lichPath: string
  rubyPath: string
  // Lich front-end port. Derived per-character from DEFAULT_GAMES[game] —
  // each shard listens on its own port (DR: 11024, DRX: 11124, DRT: 11624,
  // DRF: 11324). Until v0.8.0 this was always the global advanced-settings
  // port, which made cross-shard logins land on the wrong server.
  lichPort: number
  lichMode: '--stormfront' | '--genie' | '--wizard' | '--avalon' | '--frostbite'
}

// Attach to an ALREADY-RUNNING, detachable Lich session.
//
// Target: a Lich started attachably — `lich --login Char --headless PORT`
// (normalized by Lich to `--without-frontend --detachable-client=PORT`), or
// any `--detachable-client=` launch. Lich's detachable listener accepts a
// plain TCP connection with NO authentication and NO handshake, so unlike
// LoginCredentials there is no password, no SGE step, no Ruby/Lich path, and
// no spawn: headless Lich authenticated itself from its own saved entries.
// A Lich mid-session with a normal front-end is NOT attachable — its listener
// accepted one client and closed (that constraint lives in Lich, not here).
// Where a detachable Lich listener lives. Persisted per character (the
// renderer's CharacterProfile mirrors this shape) so an attach can be
// repeated without retyping, and carried on the roster so a re-homed window
// can re-attach a session it inherited.
export interface AttachTarget {
  host: string
  port: number
}

export interface AttachCredentials {
  // Account is resolved by the RENDERER (from the character's existing profile
  // YAML when one exists, else the 'attach' placeholder) so the roster, the
  // one-character-per-account conflict planner, and profile exports keep
  // working: an attached character really does hold its account's slot.
  account: string
  character: string
  // Shard code for characterId / profile bookkeeping only — attach itself is
  // host:port, the shard ports in DEFAULT_GAMES don't apply.
  game: string
  host: string
  port: number
}

export interface CharacterEntry {
  key: string
  name: string
}

// --- Session roster (multi-window, v0.11.0) ---
// Main owns the authoritative list of every session across ALL windows and
// broadcasts it to each window, so cross-window features (Quick Send) can see
// characters that live in other windows. `ownerWindowId` is the webContents id
// of the window currently rendering that session's GameWindow — a session is
// shown only by its owner window; all windows know it exists. `connected`
// mirrors main's per-session connected flag (the renderer's rich SessionStatus
// — health/RT/indicators — stays local to the owner window and is NOT here).
export interface RosterEntry {
  sessionId: SessionId
  characterId: string
  account: string
  character: string
  game: string
  useLich: boolean
  connected: boolean
  ownerWindowId: number
  // Set for attach-mode sessions: the detachable listener this session is
  // (or was) connected to. Rides the roster so the owning window's Reconnect
  // re-ATTACHES instead of relaunching a login — including after a decouple /
  // re-home, where the new window rebuilds its session records from here.
  attach?: AttachTarget
}

export interface SessionRosterPayload {
  roster: RosterEntry[]
}

// IPC channel names.
//
// THE ONE LIST. Main and preload each used to keep a private partial copy, and
// a channel added here but not there resolved to `undefined` at the far end —
// so the sender published on a real channel while the listener registered on
// one literally named "undefined", and the message went nowhere. Silent in both
// directions, and invisible to the build. It shipped exactly once (v0.19.0's
// SEND_USER_TEXT, which made every Quick Send a no-op) and both copies were
// deleted in the same change. Import this; do not re-fork it (pitfall #127).
export const IPC = {
  LOGIN:             'login',
  // Attach to an already-running detachable Lich session (AttachCredentials).
  LOGIN_ATTACH:      'login-attach',
  SEND_COMMAND:      'send-command',
  // v0.19.0: a command typed AT a character from somewhere else (the Overview's
  // input bar, Quick Send). Distinct from SEND_COMMAND, which writes straight to
  // the socket: this is routed to the owning WINDOW so that character's
  // GameWindow can run it through its normal input path — alias resolution, `;`
  // splitting, the `>` echo, history and the session log. Main is the hop
  // because the target may live in a DECOUPLED window, which a renderer-side
  // DOM event could never reach.
  SEND_USER_TEXT:    'send-user-text',
  USER_TEXT:         'user-text',
  DISCONNECT:        'disconnect',
  GAME_EVENT:        'game-event',
  CONNECTION_STATUS: 'connection-status',
  ERROR:             'error',
  RAW_XML:           'raw-xml',
  UPDATE_AVAILABLE:  'update-available',
  UPDATE_DOWNLOADED: 'update-downloaded',
  DOWNLOAD_UPDATE:   'download-update',
  INSTALL_UPDATE:    'install-update',
  // These two lived ONLY in main's and preload's private copies of this map
  // until v0.19.0. Hoisted here so there is one list: see the header note.
  SESSION_DESTROY:   'session:destroy',
  SESSION_ROSTER:    'session-roster',
  // v0.20.0 cross-window notifications. Main decides WHICH window shows a
  // toast (the one the player is looking at); see CharacterNotice / RoutedToast.
  CHARACTER_NOTICE:  'character-notice',
  ROUTE_TOAST:       'route-toast',
  ROUTED_TOAST:      'routed-toast',
  FOCUS_CHARACTER:   'focus-character',
  SELECT_CHARACTER:  'select-character',
} as const

// A character's connection changed in a way worth telling the player about,
// wherever they are looking (v0.20.0). Main sends it ONLY to the focused
// Lichborne window, so it is shown once; the renderer decides whether to show
// it (the setting, and not for the character already on screen).
//  - ready: a login or attach finished
//  - dropped: the connection was lost WITHOUT the player asking (never sent for
//    Disconnect, closing a window, typing QUIT/EXIT or quitting the app)
//  - reconnected: a character that dropped is back
export interface CharacterNotice {
  characterId: string
  character: string
  kind: 'ready' | 'dropped' | 'reconnected'
  /** Attach mode re-attaches on its own after a drop. */
  attach?: boolean
}

// A toast a renderer wants shown in whichever window the player is looking at
// (a trigger's Toast action firing for a character in another window, or in
// the background). `characterId` makes it clickable: go to that character.
export interface RoutedToast {
  title?: string
  message: string
  kind?: 'info' | 'success' | 'warning' | 'error'
  characterId?: string
  /** Whose trigger it was — drawn as that character's badge. */
  character?: string
}

// --- Per-session IPC payloads ---
// All push channels that report session state carry the originating sessionId.
// The renderer fans these out to the correct GameWindow instance by id.

/** Renderer → main: run `text` as if typed in `sessionId`'s command bar. */
export interface SendUserTextPayload { sessionId: SessionId; text: string }
/** Main → the OWNING window: the same, delivered for that GameWindow to run. */
export type UserTextPayload = SendUserTextPayload

export type LoginResult =
  | { ok: true; sessionId: SessionId }
  | { ok: false; error: string }

export interface GameEventBatch {
  sessionId: SessionId
  events: GameEvent[]
  // Multi-window (v0.11.0): true when main is replaying a session's recent
  // event history to a window that just took ownership of it (decouple / re-home
  // / remount). The renderer rebuilds display + game state from these but skips
  // all side effects — no trigger firing (no re-sent commands), no session-log
  // append, no fires-log. See requestReplay in main + replayingRef in GameWindow.
  replay?: boolean
}

export interface ConnectionStatusPayload {
  sessionId: SessionId
  connected: boolean
  message: string
  clean?: boolean
}

export interface RawXmlPayload {
  sessionId: SessionId
  line: string
}

export interface ErrorPayload {
  sessionId: SessionId
  message: string
}

// --- Session Log ---
// One captured line of session history. Written to disk as
// `[YYYY-MM-DD HH:MM:SS.mmm][stream] text` in per-character daily log files.

export interface SessionLogRecord {
  ts: number       // Date.now() at capture time
  stream: string   // 'main', 'thoughts', 'combat', 'cmd', 'sys', custom script streams, ...
  text: string
}

// Renderer → main: append a batch of captured records for one character.
// The maintenance config (retention / compression / raw-size cap) travels with
// the payload so main can prune, compress, and cap per-character without
// keeping its own copy of the profile config.
export interface SessionLogAppendPayload {
  character: string
  records: SessionLogRecord[]
  retentionDays: number   // delete day-files older than N days; 0 = keep forever
  compress: boolean       // gzip closed (non-today) day-files
  maxRawMB: number        // cap on uncompressed .log bytes; 0 = no cap
}

// Disk footprint for one character's Logs folder, for the Settings readout.
export interface SessionLogDiskUsage {
  totalBytes: number      // every .log + .log.gz
  rawBytes: number        // uncompressed .log only
  archiveBytes: number    // .log.gz only
  dayCount: number        // distinct day-files
}

// One day-file's metadata, returned by session-log:list-days.
export interface SessionLogDay {
  date: string     // 'YYYY-MM-DD'
  path: string     // absolute path to the .log file
  size: number     // bytes
}

// One Quick-Search hit. lineNo/total let the renderer jump back into Recent
// Tail centered on this line without re-reading the whole file.
export interface SessionLogSearchHit {
  date: string     // 'YYYY-MM-DD' of the day-file the hit lives in
  lineNo: number   // 1-based line index within that day-file
  total: number    // total lines in that day-file (for window math)
  line: string     // the raw matched line, '[ts][stream] text'
}

// "Create Log file From" — the export builder spec. The renderer gathers this
// in the Export view; main reads the day-files, filters, formats, and writes
// (or copies) the result. Big data never crosses IPC — only this spec does.
export interface SessionLogExportSpec {
  fromDate: string             // 'YYYY-MM-DD' inclusive
  toDate: string               // 'YYYY-MM-DD' inclusive
  streams: string[]            // stream layers to include
  includeTimestamps: boolean   // prefix each line with [YYYY-MM-DD HH:MM:SS]
  includeStreamTags: boolean   // prefix each line with [stream]
  dedup: boolean               // collapse consecutive identical text
  summary: boolean             // prepend a # comment header with counts
  splitPerStream: boolean      // one file per stream (only with target 'file')
  target: 'file' | 'clipboard' // save to disk, or copy combined text to clipboard
}

export interface SessionLogExportResult {
  ok: boolean
  canceled?: boolean      // user dismissed the save dialog
  empty?: boolean         // nothing matched the spec
  lineCount?: number      // lines written (after dedup)
  fileCount?: number      // files written (split mode)
  location?: string       // path / folder written to, for the result message
}

export interface LichScriptsUpdatePayload {
  sessionId: SessionId
  entries: Array<{ name: string; paused: boolean }>
}

// --- Stream routing ---
// Open string type — known values documented below, arbitrary IDs allowed for
// script-created windows (moonWindow, etc.)
//   'main'            — primary game text
//   'thoughts'        — thought channel
//   'deaths'          — death announcements
//   'arrivals'        — logon/logoff notices (server: logons)
//   'conversations'   — in-game speech/yell/whisper (server: talk)
//   'spells'          — active spells (server: percWindow)
//   'familiar'        — familiar link
//   'inv'             — inventory
//   'combat'          — combat messages
//   'atmospherics'    — ambient/weather text
//   'group'           — group channel
//   'room[-*]'        — room component sub-streams
//   'raw'             — discard (never displayed)
export type StreamTarget = string

// --- Text segments ---

export interface TextSegment {
  text: string
  preset?: string
  bold?: boolean
  fg?: string  // hex color without '#', e.g. 'ff0000'
  bg?: string  // hex color without '#'
  cmd?: string      // clickable command link (from <d cmd='...'>)
  href?: string     // clickable URL link (from <a href='...'>)
  autoHref?: boolean // true when href was auto-detected in plain text (not from <a href>)
}

// --- Typed game events ---

export type GameEvent =
  | StreamTextEvent
  | VitalUpdateEvent
  | RoundtimeEvent
  | CastTimeEvent
  | AimTimeEvent
  | IndicatorEvent
  | StanceEvent
  | SpellEvent
  | HandEvent
  | RoomTitleEvent
  | RoomIdEvent
  | ServerClockEvent
  | ExpComponentEvent
  | StreamPushEvent
  | StreamPopEvent
  | ClearStreamEvent
  | StreamDeclareEvent
  | ExitsEvent
  | RoomExitsTextEvent
  | InjuryUpdateEvent
  | EffectsUpdateEvent
  | PlayerInfoEvent
  | LaunchUrlEvent
  | GameExitEvent
  | UnknownEvent
  | SceneCastEvent
  | SceneArriveEvent
  | SceneDepartEvent
  | SceneSpeechEvent
  | SceneMoveHintEvent
  | SceneEmoteEvent
  | SceneLogonEvent
  | CharacterGuildEvent

export interface StreamTextEvent {
  type: 'stream-text'
  stream: StreamTarget
  segments: TextSegment[]
  timestamp: number
  mono?: boolean
  // true when this line is a server <prompt> ('>' or a statusprompt like 'H>').
  // Lets the renderer collapse a `>` whose previous displayed main line was an
  // identical prompt — including one a mute orphaned (the parser's own dedup,
  // `lastEmitWasPrompt`, ran before the mute removed the content between them).
  // See GameWindow's prompt-collapse pass + pitfalls #88/#98.
  prompt?: boolean
}

// Vitals — current and max both provided by the server text attribute ("72 100")
//
// 'mindstate' / 'encumbrance' are GS4-only (wire ids `mindState`/`encumlevel` —
// see StormFrontParser's progressbar case); 'concentration' is DR-only (wire
// ids `concentration`/`conclevel`). Safe to share one union: DR and GS4 wire
// streams are disjoint per session, so a DR character's stream never sends
// `mindState` and a GS4 character's never sends `concentration` — no
// collision, and every consumer already keys off `Record<string, ...>` rather
// than an exhaustive switch over `id`, so widening this union needs no other
// changes.
export interface VitalUpdateEvent {
  type: 'vital-update'
  id: 'health' | 'mana' | 'stamina' | 'spirit' | 'concentration' | 'mindstate' | 'encumbrance'
  current: number
  max: number
  label?: string  // custom name from server when customText='t' (e.g. "Inner Fire" for Barbarians)
}

export interface RoundtimeEvent {
  type: 'roundtime'
  expires: number  // Unix ms timestamp
}

export interface CastTimeEvent {
  type: 'casttime'
  expires: number  // Unix ms timestamp
}

// Aim Timer (DR's AimTimerDialog / firingTimer, toggled in-game by `toggle aim`).
// Counts down to "You think you have your best shot possible now." Same absolute
// server-END-time shape as roundtime/casttime — server-clock anchored on the next
// <prompt> (pitfall #87). `expires: 0` clears the timer (best shot reached, focus
// lost, or initial reset).
export interface AimTimeEvent {
  type: 'aimtime'
  expires: number  // Unix ms timestamp; 0 = cleared
}

// Indicators — id is normalized (Icon prefix stripped, lowercased)
export interface IndicatorEvent {
  type: 'indicator'
  id: string
  visible: boolean
}

// Stance — from progressBar id="pbarStance"
export interface StanceEvent {
  type: 'stance'
  text: string   // 'Standing', 'Kneeling', 'Prone', 'Sitting'
  value: number
}

export interface SpellEvent {
  type: 'spell'
  name: string   // 'None' means nothing prepared
}

export interface HandEvent {
  type: 'hand'
  hand: 'right' | 'left'
  item: string   // 'Empty' means nothing held
}

// Room title — from <streamWindow id='main' subtitle='...'> in DR
export interface RoomTitleEvent {
  type: 'room-title'
  title: string
  roomId?: number
}

// Room id only — from <nav rm='X'/> in DR. DR sends <nav rm> for room
// transitions (Lich's $room derives from this). Sometimes DR sends <nav>
// but NOT a fresh <streamWindow id='main' subtitle='...'> — for those
// transitions, RoomTitleEvent never fires and the Lichborne front-end's
// roomState.title / roomId stay stuck on the prior room (Rakkor v0.8.7
// "Lich Map hangs in wrong room until LOOK"). Emitting RoomIdEvent on
// <nav rm> separately lets us at least update roomId without forging a
// title we don't have. Lich Map's findRoom path tries lichDb.get(roomId)
// first, so updating just roomId is enough to track the player correctly
// on the map even when title hasn't refreshed. Room panel title and
// other title-driven UI (like Genie Map's title-based lookup) still
// stay stale until a real <streamWindow> arrives.
export interface RoomIdEvent {
  type: 'room-id'
  roomId: number
}

// The SERVER's clock, as an offset from ours: `serverUnixMs − Date.now()`.
//
// DR stamps every `<prompt time='…'>` with its own Unix seconds, and the parser
// already anchors RT/CT/aim to it so a skewed client clock can't distort a
// countdown (B192 / pitfall #87). Anything computing an ABSOLUTE moment — the
// Moons experience's lunar phase, which is a pure function of the real time —
// needs the same anchor, so the offset is surfaced here rather than left
// private to the parser.
//
// Emitted RARELY, not per prompt: only the first time a server time is seen and
// afterwards only when the offset MOVES more than a couple of seconds. A prompt
// arrives on every game turn, so emitting each one would add a per-turn event
// for a value that is essentially constant for a session.
export interface ServerClockEvent {
  type: 'server-clock'
  /** serverUnixMs − Date.now(). Add to `Date.now()` to get server time. */
  offsetMs: number
}

// Exp — from <component id='exp SkillName' text='Evasion: 3 (2%)'>
export interface ExpComponentEvent {
  type: 'exp-component'
  skill: string
  text: string
  rankUp?: boolean  // true when content was wrapped in <b> — server's rank-gain signal
}

export interface StreamPushEvent {
  type: 'stream-push'
  stream: StreamTarget
}

export interface StreamPopEvent {
  type: 'stream-pop'
}

export interface ClearStreamEvent {
  type: 'clear-stream'
  stream: StreamTarget
}

// Emitted when the server declares a stream via <streamWindow> — carries the
// human-readable title so the renderer can label panels correctly.
export interface StreamDeclareEvent {
  type: 'stream-declare'
  stream: StreamTarget  // translated via STREAM_MAP (same ID used by stream-push)
  title: string         // from the title attribute, falls back to stream ID
}

export interface ExitsEvent {
  type: 'exits'
  directions: string[]  // abbreviated: 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'up', 'dn', 'out'
}

// v0.14.7 (F52 follow-up): the GAME'S OWN exits sentence from the
// `<component id='room exits'>` — "Obvious paths: north, east." /
// "Obvious exits: none." / "Obvious exits: out." — so the Room panel shows
// the exact wording (paths vs exits, the "none." case, named exits) the main
// scroll shows. The compass ExitsEvent above stays authoritative for the
// DIRECTION TOKENS (map matching + which words are clickable); this is the
// display sentence.
export interface RoomExitsTextEvent {
  type: 'room-exits-text'
  text: string  // '' when the component arrives empty (clears a stale sentence)
}

export interface BodyPartState {
  height: number
  width: number
  name: string  // skin name; numeric suffix encodes severity (e.g. "head1" = light)
}

export type InjuryState = Record<string, BodyPartState>

export interface InjuryUpdateEvent {
  type: 'injury-update'
  parts: InjuryState
}

// GS4's timed-effect dialogs — Active Spells / Buffs / Debuffs / Cooldowns.
// Each is `<dialogData id='X'><progressBar id='NNN' value='V' text='Name'
// time='HH:MM:SS'/>...</dialogData>`; a `<dialogData id='X' clear='t'>` with
// no children clears the list (emitted as `entries: []`). Verified against
// real captured GS4 session fixtures (VellumFE's tests/fixtures/active_*.xml,
// buffs_progress.xml) — not guessed. `id` is the wire's numeric spell/effect
// id (a cooldown's is prefixed 'c', e.g. 'c123'); `percent` is the
// progressBar's 0-100 value (StormFront convention, same field every other
// progressbar handler reads); `time` is the raw remaining-duration string,
// left unconverted — a display concern for whichever panel consumes this.
export type EffectsDialog = 'Active Spells' | 'Buffs' | 'Debuffs' | 'Cooldowns'

export interface EffectsUpdateEvent {
  type: 'effects-update'
  dialog: EffectsDialog
  entries: Array<{ id: string; name: string; percent: number; time?: string }>
}

export interface PlayerInfoEvent {
  type: 'player-info'
  char: string  // character name from <app char="Agan" .../>
  game: string  // game code from <app ... game="DR" .../>
}

export interface LaunchUrlEvent {
  type: 'launch-url'
  url: string
}

export interface GameExitEvent {
  type: 'game-exit'
}

export interface UnknownEvent {
  type: 'unknown'
  raw: string
}

// --- Scene events (SceneParser, DESIGN.md §35) ---
// Typed "who is here / who moved" state derived from the room components by
// src/main/parser/SceneParser.ts. Consumed by Lichborne Experiences (§34) —
// the Living Tableau's cast — and any future scene surface. Extraction rules
// mirror Lich drinfomon's battle-tested drdefs.rb logic (§35.2).

export interface ScenePlayer {
  name: string        // bare name (last word — Lich PLAYER_NAME rule)
  descriptor: string  // as written, status tail stripped ("Lord Rakkor")
  // Lich SITTING / LYING_DOWN sub-filters + 'hiding' (Sekmeht corpus
  // 2026-06-12: a NOTICED hider stays in the room list as "Agan who is
  // hiding" — a status, not a departure; an UNNOTICED hide removes them
  // from the list entirely, which correctly diffs as a depart).
  posture?: 'sitting' | 'prone' | 'hiding'
  // Sekmeht corpus: a corpse stays in the room list as "the body of
  // Priestess Aenigma who is lying down" — same person, dead. (And they can
  // still TALK: "You hear the ghostly voice of Aenigma exclaim…")
  dead?: boolean
}

export interface SceneCreature {
  name: string        // cleaned creature name, leading article stripped
  dead?: boolean      // ANY of them dead (Lich DEAD_NPC: "(dead)" / "which appears dead")
  // ≥2 when the room holds multiple identical creatures (Sekmeht corpus:
  // five "a lava drake" bold spans — collapsing them to one chip hid four).
  // The Tableau renders count INDIVIDUAL figures (Sekmeht: "show me these
  // guys"), so deadCount says how many of them are corpses.
  count?: number
  deadCount?: number
}

// The full current cast. STICKY state (snapshotted for window-handoff replay,
// pitfall #60b) — emitted whenever the room players/creatures change.
export interface SceneCastEvent {
  type: 'scene-cast'
  players: ScenePlayer[]
  creatures: SceneCreature[]
}

// Presence-edge events from diffing successive casts (the DRRoom model,
// §35.3 `cast-diff`): same-room arrivals/departures only — OUR OWN room
// transitions are suppressed (everyone in the new room is the new cast, not
// "arriving"). `direction` stays unset until the §35.3 `arrival-direction`
// text capturer is corpus-verified. TRANSIENT history events: future
// choreography consumers must gate on the batch replay flag (pitfall #60a).
export interface SceneArriveEvent {
  type: 'scene-arrive'
  name: string
  direction?: string
}

export interface SceneDepartEvent {
  type: 'scene-depart'
  name: string
  direction?: string          // compass word when a movement hint matched
  reason?: 'logoff'           // "Name just left." — left the GAME, not the room
}

// A movement-text observation (the §35.3 `movement-hint` capturer). NOT
// authoritative — the cast diff is (a hint can over-match prose harmlessly;
// it's only consulted when the room list actually changes). SceneParser
// consumes these to garnish scene-depart with direction/reason; the renderer
// ignores them (they're visible in the Debug panel, which is useful).
// Corpus facts (Sekmeht, 2026-06-12): arrivals carry NO direction
// ("Magus Champion Deimeter just arrived."), departures do ("… runs west." —
// the verb varies with movement pace), and "just left." means LOGOFF.
export interface SceneMoveHintEvent {
  type: 'scene-move-hint'
  name: string
  kind: 'arrive' | 'depart' | 'logoff'
  direction?: string
}

// An emote (§35.3 `emote-caption`). Corpus (Sekmeht, 2026-06-12): emotes
// render as a PARENTHESIZED main-text line — `(Agan laughs.)` — so the
// structural marker the catalog feared didn't exist, does. `text` is the
// full caption ("Agan laughs."), actor is its first word.
export interface SceneEmoteEvent {
  type: 'scene-emote'
  actor: string
  text: string
}

// A logons-stream notice (§35.3 `logon-events`). GLOBAL (realm-wide), not
// room-scoped — the Tableau ignores these; they exist for the Debug panel
// and future surfaces. Corpus (Sekmeht 2026-06-12): the logons stream emits
// `* Miniature Slimjack Twosacks joins the adventure.` Logoff/death notice
// shapes are still corpus-pending.
export interface SceneLogonEvent {
  type: 'scene-logon'
  name: string
}

// The character's guild, captured from the `info` command's output line
// (`Name: Sekmeht Race: Human Guild: Moon Mage …`) — the same line Lich's
// drinfomon derives DRStats.guild from (drparser.rb NameRaceGuild). NOT
// gated behind the §35.6 Experience toggle: guild knowledge feeds the exp
// panel's Badging default, which must work without any Experience open.
export interface CharacterGuildEvent {
  type: 'character-guild'
  guild: string
  // The sheet's Name field — consumers MUST verify it is the session's own
  // character before trusting the guild (Sekmeht's cleric picked up "Moon
  // Mage" from an info-shaped line that wasn't his own sheet).
  name: string
}

// Speech on a comms channel (§35.3 speech capturers — say/ask/exclaim, yell,
// whisper, thought verified against the real captured session
// Frostbite-Dev/frostbite/support/mock.xml, 2026-06-12). `thought` speakers
// are NOT physically present (§32.2 — never seat a body for a thought).
export interface SceneSpeechEvent {
  type: 'scene-speech'
  channel: 'say' | 'yell' | 'whisper' | 'thought' | 'ooc'
  speaker: string      // 'You' for own speech; bare name otherwise; '' unknown
  text: string         // quoted content when extractable, else the full line
  toYou?: boolean      // whisper/thought directed at the player
  // Directed-speech target ("You say to Agan," / a whisper's recipient) —
  // 'You' when directed at the player. Drives the Tableau's conversation
  // gravity (speakers drift toward who they're talking to).
  target?: string
}

// --- Map data shapes ---

export interface MapArc {
  exit: string        // direction label: 'north', 'go', 'none', etc.
  move: string        // command to send: 'north', 'go trap door', etc.
  destination: number // target node id
}

export interface MapNode {
  id: number
  name: string
  note?: string       // pipe-separated aliases, e.g. "Town Green|TGN|Wanted Board"
  color?: string      // hex color from XML color attr, e.g. "#00FFFF" — room type indicator
  descriptions: string[]
  x: number
  y: number
  z: number
  arcs: MapArc[]
}

export interface MapZone {
  id: string
  name: string
  nodes: MapNode[]
}

// --- Renderer-shared data shapes ---

/**
 * Styling a CLIENT-GENERATED line carries with it — today, a trigger's echo.
 *
 * The renderer paints it as that line's LINE LAYER, the same way a line-scope
 * highlight is painted (B428), so there is one painter rather than two: the
 * background/colour/bold go on the line container, the effect rides an inner
 * span, and a word-scope highlight still composites on top.
 *
 * `effect` is typed as a plain string HERE because this module is shared with
 * MAIN, which has no business importing the renderer's `HighlightEffect`
 * union; the renderer narrows it at the one place it builds the layer. Every
 * field is optional, so an older saved line loads unchanged.
 */
export interface LineStyleHint {
  color?: string
  bgColor?: string
  bold?: boolean
  effect?: string
  glowColor?: string
}

export interface TextLine {
  id: number
  segments: TextSegment[]
  timestamp: number  // Date.now() at receive time; used for per-stream timestamp display
  mono?: boolean     // true when line was emitted inside <output class="mono"/> block
  prompt?: boolean   // true for a server <prompt> line ('>' / 'H>'); used by the
                     // renderer prompt-collapse pass (pitfall #88)
  /** Client-authored styling (a trigger echo); never set by the parser. */
  fx?: LineStyleHint
}

export interface RoomState {
  title: string
  desc: string
  // v0.8.5 (B117): structured sections carry per-piece formatting so the
  // Room panel can render DR's <pushBold/> creatures (and any future
  // styled span) the same way the main scroll does. desc stays a string
  // — room descriptions are long-form prose that benefits from the
  // existing MapPanel `roomDesc: string` API; styled spans there are
  // rare and we keep the cross-process payload small.
  objects: TextSegment[]
  players: TextSegment[]
  creatures: TextSegment[]
  extra: TextSegment[]
  exits: string[]
  // v0.14.7: the game's own exits sentence ("Obvious exits: none.") from the
  // room exits component — display wording; `exits` stays the token truth.
  exitsText?: string
  roomId?: number
}

export interface FireLogEntry {
  id: number
  ts: number
  kind: 'highlight' | 'trigger'
  name: string
  matched: string   // the text that triggered the match (truncated)
  detail: string    // action types for triggers; sound info for highlights
  stream?: string   // stream or variable name the match came from
  ruleId?: string   // v0.8.2: id of the source rule — drives the Fires → button
                    // that opens the rule for edit in the Automations panel.
                    // Optional so older entries (or future non-rule sources)
                    // still satisfy the type.
}

// ── AI (BYOK, capability-routed — DESIGN §10, v0.16.0) ───────────────────────
// The adapter is capability-routed, not provider-routed: text (Claude, shipping),
// embeddings + image (declared, dark until their tracks land). Each capability's
// API key lives in main's safeStorage (ai-keys.json — the passwords.json
// precedent) and NEVER crosses IPC; only these non-secret payloads do.
export type AICapability = 'text' | 'embeddings' | 'image'

export interface AIKeyStatus {
  text: boolean
  embeddings: boolean
  image: boolean
}

export interface AITestResult {
  ok: boolean
  error?: string
}

export interface AIChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Renderer → main (send). Streamed back on the ai:chat-* channels keyed by
// requestId, so multiple in-flight calls (and multiple windows) don't cross.
export interface AIChatRequest {
  requestId: string
  system?: string
  messages: AIChatMessage[]
  model?: string       // overrides the config default (a Claude model id)
  maxTokens?: number
}

// One logged line inside a requested time window (session-log:read-window).
// Filtering happens in MAIN — a busy character logs 80k+ lines/day, so shipping
// the file to the renderer to filter would be absurd (the build-export precedent:
// big data never crosses IPC, only the spec and the result).
export interface SessionLogWindowRow { ts: number; stream: string; text: string }

// ── Catch Me Up over the session LOG (v0.17.1) ────────────────────────────────
// The whole pipeline runs in MAIN and returns a COMPACT digest, never raw rows:
// a 1-year window is ~29M lines (80k/day), so shipping rows over IPC — or looping
// them synchronously — would freeze every session. `buildCatchupDigest` walks
// DAY BY DAY and yields between days, reporting progress so the UI can say what
// it's doing. Token cost then depends on the digest, NOT the window length, which
// is what makes a 2.5h (or 1y) request actually cover its whole window instead of
// tail-truncating to "only recent items" (the bug this replaces).
export type CatchupPhase = 'reading' | 'deduping' | 'extracting' | 'summarizing'
export interface CatchupProgress {
  requestId: string
  phase: CatchupPhase
  done: number          // units completed in this phase (e.g. days read)
  total: number         // units expected (0 = indeterminate)
  lines: number         // lines seen so far (running)
}
// A speaker's full exchange, kept whole — low volume, high value ("summarize the
// entire flow of that interaction with the same person").
// A speaker + how many lines they spoke in the window (the verbatim lines live in
// the digest `body`, so re-shipping them here was redundant — this is just the
// "who was most talkative" anchor for the summary).
export interface CatchupThread { who: string; count: number }
export interface CatchupDigest {
  from: number
  to: number
  // The EARLIEST line actually found. If the logs don't reach back as far as the
  // request, the header must say so rather than imply full coverage.
  coveredFrom: number | null
  totalLines: number      // lines in the window before dedup
  keptLines: number       // after dedup
  duplicates: number
  daysScanned: number
  threads: CatchupThread[]
  // Skill ranks gained, tallied across the window from the GAME's own message
  // ("You've gained a new rank in …") — script-independent, works for everyone.
  // (The `DRExpMonitor: Skill(+N)` line is the mindstate/learning-rate ticker, NOT
  // ranks — it's filtered out as churn.) Absent → the category is simply omitted.
  exp: { skill: string; ranks: number }[]
  // Combat damage TAKEN, tallied pre-dedup (identical hits are separate real
  // hits). `attackers` is best-effort: the subject of a "* <Attacker> <verb>…"
  // combat line. Only damage lines that actually name a body part are counted,
  // so a miss/parry never inflates it.
  combat: {
    attackers: { name: string; hits: number }[]
    byPart:    { part: string; hits: number }[]
    worst:     string | null
    totalHits: number
  }
  // Bank BALANCE snapshots per town (DRBanking script). first->last = money flow;
  // amounts stay verbatim strings (DR coin ratios unverified — never invent math).
  banking: { town: string; first: string; last: string; netCopper: number; updates: number }[]
  // Completed crafting work orders + pay, summed PER CURRENCY (no cross-currency
  // math — exchange rates unverified).
  workorders: number
  workorderPay: { currency: string; total: number }[]
  deaths: number[]                              // timestamps; pre-dedup (2 deaths = 2)
  // FULL deduped log for the window, trimmed to the caller budget (most recent
  // kept if it overflows). This is the CONTENT the AI analyses; everything above
  // is emphasis. `truncated` = the body was cut to fit.
  body: string[]
  truncated: boolean
}

export interface AIChatChunk { requestId: string; delta: string }
export interface AIUsage     { inputTokens: number; outputTokens: number }
export interface AIChatDone  { requestId: string; usage?: AIUsage }
export interface AIChatError { requestId: string; message: string }

// ── SimuCoin claim (F71, v0.18.0) ────────────────────────────────────────────
// Simutronics gives subscribers a monthly free-SimuCoin allotment that must be
// manually claimed on store.play.net. Lichborne checks/claims it for accounts
// the user has explicitly opted in (DESIGN §42). This is the ONLY shape that
// crosses IPC — credentials and raw store HTML never leave main.
export type SimuCoinState =
  | 'claimable'    // free coins are waiting (amount set)
  | 'claimed'      // we just claimed them this run (amount set)
  | 'none'         // signed in fine, nothing to claim (message = time remaining)
  | 'auth-failed'  // sign-in rejected (bad/changed password)
  | 'error'        // network/parse failure — feature goes quiet, never guesses

export interface SimuCoinStatus {
  account: string
  state: SimuCoinState
  /** Store balance after the run; null when unknown (never guessed). */
  balance: number | null
  /** Coins claimable, or claimed this run. */
  amount: number | null
  /** Store's own "time remaining" text, or a short failure reason. */
  message: string | null
  /** Epoch ms. Set only from the store's own countdown; null = unknown. */
  nextAt: number | null
  checkedAt: number
}
