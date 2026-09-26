import { useState, useEffect, useRef } from 'react'
import { useSessions, type CharacterId } from '../SessionsContext'
import CharacterTabBar, { type PendingTab } from './CharacterTabBar'
import SimuCoinButton from './SimuCoinButton'
import ViewToggle from './overview/ViewToggle'
import type { SimuCoinStatus } from '../../shared/types'
// The wordmark effect (v0.19.7) reuses the highlight/contact effect system —
// one resolver, one stylesheet. highlights.css is imported here because this
// bar is app-level chrome that renders before any panel has been opened;
// relying on a rule-editor panel to have pulled it in would be luck, not a
// dependency. Nothing outside highlights.css defines `.hl-fx-*`, so where the
// file lands in the bundle's cascade order cannot matter (pitfall #144).
import { paintBrandMark } from '../utils/brandMark'
import '../styles/highlights.css'
import '../styles/app-bar.css'

// Unified top app-bar (top-chrome redesign, Phase 2c). Replaces the bare
// character-tab row AND the per-session game-toolbar: one app-level row with
// the brand + a connection dot (active session) + the character tabs + the
// quick action buttons + Disconnect/Login. Reclaims a full chrome row.
//
// The action buttons are app-level, so they act on the ACTIVE session via the
// `lichborne:session-action` DOM event — the same bridge the native menu uses
// (the active GameWindow handles it, guarded on isActiveRef). No keyboard
// accelerators here (those live in App.tsx / the native menu).
//
// The per-button active-state glow (originally deferred) SHIPPED in v0.10.0's
// polish pass: GameWindow reports each overlay's open state up through
// `SessionStatus.panel*`, and this bar applies `btn-*--active` for the ACTIVE
// session — including the ⋯ More button when a hidden item is open. The
// per-session script palette stub was removed rather than built; build it
// fresh if wanted (CLAUDE.md, top-chrome section).

interface Props {
  onAdd: () => void
  onClose: (id: CharacterId) => void
  // One-click IN-PLACE reconnect of a disconnected tab — the tab keeps its
  // scrollback. Owned by App (needs the connect flow). Used by the tab
  // right-click menu (passed through to CharacterTabBar) AND, as of F108, by
  // this bar's own button when the active character is disconnected.
  onReconnect: (id: CharacterId) => void
  // Characters mid-reconnect — drives the per-tab "connecting" indicator.
  reconnectingIds: Set<CharacterId>
  // SimuCoin (F71) — app-level, per ACCOUNT. Owned by App (it has the launcher
  // account list + the check lifecycle); the bar just hosts the coin button,
  // which renders NOTHING when no account is opted in or offerable.
  simucoin: {
    accounts: string[]
    withPassword: Set<string>
    statuses: Record<string, SimuCoinStatus>
    busy: Set<string>
    // Resolves with the account outcome (see GameWindow). `quiet` suppresses
    // the per-account toast so the coin's multi-account collect can summarise
    // the batch in one toast rather than stacking one per account.
    run: (account: string, claim: boolean, quiet?: boolean) => Promise<SimuCoinStatus | null>
  }
  // The Team Login pill (v0.20.0): shown while a team login runs in the
  // background, or finished with a failure. Owned by App, which owns the run.
  teamPill?: React.ReactNode
  // …and the team's not-yet-connected characters as placeholder tabs.
  pendingTabs?: PendingTab[]
  onPendingClick?: () => void
}

function dispatchSessionAction(action: string) {
  document.dispatchEvent(new CustomEvent('lichborne:session-action', { detail: { action } }))
}

export default function AppBar({ onAdd, onClose, onReconnect, reconnectingIds, simucoin, teamPill, pendingTabs, onPendingClick }: Props) {
  const { sessions, activeId } = useSessions()
  const active = sessions.find(s => s.characterId === activeId)
  const st = active?.status
  const connected = st?.connected ?? false

  // THREE-STATE CONNECTION DOT (Sekmeht). The dot only ever described the
  // ACTIVE tab, so a character that dropped in a background tab was invisible
  // until you happened to click it — the dot sat green while someone was
  // logged out. Green now means "everything is fine", not merely "this tab is
  // fine":
  //   red    — the tab you are looking at is disconnected (unchanged)
  //   YELLOW — this tab is connected, but another open tab is NOT: go look
  //   green  — this tab and every other open tab are connected
  //
  // A tab mid-RECONNECT is deliberately not counted: it is already being dealt
  // with, and a warning you can't act on is noise (UX standard #1 — every glyph
  // on screen should mean "look at me").
  //
  // Scope is THIS WINDOW's tabs — the sessions the tab bar beside this dot
  // actually shows, so the warning always has something you can click to. A
  // decoupled window carries its own app bar and warns about its own tabs.
  const othersDown = sessions.filter(s =>
    s.characterId !== activeId && !s.status.connected && !reconnectingIds?.has(s.characterId))
  const dotState: 'on' | 'warn' | 'off' = !connected ? 'off' : othersDown.length > 0 ? 'warn' : 'on'
  const dotTitle =
    dotState === 'off' ? 'Disconnected'
    : dotState === 'warn'
      ? `Connected — but ${othersDown.map(s => s.character).join(', ')} ${othersDown.length === 1 ? 'is' : 'are'} disconnected`
      : 'Connected'

  // "More ⋯" overflow dropdown for the less-frequently-used buttons (static
  // grouping — no width measurement; declutters the bar and keeps it usable on
  // narrow windows). The app-bar sits at the top of the window, so the menu
  // opens downward with no vertical clip; it right-aligns so it can't spill off
  // the right edge.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!moreOpen) return
    function onDown(e: MouseEvent) { if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false) }
    // preventDefault: consumed here, so the Esc-to-close hook doesn't also
    // close a dialog underneath (B341).
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); setMoreOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [moreOpen])
  // The ⋯ button hints when any hidden panel (Debug/Logs/Contacts/Theme) is open.
  const moreActive = !!(st?.panelDebug || st?.panelLogs || st?.panelContacts || st?.panelTheme)

  // The wordmark wears the ACTIVE character's `settings.brandEffect`, so the
  // bar quietly says which character you are looking at (v0.19.7). Painted by
  // the shared builder the Settings preview also calls, so the two cannot
  // disagree; 'none' and the no-session empty state both render the original
  // two-tone markup unchanged.
  const brand = paintBrandMark(st?.brandEffect)

  return (
    <div className="app-bar">
      <span className="app-bar-brand" title={dotTitle}>
        {/* Wordmark wrapped in ONE element so the flex `gap` on .app-bar-brand
            spaces the dot away from the word, NOT "Lich" from "borne". */}
        <span
          className={brand.className ? `app-bar-wordmark ${brand.className}` : 'app-bar-wordmark'}
          style={brand.style}
        >{brand.content}</span>
        <span className={`app-bar-status-dot app-bar-status-dot--${dotState}`}
              role="status"
              aria-label={dotTitle} />
      </span>

      {/* Views (v0.19.0): sits with the brand, NOT in `.app-bar-actions`, and is
          deliberately not `.app-bar-collapsible` — a top-level navigation
          control must never fold into the ⋯ overflow menu (same reasoning as
          Disconnect/Login). It subscribes to the Overview store itself so a
          digest re-renders this control alone, never the tab strip beside it. */}
      <ViewToggle />

      <CharacterTabBar onAdd={onAdd} onClose={onClose} onReconnect={onReconnect} reconnectingIds={reconnectingIds}
        pendingTabs={pendingTabs} onPendingClick={onPendingClick} />

      <div className="app-bar-actions">
        {/* Team Login pill — beside the tabs it is filling in, and before the
            panel buttons so it never moves as they collapse (B178 tiers). */}
        {teamPill}
        {/* SimuCoin (F71) — quiet by default: renders nothing unless an account
            is opted in or offerable. Placed before the panel buttons so it sits
            next to the tabs and never moves as buttons collapse (B178 tiers). */}
        <SimuCoinButton
          accounts={simucoin.accounts}
          withPassword={simucoin.withPassword}
          statuses={simucoin.statuses}
          busy={simucoin.busy}
          onRun={simucoin.run}
        />
        {/* B178: `app-bar-collapsible` — these five inline buttons hide under
            the narrow media tier (app-bar.css) and their actions re-surface as
            the `--overflow` items inside the ⋯ More menu below. Both sets are
            ALWAYS rendered; CSS decides which is visible (no width-measurement
            JS, same stance as the static More grouping). */}
        <button className={`app-bar-collapsible btn-panel-manager${st?.panelManager ? ' btn-panel-manager--active' : ''}`} onClick={() => dispatchSessionAction('toggle-panels')}>Layout</button>
        <button className={`app-bar-collapsible btn-map${st?.panelMap ? ' btn-map--active' : ''}`}                       onClick={() => dispatchSessionAction('toggle-maps')}>Maps</button>
        <button className={`app-bar-collapsible btn-experiences${st?.panelExperiences ? ' btn-experiences--active' : ''}`} onClick={() => dispatchSessionAction('toggle-experiences')}>Experiences</button>
        <button className={`app-bar-collapsible btn-automations${st?.panelAutomations ? ' btn-automations--active' : ''}`} onClick={() => dispatchSessionAction('toggle-automations')}>Automations</button>
        <button className={`app-bar-collapsible btn-lich-dash${st?.panelLich ? ' btn-lich-dash--active' : ''}`}           onClick={() => dispatchSessionAction('toggle-lich')}>Lich</button>
        <button className={`app-bar-collapsible btn-settings${st?.panelSettings ? ' btn-settings--active' : ''}`}          onClick={() => dispatchSessionAction('toggle-settings')}>Settings</button>

        <div className="app-bar-more" ref={moreRef}>
          <button
            className={`btn-app-bar-more${moreActive ? ' btn-app-bar-more--active' : ''}`}
            onClick={() => setMoreOpen(o => !o)}
            title="More"
            aria-label="More actions"
          >⋯</button>
          {moreOpen && (
            <div className="app-bar-more-menu">
              {/* B178: the collapsed inline buttons, visible only when the
                  narrow tier hides them from the bar (CSS-gated). */}
              <button className={`app-bar-more-item app-bar-more-item--overflow${st?.panelManager ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-panels'); setMoreOpen(false) }}>Layout</button>
              <button className={`app-bar-more-item app-bar-more-item--overflow${st?.panelMap ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-maps'); setMoreOpen(false) }}>Maps</button>
              <button className={`app-bar-more-item app-bar-more-item--overflow${st?.panelExperiences ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-experiences'); setMoreOpen(false) }}>Experiences</button>
              <button className={`app-bar-more-item app-bar-more-item--overflow${st?.panelAutomations ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-automations'); setMoreOpen(false) }}>Automations</button>
              <button className={`app-bar-more-item app-bar-more-item--overflow${st?.panelLich ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-lich'); setMoreOpen(false) }}>Lich</button>
              <button className={`app-bar-more-item app-bar-more-item--overflow${st?.panelSettings ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-settings'); setMoreOpen(false) }}>Settings</button>
              <div className="app-bar-more-sep app-bar-more-item--overflow" aria-hidden="true" />
              <button className={`app-bar-more-item${st?.panelDebug ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-debug'); setMoreOpen(false) }}>Debug</button>
              <button className={`app-bar-more-item${st?.panelLogs ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-logs'); setMoreOpen(false) }}>Logs</button>
              <button className={`app-bar-more-item${st?.panelContacts ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-contacts'); setMoreOpen(false) }}>Contacts</button>
              <button className={`app-bar-more-item${st?.panelTheme ? ' app-bar-more-item--active' : ''}`} onClick={() => { dispatchSessionAction('toggle-theme'); setMoreOpen(false) }}>Theme</button>
            </div>
          )}
        </div>

        {/* Separator so Disconnect reads as its own zone — guards against a
            mis-click on it when reaching for the adjacent ⋯ More button (Binu). */}
        <span className="app-bar-divider" aria-hidden="true" />

        {/* F108: a disconnected active character gets RECONNECT, in place — the
            same handleReconnectTab the tab and card menus use, so the tab and
            its scrollback survive. It used to read "Login", which destroyed the
            tab and opened the picker. Logging in someone else is the + tab. */}
        {connected
          ? <button className="btn-disconnect" onClick={() => dispatchSessionAction('disconnect')}>Disconnect</button>
          : active && (
            <button
              className="btn-disconnect btn-disconnect--login"
              disabled={reconnectingIds.has(active.characterId)}
              onClick={() => onReconnect(active.characterId)}
              title={`Reconnect ${active.character} in this tab, keeping its scrollback. To log in a different character, use the + tab.`}
            >{reconnectingIds.has(active.characterId) ? 'Reconnecting…' : 'Reconnect'}</button>
          )}
      </div>
    </div>
  )
}
