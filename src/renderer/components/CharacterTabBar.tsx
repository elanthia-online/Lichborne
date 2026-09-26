// CharacterTabBar — the character tab strip hosted by AppBar (one tab per
// session in THIS window).
//
// Each tab shows name + Lich/Direct pill + game code + live health% + ONE
// priority-resolved status glyph (Dead > Stunned > Bleeding > Roundtime; the
// slot stays reserved via CSS so tab width never shifts). Disconnect reads as
// dim + italic with the last-known glyph preserved. Right-click opens the
// per-character action menu (v0.11.6 expansion) — items built by
// characterMenu.ts, SHARED with the Overview card so the two surfaces can't
// offer different actions; only actionable options are listed (no greyed rows)
// and the connection toggle sits LAST below a divider.
//
// This is an app-level strip, so re-render economy matters: the single 500ms
// RT tick runs ONLY while some session has a roundtime pending (keyed on the
// furthest expiry, self-clearing one tick past it) — don't add per-tab timers
// or high-frequency state here.

import { useEffect, useState } from 'react'
import { useSessions, type CharacterId, type SessionRecord } from '../SessionsContext'
import { useRoster } from '../RosterContext'
import ContextMenu from './ContextMenu'
import { buildCharacterMenu } from '../characterMenu'
import { useViewMode, useOverviewTarget } from '../overviewStore'
import { activateOnKey } from '../utils/pressable'
import { characterColor, useCharacterColors } from '../characterColors'
import '../styles/character-tabs.css'

interface Props {
  onAdd: () => void
  onClose: (id: CharacterId) => void
  // One-click reconnect of a disconnected tab — owned by App (it has the
  // connect flow: password load, login IPC, profile import). Re-establishes the
  // session in place; the tab un-greys on success.
  onReconnect: (id: CharacterId) => void
  // Characters mid-reconnect — drives the per-tab "connecting" indicator (the
  // launcher's connecting overlay isn't visible for a tab reconnect).
  reconnectingIds: Set<CharacterId>
  // Team Login (v0.20.0): characters of a running team that have no tab yet —
  // waiting their turn, connecting, or failed. Shown as placeholder tabs so the
  // whole team is visible where the tabs are, and a stalled or failed login is
  // in plain sight instead of silently missing. Clicking one opens the panel.
  pendingTabs?: PendingTab[]
  onPendingClick?: () => void
}

export interface PendingTab {
  key: string
  name: string
  game: string
  status: 'waiting' | 'connecting' | 'failed'
}

function healthClassName(pct: number | null): string {
  if (pct == null) return ''
  if (pct >= 80) return 'health-ok'
  if (pct >= 50) return 'health-warn'
  if (pct >= 30) return 'health-bad'
  return 'health-crit'
}

export default function CharacterTabBar({ onAdd, onClose, onReconnect, reconnectingIds, pendingTabs, onPendingClick }: Props) {
  const { sessions, activeId, setActive } = useSessions()
  // WHICH tabs read as selected (Sekmeht, v0.19.7). In Session view: the active
  // tab, as always. In the OVERVIEW: whoever the input bar is aimed at, because
  // the Overview has one selection (B320) — who you are typing at. A selected
  // card lights just its tab; "All characters" lights EVERY connected tab,
  // since that is exactly who a send reaches (the bar's All skips disconnected
  // characters, so their tabs stay unlit rather than claim to be targeted).
  // `activeId` itself is untouched: it is still the tab Session view returns
  // to. Both hooks return primitives, so overviewStore's card-digest publishes
  // never re-render this strip.
  const viewMode = useViewMode()
  const overviewTarget = useOverviewTarget()
  const isHighlighted = (s: SessionRecord) =>
    viewMode !== 'overview' ? s.characterId === activeId
      : overviewTarget === null ? s.status.connected
        : s.characterId === overviewTarget
  // isPrimary === false means THIS is a decoupled (secondary) window, so its
  // characters can be re-homed to the main window. null (unknown) is treated as
  // primary, so "Move to main window" doesn't flash during cold start.
  const { isPrimary } = useRoster()

  // Single 500ms tick drives RT visibility (only matters when the icon slot
  // resolves to ⏳) — far cheaper than each tab running its own interval.
  //
  // It also only RUNS while some session actually has a roundtime pending.
  // `now` feeds exactly one comparison (`rtExpires > now` in resolveIcon), so
  // outside a roundtime the tick was re-rendering the whole tab strip twice a
  // second to recompute a value that could not change — forever, on an
  // app-level component, for every character. `backgroundThrottling` is off
  // (see main.ts), so it kept ticking while minimized too.
  //
  // The interval is keyed on the furthest pending expiry: a new roundtime
  // moves that timestamp, which restarts the tick. It then self-clears one
  // tick PAST the expiry, and that last tick is what re-renders the ⏳ away —
  // so stopping early would strand the glyph.
  const maxRtExpires = sessions.reduce((m, s) => Math.max(m, s.status.rtExpires), 0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (maxRtExpires <= Date.now()) return
    const i = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= maxRtExpires) clearInterval(i)
    }, 500)
    return () => clearInterval(i)
  }, [maxRtExpires])

  // Right-click a tab → a context menu of the actions available for THAT
  // character (v0.11.6 expansion — was decouple-only). We only list options
  // that are actually actionable for the tab (no greyed rows): Open-in-new-window
  // only when >1 char shares this window; Move-to-main-window only in a decoupled
  // (secondary) window; then Reconnect XOR Disconnect by connection state. The
  // connection toggle is LAST (below a divider) so the destructive Disconnect
  // isn't the first thing under the cursor and can't be fat-fingered (Binu kept
  // disconnecting by accident when it was the top item).
  const [ctx, setCtx] = useState<{ x: number; y: number; characterId: CharacterId; sessionId: string; character: string; connected: boolean } | null>(null)

  // Built per-open from the snapshot captured at right-click time. The item list
  // is SHARED with the Overview card (characterMenu.ts) so the two surfaces
  // cannot offer different actions for the same character. Close is omitted
  // here on purpose: a tab already carries an ✕.
  const menuItems = ctx
    ? buildCharacterMenu(ctx, { sessionCount: sessions.length, isPrimary, onReconnect })
    : []

  return (
    // In the Overview, "All characters" highlights EVERY connected tab, so the
    // tablist is genuinely multi-select there — several tabs carry
    // aria-selected="true", which is only valid with aria-multiselectable.
    <div className="character-tabs" role="tablist" aria-multiselectable={viewMode === 'overview' ? true : undefined}>
      {sessions.map(s => (
        <CharacterTab
          key={s.characterId}
          session={s}
          isActive={isHighlighted(s)}
          now={now}
          reconnecting={reconnectingIds.has(s.characterId)}
          onSelect={setActive}
          onClose={onClose}
          onContextMenu={(x, y) => setCtx({ x, y, characterId: s.characterId, sessionId: s.sessionId, character: s.character, connected: s.status.connected })}
        />
      ))}
      {pendingTabs?.map(p => <PendingCharacterTab key={p.key} tab={p} onClick={onPendingClick} />)}
      <button type="button" className="character-tab-add" onClick={onAdd} title="Add character">
        +
      </button>
      {ctx && menuItems.length > 0 && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} items={menuItems} />
      )}
    </div>
  )
}

// A team member still on its way in. Same silhouette as a real tab (it
// becomes one), but greyed, with a status glyph and — while connecting — a
// thin moving bar along the bottom. Not a real tab: it can't be selected or
// closed; clicking it opens the Team Login panel, where the detail is.
function PendingCharacterTab({ tab, onClick }: { tab: PendingTab; onClick?: () => void }) {
  const title = tab.status === 'connecting' ? `${tab.name} is connecting. Click for details.`
    : tab.status === 'waiting' ? `${tab.name} connects after the characters before it. Click for details.`
    : `${tab.name} didn't connect. Click to see why, or to retry.`
  const glyph = tab.status === 'connecting' ? '⟳' : tab.status === 'failed' ? '⚠︎' : '…'
  return (
    <button
      type="button"
      className={`character-tab character-tab--pending character-tab--pending-${tab.status}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <span className="character-tab-id">
        <span className="character-tab-name">{tab.name}</span>
        <span className="character-tab-game">{tab.game}</span>
      </span>
      <span className="character-tab-glyph" aria-hidden="true">{glyph}</span>
      {tab.status === 'connecting' && <span className="character-tab-pending-bar" aria-hidden="true" />}
    </button>
  )
}

// Single icon slot per tab, resolved by priority. Returns null when nothing
// should display in the slot (the slot itself stays reserved via CSS so the
// tab width doesn't shift between empty and non-empty states).
function resolveIcon(s: SessionRecord, now: number): { glyph: string; title: string } | null {
  const { dead, stunned, bleeding, rtExpires } = s.status
  const rtActive = rtExpires > now
  // Priority: Dead > Stunned > Bleeding > Roundtime.
  // Top-priority active condition wins the single slot; lower-priority ones
  // are still active in-game, just not surfaced on the tab.
  if (dead)     return { glyph: '💀', title: 'Dead' }
  if (stunned)  return { glyph: '💫', title: 'Stunned' }
  if (bleeding) return { glyph: '🩸', title: 'Bleeding' }
  if (rtActive) return { glyph: '⏳', title: 'Roundtime active' }
  return null
}

function CharacterTab({
  session, isActive, now, reconnecting, onSelect, onClose, onContextMenu,
}: {
  session: SessionRecord
  isActive: boolean
  now: number
  reconnecting: boolean
  onSelect: (id: CharacterId) => void
  onClose: (id: CharacterId) => void
  onContextMenu: (x: number, y: number) => void
}) {
  const { connected, healthPct } = session.status
  // While reconnecting, a spinning ⟳ replaces the status glyph (the session is
  // down so the dead/RT/etc. glyph is stale anyway) — the visible "Reconnecting"
  // feedback the launcher overlay can't give for a tab reconnect.
  const icon = reconnecting ? { glyph: '⟳', title: 'Reconnecting…' } : resolveIcon(session, now)
  const useLich = session.useLich
  // The colour picked for this character in Edit Profile (v0.20.0): the active
  // chip's tint and hairline, and a faint hairline when inactive. A separate
  // store from the Overview digests, so a vital tick still never reaches here.
  const chosenColor = characterColor(useCharacterColors(), { characterId: session.characterId })

  // Disconnect is conveyed purely by tab styling (dim + italic) — the
  // last-known icon is preserved so a player can still see "Katasha was dead
  // when she dropped" at a glance. No reconnect glyph clutters the tab.
  const classes = [
    'character-tab',
    isActive ? 'character-tab--active' : '',
    !connected ? 'character-tab--disconnected' : '',
    reconnecting ? 'character-tab--reconnecting' : '',
    chosenColor ? 'character-tab--colored' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={chosenColor ? { ['--char-color' as string]: chosenColor } as React.CSSProperties : undefined}
      role="tab"
      aria-selected={isActive}
      // B335: a tab stop + Enter/Space, so a tab is reachable without the mouse
      // (Ctrl+Tab / Ctrl+1–9 cycle, but only from the keyboard's current spot).
      // activateOnKey ignores keys aimed at the nested ✕, which is a real
      // <button> and keeps its own Enter/Space.
      tabIndex={0}
      // A MOUSE click must not leave focus parked on the tab, or a following
      // Space re-selects it instead of reaching the command bar through
      // type-anywhere (F60). `detail` is 0 for keyboard clicks.
      onClick={e => { onSelect(session.characterId); if (e.detail > 0) e.currentTarget.blur() }}
      onKeyDown={activateOnKey(() => onSelect(session.characterId))}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e.clientX, e.clientY) }}
    >
      {/* Name + L/D + Game cluster rendered tight in a sub-container so the
          parent tab's `gap: 6px` doesn't separate them. The pill's color and
          the uppercase game code give visual separation without whitespace.
          v0.8.0 UX pass (tightened from earlier 3px/4px margins). */}
      <span className="character-tab-id">
        <span className="character-tab-name">{session.character}</span>
        <span
          className={`character-tab-mode character-tab-mode--${useLich ? 'lich' : 'direct'}`}
          title={useLich ? 'Connected via Lich' : 'Direct connect (Lich integration unavailable)'}
          aria-label={useLich ? 'Lich' : 'Direct'}
        >
          {useLich ? 'L' : 'D'}
        </span>
        <span className="character-tab-game">{session.game}</span>
      </span>
      {healthPct != null && (
        <span className={`character-tab-health ${healthClassName(healthPct)}`} title={`Health ${healthPct}%`}>
          {healthPct}%
        </span>
      )}
      <span
        className={`character-tab-glyph${icon ? '' : ' character-tab-glyph--empty'}`}
        title={icon?.title ?? ''}
        aria-hidden={!icon}
      >
        {icon?.glyph ?? ''}
      </span>
      <button
        type="button"
        className="character-tab-close"
        title={`Close ${session.character}`}
        onClick={e => { e.stopPropagation(); onClose(session.characterId) }}
      >×</button>
    </div>
  )
}
