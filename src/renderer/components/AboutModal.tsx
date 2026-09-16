import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DEVELOPERS, CONTRIBUTORS, TESTERS, REPO_URL, DISCORD_URL, AI_NOTICE_URL, ABOUT_BLURB } from '../credits'
import { parseMidi, createMidiPlayer, loadArrayBuffer, type MidiPlayback } from '../midiPlayer'
import { useEscapeClose } from '../hooks/useEscapeClose'
import '../styles/about.css'

// Optional easter-egg MIDI: drop a .mid at src/renderer/public/about-theme.mid
// and the mute toggle lights up. It plays through the OS synth via Web MIDI when
// available (the Microsoft GS Wavetable Synth — sounds like Windows Media Player),
// falling back to our own oscillator synth otherwise (midiPlayer.ts — a .mid
// CANNOT go in an <audio> element; Chromium has no built-in MIDI synth). MUTED by
// default (Sekmeht); the toggle un-mutes / re-mutes. Absent file → the XHR fails →
// the toggle stays hidden. Do NOT bundle copyrighted music in a public release.
const ABOUT_MIDI_SRC = 'about-theme.mid'

// Help → About Lichborne. Replaced the native Win32 message box (v0.17.0) so it
// picks up the active theme (Principle #4 — eyeballed on light themes) and can
// style the credit lists. Opened via the menu-action bridge ('about' →
// runAppActionRef in App). Portaled to <body> at z 2010 — above every modal,
// since the native menu can open it over any of them (B341). Version is fetched
// live so it always matches package.json — never hardcode it.
export default function AboutModal({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState('')
  useEffect(() => { window.api.getAppVersion().then(setVersion).catch(() => {}) }, [])

  // Build identity, for SUPPORT. The three platforms differ in ways that change
  // the answer to a bug report — macOS ships unsigned with no auto-update, a
  // Linux AppImage resolves its own paths differently — so "v0.18.3" alone is
  // not actionable. Rendered NEXT TO the version rather than tucked away,
  // because the whole point is that it travels in a screenshot.
  function platformLabel(): string {
    const os =
      window.api.platform === 'win32'  ? 'Windows' :
      window.api.platform === 'darwin' ? 'macOS'   :
      window.api.platform === 'linux'  ? (window.api.isAppImage ? 'Linux AppImage' : 'Linux') :
      window.api.platform
    return `${os} ${window.api.arch}`
  }
  // B341: the shared hook, not a document listener of its own — that one never
  // stopped the key, so a single Esc closed About AND the dialog under it.
  useEscapeClose(onClose)

  // Background MIDI: load + parse the bundled file on mount (the toggle only
  // appears once it's ready), start MUTED. The synth's AudioContext spins up on
  // the first un-mute (a user gesture), then mute()/start() toggle silence.
  const playerRef = useRef<MidiPlayback | null>(null)
  const [muted, setMuted] = useState(true)
  const [midiReady, setMidiReady] = useState(false)
  useEffect(() => {
    let live = true
    loadArrayBuffer(ABOUT_MIDI_SRC)
      .then(buf => {
        if (!live) return
        const seq = parseMidi(buf)
        if (!seq.notes.length && !seq.events.length) return
        return createMidiPlayer(seq).then(p => {
          if (live) { playerRef.current = p; setMidiReady(true) } else p.dispose()
        })
      })
      .catch(() => { /* no file / unparseable → toggle stays hidden */ })
    return () => { live = false; playerRef.current?.dispose(); playerRef.current = null }
  }, [])
  const toggleMusic = () => {
    // Side effect OUTSIDE the state updater (updaters must be pure — StrictMode
    // double-invokes them). `muted` is current since this closure re-creates each render.
    const next = !muted
    setMuted(next)
    if (next) playerRef.current?.mute(); else void playerRef.current?.start()
  }

  return createPortal(
    <div className="about-backdrop" onMouseDown={onClose}>
      <div
        className="about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="About Lichborne"
        onMouseDown={e => e.stopPropagation()}
      >
        {midiReady && (
          <button
            className="about-mute"
            onClick={toggleMusic}
            title={muted ? 'Play music' : 'Mute music'}
            aria-label={muted ? 'Play music' : 'Mute music'}
          >{muted ? '🔇' : '🔊'}</button>
        )}
        <button className="about-close" onClick={onClose} title="Close" aria-label="Close">✕</button>

        <div className="about-head">
          <span className="about-wordmark">Lichborne</span>
          {version && <span className="about-version">v{version} · {platformLabel()}</span>}
        </div>

        <div className="about-body">
          <p className="about-blurb">{ABOUT_BLURB}</p>
          <p className="about-thanks">Thank you all!</p>
          <p className="about-created">Created by {DEVELOPERS.join(' & ')}</p>

          <div className="about-cred-group">
            <div className="about-cred-label">Contributors</div>
            <div className="about-names">
              {CONTRIBUTORS.map(n => <span key={n} className="about-name">{n}</span>)}
            </div>
          </div>

          <div className="about-cred-group">
            <div className="about-cred-label">Testers</div>
            <div className="about-names">
              {TESTERS.map(n => <span key={n} className="about-name about-name--tester">{n}</span>)}
            </div>
          </div>

          <div className="about-links">
            <a
              className="about-link"
              href={REPO_URL}
              onClick={e => { e.preventDefault(); window.api.openUrl(REPO_URL) }}
            >github.com/SekmehtDR/Lichborne</a>
            <a
              className="about-link"
              href={DISCORD_URL}
              onClick={e => { e.preventDefault(); window.api.openUrl(DISCORD_URL) }}
            >Join our Discord</a>
            <a
              className="about-link"
              href={AI_NOTICE_URL}
              onClick={e => { e.preventDefault(); window.api.openUrl(AI_NOTICE_URL) }}
            >Lichborne's AI Notice</a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
