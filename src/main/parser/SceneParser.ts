// SceneParser — cast tracking + presence-edge derivation (DESIGN.md §35).
// A pure GameEvent[] → GameEvent[] transformer that sits AFTER
// StormFrontParser in the session line handler (main.ts): it watches the
// room-component events the parser already emits and derives the typed
// scene events the Experiences consume (§34). One instance per Session —
// per-session state by construction (Principle #6).
//
// The cast model is Lich DRRoom's (§35.2): the 'room players' / 'room objs'
// components are re-parsed on every update, so same-room presence CHANGES
// fall out of DIFFING successive casts — no movement-text pattern needed.
// The §35.3 `arrival-direction` text capturer only ever adds direction
// garnish on top of these events; it is not load-bearing.
import type {
  GameEvent, ScenePlayer, SceneCreature, SceneCastEvent,
} from '../../shared/types'
import {
  extractScenePlayers, extractSceneCreaturesFromBold,
  extractSceneCreaturesFromText, mergeSceneCreatures,
} from '../../shared/sceneExtract'

export class SceneParser {
  /**
   * A new connection on the same session (auto re-attach, B604). The stream
   * parser's reset makes the room read as new and empties the lists, which is
   * not everyone leaving, and a repeated title would not otherwise mark it.
   */
  noteReconnect() {
    this.inTransition = true
    this.lastTitle = ''
  }

  private players = new Map<string, ScenePlayer>()   // key: lowercased name
  private objCreatures: SceneCreature[] = []          // from 'room objs' bold spans
  private compCreatures: SceneCreature[] = []         // from 'room creatures'

  // §35.6 perf gate: while INACTIVE (no Experience open — the default),
  // derive() still maintains the cast state (the room components are already
  // parsed events; tracking them is a per-component switch, not per-line
  // work) but EMITS NOTHING — no scene events in the IPC batches, no
  // renderer state churn, no snapshot writes. Keeping the state warm is what
  // makes opening an Experience INSTANT (main backfills the current cast via
  // snapshotCast() on activation) without injecting a LOOK — Lichborne never
  // sends game commands on its own (the pitfall-#76 lesson).
  private active = false

  setActive(v: boolean) { this.active = v }

  // The current cast as a scene-cast event — sent by main when a session
  // activates so a just-opened Experience paints immediately.
  snapshotCast(): SceneCastEvent { return this.buildCast() }

  // Recent movement-text hints (the §35.3 `movement-hint` capturer). The
  // text line precedes the room-players component (Sekmeht's corpus shows
  // them adjacent), so a hint is stored here and consumed by the NEXT cast
  // diff for that name. Hints are garnish, never authoritative — an
  // over-matched prose line just expires unused.
  private hints: { name: string; kind: 'arrive' | 'depart' | 'logoff'; direction?: string; ts: number }[] = []
  private static readonly HINT_TTL_MS = 5_000
  private static readonly HINT_MAX = 16

  // True from a room-title change (OUR move — B121 emits the title before
  // the new room's components) until the new room's data has landed: either
  // a real 'room players' component commit, or the compass ('exits' — the
  // last component of a room burst, per Profanity's room_data_processor).
  // While true, cast commits are SILENT (the new room's occupants are the
  // new cast, not "arrivals"). Starts true so the login room is silent too.
  private inTransition = true
  // The last room title seen, so a repeat of it isn't taken for a move.
  private lastTitle = ''

  derive(events: GameEvent[]): GameEvent[] {
    // Working values: null = untouched this batch. A component close emits
    // clear-stream + stream-text consecutively, so sequential assignment
    // leaves the final value; a bare clear (empty component / B121 room
    // clear) leaves [].
    let wPlayers: ScenePlayer[] | null = null
    let playersFromText = false
    let wObj: SceneCreature[] | null = null
    let wComp: SceneCreature[] | null = null
    let sawTitle = false
    let sawExits = false

    for (const evt of events) {
      switch (evt.type) {
        // Only a title naming ANOTHER room starts a move. With `;display lichid`
        // or `uid` on, Lich sends a second subtitle for the room you are already
        // in AFTER its compass, which left the flag stuck on until the next
        // room, silencing the next real arrival (B567).
        case 'room-title':
          if (evt.title !== this.lastTitle) { sawTitle = true; this.lastTitle = evt.title }
          break
        case 'exits': sawExits = true; break
        case 'scene-move-hint':
          this.hints.push({ name: evt.name.toLowerCase(), kind: evt.kind, direction: evt.direction, ts: Date.now() })
          if (this.hints.length > SceneParser.HINT_MAX) this.hints.shift()
          break
        case 'clear-stream':
          // `<nav>` empties the room's sections BEFORE the new title arrives, so
          // that clear is the start of OUR move, not everyone leaving (B566).
          if (evt.move) sawTitle = true
          if (evt.stream === 'room-players') { wPlayers = []; playersFromText = false }
          else if (evt.stream === 'room-objects') wObj = []
          else if (evt.stream === 'room-creatures') wComp = []
          break
        case 'stream-text':
          if (evt.stream === 'room-players') { wPlayers = extractScenePlayers(evt.segments); playersFromText = true }
          else if (evt.stream === 'room-objects') wObj = extractSceneCreaturesFromBold(evt.segments)
          else if (evt.stream === 'room-creatures') wComp = extractSceneCreaturesFromText(evt.segments)
          break
      }
    }

    if (sawTitle) this.inTransition = true

    const out: GameEvent[] = []
    let castDirty = false

    if (wPlayers !== null) {
      const next = new Map(wPlayers.map(p => [p.name.toLowerCase(), p] as const))
      if (!this.inTransition && this.active) {
        for (const [key, p] of next) {
          if (!this.players.has(key)) {
            const h = this.takeHint(key, 'arrive')
            out.push({ type: 'scene-arrive', name: p.name, ...(h?.direction ? { direction: h.direction } : {}) })
          }
        }
        for (const [key, p] of this.players) {
          if (!next.has(key)) {
            const h = this.takeHint(key, 'depart', 'logoff')
            out.push({
              type: 'scene-depart', name: p.name,
              ...(h?.kind === 'logoff' ? { reason: 'logoff' as const } : {}),
              ...(h?.direction ? { direction: h.direction } : {}),
            })
          }
        }
      }
      if (!playersEqual(next, this.players)) castDirty = true
      this.players = next
      // A real component commit means the new room's data has arrived —
      // presence edges from here on are genuine same-room arrivals.
      if (playersFromText) this.inTransition = false
    }
    if (wObj !== null) {
      if (!creaturesEqual(wObj, this.objCreatures)) castDirty = true
      this.objCreatures = wObj
    }
    if (wComp !== null) {
      if (!creaturesEqual(wComp, this.compCreatures)) castDirty = true
      this.compCreatures = wComp
    }
    // Compass = end of the room burst. Covers the EMPTY new room (no players
    // component ever arrives, the B121 clear stands) so a later walk-in is a
    // real arrival, not swallowed by a stuck transition flag.
    if (sawExits) this.inTransition = false

    // Inactive sessions track state silently — nothing leaves this class.
    if (castDirty && this.active) out.push(this.buildCast())
    return out
  }

  // Latest unexpired hint of the given kind(s) for a name; consumed on use.
  private takeHint(nameLower: string, ...kinds: ('arrive' | 'depart' | 'logoff')[]) {
    const cutoff = Date.now() - SceneParser.HINT_TTL_MS
    for (let i = this.hints.length - 1; i >= 0; i--) {
      const h = this.hints[i]
      if (h.ts < cutoff) continue
      if (h.name === nameLower && kinds.includes(h.kind)) {
        this.hints.splice(i, 1)
        return h
      }
    }
    return undefined
  }

  private buildCast(): SceneCastEvent {
    return {
      type: 'scene-cast',
      players: [...this.players.values()],
      creatures: mergeSceneCreatures(this.compCreatures, this.objCreatures),
    }
  }
}

function playersEqual(a: Map<string, ScenePlayer>, b: Map<string, ScenePlayer>): boolean {
  if (a.size !== b.size) return false
  for (const [key, p] of a) {
    const q = b.get(key)
    if (!q || q.descriptor !== p.descriptor || q.posture !== p.posture || !!q.dead !== !!p.dead) return false
  }
  return true
}

function creaturesEqual(a: SceneCreature[], b: SceneCreature[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || !!a[i].dead !== !!b[i].dead
      || (a[i].count ?? 1) !== (b[i].count ?? 1)
      || (a[i].deadCount ?? 0) !== (b[i].deadCount ?? 0)) return false
  }
  return true
}
