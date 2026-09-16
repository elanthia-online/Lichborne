import { useEffect, useRef, useState } from 'react'
import { minSizeFor, isDebugWindow, DEBUG_Z, type FloatWindow } from '../freeLayout'
import ContextMenu from './ContextMenu'

// One draggable / resizable floating window (DESIGN.md §33.4). Hosts a
// PanelFrame (or, from Phase 2, a chrome strip) passed as children. Drag
// and resize write directly to the DOM during the gesture (no per-frame
// re-render storm — §33.12) and commit the final rect as FRACTIONS on
// mouseup, so the window scales with the container.
type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

// Magnetic snapping (§33.5). A moving edge snaps to a target line (container
// edge or another window's edge) within this px threshold. Hold Alt to disable.
const SNAP_PX = 8

// Given moving edges (each with the value it currently sits at + how to turn a
// snapped target back into a position), return the nearest snap within
// threshold. Used for both axes, drag + resize.
function snapAxis(edges: { v: number; toPos: (t: number) => number }[], targets: number[]): { pos: number; guide: number } | null {
  let best: { d: number; pos: number; guide: number } | null = null
  for (const e of edges) {
    for (const t of targets) {
      const d = Math.abs(e.v - t)
      if (d <= SNAP_PX && (best === null || d < best.d)) best = { d, pos: e.toPos(t), guide: t }
    }
  }
  return best ? { pos: best.pos, guide: best.guide } : null
}

function isEditable(el: Element | null): boolean {
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

// parseFloat-with-fallback that does NOT treat 0 as missing. The `parseFloat(x)
// || fallback` idiom reverts a window snapped to the top/left edge (position 0)
// back to its STALE start position, because 0 is falsy — so commit kept the old
// rect, and the next re-render (e.g. starting a resize) "jumped" a flush-docked
// window out to where it used to be. Empty inline style → fallback; "0px" → 0.
function numPx(v: string, fallback: number): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

interface Props {
  win: FloatWindow
  container: { w: number; h: number }   // px size of the window layer
  focused: boolean
  onFocus: (id: string) => void
  onChange: (id: string, patch: Partial<FloatWindow>) => void
  onClose: (id: string) => void
  // Snap targets (container + sibling edges, px) for a given window, measured
  // live from the DOM at gesture start. + the shared guide-line elements.
  getSnapTargets: (excludeId: string) => { x: number[]; y: number[] }
  guideRefs: { v: React.RefObject<HTMLDivElement>; h: React.RefObject<HTMLDivElement> }
  locked: boolean   // §33.8 — no drag/resize/nudge/handles when true
  // Override the per-kind resize floor. An Experience whose natural shape is a
  // STRIP declares its own (ExperienceDef.minSize) — the panel floor is sized
  // for a panel of text and would leave it unshrinkable well above its content.
  minSize?: { w: number; h: number }
  // Close the window's ACTIVE tab (and the window with it, if that was the
  // last one). Supplied only by hosts whose windows hold tabs — see the
  // right-click menu below for why "Close" means the stream, not the window.
  onCloseActiveTab?: (id: string) => void
  children: React.ReactNode
}

export default function FloatingWindow({ win, container, focused, onFocus, onChange, onClose, getSnapTargets, guideRefs, locked, minSize, onCloseActiveTab, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(win.title ?? '')

  // px geometry derived from the fractional rect × current container size.
  const px = {
    left:   win.rect.x * container.w,
    top:    win.rect.y * container.h,
    width:  win.rect.w * container.w,
    height: win.rect.h * container.h,
  }

  // Chrome strips (command / vitals / icon) keep their conversion size but are
  // user-resizable in BOTH axes like panels. Height stays explicit/deterministic
  // — never `height: undefined` auto-height, which measured 0-tall on first
  // paint and shoved the layout (pitfall #74). The bar is centered in the body
  // (CSS), so growing/shrinking pads/clips symmetrically.
  const isChrome = win.kind === 'command' || win.kind === 'vitals' || win.kind === 'icon'

  // Show/position the shared snap guide lines (imperative — no re-render).
  function setGuides(gx: number | null, gy: number | null) {
    const v = guideRefs.v.current, h = guideRefs.h.current
    if (v) { if (gx != null) { v.style.left = `${Math.round(gx)}px`; v.style.display = 'block' } else v.style.display = 'none' }
    if (h) { if (gy != null) { h.style.top = `${Math.round(gy)}px`; h.style.display = 'block' } else h.style.display = 'none' }
  }

  function beginDrag(e: React.MouseEvent) {
    if (e.button !== 0 || renaming || locked) return
    const startX = e.clientX, startY = e.clientY
    const start = { ...px }
    const el = rootRef.current
    // Use the RENDERED size for bound-clamping — it can differ from px.height
    // (rect × container) because chrome headers carry a min-height floor, so a
    // small-font window renders slightly taller than its fractional rect.
    const elW = el?.offsetWidth ?? start.width
    const elH = el?.offsetHeight ?? start.height
    const targets = getSnapTargets(win.id)
    function onMove(ev: MouseEvent) {
      let nx = start.left + (ev.clientX - startX)
      let ny = start.top + (ev.clientY - startY)
      nx = Math.min(Math.max(0, nx), Math.max(0, container.w - elW))
      ny = Math.min(Math.max(0, ny), Math.max(0, container.h - elH))
      let gx: number | null = null, gy: number | null = null
      if (!ev.altKey) {
        const sx = snapAxis([{ v: nx, toPos: t => t }, { v: nx + elW, toPos: t => t - elW }], targets.x)
        if (sx) { nx = Math.min(Math.max(0, sx.pos), Math.max(0, container.w - elW)); gx = sx.guide }
        const sy = snapAxis([{ v: ny, toPos: t => t }, { v: ny + elH, toPos: t => t - elH }], targets.y)
        if (sy) { ny = Math.min(Math.max(0, sy.pos), Math.max(0, container.h - elH)); gy = sy.guide }
      }
      if (el) { el.style.left = `${nx}px`; el.style.top = `${ny}px` }
      setGuides(gx, gy)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      setGuides(null, null)
      const el2 = rootRef.current
      if (!el2 || container.w <= 0 || container.h <= 0) return
      const left = numPx(el2.style.left, start.left)
      const top  = numPx(el2.style.top,  start.top)
      onChange(win.id, { rect: { ...win.rect, x: left / container.w, y: top / container.h } })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  function beginResize(dir: ResizeDir, e: React.MouseEvent) {
    if (e.button !== 0 || locked) return
    onFocus(win.id)          // resize handle stops propagation, so focus here
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const start = { ...px }
    // A caller may override the per-kind floor (see the prop).
    const min = minSize ?? minSizeFor(win.kind)
    // Floors are the SMALLER of the per-kind minimum and the window's CURRENT
    // size. "Fit bars to content" can legitimately put a chrome window UNDER the
    // interactive minimum — a compact vitals bar is genuinely tiny — and that
    // minimum exists to stop a DRAG producing an unusable sliver, not to forbid
    // a size the user already has. Without this, touching a fitted window
    // snapped it back up to the floor (Sekmeht).
    const floorW = Math.min(min.w, start.width)
    const floorH = Math.min(min.h, start.height)
    const el = rootRef.current
    const targets = getSnapTargets(win.id)
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      let { left, top, width, height } = start
      if (dir.includes('e')) width = start.width + dx
      if (dir.includes('s')) height = start.height + dy
      if (dir.includes('w')) { width = start.width - dx; left = start.left + dx }
      if (dir.includes('n')) { height = start.height - dy; top = start.top + dy }
      // Snap the moved edge(s) to nearby target lines (before min/clamp).
      let gx: number | null = null, gy: number | null = null
      if (!ev.altKey) {
        if (dir.includes('e')) { const s = snapAxis([{ v: left + width, toPos: t => t }], targets.x); if (s) { width = s.pos - left; gx = s.guide } }
        if (dir.includes('w')) { const s = snapAxis([{ v: left, toPos: t => t }], targets.x); if (s) { width += left - s.pos; left = s.pos; gx = s.guide } }
        if (dir.includes('s')) { const s = snapAxis([{ v: top + height, toPos: t => t }], targets.y); if (s) { height = s.pos - top; gy = s.guide } }
        if (dir.includes('n')) { const s = snapAxis([{ v: top, toPos: t => t }], targets.y); if (s) { height += top - s.pos; top = s.pos; gy = s.guide } }
      }
      // Enforce the floor by anchoring the opposite edge — but ONLY on the axis
      // actually being dragged. This used to clamp BOTH axes on every resize,
      // so dragging the EAST edge of a window whose HEIGHT sat below the floor
      // re-evaluated that untouched height and snapped it up: the reported
      // "attempt to change the width snaps it to a larger size". Every ResizeDir
      // includes at least one of e/w or n/s, and corners include both, so corner
      // drags still clamp on both axes as before.
      if ((dir.includes('e') || dir.includes('w')) && width < floorW) {
        if (dir.includes('w')) left = start.left + start.width - floorW
        width = floorW
      }
      if ((dir.includes('n') || dir.includes('s')) && height < floorH) {
        if (dir.includes('n')) top = start.top + start.height - floorH
        height = floorH
      }
      // Clamp within the container.
      if (left < 0) { width += left; left = 0 }
      if (top  < 0) { height += top; top = 0 }
      if (left + width  > container.w) width  = container.w - left
      if (top  + height > container.h) height = container.h - top
      if (el) { el.style.left = `${left}px`; el.style.top = `${top}px`; el.style.width = `${width}px`; el.style.height = `${height}px` }
      setGuides(gx, gy)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      setGuides(null, null)
      const el2 = rootRef.current
      if (!el2 || container.w <= 0 || container.h <= 0) return
      const left   = numPx(el2.style.left,   start.left)
      const top    = numPx(el2.style.top,    start.top)
      const width  = numPx(el2.style.width,  start.width)
      const height = numPx(el2.style.height, start.height)
      onChange(win.id, { rect: { x: left / container.w, y: top / container.h, w: width / container.w, h: height / container.h } })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  // Arrow-key nudge for the focused window (1px, Shift = 10px). Skipped while
  // an input/textarea is focused (so typing / the command bar keep the arrows).
  useEffect(() => {
    if (!focused || locked) return
    function onKey(e: KeyboardEvent) {
      if (renaming || !e.key.startsWith('Arrow') || isEditable(document.activeElement)) return
      const step = e.shiftKey ? 10 : 1
      let dx = 0, dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      else return
      e.preventDefault()
      const nl = Math.min(Math.max(0, px.left + dx), Math.max(0, container.w - px.width))
      const nt = Math.min(Math.max(0, px.top + dy), Math.max(0, container.h - px.height))
      onChange(win.id, { rect: { ...win.rect, x: nl / container.w, y: nt / container.h } })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focused, locked, renaming, px.left, px.top, px.width, px.height, container.w, container.h, win.id, win.rect, onChange])

  function commitRename() {
    onChange(win.id, { title: draft.trim() || undefined })
    setRenaming(false)
  }

  // Right-click anywhere in the window → Close (Sekmeht). The ✕ is a quiet ~1em
  // glyph that only appears on hover, sits beside the corner resize handle, and
  // is absent entirely on a collapsed or LOCKED window — so a context menu is
  // the reliable way to close one; the ✕ stays as the fast path.
  //
  // IT DELIBERATELY CIRCUMVENTS THE LOCK (Sekmeht). The first cut gated this on
  // `!locked` by analogy with the header, reasoning that a frozen layout
  // shouldn't offer to dismantle itself. That was backwards: locking hides the
  // header AND the ✕, so right-click is the ONLY remaining way to close
  // anything, and gating it removed the last affordance exactly where it was
  // needed ("there's no right-click option" — on a locked character). Locking
  // freezes ACCIDENTS — drag and resize — not a deliberate menu choice.
  //
  // "CLOSE" MEANS THE CONTENT, NOT THE CONTAINER (Sekmeht: "I'm not saying to
  // close the window/panel, I'm saying to close a stream inside, or if it's an
  // experience..."). So on a tabbed window it closes the ACTIVE STREAM, and the
  // window only goes with it if that was the last tab. An Experience has no
  // tabs and IS the content, so there Close closes it. Right-clicking an
  // individual TAB keeps PanelFrame's own richer menu (Timestamps / Clear / Close),
  // which already targets that specific stream.
  //
  // CHROME BARS AND THE GAME WINDOW ARE EXCLUDED ENTIRELY (Sekmeht) — see
  // `noCloseMenu` below for which and why. No handler is attached at all rather
  // than an empty menu, which also leaves the pre-existing bubbling to the game
  // window's own menu exactly as it was.
  //
  // Bound on the ROOT so it covers every part of the window in every state,
  // including a locked window that renders no chrome at all. Inner surfaces
  // still win: a handler that already claimed the event (stream text, the maps,
  // Debug, a tab strip) calls preventDefault, and the `defaultPrevented` check
  // below yields to it rather than replacing its menu with ours.
  // Windows the right-click Close menu is NOT offered on. Chrome bars are
  // equipment rather than content — lose the command bar and you cannot type —
  // and the GAME WINDOW is the game text itself, which is the most expensive
  // thing on screen to lose. Both are recoverable only through Layout Manager →
  // Add Window, a poor trade for a one-item menu you can hit by accident.
  //
  // Kept SEPARATE from `isChrome` on purpose: that flag also drives the
  // .fl-window--chrome styling and the chrome minimum size, and the game window
  // must keep ordinary panel sizing. Same exclusion, different reason — folding
  // them together would silently restyle the game window.
  const noCloseMenu = isChrome || win.kind === 'main'
  const closesTab = !!onCloseActiveTab && (win.tabs?.length ?? 0) > 0
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const openCtx = (e: React.MouseEvent) => {
    if (e.defaultPrevented) return
    // NOT ON THE TAB STRIP (Sekmeht). The blank space to the right of the tabs
    // belongs to the tab bar, and the tab bar already has its own vocabulary:
    // right-clicking a TAB offers Clear / Close tab, aimed at that specific
    // stream. Offering a differently-scoped "Close" a few pixels away, over
    // empty space, is the kind of thing you click once and then distrust. The
    // strip's own handlers preventDefault and never reach here; this is about
    // the GAPS between and after them, which have no handler of their own.
    // Returning WITHOUT preventDefault leaves that space behaving exactly as it
    // did before any of this existed.
    if ((e.target as HTMLElement | null)?.closest?.('.panel-frame-tabs')) return
    e.preventDefault()
    // Stop the game window's own menu (GameWindow binds one on an ancestor)
    // from also firing and replacing this one.
    e.stopPropagation()
    onFocus(win.id)
    setCtx({ x: e.clientX, y: e.clientY })
  }

  return (
    <div
      ref={rootRef}
      data-win-id={win.id}
      className={`fl-window${focused ? ' fl-window--focused' : ''}${isChrome ? ' fl-window--chrome' : ''}${locked ? ' fl-window--locked' : ''}`}
      // Debug floats above the other windows (Sekmeht: "I've had it disappear
      // behind the game window and couldn't find it"). Offset at render only —
      // see DEBUG_Z for why this can't leak into stored order or over a modal.
      style={{ left: px.left, top: px.top, width: px.width, height: px.height,
               zIndex: isDebugWindow(win) ? DEBUG_Z : win.z }}
      onMouseDown={() => onFocus(win.id)}
      onContextMenu={noCloseMenu ? undefined : openCtx}
    >
      {/* LOCKED = display mode: no window chrome at all, so a tiled layout
          reads like docked panels (TheTargonian — the chrome cost ~12px at
          every seam, "6 of those buffers is close to half a window").

          Since v0.18.1 the header is an absolute OVERLAY (free-layout.css), so
          hiding it here changes NOTHING about layout — the body already fills
          the window in both states. That is what makes the locked view match
          what you actually arranged, and it settles pitfall #74 outright: the
          toggle is now a pure visibility change that never touches the stored
          rect. (Renaming and double-click-to-show-the-name are edit
          affordances — they come back with the header when you unlock.) */}
      {!locked && (win.showTitle ? (
        <div
          className="fl-titlebar"
          onMouseDown={beginDrag}
          onDoubleClick={() => { setDraft(win.title ?? ''); setRenaming(true) }}
        >
          {renaming ? (
            <input
              className="fl-title-input"
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                // preventDefault: a consumed Esc must not also reach
                // useEscapeClose and close a dialog underneath (B341).
                if (e.key === 'Escape') { e.preventDefault(); setRenaming(false) }
                e.stopPropagation()
              }}
              maxLength={40}
            />
          ) : (
            <span className="fl-title">{win.title ?? 'Window'}</span>
          )}
          <button
            className="fl-tb-btn fl-tb-collapse"
            title="Collapse title into a grip"
            aria-label="Collapse title into a grip"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onChange(win.id, { showTitle: false })}
          >⌃</button>
          <button
            className="fl-tb-btn fl-tb-close"
            title="Close window"
            aria-label="Close window"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onClose(win.id)}
          >×</button>
        </div>
      ) : (
        <div
          className="fl-grip"
          // B383: only promise the right-click Close where there IS one —
          // `noCloseMenu` strips it from the chrome bars and the game window.
          title={noCloseMenu
            ? 'Drag to move — double-click to show the name bar'
            : 'Drag to move — double-click to show the name bar · right-click to close'}
          onMouseDown={beginDrag}
          onDoubleClick={() => onChange(win.id, { showTitle: true })}
        />
      ))}

      <div className="fl-body">{children}</div>

      {!locked && DIRS.map(d => (
        <div key={d} className={`fl-rz fl-rz-${d}`} onMouseDown={e => beginResize(d, e)} />
      ))}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={[{
            label: 'Close',
            onClick: () => (closesTab ? onCloseActiveTab!(win.id) : onClose(win.id)),
          }]}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  )
}
