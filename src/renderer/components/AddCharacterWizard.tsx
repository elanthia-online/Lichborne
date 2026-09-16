// Add Account wizard — the two-step, ACCOUNT-driven discovery flow that turns
// one SimuCo login into a launcher tile per character (rewritten v0.8.0).
// The design rationale is in the block below the imports.
//
// Step 1 collects account + password + game and calls main's
// `eaccessFetchCharacters` (no Lich, no game connection); step 2 is a
// checklist of the roster, with already-added characters disabled. Finish
// writes one stub `CharacterProfile` YAML per pick via
// `window.api.writeCharacterProfile` — or RESTORES an archived profile of
// that name instead, so remove-and-re-add never clobbers a saved setup — and
// then `onCompleted(added)` lets the launcher refresh (it also pre-expands the
// new account in `lichborne.launcher.expandedAccounts`). Nothing connects
// here. Two orderings to keep: the password is saved ONLY after EAccess
// accepted it (a typo must never auto-fill later), and a same-account
// conflict raises the disconnect-and-continue modal (mirroring App's
// `handleCardConnect`) before discovery runs. `prefillAccount` is set only by
// the per-account "↺ Refresh" path; the blank "+ Add account" path starts
// empty by design (v0.18.2).

import { useState, useEffect, useId, type KeyboardEvent } from 'react'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { createPortal } from 'react-dom'
import { GAMES, IS_MAC, IS_WINDOWS } from '../lichSettings'
import { useSessions } from '../SessionsContext'
import type { CharacterProfile } from '../profile-types'
import '../styles/wizard.css'

// AddCharacterWizard — Add-Account discovery flow (rewritten v0.8.0).
//
// Pre-v0.8.0 this was a per-character flow: account + password + mode + game +
// character name → connect → store. One character per wizard run. For users
// with several characters (multiboxers, alts) that was N round-trips through
// the same form.
//
// Now: a single account-level pass. The user enters account + password + game;
// Lichborne calls EAccess (the SimuCo auth service, eaccess.play.net:7910)
// which returns the full character roster for that account/game; the user
// picks which characters to add as tiles via a checkbox list; one stub YAML
// per checked character lands in the profiles folder; the launcher refreshes.
// No connection is made — picking a character to actually log in is a separate
// click on the tile afterwards.
//
// Lich/Direct is deliberately NOT a step in this flow — tiles default to Lich
// (the recommended path); flipping a tile to Direct is a single click on the
// LICH badge after creation. Same for DRT: tiles default to DR, the per-tile
// Test checkbox switches a character to DRT.
//
// `onCompleted` is called when at least one tile was created so the launcher
// can refresh. `prefillAccount` lets the "↺ Refresh from account" button on a
// launcher header start the wizard with the account pre-typed.

interface Props {
  onCompleted: (addedCount: number) => void
  onCancel: () => void
  prefillAccount?: string
  // Set when the wizard was opened FOR the user rather than BY them (today:
  // connecting a character whose password is not saved). Rendered at the top of
  // step 1 so the trip here is never unexplained.
  reason?: string
  // Opens the Lich Setup dialog. Surfaced as a small link in the footer so
  // users can fix path/port issues without abandoning their input.
  onOpenLichSetup: () => void
}

type Step = 1 | 2

interface DiscoveredCharacter {
  name: string
  existing: boolean   // already has a profile YAML — checkbox disabled
}

// An Esc-to-close entry for an inline dialog, registered while it is MOUNTED —
// useEscapeClose's stack is mount-ordered, so the conflict prompt below sits
// above the wizard and Esc closes only the prompt (B341).
function EscToClose({ onClose }: { onClose: () => void }) {
  useEscapeClose(onClose)
  return null
}

export default function AddCharacterWizard({ onCompleted, onCancel, onOpenLichSetup, prefillAccount, reason }: Props) {
  const { sessions } = useSessions()

  const [step,     setStep]     = useState<Step>(1)
  // ADD ACCOUNT STARTS BLANK (Sekmeht, v0.18.2). `prefillAccount` is set ONLY by
  // the per-account "↺ Refresh" button, which deliberately re-opens this wizard
  // for a KNOWN account. The old `?? localStorage.getItem('lichborne.account')`
  // fallback also fired on the blank "+ Add account" path, so that button
  // silently pre-filled your LAST-USED account — it looked like adding a new
  // account while actually re-submitting an existing one, re-saving its stored
  // password along the way. An empty field is the honest default; the refresh
  // path still gets its prefill because it passes one explicitly.
  const [account,  setAccount]  = useState(prefillAccount ?? '')
  const [password, setPassword] = useState('')
  // Reveal the password while typing it (Zithri, v0.18.2). This is the only
  // place in the live UI where an account password is TYPED rather than reused
  // from the OS credential store, and a silent typo here surfaces much later as
  // "the login doesn't work" — a support round-trip for something the user
  // could have seen. Local state only: never persisted, and gone the moment the
  // wizard closes.
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(() => localStorage.getItem('lichborne.rememberPassword') === 'true')
  const [game,     setGame]     = useState<string>('DR')

  const [discovered, setDiscovered] = useState<DiscoveredCharacter[]>([])
  const [picked,     setPicked]     = useState<Set<string>>(new Set())

  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  // v0.18.0 cross-platform: password saving rides Electron safeStorage, which
  // on Linux needs a secret service (GNOME Keyring / KWallet). When absent,
  // savePassword silently no-ops — surface that instead of letting "Remember
  // password" look broken. true until proven otherwise (Windows/mac always
  // have it; no notice flash while the async check resolves).
  const [secureStore, setSecureStore] = useState(true)
  useEffect(() => {
    let cancelled = false
    window.api.secureStorageAvailable?.().then(ok => { if (!cancelled) setSecureStore(ok) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Auto-load saved password when the account field matches a saved one.
  // Same pattern as the pre-rewrite wizard.
  useEffect(() => {
    if (!account) return
    let cancelled = false
    window.api.loadPassword(account).then(pw => { if (!cancelled && pw !== null) setPassword(pw) })
    return () => { cancelled = true }
  }, [account])

  // Same-account conflict modal (mirrors App.tsx handleCardConnect). When
  // the user finishes step 1 and the account already has a character
  // connected, we offer to disconnect it and proceed rather than flat-refuse.
  const [pendingConflict, setPendingConflict] = useState<{ character: string; sessionId: string; game: string } | null>(null)
  const [conflictBusy, setConflictBusy] = useState(false)

  // B341: Esc does what the header ✕ does — which stays live even mid-fetch.
  useEscapeClose(onCancel)
  const titleId = useId()

  // B389: Enter in the Account or Password field advances, as it does in
  // every other form. There's no <form> here (the footer buttons live outside
  // the body), so each step-1 field handles the key itself.
  function onStep1Enter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || busy) return
    e.preventDefault()
    void nextFromStep1()
  }

  function backOne() {
    setError('')
    if (step === 2) setStep(1)
  }

  async function nextFromStep1() {
    if (!account.trim() || !password) { setError('Account and password are required.'); return }

    // Same-account guard. We're about to call EAccess against this account;
    // if another character is currently connected on it, SGE will refuse
    // (and DR rule is "one character per account per shard" anyway). Offer
    // the same auto-disconnect confirmation modal as the launcher's
    // tile-click conflict path.
    const conflict = sessions.find(s => s.account.toLowerCase() === account.toLowerCase() && s.status.connected)
    if (conflict) {
      setPendingConflict({ character: conflict.character, sessionId: conflict.sessionId, game: conflict.game })
      return
    }

    await runDiscovery()
  }

  async function runDiscovery() {
    setError('')
    localStorage.setItem('lichborne.account', account)
    localStorage.setItem('lichborne.rememberPassword', String(remember))

    setBusy(true)
    const result = await window.api.eaccessFetchCharacters(account, password, game)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.characters.length === 0) {
      setError(`No characters found on this account for ${game}.`)
      return
    }

    // Persist password ONLY after EAccess accepted it (v0.8.0 bug 2 fix).
    // Pre-fix this ran before the eaccess call — a typo'd password would
    // get saved to DPAPI and auto-fill the wrong value on the next visit.
    if (remember) await window.api.savePassword(account, password)

    // Annotate each discovered character with whether a YAML already exists
    // — those checkboxes start unchecked and disabled, with a "(already
    // added)" badge in the row. Avoids accidental overwrite of automations.
    const existingNames = new Set(
      (await window.api.listCharacterProfiles()).map(n => n.toLowerCase())
    )
    const annotated: DiscoveredCharacter[] = result.characters.map(c => ({
      name: c.name,
      existing: existingNames.has(c.name.toLowerCase()),
    }))
    setDiscovered(annotated)
    // Default selection: every non-existing character.
    setPicked(new Set(annotated.filter(c => !c.existing).map(c => c.name)))
    setStep(2)
  }

  function togglePick(name: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function finish() {
    const names = [...picked]
    if (names.length === 0) {
      setError('Select at least one character to add.')
      return
    }
    setError('')
    setBusy(true)

    // Snapshot the set of distinct accounts BEFORE adding new stubs so the
    // auto-expand logic below can detect a 1→2+ transition. We don't care
    // about expansion state for the 2→3+ case — those existing accounts
    // already have their own user-chosen collapse state.
    const priorAccounts = new Set<string>()
    try {
      const existing = await window.api.listCharacterProfiles()
      const reads = await Promise.all(
        existing.map(n => window.api.readCharacterProfile(n).catch(() => null)),
      )
      for (const raw of reads) {
        if (raw && typeof raw === 'object') {
          const p = raw as Partial<CharacterProfile>
          if (p.account) priorAccounts.add(p.account)
        }
      }
    } catch { /* fall back to default behavior (just expand the new account) */ }

    // A character removed with its account was ARCHIVED, not deleted, so adding
    // the account back must restore that profile rather than overwrite it with
    // a blank stub — otherwise "remove and re-add" silently destroys the themes,
    // layout, automations and contacts the archive existed to protect.
    // Read once: the wizard adds a whole account at a time, so one lookup
    // covers every character in the loop below.
    let archived = new Set<string>()
    try {
      archived = new Set((await window.api.listArchivedProfiles()).map(n => n.toLowerCase()))
    } catch { /* no archive, or unreadable — every character just gets a stub */ }

    // Stub profile per checked character. No `state` — the character has
    // nothing saved yet; their first connect creates real entries via the
    // dynamic-state pipeline.
    let added = 0
    for (const name of names) {
      // Restore wins when there is something to restore. It is deliberately
      // guarded main-side too: restore refuses to clobber a live profile of the
      // same name, so a character recreated while archived keeps its real
      // settings and the stale archive copy is left alone.
      if (archived.has(name.toLowerCase())) {
        try {
          if (await window.api.restoreCharacterProfile(name)) {
            added += 1
            continue
          }
        } catch (err) {
          console.error(`Failed to restore archived profile for ${name}`, err)
        }
      }
      const stub: CharacterProfile = {
        profileVersion: 2,
        account,
        character: name,
        game,
        useLich: true,
        theme: localStorage.getItem('lichborne.theme') ?? 'classic',
        state: {},
      }
      try {
        await window.api.writeCharacterProfile(name, stub)
        added += 1
      } catch (err) {
        console.error(`Failed to create profile for ${name}`, err)
      }
    }

    // v0.8.0 UX pass: auto-expand the just-added account in the launcher so
    // the user lands back on visible tiles instead of a collapsed bar.
    // Launcher re-reads this key on refreshKey change (bumped by App.tsx
    // when onCompleted fires with addedCount > 0).
    //
    // **1→2+ transition special case:** when the user previously had exactly
    // one account (always rendered expanded under the single-account rule)
    // and just added a different account, also expand the prior account.
    // Without this, the formerly-only account would collapse the moment the
    // multi-account rule kicks in — surprising and disorienting.
    if (added > 0) {
      try {
        const raw = localStorage.getItem('lichborne.launcher.expandedAccounts')
        const set = new Set<string>()
        if (raw) {
          const arr = JSON.parse(raw)
          if (Array.isArray(arr)) for (const v of arr) if (typeof v === 'string') set.add(v)
        }
        set.add(account)
        const isOneToTwoTransition = priorAccounts.size === 1 && !priorAccounts.has(account)
        if (isOneToTwoTransition) {
          for (const a of priorAccounts) set.add(a)
        }
        localStorage.setItem('lichborne.launcher.expandedAccounts', JSON.stringify([...set]))
      } catch { /* localStorage unavailable — auto-expand silently fails, not a blocker */ }
    }

    setBusy(false)
    onCompleted(added)
  }

  async function continueWithDisconnect() {
    if (!pendingConflict) return
    setConflictBusy(true)
    try {
      await window.api.disconnectAwait(pendingConflict.sessionId)
      setPendingConflict(null)
      setConflictBusy(false)
      await runDiscovery()
    } catch (err) {
      setError(`Failed to disconnect ${pendingConflict.character}: ${String(err)}`)
      setPendingConflict(null)
      setConflictBusy(false)
    }
  }

  function cancelConflict() {
    if (conflictBusy) return
    setPendingConflict(null)
  }

  const allChecked = discovered.length > 0 && discovered.filter(d => !d.existing).every(d => picked.has(d.name))
  const newCount = discovered.filter(d => !d.existing).length

  return createPortal(
    <div className="wiz-backdrop" {...backdropHandlers(() => onCancel())}>
      <div className="wiz-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>

        <div className="wiz-header">
          <span className="wiz-title" id={titleId}>Add account</span>
          <span className="wiz-step">Step {step} of 2</span>
          <button type="button" className="ui-close" onClick={onCancel} title="Close" aria-label="Close">✕</button>
        </div>

        <div className="wiz-body">
          {step === 1 && (
            <>
              <p className="wiz-hint">
                Enter your account, and Lichborne will fetch your character list and add a tile for each one.
                You can pick which characters to include before saving.
              </p>

              <label className="wiz-label">
                Account
                <input
                  type="text"
                  value={account}
                  onChange={e => setAccount(e.target.value)}
                  onKeyDown={onStep1Enter}
                  autoComplete="username"
                  // B397: the ↺ Refresh path arrives with the account filled
                  // in, so the field you still have to type in is the password.
                  autoFocus={!prefillAccount}
                  disabled={busy}
                />
              </label>

              {reason && <div className="wiz-reason">{reason}</div>}

              <label className="wiz-label">
                Password
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={onStep1Enter}
                  autoComplete="current-password"
                  autoFocus={!!prefillAccount}
                  disabled={busy}
                />
              </label>

              <label className="wiz-checkbox">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={e => setShowPassword(e.target.checked)}
                  disabled={busy}
                />
                Show password
              </label>

              <label className="wiz-checkbox">
                <input
                  type="checkbox"
                  checked={remember && secureStore}
                  onChange={e => setRemember(e.target.checked)}
                  disabled={busy || !secureStore}
                />
                Remember password
              </label>
              {!secureStore && (
                <p className="wiz-hint">
                  {/* Named the Linux keyrings on every platform, which is
                      baffling advice on macOS or Windows. safeStorage backs onto
                      Keychain / DPAPI / libsecret respectively, so the guidance
                      has to follow the platform. */}
                  Password saving is unavailable — this machine's secure credential
                  store could not be reached
                  {IS_MAC
                    ? ' (macOS Keychain).'
                    : IS_WINDOWS
                      ? ' (Windows Credential Manager).'
                      : ' — install GNOME Keyring or KWallet to enable it.'}
                  {' '}You can still connect by typing the password each time.
                </p>
              )}

              <div className="wiz-section-label">Game</div>
              <div className="wiz-game-list">
                {GAMES.filter(g => g.code !== 'DRT').map(g => (
                  <label key={g.code} className={`wiz-game${game === g.code ? ' wiz-game--active' : ''}`}>
                    <input type="radio" checked={game === g.code} onChange={() => setGame(g.code)} disabled={busy} />
                    <span className="wiz-game-name">{g.name}</span>
                    <span className="wiz-game-code">{g.code}</span>
                  </label>
                ))}
              </div>
              <p className="wiz-hint" style={{ marginTop: 8 }}>
                Prime Test (DRT) shares its characters with DR — pick DR here, then flip the Test toggle on individual tiles after.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="wiz-section-label">
                Found {discovered.length} character{discovered.length === 1 ? '' : 's'} on {account} ({game})
              </div>
              {newCount > 0 && (
                <label className="wiz-checkbox" style={{ marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={e => {
                      if (e.target.checked) setPicked(new Set(discovered.filter(d => !d.existing).map(d => d.name)))
                      else setPicked(new Set())
                    }}
                    disabled={busy}
                  />
                  Select all new
                </label>
              )}
              <div className="wiz-char-list">
                {discovered.map(c => (
                  <label
                    key={c.name}
                    className={`wiz-char${picked.has(c.name) ? ' wiz-char--active' : ''}${c.existing ? ' wiz-char--existing' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(c.name)}
                      onChange={() => togglePick(c.name)}
                      disabled={busy || c.existing}
                    />
                    <span className="wiz-char-name">{c.name}</span>
                    {c.existing && <span className="wiz-char-existing-badge">already added</span>}
                  </label>
                ))}
              </div>
              {newCount === 0 && (
                <p className="wiz-hint" style={{ marginTop: 8 }}>
                  All characters from this account are already in your launcher.
                </p>
              )}
            </>
          )}

          {error && <div className="wiz-error">{error}</div>}
        </div>

        {/* Footer order (UX standard #10): the side trip on the left, then
            Cancel · Back · the primary action. Every button is `ui-btn`, so
            they share one metrics rule (pitfall #113). */}
        <div className="ui-modal-foot wiz-footer">
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            onClick={onOpenLichSetup}
            disabled={busy}
            title={busy ? 'Wait for the account check to finish' : 'Check or change the Ruby and Lich paths without losing what you typed here'}
          >
            ⚙ Lich Setup…
          </button>
          <span className="ui-modal-foot-spacer" />
          <button
            type="button"
            className="ui-btn"
            onClick={onCancel}
            disabled={busy}
            title={busy ? 'Wait for the account check to finish, or close with ✕' : undefined}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ui-btn"
            onClick={backOne}
            disabled={busy || step === 1}
            title={step === 1 ? 'This is the first step' : busy ? 'Wait for the account check to finish' : undefined}
          >
            ← Back
          </button>
          {step === 1 ? (
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={nextFromStep1}
              disabled={busy}
              title={busy ? 'Checking your account with Simutronics…' : undefined}
            >
              {busy ? 'Fetching…' : 'Next →'}
            </button>
          ) : (
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={finish}
              disabled={busy || picked.size === 0}
              title={picked.size === 0 ? 'Tick at least one character above' : undefined}
            >
              {busy
                ? 'Saving…'
                : picked.size === 0
                  ? 'Pick at least one'
                  : `Add ${picked.size} ${picked.size === 1 ? 'character' : 'characters'}`}
            </button>
          )}
        </div>

        {pendingConflict && (
          <div className="launcher-connecting" {...backdropHandlers(() => cancelConflict(), !conflictBusy)}>
            {/* cancelConflict is a no-op mid-disconnect, so Esc is swallowed
                then rather than falling through to close the wizard. */}
            <EscToClose onClose={cancelConflict} />
            <div className="launcher-connecting-card launcher-dialog">
              <div className="launcher-dialog-head">Account already in use</div>
              <div className="launcher-dialog-body">
                <div>
                  <span className="launcher-connecting-name">{pendingConflict.character}</span>{' '}
                  is currently connected on account <strong>{account}</strong> ({pendingConflict.game}).
                </div>
                <div className="launcher-dialog-note">
                  DragonRealms only allows one character per account at a time, and discovery has to authenticate as this account.
                  Continue and {pendingConflict.character} will be disconnected automatically before discovery runs.
                  The disconnected tab stays open in case you want to log back into it later.
                </div>
              </div>
              <div className="launcher-dialog-foot">
                <button className="launcher-connecting-cancel" onClick={cancelConflict} disabled={conflictBusy}>
                  Cancel
                </button>
                <button
                  className="launcher-connecting-cancel launcher-connecting-cancel--primary"
                  onClick={continueWithDisconnect}
                  disabled={conflictBusy}
                >
                  {/* The character is named twice in the text above, so the
                      button does not repeat it — interpolating a name made this
                      the longest label in the wizard and its width depended on
                      whose character it was. */}
                  {conflictBusy ? 'Disconnecting…' : 'Disconnect and continue'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body,
  )
}
