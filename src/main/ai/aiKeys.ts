// aiKeys — encrypted-at-rest store for the BYOK AI API keys (DESIGN §10, v0.16.0).
//
// One JSON file, {userData}/ai-keys.json, keyed by AI capability
// (`text` / `embeddings` / `image`) rather than by account — the passwords.ts
// safeStorage pattern in its own file so AI keys never mingle with account
// passwords. Consumed only by ./index.ts (the AI IPC handlers), which is the
// single place a decrypted key is ever read; the key is handed straight to the
// provider client and only the boolean `aiKeyStatus()` map crosses IPC.
//
// Invariants: never expose getAIKey() over an IPC handler; and note that
// setAIKey() silently no-ops and getAIKey() returns null when safeStorage
// encryption is unavailable — callers must treat "no key" as the normal
// degraded state, not an error.
import { app, safeStorage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { writeFileAtomic, readJsonStore } from '../atomicWrite'
import type { AICapability, AIKeyStatus } from '../../shared/types'

// Per-capability API-key store — byte-for-byte the passwords.ts pattern
// (safeStorage / Windows DPAPI), just keyed by capability instead of account
// and in its own file so it never mingles with account passwords. Keys are
// encrypted at rest and NEVER returned to the renderer — the only thing that
// crosses IPC is a boolean "is a key present" (aiKeyStatus).

function filePath(): string {
  return path.join(app.getPath('userData'), 'ai-keys.json')
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
  // Owner-only (B366d, hardening — the keys are already safeStorage-encrypted).
  // `mode` applies only when the file is CREATED, so an existing file is
  // chmod'ed too; Windows keeps its ACL-based defaults.
  // Crash-safe (v0.20.4): a power loss mid-write can no longer leave a
  // truncated file that reads as empty.
  writeFileAtomic(p, JSON.stringify(store), { mode: 0o600 })
  if (process.platform !== 'win32') { try { fs.chmodSync(p, 0o600) } catch { /* best effort */ } }
}

export function setAIKey(cap: AICapability, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const store = readStore()
  if (!store) { console.error('[persist] not saving: the store file can\'t be read right now'); return }
  store[cap] = safeStorage.encryptString(key).toString('base64')
  writeStore(store)
}

export function getAIKey(cap: AICapability): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore() ?? {}
  const encrypted = store[cap]
  if (!encrypted) return null
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) } catch { return null }
}

export function clearAIKey(cap: AICapability): void {
  const store = readStore()
  if (!store) { console.error('[persist] not deleting: the store file can\'t be read right now'); return }
  if (!(cap in store)) return
  delete store[cap]
  writeStore(store)
}

export function aiKeyStatus(): AIKeyStatus {
  const store = readStore() ?? {}
  return { text: !!store.text, embeddings: !!store.embeddings, image: !!store.image }
}
