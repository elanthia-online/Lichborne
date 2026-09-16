// Launcher — the logon screen: one tile per character, grouped account → game
// section, with a Favorites quick-select block (characters AND pinned teams),
// the Teams section (F85), and a top bar (Reconnect Last F62 · Team Login F21
// · Add account · Transfer · Lich Setup). Also exports `LauncherCharacter` and
// `loadCharacterCards()`, the tile shape everything else reads.
//
// Rendered by App as the full logon screen, and again in `compact` mode
// embedded in the + tab's Add Character modal: no logo, no account Remove, and
// an action row trimmed to Reconnect Last / Team Login / Attach. Teams and
// pinned teams show in both (v0.19.7 — + is how you bring more characters in).
// It never connects anything itself: every launch goes UP through `onConnect`
// / `onBulkConnect` / `onReconnectLast` / `onConnectSet` (names→characters are
// resolved HERE, one per account, then App runs the plan). What it OWNS is
// per-tile profile state, written IMMEDIATELY by the read-modify-write
// helpers (`setCharacterGame` / `setCharacterUseLich` / `setCharacterHidden`
// / `setCharacterFavorite` / `patchCharacterProfile`) straight to the YAML
// via `window.api` — NEVER through `buildCharacterProfile`, which pulls
// `state` from localStorage and would wipe any character that isn't the
// active one (the comment on `setCharacterGame`). Launcher-local UI state in
// localStorage: `expandedAccounts` (a JSON array; the wizard pre-seeds a new
// account and `refreshKey` re-reads it), `favCollapsed` / `teamsCollapsed`
// (INVERTED flags, so an absent key means expanded), `favTipDismissed`;
// "Show hidden" is session-only. `refreshKey` is a SOFT refresh, not a
// remount key, so that state survives. Removing an ACCOUNT archives its
// profiles (profiles first, password second — order matters) rather than
// deleting them; deleting a character deletes only its profile. Teams
// re-read on `BULK_SETS_CHANGED_EVENT` (this window) and `storage` (others).

import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { confirmAction, confirmDelete, confirmDiscard } from '../confirm'
import type { CharacterProfile } from '../profile-types'
import { loadLastSessionCharacters, exportSharedProfile } from '../profile'
import { loadBulkSets, saveBulkSets, removeBulkSet, upsertBulkSet, BULK_SET_NAME_MAX, BULK_SETS_KEY, BULK_SETS_CHANGED_EVENT } from '../bulkSets'
import ContextMenu, { type CtxItem } from './ContextMenu'
import CharacterNotesEditor, { guildLabel } from './CharacterNotesEditor'
import '../styles/launcher.css'

export interface LauncherCharacter {
  name:    string
  account: string
  game:    string
  useLich: boolean
  hidden:  boolean    // v0.8.0: soft-delete flag; hidden tiles only render when Show Hidden is on
  favorite: boolean   // v0.8.0: mirrored into the Favorites section at the top of the launcher
  guild?:  string     // v0.8.0: optional guild key (lowercase canonical, see GUILDS in CharacterNotesEditor)
  circle?: number     // v0.8.0: optional character circle / level
  notes?:  string     // v0.8.0: optional free-text notes; tile shows a ✎ indicator when set
  // Attach mode: last detachable listener this character attached to.
  // Presence lights up the tile ⋯ menu's "⇋ Attach" action.
  attach?: { host: string; port: number }
}

interface Props {
  // Triggered when the user clicks a card's [Connect →] button.
  onConnect: (character: LauncherCharacter) => void
  // Triggered when the user clicks the "+ Add account" card.
  onAddNew:  () => void
  // Attach to an already-running detachable Lich session —
  // opens App's AttachModal. Optional so the compact Add-modal variant can
  // omit it without a dead button.
  onAttach?: () => void
  // One-click re-attach from a tile's ⋯ menu, using the target saved on the
  // character's profile (LauncherCharacter.attach). Only offered on tiles
  // that have one.
  onAttachCharacter?: (character: LauncherCharacter) => void
  // Triggered when the user clicks "↺ Refresh" on an account header — pre-fills
  // the Add Account flow with the chosen account so EAccess can pull any
  // characters that aren't already present as tiles. v0.8.0 (F18).
  onRefreshAccount?: (account: string) => void
  // Triggered when the user clicks the "⚙ Lich Setup" toolbar button.
  onOpenLichSetup: () => void
  // Optional: hide the heading/instruction text (used inside Add modal).
  compact?:  boolean
  // Optional: name of a character currently being connected (shows spinner state on its card).
  connectingName?: string | null
  // Optional: error message from the most recent connect attempt. Rendered as an
  // inline banner at the top of the launcher; user can dismiss via onDismissError.
  connectError?: string
  onDismissError?: () => void
  // v0.8.0 (bug 3 fix): when this number changes, the Launcher re-fetches its
  // character profile list. Used by App.tsx to refresh after the Add Account
  // wizard creates new tiles. Pre-fix was a `key={...}` which forced a full
  // remount and lost the Launcher's local state (Show Hidden toggle, etc.).
  refreshKey?: number
  // v0.8.0 (F21): clicking the Bulk Connect button. Launcher surfaces the
  // current connectable character list to App so it can present the picker.
  onBulkConnect?: (characters: LauncherCharacter[]) => void
  // F62 (v0.15.2): clicking "Reconnect Last". Launcher passes the saved
  // last-session set already matched to existing, non-hidden tiles; App
  // filters out already-connected characters and runs the bulk-connect flow.
  onReconnectLast?: (characters: LauncherCharacter[]) => void
  /** F85 — launch a saved set by name from the launcher's top bar. Resolution
   *  (names → characters) happens HERE, where the character list lives; App
   *  just receives the resolved list and runs the existing plan/connect path. */
  onConnectSet?: (characters: LauncherCharacter[]) => void
  /** Characters currently logged in ANYWHERE (all windows, from the roster).
   *  Lets a team row grey the members it will skip — `planReconnect` drops
   *  whoever is already on, so without this a Connect on a mostly-connected
   *  team looks like it did nothing. */
  connectedNames?: string[]
  /** Open Team Login with this team preloaded (the row's ⋯ → Edit). */
  onEditSet?: (setName: string) => void
}

// Game-section ordering inside an account. DR (and its DRT variant) come
// first because it's the canonical / most-common game; DRX and DRF follow.
// DRT tiles render under the DR section — DRT is a per-character override on
// DR, not a fourth tier (same SGE auth, same character list, different shard).
const GAME_SECTIONS: { key: 'DR' | 'DRX' | 'DRF'; label: string; matches: (game: string) => boolean }[] = [
  { key: 'DR',  label: 'DragonRealms',          matches: g => g === 'DR' || g === 'DRT' },
  { key: 'DRX', label: 'DragonRealms Platinum', matches: g => g === 'DRX' },
  { key: 'DRF', label: 'DragonRealms Fallen',   matches: g => g === 'DRF' },
]

// Launcher hero logo. Lives in src/renderer/public/ (the about-theme.mid
// precedent) so Vite copies it into the build with no config and it ships in
// the installer; referenced by RUNTIME path rather than imported, so a missing
// file degrades to a broken-image slot instead of failing the build.
// The PNG is a transparent 1024² canvas whose artwork occupies 778×638 — the
// dead padding is cropped in CSS (.launcher-logo-art), not by editing the art.
const LOGO_SRC = 'lichborne_logo_green.png'

/** The launcher's action row.
 *
 *  COMPACT is the + tab's Add Character modal, shown while characters are
 *  already connected. It carries only the ways to bring MORE characters in —
 *  Reconnect Last, Team Login, Attach — so logging in from + is the same
 *  experience as the full logon screen (Sekmeht, v0.19.7). The launch paths
 *  behind those buttons already assume a live roster: planReconnect skips
 *  anyone already on, keeps one character per account, and raises the
 *  Keep/Switch chooser. Deliberately NOT in compact: Add account (both
 *  launchers have the "+ Add account" row below), Transfer and Lich Setup — setup tools, not
 *  ways to log someone in, and still on the full screen and in the menus.
 *
 *  History: compact once rendered NO bar at all, and that cost more than
 *  chrome — attaching a second character meant closing every open session to
 *  get the full launcher back (the bug Kahlen hit). Compact then regained an
 *  Attach-only row, which this replaces. */
/** B336: ONE tooltip for both "+ Add account" controls (the top-bar button and
 *  the dashed row under the accounts), so they cannot explain the same action
 *  two different ways. It says what happens, not the label again (UX #8). */
const ADD_ACCOUNT_TIP =
  'Sign in with a Simutronics account — Lichborne lists its characters and adds a tile for each'

function LauncherTopBar({
  onOpenLichSetup,
  onAddNew,
  onAttach,
  onBulkConnect,
  bulkConnectEnabled,
  onReconnectLast,
  reconnectCount = 0,
  compact = false,
}: {
  onOpenLichSetup: () => void
  onAddNew?: () => void
  onAttach?: () => void
  onBulkConnect?: () => void
  bulkConnectEnabled: boolean
  onReconnectLast?: () => void
  reconnectCount?: number
  compact?: boolean
}) {
  return (
    <div className={`launcher-topbar${compact ? ' launcher-topbar--compact' : ''}`}>
      {/* F62: leads the bar — the most likely first action on a fresh launch.
          Rendered only when the saved last-session set matches existing tiles,
          so a first-run launcher never shows it (quiet by default). */}
      {onReconnectLast && reconnectCount > 0 && (
        <button
          className="launcher-topbar-btn launcher-topbar-btn--bulk"
          onClick={onReconnectLast}
          title={`Reconnect the ${reconnectCount} character${reconnectCount === 1 ? '' : 's'} from your last session (already-connected ones are skipped)`}
        >
          ⟲ Reconnect Last ({reconnectCount})
        </button>
      )}
      {onBulkConnect && (
        <button
          className="launcher-topbar-btn launcher-topbar-btn--bulk"
          onClick={onBulkConnect}
          disabled={!bulkConnectEnabled}
          title={bulkConnectEnabled
            ? 'Log in a team — one character per account, in sequence'
            : 'Need at least 2 accounts with connectable characters to log in a team'}
        >
          ⚡ Team Login
        </button>
      )}
      {/* The `▦ Sets…` dropdown that used to sit here was REMOVED in favour of
          the Teams section in the body (Sekmeht: "it just sticks out and
          doesn't have a lot of information about what it is or what it does").
          It named a noun with no explanation and hid its contents behind a
          click — polish standard #8. Two entry points where one is unlabelled
          is worse than one good one, so this is gone rather than duplicated:
          Team Login is where you BUILD a team, the section is where you use
          one. Don't re-add it. */}
      {/* Add account, Transfer and Lich Setup are full-screen only (see the
          header note): both launchers have the "+ Add account" row below the
          accounts, and the other two are setup tools rather than ways in. */}
      {!compact && onAddNew && (
        <button className="launcher-topbar-btn launcher-topbar-btn--add" onClick={onAddNew} title={ADD_ACCOUNT_TIP}>
          + Add account
        </button>
      )}
      {onAttach && (
        <button
          className="launcher-topbar-btn"
          onClick={onAttach}
          title="Attach to a Lich session that is already running and logged in (started with --headless / --detachable-client)"
        >
          ⇋ Attach
        </button>
      )}
      {!compact && (
        <>
          <button
            className="launcher-topbar-btn"
            onClick={() => document.dispatchEvent(new CustomEvent('lichborne:open-profile-transfer'))}
            title="Export or import a character's full setup (settings, layout, theme, automations)"
          >
            ⇄ Transfer
          </button>
          <button
            className="launcher-topbar-btn"
            onClick={onOpenLichSetup}
            title="Set where Ruby and Lich are installed, and how Lichborne launches Lich"
          >
            ⚙ Lich Setup
          </button>
        </>
      )}
    </div>
  )
}

export interface TeamMemberView { name: string; state: 'on' | 'ready' | 'missing' }
export interface TeamRowView {
  name: string
  members: TeamMemberView[]
  readyCount: number
  favorite: boolean
  notes?: string
}

/** One team, as it appears in BOTH the Favorites and Teams blocks. Hoisted to
 *  module scope and shared rather than copied into each section — two copies
 *  of a row are compatible only until someone restyles one of them. */
function TeamRow({ team, onConnect, onToggleFavorite, onMenu }: {
  team: TeamRowView
  onConnect: (name: string) => void
  onToggleFavorite: (name: string, next: boolean) => void
  onMenu: (e: React.MouseEvent, name: string) => void
}) {
  return (
    <div className="launcher-team">
      <button
        type="button"
        className={`launcher-team-fav${team.favorite ? ' launcher-team-fav--on' : ''}`}
        onClick={() => onToggleFavorite(team.name, !team.favorite)}
        aria-pressed={team.favorite}
        title={team.favorite ? 'Remove from Favorites' : 'Pin to Favorites'}
      >{team.favorite ? '♥' : '♡'}</button>
      <div className="launcher-team-main">
        <div className="launcher-team-name">{team.name}</div>
        <div className="launcher-team-members">
          {team.members.map(m => (
            <span
              key={m.name}
              className={`launcher-team-member launcher-team-member--${m.state}`}
              title={m.state === 'on' ? `${m.name} is already logged in — Connect will skip them`
                   : m.state === 'missing' ? `${m.name} is no longer on this machine (archived or removed)`
                   : m.name}
            >{m.name}</span>
          ))}
        </div>
        {/* Notes say what the team is FOR, the same job they do on a character
            profile. Shown inline rather than behind a hover, because that is
            the whole reason someone wrote them. */}
        {team.notes && <div className="launcher-team-notes">{team.notes}</div>}
      </div>
      <button
        type="button"
        className="launcher-team-connect"
        disabled={team.readyCount === 0}
        onClick={() => onConnect(team.name)}
        title={team.readyCount === 0
          ? 'Everyone on this team is already logged in'
          : `Log in ${team.readyCount} character${team.readyCount === 1 ? '' : 's'}`}
      >Connect{team.readyCount > 0 ? ` ${team.readyCount}` : ''}</button>
      <button
        type="button"
        className="launcher-team-menu"
        aria-label={`More options for ${team.name}`}
        title={`Options for ${team.name} — edit its name and notes, change members, or delete it`}
        onClick={e => onMenu(e, team.name)}
      >⋯</button>
    </div>
  )
}

/** Edit a team's name and notes — the team-level twin of Edit Profile.
 *  Roster editing stays in Team Login; this is the metadata around it. */
function TeamEditor({ team, existingNames, onCancel, onSave }: {
  team: TeamRowView
  existingNames: string[]
  onCancel: () => void
  onSave: (originalName: string, name: string, notes: string) => void
}) {
  const [name, setName] = useState(team.name)
  const [notes, setNotes] = useState(team.notes ?? '')
  const titleId = useId()
  const trimmed = name.trim()
  // Renaming onto another team would silently merge two teams into one.
  const clash = existingNames.some(n =>
    n.toLowerCase() !== team.name.toLowerCase() && n.toLowerCase() === trimmed.toLowerCase())
  const canSave = !!trimmed && !clash
  // B368: dirty = "Save would change something". Compared in the SAVED form
  // (saveTeamEdit trims the name and stores blank notes as absent), so a
  // stray trailing space doesn't count as an edit worth warning about.
  const dirty = trimmed !== team.name || notes.trim() !== (team.notes ?? '').trim()
  // Every way out — ✕, Cancel, backdrop, Esc — asks first when there is an
  // unsaved edit. Save unmounts the editor, so it never needs the guard.
  const requestClose = () => confirmDiscard(dirty, onCancel, 'this team')
  function save() {
    if (canSave) onSave(team.name, trimmed, notes)
  }
  // B341: Esc cancels, as it does in Edit Profile, which this mirrors.
  useEscapeClose(requestClose)
  return createPortal(
    <div className="cne-backdrop" {...backdropHandlers(requestClose)}>
      <div className="cne-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cne-header">
          <span className="cne-title" id={titleId}>Edit team — {team.name}</span>
          <button type="button" className="ui-close" onClick={requestClose} title="Close" aria-label="Close">✕</button>
        </div>
        <div className="cne-body">
          {/* Markup mirrors CharacterNotesEditor exactly — `.cne-label` wraps
              its own control and `.cne-row` is the field row. Inventing
              `.cne-field` / `.cne-warn` / `.cne-hint` here would have rendered
              unstyled: none of them exist (pitfall #113). */}
          <div className="cne-row">
            <label className="cne-label">
              Name
              <input
                className="cne-input"
                autoFocus
                maxLength={BULK_SET_NAME_MAX}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  // B389: Enter saves from the single-line name field (the
                  // notes textarea keeps Enter for newlines).
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save() }
                }}
              />
            </label>
          </div>
          <label className="cne-label cne-label--notes">
            Notes
            <textarea
              className="cne-input cne-textarea"
              rows={7}
              placeholder="What this team is for — farming run, rescue crew, who tanks, whatever you'd like to remember."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </label>
          {clash && (
            <div className="launcher-team-editor-warn">
              A team called “{trimmed}” already exists — pick another name.
            </div>
          )}
        </div>
        <div className="cne-footer">
          <button type="button" className="ui-btn" onClick={requestClose}>Cancel</button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            disabled={!canSave}
            title={!trimmed ? 'Give the team a name first' : clash ? 'Another team already has this name' : undefined}
            onClick={save}
          >Save</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export async function loadCharacterCards(): Promise<LauncherCharacter[]> {
  const names = await window.api.listCharacterProfiles()
  const profiles = await Promise.all(names.map(async name => {
    const raw = await window.api.readCharacterProfile(name)
    if (!raw || typeof raw !== 'object') return null
    const p = raw as Partial<CharacterProfile>
    return {
      name:     p.character ?? name,
      account:  p.account   ?? '',
      game:     p.game      ?? 'DR',
      useLich:  p.useLich   ?? true,
      hidden:   p.hidden    ?? false,
      favorite: p.favorite  ?? false,
      guild:    p.guild,
      circle:   p.circle,
      notes:    p.notes,
      attach:   p.attach,
    } as LauncherCharacter
  }))
  return profiles
    .filter((c): c is LauncherCharacter => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Read-modify-write the `game` field on a character's YAML profile so the DRT
// toggle persists across launches. Uses readCharacterProfile + writeCharacterProfile
// (full YAML round-trip) rather than the renderer's buildCharacterProfile path
// because that builder pulls `state` from localStorage — fine for the currently-
// active character, destructive for any other (their scoped keys aren't loaded,
// so the rebuilt YAML would have empty state and wipe saved automations etc.).
async function setCharacterGame(characterName: string, nextGame: string): Promise<void> {
  const raw = await window.api.readCharacterProfile(characterName)
  if (!raw || typeof raw !== 'object') return
  const profile = raw as CharacterProfile
  if (profile.game === nextGame) return
  await window.api.writeCharacterProfile(characterName, { ...profile, game: nextGame })
}

// Same pattern for the per-tile Lich/Direct mode toggle (v0.8.0). Flipping
// the LICH/DIRECT badge on a tile writes `useLich` back to the character's
// YAML without touching the rest of the profile.
async function setCharacterUseLich(characterName: string, nextUseLich: boolean): Promise<void> {
  const raw = await window.api.readCharacterProfile(characterName)
  if (!raw || typeof raw !== 'object') return
  const profile = raw as CharacterProfile
  if (profile.useLich === nextUseLich) return
  await window.api.writeCharacterProfile(characterName, { ...profile, useLich: nextUseLich })
}

// Attach mode: remember the detachable listener a character attached
// to, so the next attach is one click (tile ⋯ menu) or pre-filled (modal).
// Same read-modify-write shape as setCharacterGame above — and for the same
// reason: buildCharacterProfile would wipe a non-active character's state.
// UNLIKE its siblings, this CREATES a minimal profile when none exists: an
// attach-only character (never added through the wizard) still needs a YAML
// home for its target, and the resulting tile is exactly the reconnect
// surface the feature promises. The stub carries no localStorage state, so a
// later wizard add / normal session fills it in rather than fighting it.
export async function saveCharacterAttach(
  characterName: string,
  account: string,
  game: string,
  attach: { host: string; port: number },
): Promise<void> {
  const raw = await window.api.readCharacterProfile(characterName).catch(() => null)
  if (raw && typeof raw === 'object') {
    const profile = raw as CharacterProfile
    // EXPAND FIRST, ALWAYS — including when the target is unchanged and there
    // is nothing to write.
    //
    // A character that ALREADY has a profile keeps its real account (Ethun
    // stays on lenairk6), which is right: it really is on that account, and
    // after detaching the player may want to log in normally. But that account
    // section is typically COLLAPSED, so attaching such a character updated
    // disk and showed nothing — the player counted tiles under 'attach', found
    // one, and reasonably concluded the other attaches hadn't saved (Kahlen,
    // with three attached characters spread over lenairk6 / lenairk21 /
    // attach).
    //
    // The earlier "only on stub creation, or we fight a deliberate collapse"
    // reasoning was wrong on the evidence: a player who just attached a
    // character wants to see that character, and this fires once per attach —
    // it is not a persistent override of their choice.
    expandAccountOnce(profile.account ?? account)
    if (profile.attach?.host === attach.host && profile.attach?.port === attach.port) return
    await window.api.writeCharacterProfile(characterName, { ...profile, attach })
    return
  }
  // Prior accounts, read BEFORE the write, for the 1→2 transition below.
  const priorAccounts = new Set(
    (await loadCharacterCards().catch(() => [])).map(c => c.account),
  )
  await window.api.writeCharacterProfile(characterName, {
    profileVersion: 2,
    account,
    character: characterName,
    game,
    useLich: true,
    attach,
    theme: localStorage.getItem('lichborne.theme') ?? 'classic',
    state: {},
  } satisfies CharacterProfile)
  // AND MAKE THE TILE VISIBLE. Account sections default to COLLAPSED for
  // multi-account users (see expandedAccounts), so a stub filed under a
  // brand-new account — 'attach' for an attach-only character — was written
  // to disk correctly and then rendered inside a section the player had
  // never opened. Indistinguishable from "attach doesn't save anything"
  // (Kahlen). AddCharacterWizard already solves this for wizard-created
  // tiles by writing the new account name here before bumping refreshKey;
  // an attach creates tiles too, so it owes the same courtesy.
  //
  // The 1→2 case rides along for the same reason the wizard carries it: a
  // player with exactly ONE account sees it expanded by the single-account
  // rule, and adding a second (here, 'attach') silently collapses it. Expand
  // the prior one too so nothing the player was looking at disappears.
  expandAccountOnce(account, priorAccounts)
}

// Add `account` to the launcher's expanded set, so its section renders open
// the next time the launcher reads the key (its refreshKey effect re-reads
// it). Mirrors AddCharacterWizard's write, including the same
// never-block-on-storage posture: a failure here costs one extra click, so
// it must never fail the attach that triggered it.
function expandAccountOnce(account: string, priorAccounts: Set<string> = new Set()): void {
  try {
    const raw = localStorage.getItem('lichborne.launcher.expandedAccounts')
    const set = new Set<string>()
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) for (const v of arr) if (typeof v === 'string') set.add(v)
    }
    set.add(account)
    if (priorAccounts.size === 1 && !priorAccounts.has(account)) {
      for (const a of priorAccounts) set.add(a)
    }
    localStorage.setItem('lichborne.launcher.expandedAccounts', JSON.stringify([...set]))
  } catch { /* auto-expand silently fails — not a blocker */ }
}

// Soft-delete toggle (v0.8.0). Hiding a tile preserves the full character
// profile (automations, theme, layout) but removes the tile from the
// launcher grid unless the user enables "Show hidden" on the top bar. Use
// this for retired characters you might return to; use deleteCharacterProfile
// when you truly want the profile gone.
async function setCharacterHidden(characterName: string, nextHidden: boolean): Promise<void> {
  const raw = await window.api.readCharacterProfile(characterName)
  if (!raw || typeof raw !== 'object') return
  const profile = raw as CharacterProfile
  if ((profile.hidden ?? false) === nextHidden) return
  await window.api.writeCharacterProfile(characterName, { ...profile, hidden: nextHidden })
}

// Favorite toggle (v0.8.0). Persists `favorite: boolean` on the character
// profile; the launcher mirrors favorited tiles into a top "Favorites"
// section. Same character still appears in its account / game section
// below — favorites is a quick-access shortcut, not a re-categorization.
async function setCharacterFavorite(characterName: string, nextFavorite: boolean): Promise<void> {
  const raw = await window.api.readCharacterProfile(characterName)
  if (!raw || typeof raw !== 'object') return
  const profile = raw as CharacterProfile
  if ((profile.favorite ?? false) === nextFavorite) return
  await window.api.writeCharacterProfile(characterName, { ...profile, favorite: nextFavorite })
}

// Generic profile-fields patcher (v0.8.0). Used by the Notes editor to
// persist guild / circle / notes in one round-trip. Same read-modify-write
// shape as the single-field helpers above; intentionally not used for the
// frequent single-field toggles (heart, mode, test, hidden) so those keep
// their tight purpose-built call sites.
async function patchCharacterProfile(
  characterName: string,
  patch: Partial<Pick<CharacterProfile, 'guild' | 'circle' | 'notes'>>,
): Promise<void> {
  const raw = await window.api.readCharacterProfile(characterName)
  if (!raw || typeof raw !== 'object') return
  const profile = raw as CharacterProfile
  await window.api.writeCharacterProfile(characterName, { ...profile, ...patch })
}

// Bulk Connect is only useful with 2+ accounts that each have at least one
// connectable (non-hidden) character. With one account or fewer, a single
// click on the tile is just as fast. v0.8.0 (F21).
function bulkConnectIsEnabled(characters: LauncherCharacter[]): boolean {
  const accounts = new Set<string>()
  for (const c of characters) {
    if (!c.hidden) accounts.add(c.account)
  }
  return accounts.size >= 2
}

// Group a flat character list by account → game section. Empty sections are
// dropped; accounts are sorted alphabetically; within each section characters
// stay in the alphabetical order produced by loadCharacterCards.
function groupCharacters(characters: LauncherCharacter[]) {
  const byAccount = new Map<string, LauncherCharacter[]>()
  for (const c of characters) {
    const list = byAccount.get(c.account) ?? []
    list.push(c)
    byAccount.set(c.account, list)
  }
  const accounts = [...byAccount.keys()].sort((a, b) => a.localeCompare(b))
  return accounts.map(account => {
    const chars = byAccount.get(account)!
    const sections = GAME_SECTIONS
      .map(s => ({ ...s, chars: chars.filter(c => s.matches(c.game)) }))
      .filter(s => s.chars.length > 0)
    return { account, sections }
  })
}

interface CardProps {
  character: LauncherCharacter
  busy: boolean
  onConnect: (c: LauncherCharacter) => void
  onMenu: (e: React.MouseEvent, c: LauncherCharacter) => void
  onToggleTest: (c: LauncherCharacter, nextGame: 'DR' | 'DRT') => void
  onToggleMode: (c: LauncherCharacter, nextUseLich: boolean) => void
  onToggleFavorite: (c: LauncherCharacter, next: boolean) => void
  // v0.8.0 UX pass: when the tile renders inside an account section, the
  // account name is already in the section header — repeating it on the
  // tile is noise. Favorites section is account-mixed, so it stays on.
  showAccount?: boolean
}

function CharacterCard({ character: c, busy, onConnect, onMenu, onToggleTest, onToggleMode, onToggleFavorite, showAccount = true }: CardProps) {
  const isDR = c.game === 'DR' || c.game === 'DRT'
  const isTest = c.game === 'DRT'
  const guild = guildLabel(c.guild)
  const circleText = (typeof c.circle === 'number' && !Number.isNaN(c.circle)) ? String(c.circle) : null
  const guildLine = [guild, circleText].filter(Boolean).join(' ')
  const hasNotes = !!(c.notes && c.notes.trim())
  return (
    <div
      className={`launcher-card${busy ? ' launcher-card--busy' : ''}${c.hidden ? ' launcher-card--hidden' : ''}`}
      onContextMenu={e => onMenu(e, c)}
    >
      {/* Header row: name on the left, heart + kebab on the right. */}
      <div className="launcher-card-header">
        <span className="launcher-card-name">{c.name}</span>
        <div className="launcher-card-actions">
          <button
            type="button"
            className={`launcher-card-favorite${c.favorite ? ' launcher-card-favorite--on' : ''}`}
            onClick={() => onToggleFavorite(c, !c.favorite)}
            disabled={busy}
            title={c.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            aria-label={c.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            {c.favorite ? '♥' : '♡'}
          </button>
          <button
            type="button"
            className="launcher-card-menu"
            onClick={e => { e.stopPropagation(); onMenu(e, c) }}
            title={`Options for ${c.name} — edit its profile, hide it, or delete it`}
            aria-label={`More options for ${c.name}`}
          >
            ⋯
          </button>
        </div>
      </div>
      {/* Meta row: game · guild + circle · ✎ (when notes exist). Account
          name is appended only when rendering outside an account section
          (e.g. Favorites). v0.8.0 UX pass. */}
      <div className="launcher-card-meta">
        {showAccount && <>{c.account} · </>}{c.game}
        {guildLine && <> · <span className="launcher-card-guildline">{guildLine}</span></>}
        {hasNotes && (
          <span className="launcher-card-notes-indicator" title="Has notes — open Edit Profile to view"> ✎</span>
        )}
      </div>
      {/* Action row: paired Lich/Direct pills, Test Server pill (DR only),
          Connect button — all on one line so the tile is short. v0.8.0 UX. */}
      <div className="launcher-card-footer">
        <div className="launcher-card-modes" role="group" aria-label="Connection mode">
          <button
            type="button"
            className={`launcher-card-mode launcher-card-mode--lich${c.useLich ? '' : ' launcher-card-mode--inactive'}`}
            onClick={() => onToggleMode(c, true)}
            disabled={busy || c.useLich}
            title={c.useLich ? 'Currently using Lich (recommended)' : 'Switch to Lich (recommended)'}
          >
            LICH
          </button>
          <button
            type="button"
            className={`launcher-card-mode launcher-card-mode--direct${!c.useLich ? '' : ' launcher-card-mode--inactive'}`}
            onClick={() => onToggleMode(c, false)}
            disabled={busy || !c.useLich}
            title={!c.useLich ? 'Currently using Direct connect' : 'Switch to Direct connect — Lich integration unavailable'}
          >
            DIRECT
          </button>
          {isDR && (
            <button
              type="button"
              className={`launcher-card-mode launcher-card-mode--test${isTest ? '' : ' launcher-card-mode--inactive'}`}
              onClick={() => onToggleTest(c, isTest ? 'DR' : 'DRT')}
              disabled={busy}
              title={isTest
                ? 'Connecting to Prime Test (DRT). Click to switch back to DR.'
                : 'Click to switch this character to Prime Test (DRT) on the next connect.'}
            >
              TEST
            </button>
          )}
        </div>
        <button
          className="launcher-card-connect"
          onClick={() => onConnect(c)}
          disabled={busy}
          title={c.attach
            ? `Attach to the running Lich session at ${c.attach.host}:${c.attach.port} (falls back to a normal login if nothing is listening)`
            : undefined}
        >
          {/* A tile with a saved attach target says what the click DOES —
              App's handleCardConnect attaches first for these (falling back
              to a normal login only when nothing is listening). */}
          {busy ? 'Connecting…' : c.attach ? '⇋ Attach' : 'Connect →'}
        </button>
      </div>
    </div>
  )
}

// The last character list this window loaded (B323, v0.19.7). The + tab's Add
// Character modal MOUNTS a fresh Launcher every time it opens, so every open
// began in the "Loading characters…" state and popped the list in a moment
// later. Seeding from the last list shows it at once; the mount-time refresh()
// still runs and corrects anything that changed. Module scope is per window —
// each BrowserWindow has its own renderer.
let lastLoadedCards: LauncherCharacter[] | null = null

export default function Launcher({ onConnect, onAddNew, onAttach, onAttachCharacter, onRefreshAccount, onOpenLichSetup, compact = false, connectingName = null, connectError = '', onDismissError, refreshKey = 0, onBulkConnect, onReconnectLast, onConnectSet, connectedNames = [], onEditSet }: Props) {
  const [characters, setCharacters] = useState<LauncherCharacter[] | null>(() => lastLoadedCards)
  // Keep the seed current, including optimistic edits (favourite, hide) that
  // change `characters` without a reload.
  useEffect(() => { if (characters) lastLoadedCards = characters }, [characters])
  const [menu, setMenu] = useState<{ x: number; y: number; character: LauncherCharacter } | null>(null)
  // F85 — saved sets, re-read on refresh so a set created in the picker shows
  // up here without a restart.
  const [bulkSets, setBulkSets] = useState(() => loadBulkSets())
  useEffect(() => { setBulkSets(loadBulkSets()) }, [refreshKey])
  // Live-refresh the Teams section. TWO signals, because they cover different
  // cases: the custom event for a write in THIS window (Team Login saving a
  // team — a `storage` event never fires in the writing window, which is why
  // saving then cancelling left the section empty), and `storage` for a write
  // in ANOTHER window, since teams are app-wide in _shared.yaml.
  useEffect(() => {
    const reread = () => setBulkSets(loadBulkSets())
    const onStorage = (e: StorageEvent) => { if (e.key === BULK_SETS_KEY) reread() }
    document.addEventListener(BULK_SETS_CHANGED_EVENT, reread)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener(BULK_SETS_CHANGED_EVENT, reread)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  // Teams section collapse. INVERTED flag, the `favCollapsed` shape: the key
  // stores COLLAPSED, so an absent key reads as expanded and no existing
  // install folds the section shut on upgrade.
  const [teamsCollapsed, setTeamsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('lichborne.launcher.teamsCollapsed') === '1' } catch { return false }
  })
  function toggleTeamsCollapsed() {
    setTeamsCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('lichborne.launcher.teamsCollapsed', next ? '1' : '0') } catch { /* quota — in-memory only */ }
      return next
    })
  }
  const [teamMenu, setTeamMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  const [editingTeam, setEditingTeam] = useState<TeamRowView | null>(null)

  /** Rename and/or re-note a team. A rename is remove-then-upsert so the entry
   *  keeps its place in the list rather than jumping to the end. */
  function saveTeamEdit(originalName: string, name: string, notes: string) {
    const current = loadBulkSets()
    const existing = current.find(t => t.name === originalName)
    if (!existing) { setEditingTeam(null); return }
    const renamed = { ...existing, name, notes: notes.trim() || undefined }
    const next = originalName.toLowerCase() === name.toLowerCase()
      ? upsertBulkSet(current, renamed)
      : current.map(t => (t.name === originalName ? renamed : t))
    saveBulkSets(next)
    exportSharedProfile().catch(console.error)
    setEditingTeam(null)
  }

  /** B370: Delete team used to run on one click from the ⋯ menu — it now asks
   *  first, like every other destructive action that isn't an editor's own
   *  footer Delete. */
  async function deleteTeam(name: string) {
    if (!(await confirmDelete('team', name,
      "The characters on it aren't affected — only the saved line-up goes. This can't be undone."))) return
    // Same write path the picker uses, then re-read so the section updates
    // without waiting for a refreshKey bump. Flushed to _shared.yaml like every
    // other team write: without it the deletion lived only in the localStorage
    // working copy, and the next launch re-seeded the team from the YAML.
    const next = removeBulkSet(loadBulkSets(), name)
    saveBulkSets(next)
    setBulkSets(next)
    exportSharedProfile().catch(console.error)
  }
  const connectedSet = useMemo(
    () => new Set(connectedNames.map(n => n.toLowerCase())), [connectedNames])
  // A team member is one of three things, and the row says which: ON (already
  // logged in, so Connect will skip it), KNOWN (a real tile we'll connect), or
  // MISSING (archived or deleted — F79 archives rather than deletes, so the
  // name may come back; the team still launches without it).
  const teamRows = useMemo(() => bulkSets.map(set => {
    const byName = new Map((characters ?? []).filter(c => !c.hidden).map(c => [c.name.toLowerCase(), c]))
    const members = set.characters.map(name => {
      const key = name.toLowerCase()
      const known = byName.get(key)
      return { name, state: !known ? 'missing' as const : connectedSet.has(key) ? 'on' as const : 'ready' as const }
    })
    return {
      name: set.name, members,
      readyCount: members.filter(m => m.state === 'ready').length,
      favorite: !!set.favorite, notes: set.notes,
    }
  }), [bulkSets, characters, connectedSet])
  // Pinned teams join Favorites in BOTH launchers. Compact (the + tab's Add
  // Character modal) used to zero this on the theory that you came to add an
  // account, not to launch a team — but + says "Pick a character to connect",
  // and bringing a team in is exactly that (v0.19.7). Derived HERE so the
  // Favorites count can't disagree with what the block actually shows.
  const favoriteTeams = useMemo(() => teamRows.filter(t => t.favorite), [teamRows])

  // Favorites is the QUICK-SELECT block (Sekmeht: "think of favorites as their
  // quick select to things"), so it holds characters AND pinned teams. The
  // Teams block below still lists every team, pinned or not — pinning promotes,
  // it doesn't move.
  function toggleTeamFavorite(name: string, next: boolean) {
    const updated = loadBulkSets().map(t => (t.name === name ? { ...t, favorite: next } : t))
    saveBulkSets(updated)          // dispatches BULK_SETS_CHANGED_EVENT → re-read
    exportSharedProfile().catch(console.error)
  }
  const teamRowProps = {
    onConnect: launchSet,
    onToggleFavorite: toggleTeamFavorite,
    onMenu: (e: React.MouseEvent, name: string) => {
      e.preventDefault()
      setTeamMenu({ x: e.clientX, y: e.clientY, name })
    },
  }

  // Names → characters. Unknown names are DROPPED rather than treated as an
  // error: a set that mentions an archived character should still launch the
  // rest of the team (F79 archives rather than deletes, so the name may come
  // back later). Hidden tiles are excluded, matching every other bulk path.
  function launchSet(setName: string) {
    const set = bulkSets.find(s => s.name === setName)
    if (!set || !characters) return
    const wanted = new Set(set.characters.map(n => n.toLowerCase()))
    const resolved = characters.filter(c => !c.hidden && wanted.has(c.name.toLowerCase()))
    // One per account — DR's rule, and the set may predate a character moving.
    const perAccount = new Map<string, LauncherCharacter>()
    for (const c of resolved) if (!perAccount.has(c.account)) perAccount.set(c.account, c)
    if (perAccount.size > 0) onConnectSet?.([...perAccount.values()])
  }

  const [showHidden, setShowHidden] = useState(false)
  const [editingNotes, setEditingNotes] = useState<LauncherCharacter | null>(null)
  // Favorites discoverability hint — shows above the first account section
  // for new users until they either favorite a character or explicitly
  // dismiss the hint. v0.8.0 (UX phase 1). The dismissed state persists in
  // localStorage so it doesn't re-appear after a relaunch.
  const [favTipDismissed, setFavTipDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem('lichborne.launcher.favTipDismissed') === '1' } catch { return false }
  })
  // Collapsible Favorites (v0.18.0, Sekmeht — supersedes the old "Favorites is
  // always-open" invariant). Mirrors the account sections' toggle, but the
  // DEFAULT IS EXPANDED: favorites are the shortcut you came for, so they open
  // unless the user has explicitly closed them. Hence the key stores the
  // COLLAPSED flag — an absent key (every existing install) reads as expanded,
  // so nobody's launcher silently folds shut on upgrade.
  const [favCollapsed, setFavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('lichborne.launcher.favCollapsed') === '1' } catch { return false }
  })

  function toggleFavCollapsed() {
    setFavCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('lichborne.launcher.favCollapsed', next ? '1' : '0') } catch { /* quota — in-memory only */ }
      return next
    })
  }

  // Collapsible account sections (v0.8.0). Persisted as a JSON array of
  // expanded account names in localStorage so a tester who expanded
  // FortissABrok yesterday still sees it expanded today. Default: empty set
  // = all collapsed (the user explicitly asked for this default — accounts
  // tend to have many characters and a collapsed view reduces noise).
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('lichborne.launcher.expandedAccounts')
      if (!raw) return new Set()
      const arr = JSON.parse(raw) as unknown
      return Array.isArray(arr) ? new Set(arr.filter((v): v is string => typeof v === 'string')) : new Set()
    } catch { return new Set() }
  })

  function toggleAccountExpanded(account: string) {
    setExpandedAccounts(prev => {
      const next = new Set(prev)
      if (next.has(account)) next.delete(account)
      else next.add(account)
      localStorage.setItem('lichborne.launcher.expandedAccounts', JSON.stringify([...next]))
      return next
    })
  }

  function refresh() {
    loadCharacterCards().then(setCharacters).catch(err => {
      console.error('Failed to load character profiles', err)
      setCharacters([])
    })
  }

  // Re-fetch profiles when refreshKey changes (App.tsx bumps it after the
  // Add Account wizard adds tiles). Soft refresh — the Launcher's local
  // state (showHidden, editingNotes, menu position, expandedAccounts) is
  // preserved, unlike the pre-fix key={refreshKey} which forced a full
  // remount and reset showHidden mid-session. v0.8.0 (bug 3 fix).
  useEffect(() => { refresh() }, [refreshKey])

  // Re-read expandedAccounts from localStorage when refreshKey changes —
  // the wizard writes the just-added account name there so it auto-expands
  // when the user lands back on the launcher (UX phase 1: "new accounts
  // auto-expand once"). Without re-reading we'd hold stale local state.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('lichborne.launcher.expandedAccounts')
      if (!raw) return
      const arr = JSON.parse(raw) as unknown
      if (Array.isArray(arr)) {
        setExpandedAccounts(new Set(arr.filter((v): v is string => typeof v === 'string')))
      }
    } catch { /* keep current state */ }
  }, [refreshKey])

  // B401: both launcher confirmations go through the ONE themed confirm
  // (confirm.ts / ConfirmHost) instead of a private modal of their own.
  async function handleDeleteCharacter(c: LauncherCharacter) {
    const ok = await confirmDelete('profile', c.name,
      `Deletes ${c.name}'s saved profile — themes, layout, automations and contacts. ` +
      `The saved password for account ${c.account} is kept, since other characters may share it. ` +
      `To keep the profile but take the tile off this screen, use Hide profile instead. This can't be undone.`)
    if (!ok) return
    try {
      await window.api.deleteCharacterProfile(c.name)
    } catch (err) {
      console.error('Failed to delete character profile', err)
    }
    refresh()
  }

  // Removing an account ARCHIVES its characters rather than deleting them
  // (Sekmeht): the YAMLs move to profiles/Archive/ and come back automatically
  // if the account is added again, so themes, layout, automations and contacts
  // survive a break. Logs are never touched by any of this — a returning
  // character keeps its history, with a gap for the time it was away.
  //
  // ORDER MATTERS: profiles first. If the password step fails, you are left
  // with a credential for an account that has no visible characters — harmless
  // and invisible (an account with no characters is never listed). The reverse
  // order could leave listed characters that can no longer sign in, which is
  // the failure that actually costs something.
  //
  // Sequential rather than Promise.all: a handful of small file moves, and a
  // partial failure is far easier to reason about when the order is fixed.
  //
  // `names` is captured at CLICK time and passed in, so the confirmation states
  // exactly what it is about to remove rather than re-deriving it from a list
  // that may have refreshed underneath it. Naming them is the point of the
  // confirmation: the section may be collapsed, so a count alone doesn't say
  // what goes.
  async function handleRemoveAccount(account: string, names: string[]) {
    const n = names.length
    const who = n > 0 ? ` (${names.join(', ')})` : ''
    const ok = await confirmAction({
      title: 'Remove account?',
      message: account,
      detail:
        `Takes ${n} ${n === 1 ? 'character' : 'characters'}${who} off this screen and forgets the ` +
        `account's saved password. Nothing is deleted — each character's settings and logs are kept, ` +
        `and adding the account again restores them exactly as they were.`,
      confirmLabel: 'Remove account',
      danger: true,
    })
    if (!ok) return
    for (const name of names) {
      try {
        await window.api.archiveCharacterProfile(name)
      } catch (err) {
        console.error(`Failed to archive character profile ${name}`, err)
      }
    }
    try {
      await window.api.deletePassword(account)
    } catch (err) {
      console.error(`Failed to delete saved password for ${account}`, err)
    }
    refresh()
  }

  async function handleToggleTest(c: LauncherCharacter, nextGame: 'DR' | 'DRT') {
    try {
      await setCharacterGame(c.name, nextGame)
      // Optimistic local update so the checkbox reflects immediately; refresh
      // would also work but flickers the whole grid.
      setCharacters(prev => prev?.map(x => x.name === c.name ? { ...x, game: nextGame } : x) ?? prev)
    } catch (err) {
      console.error('Failed to update character game', err)
      refresh()
    }
  }

  async function handleToggleMode(c: LauncherCharacter, nextUseLich: boolean) {
    try {
      await setCharacterUseLich(c.name, nextUseLich)
      setCharacters(prev => prev?.map(x => x.name === c.name ? { ...x, useLich: nextUseLich } : x) ?? prev)
    } catch (err) {
      console.error('Failed to update character mode', err)
      refresh()
    }
  }

  async function handleToggleHidden(c: LauncherCharacter, nextHidden: boolean) {
    try {
      await setCharacterHidden(c.name, nextHidden)
      setCharacters(prev => prev?.map(x => x.name === c.name ? { ...x, hidden: nextHidden } : x) ?? prev)
    } catch (err) {
      console.error('Failed to toggle hidden state', err)
      refresh()
    }
  }

  async function handleToggleFavorite(c: LauncherCharacter, nextFavorite: boolean) {
    try {
      await setCharacterFavorite(c.name, nextFavorite)
      setCharacters(prev => prev?.map(x => x.name === c.name ? { ...x, favorite: nextFavorite } : x) ?? prev)
    } catch (err) {
      console.error('Failed to toggle favorite state', err)
      refresh()
    }
  }

  function handleBulkConnectClick() {
    if (!characters || !onBulkConnect) return
    onBulkConnect(characters)
  }

  // F62: the saved last-session set matched to EXISTING, NON-HIDDEN tiles
  // (deleted/hidden characters silently drop out; saved order — the original
  // login order — is preserved). Recomputed per render: the saved list is a
  // tiny localStorage read and `characters` only changes on refresh.
  const lastSessionTiles: LauncherCharacter[] = (() => {
    if (!onReconnectLast || !characters) return []
    const tiles = new Map(
      characters.filter(c => !c.hidden).map(c => [`${c.account}:${c.name}`.toLowerCase(), c]),
    )
    return loadLastSessionCharacters()
      .map(e => tiles.get(`${e.account}:${e.name}`.toLowerCase()))
      .filter((c): c is LauncherCharacter => !!c)
  })()

  function handleReconnectLastClick() {
    if (lastSessionTiles.length > 0) onReconnectLast?.(lastSessionTiles)
  }

  async function handleSaveNotes(c: LauncherCharacter, patch: { guild: string | undefined; circle: number | undefined; notes: string | undefined }) {
    try {
      await patchCharacterProfile(c.name, patch)
      setCharacters(prev => prev?.map(x => x.name === c.name ? { ...x, ...patch } : x) ?? prev)
      setEditingNotes(null)
    } catch (err) {
      console.error('Failed to save character profile fields', err)
      refresh()
    }
  }

  // Both early returns carry `launcher--compact` too (B323). Without it the
  // loading state inside the + modal skipped the compact panel chrome
  // (`.add-character-modal .launcher--compact` in launcher.css) and drew with the
  // FULL-PAGE logon background instead — a dark unframed box that then snapped
  // into the real panel once the list arrived.
  if (characters === null) {
    return (
      <div className={`launcher launcher--loading${compact ? ' launcher--compact' : ''}`}>
        <div className="launcher-spinner" />
        <span>Loading characters…</span>
      </div>
    )
  }

  // First-run: no saved characters → friendly welcome card
  if (characters.length === 0) {
    return (
      <div className={`launcher launcher--empty${compact ? ' launcher--compact' : ''}`}>
        {!compact && (
          <div className="launcher-logo">
            {/* The logo art CARRIES the wordmark, so it replaces the old
                <h1>Lichborne</h1> rather than sitting above it — hence the
                real alt text here (it IS the heading now, not decoration). */}
            <div className="launcher-logo-art">
              <img src={LOGO_SRC} alt="Lichborne" draggable={false} />
            </div>
            <div className="launcher-logo-text">
              <p className="launcher-tagline">DragonRealms Client</p>
              <p className="launcher-version">v{__APP_VERSION__}</p>
            </div>
          </div>
        )}
        {/* One bar in both launchers; `compact` trims it to the ways of
            bringing more characters in (see LauncherTopBar). */}
        <LauncherTopBar
          compact={compact}
          onOpenLichSetup={onOpenLichSetup}
          onAddNew={onAddNew}
          onAttach={onAttach}
          onBulkConnect={onBulkConnect && characters && characters.length > 0 ? handleBulkConnectClick : undefined}
          bulkConnectEnabled={!!characters && bulkConnectIsEnabled(characters)}
          onReconnectLast={handleReconnectLastClick}
          reconnectCount={lastSessionTiles.length}
        />
        <div className="launcher-welcome">
          <h2>Welcome to Lichborne</h2>
          <p>
            Add an account to get started. Lichborne will sign in, discover
            your characters, and create a tile for each one. You only set
            this up once per account.
          </p>
          <button className="btn-primary launcher-add-cta" onClick={onAddNew}>
            + Add account
          </button>
        </div>
      </div>
    )
  }

  // Filter out hidden tiles unless the user has toggled Show Hidden. The
  // hidden state is per-character (CharacterProfile.hidden) so it survives
  // restarts; the "Show hidden" launcher-level toggle is session state only.
  const visibleCharacters = showHidden ? characters : characters.filter(c => !c.hidden)
  const hiddenCount = characters.filter(c => c.hidden).length
  const groups = groupCharacters(visibleCharacters)
  // Favorites mirror — characters with `favorite: true` get pinned to a
  // top-of-launcher section, but they ALSO still appear in their account /
  // game section below (Favorites is a quick-access shortcut, not a
  // re-categorization). v0.8.0 (F19). Hidden + favorite: hidden wins
  // unless the user has Show Hidden on, same as everywhere else.
  const favoriteCharacters = visibleCharacters
    .filter(c => c.favorite)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className={`launcher${compact ? ' launcher--compact' : ''}`}>
      {!compact && (
        <div className="launcher-logo">
          {/* The logo art CARRIES the wordmark, so it replaces the old
              <h1>Lichborne</h1> rather than sitting above it — hence the
              real alt text here (it IS the heading now, not decoration). */}
          <div className="launcher-logo-art">
            <img src={LOGO_SRC} alt="Lichborne" draggable={false} />
          </div>
          <div className="launcher-logo-text">
            <p className="launcher-tagline">DragonRealms Client</p>
            <p className="launcher-version">v{__APP_VERSION__}</p>
            {/* The instruction is the THIRD LINE OF THE LOCKUP (Sekmeht's
                mockup), not a separate row beneath it — so the hero reads as
                one block: wordmark art | hairline | what this is, what version,
                what to do. Compact mode has no lockup: there the + modal's own
                header band says "Connect a character" (F113, App.tsx), so the
                launcher renders no heading of its own. */}
            <p className="launcher-heading launcher-heading--inline">
              Pick a character to connect
            </p>
          </div>
        </div>
      )}
      {/* ORDER: the logo lockup comes FIRST, the action row beneath it
          (Sekmeht + Binu, v0.18.2 — swapped from action-row-first). The lockup
          is the identity and says what this screen is for ("Pick a character to
          connect"); the buttons are what you do about it, so they read second.
          It also puts the actions directly above the character tiles they act
          on, instead of separated from them by the whole hero block. */}
      {/* One bar in both launchers; `compact` trims it to the ways of bringing
          more characters in (see LauncherTopBar). */}
      <LauncherTopBar
        compact={compact}
        onOpenLichSetup={onOpenLichSetup}
        onAddNew={onAddNew}
        onAttach={onAttach}
        onBulkConnect={onBulkConnect && characters && characters.length > 0 ? handleBulkConnectClick : undefined}
        bulkConnectEnabled={!!characters && bulkConnectIsEnabled(characters)}
        onReconnectLast={handleReconnectLastClick}
        reconnectCount={lastSessionTiles.length}
      />

      {connectError && (
        <div className="launcher-error">
          <span className="launcher-error-text">{connectError}</span>
          {onDismissError && (
            <button type="button" className="launcher-error-dismiss" onClick={onDismissError} title="Dismiss this message" aria-label="Dismiss">×</button>
          )}
        </div>
      )}

      <div className="launcher-groups">

        {(favoriteCharacters.length > 0 || favoriteTeams.length > 0) && (
          <div className={`launcher-section launcher-section--favorites${favCollapsed ? ' launcher-section--collapsed' : ''}`}>
            {/* A real <button> (not a clickable div) so Enter/Space work
                natively — the same lesson the account header learned in
                v0.8.0. Expanded by default; see favCollapsed. */}
            <button
              type="button"
              className="launcher-section-header"
              onClick={toggleFavCollapsed}
              aria-expanded={!favCollapsed}
              title={favCollapsed ? 'Expand' : 'Collapse'}
            >
              <span className="launcher-account-chevron" aria-hidden="true">{favCollapsed ? '▶' : '▼'}</span>
              <span className="launcher-section-header-heart" aria-hidden="true">♥</span>
              Favorites
              <span className="launcher-account-count">{favoriteCharacters.length + favoriteTeams.length}</span>
            </button>
            {!favCollapsed && (<>
            {/* Pinned TEAMS lead the quick-select block: a team is a bigger
                action than a single character, and keeping the rows above the
                card grid stops two different shapes interleaving. */}
            {favoriteTeams.length > 0 && (
              <div className="launcher-teams launcher-teams--infav">
                {favoriteTeams.map(t => <TeamRow key={`favteam::${t.name}`} team={t} {...teamRowProps} />)}
              </div>
            )}
            <div className="launcher-grid">
              {favoriteCharacters.map(c => (
                <CharacterCard
                  key={`fav::${c.name}`}
                  character={c}
                  busy={connectingName === c.name}
                  onConnect={onConnect}
                  onMenu={(e, ch) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, character: ch })
                  }}
                  onToggleTest={handleToggleTest}
                  onToggleMode={handleToggleMode}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
            </>)}
          </div>
        )}

        {/* TEAMS (F85 follow-up). Replaces the `▦ Sets…` dropdown, which named
            a noun and explained nothing — polish standard #8. A section makes
            the content the explanation: seeing the members answers "what is a
            team?" without help text. Renders NOTHING at zero teams (standard
            #1), so it costs space only once you have one. Same collapsible
            shape as the account blocks, so there's no new interaction. */}
        {/* In BOTH launchers (v0.19.7): the + tab's compact launcher is how you
            bring more characters in mid-session, and a team is exactly that.
            Launching skips anyone already on (planReconnect). */}
        {onConnectSet && teamRows.length > 0 && (
          <div className={`launcher-section launcher-section--teams${teamsCollapsed ? ' launcher-section--collapsed' : ''}`}>
            <button
              type="button"
              className="launcher-section-header"
              onClick={toggleTeamsCollapsed}
              aria-expanded={!teamsCollapsed}
              title={teamsCollapsed ? 'Expand' : 'Collapse'}
            >
              <span className="launcher-account-chevron" aria-hidden="true">{teamsCollapsed ? '▶' : '▼'}</span>
              {/* Crossed swords — thematic, and it reads as "a party" where a
                  square read as nothing.
                  U+2694 + U+FE0E. The trailing selector is VARIATION
                  SELECTOR-15 (TEXT presentation) — NOT U+FE0F, which is its
                  emoji-presentation opposite and would give a colour glyph
                  that ignores `color`. U+2694 is Emoji=Yes /
                  Emoji_Presentation=No, so Windows renders it monochrome from
                  Segoe UI Symbol but macOS can resolve it through Apple Color
                  Emoji instead, where it would arrive coloured and stop
                  matching the accent band. VS15 asks for the text form
                  explicitly. Best-effort rather than a guarantee — it still
                  depends on a text font having the glyph — so if a Mac tester
                  reports a coloured icon, swap to a non-emoji codepoint such
                  as U+2691 (flag) rather than adding more selectors. */}
              <span className="launcher-section-header-glyph" aria-hidden="true">⚔︎</span>
              Teams
              <span className="launcher-account-count">{teamRows.length}</span>
            </button>
            {!teamsCollapsed && (
              <div className="launcher-teams">
                {teamRows.map(t => <TeamRow key={t.name} team={t} {...teamRowProps} />)}
              </div>
            )}
          </div>
        )}

        {/* Favorites discoverability hint (v0.8.0 UX). Shows above the
            account sections when the user has tiles but hasn't favorited
            any. Dismissable; the dismiss state lives in localStorage so
            the hint doesn't come back next launch. */}
        {!favTipDismissed && favoriteCharacters.length === 0 && groups.length > 0 && (
          <div className="launcher-fav-tip">
            <span>💡 Click the ♡ on any character to pin it to a Favorites section at the top for quick access.</span>
            <button
              type="button"
              className="launcher-fav-tip-dismiss"
              onClick={() => {
                setFavTipDismissed(true)
                try { localStorage.setItem('lichborne.launcher.favTipDismissed', '1') } catch {}
              }}
              title="Dismiss this tip — it won't come back"
              aria-label="Dismiss"
            >×</button>
          </div>
        )}

        {groups.map(({ account, sections }) => {
          // Collapsible per-account block (v0.8.0). Default collapsed for
          // multi-account users. Two exceptions (v0.8.0 UX pass): if there's
          // only one account, always render it expanded — no collapse, no
          // hidden tiles, nothing to discover. AND newly-added accounts get
          // auto-expanded once (the wizard writes the new account name to
          // `lichborne.launcher.expandedAccounts` before bumping refreshKey,
          // and Launcher's refresh effect re-reads the key).
          const isOnlyAccount = groups.length === 1
          const isExpanded = isOnlyAccount || expandedAccounts.has(account)
          const characterCount = sections.reduce((sum, s) => sum + s.chars.length, 0)
          return (
            <div key={account} className={`launcher-account${isExpanded ? '' : ' launcher-account--collapsed'}`}>
              {/* v0.8.0 fix: split into two sibling buttons inside a div
                  wrapper. Pre-fix this was a <button> with a <span role=
                  "button" tabIndex=0> nested inside — interactive content
                  inside interactive content, which is invalid HTML and
                  meant Spacebar didn't activate the inner button (only
                  Enter, which I handled manually). Now both are real
                  buttons with native keyboard handling. */}
              <div className="launcher-account-header">
                <button
                  type="button"
                  className="launcher-account-header-toggle"
                  onClick={() => { if (!isOnlyAccount) toggleAccountExpanded(account) }}
                  aria-expanded={isExpanded}
                  disabled={isOnlyAccount}
                  title={isOnlyAccount ? '' : (isExpanded ? 'Collapse' : 'Expand')}
                >
                  {/* Chevron hidden in single-account mode — no collapse there. */}
                  {!isOnlyAccount && (
                    <span className="launcher-account-chevron" aria-hidden="true">{isExpanded ? '▼' : '▶'}</span>
                  )}
                  <span className="launcher-account-label">Account</span>
                  <span className="launcher-account-name">{account}</span>
                  <span className="launcher-account-count">
                    {characterCount} {characterCount === 1 ? 'character' : 'characters'}
                  </span>
                </button>
                {onRefreshAccount && (
                  <button
                    type="button"
                    className="launcher-account-refresh"
                    onClick={() => onRefreshAccount(account)}
                    title={`Re-run discovery for ${account} to add new characters, or re-enter its saved password`}
                  >
                    ↺ Refresh
                  </button>
                )}
                {/* Removing an account is offered ONLY on the full logon screen,
                    never in the compact launcher that opens over a live session:
                    this component cannot see which characters are connected, and
                    deleting the profile of one that is mid-session is not a
                    state worth supporting. The logon screen is the disconnected
                    surface, so the question cannot arise there. */}
                {!compact && (
                  <button
                    type="button"
                    className="launcher-account-remove"
                    onClick={() => void handleRemoveAccount(
                      account,
                      // From the FULL character list, not this group's sections:
                      // `groups` is built from `visibleCharacters`, so with
                      // "Show hidden" off the sections omit hidden characters.
                      // Collecting from them deleted only what was on screen
                      // while still forgetting the account password — leaving
                      // orphaned hidden profiles that could never sign in again,
                      // and an account section that reappears the moment you
                      // toggle Show hidden. Removing an account removes ALL of it.
                      characters.filter(c => c.account === account).map(c => c.name),
                    )}
                    title={`Remove ${account} and its characters from this screen`}
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
              {isExpanded && sections.map(section => (
                <div key={section.key} className="launcher-section">
                  <div className="launcher-section-header">{section.label}</div>
                  <div className="launcher-grid">
                    {section.chars.map(c => (
                      <CharacterCard
                        key={c.name}
                        character={c}
                        busy={connectingName === c.name}
                        showAccount={false}
                        onConnect={onConnect}
                        onMenu={(e, ch) => {
                          e.preventDefault()
                          setMenu({ x: e.clientX, y: e.clientY, character: ch })
                        }}
                        onToggleTest={handleToggleTest}
                        onToggleMode={handleToggleMode}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}

        {/* Add-account row + Show Hidden toggle. v0.8.0: the wizard's
            account-discovery flow creates one tile per character on an account
            in a single pass, hence "Add account". v0.19.7: a full-width,
            account-row-height dashed row rather than a grid tile, so it reads as
            the next account slot under the account rows (Sekmeht). */}
        <div className="launcher-add-row">
          <button
            type="button"
            className="launcher-add-account"
            onClick={onAddNew}
            title={ADD_ACCOUNT_TIP}
          >
            <span className="launcher-add-account-plus" aria-hidden="true">+</span>
            <span className="launcher-add-account-label">Add account</span>
          </button>
        </div>
        {hiddenCount > 0 && (
          <div className="launcher-hidden-toggle-row">
            <button
              type="button"
              className="launcher-hidden-toggle"
              onClick={() => setShowHidden(v => !v)}
            >
              {showHidden
                ? `Hide hidden profiles (${hiddenCount})`
                : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'profile' : 'profiles'}`}
            </button>
          </div>
        )}
      </div>

      {editingTeam && (
        <TeamEditor
          team={editingTeam}
          existingNames={teamRows.map(t => t.name)}
          onCancel={() => setEditingTeam(null)}
          onSave={saveTeamEdit}
        />
      )}
      {teamMenu && (
        <ContextMenu
          x={teamMenu.x}
          y={teamMenu.y}
          onClose={() => setTeamMenu(null)}
          items={[
            { label: 'Edit team…', onClick: () => setEditingTeam(teamRows.find(t => t.name === teamMenu.name) ?? null) },
            ...(onEditSet ? [{ label: 'Change members…', onClick: () => onEditSet(teamMenu.name) }] : []),
            // B391: the destructive item goes LAST, after a divider, so it is
            // never the row under a reflexive click. No "…" — it acts (after a
            // confirmation), it doesn't open somewhere you still have to work.
            { label: null },
            { label: 'Delete team', onClick: () => { void deleteTeam(teamMenu.name) } },
          ] satisfies CtxItem[]}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            // Attach (draft): shown only when this character has a saved
            // target AND App wired the action — the label carries the target
            // so the player knows where the click goes before committing.
            ...(onAttachCharacter && menu.character.attach
              ? [{
                  label: `⇋ Attach (${menu.character.attach.host}:${menu.character.attach.port})`,
                  onClick: () => onAttachCharacter(menu.character),
                }]
              : []),
            { label: 'Edit profile…', onClick: () => setEditingNotes(menu.character) },
            menu.character.hidden
              ? { label: 'Unhide profile', onClick: () => handleToggleHidden(menu.character, false) }
              : { label: 'Hide profile',   onClick: () => handleToggleHidden(menu.character, true) },
            // B391: destructive last, after a divider (Hide is reversible, so
            // it stays above it).
            { label: null },
            { label: 'Delete profile',    onClick: () => { void handleDeleteCharacter(menu.character) } },
          ] satisfies CtxItem[]}
        />
      )}

      {editingNotes && (
        <CharacterNotesEditor
          characterName={editingNotes.name}
          initialGuild={editingNotes.guild}
          initialCircle={editingNotes.circle}
          initialNotes={editingNotes.notes}
          onSave={(patch) => handleSaveNotes(editingNotes, patch)}
          onCancel={() => setEditingNotes(null)}
        />
      )}
    </div>
  )
}
