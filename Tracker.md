# Lichborne — Development Tracker

> Tracks where we are in active development.
> DESIGN.md tracks ideas and spec. This file tracks build progress.
> BUGS.md tracks open bugs and feature requests from testers.

---

## v0.19.9 — (in progress) · The first memory audit · A core of CPU spent on nothing

- **Two audits on axes this project had never measured, both triggered by one vague report** (*"it seems to use more memory than I remember"*, no recollection of when). Full findings in DESIGN §45.11 (memory) and §45.12 (CPU). **Neither turned out to be a recent regression** — the significant things found date to v0.3.0 and v0.6.x — but both produced real fixes, and the process lesson is recorded in CLAUDE.md's new "Performance: NAME THE AXIS" section.
  - **The method that worked, twice: measure the running process before reading code.** Splitting the live client by process put the memory in the renderer (peak **1,408 MB** vs main's 251 MB) and the CPU in the GPU process — and that **refuted** a well-argued code-derived hypothesis that `/ai catchup`'s digest was the memory cause, since it runs in main. Then correlating CPU against session-log growth showed renderer CPU had **no relationship to game-text volume** (r = −0.061 across a 2.7× range, floor 55.7% of a core), which exonerated the per-line rule path before a file was opened. A harness later confirmed it at ~1% of a core against 49% measured.
- **Memory (B461–B463).** The map subsystem dominated. `imageCache` had **no eviction of any kind** since v0.3.0 (273 tiles ≈ 35.7 MB base64, plus decoded bitmaps in compositor memory) — now an LRU at 30. The Lich map database (14.7 MB, ~52k rooms) and Genie cache (12.3 MB) were parsed **per character across two mount sites** — now module-level caches keyed by source path with in-flight dedup, sharing the WORLD while every per-character value stays component state (pitfall #159). And the per-stream cap inverted into unbounded growth at exactly 500 lines, because `slice(-0)` is `slice(0)` (pitfall #158).
- **CPU (B464–B466).** Three things ran forever that were meant to run briefly. The Moons sky crossfaded four full-panel layers with a **2.5s transition against a 2s tick**, and the Spell Monitor's bars a **1s transition against a 1 Hz clock** — in both cases re-armed at the instant the previous one would finish, so they never completed (new pitfall #160; fixed at the VALUE by quantising, so an unchanged frame fires nothing). And `;listall` polled every 5s for a Scripts panel that was not on screen, because the gate tested tab **existence** rather than visibility — the same mistake B307 fixed for the AI stream, now sharing ONE `visibleTabIds` definition with `activeIdsRef`, which had implemented the rule correctly all along (pitfall #127).
- **Corrections to claims that had drifted** — the point of a doc pass being part of this rather than an afterthought. CLAUDE.md said the map auras are "static (no animation, no per-frame cost)"; `genie-aura-fire` animates over the uncapped node set. It documented a 3000px Virtuoso overscan that v0.18.5 cut to 1200. `StormFrontParser`'s own header instructed calling `reset()` on every login, which has **zero call sites** — freshness comes from a fresh Session per login, and the one path that reuses a parser is attach auto-reattach, i.e. the open B310. global.css asserted transitions are "one-shot and already over", which is exactly why B464/B465 escaped the minimize-pause. DESIGN §45.8's "zero layout-triggering animations" missed the SVG `r` property, and could not have seen a transition at all.
- **Filed, deliberately not acted on:** 278 of 656 match rules (42.4%) carry no literal gate and account for **98.9% of all regex executions** (~47 µs/line, about half the render cost) — imported alternation-shaped rulesets that `extractRegexLiteral` correctly refuses to gate. A multi-literal "any-of" gate would recover most of it, but at ~1% of a core it buys nothing noticeable. Also unfixed: `CATCHUP_MAX_MINUTES` is one YEAR against ~80k lines/day, a real hazard nobody has hit; and two release tags (`v0.15.0`, `v0.17.3`) point at the PREVIOUS release's tree, so anything built or bisected from them is wrong — that one needs a force-push and is Sekmeht's call.

---

## v0.19.8 — Named colors that stay linked · Line highlights paint their text effect, and layer with word highlights

- **The v0.19.8 boundary sweep: PARTIAL. Six of fourteen dimensions are done; seven are still unswept.** A retry (6 dimensions, single-vote verify, three-way verdicts) ran clean — 15 agents, 0 errors, 0 unverified, ~5.3M tokens — after the first attempt died. **Swept and closed:** theme-safety, ColorField, react-perf (returned CLEAN), persistence, the F119 header + ui-menu migration, and the named-colours core. **Still unswept:** line-effects, trigger-echo, contacts, font-scaling, css-cascade, slash-surface, keyboard-focus. It found 8 confirmed defects, all fixed below; **four of the eight were in code written the same day**, which is the argument for sweeping before a version closes rather than after.
  - **What made the retry work where the first died:** it was sized to finish (~30 agents rather than ~200), it dropped the two synthesis agents that had previously taken the whole report down with them, and its verdicts are three-way so a failed check reports as `unverified` instead of being silently folded into "refuted". The first attempt's harness did exactly that and returned a false all-clear.
- **Sweep fixes (8 findings, 5 changes). None carry a B-number: every one is a defect in UNSHIPPED v0.19.8 code, the pitfall #108 precedent.**
  - **Bare `var(--accent)` as a glyph fails on dark-accent themes — three places.** The ⋯ "Analytics on" marker measured **1.87:1 on Barbarian against 3.84:1 for the OFF state**, so switching the feature on made its own indicator *dimmer*; on Commoner the two colours were near-identical and the cue said nothing. The shared `.ui-menu-mark` ✓ measured 1.83:1 and was the ONLY on/off cue in the ⋯'s checkbox row, so it would have propagated to every future menu adopting a ✓ gutter. The swatch grid's outlines were 1.83:1 selected / 1.19:1 hovered. All now take the house ratios — **60% toward `--text-primary` for a glyph, 40% for text** — which pitfall #150 already prescribed and names Barbarian's 1.9:1 in. I had the rule and didn't follow it.
  - **The ⋯'s state no longer rests on colour alone,** and its hover now EXCLUDES the marked state. Its predecessor `.at-analytics-btn--on` carried accent text plus a 55% border plus a 14% fill; dropping two of three is what made it fragile. The bare `:hover` (0,2,0) was also outranking `--marked` (0,1,0) and replacing the marker under the cursor — pitfall #107, found while fixing the contrast.
  - **The `$` menu's children were never re-read after it moved to `--bg-raised`** in the ui-menu migration (pitfall #55 — changing a shared surface means re-reading everything drawn on it). Token, description and section label retuned for a popover surface.
  - **ONE hex predicate, `hexFromTyped` in colors.ts.** ColorField's `commitDraft` and `normalizeColorInput` disagreed in OPPOSITE directions: `#fff` was rejected by the first (so the Theme Editor silently reverted it) while a bare `3fb950` was kept by the second as text that painted nothing — the same keystrokes behaving differently depending on which host you typed in. `hexLuminance` already accepted a bare hex, so the file was arguing with itself. Both callers now ask one function (pitfall #127); a NAME still wins over a bare token.
  - **The ⋯ menu re-places on resize.** Its position is `fixed` and was computed once at open, so a resize left it detached from its button. rAF-throttled, matching ColorField's placeMenu.
  - **ColorsPanel's Save no longer silently no-ops.** The palette is app-wide, so another window can delete a colour for good mid-edit; `palette.map` then matched nothing, wrote the list back unchanged, and the next two lines marked the draft CLEAN — the edit vanished from an enabled Save button. Now it keeps the draft dirty and says what happened.
- **⚠ Superseded note (kept for the record): the first sweep attempt did NOT complete.** A 14-dimension agent sweep over the uncommitted v0.19.8 surface (the six features plus eight cross-cutting pitfall classes, each finding adversarially refuted by three lenses) ran for ~40 minutes, spent ~9.1M subagent tokens, and then lost 67 of its 79 agents to a session limit. **Its `confirmed: 0` result is NOT a clean bill of health** and must not be read as one: four finders (theme-safety, ColorField, react-perf, persistence) never ran at all, both synthesis agents died, and — the part worth remembering — the harness counted an ERRORED verifier the same as a refuting one, because the survivor test read an empty verdict array as "did not survive". So its `refuted: 21` conflates "checked and cleared" with "never managed to check". Nothing was written (every agent was read-only) and no finding from it is recorded anywhere. **The sweep still needs doing** — smaller, with a failure path that reports "unverified" rather than swallowing it. See the CLAUDE.md note under "Retroactive sweeps at version boundaries".
- **F119 (Sekmeht): the Automations title bar was doing five jobs at once — split into an identity band and a sub-bar, and the Lich Dashboard with it.** *"The options in the title bar of Automations is kind of hard to understand… it's just not intuitive or it's not very well separated."* One flex row at a uniform 8px gap was carrying navigation (8 tab chips), context (the scope switch), a persistent mode (Analytics), a once-ever action (Import) and dismiss — five kinds of control at one visual weight, with the accent painting three different meanings in the same row and `flex-wrap` plus a shrinking title already conceding the crowding in CSS.
  - **The shape:** row 1 is the accent band with the title, a **⋯** and the ✕; row 2 is a quiet sub-bar with the tab chips and, right-aligned, an **"Applies to"** label beside the scope switch. Analytics and Import became rows in the ⋯, which wears an accent dot while Analytics is on — the app bar's own convention for a More menu hiding something open, so the mode stays visible without a permanent "Off" chip.
  - **The placement rule, now in DESIGN §43.8 and CLAUDE UX #10:** a header earns a second row when it carries anything that isn't navigation, or when navigation alone overflows; and once split, *what qualifies the dialog stays in the band, what qualifies the current tab goes on the sub-bar.* The scope switch is disabled on two of eight tabs, which is what proves it belongs below. **The Theme Editor already had this shape** and is the reference — this named an existing pattern rather than inventing one. Contacts and the Theme Picker were deliberately left alone at two and three tabs.
  - **The Lich Dashboard got the same split,** and it was the clearer case: it was already carrying B373's `.lp-header-main`, a wrapping inner row whose only job was to stop the ✕ being pushed off-screen — a workaround that is itself the symptom. Both dialogs now use the shared `ui-modal-head`/`ui-modal-title`, deleting four byte-equivalent private copies, and Automations' tabs use `ui-tabs` (closing **B456**'s tab clause and picking up `role="tablist"`/`role="tab"` they never had). Watch the trap: the ✕'s right-alignment came from the deleted wrapper's `flex: 1 1 auto`, not from the button.
  - **The ⋯ menu reuses the Macros "$" picker,** one of only two popovers already on the right side of B455 (it moves focus into the menu and hands it back), plus three things it lacked: GroupPicker's flip/clamp placement, focus restore on outside-click, and `cancelBackdropPress()` so one click outside doesn't close the menu *and* the dialog (pitfall #146).
  - **Then the follow-through on B456 (Sekmeht: "lets fix 1 and 2").** The ⋯ menu I'd just added was itself a fifth copy of a recipe already written four times, so it got unified rather than logged. `ui-menu` / `ui-menu-item` (+ `--on` / `--baseline` / `--nowrap` / `ui-menu-mark`) now live in ui.css, and GroupPicker, the Macros "$" picker, ColorField and the Automations ⋯ compose them.
    - **The membership rule is rem-vs-em, and it is load-bearing.** A menu opened from a DIALOG is fixed-size app chrome; one opened from GAME-AREA chrome must track Settings → Font Size (Principle #9, pitfall #45). The convertible set turned out to be *exactly* the z-450 dialog-popover tier, and the five game-tier menus stay out — `.panel-add-item` had been converted rem→em as a **bug fix** (B290), so giving it the primitive would have re-opened that bug.
    - **Composed, not replaced.** Two of the four query their own class for ↑/↓ roving focus and one styles its children through `.ma-var-item code` / `span`; swapping the class would have silently killed keyboard navigation and child styling with nothing — not tsc, not the build, not a screenshot — to catch it.
    - **Two differences normalised rather than preserved,** both drift with no comment defending either: hover moved to `--modal-ctl-hover` (translucent, correct on a dialog surface) from `--bg-hover` (an opaque per-theme hex meant for the app background), and two menus' `--bg-base` surface moved to `--bg-raised`. Deliberately visible changes, not silent ones.
    - Deliberately NOT added: `--danger` and `--disabled` (no caller in the convertible set; the one menu with a disabled row is game-tier) and any ARIA change — three of these menus have no roles at all, but adding roles without focus management is half a fix and belongs with **B455**.
  - **Alignment audit found four real things** (two agents, computed box numbers rather than eyeballing): **B460**, the Lich session pill rendering as a rounded rectangle because a missing `line-height` pushed the box past twice its `border-radius`; a ✓ sitting 2px off-centre in its gutter; the ⋯ menu right-aligning against a width estimate 7px under the real box; and ~1px of `letter-spacing` air widening the "Applies to" gap. Verified clean: the scope buttons and tab chips match at **exactly 24.224px**, both ⋯ glyphs are the same non-emoji codepoint (U+22EF, so B410 doesn't apply), and the ✓ is U+2713 — its heavy neighbour U+2714 *is* emoji-classified and would have needed a variation selector.

- **F115 (Elore, then "Aubrey"; Sekmeht's extension): your own named colors, linked wherever you pick them.** Change "Buff drop" once and every highlight, trigger echo, contact template and group using it changes. DESIGN §49.
  - **The link is a CSS variable in the existing string field:** `var(--lb-color-<id>, #fallback)`, with `--lb-color-<id>` defined on each window's root from the app-wide palette. Every render site already writes these fields straight into inline CSS, so there was no render-path change and no per-line cost. That was the objection that had deferred live references in §37.2. Verified in Electron 43: a rendered highlight's computed color changed live when its palette entry did.
  - **Identity and removal:** a new `id` on palette entries; legacy `/colors add` entries get a deterministic slug id, so older colors link immediately. Removing a color RETIRES it: out of every list, its variable still defined, so nothing changes color. The Colors tab can Restore or Delete for good (links then show their fallback).
  - **UI:** the new Automations → **Colors** tab, and **ColorField**, one shared control replacing eleven hand-rolled picker pairs (Highlights ×3, contact templates ×6, Groups, trigger echo). The field offers your colors (link), built-ins (copy), a custom picker, "none", Unlink, "Save as a color…" and "Manage colors…". Contacts' "Manage colors…" opens Automations → Colors.
  - **Hex consumers:** trigger echo resolves the color when it fires (a text segment needs a bare hex), and summaries and the Debug Fires label print the color's name. Themes still store hex.
  - **Slash (Principle #11):** `/colors add` now takes names with spaces and restores a removed color; new `/colors rename` and `/colors manage`; `/colors remove` retires; `/highlight add` and `/template add` link your colors; the palette chips list yours first.
  - **Transfer:** bundles carry `linkedColors` (no format bump), and imports merge colors before rules; a same-name color remaps to your id instead of duplicating.
  - **Profile:** optional `id`/`retired` on `SharedProfile.customColors`, non-breaking; rules keep their fields.
  - **Removed dead CSS** from the old pickers in highlights/contacts/groups/triggers.css. The Theme Editor got its own tooltip text, since it never links.
  - Verified: both type-checks clean; tmp-rules-harness 372/1 (53 new §N cases, the known GemStone failure); tmp-hl-harness 21/0; a scratch Vite build; an Electron harness that rendered the Colors tab, the ColorField popover, the Highlights editor and the Contacts template editor on the dark theme and Classic Light, and exercised linking and a live recolor. **Not yet run inside the app.** New pitfall #149.
  - **Follow-up (Sekmeht): the color box is a dropdown.** A swatch doesn't look clickable, so the menu was hard to find. The text box now has a joined ▾ (and the linked chip a caret) that opens the full menu. Typing a name opens a suggestion list: your colors first, then built-ins, then web names from 3 characters (`suggestColors`, pure). ↑/↓ and Enter or a click pick, and focus stays in the box (combobox semantics). Esc closes only the list, and Alt+↓ opens the menu. Verified in the Electron harness: typing "bu" offers Buff drop, Enter links it and focuses the new chip, Esc is claimed, ▾ opens the menu, on dark and Classic Light. Rules harness 382/1 (10 suggestion cases).
  - **Theme pass (Sekmeht): measured, not eyeballed.** An Electron audit rendered every state of the color field and the Colors tab under all 20 themes plus high contrast (22 runs, 770 WCAG checks) and compared each against plain theme text on the same surface. Fixed everything that read WORSE than the app's own baseline:
    - the "as a background" preview used white text with a halo on any user color (2.25:1 on orange); `readableTextOn` now picks black or white from the fill;
    - popover and suggestion labels moved from `--text-dim`/`--text-muted` to `--text-secondary`, because `--bg-raised` is lighter than the dialog on light themes;
    - accent-drawn glyphs mix toward `--text-primary` (Barbarian's accent measured 1.9:1);
    - carets and the removed-color chip use `--text-secondary`;
    - the use-count badge became a hairline ring instead of a tinted fill;
    - removed colors are italic `--text-secondary` instead of the 45%-opacity disabled look (~2:1);
    - the invalid-hex preview no longer paints `#888888`.

    **Result: 0 checks worse than baseline.** The 109 below 4.5:1 are identical to the theme's own `--text-muted` (every editor's labels and hints) or Thief's `--text-secondary`, plus the shared "+ New" button, which is nearly invisible on Barbarian in every rule editor. Left for a separate, app-wide pass. Pitfall #150.
  - **B429 (Sekmeht): the color popover opened smaller than its content**, so "Save as a color…" pushed Save/Cancel out of sight (Contacts → Templates). It capped its height to the room on ONE side of the field, GroupPicker's rule; a field mid-window got about half the viewport. It now measures the rendered menu and SHIFTS it to fit, capping only when the viewport is shorter than the menu, and re-places on scroll/resize. Repro + fix verified in Electron at four window heights. Pitfall #109 rider.
  - **Bug check (B430–B433).** Three read-only reviewers over the whole feature, then every finding re-checked against the real modules with a bundled probe before anything was touched — one report's claim that the rules harness cannot run was simply wrong, and the probe is what showed it. Found and fixed: two ways a palette could corrupt itself (a name slug stealing another entry's id; an id-less bundle overwriting an unrelated local color), a link rewrite that could edit a rule's PATTERN and that destroyed `undefined`/Date values through a JSON round trip, unvalidated hex that could produce invalid CSS, `/colors rename` acting on removed colors, two summaries printing the raw `var(...)`, the slash chips dropping the built-ins, "Manage colors…" doing nothing once you had switched tabs or with Contacts on top, and three keyboard faults in the popover. 12 new harness cases pin the reproduced failures (394/1, the known GemStone case).
  - **B434 (Sekmeht): a template's edit form ran off the bottom of its card**, so Save and Cancel were out of sight when you expanded one. It was a single column of eleven short rows in a dialog 88vw wide — about a sixth of the width, and taller than the list. The form is now a responsive grid (three columns at full width, one when narrow) with Preview, Groups and the buttons spanning, and opening a card scrolls it into the list. Type-checked and built; NOT run, because every Electron page load in this environment failed.
  - **F116 (Sekmeht): the Theme Editor gets the same color control** — swatch, typable box, and a popover offering your colors and the built-ins, replacing a native picker plus a private text box on ~150 rows. **It COPIES the hex rather than linking**, because a theme travels through a file format that carries no palette; the field's tooltip says so. Two new ColorField props do it: `allowLink` (one decision point for all three pick paths) and `commitTyped` (a draft, so a half-typed `#3f` can't repaint the app live — B387, whose logic moved out of the now-deleted ColorText). Fixed a latent black-swatch hole in the gradient rows on the way past.
  - **Bug check on F116 (B435).** Seven findings, all in code that never shipped, all re-verified against the file first. The one that mattered: the type-ahead was DEAD in the Theme Editor, because suggestions read the stored value while the typed text sat in the new draft — the feature the release notes advertise, silently doing nothing. Also: focus landing on the swatch instead of the box (a single `querySelector` with a selector list matches in document order, not selector order), "No highlight" never reading as chosen because "none" has two spellings, case-sensitive pick comparisons marking a theme dirty for nothing, Esc needing two presses to undo typing, a memo keyed on an object that changes every keystroke, and two gradient ends sharing one accessible name.
  - **B436 (Sekmeht): template Bold did nothing visible, and the tag had no bold.** The name's `<strong>` resolves to `--ui-bold-weight` (600), and the template row hardcoded `font-weight: 600` — so a bolded template looked exactly like an unbolded one in the list. The tag never had bold at all. Both trace to one missing parameter on `paintContactText`, the shared painter that exists so previews and game text can't drift: it had no `bold`, so the game wrapped `<strong>` itself and the tag path didn't. It now owns the decision and returns the element. New `tagBold` field, checkbox, `/template add … tagbold`, round-trip guard.
  - **F117 (Sekmeht): the template card reads as zones instead of a ladder.** *"It's not really obvious where the text options are, then the tag options, or which bg color matches for what."* The auto-fit grid wrapped name and tag fields onto shared rows, so "Tag text" sat beside "Text effect". Now labelled hairline zones — Contact name / Tag / Preview / Applies to — each its own grid, so an effect-colour row appearing reflows only inside its zone rather than shuffling every field below it. "Name" became "Template name" (it was doing double duty against the zone that styles the contact's name), the in-zone labels dropped their now-redundant prefixes, and the tag's styling only appears once there is a tag.
  - **B438 — bold was dead app-wide below the Default text weight, and had been since B113.** Reported as "bold in Contact Templates isn't doing anything"; the previews and the painter were both correct. `--ui-bold-weight` kept a constant NUMERIC gap (`body + 200`), which assumes the font has a face at both ends — true for a variable font, false for Consolas, which ships only 400 and 700. At Text weight Thinnest body asked for 100 and bold for 300; CSS rounds both up to 400, so they rendered as the same glyphs. Same collapse at -0.4 and -0.2 (a request of 500 falls back to 400, not up to 700). Floored at 600 — the lowest request a two-weight font resolves upward to its bold face. Cleared the React side first with a static-markup render of the real painter, then the reporter's own profile supplied the two inputs that made the arithmetic collapse. Pitfall #157.
  - **ContactPopover was a fourth hand-rolled painter** — no `tagBold`, no effects, a hardcoded `fontWeight: 'bold'`. It and both Contacts previews now render through one shared `ContactRun` element, so `paintContactText`'s pieces are assembled in exactly one place.
  - **F118 — a trigger's echo can be styled like everything else we paint.** The Echo action had a colour and nothing else while highlights and contact templates had grown background, bold, effect and effect colour. Added all four, with NO new painter: the style is applied as the echoed line's line layer through `lineLayerFromHint`, the sibling of `resolveLineLayer` that B428 already built, so a word highlight still composites on top exactly as it does over a line rule. It travels on a new optional `TextLine.fx`. The hint is emitted only when one of the new fields is set, which keeps every older colour-only echo byte-identical — including a line-scope highlight still winning the layer over it, as it always did. `echoLineStyle` is the one builder the engine and the editor's new preview share, and the preview calls `renderHighlightedLine` rather than resembling it (pitfall #127). tmp-hl-harness 21 → 35 cases.
  - **Bug check on F118 (B439–B441).** Three real findings, two of them mine. **B439** is the serious one and PRE-EXISTING: `actionSig` hand-listed six action fields, so triggers differing only in an echo's stream, a notify title, a webhook URL or a log file hashed identically — and "Remove duplicate copies" deletes all but the first of each duplicate group, so it destroyed rules that were never duplicates. Derived the signature instead. **B440:** the echo's line-layer colour bypassed `colorHex` while the segment's `fg` went through it, and the layer overrides the segment — so a curated name painted the CSS colour rather than Lichborne's, one of your own palette names painted nothing, and a link made a styled echo live where a plain one snapshots. **B441:** Glow with no colours set rendered no shadow, because the `#ffd060` that three editor fields advertise as their default was never real. Both reviewers found B440 independently; I verified every finding against the source before acting, and one reported stale comment did not hold. Harnesses 21 → 44 (render) and 408 → 416 (rules).
  - **UI/UX sweep (B446-B458).** Five reviewers over layering, theme safety, sizing/typography, keyboard/focus and control vocabulary; every finding re-verified against the source before acting, and one reported item did not hold. **Nine fixed.** The two with the widest reach were invisible in plain sight: the selected row in five rule editors used `--bg-sunken`, a neighbour of the dialog surface rather than a contrast to it, so on Classic Light selection was unpainted while HOVER was louder -- inverted on all 20 themes; and `.text-line`'s literal `min-height: 1.4em` clamped the shipped default line-height of 1.2, so "Compact" did nothing and cost about six lines of game text. Also: the Launcher's Connect button never got the halo its twin `.btn-primary` carries (white fell to 1.37 on Terminal at hover, on the most-clicked control in the app); switching character with the Overview open put the caret in a covered command bar where Enter still reached the game (a third copy of a guarded helper, minus the guard); macros fired through every app-level dialog because the modal list was GameWindow-owned -- now asks the Esc stack via a new `anyDialogOpen()`, and writing that up surfaced the identical hole one handler away, where a printable key focused the command bar behind the dialog (B459); two popovers could open off-screen; the Exp/Injuries/Lich Scripts panels never received the line-height setting or Large Print; and a wording batch, including the bulk rule-deletion that said "Remove" while deleting one of the same rules said "Delete". **Five logged and deliberately not fixed** (B454-B458): dialog tier collisions from the native menu, portaled popovers without focus management, shared-primitive drift, the map's fixed-px prose, and Transfer's literal `0` category pills -- each a behaviour or multi-surface decision rather than a defect.
  - **B444/B445 — the real fix, and an honest UI.** B444: every run of a split line now shares ONE line-wide gradient and offsets into it by its own position (`--fx-bg-size`/`--fx-bg-x`/`--fx-sweep-to` in `ch`, exact because the game font is monospace), so a painted effect reads as continuous however many highlights overlap it — and that fixes line highlights on game text, not just echoes. The vars are set only while splitting and the CSS falls back to the old per-element values, so an unsplit line, a contact and the app-bar wordmark (not the game font) are byte-identical; Fire is excluded as a vertical gradient, and a word highlight with its own effect stays a deliberate island. That let B443's stopgap be dropped, so painted echoes get word highlights back — strictly better. Verified with a new `tmp-hl-harness/gradient/` page that writes a before/after HTML openable in a browser, which is how a visual change got checked at all given Electron can't navigate here (pitfall #154). B445: four effects carry fixed palettes and ignore the colour you pick; rather than tint them (the palette IS the effect) all three editors now say so, from one shared `effectColorNote`.
  - **B443 — a painted echo effect is drawn in one piece.** Reported as three separate symptoms (shimmer in random places, bold switching the effect off, spotty gold) that turned out to be one cause: the six `colorReplacing` effects clip a gradient sized to each ELEMENT, so every run a match highlight created got its own copy of the ramp. Proved it by dumping the real markup — one span with no rules, three spans with a word highlight. A line the user authored and gave a painted effect now renders as a single run. Logged B444 (the same bug on line-scope highlights, which needs a shared-CSS rework and a screen to verify on) and B445 (four effects ignore the colour field and nothing says so).
  - **Deferred:** Phase 2 "find similar colors in use", Phase 3 named highlight styles.

- **B428 (Sekmeht): a Line highlight's text effect now paints in the game window, and a word highlight inside the line keeps its own.**
  - **The root cause was wider than the reported combination.** `getLineHighlightStyle` carried only a line rule's background, colour and legacy Glow, so every other line effect, and line Bold, never rendered anywhere in play. The Highlights Preview was a separate hand-written copy that did show them, which is most likely why a line effect looked fine on its own.
  - **A line rule is now the widest layer of the per-property compositing.** `resolveLineLayer` picks it once per line. The container wears its background, colour and bold. Its effect rides an inner span on every run no match rule gives an effect of its own, so presets, preset backgrounds and links survive. Match runs fall back to it for colour, bold and effect.
  - **One entry point for every line:** `renderHighlightedLine` now serves `TextLineRow` (main window, stream panels, Overview cards), `RoomPanel`, and the Preview. The Preview compiles the draft exactly as the game does, `literalGate` included.
  - **Two per-letter fixes a real line effect needed.** `effectContent` groups each word's letters in a `nowrap` span, because inline-block letters let a line wrap mid-word (measured in Electron 43). The Wave/Bounce stagger now counts from the start of the line and is taken modulo the cycle, so the tail of a long line doesn't stand still for seconds.
  - **Behaviour to know:** a word rule with a colour but no effect wears the line's effect in its own colour (the existing compositing model); contact names get no line effect (B116); a gradient restarts in each run. A Line Glow no longer tints the timestamp or contact names, because it moved off the container.
  - No profile-shape change; no slash change (`/highlight add … scope=line effect=…` already existed and now works). DESIGN §14.5, CLAUDE.md pitfall #148.
  - Verified: both type-checks clean; a 21-case markup harness over the real modules (`tmp-hl-harness`); an Electron screenshot with the real stylesheet; the minified production CSS keeps `mod()`; rules harness 319/1 (the known GemStone case), command harness 58/0. **Not yet run in the app.**

## v0.19.7 — One-click Reconnect · windows that remember · the full login experience in + · an Overview that shows who you're typing to · an Unconscious indicator · a wordmark that can wear a text effect · a 22-bug UI/UX pass · one control system for every dialog (B367–B409) · Lich 5.21 review

- **F114 (Sekmeht): the app-bar wordmark can wear a text effect, per character.** Settings → Display → **Wordmark effect**, default **Static**, which renders exactly what the bar rendered before.
  - It reuses the `HighlightEffect` vocabulary highlights and contact templates already use, so there is one effect system and one stylesheet — and the wordmark inherits the epilepsy-safe freeze for free (verified by script: 10 animated classes, 10 frozen).
  - **Asked whether it belonged in the THEME instead** (Sekmeht), since the theme owns the brand's colours. It doesn't: `lichborne.theme` is a single unscoped global, so a theme-owned effect would be identical for every character and defeat the point. The line drawn instead — the theme decides what colour the brand is, the setting decides what it does with that colour. The effect vars are fed `var(--accent)` / `var(--accent-dim)`, so it follows the theme and the high-contrast overlay anyway. DESIGN §8.3.
  - The app bar is app-level chrome, so the value rides `SessionStatus.brandEffect` (pitfall #57's route) and was added to the equality gate (pitfall #130). Persistence is free — a field on `settings`, so it rides `state:` → YAML and the Display & Accessibility Transfer category.
  - **One painter, two callers:** the Settings row shows a live preview through the same `paintBrandMark` the bar calls, so the preview cannot drift from the real thing (the B281 lesson).
  - **No slash command, by design** — a one-time cosmetic dropdown, matching the `timerStyle` precedent (recorded per Principle #11).
  - **B427 (Sekmeht), fixed in the same pass:** Wave and Bounce rendered white instead of taking the theme. They are not colour-replacing, so collapsing them to a bare run left them with no colour to inherit. Fixed by keeping the two-tone spans and carrying the stagger across them with a new optional `startIndex` on `effectContent`. New pitfall #147.
  - Both type-checks clean; tmp-rules-harness 319/1 (the known GemStone case), tmp-cmd-harness 58/0. **Not run in the app** — the visual claims come from the CSS and the built bundle.
- **B426 (Sekmeht): an Unconscious indicator, decoded from the status prompt.** A capture showed `SUP>` — stunned, unconscious, prone — with the `S` clearing in the same breath as `<indicator id='IconSTUNNED' visible='n'/>`, which is what made the letters worth trusting. Binu supplied the meaning: `U` is unconscious, it needs `set statusprompt`, and it cleared the moment he woke.
  - **DR has no unconscious indicator tag, and no sibling client decodes the prompt letters.** Lich's ICONMAP lists 11 icons, Genie handles 13, Frostbite 11, and the word appears zero times across all three. The status prompt is the only source that exists.
  - The parser decodes ONLY the confirmed `U` and emits a synthetic `unconscious` indicator on change. The prompt-dedup flag is sampled BEFORE that emit, so `>` handling is unchanged (pitfall #98).
  - The icon bar's combat slot ranks bleeding > unconscious > stunned > dead, reusing the stunned styling rather than minting theme vars.
  - `$unconscious` joins both variable builders and both editor lists, carrying the statusprompt caveat in its description.
  - It stays blank for a player without statusprompt — inherent to the source, not a gap to fix.
  - Both type-checks clean; tmp-rules-harness 319/1 (the known GemStone case), tmp-cmd-harness 58/0. **Live confirmation is a tester step** — the chip appearing while out and clearing on waking is not something I can exercise from here.
- **Final bug check (2026-09-15) — B413–B424 fixed, B425 logged open.** Six read-only reviewers went over the whole uncommitted change by area: the shared foundation and game-window wiring, the Automations family, Contacts and the launcher, the Settings / theme / transfer dialogs, Lich and the Experiences and Overview, and a stylesheet-wide sweep. Each finding was re-checked against the code before any fix.
  - **Regressions from this session:** a repeated "open this rule" did nothing (B416); the Injuries panel could say "waiting" all session (B422); the vitals bars could be pushed off a narrow window at large fonts (B424).
  - **Pre-existing bugs the new work exposed:** Fires → Edit copying a character highlight into the global store (B418); a deleted default contact template coming back (B419); a click outside a nested dialog doing nothing (B420, CLAUDE.md pitfall #146).
  - **Foundation behaviour:** the confirm's focus return no longer undoes what the confirmed action focused (B413); one discard question at a time (B414); the Team Login progress overlay counts as a dialog, so focus can't land in the command bar beneath it (B415).
  - **Editors:** a colour box no longer counts as an edit on blur (B417), and the Theme Editor no longer freezes palette-following colours into hex (B421).
  - **Left open:** the Experience ⚙ popover is unusable in a 48px strip (B425) — the real fix is portaling it, too big for a final check.
  - **Stylesheet sweep: no blocking bugs.** Scripted checks confirmed every class the TSX uses is styled, the ui.css → components → global.css load order holds (no primitive is overridden by accident), no new `rem` in game-area CSS, no `transition: all` left in a changed file, and no undefined custom property anywhere in the renderer. Fixed alongside it: a stale comment claiming the command-bar timer strips ignore the pointer (B333 reversed that so their tooltips work), and the two legacy app-bar hover rules (`.btn-contacts`, `.btn-theme`) that lacked the pitfall #107 active-state exclusion. `.app-bar-more-menu` and `.map-tooltip` keep their 9999 inside their own stacking contexts — recorded in the tier map as benign, not a precedent.
  - Both type-checks clean; tmp-rules-harness 319/1 (the known GemStone case), tmp-cmd-harness 58/0, check-workflow 11/11. Still not run in the app.
- **B412 (Sekmeht): an ended Spell Monitor card's hover text no longer blinks.**
  - Its tooltip carried the live clear-out countdown. A native tooltip can't update while it's showing, so Chromium hid it every second.
  - It looked like the RT/CT/aim chips (same one-second beat). Sekmeht's test showed only ended cards did it.
  - The tooltip now says the card clears when its bar runs out; the card still shows the seconds.
  - The Moons ⟳ had the same bug ("12s ago" ages, re-rendered every 2s) and now lists clock times. Pitfall #145.
- **B411 (Sekmeht): a Spell Monitor card no longer grows its whole row.** A spent cell kept its last reading ("Fading") as a second row. A grid row takes the height of its tallest cell, so every card beside it stretched.
  - Every cell is now one line plus a reserved bar slot.
  - The note goes wherever it adds something:
    - in the time slot, for fading, percent and unknown readings (`spellSlotText`);
    - for a timed effect, the minutes stay in the slot and any charge level becomes a small aside (`spellSlotAside`);
    - a spent cell keeps "ended" and its clear-out countdown, and the stale reading moves to the tooltip.
  - Kept as they were, on purpose:
    - DR's "fading" stays separate from our own `<1m` countdown, under the two-stage honesty rule.
    - The ended countdown Sekmeht asked for in v0.19.6 is unchanged.
  - 9 new harness cases.
- **UI/UX consistency pass (2026-09-15): B367–B409 fixed, B410 open.** A second audit logged 44 findings, covering bugs and quality of life plus the question "do similar windows look and behave alike?". The order of work, as agreed with Sekmeht: real bugs, then shared primitives, then dialog conversions, then a label style guide.
  - **Foundation first, written before any fixer started (DESIGN §43.7):**
    - `ui.css`: the control classes and tokens. It is imported FIRST in main.tsx so components refine it (pitfall #144). This was found when the first wiring imported it from global.css, which loads last.
    - `confirm.ts` + `ConfirmHost` + `InlineConfirm`: one confirm, in two shapes.
    - `useUnsaved.ts`: the draft guard.
    - Focus ownership in `useEscapeClose`: the covered command bar is blurred when a dialog opens, and home focus returns when the last one closes (pitfall #141(e)).
    - `--color-warning`.
  - **Eight parallel fixers, split by FILE:** the Automations family; Contacts; Lich Dashboard / Scripts / Session Log; Settings / Layout / Theme / AI Consent; Transfer / Import / wizard / Quick Send; game window / panels / debug / maps; Experiences / Overview / vitals; launcher / teams.
  - **Cross-file needs came back as notes and were integrated afterwards:**
    - GameWindow's app-bar and menu toggles bump a `closeRequest` counter. Automations, Contacts, the Lich Dashboard and the Theme Picker answer it with their guarded close.
    - `nested` is passed wherever Import, Lich Setup or the Theme Editor opens over another dialog.
    - The Overview card uses the new `formatUptime`.
  - **Bugs found beyond the audit:**
    - Saving any rule snapped an editor back to the rule opened by jump.
    - A Debug Fires → Edit save duplicated the highlight.
    - A Contacts save rewound every contact's tracking stats.
    - Delete team never flushed `_shared.yaml`, so a deleted team could come back.
    - Settings search said "No settings match" directly above a matching section.
  - **Behaviour changes, confirmed by Sekmeht (2026-09-15):**
    - A macro now needs a recorded key before it can be saved.
    - Settings' Reset to defaults moved from beside the ✕ to the footer.
    - The AI key's Clear button is now Delete.
    - The launcher's icon toolbar buttons keep no "…" (recorded in the DESIGN §43.7 label table).
  - **Removed:** LichScriptsPanel.tsx, LichProfileModal.tsx, the standalone rule-editor modal branches, the launcher's private confirm modal, and dead login.css / lich-panels.css rules.
  - **Verification:**
    - Check zero clean in both configs. tmp-rules-harness 310/1 (the known GemStone case), tmp-cmd-harness 58/0, check-workflow 11/11.
    - **Not run in the app yet.** Every visual claim comes from the CSS, and the test plan's new section lists the Classic Light and keyboard checks.
- **Dependency patches (2026-09-15):** four updates, all within their existing majors, with the package.json floors raised.
  - electron 43.4.1 → 43.7.0
  - @types/node 24.13.3 → 24.13.4
  - js-yaml 4.3.1 → 4.3.2
  - react-virtuoso 4.18.12 → 4.18.13

  Details:
  - Electron 43.7.0 is Node 24.21.0 / Chrome 150 / ABI 148. That is the same ABI, so better-sqlite3 needed no rebuild. This was verified by loading it under the new runtime and running a query.
  - `npm install -D electron@43.7.0` again skipped Electron's postinstall, leaving an empty `dist/` (the documented gotcha). Fixed with `node node_modules/electron/install.js`.
  - Both builds, both type-checks and the harnesses re-ran clean.
  - `npm audit` reports 4 findings, none in the patched packages: xmldom and fast-uri via the build tooling, and vite/esbuild's dev server. Vite's fix is the held Vite 8 major.
  - I didn't launch the app as a smoke test, because starting it runs the SimuCoin startup pass against store.play.net. The launch check is on the test plan.
- **B320 (Sekmeht): clicking an Overview card now selects that character
  everywhere.** Opening the Overview marked the active tab's card "current"
  with an accent border while the input bar read All characters, and a card
  click moved the bar's target but not the tab (a tab click moved both).
  - A card click now sets the input target AND calls `setActive`, and you stay
    in the Overview. Tab click → card already worked (F101), so the two
    gestures are mirror images and there is one selection.
  - The card's `--active` accent border/tint and the "current" chip are gone.
    The target ring is the only marker — a border only, with no background
    tint (Sekmeht: the colour change read as the character itself changing).
    Under All characters every connected card wears it (see F112). The tab
    strip, visible above the overlay, answers "which tab".
  - Why remove rather than rename the chip: once clicks sync both ways it could
    only duplicate the ring or, under All, contradict the bar.
  - Safe by construction: `setActive` from the Overview is the path a tab click
    already takes (theme ownership frozen in the view, refocus guarded — DESIGN
    §47). The card hover tint now applies to every card: with no state setting
    a background there is nothing for it to dim, and excluding selected cards
    would have left no hover at all under All characters.
  - Accepted side effect: leaving the Overview lands on the last card clicked.
- **F113 (Sekmeht): the + window wears the Lichborne dialog look.** The house
  modal chrome (UX #10) via the `--modal-*` tokens: themed scrim, the About
  surface/border/radius/shadow on `.add-character-panel`, and an accent header
  band titled "Connect a character" with the ✕ (the `.cne-*` recipe). The
  compact Launcher is now only the scrolling body — its own panel styling,
  height cap and "Pick a character to connect" heading are gone. Inner contrast
  is unchanged, since `--modal-bg` is the `--bg-base` it already used.
- **UI/UX bug sweep (2026-09-15) — B324–B345, all 22 fixed.** Five read-only
  reviewers (theme safety, overflow and layering, font scaling,
  self-explanation and accessibility, interaction consistency) logged the
  findings. Three parallel fixers then took them by FILE rather than by bug, so
  no two could touch the same file, on top of two shared helpers written first:
  - **`useEscapeClose`** ([hooks/useEscapeClose.ts](src/renderer/hooks/useEscapeClose.ts)):
    Esc closes exactly the topmost dialog. A mount-ordered stack is served by
    one window-level bubble-phase listener, so a search box, a dropdown or the
    Quit confirm handles Esc first. About 30 dialogs are registered, including
    every one that had no Esc. About's backdrop 300 → 2010 and toasts
    200 → 2050 (B341, B329). CLAUDE.md pitfall #141.
  - **`pressable()`** ([utils/pressable.ts](src/renderer/utils/pressable.ts)):
    role, tab stop and Enter/Space for clickable rows, tabs and cards; the
    Settings switches became real `role="switch"` buttons (B335). Pitfall #142.
  - Theme: undefined variables, `, white)` mixes and literals now come from
    theme vars (B324–B326). Overflow and layering: width caps on Settings and
    the wizard, menu-opened dialogs close the + window, bounded and flipped
    menus and popovers (B327, B328, B330–B332). Explanation: icon-bar chips,
    compact vitals and timer strips explain themselves, every ✕ is labelled,
    clearer labels (B333, B334, B336). Font scaling: the Exp bars, the Lich
    Map's reading text, loose badges (B337–B339). Interaction: about 40 hovers
    that erased a selected state (B340, pitfall #107 rider), drag-release
    backdrops (B342), Quick Send's focus return (B343), matched header buttons
    (B344), and the smaller items (B345).
  - Two corrections made while fixing. The sweep's B337 values were wrong (the
    track inherits a 0.82em font, so 1.33em is not 16px; 1.63em is). And a
    focusable tab would swallow the Space that type-anywhere used to route to
    the command bar, so a MOUSE click on a panel or character tab now drops
    focus afterwards (`e.detail > 0`).
  - Left alone: eight dead CSS rules the fixers edited alongside their live
    twins (`.btn-debug`, `.btn-session-log`, `.exp-bar-toggle`,
    `.grp-filter-pill`, `.map-detail-close`, `.map-overlay--error`,
    `.map-zlevel-chip`, `.wiz-radio` — no markup uses them). Nothing has been
    eyeballed on a light theme yet.
- **macOS / Linux bug check (2026-09-15) — 20 findings, 19 fixed.** Three
  read-only reviewers (main process and OS integration, renderer assumptions,
  packaging and first run) logged them as **B347–B366**; the key claims were
  re-read in the code before logging. Two parallel fixers then took the main
  process and the renderer, and the packaging/CI share was done directly. Fixes
  that rest on OS behaviour we can't observe from Windows were written to be
  safe either way (e.g. the Linux window correction applies only a small
  measured offset, so it changes nothing when there's no creep), and are marked
  for a tester. **B358** (the AppImage's FUSE 2 runtime) stays open as a
  decision: the docs now name the package, but switching electron-builder to
  its static runtime needs a test release first. Both type-checks are now
  clean — the main one's long-standing baseline error is gone — and CI runs
  them on Windows and Ubuntu. What the findings were:
  - The two that matter most: **B352**, the trigger `log` action writes into the
    install folder (silently lost on a Linux AppImage, wiped by upgrades
    everywhere), and **B347**, Option/Alt macros on macOS.
  - Lifecycle: a decoupled window's character logged out even when the Quit is
    cancelled (B353), macOS restart interrupted (B354).
  - First run and updates: an old system Ruby saved on a clean Mac (B355), a
    silent Check for Updates on macOS (B356), the AppImage renamed by every
    update (B357), FUSE 2 on newer Ubuntu (B358), a stuck check in an extracted
    AppImage (B364).
  - This release's window memory (F109): Linux position creep (B360) and macOS
    fullscreen (B362), both unverified.
  - Smaller items: fonts (B348), IME keys (B349), Home/End (B350), the devtools
    hint (B351), macOS notifications (B359), menu and Dock polish (B361), the
    Linux window icon (B363), CI coverage (B365), hardening (B366).
  - Docs fixed in the same pass: README and the User Guide now give the
    AppImage rename and FUSE 2 steps; the Guide's settings appendix and
    AINOTICE no longer describe Windows-only paths and encryption.
  - Nothing in this release's new renderer code breaks on Mac or Linux. The
    bare emoji-capable glyphs (⚙ ⚠ ⚔ ⚡ ▶) remain the pitfall #125 set that B262
    left waiting on a Mac screenshot.
- **B346 (Sekmeht): the Experiences button no longer stays highlighted.** It
  was lit whenever any Experience was showing, and an Experience docked as a
  panel tab counts — permanent layout, so the button never went dark. B345's
  stronger open state made it read as stuck. It now follows the rule every
  other app-bar button follows: lit while its shelf is open. `expAnyOpen` still
  drives the scene-work gate, and now counts only Experiences the registry
  knows (an unknown saved id is skipped by the layer, so it could have held
  scene work on for a window nobody could see or close).
- **Bug check of the launcher + Overview work (this release).** Two fixes:
  the tab strip declares `aria-multiselectable` while the Overview is open,
  since All characters puts `aria-selected` on several tabs at once; and an
  orphaned "Add card" comment that the F111 rule removal left in launcher.css
  is gone. Verified: a team run started from + closes it and its result
  summary still shows (that dialog is App-level); every cne-* dialog clears the
  + modal; the loading and empty states wear the compact chrome; the remaining
  `!compact` checks (logo, heading, account Remove) are intended. Known and
  accepted: under All characters every connected tab is `--active` and tab
  hover excludes active tabs (pitfall #107), so lit tabs show no hover there —
  Sekmeht kept the tab styling as-is; and the tabs read connection from
  SessionsContext while the input bar reads the roster, which can disagree for
  a moment mid-reconnect.
- **B323 (Sekmeht): the + window no longer flashes a dark box before the
  panel.** The Launcher's loading and empty-state early returns lacked
  `launcher--compact`, so inside the modal they drew with the full-page logon
  background and no panel frame; and the modal mounts a fresh Launcher per
  open, so it hit that state every time. Both early returns now carry the
  compact class, and the list is seeded from the last one this window loaded
  (`lastLoadedCards`), with the mount-time refresh still correcting it.
- **F110 (Sekmeht): the + window has the full login experience.** Teams,
  pinned teams in Favorites, and an action row trimmed to ⟲ Reconnect Last ·
  ⚡ Team Login · ⇋ Attach now appear in the compact launcher too.
  `LauncherTopBar` gained a `compact` mode, replacing the Attach-only
  `CompactAttachRow`, and the `!compact` checks on Teams and `favoriteTeams`
  are gone. Account Remove, Transfer and Lich Setup stay full-screen only.
  `runBulkConnect` — the funnel for every team launch — now closes the + window.
- **B322: dialogs opened from the + window no longer render behind it.** All
  four `.cne-backdrop` dialogs (Edit Profile, Attach, Team Login, the team
  editor) are portaled to `document.body`, so they escape the + modal's
  stacking context, and at `z-index: 100` they painted under its 1000. Attach
  alone had an override and Edit Profile was a noted latent bug; showing Teams
  in + would have added the team editor. Fixed at the shared rule
  (`.cne-backdrop` → 1600) with the per-dialog override removed.
- **F111 (Sekmeht): "+ Add account" is a slim full-width row** — dashed, the
  height of an account header row — instead of a grid tile, in both launchers.
- **F112 (Sekmeht): in the Overview, highlighting shows who a send reaches.**
  Tabs and cards highlight the input bar's targets: the selected card and its
  tab, or every CONNECTED card and tab under All characters (the bar's All
  skips disconnected characters). The first cut lit nothing under All; Sekmeht
  preferred all-lit. `activeId` is untouched, so Session view still returns
  where it was.
- **B321 (Sekmeht): the + modal's close ✕ now sits on the panel.** The ✕ was
  positioned against the full-window backdrop, so it lived in the window's
  corner, far from the launcher, and read as missing. The launcher is now
  wrapped in `.add-character-panel` (position: relative) with the ✕ pinned to
  its top-right in the house modal-close style (`--modal-ctl-hover`). It sits
  on the wrapper, not inside the Launcher, because the launcher scrolls. Also
  drops a `var(--text, #ccc)` that no theme defined. F113 (above) then made
  that panel the themed dialog and moved the ✕ into its header band.
- **F108: the app bar offers Reconnect after a drop.** With the active
  character disconnected, the button used to read **Login**: it destroyed the
  session, removed the tab (and its scrollback) and opened the picker. The
  in-place reconnect already existed but only in the tab's right-click menu.
  The button now calls that same `handleReconnectTab` (Attach re-attaches;
  failure falls back to the picker with the error) and reads "Reconnecting…"
  while in flight. `handleLoginActive` is deleted; the + tab covers logging in
  someone else. The Offline attention chip's tooltip now points at it.
- **F109: windows remember their size, position and maximized state.** Every
  window opened at 1400×900. New `src/main/windowState.ts` (I/O) +
  `src/shared/windowBounds.ts` (pure resolver, rules harness §M).
  - Machine-local `{userData}/window-state.json`, never a profile: it describes
    this machine's monitors. Keys `main` and `char:<characterId>` for a
    decoupled window.
  - Validated against the monitors attached now: the title bar must land on a
    display with ≥100px showing, or the window reopens centred with its size
    kept; a window bigger than its display is clamped; straddling two monitors
    is left alone on purpose.
  - Capture on every move/resize/(un)maximize, debounced write, flush on quit.
    Shutdown and re-home DESTROY windows, and `destroy()` emits no `close`, so
    reading bounds at close time would have missed them.
  - `getNormalBounds()`, not `getBounds()`, so a minimized or maximized window
    saves its restore rect.
- **Lich 5.20.1 / 5.21.0 compatibility review — no Lichborne change needed.**
  Recorded in Knowledge.md §17 (plus the new `inventoryManager` feed
  reference), and the periodic Lich upstream review is now a documented
  standing exercise in CLAUDE.md.

## v0.19.6 — Spell Monitor: the end of a spell, made visible; Katamba loses its glow

- **Spell Monitor: "Ended effects" (Sekmeht) — a new ⚙ layer, ON by default.**
  A spent effect now stays on screen, greyed and labelled "ended", instead of
  vanishing. The point is not to mark that something ended — it is to show
  **what** ended, so you can see what needs recasting.
  - **The signal is ABSENCE from the next percWindow block, not our own clock**
    (Sekmeht's correction — and it inverted the first implementation, which
    deserves recording). Our anchor floors DR's whole roisaen, so our countdown
    reaches zero up to a minute EARLY; treating that as "ended" both lied and
    flickered, since the next repaint re-anchors a spell that is still up. And
    worse: the first build DELETED the cell at exactly the moment the game
    finally supplied the truth — it threw away the only reliable evidence it
    ever gets. `deriveSpellState` now diffs the new block against the previous
    one; anything the old block listed and the new one doesn't has ended,
    because the game just said so.
  - The record lives in `SpellState.ended`, carries forward across later blocks,
    is cleared by a RECAST (the name reappears, so it must not sit in both
    lists), and ages out at `SPELL_ENDED_TTL_MS` — **one roisan** (Sekmeht), the
    game's own unit, derived from `ROISAN_SECONDS` rather than a bare 60_000 so
    it stays tied to the unit it means. Bounded with no timer anywhere: the
    ageing-out is itself a state change and commits, and the render pass filters
    on the same constant, so the cell clears either way. A departure ALWAYS
    commits, so the delta gate can't swallow it.
  - The greying is a **selectable ⚙ layer** (`expired`, on by default) — the
    registry entry, the component's gate and the option-id guard all agree, and
    it renders in both the floating and tab-hosted ⚙ automatically.
  - **The converse matters as much:** a timed effect whose anchor has run past
    is no longer dropped. The game listing it is the evidence it is live; only
    the game dropping it is evidence otherwise. (An old harness case asserted
    the opposite and was updated with the reasoning attached.)
- **Spell Monitor: ENDING IS TWO STAGES, and both are now visible (Sekmeht):**
  *"if the timer expires, it's important to see it's expired, then have the game
  show that it's ended by not showing it anymore in percWindow — that shows it's
  actually not in effect anymore."* Stage one had no appearance of its own: a
  countdown that had run out read "<1m", indistinguishable from one with fifty
  seconds left, so the moment you were actually watching for was the one moment
  the window would not name.
  - **Stage one — "expired":** the time the game gave us has elapsed. New pure
    predicate `spellExpired(effect, now)` (timed effects only), a label that
    says the word outright, and `.sm-cell--expired` — an inset ring plus a
    heavier label, on a cell that stays fully lit and red. It is marked
    INDEPENDENTLY of the urgency layer, because an expiry is a STATE rather than
    a colour band, and turning the traffic light off must not hide it; the ring
    is neutral by default and takes the band's red only on a cell that is
    already crit, decided by SPECIFICITY (`.sm-cell--crit.sm-cell--expired`)
    rather than source order (pitfall #111). Drawn as a `box-shadow`, not a
    border, because the final-minute pulse ANIMATES the border and an animation
    always beats a normal declaration — a border rule would have applied only
    when the pulse layer happened to be off.
  - **Stage two — "ended":** the game stopped listing it. Unchanged, and still
    the only authoritative one.
  - **Why they must stay separate, and why this is not a distinction without a
    difference:** DR floors its roisaen, so our clock can reach zero with up to
    59 seconds still to run, and a repaint may legitimately hand an "expired"
    cell more time and send it straight back to counting down. Stage one is
    actionable; stage two is settled. The tooltip spells out which one you are
    looking at (UX #8) — the two are one word apart on screen.
  - The bar of an expired cell is an EMPTY track: `barFraction` now returns 0
    past the anchor, ahead of the "no ceiling learned yet ⇒ show it full"
    fallback, so a `(0 roisaen)` reading can no longer put a full bar beside the
    word "expired".
  - No new ⚙ option: nothing is added to or removed from the grid, so there is
    nothing to toggle. The existing **Ended effects** layer still governs stage
    two only, and its description now says so.
  - 16 harness cases pinning the two apart — the boundary instant, a second
    early, each non-timed kind, ended-beats-expired, and the reversibility that
    is the whole reason for the split.
- **Spell Monitor: a spent cell counts down to its own removal (Sekmeht).** The
  greyed cell gave no sense of how long it was staying, so it read as though it
  might sit there indefinitely. It now prints the remaining grace beside the
  word — `ended 45s` — and its BAR drains that roisan rather than sitting empty.
  - **Seconds here, deliberately, where every other time in this window is
    whole minutes.** The minutes rule exists because DR reports whole roisaen,
    so a ticking `28:04` would claim precision the GAME never gave us — but this
    grace is measured by a timestamp we stamped ourselves against a constant we
    chose. We know it exactly, so stating it exactly is the honest thing.
  - The bar is what removes the ambiguity: `45s` next to "ended" could as
    easily be read as *elapsed since*, whereas a shrinking bar is unmistakably
    *remaining*. The tooltip spells it out as well.
  - The countdown is its own element rather than folded into the label, so the
    WORD stays the primary fact and `spellRemainingLabel` keeps returning one
    fact — which is what keeps it testable.
- **Spell Monitor: feed status IN THE HEADER BAR (Sekmeht) — a new ⚙ layer, ON
  by default.** `updated 3s ago · every ~6s`, modelled on the Lich Scripts
  footer. It answers the question a still grid otherwise raises — *is this feed
  alive, or has it hung?* — and lets you anticipate the next repaint.
  - **It sits in the header rather than a strip of its own (Sekmeht's placement
    call), and follows that layer:** hide the header and the readout goes with
    it. It is metadata about the window, so it belongs with the window's
    identity — and it then costs no row at all, which matters for a surface
    whose whole point is to shrink to a strip. `margin-left: auto` groups it
    with the count at the right; it truncates before the title does, because the
    title is what identifies the window.
  - **It reports the ARRIVAL, not the last change, and that distinction is the
    whole feature.** `SpellState.reportedAt` only advances when the delta gate
    commits, so it can sit still for many minutes while DR repaints constantly;
    showing that would say "30m ago" about a perfectly live feed. The new
    `SpellPulse` records every non-empty block, gate or no gate.
  - **It rides a REF, not a prop value, and that is load-bearing.** Every
    Experience receives the same props (pitfall #82c), so a timestamp that
    changes on every repaint would re-render Moons and the Tableau along with
    it — undoing exactly what the delta gate buys. A ref object's identity never
    changes, so it breaks no memo and only the one readout that wants it pays.
    The cost is that a ref write triggers no render, so the reader supplies its
    own clock.
  - **The cadence is MEASURED, not claimed.** Lich Scripts can say "polls every
    5s" because it owns the poll; DR's repaint cadence is push-driven and
    (per DESIGN) unmeasured, so the strip states the MEDIAN of the last 8 gaps
    and says nothing at all until it has three of them. Median, not mean: one
    quiet stretch would drag a mean to "every ~155s" about a feed pulsing every
    six seconds (a harness case pins exactly that).
  - **No ⟳ refresh button** — unchanged, and deliberate. No *verified* command
    forces a `percWindow` repaint, and inventing one would be a guess
    (Principle #10). The strip at least tells you when the next one is due.
  - **`formatAgo` is now shared** with the Lich Scripts footer
    ([utils/formatAgo.ts](src/renderer/utils/formatAgo.ts)) rather than
    reimplemented, so the two surfaces cannot drift into "3s ago" vs "3 seconds
    ago" (pitfall #127). It takes `now` as a parameter so a caller with its own
    clock formats against the instant it rendered. Two small behaviour changes
    fall out: the Lich Scripts footer gains an hours band (`3h ago` rather than
    `180m ago`), and a future-dated stamp reads "just now" instead of a negative
    age.
  - The clock now runs continuously while the strip is shown — it has no
    deadline to bid, since "3s ago" changes every second forever. That is the
    strip's cost, which is why it is a ⚙ layer; and it is bounded by MOUNT, so
    it never ticks for a background tab. In practice it changes little: the
    clock already ran whenever any timed effect was up.
  - 31 harness cases over the countdown, the pulse model and `formatAgo`.
- **Spell Monitor: it can be shrunk to a strip now (B318, Sekmeht).** The window
  refused to go below 110px — the `MIN_WIN_PX` floor every `kind: 'panel'`
  window inherits — while its natural one-row height is about 84px, so there was
  always ~25px of dead space no drag could remove. `ExperienceDef` gained an
  optional **`minSize`**, threaded through `ExperienceLayer` to `FloatingWindow`;
  the Spell Monitor declares `{ w: 180, h: 48 }`.
  - **The precedent was already in the same file**: the chrome bars got per-kind
    floors because the panel floor made them "unshrinkable vertically" — the
    identical complaint, for the identical reason. A grid of short cells is a
    strip, not a panel of text.
  - Declared **per Experience rather than lowered globally**: "how short can this
    usefully be?" is a property of the SCENE. A sky or a tableau needs height,
    and the default floor stays a fair guard for them.
- **Moons: Katamba's glow removed (Sekmeht).** It carried a miasmatic
  dark-violet haze curved against sun elevation — the one "glow" in the scene
  that was a shadow rather than light. Gone outright: the moon is black as soot
  and sheds nothing, so the truest rendering is nothing at all, and its soot
  disc plus violet-grey rim already identify it. Its `glow`/`glowStrength`/
  `glowR` fields and its gradient went with it rather than lingering as dead
  data, and `MoonStyle.glow` is now **optional** — so the FIELD is the switch
  for the gradient defs, the disc layer AND the lake reflections, which can no
  longer disagree about which moons give light. (All three name-checked
  `'katamba'`; the reflections were the one the first pass missed, caught in the
  bug check — pitfall #127, two paths answering one question must share the
  source. It selects the same moon today; the point is that it cannot stop.)
- **Bug check (eight fixes; one reported, seven found by audit).**
  - **The header could WRAP and double its own height (B319)** — `.sm-head-title`
    was a shrinkable flex item with no `nowrap`, so a narrow header squeezed it
    until "ACTIVE SPELLS" broke to a second line, doubling a strip that pins
    `line-height: 1` for exactly one row. Latent since v0.19.5 (reachable at a
    large game font) and made ordinary by putting the feed readout in the same
    row. Title and count are now `flex: 0 0 auto`; the readout is the only thing
    that yields, which is what its ellipsis is for. **The CSS comment beside it
    already claimed this property while nothing implemented it** — worth
    remembering that an aspirational comment reads exactly like a guarantee.
  - **The "Header bar" option under-described itself** once the feed readout
    moved into it: a toggle that hides more than its text admits is the UX #8
    failure in miniature. Its description now names the count AND the feed.
  - **FEED LIVENESS was not recorded for an EMPTY block — which froze the new
    strip in exactly the case it exists for.** The record was taken inside the
    non-empty branch, and the empty branch early-returns once `effects` is
    already empty. So when every spell dropped and DR kept repainting an empty
    list, the readout sat at "45s ago" beside a perfectly live feed. Now taken
    for every arrival, ahead of both the delta gate and the empty branch —
    `undefined` (the stream never touched) records nothing, `[]` (DR sent a
    clear) counts, because a clear IS an arrival.
  - **…and the split-flush that made that fix load-bearing.** DR sends a clear
    then its lines, and main's flush coalescing is LEADING-EDGE on 16ms — so
    when the client is idle the clear flushes alone and the lines follow in the
    next batch: one repaint, two arrivals. Counting the ~16ms between them would
    have dragged the median cadence toward zero precisely when someone is
    sitting still reading the strip. `recordSpellPulse` now advances the
    timestamp but discards any gap under `SPELL_PULSE_COALESCE_MS` (250ms) —
    well above the coalescing window, far below any plausible DR cadence.
  - **Two MORE Katamba name-checks survived the glow removal**, and one of them
    justified itself by the haze that had just been deleted ("its violet haze
    already carries its silhouette"). The earthshine wash and the toward-full
    brightening both ask the same question as the three already converted —
    *does this moon shine?* — so all five now read the `glow` FIELD. The comment
    added a day earlier claiming "asked in THREE places" was itself wrong, which
    is the pitfall it was citing (#127) doing its work on the person quoting it.
- **Profiled (DESIGN §45.10), because the clock now runs continuously rather
  than retiring.** Measured on BOTH axes — §45.8's standing lesson is that
  timing React alone is blind to the ones that bite. Render+commit is 0.087ms at
  8 effects and 0.143ms at 25 (cheaper than a Moons render), and a
  MutationObserver over real ticks shows the only DOM mutation is **one
  `transform` write per cell plus one text node — and zero childList**, so a
  tick invalidates no layout. The genuinely NEW cost, an empty grid with just
  the readout, is **0.007ms and one text node per second**. Deliberately NOT
  claimed: style recalc, paint, and the compositing of permanently-transitioning
  bars — unchanged by this version, and named in §45.10 as the axis to measure
  if a large buff stack is ever reported as heavy.
- **Harness:** §L grew 98 → **149** cases across this version (the two-stage
  end, the clear-out countdown, the feed-pulse model, `formatAgo`, and the
  no-duplicate-on-recast guard Sekmeht asked for). **296 pass overall**; the one
  failure is the pre-existing `planReconnect` case written against GemStone
  support that does not exist — the same premise makes `run.mjs` fail to bundle,
  so run `iso.mjs`.
  - **`.sm-name` did not grow, which a third cell child would have broken.**
    `.sm-cell-top` is `justify-content: space-between`, so with the name unable
    to absorb the free space a third child (the new clear-out countdown) would
    have had that space split into TWO gaps and floated the time chip into the
    middle of every spent cell. `flex: 1 1 auto` makes the name eat it; the
    two-child case renders identically to before. Latent rather than shipped —
    the bug needed the third child to appear.
  - **A stale orphan JSDoc above `liveSpellEffects`** still described the
    dropping behaviour that v0.19.6 deliberately removed, directly contradicting
    the block beneath it. Pitfall #126 again, and the third stale comment this
    version has produced — worth noting as a pattern rather than three
    coincidences.
  - **The 1 Hz clock could retire with a greyed cell still on screen.** It bid
    only on live expiries, so once the last countdown ran out `now` froze — and
    a spent cell's one-roisan grace is measured against `now`, so it sat there
    until DR happened to repaint, which on a repaint-on-change feed can be many
    minutes. It now bids on **the next moment the display changes**, which is
    the union of the live anchors and the ended TTLs (the latter only while the
    layer is on, since a hidden cell has nothing to expire).
  - **A reconnect-in-place burst false "ended" cells** — a v0.19.6 regression.
    "Ended" is a DIFF against the previous block, and a reconnect swaps the
    sessionId without remounting (pitfall #69), so the first block of the new
    connection read every effect that had lapsed while you were disconnected as
    having ended *this instant*: a wall of greyed "recast me" cells, which is
    exactly the false certainty the two-stage model exists to avoid.
    `spellPrevRef` now resets alongside the sky-sync flags already reset there.
    `spellMaxRef` is deliberately KEPT — the learned bar ceilings are facts
    about the spell, not the connection.
  - **Two stale Katamba comments** still described the glow that was removed
    ("its halo is a haze that DARKENS the sky"; "its faint glow reads 'no
    light'"). Pitfall #126's exact shape — the comment outliving the code it
    justified — and in this case it had outlived it by a day.
  - The greyed treatment is deliberately DIFFERENT from `--untimed`, which is
    quiet-but-live: a spent cell is **desaturated as well as dimmed**, so its
    skill badge greys out too and the whole thing reads as inert rather than
    merely unimportant (UX #9's "one artwork in two treatments" — the same cell
    drained of colour, not a second design). A dashed border says "no longer
    holding" without needing the word.
  - It cannot also be traffic-lit: `spellBand` returns `none` for a spent
    effect, precisely so the grey and the red never fight. It sorts LAST, below
    even the permanents — it is a reminder, not something counting down, and
    floating it to the top would contradict the de-emphasis.
  - 22 harness cases over the departure model, including the redundant-repaint
    gating and the converse (a past anchor is NOT ended); §L now 98.

## v0.19.5 — Spell Monitor + tab drag fix

- **Experience #3 — Spell Monitor (Sekmeht).** DR's active-spell readout as a
  grid of live countdowns: one cell per effect, soonest-expiring first, each
  with a depleting duration bar, running green while full, yellow past
  halfway and red as it nears its end. Dual-hosted like every Experience — a floating window from the
  shelf, or an `[e]`-badged tab via a panel's `+` menu. Registry id
  `spellmonitor` (deliberately not `spells`, so it can never read as the Active
  Spells PANEL in a tab strip — the Moons stream/experience lesson).
  **No panel-system file was touched** (§34.8 item 5): one registry entry buys
  the `+` menu, the shelf and the ⚙ popover.
  - **Considered and rejected first:** a "right-click Active Spells → Classic /
    Advanced" panel view toggle. Checked against §34.2's rejected "Interactive
    Mode" model and **both prongs invert here** — the `spells` panel is not
    optional equipment (that stream has no main duplicate and no
    `STREAM_FALLBACK` entry, so its panel is the only place the content ever
    appears), and unlike the combat HUD this genuinely IS a rendering of stream
    text (no typed event carries the active list; the `spell` event is the
    spell being *prepared*). The Experience route also leaves the mature panel
    system byte-identical, which the toggle would not have.
  - **No new plumbing.** `percWindow` aliases to `spells`, that stream is
    clear-and-rewrite with no fallback, and the clear is applied in the batch
    commit — so `streamLines.spells` is already an exact mirror of the current
    block. No accumulator, no assess-style batch-boundary guard.
  - **`parseSpellLine` is tolerant by design:** handles the singular `roisan`
    as well as plural `roisaen` (a plural-only pattern would silently drop every
    effect in its final minute), keeps a non-numeric parenthetical
    (`Trabe Chalice (intact, fading)`, `(indefinite)`) as an untimed effect
    carrying that note, and keeps a bare name — never a dropped line. 1 roisan =
    1 real minute via `ROISAN_SECONDS`, never a hardcoded 60_000.
  - **Expiries anchor on each LINE's own timestamp** (its receipt time) rather
    than one `Date.now()` per block — not the B192 skew case, since DR gives a
    duration, not a server absolute time. **Known limitation:** this is NOT
    replay-correct (`mkLine` stamps `Date.now()` and ignores the timestamp the
    event carries), so a decouple/remount inflates remaining times until DR's
    next repaint, which the delta gate then re-anchors. An earlier draft of the
    docs claimed the opposite; corrected in the same release.
  - **A delta gate** keeps DR's redundant repaints free: state is re-committed
    only when the effect set, a note, a max ceiling or a timer's divergence from
    prediction actually changes — otherwise the prior object identity holds, so
    no Experience re-renders (pitfall #82c) and no countdown re-anchors. The
    resolver is pure; one effect owns the refs (pitfall #70).
  - **The bar's denominator is learned** (DR never states a full duration): the
    highest roisaen seen per effect, held in a GameWindow ref so it survives the
    component unmounting on every tab switch.
  - **Traffic light (Sekmeht): green full → yellow midway → red near the end.**
    `spellBand()` takes the MORE URGENT of a proportional and an absolute
    reading — necessary, not belt-and-braces: the proportion denominator is
    LEARNED, so on the first block after connecting every effect sits at 1.0 and
    a pure-proportional band would paint the whole grid green including a buff
    with two minutes left. Colours are three dedicated `--spell-band-*`
    vars, NOT the vitals health ramp — reusing that was the first cut and was
    wrong, because it means "this theme's health bar" rather than "traffic
    light": `classic` takes its vitals from Genie, where health is RED AT FULL,
    so the light ran red→orange-red→dark-red; `terminal` is monochrome, so the
    amber band vanished. The replacements are defined once in darkBase as a
    fixed hue mixed toward the theme's own text, so meaning is fixed while
    contrast self-corrects. Colour-blind entries are explicit (the vitals answer
    turns crit amber, which would collide with our mid band). The colour lives
    in the bar and border, not the numerals — amber cannot clear text contrast
    on white without ceasing to look amber.
  - **An empty block clears the grid on a 400ms deferral** — meaningful (all
    effects dropped) but deferred, because a clear and its lines can straddle a
    flush boundary and committing the gap would blink the grid empty.
  - **Two honesty rules:** whole minutes only, never a seconds countdown (DR
    reports whole roisaen — `29:00` would claim precision we were never given;
    the last minute reads `<1m`), and an unparsed effect is still shown.
  - **The percWindow shape catalogue now mirrors LICH'S OWN parser**
    (`xmlparser.rb`), after reading it turned up four shapes a version written
    from one captured block got wrong: **`anlaen` is a real unit** (1 anlas = 30
    roisaen, so Stellar Collector lost its countdown entirely), **`Fading` is
    the opposite of untimed** (Lich reads duration 0 — lapsing now — while we
    showed it as a quiet note), **`Indefinite`/`OM` are permanent**, and a
    stated **percentage** is a proportion rather than a time. `SpellKind` is now
    timed/fading/permanent/percent/unknown, and the distinction is load-bearing:
    fading is the most urgent state, permanent the calmest, so the `untimed`
    layer hides the quiet kinds but never fading, only permanent/unknown are
    muted, and each kind shows the game's own word rather than a faked duration.
    A stated percentage also beats the learned ceiling for the bar — a true
    proportion versus "the most we happen to have seen".
  - **Skill badges + abbreviations (Sekmeht).** `[A]`ugmentation, `[W]`arding,
    `[F]`orm and so on, plus an option to show `ECRY` instead of *Eillie's Cry*
    so what you read is what you type to renew it. Data is Lich's
    `base-spells.yaml`, snapshotted by `tools/gen-spell-data.mjs` into a
    COMMITTED `spellData.ts` (430 entries, ~29KB) — committed rather than read
    live, because this Experience works without Lich; an unknown name gets no
    badge, never a wrong one. Verified first: percWindow names match the YAML
    keys verbatim (8/8 on a real capture), the three sections have zero name
    collisions, and all twelve values have distinct first letters. Metamagic is
    **X not M** (M is Meditation — unambiguous only by luck is the #55 trap).
    Found in the source data: 33 `metamagic: true` entries with no `skill`, and
    **`See the Wind` carries `Skill:` with a capital S — a typo in Lich's own
    file** that a case-exact read drops silently. Known gap: Thief Khri aren't
    in that file at all, so Thieves get no badges.
  - **Badge colours are twelve `--spell-badge-*` vars, and all fifteen Spell
    Monitor colours are exposed in the Theme Editor's HUD tab** — genuinely
    user-editable rather than only themeable, which was the actual ask. The chip
    is a quiet low-alpha tint on purpose: it IDENTIFIES while the traffic light
    ALARMS, and two loud colour systems in one cell would fight.
  - **Group by skill (Sekmeht, 2026-09-06).** `groupSpells()` puts each magic
    skill / ability type under a labelled hairline heading — a Barbarian gets
    exactly four blocks (Form 15 · Berserk 13 · Roar 11 · Meditation 9), casters
    5–7, Warrior Mage 7. Three decisions: it **composes** with Soonest-first
    (grouping preserves the caller's within-group order, so sort-then-group
    leaves each group internally sorted) — which is why two booleans still
    suffice and no enum control was needed; the group ORDER is **fixed**, not
    derived from what's currently up, since a self-reordering list reshuffles
    the grid while you're reading it; and the heading is a **hairline divider,
    not a padded header**, because a Warrior Mage would otherwise spend seven
    rows on chrome in a strip-shaped window. Unknown names bucket into "Other"
    last, which makes grouping inert for a **Thief** — Khri aren't in Lich's
    data at all. 9 harness cases.
  - **Data fix found while measuring the group shapes:** the generator dropped
    the guild for all 14 `battle_cries`, because that section separates Bardic
    Screams from Barbarian Roars with **YAML COMMENTS**, which no parser can
    read. The `type` is the reliable signal and the split is 1:1 (scream→Bard,
    roar→Barbarian). Lesson: when a section's grouping lives only in comments,
    derive it from a real field rather than dropping it. (The nine guild-less
    entries in `spell_data` — Dispel, Imbue, Lay Ward… — are correct: they're
    the universal spells every magic guild learns.)
  - Nine ⚙ layers, the last five added at Sekmeht's ask. **Abbreviations,
    Soonest-first and Group-by-skill are OPT-IN** (`defaultHidden`, Sekmeht 2026-09-06) — so DR's
    own ordering is the default, which is stable as timers tick where ours
    re-arranges under the reader; the urgency colour still marks a lapsing
    effect, it just isn't moved. Consequence worth knowing: `spellSortRank`'s
    fading-first priority applies only when that layer is on.
  - **⚙ prefs were already persistent — verified rather than assumed, and now
    harness-locked.** `ExperienceInstance.hidden` rides `scopedKey('experiences')`
    → `state:` → YAML, `experiences` is already a Transfer category,
    `setExperienceOption` find-or-creates an `open:false` prefs record so a
    tab-only user still gets one, and it seeds `defaultHiddenMap(def)` so a
    default-off layer persists explicitly. The reason it's safe is that
    **`loadExperiences` filters with a type GUARD instead of rebuilding each
    record** — a rebuild is the pitfall #121 shape that has destroyed a field
    three times now, so the round trip is locked with a test.
  - **New `check-options.mjs` guard**: the registry's option ids and the ids the
    component queries via `shown()` are two hand-written lists of the same names
    (pitfall #127), and `shown()` falls back to TRUE for an unknown id — so a
    typo would silently force a default-off layer permanently ON. Asserted equal.
  - Epilepsy-safe drops the pulse but keeps the colour (UX #9b). Bounded + scrollable
    (pitfall #109), tabular numerals (#103), em chain anchored (#58a), `.sm-`
    prefix verified unique (#55c). Works direct-SGE — no Lich needed.
    No slash command by design (§34.6), recorded rather than skipped.
  - 77 harness cases (`tmp-rules-harness` §L) over the verbatim capture, the
    traffic light's first-sighting trap, and every shape in Lich's catalogue.
  - **Layout pass (Sekmeht: the header "feels cramped into the top left").** Its
    `line-height: 1` was right (UX #7) but the padding was `0.25em 0.6em` — 3px
    /7px at the default font, where the house strip standard (`.sl-header`) is
    `2px 12px`, so barely half the horizontal inset. Now `0.4em 0.9em`, kept em
    so it scales with the scene font, and deliberately the SAME horizontal value
    as `.sm-grid` so the title and the first cell share a left edge — a label
    lining up with nothing below it was much of what read as off. The count chip
    also moved to the far right (`margin-left: auto`) so the strip spans the
    window instead of huddling in the corner.
  - **The ⚙ popover was unbounded — a real clip, and it predates this feature.**
    `.exp-inst-options` had no `max-height` while `.fl-body` /
    `.panel-frame-body` are both `overflow: hidden`, so in a short window the
    top options were simply CUT OFF with no scrollbar and nothing to indicate
    they existed. Its height is the option COUNT, which varies per Experience —
    **Moons declares 17** — against a freely-resizable, often deliberately short
    window. Bounded to `calc(100% - 40px)` with `overflow-y: auto` and
    `overscroll-behavior: contain` (pitfall #109); fixes Moons and the tab-hosted
    ⚙ at the same time.
  - **B314 — Theme Editor rows for a cascading var showed a BLACK swatch.**
    Found auditing the 15 colour rows this feature added, and it turned out to
    hit pre-existing rows too. darkBase deliberately stores expressions rather
    than literals (`var(--text-dim)`, `color-mix(… var(--text-primary))`), and
    `createCustomThemeFrom` copies the whole of darkBase into a new custom
    theme — so those expressions reach the editor verbatim, and
    `<input type="color">` silently falls back to black on anything that isn't
    `#rrggbb`. So the editor was showing black for colours that actually paint
    teal, rose and slate. `resolveDisplayHex` now asks the BROWSER what the
    expression evaluates to (hidden probe + `getComputedStyle().color`), which
    is the only correct answer since it depends on the live theme; literal hex
    takes exactly the old path, and the commit path is untouched so an edit
    still writes plain hex.
  - **The empty state stopped lying.** With "Untimed effects" off and only
    untimed effects up, the window insisted there were none. "Nothing is up" and
    "everything up is filtered out" are different facts; it now says which, and
    names the toggle that is hiding them.
  - **Profiled (Sekmeht asked about redraw cost). One real find; the rest free.**
    Measured by bundling the real modules: the 1 Hz clock's whole derivation
    chain is **0.24–0.94 µs/tick** (8 → 25 effects, grouped) and the always-on
    parse — paid whether or not the window is open — is **4.4 µs per repaint at
    8 effects, 20.5 µs at 25**, i.e. 0.006% of a core even assuming DR repaints
    on every prompt. Two structural properties matter more than the numbers:
    **zero per-line cost** (the derive is an effect on `streamLines.spells`, not
    a branch in the stream-text loop), and a background TAB is unmounted so its
    clock doesn't run. A background CHARACTER's floating window does tick —
    left alone deliberately, since gating on `isActive` buys nothing measurable
    and costs a stale label on return (the §45.7 trade). Also worth recording:
    the delta gate does NOT save parse work — a gated repaint measures slightly
    slower, because it parses and then compares. Its value is entirely the
    avoided re-render, which is what the design claims.
  - **The bar animated `width` — the one genuine perf bug.** Because it drains
    on every tick it sits in a CONTINUOUS transition the whole time the window
    is open, and `width` invalidates layout on every animation frame: 25 bars ×
    60fps × each open window × each character, forever. Now `transform:
    scaleX()` with `transform-origin: left`, which is compositor-only. The fill
    drops its own border-radius (scaling squashes it); the track's
    `overflow: hidden` rounds the left end and a square leading edge is right
    for a progress bar. Pitfall #126's family. The other two animations audited
    clean: the cell's background/border transition is paint-only and fires only
    on a real band change, and the pulse animates border-color on the 0–2 cells
    in their last minute.
  - **"Fading" printed twice, and the extra row inflated the cell** (Sekmeht,
    screenshot: `Tenebrous Sense (Fading)`). The label already renders the word
    for a `fading` reading, and the note row rendered the parenthetical — the
    same word, plus a whole second line, which is what made those cells look
    oversized next to their neighbours. The rule is now that **the note exists
    to add what the LABEL does not already say**: it's compared
    case-insensitively against the label rather than switched on `kind`, so a
    bare `(Fading)` or a bare `(94%)` collapses to one row while a COMPOUND
    reading survives — "0%, fading" against a "0%" label genuinely adds a word.
    `spellRemainingLabel` and `spellNoteText` moved OUT of the component into
    experiences.ts as pure functions to make this harnessable: neither reads
    correctly alone, and it's their PAIRING that produced the bug, so the tests
    assert them together (9 cases).
  - **Bug-check finds, fixed the same day:** a liberal `\bfading\b` match would
    have painted every `Trabe Chalice (intact, fading)` permanently red (Lich
    anchors its duration group right after the `(`, so only a bare `(Fading)`
    means lapsing); and `spellBand` compared percent with `=== null`, so an
    absent field became NaN, failed every threshold and landed on the CALMEST
    band — a reading we don't have must fail toward no colour, never toward
    "this one is fine".
  - **Open:** DR's repaint cadence is unmeasured (the gate is correct either
    way); no ⟳ button, since no *verified* command forces a `percWindow`
    repaint and one wasn't guessed.


- **B311 (Sekmeht): moving a stream tab between windowed panels left the SOURCE
  frame's tabs jittering indefinitely and collapsed the map's animation FPS.**
  Cross-frame adoption removes the tab from the source frame, unmounting the
  element that carries `onDragEnd` — the browser fires `dragend` on a detached
  node, React never sees it, so `dragTabId` stayed set forever. The F46 FLIP
  layoutEffect has NO dep array, PanelFrame re-renders on every game batch, and
  its only guard is `dragTabId === null`: it therefore re-measured (forced
  reflow) and re-transformed every tab per batch, reading positions
  MID-TRANSITION so the next render always saw a >1px delta and re-animated —
  self-sustaining while text flowed. The per-batch forced layout is what starved
  the main thread and wrecked the map's FPS (pitfall #126's contention
  signature: an unrelated subsystem degrading is the tell that the cost is
  per-render layout, not a fault in the thing that looks broken). Fixed with a
  state-derived reset — clear `dragTabId` when the dragged tab is no longer in
  `tabs`, which is exact because the frame re-renders with the new list.
  Requires the source window to keep ≥2 tabs (an emptied one closes outright).
  **PRE-EXISTING since v0.18.2**, when cross-frame adoption shipped — NOT from
  PR #2; `PanelFrame.tsx` is untouched by that merge. Pitfall #137 records both
  halves: `dragend` is unreliable when the source can unmount, and a no-deps
  effect gated on a flag is only as safe as that flag's worst clearing path.
- **B312 (Sekmeht): panel content "quivered" and highlighted text appeared to
  bold then revert — intermittent, across many versions, never reproducible.**
  Seen alongside B311 but INDEPENDENT of it and long predating it. The unread
  dot is a conditionally-rendered 6px flex child, so a stream tab going
  unread/read changes width; `.panel-tab-list` has content-driven height and
  `.panel-frame-body` is `flex: 1`, so crossing the overflow threshold made the
  horizontal scrollbar appear, ADD its height to the strip, and take it out of
  the body — reflowing every line of game text, repeatedly, as unread states
  churned. It read as a FONT bug because a highlight's filled background makes
  the subpixel re-raster obvious (the reporter uses no text effects at all), and
  it was unreproducible because it needs the strip sitting right AT the
  threshold (panel width × tab count × label length × font size).
  **Compounded by an inert rule:** `scrollbar-width: thin` was set, which per
  **B178** disables ALL `::-webkit-scrollbar` styling in modern Chromium — so
  the `height: 3px` rule never applied and the real bar was Chromium's native
  ~11px, making each toggle a large jump. Fixed with `overflow-x: scroll` (the
  gutter is always reserved, so the height is constant) plus removing
  `scrollbar-width`/`scrollbar-color` so the themed 3px bar returns — which is
  what makes the permanent gutter visually free, since its track is
  `var(--bg-sunken)`, the strip's own background. Pitfall #138. **This also
  retires the earlier text-effect hypothesis**, which was wrong: the
  `hl-fx-*` effects do change rasterization (six of them use
  `background-clip: text`, and `fire` animates `filter: brightness`), but none
  were in use.
- **Investigation note — the "bolding" was NOT a text-effect or transform
  artifact.** First hypothesis was compositor-layer promotion from an animated
  highlight effect; it was wrong, because the reporter uses none. Reading the
  effect CSS was still worth recording: six effects (`shimmer`/`rainbow`/`gold`/
  `gradient`/`fire`/`frost`) use `-webkit-background-clip: text` +
  `text-fill-color: transparent`, which permanently disables subpixel
  antialiasing, and `fire` animates `filter: brightness(1 → 1.18)` — so those
  DO alter apparent weight, just not here. The actual cause was B312's reflow.
  Kept because the next "text looks wrong" report should check effects first,
  then container reflow.

## v0.19.4 — Attach to a running Lich (PR #2, Kahlen)

**Lichborne's first external code contribution.** Merged as a `--no-ff` merge
commit so all 12 of the author's commits and their reasoning survive in history
(note: the PR's commits are authored `Claude <noreply@anthropic.com>` — it was
AI-assisted — so the human attribution lives in the merge commit, credits.ts and
release-notes.md).

- **F107 (Kahlen): attach mode — a third connection mode** beside Lich-launch and
  Direct. `AttachConnection` (new, electron-free so a plain-node harness can
  exercise it) opens a bare TCP connection to an already-running detachable Lich
  (`--headless PORT` / `--detachable-client=`). No account, no password, no Ruby
  path: headless Lich authenticated itself from its own saved entry, and its
  listener takes the connection with no handshake. `CH.LOGIN_ATTACH` mirrors
  `CH.LOGIN`'s lifecycle including the hold-for-replay (pitfall #60 — the
  attach-time resync would otherwise flush into a window with no GameWindow
  subscriber). `useLich: true` keeps the Lich Scripts panel and the rest of the
  Lich-only surface alive. Target persisted as an optional launcher-owned
  `CharacterProfile.attach {host, port}` via the `setCharacterGame`-style
  read-modify-write (pitfall #26), driving the tile ⋯ menu, modal prefill,
  attach-first tile Connect, tab Reconnect and the bulk paths. `planReconnect`
  gains an attach branch that bypasses the account arithmetic — those rules
  protect a *login* from DR's one-per-account law, and an attach starts no login.
  Full spec: DESIGN §48. Verified Lich-side facts: Knowledge.md §19.
- **Disconnect DETACHES, `exit` logs out.** `gracefulDisconnect` half-closes with
  no QUIT in attach mode, for both in-tab Disconnect and app shutdown, so the
  session outlives the client. Typing `exit` stays a deliberate log-out because
  Lich runs a full orderly shutdown of the whole session for a user-exit from a
  detachable client (`user_exit_dispatch.rb#dispatch_detachable_client`,
  verified) — not something the front-end can soften.
- **Auto re-attach on an unclean drop** — backoff 2/4/8/15/30s then a 30s
  heartbeat, reconnecting IN PLACE so tab, scrollback and panels survive
  (pitfall #69's reconnect-in-place shape). Deliberately uncapped: the session
  outlives the client, so giving up is exactly wrong. TCP keepalive at 30s
  because an attach target is often not loopback and NAT reaps idle connections
  silently.
- **Two SHARED-code changes — B308 + B309** (they affect normal play, not just attach):
  **(a)** GameWindow's status handler cleared `dropped` only on
  `s.connected && s.message === 'Connected'` — making the connected FLAG
  decorative and a human-readable STRING load-bearing, so an 'Attached' /
  'Re-attached' message left the tab greyed while text streamed in. Now keyed on
  `s.connected` alone, which is safe because main sends `connected: true` only
  from a genuine connect (every progress line goes out `connected: false`). The
  mirror-image `!s.connected && s.message === 'Disconnected'` check is
  deliberately left alone — there the string does real work. A latent fix for any
  future connect path. **(b)** The vitals resync painted every bar at ZERO on
  attach: Lich's init hardcodes `value='0'` and carries the numbers only in
  `text`, and in DR that text is `health 100/` (Lich derives max by scanning
  numbers out of DR's own bar text; DR sends a percentage, so one number is found
  and max interpolates empty). GS sends `health 100/100`, so a `(\d+)/(\d+)` pair
  regex silently never matches DR. Now takes the first number and treats a
  missing/zero max as 100, **gated on `value === 0`** so live bars are untouched.
- **Merge housekeeping:** version bumped to 0.19.4; the 17 `(draft attach mode)`
  / `(draft feature)` comment markers cleared (it ships, so it isn't a draft);
  Kahlen added to `CONTRIBUTORS` in credits.ts.
- **Merge bug check** (internal, evidence-based against the merged code): found
  **one real item, B310 — OPEN, deliberately NOT patched** (Sekmeht: raise it
  with Kahlen first, since it may have been considered). The parser is reused
  across a re-attach, so stale `activeStream`/`streamStack`/`monoMode` can carry
  into the new connection. **Not introduced by PR #2** — `reset()` has had zero
  call sites since forever and was harmless while every new connection meant a
  new `Session`; auto re-attach is simply the first path to reuse one, which
  makes the dormant gap reachable. Verified CLEAN in the same pass: pitfall #26
  (`attach: existing.attach` IS in `exportCharacterProfile`'s merge, so the
  debounced save can't strip it); the B308 premise (exactly three
  `connected: true` sites, all genuine connects, so keying on the flag is safe
  by construction); `cleanDisconnect` is read-and-reset in one handler, not a
  stale latch; `destroySession` cancels the re-attach timer before teardown; and
  `planReconnect`'s attach branch sits ahead of the account rules and matches on
  character alone (correct, since attach-only stubs share the placeholder
  account). One earlier suspicion was WITHDRAWN on evidence:
  `AttachConnection.endAndAwaitClose` is byte-identical to the pre-existing
  `LichConnection.endAndAwaitClose` it mirrors — deliberate, not an asymmetry.
- **Slash surface: none, by decision** (Sekmeht) — attach is one-time setup
  rather than an in-play verb, so the launcher button and modal are the surface.
  Recorded in DESIGN §48.6 per Principle #11's "record the no-command decision"
  requirement.

## v0.19.3 — Shopping shows up again

- **B306 (JadedSoul):** `shop` at DR's surface-based shops (Fang Cove) printed
  NOTHING in the game window — the listing was only visible with a Shopping
  panel open and vanished when it closed. DR sends it on `shopWindow`, which had
  no `STREAM_FALLBACK` entry, so unwatched output was buffered invisibly (the
  exact "silently buffered" failure the table exists to prevent). One row added;
  the sibling clients (Frostbite, Profanity) both render shopWindow in main, and
  the report's blank output is itself the pitfall-#49 proof that DR doesn't
  double-emit it. The stream id is recorded in Knowledge.md.
- **B307 (Sekmeht):** Catch Me Up's lbAI routing keyed on whether an lbAI tab
  EXISTED anywhere, so a background tab swallowed the recap invisibly (unread
  dot only) — "closed but nothing came out". Now `watched && active`: the tab
  must be in a rendered surface AND be its active tab. `activeIdsRef`'s panels-
  mode set also gained the `*Added` gate it was missing (pitfall #39).
- **Stream-behaviour sweep** prompted by both: verified the `shopWindow` key
  matches the id the parser emits (pushStream ids keep their case — the fix is
  live, not a silent no-op), audited every "is this tab open/visible" aggregation
  (expTabIds, lichScriptsOpen, debugOpen, `/panel list`, watched — all gated and
  per-mode), and inventoried DR stream ids from the three sibling clients against
  our routing table: `ooc` correctly has no fallback (Frostbite's own comment
  says its speech is a native duplicate of the whisper stream), `speech`/`whisper`
  are presets not streams, and `chatter` is the one undecided id — recorded as
  needing a raw-XML capture rather than routed on a guess. Pitfall #133 records
  both lessons; the inventory is in Knowledge.md.

## v0.19.2 — the Elanthia-Online handover, a license, and a full internal sweep

The release that prepares Lichborne's transfer to the **Elanthia-Online** org
(the community team that maintains Lich) — plus the deepest proactive bug sweep
the project has run, with everything it found fixed the same day.

- **Dual-feed auto-updater** (DESIGN §18.4.1). Every shipped install has the old
  repo baked into `app-update.yml`, so `checkForUpdatesDualFeed()` tries
  `elanthia-online/Lichborne` first and falls back to `SekmehtDR/Lichborne` —
  silent pre-transfer (the `updaterProbing` flag suppresses the expected 404's
  ERROR line; only the FINAL feed's failure reaches the updater log), seamless
  after. The winning feed serves the download too (verified in electron-updater's
  source: the provider is captured at check time). Concurrent runs JOIN one
  in-flight check (the `serializeLichLaunch` shape) — found by the sweep's own
  review of the fresh code before it ever shipped. Rollout: ship this from
  SekmehtDR → transfer the repo (a true transfer; GitHub's redirects cover even
  never-updated installs) → flip the 12 hardcoded URLs and cut from the org
  (§18.4.1's Phase-3 checklist + the org Actions write-permission pre-flight).
- **Lichborne has a license: BSD 3-Clause** — the same license as Lich itself —
  © 2026 Sekmeht and Binu, with the Miron→Tillmen→Elanthia-Online copyright-line
  pattern as the stewardship template. `package.json` carries `license`/`author`;
  README + User Guide carry the Simutronics non-affiliation disclaimer. The
  LICENSE file is kept pure license text so GitHub's detector badges the repo.
- **Full internal bug sweep** (three parallel code audits + recurring-class greps
  + all harnesses): zero open tester bugs, all seven v0.19.1 fixes verified
  intact — and **B285–B301 + B303 found and fixed** (see BUGS.md): the Overview
  toggle swallowing typing (B285), spoken-to never expiring (B286, timer-driven
  expiry), "up 0s" on a dropped card (B287, uptime stops instead), a stale
  session id in `setSessionName` (B288, the one live pitfall-#86 instance), the
  contact popover + six game-area controls ignoring Font Size (B289/B290), the
  feed-flip full-scrollback frame (B291), card timers ticking at 10 Hz forever
  (B292), `/view set conditions=/timers=` (B293), a bundle-order `flex`
  restatement (B294), hover outranking severity borders (B295), the grid not
  re-planning on font changes (B296), a dead CSS var (B297), DIGEST_KEYS made
  genuinely compile-enforced (B298), duplicate non-skill key sets merged (B299),
  nsys out of `worstParts` (B300), `makeCharacterId` unified into `src/shared`
  (B301), and the Overview ↑-history made truly per-window (B303). B305
  (A−/A+ + compass fixed-size) confirmed deliberate and commented; B302/B304
  deferred by Sekmeht as conscious calls.
- **The scene harness had been crashing mid-file** on a never-committed
  `observeLine` API — every case below the crash silently wasn't running.
  Repaired; all four harnesses + the literal-gate check green (137/35/ALL/160,
  21,191 real rules, zero gate disagreements).
- **Maintenance:** Electron 43.2.0 → **43.4.1** (ABI 148 held — verified by an
  in-Electron better-sqlite3 query, no rebuild; note `npm update` skipped
  electron's binary postinstall and `install.js` had to be run by hand), esbuild
  0.28.2, highlight.js 11.12.0, react-virtuoso 4.18.12, nanoid 3.3.18 (audit
  fix; the advisory wasn't exploitable here — verified all call sites are plain
  `nanoid()`). Held majors unchanged; **js-yaml 5 newly joins the held list**
  (the profile parser — dedicated migration only).
- **Every source file now opens with an orientation header** (the community
  handover comments pass). 171/171 `.ts/.tsx` files under `src/` carry a
  top-of-file block: what the file is, where it sits in the pipeline, what a
  developer must not break — 94 written new, 4 one-liners upgraded, 11 left
  as-is because they already carried the block below their imports. Written
  by five parallel agents on disjoint file sets, each required to ground every
  claim in the file's own code/comments and to report its least-certain claim
  per file; five headers were corrected from those reports (profile.ts and
  profile-types.ts overstated "only reader/writer" against pitfall #26,
  LichDashboard's "every tab", GenieMapView's persisted-state claim, and a
  pre-existing stale "deferred" note in AppBar). Verified insertion-only by a
  numstat diff against a pre-pass baseline; tsc unchanged. The convention is
  now a CLAUDE.md guardrail.

## v0.19.1 — Binu's first pass over Views

Both reported against the Overview specifically, on the released v0.19.0 build.

- **Lich 5.20.0 review** (B282/B283). No break — assess parsing, the
  `--stormfront` flag and the map JSON all verified unchanged. But DR now emits
  `<nav rm>` on every arrival, which exposed that **the Lich Map indexed by
  Lich's own room id while looking up with the game's uid** — different number
  spaces, ~3% overlap, so the fast path resolved 3% of rooms and silently fell
  back to title matching. Indexing both takes it to 100%, measured against a real
  18,779-room map. 5.20's new opt-in title placement also emits a uid INSIDE the
  brackets, which neither pattern matched; all 8 shapes now covered. The id/uid
  distinction is recorded in Knowledge.md §17.
- **The Overview is sticky** (F106). Theme OWNERSHIP freezes on entry rather than
  theme application, so tab clicks no longer re-theme the dashboard while a theme
  picked from the Overview still lands, and leaving hands the document to the
  character you land on. Cards select the input-bar target instead of navigating;
  empty space widens back to All; leaving is deliberate (double-click, or a new
  shared-menu entry the character tab deliberately does not get). Moving the
  target into the store to make that possible caused B284.
- **Contact effects now preview, and tags can carry their own** (B281/F105).
  Both previews built a plain colour style while the game applied the effect, so
  a rainbow template previewed flat — fixed by extracting `paintContactText` and
  having the game renderer and both previews call it, rather than writing a
  second correct copy. The editor gained a live Preview row, and the tag gained
  `tagEffect`/`tagGlowColor` independent of the name's, with the rebuild and
  harness cases updated in the same edit (the B279 lesson, applied immediately).
- **Bug check:** a tiny Overview tile set to Experience kept rendering the skill
  table (B280) — the 15em tier hides the feed and the picker, but `.ov-card-exp`
  occupies that slot and was not named in the rule.
- **Contact templates lost their text effect** (B279). `normalizeTemplate`
  rebuilds each record field by field and never copied `effect`/`glowColor`, so a
  rainbow template loaded back as plain colour — and the panel then saved the
  stripped version, destroying it on disk. Pitfall #121 for the third time, and
  invisible to `tsc` because both fields are optional. Guarded now by a
  save/load round-trip case in the harness (section J, 117 → 124 cases).
- **Credits:** Qij promoted to CONTRIBUTORS (logged item: F82, the command-history
  minimum length); Wilhellm and Cirostar added to TESTERS.

- **Clicking Overview while in it resets the input bar to All characters**
  (F104). Tabs narrow the target, the view button widens it again. A store
  nonce rather than moving the target into the store — it is the bar's own
  state and this is a one-way poke.
- **The compact experience view on a card** (F103). Picking **Experience** in a
  card's stream dropdown renders the compact view rather than a feed — which
  supersedes v0.19.0's exclusion of `exp` from that list. That exclusion was
  correct for its stated reason (exp is a state map, so a feed of it could only
  say "nothing yet") and stopped being correct once the card could render state.
  The filter and ordering moved to `compactExpRows` in expParse.ts and ExpPanel
  uses it too, so the two surfaces cannot disagree; the markup stays separate
  because the panel is interactive and a card is a glance. Harness section K
  pins the shared ordering (124 → 134) and caught an inverted assumption about
  `sortDesc` before it shipped.
- **RT / Cast / Aim strip on each card** (F102, Binu). Two thin lanes above the
  vitals bar, same colour vars and same cast-over-aim precedence as the game
  command bar. Built as a MEMO'd leaf because `useTimers` ticks at 100ms and the
  card is deliberately un-memoized — at card level that would have re-rendered
  every card, feed included, ten times a second per character in combat. The
  interval only exists while something is counting, the strip's height is always
  reserved so cards cannot twitch when a roundtime starts, and it sits behind a
  Settings toggle like every other card section.
- **The input bar's target follows the active character** (F101). Ctrl+1..9,
  Ctrl+Tab and clicking a tab all run through one `setActive`, so the bar follows
  `activeId` rather than three separate paths. Only on a change — the ref is
  seeded at mount so the view still opens on **All characters**, which is the
  inverse of pitfall #12 and deliberate. Ctrl+0 stays unbound (Electron-reserved
  zoom).
- **The end of a room description was being cut off** (B277). The feed capped
  each line at three rows — so a busy room lost the tail of "You also see…",
  which is the half you were reading — and it did not even cut cleanly, because
  the cap was written as `3 * 1.3em` while `.text-line` renders at
  `var(--game-line-height)` (1.4–1.6). 3.9em against ~1.5em rows is 2.6 rows: two
  rows and a sliver, and the count moved with a prose setting. The cap is gone
  rather than corrected; the feed was already bottom-anchored, so overflow now
  clips the OLDEST lines off the top and the newest line is always whole — the
  game-window behaviour the card is supposed to imitate.
- **Command history in the Overview input bar** (B278). Mirrors the game bar
  including the draft stash and the `-1` clamp from B120 — which was Binu's own
  report against the game bar, and not worth shipping twice. The history belongs
  to the BAR rather than the target character, because the bar can broadcast.

## v0.19.0 — Views: Session and Overview

One substantial feature, and the shape of it is the interesting part.

- **Universal input bar in the Overview, and a Quick Send fix that fell out of
  it.** Both surfaces now deliver text through main to the OWNING window's
  `dispatchUserText` (`sendUserText` → `SEND_USER_TEXT` → `USER_TEXT`), so a
  command sent at a character is indistinguishable from one typed in its own
  bar. That closes two pre-existing Quick Send bugs Sekmeht found: a `wave` sent
  to several characters **arrived invisibly** (raw socket writes skip the
  renderer echo — B199's signature), and a `/command` typed there was
  **forwarded to DragonRealms as literal text** because the raw path never
  reached the slash intercept. The hop goes through MAIN rather than a DOM
  event because Quick Send targets the cross-window roster, and a DOM event
  cannot reach a decoupled window.
- **Quick Send reached nobody at all (Sekmeht, found during bug check #4).** The
  channel map existed in three copies — the shared `IPC` and private `CH`
  objects in `main.ts` and `preload.ts` — and `SEND_USER_TEXT` was added to two.
  `CH.SEND_USER_TEXT` in main was `undefined`, so the handler registered on a
  channel named "undefined" while the renderer published on the real one: every
  send silently vanished, including `;script`. Both private copies are deleted;
  main and preload now use the shared list. **`src/main` was also never
  typechecked** — the default tsconfig includes only `src/renderer` and
  `src/shared`, so Check zero had never looked at the main process. Adding
  `tsc -p tsconfig.main.json` reports the bug on the exact line, and it is now
  part of Check zero.
- **A fresh connect no longer loses its opening game text** (B275). The login
  handler is an invoke that resolves at the END of login, but the event pipeline
  is live from `createSession` — so the game's first output was flushed to a
  window whose only `onGameEvent` subscriber (GameWindow) did not exist yet, and
  every listener filters by sessionId. Login now HOLDS delivery and marks the
  window as the replay target, so the existing mount-time replay request claims
  it; the hold is also what makes doubling impossible. The 5s release net is
  armed after connect resolves rather than with the hold (it delivers as well as
  releases, so its window must measure the mount gap, not the login), and the
  sessionId-change effect requests a replay too, since a reconnect-in-place never
  remounts.
- **The status chips earn their place now** (B274/B276). An
  `ATTENTION_ALERT_FLOOR` separates flags that ASK for you from flags that merely
  describe: `mind-lock` (the normal state of anything grinding) and `idle` (the
  normal state of a parked character) no longer drive the app-bar badge, the
  summary count or the card's border, though both still chip on the card. One
  `needsAttention()` serves all three surfaces. The header health percentage now
  uses the same configurable thresholds as the Critical/Hurt chips, which had
  been hardcoded 80/50/30 against a configurable 25/50 and disagreed at defaults.
  `free-to-act` was removed as unreachable and redundant. The harness caught the
  contract change (110/1), its cases were inverted rather than deleted, and six
  floor cases were added - 117 total.
- **Card chip review** (B273/B274). Three condition chips passed
  `title={label}`, so hovering "Joined" explained "Joined"; each now says
  something, and the Joined wording surfaces the tester-corrected meaning that
  had been sitting in an IconBar comment (it marks the FOLLOWER, so a group
  leader shows nothing). `lpm` renamed `lines` - the only initialism among
  otherwise plain-word stat labels. The review also found that the `free-to-act`
  chip is effectively unreachable, logged OPEN as B274 because it needs a
  decision (re-derive on the clock, or drop as redundant with `idle`) rather
  than a patch.
- **The SimuCoin coin is copper, and visible** (B272). It shipped as gold dulled
  to `grayscale(.85) brightness(.78)` at `opacity: .55` - 2.36 contrast on a dark
  app bar, 1.34 on Classic Light - in the state it wears nearly all the time.
  Recoloured to a mid-tone copper that stays warm against both theme families,
  dulled far more gently, and given a theme-derived outer ring so a baked-palette
  object keeps an edge on any background. 3.58 / 3.04 measured after.
- **Bug check #5 - persistence and integration.** One real bug (B271): every
  other field of `SharedProfile` is read FRESH from localStorage inside
  `buildSharedProfile`, and localStorage is shared across windows, so a flush
  from any window is current by construction. The overview block was the ONE
  reading module memory, which made it the one shared setting a second window
  could silently revert. Fixed with a `storage` listener. The rest of the axis
  was verified rather than assumed and came back clean - coerce coverage
  (type-enforced), the equality gate, the single correct Transfer registration,
  the optional-field schema needing no bump, digest cleanup on unmount, and
  epilepsy-safe honouring colour while dropping motion.
- **Card order now defaults to TAB ORDER** (Sekmeht). Attention-sorting is real
  and still drives the flags, colours and summary strip, but as a default it
  MOVES cards while you are watching them, and a dashboard whose tiles rearrange
  under the cursor defeats the muscle memory that makes a dashboard fast.
  `/view sort attention` opts in. Changing it exposed a latent bug: the coercer
  RESTATED its enum fallbacks, so changing the default would have had no effect
  on a missing or invalid stored value; both branches now reference the defaults
  object (pitfall #121).
- **The Overview's input bar now shares the game command bar's actual CSS
  rules** rather than a copy of its recipe (Sekmeht: *"the themeing and design
  is off"*). It had been built from the same tokens and still read wrong beside
  it - flat instead of the `--bg-sunken -> --bg-base` gradient, 6px padding
  instead of 3px, a 1em input instead of 1.2em, and the border on the input
  rather than a wrapper with `:focus-within`. `.ov-inputbar*` is now named on
  `.command-bar` / `.cmd-input-wrap` / `.command-input` / `::placeholder` in
  game.css with the copies deleted, so retuning one moves both. Rider: the
  borrowing bar must pin its own `line-height`, since `.command-bar`
  deliberately sets none (pitfall #77, #113).
- **Contrast pass over the card header, measured rather than eyeballed.** The
  per-card actions menu sat at `opacity: 0` until hover in `--text-faint`, which
  measures 2.33 on Classic Light and 3.27 on the dark base - both under the AA
  floor, so even when revealed it was barely there, and a hover-only control is
  one most people never find. It is now always visible as a real chip in
  `--text-secondary` (8.74 / 7.69), with two distinct hover steps. Every other
  `--text-faint` use in the view was audited the same way: the ones carrying
  information moved to `--text-muted` (5.39 / 6.15), and faint was kept only for
  the summary separator and the disabled input. The disconnected status dot is
  now a hollow ring - hollow reads as "off" structurally and needs no fill
  contrast on any theme.
- **Bug check #4 — focus containment (pitfall #131).** The Overview leaves the
  session shell laid out on purpose, which also leaves its command bar
  *focusable* underneath the overlay. Three routes put the caret back in it:
  a GameWindow mounting while the view was open (`autoFocus` + two mount
  effects), the cursor-marker `@` path now reachable from the new bar, and no
  focus-restore on leaving the view. Every programmatic focus now goes through
  one guarded `focusCommandInput`; the type-anywhere listener guards on the
  LOCATION of focus rather than a tag denylist, so a modal opened over the
  dashboard keeps its keystrokes; and the bar's placeholder is themed like
  every other input in the app.
- **Views (DESIGN §47).** A top-level mode, orthogonal to layout mode, panels
  and Experiences: **Session** (unchanged, still the default) and **Overview**,
  a live card per character in the window — vitals, conditions, timers, room and
  occupants, hands, spell, worst wound, session stats, and a short styled text
  feed. Read-only; a click opens that character in Session view. Multi-boxing is
  the whole reason: DR is one character per account, so "who needs me?" meant
  tabbing through everyone for an answer that was stale on arrival.

- **The card is rendered BY its own GameWindow, through a portal.** This is what
  made it cheap. A portal keeps the React tree while moving the DOM node, so a
  card escapes the `display:none` session shell yet is written inside
  GameWindow's scope and reads that character's state as ordinary locals. No new
  IPC, no serialisation, no second render path — pitfall #57 dissolved rather
  than worked around. **The converse bit once:** the shared 1 Hz clock was a
  context on the app-level shell, which a portaled card can never see, so every
  card read the default forever (negative uptime, never idle). It moved to the
  store.

- **`SessionStatus` was deliberately left alone.** Its 16-term equality chain
  exists to keep the character tab strip from re-rendering on vital ticks;
  dashboard fields there would have defeated it. The cross-character reduction
  lives in a new `overviewStore` of thin scalar digests, coalesced at 500ms and
  consumed by leaf subscribers only. It is the codebase's first
  `useSyncExternalStore` — hence **pitfall #129** (a getter that rebuilds a
  derived array is an infinite loop) and **#130** (gate a payload with a key
  loop over a frozen list, so a forgotten field is a compile error rather than a
  silent staleness bug months later).

- **An overlay, not a third render branch.** The session shells keep their
  existing visibility, so the active character's Virtuoso stays measured and
  returning needs no re-snap. Hiding them instead would reintroduce the
  #24/#68 0×0 class — and `stickToBottom` keys on `isActive`, which does not
  change on a view flip.

- **Attention model** (`attention.ts`, pure and harnessed): severity order is
  chip order, reading order and sort order. Four rules it encodes — a
  disconnected character reports only *offline* (its indicators are stale), a
  null `healthPct` means "no vital yet" and must read calm, *free-to-act* is
  suppressed whenever anything real is wrong, and **`idle` is derived by the
  consumer, never pushed** (an idle character stops re-rendering, so a pushed
  flag would never arrive; the digest carries a 5s-quantised `lastInboundAt`).

- **Two corrections found after the plan was approved, both verified in-code.**
  `--game-font-size` is a document-root var written only by the *active* tab
  while font size is per-character, so every card would have rendered at the
  active character's size (each card now re-maps it inline, the PanelFrame
  mechanism). And `sceneCast`/`sceneSpeech` sit behind the §35.6 gate and are
  empty for most users, so occupancy comes from the ungated `roomState` and the
  "spoken to" flag is an opt-in that extends the gate.

- **Cost when closed is two instructions per event batch.** The accumulators run
  always on purpose — free at main's coalesced flush rate, and it means opening
  the view shows real numbers rather than zeros. The render is what's gated.

- **Extractions:** `expParse.ts` and `injuryParse.ts` out of ExpPanel and
  InjuriesPanel, so a skill line and a wound cannot be read two ways in two
  places. The B224 scar-vs-wound reasoning travelled with the code.

- Surfaces: app-bar toggle with an attention badge, Settings → Overview, View
  menu (click-only), and `/view` (bare · status · sort · set). Options are
  app-wide (`SharedProfile.overview`, optional → non-breaking); the view **mode**
  is per-window ephemeral so a decoupled window is never dragged along.

- Harness grew 42 → 85 cases (`tmp-rules-harness` §H).

---

## v0.18.6 — a guard on the quit, and two settings that weren't reaching disk

Small release, all tester-driven, and two of the three items turned out to be
the same bug wearing different clothes.

- **Closing with several characters up now asks first (F99).** Closing the
  primary window quits the app and drains every session — correct, but one
  reflexive click from losing position and roundtime across several characters.
  Confirms at **2 or more connected**, naming them, because a count is a warning
  while the names are what let you spot an alt you had forgotten. Counts
  connected SESSIONS, not tabs (the report had a disconnected tab, which costs
  nothing to close), and spans all windows, since closing the primary kills
  decoupled windows' characters too. It sits in `win.on('close')`, so X, Cmd+Q,
  File → Quit and taskbar close all inherit it.
  - The load-bearing detail is the ordering: `appClosing` is set INSIDE the
    confirm callback. Set before a confirm the user then cancels, it would
    short-circuit every later close and **the app could never be quit** —
    pitfall #114's rule extended to the case where the handler decides not to
    proceed.
  - Rendered as the canonical themed modal (Sekmeht's ask), which moved the
    confirmation into the renderer and with it a new failure mode: main blocks
    on the answer, so a dead renderer means an unquittable app. Guarded by an
    ack + native fallback. Pitfall #128 has the rest — including the one my own
    first cut got wrong, where a Ctrl+R reload AFTER the ack left the promise
    pending forever and reintroduced exactly the hang the fallback existed to
    prevent.
- **A picked theme reverted after a restart (B266).** Reported as a shutdown
  problem; it wasn't. The close flush is fine — it flushes *pending* saves, and
  nothing was pending. `ThemePicker`'s `onThemeChange` never called
  `scheduleProfileSave`, so localStorage had the new theme while the YAML kept
  the old one, and `importCharacterProfile` copies the YAML's theme back into
  localStorage on the next connect. Intermittent, because any other change that
  scheduled a save carried the theme along with it.
- **A one-shot trigger re-armed after a restart (B267).** Found by sweeping all
  62 persistence writes in GameWindow for the B266 shape. `disableTrigger` wrote
  localStorage but scheduled no save, so a fired one-shot came back armed.
  `detectedGuild` looked like a third instance and is a false positive — its
  save happens inside `handleFocusChange`, which is what B56 added.

- **SimuCoins show your balance now (F100).** It was already being scraped on
  every check and thrown away, so the popover could only say "nothing to
  claim". Settings gets a quiet per-account line under the state line; the coin
  gets ONE aggregated line that never grows with the roster (pitfall #109 is
  the whole reason that surface exists in its current shape). No new network
  work. The missing half was persistence — main's status cache is in-memory, so
  a restart forgot the figure; it now rides `_shared.yaml` per account as
  optional fields, recorded at the one choke point every check route converges
  on. Honesty rules carry §42.4's posture onto a number: a failed check keeps
  the previous figure AND its real age rather than blanking it or re-stamping
  the time, the age is never optional, unknown renders nothing, and revoking
  consent drops the cache. Building it hit pitfall #121 twice — the coerce
  (expected, handled) and a restated inline `Partial<{…}>` at Settings' write
  path (caught by `tsc`).

**The rule these keep re-teaching:** writing localStorage is HALF a
per-character change. Principle #1 makes the YAML the truth, so the `scopedKey`
write and the `scheduleProfileSave` belong in the same handler. This is now the
third time (B56, B266, B267).

**Left deliberately:** `saveCommandHistory` has the same shape, but it writes on
every command — scheduling a save there means a full profile serialize and disk
write roughly every 2.5s during active play. That trade wants a decision rather
than a reflex.

**Two pre-ship checks caught things the build could not**, both worth recording
because neither would have failed a test that only looked at the happy path:

- **A THIRD simucoin coerce site, and the dangerous one.** `importSharedProfile`
  had its own inline copy that rebuilt each entry as `{consented, autoClaim}` —
  and it runs at EVERY LAUNCH, so it would have stripped `lastBalance` on
  startup and silently defeated the whole persistence half of F100. It restated
  the type inline too, so `tsc` was blind to it. Fixed structurally: one
  exported `coerceSimuCoinConfig` now serves both readers. CLAUDE.md's own line
  saying there were TWO coerce sites is what found it — the docs did their job,
  the pitfall #121 warning written earlier the same session did not, because I
  had only grepped the file I was editing. Verified by bundling the real module
  and asserting the round trip.
- **`quitAlreadyConfirmed` was latched forever.** The update-install bypass for
  F99's close confirmation was set and never reset, so a `quitAndInstall()` that
  didn't take (nothing staged, install refused) left the confirmation silently
  disabled for the rest of the session. Now self-heals after 10s — restoring a
  safety feature is the safe direction, and the cost is at most one extra prompt.

**Cross-platform pass on both features — clean.** No platform-specific
constructs in the new code; `toLocaleString` correct across en/de/fr/hi/ja
(fr-FR's U+202F is the proper separator, not a defect); Linux without a keyring
degrades to "no accounts, no coin, no balance line" without throwing; the macOS
B245 quit chain is intact; and the native fallback's `response` is an INDEX into
`buttons`, so it is immune to per-platform button ordering. Every close route
reaches the guard including `{ role: 'close' }` (⌘W) on the primary — correct,
since closing the primary IS the quit. One accepted behaviour change: on macOS
the confirm cancels an OS-initiated logout, exactly as any unsaved-work prompt
does. There is no clean fix — `before-quit` fires identically for ⌘Q and an OS
logout — so it is documented rather than guessed at.

---

## v0.18.5 — a performance pass, and the map stops stealing the console's frames

Started as "the client feels a little sluggish, and it hasn't always been this
way." The hardware was never the story (i7-11700F / 32GB / RTX 3060), and
neither, it turned out, was the text pipeline.

- **The map was starving the text window, and one tester observation cracked
  it.** Turning Genie Map Animations off made the *console* flow better — which
  is impossible unless both are competing for the same thread, because they are.
  `.genie-pan-dragging *` and `.genie-anim-off *` made Blink invalidate the
  **entire** pan subtree (~1057 room groups) on every toggle of the class, and
  `inMotion` flips on every room change, so walking re-ran a full-subtree style
  recalculation continuously — on the main thread React and Virtuoso share. Both
  rules now enumerate the 18 animated classes; verified behaviour-identical by
  script rather than by eye, since four `genie-mote-drift-*` classes declare
  their animation through longhand and a `grep "animation:"` sweep misses them.
  B263, and CLAUDE.md pitfall #126 for the general rule.
- **Wheel zoom was doing more work than there were frames.** `setTransform` ran
  once per wheel *event*, and a wheel fires well above 60Hz; each commit
  re-rasterizes the SVG **and** recomputes stroke geometry for every
  `non-scaling-stroke` element, because non-scaling stroke width is defined
  against the CTM. Deltas now coalesce into one rAF-batched commit. Dragging was
  always smooth for the same reason zoom wasn't: translate keeps the CTM scale
  constant and reuses the raster. B264. Removing `non-scaling-stroke` is the
  bigger win still on the table and was deliberately declined — it's a visual
  change (borders would scale with the map), not a free one.
- **Two always-on costs removed.** The character tab bar ran a 500ms interval
  **forever** to drive a roundtime glyph, re-rendering an app-level component
  twice a second whether or not any roundtime existed (and `backgroundThrottling`
  is off, so it ticked while minimized); it's now gated on a pending expiry and
  self-clears one tick past it. And the story window's Virtuoso overscan dropped
  3000px → 1200px: it existed solely as B152's copy-truncation workaround, which
  the same release's data-model rebuild supersedes. 1200px still clears one
  viewport, so ordinary selections keep exact character offsets.
- **Production sourcemaps are opt-in** (`LB_SOURCEMAPS=1 npm run build`). They
  were shipping in the asar — ~4.3MB for the renderer, ~1.7MB for main — against
  a code comment that said to turn them off before release. esbuild has no
  `emptyOutDir`, so [build-main.mjs](build-main.mjs) now sweeps stale maps too;
  without that, toggling maps off once would have left the previous build's
  now-wrong maps shipping forever.
- **Within-major dependency bumps.** Electron 43.0.0 → **43.2.0** (Node 24.18 /
  Chrome 150.0.7871.129 / ABI 148), react-virtuoso 4.18.11, js-yaml 4.3.1,
  `@electron/rebuild` 4.2.0, `@types/node` patch. Held majors (React 19, Vite 8,
  TS 7, better-sqlite3 13) untouched. **better-sqlite3 needed no rebuild** — ABI
  was unchanged, proven by loading it under the new runtime and running a real
  query rather than reflexively forcing a rebuild of a working native module.
  The `ELECTRON_RUN_AS_NODE` leak documented in the packaging notes bit again
  during the smoke test and impersonated an Electron API break exactly as
  described.

- **Animation now stops when the window is off screen.** `backgroundThrottling`
  is off by design (the room pump and game stream must keep running while
  minimized, pitfall #71) — but that also meant every CSS animation in the app
  kept doing style and paint work nobody could see: the map's ~20, the
  Experiences' ~24, the highlight text effects, times every mounted character.
  Main now pushes `minimize`/`restore`/`hide`/`show` to the renderer, which
  stamps `data-window-hidden` on `<html>`. **This cannot be driven from
  `document.hidden`** — Electron's own docs say `backgroundThrottling: false`
  also affects the Page Visibility API, which is why pitfall #96 flagged the
  existing guards as probably inert. Deliberately NOT wired to blur/focus: an
  unfocused window is usually still visible. Zero visual change when visible.
- **The orrery pill's `backdrop-filter` is gone.** `blur(9px) saturate(1.25)` on
  an element up to 96% of the scene wide, floating over a sky whose backdrop is
  *always* changing (stars, clouds, weather, the moons), meant the compositor
  re-captured and re-blurred that whole band continuously. The blur was doing
  legibility work as well as decoration, so the fill went 60% → 88% opaque to
  keep the text readable; sheen, border and inset highlight are untouched, so it
  still reads as a raised glass pill.
- **Permission handlers now share one allowlist (B265).** Audited as "the trigger
  `notify` action can never fire" — **which was wrong**, and a throwaway Electron
  harness caught it before working code got "fixed". `setPermissionCheckHandler`
  was `() => true`, and `Notification.permission` is a *check*, so it read
  `granted` and notify worked — while `requestPermission()` resolved `denied`
  from the request handler. The feature worked by accident, and mirroring the
  request allowlist into the check handler (the obvious hardening) would have
  silently killed it. One `ALLOWED_PERMISSIONS` set now feeds both. Also a
  tightening: `() => true` had been granting geolocation, media, serial, HID and
  USB to any check. Pitfall #127.

**Platform audit (Electron 43.2 / macOS / Linux) — clean.** No removed or
deprecated Electron APIs in use (`enableRemoteModule`, `nativeWindowOpen`,
`worldSafeExecuteJavaScript`, `allowRendererProcessReuse`, `@electron/remote`,
`registerFileProtocol`, `desktopCapturer`, `systemPreferences` all absent);
security posture correct. macOS has its `appMenu` role, `activate` handler and
darwin `window-all-closed` guard. Linux: all **571 relative imports audited for
case-sensitivity, zero mismatches**. Nothing platform-specific needed fixing.

**The Experiences were audited and found well built** — contrary to the working
assumption that something in Moons or the Tableau had to be expensive. Measuring
properties animated *inside `@keyframes` only* (a whole-file sweep is misleading,
it counts static declarations): 35 `opacity` + 18 `transform` + 4 `box-shadow`,
and **zero layout-triggering animations** anywhere. Particle counts are modest
(~130 worst case). The `backdrop-filter` above was the one genuine outlier. Note
the v0.18.0 profiling that pronounced them clean measured React *render* cost —
the same metric that would have missed the map bug — so the axes checked here
were style recalc, paint and compositing.

**Deferred, deliberately:** viewport-culling the node layer (real win when
zoomed in, but it puts `transform` in the `nodeRects` deps and risks re-creating
the churn B231 fixed — wants a profile first, not a guess), and decomposing
GameWindow (5,576 lines / 207 hooks, re-rendered per event batch — the real
ceiling, but it drags the whole scroll state machine with it and belongs in its
own changeset with its own pass against the pitfall #68 scenarios).

---

## v0.18.4 — the sky told the truth, and the logon screen grew teams

Mostly tester-driven, and two of the reports turned out to be the same shape:
a display that was confidently wrong.

- **The moons and the sun were both fast/slow against the community site.** The
  moons were a stairstep (the arc position only moved once a minute, and
  flooring elapsed can only hold a moon BACK) plus orbital constants still on
  moonwatch's pre-v4.2 rounded integers. The sun was worse — not drift but a
  wrong MODEL, assuming an even 180/180 day when Elanthian daylight swings
  120/180/240 rois across the year. moonwatch's model is now ported verbatim,
  tables and all, and **diffed against its own Ruby: 52 timestamps, 2104
  assertions, zero mismatches.** The sun is a pure function of server time now,
  so it works direct-SGE with nothing observed. B253, B254.
- **Two parser bugs from real captures.** `INV HELP` sheared in half because
  mono-mode leading whitespace was dropped before `<d>` links (B255); and
  shadewatch / arena / distant gaze shredded sentences mid-word because DR
  splits one sentence across consecutive pushStream blocks and we treated a
  stream boundary as a line boundary (B256, pitfall #120). Reading how
  Profanity, Frostbite and Genie handle the same tags is what settled the
  design — none of them ends a line there, and their flush writes characters
  where ours emits a line.
- **The Genie map could strand permanently** on "waiting for game data" after a
  trip to the Lich map, because the view switch unmounts it and the resolver
  lost its breadcrumb (B257). MapPanel holds that state now. Deliberately not
  fixed by keeping the view mounted — that costs ~1000 SVG nodes per CHARACTER.
- **Living Tableau UI/UX pass.** Status chips stopped landing on the gauges,
  bubbles stopped overlapping each other (the header clamp was re-creating the
  collision it was meant to avoid — pitfall #123), bubbles now avoid the thought
  log and gauge band, spacing scales with the font, and the faintest wisp is
  readable again. Sekmeht: *"the living tableau looks good this version."*
- **Teams on the logon screen** (F97). The Sets dropdown named a noun and
  explained nothing; a collapsible section shows the members, so the content IS
  the explanation. Favorites became the quick-select block for teams AND
  characters, teams gained notes and a pin, and Team Login was restructured so
  saving is an opt-in checkbox rather than its own zone.
- **Debug window** is exempt from the window lock and always on top (F96), and
  **Cancel on the connecting screen actually cancels** (B261) — it had been
  wired only to the 1.5s grace timer, so past that it hid the overlay while the
  login carried on.

**Team Login can be stopped part-way** (F98), reversing a recorded decision.
The old note said a mid-sequence cancel would leave a partially-connected
state — true, but partial is unavoidable once the run starts, so the real
choice was an escape or none. It is **Stop**, not Cancel: the character in
flight lands and is kept, the rest are skipped and reported as skipped rather
than failed.

A macOS pass found the new code platform-neutral throughout, with one real
issue: symbol glyphs like the Teams header's crossed swords can arrive as
colour emoji there and stop obeying `color`. Fixed with a text-presentation
selector; 26 pre-existing glyphs of the same class are recorded but deliberately
unswept, since macOS rendering cannot be verified from this machine (B262,
pitfall #125). A CSS audit of every class rendered by a touched file — the
repeatable version of what B260 caught by accident — found one more missing
rule.

Four of this version's defects were caught by the pre-merge check rather than by
a tester: the Debug z-offset that would have been outgrown, a cancel flag reset
at one of four call sites, a bubble policy that could drop every bubble in a
short panel, and pinned teams leaking into the Add Character modal. Two silent
data-loss traps were caught while building Teams — a coercer that rebuilds
entries destroys fields it does not copy (pitfall #121), and an upsert that
overwrites wholesale wipes what the caller did not supply.

## Current Status

**Phase 1 — Complete ✅**
**Phase 2 — Complete ✅**
**Phase 3 — Complete ✅**
**Phase 4 — Complete ✅**
**Phase 5 — Complete ✅**
**Phase 6 — Complete ✅ (6A–6C; 6D moved to backlog)**
**Phase 7 — Complete ✅ (7A Highlights ✅, 7B Triggers ✅, Post-7B UI pass ✅, 7C Macros & Aliases ✅)**
**Phase 8 — Complete ✅ (Automations, Groups & Modes)**
**Bug Fix Pass — Complete ✅ (Right-click prefill wiring, stale modal state)**
**UI Polish — Context Menu Separators ✅**
**Debug Panel — Raw XML Tab ✅**
**XML Parser Audit & Stream Discovery Overhaul ✅**
**XML Parser Audit Round 2 — Injuries, Exits, room creatures/extra ✅**
**XML Parser Audit Round 3 — ExpPanel footer (rexp/tdp/favor/sleep) ✅**
**RT/CT Timer Polish — Chip style, bar/chip parity, visual tuning ✅**
**ExpPanel — Mind Locked section moved above Learning ✅**
**Window Title Bar — Character name + game code from `<app>` XML ✅**
**Stream Timestamps — Per-stream [HH:MM] toggle via right-click context menu ✅**
**Packaging & Auto-Update — Portable exe via electron-builder, GitHub Releases, electron-updater ✅**
**Auto-Update UX — Dismissable banner, Check for Updates button, "You're up to date" feedback ✅**
**Auto-Updater Fix — `app-update.yml` bundled as extraResource; was missing from portable builds causing silent failure ✅**
**Artifact Name Fix — `artifactName` uses hyphens; matches GitHub asset URL so download works correctly ✅**
**Release Folder Cleanup — `publish.mjs` deletes old exes/ymls before each build; prevents stale file pickup ✅**
**Version Display — Version shown on login screen and in window title bar ✅**
**Application Menu — File/Edit/View/Window menu; File → Open Data Folder ✅**
**DevTools — Closed by default in packaged builds; accessible via View menu ✅**
**Release Notes — `publish.mjs` injects `release-notes.md` via GitHub REST API PATCH after build ✅**
**Release Pipeline — `publish.mjs` runs `npm run build` first so version is always baked in correctly ✅**
**`latest.yml` — generated manually in `publish.mjs` via SHA-512 hash of the exe; electron-builder does not produce it for portable builds ✅**
**Login Screen — card height stabilized; no more resize while connection log scrolls ✅**
**Lich Path Auto-Detect — ↺ button scans C:\Ruby4Lich5 for Ruby version folders and Lich5; ✓/✕ icons per path; status message for partial/missing/no-folder cases; Windows only ✅**
**Direct Connection — Advanced panel shows message instead of empty box when Lich is unchecked ✅**
**Disconnect Handling — clean disconnect tracked in main process (`cleanDisconnect` flag); set by: `quit`/`exit` command sent (Lich path), Disconnect button IPC, or `<exit/>` XML tag (direct path); `clean` bool passed in status payload — no cross-channel race; debug panel no longer auto-opens on intentional disconnects (B11 partial fix ✅)**
**Toolbar & Title Polish — disconnected status in accent color; window title uses pipe separator; title tracks connection state: `DR [Not connected]` → `CharName · GAME [Connected]` → `CharName · GAME [Disconnected]`; "Connection closed." injected into main text on disconnect with blank line above and timestamp ✅**
**Debug Panel — B11: `autoFocus` on command input prevents debug button stealing focus at startup ✅; B12: tab-switch `useEffect` scrolls Raw XML to bottom on first open ✅; F06: Copy All button (toolbar + right-click) copies active tab content to clipboard; raw XML lines trimmed before join to prevent blank lines in pasted output ✅; F09: `showDebugRef` gates `setDebugEvents` and `setRawXmlLines` — no re-renders from debug collection while panel is closed ✅; B14: Events tab scroll lock fixed — stable `key={eventBaseRef+i}` prevents content shifts when buffer rolls over ✅**
**Exp Panel — F10: rank-gain detection via `CaptureContext.hasBold` in parser; `rankUpSkills` state + 3s timers in GameWindow; skill rows bold for 3s on rank gain ✅; F11: Death's Sting badge in footer — detected from second `exp rexp` component overwriting first in same batch; red italic badge; RXP data hidden while active ✅; B15: RXP usable regex updated to handle both `minutes` and `hours` formats; ExpBrief sends empty rexp component — RXP row correctly hidden ✅**
**Settings — System Font Picker ✅: inline scrollable font list replaces 4-preset dropdown; Local Font Access API via `queryLocalFonts()`; Electron `setPermissionRequestHandler` + `setPermissionCheckHandler` required for full enumeration; monospace filter via canvas width test; font family auto-scrolls to selected entry on open; defaults: Consolas 12px Compact; legacy preset keys migrated transparently on first open ✅**
**Graceful Close ✅: clicking the window X, File → Quit, or Window → Close now sends QUIT to the game server before the window closes; `mainWindow.on('close')` intercepts the event, sets `cleanDisconnect`, calls `gracefulDisconnect()` (5s timeout), then calls `destroy()`; only triggers when `connected = true` so login screen closes instantly; all OS-level close paths covered by the single `close` event handler; `connected` set to `false` immediately on close to prevent double-trigger if X is clicked twice ✅**
**Font panel CSS bug fixes ✅: fixed em-compounding in `.exp-chevron` (nested inside `.exp-group-header`) and `.exp-footer-label` (nested inside `.exp-footer-row`) — corrected em values to account for parent's scaled font-size; fixed `.room-panel--empty` font-size being overridden by CSS cascade when both `.room-panel` and `.room-panel--empty` classes are on the same element — removed explicit font-size from `.room-panel--empty` so it inherits correctly from the container ✅**
**Settings — Font propagation to all panels ✅: `--game-font-size` and `--game-line-height` CSS vars now anchor on `.stream-panel`, `.room-panel`, `.exp-panel`, `.injuries-panel`, `.panel-frame-tabs`, and `.game-toolbar`; structured panel children converted from `rem` → `em` so proportions are preserved at default 12px and scale with the slider; panel tab labels, toolbar buttons, toolbar title, and status text also scale; font family was already global via `body` inheritance ✅**
**B17 — Combat scroll-pin race ✅: `onWheel` on the text window sets `pinnedRef = false` immediately when user scrolls up (synchronous, fires before DOM scroll); prevents `useLayoutEffect` from re-pinning in the same frame when combat lines are arriving very fast; also added `pinnedRef = false` to `PageUp`/`Home` keyboard handlers which had the same gap ✅**
**B20 — Scroll pin breaks after ~2000 new lines ✅: root cause is `overflow-anchor: none` on `.text-window` — trimming lines from the top while scrolled up doesn't adjust `scrollTop`, so the view drifts forward toward newer content each trim cycle. Fix: don't trim while unpinned; lines append freely; badge/End re-pins and trims to MAX_LINES; hard cap at 6000 auto-resumes. Also removed `dist < 2` re-pin from `handleScroll` (only un-pins now) and stale-true guard on pre-`setLines` DOM check. Tested stable at 3600+ new lines. ✅**
**B19 — Home/End in automation text fields ✅: document `onKeyDown` scroll handler was intercepting Home/End for all elements except the command input; added `HTMLInputElement`/`HTMLTextAreaElement` guard so the scroll-key handler is skipped whenever any text field has focus ✅**
**B18 — Auto-copy restored via native clipboard IPC ✅: `navigator.clipboard.writeText` silently failed due to permission handler added for font picker in v0.1.9; even with `clipboard-write` whitelisted Electron's internal name didn't match; replaced with Electron native `clipboard.writeText` via `write-clipboard` IPC channel — synchronous, no permissions needed; `setPermissionCheckHandler` simplified to `() => true` ✅**
**Map System Polish Pass ✅: B22–B27 internal bug fixes (LabelMode at module scope; unused currentRoomId prop removed throughout; computeFit center recalculated correctly when scale is clamped; indexing counter now reactive via indexedCount state; loadZone cancels active walk on zone switch; empty arc.move guarded in exit click and BFS); stale map path handling — list-map-dir returns null for missing directory (silently clears stored path), loadZone silently resets on missing file; Location Unknown strip shown above canvas when player is in a room with no node match; official 16-color room legend wired up (COLOR_LEGEND constant) — legend panel shows name + description for known colors, unknown colors still render on map but are hidden from the legend panel ✅**
**B29 — Hide Lich Window ✅: Electron is a GUI process with no console — direct spawn with windowsHide:false produced no visible window as there was no parent console to inherit. Fix: hidden path keeps direct spawn with windowsHide:true; visible path uses shell:true to route through cmd.exe which creates its own console window for Lich output ✅**
**Profile System — Phases 1–3 ✅: YAML-based portable character profiles; `profiles\` folder in install directory; `_shared.yaml` (account, lich paths, ruby path, lich client flag, lichPort, portLocked, modeLocked, map dir, game definitions table, custom themes) + per-character YAMLs (account, game, theme, settings, layout incl. mapLabelMode, automations, contacts); `js-yaml` for serialization; IPC handlers in main process; Phase 1: `buildSharedProfile`/`buildCharacterProfile`/`scheduleProfileSave`/`scheduleSharedProfileSave` — export fires on connect (both files), on disconnect (character), and debounced 2.5s after settings/automations/theme/contacts/mode-switch/mapDir/myThemes changes; Phase 2: `importSharedProfile()` on login screen mount pre-fills account name and all Lich/port/mode settings; Phase 3: `importCharacterProfile()` on connect before GameWindow renders — YAML is authority for all subsequent logins; stale closure bug fixed (account/character captured via refs in connection handler) ✅**
**Automations — allGroups default ✅: New highlights, triggers, macros, aliases, and contact templates now default to `allGroups: true` so they are active regardless of which group mode is running; user can narrow to specific groups after creation ✅**
**Legacy Client Import Wizard ✅: 3-step modal (source → preview → confirm) accessible via Import button in Automations panel header; supports Wrayth (XML), Genie (.cfg files), and Frostbite (.ini files); neutral ImportCandidate intermediate layer; per-client parsers (wrayth.ts, genie.ts, frostbite.ts) with colorUtils.ts (Wrayth palette, Genie named colors, Frostbite Qt @Variant QColor decoder) and keyNormalizer.ts (Genie, Wrayth, Qt key formats); mapper.ts converts to HighlightRule/TriggerRule/MacroRule/AliasRule with allGroups:true; Genie presets.cfg → custom theme (CSS var mapping: game text, vitals, HUD bars); substitution rules counted but deferred to future feature; per-tab checkbox selection with select-all/deselect-all; append vs replace-all merge strategy; profile-aware (onSaved triggers scheduleProfileSave, onThemeSaved triggers setMyThemes + scheduleSharedProfileSave); bug fixes: presets bg colors now correctly parsed from combined {fg, bg} colorspec in args[1] (args[2] is a boolean flag, not bg); highlight class tags now stored as sourceClass for preview display ✅**
**Import Wizard — Clean import pass ✅: all imported items (highlights, triggers, macros, aliases) now produce `name: ''` so users can label them after reviewing rather than inheriting source-client names; Genie `/i` flag correctly parsed — patterns ending in ` /i` are case-insensitive, all others case-sensitive (previously all highlights were hardcoded to case-insensitive); highlight sounds stored directly on `HighlightRule.soundFile` — no companion trigger created; `highlightToTrigger` helper removed; import wizard preview table shows a Sound column for highlights ✅**
**Sound File Playback ✅: `soundFile?: string` added to `HighlightRule` and `TriggerAction`; `playWavFile(filePath)` in `useTriggerEngine.ts` converts Windows backslash paths to `file:///` URLs and plays via `new Audio(url).play()`; HighlightsPanel editor has Sound row with path input, Browse (file dialog), ▶ test, and ✕ clear buttons; stale closure fixed on async Browse button via `setDraft(prev => ...)` functional setter; TriggersPanel sound action supports both preset tones (chime/alert/alarm/ping) and WAV file path — preset pills dimmed when WAV is set; Browse button stale closure fixed via `actionRef.current` pattern; trigger sound action summarized in fire log ✅**
**Triggers Panel UI ✅: action type selector replaced 9-pill row with `<select>` dropdown; `VarPicker` floating portal menu replaced with `<select defaultValue="">` — selection inserts `$var` at cursor position and resets via direct DOM mutation `e.target.value = ''`; color swatch WebKit white-box fixed via `-webkit-appearance: none` and `::-webkit-color-swatch-wrapper { padding: 0 }` ✅**
**Numpad Key Detection ✅: `NUMPAD_CODE_MAP` in `macros.ts` maps `e.code` values (`NumpadSubtract`, `NumpadAdd`, etc.) to display strings (`Num-`, `Num+`, etc.); `formatKeyCombo` checks `e.code` first so numpad keys are distinguished from their keyboard twins regardless of NumLock state ✅**
**Command Echo ✅: `sendCommandSequence` echoes each command to the main stream as `>command` using `command-echo` preset before sending to server; macro keypress and alias resolution both use this path; alias echo suppressed for the original typed alias name — only the resolved commands are shown; commands with `delayMs > 0` echo at the same time they fire (respects per-command delay) ✅**
**Debug — Fires Tab ✅: third tab in Debug panel (opens by default) showing a live stream of every highlight and trigger that matches incoming game text; columns: timestamp, HIGHLIGHT/TRIGGER badge, stream, rule name (falls back to pattern if name blank), matched line text, detail (for highlights: scope/mode + fg/bg colors + glow + sound; for triggers: pattern + state gate conditions + interpolated action summaries); highlight scan gated on `showDebugRef.current` — zero overhead when debug panel is closed; trigger `onFire` callback same gate; fire log capped at 500 entries (same as event buffer); `FireLogEntry` type in `shared/types.ts`; `logHighlightFiresRef` receives stream name so duplicate entries from multi-stream lines show which stream each fired on ✅**
**Stream Name Normalization ✅: all stream IDs normalized to lowercase at every ingestion point — `echoToStream` (trigger echo actions), `stream-declare` events, and `stream-push` events; custom panel tab ID is now the normalized stream name (`makeCustomTab` uses `name.trim().toLowerCase()` as the `id`) so a panel named "Sekmeht" automatically receives data echoed to stream "Sekmeht", "sekmeht", or any case variant; display label is first-letter-capitalized from the id; empty panel message uses the label not the raw id ✅**
**Contacts — Group-aware templates ✅: `ContactTemplate` now has `groupIds` and `allGroups` fields; template editor in ContactsPanel has a Groups row (All Groups button + GroupPicker, same pattern as all other rule editors); `activeContactTemplates` computed in GameWindow via `isRuleActive` — contact name styling (color, tag, bold) toggles with mode switches exactly like highlights and triggers; Friends and Enemies default templates updated to `allGroups: true`; `normalizeTemplate` fills in defaults for old saved data; `groups.css` imported in ContactsPanel ✅**
**Map Panel UI Reorganization ✅: Two-bar chrome layout — top toolbar is file management only (folder, refresh, zone select, search); bottom bar holds all navigation and view controls (◆ center, room ID badge, z-level chips, Labels dropdown, ⊡ fit, ▤ legend, ■ stop-walk); color legend converted from flex child to absolute overlay inside canvas wrap so it never squeezes the map in compact panel sizes; current room label deferred to end of nodeLabels array so it always paints on top of neighboring labels ✅**
**Map Theming ✅: Map panel fully theme-aware via 18 CSS custom properties (--map-bg, --map-chrome-bg, --map-border, --map-border-subtle, --map-text, --map-text-muted, --map-btn-bg, --map-btn-border, --map-select-bg, --map-select-color, --map-node-fill, --map-node-stroke, --map-arc-cardinal, --map-arc-vertical, --map-arc-special, --map-arc-hidden, --map-dot, --map-current-color). All 18 built-in themes have per-theme overrides. XML-defined node colors are never overridden. Current room indicator (pulse ring, crosshair, label) resolves from --map-current-color. arcColor() returns var() strings so arc colors update live on theme switch. applyCustomTheme() now merges over darkBase before applying, so pre-existing custom themes automatically receive correct map defaults without needing to be rebuilt ✅**
**Virtual Scrolling — Main Window (B33) ✅: replaced `lines.map(<TextLineRow>)` with react-virtuoso `<Virtuoso>` component — only ~50 visible rows in DOM instead of 2000; eliminates the Layout/Paint bottleneck seen in Chrome DevTools traces during heavy combat and movement bursts; scroll following via `useLayoutEffect` + `scrollToIndex('LAST')`; un-pinning via direct scroll event listener on Virtuoso's scroller element; `suppressUnpinRef` 150ms guard prevents programmatic scroll events from spuriously clearing pin state; `overflow-x: hidden` applied directly on scroller element to preserve word wrap; behavior of scroll-to-bottom badge, End key, wheel un-pin, PageUp/PageDown, and Home key all preserved ✅**
**Virtual Scroll Polish — B35/B36 ✅: B35: removed `padding: 8px 12px` from `.text-window` container; horizontal spacing moved to per-item `.text-line-wrap` wrapper div so Virtuoso scroller fills the panel flush — fixes scrollbar gutter gap, FloatingCompass alignment, and item-width estimation errors that caused scroll to land short; B36: replaced single `scrollTop` assignment with two-pass scroll (immediate + `requestAnimationFrame` correction) — first pass brings unrendered bottom items into Virtuoso's render range, rAF re-reads true `scrollHeight` after measurement and corrects to exact bottom; `suppressUnpinRef` window extended to cover rAF timing; both `useLayoutEffect` auto-scroll and badge `scrollToBottom()` use the two-pass approach ✅**
**`<clearStream>` custom stream fix (B37) ✅: parser's `clearstream` case fell through silently for any stream ID not in `STREAM_MAP` or `COMPONENT_STREAM`; Lich scripts calling `<clearStream id="LichScripts"/>` or `<clearStream id="moonWindow"/>` had their clear dropped, causing panels to accumulate all historical output instead of refreshing each run; fix: fall back to raw `id` in the parser, consistent with how `pushStream` handles unknown IDs ✅**
**Raw stream ID preservation ✅: removed all `toLowerCase()` normalization from stream ID ingestion points — `stream-text`, `stream-declare`, `stream-push`, `echoToStream`, `clearstream` parser case, and `makeCustomTab`; stream IDs are now preserved in their original capitalization from the script/server throughout; `LichScripts` and `moonWindow` are stored, routed, and cleared using exactly the case the script sends; the `NEVER_DISCOVER` filter remains case-insensitive (hardcoded lowercase constants); stream `title` attribute (e.g. `title="Moons"` on `moonWindow`) is used as the panel tab's display label — falls back to the stream ID with first character uppercased when no title is declared; trigger echo stream names must use exact case matching to reach their target panel; built-in game streams are always lowercase as the server sends them ✅**
**Panel Tab Right-Click — Clear Stream ✅: right-click any panel tab to open a context menu with "Clear" (wipes the stream's content) and "Close tab"; `ContextMenu` portal reused from GameWindow; `debug` tab routes to `onClearDebug()`, all other tabs route to `onClearStream(tab.id)`; useful for snapshot-style Lich script panels (moonWatch, LichScripts) where users want a manual reset independent of script-sent clearStream events ✅**
**B39 — Stream panel re-pin fix ✅: `handleScroll` in StreamPanel was unpin-only — once a user scrolled up in any stream panel (Thoughts, Arrivals, Deaths, custom Lich panels) it was permanently stuck in unpinned mode; scrolling back to the bottom did not re-enable auto-follow. Fix: `pinnedRef.current = dist <= 40` — re-pins when user scrolls back within 40px of the bottom ✅**
**Performance Pass — Main window rendering ✅: four targeted optimizations verified via Chrome DevTools profiling across movement, swimming+RT, idle, and heavy-XML scenarios: (1) chip-pulse animation changed from `filter:brightness` to `opacity` — opacity is compositor-only, eliminating 142ms Recalculate Style cost per recording during active RT/CT; (2) `TimerDisplay` extracted as `memo`'d component owning `useTimers` — 100ms interval ticks no longer re-render GameWindow and all its children; (3) `suppressUnpinRef` bool+timer replaced with `suppressUntilRef` timestamp — eliminated all `clearTimeout`+`setTimeout` churn from the scroll suppression path (75% reduction in timer scheduling overhead during fast movement); (4) trigger engine `fastLower` pre-filter — same substring pre-check already used by highlight engine added to `useTriggerEngine.processLine`, cutting most trigger evaluations to a single `includes()` call on non-matching lines ✅**
**Toolbar — Disconnect/Login button state colors ✅: button shows red border+text when connected (signals danger/exit) and green border+text when disconnected (draws attention to Login) ✅**
**B40 — Raw XML tab scroll lock fix ✅: `rawXmlLines` buffer trimmed with `shift()` on overflow but used `key={i}` (index-based) — same root cause as B14; all DOM nodes shifted their content on trim, making the view scroll forward while pinned up; fixed with `rawBaseRef`/`prevRawLenRef` stable key offset in DebugPanel, matching the existing eventBaseRef pattern ✅**
**Release A — "Honest Client" v0.2.0 ✅: Legacy client import wizard (Wrayth, Genie, Frostbite); 3-step modal; neutral ImportCandidate layer; per-client parsers; Genie presets.cfg → custom theme; profile-aware import ✅**
**Release B — "Lich Visibility" v0.3.x ✅: Lich JSON map system ✅; Script browser ✅; YAML profile viewer ✅; B41 setCommand fix ✅; Hybrid graph view (Genie augmentation, zone-by-zone) ✅; B52/B28/B42/B53 bug fixes ✅; password save (DPAPI) ✅; theme contrast + CSS wiring pass ✅**

---

**v0.18.3 — Tester-driven: two long-standing bugs finally reproduced, a macOS script blocker, command-history control, and a three-state status dot**

Almost entirely reports. Full root-cause notes in BUGS.md (B248-B250, F82-F84); durable lessons are new **pitfalls #116 and #117**.

- **B249 — the Lich Dashboard search highlight, diagnosed at last.** Reported repeatedly, never reproducible, and the pair of clues that cracked it were *"fine in the Ruby editor, off in the YAML profile"* plus a screenshot at **line 1083**: that combination says ACCUMULATION, not a mismatch. All four metrics were correctly pinned to `1.3rem` — the value itself was wrong. 20.8px is not representable on Chromium's 1/64px layout grid, so layout used 20.796875 while `getComputedStyle` reported 20.8, and `n × lineHeight` drifted ~3.4px by line 1083. Pinned to `21px`. **The mechanism is inferred, not measured** — an Electron harness to prove it broke on the `--` in the scratchpad path and threw error dialogs at the tester before being abandoned — but an integer line-height can only improve the arithmetic.
- **B250 — a Lich script that works everywhere else fails on macOS** (Zithri): `invalid byte sequence in US-ASCII`. Not a script bug and not a Lich bug — **our spawn environment**. Ruby takes `Encoding.default_external` from the locale, and a Finder/dock-launched app has no `LANG`, so Lich read the `.lic` as US-ASCII and died on the first non-ASCII byte. Same root cause as `resolveRubyw`'s note: a GUI-launched app inherits no shell environment — no `PATH`, and no `LANG` either. Now defaults `LANG` when absent, off Windows only. Probably explains other "works elsewhere, fails here" script reports.
- **B248 — the script list called the user's own scripts "core"** (Zithri). Not a macOS bug: the split is `scripts/custom/` vs `scripts/`, and his were in `scripts/`. The label overclaimed — nothing can distinguish a Lich-authored script from a user's at that path. Filters now name the FOLDER, and the edit warning no longer asserts provenance it cannot know.
- **F82 — command-history minimum length** (Qij). Settings → Behavior + `/history min N`, app-wide in `_shared.yaml`, **default 0 = today's behaviour**. One insertion point, because `dispatchUserText` is the only writer of history.
- **F83 — three-state status dot.** Yellow when a background tab has dropped; the tooltip names who. Green now means "everything is fine" rather than "this tab is fine". Reconnecting tabs excluded.
- **F84 — Moons: sun occlusion + transit silhouette.** The sun was already painted behind the moons; F64a's lit-part mask had simply stopped moons occluding anything, so the sun shone through their dark side. Moons are now punched out of the sun's layer, and a near-new moon crossing the sun gains a shadowed disc + rim scaled by proximity × how unlit it is.
- **Also:** the first-session command-bar hint was lifted off `--text-faint` (contrast 3.81 → 7.98 on dark). Worth recording WHY it isn't simply the next ramp step: **the text ramp is not monotonic across theme families** — on dark, faint is the least visible of faint/dim/muted; on light it is the MOST visible — so any single ramp var trades one family for the other. A measured mix toward `--text-primary` was the only option that lifts dark without dropping light below AA.
- **F85 + the Team Login rename (Binu, Sekmeht).** Bulk Connect gained per-account **include checkboxes** (it always logged in one from every saved account) and **named sets** — a saved team like *farm*, launchable from the picker or the launcher's **▦ Sets…** dropdown. A set is a TEMPLATE: it stores names, loading one replaces the selection, and connect-time drops whoever is already on (proven against the real `planReconnect`). **Renamed to Team Login** in the same pass — "bulk" described the mechanism, "team" describes the point — display-only, with every persisted key and the `bulk-connect` action untouched. The pre-commit check caught the interesting bug: saving a set first reused the CONNECT list, which excludes already-connected accounts, so building "farm" while the farmer was logged in silently saved it without him. **Then a layout review of the picker** (Sekmeht): a flat stack of identical rows behind ~100 words of preamble became three labelled zones with a live selected-count, the Save control moved below the list it summarises, and the ~15 inline style objects became real classes — the lesson is **polish standard #11** (teach at the point of use; reading order must match doing order).
- **B251 — the ⋯ menu on a character card did nothing inside the add-character modal.** Not a handler bug: `ContextMenu` is portaled to `document.body`, so at `z-index: 500` it painted UNDER every modal (add-character is 1000). It opened correctly every time, behind the scrim. Raised to 2100; the other two portaled popovers were deliberately left at 500 because nothing can cover them. New **pitfall #118**.
- **README rewritten** (Sekmeht). 159 lines → 77, longest bullet 1,500+ words → 53. The front door now answers three questions — what is it, why is it different, what does it bring me — and points at the releases page rather than build instructions. Fixed three stale facts while there: it still said "Windows only", still said Discord was "coming soon", and its credits table disagreed with `credits.ts`. **CLAUDE.md's documentation table now specifies README's role**, so the growth that produced those thousand-word bullets has a rule against it.
- **DESIGN §46 — prioritised backlog.** A holistic pass at v0.18.3: what to build next, sorted by effort against enjoyability, with new ideas numbered F86-F94 and a "deliberately held" list (image generation; anything resembling a script runtime). The finding that shapes it: the client is functionally mature, and what is thin is the FIRST TEN MINUTES (all three of Zithri's walls were the client failing to say what it needed) and the JOY LAYER (2 of 16 planned Experience surfaces).
- **Cross-platform supportability audit (B252 + F95).** A pass over all three OSes hunting for things that make a tester's report hard to act on. **B252** — a Linux AppImage runs from a temp squashfs mount, so File → Open Installation Directory opened `/tmp/.mount_…`, a folder that ceases to exist on quit; `$APPIMAGE` carries the real path (pitfall #119, which governs anything resolved relative to the executable). **F95** — Help → About now reports platform and arch, because "v0.18.3" is not actionable when macOS is unsigned with no auto-update and Linux might be an AppImage. Several suspicions were checked and **cleared**, recorded in §41 so they are not re-audited: scrollbars are styled globally at 12px (so macOS gets CLASSIC scrollbars and the 18px offsets are right everywhere), accelerators all use `CmdOrCtrl`, meta handling is additive with macros correctly refusing Cmd, and no user-facing copy assumes Windows. Both remaining gaps — Linux keyring silence and the missing diagnostics bundle — map to backlog items **F86** and **F88** rather than patches.
- **CI:** `release-prepare` now refuses an already-published tag (the forgot-to-bump case), and `check-workflow.mjs` asserts the release pipeline's semantics on every CI push — promoting the pitfall-#112 check from a scratchpad recipe into the repo, because a check that only exists if someone remembers to rebuild it is the one that is missing when it matters.

---

**v0.18.2 — Moons grows up (real lunar phases, graded weather) · Layout Manager · right-click Close + cross-window stream drag · account archive · the macOS pass**

Two threads. Most of the release is the **Moons Experience dusted off end-to-end** plus a windowing/launcher UX sweep; the last third is our **first serious macOS pass**, driven by ohbeanz (Zithri) actually running the beta. Full root-cause notes in BUGS.md (B242–B247, F76–F81); durable lessons are new **pitfalls #113 and #114**.

- **F64a — real lunar phases, server-clock anchored.** `moonPhase()` computes each moon's phase from the DR client's own sidereal constants, timed against the SERVER clock (new `server-clock` parser event, the pitfall-#87 lane) so a skewed PC can't shift the sky. `litPath`'s sweep flags were **inverted** — a crescent rendered as a lens — proven by the degenerate cases (new must enclose zero area, full the whole disc) and now locked by 8 geometry assertions. The disc is masked to the LIT region only, with night-only earthshine, per-moon atmospheres, and brightness/glow that scale with illumination.
- **The terminator no longer tilts toward the sun** (Sekmeht). Physically the truer thing, but on a flat stylised sky it reads as the moon knocked askew, and one phase looked like different shapes at dusk and midnight. The lit limb is now fixed to the moon's own axis — waxing right, waning left, matching the pill's `PhaseDot`. **Three** things were reading the sun direction (mask, lit gradient, specular rim); they now share one `litAim`, because fixing only the mask would have drifted the bright spot onto the dark side.
- **F81 — graded weather** (see BUGS.md). Cover drives cloud count and size; the overcast deck is reserved for wording that means a closed sky; **the fog layer was removed entirely**.
- **Shooting stars made rare.** Six streaks on 8–13s cycles is a COMBINED rate of one every 1.7 seconds — a meteor shower. Now 150–210s cycles (~one per 30s), with the keyframe's visible window shrunk to 0.8% so the streak still crosses in ~1.5s: the duration governs both frequency and speed, so they must move together.
- **F76 / F77 — windowed panels get the interactions they were missing:** right-click → Close (content, not container; works while locked), Close in the stream menu, drag a stream between windows, and reorder no longer gated on the lock. **The lock now has a stated line: it freezes the CONTAINER, never the CONTENT.**
- **F78 — Layout Manager.** Rename plus a two-card mode chooser that finally says Static Panels is Legacy. Display-only rename: no persisted key changed, no migration (the Transfer category's `label` moved, its `id` deliberately did not).
- **F79 / F80 / B243 / B244 — launcher and wizard pass.** Account archive (never delete), show-password, Add-account starts blank, and the wizard footer stops mismatching and wrapping. Launcher logo and action row swapped (Sekmeht + Binu), on both the populated and first-run screens.
- **The macOS pass (B245–B247).** Three findings, and the shape of all three is the same: **the platform-specific infrastructure was fine; the DEFAULTS and LIFECYCLE assumed Windows.** (1) The app could not be quit at all — `preventDefault()` in the close handler cancels an in-progress `app.quit()`, and only the non-darwin `window-all-closed` branch was re-issuing it. (2) "Connection doesn't work / keeps getting me to add an acct" was **never Lich** — connecting without a saved password opens the wizard, unexplained. (3) Lich Setup showed no path validity until Auto Detect was clicked, so the one screen that could have diagnosed him stayed silent. Also added: a **pre-flight check** so a Lich launch with unset paths says *"No Ruby interpreter is configured — open Lich Setup"* instead of `spawn ENOENT`. **Verified while reading: the Lich launch path itself is genuinely cross-platform** (`resolveRubyw` passes a non-`.exe` path through verbatim, `expandHome` handles `~`, no Windows-only spawn flags) — Lich can run on macOS; it just needs Ruby 4 configured.
- **Two corrections mid-build, both recorded because the reasoning matters.** Right-click Close was first gated on `!locked` — backwards, since locking hides the header and the ✕, making right-click the only affordance left. And new characters were briefly defaulted to DIRECT when Lich wasn't detected; Sekmeht caught that **DIRECT bypasses Lich entirely**, so it would have silently downgraded any Lich player whose install sits somewhere non-default. Reverted — the fix is a legible failure, not a silent mode switch.

---

**v0.18.1 — First-week fixes on released v0.18.0: Windowed Panels lose their dead space · SimuCoin setup moves to Settings · Lich Dashboard editor fixes (IN PROGRESS)**

Four tester reports off the v0.18.0 release, all resolved. Full root-cause notes in BUGS.md (F74, F75, B235–B237); the durable lessons are new **pitfalls #109 and #110**.

- **F74 + the overlay-header rework — Windowed Panels wasted ~12px at every seam (TheTargonian).** Comparing a windowed character against a panels-mode one: *"there's gotta be a way, when 'lock windows' is enabled, to remove all of the extra space between the panels — there are 6 of those extra buffers on my setup, which is close to half a window."* Measured: a 9px header + its hairline + two 1px window borders per seam, against ~1px docked. Sekmeht's call — locking returns the windows to panel-style borders — so `locked` now renders no header at all, drops the lift-shadow (a soft shadow between flush-tiled windows reads as a seam) and takes `--border-subtle`. **The first cut was only half right, and Sekmeht caught it:** *"now there appears to be small gaps because they are locked where the snapping occurred… when the border/moving bar is removed, that gap persists… so maybe the grabbing/mover needs to happen inside of the window vs. being a part of the window."* Exactly so — snapping aligns OUTER edges, so a header that RESERVED height left content ~10px apart while the windows met flush, and hiding it on lock merely relocated that space (a fixed-height chrome window re-centred its bar and the gap survived). **The header is now an absolute OVERLAY on the content**, quiet at 55% opacity until hover/focus, with z-order body → header (1) → resize handles (2) → title buttons (3) so the top and corner grips stay grabbable through it; `buildWindowsFromCurrentLayout`'s `TITLE_PX = 16` became `BORDER_PX = 2`. Net: the header reserves nothing, what you arrange unlocked is what you get locked, and lock/unlock is a pure visibility change that never touches a stored rect — **pitfall #74 satisfied outright rather than worked around**. Pre-v0.18.1 chrome windows still carry the old title allowance and load a touch tall; one drag fixes them, deliberately not auto-migrated (pitfall #93).
- **B235 + F75 — the SimuCoin popover grew past the screen and shoved the whole app off-view (JadedSoul, 7 accounts).** *"I can't scroll down in the box to get the account I really want… then the whole frontend shifts, and I have to click somewhere on the frontend to get it back to normal."* The popover had no ceiling and no scroller, and repeated a full 6-line consent disclosure per account. The severe half is the general lesson: **`html, body, #root` are `overflow: hidden`, and that is still PROGRAMMATICALLY scrollable** — the browser scrolling a clicked row into view scrolled the ROOT and slid the entire UI away with no scrollbar to return (**pitfall #109**). Bounded with `max-height: 70vh` + `overflow-y: auto` + `overscroll-behavior: contain`, then reshaped so length can't depend on the roster at all: **Settings → SimuCoins owns setup** (per-account enable / auto-claim / Check now / status, disclosure rendered once above the toggles that act on it), and the coin is a fixed-size **Collect available coins** surface with a "Set up in Settings…" link so discovery survives. Sekmeht's framing drove the second half: *"I'm just concerned that there could still be a ton of listed accounts and it cause the window to be inconsistent"* — bounding is necessary but not sufficient; the size has to be independent of the data. `simucoinStateText` + `SIMUCOIN_DISCLOSURE` single-sourced (B234 lesson); new `SIMUCOIN_CHANGED_EVENT` because a `storage` event never fires in the writing window. No profile-shape change.
- **B236 — leaving Edit in the Lich Dashboard set the search highlight but never scrolled to it.** Found while chasing Sekmeht's report of a find-highlight *"about 1/2 of a line off"* after validating and saving a YAML. On a fresh mount `lineMetrics` is `{0,0}` and the parent's restore effect fires in the SAME commit; React runs child effects before parent ones, so the child's measuring effect had only SCHEDULED its update and the `useImperativeHandle` object the parent called still closed over the pre-measure zero — tripping a `lineHeight <= 0` guard and skipping the scroll **silently** (**pitfall #110**: an imperative method a parent may call right after mount must measure at CALL TIME, not read measurement state). Fixed by measuring live, plus a `ResizeObserver` re-measure as a class-wide backstop and a pinned `line-height` on `.ld-validation-bar` (pitfall #77). **The reported half-line offset itself is NOT confirmed fixed** — it could not be reproduced from the code (the overlay's origin, the pre's padding and the gutter all agree, and the banner is a sibling outside the overlay's positioning context), so BUGS.md records the exact DevTools measurement to take if it recurs rather than a guessed fix.
- **B237 — the Scripts tab's find box said "Search YAML…" on Ruby files** (Sekmeht). Shared component, hardcoded placeholder; now a prop.
- **B240 — the Genie map ignored the theme until a zone rendered.** On a light theme the chrome was correct while the canvas sat dark brown ("90 zones loaded · waiting for game data"), snapping right the instant a zone painted. `.map-overlay` carried a baked `rgba(10,8,4,0.75)`; the SVG beneath already used `var(--map-bg)`, which is exactly why it self-corrected on paint — **that "wrong until content renders" signature points at the scrim, not the content**. One rule served four states (Genie loading + waiting, the Lich map-image loader, MapPanel's loader), all dark-only. Now a `color-mix` veil off `--map-bg`; the waiting placeholder also moved to the shared `.map-empty-*` classes, and the legend's path swatch was corrected to the `#FFD060` the map actually strokes (that one stays literal — a depicted cue, Principle #4's exception). Adjacent offenders fixed on the same recipe. **~23 literals remain in map-panel.css** (error overlay, detail panel, more chips) — recorded in BUGS as an explicit follow-up; they will read wrong on light themes until converted. New pitfall **#75(c)**.
- **B241 — after "Fit bars to content", changing a window's WIDTH snapped its HEIGHT larger.** Two defects in `beginResize`: the min-size clamp ran on BOTH axes on every resize (an east drag never touches height, so height arrived unchanged, tested against the floor, and was raised), and the floor was absolute so a legitimately-smaller window could never keep its size. Clamp is now per-dragged-axis, and the floor is `min(perKindMinimum, currentSize)`. Snapping was NOT involved — it only acts on the dragged axis and runs before the clamp. This is the risk flagged when `fitChromeWindows` was written and deliberately left unclamped: a compact vitals bar is genuinely under the 24px floor, so clamping the FIT would have preserved the slack the feature exists to remove.
- **B239 + the bug-check cleanup batch.** The v0.18.1 bug check found a real, unreported v0.18.0 regression: **the Lich Dashboard's Scripts Edit button was permanently disabled** — that release's own sweep added the `readOk` gate (pitfall #100) to both tabs' Edit buttons but wired only the Profiles loader to set it, so `readOk` never left `false` and the tooltip said "Can't edit — this file couldn't be read" about files that read fine. Found by `tsc --noEmit --noUnusedLocals` flagging `setReadOk` as never read — *a state setter reported unused means whatever it gates is stuck at its initial value.* **`noUnusedLocals` is now ON permanently** (7 pre-existing dead imports removed first, so it starts clean); `noUnusedParameters` stays off, its 4 findings being unused props that would mean changing call sites. Two further self-inflicted issues from this release were caught in the same pass and fixed: the Settings nav rail offered a **dead "SimuCoins" jump** when that section doesn't render (every section used to be unconditional, so mapping SECTION_NAMES straight through had always been safe), and `setSc` scheduled its persist **inside a setState updater** — StrictMode double-invokes those, so it double-dispatched the change event; converted to the effect-driven shape `aiCfg` already used, with an identity guard so it can't fire on mount. Also closed a latent cross-window hole: Settings now adopts external SimuCoin config changes, so two open panels can't silently revert each other's consent. Remaining polish: multi-account **Collect available coins** now reports in ONE toast instead of stacking one per account, and the Panel Manager gained **"Fit bars to content"**.
- **B238 — macOS wouldn't open the app at all: *"Lichborne is damaged and can't be opened. You should move it to the Trash."*** (ohbeanz, our first Mac tester — M5, macOS 26.5). **Our documented expectation was simply wrong:** every doc promised the friendly "unidentified developer → Open Anyway" prompt, but that message is how macOS words a MISSING signature — no Open Anyway button, and it tells the user to bin a good download. Apple Silicon refuses an unsigned arm64 binary outright, and `CSC_IDENTITY_AUTO_DISCOVERY=false` (correct — we have no certificate) made electron-builder skip signing entirely, despite a workflow comment claiming it "ad-hoc signs automatically". New [build/afterPack.cjs](build/afterPack.cjs) ad-hoc signs the app before the dmg/zip are built and **fails the build** if that errors — an unsigned arm64 artifact uploads cleanly, passes the verify job's filename check, and only dies in a tester's hands, which is worse than no artifact. Every doc that promised "Open Anyway" now leads with `xattr -cr /Applications/Lichborne.app` and explains that "damaged" means "not notarized". **Whether ad-hoc signing alone reaches the recoverable Open Anyway prompt is UNVERIFIED** — no Mac here, and CI can build but can't exercise Gatekeeper — so `xattr` is the primary instruction and ohbeanz confirms on the next build. **Credits:** ohbeanz added to `CONTRIBUTORS` (a logged report on day one). While in there, the About name pills were optically re-centred — `line-height: 1` spans the font's full ascent+descent, so capitalised names with no descender sat high with a gap beneath; ~0.08rem moved from bottom to top padding, total unchanged so pill height is identical.

---

**v0.18.0 — Cross-platform: Windows + Linux (beta) + macOS (beta, unsigned) · GitHub Actions release pipeline · SimuCoin claim (IN PROGRESS — code landed, tester end-to-ends pending)**

- **Product stance change (Sekmeht):** 0.18.0 is the version that supports Windows, Linux, and macOS. Windows x64 stays the stable platform; **Linux x64 AppImage and macOS arm64 ship as labeled BETAS**. The Mac build is deliberately **UNSIGNED** — free-project decision, no Apple Developer account ($99/yr deferred until Mac demand shows): Mac users do a one-time System Settings → Privacy & Security → "Open Anyway", and **auto-update is OFF on Mac** (Squirrel.Mac requires a signed app; the updater is gated off on darwin — startup check skipped, menu check answers with a download-from-GitHub notice). Linux is fully first-class: no signing exists there, auto-update works via `latest-linux.yml`.
- **GitHub Actions release pipeline** ([.github/workflows/release.yml](.github/workflows/release.yml)) — manual-only (Actions → Release → Run workflow; plain commits never build): `prepare` (validates release-notes.md + pre-creates the ONE draft — the publish.mjs duplicate-draft guard, now protecting three parallel OS jobs) → `build` matrix (windows-latest NSIS / ubuntu-latest AppImage / macos-latest dmg+zip arm64, `CSC_IDENTITY_AUTO_DISCOVERY=false`) → `verify` (asserts all seven artifacts landed in one draft + refreshes notes). Draft/Publish/tag semantics identical to publish.mjs; **publish.mjs untouched as the local Windows fallback**. Companion [ci.yml](.github/workflows/ci.yml) runs Check zero (builds + tsc) on every push/PR to main. Built-in GITHUB_TOKEN — no secrets to configure.
- **Per-platform Lich discovery** (`discover-lich-paths` rework, [main.ts](src/main/main.ts)): Windows probe unchanged (C:\Ruby4Lich5); Linux/Mac probe `~/Lich5` / `~/lich5` / `~/lich-5` (+ `~/Desktop/Lich5` on Mac — the wiki's install spot) for Lich, and rbenv shim → rbenv versions newest-first → Homebrew → system for Ruby — **explicit paths only, never bare `ruby` from PATH** (GUI apps launched from Finder/dock lack the shell PATH that resolves rbenv shims). New `probeDesktop` opt (only the setup dialog's Auto Detect passes true — probing ~/Desktop fires the macOS privacy prompt, which must never appear from App.tsx's silent startup discovery). Plus a best-effort **`ruby -v` probe → setup-dialog warning below 4.0** (Lich 5.18+ hard-requires Ruby 4.0; Fedora's system Ruby is 3.x — the predictable trap).
- **`~`-relative Lich paths + `expandHome`** ([homePath.ts](src/main/homePath.ts)): Linux/Mac defaults are `~/Lich5/lich.rbw` etc. (renderer can't know the home dir synchronously); MAIN expands at every consumption point — LichConnection.launch, sqliteReader's lich.db3 derivation, lichDirFrom (maps/scripts/profiles), discovery validation. **Rule: any new lichPath/rubyPath consumer in main must expandHome.**
- **Platform plumbing:** preload exposes `window.api.platform` + `secureStorageAvailable()`; `IS_MAC`/`IS_WINDOWS` + per-platform `DEFAULT_RUBY`/`DEFAULT_LICH` in [lichSettings.ts](src/renderer/lichSettings.ts) (single-sourced into profile.ts's shared-profile defaults); LichSetupFields copy is platform-aware (no C:\ strings on Linux/Mac; extension-free Ruby browse filter off-Windows; the discovery status banner now renders on every platform — it was Windows-keyed).
- **macOS conventions:** Cmd chord support ADDITIVE (Ctrl variants unchanged everywhere) — Cmd+Shift+Enter QuickSend, Cmd+1..9 / Cmd(Ctrl)+Tab tab switch (App.tsx `primaryMod`), Cmd+F scrollback search (GameWindow, exactly-one-of ctrl/meta); proper `appMenu` role first in the menu template on darwin; **`formatKeyCombo` bails on metaKey** — meta/Cmd chords are never macro-bindable (pre-fix, Cmd+C formatted as bare `C` and a macro bound to `C` would swallow the OS copy chord; no stored combo can contain Meta, so nothing legitimate lost — tmp-cmd-harness 35/35).
- **Linux keyring notice:** AddCharacterWizard checks `secureStorageAvailable` — when Linux has no secret service (GNOME Keyring/KWallet), "Remember password" disables with a plain explanation instead of silently not saving (safeStorage no-ops).
- **Font stacks:** Menlo (macOS) / DejaVu + Liberation (Linux) appended to the monospace/serif stacks AFTER the Windows names — Windows rendering byte-identical; Mac/Linux stop falling to the browser's generic pick.
- **Packaging:** `build.mac` (dmg+zip, arm64-only — add x64 if an Intel-Mac tester appears) + `build.linux` (AppImage x64) with pinned `artifactName` templates matching verify's `PLATFORM_ARTIFACTS`; `build/icon.png` (512) generated from the ico's 256 frame (hand-decoded the BMP frame — GDI+ can't extract it — and bicubic-upscaled; **a crisp ≥512 source icon is an open polish item**).
- **SimuCoin claim (F71, DESIGN §42, Sekmeht — inspired by [Thires' SimuCoins](https://github.com/Thires/SimuCoins) Genie plugin).** Claims the monthly free SimuCoins Simutronics gives subscribers (they expire unclaimed). An authenticated HTML scrape of store.play.net — sign in (anti-forgery token → credential POST) → read balance/offer off `/store/purchase/dr` (the SIGN OUT link is the authoritative signed-in check) → optionally `POST /Store/ClaimReward` (`game=DR`) → sign out + wipe cookies. **All in MAIN** ([src/main/simucoin/](src/main/simucoin/)): the renderer names an ACCOUNT and main pulls the password from safeStorage itself (the AI-adapter secret rule), cookies ride an **in-memory** partition cleared around every run, a per-account in-flight guard stops a doubled claim POST, and multi-account runs are sequential. **Once per launch, then on demand — no background polling**; claiming is **opt-in per account** (default ask). **Consent gates all network access**, per account, disclosed on the surface that enables it. Coin button in the AppBar renders **nothing** unless an account is opted in or offerable (UX standard #1); `/simucoin` · `check` · `claim` (aliases `/sc`, `/simucoins`) + `NOUN_HELP`. Failure posture is **go quiet, never guess**: every failure resolves to a status, an unconfirmed claim reports still-claimable rather than false success, and the countdown parser only honors clear day/hour counts. `SharedProfile.simucoin` is a new OPTIONAL field (no migration; not a Transfer category — machine-local + credential-gated). **Not verified against a live store account — first real run is a tester step.**
- **SimuCoin follow-ups from the first live run (Sekmeht).** **(a) B229 — "authentication failure" on the SECOND account** (claim on A, then B fails; manual retry works). Leading cause: an Electron partition's **HTTP cache is storage that `clearStorageData({storages:['cookies']})` does NOT clear**, and the partition lacked `{cache:false}` — so account B's GET of the sign-in page could come from cache, posting a **stale `__RequestVerificationToken` against a fresh cookie** (ASP.NET pairs the two) ⇒ rejected; the manual retry revalidated the page, and the FIRST account never failed because the cache was empty at launch. Fixed at three layers (`{cache:false}` partition, a `resetJar()` that clears cookies **and** `clearCache()` around every attempt, no-cache headers) **plus a guaranteed-safe belt: one automatic retry on `auth-failed`** against a fully reset jar — the user's own "click try again", automated — bounded to one attempt and unable to double-claim (auth-failed returns before any claim POST). Cause unconfirmed from here; the retry makes confirming it optional. **(b) A real golden coin.** The `◉` glyph became a drawn SVG coin (rim/face gradients, bevel, struck "S", static glint, sweeping specular band), with **ONE artwork and two states** — nothing to claim renders the SAME coin under grayscale+dim (so gold and dull can never drift), and a claim *brightens* it over 400ms. Claimable = full colour + breathing glow + sheen; busy = spin. **All motion drops under epilepsy-safe while the gold is kept** (colour is the signal, motion is decoration). `em`-sized (tracks the game font), def ids `useId`-namespaced (pitfall #95), baked colours as the depicted-object exception to Principle #4.
- **Lich Dashboard Scripts tab: line numbers now stay aligned (Sekmeht).** The gutter and the code share `line-height: 1.3rem` (the pitfall-#62 fix Profiles got), but the Scripts tab still drifted — because Ruby scripts are **wide**, so the content pane grows a HORIZONTAL scrollbar that the `overflow: hidden` gutter never reserved. Different viewport heights = different scroll RANGES: the content's max scrollTop is larger by the scrollbar height, so the gutter clamps early and the numbers stop tracking their lines near the bottom. YAML profiles are narrow, so they never triggered it. Fixed in the shared `useGutterSync` — the gutter's `padding-bottom` now reserves the **measured** scrollbar height (not a hardcoded 15px, so it's right on every OS/zoom; a no-op when there's no horizontal scrollbar), re-measured on scroll, on content change, and while typing. Same family as pitfall #67 (a gutter/header and the rows it labels must reserve the same scrollbar space).
- **Launcher hero logo (Sekmeht's artwork).** `lichborne_logo_green.png` bundled via `src/renderer/public/` (the about-theme.mid precedent — Vite copies it, referenced by runtime path so a missing file can't break the build). It sits on ONE ROW with "DragonRealms Client" + version, split by an accent hairline, and **replaced the old `<h1>Lichborne</h1>`** (the art carries the wordmark, so the h1 was a duplicate; its now-dead CSS rule was removed and `alt="Lichborne"` carries the name for screen readers). The PNG is a transparent 1024² canvas whose art occupies 778×638, so **all four transparent margins are cropped in CSS** — the image is scaled to 1024/778 of its wrapper and inset by three negative margins (each measured/778, since percentage margins resolve against the wrapper's width), collapsing the box to the art's true aspect without re-cutting the asset. A tinted panel around the lockup was tried and REMOVED at Sekmeht's ask (it competed with the artwork; the divider alone carries the "one component" read).
- **Favorites is now collapsible, defaulting to EXPANDED** (Sekmeht) — supersedes the documented "Favorites is always-open" invariant. Mirrors the account sections (real `<button>` + chevron + count, `aria-expanded`, grid removed from the DOM when collapsed). The localStorage key stores the **COLLAPSED** flag so an absent key reads as expanded — no existing install folds shut on upgrade; that inverted-flag shape is the pattern for any future default-ON toggle.
- **Modal chrome unification — the About Lichborne look is now the house style (Sekmeht; DESIGN §43, CLAUDE.md polish standard #10).** The deferred other half of the v0.11.2 modal work (which shipped SIZE tokens only). New `--modal-*` tokens in global.css (surface/border/radius/shadow/scrim, accent header band, control hover, and `--modal-input-bg`) so a dialog opts in by USING them rather than copying about.css's literals. **Converted:** About itself (it had claimed conversion in a comment while still hardcoding the recipe), Edit Profile, the launcher's account/Favorites panels + Add card, the whole **Automations** family (shell + Highlights/Triggers/Macros/Aliases/Mutes/Substitutes/Groups — Mutes and Substitutes came free by reusing the `hp-` prefix), and **Contacts**. Tab bars became accent chips; only top-level headers get the accent band (section labels stay muted, or the hierarchy flattens). Nine dialogs deliberately left for later — each needs its own inner-element audit, and twenty blind conversions is how four light-theme regressions ship at once.
- **`.tp-` prefix collision RESOLVED — Triggers renamed to `.trg-`** (126 CSS rules + 164 component refs, plus the automations.css hooks and the shared `.trg-list-item:hover .list-item-delete` rule in global.css, which belongs to the rule-editor family, not the Theme Picker). Triggers and the Theme Picker both declared `.tp-modal`/`.tp-header`/`.tp-title` with the SAME properties — compatible only by luck, with bundle load order deciding — so restyling Triggers would have silently restyled the Theme Picker. This is the fix pitfall #55 had recommended for years; forced by the theming pass, done now, `.tp-` is exclusively the Theme Picker's.
- **Light-theme fix while in there:** every field in the Automations family + Contacts + Edit Profile used `--bg-input`, which on Classic Light is `#ffffff` — the same as the modal surface — so they rendered as framed voids. All now use `--modal-input-bg` (nudged toward `--text-primary`, so it darkens on light themes and lightens on dark). Pre-existing, not introduced by the conversion, but exactly the "looks unfinished" class.
- **Connect flow: verbose status + one modal look (Sekmeht).** The ConnectionManager always emitted a running commentary, but **none of it reached the user**: those messages ride `connection-status` keyed by sessionId, and during LOGIN the renderer has no sessionId yet (login is an invoke that resolves at the END), so every message was dropped and you watched a bare spinner. New **`connect-progress`** channel keyed by CHARACTER, mirrored to the calling window for the login's duration and unhooked in a `finally`. Messages rewritten as plain-language stages — Lich: *contacting Simutronics login → signing in → getting the login key → starting Lich → waiting for Lich on port N*; direct: 3 steps (the direct path was missing its step 2). Past ~10s the Lich wait turns diagnostic (*"Still waiting… (14s) — check your Ruby/Lich paths or antivirus"*) instead of counting silently to 30. **Every connect-family dialog now wears the canonical modal chrome** (DESIGN §43): the connecting overlay, bulk progress (now with a per-character step + a progress rail + "2 of 5"), the Bulk Connect result (title states the OUTCOME — *"Connected 2, 1 failed"* — with ✓/✕ result rows), the account-conflict prompt, the reconnect chooser, the wizard's conflict prompt, and the launcher's delete confirm. All the inline-styled cards are gone; new `.launcher-dialog` head/body/foot classes plus primary/danger button variants replace them. **The card is FIXED width and reserves two lines for the step** — a live message whose length changes every few seconds was visibly growing and shrinking the card (Sekmeht: "very distracting").
- **QuickSend is multi-target and defaults to ALL (Sekmeht).** Was a single-select dropdown defaulting to "the next character after the active one", which made the common case (tell the whole team something) a two-step and buried broadcasting at the bottom of a list. Now a checkbox list with **"All characters" checked on open**; ticking an individual clears All and vice versa. **"All" is not a stored sentinel — an EMPTY selection IS all-mode**, so the two are mutually exclusive by construction rather than by bookkeeping. With exactly ONE character connected the picker is dropped entirely and that character is shown as the target (a lone checkbox that can't be unticked is noise). The footer states where it's going before you commit.
- **Bug check on the above (4 real defects, all fixed).** (1) **QuickSend dead state:** a picked character disconnecting left `selected` holding a dead id — not all-mode, nothing targeted, every checkbox unchecked and Send greyed with NO stated reason. Now says so explicitly; deliberately NOT pruned to empty, because that would silently promote the user to a broadcast. (2) **Stale step on retry:** `connectStep` was only cleared in the bulk loop, so re-connecting a character that had just failed flashed *"Still waiting for Lich… (29s)"* one second after the click with nothing in flight. (3) **The "waiting for another character's Lich" message was REMOVED** — it could never fire from bulk connect (the renderer awaits each login, so nothing queues) and, in the rare overlapping-window case, the concurrent SGE auth emitted its own step a moment later and overwrote it, leaving the UI on a stale step for the whole silent wait: the exact problem it was meant to solve. Comment records why, so nobody re-adds the naive version. (4) **QuickSend opened with zero usable targets** — the hotkey gated on open TABS (`sessions`, which includes disconnected ones) rather than connected characters, so a single dead tab opened a modal that could only say "No connected characters". Also caught: my own comment claiming bulk connect queues in `serializeLichLaunch`, which the code disproves.
- **Connect steps + SimuCoin reporting + a self-inflicted corruption caught (2026-07-27), DESIGN §42.6/§44.1.** **B233:** Sekmeht watched the connect overlay and found the Lich path emitting FIVE phases numbered 1, 2, 2, 3, 4 — step 2 reused for "signing in" and "getting the login key" — and the final phase labelled "Waiting for Lich" for its whole duration, so the connection to the Lich service was never announced (`connectWithRetry` retries the real connection and the first success IS the session socket, so there was no separate moment to report). Totals now live in `LICH_STEPS`/`DIRECT_STEPS` behind a `step()` helper (they were hardcoded at TEN sites, which is how the count drifted — DESIGN §44.1 itself said "4 steps" while listing five); Lich is 5 correctly-numbered steps with step 5 named "Connecting to Lich on port N", and direct went 3 → 4 so both paths share the same first three phases. **B234:** `/simucoin check` printed "Checking the SimuCoin store…" and nothing else — executors are synchronous, so the outcome only ever reached a toast. `runSimucoin` now resolves WITH the status (never re-read from state — that setState has not committed when the promise resolves) and GameWindow appends a per-account line as each run settles via a new `emitClientLines` helper, using a single extracted `simucoinRowText` shared with the bare `/simucoin` status. **And the bug check earned its keep:** the contact-name regex escaper in GameWindow had been corrupted to `"\\let lineId = 0"` where it should read `'\\- **Character tabs + source hygiene + CI pass (2026-07-27)'` — my own scripted extraction, because JS `String.replace()` expands `- **Character tabs + source hygiene + CI pass (2026-07-27)` in the REPLACEMENT string. It compiled, typechecked and built green; the only symptom would have been contacts with regex metacharacters silently never matching. Repaired against `git show HEAD`, swept for other instances (none), new **pitfall #108**.
- **Character tabs + source hygiene + CI pass (2026-07-27), DESIGN §43.x.** Sekmeht: the character tabs "don't really stand out much". Root cause was concrete — `:hover` and `--active` BOTH set `background: var(--bg-base)`, so the active tab and a hovered one were pixel-identical and the cue was `font-weight: 600` alone. Tabs now wear the house accent chip (accent 13% fill / 30% hairline, the `.at-tab--active` recipe), with hover made neutral AND inactive-only via `:not(--active):hover` — needed because `:hover` (0,2,0) outranks `--active` (0,1,0) and would replace the chip on contact (new **pitfall #107**). The character NAME stays `--text-primary` since `health-warn` is already `var(--accent)`. Tabs keep their pre-v0.18.0 rounded-top silhouette rather than the pill (Sekmeht — the chip is a treatment, not a shape). Also `rem`→`em` on the tab and its six children, each sized to render byte-identically at the default font: `.app-bar` anchors the game font and B178's thresholds are em against it, so the tabs were the one part of the bar that ignored the font setting (pitfall #45). Verified rather than eyeballed: contrast computed on all 21 themes (label ≥ 6.17:1, hairline visible everywhere, Barbarian faintest), geometry swept at font 8→24 (nothing clipped, heights and baseline aligned). **A folder-attachment look was built, measured landing correctly, and REVERTED** — the strip's 5px overflow scrollbar claims the bottom edge, so the attachment breaks exactly when the most tabs are open. **B232:** two raw NUL bytes in wrayth.ts (committed since v0.12.0) made the file invisible to ripgrep — `Grep` answered "No matches found" for text that was plainly there, an Iron-rule hazard; replaced with the `\u0000` escape at the Buffer level (pitfall #73), proven byte-surgical and behaviour-identical. **CI:** the release workflow's `verify` job had `needs: build`, which SKIPPED it whenever a matrix build failed — exactly when you want to be told what the draft is missing — now `needs: [prepare, build]` with `if: !cancelled() && needs.prepare.result == 'success'`; stale "uncomment the matrix entry" header rewritten.
- **Experiences profiled (2026-07-27) — clean, NO code change, DESIGN §45.7.** Asked whether the Living Tableau or Moons had anything worth tuning; measured against PRODUCTION React and the answer was no. Moons render 0.38ms, empty Tableau 0.05ms, **crowded** Tableau (14 players / 9 creatures / 8 bubbles) 0.15ms for both a wasted render AND a real speech update, the heaviest Moons sky (winter + heavy snow, every layer) 60fps flat with zero dropped frames — identical with `.moons-pill`'s `backdrop-filter` removed and with animations off — and the scene capturers 0.37µs/line (~0.3ms per MINUTE of busy play). The §35.6 gate, module-hoisted sub-components, deterministic particle arrays, cheap capturer gates and `memo()` are all doing their job. Three items examined and deliberately left alone (each documented with its reason): Moons reads 6 of 15 props but a custom `memo` comparator would render silently stale the day it reads a 7th; `expAnyOpen` enables scene parsing for Moons which never uses it (0.3ms/min); twinkle/ring keyframes use paint/geometry properties. **Method note now recorded twice:** `<Profiler>` is a no-op in production React and inflates in dev — time `flushSync` instead. Limits stated: measured on the dev machine (Linux/Mac betas may run weaker hardware), and the combat facet (rings/gauges/assess arena) is unmeasured.
- **Genie Map performance (2026-07-27) — B231, DESIGN §45.6.** Sekmeht reported the map feeling sluggish while dragging and during heavy movement, suspecting the sonar ping. **Measured first: the ping was EXONERATED** — a harness at real zone density (1057 nodes) panned 300 frames with ping/heartbeat on and off and held a flat 60fps with zero dropped frames in all four variants. The real cause was two React costs, both producing byte-identical output: **(a)** `nodeRects` (~1057 marker groups) listed `onNodeContextMenu` in its deps, and that callback closed over `currentLocation` — so it took a new identity on every room change and the ENTIRE node layer was re-created on every step (**8.92ms of commit per room** vs 0.34ms when the memo holds); **(b)** `arcSegs` was memoized but the `.join()` producing the path `d` strings ran inline twice per render (~0.15ms + **78KB of string garbage**) on every mousemove of a drag. Fixed with a latest-closure ref for the walk handler and a memo around the arc `<path>` ELEMENTS: room-change commit **8.92ms → 0.09ms**, arc join **→ 0**. New pitfall #106 (a callback in an expensive memo's deps must have a stable identity; memoize the value handed to React, not the intermediate). Method note: the first harness measured rAF frame INTERVALS and was useless — vsync pins them at 16.67ms until the budget blows; the React Profiler's commit time is what separated the variants. Harness: `tmp-map-perf/` (gitignored).
- **Performance audit (2026-07-27) — 3-layer sweep (renderer hot path / main process / CSS), DESIGN §45. Every finding measured, not guessed.** The headline was NOT a slowdown: **B230**, a correctness bug in the perf machinery itself — `extractRegexLiteral` treated `.` as a literal, so any highlight or trigger with an unescaped dot was gated out and **silently never fired** (`joins the .+`, CLAUDE.md's own example, was dead). Shipped since v0.13.4; six of one tester's highlights were affected. Fixed, and the agreement check that catches this class was rebuilt (`tmp-perf/check-literals.mjs`) — it now passes across **21,191 real gated rules**. Perf fixes: **session-log read handlers blocked main for ~3 SECONDS** (gunzip+split of whole day-files, synchronous) — every connected character froze together — now async with per-day yields + an immutable-day stream cache; the **trigger `log` action** blocked ~500µs of main *per matching line* — now buffered like the session log (2000 lines: ~1015ms → ~0.5ms); **mutes and substitutes were the only ungated rule engines** (substitutes ran the full list per segment AND over the joined line, ~9x the gate's cost) — both now gated; **contacts mixed tracking with render data**, so a presence write per room change invalidated every mounted text row (~30-40ms hitch per room transition for importers) — split via a render-only identity key; **connect progress re-rendered every GameWindow once a second** during a Lich wait — moved to an isolated leaf; and the **SimuCoin coin animated `filter`**, forcing a permanent repaint loop while coins were claimable. New pitfalls #104 (a pre-filter may be too loose, never too tight) and #105 (volatile tracking data must not share an identity with render data). Verified intact: single-pass line scanning, panel memoization, main's 16ms coalescing, `appendTrimmed` hysteresis, zero `setInterval` in main. Disproven: `LichConnection.flush()` is NOT O(K·N) — V8 SlicedString makes it 1.1x, not quadratic; don't "fix" it.
- **Comprehensive pre-merge bug check (2026-07-27) — 4 parallel reviews (SimuCoin / cross-platform / launcher UI+CSS / logging+AI), every finding re-verified against the code before acting. Nothing here was tester-visible (v0.18.0 is unreleased), so it's logged as version work rather than B-numbers.** Fixed, most severe first:
  - **DESTRUCTIVE (Linux/macOS): the Lich Dashboard could overwrite a user's script/profile with the string `(could not read file)`.** Paths were built in the RENDERER with hardcoded `\` separators + an unexpanded `~`, so reads failed → the editor showed the placeholder → the Edit button (ungated) let it be saved, and the WRITE handler composes its path correctly in main, so the destructive write succeeded. Fixed at three layers: forward slashes, `expandHome` on the `read-file` handler (the one main-side consumer the v0.18.0 sweep missed), and a `readOk` flag gating both Edit buttons. New pitfall #100.
  - **SimuCoin: wrong-account claim.** The in-flight guard was per-ACCOUNT but every run shares ONE cookie jar that each run clears on entry and on exit — so two different accounts overlapping (one click away, since the popover disables per-account) let A read/claim **B's** balance under A's name and left B reporting a bogus "sign-in rejected". Now globally serialized via a module-level promise chain (the `serializeLichLaunch()` shape). New pitfall #101.
  - **SimuCoin: the startup pass ran in EVERY window.** A window opened later (decouple an hour in) fired a whole fresh store pass — re-signing in for every consented account and re-claiming for auto-claim ones — plus duplicate toasts and divergent per-window state. Now gated on `isPrimary` (the F62 pattern); secondary windows seed from `simucoin:cached`, which was built for exactly this and had never been wired up. Also latched to once-per-launch so the new refresh-on-`launcherRefreshKey` re-enumerates accounts WITHOUT re-checking.
  - **SimuCoin: consent was never re-checked at the choke point.** The popover reads config once at mount, so revoking consent in one window left another window's button live → a store sign-in for a de-consented account. `App.runSimucoin` now re-reads consent fresh, plus a `storage` listener syncs the popover cross-window.
  - **AI key silently discarded on Linux without a keyring** — `setAIKey` no-ops when `safeStorage` is unavailable, but Settings optimistically showed "✓ Key saved"; every later AI call then failed with no explanation. Now re-queries `aiKeyStatus()` and reports honestly (also fixes the Windows-only "DPAPI" wording).
  - **Windows regression caught: `ruby -v` was spawned on EVERY launch** (the version probe ran on the silent startup discovery, whose result nothing reads) — wasted startup time, delayed `sharedReady`, and an unexplained `ruby.exe` execution is AV-heuristic bait. Now gated behind an explicit `interactive` flag (Auto Detect only), `windowsHide: true`.
  - **Linux: auto-discovery could never find rbenv Ruby 4.x** — the default `/usr/bin/ruby` almost always exists, so `rubyAlreadyValid` short-circuited the entire candidate scan. Non-Windows default is now empty, so the priority list (rbenv shim → versions → Homebrew → system) actually runs.
  - **`sharedReady` was never set when discovery returned null**, silently disabling the whole SimuCoin startup pass with no error.
  - **CSS/light-theme:** the coin's count badge was a bare `#d9a520` (~1.9:1 on every light theme — the feature's payload, unreadable); Favorites' `gap: 0` was silently beaten by a later `.launcher-section` rule at equal specificity (8px misalignment against adjacent account panels); **Edit Profile's inputs went white-on-white on Classic Light** — my own conversion tripping the pitfall-#55 warning I'd written in the same changeset; compact mode drew an identical panel-inside-panel double border; the logo's horizontal canvas padding was never cropped (divider ~36px from the art instead of ~14px); the popover's consent disclosure was the smallest text in the app bar.
  - **Doc accuracy:** `about.css` is now actually converted to the shared modal tokens (the token block claimed it was), and the `var()`-of-`var()` resolution note was corrected.
  - Also: `playWavFile` built a malformed `file:////` URL on POSIX and never URI-encoded (a `#` in a filename silently killed the sound on every OS); the export save dialog now appends `.txt` itself (GTK doesn't); the Ruby-version warning no longer asserts a Lich-5.18 failure it can't verify.
- **Not yet done (the 0.18.0 gates):** Linux tester + Mac tester end-to-end runs (test plan has the checklists + name slots); first live 3-OS workflow run (dress-rehearsal draft, never published); a real-account SimuCoin claim; README/User Guide platform docs + Discord "why unsigned" announcement (drafted in the docs pass).
- **tsc stays clean (0 errors); both builds green; tmp-cmd-harness 35/35.**

*(Test plan: testplans/test-plan-v0.18.0.md)*

---

**v0.17.3 — Prompt `>` dedup rework + inline command echo · resizable/persisted dividers · Lich Dashboard overhaul · text effects · UI facelift · backdrop-close fix**

- **Prompt `>` deduplication reworked (Sekmeht — "multiple >'s from time to time; the 1st should show, any right after muted").** The old parser dedup keyed on `lastMainText` (last MAIN-stream text), so a move/look/combat flurry whose output goes to SUB-streams (room title/exits/players, combat state) left the pre- and post-activity `>` comparing equal → the post-activity `>` was suppressed (the "no > after a room description" gap), while other turns leaked double `>`. Now the parser routes EVERY event through one `emit()` chokepoint that tracks `lastEmitWasPrompt`; the prompt handler emits unless the *immediately-preceding emitted event* was that same prompt text (`lastEmitWasPrompt && prompt === lastPromptText`) — truly back-to-back identical prompts are suppressed at the source, everything else is emitted and the DISPLAY-layer collapse (pitfall #88, in GameWindow) drops any `>` run with no MAIN text between it and the previous prompt. Sub-stream/room activity is deliberately NOT a visible break (it never lands in the main scroll), so a room render or combat flurry that fires several `<prompt>`s still shows exactly one `>`. The B194 mute case still collapses (muted MAIN content leaves consecutive display prompts). Two comment blocks merged; the stale `lastMainText` reference removed.
- **The `assess` stream is now discoverable (Illiahanna — "No assess stream").** DR emits `<pushStream id="assess"/>` for the ASSESS combat block — a real, viewable stream — but it had been added to `NEVER_DISCOVER` back when the combat Tableau shipped (v0.16.1, which consumes it), so it never appeared in Available Streams and couldn't be opened as its own panel. Removed it from the hide-list: the Tableau's `assessAccumRef` accumulation is INDEPENDENT of discovery/watching, and `STREAM_FALLBACK['assess']='main'` still shows the text in main when no Assess panel is open — so making it discoverable is purely additive (add an Assess panel → text routes there; no panel → falls back to main; the Tableau arena works either way). `assess` was the only real stream wrongly hidden — every other `NEVER_DISCOVER` entry is internal (`main`/`raw`/room sub-streams) or an alias to a built-in panel the user can already add (thoughts/deaths/arrivals/conversation/spells/inv/exp).
- **Inline command echo — `s>stand`, not `s>` then `>stand` (Sekmeht; matches Wrayth/Genie/Frostbite).** New module-level `appendEcho(prev, cmd)` merges a typed command into a trailing bare prompt (reusing the prompt's own `>`, clearing its prompt flag so the collapse can't mistake it for a duplicate; reuses the line id so it updates in place, no flicker) and falls back to a standalone `>cmd` line mid-stream. All three echo sites (`sendCommandSequence`, `dispatchUserText` split, canonical `sendCommand`) route through it and null `lastMainLineRef` after (a typed command is a break — the prompt returning after a no-output command still shows, guarding the stale ref the merge leaves). Display-only — the Session Log still records the canonical `>cmd`.
- **Resizable, PROFILE-PERSISTED dividers (Lich Dashboard + all six Automations panels).** `useResizableColumn` (Dashboard Scripts/Profiles splits) and `ResizeDivider` (Automations sidebar) now key on per-character `scopedKey`s (`ldScriptsSplit`, `ldProfilesSplit`, `automationsSidebarWidth`) instead of app-wide plain-localStorage keys — so a resized width rides the `state:`→YAML pipeline into the character profile (remembered instantly via localStorage, backed up + portable via YAML on the next save/logout). All six Automations panels share one suffix, so the sidebar stays consistent within a character. New optional state keys — non-breaking (no profile-shape change).
- **Lich Dashboard overhaul.** New **DR Infomon** tab (catalog of `DRStats`/`DRSkill`/`DRSpells`/`DRRoom` expressions with a ▶ check that pre-fills `;e echo <expr>` — these live in in-memory Ruby `@@` vars, NOT lich.db3, so they're command-read not DB-read); **Scripts** tab rewritten as a split editor with an **args field** + Run + core-script warning; **Profile (YAMLs)** tab renamed, char-filtered by default, with a file dropdown; **Settings** tab curated (flag descriptions + noise filter); the YAML/Ruby editor converted to a syntax-highlighted overlay editor (highlight.js core + yaml + ruby).
- **Text effects (highlights + contact templates).** The single "Glow" checkbox became a **Text effects** picker — Glow, Shimmer, Rainbow, Pulse, Gold (metallic glint), Gradient, Fire, Frost, and more — resolved via `resolveEffect`/`effectContent` ([highlightEffects.tsx](src/renderer/utils/highlightEffects.tsx)) into `hl-fx-*` CSS. `HighlightStyle.effect` + `ContactTemplate.effect` (legacy `glow:true` folds to `'glow'` via `effectiveEffect`). Contact templates gained effects + a modernized card UI. Animations freeze only under the app's own `epilepsy-safe` setting — the earlier `@media (prefers-reduced-motion)` block was removed (it froze effects for OS-level reduce-motion users, inconsistent with the Tableau/Moons/map, which gate on epilepsy-safe only).
- **UI facelift (no screen-estate cost).** The Settings look-and-feel (shared primitives, input focus glow, section cards) extended across the client's clickable surfaces; game/stream window titles + borders kept dimensionally identical. Panel Manager layout/alignment fixed (the "Lock panels" border spanning the whole width — modal capped to `min(900px, 94vw)`, banner inset to align with rows).
- **Backdrop-close drag bug fixed across 24 modals.** Dragging a text selection out of a modal (mousedown inside, mouseup on the backdrop) fired a `click` with `target === backdrop` and closed the modal, losing work. New `backdropHandlers(onClose)` ([backdropClose.ts](src/renderer/utils/backdropClose.ts)) closes only when the mousedown ALSO started on the backdrop — a real click on empty area, never a drag that ended there. Applied to every modal backdrop.
- **Experiences shelf decluttered.** Removed the kind badge + visible "text equivalent" line (now a hover tooltip); Beta shown as a clean pill; jargon stripped from the Living Tableau / Moons descriptions.
- **Bug caught in the pre-merge sweep:** a `sed` mass-rename (`this.events.push(` → `this.emit(`) rewrote `this.events.push(...sceneLineEvents)` into `this.emit(...sceneLineEvents)` — but `emit()` takes ONE event, so a spread silently emitted only the first scene event and dropped the rest. Fixed to a `for…of` loop. (Build + tsc both passed it — the Iron-rule "re-read the body after an edit" lesson.)
- **tsc stays clean (0 errors).**

*(Test plan: testplans/test-plan-v0.17.3.md)*

---

**v0.17.2 — Catch Me Up "Response voice" persona + Fable 5 model + steadier summaries**

- **Response voice (persona) — a free-text voice for AI output (Sekmeht).** A new `AIConfig.persona` field (blank = default) drives a Settings → AI text box: type "a 90s TV news anchor", "a salty pirate", etc. and Catch Me Up delivers the recap in that voice. `catchupSystem` gains a `persona` param that OVERRIDES the default warm-companion voice line when set, explicitly subordinated to the facts ("changes only HOW you speak, never WHAT is true — keep every statement grounded in the log"); the plain-prose formatting rule still binds, so a silly persona can't break the output. Rides `SharedProfile.ai` into `_shared.yaml` like the rest of the AI config (machine-local, non-breaking: old files default to blank; `loadAIConfig` coerces to a string). Applied on BOTH the log and screen paths (read fresh per run) and shown in the recap header (`· voice: …`, only when set — mirrors the model tag). UI capped at 120 chars.
- **Fable 5 model.** Added `claude-fable-5` (label "Fable 5 — premium") to `AI_TEXT_MODELS` — the single source that drives the Settings dropdown, `modelLabel`, the `/ai` status line, and the Catch Me Up header. No allowlist in main (the id passes straight to the API), so it's a one-line addition. Listed last as the top/premium tier (Sekmeht's call).
- **Catch Me Up shows the model (+ voice) + auto-retries an empty response; header made concise.** The recap header was decluttered (Sekmeht): it now leads with the window via **`fmtWindow`** — start–end **clock times** under a day (`14:05–16:05 (2h)`), **dates** for multi-day spans (`Jul 16–Jul 23 (7d)`; `fmtDuration` day-aware so a year is `365d`, not `8760h`; +2-digit year when the span crosses years) — plus **compact counts** (`fmtCount`: 58405→`58.4k`), replaces the long coverage sentences with short tokens (`log from HH:MM` / `recent portion` / `use sparingly`), and ends with `· via {model}` (and `· voice: {persona}` when set) on both paths, read fresh — so a tester report says which window, model, and voice ran, without a wall of digits. And the empty-completion case — a stream that ends cleanly with NO text (a transient dropped/empty response; diagnosed from a tester hitting "24h failed but 1d worked", which are the SAME 1440-minute window → transient, not a code path) — now **retries once automatically** before giving up; if it's still empty it reports input/output token counts and says it's usually temporary, instead of the old cryptic "(no summary returned)". Safe against `/ai stop` (abort tears down the listeners, so `onDone` can't fire post-cancel).
- **Catch Me Up excludes its OWN output.** `collectHistory` now skips any line carrying an `ai`-preset segment, so a recap routed to the MAIN window (when no lbAI panel is open) can't be gathered back and re-summarized. Previously this was only prevented by the coincidence that the recap's header segment is `internal-system`; the new guard is format-independent (the lbAI STREAM was already skipped). The log path was already safe (AI output is never written to the session log, and `DIGEST_SKIP_STREAMS` lowercases + skips `lbai`).
- **tsc stays clean (0 errors).**

*(Test plan: testplans/test-plan-v0.17.2.md)*

---

**v0.17.1 — Log-backed Catch Me Up + spurious scroll un-pin fixed (B223) + Injuries scars (B224)**

**Catch Me Up now reads the session LOG, not just the screen (Sekmeht — reverses the v0.16.x screen-only decision).** A tester did a 2.5-hour `/ai catchup` and got only recent items, because the screen buffer is bounded by `MAX_LINES`. Now `/ai catchup 2.5h` reads THAT character's log for the window. The v0.16.x log attempt was reverted for scale (a busy character logs ~80k lines/day; a year is ~29M); this build solves scale differently:
- **Whole pipeline in MAIN** (`buildCatchupDigest`) — read → dedup → extract → return a compact digest, never raw rows over IPC. Walks day by day, **yielding between days** so a long window can't freeze the app, and pushes **"Working on it…" progress for every phase** (reading day N/M → deduping → extracting → summarizing), as Sekmeht asked.
- **Duration units** — `parseDuration` gained `m`/`h`/`d`/`mo`/`y` (+ `1h30m`); `2mo`=2 months, `1y`=1 year. Windows run 30m → **1 year** (the executor's leftover **24h cap** was also raised to 1y — it had been silently rejecting `7d` before the pipeline ever ran; a reminder to trace the whole command path when widening a range).
- **Six time-scoped tiers** (recent → session → extended → day → period → historical) — each with its own prompt guidance (narrative at 30m, retrospective at 1y) and content budget (45k→240k chars).
- **Analyses EVERYTHING, not a sample** — the full DEDUPED log body is the content; exact whole-window tallies are the anchors. Dedup is what makes "everything" affordable.
- **Extractors, each verified against a real log line Sekmeht supplied** — ranks, combat damage (creature/part/level), deaths, directed speech, work orders + pay, and banking with **Lich's verified coin ratios** (from `drbanking.rb`) → real net money flow. Three rules learned: tally BEFORE dedup (identical lines are separate real events); never invent DR math (mine Lich's `drinfomon`); and `DRExpMonitor: Skill(+N)` is the mindstate ticker, **not ranks** (nearly shipped as ranks — caught by Sekmeht).
- **Per-character**, with a **screen-buffer fallback** when logging is off or a read fails (stated in the header), and honest coverage reporting. *Not yet run against a live game; game-native banking patterns + an injury extractor + a full `drinfomon` pattern port are the next pass.*



**Injuries panel — scars were being rendered as wounds that never healed (B224, Sekmeht via tester).** Her `HEAL` reported *"full strength (100%)"* and *"no significant injuries"* while the panel still listed Chest Moderate, Back Light, both Hands Light, Left Leg Moderate — "persistent since she died". It presented as a refresh/staleness bug; it was a **protocol misreading**. DR puts the kind AND rank in the `<image name>`: `Injury<n>` = active wound, **`Scar<n>` = that wound HEALED and left a scar**, `Nsys<n>` = nerve damage (verified against Lich's `xmlparser.rb`, the authority). The panel treated any name `!== the part id` as a wound and scraped its trailing digit for severity, so `Scar2` became a permanent "Moderate" wound — every row she saw was a **scar**, which is exactly why HEAL disagreed and why they survived her death. **Fix:** `parseInjury()` mirrors Lich verbatim; scars still show (real information) but **muted and neutral, labelled "…scar"**, and "No active wounds." is accurate whenever no wound is present. Healthy is now derived from the **absence** of Injury/Scar/Nsys rather than `name === id`, so an unhurt part clears whichever sentinel DR uses. **The DESIGN protocol table was the root of it** — it documented the name as part-id-plus-digit and never mentioned scars, so the code faithfully implemented a wrong spec; corrected, plus new pitfall #97. Two related gaps (the parser can't emit a clear for an EMPTY injuries dialog; the renderer REPLACES where Lich MERGES per-part) were found and **deliberately left alone pending a raw-XML capture** — guessing either way could wipe live wounds.

---



A long-standing, intermittent bug finally traced (Sekmeht, reported across many versions): the main story window would spontaneously **un-pin** — scrolling locks, the "New Lines" badge appears — with no user interaction, and would then never recover. The decisive clue was Sekmeht's observation that the **scrollbar thumb "quivers — tries to move then snaps back down"**: that's two writers fighting over `scrollTop`.

- **Root cause (traced through react-virtuoso's source).** `appendTrimmed` cuts 400 lines in ONE slice (buffer 2400 → 2000, recurring every ~400 lines once full). That collapse makes Virtuoso read `scrollDirection === 'up'` — precisely the gate for its **upward-scroll compensation** — while its index-keyed size tree is stale by 400 rows (we deliberately don't use `firstItemIndex`, pitfall #81). Its rAF-batched re-measures then fire `scrollBy(-k)` that **nothing suppresses**; `stickToBottom`'s settle loop slams the bottom back each frame (**the quiver**). Any compensation landing after that loop exits (2 stable frames) + the 250ms suppress tail hit `handleVirtuosoScroll`, which **cannot tell a library scroll from a user one**, and un-pinned.
- **Fix (A) — persistence confirmation.** The `dist > 40` un-pin branch no longer fires on a single scroll event; it requires the distance to **still hold 2 frames later**. A compensation is undone within a frame or two (cancelled); a real user scroll persists (commits, ~32ms later). Safe by construction — wheel-up and PageUp/Home un-pin directly and never reach this branch, so only scrollbar drag/arrow/track and touch are affected, and only by 2 frames. Deliberately **source-agnostic**: it holds whether the mover is Virtuoso, the trim clamp, or a stalled-rAF window.
- **Fix (C) — refocus self-heal.** `onRefocus` was gated on `pinnedRef.current`, so a spurious un-pin could **never** recover (why the badge was still there when you came back). It now re-pins when the un-pin timestamp is **after** the blur — i.e. it happened while the user was away and so cannot have been theirs. Uses a timestamp comparison rather than "did we see user input?" on purpose: detecting a scrollbar-drag `pointerdown` isn't reliable, and guessing wrong would yank a reader who HAD scrolled up.
- **Deliberately NOT done (recorded, not forgotten):** the root trigger is untouched — Virtuoso still fights us after each trim, so the **quiver remains visible**; killing it means changing the trim/compensation interaction (riskier, only worth it if the jitter itself bothers a tester). A user-intent gate was designed and **held** because it rests on the unverified assumption that Chromium dispatches `pointerdown` for scrollbar hits — if wrong it would silently kill the very path the branch exists for.
- **Two findings surfaced en route** (both recorded in CLAUDE.md): `backgroundThrottling: false` **also affects the Page Visibility API** per Electron's own typings, so the `document.hidden` guard added by B191 is likely **inert** — which is why fix (A) was made not to depend on it; and `overflow-anchor: none` (documented on `.text-window` by B20) is **gone from the source** — Virtuoso stamps it per-item so anchoring is still neutralized, but the app-level guarantee no longer exists.

*Confirmation is a NEGATIVE result (the badge not appearing), so this ships unconfirmed by design — a few long sessions without a spontaneous badge is the proof.*

---

**Also in v0.17.1:**

- **AI privacy guardrail — PII/credentials are scrubbed before anything reaches the model (Sekmeht).** A new shared `redactForAI` ([src/shared/redact.ts](src/shared/redact.ts)) removes the Simutronics **PIN block** (Character Index / Player Identification Number / `PIN#`), labelled **passwords/account numbers**, card-length digit runs, and the **logged-in account username** from the AI-bound copy — while the **session log on disk stays pristine** (Sekmeht: *"the log needs to be pristine … it's just during the AI processing part we need to avoid sensitive information"*). Applied to BOTH Catch Me Up paths (the log digest in main, the screen fallback in the renderer) so they can't drift; conservative by design (targets known credential SHAPES, never ordinary game numbers). A new **[AINOTICE.md](AINOTICE.md)** (user-facing AI processing & privacy notice) documents exactly what is and isn't sent, and is now a first-class doc (CLAUDE.md's documentation-discipline set). The **About dialog** gained a **"Lichborne's AI Notice"** link (`AI_NOTICE_URL` in credits.ts → the future GitHub location of AINOTICE.md) alongside GitHub/Discord.
- **Catch Me Up bug-check (prompt redundancy + extractor correctness).** Reviewer-found fixes: speech dedup keys on **text alone** (not stream+text) so DR's speech double-emit (pitfall #49) can't double the body AND the per-speaker "who spoke" count; **attackers are counted only on damage lines** (not on arrivals/misses); `/ai stop` **cancels mid-build** (a `buildCancelled` flag), not just mid-stream; and the redundant "directed speech" extractor was dropped. The **combat severity ladder was corrected** to the VERIFIED 22-level GM-Kodius scale (`light hit` → `apocalyptic strike`) — it **alternates `hit`/`strike`**, so the damage regex now matches BOTH; the prior "hit"-only regex had silently dropped every *strike*-level hit (good strike, heavy strike, powerful strike, …) and used a made-up `moderate`/`severe` ladder that isn't real DR.
- **`tsc` is now CLEAN (0 errors).** The 2 long-standing `HTMLElement | Window` scroller-typing errors (real un-narrowed-union holes: `el.clientHeight` / `ro.observe(el)` outside the `HTMLElement` guard) were fixed by widening the `scrollerRef` guard from `if (el)` to `if (el instanceof HTMLElement)` (our scroller is always the inner div; the `Window` case is impossible). Check-zero's baseline is now zero — any tsc error is a real regression, not baseline noise.
- **Documentation build-out (Sekmeht).** Three docs joined the "update documentation" set (CLAUDE.md discipline + memory): **[AINOTICE.md](AINOTICE.md)** (user-facing AI privacy notice, conditional — AI-processing changes), **[Knowledge.md](Knowledge.md)** (internal Lich/DR knowledge base — expanded with the Marshal object-table registration rules, Lich downstream/upstream hooks, a DR/`drinfomon` parse reference incl. verified coin ratios + injury/scar/assess encodings, and a **Lich version log** for 5.18 → 5.19.1; conditional — new verified Lich/DR facts), and **[Lichborne-User-Guide.md](Lichborne-User-Guide.md)** (a comprehensive newcomer primer: getting started, feature tour, a with-Lich-vs-without-Lich matrix, appendices; conditional — update on terminology/rename/retire-or-move, not every fix). The About dialog also gained a **"Lichborne's AI Notice"** link (`AI_NOTICE_URL`).

*(Test plan: testplans/test-plan-v0.17.1.md)*

---

**v0.17.0 — Moons weather & Elanthian calendar (Tier 1+2) + themed About dialog + Tableau combat-facet & Windowed-Panels polish**

The Moons experience gained a full time-of-day / weather / Elanthian-calendar layer (with live weather sky animations and season icons), the Help → About dialog was rebuilt as a themed in-app modal with a community credits roll, and a tester-driven visual/UX pass landed on the v0.16.1 combat facet and the Windowed-Panels window chrome (all Sekmeht, 2026-07-17/21). Also re-verified against Lich 5.19.1.

*Living Tableau combat facet:*
- **ASSESS lifecycle fixed** — the arena reconciles against the LIVE creature cast: a killed/decayed creature no longer lingers as an "engaged" threat (reconcile by name-count vs the SceneParser's dead-aware cast), and **dead creatures REMAIN as ✕ corpses** in a row above the tactical row until they decay out of the room (B213). A non-empty-accumulator guard stops a flush-boundary split flickering the arena blank (B212). The snapshot is now **room-scoped** — dropped on any room change (title or nav id) so retreating no longer drags the old room's creatures into the new one (B219). And the **blanket "combat is live" threat flare was retired** — threat/engaged styling now comes only from ASSESS (which knows who's at melee), so a harmless NPC wandering in mid-fight is no longer flagged (B220).
- **Combat gauge FADE** — the BAL/POS/RNG gauges used to persist forever ("just leave these on"); now they hold through the 8s in-combat sticky then fade out (asymmetric CSS: quick in, slow out) when combat truly ends, so the cockpit decays coherently (B214).
- **Fit-to-container rework** — figures are %-positioned but em-sized, so a small panel tab rendered them full-size and they overlapped / the gauges clipped. Now the stage font scales to the box, **width-dominant** (a wide-short tab was fitting to ~6px "way too tiny"), the **gauge panel is pinned to the stage bottom** (decoupled from the self figure so it can't clip), the **self figure holds clear of the gauges** in a short stage (measured gauge height), and the **self renders above seated figures** (B215).

*Windowed-Panels window chrome:*
- **Title bar slimmed + fixed** — `.fl-titlebar` and `.fl-grip` were mismatched (grip thicker than the shrunken titlebar → the header jumped when you showed/hid the name) and the title text was top-aligned (box too tight to centre). Matched them at a slim centred ~8px, trimmed the top resize handle to 4px so the slim bar stays draggable.
- **Declutter (step 1)** — the "T" (hide-name) button is now a **chevron**, and both controls are **hidden until window hover/focus** (quiet by default) so an idle window is just its muted name.
- **Visual polish (step 2)** — soft top-lighter gradient + hairline instead of a hard grey block, a 1px **accent focus line**, and letter-spaced semibold muted title type. All `color-mix` (theme-safe).
- **AUTO-HUG tried and REVERTED** — an attempt to auto-size chrome windows to their content persisted bad heights and clipped the vitals; fully removed (see pitfall #93). It only ever touched the tester's local layouts (never released).
- **Bug-check pass (post-batch)** — a comprehensive review (two independent reviewers + the Tableau logic traced by hand) found NO blocking bugs across the v0.17.0 batch; tsc clean. Two minor chrome hardenings applied: a `min-height: 9px` floor on both titlebar+grip so the drag band stays grabbable at the minimum game font (the 4px resize handle is fixed while the header is em-scaled), and the lone `rgba(200,60,60,.15)` close-hover literal → `color-mix`. The command-bar caret clearance was proven **font-size-robust** (em terms cancel; constant 1px chips / 2px bars at any font — pitfall #94), and compact-vitals centring + the assess/corpse/room-scope/threat logic all verified sound.

*Moons experience — Tier 1 + Tier 2 (do NOT call this "Almanac" — Simutronics' separate feature; it's the "Moons" experience):*
- **Tier 1 — time-of-day word** (DAY / NIGHT / DAWN / DUSK) on the sky, derived from the same sun elevation the gradient uses (so it can't disagree with the backdrop), centred just above the horizon (clear of where the moons/sun rise and set); follows the ⚙ "Living sky" layer. Once TIME is checked, the finer Elanthian **daypart is appended in parens** — *Night (late evening)* — so it moved off the footer date line (Sekmeht).
- **Tier 2 — weather + the Elanthian calendar.** DR exposes NEITHER passively (verified: no XML tag / DRStats field / community script — `almanac.lic` is an unrelated skill grinder), so both come from the `WEATHER` and `TIME` commands — but the single ⟳ sends them **SILENTLY** (raw send, no `>` echo; replies consumed, never shown/logged/triggered — Sekmeht: "don't want players to see the command go through"). **Weather** is also captured passively from any natural sky-glance (both "You glance up at the sky." and "You glance outside." forms; the enclosed refusal is read as "indoors" only during a ⟳ sync), shown verbatim. **Calendar** parses the TIME reply — day/month/year/season/daypart — converting day-of-year (0-indexed) → day-of-month via the new **`src/shared/elanthianTime.ts`** reference (uniform 40-day months), so it reads *4 Ka'len the Sea Drake · 457 A.V. · ❄️ winter* (the daypart lives on the sky label now, and a **season icon** prefixes the season).
- **Weather-effect sky animations** — when a weather line is captured outdoors, `detectWeather` regexes its prose into flags (snow / rain / clouds / fog / wind / storm; `gale` is wind, not storm) that drive CSS-keyframed SVG layers over the sky: drifting clouds, wind-slanted snow/rain, a horizon fog gradient, an occasional storm lightning flash — deterministic (no `Math.random`), gated on the ⚙ "Weather effects" layer + epilepsy-safe. Indoors the weather line shows a **⌂** glyph + "sky not visible — step outside". (A Rules-of-Hooks crash — `wx` as a `useMemo` after the early return changed the hook count when moon data arrived, blanking the screen after login — was fixed by making it a plain const.)
- **Suppression is per-reply-block, not a time window** — the flags clear at each reply block's last line, so a `TIME`/`WEATHER` you type yourself always shows (an interim 8s-window build wrongly ate typed commands; the sync refs also reset on a reconnect-in-place). **Layout: a centered header strip (sky · moons · weather) over the sky + a centered footer strip (the Elanthian date) below it** — both **sky-adaptive** bands: the strip background and the scene-text halo flip with day/night (frosted-light strips + dark text by day, dark strips + light text by night) so text reads on any sky, and the arc guide picks up the theme accent (`--moons-guide`). Three ⚙ toggles ("Weather", "Weather effects", "Calendar"); no slash command (§34.6); no profile-shape change (in-session state). Comprehensively bug-checked — no blocking bugs (the layout iterated a lot: footer-only → 4-row grid → 2-row footer → floating pill → these two strips).
- **`elanthianTime.ts`** is a new platform-wide Elanthian date/time reference (unit conversions, month/season/year-cycle/daypart tables, `dayOfMonth`/`monthIndex`) from Elanthipedia — for any future Earth↔Elanthia conversion.
- **Living-sky visual overhaul (F67–F70 + a whole cinematic pass).** The Moons scene became a real celestial simulation:
  - **Sun-centric sky glow** — the day's brightness *follows the sun* (a radial bloom warm-white at noon, gold at the horizon) instead of a fixed bright horizon; it **persists through twilight** (fading after sunset, pre-lightening before dawn) and is gone only by formal night.
  - **F69 sun-lit moons** — each moon lit from the sun's on-screen direction (a real terminator) tinted by its own lore colour (ruby Yavash, silver-blue Xibar, sooty Katamba), plus a **soft primary-colour glow** around each.
  - **Crepuscular rays + day/night landscape shade** — a fan from the sun's horizon point across the landscape (warm **light beams at sunrise**, **shadow rays at sunset**), and the whole ground is **lit by day and falls into shadow at night** via a DIRECTIONAL shade anchored at the sun's horizon crossing (the side where the sun rises/sets stays lit longest), lifting through dawn.
  - **Real horizon occlusion** — the bottom half is now an **opaque, season/weather-tinted ground**; the sun and moons **sink behind the horizon** and are **hidden** while set (a **fixed ~4-min sunset/sunrise** so nothing crawls the slow underground arc and gets "stuck"). The **orrery pill** (a frosted, theme-matched panel above the footer) carries every body's next rise/set while it's gone.
  - **F67** twinkling stars + a rare shooting star (now in FRONT of the moons, with the weather clouds); **F68** fireflies on summer nights (aurora was **removed** — it read as moving colour squares); **F70** winter snow on the ground/ridges.
  - **Everything is a ⚙ toggle now** (15 layers) — sun / sun-glow / rays / living-sky / moon-glow / sun-lit / at-a-glance pill / countdowns / names / horizon / seasonal / effects / weather / weather-fx / calendar — each gating exactly its own layer, persisted in the profile. **Countdown + name labels default OFF** (the pill covers them; `defaultHidden` in the registry + an `optionShown`/`defaultHiddenMap` helper so the checkbox, the gating, and the stored value always agree).
  - Also: the daypart moved to its own smaller line under DAY/NIGHT; stronger header/footer halo edges; freshness collapsed into the ⟳ **tooltip** with an amber **stale** pulse (>10 min, a nudge not a forced refresh).
  - **Bug-check (two independent reviewers):** fixed a real layering bug where **"Living sky" off wrongly killed the sun glow / rays / moon-lighting** (they shared `elev` with the sky gradient — split off a `sunElev` that's independent of the toggle); guarded `crestPos` against moonwatch drift pinning a half-disc at the horizon. Backlog **F64–F73** in DESIGN §34.9 (F64–F66 Moon-Mage utility/conjunctions, F71–F73 polish still planned).
- **Living LANDSCAPE below the horizon (Sekmeht — nature, not a village).** The ground band gained a persistent, data-free scene — a distant forest edge, mid + large foreground trees (mixed pine + round), a winding **stream** into a reflective **lake** — under a new ⚙ **"Trees & water"** toggle. A first "village in the foothills" draft (buildings + lit windows) was **replaced by nature** at Sekmeht's ask (the option id stayed `landscape`, so the preference carries over). Highlights:
  - **Perspective** — element size scales with vertical position (small near the horizon → large at the bottom), distant pieces fade toward a pale haze, all **lighter by day / darker at night** (a `landNight` factor off `sunElev`, so it works with no TIME check; colours lerp via a new `mixHex` hex-lerp helper).
  - **Daytime contrast pass** (Sekmeht: "hard to tell what they are") — saturated foliage vs a desaturated neutral ground, **edge outlines** on canopies, **contact shadows**, and a **dark rim** on the lake so objects read against the ground.
  - **Sun-directional shadows** — object shadows cast along the **same radial fan as the crepuscular rays** (from the sun's horizon point through the object), so they point straight down under the sun, angle toward ~4–5 o'clock on the far side, lengthen as the sun sinks, and flatten with depth near the horizon; a soft ambient blob at dusk/night.
  - **Lake reflections** — shimmering columns for the sun (by day) + the lit moons where they pass above the pool (Katamba excluded — no light; skipped when the lake is iced in winter).
  - **Seasonal dressing** (rides the existing ⚙ "Seasonal touches" + a known season) — winter snow-caps + an **iced-over lake**, spring **blossoms**, summer lushness (+ fireflies), autumn recolour + **falling leaves**.
- **Moon-body colour + glow corrections (Sekmeht, from the in-game illustrations).** Katamba = soot-black disc + **grey** rim + an **ominous miasmatic dark-violet glow** that holds through day/dusk and fades only into true night (a pure-black glow was tried — invisible on a dark sky, since black only *darkens*; a night-readable "shadow" glow must be a coloured haze). Yavash = ruby/crimson; Xibar = vivid ice-blue disc + a darker **blue** rim + a **silvery-white** glow (no atmosphere → the halo is ice-field shine). `MoonStyle` gained `glowStrength`/`glowR`; overlapping bodies now paint in depth order (**Sun → Yavash → Katamba → Xibar**, furthest→closest). Pill dots mirror the new hues.
- **B222 (Sekmeht):** running Moons on two characters and switching tabs stripped the first character's sky/moons flat — the duplicate SVG gradient-ID bug (a `display:none` background tab is still mounted; `url(#id)` resolves to the first match in the whole document, so a second instance hijacked the first's gradient fills). Every Moons gradient id is now per-instance via `useId()`; new CLAUDE.md **pitfall #95** records the rule for any multi-instance SVG component.
- **Night-sky motion + polish (Sekmeht).** The scene now advances every **2s** (was 30s) so the bodies AND everything derived from the sun — **shadows, rays, lake reflections** — move together in sub-pixel steps (smooth, in sync); a disc-only CSS "glide" was tried first and reverted (it desynced the shadows/rays). The **star field** grew 9 → **70 stars** that reveal by brightness as the sky deepens toward **true midnight** (a light-pollution-clearing effect via a new `nightDepth` that peaks at midnight; twinkle moved to `fill-opacity` so it composes with each star's reveal). **Shooting stars** went from one rare fixed streak to **6 scattered across the sky** with staggered timing (still clear-night-only — clouds hide them). And the sky **FX draw order** was reorganized: day/night FX (shooting stars, fireflies, leaves) in the FOREGROUND, weather FX (clouds, precip) FRONTMOST. *(A startup TDZ crash — a module-level `STARS` array calling the later-declared `clamp01` — was introduced and fixed during development; never shipped. New CLAUDE.md rule: a load-time array must only call hoisted `function`s or `const`s declared above it.)*
- **Platform check (2026-07-21).** Verified Electron **43.0.0** = Node **24.17** / Chrome **150**, aligned with the esbuild `node24` target + `@types/node 24`; `dependencies` = `better-sqlite3` only (hygiene holds). `npm outdated` triaged: within-major bumps available (electron 43.0→43.2, `@electron/rebuild`, `@types/node` patch, `react-virtuoso`) — safe to take; majors held (React 19, Vite 8, TS 7, better-sqlite3 13). **New CLAUDE.md standing rule: run `npm outdated` periodically** (three-tier triage recorded in the packaging section).
- **About easter-egg MIDI player.** The About dialog can play a bundled `.mid` (muted by default; the 🔇/🔊 toggle un/mutes; stops on close). It's a **hand-rolled Standard-MIDI-File parser + a player that routes to the OS synth via Web MIDI** (the Microsoft GS Wavetable Synth — sounds like Windows Media Player), with a self-contained Web-Audio **oscillator fallback** — zero npm deps. Bug-check hardening: mute suppresses only real note-ONs (keeps note-offs/CC flowing so nothing hangs) with a short lookahead to bound trailing audio; dispose sends an immediate + a scheduled All-Notes-Off so no note can drone after the window closes; running-status only set for channel messages; the parser is bounds-guarded (a truncated file no longer discards everything); the toggle's side effect moved out of the state updater.

*Also:* command bar trimmed (it read oversized next to the slim chrome — outer padding 7→3px, input 8→7px, timer strips slimmed, caret still clears them; B216); compact-vitals label optical-centring nudge; the **Living Tableau's thoughts moved to a quiet bottom-left "thought log"** (were top-right, obscuring the scene — newest anchored at the bottom, older recede and fade up; B221); the **Launcher top-bar buttons centred** (were right-aligned); and the **Help → About Lichborne dialog rebuilt as a themed in-app modal** (`AboutModal` + `about.css`, replacing the native message box so it follows the theme) — a community-facing description, "Thank you all!", "Created by Sekmeht & Binu", and a two-tier **Contributors / Testers** thank-you as styled name chips. Credits are a single `credits.ts` source (`DEVELOPERS`/`CONTRIBUTORS`/`TESTERS`, ordered by logged contribution); version is live via a new `get-app-version` IPC (`app.getVersion()`, never hardcoded); opened through the menu-action bridge (`'about'`). CLAUDE.md gained a per-release "keep the About credits current" rule (incl. alias handling: Rakkor≡TheTargonian, JadedSoul≡Jaded, Elore≡Cherisse≡Aubrey, Binu=creator). A post-batch bug-check pass reviewed the whole v0.17.0 batch (no blocking bugs; two minor chrome hardenings applied). Also re-verified Lichborne's integration surface against **Lich 5.19.0 and 5.19.1** — holds unchanged, no code change needed (connection changes are game-socket/detachable-only; new XML is GS-specific/internal; the parser degrades gracefully on unknown tags). **Tester note: the GSL-leak bug was Lich 5.19.0-only** (#1443's `String == Regexp` never matched `--stormfront`) and is fixed in **5.19.1** (#1456) — a tester seeing raw protocol garbage should update to 5.19.1+. Also fixed **B222** (Sekmeht): running Moons on two characters and switching tabs stripped the first character's sky/moons/rays flat — the classic duplicate SVG gradient-ID bug (a `display:none` background tab is still mounted, and `url(#id)` resolves to the first matching id in the whole document, so a second Moons instance hijacked the first's gradient fills). Every Moons gradient id is now per-instance-unique via `useId()`; new CLAUDE.md pitfall #95 records the rule for any multi-instance SVG component.

*(Test plan: testplans/test-plan-v0.17.0.md)*

---

**v0.16.1 — Combat HUD facet + ASSESS arena on the Living Tableau (Beta)**

The G1 Combat HUD, built as a **facet of the Living Tableau** (the 2026-07-16 fold, not a separate Experience). The cockpit renders **around the player avatar** (Sekmeht's steer — "the combat flavor sits around the player's bubble"): three **readiness rings** (Roundtime / Cast / Aim, inner→outer, in the command-bar timer colours), a **danger pulse** on the avatar, **threat markers** on creatures, and a **gauge panel under the figure** — **BAL / POS** as bipolar red→yellow→green spectrum gauges (a fixed 0/neutral tick + a moving value needle; balance anchored at "solidly" = baseline) and an **RNG** M/P/R row. Combat position / balance / range are parsed by **mirroring Lich's verified regexes verbatim** ([combatExtract.ts](src/shared/combatExtract.ts)) — `DRStats` isn't front-end-readable, so we run Lich's exact parse in the FE (identical value, live, works direct-SGE). Then **ASSESS (layout B):** `parseAssessLine` mirrors Lich's `parse_assess_line` to turn DR's `assess` stream into id'd per-creature records — the Tableau shows each drake tagged with its **relation (facing/flank/behind) + range**, **your target ringed gold**, **melee = engaged** (red glow), **reeling** dimmed, and **click-a-creature → `face #id`**. Honest scope from Sekmeht's own observations: **id is identity (number is a reusable slot), combat narration is anonymous (no per-attack attribution — "who's attacking" = everyone at melee), assess is on-demand** (ages out after 30s). Corpus `corpus/2026-07-17-assess-lavadrakes.xml`; parser harness-verified against real captures. Three bugs fixed along the way: the A−/A+ "zoom" not scaling the scene (`.tableau-scene` lacked the `--game-font-size` anchor, B211), figures rendering over the room title at close zoom (header/stage flex split), and figures hopping on description-length changes (fixed-height header). A post-build bug check added one more hardening — the assess snapshot is now guarded on a **non-empty accumulator** so a block split across a 16ms flush boundary can't flicker the arena blank for a frame (B212). All Beta; needs the live in-game visual pass. (Full write-up: CLAUDE.md §32 Experiences note + DESIGN §32.1.)

---

**v0.16.1 — Lich 5.18 compatibility review + two safe hardenings**

Reviewed all 78 commits in the Lich `16213354..e20803c4` sync (5.18.0) against Lichborne's integration surface (both repos read). **Every touchpoint holds unchanged** — force-mode loopback bind + one-FE-close-listener, the `inventory_boxes_off` hook + `_flag Display Inventory Boxes 1` workaround (now `persist: true`), `;eq Vars` writes + Marshal reader, `cmd\r\n` sends (the 5.18 CRLF→LF normalization is on `StringProc`, not the FE socket), the `;listall` poll, and the parser's existing `<d>`-link / `<output class="mono">` / inline-`AimTimerDialog` handling. Recorded in CLAUDE.md (a new "Lich version compatibility" note): **Lich 5.18 now requires Ruby 4.0** (tester launch-failure signal), Lich core now **natively injects room-number/exits** (roomlinks/roommono, replacing `roomnumbers.lic`; DR default mono + plain text — renders fine), and **do NOT present as the new `--saga` frontend** (saga = stormfront's exact caps + a whole-stream `\x1f` sentinel = pure overhead, zero gain). Two provably-safe changes shipped from the review:
- **Lich Map roomId parse now accepts the `u`-prefixed parens form** (`(u12345)`) that Lich emits when `display_uid` is on — `parenMatch` widened to `/\]\s*\(u?(\d+)\)/` (bare digits still match; `(**)`/`(unknown)` still miss → id-absence no-op preserved). Pre-existing gap (pitfall #65), not a 5.18 regression; before this it silently degraded to title+desc matching for `display_uid`-on players. Verified via the parser; CLAUDE.md pitfall #65 updated.
- **SceneParser posture short forms** (Beta, §35): `sceneExtract.ts` `SITTING`/`LYING_DOWN` now also match the `(sitting)`/`(prone)` short forms DR emits under the HidePostStrings option (synced from Lich drdefs #4529 / 5.18 #1442), so the Living Tableau seats postures right for those players. Verified with a focused bundle test (long forms, short forms, no-posture all pass); DESIGN §35 note updated.
- **DESIGN §32.1 (G1 Combat HUD):** recorded Lich 5.18 #1400's `DRStats.position` (signed −8…+8 from the balance status line) as the crib for the future CombatParser's position gauge.

*(Test plan: testplans/test-plan-v0.16.1.md)*

---

**v0.16.0 — AI foundation (BYOK) + Catch Me Up (in progress)**

*(v0.15.3 was scaffolded but nothing landed in it; the AI work opened a new minor. Test plan: testplans/test-plan-v0.16.0.md)*

- **Phase 0 — the BYOK foundation (DESIGN §10.1–10.2).** A **capability-routed** `AIProvider` in `src/main/ai/` — the correction to the old §10 assumption that one provider does everything: **Claude has no image generation and no embeddings endpoint**, so text / embeddings / image are three independently-BYOK capabilities, not one key. v0.16.0 ships **text (Claude)**; `embed()` / `generateImage()` are *declared but stubbed to throw a clear "capability not configured"* so the image + RAG tracks slot in later without a redesign (and a feature reaching a dark capability degrades with a message, never a crash). Keys live in `safeStorage`/DPAPI (`ai-keys.json`, the `passwords.json` precedent) and **never cross IPC** — only a "is a key present" boolean does. **Deliberately NOT the `@anthropic-ai/sdk`:** a ~100-line raw-`fetch` SSE client ([claudeProvider.ts](src/main/ai/claudeProvider.ts)) fits the v0.15.0 packaging-hygiene rule (zero new npm packages) and this codebase's hand-rolled-parser ethos better than bundling a large SDK for one streaming call. Non-secret config (enable / model tier / per-feature consent) rides `SharedProfile.ai` → `_shared.yaml`. Settings gains an **AI** section (key Save/Test/Clear, Haiku 4.5 default / Sonnet 5 / Opus 4.8 tiers, per-session token meter).
- **Phase 1 — Catch Me Up (AI4), the first Experience-free AI feature.** `/ai catchup [duration]` streams a Claude summary of a **time window**, gated behind a one-time per-feature consent modal. Output routes to a first-class **`lbAI` stream** you can add to any window/panel, falling back to the main game window when that panel isn't open.
- **Three real bugs found and fixed during the build, all pre-ship:**
  - *(1) Catch Me Up was blind to every open stream panel.* A **watched** stream routes to `streamLines` and never reaches `lines` (`STREAM_FALLBACK` only spills into main when nobody's watching), so gathering from `lines` alone missed thoughts/deaths/arrivals — the exact content a returning player wants — and it got **worse the better your panel layout was**. That inversion is how it was spotted. `collectHistory()` now merges main + every watched stream by timestamp, source-tagged (`[thoughts] Rakkor says …`).
  - *(2) The 200-line cap made a long window pointless.* Even with perfect data, a 3-hour absence could only be summarized from its final sliver. The budget is now **characters, not lines** (`CATCHUP_MAX_CHARS` 40k ≈ 10k input tokens ≈ under a cent on Haiku), and the header says so honestly when it still can't fit everything.
  - *(3) `/ai catchup` did one of several things depending on invisible state* (Sekmeht: *"I don't understand what data /ai catchup looks at"*) — a silently-detected keypress gap, or an explicit /afk span, or the last 200 lines. **Both auto-window mechanisms were removed.** The window is now always a time range from exactly two sources: an explicit duration, else the default 30m. The header always states which. Simpler and predictable.
- **Session-Log sourcing — BUILT, TESTER-SHIPPED, then REVERTED (Sekmeht, 2026-07-14). The most instructive thing in this release.** Catch Me Up briefly read the session log so a long absence could be reconstructed. It worked — but **log scale is a different problem**: a busy character logs **80k lines/day** (49k `main`, 38k `inv`, 17k `spells`), so finding the signal forced in priority tiering, a verbatim quote block, realm-ticker gating (`[arrivals]`/`[deaths]` are realm-wide feeds about *strangers*; the room events that matter live in `main`), NPC-vendor filtering (DR has **no** conversation stream — player and NPC speech both land in `main`, verified against two real 60k+ line logs), and template collapsing — and it *still* handed the tester a wall of shop chatter. Sekmeht's call: *"this should just be to catch up what's on the screen; another AI feature can analyze the log files later."* Exactly right. **The scale of the input decides the architecture** — the same feature over 3k on-screen lines and 80k logged lines is genuinely two features. Log analysis is now tracked as its own feature (DESIGN §10.4) with the whole problem list recorded. **Kept from the reverted work** (wins at any scale): `CATCHUP_SKIP_STREAMS` (state readouts that clear+rewrite feed the model a stale *table*, not history), consecutive-identical dedup, and **naming the character in the prompt** (it previously said "the player" and made the model *guess* which name was you). **Groundwork kept:** the `session-log:read-window` IPC — it filters a time window in main, and carries pitfall #92's hard-won rule: **never bound a TIME window with a LINE count** (an 8000-line tail reached back only *6.2 minutes* on a busy character, so `/ai catchup 11m` silently summarized ~6).
- **Polish, all tester-driven (Sekmeht, same session):** the summary bled into the next game paragraph → a trailing `\n` (NOT a spacer row, which takes its own `[HH:MM]` when timestamps are on); AI text rendered on `--text-dim`, the *dimmest* rung, against white game text → a new **`ai` preset** that follows the game-text color, tinted 25% toward the accent via `color-mix` so it self-corrects on every theme; the `lbAI` panel had a blank empty state → it now explains itself; `/ai stop` cancels a stream mid-flight; auth errors now teach the fix.
- **Slash surface (Principle #11).** `/ai` (status · on · off · key · catchup · stop), with a `NOUN_HELP` blurb. `parseDuration` accepts free-form time — `27m`, `4m`, `90` (bare = minutes), `2h`, `2.7h`, `1.5h`, `1h30m` — verified with a 28-case bundle test against the real module. **Palette fix in the same pass (v0.16.0 `/ai` bug):** `resolveCommand` committed to a noun's *bare* form the moment you typed `/ai `, so its verbs never listed or Tab-completed. It now skips the bare form for any noun in `NOUNS_WITH_VERBS`, so `/ai ` and `/colors ` stay in list mode and rank their verbs like `/trigger` does.
- **`/afk` removed same release (Sekmeht, 2026-07-14: *"it's on the player to know how to catch up"*).** A `/afk` toggle + a non-AI "welcome back" counts card were built, then cut as not-worth-it — the `/ai catchup <duration>` argument covers the need, and the non-AI baseline falls back to the scrollback + Session Log (the player's own eyes). Removed the command, the persisted `afkSince`, and the welcome-back card.
- **Settings width — a deliberate exemption from `--modal-w-standard`.** At 88vw the `flex: 1` labels parked every toggle's switch a thousand pixels from its label. Two fixes were built and **rejected by Sekmeht**: capping the content to one centered column (fixed the stretch but converted it into a sea of dead margin — *"a ton of blank spaces"*) and flowing sections into 2–3 columns (used the space, but *"I don't think it looks very good"*). The answer was simply **a narrower window** — `width: calc(var(--modal-w-standard) / 2)`, one column, comfortable measure (+ a `min-width` for small displays). Settings is a single-column **form**; every *other* big modal (Panel Manager, Automations, Lich Dashboard, Session Log, Import Wizard) genuinely needs the full width for its tables and rule lists, so the shared token is untouched and only Settings opts out. The HEIGHT token is kept, so modal sizes still retune from one place.
- **Comprehensive bug + UX review of the AI batch (3 parallel reviewers + firsthand verification).** Verdict: architecture held — no crashes, data loss, cross-session bleed, stale-closure send bugs, or listener leaks. Fixed in a follow-up pass: **(1) a real bug** — Anthropic SSE `error` frames arriving mid-stream (overloaded/529 after `message_start`) were silently swallowed, ending with a partial/empty summary and no error; `handleFrame` now throws so it reaches the error line. **(2)** `/ai catchup` pre-checks the key (returns `'nokey'`) so the one-time consent modal isn't shown for a request that can't fire. **(3)** the `lbAI` panel/menu label was mangled to "LbAI" by the generic `capitalize(id)` — a shared `streamLabel()` helper (6 call sites) fixes it to `lbAI`, behavior-preserving for every non-AI stream. **(4)** doc-hygiene: the unwired `session-log:read-window` IPC's comments no longer claim "Used by Catch Me Up" (it's groundwork for the future log feature, §10.4); a stale welcome-back-card comment removed. **UX polish:** `/ai status` shows "Haiku 4.5" not `claude-haiku-4-5`; "Usage this session" reads "not used yet" until first use (no wall of zeros); the consent modal discloses billing ("billed to your own API key"); the model radio gained a description. **Output-routing DECISION recorded (Sekmeht):** default = main game window, route to `lbAI` when its panel is open; `lbAI`-as-default was considered and declined (summary should land where you're looking).
**v0.15.2 — Muscle-memory input pack + global rules + session restore + search (shipped 2026-07-10)**

- **Second bug-check pass + programmatic test-plan coverage (Sekmeht: "use the test-plan to validate... programmatic checks would be awesome").** The tab-⚙/placement changes audited clean: every consumer of the experiences list (`expAnyOpen`, the §35.6 scene gate, the moons Firebase seed, the shelf's open set, the ExperienceLayer) filters on `i.open`, so the find-or-create's minted `open: false` prefs record is invisible to all of them by construction. **New machine-local harness `tmp-rules-harness`** (34 cases, gitignored like the others; stubs localStorage/document/window.api, bundles the REAL modules): ruleIdentity keys (incl. locking `newHighlight`'s `caseSensitive: true` default — a wrong harness premise caught it), `asGlobalRules`, the `_global` store round-trip, `applyProfileImport` global-awareness (merge + idempotency + per-char global-skip in BOTH modes + Replace-never-wipes-globals), the `_shared.yaml` bridge (via a `window.api.readSharedProfile` fixture — `importSharedProfile()` reads the YAML itself, no data param), and **`planReconnect`** — F62's eligibility rules extracted from App.tsx into pure [reconnectPlan.ts](src/renderer/reconnectPlan.ts) precisely so the account law (already-on skip, conflicts, dead tabs, batch dedup, case-insensitivity — both of the feature's shipped bugs) is harness-locked. The test plan's covered items now carry `[auto]` tags (header explains: auto = logic proven, manual still verifies the UI wiring). Full suite at cut: tmp-cmd 35/35, tmp-rules 34/34, builds green, tsc at the 2 known errors.
- **Tab-hosted Experiences get the ⚙ layer options (Sekmeht: "was I supposed to be able to see the clickable layer options like hiding the horizon? I don't see that anymore").** Checked first, per his ask: nothing was broken — the ⚙ "Show in this scene" popover only ever existed on the FLOATING Experience window's hover chrome (v0.14.7), and the v0.15.1 tab hosting (F55) shared the floating instance's `hidden` prefs but shipped **no gear of its own** — so a tab-only Moons had no path to the options at all. Fix: PanelFrame's per-panel view-controls cluster (the F31 A−/A+ corner) now adds a **⚙ on active experience tabs** whose registry def has options, opening the SAME `.exp-inst-options` popover (a `--tab` position modifier — bottom-right, clear of the scrollbar rail). It reads/writes the SAME instance `hidden` map the floating window edits via two new sharedFrameProps (`getExperienceHidden` + `onToggleExperienceOption` — B193: both hostings, one source), with **find-or-create**: a tab-only experience mints a CLOSED instance at the registry defaultRect purely as the prefs record, riding the existing `experiences` persistence (state → YAML → Transfer) unchanged. Popover closes on tab switch. **Placement iteration (Sekmeht's screenshot: the ⚙ sat on the Moons footer's "moonwatch: just now" text):** experience tabs lift the whole view-controls cluster via a `panel-font-controls--exp` modifier (`bottom: 4px → 28px`, popover aligned) — scenes carry bottom chrome that ordinary stream panels don't; stream panels keep the original corner. Also this session, per Sekmeht: **test plans became a first-class per-version practice** — `testplans/test-plan-v{version}.md` grows with the version as features land, is part of "update my documentation", runs before packaging, and doubles as harness-case backlog (CLAUDE.md documentation-discipline table updated; the v0.15.2 plan moved into the new folder).
- **Proactive bug-check pass over the whole v0.15.2 batch (Sekmeht asked; Iron-rule reads + the pre-merge questions per feature). Three real findings, all fixed same pass:** *(1) F62 roster reads ignored `connected`* — a DISCONNECTED-but-open tab counted as live, so Reconnect Last silently skipped a saved character whose dead tab was still in the bar ("already on" — it wasn't) and raised FALSE account-conflict choosers against dead tabs; both the snapshot writer and the chooser now filter `r.connected` (the single-tile conflict check's long-standing convention). *(2) F63 move had a quota-edge data-loss window* — it removed the rule from the source store before writing the target; a quota-failed target write (safeSetItem returns false, rule saves discarded it) would have lost the rule entirely. All six rule saves now RETURN safeSetItem's success flag and the move is transactional: target-save FIRST, abort (source untouched) if it failed. *(3) F49 stale hit outline* — editing the search query to something with zero matches left the previous hit's accent outline on its row; ScrollbackSearch now clears the marker via a new `onClearHit` callback. **Verified clean in the same sweep:** no stale `hideGroups` references after the scope-prop refactor; the six rule panels have no host besides AutomationsPanel (new props can't be missing anywhere); `disconnect-await` no-ops safely on a missing session (chooser's stale-roster edge); Transfer's `applyGlobalRules` is idempotent across multi-target fan-out (content dedup makes repeat applies no-ops); the F61 settings filter preserves all row state (every stateful bit lives at panel level) and can't strand a bare Session Log header; global-scope panels correctly reset to character scope on every Automations open (fresh mount); F60/F49 keydown ordering can't collide (Ctrl+F returns before the printable redirect, which requires no modifiers). + the scope switch never moves (Sekmeht).** Mutes and substitutes are now scope-capable end-to-end: virtual `_global` stores (`sharedMutes`/`sharedSubstitutes` ride `_shared.yaml`), character-first compile merges in GameWindow (`compileMutes`/`compileSubstitutes` over `[...character, ...global]`, live-reloaded by the same event/storage listeners), "Applies to" move controls in both editors (muteKey/subKey identity — already in ruleIdentity.ts), the Automations scope switch + scope-keyed remounts, analytics prune coverage, and Transfer (in the globalRules category + global-skip filters on per-character mute/sub imports). **Header ergonomics fix in the same ask: the "This Character | All Characters" switch now renders on EVERY tab** — greyed with an explanatory tooltip on Groups (the only non-capable tab left: groups/modes are per-character by design) — so the header buttons no longer shift position when the switch used to disappear. DESIGN §39.5 updated.
- **F63 — Per-rule scope move ("Applies to") + Transfer global-awareness (Sekmeht's follow-up to F37).** Two halves. **(a) Move:** each of the four global-capable editors (Highlights/Triggers/Macros/Aliases) gains an **"Applies to: This Character | All Characters"** segmented row — the active side is a state marker, clicking the other side MOVES the rule between stores. This keeps F37's settled storage model intact (two separate stores, no per-rule scope field — the rejected-toggle rationale survives; the toggle is a deliberate ACTION): remove from source, add to target UNLESS a content-identical rule already exists there ([ruleIdentity.ts](src/renderer/ruleIdentity.ts) keys — extracted from profileTransfer so move + Transfer share ONE definition of "duplicate"), toast either way; promotion normalizes groups away, the id travels (analytics history stays attached), unsaved draft edits move with it, and the panel remounts via the importNonce pattern. **(b) Transfer:** a new **"Global Rules (All Characters)"** shared-store category (the Named Colors model — always MERGES with content-dedup + id regen + always-active normalization, never wiped by Replace; all five registration points done), and the four per-character rule categories now FILTER incoming rules already present in the destination's global store (both merge modes; `globalRules` applies first in the order so the filter sees the merged store) — a rule promoted to global can never come back as a double-firing per-character copy from an old export bundle. DESIGN §39.6–39.7.
- **B204 — Moons Experience horizon didn't stretch a maximized panel's full width (Sekmeht, screenshot).** The aspect-derived viewBox width was clamped at 1100 — hit by any drawing area wider than ~4.4× its height (H = 250), i.e. ordinary maximized panels, not the "extreme aspects" the clamp intended — and `xMidYMax meet` then letterboxed the SVG (ground/ridges centered, side gaps) while the HTML sky layers kept filling the container. Ceiling raised to 5000 and re-documented as a degenerate-measurement guard only (transient mid-drag sliver measurements), so the viewBox tracks the real aspect and the ground reaches both edges. Full notes: BUGS B204.
- **F37 — Global cross-character rules (Binu's long-standing ask) — SHIPPED for highlights/triggers/macros/aliases.** Option A from the settled design (Sekmeht, 2026-05-31): a separate STORE, not a per-rule scope toggle. Implementation: globals live under a **virtual `_global` character scope** (`GLOBAL_RULES_SCOPE` in [characterScope.ts](src/renderer/characterScope.ts)) — the four rule panels work UNCHANGED inside a re-pointed `CharacterProvider` (AutomationsPanel gained a **"This Character | All Characters"** header switch on the four engine-rule tabs), and the `lichborne._global.*` keys ride **`_shared.yaml`** via new optional `sharedHighlights/Triggers/Macros/Aliases` fields (raw-key bridge in [profile.ts](src/renderer/profile.ts), no rule-module imports). Runtime: GameWindow merges globals AFTER the character's lists at each engine input (character-first — highlight ties, macro key conflicts, alias prefixes all resolve to the character's rule), normalized **always-active** via `asGlobalRules` (groups are per-character; the editors hide the Groups row in Global scope via a `hideGroups` prop). Live sync: a `lichborne:global-rules-changed` custom event (same window) + `storage` events on the `_global` prefix (other windows) re-merge every mounted GameWindow. Analytics: the stats prune now counts global ids as live (they fire under each character); known v1 quirk — the Global-scope editor's badges read the unused `_global` stats map, so global rules show no counts there (recorded, DESIGN §39). Deliberately deferred: global **contacts** (runtime presence-tracking writes would race across windows — needs its own design), global mutes/subs, and a slash `global` flag (recorded no-command-yet decision). Not in any character export/Transfer by design.
- **F62 — "Reconnect Last Session" on the launcher (closes the 'sessions are not persisted' known limitation).** The primary window snapshots the live roster (all windows, deduped) to a `lastSessionCharacters` shared setting (`_shared.yaml` + localStorage working copy) on every NON-EMPTY roster change — non-empty-only so the shutdown drain / disconnect-all can never wipe the last good set. The launcher's top bar grows a **"⟲ Reconnect Last (N)"** button (leads the bar; hidden at N=0, so first-run stays quiet) that feeds the saved set — matched to existing non-hidden tiles, minus already-connected characters — straight into the existing `runBulkConnect` flow (no picker), honoring the persisted separate-windows preference. Window-arrangement restore deferred (recorded). **Found in Sekmeht's feel pass + fixed same day: the first cut skipped only characters that were THEMSELVES connected, not characters whose ACCOUNT was occupied by a different character** — reconnecting saved char B onto an account where char C was live bounced C (DR's one-character-per-account rule; the exact account-level vetting `BulkConnectPicker.buildBulkGroups` does, which going straight to `runBulkConnect` skipped). Fix, per Sekmeht's follow-up call ("have the player interactively choose"): an account conflict now opens a **chooser modal** — per conflicted account, **Keep** the connected character (default) or **Switch** to the saved one (awaited `disconnectAwait` first + one 2s slot-release grace beat, the `continueWithDisconnect` model); non-conflicted saved characters connect on the same Confirm; Cancel connects nothing. Detection uses the roster (all windows), so a switch can disconnect a character in a decoupled window. Batch also enforces one-pick-per-account (hand-edited-YAML guard).
- **F49 — Ctrl+F in-scrollback search — SHIPPED.** New [ScrollbackSearch.tsx](src/renderer/components/ScrollbackSearch.tsx) overlay (top-right of the story window, inside `.text-area` so it rides into a floating main window unchanged): matches computed from the `lines` data model (joined segment text — WYSIWYG, pitfall #89), a new query lands on the MOST RECENT match, Enter walks older / Shift+Enter newer (wrapping), Esc closes and refocuses the command bar. Jumps un-pin first then `scrollToIndex({align:'center'})` — NO new scroll mechanism (pitfall #68); the active hit's wrapper div gets an accent outline class (TextLineRow memo props untouched). Ctrl+F is intercepted in the global keydown (Electron has no native find), gated off while any modal is open. Match indices are stable while searching because the un-pinned buffer never trims (pitfall #81).
- **F59 — `;` command separator for typed input (`n;n;e`).** The Genie reflex, at the typed-input layer: `splitTypedCommands` ([macros.ts](src/renderer/macros.ts)) splits `dispatchUserText`'s line AFTER slash handling — each part runs the full alias/echo/send/log tail independently. **A line whose first non-space char is `;` is a LICH command and is returned verbatim, never split** (`;e Vars['x'] = 'a;b'` can't be corrupted); `\;` escapes a literal `;`; empties drop; history keeps the raw line (↑ recalls `n;n;e` whole; RepeatLast replays through the same split). QuickSend deliberately does NOT split (targets other characters — same reasoning as its `/` exclusion). Harness grew to 35 cases (9 new split cases incl. the Lich-verbatim and escape shapes).
- **F60 — Type-anywhere focuses the command bar (the Genie/Frostbite model).** A printable keystroke that would otherwise be LOST (focus on a button/map/panel/body) now lands in the command input: the global keydown handler focuses the input during keydown (the browser then delivers the character there — no preventDefault, no manual insertion; a space aimed at a focused button no longer clicks it since button activation fires on keyup). Guards: no Ctrl/Alt/Meta, printable single keys only, never while any text field/select/contentEditable has focus, never while a modal is open (reuses `anyModalOpenRef`), never mid-IME, never when something already consumed the key (`e.defaultPrevented` — covers macro-bound printables). Always on, no setting (matches the siblings; a toggle only on a real tester ask). **Drive-by fix found wiring this:** `anyModalOpenRef`'s effect computed over `showMapOverlay`/`showLichDash` but omitted both from its deps — opening ONLY the map overlay or Lich dashboard left the ref stale (macros kept firing into them). Deps completed.
- **F61 — Settings search + section navigation.** A "Search settings…" filter box at the top of the Settings modal (matches label text or section name, case-insensitive; sections hide when empty; a "no settings match" empty state) + a slim left section rail (Display / Accessibility / Layout / Behavior / Session Log / Lich Setup) that smooth-scrolls to each section and hides while searching. Rows wrapped mechanically — no setting logic/order/markup changed; the Session Log sublist force-opens for display when a search matches a sub-row (user's expand state untouched). Zero color literals; existing `.sp-*` chrome vars throughout.
- **Stream-panel virtualization — evaluated and DEFERRED (recorded decision).** The review flagged the plain-DOM stream panels as perf headroom; the evaluation against the code says don't do it now: rows are capped at 500 AND `TextLineRow` is memoized (an append reconciles ≤500 memo-bailing children — the B172 profiling put the real per-line costs elsewhere and fixed them), while virtualizing would rewrite the exact scroll surface whose B203 fix is uncommitted awaiting Sekmeht's verification, and the main window took SIX iterations (B33→B158) to get Virtuoso pinning right. Re-open only with a measured case, after B203 soaks. (DESIGN §40.)
- **F56 — Classic numpad movement pad, seeded by default.** The layout every Stormfront-family client ships — verified against Frostbite's bundled default profile (`deploy-files/profiles/frostbite/macros.ini`): Num8/2/4/6 = n/s/w/e, corners = the diagonals, Num5 = out, Num0 = down, Num. = up (short-form commands, matching Frostbite's). Implemented as a second one-time seed effect in GameWindow next to the v0.8.3 repeat-command seed, with the same non-destructive rules: keys the user already bound are skipped, a per-character flag (`seededNumpadMovement` scopedKey) makes it once-only, and deleting a seeded macro never resurrects it. Existing characters get the seed once on next open (they're exactly the Genie/Frostbite converts who have this in their fingers). Numpad macros match on `e.code` (NumLock-independent) and fire globally, so the numpad is a movement pad like the legacy clients — digits type from the top row. No slash surface (macros have no slash noun — pre-existing decision; pre-merge check #5).
- **F57 — Command history persists + the ↑/↓ draft is preserved + Esc clears the line.** History was a plain in-memory ref — gone on every restart. Now loaded/saved per character via [commandHistory.ts](src/renderer/commandHistory.ts) (scopedKey `commandHistory`, ≤200 entries, try/catch'd write — background telemetry never toasts; rides `state:` → YAML like automationStats and is likewise deliberately NOT in `TRANSFER_CATEGORIES`). Pressing ↑ from the live line now stashes the half-typed draft and ↓ back to the bottom restores it (the shell model — it used to be discarded), and ↑ with an empty history no longer wipes the typed line (latent bug: `Math.min(0,-1)` → `setCommand('')`). **Esc clears the command line** (the classic Stormfront/Genie reflex) — layered under the slash palette's Esc (first dismisses the palette, second clears), gated on non-empty. History push policy (pitfall #31 — which paths push) is unchanged; harness 26/26.
- **F58 — First-session command-bar hint.** The command input had no placeholder at all, so a new user had no way to discover the `/` client commands (F48's three shipped phases were invisible until stumbled upon). Now shows *"Type a game command — or / for Lichborne client commands"* — gated on the character never having sent a command (derived from the F57 initial history load, so it stays for the whole first session and is gone from the next mount on; veterans never see it — polish standard #1, quiet by default). Placeholder color is `var(--text-faint)` explicitly (Chromium's default placeholder grey is a literal — pitfall #34 family).
- **B203 — stream panels in windows stop following the last line (Sekmeht: "thoughts begins to fill, then scrolls off… once I scroll to the bottom it follows after").** Root cause validated by read: StreamPanel's render-time pin "recheck" re-derived `pinned` from raw geometry every render, so geometry-only changes (a floating window's 0-height mount frame, drag-resize, layout-mode switch) silently unpinned with no user scroll — the pitfall-#71/B191 class. Fix: unpin only via the scroll handler (document.hidden + zero-height guarded), recheck deleted (unpin-only → removal errs toward pinned, recoverable by one wheel-up), and a passive ResizeObserver re-snaps to bottom when pinned (bare `scrollTop` write, pitfall #68c). DebugPanel audited — no pin logic, unaffected. Full notes: BUGS B203.

**v0.15.1 — Moons Experience #2 [Beta] (shipped as "Weather & Moons", renamed "Moons" same day — item d below)**

- **Experiences as TABS — §34 dual-hosting (Sekmeht: "preserve screen estate… selectable in the + button… separator… [e] badge"). This SUPERSEDES the dual-hosting half of the 2026-06-12 v2 discard at his fresh explicit ask** (the panel→Experience CONVERSION half stays discarded — full split recorded in DESIGN §34.2 item 3; memory tombstone updated in lockstep). Every PanelFrame `+` menu (zone tabs AND floating windows) now offers the registry's Experiences below a separator, each row [e]-badged (tooltip explains "graphical surface, not a text stream"). Mechanics: hosted tabs are `type: 'experience'` with **namespaced `exp:<id>` ids** (EXP_TAB_PREFIX — experience ids never enter the bare stream-id space, §34.1 collision safety intact; deliberately NOT in ALL_PANEL_TYPES so no generic builtin row and no pitfall-#27 churn); ONE content builder (`renderExperienceContent`) serves both hostings via `renderExperienceTab` on **sharedFrameProps** (B193 — zones and windows can't drift); tab-hosted copies share the floating instance's ⚙ `hidden` prefs and take the panel's own F31 A+/A− (PanelFrame re-maps the override onto `--game-font-size` inline — a CSS var self-reference would cycle); the §35.6 scene gate + the moons Firebase seed now count hosted tabs via the **pitfall-#79 per-mode `expTabIds` aggregation** (free = window tabs; panels = zone tabs gated on `*Added`); experience tabs are EXCLUDED from `watchedStreamsRef` (typed state, not stream text). Persistence is free (tabs ride the existing zone/window arrays → YAML → Transfer Panel Layout). Known edge: the Experiences shelf reflects floating instances only. No slash surface (the + menu is the surface; pre-merge check #5).
- **Weather & Moons live-pass fixes (Sekmeht, same session):** *(a) continuous text contrast* — near sunset the discrete sky class still said "day," leaving dark grey text on an already-dark sky (screenshot); text color now LERPS against the sky brightness (dark ink while `wDay ≥ 0.75`, fully light by `≤ 0.45` — a steep ramp so it never lingers mid-grey over the mid-toned twilight band), inline on the scene with the same 2.5s transition as the sky layers; the class colors remain the unknown-sun fallback. *(b) bodies BEHIND the horizon* — the SVG is restructured into explicit passes (underground discs → a translucent **ground veil** → sky discs → horizon + ridges → ALL text): underground travelers now read as beneath the earth, a setting sun/moon sinks behind the silhouette peaks, and names/countdown chips render in the final pass so they stay legible above everything (Sekmeht: "the text layer can be above the horizon"); body positions computed once per render and shared by the disc + text passes. *(c) bug-test + perf pass (Sekmeht asked):* the static audit found ONE real perf bug — `onOpenContact` was an inline arrow, minting a fresh prop identity per GameWindow render and **silently defeating the memo() on EVERY Experience component** (pre-existing since v0.14.0; Moons/Tableau re-rendered on every game batch). Fixed with a `useCallback` (every other Experience prop verified update-gated, so the memos now genuinely hold — Experiences skip text-only batches entirely). Also: the tab context menu's 'Clear' is omitted on experience tabs (no text buffer — it was a silent no-op). Verified clean: all three PanelFrame hosting sites spread sharedFrameProps; `expTabIds` deps complete; watched-set exclusion in both modes; PanelManager label/filter behavior; the `exp` panel id vs `exp:` prefix non-collision; same-frame duplicate prevention in both directions; dual-mount (floating + tab) has no shared module state; harness 56/56. *(d) renamed "Weather & Moons" → "Moons" (Sekmeht)* — the id stays `moons` (persisted instances + `exp:moons` tabs unaffected); distinctness from moonwatch's "Moons" STREAM is carried by the **[e] badge, now on the TAB STRIP too** (not just the + menu row), and **experience-tab labels resolve LIVE from the registry** (`experienceDefs` lookup by prefixed id, persisted label as fallback) so the rename reaches tabs placed before it — the pattern for any future Experience rename.

- **Experience #2 — "Weather & Moons" [Beta] (Sekmeht: "a visual based upon moonwatch.lic's output… part of a larger analytics vision incl. sunrise/sunset/noon/weather").** A sky-dial instrument over the community **moonwatch.lic** feed: Katamba / Yavash / Xibar drawn as lore-colored discs (dark giant / red ember / pale blue) riding a half-ellipse sky arc, positioned by REMAINING transit time (the script's own orbital constants — up durations 177/177/174 min, rise waits 174/175/172 — turn "sets in 88m" into an arc position); down moons wait dimmed below the horizon with "rises in Nm" chips; countdowns tick locally between reports and the footer always shows data age ("moonwatch: 3m ago") so stale crowd-sourced data never masquerades as live. **Sources (script read end-to-end):** moonwatch pushes ` [k]±(N) [y]±(N) [x]±(N)` into the `moonWindow` stream (`+` = up/sets-in, `-` = down/rises-in, N = real minutes) ~once a minute — parsed by a pure `parseMoonLine` in [experiences.ts](src/renderer/experiences.ts) at the GameWindow stream branch (cheap regex on a rare line; read-only stream-id match, routing untouched). **Sunrise/sunset are captured NATIVELY from DR's ambient prose** (the 11 rise/set patterns mirrored VERBATIM from moonwatch.lic's own detection, behind a pitfall-#82a substring pre-gate on the main branch) → the day/night backdrop tint works even direct-SGE; sky unknown = neutral dusk. **Genie research (Sekmeht asked):** Genie tracks NO weather anywhere in its source — only `$gametime` from `<prompt time=>` (which we already parse, pitfall #87); nothing to borrow, so weather itself (ambient-prose classification) is the recorded Phase-2 ambition (DESIGN §34.9). ⚙ options: Sun & sky, Countdown labels (the F53 popover — zero new UI); A−/A+ ride free; `badge: 'Beta'` like the Tableau. SVG text initially shipped geometry-sized — superseded by iteration item (7b) below (game-font chain, so A−/A+ works); HTML chrome (setup empty state teaching `;moonwatch window`, footer strip) uses theme vars + em. Replay (pitfall #60) re-seeds the sky on window handoff. Harness: 45 cases at first ship (grew to 56 through the iterations) against the real bundled module (both real report lines, every sun-prose alternative, gate coverage, no-false-fire, constants). No profile-shape change ('moons' instances ride the existing `experiences` scopedKey). No slash command by design (the shelf is the surface — the F53 precedent, pre-merge check #5). **Same-day tester iteration (Sekmeht):** (1) *resize fix* — the first cut's fixed 400×220 viewBox CLIPPED the tray countdown chips (drawn at y≈231, outside the box) and single-axis resizes letterboxed + walked the content around (corner/diagonal resize looked fine because it preserves aspect — the diagnostic tell); now the viewBox WIDTH derives from the drawing area's measured aspect (ResizeObserver, 0×0-guarded per pitfall #83, quantized to 8 units) so horizontal resize genuinely widens the horizon and vertical resize scales uniformly, with `xMidYMax meet` only as the extreme-aspect clamp fallback (ground pinned to the bottom, never letterboxed under). (2) *lore colors* — moons restyled from the in-game descriptions Sekmeht supplied: soot-black Katamba (near-black radial disc + faint miasmatic haze halo), blood-red Yavash (ruby/crimson gradient + strong glowing atmosphere halo), silvery-blue Xibar (ice-field gradient, deliberately NO halo — the lore says it's airless). (3) *positioned sun* (Sekmeht: "let's try the positioned sun") — the sun now rides the same arc by day, powered by moonwatch's OWN cycle constant (`minutes_to_next_sun_event`, line 138: the sun cycle is **360 real minutes rise-to-rise**; day length derived from the observed rise↔set gap exactly as the script derives it, 180/180 assumed until both observed — countdowns show `≈` while assumed). Because the cycle is real-time periodic, ONE observed transition anchors the phase indefinitely — so day/night now AUTO-ADVANCES (no more stale binary flip if a sunset line is missed indoors) and the anchors are **persisted per-character** (`moonSun` scopedKey → state: → YAML; observe one sunrise once and the sky works every session after; deliberately NOT in TRANSFER_CATEGORIES — observation telemetry, the automationStats precedent, and any character re-anchors in one transition). Pure `computeSunPhase` in [experiences.ts](src/renderer/experiences.ts) (harness grew to 54 cases: both anchor orders, derived day lengths, night side, set-only, multi-cycle-old anchors). The dusk gradient now MEANS something: it renders for the ~12 minutes around a real transition (dawn/twilight) plus the nothing-observed-yet state; footer shows "☀ sets in Nm" / "☾ sun rises in Nm". (4) *vanishing pre-rise moon + underground return arc* (Sekmeht: "Xibar disappears a minute before it rises") — root cause: moonwatch's countdown is `(predicted event − now)`, so between the PREDICTED and the OBSERVED transition it reports a NEGATIVE timer (`[x]-(-2)`); `parseMoonLine`'s `\d+` rejected the minus, dropping that moon from the parse, and the replace-semantics state write then erased it from the sky. Fixes: the regex accepts `-?\d+` (negative remaining renders as "rising…"/"setting…" held at the horizon endpoint), and reports MERGE over the previous state instead of replacing — a moon can never vanish (a stale entry drifting until the next full report is the accepted lesser evil, commented at the write site). Plus Sekmeht's follow-the-order idea: down moons now travel a shallow UNDERGROUND return arc (`underPos` — west set-point → east rise-point, `UNDER_DEPTH` 28 dip) positioned by progress through their below-horizon wait (`MOON_DOWN_MINUTES`), sharing endpoints with the sky arc so the whole cycle reads as one continuous journey and a rising moon surfaces exactly where its up-arc begins; labels flip inward past the midline so they can't clip the edges. Harness → 56 cases (negative-timer parse both signs). (5) *sun on the underground arc + instant seeding* (Sekmeht: "the sun should show below the horizon too" / "I don't see the sun at all right now") — the night sun now travels the same underground return arc, dimmed+dashed like the waiting moons, with its rise countdown; and the "no sun until a transition is observed" cold-start (up to ~3h blind) is closed with EXISTING telemetry from the research sweep: when moonwatch's feed is live and no anchor exists, GameWindow reads **`UserVars.sun`** (day/night + minutes-to-next-event, Firebase-derived) from lich.db3 via the existing `lich:get-vars` reader and synthesizes a rise anchor (180/180 assumption, ≈-flagged; observed prose transitions always overwrite; gated on Lich mode + a live moonData feed so the ≤5-min var-flush lag is the only staleness; timer sanity-checked 0–360). Direct-SGE keeps the observed-prose path. (6) **B202 — the under-arc ran backwards AND the missing sun exposed a years-old Marshal decoder bug.** The sky arc rises RIGHT/sets LEFT but `underPos` ran the return leg the wrong way (a just-set Katamba sat at the rise point — Sekmeht's screenshot); fixed so the loop is truly continuous. The sun seed's silent failure traced to [marshalParser.ts](src/main/lichbridge/marshalParser.ts): the `'I'` ivar handler added an EXTRA object-table entry (Ruby registers only the inner value), shifting every later `@` link — `UserVars.sun`'s linked `timer` key decoded as a different var's name in every blob, so the seed read `undefined` and bailed. `'U'` had the sibling register-after-payload ordering bug. Both fixed against marshal.c's registration rules and verified by re-dumping ALL 22 real uservars blobs (every `sun` now `{day,night,timer}`); this had corrupted link-heavy Lich-Dashboard Variables displays since v0.5.0. Seed synth also clamped for >180-min day/night halves (187m day observed live). Pitfall #91. (7) **Exact sun anchors + the living sky (Sekmeht's live pass, same day).** *(a)* The 180/180 assumption put a mid-morning sun at the APEX (all a timer-only seed knows is "sets in 89m") — fixed by fetching the community-observed sunrise/sunset EPOCHS from the dr-scripts Firebase (`moon_data_v2.json` — the SAME public read-only feed moonwatch itself polls; `moons:fetch-sun-data` in main, 10-min cache, 6s abort, every failure → null): both anchors exactly, true day length, no assumption, works direct-SGE. Priority: locally-OBSERVED prose transitions (a `sunObservedRef` provenance flag) > Firebase pair > the UserVars/assumed synth (which now waits for the fetch to actually FAIL). *(b)* A+/A− didn't scale the Moons text — the SVG text was viewBox-pinned; re-sized via `calc(var(--game-font-size) * k)` (CSS px in SVG are user units — the B201 map-LABEL approach), and the HTML chrome (`.moons-scene`/`.moons-empty`) anchored to the var (pitfall #58). *(c)* "Sun" label added on both arcs. *(d)* **Continuous realistic sky**: blend weights from sun ELEVATION (`sin(π·progress)`, signed by day/night) crossfade stacked gradient layers — night base → day blue → noon zenith → warm horizon twilight (2.5s opacity transitions smooth the 30s ticks); stars fade in/out with the night weight; the discrete day/night/dusk class survives only for TEXT color + the unknown-sun fallback. *(e)* **Rise/set effects**: two staggered horizon rings per transitioning body (expanding = rising, contracting = setting; sun + moons, both arcs, within 7% of a transition; 3.2s cycle, animating the CSS `r` geometry property) — suppressed entirely under epilepsy-safe (`settings.epilepsySafe` gate at the render sites). *(f)* **Footer polish** (Sekmeht's screenshot: "☀ sets in 44m moonwatch: just now" ran together) — the strip is now three divider-separated facts (☀/☾ sky state · "sun sets in Nm" · feed age), thin `currentColor`-mix borders between items (polish #5), a faint darkened band so it reads as a deliberate bar over any sky, and the feed name as a small uppercase KEY label before its value. *(g)* **Fantasy polish trio + chip spacing (Sekmeht picked from the UX review):** a **horizon silhouette** (two deterministic ridgelines — fixed height table, no randomness, so re-renders never reshape the mountains; drawn before the bodies so rises emerge in front of the peaks); **hover lore-cards** on every body (`<title>`: the in-game moon descriptions Sekmeht supplied + "Rises/Sets at ~H:MM (Nm)" local clock times; polish #8); a **footer "next" chip** (the soonest MOON transition — a sun-next would duplicate the sun's own chip, so moons only); and **countdown-chip collision avoidance** (per-render `placeChip` pass, draw-order claims, estimated widths per the B184 bubble lesson: a colliding sky chip steps down a line, an underground chip flips above its disc — stepping down would exit the viewBox). **Decision (Sekmeht): moons stay STREAM-driven from moonwatch.lic — the proposed Firebase moon fallback is explicitly declined for now** (the sun-anchor fetch, already shipped and approved, stays); recorded so nobody "helpfully" adds it. Remaining review items parked as telemetry asks: moon phases (`perceive moons` prose corpus), Elanthian calendar (TIME verb corpus), weather (Phase-2 corpus), constellations/empty-state-scene/small-caps/Moon-Mage-cues (proposed, not picked this round). *(h)* **⚙ options made accurate + complete (Sekmeht: "why would I want sun & sky?")** — the combined toggle conflated hiding the SUN with flattening the BACKDROP (its `showSun` gated `computeSunPhase` itself, so sky fell to permanent dusk). Now ONE option per visual layer: **The Sun** (disc on both arcs + footer countdown), **Living sky** (gradient blend + stars + the ☀/☾ footer state chip; off = neutral dusk), **Countdown labels**, **Name labels**, **Horizon silhouette**, **Rise & set effects** (AND-gated with epilepsy-safe). `sunPhase` computes regardless of the sun toggle (the sky needs it). Old saves with `hidden.sun` now hide just the sun — the sky returns (intended).

**v0.15.0 — Electron platform upgrade (in progress; pending Sekmeht's full feel pass)**

- **publish.mjs: duplicate-draft race fixed (Sekmeht: "two draft releases; the blockmap is in its own release").** electron-builder's GitHub publisher creates the release LAZILY on the first artifact upload and uploads artifacts in PARALLEL — GitHub allows multiple drafts on the same tag (drafts don't reserve tags), so racing uploads split the artifacts across two draft releases. Fix: the script now **pre-creates the draft** (by tag, with the release notes as body — a draft does NOT create the git tag) so the publisher finds it and every artifact lands in one release; plus post-verification: auto-deletes EMPTY duplicate drafts, refuses (with URLs) if multiple drafts hold assets, and checks the full artifact set (`setup.exe` + `.blockmap` + `latest.yml`) is present before declaring the draft ready. One-time cleanup: delete BOTH existing split drafts on GitHub before the next run. **Follow-up polish (Sekmeht's screenshots):** the pre-created draft was titled `v0.15.0` while every electron-builder release was titled with the PLAIN version (`0.14.7`) — pre-create and the notes-patch now both set `name: version` so the release list stays uniform (the tag keeps the `v`). And the "missing Source code (zip/tar.gz)" links are NOT a regression: GitHub generates those from the git TAG, which a draft doesn't have — they appear automatically the moment the draft is published, identical to the old flow.

- **Electron 31.7.7 → 43.0.0** (Sekmeht — 31 was past end-of-support, no Chromium security patches). The platform leap: **Node 20 → 24.17, Chromium ~126 → 150** (~2 years of runtime). Companions: **better-sqlite3 11 → 12.11.1** (new ABI) + `npx electron-rebuild -f -w better-sqlite3`; esbuild main target `node20 → node24` (comment documents the lockstep rule + the `ELECTRON_RUN_AS_NODE=1 electron -p process.versions.node` check); `@types/node ^24`. **Pre-flight API scan** for known E32–43 breaking changes (File.path removal, registerFileProtocol, systemPreferences, …) found ZERO hits — the only `dataTransfer` use is F46 tab drag (plain DOM). **Verification ladder, all green:** build:main / build:renderer / tsc (2 known errors only) → launch smoke (app alive 12s+ on E43) → **direct native ABI proof** (a diag script inside the real E43 main: better-sqlite3 12 `:memory:` insert/select round-trip — needed because sqliteReader lazy-loads the module, so the launch smoke alone doesn't cover it) → full `npm run dist` packaged clean (`Lichborne-0.15.0-setup.exe`). **Debugging note for posterity:** the first launch smoke "crashed" with `ipcMain undefined` — NOT an Electron break; the tool shell had a leaked `ELECTRON_RUN_AS_NODE=1` from the version probe (which makes electron.exe run as plain Node, so `require('electron')` resolves the npm package's path-string export). Diagnosed via a 3-step fact chain (CJS diag → ESM diag → env check) before touching any code. **Remaining before ship: Sekmeht's interactive feel pass** — Lich spawn (`rubyw` + GTK), SGE direct login, lich.db3 dashboard reads, scroll machinery, multi-window decouple, auto-update flow from a 0.14.x install.

**v0.14.7 — (in progress)**

- **Dependency + packaging hygiene pass (Sekmeht: "anything I need to upgrade? optimize publish.mjs; ready for a task icon").** Semver-safe updates applied (electron-builder 26.15.3, electron-updater 6.8.9, @electron/rebuild 4.1.0, esbuild 0.28.1, js-yaml 4.3.0, react-virtuoso 4.18.10, @types minors); removed the deprecated duplicate `electron-rebuild` and unused `concurrently`. **Runtime `dependencies` slimmed to `better-sqlite3` ONLY** — everything else (react, react-dom, react-virtuoso, highlight.js, js-yaml, electron-updater) is bundled by esbuild/Vite into `dist/` and was being shipped a SECOND time as raw node_modules in the asar; moving them to devDependencies shrinks the installer with zero runtime change (the esbuild `external` list in build-main.mjs is the source of truth for what must stay a runtime dep). **`app.setAppUserModelId('com.lichborne.app')`** set at startup (matches build.appId — Windows taskbar pinning/notification identity; prerequisite for the coming icon). **publish.mjs hardened:** release-notes freshness check (must mention the version), git dirty/unpushed warnings, `release/` auto-create + `.blockmap` cleanup, Bearer auth + pinned `X-GitHub-Api-Version`, paginated release lookup, prints the draft URL. **Icon**: `build/icon.ico` is the drop-in — electron-builder auto-detects it from buildResources (exe, installer, shortcuts) with NO config change; supply a 256px multi-size .ico. **Known-outdated, deliberately deferred (needs its own pass + feel test): Electron 31 → 43** (31 is past end-of-support — no Chromium security patches; the upgrade also pulls better-sqlite3 12.x for the new ABI + esbuild target bump). React 19 / Vite 8 / TS 6 majors are optional, lower priority.

- **Per-panel A+/A− fixed for Genie Maps + full panel-font audit (Sekmeht).** The map ignored the F31 override because its ONLY font-wired text (the SVG landmark labels) read `--game-font-size` DIRECTLY, skipping the `--panel-font-size` chain the A+/A− buttons set (pitfall #58) — fixed to the chain, and the map's other READING surfaces (hover tooltip, legend) joined it via a shared `PANEL_FONT` anchor + em children (SVG node glyphs ↗/tools stay geometry-sized on purpose; map chrome strips stay fixed px). **Audit of every panel root:** stream/room/injuries/exp/compact-exp/lichScripts all correctly chained; the **Debug panel was the other gap** — `rem` throughout (pitfall #45: ignores BOTH the global font and A+/A−); root now anchors the chain with children converted rem→em (×16/12 preserves default sizes). Lich Map view is image tiles (nothing to scale).
- **Experiences get per-window view controls (Sekmeht): A−/A+ font sizing + a ⚙ "Show in this scene" popover.** Hover any Experience window (the Living Tableau) for A−/A+ — a per-instance font override (the F31 model brought to Experiences; seeds from the LIVE global font so the first A+ always grows; 8–24 clamp) applied by shadowing `--game-font-size` on the window's subtree (every Experience sizes text off that var, B182/B184) — and **⚙ opens registry-driven content-layer checkboxes** (`ExperienceDef.options`; Tableau: Speech bubbles / Yells / Whispers / Thoughts / Emotes / Creatures / Arrivals & departures, each with a tooltip). The Tableau gates all layers at its single prop entry point (filtered arrays are useMemo'd — several effects key on `speech`/`moves` identities). Both persist on `ExperienceInstance` (optional `fontSize`/`hidden` — old saves load unchanged; rides scopedKey → YAML → the Transfer Experiences category with zero new plumbing). **Slash surface: no command by design** — these are per-window visual controls whose surface IS the window (an `/experience` noun remains a future consideration, recorded per pre-merge check #5).

- **Room panel redesigned as PROSE (F52 — tester feedback: the structured view read as over-engineered).** Research first: ALL THREE siblings render the room window as the game's own prose reassembled — Genie's `UpdateRoom()` prints the component text verbatim color-coded by roomname/roomdesc presets, Frostbite's RoomWindow is desc+objs+players+exits as plain text (title in the dock title bar), Profanity preserves the native `<d>` exit links clickable. Nobody has buttons or invented section labels. New [RoomPanel](src/renderer/components/panels/RoomPanel.tsx): `[Title]` (+ a **⚔ N creature-count chip**, shown only when creatures are present — counts monsterbold spans, the same approximation as Genie's `$monstercount`; `color-mix` semantic hue, pitfall #55) → description → the component sentences VERBATIM ("You also see …", "Also here: …" — the game's own lead-ins replace the old "Objects"/"Creatures"/"Extra" labels) → a clickable **"Obvious paths: north, east." line LAST** (game order), each word walking on click. The full-word exit BUTTONS are gone; links send FULL direction words (`down`, not the compass token `dn`, which wasn't a valid DR command — a latent bug the buttons carried). **Everything uniquely ours survives** — the prose lines keep the pitfall-#44 paint (contact colors + click-for-card, user match/line highlights, monsterbold) exactly as the main scroll. Theme Editor's Room tab pruned in lockstep (B188 class — no orphaned controls): section-label + 4 exit-BUTTON chrome vars retired; `--exit-text`/`--exit-text-hover` relabeled as the exits-link colors (checked: every theme's `--exit-text` is a saturated mid-tone, readable directly on panel backgrounds). Old custom themes carrying the retired vars load fine (inert). Deferred for tester reaction: dead-creature dimming, a hunter "compact room" option (title/creatures/players/exits only).
- **F52 follow-up (Sekmeht's Weaving Room screenshots): the exits line is now the GAME'S OWN sentence — incl. "Obvious exits: none."** The first cut composed the line from compass tokens, which guessed the paths-vs-exits wording and showed NOTHING for an exitless room (the game and Genie both show "Obvious exits: none."). Per Sekmeht's "look at how Genie does it — don't invent new ways": the parser now CAPTURES the `room exits` component it used to skip (`room-exits-text` event → `RoomState.exitsText`, replay-snapshotted, cleared on the B121 room transition), the panel renders the sentence verbatim with compass-confirmed words linkified, and **Genie's exact normalization** (Game.cs 978–988) is adopted — DR sends the BARE label for exitless rooms; Genie appends `" none."` + a trailing period itself, and reading Genie's source caught that detail (a verbatim display alone would have shown a dangling "Obvious exits:"). Compass stays authoritative for tokens/map; composed line is the not-yet-arrived fallback. Parser harness: dirs/bare-label/empty-clears all pass.

**v0.14.6 — Slash Commands Phases 2–3 + Managed Named Colors (F51) ✅**

- **Slash Commands Phase 2 (DESIGN §37.5) — the registry grows from 17 to 28 commands.**
  - **`/alias add "hh" "health;heal" [delay=ms] [passthrough]`** + remove/list/edit — expansion splits on `;` into `commands[]`; duplicate inputs rejected; numeric delay validated.
  - **Trigger quick-form `/trigger add "pattern" do "command" [mode=] [cooldown=s] [once]`** + remove/list/edit — the literal `do` is optional sugar; fills `newTrigger`'s built-in command action; gates/multi-action stay editor territory (the confirmation says so); regex validated at add.
  - **`edit` verbs on all five rule nouns** — `/highlight|mute|sub|alias|trigger edit "pattern-or-name"` opens Automations at the right tab with the rule SELECTED: the TriggersPanel `openRuleId` effect replicated onto HighlightsPanel/MutePanel/SubstitutesPanel + MacrosPanel (`openAliasId` with `initialTab='aliases'`); AutomationsPanel threads four new `*OpenId` props; GameWindow keeps ONE `slashOpenRule {tab,id}` state (triggers merge with the Fires-GOTO `triggerOpenId`), cleared on close; `SlashContext.openRuleEditor` is the executor surface.
  - **Palette:** `/sub add` shows a live **before→after** preview (real `buildSubstituteRegex`; text/phrase modes only), and **value-completion chips** — a new `live: SlashLiveData` prop ({ templateNames } from `contactTemplates`) renders the user's real template names as click-to-fill chips when `/contact add`'s template slot or `/template remove`'s target is open (registry stays pure; live data rides the prop).
  - Slash-added aliases/triggers arm IMMEDIATELY (aliases via the `aliasesRef` mirror; `useTriggerEngine(triggers, …)` compiles from the state the executor sets). Verified: 30+-case executor suite + 18-case ranking suite against the real bundle (bare `/t` now tie-breaks to `/trigger add` — trigger precedes template/timestamps in registry order; `/ts`/`/tr`/`/te` stay deterministic); build + tsc green (2 known pre-existing errors only).
- **Slash Commands Phase 3 (same day — the "soak first" hold was reversed; Sekmeht). Registry: 28 → 38 commands.** Client control: **`/mode [name]`** (bare lists with the active marked; `none` clears — via the per-session GroupsContext, whose destructure in GameWindow grew `groups`/`toggleGroup`/`clearMode`; rule gating updates automatically through `activeGroupStates`), **`/group on|off|list`**, **`/panel open|close|list`** (pitfall-#79 mode branch: free mode generalizes `toggleFreeDebugWindow`'s shape by stream id, panels mode focuses the holding zone or `addToZone(id,'bottom')`; case-insensitive match, CANONICAL-id open per Principle #5), **`/theme [name]`** (= ThemePicker's `onThemeChange`; id-first resolution — `/theme classic` is deterministic; shared-name-not-an-id errors with ids, pitfall #35), **`/log search ["text"]`** (the Show-in-Log pattern: query + remount nonce + open), **`/clear`** (the context menu's `clearLines` — no confirm; the Session Log keeps everything). Value-completion chips extended to mode/group/stream/open-panel/theme-id names (`SlashLiveData` grew; chips capped at 24). Three open design calls settled + recorded in DESIGN §37.5. Verified: 60+-case executor suite (incl. mode list/switch/clear, group idempotence, panel open-focus-close + canonical-casing, theme id-vs-ambiguous-name, log search, clear) + 18-case ranking suite; build + tsc green (2 known pre-existing errors only).
- **Slash list polish + a real cross-window fix (Sekmeht: "make sure the current-theme indicator shows correctly").** Verifying the `/theme` ● indicator found a REAL staleness bug: `getCurrentThemeId` read GameWindow's `currentThemeId` STATE, which goes stale when the theme is switched in ANOTHER window (the cross-window storage listener re-applies the theme to the DOM but deliberately doesn't update other windows' state) — the ● could mark the old theme. Fixed with a fresh `localStorage['lichborne.theme']` read (the value `applyTheme` writes on every switch — the truth). Same pass, per Sekmeht: the **● active-indicator is now on EVERY stateful list** — `/mode` (active mode), `/group list` (on groups), `/panel list` (open panels, ● rows first then · available), `/theme` (current) — each with a self-explaining legend in the header (`● = active/on/open/current`, polish standard #8). And `/mode list` + `/theme list` now work as list sugar (users type them by analogy with the other nouns; a real mode/theme actually NAMED "list" still wins the match, so the sugar can't shadow it).
- **Final slash bug-check + novice /help pass + `/colors` (Sekmeht).** A holistic re-read of the full module found ONE real bug: `resolveColor`/`looksLikeColor` used bare `NAMED_COLORS[t]` / `in` lookups, which walk the prototype chain — `/highlight add "x" constructor` resolved `Object.prototype.constructor` (a FUNCTION) as a "color" and stored it into the rule. Fixed with `hasOwnProperty.call` (the `hasColor` guard). Everything else traced clean (quoted enums, empty `key=`, unterminated quotes, flags-vs-quoted, the trigger do-keyword edges). **`/help` rewritten for novices:** bare `/help` is now ONE plain-language row per noun (16 rows + a syntax primer: quoting, `key=value`, colors, the `//` escape, palette keys — was a 38-line per-command wall), driven by a `NOUN_HELP` blurb map (new noun ⇒ add a line; a missing noun falls back to the entry description so nothing is ever omitted); `/help <noun>` now spells out every arg/option HINT (the palette's hints, readable at leisure) + a bracket legend; `/help <noun> <verb>` narrows to one entry, and a bad verb lists the real ones. **`/colors` (aliases /color, /colour(s)):** lists the named colors each drawn IN its color — built on a new rich-line capability in `SlashResult` (`SlashLine = string | {rich: [{text, color}]}`; GameWindow maps color → `TextSegment.fg`, inline-beats-preset per B200; `slashLineText()` keeps the Session Log plain). grey folds into the gray row; color hints + the /help primer now point at `/colors`. Suites: 71 executor + 18 ranking cases, all green.
- **Managed named colors — curated, user-extensible, accepted EVERYWHERE (Sekmeht; supersedes the same-day "slash-only" scoping).** New [colors.ts](src/renderer/colors.ts): three tiers resolved curated → custom → web → #hex. Curated = the readable 16 (unchanged values); **custom** = `/colors add "ember" #ff6a30` / `/colors remove` (app-wide like themes — `SharedProfile.customColors`, optional field, non-breaking; can't shadow curated; re-add updates); **web** = the full standard CSS set (~148) accepted-not-listed — **Genie's vocabulary** (research: Genie `ColorCode.cs` takes every .NET KnownColor name; Frostbite is picker-only; Profanity terminal ids). **Resolve-at-entry semantics** (rules/themes store hex; palette edits don't retro-update — live references deferred). **Phase B — names accepted in the editors:** every editor already pairs a free-text field with its picker (Highlights ×3, Contact templates ×4, Groups ×1, Trigger echo ×1) — all now resolve names via `normalizeColorInput` on BLUR (on-change would hijack "red…" while typing "rebeccapurple") with a shared tooltip; the Theme Editor's text field takes names too (draft + commit; live #hex typing unchanged; **theme vars still store hex**). Palette color slots offer curated+custom as chips drawn in their colors; `findCommand` now lets a noun have BOTH a bare form and verbs (`/colors` lists, `/colors add` manages — verb wins, bare is fallback). Suites: 85+ cases green (curated-beats-web lime, dodgerblue resolution, shadow/removal guards, update-in-place). **`/colors list` (Sekmeht):** the comprehensive view, organized by PLATFORM CATEGORY — `■ Curated (16)` / `■ Custom (N)` / `■ Web (148)`, each with a count + one-line explanation, names drawn in their colors in a compact 4-per-row grid (~40 rows, not 164); the Custom section shows even when empty (consistent shape + teaches `/colors add`, polish standards #2/#8); bare `/colors` stays the quiet short list with hex values and points at `list`.
- **Colors bug-check + theme-contrast pass (Sekmeht: "consider how the / text could appear with light/dark themes").** The real UI/UX finding: color-swatch text drawn IN its own color vanishes when its luminance sits near the surface it renders on — `black`/`navy` invisible on dark themes, `white`/`ivory`/`snow` (plenty in the web set) invisible on light ones; the palette's colored chips (on `--bg-raised`) had the same disease. Fix: **`hexLuminance` + `contrastBackingFor(hex, surfaceVar)`** in [colors.ts](src/renderer/colors.ts) — when |color L − surface L| < 0.18, the segment/chip gets a neutral backing chip (light colors → dark `#2a2e35`, dark colors → light `#e9e9e9`; most colors need none), reading the LIVE theme's surface var so it adapts per theme (pitfall #34 family, solved with data not CSS since the colors are user data, not theme vars). Applied at BOTH render sites: `runSlashLine`'s rich-segment mapping (`seg.bg`, vs `--bg-app`) and the palette chips (inline bg, vs `--bg-raised`); node-guarded for the harness (dark-surface assumption). Verified in node: black/navy/#222 → light backing, white/red → none. Also hardened: ThemeEditor's name-draft resets when the var changes externally (picker/reset can't be masked by a stale half-typed name). Per Sekmeht + polish standard #8 (UI explains itself), `/colors list` carries a one-line note explaining the contrast bars ("a reading aid for this list, not part of the color"). Rest of the trace was clean: blur-before-click ordering in the editors, `normalizeColorInput` passthrough semantics ('transparent', partial hex), Transfer merge idempotence across multi-target imports, 3-digit-hex customs, node-safe module guards. New **"Named Colors"** Transfer category (the myThemes shared-data precedent): export carries the machine's app-wide `customColors`; import MERGES into the target machine's shared palette (union; same-name → imported value wins — checking the category is choosing the exporter's palette), persisted by the modal's existing post-import `_shared.yaml` flush; resolve-at-entry means transferred rules never depend on the merge. **Found while wiring it:** `applyProfileImport`'s `order` array + switch never included `experiences` — the category (v0.14.0) exported fine and showed as a checkbox, but importing it silently applied NOTHING. Fixed (added to order + an `applyPlain` case) and the order array now carries a comment: every `TransferCategoryId` must appear in BOTH the order and the switch, or it's a silent no-op. New **CLAUDE.md Principle #11** + **pre-merge check #5** (the checklist is now five questions) + **DESIGN §37.7** maintenance contract: every new user-facing feature gets its `/command` (or a recorded "no command because X"), and every feature change updates the registry's executors/hints/summaries/completion values in the SAME change — a drifted command is a shipped bug (stale-tooltip class). Retroactive sweeps now include a registry drift pass.

**v0.14.5 — GTK verified + retroactive sweep + Slash Commands Phase 1 (F48) + toasts ✅**

- **Ruby GTK script windows VERIFIED WORKING (Sekmeht, 2026-07-03).** The v0.9.1 GUI-subsystem spawn shape (`rubyw.exe`, no `windowsHide`, no stderr pipe) is empirically confirmed — GTK script windows paint and behave correctly. The "pending verification" caveats were cleared from CLAUDE.md (GTK architecture note), DESIGN.md (launch section), BUGS.md (Known Limitations row → resolved), and README.md; GTK support is now a confirmed capability, not a bet.
- **v0.14.5-boundary retroactive sweep (v0.14.0 → v0.14.4).** Full code-read sweep per the CLAUDE.md protocol. Verified clean: Automation Analytics lifecycle (flush/prune/interval cleanup, cross-window toggle via storage + custom event), all command sends via `sessionIdRef.current` with the B199 `sendCommandRef` bridge intact, B194 prompt-collapse ordering + replay behavior, RT/CT/Aim `pending*End` resets in `parser.reset()`, B200 `overrideColor` × B195 substitute-collapse interplay (line style computed at render, post-substitute; collapse copies visual fields only), Experiences perf gate (re-arms on sessionId change, backfills cast), Transfer allowlist (`experiences` in; `automationStats`/`detectedGuild` deliberately out. **One real finding, fixed** (below); two papercuts noted, not fixed: the Automations header's analytics checkbox doesn't refresh from a cross-window toggle (the runtime `analyticsEnabledRef` DOES — cosmetic, needs two Automations panels open in two windows) *(Superseded in v0.19.8 — F119 split that header into two rows; that control is now a row in the header's ⋯ menu, and the papercut is unchanged — it is about the refresh, not the position. Left as the record of what v0.14.4 shipped.)*, and after a main-text Clear the `lastMainLineRef` prompt survives so a first identical prompt via the mute-collapse path could be dropped onto an empty screen (nil severity).
- **Session Log now records panel-sourced + trigger commands (sweep finding).** The canonical echoing `sendCommand` ([GameWindow.tsx](src/renderer/components/GameWindow.tsx)) painted `>cmd` and sent, but never called `logToSession` — so map walks, room-exit clicks, in-text command links, and (since B199 routed them here) trigger `command` actions appeared on screen but not in the Session Log; a logged walk read as the game narrating rooms with no commands. Fix: the callback now logs the same `[cmd]` record the typed/macro paths write, giving log↔screen parity across all three send funnels. Respects the existing "capture commands" setting + replay gate for free (both live in `logToSession`; it reads only refs + fresh settings + the immutable `session.character`, so the `[]`-deps capture is safe). DESIGN §28.2 updated.
- **`resetStats` quota-guarded.** The Analytics Reset write now follows the module's "background telemetry never throws" rule (try/catch + warn, like `flushNow`) so a full-storage origin (the B197 scenario) can't turn the Reset click into an error — the in-memory cache resets either way, and the tiny empty-map write over an existing key is a net shrink anyway.
- **Slash Commands Phase 1 (F48, feature — DESIGN §37).** Typing `/` in the command bar opens a completion **palette** (command list → argument hints with live validation + a live highlight style preview; Tab completes, Enter submits, Esc dismisses); `/highlight add "goblin" red`, `/mute add`, `/sub add`, `/timestamps`, `/help`. A `/` line NEVER reaches the game (unknown → fail-closed hint; `//` escapes a literal `/`). Built as a declarative registry ([slashCommands.ts](src/renderer/slashCommands.ts)) driving parser + palette + `/help` from one source (the §35 registry philosophy); intercepted at the top of `dispatchUserText` (pitfall #31); executors reuse the panel save rails (`saveX` → `setX` → `saveProfile()`, `newX()` factory defaults, `allGroups: true`) so slash-created rules are byte-compatible with editor-created ones; result lines echo as `internal-system` client text + log to `[sys]`. Palette is portaled ([SlashPalette.tsx](src/renderer/components/SlashPalette.tsx), z 130) so it works in Static AND Windowed layouts; sized off `var(--game-font-size)` (pitfall #45b). QuickSend deliberately does NOT interpret `/`. **Completion is RANKED, not first-registered (Sekmeht, same day):** `/highlight l` + Tab must give `list`, but "l" is also a substring of "high·l·ight" so every verb matched equally and Tab took registry order (`add`). `scoreEntry` now ranks match QUALITY (exact part 100 > verb prefix 80 > noun prefix 60 > verb substring 30 > noun substring 20 > description 10), the list sorts best-first, and the selection resets to the top match on every edit — Tab always completes what the user was typing (verified against the real registry: 10-case ranking test incl. `/hl l`, `/sub r`, `/t`). Phases 2–3 (alias/contact/trigger quick-forms, mode/group/panel/theme control) planned in §37.5.
- **Toast notifications (DESIGN §37.6).** Themed non-blocking toast stack ([toasts.ts](src/renderer/toasts.ts) dispatch + [ToastHost.tsx](src/renderer/components/ToastHost.tsx) mounted once per window in App): info/success/error kinds, auto-dismiss, click to close, capped stack, `color-mix` semantic hues (pitfall #55 pattern). First consumer: `safeSetItem`'s quota warning — was a renderer-freezing `window.alert`, now an error toast with the same one-shot semantics. Future consumers: Transfer/import completions.
- **Slash Commands: `/contact` + `/template` (same release, Sekmeht).** Six new registry entries: `/contact add "Bob" Friends` (positional sugar = template name; `guild=`/`notes=` options; on an EXISTING contact with a template/field given it UPDATES — "add a name to a template" is one gesture either way), `/contact remove|list`, `/template add "Watchlist" orange tag="[W]" bold` (contact templates; live tag+name palette preview like highlights), `/template remove` (panel-parity: contacts keep entries with a dangling templateId; member count reported; built-in removal notes the default-resurrect), `/template list` (with member counts). Decided behaviors + rationale in DESIGN §37.2. Contact applies use the pitfall-#36 blessed path (`saveContacts`+`setContacts` together → B119 cleanup drops the room-tracking buffer); template names must EXIST on `/contact add` (typos fail closed listing the real names — no silent template minting); names normalize to one capitalized word. **`saveContacts`/`saveContactTemplates` quota-hardened with `safeSetItem`** (B197 family — they were still bare `setItem`, and a single Frostbite names import mints 151 contacts). Verified: 22-case executor test + 15-case ranking test against the real bundled registry (bare `/t` now tie-breaks to `/template add`; `/ts` stays deterministic for timestamps via its exact alias).
- **Slash bug-check pass (same day, Sekmeht asked for a check of the session's work).** Full trace of the new surfaces found TWO real bugs, both fixed + regression-tested: **(a)** `parseSlash`'s required-arg check was `=== undefined`, so `/highlight add ""` (or whitespace-only) minted a DEAD empty-pattern rule (compiles to null — clutters the panel, shows as "broken" in Analytics). Required args are now also required NON-EMPTY unless the spec opts out via the new `allowEmpty` — set on exactly one arg, `/sub add`'s replacement, where `""` is meaningful ("delete the text", the Genie model). **(b)** `listRules`' >15 overflow hint hardcoded "see the Automations panel" — wrong for `/contact list`; it now takes a `where` param (contacts → "the Contacts panel"). Everything else traced clean: palette lifecycle on hidden tabs (0-width guard; no focus = no keys), Esc-dismiss/reopen-on-edit wiring, `//` fall-through, contact applies vs the B119 room-tracking buffer (blessed path + React commit ordering), toast timer cleanup + per-window semantics, no characterScope↔toasts import cycle, `internal-system` echo + `[sys]` logging.

**v0.14.4 — Automation Analytics + tester-fix batch (B197–B200, F47) & polish**

- **Automation Analytics (feature, DESIGN §36).** Self-tuning layer over the user's native automations. App-wide master toggle (`SharedProfile.automationAnalytics`, off by default) in the Automations header. *(Superseded in v0.19.8 — F119 split that header into two rows; the toggle is now a row in that header's ⋯ menu, which wears an accent dot while it is on. Left as the record of what v0.14.4 shipped.)* **Static health** ([automationHealth.ts](src/renderer/automationHealth.ts)): broken / duplicate / no-op / key-or-name conflict per rule type, reusing `buildXRegex`. **Runtime usage** ([automationStats.ts](src/renderer/automationStats.ts)): per-rule fire counts, in-memory + debounced `safeSetItem` flush, per-character (excluded from Transfer); hooks ride existing per-line work (trigger `onFire`, highlight Debug-scan, mute/sub `onFired`, macro/alias resolve-time — `resolveMacro`/`resolveAlias` now return `ruleId`). UI ([AutomationAnalytics.tsx](src/renderer/components/AutomationAnalytics.tsx)): per-row badges + a full-width **collapsible** Review banner (per-category `<details>`, 200-cap), working jump links, and a **"Remove duplicate copies"** bulk action. Off → zero cost.
- **B197 — delete-recreates FIXED (root cause: localStorage quota).** JadedSoul/Sekmeht: deleting a highlight "recreates"/duplicates it; persists across restart; 3436-highlight import. Built `tmp-dedup-repro` (since removed) bundling the REAL load/save + full localStorage→YAML→reload+restart round-trip — **proved the data path CLEAN** (delete 2→1, stable), eliminating load/save/profile. Confirmed chain: 3436 highlights × several chars > ~5MB quota → bare `setItem` THREW → delete's write silently lost → reopen reloaded the stale list ("came back"). Fix: all 6 rule saves route through `safeSetItem` ([characterScope.ts](src/renderer/characterScope.ts)) (catches quota, one-shot alert → dedup tool, no silent fail); the **"Remove duplicate copies"** action replaces the huge key with a much smaller value (net decrease, saves even when at quota) to get back under the cap. `[hl-diag]` scaffolding removed once confirmed. Pitfall #90.
- **B198 — profile-export filename next-day date + silent overwrite FIXED.** Two parts: `defaultExportFilename` ([profileTransfer.ts](src/renderer/profileTransfer.ts)) stamped the date from `toISOString()` (UTC) → rolled to tomorrow for users west of UTC in the evening — now built from LOCAL parts; and `profile-transfer:export` ([main.ts](src/main/main.ts)) silently overwrote a same-named export — now collision-safe (`-2`/`-3`… before `.lb.yaml`, Principle #3).
- **Analytics refinements (post-feature, same release).** **Obsolete detection** is COVERAGE-based per Sekmeht's model — a text/phrase rule is "obsolete" when a REGEX rule fully matches its pattern, scope/style-agnostic (`m[0]===lit` full-match guard so a partial overlap isn't flagged); framed as REVIEW ("may change styling"), not "safe to remove". **In-UI explanations** added (CLAUDE.md UX/UI polish standard #8): every health category has a `title` tooltip + a visible description WITH examples, shown even when the category is empty (was "It's not apparent at all through the UI", Sekmeht). **Storage bounded:** the stats map's only unbounded vector — orphan entries from deleted/re-imported rules — is closed by `pruneStats(character, liveIds)` (drops ids not in the union of all six rule lists, run on Automations open); the flush is `try/catch'd` (background telemetry never alerts/throws); **Reset + prune persist to YAML** (via the panels' `onSaved`) so a clear isn't re-seeded from YAML on next launch. Plus a UX polish pass (quiet-by-default badges, severity-ordered chips, report-card sections, collapse-on-scroll fix by hoisting helper components). Pitfall #90; DESIGN §36.
- **F47 — main-window timestamps (Morress).** Right-click the main game text → "Enable/Disable Timestamps" — reuses the existing per-character `streamTimestamps` map + `toggleStreamTimestamp('main')` (scopedKey + saveProfile; off by default; rides Profile Transfer's Panel View Preferences). `TextLineRow` already renders the `[HH:MM]` prefix, so no new rendering. No profile-shape change.
- **B199 — trigger "command" actions now echo `>cmd` (Sekmeht).** `triggerCallbacks.sendCommand` was a RAW `window.api.sendCommand` that skipped the `setLines` echo, so a trigger sending `smile` showed only the game's reply. Fixed by routing it through the canonical echoing `sendCommand` via a latest-closure `sendCommandRef` (it's defined later in the component → TDZ). Now consistent with typed/macro/alias/map commands. Pitfall #86 (inverse signature: game responds but no `>cmd` = a raw-send path).
- **B200 — Line highlights override preset-colored text (Cherisse).** `getLineHighlightStyle` only colored the `.text-line` CONTAINER, so preset-colored segments (thoughts/speech/lnet/substituted lines) rendered their own color on top and the line highlight was invisible. Fix: thread the line-highlight's text color as an `overrideColor` into `renderSegment`/`renderSegmentFull` (the non-match runs render it inline, beating the no-`!important` `[data-preset]` CSS; preset bg/italic + bold/links kept; match-scope runs still punch through; contacts keep template color). Applied at `TextLineRow` (main + stream panels) + `RoomPanel`. Sekmeht: "make any highlight override it" — match-scope already did.
- **Favorites heartbeat (Sekmeht, cosmetic).** The filled `♥` on characters pinned in the launcher's Favorites section now beats with the Genie map Auto-Healer's ECG double-beat rhythm (scale pulse, 1.2s; CSS-only, scoped to `.launcher-section--favorites` so the duplicate hearts on account/game cards stay still). Not gated on `prefers-reduced-motion` (matches the healer, which isn't).
- **QuickSend autofocus hardened (Morress repro).** The modal's mount focus is now deferred to a `requestAnimationFrame` so it can't lose the race to whatever opened it (button/prompt-marker/menu) — addresses an intermittent "couldn't click into the box until I touched the dropdown."

**v0.14.3 — Compact Exp panel + Aim Timer + text-mod & group fixes ✅**

- **Compact Experience Panel (Rakkor/Morress, feature).** New per-character `settings.compactExp` (default off) renders a text-forward Exp view — Skill · Ranks · % · (mindstate/34) rows tinted by mindstate, a summary top bar (Learning count · TDP · Fav) and bottom bar (reset · RXP · Usable) — no bars/pickers/groups. Pure render switch inside `ExpPanel` (reuses every parser); threaded via the B193 `sharedFrameProps → PanelFrame → renderPanel` pattern so it works in all three hosts. Pin-to-top kept as a hover `◈`; the Badging ★ dropped (every trained skill is badged → noise). DESIGN §5.8.
- **Aim Timer (DR `firingTimer`, feature).** New `<dialogData id='AimTimerDialog'><timer id='firingTimer' value='N'/>` → `aimtime` event → green bar/chips in the command bar, in the SAME spot as CT, painted BEHIND it (CT always wins; aim only sticks out when longer — chips are 1/sec, the bar is scaled to CT's max for absolute comparison). Server-clock anchored on the next `<prompt>` exactly like RT/CT (pitfall #87). Honors the existing `timerStyle` (bar/chips) — no new toggle (the in-game `toggle aim` is the on/off). Snapshotted for window-takeover replay; color theme-editable (`--aim-*`, green). Parser + types + `useTimers` + `TimerDisplay` + CSS + ThemeEditor HUD. DESIGN §5.4.
- **B194 (Cherisse) — muted lines orphaned `>` prompts.** Mutes run a layer after the parser's prompt dedup, so a muted regen left its trailing `>` (several piled up). Fix: replicate the parser's identical-prompt dedup at the display layer AFTER mutes (parser tags prompt lines `prompt:true`; GameWindow collapses consecutive identical prompts, tracked across batches). Genie/Frostbite gag at the display layer before the prompt commits. Pitfall #88.
- **B195 (Cherisse) — substitutes didn't fire on native Gweth/thoughts (only lnet).** A DR thought is split into two segments at the `<preset>` boundary; substitutes ran per-segment so a line-spanning regex matched neither half (lnet is one segment via Lich). Fix: per-segment pass first (keeps styling for in-segment matches), then a joined-line pass — on a cross-boundary match, collapse to one segment styled like the first. Pitfall #89.
- **B196 (Cherisse/Agan) — group roster spammed main; "Grouped" chip per-character.** Removed `group` from `STREAM_FALLBACK` (it's a clears-and-rewrites roster, not a message log — routes to its own buffer now, no main spam). Verified the `IconJOINED`/`J>` asymmetry is DR's protocol (only the FOLLOWER is "joined", not the leader) and renamed the chip "Grouped" → **"Joined"** to match.
- **B193 (Sekmeht) — Debug → Fires "Edit →" button greyed out in Windowed Panels.** Threaded `onGotoFireRule: gotoFireRule` through `sharedFrameProps` → PanelFrame → `renderPanel` → DebugPanel (raw, so the per-entry disable still holds). Same dual-hosting trap as B166 (pitfall #79 family).

---

**v0.14.2 — RT/CT clock-skew fix ✅**

- **B192 (Aubrey) — RT/CT bar maxed out and counted down from a huge number.** Not a parse bug: the raw XML proved the server value was correct (`value − prompt time = 4 sec`). Root cause was **client/server clock skew** — the bar compared the server's absolute end-time to the LOCAL `Date.now()`, and Aubrey's PC clock was ~1–2 min behind (stale NTP), inflating `rt` by the skew. Confirmed by her clock check ("Sync now" fixed her). Robust fix: anchor RT/CT to the SERVER clock via `<prompt time>` — `<roundTime>/<castTime>` defer to the next prompt, `expires = Date.now() + clamp(end − promptTime, 0, 300s)*1000` (duration from the server, local clock only as the countdown anchor → skew cancels). **Verified Frostbite (`xmlparserthread.cpp`) and Genie (`Game.cs`) both do exactly this** before implementing — neither uses the local clock. Recorded as pitfall #87 with the client-quality framing: a server-vs-`Date.now()` comparison is a latent clock-skew bug, and a visibly-wrong timer reads as a broken client even when the fault is the user's PC.

---

**v0.14.1 — Living Tableau incremental pass + macro/compass fixes ✅**

- **Tableau overhaul ATTEMPTED then PARKED.** A larger rework (engagement-field re-layout + verb-interaction arrows + a "calm-stage" stable-rows rewrite) was built, then reverted on Sekmeht/Morralles feedback ("the 0.14.0 way is good — make incremental changes, not a major overhaul"). The full overhaul is preserved on the **`wip/tableau-overhaul`** branch for cherry-picking. v0.14.1 keeps the v0.14.0 Tableau + five small keeps: individual **monsterbold creature figures** (one per critter, `deadCount` greys corpses, >10 → "+N more"), the **self figure wearing its indicator states** (hidden/invisible/dead/condition-ring + chips, via a new `indicators` Experience prop), **clickable contact figures** (✦ + `onOpenContact`), cross-layer **window snapping** (B185), and scene bg matching the panel surface (B186). Phantom-"leaves"-name fix kept (B187).
- **B188 (Morress) — Theme Editor → Experience colors were orphaned.** Wired "Rate"/"Mind-locked rate"/"Bar background" to the exp panel; removed dead controls (inactive-indicator, compass center-marker). Audit lesson: every editor `c('--x')` must have a CSS `var(--x)` consumer.
- **Maps — "you are here" ring shrunk** to sit on the node (Genie + Lich) so it stops covering neighboring room labels; the translucent sonar pulse still radiates (Sekmeht).
- **B189 (Morress) / B190 (Binu) — command sends + compass.** Macros, automapper right-click walks, `;go2`, room-exit buttons, and trigger-fired commands echoed but didn't reach the game **after a tab reconnect** — root cause was a stale `session.sessionId` captured in held closures (pitfall #69); fixed by routing every send through `sessionIdRef.current`. **A self-inflicted regression** during that fix (a comment Edit deleted `sendCommand`'s actual send call; build + tsc both passed) shipped to a tester and is recorded as pitfall #86 — the learning: build/tsc don't catch a deleted side-effecting call; re-read the whole function body after editing it. Compass now clears exits for a genuinely exitless room (empty `<compass>` on the main stream).
- **B191 (Sekmeht) — spurious "New Lines" badge on the active char after tabbing to another Windows app** (not minimizing). Same class as pitfall #71 (occlusion throttles rAF even with `backgroundThrottling:false`): `stickToBottom`'s settle loop stalled, its suppress window expired before Virtuoso's async last-row measurement, and the late scroll event un-pinned with no user action; `onRefocus` bails when un-pinned so the badge stuck. Fix: `handleVirtuosoScroll` returns early while `document.hidden` (a user can't scroll a hidden window — any scroll signal there is layout, not intent). Background chars (`display:none`, 0×0) were immune, matching the report. Investigated as a 5-confirmed-link + 1-labelled-inference fact chain.
- **Validation pass + working-practice docs.** Traced the whole command-send pipeline end-to-end (all ~10 renderer entry points → `sessionIdRef.current` → main `getSession` → `connection.send` + `\r\n`), plus the room-state pump and the SceneParser path — all sound, revert left no dangling scene wiring. Added the **`tmp-cmd-harness`** machine-local regression harness (bundles real `macros.ts`, asserts the resolution core incl. Morress's exact macros; proven to catch a numpad-mapping break) and documented the outgoing command-send pipeline in CLAUDE.md as the dual of the game-text pipeline. Codified the investigation methodology (fact-chain, no pattern-matched fixes) and **Principle #10 (evidence over guesses — name a guess as a guess; agree before going in blind)** in CLAUDE.md.

---

**v0.14.0 — Lichborne Experiences platform + Living Tableau [Beta] ✅**

- **Lichborne Experiences (DESIGN §34):** a first-class layer of registered graphical floating surfaces over the game layout, hosted by the v0.13.0 FloatingWindow engine (both layout modes), with an app-bar shelf, own id space + scopedKey persistence + a Transfer category. Panel/stream system untouched.
- **Living Tableau (X1) [Beta]:** the room as a living scene — procedural avatars at stable seats (Contact-colored), speech comic-bubbles (say/ask/yell/whisper/thought-wisps/emote-captions), conversation gravity, choreographed arrivals/departures, crowd amphitheater + "+N others". Built on the new **`SceneParser`** capturer registry (DESIGN §35) — typed scene events extracted in `sceneExtract.ts`, corpus-verified, all gated OFF until an Experience is open (§35.6 perf contract).
- **B184 — exp panel Badging auto-detects guild** from the `info` sheet (`character-guild` event), own-sheet authoritative.

---

**v0.13.5 — More-menu stacking-context fix + drag-to-reorder stream tabs ✅**

- **B179 — the app-bar's More ⋯ menu rendered as a "tiny stub" behind the game content** (first build after B178; Sekmeht). Precise mechanism: `container-type: inline-size` (added for the B178 degradation tiers) applies layout containment, which forces `.app-bar` to become its own STACKING CONTEXT — the dropdown's `z-index: 9999` became internal, and the bar itself sat at `z: auto`, so the game pane painted over the menu. **Fix:** lift the bar's whole context — `position: relative; z-index: 70` (game content + WindowLayer ≤ 60, overlays/modals ≥ 100; verified against the full z-index inventory). Portaling the menu was REJECTED: the B178 `--overflow` items are gated by the bar's own `@container` query and a portal breaks descendance. General trap recorded: making an element a query container traps its absolute dropdowns — audit popovers (the tab ContextMenu is portaled = safe; the exp pickers are clipped by their panel either way).
- **F46 — drag-to-reorder stream tabs** (Sekmeht). PanelFrame tabs are draggable behind a `reorderTabs` prop: HTML5 drag, LIVE reorder on sibling-midpoint crossing (with the vacancy adjustment + same-target bail so the strip doesn't jitter), committed through the SAME `onTabsChange` path add/close use — persistence came free in both modes (zone scopedKeys / window `tabs` → freeWindows → YAML). Windowed mode gates on `!freeLayoutLocked` (Lock freezes layout; tab order is layout — consistent with F44); static zones always allow (Panel Manager arrows remain). **Snappy-feedback polish:** neighbor tabs FLIP-slide (~120ms ease-out; a `useLayoutEffect` remembers per-tab left edges and animates mid-drag position changes only — add/close/tab-switch renders never animate; the dragged tab is excluded so its ghost snaps) and the ghost carries an accent dashed outline marking the landing slot. Scope: reorder WITHIN one strip; cross-window tab drag is a future feature. No profile-shape change.

---

**v0.13.4 — Scroll-hop root cause (line-cap hysteresis) + ruleset-scale performance + windowed tab-switch teardown + narrow-window support ✅**

A heavy fix release driven by live tester sessions (Sekmeht, Binu, Morress, Rakkor) — eight B-numbers, three new pitfalls (#81–#83):

- **B171 — the long-unsolved "text hops at the bottom after a while," finally root-caused: the MAX_LINES (2000) scrollback cap.** Holding `lines` exactly at the cap with a per-batch head-trim broke the pinned hold two ways (verified with a post-paint simulation harness, `tmp-scroll-repro/`): react-virtuoso's size cache is keyed by INDEX, so uncompensated head-trims shifted every row per batch (painted content jumped backward up to ~8 lines); and with the count constant, `totalListHeightChanged` — the only per-batch re-pin trigger — collapsed from ~2.0 to 0.7 calls/batch. **Fix: hysteresis trimming** — `appendTrimmed()` grows the buffer to `MAX_LINES + TRIM_CHUNK` (2400) then cuts to 2000 in ONE slice; all six `setLines` sites route through it. 0 hops in the harness. Virtuoso's `firstItemIndex` was tested and REJECTED (its compensating scrollBy races our pinning). Pitfall #81.
- **B172 — "chunky, not smooth" travel floods with big imported rulesets (1,544 highlights / 905 regex-mode).** Four fixes: **(a)** conservative literal extraction for regex-mode rules (new [regexLiteral.ts](src/renderer/regexLiteral.ts)) so the `includes()` fast path gates them too — 629/906 of the real ruleset gated, 0 correctness violations, validated against the actual profile (+ fixed latent over-gating of multi-word text rules); **(b)** main's `scheduleFlush` got leading-edge coalescing (16ms) — one renderer batch per frame during floods instead of one per socket chunk; **(c)** the line-wide highlight scan runs ONCE per line (`computeLineMatchRanges`) instead of once per segment; **(d)** StreamPanel/RoomPanel/ExpPanel/MapPanel memoized with stabilized props + the two context provider values useMemo'd (inline literals were re-rendering every consumer per render). Pitfall #82.
- **B173/B175 — clear+rewrite status streams (moonwatch.lic).** Same-batch clear+content is a REFRESH, not new messages → no unread dot; and a clear drops lines accumulated earlier in the same batch, so a pitfall-#60 replay (whole history in one batch) honors the interleaving — a decoupled window now shows one moonwatch line, not N stale ones.
- **B174 — Windowed Panels: switching character tabs tore down the hidden character's entire floating-window set.** WindowLayer unmounted its windows when the layer measured 0×0 — which is exactly what a `display:none` hidden tab measures (pitfall #24). Every switch destroyed and re-initialized map/streams/text ("everything redraws"; the Genie map reloaded each time). Root-caused with temporary mount/unmount diagnostics after static analysis ruled everything else out. Fix: ignore 0×0 measurements (keep the last real size) — the gate now only means "never measured yet." Companion: MapPanel's `lichMapVersion` reload effect double-loaded the multi-second Lich JSON on every remount (`=== 0` guard → ref-based changed-since-mount guard). Pitfall #83.
- **B176 — Ctrl++ didn't zoom in** (Binu): Electron's `zoomIn` role binds `Ctrl+Plus`, but `+` is Shift+`=` on most layouts. Hidden menu aliases register `Ctrl+=` and `Ctrl+numpad+` (and `Ctrl+numpad-` for out), matching Chrome.
- **B177 — Exp panel in a narrow space** (Rakkor): the skill NAME (the only flexible grid column) collapsed to zero while the fixed tail survived. Now `minmax(8ch, 1fr)` + container-query tiers (em-based, so they scale with the per-panel font) drop the `(n/34)` fraction then the mindstate word as the panel narrows; pickers truncate instead of overpainting; no horizontal scrollbar.
- **B178 — window resize floor + narrow-width degradation** (Morress wants 4 windows tiled on one monitor): `minWidth` 900 → **480** (4 columns on 1920). The app-bar degrades via em container-query tiers (wordmark hides → buttons compact → the five inline action buttons fold into the ⋯ More menu; Disconnect never collapses); the tab strip's overflow scrollbar is themed again (`scrollbar-width: thin` REMOVED — modern Chromium implements it and it disables `::-webkit-scrollbar` styling); the icon bar's six status slots flex (equal factors — no layout shift at full width) with hands/spell guaranteed a `min-width` floor and EMPTY slots collapsing at narrow widths (content beats placeholder stability); Mode button never wraps.
- **Full proactive bug-check pass** before cut: found + fixed two defects in the same session's work (px→em app-bar tiers for large fonts; a dead self-targeting container-query rule), verified the other four `scrollbar-width: thin` sites are correctly themed via `scrollbar-color` (left alone), and logged three deferred observations (SessionsContext state/actions split for panel-memo dilution; hidden-at-connect windowed mounts; ⋯ glow not reflecting collapsed buttons). No profile-shape change anywhere in the release.

---

**v0.13.3 — B165 TRUE root cause (Lich's tag-eating hook) + import-remount state replay + macro composition ✅**

- **Macro-within-macro composition (B170, JadedSoul).** Firing a cursor macro while mid-composition (input focused + non-empty — e.g. in the gap a `get @ from my pack` template left) now INSERTS at the caret like Wrayth types into its entry box (`Ctrl-2` = `second @` → `get second from my pack`); an empty/unfocused bar keeps the replace behavior (template fires start fresh). Git-verified NOT a regression — the fire path was replace-only since v0.8.10 and the suspected Genie-import work never touched it; this is the pitfall-#51 "insert at cursor" mode, built now that a tester needs it. Pitfall #51 updated.

- **The real B165 culprit — B169 (JadedSoul).** Her screenshot (`get fol from my tr pack`) cracked it: **Lich's default `inventory_boxes_off` downstream hook** ([main.rb:546](C:/temp/lich-dev/lich-5/lib/main/main.rb)) strips container XML with a **greedy** regex (`<inv.+\/inv>`) that swallows a `<right>`/`<left>` tag sandwiched between inv blocks — the exact line shape DR emits on a container GET when the game-side "display inventory windows" account flag is on. Wrayth disarms the hook at bootstrap with `_flag Display Inventory Boxes 1`; Lichborne never did → armed every session → only JadedSoul (flag on) reproduced, with random items, right-hand bias (container gets land in the free hand), and login persistence (the login dump rides container lines too). **Fix:** send the same flag once per Lich session on the first `player-info` event ([main.ts](src/main/main.ts) `wireSession`) — Lich consumes it (never reaches DR; real account flag untouched), kills the eater, and persists the preference for future sessions. Direct-SGE sessions deliberately don't send it. Container XML now flows and is fully absorbed (SILENT_TAGS + `<inv>` capture) — zero display change. Parser exonerated by replaying Frostbite's real 1225-line captured DR session (`support/mock.xml`) — every login/held-item hand tag parsed perfectly. Pitfall #80. The v0.13.2 glance fallback stays as defense-in-depth for genuine protocol gaps (spell-summoned items like the Stellar Collector apparatus).

- **Profile Transfer to an ACTIVE character now restores full session state (B165 follow-up, JadedSoul).** The import remount (reload nonce, pitfall #56) mounted a fresh GameWindow from defaults with NO replay — vitals self-healed on their next change, but DR only re-sends a hand tag when the hand CHANGES, so a long-parked held item stuck on "Empty" for the rest of the session. Fix in main's `session:reload` ([main.ts](src/main/main.ts)): arm the same render-only replay the move-window path uses (`replayTarget`/`holdingForReplay` + the 5s safety release, pitfall #60) before routing the remount — the remounted GameWindow's existing `session:request-replay` then restores scrollback + every sticky state (hands/vitals/room/spell/RT/indicators/exp/injuries). Bonus: an import remount no longer clears in-memory scrollback (the old pitfall-#56 tradeoff is gone). **Attribution nuance:** JadedSoul first tied her recurrence to an import, then clarified LB had been restarted several times in between — a remount desync can't survive a restart, so her sightings were most likely the pitfall-#78 protocol gap (covered by the v0.13.2 glance fallback); this hole is code-verified real and fixed regardless. B165 moved to Resolved (both holes closed); the remaining diagnostic on v0.13.3+ is "wrong after a glance" → raw-XML capture. No profile-shape change.

---

**v0.13.2 — Hand-bar glance re-sync + windowed-mode Debug + locked-window polish ✅**

- **Debug "Export CSV" (F45, Sekmeht).** Toolbar button exporting the active Debug tab for offline analysis — Fires `timestamp,kind,stream,rule,matched,detail`; Events `index,type,timestamp,data` (data = event JSON minus `type`); Raw XML `index,line`. RFC-4180 quoting + the OWASP formula-injection guard (leading `'` on fields starting `=`/`+`/`-`/`@`/tab — Sekmeht's `=--- Lich:` → `#NAME?` report, and a real injection vector since game text is player-authored); via a new generic `save-text-file` IPC (save dialog parented to the calling window) reusable by future save-text features.
- **Windowed-mode unread dots fixed + fallback routing audit (B167 Sekmeht, B168 audit).** The unread indicator never cleared in free mode (`activeIdsRef` was zone-only so a visible tab kept re-marking; `clearUnread` was only wired to zone handlers — window tab clicks now clear; bonus: `mainTopActiveId` had been missing from the visible set since Main-Top shipped). The same audit found `watchedStreamsRef` (STREAM_FALLBACK gate) was also zone-only in free mode — window-watched streams double-displayed in main, and zone-stale streams closed in windows had their fallback BLOCKED (silently buffered). Both now branch per `layoutMode` (free mode derives from `freeWindows`). New **pitfall #79**: every tabs/streams visibility aggregation must branch on layout mode — the zone arrays are deliberately-preserved stale state in free mode.
- **Pre-merge "check zero" added to CLAUDE.md:** `npx tsc --noEmit` is now mandatory alongside the two builds — Vite/esbuild don't typecheck, and B166's interim draft shipped a dangling identifier through two "successful" builds before tsc caught it.
- **Debug opens as a floating window in Windowed Panels (B166, Sekmeht).** The docked Debug strip rendered BEHIND the floating windows in free mode (it's a flex child at the shell bottom; the `WindowLayer` is absolute inset-0 z-60 over the whole shell). Decision: in windowed mode the Debug button now toggles a **floating Debug window** (a normal panel window seeded with the existing `debug` tab — drag/resize/close like any other window); the docked strip is panels-mode only. Collection became **presence-based** (`debugOpen` memo, the pitfall-#76 `lichScriptsOpen` pattern: strip OR zone tab in panels mode, window tab in free mode → drives `showDebugRef` + the raw-XML IPC gate), which also fixed two latent gaps: a zone/window-hosted Debug tab used to collect nothing unless the strip was open, and raw XML silently stopped after a tab-menu reconnect (the new session's `debugPanelOpen` flag was never re-armed — the collection effect now keys on `session.sessionId` too). No profile-shape change.

- **Locked windows hide the dash drag-mark (F44, TheTargonian/Rakkor).** With windows Locked, the centered "—" on the title-hidden grip strip still advertised drag/resize. Now `.fl-window--locked .fl-grip::after { display: none }` ([free-layout.css](src/renderer/styles/free-layout.css)) hides the MARK only — the 11px grip strip stays so geometry doesn't shift on lock toggle (pitfall #74 determinism) and double-click still restores the name bar; the grip tooltip drops "Drag to move" while locked. Resize handles were already unrendered when locked.
- **Held item showing as "Empty" in the icon bar (B165, JadedSoul).** Right hand more often — e.g. a bamboo folder held in the right hand while the bar read `R Empty` (left correct). Investigation verified the whole in-app path clean against the real parser (bundled `StormFrontParser` fed the exact item name, quotes, entities, 300/1000-char names, split lines — all parse correctly; renderer/IconBar/replay-snapshot/interceptLine also verified), so the `<right>` update either never reached the parser well-formed or was never sent — DR is known NOT to push `<right>`/`<left>` XML for every action that puts an item in a hand (Profanity hard-codes a glance-text fallback for exactly this; custom-verb event items are the classic gap). **Mitigation shipped: `inferHandsFromGlance` in [StormFrontParser.ts](src/main/parser/StormFrontParser.ts)** — GLANCE output text (`You are holding X in your right hand and Y in your left.` / single-hand forms, with the other hand inferred Empty / `You glance down at your empty hands.`) re-syncs both hands, with leading articles stripped so inferred names read like tag-driven ones. Real hand tags stay authoritative (inference skipped when the line carried a hand tag; never runs on stream-routed lines; line-anchored so quoted speech can't match; cheap substring gate on the hot path). Verified with an 18-case bundled-parser suite (all glance forms incl. `<d>`-wrapped items + `&quot;` entities; adversarial negatives incl. `holding hands with`, quoted speech, preset-wrapped whispers, stream-routed text, mid-sentence mentions; tag-authority same-line and cross-line). The pre-commit sweep added a defensive guard: single-hand captures reject text containing another `' in your '` phrase, so an unmodeled sentence shape (e.g. left-first ordering) is a safe no-op instead of a greedy mis-assignment. Root cause stays OPEN in BUGS.md pending JadedSoul's answer on whether episodes follow a profile import/transfer or window move (a remount without replay resets hands to Empty and a long-parked item never self-heals — would explain the right-hand bias). DESIGN §5.7, pitfall #78. No profile-shape change.

---

**v0.13.1 — Tab-bar slim + theme/vitals polish ✅**

A patch-release bundle of UI fixes:

- **Slim stream-label tabs (F43, TheTargonian/Rakkor).** The PanelFrame tab bars (`.panel-tab`) ate too much vertical real estate on a stacked multi-zone layout vs Frostbite. Halved the reclaimable bulk — the tab's vertical padding (`5px → 2px`) plus a tight `line-height: 1.2`, keeping the label font (`0.93em`) legible. Reclaims ~6px per tab bar; applies to **both** Static and Windowed Panels. Pure CSS ([panel-frame.css](src/renderer/styles/panel-frame.css)). (Remaining height is the label text line — a literal 50% would mean shrinking the font; left readable, with a "Compact stream tabs" setting as a future lever.)
- **Map now follows the theme (B161, Binu/Sekmeht).** The Theme Editor edits the general vars, but every built-in theme except stock Dark *pinned* the map's own `--map-*` vars to literals — so editing App Background updated every panel except the map (and an imported 2-colour Frostbite theme left the map darkBase-brown). Fixed at the root: the structural map colours (bg/chrome/text/borders/node fills/dots) are now one `MAP_STRUCTURAL_CASCADE` wired to the general palette and re-applied **last** in `applyTheme`/`applyCustomTheme` ([themes.ts](src/renderer/themes.ts)), so no theme can pin them; only the semantic cues (arcs, "you-are-here", selection) stay per-theme. Map canvas follows App Background and labels follow Game Text on every theme, live in the editor. pitfall #34 family. (Lich Map's baked PNG tiles are separate/unaffected.)
- **Compact vital-bar text centering (B162, Sekmeht).** `.vital-text` inherited the game-area line-height (~1.4); the tight `1em` compact bar couldn't absorb the leading, so the caps/digits ("M: 100%") sat optically high. Pinned `.vital-text` to `line-height: 1` ([vitalsbar.css](src/renderer/styles/vitalsbar.css)) — true-center, both modes.
- **Lich Scripts `;listall` poll gated on the panel being open (B163, Binu).** The 5s poll ([useLichBridge.ts](src/renderer/hooks/useLichBridge.ts)) was gated only on `connected`, so it injected `;listall` for every connected character even with the panel closed — and since Lichborne and Lich share one front-end socket (Lich runs `UpstreamHook.run` before handling `;` commands, `global_defs.rb:2225`), Lich's automap saw it as a typed command and once captured it as a room's connecting movement. Now gated on a `lichScripts` panel actually being open (a `lichScriptsOpen` memo in GameWindow drives a `lichPollRef` read inside the interval; works in Static-Panels and Windowed modes), with one immediate seed poll on open. Panel closed → zero `;listall`. Resolves the standing "polls every 5s" Known Limitation. pitfall #76.
- **Lich Scripts panel header + footer strips tightened to match other panes (B164, Sekmeht).** Both the "ACTIVE SCRIPTS" header and the bottom status strip read ~2-3x their text height. Same cause on each: a tight bar with no `line-height` inherited the game line-height (~1.4-1.5) and ballooned (pitfall #75 again), plus oversized text. Pinned `line-height: 1` on both, dropped the header title `1.04em → 0.84em` and the footer `0.96em → 0.8em`, trimmed both strips' padding, and de-sized the refresh icon so it doesn't drive the header height ([lich-panels.css](src/renderer/styles/lich-panels.css)). pitfall #77.

No profile-shape change in any of the five.

---

**v0.13.0 — Windowed Panels (Free Layout) ✅**

Toggleable floating-window layout mode (DESIGN §33). `layoutMode: 'panels' | 'free'` per-character; in free mode the fixed zone skeleton is replaced by a pointer-through `WindowLayer` of `FloatingWindow`s (new files: `freeLayout.ts`, `components/FloatingWindow.tsx`, `components/WindowLayer.tsx`, `styles/free-layout.css`). Every surface decouples — main text (`textAreaNode`), command/input bar (`commandBarNode`), vitals, icon, and each panel zone become floating windows (fractional rects so they scale with the OS window; drag/resize/z-order/title hide+rename+close; persistence via `freeWindows`/`layoutMode` scopedKeys → YAML). **Conversion is a CASCADE** (`buildWindowsFromCurrentLayout`) — the original "measure-and-mint" (recreate the panels layout pixel-for-pixel) was abandoned after it fought title-bar space and overlapped/"scaled weirdly"; cascade gives clean default-sized windows the user arranges. **Snapping** (§33.5): magnetic edge + window-to-window on drag AND resize, live guide lines, Alt-to-disable, arrow-key nudge. **Unlimited windows + lock**: the Panel Manager hosts an **Add Window** section (new panels + re-add any closed singleton) and a **Lock windows** toggle (`freeLayoutLocked`); the static-panel zone manager is hidden in free mode. Chrome bars are fixed-height (NOT auto-height — that rendered 0-tall and "popped in"), resizable both axes, centered in the body. **Terminology:** Static Panels (docked) vs Windowed Panels (floating); streams are the content placed inside. Profile Transfer's Panel Layout category extended to carry `layoutMode`/`freeWindows`/`freeLayoutLocked`. Window-layout traps recorded in CLAUDE.md pitfall #74. (Built across Phases 1–5; tester-verified by Sekmeht.) **Pre-release cross-feature sweep (clean):** stream-add works via the per-window PanelFrame `+` (the hidden Available-Streams list isn't a blocker); all scroll-resnap is `scrollRef`-based so it covers the free-mode main window; modals/overlays out-z the WindowLayer (z 60); Settings greys the Vitals/Icon Position toggles in windowed mode; Profile Transfer carries `layoutMode`/`freeWindows`/`freeLayoutLocked`. No new functional bugs found.

---

**v0.12.1 — Genie names → Contacts + pre-release polish ✅**

**Genie `names.cfg` → Contacts with per-colour templates** (matching Frostbite + Wrayth): `parseNames` (`#name {#hex} {Name}`) already routed to `result.names`, but produced contacts with NO template — now it stamps a hex-derived `templateName` (`color<HEX>`) and dedups by name, so the wizard's source-agnostic contacts-apply builds one template per colour and assigns it (Genie sample: 96 names → 7 colour templates). All three legacy clients now import names identically. Slot hint updated ("Names → Contacts"). This folds the v0.12.0 Text Modification work below into the shipping **0.12.1** release (0.12.0 was committed but never published).

---

**v0.12.0 — Text Modification: Mutes (the #1 onboarding request) — native gag/ignore suppression + import from all three clients (F42) ✅**

Shipped **Phase 1** of the Text Modification feature (DESIGN.md §31): **Mutes** (renamed from "Gag"/"Ignore" — Sekmeht's call, friendlier). A mute suppresses any main-window line matching its pattern (text/phrase/regex), group-gated like every other rule. **Native, client-side** (decision: a display concern, must work without Lich per Principle #2, portable, and a clean import target — vs delegating to Lich `textsubs.lic`, which can't gag anyway and breaks for SGE-direct users). New **"Text Modification"** tab in Automations ([TextModificationPanel.tsx](src/renderer/components/TextModificationPanel.tsx)); `MuteRule` store ([mutes.ts](src/renderer/mutes.ts), `scopedKey('mutes')`, no profile-shape change — rides `state.*`); applied in GameWindow's `newMain` mute-pass (display-only — the Session Log keeps the raw line). Persists to YAML automatically and **transfers** via the new `textMod` Profile-Transfer category. **Import wired across all three clients** (the count-only "belongs in Lich" notices are gone): Genie `#gag {/…/i}` (reuses `stripGenieSlashWrap`), Frostbite `ignores.ini` (new `[ignore]` parser + slot), Wrayth `<ignores>` — each → a Mutes preview tab with the same checkbox/select-all/dedup UX. Verified end-to-end: all three import "has arrived!" and functionally mute it. **Mute `scope` (like highlights, Sekmeht request):** `line` (default — hide the whole line, the typical gag) or `match` (strip only the matched text, keep the rest — so muting a name doesn't nuke the room title you're standing in); `applyMutesToSegments` does line-drop vs per-segment text-strip (global regex). The editor was rebuilt to mirror HighlightsPanel exactly (mode toggle, scope radios, proper footer — the first pass had wrong CSS classes). **Right-click entry** added (like Highlight/Trigger): `Mute "word"` (match scope) / `Mute this line` (line scope) → opens the panel prefilled. Match-scope removal **tidies the whitespace gap** (`…healer Quentin.`→`…healer.`). **Phase 2 — Substitutes SHIPPED:** rewrite matching text → a replacement (`$1`/`$&` capture refs), `applySubstitutesToSegments` per-segment after mutes/before highlights, display-only. Imported from Genie `#subs` (regex, `$N` kept) and Frostbite `substitutes.ini` (`\N`/`\0`→`$N`/`$&`, regex-safe unescape). **Import audit (Sekmeht request):** validated all three clients' real config files end-to-end (Genie `gags.cfg`/`substitutes.cfg`, Frostbite `ignores.ini`/`substitutes.ini`, Wrayth `<ignores>`); confirmed imported mutes/subs **persist exactly like highlights** (`saveMutes`/`saveSubstitutes` ≡ `saveHighlights`, wizard `onSaved` → `scheduleProfileSave` → YAML). Fixed: **stale slot hints** (Genie/Frostbite sub+gag slots still said "not imported — use textsubs.lic"); the scope blurb ("substitutions belong in Lich"); and a real **off-by-one** — Frostbite `substitutes.ini` declares `size=88` but has an entry 89, so the `1..size` loop silently dropped it. All three Frostbite array sections (highlights/ignores/substitutes) now iterate the indices actually present via `arrayIndices()` (pitfall #73), not `size` → storm-gray now imports **89** subs. Also fixed a **proceed-gate bug**: the wizard's `totalSelected` (which enables Confirm) omitted `selMu`/`selSub`, so an import of ONLY mutes or ONLY substitutes couldn't advance; mutes/substitutes added to the gate, the confirm-summary table, and the post-import "imported N mutes/substitutes" line. Verified the complex Frostbite regex subs (lookaheads/`\b`/alternation/`$`, `\N`→`$N`) import and apply correctly end-to-end (`poor puncture damage`→`poor (2/27) puncture damage`; `poor archery` correctly untouched). Two more fixes from live UI testing: (1) a substitutes-only (or mutes-only) import showed **"No importable triggers found"** — the preview's default-tab picker fell through to the empty `triggers` tab; it now picks the first tab with content (covers every type). (2) **Frostbite mind-state subs → `unsupported`; everything else imports GLOBAL (Genie model).** The `target=Experience` subs (`(clear)`→` 0 $1`, `(very rapt)`→` 31 $1`, …) re-number Frostbite's dedicated Experience WINDOW; Lichborne shows that skill readout in the main window already space-aligned, so substituting a variable-width number into it breaks the table's columns — and the bare `(clear)` patterns mangle normal prose if applied globally. We iterated through scoping Frostbite `target`→stream (`frostbiteStream`), adding an `exp`-pseudo-stream entry to `STREAM_OPTIONS`, and special-casing `applyTextMods` to fire `'exp'`-scoped rules on `EXP_READOUT` lines — then **reverted all of it** (Sekmeht: "these are non-supported substitutes"). Final: `parseSubstitutes` flags `target === 'Experience'` subs **`unsupported`** (shown greyed in the preview with a note, not imported by default — 89 → 54 ready + 35 unsupported); all other substitutes import plain **global** ("substitute wherever the text shows up", matching Genie). (3) **Stale-list-after-import:** an AutomationsPanel tab panel loads its rules once on mount, so a just-imported list showed empty until you tabbed away+back; added an `importNonce` keyed onto every tab panel that bumps on the wizard's `onSaved`, forcing a remount+reload on import only (a panel's own edits don't bump it). (3b) That `importNonce` key was initially a BARE `importNonce` on every panel — but Macros + Aliases are the same component (`MacrosPanel`, differing only by `initialTab` read once on mount), so React reused the one instance across those two tabs and the Macros tab rendered Alias content; fixed by making the key **tab-unique** (`` `${type}-${importNonce}` ``). (4) **Frostbite names → Contacts (v0.12.0):** a `[TextHighlight]` with `group=Names` is a player name — `parseHighlights` now returns `{ highlights, names }`, routing those to `result.names` (Contacts) with a per-colour `templateName` (`color<HEX>`); the wizard's source-agnostic contacts-apply creates one template per colour and assigns it — identical to the Wrayth `<names>` path (Rakkor's file: 74 highlights + 151 names → 9 colour templates). Also added a **contacts "already exists" check** (`dupC`): the wizard only had `dupH`/`dupT`/… (rule stores), so names — which import as Contacts — were offered every re-import with no EXISTS flag even though the apply already skipped them. `dupC` checks `loadContacts(character)` by name (same logic as the apply's skip), so the Contacts preview now shows the EXISTS badge + honours the "Hide items already in this profile" toggle. **Pre-release UI/UX sweep (two real bugs fixed):** (a) **"Select all" imported `unsupported` rows** — `selectAllTab` used `allIndices(length)`, which includes unsupported items (whose checkboxes are disabled), so clicking Select all on Substitutes pulled in the 35 held-back Frostbite mind-state subs; fixed to select only non-unsupported (matching the default selection) + a defensive `status !== 'unsupported'` guard at the mutes/subs apply. (b) **Automations header overflowed on narrow windows** — the two new tabs (Mutes, Substitutes) made an 8-tab bar that clipped the Import/✕ buttons; `.at-title` now shrinks+ellipsises (`min-width:0`) and `.at-tab-bar` wraps instead of pushing buttons off-screen. *(Superseded in v0.19.8 — F119 split that header into two rows; the tabs moved to a row of their own and the Import button into a ⋯ menu, so the 8-tab bar no longer shares a row with anything — `.at-title` and `.at-tab-bar`'s wrap were the containment this replaced. Left as the record of what v0.12.0 shipped.)* Verified clean: triggers fire on raw text BEFORE the mute/sub pass (muting is display-only), Profile-Transfer regenerates ids for mutes/subs, missing `state.mutes`/`state.substitutes` keys load as `[]` (no migration), and all new UI reuses themed `hp-*`/`ctx-*` classes (no light-theme literals). **Restructured (Sekmeht): Mute and Substitute are now two SEPARATE Automations tabs** ("Mutes" + "Substitutes") rather than one nested "Text Modification" tab — flat like Highlights/Triggers; `MutePanel`/`SubstitutesPanel`, separate Profile-Transfer categories. Both got a **right-click entry** (`Mute "word"`/`Mute this line`, `Substitute "word"`/`Substitute this line`); the growing 10-row flat menu was then **reorganized into nested submenus** — `ContextMenu` gained submenu support (hover-expand, flips left/up at the edge) on top of a new **root-menu viewport clamp** (it was overflowing off-screen), and the game-window menu is now **`Modify Text ▸`** (Highlight/Mute/Substitute) + **`Trigger ▸`** + Show in Log + Clear. **Phase 3 — stream scope SHIPPED:** mutes/substitutes now apply **GLOBALLY by default** (the pass runs over `newMain` AND every `newStream[key]` buffer — Sekmeht's call, = Genie's global model), with an **optional per-rule "Apply to" stream restrict** (Frostbite's `target` model — All / Main / Thoughts / Conversation / Combat / Deaths / Arrivals via `STREAM_OPTIONS`); we don't auto-skip Thoughts. The "Apply to" dropdown + the whole editors mirror HighlightsPanel CSS. **Feature complete** — a once-floated "push to textsubs.lic" export was dropped (Sekmeht, 2026-06-08). Files: substitutes.ts, MutePanel.tsx, SubstitutesPanel.tsx, GameWindow.tsx, AutomationsPanel.tsx, profileTransfer.ts, import/{types,mapper,parsers/genie,parsers/frostbite}.ts, ImportWizard.tsx. Docs: DESIGN.md §31, CLAUDE.md Automations section. Files: mutes.ts, TextModificationPanel.tsx, GameWindow.tsx, AutomationsPanel.tsx, profileTransfer.ts, import/{types,mapper,parsers/genie,parsers/frostbite,parsers/wrayth}.ts, ImportWizard.tsx.

**v0.11.9 — Frostbite highlight import rebuilt against a real export; fixes a latent Qt colour/options decoder bug (B159) ✅**

Spent a pass making the **Frostbite import** as good as the Wrayth one, driven by Rakkor's real `highlights.ini`. The headline find was a latent bug in the shared Qt `@Variant` byte-decoder ([colorUtils.ts](src/renderer/import/colorUtils.ts) `parseQtEscapes`): Qt writes **minimal** hex escapes (`\x1`, not `\x01`), but the decoder always consumed two chars and advanced three, swallowing the next `\` on every single-digit escape and desyncing the byte stream right after the spec byte — which **silently produced wrong colours since the Frostbite importer shipped** and, once the new options-decode used the same path, frequently flipped on the "match groups" bit so **most rows showed "partial."** Fixed to read 1–2 hex digits greedily. **Parser rework** ([frostbite.ts](src/renderer/import/parsers/frostbite.ts)): `|`-alternation values (`A|B|C`) now compile to a real regex (each alt escaped, word-bounded unless partial-match) instead of matching the literal string and failing — recovering ~15 of Rakkor's most-used highlights (spell-up lists, name lists, globe/dome states); option bits decoded correctly against Frostbite's `highlighter.cpp` (entire-row→line scope, partial→phrase/text); Qt value unescaping (`Redeemer\\'s Pride` → `Redeemer's Pride`); visual-identity dedup; fixed `[AlertHighlight]` and `[GeneralHighlight]` parsing (both keyed by name with no `size=`, so both had been returning nothing) + a new `i_script`→`--preset-cmd` theme mapping; timer entries flagged `partial` rather than dropped. **Preview** ([ImportWizard.tsx](src/renderer/components/ImportWizard.tsx)): each pattern renders in its actual fg/bg colours on a fixed dark game-like chip (WYSIWYG) plus text/bg swatches — shared by all three legacy importers. Decisions (Sekmeht): keep imports case-insensitive and keep Frostbite groups informational (not recreated as Lichborne groups). Verified with the real bundled parser on Rakkor's file: 63 highlights → 61 ready / 2 partial (timers) / 0 unsupported, 13 alternations converted, all colours correct. **Then completed full-profile coverage** against a real `profiles/<name>/` folder (all four INIs): **macros.ini** now follows Frostbite's actual `$n`/`$s`/`@` macro semantics (`macrothread.cpp`) — `take @ from my backpack` imports as a working cursor macro (was flagged "move to a Lich alias"), `"advance "` → `advance @`; **general.ini** imports `fontColor`→`--text-primary` (not just `background`) and surfaces `[QuickButton]`; **substitutes.ini** stays count-only → `textsubs.lic` (text rewriting delegated to Lich — Sekmeht's call, no native sub feature). End-to-end verified: 29/29 macros → valid MacroRules + JSON round-trip. **Then Genie** (real Genie-Remix config, comprehensive bug-check vs Genie4-Dev source): migrated Genie macros onto the shared helper (new **separator mode** — Genie auto-sends, so no `@` append; the stale "@ → Lich alias" note removed, `@` is the native cursor); fixed the count-prefix bug (`#sub`/`#var` short forms — the Lich notices were silently 0); and fixed two pattern bugs found in the check — `/pattern/i` slash-wrapped highlights/triggers were imported with literal slashes (never matched), and `beginswith` (257) over-matched as a substring (now `^`-anchored regex per Genie's source). Confirmed the highlights preview is uniform across all three clients + added a "· whole line" scope hint to the Mode column. 1295 Genie highlights compile, slash/beginswith verified against real text. No profile-shape change. Docs: CLAUDE.md Import-wizard section, BUGS.md B159/B160. Files: macroAction.ts, genie.ts, wrayth.ts, frostbite.ts, ImportWizard.tsx, import-wizard.css. Docs: CLAUDE.md Import-wizard section + pitfall #72, BUGS.md B159. Files: frostbite.ts, colorUtils.ts, ImportWizard.tsx, import-wizard.css.

**v0.11.8 — Story-window auto-scroll consolidated into one settle-loop primitive; fixes intermittent "one line short" (B158) ✅**

The main text window still occasionally rested **one line short of the bottom** when new text arrived — the user could wheel down once or click the scroll-down button and it snapped to the true bottom. Root cause: react-virtuoso measures the just-appended **last row asynchronously** (its ResizeObserver fires a frame or two after the row mounts), so the scroller's `scrollHeight` keeps growing for a few frames after content renders. The B155 per-batch correction (synchronous write + a **single** rAF backup) could run *before* that measurement landed and converge on the short pre-measurement bottom. On top of that, three separate correctors (the per-batch inline write, the `resnapToBottom` settle loop wired to discrete events, and the inline ResizeObserver write) were racing the same target. **Fix: collapse all three into ONE primitive, `stickToBottom(reindex?)`** — a self-cancelling rAF settle loop that re-asserts `scrollTop = scrollHeight − clientHeight` every frame until `scrollHeight` is **stable for two consecutive frames** (or a 20-frame cap), which always captures the async last-row grow. The per-batch path keeps its synchronous-first-write-before-paint (last line flush in the same frame new content renders) then runs the loop for the measurement tail; discrete relayouts (badge/End, font change, tab-show, focus-regain, replay) pass `reindex=true` to issue one `scrollToIndex({index:'LAST'})` first for off-screen targets; the height-gated scroller ResizeObserver now calls the same loop (it writes only `scrollTop`, no re-render, so no observer feedback loop). Keeping the loop alive across a flood (cancel+restart per batch) holds the bottom flush every frame, so **large bursts read as continuous scroll instead of chunky jumps** (the second reported symptom). Trade-off (intended): during an active flood, suppression stays armed so only wheel-up un-pins; scrollbar drag/arrow un-pins once the flood pauses — i.e. "stay stuck to the bottom until the user manually scrolls up." No profile-shape change. Docs: CLAUDE.md "Main text rendering" + pitfall #68 (d), BUGS.md B158. Files: GameWindow.tsx.

**v0.11.7 — Genie Map current-room matching rebuilt to mirror GenieMaps' own client (name + exits + description) (B156) ✅**

The "you are here" indicator was landing on the wrong room, sometimes wildly (player in `[Whistling Wood, Barrows]` exits east/nw → indicator on Map68 node #138, a southeast/nw room with a different description; correct node was #172, an exact desc+exit match). Two root causes: **(1)** DR streams the room description INLINE as `<preset id='roomDesc'>…</preset>` in `main`, but `roomState.desc` was only ever written from the rare `<component id='room desc'>` block — so the matcher's description tiebreaker ran against an empty/stale desc and fell to file order across 40+ identically-titled nodes. **(2)** the real GenieMaps client (`Node.Compare`/`CardinalCount`, NodeList.cs) matches by name + EXIT-SET + description; Lichborne ignored exits entirely. Fixes: (a) GameWindow captures the inline `preset:'roomdesc'` main-segment into `roomUpdates.desc`, applied AFTER the batch loop so it beats the B121 streamWindow clear (also helps the Lich Map's findRoom fallback); (b) `roomState.exits` threaded through MapPanel→GenieMapView; (c) `currentLocation` rewritten as a ladder — desc-exact → exit-equality → desc-substring → graph-adjacency → exit-aware conservative-cross-zone-fallback. The two strong signals (fresh desc + exit set) back each other up for near-100% accuracy; degrades gracefully on stale Genie data. `--stormfront` vs `--genie` is irrelevant (same title/desc/exits either way). **Two follow-ups in the same version (developer audit):** (i) a first cut used exits to PRE-FILTER the pool before adjacency, which excluded the correct neighbour whenever Genie's exit data for a room was imperfect and stranded the marker ("room text doesn't match anymore" / "stuck at the Shard healer in another zone") — exits are now ADDITIVE only and the cross-zone hold is exit-aware (commits when the guess is exit-corroborated or `prev`'s exits no longer match the live exits); (ii) **rewrote the matching core to a module-level PURE function `resolveGenieRoom(...)` driven from a single idempotency-gated effect** (explicit `prevLocationRef`/`staleCountRef`), replacing the impure `useMemo` that mutated refs as it computed — which double-counted under React StrictMode (dev `npm start`) and behaved differently than packaged builds; (iii) **B157 — fixed the real cause of "location goes stale when idle/minimized"** (a separate bug from the matcher): `roomState` is fed by the rAF room pump (pitfall #20) and Electron's `backgroundThrottling` (default `true`) pauses rAF for a minimized/backgrounded window, freezing room state until a `LOOK` after restoring. Fixed with `backgroundThrottling: false` on every BrowserWindow + a `document.hidden` synchronous-drain fallback in the room pump (CLAUDE.md pitfall #71). No profile-shape change. Docs: CLAUDE.md pitfall #70 + DESIGN.md §19, BUGS.md B156. Files: GameWindow.tsx, PanelFrame.tsx, MapPanel.tsx, GenieMapView.tsx.

**B89 — Inactive character tab too dark ✅: the base `.character-tab` text color was `--text-dim` (the de-emphasized variable), so a connected-but-inactive tab read as dim and drifted toward looking like the disconnected state. Changed to `--text-secondary` (near-full strength) — three brightness tiers now: active (full + bold + bg + border), inactive-connected (near-full), disconnected (opacity 0.55 + italic). One-line CSS. Reported by the developer ✅**

**v0.11.6 — Story window pinning rebuilt: layout overflow fix + we own the scroll (followOutput off) (B155) ✅**

A long debugging chain with Sekmeht + Binu that started as "B153 clip is back when switching tabs" and uncovered **three distinct bugs** the earlier B153 (v0.11.4) "measurement-timing" framing had missed. Symptoms across the thread: last line clipped under the vitals bar; tab-switch popped the "N new lines" badge a line short and clicking it stayed clipped; alt-tab-to-Discord-and-back; split-into-its-own-window; compact↔regular vitals toggle; then a "scrolled up a notch, then jumps to bottom" flicker on every new line; and a brief idle "jitter / scaling fighting itself." The decisive clue was Sekmeht's: **moving the vitals bar top↔bottom shifted the main window by a line** → a real layout overflow, not scroll math.

- **(a) Layout overflow (the real clip).** `.game-main` + `.text-window` ([game.css](src/renderer/styles/game.css)) were `flex:1` children of flex **columns** without `min-height: 0`, so they wouldn't shrink below content and the column overran the window by ~a line → bottom clipped. Added `min-height: 0` (textbook flexbox fix). B153/B122 chased this as scroll math and never found it.
- **(b) followOutput two-step → OFF.** Virtuoso's `followOutput` under-measured the fractional last row and landed a notch short, then a correction snapped it down a frame later (visible every line once the viewport went cleanly fractional). Set `followOutput={false}` and made `totalListHeightChanged` set `scrollTop = scrollHeight − clientHeight` **synchronously before paint** when pinned (rAF backup for still-settling rows) — flush in one frame, nothing to correct, no jump. (Bonus: one scroll + one paint per line instead of two — Sekmeht noted the text flow got visibly smoother.)
- **(c) Discrete vs continuous relayouts.** A shared `resnapToBottom()` **settle loop** ([GameWindow.tsx](src/renderer/components/GameWindow.tsx); re-corrects each frame until `scrollHeight` stabilizes, 12-frame cap, sync-suppress, `pinnedRef`-gated) for discrete transitions — badge/End, font change, tab-show (pitfall #24), `window 'focus'`/`visibilitychange` (alt-tab), and after a replay batch (split-window/decouple, pitfall #60; own trigger because the mount effect runs with `lines` empty and the new window's initial focus precedes the listener, B149 race). A **passive height-gated `ResizeObserver`** for continuous viewport-height changes (vitals appearing at login, compact toggle, window resize) doing a SINGLE bare `scrollTop` write — calling `resnapToBottom`/`scrollToIndex` from it re-renders→re-fires the observer→idle jitter loop, so it stays bare.

Verified by Sekmeht: stays pinned on new text, scroll-up badge + click-to-return intact, flush at font ≥ 13 / compact / vitals top↔bottom, no jitter. No profile-shape change. Docs: BUGS.md B155, CLAUDE.md pitfall #68 (rewritten) + Game-text pipeline note, DESIGN.md §23, release-notes v0.11.6.

**v0.11.6 — Character-tab right-click menu: Reconnect / Disconnect / decouple, context-aware (F41) ✅**

Tester-requested (Sekmeht): the tab right-click menu was decouple-only; expanded it to a per-character action menu that shows **only the actionable options** (no greyed rows) — Reconnect (disconnected tabs) XOR Disconnect (connected tabs), Open in New Window (when >1 char shares the window), Move to Main Window (only in a decoupled/secondary window, via `useRoster().isPrimary === false`). Close was intentionally left out (the tab's × covers it). Disconnect uses `window.api.disconnect(sessionId)` directly so it works on ANY tab, not just the active one (the session-action bridge only reaches the active GameWindow). **Reconnect** ([App.tsx](src/renderer/App.tsx) `handleReconnectTab`) tears down the dead session then re-runs the connect flow; the tab reconnects IN PLACE (GameWindow is keyed by characterId, so it doesn't remount — scrollback preserved). **Two bugs fixed during this:** (1) the reconnected tab stayed greyed + Lich bridge stayed off — the GameWindow's `dropped` flag wasn't cleared because the `onConnectionStatus` 'Connected' event races ahead of the `sessionIdRef` update and gets filtered out; fixed by resetting `dropped`/`disconnecting` on the `sessionId` PROP CHANGE instead (deterministic) — see CLAUDE.md pitfall #69. (2) No connecting feedback for a tab reconnect (the launcher overlay isn't visible); added a per-tab spinning ⟳ indicator driven by an App-owned `reconnectingIds` set, respecting `prefers-reduced-motion`. Files: [CharacterTabBar.tsx](src/renderer/components/CharacterTabBar.tsx), [AppBar.tsx](src/renderer/components/AppBar.tsx), [App.tsx](src/renderer/App.tsx), [GameWindow.tsx](src/renderer/components/GameWindow.tsx), [character-tabs.css](src/renderer/styles/character-tabs.css). Verified by Sekmeht. No profile-shape change. Docs: BUGS.md F41, CLAUDE.md pitfall #69 + multi-window note, release-notes v0.11.6.

**v0.11.5 — Debug panel look & feel overhaul: alignment, opaque surfaces, readable Goto, resizable (B154) ✅**

Developer-reported polish on the Debug panel (the Fires / Events / Raw XML diagnostic strip): transparent-looking rows, badly misaligned columns, a hard-to-find Goto control, and a cramped, fixed 220px height that made reviewing output painful. All addressed in [DebugPanel.tsx](src/renderer/components/DebugPanel.tsx) + [debug.css](src/renderer/styles/debug.css):
- **Columns align now.** `scrollbar-gutter: stable` on the scroller so the sticky header and the rows always share one content width (they drifted by the scrollbar width once the list overflowed). The fire log went from `align-items: start` + unbounded wrap (which made tall ragged rows) to `align-items: center` + single-line ellipsis per cell with the full value in a `title` tooltip → uniform row heights, true table columns. Events converted flex→grid so its header lines up with rows; Raw XML gained a sticky header.
- **No more "transparent" surfaces.** Zebra striping (`:nth-child(even)` via `color-mix(... var(--text-primary) 5%, transparent)`) on all three tabs + explicit theme-var backgrounds on chips/buttons. Audited on light themes (pitfall #34/#55).
- **Goto → a readable "Edit →" button** (was a bare transparent `→`): filled, vertically centred, in a fixed last column so it can never be pushed off-screen. Wiring (`onGotoFireRule`) unchanged.
- **Drag-resizable height**, default 300px (was fixed 220px), clamped 150 → 70vh, persisted per-character via `scopedKey(character,'debugPanelHeight')` — round-trips into YAML `state.*` automatically (Principle #1), **no profile-shape change**. Resize is opt-in via a `resizable` prop so the in-zone render (PanelFrame) still fills its zone (`.debug-panel--fill`) instead of imposing a height. Docs: BUGS.md B154, CLAUDE.md pitfall #67, DESIGN.md §22, release-notes v0.11.5.

**v0.11.4 — Main-window last-line "one line short" at font ≥ 13 → rAF-deferred bottom correction (B153) ✅**

Rakkor's recurring report: at game font ≥ 13 the story window rests one line short of the bottom — the last line (e.g. the `>` prompt) clips at the vitals bar; < 13 is fine; normal *and* compact vitals. Also surfaced a second bug — **changing the font size un-pinned the view** (the "N new lines" badge appeared, view stranded ~1 line up). **Root cause:** Virtuoso's `followOutput` lands at "last item at viewport bottom" but **under-measures the last row at fractional heights** (a row is ~1.55em — `min-height: 1.4em` + `0.15em` wrap padding — non-integer at font ≥ 13) AND runs *after* the synchronous bottom-correction in `totalListHeightChanged`, overriding it. The decisive clue from the tester: the view could always be wheeled down exactly one line, so the true bottom was reachable — the auto-follow just wasn't getting there. **Two dead ends (recorded):** integer per-row pixel heights (the short-landing isn't row rounding — didn't help), and a font-scaled `components.Footer` (once the correction reached the true bottom, the footer just became a one-line *gap*, non-monotonic around 13–14) — both reverted. **Fix:** **defer the raw, DOM-truth bottom scroll into a `requestAnimationFrame`** in `totalListHeightChanged` ([GameWindow.tsx](src/renderer/components/GameWindow.tsx)) so it runs after `followOutput` and wins, landing at `scrollHeight − clientHeight` (immune to Virtuoso's under-measurement) — last line flush at every font, **no footer, no clip, no gap**. `scrollToBottom` (End) and the font re-snap do the same rAF correction; the re-snap also arms `suppressUntilRef` **synchronously before** its rAF so the font-change relayout (rows + the `--game-font-size`-scaled command bar both grow) can't un-pin. No `CharacterProfile`/`SharedProfile` shape change. Docs: BUGS.md B153, CLAUDE.md pitfall #43, DESIGN.md §23, release-notes v0.11.4.

**v0.11.3 — Highlight overlap resolution → ProfanityFE model (specificity + per-property compositing) ✅**

Prompted by TheTargonian/Rakkor: *"the higher in the list wins? is that how Genie does it? Wrayth and Frostbite go top-to-bottom, bottom supersedes."* That flagged that v0.11.2's brand-new "top-of-list wins" reorder was non-standard. **Read all four front-ends' actual source** to settle it (captured in CLAUDE.md Automations):
- **Wrayth / Frostbite** — list position, **bottom wins** (Frostbite verified in `highlighter.cpp`: nested HTML `<span>`s, innermost/last color wins; user-reorderable).
- **Genie** — **pattern-text SortedList** (`Globals.cs` / `ComponentRichTextBox.cs`), last-applied in alphabetical order wins; NOT user-orderable.
- **Profanity** — **specificity, smallest match wins**, with fg/bg/underline composited **per-property** (`highlight_processor.rb`).

**Decision (Sekmeht): adopt Profanity's model** — most dynamic, handles overlaps well, and doesn't force users to maintain a precedence order (judged unmanageable at scale). Implemented in [renderSegmentFull.tsx](src/renderer/utils/renderSegmentFull.tsx): contacts still beat highlights (B116); among covering highlights, each property (text color / bg / bold / glow) comes independently from the smallest covering highlight that sets it; equal-length ties → first-in-array (deterministic, vs Profanity's arbitrary unstable sort). **Removed the v0.11.2 reorder UI** (▲/▼ buttons + `moveRule` + `.hp-reorder-btn` CSS) — list order no longer controls precedence, so a reorder control would falsely imply one. `HighlightRule.priority` stays vestigial; line-scope highlights unchanged (separate `getLineHighlightStyle` path). No `CharacterProfile`/`SharedProfile` shape change. Docs: CLAUDE.md Automations (cross-client research + live behavior), DESIGN.md §17, release-notes v0.11.3.

---

**v0.11.2 — Quality, performance & theming pass + tester bug fixes ✅**

A broad consolidation pass (developer-driven, plus live tester reports). No schema change anywhere — every change is `state`-only or CSS/themes (so no migration). Modal-chrome standardization was deliberately **deferred** to a session where each modal can be eyeballed on a light theme (pitfall #55 warns that changing a shared modal bg var collides with inner elements keyed to the old value — too risky to do blind).

- **Highlights — reorder controls.** The `priority` field was vestigial; overlap resolution is "first matching rule in the array wins." Added ▲/▼ reorder buttons to [HighlightsPanel](src/renderer/components/HighlightsPanel.tsx) so list order (= real priority) is user-controllable. Hidden while searching (filtered order isn't the real order).
- **Triggers/variables — big catalog expansion.** `buildVars` ([useTriggerEngine.ts](src/renderer/hooks/useTriggerEngine.ts)) and `buildMacroVars` ([GameWindow.tsx](src/renderer/components/GameWindow.tsx)) were missing most tracked state. Added `$roomid`, `$exits`, `$ct`/`$casttime`, `$timestamp`, the indicator booleans (`$bleeding/$poisoned/$diseased/$stunned/$webbed/$joined/$hidden/$invisible/$dead`), `$preparedspell`/`$roomname` aliases, and **named regex capture groups** (`(?<who>…)` → `$who`, already worked at runtime — now listed in the editor). Threaded `ctSeconds`/`roomId`/`exits` into `TriggerGameState`. Variable-watch triggers stopped faking a `$1`. Editor variable lists ([triggers.ts](src/renderer/triggers.ts) `INTERPOLATABLE_VARS`, [macros.ts](src/renderer/macros.ts) `MACRO_VARS`/`ALIAS_VARS`) updated.
- **Performance audit.** The text-render pipeline (`TextLineRow` memo, all props reference-stable) and the Genie map (`nearbyNodes` already gated on `showEffects`, sort short-circuited under `EFFECT_CAP`) were found **already well-optimized** — the review agents over-stated severity by missing existing guards. One genuine fix: `ConnectionManager.flushLines` re-sliced the buffer from index 0 per line (O(K·N) for a K-line socket chunk) → now a single-pass cursor (O(N)).
- **Theming-bug colors.** Swept hardcoded hex/rgb out of [import-wizard.css](src/renderer/styles/import-wizard.css), [login.css](src/renderer/styles/login.css) (mode badges, error banner, path-status icons), [character-tabs.css](src/renderer/styles/character-tabs.css) (`health-bad`), [lich-panels.css](src/renderer/styles/lich-panels.css) (script status, session pill, flag badge, diff lines, white-alpha dividers), and [debug.css](src/renderer/styles/debug.css). Added a shared **`--syntax-*` palette** in [themes.ts](src/renderer/themes.ts) `darkBase` (color-mix toward `--text-primary`, so each token hue self-corrects on light themes with **no per-theme overrides**) and routed YAML/var/debug syntax highlighting through it. Status hues use `color-mix(fixed-hue, var(--bg-base/--text-primary))` (pitfall #55 pattern).
- **Text-level spread (tester request).** The `primary→faint` text ramp was too dramatic — dim/faint dropped below readable contrast on some surfaces. Compressed `dim`/`faint` toward `muted` across all 9 explicit themes (the other ~11 inherit `darkBase`): dark themes' faint raised, light themes' faint lowered toward the bg. Also fixed a real pre-existing bug — **classicLight had `dim`/`faint` = pure black** (`#000000`), an inverted ramp that rendered "faint" decorative text *more* prominent than body text; set to a proper ascending light ramp.
- **Command-bar / context-menu font scaling.** `.command-input`/`.btn-send`/`.prompt-marker`/`.ctx-menu-item` used `rem` (pinned to the 16px html root), so they ignored Settings → Font Size. Anchored `.command-bar` and `.ctx-menu` to `var(--game-font-size)` and converted children to `em` (pitfall #45).
- **TESTER BUG — Lich YAML profile editor (B147):** line numbers drifted out of sync with content and search landed wrong. The gutter (`0.75rem`) and the content pre/textarea (`0.79rem`) both used a *unitless* `line-height: 1.65`, so per-line pixel heights differed ~1px/line and accumulated (~2.5 lines off by line 50). Pinned gutter + preview + editor to one **absolute** `line-height: 1.3rem`; the search/overlay math reads that same computed value, so it lands true.
- **TESTER BUG — Genie map location not updating in a supported room (B148):** Genie matches by title + description (its internal ids ≠ Lich room ids). The description-disambiguation code's comment promised "substring/equality" but only did **exact** equality; Genie's stored descriptions are routinely a truncated first sentence, so an ambiguous Barrows-style title fell through to the conservative cross-zone fallback and stranded the marker. Added the substring-containment fallback (fires only when it resolves to exactly one candidate → additive, can't break existing matches).
- **TESTER BUG — copy-selection across a scroll loses most text (B152, Binu):** the virtualized story window (react-virtuoso) only mounted the visible rows + ~1 overscan, and the browser drops unmounted DOM from a selection — so selecting more than a screenful (scrolling down while dragging) copied "only a portion from the end." Added `increaseViewportBy={{ top: 3000, bottom: 3000 }}` ([GameWindow.tsx](src/renderer/components/GameWindow.tsx)) so several screenfuls stay mounted through the auto-scroll. Bound: selections scrolling >~3000px past their start still need Session Log → Export; full data-model reconstruction deferred.
- **TESTER BUG — parser dropped the Simu room-id-flag id (B151):** DR shows `[Room Title] (56107)` when the account's room-id flag is on (`(**)` = unmapped). The parser only read the *other* id format (`[Title - 9479]`, id inside the brackets), so flag-on players got `roomId: undefined` → the Lich Map couldn't id-match (fragile title+desc fallback → "location lost during movement") and `$roomid` was empty. Added a `\]\s*\((\d+)\)` match after the closing bracket ([StormFrontParser](src/main/parser/StormFrontParser.ts)). **Additive/non-breaking when the flag is off** — no parens ⇒ `roomId` stays `undefined` as before. CLAUDE.md pitfall #65.
- **TESTER BUG — Lich Map same stuck-location class as B148 (B150):** the Lich Map matches room id-first (`lichDb.get(roomId)`, exact) and only falls back to title+desc via [`findRoom`](src/renderer/components/panels/mapTypes.ts) when the id misses — and that fallback had the same exact-equality-only description check. Applied the identical substring-containment fallback so both map views behave consistently. Confirmed the matching is per-session/state-driven (gated on per-character `showMapOverlay`, not `isActive`) so it tracks for active AND backgrounded characters.
- **POLISH (tester feedback during validation):** the macro variable picker's "Special tokens" descriptions misaligned — a long token like `{ReturnOrRepeatLast}` whose description wraps to two lines floated vertically-centered against the one-line token. `.ma-var-item` ([macros.css](src/renderer/styles/macros.css)) switched `align-items: center` → `baseline` (+ `span { flex: 1 }`) so the token and the description's first line share a baseline and wrapped lines flow below.
- **TESTER BUG — Quick Send hotkey dead in decoupled windows (B149):** Ctrl+Shift+Enter did nothing in a separate window. The hotkey fired, but [QuickSend](src/renderer/components/QuickSend.tsx) renders nothing when the cross-window roster is empty — and [RosterContext](src/renderer/RosterContext.tsx) was **push-only** (`onSessionRoster`), so a freshly-opened window that subscribed after main's `did-finish-load` broadcast kept an empty roster (no later broadcast self-heals it). Added a `get-roster` pull IPC; RosterContext now pulls on mount like SessionsContext does for owned sessions. CLAUDE.md pitfall #64.
- **Modal size standardization (developer request):** Panel Manager, Automations (+ the standalone Highlights/Triggers/Macros editors), Lich (Dashboard/Profile/Scripts), Settings, Session Log, Contacts, and Themes (Picker + Editor) now all match the **Maps button overlay** (`.map-overlay-window`) — `width: 88vw`, `height: 86vh` — via two shared layout tokens `--modal-w-standard` / `--modal-h-standard` in [global.css](src/renderer/styles/global.css) (one place to retune all). This also resolved a latent `.tp-modal` class collision (theme-picker AND triggers both used `.tp-`, so the winner was load-order-dependent — now both reference the same token). The Automations rule-list sidebars (`.hp-`/`.tp-`/`.ma-sidebar`) changed from a fixed `210px` (smashed, especially with the new highlight reorder buttons) to `clamp(240px, 25%, 380px)` so the left list scales with the window. **Colors/chrome untouched** — this is width/height only, the safe slice of the deferred modal-chrome unification; the body-bg/header/backdrop/close-button normalization still needs a light-theme eyeball pass (pitfall #55). **Resize bug check (self-found + fixed):** (a) `.pm-body`/`.sp-body` (Panel Manager, Settings) lacked `flex: 1`, so at the new fixed height they wouldn't fill cleanly — added it (no footer, so no floating-footer bug, but now consistent with every other modal). (b) Widening `.tp-sidebar` exposed a latent **`.tp-` class collision**: theme-picker's `.tp-list { width: 210px }` was leaking onto the Triggers rule list (only theme-picker sets `width` on the shared class), which coincidentally fit when the sidebar was also 210px but would now leave the list pinned at 210px in the wider sidebar. Scoped theme-picker's rule to `.tp-body > .tp-list` (direct-child combinator — triggers' list is a grandchild via `.tp-sidebar`, so it's excluded; the raised specificity also stops the reverse leak). **Verified clean:** no `min-*` on any modal root conflicts with `88vw/86vh`; `applyTheme` uses `setProperty` so the `:root` tokens survive theme changes; the Maps overlay reference is unchanged; `.hp-`/`.ma-` sidebars have unique prefixes (no collision). The broader `.tp-` prefix collision (`.tp-body`/`.tp-backdrop`/`.tp-close`/`.tp-header`/`.tp-list-item`) is pre-existing, currently compatible, and flagged for a follow-up prefix rename (CLAUDE.md pitfall #55). Settings/Theme Editor have short content so they show empty space at `86vh` — intentional per the "match Maps" request.
- **a11y:** keyboard focus outlines on import-wizard buttons/cards.
- **Docs:** DESIGN.md §30 — a researched "Lich-integration opportunities" backlog (live Lich vars as a variable source, script repository browser, richer running-script controls, mapper/`;go2` surfacing) — proposals only, nothing built.

---

**v0.11.1 — Wrayth import completion (highlights, color templates, presets→theme, all macro sets) ✅**

A tester (Thanator) brought a real `Wrayth.xml` export, which surfaced that the Wrayth importer was missing its single most important section and under-served several others. Fixed in [wrayth.ts](src/renderer/import/parsers/wrayth.ts) / [ImportWizard.tsx](src/renderer/components/ImportWizard.tsx) / [types.ts](src/renderer/import/types.ts):

- **Highlights from `<strings>` (the big fix).** Wrayth stores text highlights in a `<strings>` block; the old parser looked for a nonexistent `<highlights>` block and merely *counted* `<strings>`, so **every highlight was silently dropped**. New `parseStrings` imports them as match-scope text highlights, colored via the `<palette>` (`@NN` → hex). Deduped by **full visual identity** (pattern + color + bg), NOT pattern alone, so the same word with two different colors (e.g. `shirt` @54 and @26) both survive — Lichborne supports multiple same-pattern highlights.
- **Names → contacts + per-color templates.** `<names>` already imported as Contacts; now each unique palette color also becomes a reusable contact template named `colorNN` (by Wrayth palette index), and each contact is assigned to its template. Rename `color41` → "Friends" in the Contacts panel and every contact using it recolors. Templates are find-or-created by name (re-import reuses, doesn't duplicate).
- **`<presets>` → custom theme.** New `parsePresets` maps Wrayth preset ids (bold/speech/whisper/thought/roomName/command/link, with backgrounds) to CSS theme vars and creates an "Imported from Wrayth" custom theme — same path as Genie's preset.cfg. `watching`/`selectedLink` skipped (no equivalent); `"skin"`/empty backgrounds treated as none.
- **All macro sets (0–9), collisions flagged.** Was set 0 only; now imports every non-empty set (the custom game macros live in 1–9). Lichborne has one flat keybinding set, so cross-set key collisions are flagged `partial` (the first binding wins) and the wizard de-dupes by key at apply time so two checked rows for one key never both persist. Each macro is tagged with its source set.
- **`<ignores>` (gags) + `<vars>`** surfaced as count-only notes on the confirm screen (native gag support planned; vars live in Lich). `<scripts>` stays count-only/unsupported; `<stream>`/`<panels>` are auto-discovered, not imported.
- **Bugs found during the post-feature bug check (both fixed):** (1) the preview's Color column was scrolling off-screen because `.iw-pattern`'s `max-width`/ellipsis was a no-op on an inline `<span>` — Wrayth's full-sentence patterns expanded the cell ([import-wizard.css](src/renderer/styles/import-wizard.css), now `display: inline-block`); (2) the self-introduced pattern-only dedup (copied from `parseNames`) was dropping color-variant highlights — fixed to dedup on full visual identity.

No `CharacterProfile`/`SharedProfile` shape change (`templateName` is a transient import-intermediate field; contacts/templates/themes write through existing save funcs) — no migration.

---

**v0.11.0 — Multi-window: decoupled character windows (one process) ✅**

Headline feature (Sekmeht/Binu/Rakkor/JadedSoul testing): a tabbed character can be **decoupled into its own OS window** while everything still runs in ONE Lichborne process — so cross-character features (Quick Send) keep working, Lich-launch stays coordinated on port 11024, and profiles/localStorage aren't raced by a second exe. Built in phases, each verified live by the developer.

- **Main-owned session roster.** `SessionsContext` was renderer-local; for N windows, the session list moved to a main-process registry broadcast to every window ([`RosterEntry`/`session-roster`](src/shared/types.ts), `buildRoster`/`broadcastRoster` in [main.ts](src/main/main.ts), [RosterContext.tsx](src/renderer/RosterContext.tsx)). Each window renders GameWindows only for sessions it owns (`ownerWindowId === its webContents id`) but knows about all of them. Phase 1 was additive (no behavior change) to de-risk.
- **Window registry + owner-targeted routing.** `let mainWindow` → `windows: Map<id, BrowserWindow>` + `primaryWindowId`; per-session push channels (game-event/status/raw-xml/error/lich-scripts) route via `ownerWindow(s)`; app-global ones to primary (updates) / focused (menu) / sender (flash). App-quit flush fans across all windows so a decoupled window's unsaved settings reach disk.
- **Decouple = move ownership, never touch the socket.** `session:move-window` reassigns `ownerWindowId`; the source window drops the tab (`session-release` → local `removeSession`, socket survives — verified GameWindow unmount doesn't disconnect), the target mounts a fresh GameWindow. Three entry points: **right-click tab**, **Window menu → Move to New Window**, **Bulk Connect "Open each in its own window"** (persisted in `_shared.yaml`, default off). **Last-character guard** at 3 levels (main backstop + greyed menu item + greyed right-click) so you can't empty a window.
- **Cross-window Quick Send** ([QuickSend.tsx](src/renderer/components/QuickSend.tsx)) targets the full roster — a command typed in one window reaches a character in another (marked "· other window").
- **Seamless state transfer (replay).** A window taking over a session gets a render-only **replay**: main keeps a per-session **snapshot of the latest sticky state** (every vital/indicator/RT/CT/stance/spell/hands/room/exp, keyed — so a vital sitting at 100% restores even if it last changed thousands of events ago) PLUS a bounded scrollback ring buffer. Replay is gated at four choke points in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) (`replayingRef`) so it rebuilds display + game state WITHOUT re-firing triggers (no re-sent commands), re-logging, or re-counting fires. **Bugs found + fixed in testing:** vitals-at-100% missing (the ring buffer dropped unchanged vitals → fixed with the snapshot); fresh-connect login lines doubled (replay overlapped the live stream → gated to moved-into windows only via `replayTarget`, and live delivery is HELD during a move until the replay lands via `holdingForReplay`, with a 5s safety release).
- **Close = logout; re-home is explicit.** Closing a decoupled window gracefully **disconnects** its character (like closing a tab); **Window menu → Move Character to Main Window** re-homes it (auto-closes the emptied window). This replaced an earlier re-home-on-close that caused a vitals remount glitch.
- **Multi-exe left ungated (deliberate).** No single-instance lock — running the exe twice is allowed for isolated character sets; the cross-process shared-`userData` hardening (Lich port-claim, atomic profile writes) is a separate, deferred item. CLAUDE.md pitfalls #59/#60 + the "Multi-window" architecture section document the model.

- **Pre-release multi-window sweep (3 fixes).** A comprehensive read-through of automations / contacts / panels / transfer / connect-disconnect / themes / native menu against the multi-window changes. Most subsystems verified clean (per-session providers intact, replay gated, connect/close flows window-local, contacts protected by shared-localStorage lastSeen + absence/cooldown, scripts per-session). Three real fixes: **(1) Profile Transfer cross-window** — the modal saw only *this* window's sessions, so a target open in ANOTHER window was treated as inactive (YAML merge) and silently overwritten by its owner window's save (pitfall #56). Now active-detection uses the full **roster** and a new `session:reload` IPC routes a remount to the owning window. **(2) Cross-window theme sync** — theme is a global key applied per-window; a `storage`-event listener now re-applies it (via `initTheme`, overlays included) in other windows so they don't lag. **(3) Native menu enabled-state** — Next/Prev/Close/Move were gated on GLOBAL session counts; now scoped to the FOCUSED window's tab count (re-evaluated on window focus) so a one-character window in separate-window mode doesn't show no-op items enabled. Menu routing was already correct (focused window via `sendMenuAction`).

- **Lich Scripts parser hardened.** A persistent "running script in `;listall` but absent from the panel" (Sekmeht's `beakon`) traced to the `;listall` parser ([lichbridge/index.ts](src/main/lichbridge/index.ts)) requiring EVERY name to match `[a-zA-Z0-9_-]` — one odd-named running script (a dot) made the whole line fail to parse, blanking the panel. Verified per-character routing is correct (no cross-session bleed: poll/route/listen/ops all by `sessionId`). Widened the name class to `[^\s,()]+` (free-form Lich messages still excluded — they contain spaces). Not a multi-window regression (the un-moved character's routing is unchanged); capture the raw `;listall` line if it recurs.

---

**v0.10.1 — UI polish & bug fixes 🔧**

Bug-fix minor version after v0.10.0 (version bumped in package.json; window title + About read `app.getVersion()`, no hardcoded strings).

- **App-bar divider before Disconnect ✅ (B144, Binu)** — a 1px themed separator (`.app-bar-divider`, [app-bar.css](src/renderer/styles/app-bar.css) + [AppBar.tsx](src/renderer/components/AppBar.tsx)) sits between the "⋯ More" button and Disconnect/Login so the destructive button isn't flush against the menu button — guards against an accidental Disconnect when reaching for More. `align-self: stretch` to span the row height; `var(--border)` (theme-safe, no light-theme literal); `margin: 2px 3px` for extra breathing room. Renders for both the Disconnect (connected) and Login (disconnected) states (it sits before the conditional).

- **Debug panel close (✕) button ✅** — DebugPanel ([DebugPanel.tsx](src/renderer/components/DebugPanel.tsx)) gained an optional `onClose` prop + a ✕ button in its toolbar (danger-tinted hover, theme vars), wired in GameWindow to `setShowDebug(false)`. That runs the SAME teardown effect ([GameWindow.tsx](src/renderer/components/GameWindow.tsx)) as the Debug toolbar button — clears `showDebugRef`, fires the `debugPanelToggle` IPC, wipes the debug buffers, and re-runs the `updateStatus` effect so the app-bar "More" glow clears. Previously the only way to dismiss the panel was to find and re-click Debug.

- **Fire-log row overflow / GOTO unreachable ✅ (B143)** — in the Fires tab, a long matched pattern overflowed the row and pushed the → GOTO button off the right edge where it couldn't be clicked. Root cause: CSS-grid items default to `min-width: auto` (content size), so the `1fr` matched column refused to shrink below the pattern width. Fix in [debug.css](src/renderer/styles/debug.css): `minmax(0, …)` columns + `min-width: 0` + `overflow-wrap: anywhere` on the name/matched/detail cells so long content WRAPS within its column instead of overflowing; detail capped at `minmax(0,180px)`; `align-items: start` for tidy multi-line rows. Header + row grid templates kept byte-identical so columns stay aligned.

- **Active Scripts badge: S / C ✅ (Rakkor, Sekmeht, Binu)** — the running-scripts panel ([ScriptListPanel.tsx](src/renderer/components/ScriptListPanel.tsx)) showed a `C` badge for custom scripts but a bare `▶` arrow for normal ones. Changed the normal badge to **`S`** (Script) so it reads as a matched pair: **S** = Script (anywhere in Lich's `scripts/` tree), **C** = Custom (in the `custom/` folder) — mirroring Lich's own folder layout. The `custom` flag is already derived from the `scripts/custom/` listing ([useLichBridge.ts](src/renderer/hooks/useLichBridge.ts)), so the semantics line up exactly. Added a `title` tooltip on each badge; `.sl-badge--core` already had the same bordered-box style as custom, so the two now match. (The ▶ on the pause/resume control is unrelated — it's the Resume action icon and stays an arrow.)

---

**v0.10.0 — shipped ✅**

Headline features: Profile Transfer, top-chrome redesign, and game-area font scaling (bumped from v0.9.2). Changes:

- **Profile Transfer ("Transfer") — F38 shipped ✅** — platform-wide character setup Export/Import; see the v0.10.0 release notes and BUGS.md F38 for the full writeup. (Headline feature of this version.)

- **Top-chrome space optimization — Phase 1: Compact Vitals ✅ (F39, TheTargonian)** — first step of a redesign to give the main text window back the ~3 lines of vertical space TheTargonian measured Lichborne losing vs Frostbite. New opt-in `compactVitals` setting ([settings.ts](src/renderer/settings.ts), default off) renders a dense vitals strip (~12px bars vs 22px, tighter padding/gap; strip ~34px → ~17px) with acronym labels built from the live vital label — first letter of each word, so "Inner Fire" (Barbarian mana) → `IF`, derived at render time so any `customText='t'` guild rename is covered with no table ([VitalsBar.tsx](src/renderer/components/VitalsBar.tsx), `.vitals-strip--compact` in [vitalsbar.css](src/renderer/styles/vitalsbar.css)). Toggle in Settings → Layout; per-character, persists via the dynamic `state:` pipeline (`state.settings.compactVitals`) and rides the Profile-Transfer Display category automatically.

- **Top-chrome — Phases 2a / 2b / 2c: COMPLETE ✅ (F39, TheTargonian)** — **2a (dispatch bridge):** `menu-action` IPC + `lichborne:session-action` DOM event + a latest-closure handler in the active GameWindow ([src/shared/menuActions.ts](src/shared/menuActions.ts)). **2b (native menu):** full **File · Edit · View · Tools · Lich · Window · Help** tree (modeled on Genie/Frostbite — both put Connect/Disconnect in File, use checkmarks for toggles). Lichborne items are click-only (NO new accelerators — policy in CLAUDE.md); Electron role hotkeys + the pre-existing App.tsx chords (Ctrl+Shift+Enter, Ctrl+Tab, Ctrl+1–9) untouched; Window→Next/Previous grey unless 2+ connected (`refreshMenuState()`); Help → GitHub/issues/Discord live links + User Guide greyed "TBA"; About is a placeholder dialog. **2c (app-bar):** new [AppBar.tsx](src/renderer/components/AppBar.tsx) — one app-level row (brand + connection dot from `useSessions` + character tabs + action buttons + Disconnect/Login) replaced the bare tab row, and the per-session `game-toolbar` was REMOVED from GameWindow (the reclaimed row); ModeSwitcher relocated to the Icon Bar trailing slot (it needs per-session GroupsContext — CLAUDE.md pitfall #57) with flip-up/right-align/clamp dropdown positioning. Build + `tsc` clean throughout; confirmed by Sekmeht. **Phase 3 (logo into the app-bar brand slot) DEFERRED** at Sekmeht's call. **Deferred-polish follow-up — DONE (also v0.10.0):** per-button **active-state glow** for EVERY toggle button (a `SessionStatus.panel*` flag each, pushed by a GameWindow effect, read by AppBar → `btn-*--active` for the active session); a static **"More ⋯" dropdown** holding the less-used buttons (Debug/Logs/Contacts/Theme — inline are Panels·Maps·Automations·Lich·Settings) so the bar survives narrow windows without width-measurement; and pruning the vestigial GameWindow `status`/`scriptPalette` state. Only **Phase 3 (logo)** + a future real **script palette** remain. Classic-Light contrast bugs found + fixed mid-work: **B140** (panel-tab hover) + **B141** (rest-xp text blur). **Post-build pass:** brand wordmark gap fixed (`Lich`/`borne` were separate flex children of `.app-bar-brand` with `gap:6px` → wrapped in `.app-bar-wordmark` so it reads "Lichborne"); a **theme audit** confirmed all new renderer chrome (app-bar, More menu, compact vitals, active-glow) is theme-var-based with only the acceptable literals (drop-shadows, saturated-fill text-halos, var fallbacks) — native menu + About dialog are the deliberate Win32 exceptions. Help → Discord is now a live invite link (rotate per major version — see CLAUDE.md release notes).

- **Font-size scaling fixes — game-area chrome (v0.10.0, self-found in testing).** Settings → Font Size wasn't reaching several surfaces that used `rem` (root-anchored, ignores `--game-font-size`): the **icon bar** (hands/spell/stance), the **Mode button** (a regression — scaled at v0.9.1 inside `.game-toolbar`, stopped when 2c moved it into the unanchored `.icon-bar`), the **vitals bar** (regular + compact), and the built-in **Lich Scripts panel** (`.sl-*`). Fixed by anchoring each container to `var(--game-font-size)` (panels → `var(--panel-font-size, var(--game-font-size))`) and converting text + gating dimensions to `em` (×16/12 to preserve the default look). Caught the `em`-is-relative-to-own-font-size trap on the icon bar's `.status-bar` (6em → 7.14em). Exp/stream panels already scaled (their roots were anchored). **Left as-is by decision:** the Lich **Dashboard modal** (`.ld-*`, fixed `rem` — modal exception) and the per-panel-override pinning (F31 overrides win over the global font; no reset-to-global yet — product call pending). CLAUDE.md pitfall #58 + Principle #9 document the traps.

---

**v0.9.2 — shipped ✅**

Released after v0.9.1. Changes:

- **B112 closed (verified) ✅** — Theme Editor light-theme body-text coverage. The fix itself shipped in v0.8.4 (8 panel body-text vars in `darkBase` cascade from the general `--text-*` scale; ThemeEditor rows carry `desc` tooltips). A code-level review this cycle confirmed the cascade is present and complete by design ([themes.ts:174-196](src/renderer/themes.ts#L174-L196)) — every structured-panel body-text class either follows Game Text / Labels / Muted / Dim, or is an explicit, swatch-editable, tooltip-documented row (room title / desc at [ThemeEditor.tsx:152-153](src/renderer/components/ThemeEditor.tsx#L152-L153)). No remaining class of invisible / uncontrollable text to chase. Moved Open Bugs → Resolved; **Open Bugs is now empty.**

- **Settings panel reorganized (Rakkor feedback) ✅** — the catch-all "Accessibility" section was split by category: **Accessibility** (Large Print, High Contrast, Epilepsy Safe, Color Blind), a new **Layout** section (Vitals Bar / Icon Bar position + RT/CT Timer Style — previously buried under Accessibility), and a new **Behavior** section (Auto-link URLs, Web Link Safety, Genie Map Animations). Session Log sub-options now sit behind a collapsed **"Logging options"** disclosure so the section is short by default (`logExpanded` state in [SettingsPanel.tsx](src/renderer/components/SettingsPanel.tsx)). The Lich Setup section is now a single **"Open Lich Setup…"** button that launches the shared [LichSetupDialog](src/renderer/components/LichSetupDialog.tsx) — the embedded `LichSetupFields` copy (and its `adv` state/effect) was removed so there's one Lich-config surface, not two. Settings modal widened 460px → 580px.

- **Lich Setup theming pass (Sekmeht, Classic Light) ✅** — the Lich Setup / login form chrome was hardcoded dark hex in [login.css](src/renderer/styles/login.css) and didn't follow themes (gold text on near-black inputs, a black `.advanced-panel`). Converted all of it to theme vars: `.advanced-panel` bg → `var(--bg-sunken)`; `.login-form` label/input/select colors → `var(--text-muted)` / `var(--bg-input)` / `var(--text-primary)` / `var(--accent-dim)`; Auto Detect / Browse / lock buttons → `var(--bg-btn)` / `var(--border)` / `var(--accent)`. The discovery-status banners (ok/warn/error) were rewritten with `color-mix` so the chip background blends into `var(--bg-base)` and the semantic hue mixes toward `var(--text-primary)` — contrast self-corrects on light and dark themes with no per-theme overrides. **Root fix for the "no title bar color / wrong menu background" report**: the wizard chrome ([wizard.css](src/renderer/styles/wizard.css)) used *different* bg vars than the Settings modal — `.wiz-modal` `--bg-raised` + `.wiz-header` `--bg-sunken`, which on Classic Light (`--bg-raised #efefef`, `--bg-sunken #fafafa`, `--bg-base #fff`, `--bg-hover #e8e8e8`) collapsed to a greyed body and a near-invisible title bar. Aligned them to the canonical `.sp-modal` / `.sp-header` vars (`--bg-base` body, `--bg-hover` header band, `--accent` title) so all themed dialogs read consistently. Same change also colorizes the Add Character wizard header (shared chrome).

- **"XML Stream Mode" → "Lich Frontend" ✅** — the Lich mode dropdown label now uses Lich's own term. Each flag (`--stormfront` / `--wizard` / `--avalon` / `--frostbite` / `--genie`) sets `$frontend` in Lich's [argv_options.rb](C:\temp\lich-dev\lich-5\lib\main\argv_options.rb) (`determine_frontend`), so the label matches what Lich docs / support requests call it. Display-only change (internal `lichMode` field name unchanged — no migration).

(Further Rakkor feedback items for this version are still being scoped.)

---

**v0.9.1 — GTK-friendly Lich launch (rubyw) + GTK-warning removal ✅**

Reverses the v0.9.0 "GTK not supported" stance by fixing the actual cause (Sekmeht: "I need to revisit the connection stuff to allow for GTK — it's the only way"). Binu showed Frostbite's launch line; reading Lich's source confirmed **Lichborne's connect model already matched** Frostbite's force-mode ([main.rb:365-396](C:\temp\lich-dev\lich-5\lib\main\main.rb#L365-L396), [argv_options.rb:309-341](C:\temp\lich-dev\lich-5\lib\main\argv_options.rb#L309-L341)) — the only difference was the *process spawn shape*.

- **GTK-friendly spawn shape ✅.** [LichConnection.launch()](src/main/connection/LichConnection.ts): (1) spawn **`rubyw.exe`** (GUI subsystem) not `ruby.exe` (console) — `resolveRubyw()` derives it from the configured ruby path (`/ruby\.exe$/i` → `rubyw.exe`, falls back if the derived file is absent so a path already at rubyw.exe is used verbatim); (2) dropped `windowsHide` (rubyw is windowless); (3) dropped the stderr **pipe** (the suspected GTK-flakiness cause) — Lich's stdout+stderr now redirect to `{userData}/Logs/lich-launch/{Character}.log` (truncated per launch), and `describeExit()` reads its tail for the error banner. `detached` + `unref()` + the child handle are retained. **`--stormfront` stays** (Lichborne is a Stormfront-class FE — `frostbite` has fewer caps in Lich's registry). Default ruby path stays `ruby.exe`; derivation happens at launch, no settings migration. [ConnectionManager.ts](src/main/connection/ConnectionManager.ts) passes `creds.character` for the per-session log filename.
- **Removed the v0.9.0 GTK-script advisory + the `client-notice` channel ✅** (the advisory was the channel's only consumer; it assumed GTK is broken, no longer the operating assumption). Gone: `maybeWarnGtkScript` / `GTK_CODE_RE` / `resolveLichScriptFile` / `scriptNameFromCommand` / `LICH_BUILTIN_CMDS` in [main.ts](src/main/main.ts), the `client-notice` IPC send, `onClientNotice` in [preload.ts](src/main/preload.ts)/[global.d.ts](src/renderer/global.d.ts), the GameWindow subscription, and the now-dead `gtkChecked`/`useLich`/`lichPath` Session fields. CLAUDE.md pitfall #54 rewritten as a tombstone (keeps the reusable lessons: Lich `Script.start` exact-then-prefix resolution; `bold:true`+no-preset renders monsterbold). `lichDirFrom` kept (used by other handlers).
- **Status — GTK expected-working pending empirical verification.** Confirm `;vars setup` / `kill-counter` paint + survive interaction under the new launch before treating it as guaranteed. CLAUDE.md GTK architecture note + launch section and DESIGN.md launch section updated to reflect the reversal.
- **Bug-check pass (no regressions found).** The new `Logs/lich-launch/` dir is isolated from the Session Log feature — every `readdirSync` in [sessionLog.ts](src/main/sessionLog.ts) is scoped to `charDir(character)`, nothing enumerates the `Logs` root as a character list, and `diskUsage` is per-character. Bulk/multi-character connect unaffected: per-session log files (no interleave), `serializeLichLaunch` unchanged, and the parent process holds *fewer* handles than the old per-session stderr pipe. Build + `tsc --noEmit` clean (main + renderer).

**v0.9.0 — Editable Lich variables + `;vars setup` GTK-disconnect investigation ✅**

Started as a tester bug report (`;vars setup` disconnects Lich on interaction) and grew into a feature: an in-app editor for Lich variables that replaces the crashing GTK setup window. Spans the v0.8.11 dev cycle (GTK/`;vars setup` investigation) + the new editor.

- **`;vars setup` disconnect — root-caused, declined to fix the script, built a replacement (B138, Sekmeht) ✅.** Read the live `vars.lic` at `C:\Ruby4Lich5\Lich5\scripts\vars.lic`. The setup window DOES paint under Lichborne — but [`vars.lic:136-141`](C:\Ruby4Lich5\Lich5\scripts\vars.lic#L136-L141) spawns a `Thread.new { sw.vadjustment.value = ... }` that mutates a GTK widget from a non-main thread inside the new-var textbox's focus-in handler, violating the thread-safety warning at [`gtk.rb:4`](C:\temp\lich-dev\lich-5\lib\common\gtk.rb#L4). Under `--stormfront` the race segfaults Lich → socket closes → Lichborne emits disconnect. It's a Lich-script bug, unfixable from our side without forking `vars.lic` (out of scope). **Corrected a long-standing CLAUDE.md error in the same pass**: the old "force-mode skips the GTK main loop" claim is wrong — [`lich.rbw:135`](C:\temp\lich-dev\lich-5\lich.rbw#L135) calls `Gtk.main` unconditionally when GTK is defined, and [`gtk.rb:148-155`](C:\temp\lich-dev\lich-5\lib\common\gtk.rb#L148-L155) registers a `GLib::Idle` yield, so the loop IS running. CLAUDE.md pitfall #52 + the architecture-section note both updated.
- **Editable Lich Variables — in-app replacement for `;vars setup` ✅.** [LichDashboard.tsx](src/renderer/components/LichDashboard.tsx) Variables tab gains add / inline-edit / two-click-delete affordances (`AddVarRow`, `EditableVarRow`). **Read stays SQLite** (the existing `lich:get-vars` + Marshal path — structured display of lists/hashes/times, cross-scope browse, graceful parse-error degradation; chosen over `;vars list` parsing because the Marshal storage format is a far more stable contract than the cosmetic list output, and command-read would need a stream-capture mechanism). **Writes go THROUGH Lich**: a single atomic `;eq Vars['name'] = value; Vars.save` (ExecScript) that mutates Lich's public `Vars` API AND forces an immediate disk flush — so a delete actually leaves storage and the SQLite read view is correct on the next refresh / reopen, instead of waiting up to 5 min for Lich's auto-save. The mutation + save share one `;eq` to avoid a race between two separate commands. Sent silently (no `>cmd` echo) since the optimistic UI is the feedback. **Gating**: edit controls only for `session.useLich` AND the connected character's own scope (`;vars` can only touch the attached session's memory — viewing another character's scope is read-only with a note). Values/names escaped as Ruby literals (`rubyLit`). Optimistic overlay (`pendingRef`, keyed by scope) bridges the sub-second gap so ↺ / reopen never flicker an edit back. Toolbar shows a "refreshed HH:MM:SS" stamp; footer explains the memory-vs-disk persistence model. **Design decision (Sekmeht)**: keep SQLite read + command write (the asymmetry is justified — read wants structure + cross-scope, write must mutate live memory). CLAUDE.md pitfall #53 documents the write-through-Lich + forced-save pattern.
- **GTK-script warning — first consumer of the client-notice channel ✅.** When the user starts a Lich script whose `.lic` source uses GTK, Lichborne surfaces a one-per-script-per-session `--- Lichborne:` advisory in the game stream that GTK code was detected and may disconnect Lich. **Hook**: `maybeWarnGtkScript` runs in the `SEND_COMMAND` handler in [main.ts](src/main/main.ts) after forwarding the command — so it fires the instant the user starts the script. **Detection**: `scriptNameFromCommand` extracts the script name from a `;`/`,` command (skips builtins via `LICH_BUILTIN_CMDS`; `force NAME` → arg 2), then `resolveLichScriptFile` replicates Lich's `Script.start` resolution exactly ([script.rb:65-84](C:\temp\lich-dev\lich-5\lib\common\script.rb#L82)) — custom/-first file list, **exact match then prefix match** — so an abbreviation like `;kill-cou` resolves to `kill-counter.lic` (the bug the first cut missed: it only checked the exact filename). The resolved file is scanned for `GTK_CODE_RE = /\bGtk::\w|\bGtk\.queue\b/` (any GTK class ref or the `Gtk.queue` wrapper; `\bGtk[.:]` avoids matching the bare word in prose). The message reports the **resolved** script name (`kill-counter`), not the typed shorthand. **Plumbing**: new `client-notice` IPC push (main → renderer) carrying `{ sessionId, text }`; `onClientNotice` in [preload.ts](src/main/preload.ts) + [global.d.ts](src/renderer/global.d.ts); GameWindow's subscription effect injects the line as a `bold: true` segment with no preset (renders monsterbold — `data-preset="bold"` → `var(--preset-bold)`, yellow in most themes — so it stands out like the game's own bold text; a first cut used `internal-system` + bold which came out gray-bold because an explicit preset wins over the bold→'bold' color fallback in renderSegment.tsx), bracketed by blank lines above/below. Per-session `gtkChecked: Map<name, boolean>` caches the scan (one dir-read per typed name; `true` also means "already warned"). **Scope per Sekmeht**: just "GTK detected, may disconnect" — no per-script "use X instead" steer (kept generic). CLAUDE.md pitfall #54 documents the detection + Lich-resolution-replication. Verified against the live `kill-counter.lic` (`Gtk.queue` + `Gtk::Box`/`Entry`/`Window`).
- **Future idea — generalized inline "client notice" facility (parked, Sekmeht)**: the GTK warning above is the first consumer of what should become a reusable `--- Lichborne:` notice channel (the `client-notice` IPC + `internal-system` preset are the seed). Generalize into a `ClientNotice` primitive — `{ sessionId, text, severity: info|warn|error, source, key, once: session|forever }` — emittable from main (IPC `client-notice`) and renderer (a `lichborne:client-notice` DOM event, same pattern as `lichborne:open-quick-send`), rendered as one styled severity-colored line with dedup. Future producers: config problems (Lich path / maps folder missing), migration/deprecation nudges, feature-discovery tips (`once: 'forever'`), import-result summaries, the GTK disconnect-correlation safety net. Deferred extensions: a dedicated scrollback **Notices** log/panel (inline-only until volume justifies it), and clickable `action: { label, command }` affordances on a notice. **Decision (Sekmeht)**: build the GTK warning standalone for now; generalize into the facility when a second/third producer makes it pay for itself.
- Build clean; **`tsc --noEmit` fully clean (0 errors)**. The GTK-work typecheck surfaced a **pre-existing** error in [lichborne.ts:110](src/renderer/import/parsers/lichborne.ts#L110) (`t.commands` off `Partial<TriggerRule>` — `TriggerRule` has `actions`, not `commands`; yielded `[]` so the F29 import *preview* showed no trigger commands, though the actual import via `nativeRules` was unaffected — pitfall #42). It had been shipping silently because esbuild/vite don't full-type-check. **Fixed in v0.9.0**: `commands` now derives from `t.actions` (the command-type actions: `filter(a => a.type === 'command').map(a => a.command)`), so the import preview shows a trigger's commands and the project is tsc-clean.

---

**v0.8.10 — `conversations` → `conversation` rename + shared stream aliases + speech double-echo fix ✅**

Driven by Jaded + Sekmeht noticing duplicate "Conversation" rows in Available Streams (a Lich-startup `<streamWindow id='conversation'/>` ghost stream) and tracing it back to Lichborne being the odd one out — every other Stormfront-family client uses singular `conversation` while Lichborne used plural `conversations`. Rename done as a coordinated source + shared-aliases-module + localStorage-migration release, plus a follow-on speech double-echo bug that surfaced during testing.

- **B134 (Sekmeht + Jaded) → B135 (Sekmeht) ✅.** B134 was the initial defensive STREAM_MAP entry routing the ghost `conversation` declaration to the existing plural panel; subsumed by B135's full rename. B135 made `conversation` (singular) the canonical Lichborne panel id everywhere, matching Genie's [`SafeCreateOutputForm("conversation", ...)`](C:\temp\Genie4-Dev\Genie4\Forms\FormMain.cs#L2786) and Frostbite's [`staticWindows`](C:\temp\Frostbite-Dev\frostbite\gui\windowfacade.cpp#L42) conventions. **Three coordinated pieces**: (a) source rename across `PanelType` / `PANEL_LABELS` / `ALL_PANEL_TYPES` / PanelFrame switch / GameWindow defaults + `STREAM_FALLBACK` + `NEVER_DISCOVER` / triggers `watchStream` option / SessionLogModal keep-list; (b) new shared [`src/shared/streamAliases.ts`](src/shared/streamAliases.ts) module with `STREAM_ID_ALIASES` and `normalizeStreamId(id)` — used by parser (replacing the inline `STREAM_MAP`), renderer's `echoToStream`, Genie's `parseEchoAction`, and F29 `lichborne.ts` parser (so legacy `'conversations'` watchStream / echoStream values on imported triggers get rewritten); (c) one-time localStorage migration in new [`src/renderer/localStorageMigrations.ts`](src/renderer/localStorageMigrations.ts) called from `main.tsx` before React renders — renames `'conversations'` → `'conversation'` in saved tabs (case-insensitive id/type/label, catches `'Conversations'` capital and other variants), active-id strings, `settings.panelFontSizes` keys, and trigger `watchStream` values. **Dedupe pass after rename** so a user with both a builtin plural tab AND a custom variant tab ends with one merged tab, not two duplicates. Migration flag is `conversationRename2` (bumped from `conversationRename` after the first version missed case-variant ids). **Whispers alias** also added (`whispers: 'conversation'`) matching Genie + Frostbite's combined Conversation feed convention. CLAUDE.md pitfall #50 documents the shared aliases module and when to add a new alias vs a new ID.
- **B137 (Jaded → Sekmeht) ✅.** Macro "type and wait" support — Wrayth / Genie / Stormfront convention where `@` in a macro command marks the cursor position and tells the macro "type this into the input box and wait for the user to finish typing." Lichborne previously always auto-sent macros; Jaded's `<k action="&apos;}"/>` Wrayth macro for `say` -targeted speech tried to send `'}` literally and got "To whom are you speaking?" every time. Verified the convention model by reading Genie's [`FormMain.cs:1140`](C:\temp\Genie4-Dev\Genie4\Forms\FormMain.cs#L1140) (`ParseInputBox`) and [`FormMain.cs:4079`](C:\temp\Genie4-Dev\Genie4\Forms\FormMain.cs#L4079) (`ClassCommand_SendText`): `@` is the universal cursor marker; `\@` escapes to literal `@`. Wrayth additionally uses `\r` as the explicit "send" marker — its absence means "wait." Fix in four pieces: new [`parseCursorMarker`](src/renderer/macros.ts) helper that detects `@` (and respects `\@` escapes); macro fire path in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) checks for cursor marker first, deposits text into command bar via `setCommand` + positions cursor with `setSelectionRange` after one rAF, stops iterating remaining macro commands; [Wrayth parser](src/renderer/import/parsers/wrayth.ts) translates absence of `\r` to a trailing `@` (so Wrayth's "no auto-send" semantics map to Lichborne's `@` mechanism); macro editor in [MacrosPanel.tsx](src/renderer/components/MacrosPanel.tsx) gets a tooltip explaining the convention. Simple Genie macros (`arrange @`, `skin @`, `transfer @ all`) already worked via the same `@` mechanism, but **compound Genie macros** with escape sequences needed an additional parser fix shipped in the same release: `parseArgs` rewritten to walk char-by-char and resolve Genie's Level-1 escapes (`\\` → `\`, `\}` → `}`, `\{` → `{`); `splitAction` now correctly preserves `@` markers through `;`-splitting and strips Genie's `\x` ("clear input") prefix at import time. **`\x` is purely import-time noise — Lichborne always replaces command-bar contents when typing, so the explicit clear is redundant. Only `@` triggers wait-mode**, NOT `\x` alone (deliberate simplification from Genie's two-mode behavior). So `#macro {F9, Control} {\\x;whisper group @}` imports as `whisper group @` — types `whisper group ` into the command bar with cursor at end, no auto-send; `#macro {Z, Alt} {\\x;'\}sekmeht @}` imports as `'}sekmeht @` — types `'}sekmeht ` with cursor at end. Genie variable references (`$speak`, `$whisper`, etc.) still won't expand — that's a separate feature, not in scope. DR's speech-target syntax `'}<person>` and `'@<person>` are interchangeable per Elanthipedia, so Jaded's macro is correct DR syntax; the fix just makes Lichborne respect Wrayth's "wait for input" behavior. CLAUDE.md pitfall #51.
- **B136 (Sekmeht) ✅.** Discovered during B135 testing: speech double-echoed in the main scroll when no Conversation panel was open. Root cause: STREAM_FALLBACK had `conversation: 'main'`, but DR's protocol already natively duplicates speech to main — every `<pushStream id="talk"/>"You say, Hi."<popStream/>` is followed by a second `"You say, Hi."` OUTSIDE the stream block that routes to main directly. With no Conversation panel watching, the inside-pushStream copy ALSO fell back to main via STREAM_FALLBACK, producing two copies. Fix: removed `conversation: 'main'` from STREAM_FALLBACK. Other streams (thoughts/arrivals/deaths) keep their fallbacks because DR doesn't natively duplicate those — speech and whispers (same XML pattern) are the only stream classes DR sends twice. CLAUDE.md pitfall #49 documents the STREAM_FALLBACK vs DR-native-duplicate interaction so a future stream addition doesn't reintroduce the double-counting bug.
- **v0.8.10 internal retroactive sweep — migration completeness check ✅.** Per the CLAUDE.md proactive bug-checking framework, swept v0.8.10's just-shipped work asking "what could a tester still hit." One real finding: the B135 localStorage migration only renamed the top-level `watchStream` field on triggers; it didn't walk `actions[].echoStream` on echo actions. A pre-v0.8.10 user who created a trigger that echoed to the (then-plural) "Conversations" panel would have legacy `echoStream: 'conversations'` saved — functionally still working via runtime alias normalization in `echoToStream`, but the trigger editor's dropdown would show the legacy value outside the option set. Fix: extended the trigger handler in [localStorageMigrations.ts](src/renderer/localStorageMigrations.ts) to walk both `watchStream` AND `actions[].echoStream`. Flag bumped to `conversationRename3` so users who already ran the prior migration get the (now echoStream-aware) re-run on next launch. Confirms the value of running these sweeps — small papercut would have surfaced as confusing "why is my echoStream value blank in the dropdown?" reports otherwise.
- Build + tsc clean. ✅
- **Tester upgrade story**: existing user with the plural "Conversations" tab gets it transparently renamed to "Conversation" on first launch of v0.8.10 — same position in their layout, label updated, speech routes correctly via `talk` → `conversation` mapping. No manual action required. Triggers watching `'conversations'` get their watchStream renamed too, AND trigger echo actions targeting `'conversations'` get their echoStream renamed (post-sweep fix). Per-panel font sizes carry over via the panelFontSizes key rename.

---

**v0.8.9 — Import safety overhaul + Lich Map inactive-tab fix + Genie command catalog ✅**

A focused release driven by JadedSoul's import testing across Wrayth / Genie / Frostbite combinations and Sekmeht's observation that Lich Map tracking on inactive character tabs got stale.

- **Imports never wipe categories they don't carry (B127, Jaded) ✅.** The catastrophic bug Jaded hit: imported all her Genie configs (highlights / triggers / aliases / macros), then imported Wrayth (only macros/names) on Replace mode — Wrayth Replace wiped her Genie triggers and aliases because the save calls ran with empty arrays for those categories. Append mode had the same shape on a milder path (deselecting a category in the second import). Root fix in [ImportWizard.tsx](src/renderer/components/ImportWizard.tsx)'s `doImport`: every `saveX(...)` call is now gated on `mapped[type].length > 0`. Same guard applied to the F29 native-data blocks (`nativeGroups`, `nativeModes`, `nativeContacts`, `nativeContactTemplates`). Wrayth never touches triggers / aliases (its parser returns `[]` for them); Frostbite never touches triggers / aliases / contacts; Genie touches everything but only with selected data. Every combination of legacy clients now plays nicely — no category can be wiped by an import that doesn't carry that category. CLAUDE.md pitfall #47 documents the "save guards on multi-category sources" principle so a future rule type doesn't reintroduce the wipe.
- **Imported AND newly-created triggers default `watchStream: 'main'` (B128, Jaded) ✅.** `watchStream: 'any'` caused speech triggers to double-fire because DR routes "Bob says X" into both `main` and `conversations` streams. Fixed in [mapper.ts:121](src/renderer/import/mapper.ts#L121) for imported triggers and [triggers.ts:151](src/renderer/triggers.ts#L151) for the "+ New Trigger" UI default. Users who want a stream-specific trigger can still change it; `main` matches the source semantics for every legacy client.
- **Wrayth macro XML entities now decoded (B129, Jaded) ✅.** Jaded's speech macro `'}` was stored in Wrayth's settings.xml as `&apos;}` (XML-escaped because attribute values use `'...'` quotes), and our `getAttr` at [wrayth.ts:8](src/renderer/import/parsers/wrayth.ts#L8) returned the raw string. The imported macro sent `&apos;}` to DR → "Please rephrase that command" every time. Fix: new `decodeXmlEntities` helper that decodes the five standard XML entities (`&apos;` `&quot;` `&amp;` `&lt;` `&gt;`); `getAttr` runs every attribute value through it. `&amp;` is decoded last so we don't double-decode entities introduced by earlier replacements.
- **Genie `#send #X` / `#put #X` recursive (B130, Jaded) ✅.** Jaded's confirmed `#send #flash` case: the source Genie trigger had `#send #flash` (someone wrapped a Genie internal in `#send` thinking they needed to "execute" it). Pre-v0.8.9 the parser stripped `#send ` and pushed `#flash` as a literal DR command — DR rejected with "Please rephrase that command" on every trigger fire. Fix in [genie.ts:317-342](src/renderer/import/parsers/genie.ts#L317-L342): when the inner content of `#send`/`#put`/`#q`/`#que`/`#queue` itself starts with `#`, recursively process it via `parseActionParts` instead of treating as a DR command. So `#send #flash` → flash action correctly; `#send #beep` → beep action; etc.
- **Lichborne→Lichborne imports force append-only (B131, Jaded) ✅.** Self-imports ("merge my setup from another character") never want Replace mode (which wipes the recipient's rules per category). The Replace radio is now hidden when `source === 'lichborne'`; switching to Lichborne source auto-resets merge to `'append'`. Replace remains available for legacy client imports where "give me a clean baseline from this other tool" is a legitimate workflow. Both merge descriptions also updated to reflect the new per-type behavior — Append for Lichborne now explicitly says "duplicates are skipped automatically"; Replace for legacy says "categories the import doesn't touch are left alone."
- **Lich Map indicator stuck on inactive character tabs (B132, Sekmeht) ✅.** Direct port of GenieMapView's B88 fix (v0.7.0) to MapImageView — the bug class was the same but the fix only got applied to Genie. The auto-centering effects at [MapImageView.tsx:113-146](src/renderer/components/panels/MapImageView.tsx#L113-L146) now bail when `svg.clientWidth/clientHeight` are 0 (inactive tab → `display:none` → 0×0 SVG → garbage transform `x = -cx*scale` strands the camera). New ResizeObserver on the SVG (`useEffect([])` with `recenterRef` for closure-staleness) catches the 0→size transition when the tab is shown again and calls `recenter()` so the camera snaps to the player's actual room. Per [CLAUDE.md pitfall #24](CLAUDE.md), inactive tabs still process room-state updates correctly; only the camera positioning needed visibility-aware handling.
- **Genie command catalog — expanded coverage + silent-drop hole closed (B133, Sekmeht) ✅.** Sekmeht enumerated Genie's complete `#command` list from [Genie4 source](C:\temp\Genie4-Dev\Genie4\Core\Command.cs#L270) to identify gaps. **New aliases recognized**: `#q`/`#que`/`#queue` (game commands, same as `#put`/`#send`); `#variable`/`#setvar`/`#setvariable`/`#tvar`/`#tempvar`/`#tempvariable`/`#svar` (variable actions, same as `#var` — Lichborne doesn't distinguish var scope at the action layer); `#playsound`/`#playwave` (sound actions, same as `#play`); `#bell` (beep, same as `#beep`). **`##escape` now correctly handled** — `##5` strips the leading `#` and sends `#5` to the game (Genie's escape syntax). **Silent-drop hole closed**: pre-v0.8.9, any unrecognized `#command` was silently dropped — the user thought their trigger imported correctly but got an empty actions list. Now every unrecognized `#command` lands in the `dropped` array which surfaces in the import preview as "Unsupported actions skipped: #X, #Y". `#nop` and `#comment` are explicit no-ops (silently dropped without "Unsupported" warning since the user never intended them to do anything). CLAUDE.md pitfall #48 documents the Genie command landscape (what we map, what we drop with a note, what's silently ignored as no-op).
- Build + tsc clean. ✅

---

**v0.8.8 — Bug-fix release: B122 real fix (Footer + pin retention) + Room panel mirrors main-scroll line-mode highlights + Mode button scaling ✅**

- **B122 actually fixed (Rakkor) ✅.** v0.8.7's threshold-lowering attempt didn't solve the half-row prompt clip at font 13+. Rakkor confirmed it still clipped post-release, and his diagnostic "I can manually scroll down ~half a row to reveal the prompt" proved both raw DOM math AND Virtuoso's `scrollToIndex({ align: 'end' })` API converged on the same wrong target — a CSS layer issue, not a scroll math issue. Real fix: added a `components.Footer` on Virtuoso rendering `<div style={{ height: 14 }} />`, gated on `settings.fontSize >= 13`. Defensive layout slack that doesn't require knowing why both scroll APIs land short. Constant 14px chosen over `1em` because Sekmeht reported the 1em version "added 1px to the gap per font step" which felt inconsistent — 14px covers half-row clip at fonts 13-19 with same visual gap. **Pair fix in same release**: re-snap to bottom via `scrollToIndex({ align: 'end' })` when `settings.fontSize` / `lineHeight` / `largePrint` changes AND `pinnedRef.current` was already true — font changes reshape row heights, growing scrollHeight, leaving previously-pinned scrollTop short of the new bottom. Bails on `!pinnedRef.current` so scrolled-up readers stay anchored. CLAUDE.md pitfall #43 documents the general principle: when two independent scroll APIs converge on the same position but the DOM has scrollable content past it, the bug is layout, not math — add slack instead of chasing scroll-math hypotheses. Three failed hypotheses before landing on this; the lesson is now in CLAUDE.md so future-me doesn't repeat them.
- **Line-mode highlights now apply in Room panel structured sections (F36, Rakkor) ✅.** Requested by Rakkor — his treasure highlights painted blue in the main scroll's "You also see ..." line but the Room panel's Objects section showed the same items plain. Root cause was B111's deliberate exclusion of `lineRules` from RoomPanel, with the rationale "lobster shouldn't paint the whole section." That rationale turned out to be over-cautious: in the main scroll the same content gets line-mode treatment when the user authored a line-mode rule, so showing the same content un-painted in the Room panel was the inconsistency. Fix in [RoomPanel.tsx](src/renderer/components/panels/RoomPanel.tsx): destructure both `matchRules` and `lineRules`; `renderSegments` now returns `{ nodes, style }` with the line style computed per-section via `getLineHighlightStyle(segments, lineRules)`; each section's container div applies its own per-section style so a player-matching rule paints only the Players section. `desc` deliberately stays out (multi-sentence prose, would over-paint). Same architectural pattern as B117 (Room panel mirrors main-scroll styling for the same content). CLAUDE.md pitfall #44 documents the "RoomPanel mirrors main scroll" principle so future styling additions don't have to re-litigate the exclusion.
- **Lich Map "hangs on prior room until LOOK" tracking bug (B126, Rakkor) ✅.** Reported by Rakkor — intermittent, similar to B110's Genie Map symptom but on the Lich Map side. Root cause: the parser's `<nav>` handler at [StormFrontParser.ts:523-528](src/main/parser/StormFrontParser.ts#L523-L528) silently dropped `attrs.rm`, the new room id DR carries on every nav tag. For most transitions DR also sends `<streamWindow id='main' subtitle='[Title - rmId]'/>` right after which updates roomId via the streamwindow handler, but for some transition shapes (teleports, NPC-induced moves, scripted moves) DR is silent on `<streamWindow>` while still sending `<nav rm>` — for those, the front-end never got the new roomId. Lich's `$room` variable was correct the whole time because Lich's scripting reads `attrs.rm`; only the Lichborne front-end was blind. Fix: new `RoomIdEvent` type in [shared/types.ts](src/shared/types.ts) (`{ type: 'room-id', roomId: number }`); parser's `<nav>` case now parses `attrs.rm` and emits the event when numeric; [GameWindow.tsx](src/renderer/components/GameWindow.tsx) routes it into `roomUpdates.roomId` only (leaves title/desc/sub-streams alone — forging an empty title would wipe the only data we have). The Lich Map's match path tries `lichDb.get(roomId)` BEFORE the title fallback, so a fresh roomId is sufficient for the indicator to track. **Doesn't fix**: Room panel title (still stale until real `<streamWindow>`), Genie Map (its memo is title-based, not roomId; B110's escape valve still handles that symptom). **Caveat**: this fix only helps when DR sends `<nav rm>` but not `<streamWindow>`. If DR is silent on both, LOOK is still the only recourse. CLAUDE.md pitfall #46 documents the `<nav rm>` extraction.
- **Mode toolbar button + popover items now scale with font size (Sekmeht) ✅.** Spotted by Sekmeht reviewing the toolbar. `.btn-mode-switcher` used `font-size: 0.75rem` — `rem` ignores user font preference, so it stayed at ~12px while every other toolbar button grew with `settings.fontSize`. Same em-vs-rem footgun B113 was about. Fix in [mode-switcher.css](src/renderer/styles/mode-switcher.css): switched the button to `font-size: 1em` to match the other toolbar buttons (which inherit from `.game-toolbar` via em). The popover items (`.ms-item` etc.) can't inherit from `.game-toolbar` because the popover is portaled to `document.body`, so they got `var(--game-font-size)` directly with multipliers preserving the original visual hierarchy. CLAUDE.md pitfall #45 codifies the rule: game-area UI uses em / `var(--game-font-size)` for sizing that should scale; never `rem`.
- Build + tsc clean. ✅

---

**v0.8.7 — Bug-fix release: command history Down clamp + Room sub-stream stale clear + prompt-cutoff threshold + duplicate stream-discovery dedup + F29 round-trip fidelity ✅**

- **F29 Lichborne→Lichborne round-trip silently stripped rule fields (B124) ✅.** Found by Sekmeht's proactive retroactive sweep on v0.8.7 — not yet tester-reported. Shipping silently since F29 landed in v0.8.4. The export at [AutomationsPanel.tsx](src/renderer/components/AutomationsPanel.tsx) bundled full native rule objects via `loadHighlights(character)` etc., but the parser at [lichborne.ts](src/renderer/import/parsers/lichborne.ts) routed everything through the `ImportCandidate` intermediate ([types.ts](src/renderer/import/types.ts)) which was designed for Wrayth/Genie/Frostbite shapes and doesn't model most native Lichborne fields; the mapper then hardcoded defaults for everything missing (`bold: false`, `glow: false`, `groupIds: []`, `allGroups: true`, `gates: []`, `oneShot: false`, `name: ''`, etc.). **Most damaging loss**: `groupIds`/`allGroups` across every rule type — F29 is marketed as "share my hunting setup," but the user's rules-in-hunting-group came in as rules-in-no-group on import. **Fix (Option B — Lichborne source bypass)**: added `nativeRules?: { highlights, triggers, macros, aliases }` to `ImportResult`; parser builds it in lockstep with the ImportCandidate arrays (fresh ids via nanoid; trigger nested action ids regenerate too); [ImportWizard.tsx](src/renderer/components/ImportWizard.tsx)'s apply step prefers `nativeRules` over the mapper output when present. Non-Lichborne sources (Wrayth/Genie/Frostbite) keep the legacy mapper path since their source shapes genuinely need translation. Existing content-based dedup (`hlContentKey`/`trContentKey`/`key`/`input`) works unchanged on native rules. CLAUDE.md pitfall #42 documents the bypass pattern so a future rule type doesn't reintroduce the loss.
- **Command history Down arrow accumulated negative count past empty (B120) ✅.** Reported by Binu — from a clear command box, pressing Down 3 times then needing 4 Ups to get the last command back, and entering a fresh command after over-pressing Down cleared the "blank entries" pseudo-state in a way that didn't match user expectation. Root cause in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) command-bar keydown handler: the Down-arrow path did unbounded `historyIdxRef.current - 1` without a floor, so each press past `-1` (the "no history selected" sentinel) drove the ref deeper negative. Up-arrow's `historyIdxRef.current + 1` then had to crawl back through that negative depth before any history entry surfaced. Fix: `Math.max(-1, historyIdxRef.current - 1)` — Down clamps at the empty state instead of accumulating. Up was already correctly bounded by `Math.min(h.length - 1, historyIdxRef.current + 1)`.
- **Room sub-stream sections (Players / Objects / Creatures / Extra / Exits) showed stale data after room transitions (B121) ✅.** Reported by Rakkor — Players section listed people who weren't in the room until a forced `LOOK`. Root cause: the components that populate the Room panel's sections (`<component id='room players'/>` etc.) carry over from the previous room when DR doesn't re-emit them for a transition. Without an explicit clear, the Room panel surfaced stale player/creature lists. Fix at the parser layer ([StormFrontParser.ts](src/main/parser/StormFrontParser.ts)) rather than GameWindow event batching, because the parser sees `<streamWindow>` → `<component>` in a deterministic order while GameWindow's IPC-batched events can arrive split across multiple batches. New `lastRoomTitle: string` field on the parser; in the streamWindow handler, when `cleanTitle !== lastRoomTitle` emit `clear-stream` for `room`, `room-objects`, `room-players`, `room-creatures`, `room-extra`, `room-exits` BEFORE the typed `room-title` event. Components that DO arrive for the new room then re-populate via their own clear+stream-text flow; sections that don't arrive stay correctly empty. Gating on `lastRoomTitle` means a `<streamWindow>` re-emit with the same subtitle (DR sends these for non-transition repaints) doesn't clobber freshly-populated sub-stream data. CLAUDE.md pitfall #41 documents the parser-vs-batch ordering rationale. **B121 may also marginally help the long-standing Genie Maps stale-location bug** (Rakkor's follow-up observation): clearing `roomDesc` on subtitle change ensures the GenieMapView `currentLocation` adjacency-disambiguation memo never sees a ghost description from the previous room. The primary fix for "Genie forgets location" is still B110's escape valve.
- **Bottom prompt/display halfway cut off at font size 13+ (B122) ✅.** Reported by Rakkor — bottom of the scrolling text shaved off at font 13+, with a brief scrollbar nudge visible just before the next command snapped it back. Root cause in [GameWindow.tsx](src/renderer/components/GameWindow.tsx)'s Virtuoso `totalListHeightChanged` handler: the re-pin distance check was `dist > 2`, which was set conservatively in the v0.6.x performance pass to ignore sub-pixel rounding. At font 13+ each row is ~20px tall vs ~17px at font 12, so the fractional offset Virtuoso introduces on height recompute can land at 1.5–1.9px — under the threshold, so the re-pin didn't fire. Lowered to `dist > 0.5`: still immune to actual fractional-pixel rounding (browsers don't land 0.3-0.5px shifts spuriously), catches real cutoffs at any font size. The scrollbar twitch was the moment the new content rendered above the prompt and the pin-correction missed it; with the lower threshold the correction fires and the prompt sticks to the bottom.
- **Duplicate "Kill Counter" rows in PanelManager from a single Lich script (B123) ✅.** Reported by Sekmeht via Rakkor's `newkill-counter.lic` — running the script produced TWO identical "Kill Counter" rows in Panel Manager, and adding one to a panel hid both. Root cause: the script emits `<streamWindow id='KillCounter' title='Kill Counter' .../>` immediately followed by `<pushStream id='KillCounter'/>` in the same XML batch. The parser correctly emits a `stream-declare` event for the streamWindow and a `stream-push` event for the pushStream — both push the same id `KillCounter` into [GameWindow.tsx](src/renderer/components/GameWindow.tsx)'s `newDiscovered` array in the same IPC batch. The existing dedup filter only checked against `discoveredStreams` already in state (`existing.has(id)`) — it did NOT dedupe within `newDiscovered` itself, so both entries passed and `discoveredStreams` ended up with `['KillCounter', 'KillCounter']`. PanelManager rendered one row per array entry, and adding either entry to a panel made `openCustomIds.has('KillCounter')` true → both rows filtered out together. Fix: added a `seenInBatch: Set<string>` to the filter; first entry in a batch passes and gets added to the Set, duplicates within the same batch are rejected. `discoveredStreams` is in-memory only (no persistence), so any existing duplicate clears on next launch with no migration. CLAUDE.md pitfall #40 documents the dedupe-within-batch requirement.
- Build + tsc clean. ✅
- **Investigation: Ruby GTK script windows under Lichborne (2026-05-30)** — Sekmeht reported that `kill-counter.lic` (from the Lich script repository) doesn't render its window under Lichborne but works in other clients. Investigated; root cause is the `--stormfront --dragonrealms` force-mode launch skipping Lich's entry GUI, which is what starts the GTK main loop. The ruby-gtk3 gem still loads (`HAVE_GTK` true), so the script's startup gate doesn't trip and the script's non-UI logic runs normally — `Gtk.queue` blocks just sit in a queue nothing pumps. Three theoretical fix paths evaluated (detect-and-warn UX, change launch model to keep GTK main loop alive, document-and-steer); all declined per the "display/configuration layer over Lich, not a Lich-replacement" product principle. Documented as a Known Limitation in BUGS.md and README.md, with a deflection path in CLAUDE.md so a fresh session doesn't chase the symptom as a bug. Script authors are pointed at the `<streamWindow>` / `<pushStream>` XML approach (see `newkill-counter.lic`) which renders as a regular panel and works in every front-end. **[Corrected 2026-06-01, v0.9.0]** — the root-cause claim in this entry is **wrong**: `--stormfront` does NOT skip the GTK main loop. [`lich.rbw:135`](C:\temp\lich-dev\lich-5\lich.rbw#L135) calls `Gtk.main` unconditionally when the gtk3 gem is loaded; the loop IS running. The real failure family is GTK-runtime timing/threading flakiness (windows paint intermittently, and interacting with a painted window can crash Lich — the `;vars setup` / B138 shape). And the "detect-and-warn UX" path that was declined here was later **adopted** in v0.9.0 (the GTK-script advisory). See the v0.9.0 entry, BUGS.md, and CLAUDE.md pitfalls #52/#54 for the corrected understanding.

---

**v0.8.6 — Command-bar UX polish + contact stats + Classic Light theme ✅**

- **New built-in light theme "Classic" (F35) ✅.** Requested by Rakkor (TheTargonian) — promoted from his "My Ivory" custom build to a built-in so it ships with Lichborne. Indigo accent on a true white canvas with hand-tuned room/exp/map colors. `id: 'classic-light'` keeps persistence unique while the display name "Classic" sits next to the existing dark Classic in the picker — the swatch dot (black vs white) is the visual differentiator. Theme constant + catalog entry in [themes.ts](src/renderer/themes.ts); ThemePicker uses `item.id` for React keys so the same-display-name pairing is safe.
- **Per-contact social stats — Encounters + Time Encountered (F34) ✅.** Sekmeht's idea extending the existing last-seen tracking. New optional fields on `Contact`: `encounterCount`, `timeSpentMs`, `lastEncounterAt` (internal cooldown timestamp). Detection uses **two gates**: `(now - lastSeen) > ABSENCE_THRESHOLD_MS` (90s — they actually left) AND `(now - lastEncounterAt) > ENCOUNTER_COOLDOWN_MS` (10 min — quick exit-then-re-enter doesn't double-count). Single-gate cooldown alone was insufficient: a contact staying in your room for >10 min would re-tick the counter whenever room.players changed. New 60s polling tick accumulates `timeSpentMs`; uses `pendingContactsRef.current ?? contactsRef.current` as base so it doesn't clobber buffered last-seen updates (companion to B119's pending-clear pattern). UI in [ContactsPanel.tsx](src/renderer/components/ContactsPanel.tsx) shows stats below "Last seen" with a per-contact Reset button; [ContactPopover.tsx](src/renderer/components/ContactPopover.tsx) mirrors the same counters in the click-popover — always rendered (Rakkor's follow-up: hiding at zero made the feature invisible for fresh contacts). Popover notes `max-height` also bumped 100→200px so mid-length notes don't force a scroll, and popover width 240→290px so the stats row's values don't wrap below their labels. Persistence rides through `saveContacts` → localStorage → `buildCharacterProfile` YAML pipeline automatically; F29 import/export carries the new fields through `nativeContacts`. CLAUDE.md pitfalls #36 (pendingContactsRef invariant) and #37 (encounter detection gates) document the architectural traps.
- **Contacts save race fixed (B119) ✅.** Reported by Rakkor — adding a 12th contact named "Ruik" didn't persist. Root cause: the last-seen tracker's `pendingContactsRef` buffer held a snapshot of the OLD 11-contact list; while it was buffered, the user added Ruik via ContactsPanel which wrote 12 to localStorage, but 2s later the buffer flushed the stale 11 back and clobbered Ruik. Fix in [GameWindow.tsx](src/renderer/components/GameWindow.tsx): new no-deps `useEffect([contacts])` clears `pendingContactsRef` + `clearTimeout(lastSeenTimerRef)` whenever contacts state changes externally. Documented as CLAUDE.md pitfall #36.

- **Click the `>` prompt marker to open Quick Send (F33) ✅.** Requested by Rakkor (TheTargonian). The marker in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) is now a `<button>` that dispatches a `lichborne:open-quick-send` custom DOM event on click; AppShell's listener reads the visible session-shell's `.command-input` value and opens QuickSend prefilled — identical to Ctrl+Shift+Enter. Custom event avoids prop-drilling through every GameWindow when AppShell already owns the QuickSend modal state and queries the DOM for the source input. Button styling in [game.css](src/renderer/styles/game.css) strips browser button chrome so the glyph still reads as a plain `>`; hover brightens to `--accent`; `:focus-visible` outline for keyboard users; tooltip advertises the Ctrl+Shift+Enter chord.
- **F31 font controls clear the scrollbar (B118) ✅.** Self-found while exercising F31 on a scrollable Stream panel. Buttons were `right: 4px` and sat directly over the 12px global scrollbar when content scrolled. Bumped to `right: 18px` in [panel-frame.css](src/renderer/styles/panel-frame.css) (12 scrollbar + 4 gap + 2 padding).
- **Click a character tab to auto-focus the command bar (F32) ✅.** Requested by Rakkor — clicking tabs left focus wherever it was. New `useEffect` in [App.tsx](src/renderer/App.tsx) watching `activeId` runs `refocusActiveCommandBar()` on every change, so click / Ctrl+Tab / Ctrl+1..9 / any future trigger all converge on the same focus-via-rAF pattern from v0.7.1's B91. Generalized from "called explicitly per handler" to "reacts to state change."

**v0.8.5 — B115 follow-through (priority overlay) + chip height tweak + per-panel font size + layout export + Room panel monsterbold ✅**

- **Room panel creatures render with DR's monsterbold styling (B117) ✅.** Reported by Rakkor (TheTargonian) — `look` showed creatures bold/colored in the main scroll but plain in the Room panel's Objects section. Root cause at the parser: `captureBuf` was a single string, so `<pushBold/>...<popBold/>` inside `<component id='room objs'/>` was flattened to text-only by the time it left the parser. Fix: added `captureSegments: TextSegment[]` alongside `captureBuf` in [StormFrontParser.ts](src/main/parser/StormFrontParser.ts); `text()` pushes each non-empty text node into the array with current `boldDepth` state; component-emit prefers `captureSegments` over the single-segment fallback. captureSegments resets at all 7 sites that init captureBuf. `RoomState.objects` / `players` / `creatures` / `extra` switched from `string` → `TextSegment[]` ([shared/types.ts](src/shared/types.ts)); `desc` kept as string for MapPanel compat. RoomPanel's new `renderSegments(segments, keyBase)` builds joined `lineText` + per-segment offset and routes through `renderSegmentFull`, so cross-segment regex (B115) + priority overlay (B116) + monsterbold (B117) all compose. Contact-tracking effect joins segments to text for the regex sweep.
- **Lichborne export now carries panel layout (F29 extension) ✅.** Requested by Rakkor right after F29 landed in v0.8.4. Bumped export format v1 → v2 in [AutomationsPanel.tsx](src/renderer/components/AutomationsPanel.tsx); new `buildLayoutSnapshot(character)` reads every layout-related localStorage key (all four `*Added` booleans + `*Tabs` arrays + `*ActiveId` strings + `*Height` numbers + `panelWidth`) plus `panelFontSizes` from settings. Parser accepts v1 or v2, rejects > v2. ImportWizard surfaces an opt-in "Apply imported panel layout" checkbox on the confirm step when the file carries layout; doImport writes the keys back via direct localStorage.setItem (boolean/numeric/string/JSON helpers, each type-checked); panelFontSizes merges into existing settings non-destructively. Layout reads happen at GameWindow mount, so the user reconnects to apply — done-stats notes "(reconnect to apply)".
- **Per-panel font size (F31) ✅.** Requested by Rakkor. New `AppSettings.panelFontSizes: Record<string, number>` keyed by tab id. Floating **A−** / **A+** buttons in the panel-body's **bottom-right** corner ([PanelFrame.tsx](src/renderer/components/PanelFrame.tsx)) — top-right initially conflicted with Exp's Sort/Focus pickers and similar panel headers; bottom-right is freer. Vertical (stacked) layout halves the horizontal footprint. Opacity 0.15 at rest → 0.6 on panel-frame-body hover → 1.0 on button hover; `pointer-events: none` until hover so clicks pass through to content beneath. ±1 px per click, clamped 8–24. PanelFrame applies the override as a `--panel-font-size` CSS var inline on the body wrapper; [panels.css](src/renderer/styles/panels.css) rules for `.stream-panel` / `.room-panel` / `.exp-panel` / `.injuries-panel` use `var(--panel-font-size, var(--game-font-size))`. **Two fixes during testing**: (1) `.text-line` in [game.css](src/renderer/styles/game.css) had its own `font-size: var(--game-font-size)` rule that won by specificity over the panel parent's font-size, so stream panels (Active Spells / Thoughts / Conversations / etc. — every TextLineRow consumer) silently didn't scale. Switched to `var(--panel-font-size, var(--game-font-size))`; main scroll unaffected since it's outside any `.panel-frame-body` where the var would be defined. (2) `onAdjustPanelFontSize` wrote to localStorage but didn't call `scheduleProfileSave`, so the YAML profile only got the new size when some other setting changed. Now matches the Settings panel pattern with the trio: setSettings + saveSettings + scheduleProfileSave. Round-trip verified: A− click → localStorage → debounced YAML → next mount → loadSettings re-reads it → PanelFrame applies. **Scope**: text-heavy content panels (every `.text-line` consumer + room/exp/injuries) respect the override; Map/Debug/Lich Scripts have their own CSS rules without the var-with-fallback so they don't visibly scale (mostly chrome — extension is one-line CSS per file when requested).
- **Match highlights silently dropped when a contact match started at the same position (B116) ✅.** Reported by Rakkor (TheTargonian) — v0.8.4's B115 fix made the regex correctly match cross-segment lines (confirmed via Debug → Fires), but the actual rendering still showed no highlight. Diagnosis: contact `You` at the start of "Your" tied with the highlight start, and the old "first wins, drop overlapping" algorithm wiped the entire highlight because contact won the tie. Replaced overlap-removal in [renderSegmentFull.tsx](src/renderer/utils/renderSegmentFull.tsx) with a boundary-based priority overlay: collect every range start/end into a sorted boundary set, find the highest-priority range covering each gap (contact > highlight > base), merge same-range adjacent gaps into runs. Result: contact wins inside its own range, highlight wins outside contacts, base everywhere else. Backward-compatible — non-overlapping ranges produce identical output to the old algorithm. Side benefits: nested contacts resolve consistently, multi-highlight overlaps don't drop silently. B115's lineText/segOffset cross-segment matching is preserved unchanged.
- **RT / CT chip height reduced by 1/3 (F30 follow-up) ✅.** Reported by Rakkor — v0.8.4's doubled chips (16×12px) looked great horizontally but were too tall vertically. Tweaked [game.css](src/renderer/styles/game.css): height 12→8px, border-radius 3→2px (proportional softening at the new aspect). Width 16px and 4px gap kept — those landed perfectly. Strip is ~33% less vertically intrusive on the command bar while remaining glance-countable.
- **AppSettings.panelFontSizes field added for upcoming per-panel font-size control (F31, partial) ⏳.** New `panelFontSizes: Record<string, number>` field on AppSettings; defaults to `{}`. Rides through `loadSettings` / `saveSettings` / YAML serialization automatically. UI (floating +/- buttons per panel) not yet built — Rakkor's request for the layout-export extension means we want the field in place so it ships in the eventual export bundle.

**v0.8.4 — Theme polish + Lich Map walk-step flash + Genie Map zone-tracking escape + Room panel highlights + accessibility audit + Lichborne import/export + chip UX ✅**

- **RT / CT timer chips doubled in size with tighter gap (F30) ✅.** Requested by Rakkor (TheTargonian) — old 8×6px chips with 6px gap were too tiny to glance-count, defeating the "see remaining time without looking away" purpose. [game.css](src/renderer/styles/game.css): width 8→16, height 6→12, gap 6→4, border-radius 2→3 (proportional softening). Confirmed live: "I don't even have to count to know that's 5."
- **Match-scope regex highlights didn't apply across multi-segment lines (B115) ✅.** Reported by Rakkor — `Your mind hears .*? thinking,` worked in editor preview but not in the Thoughts stream. Root cause: DR wraps player names in XML attributes that fragment a line into 3+ segments, and `renderSegmentFull` ran each regex against a single segment's text in isolation. Line-scope highlights already joined `fullText` first; match-scope needed the same treatment. Fix: `renderSegmentFull` gained optional `lineText` + `segOffset` params; matches found in the joined text are intersected with each segment's range and translated to segment-local coords. [TextLineRow.tsx](src/renderer/components/TextLineRow.tsx) builds the joined text once per render and threads the running cursor offset through. Contact-name lookups (nameRegex) get the same fix for free. Covers main scroll + every stream panel.
- **Lichborne-to-Lichborne import / export (F29) ✅.** Requested by Rakkor (TheTargonian) — wants a clean "share just my hunting setup" file separate from the per-character profile YAML. New Export button in the Automations panel header bundles `highlights` + `triggers` + `macros` + `aliases` + `groups` + `modes` + `contacts` + `contactTemplates` into a `formatVersion: 1` YAML and triggers a browser download. New "Lichborne" tile (4th option) in the Import Wizard with a YAML file slot; new parser at [parsers/lichborne.ts](src/renderer/import/parsers/lichborne.ts) does a near pass-through into ImportCandidate shape so the existing preview UI works, with groups/modes/contacts/templates riding along on new `nativeGroups`/`nativeModes`/`nativeContacts`/`nativeContactTemplates` fields. File picker's `accept` extended from `.cfg,.ini,.xml` to also include `.yaml,.yml`. **Dedup uses content-based keys** (mapper.ts assigns fresh nanoids on every import, so id-based dedup never matched anything for highlights/triggers — silent bug in the first draft, fixed): highlights by pattern+scope+caseSensitive, triggers by pattern+caseSensitive, macros by key, aliases by input. Replace-merge bypasses dedup. **Preview visibility**: per-index `dupH`/`dupT`/`dupM`/`dupA` flag sets computed in `goToPreview`; duplicate rows render with a muted `EXISTS` badge in the Status column and `opacity: 0.55` so they recede; new "Hide items already in this profile" toggle in the select-bar declutters the view. **Replace-mode safety**: an earlier draft auto-unchecked duplicates in the initial selection, which broke Replace merge (the unchecked duplicates would be wiped from the user's profile along with everything else). Reverted to ship everything checked by default; duplicates are flagged but stay selected so Replace works correctly and Append silently skips them at apply time with counts on the done screen. Automations header Export/Import buttons also aligned with the main toolbar button pattern (softer `--text-muted` resting, `--accent-dim` border on hover with `--bg-hover` surface and 0.2s transition) — previous full-`--accent` hover with no transition read as "loses the theming" on high-contrast themes.


- **Accessibility overlays (color-blind + high-contrast) silently erased by theme writes (B114) ✅.** Self-found while auditing colorblind propagation per the developer's request. `applyTheme` / `applyCustomTheme` in [themes.ts](src/renderer/themes.ts) write every theme var to `:root`, overwriting overlap with the overlay vars — so ThemeEditor live editing (every keystroke), ThemePicker preview paths, and theme switching all clobbered the overlay until something else triggered re-apply. Fix: themes.ts gained a `registerThemeAppliedHook(fn)` post-apply hook. GameWindow's theme-apply effect registers a callback closing over the active session's `settings` and re-runs `applySettingsToDOM(settings)` after every theme write. Cleanup on effect teardown clears the hook so an unmounted character can't apply its overlay over the next active character. The registration pattern avoids the circular dep that a direct settings.ts import from themes.ts would create.
- **Game text "not as black" as Frostbite — new Text weight setting (B113) ✅.** Reported by Rakkor (TheTargonian) — light-theme text reads grey even at `color: #000000`. Root cause is Chromium DirectWrite vs Frostbite GDI ClearType antialiasing. Added per-character `textWeight` field on `AppSettings` with a symmetric 7-option scale (-0.6 to +0.6). Positive applies `-webkit-text-stroke` for faux-bold; negative drops CSS `font-weight` below 400 (only renders thinner on Cascadia Code's 200/300/350 weights; Consolas / Lucida Console fall back to 400). **Cascade scope: body, not .text-line.** Initial implementation was scoped to `.text-line` — Rakkor noticed the room title and other panel bolds stayed fixed when he picked Thinnest. Reworked to set `font-weight` + `-webkit-text-stroke` on `body` in [global.css](src/renderer/styles/global.css) so every text surface inherits. Added `--ui-bold-weight: calc(var(--game-text-weight) + 200)` in [theme.css](src/renderer/styles/theme.css) and routed all game-content bold rules (`.room-panel-title`, data-preset roomname/bold, exp group headers, RXP labels, prompt marker, etc.) through it — so bolds scale with body weight at any user setting. Also patched browser-default `strong` / `b` via global.css to use `--ui-bold-weight`. Chrome (toolbar, login, settings UI) deliberately left at fixed weights. Settings preview mirrors both directions. Rides into the YAML profile via the dynamic `state:` pipeline.
- **Theme Editor — panel body text cascades from the general --text-* scale + per-row tooltips (B112) ⏳ pending tester verification.** Reported by Rakkor (TheTargonian) — setting "Game Text" to black on a light theme didn't catch all the body text; panel-specific text vars (`--room-content-color`, `--hand-label-color`, `--exp-mindstate-color`, etc.) were hardcoded greys in [themes.ts](src/renderer/themes.ts) `darkBase` so they never updated. Two-part fix: **(a)** 8 panel text vars in `darkBase` switched from literal hex to `var(--text-secondary)` / `var(--text-muted)` / `var(--text-dim)`, so they cascade from the general text scale unless a built-in theme explicitly overrides. Held / active accents (`--hand-held-color`, `--spell-active-color`) kept as visual-cue colors. **(b)** Every row in the Surfaces / Game Text / Vitals / HUD / Room & Exp tabs of [ThemeEditor.tsx](src/renderer/components/ThemeEditor.tsx) now carries a `desc` field rendered via `title` on the label, with a small `ⓘ` glyph + `cursor: help` to advertise the hover info. Descriptions of cascaded vars explicitly note "Falls back to --text-* if unset" so power users can override per-panel without confusion. Marked pending — works locally; want Rakkor (or any tester building a light theme) to confirm the cascade closes the discoverability gap end-to-end.
- **Room panel sections didn't get highlights / contact colors (B111) ✅.** Reported by Rakkor (TheTargonian) — Dawan + Moza tagged as blue contacts showed correctly in main text but stayed default-colored in the Room panel's Players section. [RoomPanel.tsx](src/renderer/components/panels/RoomPanel.tsx) was rendering `{room.players}` etc. as raw strings, bypassing the `renderSegmentFull` pipeline that decorates other surfaces. Fix: route Players / Objects / Creatures / Extra / Desc through `renderSegmentFull` with `useContacts()` + `useHighlights().matchRules`, wrapping each section's text in a `TextSegment`. URL auto-linking off (not a URL surface); lineRules excluded (a "lobster" lineRule shouldn't repaint the whole Objects section). Room title left as-is — it's a heading, separately styled. Side benefit: creature-name match highlights for hunting now work in the structured Creatures section too.
- **Genie Map loses tracking after teleport / disconnected-zone move (B110) ✅.** Reported by the developer. The `currentLocation` memo's "conservative cross-zone fallback" (`if (prev && pool[0].zone !== prev.zone) return prev`) was added to prevent file-order accidents but had no escape — once the player walked into a different zone with no description / same-zone-adjacency / cross-zone-stub link to confirm the move (teleport, `;go2`, recall, missing Genie stub), the fallback returned `prev` forever and `look` couldn't help unless the description normalize-matched. Fix in [GenieMapView.tsx](src/renderer/components/panels/GenieMapView.tsx): `staleZoneCountRef` counter increments on each conservative-fallback block, resets on every confident-match path (single match / description match / same-zone adjacency / cross-zone stub adjacency). After `STALE_ZONE_ESCAPE = 3` consecutive blocks, the fallback gives up on `prev` and accepts `pool[0]` — three room titles in a row all wanting the same different zone is strong evidence the player actually moved. One-off file-order accidents are still blocked because the counter resets between them. Ref mutation inside the memo is a deliberate controlled exception.
- **Lich Map "NEEDS MAPPING" flash between walk steps (B109) ✅.** Reported by the developer. During fast walking the Lich Map's currentRoom match effect ran with the new roomTitle but stale roomDesc/roomId, briefly returned undefined, and the `roomTitle && !currentRoom` banner painted for a single frame before the next prop settled and the match resolved. Fix in [MapPanel.tsx](src/renderer/components/panels/MapPanel.tsx): commit a found match immediately (no delay — locator still tracks the player), but defer the `setCurrentRoom(undefined)` clear by 400ms via a `setTimeout` whose cleanup cancels on the next effect. Real walk steps cancel the timer before it fires (no flash); genuinely-unmapped rooms still surface the diagnostic after a 400ms wait that's imperceptible against a stationary cursor. Bonus side effect: the old currentRoom stays rendered during the transient gap, so the locator doesn't briefly disappear between rooms either. Genie Map unaffected (different match path in GenieMapView).
- **Genie Map background didn't follow App Background (B108) ✅.** Reported by Binu. The map's `--map-bg` var isn't exposed in the Theme Editor's TABS schema, so custom themes never set it and the map stayed darkBase's default `#0a0807` regardless of what the user picked for App Background. One-line fix in [themes.ts](src/renderer/themes.ts): `darkBase['--map-bg']` set to `'var(--bg-app)'` so it follows the App Background by default. CSS var indirection works at use time. Built-in themes that explicitly override `--map-bg` (Parchment, Mist, …) keep their value via the merge — only custom themes and the bare `dark` theme are affected. Power users wanting independent map-bg control should get a Theme Editor entry rather than a re-introduced literal.

**v0.8.3 — Repeat-command macros + RXP widget + Panel Manager phantom-tab pass + bounce fix ✅**

- **Stormfront/Wrayth repeat-command macros (F07) ✅.** Requested by Binu — "the only thing that keeps me going back to Frostbite." Three special macro tokens in [macros.ts](src/renderer/macros.ts): `{RepeatLast}` (history[0]), `{RepeatSecondToLast}` (history[1]), `{ReturnOrRepeatLast}` (if bar typed → send it as Enter; if empty → RepeatLast). Implemented as tokens rather than hardcoded keybindings so users can rebind freely. **Dispatch refactor**: extracted `dispatchUserText(text, { pushToHistory, clearInput })` from `handleCommand` in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) so the macro fire site can replay a historical command through the same alias-resolution + echo + log path as a fresh user-typed command (so `hunt` re-fires the alias instead of being sent literally). `commandRef` + `dispatchUserTextRef` mirrors plumb live state into the once-mounted global keydown handler. The token-aware fire site batches plain commands into `sendCommandSequence` (preserving `delayMs`) and dispatches tokens individually with the right history/clear semantics — RepeatLast/SecondToLast do NOT push when replaying so two presses of RepeatLast don't re-pin the previous command and break the next RepeatSecondToLast. **Seeding**: fresh characters get Ctrl+Enter / Alt+Enter / NumEnter pre-seeded, gated by a `lichborne.{character}.seededRepeatMacros` flag so deleted defaults don't resurrect. Skips any seed whose key is already bound. **Editor**: `MaVarPicker` gained an optional `tokens` prop; the Macros tab passes `MACRO_TOKENS`, Aliases tab does not (tokens don't make sense in alias bodies); the variable picker renders a "Special tokens" sub-section below the `$vars`, click to insert `{TokenName}` syntax.
- **Rested-Experience dual-bar widget in ExpPanel footer ✅.** Requested by the developer. The single inline `RXP 2:35h / 1:48h` chip in [ExpPanel.tsx](src/renderer/components/panels/ExpPanel.tsx) replaced with a stacked widget showing two progress bars (Stored, Usable This Cycle) over an auto-calibrating cap, plus a "resets in X:XXh" caption above the bars driven by the third RXP value (Cycle Refreshes — previously parsed but not displayed). The cap starts at 4h (Standard subscription) and grows to `max(peak Stored, peak Usable)` observed; persisted per character as `lichborne.{character}.rxpCapMin` so Premium (6h) / Platinum (8h) testers see correct scale after one normal play session — no manual subscription-tier setting needed. `parseRexpTime()` handles all three game formats (`H:MM hours`, `H hours`, `M minutes`, `none`); `formatRexpTime()` round-trips. Stored bar uses `--accent` (the bank), Usable bar uses `--color-success` when non-zero and `--text-faint` (with a 2px min-width sliver for visual continuity at the zero edge) when empty. Layout sits inside the existing `.exp-footer` below the TDP / Fav / Sleep / Death's Sting chip row — chips stay one-line; bars stack below. Hides entirely when no RXP component data is present (F2P without Brain Boost) or when Death's Sting is active (the existing red Sting badge is shown in its place; the game suppresses RXP data while Sting is on). The previously-discarded "Cycle Refreshes" data the parser was already producing is now surfaced — no parser change needed.
- **Combat (and other STREAM_FALLBACK streams) silently buffered when their zone is un-added (B106) ✅.** Reported by the developer. `watchedStreamsRef` in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) aggregated tabs from all four zones regardless of the `*Added` flag, so a zone whose tabs existed but wasn't rendered still "watched" its streams — `STREAM_FALLBACK` (combat → main, conversations → main, thoughts → main, …) saw the stream as covered and skipped the fallback. Lines went into `streamLines.{stream}` and visually disappeared. Compounding the issue: `mainTopTabs` default was `[room, combat]` even though `mainTopAdded` defaults to `false`, so a fresh user who never touched Main-Top still had phantom tabs blocking combat fallback AND saw `[room, combat]` magically appear the first time they added Main-Top in the Panel Manager. Two-part fix: **(1)** `watchedStreamsRef` now gates each zone's tabs on its `*Added` flag — phantom tabs in an un-added zone are ignored, fallback works. **(2)** `mainTopTabs` default switched to `[]` — Add Main-Top always produces an empty placeholder for both fresh installs and the after-remove path. Existing users with saved tabs keep them.
- **Lich-script declared streams (e.g. moonwatch's "Moons") sometimes never appear under Available Streams (B107) ✅.** Reported by Legiro via Binu — moonwatch worked fine for Binu but Legiro's Moons stream never showed up to be added. Same root cause shape as B106 in [PanelManager.tsx](src/renderer/components/PanelManager.tsx): `allTabs` was built from all four zones regardless of the `*Added` flag, so the `openCustomIds` set used by the `availableCustom` filter included phantom custom tabs sitting in un-added zones — discovered stream ids whose tab had been placed in one of those zones were filtered out of Available Streams, leaving the user with no path to re-add the stream to a visible slot. Fix mirrors B106: `allTabs` now respects the `*Added` flag, so only tabs from actually-rendered zones count as "open". If a future report still shows a discovered stream missing from Available, the remaining suspects are (a) the Lich script never emits `stream-declare` on that install, or (b) the id matches a NEVER_DISCOVER / ALL_PANEL_TYPES entry; both diagnosable via DebugPanel → Events.
- **External URL clicks fail through the play.net bounce (B105) ✅.** Reported by the developer — clicked `https://imgur.com/a/cYoVxuW` in the main text window, browser opened to a "site doesn't exist" page showing the URL as `https%3A%2F%2Fimgur.com%2Fa%2FcYoVxuW`. The F23 wrapper in [renderSegment.tsx](src/renderer/utils/renderSegment.tsx) used `encodeURIComponent(href)` when building the bounce URL — but play.net's `redirect.asp` takes the value after `URL=` literally (Genie's `FormMain.cs` LinkClicked path does raw concatenation for exactly that reason), so the encoded `://` got handed to the bounce page as part of the destination string instead of being decoded into a real URL. Fix: drop the encoding — concatenate the href raw. The wrapper comment now explains why encoding must NOT be re-added so a future contributor doesn't "fix" the unencoded URL on principle and break the bounce again. The user-confirmed working form `?URL=https://imgur.com/a/cYoVxuW` is exactly what the renderer now produces.

**v0.8.2 — Debug panel quality-of-life + Panel Manager stream reordering 🚧**

A polish release driven by tester-found rough edges in the Debug panel and Panel Manager. Two real bugs (the necromancer phantom-fires regex footgun and the Copy All silent no-op) plus quality-of-life on top of the v0.8.1 Panel Manager V2.

- **Lich Map movement delegates to `;go2` (F27) ✅.** Requested by Binu. The Lich Map's right-click and "Walk here" button previously ran a local BFS walker that stepped through cardinal-direction commands every 600ms (the `walkToRoom` function in [MapImageView.tsx](src/renderer/components/panels/MapImageView.tsx)) — brittle in practice: any blocking event (creature attack, locked door, hidden exit, brief roundtime stall) killed the walk and left the player stranded mid-route with no recovery. Replaced with `onSendCommand(\`;go2 <id>\`)` — Lich's stock `go2` script handles obstacles, locked doors, hidden exits, retries, roundtime, the whole stack of edge cases. **Right-click on a room** → `;go2 <id>`. **"Walk here" button** in the detail panel → same `;go2 <id>` (kept consistent so users don't have to learn two different movement primitives). Tooltip explicitly shows `Sends ;go2 <id> to Lich` so the command is discoverable. **Local walker infrastructure removed** — `walking` state, `walkTimers` ref, the unmount-cleanup `useEffect`, the `cancelWalk` function, the top-toolbar Stop button. To cancel a `;go2` in flight, users type `;k go2` in the command bar (the standard way to kill any Lich script). The local BFS in `bfsPath` is kept — it's still used for the left-click visual path pin (a static preview, not movement) and the step-count distance cue on the "Walk here" button label. **Genie Maps is untouched** — Genie XML edges are direction commands like "north" / "climb tree", not Lich room IDs, so `;go2` doesn't apply; Genie's BFS-step walker (`sendWalkPath` in [GenieMapView.tsx](src/renderer/components/panels/GenieMapView.tsx)) stays as-is.
- **Floating compass — centre dot removed (B104) ✅.** Reported by the developer with a screenshot showing the `·` glyph sitting off-cell. Root cause: the centre cell rendered a U+00B7 middle-dot character at `font-size: 1.2rem`, and per-font baseline metrics put the glyph high-and-left of the cell centre on many of the default font choices (Cascadia Code in particular). The grid placement was correct; the glyph drawing inside the cell was the problem. Fix: removed the `.fc-cell--center` `<div>` from [FloatingCompass.tsx](src/renderer/components/FloatingCompass.tsx) and the matching CSS rule from [floatingcompass.css](src/renderer/styles/floatingcompass.css). The 8 directional arrows around the cell already imply the centre by negative space — the dot was a redundant cue. The `--compass-center-text` theme var is now unused but kept in `darkBase` so existing custom themes don't error on missing variables; sweep on the next theme pass.
- **Lich Map "you are here" — sonar locator + bullseye + Genie bullseye (F26) ✅.** Requested by Binu — the previous Lich Map indicator was a green-tinted rect with an opacity pulse that was nearly invisible on Lich's white/cream PNG tiles AND on green map regions (the pulse stroke `#40e080` was close enough to the tile green to disappear). Rewritten to mirror the Genie sonar pattern, adapted to per-room rect bounding boxes: two expanding `genie-here-ping` rings centred on the room (reusing the Genie keyframe — `transform-box: fill-box; transform-origin: center` makes the scale animation work around the element's bbox centre regardless of cx/cy), plus a dual-contrast solid ring (dark backdrop `rgba(0,0,0,0.55)` 5px + lime accent 3px) so it reads against any background. All strokes use `vectorEffect="non-scaling-stroke"` so they stay crisp at any zoom; ring radius = `max(w, h) / 2 + 3` in image-coord units so it sits just outside the room rect for rooms of any size. **Bullseye centre dot** added on top (dark backdrop dot + bright accent dot) so dense same-cluster rooms can still be distinguished at a glance — also added to Genie's existing locator for consistency (Genie source rooms are 8px nodes; dot radii 2/1.2 in image coords). **Themable** via three new CSS vars (`--lich-here-color`, `--lich-here-backdrop`, `--lich-here-fill`) in [themes.ts](src/renderer/themes.ts) darkBase with lime fallbacks (`#00ff80` / `rgba(0,0,0,0.55)` / `rgba(0,255,128,0.30)`) — kept independent from Genie's `--map-current-color` per the design discussion (Lich Map has a different visual aesthetic and the colour choices serve different background palettes). Earlier opacity-pulse rect (`<animate attributeName="opacity">`) removed — the sonar replaces it.

- **Stale `triggerOpenId` hijacked openTriggerEditor + right-click → "Trigger for this line" ✅.** Self-found while bug-checking the Fires GOTO work. The new `triggerOpenId` state (drives the Fires → button) wasn't being cleared by the OTHER paths that open the Automations panel into the Triggers tab — namely `openTriggerEditor(pattern)` (right-click in the main window → "Trigger for X") and `openHighlightEditor` (which switches to a different tab but could leave the trigger pane stale). Sequence: user clicked **→ A** in Fires (sets `triggerOpenId = 'A'`, opens Automations); closed Automations; right-clicked a word → "Trigger for X". On re-mount TriggersPanel ran both useEffects on initial render — the `prefillPattern` effect created a new trigger from X, then the `openRuleId` effect fired with the still-set `triggerOpenId = 'A'` and overwrote the draft with rule A. User saw rule A instead of the new "Trigger for X" they asked for. Fix: `openTriggerEditor` and `openHighlightEditor` both clear `triggerOpenId` on entry, so only the Fires GOTO path leaves it set.
- **Fires GOTO → button + column headers (Fires + Events) ✅.** Requested by the developer. Each row in the Debug → Fires tab now ends in a small **→** button that opens the source highlight or trigger for edit in the Automations panel (Highlights or Triggers tab depending on `entry.kind`). Implementation: `FireLogEntry` gained an optional `ruleId` field ([shared/types.ts](src/shared/types.ts)), threaded from both emission sites (the highlight `logHighlightFiresRef` in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) and the trigger `onFire` callback in [useTriggerEngine.ts](src/renderer/hooks/useTriggerEngine.ts)). Trigger callback signature widened to take a `ruleId` 5th argument. New `gotoFireRule(kind, ruleId)` in GameWindow routes to `openHighlightEditor(rule)` for highlights (existing prefill path already opens for edit when the rule already has a matching id) or sets a new `triggerOpenId` state for triggers. New `openRuleId` prop on TriggersPanel watches that state in a useEffect and sets draft + selectedId from the looked-up rule (distinct from `prefillPattern`, which always *creates* a new trigger). Button is `disabled` with an explanatory tooltip when `ruleId` is missing (older entries) or `onGotoFireRule` isn't wired. **Column headers** added on both Fires (`Time | Kind | Stream | Rule | Matched text | Detail | Goto`) and Events (`Type | Payload`); `position: sticky; top: 0` so they stay pinned while scrolling. Grid template-columns on `.fire-log-entry` extended from 6 columns to 7 (added a 28px column for the → button) and matched on `.fire-log-header` so labels sit directly above their data.
- **PanelManager — ◀ / ▶ stream reorder + width 580px → 870px ✅.** Requested by the developer. Each stream row in an added-zone's section gets ◀/▶ buttons before the move/remove buttons; they shift the tab one position left or right within that zone's `tabs` array — same array the PanelFrame tab bar renders, so reordering in the manager immediately reorders the in-game tab bar. Disabled at the ends with explanatory tooltips. New `reorderTab(tab, direction)` in GameWindow does the slice+swap and lets the existing per-zone persistence useEffect catch the change. Modal widened ~50% again (580px → 870px) — the per-row action count climbed from 3 (move-target × N + remove) to 5+ (◀ ▶ + move-target × N + remove) and the prior width was visibly cramped on the 3-zone "Streams" rows. `max-width: 92vw` still caps it for narrow displays.
- **Debug Copy All silently no-op'd (legacy of B18) ✅.** Reported by the developer. The Debug panel's `Copy All` button used `navigator.clipboard.writeText` which the renderer's permission handler refuses silently (same root cause as B18 — Electron's internal permission name doesn't match a whitelist, and the failure is a swallowed promise rejection). Tab-routing logic was correct; only the clipboard call was broken. One-line fix: route through the existing `window.api.writeClipboard` IPC (talks to main's `clipboard.writeText`, no permission guard). Now click any Fires / Events / Raw XML tab to focus it → Copy All copies the visible tab's content to the system clipboard. The right-click context menu's Copy All routes through the same handler.
- **Debug buffer limits 500 → 2000 ✅.** Requested by the developer. `MAX_DEBUG_EVENTS` (used by both Fires and Events buffers) and `MAX_RAW_XML_LINES` both bumped from 500 → 2000. `MAX_STREAM_LINES` left at 500 (controls in-game stream panel buffers, not Debug). Debug collection is already gated on `showDebugRef.current` so the larger ring buffer only costs memory while Debug is actually open; closed-Debug overhead is unchanged.
- **Phantom necromancer fires (highlight regex with empty alternative) ✅.** Self-found, confirmed by the developer with a live capture. User-authored pattern `\b(necromancers?|...|zombified|)\b` had a trailing `|` before the closing `)` — that's an *empty alternative* in the alternation, so the regex matches the zero-length string at every `\b` word boundary. The rendering layer in [renderSegmentFull.tsx](src/renderer/utils/renderSegmentFull.tsx) already skips zero-width matches at line 47, so the visual highlight was correct (nothing painted). But the Fires log emission in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) used `regex.test(text)` which returns `true` for empty matches — so the rule logged a "fire" on every line containing any word boundary (i.e. every line), misleading the user into thinking the rule was firing on text it wasn't touching. Fix: `logHighlightFiresRef` now uses `regex.exec()` and walks past zero-width matches (`lastIndex++` prevents the infinite loop on the global-flag regex), only logging a fire when it finds a match of length > 0. The Fires log now mirrors what the renderer actually highlights. The user also fixed their own pattern (removed the stray `|`).

**v0.8.1 — Panel Manager V2 + Web Link Safety + ongoing polish 🚧**

- **Closing-overlay delayed-show + tighter socket cap (post-B99 polish) ✅.** Requested by the developer — the "Closing — backing up profiles…" overlay flashed for tens of milliseconds even on shutdowns that actually completed instantaneously (backups are local file I/O, `socket.end()` typically returns in 1–10ms on Lich loopback). Two changes: **(a)** the [App.tsx](src/renderer/App.tsx) `onShutdownStarting` listener now arms a 250ms `setTimeout` instead of calling `setShutdownInfo` directly — if main destroys the window before the timer fires (the common case for backup-only shutdowns and single-session quick-closes), no overlay paints at all. **(b)** [ConnectionManager.ts](src/main/connection/ConnectionManager.ts) `endActiveSocket` cap reduced from 1500ms → 500ms — the OS-level `'close'` event after `socket.end()` fires in milliseconds in practice; 500ms is still 10× headroom for the safety net while halving the worst-case hang on a stuck socket. Net effect: a backup-only shutdown shows no overlay; a single Lich session shows no overlay; only multi-session or genuinely stuck closes still surface it. In-tab Disconnect and the conflict-modal auto-disconnect keep the full 5s ack-wait path (they need the slot release confirmed before the next action).
- **Active Spells no longer falls back to main when closed ✅.** Requested by the developer. The `spells` stream was in `STREAM_FALLBACK` mapping to `'main'` — closing the Active Spells panel sent every spell-tick update down the main scroll. Active Spells is a *state* stream (the game re-emits the full active-spell list whenever it changes), not a narrative stream — falling back spammed the main window. Removed `spells: 'main'` from [GameWindow.tsx](src/renderer/components/GameWindow.tsx) `STREAM_FALLBACK`. With the panel closed, updates buffer in `streamLines.spells` (capped by `MAX_STREAM_LINES`) and reappear when the panel is re-added; with no fallback there's no main-window spam.
- **Combat stream duplicated in Available Streams (B100) ✅.** Self-found while exercising Panel Manager V2. The `combat` PanelType was missing from `NEVER_DISCOVER`, so when the game emitted a `combat` stream the renderer added it to `discoveredStreams` AND the builtin Combat panel was also offered. PanelManager rendered Combat twice in Available Streams — once as a builtin row (correctly hidden after add via `openTypes`) and once as a "discovered custom" row (which the old filter only checked against `openCustomIds`). Clicking the second row pushed a duplicate tab with the same id. Root fix: the discovery filter in [GameWindow.tsx](src/renderer/components/GameWindow.tsx) now also rejects any id matching an entry in `ALL_PANEL_TYPES`, so builtin panel ids can never enter `discoveredStreams`. Future builtins are covered automatically — no `NEVER_DISCOVER` bookkeeping needed when adding a new PanelType. Belt-and-suspenders: PanelManager's `availableCustom` filter now also defensively excludes ids matching a builtin type or an open builtin tab, so a stale discovery from an older session can't reintroduce the duplicate.
- **Panel Manager V2 — explicit add/remove of panel locations + auto-split right column (F24 follow-up) ✅.** Requested by the developer (iterated across several rounds). Each of the four panel slots (Main-Top, Top-Right, Middle-Right, Bottom-Right) is now independently *added* to or *removed* from the layout via a new "Panel Locations" section at the top of the Panel Manager. **Add** = slot snaps into the game window (empty placeholder until streams arrive); **Remove** = slot hides + its streams return to Available Streams (combat / conversations / thoughts / etc. fall back to main via `STREAM_FALLBACK`; spells just stops displaying — see above). The state lives in four per-character booleans (`mainTopAdded`/`topAdded`/`midAdded`/`bottomAdded`), persisted via the dynamic profile `state:` pipeline in [GameWindow.tsx](src/renderer/components/GameWindow.tsx). Migration defaults when the flag is missing: **Main-Top → false** (new in v0.8.1; existing users opt in explicitly), right-column three → true (preserves v0.8.0 behavior — no silent regression for anyone who never opened the new manager). **Auto-split sizing:** the right column now collapses entirely when all three zones are removed; renders with `flex:1` (full height) when one zone is added; renders 50/50 when two are added (the divider drags the first zone's saved height, the second is flex:1); renders the canonical 3-zone layout (top + mid use saved px heights, bottom flex:1, both dividers draggable) when all three are added. **Empty added zones** render an `EmptyPanelSlot` placeholder (dashed border, accent-colored label, click → opens Panel Manager) so the slot is visible / reachable. Saved heights persist across mode changes — toggling 3→2→3 restores the user's split. The PanelManager UI also shows per-zone "Streams" sub-sections only for added zones, and `+ Zone` buttons in Available Streams only target added zones (with an inline "Add a panel above first." hint if none are added). Drag clamps were rewritten to use `topAddedRef`/`midAddedRef`/`bottomAddedRef` so the divider's max-height calculation differs between 2-zone (other zone is flex with a minimum) and 3-zone mode (other zone is fixed height + a flex bottom minimum); `MIN_PANEL_REMAINDER` (80px) is the constant for the flex zone's minimum.
- **Panel Manager polish (rename + width + section separation, pre-V2) ✅.** Requested by the developer. Zone labels in the Panel Manager renamed for clarity — Main / Top / Mid / Bottom → **Main-Top / Top-Right / Middle-Right / Bottom-Right** so it's unambiguous *where* each slot lives (the new Main-Top zone is on the left over the main text, the others are the existing right-column zones). Modal width bumped from 380px → 580px (~53% larger) so the now-longer move/add button labels (`→ Top-Right`, `+ Middle-Right`, etc.) fit comfortably without clipping at the right edge. Section + row visual separation: each zone section gets a top border + accent-tinted header background; rows get thin dividers between them so each stream row is individually scannable. CSS in [panel-manager.css](src/renderer/styles/panel-manager.css).
- **YAML editor in-file search (F25) ✅.** Requested by the developer. Search input in the Lich profile YAML editor's edit-bar, visible in both view + edit modes. Enter/Find scrolls to the first matching line (case-insensitive); repeated clicks cycle through matches with wrap-around. Implementation in [LichDashboard.tsx](src/renderer/components/LichDashboard.tsx): converted `YamlHighlight` and `EditorWithGutter` to `forwardRef` exposing a shared `YamlViewHandle` interface (`find` / `scrollToLine` / `resetSearch`). Parent owns the search state + a single ref that React swaps between the two components on mode toggle. `useEffect[isEditing]` re-issues `scrollToLine(lastFoundLine)` post-commit so clicking Edit while a match is in view preserves the scroll position into edit mode. In edit mode the match is also `setSelectionRange`-selected so the browser shows the selection highlight. Search cursor resets on file change; typed term preserved so finding the same key in a different file doesn't require retyping. Scroll math is `lineIdx * (scrollHeight/lineCount) - clientHeight/2 + lineHeight/2` so the match lands centered.
- **Main-top panel zone with Room + Combat (F24) ✅.** Requested by the developer. New resizable panel zone sits above the main scrolling text + command bar on the left side of the game window; right panel column unaffected. Defaults to Room + Combat tabs (height ~250px ≈ top 1/3 of a typical game window). **Combat** is a new `PanelType` in [PanelFrame.tsx](src/renderer/components/PanelFrame.tsx) — routes the existing DR `combat` stream (already recognised by the StormFront parser) to the new panel; closing the Combat tab falls back to main via the existing `STREAM_FALLBACK` map so combat lines stay visible somewhere either way. New `mainTopTabs` / `mainTopActiveId` / `mainTopHeight` state in GameWindow, persisted per-character. `watchedStreamsRef` aggregation widened to include the new zone so combat is recognised as watched when the tab is present. Layout: wrapped `.text-window-wrap` in a new `.game-main-area` flex-column container holding the optional main-top zone + a horizontal divider + the unchanged text-window-wrap; right column is a sibling of the wrapper. Divider drag bounded against `mainAreaRef.current.offsetHeight` minus a 120px floor for the text below so the main text can't be squeezed to invisibility. Right-column `topTabs` default trimmed from `[Room, Conversations]` to `[Conversations]` since Room moved up into the new zone (existing users with saved topTabs keep whatever they had — only fresh installs / unset characters get the new defaults; `resetLayout` updated to match).
- **Web Link Safety (F23) ✅.** Requested by the developer. Mirrors Genie's `bWebLinkSafety` config flag — external URL clicks (in game text, contact templates, anywhere the `url-link` class fires) route through Simu's bounce page `https://www.play.net/bounce/redirect.asp?URL=<original>` which shows a "You are leaving Play.net" confirmation. Genie source: [FormMain.cs](C:\temp\Genie4-Dev\Genie4\Forms\FormMain.cs) `FormSkin_LinkClicked` (line 8321). Implementation: new `webLinkSafety: boolean` field on `AppSettings` (default `true`); `wrapExternalLink()` helper in [renderSegment.tsx](src/renderer/utils/renderSegment.tsx) prepends the bounce URL when the flag is on and the link is `http://` or `https://` (file:// / mailto:// pass through). Threaded the new flag through `renderSegmentFull` → `TextLineRow` → `StreamPanel` → `PanelFrame` → GameWindow's `sharedFrameProps`. New SettingsPanel toggle below Auto-link URLs. URL `encodeURIComponent`'d before being inserted as the query value — Genie's source doesn't encode (just string-concatenates) but encoding is the safer move for URLs containing `&` or other reserved characters.

**v0.8.0 — Login & character-selection overhaul ✅**

A major rework of the login and character-selection experience. The Add Character flow becomes Add Account; the launcher gains Favorites + grouping + collapse + bulk connect; the wizard discovers characters in one shot; four real bug fixes shipped along the way. Bundled with what would have been v0.7.2 — the launcher changes touch enough surface area that the combined work warrants a minor-version bump. Tab cluster polish, flex-wrap on the action row, and the 1→2 auto-expand transition rule are end-of-cycle polish items.

- **End-of-cycle polish ✅.** Three small fixes after the main UX work: **(a)** `.launcher-card-footer` now has `flex-wrap: wrap` so the Connect button drops to its own line gracefully if pills + Connect can't fit at narrow tile widths instead of clipping. **(b)** Wizard's auto-expand now handles the **1→2 account transition** — when the user previously had exactly one account (always rendered expanded under the single-account rule) and just added a *different* account, the wizard auto-expands the prior account too. Without this, the formerly-only account would suddenly collapse the moment the multi-account rule kicked in — surprising and disorienting. **(c)** Closing-overlay wording for the empty-sessions case updated from "Closing — saving profiles…" to "Closing — backing up profiles…" — when no sessions are active what actually runs is mostly `backupAllProfiles` (copies every YAML to `.bak`) plus the `_shared.yaml` save; the prior wording implied content rewrites for every profile, which isn't true.
- **Smart auto-expand (UX phase 1) ✅.** Two rules. **(a)** Single-account users always see their account expanded — collapse toggle hidden, no friction. **(b)** Newly-added accounts auto-expand once after the wizard creates them — the wizard writes the account name to `lichborne.launcher.expandedAccounts` before bumping `refreshKey`, and Launcher's refresh effect re-reads the key. Solves the "stared at empty collapsed launcher right after adding characters" first-impression problem.
- **Top-bar Add Account + Bulk Connect buttons (UX phase 1) ✅.** Persistent buttons in the launcher top bar — Add Account is now reachable from anywhere on the page (no scrolling past collapsed accounts to find the bottom + tile, which stays as a redundant secondary entry). Bulk Connect button is only enabled when ≥2 accounts have connectable characters; greyed otherwise with an explanatory tooltip. Welcome card copy / CTA updated from "Add character" → "Add account" to match the actual flow.
- **Favorites discoverability hint (UX phase 1) ✅.** When the user has tiles but no Favorites and hasn't dismissed the hint, a single dismissable line renders above the account sections: *"💡 Click the ♡ on any character to pin it to a Favorites section at the top for quick access."* Dismissed state persists in `localStorage`.
- **Tile compression + drop-redundant-account-name (UX phase 2) ✅.** Tile structure compressed from 5 stacked rows (header, meta, lich/direct pills, test pill, connect) to 3 (header, meta, single action row with all pills + connect). Inside an account section the tile's meta line drops the redundant account name (the section header already shows it). In Favorites — account-mixed — the account name stays. New `showAccount` prop on `CharacterCard` threads this through. TEST SERVER pill shortened to TEST and merged into the action row alongside LICH/DIRECT.
- **Character tab reorder + tight cluster (UX) ✅.** Inside the game window, character tabs now render as Name → L/D pill → game code → indicators (health/glyph/close) instead of Name → game → L/D. The Name + L/D pill + game code render in a sub-`<span>` with `gap: 0` so they sit flush — the pill's color provides the visual separation, no whitespace required. Health %, status glyph, and × stay spaced via the parent tab's `gap: 6px`. Testers wanted the connection mode adjacent to the character name rather than buried after the game code, and the cluster rendered as one identity unit.
- **Bulk Connect (F21) ✅.** New `⚡ Bulk Connect` button + `BulkConnectPicker.tsx` modal. Click → modal lists each account with a dropdown of its connectable characters (defaults to a favorited character if any). Accounts already connected are disabled with a *"({char} already connected — skip)"* hint. Confirm → sequential connect with a progress overlay (*"Bulk Connect (2 of 3) — connecting Sekmeht…"*). Per-character errors don't abort the sequence; final summary modal reports per-character success/failure. Implementation in [App.tsx](src/renderer/App.tsx) `runBulkConnect` reuses the existing connect plumbing per character.
- **Fast shutdown + "Closing…" overlay + L/D pill on tabs (B99 + tab polish) ✅.** Reported by the developer — counted ~10s closing Lichborne with two characters connected. **B99 first cut** added a "Closing — disconnecting N character(s)…" overlay so the 5s gracefulDisconnect wait wasn't a frozen-window experience. **B99 follow-up** went further: added `quickClose: true` option on `gracefulDisconnect` that skips the 5s server-ack wait entirely — sends QUIT, lets the local Lich TCP send queue flush for ~300ms, then force-closes. The character is still logged out (clean QUIT or socket-drop timeout). Wired into the app-shutdown path; in-tab Disconnect and the conflict-modal auto-disconnect keep the full 5s wait (they need the account slot confirmed released before the next action). Shutdown is now ~300ms regardless of session count instead of up-to-5s-per-session. Plus timing instrumentation in main's close handler so testers can see where any remaining time goes. **Tab polish:** added a small L/D pill on each character tab (between game code and health %) that mirrors the launcher's LICH/DIRECT palette via the same `color-mix(--color-success, --link-color)` recipe — was unclear at a glance whether a session was connected via Lich or Direct. Tightened to minimal padding (`0 3px`, `margin-left: 3px`, `border-radius: 3px`) after a first pass added visible tab width.
- **Profile-save preserves launcher-managed fields (B97) + modal launcher scrolls (B98) ✅.** Reported by the developer mid-v0.8.0. **B97:** the GameWindow's debounced `scheduleProfileSave` was calling `exportCharacterProfile` → `buildCharacterProfile`, which only knows about `{ account, character, game, useLich, theme, state }`. Every save from an active GameWindow silently stripped `favorite`, `hidden`, `notes`, `guild`, `circle`, AND reverted `game`/`useLich` to the stale `session.*` values — so toggling a pill on a connected character's tile un-favorited them and bounced the pill back. Fixed in [profile.ts](src/renderer/profile.ts) by making `exportCharacterProfile` do a read-merge-write: read existing YAML, then spread with `built` winning on `theme`/`state` (GameWindow-owned) and `existing` winning on `game`/`useLich`/`hidden`/`favorite`/`guild`/`circle`/`notes` (launcher-owned). **B98:** clicking + while logged in opened the Add Character modal, which centers a compact `<Launcher>` inside a flex-centered backdrop. Flex centering doesn't bound the child's height, so the launcher's standard `overflow-y: auto` had nothing to overflow against and content past the viewport edge was unreachable. Fixed with a scoped CSS rule `.add-character-modal .launcher--compact { max-height: calc(100vh - 48px); width: 100%; max-width: 760px; }` plus a subtle background/border so the modal-launcher reads as a card.
- **Character notes editor + collapsible accounts (F20) ✅.** Requested by the developer. **(1) Per-character notes** — three optional fields on `CharacterProfile`: `guild?` (canonical lowercase key — same vocabulary as themes.ts), `circle?` (number), `notes?` (free text). New [CharacterNotesEditor.tsx](src/renderer/components/CharacterNotesEditor.tsx) modal opens from each tile's ⋯ menu → "Edit Profile…" with a guild dropdown (12 DR playable guilds + None), circle number input, and a multi-line notes textarea. Generic `patchCharacterProfile(name, patch)` helper handles the read-modify-write in one round-trip. Tile meta line appends `· Empath 50` when guild and/or circle is set; tile shows an inline `✎` indicator (with `--accent-dim` color) at the end of the meta line when notes are non-empty. **(2) Collapsible account sections** — each per-account block is now wrapped in a clickable header button with a ▶/▼ chevron and a character count. Default is collapsed (tester explicitly asked for this — accounts with many characters were spreading too far down the page). Expanded-account names persist in `localStorage` under `lichborne.launcher.expandedAccounts` so once you open an account it stays open across launches. **Favorites section is exempt from collapse** — it's always-open at the top, becomes the standard at-a-glance view for daily logins. Menu ordering on the ⋯ menu is now: Edit Profile… → Hide/Unhide Profile → Delete Profile….
- **Favorites section + paired Lich/Direct pills (F19) ✅.** Requested by the developer. Two related UX additions. **(a)** New `favorite?: boolean` on `CharacterProfile` (optional, no migration); tiles get a heart button in the header (♡ → ♥) with `--color-danger` for the universal favorited red. Toggling persists via new `setCharacterFavorite()` helper. A "Favorites" section renders at the top of the launcher (above the account groupings) when at least one tile is favorited — header has a small heart icon prefix to echo the toggle. Favorited tiles **mirror** into Favorites — they also still appear in their account / game section below. Favorites is a quick-access shortcut, not a re-categorization. Hidden overrides favorite (hidden + favorited → only shown when Show Hidden is on). **(b)** Replaced the F18 single click-to-toggle LICH/DIRECT badge with a **paired pill** — both Lich and Direct render side-by-side; the active one keeps its themed color (lich = green, direct = blue); the inactive one is greyed out (`--text-faint` background/border/text). Click the inactive pill to switch; the active pill is `disabled`. Pill row moved out of the tile header onto its own line below the meta so the header (heart + name + ⋯ menu) fits at the 260px minimum tile width.
- **Account-discovery flow + per-tile Lich/Direct toggle + tile hide (F18) ✅.** Requested by the developer. Three coupled changes that together make the login experience match a multi-account multiboxer's actual workflow. **(a)** Rewrote `AddCharacterWizard` ([AddCharacterWizard.tsx](src/renderer/components/AddCharacterWizard.tsx)) as a 2-step *account-discovery* flow: step 1 collects account + password + game; step 2 calls EAccess (the existing `eaccessFetchCharacters` IPC — SimuCo auth is mode-agnostic, no Lich needed) and presents the discovered character roster as a checkbox list with "Select all new". Confirming bulk-writes one stub `CharacterProfile` per checked character (`{ profileVersion: 2, account, character, game, useLich: true, theme, state: {} }`). Existing profiles are listed but their checkboxes are disabled with an "already added" badge — no overwrite of saved automations. No connection happens during the wizard; tiles appear, user clicks Connect when ready. Launcher entry-point renamed "Add character" → "Add account". **(b)** LICH/DIRECT badge on each tile is now a button — single click flips `useLich` and persists via new `setCharacterUseLich()` helper (same read-modify-write shape as `setCharacterGame`). Tooltip explains the current state and what clicking does. **(c)** New `hidden?: boolean` on `CharacterProfile` (optional, no migration — undefined === visible). Visible ⋯ kebab-menu button on each tile (right-click still works for muscle memory) with Hide tile / Unhide and Delete… options. Hidden tiles disappear from the grid; a "Show N hidden tiles" toggle at the bottom of the launcher reveals them with dimmed/dashed styling for un-hiding or deleting. Existing right-click → Delete… still works. **(bonus)** Account headers gain a "↺ Refresh" button that opens the wizard pre-filled with that account, so the user can pull in new in-game characters without retyping. The new `prefillAccount` wizard prop carries the account name; the `launcherRefreshKey` state in App.tsx re-keys the Launcher when discovery adds tiles so the grid refreshes immediately.
- **Same-account conflict modal + auto-disconnect (F17) ✅.** Requested by the developer. Previously a flat refusal: `${conflict.character} is already connected on account ${account}. Disconnect them first.` Now both the launcher tile click ([App.tsx](src/renderer/App.tsx) `handleCardConnect`) and the wizard step 1 ([AddCharacterWizard.tsx](src/renderer/components/AddCharacterWizard.tsx) `nextFromStep1`) raise a confirmation modal: Cancel or "Disconnect {conflict} and continue". On Continue the conflicting session is gracefully disconnected via a new `disconnectAwait` IPC (wraps `gracefulDisconnect()` and resolves when the server has actually dropped the slot, with the same 5s timeout floor as the existing fire-and-forget channel), then the new connect runs. A single 2-second retry on the new connect catches the common race where DR's server-side account-slot release lags the local disconnect ack by a beat. The conflicting tab is intentionally NOT removed — it stays in the bar in disconnected state, same shape as if the user had pressed the in-tab Disconnect button, so they can close it via X or re-login to it later. Cancel just dismisses the modal; user can disconnect manually and try again.
- **Per-shard tabs (F16) ✅.** Requested by the developer — Sekmeht-DR and Sekmeht-DRT should be separate tabs, not the same tab renamed. `CharacterId` widened from `account::character` to `account::character::game` in [SessionsContext.tsx](src/renderer/SessionsContext.tsx) `makeCharacterId`. The tab bar already rendered `session.game` next to the name (`.character-tab-game`), so the keying widening alone was enough — no label tweak needed. Character profile YAML stays keyed by character name (one Sekmeht.yaml shared across shards — same automations / theme / layout regardless of which shard you visit). DR's one-character-per-account rule still applies (F17 handles same-account collisions); you can't have Sekmeht-DR and Sekmeht-DRT *connected at once*, but you can have one connected + one in disconnected state in the tab bar.
- **Reconnect leaves tab greyed-out (B96) ✅.** Self-found while exercising the B95 fix. Disconnect a character, reconnect (same character, possibly different shard) — the new session connected fine but the tab kept rendering as disconnected because `addSession`'s reconnect path preserved the prior session's `status` object, which still had `connected: false` from the disconnect. Also leaked stale vitals (bleeding/dead/RT/health) into the new session for the moment before fresh events arrived. Fix in [SessionsContext.tsx](src/renderer/SessionsContext.tsx) `addSession`: always reset to `DEFAULT_STATUS` on add/replace. `addSession` is only called after `window.api.login` succeeds, so `connected: true` is correct at that point; the next vitals events fill in the rest.
- **DRT/DRX/DRF connect bug (B95) ✅.** Reported by Binu — a character configured for DRT logged into DR. Four interlocking root causes, every layer dropped the game info: (1) `LoginCredentials` had no `game` field, so the renderer couldn't tell main which shard to use; (2) `App.tsx#runConnect` used `adv.lichPort` (the *global* Lich port from `_shared.yaml`) instead of deriving from `c.game` — so the character's saved `game: 'DRT'` was thrown away in favour of whatever shard the global port pointed at; (3) `LichConnection.launch` hardcoded `args = [lichPath, mode, '--dragonrealms']` — Lich always launched in DR mode regardless of intent; (4) `ConnectionManager.authenticateSge` and `connectDirect` both called `sge.authenticate(account, password)` without the gameCode third arg — `SGEConnection` defaulted to `'DR'`, so even the SGE login key was for DR. Fix: added `game` and `lichArguments` to `LoginCredentials`; `runConnect` and the wizard's `finish()` both derive port + args from `GAMES.find(c.game)` via the new `gameOptionByCode()` helper; `LichConnection.launch` takes `lichArguments` and splits it into the spawn args; SGE auth threads `creds.game` through. All four layers now honour the character's saved game. **Pitfall noted in CLAUDE.md** for future-me.
- **Launcher restructure — group by account → game (F16) ✅.** Was a flat alphabetical character grid; now grouped Account → Game section → tiles. Game-section ordering is `DR` (which includes DRT tiles) / `DRX` / `DRF`; empty sections are hidden; account headers are hidden when the user only has one account (no noise for the common case). Within each section characters stay alphabetical. Single `+ Add character` row at the bottom (the wizard prompts for account anyway).
- **DRT toggle per DR tile ✅.** DRT is a per-character DR-only override (same SGE auth, same character list, different shard) — modelled as a checkbox on each DR tile rather than a fourth game tier. Toggling reads the character's YAML, flips `game` between `'DR'` and `'DRT'`, and writes it back via a small `setCharacterGame()` helper that uses `readCharacterProfile` + `writeCharacterProfile` (NOT `buildCharacterProfile` — the latter rebuilds `state` from localStorage and would wipe the non-loaded character's saved automations). Hidden on DRX/DRF tiles.
- **Wizard simplified ✅.** Step 2 now lists three game radios (DR/DRX/DRF) instead of four; when DR is selected, a sub-checkbox "Connect to Prime Test (DRT) instead" appears. Selection resolves to `game: 'DR'` or `'DRT'` at finish() time via a `resolvedGame` const; the EAccess preview on the direct-connect path also uses it (DRT character list is queried separately from DR even though they're the same characters — Simu's SGE requires the exact gameCode).
- **DIRECT badge tooltip ✅.** Hover the DIRECT badge to read "Direct connect to game server — Lich integration unavailable. Lich is recommended for scripting and automation." Discoverability nudge for the recommended path without recolouring the badge into a warning.
- **Lich Setup field cleanup ✅.** Dropped two settings: **Delay (s)** was vestigial after the v0.7.0 connect-with-retry rework (only used as a `Math.max(..., 30)` floor for the timeout cap, now hardcoded to 30s in `ConnectionManager` — bumping it is a one-line code change if anyone ever needs it); **Hide Lich Window** was the toggle for showing Lich's cmd.exe console — Lich now always launches hidden (`windowsHide: true`, direct-spawn). The visible-console branch piped nothing useful that stderr-piping doesn't already surface via the error banner. `lichDelay` and `hideLichWindow` stripped from `AdvancedSettings`, `SharedProfile`, `LoginCredentials`, `LichConnection.launch`'s signature, `LichSetupFields` UI, and the profile builder. Old saved profiles with these keys parse fine and the values are silently ignored on import — no migration needed.
- Build + tsc clean. ✅

**v0.7.1 — Compass theming + tab-switch / Quick-Send polish ✅**

A small UX pass — three reported papercuts plus a compass legibility fix the developer noticed alongside them.

- **Compass redesigned chrome-less (B90) ✅.** The floating compass used to render as a semi-opaque card (`rgba(0,0,0,0.55)` background + 1px white-7%-alpha border) with each direction as a chip (active fill + border + box-shadow glow). On a black story window the card was nearly invisible *and* hid game text behind a blur; on a light theme it would have dropped a black blob on the page. Several iterations (themed panel-bg vars at varying alpha, backdrop blur on/off) all looked wrong in one theme or another. Final landing: **no card at all.** The wrapper has no background, border, or padding — the cells float over the game text. Active cells illuminate via themed text color + a `text-shadow` glow (no chip background, no border). Inactive cells render at `opacity: 0.45` so the compass shape is visible at rest. Arrow glyphs got `-webkit-text-stroke: 0.6px currentColor` because Unicode arrows (↖ ↑ ↗ …) barely respond to font-weight; text-stroke thickens them reliably regardless of font. The intermediate `--compass-panel-bg` / `--compass-panel-border` / `--compass-active-bg` / `--compass-active-border` / `--compass-inactive-bg` / `--compass-inactive-border` CSS vars and their Theme Editor entries were stripped — dead config after the chrome-less switch. Live themed surface: `--compass-active-text`, `--compass-active-glow`, `--compass-inactive-text`, `--compass-center-text`. Also: special-exit label `DN` → `DOWN` (uppercase pill auto-grows past the 24px min-width); backdrop blur removed (compass was sharpening text behind it artificially, removing the blur let game text read normally through the cells).
- **Ctrl+# / Ctrl+Tab focuses the command bar (B91) ✅.** Reported by Binu. Pressing Ctrl+1..9 or Ctrl+Tab switched the active session but left focus wherever it was — testers had to click into the new tab's command bar before they could type. Added a `refocusActiveCommandBar()` helper in [App.tsx](src/renderer/App.tsx)'s app-level keydown handler that runs a `requestAnimationFrame` after `setActive(...)` and focuses `.session-shell:not(.session-shell--hidden) .command-input`. The selector naturally picks the just-revealed tab since hidden session-shells are `display:none`. Ctrl+Shift+Enter does NOT refocus the source bar (focus should land in QuickSend, which auto-focuses its own input).
- **Font picker shows each font in its own face (F15) ✅.** Requested by Binu. The Settings → Font family list rendered every entry in the panel's inherited monospace face — Cascadia Code, Times New Roman, Comic Sans, and Wingdings all looked identical, defeating the picker's purpose. Each entry now applies `style={{ fontFamily: "'<name>'" }}` so the label renders in its actual face. (First cut used `style={{ fontFamily: "'<name>', inherit" }}` for a fallback safety net — turned out `inherit` is invalid CSS in a font-family *list* per spec; browsers silently discard the whole declaration when they see it, and Binu correctly reported the feature was still showing every font as monospace. The list is sourced from `queryLocalFonts()` so every name is guaranteed to exist on the system — no fallback needed.) Pure visual change; the system-font enumeration and the monospace filter unchanged.
- **Font-default migration footgun (B94) ✅.** Self-found during a bug-test pass on B93. `LEGACY_KEYS` in [SettingsPanel.tsx](src/renderer/components/SettingsPanel.tsx) contained `cascadia: 'Cascadia Code'` from a much earlier preset-key cleanup — harmless until B93 promoted `'cascadia'` to the *active* default. Now any fresh user who opened Settings triggered the migration and lost the broad `'Cascadia Code' → 'Fira Code' → 'Consolas' → monospace` fallback chain, replaced with the narrower `'Cascadia Code', monospace`. On a Win10 machine without Windows Terminal bundling Cascadia, the font visibly flipped from Consolas to generic monospace the moment Settings opened. Fix: removed the `cascadia` entry from `LEGACY_KEYS` (the other three are still genuinely retired keys, stay); header displays `FONT_FAMILY_LABELS[fontFamily] ?? fontFamily` so the legacy-key state reads as "Cascadia Code (default)" instead of the raw `cascadia`; list highlight resolves to the first font in the chain so the right row lights up.
- **Font-weight comfort pass (B93) ✅.** Reported by Sekmeht and Binu — Lichborne "felt too heavy" compared to Genie / Frostbite; specifically, regular game text read as already bold and the hand-held / spell-active states snapped from regular straight to extra-bold. Audit identified two root causes: (1) the default font was **Consolas**, which only ships with 400 and 700 weights — every `font-weight: 600` in the codebase (hands, spell, status bars, panel tabs, character tabs, vitals) fell back to full bold 700, so the UI's intermediate-weight emphasis collapsed into binary normal-or-bold; (2) `[data-preset="bold"]` and `[data-preset="roomname"]` applied `font-weight: bold` (700) — standard but harsh given (1). Fix, three coordinated changes: **(a)** `DEFAULT_SETTINGS.fontFamily` switched from `'Consolas'` to `'cascadia'` ([Cascadia Code](https://github.com/microsoft/cascadia-code), bundled with Windows Terminal / stock with Windows 11, in the fallback chain since v0.1) — ships weights 200/300/350/400/500/600/700 so intermediate emphasis renders at its intended weight. Players who explicitly chose Consolas in their profile keep it (no migration), only fresh installs get the new default. **(b)** [iconbar.css](src/renderer/styles/iconbar.css) — `.hand-held .hand-item` and `.spell-active` lost their `font-weight: 600`. Held / active states now read purely via color change (and the existing spell-glow), not a weight snap. **(c)** [panels.css](src/renderer/styles/panels.css) — `[data-preset="bold"]` and `[data-preset="roomname"]` dropped from `bold` (700) to `600` (real semibold on Cascadia, falls back to 700 on Consolas — no regression for opt-in Consolas users). Settings preview chips ([settings.css](src/renderer/styles/settings.css)) match. Other 600/700 weight uses (status bars, vitals, toolbar, character tabs) were inventoried but left alone — visible as theme/HUD chrome, not in the "regular text feels bold" complaint surface.
- **Quick-Send prefills with active command text + broadcast option (B92, F14) ✅.** Reported by the developer. Ctrl+Shift+Enter opened with an empty input — typing a command and then deciding to retarget it required retyping. App.tsx now snapshots `.command-input`'s value at the moment the chord fires and passes it through; `showQuickSend` widened from `boolean` to `{ initialCommand: string } | null` so the value rides through to the modal. [QuickSend.tsx](src/renderer/components/QuickSend.tsx) accepts `initialCommand` and uses it as initial state; the input is also `select()`ed on open so a prefilled value can be replaced mid-typing or sent as-is with Enter. The source bar is intentionally left untouched — less destructive than auto-clearing. **Broadcast target ("Send to all connected")** added at the bottom of the dropdown — sentinel `ALL_TARGET` value alongside real `CharacterId`s in `target` state, send handler branches and iterates `sessions.filter(s => s.status.connected)`. Sends to *every* connected character including the active one. Hidden when fewer than 2 connected (no point). Placed last in the dropdown so single-target stays visually primary — fat-fingering a broadcast from the default target shouldn't be a one-click mistake.
- Build + tsc clean. ✅

**v0.7.0 — Map performance, automapper & Lich-connection pass ✅**

A polish stream driven by tester profiling and bug reports, alongside the Session Log work (same unreleased v0.7.0).

- **Genie map performance during travel (B86).** DevTools traces during cross-map runs showed the rendering pipeline (Layerize / Paint / Recalculate Style) eating 50–80% of the frame budget — the per-room animated effects, hundreds of CSS-animated SVG elements. Three fixes: (1) **effects are omitted, not paused** while travelling/panning/off — pausing via `animation-play-state` left every element layer-promoted, so the effect groups now simply aren't mounted unless `showEffects` (`mapAnimations && !isDragging && !inMotion`); they re-mount `MOTION_QUIET_MS` (600ms) after the player stops; (2) **viewport culling** — the effect memos iterate `nearbyNodes` (rooms inside the current pan/zoom, `EFFECT_CAP` 30 backstop) instead of every colored room in the zone — idle-in-the-Crossing Recalculate Style was ~29%; (3) **hover suppressed during motion** (`inMotionRef`) — the map scrolling under a stationary cursor was firing a pointer-event storm. Healer heartbeats are a **priority effect** — always rendered zone-wide and exempt from the travel freeze (finding a healer matters; they're rare/cheap). Player-housing rooms lost their hearth-glow flicker (noise — housing is everywhere). Vite `build.sourcemap` enabled so production profiler traces resolve real names.
- **Automapper loses the player while running (B87).** Same-titled rooms (the Crossing has 7 "Moonstone Street" rooms) couldn't be disambiguated while running — the game streams room titles with no fresh description per step, so `currentLocation` fell back to file order (`pool[0]`) and the marker stuck until a `look`. Added **graph-adjacency disambiguation**: when the title is ambiguous and the description doesn't resolve it, prefer the candidate joined by a Genie arc to the previously-resolved room (`prevLocRef`). Resolution order: description → adjacency → file order.
- **Inactive character's map camera strands off-screen (B88).** An inactive tab's GameWindow is `display:none`, so its map SVG measures 0×0 — the follow camera can't track, the transform goes stale (or, via an unguarded `centerOnCurrent`, garbage). Tab back and the camera is pointing rooms away. Fix: guarded `centerOnCurrent` against 0 dimensions; a `ResizeObserver` on the SVG recenters on the player when the map regains a layout box (tab shown, or a real panel resize). New CLAUDE.md pitfall #24: hidden ≠ unmounted, but hidden = unmeasurable.
- **Lich launch & connect rework (B85).** Replaced the fixed `lichDelay` timer (a guess that "sometimes failed") with **connect-with-retry** — `LichConnection.connectWithRetry()` retries the real connection (250ms cadence, ≥30s cap) until Lich's front-end port accepts; the first success is the session socket, no throwaway probes. `launch()` resolves on the child's `spawn` event and watches `exit`/stderr so a Lich that dies on startup fails fast with a real message. Multi-character logins **serialize** their spawn→connect window (`serializeLichLaunch` module-level chain) — one Lich serves one front-end then closes its listener (verified in Lich's `main.rb`), so concurrent characters reusing port 11024 no longer race or cross-wire. A failed launch kills its Lich so it can't squat the port. SGE/eaccess auth runs outside the queue (overlaps the wait) and resolves before the spawn (a bad password no longer orphans a Lich).

**v0.7.0 — Session Log (Release E2) ✅**

The last remaining Release E2 deliverable. Lichborne now writes clean per-character daily log files and surfaces them through a small in-client modal. Built to the locked spec in DESIGN.md §28.

- **Capture pipeline** — `GameWindow.onGameEvent` captures every non-state event (stream text, command echoes, connect/disconnect notices) into per-character buffered writers in the main process ([sessionLog.ts](src/main/sessionLog.ts)). Files at `{userData}/Logs/{Character}/{Character}_YYYY-MM-DD.log`, format `[HH:MM:SS][stream] text`. Buffered 1s / 100-record flush; force-flush at 5000; flushed on graceful close alongside the YAML backup. Room sub-streams, `raw`, and blank lines are skipped (state, not history).
- **Capture config — app-wide, in `_shared.yaml`** — all Session Log preferences (capture gates, retention, compression, raw-size cap, the Recent-tail filter, the Export format prefs) live in one `SessionLogSettings` object ([sessionLogSettings.ts](src/renderer/sessionLogSettings.ts)) stored in `_shared.yaml` via `SharedProfile.sessionLog`. Logging is configured once for every character. `GameWindow.logToSession` reads it fresh per batch (`loadSessionLogSettings()`); the SettingsPanel section and the Logs modal each read-modify-write the shared object so neither clobbers the other's fields. (Initially built as per-character `AppSettings` fields, then moved to shared — logging is a global behavior, not a per-character one.)
- **Size management** — three levers, after a tester measured ~6 MB/hour: (1) trimmed the on-disk line format — dropped the redundant per-line date and milliseconds (~15-20% smaller, parsers still accept the legacy dated form); (2) gzip-compress closed (non-today) day-files to `.log.gz` via background `maintain()` (~85-90% smaller), readers gunzip transparently; (3) dual retention — age-based `pruneOldLogs` plus `enforceRawSizeCap`, a cap on *uncompressed* `.log` bytes only (never archives, never today's file). Settings gains a Compress toggle, a raw-size cap input, and a live disk-usage readout (`session-log:disk-usage`). Net ~7-8× smaller 30-day footprint.
- **Session Log modal** — new "Logs" toolbar button opens [SessionLogModal.tsx](src/renderer/components/SessionLogModal.tsx) with three views. *Recent Tail*: day picker, paginated 200-line tail with anchored "load older", stream multi-select checkboxes (discovered by scanning the day-file), Everything/Combat/Social/Quiet presets, dedup toggle. *Quick Search*: substring/regex match across a Today / 7-day / 30-day / custom window, result list grouped by date, click-to-jump that re-centers Recent Tail on the hit line. *Export*: see below.
- **Export builder ("Create Log File")** — pick a date range (multi-day), pick stream layers, choose format (include timestamps / stream tags / dedup / summary header / one-file-per-stream), then Copy to Clipboard or Save File. All reading/filtering/formatting/writing runs in main (`session-log:build-export`) — only the `SessionLogExportSpec` and a small result cross IPC, so a 30-day export never serializes line data to the renderer.
- **Show in Log** — right-click any game line → "Show in Log" opens the modal straight into Quick Search pre-filled with that line's text.
- New IPC: `session-log:list-streams` (single day or a date range), `session-log:build-export`, `session-log:disk-usage`; `session-log:search` now returns `lineNo`/`total` for jump-to-tail.
- Build + tsc clean across both projects.

**B54 — Mono-mode lines don't wrap ✅: `<output class="mono"/>` blocks (health output, `>exp`, `>info`) applied `white-space: pre` in `TextLineRow` — `pre` suppresses wrapping entirely so long wound-list lines ran off the right edge of the panel. Fix: changed to `white-space: pre-wrap` — column spacing and leading whitespace are preserved while lines still wrap at the panel boundary. Reported by Legiro ✅**

**v0.6.12 — Scroll-pin fix + story-window smooth scroll removed ✅**

Two related changes. A regression hunt found that scrolling up to read history while game text arrived dragged the view off-screen; and the story-window smooth-scroll feature — opt-in, off by default, marginal — was generating more confusion and false bug reports than value. Fixed the regression and removed the feature.

_Scroll pinning fix (B84)_

- **`contain` removed from the text rows ✅** — v0.6.8 added `contain: layout style` to `.text-line` / `.text-line-wrap` as a per-row reflow-isolation perf hint. `.text-line-wrap` is the react-virtuoso row; layout containment isolates each row from Virtuoso's own item-measurement and scroll-offset bookkeeping, so when the list updated while the user was scrolled up, Virtuoso couldn't hold the position — the content being read got dragged. Removed both declarations, DO-NOT-RE-ADD comments left in the CSS (and CLAUDE.md pitfall #23). Diagnosis was by elimination: the bug reproduced with smooth scroll off, and with smooth off every GameWindow scroll-machine path reduces to its exact v0.6.7 value — the CSS was the only always-active change.

_Story-window smooth scroll removed_

- **Smooth scroll deleted ✅** — The v0.6.8–v0.6.11 story-window smooth-scroll feature (opt-in, off by default) is gone: the `smoothScroll` / `smoothScrollBurstLimit` settings, the flood detector (`floodRef` / `floodCountRef` / `floodTimerRef`, `smoothActive()`, the per-batch accounting), the `smoothScrollRef` mirror, the `FLOOD_*` constants, and the Settings "Smooth Scrolling" toggle + "Burst limit" field. `followOutput` is back to `'auto'`, `totalListHeightChanged` to a direct `scrollTop` write, `scrollToBottom` to `behavior:'auto'`, suppress windows to the flat pre-v0.6.8 200/300ms. The story window is plain instant-follow again. The `index:'LAST'` fix in `scrollToBottom` (the real B77 stale-closure fix) was kept; the room-state pump and the `will-change` scroller hint were kept.
- **Map camera glide kept, re-gated ✅** — The Genie map's `genie-pan-smooth` camera glide stays, now gated on the existing **Genie Map Animations** setting instead of `smoothScroll`. That one toggle is now the single switch for all Genie map motion — per-room category effects AND the camera glide. Default on.
- Old profiles that stored `smoothScroll` / `smoothScrollBurstLimit` keep them as harmless dead keys in the `settings` blob — `loadSettings` ignores unknown keys, no migration needed.

- Build + tsc clean. ✅

**v0.6.11 — Tunable smooth-scroll burst limit ✅**

A follow-up to v0.6.10. The flood-adaptive smooth scroll cured huge bursts (the login dump) but its trip threshold was hardcoded at 40 lines — moderate commands like `exp` slipped under it and kept smooth-scrolling, which still janked on Binu's 4K rig (he ended up turning smooth scroll off entirely). v0.6.11 makes the threshold a player-tunable setting.

_Smooth scroll — tunable burst limit_

- **`smoothScrollBurstLimit` setting ✅ (B83)** — New `AppSettings` field, **default 25** (down from the hardcoded 40). Surfaced as a **Burst limit** number stepper (range 5–200, step 5) under Settings → Smooth Scrolling — shown only when Smooth Scrolling is enabled, since it's a sub-option of it. Lower = smooth scroll falls back to instant on smaller bursts. `GameWindow`'s flood detector reads the live value via a `floodThresholdRef` mirror (the once-at-mount game-event listener can't see fresh `settings`); the `FLOOD_THRESHOLD` constant is gone. Per-character; persists to the character profile via the `AppSettings` blob (same path as every other setting). The login dump is hundreds-to-thousands of lines so it trips flood mode at *any* setting — the knob only controls whether moderate bursts also snap to instant.
- Default lowered to 25 so a moderate command trips flood mode out of the box; testers on slow hardware can drop it to 5–10, fast rigs can raise it.

- Build + tsc clean. ✅

**v0.6.10 — Flood-adaptive smooth scroll ✅**

A targeted follow-up to v0.6.9. Binu (4K display) found that *enabling* smooth scrolling reintroduced heavy lag at startup — XML and graphical updates crawled for a minute or two before settling. v0.6.10 makes smooth scroll usable when opted in, by making it adaptive instead of unconditional.

_Smooth scroll — flood-adaptive_

- **Flood detection ✅ (B82)** — Smooth scroll is the right feel for a trickle of new lines but pathological during a burst: the lagging scroll position makes react-virtuoso continuously mount/unmount rows as the animation *sweeps* between the old and new bottom — a DOM-mutation storm. Binu's DevTools bottom-up profile of the 4K startup was ~74% render pipeline (Recalculate Style 21%, Layerize 19%, Paint 15%); on a 4K panel each re-raster is ~4× cost, so the renderer couldn't drain `game-event` IPC batches and a multi-minute backlog formed. Fix: a flood detector in the game-event handler accumulates `floodCountRef += newMain.length`; past `FLOOD_THRESHOLD = 40` lines with no `FLOOD_WINDOW_MS = 500ms` quiet gap, `floodRef` trips. `smoothActive()` = `settings.smoothScroll && !floodRef.current` is now the single source of truth for all five smooth/instant decision points (`followOutput`, `totalListHeightChanged` ×2, `scrollToBottom`, the two suppress-arm sites). While flooding → instant scroll → the rendered window parks at the bottom, no sweep. Smooth resumes automatically after the burst. The flag trips once at a burst's start, clears once at its end (no flicker); the timer is cleared on unmount; per-session refs. Fixes the startup flood AND heavy combat, with no new setting — the existing Smooth Scrolling toggle just got smarter.
- The Genie map camera glide deliberately stays on the raw `settings.smoothScroll` (not flood-gated) — it's one cheap CSS transition, not a re-virtualization storm.

- Build + tsc clean. ✅

**v0.6.9 — Opt-out toggles for smooth motion + `;list` visibility fix ✅**

A small follow-up to v0.6.8. Binu reported that the smooth-scroll animation and the Genie map effects degraded performance on his hardware. Rather than walk back v0.6.8's work — it's fine on most machines — v0.6.9 adds two per-character opt-out toggles. Also fixes a long-standing annoyance where a manually-typed `;list` produced no visible output.

_Settings — smooth motion is now opt-out_

- **Smooth Scrolling toggle ✅** — New `smoothScroll` field on `AppSettings`, **off by default**. Gates BOTH the story-window smooth scroll (`followOutput`, `totalListHeightChanged`, `scrollToBottom` fall back to `'auto'`; suppress window 500ms→200ms) AND the Genie map camera glide (the `genie-pan-smooth` transition class on the pan group + indicator). Off restores the exact pre-v0.6.8 instant-snap behavior. Opt-in because v0.6.8 shipped it on and a tester found it costly — defaulting off means nobody pays for it unless they want it.
- **Genie Map Animations toggle ✅** — New `mapAnimations` field, **on by default**. When off, the pan group permanently wears a new `genie-anim-off` class — the same `animation-play-state: paused` cascade the map already uses during drag/walk, applied always. Freezes every per-room category animation (motes, ripples, glints, heartbeats, etc.). Unlike the transient drag/walk freeze (`genie-pan-dragging`, which exempts the locator ping so you can still see yourself mid-walk), `genie-anim-off` has NO exemption — "off" stops the sonar ping too. The two freeze classes are mutually exclusive on the pan group, so there is no specificity conflict.
- **Both persist to the character profile ✅** — `smoothScroll` / `mapAnimations` ride in the `AppSettings` blob under `scopedKey(character, 'settings')`, captured by `buildCharacterProfile`'s dynamic `state:` scan and round-tripped by `importCharacterProfile` — same path as `autoLinkUrls`. Per-character; `loadSettings` merges over `DEFAULT_SETTINGS` so existing profiles need no migration.
- **Prop threading ✅** — `smoothScroll` / `mapAnimations` flow `GameWindow → PanelFrame → renderPanel → MapPanel → GenieMapView` (and the direct full-screen `MapPanel`), mirroring the `autoLinkUrls` path. `GameWindow` holds a `smoothScrollRef` for the once-at-mount event-stream listener and the keydown-captured `scrollToBottom`, which run with closures that can't see fresh `settings`.

_Lich Scripts — manual `;list` is visible again_

- **Auto-poll suppression is now poll-aware ✅ (B79)** — `LichBridge.interceptLine` consumed any line matching the `;listall` response format, so a player-typed `;list` / `;listall` was hidden along with the auto-poll's. New `LichBridge.pollScriptList()` (the auto-poll entry point, called by the `lich:poll-scripts` IPC handler) arms a 4-second window; `interceptLine` consumes a matching line only while the window is live. A response arriving disarmed is a manual command and passes through to the game window. The panel refreshes from both. 4s expires on its own so a lost auto-poll response can't silently eat a later manual list.

_Lich Map — zoom default + retention_

- **Lich Map zoom is no longer hardcoded ✅ (B81)** — `MapImageView`'s image-onload centering handler forced `scale: 3` every time a map image loaded, so the effective default was 3× (testers found it far too close) and any zoom-out was lost on the next image change or relaunch. The zoom is now persisted per-character (`scopedKey(character, 'lichMapScale')`, debounced 400ms + profile-saved) and the centering handler reads the live scale via a `scaleRef`. New first-time default `DEFAULT_LICH_SCALE = 1.5`. Net effect: the Lich Map holds your zoom across room changes, image changes, and relaunches — matching how the Genie Maps camera retains its zoom.

- Build + tsc clean. ✅

**v0.6.8 — Map motion polish + click model + scroll smoothness ✅**

A polish-and-feel release across two subsystems. The Genie Maps view got a smooth-motion camera, a new left/right-click model, a pulsing sonar locator, and a batch of follow/zone-resolution bug fixes. The main game-text window got smoother scrolling, room-state streaming, and a focus-aware Home/End fix from tester feedback.

_Genie Maps — click model_

- **Left-click pins, right-click walks ✅** — Left-clicking a regular room pins a persistent gold BFS path from the player to that room (click it again to clear) instead of walking. Walking moved to right-click. Left-clicking a stub (cross-zone marker) switches the displayed zone to the stub's target XML; right-click on a stub still walks to the boundary room. Lets users study a route before committing. Hover-tooltip and legend copy rewritten to spell out the new bindings. Browser context menu suppressed on the SVG so right-click never shows the OS menu.
- **Pinned-path overlay ✅** — `pinnedPathSegs`/`pinnedPathIndicator` draw the pinned route as a gold poly-line (distinct from the green hover-path preview). Recomputes per walk step so the path shrinks as the player approaches; auto-clears on arrival, zone change, or level change.

_Genie Maps — smooth camera_

- **CSS-transform pan/zoom + transitions ✅** — The pan group switched from the SVG `transform` attribute to the CSS `transform` property so it can be CSS-transitioned. `.genie-pan-smooth` applies `transition: transform 150ms linear` — follow-the-player walks and wheel zoom now slide between positions instead of snapping. `linear` is deliberate: a follow camera re-targets every walk step, and an ease-out curve resets its velocity profile on each restart, producing a visible accelerate/decelerate pulse (the "jitter" testers saw). The class is suppressed while `isDragging` so manual drag stays 1:1 with the cursor.
- **Snap-on-large-delta ✅** — A 150ms transition visibly "races across" the screen on a big jump. `snapTransform` (a render-time delta check, > 600px or > 20% scale change vs the last painted transform) drops the transition for zone switches, ◆-from-afar, and fit-to-view so those cut instantly. `prevTransformRef` updates in a post-commit `useEffect` so the comparison is always "this render vs last painted."
- **Indicator lockstep transition ✅** — The "you are here" halo lives inside the pan group; with only the pan transitioning, the halo sat off-centre for 150ms after each step then slid back ("bounce"). Fix: the indicator gets its own matched transition (same class, same snap flag). The two interpolations cancel — `lerp(panA,panB,f) + lerp(roomA,roomB,f) = centre` for all `f` — so the halo stays pinned at screen centre while the map slides beneath it. `indicatorSnap` adds an indicator-specific large-jump check (world-distance based) so the halo also snaps correctly on follow-off teleports, where the pan delta is zero.
- **Sonar ping locator ✅** — The "you are here" indicator gained two expanding ghost rings (`genie-here-ping`, staggered half a cycle so a fresh ring emanates ~every 1s) emanating from the solid ring. `non-scaling-stroke` keeps them thin as they grow. The ping is exempt from the drag/motion animation-pause (a higher-specificity rule beats `.genie-pan-dragging *`) since it's one cheap element and it's the thing the user most wants to keep tracking. Solid ring radius trimmed 25% (`INDICATOR_R = NODE_SIZE * 1.3125`, was 1.75×) per feedback that it read too large.

_Genie Maps — bug fixes_

- **Follow camera reliability ✅** — The follow `useLayoutEffect` previously gated on its own zone/level equality checks, which could diverge from the indicator's `visibleById.get()` gate by one render — marker visible, camera bailed. Now both derive from the same `followNode = visibleById.get(currentLocation.node.id)` lookup, so "marker visible" and "camera following" are guaranteed in lockstep. Added a `requestAnimationFrame` retry for the rare case `svg.clientWidth` reads 0 mid-layout.
- **Stub-click no longer zooms out ✅** — Left-clicking a stub to switch zones used to fire the fit/center effect's `fitToView` (player not in the new zone → `playerHere` false), zooming the camera all the way out. Now stub-click resolves the *reciprocal entry room* (the target zone's stub pointing back to where you came from), centres on it at the current scale, pre-sets `lastFitRef` so the fit/center effect bails, and sets `followPlayer = false` (you're browsing now — ◆ re-enables and yanks back).
- **Title→room disambiguation merge ✅ (B78)** — `currentLocation` resolution merged: `byTitle` ∪ `byNormalized` before the non-stub filter, so a `byTitle`-only stub can't trap the match in the wrong zone when the real room is reachable through the normalized form. Fixed the "marker stuck in Segoltha while player is in the Crossing" report.
- **Toolbar clipped at small window heights ✅** — `GenieMapView`'s outer wrap had an inline `height: 100%` that overrode the CSS flex sizing; at narrow heights it pushed the MapPanel's own toolbar (Lich/Genie tabs) off-screen. Removed the inline height — CSS `flex: 1; min-height: 0` sizes it correctly.
- **Home node aura ✅** — Player Housing (`#00FFFF`) moved from `AURA_INTENSIFIED_COLORS` to `AURA_FIRE_COLORS` — home nodes now get the same hearth-glow flicker aura as Interesting Rooms.

_Game text window_

- **Room-state pump ✅** — Fast running emits multiple `room-title` events in quick succession; React 18 auto-batches the `setRoomState` calls so only the last room survived into the next render and the map indicator skipped 2-3 rooms at a time. Fix: room updates queue into `roomQueueRef` and a `requestAnimationFrame` loop applies one per frame, so each room visit gets its own render commit ("streamed" feel). Queue capped at 8 — an extreme burst trims to the most recent 8 rather than letting the marker lag seconds behind.
- **Smooth scroll ✅** — `followOutput` switched `'auto'` → `'smooth'` and `totalListHeightChanged` / `scrollToBottom` now use smooth `scrollTo`/`scrollToIndex`. Incoming text slides the viewport instead of snapping; overlapping animations from rapid arrivals collapse into one continuous slide. The `suppressUntilRef` window widened 200ms → 500ms so the mid-animation scroll events don't trip the unpin threshold.
- **Scroll containment + GPU layer ✅** — `.text-line` / `.text-line-wrap` get `contain: layout style` (per-row reflow isolation); `.text-window` gets `overscroll-behavior: contain` (kills rubber-band bounce); the Virtuoso scroller gets `will-change: scroll-position` (compositor-only scroll). Addresses the "jerks and tears during heavy scrolling" report.
- **Home/End focus-aware ✅ (B77)** — Reported by Binu. When the command input is focused, `Home`/`End` are now native (cursor to start/end of the typed command) instead of scrolling the story window. `Ctrl+Home`/`Ctrl+End` still scroll the story to top/bottom; `PageUp`/`PageDown` unchanged. Also fixed a stale-closure in `scrollToBottom` (captured an empty `lines` array at mount) by switching to `scrollToIndex({ index: 'LAST' })`.

- Build + tsc clean. ✅

**v0.6.7 — Genie Maps effect system + state indicators + debug-panel polish ✅**

Follow-up to v0.6.6's Genie Maps rewrite. Three streams of work: a comprehensive per-color animated effect system on the new map view (every COLOR_LEGEND category now has a unique motion signature), parser/UI support for two indicators we'd been missing (poisoned, diseased), and a handful of debug-panel and login-flow polish items. The map effect work is the dominant change — adds a structured "what kind of room is this?" visual language layered over the bare Genie XML data.

_Map effects — per-category animations_

- **Per-color effect system on GenieMapView ✅** — Every recognized COLOR_LEGEND color now gets a category-specific visual treatment beyond the rect's fill. Effects are implemented as CSS keyframes for GPU compositing; the React side renders 1-4 extra SVG elements per affected node, all hoisted into named memos (`sparkles`, `heartbeats`, `coinGlints`, `ripples`, `bubbles`, `cautionRings`, `implodes`, `xpRises`, `leafFalls`, `dirtFalls`). Color sets at the top of the file declare which colors trigger which effect; adding a new effect later is a 4-step pattern (color set + memo + CSS keyframe + render slot).
- **The full per-color matrix:**
  - **Fuchsia (Transport)** — vortex sparkles, 3 motes orbiting the node center at 120° spacing
  - **Periwinkle (Shrine)** — outward-drift sparkles, 4 motes NSEW
  - **Purple (Favor Altar)** — slow-rise sparkles, 3 motes drifting upward
  - **Yellow (Stat Training)** — fast-rise sparkles, 3 motes drifting upward faster (effort climbing)
  - **Mint (Auto-Healer)** — heartbeat ring, ECG-style lub-dub opacity pulse on a stroke around the rect
  - **Red (Shop)** — coin glint, gold dash slides around the rect perimeter via `stroke-dashoffset`
  - **Blue (Water)** — concentric ripples, three rings scaling outward via `transform: scale()` (switched from animating `r` directly because Chromium support is uneven)
  - **Navy (Underwater)** — rising bubbles, two white circles drift upward and pop
  - **Amber (Obstacle)** — caution blink, slow on/off opacity pulse on a stroke ring
  - **Eggplant (Depart)** — imploding rings, opposite direction from ripples — rings start large and shrink inward
  - **Sienna (Mining)** — dirt fall, three rusty-brown particles fall straight down from below the rect
  - **Sand (Trailhead)** — dirt fall too, same animation with sandy tan particles (only effect to share a keyframe across categories; particle color picked per-room by `dirtParticleColor()`)
  - **Green (Lumberjacking)** — leaf fall, three small green dots drift downward with horizontal wobble
  - **Orange (Guildleader)** — XP rise, two gold particles rise from the rect bottom upward past the top ("level up here")
  - **Lime (Interesting Room)** — fire aura, irregular flicker on the aura itself (1.3× rect size — slightly larger than other auras so the flicker has visible diffuse area)
  - **Aqua (Player Housing)** — intensified static aura (0.28 vs default 0.15), no motion
- **Mote contrast color via luminance ✅** — `getMoteContrastColor(hex)` measures relative luminance (ITU-R BT.601) of the room's color and mixes the mote fill toward white for dark backgrounds (Transport, Favor Altar) or toward dark for light backgrounds (Shrine, Stat Training). Earlier pull-toward-white always made motes invisible on light-tinted magical categories.
- **Tool glyphs ✅** — Pickaxe `⛏` on Mining rooms, axe `🪓` on Lumberjacking. Centered on the rect via SVG `<text>`, white fill, font size 5px (half the stub `↗` glyph so it reads as a category marker, not a category banner). Trailing U+FE0E variation selector forces text presentation in browsers that might render these as colored emoji. Stubs always win — a cross-zone exit in a mining cluster shows `↗`, not the pickaxe.
- **Aura system — color-specific size + animation classes ✅** — All COLOR_LEGEND colors get a translucent aura behind the rect; categories in `AURA_INTENSIFIED_COLORS` (Guildleader, Housing) get opacity 0.28 instead of 0.15; the single category in `AURA_FIRE_COLORS` (Lime/Interesting) gets the flicker animation AND a slightly larger 1.3× size so the diffuse glow reads. `opacity` SVG attribute is omitted when an animated class is applied — CSS owns opacity to avoid attribute-vs-CSS ambiguity.
- **Named color hex normalization ✅** — Some Genie XML files use CSS color names instead of hex codes (`color="Blue"`, `Red`, `Aqua`, `Lime`, `White`). Added `NAMED_COLOR_HEX` map + `normalizeNodeColor()` in `parseGenieZone`. Pre-fix, a room with `color="Blue"` rendered as blue (CSS accepts the named color) but `COLOR_LEGEND` and effect lookups all keyed by hex code, so the room got no aura or animation. Discovered when "House of the Silk Strings, Lotus Pond" (Map 66, room 737) showed as a plain blue rect with no ripple effect despite being a water room.
- **Map labels scaled down to 80% of game font ✅** — Labels previously at full game-text size visually dominated against the 8×8 node rects. Now `calc(var(--game-font-size, 12px) * 0.8)` keeps labels readable while subordinating them to the map's primary content. Attempted 0.65 in testing but Genie's XML label positions are calibrated for ~Genie default font width; below 0.8 labels visibly drift away from their target clusters as the text shrinks relative to the position anchor.
- **Tooltip width / position clamping ✅** — Hover tooltip on the map now caps `maxWidth` at `canvasW - 2*EDGE_PAD` and clamps `left` to `[EDGE_PAD, canvasW - ttW - EDGE_PAD]`, so on narrow panels (panel-stream MapPanel at 200-300px wide) the tooltip shrinks and stays inside the canvas instead of overflowing off-screen. Flip-on-overflow still applies on wider canvases.
- **Legend updates ✅** — Stale "click to switch to the target zone" copy (left over from the deleted auto-switch-on-stub-click behavior) replaced with "Click to walk to the boundary." New "Room glyphs" section added that renders pickaxe / axe with category labels, gated on the relevant rooms actually being visible on the current floor.

_State indicators — Poisoned + Diseased_

- **`IconPOISONED` / `IconDISEASED` parser recognition ✅** — Discovered by auditing Genie's `Core/Game.cs` indicator case list against ours. Both legacy clients (Genie + Frostbite) ignore these, but DR has sent them as standard `<indicator id="..."/>` tags for years. Added `isPoisoned` / `isDiseased` flags to `StormFrontParser`, surfaced via the existing generic indicator-event path so `indicators.poisoned` / `indicators.diseased` populate automatically in the renderer.
- **7th "Affliction" slot on IconBar ✅** — New status slot multiplexes Poisoned > Diseased. Sits to the right of the existing Combat slot (Bleeding > Stunned > Dead). The two slots are intentionally separate: bleeding and poisoned can fire simultaneously and players need to see both (different cures, different timers). Adding Poisoned/Diseased to the existing Combat multiplexer would have hidden one when the other was active.
- **Theme variables ✅** — `--ind-poisoned-*` and `--ind-diseased-*` added to darkBase + the four themes that already override indicator colors (ivory, mist, parchment, classic). Poisoned reads as toxic green; diseased reads as sickly yellow-green/mustard. Distinct hues so when one supersedes the other in the slot you can tell which is showing.

_Debug panel + login polish_

- **Debug panel no longer auto-opens on dirty disconnect ✅** — `GameWindow.tsx`'s connection-status handler used to call `setShowDebug(true)` whenever `!s.clean`. Script-issued `exit` flows (e.g., `combat-trainer>exit` from a Lich script) don't always set `cleanDisconnect` on the main side, so their drops looked dirty and the debug panel intrusively popped open. The status banner ("Connection lost") already communicates the event; users who want to inspect can click Debug.
- **Debug events buffer gated on panel-open state ✅** — Pre-fix, `debugEventsBufRef.current.push(...events)` ran unconditionally and the Events tab showed `(500)` on first open even though no events had been visible (they'd been collecting in memory). Now matches the raw-XML and fire-log paths: only collects while the panel is open, and clears the buffers on panel close so a future open starts fresh.
- **Launcher "Connecting…" overlay z-index ✅** — `.launcher-connecting` was z-600 but `.add-character-modal` (which wraps the compact Launcher when the user clicks the `+` tab) is z-1000. The connecting overlay rendered BEHIND the modal — invisible. Bumped to z-1500.

_Command echo across all panel-sourced commands_

- **All panel actions now echo `>cmd` in the game window ✅** — Map walk commands, room-panel exit clicks, quick-send entries, and in-text command links all flow through `sendCommand` in `GameWindow.tsx`, which now inserts a `>${cmd}` line into the main stream (via the existing `command-echo` preset) before sending. Same formatting as typed commands; previously these were silent.

_Map performance — animation pause + parse cache_

- **Animations pause during drag ✅** — When the user manually pans the map (`isDragging`), the pan-group `<g>` gets the `genie-pan-dragging` class. CSS rule `.genie-pan-dragging * { animation-play-state: paused !important }` cascades to every descendant, freezing all category animations until drag ends. Performance profiling showed Layerize + Recalculate Style combined ate ~55% of frame budget during drag on dense zones; pause cuts both to near-zero so the camera transform is what frame time actually goes to. Hover work is short-circuited at the React layer (`dragRef.current` check in `onNodeHoverEnter`) — couldn't use `pointer-events: none` on the parent because it would break click dispatch (mousedown sets isDragging before click fires; pointer-events change would shift the click target off the inner node `<g>`).
- **Animations pause during sustained player motion ✅** — Same pause mechanism extended to active walking. Any `currentLocation` change sets `inMotion = true` and starts a `MOTION_QUIET_MS = 800` timer; continued walking resets the timer; after 800ms of no walks the timer fires and animations resume. Profiling traces showed walking across a populated zone burned ~16% of frame budget on Recalculate Style + ~17% on Layerize for animations the user wasn't stationary long enough to appreciate anyway. The pan group's `className` checks `isDragging || inMotion` for the pause class. Tuning knob is the `MOTION_QUIET_MS` constant. **First-arrival skip**: a `prevLocationForMotionRef` sentinel filters out the null → non-null transition that fires when the player first connects (or reconnects after a drop) — without it, animations would pause for 800ms on connect even though no walking had occurred. Real walks always have a non-null previous value; only the first arrival has `prev === null`.
- **Genie parse cache ✅** — Initial parse of a 122-XML maps folder takes several seconds (DOMParser is synchronous and chunky; Crossing's ~1000-room file blocks for hundreds of ms by itself). Added `genie-cache:load` / `genie-cache:save` IPC handlers in `main.ts` that serialize the parsed `Map<zoneId, GenieZone>` to `userData/genie-cache.json` after a successful full parse. Subsequent launches verify a fingerprint (sorted `filename:mtimeMs:size` segments) against current folder state; if it matches, the renderer gets the cached zones via `JSON.parse` in ~50ms instead of re-running DOMParser. Cache invalidates automatically when any XML in the folder changes, is added, removed, or has its size altered. Version field (`GENIE_CACHE_VERSION = 1`) bumps when the GenieZone shape changes; old caches invalidate without manual cleanup. Cache write is fire-and-forget after parse — failure logs to console but doesn't block the user.

- Build + tsc clean. ✅

**v0.6.6 — Maps rewrite again: Genie Maps view replaces Lich Graph ✅**

Second architectural pivot of the map system in two releases. v0.6.3 swapped the spatial source of truth from Genie XML to Lich JSON (LichGraphView), aiming for "every Lich room renders even without Genie coverage." After shipping and using it in anger, two things broke down. (a) The BFS auto-layout produced visual hairballs in dense districts (Crossing, Shard); the "trust Lich's `wayto` cardinals" assumption disagrees with Genie's hand-curated coordinates in clustered zones, producing "type west, marker goes north" misrenders. (b) Without Genie data the view was visually thin; with Genie data the augmentation matching layer was a constant source of edge cases. The new approach: trust Genie XML as the spatial source of truth (the maps team has hand-laid these for 20 years), render Genie/Frostbite-style with one zone visible at a time, no zone-stitching, no auto-layout. The XML positions ARE the layout.

- **`GenieMapView.tsx` replaces `LichGraphView.tsx` ✅** — new ~1100 line component. `LichGraphView.tsx` (1351 lines) and `lichLayout.ts` (215 lines) deleted. `viewMode` now `'image' | 'genie'`; legacy `'graph'` and `'lich-graph'` saves migrate to `'genie'` on read. "Lich Graph" toolbar button renamed to "Genie Maps." `MapPanel`'s old augment plumbing (genie nodes indexed by `zonedKey`, matchConfidence, augments-as-Map, descIndex, near-miss tooling) deleted — `MapPanel` now stores parsed zones as a single `Map<string, GenieZone>` and passes them through.
- **Rendering matches Genie's `MapForm.cs` exactly ✅** — verified line-by-line against Genie's reference source. 8×8 node rects are CENTERED on the XML position because Genie's `ConvertPoint(pos, 4 * scale)` SUBTRACTS the offset (MapForm.cs:187–193), so the draw origin is `(pos − 4, pos − 4)` not `(pos, pos)`. Arc endpoints go through the XML position directly (rect center), not through `pos + radius`. Labels rendered at `(pos.x + 1, pos.y + 1)` matching Genie's `DrawString(r.X + 1, r.Y + 1)` 1px padding (MapForm.cs:1901–1924). Earlier attempts top-left-anchored everything; shifting nodes 4px down-right visibly misaligned label clusters (Binu test: "the B of Bundles is too far behind the room"). Fixed by reading Genie source instead of guessing.
- **Per-arc category coloring ✅** — `classifyArc(exit)` returns `'cardinal' | 'climb' | 'go'`; cardinals → `--map-arc-cardinal`, climb → `--map-arc-vertical`, go/up/down/out → `--map-arc-special`. Matches Genie's `linecardinal`/`lineclimb`/`linego` pen distinction.
- **Two-pass arc rendering for dense-cluster legibility ✅** — arcs render at full opacity (0.7) UNDER node rects (current behavior; lines disappear into rect fills inside clusters) AND again at faint opacity (0.35) ON TOP of rect fills. Inside a dense cluster, a line entering it stays visible as a dim trace across rect surfaces all the way to its endpoint room. Outside clusters the over-pass is barely perceptible. Same path data, two `<path>` elements per category — total 6 SVG elements (vs N×2 with separate `<line>` per arc). Sekmeht's "which room does this entry actually connect to?" question on the Vaults cluster was the prompt.
- **Arc element collapse ✅** — each arc category renders as ONE combined `<path>` element with concatenated `M x,y L x,y M x,y L x,y …` segments. A 1500-room zone has ~3000 arcs → 6 elements total (under + over × 3 categories) instead of 3000 separate `<line>` elements. Chromium DevTools Layerize cost dropped from ~480ms (53% of frame) to negligible on the largest zones.
- **Cross-zone stub handling ✅** — Genie convention is that the boundary room is duplicated in both zones; the "stub" version has `note="MapXX_Name.xml"` pointing to the other zone's XML file. `isStubNode(n)` detects `.xml` in note aliases; stubs render with a dashed amber border + an `↗` glyph centered on the rect. Title lookup prefers non-stub matches so "Shard, East Bridge" (real room in Shard) wins over the Fang Cove stub of the same name. Stub-aware `titleLookup` indexes both `node.name` and non-xml `note` aliases.
- **Stub click walks to the boundary; map never races ahead ✅** — early implementation switched the displayed map immediately on stub click; felt like the UI yanked the player to a place they hadn't actually been (and might be blocked from reaching). Now stub click runs BFS from the player's current room to the stub and walks there. The auto-zone-switch effect (driven by title/desc match against the loaded zones) is the authoritative signal for "actually arrived in the new zone." If the game blocks any walk command, the map stays put. Stub click also no-ops when browsing (player not in this zone) — the dropdown is the explicit way to switch zones.
- **Camera follow-the-player ✅** — `followPlayer` boolean state, default ON; every walk centers the viewport on the new current room via `useLayoutEffect` (not `useEffect`) so transform and indicator update in the same paint frame. `useEffect` produced a 1-frame "indicator-at-new-position-with-old-camera" flash at high walk rates. Manual pan or zoom disables follow automatically; clicking `◆` re-enables and re-centers. Earlier margin-snap version (pan only when indicator crosses safe-zone edge) caused visible quivering at high walk rates because the camera snapped to the margin on each step; always-centering removes the vibration since each camera delta exactly matches the player's world delta.
- **Indicator hoisting for cheap rapid-walk updates ✅** — current-room halo, selection outline, hover outline, and hover-path preview are all hoisted OUT of `nodeRects` as single overlay elements layered on top. Pre-hoist, walking re-built the entire `nodeRects` JSX array every step because `currentNodeId` was in its dep array. Now walking only re-renders the 2-3 indicator elements; the node array is per-zone-static and per-level-stable. Killed the "stutter and tearing during rapid movement" symptom.
- **Current-room halo redesign ✅** — two concentric circles drawn as the LAST child of the SVG transform group (paints on top of everything): translucent dark backdrop ring (5px stroke at 0.55 opacity) + bright `--map-current-color` ring (3px stroke). Backdrop gives contrast against bright/colored adjacent rooms so the halo reads even when surrounded by red shops or lime economic markers. Previous thin 2px halo dissolved into similarly-colored neighbors and "looked behind" them.
- **Hover indicator ✅** — soft white 1.5px rect outline on hovered room, distinct from gold (selected) and green (current) so the three highlights coexist without ambiguity. Skipped on the player's own room or the selected room (already covered by their respective highlights).
- **Hover path preview ✅** — when hovering a walkable room, runs BFS from player → hovered and draws the resulting route as a brighter `--map-current-color` path (single `<path>` element with rounded line joins). Instantly answers "how would I get there if I clicked" without needing to click. Skipped when hovering the player's current room.
- **Tooltip with map ID + landmark info ✅** — block-built tooltip: bold room name, `Map {zoneId}: {zoneName} · Room #{nodeId}` line, color-category callout when room has a recognized COLOR_LEGEND tag (swatch + name + desc, e.g. "■ Red — Shop"), cross-zone callout for stubs (`↗ Cross-zone exit → {targetZoneName}`), pipe-delimited aliases, exits list, action hint ("Click to walk here" or "Click to go to {zone}" for stubs). Action hint only shown when click is meaningful (player in this zone, hovering a different room).
- **Title disambiguation via description ✅** — Shard has 7 rooms titled "Shard, Moonstone Street" (#78–#85). Title-only match made the "here" marker stick on whichever was indexed first while the player actually walked east through #79–#85. `currentLocation` disambiguates by description (normalized equality match against `node.descriptions[]`) when title alone has multiple non-stub candidates. Same pattern as `findRoom` in `mapTypes.ts`. `roomDesc` plumbed through `MapPanel` → `GenieMapView`.
- **Normalized title fallback ✅** — Lich titles and Genie node names commonly diverge on bracket-stripping (Lich `"[Bank]"` vs Genie `"Bank"`), trailing whitespace, or case. Built a parallel `byNormalized` index keyed by `normalizeMatchKey()`; exact-case lookup tries first, normalized falls back. Same dual-index pattern `MapPanel`'s `findRoom` uses for the same reason.
- **`<parsererror>` detection in `parseGenieZone` ✅** — DOMParser doesn't throw on malformed XML; it returns a document with a `<parsererror>` element. Pre-fix, broken files silently became zones with 0 nodes and 0 labels — polluting the loaded set with phantom zones. Now `parseGenieZone` checks for `<parsererror>` and throws so `MapPanel`'s existing try/catch skips the bad file.
- **First-render auto-zone-switch fix ✅** — `lastLocationRef` was initialized via `useRef(currentLocation)`, so on the very first render the ref already equalled `currentLocation` and the auto-switch effect bailed on equality. Symptom: opening the map after the game was already connected (room title already present) left the displayed zone empty until the user clicked `◆` or picked from the dropdown. Cold-start (game connects after map opens) worked because `currentLocation` was null on mount. Fix: initialize ref to `null` so the first non-null `currentLocation` always triggers.
- **Level-change UI cleanup ✅** — split the zone-change cleanup effect; level change now also clears `hoveredId`, `selectedId`, `tooltipPos` so a same-id room on a different floor doesn't silently inherit the previous floor's highlight. Walk timers intentionally NOT cleared on level change — click-to-walk paths legitimately cross floors via up/down arcs.
- **Genie view gated on `dbStatus` ✅** — `MapPanel` was rendering `GenieMapView` whenever `viewMode === 'genie'` regardless of Lich DB load state, which stacked the GenieMapView empty/loading state under the "Loading Lich map…" overlay during boot. Now also requires `dbStatus === 'ready'` or `'error'`.
- **Command echo across all panel-sourced commands ✅** — `sendCommand` in `GameWindow.tsx` now echoes `>cmd` (using `command-echo` preset) before sending. Map walks, room-exit clicks, quick-send entries, in-text command links all echo consistently with typed commands. Walks now visually trace through the text window step-by-step.
- **`--game-font-size` CSS variable for map labels ✅** — `fontSize` SVG attribute was hardcoded to 11; switched to `style={{ fontSize: 'var(--game-font-size, 12px)' }}` so map labels follow the user's font-size setting alongside the rest of the UI. Font family was already inherited through CSS.
- **Themed dropdown + level chips ✅** — `.map-select` and `.map-chip` had no CSS rules (using browser defaults). Added themed styles matching the `.map-btn` family: `--map-select-bg`, `--map-btn-border`, hover with `--accent-dim`. `option` items explicitly themed because Chromium's native select popup ignores parent colors and falls back to OS defaults (broken on dark themes).
- **Performance: hover-during-drag short-circuit at the React layer ✅** — initial attempt used `pointer-events: none` on the pan group while `isDragging`. Worked for hover but silently broke click-to-walk: `isDragging` flips true on mousedown BEFORE click fires, so the click target shifted off the node `<g>` to the SVG root. Replaced with a `dragRef.current` guard inside `onNodeHoverEnter` — skips the hover state update at the React layer when a drag is in progress. Slight cost (browser still hit-tests) but click dispatch survives.
- **`will-change: transform` on the pan group ✅** — promotes the subtree to its own composited layer so pan/zoom translates on the GPU instead of re-painting siblings.
- Build + tsc clean. ✅

**v0.6.5 — Lich Graph polish: legend overlay, layer toggles, visual scaling, search by ID ✅**

Follow-up to the v0.6.3 maps rewrite. The Lich Graph view picked up real visual density (tier sizes, zone tints, landmark glyphs, trail glows, dashed Genie edges) and started to need both documentation and per-user customization. v0.6.5 adds a togglable legend that doubles as a control surface, fixes the zoomed-out-glow-dominance problem, lets the current-room indicator stop hiding the room's actual identity, and adds search-by-ID.

- **Legend overlay (`▤` toggle in subbar) ✅** — floating panel anchored top-left of the canvas with five sections: room-size tiers, state colors, edges, glyphs/backdrops, and Genie landmark types. Sample swatches use the same CSS vars + literal colors the canvas uses so theme switches keep them honest. Tier samples use the actual node shape (round-with-halo, then progressively smaller rects, ending in a dot) — sizing language is self-evident. Landmark section only renders when Genie data is loaded; dashed-edge row only shows when Genie augments exist. Per-character persisted via `lichGraphLegend` scoped key.
- **Layer toggles ✅** — six togglable layers (zoneTints / trail / landmarks / verticalGlyphs / adjacentLabels / dashedEdges) with full-row checkbox UX inside the legend. Each row click flips that layer on/off; persisted as a JSON blob under `lichGraphLayers`. New layers added later get DEFAULT_LAYERS spread-merge on read so older saves don't lose them. `Layers` type + `DEFAULT_LAYERS` constant live at module scope (not in the component body) for stable identity.
- **Reset-to-defaults button ✅** — small `reset` button in the legend header. Disabled (dimmed) when all toggles are at defaults; one-click returns to all-on. Avoids the "I turned 4 things off, how do I get back?" UX trap.
- **Visual scaling fix: world-constant glow radii ✅** — `zoneTints` (was `38 / s`) → `25`, `trailGlows` (was `16 / s`) → `12`. Old code kept disks at constant *screen* size, which meant zoom-out had them swallowing the whole viewport while nodes shrank to dots. New code makes them scale with the map so they recede gracefully when zoomed out. Caught by Sekmeht on visual review of the zoomed-out state.
- **Current-room indicator redesign ✅** — pre-v0.6.5 the current-room circle replaced the room's Genie color + landmark glyph entirely, so standing in a shop showed a green circle with no "this is a shop" signal. Now the current room uses the same rounded-rect rendering as a tier-1 node — keeps the Genie fill color + landmark glyph + vertical exits — with the pulsing green halo OUTSIDE the rect and an optional center accent dot inside. When a landmark glyph is present, the accent dot is skipped so they don't stack. Player can simultaneously read "I'm in this kind of room" + "this is me" + "this room has an up exit."
- **Search-by-ID ✅** — numeric query (all digits) does an exact `lichDb.get(parseInt(q))` lookup; if hit, prepended to the results list. Title substring still runs after for mixed queries. Lets the user paste a Lich room ID from chat / scripts and jump straight to it.
- **Outside-scope search feedback ✅** — picking a search result that's outside the rendered hop neighborhood used to silently do nothing (looked broken). Now sets a 4-second toast above the bottom bar: `"<name>" is outside the current N-hop scope — selected; raise hops or walk closer to see it on the map.` Selection is still set so the detail panel below populates.
- **Auto-refit on Genie augments arrival ✅** — `hadSeedsRef` sentinel fires `fitToView` exactly once when `seedPositions` transitions from empty → populated. Catches the case where the user opened the Lich Graph view before Genie XML finished loading; without this the BFS layout fit-to-view captured the wrong frame and rooms would fly off-screen when the seeded layout arrived.
- **Lich Graph `hops` persisted per-character ✅** — the 5/8/15/25 selector was session-ephemeral; now persists via `lichGraphHops` scoped key with validation against `HOP_CHOICES` on read.
- **Performance: `tooltipPos` setState gated on `hoveredId !== null` ✅** — previously `onMouseMove` updated `tooltipPos` on every mousemove regardless of hover state, triggering a re-render per move even when no tooltip would render. Now skipped when not hovering anything. Compounds with the rest of the view's hot paths.
- **Performance: world-constant glow memos drop `transform.scale` from deps ✅** — side benefit of the radius fix; `zoneTints` and `trailGlows` memos no longer recompute on pan/zoom (only on actual data changes).
- **UX: unified legend toggle pattern ✅** — initial implementation had two different toggle visuals (inline title-bar checkbox vs. full-row clickable label). All toggle rows now use the full-row pattern.
- Build + tsc clean across both projects. Bundle 803 kB (up ~4 kB from v0.6.4's 799 kB legend-only baseline). ✅

**v0.6.4 — Hotfix: profile location moved out of the install directory ✅**
- **Profile data was being silently wiped by every Lichborne upgrade.** Profiles lived in `<install-dir>/profiles/`, but NSIS upgrades run the previous version's uninstaller before extracting the new build, which `RMDir /r $INSTDIR`s the install folder — taking `profiles/` with it. The original "travels with the install" rationale was wrong: installs don't travel safely across upgrades. Confirmed by Sekmeht who installed 0.6.3 fresh and found their profiles destroyed.
- **Fix:** `getProfilesDir()` in [profiles.ts](src/main/profiles.ts) now returns `app.getPath('userData') + '/profiles'` in production (= `%APPDATA%\lichborne\profiles\` on Windows — lowercase because Electron's `app.getName()` reads the top-level `name` field, not `build.productName`). userData lives outside the install footprint and survives uninstalls (since `nsis.deleteAppDataOnUninstall: false` is the default and is explicitly set).
- **Open Profiles Folder menu fix:** the File menu entry now calls `ensureProfilesDir()` (which `mkdirSync(dir, { recursive: true })`s the path) instead of just `getProfilesDir()`. Previously, clicking it on a fresh install before any profile had been written produced a "Windows cannot find …" dialog because the directory didn't exist yet.
- **Two-stage migration:**
  - **NSIS `preInit` hook** ([build/installer.nsh](build/installer.nsh)) runs in `.onInit` BEFORE the previous version's uninstaller is invoked — this is the critical timing. (Earlier attempt used `customInit` which fires AFTER the uninstaller has already wiped the install dir; the rescue silently no-op'd. Confirmed by tester Sekmeht on the first v0.6.4 build.) `$INSTDIR` isn't yet set at `preInit` time, so the hook reads the previous install location from `HKCU\Software\${UNINSTALL_APP_KEY}` (then `HKLM` as fallback). If the legacy directory has YAMLs AND `$APPDATA\lichborne\profiles\` is empty, copies `*.yaml` and (separately, gated by `FileExists`) `*.bak` into the new location. `CreateDirectory` is recursive — also creates `$APPDATA\lichborne\` if missing. Destination case (`lichborne` lowercase) must match `app.getPath('userData')` exactly.
  - **Runtime `migrateLegacyProfilesDir()`** ([profiles.ts](src/main/profiles.ts)) runs on first `getProfilesDir()` call (guarded by `_migrationChecked` flag). Same source/destination, idempotent (only fires when target has no YAMLs). Safety net for users on non-installer paths (portable copies, manual placement).
  - Both stages copy `.yaml` AND `.bak` files together; `.yaml` presence is the gating condition. Legacy dir is left in place — user verifies before removing.
- **Cannot recover already-wiped data.** Users who upgraded 0.6.2 → 0.6.3 via the installer had their legacy `profiles/` removed by NSIS BEFORE v0.6.4 existed — the data is gone from Lichborne's perspective. They have to re-add characters. This v0.6.4 hotfix prevents the same class of loss from ever happening again.
- DESIGN.md §20.2 rewritten with the new location + the why; CLAUDE.md gets a "Do NOT put profiles in install dir" note.

**v0.6.3 — Maps rewrite + login redesign + schema versioning ✅: three streams of work shipped under one release. Maps: architectural pivot of the graph view from "Genie XML is the spatial source of truth, Lich is the navigation overlay" to "Lich is the spatial AND navigation source of truth, Genie is optional metadata polish." Every Lich room now renders regardless of match status; no more orphans-because-of-fuzzy-matching. Login: complete reshape of the connect experience. Profiles: per-file schema versioning + migration registry so future schema changes don't require wiping `profiles/`.**

_Maps rewrite_
- **New `LichGraphView.tsx` + `lichLayout.ts` ✅** — `autoLayoutLich(rooms, {rootId, cellSize, seedPositions})` is a pure-function BFS placer that walks each room's `wayto` commands, maps them to cardinal grid offsets, and lays out the player's local neighborhood (default 8 hops, selector 5/8/15/25). `seedPositions` lets Genie coordinates anchor matched rooms so zones with Genie coverage look hand-curated while the rest is BFS'd around them. Non-cardinal moves (`go door`, etc.) land in a `COLLISION_WIGGLE` slot adjacent to the source. Verb-prefixed cardinals (`climb up`, `go n`) are recognised.
- **MapGraphView deleted ✅** — the legacy zone-by-zone Genie graph view was replaced wholesale. `viewMode` is now `'image' | 'lich-graph'`; legacy `'graph'` saves migrate to `'lich-graph'` on read. "Image" button renamed to "Lich Map". Bundle dropped ~28 kB.
- **Multi-pass matcher hardening (still feeds Genie augmentation) ✅** — Pass 1 adds a 4th step: description-only fallback (`descIndex[normalizeDesc(d)]`) commits when exactly one Lich room has that description, OR multiple share an identical title (multi-tile case). Pass 2 (arc-corroboration) wrapped in `while (pass2Changed)` loop to convergence so cascading sibling-cluster matches resolve correctly. `disambiguate()` returns deferred for multi-match-with-differing-titles instead of committing arbitrary first-array-element. `MatchConfidence` chip in tooltip surfaces strategy used: `exact / normalized / alias / zone-prefix / desc-disambig / arc-corroborated / desc-only`.
- **Composite zone-prefixed keys ✅** — Genie node IDs restart from 1 in every zone; bare numeric keys caused Aesry's #712 to clobber Shard's #712 (and vice versa) across `allGenieNodes` and `genieIdToLich`. Replaced with `zonedKey(zoneId, nodeId)` composite strings throughout matcher and Pass 2 arc-destination resolution.
- **LichGraphView visual layers ✅:**
  - **Tier rendering** — 5-step concentric BFS-hop tiers (current room circle+halo → tier 1 rounded rect with label above LABEL_ZOOM 1.5 → fading rects → far context dots). Selection/hover/path-walk promote a far room to tier 2 so interactions stay legible.
  - **Two-pass edges** — Pass 1 solid lines from Lich `wayto`, Pass 2 dashed lines from Genie arcs (gap-fill only). Pair dedup via `[min,max].join('-')`. Hover handlers set `hoveredEdge` state; midpoint label shows move command with `(Genie only)` suffix on Genie-fallback edges.
  - **Adjacent-room labels** (Phase A) — tier-1 rooms get crisp readable names above zoom threshold.
  - **Vertical-exit glyphs** (Phase B) — `↑` / `↓` on the node corner for rooms with `up`/`down`/`climb up`/`climb down` wayto entries; in 2D space these would otherwise render as confusing edges to wherever Genie placed the destination.
  - **District tints** (Phase D) — deterministic HSL hue per zone (hash of zone name) rendered as overlapping 38px-radius 10%-opacity disks behind nodes. Same zone = same color forever across reloads.
  - **Search** (Phase C) — substring match over the FULL Lich DB (not just the rendered scope), ≥2 chars, results capped at 40. Selecting a result recenters on it if within scope, otherwise just selects it.
  - **Edge-hover labels** (Phase E) — `pointerEvents="stroke"` on every connection line; mouse enter sets hoveredEdge, midpoint label renders with paint-stroke for legibility.
  - **Landmark icons** (Phase F) — `LANDMARK_GLYPHS` maps 14 recognised Genie color tags to glyphs ($ shop, + healer, ★ stat training, ⇆ transport, ⌂ housing, ⚓ depart, ✶ favor altar, ⛏ mining, T lumberjacking, ✟ shrine, ⛺ ranger trailhead, ⚠ obstacle, ⚔ guildleader, ! interesting). Renders centred on tier-≤2 nodes with white halo.
  - **Last-walked trail** (Phase G) — `trail` state tracks last 8 rooms visited (deduped against head, freshest first). Concentric `--map-current-color` disks fade linearly by age, rendered between zone tints and edges so they don't obscure connections.
- **Zoom lifecycle fix ✅** — `hasFittedRef` sentinel splits three cases: initial-load fit-to-view, hops-changed refit, player-walked recenter-only (preserves scale). The old `useEffect([layout])` was firing a refit on every walk, wiping the user's chosen zoom.
- **Genie folder controls moved to Lich Graph subbar ✅** — picker (📁/📂), clear (✕), `Genie N/M` progress hint, and `NNN matched` count moved off the outer MapPanel toolbar (where they showed on the Lich Map view too despite doing nothing there) into the Lich Graph view's own subbar between the room-count text and the hops selector. The `genieMapsDir` path still round-trips through `_shared.yaml` via `scheduleSharedProfileSave` in the handlers, unchanged.
- **NEEDS MAPPING banner ✅** — high-visibility amber banner when the game emits a room ID/title not in the Lich DB. Actionable for the community mapping effort.
- **Profile schema migration registry ✅** — both profile files (`_shared.yaml` v1, `{Character}.yaml` v2) now declare their own `profileVersion`. New `profile-migrations.ts` module holds two empty registries (`sharedMigrations`/`characterMigrations`) keyed by SOURCE version; `runMigrations()` walks them in sequence on read. Future schema bumps register a step keyed by the previous version — old YAMLs auto-upgrade on first read instead of requiring testers to wipe `profiles/`. Future-version files (where the YAML is newer than the code) log a warning and skip the import rather than overwriting an unfamiliar shape, so downgrades and hand-edits can rescue them. DESIGN.md §20 documents the "what is / isn't a breaking change" boundary.
- Build + tsc clean across both projects. Bundle 791 kB (down from 819 kB). ✅

_Login redesign + scroll-key/pin bug pass — complete reshape of the connect experience and two scroll-pin fixes._
- **Login Redesign — Phase 1: Settings dialog with Lich Setup section ✅** — Extracted `AdvancedSettings`/`loadAdvanced`/`saveAdvanced`/`GAMES`/`gameCodeFromPort`/`gameOptionFromPort` from `LoginScreen.tsx` into a shared `src/renderer/lichSettings.ts` module so multiple UIs back the same persisted state. New reusable `LichSetupFields.tsx` component renders the auto-detect button, Ruby/Lich path inputs with browse, Delay + XML Stream Mode row, status banner, and Hide-Lich-Window toggle. LoginScreen Advanced panel replaced with `<LichSetupFields>` (~180 lines collapsed). Added the same fields as a new "Lich Setup" section at the bottom of `SettingsPanel` so paths/port/mode can be edited mid-session.
- **Login Redesign — Phase 2: Launcher (character cards) ✅** — New `Launcher.tsx` lists saved characters (read from `listCharacterProfiles` + per-character `readCharacterProfile`) as cards with name, account · game, mode badge (LICH/DIRECT), and a `[Connect →]` button. First-launch empty state shows a welcome card with `+ Add character` CTA. AppShell renders the Launcher instead of the full-screen LoginScreen when sessions are empty; the existing `+` tab-bar modal renders the Launcher in compact mode (with `+ Add character` routing to the wizard). Card click goes through a 1.5-second cancellable "Connecting to <name>…" overlay before any login IPC fires — fat-finger-tap protection without an extra confirmation click. Right-click any card → context menu with `Delete…` → confirm dialog explains what's removed (profile state) and what's kept (account-keyed password). New `profile:delete-character` IPC + `deleteCharacterProfile()` in `src/main/profiles.ts` removes the YAML and every matching backup file. Inline error banner inside the launcher replaces the previous fullscreen overlay (which was sitting above the launcher modal at z-600 vs z-1000 and producing a "stuck transparently over game window" effect on connect failure).
- **Login Redesign — Phase 3: Add Character wizard with EAccess preview ✅** — New `AddCharacterWizard.tsx` (3-step modal): account + password + remember toggle + Lich/Direct radio → game pick (DR/DRX/DRT/DRF) → character picker. New IPC `eaccess:fetch-characters(account, password, gameCode)` runs a throwaway TLS handshake to `eaccess.play.net` (K/A/G/C), returns `{ok, characters}`, and disconnects. Direct mode → users pick from the real server-returned list; Lich mode → manual text entry (one-time per character; Lich doesn't expose its list). `SGEConnection.authenticate()` parameterized with `gameCode` (default 'DR' for back-compat) so DRX/DRT/DRF character lists can actually be fetched — previously the SGE handshake hardcoded `G\tDR`.
- **Login Redesign — Phase 4: polish ✅** — First-launch boot effect in AppShell imports `_shared.yaml` then silently runs `discoverLichPaths` against `C:\Ruby4Lich5\`; any newly-discovered Ruby or Lich paths are written back to localStorage + `_shared.yaml`. Fresh installs with stock Lich now have the wizard's Lich radio enabled by default — no manual setup tab visit required. LoginScreen is no longer rendered anywhere; `SessionInfo` is imported from it as a type only (file kept as type-host pending a future rename/move). LoginScreen modal usage in App.tsx fully replaced by Launcher + Wizard combo. `showLoginForm` state renamed to `showWizard`.
- **Pre-connect Lich Setup access ✅** — New `LichSetupDialog.tsx` wraps `LichSetupFields` (same persistence path as SettingsPanel and the old LoginScreen Advanced panel). `[⚙ Lich Setup]` button in the Launcher's top bar (both empty state and grid state). `[⚙ Lich Setup…]` link in the wizard footer so users can fix path/port issues mid-wizard without losing input. The Add Character wizard's `lichPort` no longer overrides the user-configured port from `adv.lichPort` (`effectivePort = useLich ? selectedGame.port : adv.lichPort` was wrong — `lichPort` is the Lich front-end port, not the SGE per-shard port). `runConnect()` derives `game` from the character profile (`c.game`) instead of from `gameCodeFromPort(adv.lichPort)`.
- **CSS scope fix ✅** — `login.css` input/select/label rules are scoped to `.login-form`. LichSetupDialog and SettingsPanel had wrapped their LichSetupFields in `.advanced-panel` alone, so dialog inputs fell back to browser defaults (white backgrounds, no theme border). Added `login-form` to the wrapper class in both places; inputs now pick up the dark-input/uppercase-label styling consistently.
- **XML Stream Mode rename ✅** — "Mode" label in LichSetupFields renamed to "XML Stream Mode" to clarify what the dropdown actually controls (`--stormfront`, `--genie`, `--wizard`, `--avalon`, `--frostbite`).
- **Games List inventory ✅** — Replaced an experimental editable Game dropdown in Lich Setup with a read-only "Games List" reference card showing each game code, full name, and conventional Lich port (DR=11024, DRX=11124, DRT=11624, DRF=11324). Per-character game choice happens in the wizard; the inventory exists purely so users can validate their settings. Single-column layout so the longest names fit without truncation.
- **Timestamped YAML backups ✅** — Backup filename scheme changed from a single rolling `{name}.yaml.bak` (which overwrote itself every shutdown) to timestamped `{name}.yaml.{YYYY-MM-DDTHH-MM-SS}.bak` with rolling retention of 5 newest per file. Pruning sorts by mtime so it works for the legacy `.bak` files too. `deleteCharacterProfile` glob-removes every backup matching the character. Players now have a history to recover from instead of last-write-wins.
- **`Open Installation Directory` menu item ✅** — Added to File menu next to `Open Data Folder`. Packaged build opens `dirname(exe)`; dev build opens `app.getAppPath()`. Clarifies the distinction: Data Folder = `userData` (passwords.json, Electron caches); Installation Directory = the profiles/logs/exe location.
- **Bold text → yellow across all dark themes ✅** — `darkBase --preset-bold` changed from `#ffffff` to `#ffff00`. All guild themes inherit this; classic theme also overridden explicitly. Light themes (Ivory, Mist, Parchment) and Terminal unchanged. Matches the traditional Genie bold-yellow convention.
- **B75 fix — PageUp/PageDown/Home/End now fire from the command bar.** Document `onKeyDown` guard required focus to be *neither* the command input *nor* any text field. Since the command input is auto-focused on game-window mount, the guard always evaluated false — scroll keys never fired during normal play. Over-correction from B19. Fix: new `inOtherTextField` predicate suppresses scroll keys only when *another* text field has focus.
- **B76 fix — scrollbar arrow buttons and thumb-drag now pin/unpin correctly.** `onWheel` was the only unpin path; scrollbar interactions dispatch `scroll` events (not `wheel`), so they couldn't unpin. Added unpin branch to `handleVirtuosoScrollRef`: `dist > 40 && pinnedRef.current → false`, gated by `suppressUntilRef` so Virtuoso's own programmatic scrolls don't mis-trigger. 10/40px deadband prevents flip-flop near the threshold.
- Build + tsc clean across both projects. ✅

**v0.6.2 — Multi-character UX polish ✅: post-v0.6.1 bug-fix pass focused on tab UX and session-state edge cases**
- **B68 fix — window title centralized in AppShell.** Previously `document.title` was written inside `GameWindow`'s `player-info` and disconnect handlers; switching tabs didn't re-fire those events so the title stalled. Now AppShell owns the title via a useEffect keyed on the active session's character / game / connection-status. GameWindow and LoginScreen no longer touch `document.title`.
- **B69 fix — character names use server-canonical case in the tab bar.** LoginScreen captures whatever the user types ("sekmeht"); the server returns canonical ("Sekmeht") in the `<app char="...">` element. New `updateCharacterName(characterId, character)` on `SessionsContext` is called from GameWindow's `player-info` handler. characterId stays case-normalized so lookups still work.
- **B70 fix — tab status glyphs no longer cause width shift on toggle.** Glyph slots use `visibility: hidden` when inactive instead of conditional render; layout space stays reserved.
- **B71 fix — exp panel default sort direction flipped to descending** on fresh install (most DR players expect high-rank skills first). `expSortDesc` initializer returns `true` when no value stored.
- **B72 fix — `Ctrl+1..9` / `Ctrl+Tab` now fire when the command bar is focused.** App-level keyboard handler had an `if (inField) return` guard that bailed for any focused `<input>` / `<textarea>` — disabled the hotkey for the duration of normal play since the command bar auto-focuses on connect. Removed the guard.
- **B73 fix — tab status indicators redesigned.** Single icon slot per tab (was three), priority-resolved Dead > Stunned > Bleeding > Roundtime. Icon swaps: ⚠ → ⏳ (roundtime, colored hourglass); add 💫 (stunned, new — was tracked in `indicators.stunned` but never surfaced). Reconnect glyph (↺) dropped entirely — disconnect is conveyed by dim + italic tab styling alone; reconnect uses the existing toolbar Login button on the active tab. Health % always visible (no more skull-replaces-health) — dead now puts 💀 in the icon slot and leaves health % showing (naturally red at low values). Fixed-width CSS for icon slot (`1.5em` centered) + health % (`4ch` right-aligned with `tabular-nums`) — tab width locked at character add-time and never shifts during play regardless of state. New `stunned: boolean` on `SessionStatus`. DESIGN.md §13.4 / §13.5 updated.
- **B74 fix — Login button on a disconnected tab is no longer a dead end.** Previously clicked Login closed the tab and dropped focus on whatever other tab was active, with no path to actually re-login. Now `setShowAdd(true)` runs alongside `removeSession` so the Add Character modal opens; if this was the last session, the full LoginScreen renders automatically (empty state).
- **Session Log design locked** for v0.6.x — see DESIGN.md §28 for full spec. Plain-text per-character daily logs with `[timestamp][stream] text` prefix; single in-client modal with Recent Tail + Quick Search + Open Logs Folder. Build pending.
- Build + strict tsc clean across both projects. ✅

**v0.6.1 — Session-state bug-fix pass + profile system v2.1 ✅: post-v0.6.0 audit and fixes for the systemic class of "setItem-without-scheduleProfileSave" bugs. New `useProfileSaver()` hook at every per-character storage write site (crash-resilient saves); 4 missing map options persisted per-character (`mapViewMode`, `showAllZ`, `zLevels`, `showLegend`); auto-copy `mouseup` listener gated by `isActiveRef` so only the active tab owns clipboard writes; settings/theme `applyToDOM` effect re-fires on tab switch so each character's saved theme is correctly applied when their tab becomes active (closes the "last applied wins" cross-tab visual leak); v1 migration code dropped from `profile.ts` (testers wipe `profiles/` to upgrade); 5 critical multi-character bugs found and fixed (B59 stale sessionId in event filters on reconnect; B60 LoginScreen modal stomps `document.title`; B61 Quick-Send to disconnected character silently drops; B62 phantom 5s gracefulDisconnect on closing already-disconnected tab; B63 same-account double-login → guard + "Invalid login key" translation). Lich integration audit confirmed clean — per-session script tracking, command injection, dashboard, variable inspector all correctly per-character. Build + tsc clean across both projects. ✅**

**Release E1 — "Sessions" v0.6.0 ✅: One Lichborne process now runs multiple characters simultaneously, eliminating the multi-instance localStorage collisions and `_shared.yaml` cross-process sync workarounds (B28, B56, B57 class of bug)**
- **Main process: SessionStore** (`Map<SessionId, Session>`) — each session owns its own `ConnectionManager`, `StormFrontParser`, `LichBridge`, event queue, cleanDisconnect/connected flags, debugPanelOpen flag. `crypto.randomUUID()` mints `SessionId` on each successful login; renderer threads it through every per-session IPC call. Listeners detach before `forceDisconnect()` to close the race where a final socket event could fire into a removed session
- **LichBridge per-session** — `LichBridge` refactored from singleton to instantiable class; IPC handler registration moved into `main.ts` and routed by sessionId; `lich:poll-scripts`/`pause/resume/kill/start` all take sessionId arg
- **Every per-session push channel carries sessionId** — `GameEventBatch`, `ConnectionStatusPayload`, `RawXmlPayload`, `ErrorPayload`, `LichScriptsUpdatePayload` defined in `shared/types.ts`; preload threads sessionId on `sendCommand`, `disconnect`, `destroySession`, `debugPanelToggle` and on every `lich*` invoke
- **Window close: parallel graceful drain** — `mainWindow.on('close')` marks every connected session for clean disconnect and runs `Promise.all(gracefulDisconnect)`; close time bounded by the existing 5s server-QUIT timeout regardless of session count
- **Renderer: SessionsProvider + multi-mounted GameWindow** — each tab has a stable `CharacterId` (`account::character` lowercased) that survives across reconnects. Inactive tabs render with `display: none` so vitals, scroll position, panel layout, and virtuoso buffers persist across tab switches; only the active tab writes `document.title` (gated by `isActive` prop)
- **CharacterTabBar (§13.3-13.5)** — name + game code + health % (color-coded by threshold, matches vitals-bar palette) + status glyphs (🩸 bleeding, ⚠ roundtime, 💀 dead replaces health); disconnected tabs dim to italic gray with last-known glyphs preserved and a ↺ marker. Single 500ms tick drives RT-glyph appearance for all tabs. Status updates skip when nothing actually changed so vital ticks that don't move the % don't re-render the bar
- **Add Character launcher (§13.6)** — `+` button on the tab bar opens `LoginScreen` as a centered modal backdrop; empty-state shows the full login screen as before; on first character, fills tab bar and switches to game UI
- **Quick-Send overlay (§13.8)** — `Ctrl+Shift+Enter` pops a floating input + character dropdown; defaults target to the *next* character after active (matches boxer "main → alt" common case); Esc cancels, Enter sends without switching tabs. `window.api.sendCommand(targetSessionId, cmd)` reaches the right character even from the active tab's command bar
- **Keyboard nav (§13.7)** — `Ctrl+1`…`Ctrl+9` jump-to-slot, `Ctrl+Tab` cycles forward; both suppressed inside text fields. Pre-existing in-game keyboard handlers (PageUp/Down/Home/End, macros, mode hotkeys) gated by `isActiveRef` so they only respond on the active tab — fixes the latent multi-mount listener leak
- **Pop-out windows (§13.9) deferred** — single-window-with-tabs is the v0.6.0 ship; multi-`BrowserWindow` work moved to backlog
**Profile system v2 — dynamic, atomic, backed up ✅ (v0.6.0)**
- **Per-character localStorage namespacing** — every per-character key now lives under `lichborne.{character}.{suffix}` via the new `characterScope.ts` helper; concurrent tabs no longer step on each other when editing settings. Shared keys (account, advancedSettings, mapDir, myThemes, theme boot-fallback) stay unnamespaced. Sweep updated every per-domain module (highlights, triggers, macros, aliases, groups, modes, contacts, settings) and every consumer (GameWindow, ExpPanel, MapGraphView, all four automation panels, ImportWizard) to thread the character through. Panels read it via new `CharacterContext` provided by App.tsx
- **GroupsProvider moved per-session** — `<GroupsProvider character={s.character}>` wraps each `GameWindow` inside App's session loop, so modes and groups are correctly per-character rather than globally shared
- **Per-character debounced saves** — `scheduleProfileSave` replaced its singleton timer + pending-context with `Map<character, {timer, account, game, useLich}>`; two concurrent characters never race their YAML writes
- **v2 dynamic YAML format** — `buildCharacterProfile` scans every `lichborne.{character}.*` key from localStorage and dumps into a flat `state:` map. `importCharacterProfile` walks `state` and writes each back via `scopedKey`. Adding a new per-character setting requires only writing to the scoped key — the YAML pipeline picks it up automatically with no `buildCharacterProfile`/`importCharacterProfile`/`clearCharacterLocalStorage` triple-sync. `profileVersion: 2` stamped on every file; v1 (typed `settings`/`layout`/`automations` shape) auto-migrated field-by-field on first read; next save writes v2. `clearCharacterLocalStorage` now scans-and-deletes by prefix — no more hardcoded suffix list
- **Atomic writes** — `writeCharacterProfile` / `writeSharedProfile` go through `atomicWriteFile`: write to `{path}.tmp`, remove existing target, rename in place. Corruption window collapses to a single rename syscall
- **Backup on graceful shutdown** — `mainWindow.on('close')` fires `window.__flushProfileSaves` in the renderer via `executeJavaScript` and awaits; renderer runs every pending debounced save immediately. Main then runs `backupAllProfiles()` which copies `_shared.yaml` + every `{Character}.yaml` to `.yaml.bak` in the same directory. Single rolling backup per file from the last clean shutdown
- **Decision: YAML over JSON for profile format** — kept YAML for hand-editability and consistency with Lich's profile ecosystem; revisit if no one is actually hand-editing

## Next Target: Release E2 — "Character Awareness" (v0.6.x)

**Theme:** The client knows your character. Uses data the XML parser already provides.

> Release E was split mid-flight when multi-character support became higher-leverage than the original character-awareness work. E1 (Sessions, v0.6.0) shipped first because every E2 panel (race-aware injuries, guild spell slots, session log) needs to know *which character* a panel belongs to — and that routing is what E1 built.

### Release E2 Checklist (remaining items; Exp Panel below already shipped in v0.5.1)

#### Exp Panel — Badging, Focus Filter & Learning Bars ✅ (v0.5.1)
- [x] `focusTemplates.ts` — full skillset data for all 12 DR guilds; `getSkillBadge()`, `getSkillSortPriority()`, `GUILD_SKILLSET_ORDER`
- [x] Badging/Focus control bar — guild picker sets `focus`; P/S/T/G badge overlays on each skill name
- [x] FocusMode filter — `none|primary|secondary|tertiary` filters the Learning section by skillset tier when a guild is selected
- [x] Sort picker — Alphabetical / Guild-Order / Rank / Learning Rate; sort direction toggle; stored in `localStorage`
- [x] Learning rate bars — 3px progress bar below each skill row; fill = `mindstateIdx/34`; color-coded by bucket: low (1–8, green), mid (9–20, amber), high (21–33, orange), locked (34, red)
- [x] `(X/34)` fraction as 7th column in each skill row — matches native game output `understanding (14/34)`
- [x] Bar colors as CSS variables — `--exp-bar-low/mid/high/locked` in `darkBase`; all themes inherit; per-theme override possible
- [x] `ExpProfile` interface — `focus`, `pinnedSkills`, `sortMode`, `sortDesc`, `focusMode`; stored under `layout.exp` in `CharacterName.yaml`
- [x] Profile persistence — badging and pin changes call `scheduleProfileSave`; sort/focusMode persist on disconnect
- [x] B55/B56/B57 — sort default Z-A bug fixed; missing `scheduleProfileSave` on focus/pin change fixed

#### Character-Aware Panels — postponed (2026-05-21)

All remaining E2 Character-Aware Panels items are postponed. With Exp Panel (v0.5.1) and Session Log (v0.7.0) shipped, E2 is effectively done for now — no firm next target until the next priority is picked.

**Race-aware injury display — shelved indefinitely (2026-05-21).** Considered for E2 but the existing **Injuries stream** already surfaces wound state cleanly and is the way testers actually read injuries during play. A race-specific body-part chart would duplicate information that's already presented well, without adding decision value. Revisit only if a future request specifically calls for a graphical/race-shaped body chart that the stream can't serve.

**Guild-filtered spell-circle display — postponed (2026-05-21).** Would narrow the spell-slot view to the circles the connected character's guild can actually cast. Postponed without a fixed return date — revisit when a tester flags the noise or a polish pass on spell display opens up.

**Guild-specific NPC tag styling — postponed (2026-05-21).** RoomPanel surfacing guild-relevant NPCs (trainers, guildleader, lockers) with guild-themed styling. Postponed alongside the spell-circle filter for the same reason — no specific tester pull at the moment.

#### Session Log — shipped v0.7.0 ✅
- [x] Structured session log — captures game text, stream content, command echoes, and Lichborne system messages as tagged records
- [x] Filter by stream (multi-select + presets), time range (Quick Search), with dedup
- [x] Export current filtered slice as plain text (`.txt`); JSON deferred per §28.10
- [x] Rolling persistence: per-character daily files with configurable retention pruner
- [x] Session boundaries inferred from `[sys] Connected`/`Disconnected` markers within each daily file

See the **Lich-Primary Roadmap** section below for broader roadmap context.
**B52 — boldDepth stuck after unescaped `<` in Lich script output ✅: `<pushBold/>60 < 65<popBold/>` — the tokenizer's `<[^>]*>` consumes ` 65<popBold/>` as one malformed tag, swallowing popBold and leaving boldDepth=1 for the rest of the session (all text bold/yellow). Fix 1: `boldDepth = 0` added to the prompt handler — prompts are frame boundaries, bold cannot survive one. Fix 2: `parser.reset()` called in the `CH.LOGIN` IPC handler so stuck state doesn't bleed into a new session after disconnect/reconnect ✅**
**B28 — Advanced/Lich settings reset to defaults in second windows ✅: separate Electron processes cannot share localStorage due to LevelDB file locking; `_shared.yaml` is the correct cross-process store but was only written on a successful connect, so a second instance opening before any connection fell back to all defaults. Fix: `LoginScreen` `adv` effect now debounce-exports the shared profile (1s) whenever any advanced setting changes — YAML is always current for any concurrently-opened instance ✅**
**B42 — Wrayth import wizard duplicate "Substitution rules" row ✅: `parseWraythXml` was setting both `substitutionCount: stringsCount` and `stringsCount` in its return — `substitutionCount` renders as "Substitution rules" and `stringsCount` renders as "Wrayth strings", producing two rows for the same `<strings>` block data. Fix: removed `substitutionCount` assignment from Wrayth parser (that field belongs to Genie/Frostbite substitution files); `countWraythBlock` logic verified correct with synthetic XML ✅**
**Password Save ✅: "Remember password" checkbox on login screen; per-account encrypted storage via Electron `safeStorage` (Windows DPAPI); stored as base64 in `passwords.json` in userData; auto-fills password field when account name matches a saved entry (async load with cancellation guard); password saved on successful connect when checkbox is checked, deleted when unchecked; IPC handlers `password:save/load/delete` in main process; `savePassword`/`loadPassword`/`deletePassword` in `passwords.ts` ✅**
**Theme Readability Pass ✅: boosted contrast across all 16+ themes — `darkBase` `--text-dim` #666→#7a7, `--text-faint` #444→#585, `--border-faint` #1a1a1a→#252525 (was identical to `--bg-base`, invisible!), scrollbar-thumb, `--compass-inactive-text`, `--compass-center-text`, `--hand-label-color`, `--room-section-color`, `--exp-rate-color`, and `--map-text-muted` (#5a4020→#87673c for ~3:1 on the near-black map bg); `darker` theme proportional fixes including `--border-faint` (was same as `--bg-base` #111); `classic` theme compass-inactive-text #3a→#76, compass-center-text #22→#58 (previously nearly invisible on #050505 bg); all 11 guild themes have `--map-text-muted` lifted ~30% brightness; added 6 missing CSS vars: `--bg-deep` (command input focus shadow), `--exp-sleep-1/2` (rested-exp sleep state colors), `--injury-wound1/2/3-color` (injury severity palette) ✅**
**CSS Wiring Pass ✅: eliminated all hardcoded colors from panels.css, game.css, and global.css — `panels.css`: undefined `--color-muted` → `--text-muted`, `--color-text` → `--text-secondary`, injury wound backgrounds/colors → `var(--injury-wound1/2/3-color)` via `color-mix`, `.exp-footer-sting` → `var(--color-danger)`, `.exp-footer-sleep--1/2` now resolve correctly against newly-defined vars; `game.css`: `btn-debug--active` → `var(--link-color)` + `color-mix`, `btn-map--active` background → `color-mix`, `btn-disconnect` hover color → `color-mix`, `btn-disconnect--login` border/bg/hover → `color-mix` with `var(--color-success)`, `scroll-anchor-badge` background → `color-mix(var(--bg-base))`, warn/danger states → `var(--preset-expiry)` / `var(--color-danger)`; `global.css`: update banner, update-btn, check bar → `color-mix` with `var(--color-success)`, `update-btn-check`/`update-up-to-date` → `var(--text-dim)`, list-item-delete hover → `var(--color-danger)` + `color-mix` ✅**
**B53 — Injuries panel shows "No active wounds." despite having wounds ✅: game sends `height="0" width="0"` on all `<image>` elements regardless of wound state; wound signal is `name="Injury1/2/3"` vs `name` matching the part id when healthy; `woundLevel()` bailed out early on `height===0 && width===0` before ever reading name; filter used `height > 0 || width > 0` — always false; fix: wound detection changed to `p.name !== id`, `woundLevel(id, name)` returns 0 when `name === id`, extracts severity from trailing digit otherwise ✅**
**IPC Pipeline Improvements ✅ (pre-Release C): Retroactive Lich-stream architecture audit identified three IPC bottlenecks. (1) Event batching: `scheduleFlush()` in `main.ts` uses `setImmediate` to coalesce all `GameEvent[]` from a single TCP read into one `webContents.send` — connection burst drops from ~40–60 IPC calls to 1. (2) `raw-xml` channel gated behind `debugPanelOpen` flag; renderer sends `debug-panel-toggle` IPC signal when Debug panel opens/closes — zero serialization overhead during normal play. (3) `UnknownEvent` filtered in main before IPC send — unrecognized Lich-injected tags no longer cross the IPC boundary. DESIGN.md §2.12 added. ✅**
**Release C — World stitching (Phase 2 — BFS zone offset algorithm, single continuous SVG world view) — postponed; moved to backlog 🔲**
**Hybrid Map System — Phase 1 ✅: Three-component architecture — `MapPanel.tsx` (coordinator), `MapImageView.tsx` (Lich image+overlay), `MapGraphView.tsx` (Genie SVG graph); `mapTypes.ts` shared types and utilities; Lich JSON loaded first (gated by dbStatus), Genie XML loads progressively after in batches of 5 with progress bar; room matching by title → description → alias (note field); augments keyed by Lich ID; orphan Genie nodes shown as dashed ? boxes; arc lines from Lich wayto edges; cross-zone exits marked with amber ◆ diamond; z-level filter chips; label mode selector (default: off); fit view + zoom +/− buttons; color legend with cross-zone count and orphan count; room detail panel with ✕ close button; BFS walk; zone auto-switch on room change ✅**
**Hybrid Map — Direct Connect mode ✅: Graph view available without Lich — auto-switches to Graph tab on Lich load failure; Image tab shows error, Graph tab shows Genie-only browsing (all nodes as orphans); toolbar shows "browse only" hint instead of match count ✅**
**Hybrid Map — Persistence ✅: Genie maps folder stored in `_shared.yaml` via `scheduleSharedProfileSave()` (profile system, not localStorage); auto-loads Genie on startup after Lich finishes; viewMode persisted to localStorage; label mode persisted to `lichborne.mapLabelMode.v2` key (v2 resets stale 'short' default to 'none') ✅**
**Hybrid Map — Bug fixes ✅: dragRef null-deref in onMouseMove (captured ox/oy before setState callback) in both MapImageView and MapGraphView; null wayto/description guards in detail panel and nodeBodies; computeFit NaN guard when SVG not yet laid out; Genie load cancellation race fixed with generation counter (clearGenieFolder increments gen, in-flight load checks gen at each await and abandons if superseded); mapLabelMode profile key corrected to v2 in profile.ts build/import/clear; map-detail-meta CSS class added; Lich map file selection: `find-lich-map-file` now scans all subdirs under `data/` dynamically (DR, GS, GS3, TF, DRX, DRT, DRF, any future codes) instead of a hardcoded list; selects highest numeric sequence from filename via `/^map-(\d+)\.json$/i`; mtime used as tiebreaker for equal sequences; sequence number preferred over mtime as primary sort (mtime is unreliable after copy/unzip) ✅**

---

## Version History

| Version | Date | Status | Notes |
|---|---|---|---|
| `0.14.0` | 2026-06-12 | In progress | **Lichborne Experiences platform + Living Tableau [Beta] (X1) + SceneParser.** The §34 scaffold shipped: `experiences.ts` registry (one entry + component per Experience; optional `badge` — Tableau wears **[Beta]**), `ExperienceLayer` hosting FloatingWindows in BOTH layout modes ([ExperienceLayer.tsx](src/renderer/components/ExperienceLayer.tsx)), app-bar **Experiences** button + shelf ([ExperienceShelf.tsx](src/renderer/components/ExperienceShelf.tsx)) + View-menu item + `panelExperiences` glow, `experiences` scopedKey persistence (close keeps the rect — reopen restores) + a Transfer category, `--experience-*` theme vars (NOT `--exp-*`, taken by the exp-points panel). **SceneParser (§35) built the same day as a capturer REGISTRY** ([sceneCapturers.ts](src/main/parser/sceneCapturers.ts) — gate+match+provenance+verified/unverified per entry; only verified run live) + a cast/diff transformer ([SceneParser.ts](src/main/parser/SceneParser.ts), Lich-drdefs-derived extraction in [sceneExtract.ts](src/shared/sceneExtract.ts)): typed scene events (cast incl. posture/hiding/dead/creature-counts, arrive/depart with movement-hint direction garnish + logoff reason, speech across say/ask/exclaim/accent/adverb/directed/yell/whisper/own-whisper/OOC-triple-emit/thoughts×3/ghostly-voice, emotes (parenthesized), logons) — **every shape verified against real captures** (Frostbite's mock.xml session + Sekmeht's live corpus in `corpus/`, gitignored) via a real-bundle harness (`tmp-scroll-repro` discipline; ~105 cases). **The Tableau**: stable hashed seating, procedural avatars w/ Contact colors, adaptive arrangements (12-seat arc → 26-seat amphitheater >12), promote-on-speak, **conversation gravity** (§35.7 — chattiness circle, directed-speech pairs converge, self included), the **bubble layer** (scene-px space, constant game-font size, speaker-named, collision-spaced, tail aimed at speaker), thought wisps (never a body), emote captions, directional entrances/ghost exits/logoff dissolves, hiding/unseen-speaker shadows, dead-body figures + resurrection (same cast entry flips). **§35.6 perf contract: ALL scene work is OFF until an Experience is open** (`sceneCapturersEnabled` + `SceneParser.setActive` gates via the `scene-active-toggle` IPC; cast tracked silently for instant `snapshotCast()` backfill — never inject a LOOK). B180–B183 fixed from live corpus same-day. **B184**: the exp panel's Badging dropdown auto-selects the character's GUILD — captured from the `info` line exactly as Lich's `DRStats.guild` (drparser `NameRaceGuild`, mirrored verbatim incl. greedy quantifiers) into a per-character `detectedGuild` scopedKey, seeded secondarily from the launcher profile's guild field. Two same-hour field corrections (Sekmeht's cleric): **an own-sheet detection is AUTHORITATIVE over a stored pick** (Transfer's viewPrefs carries `focus`, so "explicit wins forever" trapped a transferred Moon Mage badging), and the own-character gate matches the name as a whole WORD in the full titled sheet Name (a first-token compare rejects your own sheet — titles precede the name). Unmatched guild changes nothing. No profile-shape change (two new optional state suffixes: `experiences`, `detectedGuild`). |
| `0.10.0` | 2026-06-03 | In progress | **F38 — Platform-wide profile Transfer (JadedSoul).** New Launcher top-bar **"Transfer"** button → one modal with Export / Import tabs ([ProfileTransferModal.tsx](src/renderer/components/ProfileTransferModal.tsx), core in [profileTransfer.ts](src/renderer/profileTransfer.ts)), a SUPERSET of the Automations export (which stays as a focused subset). Export picks ANY source character (reads its YAML, works disconnected) and writes a `.lb.yaml` bundle to a new **`Exports/` folder** (sibling of `profiles/`; `getExportsDir`/`ensureExportsDir` in [profiles.ts](src/main/profiles.ts), `profile-transfer:*` IPC in [main.ts](src/main/main.ts)). Import lists files from `Exports/` (+ Browse… defaulting there), picks categories, and fans out to many already-added characters via checkboxes. Ten transfer categories driven by an explicit allowlist (`TRANSFER_CATEGORIES`): Display & Accessibility, Panel Layout, Panel View Preferences, Theme, Highlights, Triggers, Macros, Aliases, Groups & Modes, Contacts. **Non-destructive** — writes only the target's `state` map (+ `theme`), so identity/launcher fields (guild, name, account, favorite…) are structurally untouched. **Two apply paths**: inactive target → YAML read-merge-write; active target (focused OR backgrounded) → localStorage working copy + per-session remount (App reload nonce in the GameWindow `key`) so a live import commits and survives logout. **LB** recorded as the project branding abbreviation. See CLAUDE.md pitfall #56. **Consolidation**: the now-redundant Automations panel **Export** button and the ImportWizard **"Lichborne"** source card were removed (Transfer is the single Lichborne↔Lichborne path); the Automations Import button is relabeled **"Import from another client…"** and the wizard is legacy-client only (Wrayth/Genie/Frostbite). Theme-share (ThemePicker) and Session-Log export are untouched (different jobs). |
| `0.6.3` | 2026-05-16 | In progress | Complete login redesign across Phases 1–4: Settings dialog with Lich Setup section (reachable mid-session), Launcher (character cards replace full-screen LoginScreen) with right-click Delete, 3-step Add Character wizard with EAccess preview (real character-list picker for Direct mode), first-launch silent `discoverLichPaths` auto-detect. Pre-connect Lich Setup access via dialog from launcher and wizard footer. Wizard's `lichPort` override removed (was conflating Lich front-end port with per-shard SGE ports); `runConnect` now uses `c.game` from the character profile instead of deriving from port. CSS scope fix for LichSetupFields (added `login-form` wrapper to dialog/settings parents). "Mode" → "XML Stream Mode". Read-only "Games List" inventory in Lich Setup replaces an experimental editable Game dropdown. Timestamped YAML backups (`{name}.yaml.{ts}.bak`, retention 5) so shutdown can't overwrite the last good copy. File menu adds "Open Installation Directory". Bold text yellow across all dark themes. B75 — PageUp/PageDown/Home/End fire from command bar. B76 — scrollbar arrow buttons and thumb-drag now trigger pin/unpin. |
| `0.6.2` | 2026-05-15 | In progress | Multi-character UX polish pass on top of v0.6.1. Tab status indicators redesigned (B73): single icon slot with priority Dead > Stunned > Bleeding > Roundtime, fixed-width CSS so tab never shifts on state changes, dim+italic conveys disconnect, health % always visible. Window title centralized in AppShell (B68). Character names use server-canonical case in tab bar (B69). Tab status glyphs no longer cause layout shift (B70). Exp panel default sort flipped to descending on fresh install (B71). Ctrl+1..9 / Ctrl+Tab now fire when command bar focused (B72). Login on disconnected tab opens Add Character modal instead of dead-ending (B74). Session Log design locked in DESIGN.md §28 — build pending. |
| `0.6.1` | 2026-05-15 | In progress | Session-state bug-fix pass on top of v0.6.0. B59-B63 fixed: stale-sessionId-in-event-filters (reconnect-in-tab dead, fixed via sessionIdRef), LoginScreen-modal-stomps-title (added isModal prop), Quick-Send-to-disconnected (disabled options + smart default), phantom-5s-gracefulDisconnect (skip IPC when already disconnected), same-account-double-login (pre-flight guard + "Invalid login key" translation). Profile system v2.1: new `useProfileSaver()` hook bound via SessionsContext/CharacterContext to current character's session info; applied at every per-character setItem site (GameWindow streamTimestamps + panel tabs + panel sizes; ExpPanel sort/sortDesc/focusMode; MapPanel mapViewMode; MapGraphView mapLabelMode/mapShowAllZ/mapZLevels/mapShowLegend). Defense-in-depth shutdown save (window.__flushProfileSaves) now also unconditionally saves every active character — catches any future setItem-without-schedule. Map state additions: mapViewMode, showAllZ, zLevels, showLegend all per-character + persisted (B65). Settings/theme apply on tab switch via new isActive useEffect dep (B67). Auto-copy mouseup listener gated by isActiveRef (B66). v1 → v2 profile migration code removed; testers wipe profiles/ to upgrade. Lich integration audit confirmed clean. |
| `0.6.0` | 2026-05-15 | In progress | Release E1 — Sessions: one Lichborne instance manages multiple characters at once. Main-process `SessionStore` (Map<SessionId, Session>); per-session `ConnectionManager`/`StormFrontParser`/`LichBridge`; every per-session IPC channel carries sessionId; window-close drains all sessions in parallel. Renderer `SessionsProvider` + multi-mounted `GameWindow` (inactive tabs `display: none` so state persists); `CharacterTabBar` with health %/glyphs/dim-on-disconnect; `+` launcher modal; Quick-Send overlay (Ctrl+Shift+Enter); keyboard nav (Ctrl+1..9, Ctrl+Tab). Profile system v2 — dynamic localStorage→YAML `state:` map, atomic writes, backup on graceful shutdown, per-character `scheduleProfileSave` map, character-scoped localStorage namespacing across all per-domain modules, GroupsProvider moved per-session, v1 auto-migration. Inactive-tab keydown leak fixed (`isActiveRef` gates in-game handlers) |
| `0.1.0` | 2026-05-07 | Released (pre-release) | First tester release — full client feature set, portable exe, auto-update infrastructure |
| `0.1.1` | 2026-05-07 | Released (pre-release) | Version display on login + title bar, app menu with Open Data Folder, DevTools off by default, stream timestamps, window title from login XML |
| `0.1.2` | 2026-05-07 | Released (pre-release) | Fix `latest.yml` missing from releases, fix version number not updating in packaged exe |
| `0.1.3` | 2026-05-07 | Released (pre-release) | Login screen stability, Lich path auto-detection with ✓/✕ indicators, direct connection clarity |
| `0.1.4` | 2026-05-08 | Released (pre-release) | Fix `app-update.yml` missing from portable build, fix artifact name hyphen/space mismatch, auto-updater error logging forwarded to DevTools console |
| `0.1.5` | 2026-05-08 | Released (pre-release) | Dismissable update banner, Check for Updates button, "You're up to date" feedback, release folder cleanup in publish.mjs |
| `0.1.6` | 2026-05-08 | Released (pre-release) | Check for Updates scoped to login screen only; NSIS installer replaces portable exe |
| `0.1.7` | 2026-05-08 | Released (pre-release) | B01: `<a href>` link parsing, `<LaunchURL>` browser launch, auto-detect bare URLs in game text, settings toggle; cmd-link/url-link CSS variables in theme system; F04 verified; B04: mono-mode column alignment + preset trim fix for buffed stats; B06: ExpBrief `[x/34]` bracket notation; B02: game screen stays open on disconnect with "Login" button; B05: mana bar hidden for NMUs; B07: inventory list no longer appears in main story window at login; F01: account name persists across sessions; auto-updater fix: `build/app-update.yml` extraResource sets `releaseType: release` so installed clients find published releases; B08: horizontal scrollbar suppressed, text word-wraps correctly |
| `0.1.8` | 2026-05-08 | Released (pre-release) | F10: rank-gain highlight in exp panel; F11: Death's Sting indicator in exp footer; B15: RXP usable hours format fix; B16: scroll-pin race condition fix |
| `0.1.9` | 2026-05-08 | Released (pre-release) | System font picker; font size/line height propagation to all panels and toolbar; graceful logout on window close |
| `0.1.10` | 2026-05-09 | Released (pre-release) | B17: combat/swimming scroll-pin race fix (onWheel eager unpin); B18: auto-copy replaced with native Electron clipboard IPC; B19: Home/End keys work in automation text fields; B20: scroll pin fully fixed — no trim while unpinned (content at top stays visible), handleScroll only un-pins, badge/End re-pins and trims to MAX_LINES, hard cap at 6000 lines; tested stable at 3600+ new lines |
| `0.1.11` | 2026-05-09 | Released (pre-release) | Map panel UI reorganization: two-bar chrome layout, legend as canvas overlay, current room label z-order fix, B30 custom theme map var fix; Profile System Phases 1–3: full YAML round-trip (export + import), shared profile pre-fills login form, character YAML restores all settings on login; new automations and contact templates default to allGroups: true; contact templates are now group-aware — styling toggles with mode switches |
| `0.1.12` | 2026-05-09 | Released (pre-release) | Profile system Phases 1–3; group-aware contact templates; allGroups default for all new automation items; profiles/ gitignored |
| `0.5.0` | 2026-05-14 | Released | Release D — Deep Lich: `better-sqlite3` + Ruby Marshal parser (`marshalParser.ts`) + `sqliteReader.ts`; full `lich.db3` read pipeline (uservars, lich_settings, session_summary_state); Ruby Time binary decoding (little-endian, new+old format); unified Lich Dashboard modal (Scripts/Variables/Settings/Profiles tabs); Variables tab with recursive VarValue tree, scope selector, search; Settings tab with feature flag badges; YAML Profile Editor (raw textarea + highlight.js syntax highlighting + line number gutter, LCS diff with show-all toggle, js-yaml validator, `combat_teaching_skill` quick-edit, `write-lich-profile` IPC, CRLF normalization, 4000-line diff threshold) |
| `0.4.0` | 2026-05-14 | Released | Release C — Lich Dashboard: LichBridge module (`commandInjector.ts` + `index.ts`), strict `;listall` interception regex (free-form `--- Lich:` messages pass through), `useLichBridge` hook (5s poll, 8s linger window for transient restarts, optimistic kill state, killed scripts evict immediately bypassing linger), ScriptListPanel (badge/name/status/uptime/pause/resume/kill with confirm, newest-first sort, footer with poll interval, unavailable state), `killing` status indicator, Script Palette toolbar strip; IPC pipeline improvements (event batching, raw-xml gating, UnknownEvent filter) |
| `0.3.2` | 2026-05-13 | Released | B52: boldDepth stuck after unescaped `<`; B28: advanced settings reset in second windows; B42: Wrayth import duplicate row; password save (safeStorage DPAPI, per-account, auto-fill); B53: injuries panel wound detection fixed (name attr, not height/width); theme contrast pass (16+ themes, invisible border-faint fixed); CSS wiring pass (panels/game/global.css hardcoded colors → CSS vars + color-mix); all dark themes bold text → #ffff00 (yellow, matching Genie default; light themes unchanged) |
| `0.3.1` | 2026-05-12 | Released | Release B bug fixes: room matching reworked (Lich ID from subtitle, direct lookup), Genie node matching improved (zone-qualified title fallback), cross-zone exits in detail panel, detail panel follows player, recenter works cross-zone, reload button, auto-reload on map download, mouse wheel zoom, map control focus fix, single recenter button |
| `0.3.0` | 2026-05-12 | In progress | Release B — Lich Visibility: hybrid map system (Lich image view + Genie SVG graph, zone-by-zone, direct-connect mode, persistence via _shared.yaml, generation counter cancellation, zoom buttons, cross-zone diamonds, orphan legend, label default off, dragRef null-deref fixes, null wayto/description guards, computeFit NaN guard, Genie load race fix, map file selector dynamic scan + sequence sort + mtime tiebreaker) |
| `0.1.13` | 2026-05-11 | Released (pre-release) | Legacy client import wizard (Wrayth, Genie, Frostbite); Genie presets.cfg → custom theme; profile-aware import; import name blanking; Genie /i flag fix; highlight sound playback (no companion trigger); trigger WAV sound support; trigger action type dropdown + VarPicker dropdown; WebKit color swatch fix; numpad key detection; command/alias echo to main stream; Debug Fires tab; B33 virtual scrolling (react-virtuoso, ~50 DOM rows instead of 2000, eliminates combat lag); B34/B37 stream ID raw-case preservation (clearStream/pushStream/stream-text all use exact script capitalization); B35 text-window padding removed (flush scroller, compass alignment, height estimation fix); B36 scroll-following full rewrite (followOutput owns auto-scroll via Virtuoso internal height map; totalListHeightChanged fine-correction pass; scroll handler re-pin-only; onWheel/keyboard-only unpin; suppressUnpinRef covers followOutput events; clearLines resets pin); B38 last-line clip fix (margin-bottom on .text-line collapsed through wrapper — moved to padding-bottom on .text-line-wrap so ResizeObserver captures it); panel tab right-click Clear; stream title attribute used as display label; B39 stream panel re-pin fix (handleScroll was unpin-only — scrolling back to bottom now re-pins); Performance Pass: chip-pulse animation filter:brightness→opacity (eliminates Recalculate Style cost during RT/CT); TimerDisplay isolated as memo'd component (100ms interval ticks no longer re-render GameWindow); suppressUnpinRef bool+timer replaced with suppressUntilRef timestamp (eliminates clearTimeout+setTimeout churn — 75% reduction in timer scheduling overhead); trigger engine fastLower pre-filter (substring check before regex.exec on every incoming line — mirrors highlight engine optimization); toolbar Disconnect button red when connected, green when disconnected; B40 Raw XML tab scroll lock fixed — stable key offset (rawBaseRef+i) prevents content shifts when rawXmlBufRef rolls over, matching the B14 pattern from the Events tab |

---

## Phase 1 — Connection & Baseline UI ✅

- [x] Electron + Vite + React + TypeScript scaffold
- [x] esbuild for main process bundling
- [x] SGE authentication (TLS, XOR cipher, character list)
- [x] Lich launch + connection (Ruby, --genie flag, localhost:11024)
- [x] Direct SGE game server connection (handshake, \n\n completion)
- [x] ConnectionManager (Lich + direct modes, graceful disconnect)
- [x] IPC: login, send-command, disconnect, game-text, connection-status, error
- [x] Login screen (account, password, character name, Lich toggle, advanced options)
- [x] Game window (raw text display, XML stripped, command bar, disconnect button)
- [x] Graceful disconnect (QUIT → wait for server close → force close)

---

## Phase 2 — XML Parsing & Core UI

Broken into 5 testable milestones. Build and test each before moving to the next.

### Milestone 2A — Parser & IPC Foundation
> Goal: typed events flow through IPC, main text still works, debug panel shows event stream

- [x] StormFront XML parser (SAX-style: tag_start / text / tag_end callbacks, active tag stack)
- [x] Typed GameEvent types (VitalUpdate, RoundtimeEvent, IndicatorEvent, StreamText, RoomComponent, ExpComponent, etc.)
- [x] Main process emits typed GameEvent array over IPC instead of raw strings
- [x] Renderer handles typed events — main text still renders correctly
- [x] Debug panel — shows raw parsed event stream in real time (toggle via "Debug" button in toolbar)
- **Test:** Connect to game → main text works → debug panel shows typed events

#### Parser Implementation Notes (from Lich xmlparser.rb — Binu's recommendation)

Reference file: `C:\Ruby4Lich5\Lich5\lib\common\xmlparser.rb`

Lich uses Ruby's REXML StreamListener — a SAX-style parser with three callbacks:
- `tag_start(name, attributes)` — opening or self-closing tag
- `text(text_string)` — text content between tags
- `tag_end(name)` — closing tag

Model our TypeScript parser the same way: maintain an **active tag stack** and **active ID stack**, then dispatch based on the current tag context. This handles mixed text+XML naturally — text content arrives as a separate callback, not mixed into the tag handling.

**Vital bars — `<progressBar>` ids and text format:**

| `id` attribute | What it tracks | Text format |
|---|---|---|
| `health` | Health | `value` is 0-100 percentage. `text` is display string e.g. `"HEALTH 100%"` — use `value` directly |
| `mana` | Mana | same — `value` is 0-100 percentage |
| `spirit` | Spirit | same — `value` is 0-100 percentage |
| `stamina` | Fatigue | same — `value` is 0-100 percentage |
| `concentration` | Concentration | same — `value` is 0-100 percentage. Tag arrives as `conclevel` |
| `pbarStance` | Stance | `"Standing 100"` — first word is stance text |
| `conclevel` | Concentration (alias) | DR sends `conclevel` not `concentration` — normalize to `concentration` on ingest |
| `encumlevel` | Encumbrance | text is encumbrance label, value is 0-110 |
| `nextLvlPB` | XP toward next level | value = percent, text = label |

The text attribute is **not** just the current value — it contains `"current max"` as two integers. Use `.scan(/-?\d+/)` equivalent to extract both numbers.

**Room title in DR:**
- Comes from `<streamWindow id='main' subtitle=' - [Bosque Deriel, Hermit\'s Shacks] (230008)'/>` — NOT from a component tag
- Parse with regex: extract `[Room Name]` from subtitle, and the trailing `(uid)` as room ID
- Example: ` - [Bosque Deriel, Hermit's Shacks] (230008)` → title: `Bosque Deriel, Hermit's Shacks`, roomId: `230008`

**Room component IDs (use exactly these strings):**
- `room objs` — objects/NPCs in room (NOT `room objects`)
- `room players` — players in room
- `room exits` — exits (text of `<d>` child tags = individual exit directions)
- `room desc` — room description prose

**Stance:**
- Comes from `<progressBar id="pbarStance" text="Standing" value="100"/>` — NOT from an `<indicator>` tag
- First word of `text` attribute is the stance label

**`nav` tag — room change signal:**
- `<nav/>` fires before new room data arrives
- Signals: clear current room panel (NPCs, loot, players, description)
- In DR, room ID comes from the `streamWindow` subtitle, not `nav` attributes

**`prompt` tag — server time:**
- `<prompt time="1714512345">` carries the server's Unix timestamp
- Useful for accurate RT calculation: `rtExpiry - serverTime + Date.now()` corrects for clock drift

**Indicator IDs are stored with `Icon` prefix:**
- Raw format: `IconSTUNNED`, `IconBLEEDING`, `IconWEBBED`, `IconHIDDEN`, `IconDEAD`, `IconPOISONED`, `IconDISEASED`
- Normalize on ingest: strip `Icon` prefix, lowercase → `stunned`, `bleeding`, etc.

**`compDef` tag:** treated identically to `component` — handle both the same way.

**`spell` tag:** text content (between `<spell>` and `</spell>`) is the prepared spell name. `"None"` means nothing prepared.

**`right` / `left` tags:** text content is the held item name. `"Empty"` means nothing held.

**`pushBold` / `popBold`:** toggle bold state — tracked as a depth counter (nested bold is possible).

**Active spells (percWindow stream):** complex text parsing of spell names + durations. Defer to a later milestone — do not attempt in 2A.

### Milestone 2B — Vitals Bar Strip ✅
> Goal: vitals, roundtime, indicators, prepared spell all live and updating

- [x] Fixed vitals bar strip at top of layout (flexbox column, between toolbar and main text)
- [x] Vital bars — Health, Mana, Concentration, Fatigue, Spirit (from VitalUpdate)
- [x] Vital bar gradient fills + 4-state health thresholds (green/yellow/orange/red at 80/50/30%)
- [x] Roundtime countdown — precise timer from Unix timestamp, scales to actual RT max
- [x] Cast time countdown — precise timer from Unix timestamp, scales to actual CT max
- [x] RT/CT persistent draining strips at bottom of icon bar (idle-dimmed when inactive)
- [x] Indicators — stance, bleeding, webbed, stunned, hidden, invisible, dead, joined
- [x] Stance from `<indicator>` tags now correctly emits StanceEvent (bug fix)
- [x] Prepared spell display
- [x] Two-row icon bar HUD (Section 4.8): stance/status row + compass/hands/spell row
- [x] Compass exits from `<component id='room exits'>` — tagEnd mismatch bug fixed
- [x] Left/right hand items from `<right>` / `<left>` tags
- [x] Command history — Up/Down arrow, 200-command buffer
- [x] Login screen status log auto-scrolls to bottom
- **Test:** ✅ Log in → bars appear → take damage → health drops → cast spell → RT counts down

#### Implementation Notes

- `VitalsBar.tsx` + `vitalsbar.css` — vitals only, gradient fills, threshold colors
- `IconBar.tsx` + `iconbar.css` — two-row HUD, all character/world state indicators
- Countdown interval runs at 100ms; `rtMaxRef` captures initial duration on each new timer for correct fill scaling
- RT/CT strips always rendered; `timer-strip--idle` class dims them when inactive
- Epilepsy Safe Mode hook in place: `[data-epilepsy-safe="true"]` on `#root` disables all pulse animations
- `tagEnd()` now guards `if (name !== captureCtx.tag) return` — fixes nested `<d>` tags breaking exits capture
- Stance indicator tags (`IconSitting`, etc.) now emit both `StanceEvent` and update internal parser state
- Unknown tags inside capture contexts suppressed from debug panel noise

### Milestone 2C — Room Panel, Stream Panels, Experience ✅
> Goal: structured room panel with clickable exits, all stream panels, exp tracker

- [x] PanelFrame — tabbed container, +/× controls, scrollable tab bar
- [x] Room panel — name, desc, objects, players, clickable exits
- [x] Thoughts, Arrivals, Deaths, Active Spells stream panels
- [x] Experience panel — live mindstate tracker with gradient bars, mind-lock badge
- [x] Text preset styling — speech, whisper, thought, roomname, roomdesc, bold, expiry, store
- **Test:** ✅

### Milestone 2D — Smart Scroll Anchor ✅
> Goal: scroll up pauses auto-scroll, badge shows new line count

- [x] Smart scroll anchor — "▼ N new lines" badge, click or End to resume
- **Test:** ✅

---

## Phase 3 — Panel System

### Milestone 3A — Resizable Panel Column ✅
> Goal: right panel column is draggable to resize; width persists across sessions

- [x] Draggable vertical splitter between main text and panel column
- [x] Panel column width persisted to localStorage
- [x] Reset Layout button restores default width
- **Test:** ✅

### Milestone 3B — Three-Zone Right Column ✅
> Goal: right column splits into three independent panel zones with two horizontal splitters

- [x] Panel column split into top (Room), mid (Thoughts), and bottom (empty) zones
- [x] Two horizontal splitters — drag to resize top and mid zones independently
- [x] Top and mid zone heights persisted to localStorage
- [x] Bottom zone takes remaining space (flex: 1)
- [x] Reset Layout resets column width and both zone heights
- [x] Each PanelFrame zone starts with its own independent default tabs
- **Test:** Launch → three zones visible → drag both h-splitters → zones resize → restart → sizes restored

### Milestone 3C — Panel Catalog ✅
> Goal: Familiar, Inventory, and Debug available as panel types in the + menu

- [x] Familiar stream panel (routes `familiar` stream via StreamPanel)
- [x] Inventory stream panel (routes `inv` stream via StreamPanel)
- [x] Debug panel (raw event stream, available as panel type in + menu alongside existing overlay)
- **Test:** ✅ Open + menu → Familiar, Inventory, Debug appear → add Debug → event stream shows live

### Milestone 3D — Panel Manager UI ✅
> Goal: modal listing all panels, open/closed state, move between zones

- [x] Panel Manager accessible from toolbar ("Panels" button)
- [x] Tab state lifted to GameWindow — both zones fully controlled
- [x] Lists all panels with current zone (Top / Bottom / Not Open)
- [x] Move a panel between zones (↑ Top / ↓ Bottom buttons)
- [x] Remove a panel from either zone
- [x] Add closed panels to either zone
- [x] activeId correctly updated on remove
- **Test:** ✅ Open Panels → see all zones → move Room to bottom → Room appears in bottom zone

### Milestone 3E — User-Created Panels ✅
> Goal: players can create named panels on the fly

- [x] "New panel..." option in PanelFrame + menu with inline name input
- [x] Player types a name → custom panel created with unique stream ID
- [x] Custom panels render StreamPanel keyed by their ID
- [x] Empty state shows "Waiting for content on stream X" message
- [x] Custom panels appear in Panel Manager and can be moved/removed
- [x] Lich script streams auto-discovered via pushStream — appear in Panel Manager and + menu automatically
- **Test:** ✅ Click + → New panel... → type name → panel appears with waiting message

### Milestone 3F — Dynamic Stream Discovery & Layout Persistence ✅
> Goal: unknown pushStream IDs auto-populate the panel manager; layout survives disconnect/reconnect

- [x] Parser emits discovery events for unknown pushStream IDs
- [x] GameWindow collects discovered stream IDs into `discoveredStreams` state
- [x] NEVER_DISCOVER filter prevents internal/aliased streams from polluting the list
- [x] Panel Manager "Available Streams" section shows discovered streams with add buttons
- [x] `+` menu in each PanelFrame also shows available discovered streams
- [x] Adding a discovered stream creates a custom tab with the stream ID as key
- [x] `+` menu rendered via React portal — no longer clipped by overflow:hidden ancestors
- [x] `+` menu has max-height with scrollable list + fixed "New panel…" footer
- [x] moonWindow (and similar state-display streams) clear on each push — replace not append (later refactored: REPLACE_ON_PUSH removed; behavior now XML-driven via producer's explicit `<clearStream>` before each push)
- [x] Panel tab layout (all three zones + active IDs) persisted to localStorage
- [x] Reset Layout button resets tabs back to default Room+Thoughts as well as sizes
- [x] Tab close `×` always visible regardless of tab count
- **Test:** ✅ Connect → moonWindow/atmospherics/etc. appear in Available Streams → add one → survives disconnect → Reset Layout restores defaults

---

## Phase 4 — Display, Accessibility & Theming

**Phase 4 — In progress (4A ✅, 4B ✅, 4C ✅, 4D ✅)**

### Milestone 4A — CSS Variables Foundation & Readability ✅
> Goal: extract all hardcoded colors to CSS custom properties; fix readability problems

- [x] `theme.css` created with ~100 named color tokens covering every UI surface
- [x] All CSS files updated to use `var(--...)` throughout — no hardcoded hex colors remain
- [x] Vital bar gradients moved from inline JS strings to CSS classes (`vital-fill--health-ok`, etc.)
- [x] Readability fixes: inactive tab text `#4a4a4a` → `#888`, whisper preset brightened, exp panel secondary text improved, room section labels more visible, panel manager row labels upgraded
- [x] Theme switching now requires only a single `:root` block swap in `theme.css`
- **Test:** ✅ App looks identical to before but all colors are now variable-driven

### Milestone 4B — Base Themes & Theme Picker ✅
> Goal: 5 general themes + theme picker UI in settings

- [x] General base themes: Classic (default), Dark, Darker, Ivory, Mist, Parchment, Slate, Terminal — Ivory (white, indigo accent) and Mist (cool gray, steel blue) added as fully retuned light themes with dark preset colors, halved glow opacities, and brightened vitals gradient starts
- [x] Theme picker UI — list+detail two-panel layout; left column = theme list with dot+name+active badge; right panel = live preview mock (room name/desc/exits/speech) using actual merged theme vars; action buttons below preview
- [x] Live preview on click — no confirmation needed, persists to localStorage
- [x] Guild themes (all 12 guilds including Commoner) — palettes from DESIGN.md Section 6.5; theme list now fully alphabetical in both general and guild categories
- [x] `themes.ts` — `darkBase` + per-theme overrides, `applyTheme`, `initTheme` loaded at startup
- [x] "Theme" button in toolbar opens ThemePicker modal (portal)
- **Test:** Click Theme → pick Parchment → UI goes light → refresh → Parchment still active

### Milestone 4C — Theme Editor & My Themes ✅
> Goal: players can customize and save their own themes

- [x] Three-tab ThemePicker: General | Guild | Custom
- [x] "Customize…" button on every base/guild theme card — always creates a copy, never edits the original
- [x] Theme Editor modal — 5 tabs (Surfaces / Game Text / Vitals / HUD / Room & Exp), all ~90 CSS vars editable with native color pickers, gradient pairs, and rgba fields
- [x] Live preview while editing — changes apply to `:root` immediately (game behind modal is the preview)
- [x] Cancel restores the previously active theme
- [x] Custom tab — shows all My Themes with Edit / Dup / Export / Delete per card
- [x] Duplicate, rename, delete custom themes
- [x] Export theme as JSON file download
- [x] Import theme from JSON file
- [x] Custom themes persisted to localStorage; restored on app startup
- **Test:** Pick Dark → Customize… → change accent to red → Save → Custom tab shows new theme active

### Milestone 4D — Settings Panel & Accessibility ✅
> Goal: settings screen + font config + accessibility toggles

- [x] Settings panel — toolbar button, flat single-level layout, sections for Display and Accessibility
- [x] Font config — family picker (Cascadia Code / Fira Code / JetBrains Mono / Source Code Pro / monospace), size +/- control, line height select; CSS vars `--game-font-size/family/line-height` applied globally
- [x] Large Print mode — bumps game font to 18px, line-height to 1.8, scales `html.style.fontSize` so all `rem` values enlarge proportionally
- [x] High Contrast mode — black bg, white text, yellow accent; overlaid as inline CSS vars on top of active theme
- [x] Color Blind mode — Deuteranopia, Protanopia, Tritanopia; targeted semantic var overrides (health/indicator/timer/compass colors)
- [x] Epilepsy Safe Mode toggle — sets `data-epilepsy-safe="true"` on `<html>`; CSS `[data-epilepsy-safe="true"]` disables pulse animations
- [x] Vitals bar position toggle — top renders above game-main (full width); bottom renders inside `.text-window-wrap` above command bar (main area width only, stops at panel column divider)
- [x] Theme overlay ordering: re-apply effect in GameWindow re-applies base theme then settings overlays on every settings/theme change so overlays survive theme switches
- [x] Settings persisted to localStorage (`lichborne.settings`); restored on startup via `initSettings()`
- [x] Icon bar position toggle — independent of status bar position (top or bottom)
- [x] Settings reset to defaults button in Settings panel header
- [x] Login screen advanced settings (Lich paths, port, mode, delay, panel open/closed) persisted to localStorage (`lichborne.advancedSettings`)
- [x] Reset Panels moved from toolbar into Panel Manager header; toolbar cleaned up
- [x] Settings button now inherits toolbar theme styling (was missing from CSS selectors)
- [~] Full keyboard navigation — backlogged (see Backlog section)
- [~] Screen reader / ARIA live regions — backlogged (see Backlog section)

---

## Phase 5 — Quality Pass & Console Polish
*In progress. See DESIGN.md Phase 5 for spec.*

### Phase 5A — Theme & Preset Audit ✅ (in progress)

- [x] Panel resize clipping — mid zone drag capped to column offsetHeight; top zone no longer pushed off screen
- [x] Bold text rendering — renderSegment always sets data-preset on bold elements; `[data-preset="bold"]` CSS now matches
- [x] global.css imports panels.css — preset rules apply across all panels, not just GameWindow
- [x] `<style>` tag redesigned as push/pop marker (was wrongly capture context) — roomname/roomdesc now render correctly in main stream
- [x] Preset id normalized to lowercase on ingest — fixes camelCase `roomName`/`roomDesc` not matching CSS selectors
- [x] `<color fg bg>` inline color tag support — parser stack, TextSegment fg/bg fields, renderSegment inline styles
- [x] `<compass>/<dir>` structured exit parsing — replaces brittle text regex; value="s" format confirmed from live data
- [x] Silent tag cleanup — skin, image, radio, link, switchquickbar, endsetup, resource, exposestream all silenced
- [x] STREAM_MAP additions — room, moonWindow, LichScripts; no more unknown events for known streams
- [x] Stream discovery moved to typed stream-push event — discovery no longer breaks when stream is added to STREAM_MAP
- [x] Parser reset() method — clears all carry-over state on reconnect
- [x] Debug RAW_PROMPT logging removed — was firing an unknown event on every server transaction
- [x] roomname (white) and roomdesc confirmed working in-game via live XML capture
- [x] Preset highlight (background) color — `--preset-*-bg` vars added to all themes (transparent default); theme editor Game Text tab shows symmetric fg+bg rows per preset; panels.css applies background-color; bg hex input always visible, clears to transparent on empty
- [~] Theme preset coverage audit — deferred, all themes inherit from darkBase for now
- [x] Auto-copy on text selection — mouseup listener copies any highlighted text to clipboard in all panels; skips inputs/textareas
- [x] Debug button false-active on login — command input now focused on GameWindow mount; browser no longer lands focus on Debug button
- [x] Stream panel preset coverage — StreamPanel uses renderSegment + panels.css is global; presets apply identically in all stream panels
- [x] Right-click context menu — ContextMenu component (portal, Escape/outside-click to close); "Clear" in main text window and all stream panels; debug panel also gets it alongside existing Clear button; room/exp excluded (structured data, not clearable)
- [x] Text selection styling — ::selection uses color-mix(accent, transparent) so every theme gets a matching tinted highlight automatically; no per-theme overrides needed
- [x] Toolbar/command bar hardcoded dark colors — replaced #181818/#141414 with var(--bg-sunken)/var(--bg-base); Parchment and light themes now render correctly
- [x] Terminology section added to DESIGN.md (Section 2) — Panel / Stream / Structured Panel defined; all sections renumbered
- [x] Stream mapping expansion — `talk`→`conversations`, `combat`→`combat`, `atmospherics`→`atmospherics`, `group`→`group` added to STREAM_MAP; `conversations` added as built-in PanelType with label, renderPanel case, and NEVER_DISCOVER entry
- [x] Stream fallback system — `STREAM_FALLBACK` map + `watchedStreamsRef` (updated on tab changes); all named streams (conversations, thoughts, arrivals, deaths, spells, familiar, combat, atmospherics, group) fall back to main when no panel is open; main window is always the safety net
- [x] Default panel layout updated — Top-Right: Room + Conversations; Center-Right: Thoughts + Arrivals + Deaths + Active Spells; Bottom-Right: Experience + Log; reset-to-defaults block updated to match
- [x] Command bar scoped to main text area — moved inside `.text-window-wrap`; right panel column now extends full window height; bottom-right panel gains the space previously consumed by the full-width input bar
- [x] VitalsBar bottom position scoped to main text area — renders inside `.text-window-wrap` directly above command bar; matches input bar width, stops at panel column divider
- [x] StatusBar renamed to VitalsBar throughout — `VitalsBar.tsx`, `vitalsbar.css`, `vitalsBarPosition` settings key, "Vitals Bar Position" label, all docs updated
- [x] RT/CT timers moved from IconBar into command bar — thin 3px strips (RT=top edge amber, CT=bottom edge blue); `useTimers` hook extracted to `hooks/useTimers.ts`; `cmd-timer` CSS classes in `game.css`; `.command-bar` gets `position:relative; overflow:hidden`; both strips hidden when inactive
- [x] Floating compass — `FloatingCompass.tsx` + `floatingcompass.css`; semi-transparent overlay anchored to bottom-right of game text area; `pointer-events:none`; removed from IconBar
- [x] `.text-area` wrapper — inner `<div className="text-area">` wrapping `.text-window` + floating compass + scroll badge inside `.text-window-wrap`; provides correct `position:relative` context so compass anchors to text area only, not including vitals bar or command bar
- [x] Icon bar redesigned to single row — L hand | R hand | Spell (always visible, shows "None" when idle) | 6 right-anchored status bars; compass and timers removed
- [x] 6 status bars: Bar1=Stance (always active), Bar2=Invisible, Bar3=Webbed, Bar4=Grouped, Bar5=Hidden, Bar6=Bleeding→Stunned→Dead priority; all bars same fixed width; empty bars render placeholder text to maintain consistent size
- [x] VitalUpdateEvent `label` field — `StormFrontParser` extracts custom vital name from `text` attr when `customText='t'` (e.g. Barbarian mana bar sends "inner fire 59%" → stored as "Inner fire"); `vitalLabels` state in GameWindow; `VitalsBar` accepts `labels` prop and prefers server label over default

---

## Phase 6 — Contacts System ✅
*Complete (6A–6C). Full spec in DESIGN.md Section 15.*

### Milestone 6A — Data Model, Templates & Panel UI ✅
> Goal: contacts stored, templates editable, Contacts panel fully functional

- [x] `contacts.ts` — Contact + ContactTemplate types, loadContacts/saveContacts, loadContactTemplates/saveContactTemplates, newContact, newTemplate, formatLastSeen, normalizeTemplate (fills missing fields on old localStorage data), DR_GUILDS array
- [x] Default templates: Friends (#a0d080) and Enemies (#e05050 + "[Enemy]" tag)
- [x] `ContactsPanel.tsx` — portal-rendered modal; Contacts tab with sidebar list + detail form (name, template dropdown with live preview swatch, guild select, circle input, last-seen read-only, notes textarea, delete with confirmation, save); Templates tab with inline expand-to-edit rows
- [x] Template editor fields: name, text color, BG color, bold checkbox, tag text, tag color, tag BG color
- [x] `colorPickerValue()` helper — prevents empty string on `<input type="color">` (avoids console errors from old localStorage data missing new fields)
- [x] Contacts button added to toolbar (`btn-contacts` in `game.css`)
- [x] `contacts.css` — all CSS vars, no hardcoded colors
- **Test:** Open Contacts → create contact → assign Friends template → save → name appears styled in list

### Milestone 6B — Name Highlighting & Tag Injection ✅
> Goal: contact names light up with template colors in all game text panels

- [x] `ContactsContext.tsx` — provides contacts, templates, nameRegex (useMemo), onContactClick to all rendering components
- [x] `renderWithContacts.tsx` — `buildNameRegex(contacts)`: single case-insensitive whole-word alternation RegExp or null; `renderSegmentWithContacts()`: splits TextSegment text around matches, renders tag span (render-only, never modifies underlying data) + styled name span
- [x] `GameWindow.tsx` wired — ContactsContext provider wraps entire render; nameRegex recomputes on contacts change only; `handleContactClick` callback
- [x] `StreamPanel.tsx` wired — uses `useContacts()` hook, passes `onContactClick` to renderSegmentWithContacts
- **Test:** Add "Sekmeht" as Enemy → see "[Enemy] Sekmeht" highlighted in red wherever name appears in game text

### Milestone 6C — Clickable Popover & Last-Seen Tracking ✅
> Goal: click a contact name to see their card; last-seen auto-updates from room

- [x] `ContactPopover.tsx` — portal-rendered, `useLayoutEffect` clamps to viewport, closes on outside mousedown or Escape; shows tag+name header, guild·circle subtitle, last-seen (always visible — "never" if null, "Last seen: X ago — Room" if set), notes, Edit contact button
- [x] `contact-popover.css` — popover styles + `.contact-name--clickable` hover underline
- [x] "Edit contact" in popover opens ContactsPanel with that contact pre-selected (`openContactId` prop)
- [x] Last-seen tracking — `useEffect` on `roomState.players`; scans for contact name matches via nameRegex; debounced 2s localStorage write; updates `lastSeen` timestamp + `lastRoom` from current room name
- [x] Compass "down" → "dn" normalization — `StormFrontParser.ts` normalizes `<dir value="down"/>` to `"dn"` on ingest (server sends "down", FloatingCompass checks for "dn")
- **Test:** Connect → walk into room with a contact → "Also here:" line triggers last-seen update → click name → popover shows correct last-seen and room

---

## Phase 7 — Highlights, Triggers & Macros
*7A complete. Full spec in DESIGN.md Section 14.*

### Phase 7A — Highlights ✅

- [x] `highlights.ts` — `HighlightRule` data model (`id, name, enabled, pattern, mode, caseSensitive, scope, style, priority`); `HighlightStyle` (`textColor, bgColor, bold, glow, glowColor`); `buildHighlightRegex()` with three match modes; `isValidRegex()`; `newHighlight()` factory; localStorage persistence (`lichborne.highlights`)
- [x] Pattern engine — three modes:
  - **Text** — word-by-word `\b` matching joined with `\s+`; handles multi-word phrases and punctuation correctly
  - **Phrase** — exact escaped substring; case-insensitive by default
  - **Regex** — raw user-supplied regex; live error indicator on invalid syntax
- [x] Case sensitivity toggle — `caseSensitive` field on rule; default `true` (case-sensitive); `Aa` button in editor; switches regex between `g` and `gi` flags
- [x] Scope — **Line** (entire `.text-line` div styled via inline style) or **Match** (only matched spans styled); overlap resolution: contacts beat highlights on ties, first match by position wins
- [x] Style per rule — text color, background color, bold, glow (`text-shadow`), glow color (independent picker)
- [x] `HighlightsContext.tsx` — `rules, matchRules, lineRules`; `useCompiledHighlights()` pre-compiles active regexes via `useMemo`
- [x] `renderSegmentFull.tsx` — single-pass renderer replacing `renderSegmentWithContacts`; handles contacts + match-scope highlights in one regex loop; `getLineHighlightStyle()` for line-scope
- [x] Applied in GameWindow main text + all StreamPanels via context
- [x] `HighlightsPanel.tsx` — portal modal; sidebar list (toggle bullet, color swatch, scope badge); detail form with label, pattern field, mode toggle (Text / Phrase / Regex), `Aa` case sensitivity button, Line/Match scope radio, 3-column style grid (Text / Background / Glow with pickers + Bold checkbox), live preview box with custom test input field
- [x] Right-click integration — "Highlight 'word'" (Match scope) and "Highlight this line" (Line scope) in main text context menu; captured line text pre-fills the preview test input
- [x] Highlights toolbar button (`btn-highlights`) wired to theme CSS vars
- [x] `highlights.css` — all `hp-*` panel styles; `.hl-match` in-game span
- [x] **Post-launch bug fixes** — scroll pinning race (useLayoutEffect + overflow-anchor:none); thoughts/arrivals/deaths stream colors (STREAM_DEFAULT_PRESET); mind lock exp panel (nested `<preset>` inside `<component>` no longer steals captureCtx)
- [x] Right-click highlight options added to all stream panels — "Highlight 'word'" and "Highlight this line" threaded through `onHighlight` prop on StreamPanel → PanelFrame → GameWindow's `openHighlightEditor`; captured line text pre-fills the preview
- [ ] Rule import / export (JSON) — deferred
- [ ] Group system (Danger, Alerts, Info, Social) — deferred
- [ ] Highlight Wizard — deferred
- [ ] Panel scope selector (per-rule stream filtering) — deferred

### Phase 7B — Triggers ✅

- [x] `triggers.ts` — `TriggerRule` data model with pattern (Text/Phrase/Regex, case-sensitivity), watch stream scope, AND state gates (health/mana/stamina/spirit/concentration/rt/stance/spell/indicators/room), cooldown, one-shot; 6 action types: Command, Echo, Notify, Sound, Webhook, Variable; `newTrigger`/`newTriggerAction`/`newGate` factories; `buildTriggerRegex`; `interpolate()` with `$var` substitution; `saveTriggers`/`loadTriggers`
- [x] `useTriggerEngine.ts` — React hook; compiled regex ref (recompiles on rule change); per-trigger cooldown timestamps; `processLine(stream, text)` called from GameWindow event loop; `checkGates()` with numeric + string operator comparison; `buildVars()` including named regex capture groups; Web Audio API tone for Sound action; Discord-compatible JSON POST for Webhook action
- [x] Trigger engine wired in `GameWindow.tsx` — `triggerCtxRef` updated synchronously in event loop alongside React state (vitals, rt, stance, spell, indicators, room, hands); `processLine` called for every stream-text event (not room sub-streams or raw); `echoToStream` injects synthetic TextLines into any stream
- [x] `TriggersPanel.tsx` — portal modal; WHEN / THEN / TEST three-section layout; sidebar with enable toggle + action-type emoji badges; pattern + mode + case (same engine as Highlights); watch stream dropdown; AND conditions builder (variable/operator/value chips); cooldown seconds + one-shot checkbox; multi-action card list (add/remove/reorder); per-action type pill selector; `$` variable insertion picker with cursor-aware insert on all interpolatable fields; test mode shows match + variable-substituted action preview
- [x] Action types fully implemented: **Command** (text + optional delay ms), **Echo** (message + stream ID), **Notify** (title + body via Web Notification API), **Sound** (Chime/Alert/Alarm/Ping via Web Audio API), **Webhook** (URL + message → Discord-compatible JSON POST), **Variable** (name + value expression)
- [x] Right-click "Trigger for 'word'" and "Trigger for this line" in main text window and all stream panels — `onTrigger` threaded `GameWindow → PanelFrame → StreamPanel`, mirrors the highlights pattern
- [x] Separate "Triggers" toolbar button; panel styled fully with CSS custom properties, adapts to all themes automatically
- [x] Trigger persistence (`lichborne.triggers`)
- [ ] Rule import / export — deferred
- [ ] Trigger groups — deferred

### Post-7B — UI Quality Pass ✅

- [x] **U01 — Unread tab indicators** — inactive side-panel tabs show a gold dot when new content has arrived; dot clears when the tab is activated; `unreadRef` + `activeIdsRef` in GameWindow drive the logic; no re-render cost on the hot event path
- [x] **U05 — Pending delayed trigger commands cancelled on disconnect** — `useTriggerEngine` now tracks all `setTimeout` handles from delayed Command actions in a `pendingTimersRef` Set; `cancelPending()` exposed from the hook; called immediately on user-initiated disconnect and in the event-handler cleanup on server-side drop
- [x] **U08 — Font preview in Settings** — live preview block added to the Display section of Settings between Line Height and the Accessibility divider; shows room name, plain text, speech, thought, and bold lines styled with the current font family/size/line-height and active theme preset colors; updates instantly on any control change

### Phase 7C — Macros & Aliases ✅

- [x] `macros.ts` — `AliasRule` + `MacroRule` data models; `resolveAlias()` with prefix match + `$1 $2 $rest` argument capture; `resolveMacro()` with key combo matching; `formatKeyCombo()`/`matchKeyCombo()` helpers; `interpolate()` for `$var` substitution; `loadAliases`/`saveAliases`/`loadMacros`/`saveMacros` localStorage persistence
- [x] `MacrosPanel.tsx` — two-tab modal (Aliases / Key Bindings); same sidebar+detail layout as Highlights and Triggers; `KeyBindingField` component with Record button (captures at `capture:true`, Escape to cancel); `CommandList` component with add/remove rows and `$` var-picker (portaled); full CRUD with enable toggle, revert, delete confirmation
- [x] `macros.css` — `ma-*` design language matching `hp-*`/`tp-*` exactly; key badges with `border-bottom: 2px` depth effect; listening pulse animation disabled by `[data-epilepsy-safe="true"]`; tab switcher with count badges in header
- [x] GameWindow wiring — alias resolution intercepts `handleCommand` before send; macros fire from document `onKeyDown` (global, suppressed when any modal is open via `anyModalOpenRef`); `macroTimersRef` tracks delayed command handles cancelled on disconnect; `buildMacroVars()` + `sendCommandSequence()` helpers; `btn-macros` toolbar button between Triggers and Theme

---

## Phase 8 — Automations, Groups & Modes ✅

Full spec in DESIGN.md Section 17.

- [x] `groups.ts` — `RuleGroup`, `GameMode` types; load/save (groups, modes, activeGroupStates, activeModeId); default groups (Combat, PVP, Social, Crafting) + modes (Hunting, PVP, Town, Crafting); `isRuleActive(groupIds, activeGroupStates, allGroups)` predicate
- [x] `GroupsContext.tsx` — React context at App root; `applyModeObject(mode)` added to fix save+apply race; `clearMode` zeros all group states (No Mode = only allGroups rules fire); cleanup effect prunes stale group IDs when groups are deleted
- [x] `GroupPicker.tsx` — reusable chip picker with portal dropdown; shows assigned groups as colored chips with × remove; empty state message when no groups defined
- [x] `ModeSwitcher.tsx` — toolbar popover; shows active mode name with `*` when modified; mode list with hotkeys, No Mode, Manage… link to Groups & Modes tab
- [x] `GroupsModesTab.tsx` — two-panel editor (Groups left, Modes right); mode Apply button uses `applyModeObject(draft)` not `applyMode(id)` to avoid stale-closure race
- [x] `AutomationsPanel.tsx` — unified tabbed modal (Highlights, Triggers, Macros, Aliases, Groups & Modes); hosts each rule editor inline via `inline` prop; accepts prefill props (`highlightPrefill`, `highlightTestText`, `triggerPrefillPattern`) so right-click open-to works
- [x] Inline panel pattern — `inline?: boolean` prop added to HighlightsPanel, TriggersPanel, MacrosPanel; when true renders body only (no backdrop/portal/header); AutomationsPanel provides its own chrome
- [x] `allGroups: boolean` field on all four rule types (`HighlightRule`, `TriggerRule`, `AliasRule`, `MacroRule`) — fires in every mode; defaults `false`; takes priority over `groupIds`
- [x] **All Groups** button in each rule editor — pill toggle with accent fill when active; clears `groupIds` when toggled on; GroupPicker hides when allGroups is on
- [x] Wire Highlights — `useCompiledHighlights` passes `rule.allGroups ?? false` to `isRuleActive`
- [x] Wire Triggers — `useTriggerEngine` passes `rule.allGroups ?? false` to `isRuleActive`
- [x] Wire Macros — macro keydown filter passes `r.allGroups ?? false` to `isRuleActive`
- [x] Wire Aliases — alias resolution filter passes `r.allGroups ?? false` to `isRuleActive`
- [x] Mode hotkeys — GameWindow `onKeyDown` loops `modesRef.current`, matches via `matchKeyCombo`, calls `applyModeRef.current(mode.id)`; fires before macros; suppressed when any modal open
- [x] Toolbar consolidated — `btn-highlights`, `btn-triggers`, `btn-macros` removed; `btn-automations` + ModeSwitcher added
- [x] `automations.css`, `groups.css`, `mode-switcher.css` — full CSS-var coverage, adapts to all themes
- [ ] Trigger `switchMode` action — deferred; `applyMode` available via GroupsContext, only TriggersPanel UI + `useTriggerEngine` executeAction case remain

---

## Bug Fix Pass — Automations & Right-Click ✅

Bugs identified via thorough code audit; all fixed in one pass.

### Right-Click → Automations Prefill

- [x] `openTriggerEditor` was ignoring its `pattern` argument — `setTriggerPrefillPattern` never called; triggers opened with no prefill
- [x] `AutomationsPanel` render in GameWindow was missing all three prefill props (`highlightPrefill`, `highlightTestText`, `triggerPrefillPattern`) — props existed in state but were never forwarded
- [x] `AutomationsPanel` internal tab used `useState(initialTab)` with no sync — already-open modal ignored `automationsTab` changes from GameWindow; right-clicking "Trigger for X" while highlights tab was active did nothing; fixed with `useEffect(() => setTab(initialTab), [initialTab])`
- [x] Both `HighlightsPanel` and `TriggersPanel` prefill `useEffect` used `[]` dependency — second right-click while panel already open would not re-prefill; fixed `HighlightsPanel` to depend on `prefill?.id` and `TriggersPanel` on `prefillPattern`
- [x] Cross-prefill stale state — `openHighlightEditor` didn't clear `triggerPrefillPattern` and vice versa; old prefill could surface on tab switch; each opener now clears the other's prefill state

### Stale Runtime State While Modal Open

- [x] `HighlightsPanel` called `onSaved?.()` on save/delete/toggle but `AutomationsPanel` never passed `onSaved` to `TriggersPanel` or `MacrosPanel` — trigger/alias/macro saves had no path back to refresh GameWindow state
- [x] `TriggersPanel` had no `onSaved` prop at all — added and wired at all three save sites (save, delete, toggleEnabled)
- [x] `MacrosPanel` had no `onSaved` prop at all — added and wired at all six save sites (saveAlias, deleteAlias, toggleAlias, saveMacro, deleteMacro, toggleMacro)
- [x] `AutomationsPanel` now forwards `onSaved` to all four inline panels (Highlights, Triggers, Macros × 2)
- [x] `GameWindow` passes `onSaved` to `AutomationsPanel` that immediately reloads all four rule sets from localStorage — new highlights render, triggers fire, aliases/macros respond without closing and reopening the modal

---

## Debug Panel — Raw XML Tab ✅

- [x] `raw-xml` IPC channel added — main process sends each raw socket line to renderer before parsing
- [x] `onRawXml` exposed on `window.api` via preload bridge
- [x] Debug panel converted to two-tab layout: **Events** (parsed GameEvent stream) and **Raw XML** (raw pre-parse server lines)
- [x] Tab selector in debug toolbar; Clear button clears whichever tab is active
- [x] Each tab maintains independent scroll/pin state — switching tabs does not lose scroll position
- [x] Capped at 500 lines (same as Events); same auto-scroll/pin behavior
- [x] Works both as the toolbar overlay and when Debug is docked as a panel via PanelFrame

---

## XML Parser Audit & Stream Discovery Overhaul ✅

Full audit of live DR login XML against the parser. All items resolved.

### Completed

- [x] **LichScripts stream** — was hardcoded to `'raw'` (discarded); mapping changed to `'LichScripts'`; content now routes and displays correctly
- [x] **`<d cmd='...'>` clickable links** — `d` removed from `SILENT_TAGS`; `linkCmd` state tracked in parser; `cmd?: string` field added to `TextSegment`; renders as dotted-underline clickable spans in all `StreamPanel` instances; clicking sends the command via `onSendCommand`; `</d>` and prompt boundaries clear `linkCmd`; plain `<d>south</d>` (no `cmd`) renders as plain text unchanged
- [x] **Dynamic stream discovery via `<streamWindow>`** — parser now emits `stream-declare` events (new `GameEvent` type) for every non-`main` `<streamWindow>` tag; ID translated via `STREAM_MAP` before emit so `declare` and `push` always use the same target; `title` attribute captured; streams appear in panel manager at login without waiting for first `<pushStream>`
- [x] **Stream titles** — `title` from `<streamWindow>` stored in `streamTitles` state in `GameWindow`; flows through `sharedFrameProps` → `PanelFrame` → `PanelManager`; all panel labels use server-provided title instead of raw ID capitalization
- [x] **`REPLACE_ON_PUSH` removed** — was a client-side hardcode for `moonwindow` only; replace-vs-append behavior is now entirely XML-driven: producers that want replace send `<clearStream>` before each push (moonwatch, script-watch, experience); producers that want append just push; works for all current and future streams without code changes

### Round 2 — Completed (2026-05-06)

- [x] **`<d>TEXT</d>` without `cmd` attr** — bare exit labels (`<d>south</d>`) and help commands (`<d>NEWS NEXT</d>`) now clickable; `linkCmdIsText` flag in parser; first non-empty text node inside a bare `<d>` becomes the command; clicking sends it via `onSendCommand`
- [x] **`<nav/>` added to `SILENT_TAGS`** — movement frame markers no longer emit `unknown` events in Debug panel
- [x] **`room creatures` + `room extra` wired** — both added to `COMPONENT_STREAM`; route to `room-creatures`/`room-extra` stream targets; `RoomState` gains `creatures` + `extra` fields; `GameWindow` handles the new streams; `RoomPanel` shows "Creatures" and "Extra" sections when non-empty
- [x] **Injuries system** — `<dialogData id="injuries">` parsed: 15 body-part `<image>` tags captured per update; `InjuryUpdateEvent` + `InjuryState` + `BodyPartState` types added; `setInjuryState` in `GameWindow`; new `InjuriesPanel` shows wound sections (Head / Torso / Arms / Legs / Other) color-coded by severity (yellow=light, orange=moderate, red=severe); "Injuries" added as a built-in panel type available in Panel Manager

### Round 3 — Completed (2026-05-06)

- [x] **ExpPanel footer** — `exp rexp/tdp/favor/sleep` now displayed in a pinned footer strip below the scrollable skills body; footer shows `TDP # · Fav # · RXP 35m / 4:01h · Resting/Deep Sleep`; sleep level detected from component text ("deep sleep" = level 2, non-empty = level 1, empty = awake); sleep colors use `--exp-sleep-1` (blue) / `--exp-sleep-2` (purple) in `theme.css`; ExpPanel restructured to `exp-panel-body` (scrolls) + `exp-footer` (pinned)

### Open Items (Backlog)

- [ ] **Settings block + metadata tags emit `unknown` events** — `<mode id="GAME"/>`, `<playerID id='...'>`, and ~20 settings block tag types (`settings`, `presets`, `p`, `macros`, `keys`, `k`, `palette`, `i`, `stream`, `w`, `font`, `cmdline`, `strings`, `names`, `ignores`, `vars`, `scripts`, `dialog`, `builtin`, `panels`, `group`, `toggles`, `s`, `misc`, `m`, `display`, `options`, `o`) all hit the `default` case on every login. Fix: bulk-add to `SILENT_TAGS`
- [ ] **`<app char="Agan">` character name discarded** — `app` tag is silenced but carries the logged-in character name. Fix: emit a `char-name` GameEvent from the `app` tag and display character name in the toolbar
- [x] **Room title Simutronics number stripped** — subtitle `[Room Name - NNNN]` had the trailing ` - NNNN` captured as part of the title, breaking map room matching; `StormFrontParser` now strips `/\s*-\s*\d+\s*$/` from bracket content before emitting `room-title`; `roomId` (from `()`) is unaffected
- [ ] **Injury severity encoding unconfirmed** — no wounded XML sample seen yet; severity inferred from numeric suffix in `name` attr (e.g. `"head1"` = light, `"head3"` = severe); verify against actual combat XML and adjust thresholds if the convention differs

---

## Map System — Automapper ✅

Spatially-aware map visualization panel. Renders DragonRealms Lich XML map files as a navigable SVG map with automatic current-room tracking, cross-zone auto-switching, and BFS pathfinding. Inspired by Genie's Automapper; SVG rendering approach is original.

- [x] **`MapZone`, `MapNode`, `MapArc` types** — added to `shared/types.ts`
- [x] **IPC file system bridge** — `browse-folder`, `list-map-dir`, `read-file` channels in `main.ts`; preload bridge + `global.d.ts` declarations
- [x] **XML parser** — browser `DOMParser` in renderer; parses `<zone>`, `<node>`, `<position>`, `<description>`, `<arc>` elements; note-field alias pipe-splitting
- [x] **SVG map canvas** — pan (drag) + zoom (wheel, passive:false imperative listener); fixed-pixel 10×10px square room markers (size = px/scale so rooms stay constant size on screen regardless of zoom); coordinate system uses XML x/y directly — no y-negation (negative y = north = screen-up, matching Genie convention)
- [x] **Arc rendering** — color-coded lines: cardinal (warm tan), vertical (bright gold), special go-exits (sage green), hidden arcs (amber dashed); one-way detection suppresses duplicate bidirectional lines
- [x] **Current room matching** — `findCurrentNode()` matches `node.name` against room title extracted from `[]` in the game subtitle; description compared after whitespace-normalization (lowercase, collapsed spaces) for day/night variant tolerance; name-only fallback for unique names; Simutronics ` - NNNN` suffix stripped in `StormFrontParser` before matching so it never contaminates the title string
- [x] **Cross-zone index** — all XML files in the selected directory are parsed in the background on folder load; `indexing…` indicator in toolbar; auto-switch effect fires when `roomTitle`, `roomDesc`, `zone`, or `indexing` changes — waits for full index before searching so no missed match on fast room transitions; `selectedPathRef` prevents redundant re-loads
- [x] **Label modes** — None / Short (last comma segment) / Full / Alias (note pipe-split) / ID; dropdown in toolbar; persisted to localStorage; applies immediately (in `useMemo` deps)
- [x] **Z-level floor filter** — floor chips (G, +1, -1, All); auto-switches to current room's floor on zone load and room change
- [x] **Room search** — by name or alias; up to 50 results; click result to pan to it; `searchHitIds` drives green highlight on matching nodes
- [x] **BFS pathfinding + auto-walk** — `bfsPath()` over arc graph; double-click a room to start walking; 600 ms/step command timing; path nodes highlighted gold; Stop button in toolbar cancels; timers cleared on unmount and disconnect
- [x] **Room detail panel** — selected room shows name, aliases (from note field), description excerpt, clickable exit direction chips (each sends the move command), Walk here / Stop button with BFS step count
- [x] **Current room indicators** — animated SMIL pulse ring, inner glow border, crosshair dot; green badge `#nodeId` in toolbar when matched, red `?` with debug tooltip (title, desc excerpt, zones indexed) when unmatched
- [x] **Default zoom** — loads at scale 1.8–2.5 centred on current room (if known); fit-all with 0.5 minimum when no room is known
- [x] **Full-screen overlay** — "Maps" toolbar button opens an overlay window (`map-overlay-backdrop` / `map-overlay-window`); Escape/backdrop click closes; same `MapPanel` with `large` prop
- [x] **Panel tab** — `'map'` panel type in `PanelFrame`; embeddable as a tab alongside other panels
- [x] **Toolbar button wiring** — `btn-map` added to shared selector list in `game.css`; `btn-map--active` state matches Debug/Automations style; duplicate definition removed from `map-panel.css`
- [x] **Dot grid background** — subtle 30-unit dot pattern that pans with the map, giving a cartographic chart feel

### Open Items

- [ ] Exit stubs — draw short cardinal-direction stubs from room edge rather than center-to-center lines (Genie visual convention); deferred
- [ ] Multi-file arc destinations — arcs that link across zone files (destination node lives in a different XML file) are not yet followed by the pathfinder
- [ ] Walk delay configurable — 600 ms/step hardcoded; could be a setting

---

## Phase 9 — Packaging & Distribution
*Not started.*

- [ ] Packaged installer (electron-builder)
- [ ] Auto-update

---

## Backlog

Items removed from active phase scope — too large for current pass, require dedicated planning.

| Item | Notes |
|---|---|
| Full keyboard navigation | Tab through panels, Enter to focus command bar, configurable bindings — touches every component |
| Screen reader / ARIA live regions | Main, room, thoughts panels as live regions; landmark navigation; status bar values as text — requires real screen reader testing (NVDA, JAWS, VoiceOver) |
| HUD widget system (non-compass) — postponed indefinitely (2026-05-21) | Repositionable hands / RT/CT / spell HUD elements + IconBar/VitalsBar redesign. The compass redesign was split off as focused work in v0.7.x; the rest of the widget system is too large for the current pass and not actively prioritized. Revisit only if multiple-element repositioning becomes a clear want. |
| All AI features | Blocked on highlight system (Phase 6) + session capture existing first — see DESIGN.md AI Backlog section |
| Layout Designer | Freeform N×M grid layout system — player defines columns/rows, merges cells, assigns content types (Game Window, streams, Room, Exp, etc.); Game Window cell owns Icon/Vitals/Input bars internally; floating panels as separate OS windows or in-app overlays; snap-to-grid designer mode. Full spec in DESIGN.md Section 12. |
| Multi-Character Support | Inline character tab bar (same toolbar row as Debug/Panels/Theme buttons); each tab shows guild icon + name + health% + status glyphs; full tab state matrix including disconnected with stale state preserved; per-character profiles with encrypted credentials; quick-send overlay (Ctrl+Shift+Enter) to command background characters; pop-out to OS window; per-character layout/theme/history memory. Full spec in DESIGN.md Section 13. |
| Phase 6D — Contact Auto-Detection | Parser detects new player names from arrivals, tells, room players; candidate queue with source context; dismissible add-prompt banner with template picker; session-only ignore list. Deferred — risk of false positives from NPC names/system messages. |
| Trigger switchMode action | `applyMode` wired in GroupsContext; only TriggersPanel action-type UI + `useTriggerEngine` executeAction case remain. Low effort, deferred until trigger polish pass. |
| Wrayth import — Scripts notice | `<scripts>` block is silently ignored; users with Lich scripts in their export get no feedback. Should count scripts and show a "not yet supported" notice in the wizard (same pattern as `substitutionCount` for Genie/Frostbite). |
| Wrayth import — Strings notice | `<strings>` (Wrayth's text substitution rules) are silently ignored. Should count and surface a "not yet supported" notice like Genie's substitutes. |
| Wrayth import — Macro sets 1–9 | Only set 0 (default) is imported. Sets 1–9 are silently dropped. Low impact (usually empty) but should at least count non-empty sets and note the skip. |
| Wrayth import — Presets as theme | `<presets>` block defines text-style roles (roomName, speech, whisper, etc.). When presets have non-skin colors, they could map to a custom theme the same way Genie's `presets.cfg` does. Currently not parsed at all. |
| Wrayth import — Ignores | `<ignores>` block (mute/ignore list) is not parsed. No equivalent feature in Frostborne yet; revisit when an ignore/mute system is added. |
| Frostbite import — bgColor field ignored | `N\bgColor` key in `[TextHighlight]` is never read; parser hardcodes `bgColor: null`. Highlights with a background color set in Frostbite silently lose it on import. |
| Frostbite import — Built-in commands not filtered | `{ReturnOrRepeatLast}`, `{RepeatLast}`, `{RepeatSecondToLast}` in macro actions are not stripped; they get imported as literal commands that the game server ignores. Apply the same built-in filter used for Wrayth macros. |
| Frostbite import — Quoted command strings | INI values like `"advance "` include surrounding quotes that are not stripped after `$n` removal. Resulting command sent to game includes the quotes. |
| Frostbite import — `[AlertHighlight]` silent drop | Health/stun threshold alerts (`health\value=60`, `health\file=recycle.wav`, `stun\file=ding.wav`) are not parsed and give no user feedback. No direct equivalent in Frostborne yet — should count and surface as unsupported rather than silently ignoring. |
| Frostbite import — `[GeneralHighlight]` as theme | Named color roles (`a_roomName`, `d_speech`, `e_whisper`, `f_thinking`, `c_damage`, etc.) map directly to Frostborne theme variables. Could generate a "Imported from Frostbite" custom theme the same way Genie's `presets.cfg` does. Currently not parsed at all. |
| Frostbite import — `general.ini` not offered | `general.ini` is not a file slot in the wizard. Contains `[GameWindow]`/`[DockWindow]`/`[Commandline]` bg+font colors (same `@Variant` format) that could feed the theme import, and `[QuickButton]` command buttons that could surface as unsupported. |
| Genie import — All-internal macros silently dropped | Macros whose every command is Genie-internal (`#clear`, `#mapper`, `#window`, `#script`, etc.) are skipped with no user feedback after internal-command filtering leaves `commands.length === 0`. Should surface as an unsupported count. |
| Genie import — `$variable` references not flagged | Macros like `{F9} {whisper $whisper @}` import as `ready` but send the literal string `$whisper` to the game. Should be flagged `partial` when a `$` token is detected in a command. |
| Genie import — `@` target placeholder not flagged | `{F1} {look @}`, `{F5} {assess @}`, etc. import as `ready` but Genie substitutes the current target at runtime; Frostborne sends a literal `@`. Should be flagged `partial` to warn the user. |
| Genie import — `#if`/`#class`/`#event`-only triggers silently dropped | Triggers whose only actions are unsupported (`#if`, `#class on/off`, `#event`) are skipped entirely when `hasAny = false`, with no user feedback. Should surface as unsupported rather than vanishing. |
| Genie import — Named sounds in `#play` marked `ready` | `#play Alteration`, `#play MiniFanfare1`, `#play Error`, etc. are Genie internal sound library names, not file paths. Stored as `soundFiles` and marked `ready` but Frostborne cannot locate them. Should be `partial` with a note that the path needs updating. |
| Genie import — `gags.cfg` not offered | Genie gag rules suppress matching lines of text. Not offered as a file slot. No Frostborne equivalent yet — should be offered, counted, and shown as unsupported so users know their gags were not imported. |
| Genie import — `variables.cfg` not offered | Genie variables (`$whisper`, `$charactername`, `$partner`, etc.) are referenced in macros and triggers but `variables.cfg` is never surfaced. No Frostborne equivalent — should be offered, counted, and noted as unsupported so users understand why `$var` macros behave differently after import. |

---

## Product Philosophy — Lich-Forward Client

> **Lichborne's identity: the best display and configuration layer for Lich users. Everything you see, hear, and feel. Everything you do belongs in a script.**

Decided 2026-05-12 after full audit of Lich5 internals and comparison against Genie/Wrayth/Frostbite import gaps.

### What Lich already owns — don't duplicate

Lich5 provides a complete automation stack that no client should try to replicate:

- **DownstreamHook** — intercepts and rewrites ALL game text before the client sees it (`textsubs.lic` runs here; client-side substitution would be redundant and would operate on already-transformed text)
- **UpstreamHook** — intercepts all outbound commands before they reach the game (`alias.lic` runs here)
- **WatchFor** — pattern-matching triggers inside scripts with full Ruby behind them; vastly more capable than any client trigger
- **Vars / UserVars** — per-character SQLite variable storage; scripts depend on this; no client equivalent needed
- **Full game state model** — `DRRoom`, `DRStats`, `DRSpells`, `DRSkill`, `DRBanking` etc.; Lich parses and owns this
- **Script orchestration** — 180+ scripts covering training, combat, crafting, healing, loot, navigation, economy, multi-char, AI
- **YAML profile system** — per-character automation config (`Sekmeht-setup.yaml` etc.); drives the entire script stack

### What Lichborne owns — go deep here

| Layer | Features |
|---|---|
| **Rendering** | Text highlighting, name styling, themes, fonts, density, panel layout, stream routing, stream timestamps |
| **Display panels** | Vitals bars, exp panel, room panel, injuries panel, map visualization, script output streams |
| **Connection** | Auth, Lich process launch, command input, key bindings, command echo, graceful disconnect |
| **Configuration** | Display profiles (separate from Lich's script YAML), import wizard (display prefs migration) |
| **Sound/alerts** | Always-on sound triggers and visual alerts — independent of any running Lich script |

### The gray zone — keep thin, freeze scope

| Feature | Keep? | Constraint |
|---|---|---|
| Simple aliases | Yes | Single-command expansions only. No `$variables`, no chaining. Don't expand further. |
| Simple triggers | Yes | Sound, flash, echo-to-stream only. No conditional logic, no state, no variables. Don't expand further. |
| Key bindings / macros | Yes | Send-command-on-keypress. Warn on `$variable` refs and `@` placeholders at import. |
| Import wizard | Yes | Migration tool for display preferences. Reframe: imports highlights/names/keys/theme. Everything else gets a "belongs in Lich" notice. |

### Won't build — ever

These features belong to Lich. Building them in the client creates maintenance debt, confuses the product identity, and will always be worse than the Lich equivalent.

| Feature | Why Lich owns it |
|---|---|
| Client-side variables | Lich's `Vars` system is per-character, SQLite-backed, accessible to all scripts |
| Text substitution / gags | `textsubs.lic` runs as a DownstreamHook — the client sees already-transformed text |
| Conditional trigger logic (`#if`, state, chaining) | WatchFor in a script has full Ruby; client logic will always be a worse version |
| Training automation | `t2.lic` and family |
| Combat automation | `stabbity.lic` and family |
| Crafting automation | 15+ dedicated scripts |
| Healing automation | `tendme.lic`, `tendother.lic`, `first-aid.lic` |
| Loot / inventory management | `sell-loot.lic`, `sorter.lic`, `rummage.lic` |
| Navigation / pathfinding | Map data + `find.lic`, `automap.lic` |
| Group management | `buff.lic`, `coordinator.lic` |
| Economy / banking | `bankbot.lic`, `crowns.lic` |
| Discord / webhook integration | `beakon.lic` and family |
| Multi-character coordination | `nw-monitor.lic`, `coordinator.lic` |
| AI / LLM integration | `aichar.lic`, OpenAI key management in Lich data |

### Import wizard reframe

The import wizard's job is: **bring your display preferences from another client into Lichborne, and tell you what to do with the rest.**

| Data type | Import action |
|---|---|
| Highlights | ✅ Import fully |
| Names / contacts | ✅ Import fully |
| Macros / key bindings | ✅ Import; flag `$variable` refs and `@` as partial |
| Presets → theme | ✅ Import fully |
| Display triggers (sound / flash / echo) | ✅ Import |
| Simple aliases (no `$vars`) | ✅ Import |
| Complex triggers (logic, conditionals) | ⚠️ Import display actions only; note "logic belongs in a Lich WatchFor" |
| Aliases / macros with `$variables` | ⚠️ Import as partial; note "variables won't resolve — move to a Lich script" |
| Lich scripts (`<scripts>` in Wrayth) | ⚠️ Count and surface; "these run in Lich, not the client" |
| Variables | ⚠️ Count only; "these live in Lich's Vars system" |
| Substitutions / gags | ⚠️ Count only; "use textsubs.lic — this is a DownstreamHook" |

---

## Lich Collaboration Layer — Future Investment

This is where Lichborne earns its identity. Nobody has built a proper Lich dashboard. These features surface Lich's state in the client UI rather than duplicating Lich's automation.

| Feature | Description | Priority |
|---|---|---|
| **Active scripts panel** | Show running scripts per character — name, uptime, pause/abort controls. Reads from Lich's script manager via the existing socket connection. | High |
| **Script log panel** | Dedicated panel for Lich `echo` output distinct from game text; distinguishable per-script coloring. Already partially works via custom streams — needs first-class treatment. | High |
| **YAML profile viewer / editor** | Browse and edit per-character Lich YAML config files (`Sekmeht-setup.yaml` etc.) from within the client. Read path via configured Lich script dir; write with confirmation. | Medium |
| **Lich variable inspector** | Read-only view of `Vars` / `UserVars` from Lich's SQLite database for the connected character. Helps users debug why a script behaves differently. | Medium |
| **DownstreamHook registry** | Show which hooks are active and which scripts registered them — helps diagnose stream conflicts and unexpected text transforms. | Low |
| **Script start from client** | Buttons or command palette to launch common scripts (`.t2`, `.buff`, `.tend`) without typing. Requires Lich IPC or upstream command injection. | Low |

---

## Lich-Primary Roadmap

> Comprehensive phased plan from v0.1.x to a true Lich-primary display client. See DESIGN.md Sections 24–25 for the full architecture and rewrite analysis that drives these decisions.
>
> **North star:** Lichborne is the best display and configuration layer for Lich users. Stop where Lich begins.

---

### Release A — "Honest Client" (v0.2) ✅
**Theme: Stop pretending, start clarifying. No new features — reframe what we already have.**

Estimated effort: ~1 dev day across 6 files. All changes are mechanical parser fixes and UI copy updates — no new architecture, no new dependencies.

---

#### `src/renderer/import/types.ts` — New count fields on ImportResult

`ImportResult` needs new optional fields for everything that gets counted but not imported. These feed the "Belongs in Lich" section on the confirm screen.

- [x] Add `alertHighlightCount?: number` — Frostbite `[AlertHighlight]` entries (health/stun thresholds)
- [x] Add `gagsCount?: number` — Genie `gags.cfg` line count
- [x] Add `variablesCount?: number` — Genie `variables.cfg` entry count
- [x] Add `scriptsCount?: number` — Wrayth `<scripts>` block entry count
- [x] Add `stringsCount?: number` — Wrayth `<strings>` substitution rule count
- [x] Add `skippedMacroSetsCount?: number` — Wrayth non-empty macro sets 1–9

---

#### `src/renderer/import/parsers/frostbite.ts` — Parser fixes

**bgColor ignored** (`parseHighlights()`, line 87)
`bgColor: null` is hardcoded. The `N\bgColor` key is never read. Fix: read `section[\`${i}\\bgColor\`]` and run through `parseFrostbiteColor()`.
- [x] Read `N\bgColor` from `[TextHighlight]` and decode with `parseFrostbiteColor()`

**Built-in commands not filtered** (`parseMacros()`, lines 129–137)
`{ReturnOrRepeatLast}`, `{RepeatLast}`, `{RepeatSecondToLast}` survive `$n` stripping and enter `commands[]` as literal strings the server will reject. Actual macros.ini has entries like `553648133={ReturnOrRepeatLast}$n`.
Fix: add a `FROSTBITE_BUILTIN` Set (same pattern as `WRAYTH_BUILTIN` in wrayth.ts); detect before pushing to `commands[]`; set status `partial` if any were removed.
- [x] Add `FROSTBITE_BUILTIN` Set and filter built-in command strings in `parseMacros()`

**Quoted command strings** (`parseMacros()`, lines 129–131)
`general.ini` has `36108929="advance "`. After `$n` stripping the surrounding quotes survive.
Fix: add `.replace(/^"|"$/g, '')` to the command cleanup chain.
- [x] Strip surrounding double-quotes from command strings

**`[AlertHighlight]` silently dropped**
Section is never touched — no count, no user notice.
Fix: add `countAlertHighlights(ini)` reading the `size` key from `[AlertHighlight]`; return as `alertHighlightCount` in `parseFrostbiteFiles()`.
- [x] Add `countAlertHighlights()` and return `alertHighlightCount`

**`[GeneralHighlight]` not parsed**
Has named color roles (`a_roomName`, `d_speech`, `e_whisper`, `f_thinking`, `c_damage`, etc.) that map directly to Lichborne CSS vars — same concept as Genie's `presets.cfg → themeVars` path.
Fix: add `parseGeneralHighlightTheme(ini)` with a CSS var mapping table; return `themeVars` from `parseFrostbiteFiles()`.
- [x] Add `parseGeneralHighlightTheme()` mapping color roles to CSS vars; return `themeVars`

**`general.ini` not offered**
Fix: needs to be handled in `parseFrostbiteFiles()` — read `[QuickButton]` (count as unsupported) and `[GameWindow]`/`[DockWindow]` bg colors (feed into theme).
- [x] Parse `general.ini` for `[GameWindow]` bg colors (→ theme) and `[QuickButton]` (→ unsupported count)

---

#### `src/renderer/import/parsers/genie.ts` — Parser fixes

**All-internal macros silently dropped** (`parseMacros()`, lines 165–167)
`if (commands.length === 0) continue` — macros whose every command is Genie-internal (`#clear`, `#mapper`, `#window`, `#script`) vanish with no user feedback.
Fix: replace `continue` with an `unsupported` push: `"All commands are Genie-internal — nothing to import"`.
- [x] When `commands.length === 0` after filtering, push `unsupported` entry instead of silently dropping

**`$variable` references not flagged** (`parseMacros()` and `parseAliases()`, post-split)
`splitAction()` filters `#`-prefixed commands but does not scan for `$`. A macro like `{F9} {whisper $whisper @}` imports as `ready`. Fix: after building `commands[]`, check `commands.some(c => c.includes('$'))` → status `partial`, note `"Variable references won't resolve — move to a Lich script"`. Apply to both macros and aliases.
- [x] Detect `$` in macro commands → `partial` with Lich note
- [x] Detect `$` in alias commands → `partial` with Lich note

**`@` target placeholder not flagged** (`parseMacros()` and `parseAliases()`)
Unlike Frostbite, the Genie parser does NOT strip `@` — it passes through to the game as a literal character. Fix: check `commands.some(c => c.includes('@'))` → `partial`, note `"@ target placeholder won't resolve — move to a Lich alias"`. Apply to both macros and aliases. Note: may coexist with `$` flag on the same item.
- [x] Detect `@` in macro commands → `partial` with Lich note
- [x] Detect `@` in alias commands → `partial` with Lich note

**`#if`/`#class`/`#event`-only triggers silently dropped** (`parseTriggers()`, lines 376–379)
`if (!hasAny) continue` — triggers whose only actions are unsupported disappear.
Fix: when `!hasAny && dropped.length > 0`, push `unsupported` entry listing the dropped action types.
- [x] When `!hasAny` after filtering, push `unsupported` entry instead of silently dropping

**Named Genie library sounds marked `ready`** (`parseActionParts()`, lines 318–320)
`#play Alteration`, `#play MiniFanfare1`, `#play Error` are Genie built-in sound library names with no file extension or path separator. They're stored in `soundFiles[]` and become `ready` trigger sound actions that will fail at playback.
Fix: in `parseActionParts()`, distinguish file paths (contains `/`, `\`, or a known audio extension) from Genie library names — flag the latter as `partial` with note `"Genie library sound — update path after import"`.
- [x] Detect Genie library sound names (no path/extension) in `#play` and flag as `partial`

**`gags.cfg` and `variables.cfg` not offered** (`parseGenieFiles()`)
Neither appears in `GENIE_SLOTS`. Fix: count `#gag` lines → `gagsCount`; count entries in `variables.cfg` → `variablesCount`. (File slot changes are in ImportWizard.tsx.)
- [x] Count `#gag` lines from `gags.cfg` content → `gagsCount`
- [x] Count variable entries from `variables.cfg` content → `variablesCount`

---

#### `src/renderer/import/parsers/wrayth.ts` — Parser fixes

**`<scripts>` block not counted** (`parseWraythXml()`, line 200)
`substitutionCount: 0` is hardcoded — the `<scripts>` block is never inspected.
Fix: add `countWraythBlock(xml, 'scripts')` counting `<i>` tags inside the block; return as `scriptsCount`.
- [x] Add `countWraythBlock()` helper; return `scriptsCount` for `<scripts>` block

**`<strings>` block not counted**
Same gap — Wrayth's text substitution rules live here.
Fix: reuse `countWraythBlock(xml, 'strings')`; return as `stringsCount`.
- [x] Return `stringsCount` for `<strings>` block

**Macro sets 1–9 not flagged** (`parseMacros()`, line 155)
Only `id="0"` is matched. Sets 1–9 are silently skipped.
Fix: after parsing set 0, scan for `<keys id="[1-9]">` blocks and sum their `<k>` entry counts; return as `skippedMacroSetsCount`.
- [x] Scan sets 1–9 for non-empty entries; return `skippedMacroSetsCount`

**`<presets>` block not parsed**
Wrayth defines named color roles in `<presets>` similar to Genie's `#preset` lines.
Fix: add `parseWraythPresets(xml, palette)` — needs a real Wrayth XML export with a populated `<presets>` block to confirm the attribute names. Blocked on a sample with presets. Return `themeVars` when colors are present.
- [ ] Add `parseWraythPresets()` mapping preset color roles to CSS vars *(blocked on Wrayth export sample with presets)*

---

#### `src/renderer/components/ImportWizard.tsx` — UI changes

**File slots missing** (lines 64–78)
- [x] Add `{ key: 'gags', label: 'gags.cfg', hint: 'Gag rules (counted, not imported)' }` to `GENIE_SLOTS`
- [x] Add `{ key: 'variables', label: 'variables.cfg', hint: 'Variables (counted, not imported)' }` to `GENIE_SLOTS`
- [x] Add `{ key: 'general', label: 'general.ini', hint: 'Window colors and quick buttons' }` to `FROSTBITE_SLOTS`

**Parse call for new Genie files** (`parse()`, lines 134–142)
- [x] Pass `gags: fileTexts['gags']` and `variables: fileTexts['variables']` into `parseGenieFiles()`
- [x] Pass `general: fileTexts['general']` into `parseFrostbiteFiles()`

**Step 1 — no import scope disclaimer** (`renderStep1()`)
Currently jumps straight to source/file selection. Users with 73 Genie triggers expect them all to come over.
- [x] Add a notice below the source cards: "Lichborne imports display preferences — highlights, colors, key bindings, and themes. Variables, substitutions, and complex automation belong in Lich."

**Substitution notice copy is generic** (`renderStep2()`, lines 652–657)
Currently: "text substitution is not yet supported in Frostborne and will be available in a future update."
- [x] Update copy to: "Use `textsubs.lic` — Lich rewrites game text before Lichborne sees it. Client-side substitution would be redundant."
- [x] Show this notice for gags and variables too (when counts > 0)

**Step 3 confirm screen has no "Belongs in Lich" section** (`renderStep3()`, lines 664–705)
Only shows "Migrated" item counts. Users never see what was counted but not imported.
- [x] Add a second table below the merge options: "The following belong in Lich" with rows for each non-zero count field (`scriptsCount`, `stringsCount`, `substitutionCount`, `alertHighlightCount`, `gagsCount`, `variablesCount`, `skippedMacroSetsCount`)
- [x] Each row shows the count and a one-line explanation: scripts → "Run in Lich, not the client"; substitutions/strings/gags → "Use `textsubs.lic`"; variables → "Lich's Vars system already holds these"; alertHighlights → "Health/stun thresholds — no Lichborne equivalent yet"
- [x] Style this section as greyed-out / dimmed (distinct from the "Migrated" table)

**Theme name hardcoded to "Genie"** (lines 226, 414)
`createCustomThemeFrom(classicTheme, 'Imported from Genie')` and the UI label both say "Genie" regardless of source.
- [x] Make theme name dynamic: `` `Imported from ${source.charAt(0).toUpperCase() + source.slice(1)}` ``
- [x] Update theme checkbox label to match the dynamic name

---

#### `src/renderer/components/AutomationsPanel.tsx` — Reframe

**"Groups & Modes" tab implies automation ownership** (lines 31–37)
- [x] Rename tab label from `"Groups & Modes"` to `"Groups"`
- [x] Add a notice at the top of `GroupsModesTab`: "Groups control which display rules are active. Complex automation (variables, triggers with logic, substitution) belongs in a Lich script."

---

#### Release A — Effort Summary

| File | Changes | Est. |
|------|---------|------|
| `src/renderer/import/types.ts` | 6 new optional count fields | 20 min |
| `src/renderer/import/parsers/frostbite.ts` | bgColor, built-in filter, quote strip, AlertHighlight count, GeneralHighlight → theme, general.ini | ~3 hr |
| `src/renderer/import/parsers/genie.ts` | All-internal macro/trigger counts, `$var` flag, `@` flag, named sound flag, gags/variables count | ~2 hr |
| `src/renderer/import/parsers/wrayth.ts` | scripts count, strings count, macro set 1–9 count, presets → theme | ~1.5 hr |
| `src/renderer/components/ImportWizard.tsx` | New file slots, new parse calls, Step 1 disclaimer, substitution copy, "Belongs in Lich" confirm section, dynamic theme name | ~2.5 hr |
| `src/renderer/components/AutomationsPanel.tsx` | Tab rename, Groups notice | 20 min |

**Total: ~1 dev day.** No new dependencies. No new IPC. No architecture changes. One open dependency: Wrayth `<presets>` parsing requires a Wrayth export with populated presets to confirm attribute names.

#### Release A — Post-release fixes (found during testing)

- **B41 — Wrayth `\x`-prefixed client commands imported as READY** (`wrayth.ts`): `xml toggle containers` and `xml toggle dialogs` use the same `\x` direction prefix as movement commands. `isBuiltinAction` was called before `\x` stripping, so the prefix prevented matching. Fix: strip `\x` first, then check builtin. Also fixed `{BufferTop}`/`{BufferBottom}` — set had `bufftop`/`buffbottom` but braced name extracts to `BufferTop`/`BufferBottom`. Added `WRAYTH_PLAIN_BUILTIN` set for plain-text client commands.
- **Empty file shows "Not loaded"** (`ImportWizard.tsx`): `fileTexts[slot.key]` truthiness check fails for empty files (e.g. `gags.cfg` with no rules). Fixed to `slot.key in fileTexts`.

---

### Release B — "Lich Visibility" (v0.3) ✅
**Theme: See into Lich from the client for the first time. File system reads only — no new dependencies.**

#### Lich JSON Map System *(exceeded original scope — replaced XML auto-detect)*
- [x] Discovered that Lich uses `data/DR/map-*.json` (not XML) as its primary map database
- [x] `find-lich-map-file` IPC handler: finds the most recently modified `map-*.json` in `data/DR/` and returns its path + `maps/` image directory
- [x] `read-map-image` IPC handler: reads map image files (GIF/PNG) as base64 for renderer
- [x] MapPanel fully rewritten — loads 13MB JSON once, builds title/image/room indexes in renderer
- [x] Rooms matched by title + description (same normalized approach as XML maps; Simutronics room# is unrelated to Lich IDs)
- [x] Renders actual Lich map images (GIF/PNG from `maps/`) with SVG overlay rects for rooms
- [x] Current room highlighted green with pulse animation; adjacent rooms amber; selected blue
- [x] Pan/zoom (wheel + drag), re-centers on current room automatically on zone change
- [x] Room detail panel: title, description, exits (clickable), BFS walk button
- [x] Search: type-ahead across all 18 000+ rooms by title
- [x] Zero configuration for the user — auto-derives from `lichPath` in Advanced Settings

#### Script Browser Panel
- [x] `list-lich-scripts` IPC handler: scans `scripts/custom/` (custom) then `scripts/` (core) for `.lic` files with mtime
- [x] Scripts modal: searchable, filter tabs (All / Custom / Core), last-modified date
- [x] Clicking a script puts `;scriptname` in the command bar via `setCommand` state (not direct DOM write)
- [x] Source badge: custom = accent color, core = dimmed

#### YAML Profile Viewer
- [x] `list-lich-profiles` IPC handler: lists `.yaml`/`.yml` files from `scripts/profiles/`
- [x] Profiles modal: left panel = profile list, right panel = read-only YAML with syntax highlighting
- [x] Syntax highlighting: keys (blue), strings (green), booleans/numbers (orange), comments (dimmed)
- [x] No write access in this release

#### Hybrid Map System — Graph View (Phase 1: Zone-by-Zone) ✅
- [x] Split MapPanel into three files: `MapPanel.tsx` (shared state + toolbar), `MapImageView.tsx` (extracted current renderer), `MapGraphView.tsx` (new graph renderer)
- [x] Genie maps folder picker in map panel toolbar (graph mode only); stored in `_shared.yaml` via profile system
- [x] Load + index all Genie XML zone files: `Map<zoneName, GenieZone>` with nodes, positions, colors, notes
- [x] Cross-reference builder: match Lich rooms to Genie nodes by title → description → zone-prefix alias; produce `Map<lichId, GenieAugment>` (genieId, zoneName, x, y, z, color, note)
- [x] Orphan tracking: Genie nodes with no Lich match kept as `Map<zoneName, GenieNode[]>` — shown as dashed `?` nodes in graph view
- [x] View mode toggle in toolbar: `Image` / `Graph`; persisted to localStorage
- [x] Graph renderer: SVG node graph using Genie `(x, y)` positions; arc lines from Lich `wayto` edges; cross-zone exits marked with amber ◆ diamond; zone auto-switch on room change
- [x] Node styling: Genie color for matched rooms; dashed border + `?` badge for orphan Genie nodes; current room pulse; adjacent rooms amber; selected blue
- [x] Graph mode navigation: click = select + show detail; BFS walk via Lich `wayto`
- [x] Room detail panel in graph mode: Lich title, description, exits, Lich ID, zone badge, cross-zone connections section, walk button; follows player on move

#### Hybrid Map System — World Stitching (Phase 2)
- [ ] Zone offset algorithm: BFS from "The Crossing" as world origin `(0,0)`; compute each zone's global offset from cross-zone Lich `wayto` edges; average conflicting offsets weighted by connection count
- [ ] Isolated zones (no cross-zone Lich connections): placed in a labeled grid off to the side of the main world
- [ ] World view toggle (sub-mode of Graph): renders all zones in single SVG coordinate space using `zone.globalOffset + node.localPos`
- [ ] Viewport culling: only render nodes within current SVG viewport bounds (performance for 18k+ nodes)
- [ ] Zone label overlays at zone centroids (faint, non-interactive)
- [ ] Seamless travel: camera pans continuously, no zone-switch flash

#### Release B — Post-release fixes
- [x] B41: `onSendCommand` in LichScriptsPanel was writing to `inputRef.current.value` (bypassed React controlled input) — fixed to call `setCommand(cmd)` instead

---

### Release C — "Lich Dashboard" (v0.4)
**Theme: Real-time Lich state surfaced in the UI. The LichBridge module is introduced.**
**Constraint: No dependency on community-maintained Lich scripts. Uses Lich core commands and SQLite directly.**
**Full spec: DESIGN.md §26.**

#### Pre-Release C — IPC Pipeline ✅
- [x] `scheduleFlush()` in `main.ts` — `setImmediate` batch coalesces all events from one TCP read into a single `webContents.send` (was one per line)
- [x] `raw-xml` channel gated: only sent when `debugPanelOpen === true`; renderer signals main via `debug-panel-toggle` IPC on Debug panel open/close
- [x] `UnknownEvent` filtered in main before IPC — never crosses the boundary during normal play
- [x] DESIGN.md §2.12 added documenting the full IPC dispatch pipeline

#### LichBridge Module (main process) — `src/main/lichbridge/` ✅
- [x] `index.ts` — module assembly, registers all Lich-specific IPC handlers; strict `SCRIPT_LIST_RE` only intercepts `;listall` response format — free-form `--- Lich:` messages pass through to game window
- [x] `commandInjector.ts` — typed wrappers: `pauseScript(name)` → `;pause name`, `killScript(name)` → `;kill name`, `startScript(name, args?)` → `;name [args]`, `pollScriptList()` → `;listall`
- [ ] `sqliteReader.ts` — deferred to Release D
- [ ] `fileReader.ts` consolidation — deferred to Release D
- [ ] `better-sqlite3` dependency — deferred to Release D

#### Script List Polling — `src/renderer/hooks/useLichBridge.ts` ✅
- [x] `useLichBridge()` hook: pushes `;listall` every 5 seconds while connected; subscribes to `lich:scripts-update` push events from main
- [x] `pendingRef` flag + 3s timeout guard; `pending` state exposed for spinner
- [x] Exposes `scripts: ScriptRecord[]`, `pauseScript`, `resumeScript`, `killScript`, `refresh`, `lastUpdated`
- [x] `ScriptRecord` type: `{ name, paused, custom, firstSeen, killing? }` in `shared/types.ts`
- [x] `firstSeenRef` + `lastSeenRef` + `lastKnownRef` Maps; 8s linger window absorbs T2-style transient restarts; scripts in `killingRef` bypass linger and evict immediately on confirmed exit
- [x] `killingRef` set on kill action — optimistic `killing` state before next poll; evicted immediately when next poll confirms gone (does not re-appear as "running" for linger duration)
- [x] Script list sorted newest-first by `firstSeen` — most recently started script at top
- [x] `custom` flag from `list-lich-scripts` IPC cross-reference

#### `;listall` Response Interception — `src/main/lichbridge/index.ts` ✅
- [x] `LichBridge.interceptLine()` called before `parser.parse()` in `main.ts` line handler
- [x] Strict regex matches only exact `;listall` format (`no active scripts` or comma-separated names with optional `(paused)`); all other `--- Lich:` messages return `true` and fall through
- [x] Parsed entries pushed via `win.webContents.send('lich:scripts-update', entries)`

#### Active Scripts Panel — `src/renderer/components/ScriptListPanel.tsx` ✅
- [x] Panel type `'lichScripts'` registered in `PanelFrame` catalog
- [x] Columns: type badge (`C` amber for custom, `▶` dim for core), script name, status (`running` green / `paused` amber / `killing` red), uptime (`mm:ss` / `h:mm:ss` from `firstSeen`), Pause/Resume/Kill buttons
- [x] Kill button shows inline "Kill? Yes / No" confirmation; dismisses on outside click
- [x] Footer: "N scripts · updated Xs ago · polls every 5s"
- [x] Empty state: "No scripts running. Use `;scriptname` to start one."
- [x] Unavailable state: "Script list unavailable — connect via Lich to see running scripts."
- [x] `killing` status indicator — optimistic UI update on kill click, row dims to 50% opacity

#### Script Palette — toolbar strip ✅
- [x] `script-palette` strip in game toolbar; hidden when `scriptPalette` array is empty
- [x] Each button: `{ label: string; command: string }` — command sent verbatim via `send-command` IPC
- [x] `scriptPalette` state in `GameWindow`; persisted to `lichborne.scriptPalette` localStorage key
- [ ] Palette editor (gear icon modal) — deferred
- [ ] Overflow `[+N ▼]` dropdown — deferred

#### Lich Settings Viewer — deferred to Release D
- [ ] `get-lich-settings` IPC handler
- [ ] Collapsible viewer in Settings panel; read-only, searchable
- [ ] Graceful fallback when `lich.db3` not found

#### Session Awareness — deferred to Release D
- [ ] `get-lich-sessions` IPC handler
- [ ] Multi-session toolbar chip
- [ ] Graceful fallback when table absent

---

### Release D — "Deep Lich" (v0.5) ✅

#### SQLite Foundation ✅
- [x] `better-sqlite3` v11 added to dependencies; rebuilt against Electron 31 ABI via `@electron/rebuild`; marked `external` in `build-main.mjs`
- [x] `src/main/lichbridge/marshalParser.ts` — full Ruby Marshal BLOB deserializer: nil/bool/Fixnum/Bignum/Float/String/Array/Hash/Symbol/Symlink/I-annotated/Regexp/Object/UserDefined/MarshalObject/extended/Data/object-link; signed fixnum byte fix; Ruby Time binary decoding (little-endian, new format bit-field extraction + old epoch format)
- [x] `src/main/lichbridge/sqliteReader.ts` — IPC handlers: `lich:get-vars`, `lich:get-settings`, `lich:get-sessions`; correct column names (`hash`, `name`, `session_name`, `game_code`); read-only WAL-mode open; lazy `require('better-sqlite3')`
- [x] Preload + `global.d.ts` updated with `lichGetVars`, `lichGetSettings`, `lichGetSessions`, `lichDbInfo`

#### Lich Dashboard Shell ✅
- [x] `LichDashboard.tsx` — unified 4-tab modal (Scripts / Variables / Settings / Profiles) replacing `LichScriptsPanel` + `LichProfileModal`
- [x] Toolbar: single "Lich" button with `btn-lich-dash` + `--active` state; `game.css` updated
- [x] `SessionPill` — queries `session_summary_state` (heartbeat < 60s, state ≠ exited); green dot when live; matches on `session_name` + `game_code`

#### Variables Tab ✅
- [x] Scope dropdown (all scopes from DB); pre-selects `GAME:CharName`; search by key; refresh button
- [x] Recursive `VarValue` component — null/bool/num/str color-coded; arrays and objects collapsible with `▾/▸`; depth-0 expanded by default

#### Settings Tab ✅
- [x] Feature flags section (prefix stripped, ON/OFF badge) + System settings section (key/value table); search filter across both

#### YAML Profile Editor ✅
- [x] Raw textarea editor with `highlight.js` syntax highlighting in view mode (VS Code dark+ palette: keys #9cdcfe, comments #6a9955 italic, booleans #569cd6, strings #ce9178, numbers #b5cea8)
- [x] Line number gutter (synchronized scroll) in both preview and edit modes
- [x] `combat_teaching_skill` quick-edit field extracted from live buffer via regex; syncs bidirectionally with textarea
- [x] LCS diff algorithm (Uint16Array DP table, 4000-line threshold) with context-only view (3 lines) and "Show all lines" toggle
- [x] Diff overlay: full file path, `+` green / `−` red / space unchanged lines, collapsed hunks with line count
- [x] YAML validation via `js-yaml` (`loadAll`): dismissable banner with line number on error, green "valid" on success; works in both view and edit mode
- [x] `write-lich-profile` IPC handler with path-traversal guard; CRLF → LF normalization on load
- [x] File list locks during edit; Cancel discards; Go Back returns to editor from diff

#### Richer Highlight Engine
- [ ] Named highlight groups (Combat, Magic, RP, Navigation, Custom) — group-level enable/disable toggle
- [ ] Live test input — type a sample line; see which rules match and how the line renders
- [ ] Highlight set export/import — save as named JSON file; share or restore
- [ ] Priority/ordering — drag to reorder rules within a group; first-match vs. all-match mode per group

---

### Release E — "Character Awareness" (v0.6)
**Theme: The client knows your character. Uses data the XML parser already provides.**

#### Exp Panel — Badging, Focus Filter & Learning Bars ✅
- [x] `focusTemplates.ts` — full skillset data for all 12 DR guilds; `getSkillBadge()`, `getSkillSortPriority()`, `GUILD_SKILLSET_ORDER`
- [x] Badging/Focus control bar — guild picker sets `focus`; P/S/T/G badge overlays on each skill name
- [x] FocusMode filter — `none|primary|secondary|tertiary` filters the Learning section by skillset tier
- [x] Sort picker — Alphabetical / Guild-Order / Rank / Learning Rate; sort direction toggle; stored in `localStorage`
- [x] Learning rate bars — 3px progress bar below each skill row; fill = `mindstateIdx/34`; color-coded: low (1–8, green `--exp-bar-low`), mid (9–20, amber `--exp-bar-mid`), high (21–33, orange `--exp-bar-high`), locked (34, red `--exp-bar-locked`)
- [x] `(X/34)` fraction as 7th column — matches native game output format `understanding (14/34)`
- [x] Bar color CSS variables in `darkBase`; all themes inherit; per-theme override possible
- [x] `ExpProfile` interface in `profile-types.ts`; stored under `layout.exp` in `CharacterName.yaml`; full round-trip persisted
- [x] B55/B56/B57 — sort default Z-A bug fixed; badging + pin changes now trigger `scheduleProfileSave`

#### Character-Aware Panels — deferred / dropped
- ~~Race-aware injury display~~ — **deferred**: XML already sends the body-part names (Skin, Tail, etc.) so the existing `InjuriesPanel` renders them correctly without race plumbing. Only fix needed is the per-section grouping table if testers report Skin/Tail falling into "Other" weirdly
- Guild-aware spell slot display — **moved to Release E3** (designer has bigger ideas for the Alteration circle UI specifically)
- ~~Room panel guild-specific NPC styling~~ — **dropped**: original spec was vague; Contacts system already covers most of what was intended (player name tagging with colors). Will revisit only if a concrete tester report comes in

#### Session Log — full spec in DESIGN.md §28
- [ ] Capture pipeline + buffered file writer (main process) — append per-event from `GameWindow.onGameEvent`; flush every 1s or 100 records
- [ ] Per-character daily log files at `Logs/{character}/{character}_YYYY-MM-DD.log` (plain text, `[timestamp][stream] text` prefix)
- [ ] Per-stream capture toggles in Settings (per-character; main / streams / script-echo / sys / trigger-fires)
- [ ] Retention pruner — default 30 days, configurable per-character; optional compression toggle for logs older than 7 days
- [ ] Recent Tail modal — last ~200 lines of current session, paginated, multi-select stream filter with preset layer buttons (Everything / Combat / Social / Quiet), dedup toggle
- [ ] Quick Search modal — substring or regex match across selected streams in selected time window (Today / 7 days / 30 days / custom); jump-to-tail on result click
- [ ] Open Logs Folder button — primary surface for serious review; launches OS file manager
- [ ] Right-click → "Show in Log" on any game text line — opens Recent Tail centered on that timestamp
- [ ] Export currently-filtered view to `.txt` via standard save dialog
- [ ] Window-close graceful flush via `window.__flushProfileSaves` extension; `[sys] Disconnected` marker appended on tab close mid-session
- [ ] "Logs" toolbar button (next to Debug) opens the modal

---

### Release F — "Hook Layer" (v0.7 — long-term, Lich-side dependency)
**Theme: Full Lich introspection. Requires coordination with Lich5 maintainers or community.**

#### Hook Registry Panel
- [ ] Read-only view of active DownstreamHooks and UpstreamHooks: which script owns each, in what order
- [ ] Shows hook execution order so users can diagnose conflicts ("why is textsubs not firing?", "which script is intercepting my command?")
- [ ] Requires Lich to expose hook state — either via `LichScripts` stream additions or a new TCP API endpoint

#### Lich TCP API Integration
- [ ] Use `reusable_tcp_server.rb` as the foundation for a real-time bidirectional Lichborne ↔ Lich channel
- [ ] Enables: variable subscriptions (push on change, not poll-on-open), real-time script events, hook management without stream parsing
- [ ] Replaces stream-parsing workarounds in `LichBridge.StreamParser` with a typed event protocol
- [ ] Requires coordination with Lich5 maintainers; track upstream discussion in project notes

---

### Roadmap Summary

| Release | Version | Theme | Lich Integration Seam | Key Deliverables | Status |
|---------|---------|-------|----------------------|-----------------|--------|
| A | v0.2.0 | Honest Client | None | Import reframe, automation reframe, 17 import bug fixes | ✅ Released |
| B | v0.3.x | Lich Visibility | File system (read) | Map auto-detect, script browser, YAML profile viewer, hybrid graph map | ✅ Released |
| C | v0.4 | Lich Dashboard | File + Stream + Upstream | LichBridge module, Active Scripts Panel, Script Palette | ✅ Released |
| D | v0.5 | Deep Lich | SQLite + File (write) | Variable Inspector, YAML editor, Lich Settings, Session Awareness | ✅ Released |
| E1 | v0.6.0 | Sessions (Multi-Character) | Renderer + IPC refactor | One exe, multiple characters; SessionStore; tab bar; Quick-Send; profile system v2 (dynamic, atomic, backups) | ✅ Released |
| E2 | v0.6.x | Character Awareness | XML (already parsed) | Race-aware injuries, guild-filtered spell slots, guild NPC styling in Room panel, structured session log | 🔲 Next |
| F | v0.7 | Hook Layer | Lich TCP API (new) | Hook Registry, real-time Lich IPC | 🔲 Long-term |

---

## Notes & Decisions Log

| Date | Decision |
|---|---|
| 2026-04-30 | XML parser will be hand-rolled line classifier — StormFront stream is not well-formed XML, libraries don't fit |
| 2026-04-30 | Phase 2 panels use fixed CSS grid (no dragging) — drag/float/tab added in Phase 3 |
| 2026-04-30 | Session logging deferred to Phase 2 discussion — not starting in 2A |
| 2026-05-01 | Status bar uses flexbox not CSS grid — simpler for a fixed two-row strip, grid reserved for the full panel layout |
| 2026-05-01 | Smart scroll pinning added to both main text window and debug panel — scroll up pauses auto-scroll, within 40px of bottom re-pins |
| 2026-05-01 | RAW_PROMPT debug noise removed from parser |
| 2026-05-01 | Icon bar uses two-row layout: stance/status top, compass/hands/spell bottom — keeps each row uncluttered at any window width |
| 2026-05-01 | RT/CT displayed as persistent thin draining strips at bottom of icon bar — always visible, idle-dimmed; scales to actual timer max not a fixed 10s cap |
| 2026-05-01 | Inactive indicator contrast: #aaa text / #383838 border — readable at all times; active states distinguished by color+glow, not by being the only visible element |
| 2026-05-01 | Vital bars use gradient fills; health has 4-state color thresholds (green ≥80%, yellow 50–80%, orange 30–50%, red <30%) matching Frostbite client approach |
| 2026-05-01 | Status indicators and hand/spell slots use flex:1 to fill full row width at any window size |
| 2026-05-01 | Upgraded two-zone to three-zone right column — top (Room), mid (Thoughts), bottom (flexible) |
| 2026-05-01 | Dynamic stream discovery: parser emits unknown pushStream IDs; GameWindow surfaces them in Panel Manager and + menu |
| 2026-05-01 | NEVER_DISCOVER set filters internal/aliased streams (room sub-streams, logons, percWindow, etc.) from discoverable list |
| 2026-05-01 | + menu rendered via React portal to escape overflow:hidden clipping; menuRef added so outside-click handler doesn't fire on menu items |
| 2026-05-01 | moonWindow uses REPLACE_ON_PUSH — each pushStream clears the stream first so only latest state shows |
| 2026-05-01 | Panel tab layout persisted to localStorage; Reset Layout also resets tabs to Room+Thoughts defaults |
| 2026-05-02 | All colors extracted to CSS custom properties in theme.css — theme swapping is now a single :root block |
| 2026-05-02 | Vital bar gradients moved from inline JS to CSS classes so they are themeable |
| 2026-05-02 | Readability fixes: inactive tab text, whisper preset, exp secondary text, room section labels all improved |
| 2026-05-02 | 17 themes (5 general + 12 guild) defined in themes.ts as CSS-var override objects; applyTheme/initTheme load on startup |
| 2026-05-02 | Guild theme palettes sourced from DESIGN.md Section 6.5 (bg/text/accent per guild) |
| 2026-05-02 | ThemePicker modal: General/Guild tabs, card grid with preview swatches, live apply, portal-rendered |
| 2026-05-02 | Three-tab ThemePicker (General/Guild/Custom); Customize always copies, never edits originals; ThemeEditor with live preview and per-section field types |
| 2026-05-02 | Settings stored in AppSettings; applySettingsToDOM composable overlay — applies after base theme so high contrast/colorblind survive theme changes |
| 2026-05-02 | Large Print scales html.style.fontSize to 16px so all rem values enlarge without touching individual CSS rules |
| 2026-05-02 | Color Blind mode targets only semantic indicator/health/timer vars (not all colors) — avoids breaking theme aesthetics for non-critical UI |
| 2026-05-02 | Vitals bar position conditional render in GameWindow — top renders before game-main (full width); bottom later moved inside text-window-wrap for scoped width |
| 2026-05-02 | Icon bar position is independent from vitals bar position — each has its own setting and conditional render |
| 2026-05-03 | StatusBar renamed to VitalsBar — component, CSS file, settings key (`vitalsBarPosition`), and all docs updated |
| 2026-05-03 | VitalsBar bottom position scoped to main text width — rendered inside `.text-window-wrap` above command bar; right panel column unaffected, bottom-right panel retains full height |
| 2026-05-02 | Login advanced settings grouped into AdvancedSettings interface and persisted to lichborne.advancedSettings; credentials intentionally excluded |
| 2026-05-02 | Reset Panels moved from toolbar button into Panel Manager modal header — toolbar now has Debug, Panels, Theme, Settings, Disconnect only |
| 2026-05-02 | `<style>` tags confirmed as self-closing push/pop markers from live protocol data — DR sends `<style id='roomName'/>` not `<style id='roomName'>text</style>`; parser redesigned accordingly |
| 2026-05-02 | Preset id normalized to lowercase on ingest — server sends `roomName`/`roomDesc` (camelCase), CSS rules use `roomname`/`roomdesc` (lowercase) |
| 2026-05-02 | Compass XML (`<compass><dir value="n"/>`) adopted as authoritative exit source — `value` uses same abbreviations as our internal format; component text exit parsing dropped |
| 2026-05-02 | Stream discovery moved from unknown-event hack (`pushStream:id`) to typed `stream-push` GameEvent — adding a stream to STREAM_MAP no longer silently breaks discovery |
| 2026-05-02 | `<color fg bg>` inline tag support added — parser maintains color stack, segments carry fg/bg hex, renderSegment applies inline style |
| 2026-05-02 | Large batch of Genie UI chrome tags silenced (skin, image, radio, link, switchquickbar, endsetup, resource, exposestream) — confirmed from live XML capture |
| 2026-05-02 | Preset highlight (background) color added — all themes inherit transparent defaults from darkBase; theme editor Game Text tab shows combined fg+bg row; panels.css applies background-color per preset |
| 2026-05-02 | Character profiles feature added to DESIGN.md Section 8 — planned, requires dedicated design session before implementation |
| 2026-05-02 | Preset highlight UX finalized — symmetric swatch+hex pairs for fg and bg; bg always shows `none` placeholder; auto-prepends `#` on type; clearing hex reverts to transparent; no ✕ button needed |
| 2026-05-02 | Auto-copy on text selection — document mouseup listener in GameWindow; skips input/textarea nodes; covers all panels including debug |
| 2026-05-02 | Debug button focus bug — GameWindow now focuses command input on mount; eliminates browser default focus landing on Debug toolbar button |
| 2026-05-02 | Stream panel preset coverage confirmed — StreamPanel uses renderSegment; panels.css global import means all stream panels get preset colors automatically |
| 2026-05-02 | Right-click context menu — shared ContextMenu component (React portal, fixed position); "Clear" wired to main text window, all stream panels, and debug panel; onClearStream threaded through PanelFrame |
| 2026-05-02 | Text selection styling — ::selection { background: color-mix(in srgb, var(--accent) 38%, transparent) } in global.css; adapts to all themes automatically |
| 2026-05-02 | Toolbar/command bar hardcoded dark gradients fixed — replaced #181818/#141414 with bg-sunken/bg-base vars; Parchment toolbar now readable |
| 2026-05-02 | `talk` stream mapped to `conversations` (was `raw`/discarded) — Frostbite+Genie research confirmed `talk` is player speech/yell/whisper, not a duplicate of main |
| 2026-05-02 | `combat` stream mapped to its own target (was incorrectly routed to `main`) — combat/atmospherics/group now discoverable dynamic streams |
| 2026-05-02 | Stream fallback system added — all named streams fall back to main when no panel is open (conversations, thoughts, arrivals, deaths, spells, familiar, combat, atmospherics, group); `watchedStreamsRef` tracks open tab IDs and updates on every tab change |
| 2026-05-02 | Default panel layout overhauled — Room+Conversations top-right; Thoughts+Arrivals+Deaths+Spells center-right; Experience bottom-right; chosen based on how frequently each stream fires during normal play |
| 2026-05-03 | Command bar moved inside `.text-window-wrap` — scoped to main text area width only; right panel column now fills full window height giving bottom-right panel maximum vertical space |
| 2026-05-03 | RT/CT moved from icon bar into command bar — Frostbite-inspired thin strips (RT top edge, CT bottom edge); keeps timing info at point of focus without consuming extra layout height |
| 2026-05-03 | Compass made floating overlay in text area bottom-right — semi-transparent, non-interactive, consumes no layout space; `.text-area` wrapper added inside `.text-window-wrap` so compass anchors to text area bounds only |
| 2026-05-03 | Icon bar collapsed to single row: L hand | R hand | Spell (always visible, "None" when idle) | 6 right-anchored status bars |
| 2026-05-03 | 6 status bars replace old stance tile + status indicator set — Bar1=Stance (always), Bars2-5=single conditions, Bar6=Bleeding→Stunned→Dead priority; all bars fixed width, empty bars use placeholder text to prevent size collapse |
| 2026-05-03 | VitalUpdateEvent `label` field added — server sends `customText='t'` + label in `text` attr for guild-specific vital names (e.g. Barbarian mana = "Inner fire"); parser normalizes, GameWindow tracks in `vitalLabels` state, VitalsBar prefers custom label |
| 2026-05-03 | Contacts default templates: Friends + Enemies only (not the full 5 in spec) — kept minimal to avoid clutter; players add their own |
| 2026-05-03 | Tag injection is render-time only — renderSegmentWithContacts produces React spans, underlying TextSegment data never modified; highlights and triggers won't see injected tag text |
| 2026-05-03 | nameRegex compiled via useMemo on contacts change only — single case-insensitive whole-word alternation; not recomputed per line |
| 2026-05-03 | Last-seen tracks roomState.players only (not all game text) — prevents false last-seen updates from names appearing in unrelated context (e.g. someone mentioned in thoughts) |
| 2026-05-03 | ContactPopover always renders last-seen line — "Last seen: never" when null rather than hiding; gives players useful signal that they've never encountered this person |
| 2026-05-03 | Compass bug: server sends `<dir value="down"/>` but FloatingCompass checks for "dn" — normalized in StormFrontParser `case 'dir'` on ingest |
| 2026-05-03 | UI chrome standardization pass — all modals (Contacts, ThemePicker, ThemeEditor, PanelManager) aligned to Settings as gold standard: border-radius 6px, shadow `0 20px 60px rgba(0,0,0,0.8)`, backdrop `rgba(0,0,0,0.6)`, header padding `12px 16px`, title weight 700/0.9rem, close button 1.4rem with hover transition, section/form labels weight 700 / letter-spacing 1.5px |
| 2026-05-03 | Contacts input focus border: `--accent-bg` → `--accent-dim` to match Settings and ThemeEditor |
| 2026-05-03 | Readability pass on contact popover — last-seen color `--text-dim` → `--text-muted` (3.3:1 → 4.8:1 contrast), room text `--text-faint` → `--text-dim`; contacts form labels `--text-dim` → `--text-muted` |
| 2026-05-03 | All hardcoded danger colors replaced with CSS vars — `#8a2020` → `var(--color-danger-border)`, `rgba(180,40,40,0.15)` → `var(--color-danger-bg)` in contacts.css and panel-manager.css; `rgba(128,128,128,…)` card dividers → `var(--border-faint)` in theme-picker.css |
| 2026-05-03 | Bug fix: `renderWithContacts.tsx` — removed non-null assertion on contacts.find(); now gracefully falls back to plain text render if lookup misses (edge case: whitespace-only name filtered from regex but present in contacts array) |
| 2026-05-03 | Bug fix: `GameWindow.tsx` — added unmount-only cleanup effect to clear `lastSeenTimerRef`; prevents `setContacts` firing on unmounted component if user disconnects within the 2s debounce window |
| 2026-05-03 | Login screen UI polish pass — card widened to 460px; labels updated to "Ruby Path (ruby.exe)" / "Lich Path (lich.rbw)"; all inputs and buttons pinned to 30px height for alignment |
| 2026-05-03 | Port lock added to login screen — `portLocked: true` default; disabled+greyed when locked; 🔒/🔓 toggle; re-locking resets to default port (11024); prevents accidental port corruption |
| 2026-05-03 | Mode lock added to login screen — same padlock pattern as Port; `modeLocked: true` default; re-locking resets to `--stormfront`; Mode is infrastructure, not a player-facing choice |
| 2026-05-03 | Browse buttons added for Ruby Path and Lich Path — IPC handler `browse-file` via `dialog.showOpenDialog`; `.exe` filter for Ruby, `.rbw/.rb` for Lich; exposed on `window.api.browseFile` |
| 2026-05-03 | "Connect via Lich" checkbox moved outside Advanced panel — it is a primary choice, not an infrastructure detail; sits between Character Name and the Advanced toggle |
| 2026-05-03 | Advanced panel collapses by default — `showAdvanced` always overridden to `false` in `loadAdvanced()` so localStorage can never leave it open on next load |
| 2026-05-03 | Visual divider added before Advanced toggle — `border-top: 1px solid #222` separates credential fields from configuration fields |
| 2026-05-03 | Connecting state replaces form — when connecting, form is hidden and only spinner + scrolling status log shown; card stays compact with no layout shift; error restores form for retry |
| 2026-05-03 | login.css intentionally hardcoded — uses fixed hex values, not CSS custom properties; login renders before any character theme is active and must always look consistent |
| 2026-05-03 | Delay/Port/Mode grid columns fixed to `72px 108px 1fr` — Delay tight, Port sized for 5 digits + lock, Mode fills remainder; fixes Mode truncation issue |
| 2026-05-04 | Classic theme added — pure black canvas + WhiteSmoke (#F5F5F5) text; all preset/vital colors sourced directly from Genie's presets.cfg (speech #FFCCB2, whisper #BFFFFF, thought #F9C5F9, roomname #FFDBBF, health red, mana green, etc.); UI chrome lifted above pure-black to maintain panel depth and readable borders |
| 2026-05-04 | Classic set as default theme — `initTheme()` defaults to `'classic'` instead of `'dark'`; Genie veterans see familiar colors immediately on first launch |
| 2026-05-04 | General themes sorted alphabetically — Classic, Dark, Darker, Parchment, Slate, Terminal |
| 2026-05-04 | Vitals bar defaults to bottom position — `DEFAULT_SETTINGS.vitalsBarPosition` changed from `'top'` to `'bottom'`; matches where most players expect it in the DR client layout |
| 2026-05-04 | Log stream panel added as built-in panel type — routes `log` game stream to a dedicated StreamPanel; added to `NEVER_DISCOVER`; included in default bottom-right zone alongside Experience |
| 2026-05-04 | Highlight engine built (Phase 7A) — `HighlightRule` model with Text/Phrase/Regex modes, Line/Match scope, case sensitivity, glow; `renderSegmentFull` single-pass renderer handles contacts + highlights together; line-scope applied at div level, match-scope at span level |
| 2026-05-04 | Text mode uses word-by-word `\b` matching — splits pattern on whitespace, applies `\b` per token, joins with `\s+`; correctly handles multi-word phrases, trailing punctuation, and asterisks without needing Phrase mode |
| 2026-05-04 | Case sensitivity defaults to `true` (case-sensitive) — right-click captures exact game text so exact case is the right default; toggle button `Aa` in editor switches `g`↔`gi` |
| 2026-05-04 | Glow implemented as `text-shadow` — uses dedicated `glowColor` picker (independent from text color); `0 0 6px / 0 0 14px` double-shadow; applied to both match-scope spans and line-scope divs |
| 2026-05-04 | Right-click context menu extended — "Highlight 'word'" (Match scope) and "Highlight this line" (Line scope); captured line text passed as `initialTestText` to preview panel so match is immediately visible |
| 2026-05-04 | `renderSegmentFull` replaces `renderSegmentWithContacts` at all render sites — single regex exec loop collects all contact + highlight match ranges, sorts by position, contacts win ties; no double-pass needed |
| 2026-05-04 | Regex error indicator added — red border + error message on pattern field when Regex mode contains invalid syntax; `isValidRegex()` exported from `highlights.ts` |
| 2026-05-04 | Scroll pinning race fixed — `useEffect` → `useLayoutEffect` for scroll-to-bottom in GameWindow and StreamPanel; fires sync before paint, wins race against Chrome scroll anchoring; `overflow-anchor: none` added to `.text-window` CSS to stop browser competing with our pinning logic |
| 2026-05-04 | Thoughts/Arrivals/Deaths stream colors fixed — parser's `flushSegments()` now auto-assigns a default preset (`thought`/`speech`/`bold`) to unstyled segments in those streams; previously the server sent raw text with no `<preset>` wrapper so `[data-preset="thought"]` CSS never fired |
| 2026-05-04 | Mind lock exp bug fixed — DR server wraps mind lock components in `<preset id='exptraining'>...</preset>` inside `<component>`; parser was overwriting the component's `captureCtx` with the preset's, so the component event was never emitted and 34/34 skills silently disappeared from the exp panel; fix: `<preset>` inside an existing capture context no longer overwrites `captureCtx` |
| 2026-05-04 | Right-click highlight options extended to all stream panels — `onHighlight` prop threaded StreamPanel → PanelFrame → GameWindow; all panels now share identical context menu: "Highlight 'word'", "Highlight this line", "Clear" |
| 2026-05-04 | Trigger system built (Phase 7B) — WHEN→THEN visual model; 6 action types (Command, Echo, Notify, Sound, Webhook, Variable); AND state gates; cooldown + one-shot; `$var` interpolation with cursor-aware picker; no scripting language required |
| 2026-05-04 | Trigger engine uses `triggerCtxRef` updated synchronously in the event loop — triggers always see the current vitals/stance/spell/room within the same event batch, same approach as contacts system for other state |
| 2026-05-04 | Echo action injects synthetic `TextLine` with `preset='echo'` (italic, dim) into any named stream — auto-discovers into the panel system without any extra wiring |
| 2026-05-04 | Triggers panel kept separate from Highlights (own toolbar button) rather than tabbed in same modal — keeps both editors focused and avoids a large combined component; both use identical CSS custom property tokens so theme adaptation is automatic |
| 2026-05-04 | Right-click "Trigger for word/line" added alongside Highlight options in main text window and all stream panels — `onTrigger` prop threaded identically to `onHighlight` |
| 2026-05-04 | Automations/Groups/Modes system designed (not yet built) — Mode = enabledGroups whitelist; Groups = multi-assign color tags; rules get groupIds[]; built-in General group so new rules always run; unified Automations panel replaces separate H/T toolbar buttons; toolbar Mode switcher with modified-state indicator; build after Phase 7C when all four rule systems exist; full spec DESIGN.md Section 17 |
| 2026-05-05 | Theme picker redesigned from card grid to list+detail layout — left column: scrollable theme list (dot + name + ✓ badge); right panel: live preview mock using merged CSS vars; action buttons (Customize… / Edit / Dup / Export / Delete) below preview; fixes Guild tab clipping with 12 themes |
| 2026-05-05 | Bug fix: `<style id='whisper'>` bleeds past `<prompt>` tag — DR server keeps whisper style active across multiple server turns during sanowret crystal knowledge delivery; `StormFrontParser` now clears `currentPreset` when processing a prompt (prompts are frame boundaries; all known styled content is closed before its prompt anyway) |
| 2026-05-05 | Bug fix: `<color>` self-closing form (`<color fg='...'/>`) pushed onto `colorStack` but was never popped — `tagEnd` is never called for self-closing tags, so the color entry leaked into all subsequent text; fixed by skipping the push entirely when `selfClosing=true` |
| 2026-05-05 | Bug fix: `</preset>` nested inside `<component>` never cleared `currentPreset` — `tagEnd` hit the `name !== captureCtx.tag` guard and returned early without resetting the preset set when the nested `<preset>` opened; text between `</component>` and the next prompt inherited the wrong preset (e.g. `exptraining`); fixed by handling `</preset>` inside a foreign capture context as a preset-only clear |
| 2026-05-05 | Bug fix: `colorStack` not cleared on prompt — same structural risk as the `<style>` bleed; orphaned `<color>` entries (from server glitch or Lich script) would accumulate forever; `colorStack` now reset at each prompt alongside `currentPreset` |
| 2026-05-04 | Per-gate AND/OR connectors implemented — each `StateGate` carries its own `connector: 'and' \| 'or'`; `checkGates()` evaluates left-to-right applying each gate's connector to the running boolean; clickable AND/OR pill button between gate rows in editor toggles on click; OR pill highlighted in accent color; removed the earlier global `gateMode` field from `TriggerRule` |
| 2026-05-04 | Trigger `$var` picker portaled to document.body with `position: fixed` — avoids clipping by `.tp-form` overflow-y:auto ancestor; coordinates from `getBoundingClientRect()` at button position; outside-click handler checks both button ref and menu ref |
| 2026-05-05 | Unread tab indicators — `unreadRef` (Set) + `activeIdsRef` (ref of current active tab IDs) added to GameWindow; event handler marks streams unread when their tab is not active; `handleTop/Mid/BottomActive` wrappers clear unread on tab activation; gold dot rendered in PanelFrame on inactive tabs with new content |
| 2026-05-05 | Pending delayed trigger commands now tracked and cancellable — `pendingTimersRef` Set in `useTriggerEngine`; `trackTimer` callback threaded into `executeAction`; `cancelPending()` returned from hook; called on user disconnect and component unmount (server drop); prevents queued commands firing into a dead socket |
| 2026-05-05 | Settings font preview added — five representative game-text lines (room name, plain, speech, thought, bold) in a bordered preview box; font family/size/line-height applied as inline styles from `settings` prop including Large Print override; preset colors from CSS vars so preview respects active theme |
| 2026-05-05 | Bug fix: zero-length match infinite loop in highlight regex loops — typing `^` (or any zero-width assertion) into the highlight pattern field caused the live preview's `while (regex.exec())` loop to spin forever, freezing the renderer thread and crashing it ("Render frame was disposed"); fixed by adding `if (m[0].length === 0) { regex.lastIndex++; continue }` guard in `HighlightsPanel.tsx` (preview loop), `renderSegmentFull.tsx` (match-scope render loop), and `renderSegmentFull.tsx` (contact name loop) |
| 2026-05-05 | Alias system built (Phase 7C) — `resolveAlias()` matches typed input by prefix (not full string); `$1 $2 $rest` capture args after the matched prefix; "hunt" matches "hunt goblin" but not "hunter"; case-insensitive by default; pass-through option also sends original input after alias commands |
| 2026-05-05 | Macro key binding system built (Phase 7C) — `formatKeyCombo()` normalizes keyboard events to "Ctrl+F1" style strings; macros fire from document `onKeyDown` (global, any focus); suppressed via `anyModalOpenRef` when any editor modal is open to prevent firing into form fields |
| 2026-05-05 | KeyBindingField uses `capture: true` event listener during recording — intercepts keydown before any other handler so things like F1 (browser help) and arrow keys are captured cleanly; Escape cancels without recording |
| 2026-05-05 | Macro/alias timer handles tracked in `macroTimersRef` — cleared on disconnect alongside trigger engine's `cancelPending()`; prevents delayed multi-command sequences firing into a dead socket |
| 2026-05-05 | MacrosPanel uses two-tab header (Aliases / Key Bindings) rather than two separate toolbar buttons — keeps all player-input automation in one place; consistent with planned Automations/Groups/Modes unification |
| 2026-05-05 | Automations/Groups/Modes built (Phase 8) — unified Automations panel replacing three toolbar buttons; GroupsProvider at App root so GameWindow can call useGroups(); applyModeObject(draft) added to GroupsContext to avoid save+apply stale-closure race |
| 2026-05-05 | allGroups field chosen over ungrouped-always-fires — deliberate design: rules with no group assignment are silent in all modes, incentivizing categorization; allGroups toggle is the explicit "always fire" escape hatch |
| 2026-05-05 | No Mode zeroes all group states — only allGroups rules fire; switching to No Mode via clearMode() explicitly sets all groups false so no stale state leaks from previous mode |
| 2026-05-05 | isRuleActive signature: (groupIds, activeGroupStates, allGroups) — activeModeId not needed in predicate; all mode-awareness encoded in allGroups flag and activeGroupStates; cleaner than threading activeModeId everywhere |
| 2026-05-05 | Mode hotkeys suppressed when any modal open — same anyModalOpenRef pattern as macros; mode hotkeys checked first (before macros) in onKeyDown to prevent conflicts |
| 2026-05-05 | Inline panel pattern (inline prop) — each panel renders body-only when inline=true, no backdrop/portal/header; AutomationsPanel provides its own chrome; avoids duplicating modal scaffolding |
| 2026-05-05 | Bug fix: right-click → automations prefill path had four separate failures — triggerPrefillPattern never set, props never forwarded to AutomationsPanel, tab state didn't sync when modal already open, useEffect([]) didn't re-run on second right-click; all four fixed independently |
| 2026-05-05 | AutomationsPanel tab sync: useEffect(() => setTab(initialTab), [initialTab]) — GameWindow's automationsTab state is the source of truth; AutomationsPanel mirrors it so right-click always lands on the correct tab regardless of current modal state |
| 2026-05-05 | Prefill effect dependencies: HighlightsPanel depends on prefill?.id, TriggersPanel on prefillPattern — newHighlight/newTrigger always generate fresh UUIDs so each right-click is guaranteed to be a new id and the effect re-fires |
| 2026-05-05 | onSaved propagated to all panels — TriggersPanel and MacrosPanel had no onSaved prop; added to both; AutomationsPanel forwards it to all four inline panels; GameWindow reloads all four rule sets from localStorage on any inline save so live engine state stays current without closing the modal |
| 2026-05-05 | Context menu separators — `ContextMenu` Item type extended to union (action \| separator); items built as three named groups (Highlights, Triggers, Clear), filtered to remove empty ones, joined with `<hr class="ctx-menu-sep">` only between non-empty groups; right-clicking blank space (no word) renders no orphan separators |
| 2026-05-14 | Release D shipped (v0.5.0) — `better-sqlite3` v11 rebuilt against Electron 31 ABI; `marshalParser.ts` full Ruby Marshal deserializer; Ruby Time binary format is little-endian (w1/w2 stored LSB-first by Ruby's `_dump`), new format bits: [31]=new, [30]=UTC, [29:14]=year-1900, [13:10]=month(0-based), [9:5]=mday, [4:0]=hour; `session_summary_state` real columns are `session_name`/`game_code`/`role`/`frontend` (not `character`/`game`); uservars column is `hash` (not `data`); lich_settings column is `name` (not `key`); `better-sqlite3` must be in `external` array of esbuild config or native `.node` binary path breaks at runtime |
| 2026-05-14 | YAML Profile Editor diff: CRLF → LF normalization on file load is essential — Windows files have `\r\n`, textarea normalizes to `\n`, without normalization LCS sees zero common lines and marks entire file as changed |
| 2026-05-14 | highlight.js chosen over hand-rolled YAML regex highlighter — regex approach fails on block scalars, anchors/aliases, flow sequences, inline comments; hljs YAML grammar handles all these correctly; styled with CSS targeting `.hljs-attr`, `.hljs-comment` etc. using VS Code dark+ palette rather than importing a theme file |
| 2026-05-14 | Richer Highlight Engine deferred to Release E — YAML Profile Editor + SQLite foundation were sufficient scope for v0.5.0; highlight groups/export/import/reorder moved to next release |
| 2026-05-15 | Release E split into E1 (Sessions, v0.6.0) + E2 (remaining Character Awareness, v0.6.x) — multi-instance localStorage collisions (B28-class) were root-causing a steady stream of profile-sync bugs; E2 panels all need per-character routing that E1 provides, so doing E1 first prevents doing E2 work twice |
| 2026-05-15 | Single-window-with-tabs over multi-BrowserWindow for v1 multi-character — pop-out windows (§13.9) deferred. Tab approach is dramatically simpler (no IPC routing per OS window) and covers the boxer use case; pop-out can be added later without revisiting the session model |
| 2026-05-15 | sessionId vs characterId distinction — main mints a fresh `SessionId` (crypto.randomUUID()) on every successful login attempt because the underlying TCP socket + parser + Lich child process is genuinely new; renderer holds a stable `CharacterId` (`account::character` lowercased) for tab identity that survives reconnects. Cleaner state model than reusing the sessionId across reconnects |
| 2026-05-15 | Inactive GameWindow tabs stay mounted (`display: none`) — vitals, scroll position, panel layout, virtuoso buffer all persist across tab switches at zero cost. Trade is 2× the React state cost for a 2-character box, which is negligible compared to the UX of instant tab switching with no remount flash |
| 2026-05-15 | Profile v2 dynamic mapping over typed schema — `state:` map mirrors `lichborne.{character}.*` keys 1:1 instead of a hand-maintained typed shape. Eliminates the 3-place sync (build/import/clear) that had silently caused B56/B57 (focus/pin not saving) and similar drift bugs. New per-character settings just need `scopedKey(character, 'X')` for storage; YAML round-trip is automatic |
| 2026-05-15 | YAML kept over JSON for profile format — JSON has the rigor + bundle-size win but YAML's hand-editability and consistency with Lich's existing profile ecosystem (`base.yaml`, `{Character}-setup.yaml`) outweighs. Decision revisitable if no one is actually hand-editing |
| 2026-05-15 | Atomic write (.tmp + rename) for all profile writes; rolling `.yaml.bak` backup of every YAML on graceful shutdown — protects against mid-write crashes and live-file corruption. Backup runs in parallel with the 5s graceful-disconnect drain via `Promise.all` so close time isn't extended |
| 2026-05-15 | v1 → v2 profile migration code removed in v0.6.1 — small tester pool means clean-slate upgrade (delete `profiles/{Character}.yaml`) is cheaper than maintaining ~50 lines of migration code we'd never delete. Future format changes will follow the same pattern: ship the new format, wipe and rebuild profiles instead of carrying migration debt |
| 2026-05-15 | `useProfileSaver()` hook chosen over a `setScoped(character, suffix, value)` wrapper that combines setItem+save — keeping the setItem call site explicit makes the storage shape visible at every save site (good for code review), while the hook handles only the schedule-save concern. Tradeoff: every site has two lines (setItem + saveProfile) instead of one. Worth it for clarity |
| 2026-05-15 | `useProfileSaver` returns a stable callback (useCallback deps only on `character`, sessions captured via ref) — necessary because `useSessions().sessions` changes on every status update (vital tick, RT tick) which would otherwise create new callback identity per render and force any useEffect depending on saveProfile to re-fire constantly |
| 2026-05-15 | Defense-in-depth on graceful shutdown: `window.__flushProfileSaves` (called by main's close handler) fires every pending debounced save AND unconditionally saves every active character. Catches setItem-without-schedule edge cases. With v0.6.1's per-call useProfileSaver pattern, the defense rarely matters — but it's cheap insurance |
| 2026-05-15 | Settings/theme re-apply on tab switch (B67) — each GameWindow's apply-to-DOM useEffect now depends on `isActive`; effect early-returns when inactive (DOM unchanged) and re-fires applying that tab's saved theme/settings when it becomes active. Closes the "last applied wins" cross-tab visual leak that was a known limitation in v0.6.0 |
| 2026-05-15 | Tab status indicators collapsed from 3 slots (🩸 ⚠ ↺) to 1 priority-resolved slot (Dead > Stunned > Bleeding > Roundtime) in v0.6.2 (B73). Iterated through 4 design rounds with the designer: started with 4-emoji always-rendered slots, moved to letter codes (B/R/S), then dots, then morphing category slots, then back to single-priority-slot. Final decision: visual minimalism + DR-native iconography (💀 💫 🩸 ⏳) + always-visible health % + dim/italic conveys disconnect (no separate reconnect glyph needed since the toolbar Login button is the actual reconnect affordance). Fixed-width CSS (`1.5em` icon slot, `4ch` health column, `tabular-nums`) locks tab width at character add-time |
| 2026-05-15 | Session Log scoped as the only remaining Release E2 deliverable. Other E2 items (race-aware injuries, guild-aware spell slots, room NPC styling) deferred or dropped — see DESIGN.md §13 / §28 for the Sessions vs Character-Awareness split. Session Log design itself iterated through 5 rounds with the designer: storage format (JSONL vs plain text), retention strategy (count vs disk-quota vs time-based), compression (default off for discoverability), in-client UI scope (modal browser vs tactical-lookups-only), and stream filtering (single-file with tags vs per-stream files). Final: plain text `[timestamp][stream] text`, 30-day retention, no compression default, three-affordance modal (Recent Tail + Quick Search + Open Folder), single file with stream tags discovered by scanning. DESIGN.md §28 captures the spec |
| 2026-05-06 | Debug panel gains Raw XML tab — two-tab layout (Events / Raw XML) replaces single-view panel; raw lines sent via dedicated `raw-xml` IPC channel before parsing so the tab shows exactly what the server sent; both tabs auto-scroll and pin independently; Clear button scoped to active tab; docked Debug panel in PanelFrame updated identically |
| 2026-05-06 | LichScripts STREAM_MAP entry changed from `'raw'` (discard) to `'LichScripts'` — `script-watch.lic` periodically pushes running script list; stream is now discoverable and displayable as a panel |
| 2026-05-06 | `<d cmd='...'>` clickable command links implemented — `d` removed from `SILENT_TAGS`; `linkCmd` field in parser tracks active cmd; `cmd` added to `TextSegment`; `renderSegment` renders as `.cmd-link` span when `onSendCommand` provided; prompt and `</d>` both clear `linkCmd`; plain `<d>south</d>` exit labels unaffected (no `cmd` attr) |
| 2026-05-06 | `stream-declare` GameEvent added — emitted from `<streamWindow>` for every non-`main` stream; uses same STREAM_MAP translation as `pushStream` so declared and pushed IDs always match; carries `title` attr; streams discoverable at login without waiting for content |
| 2026-05-06 | Stream titles stored in `streamTitles` Record in GameWindow — sourced from `<streamWindow title='...'>` attr; threaded through `sharedFrameProps` to `PanelFrame` and `PanelManager`; panel labels now use server-provided title (e.g. "Field Experience", "Active Spells") instead of raw stream ID capitalization |
| 2026-05-06 | `REPLACE_ON_PUSH` hardcode removed — was client-side workaround for `moonwindow` only; replace-vs-append is now fully XML-driven via explicit `<clearStream>` from producers; works generically for all current and future streams |
| 2026-05-06 | `<d>TEXT</d>` bare form now clickable — `linkCmdIsText` flag set when `<d>` has no `cmd` attr; first non-empty text node becomes the command; covers exit labels in main text stream (`<d>south</d>`), help commands (`<d>NEWS NEXT</d>`), and any other bare `<d>` the server sends |
| 2026-05-06 | `<nav/>` silenced — movement frame marker added to `SILENT_TAGS`; was flooding Debug with unknown events on every room transition |
| 2026-05-06 | `room creatures` + `room extra` fully wired — added to `COMPONENT_STREAM` targeting `room-creatures`/`room-extra`; `RoomState` gains `creatures` and `extra` fields; `GameWindow` handles clear and update for both; `RoomPanel` renders conditional "Creatures" and "Extra" sections |
| 2026-05-06 | Injuries panel added — `<dialogData id="injuries">` arrives every ~60 s with 15 body-part `<image>` elements; `image` removed from `SILENT_TAGS` and gets its own switch case; `inInjuriesDialog` flag batches parts until `</dialogData>`; `InjuryState` stored in `GameWindow` and threaded to `PanelFrame`; `InjuriesPanel` shows only wounded parts grouped by body section (Head/Torso/Arms/Legs/Other) with yellow/orange/red severity; severity derived from numeric suffix in `name` attr — awaiting combat XML sample to confirm convention |
| 2026-05-06 | ExpPanel footer added — `exp rexp/tdp/favor/sleep` components displayed in a pinned strip below the scrollable skills list; `ExpPanel` restructured to `exp-panel-body` (flex:1, overflow-y:auto) + `exp-footer` (flex-shrink:0, pinned); footer always visible regardless of scroll position |
| 2026-05-06 | RXP display format: `RXP 35m / 4:01h` — usable-this-cycle (minutes) shown first as the actionable number, stored hours second; cycle refresh time omitted from display (least actionable of the three values) |
| 2026-05-06 | Sleep level detected from `exp sleep` component text — empty = awake (nothing shown); contains "state of rest" but not "deep sleep" = level 1 (`Resting`, blue `--exp-sleep-1`); contains "deep sleep" = level 2 (`Deep Sleep`, purple `--exp-sleep-2`); colors defined as CSS vars in `theme.css` alongside other exp vars |
| 2026-05-06 | Footer CSS: values use `--text-muted` (#888), labels use `--text-dim` (#666) — label recedes, value reads forward; same contrast pattern used throughout exp panel rows; `white-space: nowrap` + `overflow: hidden` keeps footer on one line at all panel widths |
| 2026-05-06 | RT/CT chip style redesigned — switched from CSS grid (1fr stretching) to flex with fixed 8×6px chips and 6px gap; chips stack left-to-right from input edge, rightmost chips disappear as time counts down; overflow-hidden on wrapper clips very long RTs naturally |
| 2026-05-06 | RT/CT bar style updated to match chip visual treatment — solid `var(--rt-end)` / `var(--ct-end)` color (no gradient, no glow), 6px height matching chip height |
| 2026-05-06 | Chip/bar pulse animation tuned — brightness dims to 0.85 (was 0.4, then 0.7); subtle flicker that keeps hue without going dark |
| 2026-05-06 | Settings: RT/CT Timer Style toggle — Chips (default) or Bar; chips preferred as default for visual clarity |
| 2026-05-06 | ExpPanel section order: Mind Locked now renders above Learning — locked skills are higher-priority information during active play; both sections retain their existing collapsed/expanded defaults |
| 2026-05-06 | Window title bar shows character identity — parser handles `<app char="Agan" game="DR"/>` sent at login and emits `PlayerInfoEvent`; `GameWindow` sets `document.title` to `"CharName · GAME — Lichborne"`; before connect the title remains `"Lichborne — DragonRealms"` (set in `main.ts` at window creation); essential for distinguishing multiple instances running different characters |
| 2026-05-07 | Version display: `__APP_VERSION__` injected at build time via Vite `define` from `package.json`; shown on login screen below subtitle (`.login-version`, dimmer/smaller) and appended to window title in both pre-login (`Lichborne vX.Y.Z — DragonRealms`) and post-login (`CharName · GAME — Lichborne vX.Y.Z`) states |
| 2026-05-07 | Application menu: custom `Menu.buildFromTemplate` replaces Electron default; File (Open Data Folder via `app.getPath('userData')`, Quit) + standard Edit/View/Window roles preserved; `shell.openPath` opens folder in OS file explorer regardless of OS/user profile |
| 2026-05-07 | DevTools auto-open gated on `!app.isPackaged` — opens automatically in dev, stays closed in portable builds; still accessible via View → Toggle Developer Tools |
| 2026-05-07 | Versioning convention: `0.1.x` = bug fixes/polish, `0.2.0` = next feature batch, `1.0.0` = stable public release |
| 2026-05-07 | Packaging: portable exe chosen over NSIS installer — no code signing (SmartScreen warning accepted for small test group); `release/` added to `.gitignore`; `npm run dist` builds locally via electron-builder; `node publish.mjs` publishes to GitHub Releases with release notes attached; `latest.yml` generated alongside exe for updater version checks |
| 2026-05-07 | Release notes: `releaseInfo.releaseNotesFile` in electron-builder config is unreliable — switched to `publish.mjs` which uses the programmatic `build()` API and then PATCHes the GitHub release body directly via the REST API; this guarantees notes appear regardless of electron-builder internals |
| 2026-05-07 | `latest.yml` missing from releases: partial `config.publish` override in `publish.mjs` was stripping `provider`/`owner`/`repo`; fixed by moving `releaseType: draft` into `package.json` publish block and removing the override from `publish.mjs` |
| 2026-05-08 | `latest.yml` not generated by electron-builder for portable target — fixed by generating it manually in `publish.mjs` using SHA-512 hash of the output exe and uploading via GitHub REST API; also fixed stale exe bug by filtering `release/` directory by current version string so old leftover exes are ignored |
| 2026-05-07 | Version number stale in packaged exe: `publish.mjs` was calling electron-builder `build()` directly without rebuilding first — it packaged the old `dist/` output; fixed by running `execSync('npm run build')` at the start of `publish.mjs` so `__APP_VERSION__` and `app.getVersion()` always reflect the current `package.json` version |
| 2026-05-07 | Login card resize bug: card had `max-height` but no `min-height`, causing it to shrink when switching from form to connecting state; fixed with `min-height: 460px` on `.login-card` and `min-height: 300px` + `justify-content: center` on `.connecting-state` |
| 2026-05-07 | Lich auto-detect: button-triggered only (not on panel open) — avoids surprising path overwrites; main process handler uses `process.platform === 'win32'` guard so Linux/Mac get nulls; version dirs sorted numerically so `4.0.11 > 4.0.3`; returns full validity state so renderer can show per-path ✓/✕ icons |
| 2026-05-07 | Direct connection advanced panel: was showing empty black box when `useLich` false; replaced with `.advanced-direct-note` message "No advanced settings for connecting directly." |
| 2026-05-07 | Auto-update: `electron-updater` checks GitHub Releases 3s after launch (production only — `app.isPackaged` guard); `autoDownload: false` so user controls timing; renderer shows green banner with Download → Downloading… → Restart & Install flow; banner lives in `App.tsx` so it appears on both login and game screens |
| 2026-05-08 | Auto-updater silent failure root cause: `app-update.yml` not generated by electron-builder for portable builds; fixed by creating it manually in `build/` and bundling via `extraResources` in package.json |
| 2026-05-08 | Artifact name mismatch: default name used spaces (`Lichborne 0.1.4.exe`) but GitHub serves assets with hyphens; fixed with explicit `artifactName: "${productName}-${version}.exe"` in win build config |
| 2026-05-08 | Auto-updater logs forwarded to DevTools console via `updater-log` IPC channel — errors, checking, and no-update states all visible in renderer DevTools without needing a terminal |
| 2026-05-08 | Update banner made dismissable — ✕ button on right; dismissed state resets when a new update is detected or when download completes; allows players to safely log out before installing |
| 2026-05-08 | System font picker — replaced hardcoded 4-option font `<select>` with full system font enumeration via Local Font Access API (`window.queryLocalFonts()`); main process grants `local-fonts` permission via both `setPermissionRequestHandler` and `setPermissionCheckHandler` (both required — check handler is the synchronous pre-check Chromium does before fulfilling the API call); fonts deduplicated by family, sorted alphabetically; UI is an inline scrollable list (~7 items visible) with a live filter input above it; selected font highlighted in accent color and auto-scrolled into view on open; `fontFamily` setting now stores raw font name; `applySettingsToDOM` falls back to `'FontName', monospace` for raw names, legacy preset keys still resolve to full fallback stacks; legacy keys transparently migrated to font names on first Settings open |
| 2026-05-08 | B16 fix — scroll-pinning secondary race: `pinnedRef` was updated by the async `onScroll` DOM event; game lines arriving before that event fired caused `useLayoutEffect` to see a stale `true` and auto-scroll even while user was scrolled up (badge still incremented correctly, scroll also happened). Fix: `GameWindow` re-reads scroll position from the DOM right before `setLines` so `pinnedRef` is always current at the moment the layout effect checks it; `StreamPanel` snapshots scroll position during the render phase (before React commits new lines) for the same guarantee. |
| 2026-05-08 | Check for Updates button added — shown only on login screen; subtle muted style; shows "Checking…" while in flight; shows "You're up to date" after a no-update response; hides when update banner takes over |
| 2026-05-08 | Release folder cleanup added to `publish.mjs` — deletes all `.exe` and `.yml` files from `release/` before each build so stale files from prior runs can never pollute the `latest.yml` filename lookup |
| 2026-05-08 | B04 fix — `<output class="mono"/>` / `<output class=""/>` tags now handled in StormFrontParser; `monoMode` state toggles on/off; lines emitted in mono mode carry `mono: true` on `StreamTextEvent` and `TextLine`; both main window and panel renderer apply `white-space: pre` to mono lines, preserving the server's fixed-width column spacing for stat displays |
| 2026-05-08 | B06 fix — ExpBrief mode (`EXPBRIEF ON`) omits mindstate names from `<component id='exp ...'>` updates and sends only `[x/34]` bracket notation; `parseExp` in ExpPanel now falls back to parsing the bracket index (e.g. `[16/34]` → mindstateIdx 16) when no mindstate string is present; handles `[ 7/34]` with leading space and `(x/34)` parenthesis form; normal mode continues working via string matching unchanged |
| 2026-05-08 | B01 fix — `<a href='...'>text</a>` tags now parsed in StormFrontParser; `href` and `autoHref` properties added to `TextSegment`; links render as `.url-link` spans that call `shell.openExternal` via IPC; `<LaunchURL src='...'>` tag handled — constructs full URL and fires `launch-url` event intercepted in main.ts before reaching renderer; bare `http://`/`https://` URLs in plain game text auto-detected via static regex with trailing-punctuation stripping; `autoLinkUrls` toggle in Settings (default on); `--link-color` and `--cmd-link-color` CSS variables added to all themes and ThemeEditor; F04 `<d cmd>` flag links verified working in main window |
| 2026-05-08 | B03 fix — keyboard scroll keys wired up in main text window: PageUp/PageDown scroll by one screen, Home jumps to top of history, End returns to bottom and re-pins auto-scroll; all suppressed when command input is focused; scrollbar arrow buttons added via `::-webkit-scrollbar-button` with SVG data-URI triangles (width widened to 12px to accommodate); hover darkens button background |
| 2026-05-06 | Per-stream timestamps — right-click any stream panel to toggle `[HH:MM]` prefix; `timestamp: number` stored on every `TextLine` at receive time; display controlled by `streamTimestamps` Record in `GameWindow` persisted to localStorage; toggling applies retroactively to all buffered lines; `.ts-prefix` span styled muted/dim, non-selectable; applies to all stream panels including custom/discovered streams |
| 2026-05-13 | Hybrid map architecture — `MapPanel` now coordinates two independent data sources: Lich JSON (`map-*.json` via `findLichMapFile` IPC) for room metadata/images and Genie XML (player's maps folder) for x/y/z coordinates; `MapImageView` renders Lich image tiles; `MapGraphView` renders Genie SVG graph augmented with Lich room IDs/colors; `MapPanel` owns the Image/Graph tab switch and all cross-source indexing |
| 2026-05-13 | Lich JSON indexing — `loadLichDb` extracted from useEffect into a `useCallback` so it can be called imperatively (reload button, auto-reload); builds three indexes: `lichDb: Map<number, LichRoom>` (by id), `titleIndex: Map<string, LichRoom[]>` (by title, ref — no prop drilling), `imageIndex: Map<string, LichRoom[]>` (by image filename); `lichTitle()` strips any number of leading/trailing brackets so `[[Name]]` matches clean titles |
| 2026-05-13 | B44 fix (Abandoned Road) — subtitle format is `[Room Name - LichID]`; parser's old `idMatch` regex looked for `(digits)` in parentheses — always null; rewrote `streamwindow` case in `StormFrontParser` to extract trailing `- NNNN` from inside bracket content (`inner.match(/\s*-\s*(\d+)\s*$/)`); emits `roomId` on `room-title` event; `RoomState` gains `roomId?: number`; `GameWindow`, `PanelFrame`, and both `MapPanel` usages threaded through |
| 2026-05-13 | Direct Lich room ID lookup — `MapPanel` tries `lichDb.get(roomId)` first (O(1)) before falling back to `findRoom(titleIndex, title, desc)`; eliminates false misses for rooms whose titles are shared across zones and for rooms where description text differs slightly between Lich and game output |
| 2026-05-13 | B43 fix (Bulk Materials / Genie unmatched) — added zone-prefix construction as step 3 in Genie augmentation matching: build `"${zone.name}, ${node.name}"` and look it up in `titleIndex`; covers the common case where Genie stores short names ("Bulk Materials") while Lich titles are fully-qualified ("Leth Deriel, Bulk Materials"); description disambiguation applied on multiple hits |
| 2026-05-13 | Match-failure specificity — "Location not in Lich map" banner in both MapImageView and MapGraphView now shows `"Lich #NNNN not in map"` when a numeric room ID was received (the room exists in-game but is unmapped in the Lich JSON) vs. generic "Location not in Lich map" when only a title was available |
| 2026-05-15 | B58 fix — graph map view off-center at startup: fit `useEffect` depended on `currentZone`/`showAllZ`/`zLevels` but not on SVG mount; Genie finishes → SVG mounts via `svgCallbackRef` → no dep changed → effect skipped → transform stuck at {0,0,1}; fix: added `svgReady` state toggled in `svgCallbackRef`, included in fit effect deps so centering fires the moment the SVG is available |
| 2026-05-13 | B45 fix — removed duplicate ◆ "Re-center" button from MapGraphView top subbar; single ◆ remains in the bottom navigation bar |
| 2026-05-13 | B46 fix — all map control buttons (⊡, +, −, ◆, z-level chips, ▤, ■) now carry `onMouseDown={e => e.preventDefault()}` to prevent focus theft from the SVG canvas; without this, clicking any button moved browser focus away from the SVG so subsequent wheel events targeted the button element instead of the canvas |
| 2026-05-13 | B47 fix — replaced static `svgRef + useEffect([], [])` wheel listener pattern with a callback ref (`svgCallbackRef`); `useEffect` with empty deps runs at mount when the SVG doesn't exist yet due to early-return loading states; callback ref attaches the non-passive `{ passive: false }` wheel listener the moment the SVG element actually enters the DOM; listener reference stored in `wheelHandler` ref (not on the DOM element) and removed on unmount/re-mount |
| 2026-05-13 | ↺ Reload Lich map button — added to MapPanel toolbar; calls `loadLichDb()` directly; allows newly mapped rooms to appear without restarting the client; Genie augmentation re-indexes automatically via the existing `useEffect([genieMapsDir, dbStatus, loadGenie])` which fires whenever `dbStatus` transitions loading→ready |
| 2026-05-13 | Auto-reload on repository.lic map download — `GameWindow` stream-text handler checks every line for `/^--- Map loaded .+\.json$/i`; on match, increments `lichMapVersion` state; `MapPanel` watches `lichMapVersion` via `useEffect` and calls `loadLichDb()` on change; `lichMapVersion` threaded through `sharedFrameProps` → `PanelFrame` → `MapPanel` prop |
| 2026-05-13 | Cross-zone exit detail panel — rooms with ◆ diamond now show a "Connects to" section in the detail panel; each cross-zone wayto destination shows a `[cmd]` exit chip (same style as same-zone exits, hover shows full Lich script) + amber zone name (click to navigate graph to that zone) + destination room short name; `cmdLabel()` helper in mapTypes.ts extracts the human-readable move command from Lich scripts (`;e ...;move 'go path'` → `go path`) |
| 2026-05-13 | Detail panel redesign — header now shows `shortName()` + zone badge (muted italic) + ◆ "here" badge inline + Lich ID (Genie coordinates in tooltip); removed Genie metadata line; description clamped to 2 lines; same-zone exits section filters out cross-zone destinations (those appear in the cross-zone section only); "You are here" moved from bottom line to inline ◆ badge in header |
| 2026-05-13 | Detail panel tracks current room — `useEffect` on `currentRoom?.id` updates `selectedId` to `currentRoom.id` while the panel is open, so the panel follows the player as they move; `selectedOrphan` also cleared on move to prevent stale dual-selection state |
| 2026-05-13 | B48/B49/B50/B51 fixes — see BUGS.md |
| 2026-05-13 | F13 shelved (world map) — continuous multi-zone SVG stitching deferred; design spec remains in DESIGN.md §25.8 Phase 2; zone-by-zone graph view ships first; added to BUGS.md Open Feature Requests and DESIGN.md §19.12 Future Work |

