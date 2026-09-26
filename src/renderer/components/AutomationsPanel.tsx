// Automations panel — the tabbed host for every native rule editor:
// Highlights · Triggers · Macros · Aliases · Mutes · Substitutes · Groups · Colors.
//
// It renders no rule UI of its own. It owns the things the editors share:
//   - the F37 SCOPE switch (v0.15.2): "This Character" vs "All Characters".
//     Global rules are a SEPARATE STORE under the virtual `_global` character
//     scope, so the six rule panels run UNCHANGED inside a re-pointed
//     `CharacterProvider` — their own load/save/analytics land on the
//     `_global` keys, which ride `_shared.yaml` instead of the character YAML.
//     `handleSaved` adds the shared-YAML flush + the same-window
//     `lichborne:global-rules-changed` event for that scope. Groups & Modes is
//     per-character only and Colors is app-wide; on both the switch renders
//     DISABLED in place, never hidden.
//   - ColorManageContext (F115, v0.19.8): every ColorField inside gets
//     "Manage colors…", which switches to the Colors tab through the guard.
//   - F63 `moveRuleScope`: a deliberate MOVE between the two stores (target
//     written FIRST, aborted on a failed write; a content-identical target
//     rule means "remove the source", never a duplicate).
//   - `importNonce`: every tab panel loads its list ONCE on mount, so the
//     ImportWizard's save (and a scope move) bump it to force a remount. Keys
//     are tab-unique because Macros and Aliases are the same component.
//   - the app-wide Automation Analytics toggle (v0.14.4) + the stats prune on
//     open, which must count GLOBAL rule ids as live.
//   - the unsaved-changes SCOPE (B368, v0.19.7): every editor reports its
//     dirty draft through UnsavedContext, and close / Esc / backdrop, the tab
//     and scope switches, and opening Import (whose save remounts every
//     panel) all go through `unsaved.guard`, which asks before dropping one.
// The only import path left here is "Import from another client…" (Wrayth /
// Genie / Frostbite); Lichborne→Lichborne moved to the Launcher's Transfer
// (v0.10.0). Rendered by GameWindow, portaled to document.body.

import { useEffect, useId, useRef, useState } from 'react'
import { backdropHandlers, cancelBackdropPress } from '../utils/backdropClose'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { UnsavedContext, useUnsavedScope } from '../hooks/useUnsaved'
import { createPortal } from 'react-dom'
import { type HighlightRule, loadHighlights } from '../highlights'
import { loadTriggers } from '../triggers'
import { loadMacros, loadAliases } from '../macros'
import { type MuteRule, loadMutes, saveMutes } from '../mutes'
import { type SubstituteRule, loadSubstitutes, saveSubstitutes } from '../substitutes'
import HighlightsPanel from './HighlightsPanel'
import TriggersPanel from './TriggersPanel'
import MacrosPanel from './MacrosPanel'
import MutePanel from './MutePanel'
import SubstitutesPanel from './SubstitutesPanel'
import GroupsModesTab from './GroupsModesTab'
import ColorsPanel from './ColorsPanel'
import { ColorManageContext } from './ColorField'
import ImportWizard from './ImportWizard'
import { useCharacter } from '../CharacterContext'
import { CharacterProvider } from '../CharacterContext'
import { GLOBAL_RULES_SCOPE, asGlobalRules } from '../characterScope'
import { scheduleSharedProfileSave } from '../profile'
import { GLOBAL_RULE_KEYS, sameRuleContent, type GlobalRuleType } from '../ruleIdentity'
import { triggerCompareForm } from '../triggers'
import { saveHighlights } from '../highlights'
import { saveTriggers } from '../triggers'
import { saveMacros, saveAliases } from '../macros'
import { showToast } from '../toasts'
import { loadAnalyticsEnabled, saveAnalyticsEnabled, pruneStats } from '../automationStats'
import '../styles/automations.css'

// v0.10.0: Lichborne→Lichborne export/import moved out of this panel into the
// platform-wide **Transfer** feature (Launcher → Transfer), which is a strict
// superset (settings + layout + theme + view prefs + all automations, with
// category selection and multi-character apply). This panel keeps only the
// "Import from another client" entry point (Wrayth / Genie / Frostbite) — the
// legacy-client migration path that Transfer does not cover.

type Tab = 'highlights' | 'triggers' | 'macros' | 'aliases' | 'mutes' | 'substitutes' | 'groups' | 'colors'

interface Props {
  onClose:              () => void
  onSaved?:             () => void
  onThemeSaved?:        (themeId: string) => void
  initialTab?:          Tab
  /**
   * Bumped by every "open at this tab" request. A request for the tab the
   * dialog opened on is a no-op in React, so `initialTab` never changes and
   * the sync effect never runs — which made "Manage colors…" and
   * `/colors manage` do nothing once you had switched tabs inside the dialog.
   */
  initialTabSeq?:       number
  highlightPrefill?:    HighlightRule
  highlightTestText?:   string
  triggerPrefillPattern?: string
  triggerOpenId?:       string
  mutePrefill?:         MuteRule
  substitutePrefill?:   SubstituteRule
  // v0.14.6: open an existing rule for edit (slash `edit` verbs) — the
  // triggerOpenId pattern extended to the other rule tabs.
  highlightOpenId?:     string
  muteOpenId?:          string
  substituteOpenId?:    string
  aliasOpenId?:         string
  // B368: bumped by the host to ask an OPEN dialog to close (the app-bar
  // button / native menu toggle). Answered with the same guarded close as the
  // ✕, so an unsaved draft asks first. The counter isn't reset between
  // openings, so the value present at mount is ignored.
  closeRequest?:        number
}

// ── Overflow menu (⋯) ────────────────────────────────────────────────────────

// The two header controls that are NOT navigation: the app-wide Automation
// Analytics toggle and the legacy-client import. Both used to be permanent
// furniture in the title bar — "Import from another client…" is 28 characters of
// chrome for something you do once, ever (UX #11) — so they moved behind a ⋯
// that never changes position. The button carries an accent dot while Analytics
// is ON, which is the app bar's own convention for a More menu hiding something
// that is open: the mode stays visible without spending a permanent chip on the
// word "Off" (UX #1).
//
// Built from the shared "$" insert menu (`VarMenu.tsx`, then the Macros-only `MaVarPicker`) because it
// is one of only two popovers already on the RIGHT side of B455 — it moves focus
// into the menu on open and hands it back on Escape — and because it already
// opens from inside this very dialog, so its Esc interaction is proven here.
// Three things it does not do are added:
//   - GroupPicker's placement math (flip above / clamp left / cap the height).
//     A ⋯ in a dialog HEADER sits near the top of the screen, which is exactly
//     where an unclamped down-opening menu misbehaves (pitfall #109).
//   - focus restore on an OUTSIDE click, not only on Escape.
//   - `cancelBackdropPress()`, so the press that dismisses the menu is not ALSO
//     read as a press on the Automations backdrop beneath it (pitfall #146).
//     Without it, one click outside closes the menu AND the whole dialog.
// A shared popover component would be the real fix for all three; none exists
// (B455 records the gap), so this stays local and deliberately small.
//
// Module scope, not nested in the panel, so the menu's open state survives the
// host's re-renders (UX #4).
function AtOverflowMenu({ analyticsOn, onToggleAnalytics, onImport }: {
  analyticsOn: boolean
  onToggleAnalytics: () => void
  onImport: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>(
    { left: 0, maxHeight: 0 })
  const btnRef  = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function dismiss() {
      setOpen(false)
      btnRef.current?.focus()
    }
    function onOutside(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return
      // This press has already done its job (closing the menu) and must not
      // also count as a click on the dialog's backdrop — pitfall #146.
      cancelBackdropPress()
      dismiss()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // preventDefault tells the dialog's own Esc handler (useEscapeClose)
        // that the key was consumed, so Automations stays open — pitfall #141(b).
        e.preventDefault()
        dismiss()
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('.at-more-item') ?? [])
      if (items.length === 0) return
      e.preventDefault()
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1)
      items[next].focus()
    }
    // rAF-throttled: a drag-resize fires continuously, and re-placing is a
    // layout read plus a setState.
    let raf = 0
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place) }
    window.addEventListener('resize', onResize)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    // Portaled to the end of <body>, so Tab from the ⋯ never reaches the menu —
    // start keyboard users on the first item (B455's pattern).
    const rafFocus = requestAnimationFrame(
      () => menuRef.current?.querySelector<HTMLButtonElement>('.at-more-item')?.focus())
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(rafFocus)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Extracted from handleOpen so the open menu can re-place itself. Position is
  // `fixed`, so without this a window resize leaves the menu parked at stale
  // coordinates, visibly detached from the ⋯ it belongs to. ColorField's
  // placeMenu already re-places on resize AND on a capture-phase scroll; this
  // menu opens from a header that cannot scroll, so resize alone covers it.
  function place() {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      // MIN_W must equal `.at-more-menu`'s `min-width` (automations.css). The
      // longest row measures ~247px, so 250 makes the estimate EXACT rather than
      // merely close: the min-width floors the rendered box at the same number
      // this positions it by. At 240 the menu was ~7px wider than the value used
      // to right-align it and overhung the button.
      const MARGIN = 8, GAP = 4, MIN_W = 250
      const vh = window.innerHeight
      const below = vh - rect.bottom - GAP - MARGIN
      const above = rect.top - GAP - MARGIN
      // Right-align under the button, then clamp onto the screen. Placing before
      // the menu renders means estimating its width — the same compromise
      // GroupPicker documents. ColorField's placeMenu measures the real box
      // instead, and is the upgrade if this menu ever grows a longer row.
      const left = Math.max(MARGIN, Math.min(rect.right - MIN_W, window.innerWidth - MIN_W - MARGIN))
      setPos(below >= above
        ? { top: rect.bottom + GAP, left, maxHeight: below }
        : { bottom: vh - rect.top + GAP, left, maxHeight: above })
    }
  }

  function handleOpen() {
    place()
    setOpen(v => !v)
  }

  // Close and restore focus BEFORE running the action: Import opens a wizard
  // that focuses itself a commit later, so this never fights it.
  function run(action: () => void) {
    setOpen(false)
    btnRef.current?.focus()
    action()
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`at-more-btn${analyticsOn ? ' at-more-btn--marked' : ''}`}
        onClick={handleOpen}
        title="More — Automation Analytics, and importing from another client"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
      >⋯</button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="ui-menu at-more-menu"
          role="menu"
          aria-label="More"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight }}
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={analyticsOn}
            className="ui-menu-item ui-menu-item--nowrap at-more-item"
            onClick={() => run(onToggleAnalytics)}
            title={analyticsOn
              ? 'Tracking which rules fire, and flagging duplicate, broken and unused rules. Turn off to stop tracking (preserves performance).'
              : 'Track which rules fire, and surface duplicate, broken and unused rules.'}
          >
            <span className="ui-menu-mark at-more-mark" aria-hidden="true">{analyticsOn ? '✓' : ''}</span>
            Automation Analytics
          </button>
          <button
            type="button"
            role="menuitem"
            className="ui-menu-item ui-menu-item--nowrap at-more-item"
            onClick={() => run(onImport)}
            title="Import highlights, macros, and colors from Wrayth, Genie, or Frostbite. To copy a setup between Lichborne characters, use the Transfer button on the launcher."
          >
            <span className="ui-menu-mark at-more-mark" aria-hidden="true" />
            Import from another client…
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}

export default function AutomationsPanel({
  onClose, onSaved, onThemeSaved, initialTab = 'highlights', initialTabSeq = 0,
  highlightPrefill, highlightTestText, triggerPrefillPattern, triggerOpenId, mutePrefill, substitutePrefill,
  highlightOpenId, muteOpenId, substituteOpenId, aliasOpenId, closeRequest,
}: Props) {
  // B368: one scope for every editor inside; leaving asks first if any of
  // them holds an unsaved draft.
  const unsaved = useUnsavedScope()
  const guardedClose = () => unsaved.guard(onClose)
  useEscapeClose(guardedClose)
  // Latest-closure ref so the closeRequest effect always calls the current
  // onClose (pitfall #31).
  const guardedCloseRef = useRef(guardedClose)
  guardedCloseRef.current = guardedClose
  const closeReqAtMount = useRef(closeRequest)
  useEffect(() => {
    if (closeRequest !== undefined && closeRequest !== closeReqAtMount.current) guardedCloseRef.current()
  }, [closeRequest])
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [showImport, setShowImport] = useState(false)
  // Bumped when the import wizard saves, so the active tab's panel REMOUNTS and
  // re-reads localStorage (its rule list is loaded once on mount). Only an
  // import bumps it — a panel's own edits don't, so editing never resets the
  // panel's UI state. Fixes "imported list is empty until you tab away + back".
  const [importNonce, setImportNonce] = useState(0)
  // Automation Analytics (v0.14.4): app-wide master toggle. Persisted to the
  // shared profile; the custom event tells every GameWindow's analyticsEnabledRef
  // to re-read (a `storage` event never fires in the window that wrote it).
  const [analyticsOn, setAnalyticsOn] = useState(loadAnalyticsEnabled())
  const character = useCharacter()
  // F37 (v0.15.2): rule scope — "This Character" vs "All Characters" (global).
  // Option A from the settled design (Sekmeht, 2026-05-31): a separate STORE
  // per scope rather than a per-rule scope toggle (no accidental promote-to-
  // global footgun). Global rules live under the virtual `_global` character
  // scope, so the rule panels work UNCHANGED inside a re-pointed
  // CharacterProvider — same editors, same analytics UI, same persistence
  // calls (which land on the _global keys and ride _shared.yaml). Mutes and
  // Substitutes joined the scope-capable set at Sekmeht's ask (same release);
  // only Groups & Modes stays per-character (per-character workflow concepts
  // by design).
  const GLOBAL_TABS: Tab[] = ['highlights', 'triggers', 'macros', 'aliases', 'mutes', 'substitutes']
  const [scope, setScope] = useState<'character' | 'global'>('character')
  const scopeCapable = GLOBAL_TABS.includes(tab)
  const effectiveScope = scopeCapable ? scope : 'character'
  // The rule an "Applies to" move just relocated. The editor FOLLOWS it: the
  // list switches to the scope it moved to and reopens it there. Leaving the
  // view where it was made the rule vanish from under the user, which read as
  // "it was deleted" (Sekmeht). It outranks the host's open-ids (Fires → Edit,
  // slash `edit`), which stay set while the dialog is open — until something
  // newer happens: a manual scope switch, a tab change, or a new open request.
  const [movedOpen, setMovedOpen] = useState<{ type: GlobalRuleType; id: string } | null>(null)
  useEffect(() => { setMovedOpen(null) }, [tab, highlightOpenId, triggerOpenId, muteOpenId, substituteOpenId, aliasOpenId])
  const openIdFor = (type: GlobalRuleType, hostId: string | undefined) =>
    movedOpen?.type === type ? movedOpen.id : hostId
  // Fires → Edit and slash `edit` name a rule by id, and those are CHARACTER
  // rules. In "All characters" scope the panel can't find one — and the old
  // prefill path copied it into the global store under the same id. So when an
  // id we're asked to open is a character rule, switch to This character first
  // (through the unsaved guard); the panel then opens it.
  useEffect(() => {
    if (scope !== 'global') return
    const isCharacterRule =
      (!!highlightOpenId && loadHighlights(character).some(r => r.id === highlightOpenId)) ||
      (!!triggerOpenId && loadTriggers(character).some(r => r.id === triggerOpenId))
    if (isCharacterRule) unsaved.guard(() => setScope('character'))
  }, [highlightOpenId, triggerOpenId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Panels' saves in Global scope also need: the _shared.yaml flush (globals
  // live there, not in the character YAML) and the same-window custom event
  // (a storage event never fires in the writing window — every GameWindow's
  // global-rules listener re-merges on it).
  const handleSaved = () => {
    if (effectiveScope === 'global') {
      scheduleSharedProfileSave()
      document.dispatchEvent(new CustomEvent('lichborne:global-rules-changed'))
    }
    onSaved?.()
  }

  // F63: MOVE a rule between the character store and the All-Characters store
  // (the editors' "Applies to" control). This is a deliberate ACTION between
  // two separate stores — the storage model stays exactly the F37 design
  // (option A rejected a per-rule scope FIELD); only the ergonomics changed
  // (Sekmeht, 2026-07-09). Semantics: remove from the source store; if a
  // CONTENT-IDENTICAL rule (ruleIdentity keys — the same definition Transfer
  // uses) already exists in the target store, add nothing and say so — a move
  // can never mint a duplicate. BUT only an EXACT copy (sameRuleContent) may be
  // dropped that way: a rule that merely shares the key — same pattern, other
  // actions — is a different rule, so the move is REFUSED and neither store
  // changes. It used to count as a duplicate and delete the moved rule, taking
  // its actions with it (Sekmeht, 2026-09-25). Promotion normalizes group gating away
  // (asGlobalRules); the rule's id travels with it, so its per-character
  // analytics history stays attached. The panel remounts via importNonce
  // (a move is a cross-store edit, exactly like an import).
  // Loose typing on purpose: the four stores have different rule shapes, and
  // this function only reads `id` + hands whole objects back to the matching
  // save — the per-type pairing is fixed by the RULE_IO table itself.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const RULE_IO: Record<GlobalRuleType, { load: (c: string) => any[]; save: (c: string, rules: any[]) => boolean }> = {
    highlights:  { load: loadHighlights,  save: saveHighlights as (c: string, rules: any[]) => boolean },
    triggers:    { load: loadTriggers,    save: saveTriggers as (c: string, rules: any[]) => boolean },
    macros:      { load: loadMacros,      save: saveMacros as (c: string, rules: any[]) => boolean },
    aliases:     { load: loadAliases,     save: saveAliases as (c: string, rules: any[]) => boolean },
    mutes:       { load: loadMutes,       save: saveMutes as (c: string, rules: any[]) => boolean },
    substitutes: { load: loadSubstitutes, save: saveSubstitutes as (c: string, rules: any[]) => boolean },
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const RULE_NOUN: Record<GlobalRuleType, string> = {
    highlights: 'highlight', triggers: 'trigger', macros: 'macro',
    aliases: 'alias', mutes: 'mute', substitutes: 'substitute',
  }
  function moveRuleScope(type: GlobalRuleType, rule: { id: string; name?: string; groupIds?: string[]; allGroups?: boolean }) {
    const io = RULE_IO[type]
    const keyOf = GLOBAL_RULE_KEYS[type]
    const fromScope = effectiveScope === 'global' ? GLOBAL_RULES_SCOPE : character
    const toScope   = effectiveScope === 'global' ? character : GLOBAL_RULES_SCOPE
    const toGlobal  = toScope === GLOBAL_RULES_SCOPE
    const source = io.load(fromScope).filter(r => r.id !== rule.id)
    const target = io.load(toScope)
    // Several rules can share a key; an EXACT copy anywhere among them means
    // there's nothing to move. Only a key match with no exact copy refuses.
    const same = (r: unknown) => sameRuleContent(r, rule, {
      normalize: type === 'triggers' ? triggerCompareForm : undefined,
      // Moving INTO a character: group gating is part of what the rule does.
      includeGating: !toGlobal,
    })
    const keyed = target.filter(r => keyOf(r) === keyOf(rule))
    const twin = keyed.find(same) ?? keyed[0]
    const toWhere = toGlobal ? 'All characters' : 'This character'
    if (twin && !same(twin)) {
      const noun = RULE_NOUN[type]
      const sharing = type === 'macros' ? 'on the same key'
        : type === 'aliases' ? 'for the same word'
        : (rule as { triggerType?: string }).triggerType === 'variable' ? 'watching the same variable'
        : 'with the same pattern'
      showToast({
        kind: 'error',
        title: 'Not moved',
        message: `${toWhere} already has a ${noun} ${sharing} that's set up differently, so nothing was changed. Edit or delete one of them, then move it.`,
      })
      return
    }
    const exists = !!twin
    // TARGET first, and abort if the write failed (quota — safeSetItem already
    // toasted): removing the source after a failed target write would lose the
    // rule entirely. The saves return safeSetItem's success flag for exactly
    // this transactional case (found in the v0.15.2 bug check).
    if (!exists) {
      const moved = toGlobal ? asGlobalRules([rule])[0] : rule
      if (io.save(toScope, [...target, moved]) === false) return
    }
    io.save(fromScope, source)
    // Follow it: show the list it went to and open it there — the copy that was
    // already in the target, when it existed (same content, maybe another id).
    const openId = twin?.id ?? rule.id
    setMovedOpen({ type, id: openId })
    setScope(toGlobal ? 'global' : 'character')
    // Both stores changed (or may have) — sync the F37 way: shared-YAML flush,
    // the same-window re-merge event, the character-side reload + profile save.
    scheduleSharedProfileSave()
    document.dispatchEvent(new CustomEvent('lichborne:global-rules-changed'))
    onSaved?.()
    setImportNonce(n => n + 1)
    const r = rule as { name?: string; pattern?: string; key?: string; input?: string }
    const label = r.name || r.pattern || r.key || r.input || 'Rule'
    showToast(exists
      ? { kind: 'info', title: 'Already there', message: `An identical “${label}” was already in ${toWhere}, so this copy was removed instead of doubled.` }
      : { kind: 'success', message: `“${label}” moved to ${toGlobal ? 'All characters — it now applies to every character' : `this character only — other characters no longer have it`}.` })
  }
  // F115: "Manage colors…" in any ColorField. Through the guard, because the
  // editor that holds the field may have an unsaved draft.
  const manageColors = () => unsaved.guard(() => setTab('colors'))
  const toggleAnalytics = () => {
    const next = !analyticsOn
    setAnalyticsOn(next)
    saveAnalyticsEnabled(next)
    document.dispatchEvent(new CustomEvent('lichborne:analytics-changed'))
  }
  // A new entry point (e.g. a slash `/mute edit` via Quick Send) can re-aim an
  // already-open dialog; switching tabs unmounts the current editor, so ask.
  useEffect(() => {
    if (initialTab !== tab) unsaved.guard(() => setTab(initialTab))
  }, [initialTab, initialTabSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  // B397: open with focus in the active panel — its search box, else its first
  // row, else the dialog itself. Runs after the panels' own mount effects; a
  // prefill's name-field focus is deferred a tick, so it still wins.
  useEffect(() => {
    const root = modalRef.current
    if (!root) return
    const target = root.querySelector<HTMLElement>('.at-body .sidebar-search-input')
      ?? root.querySelector<HTMLElement>('.at-body [role="option"]')
      ?? root
    target.focus({ preventScroll: true })
  }, [])

  // Bound the usage-stats store: when Analytics is on, drop stats for rules that
  // no longer exist (deleted/re-imported). recordFire keys by ruleId and never
  // removes an entry on its own, so without this the map would slowly bloat in
  // localStorage AND the profile YAML as rules churn (Sekmeht: "I don't want this
  // to bloat anywhere"). Opening this window is the natural, low-frequency moment
  // to reconcile — and exactly when accurate stats matter. Build the live id set
  // from all six rule types (the stats map is one flat map across them all).
  useEffect(() => {
    if (!analyticsOn) return
    const liveIds = new Set<string>([
      ...loadHighlights(character).map(r => r.id),
      ...loadTriggers(character).map(r => r.id),
      ...loadMacros(character).map(r => r.id),
      ...loadAliases(character).map(r => r.id),
      ...loadMutes(character).map(r => r.id),
      ...loadSubstitutes(character).map(r => r.id),
      // F37: GLOBAL rules fire under this character too (recordFire keys the
      // stats map by rule id within the character), so their ids must count
      // as live or every global rule's stats get pruned as orphans here.
      ...loadHighlights(GLOBAL_RULES_SCOPE).map(r => r.id),
      ...loadTriggers(GLOBAL_RULES_SCOPE).map(r => r.id),
      ...loadMacros(GLOBAL_RULES_SCOPE).map(r => r.id),
      ...loadAliases(GLOBAL_RULES_SCOPE).map(r => r.id),
      ...loadMutes(GLOBAL_RULES_SCOPE).map(r => r.id),
      ...loadSubstitutes(GLOBAL_RULES_SCOPE).map(r => r.id),
    ])
    // If anything was orphaned, persist the cleaned map to YAML (onSaved →
    // scheduled profile save) so the orphans don't re-seed from YAML next launch.
    if (pruneStats(character, liveIds) > 0) onSaved?.()
  }, [analyticsOn, character])

  const TABS: { id: Tab; label: string }[] = [
    { id: 'highlights', label: 'Highlights' },
    { id: 'triggers',   label: 'Triggers'   },
    { id: 'macros',     label: 'Macros'     },
    { id: 'aliases',    label: 'Aliases'    },
    { id: 'mutes',      label: 'Mutes'      },
    { id: 'substitutes', label: 'Substitutes' },
    { id: 'groups',     label: 'Groups'         },
    { id: 'colors',     label: 'Colors'         },
  ]

  const modal = (
    <div className="at-backdrop" {...backdropHandlers(guardedClose)}>
      <div className="at-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>

        {/* Header — identity and dismiss, plus the ⋯ holding the two controls
            that are not navigation. The split follows one rule: what qualifies
            the whole DIALOG stays in the accent band; what qualifies the CURRENT
            TAB goes on the sub-bar below. The scope switch is per-tab (it is
            disabled on Groups and Colors), so it belongs down there — and only
            the top-level header is an accent band anyway (UX #10). */}
        <div className="ui-modal-head at-header">
          <span className="ui-modal-title" id={titleId}>Automations</span>
          <AtOverflowMenu
            analyticsOn={analyticsOn}
            onToggleAnalytics={toggleAnalytics}
            // An import's save remounts every tab panel, which would drop an
            // open draft — so opening it goes through the same guard.
            onImport={() => unsaved.guard(() => setShowImport(true))}
          />
          <button type="button" className="ui-close" onClick={guardedClose} title="Close" aria-label="Close">✕</button>
        </div>

        {/* Sub-bar — the navigation, and the one control that qualifies it. */}
        <div className="at-subbar">
          <div className="ui-tabs at-tab-bar" role="tablist" aria-label="Automations sections">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`ui-tab${tab === t.id ? ' ui-tab--active' : ''}`}
                onClick={() => { if (t.id !== tab) unsaved.guard(() => setTab(t.id)) }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* F37: scope switch. ALWAYS rendered so the sub-bar controls never
              shift position between tabs (Sekmeht: a hidden switch closed the
              gap and moved everything); where it doesn't apply (Groups, Colors)
              it renders DISABLED with a tooltip saying why.

              "Applies to" is deliberately the SAME words every rule editor uses
              for its F63 scope-MOVE control, because it is one idea at two
              scales: here it picks which store you are looking at, there it
              moves a single rule between them. The visible label and the
              group's accessible name match for the same reason. */}
          <div className="at-scope-wrap">
            <span className="at-scope-label ui-section-label">Applies to</span>
            <div
              className={`at-scope${scopeCapable ? '' : ' at-scope--disabled'}`}
              role="group"
              aria-label="Applies to"
              title={scopeCapable ? undefined : tab === 'colors'
                ? 'Your colors are shared by all your characters, so there’s no per-character choice here.'
                : 'Groups & Modes are always per-character — they gate rules per character, so a global scope doesn’t apply here.'}
            >
              <button
                type="button"
                className={`at-scope-btn${effectiveScope === 'character' ? ' at-scope-btn--on' : ''}`}
                onClick={() => { if (scope !== 'character') unsaved.guard(() => { setMovedOpen(null); setScope('character') }) }}
                disabled={!scopeCapable}
                aria-pressed={effectiveScope === 'character'}
                title={scopeCapable ? `Rules for ${character} only` : undefined}
              >
                This character
              </button>
              <button
                type="button"
                className={`at-scope-btn${effectiveScope === 'global' ? ' at-scope-btn--on' : ''}`}
                onClick={() => { if (scope !== 'global') unsaved.guard(() => { setMovedOpen(null); setScope('global') }) }}
                disabled={!scopeCapable}
                aria-pressed={effectiveScope === 'global'}
                title={scopeCapable ? 'Global rules — apply to EVERY character, on every account. Always active (no group gating). Stored app-wide in _shared.yaml, not in any character’s profile.' : undefined}
              >
                All characters
              </button>
            </div>
          </div>
        </div>

        <UnsavedContext.Provider value={unsaved.registry}>
        <ColorManageContext.Provider value={manageColors}>
        <div className="at-body">
          {/* Keys are tab-UNIQUE (not bare `importNonce`): Macros + Aliases are
              the SAME component (MacrosPanel, differing only by initialTab, read
              once on mount), so a shared key let React reuse the one instance
              across those two tabs → the Macros tab showed Alias content. The
              `-${importNonce}` suffix still forces a remount+reload after import. */}
          {/* F37: the four rule panels run inside a scope-aware provider —
              Global scope re-points useCharacter() at the virtual `_global`
              store, so the panels' own load/save/analytics work unchanged.
              Keys include the scope so switching scope remounts (each panel
              loads its list once on mount, the importNonce pattern). Prefill /
              openRuleId props carry CHARACTER rule ids — harmless no-ops in
              Global scope (no id matches). hideGroups: global rules are
              always-active; a groups row that can't apply would lie. */}
          <CharacterProvider character={effectiveScope === 'global' ? GLOBAL_RULES_SCOPE : character}>
          {tab === 'highlights' && (
            <HighlightsPanel
              key={`highlights-${effectiveScope}-${importNonce}`}
              prefill={highlightPrefill}
              initialTestText={highlightTestText}
              openRuleId={openIdFor('highlights', highlightOpenId)}
              onSaved={handleSaved}
              analyticsOn={analyticsOn}
              scope={effectiveScope}
              onMoveScope={rule => moveRuleScope('highlights', rule)}
            />
          )}
          {tab === 'triggers' && (
            <TriggersPanel
              key={`triggers-${effectiveScope}-${importNonce}`}
              prefillPattern={triggerPrefillPattern}
              openRuleId={openIdFor('triggers', triggerOpenId)}
              onSaved={handleSaved}
              analyticsOn={analyticsOn}
              scope={effectiveScope}
              onMoveScope={rule => moveRuleScope('triggers', rule)}
            />
          )}
          {tab === 'macros'   && <MacrosPanel key={`macros-${effectiveScope}-${importNonce}`} initialTab="macros"   openMacroId={openIdFor('macros', undefined)} onSaved={handleSaved} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={(type, rule) => moveRuleScope(type, rule)} />}
          {tab === 'aliases'  && <MacrosPanel key={`aliases-${effectiveScope}-${importNonce}`} initialTab="aliases"  openAliasId={openIdFor('aliases', aliasOpenId)} onSaved={handleSaved} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={(type, rule) => moveRuleScope(type, rule)} />}
          {tab === 'mutes'    && <MutePanel key={`mutes-${effectiveScope}-${importNonce}`} onSaved={handleSaved} prefill={mutePrefill} openRuleId={openIdFor('mutes', muteOpenId)} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={rule => moveRuleScope('mutes', rule)} />}
          {tab === 'substitutes' && <SubstitutesPanel key={`substitutes-${effectiveScope}-${importNonce}`} onSaved={handleSaved} prefill={substitutePrefill} openRuleId={openIdFor('substitutes', substituteOpenId)} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={rule => moveRuleScope('substitutes', rule)} />}
          {tab === 'groups'   && <GroupsModesTab key={`groups-${importNonce}`} />}
          {tab === 'colors'   && <ColorsPanel key={`colors-${importNonce}`} />}
          </CharacterProvider>
        </div>
        </ColorManageContext.Provider>
        </UnsavedContext.Provider>

      </div>
    </div>
  )

  return (
    <>
      {createPortal(modal, document.body)}
      {showImport && (
        <ImportWizard
          nested
          onClose={() => setShowImport(false)}
          onSaved={() => { onSaved?.(); setShowImport(false); setImportNonce(n => n + 1) }}
          onThemeSaved={onThemeSaved}
        />
      )}
    </>
  )
}
