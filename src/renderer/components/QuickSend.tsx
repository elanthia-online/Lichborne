import { useEffect, useId, useRef, useState } from 'react'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { type CharacterId } from '../SessionsContext'
import { useRoster } from '../RosterContext'
import '../styles/quick-send.css'

interface Props {
  onClose: () => void
  // Prefill text — App.tsx snapshots the active command bar's value at the
  // moment Ctrl+Shift+Enter fires so a half-typed command can be retargeted
  // to another character without retyping. Empty string when there was
  // nothing in the source bar.
  initialCommand?: string
}

// v0.18.0 (Sekmeht): QuickSend is MULTI-TARGET and defaults to ALL connected
// characters. The old model was a single-select <select> whose default was
// "the next character after the active one" — which made the common case
// (tell the whole team to do something) a two-step, and made broadcasting an
// easily-missed option at the bottom of a dropdown.
//
// The model now: a checkbox list of every connected character plus an "All
// characters" row that is CHECKED on open. Ticking an individual character
// clears All; ticking All clears the individuals. So "All" is not a stored
// sentinel in the selection — it's simply the state where no individual is
// selected, which keeps one source of truth (`selected`) and makes the two
// mutually exclusive by construction rather than by bookkeeping.

// §13.8 — floating command input that targets any connected character without
// requiring a tab switch. Triggered by Ctrl+Shift+Enter from the App-level
// keydown handler. Cancels on Esc, closes after Send.
//
// Multi-window (v0.11.0): targets come from the cross-window ROSTER, not this
// window's local SessionsContext — so a command typed in one window can be sent
// to a character living in a DIFFERENT window (the whole reason decoupled
// windows stay in one process). Sending routes by sessionId through main, which
// owns every socket regardless of which window renders the character.
export default function QuickSend({ onClose, initialCommand = '' }: Props) {
  const { roster, windowId } = useRoster()

  // Every character we can actually send to (main's send handler no-ops on a
  // dead SessionId, so disconnected ones are not targets).
  const connected = roster.filter(s => s.connected)

  // Explicitly-picked characters. EMPTY = "All characters" (see the note above)
  // — so the default open state is a broadcast, exactly as requested.
  const [selected, setSelected] = useState<Set<CharacterId>>(() => new Set())
  const [command, setCommand] = useState(initialCommand)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  const allMode = selected.size === 0
  // Who actually receives the command right now.
  const targets = allMode ? connected : connected.filter(s => selected.has(s.characterId))
  // A picked character can DISCONNECT while the modal is open (link loss, or
  // another character logging in on that account). The roster drops its row,
  // but `selected` still holds its id — so we're not in all-mode and nothing
  // is targeted: every checkbox reads unchecked and Send is greyed with no
  // stated reason. Say it out loud rather than pruning the set, because
  // pruning to empty would silently PROMOTE the user to a broadcast.
  const lostTargets = !allMode && targets.length === 0

  // With only ONE character connected there is nothing to choose: "All
  // characters" would just be that character under a second name, and a lone
  // checkbox that can't meaningfully be unticked is noise. Show the character
  // as the target and drop the picker (UX standard #1 — every control on
  // screen should mean something). It's already the target either way, since
  // all-mode over a one-character roster resolves to exactly it.
  const singleTarget = connected.length === 1

  function toggleOne(id: CharacterId) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next   // emptying the set falls back to All — the two can't both be on
    })
  }

  // Clicking "All characters" always RESULTS in all-mode (clearing individual
  // picks); it never toggles you into an empty no-target state.
  function selectAll() { setSelected(new Set()) }

  // Focus and select-all on open so a prefilled value can be either edited
  // mid-text (immediate typing replaces it) or kept as-is (just hit Enter).
  // DEFERRED to the next frame: a bare focus() in the mount effect can lose the
  // race when the modal opens — focus may still be on the element that triggered
  // the open (an AppBar button, the prompt ">" marker, a menu item), or the modal
  // isn't the committed focus target yet, leaving the input unfocused so the user
  // can't immediately type (Morress). rAF runs after paint/commit so the input is
  // a reliable focus target; the cleanup cancels it if we unmount first.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const cmd = command.trim()
    if (!cmd || targets.length === 0) return
    // Fire-and-forget per target; routing is by sessionId through main, which
    // reaches a character regardless of which window renders it.
    //
    // v0.19.0: `sendUserText`, NOT the raw `sendCommand` this used to call. Main
    // now forwards to the OWNING window, whose GameWindow runs the text through
    // its normal input path. Two bugs die with that change:
    //
    //  • The command ARRIVED INVISIBLY (Sekmeht: a Quick Send `wave` showed only
    //    the game's reply on the receiving character — no `>wave`). A raw socket
    //    write skips the renderer-side echo entirely; this is B199's signature.
    //  • A `/command` typed here was forwarded to DRAGONREALMS AS LITERAL TEXT,
    //    because the raw path never reaches the slash intercept at the top of
    //    `dispatchUserText`. Slash commands are client commands and must never
    //    leave the client.
    //
    // It also gains alias resolution, `;` splitting, command history and the
    // session log — so a Quick Send is now indistinguishable from having typed
    // it in that character's own bar, which is the whole point.
    for (const s of targets) window.api.sendUserText(s.sessionId, cmd)
    onClose()
  }

  // B341: Esc through the shared hook, which closes only the TOPMOST dialog.
  // The form's own Esc handler used to close this AND let the key reach a
  // dialog underneath. Off while there is nothing on screen (the empty-roster
  // null render below), so Esc isn't swallowed by an invisible dialog.
  useEscapeClose(onClose, { enabled: roster.length > 0 })

  if (roster.length === 0) return null

  const noConnected = connected.length === 0

  return (
    <div className="quick-send-backdrop" {...backdropHandlers(() => onClose())}>
      <form
        className="quick-send-card"
        onSubmit={handleSend}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="quick-send-header">
          <span className="quick-send-title" id={titleId}>Quick Send</span>
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        <div className="quick-send-body">
          <div className="quick-send-targets">
            <div className="quick-send-targets-label">Send to</div>
            {noConnected && <div className="quick-send-empty">No connected characters</div>}

            {/* Single connected character — it IS the target; no picker. */}
            {singleTarget && (
              <div className="quick-send-target-row quick-send-target-row--on quick-send-target-row--solo">
                <span className="quick-send-target-name">{connected[0].character}</span>
                <span className="quick-send-target-meta">
                  {connected[0].game}
                  {windowId != null && connected[0].ownerWindowId !== windowId ? ' · other window' : ''}
                </span>
              </div>
            )}

            {!noConnected && !singleTarget && (
              <>
                <label className={`quick-send-target-row quick-send-target-row--all${allMode ? ' quick-send-target-row--on' : ''}`}>
                  <input type="checkbox" checked={allMode} onChange={selectAll} />
                  <span className="quick-send-target-name">All characters</span>
                  <span className="quick-send-target-meta">{connected.length}</span>
                </label>

                <div className="quick-send-target-list">
                  {connected.map(s => {
                    const on = selected.has(s.characterId)
                    return (
                      <label
                        key={s.characterId}
                        className={`quick-send-target-row${on ? ' quick-send-target-row--on' : ''}`}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleOne(s.characterId)} />
                        <span className="quick-send-target-name">{s.character}</span>
                        <span className="quick-send-target-meta">
                          {s.game}
                          {/* Flag characters living in another window — the send
                              still works (one process), the user just knows. */}
                          {windowId != null && s.ownerWindowId !== windowId ? ' · other window' : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            className="quick-send-input"
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="Type a command..."
            autoComplete="off"
          />
          <div className="quick-send-actions">
            <span className={`quick-send-hint${lostTargets ? ' quick-send-hint--warn' : ''}`}>
              {lostTargets
                ? 'The characters you picked are no longer connected — pick another.'
                : targets.length > 0
                ? `Sending to ${
                    targets.length === 1 ? targets[0].character
                    : allMode ? `all ${targets.length}`
                    : `${targets.length} characters`
                  } · Enter to send · Esc to cancel`
                : 'Enter to send · Esc to cancel'}
            </span>
            <button
              type="submit"
              className="ui-btn ui-btn--primary"
              disabled={targets.length === 0 || !command.trim()}
              title={targets.length === 0 ? 'No connected character to send to' : !command.trim() ? 'Type a command first' : undefined}
            >
              Send ↵
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
