// Window bounds resolver — where a remembered window may reopen (F109, v0.19.7).
//
// Pure geometry, deliberately free of electron so the rules harness can lock it:
// given a window's saved NORMAL-state rectangle and the work areas of the
// displays attached right now, decide the bounds to open with. main's
// windowState.ts does the file I/O and supplies `screen`'s work areas.
//
// The one rule that matters: a restored window must be GRABBABLE. A rect saved
// on a monitor that has since been unplugged (or a laptop that left its dock)
// would otherwise reopen entirely off-screen with no way to drag it back. So a
// saved POSITION is honoured only when a usable strip of the window's top edge —
// where the title bar lives — lands on some display. Otherwise the position is
// dropped (Electron then centres the window) and only the size survives.
//
// Deliberately NOT done: pulling a window fully onto one display. A window
// straddling two side-by-side monitors is a legitimate arrangement, and
// "fixing" it would move windows the user placed on purpose. The only
// adjustments are clamping a size larger than the display it opens on, and the
// minimum upward nudge that clamp needs to keep the bottom edge on screen.

export interface Rect { x: number; y: number; width: number; height: number }

/** What is persisted per window: its normal-state rect plus whether it was maximized. */
export interface SavedWindowBounds extends Rect { maximized?: boolean }

export interface BoundsDefaults { width: number; height: number; minWidth: number; minHeight: number }

/** `x`/`y` absent ⇒ let Electron centre the window. */
export interface ResolvedBounds { x?: number; y?: number; width: number; height: number; maximized: boolean }

/** Height of the band along the window's top edge that must land on a display. */
export const TITLE_STRIP_PX = 32
/** How much of that band must be visible, horizontally, to count as grabbable. */
export const MIN_VISIBLE_TITLE_PX = 100
/** Tolerance for a top edge a few pixels above the work area (OS snap layouts do this). */
export const TOP_TOLERANCE_PX = 8

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Shape check for a value read back from disk — a hand-edited or damaged file must read as "nothing saved". */
export function isSavedWindowBounds(v: unknown): v is SavedWindowBounds {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return finite(r.x) && finite(r.y) && finite(r.width) && finite(r.height)
    && (r.width as number) > 0 && (r.height as number) > 0
    && (r.maximized === undefined || typeof r.maximized === 'boolean')
}

/** True when the window's top strip lands on this work area with enough width to grab. */
export function titleStripVisible(r: Rect, area: Rect): boolean {
  if (r.y < area.y - TOP_TOLERANCE_PX) return false
  if (r.y > area.y + area.height - TITLE_STRIP_PX) return false
  const overlap = Math.min(r.x + r.width, area.x + area.width) - Math.max(r.x, area.x)
  return overlap >= MIN_VISIBLE_TITLE_PX
}

/**
 * Resolve the bounds a window should open with.
 *
 * @param saved      the persisted rect, or nothing for a window never seen before
 * @param workAreas  the work areas of the attached displays, PRIMARY FIRST — the
 *                   primary is the size cap when the saved position is unusable
 * @param defaults   first-launch size and the window's minimum size
 */
export function resolveWindowBounds(
  saved: SavedWindowBounds | null | undefined,
  workAreas: Rect[],
  defaults: BoundsDefaults,
): ResolvedBounds {
  if (!isSavedWindowBounds(saved)) {
    return { width: defaults.width, height: defaults.height, maximized: false }
  }
  const maximized = saved.maximized === true
  const areas = workAreas.filter(a => a.width > 0 && a.height > 0)

  const x = Math.round(saved.x)
  const y = Math.round(saved.y)
  const savedW = Math.max(Math.round(saved.width), defaults.minWidth)
  const savedH = Math.max(Math.round(saved.height), defaults.minHeight)

  const host = areas.find(a => titleStripVisible({ x, y, width: savedW, height: savedH }, a))
  if (!host) {
    // Position unusable: keep the size, but never larger than the primary display.
    const primary = areas[0]
    const width = primary ? Math.min(savedW, Math.max(primary.width, defaults.minWidth)) : savedW
    const height = primary ? Math.min(savedH, Math.max(primary.height, defaults.minHeight)) : savedH
    return { width, height, maximized }
  }

  const width = Math.min(savedW, Math.max(host.width, defaults.minWidth))
  const height = Math.min(savedH, Math.max(host.height, defaults.minHeight))
  // Nudge vertically ONLY when the height clamp pushed the bottom edge off the
  // display; never move a window that fit as saved.
  const ny = height < savedH ? Math.max(host.y, Math.min(y, host.y + host.height - height)) : y
  return { x, y: ny, width, height, maximized }
}
