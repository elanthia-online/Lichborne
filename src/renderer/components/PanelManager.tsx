// PanelManager — the "Layout Manager" modal (the app-bar Layout button): the
// mode chooser (Windowed Panels, recommended · Static Panels, legacy), and
// then a per-mode body. Windowed: a Windows section (Lock windows · Fit bars
// to content · Rebuild from panels) + Add window. Static: Panel locations
// (the four docked slots, each independently added/removed, plus Reset
// panels), each slot's streams (move / reorder / remove), and the Available
// streams pool.
//
// Pure view over the zone arrays + `*Added` flags; every mutation is a
// callback into GameWindow. The one derivation it owns matters: `allTabs` is
// built ONLY from zones that are added — a tab parked in an un-added zone must
// not block its stream id from appearing under Available streams (the same
// gate as GameWindow's `watchedStreamsRef`; the v0.8.3 "Moons" fix), and a
// discovered id that matches a builtin PanelType stays in the builtin column,
// never as a duplicate custom row. Static-only controls (Reset panels, the
// zone manager) are hidden in Windowed mode rather than left as invisible
// no-ops; Add window stays available while LOCKED, because the lock freezes
// window geometry, not what lives inside a window. Add/remove of a SLOT is
// independent of the streams inside it. The two actions that throw a layout
// away — Reset panels and Rebuild — ask first (B370). Chrome is the shared
// About look (ui.css); the mode cards are styled in free-layout.css.

import { useEffect, useId, useRef } from 'react'
import type { TabDef, PanelType } from './PanelFrame'
import { panelTypeAvailable } from './PanelFrame'
import type { GameFamily } from '../../shared/types'
import { backdropHandlers } from '../utils/backdropClose'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { confirmAction } from '../confirm'
import { streamLabel } from '../aiConfig'
import '../styles/panel-manager.css'

// v0.8.1 (F24): 'mainTop' is the new zone above the main scrolling text
// (left side of the game window, not the right panel column). Order in
// ZONE_LABELS / zones array is rendering-top-down: Main-Top → Top → Mid →
// Bottom so the manager's section list mirrors the on-screen vertical
// arrangement.
type Zone = 'mainTop' | 'top' | 'mid' | 'bottom'

// v0.8.1: renamed to be explicit about WHERE each zone lives — the right-
// column zones are now suffixed "-Right" so they don't get confused with
// the Main-Top zone that sits over the main text on the left.
const ZONE_LABELS: Record<Zone, string> = {
  mainTop: 'Main-Top',
  top:     'Top-Right',
  mid:     'Middle-Right',
  bottom:  'Bottom-Right',
}

// Button label used in "→ Main-Top" / "+ Top-Right" etc. Mirrors the
// section header names exactly so users don't have to mentally map
// between "Main" buttons and the "Main-Top" zone they target.
const ZONE_BUTTON_LABELS: Record<Zone, string> = {
  mainTop: 'Main-Top',
  top:     'Top-Right',
  mid:     'Middle-Right',
  bottom:  'Bottom-Right',
}

const ALL_ZONES: Zone[] = ['mainTop', 'top', 'mid', 'bottom']

interface Props {
  mainTopTabs: TabDef[]
  topTabs: TabDef[]
  midTabs: TabDef[]
  bottomTabs: TabDef[]
  // v0.8.1 (Panel Manager V2): per-zone "added to layout" flag. A zone is
  // either part of the user's layout (added → shown in the game window,
  // can hold streams) or not (removed → hidden, streams returned to the
  // Available Streams pool). Add/remove of the slot is independent of the
  // streams inside it.
  mainTopAdded: boolean
  topAdded: boolean
  midAdded: boolean
  bottomAdded: boolean
  allTypes: PanelType[]
  // GS4 support: gates which builtin types show as ADDABLE ("Available
  // Streams") via panelTypeAvailable — deliberately NOT applied to allTypes
  // itself, which also backs the discovery-defense set (allBuiltinSet below,
  // pitfall #27): that set must stay the FULL builtin list regardless of
  // family, or a discovered stream colliding with a family-hidden builtin id
  // could slip through as a duplicate "custom" row.
  gameFamily?: GameFamily
  labels: Record<PanelType, string>
  discoveredStreams: string[]
  streamTitles?: Record<string, string>
  onMoveTab: (tab: TabDef, toZone: Zone) => void
  onReorderTab: (tab: TabDef, direction: 'left' | 'right') => void
  onRemoveTab: (tab: TabDef) => void
  onAddToZone: (typeOrId: string, zone: Zone) => void
  onAddPanelZone: (zone: Zone) => void
  onRemovePanelZone: (zone: Zone) => void
  onResetLayout: () => void
  // Free Layout (DESIGN.md §33) — toggle floating-window mode, re-snapshot the
  // current panels layout, lock against accidental drag/resize, and add windows.
  layoutMode?: 'panels' | 'free'
  onToggleLayoutMode?: () => void
  onRebuildFromPanels?: () => void
  /** Snap chrome windows (vitals / status / command) to their bar's height. */
  onFitChromeWindows?: () => void
  freeLayoutLocked?: boolean
  onToggleFreeLock?: () => void
  freeAddItems?: { label: string; kind: string }[]
  onAddFreeWindow?: (kind: string) => void
  onClose: () => void
}

export default function PanelManager({
  mainTopTabs, topTabs, midTabs, bottomTabs,
  mainTopAdded, topAdded, midAdded, bottomAdded,
  allTypes, gameFamily, labels,
  discoveredStreams, streamTitles = {},
  onMoveTab, onReorderTab, onRemoveTab, onAddToZone, onAddPanelZone, onRemovePanelZone, onResetLayout,
  layoutMode, onToggleLayoutMode, onRebuildFromPanels, onFitChromeWindows, freeLayoutLocked, onToggleFreeLock, freeAddItems, onAddFreeWindow,
  onClose,
}: Props) {
  // Rendered inline by GameWindow rather than portaled, so the hook gets the
  // backdrop: a hidden character tab keeps its Layout Manager mounted, and one
  // with no layout box must not take an Esc meant for the visible tab.
  const backdropRef = useRef<HTMLDivElement>(null)
  useEscapeClose(onClose, { ref: backdropRef })
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // B397: open with focus inside the dialog, not left on the app-bar button it
  // covers. The panel itself — the first control depends on the mode.
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }) }, [])

  // B370: both of these throw a layout away and used to run in one click.
  async function resetPanels() {
    const ok = await confirmAction({
      title: 'Reset panels to defaults?',
      message: 'The four docked slots go back to their default streams and sizes.',
      detail: "Streams you've added or moved come out of the slots and return to Available streams.",
      confirmLabel: 'Reset panels',
      danger: true,
    })
    if (ok) onResetLayout()
  }
  async function rebuildWindows() {
    if (!onRebuildFromPanels) return
    const ok = await confirmAction({
      title: 'Rebuild windows from panels?',
      message: 'Your current window arrangement is replaced by fresh windows laid out from your docked-panels layout.',
      detail: "Where you've placed and sized your windows is lost. This can't be undone.",
      confirmLabel: 'Rebuild',
      danger: true,
    })
    if (ok) onRebuildFromPanels()
  }

  // v0.8.3: Only count tabs from zones that are actually added to the
  // layout. A tab sitting in an un-added zone is invisible to the user,
  // so it must not block its stream id from appearing under Available
  // Streams — otherwise a discovered stream (e.g. a Lich script's
  // "Moons" tab) silently has no slot to land in, even though the user
  // can't see it anywhere. Same shape as the watchedStreamsRef gate in
  // GameWindow — same fix, different place.
  const allTabs = [
    ...(mainTopAdded ? mainTopTabs : []),
    ...(topAdded     ? topTabs     : []),
    ...(midAdded     ? midTabs     : []),
    ...(bottomAdded  ? bottomTabs  : []),
  ]
  const openTypes = new Set(allTabs.filter(t => t.type !== 'custom').map(t => t.type))
  const openCustomIds = new Set(allTabs.filter(t => t.type === 'custom').map(t => t.id))
  // v0.8.1: a stream id that matches a builtin PanelType ('combat', 'room',
  // 'exp', …) belongs in the builtin column — never as a "custom" discovered
  // row, even if the parser also reported it as discovered. Defensive mirror
  // of the discovery-site filter so a duplicate can't reappear here.
  const allBuiltinSet = new Set<string>(allTypes)

  // Built-in types not yet in any zone. gameFamily-gated (panelTypeAvailable)
  // — see the Props comment on gameFamily for why allBuiltinSet above is
  // deliberately NOT gated the same way.
  const availableBuiltin = allTypes.filter(t => t !== 'custom' && !openTypes.has(t) && panelTypeAvailable(t, gameFamily))
  // Discovered streams not yet in any zone (and not a builtin in disguise)
  const availableCustom = discoveredStreams.filter(id =>
    !openCustomIds.has(id) && !allBuiltinSet.has(id) && !openTypes.has(id as PanelType))
  const hasAvailable = availableBuiltin.length > 0 || availableCustom.length > 0

  const addedByZone: Record<Zone, boolean> = {
    mainTop: mainTopAdded, top: topAdded, mid: midAdded, bottom: bottomAdded,
  }
  const tabsByZone: Record<Zone, TabDef[]> = {
    mainTop: mainTopTabs, top: topTabs, mid: midTabs, bottom: bottomTabs,
  }
  const addedZones = ALL_ZONES.filter(z => addedByZone[z])

  return (
    <div className="pm-backdrop ui-modal-backdrop" ref={backdropRef} {...backdropHandlers(() => onClose())}>
      <div
        className="pm-modal ui-modal ui-modal--standard"
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Title and ✕ only (the About look). Reset panels used to sit here,
            8px from the ✕; it is now a described row in Panel locations. */}
        <div className="ui-modal-head">
          <span className="ui-modal-title" id={titleId}>Layout Manager</span>
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>

        <div className="pm-body">
          {/* MODE CHOOSER (v0.18.2, Sekmeht). This used to be a single banner
              describing whichever mode you were already in, with one "Switch
              to..." button -- so the choice itself, and the fact that one option
              is on its way out, were both invisible until you clicked. Two cards
              side by side state it plainly: what each mode IS, which one you are
              in, and that Static is LEGACY. Both render in the SAME shape
              whichever is active (UX standard #2), so nothing jumps on switch. */}
          {onToggleLayoutMode && (
            <Section label="Layout mode">
              <div className="pm-modes">
                <ModeCard
                  name="Windowed Panels"
                  current={layoutMode === 'free'}
                  badge={layoutMode === 'free' ? null : 'Recommended'}
                  badgeKind="rec"
                  desc="Each panel is a window you place yourself — drag it to move, drag an edge to resize, and it snaps to the other windows and to the screen edges. Lock it once it looks right."
                  onSwitch={layoutMode === 'free' ? undefined : onToggleLayoutMode}
                />
                <ModeCard
                  name="Static Panels"
                  current={layoutMode !== 'free'}
                  badge="Legacy"
                  badgeKind="legacy"
                  desc="Panels are docked into four fixed slots around the game text, and streams are moved between those slots from this window."
                  note="Being retired — new work goes into Windowed Panels. Switching converts your current layout for you, and switching back leaves it as you left it."
                  onSwitch={layoutMode !== 'free' ? undefined : onToggleLayoutMode}
                />
              </div>
            </Section>
          )}

          {layoutMode === 'free' && (
            <Section label="Windows">
              {onToggleFreeLock && (
                <Row label="Lock windows"
                     desc="Freezes where windows sit and how big they are, so you cannot nudge one by accident. What is inside them stays yours to change — you can still reorder, close and add streams while locked.">
                  <label className="pm-inline-check">
                    <input type="checkbox" checked={!!freeLayoutLocked} onChange={onToggleFreeLock} />
                    {freeLayoutLocked ? 'Locked' : 'Unlocked'}
                  </label>
                </Row>
              )}
              {!freeLayoutLocked && onFitChromeWindows && (
                <Row label="Fit bars to content"
                     desc="Resizes the vitals / status / command windows to exactly the height of the bar inside. Usually shrinks them, but it will also grow one you had shrunk so far the bar was cut off. Positions do not move, so a neighbour below may be left with a gap or an overlap to drag closed.">
                  <button type="button" className="ui-btn ui-btn--sm" onClick={onFitChromeWindows}>Fit</button>
                </Row>
              )}
              {onRebuildFromPanels && (
                <Row label="Rebuild from panels"
                     desc="Discards the current window arrangement and lays fresh windows out from your docked-panels layout. Use it to start over.">
                  <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => { void rebuildWindows() }}>Rebuild</button>
                </Row>
              )}
            </Section>
          )}

          {/* Add-window controls (not floating on the overlay) -- a section in
              the Layout Manager's own row layout. Available while LOCKED too: a
              locked window can still have its streams closed (right-click ->
              Close), so hiding the only way to add one back would let you
              destroy but never rebuild. */}
          {layoutMode === 'free' && onAddFreeWindow && freeAddItems && freeAddItems.length > 0 && (
            <Section label="Add window">
              {freeAddItems.map(it => (
                <Row key={it.kind} label={it.label}>
                  <button type="button" className="ui-btn ui-btn--sm" onClick={() => onAddFreeWindow(it.kind)}>Add</button>
                </Row>
              ))}
            </Section>
          )}
          {/* The zone manager below (Panel locations / per-zone streams /
              Available streams) is PANELS-mode only — in Free Layout it's
              hidden to avoid confusion, and returns when you switch back. */}
          {layoutMode !== 'free' && (<>
          {/* Panel locations: the 4 fixed slots, each independently added
              to or removed from the layout. Removing a slot clears its
              streams (they reappear under Available streams below) and
              hides the slot from the game window. Adding leaves the slot
              empty for the user to fill from Available streams. */}
          <Section label="Panel locations">
            {ALL_ZONES.map(z => (
              <Row key={z} label={ZONE_LABELS[z]}>
                {addedByZone[z]
                  ? <>
                      <span className="pm-zone-status pm-zone-status--added">In layout</span>
                      <button type="button" className="ui-btn ui-btn--sm" onClick={() => onRemovePanelZone(z)}
                              title="Hide this panel and return its streams to Available streams">
                        Remove panel
                      </button>
                    </>
                  : <>
                      <span className="pm-zone-status pm-zone-status--removed">Not in layout</span>
                      <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => onAddPanelZone(z)}
                              title="Snap this panel into the game window so it can hold streams">
                        Add panel
                      </button>
                    </>}
              </Row>
            ))}
            {/* Resets the DOCKED zone layout, which is a no-op you can't see
                while in Windowed mode -- so it only appears here, in the
                static-only part of the manager. The windowed equivalent is
                "Rebuild from panels". */}
            <Row label="Reset panels"
                 desc="Puts the four docked slots back to their default streams and sizes.">
              <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => { void resetPanels() }}>Reset</button>
            </Row>
          </Section>

          {/* Each added zone's stream contents. Removed zones don't get a
              section — their streams already went back to Available
              streams below. */}
          {addedZones.map(z => (
            <Section key={z} label={`${ZONE_LABELS[z]} — streams`}>
              {tabsByZone[z].map((tab, idx) => {
                const tabs = tabsByZone[z]
                const isFirst = idx === 0
                const isLast  = idx === tabs.length - 1
                return (
                  <Row key={tab.id} label={tab.label}>
                    {/* v0.8.2: ◀ / ▶ reorder buttons. Each moves the tab one
                        slot within its current zone — that's the tab order
                        the user sees in the PanelFrame tab bar. Disabled at
                        the ends so there's no silent no-op. */}
                    <button type="button" className="ui-btn ui-btn--sm pm-btn-reorder" disabled={isFirst}
                            title={isFirst ? 'Already at the start' : 'Move left'}
                            aria-label="Move left"
                            onClick={() => onReorderTab(tab, 'left')}>◀</button>
                    <button type="button" className="ui-btn ui-btn--sm pm-btn-reorder" disabled={isLast}
                            title={isLast ? 'Already at the end' : 'Move right'}
                            aria-label="Move right"
                            onClick={() => onReorderTab(tab, 'right')}>▶</button>
                    {addedZones.filter(other => other !== z).map(other => (
                      <button type="button" key={other} className="ui-btn ui-btn--sm" onClick={() => onMoveTab(tab, other)}
                              title={`Move this stream to the ${ZONE_BUTTON_LABELS[other]} panel`}>
                        → {ZONE_BUTTON_LABELS[other]}
                      </button>
                    ))}
                    <button type="button" className="ui-btn ui-btn--sm" onClick={() => onRemoveTab(tab)}
                            title="Take this stream out of the panel — it goes back to Available streams">
                      Remove
                    </button>
                  </Row>
                )
              })}
              {tabsByZone[z].length === 0 && (
                <div className="pm-empty">Empty — add a stream from Available streams below.</div>
              )}
            </Section>
          ))}

          {hasAvailable && (
            <Section label="Available streams">
              {availableBuiltin.map(type => (
                <Row key={type} label={labels[type]}>
                  {addedZones.length === 0
                    ? <span className="pm-empty-inline">Add a panel above first.</span>
                    : addedZones.map(z => (
                        <button type="button" key={z} className="ui-btn ui-btn--sm" onClick={() => onAddToZone(type, z)}
                                title={`Add this stream to the ${ZONE_BUTTON_LABELS[z]} panel`}>
                          + {ZONE_BUTTON_LABELS[z]}
                        </button>
                      ))}
                </Row>
              ))}
              {availableCustom.map(id => {
                const label = streamLabel(id, streamTitles[id])
                return (
                  <Row key={id} label={label}>
                    {addedZones.length === 0
                      ? <span className="pm-empty-inline">Add a panel above first.</span>
                      : addedZones.map(z => (
                          <button type="button" key={z} className="ui-btn ui-btn--sm" onClick={() => onAddToZone(id, z)}
                                  title={`Add this stream to the ${ZONE_BUTTON_LABELS[z]} panel`}>
                            + {ZONE_BUTTON_LABELS[z]}
                          </button>
                        ))}
                  </Row>
                )
              })}
            </Section>
          )}
          </>)}
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pm-section">
      <div className="pm-section-label">
        <span className="pm-section-label-text">{label}</span>
      </div>
      {children}
    </div>
  )
}

// `desc` is optional so every existing caller is untouched, but a row whose
// action is not self-evident should carry one -- UX standard #8: a control that
// is named without being explained is half-built.
function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className={`pm-row${desc ? ' pm-row--described' : ''}`}>
      <span className="pm-row-label">
        {label}
        {desc && <span className="pm-row-desc">{desc}</span>}
      </span>
      <div className="pm-row-actions">{children}</div>
    </div>
  )
}

// One layout mode, as a card. Module scope rather than defined inside the
// render (UX standard #4), and the SAME markup whether or not it is the active
// mode, so switching never reflows the pair.
function ModeCard({ name, current, badge, badgeKind, desc, note, onSwitch }: {
  name: string
  current: boolean
  badge: string | null
  badgeKind: 'rec' | 'legacy'
  desc: string
  note?: string
  onSwitch?: () => void
}) {
  return (
    <div className={`pm-mode${current ? ' pm-mode--current' : ''}${badgeKind === 'legacy' ? ' pm-mode--legacy' : ''}`}>
      <div className="pm-mode-head">
        <span className="pm-mode-name">{name}</span>
        {current && <span className="pm-mode-chip pm-mode-chip--current">In use</span>}
        {badge && <span className={`pm-mode-chip pm-mode-chip--${badgeKind}`}>{badge}</span>}
      </div>
      <p className="pm-mode-desc">{desc}</p>
      {note && <p className="pm-mode-note">{note}</p>}
      {/* The footer slot is always present so the two cards stay the same
          height; the active one states where you are instead of offering a
          move (UX standard #2 -- same shape, different content). */}
      <div className="pm-mode-foot">
        {onSwitch
          ? <button type="button" className="pm-mode-switch" onClick={onSwitch}>Use {name}</button>
          : <span className="pm-mode-here">This is your current layout.</span>}
      </div>
    </div>
  )
}
