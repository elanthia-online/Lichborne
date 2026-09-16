// Stream panel — the generic text-stream view (thoughts, combat, arrivals,
// any discovered or custom stream) hosted in a zone tab or a floating window.
//
// Renders each `TextLine` through `TextLineRow` with the per-session
// highlight/contact rules pulled from context (`useHighlights` /
// `useContacts`), so a stream paints exactly like the main scroll. Owns its
// OWN scroll pin — separate from GameWindow's Virtuoso machinery — with two
// load-bearing rules: `pinnedRef` changes ONLY from real scroll events, never
// from render-time geometry (B203), and a `ResizeObserver` re-asserts the
// bottom on container resizes via a bare `scrollTop` write (the pitfall #68c
// observer rule). Right-click builds the stream context menu through
// `buildTextMenu` — the SAME builder the main game text uses (B381/B391), so a
// stream offers Modify Text ▸ / Trigger ▸ / Show in Log exactly like the game
// window, then Timestamps, then Clear and Close.
//
// `memo`'d (B172): every prop must stay referentially stable across unrelated
// GameWindow renders, which is why `onClear` / `onToggleTimestamp` /
// `onCloseStream` take the `streamId` as an argument instead of receiving a
// per-render closure.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TextLine } from '../../../shared/types'
import { useContacts } from '../../ContactsContext'
import { useHighlights } from '../../HighlightsContext'
import { newHighlight, type HighlightRule } from '../../highlights'
import { newMute, type MuteRule } from '../../mutes'
import { newSubstitute, type SubstituteRule } from '../../substitutes'
import { TextLineRow } from '../TextLineRow'
import ContextMenu, { type CtxItem } from '../ContextMenu'

// ── The one text context-menu shape (B391) ───────────────────────────────────
// Every right-click menu over text — the main game window (GameWindow), every
// stream panel (below), and by the same grouping the PanelFrame tab menu and
// the Debug panel — reads in ONE order:
//   content actions (Copy · Modify Text ▸ · Trigger ▸ · Show in Log)
//   ── view toggles (Timestamps)
//   ── Clear · Close   (Close always LAST)
// Empty groups are dropped, so there is never a leading, trailing or doubled
// divider. Before this each surface assembled its own list and they disagreed
// on where Clear and Close went and what they were called.

/** Joins non-empty groups with one divider between each — never two in a row,
 *  never a leading or trailing one. */
export function joinMenuGroups(groups: CtxItem[][]): CtxItem[] {
  const ne = groups.filter(g => g.length > 0)
  return ne.flatMap((g, i) => (i < ne.length - 1 ? [...g, { label: null }] : g))
}

/** The rule-editor openers a text menu can offer. Each is optional — a surface
 *  offers what its host wires and nothing else. */
export interface TextMenuActions {
  onHighlight?: (rule: HighlightRule, testText?: string) => void
  onTrigger?: (pattern: string) => void
  onMute?: (rule: MuteRule) => void
  onSubstitute?: (rule: SubstituteRule) => void
  onShowInLog?: (text: string) => void
}

/** Builds a text surface's context menu for the word / line under the pointer. */
export function buildTextMenu(
  at: { word: string | null; lineText: string | null },
  actions: TextMenuActions,
  view: { timestamps?: { shown: boolean; toggle: () => void }; clear?: () => void; close?: () => void },
): CtxItem[] {
  const { word, lineText } = at
  const { onHighlight, onTrigger, onMute, onSubstitute, onShowInLog } = actions
  const testText = lineText ?? undefined
  const hl: CtxItem[] = onHighlight ? [
    ...(word ? [{ label: `Highlight "${word}"`, onClick: () => onHighlight(newHighlight(word, 'match'), testText) }] : []),
    ...(lineText ? [{ label: 'Highlight this line', onClick: () => onHighlight(newHighlight(lineText, 'line'), testText) }] : []),
  ] : []
  // A word mute strips just that text (`match`); a line mute drops the line.
  const mu: CtxItem[] = onMute ? [
    ...(word ? [{ label: `Mute "${word}"`, onClick: () => onMute({ ...newMute(word, 'phrase'), scope: 'match' }) }] : []),
    ...(lineText ? [{ label: 'Mute this line', onClick: () => onMute({ ...newMute(lineText, 'phrase'), scope: 'line' }) }] : []),
  ] : []
  const sub: CtxItem[] = onSubstitute ? [
    ...(word ? [{ label: `Substitute "${word}"`, onClick: () => onSubstitute(newSubstitute(word, '')) }] : []),
    ...(lineText ? [{ label: 'Substitute this line', onClick: () => onSubstitute(newSubstitute(lineText, '')) }] : []),
  ] : []
  const tr: CtxItem[] = onTrigger ? [
    ...(word ? [{ label: `Trigger for "${word}"`, onClick: () => onTrigger(word) }] : []),
    ...(lineText ? [{ label: 'Trigger for this line', onClick: () => onTrigger(lineText) }] : []),
  ] : []
  // Two sibling submenus keep the root short: "Modify Text" changes how text
  // DISPLAYS (highlight / mute / substitute); "Trigger" builds automation off it.
  const modify = joinMenuGroups([hl, mu, sub])
  const content: CtxItem[] = [
    ...(modify.length ? [{ label: 'Modify Text', submenu: modify }] : []),
    ...(tr.length ? [{ label: 'Trigger', submenu: tr }] : []),
    ...(onShowInLog && lineText ? [{ label: 'Show in Log', onClick: () => onShowInLog(lineText) }] : []),
  ]
  const toggles: CtxItem[] = view.timestamps
    ? [{ label: view.timestamps.shown ? 'Hide timestamps' : 'Show timestamps', onClick: view.timestamps.toggle }]
    : []
  const end: CtxItem[] = [
    ...(view.clear ? [{ label: 'Clear', onClick: view.clear }] : []),
    ...(view.close ? [{ label: 'Close', onClick: view.close }] : []),
  ]
  return joinMenuGroups([content, toggles, end])
}

// B172: memoized — a GameWindow render no longer re-renders every stream
// panel; this panel re-renders only when ITS lines (or rules/contacts via
// context) change. For the memo to hold, every prop must be referentially
// stable across unrelated renders, which is why onClear/onToggleTimestamp
// take the streamId as an argument (the parent passes its STABLE
// clearStream/toggleStreamTimestamp callbacks straight through instead of
// minting `() => onClear(id)` closures per render — see PanelFrame's
// renderPanel).
interface Props {
  streamId: string
  lines: TextLine[]
  emptyMessage?: string
  onClear?: (streamId: string) => void
  onHighlight?: (rule: HighlightRule, testText?: string) => void
  onTrigger?: (pattern: string) => void
  // B381: mutes and substitutes apply to EVERY stream by default, so a stream
  // offers them from its own text just like the game window does; Show in Log
  // searches the Session Log for the line. All three are GameWindow's stable
  // useCallbacks passed straight through (the memo note above) — they take the
  // rule / text as an argument, so no per-render closure is ever minted.
  onMute?: (rule: MuteRule) => void
  onSubstitute?: (rule: SubstituteRule) => void
  onShowInLog?: (text: string) => void
  onSendCommand?: (cmd: string) => void
  autoLinkUrls?: boolean
  webLinkSafety?: boolean
  showTimestamp?: boolean
  onToggleTimestamp?: (streamId: string) => void
  onCloseStream?: (streamId: string) => void
  // Close this stream — the menu equivalent of the × on its tab (Sekmeht:
  // "I can do this by clicking the x by log, so why not have the right-click
  // option"). Takes the streamId for the same reason onClear does: a stable
  // identity, no per-render closure (see the memo note above).
}

export default memo(function StreamPanel({ streamId, lines, emptyMessage, onClear, onHighlight, onTrigger, onMute, onSubstitute, onShowInLog, onSendCommand, autoLinkUrls = true, webLinkSafety = true, showTimestamp, onToggleTimestamp, onCloseStream }: Props) {
  const { contacts, templates, nameRegex, onContactClick } = useContacts()
  const { matchRules, lineRules } = useHighlights()
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; word: string | null; lineText: string | null } | null>(null)

  // B203: unpinning happens ONLY here, from real scroll events — never from
  // render-time geometry reads. The old render-time "recheck" re-derived
  // pinned from raw geometry every render, so anything that changed the
  // container's shape WITHOUT a user scroll silently unpinned the panel: a
  // floating window's 0-height mount frame (dist = scrollHeight ≥ 40 → false),
  // a drag-resize shrinking clientHeight, a layout-mode switch. Symptom:
  // "thoughts fills, then scrolls off screen — until I scroll to the bottom
  // once." That's the pitfall-#71/B191 class (layout signals must not drive
  // user-intent state); resizes now RE-SNAP instead (observer below).
  function handleScroll() {
    const el = scrollRef.current
    // Hidden or unmeasurable panels can't receive USER scrolls — any scroll
    // signal there is layout churn (B191's document.hidden guard, plus the
    // 0-height mount frame).
    if (!el || document.hidden || el.clientHeight === 0) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = dist <= 40
  }

  function getWordAtPoint(x: number, y: number): string | null {
    const range = document.caretRangeFromPoint(x, y)
    if (!range) return null
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent ?? ''
    const offset = range.startOffset
    let start = offset, end = offset
    while (start > 0 && /[\w']/.test(text[start - 1])) start--
    while (end < text.length && /[\w']/.test(text[end])) end++
    const word = text.slice(start, end).trim()
    return word.length >= 2 ? word : null
  }

  function getLineTextAtPoint(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)
    return el?.closest('.text-line')?.textContent?.trim() || null
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    const hasExtras = onHighlight || onTrigger || onMute || onSubstitute || onShowInLog
    const word = hasExtras ? getWordAtPoint(e.clientX, e.clientY) : null
    const lineText = hasExtras ? getLineTextAtPoint(e.clientX, e.clientY) : null
    setCtxMenu({ x: e.clientX, y: e.clientY, word, lineText })
  }

  useLayoutEffect(() => {
    if (pinnedRef.current) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [lines])

  // B203 companion: container resizes (floating-window drag, zone divider,
  // window maximize, the mount frame getting its real height) re-assert the
  // bottom when pinned — a PASSIVE bare scrollTop write, never a re-render
  // (the pitfall #68c observer rule, StreamPanel-sized). A scrolled-up reader
  // is never touched (pinned false → no write).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current && el.clientHeight > 0) el.scrollTop = el.scrollHeight - el.clientHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="stream-panel" ref={scrollRef} onScroll={handleScroll} onContextMenu={handleContextMenu}>
      {/* B385: the shared quiet-but-readable empty line (--text-muted, em-sized
          off this panel's font) — every stream now passes one, built-ins too. */}
      {lines.length === 0 && emptyMessage && (
        <div className="ui-empty">{emptyMessage}</div>
      )}
      {lines.map(line => (
        <TextLineRow
          key={line.id}
          line={line}
          matchRules={matchRules}
          lineRules={lineRules}
          contacts={contacts}
          templates={templates}
          nameRegex={nameRegex}
          onContactClick={onContactClick}
          onSendCommand={onSendCommand}
          autoLinkUrls={autoLinkUrls}
          webLinkSafety={webLinkSafety}
          showTimestamp={showTimestamp}
        />
      ))}
      <div ref={bottomRef} />
      {/* B381/B391: the shared text-menu shape. Close is always offered here
          when the host supports it — the floating window's own right-click
          Close never reaches this menu (it preventDefaults first), so a stream
          that draws its own menu has to offer it itself. These closures exist
          only while the menu is open; nothing memoized receives them. */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={buildTextMenu(ctxMenu, { onHighlight, onTrigger, onMute, onSubstitute, onShowInLog }, {
            timestamps: onToggleTimestamp ? { shown: !!showTimestamp, toggle: () => onToggleTimestamp(streamId) } : undefined,
            clear: onClear ? () => onClear(streamId) : undefined,
            close: onCloseStream ? () => onCloseStream(streamId) : undefined,
          })}
        />
      )}
    </div>
  )
})
