// genieWalk — walking a Genie map route the way a player would (v1.0.2,
// Damiza's report; DESIGN §19.18).
//
// Two halves, both pure (no React, no window.api), so a plain-node harness can
// drive them:
//
// - `planGenieWalk(moves)` turns the `move=` text of each arc on a route into
//   what to actually send. Genie map files write a step as a command with a TYPE
//   word in front (`rt west`, `swim south`, `search go faint trail`) or as a call
//   to one of the Genie maps team's helper scripts (`script autoclimbup`). Genie
//   itself hands the whole route to its automapper.cmd script, which strips and
//   acts on those words. We do NOT run Genie scripts: this is a fixed table of
//   what each word and each simple helper amounts to (read from automapper.cmd
//   and the helper .cmd files in the GenieClient/Maps package), and a route that
//   reaches a step needing real logic stops in the room before it and says so.
//
// - `GenieWalker` sends the steps one room at a time. The next step goes out when
//   the game reports an arrival (the `<nav rm>` room-id tag, which DR sends on
//   every move and never for LOOK/PEER/LOCATE), not on a timer. It reads the
//   game's replies against short lists copied from automapper.cmd's own
//   (`move_FAIL`, `move_RETRY`, …): a failed step stops the walk, a "…wait" or a
//   stun waits and sends the same step again, and anything the player has to
//   sort out themselves (standing, combat, full hands) stops with a reason.
//
// Only the Genie map uses this. The Lich map walks with Lich's `;go2`.

// ── The step table ──────────────────────────────────────────────────────────

export interface PlannedStep {
  /** The arc's `move=` text, as written in the map. */
  raw: string
  /** Sent once before the move (`open armoire`, the first parts of `a;b`). */
  pre: string[]
  /** The command that moves you. A retry resends only this. */
  move: string
  /** Sent when the move fails, after which the move is expected to land. The
   *  last command here replaces `move` for the rest of the step. */
  onFail?: string[]
  /** Extra replies that mean "that didn't take, send the move again". */
  retryOn?: RegExp
  /** Extra replies that mean the move failed (so `onFail` runs). */
  failOn?: RegExp
  /** The move takes a while (a long climb, a vine), so allow longer before
   *  calling it unanswered. */
  slow?: boolean
  /** Send nothing; the step is a no-op (`none`). */
  skip?: boolean
  /** Seconds to wait before each command (`pre`, then `move`), from Genie's
   *  `-N` prefix (`push wall;-3 go wall`). Absent when nothing waits. */
  delays?: number[]
}

export interface ManualStep {
  /** Index of the step in the route. Steps before it are walked. */
  index: number
  raw: string
  /** What the player has to do, in a sentence. */
  hint: string
}

export interface WalkPlan {
  steps: PlannedStep[]
  manual: ManualStep | null
}

// The type words automapper.cmd strips before sending (its MOVE: section,
// `replacere("%movement", "^(search|swim|web|muck|rt|wait|slow|script|room|ice|dive) ", "")`).
// `search`, `script`, `room` and `dive` are handled separately below.
const STRIP_WORD = /^(rt|swim|slow|ice|web|muck|wait)\s+/

// Climb messages automapper.cmd's `climb_FAIL` treats as "try again", plus the
// autoclimb helpers' own retry lines (autoclimbup.cmd / autoclimbdown.cmd).
const CLIMB_RETRY = /^Trying to judge the climb, you peer over the edge\.|^You start down .+, but you find it hard going\.|^You attempt to climb down .+, but you can't seem to find purchase\.|^You pick your way up .+, but reach a point where your footing is questionable\.|^You make your way up .+\.  Partway up, you make the mistake of looking down\.|^You approach .+, but the steepness is intimidating\.|^The ground approaches you at an alarming rate|^You start up .+, but slip after a few feet and fall to the ground!|^You almost make it to the top|^You start the climb and slip|^You start to climb .+, but then stop to reconsider\.|^You almost fall but catch yourself\.|^You work your way about/

// Helper scripts that need real logic. The walk stops in the room before the
// step and tells the player what the script would have done (read from each
// .cmd file and from automapper.cmd's built-in handlers of the same name).
const MANUAL_SCRIPTS: Record<string, string> = {
  dragonspine:     'recite the passage to the Mountain Elf ranger so he leads you under the Dragon\'s Spine',
  gateofsouls:     'push the boulder until the tunnel opens, then lie down and go tunnel',
  gateleave:       'lie down and go tunnel',
  ggbypass:        'turn the torch on the wall (or the stone basin) until the stone wall opens, then go wall',
  oshumanor:       'go east, turn the sconce, go west, then go door',
  abbeyhatch:      'go secret hatchway (if it isn\'t there, go ironbound door, turn the sconce and come back)',
  // Re-read against each .cmd file (v1.1.0): the last four used to say only
  // "the step the Genie maps team scripted", which told the player nothing.
  shardlocksmith:  'ask Malik about kilam, order fife, then offer (the Genie maps team\'s script offers a huge sum, asks again if Malik laughs, and waits a few seconds after)',
  automoveenterdobeks: 'kiss the scorpion and wait out the stun, then stand',
  mistwoodcliff:   'peer path, go down, go the direction the path shows, then go northwest',
  peerchurch:      'climb tree, peer church, climb trunk, then go the direction the peer showed',
  infusionentry:   'look sun and look star to learn your aspect, then turn the crank, pull the rope at the white and black taps until each wheel shows your aspect, pull the lever until the bier shows it, and open coffin, go coffin, close coffin',
  sharddetour:     'Shard\'s gates are shut at night to non-citizens: go round to another gate, or with more than 250 Athletics climb the wall (climb the ladder or stairway, then the embrasure, to get out)',
}

function manual(index: number, raw: string, hint: string): WalkPlan['manual'] {
  return { index, raw, hint }
}

/** One arc's `move=` text → what to send, or the reason it needs the player. */
export function planGenieStep(rawIn: string): PlannedStep | { manual: string } {
  const raw = rawIn.trim()
  const m = raw.toLowerCase()
  if (m === '' ) return { manual: 'this step has no command in the map' }
  if (m === 'none') return { raw, pre: [], move: '', skip: true }

  if (m.startsWith('script ')) {
    const rest = m.slice(7).trim()
    const name = rest.split(/\s+/)[0]
    const args = rest.slice(name.length).trim()
    switch (name) {
      case 'autoclimbup':   return { raw, pre: [], move: 'climb up', retryOn: CLIMB_RETRY, slow: true }
      case 'autoclimbdown': return { raw, pre: [], move: 'climb down', retryOn: CLIMB_RETRY, slow: true }
      // sandspit.cmd / hibintelligence.cmd: the first one, or the "other" one.
      case 'sandspit':      return { raw, pre: [], move: 'go barrel', onFail: ['go other barrel'], failOn: /^You can't do that\./ }
      case 'hibintelligence': return { raw, pre: [], move: 'go steel door', onFail: ['go other steel door'], failOn: /^You can't do that\./ }
      case 'armoire':       return { raw, pre: ['open armoire', 'search armoire'], move: 'go armoire' }
      case 'hollowevevine': return { raw, pre: [], move: 'tap vine', slow: true }
      // Removed from the official maps in January 2026 (GenieClient/Maps #215)
      // but still in older copies. automapper.cmd's MOVE.RT strips the script
      // name and sends the rest, and so do we. (A first version also sent
      // `out` on a failure; `out` is itself a move, so its arrival would have
      // been counted as this step landing.)
      case 'crossingtrainerfix':
        if (!args) return { manual: 'this step names no command' }
        return { raw, pre: [], move: args }
    }
    const what = MANUAL_SCRIPTS[name]
    return { manual: what
      ? `this step needs Genie's "${name}" script: ${what}`
      : `this step needs Genie's "${name}" script, which Lichborne doesn't run` }
  }

  if (m.startsWith('room ')) {
    return { manual: `this step is a set of actions: ${raw.slice(5).trim()}` }
  }

  // `search go faint trail`: the path may already be open, so try it first and
  // search only if that fails (automapper.cmd MOVE.SEARCH).
  if (m.startsWith('search ')) {
    const go = raw.slice(7).trim()
    return { raw, pre: [], move: go, onFail: ['search', go] }
  }
  // `objsearch creeper go cave`: search that thing, then go (MOVE.OBJSEARCH).
  const obj = /^objsearch\s+(\S+)\s+(.+)$/i.exec(raw)
  if (obj) return { raw, pre: [`search ${obj[1]}`], move: obj[2].trim() }

  const text = raw.replace(STRIP_WORD, '')
  // Genie's quick-send prefix: `-3 go wall` is `#send 3 go wall`, i.e. send
  // `go wall` after 3 seconds (Command.cs: a leading `-` becomes #send, and
  // Send() reads a leading number as the pause). `-pray` waits for nothing.
  const delays: number[] = []
  const parts = text.split(';').map(p => p.trim()).filter(Boolean).map(p => {
    const q = /^-(\d*\.?\d*)\s*(.*)$/.exec(p)
    if (!q) { delays.push(0); return p }
    const secs = q[1] && q[1] !== '.' ? Number(q[1]) : 0
    delays.push(Number.isFinite(secs) ? secs : 0)
    return q[2].trim()
  })
  if (parts.some(p => p.startsWith('#') || p.startsWith('.'))) {
    return { manual: `this step uses Genie commands: ${raw}` }
  }
  if (parts.some(p => /\$[a-z]/i.test(p))) {
    return { manual: `this step needs a Genie variable: ${raw}` }
  }
  if (parts.length === 0 || parts.some(p => !p)) return { manual: 'this step has no command in the map' }
  const move = parts[parts.length - 1]
  const step: PlannedStep = { raw, pre: parts.slice(0, -1), move }
  if (delays.some(d => d > 0)) step.delays = delays
  if (/^climb\s/i.test(move)) { step.retryOn = CLIMB_RETRY; step.slow = true }
  // swim_FAIL in automapper.cmd: only a swim step reads these as "try again".
  else if (/^swim\s/i.test(raw)) step.retryOn = SWIM_RETRY
  return step
}

/** A whole route. Stops at the first step that needs the player. */
export function planGenieWalk(moves: string[]): WalkPlan {
  const steps: PlannedStep[] = []
  for (let i = 0; i < moves.length; i++) {
    const p = planGenieStep(moves[i])
    if ('manual' in p) return { steps, manual: manual(i, moves[i], p.manual) }
    steps.push(p)
  }
  return { steps, manual: null }
}

// ── Reading the game's replies ──────────────────────────────────────────────
// From automapper.cmd's variable block (`move_FAIL`, `move_RETRY`, …), kept as
// written there so a fix in their list can be copied across.

const FAIL = /^You can't swim in that direction\.$|^You can't go there\.$|^A powerful blast of wind blows you to the|^What were you referring to\?|^I could not find what you were referring to\.|^You can't sneak in that direction|^You can't ride your.+(broom|carpet) in that direction|^You can't ride that way\.$/
const REPHRASE = /^Please rephrase that command/
// The game refuses the NEWEST command when too many are waiting. With more
// than one step on its way, the earlier ones still go through.
const TYPE_AHEAD = /^Sorry, you may only type ahead/
const CANT_CLIMB = /^You can't climb that\.$/
const RETRY = /^\.\.\.wait|^Sorry, |^The weight of all|^You quickly step around the exposed roots, but you lose your balance during the effort|^You are still stunned|^You're still recovering from your recent|^The mud gives way beneath your feet as you attempt to climb higher, sending you sliding back down the slope instead!|^You're not sure you can|^You can't do that while entangled in a web|^As you start to move, you find yourself snared/
const SWIM_RETRY = /^You struggle (?!to maintain)|^You work(?! your way (?:up|down) the cliff)|^You slap|^You flounder/
const LONG_MOVE = /^You try, but in the cramped confines of the tunnel, there's just no room to do that\.$|^Wriggling on your stomach, you crawl into a low opening\.$|^You continue climbing|^You begin climbing|^You really should concentrate on your journey|^You step onto a massive stairway|^You step onto some stairs, beginning your ascent\.$|^You start the slow journey across the bridge\.$|^After climbing up the rope ladder for several long moments|^You scamper up and over the rock face\.$/

// Things the player has to deal with. The walk stops and says which.
const BLOCKERS: [RegExp, string][] = [
  [/^You must be standing to do that|^You can't do that while (lying down|kneeling|sitting)|^Stand up first\.|^You must stand first\.|^You'll need to stand up|^Perhaps you might accomplish that if you were standing\.$|^You can't do that while lying down\.$|you trip over an exposed root|You try to quickly step from root to root, but slip and drop to your knees/, 'you need to stand up'],
  [/^You are engaged to|^You try to move, but you're engaged|^While in combat|^You can't do that while engaged|^You can't do that! {2}You're in combat!/, 'you\'re engaged in combat, so retreat first'],
  [/^You need to empty your hands|^You should empty your hands first!|^You can't possibly manage to cross|^You'll need to free up your hands|^Not while carrying something in your hands|^You must first free up your hands\.|^The going gets quite difficult and highlights the need to free up your hands|^You must have your hands free/, 'this step needs empty hands'],
  [/^There's no way you can .*? while remaining invisible\.|^You can't move in that direction while unseen\./, 'you can\'t take this step while invisible'],
  [/^You're too tired to try climbing|^You need to rest/, 'you\'re too tired, so rest first'],
  [/^The door is locked up tightly for the night|^You stop as you realize that the|I'm sorry, but you need to be a citizen|^BONK! You smash your nose|^Bonk! You smash your nose|I'm sorry, I can only allow citizens in at night|shop is closed for the night|^A guard appears and says, .I'm sorry,/, 'the way is closed'],
  [/^You fall into the .+ with a loud \*SPLUT\*|^You slip in .+ and fall flat on your back!|^The .+ holds you tightly, preventing you from making much headway\.|^You make no progress in the mud|^You find yourself stuck in the mud/, 'you\'re stuck in the mud, so dig until you\'re free'],
  [/^The galley has just left|^You look around in vain for the galley/, 'the galley isn\'t here, so wait for it'],
  [/^The guard yells, .Lower the bridge|^The guard says, .You'll have to wait|^A guard yells, .Hey|^The guard yells, .Hey/, 'wait for the drawbridge'],
]

// ── The walker ──────────────────────────────────────────────────────────────

export interface WalkOptions {
  /** Steps that may be sent before the game confirms the last one (1–3). */
  ahead: number
  /** Send a failed step once more before stopping. */
  retryOnce: boolean
  /** Extra wait after each arrival, in ms. */
  pauseMs: number
}

export interface WalkStatus {
  label: string
  /** Steps confirmed so far, and the total this walk will take. */
  done: number
  total: number
}

export interface WalkerIO {
  send(cmd: string): void
  /** A client line in the game window. */
  say(text: string): void
  /** Seconds of roundtime left. */
  rtLeft(): number
  status(s: WalkStatus | null): void
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(h: unknown): void
}

const NO_REPLY_MS = 15_000
const SLOW_REPLY_MS = 120_000
const RETRY_CAP = 12

export class GenieWalker {
  private plan: WalkPlan | null = null
  private label = ''
  private opts: WalkOptions = { ahead: 1, retryOnce: false, pauseMs: 0 }
  /** Next step to be confirmed by an arrival. */
  private pos = 0
  /** Next step to be sent. pos..sent-1 are in flight. */
  private sent = 0
  /** The current step's move after an onFail swap. */
  private move = ''
  private failHandled = false
  private retried = false
  private retries = 0
  private triedGo = false
  private waiting: unknown = null
  private watchdog: unknown = null
  /** The room id of the last arrival, walking or not. */
  private lastRoom: number | null = null

  constructor(private io: WalkerIO) {}

  get active(): boolean { return this.plan !== null }

  start(plan: WalkPlan, label: string, opts: WalkOptions): void {
    this.stop()
    if (plan.steps.length === 0 && plan.manual) {
      this.io.say(`Can't walk to ${label}: the first step needs you. ${capitalize(plan.manual.hint)}.`)
      return
    }
    this.plan = plan
    this.label = label
    this.opts = { ahead: Math.max(1, Math.min(3, Math.round(opts.ahead))), retryOnce: opts.retryOnce, pauseMs: Math.max(0, opts.pauseMs) }
    this.pos = 0
    this.sent = 0
    this.resetStep()
    const n = plan.steps.length
    const tail = plan.manual ? `. It stops after ${n} step${n === 1 ? '' : 's'}, because the next one needs you` : ''
    this.io.say(`Walking to ${label} (${n} step${n === 1 ? '' : 's'})${tail}.`)
    this.report()
    this.pump()
  }

  /** Stop. A reason is said in the game window; no reason stops quietly. */
  stop(reason?: string): void {
    if (!this.plan) return
    this.clearTimers()
    this.plan = null
    this.io.status(null)
    if (reason) this.io.say(`Walk to ${this.label} stopped: ${reason}.`)
  }

  /** The game says you arrived in a room. Call it for EVERY arrival, walking or
   *  not, so the walker knows which room you are in. */
  onArrival(roomId?: number | null): void {
    const prev = this.lastRoom
    this.lastRoom = roomId ?? null
    const plan = this.plan
    if (!plan) return
    // The room you were already in, shown again: a Moon Mage's telescope view
    // ends with one (Agan's capture, 132 of them), and a route never steps
    // into the room you're standing in, so it can't be a step landing.
    if (roomId != null && roomId === prev) return
    if (this.sent === this.pos) {
      // Nothing of ours is in flight (a pause, or a retry being timed).
      this.stop('you moved somewhere the walk didn\'t send you')
      return
    }
    // A resend being timed (after a "…wait") is for the step that just landed.
    if (this.waiting) { this.io.clearTimeout(this.waiting); this.waiting = null }
    this.pos++
    this.resetStep()
    this.report()
    if (this.pos >= plan.steps.length && this.sent >= plan.steps.length) {
      this.finish()
      return
    }
    if (this.sent === this.pos) {
      this.disarm()
      this.later(() => this.pump(), this.opts.pauseMs)
    } else {
      // Steps sent ahead are still on their way: wait for the next, and top up.
      this.arm(plan.steps[this.pos].slow ? SLOW_REPLY_MS : NO_REPLY_MS)
      this.pump()
    }
  }

  /** A line of main-window game text. */
  onLine(text: string): void {
    const plan = this.plan
    if (!plan || this.sent === this.pos) return
    const t = text.trim()
    if (!t) return
    const step = plan.steps[this.pos]

    for (const [re, why] of BLOCKERS) {
      if (re.test(t)) { this.stop(why); return }
    }
    if (LONG_MOVE.test(t)) { this.arm(SLOW_REPLY_MS); return }
    if (TYPE_AHEAD.test(t) && this.sent - this.pos > 1) {
      // Our last step was refused; send it again once the one before lands,
      // and keep one fewer on the way for the rest of the walk.
      this.sent--
      this.opts.ahead = Math.max(1, this.sent - this.pos)
      return
    }
    if (RETRY.test(t) || step.retryOn?.test(t)) { this.retryStep(); return }
    if (CANT_CLIMB.test(t) && /^climb\s/i.test(this.move)) {
      this.move = this.move.replace(/^climb\s+/i, 'go ')
      this.retryStep()
      return
    }
    // automapper.cmd MOVE.GO: a bare noun DR didn't understand gets a `go`.
    if (REPHRASE.test(t) && !this.triedGo && !/^go\s/i.test(this.move) && !step.pre.length) {
      this.triedGo = true
      this.move = `go ${this.move}`
      this.retryStep()
      return
    }
    if (FAIL.test(t) || REPHRASE.test(t) || step.failOn?.test(t)) {
      if (step.onFail && !this.failHandled) {
        this.failHandled = true
        this.dropAhead()
        this.disarm()
        const cmds = step.onFail
        this.move = cmds[cmds.length - 1]
        for (const c of cmds.slice(0, -1)) this.io.send(c)
        this.later(() => { this.io.send(this.move); this.arm(step.slow ? SLOW_REPLY_MS : NO_REPLY_MS) }, Math.max(0, this.io.rtLeft()) * 1000)
        return
      }
      if (this.opts.retryOnce && !this.retried) {
        this.retried = true
        this.retryStep()
        return
      }
      this.stop(`"${this.move}" got "${t}"`)
    }
  }

  private finish(): void {
    const plan = this.plan!
    const manualStep = plan.manual
    const label = this.label
    this.clearTimers()
    this.plan = null
    this.io.status(null)
    if (manualStep) this.io.say(`Walk to ${label} paused: ${manualStep.hint}. Then right-click the room again.`)
    else this.io.say(`Arrived at ${label}.`)
  }

  /** Send steps until `ahead` are in flight. Only plain steps are pipelined. */
  private pump(): void {
    const plan = this.plan
    if (!plan) return
    while (this.sent < plan.steps.length) {
      const step = plan.steps[this.sent]
      const inFlight = this.sent - this.pos
      if (inFlight >= this.opts.ahead) break
      if (inFlight > 0 && (!plain(step) || !plain(plan.steps[this.pos]))) break
      if (step.skip) {
        // Nothing to send; it counts as done once everything before it lands.
        if (inFlight > 0) break
        this.sent++
        this.pos++
        this.report()
        continue
      }
      if (this.sent === this.pos) this.move = step.move
      const move = this.sent === this.pos ? this.move : step.move
      const waited = this.sendStep(step, move)
      this.sent++
      this.arm((step.slow ? SLOW_REPLY_MS : NO_REPLY_MS) + waited)
    }
    if (this.pos >= plan.steps.length && this.sent >= plan.steps.length) this.finish()
  }

  /** Send a step's commands, waiting where the map says to (`-3 go wall`).
   *  Returns the total wait in ms, so the watchdog can allow for it. Only the
   *  current step can have waits: a step with them is never sent ahead. */
  private sendStep(step: PlannedStep, move: string): number {
    const cmds = [...step.pre, move]
    const d = step.delays
    if (!d) { for (const c of cmds) this.io.send(c); return 0 }
    const plan = this.plan
    const run = (from: number, waited: boolean): void => {
      for (let i = from; i < cmds.length; i++) {
        const wait = d[i] ?? 0
        if (wait > 0 && !(waited && i === from)) {
          this.later(() => { if (this.plan === plan) run(i, true) }, wait * 1000)
          return
        }
        this.io.send(cmds[i])
      }
    }
    run(0, false)
    return d.reduce((a, b) => a + b, 0) * 1000
  }

  /** Send the current step's move again once roundtime and stuns allow. */
  private retryStep(): void {
    if (++this.retries > RETRY_CAP) { this.stop(`"${this.move}" still isn't going through after ${RETRY_CAP} tries`); return }
    this.dropAhead()
    const step = this.plan!.steps[this.pos]
    const wait = Math.max(1, this.io.rtLeft()) * 1000
    this.later(() => {
      if (!this.plan) return
      this.io.send(this.move)
      this.sent = this.pos + 1
      this.arm(step.slow ? SLOW_REPLY_MS : NO_REPLY_MS)
    }, wait)
    this.disarm()
  }

  /** Forget steps sent past the current one: the game refused or will refuse
   *  them too, and they are resent in order once the current one lands. */
  private dropAhead(): void {
    this.sent = this.pos + 1
  }

  private resetStep(): void {
    this.failHandled = false
    this.retried = false
    this.retries = 0
    this.triedGo = false
    const step = this.plan?.steps[this.pos]
    this.move = step?.move ?? ''
  }

  private report(): void {
    if (!this.plan) return
    this.io.status({ label: this.label, done: this.pos, total: this.plan.steps.length })
  }

  private later(fn: () => void, ms: number): void {
    if (this.waiting) this.io.clearTimeout(this.waiting)
    this.waiting = this.io.setTimeout(() => { this.waiting = null; fn() }, ms)
  }

  private arm(ms: number): void {
    this.disarm()
    this.watchdog = this.io.setTimeout(() => {
      this.watchdog = null
      this.stop(`no arrival after "${this.move}"`)
    }, ms + Math.max(0, this.io.rtLeft()) * 1000)
  }

  private disarm(): void {
    if (this.watchdog) { this.io.clearTimeout(this.watchdog); this.watchdog = null }
  }

  private clearTimers(): void {
    this.disarm()
    if (this.waiting) { this.io.clearTimeout(this.waiting); this.waiting = null }
  }
}

function plain(s: PlannedStep): boolean {
  return !s.pre.length && !s.onFail && !s.retryOn && !s.slow && !s.skip && !s.delays
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// ── Typed movement ──────────────────────────────────────────────────────────

const MOVE_WORDS = new Set([
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd', 'up', 'down', 'out',
  'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest',
])

/** Whether a command the player sent moves them (so a walk under way stops).
 *  Includes Lich's `;go2`, which would walk you somewhere else. */
export function isMovementCommand(cmd: string): boolean {
  const w = cmd.trim().toLowerCase().split(/\s+/)
  if (w[0] === ';go2') return true
  if (w.length === 1) return MOVE_WORDS.has(w[0])
  return w[0] === 'go' || w[0] === 'climb' || w[0] === 'swim'
}

// ── #goto ───────────────────────────────────────────────────────────────────

/** `#goto <text>` typed in the command bar; returns the text, or null. */
export function parseGotoLine(line: string): string | null {
  const m = /^#goto\b\s*(.*)$/i.exec(line.trim())
  return m ? m[1].trim() : null
}
