// The Overview's universal input bar (v0.19.0, Sekmeht).
//
// Type at ONE character without leaving the dashboard, or broadcast to all of
// them — QuickSend's model, but persistent and sitting under the cards you are
// already watching.
//
// This reverses the original "cards are strictly read-only" decision. What it
// does NOT reverse is why the cards themselves stay read-only: the input lives in
// one place, so a card is still a thing you read, and there is exactly one field
// on screen that can send text. Thirty cards with thirty inputs would be thirty
// places to mistype into the wrong character.

import { useEffect, useRef, useState } from 'react'
import { useRoster } from '../../RosterContext'
import {
  useOverviewTarget, setOverviewTarget,
  overviewInputHistory, OVERVIEW_INPUT_HISTORY_MAX,
} from '../../overviewStore'
import { loadCommandHistorySettings, shouldRememberCommand } from '../../commandHistorySettings'

/** Sentinel for "every connected character". */
const ALL = '__all__'

interface Props {
  /** The character Session view is on. See the follow effect below. */
  activeCharacterId: string | null
}

export default function OverviewInputBar({ activeCharacterId }: Props) {
  // `myRoster`, not a hand-rolled `roster.filter(r => r.ownerWindowId ===
  // windowId)`: `windowId` is null until the window-info round-trip lands, and
  // that filter yields NOTHING against null — the bar would render as nothing at
  // all rather than degrade. RosterContext already answers this question, and
  // falls back to the whole roster while the id is unknown.
  const { myRoster } = useRoster()
  // The target is SHARED state now (overviewStore): a card click aims at that
  // character (and, B320, makes it the active tab too), clicking empty space
  // widens back to everyone, and the view button does the same — so the bar can
  // no longer own it privately. `null` === all.
  const targetId = useOverviewTarget()
  const target = targetId ?? ALL
  const setTarget = (v: string) => setOverviewTarget(v === ALL ? null : v)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Command history for THIS bar (Binu: "there is no command history to go
  // through in overview mode").
  //
  // Deliberately the BAR's own history, not the target character's. This one
  // control can be aimed at any character or broadcast to all of them, so
  // "recall the last thing sent" is the only question with an unambiguous
  // answer — walking a per-character history would change what ↑ gives you
  // depending on a dropdown, and mean nothing at all while targeting All.
  //
  // In-memory and per window: it is a scratch surface, not a character's record,
  // so it deliberately does not ride `state:` into any profile. Each character's
  // own persisted history is untouched — a command sent from here still lands in
  // the TARGET's history, because it goes through that character's
  // `dispatchUserText`.
  //
  // Newest first, matching the game bar, so index 0 is the last thing sent.
  //
  // B303: the ARRAY lives in overviewStore, not a ref here — this bar is rendered
  // `{open && …}` so it unmounts on every Session⇄Overview flip, and a component
  // ref made the history per-VISIT (toggle out to check something, come back, ↑
  // recalls nothing) when the design says per-WINDOW. The browse INDEX and the
  // stashed draft stay component-local on purpose: re-entering the view at the
  // live line with an empty draft is correct.
  const idxRef = useRef(-1)
  const draftRef = useRef('')

  // Only characters THIS window owns. The Overview shows this window's cards, so
  // offering to type at a character whose card isn't here would be a surprise —
  // and cross-window sending already has a home in Quick Send.
  const mine = myRoster
  const connected = mine.filter(r => r.connected)

  // A picked character can DISCONNECT while you are typing. Say so rather than
  // falling back to the broadcast: silently PROMOTING a one-character command to
  // "everybody" is the worst possible failure here (QuickSend learned this).
  const picked = target === ALL ? null : connected.find(r => r.characterId === target)
  const lostTarget = target !== ALL && !picked
  const targets = target === ALL ? connected : (picked ? [picked] : [])

  // Type-anywhere, mirroring F60 in the game window: a printable key with no
  // modifier focuses this bar. In the Overview the game's own command bar is
  // covered and deliberately unreachable, so without this there is nothing to
  // type into until you find the field with the mouse.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented) return
      if (e.key.length !== 1) return
      const el = document.activeElement as HTMLElement | null
      // A focused field keeps its own keystrokes — including a <select>, which
      // types-to-match natively.
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      // Then WHERE the focus is, which the tag check alone does not cover. The
      // app bar sits ABOVE this overlay (z 70 vs 65), so Settings, Automations
      // and the rest are one click away while the dashboard is up — and a modal
      // holding focus on a plain <button> passes the check above. Stealing the
      // key would then yank the caret out of the modal into a field behind it.
      // GameWindow's F60 guard does this job with `anyModalOpenRef`, which is
      // per-session state an app-level bar cannot reach; an allowlist of
      // LOCATION gets there without it, and stays correct for whatever modal
      // surface is added next.
      if (el && el !== document.body && !el.closest('.ov-shell')) return
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // FOLLOW the active character (Sekmeht). Switching tabs from the Overview —
  // Ctrl+1..9, Ctrl+Tab, or clicking a tab in the app bar, all of which run
  // through the same `setActive` — retargets this bar at that character. A card
  // click goes the other way (B320: it sets the target AND calls `setActive`), so
  // the active tab and the character you are about to type at are ONE selection
  // whichever end you pick it from. Under All characters every connected card
  // and tab is highlighted instead, since a send reaches all of them.
  //
  // Only on a CHANGE, never on mount: the ref is seeded with the value it has at
  // mount precisely so the first render is NOT treated as a switch. That keeps
  // "All characters" as the opening state (Sekmeht: "by default All characters is
  // perfect") — the bar is remounted each time the view opens, so every visit
  // starts on All until you actually pick a tab. This is the INVERSE of pitfall
  // #12, where seeding a ref with a real value hides the first change; here
  // hiding it is the whole point, so the seeding is deliberate rather than the
  // footgun that pitfall warns about.
  //
  // A null previous value is not a switch either — that is the roster resolving,
  // not a choice.
  const lastActiveRef = useRef(activeCharacterId)
  useEffect(() => {
    const prev = lastActiveRef.current
    lastActiveRef.current = activeCharacterId
    if (prev == null || activeCharacterId == null || prev === activeCharacterId) return
    setTarget(activeCharacterId)
  }, [activeCharacterId])

  function send(e: React.FormEvent) {
    e.preventDefault()
    const cmd = text.trim()
    if (!cmd || targets.length === 0) return
    // One per target. Main forwards each to the window that owns that character,
    // whose GameWindow runs it through `dispatchUserText` — so it echoes, logs,
    // resolves aliases, and a `/command` is handled by Lichborne rather than sent
    // to the game.
    for (const t of targets) window.api.sendUserText(t.sessionId, cmd)
    // Same gate as the game bar, so the app-wide minimum length means the same
    // thing on both, and a consecutive repeat does not stack.
    if (shouldRememberCommand(cmd, loadCommandHistorySettings().minLength)
        && overviewInputHistory[0] !== cmd) {
      // In place — the array is shared module state (B303), so this window's
      // next visit sees it. The cap matters more now that it lives indefinitely.
      overviewInputHistory.unshift(cmd)
      if (overviewInputHistory.length > OVERVIEW_INPUT_HISTORY_MAX) {
        overviewInputHistory.length = OVERVIEW_INPUT_HISTORY_MAX
      }
    }
    // Enter always returns you to the live line, stored or not.
    idxRef.current = -1
    draftRef.current = ''
    setText('')
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // B349: keys during IME composition belong to the input method (Esc
    // cancels the candidate, ↑/↓ choose one) — never clear or browse history.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setText('')
      idxRef.current = -1
      draftRef.current = ''
      inputRef.current?.blur()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const h = overviewInputHistory
      // Empty history is a NO-OP, never a wipe of what is typed.
      if (h.length === 0) return
      // Entering from the live line stashes the draft, so ↓ back to the bottom
      // restores it (the shell model the game bar follows).
      if (idxRef.current === -1) draftRef.current = text
      const next = Math.min(idxRef.current + 1, h.length - 1)
      idxRef.current = next
      setText(h[next] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Clamped at -1. Without it, presses past the bottom accumulate negative
      // counts and you have to press ↑ that many times to climb back — B120,
      // which Binu reported against the game bar; no reason to ship it twice.
      const next = Math.max(-1, idxRef.current - 1)
      idxRef.current = next
      setText(next === -1 ? draftRef.current : (overviewInputHistory[next] ?? ''))
    }
  }

  if (mine.length === 0) return null

  const noneConnected = connected.length === 0
  // With one character there is nothing to choose — "All" would be that
  // character under a second name (UX standard #1, the QuickSend precedent).
  const single = connected.length === 1
  // B336: says WHO receives it. It read a bare "Send" for one character, and
  // "Send to all 1 connected characters" under All with one connected.
  const sendTitle =
    targets.length === 1 ? `Send to ${targets[0].character}`
    : targets.length > 1 ? `Send to all ${targets.length} connected characters`
    : lostTarget ? 'That character is offline — pick another target'
    : 'No connected characters to send to'

  return (
    <form className="ov-inputbar" onSubmit={send}>
      <label className="ov-inputbar-to">
        <span className="ov-inputbar-label">to</span>
        {single ? (
          <span className="ov-inputbar-single" title="The only connected character">
            {connected[0].character}
          </span>
        ) : (
          <select
            className={`ov-inputbar-target${target === ALL ? ' ov-inputbar-target--all' : ''}`}
            value={target}
            onChange={e => setTarget(e.target.value)}
            title="Which character receives what you type"
          >
            {/* The count makes the broadcast honest — "All" alone does not tell
                you how many sockets are about to get this. */}
            <option value={ALL}>All characters ({connected.length})</option>
            {mine.map(r => (
              <option key={r.characterId} value={r.characterId} disabled={!r.connected}>
                {r.character}{r.connected ? '' : ' (offline)'}
              </option>
            ))}
          </select>
        )}
      </label>

      {/* The WRAPPER carries the border, fill and focus ring — the game command
          bar's structure (`.cmd-input-wrap` > `.command-input`), which this bar
          shares rules with in game.css rather than restating. Styling the input
          directly would have looked close but never identical, and would drift
          the first time the game bar was retuned. */}
      <div className="ov-inputbar-wrap">
        <input
          ref={inputRef}
          className="ov-inputbar-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={noneConnected ? 'No connected characters' : 'Type a command…'}
          disabled={noneConnected}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <button
        type="submit"
        className="ov-inputbar-send"
        disabled={!text.trim() || targets.length === 0}
        title={sendTitle}
      >Send</button>

      {lostTarget && (
        <span className="ov-inputbar-warn" title="That character disconnected — pick another target">
          target offline
        </span>
      )}
    </form>
  )
}
