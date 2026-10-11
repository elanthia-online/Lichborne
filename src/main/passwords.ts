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
import { writeFileAtomic, readJsonStore } from './atomicWrite'

function filePath(): string {
  return path.join(app.getPath('userData'), 'passwords.json')
}

// v0.20.4: a file that exists but won't parse used to read as an EMPTY store,
// and the next save then wrote back only the one entry being saved, silently
// deleting every other one. readJsonStore moves a damaged file aside first
// (Principle #3), and returns null when the file can't be read RIGHT NOW (a
// lock), in which case nothing may be written. Reads treat null as empty.
function readStore(): Record<string, string> | null {
  return readJsonStore(filePath())
}

function writeStore(store: Record<string, string>) {
  const p = filePath()
  // Owner-only (B366d, hardening — the values are already safeStorage-
  // encrypted). `mode` applies only when the file is CREATED, so an existing
  // file is chmod'ed too; Windows keeps its ACL-based defaults.
  // Crash-safe (v0.20.4): a power loss mid-write can no longer leave a
  // truncated file that reads as empty.
  writeFileAtomic(p, JSON.stringify(store), { mode: 0o600 })
  if (process.platform !== 'win32') { try { fs.chmodSync(p, 0o600) } catch { /* best effort */ } }
}

export function savePassword(account: string, password: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const store = readStore()
  if (!store) { console.error('[persist] not saving: the store file can\'t be read right now'); return }
  store[account] = safeStorage.encryptString(password).toString('base64')
  writeStore(store)
}

export function loadPassword(account: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore() ?? {}
  const encrypted = store[account]
  if (!encrypted) return null
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) } catch { return null }
}

export function deletePassword(account: string): void {
  const store = readStore()
  if (!store) { console.error('[persist] not deleting: the store file can\'t be read right now'); return }
  if (!(account in store)) return
  delete store[account]
  writeStore(store)
}
