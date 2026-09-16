import { useState, useEffect, useRef, useId } from 'react'
import type { SimuCoinStatus } from '../../shared/types'
import {
  loadSimuCoinConfig, accountConfig, fmtCoins, fmtCheckedAgo,
  SIMUCOIN_KEY, SIMUCOIN_CHANGED_EVENT, type SimuCoinConfig,
} from '../simucoinConfig'
import { showToast } from '../toasts'
import '../styles/simucoin.css'

// SimuCoin coin button + popover (F71, v0.18.0 — DESIGN §42).
//
// Simutronics gives subscribers a monthly free-SimuCoin allotment that must be
// manually claimed on store.play.net; this surfaces it in the app bar. Quiet by
// default (UX standard #1): the button renders ONLY when there's something to
// say — coins waiting, a claim just made, or an account the user opted in that
// needs attention. Nothing is checked, and nothing touches the network, until
// the account is explicitly consented (DESIGN §42.3).
//
// App-level (per ACCOUNT, no session context) — so it lives in the AppBar, not
// a GameWindow panel (pitfall #57: app chrome can't read per-session context).

interface Props {
  /** Distinct account names from the launcher's character profiles. */
  accounts: string[]
  /** Accounts with a saved password — the only ones this can work for. */
  withPassword: Set<string>
  statuses: Record<string, SimuCoinStatus>
  /** Runs a check (and claim when asked); resolves when the status has updated.
   *  `quiet` suppresses that account's own toast — used by the multi-account
   *  collect below, which reports the whole batch once instead. */
  onRun: (account: string, claim: boolean, quiet?: boolean) => Promise<SimuCoinStatus | null>
  /** Accounts with a check/claim in flight. */
  busy: Set<string>
}

const coinsOf = (s: SimuCoinStatus | undefined) => (s?.state === 'claimable' ? s.amount ?? 0 : 0)

/** Coarse "time until" for the next-bonus line — days/hours is all the store
 *  itself reports, so there is nothing finer to be honest about. */
function fmtUntil(at: number): string {
  const mins = Math.max(0, Math.round((at - Date.now()) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  if (d > 0) return `${d}d, ${h}h`
  if (h > 0) return `${h}h`
  return `${mins}m`
}

// A struck COPPER/BRONZE coin: rim → face → inner bevel → an "S" → a sweeping
// specular highlight. Colors are BAKED (not theme vars) because this is a
// depicted OBJECT, not chrome — the Principle #4 exception the map tiles and the
// moons' lore colors already set. The DULL state is produced in CSS (a light
// desaturation) rather than a second palette, so the two can never drift.
//
// Copper rather than the original gold (Sekmeht, v0.19.0): gold's value sits
// very close to a light theme's background and its desaturated form is close to
// a dark one's, so it had no reliable separation at either end. Copper is a
// mid-tone hue with warmth on both. The one thing NOT baked is the outer ring —
// it is mixed from `--text-primary` in CSS, so the coin keeps a visible edge on
// any theme. That split is standard #9a's rider: the depicted object keeps its
// palette, the chrome around it comes from theme vars.
//
// Def ids are namespaced per instance via useId (pitfall #95): `url(#id)`
// resolves against the FIRST match in the document, so a second mounted copy
// would hijack the first's gradients.
function CoinFace({ uid }: { uid: string }) {
  const g = (n: string) => `${uid}-${n}`
  return (
    <svg className="sc-coin" viewBox="0 0 24 24" aria-hidden focusable="false">
      <defs>
        {/* Face: light from the upper-left, deepening to a warm shadow. */}
        <radialGradient id={g('face')} cx="35%" cy="30%" r="78%">
          <stop offset="0%"   stopColor="#ffe3c6" />
          <stop offset="38%"  stopColor="#e4a165" />
          <stop offset="72%"  stopColor="#bd6f38" />
          <stop offset="100%" stopColor="#7d4318" />
        </radialGradient>
        {/* Rim: a bright top-left arc into a dark bottom-right for thickness. */}
        <linearGradient id={g('rim')} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%"   stopColor="#ffd2a3" />
          <stop offset="45%"  stopColor="#ad6530" />
          <stop offset="100%" stopColor="#663312" />
        </linearGradient>
        {/* The travelling sheen (animated in CSS; frozen when epilepsy-safe). */}
        <linearGradient id={g('sheen')} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%"  stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g('clip')}><circle cx="12" cy="12" r="10.5" /></clipPath>
      </defs>

      <circle cx="12" cy="12" r="11" fill={`url(#${g('rim')})`} />
      {/* Theme-derived hairline so the coin separates from ANY app-bar
          background — the one part of this artwork that is not baked. */}
      <circle className="sc-coin-ring" cx="12" cy="12" r="11.3" />
      <circle cx="12" cy="12" r="9.1" fill={`url(#${g('face')})`} />
      {/* Inner bevel ring — reads as a struck edge. */}
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="#5f3313" strokeOpacity=".45" strokeWidth=".7" />
      {/* Struck "S" for SimuCoin, with a light top edge so it looks embossed. */}
      <text className="sc-coin-mark" x="12" y="12" textAnchor="middle" dominantBaseline="central">S</text>
      {/* Static top-left glint. */}
      <ellipse cx="8.6" cy="7.9" rx="3.1" ry="2.1" fill="#fff2e4" opacity=".5" transform="rotate(-32 8.6 7.9)" />
      {/* Sweeping specular band, clipped to the coin. */}
      <g clipPath={`url(#${g('clip')})`}>
        <rect className="sc-coin-sheen" x="-16" y="-4" width="9" height="32" fill={`url(#${g('sheen')})`} transform="rotate(18 12 12)" />
      </g>
    </svg>
  )
}

export default function SimuCoinButton({ accounts, withPassword, statuses, onRun, busy }: Props) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<SimuCoinConfig>(() => loadSimuCoinConfig())
  const ref = useRef<HTMLDivElement>(null)
  // Per-instance SVG def-id namespace (pitfall #95).
  const uid = 'sc' + useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    // preventDefault: consumed here, so the Esc-to-close hook doesn't also
    // close a dialog underneath (B341).
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Consent sync. This component no longer WRITES config — setup (the
  // disclosure + per-account toggle + auto-claim) moved to Settings → SimuCoins
  // in v0.18.1 — so it only has to NOTICE changes, from two directions:
  //   • `storage` — another WINDOW enabled/disabled an account;
  //   • SIMUCOIN_CHANGED_EVENT — THIS window's Settings did. A storage event
  //     never fires in the window that wrote it, so without this the coin kept
  //     offering to set up an account you'd just enabled.
  // (App.runSimucoin re-reads consent at the choke point regardless — this is
  // only the UI half.)
  useEffect(() => {
    const reload = () => setCfg(loadSimuCoinConfig())
    function onStorage(e: StorageEvent) { if (e.key === SIMUCOIN_KEY) reload() }
    window.addEventListener('storage', onStorage)
    document.addEventListener(SIMUCOIN_CHANGED_EVENT, reload)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener(SIMUCOIN_CHANGED_EVENT, reload)
    }
  }, [])

  // "Set up in Settings…" — the coin is app-level chrome and Settings is
  // per-session (pitfall #57), so this goes through a DOM event the active
  // GameWindow answers (the `lichborne:open-quick-send` precedent), carrying
  // the section so the user LANDS on SimuCoins instead of hunting for it.
  // "Collect available coins" across every account holding some.
  //
  // ONE account keeps the normal path verbatim — its own per-account toast is
  // strictly more informative than a summary of one. TWO OR MORE run `quiet`
  // and report once, because the old behaviour stacked a separate toast per
  // account and a collect across several buried the screen.
  //
  // Runs are fired together on purpose: main serializes them globally
  // (pitfall #101 — they share one cookie jar), and App.runSimucoin tracks
  // `busy` per account with functional setState, so concurrent completions
  // can't clobber each other. `anyBusy` disables the button meanwhile.
  async function collectAll(accounts: string[]) {
    if (accounts.length === 1) { void onRun(accounts[0], true); return }
    const results = (await Promise.all(accounts.map(a => onRun(a, true, true))))
      .filter((r): r is SimuCoinStatus => r != null)
    const claimed = results.filter(r => r.state === 'claimed')
    const total = claimed.reduce((n, r) => n + (r.amount ?? 0), 0)
    const failed = results.filter(r => r.state === 'auth-failed' || r.state === 'error')
    const plural = (n: number) => (n === 1 ? '' : 's')
    if (claimed.length === 0) {
      showToast({
        kind: 'error', title: 'SimuCoins',
        message: `Couldn't claim on ${failed.length || accounts.length} account${plural(failed.length || accounts.length)} — see Settings → SimuCoins.`,
      })
    } else {
      showToast({
        kind: failed.length ? 'info' : 'success',
        title: 'SimuCoins claimed',
        message: `${total} claimed across ${claimed.length} account${plural(claimed.length)}`
          + (failed.length ? ` — ${failed.length} couldn't be reached.` : '.'),
      })
    }
  }

  function openSetup() {
    setOpen(false)
    document.dispatchEvent(new CustomEvent('lichborne:open-settings', { detail: { section: 'SimuCoins' } }))
  }

  // Eligible = the user opted this account in AND a saved password exists (the
  // store sign-in has no other credential source).
  const eligible = accounts.filter(a => accountConfig(cfg, a).consented && withPassword.has(a))
  // Offerable = could be opted in (has a password) but hasn't been yet.
  const offerable = accounts.filter(a => !accountConfig(cfg, a).consented && withPassword.has(a))

  const readyAccounts = eligible.filter(a => coinsOf(statuses[a]) > 0)
  const claimable = eligible.reduce((n, a) => n + coinsOf(statuses[a]), 0)
  const anyBusy = eligible.some(a => busy.has(a))
  const problemAccounts = eligible.filter(a => {
    const st = statuses[a]?.state
    return st === 'auth-failed' || st === 'error'
  })
  const anyProblem = problemAccounts.length > 0

  // Soonest known next-bonus time across enabled accounts. `nextAt` is only
  // ever set from the store's OWN countdown and is null when unknown (DESIGN
  // §42 — the feature never guesses one), so this is safe to show; with none
  // reported we just say nothing rather than invent a date.
  const nextAt = eligible
    .map(a => statuses[a]?.nextAt)
    .filter((n): n is number => typeof n === 'number' && n > Date.now())
    .sort((a, b) => a - b)[0]

  // Last-known balance, aggregated to ONE fixed line — never a row per account
  // (pitfall #109: a surface that grows with the roster is what made this
  // popover unusable and forced the rewrite). Per-account detail is Settings'
  // job.
  //
  // Only accounts with a KNOWN balance are summed, and when that isn't all of
  // them the line says so ("across 2 of 3 accounts") rather than presenting a
  // partial total as complete. The age comes from the OLDEST reading in the
  // sum, because that is the honest bound on how current the total is —
  // quoting the newest would overstate it.
  const balances = eligible
    .map(a => accountConfig(cfg, a))
    .filter(c => Number.isFinite(c.lastBalance as number) && Number.isFinite(c.lastCheckedAt as number))
  const balanceTotal = balances.reduce((n, c) => n + (c.lastBalance as number), 0)
  const oldestCheck = balances.length ? Math.min(...balances.map(c => c.lastCheckedAt as number)) : 0
  const balanceLine = balances.length === 0
    ? null
    : balances.length === 1
      ? `Balance ${fmtCoins(balanceTotal)} · checked ${fmtCheckedAgo(oldestCheck)}`
      : `Balance ${fmtCoins(balanceTotal)} across ${balances.length}${
          balances.length < eligible.length ? ` of ${eligible.length}` : ''
        } accounts · checked ${fmtCheckedAgo(oldestCheck)}`

  // ONE summary line instead of a row per account. The popover has to stay the
  // same size whether you have one account or ten (Sekmeht) — a list that grows
  // with the roster is what made this surface unusable in the first place, and
  // per-account detail now has a proper home in Settings → SimuCoins.
  const summary = anyBusy
    ? 'Checking the store…'
    : claimable > 0
      ? `${claimable} free SimuCoin${claimable === 1 ? '' : 's'} waiting${readyAccounts.length > 1 ? ` across ${readyAccounts.length} accounts` : ''}.`
      : anyProblem
        ? `Couldn't check ${problemAccounts.length} account${problemAccounts.length === 1 ? '' : 's'} — details in Settings → SimuCoins.`
        : nextAt
          ? `Nothing to claim right now — next bonus in ${fmtUntil(nextAt)}.`
          : 'Nothing to claim right now.'

  // QUIET BY DEFAULT: with nothing opted in and nothing to offer, render
  // nothing at all — no dead icon in the bar for players who don't use this.
  if (eligible.length === 0 && offerable.length === 0) return null

  const state = claimable > 0 ? 'ready' : anyProblem ? 'problem' : 'idle'
  const title = claimable > 0
    ? `${claimable} free SimuCoin${claimable === 1 ? '' : 's'} waiting — click to claim`
    : eligible.length === 0
      ? 'SimuCoins — set up monthly claim checking'
      : anyProblem ? 'SimuCoins — check failed (click for details)'
      : 'SimuCoins — nothing to claim right now'

  return (
    <div className="sc-wrap" ref={ref}>
      <button
        className={`sc-btn sc-btn--${state}${anyBusy ? ' sc-btn--busy' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={title}
        aria-label={title}
      >
        <CoinFace uid={uid} />
        {claimable > 0 && <span className="sc-badge">{claimable}</span>}
      </button>

      {open && (
        <div className="sc-menu">
          <div className="sc-menu-head">SimuCoins</div>

          {/* FIXED SIZE, whatever the roster looks like (Sekmeht, v0.18.1).
              This popover carries ONE summary line and ONE action; it does not
              render a row per account, because a surface that grows with the
              account list is exactly what broke here (JadedSoul's 7 accounts
              produced a popover several screens tall — see the ceiling comment
              in simucoin.css for why that was worse than merely long). Setup
              and per-account state live in Settings → SimuCoins. */}
          {eligible.length === 0 ? (
            <div className="sc-intro">
              Simutronics gives subscribers free SimuCoins every month. They have to be
              claimed, and they expire if you don't — Lichborne can watch for them.
            </div>
          ) : (
            <>
              <div className="sc-summary">{summary}</div>
              {balanceLine && <div className="sc-balance">{balanceLine}</div>}
            </>
          )}

          {/* The one action the coin exists for. */}
          {claimable > 0 && (
            <button
              className="sc-act sc-act--primary sc-wide"
              disabled={anyBusy}
              onClick={() => { void collectAll(readyAccounts) }}
            >
              Collect available coins
            </button>
          )}

          {eligible.length > 0 && (
            <button
              className="sc-act sc-wide"
              disabled={anyBusy}
              onClick={() => { for (const a of eligible) void onRun(a, false) }}
            >
              {anyBusy ? 'Checking…' : 'Check now'}
            </button>
          )}

          {/* Discovery: the coin still appears for accounts that COULD be
              enabled (that's how anyone finds this feature), but it now points
              at the setup surface instead of hosting it. */}
          {offerable.length > 0 && (
            <button className="sc-act sc-wide sc-setup" onClick={openSetup}>
              {eligible.length === 0
                ? 'Set up in Settings…'
                : `Set up ${offerable.length} more account${offerable.length === 1 ? '' : 's'}…`}
            </button>
          )}

          <div className="sc-foot">
            Free SimuCoins are a monthly subscriber perk from Simutronics and must be claimed.
            {' '}Checked once per launch. Accounts, per-account status and auto-claim live in
            {' '}<strong>Settings → SimuCoins</strong>.
          </div>
        </div>
      )}
    </div>
  )
}

/** Toast for a finished run — shared by the coin button and `/simucoin`. */
export function simucoinToast(st: SimuCoinStatus): void {
  if (st.state === 'claimed') {
    showToast({
      kind: 'success', title: 'SimuCoins claimed',
      message: `${st.amount} claimed on ${st.account}${st.balance != null ? ` — balance ${st.balance}` : ''}.`,
    })
  } else if (st.state === 'claimable') {
    // No "click the coin in the top bar" here: the app bar (and the coin with
    // it) only renders once a character tab exists, and the startup pass can
    // fire this while the user is still sitting on the launcher.
    showToast({
      kind: 'info', title: 'Free SimuCoins waiting',
      message: `${st.amount} ready to claim on ${st.account} — use /simucoin claim, or the coin in the top bar once you're connected.`,
    })
  } else if (st.state === 'auth-failed') {
    showToast({
      kind: 'error', title: 'SimuCoins',
      message: `Couldn't sign in to the store for ${st.account}${st.message ? ` — ${st.message}` : ''}.`,
    })
  } else if (st.state === 'error') {
    showToast({
      kind: 'error', title: 'SimuCoins',
      message: `Couldn't reach the store for ${st.account}${st.message ? ` — ${st.message}` : ''}.`,
    })
  }
}
