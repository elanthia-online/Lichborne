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
import type { AICapability, AIKeyStatus } from '../../shared/types'

// Per-capability API-key store — byte-for-byte the passwords.ts pattern
// (safeStorage / Windows DPAPI), just keyed by capability instead of account
// and in its own file so it never mingles with account passwords. Keys are
// encrypted at rest and NEVER returned to the renderer — the only thing that
// crosses IPC is a boolean "is a key present" (aiKeyStatus).

function filePath(): string {
  return path.join(app.getPath('userData'), 'ai-keys.json')
}

function readStore(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(filePath(), 'utf-8')) } catch { return {} }
}

function writeStore(store: Record<string, string>) {
  const p = filePath()
  // Owner-only (B366d, hardening — the keys are already safeStorage-encrypted).
  // `mode` applies only when the file is CREATED, so an existing file is
  // chmod'ed too; Windows keeps its ACL-based defaults.
  fs.writeFileSync(p, JSON.stringify(store), { encoding: 'utf-8', mode: 0o600 })
  if (process.platform !== 'win32') { try { fs.chmodSync(p, 0o600) } catch { /* best effort */ } }
}

export function setAIKey(cap: AICapability, key: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  const store = readStore()
  store[cap] = safeStorage.encryptString(key).toString('base64')
  writeStore(store)
}

export function getAIKey(cap: AICapability): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const store = readStore()
  const encrypted = store[cap]
  if (!encrypted) return null
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) } catch { return null }
}

export function clearAIKey(cap: AICapability): void {
  const store = readStore()
  if (!(cap in store)) return
  delete store[cap]
  writeStore(store)
}

export function aiKeyStatus(): AIKeyStatus {
  const store = readStore()
  return { text: !!store.text, embeddings: !!store.embeddings, image: !!store.image }
}
