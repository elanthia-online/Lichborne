# Lichborne — Design Document

> This is a living document. Update it before building, not after.
> Every significant UI or architecture decision should be reflected here first.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Terminology](#2-terminology)
3. [Panel System](#3-panel-system)
4. [Stream Inventory](#4-stream-inventory)
5. [Vitals Bar & Live Panels](#5-vitals-bar--live-panels)
6. [Display & Accessibility](#6-display--accessibility)
7. [Theming](#7-theming)
   - 7.1 Architecture
   - 7.2 Theme Picker Flow
   - 7.3 Theme Editor
   - 7.4 General Base Themes
   - 7.5 Guild Base Themes
   - 7.6 Theme JSON Format
   - 7.7 Sharing Themes
8. [Settings](#8-settings)
9. [Character Profiles](#9-character-profiles)
10. [AI Features](#10-ai-features)
11. [Backlog](#11-backlog)
12. [Layout Designer](#12-layout-designer)
13. [Multi-Character Support](#13-multi-character-support)
14. [Highlights & Triggers](#14-highlights--triggers)
15. [Smart Names / Contacts](#15-smart-names--contacts)
16. [Login Screen](#16-login-screen)
17. [Automations, Groups & Modes](#17-automations-groups--modes)
18. [Packaging & Distribution](#18-packaging--distribution)
19. [Map System](#19-map-system)
20. [Profile System](#20-profile-system)
   - 20.1 Overview
   - 20.2 Storage Structure
   - 20.3 File Responsibilities
   - 20.4 Authority Rules
   - 20.5 Write Flow
   - 20.6 Startup / Login Flow
   - 20.7 Game Code and Authentication
   - 20.8 Implementation Files
   - 20.9 Portability
   - 20.10 Implementation Phases
   - 19.1 Overview
   - 19.2 Map File Format
   - 19.3 Coordinate System
   - 19.4 Room Matching
   - 19.5 Cross-Zone Index
   - 19.6 SVG Rendering
   - 19.7 BFS Pathfinding
   - 19.8 Node Colors & Room Legend
   - 19.9 Location Unknown Indicator
   - 19.10 Stale Path Handling
   - 19.11 Label Modes
   - 19.12 Future Work
   - 19.14 Map Panel UI Layout
23. [Virtual Scrolling — Main Window](#23-virtual-scrolling--main-window)
24. [Lich Integration Architecture](#24-lich-integration-architecture)
    - 24.1 Product Philosophy
    - 24.2 The Full Stack
    - 24.3 What Each Layer Owns
    - 24.4 Integration Seams
    - 24.5 Feature Ownership Matrix
    - 24.6 Won't Build — Ever
    - 24.7 Import Wizard Reframe
    - 24.8 Lich Collaboration Layer — Future Roadmap
    - 24.9 Implementation Roadmap by Effort
25. [Rewrite vs. Refactor Analysis](#25-rewrite-vs-refactor-analysis)
    - 25.1 The Honest Case Against a Rewrite
    - 25.2 What to Scrap
    - 25.3 What to Keep and Go Deeper
    - 25.4 What to Add
    - 25.5 New Architecture: The LichBridge Module
    - 25.6 Recommendation
26. [Release C — Lich Dashboard Design](#26-release-c--lich-dashboard-design)
27. [Release D — Lich Dashboard Deep Integration](#27-release-d--lich-dashboard-deep-integration)
28. [Session Log — Release E2](#28-session-log--release-e2)
29. [Profile Transfer — Platform-wide Export/Import](#29-profile-transfer--platform-wide-exportimport-f38-v0100)
30. [Lich-Integration Opportunities — Research](#30-lich-integration-opportunities--research-v0112-not-yet-built)
31. [Text Modification — Mutes & Substitutes](#31-text-modification--mutes--substitutes-v012x)
32. [Visual, Interactive & AI Experiences — Backlog](#32-visual-interactive--ai-experiences--backlog-brainstorm-v012x)
    - 32.1 Graphical Visualization Features (G1–G10)
    - 32.2 Interactive Experiences (X1–X6)
    - 32.3 AI-Assisted Features (AI1–AI10)
    - 32.4 Cross-cutting architecture & dependencies
    - 32.5 Suggested build order
33. [Free Layout — Floating Windows](#33-free-layout--floating-windows-planned-v013x)
    - 33.1 Why this is tractable (current-architecture findings)
    - 33.2 Locked decisions
    - 33.3 State model
    - 33.4 The FloatingWindow component
    - 33.5 Snapping
    - 33.6 Mode toggle & measure-and-mint conversion
    - 33.7 Decoupled chrome
    - 33.8 Unlimited windows
    - 33.9 Theming & accessibility
    - 33.10 Persistence & Profile Transfer
    - 33.11 Relationship to OS-window decouple
    - 33.12 Risks
    - 33.13 Build phases
34. [Lichborne Experiences — Architecture](#34-lichborne-experiences--architecture-decided-2026-06-10-shipped-v0140)
    - 34.1 What an Experience is (and is not)
    - 34.2 Why this model — the two rejected alternatives
    - 34.3 Registry
    - 34.4 The Experience layer
    - 34.5 The shelf (add/manage UX)
    - 34.6 Persistence & Profile Transfer
    - 34.7 Theming, accessibility & guardrails
    - 34.8 Add-a-new-Experience checklist
    - 34.9 Build phases
35. [SceneParser — Scene-Event Capturer Registry](#35-sceneparser--scene-event-capturer-registry-designed-2026-06-12-phase-1-built)
    - 35.1 The capturer-registry model
    - 35.2 What existing parsers already encode (the survey)
    - 35.3 The initial capturer catalog
    - 35.4 Verification workflow (corpus = validation, not discovery)
    - 35.5 Build phases
    - 35.6 Performance contract — scene work is OFF until an Experience is open
    - 35.7 Conversation gravity (Tableau layout)
36. [Automation Analytics — usage stats & health](#36-automation-analytics--usage-stats--health-shipped-v0144)
37. [Slash Commands ("Client Commands")](#37-slash-commands-client-commands--designed-2026-07-03-phase-1-built-v0145-phases-23-built-v0146)
    - 37.1 Why `/` and the product frame
    - 37.2 Syntax
    - 37.3 The palette (the UX heart)
    - 37.4 Architecture
    - 37.5 Phasing
    - 37.6 Toast notifications
    - 37.7 Maintenance contract
38. [Command Bar Input Model — history, draft, Esc, first-session hint](#38-command-bar-input-model--history-draft-esc-first-session-hint-f57f58-v0152)
    - 38.6 `;` command separator (F59)
    - 38.7 Type-anywhere focuses the bar (F60)
39. [Global Cross-Character Rules](#39-global-cross-character-rules-f37-shipped-v0152)
40. [v0.15.2 batch records — search, session restore, settings nav, virtualization decision](#40-v0152-batch-records--search-session-restore-settings-nav-virtualization-decision)

---

## 1. Vision

Lichborne is a DragonRealms game client built for **real players** — from first-timers to veterans who have played for 30 years. It connects via Lich (primary) or direct SGE (fallback), and layers AI assistance on top of the raw game experience.

**Design principles:**
- **Composable** — every panel is independently movable, resizable, floatable, and closeable
- **Accessible** — usable by players with low vision, color blindness, epilepsy, or motor impairments
- **Familiar** — veterans coming from Genie or StormFront should feel at home immediately
- **Discoverable** — new players should be able to configure the client without reading a manual
- **Performant** — never drop game text, never lag a command

**Product position:**

Lichborne is not a general-purpose DR client that happens to support Lich. It is a purpose-built **display and configuration layer** that treats Lich as a first-class citizen. Lich owns all automation — scripts, variables, text substitution, conditional triggers, and training/combat routines. Lichborne owns what you see, hear, and configure visually.

This distinction is the product's moat. Every other DR client (StormFront, Genie, Frostbite, Wrayth) treats Lich as an optional add-on. Lichborne is built around Lich as the assumed runtime — which means it can go deeper on rendering quality and Lich dashboard features than any client that has to work without Lich too.

The two unique advantages no other client offers today:
1. **Rendering depth** — modern themes with 100+ CSS variables, 16+ built-in themes including all 12 guild palettes, full accessibility suite, virtual scrolling, hybrid map (Lich image tiles + Genie SVG graph), and a display profile system that follows the player across reinstalls and machines.
2. **Lich dashboard** (roadmap) — surfacing Lich's runtime state (running scripts, variables, YAML profiles, hook registry) directly in the UI. No other client has done this. It is the reason Lich users would choose Lichborne over Genie even for a setup they could script themselves.

See Section 24 for the full Lich integration architecture and Section 25 for the release roadmap.

---

## 2. Terminology

Three core concepts appear throughout this document and the codebase. Using them consistently matters.

**Panel** — a framed container in the client layout. Panels are the physical windows players see and resize. The default layout has four: the main story panel on the left, and Right-Top, Right-Center, and Right-Bottom on the right column. Each panel has a tab bar so it can hold multiple content sources at once.

**Stream** — a named text feed pushed by the server via `<pushStream id="..."/>`. The client detects streams automatically and makes them available to snap into any panel. Examples: `thoughts`, `arrivals`, `deaths`, `familiar`, `moonWindow`. A stream is content, not a container.

**Structured Panel** — a data-driven content type that lives in a panel tab but is not a stream. **Room** and **Exp** are the two current examples. Their content comes from structured XML elements (`<component>`, `<compass>`, `<progressBar>`, etc.), not from `pushStream`. They look like stream tabs from the player's perspective but are built differently underneath.

> In short: players put **streams** and **structured panels** into **panels**.

---

## 3. Panel System

### 2.1 Philosophy

The layout is not hardcoded. Every game stream, status display, and tool is a **panel** — a self-contained widget that can be placed anywhere. The layout is stored as JSON and can be saved, loaded, shared, and reset.

Think of it like a trading terminal or VS Code: you compose your workspace, and the client remembers it.

### 2.2 Panel Behaviors

Every panel supports:

| Behavior | Description |
|---|---|
| **Dock** | Snap into the main window grid (left, right, top, bottom, center) |
| **Float** | Detach into its own OS window (useful for multi-monitor setups) |
| **Tab** | Merge with another panel — they share space with tabs to switch between them |
| **Unread indicator** | A gold dot appears on an inactive tab when new content has arrived; clears when the tab is activated |
| **Resize** | Drag borders to resize within the layout grid |
| **Close** | Hide the panel (stream still runs, just not displayed) |
| **Reopen** | Restore any closed panel from the View menu or panel manager |
| **Pin** | Lock a panel in place so it can't be accidentally moved |

### 2.3 Default Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Health ████████░░  Mana ████░░░░  Conc ████░░  Fat ████░░   │
│  Spirit ████░░░░         [Standing]  [RT: 3.0s]  [Fire Ball]  │
├──────────────────────────────────┬──────────────────────────┤
│                                  │ ROOM                     │
│                                  │ The Crossing, Town Square│
│                                  │ ─────────────────────    │
│   MAIN TEXT                      │ You are standing in...  │
│                                  │                          │
│                                  │ Obvious exits: n, e, sw  │
│                                  ├──────────────────────────┤
│                                  │ THOUGHTS                 │
│                                  │ * Muse thinks, "hello"   │
├──────────────────────────────────┤ * Agan thinks, "hi"      │
│ >  _                    [Send]   ├──────────────────────────┤
└──────────────────────────────────┤ EXP  |  LOG              │
                                   └──────────────────────────┘
```

The command bar spans only the main text area — the right panel column extends to the bottom of the window, giving the bottom-right panel (Experience + Log) maximum vertical space.

This is the **starting point**, not a constraint. Players can reshape it freely.

### 2.4 Layout Profiles

Players can save named layouts and switch between them:

- **Default** — the layout above
- **Combat** — bigger main window, RT prominent, room compressed
- **Crafting** — more streams visible, smaller vitals bars
- **Minimal** — just main text and command bar, everything else hidden
- *(custom)* — player-defined and named

Layout profiles are saved to `~/.lichborne/layouts/[name].json`.

### 2.4b Command history — app-wide minimum length (F82, v0.18.3)

`↑`/`↓` recall keeps every non-blank command you type, which means a session of
`n` / `s` / `ne` buries the long command you wanted back (Qij, via Sekmeht).
`SharedProfile.commandHistory.minLength` (0-5) is the shortest command worth
remembering. **Default 0 = the pre-F82 behaviour exactly** — nobody's history
changes until they opt in — and it only affects NEW entries, so existing short
commands age out naturally against the 200 cap.

APP-WIDE rather than per-character: the history DATA is per-character
(`state.commandHistory`), but how recall should BEHAVE is a set-once preference,
like the Session Log settings. Surfaced in Settings → Behavior and as
`/history` (status) / `/history min N` (alias `/hist`) — a bare+verbs noun, so
it depends on the `NOUNS_WITH_VERBS` palette rule and must NOT also define a
`status` verb.

Three decisions worth keeping:
- **Slash commands are always remembered**, whatever the threshold. `/ai`,
  `/mode` and `/panel` are short but are exactly what you want to recall, and
  they are never the movement spam the setting exists to filter.
- **Length is measured after trimming**, so `"  s  "` cannot slip past a min of 3.
- **The value is read FRESH at push time**, not held in a ref: it is a tiny
  localStorage read, and it means a Settings change applies instantly to every
  open character with no cross-window event to wire (the
  `loadSessionLogSettings` precedent).

The gate needed exactly ONE insertion point because `dispatchUserText` is the
sole writer of history (see the command-send pipeline) — every other path
passes `pushToHistory: false`. The browse index still resets on Enter even when
the command was not stored, so Enter always returns you to the live line.

### 2.5 Layout Manager (was "Panel Manager")

**RENAMED v0.18.2 (F78, Sekmeht): the toolbar button is now `Layout` and the modal is the `Layout Manager`.** The rename is **DISPLAY ONLY** — every persisted identifier is unchanged (`layoutMode`, `freeWindows`, `freeLayoutLocked`, `panelWidth`, `panelFontSizes`, the four zone keys), as is the `toggle-panels` session action and the `panelManager` status flag, so no migration was needed. The one place it reached data: Profile Transfer serialises categories by **id**, so that category's `label` moved `'Panel Layout'` → `'Layout'` while `id: 'layout'` deliberately did not — renaming the id would make every `.lb.yaml` already on disk silently skip the category on import. *Labels are display, ids are data.*

**The mode choice is a CHOOSER, not a status banner (v0.18.2).** It was one banner describing whichever mode you were already in, with a single "Switch to…" button — so the choice itself, and the fact that Static Panels is being retired, were invisible until you clicked. Two cards now state it: what each mode IS, which one is `In use`, that Static is `Legacy`, and that switching converts your layout (and switching back leaves it as you left it). Both render in the SAME shape whichever is active (UX standard #2) so nothing jumps on switch; Legacy is **muted rather than alarming** — it still works — and regains its background when it IS the active mode, so you can always see what you're using. The free-mode controls (Lock windows / Fit bars to content / Rebuild from panels) became described rows with visible explanations rather than hover-only tooltips (UX standard #8). "Reset panels" renders only in Static mode, because it resets the docked zones and is a no-op you can't see in Windowed. Since v0.19.7 it is the last row under Panel locations, and it asks first (B370).

A dedicated UI lets the user shape the layout in two independent dimensions: which **panel slots** exist in the layout, and which **streams** live in each slot.

**Panel slots (v0.8.1, "V2").** The layout has four fixed slots:

| Slot | Position |
|---|---|
| Main-Top | Above the main scrolling text + command bar (left side of the game window) |
| Top-Right | Top of the right panel column |
| Middle-Right | Middle of the right panel column |
| Bottom-Right | Bottom of the right panel column |

Each slot is independently *added to* or *removed from* the layout via the **Panel Locations** section at the top of the manager. "Add Panel" snaps the slot into the game window (empty placeholder until streams arrive); "Remove Panel" hides the slot and returns its streams to the Available Streams pool below. Each slot's added/removed state is per-character, persists in the YAML profile (`mainTopAdded` / `topAdded` / `midAdded` / `bottomAdded` in the state map), and survives across launches.

**Right-column sizing follows the count of added slots:**
- 0 added → right column + vertical divider don't render; main text gets the full width
- 1 added → that slot takes the full column height (`flex: 1`)
- 2 added → 50/50 default; the divider drags the first slot's saved height while the second remains flex
- 3 added → the canonical layout (top + middle use saved px heights, bottom takes the flex remainder, both dividers draggable)

Saved heights persist across mode changes — toggling 3→2→3 restores the user's split. Main-Top is independent of the right column: it has its own resizable height and its own divider against the main text below.

**Migration defaults when the `*Added` flag is missing:** Main-Top → `false` (Main-Top is new in v0.8.1; users opt in explicitly), other three → `true` (preserves the v0.8.0 always-visible behavior for existing users who never opened the new manager). New users start with the same defaults — three right-column slots populated with their stream defaults, Main-Top removed.

**Streams.** Each added slot's section in the Panel Manager lists the streams currently in that slot, with per-row controls to **reorder** the stream within its slot (◀ / ▶ — moves the tab one position left or right in the slot's PanelFrame tab bar; v0.8.2), **move** the stream to a different added slot (`→ Zone-Name`), or **remove** it (returns it to Available Streams). The Available Streams section shows every builtin PanelType not yet placed, plus any discovered custom streams; rows there show `+ Zone` buttons that target each currently-added slot.

A **Reset panels** row restores defaults. Since v0.19.7 it is the last item under Panel locations, and it asks first (B370). It restores all four slots added (yes, including Main-Top — Reset is "everything visible", not "back to new-user state"), with their default streams.

**Empty added slots** render an `EmptyPanelSlot` placeholder in the layout (dashed border, label, click → opens the Panel Manager) so the slot is visible and reachable. Removing every stream from an added slot doesn't hide the slot — that requires explicit Remove Panel.

### 2.6 Panel Catalog

| Panel ID | Default Location | Content |
|---|---|---|
| `main` | Center-left | Primary game text stream |
| `room` | Top-right (tab 1) | Room name, desc, objects, players, clickable exits |
| `conversations` | Top-right (tab 2) | In-game speech, yell, and whisper (server `talk` stream) |
| `thoughts` | Center-right (tab 1) | Thoughts channel |
| `arrivals` | Center-right (tab 2) | Logon/logoff notices |
| `deaths` | Center-right (tab 3) | Death announcements |
| `spells` | Center-right (tab 4) | Active spells / spell prep |
| `exp` | Bottom-right | Live skill mindstate tracker |
| `familiar` | Closeable tab | Familiar stream |
| `inv` | Floatable | Inventory |
| `vitalsbar` | Top (fixed) | Health/Mana/Concentration/Fatigue/Spirit |
| `indicators` | Top (fixed) | Stance, RT, cast time, prepared spell |
| `debug` | Hidden by default | Three-tab panel: **Fires** (live log of highlight/trigger fires with → GOTO to the source rule), **Events** (parsed GameEvent stream), and **Raw XML** (raw server lines pre-parse). Each tab has column headers, a per-tab `Copy All` to the system clipboard (Electron-native IPC, not `navigator.clipboard` — see Pitfall #29), and a Clear button. Buffers hold up to 2000 entries per tab (v0.8.2), ring-trimmed; collection is gated on the panel being open so closed-Debug overhead is zero. Toggled via the "Debug" toolbar button. |

### 2.7 User-Created Panels

Players and Lich scripts can create named panels on the fly — not just the built-in catalog, but arbitrary panels defined at runtime.

**From the UI:**
- Panel Manager → "New Panel" → give it a name and an ID
- The panel appears in the layout immediately, ready to receive text
- It behaves like any built-in panel: dockable, floatable, tabbable, closeable

**From Lich scripts:**
- Scripts can open a named panel by sending a command through the client's Lich bridge
- Text redirected to that panel's ID appears there instead of in the main stream
- If the panel doesn't exist yet, the client creates it automatically and places it in a default position
- This matches the behavior Genie players expect — scripts that open custom windows should just work

**Panel persistence:**
- User-created panels are saved in the layout profile like any other panel
- If a layout is loaded that references a user panel that no longer exists, the client creates a placeholder rather than crashing
- Panels with no source (no script redirecting to them) show as empty with a subtle "waiting for content" message

**Use cases this enables:**
- Custom exp trackers, wound trackers, or loot loggers from Lich scripts
- Player-built overlays for crafting, combat rotations, or guild-specific tools
- Any script that today creates a Genie window and redirects text to it

### 2.8 Main Text Panel — Scroll Behavior

The main text window has one job: never lose game text, never lose your place.

- **Append-only rendering** — new lines push to the bottom. All buffered lines are in the DOM (no virtualization); the buffer is capped to keep memory reasonable.
- **Smart scroll anchor** — scrolling up pauses auto-scroll silently. A **"▼ N new lines"** badge appears at the bottom edge; it turns orange past 1000 new lines and red past 3500 as a warning. Clicking the badge or pressing `End` resumes auto-scroll, jumps to the bottom, and trims the buffer (hysteresis rules below). The player decides when to return; the client never forces them back.
- **No trim while unpinned** — when the player is scrolled up, new lines are appended without removing old lines from the top. Trimming while unpinned shifts `scrollTop` forward (because `overflow-anchor: none` is set, so Chromium does not compensate), causing visible drift. A hard cap of 3× MAX_LINES (6000 lines) auto-resumes auto-scroll if the buffer grows very large.
- **Trim with HYSTERESIS while pinned (B171, v0.13.4)** — the buffer grows to `MAX_LINES + TRIM_CHUNK` (2400), then is cut back to MAX_LINES (2000) in ONE slice (`appendTrimmed()`, the single append/trim primitive every `setLines` site uses). A per-batch trim that held the length exactly AT the cap was the long-unsolved "text hops after a while": it shifted every virtuoso row index per batch (stale size cache → visible backward jumps) and, with the count constant, starved `totalListHeightChanged` — the only per-batch re-pin trigger. See §23 and CLAUDE.md pitfall #81.
- **Keyboard scroll** — `PageUp`/`PageDown` scroll the text window by one screen; `Home` jumps to the top of history; `End` returns to the bottom and re-pins auto-scroll. All four keys are suppressed when any text field is focused so they don't interfere with typing.
- **Scrollbar arrows** — up/down arrow buttons rendered via `::-webkit-scrollbar-button` with SVG data-URI triangles (Chromium removes native arrows by default). Clicking scrolls one line; hover darkens the button background for feedback.
- **Scroll pinning implementation** — `pinnedRef` (a React ref, not state) tracks whether auto-scroll is active. `overflow-anchor: none` on the scroll container prevents Chromium from competing with our manual scroll management. **NOTE: the live auto-scroll engine was rewritten since this paragraph** (the `useLayoutEffect`/`scrollIntoView` model became `followOutput: false` + the single `stickToBottom()` rAF settle loop, v0.11.6–v0.11.8) — **CLAUDE.md pitfalls #68 (the settle-loop architecture) and #71 (rAF-throttled-while-hidden) are the current reference.** Re-pinning is via `scrollToBottom()` (badge click / End) and the refocus re-snap; `handleVirtuosoScroll` only un-pins. **B191 (v0.14.1): `handleVirtuosoScroll` skips entirely while `document.hidden`** — when the window is occluded (another app covering it, not just minimize) rAF throttles, the settle loop stalls, and an async-measurement scroll event would otherwise un-pin the active char with no user action (the spurious "New Lines" badge after tabbing away). A user can't scroll a hidden window, so any scroll signal there is layout, not intent. **B223 (v0.17.1) — the un-pin now requires PERSISTENCE, and two claims in this paragraph turned out to be wrong.** The long-standing intermittent "un-pins itself, badge appears, never recovers" bug was traced to react-virtuoso's **upward-scroll compensation**: `appendTrimmed`'s 400-line slice makes Virtuoso read `scrollDirection === 'up'` (the gate for that compensation) with an index-stale size tree, and its rAF-batched re-measures then `scrollBy(-k)` — an unsuppressed scroll that `stickToBottom`'s loop fights back each frame (**the "quivering scrollbar" the tester spotted**). Since `handleVirtuosoScroll` cannot tell a library scroll from a user one, one landing after the settle loop exits un-pinned the view. **Fix:** the `dist > 40` branch now re-checks 2 frames later and only commits if the distance persists (wheel-up / PageUp / Home un-pin directly and never reach it, so no real path is affected); and `onRefocus` self-heals when the un-pin happened *after* the blur. **Corrections to the above:** (1) the **`document.hidden` guard is probably INERT** — `backgroundThrottling: false` also affects the Page Visibility API per Electron's own typings, so `document.hidden` likely stays false while minimized/occluded; the B223 fix is deliberately source-agnostic so it holds regardless. (2) **`overflow-anchor: none` is no longer in `src/`** — Chromium anchoring is neutralized only because Virtuoso stamps it on every item element; the app-level guarantee this paragraph describes no longer exists. Full write-up: CLAUDE.md pitfall #96.
- **Batched updates** — if many lines arrive in a single tick, they are rendered in one React update, not one per line.

### 2.9 Link Rendering

The parser and renderer cooperate to make in-game links clickable without leaving the client.

**`<a href>` tags** — `StormFrontParser` tracks a `linkHref` state. On `<a href='...'>` the URL is stored; all text segments emitted while `linkHref` is set carry `href` on the `TextSegment`. On `</a>` the state is cleared. The renderer checks `seg.href` and renders a `.url-link` span; clicking calls `window.api.openUrl(href)` which sends an `open-url` IPC message to main — `shell.openExternal` opens the URL in the OS default browser.

**`<LaunchURL src='...'>` tags** — server-initiated browser launches. The parser emits a `launch-url` event. In `main.ts`, before forwarding events to the renderer, any `launch-url` events are intercepted and handed directly to `shell.openExternal`. The renderer never sees this event type.

**Auto-detected URLs** — the parser also scans every plain-text segment for bare `http://` / `https://` URLs using a static regex. Each match is split into its own segment with `href` set and `autoHref: true`. Trailing punctuation (`.,;:!?)\]'"`) is stripped from the URL to avoid capturing sentence-ending characters. The `autoHref` flag lets the renderer respect the user's **Auto-link URLs** setting toggle — if the toggle is off, `autoHref` segments render as plain text while explicit `<a href>` links still work.

**CSS** — `.url-link` uses `var(--link-color)` (default `#6a9fd8`). `.cmd-link` (for `<d cmd>` command links) uses `var(--cmd-link-color)` (default `inherit`). Both variables are exposed in ThemeEditor under the Game Text → Links group.

### 2.10 Monospace / Pre-formatted Blocks

The server wraps fixed-width content (stat displays, stance output, Lich script echoes) in `<output class="mono"/>` … `<output class=""/>` tags. These blocks rely on multiple consecutive spaces for column alignment and must not be collapsed by the browser.

**Parser**: `StormFrontParser` tracks a `monoMode` boolean. `<output class="mono"/>` sets it true; `<output class=""/>` clears it. Both tags are self-closing and handled in `tagStart` only. Lines flushed while `monoMode` is active carry `mono: true` on the emitted `StreamTextEvent`.

**Preset captures in mono mode**: When the server highlights a stat (e.g. a buffed value), it wraps the text in `<preset id="speech">...</preset>` within the mono block. The parser's normal behavior trims captured preset text; in mono mode this must be suppressed — leading spaces in the preset content carry column position. The parser uses the raw buffer (newlines stripped, spaces preserved) when `monoMode` is active at capture close time.

**Renderer**: `TextLine` has an optional `mono` boolean. When true, both the main window and `StreamPanel` apply `white-space: pre` inline style to that line's container `<div>`. This preserves the server's spacing exactly without requiring a separate element type or CSS class.

---

### 2.11 Disconnect Behavior

When the connection drops for any reason (user-initiated QUIT, server timeout, death, Lich shutdown, socket error), the client stays on the game screen rather than navigating away. This lets the player see what happened before returning to the login flow.

**Toolbar button**: changes from `Disconnect` → `Login` (styled in accent color). Clicking `Login` calls `onDisconnect` to return to the login screen.

**Debug panel**: opened manually only (the early-version auto-open on unexpected disconnects was removed — no `setShowDebug(true)` path exists in the code today; B11 history). When any debug surface is open — the docked strip in Static Panels, or a `debug` tab in a zone / floating window (the `debugOpen` presence memo, B166 v0.13.2) — the renderer sends a `debug-panel-toggle` IPC signal to main; main gates the `raw-xml` channel behind that flag so raw lines are never serialized over IPC during normal play. The signal re-sends on `session.sessionId` change so a reconnect-in-place re-arms the gate.

**Clean vs unexpected detection**: a `cleanDisconnect` flag in `main.ts` is set when: (1) `quit` or `exit` is sent via `SEND_COMMAND` IPC, (2) the Disconnect button fires the `DISCONNECT` IPC handler, or (3) the parser sees `<exit/>` (direct connection). The flag is read and reset in `connection.on('disconnect')` and passed as `clean: boolean` in the status payload — no cross-channel race possible.

**"Connection closed." message**: injected into the main text window via a `useEffect` on `dropped` (fires after all pending game text has rendered), with a blank line above and a `[HH:MM]` timestamp — matching Genie's behavior.

**State**: a `dropped` boolean in `GameWindow` is set `true` on any disconnect. The toolbar status text changes color (accent) to make the disconnected state visually obvious.

---

### 2.12 IPC Event Dispatch Pipeline

The path from raw TCP bytes to rendered game text is:

```
TCP chunk → LichConnection.flush() → 'line' event (one per \n)
  → main.ts line handler:
      1. [debug only] send raw line on 'raw-xml' channel
      2. parser.parse(line) → GameEvent[]
      3. side-effects: shell.openExternal (launch-url), cleanDisconnect flag (game-exit)
      4. filter: drop 'launch-url' and 'unknown' event types
      5. push remaining events into eventQueue
      6. scheduleFlush() — setImmediate batches across the full TCP read
  → one 'game-event' IPC send per server tick → renderer
```

**Event batching**: `scheduleFlush()` in `main.ts` uses `setImmediate` so all lines from a single TCP read (which Node.js delivers as one I/O event) are coalesced into a single `webContents.send`. During connection burst (~40–60 lines) this reduces IPC round-trips from one-per-line to one total.

**`raw-xml` channel gating**: raw lines are only sent over the `raw-xml` IPC channel when a Debug surface is open (the docked strip, or a `debug` tab in a zone / floating window — the `debugOpen` presence memo, B166 v0.13.2). The renderer sends `debug-panel-toggle: true/false` to main when that presence changes (and on `session.sessionId` change, so a reconnect-in-place re-arms it); main stores `debugPanelOpen` and gates the send on it. Zero IPC overhead during normal play.

**`unknown` event filtering**: `StormFrontParser` emits `UnknownEvent` for tags it does not recognize — these carry no display content and the renderer ignores them. They are dropped in the main process before the IPC send so they never cross the boundary.

**LichBridge intercept seam** (Release C): the line handler is the correct interception point for `;listall` response suppression. The LichBridge module will inspect each line before `parser.parse()` is called, pull off lines that match the `SCRIPT_LIST_PATTERN`, and prevent them from reaching the parser (which would emit them as `stream-text` events on `main`).

---

## 4. Stream Inventory

### 4.1 Named Streams

Text streams are routed by the server using `<pushStream id="..."/>` / `<popStream/>` tags. Each maps to an internal stream target and a default panel.

The server declares all streams it intends to use via `<streamWindow id="..." title="..."/>` tags sent at login. The client emits a `stream-declare` event for each, making every stream available in the panel manager before any content arrives. The `title` attribute is used as the panel label.

| Server Stream ID | Internal Target | Description | Default Panel |
|---|---|---|---|
| `main` | `main` | Primary game output | `main` |
| `thoughts` | `thoughts` | Thought channel messages | Center-Right |
| `death` | `deaths` | Death announcements | Center-Right |
| `logons` | `arrivals` | Arrivals and departures | Center-Right |
| `talk` | `conversations` | In-game speech, yell, whisper | Top-Right |
| `whispers` | `whispers` | Direct whispers (separate channel) | discoverable |
| `conversation` | `conversation` | Conversation channel | discoverable |
| `ooc` | `ooc` | Out-of-character channel | discoverable; **deliberately NO `main` fallback** (v0.19.3 sweep): Frostbite's parser comments that the speech in the ooc stream is *"duplicated from whisper stream"* — a native outside-the-block copy, the B136/pitfall-#49 case, so a fallback would double-print |
| `chatter` | `chatter` | Seen by Frostbite (routed into its Thoughts window); source and duplication unknown — **UNDECIDED, needs a Debug raw-XML capture** before it gets a fallback or an alias (v0.19.3 sweep) | discoverable |
| `familiar` | `familiar` | Familiar link output | `familiar` |
| `percWindow` | `spells` | Active spells / buffs. Clear-and-rewrite STATE (no `STREAM_FALLBACK` entry — see §34.9 item 4), so `streamLines.spells` is always an exact mirror of the current block; parsed by the Spell Monitor Experience | Center-Right |
| `inv` | `inv` | Inventory updates | `inv` |
| `room` | `room` | Room description components | `room` |
| `combat` | `combat` | Combat messages | `main` |
| `atmospherics` | `atmospherics` | Ambient / weather text | `main` |
| `group` | `group` | Group roster — a clears-and-rewrites STATE stream, not a log | discoverable; **no** `main` fallback since v0.14.3 (re-spammed the roster on every change) |
| `assess` | `assess` | Combat-situation ASSESS block (creatures, ranges, facing) — also consumed by the Living Tableau's combat arena, independent of whether a panel watches it | discoverable, falls back to `main` |
| `shopWindow` | `shopWindow` | SHOP replies at surface-based shops (the goods list, `shop window`, `shop <item>`) — DR titles it "Shopping"; no outside-the-block copy to main (B306, v0.19.3) | discoverable, falls back to `main` |
| `moonWindow` | `moonWindow` | Moon phase tracker (replace-on-push) | discoverable |
| `LichScripts` | `LichScripts` | Running Lich scripts — live list from `script-watch.lic` (replace-on-push) | discoverable |

**Replace-on-push streams** (moonWindow, LichScripts, experience, inv) have their producers send `<clearStream id="X"/>` before each push. This wipes the panel and replaces it with fresh content — no stacking. Append streams (thoughts, deaths, arrivals, etc.) never send `<clearStream>`, so content accumulates as a scrolling log. The client does not hardcode this distinction — it is entirely XML-driven.

All named streams use a **fallback to main** when no panel tab is open for them. Once the player opens a panel for that stream, new text routes there instead. This ensures no game text is ever silently lost — the main window is always the safety net.

### 4.2 Structured Data Feeds

Beyond text streams, the server pushes structured XML elements that drive UI components directly. These are not text — they are data. The client must parse them and update the relevant panel state, never displaying them as raw text.

| XML Element | Data Provided | Drives |
|---|---|---|
| `<progressBar id="health" value="72" text="72"/>` | Exact numeric value + display string for each vital | Vitals bar |
| `<progressBar id="mana" value="59" text="inner fire 59%" customText="t"/>` | `customText='t'` signals a guild-specific label; the client extracts it from `text` | Vitals bar label override |
| `<roundTime value="1714512345"/>` | Unix timestamp when RT expires — not a duration | RT countdown |
| `<castTime value="..."/>` | Unix timestamp when cast time expires | Cast countdown |
| `<indicator id="stance" visible="y"/>` | Boolean state for each status flag | Indicator icons |
| `<spell>Fire Ball</spell>` | Name of currently prepared spell | Indicator row |
| `<component id='exp Evasion' text="Evasion: 3 (2%)">` | Skill name, rank, mindstate per skill trained | Experience panel |
| `<component id='room name'>...</component>` | Room title string | Room panel |
| `<component id='room desc'>...</component>` | Room description prose | Room panel |
| `<compass><dir value="n"/><dir value="sw"/></compass>` | Exit directions as abbreviated values (n/ne/e/se/s/sw/w/nw/up/dn/out) | Room panel — the clickable "Obvious paths:" line (full direction words; v0.14.7) |
| `<component id='room objs'>...</component>` | Objects in the room | Room panel |
| `<component id='room players'>...</component>` | Players in the room | Room panel |
| `<component id='room creatures'>...</component>` | Creatures/NPCs in the room | Room panel — its own prose line when non-empty (v0.14.7) |
| `<component id='room extra'>...</component>` | Extra room annotations (e.g. forageable items) | Room panel — its own prose line when non-empty (v0.14.7) |
| `<component id='exp rexp'>Rested EXP Stored: 4:01 hours Usable This Cycle: 35 minutes Cycle Refreshes: 3:31 hours</component>` | Rested EXP pool — stored hours, usable this cycle in **minutes** (small pool) or **hours** (large pool), cycle refresh time | Exp panel footer — `RXP 35m / 4:01h` (minutes format) or `RXP 5:56h / 4:20h` (hours format); unit auto-detected; refresh time dropped from display; ExpBrief mode sends empty component — RXP row hidden |
| `<component id='exp tdp'> TDPs: 59616</component>` | Total Development Points available | Exp panel footer — `TDP 59616` |
| `<component id='exp favor'> Favors: 37</component>` | Immortal favor balance | Exp panel footer — `Fav 37` |
| `<component id='exp sleep'></component>` | Sleep state — empty = awake; level 1 contains "relaxed…state of rest"; level 2 contains "fully relaxed…deep sleep" | Exp panel footer — empty: nothing shown; level 1: italic `Resting` (`--exp-sleep-1` blue); level 2: italic `Deep Sleep` (`--exp-sleep-2` purple) |
| `<component id='exp rexp'>[Because of Death's Sting, your rested exp is currently not being used.]</component>` | Death's Sting active — fires as a SECOND `exp rexp` component in every exp batch while active, overwriting the normal rested exp summary in `skills['rexp']` | Exp panel footer — red italic `Death's Sting` badge; RXP data hidden while active; clears when next batch has only the normal rexp summary (second component stops appearing) |
| `<component id='exp SkillName'><b> SkillName: 991 00% dabbling </b></component>` | Rank gain — `<b>` wrapper is the server's signal; fires once at the moment of the rank, not on subsequent updates | Exp panel — skill row renders bold for 3 seconds via `exp-row--rank-up` class; detected via `CaptureContext.hasBold` in parser, propagated as `rankUp: true` on `ExpComponentEvent` |
| `<streamWindow id="LichScripts" title="Lich Scripts"/>` | Declares a named stream and its display title before any content is pushed | Stream discovery — emits `stream-declare` event; panel becomes available in Panel Manager at login |
| `<d cmd='go south'>text</d>` | Inline clickable command link with explicit command | Rendered as dotted-underline clickable span; click sends `cmd` to game |
| `<d>south</d>` | Bare exit label or help command — text content IS the command | Same dotted-underline rendering; text content sent directly as command on click |
| `<dialogData id="injuries"><image id="chest" name="Injury2" …/>…</dialogData>` | Per-body-part damage — 15 parts (head, neck, chest, abdomen, back, rightArm/Hand, leftArm/Hand, rightLeg/Foot, leftLeg, rightEye, leftEye, nsys). **The `name` encodes BOTH the kind and the rank, and a WOUND and a SCAR are different states** — verified against Lich's parser (`lib/common/xmlparser.rb` ~681-690), the authority here: `Injury<n>` = an **active wound** of rank n; `Scar<n>` = that wound has **HEALED** (wound → 0) leaving a **scar** of rank n; `Nsys<n>` = nerve damage; anything else (incl. `name === id`) = healthy. **Do NOT infer severity from a trailing digit on an arbitrary name** — this table previously described the name as the part id plus a digit (`"head1"`), which is what caused B224: scars were rendered as permanent wounds. Derive "healthy" from the ABSENCE of Injury/Scar/Nsys, not from a sentinel equality. | Injuries panel — wounds grouped by section and colour-coded by severity; **scars listed separately in a muted, neutral style** (healed history, never active damage); "No active wounds." when no wound is present, and the same for an EMPTY part map — DR sends this dialog only when injuries CHANGE, so an unhurt character may never receive one (B422) |
| `<dialogData id="injuries"><progressBar id="health2" …/>` | Secondary health bar within the injury diagram UI | Parsed but currently not displayed separately (main health bar is authoritative) |
| `<nav/>` | Frame marker sent before room-change data arrives | Silently consumed — room state updates when new component data arrives |

**The `<compass>` block** is the authoritative source for directional exits. `<dir value="n"/>` tags inside it carry abbreviated tokens (n, ne, e, se, s, sw, w, nw, up, dn, out); the room panel's exits line renders them as full direction words (which are also what a click SENDS — the raw token `dn` isn't a valid DR command).

**Inline color** is applied via `<color fg="ff0000" bg="000000">text</color>` — the parser maintains a color stack and attaches fg/bg hex values to text segments.

**Vital values** are exact integers from the server, not bar-fill approximations. The numeric label on each bar displays the server's own value directly.

**Roundtime** is an absolute Unix timestamp, not a countdown duration. **It is timed against the SERVER's clock, NOT the local one (B192, v0.14.2):** `<roundTime>`/`<castTime>` defer to the next `<prompt time=T>` (the server's current time) and the parser emits `expires = Date.now() + clamp(value − T, 0, 300s)*1000` — the DURATION comes from the server (`value − T`), the local clock is only the countdown anchor (compared against the same local clock in the renderer). The old `value*1000 − Date.now()` form compared the server's clock to the local one and inflated the bar by any client/server clock skew (a user whose PC clock was minutes behind saw the bar max out and drain too slowly). Frostbite and Genie both anchor to the prompt time the same way — see CLAUDE.md pitfall #87.

**Experience components** are pushed by the server whenever a mindstate changes. The exp panel is a live view of a clean structured data feed — not a text scraper.

### 4.3 Stream Timestamps

> Status: Implemented 2026-05-06.

Any stream panel can display a `[HH:MM]` wall-clock prefix on each line. The toggle is per-stream, accessible via right-click → **Enable/Disable Timestamps**. Settings persist to localStorage so each stream remembers its preference across sessions.

**Implementation details:**
- Every `TextLine` carries a `timestamp: number` (Date.now() at receive time) — stored regardless of toggle state
- Display is render-time only — toggling applies immediately and retroactively to all buffered lines in the panel
- Prefix styled as `.ts-prefix`: muted (`--text-dim`), 0.8em, non-selectable — recedes visually without hiding the value
- Scope: stream panels only; main text window excluded (too noisy for continuous output)

**Target streams:** Deaths, Arrivals, Thoughts, Spells, Conversations — any stream where knowing *when* something happened matters more than the continuous flow of text.

### 4.4 Text Styles (Presets)

StormFront `<preset>` tags map to visual styles:

| Preset | Meaning | Default Style |
|---|---|---|
| `speech` | In-room speech | Gold / italic |
| `whisper` | Whispered speech | Muted gold / italic |
| `thought` | Thought channel | Cyan |
| `roomname` | Room title | Bold white |
| `roomdesc` | Room description | Soft white |
| `bold` | Emphasis | Bold |
| `expiry` | Expiring effect warning | Orange |
| `store` | Commerce text | Green |

Each preset has both a **foreground (text) color** and a **background (highlight) color**. The highlight defaults to transparent (off) for all presets across all themes. Players can enable a highlight color per preset in the theme editor — useful for making speech, thoughts, or expiry warnings pop with a tinted background. Both colors are fully themeable and per-character via profiles.

---

## 5. Vitals Bar & Live Panels

### 5.1 Vitals

Five core vitals displayed in order, each as a labeled progress bar. Values come directly from `<progressBar>` XML elements — exact integers, not approximations.

| ID | Label | Color (default) |
|---|---|---|
| `health` | Health | Green → Yellow → Red (based on %) |
| `mana` | Mana (or guild name, e.g. "Inner Fire" for Barbarians) | Blue |
| `concentration` | Concentration | Teal |
| `stamina` | Fatigue | Orange |
| `spirit` | Spirit | Purple |

Bar color shifts automatically at thresholds (e.g. health goes yellow at 50%, red at 25%). Thresholds are configurable.

Some guilds use a custom name for their mana bar. When the server sends `customText='t'` on the `<progressBar>` element, the client uses the label embedded in the `text` attribute (e.g. `text='inner fire 59%'` → displays as "Inner Fire") instead of the default "Mana" label. Other vitals are unaffected.

**Compact vitals** (opt-in, `settings.compactVitals`, default off). A denser strip that reclaims ~half a line of game text: roughly half-height bars (12px vs 22px) with tighter padding, and the label shortened to an acronym — first letter of each word, so "Health" → `H: 100%`, "Concentration" → `C: 100%`, and a Barbarian's "Inner Fire" mana → `IF: 100%`. The acronym is derived from the live label at render time (not a lookup table), so any guild rename via `customText='t'` is covered automatically. Per-character setting; transfers with the Display & Accessibility category. First phase of a broader top-chrome space-optimization pass (see the toolbar/app-bar work).

### 5.2 Indicators

Displayed alongside or below the vitals. All state comes from `<indicator>` XML elements and `<roundTime>` / `<castTime>` timestamps — no text parsing.

| Indicator | Source | Display |
|---|---|---|
| Stance | `<indicator id="stance">` | Icon + label (Standing / Kneeling / Prone / Sitting) |
| Roundtime | `<roundTime value="[unix timestamp]"/>` | Precise countdown to expiry, pulses when active |
| Cast time | `<castTime value="[unix timestamp]"/>` | Separate precise countdown for spell casting |
| Prepared spell | `<spell>` element | Name of currently prepared spell, or blank |
| Hidden | `<indicator id="hidden">` | Lock icon when hidden |
| Bleeding | `<indicator id="bleeding">` | Red dot when bleeding |
| Webbed | `<indicator id="webbed">` | Chain icon when webbed |
| Stunned | `<indicator id="stunned">` | Shape/border change (respects Epilepsy Safe mode — never flashes) |
| Unconscious | **no indicator tag** — the `U` in the status prompt (`SUP>`), decoded in StormFrontParser and re-emitted as a synthetic `unconscious` indicator | Shares the combat slot, ranked bleeding > unconscious > stunned > dead. Needs `set statusprompt` on, so it never appears for a player without it (B426) |
| Dead | `<indicator id="dead">` | Skull — hard to miss |

### 5.3 Vital Bar Display

- Bars always show a **numeric label** (e.g. "Health 72%") in addition to color fill — the exact value the server sent, never derived from bar width
- **Health bar uses dynamic color thresholds** — no configuration needed, this is a safety feature:
  - ≥ 50%: green (`#3a7a3a`)
  - 25–49%: yellow (`#a87a10`)
  - < 25%: red (`#8a1a1a`)
- Other vitals use their static palette color at all values
- Bar colors are user-configurable via theme; the color picker warns when a combination is hard to distinguish (see [Section 6.4](#64-colorblind-aware-color-picker))
- In large print mode, bars are taller and labels are larger

### 5.4 RT and Cast Time Bars in the Command Bar

Roundtime and cast time are displayed as **strips embedded inside the command input box**, along the top and bottom edges respectively. This keeps timing information visible at the exact point of focus — the place where your eyes already are when you type commands.

**Each strip names itself on hover (v0.19.7, B333)** — "Roundtime", "Cast time", "Aim" — because the three differ only by colour. For that the bars and chips take the pointer (they were `pointer-events: none`); `.cmd-input-wrap` forwards a press that lands on a strip to the input, so clicking the bar still starts typing. The full-width `.cmd-chips` row stays pointer-transparent and each chip shows the row's title.

Two display styles are available (Settings → Roundtime / Cast Time Timer Style — labelled "RT / CT Timer Style" before v0.19.7):

**Bar style** — a single draining strip that shrinks left-to-right as time expires:
```
┌──────────────────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← RT bar (top edge, amber)
│ >  _                                              [Send] │
│ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  ← CT bar (bottom edge, blue)
└──────────────────────────────────────────────────────────┘
```

**Chip style** — one fixed-width block per second; chips disappear from the right as time counts down:
```
┌──────────────────────────────────────────────────────────┐
│ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■                                    │  ← 10 RT chips (top edge, amber)
│ >  _                                              [Send] │
│ ■ ■ ■ ■ ■ ■                                             │  ← 6 CT chips (bottom edge, blue)
└──────────────────────────────────────────────────────────┘
```

- **RT**: amber/orange — top edge of the input box
- **CT**: blue/purple — bottom edge of the input box
- **Aim**: green — bottom edge, stacked UNDER CT (see Aim Timer below)
- Both are completely hidden when inactive — no wasted space, no layout shift
- Strips live inside `.cmd-input-wrap` (6px tall, `overflow: hidden` clips long chip rows naturally)
- Colors are theme-aware (`--rt-end`, `--ct-end`, `--aim-end` from ThemeEditor HUD tab)
- Chip gap: 6px; chip size: 8×6px; chips overflow-clip for very long RTs (30+ seconds)
- Pulse animation: `brightness(1) → brightness(0.85)` at 1.1s ease-in-out
- Respects Epilepsy Safe mode — pulse animation disabled, bar/chips still drain

**Aim Timer (DR `firingTimer`, v0.14.3).** DragonRealms' aim-timer feature (toggled in-game by `toggle aim` — Disabled / Open / Closed) pushes `<dialogData id='AimTimerDialog'><timer id='firingTimer' value='N'/></dialogData>`, where `N` is the absolute Unix-seconds END time of "You think you have your best shot possible now." (`value='0'` clears it — best shot reached, focus lost, or initial). Lichborne shows it as a **green** bar/chips countdown in the **same spot as CT** (the bottom edge), painted **behind** CT so CT always wins — aim isn't PvP-critical (Rakkor), CT is. The aim layer only "sticks out" past CT when the aim timer is longer:
- **Chips** are 1-per-second by nature, so extra green chips appear to the right of CT's blue ones when aim outlasts CT.
- The **bar** is scaled to CT's max when CT is active (else its own), so the two bar widths are comparable in absolute seconds (not each a % of its own max) — "longer aim → green sticks out" reads true in real time.
- Honors the same `timerStyle` (bar/chips) setting as RT/CT — no separate toggle (the in-game `toggle aim` is the on/off; disabled → no tag sent → nothing shows).
- **Server-clock anchored** on the next `<prompt>` exactly like RT/CT — the END time is deferred and converted to a local-clock expiry via `end − promptTime`, so it's immune to client clock skew (see the v0.14.2 clock-skew fix). Pipeline: parser `<timer>` → `aimtime` event (snapshotted for window-takeover replay) → `aimExpires` state → `useTimers` → `TimerDisplay`. Color is theme-editable (`--aim-start/--aim-end/--aim-glow`, ThemeEditor HUD tab, green default).

### 5.5 Vitals Bar Position

By default the vitals bar sits at the top of the window, spanning the full width. Players can move it to **just above the command bar** — the layout StormFront uses, which many veterans are accustomed to.

In bottom position, the vitals bar is scoped to the **main text area width only** — it does not extend under the right panel column. This gives the bottom-right panel (Experience) maximum vertical space while keeping the vitals visible at the point of focus.

```
┌──────────────────────────────────┬──────────────────────┐
│                                  │ ROOM / THOUGHTS      │
│   MAIN TEXT                      │                      │
│                                  ├──────────────────────┤
│                                  │ EXP                  │
├──────────────────────────────────┤                      │
│  Health ████  Mana ████  Conc ██ │                      │  ← bars here
├──────────────────────────────────┤                      │
│ >  _                    [Send]   │                      │
└──────────────────────────────────┴──────────────────────┘
```

This is a single setting toggle: **Vitals Bar Position — Top / Bottom**. The layout profiles (Combat, Crafting, etc.) can each have their own preference.

### 5.6 Room Panel

**REDESIGNED v0.14.7 (F52) — the panel reads like the game writes it.** The original design below rendered the room as *structured output*: labeled sections ("Objects" / "Creatures" / "Extra") + a row of full-word exit buttons. Tester feedback called it hard to understand / over-engineered, and sibling research agreed — **all three of Genie / Frostbite / Profanity render their room window as the game's own prose reassembled** (Genie prints the component text verbatim, color-coded by the roomname/roomdesc presets; Frostbite prints desc+objs+players+exits as plain text with the title in the dock title bar; Profanity keeps the native `<d>` exit links clickable). Nobody uses buttons or invented labels: a DR player expects to *read a room*.

The current design:

```
┌─ Room ───────────────────────────────────────────┐
│ [The Crossing, Town Square]                 ⚔ 2  │  ← title + creature-count chip
│ You are standing in the heart of the town        │  ← desc (roomdesc color)
│ square...                                        │
│ You also see a silver coin and a musk hog.       │  ← room objs verbatim (monsterbold kept)
│ Also here: Muse, Thrak.                          │  ← room players verbatim (contact paint)
│ Obvious paths: north, east, southwest.           │  ← clickable words, LAST (game order)
└──────────────────────────────────────────────────┘
```

- **Prose lines are the component sentences VERBATIM** — DR's own lead-ins ("You also see …", "Also here: …") are the labels. Order matches the game: title, desc, objs/creatures/players/extra, exits last.
- **The exits line is the GAME'S OWN sentence** from the `<component id='room exits'>` — shown verbatim like Genie's room window, with the compass-confirmed direction words linkified (clicking sends the **full direction word** — `down`, never the compass token `dn`, which is not a valid DR command; the old buttons had that latent bug). The parser (which used to SKIP this component) now emits it as `room-exits-text` → `RoomState.exitsText` (replay-snapshotted; cleared by the B121 room-transition clear). **Genie's normalization is adopted verbatim** (Game.cs `UpdateRoom` 978–988, verified in source per Sekmeht's "don't invent new ways" direction): DR sends the BARE label (`Obvious exits:`) for an exitless room, so the panel appends `" none."` itself and a trailing period when missing — Sekmeht's Weaving Room screenshots (game/Genie showing "Obvious exits: none." while our panel showed nothing) drove this. Compass tokens remain authoritative for map matching and linkification; a compass-composed "Obvious paths: …" line is the fallback only when the component hasn't arrived. Parser capture verified by harness (dirs / bare label / empty-clears).
- **The ⚔ N creature-count chip** on the title row appears only when creatures are present (quiet by default) — one count per monsterbold span, the same approximation as Genie's `$monstercount`; hover explains it.
- **The uniquely-Lichborne part is the PAINT, and it's unchanged** (pitfall #44): contact colors/templates + click-for-contact-card, user match/line highlights and mutes, and monsterbold apply to the prose exactly as in the main scroll.
- **Theme vars:** `--room-title-color`, `--room-desc-color`, `--room-content-color` (prose lines), `--exit-text`/`--exit-text-hover` (exit links). The old section-label + exit-button chrome vars are inert (Theme Editor controls removed in lockstep — B188 class; old custom themes carrying them load fine).
- **Deferred pending tester reaction:** dead-creature dimming; a "compact room" hunter option (title/creatures/players/exits, no desc — the `compactExp` render-switch pattern).

### 5.7 Icon Bar (HUD Strip)

The icon bar is a single fixed-height row. Layout left to right:

```
[L: longsword] | [R: shield] | SPELL  Fire Ball  |     [Standing] [        ] [Webbed] [        ] [Hidden] [Bleeding]
```

**Left side — item and spell state (left-anchored)**

| Slot | Behavior |
|---|---|
| **Left hand** | Label `L`, item name. Dim when empty, warm tan when holding. Truncates with ellipsis. |
| **Right hand** | Label `R`, same as left. |
| **Spell** | Always visible. Shows `None` when nothing is prepared (dim); shows the spell name when prepared (purple glow). |

**Hand state has TWO sources (v0.13.2, B165) — and one upstream guard (v0.13.3, B169).** On Lich sessions, Lichborne sends `_flag Display Inventory Boxes 1` once after login: Lich's default `inventory_boxes_off` hook strips container XML with a greedy regex that could swallow hand tags on container-GET lines (the true cause of B165's "random" desyncs); the flag — consumed by Lich, never reaching DR — disarms it, exactly as Wrayth does (pitfall #80). Primary source: the `<right>`/`<left>` XML tags. Fallback: GLANCE output text — DR does not push hand XML for every action that puts an item in a hand (custom-verb event items are the known gap; Profanity carries the same fallback), so the parser's `inferHandsFromGlance` derives both hands from `You are holding X in your right hand and Y in your left.` / single-hand forms (the other hand is inferred Empty — glance reports complete state) / `You glance down at your empty hands.` Typing `glance` therefore always re-syncs the hand slots. Tags stay authoritative: inference is skipped on any line that carried a hand tag, never runs on stream-routed lines, and the patterns are line-anchored so quoted speech can't match. See CLAUDE.md pitfall #78.

**Narrow-width behavior (B178, v0.13.4).** The icon bar is a CSS size container (container, not media, queries — in Windowed Panels it lives in a floating window, so its own width is what matters). Degradation follows information priority — hands/spell (real game state) > active status chips > empty placeholder slots: the hands/spell slots carry a `min-width` floor so they can never be flexed to zero (long item names ellipsize); the six status chips use a flex-BASIS with equal factors (equal widths at any container width, so state toggles still never shift the layout where there's room) instead of a rigid `width`; and at ≤ 46em the EMPTY slots collapse entirely, handing their space to the hands (accepted trade-off: at narrow widths a state toggling on/off shifts the row — content beats slot stability there). The Mode button keeps its compact intrinsic size (`nowrap`, no shrink).

**Right side — 6 status bars (right-anchored)**

All 6 bars are the same fixed width at all times (see Narrow-width behavior above for the cramped-strip exception). Empty bars show a faint border outline — the slot is always present. Text illuminates with the indicator's color when the condition is active.

| Bar | Active text | Color |
|---|---|---|
| 1 — Stance | Standing / Kneeling / Sitting / Prone | Green / gold / blue / orange |
| 2 — Invisible | Invisible | Purple |
| 3 — Webbed | Webbed | Blue |
| 4 — Grouped | Grouped | Gold |
| 5 — Hidden | Hidden | Green |
| 6 — Combat | Bleeding → Stunned → Dead (priority order) | Red / orange / magenta |

Bar 1 (Stance) is always active. Bars 2–6 are empty when the condition is not present.

**Floating Compass**

The compass is a **chrome-less overlay** (v0.7.1) anchored to the **bottom-right corner of the game text area**, floating above the scrolling text. It shows the standard 3×3 directional grid (NW/N/NE/W/·/E/SW/S/SE) above a horizontal row of special exits (UP / DOWN / OUT). There is no panel background, border, or padding — the cells float directly over the game text. **Active exits illuminate via themed text color + `text-shadow` glow** (`--compass-active-text` + `--compass-active-glow`); inactive cells render at `opacity: 0.45` (visible enough to see the compass shape at rest, faint enough that lit cells obviously dominate). Arrow glyphs (↖ ↑ ↗ …) carry `-webkit-text-stroke: 0.6px currentColor` because Unicode arrows barely respond to font-weight; text-stroke thickens them reliably regardless of font. The compass is non-interactive (`pointer-events: none`) and consumes no layout space. Themed CSS surface: `--compass-active-text`, `--compass-active-glow`, `--compass-inactive-text`, `--compass-center-text`. (Earlier v0.7.x iterations had a themed panel-bg/border + chip-style active cells; those were removed when the chrome-less design landed — the corresponding vars were stripped from the Theme Editor as dead config.)

**RT / CT**

RT and CT are embedded in the command bar — see [Section 5.4](#54-rt-and-cast-time-bars-in-the-command-bar).

**Accessibility:**
- Status conditions are never conveyed by color alone — the text label is always present (transparent when inactive, colored when active).
- All 6 bars maintain consistent size regardless of state — no layout shifts.
- Epilepsy Safe Mode disables the pulse animation on RT/CT strips.

### 5.8 Experience Panel

The exp panel is a live skill tracker driven entirely by `<component id='exp SkillName'>` XML events. No text parsing. No scripting required.

```
┌─ Experience ─────────────────────────────┐
│ Evasion        ████████░░  dabbling      │
│ Targeted Magic ██████████  mind lock  ⚠  │
│ Skinning       ███░░░░░░░  clear         │
│ Perception     █████░░░░░  mind lock  ⚠  │
└──────────────────────────────────────────┘
```

- Only shows skills trained in the current session (no noise from untrained skills)
- `⚠` badge on mind-locked skills — player is getting no XP and should switch activities
- Bar fill represents mindstate progress from clear → mind lock
- Updates live as the server pushes new exp components
- **Rank gain**: when the server wraps the exp component in `<b>`, the skill row goes bold for 3 seconds (`exp-row--rank-up`); timer resets if another rank fires before it clears
- **Footer badges**: `TDP`, `Fav`, `RXP` shown when present; `Resting`/`Deep Sleep` when sleep state active; red italic `Death's Sting` when the second `exp rexp` component is present in the batch
- **Badging auto-selects the character's guild (B184, v0.14.0).** The parser captures the `info`
  command's output line — the exact source Lich derives `DRStats.guild` from (drparser.rb
  `NameRaceGuild`, mirrored verbatim including the GREEDY quantifiers; a lazy version captures
  "Moon" instead of "Moon Mage") — and emits a `character-guild` event (cheap `startsWith('Name:')`
  gate, main-stream only, NOT behind the §35.6 Experience toggle). GameWindow trusts it only when
  the session character appears as a whole word in the sheet's FULL TITLED Name field ("Soul Reaver
  Cordio Hawt-Seord, Divine Hammer of Elanthia" — titles before the name, surname/honorific after;
  a first-token compare rejects your own sheet). **Precedence (Sekmeht's model): an own-sheet
  detection is AUTHORITATIVE** — it selects the badge even over a stored pick, because Profile
  Transfer's viewPrefs category carries the `focus` key and a transferred value is
  indistinguishable from an explicit choice (the "explicit wins forever" first cut left a cleric
  stuck on a transferred Moon Mage badging). A manual pick holds until the next own-sheet `info`;
  an unmatched guild string changes nothing (`guildToFocusOption` → null). Detection persists in
  the per-character `detectedGuild` scopedKey (deliberately NOT transferable — guild is character
  identity) and seeds secondarily from the launcher profile's manually-set guild field (read-only,
  pitfall #26).

**Compact mode (opt-in, `settings.compactExp`, default off — Rakkor/Morress, v0.14.3).** A text-forward alternate render of the SAME exp data — no progress bars, pins-as-buttons-only chrome, mindstate words, group headers, or Badging/Focus/Sort pickers. Inspired by how Frostbite shows its Experience window:
```
┌─ Experience ─────────────────────────────┐
│ EXP   Learning 4   TDP 65057   Fav 40     │  ← summary top bar
│ ◈ Evasion         656   71%   9/34        │  ← Skill · Ranks · % · (mindstate/34)
│ ◈ Targeted Magic  412   88%  31/34        │     rows tinted by mindstate bucket
│ ◈ Large Edged    1005   46%  18/34        │
│ ↻ 2:20  RXP 5:51  Usable 32m              │  ← summary bottom bar (reset/RXP/usable)
└──────────────────────────────────────────┘
```
- Rows are colored by the **mindstate bucket** (same `--exp-bar-{low,mid,high,locked}` palette the full panel's bars use: green→gold→orange→red), so compact and full read consistently.
- **Pin-to-top** is preserved as a hover-reveal `◈` button per row (shares the full panel's `pinnedSkills`/`onTogglePin` — pins float to the top and are the same set in both modes). The Badging ★ was deliberately **dropped** in compact (every actively-trained skill is badged under a guild Focus, so it lit every row — noise).
- It's a pure render switch inside `ExpPanel` (reuses every parsing helper); no new data path. Threaded `settings.compactExp → sharedFrameProps → PanelFrame → ExpPanel` (the B193 prop pattern), so it works in all three hosts (docked strip / static zone tab / windowed floating window). Per-character setting; transfers with the Display & Accessibility category. Anchored to the panel font (`var(--panel-font-size, var(--game-font-size))`), so the global font and per-panel A−/A+ both scale it.

**expbrief mode:**

DragonRealms has two exp display modes:

| Mode | Format | Used by |
|---|---|---|
| Standard | Verbose text output, parsed from prose | Genie (forces this mode on login) |
| expbrief | Structured XML `<component>` tags | StormFront, Frostbite, Lichborne |

Lichborne is an XML client — expbrief is the natural mode and gives us the structured data the exp panel needs for free. On login, the client sends `expbrief` to ensure the game is in the right state, matching StormFront's behavior.

**Lich mode:** Lich may handle the expbrief toggle itself on login. In Lich mode, the client does not send the `expbrief` command — Lich owns the session setup. The exp panel still works identically either way since the data arrives as the same XML regardless of who toggled the mode.

**In-game EXPBRIEF toggle:** Within XML/expbrief mode, a player can further toggle `EXPBRIEF` in-game. This controls whether individual `<component>` updates include the mindstate name in text form. With EXPBRIEF OFF (default), updates look like: `<preset id='whisper'><d cmd='skill Evasion'> Evasion</d>: 1173 29% mind lock [34/34]</preset>` — mindstate name present. With EXPBRIEF ON, updates are abbreviated: `<d cmd='skill Evasion'> Evasion</d>: 1173 29% [34/34]` — mindstate name omitted, only `[x/34]` bracket notation remains. `parseExp` handles both: string matching for the verbose form, bracket index parsing as fallback for the brief form.

If a player switches back to a standard exp display in-game for any reason, the exp panel will stop receiving structured updates and show stale data. The panel will display a subtle indicator when no exp updates have been received for an extended period.

---

## 6. Display & Accessibility

Display and accessibility settings live in **Settings → Display & Accessibility** — the same place as themes, fonts, and layout options. These are normal settings, not a special onboarding track.

### 6.1 Large Print

- Base font size: 18px (default is 14px)
- Taller vitals bars
- Wider line spacing (1.8)
- Minimum panel sizes enforced

### 6.2 High Contrast

- Background: `#000000`
- Text: `#ffffff`
- Accent: `#ffff00`
- Borders: `#ffffff`
- No transparency or blur effects

### 6.3 Color Blind Mode

Three selectable options under Display & Accessibility — only one can be active at a time (or none):

| Mode | Condition addressed | Approach |
|---|---|---|
| **Deuteranopia** | Red-green (green-weak) | Shift reds toward orange/yellow; shift greens toward teal/blue |
| **Protanopia** | Red-green (red-weak) | Shift reds toward yellow; boost blue channel on green indicators |
| **Tritanopia** | Blue-yellow | Shift blues toward cyan; shift yellows toward orange |

**Implementation:** a CSS class on `#root` (`data-colorblind="deuteranopia"` etc.) combined with a targeted override block in `theme.css` that recolors the semantic indicators (health bar, RT/CT bar, status indicators, compass exits) using color-safe alternatives. Game text presets are not recolored — players configure those themselves via the theme editor.

**The goal is functional clarity, not perfect simulation.** The overrides ensure that the six status indicators (stunned, bleeding, webbed, hidden, invisible, joined) and the four health thresholds are distinguishable without relying on red/green hue differences.

### 6.4 Colorblind-Aware Color Picker

Rather than special colorblind modes, the client helps players make informed color choices wherever a color picker is shown (highlight rules, theme editor, vitals bar colors):

- Below the selected color, a small row of **simulated swatches** shows how the color appears under deuteranopia, protanopia, and tritanopia
- If the foreground/background combination would be hard to distinguish under any common colorblind condition, a **warning label** appears: *"This combination may be hard to read for red-green colorblind players"*
- No color is blocked — the player can ignore the warning if they choose
- This applies anywhere two colors are configured together (text + background, bar fill + label)

This gives colorblind players control over their own setup without treating everyone else as if they need special modes.

### 6.5 Epilepsy Safe Mode

A clearly labeled toggle: **"Epilepsy Safe Mode"** under Display & Accessibility.

When enabled:
- All animations disabled (roundtime pulse, stun flash, RT bar shrink, connection spinner)
- Static indicators only — no blinking or rapid color changes
- Transitions replaced with instant state changes

This toggle exists because real players have asked for it. It is easy to find, clearly named, and off by default. It is not on the first-launch screen — players who need it will look in settings, and it will be there.

### 6.6 Font

Font settings work at two levels: **global defaults** and **per-panel overrides**.

**Global defaults** (Settings → Display & Accessibility):
- Font family: any font installed on the user's system, selected via a scrollable inline picker with live filter. The current selection is shown above the list; typing in the filter box narrows it instantly. The selected font is highlighted and auto-scrolled into view when the panel opens. **Each entry in the picker list renders in its own face** (v0.7.1, F15) — the inline `style={{ fontFamily: "'<name>'" }}` overrides the picker's monospace inheritance for the label only, so the picker doubles as a visual preview. A **Monospace** filter chip narrows the list to monospace fonts only, detected at enumeration time via a canvas width test (`i` vs `W`).
- Font enumeration uses the **Local Font Access API** (`window.queryLocalFonts()`), available in Electron 21+ / Chromium 103+. The main process grants the `local-fonts` permission via `setPermissionRequestHandler` + `setPermissionCheckHandler` before the window loads. Results are deduplicated by family name and sorted alphabetically.
- Stored value is usually the raw font family name (e.g. `"Cascadia Code"`). Three truly-retired preset keys (`terminal`, `sansserif`, `serif`) still transparently migrate to their font names the first time Settings is opened. The active default key `'cascadia'` is **not** migrated (v0.7.1, B94) — it intentionally stays as a key so `applySettingsToDOM` keeps resolving it to the full fallback chain `'Cascadia Code' → 'Fira Code' → 'Consolas' → monospace`. Migrating it would collapse the fallback to `'Cascadia Code', monospace` and cause a Cascadia-less Win10 user's font to visibly flip from Consolas to generic monospace the moment Settings opened.
- `applySettingsToDOM` ([settings.ts](src/renderer/settings.ts)) resolves the stored value via `FONT_FAMILIES[fontFamily]` first (key match → full chain) and falls through to `'FontName', monospace` for an explicit font name.
- Default font: **Cascadia Code (key: `cascadia`), 12px, Compact (1.2) line height** (v0.7.1, B93). Cascadia Code ships with weights 200/300/350/400/500/600/700 — critically, real `500` and `600` faces — so the codebase's intermediate-weight emphasis (hands HUD, status bars, panel tabs, character tabs, vitals, game `<bold>`) actually renders at its intended weight instead of falling back to full bold 700 on a two-weight font like Consolas. The previous default (`'Consolas'` literal name) collapsed every `font-weight: 600` declaration to 700 and read as "everything is too bold." Players who explicitly chose Consolas (or any other font) keep their choice through profile load — only fresh installs / unset characters get the new default.
- **Player-facing weight emphasis** (v0.7.1, B93): game `<bold>` and `<roomname>` use `font-weight: 600` (real semibold on Cascadia, falls back to 700 on Consolas — no regression for opt-in Consolas users). Hand-held / spell-active items use color-only emphasis — no weight bump — so picking something up doesn't snap the HUD from 400 straight to 700. Other 600/700 chrome (status bars, vitals labels, toolbar title, panel tabs, character tabs) was inventoried but left as-is; can be dialled back further if testers find it heavy now that the font default changed.
- Font family propagates globally via `body { font-family: var(--game-font-family) }` — all panels inherit it automatically.
- Font size and line height propagate to all game content panels via CSS vars `--game-font-size` and `--game-line-height` anchored on each content container: main text window (`.text-line`), stream panels, room panel, exp panel, injuries panel, panel tab labels, the **icon bar** (hands/spell/stance + the Mode button), the **vitals bar** (regular + compact), and the built-in **Lich Scripts panel** (`.sl-panel`). Child elements use `em` units so they scale proportionally with the container font size. **The anchor is per-container, not inherited from a single wrapper** — `.panel-frame-tabs` anchors only the tab labels and `.panel-frame-body` has no font anchor, so each panel-type root must set `var(--panel-font-size, var(--game-font-size))` itself (v0.10.0 brought the icon/vitals bars + Lich Scripts panel into this; the Lich **Dashboard modal** deliberately stays fixed-size like other modals). See CLAUDE.md Principle #9 + pitfall #58, incl. the `em`-is-relative-to-own-font-size trap.

**Per-panel overrides:**
Every panel can have its own font family, size, and line height set independently. Right-click a panel header → Panel Settings → Font. Common uses:
- Larger font in the main text window for easier reading mid-combat
- Smaller, tighter font in the thoughts or exp panel to fit more content
- A different font family in the room panel if the player prefers a more stylized look there

Per-panel font settings are saved in the layout profile. Switching layouts restores each panel's font along with its position.

Themes can also specify a font override (see Section 7.6) — if a theme sets a font, it becomes the new global default when that theme is applied, but per-panel overrides still take priority over it.

### 6.7 Keyboard & Motor

- Full keyboard navigation (Tab through panels, Enter to focus command bar)
- Command history (Up/Down arrows)
- Configurable key bindings for all actions
- Optional large click targets for panel controls

### 6.8 Screen Reader Support

DragonRealms has blind players who rely on screen readers (NVDA, JAWS, VoiceOver). The game is text-based — which is a natural fit — but the client needs to surface that text correctly.

**Game text:**
- The main text panel is an ARIA live region (`aria-live="polite"`) so new lines are announced automatically as they arrive
- Critical alerts (low health warnings, incoming attacks) use `aria-live="assertive"` for immediate announcement
- The room panel and thoughts panel are also live regions with lower priority

**Navigation:**
- All panels have proper ARIA landmark roles and labels so a screen reader user can jump between them by landmark
- The command input is always reachable by Tab and has a clear accessible label
- Status bar values are exposed as text (e.g. "Health 72 percent", "Roundtime 2.1 seconds") — not just as visual bars

**Settings:**
- All settings controls are fully keyboard-navigable with visible focus indicators
- No information is conveyed by color alone anywhere in the UI

This is marked as a later-phase feature because it requires deliberate implementation and testing with real screen readers — but the architecture should not make it impossible from the start.

### 6.9 Sip-and-Puff / Switch Access

Some players use breathing straws (sip-and-puff devices) or single-switch scanning to play. DragonRealms' text command model is actually well-suited to this — the whole interface reduces to "type a command, hit Enter."

What the client must do:
- **Command bar has default focus on launch** — no hunting required
- **Tab order is logical and complete** — every interactive element is reachable without a mouse
- **No mouse-only interactions** — all panel controls (close, float, resize) have keyboard equivalents
- **Large click targets** — panel drag handles and control buttons are large enough to hit intentionally

What will help these players the most:
- **Macro system** ✅ — pre-set commands bound to a single key (F1–F12, Ctrl/Alt combos), reducing the number of keystrokes per action; see Section 18
- **Command aliases** ✅ — short inputs that expand to longer commands or multi-step sequences; see Section 18
- **Saved command sets** — load a profile of common commands for a specific activity (combat, crafting, socializing)

---

## 7. Theming

### 7.1 Architecture

Themes work in two layers:

```
Base Themes  (built-in, read-only starting points)
  ├── General:  Dark, Darker, Slate, Ivory, Mist, Parchment, Terminal, Classic
  └── Guild:    Barbarian, Bard, Cleric, Commoner, Empath, Moon Mage,
                Necromancer, Paladin, Ranger, Thief, Trader, Warrior Mage

My Themes  (player-owned copies, fully editable)
  ├── "My Moon Mage tweaks"     basedOn: Moon Mage
  ├── "Combat layout"           basedOn: Dark
  └── "Imported from Thrak"     basedOn: (external)
```

Base themes are never modified. Editing a base automatically creates a personal copy. Players can have as many custom themes as they want, each derived from any base.

All themes — including custom themes — are applied by merging over `darkBase`. This guarantees that any newly-added CSS variables (such as `--map-*` added in a later build) are always present even if the custom theme predates them, preventing map and other panels from rendering with stale or missing variable values.

### 7.2 Theme Picker Flow

1. **Settings → Theme** — a list+detail two-panel layout inside a modal
2. Three tabs at the top: **General** | **Guild** | **Custom**
3. Left column: scrollable list of theme names, each with a small colored dot (theme background color) and a ✓ badge on the currently active theme
4. Right panel: live preview mock using the selected theme's actual colors — room name, description, exit buttons, speech line; plus the theme name and action buttons below
5. Clicking a list item applies the theme immediately (live preview, no confirmation) and highlights the row
6. Action buttons in the right panel: **Customize…** for base/guild themes; **Edit / Duplicate / Export / Delete** for custom themes
7. Navigating away from Settings keeps whatever is currently applied

### 7.3 Theme Editor

Opened via **"Customize..."** on any theme card. Shows the full set of editable fields with color pickers and a live preview panel on the right showing actual game text in the current color state.

**Editable fields:**

| Field | Description |
|---|---|
| Background | Main window background |
| Text | Default game text color |
| Accent | Buttons, highlights, active states |
| Panel border | Border between panels |
| Panel header | Panel title bar background |
| Health bar | Vital bar fill color |
| Mana bar | Vital bar fill color |
| Concentration bar | Vital bar fill color |
| Fatigue bar | Vital bar fill color |
| Spirit bar | Vital bar fill color |
| Speech | Text color + optional highlight (background) color |
| Whisper | Text color + optional highlight |
| Thought | Text color + optional highlight |
| Room name | Text color + optional highlight |
| Room desc | Text color + optional highlight |
| Bold | Text color + optional highlight |
| Expiry | Text color + optional highlight |
| Store | Text color + optional highlight |

Each preset row shows two symmetric pairs: **[color swatch] [hex input]** for the text color and **[color swatch] [hex input]** for the highlight. The highlight swatch is dimmed and the hex box shows `none` when no highlight is set. Click the swatch to pick a color via the native picker, or type a hex code directly. Clearing the hex field removes the highlight.

**A row's stored value is not always a literal, and the swatch has to cope (B314, v0.19.5).** `darkBase` deliberately holds cascading EXPRESSIONS for many vars — `var(--text-dim)` so a var follows its parent (pitfall #34), and `color-mix(<fixed hue> N%, var(--text-primary))` so a fixed-meaning hue self-corrects its contrast per theme (pitfall #63). `createCustomThemeFrom` copies the **whole** of `darkBase` into a new custom theme, so those expressions arrive in the editor verbatim — and **`<input type="color">` silently falls back to `#000000` on any value that is not `#rrggbb`**. Every such row therefore rendered a BLACK swatch for a colour the app was painting teal, grey or rose. `resolveDisplayHex` resolves a non-hex value by asking the browser what it currently evaluates to (a hidden probe element + `getComputedStyle().color` → hex) — the only correct answer, since the result depends on the live theme. A literal hex skips the probe entirely and takes exactly the old path, and the **commit path is untouched**: an edit still writes a plain hex, so a theme never comes to depend on the expression form. **When exposing a new var here, check what `darkBase` actually stores for it** — an expression is normal and correct in the theme layer, but it is not a value a colour input can hold.
| Font family | Per-theme font override (optional) |
| Font size | Per-theme size override (optional) |

Every color field opens the colorblind-aware color picker — the player sees simulation swatches and contrast warnings inline as they pick.

**On first edit of a base theme:**
- A prompt appears: *"Give your theme a name"*
- A named copy is created in My Themes and becomes the active theme
- The original base is never touched

**Additional controls:**
- **Reset to base** — reverts all fields to the original base theme values
- **Duplicate** — create another copy of this theme to experiment from
- **Delete** — remove a custom theme (with confirmation)
- **Export JSON** — download the theme as a shareable `.json` file
- **Import JSON** — load a theme file shared by another player; lands in My Themes

### 7.4 General Base Themes

| Theme | Description |
|---|---|
| **Classic** *(default)* | Black canvas, WhiteSmoke text — mirrors Genie's exact out-of-box preset colors (speech, whisper, thought, roomname, vitals bars) so veteran players feel at home immediately |
| **Dark** | Dark background, warm off-white text |
| **Darker** | Pure black background, maximum contrast |
| **Ivory** | True white chrome, deep indigo accent, near-black text — maximum clarity for players who prefer a bright, document-like interface; all preset colors fully retuned for light backgrounds |
| **Mist** | Cool soft-gray chrome, steel blue accent — the comfortable daily-driver light theme; easier on the eyes than pure white during long sessions; preset colors calibrated for the tinted base |
| **Parchment** | Warm cream background, earthy brown tones — aged parchment aesthetic for players who want a fantasy-immersive light experience |
| **Slate** | Cool blue-grey tones, softer than Dark |
| **Terminal** | Green on black, monospace CRT aesthetic |

### 7.5 Guild Base Themes

Guild themes are base themes with palettes designed around each guild's identity. Any player can use any guild theme — there's no restriction. A Barbarian player might love the Moon Mage aesthetic.

| Guild | Palette Feel | Background | Text | Accent |
|---|---|---|---|---|
| **Barbarian** | Blood and ash, primal warrior | `#1a0f0a` | `#d4b896` | `#8b1a1a` |
| **Bard** | Theatrical gold, warm parchment | `#1a1020` | `#e8d5a0` | `#c08030` |
| **Cleric** | Cathedral light, holy gold | `#0d1020` | `#e8eaf0` | `#c8a840` |
| **Commoner** | Plain cloth, road dust, humble origins | `#141210` | `#c8b89a` | `#7a6a50` |
| **Empath** | Soft greens, healing light | `#0d1a12` | `#d8f0d8` | `#60b870` |
| **Moon Mage** | Night sky, starlight blue | `#07091a` | `#c8d8f8` | `#7878d8` |
| **Necromancer** | Pure black, bone and decay | `#0a0a0a` | `#c8c8b0` | `#50a050` |
| **Paladin** | Steel blue, noble silver | `#0d1220` | `#f0f0f8` | `#8898d8` |
| **Ranger** | Forest floor, bark and moss | `#0f1a0a` | `#c8d8b0` | `#6a8a40` |
| **Thief** | Deep shadow, tarnished coin | `#111118` | `#a8a8b8` | `#a87830` |
| **Trader** | Merchant brown, rich gold | `#180e05` | `#e8d090` | `#c89020` |
| **Warrior Mage** | Arcane storm, elemental fire | `#0f0f1a` | `#e0d8f8` | `#c86020` |

Commoner is the unguilded starting state for all new characters — included here because every player begins as one, and some maintain the status intentionally for roleplay. Its theme is intentionally plain: warm earth tones, nothing dramatic.

Each guild theme also ships with matching preset colors (speech, whisper, thought, etc.) tuned to complement its palette.

### 7.6 Theme JSON Format

Themes are stored in `~/.lichborne/themes/` as JSON. Base themes are bundled with the app; custom themes live in this directory.

```json
{
  "name": "My Moon Mage tweaks",
  "basedOn": "Moon Mage",
  "background": "#07091a",
  "text": "#c8d8f8",
  "accent": "#9090e8",
  "panelBorder": "#1a1a3a",
  "panelHeader": "#0f1128",
  "status": {
    "health":        "#e05050",
    "mana":          "#5080d0",
    "concentration": "#50b8b8",
    "fatigue":       "#d07830",
    "spirit":        "#9858c8"
  },
  "presets": {
    "speech":    { "color": "#d0b040", "italic": true },
    "whisper":   { "color": "#907830", "italic": true },
    "thought":   { "color": "#80c8e8" },
    "roomname":  { "color": "#ffffff", "bold": true },
    "roomdesc":  { "color": "#a8b8d8" },
    "bold":      { "color": "#ffffff", "bold": true },
    "expiry":    { "color": "#e08030" },
    "store":     { "color": "#60c060" }
  },
  "font": {
    "family": "Cascadia Code",
    "size": 14,
    "lineHeight": 1.55,
    "weight": "normal"
  }
}
```

### 7.7 Sharing Themes

Players can export any custom theme as a `.json` file and share it — on Discord, the DR forums, or directly. Another player imports it via Settings → Theme → Import, and it appears in their My Themes section immediately. The `basedOn` field is preserved but not required for imports.

---

## 8. Settings

### 8.1 Settings Search

Settings has a **search box at the top** that filters across every option in every section — no matter how deep it is. Type "font" and every font-related setting surfaces immediately. Type "RT" and roundtime bar position, RT color, and RT sound alert all appear together.

```
┌─ Settings ──────────────────────────────────────┐
│  🔍  Search settings...                          │
├──────────────────────────────────────────────────┤
│  Display & Accessibility                         │
│  Theme                                           │
│  Panels & Layout                                 │
│  Command Bar                                     │
│  Connection                                      │
│  AI                                              │
└──────────────────────────────────────────────────┘
```

When a search is active, the category list is replaced by a flat results list. Each result shows its name, a one-line description, and which section it lives in. Clicking a result navigates directly to that setting and highlights it.

This is the fix for "I know this setting exists but I can't find it." Settings should never require hunting.

### 8.2 Settings Organization

Settings are grouped into broad sections — not deep submenus. Every section is one level down from the top, never more.

The Display section includes a **live font preview** — a bordered box showing representative game-text lines (room name, speech, thought, bold) rendered with the currently selected font family, size, and line height. It updates instantly on every control change and respects the active theme's preset colors.

| Section | Contains |
|---|---|
| **Display & Accessibility** | Font family, font size, line height, live preview, large print, high contrast, auto-link URLs, epilepsy safe, colorblind picker, **wordmark effect** (§8.3) |
| **Theme** | Theme picker, theme editor, My Themes, import/export |
| **Panels & Layout** | Status bar position, icon bar position, RT bars in command bar, panel defaults |
| **Command Bar** | RT display, cast time display, command history size |
| **Highlights** | Highlight rules, groups, import/export |
| **Connection** | Default credentials, Lich paths, SGE fallback settings |
| **AI** | Master enable, per-capability BYO key (text=Claude) + Test, model tier (Haiku/Sonnet/Opus/Fable), **Response voice** (persona), per-feature consent, cost meter (§10) |

### 8.3 Wordmark effect (F114, v0.19.7)

The "Lichborne" wordmark in the top-left can wear a text effect, chosen per character in **Settings → Display → Wordmark effect**. Default **Static**, which is byte-identical to the pre-feature rendering: the `--accent` / `--accent-dim` two-tone the brand has always had.

**Why per character and not per theme.** A theme would be the intuitive home — it already owns the brand's colours — but `lichborne.theme` is a single UNSCOPED global key (themes.ts), and §9 / pitfall #56 record that an active character's theme is rewritten from that global on every save. A theme-owned effect would therefore be the same for everyone, which defeats the entire point: telling your characters apart at a glance while multi-boxing. The split that survives is **the theme decides what colour the brand is; the setting decides what it does with that colour.** The effect's own colour vars are fed `var(--accent)` / `var(--accent-dim)`, so Glow, Gradient, Shimmer and Neon stay theme-derived and pick up the high-contrast overlay (which sets `--accent: #ffff00`) for free. Rainbow, Gold, Fire and Frost carry fixed palettes by nature.

**One effect system, not two.** The vocabulary is `HighlightEffect` — the same twelve values highlights and contact templates use — so the `hl-fx-*` CSS in highlights.css is written once and the wordmark inherits its epilepsy-safe freeze automatically (motion stops, colour stays: UX #9b). [brandMark.tsx](src/renderer/utils/brandMark.tsx) is the single painter, called by BOTH the app bar and the Settings preview so the two cannot drift (the B281 lesson). Two effects render the word as one run rather than the two coloured halves: colour-replacing ones, which paint the glyphs themselves, and per-letter ones — which keep their colours but carry the `--i` stagger across the split via `effectContent`'s `startIndex`, because restarting at zero on the second span breaks the wave mid-word (B427, pitfall #147).

**Reaching app-level chrome.** The app bar cannot read per-session state (pitfall #57), so the value rides `SessionStatus.brandEffect`, pushed by a dedicated GameWindow effect and read for the ACTIVE session — the same "reflect via `useSessions`" route the connection dot and the panel flags use. It is a scalar, so it works with the equality gate, and it was added to that gate (pitfall #130). Persistence needs no new plumbing: it is a field on `settings`, so it rides `scopedKey(character,'settings')` → `state:` → YAML, and transfers inside the existing Display & Accessibility category.

**No slash command, by design** (Principle #11, asked and recorded rather than skipped). It is a one-time cosmetic pick set from a dropdown, matching the `timerStyle` / `lineHeight` / `textWeight` precedent — none of which has a command either. `/theme` exists because switching themes is a frequent in-play act; choosing a wordmark treatment is not. Revisit if testers ask to flip it mid-session.

---

## 9. Character Profiles

> **Status: Planned — requires dedicated design session before implementation.**

Each DragonRealms character is a distinct identity with different playstyles, guilds, and needs. Character profiles let the client automatically switch to a character-specific configuration on login.

### 9.1 What a Profile Contains

A profile is a named bundle of per-character settings that activates when that character logs in:

| Setting | Notes |
|---|---|
| **Theme** | Each character can have their own theme (e.g. guild theme matching their class) |
| **Panel layout** | Zone sizes, tab arrangement, which panels are open |
| **Text presets** | Highlight colors tuned for that character's content |
| **Font settings** | Size, family, line height |
| **Highlight rules** | Character-specific trigger patterns |
| **Status bar position** | Top vs. bottom preference per character |
| **Custom panel set** | Which discovered streams are pinned |

### 9.2 Key Design Questions (to resolve in planning session)

- **Profile identity** — keyed by character name, account+character, or user-defined label?
- **Persistence layer** — separate localStorage keys per profile, or a single profiles JSON blob?
- **Switching** — auto-switch on login (match by character name from SGE), or manual selection?
- **Fallback** — what loads if no profile exists for a character yet? Clone from current or use defaults?
- **Global vs. per-profile** — some settings (Lich paths, connection config) should stay global; others (theme, layout) are per-profile. Need clear boundary.
- **Profile manager UI** — standalone screen or integrated into Settings?
- **Import/export** — share a profile with another player (same character class, same playstyle)?

### 9.3 Rough Implementation Approach (to be refined)

On login, the client receives the character name from SGE. It looks up a matching profile and applies it before the game window renders — so the correct theme, layout, and settings are already in place when text starts arriving. If no profile exists, the client offers to save the current settings as a new profile for that character.

---

## 10. AI Features

**Status: v0.16.0 — Phase 0 (BYOK foundation) + Phase 1 (Catch Me Up) scheduled.** This section is the
*matured, authoritative* AI spec; it **supersedes** the original OpenAI-only sketch (which assumed a single
OpenAI key powering every AI feature). The full AI-feature backlog (AI1–AI10) lives in §32.3, and the
cross-cutting engine list in §32.4; this section defines the **provider adapter, the BYOK model, and the
first shipping slice** that every §32.3 feature builds on.

**The three guardrails from §32 apply verbatim and are load-bearing here:** (1) AI **advises / composes /
summarizes / decorates — it NEVER issues game commands** (the single rule that keeps every AI feature inside
Simutronics' scripting policy and Principle #1; state it in-UI on every feature); (2) **BYOK, opt-in,
privacy-disclosed** — nothing leaves the machine unless a specific feature is enabled and its consent gate
accepted; (3) **AI ENHANCES, never GATES** — every feature has a working non-AI baseline (§32.3's baseline
column) that ships FIRST, with the AI tier layered on top as the upsell.

### 10.1 The capability-routed `AIProvider` adapter (the correction to "one provider, one key")

The original design (and §32.4's one-line "chat + embeddings + image, Claude default") conflated three
capabilities that **no single provider serves**:

- **Claude does text brilliantly, but generates NO images and has NO embeddings endpoint** (Anthropic points
  to Voyage AI for embeddings). A single Claude key therefore *cannot* power Portrait Forge (G9/AI9) or X1's
  backdrops, and cannot ground the RAG features (AI3 Oracle / AI6 Ask Your Logs / AI10 Mentor).

So the adapter is **capability-routed, not provider-routed** (decided 2026-07-10 with Sekmeht) — a small
sharpening of §32.4, not a redesign. Three independent capabilities, each independently BYOK, each disabled
until its own key exists (guardrail #2, applied per-capability):

| Capability | Powers | Provider options | v0.16.0 status |
|---|---|---|---|
| **Text** (chat / structured output) | Catch Me Up, Chronicle, Setup Sage, Loom, War Council, Oracle answers | **Claude** (default) | **SHIPPING** |
| **Embeddings** | RAG grounding for Oracle / Ask Your Logs / Mentor | Voyage AI, OpenAI, or **local/offline** (preferred — logs never leave the machine) | declared, dark |
| **Image** | Portrait Forge, X1 backdrops, Scene Composer | OpenAI / Google / local SD (a separate ecosystem + key) | declared, dark |

`AIProvider` (main process, `src/main/ai/`) exposes `chat()`, `embed()`, and `generateImage()`. In v0.16.0
only `chat()` (Claude) is implemented; `embed()` / `generateImage()` are **declared but stubbed to throw a
clear "capability not configured" error** so the image and RAG feature tracks slot in later without a
redesign — and so a feature that reaches for a dark capability *degrades with a helpful message, never a
crash* (the graceful-degradation contract, guardrail #3).

**Model tiers (text):** **Claude Haiku 4.5** (`claude-haiku-4-5`) is the default workhorse for
high-frequency, bounded-input jobs (Catch Me Up, summaries, "what does this rule do?"). **Claude Sonnet 5**
(`claude-sonnet-5`) is the selectable quality tier for correctness-sensitive jobs (Setup Sage config
generation, Loom theme/layout gen, coaching) — its native structured-output support yields schema-valid rule
JSON against the existing rule shapes. Opus is available but not the default (a game client's AI stays cheap
enough that testers actually enable it).

### 10.2 Architecture (BYOK, main-process, capability-routed)

- **Runs in MAIN, never renderer** (mirrors `src/main/connection/`). The key lives in `safeStorage` (Windows
  DPAPI) as a sibling to `passwords.json` — **never in YAML**, and the renderer never sees it. Main-process
  execution also sidesteps CSP/CORS (a renderer `fetch` to a provider host would be blocked) and keeps the
  key off every game-text code path.
- **The Claude text path is a thin raw-`fetch` SSE client** ([claudeProvider.ts](src/main/ai/claudeProvider.ts)),
  NOT the bundled `@anthropic-ai/sdk` (decision 2026-07-10, revised from the initial spec). Rationale: the
  v0.15.0 packaging-hygiene rule minimizes runtime deps, and this codebase hand-rolls its own parsers
  (StormFrontParser, the Marshal reader) — a ~100-line SSE reader over Electron's global `fetch` fits that
  ethos better than bundling a large SDK for one streaming call, and it avoids a network-install dependency
  entirely (zero new packages). Streaming ON so summaries render progressively. If a future image/embeddings
  capability wants a heavier client, that's a per-capability call.
- **IPC** (all AI payloads carry `sessionId` per Principle #6 where session-scoped): `ai:chat` (streamed),
  `ai:set-key` / `ai:test-key` / `ai:clear-key` / `ai:get-config`. Renderer client in `src/renderer/ai/` is a
  thin wrapper over `window.api.ai*` plus consent state and a running token/cost meter.
- **Non-secret config** (master enable, model tier, per-feature consent booleans) lives in **`SharedProfile.ai`**
  (app-wide, the `sessionLog` precedent — needs the three registrations: `SharedProfile` type +
  `buildSharedProfile` + `importSharedProfile`; optional field, non-breaking, no version bump). The **secret
  key never rides YAML** — it stays in `safeStorage`. AI config is deliberately NOT in a Transfer category
  (machine-local, the `automationStats` precedent).
- **Consent + cost, done the Lichborne way:** a per-feature one-time **disclosure modal** (themed, NEVER
  `window.alert`) discloses exactly what is sent ("this sends recent game text to Anthropic"); background /
  quota notices are **toasts** (§37.6); in-flow feature results are `internal-system` lines + `[sys]` log
  entries. A running token/cost meter is surfaced in the AI Settings section.
- **Privacy stance (v0.16.0):** **disclose + send raw** — game text (including player names) is sent as-is
  after the consent gate, with the disclosure stating so plainly. **Name redaction** and **scrollback-cap
  tuning** are tracked follow-ups (§10.4), deliberately deferred so the pipe ships first.
- **Slash surface (Principle #11):** an `/ai` command family from day one — `/ai key …`, `/ai on|off`,
  `/ai status`, `/ai catchup` — registered in [slashCommands.ts](src/renderer/slashCommands.ts) with `/help`
  blurbs, so AI is a first-class control surface, not a mouse-only bolt-on.
- **AI Settings section** (the "AI" row already reserved in the §8 settings table): master enable, key entry +
  Test button, model-tier picker (Haiku default / Sonnet 5), per-feature consent list, cost tally. Theme-audit
  on a light theme (Principle #4); every consent toggle must actually gate its feature (Principle #9).

### 10.3 First shipping slice — Catch Me Up (AI4) — SHIPPED v0.16.0; LOG-BACKED v0.17.1

**⚠️ v0.17.1 reverses the "screen-only" scope of this section.** Catch Me Up now reads the per-character
**session log** for the requested window, tier-scoped. The rest of §10.3 documents the v0.16.0 screen-buffer
slice — still the FALLBACK path (used when session logging is off, or a log read fails), so keep it — but the
default source is now the log. The new architecture (why it works when the v0.16.x log attempt was reverted
for scale, §10.4):

- **Whole pipeline in MAIN** — `buildCatchupDigest` ([sessionLog.ts](src/main/sessionLog.ts)) reads →
  dedups → extracts and returns only a COMPACT digest (build-export precedent — a year is ~29M lines, so raw
  rows must never cross IPC). Walks **day by day, yielding between days** so a long window can't block main;
  pushes progress on `session-log:catchup-progress` for every phase ("Working on it — reading day 42/365 →
  deduping → extracting → summarizing"). `readWindow`'s day cap was raised 8 → 366.
- **Duration units** — `parseDuration` gained `d`/`mo`/`y` (plus `m`/`h` and `1h30m`); `mo` alternated before
  `m`. Windows run 30m → **1 year**.
- **Six TIME-SCOPED tiers** (`CATCHUP_TIERS`) — recent ≤45m → session → extended → day → period →
  historical ≤1y — each with its own prompt guidance (narrative at 30m, retrospective at 1y), `maxTokens`,
  and `maxChars` budget (45k→240k).
- **The model analyses EVERYTHING, not a sample (Sekmeht)** — the payload is the FULL deduped log body (up to
  the tier budget) + an EMPHASIS fact-sheet of exact whole-window tallies. **Dedup makes "everything"
  affordable**; if the deduped body still overflows, the most-recent fits and the tallies still cover the full
  period (header says so).
- **Extractors (emphasis), each verified against a real log line** — ranks (game `You've gained a new rank in
  …`), combat damage taken (attacker/part/severity), deaths, directed speech, work orders + pay, banking with
  Lich's VERIFIED coin ratios (`drbanking.rb`: plat=10000…copper=1) → net money flow. **Rules:** tally counts
  BEFORE dedup (identical lines are separate real events); never invent DR math (mine `drinfomon`, which ships
  spec files = verified inputs, or omit); the `DRExpMonitor: Skill(+N)` line is the mindstate LEARNING-RATE
  ticker, NOT ranks (filtered out as churn). **Combat severity uses the VERIFIED 22-level GM-Kodius ladder**
  (`light hit`→`apocalyptic strike`), which **alternates `hit`/`strike`** — the damage regex matches both
  (`(?:hit|strike)`) or every strike-level hit silently drops (a real bug shipped-then-fixed with a made-up
  `moderate`/`severe` scale); attackers are counted ONLY on damage lines (never on arrivals/misses). Speech
  dedup keys on **text alone** (not stream+text) so DR's speech double-emit (§31 pitfall #49) can't double the
  body OR the per-speaker "who spoke" count; `/ai stop` cancels mid-build (a `buildCancelled` flag), not just
  mid-stream.
- **PII / credential redaction — nothing sensitive reaches the model (Sekmeht, v0.17.1).** A shared
  `redactForAI` ([src/shared/redact.ts](src/shared/redact.ts)) is applied to the AI-bound copy at BOTH paths
  (the log digest in main, the screen fallback in the renderer): it removes the Simutronics **PIN block**
  (Character Index / Player Identification Number / `PIN#`), labelled **passwords / account numbers**, card-
  length digit runs, and the **logged-in account username** (passed in as a literal). It is **conservative by
  design** — it targets known credential SHAPES, never ordinary game numbers (coins, room ids, damage), so it
  can't damage a summary — and an UNLABELLED secret typed as raw prose is undetectable (a safety net, not a
  guarantee). Crucially, redaction runs **only on the copy handed to the AI** — the **session log on disk stays
  pristine** (Sekmeht: *"the log needs to be pristine … it's just during the AI processing part"*). The user-
  facing [AINOTICE.md](AINOTICE.md) documents exactly what is/isn't sent; the About dialog links it
  (`AI_NOTICE_URL`). **Any future AI feature that sends game text must route it through `redactForAI` first.**
- **Response voice / persona (v0.17.2).** `AIConfig.persona` (free text, blank = default; Settings → AI →
  "Response voice") flavours the VOICE of AI output — "a 90s TV news anchor", etc. `catchupSystem` takes a
  `persona` param that OVERRIDES the default warm-companion voice line when set, subordinated to the facts
  ("changes only HOW you speak, never WHAT is true — keep every statement grounded in the log"); the plain-
  prose rule still binds. Rides `SharedProfile.ai` (machine-local, non-breaking). The persona IS sent to the
  provider (user-authored, not PII) — documented in AINOTICE.md. No `/ai` command (Settings-only, like the key).
- **Model choice + Fable 5 (v0.17.2).** `AI_TEXT_MODELS` is the single source (Settings dropdown, `modelLabel`,
  `/ai` status, and the recap header); adding a model is a one-liner (main has no allowlist — the id passes
  straight to the API). Four tiers now: Haiku 4.5 (default) · Sonnet 5 · Opus 4.8 · **Fable 5 (premium)**.
- **Header transparency + empty-response retry (v0.17.2).** The recap header is concise: it leads with the
  window (`fmtWindow`): **start–end clock times** under a day (`14:05–16:05 (2h)`), **dates** for multi-day
  spans (`Jul 16–Jul 23 (7d)`; `fmtDuration` is day-aware so a year is `365d`, not `8760h`) + compact counts
  (`58.4k lines, 51k collapsed` via `fmtCount`), then only the short caveats that apply (`log from HH:MM` / `recent portion` / `use sparingly`),
  then `· via {model}` (+ `· voice: {persona}` when set) on both paths, read fresh per run — so it's never a
  black box which window/model/voice produced a summary. The streaming call retries ONCE on a clean-but-EMPTY completion (a transient dropped
  response, distinct from an `onError`), then reports token counts if still empty instead of a bare "(no summary
  returned)". Diagnosed from "24h failed but 1d worked" — identical 1440-min requests, so transient.
- **Catch Me Up never re-summarizes its OWN output (v0.17.2).** `collectHistory` skips any `ai`-preset line
  (covers a recap that rendered in the main window when no lbAI panel is open), on top of the existing
  `internal-system` + `lbAI`-stream skips; the log path is safe because AI output is never written to the log.
- **Per-character; fallback to screen if logging off / read fails, stated in the header** (AI-enhances-never-
  gates). **Not yet done:** live-game test; game-native banking patterns (currently keys on the `DRBanking:`
  script line); injury-message extractor; a full port of `drinfomon` patterns into a verified capturer
  registry.

The v0.16.0 slice (below) exercised the whole stack (key → consent → main-process call → stream → render →
log) on the cheapest input. **What shipped in v0.16.0:**

- **Invocation:** the `/ai` slash family ([slashCommands.ts](src/renderer/slashCommands.ts)) — `/ai` /
  `/ai status` (on-off / key / model), `/ai on|off` (master toggle), `/ai key` (points at Settings — a key is
  never typed into the command bar; it would land in history + the palette), and **`/ai catchup`** (the
  feature). The executors are sync matchers; the async work lives in GameWindow's `ctx.aiCatchup` (§37.5
  client-control pattern — SlashContext gained `getAIState` / `setAIEnabled` / `aiCatchup`).
- **AI tier:** `/ai catchup` checks the master enable, runs a **first-use consent gate**
  ([AIConsentModal.tsx](src/renderer/components/AIConsentModal.tsx) — themed, per-feature, stored in
  `aiConfig.consent`), gathers its input (below), then streams a Haiku summary into **one live
  `internal-system` line** (updated per delta; `\n` survives via the `.text-line` pre-wrap) under a header
  (`— Catch Me Up · while you were away (14 min · 87 lines)`). It ends the line with a **trailing `\n`** for one
  blank line of separation from the next paragraph — deliberately NOT a separate spacer row, which would pick
  up its own empty `[HH:MM]` when timestamps are on (Sekmeht, v0.16.0). The final text logs to `[sys]`; token
  usage feeds the Settings cost meter (`aiSessionUsage`). **`/ai stop`** aborts a stream mid-flight
  (`aiChatStream` returns an `abort()`; the cancel closure owns its own cleanup because `abort()` tears down
  the listeners, so `onDone` never fires).
- **Gathering — MAIN + every OPEN stream panel (INVARIANT, v0.16.0 fix).** A **watched** stream
  (thoughts/deaths/arrivals/…) routes to `streamLines` and **never reaches `lines`** — `STREAM_FALLBACK` only
  spills a stream into main when *nobody is watching it*. So gathering from `lines` alone made the summary
  blind to exactly the conversation a returning player cares about, and it got **worse the better the user's
  panel layout was** (a power user with comms panels got the weakest summary — that inversion is how the bug
  was spotted). `runCatchup` therefore collects from `lines` **plus every watched stream buffer**,
  **timestamp-merged** (`TextLine.timestamp`) and **source-tagged** (`[thoughts] Rakkor says …`) so the model
  can tell a thought from room prose. It skips our own `internal-system` chatter, its own prior output
  (`lbAI`), and `CATCHUP_SKIP_STREAMS` — the **state-readout** streams that clear+rewrite themselves (`exp`,
  `inv`, `activespells`, `percwindow`, `moonwindow`, `lichscripts`), which would feed the model a stale TABLE
  instead of events. **Any future AI feature that reads "what happened" must gather this way, not from `lines`.**
- **The window is ALWAYS a TIME RANGE `[from, now]` — two sources, no heuristics.** `from` is either **(1)** an
  explicit duration — **`/ai catchup 30m`** / `2h` (a bare number is minutes; `parseDuration` in slashCommands,
  capped at `CATCHUP_MAX_MINUTES` = 24h) — or **(2)** the **default window** (`CATCHUP_DEFAULT_MINUTES` = 30).
  The header always states which was used (`— Catch Me Up · the last 30 min · 87 lines`), so the feature is
  never a black box. Empty window → "Nothing happened" with **no API call**.
  - **Two earlier auto-window mechanisms were BOTH removed — do not reintroduce either.** (a) A *silent
    idle-detector* watched for gaps in your keypresses/clicks and made that the window, so `/ai catchup` did
    different things depending on state you couldn't see (Sekmeht: *"I don't understand what data /ai catchup
    looks at"*). (b) A **`/afk` toggle** let you mark an explicit away-span that a bare `/ai catchup` then used;
    it was removed as not-worth-it (Sekmeht, 2026-07-14: *"it's on the player to know how to catch up"*) — the
    duration argument covers the need. If you wandered off, the answer is `/ai catchup 2h`, not a heuristic and
    not a mode. (Removing `/afk` also removed the welcome-back card, which was Catch Me Up's non-AI baseline;
    guardrail #3 falls back to "the baseline is the scrollback + Session Log" — the player's own eyes — which is
    exactly the stance that motivated the removal.)
  - A proactive auto-offer on return was considered and **declined** — invocation stays manual; nothing spends
    tokens unasked.
- **Output routing — the `lbAI` stream (DECIDED default, 2026-07-14).** AI feature output is a first-class named
  stream, **`lbAI`** (LichborneAI), seeded into `discoveredStreams` so it's always addable in Panel Manager /
  `/panel open lbai`. **Default = the MAIN game window; when an `lbAI` panel is open
  output routes THERE (`setStreamLines`) instead.** Routing is decided once per run and the streaming updates
  + trailing newline follow it. **"Open" means SHOWING (B307, v0.19.3): the lbAI tab must exist in a rendered
  zone/window (`watchedStreamsRef`, gated on the zone's `*Added` flag) AND be that surface's active tab
  (`activeIdsRef`).** Through v0.19.2 the check was tab EXISTENCE alone, so a background lbAI tab silently
  captured the whole recap with only an unread dot to show for it — from the game window it read as "the
  stream is closed and nothing came out" (Sekmeht, 2026-08-28). A non-active lbAI tab now gets the recap in
  the game window like a closed one; bring the tab forward before running if you want it in the panel. `lbAI` is never emitted by the game, so it
  has **no `STREAM_FALLBACK` entry** — the open/closed fallback is handled inline in `runCatchup`. This is the
  shared output surface every future AI feature (Setup Sage cards, Chronicle, …) routes through.
  - **Making `lbAI` the DEFAULT target was considered and DECLINED (Sekmeht, 2026-07-14).** Rationale for
    keeping main-as-default: the summary should land where the player is already looking, and forcing a
    separate panel would be surprising; `lbAI` stays the opt-in "keep it out of my scroll" surface. Consequence
    (accepted): the two low-severity main-window-path edges — the live line can be trimmed out during a
    2000+-line flood mid-stream, and `updateLive` re-maps the full `lines` array per token (pitfall #82 zone) —
    are real but rare, and **opening the `lbAI` panel is the user-side fix for both** (its small dedicated
    buffer is immune to game-text trimming and cheap to map).
  - **`lbAI`'s display LABEL is `lbAI`, not the mangled `LbAI`** — it's client-seeded (no game-supplied title),
    so the generic `capitalize(id)` at the tab/add-menu label sites would turn `lbAI` → `LbAI`. A shared
    `streamLabel(id, title?)` ([aiConfig.ts](src/renderer/aiConfig.ts)) special-cases `AI_STREAM` and is used at
    every label site (makeCustomTab, the two add-menus, slashPanelTab, addToZone); a game-supplied title still
    wins, else the id is capitalized as before — behavior-preserving for every non-AI stream.
- **Error handling — mid-stream failures surface.** `claudeProvider.handleFrame` handles the Anthropic SSE
  `error` frame (e.g. `overloaded_error`/529 AFTER `message_start`) by THROWING, so it propagates out of
  `claudeChatStream` → main's try/catch → the renderer's error line. Without that branch the frame hit no case,
  was ignored, and the caller's `onDone` fired with a partial/empty summary and NO error (tokens still counted).
  Any future SSE consumer must handle the `error` frame, not just the content deltas.
- **`/ai catchup` pre-checks the key** (`aiCatchup` returns `'nokey'`) so it doesn't open the one-time consent
  modal for a request that can't fire (enabled + no key → the disclosure would show, then error). The check
  reads `aiKeyPresentRef` (fresh in-window via mount + `lichborne:ai-key-changed`); a key set in ANOTHER OS
  window can read stale here — the same accepted cross-window display-staleness papercut, and catchup would
  still work if forced.
- **SCOPE — it summarizes WHAT IS ON YOUR SCREEN, and deliberately does NOT read the session log.**
  Purpose, stated plainly (Sekmeht, 2026-07-14): *"I walked away, I came back — what did I miss in the last
  20 minutes?"* That is the whole job. The source is `collectHistory()` — the live scrollback plus every OPEN
  stream panel — filtered to the window.
  - **A build that read the session log was written, shipped to the tester, and REVERTED.** It worked, but it
    dragged in a mountain of machinery that only exists at LOG scale: a busy character logs 80k lines/day
    (49k `main` + 38k `inv` + 17k `spells`), so finding the signal needed priority tiers, a verbatim block,
    realm-ticker gating, NPC-vendor filters and template collapsing — and it *still* produced walls of vendor
    chatter. None of that is needed for the few thousand lines actually on screen, which are already bounded
    by `MAX_LINES`. **LOG ANALYSIS IS A DIFFERENT FEATURE** (§10.4) with different scale problems and a
    different UI; do NOT merge them back together. The lesson is worth more than the code: *the scale of your
    input decides your architecture* — the same feature over 3k on-screen lines and over 80k logged lines is
    two different features.
  - **Kept from that work** (they are wins at any scale): `CATCHUP_SKIP_STREAMS` (state readouts that
    clear+rewrite — `exp`/`inv`/`spells`/`activespells`/`moonwindow`/… — contribute a stale TABLE, never
    history); consecutive-identical dedup in `gatherWindow` (DR emits speech TWICE, pitfall #49, and game text
    is repetitive besides); and **naming the character in the prompt** (the first version said "the player" and
    left the model to *guess* which name in raw game text was them — one line, highest value-per-token in the
    whole prompt).
  - **Left behind as groundwork:** the `session-log:read-window(character, fromTs, toTs, maxRows)` IPC
    ([sessionLog.ts](src/main/sessionLog.ts)) — it filters a time window **in main** and is exactly what the
    future log-analysis feature needs. **Its own lesson stands regardless: NEVER bound a TIME window with a
    LINE count** (pitfall #92 — an 8000-line tail reached back only 6.2 minutes on a busy character, so an
    `/ai catchup 11m` silently summarized ~6).
- **The budget is CHARACTERS, not lines** (`CATCHUP_MAX_CHARS` 40k ≈ 10k input tokens ≈ under a cent on Haiku).
  A flat tail is fine *here* precisely because the source is the screen buffer, not a log — the noise-to-signal
  ratio is nothing like an 80k-line/day file. The header says so honestly when it cannot fit everything
  (`…4,902 lines, summarizing the most recent 734`).
- **`[sys]` never enters the prompt — INVARIANT.** That is where we log our OWN output (slash results, prior
  summaries); feeding it back makes the model summarize its own summaries.

### 10.4 Tracked follow-ups (deferred, not forgotten)

- **LOG ANALYSIS — a SEPARATE AI feature (Sekmeht, 2026-07-14).** Catch Me Up is deliberately screen-scoped
  (§10.3); reading the session log is a different feature with different scale problems, and cramming both into
  one command is what produced the over-engineered build that got reverted. What a log feature must solve that
  the screen one doesn't: **80k lines/day** on a busy character (49k `main`, 38k `inv`, 17k `spells`), so it
  needs signal-extraction (priority tiering, state-stream skipping), **NPC-vendor / realm-ticker filtering**
  (DR has *no* conversation stream — player and NPC speech both land in `main`, verified against two real logs —
  and `[arrivals]`/`[deaths]` are realm-wide tickers about strangers, not room events), **template collapsing**
  (a script hammering a vendor emits the same line 15×), and almost certainly a **map-reduce** (chunk →
  summarize → summarize-the-summaries) since a 2-hour window is already 1.5M chars. Groundwork already exists:
  the **`session-log:read-window`** IPC filters a time range in main (pitfall #92: never bound a time window
  with a line count). Likely shape: `/ai chronicle 8h` or AI6 "Ask Your Logs" (§32.3) rather than `/ai catchup`.
  **Do not fold it back into Catch Me Up.**
- **Name redaction / pseudonymization** toggle before send (v0.16.0 sends raw with disclosure).
- **Scrollback-cap tuning** for Catch Me Up (v0.16.0 uses fixed `CATCHUP_LINES`/`CATCHUP_CHARS`; make it a setting).
- **"Unread since you last looked" divider** — a divider in the main window marking where you left off, so
  no-key players get a "here's where you were" anchor. It would need a lightweight last-viewed marker (the
  `/afk`/`awayWindowRef` boundary that used to feed this was removed with `/afk`); a scroll-position or
  focus-loss timestamp is the natural source.
- **Catch Me Up button** (app-bar / More menu) for discoverability — v0.16.0 ships `/ai catchup` + `/help` only.
- **`CATCHUP_SKIP_STREAMS` is a hand-curated deny-list** — a custom Lich script stream that is a state readout
  (clear+rewrite) isn't recognized as one and would be fed to the summary as history. If that bites, promote it
  to a *detected* property (the batch handler already tracks `clearedStreams`) rather than growing the list.
- **Embeddings capability** — prefer a **local/offline** model so logs never leave the machine (only matched
  snippets go to Claude for the answer); Voyage/OpenAI as the cloud fallback. Unlocks AI3 / AI6 / AI10.
- **Image capability** — a separate provider + key (OpenAI `gpt-image-1` / Google Imagen / local SD); unlocks
  G9/AI9 Portrait Forge, X1 backdrops, X6 Scene Composer.
- **The §32.3 backlog** (AI2 RP Muse, AI3 Oracle, AI5 Chronicle, AI6 Ask Your Logs, AI7 War Council,
  AI8 Loom, AI10 Mentor) — each ships its non-AI baseline first, then the AI tier over the shared adapter.

---

## 11. Backlog

Items are roughly priority-ordered within each phase. This list evolves.

### Phase 2 — XML Parsing & Core UI

Priority order reflects data availability from the protocol and player-facing value:

- [x] StormFront XML parser (main process, typed GameEvent IPC — replaces raw string IPC)
- [x] Vital bars — Health, Mana, Concentration, Fatigue, Spirit (exact values from `<progressBar>`)
- [x] Vital bar health threshold colors — green/yellow/red at 50%/25% (Section 4.3)
- [x] Roundtime countdown — precise timer from `<roundTime>` Unix timestamp
- [x] Cast time countdown — from `<castTime>` Unix timestamp
- [x] RT/CT pulse animation when active — disabled via `data-epilepsy-safe` attribute on root (Section 4.2)
- [x] Indicators — stance, bleeding, webbed, stunned, hidden, dead (from `<indicator>` elements)
- [x] Two-row icon bar HUD — RT/CT/stance/status row + compass/hands/spell row (Section 4.8)
- [x] Prepared spell display (from `<spell>` element)
- [x] Command history — Up/Down arrow navigation, 200-command buffer; persisted per character + draft preservation + Esc-clear as of v0.15.2 (F57 — Section 38)
- [x] Room panel — structured layout with name, desc, objects, players, clickable exits (full direction names)
- [x] Experience panel — live mindstate tracker: rank / pct / mindstate name / X/34, gradient bars by mindstate level, filters clear skills, exp pulse lines suppressed from main stream
- [x] Thoughts stream panel (stream routing via `<pushStream>`)
- [x] Deaths and Arrivals stream panels
- [x] Active Spells panel — replaces on each server refresh, routed from percWindow stream
- [x] PanelFrame — tabbed container with tabs-at-bottom, `+` to add any panel, `×` to close, scrollable tab bar, full panel names
- [x] Text preset styling — speech, whisper, thought, roomname, roomdesc, bold, expiry, store (via `data-preset` CSS, themeable in Phase 4)
- [x] Smart scroll anchor — "▼ N new lines" badge, auto-scroll pauses on scroll-up, click or End to resume
- [ ] Virtualized text list — only visible lines in the DOM, batched updates (deferred — not needed at current scale)

### Phase 3 — Panel System
- [ ] Dockable panel framework (drag, snap, resize)
- [ ] Float panels as separate OS windows
- [ ] Tab panels together
- [ ] Panel Manager UI
- [ ] Layout save / load / profiles
- [ ] Panel catalog — Familiar, Spells, Inventory, Debug
- [ ] User-created panels (named, on-the-fly, from UI or Lich script)
- [ ] Highlight rules editor
- [ ] Highlight groups (named, toggleable sets of rules)
- [ ] Debug panel (raw stream)

### Phase 4 — Display, Accessibility & Theming
- [x] CSS custom properties foundation — all colors in `theme.css`, all CSS files use `var(--...)` (4A)
- [x] Readability fixes — inactive tabs, whisper preset, exp panel secondary text (4A)
- [x] Vital bar gradients moved to CSS classes — fully themeable (4A)
- [x] General base themes: Dark, Darker, Slate, Parchment, Terminal (4B)
- [x] Guild base themes: all 12 guilds including Commoner, palettes from §7.5 (4B)
- [x] Theme picker UI — General / Guild / Custom tabs, live preview swatches (4B, 4C)
- [x] Theme editor — all ~90 color fields, live preview, 5-tab layout (4C)
- [x] My Themes — save, name, duplicate, delete; always a copy, never edits base (4C)
- [x] Theme export / import (JSON) (4C)
- [x] Settings panel — flat single-level, Display and Accessibility sections (4D)
- [x] Font configuration — family, size, line height; CSS variables (4D)
- [x] Large Print mode — bumps font + line height + minimum panel sizes (4D)
- [x] High Contrast mode — black/white/yellow CSS override (4D)
- [x] Color Blind mode — Deuteranopia / Protanopia / Tritanopia options (4D)
- [x] Epilepsy Safe Mode toggle (4D)
- [x] Status bar position toggle — top vs. above command bar (4D)
- [x] Icon bar position toggle — independent of status bar position (4D+)
- [x] Settings reset to defaults button (4D+)
- [x] Persistent advanced settings on login screen (4D+)
- [x] Reset Panels moved from toolbar into Panel Manager modal (4D+)
- [~] Full keyboard navigation & configurable bindings — backlogged
- [~] Screen reader / ARIA live regions — backlogged

### Phase 5 — Quality Pass & Console Polish
- [x] Panel resize clipping — mid zone drag capped to column height so top zone is never pushed off screen
- [x] Parser overhaul — style markers, preset normalization, compass exits, color tags, silent tags, stream discovery, reset()
- [x] Bold text rendering — data-preset always set on bold elements; roomname/roomdesc confirmed in-game
- [x] Preset highlight color — background color support per preset, transparent by default, editable in theme editor Game Text tab
- [~] Theme preset coverage audit — deferred; all themes inherit preset vars from darkBase for now
- [x] Auto-copy on text selection — highlight any text in any panel and release; clipboard updated automatically; skips inputs/textareas
- [x] Stream panel preset coverage — StreamPanel uses renderSegment + panels.css global; presets apply in all stream panels
- [x] Right-click context menu — "Clear" in main text window and all stream/debug panels; portal-rendered, closes on outside click or Escape; visual separators between Highlight / Trigger / Clear groups; separators only inserted between non-empty groups so no orphan rules when right-clicking blank space
- [x] Text selection styling — ::selection uses color-mix(accent, transparent) to adapt to every theme automatically
- [x] Stream mapping expansion — `talk`→`conversations`, `combat`, `atmospherics`, `group` added; `conversations` is a built-in panel type
- [x] Stream fallback system — streams without an open panel fall back to `main`; `combat`/`atmospherics`/`group` default to main fallback
- [x] Default panel layout updated — Top-Right: Room + Conversations; Center-Right: Thoughts + Arrivals + Deaths + Active Spells; Bottom-Right: Experience

### Phase 6 — Contacts System
> Full spec: Section 15

- [x] Contact + ContactTemplate data model; localStorage persistence (`lichborne.contacts`, `lichborne.contact-templates`) (6A)
- [x] Default templates: Friends (#a0d080) and Enemies (#e05050); full CRUD for templates including bold, tag text, tag color, tag BG color (6A)
- [x] Contacts panel UI — sidebar roster + detail form (name, template dropdown, guild, circle, notes, last-seen read-only, delete with confirmation) (6A)
- [x] Templates tab — inline expand-to-edit rows with all color fields; colorPickerValue helper prevents empty color inputs (6A)
- [x] ContactsContext — provides contacts, templates, compiled nameRegex, onContactClick to all rendering components (6B)
- [x] renderSegmentWithContacts — splits TextSegments around name matches at render time; tag injected as React span, underlying data never modified (6B)
- [x] Name highlighting applied in main text and all stream panels (6B)
- [x] Clickable contact names in all panels — .contact-name--clickable, onContactClick callback via context (6C)
- [x] ContactPopover — portal-rendered, viewport-clamped, shows tag+name, guild·circle, last seen (always visible, "never" if null), notes, Edit button (6C)
- [x] Last-seen tracking — watches roomState.players (Also Here component) only; debounced 2s localStorage write (6C)
- [x] Compass "down" → "dn" normalization in StormFrontParser (bug fix — server sends `<dir value="down"/>` but compass checks for "dn") (6C)
- [ ] Auto-detection from arrivals/tells/room desc — candidate queue + dismissible banner (6D stretch)

### Phase 7 — Highlights, Triggers & Macros
> Full spec: Section 14 (H/T), Section 18 (Macros & Aliases). All of 7A, 7B, and 7C complete.

- [x] Highlight rules engine — Text (word-by-word `\b`), Phrase (exact substring), Regex; Line and Match scope; FG + BG + bold + glow; overlap resolution (contacts beat highlights; among highlights, **specificity + per-property compositing** — the smallest/most-specific covering highlight wins each property independently, the ProfanityFE model, v0.11.3; equal-length ties → first-in-array. No user-facing precedence/ordering — see CLAUDE.md Automations for the cross-client research)
- [x] Highlight editor UI — toolbar button; sidebar list with enable toggle, color swatch, scope badge; detail form with pattern field, mode toggle, `Aa` case sensitivity, style pickers, live preview with test input; right-click "Highlight word / line" from game text and all stream panels
- [x] Trigger system — WHEN→THEN visual model; 6 action types (Command, Echo, Notify, Sound, Webhook, Variable); per-gate AND/OR connectors; cooldown + one-shot; `$var` interpolation; `triggerCtxRef` updated synchronously in event loop; right-click "Trigger for word/line" from game text and all stream panels
- [x] Aliases — prefix match + `$1 $2 $rest` argument capture; multi-command sequences with optional delay; pass-through option; case-insensitive by default (Section 18)
- [x] Key Bindings (Macros) — global key combo firing; Record button capture; multi-command sequences with delay; modal-suppressed; `$var` game-state interpolation (Section 18)
- [ ] Highlight groups — Danger, Alerts, Info, Social; named toggleable sets (Section 14.6)
- [ ] Highlight Wizard — paste text → keyword analysis → match suggestions (Section 14.0)
- [ ] Global + per-character rule scoping (Section 14.8)
- [ ] Rule import / export (JSON)
- [ ] Eval triggers — game-state condition expressions (Section 14.11)

### Phase 8 — Packaging & Distribution ✅
- [x] Portable exe (electron-builder, Windows x64)
- [x] Auto-update via GitHub Releases (electron-updater)

### Future / Unscheduled
- [ ] Multi-monitor floating panel support
- [ ] Sound alerts
- [ ] HUD widget system — individual repositionable elements (hands, spell; compass is already a floating overlay; RT/CT are already embedded in the command bar)

### Visual, Interactive & AI Experiences — Backlog
> **Full spec: §32.** The "graphics for text players" pipeline — 10 graphical visualizations
> (G1–G10: Combat HUD, Wound Paper-Doll, Life Orbs, Tactical Radar, World Ambiance, Buffs Board,
> Comms Console, Skill Momentum, Portrait Forge, Reactive Soundscape), 6 interactive experiences
> (X1–X6: Living Tableau flagship, Spar Arena, Empath's Ward, Bardic Stage, Tavern Games, Scene
> Composer), and 10 AI-assisted features (§32.3). Suggested build order in §32.5 (start: G2 Wound
> Paper-Doll). All held to display-not-automate + BYO-key/opt-in guardrails.

### AI Features — Backlogged
All AI features require the highlight system and session capture to exist first.
> (Expanded and superseded by §32.3 — provider-agnostic, BYO-key. The items below are the original sketch.)

- [ ] Session recorder — click Record → click Stop → captures raw game text for that window
- [ ] Session summarizer — after recording, AI summarizes interactions: who talked to you, notable events, suggested highlight rules for names/keywords that appeared
- [ ] Highlight suggester — analyzes session logs + current highlight config, proposes new regex rules with colorblind-aware preview; player accepts/rejects individually
- [ ] Lore assistant — ask questions about DR lore, mechanics, skills
- [ ] Session summary — end-of-session AI recap: XP gained, ranks, notable events
- [ ] Config explainer — "what does this highlight rule do?"
- [ ] API key management UI — store OpenAI key locally, never transmitted elsewhere

---

## 12. Layout Designer

> **⚠ SUPERSEDED (2026-06-09) by §33 Free Layout — Floating Windows.** Sekmeht chose a freeform
> *floating-window* model over this grid model (drag/snap/unlimited windows, full chrome decouple).
> This section is kept for historical context only; build against §33, not this grid spec.
>
> Status (historical): Backlog — not scheduled. Full design spec for when this becomes a phase.

### 12.1 Concept

The current layout is hardcoded: main text area on the left, right column with three stacked zones. The Layout Designer replaces this with a **freeform grid system** where players define their own column/row structure and assign any content type to any cell.

The goal is to support setups ranging from full-immersive (game text only) to power-user (multiple panel columns, stacked streams) without requiring any layout to be "the right one."

### 12.2 The Grid Model

A layout is defined as an **N-column × M-row grid**. Each cell is addressed by position (col, row) and can span multiple cells in either direction. Every cell is assigned exactly one **content type**.

**Content types:**

| Type | Description |
|---|---|
| Game Window | The main story text area. Owns Icon Bar, Vitals Bar, and Input Bar internally. Always exactly one per layout. |
| Room | Room panel — game-prose view (title + ⚔ count, desc, component sentences verbatim, clickable exits line; v0.14.7) |
| Experience | Exp tracker with mindstate bars |
| Stream | Any named stream (Thoughts, Arrivals, Deaths, Conversations, etc.) |
| Empty | Unused cell — renders blank |

### 12.3 The Game Window Cell

Icon Bar, Vitals Bar, and Input Bar are **not independent grid cells**. They are fixed-height strips that live *inside* the Game Window cell, stacked vertically:

```
┌─ Game Window cell ───────────────────┐
│ Icon Bar          [fixed height]     │
├──────────────────────────────────────┤
│                                      │
│  Game Text        [fills remaining]  │
│                                      │
├──────────────────────────────────────┤
│ Vitals Bar        [fixed height]     │
├──────────────────────────────────────┤
│ _ Input Bar ________________________>│
└──────────────────────────────────────┘
```

This keeps strip sizing predictable regardless of row height. The Game Window cell can be any size — the strips hug their content height and the game text fills whatever remains.

### 12.4 Example Layouts

**Focused — game text dominant, one panel column:**
```
┌─────────────────────────────────────────┬──────────────┐
│ Icon Bar                                │              │
├─────────────────────────────────────────┤    Room      │
│                                         │              │
│              Game Text                  ├──────────────┤
│                                         │              │
├─────────────────────────────────────────┤   Thoughts   │
│ Vitals Bar                              │              │
├─────────────────────────────────────────┤              │
│ _ Input Bar __________________________ >│              │
└─────────────────────────────────────────┴──────────────┘
```

**Full immersive — no panels:**
```
┌──────────────────────────────────────────────────────────┐
│ Icon Bar                                                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                       Game Text                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Vitals Bar                                               │
├──────────────────────────────────────────────────────────┤
│ _ Input Bar ____________________________________________>│
└──────────────────────────────────────────────────────────┘
```

**Power user — game text + two panel columns:**
```
┌──────────────────────────┬─────────────────┬────────────┐
│ Icon Bar                 │                 │            │
├──────────────────────────┤    Thoughts     │    Room    │
│                          │                 │            │
│       Game Text          ├─────────────────┤            │
│                          │                 ├────────────┤
│                          │     Deaths      │    Exp     │
├──────────────────────────┤                 │            │
│ Vitals Bar               ├─────────────────┴────────────┤
├──────────────────────────┤     Arrivals                 │
│ _ Input Bar ____________>│                              │
└──────────────────────────┴──────────────────────────────┘
```

### 12.5 Designer Mode

Accessed via a "Edit Layout" button in the toolbar. While active:

- A **grid overlay** appears showing column/row lines with cell numbers
- Players set the **grid dimensions** (columns × rows) via a picker
- **Click-drag across cells** to merge them into a single panel area
- Each merged area shows a **content type dropdown** to assign it
- **Drag splitters** between columns and rows to set proportional sizing
- A **snap-to-grid** guide snaps resize handles to clean proportions
- Exit designer mode to lock the layout and return to normal use

Layout is stored as JSON (compatible with the layout profiles in Section 2.4).

### 12.6 Floating Panels

Floating panels exist **outside the grid** entirely. They are detached windows that can be:

- **In-app overlays** — free-floating within the app window, always on top of the grid layout
- **OS windows** — detached into a separate system window (useful for multi-monitor setups)

Any panel type can be floated. "Create floating panel" spawns a new panel immediately without entering designer mode. Floating panels remember their size and position across sessions.

### 12.7 Implementation Notes

- The grid layout replaces the current hardcoded flex column layout in `GameWindow.tsx`
- Layout JSON stores: column count, row count, cell span assignments, content type per area, column/row size proportions
- Splitter resize updates proportions only — minimum column width and row height enforced to prevent panels from disappearing
- The current Panel Manager modal becomes a lighter companion to the designer (tab management within cells) rather than the primary layout tool
- Floating panel state stored separately from the grid layout JSON

---

## 13. Multi-Character Support

> Status: ✅ Implemented in v0.6.0 (Release E1 — "Sessions"); **decoupled character windows added in v0.11.0 (§13.9).** One running app instance manages all characters as tabs; any character can also be moved into its own OS window while staying in the same process.

### 13.1 Concept

DragonRealms requires a separate account login per character. Players commonly run two or more characters simultaneously (boxing — e.g. a main character + a healer or gem-seller). The client should make this feel native rather than requiring multiple app windows.

### 13.2 The Session Model

Each character is a **GameSession** — a fully independent unit containing its own connection, game state, panel layout, command history, and theme. Sessions run in parallel; background sessions remain connected and continue receiving game events.

**Main process side** — `SessionStore` (`Map<SessionId, Session>`) in `main.ts`. Each `Session` owns its own `ConnectionManager`, `StormFrontParser`, `LichBridge`, event queue, and lifecycle flags. `SessionId` is minted via `crypto.randomUUID()` on each successful `login` IPC and returned to the renderer; the renderer threads it through every per-session IPC call (`send-command`, `disconnect`, `debug-panel-toggle`, `lich:poll-scripts`, etc). Every push channel (`game-event`, `connection-status`, `raw-xml`, `error`, `lich:scripts-update`) carries the originating `sessionId` so the renderer can route to the correct tab.

**Renderer side** — `SessionsProvider` (`src/renderer/SessionsContext.tsx`) holds the `SessionRecord[]` and `activeId`. Each tab is identified by a stable `CharacterId` (`{account}::{character}`, normalized lowercase) that survives across reconnects within the tab. Every `GameWindow` instance stays mounted; only the active one is visible (`display: block`), inactive ones render with `display: none` so vitals, virtuoso scroll position, panel layout, and game text all persist while switching tabs.

### 13.3 Character Tab Bar

Character tabs live in the **main toolbar row** — inline with the existing Debug / Panels / Theme / Settings / Disconnect buttons. No second row. Same height throughout.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚔ Sekmeht 82% ●  │ ✦ Agan 18% 🩸 ↺ │ +    Debug  Panels  Theme  ⏻  │
└──────────────────────────────────────────────────────────────────────┘
```

Tabs anchor to the left. Toolbar buttons anchor to the right. The `+` button sits between the last tab and the toolbar buttons. When tabs exceed available width they scroll horizontally.

> **Realized in v0.10.0 (top-chrome redesign, Phase 2c).** This single-row design — which the implementation had drifted away from (a separate character-tab row *plus* a per-session toolbar row) — is now the app-level [AppBar.tsx](src/renderer/components/AppBar.tsx): **brand + connection dot · character tabs · action buttons · Disconnect/Reconnect**, the layout sketched above. The per-session `game-toolbar` was removed (reclaiming a full row of game text). Because the bar is app-level, its buttons act on the **active** session through the `menu-action` / `lichborne:session-action` dispatch bridge, and the **Mode switcher moved to the Icon Bar** (it needs the per-session GroupsContext). The less-used buttons (Debug/Logs/Contacts/Theme) are tucked under a static **"More ⋯"** dropdown so the bar survives narrow windows without width-measurement; every button whose panel is open glows `--active`, driven by the active session's open-panel snapshot surfaced through `SessionStatus` (a `panel*` flag per toggle button). See CLAUDE.md "Top chrome: app-bar, native menu & the menu-action bridge" + pitfall #57.
>
> **Narrow-window degradation ladder (B178, v0.13.4).** The window `minWidth` dropped 900 → **480** (users tile multiple windows — 4 columns on a 1920 monitor, Morress), so the bar degrades via em-based **container-query** tiers on `.app-bar` (em in a container query resolves against the bar's `--game-font-size` anchor, so the collapse points track the user's font setting — px media queries fired too late at large fonts): at ≤ 71em the wordmark hides (the status dot + window title still identify the app) and buttons compact; at ≤ 58em the five inline action buttons (Panels/Maps/Automations/Lich/Settings) fold into the ⋯ More menu — the inline buttons AND their menu twins are always rendered, with CSS deciding visibility (`app-bar-collapsible` / `app-bar-more-item--overflow`), preserving the no-width-measurement stance. **Disconnect/Reconnect never collapses** (destructive/critical actions don't hide in menus). The tab strip's overflow scrollbar is themed via a slim `::-webkit-scrollbar` rule — its old `scrollbar-width: thin` is now implemented by Chromium and per spec DISABLES webkit scrollbar styling (the standard-property alternative is `scrollbar-width` + `scrollbar-color` together, the pattern the map/panel-frame scrollbars already use). **B179 (v0.13.5) follow-up:** `container-type` applies layout containment, which made the bar its own STACKING CONTEXT and buried the More ⋯ dropdown under the game area — the bar now carries `position: relative; z-index: 70` (game content + WindowLayer sit at z ≤ 60, overlays/modals start at 100) to lift its whole context. Don't portal the menu instead: the `--overflow` items are gated by the bar's own `@container` query, and a portaled menu is no longer a descendant. Audit popovers any time an element becomes a query container.

**Tab anatomy (left to right):**

```
[Guild Icon]  [Name]  [Health%]  [Status Glyphs]
```

- **Guild icon** — guild-specific symbol, colored in the guild's accent color
- **Name** — character name
- **Health %** — numeric only, color follows vitals thresholds (green ≥80%, yellow 50–80%, orange 30–50%, red <30%)
- **Status glyphs** — only shown when relevant; hidden when idle

**Active tab indicator:** bold text + bottom border underline + background highlight pill — all themed.

### 13.4 Status Glyphs

> Revised in v0.6.2 — single icon slot per tab, priority-resolved, no reconnect glyph.

Each tab has **one icon slot** in a fixed-width (1.5em centered) position after the health %. The top-priority active condition resolves the slot:

| Priority | Glyph | Meaning |
|---|---|---|
| 1 | `💀` | Dead |
| 2 | `💫` | Stunned |
| 3 | `🩸` | Bleeding |
| 4 | `⏳` | Roundtime active |
| — | *empty* | Idle (slot reserved via `visibility: hidden`) |

Lower-priority conditions are still active in-game, just not surfaced on the tab (e.g. a stunned + bleeding character shows `💫`; bleeding is still happening and shows in other UI surfaces like the HUD, just not on this tab).

**Health % is always visible** (no skull-replaces-health behavior — `💀` lives in the icon slot; health % naturally goes red at low values which already communicates the death state).

**Disconnect is conveyed purely by tab styling** (dim + italic) — no separate disconnect glyph. The last-known icon stays visible so a player can see what state a character was in when they dropped. Reconnect happens from the app bar's **Reconnect** button for the active tab (F108, v0.19.7 — it replaced a Login button that closed the tab), or from the tab or card right-click menu; all three reconnect in place, keeping the scrollback.

### 13.5 Tab State Matrix

| State | Appearance |
|---|---|
| Connected, idle | `Sekmeht  DR  100%        ×` — slot reserved but invisible |
| Connected, RT active | `Sekmeht  DR  100%  ⏳    ×` |
| Connected, bleeding | `Sekmeht  DR   85%  🩸    ×` |
| Connected, stunned | `Sekmeht  DR  100%  💫    ×` |
| Connected, bleeding + RT | `Sekmeht  DR   85%  🩸    ×` *(bleeding wins priority)* |
| Connected, stunned + bleeding + RT | `Sekmeht  DR   35%  💫    ×` *(stunned wins priority)* |
| Connected, **dead** | `Sekmeht  DR    0%  💀    ×` *(health % stays visible — red at low %)* |
| Disconnected, last-known healthy | `Sekmeht  DR  100%        ×` *(dim + italic)* |
| Disconnected, last-known bleeding | `Sekmeht  DR   51%  🩸    ×` *(dim + italic)* |
| Disconnected, last-known dead | `Sekmeht  DR    0%  💀    ×` *(dim + italic)* |

**Width stability:** the icon slot has fixed `1.5em` centered width and the health % has fixed `4ch` right-aligned width with `tabular-nums`. Toggling the icon (or transitioning between e.g. `100%` → `9%`) never shifts the tab — only the character name varies width across tabs.

**Brightness tiers (v0.7.0, B89):** three intentional levels. The **active** tab — full-bright text (`--text`), bold, with a `--bg-base` background + border. An **inactive but connected** tab — near-full text (`--text-secondary`), normal weight, no background. A **disconnected** tab — `opacity: 0.55` + italic. The middle tier originally used `--text-dim`, which made a healthy connected character drift toward looking stale; only a genuinely disconnected tab should read as faded. The active tab is distinguished by its background/border/weight, not by dimming its neighbours.

### 13.6 Launcher & Character Selection (v0.8.0)

The launcher ([Launcher.tsx](src/renderer/components/Launcher.tsx)) is the primary login surface. It renders in two contexts: **full-page** (`session.length === 0`, returns when the user logs everyone out) and **modal-compact** (clicked + while logged in, opens the same launcher inside `.add-character-modal`). The two are the same component with a `compact` prop. In the modal, the launcher sits inside `.add-character-panel`, which wears the house modal chrome (UX standard #10, the About Lichborne look; F113, v0.19.7): a `--modal-scrim` backdrop, the `--modal-bg`/`--modal-border`/`--modal-radius`/`--modal-shadow` surface, an accent header band titled "Connect a character" with the ✕, then the launcher as the scrolling body — it no longer draws its own panel, height cap or "Pick a character to connect" heading. The ✕ lives in the header rather than inside the Launcher because the launcher is the scroll container (B321: it once sat against the full-window backdrop, in the window's corner, where nobody saw it). **As of v0.19.7 the compact launcher offers the same ways in as the full one (F110):** the Teams section, pinned teams in Favorites, and `LauncherTopBar` in its `compact` mode — ⟲ Reconnect Last · ⚡ Team Login · ⇋ Attach. Account Remove, Transfer and Lich Setup stay full-screen only: the first is destructive over a live session, the others are setup tools rather than ways in. A team launch from here closes the + window (`runBulkConnect`). Every cne-* dialog those controls open is portaled to `document.body`, so `.cne-backdrop` sits at z-index 1600, above the + modal (B322). "+ Add account" is a full-width, account-row-height dashed row in both launchers (F111). The launcher seeds its character list from the last one this window loaded (`lastLoadedCards`, module scope), so the + modal — which mounts a fresh Launcher on every open — shows the list at once and refreshes it in the background; its loading and empty states also wear the compact chrome (B323).

**Section structure (top-down):**

1. **Top bar** — `⚡ Team Login` (conditional on ≥2 accounts with connectable characters), `+ Add account` (accent-colored, persistent — always reachable regardless of scroll), `⚙ Lich Setup`.
2. **Welcome card** — when there are zero character profiles on disk. Single `+ Add account` CTA.
3. **Favorites discoverability hint** — a single dismissable line above the account sections, shown only when the user has tiles but no Favorites and hasn't already dismissed (`lichborne.launcher.favTipDismissed` localStorage flag).
4. **Favorites section** — always at the top, always expanded. Mirrors any tile with `profile.favorite === true`. Account-mixed, so tiles here keep the account name in their meta line (the `showAccount` prop is true here, false in the account-section context). Hidden overrides favorite — a hidden + favorited character only appears here when Show Hidden is on.
5. **Per-account sections** — grouped by account, sorted alphabetically. Within each account, sub-sectioned by game (DR/DRX/DRF — DRT tiles render under DR since DRT is a per-character override). Empty sections don't render.
6. **`+ Add account` bottom tile** + **Show N hidden profiles** toggle at the bottom of the grid.

**Tile structure (3 rows):**

```
┌──────────────────────────────────────┐
│ Sekmeht                       ♥ ⋯   │  ← header: name (flex 1) + heart + kebab
│ DR · Empath 50 ✎                    │  ← meta: game · guild + circle · ✎ notes indicator
│ [LICH][DIRECT] [TEST]   [Connect →] │  ← footer: paired pills + test pill (DR only) + Connect
└──────────────────────────────────────┘
```

The footer is `display: flex; flex-wrap: wrap` so Connect drops to its own line if the tile gets too narrow. Inside an account section the meta drops the account name (already in the section header).

**Account sections are collapsible** (default collapsed) with state persisted in `lichborne.launcher.expandedAccounts` (JSON array of expanded account names). Two override rules: **(1)** if there's exactly one account, that account is always expanded and the collapse toggle is hidden; **(2)** the wizard auto-expands the just-added account on completion (writes to localStorage before `onCompleted` bumps `refreshKey`, and Launcher re-reads the key on `refreshKey` change). The 1→2 transition also re-expands the prior account so the user doesn't see it suddenly collapse.

**Per-tile UI affordances (each persists immediately to YAML via a small read-modify-write helper in Launcher.tsx — never via the GameWindow's debounced save path):**

- **♡/♥ heart** — toggles `profile.favorite`. ♥ uses `--color-danger` red.
- **⋯ kebab menu** — opens a `ContextMenu` (right-click on the tile also opens the same menu). Items: `Edit Profile…` (opens `CharacterNotesEditor`), `Hide Profile`/`Unhide Profile`, `Delete Profile…`.
- **Paired LICH/DIRECT pills** — active pill colored, inactive grey + clickable to switch. Active pill is `disabled` (no-op click).
- **TEST pill** (DR only) — grey when off (character is `game: 'DR'`), accent-colored when on (`game: 'DRT'`). Hidden on DRX/DRF tiles.
- **Connect →** — fires `handleCardConnect` in App.tsx with a 1.5s grace window before the actual login IPC.

**Character profiles** ([profile-types.ts](src/renderer/profile-types.ts) `CharacterProfile`) store all the per-character launcher-owned fields alongside the GameWindow-owned ones:
- GameWindow-owned: `theme`, `state` (a map of all `lichborne.{character}.*` localStorage keys)
- Launcher-owned: `game`, `useLich`, `hidden?`, `favorite?`, `guild?`, `circle?`, `notes?`

The split matters because both ends save the profile (the GameWindow on its debounced timer, the launcher on every helper write). `exportCharacterProfile` ([profile.ts](src/renderer/profile.ts)) does a read-merge-write so launcher-owned fields aren't stripped when the GameWindow saves (B97 fix — see CLAUDE.md pitfall).

### 13.6.1 Add Account Flow

The single entry point for adding characters. Renamed from "Add Character" in v0.8.0 — the flow is now account-driven, creating tiles for every character on an account in one shot rather than one wizard run per character.

[AddCharacterWizard.tsx](src/renderer/components/AddCharacterWizard.tsx) — 2 steps:

1. **Account / Password / Game.** Same-account conflict check: if any of the active sessions are on this account, a confirmation modal offers to disconnect + continue (the launcher's tile-click path has the same modal — see §13.6.2). DRT is *not* a game option here — it's a per-tile toggle after creation (mirrors the launcher's TEST pill). A "Connect to Prime Test (DRT) instead" sub-checkbox appears when DR is picked, which writes `game: 'DRT'` to the stub.
2. **Discovery.** Lichborne runs the existing `eaccessFetchCharacters` IPC (no Lich needed — SimuCo's auth service is mode-agnostic). The character roster comes back as a checkbox list with "Select all new" plus per-character checkboxes. Already-existing profiles are listed with a disabled checkbox and `[already added]` badge so the user knows what's there. Confirm → bulk-write one stub `CharacterProfile` per checked character, then call `onCompleted(addedCount)`. App.tsx bumps `launcherRefreshKey`; Launcher re-fetches the profile list and the new tiles appear.

A `prefillAccount` prop lets a launcher "↺ Refresh from account" button open the wizard with that account pre-filled — discovery is the same operation, just adds anything new for that account.

### 13.6.2 Same-Account Conflict & Auto-Disconnect

DR allows only one character per account active at a time. Three places enforce this:

- **Launcher tile click** ([App.tsx](src/renderer/App.tsx) `handleCardConnect`) — when clicking a tile for an account that already has an active session, raise a confirmation modal: Cancel or "Disconnect {conflict} and continue". On Continue: `disconnectAwait` IPC (waits for the gracefulDisconnect to complete — see §13.6.3), then `runConnect(incoming)` with a single 2-second retry to ride out DR's server-side account-slot release lag.
- **Wizard step 1** ([AddCharacterWizard.tsx](src/renderer/components/AddCharacterWizard.tsx) `nextFromStep1`) — same conflict check before EAccess auth.
- **Bulk Connect picker** ([BulkConnectPicker.tsx](src/renderer/components/BulkConnectPicker.tsx)) — accounts already in active sessions are listed but disabled with a "({char} already connected — skip)" hint; can't be selected for the bulk sequence.

The conflicting session's tab is **not** removed when auto-disconnected — it stays in the bar in disconnected state (same as if the user had clicked the in-tab Disconnect button), so the user can close it via × or re-login later.

### 13.6.3 Disconnect IPC Channels

Two IPC channels for disconnect, differing only in wait semantics:

| Channel | Wait shape | Caller |
|---|---|---|
| `disconnect` (fire-and-forget) | `gracefulDisconnect` with 5s ack-wait, fire-and-forget | In-tab Disconnect button |
| `disconnect-await` (returns Promise) | Same `gracefulDisconnect` but awaitable | Conflict-modal auto-disconnect path (needs the slot release confirmed) |

App shutdown (`mainWindow.on('close')`) uses a third variant: `gracefulDisconnect({ quickClose: true })` — sends QUIT, calls `socket.end()` so the OS sends FIN after the send buffer drains (bytes guaranteed to leave), then force-closes. No server-ack wait. Shutdown drops from up-to-5s/session to ~300ms total. A "Closing — disconnecting N characters…" overlay (or "Closing — backing up profiles…" when no sessions are active) paints during the brief work via the new `shutdown-starting` IPC.

### 13.6.4 Team Login (was "Bulk Connect")

**Teams on the logon screen (v0.18.4).** The `Sets...` dropdown was removed: it
named a noun, explained nothing, and hid its contents behind a click
(polish standard #8). Saved teams now have a collapsible **Teams** section, and
the members ARE the explanation — seeing `farm - Agan, Sekmeht` answers "what
is a team?" with no help text.

- **Order is Favorites, Teams, Accounts.** Favorites is the QUICK-SELECT block
  (Sekmeht: *"think of favorites as their quick select to things"*), so it holds
  pinned teams AND favourited characters, teams first because a team is the
  bigger action. Pinning promotes; the Teams block still lists everything.
- **Rows state what Connect will do.** Members already logged in are struck
  through, since `planReconnect` skips them; archived members (F79 archives
  rather than deletes) are faint italic; the button counts only who it will
  actually log in, and disables when that is nobody.
- **`BulkSet` gained `favorite` and `notes`**, both optional, so no profile
  version change. Notes are the team-level twin of a character profile's notes
  and render on the row. An **Edit Team** dialog owns name + notes; changing WHO
  is on a team stays in Team Login, and the dialog says so.
- **Saving is an opt-in checkbox, not a zone.** Unticked, the modal shows no
  team vocabulary at all and is honestly a multi-character login; ticked, the
  name field appears, **Save team** stores without connecting, and **Connect**
  does both — one decision at the checkbox rather than two buttons for one
  intent. The load dropdown went with the restructure, because the section is
  where you pick a team and the row's kebab preloads the modal for editing.
- **One hoisted `TeamRow`** serves both sections; two copies would be compatible
  only until someone restyled one (the `.tp-` lesson).
- Hidden in the COMPACT launcher (inside Add Character) — including the pinned
  copies, zeroed at source so the Favorites count cannot disagree with the block.

**Stopping a run (F98, v0.18.4).** The progress overlay carries a **Stop**
button, reversing the earlier "no cancel mid-sequence" decision. The word is
chosen: it promises less than the single-character Cancel, because
`window.api.login` cannot be aborted. Stop means *attempt no more characters* —
the one in flight completes and is KEPT, since tearing it down would discard a
wait of up to 30s and leave its account slot churning. Remaining characters are
reported as **skipped** (muted, not failure-red — nothing went wrong) and the
summary title states that the run was stopped, so a short team reads as the
user's choice rather than an error. The stop flag is a ref: the loop body holds
a stale closure over any state value for the whole run.

**Storage discipline learned here (pitfall #121):** `coerce` rebuilds every
entry and `saveBulkSets` runs it on the way OUT, so a field it does not copy is
destroyed on the next save rather than ignored on load; and `upsertBulkSet` must
MERGE, because Team Login supplies only name + roster and a wholesale overwrite
wipes notes and pins. Both are locked by the rules harness.

**RENAMED v0.18.3 (Sekmeht).** "Bulk" described the mechanism; "team" describes
the point, and it matches what a saved set actually is. **Display only** — the
filename, the `bulk-connect` menu action, `bulkConnectSeparateWindows` and
`bulkSets` are unchanged, because they are contracts rather than labels.

**F85 (v0.18.3, Binu) — exclusions and named sets.**

- **Per-account include checkboxes.** Every saved account used to be logged in,
  with no way to leave one out. Exclusion is tracked SEPARATELY from the pick,
  so unticking and re-ticking an account restores the character you had chosen
  rather than resetting it to the default.
- **Named sets** — a saved team, `SharedProfile.bulkSets` (app-wide: a set spans
  accounts by definition, so it cannot live in a character profile). A set
  stores CHARACTER NAMES, at most one per account — both DR's rule and the only
  shape this picker can express. Loading one REPLACES the whole selection: an
  account the set does not mention is ticked off, because a team should give you
  exactly that team.
- **A set is a template, not a connect list.** At connect time whoever is
  already logged in is simply dropped and the rest connect. That distinction is
  load-bearing in the other direction too: **saving** a set must use a separate
  roster function, because the connect list excludes already-connected accounts
  and reusing it saved sets that silently omitted anyone on at the time — you
  would only discover it the next day when the team came back one short.
- **Two entry points.** The picker (build/load/delete) and the launcher's
  **▦ Sets…** dropdown, which only renders once a set exists. The launcher path
  routes through `handleReconnectLast`, so it inherits `planReconnect`'s
  already-on skips, one-per-account dedup, and the per-account keep/switch
  chooser when a DIFFERENT character holds an account.
- **Unknown names are dropped, not errors.** F79 archives characters rather than
  deleting them, so a set naming an archived character should launch the rest of
  the team now and work in full again if that character is restored.
- **No slash command** (Principle #11 asked and answered): Team Login is a
  launcher action and there is no command bar before you connect.

**Modal layout (reworked v0.18.3 after a UX review).** Three labelled zones, in
the order the user acts:

```
Team Login                                   ×
  one short line: pick one per account…
  SET      [ Load a saved set… ▾ ] [Delete]   <- load rewrites everything below
  ── ACCOUNTS ───────────── 3 of 5 selected   <- live count
  [x] account   [ character ▾ ]
  ── SAVE AS A SET ─────────────────────────
  what a set IS, taught here at the point of use
  [ Save these 3 as a set… ]                  <- reserved height
  ☐ Open each character in its own window     <- inside the body
                          [Cancel] [Connect 3]
```

Load is above the list because it REWRITES the list; save is below because it
SUMMARISES it. The "what is a set" explanation lives on the save row rather than
in a preamble — it is needed once, and a header paragraph is re-read every time
the modal opens. The connect option sits inside `.cne-body` (it previously sat
between body and footer with a hardcoded inset that was 2px out of line). See
polish standard #11 for the generalised rules.



[BulkConnectPicker.tsx](src/renderer/components/BulkConnectPicker.tsx) + `runBulkConnect` in App.tsx. Surfaces only when ≥2 accounts have at least one connectable (non-hidden) character. Picker lists each account with a dropdown of its non-hidden characters; defaults to a favorited character if any, else first alphabetical. Already-connected accounts are disabled. Confirm → sequential connect (one character at a time — DR's account-slot rule forbids parallel within the same account; sequential is also simpler for error isolation across different accounts). Progress overlay during the run; per-character errors don't abort; final summary modal lists what succeeded and what failed.

### 13.6.5 Per-Shard Tabs (CharacterId)

`makeCharacterId(account, character, game)` in [SessionsContext.tsx](src/renderer/SessionsContext.tsx). `Sekmeht-DR` and `Sekmeht-DRT` get separate tabs because their characterIds differ. You still can't have both connected simultaneously (the account-slot rule), but you can have one connected and one in disconnected state for easy switching. The character profile YAML is keyed by character name only (one `Sekmeht.yaml` shared across shards — same automations / theme / layout regardless of shard).

### 13.7 Keyboard Navigation

| Shortcut | Action |
|---|---|
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | Jump to character by slot |
| `Ctrl+Tab` | Cycle through connected characters |
| `Ctrl+Shift+Enter` | Quick-send overlay (see §13.8) |

Tab-switch chords (`Ctrl+1..9`, `Ctrl+Tab`) **also refocus the new tab's command bar** after the switch (v0.7.1). The app-level handler waits one animation frame after `setActive(...)` (React commit needs to land first so the new tab's `.session-shell` isn't `display:none` anymore) and focuses `.session-shell:not(.session-shell--hidden) .command-input`. Without this you'd have to click the new bar before typing. `Ctrl+Shift+Enter` is excluded — focus should land in QuickSend, which auto-focuses its own input.

**Esc closes the topmost dialog — exactly one (v0.19.7, B341).** Every dialog registers through `useEscapeClose` ([hooks/useEscapeClose.ts](src/renderer/hooks/useEscapeClose.ts)): a stack in mount order, served by ONE `window` keydown listener in the bubble phase that closes the most recently opened live dialog and stops the key. Bubble-at-window is deliberate: it is the last stop a keydown makes, so anything nearer the target — a search box clearing its text, the slash palette, a context menu or dropdown inside the dialog, the Quit confirmation's capture-phase handler — handles Esc first, and the stack skips the key when one of them marked it `defaultPrevented`. Esc does what the dialog's ✕ does. A dialog rendered inline (not portaled) passes a ref so a copy sitting in a hidden character tab is skipped. Before this, each dialog bound its own document listener: several had no Esc at all, and two didn't stop propagation, so one press could close two dialogs. Rules for new code: CLAUDE.md pitfall #141.

**Every control is reachable by keyboard (v0.19.7, B335).** Clickable rows, tabs and cards that aren't real `<button>`s spread `pressable()` ([utils/pressable.ts](src/renderer/utils/pressable.ts)) for a role, a tab stop and Enter/Space activation; the global `:focus-visible` ring in global.css draws the focus indicator. Settings' on/off switches are real `role="switch"` buttons, so clicking their label text works too. Rules for new code: CLAUDE.md pitfall #142.

### 13.8 Quick-Send Overlay

A floating input that sends a command to any character without switching tabs. Useful for boxing — tell your Empath to heal without leaving your main character's screen.

```
┌──────────────────────────────────┐
│  Send to: [Agan ▼]               │
│  > heal Sekmeht                  │
│  ↵ Send     Esc Cancel           │
└──────────────────────────────────┘
```

Triggered by `Ctrl+Shift+Enter`. Dropdown lists all connected characters. Sends the command and closes without switching sessions.

**Prefill from active command bar (v0.7.1).** App.tsx snapshots `.command-input`'s value at the moment the chord fires and passes it through as `initialCommand`. QuickSend uses it as initial state and `select()`s the input on open so the player can either replace it by typing or send as-is with Enter. The source bar is intentionally not cleared on send — less destructive (Esc-cancel preserves what was being composed). The state is `{ initialCommand: string } | null` rather than a boolean so the value rides through cleanly to the modal.

**Broadcast target (v0.7.1).** A "Send to all connected" option appears at the bottom of the target dropdown when ≥2 characters are connected. Implemented as an `ALL_TARGET` sentinel value living in `target` state alongside real `CharacterId`s — keeps the single-`<select>` model intact rather than adding a separate broadcast checkbox. The send handler branches on the sentinel and iterates `sessions.filter(s => s.status.connected)`, calling `window.api.sendCommand` per session. Sends to *every* connected character including the active one (literal "all"); disconnected sessions are skipped silently. Placed last in the dropdown so single-target stays visually primary — fat-fingering a broadcast from the default target shouldn't be a one-click mistake.

### 13.9 Decoupled Character Windows (Multi-Window)

> Status: ✅ Implemented in v0.11.0. A tabbed character can be moved into its own OS window while everything still runs in ONE process. (The original "drag a tab off the bar" interaction was not built; the entry points are explicit menu/context actions — drag-out is a possible future nicety.)

**Why one process.** Running the exe twice would lose every cross-character feature (Quick Send can only reach sockets in the same main process), make the two instances race a single `userData` (profiles, `_shared.yaml`, `passwords.json`, localStorage) with no coordination, and collide on Lich's force-mode launch port (each process has its own `serializeLichLaunch`). So decoupled windows are served by the single main process; separate exe instances remain *possible* (deliberately ungated) for users who want fully isolated character sets, but they don't cross-coordinate.

**Roster model (main is authoritative).** Each `Session` (main) carries `meta` + `ownerWindowId`. `broadcastRoster()` pushes a `RosterEntry[]` to every window on any change (`session-roster`). The renderer mirrors it (`RosterContext` → `useRoster()`); a window renders GameWindows only for sessions it owns, but knows about all of them (so cross-window Quick Send can target any character). `SessionsContext` still owns this window's tabs + rich `SessionStatus`; an AppShell decouple-sync effect keeps it aligned via pull-on-mount (`get-owned-sessions`) + `session-acquire`/`session-release` pushes.

**Move = ownership only.** `session:move-window(sessionId, 'new' | 'main' | windowId)` reassigns `ownerWindowId`; per-session events re-route via `ownerWindow(s)`. The socket/parser/LichBridge are never touched (the source GameWindow merely unmounts; see CLAUDE.md pitfall #59). Entry points: right-click tab, Window menu → "Move Character to New Window", Bulk Connect "Open each character in its own window" (persisted in `_shared.yaml`, default off). The only-character-in-a-window case is guarded (greyed) at three levels.

**Seamless takeover (replay).** A window taking over a session reseeds from a render-only replay: main keeps a per-session **snapshot of the latest sticky state** (every vital/indicator/RT/CT/stance/spell/hand/room/exp — so static bars restore regardless of age) plus a bounded scrollback buffer. The replay is gated so it rebuilds display + state WITHOUT re-firing triggers / re-logging, only goes to a window whose remount *earned* it (`replayTarget` — set on `session:move-window` for decouple/re-home, and since v0.13.3 on `session:reload` for the Profile-Transfer import remount, the B165 root fix: without it, an import to an active character reset hands/vitals/scrollback and a long-parked held item never self-healed because DR only re-sends hand tags on change), and live delivery is held during the handoff (`holdingForReplay`) so the stream can't double. See CLAUDE.md pitfall #60.

**Lifecycle.** Closing a decoupled window gracefully **logs out** its character (like closing a tab); re-home is explicit via Window → "Move Character to Main Window" (auto-closes the emptied window). Closing the primary window quits the app (flushing every window's profile saves first).

**Close confirmation (F99, v0.18.6).** A close that would log **2 or more** characters out asks first, naming them. Reported by Sekmeht: closing the primary with several characters up is one reflexive click away from losing position, roundtime and whatever was in progress across all of them.
- **Counts CONNECTED sessions, not tabs** — a disconnected tab costs nothing to close and must not inflate the number (that was the reporting case). App scope spans **all windows**, because closing the primary kills decoupled windows' characters too; window scope counts only that window's own.
- **Threshold is 2 on purpose.** Prompting at one character would prompt on essentially every quit, and a dialog people learn to click through protects nothing.
- Lives in `win.on('close')`, so the X, Cmd+Q, File → Quit and taskbar close all inherit it — guarding only the X would be the version that drifts.
- **The guard flag is set INSIDE the confirm callback, never before it.** `appClosing` (and `closingWindows` for secondaries) short-circuits re-entrant closes; setting it before a confirm the user then cancels would make every later close return early and **the app could never be quit again**. This is pitfall #114's rule extended: a handler that defers a lifecycle event owns completing it, *including* deciding not to.
- **Update installs bypass it** (`quitAlreadyConfirmed`). `autoUpdater.quitAndInstall()` routes through `app.quit()` → the close handler, so without the bypass clicking "Install update" would raise a quit dialog the user already answered — and cancelling it would silently abandon the install with the update left staged.
- **Rendering: themed modal with a native fallback.** The dialog is the canonical About chrome (UX #10) via `--modal-*` tokens, at z 10000 so nothing else can paint over a dialog main is blocked on (context menus top out at 2100; the full tier map is in CLAUDE.md pitfall #118(d)). Because main **waits on a renderer answer**, a dead renderer would otherwise make the app unquittable — so main requires an **ack** within `QUIT_CONFIRM_ACK_MS` and falls back to a native `dialog.showMessageBox` if it doesn't arrive. The timeout times the ACK, not the decision, so a slow human never stacks two dialogs. The ack is sent from the effect that *receives* the request, not from the modal — it is a liveness signal, not a paint signal. See pitfall #128 for the rest of the failure modes (reload-after-ack, same-document navigation, destroyed-window fallback).
- The dialog is **async**, not `showMessageBoxSync`: main owns every session socket, so a blocking dialog would stall game processing for every character while it sat open.
- Cancel is focused on mount, Esc cancels, and backdrop-click resolves to Cancel — every accidental input lands on the safe side.

**Tab right-click menu (v0.11.6).** The character-tab context menu is the per-character action surface. It lists only the **actionable** options (no greyed rows): **Reconnect** (disconnected tab) XOR **Disconnect** (connected tab), **Open in New Window** (when the window holds >1 character), **Move to Main Window** (only in a decoupled/secondary window — `useRoster().isPrimary === false`). Close is intentionally omitted (the tab's × covers it). **Disconnect** calls `window.api.disconnect(sessionId)` directly rather than the `lichborne:session-action` bridge, because the bridge only reaches the *active* GameWindow and the menu must act on the right-clicked (possibly background) tab. **Reconnect** (App `handleReconnectTab`) destroys the dead session then re-runs the connect flow; because a GameWindow is keyed by `characterId` (not `sessionId`), it reconnects **in place** — the window stays mounted (scrollback preserved) and just receives the new `sessionId`. That makes resetting the GameWindow's `dropped`/`disconnecting` flags on the `sessionId` *prop change* (not on the racy `onConnectionStatus` 'Connected' event) load-bearing for the tab to refresh to "connected" — see CLAUDE.md pitfall #69. A per-tab spinning ⟳ ("Reconnecting…", `prefers-reduced-motion`-aware) is driven by an App-owned `reconnectingIds` set, since the launcher's connecting overlay isn't on screen for a tab reconnect.

**Reconnect from the app bar (F108, v0.19.7).** When the ACTIVE character is disconnected, the app bar's right-hand button reads **Reconnect** and calls the same `handleReconnectTab` as the tab menu, so it too reconnects in place and keeps the scrollback. It replaced a **Login** button that destroyed the session, removed the tab and opened the picker — the obvious control threw away the scrollback while the good path sat in a right-click menu. While a reconnect is in flight it reads "Reconnecting…" and is disabled (driven by the same `reconnectingIds` set as the tab spinner). Logging in a *different* character is the + tab. **No slash command, by decision:** reconnect is already reachable three ways (app bar, tab menu, Overview card menu), all of them one click from a dropped character. A `/reconnect` would be a cheap follow-up if keyboard-only users ask for it.

**Windows remember their size, position and maximized state (F109, v0.19.7).** Every window used to open at a fixed 1400×900.
- **Storage:** `{userData}/window-state.json`, `{ version: 1, windows: { <key>: { x, y, width, height, maximized } } }`. Machine-local on purpose, never a profile or `_shared.yaml`: it describes this machine's monitors, and a profile moved to another machine must not carry coordinates for screens it doesn't have (the genie-cache / ai-keys stance). Deliberately NOT a Transfer category. Written with mode 0600 (B366d).
- **Fullscreen (B362):** capture is skipped while `isFullScreen()` and runs again on `leave-full-screen`, so the saved rect is always the last WINDOWED one — macOS reports a screen-sized rect mid-transition.
- **Linux position creep (B360):** some X11 window managers report a window's position offset by its decorations, so a window restored at (x, y) reports (x+dx, y+dy) and the next save drifts it. Linux only: after a restored window is shown (`CREEP_SETTLE_MS` 300ms after the show event, `CREEP_FALLBACK_MS` 2000ms if none is seen), `trackWindowState` compares requested with reported position; a non-zero difference within `CREEP_MAX_PX` (64) on both axes is stored as an offset and subtracted from every later save. A larger difference is a clamp or Wayland's 0,0 and is ignored. A no-op when there is no creep; unverified on real X11.
- **Keys:** `main` for the primary window; `char:<characterId>` for a decoupled window, named after the character whose move opened it, so decoupling that character again reopens its window where it was. A window with no key (no session meta) is simply not tracked.
- **Validation** ([windowBounds.ts](src/shared/windowBounds.ts), pure, rules harness §M): a saved position is honoured only when ≥100px of the window's top 32px strip lands on an attached display's work area (8px tolerance above it); otherwise the window opens centred with its size kept. A size bigger than its display is clamped, with the minimum upward nudge that clamp needs. A window straddling two monitors is **left alone** — pulling it onto one screen would move windows people placed on purpose.
- **Capture, then flush.** `windowState.ts` captures `getNormalBounds()` + `isMaximized()` into memory on every move / resize / (un)maximize and on `close`, debounces the file write (500ms, write-then-rename), and flushes on `will-quit`. Capturing at event time is load-bearing: shutdown and the re-home auto-close `destroy()` windows, which emits no `close` event. `getNormalBounds()` rather than `getBounds()` so a maximized, minimized or fullscreen window saves its restore rect (a minimized window's `getBounds()` is -32000 on Windows).
- A missing, unreadable or unknown-version file reads as empty and is overwritten by the next save — a disposable geometry cache, not user content.

### 13.10 Per-Character Memory

Each character profile independently remembers:
- Panel layout (positions, sizes, active tabs)
- Guild theme (auto-applied on switch)
- Command history
- Highlight and trigger rules (Phase 7)

### 13.11 Window Title Bar (Implemented)

> Status: Implemented 2026-05-06.

Each Electron window title identifies the character, game, and connection state so players can distinguish multiple instances from the taskbar or OS window switcher — matching Genie Remix's title convention.

**Title format:** `CharName · GAME [Status] | Lichborne vX.Y.Z`
**Examples:**
- Login screen: `DR [Not connected] | Lichborne v0.1.7`
- Connected: `Sekmeht · DR [Connected] | Lichborne v0.1.7`
- Disconnected: `Sekmeht · DR [Disconnected] | Lichborne v0.1.7`

**Lifecycle:**
- Login screen mount: `DR [Not connected] | Lichborne v${__APP_VERSION__}` — set via `useEffect` in `LoginScreen`
- After `player-info` event: `CharName · GAME [Connected] | Lichborne v${__APP_VERSION__}` — `GameWindow` stores char/game in `playerTitleRef` and calls `document.title`
- On disconnect: `CharName · GAME [Disconnected] | Lichborne v${__APP_VERSION__}` — set in `onConnectionStatus` when `message === 'Disconnected'`; character name persists from `playerTitleRef`
- On return to login: `LoginScreen` mounts and its `useEffect` resets the title

**Source tag:** `<app char="CharName" game="GAMECODE" .../>` — arrives once per session during the initial settings/handshake block, before gameplay begins.

**Version:** Always reflects the running build via `__APP_VERSION__` (injected by Vite from `package.json`).

---

## 14. Highlights & Triggers

> Status: Phase 7A (highlights) and 7B (triggers) complete. Groups, Wizard, eval triggers, and import/export remain. Macros & Aliases are complete — see Section 18. This section is the full design spec for what's remaining.

> **Rule-evaluation performance at imported-ruleset scale (B172, v0.13.4).** Real rulesets are large and regex-heavy (Sekmeht: 1,544 highlights, 905 regex-mode — imports skew regex: Genie triggers import as regex, Frostbite alternations become regex). Four structures keep per-line cost sane, documented fully in CLAUDE.md pitfall #82: **(1)** every evaluation site gates on `fastLower` (a cheap `includes()`) before running the regex — regex-mode rules get a CONSERVATIVE extracted literal from [regexLiteral.ts](src/renderer/regexLiteral.ts) (`literalGate` is the single mode→gate decider; a literal is returned only when GUARANTEED present in any match — 629/906 of the real ruleset gated, validated with zero gate-vs-regex disagreements); **(2)** the line-wide match scan runs ONCE per line (`computeLineMatchRanges`) and segments intersect the shared ranges (DR fragments lines into 3-5 segments — the per-segment re-scan was a 3-5× multiplier); **(3)** the panel tree is memoized with stable props + memoized context values, so a batch re-renders only what it touched; **(4)** main coalesces event floods (16ms leading-edge throttle in `scheduleFlush`) so the renderer runs one pipeline pass per frame instead of one per socket chunk.

### 14.0 Highlight Wizard

> Status: Phase 7 — part of the Highlights build.

The standard rule editor is for power users. The wizard is for everyone else.

#### Flow

**Entry points:**
- Click **+ New rule ▾** → "Create from text…" option in the picker
- Right-click any line in the game stream → "Highlight this" *(Phase 2)*

**Step 1 — Paste**

```
┌─ New Highlight ──────────────────────────────────────────┐
│  Paste a line from the game you want to highlight:       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ You are bleeding profusely from a wound on your... │  │
│  └────────────────────────────────────────────────────┘  │
│                                          [Analyze ▶]     │
└──────────────────────────────────────────────────────────┘
```

**Step 2 — Pick what to match** (auto-generated from the text)

```
┌─ What should trigger this highlight? ───────────────────────┐
│                                                              │
│  ● Whole line when it contains "bleeding"                    │
│    ████ You are bleeding profusely from a wound...           │
│                                                              │
│  ○ Just the word "bleeding" wherever it appears              │
│    You are [bleeding] profusely from a wound...              │
│                                                              │
│  ○ Any line starting with "You are bleeding"                 │
│    ████ You are bleeding profusely...                        │
│                                                              │
│                                   [Back]  [Next ▶]          │
└──────────────────────────────────────────────────────────────┘
```

**Step 3 — Pick style** (group recommendation shown first)

```
┌─ Choose a style ────────────────────────────────────────────┐
│  Suggested:  [● Danger]                                      │
│                                                              │
│  Or choose:  [● Alerts]  [● Info]  [● Social]                │
│                                                              │
│  Custom color: □ [■]                                         │
│                                                              │
│                                   [Back]  [Create ▶]        │
└──────────────────────────────────────────────────────────────┘
```

Rule is created and immediately visible in the list.

#### Analyzer Logic

Given the pasted line, the analyzer:

1. Strips leading/trailing whitespace
2. Extracts **candidate keywords** — filters out stop words (you, are, is, a, an, the, from, on, your, of, to, in, with, by, for, at)
3. Scores remaining words by length and rarity — longer, less common words score higher
4. Takes the top candidate as the **key phrase**
5. Generates three options:
   - **Whole line contains** [key phrase] — scope=whole-line, matchType=text
   - **Word inline** [key phrase] — scope=inline, matchType=text
   - **Line starts with** [first 3-4 words] — scope=whole-line, matchType=begins-with

#### Group Recommendation

The analyzer checks the pasted text against known signal words:

| Signal words present | Recommended group |
|---------------------|-------------------|
| bleeding, stunned, dead, unconscious, dying | Danger |
| Roundtime, mana, rested, fades, expires | Alerts |
| tells you, whispers, [Thought], arrived | Social |
| gain, ranks, mindstate, improved, grown | Info |
| (none matched) | user chooses |

#### Implementation Notes

- Wizard is a separate modal/overlay, not embedded in the rule list
- Right-click entry point requires attaching a context menu to rendered text segments — each segment already has data; needs an `onContextMenu` handler that extracts the full line text
- Wizard creates a standard `HighlightRule` — no special data model
- "Analyze" button is optional; wizard can analyze on paste automatically (debounced 300ms)

### 14.1 Concept

Highlights and triggers share a single pattern-matching engine. The difference is only what fires when a match is found:

- **Highlight** — change how matched text *looks* (color, bold, background)
- **Trigger** — do something *in response* (send command, play sound, flash panel)

Both use the same rule editor, same match types, same grouping system. Triggers get an extra Action field. Building them together avoids duplicating infrastructure.

### 14.2 Rule Data Model

```
Rule {
  id:            uuid
  name:          string            "My name"
  pattern:       string            "Sekmeht"
  matchType:     text              plain substring match
               | begins-with       anchored to line start
               | regex             full regex syntax
  scope:         inline            color only the matched portion
               | whole-line        color the entire line
  caseSensitive: boolean
  style: {
    fg:          hex | null        foreground color
    bg:          hex | null        background color
    bold:        boolean
  }
  panels:        all | string[]    ["main", "thoughts", "arrivals", ...]
  sound:         filepath | null   played on match
  enabled:       boolean
  groupId:       uuid | null
  character:     global | characterId
}
```

Triggers extend Rule with additional fields:

```
Trigger extends Rule {
  action: {
    type:     command              send a game command
            | sound               play a sound file
            | open-panel          surface a named panel
            | flash-panel         draw attention to a panel
            | log                 route matched line to a named stream
            | eval                evaluate a game-state condition
    payload:  string              "pray" | "sounds/alert.wav" | "thoughts" | "health < 30"
  }
  destination: string             stream to route matched line to; default "main" (see §14.10a)
  cooldown:    seconds | null     minimum gap between firings; prevents spam
}
```

### 14.3 Match Types

| Type | Pattern example | Behavior |
|---|---|---|
| `text` | `Sekmeht` | Case-sensitive or insensitive substring match anywhere in the line |
| `begins-with` | `[Sekmeht]` | Matches only if line starts with the pattern — useful for room names, system messages |
| `regex` | `/You (?:feel|sense) .+ faint/i` | Full regex; `/i` suffix for case-insensitive; compiled on load |

Invalid regex patterns are flagged in the editor and skipped at runtime — they never crash the client.

### 14.4 Styling Options

| Field | Options |
|---|---|
| Foreground color | Any hex color, or null (inherit from theme) |
| Background color | Any hex color, or null (transparent) |
| Bold | Boolean |
| Sound | Path to a `.wav` file; null for none |

### 14.5 Overlap Resolution

When two inline rules match overlapping portions of the same text, the **shortest match wins** (most specific). This avoids manual priority management — a tight pattern like `Sekmeht` always wins over a broad pattern like `.+` covering the same characters.

For whole-line rules, the **first matching rule in drag order wins**.

### 14.6 Groups

Rules belong to named groups. Groups can be toggled on/off as a unit — useful for switching between hunting, crafting, and social contexts without editing individual rules.

```
Group {
  id:      uuid
  name:    string     "Combat"
  enabled: boolean
  color:   hex        swatch color shown in the editor sidebar
}
```

Groups and rules within a group are **drag-to-reorder** — order determines priority for whole-line conflicts. The drag handle makes priority visible and intentional.

### 14.7 Panel Scope

Each rule targets either all panels or a specific subset. The panel selector appears in the rule editor as:

```
Panels:  ● All   ○ Choose...
                   ☑ Main   ☑ Thoughts   ☐ Room   ☑ Arrivals ...
```

Applies to every stream panel including auto-discovered Lich streams.

### 14.8 Global vs. Per-Character Rules

Rules are scoped to either **global** (shared across all characters) or a **specific character**. Both sets apply simultaneously — global rules run first, character rules run second and can override.

Typical usage:
- **Global**: your name, friend names, death messages, common danger phrases
- **Per-character**: Barbarian combat patterns, Empath healing responses, guild-specific spell names

The rule editor has a `For` field: `● Global  ○ Sekmeht  ○ Agan`.

### 14.9 Editor UI

Accessed via a **Highlights** button in the main toolbar (same row as Panels, Theme, Settings). Opens as a modal.

```
┌─────────────────────────────────────────────────────────────┐
│ Highlights & Triggers                              [× Close] │
├────────────────┬────────────────────────────────────────────┤
│ GROUPS         │ [Highlights] [Triggers]      [+ New Rule]  │
│                │                                            │
│ ● All          │ ┌──────────────────────────────────────┐   │
│ ● Combat    ●  │ │ My Name         Sekmeht    ██ inline │   │
│ ● Social    ●  │ │ Death messages  You die*   ██ line   │   │
│ ● Healing   ●  │ │ RT warning      roundtime  ██ inline │   │
│ ○ Crafting  ○  │ └──────────────────────────────────────┘   │
│                │                                            │
│ [+ New Group]  │ ┌── Edit Rule ───────────────────────────┐ │
│                │ │ Name     [My Name              ]       │ │
│                │ │ Pattern  [Sekmeht               ]      │ │
│                │ │ Type     ● Text  ○ Begins-with  ○ Regex│ │
│                │ │ Scope    ● Inline  ○ Whole line        │ │
│                │ │ Case     □ Sensitive                   │ │
│                │ │ FG  [■■■] BG [   ] Bold □              │ │
│                │ │ Sound    [none                  ] [···]│ │
│                │ │ Panels   ● All  ○ Choose...            │ │
│                │ │ Group    [Combat              ▼]       │ │
│                │ │ For      ● Global  ○ Sekmeht           │ │
│                │ ├────────────────────────────────────────┤ │
│                │ │ PREVIEW                                │ │
│                │ │ Sekmeht carefully surveys the area.   │ │
│                │ │ You see Sekmeht standing nearby.      │ │
│                │ └────────────────────────────────────────┘ │
└────────────────┴────────────────────────────────────────────┘
```

**Live preview** — sample lines at the bottom update in real time as the pattern and style fields change. No need to close the editor to see how a rule will look in-game.

Left sidebar shows all groups with toggle switches. Selecting a group filters the rule list to that group only. `All` shows every rule.

### 14.10 Trigger Actions

| Action type | Payload | Behavior |
|---|---|---|
| `command` | `pray` | Sends the command to the game server |
| `sound` | `sounds/alert.wav` | Plays a local sound file |
| `open-panel` | `thoughts` | Surfaces the named panel if not already visible |
| `flash-panel` | `main` | Briefly highlights the panel tab to draw attention |
| `log` | `my-log` | Routes matched line to a named stream (see §14.10a) |
| `eval` | `health < 30` | Fires only when the game-state expression is true |

**Cooldown** — minimum seconds between firings of the same trigger. Prevents a bleed message that repeats every second from spamming `pray` 50 times. Set to `null` for one-shot triggers (e.g. "open panel when combat starts").

### 14.10a Trigger Log Destination

The `log` action routes the matched line to a named stream instead of (or in addition to) the main text window. This mirrors how Genie routes trigger output to named windows.

**How it works:**

- Each trigger has a `destination` field: default is `main`, or any stream name the player types (e.g. `combat-log`, `healer-log`, `my-alerts`)
- When a trigger fires, the matched line is copied to the destination stream
- The destination stream auto-discovers into the panel system exactly like Lich streams — it appears in the Panel Manager "Available Streams" list and can be added as a panel tab
- Players can create a dedicated panel for `combat-log` to see only combat-related trigger hits without scrolling through main text

**Example use cases:**

| Trigger pattern | Destination | Effect |
|---|---|---|
| `You swing .+ at` | `combat-log` | All attack messages routed to a dedicated Combat Log panel |
| `You are bleeding` | `alerts` | Bleeding messages go to an Alerts panel |
| `gains? a rank` | `exp-log` | Every rank-up logged to a persistent Exp Log panel |
| `thinks,` | `thoughts-filtered` | Filtered thoughts stream showing only matched patterns |

The destination field appears in the trigger editor as:

```
Destination:  [main ▼]   or type a stream name: [____________]
```

`main` is the default. If the player types a new name, it becomes a discoverable stream automatically on first fire.

### 14.11 Eval Trigger Variables

Eval triggers evaluate a simple expression against live game state before firing:

| Variable | Type | Example |
|---|---|---|
| `health` | 0–100 | `health < 30` |
| `mana` | 0–100 | `mana < 20` |
| `stamina` | 0–100 | `stamina < 50` |
| `concentration` | 0–100 | `concentration < 40` |
| `spirit` | 0–100 | `spirit < 25` |
| `rt` | seconds | `rt > 5` |
| `ct` | seconds | `ct > 0` |
| `stance` | string | `stance == "prone"` |
| `bleeding` | boolean | `bleeding == true` |
| `stunned` | boolean | `stunned == true` |
| `dead` | boolean | `dead == true` |
| `hidden` | boolean | `hidden == false` |
| `invisible` | boolean | `invisible == true` |
| `room` | string | `room == "The Crossing"` |
| `spell` | string | `spell == "Fire Ball"` |

Supported operators: `<`, `>`, `<=`, `>=`, `==`, `!=`. Expressions are intentionally simple — no scripting language, no compound logic. Complex automation belongs in Lich.

### 14.12 Implementation Notes

- Rule and group state stored in `localStorage` as `lichborne.highlights` and `lichborne.triggers`
- Pattern matching runs on every incoming text segment after XML parsing, before rendering
- Regex patterns compiled once on load and cached — not re-compiled per line
- Whole-line rules checked first via a single combined alternation regex (Genie approach) for performance
- Inline rules use specificity-first overlap resolution (Profanity approach)
- Highlights applied in `renderSegment()` — adds inline style or `data-highlight` class alongside existing preset styles
- Trigger eval expressions parsed with a minimal safe evaluator — no `eval()`, no arbitrary code execution
- Rules exported/imported as JSON; import merges with existing rules (no full replace)
- **Zero-length match guard** — all `while (regex.exec())` loops (preview and live render) advance `lastIndex` manually when a zero-length match is returned (`m[0].length === 0`). This prevents an infinite loop when patterns use zero-width assertions like `^`, `$`, `\b`, or `(?=...)` in regex mode. Without this guard, a pattern like `^` produces a zero-length match at position 0 and can freeze the renderer thread before V8 can be interrupted.

### 14.x Highlight Sound Architecture

`HighlightRule` carries an optional `soundFile?: string` — a full filesystem path to a WAV/MP3/OGG file. When a highlight matches, `playWavFile()` is called in `GameWindow` via `processHighlightSoundsRef`, which iterates only rules that have `soundFile` set. This is a dedicated ref separate from the visual highlight pipeline so sounds fire even for streams that aren't displayed.

**Design decision: sounds live on the rule, not a companion trigger.** Earlier designs created a secondary trigger for every highlight that had a sound. This was abandoned because: (1) it polluted the triggers list with auto-generated items the user didn't create, (2) it broke on import — the trigger count was double what users expected, and (3) sounds are a presentation concern, not a behavioral one. A highlight knows its own sound. A trigger that plays a sound is a different thing entirely.

`playWavFile(path)` converts Windows backslash paths to `file:///` URLs and plays via `new Audio(url).play()`. Errors are silently swallowed — a missing sound file should never break the session.

### 14.y Trigger Action Editor

The THEN section of a trigger uses a card-per-action layout. Two notable UI decisions:

- **Action type selector**: a single `<select>` replaces the original 9-pill row. Pills worked fine at 3–4 options but clipped badly as the action type count grew. The select scales to any number of types and matches the visual weight of the other dropdowns in the panel.
- **Variable picker**: `VarPicker` is an uncontrolled `<select defaultValue="">` that inserts `$varName` at the cursor position when a variable is chosen, then resets via `e.target.value = ''` (direct DOM mutation). The previous implementation used a floating portal menu with open/close state, refs, and a `useEffect` click-outside handler — all of which were removed.

### 14.z Command Echo

Every command sent through `sendCommandSequence` (macros and alias resolution) is echoed to the main stream as `>command` using the `command-echo` preset, so players can see what fired. For aliases, only the resolved commands are echoed — the original typed alias name is suppressed. This matches how veteran clients (Genie, StormFront) behave and prevents confusion when an alias maps to a different command name.

**Inline echo (v0.17.3).** The echo is merged INLINE into the prompt the command was typed at — `s>stand`, not a standalone `s>` line followed by a `>stand` line (matches Wrayth/Genie/Frostbite). `appendEcho(prev, cmd)` (GameWindow) merges the command into a trailing bare prompt line (reusing the prompt's own `>`, clearing its `prompt` flag so the dedup collapse can't treat it as a duplicate, reusing the line id so it updates in place); it falls back to a standalone `>cmd` line when there's no trailing prompt (mid-stream, or rapid commands). All three echo sites (`sendCommandSequence`, `dispatchUserText` split, canonical `sendCommand`) route through it and then null `lastMainLineRef` (a typed command is a "break" — the prompt returning after a no-output command must still show). The echo is display-only — the Session Log still records the canonical `>cmd`.

### 14.z.1 Prompt `>` deduplication (v0.17.3)

DR fires a `<prompt>` after every server turn, so the raw feed is `>`-spammed; the client shows ONE `>` per turn and mutes the rest until real activity, in two layers:

- **Parser (`StormFrontParser`)** — every event routes through one `emit()` chokepoint that records `lastEmitWasPrompt`. `case 'prompt'` emits the `>` unless `lastEmitWasPrompt && prompt === lastPromptText` (the *immediately-preceding emitted event* was that exact prompt) — so truly back-to-back identical prompts are suppressed at the source, while ANY non-prompt emit (main OR sub-stream) clears the flag so a `>` after real activity is never suppressed. (This replaced the old `lastMainText` keying, which compared the prompt to the last MAIN-stream text and so wrongly suppressed the `>` after sub-stream-only activity — the "no `>` after a room description" gap.)
- **Display (GameWindow, pitfall #88 collapse)** — a `>` line is dropped only when the previous DISPLAYED MAIN line was an identical prompt. Sub-stream/room activity (a move's title/exits/players, combat state, thoughts) is deliberately NOT a visible break — it never lands in the main scroll — so several `<prompt>`s from one room render / combat flurry still collapse to a single `>`. Statusprompt drift (`H>`→`R>`, different text) keeps both. The B194 MUTE case (muted MAIN content between prompts) still collapses here. A first attempt that made sub-stream activity break the collapse produced double `>`s and was reverted.

---

## 15. Smart Names / Contacts

> Status: Phase 6 — complete (6A–6C). 6D auto-detection is stretch/unscheduled.

### 15.1 Concept

A lightweight contacts system that turns player names into living dossiers. When you add someone as a contact, their name lights up in game text with a color and optional tag prefix. Click any occurrence of their name to see their card — guild, circle, last seen, notes.

Built in four milestones:
- **6A** — Data model, templates, Contacts panel UI
- **6B** — Name highlighting + inline tag injection in game text
- **6C** — Clickable popover + last-seen auto-tracking
- **6D (stretch)** — Auto-detection from arrivals/tells/room desc

### 15.2 Data Model

```typescript
ContactTemplate {
  id:        string    // uuid
  name:      string    // "Enemy", "Friends", "Guild"…
  textColor: string    // hex — the name's color in game text
  bgColor:   string    // hex | 'transparent'
  tagText:   string    // optional prefix e.g. "[Enemy]" — empty string = no tag
  tagColor:  string    // hex — defaults to textColor
}

Contact {
  id:        string    // uuid
  name:      string    // exact player name, case-insensitive match
  templateId: string | null
  guild:     string    // guild name or "Unknown"
  circle:    string    // freeform e.g. "~50", "100", ""
  notes:     string    // freeform
  lastSeen:  number | null   // unix timestamp
  lastRoom:  string | null   // room name at last detection
}
```

Stored in localStorage:
- `lichborne.contacts` — `Contact[]`
- `lichborne.contact-templates` — `ContactTemplate[]`

### 15.3 Contact Templates

Default templates shipped with the client:

| Name | Text Color | Tag | Groups |
|------|-----------|-----|--------|
| Friends | `#a0d080` (soft green) | _(none)_ | All Groups |
| Enemies | `#e05050` (red) | `[Enemy]` | All Groups |

Players can add, edit, and delete custom templates. Default templates cannot be deleted but can be edited.

Each template has a **Groups** assignment (identical to highlight/trigger/macro group rules):
- `allGroups: true` (default) — template styling applies regardless of active mode
- Specific groups — styling only applies when at least one assigned group is active

When a template's group condition is not met, the contact's name still renders as a clickable span but without color, tag, or bold — as if no template were assigned. This allows enemies to be highlighted only in PVP mode, friends only in social mode, etc.

### 15.4 Contacts Panel UI

Toolbar button "Contacts" opens a modal with two views: **Contacts** (default) and **Templates**.

```
┌─ Contacts ──────────────────────────────────────────────────┐
│  [+ New Contact]                      [Contacts] [Templates]│
├─────────────────┬───────────────────────────────────────────┤
│ [Enemy] Sekmeht │  Name:     Sekmeht                        │
│ [Friend] Muse   │  Template: [Enemy ▾]                      │
│ Arianiss        │  Guild:    [Warrior Mage ▾]               │
│                 │  Circle:   50                             │
│                 │  Last seen: 3 days ago                    │
│                 │  Location:  N. Gate, The Crossing         │
│                 │                                           │
│                 │  Notes:                                   │
│                 │  ┌─────────────────────────────────────┐  │
│                 │  │ One bad dude. Don't fight alone.    │  │
│                 │  └─────────────────────────────────────┘  │
│                 │                        [Save]  [Delete]   │
└─────────────────┴───────────────────────────────────────────┘
```

- Left sidebar: all contacts, each displayed as `[Tag] Name` in their template text color
- Clicking a contact loads their form on the right
- "+ New Contact" creates a blank form; name field auto-focused
- **Guild dropdown**: all 13 DR guilds + "Unknown"
- **Circle**: free text input (e.g. "~50", "100+")
- **Last seen / Location**: read-only, auto-populated (Phase 6C)
- **Save** persists; **Delete** removes with confirmation

### 15.5 Templates View

```
┌─ Contacts ──────────────────────────────────────────────────┐
│                                       [Contacts] [Templates]│
├─────────────────────────────────────────────────────────────┤
│  [+ New Template]                                           │
│                                                             │
│  ● Friends      ■ #a0d080   □ transparent   tag: (none)    │
│  ● Enemies      ■ #e05050   □ transparent   tag: [Enemy]   │
│  ● Guild        ■ #60b8e0   □ transparent   tag: (none)    │
│  ● Self         ■ #e8d070   □ transparent   tag: (none)    │
│  ● Merchant     ■ #c080e0   □ transparent   tag: (none)    │
│                                                             │
│  Click a template row to edit inline.                       │
└─────────────────────────────────────────────────────────────┘
```

Each row expands inline to edit: template name, text color picker, bg color picker, bold toggle, tag text field, tag color picker, tag BG picker, and a **Groups** row (All Groups button + GroupPicker — same pattern as highlight/trigger/macro editors).

### 15.6 In-Game Name Rendering (Phase 6B)

When a contact exists for a name, every occurrence of that name in game text and stream panels is rendered with their template styling. The tag (if set) is injected as a prefix, visually distinct from the game server's text.

```
[Enemy] Sekmeht just arrived.
Sekmeht says, "Hello there."
```

- Tag rendered in `tagColor`, name rendered in `textColor`, background in `bgColor`
- Name match is **case-insensitive, whole-word** — "Sekmeht" matches but "Sekmehts" does not
- Tag injection is client-only — the server text is never modified; it only affects rendering
- Contacts name matching runs before general preset styling and after XML parsing

### 15.7 In-Game Popover (Phase 6C)

Clicking a contact's name anywhere in game text opens a popover anchored to that word:

```
┌─ [Enemy] Sekmeht ──────────┐
│ Warrior Mage · Circle ~50  │
│ Last seen: 3 days ago      │
│ N. Gate, The Crossing      │
│ ─────────────────────────  │
│ One bad dude. Don't fight  │
│ alone.                     │
│                            │
│     [Edit]        [✕]      │
└────────────────────────────┘
```

- **Edit** opens the Contacts panel with this contact pre-selected
- **✕** closes the popover
- Popover closes on outside click or Escape
- Renders via React portal so it's never clipped by panel overflow

### 15.8 Last-Seen Tracking (Phase 6C)

When a contact's name is detected in any game stream, `lastSeen` and `lastRoom` are updated silently. Sources tracked:

| Source | Updates last seen? |
|--------|--------------------|
| Room players component (`room players`) | Yes — room name from current roomState |
| Arrivals stream | Phase 6D stretch |
| Thoughts stream | Phase 6D stretch |
| Tells | Phase 6D stretch |

Implementation tracks `roomState.players` (the "Also here:" line) only — fires when that component updates, not on every line of game text. `lastSeen` and `lastRoom` written to localStorage debounced at 2s.

### 15.9 Auto-Detection (Phase 6D — stretch)

When the client detects a new name it has never seen before, a subtle dismissible banner appears:

```
Sekmeht detected — add to contacts?  [Friends ▾]  [Add]  [Not now]
```

- Banner auto-dismisses after 8 seconds
- "Not now" suppresses that name for the session only
- Multiple detections queue — one banner at a time
- Deferred to Phase 6D; Phases 6A–6C are fully useful without it

### 15.10 Implementation Notes

- `ContactsContext` (React context) — provides contact list and template list to all components that need to render names; updated on every save
- Name matching compiled to a single `RegExp` alternation on context update — not re-compiled per line
- Whole-word case-insensitive match: `new RegExp('\\b(' + names.join('|') + ')\\b', 'gi')`
- Tag injection handled in a `renderContactName()` helper called from `renderSegment()` when a match is found
- Contacts panel rendered via React portal (same pattern as Theme Picker and Settings)
- All new components use CSS variables from `theme.css` — no hardcoded colors; new CSS file `contacts.css` follows the same structure as existing component stylesheets
- `lastSeen` / `lastRoom` written to localStorage debounced at 2s — prevents thrashing during busy room updates

---

## 16. Login Screen

> Status: Implemented (Phase 1 baseline + UI polish pass 2026-05-03).

### 16.1 Layout

Single-page card (460px wide, dark fixed palette — intentionally hardcoded, not theme-driven since it renders before any character theme is loaded).

```
┌─ Lichborne ──────────────────────────────────────┐
│              Lichborne                            │
│          DRAGONREALMS CLIENT                     │
│                                                  │
│  ACCOUNT NAME                                    │
│  [                                             ] │
│  PASSWORD                                        │
│  [                                             ] │
│  CHARACTER NAME                                  │
│  [ e.g. Katasha                                ] │
│                                                  │
│  ☑ Connect via Lich (recommended)                │
│  ─────────────────────────────────────────────   │
│  ▸ Advanced / Lich Settings                      │
│                                                  │
│  [ ⚡ Connect via Lich ]                         │
└──────────────────────────────────────────────────┘
```

### 16.2 Advanced / Lich Settings Panel

Collapsed by default (never persisted — always starts closed). Expands to show Lich-specific infrastructure fields. All inputs/buttons pinned to 30px height for visual alignment.

```
▾ Advanced / Lich Settings
┌─────────────────────────────────────────────────┐
│ RUBY PATH (RUBY.EXE)                            │
│ [ C:\Ruby4Lich5\4.0.0\bin\ruby.exe ] [ Browse ] │
│ LICH PATH (LICH.RBW)                            │
│ [ C:\Ruby4Lich5\Lich5\lich.rbw     ] [ Browse ] │
│ DELAY (S)  PORT              MODE               │
│ [ 7      ] [ 11024 ] [🔒]   [ --stormfront ▾][🔒]│
│ ☑ Hide Lich window (run as background process)  │
└─────────────────────────────────────────────────┘
```

**Browse buttons** — open a native OS file picker filtered to `.exe` (Ruby) or `.rbw/.rb` (Lich). IPC channel: `browse-file`.

**Port lock** — locked by default (greyed, non-editable). Click 🔒 to unlock (gold border). Re-locking resets to the default port (11024). Prevents accidental port corruption.

**Mode lock** — same padlock pattern as Port. Locked to `--stormfront` by default. Re-locking resets to default.

**Delay** — plain numeric input (seconds). No lock. Users may legitimately need to tune this.

### 16.3 Connecting State

When connecting, the form is replaced entirely by a spinner + scrolling status log. The card stays the same compact size — no layout shift.

```
┌─ Lichborne ──────────────────────────────────────┐
│              Lichborne                            │
│          DRAGONREALMS CLIENT                     │
│                                                  │
│               ◌  (spinner)                       │
│  ┌─────────────────────────────────────────┐     │
│  │ › SGE connected — requesting key...     │     │
│  │ › Got 8 character(s): Agan, ...         │     │
│  │ › Getting login key for Agan...         │     │
│  └─────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
```

On error, `setConnecting(false)` restores the form with the error message displayed so the user can correct and retry.

### 16.4 Design Decisions

- **Hardcoded colors** — login.css uses fixed hex values, not CSS custom properties. The screen renders before any character or theme is active; it should always look the same regardless of user theme config.
- **`showAdvanced` never persisted** — `loadAdvanced()` always overrides with `showAdvanced: false` after merging localStorage. Prevents the panel defaulting open on future loads if the user left it open.
- **"Connect via Lich" outside the advanced panel** — it is a primary choice, not an infrastructure detail. Lives in the main form between Character Name and the Advanced toggle.
- **Subtle divider** before the Advanced toggle (`border-top: 1px solid #222`) separates credential fields from configuration fields visually.
- **Grid columns for Delay/Port/Mode row**: `72px 108px 1fr` — Delay tight (small number), Port fixed (5-digit + lock), Mode fills remaining space.

---

## 17. Automations, Groups & Modes

> Status: **Complete** — built 2026-05-05. All four rule systems wired. Trigger `switchMode` action deferred (see §17.11).

### 17.1 Concept

A three-level hierarchy for organizing and context-switching all automation rules:

```
Mode  ──────────────  saved preset of which groups are active
 └── enabledGroups[]

Group  ─────────────  named, colored organizational tag
 └── name, color

Rule  ──────────────  highlight / trigger / macro / alias
 └── groupIds[]       belongs to zero or more specific groups
 └── allGroups        fires in every mode (overrides group assignment)
 └── enabled          individual toggle works independently
```

A **Group** is a named, colored tag. Rules are assigned to groups (or marked **All Groups**) to become mode-aware. A **Mode** is a saved snapshot of which groups are enabled; switching modes flips all group states at once.

**All Groups** is the escape hatch for rules that should always fire regardless of mode — e.g. a critical health alert. Rules with neither `allGroups` nor any `groupIds` are silent in every mode, including No Mode. This creates a deliberate incentive to categorize rules.

### 17.2 Data Model

```typescript
interface RuleGroup {
  id:    string   // uuid
  name:  string   // "Combat", "PVP", "Social"
  color: string   // hex — used for sidebar left borders, chips, and pills
}

interface GameMode {
  id:            string    // uuid
  name:          string    // "Hunting", "PVP", "Town"
  enabledGroups: string[]  // group IDs that are ON when this mode is active
  hotkey?:       string    // optional key combo (e.g. "Ctrl+1") via KeyBindingField
}

// Runtime state — persisted separately from definitions
activeGroupStates: Record<string, boolean>  // live per-group on/off
activeModeId:      string | null
```

Each rule-bearing type gets:
```typescript
groupIds:  string[]  // empty by default
allGroups: boolean   // false by default — fires in every mode when true
```

Backwards compatible: existing saved rules with no `groupIds`/`allGroups` fields default to `[]`/`false` (silent in all modes — player must categorize on next edit).

### 17.3 Rule Firing Logic

```typescript
function isRuleActive(
  groupIds: string[],
  activeGroupStates: Record<string, boolean>,
  allGroups: boolean,
): boolean {
  if (allGroups) return true                           // All Groups — always fires
  if (groupIds.length === 0) return false              // Uncategorized — never fires
  return groupIds.some(id => activeGroupStates[id])   // fires if ≥1 group is active
}
```

```
allGroups rule      →  always fires in every mode
specific group rule →  fires only when ≥1 group is active in current mode
uncategorized rule  →  never fires (silent — must be categorized)
```

### 17.4 Mode Behavior

- Switching a mode applies its `enabledGroups` snapshot to `activeGroupStates` immediately — all other groups set to `false`
- Manual group toggles work on top of the active mode without modifying the mode definition
- When group state diverges from the active mode snapshot, toolbar shows **Hunting \***
- Re-applying the active mode (Apply / Re-apply button) resets manual overrides back to the clean snapshot
- **No Mode** (`activeModeId = null`) sets all group states to `false` — only `allGroups` rules fire
- Each mode has an optional **hotkey** (recorded via KeyBindingField, same component as Macros)
- Hotkeys fire from document `onKeyDown`, suppressed when any modal is open (same `anyModalOpenRef` pattern)

### 17.5 Default Groups and Modes

Ships with sensible defaults so new players aren't staring at a blank slate:

**Default Groups:** Combat · PVP · Social · Crafting

**Default Modes:**
| Mode | Active Groups |
|---|---|
| Hunting | Combat |
| PVP | Combat, PVP |
| Town | Social |
| Crafting | Crafting |

Players can rename, delete, or add their own. No group is protected — even the defaults are fully editable.

### 17.6 Unified Automations Panel

`Highlights`, `Triggers`, and `Macros` toolbar buttons are removed. All four rule systems live under a single **Automations** button. The Mode switcher is a separate toolbar control — it's a runtime toggle, not an editor.

```
Toolbar (final):
Lichborne · status · Debug · Panels · Contacts · Automations · [Hunting ▾] · Theme · Settings · Disconnect
```

Inside the Automations panel — Contacts-style header with tabs on the right:

```
┌─ Automations ─────────────── [ Highlights | Triggers | Macros | Aliases | Groups & Modes ]  ✕ ─┐
│                                                                                                  │
│  (selected tab content — same sidebar+detail layout as standalone panels)                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Each rule tab is the full editor for that system — identical to the standalone Highlights/Triggers/Macros panels today, plus the group filter strip and group picker field added.

### 17.7 Mode Switcher (Toolbar Popover)

```
[Hunting ▾]

┌─ Mode ────────────────────────────────────┐
│  ○ Hunting                    Ctrl+1      │
│  ○ PVP                        Ctrl+2      │
│  ○ Town                       Ctrl+3      │
│  ○ Crafting                   Ctrl+4      │
│  ──────────────────────────────────────   │
│  [No Mode]                                │
│  [Manage…]                                │
└───────────────────────────────────────────┘
```

- Active mode has a filled dot `●`; others `○`
- Hotkey shown inline if assigned
- **No Mode** clears the active mode (groups stay in current state)
- **Manage…** opens the Automations panel to the Groups & Modes tab
- Clicking the active mode again resets any manual overrides back to the clean snapshot

### 17.8 Group Picker on Rules

Each rule editor (highlight, trigger, macro, alias) and contact template has a **Groups** section:

```
GROUPS
[ All Groups ]  [ + Group ▾ ]
```

- **All Groups** button — toggles `allGroups: true`; when active, clears `groupIds` and hides the picker (redundant). Shown with accent border/fill when on.
- **+ Group** dropdown — shows all defined groups; selecting one adds a colored chip. Clicking a chip removes the assignment.

```
GROUPS
[ All Groups ]  ■ Combat  ■ PVP  [ + Group ▾ ]
```

All new rules and contact templates default to `allGroups: true` — active in every mode out of the box. Players narrow to specific groups after creation if needed.

### 17.9 Sidebar Group Filter

Inside each rule tab sidebar, a group filter strip sits between the `+ New` button and the rule list:

```
[ All ] [ ■ Combat ] [ ■ PVP ] [ ■ Social ] …
```

- **All** (default) shows every rule regardless of group membership
- Clicking a group pill filters to rules in that group only
- Each rule row shows a thin colored `▌` left border for its first assigned group (or none if ungrouped)
- Rules whose groups are all currently inactive are dimmed in the list

### 17.10 Groups & Modes Tab

Two panels side by side inside the tab:

**Left — Groups**
```
+ New Group
─────────────────────
■ Combat
■ PVP
■ Social
■ Crafting
```
Detail: Name field, color picker, Delete button. Shows how many rules are assigned.

**Right — Modes**
```
+ New Mode
─────────────────────
● Hunting
○ PVP
○ Town
○ Crafting
```
Detail: Name field, hotkey field (KeyBindingField), checklist of all groups with on/off toggles for this mode, Delete button, **Apply** button to make this the active mode.

### 17.11 Trigger → Switch Mode Action *(deferred)*

The trigger action type list will gain `switchMode`:

```typescript
type ActionType = 'command' | 'echo' | 'notify' | 'sound' | 'webhook' | 'variable' | 'switchMode'
```

In the trigger editor, the switchMode action shows a mode dropdown:

```
⚙ Switch Mode   [ Hunting      ▾ ]
```

When the trigger fires, `activeModeId` is updated and the mode's group snapshot is applied instantly — same as clicking the mode in the toolbar popover. This lets the game itself drive client context automatically.

Example use cases:
- `You feel yourself transported` → Switch Mode: Hunting
- `You have entered the arena` → Switch Mode: PVP
- `You are now in the Town of Crossing` → Switch Mode: Town

**Not yet implemented.** `applyMode` is already available via GroupsContext; the only work remaining is adding the `switchMode` case to `TriggersPanel.tsx` (action type selector + mode dropdown) and `useTriggerEngine.ts` (`executeAction` switch).

### 17.12 Storage Keys

```
lichborne.groups            — RuleGroup[]
lichborne.modes             — GameMode[]
lichborne.activeGroupStates — Record<string, boolean>
lichborne.activeModeId      — string | null
```

Existing rule storage keys (`lichborne.highlights`, `lichborne.triggers`, `lichborne.macros`, `lichborne.aliases`) are unchanged. The `groupIds: string[]` field is added to each rule type — missing field on load treated as `[]`.

### 17.13 Build Order

1. ✅ **`groups.ts`** — `RuleGroup`, `GameMode` types; load/save for all four keys; default groups/modes; `isRuleActive(groupIds, activeGroupStates, allGroups)` helper
2. ✅ **`GroupsContext.tsx`** — React context at App root; provides groups, modes, activeGroupStates, activeModeId, applyMode, applyModeObject, clearMode, toggleGroup, setActiveModeId; `clearMode` zeros all group states (No Mode = only allGroups rules fire); cleanup effect removes stale group states on group delete
3. ✅ **Toolbar mode switcher** (`ModeSwitcher.tsx`) — popover with mode list, hotkeys, No Mode, Manage…; modified-state `*` indicator; hotkeys wired in GameWindow `onKeyDown` via `modesRef`/`applyModeRef`
4. ✅ **Groups & Modes tab UI** (`GroupsModesTab.tsx`) — two-panel editor; Apply uses `applyModeObject(draft)` to avoid save+apply race
5. ✅ **Wire Highlights** — `groupIds`/`allGroups` on `HighlightRule`; All Groups button + GroupPicker in editor; sidebar filter strip; `useCompiledHighlights` respects `isRuleActive`
6. ✅ **Wire Triggers** — `groupIds`/`allGroups` on `TriggerRule`; All Groups button + GroupPicker in editor; `useTriggerEngine` skips rules where `!isRuleActive`; *(switchMode action deferred)*
7. ✅ **Wire Macros** — `groupIds`/`allGroups` on `MacroRule`; All Groups button + GroupPicker; `resolveMacro` filter checks `isRuleActive`
8. ✅ **Wire Aliases** — `groupIds`/`allGroups` on `AliasRule`; All Groups button + GroupPicker; `resolveAlias` filter checks `isRuleActive`
9. ✅ **Automations panel shell** (`AutomationsPanel.tsx`) — tabbed container (Contacts-style header); hosts all four rule editors inline + Groups & Modes tab; accepts prefill props for right-click open-to
10. ✅ **Consolidate toolbar** — removed `btn-highlights`, `btn-triggers`, `btn-macros`; added `btn-automations` + ModeSwitcher

### 17.14 Macro cursor markers & composition (B137 v0.8.10, B170 v0.13.3)

A macro command containing an unescaped **`@`** fires in **type-and-wait** mode instead of sending:
the text (with all unescaped `@` stripped) is typed into the command bar and the caret lands at the
first `@`'s position — the Genie/Wrayth convention (`get @ from my pack` → `get ⎵ from my pack`,
caret in the gap). `\@` escapes a literal `@`. The macro stops at the first wait-command; later
commands in the sequence are skipped. Canonical helper: `parseCursorMarker` ([macros.ts](src/renderer/macros.ts));
fire path in GameWindow's keydown handler. Full conventions + import translation (Wrayth `\r`,
Genie `\x`): CLAUDE.md pitfall #51.

**Composition (B170, v0.13.3 — JadedSoul):** when a cursor macro fires while the command input is
**focused and non-empty** (the user is mid-composition, e.g. sitting in the gap a previous template
macro left), its text **INSERTS at the caret** (replacing any selection; caret lands at the inserted
text's `@` offset) — Wrayth's type-into-the-entry-box model, enabling macro-within-macro:
`Alt-T` (`get @ from my pack`) then `Ctrl-2` (`second @`) → `get second from my pack`. An **empty or
unfocused** bar keeps replace semantics (a template fire starts fresh). Consequence (Wrayth-faithful):
re-firing a template while focused in its own non-empty output inserts again — clear the bar for a
fresh template. Git-verified the fire path was replace-only v0.8.10→v0.13.2; insert mode is new
capability, not a regression fix.

### 17.15 Default macro seeds (v0.8.3 repeat tokens; F56 numpad movement, v0.15.2)

Two one-time per-character seeds run from GameWindow mount effects, giving a fresh character (or a
convert's existing character, once) the Stormfront-family keyboard conventions out of the box:

- **`seededRepeatMacros` (v0.8.3):** `Ctrl+Enter` → `{RepeatLast}`, `Alt+Enter` →
  `{RepeatSecondToLast}`, `NumEnter` → `{ReturnOrRepeatLast}` — the Stormfront/Wrayth repeat keys.
- **`seededNumpadMovement` (F56, v0.15.2):** the classic movement pad — `Num8/2/4/6` = `n/s/w/e`,
  corners = the diagonals (`Num7/9/1/3` = `nw/ne/sw/se`), `Num5` = `out`, `Num0` = `down`,
  `Num.` = `up`. Layout and short-form commands verified against **Frostbite's bundled default
  profile** (`deploy-files/profiles/frostbite/macros.ini`, Qt keycodes decoded) — the muscle memory
  Genie/Wrayth/Frostbite converts arrive with. Frostbite's utility keys (`Num+`=look, `Num-`=info,
  `Num*`=exp, `Num/`=health, Ctrl+numpad=peer) are deliberately NOT seeded — testers personalize
  those (Morress's `Num+`→LOOK), and the seed stays quiet/minimal (movement is the universal core).

**Shared rules (both seeds):** keys the user already bound are SKIPPED (never override
customization); the per-character localStorage flag makes each seed once-only, so deleting a seeded
macro never resurrects it; seeded macros are ordinary `MacroRule`s (editable/deletable like any
other, ride the Macros Transfer category). The flags themselves are excluded from Profile Transfer
(§29.3). Note the behavioral consequence, same as the legacy clients: numpad macros match on
`e.code` (NumLock-independent) and fire globally, so the numpad IS a movement pad — digits type
from the top row.

---

## 18. Packaging & Distribution

> Status: **Complete** — implemented 2026-05-07.

### 18.1 Build Target

**Portable Windows x64 exe** — no installer, no code signing. Players run `Lichborne.exe` directly from any folder. Windows SmartScreen will show an "unknown publisher" warning on first launch; testers click "More info → Run anyway". Acceptable for a small trusted group; code signing can be added later if needed.

Build command (with release notes):
```powershell
$env:GH_TOKEN = "your_token"
node publish.mjs
```

`publish.mjs` does five things in sequence:
1. **Clean `release/`** — deletes all `.exe` and `.yml` files so stale files from prior runs can't corrupt the `latest.yml` filename lookup
2. `npm run build` — compiles main + renderer; bakes `__APP_VERSION__` from `package.json` into the renderer
3. electron-builder — packages the `dist/` output and uploads the exe to a GitHub Release draft
4. GitHub REST API upload — generates `latest.yml` from the exe's SHA-512 hash and uploads it as a release asset (electron-builder does not produce this for portable builds)
5. GitHub REST API PATCH — sets the release body from `release-notes.md`

Local-only build (no publish):
```powershell
npm run dist
```

Output: `release/Lichborne X.Y.Z.exe`

### 18.2 electron-builder Config

Defined in `package.json` under the `"build"` key:

| Field | Value |
|---|---|
| `appId` | `com.lichborne.app` |
| `productName` | `Lichborne` |
| `win.target` | `nsis` (x64) — the table said `portable` until v0.19.2, stale since the NSIS switch; linux `AppImage` (x64) and mac `dmg`+`zip` (arm64) joined in v0.18.0 |
| `publish.provider` | `github` |
| `publish.owner` | `SekmehtDR` |
| `publish.repo` | `Lichborne` |
| Output dir | `release/` (gitignored) |

### 18.3 Releasing a New Version

1. Bump `"version"` in `package.json`
2. Update `release-notes.md` with what's new
3. Commit both files
4. Set `GH_TOKEN` env var (fine-grained PAT with Contents: read+write on the Lichborne repo)
5. Run `node publish.mjs` — builds, packages, uploads, and patches release notes automatically
6. Go to **github.com/SekmehtDR/Lichborne → Releases** → find the draft → click **Publish release**

`publish.mjs` uploads two files per release:
- `Lichborne X.Y.Z.exe` — the portable executable
- `latest.yml` — version metadata consumed by `electron-updater`; generated manually from the exe's SHA-512 hash because electron-builder does not produce it for portable builds

**Important:** Always use `node publish.mjs` for releases — never `electron-builder` directly. Running electron-builder directly will produce the exe but not `latest.yml`, and the version number in the app will be wrong if the renderer wasn't rebuilt first.

### 18.4 Auto-Update Flow

Powered by `electron-updater`. Only runs when the app is packaged (`app.isPackaged` guard — never fires in dev).

**On launch (3s delay):** `autoUpdater.checkForUpdates()` fetches `latest.yml` from the GitHub release and compares versions silently.

**Update states (managed in `App.tsx`):**

| State | Banner | Action |
|---|---|---|
| `idle` | Hidden — Check for Updates button shown on login screen | — |
| `available` | "Update vX.Y.Z available" | Download button → triggers `autoUpdater.downloadUpdate()` |
| `downloading` | "Downloading update…" | No action (wait) |
| `ready` | "Update ready to install" | Restart & Install → `autoUpdater.quitAndInstall()` |

The banner is rendered at the `App` level (above both login and game screens) so it's visible regardless of connection state. It uses a green-tinted dark palette that reads clearly across all themes without importing theme CSS vars.

**Dismissable:** The banner has a ✕ button so players can dismiss and install at their own pace after safely logging out. The dismissed state resets if a new update event fires.

**Check for Updates button:** Shown only on the login screen (not in-game) in a thin bar at the top right. Subtle muted style. Shows "Checking…" while in flight, then "You're up to date" if no update is found. Disappears when the update banner takes over.

**`autoDownload: false`** — the user always initiates the download. The app never downloads without consent.

**`app-update.yml`** — must be bundled manually via `extraResources` in `package.json`. electron-builder does not generate it for portable builds; without it `electron-updater` cannot find its GitHub config and fails silently.

**Diagnostics:** `updater-log` IPC channel forwards checking/error/no-update events to the renderer console. Open DevTools → Console to see `[auto-updater]` messages ~3 seconds after launch.

**User-facing notices ride the same channel (B356/B364, v0.19.7).** A message main prefixes with exactly `[notice] ` is shown by App as an **"Updates" toast** instead of a console line; everything else stays diagnostics. Two senders today: the macOS menu check ("auto-update is unavailable on macOS … download from GitHub Releases") and a MANUAL check (Help menu or the launcher's button, `check-for-updates` passes `manual: true`) that finds no active updater — a non-AppImage Linux run, a dev build — which says this copy can't update itself. The automatic startup check never raises a notice. The prefix is the contract: change it in main and App together.

### 18.4.1 Dual-Feed Update Check — the Elanthia-Online Handover

The repository is being **transferred** (GitHub "Transfer ownership", not a fork) from `SekmehtDR/Lichborne` to the **Elanthia-Online** organization (`elanthia-online/Lichborne`) — the community team that maintains Lich. Every shipped install has the old repo baked into its `app-update.yml`, so the updater was taught to look in both places (v0.19.x, `checkForUpdatesDualFeed()` in [main.ts](src/main/main.ts)) so the transfer never strands an install.

**Mechanism.** `UPDATE_FEEDS` lists the new home first, the legacy repo second. Each check walks the list: `autoUpdater.setFeedURL({provider:'github', owner, repo})` (which overrides the baked `app-update.yml` — electron-updater prefers a runtime-set provider over the disk config) then `await checkForUpdates()`. A missing repo (404 on `releases.atom`) and an existing repo with no releases (`ERR_UPDATER_NO_PUBLISHED_VERSIONS`) both REJECT, falling through to the next feed; a feed that ANSWERS is authoritative ("no update" does not fall through). The winning feed's provider also serves the download, so Download/Install ride the same repo. The `updaterProbing` flag suppresses the renderer-facing `ERROR:` line for non-final attempts (`checkForUpdates()` both rejects and emits `error`), so the pre-transfer 404 on the new home is silent; a successful check logs `Update feed: owner/repo` to the updater log so tester reports name the serving repo. Both call sites (the 3s startup check and the menu's Check for Updates) route through the helper; the macOS gates are unchanged. `app-update.yml` must still ship — electron-updater reads `updaterCacheDirName` from it.

**Why both, when GitHub redirects?** A true transfer 301-redirects all old URLs (web, git, API, release assets) and electron-updater follows redirects — so even never-updated installs keep working after the transfer. But that redirect is severed the moment anything named `Lichborne` is re-created under `SekmehtDR`; the dual feed keeps dual-feed-era installs updating regardless. **Never re-create a repo named `Lichborne` under `SekmehtDR` after the transfer** — it would strand only the pre-dual-feed installs, which is exactly the population that can't be patched remotely.

**Rollout sequence:**
1. **Phase 1 (pre-transfer):** ship the dual-feed updater as a normal release from `SekmehtDR`. The new-home probe fails silently and falls back — zero behavior change, but every updated install is transfer-ready.
2. **Phase 2 (transfer day):** transfer the repo on GitHub. Releases/issues/stars move; redirects arm. No release needed that day. Do NOT pre-create the org repo (a partial repo with some releases would answer the check with stale data — the transfer moves everything atomically).
3. **Phase 3 (first org release):** flip the hardcoded owner strings (checklist below), cut the release from the org via Actions. Dual-feed installs get it from the new feed; older installs via the redirect.

**Phase-3 cut-over checklist (every hardcoded `SekmehtDR`):** `package.json` `build.publish.owner` · `build/app-update.yml` `owner` · `publish.mjs` `owner` · the local-run fallback literals in `.github/scripts/release-prepare.mjs` + `release-verify.mjs` (the Actions path self-corrects via `GITHUB_REPOSITORY`) · main.ts Help-menu links (GitHub Repository / Report a Bug) · `credits.ts` `REPO_URL` + `AI_NOTICE_URL` · `AboutModal.tsx` displayed link text · README (3 links) · Lichborne-User-Guide (2 links) · this file's §18.2 table · release-notes.md. Keep `UPDATE_FEEDS` itself unchanged — it already names both homes, and the legacy entry stays as belt-and-braces.

**Org-side pre-flight for Phase 3:** the release workflow's `GITHUB_TOKEN` must be able to create releases — check org **Settings → Actions → Workflow permissions** is "Read and write" (many orgs default to read-only, which 403s the draft pre-create in `release-prepare.mjs`).

### 18.5 Version Display

The version string is injected at build time from `package.json` via Vite's `define` (`__APP_VERSION__`). It appears in three places — all read from the same source, no manual sync needed:

| Location | Format |
|---|---|
| Login screen | `v0.1.0` below "DRAGONREALMS CLIENT" subtitle, dimmer/smaller |
| Window title (before login) | `Lichborne v0.1.0 — DragonRealms` |
| Window title (after login) | `Agan · DR — Lichborne v0.1.0` |

### 18.6 Application Menu

A custom native menu replaces Electron's default. Built with `Menu.buildFromTemplate` in `main.ts`.

| Menu | Items |
|---|---|
| **File** | Open Data Folder (`shell.openPath(app.getPath('userData'))`), Quit |
| **Edit** | Undo, Redo, Cut, Copy, Paste, Delete, Select All |
| **View** | Reload, Force Reload, Toggle DevTools, zoom controls, Fullscreen |
| **Window** | Minimize, Close |

**Open Data Folder** opens `app.getPath('userData')` in the OS file explorer — resolves dynamically regardless of OS or user profile. On Windows this is typically `%APPDATA%\lichborne`, which contains all localStorage data (settings, highlights, triggers, themes, etc.).

**DevTools** are closed by default in packaged builds (`app.isPackaged` guard on `openDevTools()`). In dev (`npm start`) they open automatically. Players can still open them manually via View → Toggle Developer Tools.

### 18.7 Versioning Convention

| Pattern | Meaning |
|---|---|
| `0.1.x` | Bug fixes and polish |
| `0.2.0` | Next meaningful feature batch |
| `1.0.0` | Stable public release |

---

## 19. Map System

> **Architectural pivots — two of them.** v0.6.3 deleted the per-zone Genie Graph (`MapGraphView.tsx`) in favor of a Lich-native auto-layout view (`LichGraphView.tsx`) that BFS-placed every Lich room from its `wayto` data, with Genie XML as optional polish. v0.6.6 deleted that view in turn — the BFS layout produced hairballs in dense districts and Lich's directional walks routinely disagreed with Genie's hand-curated coords ("type west, marker goes north"). The current shipping view (`GenieMapView`) renders Genie XML directly: one zone visible at a time, no auto-layout, no zone stitching. Coordinates come from the XML; the maps team has hand-laid these for 20 years and we trust them. See §19.16 for the current shipping architecture; §§19.5–6, 19.11, 19.15 are retained for historical context.

### 19.1 Overview

The Map System is a spatially-aware map visualization built around two views.

**Data sources:**
- **Lich JSON** (`map-*.json` in Lich's `data/DR/` folder) — the primary room database. Flat array of rooms with numeric IDs, titles, descriptions, image file references, and `wayto` exit-command maps. Drives the Lich Map view and the player-position tracking (game emits Lich room IDs in subtitles).
- **Genie XML** (player's Genie maps folder, e.g. `C:\Genie-Remix\Maps\`) — the spatial source of truth for the Genie Maps view. Provides node positions, arc graph, color tags, free-floating landmark labels, and cross-zone stub markers. Each Genie XML file is one zone.

**Display modes (toolbar buttons in the map panel):**
- **Lich Map** — renders the Lich image tiles (`.png` files bundled alongside the JSON). Shows the current room highlighted on the tile with arcs drawn from the JSON exit graph. Lich path required. Movement (right-click a room, or the "Walk here" button) delegates to Lich's stock `;go2` script via `onSendCommand(\`;go2 <id>\`)` — `;go2` handles locked doors, hidden exits, blocked paths, retries, and roundtime, none of which a local cardinal-direction walker could handle reliably (v0.8.2). `;k go2` in the command bar cancels in flight.
- **Genie Maps** — renders Genie XML directly, one zone at a time. Coordinates come from the XML (no auto-layout). Auto-switches zones when the player's `roomTitle` matches a room in another loaded zone. See §19.16 for the full architecture. Genie maps folder required.

**Component breakdown:**
- `MapPanel` — coordinator; loads Lich JSON and (optionally) parses every Genie XML in the user-pointed folder into a `Map<zoneId, GenieZone>`; owns current-room tracking and the view-mode switch
- `MapImageView` — Lich image-tile display and exit navigation
- `GenieMapView` — Genie XML rendering with click-to-walk, follow-the-player camera, hover path preview
- `mapTypes.ts` — shared types (`LichRoom`, `GenieZone`, `GenieNode`, `GenieArc`, `GenieLabel`), `parseGenieZone` parser, `findRoom` / `bfsPath` helpers, `COLOR_LEGEND` constant

**Auto-reload:** when `repository.lic` downloads a new Lich map database, the main stream carries `--- Map loaded <filename>.json`. `GameWindow` detects this pattern and increments `lichMapVersion`, which triggers `MapPanel` to reload the JSON database. (Genie XML files are not auto-reloaded — the user re-picks the folder if they update their map set.)

### 19.2 Map File Format

Lich map files are XML, organized as:

```
<zone id="1" name="The Crossing">
  <node id="335" name="The Crossing, Champions' Square" note="GL Barbarian|alias2">
    <description>Room description text…</description>
    <position x="300" y="-368" z="0" />
    <arc exit="north" move="north" destination="1" />
    <arc exit="go" move="go fros door" destination="302" />
  </node>
  …
</zone>
```

**Key fields:**
- `node.id` — local unique ID within the file
- `node.name` — full room name including zone prefix, e.g. `"The Crossing, Champions' Square"`; this is what the game subtitle sends inside `[]`
- `node.note` — pipe-delimited aliases (guild abbreviations, script keywords)
- `position.x/y/z` — spatial coordinates; x increases east, y decreases north (negative y = screen up), z is floor level
- `arc.exit` — direction label shown in UI; `"none"` means a hidden passage
- `arc.move` — the actual command to send (may differ from exit, e.g. `"go fros door"`)
- `arc.destination` — destination node ID within the same file

### 19.3 Coordinate System

The XML uses a **screen-native** coordinate system: x increases east, y increases south (same direction as screen y). This means:
- Moving north → y decreases (more negative)
- Moving south → y increases
- No y-negation is needed when converting to SVG screen coordinates

This matches Genie's `ConvertPoint` convention (direct `y * scale`, no flip). Our earlier implementation incorrectly negated y (`-node.y`), rendering every map upside-down.

### 19.4 Room Matching

The game sends the current room title in the `streamWindow` subtitle attribute, in **two id formats** (parse both — v0.11.2, B151):

```
subtitle=" - [Zone, Room Name - 335]"        # id INSIDE the brackets, after " - "
subtitle=" - [Zone, Room Name] (56107)"       # id in PARENS after the brackets — the
                                              # Simutronics room-id flag (optional account
                                              # setting); "(**)" means unmapped/no id
```

**StormFrontParser extraction pipeline:**
1. Extract bracket content: `/\[([^\]]+)\]/` → inner string e.g. `"The Crossing, Champions' Square - 335"`
2. Strip trailing Lich room ID **if present inside the brackets**: `inner.match(/\s*-\s*(\d+)\s*$/)` → `roomId = 335`, `cleanTitle = "The Crossing, Champions' Square"`
3. **Else** try the parens form after the closing bracket: `subtitle.match(/\]\s*\((\d+)\)/)` → `roomId = 56107` (`(**)` yields no match → `undefined`)
4. Emit `room-title` event with `title` and `roomId` (id is **optional** — the flag can be off; the whole pipeline works id-free, falling back to title+desc)

**RoomState** stores `roomId?: number` alongside title and desc. `GameWindow` updates it from every `room-title` event. Both MapPanel instances (panel tab + overlay) receive it as a prop.

**Lich JSON lookup (MapPanel primary match):**
```
roomId !== undefined → lichDb.get(roomId)   // direct O(1) hit
  fallback → findRoom(titleIndex, title, desc)
```

`lichTitle()` strips any number of leading/trailing brackets from `node.title` before indexing, so both `[Room Name]` and `[[Room Name]]` formats match the clean title the parser emits.

**Genie XML augmentation matching (inside `loadGenie`):**

When Genie XML is loaded, each Genie node is matched to a Lich room to get its coordinates, zone name, and color tag. Matching runs as a multi-pass pipeline; the resulting `GenieAugment.matchConfidence` (`'exact' | 'normalized' | 'alias' | 'zone-prefix' | 'desc-disambig' | 'arc-corroborated' | 'desc-only'`) is surfaced as a chip in the LichGraphView tooltip so testers can spot suspect matches.

**Pass 1** — per-node, four strategies tried in order:

1. **Title match** — `titleIndex.get(node.name)` exact-case, with `normTitleIndex` (keyed by `normalizeMatchKey()` — strip brackets, lowercase, collapse whitespace) as a forgiving fallback. Disambiguates by description overlap on multiple hits.
2. **Alias match** — `noteAliases(node.note)`: pipe-delimited aliases in the Genie `note` attribute; each alias tried against the same lookup.
3. **Zone-prefix construction** — build `"${zone.name}, ${node.name}"` and re-run the lookup; handles the common case where Genie stores short names ("Bulk Materials") while Lich titles are fully-qualified ("Leth Deriel, Bulk Materials").
4. **Description-only fallback** — when Lich and Genie disagree on a title but agree on the description (Lich's "Shard Thief Passages" vs Genie's "Abandoned Building"), look up `descIndex[normalizeDesc(d)]` for each Genie description variant; commit when exactly one Lich room matches, or when multiple match but share an identical title (multi-tile case).

**Pass 2** — arc-destination corroboration, iterated to convergence (`while (pass2Changed)`, bounded by `MAX_ITERS = 8`).

Pass-1 orphans are typically clusters of sibling rooms with identical titles AND identical descriptions (the canonical example is the Engineering Society Workrooms). Pass 2 fingerprints each orphan by its arc destinations: if Genie #X has an arc to Genie #Y, and Genie #Y was matched in Pass 1 to Lich #L, then the *correct* Lich match for #X must be a candidate whose `wayto` contains `#L` as a destination key. The score counts arc-destination overlaps; strict-better wins (ties leave the orphan unmatched — "show nothing" beats "show confidently wrong"). Cascading dependencies in tight clusters (a row of four Workrooms only the outermost of which reaches the main hall) require iteration: the outermost resolves on iteration 1, the next-in becomes resolvable on iteration 2 once its arc points at a now-matched neighbor, and so on.

**Composite zone-prefixed keys (`zonedKey(zoneId, nodeId)`)** — Genie node IDs restart from 1 in every zone, so a bare numeric key collides across zones (Aesry's #712 overwriting Shard's #712 was a real bug). `allGenieNodes` and `genieIdToLich` are both keyed by composite `"zoneId:nodeId"` strings throughout the load and lookup paths. Pass 2's arc-destination resolution uses `orphan.zoneId` as the lookup namespace; cross-zone arcs are out of scope.

Matched nodes are stored in `augments: Map<number, GenieAugment>` keyed by Lich room ID. The full Genie node graph (matched + unmatched) is retained in `allGenieNodes` so the LichGraphView can render Genie-only arcs as dashed fallback edges.

### 19.5 Cross-Zone Index *(historical — MapGraphView, deleted v0.6.3)*

> Retained for context. The Lich-native graph view (§19.15) does not load Genie zones individually; the entire Genie data set is indexed in one pass into `allGenieNodes`/`augments` regardless of which Lich room the player is in.

When a map directory was selected, all XML files were parsed in the background. The index lived in `allZonesRef` (a ref, not state — no re-renders on index updates). An `indexing` boolean state and `indexedCount` number state drove the toolbar indicator (`indexing… (45/120)`). `indexedCount` updated every 5 files during the loop so the counter was reactive without causing excessive re-renders.

The auto-switch effect (`useEffect`) depended on `[roomTitle, roomDesc, zone, indexing]`:
- Skipped while `indexing` was true (avoids searching a partial index)
- Fired when indexing completed — caught the case where the room title arrived before the index was ready
- Checked current zone first; only searched the full index if no match was found locally
- Called `setSelectedPath` to load the matching zone, which triggered `loadZone` via the existing `selectedPath` effect

### 19.6 SVG Rendering *(historical — MapGraphView, deleted v0.6.3)*

> See §19.15 for the LichGraphView SVG rendering pipeline that replaced this section.

**Room markers** — fixed-pixel 10×10px squares at all zoom levels. Game-coordinate size = `px / scale`, so markers stayed constant size as you zoomed. A `useMemo` over `visibleNodes` rendered all nodes with state-driven colours: default parchment-brown → search hit green → path gold → selected blue → hovered tan → current room bright green.

**Current room indicator** — SMIL `<animate>` pulse ring (CSS `r` animation is unreliable in Chromium/Electron), inner glow border, and a crosshair dot visible at any zoom level.

**Arc lines** — drawn center-to-center between visible nodes in the same z-level. Color-coded by exit type:

| Exit type | Color |
|---|---|
| Cardinal (N/S/E/W/etc.) | Warm tan `#8a7050` |
| Vertical (up/down) | Bright gold `#d4a020` |
| Special go/climb exits | Sage green `#6a9060` |
| Hidden (`exit="none"`) | Amber dashed `#8a6030` |

**Pan/zoom** — wheel zoom used an imperative `addEventListener('wheel', h, { passive: false })` instead of React's `onWheel` (which is passive in modern browsers and cannot call `preventDefault`). Drag captured `{tx, ty}` before the state-setter callback fired to avoid a null-ref race when mouseup nulled `dragRef` before the setter ran. (Both patterns survive in LichGraphView.)

### 19.7 BFS Pathfinding

`bfsPath(nodeMap, fromId, toId)` does a standard breadth-first search over the arc graph. Each step emits the `arc.move` string. The auto-walk sends one command every 600 ms via `setTimeout` queued in `walkTimers`. All timers are cancelled on: Stop button click, zone change (`loadZone` calls `cancelWalk()` at the top), component unmount.

Arcs with empty `move` strings are silently skipped — clicking them or encountering them during a walk does nothing rather than sending a blank command.

The pathfinder only traverses the currently-loaded zone's arc graph. Cross-file arcs (where `destination` references a node ID in a different XML file) are not yet followed.

### 19.8 Node Colors & Room Legend

Each node may carry a `color` attribute (hex string, e.g. `#FF00FF`). These are user-defined in the Lich map files and follow an informal-but-consistent community standard for DragonRealms:

| Color | Name | Meaning |
|---|---|---|
| `#FF00FF` | Fuchsia | Transport (portal, throughpoint) |
| `#00FF00` | Lime | Interesting Room (economic, services) |
| `#FF8000` | Orange | Guildleader |
| `#00BF80` | Mint | Auto-Healer |
| `#FF0000` | Red | Shop |
| `#FFFF00` | Yellow | Stat Training |
| `#0000FF` | Blue | Water (swimming required) |
| `#000080` | Navy | Underwater (drowning possible) |
| `#FFBF00` | Amber | Obstacle (roundtime) |
| `#993300` | Sienna | Mining |
| `#008000` | Green | Lumberjacking |
| `#C2B280` | Sand | Ranger Trailhead |
| `#00FFFF` | Aqua | Player Housing |
| `#A6A3D9` | Periwinkle | Shrine (Pilgrim Badge) |
| `#400040` | Eggplant | Depart Room |
| `#800080` | Purple | Favor Altar |

These are stored in the `COLOR_LEGEND` constant at module scope. Colors are normalized to uppercase at parse time (`#ff00ff` → `#FF00FF`) so lookups always match regardless of case in the source file. Some map files contain double-hash typos (`##400040`) which are stripped by `.replace(/^#+/, '#')` during parsing.

**Rendering:** node color drives the SVG box fill. State overrides (current/selected/hovered/path/search) take full priority and replace the color fill entirely. Unknown colors (not in `COLOR_LEGEND`) still render on the map using their raw hex value — only the color legend panel filters them out.

### 19.13 Map Theming

The map panel is fully theme-aware via 18 CSS custom properties prefixed `--map-*`. These are defined in `darkBase` and overridden per-theme in `themes.ts`:

| Variable | Role |
|---|---|
| `--map-bg` | Canvas and SVG background |
| `--map-chrome-bg` | Toolbar, legend bar, detail panel backgrounds |
| `--map-border` | Primary border color |
| `--map-border-subtle` | Z-level bar and inner dividers |
| `--map-text` | Button labels, node labels (hovered/selected), detail text |
| `--map-text-muted` | Hints, search result metadata, ID badges, legend descriptions |
| `--map-btn-bg` | Button and chip backgrounds |
| `--map-btn-border` | Button and chip borders |
| `--map-select-bg` | Dropdown and search input backgrounds |
| `--map-select-color` | Dropdown text, legend name, accent elements |
| `--map-node-fill` | Default room node fill (no XML color set) |
| `--map-node-stroke` | Default room node border (no XML color set) |
| `--map-arc-cardinal` | N/S/E/W arc line color |
| `--map-arc-vertical` | Up/Down arc line color |
| `--map-arc-special` | Special `go`/`climb` arc line color |
| `--map-arc-hidden` | Hidden `exit="none"` arc line color (dashed) |
| `--map-dot` | Background dot-grid pattern fill |
| `--map-current-color` | Current room indicator: pulse ring, crosshair, inner border, center dot, label text (Genie Maps only) |
| `--lich-here-color` | **Lich Map** "you are here" sonar locator — bright accent stroke for the ping rings, solid ring, and bullseye centre dot. Kept independent from `--map-current-color` because Lich Map's white/cream PNG aesthetic and Genie Map's themed-bg aesthetic want different colour choices. Defaults to saturated lime `#00ff80`. (v0.8.2) |
| `--lich-here-backdrop` | **Lich Map** dark contrast halo under the solid ring + bullseye backdrop dot. Guarantees visibility on white/cream Lich tiles. Defaults to `rgba(0,0,0,0.55)`. (v0.8.2) |
| `--lich-here-fill` | **Lich Map** current-room rect fill tint (softer than the ring so the ring stays the focal point). Defaults to `rgba(0,255,128,0.30)`. (v0.8.2) |

**XML node colors are never overridden by theme.** When a node carries a `color` attribute from the map XML, that color is used as-is for the box fill. The `--map-node-fill` and `--map-node-stroke` vars only apply to nodes without an explicit XML color. State overrides (current room, selected, hovered, search hit, walk path) always take priority over both XML color and the CSS vars.

**Current room indicator** — all visual elements of the current-room indicator (SMIL pulse ring, inner rect border, crosshair lines, center dot, and the label text above the node) resolve from `--map-current-color`. Each theme sets this to a color that reads well against its background: green on dark/classic, gold on cleric/trader/commoner, blue on moonmage/paladin/slate, purple on bard, green-teal on empath/ranger, red-orange on barbarian/warriormage, etc.

**Custom theme compatibility** — `applyCustomTheme` merges with `darkBase` before applying, so any custom theme created before the `--map-*` variables were introduced automatically receives the correct dark defaults. New custom themes can override any `--map-*` var explicitly.

**Color legend panel:** toggled by the ▤ button in the bottom bar. Renders as an absolutely-positioned overlay in the top-left corner of the canvas — it floats over the map rather than pushing the canvas down, so compact layouts are unaffected. Only shows colors that appear in `COLOR_LEGEND` (unknown/custom colors are hidden). Each row shows a color swatch, the human-readable name, and the short description. The hex value is shown as a tooltip on hover. Rows are sorted by frequency (most rooms first). Max height is 50% of canvas height with scroll.

### 19.9 Location Unknown Indicator

When a room title is received from the game (player is connected and in a room) but no node is matched in the current zone or any indexed zone, a warm amber strip appears above the canvas:

> ⚑ Location unknown — no room matched · *Room Name, Exact Subtitle*

The strip is hidden while indexing is in progress (to avoid false positives during the initial load) and disappears immediately when a match is found. The `?` badge in the toolbar remains as a secondary indicator showing the unmatched title and description excerpt on hover for debugging.

### 19.10 Stale Path Handling

Map directory and selected file are persisted to `localStorage`. On startup they are restored and validated:

- **Directory not found** — `list-map-dir` IPC returns `null` (instead of `[]`) when `fs.existsSync` fails. `loadDir` detects `null`, clears `mapDir` from state and localStorage, and shows the "Choose a maps folder" prompt.
- **File not found** — `readFile` returns `null` for missing files. `loadZone` detects this, removes `lichborne.mapFile` from localStorage, and resets `selectedPath` to empty — no error overlay, just a silent return to the no-map state.
- Empty directories (valid path, no XML files) still return `[]` and show "No .xml files found" normally.

### 19.11 Label Modes *(historical — MapGraphView, deleted v0.6.3)*

> The 5-mode label dropdown belonged to the deleted MapGraphView. LichGraphView uses a single zoom-gated label rule: the current room always has a bright label; rooms exactly one BFS hop away (tier 1) get a label when `scale ≥ LABEL_ZOOM (1.5)`. Distant rooms surface their name via hover tooltip only.

### 19.14 Map Panel UI Layout

**MapPanel toolbar (outer)** — file-level controls; visible above both views:

| Slot | Content | Condition |
|---|---|---|
| `Lich Map` | View button — switch to image-tile view | db ready or error |
| `Lich Graph` | View button — switch to Lich-native graph view | db ready or error |
| ↺ | Reload Lich JSON database | always when db ready/error |
| location | Current room location or title | after Lich ready |

**Lich Graph subbar** — view-local controls; visible only when Lich Graph is active. Genie folder controls live here (not on the outer toolbar) because Genie data only affects this view:

| Slot | Content | Condition |
|---|---|---|
| Search box | Substring match across the entire Lich DB (≥2 chars) | always |
| `N rooms · H hops` | Visible-room count and current hop scope | room known |
| 📁/📂 | Pick Genie maps folder (filled/open icon) | always |
| ✕ | Clear Genie maps folder | folder set + not loading |
| `Genie N/M` | Progress hint while Genie indexes | loading |
| `NNN matched` | Count of Lich↔Genie augmented rooms | Genie ready |
| `H hops ▼` | Neighborhood scope dropdown (5/8/15/25) | always |
| ◆ | Recenter on current room (preserves zoom) | room known |
| ⊡ | Fit all rooms into view (resets zoom) | always |
| ■ | Stop auto-walk | while walking |

**Genie progress bar** — a thin bar below the outer toolbar fills left-to-right as XML files are parsed. Only shown while loading.

**Mouse wheel zoom** — `useEffect` attaches a non-passive `wheel` listener directly to the SVG element on mount because React's `onWheel` is passive and cannot call `preventDefault()`. Drag captures `{tx, ty}` before the state-setter callback fires to avoid a null-ref race when mouseup nulls `dragRef` before the setter runs.

### 19.15 Lich-Native Graph View (LichGraphView) *(historical — deleted v0.6.6)*

> Shipped v0.6.3 as the architectural successor to MapGraphView; deleted v0.6.6 in favor of GenieMapView (§19.16). The BFS auto-layout produced hairballs in dense districts (Crossing, Shard), and the "trust Lich's wayto cardinals" assumption disagreed with Genie's hand-curated coordinates in clustered zones — producing "type west, marker goes north" misrenders. `LichGraphView.tsx` (1351 lines) and `lichLayout.ts` (215 lines) deleted. The section below is retained for historical context.

#### 19.15.1 Auto-Layout

`autoLayoutLich(rooms, {rootId, cellSize, seedPositions})` is a pure-function BFS room placer driven by Lich's own `wayto` command strings. Each room's outgoing `wayto` is mapped to a cardinal direction offset (`DIR_OFFSETS` table covers n/s/e/w/ne/nw/se/sw/up/down + abbreviations + `climb/go/walk/run/crawl` verb-prefixed variants); the algorithm BFS-walks the graph from the root and places each neighbor at the natural grid offset, falling back to a `COLLISION_WIGGLE` list (8 sub-cell offsets) when the natural cell is occupied. Non-directional moves (`go door`, `climb ladder`) land in the first available wiggle slot adjacent to their source so the connection at least renders nearby.

`cellSize` (default 60, set to `GENIE_PITCH = 40` by LichGraphView so Genie's native room spacing carries through) is multiplied into the returned positions at the end so the renderer can use them directly without an extra multiplier. `seedPositions` (an optional `Map<roomId, LayoutPos>`) lets callers anchor matched rooms at hand-curated coordinates — LichGraphView feeds Genie's `x/y/z ÷ GENIE_PITCH` for every matched room here, so zones with Genie coverage look hand-laid-out while zones without coverage are BFS'd around the seeded anchors.

Returns `{positions, unplaced, bbox}`. `unplaced` collects rooms the placer couldn't fit (non-directional move with every wiggle slot taken) so the renderer can choose between skipping them or clustering them — currently they're silently skipped.

#### 19.15.2 Neighborhood Scope

DR is densely connected — 25 BFS hops can pull in thousands of rooms and produces a hairball. The default scope is 8 hops (`DEFAULT_HOPS`) with a `HOP_CHOICES = [5, 8, 15, 25]` selector in the subbar. `neighborhood(db, rootId, hops)` returns a `Map<id, LichRoom>` containing only rooms within scope — both the layout and the rendering iterate only this subset.

#### 19.15.3 Tier Rendering

`bfsHopDistances()` computes hop distance from the player to every room in scope. `tierForHop(h)` converts that to a 5-step visual tier (0 = current room, 1 = immediate exits, 2 = near, 3 = mid, 4 = far context). Tier drives node size, opacity, stroke width, and whether labels render. Selection/hover/path-walk promote a far room to tier 2 so interactions stay legible.

| Tier | NODE_SIZE | NODE_OPACITY | NODE_STROKE_W | Visual |
|---|---|---|---|---|
| 0 | 24 | 1.0 | 2.5 | Circle + pulsing halo + persistent green label |
| 1 | 16 | 1.0 | 1.4 | Rounded rect; label visible above LABEL_ZOOM (1.5) |
| 2 | 13 | 0.85 | 1.1 | Rounded rect, mildly faded |
| 3 | 9 | 0.55 | 0.8 | Small rounded rect, more faded |
| 4 | 4 | 0.30 | 0.0 | Bare dot — "another room exists here" only |

#### 19.15.4 Edge Rendering

Edges are drawn in two passes per render:

1. **Lich wayto (solid lines)** — for every visible room with a known wayto destination also in scope, draw a center-to-center line. Color by `arcColor(cmd)`: cardinal → `var(--map-arc-cardinal)`, vertical → `var(--map-arc-vertical)`, other → `var(--map-arc-hidden)`. Stroke width and opacity fade by the dimmer endpoint's tier.
2. **Genie arcs (dashed lines)** — only fills GAPS where Genie has an arc but Lich's `wayto` doesn't. The composite-key `genieIdToLich.get(zonedKey(zoneId, arc.destination))` resolves Genie's local arc destination back to a Lich room ID. Dashed style unambiguously signals "Genie knows this exit; Lich's database doesn't" — useful diagnostic for the mapping team.

Drawn-pair dedup uses `[min, max].join('-')` so reciprocal wayto entries are drawn once. Each edge has `pointerEvents="stroke"` and `onMouseEnter`/`onMouseLeave` handlers that set `hoveredEdge` state; a label appears at the midpoint of the hovered edge showing the move command (`(Genie only)` suffix when the source is a dashed Pass-2 fallback).

#### 19.15.5 Genie Augmentation Layer

When Genie data is loaded, four additional visual layers light up:

- **District tints** — for each visible room with a known zone, a soft 38px-radius disk filled at 10% opacity sits behind the node. Overlapping disks of the same zone blend into a cloud shape giving spatial orientation at any zoom. `zoneTintColor()` hashes the zone name to a deterministic HSL hue so each zone keeps the same tint across reloads.
- **Landmark glyph overlay** — `LANDMARK_GLYPHS` maps recognised Genie color hex codes to icons (`$` shop, `+` healer, `★` stat training, `⇆` transport, `⌂` housing, `⚓` depart, `✶` favor altar, `⛏` mining, `T` lumberjacking, `✟` shrine, `⛺` ranger trailhead, `⚠` obstacle, `⚔` guildleader, `!` interesting). Renders centred on tier-≤2 nodes with a white halo so it stays legible over any fill color.
- **Dashed-arc fallback** — Pass 2 edge rendering described above (§19.15.4).
- **Rich tooltips** — `#LichID · Genie #N · matchConfidence chip · zone name · color legend · note aliases`. The confidence chip surfaces only when match was non-exact, naming the strategy that got the match (`≈ case`, `via alias`, `via zone`, `via desc`, `via arcs`, `via desc-only`).

#### 19.15.6 Last-Walked Trail

`trail: number[]` (cap `TRAIL_LENGTH = 8`) is updated by a `useEffect([currentRoom?.id])` that pushes the current room id onto the head, dedupes against the previous head, and slices to length. Trail glows render between zone tints and edges (so edges stay legible on top): linear fade by index, freshest brightest, painted as concentric `var(--map-current-color)` disks at ~18% opacity. The head of the trail is the current room, which already gets its own pulsing halo — the trail loop skips index 0 to avoid double-painting.

#### 19.15.7 Search

Search input in the subbar (≥2 chars) does a case-insensitive substring match against the FULL Lich DB (not just the rendered neighborhood) so the player can find a bank/healer/whatever from anywhere in the world. Results capped at 40.

**Search by room ID (v0.6.5)** — if the query is all digits, an exact `lichDb.get(parseInt(q))` lookup runs and the result (if any) is prepended to the result list. Title substring still runs after for mixed queries.

**Outside-scope feedback (v0.6.5)** — picking a search result whose ID isn't in `layout.positions` (room is outside the current hop neighborhood) sets a transient `searchNotice` toast for 4 seconds above the bottom bar:

> "<name>" is outside the current N-hop scope — selected; raise hops or walk closer to see it on the map.

Selection is still applied so the detail panel populates. Pre-v0.6.5 this case silently no-op'd; users perceived the click as broken.

#### 19.15.8 Zoom Lifecycle

Three separate cases handled with sentinels to prevent the player's chosen zoom from being wiped on every walk:

1. **Initial load** (`hasFittedRef`) — fit-to-view once when layout first becomes ready.
2. **Hops changed** — refit, because the visible set changed dramatically.
3. **Player walked** — recenter (pan only, preserve scale).
4. **Genie augments arrive mid-session** (`hadSeedsRef`, v0.6.5) — fit-to-view exactly once when `seedPositions` transitions from empty → populated. Without this, opening Lich Graph before Genie XML finished loading captured the pure-BFS layout in the initial fit; when seeded positions arrived later, rooms would fly off-screen with the viewport stuck on the old frame.

Mixing all of these in a single `useEffect([layout])` was the original bug: every wayto-driven re-layout fired a refit, wiping zoom.

#### 19.15.9 NEEDS MAPPING Banner

When the game emits a room title but the Lich DB doesn't contain that room ID, a high-visibility amber banner renders above the canvas:

> ⚠ `Lich #1234 not in map` · *Room Title* · `NEEDS MAPPING`

This catches the case where the player has walked into a room the Lich repository doesn't yet know about — actionable for the community mapping effort.

#### 19.15.10 Legend Overlay (v0.6.5)

A floating panel anchored top-left of the canvas, toggled by the `▤` button in the subbar. Per-character persistence under `lichGraphLegend` (boolean) and `lichGraphLayers` (JSON blob). The legend doubles as both reference (sample swatches + glyphs explaining the visual language) and **control surface** (checkboxes that toggle each visual layer on the canvas).

**Sections:**
1. **Header** — title + `reset` button. Reset returns all toggles to `DEFAULT_LAYERS` (all-on); disabled when nothing differs from default.
2. **Room size · distance** (informational) — tier 0–4 sample shapes with hop-count descriptions.
3. **State** (informational) — current / selected / hovered / on-walk-path swatches with the actual fill colors used.
4. **Edges** — solid Lich line, dashed Genie-only line (toggle, shown when Genie data is loaded), gold active-walk line.
5. **Glyphs · backdrops** — `↑↓` vertical exit (toggle), `Aa` adjacent room labels (toggle), trail glow (toggle), district tint circle (toggle, shown when Genie is loaded).
6. **Genie landmark types** (shown only when Genie is loaded) — glyph-overlay toggle followed by the 14 color/glyph pairs plus Water/Underwater (which are colored but un-glyphed).

**Layer toggles (`Layers` type at module scope):**

| Toggle | Default | Affects |
|---|---|---|
| `zoneTints` | on | District tint disks behind nodes |
| `trail` | on | Last-walked breadcrumb glows |
| `landmarks` | on | Genie color glyph overlays ($, +, ★, ⇆, etc.) |
| `verticalGlyphs` | on | ↑/↓ corner indicators for vertical exits |
| `adjacentLabels` | on | Room names above tier-1 nodes at high zoom |
| `dashedEdges` | on | Genie-only fallback edges (Pass 2 dashed) |

`DEFAULT_LAYERS` is the spread base when reading a stored value — new toggles added later don't lose their default for older saves.

#### 19.15.11 Visual Scaling (v0.6.5)

Two glow layers (zone tints, trail) use **world-constant** radii instead of screen-constant. Pre-v0.6.5 these used `radius / s` math, keeping them at constant screen size at every zoom level — which meant zooming out had them dominating the viewport while nodes shrank to dots. Now:

- `zoneTints`: `radius = 25` (world units, was `38 / s`)
- `trailGlows`: `baseR = 12` (world units, was `16 / s`)

At zoom 1 they're slightly smaller than before; at zoom 0.3 they're ~7px on screen, receding into background context exactly when the node they surround becomes a far-tier dot.

#### 19.15.12 Current-Room Rendering (v0.6.5)

Pre-v0.6.5 the current room rendered as a solid green circle with a pulsing halo — which **replaced** the room's Genie color fill and landmark glyph. Standing in a shop showed a green circle with no "$" or red, losing the "what kind of room am I in" signal.

v0.6.5 reuses the standard rounded-rect rendering for the current room (Genie color fill, landmark glyph centered, vertical-exit glyphs on the corner) and adds:

- **Pulsing halo** outside the rect (SMIL `<animate>` on `r` and `opacity`).
- **Bright green stroke** (1.3× normal width) so the rect's border still reads as "you."
- **Accent dot** inside the rect (small `var(--map-current-color)` circle) — but **skipped when a landmark glyph occupies the center** to avoid stacking.

The player can now read three signals simultaneously: "I'm in a shop" (red fill, $ glyph) + "this is me" (halo + green border) + "this room has an up exit" (↑ corner glyph).

### 19.16 Genie Maps View (GenieMapView)

> Shipped v0.6.6 as the architectural successor to LichGraphView (§19.15). File: [GenieMapView.tsx](src/renderer/components/panels/GenieMapView.tsx). Renders Genie XML directly — coordinates come from the XML, no auto-layout, one zone at a time. Mirrors Genie's own `MapForm.cs` rendering pipeline; the maps team has hand-curated zone layouts for 20 years and we use their work as authoritative.

#### 19.16.1 Data Loading

`MapPanel.loadGenie(dir)` reads every `*.xml` from the user's Genie maps folder, calls `parseGenieZone(xml, filename)` on each, and stores the result in a `Map<zoneId, GenieZone>` keyed by the zone's id attribute. Duplicate ids (rare; some festival maps reuse parent zone ids) get a letter suffix (`66a`, `66b`, …). Empty or malformed XML triggers a `<parsererror>` throw inside `parseGenieZone` so the per-file try/catch can skip cleanly — without that check, a broken file silently became a zone with 0 nodes and 0 labels, polluting the loaded set.

`parseGenieZone` extracts:
- Every `<node>`: id, name, descriptions[], x/y/z position, color, note (pipe-delimited aliases), arcs[].
- Every top-level `<zone> <label>`: free-floating landmark text ("Temple of Light", "Stormwill Tower", etc.) with its own position.
- Every `<arc>`: exit, move command, destination id, hidden flag (`hidden="True"` means walkable but not drawn — typically `go portal` arcs whose destinations sit far away and would stretch ugly cross-map lines).

`GenieZone.sourceFile` stores the original filename so cross-zone stub resolution can map from `note="Map66_STR3.xml"` back to the loaded `Map<zoneId>` entry.

#### 19.16.2 Coordinate Conventions

**Critical:** Genie's 8×8 node rect is CENTERED on the XML position, not top-left anchored. Verified against `MapForm.cs:187–193`:

```csharp
public Point ConvertPoint(Point3D oPoint, int iOffset = 0)
{
    var oResult = new Point(oPoint.X * m_Scale, oPoint.Y * m_Scale);
    var m_Offset = GetOffset();
    oResult.X += m_Offset.X - iOffset;   // SUBTRACTS the offset
    oResult.Y += m_Offset.Y - iOffset;
    return oResult;
}
```

`MapForm.cs:1767` then draws `DrawRectangle(borderPen, oWhere.X, oWhere.Y, 8, 8)` where `oWhere = ConvertPoint(n.Position, 4)`. Net effect: rect top-left at `(pos − 4, pos − 4)`, rect center at `(pos.x, pos.y)`. In our SVG, that's `<rect x={node.x - 4} y={node.y - 4} width={8} height={8} />`.

Arcs in Genie are `DrawLine(pen, ConvertPoint(a.Position), ConvertPoint(b.Position))` — no offset, so endpoints land at the XML positions directly (i.e., at the rect centers).

Labels in Genie use `r.X = position.X * scale + offset; r.Y = position.Y * scale + offset` (no subtraction) and `DrawString(text, font, brush, r.X + 1, r.Y + 1)`. Our SVG mirrors: `<text x={l.x + 1} y={l.y + 1} dominantBaseline="text-before-edge" textAnchor="start">`.

Anchoring nodes top-left instead of centered shifts every cluster down-right by 4px and visibly misaligns labels against their rooms (Binu's catch: "the B of Bundles is too far behind the room"). Anchoring labels at the XML position without the +1 puts them 1px off. These offsets matter at the 11–12px font sizes the maps team designed against.

#### 19.16.3 Arc Rendering — Two-Pass Overlay

Arcs render in two passes so dense clusters stay legible:

1. **Under-pass** (opacity 0.7, drawn before nodes) — looks identical to single-pass rendering outside clusters; lines get hidden by rect fills inside them.
2. **Over-pass** (opacity 0.35, drawn after nodes and arcs-overlay, before indicators) — same line data drawn on top of rect fills. Inside a cluster the line shows as a dim trace across rect surfaces all the way to its endpoint. Outside clusters the over-pass is barely perceptible.

Each pass collapses N arcs into 3 SVG `<path>` elements (one per category — see below) via concatenated `M x,y L x,y M x,y L x,y …` segments. A 1500-room zone has ~3000 arcs → 6 `<path>` elements total. Pre-collapse, each arc was a separate `<line>` and Chromium's Layerize cost reached 53% of frame time during pan/zoom; post-collapse it's negligible.

**Arc category coloring** mirrors Genie's `linecardinal`/`lineclimb`/`linego` pen distinction:

| Category | Exit values | Color var |
|---|---|---|
| `cardinal` | n/s/e/w/ne/nw/se/sw and the rest by default | `--map-arc-cardinal` |
| `climb` | `climb` | `--map-arc-vertical` |
| `go` | `go`, `up`, `down`, `out` | `--map-arc-special` |

**Hidden arcs** (`hidden="True"` in XML) are walkable but NOT drawn. BFS pathfinding still uses them; we just skip the render. Typical case: `go meeting portal → 85` from a city gate to a far-away portal room — the line would stretch across the entire map and look like garbage. Genie's maps team marked these `hidden` for that reason; we respect it.

#### 19.16.4 Title Matching

`titleLookup` is a per-zones-load memoized map from string → list of `{ zone, node, isStub }`. Built with two parallel indexes:

- `byTitle`: exact-case keys (`node.name` + non-xml `note` aliases)
- `byNormalized`: keys passed through `normalizeMatchKey()` (bracket-strip, lowercase, whitespace-collapse)

Lookup tries exact-case first, falls back to normalized. Without the normalized fallback, common drift like Lich's `"[Bank]"` vs Genie's `"Bank"` would leave whole clusters invisible to the "you are here" marker.

**Stub preference:** when a title has both stub and non-stub candidates, non-stubs win. A stub is a 1-room cross-zone marker — same title as the real room in the other zone, but with `note` pointing to the other zone's `.xml` filename. Without preference, the marker in zone A could outvote the real room in zone B.

**Description tiebreaker:** Shard has 7 rooms titled "Shard, Moonstone Street" (#78–#85). Title-only matching made the "here" marker stick on whichever was indexed first while the player walked east through #79–#85. `currentLocation` disambiguates by description against `node.descriptions[]` when title has multiple non-stub candidates — **exact `normalizeDesc` equality first, then substring containment** (v0.11.2, B148): stored descriptions are routinely a truncation (first sentence) of the live look, so exact equality alone missed real rooms; the substring step accepts containment in either direction but only when it resolves to exactly ONE candidate and both strings are ≥24 chars (so a generic shared description can't mis-disambiguate). The Lich Map's `findRoom` ([mapTypes.ts](src/renderer/components/panels/mapTypes.ts)) carries the same exact-then-substring logic (B150) so both map views behave identically on its title+desc fallback path.

`roomDesc` and `roomExits` are plumbed through `MapPanel` → `GenieMapView`. Without them, a same-title cluster collapses to the first candidate.

**Inline description capture (v0.11.7, B156).** The description tiebreaker only works if `roomState.desc` is actually populated — and for most of Lichborne's life it wasn't, during normal play. DR streams the room description **inline** in the `main` stream as `<preset id='roomDesc'>…</preset>`, NOT as a `<component id='room desc'>`; the only code writing `roomState.desc` was fed by the sparse component, so the desc was empty/stale and the matcher silently fell to file order across an ambiguous title (40+ "Whistling Wood, Barrows" nodes → wrong room). Now GameWindow's event loop captures any `preset:'roomdesc'` main-segment into a batch-local `batchRoomDesc` and applies it to `roomUpdates.desc` **after** the loop, so it overrides the B121 streamWindow `clear-stream 'room'` that lands later in the same batch on a real entry. (The `<component id='room desc'>` path still works; this just adds the far-more-frequent inline form.) This also feeds the Lich Map's `findRoom` title+desc fallback.

**Exit-set tiebreaker (v0.11.7, B156) — mirrors GenieMaps' own client.** The real GenieMaps client (`Node.Compare`/`CardinalCount`, NodeList.cs) identifies a room by **name + EXIT-SET + description**, all three. Exits are a strong, always-fresh signal (DR sends the compass every room) that survives a stale description while running. The live compass tokens (`roomState.exits`) are canonicalized against each node's directional arcs — every arc EXCEPT `go`/`climb` counts (up/down/out DO count, matching CardinalCount); Genie full-words and DR abbreviations collapse to one token form (`cardinalExitSet`/`liveExitSet`/`exitsEqual`/`exitsSuperset`).

**Graph-adjacency tiebreaker (v0.7.0).** The description tiebreaker fails *while running* if the desc is stale — the game streams room titles with no fresh `<description>` per step. The resolver prefers the candidate joined by a Genie arc to the previously-resolved room (`prevLocationRef`, the breadcrumb, advanced only on a non-null match). You walked here from there, so you are in one of its neighbours.

**Architecture (pure resolver, v0.11.7).** Matching is a module-level **pure function `resolveGenieRoom(pool, normDesc, liveExits, prev, sourceFileToZoneId, staleCount) → { match, staleCount }`** (deterministic, no refs, no side effects — testable against real map XML), driven from a SINGLE effect that owns the breadcrumb (`prevLocationRef`) and the cross-zone hold counter (`staleCountRef`) and advances them in exactly one place after the resolve; `pool` (the title-matched candidate list) is a pure memo and `currentLocation` is `useState` set by the effect. This replaced an impure `useMemo` that mutated `staleZoneCountRef` and read `prevLocRef` as it computed — which double-invoked under React StrictMode (dev) and made the cross-zone hold behave differently in dev vs packaged builds. The effect is idempotency-gated (`lastResolveRef`) so StrictMode's double-mount invoke doesn't advance the refs twice. Do not move resolution back into a memo or mutate refs mid-render.

**Resolution order (v0.11.7):** single-candidate → **description exact (unique)** → **exit-set equality (unique)** → **description substring (unique)** → graph adjacency over the FULL pool (preferring an exit-matched neighbour) → cross-zone stub adjacency → exit-aware conservative cross-zone hold (3-strike escape, but commits immediately when the new-zone guess is exit-corroborated or `prev`'s exits no longer match the live exits) → file order. **Exits are additive, never a pre-filter before adjacency** — narrowing the pool by exits before adjacency excluded the correct neighbour whenever Genie's exit data for a room was imperfect and stranded the marker, so `exitMatched` only picks the best blind guess and corroborates a cross-zone move. The two strong signals (fresh desc + exit set) back each other up for near-100% accuracy and degrade gracefully on stale Genie data. `--stormfront` vs `--genie` is irrelevant — the front-end flag doesn't change the title/desc/exits we receive, so matching on desc+exits works under stormfront.

#### 19.16.5 Cross-Zone Stubs

Stubs are boundary rooms duplicated in adjacent zones. The "stub" version has `note="MapXX_Name.xml"` pointing to the other zone's XML file.

`isStubNode(n)` returns true when any `note` alias ends in `.xml`. Stubs render with a dashed amber border + an `↗` glyph centered on the rect. Hover tooltip shows the resolved target zone name (`↗ Cross-zone exit → Shard`) when that zone is loaded.

**Stub click behavior:** runs BFS from the player's current room to the stub via in-zone arcs, sends the move commands. Does NOT switch the displayed zone on completion. The reason: walk commands fire blindly on a timer; if the game blocks any of them (roundtime, locked door, missing key), the timer still ticks and the zone switch would race ahead, leaving the player stranded in the old zone with the UI showing the new one. The auto-zone-switch effect (driven by `roomTitle` matching a room in a different loaded zone) is the authoritative signal for "actually arrived in the new zone."

#### 19.16.6 Camera Follow

`followPlayer: boolean` state, default ON. The follow-the-player effect (`useLayoutEffect`) re-centers the viewport on the current room every time the location changes. Manual pan/zoom turns follow OFF automatically (so the map doesn't fight the user); the `◆` button turns it back ON and recenters.

**Gating on `followNode`, not raw equality checks.** The follow effect derives `followNode = followPlayer && currentLocation.zone.id === currentZoneId ? visibleById.get(currentLocation.node.id) : undefined` — the *same* `visibleById` lookup the current-room indicator uses. Earlier the effect ran its own zone/level equality checks, which could diverge from the indicator's gate by one render (marker visible, camera bailed). Sharing the lookup guarantees "marker visible" ⇔ "camera following." The effect also schedules a one-frame `requestAnimationFrame` retry if `svg.clientWidth` reads 0 mid-layout.

**Inactive-tab handling (v0.7.0).** An inactive character's GameWindow is `display:none`, so its map SVG measures **0×0** — `clientWidth`/`clientHeight` read 0. The character keeps travelling in the background (events still process), but the follow effect can't compute a transform, so the camera goes **stale**; tab back and the player is off the side, camera in a corner (B88). Two parts: (1) every layout-reading camera path (`followNode` effect, `centerOnCurrent`, `fitToView`) **bails on `!w||!h`** so it never writes a garbage transform from a 0 viewport; (2) a `ResizeObserver` on the SVG recenters on the player when the box transitions 0→non-zero (tab shown again) — and on genuine panel resizes, when following. The follow effect alone can't cover this: it only fires on a *move*, and the player may have stopped while the tab was hidden. **The observer is wired in the SVG callback ref (`setSvgRef`), not a mount-time `useEffect`** — the SVG mounts only after the Genie-loading early-return clears, so an effect would see a null ref and never attach (the B58 trap; the wheel handler is wired the same way for the same reason). General rule for multi-character map code: hidden ≠ unmounted, but hidden = unmeasurable.

**Why `useLayoutEffect` not `useEffect`:** the transform update must land in the same paint frame as the indicator's new world position. With plain `useEffect`, the indicator paints one frame at its new world coord with the OLD camera, then re-renders next frame with the new camera. `useLayoutEffect` runs after the render commit but before paint, so the second render lands synchronously.

**Why always-center (not margin-snap):** earlier implementation only panned when the indicator approached a 15% safe-margin edge. At fast walk rates each step pushed the indicator just outside the margin and the camera snapped back, producing a visible vibration. Always-centering means each camera delta exactly matches the player's world delta.

**Smooth camera motion.** The pan group is positioned with the CSS `transform` *property* (not the SVG `transform` attribute) so it can be CSS-transitioned. `.genie-pan-smooth` applies `transition: transform 150ms linear`; follow walks and wheel zoom slide between positions instead of snapping. `linear` is deliberate — a follow camera re-targets every walk step, and an ease-out curve resets its velocity profile on each restart, producing a visible accelerate/decelerate pulse. The class is suppressed while `isDragging` so manual drag stays 1:1 with the cursor. It is gated on the **`mapAnimations`** setting (Settings → Genie Map Animations, default on): both the pan group and the indicator only get `.genie-pan-smooth` when `!isDragging && mapAnimations`, gated together so they stay in lockstep — when off, both snap. (v0.6.8–v0.6.11 gated this on a separate `smoothScroll` setting shared with the now-removed story-window smooth scroll; v0.6.12 removed that setting and folded the map glide under `mapAnimations` — one switch for all Genie map motion.)

**Snap-on-large-delta.** A 150ms transition visibly "races across" the screen on a big jump. `snapTransform` is a render-time delta check (Euclidean > 600px OR scale change > 20% vs `prevTransformRef`, the last *painted* transform, updated in a post-commit `useEffect`). When true, an inline `transition: none` drops the transition for that one update — zone switches, ◆-from-afar, and fit-to-view cut instantly; walk steps and wheel zoom stay smooth.

#### 19.16.7 Indicator Layers

Five indicator types, all hoisted OUT of `nodeRects` as single overlay elements so they re-render independently of the per-zone-static node array:

| Indicator | Element | Trigger |
|---|---|---|
| Current room | `<g>` — sonar pings + dark backdrop ring + bright `--map-current-color` ring | `currentNodeId` change (walking) |
| Selected / pinned | `<rect>` gold outline | left-click on any room |
| Hover | `<rect>` soft white outline | mouse enter on a room |
| Hover path preview | `<path>` bright green line tracing the BFS route from player to hovered room | hovered room changes; player moves |
| Pinned path | `<path>` gold line tracing the BFS route from player to the left-clicked room | `selectedId` set; player moves |

Pre-hoist, all were inline children of each per-node `<g>`, so changing the current room rebuilt the entire `nodeRects` array. On a 1500-room zone that was the rapid-walk stutter source. Post-hoist, walking only re-renders the indicator elements.

**Current-room indicator (v0.6.8).** Solid ring radius `INDICATOR_R = NODE_SIZE * 1.3125`. The `<g>` is structured: two **sonar-ping** circles (`genie-here-ping`, a CSS keyframe scaling 0.7→2.7× while fading; the two are staggered half a cycle via `--delayed` so a fresh ring emanates ~every 1s), then a dark backdrop ring, then the bright green ring on top. `non-scaling-stroke` keeps the expanding pings thin as they grow. The pings are exempt from the drag/motion animation-pause via a higher-specificity rule (`.genie-pan-dragging .genie-here-ping` beats `.genie-pan-dragging *`) — the locator is the one thing the user most wants to keep tracking.

**Indicator transition lockstep.** The indicator `<g>` lives inside the pan group and carries its OWN `genie-pan-smooth` transition on a `translate(node.x, node.y)` transform. With only the pan transitioning, the halo sat off-centre for 150ms after each walk step then slid back ("bounce"). Giving both the same matched transition makes the interpolations cancel — `lerp(panA,panB,f) + lerp(roomA,roomB,f) = centre` for all `f` — so the halo stays pinned at screen centre while the map slides beneath it. `indicatorSnap` (a world-distance large-jump check, > 120 units) is ORed with `snapTransform` for the indicator so it also snaps on follow-off teleports where the pan delta is zero.

**Backdrop ring** — single-colour halo dissolved into similarly-coloured adjacent rooms. Translucent dark ring + bright stroke gives unconditional contrast.

**Hover indicator (soft white)** is distinct from gold (selected) and green (current).

**Hover path preview** runs `bfsZoneRoomPath` from `currentLocation.node.id` to `hoveredId`. **Pinned path** does the same from the player to `selectedId` and persists across mouse moves (gold, vs the green hover preview). Both recompute as the player walks so the route shrinks on approach.

#### 19.16.8 Tooltip

Block-built conditional tooltip:

- Bold room name
- `Map {zoneId}: {zoneName} · Room #{nodeId}`
- Cross-zone callout for stubs: `↗ Cross-zone exit → {targetZoneName}` (resolves stub's `.xml` note via `sourceFileToZoneId` map)
- Color category if room has a recognized `COLOR_LEGEND` color: swatch + name + description (e.g. `■ Red — Shop`)
- Aliases: pipe-delimited `note` entries minus `.xml` markers
- Exits: deduped list of arc exit/move strings
- Action hint at bottom — two lines spelling out the left/right-click bindings (regular room: "Left-click: pin path / Right-click: walk here"; stub: "Left-click: go to {zone} / Right-click: walk to boundary"). Shown only when click is meaningful — player in this zone, hovering a different room.

Each section is conditional so unset fields don't render an empty line.

#### 19.16.9 Click Model — Left-click pins, right-click walks (v0.6.8)

Two handlers on each node `<g>`. The SVG root has `onContextMenu={preventDefault}` so right-click never shows the OS menu.

`onNodeClick` (**left-click**):
- **Regular room:** toggles `selectedId` — sets it (pins a path) or clears it if it was already this room. Does NOT walk. The pinned BFS path renders as a gold overlay (`pinnedPathSegs`), auto-clearing on arrival / zone change / level change.
- **Stub:** switches the displayed zone to the stub's target XML. Resolves the *reciprocal entry room* (the target zone's stub pointing back to the source zone) and centres on it at the current scale; pre-sets `lastFitRef` so the fit/center effect doesn't zoom-to-fit; sets `followPlayer = false` (the user is browsing now — `◆` re-enables follow and yanks the view back to the player).

`onNodeContextMenu` (**right-click**): walks to the clicked node. `preventDefault` + `stopPropagation`, then BFS within the current zone and `sendWalkPath`. For a stub this walks to the boundary room (the stub IS a real room in the current zone). Cross-zone click-to-walk is NOT supported — Genie arc destinations are zone-local IDs; the map auto-switches zones via the title-match effect once the player actually crosses.

`sendWalkPath(commands, onComplete?)` clears any in-flight timers, then schedules each command at `WALK_STEP_MS` (600ms) intervals via `setTimeout`.

Walk timers are cleared on zone change AND on unmount. Level change does NOT clear walk timers — paths can legitimately include up/down arcs. Walk commands echo to the game window as `>cmd` lines via `sendCommand`.

Walk timers are cleared on zone change AND on unmount. Level change does NOT clear walk timers — click-to-walk paths can legitimately include up/down arcs.

Walk commands are echoed to the game window as `>cmd` lines via `sendCommand` in `GameWindow.tsx`. Same code path as typed commands, quick-send, room-exit clicks, and in-text command links — they all share the `command-echo` preset.

#### 19.16.10 Rendering Layer Order

Inside the SVG `<g transform>` pan/zoom group:

1. `arcPathsUnder` — arc paths at opacity 0.7
2. `labelTexts` — free-floating landmark labels (gets covered by nodes when they overlap)
3. `nodeRects` — 8×8 room rects with stub glyphs
4. `arcPathsOver` — arc paths at opacity 0.35 (faint trace through rects)
5. `pinnedPathIndicator` — gold BFS line to the left-clicked room
6. `hoverPathIndicator` — green BFS preview line
7. `hoverIndicator` — soft white rect outline
8. `selectedIndicator` — gold rect outline
9. `currentIndicator` — sonar pings + dark backdrop + bright halo ring (LAST so it paints over everything)

#### 19.16.11 Layout Quirks Worth Knowing

- **First-render auto-zone-switch** requires `lastLocationRef` initialized to `null`, not `useRef(currentLocation)`. The latter makes the ref equal to `currentLocation` on first render, and the effect's `===` equality check bails before applying the initial location. Symptom: open the map after the game's already connected, and the displayed zone stays empty until the user clicks ◆.
- **Hover state must clear on level change**, not just zone change. Hover/select IDs persist through level switches; if the new floor has a room with the same numeric id, the highlight silently jumps to that unrelated room. The cleanup is split: zone change clears walk timers + UI state, level change clears UI state only (walk paths can legitimately cross levels).
- **`pointer-events: none` on the pan group breaks click-to-walk.** `isDragging` flips true on mousedown BEFORE click fires, so toggling pointer-events at that point makes the click target the SVG root, not the inner node `<g>`. Hover is gated at the React layer (`dragRef.current` check in `onNodeHoverEnter`) instead.
- **`will-change: transform`** on the pan group promotes the subtree to its own composited layer so pan/zoom is GPU-translated rather than triggering paint of siblings.
- **No inline `height: 100%` on the `GenieMapView` outer wrap.** It carries `.map-canvas-wrap` (`flex: 1; min-height: 0`) plus inline `display: flex; flex-direction: column`. An inline `height: 100%` overrides the flex sizing and — evaluated against the parent's *full* height before the parent subtracts its own toolbar — pushes the MapPanel's view-selector toolbar off-screen at narrow window heights. Let CSS flex own the height.
- **Pan group + indicator must transition in lockstep.** Both carry `.genie-pan-smooth` and share the `snapTransform` flag. If they used different easings or one snapped while the other transitioned, the "you are here" halo would bounce off-centre or slide while the map cut. See §19.16.7.

### 19.17 Per-Color Effect System (v0.6.7)

> Shipped in v0.6.7 as the visual-identity layer on top of the bare GenieMapView rendering. Every COLOR_LEGEND category gets its own animated effect signature so a player can recognize "what kind of room is this?" without consulting the legend. Implementation pattern is uniform across categories; adding a new effect is a 4-step recipe.

#### 19.17.1 Effect Families

Each category falls into one of these structural families:

| Family | Implementation | Categories |
|---|---|---|
| **Magical motes** (small drifting circles) | 3-4 `<circle>` per node with motif-specific keyframes | Transport (vortex), Shrine (drift), Favor Altar (rise-slow), Stat Training (rise-fast) |
| **Stroke pulse** (animated stroke around the rect) | One `<rect>` overlay with animated opacity | Healer (heartbeat ECG), Obstacle (caution blink) |
| **Perimeter glint** (dash sliding around the rect border) | `<rect>` with `stroke-dasharray` + animated `stroke-dashoffset` | Shop (coin glint) |
| **Concentric rings** (expanding or contracting circles) | 2-3 `<circle>` with `transform: scale` animation | Water (outward ripples), Depart (inward implode) |
| **Falling particles** (downward stream from below the rect) | 3 `<circle>` per node animating `translateY` positive | Lumberjacking (leaves with wobble), Mining + Trailhead (dirt straight-down) |
| **Rising particles** (upward stream from below the rect) | 2 `<circle>` per node animating `translateY` negative | Guildleader (XP rise) |
| **Underwater bubbles** | 2 `<circle>` rising with a scale "pop" at the top | Underwater |
| **Aura modifier** (modifies the aura rect's animation or size) | CSS class applied to the aura rect | Interesting Room (fire flicker + 1.3× size), Housing/Guildleader (intensified static aura) |
| **Static glyph** (centered text on the rect) | `<text>` element with the icon character | Mining (⛏), Lumberjacking (🪓) |

#### 19.17.2 Pattern for Adding a New Effect

1. **Declare a color set** at the top of `GenieMapView.tsx`:
   ```typescript
   const NEW_EFFECT_COLORS = new Set<string>(['#XXXXXX'])
   ```
2. **Add a memo** in the component body, in the layer-order section. Filter `visibleNodes` by the set, return an array of SVG elements (one or more per matching node). Memoize on `[visibleNodes]` only — the animation lives in CSS.
3. **Add a CSS keyframe** in `map-panel.css`:
   ```css
   @keyframes genie-new-effect {
     0%   { ... }
     100% { ... }
   }
   .genie-new-effect {
     animation: genie-new-effect Xs <easing> infinite [backwards];
     transform-box: fill-box;
     transform-origin: center;
   }
   ```
4. **Render at the correct layer** in the SVG tree — aura layer for backgrounds, between `nodeRects` and indicators for room-level effects, between `arcPathsOver` and indicators for over-rect effects.

#### 19.17.3 Layer Order

Inside the SVG `<g transform>` pan/zoom group, the current order is:

1. `auras` — translucent color halos behind colored rooms (always-on layer for any COLOR_LEGEND room)
2. `arcPathsUnder` — full-opacity arc passes (cardinal / climb / go)
3. `labelTexts` — floating landmark labels (Temple of Light, etc.)
4. `nodeRects` — 8×8 room rects (with stub `↗` glyph and tool ⛏/🪓 glyphs as children)
5. `arcPathsOver` — faint over-pass arc traces through rect fills
6. `sparkles` — magical motes (Transport / Shrine / Favor Altar / Stat Training)
7. `heartbeats` — Healer ECG pulse
8. `coinGlints` — Shop perimeter dash
9. `ripples` — Water outward rings
10. `bubbles` — Underwater bubbles
11. `cautionRings` — Obstacle blink
12. `implodes` — Depart inward rings
13. `leafFalls` — Lumberjacking
14. `dirtFalls` — Mining + Trailhead
15. `xpRises` — Guildleader
16. `hoverPathIndicator` — BFS preview line
17. `hoverIndicator` — soft white rect outline
18. `selectedIndicator` — gold rect outline
19. `currentIndicator` — green halo (always last so it paints on top)

#### 19.17.4 Contrast-Aware Mote Color

`getMoteContrastColor(hex)` measures relative luminance (ITU-R BT.601: `0.299r + 0.587g + 0.114b`) of the room's color and returns a CSS `color-mix()` expression that pulls toward white for dark backgrounds (Transport `#FF00FF`, Favor Altar `#800080`) or toward dark for light backgrounds (Shrine `#A6A3D9`, Stat Training `#FFFF00`). The original "always pull toward white" formulation made magical motes invisible on the light-tinted categories — pale pink motes on pale lavender room background is invisible. Threshold at luminance 0.5; mix ratio 25%-color for dark→light, 35%-color for light→dark.

#### 19.17.5 Named-Color Normalization

Some Genie XML files use CSS color names instead of hex codes:

```xml
<node id="737" name="House of the Silk Strings, Lotus Pond" color="Blue">
```

The five names that appear in real maps: `Aqua`, `Blue`, `Lime`, `Red`, `White`. `parseGenieZone` runs `normalizeNodeColor()` over every node's color attribute, converting recognized names to canonical uppercase hex. Pre-normalization the rect's SVG `fill` still worked (CSS accepts named colors) but every effect lookup keyed by hex silently missed these rooms — room 737 was rendering as a plain blue rect with no ripple effect despite being a Water room.

#### 19.17.6 Particle Color Per Room

For effect families shared across multiple room categories (currently only `dirtFalls`, shared by Mining and Trailhead), the particle color is picked per-room via a small helper rather than being baked into the memo:

```typescript
function dirtParticleColor(roomColor: string): string {
  return roomColor === '#C2B280' ? '#a08858' : '#b06030'
}
```

Mining gets warm rusty-brown; Trailhead gets sandy tan. The original Mining color `#4a2810` was too dark to read against the dark map background — testers couldn't see falling particles at all on mining rooms. Brighter rust-brown solved it.

#### 19.17.7 Tool Glyphs

`TOOL_GLYPHS: Record<string, string>` maps category hex → emoji/text glyph:

- `#993300` → `⛏︎` (Mining pickaxe, U+26CF)
- `#008000` → `🪓︎` (Lumberjacking axe, U+1FA93)

Trailing **U+FE0E** (text variation selector) forces text-style rendering in browsers that might otherwise render these as colored emoji. The glyph renders as a child of the per-node `<g>` in `nodeRects`, but only when the room is NOT a stub — stubs preempt the slot with `↗` because cross-zone identity is more important than resource category. Font size 5px (half the stub glyph's 10px) so the tool reads as a category marker, not a category banner.

#### 19.17.8 Performance — Animation Pause + Parse Cache

The per-color effect system introduced enough sustained animation work to dominate frame budget on dense zones. Two targeted optimizations:

**Pause during interaction (transient).** The pan group `<g>` gets the `genie-pan-dragging` class when `isDragging || inMotion || zooming` is true. The CSS rule pauses by **enumerating the animated classes as descendants** — `.genie-pan-dragging .genie-ripple, .genie-pan-dragging .genie-mote-drift-n, …` — never `.genie-pan-dragging *`.

> **The wildcard was the v0.18.5 perf bug (B263) — do not restore it.** Blink derives a style invalidation set per selector: `.a .b` invalidates only descendants carrying `.b`, while `.a *` invalidates the entire subtree. With ~1057 room groups under the pan group that meant a full-subtree style recalculation on *every toggle* of the class — and because `inMotion` flips on every room change, walking toggled it continuously. Style recalc is main-thread, so it stole frames from the text pipeline in the same renderer. Full write-up: CLAUDE.md pitfall #126.

- `isDragging` flips true on mousedown, false on mouseup. Pauses animations during manual pan/zoom.
- `inMotion` flips true on any `currentLocation` change and a `MOTION_QUIET_MS = 800` timer resets. When 800ms elapse with no further walk, `inMotion` flips back to false. Pauses animations during sustained player walking.

The locator sonar ping is **exempt** from this transient freeze — you still want to see yourself mid-walk. Since v0.18.5 that exemption is expressed by **omission**: `genie-here-ping` (and `genie-heartbeat`) simply aren't in the transient rule's selector list. The old `{ animation-play-state: running !important }` counter-rules existed only to win back against the wildcard and are gone. An exemption that can't be out-specified is one fewer specificity duel to lose later.

Why: Chrome DevTools profiling showed Layerize ~33% + Recalculate Style ~22% + Paint ~14% during drag, and Layerize ~17% + Recalculate Style ~16% + Layout ~11% during cross-map walking — all attributable to continuously-running animations the user wasn't stationary long enough to appreciate during those scenarios. Pausing frees frame budget for transform updates and React reconciliation.

**Pause permanently (opt-out setting, v0.6.9).** `settings.mapAnimations` (Settings → Genie Map Animations, **default on**) threads to `GenieMapView` as the `mapAnimations` prop. When off, the pan group instead gets a distinct `genie-anim-off` class, which enumerates the animated classes the same way the transient freeze does (v0.18.5 — see the note above) but applied permanently. Unlike the transient class it covers **every** animated class, ping and heartbeat included: "off" stops the sonar ping too. Its list is kept comprehensive even where entries are inert today (most aren't mounted while the setting is off), because `genie-heartbeat` and `genie-aura-fire` already render outside the `showEffects` gate and the next effect to do so would silently escape a list pruned to "what is mounted right now". The two freeze classes are mutually exclusive on the pan group (`!mapAnimations ? 'genie-anim-off' : (isDragging || inMotion) ? 'genie-pan-dragging' : ''`), so there is no specificity duel between the ping-pause and the ping-exemption rules. Effect *elements* stay in the DOM — only paused, not removed — so a cold mount with the setting off freezes them at their 0% keyframe (fade-in effects like motes therefore read as absent rather than static).

**Why class-based, not pointer-events.** Earlier attempts toggled `pointer-events: none` on the pan group during drag for hit-test savings, but that shifts the click-target off the inner node `<g>` (mousedown sets `isDragging` true *before* `click` fires), silently breaking click-to-walk. The animation-pause class doesn't have this hazard because it only affects animation execution, not event routing.

**Omit, don't pause — and cap to the viewport (v0.7.0).** The pause classes above were not enough (B86): `animation-play-state: paused` stops an animation *advancing* but leaves the element layer-promoted, and traces during travel still showed Layerize ~21% from that residual layer churn. Two structural changes:

- **Effects are omitted from the DOM, not paused.** The 10 animated effect groups (sparkles, heartbeats, coin glints, ripples, bubbles, caution/implode rings, leaf/dirt falls, XP rises) render only when `showEffects = mapAnimations && !isDragging && !inMotion`. While travelling/panning/off they are *not mounted* — no elements, no layers, no Layerize/Paint/Recalculate Style. They re-mount once the player has been still for `MOTION_QUIET_MS` (lowered 800 → **600ms**: long enough to ride through a sub-600ms running cadence without re-mount churn, short enough to feel responsive on stop; the mount is cheap now that the set is viewport-capped).
- **Viewport culling.** The effect memos iterate `nearbyNodes` — the rooms inside the current pan/zoom rectangle, with `EFFECT_CAP` (30) as a backstop for zoomed-far-out views — instead of every COLOR_LEGEND room in the zone. Idle-in-the-Crossing was ~29% Recalculate Style with all ~150 colored rooms animating; capping to what's on screen bounds it regardless of zone density. `nearbyNodes` returns the stable `EMPTY_NODES` ref while effects are off, so the effect memos don't even recompute during travel.

The `genie-pan-dragging` / `genie-anim-off` classes still exist — they now cover only what *stays* rendered: the sonar ping and the static/fire auras. **Healer heartbeats are a priority effect** — rendered zone-wide (full `visibleNodes`), outside the `showEffects` gate, and CSS-exempt from the travel freeze (omitted from the transient rule's selector list, so nothing pauses it), so a healer is always findable; healers are rare, so always-on is cheap. Node **hover is suppressed during motion** (`onNodeHoverEnter` checks `inMotionRef`) — the map scrolling under a stationary cursor otherwise fires a pointer enter/leave storm.

**Parse cache.** Initial Genie parse takes several seconds for a 122-XML folder. `genie-cache:load` / `genie-cache:save` IPC handlers (defined in `main.ts`) serialize the parsed `Map<zoneId, GenieZone>` to `userData/genie-cache.json` and verify a fingerprint (sorted `filename:mtimeMs:size` segments joined with `|`) on subsequent loads. If the fingerprint matches: skip the file-read loop entirely, `JSON.parse` the cache, hand the renderer a ready zones map in ~50ms.

Invalidation triggers:
- Any XML in the folder added/removed/modified/replaced (fingerprint diff)
- Selected folder path differs from the cached `dir` field
- `GENIE_CACHE_VERSION` constant bumps (used when the `GenieZone` shape changes; old caches invalidate automatically without manual cleanup)

The cache file is single-blob JSON (~2-5 MB depending on folder size); loaded as one file read and one `JSON.parse` call. Cache write is fire-and-forget after parse — failure logs to console but doesn't block the user from seeing the freshly-parsed map.

#### 19.17.9 Aura Variants

Aura is a 1.125× translucent rect behind every COLOR_LEGEND room. Two variants:

- **`AURA_INTENSIFIED_COLORS`** (Guildleader) — opacity 0.28 instead of 0.15 (`auraScale` stays at 1.125×)
- **`AURA_FIRE_COLORS`** (Interesting Room) — opacity is owned by `@keyframes genie-aura-fire` (irregular flicker between 0.15 and 0.55), AND `auraScale` jumps to 1.3× so the larger diffuse area lets the flicker read as firelight rather than a tight color band

Player Housing (`#00FFFF`) was in `AURA_FIRE_COLORS` (hearth-glow flicker) through v0.6.x; **removed v0.7.0** — housing rooms are everywhere, so a flicker on each was visual noise. It now takes the plain default aura, like Ranger Trailhead (`#C2B280`), which was always plain. Auras are static (no per-frame cost) so they are NOT viewport-culled — they render zone-wide as the colour key.

When an animated aura class is applied, the `opacity` SVG attribute is omitted (`undefined`) so CSS owns opacity unambiguously — having both an attribute and a CSS animation on the same property creates browser-inconsistency.

### 19.12 Future Work

| Item | Notes |
|---|---|
| World map (F13) | Continuous multi-zone SVG — the Lich-native layout already runs over the entire reachable graph in principle; F13 reduces to raising `DEFAULT_HOPS` past the practical visual limit and adding zoom-aware culling so the hairball stays usable. Spec in §25.8 Phase 2. |
| Exit stubs | Draw short stubs from room edge rather than center-to-center (Genie convention); cleaner at high zoom |
| Configurable walk delay | 600 ms/step is hardcoded; expose as a setting |
| Room notes / bookmarks | Player-added per-room annotations persisted locally |
| Diagonal walls (one-way arrows) | Lich `wayto` is directional; render arrowheads on edges where the reciprocal entry doesn't exist |
| Seed-conflict reconciliation | When two Genie nodes seed the same Lich room (or vice versa), the layout currently picks the first; a deterministic tiebreaker on confidence chip would be clearer |

---

## 20. Profile System

> Status: v2 (dynamic) — shipped in v0.6.0 as part of Release E1. v1 migration code removed in v0.6.1; tester upgrade path is to wipe `profiles/` (Lichborne re-creates them on next login).

### 20.1 Overview

The profile system provides portable, file-based persistence for all character and application settings. Each character's configuration is stored in a YAML file inside a `profiles\` folder in the installation directory. Copying the installation folder to another machine carries all profiles with it.

**Design principles:**
- YAML files are the source of truth — `localStorage` is the live runtime working copy.
- Per-character `localStorage` keys live under the scope `lichborne.{character}.{suffix}` (see `characterScope.ts`) so multiple characters running concurrently in one app instance never collide. Shared keys (account, advancedSettings, mapDir, myThemes) stay unnamespaced.
- The character YAML's `state:` map mirrors `lichborne.{character}.*` 1:1. Adding a new per-character setting requires only writing to its scoped key via `useProfileSaver()` — the profile system picks it up dynamically with no further plumbing.
- Atomic writes (`.tmp` + rename) and rolling backup on graceful shutdown (`{name}.yaml.bak`) protect against corruption from mid-write crashes.
- Per-character debounced saves use a `Map<character, timer>` so two concurrent characters never race their YAML writes.
- Defense-in-depth on graceful shutdown: `App.tsx` exposes `window.__flushProfileSaves` which fires every pending debounced timer AND unconditionally saves every active character's profile. Catches any per-character `setItem` that didn't trigger `scheduleProfileSave` directly.

### 20.1a `useProfileSaver()` hook

Lives at `src/renderer/hooks/useProfileSaver.ts`. Returns a stable `saveProfile()` callback bound to the current character's session info (account/character/game/useLich looked up from `SessionsContext` via a ref so the callback identity doesn't churn when other tabs update their status).

**Usage pattern** — every per-character `localStorage.setItem(scopedKey(...), value)` call site is paired with `saveProfile()`:

```ts
const saveProfile = useProfileSaver()

function handleThingChange(next: string) {
  setThing(next)
  localStorage.setItem(scopedKey(character, 'thing'), next)
  saveProfile()
}
```

This guarantees the change reaches the YAML within the 2.5s debounce window — crash-resilient even before the graceful-shutdown defense kicks in. Sites using it: `GameWindow` (streamTimestamps, top/mid/bottom tabs + active IDs, panel sizes during drag + reset), `ExpPanel` (sort mode, sort direction, focus mode), `MapPanel` (view mode), `MapGraphView` (label mode, Z-level filter, legend toggle, showAllZ).

---

### 20.2 Storage Structure

```
<userData>\
  profiles\
    _shared.yaml       — machine-level, shared across all characters and accounts
    Sekmeht.yaml       — per-character profile
    Binu.yaml
    ...
```

**Dev mode:** `profiles\` is relative to the project root (`app.getAppPath()`).
**Production (v0.6.4+):** `profiles\` is inside Electron's `userData` directory (`app.getPath('userData')` = `%APPDATA%\lichborne\profiles\` on Windows — lowercase because Electron's `app.getName()` reads the top-level `name` field in package.json, not the `build.productName` field which only affects installer-side display). userData lives outside the install footprint, so the NSIS uninstaller never touches it — profiles survive upgrades, reinstalls, and version downgrades. Uninstalling Lichborne with `deleteAppDataOnUninstall: false` (the default) preserves them.
**Pre-v0.6.4 location:** `<install-dir>\profiles\` (next to the exe). The NSIS upgrade flow ran the previous version's uninstaller before extracting the new build, which removed everything from `$INSTDIR` including `profiles\` — every upgrade silently wiped user state. The original "travels with the installation" intent never actually held because installers don't preserve install-dir content across upgrades.
**Two-stage migration (v0.6.4):**

1. **Installer-time (NSIS `preInit` hook in [build/installer.nsh](build/installer.nsh))** — runs in `.onInit` BEFORE the previous version's uninstaller is invoked. **Three subtle correctness requirements**, all of which the first v0.6.4 attempt got wrong:
   - **Use `preInit`, not `customInit`.** electron-builder's `customInit` macro is inserted AFTER the previous uninstaller runs, which means `$INSTDIR\profiles\` has already been wiped by the time it fires. `preInit` is the only hook that runs early enough to rescue files.
   - **`$INSTDIR` is not set at `preInit` time** — the install-location lookup (`findExistingInstallLocation`) runs later. The hook reads the previous install dir from `HKCU\Software\${UNINSTALL_APP_KEY}` directly (then `HKLM` as fallback) and uses that as the source path.
   - **Destination case must match `app.getName()`** — `$APPDATA\lichborne\profiles\` (lowercase). Capitalizing would create a folder Electron never looks in. (Windows file systems are case-insensitive in practice, but `shell.openPath` and explorer dialogs display the established case.)

   When all conditions hold (legacy dir has `*.yaml`, destination is empty), `CreateDirectory` creates the destination recursively (also creates `$APPDATA\lichborne\` parent if missing), then `CopyFiles /SILENT` copies `*.yaml` and (separately, gated by `FileExists` because `CopyFiles` errors on a no-match source pattern) `*.bak`.
2. **Runtime ([profiles.ts:migrateLegacyProfilesDir](src/main/profiles.ts))** — runs once on first `getProfilesDir()` call. Same conditions, same source/destination paths. Belt-and-suspenders: catches users who installed via a non-installer path (portable copies, manual file placement, backup restores) where the NSIS hook never ran. Idempotent — once the userData location has any YAML, this is a no-op.

The legacy directory is left in place by both stages — manual cleanup after the user verifies. Users who already upgraded v0.6.2 → v0.6.3 BEFORE v0.6.4 shipped had their legacy directory wiped by NSIS without the rescue hook in place; their data is unrecoverable from Lichborne itself, though their last `.yaml.{timestamp}.bak` files (if any survived elsewhere) can be hand-restored.
**Git:** `profiles/` is listed in `.gitignore` — account names, Lich paths, and personal config never end up in the repository.

---

### 20.3 File Responsibilities

#### `_shared.yaml`
Machine-level and game-level config shared across all characters and accounts:

```yaml
account: EXAMPLEACCT   # last account name used; pre-fills the login form

advancedSettings:
  lichPath: C:\Ruby4Lich5\Lich5\lich.rbw
  rubyPath: C:\Ruby4Lich5\4.0.0\bin\ruby.exe
  lichClientFlag: --stormfront   # --stormfront | --genie | --wizard | --avalon | --frostbite
  lichDelay: 5
  hideLichWindow: false
  lichPort: 11024
  portLocked: true
  modeLocked: true

mapDir: C:\Users\...\maps

games:
  DR:
    name: DragonRealms Prime
    gameCode: DR
    lichPort: 11024
    lichArguments: --dragonrealms
  DRT:
    name: DragonRealms Prime Test
    gameCode: DRT
    lichPort: 11624
    lichArguments: --test --dragonrealms
  DRX:
    name: DragonRealms Platinum
    gameCode: DRX
    lichPort: 11124
    lichArguments: --platinum --dragonrealms
  DRF:
    name: DragonRealms The Fallen
    gameCode: DRF
    lichPort: 11324
    lichArguments: --fallen

myThemes:
  - id: my-dark-gold
    name: Dark Gold
    vars: { ... }
```

**`lichClientFlag`** is combined with the game's `lichArguments` to form the full Lich launch command: `ruby lich.rbw --stormfront --dragonrealms`. Swapping the flag in one place updates it for all games. Adding a new game server requires only a new entry in the `games` table — no code changes needed; the login screen game dropdown is populated from this table at runtime.

#### `{Character}.yaml` (v2 — dynamic shape)

A small set of top-level fields plus a dynamic `state:` map that mirrors localStorage. Every entry under `state` corresponds to one `lichborne.{character}.{suffix}` localStorage key:

```yaml
profileVersion: 2
account: EXAMPLEACCT
character: Sekmeht
game: DR
useLich: true
theme: classic     # boot fallback (unnamespaced lichborne.theme — applied before any tab mounts)

state:
  settings:                                     # ← lichborne.{char}.settings
    fontSize: 12
    fontFamily: cascadia     # default key — or any literal font name once user picks one
    lineHeight: 1.2
    vitalsBarPosition: bottom
    iconBarPosition: top
    timerStyle: chips
    autoLinkUrls: true
  highlights: [...]                             # ← lichborne.{char}.highlights
  triggers: [...]                               # ← lichborne.{char}.triggers
  macros: [...]                                 # ← lichborne.{char}.macros
  aliases: [...]                                # ← lichborne.{char}.aliases
  groups: [...]                                 # ← lichborne.{char}.groups
  modes: [...]                                  # ← lichborne.{char}.modes
  activeGroupStates: { grp-combat: true }       # ← lichborne.{char}.activeGroupStates
  activeModeId: mode-hunting                    # ← lichborne.{char}.activeModeId
  contacts: [...]                               # ← lichborne.{char}.contacts
  contact-templates: [...]                      # ← lichborne.{char}.contact-templates
  panelWidth: 320                               # ← lichborne.{char}.panelWidth
  topPanelHeight: 200
  midPanelHeight: 200
  topTabs: [...]
  topActiveId: room
  midTabs: [...]
  midActiveId: thoughts
  bottomTabs: [...]
  bottomActiveId: exp
  streamTimestamps: { thoughts: true }
  mapLabelMode.v2: short                        # graph view label mode
  mapViewMode: graph                            # 'image' | 'graph'
  mapShowAllZ: 'false'                          # graph view Z-level filter mode (stored as string)
  mapZLevels: [0, 1]                            # graph view selected Z levels
  mapShowLegend: 'true'                         # graph view legend toggle (stored as string)
  focus: Ranger
  expPins: [Athletics, Stealth]
  expSort: alpha
  expSortDesc: asc                              # 'asc' | 'desc' (string, not boolean)
  expFocusMode: none
  scriptPalette: [...]
```

**Round-trip behavior:** every JSON-stringifiable value localStorage holds becomes a typed value in YAML. Strings stay strings, numbers stay numbers, objects/arrays serialize. On import, values that are objects/arrays are `JSON.stringify`d back into localStorage; primitives are stored as `String(value)`. Mirrors localStorage's string-only API exactly.

**Adding a new per-character feature:** call `localStorage.setItem(scopedKey(character, 'mything'), JSON.stringify(value))`. No profile-system changes needed; `state.mything` appears in the next YAML save automatically, and `importCharacterProfile` will write it back on next login.

**Shared keys (unnamespaced — not under any character scope):** `lichborne.account`, `lichborne.advancedSettings`, `lichborne.rememberPassword`, `lichborne.mapDir`, `lichborne.genieMapsDir`, `lichborne.myThemes`, `lichborne.theme` (boot fallback). These live in `_shared.yaml` or stay in localStorage and never appear in per-character YAMLs.

#### v1 → v2 migration

> Removed in v0.6.1. Pre-v0.6.0 testers should wipe `profiles/{Character}.yaml` before first launch on v0.6.1+ so Lichborne re-creates clean v2 files from a fresh login. (Decision was viable because the tester pool is small — see `Tracker.md` for the decision log entry.)

#### Migration registry (v0.6.3+)

Each profile file declares its own `profileVersion` (shared = 1, character = 2 today). Read paths consult a per-file migration registry in [profile-migrations.ts](src/renderer/profile-migrations.ts) before applying:

```ts
// Each map keyed by SOURCE version. `migrations[N]` upgrades a v=N file into
// v=N+1 shape. The registry walker steps from the file's stamped version up
// to the current PROFILE_VERSION, applying each step in sequence.
export const sharedMigrations:    Record<number, (data: any) => any> = { /* empty */ }
export const characterMigrations: Record<number, (data: any) => any> = { /* empty */ }
```

**Read flow** (`importSharedProfile` / `importCharacterProfile`):
1. Parse YAML; read `profileVersion` (legacy files without the key are treated as the lowest current version — shared=1, character=2, since both files have always been at those shapes).
2. Call `runMigrations(data, fileVersion, currentVersion, registry)` which walks `fileVersion → currentVersion` applying each registered step.
3. If a step is missing OR the file's version is HIGHER than the current code knows about, `runMigrations` returns `null`; the import logs a warning (`[profile] X.yaml is version N, expected M. Skipping import.`) and **the on-disk file is preserved untouched** — never overwritten by a shape the code can't understand. Recovery path: downgrade Lichborne, or hand-edit the YAML.

**When to add a migration:** the moment a breaking schema change goes in. Bump the version constant in `profile.ts` (`SHARED_PROFILE_VERSION` or `CHARACTER_PROFILE_VERSION`), register a migration keyed by the PREVIOUS version, and ship — old YAMLs auto-upgrade on first read after install. Migrations must be pure functions; no localStorage writes, no network, no side effects, so a failed run leaves the on-disk file intact for the caller to handle.

**What is NOT a breaking change:** adding a new optional field, adding a new key under `state:` (the dynamic map absorbs it automatically), adding a new entry to `games`. These don't need a version bump — the existing v=N parser handles them via the `Partial<Profile>` import shape.

**What IS a breaking change:** renaming a top-level field, changing a field's type (string → object), restructuring `advancedSettings`, splitting one field into many. These need a bump + migration.

---

### 20.4 Authority Rules

| Situation | Authority |
|---|---|
| YAML exists for this character | YAML overwrites `localStorage` on launch |
| No YAML, `localStorage` has data | `localStorage` used as-is (new character) |
| No YAML, no `localStorage` | App defaults (brand new install) |

---

### 20.5 Write Flow

1. Any setting changes → character-scoped `localStorage` key immediately (existing behavior, unchanged).
2. Debounced 2.5 seconds after last change → YAML written via `scheduleProfileSave(account, character, game, useLich)`. Each character has its own pending timer in a `Map<character, {timer, account, game, useLich}>` so two active characters never race their writes.
3. On disconnect (clean or dropped) → immediate final character write regardless of debounce state.
4. On window close (graceful shutdown) → main fires `window.__flushProfileSaves` in the renderer via `executeJavaScript`; the renderer runs every pending timer immediately and `await`s all writes. Main then runs `backupAllProfiles()` which copies each `{Character}.yaml` and `_shared.yaml` to `.yaml.bak` in the same directory. Single rolling backup per file from the last clean shutdown.

**Atomic write:** `writeCharacterProfile` / `writeSharedProfile` write to `{path}.tmp` and then rename in place (after removing the existing target on Windows). The corruption window collapses to a single rename syscall.

**Character profile debounce triggers** (`scheduleProfileSave` in `GameWindow` and panels):
- Settings panel `onChange`
- Automations panel `onSaved` and `onClose`
- Contacts panel `onSaved`
- Contact last-seen auto-update timer (2s)
- Mode switch (`activeModeId` watcher)
- Exp panel badging/guild change (`handleFocusChange`)
- Exp panel skill pin toggle (`handleTogglePin`)

**Shared profile debounce triggers** (`scheduleSharedProfileSave`):
- Map folder selected (`browseMapsFolder` in `MapPanel`)
- Theme picker `onMyThemesChange`

---

### 20.6 Startup / Login Flow

1. Login screen mounts → `importSharedProfile()` reads `_shared.yaml` → writes to `localStorage` → pre-fills account name and Lich settings in the login form
2. User enters account name and character; hits Connect
3. On successful connection → `importCharacterProfile(character)` reads `CharacterName.yaml` → writes all saved settings to `localStorage`
4. **Match found** → GameWindow renders with fully restored settings
5. **No YAML yet** (new character) → import is a no-op; GameWindow uses current `localStorage` / defaults
6. After import → `_shared.yaml` and `CharacterName.yaml` are both exported immediately (confirms state; creates YAML for new characters)
7. From this point on YAML is the authority for that character on every subsequent login

---

### 20.7 Game Code and Authentication

The `game:` field in a character YAML references a key in `_shared.yaml`'s `games` table. At connect time the app looks up that entry to get:
- `gameCode` — passed to the SGE authentication handshake
- `lichPort` — the local Lich port for that game instance
- `lichArguments` — game-specific Lich flags (combined with `lichClientFlag`)

This means adding a new game server (e.g. Briarmoon Cove) requires only a new entry in `_shared.yaml` — no code changes.

---

### 20.8 Implementation Files

| File | Role |
|---|---|
| `src/renderer/characterScope.ts` | `scopedKey(character, suffix)` and `normalizeCharacter(name)` — single source of truth for the `lichborne.{character}.{suffix}` namespace |
| `src/renderer/profile-types.ts` | `SharedProfile`, `CharacterProfile` (v2) |
| `src/renderer/hooks/useProfileSaver.ts` | `useProfileSaver()` — returns a stable `saveProfile()` callback bound to the current character's session info; called at every per-character `setItem` site |
| `src/main/profiles.ts` | Main YAML file I/O — `readSharedProfile`, `writeSharedProfile`, `readCharacterProfile`, `writeCharacterProfile`, `listCharacterProfiles`, `backupAllProfiles`. `atomicWriteFile` is the internal `.tmp`-then-rename helper |
| `src/renderer/profile.ts` | Renderer-side logic — `buildSharedProfile`, `buildCharacterProfile` (scans `lichborne.{char}.*`), `exportSharedProfile`, `exportCharacterProfile`, `importSharedProfile`, `importCharacterProfile` (v2 only as of v0.6.1), `clearCharacterLocalStorage`, `scheduleProfileSave` (per-character `Map`), `scheduleSharedProfileSave`, `flushPendingProfileSaves` |
| `src/main/main.ts` | IPC handlers: `profile:read-shared`, `profile:write-shared`, `profile:read-character`, `profile:write-character`, `profile:list`. Window-close handler invokes `window.__flushProfileSaves` then `backupAllProfiles` |
| `src/main/preload.ts` | IPC bridge — exposes profile API to renderer |
| `src/renderer/App.tsx` | Exposes `window.__flushProfileSaves` which fires every pending debounced save AND unconditionally saves every active character — defense-in-depth catch for setItem-without-schedule sites |
| `src/renderer/global.d.ts` | `window.api` type declarations for profile methods |

---

### 20.9 Portability

- Copy `<install-dir>\` to any machine — all profiles, themes, and game config travel with it
- Reinstall to the same path — `profiles\` is untouched
- Back up one character — copy their YAML file
- Migrate a character — drop their YAML into `profiles\` on the new machine
- New game server — add one entry to `_shared.yaml`, appears in the game dropdown automatically *(once Phase 3 is implemented)*

---

### 20.10 Implementation Phases

| Phase | Description | Status |
|---|---|---|
| 1 | Infrastructure + export: IPC, file I/O, `buildProfile`, write on connect/disconnect/change | ✅ Complete (v0.3.x) |
| 2 | Import shared: `importSharedProfile()` on login screen mount; pre-fills account name and all Lich/port/mode settings | ✅ Complete (v0.3.x) |
| 3 | Import character: `importCharacterProfile()` on connect before GameWindow renders; YAML is authority | ✅ Complete (v0.3.x) |
| 4 | Game dropdown: populate login screen game selector from `games` table in `_shared.yaml` | Planned |
| **v2** | Dynamic `state:` map (scan `lichborne.{character}.*`); v1 migration; atomic write; `flushPendingProfileSaves`; `backupAllProfiles` on graceful close; per-character `scheduleProfileSave` map; per-character `localStorage` namespacing | ✅ Complete (v0.6.0) |
| **v2.1** | `useProfileSaver()` hook at every setItem site (crash-resilient saves); v1 migration code removed; missing map options persisted (mapViewMode, showAllZ, zLevels, showLegend); defense-in-depth shutdown save covers any setItem-without-schedule edge | ✅ Complete (v0.6.1) |

---

## 21. Stream Name Normalization

All stream IDs are normalized to **lowercase** at the point they enter the system:

- `echoToStream(stream, ...)` — trigger echo actions; `stream.toLowerCase()` applied before writing to `streamLines`
- `stream-declare` event handler — game-sourced streams; `evt.stream.toLowerCase()` before pushing to `discoveredStreams` and `streamTitles`
- `stream-push` event handler — same normalization

**Display**: stream IDs are always stored and keyed lowercase. Tab labels capitalize the first letter (`id.charAt(0).toUpperCase() + id.slice(1)`) so "log" → "Log", "sekmeht" → "Sekmeht". The game server already sends lowercase IDs; normalization primarily matters for user-typed stream names in trigger echo actions.

**Custom panel binding**: `makeCustomTab(name)` sets `tab.id = name.trim().toLowerCase()`. The `custom` case in `renderPanel` uses `streamLines[tab.id]`. This means a panel named "Sekmeht" and a trigger that echoes to "Sekmeht" (or "SEKMEHT" or "sekmeht") all resolve to the same `streamLines["sekmeht"]` key — no manual case-matching needed.

**Why not normalize at the trigger editor?** The trigger stores whatever the user typed. Normalizing at storage time would silently alter the user's value and could cause confusion if the stored value differed from what they entered. Normalizing at use time is transparent and reversible.

---

## 22. Debug — Fires Tab

The Fires tab in the Debug panel shows a live stream of every highlight and trigger that matched incoming game text. It is the primary tool for diagnosing automation behavior: seeing which rules fire, on what text, with what actions.

### Architecture

- `FireLogEntry` — defined in `shared/types.ts`; fields: `id`, `ts`, `kind` (`highlight` | `trigger`), `name`, `matched`, `detail`, `stream`, `ruleId?` (v0.8.2 — drives the Fires → Edit button)
- `fireLogBufRef` — accumulates entries without triggering React re-renders
- `setFireLog` — only called when the debug panel is open (`showDebugRef.current`); entries are pushed with `prev => [...prev.slice(-(MAX - 1)), entry]` for O(1) append
- Cap: 500 entries (same as the Events buffer)

### Highlights

`logHighlightFiresRef(text, stream)` is called alongside `processHighlightSoundsRef` for every incoming line. It:
1. Returns immediately if `showDebugRef.current` is false — **zero overhead when debug is closed**
2. Iterates `allHighlightRulesRef` (all compiled highlight rules, both `matchRules` and `lineRules`)
3. Uses the same `fastLower` pre-filter as the sound engine
4. For each match: logs `name || pattern`, the full line text, and a detail string containing `scope/mode | fg:color | bg:color | bold | glow | 🔊 sound`
5. The `stream` column reveals when the same line arrives on multiple streams (e.g., `main` and `spells`) and fires the same highlight twice — this is expected DR behavior, not a bug

### Triggers

`TriggerCallbacks.onFire` is called inside `processLine` and `processVariableChange` after `buildVars` so action details can be interpolated. The detail string format is:

```
pattern: "…" | if health > 50 | cmd: "go north" | echo → log: "message"
```

For variable triggers:
```
watch: $health = "75" | if health > 50 | set $lastHealth = "75"
```

`summarizeAction(action, vars)` and `summarizeGates(gates)` build these strings. Actions are fully interpolated at the time of the fire event so the log shows actual runtime values, not template strings.

### Name Fallback

Both highlights and triggers fall back to `rule.pattern` when `rule.name` is blank. This is important because the import wizard intentionally leaves `name: ''` on all imported items — the pattern is the only meaningful identifier until the user labels their rules. Variable triggers additionally fall back to `rule.watchVariable` before the pattern.

### Layout & presentation (v0.11.5)

The Debug panel (Fires / Events / Raw XML) is a header-over-rows table inside a single scroll container (`.debug-scroll`, `overflow-y: auto`):

- **Column alignment** — the sticky header and the rows share one `grid-template-columns`, and `.debug-scroll` sets `scrollbar-gutter: stable` so the reserved scrollbar gutter keeps the header and rows on the same content width once the list overflows. Fire-log rows are uniform-height (`align-items: center` + single-line ellipsis per cell, full value in a `title` tooltip) so columns read as a real table; long matches truncate rather than wrapping into ragged rows. Events uses a 2-column grid (`Type` fixed, `Payload` flexible) and expands a row on hover to reveal full JSON.
- **Theming** — all surfaces use theme vars with `:nth-child(even)` zebra striping via `color-mix(... var(--text-primary) 5%, transparent)`; verified on light themes (no transparent/washed-out rows).
- **Goto** — each fire row has an **"Edit →"** button (fixed last column, always visible) wired to `onGotoFireRule(kind, ruleId)`, which opens the source highlight/trigger in the Automations panel.
- **Resizable, two render modes** — as the docked bottom strip (GameWindow, `resizable` prop) the panel has a top drag-handle and persists its height per-character via `scopedKey(character, 'debugPanelHeight')` (default 300px, clamped 150 → 70vh; round-trips into YAML `state.*` per the dynamic profile pipeline, no schema change). Rendered inside a panel zone or floating window (PanelFrame `debug` tab) it's non-resizable and fills the host (`.debug-panel--fill`). **The docked strip is Static-Panels-mode only (B166, v0.13.2)** — in Windowed Panels the Debug button toggles a floating Debug window instead (the strip would render under the `WindowLayer`; see §33.6), and telemetry collection follows the `debugOpen` presence memo (strip OR zone tab OR window tab) rather than the strip toggle alone.
- **Export CSV (F45, v0.13.2)** — toolbar button saving the ACTIVE tab to a CSV for offline analysis: Fires `timestamp,kind,stream,rule,matched,detail` (ms-precision local timestamps); Events `index,type,timestamp,data` (heterogeneous event union → `data` is the event JSON minus `type`, json-parseable per row); Raw XML `index,line`. RFC-4180 quoting + the OWASP formula-injection guard (leading `'` on fields starting `=`/`+`/`-`/`@`/tab — Excel would otherwise parse them as formulas, and game text is player-authored so `=cmd|…` is a genuine injection vector). Saves through the generic `save-text-file` IPC (main: `showSaveDialog` parented to the calling window + `writeFileSync`) — reusable by any future "save this text" feature.

---

## 23. Virtual Scrolling — Main Window

### Problem

The main story window accumulated up to 2000 `<TextLineRow>` DOM nodes. Chrome DevTools traces during heavy combat and movement bursts showed Layout at 40.9% and `removeChild` at 29.7% of total frame time. The bottleneck was the browser measuring and painting all 2000 nodes on every incoming line batch, not the React diffing.

### Solution

The `lines.map(<TextLineRow>)` render was replaced with `react-virtuoso`'s `<Virtuoso>` component. Virtuoso renders only the ~50 rows visible in the viewport at any given time. Off-screen rows are unmounted and remounted as the user scrolls.

### Architecture

```
.text-window (wrapper div — overflow: hidden, NO padding, event handlers)
└── <Virtuoso>                    ← managed by react-virtuoso
    └── scroller div              ← scrollerRef → scrollRef.current; overflow-x: hidden
        └── <div className="text-line-wrap">   ← padding: 0 12px per item
            └── <TextLineRow>     ← only ~50 in DOM at once
```

**Item padding (B35):**
Padding belongs on each item, not on the `.text-window` container. Applying `padding: 8px 12px` to the container reduces the width available to Virtuoso's scroller, causing item widths to differ from what Virtuoso estimated during initial measurement. This compounds into scroll height errors (scroll lands several lines short of true bottom) and causes the scrollbar to float in the gutter instead of sitting flush at the panel edge. Solution: `.text-window` has no padding; each item is wrapped in `<div className="text-line-wrap">` with `padding: 0 12px 0.15em` (see Last-line clip below).

**Last-line clip (B38):**
`margin-bottom` on the inner `.text-line` element collapses through `.text-line-wrap` (a block container with no padding-bottom or border-bottom). Collapsed margins are NOT captured by Virtuoso's ResizeObserver measurement of item height — so the last rendered line was always clipped by that margin regardless of scroll position. Fix: no `margin-bottom` on `.text-line`; inter-line spacing moved to `padding-bottom: 0.15em` on `.text-line-wrap`. Padding IS included in ResizeObserver measurements.

**Last-line "one line short" at font ≥ 13 — rAF-deferred bottom correction (B122 → B153):**
At game font ≥ 13 the pinned view rests exactly one line short of the bottom — the last line (e.g. the `>` prompt) clips at the vitals bar, and you can always wheel down one notch to reveal it (so the true DOM bottom *is* reachable; the auto-follow just isn't getting there). Cause: Virtuoso's `followOutput` lands at "last item at viewport bottom" but **under-measures the last row at fractional heights** (a row is ~1.55em — `.text-line` `min-height: 1.4em` + `.text-line-wrap` `0.15em` padding — non-integer at font ≥ 13), so the last line lands clipped; and `followOutput` runs *after* a synchronous bottom-correction in `totalListHeightChanged`, overriding it. **Fix (v0.11.4):** `totalListHeightChanged` **defers** its raw, DOM-truth bottom scroll (`el.scrollTop = el.scrollHeight − el.clientHeight`) into a `requestAnimationFrame`, so it runs *after* `followOutput` and wins — landing at the genuine bottom (DOM `scrollHeight` is immune to Virtuoso's internal under-measurement). The last line sits flush at every font, with no footer, no clip, and no gap. `scrollToBottom` (End key) and the font re-snap do the same rAF raw correction after their `scrollToIndex({ align: 'end' })`. **Two dead ends, recorded:** v0.8.8's fixed-14px `components.Footer` (and a v0.11.4 attempt to scale it to one row) only added bottom *slack* — once the correction reached the true bottom, the footer just became a one-line *gap* above the vitals bar, non-monotonic around font 13–14, so the footer was removed; and integer per-row pixel heights did not help because the short-landing is a `followOutput` under-measurement + override, not row-height rounding. A companion fix: the font-change re-snap effect arms `suppressUntilRef` synchronously *before* its rAF, because the relayout on a font change (rows AND the game-font-scaled command bar both grow) balloons `scrollHeight` while `scrollTop` holds, crossing the un-pin deadband and un-pinning before the re-snap could fire (the "N new lines" badge appearing on a font change). The `totalListHeightChanged` threshold is `dist > 0.5`.

**v0.11.6 (B155) — the clip was partly a LAYOUT overflow, and `followOutput` was retired.** The B153 story above framed the clip as purely a scroll-math under-measurement; debugging with Sekmeht/Binu found that was incomplete. (1) **Layout:** `.game-main` and `.text-window` were `flex: 1` children of flex **columns** without `min-height: 0`, so they wouldn't shrink below their content and the column overflowed the window by ~one line — clipping the bottom independently of any scroll math. The tell was that moving the vitals bar top↔bottom shifted the main window by a line. Added `min-height: 0` to both (the standard flexbox scrollable-child fix). (2) **Auto-follow:** with the overflow gone the viewport became cleanly fractional, and `followOutput`'s under-measurement now showed on *every* line as a "scroll up a notch, then jump to bottom" two-step (its short-landing, then the deferred correction). So `followOutput` was turned **off** and pinned auto-scroll is now owned by a *synchronous* `totalListHeightChanged` correction (see the rewritten "Scroll-following" section below). The rAF in `totalListHeightChanged` is now only a backup for still-settling rows, not the primary lever.

**v0.13.4 (B171) — the residual "hops after a long session" was the LINE CAP, not the scroll machinery.** With the B155/B158 pinning solid, an intermittent hop/un-pin remained that only appeared deep into a session — because it started exactly when `lines` hit MAX_LINES (2000) and the per-batch head-trim began. Two mechanisms (measured in a post-paint simulation harness, `tmp-scroll-repro/`): react-virtuoso keys its row-size cache by INDEX (`computeItemKey` only stabilizes React reconciliation), so an uncompensated head-trim shifted every row's index per batch and painted content jumped BACKWARD (26 jumps up to ~147px in 12s of at-cap flood, zero pre-cap); and with trim-N+append-N keeping the count constant, `totalListHeightChanged` collapsed from ~2.0 to 0.7 calls/batch — no correction, no suppress window, eventual deadband un-pin. **Fix: hysteresis trimming** (`appendTrimmed()` — grow to 2400, cut to 2000 in one slice; all `setLines` sites route through it): between trims the count grows every batch so the height callback keeps firing, and the rare big cut always fires it and is absorbed by the existing same-frame correction (0 hops in the harness). Virtuoso's own `firstItemIndex` compensation was tested and REJECTED — its internal `scrollBy` races our raw `scrollTop` ownership. CLAUDE.md pitfall #81.

**Scroll-following (pin to bottom) — B36, rebuilt in v0.11.6 (B155):**
Through v0.11.5 auto-follow was owned by Virtuoso's `followOutput` prop (`() => pinnedRef.current ? 'auto' : false`), with `totalListHeightChanged` doing a deferred (rAF) fine-correction. The trouble: `followOutput` aligns the last row to the viewport bottom but **under-measures it at fractional row/viewport heights** — and the viewport is fractional, because the vitals strip and command bar scale with `var(--game-font-size)` in `em`. So `followOutput` lands ~one notch short and the correction snaps it down a frame later: the visible **"scroll up a notch, then jump to bottom"** two-step (which the v0.11.6 layout fix above made appear on every line by making the viewport cleanly fractional).

**v0.11.6: `followOutput` is OFF — we own pinned auto-scroll.** With nothing else trying to scroll, `totalListHeightChanged` sets the DOM-truth bottom **synchronously, before paint**, when pinned — so the last line is flush in the *same* frame the new content renders, with no short-landing for anything to correct:

```tsx
followOutput={false}
totalListHeightChanged={() => {
  if (!pinnedRef.current) return
  const el = scrollRef.current
  if (!el) return
  suppressUntilRef.current = Date.now() + 200
  el.scrollTop = el.scrollHeight - el.clientHeight   // synchronous, DOM-truth
  requestAnimationFrame(() => {                       // backup: only if rows were still settling
    const el2 = scrollRef.current
    if (!el2 || !pinnedRef.current) return
    if (el2.scrollHeight - el2.scrollTop - el2.clientHeight > 0.5) {
      suppressUntilRef.current = Date.now() + 200
      el2.scrollTop = el2.scrollHeight - el2.clientHeight
    }
  })
}}
```

`scrollHeight − clientHeight` is DOM-truth and immune to Virtuoso's internal under-measurement. The concern that motivated `followOutput` originally — DOM `scrollHeight` lagging because newly-appended items below the fold aren't measured yet — does not bite the *pinned* case: when pinned we are at the bottom, so appended lines render within the bottom buffer (`increaseViewportBy` bottom: 3000) and are measured by the time `totalListHeightChanged` fires; the rAF backup catches the rare still-settling frame. A bonus the change surfaced: one scroll write + one paint per line instead of two, so the stream visibly flows smoother. **Do not re-enable `followOutput`** — it and a manual correction always fight into the two-step. Scroll-to-bottom is still instant. (A smooth-scroll variant existed v0.6.8–v0.6.11 and was removed in v0.6.12 — off by default, marginal, a source of false bug reports; the Genie *map* camera glide was kept, §19.16.6, gated on `mapAnimations`.)

**Relayout re-snaps (v0.11.6):** discrete relayouts that reshape the scroller over several frames (font change, tab become-active under pitfall #24's `display:none`→0×0, `window` focus/visibility regain, post-replay/decouple) route through a shared `resnapToBottom()` settle loop (re-issues the DOM-truth scroll each frame until `scrollHeight` stabilizes, 12-frame cap, sync-suppress, `pinnedRef`-gated). Continuous viewport-height changes (vitals strip appearing at login, compact↔regular toggle, window resize) are caught by a **passive** `ResizeObserver` on the scroller that does a single bare `scrollTop` write on an integer-height change — it must NOT call `resnapToBottom`/`scrollToIndex` (those re-render → nudge the scroller size → re-fire the observer → an idle "jitter" feedback loop).

**Un-pinning:**
Un-pinning happens only via explicit user action:
- `onWheel` on the wrapper div: if `e.deltaY < 0` (scroll up), sets `pinnedRef.current = false` synchronously (fires before the DOM scroll event — required during fast combat where lines arrive every frame)
- `PageUp` / `Ctrl+Home` key handlers: set `pinnedRef.current = false` before adjusting `scrollTop`

The scroll event listener on the Virtuoso scroller element does the opposite — it **only re-pins**:

```typescript
function handleVirtuosoScroll() {
  if (suppressUnpinRef.current) return
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  if (dist <= 10 && !pinnedRef.current) {
    pinnedRef.current = true
    newLineCountRef.current = 0
    setNewLineCount(0)
  }
}
```

This separation is critical: `followOutput` and `totalListHeightChanged` both generate scroll events. If the scroll handler also un-pinned on `dist > threshold`, those programmatic events would immediately clear the pin state — breaking auto-follow entirely.

**Suppress-unpin guard:**
`suppressUntilRef.current` is armed for **200ms** whenever a programmatic scroll occurs (from the event handler before `setLines`, `totalListHeightChanged`, or `scrollToIndex`); `scrollToBottom` uses 300ms. The scroll handler returns early while suppressed. 200ms covers the instant auto-scroll plus Virtuoso's ResizeObserver/rAF settle, and is short enough that scrollbar-drag unpinning stays responsive between batches (B76).

**Re-pinning:**
- Scroll handler re-pins automatically when the user scrolls all the way to the bottom (`dist <= 10`)
- `scrollToBottom()` — called by badge click, the `End` key (focus-elsewhere), or `Ctrl+End` — sets `pinnedRef.current = true` explicitly and calls `virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })`. `index: 'LAST'` (not `lines.length - 1`) is deliberate: the once-at-mount `keydown` listener captures `scrollToBottom` when `lines` is still empty — a `lines.length` reference would be permanently stale and the scroll would silently no-op.
- `clearLines()` sets `pinnedRef.current = true` so the user is not stranded at the top of an empty buffer after a screen clear

**Re-snap on relayout — the settle loop (B153, B155):**
`followOutput` lands the last item at the viewport bottom but **under-measures the final row at fractional heights** (a row is ~1.55em, non-integer at font ≥ 13), and it runs *after* the `totalListHeightChanged` correction, overriding it — so at larger fonts the pinned view rests one line short / clipped under the vitals bar (B153). The DOM-truth `scrollTop = scrollHeight − clientHeight` is immune to that under-measurement, but issuing it **once** is not enough on a relayout that reshapes the scroller: a `display:none → visible` tab switch (an inactive tab measures 0×0 — see §13/pitfall #24), a window focus regain (backgrounding throttles `requestAnimationFrame`), or a font/line-height change all settle over **several frames** as Virtuoso re-measures rows and the flex layout reclaims space. A single-rAF read lands mid-settle (short → un-pin + "new lines" badge, or overshoot → clip). The shared `resnapToBottom()` routine instead re-issues `scrollTop = scrollHeight − clientHeight` **each frame until `scrollHeight` stabilizes** (12-frame cap), converging on the final bottom; it arms `suppressUntilRef` synchronously before its first frame (relayout scroll events fire before the rAF) and gates on `pinnedRef` throughout (a scrolled-up reader is never yanked down). It is the single re-snap path for the badge/`End` (`scrollToBottom`), the font/line-height/large-print effect, the tab-becomes-active effect, and a window `focus`/`visibilitychange` listener. The steady-state per-line `totalListHeightChanged` correction (above) is the hot path and is unchanged.

**Word wrap:**
Virtuoso's scroller div has `overflow: auto` internally, enabling horizontal scrolling and breaking word wrap. Fixed by `el.style.overflowX = 'hidden'` in the `scrollerRef` callback. The same callback also sets `el.style.willChange = 'scroll-position'` to promote the scroll subtree to its own GPU layer (compositor-only scroll, no text re-rasterization).

**Render-cost mitigations:** the Virtuoso scroller carries `will-change: scroll-position` (set in the `scrollerRef` callback) to keep the scroll subtree on its own GPU layer. `.text-line` / `.text-line-wrap` briefly carried `contain: layout style` (v0.6.8) as a per-row reflow-isolation hint, but it was **removed in v0.6.12** — layout containment on a react-virtuoso row breaks Virtuoso's item-measurement / scroll-offset bookkeeping, which broke scroll-pin position retention when the list updated while scrolled up (B84). **Do not re-add `contain` to the text rows.**

**Keyboard scrolling — focus-aware (B77):**
`scrollRef.current` points to the Virtuoso scroller div; directly setting `el.scrollTop` works. Key behavior depends on whether the command input is focused:

| Key | Command input focused (normal play) | Focus elsewhere |
|---|---|---|
| `PageUp` / `PageDown` | Scroll story by a page | Scroll story by a page |
| `Home` / `End` | **Native** — cursor to start / end of typed command | Scroll story to top / bottom |
| `Ctrl+Home` / `Ctrl+End` | Scroll story to top / bottom | Scroll story to top / bottom |

`Home`/`End` are left native while typing because testers expect text-editing keys to edit text. `Ctrl+Home` in a single-line input is identical to plain `Home` natively, so repurposing the modified combo for story-scroll loses nothing. `PageUp`/`PageDown` have no native single-line-input meaning, so they always scroll.

### Room-State Pump (v0.6.8)

Fast running emits multiple `room-title` events in quick succession. React 18 auto-batches the resulting `setRoomState` calls across IPC tasks, so only the *last* room survived into the next render — the map indicator skipped 2-3 rooms at a time. Fix: room updates queue into `roomQueueRef` and a `requestAnimationFrame` loop applies one per frame, giving each room visit its own render commit (a "streamed" indicator). The queue is capped at 8 — an extreme burst trims to the most recent 8 rather than letting the marker lag seconds behind the player's real position.

### Stream ID Case Handling (B34, B37)

Stream IDs are preserved in their original capitalization throughout the entire pipeline. No `toLowerCase()` normalization is applied at any ingestion point:

- **`stream-text`** — `rawStream` used as-is; `streamLines["LichScripts"]` and `streamLines["moonWindow"]` receive data under exactly those keys
- **`stream-declare` / `stream-push`** — discovered stream IDs registered with original case; tab `id` matches the key used in `streamLines`
- **`echoToStream`** — trigger echo actions write to the exact stream name provided
- **Parser `clearstream` case** — falls back to raw `id` for unknown streams, so `<clearStream id="moonWindow"/>` clears `streamLines["moonWindow"]`
- **`makeCustomTab`** — preserves the stream ID's original case as the tab `id`

The only exception is the `NEVER_DISCOVER` filter, which uses `id.toLowerCase()` for its lookup since that set contains hardcoded lowercase constants for built-in game streams.

Built-in game streams (`main`, `room`, `thoughts`, `log`, etc.) always arrive from the server in lowercase, so they are unaffected. Trigger echo stream names must exactly match the case of the target panel's stream ID.

---

## 24. Lich Integration Architecture

> Decided 2026-05-12 after full audit of Lich5 internals, Genie/Wrayth/Frostbite import gaps, and Lichborne connection architecture.

### 24.1 Product Philosophy

> **Lichborne's identity: the best display and configuration layer for Lich users. Everything you see, hear, and feel. Everything you do belongs in a script.**

Lichborne is not a general-purpose DR client that happens to support Lich. It is a purpose-built rendering and configuration layer that treats Lich as a first-class citizen. Features that Lich already owns — automation, variables, text substitution, triggers with logic — should never be duplicated in Lichborne. Building them creates maintenance debt, confuses the product identity, and will always be an inferior version of what Lich provides.

The features that make Lichborne different from Genie and Frostbite are not triggers and aliases. They are rendering quality, display depth, and Lich integration. Go deep there, not sideways into automation.

**Clarification — "Lich-first, with backwards compatibility" (2026-06-09, Sekmeht).** The purist framing above ("never duplicate Lich automation"; "the differentiator is *not* triggers/aliases") is the *direction*, but the shipped reality is more nuanced and intentional: Lichborne **does** carry a native automation layer — highlights, triggers, macros, aliases, mutes/substitutes (Phase 7 + §31). It exists as a **backwards-compatibility / regression path** so a player who connects **directly to the game (SGE, no Lich)** isn't stranded, and as a **GUI convenience** for Lich users who don't write scripts. The reconciliation: Lichborne is **Lich-first** — Lich is the optimal, full-power route (maps, spell timers, variables, scripts, repository all light up with it) — and the native layer is the **graceful-degradation floor** beneath that, not the product's reason to exist. The hard line still held: that native layer is **finite and GUI-configured — we do NOT reinvent a scripting engine** (Frostbite's embedded Ruby, Genie's `#command` language). Heavy/conditional automation stays Lich's job; Lichborne *surfaces* Lich, it doesn't *host* a script runtime. So "go deep on rendering, not sideways into automation" still governs *new* work — but **"make the no-Lich path usable" is a first-class constraint, not a contradiction**, and a Lich-optimal feature with a degraded no-Lich mode is allowed (full parity is not required — this sharpens Principle #2, dropping its old "every feature must work without Lich" absolute). It is the Lich analogue of §32's "AI enhances, never gates": an optional power tier over a working baseline.

---

### 24.2 The Full Stack

```
Simu Game Servers
      │  XML protocol over TCP (fixed — we don't control this)
      ▼
   Lich5
      │  Transparent proxy + hook system + script runtime
      │  DownstreamHook rewrites game text before client sees it
      │  UpstreamHook intercepts commands before they reach game
      │  Scripts parse XML, maintain full game state model
      │  Routes structured output to named streams
      │  Exposes localhost:11024 to client
      │
      ├──[LichScripts stream]── running script state → Lichborne
      ├──[File system]────────── scripts/, profiles/, data/lich.db3
      ├──[Upstream commands]──── Lichborne can inject .scriptname
      │
      ▼
  Lichborne
      │  Receives XML Lich passes through; StormFrontParser extracts events
      │  React renders vitals, room, exp, streams, map, highlights
      │  Profile system persists display settings to YAML
      │  No direct awareness of Lich's internal state (today)
      ▼
     User
```

**Today:** Lich and Lichborne share a wire but have no relationship beyond it. Lich knows everything; Lichborne knows only what the game XML contains.

**Future:** Lichborne gains visibility into Lich's state via three integration seams — file system reads, `LichScripts` stream parsing, and upstream command injection — without ever trying to execute scripts or replicate Lich's automation.

---

### 24.3 What Each Layer Owns

**Simu** — produces the XML game protocol. Fixed input. We only receive it.

**Lich5** owns:
- Full game state model (`DRRoom`, `DRStats`, `DRSpells`, `DRSkill`, `DRBanking`)
- Persistent variable storage (`Vars` / `UserVars` in SQLite at `data/lich.db3`)
- Script execution, orchestration, and lifecycle (180+ scripts)
- DownstreamHook — intercepts and can rewrite ALL game text before the client sees it (`textsubs.lic` runs here; any client-side substitution would be redundant and would operate on already-transformed text)
- UpstreamHook — intercepts all outbound commands before they reach the game (`alias.lic` runs here)
- WatchFor — pattern-matching triggers inside scripts with full Ruby; vastly more capable than any client trigger
- Per-character YAML automation profiles (`scripts/profiles/Sekmeht-setup.yaml`)
- Map data in JSON format (`data/DR/map-*.json`)
- Discord / webhook integrations, AI/LLM integrations

**Lichborne** owns:
- Rendering the XML Lich passes through — text highlighting, stream routing, virtual scrolling
- React game state derived from parser events (vitals, room, exp, injuries, indicators)
- Panel layout, themes, fonts, accessibility settings
- Always-on highlight engine (no script required — persistent across sessions)
- Always-on sound alerts and visual triggers (display layer, independent of Lich)
- Display profiles in YAML (`profiles/Sekmeht.yaml`) — separate from Lich's script YAML
- Map visualization (reads Lich-compatible XML from user-selected directory)
- Key bindings, command echo, graceful disconnect
- Import wizard (migration of display preferences from other clients)

---

### 24.4 Integration Seams

Three surfaces exist for deepening the Lichborne ↔ Lich relationship. None require changes to Lich itself.

**Seam 1 — File System (low effort)**
Lichborne already launches Lich and knows its directory. The main process already has `read-file` and `list-map-dir` IPC handlers. New handlers can expose:
- `{LichDir}/scripts/` and `{LichDir}/scripts/custom/` — script discovery and browsing
- `{LichDir}/scripts/profiles/*.yaml` — per-character automation config for viewer/editor
- `{LichDir}/data/lich.db3` — `Vars` / `UserVars` via `better-sqlite3` (read-only)
- `{LichDir}/data/DR/map-*.json` — Lich's native map format (eliminates manual dir selection)

**Seam 2 — LichScripts Stream (already wired, needs parsing)**
Lich sends running script state to the `LichScripts` stream. Lichborne already receives and renders it as raw text. Parsing that structured output into actual script records (name, status, uptime) is the foundation of the active scripts panel.

**Seam 3 — Upstream Command Injection (already works, needs UI)**
Lichborne's `send-command` IPC path sends to Lich's upstream pipe. Sending `.t2`, `.buff stop`, `.script abort scriptname` already works today — it just requires a UI surface. Lich's UpstreamHook processes these commands exactly as if the user typed them.

**Future Seam — Direct Lich IPC**
Lich5 exposes `lib/common/reusable_tcp_server.rb` — a TCP server for richer bidirectional communication. This is a longer-term path to real-time script state, variable updates, and hook management without polling streams.

---

### 24.5 Feature Ownership Matrix

#### Display Layer — Lichborne Owns, Go Deep

| Feature | Lich | Lichborne | Direction |
|---------|------|-----------|-----------|
| Text highlighting / coloring | No | ✅ Yes | Invest — core differentiator |
| Name / contact styling | No | ✅ Yes | Invest |
| Themes & appearance | No | ✅ Yes | Invest |
| Panel layout & stream routing | No | ✅ Yes | Invest |
| Font / density / spacing | No | ✅ Yes | Invest |
| Vitals bars (from XML) | No | ✅ Yes | Invest |
| Exp panel (from XML) | No | ✅ Yes | Invest |
| Room panel (from XML) | No | ✅ Yes | Invest |
| Map rendering | Produces data | ✅ Renders it | Invest — collaborative, not duplicate |
| Script output streams | Produces output | ✅ Renders it | Invest — this is exactly right |
| Sound alerts on text match | No | ✅ Partial | Invest — always-on, no script needed |
| Stream timestamps | No | ✅ Yes | Keep |
| Auto-copy to clipboard | No | ✅ Yes | Keep |

#### Connection Layer — Lichborne Owns

| Feature | Lich | Lichborne | Direction |
|---------|------|-----------|-----------|
| SGE auth / login | No | ✅ Yes | Keep |
| Lich process launch | Manages itself | ✅ Launches it | Keep |
| Command input / bar | No | ✅ Yes | Keep |
| Key bindings (send on keypress) | No | ✅ Yes | Keep — hardware layer |
| Command echo | No | ✅ Yes | Keep |
| Graceful disconnect | No | ✅ Yes | Keep |
| Display profiles (YAML) | Script YAML (separate concern) | ✅ Yes | Keep — these are different systems |

**Lich launch & connect (reworked v0.7.0, B85; GTK-friendly spawn v0.9.x).** `LichConnection.launch()` spawns `rubyw lich.rbw --stormfront --dragonrealms` as a **detached** child (not a service). With those flags Lich takes its force-mode path (`main.rb`): bind `127.0.0.1:11024`, then `accept` **exactly one** front-end and `close` the listener — one Lich process = one game session. The original code waited a fixed `lichDelay` (5s) timer then made a single connect attempt — fragile, since Lich's startup time is variable (Ruby init, ~40 `require`s, the listener bind which itself retries). Replaced with:

- **`connectWithRetry()`** — retries the real connection (250ms cadence, ≥30s cap) until the port accepts. The first success IS the session socket; no throwaway probe sockets (Lich's listener takes one front-end then closes — a connect-then-disconnect probe could confuse it). `launch()` resolves on the child's `spawn` event and watches `exit`, so a Lich that dies on startup fails fast with a real message (its launch-log tail) instead of a vague timeout.
- **Serialized launch queue** — `serializeLichLaunch()`, a module-level promise chain shared across every per-session `ConnectionManager`. Because each Lich serves one front-end then frees port 11024, multiple characters reuse the port *sequentially*; the chain keeps only one character in the spawn→connect window at a time, so concurrent logins never race the bind or cross-wire under Windows `SO_REUSEADDR`. SGE/eaccess auth runs *outside* the chain (overlaps the wait) and resolves *before* the spawn, so a failed login never orphans a Lich. A failed launch `killProcess()`es its Lich so it can't squat the port.

**GTK-friendly spawn shape (v0.9.x).** The connect model above is unchanged, but the *process spawn* was reworked so Ruby/GTK scripts (`;vars setup`, kill-counter, …) get a normal Windows GUI-subsystem context — the community-standard shape (matches how Frostbite/Genie launch Lich). The pre-v0.9.x shape (`ruby.exe` console interpreter + `windowsHide: true` + stderr piped) was the suspected cause of GTK widget-pump flakiness. The new shape: (1) **`rubyw.exe`** (GUI subsystem) derived from the configured ruby path by `resolveRubyw()` (`/ruby\.exe$/i` → `rubyw.exe`, fall back to the given path if absent); (2) **no `windowsHide`**; (3) **stdout+stderr → a per-character log file** `{userData}/Logs/lich-launch/{Character}.log` (truncated per launch) instead of a pipe — `describeExit()` reads its tail for the error banner. `detached` + `unref()` + the child handle are retained (Lich must outlive the front-end; the handle still fails a dead launch fast). The configured/default ruby path stays `ruby.exe`; derivation happens at launch time, so no settings migration. This reverses the earlier "do not support GTK" stance (see §24 / CLAUDE.md); GTK support was empirically verified working on 2026-07-03 (GTK script windows paint and behave correctly under the new spawn).

#### The Gray Zone — Keep Thin, Freeze Scope

| Feature | Direction | Constraint |
|---------|-----------|------------|
| Simple aliases | Keep | Single-command expansions only. No `$variables`, no chaining. Do not expand. |
| Simple triggers | Keep | Sound, flash, echo-to-stream only. No conditional logic or state. Do not expand. |
| Key bindings / macros | Keep | Warn on `$variable` refs and `@` placeholders at import time. |
| Import wizard | Keep, reframe | Migration tool for display preferences only. See Section 24.7. |

---

### 24.6 Won't Build — Ever

These features belong to Lich. Building them in Lichborne creates maintenance debt, confuses the product identity, and will always be inferior to the Lich equivalent.

| Feature | Why Lich Already Owns It |
|---------|--------------------------|
| Client-side variables | Lich's `Vars` system is per-character, SQLite-backed, accessible to all scripts simultaneously |
| Text substitution / gags | `textsubs.lic` runs as a DownstreamHook — the client sees already-transformed text; client substitution would be redundant |
| Conditional trigger logic (`#if`, state, chaining) | WatchFor in a script has full Ruby behind it; client logic will always be a worse version |
| Training automation | `t2.lic` and the training script family |
| Combat automation | `stabbity.lic` and related scripts |
| Crafting automation | 15+ dedicated craft scripts |
| Healing automation | `tendme.lic`, `tendother.lic`, `first-aid.lic`, `plantheal.lic` |
| Loot / inventory management | `sell-loot.lic`, `sorter.lic`, `rummage.lic`, `offload-items.lic` |
| Navigation / pathfinding | Map JSON + `find.lic`, `automap.lic` |
| Group management | `buff.lic`, `buffother.lic`, `coordinator.lic` |
| Economy / banking | `bankbot.lic`, `crowns.lic`, `pay-debt.lic`, `tithe.lic` |
| Discord / webhook integration | `beakon.lic` and webhook URL management in Lich data |
| Multi-character coordination | `nw-monitor.lic`, `coordinator.lic`, IPC between sessions |
| AI / LLM integration | `aichar.lic`, `aiconvo.lic`, OpenAI key management in Lich data |

---

### 24.7 Import Wizard Reframe

The import wizard's job is: **bring your display preferences from another client into Lichborne, and surface what to do with everything else.**

It is not a full settings migration tool. Users who expect their 73 Genie triggers to become Lichborne triggers will be disappointed; users who understand they're migrating their highlight palette and key bindings will be delighted.

| Data Type | Import Action | Rationale |
|-----------|--------------|-----------|
| Highlights | ✅ Import fully | Pure display — client's core job |
| Names / contacts | ✅ Import fully | Pure display |
| Macros / key bindings | ✅ Import; flag `$var` refs and `@` as partial | Hardware layer |
| Presets → theme | ✅ Import fully | Pure display |
| Display triggers (sound / flash / echo) | ✅ Import | Display layer — always-on is correct |
| Simple aliases (no `$vars`) | ✅ Import | Pre-Lich convenience layer |
| Macros / aliases with `$variables` | ⚠️ Import as partial | Note: "Variables won't resolve — move to a Lich script" |
| Complex triggers (logic, conditionals) | ⚠️ Import display actions only | Note: "Logic belongs in a Lich WatchFor" |
| Lich scripts (`<scripts>` in Wrayth XML) | ⚠️ Count and surface | "These run in Lich, not the client" |
| Variables | ⚠️ Count only | "These live in Lich's Vars system already" |
| Substitutions / gags | ⚠️ Count only | "Use textsubs.lic — this is a DownstreamHook" |

---

### 24.8 Lich Collaboration Layer — Future Roadmap

These are the features that make Lichborne the first real Lich dashboard. None of them duplicate Lich's automation. All of them surface Lich's state in a way no client has done before.

#### Active Scripts Panel
Show all currently running Lich scripts per character — name, uptime, status (running / paused / dying), with pause and abort controls. Source: parse the `LichScripts` stream, which Lich already sends when scripts start and stop. This stream is already received by Lichborne and rendered as raw text; the work is parsing its structure into typed records.

#### Script Log Panel
First-class treatment for Lich script `echo` output — distinct from game text, with per-script color coding, clear controls, and optional filtering by script name. The `LichScripts` and custom script streams already work via the existing stream discovery system; this is a display and UX improvement, not new plumbing.

#### Script Start / Stop from Client
A configurable button palette (per character profile) that sends upstream commands to Lich — `.t2`, `.buff stop`, `.script abort scriptname`. Uses Seam 3 (upstream command injection), which already works. Work is purely UI: a button strip in the toolbar or a command palette modal, configurable per character in the display YAML.

#### YAML Profile Viewer / Editor
Browse and edit per-character Lich automation config files (`Sekmeht-setup.yaml`, `Sekmeht-back.yaml`, etc.) from within Lichborne. Read path via the known Lich script directory. Write with confirmation prompt. Future: schema-aware editing for well-known scripts (t2 `training_list`, setup `combat_teaching_skill`, etc.) with typed fields rather than raw YAML.

#### Lich Variable Inspector / Editor
View of `Vars`/`UserVars` for any character scope, sourced directly from Lich's SQLite database (`data/lich.db3`) via `better-sqlite3` in the main process (read path: `lich:get-vars` IPC + `marshalParser.ts` to deserialize the Ruby Marshal blob). Helps users understand why a script behaves differently — "what is `$whisper` set to right now?" — and now lets them change it. Surfaced as the Lich Dashboard → Variables tab.

**Editable as of v0.9.0** (replacing the `;vars setup` GTK window, which crashes Lich — see BUGS.md B138). Editing is gated to the **connected character's own scope** (`session.useLich` AND `scope === ${game}:${character}`); other scopes stay read-only. **Writes go through Lich's runtime, not the DB**: a single atomic `;eq Vars['name'] = value; Vars.save` (ExecScript) mutates Lich's authoritative in-memory `@@vars` AND forces an immediate disk flush — a direct DB write would be unsafe because Lich's in-memory copy would clobber it on its next auto-save. Read remains SQLite (structured display of lists/hashes/times, cross-scope browse). The read/write asymmetry is intentional. Implementation details + the rationale for not reading via `;vars list` are in CLAUDE.md pitfall #53.

#### DownstreamHook / UpstreamHook Registry
Show which hooks are currently registered and which scripts own them. Helps diagnose conflicts — why `textsubs` isn't firing, why a stream is receiving unexpected data, which script is intercepting commands. Requires Lich to expose hook registry state, either via the `LichScripts` stream or a future TCP IPC channel.

---

### 24.9 Implementation Roadmap by Effort

#### Low Effort — File System Reads

All of these use Seam 1. The main process already has `read-file` and `list-map-dir` IPC handlers; these are additive.

1. **Auto-detect Lich map directory** — read map XML from `{LichDir}/data/` instead of requiring manual folder selection. Eliminates a setup step.
2. **Script browser** — list `.lic` files in `scripts/` and `scripts/custom/` so users can see what's available without opening a file manager.
3. **YAML profile viewer** — read `scripts/profiles/*.yaml` and display as formatted read-only text in a modal. Zero write risk.

#### Medium Effort — New UI Surfaces

4. **Active scripts panel** — parse `LichScripts` stream output into typed script records; render as a panel with name, uptime, status badge, and abort button.
5. **Script start/stop buttons** — configurable per-character button strip that sends upstream commands (`.t2`, `.buff stop`, etc.) via existing `send-command` IPC.
6. **YAML profile editor** — extend viewer with write capability; confirmation prompt before saving; diff view before commit.

#### Higher Effort — SQLite and IPC

7. **Lich variable inspector** — add `better-sqlite3` dependency; new main-process IPC handler reads `Vars`/`UserVars` from `data/lich.db3` for the current character; renderer displays as searchable key-value table.
8. **Hook registry** — requires either Lich to expose hook state via stream or a direct TCP IPC channel. Longer-term.

#### Long-Term — Direct Lich IPC

9. **Lich TCP API** — use `reusable_tcp_server.rb` as the basis for a bidirectional Lichborne ↔ Lich channel. Enables real-time script state, variable subscriptions, and hook management without polling streams. Requires coordination with Lich5 maintainers.
10. **Lich JSON map format** — load `data/DR/map-*.json` natively in addition to XML, giving access to Lich's richer map metadata (room UIDs, zone graph, node notes).

**Stream title as display label:** A `<streamWindow id="moonWindow" title="Moons"/>` declaration stores `streamTitles["moonWindow"] = "Moons"`. When adding the stream as a panel tab, `addDiscoveredTab` uses `streamTitles[streamId] ?? streamId` for the label — so the tab shows "Moons" while the internal `id` stays `"moonWindow"`. When no title is declared the stream ID is used with its first character uppercased (`"LichScripts"` → label `"LichScripts"`). The title is purely cosmetic; all routing uses the stream ID.

---

## 25. Rewrite vs. Refactor Analysis

> Decided 2026-05-12 after full audit of Lichborne internals, Lich5 architecture, and three-client import review. See Section 24 for the Lich-forward philosophy that drives these conclusions.
>
> **The full phased release plan (v0.2 through v0.7) with per-release checklists lives in Tracker.md under "Lich-Primary Roadmap".**

### 25.1 The Honest Case Against a Rewrite

A blank-page rewrite sounds appealing when a codebase has grown in the wrong directions. But Lichborne is not a legacy mess — it is 0.1.x software with real working parts and real users. The case against an immediate rewrite:

- **The parser is the hardest part, and it works.** `StormFrontParser.ts` is 738 lines of hard-won XML parsing, edge-case handling, and stream routing. A rewrite does not make this easier — it makes it slower.
- **Virtual scrolling is solved.** The `followOutput` / `suppressUnpinRef` / `totalListHeightChanged` architecture took significant iteration. A rewrite restarts that clock.
- **The wrong parts are the cheapest to cut.** The automation ambitions (Groups/Modes, client-side variable system, complex import wizard expectations) are not deeply entangled. They can be frozen and removed without touching the core.
- **The right parts are addable.** The Lich Dashboard features (Active Scripts Panel, Variable Inspector, YAML Editor) are new surfaces, not replacements. They compose on top of existing IPC infrastructure.

**The honest recommendation: targeted refactor + additive build over 3–4 releases, not a blank-page rewrite.**

---

### 25.2 What to Scrap

These are areas where continued investment would be wasted. Scrap means: freeze scope, remove existing UI surface if it exists, and redirect to Lich.

| Area | Current State | What to Scrap | Why |
|------|--------------|---------------|-----|
| Automations tab | Partially built (Groups, Modes concept) | The automation layer entirely | Lich owns this — building a client-side version is permanently inferior |
| Groups / Modes system | Designed but not deeply implemented | The concept itself | Groups are a script concern; a Lich YAML profile already does this better |
| Import wizard ambition | Imports highlights + macros well; over-promises on triggers, aliases, substitution | The promise of full settings migration | Reframe as display migration tool (see 24.7) |
| Client-side variables | Not built yet but implied by alias `$var` handling | Any effort to build this | `Vars` lives in Lich SQLite; surface it via Variable Inspector instead |
| Client-side substitution | Not built | Any plan to build it | DownstreamHook already runs `textsubs.lic` before text reaches the client |
| Complex trigger logic | Import wizard accepts `#if` triggers silently | Full trigger engine | WatchFor in a Lich script has full Ruby; client logic will always be a worse version |
| Genie gags import | Silent drop today | Building a gag engine | Surface as "use textsubs.lic" notice instead |

**One physical action for each scrapped area:**
- Remove the Automations tab from the settings sidebar (or replace with a "Use Lich Scripts" informational panel)
- Remove Groups/Modes from the profile schema or freeze at current (no UI exposed)
- Rewrite the import wizard summary screen to distinguish "migrated" from "belongs in Lich" clearly

---

### 25.3 What to Keep and Go Deeper

These are Lichborne's actual competitive advantages. Each one deserves sustained investment.

| Area | Current State | Direction |
|------|--------------|-----------|
| `StormFrontParser.ts` | 738 lines, handles all known game XML | Keep as single source of truth; extend for new tags as discovered |
| Stream system | Virtual tabs, discovery, routing all work | Add stream-level color coding and per-stream clear controls |
| Virtual scrolling | `followOutput` + suppress-unpin pattern solved | Keep architecture; extend for timestamp display and search/filter |
| Theme engine | CSS variable system, JSON theme format | Go deeper: more granular tokens, guild themes, per-panel overrides |
| Highlight engine | Basic pattern matching with fg/bg | Go deeper: named groups, live test input, export/import per highlight set |
| Map panel | SVG rendering, BFS pathfinding, zone-aware | Go deeper: Lich JSON format support, auto-detect map dir from Lich path |
| Profile system | `_shared.yaml` + per-character YAML, debounced saves | Keep; extend to carry new features (script palette config, variable inspector prefs) |
| Contact/name system | Group-aware styling, profile-backed | Keep; add per-guild contact presets |

---

### 25.4 What to Add

These are the features that define Lichborne's unique position. None exist today. All compose on existing infrastructure.

#### Lich Dashboard

A new top-level panel group (or a dedicated sidebar section) that surfaces Lich's runtime state:

**ScriptList panel** — shows all currently running scripts: name, uptime, status badge (running / paused / dying), abort button. Parses the `LichScripts` stream, which is already received. Work: stream → typed record parser + React component.

**ScriptPalette panel** — a configurable grid of buttons, one per script command (`.t2`, `.buff stop`, `.script abort scriptname`). Buttons send via existing upstream command injection. Config stored in character YAML. Work: UI configuration surface + YAML schema extension.

**ScriptFeed panel** — first-class rendering of Lich script `echo` output. Today these go to raw stream tabs. Future: per-script color coding, clear button, filter by script name. Work: tagging stream lines with source script name (requires parsing LichScripts stream for script name context).

**HookRegistry panel** — read-only view of active DownstreamHooks and UpstreamHooks: which script owns each, in what order. Helps diagnose conflicts. Work: requires Lich to expose hook state (stream or TCP IPC) — longer-term dependency.

#### LichConfig surfaces

**YAML Profile Viewer/Editor** — browse `{LichDir}/scripts/profiles/*.yaml`. Read-only first release; write + confirmation prompt in second. Schema-aware editing for well-known scripts (t2 `training_list`, setup `combat_teaching_skill`) in a future release. Work: new main-process IPC handler for `{LichDir}/scripts/profiles/`, renderer modal.

**Variable Inspector** — read `Vars` / `UserVars` from `{LichDir}/data/lich.db3` via `better-sqlite3`. Searchable key-value table, updated on panel open or character switch. No write access. Work: `better-sqlite3` dependency, main-process read handler, renderer panel.

#### Richer Highlight Engine

The current highlight engine is a proof of concept. A production highlight engine:

- **Named groups** — highlights grouped into sets (Combat, Magic, RP, Navigation) that can be toggled as a unit
- **Live test input** — type a sample line in the highlight editor and see which rules match and how
- **Highlight export/import** — save a highlight set as a named JSON file; share via a community format compatible with the import wizard
- **Priority and conflict resolution** — explicit ordering, first-match vs. all-match mode per highlight group

#### Character-Aware Panels

Panels that adapt based on the connected character's guild and stats — sourced from the XML the parser already handles:

- Guild-specific exp skill layout (Trader has different skills than Ranger — show relevant ones first)
- Injury panel that knows which body part names the parser emits for this character's race
- Spell slot display that knows which circle names are relevant

#### Session Log with Lich Awareness

A structured session log that knows the difference between game text, script echo, and Lichborne system messages. Exportable as formatted plain text or JSON. Filter by stream, time range, or source type.

---

### 25.5 New Architecture: The LichBridge Module

The single largest structural addition is a `LichBridge` module that owns all Lich-specific IPC. Today, Lich-related logic is scattered: the Lich process launch is in the main process, the `LichScripts` stream is parsed in the renderer alongside game text, the map dir is user-selected manually.

`LichBridge` consolidates:

```
Main Process
└── LichBridge
    ├── FileReader
    │     reads scripts/, scripts/custom/, scripts/profiles/*.yaml
    │     exposes: list-lich-scripts, read-lich-profile, write-lich-profile
    ├── SqliteReader
    │     reads data/lich.db3 via better-sqlite3
    │     exposes: get-lich-vars, get-lich-uservars
    ├── StreamParser
    │     subscribes to the LichScripts stream from the renderer pipeline
    │     parses structured output into typed ScriptRecord[]
    │     exposes: lich-scripts-updated IPC event
    └── CommandInjector
          wraps existing send-command IPC for Lich-specific commands
          exposes: run-lich-script, abort-lich-script, send-lich-dot-command

Renderer
├── useLichBridge() hook — subscribes to lich-scripts-updated, exposes send helpers
├── ScriptListPanel — consumes useLichBridge().scripts
├── ScriptPalettePanel — calls useLichBridge().sendDotCommand()
├── VariableInspectorPanel — calls IPC get-lich-vars on open
└── YamlProfileModal — calls IPC read-lich-profile / write-lich-profile
```

This module has no coupling to the game parser. It is a separate IPC surface. It can be added without touching `StormFrontParser.ts`, the stream system, or the highlight engine.

---

### 25.6 Recommendation

**Do not rewrite. Execute this plan across 3–4 releases:**

**Release A — Freeze and reframe** (no new user-facing features, internal cleanup)
- Remove or stub the Automations tab
- Rewrite import wizard summary screen to clearly distinguish "migrated" from "belongs in Lich"
- Add "not yet supported" notices for substitutions, gags, complex triggers, variables
- Fix the known import bugs from the backlog (Frostbite bgColor, built-in filtering, Genie `$variable` flagging)

**Release B — Lich visibility (low effort seams)**
- Auto-detect Lich map directory from known Lich path
- Script browser: list `.lic` files in `scripts/` and `scripts/custom/`
- YAML profile viewer: read-only modal for `scripts/profiles/*.yaml`

**Release C — Lich Dashboard**
- `LichBridge` module with `FileReader`, `StreamParser`, `CommandInjector`
- ScriptList panel (parses `LichScripts` stream → typed records)
- ScriptPalette panel (configurable dot-command buttons per character)

**Release D — Deep integration**
- Variable Inspector (SQLite read via `better-sqlite3`)
- YAML profile editor (write + confirmation)
- Richer highlight engine (named groups, live test input)

At no point is a blank-page rewrite the right answer. The core is sound. The direction was wrong in one dimension (automation ambition). Correcting the direction and building additively gets Lichborne to a unique, defensible position faster than starting over.

### 25.8 Hybrid Map System — Design Spec

#### Background

Lichborne's map panel has two distinct rendering modes:

1. **Image mode** (default when Lich is configured): Loads Lich's `map-*.json` database and displays the actual map artwork (GIF/PNG from `maps/`) with an SVG overlay highlighting the current room. Zero configuration beyond `lichPath`.

2. **Graph mode**: Renders an SVG node graph using Genie XML map data for spatial coordinates. Works standalone (direct-connect users without Lich) — Genie nodes become orphan placeholders. When Lich is also loaded, rooms are matched and full navigation is available.

If Lich is not configured or its map file cannot be found, the panel auto-switches to Graph mode on startup.

#### Why Two Modes

Lich image maps are authoritative and require no setup beyond a Lich install. Genie maps add spatial awareness — explicit X/Y/Z coordinates and zone groupings that let you see the world as a connected graph. The hybrid treats them as complementary: Lich owns *what the room is* and *how to get there*, Genie owns *where it is in space*.

#### Data Sources

**Lich JSON** (`data/DR/map-*.json`):
- `id` — Lich internal room ID (not the Simutronics room number)
- `title` — `["[[Zone, Room Name]]"]` — strip outer `[[` `]]` for display
- `description` — array of strings (day/night variants); may be null/undefined
- `wayto` — `{ "destLichId": "movement command" }` — authoritative navigation; may be null
- `image` / `image_coords` — map artwork reference (image mode only)
- `tags`, `location` — metadata

**Map file selection**: `find-lich-map-file` scans **all subdirectories** under `data/` (DR, GS, GS3, TF, DRX, DRT, DRF, and any future codes) and picks the `map-*.json` file with the **highest numeric sequence** across all of them (e.g. `map-1778475193.json` > `map-1776456844.json`). Sequence number is extracted via the capture group in `/^map-(\d+)\.json$/i`. Modification time (`mtimeMs`) is used as a secondary tiebreaker for any two files with the same sequence number (shouldn't happen in practice, but covers edge cases such as a file being copied into a second game folder). Using mtime as the primary sort was considered but is unreliable — mtime resets when files are copied or unzipped.

**Genie XML** (`Map*.xml` files):
- `<zone name="..." id="...">` — each file is one named zone
- `<node id="..." name="..." note="alias|alias2" color="#RRGGBB">` — room node
- `<description>` — can appear twice (day/night variants)
- `<position x="..." y="..." z="..." />` — spatial coordinates, LOCAL to this zone file
- `<arc exit="..." move="..." destination="genieNodeId" />` — connections (not used for navigation)

#### Cross-Reference / Matching

Rooms are matched between the two databases by title, then description, then note alias:

1. Strip `[[` `]]` from Lich title → compare to Genie `node.name` (exact string match)
2. If multiple title matches: compare normalized descriptions (collapse whitespace, lowercase)
3. Fallback: parse `node.note` as pipe-separated aliases, repeat title+description match for each alias
4. First match wins; a Lich room can only be matched once (first match wins)

Once matched, each Lich room gains a `GenieAugment`:
```typescript
genieId:  number   // Genie node ID within its zone
zoneName: string   // zone name (e.g. "The Crossing")
zoneId:   string   // zone id attribute
x, y, z:  number   // Genie local coordinates within zone
color?:   string   // Genie node color hex
note?:    string   // pipe-separated aliases
```

Unmatched Genie nodes become **orphans** — kept in `orphansByZone: Map<string, GenieNode[]>` and rendered with a dashed border and `?` badge. Their count appears in the graph legend.

#### Load Order

Genie loading is gated on Lich finishing first:
```
dbStatus: 'idle' → 'loading' → 'ready' | 'error'
```
The `loadGenie` effect only fires when `dbStatus === 'ready' || dbStatus === 'error'`, ensuring `titleIndex` is fully populated before matching begins. For direct-connect users (Lich error), all Genie nodes become orphans since `titleIndex` is empty.

#### Genie Load Cancellation

A **generation counter** (`genieGenRef`) prevents stale async loads from overwriting cleared state:
- `loadGenie`: captures `const gen = ++genieGenRef.current` at start; checks `if (gen !== genieGenRef.current) return` after every `await`
- `clearGenieFolder`: does `genieGenRef.current++` to invalidate any in-flight load

#### Graph View — Zone-by-Zone (Phase 1)

The graph renderer operates on one Genie zone at a time, auto-switching as the player moves:

- **Visible nodes**: all Lich rooms whose augment zone = current zone, plus orphan Genie nodes from that zone
- **Arc lines**: drawn from Lich `wayto` edges — for each (lichId → destLichId) edge, if both have Genie positions in the current zone, draw a line between them
- **Cross-zone exits**: amber `◆` diamond rendered above nodes that have at least one `wayto` destination in a different zone; count shown in legend
- **Node positions**: Genie `(x, y)` local coordinates directly used as SVG coordinates
- **Navigation**: clicking a node → sends the Lich `wayto` command (BFS walk available via detail panel)
- **Unmatched Genie nodes**: shown at their Genie position, dashed border, `?` badge, neutral color
- **Zone auto-switch**: when current room changes to a different zone, graph fits/centers on new zone

**Direct-connect / no-Lich mode**: `lichDb` is empty; all Genie nodes are orphans. Graph is still fully browsable. Toolbar shows "browse only" instead of matched count.

#### Persistence

- `viewMode` (`'image' | 'graph'`) — `localStorage` key `lichborne.mapViewMode`
- `genieMapsDir` — `localStorage` key `lichborne.genieMapsDir` **and** `_shared.yaml` (via `scheduleSharedProfileSave()`) so it survives across logins. Added to `SharedProfile` type and both `buildSharedProfile` / `importSharedProfile`.
- `mapLabelMode` — `localStorage` key `lichborne.mapLabelMode.v2` (v2 suffix to reset stale `'short'` default from old key to `'none'`); also persisted per-character in profile.

#### Component Structure

```
MapPanel.tsx          — coordinator: database loading, shared state, toolbar, view toggle
  MapImageView.tsx    — Lich image + SVG overlay
  MapGraphView.tsx    — SVG node graph (zone-by-zone)
```

State owned by MapPanel (passed as props to sub-views):
- `lichDb: Map<number, LichRoom>` — full Lich room database (React state)
- `imageIndex: Map<string, LichRoom[]>` — image filename → rooms (React state)
- `titleIndex: React.MutableRefObject<Map<string, LichRoom[]>>` — ref, lookup only, not passed as prop
- `augments: Map<number, GenieAugment>` — lichId → Genie augmentation
- `orphansByZone: Map<string, GenieNode[]>` — unmatched Genie nodes by zone
- `viewMode: 'image' | 'graph'`
- `genieMapsDir: string`
- `genieStatus: 'idle' | 'loading' | 'ready' | 'error'`
- `genieProgress: { loaded: number; total: number } | null`
- `currentRoom: LichRoom | undefined`

#### CSS Classes (map-panel.css)

- `.map-panel` / `.map-panel--large` — outer container
- `.map-toolbar` — top bar with tabs, folder picker, status hints
- `.map-toolbar-location` — right-aligned current location label
- `.map-genie-progress` / `.map-genie-progress-bar` — 2px progress stripe
- `.map-canvas-wrap` — fill remaining height, clipping container
- `.map-view-wrap` — flex column, position:relative, overflow:hidden (used inside sub-views)
- `.map-subbar` — secondary toolbar row (z-level chips, zoom buttons)
- `.map-label-select` / `.map-label-select--sm` — label mode dropdown
- `.map-detail-close` — close button on room detail panel
- `.map-detail-meta` — italic/muted metadata line in detail panel

#### What Genie Arcs Are NOT Used For

Genie `<arc>` elements are intentionally ignored for navigation. Lich `wayto` is the single source of truth for room connections and movement commands. Genie arcs are only used as a display fallback for orphan nodes where no Lich wayto is available.

#### Graph View — World Stitching (Phase 2, not yet implemented)

In world view, all zones are rendered in a single continuous SVG coordinate space. Since each Genie zone file uses its own local coordinate system, zones must be given global offsets.

**Zone offset algorithm (BFS stitching):**

1. Choose a reference zone (e.g. "The Crossing") — assign it global offset `(0, 0)`
2. Find all cross-zone Lich `wayto` edges where source and destination rooms both have Genie augments in *different* zones
3. For each such edge `(roomA in ZoneA) → (roomB in ZoneB)`:
   - `ZoneB.globalOffset = ZoneA.globalOffset + (A.localPos - B.localPos)`
4. BFS outward; conflicting offsets (multiple connections between same two zones) averaged by connection count
5. Isolated zones placed in a grid off to the side

**Rendering**: every node's screen position = `zone.globalOffset + node.localPos`. Only nodes within the SVG viewport are rendered.

---

### 25.7 Release A — Lessons from Testing

Release A was completed and tested against real Genie, Frostbite, and Wrayth config files in 2026-05-12. Several parser edge cases were discovered that were not visible from reading the code:

- **Wrayth `\x` prefix on client commands**: `xml toggle containers` and `xml toggle dialogs` use the same `\x` direction prefix as movement macros. The builtin check was running before prefix stripping, so these slipped through as READY. Real-file testing caught this immediately. Lesson: the three-parser architecture is correct, but each parser needs to be exercised against real files — the format has undocumented quirks that only appear in production data.
- **Empty file truthiness bug**: `fileTexts[slot.key]` was falsy for empty files (e.g. `gags.cfg` with no rules), showing "Not loaded" even after a successful read. Fixed to `slot.key in fileTexts`.
- **"Belongs in Lich" section correctly absent**: For users whose configs have no scripts, strings, gags, or variables, the amber section correctly hides — the conditional logic works as designed.
- **Wrayth theme** (corrected v0.11.1): the earlier note here claimed "Wrayth XML has no color preset or theme section." That was wrong — it was based on a config that happened not to have one. Wrayth DOES have a `<presets>` block (speech/whisper/thought/roomName/bold/command/link colors), and as of v0.11.1 it imports as an "Imported from Wrayth" theme via `parsePresets`, same as Genie's preset.cfg. The Theme Colors tab now appears when presets are present.
- **Wrayth highlights live in `<strings>`, not `<highlights>`** (fixed v0.11.1): the Release-A parser looked for a `<highlights>` block that Wrayth exports never contain, so it silently imported zero highlights and merely counted `<strings>` (mislabeled as substitutions). `<strings>` IS the highlight section — `parseStrings` now imports them with palette colors. The canonical lesson (exercise parsers against real files) bit again here: this gap survived from Release A until a tester (Thanator) brought a real export in v0.11.1. Also fixed in the same pass: `<names>` colors now generate per-color contact templates, and all 10 macro sets import (was set 0 only).

---

## 26. Release C — Lich Dashboard Design

> Decided 2026-05-14 after full audit of Lich5 source code (`C:\temp\lich-dev\lich-5`).
> Constraint: no dependency on community-maintained Lich scripts. Must work with Lich core only.

---

### 26.1 Constraint Analysis

The original Release C design assumed parsing the `LichScripts` stream, which is produced by `script-watch.lic`. After auditing Lich5 source, that assumption is wrong: **Lich's core sends no XML or text events about script lifecycle**. The `LichScripts` stream only exists when `script-watch.lic` is running. We cannot rely on it.

**What Lich5 core exposes natively (no scripts needed):**

| Source | What it contains | Accessible how |
|--------|-----------------|----------------|
| `;listall` core command | Comma-separated list of running script names, with `(paused)` suffix | Send upstream; parse text response |
| `;pause name`, `;kill name` | Script control | Send upstream; already works |
| `lich.db3` → `lich_settings` | Lich config key-value pairs, plain strings | Direct SQLite read from Node.js |
| `lich.db3` → `session_summary_state` | Active game sessions (character name, started_at, state) | Direct SQLite read; feature-gated |
| `lich.db3` → `uservars` | Per-character variables — Ruby Marshal BLOBs | Cannot read from Node.js without a Marshal parser; deferred to Release D |
| Active Sessions TCP API | Session list via JSON over TCP (port 42,857) | Feature-gated; tracks sessions not scripts |
| `scripts/`, `scripts/custom/` | Available `.lic` files | File system read; already done in Release B |
| `scripts/profiles/*.yaml` | Lich automation YAMLs | File system read; already done in Release B |

**What the `;listall` response looks like** (from `global_defs.rb` line 2286):
```
--- Lich: no active scripts
--- Lich: t2, buff (paused), tend, repository
```

The format is a single line: comma-separated names, each optionally followed by ` (paused)`. This is the only output from `;listall`. Because of the specific `--- Lich: ` prefix and the bounded character set of script names (`[a-zA-Z0-9_-]`), this is reliably distinguishable from other Lich messages (`--- Lich: t2 does not appear to be running!` contains `!`; other messages contain natural language that doesn't match the list regex).

**What is NOT feasible in Release C:**
- Real-time push events for script start/stop (no core mechanism; requires a script)
- Per-script uptime from Lich (not in `;listall` output; tracked locally by Lichborne from first observation)
- Reading `uservars` (Ruby Marshal BLOBs; deferred to Release D)
- Writing to Lich YAML profiles (deferred to Release D)

---

### 26.2 LichBridge Module

A new `LichBridge` module in the main process consolidates all Lich-specific IPC. Today this logic is scattered: script browser IPC is ad-hoc, Lich process launch is inline in `main.ts`. LichBridge gives it a home.

```
Main Process
└── src/main/lichbridge/
    ├── index.ts              — assembles LichBridge, registers IPC handlers
    ├── fileReader.ts         — wraps existing list-lich-scripts / read-lich-profile IPC
    ├── scriptPoller.ts       — `;listall` polling + response parsing logic
    ├── commandInjector.ts    — typed wrappers for Lich-specific upstream commands
    └── sqliteReader.ts       — reads lich_settings (and future uservars)

Renderer
└── src/renderer/
    ├── hooks/useLichBridge.ts   — subscribes to IPC events, exposes helpers
    ├── components/ScriptListPanel.tsx
    └── components/ScriptPalettePanel.tsx
```

The module has no coupling to `StormFrontParser` or the highlight/trigger engine. It is a separate IPC surface added alongside the existing game text pipeline.

---

### 26.3 Script List via `;listall` Polling

#### Why polling, not streaming

Lich core has no push mechanism for script events. The only native way to get the current script list is to ask for it with `;listall`. We poll every 5 seconds. This is identical to how `script-watch.lic` works (it loops on a configurable `passive_timer`) — the difference is we parse in the client rather than rendering raw text.

#### Request-response correlation

The renderer (via `useLichBridge`) sends `;listall` on a 5-second interval while connected. To suppress the response from being displayed as game text:

1. When `;listall` is sent, `scriptPoller.ts` sets `pendingScriptList: true` in the main process (or the renderer via a ref).
2. GameWindow's event loop checks each incoming line: if `pendingScriptList && line.text.startsWith('--- Lich: ')` → intercept and parse, do not add to `mainLines`, clear `pendingScriptList`.
3. A 3-second timeout resets `pendingScriptList` if no response arrives (Lich offline or slow).

This is implemented entirely in the renderer event loop — no main process changes needed beyond sending the command.

#### Response parsing

```typescript
// In GameWindow event loop:
const SCRIPT_LIST_PREFIX = '--- Lich: ';
const SCRIPT_LIST_PATTERN = /^--- Lich: (?:no active scripts|((?:[a-zA-Z0-9_-]+(?:\s+\(paused\))?)(?:,\s*[a-zA-Z0-9_-]+(?:\s+\(paused\))?)*))$/;

function parseScriptList(line: string): ScriptRecord[] | null {
  const m = line.match(SCRIPT_LIST_PATTERN);
  if (!m) return null;
  if (!m[1]) return [];  // "no active scripts"
  return m[1].split(/,\s*/).map(entry => {
    const paused = entry.endsWith('(paused)');
    const name = entry.replace(/\s+\(paused\)$/, '').trim();
    return { name, paused, custom: false }; // custom resolved separately
  });
}
```

`custom` is resolved by cross-referencing with the script browser's known file list: if `scripts/custom/${name}.lic` exists → `custom: true`.

#### `ScriptRecord` type

```typescript
interface ScriptRecord {
  name: string;         // script name as Lich reports it
  paused: boolean;      // true if "(paused)" in `;listall` output
  custom: boolean;      // true if found under scripts/custom/
  firstSeen: number;    // Date.now() when first observed (uptime clock origin)
}
```

`firstSeen` is tracked in a `Map<string, number>` keyed by script name, persisted in a ref. When a script disappears from the list and reappears, `firstSeen` resets. This gives approximate uptime without any Lich-side tracking.

The script list is sorted by `firstSeen` descending — the most recently launched script appears at the top.

#### Polling lifecycle

- Polling starts `onConnect` (after `GameWindow` mounts)
- Polling stops `onDisconnect`
- Interval: 5 seconds (configurable via `SCRIPT_POLL_INTERVAL_MS` constant)
- The `;listall` command is sent via the existing `send-command` IPC path — no new plumbing

---

### 26.4 Active Scripts Panel

A new panel type (`panel-id: 'lichScripts'`) available in the Panel Manager. Not shown by default — user adds it.

#### Layout

```
┌─ Lich Scripts ────────────────────────────────────┐
│ [▶ t2]           running   0:14:32   [⏸] [✕]     │
│ [C buff]         running   0:03:11   [⏸] [✕]     │
│ [C tend]         paused    0:00:45   [▶] [✕]     │
│ [▶ repository]   running   0:01:02   [⏸] [✕]     │
└──── 4 scripts · last updated 0:00s ago · polls every 5s ───┘
```

**Column layout:**
- **Type badge**: `C` (amber, custom) or `▶` (dim, core) — identifies whether the script is from `scripts/custom/` or core
- **Name**: script name, monospace
- **Sort order**: newest first by `firstSeen` — most recently started script at the top
- **Status**: `running` (green), `paused` (amber), or `killing` (red — set optimistically on kill click; script is evicted from the list immediately on the next poll that confirms it is gone, bypassing the normal 8s linger window)
- **Uptime**: `hh:mm:ss` from `firstSeen` — approximate (from first Lichborne observation)
- **Pause/Resume button**: ⏸ when running, ▶ when paused — sends `;pause name` or `;unpause name`
- **Kill button**: ✕ — sends `;kill name`, with a confirmation popover

**Footer:** `N scripts · last updated Xs ago · polls every 5s` — shows script count, staleness, and a reminder that the list is not real-time.

**Empty state:** "No scripts running. Use `;scriptname` in the command bar to start one." with a subtle link to open the Script Browser.

**Error state:** When Lich is not connected or `;listall` gets no response within 3s, show "Script list unavailable" instead of stale data.

#### Data flow

```
useLichBridge() hook
  → sends ;listall every 5s via lich:poll-scripts IPC
  → main.ts handler: LichBridge.pollScriptList() — arms a 4s
    silent-consume window, then issues ;listall
  → main.ts line handler: LichBridge.interceptLine() matches response
  → win.webContents.send('lich:scripts-update', entries)
  → consumes (hides) the line ONLY while the window is armed
  → renderer: onLichScriptsUpdate callback fires in useLichBridge
  → merges with linger window, sorts newest-first by firstSeen
  → ScriptListPanel re-renders

User clicks ⏸ on "t2"
  → useLichBridge().pauseScript('t2')
  → sends ";pause t2" via lich:pause-script IPC
  → next poll (≤5s) reflects paused state

User clicks ✕ on "buff" → confirms kill
  → killingRef.add('buff'), optimistic killing:true render
  → sends ";kill buff" via lich:kill-script IPC
  → next poll: buff absent → immediately evicted (skips 8s linger)
```

#### Auto-poll vs. manual `;list` (B79, v0.6.9)

`interceptLine` consumes (hides from the game window) any line matching the `;listall` response format — but matching on output format alone also swallowed a player who *typed* `;list` / `;listall` themselves. Fix: `LichBridge.pollScriptList()` (the auto-poll entry point) arms `expectAutoListUntil = now + 4000ms`; `interceptLine` consumes a matching line only while that timestamp is in the future, then disarms (one poll → one consumed response). A matching line arriving disarmed is a player-typed command and is returned through to the parser so the player sees normal output. The panel refreshes from *both* — a manual list is a valid source of truth. The 4s window expires on its own so a lost auto-poll response can't silently eat a later manual list. Per-session (`LichBridge` is per-session).

#### Panel registration

`ScriptListPanel` is a structured panel type (like Room, Exp) — not a stream. It consumes `lichScripts` state from `GameWindow` via props through `sharedFrameProps`. Registered in `PanelFrame`'s `renderPanel` switch and `PANEL_CATALOG`.

---

### 26.5 Script Control

All control actions use the existing upstream command pipe. No new IPC channels are needed.

| Action | Command sent | Lich core handler |
|--------|-------------|-------------------|
| Pause script | `;pause scriptname` | `global_defs.rb` ~line 2240 |
| Resume (unpause) | `;unpause scriptname` | `global_defs.rb` ~line 2250 |
| Kill script | `;kill scriptname` | `global_defs.rb` ~line 2231 |
| Start script | `;scriptname [args]` | `global_defs.rb` — script launch |
| List (poll) | `;listall` | `global_defs.rb` line 2277 |

Lich responds to pause/kill with a `--- Lich: ` confirmation message. These are NOT suppressed — they appear in the main text window so the player knows what happened. Only the `;listall` response is suppressed.

**Kill confirmation:** Because kill is irreversible, the ✕ button shows a popover: `Kill "t2"? This will stop the script immediately.` with `[Kill]` and `[Cancel]` buttons. The same `ContextMenu` portal component used elsewhere.

---

### 26.6 Script Palette

A configurable strip of buttons per character that sends upstream commands with one click. Stored in character YAML under a new `scriptPalette` key.

#### YAML schema extension

```yaml
# In CharacterProfile (profiles/Sekmeht.yaml)
scriptPalette:
  - label: "t2"
    command: ";t2"
  - label: "buff"
    command: ";buff"
  - label: "tend"
    command: ";tend"
  - label: "t2 stop"
    command: ";kill t2"
```

`command` is sent verbatim via the `send-command` IPC path. It can be any Lich command, game command, or alias. No special syntax required.

#### UI placement

The palette renders as a horizontal strip of compact buttons in the game toolbar, between the mode switcher and the theme button. Hidden when empty (zero buttons configured).

```
[Mode: Hunting ▼] | [t2] [buff] [tend] [t2 stop] | [Theme] [Settings] ...
```

Overflow: if more than 6 buttons are configured, a `[+N more ▼]` dropdown shows the rest.

#### Palette editor

Accessible via a `[⚙]` button that appears when hovering over the palette strip, or via Settings → Script Palette tab. A simple list editor: add/remove/reorder rows, each with a Label field and Command field. The editor auto-saves with a 500ms debounce to the character YAML via `scheduleProfileSave()`.

---

### 26.7 Lich Settings Viewer (bonus, low effort)

A read-only view of the `lich_settings` table in `lich.db3`. These are Lich's own configuration values — NOT per-character vars (those are in `uservars` and require Marshal deserialization). `lich_settings` uses plain text values, directly readable via `better-sqlite3`.

**What's in `lich_settings`:** Feature flags (stored as `feature_flag:name = "true"/"false"`), Lich system preferences, and any values written by `;set` commands.

**IPC handler:** `get-lich-settings` — reads and returns `SELECT name, value FROM lich_settings ORDER BY name ASC` as a key-value array.

**UI:** A collapsible section in the Settings panel footer, or a standalone modal reachable from the Lich menu. Shows `name → value` rows, searchable. Read-only. No write path in Release C.

**Graceful fallback:** If `lich.db3` cannot be opened (Lich not installed, wrong path), the section shows "Lich database not found" rather than crashing.

---

### 26.8 Session Awareness (opportunistic)

The `session_summary_state` table in `lich.db3` tracks active Lich processes when the `session_summary_store_and_reporting` feature flag is enabled (off by default, stored in `lich_settings`). Each row is one Lich process: `pid`, `session_name` (character name), `role`, `state`, `started_at`, `last_heartbeat_at`.

Lichborne queries this table on connection and shows a subtle indicator if multiple sessions are detected: "2 Lich sessions active: Sekmeht, Muse". This helps players who run multiple characters simultaneously know their other sessions are still alive.

**Implementation:** `get-lich-sessions` IPC handler — queries `session_summary_state WHERE state != 'exited'`, returns rows. The renderer checks for rows with `pid != currentPid` and surfaces them as a dismissable info chip in the toolbar.

**Graceful fallback:** Table may be empty (feature flag off) or not exist (older Lich version). Both cases return an empty array; no UI is shown. No error is raised.

---

### 26.9 Implementation Plan

#### New files

| File | Purpose |
|------|---------|
| `src/main/lichbridge/index.ts` | Module assembly, IPC handler registration |
| `src/main/lichbridge/sqliteReader.ts` | `get-lich-settings`, `get-lich-sessions` handlers; opens `lich.db3` via `better-sqlite3` |
| `src/renderer/hooks/useLichBridge.ts` | Polls `;listall`, exposes `pauseScript`, `killScript`, `startScript`, `sendPaletteCommand` |
| `src/renderer/components/ScriptListPanel.tsx` | Active scripts panel |
| `src/renderer/components/ScriptListPanel.css` | Panel styles |
| `src/renderer/components/ScriptPalettePanel.tsx` | Palette strip + editor |
| `src/renderer/components/ScriptPalettePanel.css` | Palette styles |

#### Modified files

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `ScriptRecord` type; add `LichScriptsUpdatedEvent` to GameEvent union |
| `src/renderer/types/profile-types.ts` | Add `scriptPalette: PaletteButton[]` to `CharacterProfile` |
| `src/renderer/types/profile.ts` | Build/import/clear handlers for `scriptPalette` |
| `src/renderer/components/GameWindow.tsx` | Add `;listall` response interception in event loop; add `lichScripts` state; wire `ScriptListPanel` and `ScriptPalettePanel` |
| `src/renderer/components/panels/PanelFrame.tsx` | Add `'lichScripts'` to panel catalog; add `renderPanel` case |
| `src/renderer/components/SettingsPanel.tsx` | Add Script Palette tab or section |
| `src/main/main.ts` | Import and initialize `LichBridge`; register `get-lich-settings` and `get-lich-sessions` IPC handlers |
| `package.json` | Add `better-sqlite3` dependency (needed for `sqliteReader.ts`) |

#### Dependencies

- `better-sqlite3` — synchronous SQLite from Node.js; already planned for Release D Variable Inspector; adding it in Release C for `lich_settings` and `session_summary_state` reads.

#### Explicit non-starters

These will not be built in Release C regardless of how easy they look:

- **Text substitution / gag engine** — `textsubs.lic` is a DownstreamHook; client substitution operates on already-transformed text and is redundant
- **Client-side variables** — `uservars` is Marshal; surface via Variable Inspector in Release D
- **Trigger logic / WatchFor** — belongs in Lich scripts
- **Anything that requires modifying Lich source** — Lichborne is a consumer, not a contributor to Lich core

---

## 27. Release D — Lich Dashboard Deep Integration

> **Target version:** v0.5.0
> **Theme:** Lich config management from within the client. Introduces `better-sqlite3` for SQLite reads, a TypeScript Ruby Marshal parser for `uservars`, and a unified Lich Dashboard modal that consolidates all Lich-facing surfaces.

### 27.1 Motivation

Release C shipped the Active Scripts Panel and Script Palette as standalone surfaces. By Release D there are four Lich-facing UI surfaces: Script List, Script Palette, YAML Profile Viewer (from Release B), and two planned new ones (Variable Inspector, Settings Viewer). Without consolidation these become a scattered set of unrelated modals. Release D unifies them into a single **Lich Dashboard** — one toolbar button, one modal, four tabs. This is the moment Lichborne earns its identity as the Lich-native client.

---

### 27.2 Lich Dashboard — Shell

A single modal opened by a **"Lich"** toolbar button (between Automations and Theme). Four tabs:

```
┌─ Lich Dashboard ─────────────────────────────────────────────── ✕ ─┐
│  [ Scripts ]  [ Variables ]  [ Profiles ]  [ Settings ]            │
├────────────────────────────────────────────────────────────────────┤
│  (active tab content)                                              │
└────────────────────────────────────────────────────────────────────┘
```

**Session awareness badge** — when `session_summary_state` contains more than one non-exited row, a subtle counter appears in the modal header:

```
┌─ Lich Dashboard ───────────────────── 2 sessions active ────── ✕ ─┐
```

The main toolbar "Lich" button gets a small unread-style dot badge when multiple sessions are detected, consistent with the existing tab unread indicator pattern. Single session or empty table — nothing shown anywhere.

The Script Palette strip in the main toolbar remains independent — it is a quick-fire action surface, not an information panel, and belongs in the toolbar chrome.

**Connected-only content** — the Variables tab requires an active connection (needs `game:character` scope to query the right row). Scripts tab is already connection-gated. Profiles and Settings tabs work without a connection since they are file/database reads. Disconnected state for Variables: dimmed tab with "Connect to view variables for a character" placeholder.

---

### 27.3 Scripts Tab

The existing `ScriptListPanel` content moves here verbatim. No functional changes — just a new home inside the modal chrome. The `lichScripts` PanelFrame panel type remains available as a dockable panel for users who want the list embedded in their layout.

---

### 27.4 Variables Tab

Searchable read-only view of `Vars` for the connected character, sourced from the `uservars` table in `lich.db3`.

#### Layout

```
┌─ Variables ─────────────────────────────────────────────────────────┐
│  🔍  Search variables…                          [↺ Refresh]         │
│  Sekmeht · DR                       Last saved: ~2 min ago         │
├──────────────────────────────────────────────────────────────────────┤
│  Key                    Value                    Type               │
│  ─────────────────────────────────────────────────────────────────  │
│  buddy                  Muse                     string             │
│  combat_teaching_skill  sling                    string             │
│  health_threshold       65                       integer            │
│  hunting_buddies        ["Totenus", "Enwah"]     array (2)          │
│  target                 Fenvaok                  string             │
│  whisper                Sekmeht                  string             │
│  …                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Scope label** — shows `CharacterName · GAME` so the player knows which character's vars are displayed
- **Last saved** — approximate staleness indicator derived from the 5-minute auto-save cycle; shown as "~N min ago" if the row's write time can be inferred, otherwise omitted
- **Search** — filters by key name, case-insensitive substring; results update instantly
- **Refresh button** — re-reads the BLOB from `lich.db3`; useful since Lich saves every 5 minutes and the panel opens stale
- **Type column** — shows the inferred type for each value (`string`, `integer`, `float`, `boolean`, `nil`, `array (N)`, `hash (N keys)`). Helps users debug scripts that store unexpected types.
- **Value column** — strings shown as-is; numbers as plain values; booleans as `true`/`false`; arrays and hashes as compact JSON; `nil` shown as `null`; unrecognized Marshal types shown as `[unsupported type]`
- **Sort** — alphabetical by key name; no user-defined sorting (the use case is "find a specific var", not "browse everything")
- **Read-only** — no write path; the Variable Inspector is a debugging tool, not an editor. Vars belong to Lich.

#### Data Source

```
Table:  uservars
Scope:  "DR:Sekmeht"   (XMLData.game + ":" + XMLData.name)
Column: hash           (Ruby Marshal BLOB)
```

Read via `better-sqlite3` in the main process. IPC handler `get-lich-vars` returns the deserialized key-value pairs as a plain JSON object.

#### TypeScript Marshal Parser

Ruby Marshal is a well-documented binary format. The values stored in `uservars` are always a plain Ruby Hash with string keys (Lich normalizes all keys to strings via `key.to_s` on write — see `vars.rb` line 41). Values are limited to the types that scripts actually use:

| Marshal code | Ruby type | TypeScript representation |
|---|---|---|
| `\x30` (`0`) | `nil` | `null` |
| `\x54` (`T`) | `true` | `true` |
| `\x46` (`F`) | `false` | `false` |
| `\x69` (`i`) | Integer | `number` |
| `\x66` (`f`) | Float | `number` |
| `\x22` (`"`) | String | `string` |
| `\x5b` (`[`) | Array | `JsonValue[]` |
| `\x7b` (`{`) | Hash | `Record<string, JsonValue>` |
| `\x3a` (`:`) | Symbol | `string` (converted, used for keys only) |
| `\x3b` (`;`) | Symbol link | `string` (cached symbol reference) |
| `\x40` (`@`) | Object link | resolved from cache |

The parser lives in `src/main/lichbridge/marshalParser.ts`. It consumes a `Buffer` and returns a `JsonValue`. Unknown type codes surface as `{ __unsupported: true, code: number }` — never throws, never crashes.

Since all keys in `uservars` are strings (not symbols), the most common outer shape is simply:

```
\x04\x08  {  length  (string_key => value)*
```

Where each string key is `\x22 + encoded_length + bytes` and values are any of the above types.

The parser does not need to handle `Object`, `Class`, `Module`, `Regexp`, `Bignum`, `Data`, `UserDefined`, or any custom Ruby types — these never appear in Vars. If an unknown code is encountered, the key is still shown with `[unsupported type]` as its value.

---

### 27.5 Profiles Tab

Extends the existing `LichProfileModal` (Release B viewer) with a write path.

#### Read path (existing)

- Lists all `{LichDir}/scripts/profiles/*.yaml` files
- Groups into character profiles (`Sekmeht-setup.yaml`, `Agan-setup.yaml`, etc.) and shared files (`base.yaml`, `base-empty.yaml`, `include-*.yaml`)
- Shows raw YAML in a read-only code view with syntax highlighting

#### Write path (new in Release D)

**Editing model** — two tiers:

1. **Schema-aware fields** — well-known top-level keys rendered as typed inputs rather than raw YAML. When the user selects a profile, the panel reads recognized keys and presents them as a form:

| Key | Field type |
|---|---|
| `hometown` | Text input |
| `safe_room` | Number input (Lich room ID) |
| `health_threshold` | Number input (0–100) |
| `repair_timer` | Number input (seconds, with `h/m/s` conversion hint) |
| `skip_repair` | Checkbox |
| `depart_on_death` | Checkbox |
| `combat_teaching_skill` | Text input |
| `hunting_buddies` | Tag list (add/remove names) |
| `training_list` | Read-only summary with item count and a link to raw YAML |

2. **Raw YAML editor** — all other keys, and a fallback for `training_list`, shown in a text area. The raw editor is always available via a "Edit raw YAML" toggle below the form fields.

**Diff before commit** — when the user clicks Save, a diff view appears before the file is written:

```
┌─ Save changes to Sekmeht-setup.yaml? ───────────────────────────┐
│                                                                  │
│  - health_threshold: 65                                          │
│  + health_threshold: 70                                          │
│                                                                  │
│  - hometown: Shard                                               │
│  + hometown: Crossing                                            │
│                                                                  │
│                              [Cancel]  [Save file]              │
└──────────────────────────────────────────────────────────────────┘
```

Diff is line-by-line, unified format, with red/green coloring using `--color-danger` and `--color-success`. Save writes the file atomically (write to `.tmp`, rename) so a crash during write never corrupts the original.

**IPC handlers:**
- `lich:list-profiles` — lists `*.yaml` files in `{LichDir}/scripts/profiles/`
- `lich:read-profile` — returns raw YAML string for a given filename (already exists from Release B)
- `lich:write-profile` — writes validated YAML string to a given filename; main process validates it parses as YAML before writing

**No schema enforcement** — Lichborne writes exactly what the user typed. It does not validate against script schemas. If the user breaks their training_list, that is their problem. The diff view is the safety net.

---

### 27.6 Settings Tab

Read-only view of `lich_settings` from `lich.db3`. Two sections:

#### Feature Flags section

Rows with `feature_flag:` prefix, displayed as clean toggle badges:

```
┌─ Feature Flags ──────────────────────────────────────────────────┐
│  session_summary_reporting           [OFF]                       │
│  log_enabled                         [ON]                        │
│  display_inline_exp                  [OFF]                       │
└──────────────────────────────────────────────────────────────────┘
```

- Prefix stripped from display name (`feature_flag:session_summary_reporting` → `session_summary_reporting`)
- Toggle badges are styled and color-coded but **not interactive** — read-only
- Values interpreted using the same truthy pattern as Lich: `1`, `true`, `on`, `yes` = ON; anything else = OFF

#### Other Settings section

All remaining `lich_settings` rows displayed as a key → value table:

```
┌─ Lich Settings ──────────────────────────────────────────────────┐
│  db_maint_last_at          2026-02-20T10:32:33Z                  │
│  db_maint_last_note        VACUUM ok pages 462->438, free 24->0  │
└──────────────────────────────────────────────────────────────────┘
```

**Graceful fallback** — if `lich.db3` cannot be opened (Lich not installed, path wrong, DB locked), all four tabs that require it show an inline "Lich database unavailable — check your Lich path in Advanced Settings" notice rather than crashing or showing empty content.

**Refresh button** in the Settings tab header re-reads from disk.

---

### 27.7 Session Awareness

Queried from `session_summary_state` in `lich.db3` on every connection and on Dashboard open.

**Active session criteria:** `state != 'exited'` AND `last_heartbeat_at` within the last 60 seconds. The heartbeat column is a Unix integer timestamp — compare against `Math.floor(Date.now() / 1000) - 60`.

**Multi-session badge:** appears in the Lich Dashboard modal header when active session count > 1. Shows character names from the `session_name` column (which maps to `game_code:character_name` — strip the game prefix for display). Example: "2 sessions active: Sekmeht, Agan".

**Toolbar dot badge** on the "Lich" button — appears when multi-session is detected. Same dot style as the panel tab unread indicator. Clears when Dashboard is opened and only one session is found.

**Feature flag check** — Lichborne does NOT check `feature_flag:session_summary_store_and_reporting` before querying. It simply queries and shows nothing if the table is empty or all rows are expired. This avoids an extra read and handles the off-by-default case gracefully.

---

### 27.8 Richer Highlight Engine

Independent of the Lich Dashboard, Release D upgrades the highlight system:

#### Named Groups (visual only)

Four built-in semantic groups with color identities:

| Group | Color | Intended use |
|---|---|---|
| Danger | `#e05050` red | Bleeding, stunned, death messages, hostile targets |
| Alerts | `#e0a030` amber | Roundtime warnings, mana warnings, expiry timers |
| Info | `#5080d0` blue | Rank gains, skill updates, system notices |
| Social | `#60b870` green | Player names, tells, group messages |

Groups are visible in the sidebar as colored filter chips. A rule can belong to one group (or none). Groups here are **organizational only** — they are separate from the Groups & Modes system (which is about automation activation). A highlight rule can belong to a highlight group AND have automation group assignments simultaneously.

#### Live Test Input

The existing test input field in the rule editor gains a "Test against session" button: feeds the last N lines from the current session through the rule and shows match/no-match results inline.

#### Import / Export

- **Export** — all highlight rules as a single JSON file; one-click from the Highlights tab header
- **Import** — merges an exported JSON into the current rule set; duplicate IDs are skipped; new rules are appended with `allGroups: true`

#### Priority Ordering

Each rule row in the sidebar gets a drag handle. Drag-to-reorder controls which whole-line rule wins when multiple rules match the same line (currently first-match-wins by list order, but order isn't visible or adjustable). The drag handle uses the same pattern as the Automations panel.

---

### 27.9 Implementation Plan

#### New files

| File | Purpose |
|---|---|
| `src/main/lichbridge/sqliteReader.ts` | `get-lich-vars`, `get-lich-settings`, `get-lich-sessions` IPC handlers; opens `lich.db3` read-only via `better-sqlite3` |
| `src/main/lichbridge/marshalParser.ts` | TypeScript Ruby Marshal BLOB deserializer; handles string, integer, float, boolean, nil, array, hash; returns `JsonValue` |
| `src/renderer/components/LichDashboard.tsx` | Unified modal shell with four tabs; session badge in header |
| `src/renderer/components/LichVariablesTab.tsx` | Variables tab content; search, table, refresh |
| `src/renderer/components/LichSettingsTab.tsx` | Settings tab content; feature flags + other settings |
| `src/renderer/styles/lich-dashboard.css` | All dashboard styles; `ld-*` class namespace |

#### Modified files

| File | Change |
|---|---|
| `src/main/lichbridge/index.ts` | Register new IPC handlers from `sqliteReader.ts` |
| `src/renderer/components/LichProfileModal.tsx` | Add write path: schema-aware form fields, raw YAML editor toggle, diff-before-save modal |
| `src/renderer/components/GameWindow.tsx` | Replace standalone Lich panels with `LichDashboard`; add `showLichDashboard` state; toolbar "Lich" button; session badge state |
| `src/renderer/components/HighlightsPanel.tsx` | Add group sidebar filter chips; drag-to-reorder; import/export buttons |
| `src/renderer/styles/lich-panels.css` | Extend for Dashboard tab content |
| `src/main/preload.ts` | Expose `get-lich-vars`, `get-lich-settings`, `get-lich-sessions` on `window.api` |
| `src/renderer/global.d.ts` | Add type declarations for new IPC calls |
| `package.json` | Add `better-sqlite3` dependency (if not already added in Release C) |

#### Build order

1. `better-sqlite3` + `sqliteReader.ts` — SQLite read pipeline foundation
2. Settings tab — plain text reads; validates the full IPC pipeline in minimal code
3. Session awareness — query `session_summary_state`; wire header badge and toolbar dot
4. `marshalParser.ts` — Marshal BLOB deserializer; unit test with a known BLOB
5. Variables tab — `get-lich-vars` IPC + Variables tab UI
6. Profiles tab write path — form fields, raw editor, diff view, `lich:write-profile` IPC
7. Lich Dashboard shell — assemble tabs into unified modal, replace existing surfaces
8. Highlight engine upgrades — groups sidebar, import/export, priority drag

#### Dependencies

- `better-sqlite3` — synchronous SQLite3 bindings for Node.js; must be listed in `dependencies` (not `devDependencies`) so it's bundled by electron-builder
- No other new runtime dependencies

#### Explicit non-starters for Release D

- **Writing `uservars`** — Vars belong to Lich; client write access would race with Lich's own 5-minute save cycle and corrupt script state
- **`script_setting` / `script_auto_settings` tables** — per-script private settings; not user-facing
- **`alias.db3`** — managed by `alias.lic`; not part of the Lich core surface area
- **`simu_game_entry`** — authentication blobs; no display value
- **YAML profile schema validation** — Lichborne writes what the user types; schema enforcement belongs to the scripts themselves

---

## 28. Session Log — Release E2

> **Target version:** v0.7.0 (the only remaining Release E2 deliverable after Sessions/multi-character shipped as E1 in v0.6.0)
> **Theme:** Lichborne writes clean per-character daily log files in plain text that players review in their own tools. The in-client UI is small and tactical — for "what just happened?" and "when did X occur?" — not a megabyte-scale log browser.
>
> **Status: shipped v0.7.0.** As-built notes inline below. The trimmed line format, gzip compression of closed day-files, the dual retention limits (`retentionDays` + `maxRawMB`), and the Settings disk-usage readout are all built — see §28.3. The trigger/highlight-fire capture toggle and a bulk "Delete all my logs" button were deferred (§28.10). §28.4.4 "Show in Log" shipped as a Quick-Search pre-fill rather than a timestamp-centered Recent Tail jump (no game-line→file-line mapping exists; searching the line text is exact and robust).

### 28.1 What it does

Captures every event that crosses the wire for each connected character — game text, per-stream content, script `echo` output, command echoes, and Lichborne system messages — and writes them to disk as structured records that can be filtered, searched, and exported. Players use external tools (VSCode, Notepad++, `rg`, `less`) for deep review; the in-client modal handles fast tactical lookups.

### 28.2 What gets captured

**By default:**
- `[main]` — game text
- `[thoughts]`, `[conversations]`, `[deaths]`, `[arrivals]`, `[spells]`, etc. — all named streams
- `[combat]`, `[atmospherics]`, `[group]`, `[log]`, `[LichScripts]`, custom Lich-script streams
- `[cmd]` — command echo (`>command`). As of v0.14.5 this covers EVERY command path that echoes on screen — typed, macro/alias sequences, AND panel-sourced/clicked sends (map walks, room-exit buttons, in-text command links, trigger `command` actions): all three GameWindow send funnels (`dispatchUserText`, `sendCommandSequence`, the canonical `sendCommand`) log the echo, so the log reads exactly like the screen did. Pre-v0.14.5 the canonical `sendCommand` echoed without logging, leaving clicked/triggered commands out of the log.
- `[sys]` — Connected/Disconnected/errors

**Off by default (opt-in for debugging):**
- Trigger / highlight fires (already covered by the Debug Fires tab)

**Never captured:**
- Vital ticks, RT timer updates, room title pings, indicator state changes — those are *state*, not history. Capturing them turns the log into noise. Raw XML lives in the Debug panel for the moments you need it.

Per-stream capture toggles live in Settings, per-character, so a player who only cares about thought-channel history can drop log volume by 95%.

### 28.3 Storage

**File layout:**
```
{userData}/Logs/
  Sekmeht/
    Sekmeht_2026-05-15.log     ← today, being appended (plain text)
    Sekmeht_2026-05-14.log.gz  ← closed days, gzip-compressed
    Sekmeht_2026-05-13.log.gz
  Agan/
    Agan_2026-05-15.log
```

One file per character per day. Character-prefixed filename so logs are identifiable when moved or shared. Sessions inferred from `[sys] Connected` / `Disconnected` markers within the file — multiple sessions per day collapse into one daily file.

**Format — plain text, `[HH:MM:SS][stream] text` per line (as built v0.7.0):**
```
[18:32:04][sys]         Connected
[18:32:05][cmd]         >look
[18:32:05][main]        [The Crossing, Town Square]
[18:32:42][combat]      The troll swings at you and connects!
[18:32:42][LichScripts] T2: Pausing — combat detected.
[19:14:33][sys]         Disconnected
```

The line carries only the **clock** — the date is already in the filename, and milliseconds weren't earning their ~4 bytes/line. (The original spec wrote a full `[YYYY-MM-DD HH:MM:SS.mmm]` stamp on every line; trimming it cut ~15 bytes/line, ~15-20%, for free. All parsers still accept the old dated format so pre-v0.7.0 logs keep working.) Plain text — double-click opens in Notepad.

**Format rationale:** considered JSONL (more structured) and per-stream files (one file per stream per day) — both rejected. JSONL costs ~50% more disk and isn't human-eyeball-readable. Per-stream files explode file count and complicate the multi-stream "layered view" use case. Single file with stream tags is the best balance of greppability + filterability + size.

**Compression (as built v0.7.0):** closed (non-today) day-files are gzip-compressed to `.log.gz` — ~85-90% smaller on repetitive game text. Today's file stays plain text (it's being appended to, and it's the one most likely to be grepped directly). Compression runs as background maintenance (streamed, off the main thread) at session start and on day-rollover; it's a per-character setting, **on by default**. The in-client viewer/search/export decompress `.log.gz` transparently; shell users grep old files with `rg -z`.

**Retention — two independent limits, both per-character (as built v0.7.0):**
- **`retentionDays`** (default 30) — delete day-files (compressed or not) older than N days. 0 = keep forever.
- **`maxRawMB`** (default 500) — a hard cap on the *uncompressed* `.log` footprint. Counts and prunes only raw `.log` files, never `.log.gz` archives, and never today's live file; oldest-first. With compression on this is effectively dormant (the only raw file is today's); with compression off it is the real bound on the folder. 0 = no cap. Archives are governed solely by `retentionDays`.

**Disk reality:** active DR combat is ~6 MB/hour → ~40-48 MB per 8-hour day uncompressed. With the format trim + compression on, a 30-day footprint is roughly today's file (~40 MB) + 29 archived days (~5 MB each) ≈ **~185 MB per character** — about 7-8× smaller than the uncompressed ~1.4 GB. A disk-usage readout in Settings surfaces the live number.

### 28.4 In-client UI

A single **"Logs" toolbar button** (next to Debug) opens a modal with three affordances. The modal does *not* try to be a viewer for 30 MB files — for that, players use their preferred external editor.

#### 28.4.1 Recent Tail — "what just happened?"

```
┌─ Sekmeht — Recent (current session) ───────────────────────────── ✕ ─┐
│ Streams: [✓] main  [✓] combat  [✓] thoughts  [ ] deaths              │
│          [ ] arrivals  [ ] conversations  [✓] cmd  [✓] sys           │
│ Presets: [ Everything ]  [ Combat ]  [ Social ]  [ Quiet ]           │
│ [☐] Dedup near-identical lines          ⬇ load older                 │
│ ──────────────────────────────────────────────────────────────────── │
│ 18:32:42 main      A troll lurches into view!                        │
│ 18:32:42 combat    The troll swings at you and connects!             │
│ 18:32:42 combat    The troll's swing nicks your left arm...          │
│ 18:32:50 cmd       >parry troll                                      │
│ 18:32:50 main      You parry the troll's blow.                       │
│ ──────────────────────────────────────────────────────────────────── │
│  [Open Logs Folder]    [Quick Search…]    [Export…]                  │
└──────────────────────────────────────────────────────────────────────┘
```

- Last ~200 lines on open; "load older" paginates upward (never loads whole file at once)
- **Stream multi-select**: checkboxes populated by scanning unique `[stream]` tags in the file at modal-open time. Built-in game streams + custom Lich-script streams (`LichScripts`, `moonWindow`, character-defined echo streams) all appear automatically — no hardcoded list to maintain
- **Preset layer buttons** flip multiple checkboxes at once:
  - **Everything** — all streams checked
  - **Combat** — `main`, `combat`, `group`, `thoughts`, `cmd`
  - **Social** — `thoughts`, `conversations`, `arrivals`, `deaths`
  - **Quiet** — `main`, `sys` only (just the prose)
- **Dedup toggle** collapses identical text across streams into one row with combined tags (e.g. `[main, combat] A troll swings at you...`) — useful when scripts double-emit via `respond` + `echo`
- Filter state, dedup preference, capture toggles all persist per-character via the existing `scopedKey` profile system

#### 28.4.2 Quick Search — "when did X happen?"

```
┌─ Sekmeht — Quick Search ─────────────────────────── ✕ ─┐
│ Search:  [tendcuts___________]  [☐ Regex]             │
│ Time:    [Today ▼]  from [00:00] to [now]             │
│ Streams: [✓] main  [✓] thoughts  [ ] combat ...       │
│ ──────────────────────────────────────────────────── │
│  3 matches in Sekmeht_2026-05-15.log                   │
│ ──────────────────────────────────────────────────── │
│ 14:08:11 main     You begin to tend the cuts on...     │
│ 14:08:14 main     Your tending efforts pay off.        │
│                                                         │
│ 18:43:02 main     Kaela tends your minor injury.       │
│                                                         │
│ 21:11:55 thoughts Sek thinks, "anyone got tendcuts?"   │
└─────────────────────────────────────────────────────────┘
```

- Substring or regex match across selected streams in selected time window
- Today / Last 7 days / Last 30 days / custom range
- Click a result → jumps into Recent Tail centered on that line with context above and below

#### 28.4.3 Open Logs Folder

Single button. Opens `Logs/{character}/` in the OS file manager. Player uses VSCode / Notepad++ / `less` / `rg` / whatever they prefer. **This is the primary surface for serious log review** — the modal exists for quick lookups.

#### 28.4.4 Right-click "Show in Log"

Right-click any line in the main game text → context menu adds **"Show in Log"** → opens Recent Tail centered on that timestamp. Players can scroll back from a moment in the game window straight to its context in the log.

### 28.5 Export — "Create Log File" builder (as built v0.7.0)

A dedicated third view in the modal, not a one-shot dump. The user picks:

- **Date range** — start/end date pickers (can span multiple days) + Today / 7-day / 30-day quick buttons.
- **Stream layers** — checkboxes for every stream found in the range, plus the Everything / Combat / Social / Quiet presets.
- **Format** — independent checkboxes: *include timestamps*, *include stream tags* (both off by default → clean transcript), *collapse duplicate lines* (dedup), *add summary header* (a `#` comment block with per-stream line counts), *one file per stream* (split).
- **Target** — **Copy to Clipboard** (always combined) or **Save File** (a single `.txt`, or a folder of per-stream `.txt` files when split is on).

All filtering/formatting/writing happens in main (`session-log:build-export`); only the `SessionLogExportSpec` and a small `SessionLogExportResult` cross IPC, so a 30-day export never serializes its line data to the renderer. `.txt` only for v1; JSON deferred unless a tester asks.

The earlier plan — "dump the current Recent view via one save dialog" — was replaced: a builder that re-queries a range is more useful and matches the user's intended workflow (turn stream layers on/off, pick a window, produce a clean readable file).

### 28.6 Settings (per-character)

As built v0.7.0:
```
┌─ Settings — Session Log ─────────────────────────┐
│ [✓] Enable session logging                        │
│   [✓] Game text          [✓] Stream content       │
│   [✓] Commands           [✓] System messages      │
│   [✓] Compress old logs                           │
│   Keep logs for          [ 30 ] days              │
│   Cap uncompressed logs  [500 ] MB                │
│   Disk usage   ·  8 days        12.4 MB · 4.1 MB compressed │
│   Log files              [ Open Logs Folder ]     │
└───────────────────────────────────────────────────┘
```

**App-wide, not per-character** (changed v0.7.0) — a single `SessionLogSettings` object ([sessionLogSettings.ts](src/renderer/sessionLogSettings.ts)) stored in `_shared.yaml` via `SharedProfile.sessionLog`. The SettingsPanel section and the Logs modal both read-modify-write that shared object (the modal owns the filter + export-format prefs, the panel owns capture/retention/storage), so configuring logging once applies it to every character. The "Trigger / highlight fires" capture category from the original mockup was dropped (§28.10); compression, the raw-size cap, and the disk-usage readout were added.

### 28.7 Multi-character semantics

- Each character writes independently to its own `Logs/{Character}/` folder — no cross-tab contention; the log *files* are per-character
- **Configuration is app-wide, not per-character** (changed v0.7.0). All Session Log preferences — capture gates, retention/compression/size cap, the Recent-tail filter, the Export format prefs — are one `SessionLogSettings` object in `_shared.yaml` (`SharedProfile.sessionLog`). Logging is configured once and applies to every character. (The original spec had these per-character; consolidating to shared matched how players actually think about logging — a single global behavior.)
- Window close: log buffer flush runs alongside the YAML save + `.bak` backup
- Modal is per-tab (opened from each GameWindow's toolbar) — shows only that character's log files, but the filter/format preferences it edits are the shared ones

### 28.8 Performance

- Buffered write: accumulate records in memory, flush every 1 second OR when buffer hits 100 records, whichever first
- Memory cap: 1 MB buffer — runaway flood (3600+ lines in a single combat) force-flushes and starts fresh
- Modal open: ~200 ms file scan for stream-tag discovery on a 100 MB file; "Loading streams…" placeholder
- Writes go through the existing `writeLog` IPC pattern (append-only sync write in main process); switch to async stream if profiling shows contention

### 28.9 Capture pipeline

Intercepts at the same point as the trigger engine and highlight engine — `GameWindow.onGameEvent` handler. The handler already iterates every event in the batch; logging adds one line per event-type. Capture is per-tab (each `GameWindow` logs its own character's events) but the capture *config* is the app-wide `SessionLogSettings` — `logToSession` reads it fresh per batch via `loadSessionLogSettings()` (a tiny localStorage read), so a Settings change applies to every open character immediately with no cross-component wiring.

For a category the user has opted out of, the capture check is a single boolean lookup against that config — effectively zero cost when off.

### 28.10 What's explicitly deferred

- **Live tail** — Recent Tail uses a "refresh" button rather than streaming the file. Live-tail would require Virtuoso-over-streaming-source plumbing; add later if testers ask
- **JSON export format** — `.txt` only for v1
- **Manifest files** (per-day metadata sidecar for sub-100ms modal opens) — scan is fast enough; add only if perf demands
- **Per-stream files** — single file with stream tags is simpler and fits the layered-view model
- **Cross-character search** — search is per-character (the modal lives in a per-tab context). Could be added later as a separate global-search modal if requested
- **Trigger / highlight-fire capture** (was the 5th capture category in §28.2 / §28.6) — not built in v0.7.0. The Debug Fires tab already covers it; revisit if a tester wants it persisted. As built there are four capture categories: game text (`main`), stream content, commands (`cmd`), system (`sys`)
- **"Delete all my logs" button** (§28.6 mockup) — not built. The Settings section ships the capture toggles, retention input, compression toggle, raw-size cap, a disk-usage readout, and an Open Logs Folder button; the bulk-delete button was dropped (retention + the size cap already bound growth, and Open Logs Folder lets a user delete manually)

> **Built after the original deferral:** log compression and the Settings disk-usage readout were both deferred in the first v0.7.0 cut, then built later in the same release after a tester measured ~6 MB/hour. See §28.3 for the compression + dual-retention design.

### 28.11 Implementation effort estimate

~2–3 days total:

| Slice | Effort |
|---|---|
| Capture pipeline + buffered file writer (main process) | 0.5 day |
| Log directory + retention pruner + per-character folders | 0.5 day |
| Settings panel section + per-character toggle persistence | 0.5 day |
| Recent Tail modal (scan, multi-select, presets, dedup, pagination) | 0.5 day |
| Quick Search modal (time range, regex, result navigation, jump-to-tail) | 0.5 day |
| Right-click "Show in Log" + Export + Open Folder + polish | 0.5 day |

### 28.12 Done when

A tester logs in, plays for an hour, opens the modal, sees their session, scrolls back, switches stream filters, hits a preset, searches for "tendcuts," exports a slice to a text file, opens the raw log file in Notepad, and right-clicks a line in the game window to jump straight to it in the log — all without surprises.

---

## 29. Profile Transfer — Platform-wide Export/Import (F38, v0.10.0)

### 29.1 Why

The Automations Export/Import (F29, in the Automations panel) only carried rules + a layout snapshot and imported into the *current* character. JadedSoul runs a couple dozen characters and wanted to configure one nicely — panel sizes/placements, which streams are added, fonts, theme, accessibility — and propagate that whole setup to the rest. Profile Transfer is the platform-wide superset: capture (selectively) **everything in a character's profile** and fan an import out to **many already-added characters at once**.

**Consolidation (v0.10.0):** because Transfer is a strict superset of the Lichborne→Lichborne Automations export, that export was removed and the ImportWizard's "Lichborne" source card was removed — Transfer is now the single Lichborne↔Lichborne path. The Automations panel keeps only the **"Import from another client…"** button (Wrayth/Genie/Frostbite legacy migration, which Transfer does not cover). The single-theme share (ThemePicker) and Session-Log export are unaffected — different granularity / domain.

### 29.2 Surface

- Entry: Launcher top-bar **"Transfer"** button → dispatches `lichborne:open-profile-transfer`; AppShell hosts the modal (it owns `sessions` + the per-session reload nonces).
- One modal, **Export / Import tabs** ([ProfileTransferModal.tsx](src/renderer/components/ProfileTransferModal.tsx)). Canonical chrome (pitfall #55): `--bg-base` body, `--bg-hover` header, `--accent` title.
- Files: `.lb.yaml` (LB = branding abbreviation) in a new **`Exports/`** folder, sibling of `profiles/` in userData. Main accessors `getExportsDir`/`ensureExportsDir` ([profiles.ts](src/main/profiles.ts)); IPC `profile-transfer:export|list-exports|read-export|open-import-dialog|open-exports-folder` ([main.ts](src/main/main.ts)). The import dialog's `defaultPath` is the Exports folder.

### 29.3 The model — categories are an allowlist of `state` suffixes

Core logic in [profileTransfer.ts](src/renderer/profileTransfer.ts). Each per-character setting is a `lichborne.{char}.{suffix}` key mirrored 1:1 into the YAML `state` map. `TRANSFER_CATEGORIES` is the single registry mapping a category to its exact suffixes:

| Category | Suffixes |
|---|---|
| Display & Accessibility | `settings` (minus `panelFontSizes`) |
| Panel Layout | zone added-flags, `*Tabs`, `*ActiveId`, `mainTopHeight`/`topPanelHeight`/`midPanelHeight`, `panelWidth`, `panelFontSizes` |
| Panel View Preferences | `mapViewMode`, `lichMapScale`, `streamTimestamps`, `scriptPalette`, `focus`, `expPins`, `expSort`, `expSortDesc`, `expFocusMode`, `rxpCapMin` |
| Theme | top-level `theme` + shared custom-theme def |
| Highlights / Triggers / Macros / Aliases | `highlights` / `triggers` / `macros` / `aliases` |
| Groups & Modes | `groups`, `modes` (+ `activeGroupStates`/`activeModeId` on Replace) |
| Contacts | `contacts`, `contact-templates` |

**Excluded:** `seededRepeatMacros`/`seededNumpadMovement`/`mainTopMigrated` (internal one-time flags), `discoveredStreams` (ephemeral), `commandHistory` (character history, not setup — the `automationStats` precedent). An allowlist is the safe default: a new key is omitted until explicitly registered, so it can never silently break a target. Adding a new per-character setting ⇒ register it here.

### 29.4 Build (export)

`buildProfileExport(source, selected)` reads the source's persisted `state` from its YAML (works disconnected; for an active source the modal `flushPendingProfileSaves()` first), then slices the selected categories. Output: `{ kind:'lichborne-profile', formatVersion:1, exportedBy, exportedAt, categories }` — only selected categories present; absent ⇒ "don't touch on import." Serialized with js-yaml.

### 29.5 Apply (import) — two write paths

`applyProfileImport(target, isActive, file, { merge, selected })`, unified over a `TargetStore` abstraction (read/write a suffix):

- **Inactive target** → staged YAML store: read `{Character}.yaml`, merge selected categories into a copy of `state` (+ `theme`), one atomic `writeCharacterProfile`. Never `buildCharacterProfile` (would rebuild `state` from empty localStorage and wipe the char).
- **Active target** → live localStorage store (`scopedKey`, same string/JSON representation as `importCharacterProfile`), then the modal calls `reloadSession(characterId)` → main's `session:reload` **arms a §13.9 state replay** (`replayTarget`/`holdingForReplay` — v0.13.3, the B165 root fix) and routes to the owner window → App bumps the session's reload nonce in the GameWindow `key` → full remount re-reads the imported state, then its replay request restores scrollback + every sticky state (hands/vitals/room/spell/RT/…). Pre-v0.13.3 the remount started from defaults — vitals self-healed on the next change but a long-parked HELD ITEM never re-sent a hand tag, so the hand bar stuck on "Empty" for the rest of the session (found while chasing JadedSoul's B165 cookbook report; her case likely turned out to be the pitfall-#78 protocol gap instead, but this hole was code-verified real). Applies to **focused AND backgrounded** sessions. Writing only the YAML would be overwritten on logout by stale live state — writing the working copy + remount commits it.

**Merge:** rules (highlights/triggers/macros/aliases/groups/modes/contacts) honor **Append** (dedup by the same content/id/name keys as ImportWizard; highlights/triggers/macros/aliases get regenerated ids) vs **Replace**. Config categories (Display/Layout/View/Theme) always overwrite when selected. `settings`/`panelFontSizes` split: Display preserves the target's `panelFontSizes`; Layout merges its own; Display runs before Layout.

### 29.6 Safety invariants

1. **Non-destructive:** writes only `state` (per-key) + top-level `theme`. Identity/launcher fields (`account`, `character`, `game`, `useLich`, `hidden`, `favorite`, `guild`, `circle`, `notes`, `profileVersion`) are top-level, never in `state`, structurally unreachable.
2. **Theme is app-wide** (single global `lichborne.theme`; `exportCharacterProfile` rewrites an active char's YAML theme from it). So theme pins cleanly only on *inactive* targets (applied on next connect); for active targets it can't be pinned and is flagged "app-wide — pick it from the theme menu" (the custom theme def is still added so it's available). Custom theme defs always land in shared `myThemes` and `_shared.yaml` is flushed after import.

See CLAUDE.md pitfall #56.


---

## 30. Lich-Integration Opportunities — Research (v0.11.2, NOT YET BUILT)

Framing (DESIGN.md §1, §24): Lichborne is a **display & configuration layer over Lich**,
not a Lich replacement. Genie and Frostbite are static front-ends; Lich is a live,
scriptable Ruby proxy with a SQLite store we already read/write (vars, pitfall #53). The
question driving this section: where does Lich give us capabilities Genie/Frostbite never
had that fit our lane (surface/configure Lich state — don't reimplement automation)?

This is a research backlog. Each item is a proposal with a rough cost and the Lich surface
it taps; **none is built**. Sequencing and specifics need sign-off before implementation.

### 30.1 Live Lich variables as a variable source — *biggest payoff*
The natural extension of v0.11.2's variable expansion (which surfaced state we *already*
track). Lich exposes a large runtime catalog the client never reads: `Char`, `Stats`,
`Skills`, `Society`, `gametimeepoch`, `Spell`/`Spells`, `Char.health/mana/...`, the full
`Vars` hash. Proposal: read these via the existing `;eq`/`lich:get-vars` plumbing and
expose under a `$lich.*` namespace in the trigger/macro/alias resolver. Cost: **medium-high**
— needs a new periodic/poll read path (or an on-demand `;eq` round-trip) + a cache, plus a
decision on staleness (live-poll vs lazy). The read asymmetry from pitfall #53 applies:
read via the structured SQLite/`;eq` path, never write. This is the "also pull live Lich
vars" option deferred from the v0.11.2 planning.

### 30.2 Script repository browser
Lich ships a `;repository` command (list/download community scripts). Today a tester types
`;repo` commands blind into the game stream. Proposal: a Lichborne panel that lists
available + installed scripts, shows versions, and installs/updates with a click — pure
display/config over an existing Lich capability (squarely in our lane). Cost: **medium** —
parse `;repository list` output (or read Lich's script dir + remote index), a panel UI, and
install via the silent-command path (pitfall #53's no-echo `onRunCommand`).

### 30.3 Richer running-script controls
We already poll `;listall` (LichBridge, pitfall #22) and have the Lich Scripts panel. Build
it out: per-script **pause/resume/kill** buttons, run-state, uptime, and the script's
declared variables — a real "process manager" for Lich scripts. Cost: **low-medium** (the
poll + command plumbing exists; this is mostly UI + wiring `;pause/;unpause/;kill`).

### 30.4 Surface Lich's mapper / `;go2`
Lich maintains its own room database and `;go2`/`;goto` pathing that we don't render. The
Lich Map already shows Lich's image tiles; a deeper integration could surface Lich's room
search and offer one-click `;go2 <room>` from the map or a search box. Cost: **medium** —
respect the boundary (Lich owns pathing/automation; we'd be a launcher/visualizer, not a
re-implementation). Overlaps the existing map work — design carefully to avoid duplicating
Lich's mapper rather than surfacing it.

### 30.5 Conceptual: what Genie/Frostbite did that Lich does better
Genie/Frostbite bundle their own variables, classes (≈ our groups/modes), `#`-commands, and
named windows because they had no proxy. We have Lich for all of that. The client's job is
to **make Lich's power legible and configurable**, not to grow a parallel automation engine.
Concretely that means: prefer surfacing Lich state (30.1) and Lich capabilities (30.2–30.4)
over building Lichborne-native scripting. The one place we own outright is *display* (themes,
panels, rendering) and *portability* (Profile Transfer) — keep new effort there or in the
"surface Lich" column, and keep pushing back on requests that would reimplement Lich.

---

## 31. Text Modification — Mutes & Substitutes (v0.12.x)

**Status:** spec'd + Phase 1 building. The #1 onboarding request from Wrayth/Genie/Frostbite
testers. All three sibling clients ship it; Lichborne previously counted-but-didn't-import it.

**Naming (Sekmeht, 2026-06-08):** the two are grouped under one **"Text Modification"** feature
category. "Gag" was renamed to **Mute** (friendlier; "mute or substitute text"). Internally the
rule type is `MuteRule` / `mutes.ts` / `scopedKey('mutes')`; the source clients' "Gag/Ignore"
terms survive only as import-side aliases.

### 31.1 What & why (native, client-side)
Two new per-character automation rule types ("Text Modification") that act on **displayed game text**:
- **Mute** (a.k.a. Gag/Ignore — Frostbite "Ignore", Genie "Gag", Wrayth `<ignores>`): a line
  matching the pattern is **suppressed from the window** — kill the static/noise (`has arrived!`).
- **Substitute** (all three call it "Substitutes"): matched text is **rewritten** (regex with
  `$1…` capture groups), e.g. mind-state words → numbers, damage rankings → fractions.

**Why native, not delegated to Lich `textsubs.lic`** (decision 2026-06-08, Sekmeht; Binu
concurred on placement). Gags/subs are a *display* concern — squarely Lichborne's lane, not
Lich automation. Concretely: (1) **Principle #2** — must work without Lich (SGE-direct users);
(2) **portability** — rules live in the character's YAML and ride Profile Transfer, vs Lich's
global `private_textsubs` which wouldn't transfer; (3) **import target** — Genie/Frostbite/Wrayth
exports need a reliable native home (writing into Lich YAML is Lich-required + fragile);
(4) **UX coherence** — gags + subs are one mental model; splitting them across the Lichborne UI
and Lich-YAML is the friction newcomers complain about; (5) **cost is low** — the regex +
capture-group + `interpolate($1…)` machinery already exists (triggers use it), so a substitute
is a render-pass reusing it, not a new engine. `textsubs.lic` stays the *complementary* tool for
what it does uniquely well (the spell→Elanthipedia hyperlink catalog, global cross-front-end
subs). (A one-way "push my substitutes to textsubs.lic" export was once floated as a Phase-3 bridge
but was **dropped** — Sekmeht, 2026-06-08; the native feature suffices and delegating re-imports the
no-Lich/portability problems above.) (Profanity — our north star — does gags native but delegates general
subs to Lich; we diverge on subs *only* because Lichborne supports no-Lich play, which Profanity
does not.)

### 31.2 Data model
Same shape/lifecycle as highlights/triggers (Principle #1 — dynamic `state.*`, no profile-shape
change), group-gated via `isRuleActive`:
```
MuteRule        { id, name, enabled, pattern, mode:'text'|'phrase'|'regex',
                 scope:'line'|'match', caseSensitive, stream?, groupIds, allGroups }
SubstituteRule { id, name, enabled, pattern, mode, caseSensitive,
                 replacement /* $1… */, stream?, groupIds, allGroups }
```
Per-character `scopedKey(character,'mutes' | 'substitutes')`, `load/save` mirroring `highlights.ts`.
`MuteRule.scope` mirrors `HighlightRule.scope` (Sekmeht request): **`line`** (default — hide the
whole line, the typical gag) or **`match`** (remove only the matched text, keep the rest). The
mute regex is **global** so `match` can `replace(re,'')` all occurrences. `stream?` is the optional
stream scope (Frostbite's `target`, Profanity's combat-gag); absent = all.

### 31.3 Render pipeline integration
One choke point in `GameWindow` where the per-batch `newMain: TextLine[]` is assembled, before
it commits to `lines`: **mute → substitute-rewrite → (existing highlight/contact styling at
render)**. Substitutes run *before* highlights so highlights style the substituted text (matches
Genie/Frostbite). Active rules are kept in a ref (`activeMutesRef` — compiled regex, filtered by
`isRuleActive(activeGroupStates)`), refreshed like `allHighlightRulesRef`.
- **Mute** = `applyMutesToSegments(line.segments, activeMutes)` ([mutes.ts](src/renderer/mutes.ts)):
  a `line`-scope match returns `null` (drop the `TextLine`); a `match`-scope match strips the text
  out of each segment (`replace(re,'')`, dropping now-empty segments — and the whole line if it
  empties). `match` is **per-segment**, so server styling survives and a match spanning segment
  boundaries isn't caught (same limit as per-segment highlighting). After a `match` removal the
  **whitespace gap is tidied** (collapse double-space, drop a space dangling before punctuation,
  trim the seam/edges) so `…the healer Quentin.` → `…the healer.`, not `…the healer .`.
- **Substitute** = `applySubstitutesToSegments` ([substitutes.ts](src/renderer/substitutes.ts)):
  `segment.text.replace(globalRegex, rule.replacement)` per-segment (native JS `$N`/`$&` capture
  refs — matches Genie's `$N`; the Frostbite importer converts its `\N`/`\0`). Preserves server
  styling; a match spanning segment boundaries isn't caught. Game-state vars are NOT interpolated
  (capture groups only — what the source clients use).
- **Scope = GLOBAL by default, with an optional per-rule stream restrict** (Sekmeht; = Genie's
  global model + Frostbite's per-rule `target`). The passes run over `newMain` (stream id `'main'`)
  **AND every `newStream[key]` buffer** ([GameWindow.tsx](src/renderer/components/GameWindow.tsx)
  `applyTextMods`), so a rule applies everywhere. If a rule's **`stream`** is set it's filtered to
  that one stream only (`!rule.stream || rule.stream === streamId`). The editor's **"Apply to"**
  dropdown (`STREAM_OPTIONS` in [mutes.ts](src/renderer/mutes.ts): All / Main / Thoughts /
  Conversation / Combat / Deaths / Arrivals) sets it; default `''` = all. Genie applies gags
  everywhere-but-Thoughts; we DON'T auto-skip Thoughts (a global rule means everywhere — Sekmeht).
  Room sub-streams aren't in `newStream` (they're room state), so they're untouched.

### 31.4 Session Log behavior (decided)
- **Gag** drops from **display only** — the raw line still hits the Session Log (a gag can never
  silently lose history). Naturally satisfied because logging is per-event in `onGameEvent`,
  upstream of `newMain` display assembly.
- **Substitute** logs the **rewritten** text (what you saw is what's recorded). *(Phase 2.)*

### 31.5 UI
**Mute and Substitute are TWO separate top-level Automations tabs** (Sekmeht — cleaner than one
nested "Text Modification" tab; matches the flat Highlights/Triggers/Macros/Aliases structure):
[MutePanel.tsx](src/renderer/components/MutePanel.tsx) and
[SubstitutesPanel.tsx](src/renderer/components/SubstitutesPanel.tsx). Both **mirror HighlightsPanel
exactly** (same `hp-*` classes: sidebar list + detail form, the Text/Phrase/Regex `hp-mode-toggle`,
the `Aa` case button, the `hp-actions` Save/Delete/Revert footer). Mute adds a `hp-scope-row`
Line/Match radio; Substitute adds a `Replace with` field (`$1` hint) instead. **Right-click menu**
([ContextMenu.tsx](src/renderer/components/ContextMenu.tsx) supports **nested submenus** — hover-
expand, flips left/up at the viewport edge, on top of the root-menu viewport clamp): the game-window
menu groups display-changing actions under **`Modify Text ▸`** (Highlight / Mute / Substitute, each
× "word" / "this line") and automation under **`Trigger ▸`**, then Show in Log / Clear — four short
root rows instead of ten flat ones (Sekmeht: "modify the text" vs "build something *from* the text").
Each `Mute …`/`Substitute …`/`Highlight …` opens the matching editor prefilled (`openMuteEditor` →
`mutePrefill` → AutomationsPanel `mutes` tab → unsaved draft, same flow as `highlightPrefill`).
(Profile Transfer likewise has **separate `mutes` + `substitutes` categories**.)

### 31.6 Import (flip 4 count-only paths → real)
| Client | Source | Notes |
|---|---|---|
| Genie | `#gag {/…/i}`, `#subs {a} {b}` | reuses `stripGenieSlashWrap`; route to gag/sub stores |
| Frostbite | `ignores.ini` `[ignore]`, `substitutes.ini` `[substitution]` | new `[ignore]` parser + **add `ignores.ini` slot**; `target`→`stream` (`@Invalid()` = all) |
| Wrayth | `<ignores disable="n"><h text=…/>` | ~10-line `parseIgnores` like `parseStrings`; substring; block `disable` flag |
New Gags/Substitutes preview tabs (data-driven, same checkbox/select-all UX). Step-1 scope notice
reworded (these now import instead of "belong in Lich").

### 31.7 Phasing
- **Phase 1 — Mutes** ✅ (native + import all three + right-click + scope).
- **Phase 2 — Substitutes** ✅ (native per-segment rewrite + import Genie/Frostbite + right-click).
- **Phase 3 — Stream scope** ✅ (global-by-default over all stream buffers + optional per-rule
  "Apply to" stream restrict). **Feature complete.** (A once-considered "push to textsubs.lic"
  export was **dropped** — Sekmeht, 2026-06-08; the native feature already does what's needed and
  delegating to Lich reintroduces the no-Lich/portability problems §31.1 lists.)

---

## 32. Visual, Interactive & AI Experiences — Backlog (brainstorm v0.12.x)

**Status:** Brainstorm / wishlist. None of these are built or scheduled — this section is the
durable home for the "graphics for text players" feature pipeline so it doesn't get lost.
**Architecture home: §34 (Lichborne Experiences), decided 2026-06-10** — the G-series and X-series
ship as registered **Experiences** (floating graphical surfaces over the layout), NOT as panels or
panel view-modes. **X1 (Living Tableau) is Experience #1** (2026-06-12), and **G1 (Combat HUD) is now a
combat FACET of X1 rather than a standalone Experience** (2026-07-16 — see the G1 entry in §32.1 for the
full decision). Each idea
carries a stable local ID (`G#` graphical, `X#` interactive experience, `AI#` AI-assisted) for
reference in conversation and commits; a real `F##` number gets assigned when an item is actually
scheduled. Ideas are described richly on purpose (the value is in the *why* and the data source, not
a one-line checkbox).

**Three guardrails every item here is held to:**
1. **Display & surface, never automate.** These *visualize, compose, summarize, and decorate* —
   they do not issue game commands or play the game. This keeps the whole pipeline on the right side
   of Principle #1 (display/config layer, not a Lich-replacement) and of Simutronics' scripting/botting
   policy. Where an item "stages" a command (e.g. Empath's Ward, X3), the human always presses send.
2. **AI is bring-your-own-key, opt-in, privacy-disclosed.** Key stored encrypted via `safeStorage`
   (same as `passwords.json`), a provider-agnostic `AIProvider` adapter (Claude as the default and
   highest-quality option, OpenAI/others supported), and a per-feature consent gate that discloses
   "this sends game text to <provider>." Nothing leaves the machine unless that specific feature is
   enabled. (Supersedes the OpenAI-only assumption in §10.)
3. **AI ENHANCES, it never GATES — every feature has a working non-AI baseline.** (Sekmeht,
   2026-06-09 — a load-bearing design rule, the AI mirror of Principle #2's "Lich-first with a
   working no-Lich baseline".) No player should ever hit a wall that reads "you need an API key / can't afford AI
   to use this." Each feature must deliver real value with **AI disabled**, and the AI tier is the
   *next-level* experience that makes a player *want* a key — not the price of admission. Concretely:
   the graphical/interactive surfaces (G-series, X-series) are **fully functional without AI** — the
   only thing AI adds there is *generated art* (portraits/backdrops), which **always degrades to the
   procedural fallback** (guild sigil + initials + Contact color for avatars; flat themed backdrops
   for scenes — X1 already specifies this). The AI-assisted features (AI-series) are each the **"smart
   tier" of a non-AI baseline** (the baseline is an existing feature, a static reference, a template
   library, or pure-arithmetic analytics — see the §32.3 baseline column). Build the baseline FIRST;
   the AI tier is an additive layer on top, never a reimplementation. **When speccing any item here,
   state its non-AI baseline explicitly** — if an item can't function at all without AI, that's a
   design smell to resolve before it's scheduled.

The unifying thesis: **text-MUD players are thrilled by graphics they've never had** (the existing
graphical exp bars are the proof). The richest signal sources we already parse — vitals, stance,
RT/CT, hands, spell, the indicator set, per-body-part injury severity, exits, room players/creatures,
exp components, contacts — are a goldmine that most of these consume with little or no new parsing.

### 32.1 Graphical Visualization Features (G1–G10)

- **G1 — Combat HUD ("Engagement").** A compact graphical combat cockpit. Central **readiness
  ring** that sweeps as roundtime burns down; **stance** as a posture icon; a **range gauge** to the
  current target (melee → pole → missile); a **facing/engagement** indicator; a row of **threat pips**
  (one per creature, tinted by apparent condition); active conditions (stunned/webbed/bleeding) flash
  a red ring border. *Data:* stance / roundtime / casttime / indicators / room-creatures are already
  structured; **range / position / facing / "you advance on…" need a new stateful parse of the combat
  stream** (~70% existing, ~30% new). *Fit:* pure display, never auto-acts. The headline differentiator.

  > **DECISION (2026-07-16, Sekmeht): G1 is NOT a separate Experience — it is a COMBAT FACET of X1 (the
  > Living Tableau), rendered as auto-revealing overlay LAYERS on the same scene.** Rationale: both draw
  > the *same subjects on the same stage* — the SceneParser already emits `cast-creatures` (the NPC_SCAN
  > bold spans) alongside `cast-players`, so the creatures a Combat HUD would track are already figures
  > in the Tableau's scene. Drawing combat state *on those figures* ("the ogre on your left is badly
  > wounded, at pole range") is spatially legible in a way an abstract standalone pip-row can never be —
  > the §32 "graphics for text players" thesis at its strongest — and it collapses two surfaces
  > competing for the same screen estate into one adaptive one. **Shape:** the combat instruments are
  > `ExperienceDef.options` LAYERS (the Moons/§34.7 one-checkbox-per-visual-layer precedent), each
  > auto-revealing when combat state is live (RT active / engaged) and quiet otherwise. **The cockpit
  > renders AROUND the PLAYER's avatar, not as corner overlays (Sekmeht 2026-07-16: "the combat flavor
  > should sit around the player's bubble" — rings/dials/gauges, no floating corner text):** *readiness
  > rings* hug the avatar (RT/CT/aim depleting), *range bands* ring it further out (melee inner →
  > missile outer, threatened band lit), a *position gauge* sits under it (foe ↔ even ↔ you), the avatar
  > *pulses* on danger conditions, and *threat/engaged* flare is drawn on creature figures — **driven by ASSESS (v0.17.0/B220), not a blanket "combat is live" flag** (the original blanket marker flagged harmless NPCs mid-fight; only ASSESS can tell friend from foe, so the flare lives in the assess view). This **subsumes a hard Social⇄Combat mode
  > toggle**: all combat layers off = today's pure social Tableau; social layers off + combat on = a
  > combat cockpit rendered on the scene; both on = a combat-aware gather scene. **What the merge does
  > and does NOT save:** it saves the *rendering* scaffold (shared figure / seating / scene engine —
  > confirm at spec time whether creatures are already RENDERED as figures or only tracked as cast), but
  > it does NOT save the `CombatParser` — the ~30% new stateful range/facing/"you advance on…" parse is
  > unchanged. **Risks to hold at spec time:** (1) *visual-grammar collision* — combat is time-critical
  > and dense, social is leisurely/ambient; the readiness ring and range gauge must NOT get buried in
  > gather-mode ambiance when combat is live (tactical layers take hierarchy). (2) *Perf during combat
  > floods* — the combat capturers join the SAME §35.6-gated registry (off until an Experience is open)
  > under the pitfall-#82a substring pre-gate, same discipline as scene capturers, just more of it under
  > load. (3) *Coupling* — G1 now rides X1's stability, so it ships as X1 leaves Beta rather than as a
  > fresh Experience. **This is NOT one of the §34.2 rejected models** — those rejected giving *panels*
  > interactive modes / streams-as-a-panel-category; this is layering combat state onto an existing
  > *Experience*, fully inside the §34 framework.
  *Combat POSITION — BUILT (v0.16.x, the first CombatParser signal).* DR's **balance status line**
  ("[You're battered (71%), incredibly balanced and in dominating position.]") also encodes your relative
  **position** — a signed **−9…+9** symmetric advantage scale (+9 overwhelming … +8 dominating … 0 no
  advantage … −8 opponent dominating … −9 opponent overwhelming you). **`DRStats` is NOT front-end-readable —
  DECIDED to mirror Lich's parse, not read its state (Sekmeht "lich does the work", 2026-07-16; verified).**
  `DRStats.balance`/`.position` are in-memory Ruby `@@` class vars in [drstats.rb](file:///C:/Ruby4Lich5/Lich5/lib/dragonrealms/drinfomon/drstats.rb) —
  a `grep` of all of Lich `lib/` shows **NOTHING pushes them to a client** (no stream, `<component>`, or
  persisted var), so a front-end genuinely cannot read them live (only a `;e echo DRStats.balance` POLL
  could — laggy, Lich-only, rejected). So [combatExtract.ts](src/shared/combatExtract.ts)
  (`parseCombatPosition` / `parseCombatBalance`) mirrors Lich's `PositionValue` / `BalanceValue` regexes +
  `DR_POSITION_VALUES` / `DR_BALANCE_VALUES` tables **VERBATIM from drparser.rb / drvariables.rb** (#1398/#1400,
  the 5.18 form with the `(?:.*,)?` wound-prefix that the older live-install regex misses; Lich validated it
  on an 11,388-line sample) — **the same code that fills `DRStats`, so the value is IDENTICAL to `DRStats`,
  computed live from the same line, and it works direct-SGE too.** Corollary: if Lich's regex can't parse a
  tier (it requires "…balanced", so an "imbalanced/unbalanced" phrasing wouldn't match), `DRStats` wouldn't
  have it either — reading `DRStats` gains nothing over the mirror. Both parse **per-line regardless of
  stream** — the balance/engagement lines arrive on the `combat` stream (main only via fallback), so a
  main-branch-only parse misses them whenever a combat panel is open (caught this build). GameWindow holds
  `combatPosition` / `combatBalance` (0…11) and threads them into `ExperienceCombatState`.
  *Closest-incoming RANGE is also built* (`parseCombatRange`, corpus-mined from
  [corpus/2026-06-12-combat-lavadrakes.xml](corpus/) — "the lava drake closes to melee/pole weapon/missile
  range on you") → a melee/pole/missile band indicator in the same readout. **Both parse per-line
  regardless of stream** — DR sends the balance/engagement lines on the `combat` stream (main only via
  fallback), so a main-branch-only parse would miss them whenever a combat panel is open (caught during
  this build). SCOPE (honest, Principle #10): range tracks the LAST "closes to … on you" (the closest
  threat's band), shown only while combat is live so a stale value can't linger.

  ***ASSESS (per-creature tactical positions) — BUILT (v0.16.1, layout B — the earlier "Phase 2" per-creature
  engagement, now realized via DR's ASSESS command).*** DR's `ASSESS` emits one entity per line on the
  **`assess` stream** — each with a **relation to its target** (facing you / flanking you / behind you /
  moving-to-flank / advancing on / in front of / beside / next to / to-the-left/right-of), a **range**
  (melee/pole/missile), a **status** (balance + flags like *stunned*, *cursed*, *hidden*), and an **id** from
  its `<d cmd='look #id'>` tag. `parseAssessLine` ([combatExtract.ts](src/shared/combatExtract.ts)) **mirrors
  Lich's `parse_assess_line` VERBATIM** (xmlparser.rb #1413; corpus-verified against real captures +
  Lich's spec). GameWindow accumulates each block (`clearStream 'assess'` = fresh snapshot → reset
  `assessAccumRef`; each line's look-ids scraped from the `<d>` segment `cmd`; routing untouched), snapshots
  to `assessCast`/`assessAt`, threads into `ExperienceCombatState.assess`. The Tableau (**layout B — Sekmeht's
  pick over a radial arena**) shows the id'd creatures as figures tagged with **relation + range + a
  targeting-number badge**, **your target ringed gold** (the `You are facing #N` self-row's target), **melee =
  engaged/attacking** (red glow), **reeling** (stunned/imbalanced) dimmed, and **click-a-creature → `face
  #id`** via the new `onCommand` prop. **Three load-bearing invariants (Sekmeht's own observations, DESIGN
  discussion 2026-07-17):** **(1)** the **`id` is identity; the NUMBER is a reusable targeting slot** — a dead
  creature's slot recycles (corpus: slot #1 went `48407408`→`48430408` after the first died), so key figures
  on `id`, not number. **(2)** the **combat narration is ANONYMOUS** — attacks / "closes to X range" /
  "advances on you" carry NO creature id (only assess & look/face do), so a given attack CANNOT be attributed
  to a specific figure. We don't fake it: "who's attacking" is answered by **range** (everyone assess lists at
  **melee** is attacking; pole/missile are closing), and the single target we DO single out is the faced one.
  **(3)** assess is **on-demand / script-driven** (this player's `combat-trainer` auto-assesses each action →
  effectively live; others run it manually or via a `face`-click), so the snapshot **ages out** after
  `ASSESS_TTL_MS` (30s) and falls back to the plain creature line. Corpus `corpus/2026-07-17-assess-lavadrakes.xml`
  (gitignored). **Still Phase 2:** a true top-down radial "Tactical Radar" arrangement (assess has the data —
  relation→angle, range→distance — if we ever want the spatial view instead of the sorted annotated row); and
  the organic "advancing/closing" live cues as a between-assess update layer.

- **G2 — Wound Paper-Doll.** Replace the text list in [InjuriesPanel.tsx](src/renderer/components/panels/InjuriesPanel.tsx)
  with an **anatomical silhouette**: each wounded part glows by severity (yellow→orange→deep red),
  bleeders pulse, severe wounds get a jagged overlay, nerve damage (`nsys`) washes the figure in an
  electric tint; hover for detail. *Data:* 100% already flowing (`InjuryState`, levels 0–3 + nerves) —
  no new parsing. *Fit:* pure display, keep text labels as the accessibility/screen-reader layer.
  **Highest wow-per-effort; proves the SVG+theming pattern G1/X-series reuse.**

- **G3 — Vitals as Life Orbs.** Diablo-style liquid-filled orbs (health/mana/stamina/spirit/concentration)
  as a third vitals display style beside the existing bar/compact modes — drain/refill with a wave,
  pulse red when critical. *Data:* `vital-update` already carries current/max (Barbarian "Inner Fire"
  custom label supported for free). *Fit:* presentation alternative, wire through `applySettingsToDOM`
  + theme vars per Principle #9.

- **G4 — Tactical Room Radar.** A "what's in this room with me" mini-view (distinct from the map,
  which is for navigation): you at center, **exits as arrows** around the rim (reuses the compass
  model), **creatures as hostile dots**, **players as friendly dots** colored by Contact template.
  *Data:* exits / room-players / room-creatures already structured; contacts already exist. *Fit:*
  situational-awareness display; complements the map, doesn't duplicate `;go2`.

- **G5 — World Ambiance Strip.** A thin atmospheric strip: time of day / **moon phases** (mechanically
  relevant to Moon Mages, aesthetic to everyone), a weather/environment glyph per room type, an
  optional dawn→dusk sky gradient. *Data:* some inferable from the stream; moons/weather are best
  **surfaced from Lich vars** (don't recompute — Profanity north-star). *Fit:* pure immersion.

- **G6 — Active Spells & Buffs Board.** The MMO buff-bar: a strip of **buff/debuff chips** with radial
  countdowns, colored by type, pulsing amber in their last ~30s; debuffs on a red sub-row. *Data:*
  durations live in **Lich's spell-timer tracking** → a surface-it feature, with our `spell`/prepared
  event feeding the "casting now" slot. *Fit:* display over Lich-owned state.

- **G7 — Comms Console.** Social streams as a chat client: speaker name in **Contact-template color**,
  channel tabs/filters (Say · Whisper · Thought · Group · LNet), **unread badges**, click-name →
  existing contact popover, optional compose line routed through `dispatchUserText`. *Data:* streams
  already routed (talk/whispers/thoughts, `STREAM_FALLBACK` rules exist) — a richer renderer, no new
  parsing. *Fit:* display layer leaning on Contacts + the stream model. High RP delight.

- **G8 — Skill Momentum Dashboard.** Turn the loved exp panel from "current state" into "story of your
  session": per-skill **mindstate sparklines**, a **session TDP counter** with a celebration on each
  gain, **"time to next rank"** projection from observed rate, a where-the-XP-went heatmap, a gentle
  "mind-locked 6 min — switch it up" nudge. *Data:* built entirely on `exp-component` events + a
  rolling in-session history (the replay/snapshot infra already models history). *Fit:* observes &
  projects — never auto-trains.

- **G9 — Portrait Forge (AI character & scene art).** *(Also an AI feature — see AI9; listed here for
  the visual payoff.)* Generate art from in-game text: a **character portrait** from a person's
  appearance/LOOK description (cached per name), or **scene art** for the current room from its
  description (feeds G5's backdrop and X1's tableau). *Data:* image-gen API + the LOOK/room prose.
  *Fit:* opt-in, clearly-labeled AI art; the ultimate "graphics!!" moment.

- **G10 — Reactive Soundscape.** Promote the existing trigger-sound WAV playback into a curated audio
  HUD: a **heartbeat that quickens as health drops** (ragged when bleeding), a **chime the instant RT
  clears** (act without watching), distinct cues for whisper vs. foe-arrival, a soft ambient bed per
  room type. Every cue toggleable; master kill-switch; no startle-loud defaults. *Data:* drives off
  existing `vital-update` / `roundtime` / indicators / stream-push / room-type; `playWavFile` exists.
  *Fit:* feedback layer; mirror epilepsy-safe's restraint (it already disables the RT pulse).

**Clusters:** Combat cockpit = G1+G2+G6+G10(RT chime). Identity/social = G7. Progression = G3+G8.
World feel = G4+G5+G10(ambient). **Fast wins (no new parser):** G2, G3, G7, G8, G10. **Needs a
parser pass:** G1 (combat). **Needs a Lich surface bridge:** G6 (spell timers).

### 32.2 Interactive Experiences (X1–X6)

Modes you *step into*, not panels you glance at. **X1 (Living Tableau) is the platform** — its
avatar/seating/speech-bubble engine + the existing comms-stream routing are the shared foundation
X2/X4/X5 reuse, so building X1 once makes the rest dramatically cheaper.

- **X1 — Living Tableau (flagship; aka "Gather Mode").** A toggle that turns the text scroll into a
  *living scene*: everyone in the room becomes an avatar, their words bloom as **illustrated speech
  bubbles**, arrivals walk in / departures walk out, the room is a painted backdrop. The text MUD
  becomes a graphic novel you stand inside. **Mechanics:** (a) *Cast* from `roomState.players` /
  `creatures`; each gets a **stable seat** (hash name → position on an arc) so nobody teleports
  between updates; you're center/foreground. (b) *Speech→bubbles* from the comms streams — **Say** →
  comic bubble with a tail, tinted by Contact color; **Emote** → an action caption + a physical beat
  (bow dip, laugh bounce); **Whisper-to-you** → private dotted-tail bubble only you see; **Thought/ESP**
  → telepathic wisps at the screen edges, *not* a body in the room (the speaker isn't physically
  present — getting this wrong puts a phantom in the scene). (c) *Entrances/exits as choreography* —
  "arrives from the north" slides the avatar in from the north edge (we have exit directions). (d)
  *Focus the speaker* — whoever's talking raises & brightens; idle folks soften. **AI layer:** room
  backdrop from the room description (G9/AI9), avatars from appearance/LOOK (cached per name) with a
  **procedural fallback** (guild sigil + initials + Contact color) so the scene is never empty waiting
  on art; optional **emote interpretation** — AI maps a freeform emote to a matching avatar beat
  ("she draws her blade" → a guard-up pose) — nice-to-have, never load-bearing. **Honest constraints:** the game gives **no spatial coordinates** of people — positioning is
  *invented* (stable seating + exit-direction entrances), so Tableau is *expressive*, not tactical
  (that's G4's job); festival rooms (50+) need a cap (real avatars for active/known speakers, a
  "+34 others" crowd silhouette, promote-on-speak); art is opt-in + hard-cached; **a synchronized text
  equivalent is mandatory** (Tableau augments the log, never replaces it; epilepsy-safe tames the
  motion). *Fit:* all display of streams we already parse + optional AI decoration. The feature people
  screenshot and post.

- **X2 — The Spar Arena.** G1 staged like a fighting game for duels/sparring: two avatars across a
  strip, **the space between them is range** (close for melee, drift for missile), hits flash with a
  damage tick, stance shows as posture, a knockdown drops the avatar to a knee; foe condition on a mini
  Wound-Doll. *Data:* shares G1's combat parser + stance/indicators. *Fit:* visualizes; you issue every
  command. Sparring is deeply social — this makes a duel an *event*.

- **X3 — Empath's Ward (interactive party frames).** MMO-style group frames built for DR healers: group
  members as portrait cards with live vitals + **wound pips per body part**, "needs attention" sort,
  click a member to **stage** `assess`/heal into your bar (you confirm-send). *Data:* group membership +
  per-member status (some via `assess`/`perceive` text — a light parse) + injury data we model. *Fit:*
  click *stages* a command, never auto-heals. Genuinely useful + the group HUD DR never had.

- **X4 — The Bardic Stage.** Turn a performance (music/song/dance/poetry) into a *show*: musical notes
  rise with the message rhythm, dancers leave motion trails, the **audience avatars react** (applause
  bubbles, swoons) from the appreciation messages the game sends; a flubbed performance gets a comic
  wince. *Data:* performance + audience-reaction messages (focused parse), reuses X1's crowd avatars.
  *Fit:* pure display celebration of an under-served playstyle.

- **X5 — Tavern Games Table.** Mirror DR's dice/cards/gambling/board games onto an interactive graphical
  table: roll in-game → animated dice tumble on felt; a card game → your hand fans out, the pot stacks;
  players seated around it (X1 avatars). You still play via game commands; you *see* the table. *Data:*
  per-game message parse (ship one — dice or one card game — prove the pattern). *Fit:* delightful
  low-stakes interactive layer.

- **X6 — Scene Composer.** The shareable payoff: freeze a moment and compose it into a **comic panel** —
  grab the current avatars + AI backdrop, pick a log line as the caption, choose a frame/filter, export
  a polished image ("*The night we held the East Gate*"). *Data:* composites X1's rendered scene + a
  chosen log line + optional AI art. *Fit:* creative export from data we own — **the viral loop** that
  makes Lichborne spread, because people share the pictures.

### 32.3 AI-Assisted Features (AI1–AI10)

Held to guardrail #1 (assist, never auto-play), #2 (BYO-key/opt-in/disclosed), and **#3 (every one is
the "smart tier" of a non-AI baseline — build the baseline first; AI is the additive upsell)**. These
expand and supersede §10's OpenAI-only sketch. AI1 is the maturation of §10.1's Highlight Suggester.

**Non-AI baseline → AI tier (guardrail #3 made concrete):**

| # | Feature | Non-AI baseline (ships first, fully usable) | What the AI tier adds |
|---|---|---|---|
| AI1 | Setup Sage | Manual rule editors + right-click "Highlight/Trigger this" + frequency-based name detection (Phase 6D) | Smart, context-aware rule *suggestions* pre-filled to approve |
| AI2 | RP Muse | An emote/phrase template library + quick-emote palette | Bespoke in-character drafts tuned to a vibe & context |
| AI3 | Elanthia Oracle | Bundled searchable lore reference + Elanthipedia link-outs | Conversational, room/guild-aware, cited answers |
| AI4 | Catch Me Up | Scrollback + Session Log (read it yourself) | A prose summary of the last N minutes on screen (`/ai catchup 30m`) — SHIPPED v0.16.0 |
| AI5 | Chronicle | Raw session-log view + export (already exists) | The log rewritten as narrative diary prose |
| AI6 | Ask Your Logs | Existing keyword Session Log search | Natural-language querying over the same logs |
| AI7 | War Council | Pure-arithmetic combat recap (hit/miss %, damage tallies) | Coaching advice on *why* + what to change |
| AI8 | Loremaster's Loom | The Theme Editor + Layout Designer (manual authoring) | Generate a full theme/layout from a text prompt |
| AI9 | Portrait Forge | Procedural avatars + flat themed backdrops (the G/X fallback) | Generated portraits & scene art from descriptions |
| AI10 | Mentor | Static contextual tooltips + a glossary of game messages | Adaptive, watching guidance that fades as you level |

The pattern is deliberate: the no-key player still gets a complete, useful feature; the key-holder gets
the *magic* version — which is exactly the wanting-the-next-level pull we're after, never a paywall.

- **AI1 — Setup Sage.** AI watches a few minutes of stream and proposes **ready-to-approve config
  cards** — highlights, triggers, contacts, mutes, substitutes — pre-filled in our existing editors;
  you tweak & accept. Outputs structured rule JSON into the existing stores. *The* on-brand AI feature
  (AI authoring config is Lichborne's lane). Matures §10.1.

- **AI2 — RP Muse.** A compose assistant for in-character speech/emotes: set a vibe → it drafts a
  `say`/`emote` you edit and send; or "suggest a reply" to what someone just said (2–3 options). *You*
  always send via the command bar. *Data:* recent conversation + saved persona notes. Compose-assist.

- **AI3 — Elanthia Oracle.** A lore sidebar: ask about DR lore/guilds/mechanics → grounded, **cited**
  answers via RAG over a curated DR lore corpus (Elanthipedia/official docs), optionally room/guild-aware.
  Knowledge surface, not automation.

- **AI4 — "Catch Me Up."** One button summarizes the recent main/comms buffer — "while you were away:
  Rakkor arrived and asked about the caravan; a bandit attacked and fled" — great after AFK or in chaotic
  event rooms. *Data:* the recent buffer we already keep (minimal privacy surface).

- **AI5 — Chronicle (auto journal).** Turn a day's **session log** (already captured per-character) into
  a narrative diary entry in the character's voice; save to an in-app journal, export to RP forums.
  Creative output from data we own. Pairs with X6 / G9.

- **AI6 — Ask Your Logs.** Conversational natural-language search over the local per-character logs
  ("when did I last talk to Rakkor, and about what?") with **jump-to-log** links reusing
  `SessionLogSearchHit`. An intelligence layer over an existing feature; logs stay local except queried
  snippets.

- **AI7 — War Council (combat coach).** Post-fight analysis that *teaches*, strictly advisory: "you
  whiffed 6 of 10 — weapon skill trails this creature's defenses; try kneeling, or close to pole range."
  *Data:* the parsed combat stream (ties to G1). **Explicitly never auto-executes** — this boundary is
  what keeps it TOS-safe; state it in the UI.

- **AI8 — Loremaster's Loom (theme & layout designer).** Generative config against our structured
  formats: "design a spooky Necromancer theme" → a full theme JSON to preview/save; "build a
  combat-focused layout" → a panel arrangement. Validate against the schema (reject out-of-range like
  imported profiles do). Dead-center on the config-layer mission and very shippable (formats exist).

- **AI9 — Portrait Forge (image gen).** *(= G9; the AI realization.)* AI portraits from appearance text
  and scene art from room descriptions, cached locally; feeds X1's backdrop/avatars, G5, X6, and the
  Appearance Card. Opt-in, clearly labeled AI art.

- **AI10 — Mentor (adaptive new-player guide).** Context-aware tutor (with consent): explains unfamiliar
  messages on hover, suggests next steps for your guild/skills, answers "what do I do now?", fading out
  as you level. *Data:* stream context + AI3's lore corpus + your skills. Advisory onboarding.

**Fast/low-risk AI starters:** AI8 + AI1 (near-pure config-gen against existing schemas), AI5 (delight
from logs we already keep). **Headline wow:** AI9 (Portrait Forge).

### 32.4 Cross-cutting architecture & dependencies

- **Shared engines worth building once:** (a) the **SVG figure + theming pattern** (G2 first, reused by
  G1/X2/X3); (b) the **avatar/seating/speech-bubble engine** (X1, reused by X2/X4/X5/X6); (c) the parsing layer behind
  Experiences — the **`SceneParser`** (name pinned 2026-06-12): typed *scene events* — speaker /
  channel / arrival-direction — from the comms streams (X1, reused by X4/X5/X6); and the
  **`CombatParser`** for range/position/facing (the G1 combat FACET of X1 — see §32.1's G1 decision;
  reused by X2/AI7) — both stateful readers in the spirit of `StormFrontParser`, co-located in the
  Tableau Experience (scene events + combat state feed the same scene, combat as auto-revealing layers); (d) the **`AIProvider` adapter** (chat + embeddings + image), Claude
  default, per-provider keys via `safeStorage`, per-feature consent + token/cost meter (every AI item
  calls the adapter, never an SDK directly); (e) **RAG grounding** (a curated DR lore corpus for
  AI3/AI10; local-log indexing for AI6) so these cite rather than hallucinate.
- **The bright line, surfaced in-UI:** AI here advises/composes/summarizes/decorates and **never issues
  game commands** — the single rule that keeps every AI item inside Simutronics' scripting policy and
  Principle #1.
- **Accessibility is a contract, not a nicety:** every graphical/tableau surface needs a synchronized
  text equivalent and must respect large-print / high-contrast / color-blind / epilepsy-safe (applied
  via `applySettingsToDOM`, re-applied after theme writes — pitfall #33). Audio (G10) needs a master
  kill-switch and gentle defaults.

### 32.5 Suggested build order

1. **G2 (Wound Paper-Doll)** — fast, all data exists, proves the SVG/theming pattern, instant "ooh."
2. **G3 (Life Orbs) + G8 (Skill Momentum)** — more fast no-parser wins; great screenshots to rally testers.
3. **G1 (Combat HUD)** — build the combat-stream parser here (de-risked by capturing real Raw-XML during
   a fight first); it unlocks X2 and AI7.
4. **X1 (Living Tableau) foundation → X6 (Scene Composer)** — the flagship platform + its viral shareable
   payoff; then layer X2/X3/X4/X5 as their parsers come online.
5. **AI track in parallel** once the `AIProvider` adapter exists: AI8 + AI1 (config-gen) first, then
   AI5/AI4/AI6 (log/RAG), then AI9 (Portrait Forge, which lights up X1/G5/X6).

> **Superseded 2026-06-12 (ordering only):** Sekmeht promoted **X1 (Living Tableau) to Experience #1**
> — it builds FIRST, on the §34 scaffold (see §34.9 for the phased plan); G1 (Combat HUD) follows.
> The per-feature analysis above remains current; the G-series "fast wins" stay available as fillers.
>
> **Superseded again 2026-07-16 (G1 fold):** G1 is no longer a separate step here — it becomes the
> **combat FACET of X1** (auto-revealing combat layers on the Living Tableau's scene; full decision in
> §32.1's G1 entry). The `CombatParser` work is unchanged and still gated on capturing real fight
> Raw-XML first; it just lands inside the Tableau Experience rather than a new one.

---

## 33. Free Layout — Floating Windows (planned, v0.13.x)

**Status:** **SHIPPED v0.13.0 (2026-06-09)** — Phases 1–5 complete & tester-verified (Sekmeht): toggle,
cascade conversion, full decouple (main text / command / vitals / icon / panels all floating windows,
fractional), magnetic snapping, unlimited windows + re-add, lock. **User-facing terminology: "Static
Panels" (docked) vs "Windowed Panels" (floating); "streams" are the content placed inside either.** The
code/section keep the internal name "Free Layout" (`freeLayout`, `fl-*`); don't bulk-rename. Pending
(minor): light-theme audit of window chrome + richer keyboard a11y. A toggleable mode that lets a
player break the fixed panel skeleton into **free-floating, draggable, resizable, snappable
windows** — where a *window* becomes the new, unlimited evolution of a *panel*. **This supersedes the
grid-based Layout Designer (§12)** — we chose a freeform floating model over a grid because it's what
players asked for (drag/snap/unlimited) and it maps onto the existing components far more cleanly.

**Direction (Sekmeht, 2026-06-11): Windowed Panels is the END STATE — Static Panels will be
discontinued.** The plan, in two stages: **(1)** flip the default — new characters start in Windowed
Panels (`layoutMode` default `'free'`), Static stays available as the legacy toggle; **(2)** pull the
plug — remove Static Panels entirely, with a one-time automatic conversion (the
`buildWindowsFromCurrentLayout` cascade already exists) so no existing layout is lost (Principles #3
and #8 — migration path, no data loss; the zone scopedKeys become legacy state to migrate, not
delete). Neither stage is scheduled yet — both ship on their own release decision after Windowed
Panels has soaked with the tester pool. **Until stage 2 lands, both modes stay first-class** (every
new feature works in both — the pitfall-#79 per-mode aggregation pattern is the cost of the interim),
but when weighing effort, windowed mode is the future: don't build static-only features, and prefer
designs that get simpler when the zone skeleton goes away.

### 33.1 Why this is tractable (current-architecture findings)

Three facts about today's layout ([GameWindow.tsx](src/renderer/components/GameWindow.tsx) render at
~L2346) make Free Layout an *overlay* on the existing system, not a rewrite:
1. **[PanelFrame.tsx](src/renderer/components/PanelFrame.tsx) is already a fully-decoupled tabbed
   container** (`tabs`/`activeId`/`onTabsChange`/`onActiveChange` + its own `+` add-stream menu). **A
   window IS a `PanelFrame` in a floating frame** — the content engine exists, and all four zones
   already share one `sharedFrameProps` bundle, so wiring N windows is nearly free.
2. **[FloatingCompass.tsx](src/renderer/components/FloatingCompass.tsx) already proves the
   free-floating, theme-aware overlay pattern** — the template for decoupled chrome.
3. **Persistence is free** — every layout bit is a per-character `scopedKey(...)` → localStorage →
   YAML via the dynamic `state.*` pipeline (Principle #1). New Free-Layout keys need no schema change.

The chrome is already componentized (`VitalsBar`, `IconBar`, `FloatingCompass` are standalone). **Only
the command/input bar is inline** (a `<form>` in GameWindow with history/RT-CT/QuickSend wiring) — its
extraction into a `CommandWindow` is the one real refactor.

### 33.2 Locked decisions (Sekmeht, 2026-06-09)

1. **Fractional coordinates.** Every window's rect is `{ x, y, w, h }` as fractions `0..1` of the
   Free-Layout container (the game-area). Windows scale proportionally on OS-window resize and survive
   the §13.9 OS-window decouple. (Min sizes enforced in px on resize, then re-derived to fractions.)
2. **Full decouple.** The **main story text is itself a window**, and the input bar, icon bar, vitals
   bar, and compass all decouple into their own windows (requirement #5). Nothing is privileged chrome.
3. **Name: "Free Layout."** The toggle and mode are "Free Layout"; the OS-window feature stays "Move to
   New Window" (§13.9) to disambiguate (see §33.11).
4. **Snapping: magnetic edges + window-to-window, from v1** (best experience incl. cramped spaces).

### 33.3 State model

New per-character state, no profile-shape change (Principle #1):
- `scopedKey(character, 'layoutMode')` → `'panels' | 'free'` (default `'panels'`).
- `scopedKey(character, 'freeWindows')` → `FloatWindow[]` (the whole free layout).

```ts
type WinKind = 'panel' | 'main' | 'vitals' | 'icon' | 'compass' | 'command'
interface FloatWindow {
  id: string
  kind: WinKind
  rect: { x: number; y: number; w: number; h: number }  // fractions 0..1 of the container
  z: number                 // stacking order; click-to-front bumps to max+1
  showTitle: boolean        // requirement #4 — hide/reveal the window name
  title?: string            // editable; defaults from the content
  tabs?: TabDef[]           // kind==='panel' only — reuses the existing zone shape
  activeId?: string         // kind==='panel' only
}
```
**Conversion trigger:** entering `free` while `freeWindows` is *undefined* (never converted) runs the
measure-and-mint conversion (§33.6); an *empty array* is respected (the user emptied it on purpose).
Panel-mode zone state (`topTabs`/`midTabs`/… + heights + `*Added`) is **left untouched** in free mode,
so toggling back to `panels` restores the old layout exactly. The two layouts are **independent**
(diverge after the one-time seed); a **"Reset Free Layout"** action re-runs the conversion to re-seed
from the current panel layout. Both layouts read the same shared `streamLines` data — only *placement*
differs.

### 33.4 The `FloatingWindow` component

A wrapper hosting either a `PanelFrame` (passing `sharedFrameProps`) or a chrome strip. Responsibilities:
- **Drag** via the title bar; **resize** via 8 edge/corner handles; **min size** in px (floored so a
  window can't become unusable, even in a cramped container — overlap is allowed when space is tight).
- **Z-order**: clicking anywhere in the window raises it (bump `z`, periodic renormalize); the focused
  window gets an **accent border/glow** so it's obvious in a crowd.
- **Title bar**: shows the title + controls (rename on dbl-click, title hide/show toggle, close ×).
  When `showTitle === false`, collapse to a **thin draggable grip lip** at the top edge (saves vertical
  space for cramped users) — resize handles remain; **Alt+drag anywhere** also moves (snapping-off too).
  **v0.17.0 chrome polish (Sekmeht):** the title bar is a slim ~8px header, and **the titlebar and grip
  heights MUST stay matched** (else showing/hiding the name jumps the header — B217); title text needs a
  box taller than its glyphs to centre; the top resize handle is 4px so the slim bar keeps a drag zone.
  The hide-name control is a **chevron**, and collapse/close are **hidden until window hover/focus**
  (quiet by default). Visuals: soft gradient + hairline + a 1px inset accent focus line, all `color-mix`
  (theme-safe). **Chrome windows keep an EXPLICIT height — an auto-hug (measure content → resize +
  persist) was tried in v0.17.0 and REVERTED: it corrupted saved heights and clipped the vitals bar
  (pitfall #93; the deterministic-height rule is pitfall #74).**
- **Keyboard**: when focused, arrow keys nudge 1px (Shift = 10px) for pixel placement; sized/positioned
  values stay fraction-backed.
- Lives in a `WindowLayer` (`position: absolute; inset: 0` over a `position: relative` game-area),
  with a `ResizeObserver` on the layer giving the px container size for fraction↔px conversion.
  **The observer IGNORES 0×0 measurements (B174, v0.13.4)** — a hidden character tab is
  `display:none` and measures 0×0 (pitfall #24); letting that through unmounted every floating
  window on every character-tab switch (the hidden character's map/streams/text fully re-initialized
  on switch-back). `size` keeps the last real value, so the `size > 0` render gate means "never
  measured yet" (a first-mount garbage-geometry guard) and windows are NEVER unmounted by a hidden
  tab — stale px geometry while hidden is harmless (the ancestor is display:none). Pitfall #83.

### 33.5 Snapping (magnetic, v1)

On live drag-move and on resize, within an ~8px (container-space) threshold:
- **Edge snap** — window edges snap to the container edges (L/T/R/B).
- **Window-to-window snap** — an edge snaps to any sibling's parallel edge (right-to-left for **flush
  tiling**, left-to-left / top-to-top for **alignment**), so users can hand-build a seamless tiled
  layout that reads like the old zones. Snapping applies to resize edges too.
- **Live guide-lines** (thin accent) show the snap target; **Alt held = snapping disabled** for fine
  placement.
- Future (not v1): quick half/quarter "zones," "fill remaining gap," equal-size distribute.

### 33.6 Mode toggle & the measure-and-mint conversion (requirement #6)

Toggle in the **View menu** + a **Panel Manager** entry (and a Free-Layout toolbar affordance). When
`layoutMode === 'free'`, GameWindow renders the `WindowLayer` **instead of** the fixed skeleton.
**Docked strips don't exist in free mode (B166, v0.13.2):** the layer is absolute inset-0 over the
whole shell, so any flex-docked strip (the Debug strip was the case in point) renders UNDER the
windows. Such surfaces open AS a floating window in free mode instead — the Debug button toggles a
panel window seeded with the `debug` tab; the docked strip renders only in panels mode, and debug
collection is presence-based (the `debugOpen` memo: strip OR zone tab OR window tab), so a Debug tab
hosted anywhere now collects on its own.

**Conversion (the "pop free" effect)** — on first entry to free mode with no `freeWindows`:
1. Read the container `getBoundingClientRect()`.
2. For each currently-rendered surface, read its live `getBoundingClientRect()` and mint a `FloatWindow`
   at that rect: each *added* zone (mainTop/top/mid/bottom → `kind:'panel'` carrying that zone's
   `tabs`/`activeId`), the main text (`kind:'main'`), the command bar (`kind:'command'`), the vitals bar
   (`kind:'vitals'`), the icon bar (`kind:'icon'`), and the compass (`kind:'compass'`, placed at its
   current overlay corner). Skip un-added zones.
3. Convert each px rect → fractions; assign `z` (main lowest, panels above, chrome on top, compass top).
4. Save `freeWindows`. The first frame **visually matches the current layout** — the user sees their
   exact panels "pop free" into draggable windows: *"still my panels, but now I can move them."*

### 33.7 Decoupled chrome (the five non-panel kinds)

`compass` (already an overlay — trivial), `vitals` and `icon` (already standalone components — wrap in a
`FloatingWindow`), `main` (the Virtuoso text window — see risks), and `command` (the one extraction:
lift the inline `<form>` + history / RT-CT `TimerDisplay` / QuickSend prompt-marker / global-keydown
wiring out of GameWindow into a `CommandWindow`). In free mode the panel-mode chrome position settings
(`vitalsBarPosition`/`iconBarPosition`) are ignored — position comes from the windows, and the Settings
panel **greys out** those two Vitals/Icon "Position" toggles in windowed mode (`layoutMode` passed to
`SettingsPanel`; `RadioGroup` gains `disabled`/`disabledHint`) — re-enabled in static-panel mode.
Compact Vitals and font/line-height still apply (they affect the window *content*), so they stay enabled.

**Decided behavior (2026-06-09, after tester iteration): chrome windows are FIXED-height by default but
USER-resizable in both axes (like panels).** Command/Vitals/Status are fixed-layout bars; the CASCADE
conversion (§33.6) gives them a default height (`measured bar + TITLE_PX`), and the bar is **centered**
in the body (`.fl-window--chrome .fl-body { justify-content: center }`) so growing/shrinking pads/clips
symmetrically. Both-axis resize was added (`DIRS` in [FloatingWindow.tsx](src/renderer/components/FloatingWindow.tsx))
because the tester wanted to shrink the command bar's padding — to make a chrome bar minimal, resize it
down (per-kind floors in `minSizeFor`, [freeLayout.ts](src/renderer/freeLayout.ts)) and/or hit **T** to
drop the title bar to the thin grip. **CRITICAL — do NOT reintroduce auto-height (`height: undefined`):**
chrome was first auto-height so the window hugged the bar. It looked right but was a TRAP — an
auto-height window measures 0-tall on first paint and only gets its real height on a later re-measure, so
the **icon bar rendered invisible after Rebuild, then "popped in" at full height and shoved the whole
layout the first time the tester clicked anything** (Sekmeht's repro, 2026-06-09). The height must stay
an EXPLICIT px/fraction (deterministic); user-resize changes that explicit value, which is fine —
auto-height is the thing that's banned. Chrome is movable + labeled via a **title bar** (the thin grip
alone was too hard to find on a full-width bar — "can't move the icon bar"); the grip handle indicator
covers the collapsed (`showTitle:false`) state. **Revisit
FIXED-height (never auto).

### 33.8 Unlimited windows, add/remove, safety net (requirements #3, #7)

**THE LOCK FREEZES THE CONTAINER, NEVER THE CONTENT (stated v0.18.2, Sekmeht).** `freeLayoutLocked` exists to stop you knocking a window's POSITION or SIZE askew by accident. It has no stake in what lives inside a window, and gating content operations on it made "locked" read as "read-only", which it isn't — users run locked most of the time. Concretely: **tab drag-reorder is NOT lock-gated** (F46 originally passed `!freeLayoutLocked`; reversed), **right-click → Close works while locked**, and **Add Window stays available while locked** (a locked window can still have its streams closed, so hiding the only way to add one back would let you destroy but never rebuild). Apply this split to any future lock-adjacent feature.

**Right-click → Close (F76, v0.18.2).** The ✕ is a hover-only ~1em glyph beside the corner resize handle and is absent entirely on a collapsed or locked window, so a context menu is the reliable way to dismiss something. Bound on the window ROOT — one handler covering every part of every window in every state, including a locked window that renders no chrome for a handler to sit on — and it **yields to any inner surface that already claimed the event** via `e.defaultPrevented` (stream text, the maps, Debug and the tab strip all `preventDefault` and keep their own richer menus). **"Close" means the CONTENT, not the container:** a tabbed window closes its ACTIVE STREAM (the window follows only if that was its last tab), an Experience closes itself. **Chrome bars (command/vitals/icon) and the GAME window are excluded entirely** — equipment rather than content, recoverable only through Layout Manager → Add Window, which is a poor trade for a one-item menu you can hit by accident. That exclusion is a separate predicate from `isChrome` on purpose: `isChrome` also drives the `--chrome` styling and minimum size, so folding the game window into it would silently restyle it. Streams additionally carry Close in their OWN body menu, since that menu preventDefaults first and so never sees the window-level one.

**Cross-window stream drag (F77, v0.18.2).** Dragging a tab onto another window's tab strip MOVES it there. The move is ONE atomic state update (`adoptTabIntoWindow` in GameWindow) — as two steps a failure could duplicate or lose the stream, and duplicate tab ids within one window break React keys and `activeId`. It lives in GameWindow rather than PanelFrame because a frame only knows its own tabs; only the owner of the window list can take from one and give to another. An emptied source window closes, matching what closing its last stream does. Transport is a **custom MIME type**, not the existing `text/plain`: the browser hides `getData()` until the drop fires, so a type's PRESENCE is the only signal a strip can inspect at hover time to decide whether to accept the drag at all. Removing the tab is the whole job — in free mode every "is this stream watched/visible" aggregation derives from `freeWindows[].tabs` (pitfall #79), so routing and unread state follow automatically.

- **New Window** mints an empty `kind:'panel'` window (cascade-offset); the user fills it via PanelFrame's
  existing `+` menu. **No 4-slot cap** — the limit was a zone-system artifact, gone here. An empty panel
  window shows the `EmptyPanelSlot`-style "add a stream" placeholder.
- **Add Window ▸** menu always lists any chrome kind **not currently present** (so the command/vitals/etc.
  bar can never be permanently lost) plus "New Panel."
- **Reset Free Layout** re-runs the §33.6 conversion (the recovery path if a layout gets wedged).

### 33.9 Theming & accessibility

- **All window chrome is theme vars** (Principle #4) — title bar uses the canonical modal-chrome recipe
  (`--bg-hover`/`--bg-sunken` band, `--accent` title, `--border`), focused window accent glow, snap
  guides `--accent`. **Mandatory light-theme audit** (Classic Light / Ivory / Mist / Parchment) — the
  `--bg-raised/sunken/base/hover` scale compresses near-white (pitfall #34/#55).
- **Game-font scaling** (Principle #9): panel content already scales via PanelFrame's anchor; **size the
  title bar + grip in `em` off `var(--game-font-size)`** so chrome shrinks with small fonts (cramped
  users) — never `rem`.
- **Accessibility**: keyboard move/resize (arrow nudge), a visible focus ring on the active window,
  windows as labeled regions for screen readers; respect large-print / high-contrast / epilepsy-safe via
  the theme/overlay vars.

### 33.10 Persistence & Profile Transfer

`layoutMode` + `freeWindows` are per-character `state.*` keys (round-trip to YAML for free). Add both to
the **Panel Layout** category in `TRANSFER_CATEGORIES` (pitfall #56) so a free layout transfers with the
rest of the panel layout.

### 33.11 Relationship to the OS-window decouple (§13.9)

Two orthogonal "window" concepts now coexist: **Free Layout = in-app floating windows inside one
GameWindow**; **§13.9 "Move to New Window" = moves the whole GameWindow to another OS window**. They
compose — a character's free layout rides along (fractional rects re-scale to the new OS window). The
distinct naming ("Free Layout" vs "Move to New Window") is the disambiguation; keep it.

### 33.12 Risks (respect before building)

- **The main-text scroll machinery is the #1 hazard.** `stickToBottom`, the scroller `ResizeObserver`
  resnap, `followOutput=false`, replay handling (B155/B158, pitfalls #24, #68) are tuned to today's
  resize lifecycle. A freely-resized, movable `kind:'main'` window stresses it hard. Mitigant: the resnap
  is already `ResizeObserver`-driven (right primitive for free-resize), but main text gets a dedicated
  **hardening pass** (Phase 2) and stays under the most scrutiny. Pitfall #24 (hidden = 0×0) still applies
  to a closed/off-screen window.
- **Command-bar extraction** touches focus, history, RT/CT, the QuickSend prompt-marker, and global
  keydown — self-contained but fiddly (Phase 3).
- **Performance** with many windows — PanelFrames are cheap (we already render 4) and memoized; cap
  guidance + virtualization stays inside each panel. Watch live-drag re-render cost (use refs + rAF for
  the dragged rect, commit to state on drop).

### 33.13 Build phases

1. ✅ **Window shell & manager** (built + tester-verified 2026-06-09) — `FloatingWindow`
   (drag/resize/z/title-toggle/rename/theme), `WindowLayer`, fractional state + persistence, container
   `ResizeObserver`, the Panel-Manager "Free Layout (beta)" toggle. Validated with seeded `kind:'panel'`
   windows on `sharedFrameProps`, rendered as a **pointer-through overlay** above the live skeleton (so
   main-text/chrome rendering is untouched until Phase 2). Files: [freeLayout.ts](src/renderer/freeLayout.ts),
   [FloatingWindow.tsx](src/renderer/components/FloatingWindow.tsx), [WindowLayer.tsx](src/renderer/components/WindowLayer.tsx),
   [free-layout.css](src/renderer/styles/free-layout.css). All 15 P1 checks pass (drag/resize/z, title
   hide/rename/close, in-window tabs, persistence across relaunch, fractional rescale, pass-through,
   light-theme, multi-character isolation).
2. **Mode toggle + measure-and-mint conversion** (§33.6) — split into 2a/2b to isolate the main-text
   scroll risk:
   - **2a ✅ (built 2026-06-09)** — the conversion (`buildWindowsFromCurrentLayout`: snapshots live
     `getBoundingClientRect()` of each zone + the vitals/icon strips into windows), **vitals + icon
     decoupled** as windows, and **skeleton replaced** (free mode gates the chrome strips / main-top
     zone / right column off; floats them instead). The **main text + command stay the central column**
     — never unmounted, so the scroll machinery only sees a reflow handled by its existing scroller
     `ResizeObserver` (+ a re-pin on mode toggle). A "Rebuild from panels" Panel-Manager button re-runs
     the conversion (two-step via panels mode when invoked from free). Compass rides with the central
     text (own-window decouple deferred). **Most of the "wow" lands here.**
   - **2b-i ✅ (built 2026-06-09)** — **command/input bar decoupled** into its own `kind:'command'`
     window (tester feedback: "input bar needs to be decoupled"). `commandBarNode` is extracted and
     rendered EITHER in the central column (panels) OR the command window (free); the conversion mints
     it from the `.command-bar` rect (+grip allowance). The main text stays central, never unmounted.
   - **2b-ii ✅ (built 2026-06-09)** — the **main text is its own window** (`kind:'main'`). `textAreaNode`
     (the `.text-area` Virtuoso block + new-lines badge + compass) is extracted and rendered in the
     central column (panels) OR the main window (free); the conversion mints it from the `.text-area`
     rect (excludes the command/vitals strips, which are their own windows). Free mode now renders NO
     central column — every surface is a window. Remount happens only on the rare toggle (re-pin effect
     + the scroller ResizeObserver re-pin it); drag/resize stay within one window (no remount). Compass
     rides inside the main window.
3. **Extract the command/input bar** into `CommandWindow` — now every surface in requirement #5 is
   independently floatable.
4. ✅ **Snapping** (§33.5, built 2026-06-09) — magnetic snapping on drag AND resize: a moving edge
   snaps (within `SNAP_PX`=8) to the container edges OR any other window's edges (flush tiling +
   alignment), with live **guide lines** (`.fl-guide-v/h`, positioned imperatively — no re-render),
   **Alt held = disabled**, and **arrow-key nudge** of the focused window (1px / Shift 10px, skipped
   while an input is focused). Snap targets are measured LIVE from the DOM at gesture start
   (`getSnapTargets` in [WindowLayer.tsx](src/renderer/components/WindowLayer.tsx)) so auto-height
   chrome reports its true edges. `snapAxis` in [FloatingWindow.tsx](src/renderer/components/FloatingWindow.tsx).
5. **Unlimited windows + lock + a11y polish.** ✅ **Built 2026-06-09.** Add/lock controls live in the
   **Panel Manager's Free Layout banner** (NOT floating on the overlay — Sekmeht: a floating button had
   no good home). `newFloatWindow` ([freeLayout.ts](src/renderer/freeLayout.ts)) builds each window;
   GameWindow's `addFreeWindow(kind)` + `freeAddItems` drive the banner's **"Add window: New panel /
   Add Game / Add Command / …"** buttons — **New panel** is unlimited (empty `kind:'panel'`, filled via
   the PanelFrame `+`), and the singletons (main/command/vitals/icon) only offer to re-add when MISSING
   so a closed bar can't be permanently lost (§33.8). **Lock windows** (`freeLayoutLocked`, per-character
   scopedKey) — a banner checkbox shown only in free mode — makes drag/resize/arrow-nudge no-ops and hides
   the resize handles (cursor goes default; `fl-window--locked`), so a finished layout can't be nudged by
   accident; add/lock are hidden while locked. **As of v0.18.1 (F74) locking is a full DISPLAY mode: the
   window header is not rendered at all, the lift-shadow is dropped, and the border falls to
   `--border-subtle` — the same var `.panel-frame` uses — so a tiled locked layout reads like docked
   panels.** TheTargonian measured the problem: header (9px) + its hairline + two 1px window borders cost
   ~12px at EVERY seam against ~1px in panels mode, *"6 of those extra buffers on my setup, which is close
   to half a window."* This supersedes the F44/v0.13.2 behaviour (hide only the grip's dash mark, keep the
   11px strip so geometry doesn't shift) — see the overlay rule below for why that compromise is no longer
   needed. **The header is an absolute OVERLAY on the content, not a flow row above it (v0.18.1).** It was
   a flow row first, and hiding it on lock only MOVED the reserved space rather than removing it: snapping
   aligns OUTER edges, so tiled windows met flush while their CONTENT stayed ~10px apart, and a
   fixed-height chrome window simply re-centred its bar so the gap survived the lock (Sekmeht: *"maybe the
   grabbing/mover needs to happen inside of the window vs. being a part of the window"*). As an overlay it
   reserves nothing: what you arrange while unlocked is exactly what you get locked, a chrome window can
   hug its bar and stay hugged, and lock/unlock is a pure visibility change that never touches a stored
   rect — which satisfies pitfall #74 outright rather than working around it. Consequences to preserve:
   z-order inside a window is body → header (1) → resize handles (2) → title buttons (3), so the top and
   corner grips stay grabbable *through* the header; the header is quiet at 55% opacity until window
   hover/focus, because it now sits over content; and `buildWindowsFromCurrentLayout` adds only
   `BORDER_PX = 2` (the window's own border, which `box-sizing: border-box` folds into the stored height)
   instead of the old `TITLE_PX = 16` title allowance. Windows saved by a pre-v0.18.1 build still carry
   that allowance and load a touch tall; one drag fixes them and they are deliberately NOT auto-migrated
   (pitfall #93 — never rewrite a persisted rect from a measurement). Double-click still restores the name
   bar while unlocked.
   **"Fit bars to content" (v0.18.1)** sits beside Lock / Rebuild in the same banner (free mode,
   unlocked only) and resizes every CHROME window to its measured bar height + the 2px border. It
   exists because layouts saved before v0.18.1 carry the old title allowance and dragging to an exact
   height is fiddly. Heights only — positions are untouched, so a neighbour may be left a gap or an
   overlap; auto re-tiling was considered and rejected as it would move windows the user placed. It is
   a FIT rather than a shrink: a window dragged smaller than its bar is grown back. This is the one
   measure→persist shape pitfall #93 permits (explicit action, never automatic, never from a render),
   and it aborts rather than writes on either way a measurement can lie — a hidden tab's 0-height
   layer (pitfall #24) or a 0-height bar. **No slash command, by design** (Principle #11 requires the
   question be answered, not skipped): it is one-shot layout maintenance that only makes sense with
   the layout in front of you, and it sits with Lock and Rebuild-from-panels, neither of which has a
   command either. Revisit only if the whole free-layout banner gets a `/layout` verb set.
   **Tab drag-reorder follows the lock too (F46, v0.13.5):** PanelFrame tabs are draggable along their
   strip (`reorderTabs` prop — windowed passes `!freeLayoutLocked`, static zones pass `true`); the live
   reorder commits through the normal `onTabsChange` path so persistence is the existing one in both
   modes (zone scopedKeys / the window's `tabs`), neighbor tabs FLIP-slide (~120ms) so the landing slot
   reads visually, and the dragged tab ghosts with an accent dashed outline marking where release lands
   it. Reorder is WITHIN one strip — dragging a tab BETWEEN windows is a separate future feature. Title hide/grip ✅, Reset ✅ ("Rebuild from panels"),
   keyboard nudge + minimal focus cue ✅. **The Panel Manager hides the zone manager (Panel Locations /
   per-zone Streams / Available Streams) entirely in free mode** (`layoutMode !== 'free'` gate) — windows
   aren't bound to zones, so it confused; a short note + the Free-Layout controls take its place, and it
   returns in panels mode. **Still pending (minor):** a dedicated light-theme audit + richer keyboard a11y
   (Tab between windows).

---

## 34. Lichborne Experiences — Architecture (decided 2026-06-10; shipped v0.14.0)

**Status:** Architecture locked (Sekmeht, 2026-06-10) after a design discussion that explicitly
rejected two alternative models (§34.2). **SHIPPED v0.14.0 (2026-06-12): the full scaffold (§34.3–
§34.6, plus an optional `badge` field — the Tableau wears [Beta]) and the first registered
Experience — the Living Tableau (X1, §32.2)** — decided 2026-06-12, superseding the original
Combat-HUD-first call; **G1 follows it** (X1 is the scene platform X2/X4/X5/X6 reuse, and it's the
headline feature — building it first proved the scaffold on the most demanding case). User-facing brand: **"Lichborne Experiences"** — the brand is part of
the product identity (the shelf button carries it). Internal names: `experiences.ts`,
`ExperienceLayer`, `ExperienceDef` (the §33 precedent: user-facing terms and internal names may
diverge; don't bulk-rename either direction).

### 34.1 What an Experience is (and is not)

A **Lichborne Experience** is a first-class layout object: a **registered, graphical, floating
surface** hosted over the game layout — an *instrument* (Combat HUD, Tactical Radar, Buffs Board) or
a *scene* (Living Tableau, Spar Arena). It is the architectural home for the §32 G-series and
X-series features.

An Experience is **not a panel and not a stream**:

- **Panels** are tabbed text/structured rectangles bound to zones (or floating windows in Windowed
  Panels mode). They are mature, heavily debugged, and **byte-identical under this design** — no
  migration, no type changes, no new tab kinds. `map` / `exp` / `lichScripts` **stay panels
  forever** (if we ever want Maps offered as an Experience too, that's an *additive* registry entry
  later, never a move).
- **Streams** are what the game/Lich says, routed by stream id. Experiences never enter
  `discoveredStreams`, never occupy a stream id, never appear in the tab arrays — so the "a new
  release must never collide with or overwrite a stream a user already created" requirement is
  satisfied **by construction**, not by a filter. No reserved prefix is needed; the namespaces are
  disjoint.
- Experiences read **parsed game state** (typed `GameEvent`s — vitals, RT/CT, stance, indicators,
  injuries, room players/creatures, exp components) and/or Lich-surfaced state. They are *additive*
  surfaces: the text never goes away, which is how the §32.4 accessibility contract ("synchronized
  text equivalent") is met — the equivalent is the game text the player already has, plus each
  registry entry declaring its text/state equivalent explicitly.

**The Experience catalog (index — full specs live in §32.1/§32.2; this table is the §34 roster):**

| ID | Experience | Kind | One-liner | Status |
|---|---|---|---|---|
| G1 | **Combat HUD ("Engagement")** | **Combat facet of X1** (auto-revealing layers, not a standalone Experience) | RT readiness ring + CT inner ring, stance figure, threat pips ON creature figures, range gauge, condition border, hands | Folded into X1 (2026-07-16); needs the `CombatParser` |
| G2 | Wound Paper-Doll | Instrument | Anatomical silhouette, wounds glow by severity, bleeders pulse | Likely folds in as G1's center figure |
| G3 | Life Orbs | Instrument* | Liquid-filled vitals orbs that drain/refill and pulse when critical | *May ship as a vitals-strip display style instead — decide when scheduled |
| G4 | Tactical Room Radar | Instrument | You at center, exits as rim arrows, creatures/players as dots in Contact colors | Backlog |
| G5 | World Ambiance Strip | Instrument | Time of day, moon phases, weather glyphs, sky gradient (moons/weather from Lich vars) | Backlog |
| G6 | Active Spells & Buffs Board | Instrument | MMO buff chips with radial countdowns from Lich's spell timers | Backlog (needs Lich surface bridge) |
| G7 | Comms Console | Instrument | Social streams as a chat client — Contact-colored speakers, channel tabs, unread badges | Backlog |
| G8 | Skill Momentum Dashboard | Instrument | Mindstate sparklines, session TDP counter, time-to-next-rank projections | Backlog |
| G9 | Portrait Forge | Instrument (AI) | AI portraits from LOOK text, scene art from room prose (= AI9; procedural fallback always) | Backlog (needs AIProvider) |
| G10 | Reactive Soundscape | Instrument (audio) | Heartbeat tracks health, RT-clear chime, whisper/foe cues, ambient beds | Backlog |
| X1 | **Living Tableau ("Gather Mode")** | Scene | Room becomes a living scene — avatars, speech bubbles, choreographed arrivals, painted backdrop | **Experience #1 — next to build (decided 2026-06-12)**; the scene PLATFORM (X2/X4/X5/X6 reuse it) |
| X2 | Spar Arena | Scene | Duels staged like a fighting game; the space between avatars IS range | Backlog (needs G1's parser + X1) |
| X3 | Empath's Ward | Scene | Party frames with vitals + wound pips; click STAGES a heal, human sends | Backlog |
| X4 | Bardic Stage | Scene | Performances as shows — rising notes, motion trails, reacting audience | Backlog (needs X1) |
| X5 | Tavern Games Table | Scene | Dice/cards mirrored onto an animated graphical table | Backlog (needs X1) |
| X6 | Scene Composer | Scene | Freeze a moment into a shareable comic panel — the viral loop | Backlog (needs X1) |

The **AI-series (AI1–AI10, §32.3)** is a parallel *assistant* track, not layout surfaces — but several
render inside or feed Experiences (AI9 paints X1/X6/G5; AI7 analyzes what G1's parser captures), and
every one keeps its mandatory non-AI baseline (guardrail #3: AI enhances, never gates).

### 34.2 Why this model — the two rejected alternatives

Recorded so the reasoning isn't re-litigated later:

1. **REJECTED — "Interactive Mode" as a per-panel view toggle** (right-click a stream panel →
   graphical rendering of it). Killed by a game-protocol fact: **Simutronics splits combat text**
   between the combat stream and main, so many players deliberately don't use a combat window at
   all — hanging the Combat HUD off the combat panel would gate the flagship feature behind a
   window people skip. The deeper flaw: the HUD was never a rendering of the combat *stream*; it
   reads parsed game *state*, which flows regardless of where any text routes. The same is true of
   every G-series instrument.
2. **REJECTED — "Interactive Streams" as a new panel category** (a `type: 'interactive'` tab kind +
   reserved `lb:*` id namespace + grouped Panel Manager sections). Workable, but it (a) forces
   instruments/scenes into tabbed-panel chrome — a HUD that can be hidden behind a Thoughts tab is a
   failed HUD; (b) touches the mature panel system (PanelType union, discovery filter, Panel Manager
   filters, pitfall #27 logic) for no user benefit; (c) requires namespace bookkeeping forever. The
   Experiences model gets the same features with zero panel-system risk.
3. **DISCARDED — the "v2" conversion revision (drafted 2026-06-11, deliberately dropped 2026-06-12);
   its DUAL-HOSTING half was later SUPERSEDED (Sekmeht, 2026-07-08).**
   A revision that converted the structured panels (exp/room/injuries/map/lichScripts) into
   Experiences with dual hosting (floating surface OR an `[e]`-badged tab) was drafted, partially
   built, and then **discarded on purpose** along with its code. Two halves, two fates:
   - **Panel→Experience CONVERSION stays discarded.** exp/room/injuries/map/lichScripts remain
     panels forever; the panel/stream system stays byte-identical.
   - **Experience-as-tab dual hosting SHIPPED in v0.15.1** at Sekmeht's explicit, screen-estate-
     motivated ask ("Experiences… selectable in the + button… separator… [e] badge"), built fresh
     (not restored from the v2 draft) with the §34.1 collision-safety guarantee intact: hosted
     tabs use the `exp:<id>` namespaced id + a dedicated `type: 'experience'` (NOT in
     ALL_PANEL_TYPES — never a generic builtin row), the + menu's [e]-badged section below a
     separator is the only add path, `renderExperienceTab` rides `sharedFrameProps` (B193) so
     both hostings render one content builder, tab-hosted experiences share the floating
     instance's ⚙ `hidden` prefs, take the panel's F31 A+/A− (re-mapped onto `--game-font-size`),
     count toward the §35.6 scene-work gate via a pitfall-#79 per-mode aggregation (`expTabIds`),
     and are EXCLUDED from `watchedStreamsRef` (they consume typed state, not stream text).
     Known edge: the Experiences shelf reflects floating instances only — a tab-hosted copy
     doesn't light its row. No slash surface (the + menu is the surface; pre-merge check #5).

**Why Experiences win:** the engine already exists. The Maps overlay (`showMapOverlay` →
`.map-overlay-window`, opened from the app bar) is the shipped precedent for a graphical surface
floating over the layout, and v0.13.0's `FloatingWindow` (drag / resize / fractional rects /
magnetic snapping / lock) is the host component. An Experience is precisely *a registered floating
window with a graphical component inside*.

### 34.3 Registry

One module, `src/renderer/experiences.ts`:

```ts
interface ExperienceDef {
  id: string                  // 'combatHud', 'tableau', … — own id space, disjoint from streams/panels
  label: string               // user-facing name shown on the shelf
  component: React.ComponentType<ExperienceProps>  // shared props bag (game state slices, sendCommand-stager, settings)
  defaultRect: FloatRect      // fractional, like FloatWindow rects (§33.3)
  chrome: 'standard' | 'compact'  // compact = minimal/frameless chrome for HUD-like instruments
  multiInstance?: boolean     // default false; reserved for future (two radars is nonsense, but the model allows it)
  textEquivalent: string      // REQUIRED doc string: what existing text/state surface carries the same info (§32.4 contract)
}
```

Adding a future Experience = **one registry entry + its component**. No PanelType union change, no
labels map, no Panel Manager edits, no discovery-filter audit.

### 34.4 The Experience layer

A new `ExperienceLayer` rendered by GameWindow **in BOTH layout modes** (this is the one real piece
of new infrastructure — §33's `WindowLayer` is gated to free mode only):

- Hosts one `FloatingWindow` per open Experience — reusing the v0.13.0 component verbatim where
  possible (snapping, guides, Alt-disable, arrow-nudge, lock, fractional rects — the §33.4/§33.5
  machinery).
- **Static Panels mode:** the layer floats over the skeleton, exactly as the Maps overlay does
  today. **Windowed Panels mode:** it cooperates with the existing window layer (same snap targets,
  same lock toggle).
- **Z-discipline:** same rule as §33 — modals/overlays (Panel Manager, Settings, Maps, context
  menus) must out-z the layer. Experiences sit above the game layout, below all modals.
- **Per-session isolation (Principle #6):** the layer and all Experience state live inside each
  GameWindow — per-character, no cross-session bleed, works for backgrounded tabs under the usual
  hidden-≠-unmounted rules (pitfall #24: anything layout-measuring must guard 0×0 and re-measure on
  show).
- Geometry follows the §33 / pitfall #74 law: **deterministic and explicit** — fixed/explicit sizes
  from `defaultRect`, 0-safe coordinate parsing, never browser-computed auto-height.

### 34.5 The shelf (add/manage UX)

An **"Experiences"** button in the app bar (the Maps button is the precedent), opening a picker of
registered Experiences with open/close toggles. Routed like every app-bar action through the
session-action bridge to the active GameWindow; the button gets a `SessionStatus.panel*`-style
open flag (the established reflect-via-snapshot pattern, pitfall #57) **while the shelf is open —
the same rule as every other app-bar button: lit means "clicking this closes what it opened"**.
Until v0.19.7 it was lit whenever ANY Experience was showing, floating or docked as a panel tab;
a docked tab is permanent layout, so the button never went dark, and once B345 gave the open state
a real accent ring it read as stuck (B346). The "is an Experience live?" question still drives the
§35.6 scene-work gate (`expAnyOpen`) — it just no longer drives the button.
Closing an Experience never loses anything — reopen it from the shelf (the "updates and accidents
never break what you built" promise). Right-click garnish ("Add Combat HUD" from a relevant panel)
is optional, later, and purely a shortcut to the same add.

### 34.6 Persistence & Profile Transfer

One new per-character scopedKey (e.g. `scopedKey(character, 'experiences')`): the open instances +
their rects + per-Experience prefs. It rides the dynamic `state:` pipeline into YAML automatically —
**no profile-shape change** (Principle #1; pre-merge check #4 answer: "new optional state suffix").
Add a new **"Experiences"** category to `TRANSFER_CATEGORIES` (pitfall #56's allowlist) so setups
travel via Profile Transfer; per-Experience settings default to NOT transferred until listed.

**Per-window view controls (v0.14.7, Sekmeht).** Every Experience window carries hover-quiet
**A−/A+** buttons (a per-instance font override — applied by shadowing `--game-font-size` on the
window's subtree, since every Experience sizes its text off that var; seeds from the live global
font, clamps 8–24) and, when the registry def declares `options`, a **⚙ "Show in this scene"
popover** of content-layer checkboxes (`ExperienceOptionDef { id, label, desc }` — the desc is the
tooltip, polish standard #8). The component gates layers off the `hidden` map at its single prop
entry point (Tableau: speech/yells/whispers/thoughts/emotes/creatures/moves — filtered arrays are
useMemo'd because effects key on their identities). Both persist as OPTIONAL `ExperienceInstance`
fields (`fontSize`, `hidden`) — old saves load unchanged, and they ride this section's scopedKey →
YAML → Transfer with no new plumbing. **Slash surface: no command by design** (pre-merge check #5)
— per-window visual controls whose surface is the window itself; an `/experience` noun stays a
future consideration.

**Tab-hosted ⚙ (v0.15.2, Sekmeht — "I don't see the layer options anymore").** The ⚙ above was
floating-window chrome only, so an Experience hosted purely as a PANEL TAB (§34 dual-hosting,
v0.15.1) had NO path to its layer options. PanelFrame's F31 view-controls corner now adds the same
⚙ on an active experience tab whose registry def has `options`, opening the identical
`.exp-inst-options` popover (a `--tab` position modifier — bottom-right, above the A−/A+ stack).
It edits the SAME instance `hidden` map via two sharedFrameProps (`getExperienceHidden` /
`onToggleExperienceOption` — B193: one source for both hostings, so window and tab can never
disagree), with **find-or-create**: a tab-only experience mints a CLOSED instance at the registry
`defaultRect` purely as the prefs record (open: false — the shelf/layer ignore it until opened).
Font sizing stays the panel's own F31 A+/A− (unchanged). The popover closes on tab switch.

### 34.7 Theming, accessibility & guardrails

The standing law applies in full: every color a `--exp-*`/`--hud-*` var cascading from general vars
via `color-mix` in `darkBase` (pitfalls #34/#63) + a light-theme eyeball pass (Principle #4); roots
anchored to `var(--game-font-size)` with `em` children where game-scaled sizing is wanted
(Principle #9 / pitfall #58); high-contrast / color-blind / epilepsy-safe respected via
`applySettingsToDOM` overlays (pitfall #33) — instruments must encode meaning by **shape and
color, never color alone**, and epilepsy-safe swaps flashes for static states. The §32 guardrails
bind every Experience: display & surface, never automate (clicks may *stage* a command via the
existing `@` cursor convention — the human always sends); AI is BYO-key and **enhances, never
gates** (procedural fallbacks always).

### 34.8 Add-a-new-Experience checklist

1. Registry entry in `experiences.ts` (id, label, defaultRect, chrome, `textEquivalent` stated).
2. The component, reading typed game state via the shared props bag — never raw stream-text scraping
   where a typed event exists; if new parsing is needed, add typed events in the parser first
   (sessionId on every payload, Principle #6).
3. Theme vars + light-theme pass; accessibility toggles verified (the Principle #9 check).
4. Decide its `TRANSFER_CATEGORIES` exposure.
5. No panel-system files touched — if a change seems to need one, the design is drifting back to
   §34.2's rejected models; stop and re-read this section.

### 34.9 Build phases

1. **Scaffold:** `experiences.ts` registry + `ExperienceLayer` (both modes) + the app-bar shelf +
   persistence + the Transfer category.
2. **Experience #1 — Living Tableau (X1, §32.2; decided 2026-06-12):**
   - **Phase 1 — the kernel:** cast assembly from `roomState.players`/`creatures`, stable hashed
     seating, **procedural avatars** (initials + guild sigil + Contact color — no AI dependency),
     Say speech bubbles tinted by Contact color, focus-the-speaker. Requires the **`SceneParser`**
     (name pinned 2026-06-12 — §32.4's shared-engine list): new typed *scene events* for speaker +
     channel attribution (today speech/emotes are only styled text lines — no typed "who said what"
     event exists). **Raw-XML corpus capture of a busy room
     (tavern/festival: speech, whisper, emote, arrival shapes) precedes the parser**, exactly as
     the G1 plan prescribed for combat.
   - **Phase 2 — choreography & channels:** typed arrival/departure events with direction
     (slide in from the matching edge), emote action-captions + physical beats, whisper-to-you
     dotted-tail bubbles, thought/ESP wisps (**never a body in the room** — the speaker isn't
     physically present; v0.17.0/B221 collected into a quiet **bottom-left "thought log"**, newest
     at the bottom and older receding up, so they don't obscure the scene), and the crowd cap (real
     avatars for active/known speakers, a "+N others" silhouette, promote-on-speak).
   - **Phase 3 — the AI tier** (needs the `AIProvider` adapter, §32.4): cached per-room-id
     backdrops from room prose, LOOK-derived portraits cached per name, optional emote
     interpretation — all opt-in; the procedural/flat-themed fallback remains the baseline forever
     (guardrail #3). Epilepsy-safe tames entrance/exit motion; the synchronized text equivalent is
     the game text itself, which Tableau augments and never replaces.
   - **v0.14.1 (incremental):** a deliberately SMALL follow-up after a larger overhaul attempt
     (engagement-field re-layout + verb-interaction arrows + a "calm-stage" stable-rows rewrite) was
     tried and **parked** (Sekmeht/Morralles: "the 0.14.0 way it worked is good — make incremental
     changes through the versions, not a major overhaul"; the work is preserved on the
     `wip/tableau-overhaul` branch if any piece is wanted later). v0.14.1 keeps the v0.14.0 Tableau
     and layers in only: **individual monsterbold creature figures** (one per critter, `deadCount`
     greys exactly the corpses, >10 → "+N more"; supersedes the ×N chip); the **self figure wearing
     its indicator states** (hidden/invisible shadow, dead grey, condition-colored ring + per-state
     chips, from the new `indicators` Experience prop); **clickable contact figures** (✦ + the
     `onOpenContact` prop opening the same ContactPopover as in-text name clicks); cross-layer
     **window snapping** (Experience ↔ panel windows, B185); and the scene background matching the
     floating-window surface (`--experience-scene-bg`→`--bg-app`, B186). **The lesson:** the Tableau
     evolves in small reversible steps; resist big-bang re-layouts.
3. **Experience #2 — Moons (SHIPPED v0.15.1, Beta; Sekmeht 2026-07-08; renamed from "Weather &
   Moons" same day — the id stays `moons`, and the [e] badge in the + menu AND the tab strip keeps
   it distinct from moonwatch's "Moons" STREAM):** a sky-dial
   *instrument* over the community **moonwatch.lic** feed — proof that an Experience can ride a
   LICH SCRIPT's stream (the script pushes ` [k]±(N) [y]±(N) [x]±(N)` into `moonWindow` ~once a
   real minute; `+` = up/sets-in-N-minutes, `-` = down/rises-in; order Katamba/Yavash/Xibar).
   - **Positioning math:** the script's own orbital constants (up durations katamba/yavash/xibar =
     177/177/174 min; below-horizon waits 174/175/172) turn a remaining-minutes countdown into an
     arc position (`progress = 1 − remaining/upDuration` on a half-ellipse). Down moons rest dimmed
     below the horizon with "rises in Nm" chips. Countdowns tick locally (30s interval) between
     reports; the footer ALWAYS shows data age ("moonwatch: 3m ago") — the feed is crowd-sourced,
     so stale data must never masquerade as live.
   - **Sun is native — observed, anchored, then self-running:** sunrise/sunset are detected from
     DR's ambient prose (the 11 rise/set patterns mirrored VERBATIM from moonwatch.lic's own
     detection — `SUN_RISE_RE`/`SUN_SET_RE` in [experiences.ts](src/renderer/experiences.ts)),
     captured in GameWindow's main-stream branch behind a substring pre-gate (pitfall #82a). The
     sun's cycle is **360 real minutes rise-to-rise** (moonwatch's own constant,
     `minutes_to_next_sun_event`) and real-time periodic, so ONE observed transition anchors the
     phase indefinitely: `computeSunPhase` derives live day/night + arc position from the stored
     `riseAt`/`setAt` anchors (day length = the observed rise↔set gap, 180/180 assumed — flagged
     `≈` in the UI — until both are seen), a golden sun rides the moon arc by day with a "sets in
     Nm" countdown (and travels the underground return arc by night, dimmed like the waiting
     moons), the backdrop auto-advances day/night/twilight (dusk gradient = the ~12 min
     around a transition, or nothing-observed-yet), and the anchors persist per-character
     (`moonSun` scopedKey → YAML; deliberately NOT transferable — observation telemetry, and any
     character re-anchors in one transition). Anchor sources, in priority order: locally-OBSERVED
     prose transitions (exact + freshest; provenance-flagged) > the **dr-scripts Firebase**
     (`moon_data_v2.json`, the same public read-only feed moonwatch itself polls — its `s` node
     carries the community-observed rise/set EPOCHS = both anchors exactly, true day length, no
     assumption; fetched via main's `moons:fetch-sun-data`, 10-min cached, works direct-SGE) >
     the `UserVars.sun` lich.db3 synth (180/180-assumed, ≈-flagged; only runs when the fetch
     FAILED). The sky itself is CONTINUOUS: sun-elevation blend weights crossfade stacked
     gradient layers (night base → day → noon zenith → horizon twilight), stars fade with the
     night weight, and bodies within ~7% of a transition breathe slow horizon rings (expanding =
     rising, contracting = setting) — all motion suppressed under epilepsy-safe AND by the
     "Rise & set effects" ⚙ layer. All of this works direct-SGE (Principle #2); the
     moon feed itself needs Lich + `;moonwatch window` — the empty state teaches exactly that
     (graceful degradation, not a wall). **Moons stay STREAM-driven by the script — the Firebase
     moon-position fallback was proposed and DECLINED (Sekmeht, 2026-07-08); only the sun reads
     the feed.**
   - **Fantasy presentation (Sekmeht's UX-review picks):** a deterministic two-ridge **horizon
     silhouette** (fixed height table — same W in, same mountains out; drawn before the bodies so
     rises emerge in front); **hover lore-cards** on every body (`<title>`: the in-game moon
     descriptions + "Rises/Sets at ~H:MM (Nm)" local clock); a footer **"next" chip** (soonest
     MOON transition — a sun-next would duplicate the sun's own chip); and **countdown-chip
     collision avoidance** (per-render `placeChip` claims in draw order, estimated widths — sky
     chips step down, underground chips flip above their disc). Parked from the same review:
     constellations (real names live in `base-constellations.yaml`), empty-state-as-scene,
     small-caps names, Moon Mage castable cues, and `perceive moons` phase prose. (The other two
     telemetry asks from that review — the TIME-verb Elanthian calendar and weather — SHIPPED in
     v0.17.0, see the Tier 2 bullet below.)
   - **Boundaries:** `parseMoonLine` / `computeSunPhase` are pure exported functions (harness: 56
     cases against the real bundle, incl. moonwatch's NEGATIVE overdue timers `[x]-(-2)`); the
     stream-id match is read-only (routing/discovery untouched — the `moonWindow` stream stays
     addable as a plain text panel, which IS the text equivalent). Geometry: the viewBox WIDTH
     derives from the drawing area's measured aspect (ResizeObserver, 0×0-guarded per pitfall
     #83) so single-axis resizes widen the horizon instead of letterboxing — the width ceiling
     (5000) is a degenerate-measurement guard ONLY, never a layout limit (B204: the original 1100
     ceiling triggered on ordinary maximized panels and letterboxed the SVG ground away from the
     full-width HTML sky layers); SVG text sizes via
     `calc(var(--game-font-size) * k)` — CSS px are SVG user units, so it lives in drawing space
     AND tracks Settings font + the per-window A−/A+ override (the B201 map-LABEL approach); HTML
     chrome anchors to the var + em. ⚙ options are ONE PER VISUAL LAYER, each accurate
     about exactly what it hides (The Sun / Living sky / Countdown labels / Name labels / Horizon
     silhouette / Rise & set effects — the original combined "Sun & sky" conflated hiding the sun
     with flattening the backdrop, Sekmeht's call to split; `sunPhase` computes regardless of the
     sun toggle because the SKY needs it) via `ExperienceDef.options` — zero new UI. No slash
     command by design (the shelf is the surface; pre-merge check #5, the F53 precedent). No
     profile-shape change (`moonSun` is a new optional per-character state suffix).
   - **Tier 1 — time-of-day WORD (SHIPPED v0.17.0):** DAY / NIGHT / DAWN / DUSK on the sky
     (`skyPhaseLabel`), derived from the SAME sun elevation the gradient uses so the word can never
     disagree with the backdrop; centered just above the horizon (clear of the moons/sun that rise
     and set at the left/right ends); follows the ⚙ "Living sky" layer. No new data — it rides the
     sun phase already computed. **Once TIME is captured, the fine Elanthian DAYPART is appended in
     parens** (`Night (late evening)`, from `calendar.timeOfDay`) — so the daypart moved OFF the
     footer date line (which now reads month · year · season). Absent before a sync (just `Night`).
   - **Tier 2 — weather + the Elanthian calendar (SHIPPED v0.17.0). NOT called "Almanac"** (that's
     Simutronics' separate, later feature — the term is banned; this is the "Moons" experience).
     DR exposes NEITHER passively (verified across drinfomon/DRStats/Vars/XML — the ONLY sources are
     the `WEATHER` and `TIME` commands; no moonwatch-style community script stores them, and
     `almanac.lic` is an unrelated skill-training grinder). So both are **command pulls**, but the
     ⟳ is **SILENT** (Sekmeht: "don't want players to see the command go through") — it sends
     `TIME` + `WEATHER` via RAW `window.api.sendCommand` (pitfall #53's no-echo pattern) and their
     replies are CONSUMED (never shown, logged, or triggered).
     - **Weather** is PASSIVE-capturable too: the glance marker (BOTH `You glance up at the sky.`
       outdoors AND `You glance outside.` indoors-with-a-window — `WEATHER_GLANCE_RE`) is followed
       on the NEXT main line by the weather prose, shown VERBATIM; any natural sky-glance updates
       the chip. The enclosed refusal `That's a bit hard to do while inside.` is a GENERIC refusal
       (never matched passively) → "indoors" only inside a ⟳ sync.
     - **Calendar** parses ONLY a ⟳ sync's TIME reply (line 3's `It is currently X and it is Y`
       isn't unique enough to trust from room prose): `parseTimeLine` → day/month/year/season/
       daypart, with day-of-YEAR (0-indexed "N days since the Victory") → day-of-MONTH via the new
       platform reference [elanthianTime.ts](src/shared/elanthianTime.ts) (uniform 40-day months),
       so it reads `4 Ka'len the Sea Drake · 457 A.V. · ❄️ winter` (the daypart moved to the sky
       label — Tier 1). Season/daypart are taken VERBATIM from TIME line 3 (winter wraps the year
       boundary, so a naïve day→season quartering would be wrong).
     - **F81 — GRADED weather severity (v0.18.2, Sekmeht: "I'd like to add adjectives too, like
       completely, very… so Lichborne can add more clouds, take away clouds").** `WeatherFx` gained a
       0–1 **`cover`** and **`precip`** alongside the booleans, from a most-specific-first DEGREES
       table (ordering is load-bearing: "a FEW scattered clouds" contains "scattered", "very cloudy"
       shares a stem with "cloudy") plus **condition floors** — a thunderstorm cannot sit under a
       mostly-clear sky, so storm floors cover at 0.95, rain/snow 0.75, fog 0.5, clouds 0.35, while a
       stated degree may still push ABOVE a floor. Cover drives cloud COUNT (the array grew 4 → 10
       bodies, sliced by cover) **and per-cloud SIZE**, so a sky thickens by containing more cloud.
       **An overcast DECK** — a gradient solid overhead and gone by the horizon, deliberately the
       INVERSE of the fog gradient — fades in only past **0.9** cover. It first appeared at 0.6 and
       was reported as looking foggy at "very cloudy", which is the whole lesson: *a translucent sheet
       over the entire sky reads as FOG, a different condition the prose may not have reported at
       all.* **THE FOG LAYER WAS REMOVED ENTIRELY** in the same pass (Sekmeht: "let's avoid the fog
       effect in general") — a haze dulls the sky gradient, the moons and the landscape at once and
       reads as a washed-out render rather than as weather, at any opacity that would make it legible.
       `WeatherFx.fog` is still PARSED and still carries meaning (it suppresses shooting stars and
       floors cover); it simply has no layer, and both the type and the render site say so, so nobody
       "fixes" the missing effect. Locked by `tmp-moon-harness/weather.mjs` (21 assertions over the
       degree ladder, monotonicity, floors and precip density) — which immediately found **B242**,
       `\bcloud` matching *cloudless*. Also v0.18.2: **shooting stars made rare** — six streaks on
       8–13s cycles is a COMBINED rate of one every 1.7s, so cycles went to 150–210s (~one per 30s)
       with the keyframe's visible window shrunk to 0.8% so the streak still crosses in ~1.5s. The
       duration governs BOTH frequency and speed; change one without the other and you get
       slow-motion meteors.
     - **Weather-effect sky animations + season icons (v0.17.0):** `detectWeather(prose)` regexes the
       captured weather line into `WeatherFx` flags (snow / rain / clouds / fog / wind / storm / clear
       / heavy — `\b`-anchored keyword sets; `gale` is WIND not storm; storm ⇒ rain+heavy+clouds; any
       precip ⇒ clouds) that drive CSS-keyframed SVG layers over the sky: drifting clouds behind the
       bodies, falling snow / rain slanted & sped by wind, a horizon fog gradient, an occasional storm
       lightning flash. Particle arrays are DETERMINISTIC (index-hashed, no `Math.random`); motion is
       gated by the ⚙ "Weather effects" layer AND `epilepsySafe`, and the SVG helpers are module-
       hoisted (pitfall #4, no hooks) so nothing re-renders per frame. A **season icon** (❄️/🌱/🌻/🍂)
       prefixes the season on the date line. Indoors, the weather line shows a **⌂** glyph + "sky not
       visible — step outside" (a UX call over a literal house-in-sky). `wx` is a PLAIN const (NOT a
       hook) placed after the `if (!moons) return` — a `useMemo` there changed the hook count when
       moon data arrived and crashed the mount (Rules-of-Hooks).
     - **Suppression is per-REPLY-BLOCK, not a time window** (`silentSyncRef {time,weather,at}`) —
       the load-bearing fix so a `TIME`/`WEATHER` you type YOURSELF always shows (an 8s window ate
       typed commands). Each flag clears at its reply block's **LAST line** IN-LOOP (weather =
       desc/refusal; TIME = L4 roisaen/Anlas), **NOT post-batch** — a post-batch clear dropped TIME's
       month/season/daypart when its 4 lines split across flushes ("Day 44 · 457 A.V." with no
       month); block-end clearing is batch-agnostic (`at`+`SKY_SYNC_WINDOW_MS` backstop a reply that
       never completes). Computed at the top of the main `stream-text` case, `suppressSync` gates the
       log record + the `newMain` push + triggers; capture runs regardless. `silentSyncRef` +
       `awaitingWeatherRef` are RESET on a reconnect-in-place (pitfall #69) so a mid-sync/mid-glance
       flag can't carry over and mis-capture the new connection's first line.
     - **UI — a HEADER strip + a FOOTER strip** (Sekmeht): the header holds "what's happening in
       the sky now" (sky phase · moons · weather), the footer holds the Elanthian date — full-width
       bands, siblings in the `.moons-scene` flex column, CENTERED inline-flow rows so the weather
       sentence wraps; consistent `KEY value age` segments divided by a faint bar; a ⟳ ends BOTH strips
       (header + footer — the footer one alone was easy to miss; same silent pull, same tooltip). (Iterated hard — don't re-litigate:
       footer-only run-on → too-tall 4-row grid → 2-row footer → a floating top pill (rejected) →
       these two strips.) Three ⚙ layers ("Weather", "Weather effects", "Calendar"); no slash command (§34.6). No
       profile-shape change (weather/calendar are in-session only — they go stale by nature).
     - **CONTRAST is sky-adaptive** (`sceneInk` lerps off `wDay`): the text `color` (dark by day →
       light by night), a `--moons-halo` (opposite lightness — an SVG `paint-order:stroke` behind
       the scene text so names/chips/the DAY word read on any sky; day was the weak case), and a
       `--moons-band` (opposite the text — a frosted-light strip by day behind dark ink, a dark
       strip by night behind light ink; a fixed dark tint was low-contrast by day). Scene text fades
       via `fill-opacity` so the halo stays solid. The one THEMEABLE cue is the arc guide
       (`--moons-guide` → `var(--accent)`, blended toward the sky-ink); the sky gradients / moon lore
       colors / shadow landscape stay FIXED realistic-lore data (Principle #4 exception, like the
       map's baked tiles). Bug-checked comprehensively (2026-07-20): no blocking bugs; residuals
       (skill-dependent TIME L4 leak; 8s over-suppression of a typed cmd after a DROPPED ⟳ reply)
       are minor + documented.
     - TIME line 4 (skill-dependent fine clock) is consumed-not-parsed via `roisaen`/`Anlas`
       tokens (an exotic low-skill variant may leak a line — refine with a sample).
     - **elanthianTime.ts** is the platform-wide Elanthian date/time reference (unit conversions,
       month names, seasons, 7-year cycle, dayparts, `dayOfMonth`/`monthIndex`) — reuse it for any
       future Earth↔Elanthia conversion.
     - **Living-sky visual pass (SHIPPED v0.17.0, Sekmeht):**
       - **Sun-centric sky glow.** The day's brightness now FOLLOWS THE SUN, not the horizon — a
         userSpace radial (`lb-sunglow`) centered on the sun's arc position, warm-white broad at noon,
         tightening + warming to gold near the horizon (so sunrise/sunset glow tracks the sun through
         dawn/dusk), fading out below the horizon so NIGHT STAYS NIGHT. The base day/zenith gradients
         were flattened (were brightest at the bottom → uniform) and the full-width twilight orange
         softened, so the sun is the bright focus rather than the whole horizon.
       - **F69 — sun-lit moons.** Each up-moon is lit from the sun's on-screen direction: a per-moon
         `radialGradient` with the highlight offset toward the sun (tinted by the sun's colour/strength
         via `color-mix`, applied through `style` not the SVG attribute) fading to a shadowed far side
         (terminator), plus a sun-facing specular glow. The moon's own palette (`MoonStyle.tones`)
         drives the hue — Yavash warm-red, Xibar cold-silver, Katamba sooty. Underground moons keep the
         flat fill. *Lore caveat RESOLVED 2026-07-28 (see F64a): DR moons genuinely DO phase — the game's
         `observe <moon>` verb reports phase wording and the DR client carries per-moon sidereal periods,
         so the lit/terminator look is lore-correct rather than artistic licence. F64a replaces the
         approximation with the real phase shape.*
       - **Twilight glow (Sekmeht).** The sun glow PERSISTS below the horizon through dusk (fading out)
         and pre-dawn (fading in), reaching 0 by `sunElev = -0.16` (formal night) → no deep-night leak,
         anchored at the horizon crossing (y clamped to the horizon when the sun is below).
       - **Crepuscular ground rays.** A fan from the sun's horizon point across the landscape (`RAY_FRACS`
         → the bottom edge): warm LIGHT beams at sunrise, dark SHADOW rays at sunset (`rising = progress
         < 0.5`), + a warm light-pool at the crossing. Drawn OVER the ground, UNDER the ridges (backlit
         mountains); fades past golden hour. *Known: the sunset shadow is low-contrast on the dark earth
         ground (dark-on-dark) — pops on snow; boost if a tester wants it bolder.*
       - **Day/night landscape shade (`groundShade`).** The whole ground is lit + normal by day and
         falls into SHADOW at night — a dark overlay over the ground region whose opacity tracks
         `sunElev` (0 by day → deepest at night, lifting through dawn). It's DIRECTIONAL: a radial
         anchored at the sun's horizon crossing (`sunLightPos.x`), so the side where the sun rises/sets
         stays lit longest and the far side darkens first (the shade sweeps as the sun moves). Drawn over
         the ground + rays so the sunset shadow deepens into night and dawn light lifts it.
       - **Real horizon occlusion + fixed-duration set (Sekmeht).** The bottom half is now an OPAQUE
         season/weather ground (`lb-ground`), and bodies are drawn BEHIND it so a setting sun/moon SINKS
         behind the horizon. Instead of crawling the slow underground arc (which looked "stuck" for
         ~40 min), a set body SINKS below over a FIXED `SET_MIN` (4) minutes then is HIDDEN, and EMERGES
         over 4 min before rise (`crestPos`; the sun needs `SunPhase.phaseMin` = the current phase's
         length). The **orrery pill** (`.moons-pill`, frosted theme-matched glass above the footer)
         carries every body's next rise/set while it's hidden. Down-body scene text was removed; the sun
         text is day-only. Weather clouds + the shooting star now render IN FRONT of the bodies.
       - **F67 — twinkling stars + a rare shooting star** (one element on a ~22s CSS cycle, clear nights).
       - **F68 — fireflies** on SUMMER dusk/nights. **Aurora was REMOVED** (it read as moving colour
         squares). **F70 — seasonal horizon:** a snow-field ground + a bright snow line on the ridge tops
         in winter (all gate on the ⚙ Seasonal touches layer).
       - **Every layer is a ⚙ toggle (15).** sun / sunglow / rays / sky / moonglow / sunlight / pill /
         countdowns / names / horizon / seasonal / effects / weather / weatherfx / calendar — each gates
         exactly its own layer. **Countdowns + names default OFF** (the pill covers them): registry
         `defaultHidden: true` + `optionShown(hidden, opt)` / `defaultHiddenMap(def)` helpers so the ⚙
         checkbox, the component gating, and the STORED value always agree; toggles store the EXPLICIT
         hidden value (not a blind flip), new instances are seeded with the defaults so the default
         PERSISTS to the profile (the `onSetExperienceOption` path in GameWindow + ExperienceLayer +
         PanelFrame). **Bug fixed:** the sun's GEOMETRIC elevation is `sunElev` (independent of the
         Living-sky toggle); the sky-gradient weight source `elev = showSky ? sunElev : null`. Before the
         split, turning Living-sky OFF also killed the sun glow / rays / moon-lighting (they shared `elev`)
         — those are separate ⚙ layers and must stay independent.
       - All ANIMATED ambient (F67/F68 + the ray shimmer) gates on the ⚙ Effects layer + `!epilepsySafe`
         (via `anim`); F69/F70, the sun glow, rays, occlusion, and the pill are STATIC (always on when the
         data + their own toggle support them). The daypart moved to its OWN smaller line BELOW the
         DAY/NIGHT word; header/footer borders gained a stronger edge + halo hairline; freshness collapsed
         into the ⟳ TOOLTIP with an amber **stale** pulse (>10 min, nudge not a forced refresh).
     - **Living LANDSCAPE below the horizon (SHIPPED v0.17.0, Sekmeht — "I like nature").** The ground band
       hosts a persistent, data-free NATURE scene (`MoonsLandscape`, module-hoisted no-hooks sub-component)
       under a new ⚙ **"Trees & water"** option (id `landscape`, default on): a distant forest edge, mid +
       large foreground trees (mixed pine + round), a winding **stream** into a reflective **lake**. (A first
       "village in the foothills" draft — buildings with night-lit windows — was REPLACED by nature at
       Sekmeht's ask; the option id stayed `landscape` so saved prefs carry over. Don't reintroduce buildings
       without a fresh ask.) Model:
       - **Perspective** — element size scales with baseline y (`persp` 0.5 near horizon → ~1.45 near the
         bottom), distant pieces fade toward a pale haze (atmospheric perspective), everything LIGHTENS by
         day / DARKENS at night via `landNight` (from `sunElev`, no TIME check). Colours lerp through a
         module-level **`mixHex`** (Principle #4 realistic-colour exception; NOT color-mix-as-SVG-attribute).
       - **Daytime contrast** (Sekmeht: "hard to tell what they are") — saturated foliage vs a desaturated
         neutral ground, dark **edge outlines** on canopies, **contact shadows**, a **dark rim** on the lake.
       - **Sun-DIRECTIONAL shadows** — cast along the SAME radial fan as the crepuscular rays: from the sun's
         horizon point `(sun.x, horizonY)` THROUGH the object base, so straight down under the sun, ~4–5
         o'clock toward the far side, longer as the sun sinks, flatter near the horizon (depth); a rotated
         ellipse renders the angle; soft ambient blob at dusk/night.
       - **Lake reflections** — shimmering columns for the sun (day) + the lit moons (Yavash/Xibar) where
         they pass above the pool (clipped to the lake's height at that x, no clipPath); **Katamba excluded**
         (no light); skipped when the lake is **iced** (winter).
       - **Seasonal dressing** (rides the existing ⚙ "Seasonal touches" + a known season, else neutral): a
         per-season foliage palette (`SEASON_CFG`) + winter snow-caps & **iced lake/stream**, spring
         **blossoms**, summer lushness (+ fireflies), autumn recolour + **falling leaves** (`LEAVES` +
         `.moons-leaf` keyframe, gated on `anim`/epilepsy-safe).
     - **KATAMBA HAS NO GLOW as of v0.19.6 (Sekmeht) — do not reinstate it without a fresh ask.**
       It carried the miasmatic haze described below for two versions; removed outright because the
       moon is black as soot and sheds nothing, so the truest rendering is nothing at all, and its
       soot disc + violet-grey rim already identify it. **`MoonStyle.glow` is now OPTIONAL, and its
       ABSENCE is the switch** — both the glow-gradient defs and the disc layer key off the field
       rather than the name, so they cannot disagree about which moons glow (both used to
       name-check `'katamba'` separately). Its `glow`/`glowStrength`/`glowR` were deleted rather
       than left as inert data. The paragraph below is kept for its still-live lesson about black
       glows, and for Yavash/Xibar.
     - **Moon-body colour + glow corrections (v0.17.0, Sekmeht, from the in-game illustrations).** Katamba =
       soot-black disc + **grey** rim + (UNTIL v0.19.6) an **ominous miasmatic dark-violet glow** (`#2a123f`)
       that HELD
       through day+dusk and faded only into true night (`clamp01((sunElev+0.35)/0.3)`). **A pure-black glow
       was tried and is INVISIBLE on a dark sky** — black only darkens, so a "shadow" glow that must read at
       night has to be a coloured haze. (That is why the haze was violet; it is now simply gone.) Yavash = ruby/crimson (glow `#e01430`); Xibar = vivid ice-blue disc +
       a darker **blue** rim (`#88bce6`) + a **silvery-white** glow (`#dbe9f5` — no atmosphere → ice-field
       shine). `MoonStyle` gained `glowStrength` (>1 = more intense) + `glowR` (halo radius × disc r);
       overlapping bodies paint in **`MOON_DEPTH` z-order** (furthest→closest: Sun, Yavash, Katamba, Xibar).
       Pill dots mirror the corrected hues. **B222:** all Moons gradient ids are per-instance via `useId()`
       (a `display:none` background tab is still mounted; `url(#id)` resolves to the first document match, so
       a second instance hijacked the first's fills — CLAUDE.md pitfall #95).
     - **Night-sky motion + polish (v0.17.0, Sekmeht).** The scene's tick dropped **30s → 2s** so bodies AND
       everything derived from the sun's position (shadows, rays, lake reflections) advance together in
       sub-pixel steps — a disc-only CSS glide was tried and REVERTED (it desynced the discs from the
       recomputed shadows/rays; the fix is ONE smoothly-advancing clock, not per-element transitions). The
       **star field** grew 9 → **70 deterministic stars**, each with a brightness + a `reveal` threshold so
       brighter stars show at dusk and fainter ones reveal toward **true midnight** (light-pollution
       clearing), driven by **`nightDepth = clamp01(-sunElev)`** which PEAKS at midnight (unlike `wNight`,
       which saturates past dusk); twinkle moved to `fill-opacity` so it composes with the per-star reveal.
       **Shooting stars**: 1 fixed → **6 scattered** (varied paths, staggered, still clear-night-only — clouds
       hide them). **FX draw order**: sky+stars (bg) → bodies → ground/landscape → day/night FX (shooting
       stars, fireflies, leaves) FOREGROUND → weather FX (clouds, precip) FRONTMOST.
     - **Moons feature backlog (numbered, Sekmeht 2026-07-21).** SHIPPED v0.17.0: **F67** stars+shooting,
       **F68** aurora/fireflies, **F69** sun-lit moons, **F70** seasonal horizon, plus the living landscape +
       moon-colour corrections above. PLANNED: **F64** moon
       utility layer (which moons are up + lore affinity + moonlight strength — the Moon Mage hook),
       **F65** conjunction detection — BUILT v0.18.2: pairs are measured in SCREEN distance scaled by
       the pair's own radii, not arc progress (progress is normalised across arcs of different lengths,
       and "together" means what the player can SEE; scaling by radii also keeps big Katamba and small
       Xibar comparable), highlighted with a quiet shared halo and named in the pill, with all three
       mutually close reported as one triple rather than three pairs —
       **F66** consolidated "next event" readout — ALREADY BUILT (see the status note above), **F71** iconified strip labels (☀🌙☁ vs the
       SKY/MOONS/WEATHER words), **F72** stale-as-atmosphere (the whole sky desaturates/dims when data is
       stale, blooms back on refresh — a scene-wide extension of the F-current amber ⟳ nudge), **F73**
       compact mode (a minimal horizon-band layout for small tabs). Priority order for the next pass:
       F64 + F65 (utility), then F72 — plus **F64a** (lunar phase) below, which slots in with F64.
     - **STATUS UPDATE (v0.18.2): F64a, F64 and F65 are BUILT; F66 was already built.** The deferral
       recorded below was lifted — Sekmeht asked to work the moonwatch findings in properly rather
       than carry them. Shipped: **F64a** lunar phase (the pure function + server-clock anchor +
       phased disc shapes), **F64** the moon utility layer (combined moonlight), **F65** conjunction
       detection. **F66 needed no work** — the consolidated next-event readout already exists in the
       header (`nextMoon`, the soonest moon transition) and the repeated per-body countdown chips it
       was meant to replace have been `defaultHidden` since v0.17.0; the backlog entry was stale, so
       it is marked done rather than re-implemented. Still PLANNED: **F71** iconified strip labels,
       **F72** stale-as-atmosphere, **F73** compact mode, and F64a's `observe` correction layer.
     - **F64a — LUNAR PHASE. BUILT in v0.18.2** (the deferral below was lifted the same day it was
       recorded — kept verbatim because the design reasoning still governs the code). **What actually
       shipped, and the decisions worth not re-litigating:** the phase math is a pure function of the
       DR client's constants in [experiences.ts](src/renderer/experiences.ts), locked by
       `tmp-moon-harness` against an independent transcription of the Ruby (116 assertions; it caught
       a real typo in the reference on its first run). Server time arrives via a new `ServerClockEvent`
       — the parser's `lastPromptTime` was private — emitted only on first sight and >2s drift, since
       a prompt fires every game turn. The disc shape is a **MASK, not a replacement disc**: the
       shadow is the complement of one lit path, so F69's lit gradient keeps painting underneath. A
       mirrored "shadow path" was tried in design and is WRONG — it degenerates to zero area at *new*,
       exactly when the shadow should be the whole disc. The phase group ROTATES to face the sun,
       reusing F69's existing light vector, because phase and sun-lighting are the same physical fact
       and would otherwise visibly disagree. Katamba is deliberately NOT special-cased: emitting no
       light, its soot palette already renders phase as a subtle occultation, which is lore-correct.
       Phase names live in the pill TOOLTIP (three "waning gibbous"-length strings would swamp the
       strip) and are marked **"(computed)"** — unlike the moonwatch-fed rise/set times, phase has no
       feed to correct against. **The `observe` correction layer (step 3) is still NOT built.**
     - **F64a — original spec. DEFERRED (Sekmeht, 2026-07-28) — superseded by the BUILT note above.** Spec'd
       from moonwatch 4.5.0 and folded into F64 rather than given a new number. **Nothing here is
       built, and none of it is part of v0.18.1** — it is written down so the research doesn't have to
       be redone, and Sekmeht will pick it up in a fresh version. The proposed build order was:
       **(1)** port the pure function + thread a server-time anchor, harness-tested;
       **(2)** render the phase shape via an SVG mask over F69's existing sun-lit shading;
       **(3)** add the passive `observe` correction layer.
       Steps 1+2 are the whole visual win and are self-contained; step 3 is accuracy insurance and can
       wait for a reported mismatch. Open questions left for that version: whether the phase NAME earns
       space in the header strip (leaning no — discs plus a tooltip, since three long names would swamp
       it) and how loudly to mark the value as computed-not-observed (leaning a quiet tooltip marker).
       **Why it's worth doing properly when it happens:** it is the rare Moons feature that needs
       neither Lich nor moonwatch, so a direct-SGE player — who today gets an empty scene telling them
       to run `;moonwatch window` — would get correctly-phased moons regardless (Principle #2).
       - **What it unlocks.** Today every moon renders as a full disc with F69's sun-lit shading. Phase
         lets us draw the REAL shape — crescent / quarter / gibbous / full — and it also settles F69's
         open lore caveat above (*"renders as lit/phased regardless of whether DR moons actually
         phase"*): they do. DR's own `observe <moon>` verb reports phase wording, and the DR client
         carries hard-coded sidereal periods per moon.
       - **It is a PURE FUNCTION of time — no Lich, no moonwatch, no stream, no IPC.** `Moons.phase`
         (moonwatch.lic ~933) depends only on a Unix timestamp plus constants taken from the DR
         CLIENT's own `DR_MOONS` — explicitly *not* moonwatch's calibrated calendar, and identical on
         every instance (Prime/Plat/Fallen/Test). Port to [experiences.ts](src/renderer/experiences.ts),
         ~15 lines:
         `SIDEREAL_ROIS = { katamba: 14847, xibar: 9983, yavash: 16171 }` (roisaen, 60s each);
         `PHASE_EPOCH_SKEW_ROIS = 80895` (the client's `DR_EPOCH_SKEW_SECONDS / 60`);
         `PHASE_DAYS_PER_YEAR = 400`; then
         `orbital = ((min % sid) * 360) / sid`,
         `doy = ((min + SKEW) / 360) % 400`,
         `angle = (orbital + (doy * 360) / 400) % 360`,
         `index = (angle * 8) / 360` (all integer division), against the 8 names in cycle order
         starting at `new`. **Verified numerically before spec'ing** (ported to JS, sampled a 400-day
         year): all 8 buckets are reachable for all three moons and each dwells ~28h, matching the
         script's "roughly a real day".
         **This is the Principle #2 headline — it works identically on a direct-SGE connection with no
         Lich at all**, which almost nothing else in this Experience does.
       - **MUST anchor to SERVER time, never `Date.now()`.** moonwatch feeds it `XMLData.server_time`.
         This is pitfall #87 / B192 exactly: a user whose PC clock is off would silently get the wrong
         phase, intermittently, surviving updates. The parser already tracks `lastPromptTime` from
         `<prompt time>` for RT/CT anchoring — reuse that anchor. A phase bucket lasts ~a day so small
         skew is harmless, but the cost of doing it right is one field.
       - **Ship it as a MODEL, with the provenance the sun already has.** The script states outright that
         phase is model-only — *there is no passive phase broadcast to self-correct against* — and only
         **4 of the 8** wordings are validated against `observe` (waxing crescent, waxing gibbous, full,
         waning crescent). Present it the way the sun distinguishes observed from computed; do not
         present a computed bucket as fact.
       - **`observe <moon>` is the free correction layer.** `MOON_PHASE_LINE_PATTERN` +
         `OBSERVED_PHASE_MAP` decode the game's own wording (*"The black moon Katamba is a growing
         crescent of light."*). Capture it PASSIVELY from main text when the player happens to observe,
         and let observed beat computed — the same ladder the sun anchors use. **NEVER auto-observe:**
         it carries roundtime and trains a skill, which is why moonwatch itself only does it under
         `;moonwatch log`.
       - **Deliberately NOT taken.** The new `t` (0..1 arc progress), sun and calendar data are
         **UserVars-only**, and UserVars reach disk on Lich's ~5-minute save cycle — fine for slow
         values, useless for minute-ticking timers, and reading them live would mean `;e` injection
         (pitfall #76). We already derive equivalent arc progress from the parsed timers, and we have
         sun anchors + the Firebase feed + the TIME command. Their OLS cycle constants also differ from
         our `MOON_UP_MINUTES`/`MOON_DOWN_MINUTES` by **under a minute** (katamba up 176.7 vs our 177) —
         free to adopt, not worth a pass alone.
       - **Compatibility + tester support.** The `moonWindow` stream is UNCHANGED (still the three
         `[K]+(12)` shorts), so `parseMoonLine` needs no work and the 4.5 upgrade cannot break us. BUT
         v4.2 re-anchored the moon epochs and requires **`;moonwatch reset` once per character after
         updating** — until a tester does that their timers drift, and ours drift with them. Check that
         FIRST on any "the moons look wrong" report from a 4.2+ user.
4. **Combat facet of X1 (the G1 fold, 2026-07-16):** G1 is no longer a second Experience — it ships as
   auto-revealing **combat LAYERS on the Living Tableau** (full decision in §32.1's G1 entry). Phase 1
   uses existing typed events only (readiness ring, CT ring, stance figure, condition border, hands,
   threat pips from `roomState.creatures` — rendered ON the Tableau's creature figures); Phase 2 adds
   the **`CombatParser`** (range/target/facing as new typed events — the `SceneParser`'s sibling,
   co-located in the same Experience, reused by X2/AI7). Corpus capture of real fight Raw-XML precedes
   the parser. The layers are `ExperienceDef.options` (one per instrument, the Moons §34.7 precedent),
   auto-revealing on live combat state; all off = pure social Tableau.
5. **Then the §32 catalog** lands here, one registry entry at a time (G2 paper-doll as the HUD's
   center figure or standalone, G4 radar, G6 buffs board, X-series scenes on X1's engine as their
   parsers come online — X6 Scene Composer is the natural follow-on, compositing X1's rendered
   scene into the shareable comic panel).

**The sun is COMPUTED, not observed (v0.18.4, B254).** It used to be derived
from whichever sunrise/sunset prose had been witnessed, assuming an even
180/180 day until both had been seen. Elanthian daylight is neither even nor
fixed — 120 rois at the winter solstice, 180 at the equinoxes, 240 at the
summer solstice — so the assumption ran minutes fast, and deriving the length
from a single observed gap is no better because the real values are
per-day-of-year. [elanthianSun.ts](src/shared/elanthianSun.ts) is a VERBATIM
port of moonwatch's `DRTime` model: both 400-entry empirical tables (rise and
set stored independently, since they sum to 360 on only 332 of 400 days) plus
the calendar epoch in [elanthianTime.ts](src/shared/elanthianTime.ts).
**Verified by evaluating moonwatch's own Ruby and diffing 52 timestamps across
10 fields — 2104 assertions.** Consequence worth protecting: the sun is now a
pure function of server time like lunar phase, so it needs neither Lich nor the
community feed nor a witnessed transition. Do not reintroduce an observation
dependency. The prose capture, Firebase fetch and lich.db3 synth that used to
feed it are now redundant and can be retired once the model has been watched
across a full day.



4. **Experience #3 — Spell Monitor (SHIPPED v0.19.5, Beta; Sekmeht 2026-09-05).** Everything
   currently on you as a grid of live countdowns, one cell per effect, sorted soonest-expiring
   first. Registry id **`spellmonitor`** — deliberately NOT `spells`: tab ids are namespaced
   `exp:<id>` so there is no technical collision with the `spells` PANEL, but Moons already taught
   us the human cost of a shared name (the `[e]` badge exists precisely because the Moons
   *experience* and moonwatch's Moons *stream* read identically in a tab strip), and a distinct id
   avoids repeating that. Dual-hosted for free — a registry entry is all the `+` menu, the shelf
   and the ⚙ popover need (§34.8 item 5: **no panel-system file was touched**).

   - **Why an Experience and not a panel view-toggle.** A "right-click the Active Spells panel →
     Classic / Advanced" toggle was proposed and examined against §34.2's rejected "Interactive
     Mode" model. Both prongs of that rejection *invert* here, which is why the Experience route
     was taken instead: (a) the rejection turned on the combat panel being **optional equipment**
     (Simu splits combat text between the `combat` stream and main, so many players skip the
     window) — but `spells` has no main duplicate and **no `STREAM_FALLBACK` entry**, so its panel
     is the only place that content ever appears; and (b) the rejection's deeper point was that the
     HUD reads parsed **state**, not stream text — for spells the opposite holds, since the active
     list exists *only* as text on `percWindow` (the `spell` event is the spell you are
     *preparing*, a different thing). The Experience route also keeps the mature panel system
     byte-identical, which the toggle would not have.

   - **The feed.** DR pushes `<clearStream id='percWindow'/>` then one line per effect;
     `percWindow` aliases to `spells` at the parser (streamAliases.ts). Because that stream has no
     fallback, its lines always route to their own buffer, and the clear is applied in GameWindow's
     batch commit — so **`streamLines.spells` is already an exact mirror of the current block**.
     No accumulator, and no assess-style batch-boundary guard, is needed.

   - **Parsing is TOLERANT (`parseSpellLine`, experiences.ts).** `<Name> (<N> roisaen)` — and DR
     writes the **singular `roisan` at 1**, so a plural-only pattern would silently drop every
     effect in its final minute. A non-numeric parenthetical (`Trabe Chalice (intact, fading)`,
     `(indefinite)`) becomes an **untimed effect carrying that note**, and a bare name is kept as
     one: never a dropped line, because the display must not hide something the game says is on
     you. 1 roisan = 1 real minute via `ROISAN_SECONDS` ([elanthianTime.ts](src/shared/elanthianTime.ts))
     — never a hardcoded 60_000.

   - **Expiries anchor on each LINE's own `timestamp` — its receipt time — not one `Date.now()`
     for the block.** This is *not* the pitfall-#87 / B192 clock-skew case: DR gives a **duration**,
     not a server absolute time, so a local anchor is correct and skew-free.
     **KNOWN LIMITATION, verified 2026-09-05:** this is NOT replay-correct, and an earlier draft of
     this section wrongly claimed it was. `mkLine` ([GameWindow.tsx](src/renderer/components/GameWindow.tsx))
     stamps `timestamp: Date.now()` and **ignores the `timestamp` the `StreamTextEvent` carries**, so
     a pitfall-#60 replay (decouple, re-home, import remount) re-dates the block to the replay moment
     and inflates every remaining time by however stale that block was. The error is bounded and
     self-correcting: the delta gate compares reported against predicted, an inflated anchor makes
     predicted exceed reported, so the state re-anchors as soon as the gap passes a roisan — i.e. on
     DR's next repaint. Making it genuinely replay-correct means teaching `mkLine` to prefer
     `evt.timestamp`, which would also change every stream's per-line timestamp DISPLAY and the
     session-log parity story — a shared-path change deliberately not taken for this feature.

   - **The DELTA GATE is what keeps it cheap (`deriveSpellState`).** DR repaints the whole block on
     its own cadence, and a repaint that merely confirms 29 → 28 tells us nothing our own clock
     does not already know. Committing a new object for it would mint a fresh prop identity on the
     shared Experience props bag — re-rendering **every** mounted Experience (pitfall #82c) — and
     re-anchor every countdown, which reads as jitter. So state is committed only on a real change:
     the effect set changed, a note changed, a max grew, or a timer diverged from prediction by
     more than a roisan (a recast, or genuine drift). The resolver is **PURE** and the refs are
     owned by ONE effect (pitfall #70 — the impure memo that mutated refs mid-render double-counted
     under StrictMode).

   - **The bar's denominator is learned, because DR never states a full duration.** `spellMaxRef`
     remembers the highest roisaen ever seen per effect, so a recast makes the bar visibly refill
     rather than rescale under the user. It lives in a **GameWindow ref, not the component** — the
     component unmounts on every tab switch and would otherwise forget instantly; the ref survives
     the Experience being closed, reopened, or moved between a window and a tab.

   - **An empty block clears the display, but on a 400ms DEFERRAL.** An empty buffer means the game
     cleared the block with nothing to replace it (everything dropped), and that must clear the
     grid — each effect's own timer could otherwise leave it on screen for another 29 minutes. It
     is deferred because a clear and its following lines can straddle a flush boundary, and
     committing the gap would blink the whole grid empty for a frame. This is the assess
     "guard the snapshot on non-empty" problem, solved with a bounded wait rather than a guard,
     because here the empty reading is genuinely meaningful. Max ceilings are KEPT across it.

   - **Two HONESTY rules in the display.** DR reports **whole roisaen**, so the cell shows whole
     minutes and never a seconds countdown — `29:00` would claim a precision the game never gave
     us; the final minute reads `<1m`, and the *bar* may still move smoothly because a proportion
     is not a claim about precision. And an effect we could not parse is still **shown**, carrying
     whatever the game put in its parentheses.

   - **The TRAFFIC LIGHT — green full → yellow midway → red near the end (Sekmeht, 2026-09-05)** —
     is `spellBand()` in experiences.ts, and it takes the **MORE URGENT of a PROPORTIONAL and an
     ABSOLUTE reading**. That is not belt-and-braces; it is the only correct answer here, because
     the proportion's denominator is **learned**. On the first block after connecting, every effect
     has `max === its current reading`, i.e. a proportion of exactly 1.0 — so a purely proportional
     band paints the **whole grid green, including a buff with two minutes left**, at precisely the
     moment the display most needs to be right (that is the normal startup state, not an edge case).
     The absolute reading (≤1 roisan crit, ≤5 mid) is a floor that a guessed denominator cannot
     fool; the proportion (≤0.2 crit, ≤0.5 mid) supplies the gradient across a long spell's life,
     so 10% of a four-hour buff reads red even with 24 minutes on the clock. An effect is shown as
     calmer than it is only when BOTH readings agree it is calm. Harness-locked, trap cases included.
   - **The colours are three dedicated `--spell-band-{ok,mid,crit}` vars — NOT the vitals health
     ramp.** Reusing `--vital-health-*` was the first implementation and it was **wrong**, in a way
     worth recording because it is the pitfall #34/#75 family at its sharpest: **the cascade must
     follow MEANING, not hue.** That ramp means "this theme's health bar", and two shipped themes
     prove the difference — **`classic`** pulls its vitals verbatim from Genie's `presets.cfg`,
     where health is **RED AT FULL** (`--vital-health-ok-end: #dd0000`), so a full spell would have
     screamed "expiring" and the whole light run red → orange-red → dark red; and **`terminal`** is
     monochrome, so its mid stop is green and the amber band vanished entirely. A var can be the
     right *colour* and the wrong *concept*.
     The replacements are defined ONCE in `darkBase` in the pitfall-#63 `--syntax-*` shape — a
     fixed hue mixed 75% toward `var(--text-primary)`, which resolves in each theme's own context
     at use time, so every theme keeps the MEANING while its CONTRAST self-corrects (darkened on
     light backgrounds, brightened on dark) with no per-theme work and no way for a theme to
     silently invert the signal. The hues are **mid-tone by necessity** (UX #9's SimuCoin lesson):
     a true yellow measures ~1.5:1 on a white theme and simply disappears, so the middle band is an
     **amber**. There is no yellow that survives both ends.
   - **Colour-blind is explicit, and the vitals' own answer does not transfer.** `COLORBLIND_VARS`
     carries `--spell-band-*` entries: deuteranopia moves the problem stop (green) to teal, as the
     health bar does. Protanopia cannot copy the health bar, which turns crit **amber** — exactly
     our MID band, so the two most urgent states would collide; it instead moves green→teal and
     LIGHTENS red, so lightness carries the separation alongside hue for a viewer who reads red as
     very dark. **This is design judgement, not verified with a colour-blind tester** (Principle
     #10) — but it is safe because colour is the secondary cue: the bar's LENGTH and the printed
     time carry the same information (§34.7).
   - **The colour lives in the BAR and BORDER, not the numerals:** those are large areas needing
     3:1, whereas band-coloured text must clear 4.5:1 on every theme — and the amber stop cannot do
     that on white without being darkened until it stops reading as amber. `crit` is the one
     exception (red clears ~6:1 on Classic Light, and the last minute has earned the emphasis).
   - **The percWindow SHAPE CATALOGUE is mirrored from LICH'S OWN PARSER**
     (`lib/common/xmlparser.rb`, the `@dr_active_spell_tracking` branch), whose comments enumerate
     the real lines verbatim. A first version written from ONE captured block mishandled four of
     them, which is the argument for mirroring a verified parser rather than inventing one:
     **`anlaen`** is a real unit (1 anlas = 30 roisaen — `Stellar Collector (0%, 4 anlaen)` lost its
     countdown entirely); **`Fading`** is the OPPOSITE of untimed (Lich reads duration 0 — it means
     lapsing right now, and rendering it as a quiet note showed the most urgent thing on screen as
     background information); **`Indefinite` / `OM`** are effectively permanent; and a stated
     **percentage** (`Osrel Meraud (94%)`) is a proportion, not a time. `SpellKind` therefore has
     five members — timed / fading / permanent / percent / unknown — and they must NOT be collapsed
     back into one "untimed" bucket: fading is the most urgent state and permanent the calmest. A
     duration OUTRANKS a percentage in a compound reading (the percentage is a charge level; the
     duration is when the thing ends). A stated percentage beats the LEARNED ceiling for both bar
     and band, being a true proportion where `max` is only "the most we have happened to see".
     Consequences threaded through: `spellSortRank` (lapsing → counting down → no countdown →
     permanent), the `untimed` layer which hides the quiet kinds but NEVER fading, and the delta
     gate, which treats a KIND change as always meaningful. A missing/NaN percentage resolves to NO
     band rather than the calmest one — a reading we don't have must never render as "this is fine".
   - **SKILL BADGES + ABBREVIATIONS (Sekmeht, 2026-09-05)** come from Lich's
     `scripts/data/base-spells.yaml`, snapshotted at build time by
     [tools/gen-spell-data.mjs](tools/gen-spell-data.mjs) into a COMMITTED
     [spellData.ts](src/renderer/spellData.ts) (430 entries, ~29KB). Committed rather than read from
     a Lich install because the Spell Monitor works without Lich (Principle #2) — reading it live
     would mean no badges at all on a direct connection. Re-run the generator and commit the diff
     when Lich publishes new spells; a name with no entry simply gets no badge, so staleness
     degrades silently and can never produce a WRONG badge.
     **The data facts that make this work:** percWindow names match the YAML keys VERBATIM (verified
     8/8 against a real capture, apostrophes and roman numerals included); the three badge-able
     sections (`spell_data` 378, `barb_abilities` 37, `battle_cries` 14) have ZERO name collisions,
     so one flat map is safe; and every one of the twelve skill/type values has a distinct first
     letter — A U T D W C X (magic) and F B M R S (abilities) — so single-letter badges need no
     disambiguation. Metamagic is **X, not M**, because M is already Meditation: no character has
     both, but a letter that is unambiguous only by luck is the pitfall #55 trap.
     Two gotchas in the source data: 33 entries are `metamagic: true` with NO `skill` (a real
     category, not malformed), and **`See the Wind` has `Skill:` with a capital S — a typo in Lich's
     own file** that a case-exact read drops silently. The generator tolerates both and REPORTS what
     it skipped rather than discarding quietly; that report is what surfaced the typo.
     **Known gap: Thief Khri are absent from base-spells.yaml entirely** yet DO appear in percWindow,
     so a Thief gets no badges.
     Badge colours are twelve `--spell-badge-*` vars on the same self-correcting mix as the bands,
     **all exposed in the Theme Editor's HUD tab** so they are genuinely user-editable rather than
     only themeable. The chip is deliberately a quiet low-alpha tint: it IDENTIFIES while the
     traffic light ALARMS, and two loud colour systems in one small cell would fight.
   - **PROFILED (2026-09-06) — don't re-investigate; one real find, everything else free.** The
     numbers, measured by bundling the real modules (never a reimplementation), at a real capture's
     8 effects and a heavily-buffed 25: **the 1 Hz clock's whole derivation chain costs 0.24–0.94 µs
     per tick** (liveSpellEffects + filter + sort + groupSpells + per-cell band/label/note/bar/title)
     — 0.0001% of a core, i.e. free; and **the always-on cost, paid whether or not the window is
     open, is 4.4 µs per repaint at 8 effects and 20.5 µs at 25** — even assuming DR repaints on
     every prompt at ~3 commands/sec, that is **0.006% of a core**. Two structural properties
     matter more than the numbers: **there is ZERO per-line cost** (the derive is an effect on
     `streamLines.spells`, not a branch in the stream-text loop), and **a background TAB is
     unmounted** (`PanelFrame` renders only the active tab), so its clock does not run. A background
     CHARACTER's floating window does stay mounted (pitfall #24) and does tick — deliberately left
     alone, since gating it on `isActive` would buy an unmeasurable amount and cost a stale label
     for up to a second on return, the same trade DESIGN §45.7 declined for the other Experiences.
     Worth knowing: the delta gate does **not** save parse work (a gated repaint measures slightly
     SLOWER than a cold one — it parses and then compares); its entire value is avoiding the
     setState and the re-render cascade, which is what the design claims.
   - **THE ONE REAL FIND: the duration bar animates a TRANSFORM, never `width`.** It shipped as
     `transition: width 1s linear`, and because the bar drains on every tick it is in a CONTINUOUS
     transition the whole time the window is open — so a `width` transition invalidated layout on
     every animation frame, for every visible bar, forever (25 buffs × 60fps × each open window ×
     each character). `transform: scaleX()` with `transform-origin: left` is compositor-only: no
     layout, no paint. Same family as pitfall #126 — continuous main-thread work nobody asked for.
     The fill therefore carries **no border-radius of its own** (scaling would squash it); the
     track's `overflow: hidden` rounds the left end, and a square leading edge is correct for a
     progress bar anyway. The other two animations were audited and are fine: the cell's
     background/border transition is paint-only and fires only when a band actually changes, and
     the expiry pulse animates `border-color` on the 0–2 cells in their final minute.
   - **ENDED EFFECTS ARE KEPT, GREYED (v0.19.6, Sekmeht) — the ⚙ `expired` layer, ON by default.**
     A spent effect stays on screen labelled "ended" instead of vanishing. The ask was precise: the
     point is not to mark THAT something ended, it is to show **what** ended so it can be recast.
     **THE SIGNAL IS ABSENCE FROM THE NEXT percWindow BLOCK — not our own countdown** (Sekmeht's
     correction, and it inverted the first implementation). Our anchor FLOORS DR's whole roisaen, so
     the clock reaches zero up to a minute EARLY; treating that as "ended" both lied and flickered,
     since the next repaint re-anchors a spell that is still up. Worse, the first build DELETED the
     cell at the exact moment the game finally supplied the truth. `deriveSpellState` now diffs the
     new block against the previous one: **anything the previous block listed that this one does not
     has ended, and the game just said so.** That record lives in `SpellState.ended` (a `kind:
     'ended'` copy carrying `endedAt`), carries forward across later blocks, is cleared by a RECAST
     (the name reappears, so it must not sit in both lists), and ages out after `SPELL_ENDED_TTL_MS`
     — **one roisan** (Sekmeht), the game's own unit and the right scale for "you just lost this,
     recast it"; derived from `ROISAN_SECONDS` rather than written as a bare `60_000`, so it stays
     tied to the unit it means — bounding the list with no timer anywhere. Note the ageing-out is
     itself a state change and correctly commits, so the greyed cell clears whether or not a further
     block arrives (the render pass filters on the same constant). A departure is **always** a
     meaningful change, so
     the delta gate can never swallow it.
     **The converse matters as much:** a timed effect whose anchor has run past is NO LONGER
     dropped. The game listing it is the evidence it is live; only the game dropping it is evidence
     it is not, and neither is ours to invent.
     Three couplings keep the display coherent: `spellBand` returns **`none`** for `ended` (a red
     cell would fight the grey — the two must never both fire), `spellSortRank` returns **5**, below
     even the permanents (a reminder is not something counting down), and the CSS is deliberately
     distinct from `--untimed`, which is quiet-but-LIVE: a spent cell is **desaturated as well as
     dimmed** so its skill badge greys too, plus a dashed border — UX #9's "one artwork in two
     treatments", the same cell drained of colour rather than a second design.
   - **ENDING IS TWO STAGES AND BOTH ARE SHOWN (v0.19.6, Sekmeht):** *"if the timer expires, it's
     important to see it's expired, then have the game show that it's ended by not showing it
     anymore in percWindow — that shows it's actually not in effect anymore."* Stage one previously
     had no appearance of its own: a countdown that had run out rendered "<1m", indistinguishable
     from one with fifty seconds left, so the one moment you were actually watching for was the one
     moment the window would not name.

     | | STAGE ONE — "expired" | STAGE TWO — "ended" |
     |---|---|---|
     | **What it means** | the time the game gave us has elapsed | the game has stopped listing it |
     | **Source** | our countdown vs `expiresAt` | absence from the next `percWindow` block |
     | **Authoritative?** | **no** — reversible | **yes** — settled |
     | **Predicate** | `spellExpired(e, now)` (timed only) | `e.kind === 'ended'` |
     | **Look** | fully lit, red, inset ring, heavier label | greyed, desaturated, dashed border |
     | **⚙ layer** | none — nothing is added or removed | `expired` ("Ended effects"), on by default |

     **Why they cannot be collapsed** (the mistake the first v0.19.6 build made in the other
     direction): DR FLOORS its roisaen, so our clock reaches zero with up to 59 seconds still to
     run, and a repaint may legitimately hand an "expired" cell more time and send it straight back
     to counting down. Stage one is the moment to ACT; stage two is the moment it is SETTLED. The
     cell's tooltip states which one you are looking at, because the two are one word apart on
     screen (UX #8 — a label that names a state without saying what it means is half-built).

     Three implementation notes worth keeping. **(a)** `.sm-cell--expired` is applied INDEPENDENTLY
     of the `urgency` layer: an expiry is a STATE, not a colour band, so turning the traffic light
     off must not hide it. The ring is therefore neutral (`--experience-scene-text`) by default and
     takes the band's red only on a cell that is already crit, via the two-class selector
     `.sm-cell--crit.sm-cell--expired` — decided by SPECIFICITY rather than source order (pitfall
     #111). **(b)** It is drawn as a `box-shadow`, never `border-color`, because the final-minute
     pulse ANIMATES the border and an animation always beats a normal declaration — a border rule
     would have silently applied only when the pulse layer happened to be off. **(c)** `barFraction`
     returns **0** past the anchor, ahead of the "no ceiling learned yet ⇒ show it full" fallback,
     so a `(0 roisaen)` reading (which learns a zero ceiling) can no longer paint a full bar beside
     the word "expired".
   - **A SPENT CELL COUNTS DOWN TO ITS OWN REMOVAL (v0.19.6, Sekmeht).** The greyed cell prints its
     remaining grace beside the word (`ended 45s`, `spellEndedCountdownLabel`) and its BAR drains
     that roisan instead of sitting empty (`barFraction` gained an `ended` branch). **Seconds are
     correct here even though every other time in this window is whole minutes** — the minutes rule
     exists because DR reports whole roisaen, so a ticking `28:04` would claim precision the GAME
     never gave us, whereas this grace is `endedAt` (our stamp) against `SPELL_ENDED_TTL_MS` (our
     constant). We know it to the millisecond. Do NOT "align" it to the minutes rule.
     Two design notes: the bar is what disambiguates the number (`45s` beside "ended" reads as
     easily as *elapsed since*; a shrinking bar is unmistakably *remaining*), and the countdown is
     its own element rather than folded into the label — the WORD stays the primary fact, and
     `spellRemainingLabel` keeps returning ONE fact, which is what keeps it harnessable.
     `.sm-name` gained `flex: 1 1 auto` in the same change: `.sm-cell-top` is `space-between`, so a
     third child would otherwise have split the free space into two gaps and floated the time chip
     into the middle of the cell.
   - **FEED STATUS — "updated 3s ago · every ~6s" (v0.19.6, Sekmeht; the ⚙ `updated` layer, ON by
     default).** Modelled on the Lich Scripts footer, answering the question a still grid otherwise
     raises: *is this feed alive, or has it hung?*

     **It lives INSIDE the header bar and follows that layer** (Sekmeht's placement call — it
     shipped for an afternoon as a bottom strip of its own). Two reasons it belongs there: it is
     metadata ABOUT the window, so it sits with the window's identity rather than as a second
     chrome band; and it then costs no row, which matters for a surface whose whole point is that
     it shrinks to a strip (B318 above). `.sm-head-feed` takes `margin-left: auto` so it groups
     with the count at the right, and `min-width: 0` + ellipsis so it TRUNCATES in a narrow window
     rather than shoving the count off the end — the title identifies the window and must never be
     the thing squeezed. The count keeps its own `margin-left: auto` for when the feed is absent,
     with `.sm-head-feed ~ .sm-head-count { margin-left: 0 }` handing the job to whichever comes
     first; setting it on BOTH would split the free space and strand the feed mid-header.

     **It reports the ARRIVAL, not the last change, and that distinction IS the feature.**
     `SpellState.reportedAt` only advances when the delta gate commits, so it can sit unchanged for
     many minutes while DR repaints constantly — a strip built on it would say "30m ago" about a
     perfectly live feed. `SpellPulse` (experiences.ts) records every non-empty block, gate or no
     gate, from the top of GameWindow's derive effect.

     **It rides a REF (`spellsPulse`), never a prop VALUE.** Every Experience receives the same
     props, so a timestamp changing on every repaint would re-render Moons and the Tableau too
     (pitfall #82c) — undoing precisely what the delta gate buys. A ref object's identity never
     changes, so it breaks no memo and only the one readout pays. This is the pitfall-#105 split
     (volatile tracking data must not share an identity with render data) applied across a prop
     boundary. The cost: a ref write triggers no render, so **the reader must own a clock**, and
     reading `.current` during render is acceptable here only because it is display-only (nothing
     derives state, no ref is mutated) and the component re-renders every second anyway.

     **The cadence is MEASURED, never claimed.** Lich Scripts can say "polls every 5s" because it
     owns the poll; DR's repaint cadence is push-driven and unmeasured (the open question below),
     so the strip reports the MEDIAN of the last `SPELL_PULSE_SAMPLES` (8) gaps and says nothing
     until it has `SPELL_PULSE_MIN_SAMPLES` (3) — one gap is not a rate, and a wrong "every ~2s" is
     worse than silence (Principle #10). **Median, not mean:** one quiet stretch drags a mean to
     "every ~155s" about a feed pulsing every six seconds (harness-pinned). The window is bounded
     so a cadence CHANGE is followed within a few pulses rather than averaged over a session.
     The pulse record RESETS on a reconnect-in-place — cadence is a property of the connection, and
     the gap spanning an outage is not a sample.

     **THE CLOCK RUNS CONTINUOUSLY while the readout is shown**, because "3s ago" has no deadline to
     bid — it changes every second forever. That is the strip's cost and the reason it is a ⚙ layer
     you can switch off; it is bounded by MOUNT (a background tab unmounts the component), and in
     practice changes little, since the clock already ran whenever any timed effect was up.

     **`formatAgo` is SHARED with the Lich Scripts footer** ([utils/formatAgo.ts](src/renderer/utils/formatAgo.ts))
     rather than reimplemented — the phrasing is user-visible and two copies drift (pitfall #127).
     It takes `now` as a parameter so a caller with its own clock formats against the instant it
     rendered rather than a second `Date.now()` that can straddle a boundary.
   - **AN EXPERIENCE MAY DECLARE ITS OWN RESIZE FLOOR — `ExperienceDef.minSize` (B318, v0.19.6).**
     A floating Experience is `kind: 'panel'`, so it inherits `MIN_WIN_PX` (180×110), a floor sized
     for a panel of TEXT. The Spell Monitor's natural one-row height is ~84px at the default font,
     so the floor bound first and the window read as refusing to shrink. The same failure already
     had a precedent one file away — the chrome bars got per-kind floors (`minSizeFor`) because the
     panel floor made them "unshrinkable vertically" — and a grid of short cells is the same shape
     of surface ("a strip across the top of the window" was the original conception).
     `ExperienceLayer` passes `def.minSize` to `FloatingWindow`, which prefers it over
     `minSizeFor(win.kind)`; the Spell Monitor declares `{ w: 180, h: 48 }`.
     **Declared PER EXPERIENCE rather than lowering the global floor**, because "how short can this
     usefully be?" is a property of the SCENE — a sky or a tableau needs height to mean anything,
     and the default floor stays a fair guard against dragging one into a sliver. Only declare one
     for a scene that genuinely wants to be thin. Width is deliberately left at the shared floor:
     the grid's `minmax(11em, 1fr)` columns make a narrower window useless. The pre-existing
     `Math.min(floor, current)` clamp still applies, so a window already below its floor is never
     snapped back up.
   - **FEED LIVENESS IS RECORDED FOR EVERY ARRIVAL — ahead of the delta gate AND of the empty-block
     branch.** Two traps, both found in the v0.19.6 bug check and both worth keeping:
     **(a)** Recording inside the non-empty branch froze the strip in exactly the case it exists
     for. The empty branch early-returns once `effects` is already empty, so when every spell
     dropped and DR kept repainting an empty list the readout sat still beside a live feed. The
     discriminator is `undefined` vs `[]`: the first means the stream has never been touched
     (nothing has arrived), the second means DR sent a clear, which HAS.
     **(b)** DR sends a clear and then its lines, and main's flush coalescing is LEADING-EDGE on a
     16ms window (pitfall #82d) — so when the client is idle the clear flushes immediately and the
     lines follow in the next batch: ONE repaint, TWO arrivals. Counting that ~16ms as a cadence
     sample would drag the median toward zero precisely when someone is sitting still watching the
     strip. `recordSpellPulse` advances the timestamp but discards any gap below
     `SPELL_PULSE_COALESCE_MS` (250ms) — above the coalescing window, far below any plausible DR
     cadence, since repaints follow game turns rather than milliseconds.
   - **THE 1 Hz CLOCK BIDS ON "THE NEXT MOMENT THE DISPLAY CHANGES", NOT ON EXPIRIES** (v0.19.6 bug
     check). Two sources feed `soonest`: a timed effect reaching its anchor (the cell flips to
     "expired"), and — while the `expired` layer is on — a spent cell reaching the end of its
     one-roisan grace (it leaves). Bidding only on the first let the clock retire while a greyed
     cell was still on screen; with nothing ticking `now` froze, and since the grace is measured
     against `now`, the cell sat there past its TTL until DR happened to repaint, which on a
     repaint-on-change feed can be many minutes. The FUTURE filter (`> now`) is equally
     load-bearing and predates it: the interval self-clears at `soonest`, so a moment that stayed
     in the value would leave the dep unchanged, no new interval armed, and every other countdown
     frozen behind it.
   - **THE DELTA BASELINE RESETS ON A RECONNECT-IN-PLACE** (v0.19.6 bug check, a regression this
     version introduced). "Ended" is a DIFF against the previous block, and a reconnect swaps the
     sessionId **without remounting** (pitfall #69) — so the first block of the new connection read
     every effect that had lapsed while you were disconnected as having ended *this instant*: a
     wall of greyed "recast me" cells stamped with the wrong time, which is precisely the false
     certainty the two-stage model exists to avoid. `spellPrevRef` is nulled in the same
     sessionId-change effect that already resets the sky-sync flags. `spellMaxRef` is deliberately
     KEPT — the learned bar ceilings are facts about the SPELL, not about the connection.
   - **ONE LINE PER CELL, ALWAYS (v0.19.7, B411).** The note row below is gone.
     - **The problem:** a grid row takes the height of its tallest cell, so a single cell carrying a
       note (Sekmeht's screenshot: a spent cell's leftover "Fading") stretched every cell beside it.
     - **The slot:** `spellSlotText` puts the note in the time slot when it says more than the label.
       That covers fading, percent and unknown readings, where the note is the fuller statement of
       the same reading.
     - **The aside:** a timed effect keeps its ticking minutes, with a stated charge level beside
       them (`spellSlotAside`).
     - **Spent cells:** a spent cell keeps "ended" and its clear-out countdown. Its stale reading
       moves to the tooltip as "last reported as …".
     - **Fixed height:** the slot is capped with an ellipsis, and a barless cell reserves the bar's
       space (`.sm-bar--none`), so every cell is the same height whatever it holds.
     - **Kept separate on purpose:** DR's own "fading" and our `<1m` countdown still read
       differently. One is the game's word and the other is our clock (the two-stage rule).
   - **(v0.19.6, now feeding the slot) THE NOTE ADDS WHAT THE LABEL DOES NOT SAY** — `spellNoteText`. A first cut rendered the
     parenthetical unconditionally, so a `fading` reading printed the word TWICE (label "fading",
     note "Fading") and paid a whole extra row for it, which is what made those cells look
     oversized beside their neighbours (Sekmeht's `Tenebrous Sense (Fading)` screenshot). The test
     is a **case-insensitive comparison against the label, NOT a switch on `kind`**, and that
     distinction is load-bearing: a bare `(Fading)` or `(94%)` collapses to one row, while a
     COMPOUND reading survives because it genuinely differs — `0%, fading` under a `0%` label adds
     the word *fading*, and a `timed` effect's `0%, 4 anlaen` adds a charge level its `120m` label
     never carried. Permanents are excluded outright; their ∞ says it and the word is in the
     tooltip. **`spellRemainingLabel` and `spellNoteText` live in experiences.ts rather than the
     component precisely so this is harnessable** — neither reads correctly in isolation and it was
     their PAIRING that failed, so the cases assert them together.
   - **GROUP BY SKILL (Sekmeht, 2026-09-06)** — `groupSpells()` partitions the grid under a
     labelled hairline heading per magic skill / ability type. The motivating case is a Barbarian,
     who sees exactly four blocks (Form 15 · Berserk 13 · Roar 11 · Meditation 9); casters see 5–7,
     Warrior Mage the most at 7 (the only guild with Cantrips). Three decisions worth keeping:
     **(a) it COMPOSES with `sortByTime` rather than competing.** `groupSpells` preserves the
     caller's within-group order, so sorting happens first and each group is internally sorted —
     which is why two booleans still suffice and no enum control was needed. The option model only
     breaks if a THIRD ordering (alphabetical, say) is ever wanted, since that genuinely conflicts
     with soonest-first; that is the natural trigger for the typed-control registry extension.
     **(b) The group ORDER is FIXED** (`SPELL_GROUP_ORDER`), not derived from what is currently up:
     a list that re-orders itself as effects come and go would reshuffle the grid mid-read — the
     same churn that made `sortByTime` opt-in. A label not in that list sorts LAST alphabetically,
     so a category Lich adds later appears predictably at the end rather than silently first.
     **(c) The heading is a labelled hairline divider (UX #5), NOT a padded header** — the window is
     often a short strip and a Warrior Mage would spend seven rows on chrome, so each heading costs
     about one text-height row (`grid-column: 1 / -1` to span the grid, `line-height: 1` per
     pitfall #77). Unknown names bucket into **`Other`**, last — which means grouping is inert for a
     **Thief**, whose Khri are absent from Lich's data entirely and would all land there.
     `groupSpells` takes the lookup as a PARAMETER rather than importing `spellData`, keeping it
     pure, harnessable, and free of a dependency `experiences.ts` does not otherwise need.
   - **⚙ layers, one per visual layer (eleven):** `bars`, `urgency` (the traffic light), `untimed`
     (the quiet no-countdown kinds — never fading), `pulse`, `badges` (the skill letter chips),
     `header` (the "Spell Monitor" title strip, which read "Active Spells" before B392; off reclaims a row in a narrow tab), plus the two v0.19.6
     additions — `expired` (keep a spent effect on screen, greyed, counting down to its own
     removal) and `updated` (the feed-status strip) — and **three that are `defaultHidden` /
     opt-in (Sekmeht, 2026-09-06)**: `abbrev` (ECRY rather than Eillie's Cry),
     `sortByTime`, and `groupBySkill`. Leaving `sortByTime` off makes DR's OWN order the default — the game's ordering
     is stable as timers tick, where ours re-arranges under the reader; the urgency colour still
     marks a lapsing effect, it just isn't moved. Note the consequence: `spellSortRank`'s
     fading-first priority applies only when that layer is ON, which the option text states.
   - **⚙ PREFS PERSIST per character, and no new plumbing was needed.** `ExperienceInstance.hidden`
     rides `scopedKey('experiences')` → the dynamic `state:` map → YAML, and `experiences` is
     already a `TRANSFER_CATEGORIES` id, so prefs move with a Profile Transfer too. Two details
     make it safe and are worth not undoing: `setExperienceOption` FIND-OR-CREATES a `open: false`
     instance so a tab-only user still gets a prefs record (the shelf and layer filter on `open`,
     so it stays invisible), and it seeds `defaultHiddenMap(def)` on creation so a default-off layer
     persists explicitly rather than living only in the reader's head. **`loadExperiences` filters
     with a type GUARD rather than reconstructing each record** — which is precisely why `hidden`
     survives the round trip; rewriting it as a rebuild would silently destroy any field it forgot
     to copy (pitfall #121, which has bitten three times). Harness-locked both ways: the round trip
     and the default resolution. Under epilepsy-safe the pulse is dropped but the **colour stays** —
     motion is decoration, colour is signal (UX #9b), so the accessible path keeps the information
     the effect was carrying.

   - **Bounded by construction** (pitfall #109): the effect count is user data, so the grid scrolls
     against a `max-height` rather than growing without limit for a heavily-buffed caster. Numbers
     are `tabular-nums` so a ticking value can never reflow its cell (pitfall #103), and the root
     anchors the em chain to `--panel-font-size`/`--game-font-size` so both the Settings font and
     the per-panel A−/A+ reach it (pitfall #58a). The `.sm-` class prefix was checked unique before
     use (pitfall #55c).

   - **No Lich required** — `percWindow` is a game stream, so this is identical direct-SGE
     (Principle #2). **No slash command, by design** (§34.6): the `+` menu, the shelf and the ⚙ are
     the surface, exactly as for Moons and the Tableau — recorded here per Principle #11 rather
     than skipped silently.

   - **NOT DONE / open:** the DR repaint **cadence** is unmeasured — the delta gate is correct
     either way, but whether it is a nicety or load-bearing needs a Debug → Raw XML capture over a
     minute of ordinary play. No ⟳ refresh button: unlike Moons' TIME/WEATHER there is no *verified*
     command that forces a `percWindow` repaint, and one was not guessed (Principle #10). The
     parsed state sits on `ExperienceProps`, so a future Tableau strip, an Overview card field, or
     `$activespells` trigger variables are cheap follow-ons.
---

## 35. SceneParser — Scene-Event Capturer Registry (designed 2026-06-12; Phase 1 built)

**Status:** Architecture designed (Sekmeht + survey, 2026-06-12). **Phase 1 BUILT same day**:
`sceneCapturers.ts` (the registry — speech drafts present but `unverified` = inert),
`SceneParser.ts` (cast + cast-diff transformer, wired per-session in main.ts), shared extraction in
`sceneExtract.ts` (Lich-derived), typed events `scene-cast`/`scene-arrive`/`scene-depart`/
`scene-speech` in shared/types.ts, `scene-cast` replay-snapshotted, the Tableau consuming the typed
cast as a pure view. Verified by a real-bundle harness (10 scenarios incl. transition suppression;
it caught the dead-marker-outside-the-bold-span gap). **Phase 2 (speech) ALSO BUILT 2026-06-12:**
the say/ask/exclaim, yell, whisper, and thought capturers were verified against a REAL captured DR
session already on disk — `Frostbite-Dev/frostbite/support/mock.xml` (the B165 corpus) — and flipped
to `verified`; the harness replays 21 verbatim corpus lines (all pass). Key corpus facts baked into
the capturers: speaker+verb ride INSIDE `<preset id='speech'>` with the quote outside; **yells are
`<b>`-wrapped, not preset**; whispers collapse into the `conversation` stream (STREAM_ID_ALIASES);
thoughts have THREE shapes (gweth relay / ESP `[Name]` bracket incl. `"<to you>"` / in-your-head —
which rides the TALK stream); DR double-emits every utterance to main (pitfall #49 — deduped by
home-stream gating); and DR REUSES the speech/thought presets for stat-table alignment, so the verb
shape — never the preset — is the signal. The Tableau renders channel-styled bubbles (+ whisper
tags, yell emphasis), thought WISPS at the scene edge (never a body, §32.2), and focus-the-speaker
dimming; bubbles are replay-gated (pitfall #60a) and expire after ~14s. **First LIVE-corpus fixes
(Sekmeht's 25-player room, same day — corpus/2026-06-12-says-accents-crowd.xml):** accent/manner
says (`says in a melodic accent,`) and adverb-before-verb says (`softly says,` / `quietly says,`)
joined the verified speech-say shape, and **promote-on-speak shipped** — recent speakers (120s
window, longer than the bubble TTL so seats don't churn) seat ahead of the crowd cap, fixing the
"bubbles stopped working" symptom (the talkers were in the '+N others' overflow). **Movement
choreography ALSO landed from the same live-corpus session:** the `movement-hint` capturer (four
verified shapes — see the §35.3 row; arrivals CAN carry an origin after all, e.g. `wades into view
coming from the west`, correcting the earlier "no direction on arrivals" read) feeds a hint ring in
SceneParser that garnishes the authoritative cast-diff events with direction/`reason:'logoff'`
(hints are never authoritative — an over-matched prose line expires unused, which is what makes the
open-verb/trailing-clause regexes safe). The Tableau renders directional ENTRANCES (slide in from
the origin edge), departure GHOSTS (the figure lingers ~1.6s walking out toward its exit direction)
and logoff DISSOLVES — all replay-gated, all skipped under epilepsy-safe (ghosts are skipped at
RENDER, not by CSS, so the animation kill-switch can't strand a frozen duplicate). **The stealth
batch (same live session) verified five more shapes:** noticed hiding is a CAST STATUS, not a
departure (`Also here: Agan who is hiding.` → posture `hiding`, shadowed figure); unnoticed
hide/invisibility just vanish from the list (correct dissolve depart); hidden/invisible speech is
`You hear the voice of Agan say, "…"`; re-materializing is `Agan fades into view.` (into-view hint,
direction now optional); own whisper `You whisper to Agan, "hi"` confirmed; and **OOC whispers
TRIPLE-emit** (whispers → ooc → main) — deduped by construction since only the whispers/conversation
copy is captured. Plus **Sekmeht's rule: a speaker with no room-list entry is hiding/invisible** —
the Tableau manifests a shadowed "unseen presence" figure to carry their bubble. LOOK-appearance
corpus banked for Phase-3 portraits. **Emotes verified too** (parenthesized main-text lines —
`(Agan laughs.)`; rendered as action captions under the avatar) and **directed says** (`You say to
Agan, "Hello."`) confirmed covered by the manner-clause wildcard. **The lava-drake combat capture
added:** the `logons` stream JOIN shape (verified), creature COUNTING (five identical bold spans =
one chip with a ×5 badge — `SceneCreature.count`; collapsing them hid four drakes), and the rule
that **own emotes are THIRD-PERSON** (`act laughs` → `(Sekmeht laughs.)`, never `(You …)`) — the
Tableau's self figure matches 'You' AND the character's own name, and the unseen-presence filter
excludes both. Combat-stream lines (attacks/evades/balance + range-close lines) are BANKED in
corpus/2026-06-12-combat-lavadrakes.xml for the `CombatParser` (G1) — not parsed yet by design.
**Adaptive arrangements (Sekmeht, from the first live screenshot):** ≤12 players = the single arc;
crossing 12 auto-switches to a two-row AMPHITHEATER (26 seats — back arc smaller/higher, front arc
closer; everyone but the self figure renders at 0.84em) before the "+N others" chip; the seat-glide
transition makes the relayout morph. A manual arrangement toggle is a possible later add if the
auto-switch ever annoys. **Game mechanic for G1's design (Sekmeht):** only ~4 creatures can ADVANCE on you at once — extras
wander to adjacent rooms — so the HUD must distinguish ENGAGED (the `closes to <range> on you!`
lines, ≤4 slots) from merely PRESENT (the room-objs tally); threat pips count engagement, the cast
count is a different number. The banked capture demonstrates the whole mechanic: 5 drakes present,
4 engaged, and the overflow 5th `slinks southwest in a rush of heat` — tally drops 5→4 on the next
component. Room creatures default to NEUTRAL styling in the Tableau (usually
pets, not hostiles — the room list can't tell; engagement data is what marks a real threat).
Still corpus-pending: language says with NO quote, multi-word NPC speakers, logoff/death notices on
the logons stream, door/climb movement shapes.
The `SceneParser` is
the §32.4(c) shared engine that feeds the Living Tableau (X1) and every later scene Experience
(X4/X5/X6) with **typed scene events**: who is present, who said what on which channel, who arrived
from where. It lives in `src/main/` beside `StormFrontParser` (same process, same line stream) and
emits events through the normal `GameEvent` batch pipeline (sessionId on every payload, Principle #6).

### 35.1 The capturer-registry model

Sekmeht's core requirement: **a registry of parser items, so we keep adding more events to capture
and reuse them everywhere** — never a hardcoded if-chain. One module (`sceneCapturers.ts`) exports a
flat list of capturers:

```ts
interface SceneCapturer {
  id: string                       // 'speech-say', 'cast-players', 'arrival-direction', …
  event: SceneEventType            // the typed event this capturer emits
  // Cheap gate first (pitfall #82a discipline), then the real match+extract.
  // ctx carries what StormFrontParser already knows at the call site: the
  // active stream id, the active preset, bold state, the clean line text.
  gate: string                     // literal substring that MUST appear (fast pre-check)
  match: (line: string, ctx: SceneCtx) => SceneEvent | null
  provenance: string               // where the pattern came from (Lich drdefs.rb, Frostbite xmlparserthread, corpus file …)
  status: 'verified' | 'unverified' // flipped to verified ONLY by a real corpus/live capture (§35.4)
}
```

- **Adding a new scene event = one capturer entry** (+ a `SceneEventType` member if it is a genuinely
  new event shape). Consumers (Tableau, future Experiences, triggers someday) read the typed events
  and never re-parse text.
- The registry runs from a single hook in `StormFrontParser.parse()` (after the token loop, like
  `inferHandsFromGlance` — pitfall #78's call-site precedent), with the same suppression discipline:
  capturers see the STREAM CONTEXT (`ctx.stream`, `ctx.preset`) so a Lich script echoing
  speech-shaped text into a custom panel can never mint a phantom scene event.
- Every capturer carries `provenance` and `status` **in the code** — the registry IS the living
  catalog of what we capture, where the pattern came from, and whether a real capture has confirmed it.

### 35.2 What existing parsers already encode (the survey, 2026-06-12)

Read from the real sources — these are the grounded starting patterns:

- **Lich `drinfomon`** ([drparser.rb](file:///C:/Ruby4Lich5/Lich5/lib/dragonrealms/drinfomon/drparser.rb),
  [drdefs.rb](file:///C:/Ruby4Lich5/Lich5/lib/dragonrealms/drinfomon/drdefs.rb), DRRoom): the canonical
  CAST extraction. `RoomPlayers = 'room players'>Also here: (?<players>.*)\.` then `extract_pcs`:
  **normalize only the TRAILING " and " to a comma** (no Oxford comma), split `', '`, strip the
  status tail `/ (who|whose body)? ?(has|is|appears|glows) .+/` and parentheticals, **name = last
  word** (`\w+$`). Posture sub-filters: `who is lying down` / `who is sitting` — **each also matches the
  `(prone)` / `(sitting)` SHORT form DR emits under the HidePostStrings option** (synced from Lich drdefs
  #4529 / 5.18 #1442; the parenthetical strip removes the suffix before name extraction). NPCs: `NPC_SCAN` —
  creatures are the `<pushBold/>…<popBold/>` spans of 'room objs' (dead: `which appears dead|\(dead\)`),
  leading article stripped, creature name `[A-Za-z'-]+$`. **DRRoom.pcs/npcs is maintained by
  re-parsing the component on every room update — so presence CHANGES (arrive/depart) are derivable
  by DIFFING successive casts, no text pattern needed** (Sekmeht's observation; this is the robust
  baseline for entrance/exit choreography — the directional text line is garnish on top).
- **Frostbite** ([xmlparserthread.cpp](file:///c:/temp/Frostbite-Dev/frostbite/gui/xml/xmlparserthread.cpp)):
  the CHANNEL routing truth. Conversations window = pushStream `talk` (a child `preset id='thought'`
  reroutes to Thoughts); `whispers` stream → Conversations; **`logons` stream → its Arrivals window**;
  `ooc` stream's preset-wrapped speech is a DUPLICATE of the whisper stream (deliberately ignored —
  the §49-pitfall double-emit family); `atmospherics`, `familiar`, `percWindow` similarly routed.
  Channel attribution therefore comes (mostly) FREE from stream id + preset, which our parser
  already tracks — the SceneParser's real work is SPEAKER + VERB + DIRECTION extraction from the line.
- **Profanity** routes the same stream ids but parses no speakers/arrivals (Lich does it) — it
  confirms the thin-client baseline needs nothing more than stream routing; the speaker work is what
  makes Tableau more than a stream panel.
- **Lichborne already has**: stream ids preserved end-to-end (Principle #5), `preset` per segment
  (speech/whisper/thought — the same signals Frostbite branches on), `bold` per segment (B117 — the
  NPC marker), room components split per sub-stream (B121), and the `logons`-family streams surfaced
  as the arrivals panel.

### 35.3 The initial capturer catalog

| Capturer | Emits | Pattern basis (provenance) | Status (2026-06-12) |
|---|---|---|---|
| `cast-players` | `scene-cast` (players + posture) | Lich `extract_pcs` rules, verbatim | **built + harness-verified** |
| `cast-creatures` | `scene-cast` (NPCs + dead flag) | Lich `NPC_SCAN` (bold spans; dead marker trails OUTSIDE the bold span) | **built + harness-verified** |
| `cast-diff` | `scene-arrive` / `scene-depart` (no direction) | DRRoom model: diff successive casts, transition-suppressed | **built + harness-verified** |
| `speech-say` | `scene-speech` (say; covers says/asks/exclaims + adverb/accent forms) | mock.xml:536/702/734 + corpus/2026-06-12-says-accents-crowd.xml (`softly says`, `says in a melodic accent` — Sekmeht live capture) | **verified** (gaps: no-quote language says, multi-word NPC speakers) |
| `speech-yell` | `scene-speech` (yell) | mock.xml:729/775 — `<b>`-wrapped on the talk stream, NOT preset | **verified** |
| `speech-whisper` | `scene-speech` (whisper, to-you flag) | mock.xml:708 (to you), :705 (to your group); whispers stream ALIASES into `conversation` | **verified** ("You whisper to X" branch corpus-pending) |
| `speech-thought` | `scene-speech` (thought; NO body in room) | mock.xml:656 (gweth relay) / :678+:887 (ESP bracket, `"<to you>"`) / :882 (in-your-head — TALK stream) | **verified** |
| `movement-hint` | `scene-move-hint` → consumed by SceneParser as direction/reason garnish on `scene-arrive`/`-depart` | Sekmeht live corpus 2026-06-12: `just arrived` (no dir) / `wades into view coming from the west` (arrival WITH origin) / `runs west.` + `wades east, <clause>.` (departures) / `just left.` (LOGOFF). Hints are non-authoritative — only consulted when the cast diff fires, so prose over-matches are harmless | **verified** (replaced the `arrival-direction` placeholder) |
| `logon-events` | `scene-logon` (global realm notice — Tableau ignores; Debug-visible) | Sekmeht corpus 2026-06-12: logons stream emits `* Miniature Slimjack Twosacks joins the adventure.` | **verified** for joins; logoff/death-notice shapes still corpus-pending |
| `emote-caption` | `scene-emote` (actor, caption) | Sekmeht corpus 2026-06-12: emotes are PARENTHESIZED main-text lines — `(Agan laughs.)` — name first, then anything to the closing paren. The feared "no marker" risk didn't exist; the parens are the marker. Tableau renders an italic action caption under the avatar | **verified** |
| `look-appearance` (future) | feeds Phase-3 Portrait Forge (AI9), not a scene event | LOOK output corpus BANKED 2026-06-12 ("You see Agan Aldaran of Elanthia, a Human." + appearance paragraphs + "He is wearing …") | waiting on the `AIProvider` adapter — don't build before it |

**Anti-pattern recorded by the corpus (mock.xml:460-461):** DR REUSES `preset id='speech'`/`'thought'`
for stat-table column alignment — a preset is NEVER a sufficient speech signal; the verb/shape regex
is. The harness keeps a stat-table line as a permanent must-NOT-match case.

### 35.4 Verification workflow (corpus = validation, not discovery)

The Sekmeht rule: *"make sure the things you find actually are capturing that event, then produce a
GAP and fill it in."* Concretely: (1) a capturer is born `unverified` with its provenance recorded;
(2) the corpus capture (`corpus/` — gitignored, busy-room Raw-XML via the Debug panel) is replayed
against the registry by the harness (`tmp-scene-harness/run.mjs` — **machine-local, gitignored
under `tmp-*/` like the corpus, because it embeds verbatim captured lines with real player names**;
rebuild recipe: esbuild-bundle the REAL `StormFrontParser` + `SceneParser`, feed corpus lines
through `parse()`/`derive()`, assert the emitted events — never a reimplementation, the Iron rule); (3) every corpus line the capturer
SHOULD have matched but didn't (or matched wrongly) is a GAP — fix the pattern, re-run; (4) flip to
`verified` with the corpus file named in `provenance`. The Debug panel grows a scene-events view in
Phase 2 so live play continuously exercises the registry.

### 35.5 Build phases

1. **Registry + cast capturers** (`cast-players`/`cast-creatures`/`cast-diff`) — Lich-derived, can
   ship ahead of corpus; Tableau Phase 1's interim renderer-side extraction (TableauExperience.tsx)
   moves down into typed `scene-cast` events and the component becomes a pure view. **✅ BUILT
   2026-06-12.** The transition-suppression model: `inTransition` arms on room-title, disarms on a
   real players commit OR the compass ('exits' — the last component of a room burst, Profanity's
   commit signal) — so our own moves never read as mass arrive/depart, and an empty room's armed
   flag can't swallow the next real walk-in.
2. **Speech capturers** after the first corpus batch (says → whispers → thoughts), wiring Tableau's
   bubbles (X1 Phase 2 choreography rides `cast-diff` + `arrival-direction`).
3. **Logons + emotes** as corpus coverage grows; promote-on-speak crowd handling lands with speech.

### 35.6 Performance contract — scene work is OFF until an Experience is open

Sekmeht's requirement (v0.14.0): the feature must be **completely free until used**. The gate:

- **Per-line work:** `StormFrontParser.sceneCapturersEnabled` (default FALSE) guards the
  `runSceneCapturers` call — until a session has an open Experience, not one extra operation runs
  per game line (no tag-strip, no entity decode, no gate checks). This is the §82-pitfall hot path;
  it stays untouched for non-users.
- **Event emission:** `SceneParser.setActive(false)` (default) makes `derive()` emit NOTHING — no
  scene events in IPC batches, no renderer state churn, no snapshot writes. It still TRACKS the cast
  silently (a per-room-component switch — the components are already parsed events; this is what
  makes activation instant without injecting a LOOK, which Lichborne never does — the pitfall-#76
  no-injection rule).
- **The toggle:** GameWindow sends `scene-active-toggle(sessionId, expAnyOpen)` (the
  `debug-panel-toggle` raw-XML precedent) whenever its open-Experience state changes; `sessionId` in
  the effect deps re-arms after a reconnect-in-place (pitfall #69). On ACTIVATION main backfills the
  silently-tracked cast via `SceneParser.snapshotCast()` so a just-opened Tableau paints immediately.
- **Renderer:** the ExperienceLayer (and its ResizeObserver) only mounts while an Experience is
  open; TableauExperience is `memo()`d (pitfall #82c) so an open-but-unchanged Tableau doesn't
  re-render on every game batch; speech/move buffers only ever fill while active (main emits
  nothing otherwise).
- The harness covers the contract: inactive sessions emit zero events for cast AND speech lines,
  and `snapshotCast()` carries the silently-tracked cast for the activation backfill.

### 35.7 Conversation gravity (Tableau layout, v0.14.0)

Sekmeht's design: the seating shows WHERE the conversation is. Each present player gets a
recency-decayed chattiness score from the speech buffer (window = the 120s promote-on-speak TTL);
anyone with a score leaves their arc seat and joins an inner CONVERSATION CIRCLE around the scene's
social center — radius shrinks with chattiness (the chattiest end up in the middle of everyone);
quiet people stay seated back on the arc (and dim under focus-the-speaker). DIRECTED speech is
captured as `SceneSpeechEvent.target` ("You say to Agan," / a whisper's recipient): partners'
circle angles converge on their circular mean (±offset so they sit side by side, not stacked), and
someone talking TO YOU drifts toward your foreground seat. Positions move on the standard figure
transition, so score changes read as people drifting through the room; epilepsy-safe stills it (the
figures still relocate, instantly). Bubbles are tinted per speaker (`--bubble-tint` from the avatar
color feeds the background mix, border, and tail) — the §32.2 "tinted by Contact color" detail —
with a larger, higher-contrast readability pass. **Second readability pass (same day, from live
screenshots): bubbles/captions size in the GAME FONT** (absolute `var(--game-font-size)`, not em)
**and carry an inline counter-scale transform cancelling the figure's depth scale** — speech reads
at main-window size no matter how small/far the speaker. **Self gravity:** YOU join the
conversation too — talking floats your figure up from the foreground toward the social center, and
talking TO someone drifts you toward their actual position (the pair closes from both sides since
the partner's circle angle pulls toward you); a quiet spell settles you back to your foreground
seat (you never rise past y=58 — always foreground-most). **Death (Sekmeht corpus):** a corpse
stays in the room list as `the body of Priestess Aenigma who is lying down` → the SAME cast entry
with `dead: true` (greyed, dashed, desaturated figure); the dead can speak (`You hear the ghostly
voice of Aenigma exclaim…` — the voice-of capturer accepts the `ghostly` form, bubble lands on the
body); resurrection re-lists them plain and the SAME entry flips alive — no phantom depart/arrive
across the transition (harness-locked). A ghostly voice with NO list entry falls through to the
unseen-presence rule, exactly like hiding/invisibility. **Third pass — the bubble LAYER (Sekmeht:
"bubbles still tiny at >12; spacing must be strategic; rewrite freely"):** bubbles moved OUT of the
scaled figure tree into scene-pixel space — the component measures the scene (ResizeObserver,
0×0-guarded per pitfall #83) and lays bubbles out itself: constant game-font size for EVERY speaker
by construction (no more transform-scale inheritance), the speaker's NAME inside the bubble
(tinted), and a COLLISION-AWARE placement — newest bubble (capped at 6 visible) claims the spot
nearest its speaker, earlier ones get pushed upward out of the way, so bubbles never overlap; the
tail's --tail-dx keeps aiming at the speaker when a bubble had to shift, and re-layouts glide
(epilepsy-safe stills them). Geometry uses char-count ESTIMATES for spacing only — CSS does the
real wrapping; a generous estimate just means generous spacing. Emote captions stay figure-attached
(counter-scaled).

---

## 36. Automation Analytics — usage stats & health (shipped v0.14.4)

A **self-tuning** layer over the player's OWN native automations (highlights, triggers, macros, aliases, mutes, substitutes). Pure display/configuration tooling — Profanity's "delegate to Lich" line doesn't apply because this analyzes *Lichborne's* native rules, not Lich scripts. The motivation: real rulesets bloat over months (especially from imports — Wrayth+Genie can produce thousands of near-identical highlights), and no DR front-end lets you see *what's firing a ton, what never fires, what's broken/duplicate*. (Sekmeht had duplicate highlights he never knew about; JadedSoul hit 3436 from a double import.)

**Master toggle — app-wide, OFF by default.** One preference (`SharedProfile.automationAnalytics`, the `bulkConnectSeparateWindows` pattern). Off → no runtime tracking (zero added per-line cost, §-perf / pitfall #82) and the analytics UI is hidden. The toggle lives in the **Automations panel header** ("📊 Analytics: On/Off"); toggling dispatches a `lichborne:analytics-changed` DOM event so every GameWindow's `analyticsEnabledRef` re-reads (a cross-window `storage` event never fires in the writing window).

**Two layers.**
- **Static health (free, on-demand, no persistence)** — [automationHealth.ts](src/renderer/automationHealth.ts) pure analyzers per type, reusing the existing `buildXRegex` compilers so *broken* = "won't compile / can never fire":
  - *broken* — invalid/empty regex (highlights/triggers/mutes/subs); macro with no key; alias with no input.
  - *duplicate* — by visual/functional identity (highlight: pattern+mode+scope+style; trigger: pattern+actions; sub: pattern+replacement; mute: pattern+scope).
  - *no-op* — highlight with no visual effect; trigger with no actions; etc.
  - *conflict* — **macros sharing a key combo** (`matchKeyCombo` → first wins, rest dead) and **aliases sharing an input** — the high-value dead-binding catch.
  - *obsolete* — a literal (text/phrase) highlight/trigger/mute/sub whose pattern is FULLY matched by a **regex** rule of the same effect (scope/style-agnostic for highlights, per Sekmeht; `m[0]===lit` full-match guard so a partial overlap isn't flagged). "A broad regex already covers my plain `bronze` highlight." Surfaced for **review** ("removing may change styling if they differ"), NOT auto-safe — because ignoring style/scope means the removed rule could have been visibly winning under the v0.11.3 specificity model.
- **Runtime usage (opt-in, persisted per-character)** — [automationStats.ts](src/renderer/automationStats.ts): `recordFire(character, ruleId)` tallies fires + `lastFiredAt` into an in-memory cache, debounced (800ms) to `scopedKey('automationStats')` (rides `state.*` → YAML). Data is per-character history, **excluded from Profile Transfer**. The runtime hooks ride EXISTING per-line work (no new scans): triggers piggyback `onFire`; highlights ride the Debug fire-scan; mutes/subs report via an optional `onFired(ruleId)` on their apply functions; macros/aliases count at resolve time (`resolveMacro`/`resolveAlias` return `ruleId`).
  - **Storage is BOUNDED — two rules (so the stats can't bloat localStorage or the profile YAML).** (1) The flush is **try/catch'd, NOT `safeSetItem`** — background telemetry must never throw or alert the user (a quota-failed stats write just skips; the live cache keeps the count). (2) The only unbounded vector — `recordFire` keys by `ruleId` and never deletes an entry, so a DELETED/re-imported rule's stats would linger forever — is closed by **`pruneStats(character, liveIds)`**, run from AutomationsPanel on open: it drops every stats entry whose id isn't in the union of all six current rule lists. **Reset + prune persist to YAML** (via the panels' `onSaved` → scheduled profile save), because YAML re-seeds localStorage on next connect — a clear that never reached YAML would re-appear. So the map is bounded by the live rule count, clearable via Reset, and the clear sticks across restarts.

**UI** — shared [AutomationAnalytics.tsx](src/renderer/components/AutomationAnalytics.tsx): `useRuleAnalytics` (the hook each panel calls — also live-refreshes counts every 2s while open, since `recordFire` mutates the cached stats in place), `RuleBadges` (per-row fire count + ⚠/⧉/∅/⌨ icons), and `AnalyticsReview` (a **full-width** collapsible banner above each panel's list — NOT crammed in the ~210px sidebar). The Review is **collapsible per category** (each a `<details>`, capped at 200 rendered entries — a bloated ruleset has 1000s of duplicate sets, so dumping them inline buries Top/Quiet), with a count-chip summary bar, a **"Quiet — not fired since {date}"** list (framed informational — rare-but-valid rules like death messages live there, never "delete me"), a **"Remove duplicate copies"** bulk action in the Duplicate section (keep one of each set), and an **Obsolete (covered)** section with its own review-gated bulk remove. **Every category is self-explaining** (UX/UI polish standard #8): a `title` hover tip + a visible one-line description WITH an example, shown even when the category is empty (so a clean panel still teaches what each means — "It's not apparent at all through the UI", Sekmeht). Jump links open the rule in the detail pane (they call the panel's real `selectRule`/`selectAlias`/`selectMacro`).

**Rejected / deferred:** shadowed-highlight detection (a rule perpetually overridden under the v0.11.3 specificity model) and group-gated-never-active detection (both harder). The same shape generalizes to Contacts later.

See CLAUDE.md (Automations architecture note + pitfalls #82 / #90).

---

## 37. Slash Commands ("Client Commands") — designed 2026-07-03; Phase 1 built v0.14.5, Phases 2–3 built v0.14.6

Keyboard-speed client control from the command bar: typing `/` opens a completion **palette**, and `/highlight add "goblin" red` creates a highlight without a modal round-trip. Origin: a tester asked for a command-line way to add highlights; Sekmeht proposed the `/`-prefix + command list. The panels remain the place to *craft* rules; slash commands are the way to *capture* them mid-play.

### 37.1 Why `/` and the product frame

Every sibling client owns a client-command prefix — Lich `;`, Genie `#`, Profanity `.` — and **`/` is unclaimed** in this ecosystem, with modern muscle memory (Discord/Slack). The feature is squarely display/configuration layer (Principle #2-safe): it configures Lichborne's OWN native rule layer, needs no Lich, and duplicates nothing Lich does. A `/`-leading line NEVER reaches the game: known commands execute, unknown commands **fail closed** with a hint (never silently leak a typo to DR), and `//text` escapes to send a literal `/text` to the game.

### 37.2 Syntax

```
/<noun> <verb> "required arg" [one positional sugar] [option=value ...] [flags]
```

- **Noun-first** — everything about highlights starts `/highlight` (alias `/hl`). Nouns have aliases (`/gag` → mute, `/substitute` → sub, `/ts` → timestamps).
- **One positional sugar per command** — the argument you always want rides positionally (highlight's COLOR: `/highlight add "goblin" red`). Everything else is `key=value` so the syntax never becomes order-dependent soup.
- **Colors — a MANAGED, CURATED palette accepted EVERYWHERE (v0.14.6; supersedes the same-day "slash-only" scoping, reversed by Sekmeht: "named colors should be managed and curated… added everywhere including in automations, themes").** The palette lives in [colors.ts](src/renderer/colors.ts) as THREE tiers, resolved curated → custom → web → `#hex` (all lookups own-property-guarded):
  1. **CURATED** — Lichborne's promoted 16 (red, green, blue, yellow, orange, purple, pink, cyan, teal, gold, white, black, gray/grey, brown, magenta, lime), hand-tuned for READABILITY on game backgrounds (our `red` is `#ff5050`, not CSS's harsh `#ff0000`). These are what `/colors` lists and the palette's color chips offer.
  2. **CUSTOM** — user-defined via **`/colors add "ember" #ff6a30`** / `/colors remove` (value must be `#hex`; names one word, 3–20 chars, can't shadow a curated name; re-adding updates in place). App-wide (a color vocabulary is shared, like themes): `lichborne.customColors` localStorage + `SharedProfile.customColors` → `_shared.yaml` (optional field — non-breaking). Customs MAY shadow web names.
  3. **WEB** — the full standard CSS/web set (~148 names, `WEB_COLORS`) accepted as input everywhere but not listed (a wall). **This is GENIE'S vocabulary** (its `ColorCode.cs` accepts every .NET KnownColor web name — verified 2026-07-04; Frostbite is picker-only, Profanity terminal-ids-only), so DR muscle memory like `Lime`/`DodgerBlue` just works.
  **Resolution is AT ENTRY (store hex), not live references** — a rule/theme stores the hex the name resolved to when typed; editing or removing a named color later does NOT retro-update existing rules (the `/colors add` update message says so). Live palette references (edit-propagates) were considered and deferred — a much bigger change (every render path + Transfer coupling); revisit only on tester demand.
  **Where names are accepted (Phase B):** every slash color slot; the **free-text color fields** every editor already pairs with its picker (Highlights ×3, Contact templates ×4, Groups ×1, Trigger echo ×1) via `normalizeColorInput` **on BLUR** (never on change — typing "red…" must not hijack "rebeccapurple"; each field carries the `COLOR_INPUT_TITLE` tooltip); and the **Theme Editor**'s text field (draft + commit-on-blur/Enter; live `#hex` typing still applies immediately; **theme vars always STORE hex** — a theme must never depend on the palette existing). The pickers themselves are unchanged.
  **Theme contrast for swatch text:** anywhere a color name is drawn IN its own color (`/colors` rows, palette chips), `contrastBackingFor(hex, surfaceVar)` adds a neutral backing chip when the color's luminance sits within 0.18 of the live surface's (`--bg-app` for game-window rows, `--bg-raised` for the popover) — so `black` stays readable on dark themes and `white`/`ivory` on light ones, while most colors render bare. Solved with per-segment data (`TextSegment.bg` / inline chip bg), not CSS — the colors are USER data, not theme vars. Any future surface drawing user colors as text should call the same helper.
- **Quoting** — `"..."` with `\"` escape; single-word args can go bare.
- **Flags** — bare booleans (`bold`, `glow`).

Phase 1 command set: `/help [command]`, `/highlight add|remove|list`, `/mute add|remove|list`, `/sub add|remove|list`, `/contact add|remove|list`, `/template add|remove|list`, `/timestamps [on|off]`. (Final v0.14.6 pass added **`/colors`** — the named-color list, each name drawn IN its color via the rich-line result capability (`SlashLine = string | {rich}`; GameWindow maps color → `TextSegment.fg`), and rewrote **`/help`** for novices: bare = one plain-language row per noun from the `NOUN_HELP` blurb map + a syntax primer (quoting, `key=value`, colors, `//`, palette keys); `/help <noun> [verb]` = signatures with every arg/option hint + a bracket legend.) Defaults on `add` come from the SAME `newX()` factories the editors/right-click use (so a slash-created rule is byte-compatible), with one override: slash highlights default `scope=match` (you're highlighting a word/phrase you just saw, not the whole line).

**Contacts & templates (added to Phase 1 same pass, Sekmeht) — four decided behaviors:** (1) `/contact add "Bob" Enemies` on an EXISTING Bob **updates** him (moves to Enemies; guild/notes options update too) — "add a name to a template" is the same gesture whether or not he's already a contact; existing + nothing to change = error. (2) **The template must exist** — a typo'd template name fails closed listing the available names; creating templates is the explicit `/template add "Watchlist" orange [tag="[W]"] [bold]` (a typed typo must never silently mint an empty template — the import wizard's find-or-create is right for bulk, wrong for typing). (3) `/template remove` **mirrors ContactsPanel.deleteTemplate**: the template goes, member contacts keep their entries with a dangling `templateId` (harmless — renderer lookups tolerate it), the output reports the member count, and removing a built-in (Friends/Enemies) notes that `loadContactTemplates` resurrects defaults next session. (4) **Names normalize**: one word (letters/apostrophe/hyphen), first letter capitalized, duplicate-checked case-insensitively. `/template` is its own noun (aliases `tpl`, `templates`) rather than a nested `/contact template …` — the registry is one-noun-one-verb by design, and discoverability survives via ranking (its descriptions say "contact template", so typing `/contact` surfaces them below the `/contact` entries). Contact applies go through the **pitfall-#36 blessed path** (`saveContacts` + `setContacts` together → the B119 cleanup effect drops any in-flight room-tracking buffer). `saveContacts`/`saveContactTemplates` were also quota-hardened with `safeSetItem` in the same pass (B197 family — contact imports run to 150+ names).

### 37.3 The palette (the UX heart)

Typing `/` as the first character of the command bar opens a completion palette above the input:

1. **Command-list mode** — every registered command with its one-line description, **RANKED as you type** (Sekmeht's `/highlight l`→Tab-gave-`add` report): `scoreEntry` scores each typed word by match QUALITY — exact noun/alias/verb (100) > **verb prefix** (80 — the `l`→`list` case) > noun prefix (60) > verb substring (30) > noun substring (20) > description (10) — the list sorts best-first (stable sort keeps registry order on ties, so bare `/t` resolves to `/template add` by registry position while `/ts` stays deterministic via timestamps' exact alias), and the selection resets to the top match on every edit. **Tab (or click) completes the top/selected match — i.e. what the user was typing, never registry order**; ↑/↓ move the selection, **Enter always submits the input as typed**, Esc dismisses (until the input changes). Enter-submits/Tab-completes is deliberate — Enter must stay predictable for muscle-memory users who type the full command blind. Every-word-must-match still applies (a word matching nothing excludes the entry); mere-presence matching without ranking was the original bug — the letter `l` is a substring of "high·l·ight" itself, so all three verbs "matched" equally.
2. **Argument-hint mode** — once a noun+verb resolve, the palette shows the signature + description + one example, with **live validation** of the current parse ("`#FF000` isn't a valid color") and — for `highlight add` — a **live preview chip** rendering sample text in the parsed color/bg/bold.
3. Palette rows follow the polish standards: theme vars only, `em` sizing off the game-font anchor, `line-height: 1` rows, portal to body (z above the WindowLayer/ExperienceLayer) so it works identically in Static and Windowed Panels (the command bar can live in a floating window).

Feedback for executed commands is a client-styled line in the main window (`preset: 'internal-system'`, the "Connection closed." pattern) — quiet, in-flow, and captured by the Session Log under `[sys]`.

### 37.4 Architecture

- **Interception** at the top of `dispatchUserText` (the canonical typed-input path, CLAUDE.md pitfall #31), BEFORE alias resolution — a slash line executes and returns (no `>cmd` echo, no send, no game round-trip). History push still happens (↑ recalls a slash command).
- **Registry, not if-chain** — [slashCommands.ts](src/renderer/slashCommands.ts) holds a declarative `SLASH_COMMANDS` registry (noun, aliases, verb, positional arg schema, options, flags, description, examples, executor). ONE registry drives the parser, the palette's list + signatures + validation, and `/help` — the §35 capturer-registry philosophy. Adding a command = one entry.
- **Executors mutate through the existing rails** — GameWindow builds a `SlashContext` whose setters do exactly what a panel save does: `saveHighlights(character, next)` (quota-safe via `safeSetItem`) + `setHighlights(next)` (recompiles via the existing memos) + `saveProfile()` (debounced YAML). No new persistence, no profile-shape change, `allGroups: true` defaults preserved.
- **Per-session by construction** — the palette + context live in GameWindow (the command bar's home), so per-character state and contexts are all in reach (pitfall #57).
- **Scope (v0.19.0): the main command bar, Quick Send, and the Overview's input bar** — anything routed through `dispatchUserText`. **This REVERSES the original exclusion**, which read: *QuickSend deliberately does NOT interpret `/` (it targets OTHER characters' sessions; a client command there is ambiguous about which character it configures)*. The ambiguity argument was real but the alternative was worse — the raw path sent `/highlight add …` to DragonRealms **as literal text**, and a client command must never leave the client (B268). Every send path that can carry user-typed text therefore has to reach the intercept. A command runs in the TARGET character's context, so a broadcast runs it once per character — which is useful for `/highlight add` and carries one known wart: a toggle like `/view` flips once per target. The PALETTE remains the main command bar only; the other surfaces get no completion.

### 37.5 Phasing

- **Phase 1 (v0.14.5, BUILT):** framework (tokenizer/parser/registry/executor), palette (both modes + validation + highlight preview), toasts as the companion feedback surface, commands: help / highlight / mute / sub / timestamps.
- **Phase 2 (BUILT v0.14.6):** (`contact`/`template` had moved UP into Phase 1.)
  - **`/alias add "hh" "health;heal" [delay=ms] [name=] [passthrough]`** + remove/list/edit — the expansion splits on `;` into the `commands[]` sequence (the `newAlias` factory defaults otherwise); duplicate inputs rejected (`resolveAlias` is first-match, so a second same-input alias would be dead weight).
  - **Trigger quick-form: `/trigger add "pattern" do "command" [mode=] [case=] [cooldown=s] [once] [name=]`** + remove/list/edit. The literal `do` is readable sugar and OPTIONAL (`"pattern" "command"` also parses); `newTrigger` ships with one command action, so the quick-form fills `actions[0].command` — gates, more actions, stream scope, variable-watch all stay editor territory (the confirmation line says so). `watchStream` stays the factory's `'main'` default (B128).
  - **`edit` verbs everywhere** — `/highlight|mute|sub|alias|trigger edit "pattern-or-name"` opens the Automations panel at the right tab with the rule SELECTED in the detail pane. Plumbing: the TriggersPanel `openRuleId` pattern (an 8-line find-and-select effect) replicated onto HighlightsPanel/MutePanel/SubstitutesPanel and MacrosPanel (`openAliasId`, paired with `initialTab='aliases'`); AutomationsPanel threads `highlightOpenId`/`muteOpenId`/`substituteOpenId`/`aliasOpenId`; GameWindow holds ONE `slashOpenRule {tab,id}` state feeding the right prop (triggers merge with the existing Fires-GOTO `triggerOpenId`), cleared on panel close like the prefills. `SlashContext.openRuleEditor(tab, id)` is the executor-facing surface.
  - **Sub before→after palette preview** — `/sub add` shows `“pattern” → “result”` live, computed via the REAL `buildSubstituteRegex` on a temp rule; text/phrase modes only (a regex pattern has no synthesizable sample; no preview there).
  - **Palette value-completion from live data** — the palette gains an optional `live: SlashLiveData` prop ({ templateNames }, fed by GameWindow from `contactTemplates`); when `/contact add`'s template slot or `/template remove`'s target is still open, the user's REAL template names render as click-to-fill chips (quoted automatically if they contain spaces). The registry stays pure — live data rides only through this prop.
- **Phase 3 (BUILT v0.14.6, same day — the "soak first" hold was reversed by Sekmeht):** client control — `/mode [name]`, `/group on|off <name>` + `/group list`, `/panel open|close <stream>` + `/panel list`, `/theme [name]`, `/log search ["text"]`, `/clear`. Architecturally different from Phases 1–2: executors drive UI STATE, not rule stores, so the integration lives in GameWindow's `SlashContext` implementations while the registry entries stay dumb matchers + messengers. The wiring: `/mode`/`/group` go through the per-session **`GroupsContext`** (GameWindow already consumed `useGroups()` — the destructure just grew `groups`/`toggleGroup`/`clearMode`; rule gating updates automatically since every compile memo keys on `activeGroupStates`); **`/panel` branches on `layoutMode`** (pitfall #79) — free mode generalizes `toggleFreeDebugWindow`'s add/remove shape by stream id (`slashOpenPanel`/`slashClosePanel`), panels mode focuses the holding zone or lands new tabs via `addToZone(id, 'bottom')`; **`/theme`** does exactly what ThemePicker's `onThemeChange` does (`setCurrentThemeId` → the apply effect → `applyTheme` persists `lichborne.theme` + storage-syncs other windows + re-applies accessibility overlays via the hook); **`/log search`** reuses the "Show in Log" pattern (query + remount nonce + open); **`/clear`** is the context menu's `clearLines` (re-pins). Value-completion chips extended: mode names (+`none`), group names, openable streams / open panels (mode-appropriate), theme IDS.
  **The three open calls, settled (Claude's recommendations, standing unless Sekmeht overrides):** (1) **bare `/mode` LISTS modes** with the active one marked (`/mode none` clears) — listing is safe + informative; toggle-back-to-last was rejected as surprising. (2) **`/panel open` of an unknown stream fails closed** listing the available streams + a note that Lich-script streams appear once pushed — consistent with the template-name model; stream matching is case-INSENSITIVE but opens with the CANONICAL id (Principle #5 — ids preserve case, `/panel open lichscripts` opens `LichScripts`). (3) **`/clear` has NO confirm** — the context-menu Clear has none, the Session Log keeps everything, and consistency beats ceremony. **Theme name resolution:** id match FIRST (unique, deterministic — `/theme classic` gets the dark Classic since its id IS `classic`), then display name; a shared display name that isn't an id (a future "Slate" pair) errors listing the ids rather than guessing (pitfall #35).
  **List conventions (Sekmeht, same day):** every stateful list carries the **● active-indicator** — `/mode` (active mode), `/group list` (on groups), `/panel list` (open panels first as ● rows, then · available), `/theme` (current theme) — with a self-explaining legend in each header (`● = active/on/open/current`, polish standard #8). `/mode list` and `/theme list` work as LIST SUGAR on the noun-only commands (typed by analogy with the other nouns; a real mode/theme actually named "list" wins the match, so the sugar can't shadow it). And `getCurrentThemeId` reads `localStorage['lichborne.theme']` FRESH, not GameWindow's `currentThemeId` state — the state goes stale when the theme is switched in another window (the cross-window storage listener re-applies the DOM without updating other windows' state), and localStorage is what `applyTheme` writes on every switch.

**Open calls (Sekmeht):** `key=value` vs `key:value` (built as `=`); whether trigger creation is Phase 2 or panel-only; tester confirmation that no one's speech habitually starts with `/`.

### 37.6 Toast notifications (companion feature, built same pass)

A small themed toast stack ([toasts.ts](src/renderer/toasts.ts) + [ToastHost.tsx](src/renderer/components/ToastHost.tsx), mounted once per window at the App root): `showToast({kind, title, message})` dispatches a `lichborne:toast` CustomEvent; the host renders bottom-right, auto-dismissing (info/success ~4s, error ~10s), click to dismiss, capped stack. Theme-safe by construction (surface vars + `color-mix` semantic hue stripes, pitfall #55 pattern). First consumer: `safeSetItem`'s quota warning — previously a blocking `window.alert`, now a non-blocking error toast (same one-shot semantics). Future consumers: Transfer/import completions, slash-command errors that deserve more than an in-flow line.

### 37.7 Maintenance contract — slash commands track the features they drive (Sekmeht, 2026-07-04)

The registry is a FIRST-CLASS control surface with a standing obligation, codified as **CLAUDE.md Principle #11 + pre-merge check #5**: every new user-facing feature gets its `/command` (or an explicit, recorded "no command because X" in that feature's DESIGN section), and every feature CHANGE updates its registry entries — executors, options, hints, examples, summary formatters, error messages, and the `SlashLiveData` completion values — in the same change. A drifted command (a hint describing an option that no longer exists, a summary missing a new field) is a shipped bug of the same class as a stale tooltip: it teaches users wrong things with confidence. Concretely: new rule type → the full `add`/`remove`/`list`/`edit` verb set + the panel `openRuleId` plumbing; new toggle/setting → the `/timestamps` shape; new selectable values → completion chips; retired feature → entry removed (fail-closed covers muscle memory with the `/help` hint); renamed concept → old noun kept as a `nounAliases` alias (the `/gag`→mute precedent). Retroactive sweeps at version boundaries include a drift pass over the registry (does every entry still match the feature it drives?).

---

## 38. Command Bar Input Model — history, draft, Esc, first-session hint (F57/F58, v0.15.2)

The command bar's input-layer behaviors, consolidated from the v0.15.2 quick-wins pass (the "your
fingers already know Lichborne" track). All logic lives in GameWindow (`handleCommandKey` /
`dispatchUserText`); the persistence helper is [commandHistory.ts](src/renderer/commandHistory.ts).

### 38.1 History — persisted per character

The ↑/↓ recall buffer (≤200 entries, most-recent-first, consecutive-duplicate suppressed) is
persisted on the `commandHistory` scopedKey: loaded once per mount (lazy state — a bare
`useRef(load(...))` would re-run the localStorage read every render), written synchronously on every
push (tiny payload; the write is try/catch'd, NOT `safeSetItem` — history is background telemetry
and must never toast mid-play; a quota-failed write just skips while the in-memory ref keeps the
session's history). It rides the dynamic `state:` pipeline into the profile YAML for free and is
deliberately NOT in `TRANSFER_CATEGORIES` (character history, not setup — the `automationStats`
precedent, §29.3). **Push POLICY is unchanged** (CLAUDE.md pitfall #31: only the bar's normal Enter
and `{ReturnOrRepeatLast}`'s typed case push — repeat tokens never pollute history).

### 38.2 Draft preservation (the shell model)

Pressing ↑ from the live line (history index −1) stashes the in-progress text in `historyDraftRef`;
↓ back to the bottom restores it instead of discarding it. Editing a recalled entry resets the index
to −1 (the existing `onChange` behavior), so the edited text becomes the next draft — exactly how
shells behave. Companion fix: ↑ with an EMPTY history is now a no-op (it used to fall through
`Math.min(0, −1) = −1` and wipe the typed line).

### 38.3 Esc clears the line

The classic Stormfront/Genie reflex. Layered UNDER the slash palette's Esc (the palette's
`handleKey` runs first in `handleCommandKey`): first Esc dismisses an open palette, second clears
the line. Gated on non-empty so Esc on an empty bar stays inert. Clearing also resets the history
index and the stashed draft.

### 38.4 First-session hint (F58)

The input's `placeholder` — *"Type a game command — or / for Lichborne client commands"* — is the
passive discoverability surface for §37 (there was previously none: the palette only appears after
`/` is already typed). Gated on the INITIAL history load being empty, so it shows for the whole of a
character's first session and never again from the next mount on — quiet-by-default for veterans
(polish standard #1). Placeholder color is an explicit `var(--text-faint)` (Chromium's default
placeholder grey is a literal — the pitfall #34 light-theme class).

### 38.5 Slash surface — none, by design

F57/F58 are input-layer behaviors of the bar itself, not client capabilities to invoke: history
recall/draft/Esc are keystrokes, and the hint is a one-time passive affordance. Nothing here is
meaningfully drivable by a `/command` (recorded per pre-merge check #5). If a history-SEARCH feature
ships later (F50), THAT gets a surface (likely a keystroke + palette, same infrastructure as §37.3).
The same recorded no-command decision covers §38.6/38.7 below (a separator and a focus behavior are
not invocable capabilities).

### 38.6 `;` command separator (F59, v0.15.2)

`n;n;e` typed in the bar is three commands — the Genie reflex. `splitTypedCommands`
([macros.ts](src/renderer/macros.ts), harness-covered) runs in `dispatchUserText` AFTER slash
handling: **a line whose first non-space char is `;` is a LICH command, returned verbatim and never
split** (Lich commands can legally contain `;` — `;e Vars['x'] = 'a;b'` must not be corrupted);
`\;` escapes a literal `;`; parts are trimmed, empties dropped, and each part runs the full
alias/echo/send/log tail independently (aliases expand per command). History keeps the RAW typed
line — ↑ recalls `n;n;e` whole and `{RepeatLast}` replays it through the same split. The separator
is hardcoded `;` (Genie's default `separatorchar`; the import layer assumes the same). **As of v0.19.0
Quick Send and the Overview's input bar DO split**, because both now arrive through `dispatchUserText`
(§47.5e) — this supersedes the earlier note that Quick Send deliberately did not, which rested on the
`/` exclusion §37.4 has since reversed. A `//`-escaped line (literal `/text`) DOES split like any game
line.

### 38.7 Type-anywhere focuses the bar (F60, v0.15.2)

The Genie/Frostbite model: a printable keystroke that would otherwise be lost (focus sitting on a
button, the map, a panel, or body after a click) lands in the command input. Mechanism: the global
keydown handler focuses the input during keydown — the browser then delivers the character to the
newly-focused input, so there is no preventDefault and no manual insertion, and a space aimed at a
focused button no longer clicks it (button activation fires on keyup, which now targets the input).
Guards, all load-bearing: no Ctrl/Alt/Meta chords; `e.key.length === 1` only; never while ANY text
field / select / contentEditable has focus (editor fields keep their keystrokes); never while a
modal is open (reuses the macro guard's `anyModalOpenRef` — whose missing `showMapOverlay` /
`showLichDash` deps were found and fixed in the same pass); never mid-IME (`e.isComposing`); never
when something above already consumed the key (`e.defaultPrevented` — covers macro-bound printable
keys). **Always on, no setting** — matches the siblings; add a toggle only on a real tester ask.

---

## 39. Global Cross-Character Rules (F37, shipped v0.15.2)

Binu's long-standing ask, built exactly on the settled design (Sekmeht, 2026-05-31 — option A):
global rules live in a **separate store**, edited via a scope switch, never a per-rule
promote-to-global toggle (the footgun the design rejected).

### 39.1 Storage — the virtual `_global` scope

Global highlights / triggers / macros / aliases live under a VIRTUAL character scope:
`lichborne._global.*` (`GLOBAL_RULES_SCOPE` in [characterScope.ts](src/renderer/characterScope.ts);
the underscore can't collide with a real DR name). This is the load-bearing trick: the four rule
STORES and the four rule PANELS only ever see `scopedKey(character, …)`, so they work on the global
store **completely unchanged** — same editors, same analytics UI, same save calls. The disk bridge
is **`_shared.yaml`** (new optional `SharedProfile.sharedHighlights/Triggers/Macros/Aliases`
fields; raw-key read/write in [profile.ts](src/renderer/profile.ts) so profile.ts stays free of
rule-module imports), NOT any {Character}.yaml — there is no `_global` character profile and no
session for it. Structurally excluded from Profile Transfer and character exports (they scan the
character's own key prefix).

### 39.2 Runtime — merge, always-active, character-first

GameWindow loads the four global lists once (lazy state) and merges them AFTER the character's own
lists at each engine input: `useCompiledHighlights([...highlights, ...globalHighlights])`,
`useTriggerEngine([...triggers, ...globalTriggers])`, and the `macrosRef`/`aliasesRef` mirrors hold
the merged arrays. **Character-first** so every conflict resolves to the character's rule
(equal-specificity highlight ties are first-in-array; `resolveMacro`/`resolveAlias` take the first
match). `asGlobalRules` normalizes globals to `allGroups: true, groupIds: []` at every load —
groups/modes are per-character concepts (their nanoid ids differ per character), so global rules
are **always-active by design**; the editors hide the Groups row in Global scope (`hideGroups`
prop) rather than show a control that can't apply. Merged arrays are DERIVED, never saved.

### 39.3 Live sync

An AutomationsPanel Global-scope save dispatches `lichborne:global-rules-changed` (same-window —
a `storage` event never fires in the writing window, the analytics-toggle precedent) and schedules
the `_shared.yaml` flush; other windows hear the `storage` event on the `lichborne._global.` prefix
(the theme-sync precedent). Every mounted GameWindow listens for both and re-merges — edits reach
every character in every window without a remount.

### 39.4 UI

AutomationsPanel header gains a segmented **"This Character | All Characters"** switch, rendered
only on the four scope-capable tabs (Mutes/Substitutes/Groups stay per-character — the switch hides
rather than disabling). Global scope re-points a `CharacterProvider` at `_global` around the panel
body; panel keys include the scope so switching remounts (each panel loads its list once on mount).
Prefill/open-rule props carry character rule ids — harmless no-ops in Global scope.

### 39.5 Deliberately deferred (recorded)

- **Global contacts** — contacts are runtime-MUTATED by presence tracking (lastSeen / timeSpentMs
  buffers, pitfall #36); a shared store would be written concurrently by every session in every
  window. Needs its own design (probably main-owned, like the roster). Do not bolt it onto the
  virtual-scope model.
- ~~**Global mutes/substitutes** — same mechanism would work; deferred until asked for.~~
  **SHIPPED same release at Sekmeht's ask:** mutes + substitutes are now scope-capable — same
  virtual-scope storage (`sharedMutes`/`sharedSubstitutes` in `_shared.yaml`), same character-first
  compile merge in GameWindow (`compileMutes`/`compileSubstitutes` over `[...character, ...global]`),
  same "Applies to" move control (muteKey/subKey identity), same Transfer coverage (in the
  globalRules category + global-skip filters on the per-character mute/sub imports). Only
  **Groups & Modes** remains per-character — and the header scope switch now renders on EVERY tab,
  greyed with an explanatory tooltip on Groups, so the header buttons never shift position between
  tabs (Sekmeht's call: disabled-in-place beats disappearing).
- **Slash surface** — `/highlight add` etc. create CHARACTER rules; a `global` flag on the add
  verbs is the recorded follow-up (pre-merge check #5: no command yet, because the SlashContext's
  apply functions are character-bound and the scope switch is the v1 surface). Same recorded
  deferral covers a `/… move` verb for §39.6's scope move.
- **Analytics badges in Global scope** — fires are recorded under each CHARACTER's stats map (the
  prune now counts global ids as live there), so the Global-scope editor's per-rule badges read the
  unused `_global` map and show no counts. Cross-character aggregation is the fix if testers care.

### 39.6 Per-rule scope move — "Applies to" (F63, same release)

Sekmeht's follow-up ask ("move one from this character to all characters… a toggle for 'this
character' or 'all characters'"), reconciled with 39.0's rejected-toggle rationale: the STORAGE
model is untouched (two separate stores, no per-rule scope field) — the toggle is a **deliberate
MOVE action**. Each of the four editors gains an **"Applies to: This Character | All Characters"**
segmented row (rendered only when hosted by the Automations panel — standalone hosting passes no
`onMoveScope`); the active side is an inert state marker, the inactive side moves the rule:

- Remove from the source store; if a **content-identical** rule (ruleIdentity.ts keys — the SAME
  definition Transfer's dedup uses) already exists in the target store, add nothing and toast
  "already exists — duplicate removed". **A move can never mint a duplicate.**
- Promotion normalizes group gating away (`asGlobalRules`); the id travels with the rule so its
  per-character analytics history stays attached. Demotion's consequence (every OTHER character
  loses the rule) is stated in the button tooltip; the action is one-click-reversible, so no
  confirm dialog (revisit on tester feedback).
- The move passes the **draft** (unsaved edits included — a move is save-and-move), syncs both
  stores the F37 way (shared-YAML flush + `lichborne:global-rules-changed` + character reload/
  profile save), and remounts the panel via `importNonce` (a cross-store edit, like an import).

### 39.7 Transfer global-awareness (F63, same release)

Two additions to Profile Transfer (§29), so globals and Transfer can't fight each other:

1. **"Global Rules (All Characters)" category** — shared-store data (the Named Colors model, NOT
   the source character's YAML): exports the machine's four global lists; importing **always
   MERGES** into the destination's global store regardless of the Append/Replace choice (Replace
   is a per-character intent; a shared store is never wiped by it), skipping content-identical
   rules, regenerating ids, re-normalizing always-active, and dispatching the F37 change event so
   live windows re-merge. All five registration points done (entry, count, build, order, switch —
   the v0.14.0 Experiences lesson).
2. **Global-aware per-character import** — the four per-character rule categories filter incoming
   rules whose content key already exists in the destination's GLOBAL store, in BOTH merge modes
   (a rule promoted to global must not come back as a per-character copy that double-fires).
   `globalRules` runs BEFORE the per-character categories in the apply order so the filter sees
   the freshly-merged global store. Mutes/substitutes have no global store — no filter.

---

## 40. v0.15.2 batch records — search, session restore, settings nav, virtualization decision

Short records for the rest of the v0.15.2 review batch (full behavior in Tracker.md):

- **F49 — Ctrl+F in-scrollback search** ([ScrollbackSearch.tsx](src/renderer/components/ScrollbackSearch.tsx)):
  a pure view over the `lines` data model (joined segment text — WYSIWYG, pitfall #89); new query
  lands on the MOST RECENT match, Enter = older / Shift+Enter = newer, wrapping; jumps un-pin first
  then `scrollToIndex({align:'center'})` — **no new scroll mechanism** (pitfall #68); the active
  hit's wrapper gets an accent-outline class (TextLineRow memo props untouched); un-pinned buffer
  never trims, so indices stay stable while searching (pitfall #81). Ctrl+F intercepted in the
  global keydown (Electron has no native find), inert while modals are open.
- **F62 — Reconnect Last Session**: primary window snapshots the all-windows roster to
  `SharedProfile.lastSessionCharacters` on every NON-EMPTY change (non-empty-only so shutdown /
  disconnect-all can't wipe it); the launcher's "⟲ Reconnect Last (N)" button feeds the saved set —
  matched to existing non-hidden tiles, minus already-connected — into `runBulkConnect`, honoring
  the separate-windows preference. Window-arrangement restore deferred.
- **F61 — Settings search + section rail**: filter box (label/section-name substring) + a left rail
  of the six sections (hidden while searching); rows wrapped mechanically, zero setting-logic
  changes, theme vars only.
- **Stream-panel virtualization — evaluated, DEFERRED**: rows are capped at 500 and `TextLineRow`
  is memoized, so an append reconciles ≤500 memo-bailing children — B172's profiling already moved
  the real per-line costs out of render. Virtualizing would rewrite the exact scroll surface B203
  just fixed (uncommitted at decision time), and the main window needed six iterations
  (B33→B158) to get Virtuoso pinning right. **Re-open only with a measured case, after B203
  soaks.** Do not reach for `content-visibility`/`contain` shortcuts either — pitfall #23's class.
- **Programmatic coverage (Sekmeht's ask, same version)**: the batch's pure logic is locked by
  `tmp-rules-harness` (machine-local, 34 cases — ruleIdentity, `asGlobalRules` + the `_global`
  store, `applyProfileImport` global-awareness per §39.7, the `_shared.yaml` bridge, and
  `planReconnect` in [reconnectPlan.ts](src/renderer/reconnectPlan.ts) — F62's eligibility rules
  extracted pure precisely for this) plus the F59 split cases in `tmp-cmd-harness`. The version's
  test plan tags harness-locked items `[auto]`; the React wiring stays the manual pass.

---

## 41. Cross-Platform Support — Windows · Linux · macOS (v0.18.0)

**Supportability audit (v0.18.3).** A pass over all three platforms looking for
things that make a tester's report hard to act on. Two fixes:

- **B252 — an AppImage's own path is a temp mount.** `app.getPath('exe')` is
  `/tmp/.mount_.../usr/bin` there, so "open the install directory" opened a
  folder that disappears on quit. `$APPIMAGE` carries the real path. See
  pitfall #119 — it governs anything resolved relative to the executable.
- **F95 — Help → About reports platform + arch.** "v0.18.3" alone is not
  actionable when macOS is unsigned with no auto-update and Linux may be an
  AppImage. Now `v0.18.3 · macOS arm64`, beside the version so it travels in a
  screenshot. `process.arch` and `isAppImage` joined `platform` on the bridge.

**Verified correct in the same pass** (recorded so they are not re-audited):
scrollbars are styled globally at 12px, which forces CLASSIC scrollbars on macOS
rather than overlay ones — so the panel controls' 18px scrollbar-clearing
offsets are right on all three platforms; menu accelerators all use
`CmdOrCtrl`; the primary modifier is additive (`ctrlKey || (IS_MAC && metaKey)`)
and `formatKeyCombo` refuses `metaKey` so a macro can never bind a Cmd chord the
OS owns; no hardcoded path separators remain; and no user-facing copy assumes
Windows.

**Known gaps, deliberately left to the backlog:** Linux `safeStorage` is
silently unavailable without a keyring (the Add Account wizard warns, but
nothing else does — **F86** Setup Health is the right home), and there is no
diagnostics bundle (**F88**).

**macOS pass over v0.18.4 (B262).** The release's new code is platform-neutral
by construction — no `process.platform` gates, no path building, no
meta/ctrl handling, no lifecycle hooks — which is what pitfall #115 predicts
(the code is usually fine; the defaults and the lifecycle are what assume
Windows). Two things checked and CLEARED: `fmtClock` uses
`toLocaleTimeString`, so a 24-hour Mac correctly shows 24-hour time, and the
computed sun (B254) actually improves the Mac case, since `DEFAULT_RUBY` is
empty there and Mac users are the likeliest to be on direct-SGE.

The one finding was **glyph presentation**: symbol codepoints that are
`Emoji=Yes, Emoji_Presentation=No` render monochrome on Windows but can resolve
through Apple Color Emoji on macOS, where they ignore `color`. The new Teams
header glyph got U+FE0E; **26 pre-existing bare glyphs are recorded but NOT
swept**, because macOS rendering cannot be verified from here and no Mac tester
has raised it — one screenshot of the Lich Setup button decides whether the
sweep is worth doing. See pitfall #125.


### 41.1 Stance

v0.18.0 makes Lichborne cross-platform. **Windows x64 is the stable platform; Linux x64 (AppImage) and macOS arm64 (dmg+zip) ship as labeled BETAS.** The macOS build is deliberately **UNSIGNED** — a free-project decision (no Apple Developer account; the $99/yr Developer ID cert is revisited only if Mac demand proves out). Consequences of unsigned Mac builds, all handled explicitly:

- First launch is blocked by Gatekeeper (macOS 15+ removed the right-click bypass). **CORRECTED v0.18.1 (B238, ohbeanz — the first real Mac tester):** the expectation written here was the friendly *"unidentified developer → Open Anyway"* prompt. What actually happens on Apple Silicon is **"Lichborne is damaged and can't be opened. You should move it to the Trash."** — a dead end with no Open Anyway button, and phrasing that tells the user to delete a perfectly good download. Two causes, both now addressed: **(a)** Apple Silicon requires *every* executable to carry a signature and the kernel refuses an unsigned arm64 binary, but `CSC_IDENTITY_AUTO_DISCOVERY=false` made electron-builder skip signing entirely — so [build/afterPack.cjs](build/afterPack.cjs) now **ad-hoc signs** (`codesign --sign -`) the packaged app before the dmg/zip are built, and FAILS the build if that errors rather than shipping an unrunnable artifact; **(b)** the download carries `com.apple.quarantine` regardless, so the docs now lead with `xattr -cr /Applications/Lichborne.app` instead of an Open Anyway step that may never be offered. **Whether ad-hoc signing alone converts "damaged" into the recoverable Open Anyway prompt is UNVERIFIED** — no Mac here, and CI can build but cannot exercise Gatekeeper — so the docs give the `xattr` route as the primary instruction and a tester has to confirm the rest.
- **Auto-update is OFF on darwin** (Squirrel.Mac refuses unsigned apps): `setupAutoUpdater` returns early, and the menu's Check for Updates answers with a download-from-GitHub notice instead of erroring (main.ts). Windows (NSIS + latest.yml) and Linux (AppImage + latest-linux.yml) auto-update normally. **That notice used to be invisible (B356)** — it went out on `updater-log`, which the renderer only printed to the console, so the menu item appeared to do nothing. It now carries the `[notice] ` prefix and shows as an "Updates" toast (§18.4, Diagnostics).
- When a cert ever lands: add cert + notarytool secrets to the mac CI job, drop `CSC_IDENTITY_AUTO_DISCOVERY=false`, un-gate the darwin updater. Nothing else changes — the zip artifact Squirrel.Mac needs is already published.

### 41.2 Platform detection & defaults

- Main: `process.platform`. Renderer: `window.api.platform` (preload exposes it synchronously) → `IS_MAC`/`IS_WINDOWS` in lichSettings.ts.
- Per-platform `DEFAULT_RUBY`/`DEFAULT_LICH` (lichSettings.ts, single-sourced into profile.ts's shared-profile defaults): Windows keeps `C:\Ruby4Lich5\...`; Linux and Mac have an EMPTY `DEFAULT_RUBY` (a plausible system Ruby would pin users below the Ruby 4 that Lich 5.18+ requires — pitfall #115) and `~/Lich5/lich.rbw`. Discovery fills the Ruby in.
- **Ruby discovery off Windows (B355, v0.19.7).** Candidates, in order: the rbenv shim, concrete rbenv versions newest-first, the asdf and mise shims, Homebrew's KEG paths (`/opt/homebrew/opt/ruby/bin/ruby`, `/usr/local/opt/ruby/bin/ruby` — Homebrew Ruby is keg-only and not linked into `bin/`) ahead of the plain Homebrew bins, then on Linux `/usr/bin/ruby`; **macOS never offers `/usr/bin/ruby`** (Apple's system Ruby is 2.6). Discovery takes the first candidate that reports Ruby 4 or newer (`firstModernRuby`, `ruby -v` per probe, 8s total budget): the silent startup pass saves NOTHING if there is none, and an explicit Auto-detect offers a Ruby 4 when the configured one is older. Windows is unchanged — no `ruby -v` on its silent path.
- **`~`-relative paths are expanded in MAIN ONLY** via `expandHome` (src/main/homePath.ts) at every lichPath/rubyPath consumption point: LichConnection.launch, sqliteReader's lich.db3 derivation, lichDirFrom (maps/scripts/profiles), discovery validation. The renderer can't know the home dir synchronously, so it stores/displays `~` literally. **Rule: a new main-side consumer of these paths MUST expandHome.**
- **Never resolve bare `ruby` from PATH**: GUI apps launched from Finder/the dock (and some Linux launchers) don't inherit the shell PATH that makes rbenv shims resolve — always explicit absolute paths.

### 41.3 Lich discovery (per-platform probe tables)

Probe lists mirror the official install docs (elanthia-online wiki; verified 2026-07-26):

| Platform | Lich probes | Ruby probes (in order) |
|---|---|---|
| win32 | `C:\Ruby4Lich5\Lich5\lich.rbw` | `C:\Ruby4Lich5\<ver>\bin\ruby.exe` newest-first |
| linux | `~/Lich5`, `~/lich5`, `~/lich-5` (`lich.rbw`) | rbenv shim → rbenv versions newest-first → `/opt/homebrew` → `/usr/local` → `/usr/bin` |
| darwin | ditto + `~/Desktop/Lich5` (behind `probeDesktop`) | ditto |

- Both `~/Lich5` casings are probed — Linux filesystems are case-sensitive and the wiki itself mixes the two.
- **`probeDesktop` opt-in**: touching `~/Desktop` fires the macOS privacy consent prompt. Only LichSetupFields' explicit **Auto-detect** passes it; App.tsx's silent startup discovery never does. Keep it that way — a privacy prompt at app launch reads as spyware.
- **Ruby version probe**: discovery runs `ruby -v` (best-effort, 3s timeout) and LichSetupFields warns below 4.0 — Lich 5.18+ hard-requires Ruby 4.0 and the Fedora wiki path installs the 3.x system Ruby (the predictable tester trap). Version-unknown is silent, never an error.

### 41.4 Input & UI conventions

- **Cmd chords are ADDITIVE on Mac, never replacements**: `primaryMod = ctrlKey || (IS_MAC && metaKey)` for QuickSend / Ctrl+Tab / Ctrl+1–9 (App.tsx); Cmd+F for scrollback search (exactly-one-of ctrl/meta, GameWindow). Ctrl variants stay live everywhere — documented Windows muscle memory never breaks.
- **Meta chords are never macro-bindable**: `formatKeyCombo` bails on `metaKey` (macros.ts). Pre-fix, Cmd+C formatted as bare `C`, so a macro bound to `C` would swallow the OS copy chord. No stored combo can contain Meta (the same function records combos), so nothing legitimate is lost.
- Menu: darwin gets `{ role: 'appMenu' }` first (About/Hide/Quit under the app name); other platforms unchanged.
- Fonts: Menlo (mac) / DejaVu + Liberation (linux) appended to the FONT_FAMILIES stacks AFTER the Windows names — Windows rendering byte-identical.
- Linux keyring: `secure-storage-available` IPC (safeStorage.isEncryptionAvailable) → AddCharacterWizard disables "Remember password" with an explanation when no secret service exists (GNOME Keyring/KWallet). Windows/mac are always true.

### 41.5 Packaging & release pipeline

- package.json: `build.mac` (dmg+zip, **arm64 only** — add x64 if an Intel-Mac tester appears) and `build.linux` (AppImage x64), each with an explicit `artifactName` template pinned to `PLATFORM_ARTIFACTS` in `.github/scripts/release-verify.mjs`. `build/icon.png` (512, upscaled from the ico's 256 frame) feeds mac/linux icons — a crisp ≥512 source is an open polish item.
- `.github/workflows/release.yml`: manual-only (workflow_dispatch); prepare (validate notes + pre-create ONE draft) → 3-OS build matrix (`CSC_IDENTITY_AUTO_DISCOVERY=false` — no signing anywhere today) → verify (all seven artifacts in one draft + notes refresh). Same draft/Publish/tag semantics as publish.mjs, which remains the untouched local Windows-only fallback. `ci.yml` = Check zero on every push/PR.
- **Lockstep rules**: a matrix entry ↔ its `EXPECTED_PLATFORMS` token; artifact names ↔ `PLATFORM_ARTIFACTS` + publish.mjs's `expected` list. (Also recorded in CLAUDE.md's release section.)

### 41.6 What stays platform-agnostic (verified in the v0.18.0 sweep)

The whole game pipeline (sockets/parser/renderer), profiles (userData paths), safeStorage key handling, session logs, `shell.openPath`/`openExternal`, the single child-process spawn (Lich launch — POSIX-clean; `resolveRubyw` only rewrites `ruby.exe` suffixes so Linux/Mac interpreters pass through verbatim), and the darwin lifecycle handlers (`window-all-closed`/`activate`, which predated this work). GTK Lich scripts are native on Linux, Homebrew-supported on Mac — better off than Windows historically was.

---

## 42. SimuCoin Claim (F71, v0.18.0)

### 42.1 What and why

Simutronics gives subscribers a **monthly free-SimuCoin allotment that must be manually claimed** on store.play.net — easy to forget, so players lose coins they're owed. The community reference is [Thires' SimuCoins](https://github.com/Thires/SimuCoins), a Genie plugin doing the same job; Lichborne implements the mechanism natively.

**Principles check:** it does NOT duplicate Lich (Lich is a game proxy — it has no web-store surface, and this needs none of its machinery); it's account-adjacent convenience in the launcher/profile family; and it works identically with or without Lich (Principle #2 — it never touches the game socket).

### 42.2 Flow (verified 2026-07-26 against the reference plugin)

An authenticated **HTML scrape** of store.play.net, all in MAIN:

1. `GET /Account/SignIn?returnURL=%2FAccount%2FSignIn` → scrape the `__RequestVerificationToken` hidden field
2. `POST` the same URL with `__RequestVerificationToken` / `UserName` / `Password` / `RememberMe=true`
3. `GET /store/purchase/dr` → the **SIGN OUT link is the authoritative signed-in check** (more robust than matching a redirect URL); scrape the balance, a `Subscription Reward: (\d+) Free SimuCoins` offer, or the countdown text
4. When claiming: `POST /Store/ClaimReward` with `game=DR` → parse `Claimed (\d+)` + the refreshed balance
5. Always `GET /Account/SignOut`, then wipe the cookie jar

**Cadence: once per app launch, then on demand.** Deliberately NO background polling — repeated automated logins are the posture most likely to look like abuse. **Claiming is per-account opt-in** (`autoClaim`), default **ask**: coins found → the coin icon lights up → the user clicks. A plain check never acts on the account.

### 42.3 Architecture

- **All network work in main** ([src/main/simucoin/](src/main/simucoin/)) — the AI-adapter rule: the password never crosses IPC (the renderer names an ACCOUNT; main pulls the credential from `passwords.ts`/safeStorage itself), the renderer never sees store HTML, and a renderer `fetch` would be CSP-blocked anyway. Only `SimuCoinStatus` crosses back.
- **Cookies AND cache:** an **in-memory** Electron partition (`session.fromPartition('simucoin', { cache: false })`, no `persist:` prefix → never written to disk), reset via `resetJar()` (cookies **+ `clearCache()`**) before every attempt and after every run, with `Cache-Control: no-cache` on every request. Requests go through Electron's `net` (Chromium stack: real cookie handling, proxy support, HTTPS validation) with a whole-request timeout. **`cache: false` is load-bearing, not hygiene (B229):** ASP.NET pairs the sign-in form's `__RequestVerificationToken` FIELD with a matching COOKIE, and a partition's HTTP cache is storage that `clearStorageData({storages:['cookies']})` does NOT touch — so a cached sign-in page served a **stale token against a fresh cookie** and the second account of a session was rejected. Never let the token GET be cacheable.
- **One automatic retry on `auth-failed`** against a fully reset jar (B229) — the user's own successful "click try again", automated. Bounded to one extra attempt (a wrong password must never become a retry storm against Simutronics' login) and **cannot double-claim**, because `auth-failed` returns before any claim POST. A second rejection is reported as a real credential problem, not a transient one.
- **In-flight guard** (`inFlight` map, per account): two windows — or a click racing the startup pass — must never run two sign-ins, let alone two claim POSTs, for one account.
- **Multi-account runs are SEQUENTIAL** (startup pass and `/simucoin` alike): parallel store logins are rude and racy.
- **[constants.ts](src/main/simucoin/constants.ts) is the ONLY file that knows store HTML.** A store redesign is a one-file fix. `parseNextAt` is deliberately conservative (only clear day/hour counts) — **never invent a schedule**, because a wrong "next claim" hides the icon while coins ARE waiting, the worst failure this feature has.

### 42.4 Failure posture — go quiet, never guess

Every failure resolves to a status, never an exception: an unrecognized sign-in page, a rejected login, a store outage, or a claim POST that doesn't confirm. A claim that can't be confirmed reports **still-claimable** rather than a false success. The startup pass suppresses failure TOASTS (`quiet`) — a store outage must not greet the user with an error they didn't ask for; the reason still shows in the coin popover.

### 42.5 UI & consent

- **Coin button in the AppBar** ([SimuCoinButton.tsx](src/renderer/components/SimuCoinButton.tsx)) — app-level, because an allotment belongs to an ACCOUNT, not a character (pitfall #57's converse: a per-session component must not own account state). **Quiet by default (UX standard #1): it renders NOTHING when no account is opted in or offerable** — no dead icon for players who don't use this.
- **The coin is a drawn SVG object, and there is ONE artwork with two states.** A struck **copper/bronze** face (rim → radial face → bevel ring → struck "S" → static glint → a sweeping specular band). Colors are **baked, not theme vars** — it depicts an OBJECT, the same Principle #4 exception as the map tiles and the moons' lore colors — with ONE exception: an outer `.sc-coin-ring` mixed from `--text-primary`, so a fixed-palette object still keeps a visible edge on any theme. **Nothing to claim ⇒ the SAME artwork under a light `grayscale`**, never a second palette, so the two states can't drift; a claim then *brightens* the coin (400ms transition) instead of swapping an icon. Claimable adds full colour, a breathing glow, and the sweeping sheen; busy spins it. **Every animation is dropped under `:root[data-epilepsy-safe='true']` while the COLOUR is kept** — the colour is the signal, the motion is decoration. Sized in `em` so it tracks the game font (never `rem`, pitfall #45), and its def ids are `useId`-namespaced (pitfall #95).
- **Retuned in v0.19.0 (B272), and the reasoning generalises.** It shipped as minted GOLD dulled to `grayscale(.85) brightness(.78)` at `opacity: .55`, which measures **2.36** contrast against a dark app bar and **1.34** against Classic Light — and that is the state it wears nearly all the time, since the button renders whenever an account is eligible, not only when coins wait. Two things were wrong. **The hue:** gold's value sits close to a light theme's background and its desaturated form close to a dark one's, so it had no reliable separation at either end; copper (`#bd6f38`) is a mid-tone that stays warm against both families, and the accent used by the ready border, tint, glow and badge moved with it so the button reads as one object. **The dulling:** the loud/quiet distinction is already carried by that chrome, so the coin only ever needed to read as *dormant* — UX standard #1 removes NOISE, it does not hide controls. Now `grayscale(.4)` at `opacity: .9` with brightness untouched, since lowering brightness is precisely what killed it on dark themes. Measured **3.58 / 3.04** after, both clear of the 3:1 non-text floor.
- **Consent is per account, shown on the surface that enables it** (the AI-consent precedent): the disclosure names exactly what is sent (the saved account password, over HTTPS, to store.play.net), that nothing goes anywhere else, and that no store data is written to disk. **Nothing touches the network before that opt-in.** An account with no saved password is never offered (there's no other credential source).
- **Config** ([simucoinConfig.ts](src/renderer/simucoinConfig.ts)): `{ consented, autoClaim, lastBalance?, lastCheckedAt? }` per account, the two flags default false → `SharedProfile.simucoin` → `_shared.yaml` (Principle #1). Optional field, non-breaking, **no migration**. Deliberately NOT a Transfer category (machine-local + credential-gated — the `ai`/`automationStats` precedent). Both the loader and `importSharedProfile` coerce each entry, so a hand-edited YAML can't yield a half-shaped record that reads as consented.
- **Slash surface** (Principle #11): `/simucoin` (bare = status) · `check` · `claim`, aliases `/sc`, `/simucoins`, plus a `NOUN_HELP` line. A **bare+verbs noun** — covered automatically by the registry-derived `NOUNS_WITH_VERBS`; its bare form takes no args, so the palette rule holds. Executors are synchronous while a run is a store round-trip, so they report only whether it **started**; results arrive as a toast + the popover.

### 42.6 Reporting an async result from a synchronous executor (B234)

Slash executors are synchronous; a SimuCoin run is a network round-trip. The first cut let the executor return only "started" and pushed the outcome to a toast + the coin popover — so `/simucoin check` printed "Checking the SimuCoin store…" and never answered the question it exists to answer.

The shape now, and the one to copy for any future async slash command:

- The App-owned runner **resolves with the result** (`runSimucoin` → `SimuCoinStatus | null`). The caller must NOT read the value back out of React state — the `setState` that stores it has not committed when the promise resolves, so a read-back formats the *previous* run.
- GameWindow appends the result through **`emitClientLines`**, a small helper that writes `internal-system` lines and logs them to `[sys]` — the same treatment a synchronous slash result gets, so async output is indistinguishable from sync output.
- **One formatter** (`simucoinRowText`) serves both the async report and the bare `/simucoin` status readout. Two copies is how the same state ends up described two ways.
- Results append **per account as each settles**, not batched — the runs are sequential by design (pitfall #101), so batching would show nothing for several seconds.
- The interim line says results FOLLOW ("results appear here when each account finishes…") rather than implying it is the answer.

### 42.7 Not done / open

- **Only DR is claimed** (`game=DR`) — correct for a DragonRealms client; a GS player with a shared account would need a game selector.
- **No persisted next-claim date** — main's cache is per-process, so a restart re-checks. Honest and simple ("checked once per launch"); persisting `nextAt` would let us skip launches, at the cost of hiding the icon if the estimate is ever wrong.
- **Never run against the live store from this codebase** — the flow is verified pattern-level against the reference plugin, not end-to-end. First real-account run is a tester step (test plan).

### 42.9 Last-known balance (F100, v0.18.6)

The store balance was already scraped on every check and already carried on `SimuCoinStatus` (`balance`, `checkedAt`) — used for the claim toast, then discarded. F100 surfaces it. **No new network work**: same once-per-launch check, no polling, no extra sign-in.

**Persistence.** Main's `lastStatus` is an in-memory `Map`, so a restart forgot everything and Settings read "Not checked yet" until the launch check finished. `lastBalance` / `lastCheckedAt` now ride the per-account config into `_shared.yaml` — already per-account, already app-wide, already excluded from Profile Transfer as machine-local credential-gated data. Optional fields, so old `_shared.yaml` loads unchanged and there is no migration. This partly answers §42.7's "no persisted next-claim date": the *balance* persists now, the next-claim date still doesn't.

**Recorded at ONE choke point.** `App.runSimucoin` is where every route converges (startup pass, the coin's Check now, `/simucoin`), so `rememberBalance` is called there and no call site does its own bookkeeping.

**Honesty rules — this is the §42.4 posture applied to a number:**
- `rememberBalance` **no-ops on a failed check**, so an outage keeps the previous figure *and its real age* rather than blanking it or — worse — stamping a fresh timestamp onto a stale reading.
- **The age is never optional.** A bare balance reads as "now". Every surface pairs it with a RELATIVE age ("checked 2 hours ago"), which answers "is this current?" directly where a clock time makes the reader do arithmetic. Same reasoning as the Moons footer always showing data age.
- **Unknown renders nothing**, never a placeholder dash (UX #1).
- **Revoking consent drops the cached balance** — data about an account the user just said to stop touching.

**ONE coerce, shared.** `coerceSimuCoinConfig` is used by BOTH readers — `loadSimuCoinConfig` (localStorage) and `importSharedProfile` (`_shared.yaml`, at every launch). It is a shared function because it was duplicated and the duplicate ate the new fields: `importSharedProfile`'s inline copy rebuilt each entry as `{consented, autoClaim}`, so the balance persisted correctly and was then stripped on the next startup — the persistence half of this feature, silently defeated. It also restated the type inline, so `tsc` could not see the drift. Pitfall #121 compounded by #127. **Do not re-inline it**, and when adding a field to `SimuCoinAccountConfig` remember there are three places that must follow: the interface, this coerce, and any `Partial<…>` at a write path (Settings' `setSc` had a restated one).

**Two surfaces, one formatter.** `simucoinBalanceText` / `fmtCoins` / `fmtCheckedAgo` live in simucoinConfig.ts so Settings and the coin cannot drift — the B234 lesson that produced `simucoinRowText`.
- **Settings** owns the per-account view: a second, quieter line under the state line. The state line is *what needs doing*; this is *what you have*. Two lines rather than one sentence because they answer different questions and a merged sentence is unscannable down a list of accounts.
- **The coin popover** gets ONE aggregated line that never grows with the roster (pitfall #109 — a roster-sized popover is the B235 defect that forced this surface's rewrite). Only accounts with a KNOWN balance are summed; when that isn't all of them the line says "across 2 of 3 accounts" rather than passing a partial total off as complete. **The age quoted is the OLDEST reading in the sum** — the honest bound on how current a total is; quoting the newest would overstate it.
- A cross-account total is a convenience, not a wallet — coins are not spendable as one pool. Settings' per-account figures are the unambiguous view.

Both surfaces use `font-variant-numeric: tabular-nums` so a column of balances aligns and the figure doesn't reflow between checks.

### 42.8 Surface split — Settings owns setup, the coin owns the action (F75, v0.18.1)

**The decision.** Setup and action are different jobs on different clocks: opting an account in is a
one-time, read-carefully act; collecting coins is a recurring one-click act. v0.18.0 put both in the
app-bar popover, which broke at scale — JadedSoul's 7 accounts produced a popover several screens tall
(B235), because it rendered one block per account *including a full copy of the consent disclosure each*.

- **Settings → SimuCoins owns the LIST.** Per-account enable, auto-claim, Check now and live status, with
  the §42.3 disclosure rendered ONCE directly above the toggles that act on it — so consent still appears
  on the surface that enables it (the AI-section shape). Hidden entirely when no account has a saved
  password, and it states how many accounts were skipped and why. A modal is the right host for a list.
- **The coin popover owns the ACTION and is roster-INDEPENDENT.** One summary line plus full-width
  **Collect available coins** / **Check now** / "Set up in Settings…" — the same size at two accounts or
  twenty. This second constraint came from Sekmeht after seeing the interim two-account version:
  *"I'm just concerned that there could still be a ton of listed accounts and it cause the window to be
  inconsistent."* Bounding a popover is necessary but not sufficient (pitfall #109) — a surface that is
  two rows for one user and full-height for another still reads as inconsistent, so the fix is to make its
  size independent of the data, not merely capped.
- **Discovery is preserved.** The coin still renders for accounts that COULD be enabled — that is how
  anyone learns the feature exists — but it now POINTS at setup instead of hosting it.
- **Honesty:** the summary shows the soonest `nextAt` only when the store supplied one; per §42.4 it never
  invents a date.

**Mechanics worth keeping.** `simucoinStateText` and `SIMUCOIN_DISCLOSURE` are single-sourced in
[simucoinConfig.ts](src/renderer/simucoinConfig.ts) so no two surfaces can describe a state — or the
password promise — differently (the B234 lesson). Settings is per-session and the coin is app chrome, so
"Set up in Settings…" crosses that gap with a `lichborne:open-settings` DOM event carrying a section name,
answered only by the ACTIVE GameWindow (pitfall #57, the `lichborne:session-action` shape); Settings
scrolls to it through its existing F61 `sectionRefs`. Settings is now the sole config writer and must do
all three of `saveSimuCoinConfig` + `scheduleSharedProfileSave()` + dispatch `SIMUCOIN_CHANGED_EVENT` —
the last because a `storage` event never fires in the window that wrote, so the coin would otherwise keep
offering to set up an account you had just enabled. Principle #11: the three `/simucoin` error strings
point at Settings. No profile-shape change — still `SharedProfile.simucoin`.

---

## 43. Modal Chrome Unification (v0.18.0)

### 43.1 Decision

**There is ONE modal look across the client — the About Lichborne chrome — and every dialog wears it** (Sekmeht, 2026-07-27, after the launcher restyle: *"I loved the work you did with the logon screen… can you do the same for Automations / Contacts"*). Dialogs that each look slightly different make a well-built client read as assembled rather than designed. [about.css](src/renderer/styles/about.css) is the reference implementation.

This is the **second half of a unification deferred since v0.11.2**. That release shipped the SAFE slice — the `--modal-w-standard` / `--modal-h-standard` SIZE tokens — and explicitly held back the chrome (background / header / backdrop / close-button) because changing a shared surface risks the light-theme regressions of pitfall #55. v0.18.0 proceeds with that risk managed by a per-dialog audit (43.4).

### 43.2 The tokens

The recipe lives in `:root` in [global.css](src/renderer/styles/global.css) so retuning the house look is one edit:

| Token | Role |
|---|---|
| `--modal-bg` / `--modal-border` / `--modal-radius` / `--modal-shadow` | the dialog surface |
| `--modal-scrim` | the backdrop wash |
| `--modal-head-bg` / `--modal-head-border` / `--modal-head-color` | the accent-tinted header band + its title |
| `--modal-ctl-hover` | neutral hover for header controls (deliberately NOT more accent — accent-on-accent inside a tinted band muddies it) |
| `--modal-input-bg` | field fill on a modal surface (see 43.4) |

**A dialog opts in by USING THE TOKENS, never by copying about.css's literals** — a copied literal is a dialog that silently stops matching the next time the house style moves.

### 43.3 The visual grammar

- Title in `--modal-head-color` on the accent band; a rounded ~1.7rem close button that lights on hover.
- Tab bars are accent **chips**: pill radius, accent tint + accent hairline when active, transparent with a neutral hover when not (`.at-tab`, `.cp-tab`).
- **Only the TOP-LEVEL header is an accent band.** Section labels inside the body stay small/uppercase/muted — make them accent too and the hierarchy flattens. Both the launcher's account panels and the Automations sub-panels follow this.
- The chrome also applies to **inline panels that read as cards** (the launcher's account/Favorites blocks), not only floating dialogs. In `.launcher--compact` the panel chrome is suppressed, because the containing modal already draws the identical surface and hairline — two identical frames 16px apart read as an accidental double border.

### 43.4 Converting a dialog — the three obligations

1. **Re-read its inner elements.** Their contrast was tuned against the OLD surface. On light themes `--bg-app`/`--bg-base`/`--bg-input` collapse (Classic Light makes all three `#ffffff`), so fields, dividers and "raised" children can vanish. `--modal-input-bg` exists precisely because a bare `--bg-input` field on a `--modal-bg` surface is a framed void on Classic Light. **This has bitten twice** — the v0.9.2 wizard tiles, and v0.18.0's Edit Profile fields, the latter *in the same changeset that wrote the warning*.
2. **Eyeball it on a light theme.** Classic Light is the harshest case.
3. **Check the class prefix is unique first.** Two components sharing a prefix are compatible only by luck until someone restyles one. Triggers and the Theme Picker both used `.tp-` and both declared `.tp-modal`/`.tp-header`/`.tp-title` with the same properties — restyling Triggers would have silently restyled the Theme Picker, with bundle load order deciding. Triggers was renamed to **`.trg-`** in v0.18.0 (the fix pitfall #55 had recommended for years); `.tp-` is now exclusively the Theme Picker's.

### 43.5 Status

**Converted:** About (reference), Edit Profile (`.cne-`), the launcher's account/Favorites panels, the whole Automations family (`.at-` shell + `.hp-` highlights/mutes/substitutes, `.trg-` triggers, `.ma-` macros/aliases, `.gm-` groups), Contacts (`.cp-`).

**Completed in v0.19.7 (B400):** Panel Manager (now the Layout Manager), Settings, the Lich Dashboard, the Session Log, the Theme Picker/Editor, the Import Wizard, Profile Transfer, the Add Account wizard / Lich Setup, Quick Send, AI Consent, the Experiences shelf and the Maps overlay.

The v0.18.0 caution against a big-bang sweep still applied:
- The work was split by file across eight parallel fixers.
- Each fixer did the inner-element audit for its own dialogs.
- Every converted dialog is on the test plan's Classic Light list rather than assumed correct.

The controls inside the dialogs moved onto shared primitives at the same time (43.7).

---

### 43.6 Character tabs adopt the chip treatment (v0.18.0)

The app-bar character tabs were the last high-traffic surface still on pre-house styling, and they read as flat: `:hover` and `--active` both set `background: var(--bg-base)`, so the active tab and a hovered one were **pixel-identical** and the only real cue was `font-weight: 600`.

They now wear the house accent chip — `accent 13%` fill, `accent 30%` hairline — the same recipe as `.at-tab--active` and the About modal tab bar. Three decisions worth keeping:

- **Treatment, not silhouette.** The chip normally comes as a pill; the tabs keep their pre-v0.18.0 rounded-top shape (Sekmeht). A surface can adopt the house treatment while keeping a shape that suits its role — the accent vocabulary is what makes the client feel coherent, not the corner radius.
- **Hover excludes the active state** via `:not(.character-tab--active):hover`, because `:hover` (0,2,0) outranks `--active` (0,1,0) and would otherwise replace the chip on contact — pitfall #107.
- **The name stays `--text-primary`.** `.character-tab-health.health-warn` is already `var(--accent)`; an accent label would blur into the health readout. The accent lives in the fill and hairline where nothing competes.

The tab and its six children also moved `rem` → `em`, each converted to render byte-identically at the default 12px game font (`em = rem × 16/12`). `.app-bar` anchors `font-size: var(--game-font-size)` and B178's collapse thresholds are em against it, so the tabs were the one part of the bar ignoring the font setting while the bar reflowed around them (pitfall #45).

**Verified rather than eyeballed:** the chip was computed against all 21 built-in themes (composited over `--bg-raised`, the harder end of the bar gradient) — label contrast ≥ 6.17:1 everywhere, accent hairline perceptible everywhere, Barbarian the faintest (fill 1.05, hairline 1.14) because its accent sits close to the bar in luminance. That is inherent to the recipe, so the Automations tabs are equally subtle there; it is consistency, not a regression. Geometry was swept at font sizes 8→24: labels scale 9.06→27.19px, nothing clips the strip (`overflow-y: hidden`), and the active/inactive tabs keep identical heights and a shared baseline.

**Rejected: the folder attachment.** An attach-to-the-edge look was built and measured landing exactly (active tab bottom = bar bottom, unclipped, shared baseline) — then reverted. The strip is `overflow-x: auto` with a 5px scrollbar; as soon as enough characters are open to overflow, that scrollbar claims the strip's bottom edge and lifts every tab off the border. The attachment would break precisely when a player has the most tabs open, which is the worst failure timing. Don't re-attempt without solving the overflow case first.

### 43.7 Shared primitives and the control vocabulary (v0.19.7)

The v0.18.0 tokens unified the *surface* of a dialog. The v0.19.7 UI/UX audit (B367–B410) found almost everything *inside* the surface still hand-rolled per dialog:
- about eight primary-button looks and seven tab styles;
- two input fills;
- close buttons in six styles and two glyphs;
- six different "are you sure?" patterns;
- no editor that knew whether its draft had been saved.

Four pieces of shared machinery replace them.

**1. Control classes: [ui.css](src/renderer/styles/ui.css).**
- **Controls:** `ui-btn` (plus `--primary`, `--danger` and `--ghost`, each combinable with `--sm`), `ui-close`, `ui-field` (plus `--code`), `ui-tabs` / `ui-tab`, `ui-section-label`, `ui-hint` and `ui-empty`.
- **Dialog skeleton:** `ui-modal-backdrop` → `ui-modal` → `ui-modal-head` / `ui-modal-title` → `ui-modal-body` → `ui-modal-foot`.
- **Tokens:** a dialog type scale (`--modal-title-size`, `--modal-text-size`, `--modal-label-size`, `--modal-hint-size`) and dialog paddings, plus `--radius-sm` / `--radius-md`, `--popover-shadow`, `--ui-transition` and `--code-font-family`.
- **Globals:** checkboxes and radios take `accent-color: var(--accent)` everywhere, and `--color-warning` joined `--color-danger` / `--color-success` in darkBase.

- **Load order is part of the design.** ui.css is imported FIRST in main.tsx, ahead of App and therefore ahead of every component stylesheet. That lets a component rule of equal specificity refine a primitive instead of losing to it. global.css loads after App, as it always has. Importing ui.css from global.css would make every primitive override every component rule it ties with.
- The classes are rem-sized app chrome. In-game panels, which scale with the font setting, keep their own em-sized controls (pitfall #45).

**2. One confirm: [confirm.ts](src/renderer/confirm.ts), [ConfirmHost.tsx](src/renderer/components/ConfirmHost.tsx) and [InlineConfirm.tsx](src/renderer/components/InlineConfirm.tsx).** There are exactly two shapes.
- **`confirmAction()` / `confirmDelete(kind, name)`** is a themed dialog at the confirm tier (2080).
  - It covers any destructive action on something that is not already open in an editor: a row ✕, Reset to defaults, Rebuild, a bulk remove, clearing a key.
  - A danger confirm focuses Cancel, so a reflexive Enter destroys nothing. Esc and a backdrop click cancel.
  - It is a module queue read through `useSyncExternalStore` with a cached snapshot (pitfall #129), mounted once per window beside ToastHost.
- **`InlineConfirm`** is the two-step button for the item already on screen: an editor's own footer Delete, or a running script's Kill.
  - Once armed it shows the question plus [Delete] [Cancel], with focus on Cancel.
  - Esc disarms it without closing the dialog underneath.
  - Game-area hosts pass their own em-sized button classes.
- `window.confirm` is gone from the renderer. It freezes the whole window and ignores the theme, which is why `window.alert` was already banned.

**3. The unsaved-changes guard: [useUnsaved.ts](src/renderer/hooks/useUnsaved.ts).**
- **In an editor:**
  - It keeps a baseline beside its draft and computes `dirty = differs(draft, baseline)`. The comparison ignores key order and undefined values.
  - It guards its own selection switches with `confirmDiscard(dirty, …)` and reports upward with `useReportUnsaved(dirty)`.
- **In a container dialog** (Automations, Contacts, the Lich Dashboard…), a `useUnsavedScope()` routes close, Esc, the backdrop and tab or scope switches through `scope.guard()`.
- The prompt reads "Discard unsaved changes?", with **Discard changes** / **Keep editing**.

**4. Focus follows the dialog stack: [useEscapeClose.ts](src/renderer/hooks/useEscapeClose.ts).** The Esc stack (pitfall #141) already knows when the first dialog opens and the last one closes, so it now owns focus too.
- **Opening the first live dialog** blurs a covered command input (`.command-input`, `.ov-inputbar-input`). Enter can no longer reach the game from under a dialog (B375).
- **Closing the last dialog** hands focus to the registered home when focus was left nowhere or in the app bar (B376). The home is the Overview's input bar in the Overview, otherwise the active command bar. App registers it through ConfirmHost's `homeFocus` prop.
- **A confirm** hands focus back to whatever held it when the confirm opened — but only when the confirmed action left focus nowhere. That action often focuses something itself (a "+ New" focusing its name field), and restoring unconditionally stole focus back from it a frame later. A queued second confirm inherits the first one's return target, since the button the first would have returned to is about to be removed.

**The control vocabulary (B407).** Every label follows these rules.

| Rule | Detail |
|---|---|
| Case | Buttons, menu items, tabs, field labels and titles use sentence case. Feature names keep their capitals: Lich Dashboard, Automation Analytics, Quick Send, Team Login, Layout Manager, Session Log, Spell Monitor, Moons, Overview. Write section labels in sentence case even when CSS uppercases them. |
| Ellipsis | Use "…" only on a control that opens another dialog or picker where you still have to act before anything happens. Icon toolbar buttons are the exception and take no "…" even when they open a dialog (the launcher's Team Login, Attach, Transfer and Lich Setup), following the usual toolbar convention (Sekmeht, 2026-09-15). |
| Verbs | **Delete** permanently destroys saved data and is always confirmed. **Remove** takes something out of a place it can be put back (a tab, a window, a team member) and needs no confirm. **Clear** empties text or a field. **Reset** returns settings to their defaults and is confirmed. **Revert** discards edits to an existing item. **Kill** stops a running script. |
| Dismissing | The ✕ is U+2715 with `title="Close" aria-label="Close"`. A footer dismiss says **Close** when nothing is pending and **Cancel** when it abandons an edit or operation. Never use "Done" for a plain dismiss. |
| Creating | Write "+ New *thing*", naming the thing: + New highlight, + New trigger, + New contact, + New team. |
| Footer order | [destructive] …spacer… [Cancel] [Primary]. |
| Disabled | A disabled button's `title` says why ("Enter a pattern to save"). |
| Tooltips | A tooltip adds a fact the control doesn't already show and never repeats the label (UX #8). |
| Confirms | `confirmDelete` titles read "Delete *kind*?", with a **Delete** button. The inline form asks "Delete this *kind*?". |
| Context menus | Content actions come first (Copy, Modify Text ▸, Trigger ▸, Show in Log), then a divider and the view toggles (Timestamps), then a divider, **Clear**, and **Close** last. In launcher menus the destructive items go last, after a divider. |

## 44. Connect Feedback & QuickSend Targeting (v0.18.0)

### 44.1 Connect progress — why a separate channel

`ConnectionManager` has always emitted a running commentary (`this.emit('status', …)`), and `wireSession` forwards it to the renderer as a `connection-status` event **keyed by sessionId**. During LOGIN that keying is useless: `ipcMain.handle(CH.LOGIN)` is an invoke that resolves at the END, so the renderer has no sessionId while the connect is happening and every message was dropped. The user saw only a spinner — including through a 30-second Lich wait, which is indistinguishable from a hang.

**`connect-progress`** (v0.18.0) mirrors those same messages to the CALLING window keyed by **character**, for the duration of the login only (attached before the try, removed in a `finally`). The renderer keeps the latest message per character and renders it under the headline in both the single-connect and bulk overlays.

**Message design:** plain-language numbered stages so the user can see where they are.

| # | Lich (`LICH_STEPS` = 5) | Direct (`DIRECT_STEPS` = 4) |
|---|---|---|
| 1 | Contacting Simutronics login (eaccess.play.net) | same |
| 2 | Signing in to your account | same |
| 3 | Getting the login key for *character* | same |
| 4 | Starting Lich | Connecting to DragonRealms (host:port) |
| 5 | **Connecting to Lich on port N** | — |

Past ~10 seconds step 5 becomes **diagnostic** ("check your Ruby/Lich paths or antivirus") rather than counting silently to the 30s cap, because that's the actual failure mode.

**Two things this table encodes, both of which were wrong on the first cut (B233).** The prose above USED to read "Lich is 4 steps" while listing five — the code matched the prose, emitting five phases numbered 1, 2, 2, 3, 4 with step 2 reused for two different operations. The totals now live in `LICH_STEPS`/`DIRECT_STEPS` with a `step(n, total, text)` helper, so no site can drift from the count; the strings were hardcoded at ten sites before, which is how it went unnoticed. And step 5 is **named as the connect it is**: `connectWithRetry` does not poll-then-connect, it retries the REAL connection until the port accepts and that first success IS the session socket — so labelling the whole phase "waiting" meant the client never told the user it was connecting to Lich at all. The direct path went 3 → 4 steps so both paths share the same first three phases rather than describing identical work differently.

**Removed and don't re-add naively:** a "waiting for another character's Lich" queue notice. It cannot fire from bulk connect (the renderer `await`s each login, so nothing ever queues in `serializeLichLaunch`), and in the rare overlapping case the concurrently-running SGE auth emits its own step a moment later and overwrites it — leaving the UI on a stale step for the whole silent wait, i.e. the problem it was added to solve. Making it work requires emitting from INSIDE the queue wait, after auth settles.

### 44.2 Connect dialogs

Every connect-family surface now wears the canonical modal chrome (§43) with a real head/body/foot structure (`.launcher-dialog*`), replacing per-dialog inline styles: connecting overlay, bulk progress (per-character step + progress rail + "N of M"), Bulk Connect result, account-conflict prompt, reconnect chooser, the wizard's conflict prompt, and the launcher's delete confirm. Button variants (`--primary`, `--danger`) replaced four separate inline colour overrides.

**The progress card is FIXED width and reserves two lines for the step.** A live message whose length changes every few seconds ("Starting Lich…" → "Still waiting for Lich… (14s) — check your Ruby/Lich paths or antivirus") visibly grew and shrank a content-sized card. Pinning BOTH axes is the point — pinning only width trades a horizontal jump for a vertical one. `.launcher-dialog` is declared after `.launcher-connecting-card` at equal specificity and overrides the width; **don't reorder those blocks** or the dialogs snap to the narrower progress width.

**Result dialogs state the OUTCOME, not the event** — "Connected 2, 1 failed", not "Bulk Connect finished" — with ✓/✕ rows whose hues are blended toward `--text-primary` so they survive light themes.

### 44.3 QuickSend targeting model

Was single-select, defaulting to "the next connected character after the active one" — which made the common case (tell the whole team something) a two-step and buried broadcast at the bottom of a dropdown.

**Now: a checkbox list, defaulting to ALL connected characters** (Sekmeht, 2026-07-27).

- **"All" is NOT a stored sentinel — an EMPTY `selected` set IS all-mode.** One source of truth; All and the individual picks are mutually exclusive by construction rather than by bookkeeping, and there is no reachable "nothing selected, nothing sent" state.
- **Exactly one character connected ⇒ no picker.** It's shown as the target statically. "All characters" would be that same character under a second name, and a checkbox that can't meaningfully be unticked is noise (UX standard #1).
- **A picked character that DISCONNECTS is called out, not pruned.** Pruning to empty would silently promote the user to a broadcast; instead the hint says the picks are gone and Send stays disabled. Selection is keyed by `characterId` and sending by `sessionId`, so a disconnect+reconnect (which mints a new sessionId) still resolves.
- The hotkey gates on **connected characters**, not open tabs — `sessions` includes disconnected ones, so a single dead tab used to open a modal that could only say "No connected characters".

**Known behaviour change, deliberate:** the prefill is lifted from the ACTIVE character's command bar and all-mode includes that character, so a broadcast now also goes to the source (the old default excluded it by construction). That follows from "default to all"; revisit only if testers find it surprising.

---

## 45. Performance Audit — findings & structure (v0.18.0)

A full sweep of the three layers where this client actually degrades: the renderer per-line hot path, the main process, and continuously-running CSS. The four load-bearing structures documented in CLAUDE.md pitfall #82 were re-verified; three of them held, one had eroded.

### 45.1 The headline was not a slowdown

The most serious finding was a **correctness** bug in the perf machinery itself: `extractRegexLiteral` treated `.` as a literal, so any highlight or trigger whose pattern contained an unescaped dot was gated out and **silently never fired** (B230, pitfall #104). Shipped v0.13.4 → v0.18.0. The lesson is structural: a pre-filter that is too LOOSE only costs speed, but one that is too TIGHT breaks the feature, invisibly. The agreement check that catches this class (`tmp-perf/check-literals.mjs`) is machine-local and must be re-run whenever the walker changes.

### 45.2 Main-process blocking — the highest-severity perf class

Main is single-threaded and owns **every** session socket, so any synchronous work there stalls all connected characters at once and then delivers a burst. Two real cases, both measured:

- **Session-log read handlers** (`search`, `list-streams`, export) gunzipped and split whole day-files synchronously — **2.9–3.4s of blocked main** over one tester's 23 day-files. Now `async` with a `yieldToLoop()` between day-files (the shape `buildCatchupDigest` already used), plus a per-day stream-set cache keyed on path+mtime+size, since a closed day-file is immutable and the Export builder re-scans on every date-range tweak.
- **The trigger `log` action** did an `existsSync` + full open/write/close **per matching line**, ~500µs of blocked main each. Now buffered on the same 1s/100-record cadence the session log uses (2000 lines: ~1015ms → ~0.5ms).
  - **Where the files go (B352, v0.19.7):** `{userData}/TriggerLogs/<name>`, in dev and packaged builds alike. It used to write beside the executable — inside the read-only mount on a Linux AppImage (every line silently dropped), inside the `.app` bundle on macOS, and into the install directory on Windows, the last two wiped by every upgrade (pitfall #3). TriggerLogs is top-level, not under `Logs/`, whose subfolders are per-character session-log folders. The name is user-authored and `$var`-interpolated, so `safeTriggerLogName` keeps the last segment after EITHER separator (a `\` survives `path.basename` off Windows), replaces control characters and the Windows-forbidden set with `_` (a `:` would otherwise write an NTFS alternate stream), and refuses an empty or all-dots name. The Triggers editor tells the user where the files land.

**The rule this establishes: nothing on a per-line or multi-file path in main may be synchronous.** Buffer writes; yield between files on reads.

### 45.3 Renderer

- **Mutes and substitutes were the only ungated rule engines.** Substitutes ran the full rule list per SEGMENT *and* again over the joined line — `rules × (segments + 1)` scans per line, unconditionally, per open stream panel (~27µs/line for a 90-rule import). Both now carry `fastLower` with one lowercase per line. Pitfall #82a's claim that *every* site gates is finally true.
- **Contacts mixed tracking data with render data** — see pitfall #105. A presence write per room change invalidated every mounted text row (~30-40ms hitch per room transition for importers). Split via a render-only identity key.
- **Connect progress lived in `AppShell` state** and updated ~1/second during a Lich wait; since `GameWindow` is not memoized, that re-rendered every connected character once a second. Moved into an isolated leaf.

### 45.4 CSS — animate compositor properties only

Animating `filter`, `box-shadow`, or `background-*` forces a repaint every frame; `transform` and `opacity` are free. The SimuCoin coin animated `filter: drop-shadow` **infinitely** while coins were claimable — a permanent background repaint for a barely-visible pulse. Removed in favour of a static glow plus a `transform` sheen.

**Known and accepted:** the highlight text effects (`hl-fx-sweep` — Shimmer/Rainbow/Gold/Gradient/Fire/Frost) animate `background-position` + `filter`, and unlike the coin they attach to GAME TEXT, so the cost scales with how many matching spans are on screen. This is a deliberate shipped feature and is already gated by epilepsy-safe mode; revisit only if a tester reports the client feeling heavy with many effects configured.

### 45.5 Verified intact (do not "optimize" these)

Single-pass line scanning (`computeLineMatchRanges`), panel memoization (all six memo'd components audited — no violations), main's 16ms flood coalescing, `appendTrimmed` hysteresis, zero `setInterval` in main, scene work genuinely zero-cost when no Experience is open, session-log *writes* properly buffered, and better-sqlite3 on-demand only. Highlight scanning measures a healthy **95.8µs/line at 1,554 real rules**.

**Disproven — do not "fix":** `LichConnection.flush()` uses the per-line re-slice shape its sibling documents as O(K·N), but V8 represents `buffer.slice(i)` as a SlicedString (O(1), no copy), so the quadratic never materializes — benchmarked at 1.1×, not quadratic.

### 45.6 Genie Map — follow-up pass (B231)

Reported as "sluggish when dragging, and during heavy movement", with the locator sonar ping as the suspected cause. Measured first, changed second.

**The ping was exonerated.** A harness at real zone density (1057 nodes — the largest zone in the dev genie-cache) panned the `will-change: transform` layer for 300 frames with the ping and healer heartbeats on and off. All four variants held a flat 60fps with zero dropped frames: the two animations exempted from the `genie-pan-dragging` freeze cost nothing measurable while the layer is being transformed. The exemptions stay.

**The real costs were React, and both were invisible in the output** (correct rendering, just recomputed):

| | before | after |
|---|---|---|
| React commit per room change | 8.92ms | **0.09ms** |
| React commit while panning | 0.45ms | 0.45ms |
| arc `join()` per render | 0.18ms + 78KB garbage | **0** |

- **The node layer rebuilt on every step.** `nodeRects` memoizes ~1057 marker groups, but its dep `onNodeContextMenu` closed over `currentLocation` — a fresh identity per room change, so the memo never held while the player moved. Fixed with a latest-closure ref; the memo now rebuilds only on a genuine zone/level change. Generalized as pitfall #106: **a callback in an expensive memo's deps must have a stable identity.**
- **The arc paths re-joined per render.** `arcSegs` was memoized; the `.join()` producing the path `d` strings was not, and ran twice per render. Generalized in the same pitfall: **memoize the value handed to React, not the intermediate.**

**Method note worth keeping:** the first harness (rAF frame intervals) could not answer the question — rAF is vsync-locked, so it reports a flat 16.67ms until the budget is actually blown, which made every variant look identical. The React **Profiler API** (`onRender`'s `actualDuration`) is what separated an 8.92ms commit from a 0.34ms one. **For "is this render expensive?", measure commit time, not frame interval.**

### 45.7 Experiences — profiled, clean (v0.18.0)

Asked whether the Living Tableau or Moons had anything worth tuning. **Measured: no.** Recorded so the investigation is not repeated — a negative result is only useful if it is written down.

Method: bundle the REAL components (Iron rule) and time `flushSync` render+commit against **production** React. `<Profiler>` is a NO-OP in a production build and a development build inflates commit time, so a Profiler number is always a dev number — see the method note in §45.6.

| scenario | commit |
|---|---|
| Moons re-render caused by a prop it never reads | 0.38ms |
| Tableau, empty room, same | 0.05ms |
| Tableau, 14 players / 9 creatures / 8 bubbles, same | 0.15ms |
| Tableau crowded, REAL update (new speech line) | 0.15ms |
| Moons sky, winter + heavy snow, every layer on | 60fps flat, 0 dropped frames |
| Scene capturers (per line, whenever any Experience is open) | 0.37µs — ~0.3ms per MINUTE of busy play |

The Moons sky was also measured with `.moons-pill`'s `backdrop-filter` removed and with animations off entirely: **no difference**. The structures responsible are the §35.6 scene gate, the module-hoisted `MoonsLandscape`/`MoonsClouds`/`MoonsPrecip` sub-components, the deterministic module-level particle arrays, the capturers' cheap substring gates, and `memo()` on both components. The keyframes are almost entirely `transform`/`opacity` (§45.4's compositor-friendly pair).

**Three things examined and deliberately NOT changed** — each is a real observation whose fix costs more than it buys:

- **Moons reads 6 of the 15 props it is handed** (it ignores `roomState`/`sceneCast`/`speech`/`moves`/`indicators`/`combat`/`contacts`), so ordinary game activity re-renders it for nothing. A custom `memo` comparator would remove it — and introduce a genuine footgun: the day someone makes Moons read a prop the comparator ignores, it renders **silently stale forever**. Not worth 0.38ms. If a comparator is ever added, it must be derived from a declared prop list on the `ExperienceDef`, never hand-maintained.
- **`expAnyOpen` is ANY open Experience**, so opening Moons switches on scene parsing that Moons never consumes. Correct instinct, wrong magnitude (0.3ms/min). Revisit only if we add more Experiences that need no scene data — the fix would be a `needsScene` flag on the registry entry, which fails LOUDLY (an Experience visibly gets no feed) rather than silently.
- **`moons-twinkle` animates `fill-opacity` and `moons-ring-rise`/`-set` animate the `r` geometry attribute** — paint/geometry properties rather than compositor ones, on ~70 stars. Costs nothing measurable here.

**Two limits on this result, stated rather than glossed:** everything was measured on the dev machine, which has headroom to spare — the **Linux and macOS betas will land on weaker hardware**, and the three items above plus the pill's blur are what would bite there first; that is a watch-list, not a finding, and it is unproven from here. And the crowded Tableau run exercised figures, bubbles, wisps and captions but left `combat` undefined, so **the readiness rings, BAL/POS/RNG gauges and the assess arena are unmeasured**.

Harness: `tmp-map-perf/` (gitignored) — `exp-bench.jsx` (commit time), `anim-bench.jsx` (continuous sky under rAF), `scene-cost.mjs` (per-line capturers).


---

### 45.8 Second pass — style invalidation, and animation nobody can see (v0.18.5)

Triggered by "the client feels sluggish, and it hasn't always been this way" on
a machine far too strong for that to be capacity (i7-11700F / 32GB / RTX 3060).
Three structural findings, and one methodological one that matters more than any
of them.

**The methodological finding first: §45.7 measured the wrong axis.** The v0.18.0
Experiences profiling timed React's **render** phase (`flushSync` against the
production bundle) and concluded Moons/Tableau were clean. They are — but that
metric is blind to Blink **style recalculation, layout, paint and compositing**,
which is where every problem below actually lived. A React Profiler would not
have caught the map bug either. **When a perf claim is "component X is cheap",
state which axis was measured** — and if the symptom is "the UI feels bad" rather
than "this component is slow", the browser-side axes are the ones to check.

**(a) Style invalidation, not render cost, was the sluggishness (B263).** The map
froze animations with `.genie-pan-dragging *` / `.genie-anim-off *`. A `*`
descendant selector makes Blink invalidate the **entire subtree** on every toggle
of the class (`.a .b` invalidates only elements carrying `.b`), and the pan group
holds ~1057 room groups plus arcs and auras. `inMotion` flips on *every room
change*, so walking re-ran a full-subtree style recalculation continuously — on
the main thread React, Virtuoso and the game-text pipeline share. Both rules now
enumerate the 18 animated classes. **The diagnostic signature is the reusable
part: a display toggle on one subsystem changing the responsiveness of an
unrelated one is main-thread contention, not a defect in either.** Full rule:
CLAUDE.md pitfall #126, and §19's pause section for the map specifics.

**(b) Nothing paused when the window was off screen.** `backgroundThrottling` is
`false` by design — the room pump and game stream must keep running while
minimized (pitfall #71) — but that also left every CSS animation in the app doing
style and paint work nobody could see: the map's ~20, the Experiences' ~24, the
highlight text effects, times every mounted character. **Architecture:**
`win.on('minimize'/'restore'/'hide'/'show')` in `createWindow` →
`window-visibility` IPC → App stamps `data-window-hidden` on `<html>` →
`global.css` pauses `animation-play-state`. Three constraints, all load-bearing:
- **It cannot be driven from `document.hidden`.** Electron's own docs state
  `backgroundThrottling: false` also affects the Page Visibility API, so `hidden`
  likely never goes true and `visibilitychange` may never fire — which is why
  pitfall #96 flagged the *existing* `document.hidden` guards as probably inert.
  The window's lifecycle events are the reliable signal and only main has them.
- **This channel is per-WINDOW, not per-session** — a deliberate exception to the
  "every push channel carries `sessionId`" rule (§13). It is the OS window that
  is off screen, and each `BrowserWindow` has its own document, so each stamps
  its own root independently.
- **Not wired to blur/focus.** An unfocused window is usually still fully
  visible; freezing it because the user clicked another app would be a visible
  regression, not an optimization. Only minimize/hide qualify.
The CSS rule uses a wildcard, which is *not* a contradiction of (a): that cost is
**per toggle**, and this attribute flips only on minimize/restore — rare,
user-initiated, and landing on a window already vanishing or reappearing.
Frequency is the thing to check, not the presence of a `*`.

**(c) The Experiences were re-audited and are well built.** Measuring properties
animated *inside `@keyframes` only* (a whole-file sweep is misleading — it counts
static declarations): experiences.css is 35 `opacity` + 18 `transform` + 4
`box-shadow` + 2 `fill-opacity`, map-panel.css is 64 `opacity` + 34 `transform`,
and there are **zero layout-triggering animations anywhere** — no animated
`width`/`height`/`top`/`left`. That is §45.4's rule being followed. Particle
counts are modest (~130 worst case: 70 stars with reveal culling, 34 rain, 26
snow, 11 leaves, 9 fireflies). The single genuine outlier was `.moons-pill`'s
`backdrop-filter: blur(9px) saturate(1.25)` — an element up to 96% of the scene
wide, over a sky whose backdrop is *always* changing, so the compositor
re-captured and re-blurred that band continuously. Removed; the fill went 60% →
88% opaque because the blur was doing legibility work as well as decoration.
**Do not put `backdrop-filter` on anything that sits over an animating scene** —
cost scales with both radius and blurred area. The modal scrims in launcher.css /
wizard.css are fine: `blur(2px)` over a *static* backdrop.

**(d) Idle costs.** The character tab bar ran a 500ms interval permanently to
drive a roundtime glyph, re-rendering an app-level component twice a second
whether or not a roundtime existed (and ticking while minimized, per
`backgroundThrottling`); now gated on a pending expiry, self-clearing one tick
past it. Virtuoso overscan dropped 3000px → 1200px — it existed solely as B152's
copy-truncation workaround, superseded by the same release's data-model rebuild;
1200px still clears one viewport so ordinary selections keep exact offsets.

**Platform audit (Electron 43.2 / macOS / Linux) — clean.** No removed or
deprecated Electron APIs in use; security posture correct (`contextIsolation`
on, `nodeIntegration` off). macOS has its `appMenu` role, `activate` handler and
darwin `window-all-closed` guard. Linux: all 571 relative imports audited for
case-sensitivity, zero mismatches. The one change was the permission allowlist
(B265 / pitfall #127) — `setPermissionCheckHandler` was `() => true`, which made
trigger notifications work *by accident* while the request handler denied them;
both handlers now share one `ALLOWED_PERMISSIONS` set, which is also a tightening.

**Deferred, deliberately.** *Viewport-culling the node layer* — a real win when
zoomed in, but culling by viewport puts `transform` into the `nodeRects` deps and
risks re-creating exactly the churn §45.6/B231 fixed; it needs a quantized
viewport and a profile justifying it, not a guess. *Decomposing GameWindow* —
5,576 lines / 207 hooks re-rendered per event batch is the real remaining
ceiling, and the data coupling is narrow (four consumers of `lines`, one already
a ref), but it drags the whole scroll state machine with it and belongs in its
own changeset with its own pass against the pitfall #68 scenarios.

### 45.9 Profile saves are the biggest remaining main-thread block — MEASURED, not acted on (v0.18.6)

Surfaced while bug-checking v0.18.6 (which added two rare-path `scheduleProfileSave` callers, both negligible). The numbers are recorded here so the decision doesn't have to be re-derived; **no change was made** (Sekmeht's call — the save path is the one place a subtle mistake costs a tester their setup).

**One save of a large character blocks MAIN for ~95ms.** Measured against real profiles with the shipped `js-yaml`:

| Profile | Size | `yaml.load` (read) | `yaml.dump` (write) |
|---|---|---|---|
| Squabbles.yaml | 1,174 KB | 40.3 ms | 53.5 ms |
| Agan.yaml | 589 KB | ~20 ms | 22.0 ms |

Both run in MAIN ([profiles.ts](src/main/profiles.ts)), and main owns every session socket — so this is §45.2's highest-severity class: **every connected character stalls for that window**. On top of the parse/serialize, `exportCharacterProfile` read-merge-writes, so a save also ships the profile main→renderer and back — two ~1.2 MB structured clones (unmeasured).

**The shape of the data explains it: 935 KB of Squabbles' 953 KB of state is `highlights` alone.** A settings toggle re-serializes an entire imported ruleset.

**What this settles:** `saveCommandHistory` deliberately has **no** `scheduleProfileSave`, even though it shares the B266/B267 "localStorage is half a change" shape. It writes on every command, so wiring it up would mean a ~95 ms main-thread stall every 2.5 s during active play — a visible stutter on the same thread as the text pipeline. History reaching YAML therefore rides on other saves; that is a conscious trade, not an oversight.

**Options if this is ever picked up, cheapest first:** (1) skip writes whose serialized payload is unchanged — needs to compare the exact payload, since a wrong comparison is silent data loss; (2) move the read-merge into main, dropping both IPC clones (doesn't reduce parse/dump — confirm the clone cost is material first); (3) split large collections into their own files so a settings change stops rewriting a 935 KB ruleset — the real fix, and a profile-shape migration under Principle #8, so its own release.

### 45.10 The Spell Monitor's 1 Hz counter — profiled (v0.19.6)

v0.19.6 made the clock run CONTINUOUSLY whenever the feed readout is shown,
where before it retired once nothing was counting down. That is a real change in
kind, so it was measured rather than argued about. Harness: `tmp-sm-render/`
(machine-local, gitignored; rebuild recipe in its README).

**Both axes, because §45.8's lesson is that timing React alone is blind to the
ones that matter.** Render+commit was timed with `flushSync` against the
PRODUCTION bundle; separately a `MutationObserver` recorded what a real tick
actually mutates, by attribute name and target element — which is what decides
whether a tick reflows or merely composites.

| Scenario | Render+commit | DOM mutations per tick |
|---|---|---|
| 8 effects, all layers on | **0.087 ms** | 1 × `.sm-bar-fill[style]` per cell |
| 25 effects, all layers on | **0.143 ms** | 1 per cell, + 1 text node for the readout |
| 25 effects, readout OFF | 0.122 ms | 1 per cell |
| Empty grid, readout only | **0.007 ms** | 1 text node |

**The findings.**

**(a) Every attribute write is the bar's `transform`, and there are ZERO
childList mutations.** No node is created or destroyed by a tick, and `transform`
is a compositor property — so a tick invalidates no layout. This is the v0.18.0
`scaleX`-not-`width` decision paying off exactly as intended; had the bar still
animated `width`, these same 25 writes per second would each have invalidated
layout.

**(b) The always-on clock's genuinely NEW cost is the bottom row: 0.007 ms and
one text node per second.** Everything above it was already being paid — a grid
with timed effects kept the clock running before v0.19.6 too. So the change in
kind is real but the change in cost is ~0.0007% of a core.

**(c) At 25 buffs the whole tick is 0.014% of a core**, and cheaper than a Moons
render (0.38 ms) — the same class as a crowded Tableau (0.15 ms).

**(d) A tick cannot reach the other Experiences.** `setNow` is state local to
`SpellMonitorExperience`, so React re-renders that subtree and nothing else. The
REF that carries feed liveness (pitfall #140) protects the other axis — a prop
change from GameWindow, which *would* have re-rendered Moons and the Tableau.

**NOT measured, and therefore not claimed:** Blink's style-recalculation cost,
paint, and the compositing of N continuously-transitioning bars. Each bar carries
`transition: transform 1s linear` and receives a new value every second, so while
the window is open every visible bar is permanently mid-transition and is a
compositor-layer candidate. That is GPU-side work this harness cannot see. It is
also unchanged by v0.19.6 (bars animate only when something is counting down,
which is when the clock ran anyway) — but if a Spell Monitor with a large buff
stack is ever reported as heavy, **that** is the axis to measure, not this one.

**Known and deliberately unfixed:** a MINIMIZED window keeps ticking, because
`backgroundThrottling: false` (§45.8b) leaves timers running. At 0.14 ms/second
per open Spell Monitor it is far below the threshold that justified §45.8's
animation pause, and pausing it would need a `data-window-hidden` subscription
plus a stale-readout-on-restore story for no measurable gain.

## 46. Prioritised Backlog — features & UX polish (snapshot 2026-07-30)

A holistic pass over the client against the mission (§1, §24), taken at v0.18.3.
**Priorities, not commitments** — a snapshot of where the value is, to be
re-cut when it stops matching reality. Items already spec'd elsewhere keep their
existing ids (§32's G/X/AI series); genuinely new ideas are numbered F86+.

**The finding that shapes the list.** Phases 1-5 are complete and the client is
functionally mature — text pipeline, panels, automations, imports, profiles,
multi-character, cross-platform are all done and hardened. Two things are thin:

1. **The first ten minutes.** Our first macOS tester hit THREE separate walls in
   one sitting (B246 no saved password → unexplained wizard; B250 no locale →
   `spawn ENOENT`; B247 Lich Setup silent about a bad path). None was a missing
   feature — each was the client failing to say what it needed. Lichborne is
   currently much better than its first impression suggests.
2. **The joy layer.** The Experiences platform (§34) carries 2 of the 16
   surfaces the G/X series describe. That platform is what makes this client
   *ours* rather than another front-end, and it is where enjoyability per unit
   of effort is highest.

### Tier 1 — small effort, disproportionate payoff

| Item | Effort | Rationale |
|---|---|---|
| **Screenshot in README** | XS | A visual product with no picture. The single biggest first-impression gap; the README carries an HTML comment marking where it goes. |
| **F86 — Setup Health panel** | S | One surface listing Lich ✓/✗, session logging, AI, SimuCoins, each with a fix link. Answers all three of Zithri's walls at once and turns "it's broken" into "here's what's missing". |
| **F87 — What's New on first launch after an update** | S | release-notes.md is written every version and almost nobody sees it. Show it in-app once per version, dismissible. |
| **F88 — Diagnostics bundle** | S | One button → zip of the launch log, versions, and a SANITISED profile. Every tester report so far has opened with us asking for context by hand. |
| **G3 — Life Orbs** | S | Vitals as orbs rather than bars. Data already parsed, opt-in, pure cosmetic joy. |
| **F89 — Per-character accent colour on tabs** | S | Multi-boxers identify a tab by colour far faster than by name. Rides the existing per-character settings pipeline. |

### Tier 2 — medium effort, high enjoyability

| Item | Effort | Rationale |
|---|---|---|
| **G2 — Wound Paper-Doll** | M | Per-part injuries AND scars are already parsed (B224) and currently drive only a text list. Highest payoff-per-line left in the codebase. |
| **G6 — Active Spells & Buffs board** | M | Practical every session; the stream already exists. |
| **G10 — Reactive Soundscape** | M | Sound is the one sense the client does not use. Needs care with the epilepsy-safe/motion conventions — the equivalent rule for audio is "never startle, always mutable". |
| **AI5 — Chronicle (auto journal)** | M | The most delightful AI idea in §32, and it reuses the v0.17.1 Catch Me Up log pipeline (extractors, dedup, tiering) almost wholesale. |
| **§43 modal chrome unification** — 9 dialogs still on their own | M | The `--modal-*` tokens exist; without this the app reads as assembled rather than designed. |
| **map-panel.css light-theme audit** (~23 literals, pitfall #75c) | M | A known queue of light-theme bug reports waiting to be filed. |

### Tier 3 — large, and they define the next chapter

| Item | Effort | Rationale |
|---|---|---|
| **Retire Static Panels** (§33 stages 1-2) | L | The biggest simplification available. The interim cost compounds: EVERY new feature needs two branches (pitfall #79), and that tax is paid on every release until it lands. |
| **X3 — Empath's Ward** | L | Deepest guild-specific payoff; party frames are genuinely novel for DR. |
| **AI6 — Ask Your Logs** | L | Needs the embeddings capability the §10 adapter deliberately left dark — the first feature that would light it up. |

### New ideas (not previously in §32)

- **F90 — Character palette (`Ctrl+P`).** Fuzzy-jump to any character by name.
  Nine tabs is already past what `Ctrl+1-9` serves well, and the slash palette
  proves the interaction works here.
- **F91 — Profile backup browser.** Five rolling timestamped backups per
  character already exist on disk (§20) with no way to see or restore one.
  Cheap insurance against the failure class Principle #8 exists to prevent.
- **F92 — "Explain this screen" overlay.** A dismissible onboarding pass
  labelling the vitals bar, icon bar and panels. The natural extension of UX
  standard #8 from individual controls to the whole window.
- **F93 — Session summary card on disconnect.** Time played, ranks gained, coin
  earned. Nearly free from the Catch Me Up extractors, and a genuinely pleasant
  end-of-session moment.
- **F94 — Theme sharing.** Themes are already portable data; a paste-a-string
  import would turn that into a community.

### Deliberately held

- **G9 / AI9 image generation.** Cost and scope out of proportion to the
  payoff, and it needs the `image` capability the adapter leaves dark.
- **Anything resembling a script runtime.** The Lich line (Principle #2). It has
  held cleanly so far and should keep holding.

### Suggested first cut

A **"first ten minutes" release**: the README screenshot, F86, F87 and F88.
All Tier 1, all small, and together they close the exact failure mode that cost
a tester two days. Then ONE Experience (G2) to keep the joy layer moving.

---

## 47. Views — Session & Overview (v0.19.0)

**Status:** Phase 1 built. Phases 2–3 specified here, not scheduled.

### 47.1 Why

DR allows one character per account, so multi-boxing means several accounts at
once. Lichborne already supported that mechanically (multi-session, tabs,
decoupled windows, Quick Send) but could only ever *show* one character at a
time — so "is anyone dying, idle, or being spoken to?" meant tabbing through
everyone, and the answer was stale before you finished.

A **view** is a top-level, app-level mode, orthogonal to layout mode, panels and
Experiences:

- **Session** — today's behaviour, unchanged and still the default.
- **Overview** — a live card per character: condition, situation, session
  progress, a short game-text feed, and an *attention* model that flags whoever
  needs you. Cards are ordered by **tab position by default** (Sekmeht,
  v0.19.0): attention-sorting is real, but it MOVES cards while you are watching
  them, and a dashboard whose tiles rearrange under the cursor defeats the
  muscle memory that makes a dashboard fast — you learn "Agan is top-left" and
  then he isn't. Tab order matches the character strip directly above it, so a
  position means the same thing in both. `/view sort attention` opts in, and the
  attention model still drives the flags, the colours and the summary strip.

**Known gap in the attention model (B274, open).** `free-to-act` is specified as
"out of roundtime and idle for `freeToActSeconds`" but is computed inside a memo
whose dependencies are all push-driven, so it only evaluates when text has just
arrived — when idle time is ~0 — and the branch is effectively unreachable.
`idle` has the same structural problem and is solved by consumers re-deriving it
against the shared 1 Hz clock; nothing re-derives `free-to-act`. The resolution
is a decision rather than a patch: re-derive it on the clock, or drop it as
redundant with `idle` at a 10s threshold. **The transferable rule: any attention
flag whose condition is ELAPSED TIME cannot be computed at publish time** — the
digest is push-driven by construction, and a character that has gone quiet has by
definition stopped publishing. Such a flag must be derived by the consumer, and
`idle` is the pattern to copy.

**Persistence, and the invariant it exposed.** Options are app-wide
(`SharedProfile.overview`, an optional field, so no version bump and no
migration); the per-card stream choice is per-character (`overviewStream`, a
scopedKey riding `state:` into the character YAML, registered in Transfer's
existing `viewPrefs` category); the view MODE is per-window ephemeral and
deliberately not persisted, so a decoupled window is never dragged into the main
window's view.

Building it surfaced a rule that was never written down: **every other field of
`SharedProfile` is read FRESH from localStorage inside `buildSharedProfile`**,
and localStorage is shared across windows, so a flush from any window is current
by construction. The overview block was the only one reading module memory,
which made it the only shared setting a second window could silently revert
(B271) - fixed with a `storage` listener, and recorded because the next
module-state-backed shared setting will need the same.

**Decided with Sekmeht before building:** cards are **read-only** (click → open
that character in Session view; Quick Send already covers cross-character
commands); v1 is scoped to **this window's** characters; statistics are
**condition + attention + session progress** (log-backed history deferred); the
feed is a **short styled tail**, 0–20 lines, default 6.

### 47.2 Architecture — the portal, and why it matters

```
AppShell
├── AppBar → ViewToggle          (leaf subscriber; its badge works while CLOSED)
└── content region  (position: relative)
    ├── OverviewShell            (absolute overlay; owns the grid host + 1 Hz clock)
    │     └── div.ov-grid        ← PORTAL HOST, always mounted
    └── sessions.map(...)        ← visibility UNCHANGED
          └── GameWindow
                └── overviewOpen && createPortal(<OverviewCard/>, host, characterId)
```

**The card is rendered by its own GameWindow.** `createPortal` moves a child into
a different DOM subtree while **keeping React context**, so the card escapes the
`display:none` session shell (becoming visible) yet still reads that character's
`vitals` / `roomState` / `lines` and its per-session `HighlightsContext` /
`ContactsContext`. This *dissolves* pitfall #57 rather than working around it —
no new IPC, no serialisation, no duplicated render path, and the game's own
colours come through because the feed reuses `TextLineRow`.

Three consequences worth stating:

1. **Card order is CSS `order`, not DOM order.** Portal children append in commit
   order, which drifts from session order after add/remove/remount. Each card
   computes `attentionOrder(score, tabIndex)` itself — it can call
   `useSessions()` because context survives the portal — which buys
   attention-sorting for free.
2. **The grid host is always mounted** (CSS-hidden in Session view), so the
   portal target has a stable identity and there is never a null-target frame.
3. **It is an overlay, not a third render branch.** The session shells keep their
   existing visibility, so the active character's virtualised scrollback stays
   measured and returning needs **no re-snap**. Hiding all shells would
   reintroduce the pitfall #24/#68 0×0 class — and `stickToBottom`'s re-snap keys
   on `isActive`, which does *not* change on a view flip.

### 47.3 The store, and what is deliberately NOT in SessionStatus

`SessionStatus` is untouched. Its `updateStatus` path is guarded by a
hand-written 16-term equality chain whose entire purpose is to stop the character
tab strip re-rendering on vital ticks; dashboard fields there would defeat that
and add a term every future field must remember (pitfall #130).

The cross-character reduction lives in `overviewStore.ts` — view mode, options,
and one thin scalar `CharacterDigest` per character. Three invariants:

- **Cached snapshot.** `getSnapshot` returns a `let` reassigned only in the
  flush; a getter that rebuilds an array is an infinite render loop (pitfall
  #129). This is the codebase's first `useSyncExternalStore`.
- **Key-loop equality gate** over a frozen `DIGEST_KEYS` — derived from a
  `Record<keyof CharacterDigest, true>` companion (B298, v0.19.2), because that
  is what actually makes adding a field to the type without the list a compile
  error (the earlier bare `as const` list only typed its entries as a SUBSET of
  the keys, so a forgotten field compiled clean).
- **Leading-edge coalescing** at 500ms, mirroring main's `scheduleFlush`. Not a
  frame — nothing here animates; card timers tick off their own expiry stamps
  through the existing `useTimers`.

Consumers are LEAF components only, so a publish never reaches the tab strip.

### 47.4 Attention

`attention.ts` is pure, React-free and harnessed (`tmp-rules-harness` §H).
Severity order **is** chip order, reading order and sort order (UX standard #3):
dead 100 · offline 95 · critical 90 · bleeding 80 · stunned 70 · poisoned 62 ·
diseased 60 · hurt 50 · webbed 45 · spoken-to 40 · idle 30 · mind-locked 20.
(A `free-to-act 10` flag shipped in the first draft and was **removed in
v0.19.0, B274** — its condition is elapsed idle time, which a push-driven memo
never sees, and it was redundant noise besides; `freeToActSeconds` survives in
the thresholds so no stored profile changed shape. This section listed it until
v0.19.2 — the code's own comment was right and the spec was stale.)

Four rules the table encodes:

- **A disconnected character reports ONLY offline.** Its vitals and indicators
  are the last values before the drop; surfacing "bleeding" on a dead socket
  reports a stale fact as a live one.
- **`healthPct === null` means "no vital yet" and must read CALM** — a
  just-connected character must not flash Critical, which a naive `< 25` against
  0 would do.
- **`spoken-to` is push-computed with a TIMER-driven expiry (B286, v0.19.2).**
  It is a time window (60s default), and the attention memo is push-driven — so
  entry arrived with the speech event but expiry needed a re-run a parked
  character never produced, and the chip + app-bar badge stayed lit for hours.
  One bounded `setTimeout` per speech (`spokeTick` in useSessionStats) re-runs
  the memo just past the window's end. Deliberately NOT the consumer-derived
  model idle uses: the badge must clear while the Overview is CLOSED, which is
  exactly when the shared 1 Hz clock isn't running.
- **`idle` is DERIVED by the consumer, never pushed.** An idle character stops
  receiving events, so it stops re-rendering, so a pushed idle flag would never
  arrive. The digest carries `lastInboundAt` quantised to 5s
  (`IDLE_QUANTUM_MS`) — ample for a 180s threshold, and it caps publish churn at
  one per character per 5s. The card and summary strip derive idle against the
  shell's shared 1 Hz clock; the app-bar badge deliberately counts push-driven
  problems only, because a badge that lights for a deliberately-parked character
  is one you learn to ignore.

### 47.5 Statistics

**Live and free** (already parsed): vitals + guild-renamed labels, the indicator
set, stance, hands, prepared spell, RT/CT/aim, room title, room occupants,
injuries, skill ranks and mindstate.

**Derived accumulators** (`useSessionStats.ts`, in refs so they never trigger a
render): uptime, ranks gained this session, deaths, unique rooms visited, last
inbound, lines/min (12 × 5s ring, advanced lazily), mind-lock count. Uptime
**stops at a drop rather than resetting** (a `stoppedAt` stamp, B287 v0.19.2 —
a disconnected card answers "how long did the session run", never "up 0s" and
never a figure that keeps growing after the socket died); the `[sessionId]`
reset effect still zeroes both stamps for a fresh connection.

Two design calls:

- **The counters run ALWAYS, including in Session view.** One `+=` and one
  `Date.now()` per *batch* — already coalesced to ~one per frame by main's 16ms
  flush — is free at that scale, and it means opening the Overview shows real
  numbers instead of every counter starting at zero. **The render is what's
  gated, not the counting.**
- **Everything resets on a reconnect-in-place.** A GameWindow is keyed by
  `characterId`, so a tab Reconnect swaps in a new `sessionId` without
  remounting (pitfall #69); the reset effect keys on `sessionId`, or a six-hour
  uptime survives a drop and lies.

`ranksThisSession` rides `ExpComponentEvent.rankUp` — the **server's own**
rank-gain signal — so it is exact and costs one Map increment. No client-side
rank diffing, no log reading.

**Occupancy comes from `roomState`, NOT `sceneCast`.** The scene capturers are
gated off unless an Experience is open (§35.6), so `sceneCast` and `sceneSpeech`
are empty for most users, whereas the `<component id='room players'>` path is
ungated. That is also why the "spoken to" flag is an explicit opt-in
(`watchSpeech`, default **off**) which extends the §35.6 gate — the one option
here with a real per-line cost, multiplied by every open character.

### 47.5a Card contents — quiet by default (Binu, v0.19.0 review)

Two rules from the first review, both instances of UX polish standard #1.

**Only what is NOT normal.** The card originally reused `IconBar`, which renders
every slot unconditionally — hands read "Empty", spell reads "None", stance
always shows "Standing". That is exactly right for a game-area strip, where a
fixed position you can glance at without reading is the point; in a tile it
spends a whole band saying nothing happened. `IconBar` also **duplicated the flag
row** (bleeding / stunned / dead / poisoned / diseased / webbed are attention
chips already). The card now uses a purpose-built `ConditionLine` showing only a
non-upright posture, the indicators that are *not* attention flags
(hidden / invisible / joined), what is actually held, and a prepared spell.
Reusing a component is right in principle; reusing one whose contract is
"always show every slot" was the wrong component for a tile.

**A card announces itself when a character is in real trouble.** `alertPulse`
(default on) pulses the card when a character is dead or below the **critical**
threshold — deliberately not the merely-hurt one, because a pulse that fires
often is a pulse you stop seeing. If Lichborne does not have focus it also
flashes the OS window via the existing `flashWindow()` → `flashFrame` path, so
you find out from another application. Three constraints:

- It fires on the **edge** (not-critical → critical), tracked with a
  `boolean | null` ref where `null` means "not evaluated for this session yet" —
  starting at `false` would read the first sample as an edge, so an
  already-hurt character connecting, or a window handoff replaying state
  (pitfall #60a), would flash spuriously.
- The flash is **suppressed while the window has focus**: the card pulse is
  already saying it there, and a flashing taskbar you can see is noise.
- It lives in `useSessionStats`, **not the card** — the card only exists while
  the Overview is open, and the entire point is to be told when you are not
  looking. Main routes `flash-window` to the sender, so with decoupled windows
  the window that actually owns the character in trouble is the one that asks
  for attention.

Motion is dropped under epilepsy-safe and `prefers-reduced-motion`; the red
stays, so the accessible path loses nothing the effect was carrying
(polish standard #9b).

### 47.5b Grid scaling — from one character to thirty (Sekmeht, v0.19.0)

A count-blind grid is wrong at both ends: one character sat alone in a 300px card
in a sea of empty space, and thirty produced thirty identical cards regardless of
how much room there actually was. The fix separates two questions that were
being answered by one rule — **how big does each tile get** (the grid's job) and
**what can a tile honestly show at that size** (the tile's job).

**The grid fills, floors, then scrolls.** One expression carries it:

```css
grid-auto-rows: minmax(var(--ov-row-min), 1fr);
```

With room, `1fr` wins and rows share the full height — one character is
full-screen, two split it, four go 2×2. Without, the floor wins and the grid
scrolls. So thirty characters all fit on a 4K and stay readable (scrolling) on a
laptop, with no count-buckets to get wrong. `align-content: start` must stay OFF
— it collapses rows to content height and defeats the `1fr`.

**Column count is chosen by `planGrid` ([overviewLayout.ts](src/renderer/overviewLayout.ts)), which is PURE and harnessed** (`tmp-rules-harness` §I). It
evaluates every candidate 1..count and keeps the best-scoring shape. Three things
it must do, each of which was a real bug the harness caught before the feature
was ever run:

- **Score the EFFECTIVE tile height,** `max(rowFloor, height / rows)`. Once rows
  stop fitting the grid scrolls and every tile is exactly the floor tall —
  scoring against the container height compares shapes that will never exist,
  and picked visibly wrong layouts for large counts on small screens.
- **Penalise a ragged last row.** Untouched, the scorer picks 3 columns for 4
  cards and 4 for 9, because those tiles are marginally closer to the ideal
  shape. Mathematically true, visibly wrong: a grid that fills evenly reads as
  deliberate, one with a gap reads as broken.
- **Score on the LOG of the aspect ratio,** so half-as-wide-as-ideal is penalised
  the same as twice-as-wide. A plain difference is lopsided and biases toward
  over-wide tiles.

An exhaustive search is right here precisely because the count is small; a
closed-form `ceil(sqrt(n))` ignores the container's own aspect and so gives the
same answer on an ultrawide as on a portrait monitor.

**Each tile then tiers itself with a `@container` query**, the app bar's
degradation ladder (B178) applied to a card. That is automatically correct for
any count × window size × font size, where a table of count → layout is wrong the
moment somebody resizes — and crucially nothing in JS decides what MOUNTS, which
is the pitfall #83 trap. Compact drops the feed, stats and occupancy; micro
drops everything but name, health and the attention colour, because at that size
anything more is unreadable and pretending otherwise is worse than admitting the
tile is a status light. Thresholds are `em` against the card's own game-font
anchor — do not convert them to px. Note `container-type` makes each card a
stacking context (the B179 lesson); nothing escapes a card today, but a popover
added inside one later must portal out.

**The feed absorbs leftover height** (`flex: 1 1 auto; min-height: 0`) instead of
owning a fixed one. The tile is now the stable rectangle, so this is a *stronger*
anti-quiver guarantee than the fixed height it replaces. `feedLines` therefore
stops being a cap — capping would leave a full-screen tile showing six lines
above a lot of empty space — and instead **raises the row floor**, meaning
"guarantee me at least this many lines per card", which is also what decides how
soon the grid starts scrolling.

**The manual override needs a width cap or it is inert.** Columns are `1fr`, so
asking for "small" with four characters on a wide screen would still hand you
four 480px tiles. `tileMaxPx` (null for auto, a px target otherwise) plus
`justify-content: start` is what makes the setting mean what it says. It rides
`OverviewOptions`, so it persists app-wide in `_shared.yaml` like every other
Overview preference, with a Settings control and `/view set tiles=`.

### 47.5c The card's stream selector (Rakkor's need, Sekmeht's design)

> Rakkor: *"Conversation window at the minimum would still be necessary… being
> able to see that from the dashboard = important."*

A dashboard showing condition but not **what somebody just said to you** fails the
responsiveness test: you would see a character was fine and still miss the GM or
player waiting on an answer.

**Each card carries a dropdown that changes which stream its feed shows.**
Default `main` (the game window); switch it to `conversation` and that card shows
only conversation. It **replaces** the feed rather than adding a second lane — a
card is a glance, and two competing text areas is not one.

**Per CHARACTER, not app-wide.** That is the whole point: a crafter sits on
`main` while a character in a social spot watches `conversation`. It rides the
`scopedKey` → `state:` → YAML pipeline like every other per-character setting
(Principle #1), so it needs no profile-shape change, and it is reachable as
`/view stream <id>` (which acts on the ACTIVE character, unlike the rest of
`/view`).

**The tier order changed because of it.** When the feed was a generic activity
dump it was the first thing dropped as tiles shrank. Now it is the most
deliberate thing on the card, so stats, occupancy and conditions go first and the
feed survives to the smallest tier but one — which is what actually delivers
Rakkor's "at the minimum".

**It is a PARALLEL CAPTURE, and it has to be.** Reading `lines` or `streamLines`
is wrong in both directions, because of the routing decision at
[GameWindow.tsx:2541](src/renderer/components/GameWindow.tsx#L2541):

- a **watched** stream routes to `streamLines` and never reaches main — so a
  card reading `lines` is blind, and blind **worse the better the user's panel
  layout is** (the same inversion that exposed the Catch Me Up gathering bug);
- an **unwatched** stream with a `STREAM_FALLBACK` entry is redirected *into*
  main and so never reaches `streamLines` either.

So the capture sits beside the routing decision, pushes into its own buffer, and
leaves routing completely untouched — the main window behaves exactly as before.
One string compare per stream line, replay-gated like every other side effect
(pitfall #60a), cleared when the selection changes, and capped at
`MAX_MONITOR_LINES` because this is a glance lane held per character, not a
second scrollback.

**Two interaction details.** The card root is a button, so every control inside
it must stop propagation on `click`, `mousedown` AND `keydown` — a native select
emits all three and using it would otherwise also drop you into Session view. And
the choice list always includes the current selection even when nothing has
arrived on it this session, or the select silently falls back to its first option
and the saved choice is lost the moment the view opens.

**The choice list matches that character's panel `+` menu**, because each
character has a different stream setup and two surfaces disagreeing about the
same character is the kind of inconsistency nobody reports — they just stop
trusting one. That means labelling from `PANEL_LABELS`, not from the game's own
title: DR declares `conversation` with `title='Talk'`, and labelling from the
title made it read as a MISSING stream rather than a renamed one. Discovered ids
are normalized through `STREAM_ID_ALIASES` first, or `whispers` appears as its
own row beside `conversation`; the stored selection is normalized on write too,
so `/view stream talk` selects the canonical feed rather than an id the parser
never emits.

The only exclusions are entries that are **not text streams at all** and could
only ever render "nothing yet". The authority for which is which is
`renderPanel` in PanelFrame: a case returning `sp(id, streamLines[id])` is a
stream; one returning a component fed from state is not. So `map` (graphical),
`lichScripts` (`;listall` poll), `injuries` (`injury-update` events), `room`
(structured sub-streams) and — the one that looks like a stream and isn't —
**`exp`** (built from `exp-component` events) are out. State readouts that ARE
streams (`spells`, `inv`) stay in: they clear and rewrite wholesale so they read
as a live table rather than a feed, but that renders correctly, and whether a
glance at your active spells is worth a card is the user's call rather than a
silent omission.

### 47.5d Card actions (Sekmeht, v0.19.0)

A card offers the same per-character actions the character TAB does — open in a
new window, move to the main window, disconnect, reconnect — plus **Close**,
which the tab omits because it already carries an ✕.

**One definition, two surfaces.** `buildCharacterMenu`
([characterMenu.ts](src/renderer/characterMenu.ts)) is shared by the tab bar and
the card. A right-click that offers different options depending on which
representation of a character you happened to hit is an inconsistency nobody
reports as a bug — they just learn to distrust one of them. The order it encodes
is the tab menu's existing convention: non-destructive window moves first, a
divider, then the connection toggle (Disconnect must never be the first item
under the cursor — Binu kept fat-fingering it), then Close below even that. Only
actionable entries are listed; there are no greyed rows.

Three implementation constraints:

- **Both a right-click AND a `⋯` button.** Right-click alone matches the tab, but
  a right-click-only action is one most people never find — the same lesson the
  stream selector taught when it was styled so quietly it read as a label. Both
  open the identical menu.
- **The menu renders from GameWindow, not inside the card.** A card is a
  `@container`, therefore its own stacking context (the B179 lesson), so a menu
  rendered within one would be trapped by it. `ContextMenu` portals to
  `document.body` and clears the card entirely.
- **Handlers are passed THROUGH, never wrapped.** `onClose: id => onClose?.(id)`
  is always a function, so the builder's `if (env.onClose)` would always pass and
  Close would render even where nothing can handle it — an entry that appears and
  silently does nothing.

### 47.5e The universal input bar — and the QuickSend fix (Sekmeht, v0.19.0)

The Overview gained a persistent input bar under the grid: type at one character,
or broadcast to all of them. It reverses "cards are read-only" but not the reason
behind it — the input lives in ONE place, so a card is still a thing you read,
and there is exactly one field on screen that can send text. Thirty cards with
thirty inputs would be thirty places to mistype into the wrong character.

**It exposed a real bug in Quick Send**, which this shares a fix with. Quick Send
wrote straight to the socket via `sendCommand`, which meant:

- the command **arrived invisibly** — a Quick Send `wave` showed only the game's
  reply on the receiving character, with no `>wave`. That is B199's signature: the
  renderer-side echo is separate from the send, and a raw write skips it.
- a `/command` typed there was **forwarded to DragonRealms as literal text**,
  because the raw path never reaches the slash intercept at the top of
  `dispatchUserText`. A client command must never leave the client.

**The fix is one bridge, used by both.** A send addressed to a `sessionId` is
delivered to the GameWindow that owns it, which runs it through
`dispatchUserText` — so it is indistinguishable from typing, because it *is* that
path: alias resolution, `;` splitting, the `>` echo, command history, the session
log, and the slash intercept.

```
renderer  window.api.sendUserText(sessionId, text)
   main   SEND_USER_TEXT → ownerWindow(s).webContents.send(USER_TEXT, …)
renderer  GameWindow (matching sessionIdRef) → dispatchUserText(…, { clearInput: false })
```

**Main is the hop, and that is load-bearing.** Quick Send targets the
cross-window roster; a renderer DOM event only reaches the window that fired it,
so a character in a DECOUPLED window would have silently received nothing. The
first draft of this used a DOM event and would have broken exactly that case —
the raw path had it right by accident, since it already went through main.

Details worth keeping:

- **`clearInput: false`.** The sender owns its own field; this must never reach
  into the target's command bar and wipe a half-typed line.
- **`sessionIdRef`, not a captured id** — a tab Reconnect swaps the id without
  remounting (pitfall #86), and the listener is mounted once.
- **A disconnected target is named, never silently promoted.** If the picked
  character drops while you are typing, the bar says "target offline" and Send
  does nothing. Falling back to the broadcast would turn a one-character command
  into an everybody command — the worst failure available here, and the reason
  Quick Send's own `lostTargets` exists.
- **The target picker is a `select`, not chips** — it must not grow with the
  roster (pitfall #109).
- **Slash on a broadcast runs per character** (Sekmeht's call): `/highlight add`
  fanning out to everybody is the best reason to have a broadcast. Accepted wart:
  a toggle like `/view` flips once per target. Documented rather than
  special-cased.
- **Type-anywhere** mirrors F60, mounted only while the view is open so it cannot
  steal keystrokes in Session view. The slash PALETTE is still the command bar
  only — these surfaces get no completion.

### 47.5f Two rendering contracts the cards depend on (v0.19.1, Binu)

**The feed clips the OLDEST content, never the newest.** Lines are not capped.
The feed is bottom-anchored (`justify-content: flex-end`) with the overflow
hidden, so when a card holds more text than it has room for, the top scrolls away
and the newest line is always whole. This is the game window's behaviour, and the
card's governing rule is that it should read like one.

It shipped the other way round in v0.19.0 — each line capped at three rows — and
that failed twice over (B277). It truncated the **tail** of a long room
description, which is the half you are reading; and it never cut on a row
boundary, because `.text-line` re-declares `line-height: var(--game-line-height)`
(the user's PROSE setting, 1.4–1.6) while the cap was written in `1.3em`. A 3.9em
box against ~1.5em rows is 2.6 rows: two whole rows and a sliver. **The rule that
generalises: before doing arithmetic in rows, check what the CHILD declares** — a
child re-declaring `font-size` or `line-height` invalidates any `em` maths done in
the parent's terms. Not counting rows at all is what makes this correct without
arithmetic (pitfall #116).

Two riders on the same rule. The feed's line rule is scoped
`.ov-card-feed > .text-line` (0,2,0) so it beats `game.css`'s `.text-line`
deterministically rather than tying at equal specificity and losing on bundle
order (pitfall #111). And the `min-height` that keeps a blank game line holding a
row is expressed in the row's own metric,
`calc(1em * var(--game-line-height, 1.4))`, so it cannot drift from the
line-height that renders it.

**The card's dropdown selects WHAT IT SHOWS, not which stream (F103).** Picking
**Experience** renders the compact experience view instead of a text feed. That
supersedes v0.19.0's exclusion of `exp` from the list, and the supersession is
worth stating because the original reasoning was CORRECT: experience is assembled
from `exp-component` events into a state map, there are no `TextLine`s behind it,
and a feed of it could only ever say "nothing yet". What changed is not the
diagnosis but the card — once it can render state, the entry earns its place. The
remaining exclusions are the ones nothing renders: `map` is graphical, `injuries`
already surfaces as the wound chip, `room` is structured sub-streams,
`lichScripts` is the `;listall` poll, raw/debug are diagnostics.

**Shared filter and order; separate markup.** `compactExpRows` (expParse.ts)
filters to actively-training skills and sorts them, and BOTH ExpPanel and the
card call it — so the two can never disagree about which skills appear or how
they are ordered. The markup is deliberately not shared: the panel's rows carry
pin buttons and an RXP footer, a card is read-only. Pins are still honoured for
ORDERING, since the skills you pinned are the ones you want at the top of a small
tile; there is simply no toggle on a card. This is the same split the injury and
exp parsers already use — share the rule, not the copy.

Three details that are easy to get wrong. It is **memoized on the skills map**:
`compactExpRows` parses every entry and the comparator parses again, while a card
re-renders on every game line. It is **TOP-anchored**, unlike the text feed —
a feed clips its oldest line because the newest matters most, whereas a table's
first row is its most important, so this clips the tail. And sort follows the
character's saved preference **read once at mount**, because ExpPanel owns that
state and emits no change event; reading localStorage every render on a
per-game-line component was not worth instant sync, and the staleness window is
one remount.

**A quirk pinned rather than fixed:** `sortDesc` multiplies the comparator, so
for `alpha` it is FALSE that yields Z→A and TRUE that yields A→Z. The name says
the opposite of what it does for that mode, the panel's stored default relies on
it, and renaming it would change behaviour for everyone — so the harness pins
both directions instead (section K). It caught an inverted assumption about that
flag during this very build, which is the argument for the case existing.

**The RT/Cast/Aim strip is a MEMO'd leaf, and that is load-bearing (F102).**
`useTimers` runs a 100ms interval while anything is counting. The Overview card
is deliberately NOT memoized — its `stats` object comes back fresh from
`useSessionStats` on every render, so a shallow compare could never bail — which
means calling `useTimers` at card level would re-render each card, feed included,
ten times a second for every character in combat. Inside `CardTimers`, whose
props are three primitives, the tick repaints three divs and an unrelated card
re-render does not reach it. `useTimers` returns early at all-zero, so a calm
dashboard runs no interval: the §35.6 "free until used" rule again.

**The strip's height is always reserved.** A card that grew when a roundtime
started and shrank when it ended would twitch through every fight — the quiver
class this view has already been bitten by. The empty lane paints as a faint
groove so a running timer reads as filling a track that was already there.

Colours and precedence come from the game command bar (`--rt-end` / `--ct-end` /
`--aim-end`, cast over aim because cast is the PvP-critical one), so a lane means
the same thing wherever it is read, and aim is scaled against cast's max while
cast runs so the two widths are comparable in absolute seconds.

**The Overview is STICKY (F106).** Nothing in it moves you between views by
accident; leaving is a deliberate act. Three mechanisms:

**Theme OWNERSHIP freezes on entry — not theme application.** Exactly one
GameWindow writes theme + per-character settings to the document, and it was
always the ACTIVE character, so a tab click from the Overview transferred
ownership and re-themed the dashboard underneath you. Freezing WHO owns it fixes
that without breaking the documented behaviour that a theme picked from the
Overview still lands: the owner's effect still re-runs on `currentThemeId` /
`settings`, it just no longer changes hands on a tab click. Leaving releases
ownership to whoever is active, so the character you land on applies its own
theme and ordinary Session tab-switching is unchanged. Known and ACCEPTED
(Sekmeht): settings edited in the Overview belong to the active character, which
may not be the owner, so they appear on leaving — the same behaviour as editing a
background character's settings in Session view, and cards already re-map their
own font inline, so only the summary strip and input bar are affected.

**A card click SELECTS rather than navigates**: it aims the input bar at that
character (an accent ring — border only, no background tint, Sekmeht) AND makes it the active tab (B320), while you stay
in the Overview — only the tab strip above moves. Clicking a tab already did the
reverse (F101, below), so the two gestures are mirror images and there is ONE
selection: whatever wears the ring is what you are typing at and the tab you will
land on. Clicking empty grid space widens the bar back to All and leaves the
active tab alone (it has to point at someone). That is why the target lives in
`overviewStore` rather than the bar — three surfaces read and write it.

**Cards do not mark the active tab (B320).** They used to wear an `--active`
accent border and a "current" chip for the character Session view would show,
deliberately distinct from the target ring. In the default All state that made
one card look selected while the bar said everyone was — and beside a target
picker, "current" reads as "selected". Renaming the chip was not enough: once
clicks sync both ways it could only duplicate the ring or, under All, contradict
the bar. The tab strip stays visible above the overlay and already answers "which
tab". Accepted side effect: leaving the Overview lands on the last card clicked.

**Highlighting shows who a send reaches (F112, v0.19.7).** While the Overview is open, the cards (GameWindow's `selected`) and the tab strip (`CharacterTabBar`'s `isHighlighted`) both highlight the input bar's TARGETS rather than `activeId`: the one selected character, or — under All characters — every CONNECTED one. The bar's All skips disconnected characters, so their cards and tabs stay unlit rather than claim to be targeted. The first cut lit nothing under All; Sekmeht preferred all-lit, which states the same fact affirmatively and makes "who will this reach?" answerable at a glance. `activeId` is not changed by any of this — it is still where Session view lands. The strip reads only `useViewMode` / `useOverviewTarget`, which return primitives, so card-digest publishes never re-render it. The tablist declares `aria-multiselectable` in the Overview, because All characters puts `aria-selected` on several tabs at once. Known trade-off: tab hover excludes active tabs (pitfall #107), so under All no lit tab shows a hover effect — the tabs' styling was deliberately left as-is (Sekmeht).

**Leaving takes intent:** double-click a card, or "Go to <name>'s game session"
from its menu — an OPTIONAL entry in the shared builder, so the character tab's
menu does not grow one (a tab already navigates when clicked). Keyboard parity:
Space selects, Enter opens, so neither gesture is pointer-only.

**The target resets on EVERY view change** (`setViewMode`), not on the bar's
unmount. It used to reset for free because it was component state; moving it to
module scope silently removed that, and re-entry began restoring the last target
(B284). The reset lives in the store so it holds however the view is changed —
toggle, menu action, or `/view`.

**The bar's target FOLLOWS the active character (F101).** Ctrl+1..9, Ctrl+Tab and
clicking a tab all route through the same `setActive`, so the bar watches
`activeId` and needs one mechanism rather than three. It moves only on a CHANGE:
the tracking ref is seeded at mount so the first render is not read as a switch,
which is what keeps **All characters** as the opening state on every visit. That
deliberate seeding is the inverse of pitfall #12 — there, seeding hides a real
first change; here hiding it is the requirement. A null previous value is the
roster resolving, not a choice, and is ignored too.

This depends on two things worth stating because a future change could break
either silently: the app bar is NOT view-gated and paints above the overlay, so
its tabs are genuinely clickable while the dashboard is up; and
`refocusActiveCommandBar` early-returns in Overview (added with B270), so a tab
switch cannot pull focus into the covered game command bar mid-sentence.
`Ctrl+0` is deliberately absent — an Electron-reserved zoom accelerator the
operational guardrails forbid rebinding.

**The input bar's command history belongs to the BAR, not to the target.**
↑/↓ mirror the game bar exactly — newest first, the live line's draft stashed on
entering history and restored on the way back down, Enter always returning to the
live line, the same app-wide `commandHistory.minLength` gate, a consecutive-repeat
check, and ↓ clamped at −1 (B120, which was Binu's own report against the game
bar; there was no reason to ship it twice).

The history's LIFETIME is the window's, not the visit's (B303, v0.19.2): the bar
is rendered `{open && …}` so it unmounts on every Session⇄Overview flip, and the
array originally lived in a component ref — per-visit against the documented
per-window intent (pitfall #132 in reverse). It now lives in `overviewStore`
(module scope = window lifetime, capped at 200); the browse index and the
stashed draft stay component-local on purpose, so re-entry starts at the live
line with a clear draft.

Whose history it is was the only real decision. This one control can be aimed at
any character or broadcast to all of them, so *"recall the last thing I sent"* is
the only phrasing with an unambiguous answer: a per-character history would change
what ↑ gives you depending on a dropdown, and mean nothing at all while targeting
All. It is in-memory and per-window — a scratch surface, not a character's record,
so it deliberately does not ride `state:` into a profile. Each character's own
persisted history is untouched, because a command sent from the bar still reaches
that character through its own `dispatchUserText`.

### 47.6 Cost

**Closed:** two instructions per event batch and nothing else. The portal is not
rendered, so §35.6's "free until used" applies without needing main's help.

**Open:** the card renders inside its GameWindow's existing pass, so it adds a
fixed per-render increment rather than per-line work. Three things are mandatory:
`summarizeExp` / `summarizeInjuries` are `useMemo`'d on their raw inputs (~40
regexes otherwise, per character, per render); the feed passes module-level
`EMPTY` arrays and `nameRegex={null}` so `TextLineRow`'s `hasExtras`
short-circuit skips the highlight/contact pass; and the 1 Hz clock is ONE
interval in the shell published via context, not one per card (the
`CharacterTabBar` shared-tick precedent).

The global keydown handler early-returns while the Overview is open: the command
bar and main text are still in the DOM underneath, so otherwise a printable key
would focus an invisible input (F60) and a macro would fire at an unseen
character.

### 47.7 Persistence and surfaces

Options are **app-wide** (`SharedProfile.overview`, optional → non-breaking, no
version bump): the Overview is cross-character by definition, so a per-character
copy has no answer to "whose wins when three are open" and breaks the moment a
character is decoupled. **The view MODE is per-window ephemeral** — each
BrowserWindow has its own store instance, so a decoupled window showing one
character is never dragged into the main window's view.

Surfaces: the app-bar toggle (with the attention badge), Settings → Overview, the
View menu (click-only, no accelerator), and `/view` — bare toggle plus `status`,
`sort`, `set`. `/view status` reports the same reduction the grid renders, so the
two cannot disagree.

### 47.8 Phase 2 — cross-window (specified, not built)

Decoupled windows own a subset of sessions, so v1 is honestly "characters in this
window". Remote tiles would come from main's per-session `stateSnapshot`
(`main.ts:77`) — already maintained free for the handoff replay — broadcast
throttled behind an `overview-active-toggle` mirroring `scene-active-toggle`.

A remote tile is necessarily **reduced**: condition and situation, but **no text
feed**. Main's `historyBuffer` holds raw `GameEvent`s, pre-mute/substitute and
pre-`TextLine` assembly, so rendering it elsewhere means reimplementing the
display pipeline. Click a remote tile → main focuses that OS window.

### 47.9 Phase 3 — log-backed history (specified, not built)

`buildCatchupDigest` (`sessionLog.ts`) already carries **verified** extractors for
ranks gained, deaths, damage taken (the confirmed 22-level ladder), coin flow
(real ratios from Lich's `drbanking.rb`) and work orders. It walks day files with
`setImmediate` yields and is **not** a per-tick source. Lift the extractors into
`runLogExtractors(rows)`, add a cached on-demand handler, and surface it as a
collapsed per-card "today" section fetched on expand — which also delivers
backlog item **F93** (session summary card) nearly for free.

---

## 48. Attach Mode — connect to an already-running Lich (PR #2, Kahlen, v0.19.4)

### 48.1 Why

Lichborne could connect two ways: **launch Lich** for you, or go **Direct** to the
game. Both tie the game session's lifetime to the client's — closing Lichborne
logs the character out. Attach adds a third: connect to a Lich that is **already
running and logged in**, so the session outlives the front-end. Close and reopen
without losing your place, survive a front-end crash with the login intact, pick
a character up from another machine, or watch one session from a second
front-end alongside the first.

This is squarely inside the product position (§1, §24): it is *display and
configuration over Lich*, adding no automation. Lich already does all the work;
Lichborne just learns to speak to a listener it wasn't previously using.

### 48.2 What Lich provides (verified — full citations in Knowledge.md §19)

An attachable Lich is started `--headless PORT` (sugar for
`--without-frontend --detachable-client=PORT`). Its listener takes a **bare TCP
connection with no auth and no handshake**; on accept Lich pushes a state resync
(vitals, prepared spell, indicators, compass) and then the live stream. Multiple
front-ends may attach at once and a detachable client dropping does not end the
session. **Only an attachably-started Lich can be attached to** — a normally
launched one accepted its single front-end and closed the listener, so this
cannot and does not try to reach those.

### 48.3 Architecture

- **`AttachConnection`** ([src/main/connection/AttachConnection.ts](src/main/connection/AttachConnection.ts))
  is the transport, deliberately free of electron imports so a plain-node harness
  can exercise the protocol. It **sends nothing on connect** — no login key, no
  `FE:` line — because anything a detachable client writes is dispatched to the
  game as a command. TCP keepalive at 30s: an attach target is often not
  loopback, and an idle connection through NAT gets reaped by intermediaries
  that tell neither end.
- **`ConnectionManager`** gains mode `'attach'` and `connectAttach()`, translating
  ECONNREFUSED into "start Lich attachably" rather than a raw errno, and issuing
  a post-attach `look` (Lich's resync covers everything *except* the room).
- **`main.ts`** adds `CH.LOGIN_ATTACH` mirroring `CH.LOGIN`'s lifecycle —
  **including the hold-for-replay** (§13.9 / pitfall #60), because the
  attach-time resync would otherwise be flushed into a window that has no
  GameWindow subscriber yet. Sessions carry `useLich: true` so the Lich Scripts
  panel and the rest of the Lich-only surface stay live.
- **Auto re-attach** on an unclean drop — 2/4/8/15/30s backoff then a 30s
  heartbeat — reconnecting **in place** (pitfall #69's shape: the GameWindow is
  keyed by characterId and just receives a new sessionId), so the tab, scrollback
  and panels survive. **Deliberately uncapped:** the session outlives the client,
  so giving up is precisely wrong — a cap would quit exactly when the player
  wanted it back.

### 48.4 Disconnect DETACHES; `exit` logs out

`gracefulDisconnect` in attach mode **half-closes and never sends QUIT**, for both
the in-tab Disconnect and app shutdown — that is what makes the session outlive
the client, and it is the whole point of the feature.

Typing `exit` remains a deliberate log-out, and this is **not** a Lichborne
choice: Lich runs a full orderly shutdown of the entire session for a user-exit
command from a detachable client (`user_exit_dispatch.rb#dispatch_detachable_client`).
A front-end cannot soften it, so the asymmetry is **documented at the user** in
release-notes and the User Guide rather than hidden.

### 48.5 Target persistence and reconnect planning

`CharacterProfile` grows an optional **launcher-owned** `attach?: { host, port }`,
written on each successful attach through the `setCharacterGame`-style
read-modify-write (pitfall #26 — never through GameWindow's debounced save). It
drives the tile ⋯ menu entry, the modal prefill, an attach-first tile Connect
(falling back to a normal login when nothing is listening and the tile has a real
account), the tab's Reconnect, and the bulk paths.

`planReconnect` ([src/renderer/reconnectPlan.ts](src/renderer/reconnectPlan.ts))
gains an **attach branch that bypasses the account arithmetic**. Those rules exist
to protect a *login* from DR's one-character-per-account law; an attach starts no
login, so the dedup/already-on/conflict-chooser machinery does not apply. The
login-mode rules are pinned unchanged by harness regression cases.

### 48.6 No slash command — recorded decision (Principle #11)

**Attach ships with no `/` command, by decision** (Sekmeht, v0.19.4). Principle #11
requires the question be asked explicitly and the "no command because X" answer
recorded rather than skipped silently; this is that record.

The reasoning matches the Experiences precedent (§34.6): attach is **one-time
setup, not an in-play verb.** You attach once per session from the launcher, and
thereafter the saved target makes it a single click on the tile — there is no
repeated action a command would accelerate, and the three fields it needs
(character, host, port) are exactly what a form is better at than a command line.
Revisit if attach ever grows an in-play action (re-attach on demand, switching
targets mid-session) — that *would* deserve a verb.

### 48.7 Known edges (accepted, left as-is)

- An **attach-only character** never added through the wizard gets a minimal stub
  profile under an `attach` placeholder account, so it has a tile to reconnect
  from. Deliberate, but a design choice worth revisiting if it clutters rosters.
- A **`--genie`-flavoured** headless Lich sends no attach-time resync at all and
  suppresses stream tags (genie is registered without the `streams` capability).
  Plain `--headless` is the shape to recommend; this is a Lich-side property.
- **The parser is REUSED across an auto re-attach (B310 — open, unpatched).**
  Every other connection path gets a fresh `StormFrontParser` because a new
  connection means a new `Session`; auto re-attach reuses `s`, so a drop that
  lands mid-block can carry `activeStream` / `streamStack` / `monoMode` into the
  new socket, filing subsequent game text under a stale stream with nothing to
  self-correct it. The prompt boundary already scrubs the inline style state
  each turn, so an idle-time drop — the common keepalive case — is harmless.
  Pre-existing gap (`reset()` has never had a call site), newly reachable.
  Deliberately left for the author's call rather than patched; the fix, if
  accepted, is `s.parser.reset()` before `connectAttach()` in `scheduleReattach`.
- **Auto-discovery is not attempted.** Lich writes a session descriptor file
  (`{name, host, port}` JSON) per character when detachable, which would remove
  the host/port entry entirely and the risk of mislabelling a tab by typing the
  wrong character name. The natural next step for this feature.
