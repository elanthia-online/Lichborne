// Automations panel — the tabbed host for every native rule editor:
// Highlights · Triggers · Macros · Aliases · Mutes · Substitutes · Groups.
//
// It renders no rule UI of its own. It owns the things the editors share:
//   - the F37 SCOPE switch (v0.15.2): "This Character" vs "All Characters".
//     Global rules are a SEPARATE STORE under the virtual `_global` character
//     scope, so the six rule panels run UNCHANGED inside a re-pointed
//     `CharacterProvider` — their own load/save/analytics land on the
//     `_global` keys, which ride `_shared.yaml` instead of the character YAML.
//     `handleSaved` adds the shared-YAML flush + the same-window
//     `lichborne:global-rules-changed` event for that scope. Groups & Modes is
//     per-character only; its switch renders DISABLED in place, never hidden.
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
import { backdropHandlers } from '../utils/backdropClose'
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
import ImportWizard from './ImportWizard'
import { useCharacter } from '../CharacterContext'
import { CharacterProvider } from '../CharacterContext'
import { GLOBAL_RULES_SCOPE, asGlobalRules } from '../characterScope'
import { scheduleSharedProfileSave } from '../profile'
import { GLOBAL_RULE_KEYS, type GlobalRuleType } from '../ruleIdentity'
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

type Tab = 'highlights' | 'triggers' | 'macros' | 'aliases' | 'mutes' | 'substitutes' | 'groups'

interface Props {
  onClose:              () => void
  onSaved?:             () => void
  onThemeSaved?:        (themeId: string) => void
  initialTab?:          Tab
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

export default function AutomationsPanel({
  onClose, onSaved, onThemeSaved, initialTab = 'highlights',
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
  // can never mint a duplicate. Promotion normalizes group gating away
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
  function moveRuleScope(type: GlobalRuleType, rule: { id: string; name?: string; groupIds?: string[]; allGroups?: boolean }) {
    const io = RULE_IO[type]
    const keyOf = GLOBAL_RULE_KEYS[type]
    const fromScope = effectiveScope === 'global' ? GLOBAL_RULES_SCOPE : character
    const toScope   = effectiveScope === 'global' ? character : GLOBAL_RULES_SCOPE
    const toGlobal  = toScope === GLOBAL_RULES_SCOPE
    const source = io.load(fromScope).filter(r => r.id !== rule.id)
    const target = io.load(toScope)
    const exists = target.some(r => keyOf(r) === keyOf(rule))
    // TARGET first, and abort if the write failed (quota — safeSetItem already
    // toasted): removing the source after a failed target write would lose the
    // rule entirely. The saves return safeSetItem's success flag for exactly
    // this transactional case (found in the v0.15.2 bug check).
    if (!exists) {
      const moved = toGlobal ? asGlobalRules([rule])[0] : rule
      if (io.save(toScope, [...target, moved]) === false) return
    }
    io.save(fromScope, source)
    // Both stores changed (or may have) — sync the F37 way: shared-YAML flush,
    // the same-window re-merge event, the character-side reload + profile save.
    scheduleSharedProfileSave()
    document.dispatchEvent(new CustomEvent('lichborne:global-rules-changed'))
    onSaved?.()
    setImportNonce(n => n + 1)
    const r = rule as { name?: string; pattern?: string; key?: string; input?: string }
    const label = r.name || r.pattern || r.key || r.input || 'Rule'
    showToast(exists
      ? { kind: 'info', title: 'Already exists there', message: `“${label}” already exists in ${toGlobal ? 'All characters' : 'this character’s rules'} — moved by removing the duplicate copy.` }
      : { kind: 'success', message: `“${label}” moved to ${toGlobal ? 'All characters — it now applies to every character' : `this character only — other characters no longer have it`}.` })
  }
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
  }, [initialTab]) // eslint-disable-line react-hooks/exhaustive-deps

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
  ]

  const modal = (
    <div className="at-backdrop" {...backdropHandlers(guardedClose)}>
      <div className="at-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>

        <div className="at-header">
          <span className="at-title" id={titleId}>Automations</span>
          <div className="at-tab-bar">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`at-tab${tab === t.id ? ' at-tab--active' : ''}`}
                onClick={() => { if (t.id !== tab) unsaved.guard(() => setTab(t.id)) }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* F37: scope switch. ALWAYS rendered so the header buttons never
              shift position between tabs (Sekmeht: a hidden switch closed the
              gap and moved everything); on non-capable tabs (Groups only) it
              renders DISABLED with a tooltip saying why. */}
          <div
            className={`at-scope${scopeCapable ? '' : ' at-scope--disabled'}`}
            role="group"
            aria-label="Rule scope"
            title={scopeCapable ? undefined : 'Groups & Modes are always per-character — they gate rules per character, so a global scope doesn’t apply here.'}
          >
            <button
              type="button"
              className={`at-scope-btn${effectiveScope === 'character' ? ' at-scope-btn--on' : ''}`}
              onClick={() => { if (scope !== 'character') unsaved.guard(() => setScope('character')) }}
              disabled={!scopeCapable}
              aria-pressed={effectiveScope === 'character'}
              title={scopeCapable ? `Rules for ${character} only` : undefined}
            >
              This character
            </button>
            <button
              type="button"
              className={`at-scope-btn${effectiveScope === 'global' ? ' at-scope-btn--on' : ''}`}
              onClick={() => { if (scope !== 'global') unsaved.guard(() => setScope('global')) }}
              disabled={!scopeCapable}
              aria-pressed={effectiveScope === 'global'}
              title={scopeCapable ? 'Global rules — apply to EVERY character, on every account. Always active (no group gating). Stored app-wide in _shared.yaml, not in any character’s profile.' : undefined}
            >
              All characters
            </button>
          </div>
          <button
            type="button"
            className={`at-analytics-btn${analyticsOn ? ' at-analytics-btn--on' : ''}`}
            onClick={toggleAnalytics}
            title={analyticsOn
              ? 'Automation Analytics is ON — usage is being tracked. Turn off to stop tracking (preserves performance).'
              : 'Automation Analytics is OFF. Turn on to track which rules fire and surface duplicates / broken / unused rules.'}
          >
            {'\u{1F4CA}'} Analytics: {analyticsOn ? 'On' : 'Off'}
          </button>
          {/* An import's save remounts every tab panel, which would drop an
              open draft — so opening it goes through the same guard. */}
          <button
            type="button"
            className="at-import-btn"
            onClick={() => unsaved.guard(() => setShowImport(true))}
            title="Import highlights, macros, and colors from Wrayth, Genie, or Frostbite. To copy a setup between Lichborne characters, use the Transfer button on the launcher."
          >
            Import from another client…
          </button>
          <button type="button" className="ui-close" onClick={guardedClose} title="Close" aria-label="Close">✕</button>
        </div>

        <UnsavedContext.Provider value={unsaved.registry}>
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
              openRuleId={highlightOpenId}
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
              openRuleId={triggerOpenId}
              onSaved={handleSaved}
              analyticsOn={analyticsOn}
              scope={effectiveScope}
              onMoveScope={rule => moveRuleScope('triggers', rule)}
            />
          )}
          {tab === 'macros'   && <MacrosPanel key={`macros-${effectiveScope}-${importNonce}`} initialTab="macros"   onSaved={handleSaved} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={(type, rule) => moveRuleScope(type, rule)} />}
          {tab === 'aliases'  && <MacrosPanel key={`aliases-${effectiveScope}-${importNonce}`} initialTab="aliases"  openAliasId={aliasOpenId} onSaved={handleSaved} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={(type, rule) => moveRuleScope(type, rule)} />}
          {tab === 'mutes'    && <MutePanel key={`mutes-${effectiveScope}-${importNonce}`} onSaved={handleSaved} prefill={mutePrefill} openRuleId={muteOpenId} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={rule => moveRuleScope('mutes', rule)} />}
          {tab === 'substitutes' && <SubstitutesPanel key={`substitutes-${effectiveScope}-${importNonce}`} onSaved={handleSaved} prefill={substitutePrefill} openRuleId={substituteOpenId} analyticsOn={analyticsOn} scope={effectiveScope} onMoveScope={rule => moveRuleScope('substitutes', rule)} />}
          {tab === 'groups'   && <GroupsModesTab key={`groups-${importNonce}`} />}
          </CharacterProvider>
        </div>
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
