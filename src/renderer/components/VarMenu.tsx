// VarMenu — the "$" button that inserts a variable (or token) at the caret.
//
// ONE control for every rule editor that interpolates text (UX standard #12):
// it began as the Macros panel's private `MaVarPicker` and replaced the
// Triggers panel's native `<select>`, which read "$var" like a setting you
// choose rather than a list you insert from. A button that opens a menu says
// "insert" in a way a select never does.
//
// Items are grouped into titled `sections`; `note` renders one line of
// explanation above them. Inserting splices `insert` at the caret of
// `inputRef` and puts the caret after it.
//
// Keyboard (B380): the menu is portaled to the end of <body>, so opening it
// focuses the first item; ↑/↓ move; Esc closes the MENU only — it calls
// preventDefault so the dialog's useEscapeClose leaves the dialog open
// (pitfall #141) — and returns focus to the button.
//
// Placement: under the button, right-aligned to it, and FLIPPED above when it
// would run off the bottom of the window (pitfall #109's B429 rider). The
// classes stay `ma-var-*` (macros.css) because that is where the item layout
// lives; `.ui-menu` supplies the surface and the z-450 dialog-popover tier.
//
// LIVE VALUES (v0.20.0): when a host provides `LiveVarsContext` (GameWindow
// does, around the Automations dialog), each `$variable` row shows what it
// holds RIGHT NOW for this character — `$health 87`, `$right a broadsword`
// — re-read once a second while the menu is open, so `$rt` counts down in
// front of you. A variable with nothing to show (the text a trigger matched
// only exists when it fires) shows no value. The value is in the ROW, never in
// a `title`: a tooltip that changes while shown blinks (pitfall #145).

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface VarMenuItem {
  /** What the row shows, e.g. `$health` or `{RepeatLast}`. */
  label: string
  /** What gets inserted — usually the same as `label`. */
  insert: string
  desc: string
}

export interface VarMenuSection {
  title?: string
  items: VarMenuItem[]
}

/** Returns every variable's current value for the character the dialog is
 *  about, keyed WITHOUT the `$` (`health`, `rt`, a trigger-set `myvar`…). */
export type LiveVarsGetter = () => Record<string, string>

export const LiveVarsContext = createContext<LiveVarsGetter | null>(null)

/** How often an open menu re-reads the values. */
const LIVE_REFRESH_MS = 1000

/** The key a menu item's value is looked up by, or null for a token. */
function liveKey(insert: string): string | null {
  const m = insert.match(/^\$([A-Za-z_][\w]*|\d+)$/)
  return m ? m[1] : null
}

interface Props {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
  value: string
  onChange: (v: string) => void
  sections: VarMenuSection[]
  note?: string
  /** Hover text for the button. */
  title?: string
}

export default function VarMenu({ inputRef, value, onChange, sections, note, title = 'Insert a variable' }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number; maxHeight?: number }>({ top: 0, left: 0 })
  const btnRef  = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const getLive = useContext(LiveVarsContext)
  const [live, setLive] = useState<Record<string, string> | null>(null)

  // Read the values when the menu opens, then once a second while it stays open.
  useEffect(() => {
    if (!open || !getLive) { setLive(null); return }
    const read = () => { try { setLive(getLive()) } catch { setLive(null) } }
    read()
    const h = setInterval(read, LIVE_REFRESH_MS)
    return () => clearInterval(h)
  }, [open, getLive])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node))
        setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        btnRef.current?.focus()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('.ma-var-item') ?? [])
      if (items.length === 0) return
      e.preventDefault()
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1)
      items[next].focus()
    }
    // If whatever holds the $ button scrolls (the dialog's form), this
    // fixed-position menu would be stranded away from its button — close it.
    // ONLY that: the game text behind the dialog auto-scrolls on every line,
    // and closing on any scroll would shut the menu the moment text arrived.
    function onScroll(e: Event) {
      const t = e.target
      const btn = btnRef.current
      if (!btn) return
      if (t === document || (t instanceof Node && t.contains(btn))) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    // preventScroll: never let focusing the menu scroll anything behind it
    // (the document root is overflow:hidden but still scrollable, pitfall #109).
    const raf = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('.ma-var-item')?.focus({ preventScroll: true }))
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // Measure the rendered menu and flip it above the button when there isn't
  // room below. Runs before paint, so the first frame is already in place.
  useLayoutEffect(() => {
    if (!open) return
    const btn = btnRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!btn || !menu) return
    const MARGIN = 8
    // The stylesheet's max-height is the design ceiling; read it before any
    // inline value exists (handleOpen resets pos without one).
    const cap = parseFloat(getComputedStyle(menu).maxHeight) || Infinity
    const h = Math.min(menu.scrollHeight, cap)
    const below = window.innerHeight - btn.bottom - 4 - MARGIN
    const above = btn.top - 4 - MARGIN
    // Horizontally the menu hangs LEFT from the button's right edge
    // (translateX(-100%)); keep that left edge on screen, and the right edge.
    const w = menu.offsetWidth
    const left = Math.min(window.innerWidth - MARGIN, Math.max(btn.right, w + MARGIN))
    if (h <= below || below >= above) {
      setPos({ left, top: btn.bottom + 4, maxHeight: Math.min(h, Math.max(120, below)) })
    } else {
      const mh = Math.min(h, above)
      setPos({ left, top: btn.top - 4 - mh, maxHeight: mh })
    }
  }, [open])

  function handleOpen() {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.right })
    // Read the values NOW, in the same render that opens the menu, so the
    // placement pass measures the menu WITH its value chips. Filled in later
    // by the effect, they widened a menu already placed — enough to push its
    // left edge off screen near the window's left side.
    if (!open && getLive) { try { setLive(getLive()) } catch { setLive(null) } }
    setOpen(v => !v)
  }

  function insertText(literal: string) {
    const el = inputRef.current
    const at = el ? (el.selectionStart ?? value.length) : value.length
    onChange(value.slice(0, at) + literal + value.slice(at))
    setOpen(false)
    setTimeout(() => {
      el?.focus()
      const np = at + literal.length
      el?.setSelectionRange(np, np)
    }, 0)
  }

  return (
    <>
      <button
        ref={btnRef}
        className="ma-var-btn"
        type="button"
        onClick={handleOpen}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >$</button>
      {open && createPortal(
        <div
          ref={menuRef}
          // `--live`: a FIXED width while values show, so a value changing on
          // the 1s refresh ($rt 10 → 9, a new room) can't resize the menu and
          // re-wrap the rows under the pointer (pitfall #103).
          className={`ui-menu ma-var-menu${live ? ' ma-var-menu--live' : ''}`}
          role="menu"
          aria-label={title}
          style={{ top: pos.top, left: pos.left, transform: 'translateX(-100%)', ...(pos.maxHeight ? { maxHeight: pos.maxHeight } : {}) }}
        >
          {note && <div className="ma-var-note">{note}</div>}
          {live && (
            <div className="ma-var-note ma-var-note--live">
              On the right: what each one holds right now{live.characterName ? ` for ${live.characterName}` : ''}.
            </div>
          )}
          {sections.filter(s => s.items.length > 0).map((s, si) => (
            <div key={s.title ?? si}>
              {s.title && <div className="ma-var-section">{s.title}</div>}
              {s.items.map(it => (
                <button type="button" role="menuitem" key={it.insert} className="ui-menu-item ui-menu-item--baseline ma-var-item" onClick={() => insertText(it.insert)}>
                  <code>{it.label}</code>
                  <span>{it.desc}</span>
                  {(() => {
                    const k = live ? liveKey(it.insert) : null
                    // Own keys only: `in` walks the prototype, where `constructor` lives.
                    if (!k || !live || !Object.prototype.hasOwnProperty.call(live, k)) return null
                    const v = live[k]
                    return v === ''
                      ? <em className="ma-var-live ma-var-live--empty">empty</em>
                      : <em className="ma-var-live">{v}</em>
                  })()}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
