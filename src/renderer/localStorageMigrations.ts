// Renderer-side localStorage migrations.
//
// Distinct from `profile-migrations.ts`, which migrates YAML profile schemas at
// import time. This module runs at app startup (called from `main.tsx` before
// React renders) and transforms the per-character `lichborne.*` localStorage
// entries that GameWindow reads on mount.
//
// Each migration is gated by a global flag key. Migration runs once per
// installation; subsequent launches no-op. To add a new migration, copy the
// `migrateConversationsRename` shape: pick a unique flag key, iterate
// `localStorage` for the keys the migration touches, transform in place,
// and set the flag at the end.
//
// Defensive: every JSON.parse is wrapped in try/catch — a malformed entry from
// a manually-edited localStorage shouldn't crash app startup.

const FLAG_PREFIX = 'lichborne.migrations.'

function withParsedArray<T>(key: string, fn: (arr: T[]) => T[] | null): void {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return
    const next = fn(parsed as T[])
    if (next !== null) localStorage.setItem(key, JSON.stringify(next))
  } catch { /* malformed — leave alone */ }
}

function withParsedObject<T extends Record<string, unknown>>(
  key: string,
  fn: (obj: T) => T | null,
): void {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const next = fn(parsed as T)
    if (next !== null) localStorage.setItem(key, JSON.stringify(next))
  } catch { /* malformed — leave alone */ }
}

// v0.8.10: rename the panel/stream id 'conversations' (plural — Lichborne's
// pre-v0.8.10 form) to 'conversation' (singular — Wrayth / Genie /
// Frostbite convention). Touches: tabs arrays (id/type/label fields), active-id
// strings, settings.panelFontSizes keys, trigger watchStream values. The parser
// also keeps a 'conversations' → 'conversation' STREAM_MAP entry as a backward
// alias in case anything escaped this migration.
//
// v0.8.10 flag bumped from 'conversationRename' → 'conversationRename2' after
// Sekmeht reported a tester case where the migration ran but didn't catch a
// custom tab with id='Conversations' (capital C — a Lich-emitted stream they'd
// added via the Panel Manager pre-v0.8.10). The improved version is:
//   (a) case-insensitive id/label matching (catches 'Conversations', 'CONVERSATIONS')
//   (b) dedupe pass after rename — if multiple tabs collapse to id='conversation',
//       keep only the first (otherwise the user sees two "Conversation" tabs)
//   (c) active-id string check is also case-insensitive
//
// v0.8.10 flag bumped again from 'conversationRename2' → 'conversationRename3'
// after the v0.8.10 retroactive sweep found that the trigger handler only
// migrated the top-level `watchStream` field, missing `actions[].echoStream`
// on echo actions. A pre-v0.8.10 user who created a trigger that echoed to
// the (then-named) Conversations panel would have `echoStream: 'conversations'`
// persisted in localStorage; the runtime alias normalization in echoToStream
// kept it functionally working, but opening the trigger editor would show
// the legacy value outside the dropdown options. The bump re-runs the (now
// echoStream-aware) migration on every user's next launch.
function migrateConversationsRename(): void {
  const FLAG = FLAG_PREFIX + 'conversationRename3'
  if (localStorage.getItem(FLAG) === '1') return

  // Snapshot keys first — we're going to write back to localStorage inside the
  // loop, and Storage's iteration order isn't guaranteed stable across writes.
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('lichborne.')) keys.push(k)
  }

  for (const key of keys) {
    // Tabs arrays: rename id/type/label from any case-variant of 'conversations'
    // → 'conversation', THEN dedupe (multiple tabs may collapse to the same id).
    if (/\.(mainTopTabs|topTabs|midTabs|bottomTabs)$/.test(key)) {
      withParsedArray<{ id?: string; type?: string; label?: string }>(key, tabs => {
        let changed = false
        // First pass: rename in place (case-insensitive comparisons)
        const renamed = tabs.map(t => {
          const id    = t.id?.toLowerCase()    === 'conversations'  ? 'conversation'  : t.id
          const type  = t.type?.toLowerCase()  === 'conversations'  ? 'conversation'  : t.type
          const label = t.label?.toLowerCase() === 'conversations'  ? 'Conversation' : t.label
          if (id !== t.id || type !== t.type || label !== t.label) changed = true
          return { ...t, id, type, label }
        })
        // Second pass: dedupe by id — if a user had both a builtin
        // 'conversations' tab AND a custom 'Conversations' tab (case-variant),
        // both rename to 'conversation' and we'd end up with two tabs of the
        // same id (PanelManager renders one per array entry; the user sees a
        // duplicate they have to manually close). Keep the FIRST occurrence.
        const seenIds = new Set<string>()
        const deduped = renamed.filter(t => {
          if (t.id === 'conversation') {
            if (seenIds.has('conversation')) {
              changed = true
              return false
            }
            seenIds.add('conversation')
          }
          return true
        })
        return changed ? deduped : null
      })
    }

    // Active-id string values — case-insensitive match
    if (/\.(mainTopActiveId|topActiveId|midActiveId|bottomActiveId)$/.test(key)) {
      const val = localStorage.getItem(key)
      if (val && val.toLowerCase() === 'conversations') {
        localStorage.setItem(key, 'conversation')
      }
    }

    // Settings: rename panelFontSizes key (handle any case variant)
    if (/\.settings$/.test(key)) {
      withParsedObject<Record<string, unknown>>(key, settings => {
        const pfs = settings.panelFontSizes
        if (!pfs || typeof pfs !== 'object' || Array.isArray(pfs)) return null
        const cast = pfs as Record<string, unknown>
        // Find any case variant of 'conversations' key (there could be more
        // than one if the same panel was created with different casings).
        const matchingKeys = Object.keys(cast).filter(k => k.toLowerCase() === 'conversations')
        if (matchingKeys.length === 0) return null
        // First match wins for the value; drop the rest.
        const value = cast[matchingKeys[0]]
        const nextPfs: Record<string, unknown> = { ...cast }
        for (const k of matchingKeys) delete nextPfs[k]
        nextPfs.conversation = value
        return { ...settings, panelFontSizes: nextPfs }
      })
    }

    // Triggers: rename both the top-level `watchStream` field and the
    // nested `actions[].echoStream` field from 'conversations' →
    // 'conversation' (case-insensitive). Pre-v0.8.10 a user could pick
    // 'Conversations' as either the watched stream OR the echo target;
    // both need migration so the editor dropdown shows a valid option
    // and the stored value matches what STREAM_ID_ALIASES normalizes
    // to at runtime.
    if (/\.triggers$/.test(key)) {
      withParsedArray<{ watchStream?: string; actions?: { echoStream?: string }[] }>(key, triggers => {
        let changed = false
        const next = triggers.map(t => {
          let triggerChanged = false
          // watchStream rename
          const newWatch = t.watchStream?.toLowerCase() === 'conversations'
            ? 'conversation'
            : t.watchStream
          if (newWatch !== t.watchStream) triggerChanged = true
          // actions[].echoStream rename
          const newActions = (t.actions ?? []).map(a => {
            if (a.echoStream?.toLowerCase() === 'conversations') {
              triggerChanged = true
              return { ...a, echoStream: 'conversation' }
            }
            return a
          })
          if (triggerChanged) {
            changed = true
            return { ...t, watchStream: newWatch, actions: newActions }
          }
          return t
        })
        return changed ? next : null
      })
    }
  }

  localStorage.setItem(FLAG, '1')
}

// Call this once at app startup, before any component reads localStorage.
export function runLocalStorageMigrations(): void {
  migrateConversationsRename()
}
