// LichInstallFields — the Ruby path + Lich path pair for ONE non-default Lich
// install (DESIGN §56.7.1): a game's install in Lich Setup, or a character's
// own in Edit Profile. The default install keeps its own fuller editor
// (LichSetupFields: Auto-detect, the Ruby-version advisory).
//
// Controlled, like LichSetupFields: `value` in, `onChange(next)` out. A blank
// Ruby is allowed and means "the Ruby of the next layer down", so it shows
// that Ruby as its placeholder and gets no ✓/✕. The ✓/✕ is the same debounced
// existence check LichSetupFields runs (only the *AlreadyValid flags, never
// `probeDesktop`). Hosts wrap it in `.login-form` for the field styling.
// Ruby comes FIRST, as in LichSetupFields' default install just above it, and
// a path of the wrong kind (pathKindProblem) gets a ✕ and a warning, with a
// one-click swap when the pair is reversed.

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

// Whether a path is the wrong KIND of file for its field. Lich is a Ruby
// script (lich.rbw / .rb); on Windows, Ruby is an .exe. The order of these
// fields used to differ from the default install's editor right above them
// (Lich first here, Ruby first there), so a pair entered by habit came out
// swapped. `swapped` = each path belongs in the other field.
export function pathKindProblem(lichPath: string, rubyPath: string):
  { message: string; lich: boolean; ruby: boolean; swapped: boolean } | null {
  const l = lichPath.trim().toLowerCase()
  const r = rubyPath.trim().toLowerCase()
  const isScript = (p: string) => /\.rbw?$/.test(p)
  const isExe = (p: string) => /\.exe$/.test(p)
  const lichBad = !!l && !isScript(l)
  const rubyBad = !!r && (IS_WINDOWS ? !isExe(r) : isScript(r))
  if (!lichBad && !rubyBad) return null
  const swapped = !!l && !!r && isScript(r) && !isScript(l)
  const message = swapped
    ? `These two look swapped: the Ruby path should be ${RUBY_FILE_LABEL}${IS_WINDOWS ? ' or rubyw.exe' : ''}, and the Lich path lich.rbw.`
    : lichBad
      ? 'The Lich path should be lich.rbw.'
      : `The Ruby path should be ${RUBY_FILE_LABEL}${IS_WINDOWS ? ' or rubyw.exe' : ''}.`
  return { message, lich: lichBad, ruby: rubyBad, swapped }
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

  const kindProblem = pathKindProblem(lichPath, rubyPath)
  // A path of the wrong kind is never ✓, even when the file exists: the
  // existence check alone passed a swapped pair (lich.rbw as Ruby, rubyw.exe
  // as Lich), which then failed to launch with a bare `spawn EFTYPE`.
  const lichOk = lichPath.trim() ? (kindProblem?.lich ? false : exists?.lich ?? null) : null
  const rubyOk = rubyPath.trim() ? (kindProblem?.ruby ? false : exists?.ruby ?? null) : null

  return (
    <>
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
      {kindProblem && (
        <div className="lich-discovery-status lich-discovery-status--warn" role="alert">
          <span className="lich-discovery-icon">⚠</span>
          <span>{kindProblem.message}</span>
          {kindProblem.swapped && (
            <button
              type="button"
              className="ui-btn"
              disabled={disabled}
              onClick={() => onChange({ lichPath: rubyPath, rubyPath: lichPath })}
            >Swap them</button>
          )}
        </div>
      )}
    </>
  )
}
