// F49 (v0.15.2): Ctrl+F search over the LIVE story scrollback — find text in
// what's on screen without the Session Log modal detour. A pure view over the
// `lines` data model: matches come from the joined segment text (the text the
// user actually sees — the WYSIWYG/parser-output rule, pitfall #89), and
// navigation jumps the virtualized list via the onJump callback. GameWindow
// owns the virtuoso ref + pin state (pitfall #68: no new scroll mechanism here
// — only scrollToIndex jumps routed through the owner, who un-pins first).
//
// Match indices are positions in the CURRENT `lines` array. While the user is
// scrolled up — the normal searching state — the buffer never trims (pitfall
// #81's un-pinned rule), so indices stay stable across incoming batches; the
// cursor is clamped defensively anyway.
//
// Navigation is scrollback-oriented: a new query lands on the MOST RECENT
// match (players search backward from "now"), Enter walks OLDER, Shift+Enter
// walks NEWER, both wrapping. Esc closes.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { TextLine } from '../../shared/types'

const MIN_QUERY = 2 // 1-char queries match nearly every line — noise, not search

export interface ScrollbackSearchProps {
  lines: TextLine[]
  // Jump the story view to `index` (position in lines) and mark line `id` as
  // the active hit. GameWindow un-pins + scrollToIndex({align:'center'}).
  onJump: (index: number, lineId: number) => void
  onClose: () => void
  // Clear the active-hit row marker (the query stopped matching anything —
  // without this the previous hit's outline lingered; v0.15.2 bug check).
  onClearHit?: () => void
}

export function ScrollbackSearch({ lines, onJump, onClose, onClearHit }: ScrollbackSearchProps) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0) // index into `matches`
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (q.length < MIN_QUERY) return [] as { index: number; id: number }[]
    const out: { index: number; id: number }[] = []
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].segments.map(s => s.text).join('')
      if (text.toLowerCase().includes(q)) out.push({ index: i, id: lines[i].id })
    }
    return out
  }, [lines, q])

  // New query → land on the most recent match. Keyed on q, deliberately NOT
  // on `matches`: the memo recomputes every incoming batch (lines identity
  // changes), and re-jumping then would yank the view while the user reads.
  useEffect(() => {
    if (matches.length === 0) { onClearHit?.(); return }
    const idx = matches.length - 1
    setCursor(idx)
    onJump(matches[idx].index, matches[idx].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const cur = Math.min(cursor, Math.max(0, matches.length - 1)) // clamp vs trims

  function go(dir: -1 | 1) {
    if (matches.length === 0) return
    const next = (cur + dir + matches.length) % matches.length
    setCursor(next)
    onJump(matches[next].index, matches[next].id)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // B349: Enter/Esc mid-composition commit/cancel the IME candidate.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? 1 : -1) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="sb-search" onMouseDown={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="sb-search-input"
        value={query}
        placeholder="Find in scrollback…"
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        autoComplete="off"
        spellCheck={false}
      />
      <span className="sb-search-count">
        {matches.length > 0 ? `${cur + 1}/${matches.length}` : q.length >= MIN_QUERY ? 'no matches' : ''}
      </span>
      <button type="button" className="sb-search-btn" title="Older match (Enter)" aria-label="Older match" onClick={() => go(-1)}>▲</button>
      <button type="button" className="sb-search-btn" title="Newer match (Shift+Enter)" aria-label="Newer match" onClick={() => go(1)}>▼</button>
      <button type="button" className="sb-search-btn" title="Close search (Esc)" aria-label="Close search" onClick={onClose}>✕</button>
    </div>
  )
}
