// SGEConnection — the Simutronics eaccess login handshake (eaccess.play.net:7910, TLS).
//
// The account-auth step that BOTH connect paths share: it talks the SGE
// line protocol over a short-lived TLS socket — `K` (fetch the 32-byte XOR
// key) → `A` (account + password encrypted with that key) → `G` (select the
// game/shard by code: DR / DRX / DRT / DRF) → `C` (list the characters) →
// `L` (trade a character key for GAMEHOST / GAMEPORT / a one-shot login KEY).
// It never carries game text; once getLoginKey() resolves the caller
// disconnect()s and hands the key to Lich (the Genie handshake in
// LichConnection) or to the direct game socket (ConnectionManager).
//
// Two consumers: ConnectionManager (per-session, both Lich and direct mode)
// and main.ts's account-wide character discovery for the Add Character
// wizard. The `gameCode` argument to authenticate() is load-bearing — the
// wrong code returns an empty list or another shard's characters, and the
// login key it yields is shard-specific (the v0.8.0 DRT/DRX/DRF routing bug).
//
// Reads are byte-timed, not line-framed: SGE responses have no newline
// guarantee, so readRaw() collects whatever arrives within a settle window
// after the first byte. Keep the per-step settle values if you touch them.
import * as tls from 'tls'
import { EventEmitter } from 'events'
import type { CharacterEntry } from '../../shared/types'

const SGE_HOST = 'eaccess.play.net'
const SGE_PORT = 7910
const READ_TIMEOUT_MS = 5000

export interface SGELoginResult {
  gameHost: string
  gamePort: number
  loginKey: string
}

export class SGEConnection extends EventEmitter {
  private socket: tls.TLSSocket | null = null
  private buffer = ''

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket?.destroy()
        reject(new Error('Timed out connecting to eaccess.play.net:7910'))
      }, READ_TIMEOUT_MS)

      this.socket = tls.connect({
        host: SGE_HOST,
        port: SGE_PORT,
        rejectUnauthorized: false,
      }, () => {
        clearTimeout(timer)
        resolve()
      })

      this.socket.setEncoding('binary')
      this.socket.on('data', (data: string) => {
        this.buffer += data
      })
      this.socket.on('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`SGE connection error: ${err.message}`))
      })
    })
  }

  // gameCode selects which Simutronics game the character list is filtered for.
  // 'DR' = DragonRealms Prime (default for back-compat), 'DRX' = Platinum,
  // 'DRT' = Test, 'DRF' = The Fallen. Passing the wrong code returns an empty
  // list or characters from a different shard.
  async authenticate(account: string, password: string, gameCode: string = 'DR'): Promise<CharacterEntry[]> {
    // Step 1: Send K, read exactly 32 bytes
    this.send('K\r\n')
    const key = await this.readBytes(32)

    const encrypted = this.encryptPassword(key, password)
    this.send(`A\t${account.toUpperCase()}\t${encrypted}`)

    const authRaw = await this.readRaw()
    if (!authRaw.includes('\tKEY\t')) {
      throw new Error(`Authentication failed: ${authRaw.trim()}`)
    }

    this.send(`G\t${gameCode}`)
    const gRaw = await this.readRaw(200)
    if (gRaw.toUpperCase() === 'PROBLEM') {
      throw new Error('Account has a problem — check play.net for details')
    }

    this.send('C')
    const charLine = await this.readRaw(300)

    return this.parseCharacterList(charLine)
  }

  async getLoginKey(characterKey: string): Promise<SGELoginResult> {
    // Send L (no terminator), raw read — response may span multiple lines
    this.send(`L\t${characterKey}\tSTORM`)
    const response = await this.readRaw(300)

    const result: Partial<SGELoginResult> = {}
    for (const line of response.split(/[\r\n\t]/)) {
      if (line.startsWith('GAMEHOST=')) result.gameHost = line.slice(9).trim()
      else if (line.startsWith('GAMEPORT=')) result.gamePort = parseInt(line.slice(9).trim(), 10)
      else if (line.startsWith('KEY=')) result.loginKey = line.slice(4).replace(/\0/g, '').trim()
    }

    if (!result.gameHost || !result.gamePort || !result.loginKey) {
      throw new Error(`Incomplete login response: ${JSON.stringify(result)}`)
    }
    return result as SGELoginResult
  }

  disconnect() {
    this.socket?.destroy()
    this.socket = null
    this.buffer = ''
  }

  private send(data: string) {
    this.socket?.write(data, 'binary')
  }

  // Wait until `take()` can produce a value from the buffer — with a REAL
  // deadline, and failing fast if the server closes or errors the socket.
  //
  // The reads used to check their deadline only when the next 'data' event
  // arrived. So if eaccess went silent, or closed the connection, nothing ever
  // ran the check again: the promise never settled and the login hung forever
  // at "Signing in to your account…" with no error, while main kept the session
  // in the roster (Sekmeht, 2026-09-25: a team login's second character did
  // exactly this). Every wait now owns a timer and listens for close/error.
  private waitFor<T>(take: () => T | undefined, what: string): Promise<T> {
    return new Promise((resolve, reject) => {
      // What is ALREADY buffered counts even if the server has since closed:
      // a final response followed by a close must still be read.
      const ready = take()
      if (ready !== undefined) { resolve(ready); return }
      const sock = this.socket
      if (!sock || sock.destroyed) {
        reject(new Error(`The Simutronics login connection closed before ${what} arrived`))
        return
      }
      const cleanup = () => {
        clearTimeout(timer)
        sock.off('data', onData)
        sock.off('close', onClose)
        sock.off('error', onError)
      }
      const onData = () => {
        const v = take()
        if (v !== undefined) { cleanup(); resolve(v) }
      }
      const onClose = () => {
        cleanup()
        reject(new Error(`Simutronics closed the login connection while waiting for ${what}`))
      }
      const onError = (err: Error) => {
        cleanup()
        reject(new Error(`SGE connection error: ${err.message}`))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`Timed out waiting for ${what} from Simutronics (eaccess.play.net)`))
      }, READ_TIMEOUT_MS)
      // Registered AFTER connect()'s buffering listener, so the buffer already
      // holds the new bytes when onData runs.
      sock.on('data', onData)
      sock.on('close', onClose)
      sock.on('error', onError)
      onData()   // it may already be buffered
    })
  }

  // Read exactly `count` bytes
  private readBytes(count: number): Promise<string> {
    return this.waitFor(() => {
      if (this.buffer.length < count) return undefined
      const result = this.buffer.slice(0, count)
      this.buffer = this.buffer.slice(count)
      return result
    }, `${count} bytes`)
  }

  // Read whatever arrives within `settleMs` after first byte — for responses with no newline guarantee
  private async readRaw(settleMs = 150): Promise<string> {
    await this.waitFor(() => (this.buffer.length > 0 ? true : undefined), 'a response')
    // Collect any follow-up bytes that belong to the same response.
    await new Promise(r => setTimeout(r, settleMs))
    const data = this.buffer.replace(/\0/g, '').trim()
    this.buffer = ''
    return data
  }

  // XOR cipher matching Simutronics spec
  private encryptPassword(key: string, password: string): string {
    const result: number[] = []
    for (let i = 0; i < password.length; i++) {
      result.push(((password.charCodeAt(i) - 32) ^ key.charCodeAt(i)) + 32)
    }
    return String.fromCharCode(...result)
  }

  private parseCharacterList(line: string): CharacterEntry[] {
    // Response format: C\t<count>\t<maxslots>\t<unk>\t<unk>\tKEY1\tNAME1\tKEY2\tNAME2...
    // Skip the 5-token header before character key-name pairs begin
    const parts = line.split('\t')
    const HEADER_FIELDS = 5
    const characters: CharacterEntry[] = []
    for (let i = HEADER_FIELDS; i + 1 < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]) {
        characters.push({ key: parts[i], name: parts[i + 1] })
      }
    }
    return characters
  }
}
