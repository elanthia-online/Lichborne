// useUnsaved — the unsaved-changes guard (B368 / B369, v0.19.7).
//
// No editor used to know whether its draft differed from what was saved, so
// picking another rule, switching tab, pressing Esc or closing the dialog all
// threw an edit away without a word. Two halves fix that:
//
//  - An EDITOR works out `dirty` (usually `differs(draft, saved)`), guards its
//    own selection switch with `confirmDiscard(dirty, …)` from confirm.ts, and
//    reports the flag upward with `useReportUnsaved(dirty)`.
//  - A CONTAINER dialog (Automations, Contacts, the Lich Dashboard…) owns a
//    scope from `useUnsavedScope()`, provides `scope.registry` through
//    UnsavedContext, and routes close / Esc / tab and scope switches through
//    `scope.guard(action)`. Leaving with an unsaved draft then asks first.
//
// An editor with no container above it gets a null context, so reporting is a
// no-op and the local guard still works.
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { confirmDiscard } from '../confirm'

type Registry = Map<symbol, boolean>

export const UnsavedContext = createContext<Registry | null>(null)

export function useUnsavedScope(): {
  registry: Registry
  hasUnsaved: () => boolean
  guard: (action: () => void) => void
} {
  const ref = useRef<Registry | null>(null)
  if (ref.current === null) ref.current = new Map()
  const registry = ref.current
  const hasUnsaved = useCallback(() => {
    for (const v of registry.values()) if (v) return true
    return false
  }, [registry])
  const guard = useCallback((action: () => void) => confirmDiscard(hasUnsaved(), action), [hasUnsaved])
  return { registry, hasUnsaved, guard }
}

export function useReportUnsaved(dirty: boolean): void {
  const registry = useContext(UnsavedContext)
  const keyRef = useRef<symbol | null>(null)
  if (keyRef.current === null) keyRef.current = Symbol('unsaved')
  const key = keyRef.current
  useEffect(() => {
    if (!registry) return
    registry.set(key, dirty)
    return () => { registry.delete(key) }
  }, [registry, key, dirty])
}

// Key-order-insensitive, undefined-insensitive structural comparison of a
// draft against its saved copy. Rules and contacts are plain JSON (they
// round-trip through localStorage), so this is exact for them — and a field an
// editor adds with an undefined value doesn't read as a change.
function norm(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(norm)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k]
      if (x !== undefined) out[k] = norm(x)
    }
    return out
  }
  return v
}

export function differs(a: unknown, b: unknown): boolean {
  return JSON.stringify(norm(a)) !== JSON.stringify(norm(b))
}
