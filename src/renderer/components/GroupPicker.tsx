// GroupPicker — the "+ Group" chip control every rule editor uses to assign a
// rule's `groupIds` (Highlights / Triggers / Macros / Aliases / Mutes /
// Substitutes / Contacts). Assigned groups render as removable colour chips;
// the add menu lists assigned-then-available.
//
// Controlled: it owns no rule state, just calls `onChange` with the next id
// list. Reads the group catalogue from `useGroups()`, so it can only mount
// under a GroupsProvider (per-session, inside GameWindow). The menu is
// portaled to `document.body` at a fixed position under the button
// (`.gp-menu`, groups.css) so a scrolling editor pane can't clip it; an
// outside `mousedown` closes it.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGroups } from './GroupsContext'

interface Props {
  groupIds:  string[]
  onChange:  (ids: string[]) => void
}

export default function GroupPicker({ groupIds, onChange }: Props) {
  const { groups } = useGroups()
  const [open, setOpen] = useState(false)
  // Either `top` (opens down) or `bottom` (opens up) is set, never both.
  const [pos,  setPos]  = useState<{ top?: number; bottom?: number; left: number; maxHeight?: number }>({ top: 0, left: 0 })
  const btnRef  = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    // Esc closes the menu and stops there. preventDefault tells the dialog's
    // Esc handler (useEscapeClose) the key was used, so the dialog stays open.
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // B331 (pitfall #109): the menu's length is the user's group count, and it
  // used to open DOWN with no clamp, so a low button or a long list ran off the
  // bottom. Open toward whichever side has more room, cap the height to that
  // room (.gp-menu scrolls), and keep the left edge on screen. MIN_W is the
  // CSS min-width, which is as close as we can get before the menu renders.
  function handleOpen() {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const MARGIN = 8, GAP = 4, MIN_W = 140
      const vh = window.innerHeight
      const below = vh - rect.bottom - GAP - MARGIN
      const above = rect.top - GAP - MARGIN
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - MIN_W - MARGIN))
      setPos(below >= above
        ? { top: rect.bottom + GAP, left, maxHeight: below }
        : { bottom: vh - rect.top + GAP, left, maxHeight: above })
    }
    setOpen(v => !v)
  }

  function toggle(id: string) {
    if (groupIds.includes(id)) onChange(groupIds.filter(g => g !== id))
    else                       onChange([...groupIds, id])
  }

  const assigned = groups.filter(g => groupIds.includes(g.id))
  const available = groups.filter(g => !groupIds.includes(g.id))

  return (
    <div className="gp-wrap">
      {assigned.map(g => (
        <button
          key={g.id}
          className="gp-chip"
          style={{ '--chip-color': g.color } as React.CSSProperties}
          onClick={() => toggle(g.id)}
          title={`Remove from ${g.name}`}
          type="button"
        >
          <span className="gp-chip-dot" />
          {g.name}
          <span className="gp-chip-x">×</span>
        </button>
      ))}
      <button ref={btnRef} className="gp-add-btn" type="button" onClick={handleOpen}>
        + Group
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="ui-menu gp-menu"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight }}
        >
          {groups.length === 0 && (
            <div className="gp-menu-empty">No groups defined yet.</div>
          )}
          {assigned.length > 0 && (
            <>
              {assigned.map(g => (
                <button key={g.id} className="ui-menu-item gp-menu-item gp-menu-item--assigned" type="button" onClick={() => { toggle(g.id); setOpen(false) }}>
                  <span className="gp-menu-dot" style={{ background: g.color }} />
                  {g.name}
                  <span className="gp-menu-check">✓</span>
                </button>
              ))}
              {available.length > 0 && <div className="gp-menu-divider" />}
            </>
          )}
          {available.map(g => (
            <button key={g.id} className="ui-menu-item gp-menu-item" type="button" onClick={() => { toggle(g.id); setOpen(false) }}>
              <span className="gp-menu-dot" style={{ background: g.color }} />
              {g.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
