// UpdatePill — the "a new version is available" control (v0.20.1).
//
// Replaced a full-width ribbon at the top of the window. The ribbon sat in the
// page flow, so appearing pushed the whole app down, and it changed HEIGHT
// between its states (a button in "available" and "ready", text alone while
// downloading), so the app jumped at every step. A pill in a fixed-height strip
// — the app bar, or the launcher's update strip — cannot move anything, and its
// label stays the same in every phase so it doesn't change width either.
//
// Owns only its open/closed state. App owns the update lifecycle (phase,
// progress, the notes link from main, the error) and the actions, including the
// "characters are connected" confirmation before a restart.
//
// Card layout: a tone-coloured badge and a plain-words title ("Ready to
// install"), the version against the one you're running, a release-notes link,
// a line saying what happens next, and ONE primary button whose label follows
// the phase. While downloading, that button is itself the progress bar, so no
// row sits empty in the other phases. Sizing follows pitfall #103: the hint
// reserves two lines and the primary button has a fixed min-width, so the card
// holds one size through every phase. Sized in em so it follows its host.

import { useEffect, useId, useRef, useState } from 'react'
import '../styles/update-pill.css'

export type UpdatePhase = 'available' | 'downloading' | 'ready' | 'failed'

interface Props {
  phase: UpdatePhase
  version: string
  /** Whole percent while downloading; null before the first report. */
  percent: number | null
  /** The release page on GitHub; null if main didn't supply one. */
  notesUrl: string | null
  /** Why the download failed. */
  error: string | null
  onDownload: () => void
  onInstall: () => void
  /** Hide the pill until the next launch or check (a finished download brings it back). */
  onLater: () => void
}

// Plain arrows rather than emoji-classified glyphs, so they take the theme
// colour on every platform (pitfall #125).
const GLYPH: Record<UpdatePhase, string> = {
  available: '↓',
  downloading: '↓',
  ready: '↻',
  failed: '!',
}

// The card's headline — what is happening, in two or three words.
const TITLE: Record<UpdatePhase, string> = {
  available: 'Update available',
  downloading: 'Downloading update',
  ready: 'Ready to install',
  failed: 'Download failed',
}

// The quieter line under the version: what happens next, or why it failed.
function hintLine(phase: UpdatePhase, error: string | null): string {
  switch (phase) {
    case 'available':   return 'Downloads in the background — you can keep playing.'
    case 'downloading': return 'You can keep playing. You choose when to restart.'
    case 'ready':       return 'Lichborne closes, installs the update and opens again.'
    case 'failed':      return error ? `Reason: ${error}` : 'Check your connection and try again.'
  }
}

// No live percent in the tooltip: a native tooltip whose text changes while
// you hover it blinks out and waits the hover delay again (pitfall #145). The
// percent lives in the pill's bar and the card.
function pillTitle(phase: UpdatePhase, version: string): string {
  switch (phase) {
    case 'available':   return `Lichborne ${version} is available — click for details`
    case 'downloading': return `Downloading ${version} — click to see progress`
    case 'ready':       return `${version} is ready — click to restart and install`
    case 'failed':      return `The update download failed — click to try again`
  }
}

export default function UpdatePill({ phase, version, percent, notesUrl, error, onDownload, onInstall, onLater }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cardId = useId()
  // The running version, for "· you have 0.20.1". Fetched when the card opens.
  const [current, setCurrent] = useState<string | null>(null)
  useEffect(() => {
    if (!open || current) return
    let alive = true
    window.api.getAppVersion().then(v => { if (alive) setCurrent(v) }).catch(() => {})
    return () => { alive = false }
  }, [open, current])

  // Outside click and Esc close the card. preventDefault marks Esc consumed so
  // a dialog underneath doesn't close with it (B341).
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const downloading = phase === 'downloading'
  // The bar shows the real percent once main reports one; before that it
  // sweeps (indeterminate) so a slow start doesn't read as stuck.
  const barStyle = percent != null ? { transform: `scaleX(${percent / 100})` } : undefined

  return (
    <div
      className={`upd-wrap upd-wrap--${phase}`}
      ref={ref}
      // Space on the pill or a card button: press it ourselves. Left alone, the
      // type-anywhere handler (F60) moves a printable key on a plain button into
      // the command bar (pitfall #165, the B477 shape). Disabled buttons ignore
      // .click(), so the in-progress Download stays inert.
      onKeyDown={e => {
        if (e.key !== ' ') return
        const t = e.target
        if (t instanceof HTMLButtonElement) { e.preventDefault(); t.click() }
      }}
    >
      <button
        type="button"
        className="upd-pill"
        onClick={() => setOpen(o => !o)}
        title={pillTitle(phase, version)}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
      >
        <span className="upd-glyph" aria-hidden="true">{GLYPH[phase]}</span>
        <span className="upd-label">Update {version}</span>
        {downloading && (
          <span className={`upd-pill-bar${percent == null ? ' upd-bar--indeterminate' : ''}`} aria-hidden="true">
            <span className="upd-bar-fill" style={barStyle} />
          </span>
        )}
      </button>

      {open && (
        <div className="upd-card" id={cardId} role="dialog" aria-label="Lichborne update">
          <div className="upd-head">
            <span className="upd-badge" aria-hidden="true">{GLYPH[phase]}</span>
            <div className="upd-head-text">
              <div className="upd-title">{TITLE[phase]}</div>
              <div className="upd-version">
                Lichborne {version}
                {current && current !== version && <span className="upd-current"> · you have {current}</span>}
              </div>
              {notesUrl && (
                <button
                  type="button"
                  className="upd-notes"
                  onClick={() => window.api.openUrl(notesUrl)}
                  title="Opens the release notes on GitHub in your browser"
                >
                  What's new <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </div>

          {/* Two lines reserved and clamped, so a long error can't grow the
              card; the full message is in the tooltip. */}
          <div className="upd-hint" title={phase === 'failed' && error ? error : undefined}>
            {hintLine(phase, error)}
          </div>

          <div className="upd-actions">
            <button type="button" className="upd-btn upd-btn--quiet" onClick={() => { setOpen(false); onLater() }}
                    title="Hide this until the next launch. A finished download shows it again, and Help → Check for updates brings it back.">
              Later
            </button>
            {/* ONE primary button whose label follows the phase, at a fixed
                width — and while downloading it IS the progress bar, so there
                is no separate row that sits empty the rest of the time. */}
            <button
              type="button"
              className={`upd-btn upd-btn--primary${downloading ? ' upd-btn--progress' : ''}${downloading && percent == null ? ' upd-bar--indeterminate' : ''}`}
              disabled={downloading}
              title={downloading ? 'The download is in progress' : undefined}
              onClick={phase === 'ready' ? () => { setOpen(false); onInstall() } : onDownload}
            >
              {downloading && <span className="upd-bar-fill" style={barStyle} aria-hidden="true" />}
              <span className="upd-btn-label">
                {phase === 'available' ? 'Download'
                  : phase === 'downloading' ? (percent == null ? 'Starting…' : `Downloading ${percent}%`)
                  : phase === 'ready' ? 'Restart & install'
                  : 'Try again'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
