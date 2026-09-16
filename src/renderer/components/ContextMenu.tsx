// ContextMenu — the app-wide right-click menu: a flat list of `CtxItem`s
// (action / `{ label: null }` separator / hover-expanding `submenu`), used by
// the game text, stream panels, PanelFrame tabs, character tabs, floating
// windows, the Debug panel and the launcher.
//
// Dumb and portaled: callers build the item list, the menu just renders it and
// calls `onClose` after any click (or on outside `mousedown` / Escape). It is
// portaled to `document.body`, so it escapes its opener's stacking context and
// must win on z-index alone — `.ctx-menu` (game.css) sits at 2100, ABOVE the
// modal tier, so a menu opened from inside a modal isn't painted under the
// scrim; any new modal must stay below that. The root clamps itself into the
// viewport before paint; a SubMenu opens to the right of its parent row and
// flips left / shifts up at the viewport edges.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type CtxItem =
  | { label: string; onClick: () => void; disabled?: boolean }
  | { label: string; submenu: CtxItem[] }
  | { label: null }

interface Props {
  x: number
  y: number
  items: CtxItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  // Clamp the root menu into the viewport so a tall menu near a screen edge
  // doesn't overflow off-screen (measured before paint, so no flicker).
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const m = 4
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left: Math.max(m, Math.min(x, window.innerWidth - width - m)),
      top:  Math.max(m, Math.min(y, window.innerHeight - height - m)),
    })
  }, [x, y, items.length])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      // preventDefault marks Esc as consumed, so the Esc-to-close hook leaves
      // the dialog this menu was opened from alone (B341).
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div ref={menuRef} className="ctx-menu" style={{ left: pos.left, top: pos.top }}>
      <MenuRows items={items} onClose={onClose} />
    </div>,
    document.body
  )
}

// Renders one level of menu rows; a `submenu` item opens a nested menu on hover.
function MenuRows({ items, onClose }: { items: CtxItem[]; onClose: () => void }) {
  const [openIdx, setOpenIdx] = useState(-1)
  return (
    <>
      {items.map((item, i) => {
        if (item.label === null) return <hr key={i} className="ctx-menu-sep" />
        if ('submenu' in item) {
          return (
            <div
              key={i}
              className="ctx-sub"
              onMouseEnter={() => setOpenIdx(i)}
              onMouseLeave={() => setOpenIdx(prev => (prev === i ? -1 : prev))}
            >
              <button className="ctx-menu-item ctx-menu-item--parent">
                {item.label}<span className="ctx-sub-arrow">▸</span>
              </button>
              {openIdx === i && <SubMenu items={item.submenu} onClose={onClose} />}
            </div>
          )
        }
        const it = item
        return (
          <button
            key={i}
            className="ctx-menu-item"
            disabled={it.disabled}
            onClick={() => { if (it.disabled) return; it.onClick(); onClose() }}
          >
            {it.label}
          </button>
        )
      })}
    </>
  )
}

// A nested menu positioned to the right of its parent item, flipping to the
// left and shifting up if it would run off the viewport edges.
function SubMenu({ items, onClose }: { items: CtxItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [adj, setAdj] = useState<{ left: boolean; up: number }>({ left: false, up: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const m = 4
    const r = el.getBoundingClientRect()
    setAdj({
      left: r.right > window.innerWidth - m,
      up:   r.bottom > window.innerHeight - m ? r.bottom - (window.innerHeight - m) : 0,
    })
  }, [items.length])

  return (
    <div
      ref={ref}
      className={`ctx-menu ctx-submenu${adj.left ? ' ctx-submenu--left' : ''}`}
      style={{ marginTop: -adj.up }}
    >
      <MenuRows items={items} onClose={onClose} />
    </div>
  )
}
