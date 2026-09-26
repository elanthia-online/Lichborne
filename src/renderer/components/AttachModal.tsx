import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { backdropHandlers } from '../utils/backdropClose'
import { useEscapeClose } from '../hooks/useEscapeClose'
// Imported explicitly rather than relying on Launcher having pulled it in: the
// cne-* chrome this modal reuses lives there, including the `.cne-backdrop`
// z-index that keeps it above the + tab's Add Character modal.
import '../styles/character-notes-editor.css'

// Attach to an already-running detachable Lich session.
//
// The form is deliberately three fields — character, host, port — because the
// protocol needs nothing else: no account, no password, no Ruby/Lich paths.
// Headless Lich (`lich --login Char --headless PORT`) logged in by itself;
// this modal only says where its listener is. Reuses the cne-* modal
// vocabulary (CharacterNotesEditor) rather than minting a new style family.
//
// The character NAME still matters even though the protocol ignores it: it
// selects the per-character profile (layout, highlights, macros, theme) the
// tab loads, and — resolved in App.runAttach — the account recorded in that
// profile, so the roster and one-per-account conflict planning stay truthful
// for a character that genuinely holds its account's slot in game.
interface Props {
  onCancel: () => void
  // Resolves to null on success (App closes the modal) or an error sentence
  // to show inline (modal stays open, values intact, for a fix-and-retry).
  onAttach: (character: string, host: string, port: number) => Promise<string | null>
  // The modal's memory (both loaded by App.openAttachModal, both optional):
  // `initial` supplies the last successful attach — only its HOST is used as
  // a default (see the state notes below). `known` maps lowercased character
  // names to their profile-saved targets, so typing a name that has attached
  // before autofills its host/port.
  initial?: { character: string; host: string; port: number } | null
  known?: Record<string, { host: string; port: number }>
}

export default function AttachModal({ onCancel, onAttach, initial = null, known = {} }: Props) {
  // THE NAME ALWAYS STARTS EMPTY. It used to prefill from the last successful
  // attach, which was actively harmful: this modal exists to attach a
  // character that has no tile yet (a tile with a saved target attaches from
  // its own Connect button), so the overwhelmingly common case is a DIFFERENT
  // character than last time. Prefilled, a player who changed only the port
  // re-attached under the previous character's name — which succeeds, because
  // the protocol neither sends nor checks a name — mislabelling the tab,
  // overwriting that character's saved target, replacing its session record,
  // and producing no second tile. Reported as "only one of my attached
  // accounts shows a tile" (Kahlen).
  const [character, setCharacter] = useState('')
  // Host DOES prefill: it is stable across sessions (nearly always loopback,
  // or the same remote box every time), and getting it wrong fails loudly
  // rather than silently attaching to the wrong session.
  const [host, setHost] = useState(initial?.host ?? '127.0.0.1')
  // Port does NOT prefill from the last attach — each headless Lich listens on
  // its own port, so last time's port belongs to a different character. It
  // fills in from the saved target once a known name is typed (below).
  const [port, setPort] = useState('8001')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // True while host/port reflect a saved target rather than hand-typed values
  // — drives the "saved target" hint under the fields.
  const [autofilled, setAutofilled] = useState(false)

  // Name → saved-target autofill. Deliberately overwrite-on-match: the name
  // is typed first in practice, and a match means "this character has a known
  // listener" — the strongest signal available. Hand-edits AFTER the match
  // stick (editing host/port doesn't re-trigger this; only the name does).
  useEffect(() => {
    const t = known[character.trim().toLowerCase()]
    if (t) {
      setHost(t.host)
      setPort(String(t.port))
      setAutofilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- known is load-once per open
  }, [character])

  // Esc to cancel, through the shared topmost-dialog hook (B341). Mid-attach it
  // does nothing, like the disabled ✕ — CONSUMED rather than `enabled: false`,
  // which would let the key fall through and close the + window this is
  // usually opened from.
  useEscapeClose(() => { if (!busy) onCancel() })

  const titleId = useId()
  const portNum = Number(port)
  // Why Attach is disabled, or '' when it isn't — the button's tooltip, so a
  // greyed button says what it is waiting for (B407).
  const invalidReason =
    character.trim().length === 0 ? 'Enter the character that Lich session is logged in as'
    : host.trim().length === 0 ? 'Enter the host Lich is listening on'
    : !(Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535) ? 'Enter a port from 1 to 65535'
    : ''
  const valid = invalidReason === ''

  async function handleAttach() {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const err = await onAttach(character.trim(), host.trim(), portNum)
      if (err !== null) setError(err)
      // On success App unmounts us — no local close, so a slow unmount can't
      // flash the form back to idle first.
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    // The cne-* chrome, reused unchanged. `.cne-backdrop` itself now sits above
    // the + modal (see character-notes-editor.css), so no attach-only override.
    <div className="cne-backdrop" {...backdropHandlers(() => onCancel(), !busy)}>
      <div
        className="cne-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={e => {
          // B389: Enter in any of the three single-line fields attaches.
          // handleAttach itself refuses while invalid or busy.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) {
            e.preventDefault()
            void handleAttach()
          }
        }}
      >
        <div className="cne-header">
          <span className="cne-title" id={titleId}>Attach to a running Lich</span>
          <button type="button" className="ui-close" onClick={onCancel} disabled={busy} title="Close" aria-label="Close">✕</button>
        </div>

        <div className="cne-body">
          <p className="cne-intro">
            Connects this tab to a Lich session that is <em>already running and
            logged in</em> — started attachably, e.g.{' '}
            <code>lich --login Char --headless 8001</code>. Closing the tab
            detaches: the character stays in game and scripts keep running.
            Type <code>exit</code> in the tab if you actually want to log out.
          </p>

          <label className="cne-label">
            Character
            <input
              value={character}
              onChange={e => setCharacter(e.target.value)}
              disabled={busy}
              className="cne-input"
              placeholder="Who is logged in on that Lich session"
              autoFocus
            />
            {/* The protocol carries no character name, so this label is taken
                on trust — and a wrong one silently mislabels the tab and the
                profile it loads. Say which session it must match. */}
            <span className="cne-field-hint">
              Must match the character that Lich session is logged in as —
              the one you passed to <code>--login</code>.
            </span>
          </label>

          <div className="cne-row">
            <label className="cne-label">
              Host
              <input
                value={host}
                onChange={e => { setHost(e.target.value); setAutofilled(false) }}
                disabled={busy}
                className="cne-input"
                placeholder="127.0.0.1"
              />
            </label>
            <label className="cne-label cne-label--circle">
              Port
              <input
                type="number"
                value={port}
                onChange={e => { setPort(e.target.value); setAutofilled(false) }}
                min={1}
                max={65535}
                disabled={busy}
                className="cne-input"
                placeholder="8001"
              />
            </label>
          </div>

          {autofilled && (
            <p className="cne-note">
              Using a saved target — edit freely, it updates on the next successful attach.
            </p>
          )}

          {error && (
            // B324: `--accent-danger` is defined nowhere, so this was always the
            // fixed #d66 fallback; `.cne-error` uses the theme's --color-danger.
            <p className="cne-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="cne-footer">
          <button type="button" className="ui-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          {/* B345's stable-label shape (Attach → Attaching…), so the button
              never resizes mid-attach. */}
          <button
            type="button"
            className="ui-btn ui-btn--primary ui-btn--stable"
            onClick={handleAttach}
            disabled={busy || !valid}
            title={busy ? undefined : invalidReason || undefined}
          >
            <span className={`ui-btn-label${busy ? ' ui-btn-label--off' : ''}`}>Attach</span>
            <span className={`ui-btn-label${busy ? '' : ' ui-btn-label--off'}`} aria-hidden={!busy}>Attaching…</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
