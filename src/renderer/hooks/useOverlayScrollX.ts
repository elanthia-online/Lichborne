// useOverlayScrollX — an OVERLAY horizontal scrollbar for a strip that must
// never change height (v0.20.2, the "quiver" hunt).
//
// A native horizontal scrollbar takes layout space the moment content
// overflows, so a strip near its threshold grows and shrinks as its content's
// width changes — and the character tab strip is the tallest thing in the app
// bar, so every flip moved every line of game text below it (pitfall #138's
// class, at the app's top level). The host hides the native bar
// (`scrollbar-width: none`) and draws this instead: a thin thumb laid OVER the
// strip's bottom edge, shown only while it overflows, plus which edges have
// more content beyond them (for a fade). Nothing here takes layout space.
//
// Owns: the measured scroll geometry (in whole pixels, committed only when it
// changes — a scroll event per frame must not re-render the strip per frame),
// vertical-wheel → horizontal scroll, and dragging the thumb. Re-measures on
// scroll, on the strip's own resize, on any child's resize, and when children
// are added or removed. `revealActive` scrolls a selector's match into view by
// moving ONLY this strip (never scrollIntoView, which also scrolls ancestors —
// pitfall #154's note on the root).

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface OverlayScrollState {
  overflow: boolean
  /** Thumb position and width, px, relative to the strip's visible box. */
  left: number
  width: number
  atStart: boolean
  atEnd: boolean
}

const NONE: OverlayScrollState = { overflow: false, left: 0, width: 0, atStart: true, atEnd: true }
const same = (a: OverlayScrollState, b: OverlayScrollState) =>
  a.overflow === b.overflow && a.left === b.left && a.width === b.width && a.atStart === b.atStart && a.atEnd === b.atEnd

export function useOverlayScrollX(ref: RefObject<HTMLElement | null>) {
  const [st, setSt] = useState<OverlayScrollState>(NONE)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const sw = el.scrollWidth, cw = el.clientWidth, sl = el.scrollLeft
    // 0×0 = a hidden window or tab (pitfall #24/#83): keep the last reading.
    if (cw === 0) return
    const overflow = sw > cw + 1
    const next: OverlayScrollState = overflow ? {
      overflow,
      width: Math.max(24, Math.round((cw / sw) * cw)),
      left: Math.round((sl / sw) * cw),
      atStart: sl <= 1,
      atEnd: sl + cw >= sw - 1,
    } : NONE
    setSt(prev => (same(prev, next) ? prev : next))
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure() }) }
    const ro = new ResizeObserver(schedule)
    const watchChildren = () => {
      ro.disconnect()
      ro.observe(el)
      for (const c of Array.from(el.children)) ro.observe(c)
      schedule()
    }
    const mo = new MutationObserver(watchChildren)
    mo.observe(el, { childList: true })
    watchChildren()
    el.addEventListener('scroll', schedule, { passive: true })
    // A mouse wheel turns vertically; the strip scrolls sideways. Only while it
    // overflows, and never preventing anything else (nothing above it scrolls).
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect(); mo.disconnect()
      el.removeEventListener('scroll', schedule)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref, measure])

  // Dragging the thumb: the pointer's travel times the content/visible ratio.
  // B503: only a primary-button press drags; a drag ends however the pointer
  // goes away (lost capture after Cmd+Tab or a Wayland workspace switch, or a
  // move that arrives with the button already up), so it can never stick on;
  // and the thumb lies over the tabs' bottom edge, so a press that never moved
  // is passed on as a click — and a right-click as a context menu — to the tab
  // underneath, as if the thumb weren't there.
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; sl: number; moved: boolean } | null>(null)
  const endDrag = useCallback(() => { dragRef.current = null; setDragging(false) }, [])
  const forward = useCallback((type: 'click' | 'contextmenu', e: React.MouseEvent<HTMLElement>) => {
    const thumb = e.currentTarget, strip = ref.current
    if (!strip) return
    const under = document.elementsFromPoint(e.clientX, e.clientY)
      .find(n => n !== thumb && !thumb.contains(n) && strip.contains(n))
    under?.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, detail: 1,
      clientX: e.clientX, clientY: e.clientY, button: type === 'contextmenu' ? 2 : 0,
    }))
  }, [ref])
  const onThumbPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, sl: el.scrollLeft, moved: false }
    setDragging(true)
  }, [ref])
  const onThumbPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current, d = dragRef.current
    if (!el || !d) return
    if ((e.buttons & 1) === 0) { endDrag(); return }
    // Nothing scrolls until the pointer has really moved, so a click passed on
    // to the tab underneath doesn't nudge the strip first.
    if (!d.moved) {
      if (Math.abs(e.clientX - d.x) < 3) return
      d.moved = true
    }
    el.scrollLeft = d.sl + (e.clientX - d.x) * (el.scrollWidth / el.clientWidth)
  }, [ref, endDrag])
  const onThumbPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current
    endDrag()
    if (d && !d.moved) forward('click', e)
  }, [endDrag, forward])
  const onThumbContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault()
    forward('contextmenu', e)
  }, [forward])

  /** Bring the first match fully into view by scrolling this strip only. */
  const revealActive = useCallback((selector: string) => {
    const el = ref.current
    const t = el?.querySelector<HTMLElement>(selector)
    if (!el || !t || el.scrollWidth <= el.clientWidth + 1) return
    // The strip is position:relative, so it is the tab's offsetParent and
    // offsetLeft is in the strip's own (unscrolled) content coordinates.
    const left = t.offsetParent === el ? t.offsetLeft : t.offsetLeft - el.offsetLeft
    const right = left + t.offsetWidth
    if (left < el.scrollLeft) el.scrollLeft = left
    else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth
  }, [ref])

  return {
    state: st,
    dragging,
    thumbHandlers: {
      onPointerDown: onThumbPointerDown, onPointerMove: onThumbPointerMove, onPointerUp: onThumbPointerUp,
      onPointerCancel: endDrag, onLostPointerCapture: endDrag, onContextMenu: onThumbContextMenu,
    },
    revealActive,
  }
}
