// DebugPanel — the diagnostics surface: three tabs over buffers GameWindow
// owns — Fires (highlight/trigger fire log, with an "Edit →" that opens the
// source rule via `onGotoFireRule`), Events (parsed GameEvents as JSON), and
// Raw XML — plus Copy all, Export CSV… (F45), Clear, and a right-click menu.
//
// Pure view: every buffer and every clear comes in as a prop. It is hosted
// TWO ways from one component (v0.11.5): docked as the bottom strip of the
// game column (`resizable` — a drag handle, height persisted per character on
// the `debugPanelHeight` scopedKey, which rides `state.*` into YAML for free)
// or inside a PanelFrame zone / floating window (`debug-panel--fill`, no
// handle, `character` unused). Each tab keeps its own pinned-to-bottom scroll;
// the Events / Raw XML rows key off a rolling base offset so a buffer that
// trims from the front doesn't re-key every DOM node. Copy goes through
// `window.api.writeClipboard` — never `navigator.clipboard` (B18/B102). CSV
// export is RFC-4180 quoted AND formula-injection guarded, because game text
// is other-player-authored.

import { useEffect, useRef, useState } from 'react'
import type { GameEvent, FireLogEntry } from '../../shared/types'
import { scopedKey } from '../characterScope'
import '../styles/debug.css'
import ContextMenu from './ContextMenu'

interface Props {
  events: GameEvent[]
  onClear: () => void
  rawXmlLines: string[]
  onClearRawXml: () => void
  fireLog: FireLogEntry[]
  onClearFireLog: () => void
  // v0.8.2: open the source rule for edit in the Automations panel.
  // Wired to GameWindow.gotoFireRule.
  onGotoFireRule?: (kind: 'highlight' | 'trigger', ruleId: string) => void
  // v0.10.1: close the panel from its own toolbar (X) so the user doesn't
  // have to find the Debug button again to dismiss it. Docked strip only.
  onClose?: () => void
  // B391: close the Debug TAB when hosted in a PanelFrame (a zone tab or a
  // floating window). Offered in the right-click menu only — the tab strip
  // already carries its own ×, so no toolbar ✕ here. Without it a floating
  // Debug window had no Close at all: this panel's menu claims the right-click
  // before FloatingWindow's own Close menu can.
  onCloseTab?: () => void
  // v0.11.5: when docked as the bottom strip (GameWindow), the panel is
  // drag-resizable and its height persists per-character. When rendered inside
  // a panel zone (PanelFrame) it fills the zone instead — `resizable` is false
  // and `character` is unused.
  resizable?: boolean
  character?: string
}

const MIN_HEIGHT = 150
const DEFAULT_HEIGHT = 300
const maxHeight = () => Math.round(window.innerHeight * 0.7)

export default function DebugPanel({ events, onClear, rawXmlLines, onClearRawXml, fireLog, onClearFireLog, onGotoFireRule, onClose, onCloseTab, resizable = false, character = '' }: Props) {
  const [tab, setTab] = useState<'fires' | 'events' | 'rawxml'>('fires')

  // v0.11.5: drag-resizable height, persisted per-character. A scopedKey write
  // round-trips into the YAML state.* pipeline automatically (Principle #1), so
  // no profile-shape change is needed.
  const heightKey = scopedKey(character, 'debugPanelHeight')
  const [height, setHeight] = useState<number>(() => {
    const raw = localStorage.getItem(heightKey)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? Math.min(Math.max(n, MIN_HEIGHT), maxHeight()) : DEFAULT_HEIGHT
  })

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height
    const onMove = (ev: MouseEvent) => {
      // Panel is docked to the bottom of the game column, so dragging the top
      // handle UP (clientY decreases) grows the panel.
      const next = Math.min(Math.max(startHeight + (startY - ev.clientY), MIN_HEIGHT), maxHeight())
      setHeight(next)
    }
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const final = Math.min(Math.max(startHeight + (startY - ev.clientY), MIN_HEIGHT), maxHeight())
      localStorage.setItem(heightKey, String(final))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const eventsBottomRef = useRef<HTMLDivElement>(null)
  const eventsScrollRef = useRef<HTMLDivElement>(null)
  const eventsPinnedRef = useRef(true)

  const rawBottomRef = useRef<HTMLDivElement>(null)
  const rawScrollRef = useRef<HTMLDivElement>(null)
  const rawPinnedRef = useRef(true)

  const firesBottomRef = useRef<HTMLDivElement>(null)
  const firesScrollRef = useRef<HTMLDivElement>(null)
  const firesPinnedRef = useRef(true)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  // Stable keys for events: track how many items have been removed from the front
  // of the buffer so that key={base+i} stays consistent as the buffer rolls over.
  // Without this, index-based keys cause all 500 DOM nodes to update their content
  // when items are spliced from the front, making the view appear to scroll forward.
  const eventBaseRef   = useRef(0)
  const prevEventLenRef = useRef(0)
  if (events.length < prevEventLenRef.current) {
    eventBaseRef.current += prevEventLenRef.current - events.length
  }
  prevEventLenRef.current = events.length

  const rawBaseRef    = useRef(0)
  const prevRawLenRef = useRef(0)
  if (rawXmlLines.length < prevRawLenRef.current) {
    rawBaseRef.current += prevRawLenRef.current - rawXmlLines.length
  }
  prevRawLenRef.current = rawXmlLines.length

  function handleEventsScroll() {
    const el = eventsScrollRef.current
    if (!el) return
    eventsPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  function handleRawScroll() {
    const el = rawScrollRef.current
    if (!el) return
    rawPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  function handleFiresScroll() {
    const el = firesScrollRef.current
    if (!el) return
    firesPinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  useEffect(() => {
    if (eventsPinnedRef.current) eventsBottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [events])

  useEffect(() => {
    if (rawPinnedRef.current) rawBottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [rawXmlLines])

  useEffect(() => {
    if (firesPinnedRef.current) firesBottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [fireLog])

  // B12: scroll to bottom when switching tabs so first-open lands at latest content
  useEffect(() => {
    if (tab === 'events') eventsBottomRef.current?.scrollIntoView({ behavior: 'auto' })
    if (tab === 'rawxml') rawBottomRef.current?.scrollIntoView({ behavior: 'auto' })
    if (tab === 'fires')  firesBottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [tab])

  const activeOnClear = tab === 'events' ? onClear : tab === 'rawxml' ? onClearRawXml : onClearFireLog
  // B391: the right-click Close — the docked strip's ✕, or the hosting tab.
  const menuClose = onClose ?? onCloseTab

  // ── Export CSV (F45) — the ACTIVE tab's buffer, for offline analysis ──────
  // One file per export, schema per tab:
  //   fires:  timestamp,kind,stream,rule,matched,detail
  //   events: index,type,timestamp,data   (data = the event minus `type`, as
  //           JSON — the event union is heterogeneous, so a flat column set
  //           would either explode or lose fields; JSON keeps every field and
  //           analysis tools can json-parse the column)
  //   rawxml: index,line
  // CSV quoting: RFC-4180 — quote when needed, double internal quotes — PLUS
  // the OWASP formula-injection guard: Excel parses a field starting with
  // = + - @ (or tab) as a FORMULA on open (`=--- Lich: …` → #NAME?; and since
  // game text is other-player-authored, a crafted `=cmd|…` cell is a real
  // injection vector, not just cosmetic). Standard mitigation is a leading
  // single quote, which Excel renders as text. The quote is visible in the
  // data — the documented OWASP tradeoff; strip leading `'` when
  // post-processing programmatically.
  const csvField = (v: string) => {
    const guarded = /^[=+\-@\t]/.test(v) ? `'${v}` : v
    return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
  }
  const csvTs = (ms: number) => {
    const d = new Date(ms)
    const p = (n: number, w = 2) => String(n).padStart(w, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  }
  const [exportedTick, setExportedTick] = useState(false)

  async function handleExportCsv() {
    let rows: string[]
    if (tab === 'fires') {
      rows = ['timestamp,kind,stream,rule,matched,detail',
        ...fireLog.map(e => [csvTs(e.ts), e.kind, e.stream ?? '', e.name, e.matched, e.detail]
          .map(csvField).join(','))]
    } else if (tab === 'events') {
      rows = ['index,type,timestamp,data',
        ...events.map((e, i) => {
          const { type, ...rest } = e
          const ts = 'timestamp' in e && typeof e.timestamp === 'number' ? csvTs(e.timestamp) : ''
          return [String(i + 1), type, ts, JSON.stringify(rest)].map(csvField).join(',')
        })]
    } else {
      rows = ['index,line', ...rawXmlLines.map((l, i) => [String(i + 1), l.trimEnd()].map(csvField).join(','))]
    }
    if (rows.length <= 1) return  // header only — nothing to export
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    const who = character ? `${character.toLowerCase()}-` : ''
    const res = await window.api.saveTextFile({
      defaultName: `lichborne-debug-${tab}-${who}${stamp}.csv`,
      content: rows.join('\r\n') + '\r\n',
      filterName: 'CSV',
      extensions: ['csv'],
    })
    if (res.ok) {
      setExportedTick(true)
      setTimeout(() => setExportedTick(false), 2000)
    }
  }

  function handleCopy() {
    let text = ''
    if (tab === 'events') text = events.map(e => JSON.stringify(e)).join('\n')
    else if (tab === 'rawxml') text = rawXmlLines.map(l => l.trimEnd()).join('\n')
    else text = fireLog.map(e => `${new Date(e.ts).toLocaleTimeString()} [${e.kind}] ${e.name} | ${e.matched}${e.detail ? ' | ' + e.detail : ''}${e.stream ? ' | ' + e.stream : ''}`).join('\n')
    // v0.8.2: use the native Electron clipboard IPC, not navigator.clipboard.
    // The renderer's permission handler refuses navigator.clipboard.writeText
    // silently (same root cause as B18 — Electron's internal name doesn't
    // match a permission whitelist), so the old `navigator.clipboard.writeText`
    // here just did nothing on every click. window.api.writeClipboard routes
    // to main's `clipboard.writeText`, which has no such guard.
    window.api.writeClipboard(text)
  }

  return (
    <div className={`debug-panel${resizable ? '' : ' debug-panel--fill'}`}
      style={resizable ? { height } : undefined}>
      {resizable && (
        <div className="debug-resize-handle" onMouseDown={handleResizeStart}
          title="Drag to resize the debug panel" />
      )}
      <div className="debug-toolbar">
        <div className="debug-tabs">
          <button className={`debug-tab ${tab === 'fires' ? 'debug-tab--active' : ''}`} onClick={() => setTab('fires')}>
            Fires ({fireLog.length})
          </button>
          <button className={`debug-tab ${tab === 'events' ? 'debug-tab--active' : ''}`} onClick={() => setTab('events')}>
            Events ({events.length})
          </button>
          <button className={`debug-tab ${tab === 'rawxml' ? 'debug-tab--active' : ''}`} onClick={() => setTab('rawxml')}>
            Raw XML ({rawXmlLines.length})
          </button>
        </div>
        {/* B407: sentence case; "…" because Export opens a save dialog. */}
        <button className="debug-copy" onClick={handleCopy}
          title="Copy the active tab's contents to the clipboard">Copy all</button>
        <button className="debug-copy debug-export" onClick={handleExportCsv}
          title="Save the active tab's contents as a CSV file">
          {exportedTick ? 'Saved ✓' : 'Export CSV…'}</button>
        <button className="debug-clear" onClick={activeOnClear}
          title="Empty the active tab">Clear</button>
        {onClose && (
          <button className="debug-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        )}
      </div>

      {tab === 'fires' && (
        <div className="debug-scroll" ref={firesScrollRef} onScroll={handleFiresScroll}
          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}>
          {/* v0.8.2: column headers — match the row layout exactly so
              columns align. The Goto column is the same width as the row's
              → button. Sticky so headers stay pinned while the user scrolls
              through fire history. */}
          <div className="fire-log-header">
            <span className="fire-log-time">Time</span>
            <span className="fire-log-kind">Kind</span>
            <span className="fire-log-stream">Stream</span>
            <span className="fire-log-name">Rule</span>
            <span className="fire-log-matched">Matched text</span>
            <span className="fire-log-detail">Detail</span>
            <span className="fire-log-goto" aria-hidden>Goto</span>
          </div>
          {fireLog.length === 0 && (
            <div className="ui-empty">No fires yet. Highlights and triggers that match will appear here.</div>
          )}
          {fireLog.map(entry => (
            <div key={entry.id} className={`fire-log-entry fire-log-entry--${entry.kind}`}>
              <span className="fire-log-time">{new Date(entry.ts).toLocaleTimeString()}</span>
              <span className={`fire-log-kind fire-log-kind--${entry.kind}`}>{entry.kind}</span>
              <span className="fire-log-stream">{entry.stream ?? '—'}</span>
              <span className="fire-log-name" title={entry.name}>{entry.name}</span>
              <span className="fire-log-matched" title={entry.matched}>{entry.matched}</span>
              {entry.detail
                ? <span className="fire-log-detail" title={entry.detail}>{entry.detail}</span>
                : <span className="fire-log-detail" />}
              {/* v0.8.2: → GOTO button. Opens the source rule for edit in the
                  Automations panel (Highlights or Triggers tab depending on
                  kind). Disabled when ruleId is missing (older entries from
                  before this field existed). */}
              <button
                className="fire-log-goto"
                disabled={!entry.ruleId || !onGotoFireRule}
                title={entry.ruleId ? `Edit this ${entry.kind} rule in Automations` : 'No rule id on this entry'}
                onClick={() => entry.ruleId && onGotoFireRule?.(entry.kind, entry.ruleId)}
              >Edit →</button>
            </div>
          ))}
          <div ref={firesBottomRef} />
        </div>
      )}

      {tab === 'events' && (
        <div className="debug-scroll" ref={eventsScrollRef} onScroll={handleEventsScroll}
          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}>
          {/* v0.8.2: column headers matching the row layout. Type is the
              parsed GameEvent.type (e.g. "stream-text", "vital-update");
              Payload is the JSON-stringified rest of the event. */}
          <div className="debug-event-header">
            <span className="debug-type">Type</span>
            <span className="debug-body">Payload</span>
          </div>
          {/* B385: say so when there's nothing yet, instead of a blank pane. */}
          {events.length === 0 && (
            <div className="ui-empty">No events yet. Each parsed game event appears here as it arrives.</div>
          )}
          {events.map((evt, i) => (
            <div key={eventBaseRef.current + i} className={`debug-event debug-event--${evt.type}`}>
              <span className="debug-type">{evt.type}</span>
              <span className="debug-body">{JSON.stringify(evt)}</span>
            </div>
          ))}
          <div ref={eventsBottomRef} />
        </div>
      )}

      {tab === 'rawxml' && (
        <div className="debug-scroll" ref={rawScrollRef} onScroll={handleRawScroll}
          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}>
          <div className="rawxml-header">Raw XML stream</div>
          {rawXmlLines.length === 0 && (
            <div className="ui-empty">No raw XML yet. The game's unparsed stream appears here as it arrives.</div>
          )}
          {rawXmlLines.map((line, i) => (
            <div key={rawBaseRef.current + i} className="rawxml-line">
              <span className="rawxml-body">{line}</span>
            </div>
          ))}
          <div ref={rawBottomRef} />
        </div>
      )}

      {/* B391: the shared menu shape — content (Copy all), divider, then
          Clear and Close with Close LAST. Close is the toolbar ✕'s action when
          docked, or closes the Debug tab when hosted in a PanelFrame. */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)}
          items={[
            { label: 'Copy all', onClick: handleCopy },
            { label: null },
            { label: 'Clear', onClick: activeOnClear },
            ...(menuClose ? [{ label: 'Close', onClick: menuClose }] : []),
          ]}
        />
      )}
    </div>
  )
}
