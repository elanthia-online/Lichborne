// Free Layout — floating-window mode (DESIGN.md §33). Phase 1: the data
// model + helpers for the window shell. A "window" is the unlimited
// evolution of a panel: a floating, draggable, resizable frame hosting a
// PanelFrame (kind:'panel') or — from Phase 2 — a decoupled chrome strip
// (main text / vitals / icon / compass / command).
import { nanoid } from 'nanoid'
import { makeTab, type TabDef } from './components/PanelFrame'

export type WinKind = 'panel' | 'main' | 'vitals' | 'icon' | 'compass' | 'command'

// Rect stored as FRACTIONS (0..1) of the Free-Layout container (the game
// area), per the locked decision (§33.2): windows scale proportionally on
// OS-window resize and survive the §13.9 OS-window decouple.
export interface FloatRect { x: number; y: number; w: number; h: number }

export interface FloatWindow {
  id: string
  kind: WinKind
  rect: FloatRect
  z: number               // stacking order; click-to-front bumps to max+1
  showTitle: boolean      // requirement #4 — hide/reveal the window name
  title?: string          // editable; falls back to a default at render
  tabs?: TabDef[]         // kind === 'panel' only — reuses the zone shape
  activeId?: string       // kind === 'panel' only
}

export type LayoutMode = 'panels' | 'free'

/**
 * Is this the Debug window? Identified by its TAB, which is also how
 * `toggleFreeDebugWindow` adds and removes it — one predicate, so the two can
 * never disagree about which window Debug is.
 *
 * Debug is the one DELIBERATE exception to the lock (Sekmeht). §33.8 draws the
 * lock's line at container vs content: it freezes position and size, and only
 * content operations circumvent it. Debug inverts that, because it is not part
 * of the layout you froze — it is a transient diagnostic surface you open,
 * read and close. Locking it in place is all cost and no benefit: a locked
 * window renders no header at all, so there is nothing left to grab, and the
 * window it most often lands behind is the game text itself.
 */
export const isDebugWindow = (w: FloatWindow) => (w.tabs ?? []).some(t => t.id === 'debug')

/**
 * Ceiling at which WindowLayer renormalizes stored `z` back to 1..N, so it
 * cannot grow without bound. Exported because DEBUG_Z has to clear it — the
 * two are one contract and must not drift apart in separate files.
 */
export const Z_RENORMALIZE_CEILING = 100_000

/**
 * Display-only z that keeps Debug above every ordinary window.
 *
 * ABSOLUTE, not an offset. The first cut was `DEBUG_Z + win.z` with
 * DEBUG_Z = 10_000, which silently stopped working once any window's stored z
 * passed 10,000 — reachable because click-to-front increments z per focus and
 * nothing renormalizes until 100,000. Debug would then sink behind the game
 * window again after a long session, which is the exact complaint this was
 * built to fix. Sitting one above the renormalization ceiling means no
 * ordinary window can ever reach it.
 *
 * Applied at RENDER, never written to `w.z` — the stored order stays untouched
 * so click-to-front keeps working and nothing odd persists to the profile. It
 * cannot escape over a modal either: `.window-layer` is
 * `position: absolute; z-index: 60`, which makes it a stacking context, so
 * every z inside it is scoped beneath the overlay tiers (≥ 100).
 */
export const DEBUG_Z = Z_RENORMALIZE_CEILING + 1

// Minimum on-screen window size, in px. Enforced on resize so a window
// can't shrink to an unusable sliver even in a cramped container. Overlap
// is allowed, so this never blocks placement.
export const MIN_WIN_PX = { w: 180, h: 110 }

// Per-kind minimum size. The chrome strips (command / vitals / icon) are
// thin, so the 110px panel floor would force them tall and "unshrinkable
// vertically" the instant you resize (their natural height is well under
// 110). Give them small floors so they can hug their bar.
export function minSizeFor(kind: WinKind): { w: number; h: number } {
  switch (kind) {
    case 'command': return { w: 220, h: 30 }
    case 'vitals':  return { w: 140, h: 24 }
    case 'icon':    return { w: 140, h: 24 }
    default:        return MIN_WIN_PX
  }
}

// Returns `undefined` when the key was NEVER written (→ caller seeds the
// default layout) vs. `[]` when the user intentionally emptied it
// (respected, not re-seeded). This is the §33.3 conversion-trigger contract.
export function loadFreeWindows(key: string): FloatWindow[] | undefined {
  const raw = localStorage.getItem(key)
  if (raw == null) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter(isFloatWindow)
  } catch { /* corrupt → treat as never-set so the seed runs */ }
  return undefined
}

/**
 * Two signatures of a layout (B550): everything but `z`, and `z` alone. A
 * click-to-front changes only `z`, and that used to schedule a full profile
 * save — 60–150 ms of main blocked on YAML — on every click between windows.
 * GameWindow saves the YAML in 2.5 s for a GEOMETRY change, lazily (60 s, idle
 * only) for a z-only change, and not at all when nothing changed (the mount
 * echo). localStorage is written at once either way.
 */
export function freeLayoutSignatures(wins: FloatWindow[]): { geom: string; z: string } {
  return {
    geom: JSON.stringify(wins.map(({ z: _z, ...rest }) => rest)),
    z:    JSON.stringify(wins.map(w => [w.id, w.z])),
  }
}

export function saveFreeWindows(key: string, wins: FloatWindow[]): void {
  localStorage.setItem(key, JSON.stringify(wins))
}

function isFloatWindow(w: unknown): w is FloatWindow {
  const o = w as FloatWindow
  return !!o && typeof o.id === 'string' && typeof o.kind === 'string' && !!o.rect
    && typeof o.rect.x === 'number' && typeof o.rect.y === 'number'
    && typeof o.rect.w === 'number' && typeof o.rect.h === 'number'
}

// Phase 1 seed: a few panel windows mirroring the default right-column
// streams, positioned on the right so they overlay the live game without
// fully blocking the main text. Phase 2 replaces this with the
// measure-and-mint conversion (§33.6) that snapshots the user's ACTUAL
// current layout (panels + chrome + main text).
export function seedDefaultWindows(): FloatWindow[] {
  return [
    { id: nanoid(), kind: 'panel', z: 1, showTitle: true, title: 'Panel 1',
      rect: { x: 0.60, y: 0.04, w: 0.36, h: 0.30 },
      tabs: [makeTab('room'), makeTab('conversation')], activeId: 'room' },
    { id: nanoid(), kind: 'panel', z: 2, showTitle: true, title: 'Panel 2',
      rect: { x: 0.60, y: 0.36, w: 0.36, h: 0.30 },
      tabs: [makeTab('thoughts'), makeTab('arrivals'), makeTab('deaths'), makeTab('spells')], activeId: 'thoughts' },
    { id: nanoid(), kind: 'panel', z: 3, showTitle: true, title: 'Panel 3',
      rect: { x: 0.60, y: 0.68, w: 0.36, h: 0.28 },
      tabs: [makeTab('exp'), makeTab('log')], activeId: 'exp' },
  ]
}

export function defaultWindowTitle(kind: WinKind): string {
  switch (kind) {
    case 'main':    return 'Game'
    case 'command': return 'Command'
    case 'vitals':  return 'Vitals'
    case 'icon':    return 'Status'
    default:        return 'Panel'
  }
}

// Default window sizes (§33.8). Panels/main are fractions of the container;
// the fixed-height chrome bars use absolute px (so they're never clipped).
const DEFAULT_FRAC: Record<WinKind, { w: number; h: number }> = {
  main:    { w: 0.50, h: 0.55 },
  panel:   { w: 0.36, h: 0.40 },
  vitals:  { w: 0.50, h: 0 },
  icon:    { w: 0.50, h: 0 },
  command: { w: 0.50, h: 0 },
  compass: { w: 0.18, h: 0.22 },  // not decoupled yet; here to satisfy the union
}
const CHROME_H_PX: Partial<Record<WinKind, number>> = { vitals: 60, icon: 56, command: 64 }

// Create a new window (the "＋ Window" / re-add-chrome action, §33.8). Cascade
// offset by `cascadeIndex` so successive adds don't stack exactly. Caller bumps
// z to the front. Panel windows start empty (the user fills them via the +).
export function newFloatWindow(
  kind: WinKind,
  container: { w: number; h: number },
  cascadeIndex: number,
  opts?: { title?: string; tabs?: TabDef[]; activeId?: string },
): FloatWindow {
  const cw = container.w > 0 ? container.w : 1200
  const ch = container.h > 0 ? container.h : 800
  const wPx = DEFAULT_FRAC[kind].w * cw
  const hPx = CHROME_H_PX[kind] ?? DEFAULT_FRAC[kind].h * ch
  const off = (cascadeIndex % 8) * 28
  const left = Math.min(40 + off, Math.max(0, cw - wPx))
  const top  = Math.min(40 + off, Math.max(0, ch - hPx))
  return {
    id: nanoid(),
    kind,
    z: 1,
    showTitle: true,
    title: opts?.title ?? defaultWindowTitle(kind),
    rect: { x: left / cw, y: top / ch, w: wPx / cw, h: hPx / ch },
    ...(kind === 'panel' ? { tabs: opts?.tabs ?? [], activeId: opts?.activeId ?? '' } : {}),
  }
}
