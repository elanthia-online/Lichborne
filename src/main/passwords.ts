// passwords — the saved-account-password store, encrypted at rest via Electron
// safeStorage (Windows DPAPI and platform equivalents).
//
// One JSON file at {userData}/passwords.json (outside the repo/install tree),
// keyed by ACCOUNT — not character, since multiple characters share an account
// (which is also why deleting a character profile leaves its password alone).
// Values are safeStorage-encrypted then base64'd; when OS encryption is
// unavailable, save returns without storing and load returns null — plaintext
// is never written to disk. Consumers: the `password:*` IPC handlers in
// main.ts (the launcher/wizard prefill and login credentials), and main-side
// features that pull the password themselves without it crossing IPC at all
// (the SimuCoin runner).
import { app, safeStorage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

function filePath(): string {
  return path.join(app.getPath('userData'), 'passwords.json')
}

function readStore(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(filePath(), 'utf-8')) } catch { return {} }
}

function writeStore(store: Record<string, string>) {
  const p = filePath()
  // Owner-only (B366d, hardening — the values are already safeStorage-
  // encrypted). `mode` applies only when the file is CREATED, so an existing
  // file is chmod'ed too; Windows keeps its ACL-based defaults.
  fs.writeFileSync(p, JSON.stringify(store), { encoding: 'utf-8', mode: 0o600 })
  if (process.platform !== 'win32') { try { fs.chmodSync(p, 0o600) } catch { /* best effort */ } }
}

export function savePassword(account: string, password: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const store = readStore()
  store[account] = safeStorage.encryptString(password).toString('base64')
  writeStore(store)
}

export function loadPassword(account: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore()
  const encrypted = store[account]
  if (!encrypted) return null
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) } catch { return null }
}

export function deletePassword(account: string): void {
  const store = readStore()
  if (!(account in store)) return
  delete store[account]
  writeStore(store)
}
