// LichInstallFields — the Lich path + Ruby path pair for ONE non-default Lich
// install (DESIGN §56.7.1): a game's install in Lich Setup, or a character's
// own in Edit Profile. The default install keeps its own fuller editor
// (LichSetupFields: Auto-detect, the Ruby-version advisory).
//
// Controlled, like LichSetupFields: `value` in, `onChange(next)` out. A blank
// Ruby is allowed and means "the Ruby of the next layer down", so it shows
// that Ruby as its placeholder and gets no ✓/✕. The ✓/✕ is the same debounced
// existence check LichSetupFields runs (only the *AlreadyValid flags, never
// `probeDesktop`). Hosts wrap it in `.login-form` for the field styling.

import { useEffect, useState } from 'react'
import { type LichInstall, IS_WINDOWS } from '../lichSettings'

const RUBY_FILE_LABEL = IS_WINDOWS ? 'ruby.exe' : 'ruby'

// The ✓/✕ slot is always there, empty when there is nothing to say, so a
// blank field lines up with a checked one (UX #2).
function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === true)  return <span className="path-status-icon path-status-icon--valid">✓</span>
  if (ok === false) return <span className="path-status-icon path-status-icon--invalid" title="No file at this path">✕</span>
  return <span className="path-status-icon" aria-hidden="true" />
}

interface Props {
  value: LichInstall
  onChange: (next: LichInstall) => void
  /** The Ruby a blank Ruby path falls back to, shown as its placeholder. */
  inheritedRuby: string
  disabled?: boolean
}

export default function LichInstallFields({ value, onChange, inheritedRuby, disabled = false }: Props) {
  const { lichPath, rubyPath } = value
  const [exists, setExists] = useState<{ ruby: boolean; lich: boolean } | null>(null)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      window.api.discoverLichPaths(rubyPath || inheritedRuby, lichPath)
        .then(r => { if (!cancelled) setExists({ ruby: r.rubyAlreadyValid, lich: r.lichAlreadyValid }) })
        .catch(() => { if (!cancelled) setExists(null) })
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [rubyPath, lichPath, inheritedRuby])

  const lichOk = lichPath.trim() ? exists?.lich ?? null : null
  const rubyOk = rubyPath.trim() ? exists?.ruby ?? null : null

  return (
    <>
      <label>
        Lich path (lich.rbw)
        <div className="path-input-row">
          <input
            type="text"
            value={lichPath}
            onChange={e => onChange({ ...value, lichPath: e.target.value })}
            disabled={disabled}
            placeholder="Choose this install's lich.rbw"
          />
          <button
            type="button"
            className="btn-browse"
            disabled={disabled}
            onClick={async () => {
              const p = await window.api.browseFile([{ name: 'Lich Script', extensions: ['rbw', 'rb'] }])
              if (p) onChange({ ...value, lichPath: p })
            }}
          >Browse…</button>
          <StatusIcon ok={lichOk} />
        </div>
      </label>
      <label>
        {`Ruby path (${RUBY_FILE_LABEL})`}
        <div className="path-input-row">
          <input
            type="text"
            value={rubyPath}
            onChange={e => onChange({ ...value, rubyPath: e.target.value })}
            disabled={disabled}
            placeholder={inheritedRuby ? `Blank uses ${inheritedRuby}` : 'Blank uses the default Ruby'}
            title="Leave blank to use the Ruby of the install this one replaces"
          />
          <button
            type="button"
            className="btn-browse"
            disabled={disabled}
            onClick={async () => {
              const p = await window.api.browseFile(
                IS_WINDOWS
                  ? [{ name: 'Ruby Executable', extensions: ['exe'] }]
                  : [{ name: 'All Files', extensions: ['*'] }]
              )
              if (p) onChange({ ...value, rubyPath: p })
            }}
          >Browse…</button>
          <StatusIcon ok={rubyOk} />
        </div>
      </label>
    </>
  )
}
