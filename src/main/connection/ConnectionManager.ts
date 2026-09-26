// ConnectionManager — one character's transport: Lich mode OR direct-SGE mode behind one interface.
//
// Owned one-per-Session by main.ts. It composes a LichConnection and an
// SGEConnection and exposes a single surface to the rest of main —
// connectViaLich(creds) / connectDirect(creds), send(cmd), gracefulDisconnect()
// / forceDisconnect(), and the events 'line' (newline-terminated raw XML),
// 'status' (user-facing connect progress), 'disconnect', 'error'. Main's
// session line handler feeds 'line' into LichBridge.interceptLine → the
// StormFrontParser; nothing here knows what the text means.
//
// Both paths start with SGE auth (eaccess login → per-character login key,
// shard-correct via `creds.game`). Lich mode then launches Lich and connects
// to its front-end port; direct mode opens the game socket itself and does
// the Genie-style handshake (key + CLIENT_ID, then `\n\n` after the first
// "Please wait" bytes). send() routes by `mode`; in direct mode it appends
// `\r\n` itself.
//
// Invariants worth knowing before you edit:
//  • serializeLichLaunch() is a MODULE-LEVEL promise chain shared by every
//    instance: a Lich serves exactly one front-end then closes its listener,
//    so multi-character logins must spawn→connect one at a time. SGE auth
//    deliberately runs OUTSIDE that queue so it overlaps the wait, and a
//    failed auth bails before Lich is ever spawned; a failed connect kills
//    the spawned Lich so it can't squat the port.
//  • Connect progress is `step(n, TOTAL, text)` with the totals declared once
//    per path (LICH_STEPS / DIRECT_STEPS) — add or remove a phase and you
//    renumber that path's sites together, or the count lies to the user.
//  • gracefulDisconnect() has two shapes: the default sends QUIT and waits up
//    to 5s for the server's own close (the account slot must be released
//    before a same-account retry); `quickClose` half-closes via socket.end()
//    so QUIT is guaranteed out the door without waiting for the ack (app
//    shutdown). Don't collapse them.
import * as net from 'net'
import { EventEmitter } from 'events'
import { LichConnection } from './LichConnection'
import { AttachConnection } from './AttachConnection'
import { SGEConnection } from './SGEConnection'
import { gameFamilyFromCode, type AttachCredentials, type LoginCredentials } from '../../shared/types'

// Friendly per-family display name for connect-status text. Not the full
// GAMES table (that's renderer-owned, LoginScreen/SettingsPanel territory) —
// main only needs "what to call this while connecting", derived from the
// shard code's family prefix.
const FAMILY_NAME: Record<'DR' | 'GS4', string> = {
  DR: 'DragonRealms',
  GS4: 'GemStone IV',
}

const CLIENT_ID = 'FE:WRAYTH /VERSION:1.0.1.22 /P:WIN_UNKNOWN /XML'

// ── Connect progress steps (user-facing) ─────────────────────────────────────
// The totals live HERE, once per path, and every emit site uses `step()`. That
// is not tidiness: the first cut hardcoded "Step N of 4" at each site, and the
// Lich path emitted FIVE distinct phases while numbering them 1,2,2,3,4 — step
// 2 was reused for "signing in" and "getting the login key", so a watching user
// saw step 2 sit there for two different operations and the count never
// reached what the work actually did (Sekmeht, 2026-07-27). If you add or
// remove a phase, bump the total here and renumber that path's sites together.
const LICH_STEPS = 5
const DIRECT_STEPS = 4
// Attach has almost nothing to narrate — no SGE, no spawn — but the two-phase
// shape is kept so the connecting overlay reads the same as the other paths.
const ATTACH_STEPS = 2
const step = (n: number, total: number, text: string) => `Step ${n} of ${total} · ${text}`

// ── Lich launch serialization ────────────────────────────────────────────────
// A Lich process serves exactly ONE front-end, then closes its listening
// socket (verified in Lich's main.rb — `listener.accept` then `listener.close`).
// Multiple characters therefore reuse the same front-end port *sequentially*.
// This module-level chain (shared across every per-session ConnectionManager)
// ensures only one character is in the spawn→connect window at a time, so two
// Lich instances never contend for the port — which on Windows can otherwise
// cross-wire connections under SO_REUSEADDR.
let lichLaunchChain: Promise<unknown> = Promise.resolve()
// NOTE (v0.18.0 bug check): a "waiting for another character's Lich" status was
// added here and REMOVED. It could not work as intended: the renderer's bulk
// connect awaits each login before starting the next, so bulk runs never queue
// here at all; and in the rare case it did fire (two windows connecting at
// once), the SGE auth running concurrently emits its own step
// messages a moment later and the renderer keeps only the latest — so the
// notice was overwritten and the UI sat on a stale step for the whole silent
// wait, the exact problem it was meant to solve. Making it work needs the
// emit to live INSIDE the queue wait, after auth settles. Don't re-add the
// naive version.
function serializeLichLaunch<T>(task: () => Promise<T>): Promise<T> {
  // `.then(task, task)` runs the next task whether the previous one resolved
  // or rejected — one character's failure must not block the queue.
  const result = lichLaunchChain.then(task, task)
  lichLaunchChain = result.then(() => undefined, () => undefined)
  return result
}

export class ConnectionManager extends EventEmitter {
  private lich = new LichConnection()
  private attach = new AttachConnection()
  private sge = new SGEConnection()
  private gameSocket: net.Socket | null = null
  private mode: 'lich' | 'direct' | 'attach' = 'lich'
  private buffer = ''

  constructor() {
    super()
    // Wire Lich events once — not inside connectViaLich to avoid stacking listeners
    this.lich.on('line', (line: string) => this.emit('line', line))
    this.lich.on('disconnect', () => this.emit('disconnect'))
    this.lich.on('error', (err: Error) => this.emit('error', err))
    // Same one-time wiring for the attach transport. Only one of the two is
    // ever live per ConnectionManager (mode decides), so both being wired to
    // the same emits can't cross streams.
    this.attach.on('line', (line: string) => this.emit('line', line))
    this.attach.on('disconnect', () => this.emit('disconnect'))
    this.attach.on('error', (err: Error) => this.emit('error', err))
  }

  async connectViaLich(creds: LoginCredentials): Promise<void> {
    this.mode = 'lich'

    // SGE auth is independent of Lich — start it now so it overlaps the time
    // this character may spend waiting behind another character's Lich launch.
    // The noop .catch marks the promise handled so a rejection while we're
    // still queued isn't reported as unhandled; the task below still awaits
    // (and re-throws) the real rejection.
    const loginKeyPromise = this.authenticateSge(creds)
    void loginKeyPromise.catch(() => { /* surfaced by the awaited task */ })

    try {
      await serializeLichLaunch(async () => {
        // Resolve SGE auth first. If it failed (bad password, unknown
        // character) we bail HERE — before spawning Lich — so a failed login
        // never leaves an orphaned Lich process squatting the port.
        const loginKey = await loginKeyPromise

        this.emit('status', step(4, LICH_STEPS, 'Starting Lich…'))
        // creds.character names the per-session launch log file (Logs/lich-launch/).
        await this.lich.launch(creds.rubyPath, creds.lichPath, creds.lichMode, creds.lichArguments, creds.character)

        // NAMED as the connect it actually is. `connectWithRetry` does not
        // poll-then-connect — it retries the REAL connection until the port
        // accepts, and that first success IS the session socket. The old label
        // ("Waiting for Lich on port N") therefore described the whole final
        // phase as waiting and never told the user we were connecting to the
        // Lich service at all; it simply jumped from "waiting" to connected
        // (Sekmeht, 2026-07-27). The elapsed-seconds variants below keep the
        // "it may still be booting" nuance without hiding what step 5 is.
        this.emit('status', step(5, LICH_STEPS, `Connecting to Lich on port ${creds.lichPort}…`))
        await this.lich.connectWithRetry(loginKey, creds.lichPort, {
          // 30s cap — covers a slow Ruby init + Lich listener bind on every
          // machine we've tested. A user-facing knob existed before v0.8.0
          // (`lichDelay`) but the connect-with-retry loop made it pointless;
          // bumping this constant is the escape hatch if anyone ever needs it.
          maxWaitMs: 30_000,
          onProgress: (s) => this.emit('status', step(5, LICH_STEPS,
            // Past ~10s something is usually wrong (antivirus, a bad Ruby
            // path, a Lich already holding the port) — say so rather than
            // counting silently to 30.
            s >= 10
              ? `Still connecting to Lich… (${s}s) — check your Ruby/Lich paths or antivirus`
              : `Connecting to Lich — waiting for it to finish starting… (${s}s)`)),
        })
      })
    } catch (err) {
      // The connection failed — kill the Lich we spawned (if any) so it does
      // not hold the front-end port against the next character in the queue.
      this.lich.killProcess()
      throw err
    }

    this.emit('status', 'Connected via Lich.')
  }

  // eaccess.play.net authentication — yields the per-character login key Lich
  // needs for the Genie handshake. No Lich involvement, so it runs outside the
  // launch queue (and overlaps the queue wait for later characters).
  //
  // `creds.game` is threaded through to `sge.authenticate` (v0.8.0) so the
  // login key is for the right shard. Until v0.8.0 this call passed only
  // account/password — SGEConnection defaulted gameCode to 'DR', so even DRT/
  // DRX/DRF characters got a DR login key and were silently routed there.
  private async authenticateSge(creds: LoginCredentials): Promise<string> {
    this.emit('status', step(1, LICH_STEPS, 'Contacting Simutronics login (eaccess.play.net)…'))
    await this.sge.connect()
    try {
      this.emit('status', step(2, LICH_STEPS, 'Signing in to your account…'))
      const characters = await this.sge.authenticate(creds.account, creds.password, creds.game)

      const char = characters.find(
        c => c.name.toLowerCase() === creds.character.toLowerCase()
      )
      if (!char) {
        const names = characters.map(c => c.name).join(', ')
        throw new Error(`Character "${creds.character}" not found. Available: ${names}`)
      }

      this.emit('status', step(3, LICH_STEPS, `Getting the login key for ${char.name}…`))
      const loginResult = await this.sge.getLoginKey(char.key)
      return loginResult.loginKey
    } finally {
      this.sge.disconnect()
    }
  }

  async connectDirect(creds: LoginCredentials): Promise<void> {
    this.mode = 'direct'
    this.emit('status', step(1, DIRECT_STEPS, 'Contacting Simutronics login (eaccess.play.net)…'))

    await this.sge.connect()
    this.emit('status', step(2, DIRECT_STEPS, 'Signing in to your account…'))
    // creds.game threaded through (v0.8.0) — see authenticateSge above for why.
    const characters = await this.sge.authenticate(creds.account, creds.password, creds.game)

    const char = characters.find(
      c => c.name.toLowerCase() === creds.character.toLowerCase()
    )
    if (!char) {
      const names = characters.map(c => c.name).join(', ')
      throw new Error(`Character "${creds.character}" not found. Available: ${names}`)
    }

    this.emit('status', step(3, DIRECT_STEPS, `Getting the login key for ${char.name}…`))
    const loginResult = await this.sge.getLoginKey(char.key)
    this.sge.disconnect()

    const gameName = FAMILY_NAME[gameFamilyFromCode(creds.game)]
    this.emit('status', step(4, DIRECT_STEPS, `Connecting to ${gameName} (${loginResult.gameHost}:${loginResult.gamePort})…`))
    await this.connectToGameServer(
      loginResult.gameHost,
      loginResult.gamePort,
      loginResult.loginKey
    )
    this.emit('status', `Connected directly to ${gameName}.`)
  }

  // Attach to an already-running detachable Lich (`--headless PORT` /
  // `--detachable-client=PORT`). No SGE, no spawn, no handshake, no launch
  // queue — see AttachConnection's header for what the protocol is (nothing)
  // and for the three things this path must never send. On success Lich
  // pushes its own state resync (vitals / indicators / compass); the one gap
  // is the room, which never re-renders on its own — hence the `look` nudge.
  async connectAttach(creds: AttachCredentials): Promise<void> {
    this.mode = 'attach'
    this.emit('status', step(1, ATTACH_STEPS, `Connecting to Lich at ${creds.host}:${creds.port}…`))
    try {
      await this.attach.connect(creds.host, creds.port)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'EHOSTUNREACH' || code === 'ENOTFOUND') {
        // Translate the raw socket error into the sentence the player can act
        // on (the launch() pre-flight precedent): the overwhelmingly likely
        // cause is "that Lich isn't attachable", not a Lichborne fault.
        throw new Error(
          `Nothing accepted the connection at ${creds.host}:${creds.port}. ` +
          `Attach only works with a Lich started attachably — e.g. ` +
          `\`lich --login ${creds.character} --headless ${creds.port}\` — ` +
          `a Lich already serving another front-end normally cannot be attached to.`
        )
      }
      throw err
    }

    // Room resync. Lich's attach-time init covers vitals, prepared spell,
    // indicators and the compass, but the room title/description only arrive
    // when the game next sends them — an attached tab would sit blank until
    // the character moves. `look` repaints it now. Sent through the game (not
    // a `;` command), which also confirms end-to-end that our writes dispatch.
    this.emit('status', step(2, ATTACH_STEPS, 'Attached — requesting a room refresh…'))
    this.attach.send('look')

    this.emit('status', 'Attached to running Lich session.')
  }

  private async connectToGameServer(host: string, port: number, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gameSocket = new net.Socket()
      this.gameSocket.setEncoding('utf8')
      let handshakeDone = false

      this.gameSocket.connect(port, host, () => {
        this.gameSocket!.write(key + '\n')
        this.gameSocket!.write(CLIENT_ID + '\n')
        resolve()
      })

      this.gameSocket.on('error', (err) => {
        if (!handshakeDone) reject(err)
        else this.emit('error', err)
      })

      this.gameSocket.on('data', (data: string) => {
        // First data from the game server is the "Please wait..." prompt.
        // Respond with \n\n to complete the handshake, matching Genie behavior.
        if (!handshakeDone) {
          handshakeDone = true
          setTimeout(() => this.gameSocket?.write('\n\n'), 500)
        }
        this.buffer += data
        this.flushLines()
      })

      this.gameSocket.on('close', () => this.emit('disconnect'))
    })
  }

  send(command: string) {
    if (this.mode === 'lich') {
      this.lich.send(command)
    } else if (this.mode === 'attach') {
      this.attach.send(command)
    } else {
      this.gameSocket?.write(command + '\r\n')
    }
  }

  // Graceful disconnect. Default behavior: send QUIT, wait up to 5s for the
  // server-side disconnect ack, then force-close. Used by the in-tab
  // Disconnect button and the conflict-modal auto-disconnect path — both
  // care about the server actually releasing the account slot before the
  // next action (especially the conflict-modal, which immediately retries
  // a login on the same account).
  //
  // `quickClose: true` (v0.8.0, B99) skips the ack-wait. Used by the app
  // shutdown path — the user wants the window gone NOW. We use **socket
  // half-close** (`socket.end()`) so the QUIT is GUARANTEED to leave our
  // process: end() writes the queued bytes, then sends FIN after the send
  // buffer drains. (The earlier cut used `write + 300ms + destroy`, which
  // was a race against the OS send queue — fine on Lich loopback but not
  // guaranteed for the Direct internet socket. With end() both paths are
  // bytes-out-the-door guaranteed; we just don't wait for the server ack.)
  // v0.8.1: cap tightened from 1500ms → 500ms. Loopback Lich 'close' fires
  // in ~1–10ms; Direct internet sockets ~50–150ms; 500ms is the paranoid
  // safety net for the rare case the OS never reports 'close' at all.
  async gracefulDisconnect(opts: { quickClose?: boolean } = {}): Promise<void> {
    // ATTACH MODE DETACHES — IT NEVER SENDS QUIT. From an attached client,
    // Lich runs a user-exit command through its detachable dispatch and shuts
    // the WHOLE session down: scripts killed, character logged out — for every
    // other front-end attached to it too. The contract of attach is the
    // reverse: closing Lichborne leaves the session running. So both the
    // in-tab Disconnect and the app-shutdown quickClose path reduce to a
    // half-close (pending bytes drain, then FIN) and the socket 'close' event
    // drives the normal disconnect status. A player who really wants to log
    // out types `exit` themselves — that reaching Lich as a real exit is the
    // correct, deliberate path.
    if (this.mode === 'attach') {
      await this.attach.endAndAwaitClose(opts.quickClose ? 500 : 1500)
      this.forceDisconnect()
      return
    }
    this.send('QUIT')

    if (opts.quickClose) {
      await this.endActiveSocket(500)
      this.forceDisconnect()
      return
    }

    await new Promise<void>((resolve) => {
      const forceClose = setTimeout(() => resolve(), 5000)
      // Resolve early if the game closes the connection itself.
      this.once('disconnect', () => {
        clearTimeout(forceClose)
        resolve()
      })
    })
    this.forceDisconnect()
  }

  // Half-close the active session socket via socket.end() and wait for the
  // OS-level 'close' event (capped by `timeoutMs`). Routes to the Lich
  // helper for Lich sessions or directly to the game socket for Direct.
  // Used only by the quickClose path in gracefulDisconnect above.
  private async endActiveSocket(timeoutMs: number): Promise<void> {
    if (this.mode === 'lich') {
      await this.lich.endAndAwaitClose(timeoutMs)
    } else if (this.mode === 'attach') {
      // Unreachable today (gracefulDisconnect returns early for attach) but
      // kept correct so a future caller of the quickClose path can't regress
      // into the game-socket branch.
      await this.attach.endAndAwaitClose(timeoutMs)
    } else if (this.gameSocket) {
      const sock = this.gameSocket
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, timeoutMs)
        sock.once('close', () => { clearTimeout(timer); resolve() })
        sock.end()
      })
    }
  }

  forceDisconnect() {
    this.lich.disconnect()
    this.attach.disconnect()
    this.gameSocket?.destroy()
    this.gameSocket = null
    this.sge.disconnect()
  }

  private flushLines() {
    // Single-pass: walk a cursor over the buffer slicing each line once, then
    // drop the consumed prefix in one final assignment. The previous form
    // re-sliced `this.buffer` from index 0 per line — O(K·N) for a chunk with
    // K lines in N chars, which combat spam can make large.
    let start = 0
    let idx: number
    while ((idx = this.buffer.indexOf('\n', start)) !== -1) {
      this.emit('line', this.buffer.slice(start, idx + 1))
      start = idx + 1
    }
    if (start > 0) this.buffer = this.buffer.slice(start)
  }
}
