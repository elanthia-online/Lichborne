// ContactPopover — the card that opens when you click a contact's name in the
// game text: tag + name in the template's colours, guild · circle, last seen
// (+ room), the F34 Encounters / Time Encountered counters, notes, and an
// "Edit contact" button.
//
// Pure display over one `Contact` + its `ContactTemplate`. GameWindow mounts it
// from `contactPopover` state, resolving the contact from the LIVE `contacts`
// list at render time — so the presence stats it shows are fresh, unlike the
// render-keyed copy the text rows paint from. Portaled to `document.body` at a
// fixed position (`.cpop`, contact-popover.css — z 500 is deliberate: it only
// ever opens over the game area), clamped into the viewport before first paint
// (flips above the click if it would run off the bottom); outside `mousedown`
// or Escape closes it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Contact, ContactTemplate } from '../contacts'
import { formatLastSeen, formatDuration } from '../contacts'
import '../styles/contact-popover.css'

interface Props {
  contact: Contact
  template: ContactTemplate | null
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
}

export default function ContactPopover({ contact, template, x, y, onClose, onEdit }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // Clamp to viewport after first render
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const MARGIN = 8
    // Below the click, or above it when it would run off the bottom; then clamp
    // BOTH axes into the window (B332). The flip alone had no floor, so a click
    // near the top of a short window put the card's top edge off-screen. The CSS
    // max-height guarantees the box fits, so the clamp always has room.
    const top = y + 4 + height > vh - MARGIN ? y - height - 4 : y + 4
    setPos({
      left: Math.max(MARGIN, Math.min(x, vw - width - MARGIN)),
      top:  Math.max(MARGIN, Math.min(top, vh - height - MARGIN)),
    })
  }, [x, y])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      // preventDefault so a dialog's Esc handler (useEscapeClose) leaves the key alone.
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const guild  = contact.guild && contact.guild !== 'Unknown' ? contact.guild : null
  const circle = contact.circle ? `Circle ${contact.circle}` : null
  const subtitle = [guild, circle].filter(Boolean).join(' · ')

  const popover = (
    <div ref={ref} className="cpop" style={{ left: pos.left, top: pos.top }}>
      <div className="cpop-header">
        <div className="cpop-name-line">
          {template?.tagText && (
            <span className="cpop-tag" style={{ color: template.tagColor,
              ...(template.tagBgColor && template.tagBgColor !== 'transparent'
                ? { backgroundColor: template.tagBgColor } : {}) }}>
              {template.tagText}{' '}
            </span>
          )}
          <span
            className="cpop-name"
            style={{ color: template?.textColor ?? 'var(--text-primary)',
              ...(template?.bold ? { fontWeight: 'bold' } : {}) }}
          >
            {contact.name}
          </span>
        </div>
        <button className="cpop-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
      </div>

      {subtitle && <div className="cpop-subtitle">{subtitle}</div>}

      <div className="cpop-lastseen">
        {'Last seen: '}
        {contact.lastSeen
          ? <>{formatLastSeen(contact.lastSeen)}{contact.lastRoom && <span className="cpop-room"> — {contact.lastRoom}</span>}</>
          : 'never'}
      </div>

      {/* F34 (v0.8.6): mirror the ContactsPanel stats here so a glance
          at the in-game popover surfaces the same Encounters / Time
          Encountered counters without the user having to open the full
          Contacts panel. Always shown — even at zero — so the feature is
          discoverable for fresh contacts. formatDuration renders 0ms as
          a dash for visual quiet. */}
      <div className="cpop-stats">
        <span>Encounters: <strong>{contact.encounterCount ?? 0}</strong></span>
        <span>Time Encountered: <strong>{formatDuration(contact.timeSpentMs ?? 0)}</strong></span>
      </div>

      {contact.notes && (
        <>
          <div className="cpop-divider" />
          <div className="cpop-notes">{contact.notes}</div>
        </>
      )}

      <div className="cpop-actions">
        <button className="cpop-edit-btn" onClick={onEdit}>Edit contact</button>
      </div>
    </div>
  )

  return createPortal(popover, document.body)
}
