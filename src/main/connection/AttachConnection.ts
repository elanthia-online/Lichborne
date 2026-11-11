import * as net from 'net'
import { EventEmitter } from 'events'

// Transport for ATTACHING to an already-running, detachable Lich session —
// one started as `lich --login Char --headless PORT` (which Lich normalizes
// to `--without-frontend --detachable-client=PORT`) or with an explicit
// `--detachable-client=` flag.
//
// The protocol is deliberately nothing. Lich's detachable listener accepts a
// plain TCP connection with NO authentication and NO handshake (verified in
// lich-5: main.rb's detachable_client_thread accepts the socket and hands it
// straight to global_defs.rb handle_detachable_client, whose read loop treats
// every line we send as typed client input). On accept, Lich pushes a
// Wrayth-XML state resync — vitals progressBars, prepared spell, status
// indicators, compass (detachable_client_send_init) — then the live stream.
// Multiple front-ends may be attached at once; a detachable client dropping
// does NOT end the session (docs/runtime-io.md).
//
// Three things this transport must NOT do, each the opposite of
// LichConnection's launch-and-handshake shape:
//   1. NO SGE login key. Headless Lich logged in by itself from its saved
//      entries; a key written here would be dispatched to the game as a
//      nonsense command.
//   2. NO FE:WRAYTH client-ID line, for the same reason.
//   3. NO QUIT on close. From an attached client, Lich routes a user-exit
//      command through UserExitDispatch.dispatch_detachable_client — a full
//      orderly shutdown of the whole session, the exact opposite of
//      detaching. Closing the socket IS the detach: the character stays in
//      game and scripts keep running. (A player who WANTS to log out can
//      still type `exit` themselves — that reaching Lich as a real exit is
//      correct.)
//
// Kept free of electron imports on purpose: unlike LichConnection there is no
// child process to spawn and no userData log dir to resolve, and staying
// dependency-free lets the protocol be exercised by a plain-node harness
// against a fake listener.
const CONNECT_TIMEOUT_MS = 6_000

export class AttachConnection extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = ''
  private connected = false

  // One connection attempt. No retry loop: unlike a freshly-spawned Lich
  // (whose startup time is variable, hence connectWithRetry), the target here
  // either is already listening or it isn't — a refused connect means "not an
  // attachable Lich", and retrying would just delay that answer. Rejects with
  // the raw socket error (preserving `.code`) so the caller can translate
  // ECONNREFUSED into a sentence the player can act on.
  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket()
      socket.setEncoding('utf8')
      let settled = false

      // net.Socket's own 'timeout' is an IDLE timer — it never bounds the
      // initial connect. A plain timer does: a firewalled host that swallows
      // SYNs would otherwise leave the player staring at a spinner for the
      // OS default (minutes).
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        socket.destroy()
        const err = new Error(`Timed out connecting to ${host}:${port}`) as NodeJS.ErrnoException
        err.code = 'ETIMEDOUT'
        reject(err)
      }, CONNECT_TIMEOUT_MS)

      const onPreConnectError = (err: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        reject(err)
      }
      socket.once('error', onPreConnectError)

      socket.connect(port, host, () => {
        if (settled) { socket.destroy(); return }
        settled = true
        clearTimeout(timer)
        socket.removeListener('error', onPreConnectError)
        this.socket = socket
        this.connected = true
        // Stale bytes from a previous socket must not prefix the new stream:
        // a reconnect that begins mid-line would otherwise splice the tail of
        // the dropped session onto the first line of the new one.
        this.buffer = ''

        // TCP KEEPALIVE — the difference between "my attach died" and "my
        // attach is fine" on a link that goes quiet.
        //
        // An attach target is often NOT loopback — another machine on the
        // network, or one reached over a VPN — and an idle TCP connection
        // through NAT gets reaped by intermediaries that never tell either
        // end. Without
        // probes, Lichborne holds a socket it believes is live, shows the tab
        // as connected, and only discovers otherwise when the player types
        // something — which is the worst possible moment. DR is also happy to
        // leave a session silent for many minutes, so "idle" here is normal,
        // not a sign of trouble.
        //
        // Probes every 30s keep the path warm through NAT AND surface a dead
        // peer as a real 'close', which is what the auto re-attach in main
        // hangs off. Cheap: a few bytes per minute per session.
        socket.setKeepAlive(true, 30_000)
        // Vitals and prompts are small and latency-sensitive; Nagle buys
        // nothing on a stream this shape.
        socket.setNoDelay(true)

        // Live-session listeners wired only AFTER a successful connect, so a
        // failed attempt's socket never emits 'disconnect' (the
        // LichConnection.connect precedent).
        socket.on('error', (err) => this.emit('error', err))
        socket.on('data', (data: string) => {
          this.buffer += data
          this.flush()
        })
        socket.on('close', () => {
          this.connected = false
          this.emit('disconnect')
        })

        // NO handshake — see the header. Being connected is the whole protocol.
        resolve()
      })
    })
  }

  send(command: string) {
    if (this.connected && this.socket) {
      this.socket.write(command + '\r\n')
    }
  }

  // Graceful DETACH: half-close via socket.end() so any pending bytes (a
  // just-typed command) drain before FIN, then wait for the OS-level 'close'
  // (capped). Mirrors LichConnection.endAndAwaitClose — minus the QUIT that
  // its callers send first, which here would kill the whole Lich session.
  async endAndAwaitClose(timeoutMs: number): Promise<void> {
    const sock = this.socket
    if (!sock) return
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, timeoutMs)
      sock.once('close', () => { clearTimeout(timer); resolve() })
      sock.end()
    })
  }

  disconnect() {
    this.socket?.destroy()
    this.socket = null
    this.connected = false
  }

  get isConnected() {
    return this.connected
  }

  private flush() {
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx + 1)
      this.buffer = this.buffer.slice(idx + 1)
      this.emit('line', line)
    }
  }
}
