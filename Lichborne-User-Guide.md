# Lichborne — User Guide

*Your friendly primer for getting Lichborne up and running, and making it your own.*

Welcome! Lichborne is a modern DragonRealms client for Windows, Linux, and macOS. Whether you're brand new or you've been playing since the StormFront days, this guide walks you from **download** to **fully set up** — and then tours everything the client can do. You don't need to read it front to back; jump to what you need using the contents below.

> **Stuck or something looks wrong?** Come say hi on **Discord** — the invite link lives in **Help → About Lichborne** inside the app (which also shows your version and credits). We're a friendly bunch and love a good bug report.

> ℹ️ **Heads up:** this guide was **written with the help of AI**, so it may contain the occasional mistake or a detail that's drifted out of date. If something here doesn't match what you see in the app, trust the app — and please let us know on Discord so we can fix it.

---

## Contents

- [What is Lichborne?](#what-is-lichborne)
- [What's New in the Latest Version](#whats-new-in-the-latest-version)
- [On the Horizon (Roadmap)](#on-the-horizon-roadmap)
- [Getting Started](#getting-started)
  - [1. Install](#1-install)
  - [2. Set up Lich (recommended)](#2-set-up-lich-recommended)
  - [3. Log in](#3-log-in)
  - [3b. Or: attach to a running Lich](#3b-or-attach-to-a-lich-thats-already-running)
  - [4. One-time in-game setup](#4-one-time-in-game-setup)
- [Connecting & Playing Your Whole Team](#connecting--playing-your-whole-team)
- [Feature Tour](#feature-tour)
  - [Views: Session and Overview](#views-session-and-overview)
  - [Your layout: Static vs Windowed Panels](#your-layout-static-vs-windowed-panels)
  - [Themes & accessibility](#themes--accessibility)
  - [Automations: highlights, triggers, macros, aliases](#automations-highlights-triggers-macros-aliases)
  - [Mutes & Substitutes](#mutes--substitutes)
  - [Groups & Modes](#groups--modes)
  - [Automation Analytics](#automation-analytics)
  - [Contacts](#contacts)
  - [Maps](#maps)
  - [The Room window](#the-room-window)
  - [Vitals & timers](#vitals--timers)
  - [The Experience panel](#the-experience-panel)
  - [Session logs](#session-logs)
  - [Slash commands](#slash-commands)
  - [Lichborne Experiences](#lichborne-experiences)
  - [AI: Catch Me Up](#ai-catch-me-up)
  - [The Lich Dashboard](#the-lich-dashboard)
  - [Coming from another client](#coming-from-another-client)
  - [Transfer a setup between your characters](#transfer-a-setup-between-your-characters)
  - [Command-line niceties](#command-line-niceties)
  - [Free SimuCoins, claimed for you](#free-simucoins-claimed-for-you)
- [Feature Matrix: With Lich vs Without Lich](#feature-matrix-with-lich-vs-without-lich)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Getting Help](#getting-help)
- [Appendix A — Slash Command Reference](#appendix-a--slash-command-reference)
- [Appendix B — Lich vs Direct, in depth](#appendix-b--lich-vs-direct-in-depth)
- [Appendix C — Where your settings live](#appendix-c--where-your-settings-live)
- [Appendix D — Troubleshooting & known limits](#appendix-d--troubleshooting--known-limits)

---

## What is Lichborne?

Lichborne is a DragonRealms client inspired by **StormFront**, **Genie**, and **Frostbite** — built for players who've had opinions about all three. If you've used any of them, you'll feel at home in minutes.

A few ideas shape everything:

- **It's a beautiful window onto the game, and a great place to configure it.** Lichborne owns how the game *looks and feels* — themes, panels, maps, contacts, your highlights and macros, and a growing set of graphical "Experiences." It works hand-in-hand with **Lich** (see below) rather than replacing it.
- **Your setup follows you.** Every panel move, color tweak, and contact edit saves automatically to plain files you own. Restart, switch characters, or move to a new PC — it's all exactly where you left it.
- **Lich is recommended, but not required.** Lichborne shines brightest connected through [Lich5](https://github.com/elanthia-online/lich-5), which unlocks maps, spell timers, variables, and scripts. But you can connect **straight to the game** with no Lich at all, and Lichborne stays genuinely usable — the features that need Lich simply fall back gracefully. See the [Feature Matrix](#feature-matrix-with-lich-vs-without-lich).

**Current state:** Lichborne is in **alpha** — the core experience is solid and improving fast. It runs on **Windows (x64, stable)**, and as of v0.18.0 on **Linux (AppImage, beta)** and **macOS (Apple Silicon, beta)** too — see [Install](#1-install) for the per-platform notes.

---

## What's New in the Latest Version

**v0.19.8**

- **Name your own colours.** Make a colour once in **Automations → Colors**
  ("Buff drop", "Danger") and pick it anywhere a colour is chosen — highlights,
  trigger echoes, contact templates, groups. Change it later and everything
  using it changes with it, immediately. The Colors tab shows what uses each one.
- **The Theme Editor picks from your colours too** — but a theme *copies* the
  colour rather than following it, so a theme file still works perfectly for
  someone who doesn't have your palette.
- **Style a trigger's echo.** The **Echo** action can now set a background, go
  bold and wear any of the text effects, with a live preview in the editor — so
  the line a trigger writes for you is as easy to spot as anything else.
- **Bold works again if you lowered your Text weight.** Below the default
  setting, bold had been rendering identically to normal text everywhere —
  highlights, creature names, room titles, contact templates. If you run a
  thinner text weight, bold will now look noticeably stronger.
- **Contact templates got clearer.** The template card is grouped under labelled
  dividers — Contact name, Tag, Preview, Applies to — instead of one long ladder
  of fields, and the **tag** can be bold independently of the name.
- **Line highlights show their effects in the game**, and layer properly: a word
  with its own highlight keeps its own effect while the rest of the line keeps
  the line's.
- **A polish pass over the whole interface.** The headline one: **"Compact" line
  height now actually is compact** — every line of game text had been floored at
  the next setting up, so you were losing roughly six lines of visible text on a
  normal window. Also: you can see which rule you have selected in Highlights,
  Triggers, Macros, Aliases, Groups and Lich Scripts (on several themes a
  *hovered* row looked more selected than the one you were editing); the
  **Connect** button on your character cards is readable on hover on every theme;
  line height and **Large Print** now reach the Experience, Injuries and Lich
  Scripts panels; macros no longer fire — and typing no longer lands in a hidden
  command bar — while a dialog is open; and the panel **+** menu opens the right
  way up near the top of the window.
- **Tidier Automations and Lich Dashboard headers.** The Automations title bar
  was holding five different kinds of control in one row; the tabs now have a
  row of their own, the character/global switch sits with them under an
  **"Applies to"** label, and Analytics and **Import from another client…** moved
  into a **⋯** menu beside the ✕ (it shows a dot while Analytics is on). The Lich
  Dashboard's five tabs moved to their own row too. Nothing is more than one
  click from where it used to be.

## On the Horizon (Roadmap)

Lichborne is actively developed. A few things we're heading toward — directional, not promises with dates:

- **The move to Elanthia-Online.** Lichborne's repository is transferring to the
  community organization that maintains Lich — the client built with the
  community, stewarded by it. Updates and links carry over seamlessly (v0.19.2
  installs are already transfer-ready, and GitHub redirects cover the rest).
- **Windowed Panels becomes the default.** The floating-window layout is the future; the older docked "Static Panels" mode will eventually retire, with an automatic one-time conversion so no layout is ever lost.
- **More Lichborne Experiences.** The graphical scenes (Living Tableau, Moons, Spell Monitor) are the first of a larger set of "graphics for text players" — richer combat instruments, wound/status visuals, and more.
- **More AI helpers.** Catch Me Up is the first BYOK ("bring your own key") AI feature. Others are designed and on the way — always optional, always with a working non-AI baseline, and always privacy-first.
- **A proper Discord community** for feedback and bug reports (link in **Help → About Lichborne**).
- **Linux and Mac out of beta.** The v0.18.0 platform betas graduate once they've soaked with testers — if you play on either, your reports are what get them there.
- **Code signing**, to remove the first-install warnings (Windows SmartScreen now; the macOS certificate — which would also enable Mac auto-update — if Mac demand shows).

---

## Getting Started

Three steps and a one-time in-game command, and you're playing.

### 1. Install

All downloads are on the **[Releases page](https://github.com/SekmehtDR/Lichborne/releases/latest)**.

**Windows (stable):** run `Lichborne-X.Y.Z-setup.exe` — no admin rights needed. Windows may show a **SmartScreen** warning (no code-signing certificate yet); click **More info → Run anyway**. It's safe. Auto-updates with one click when a new version lands.

**Linux (beta):** download the `.AppImage`, `chmod +x` it, run it. Two tips:

- **It keeps one name: `Lichborne.AppImage`.** Auto-update replaces that file in place, so desktop shortcuts and dock favourites keep working. Downloads before v0.19.7 had the version number in the name (`Lichborne-0.19.6.AppImage`); if yours does, rename it once to `Lichborne.AppImage`. Otherwise the next update switches it to the new name itself, and any shortcut to the old name stops working.
- **If it won't start on Ubuntu 22.04 or newer**, install FUSE 2, which AppImages need: `sudo apt install libfuse2t64` on 24.04, or `sudo apt install libfuse2` on 22.04. Running it from a terminal shows the FUSE error if that's the cause.

If "Remember password" is greyed out, your desktop lacks a keyring service — install GNOME Keyring or KWallet, or just type the password each session.

**macOS (beta, Apple Silicon):** open the `.dmg`, drag Lichborne to Applications. **The first launch needs one Terminal command** — open Terminal and paste:

```bash
xattr -cr /Applications/Lichborne.app
```

Then open Lichborne normally; you'll never need it again. If macOS instead offers **System Settings → Privacy & Security → "Open Anyway"**, that route works too.

**Why?** Apple charges $99/yr for the certificate that makes this warning go away, and Lichborne is a free project. Without it macOS quarantines the download — and on Apple Silicon it phrases that as **"Lichborne is damaged and can't be opened. You should move it to the Trash."** Nothing is damaged and nothing needs trashing: that's simply how macOS says "not notarized by Apple." The app is safe and the source is public. **Mac updates are manual** — check the Releases page for new versions.

### 2. Set up Lich (recommended)

**Lich** is a separate, community-maintained proxy that supercharges any DR client. It's what unlocks maps, spell timers, variables, and scripts in Lichborne.

- Install it per the **[official Lich install guide](https://github.com/elanthia-online/lich-5/wiki/Documentation-for-Installing-and-Upgrading-Lich)** — Windows has a one-click installer; Linux/Mac follow the wiki's steps (Lich in `~/Lich5`, Ruby 4.0+ via rbenv or your distro).
- **Already running Lich** for Genie, Profanity, or another client? You're set — no reinstall.
- In Lichborne, open **Lich Setup** (the **⚙ Lich Setup** button on the launcher, or **Settings → Lich Setup → Open Lich Setup…**) and hit **↺ Auto-detect**. Green checkmarks mean you're good. It knows each platform's standard install spots (on a Mac, the first detect asks permission to look at your Desktop folder — that's where the wiki's install lands). If your Ruby is older than 4.0, the dialog warns you — current Lich won't start on it.

*Prefer no Lich? You can skip this entirely — see [Connecting](#connecting--playing-your-whole-team).*

### 3. Log in

1. Enter your **account name**, **password**, and **character name** — just like any other client.
2. Click **⚡ Connect via Lich** (or **⬡ Connect Direct** if you're going without Lich).
3. Done — your account and Lich settings are remembered for next time.

### 3b. Or: attach to a Lich that's already running

There's a third way to connect, and it changes what closing Lichborne means.

Normally your game session belongs to the client — quit Lichborne and you log
out. But if you start Lich **headless**, the session belongs to *Lich*, and
Lichborne can simply attach to it:

```
lich --login Yourcharacter --headless 8001
```

Then in Lichborne click **⇋ Attach** in the launcher's top bar and fill in three
fields — character name, host (`127.0.0.1` if it's the same machine), and the
port you used. No account name, no password: the headless Lich already logged
itself in.

Why you might want this:

- **Close Lichborne without logging out.** Reopen later and pick up where you were.
- **Survive a crash** with your login intact.
- **Play from another machine** — attach to the same session from your laptop.
- **Watch a session from a second front-end** alongside the first.

Lichborne remembers the host and port, so next time it's one click on the
character's tile.

**Two things worth knowing.** *Disconnect detaches* — closing Lichborne or
clicking Disconnect leaves the session running, which is the point. But typing
**`exit`** in the game shuts the whole session down; that's Lich's own rule for
attached clients, not something Lichborne can change. And if your connection
drops, Lichborne **re-attaches by itself**, retrying for as long as you leave the
tab open.

*Use plain `--headless`. A `--genie`-flavoured headless Lich doesn't send the
state refresh on attach, so your vitals would come up blank.*

### 4. One-time in-game setup

Once you're in, run this **once**:

```
SET PROMPT STATUS
```

This tells DragonRealms to include your full status (hidden, stunned, roundtime, and so on) with every prompt, which keeps your vitals and timers accurate. If you've used StormFront, you've likely done this already.

*(EXPBRIEF works either way — the Experience panel handles it on or off.)*

---

## Connecting & Playing Your Whole Team

- **One app, every character.** Each character is a tab. Switch with `Ctrl+Tab` or `Ctrl+1–9`.
- **Quick Send** (`Ctrl+Shift+Enter`) fires a command at *another* character without leaving the one you're on.
- **Pop a character into its own window** — right-click its tab, use the **Window** menu, or tick "open each in its own window" when bulk-connecting. It's still one app, so Quick Send and Lich coordination keep working. (You can also launch the app more than once to keep two teams fully separate.)
- **Dropped?** The button at the right end of the top bar turns into **Reconnect** — one click logs that character back in, in the same tab, with its scrollback intact.
- **Right-click any tab** for quick actions — Reconnect a dropped character, Disconnect, or move it between windows (only the choices that apply are shown).
- **Windows remember where you left them** — size, position, and whether they were maximized, for the main window and for any character you've moved into its own window. If a window's monitor isn't connected any more, it opens on your main screen instead.
- **⟲ Reconnect Last** on the launcher brings your whole crew back in one click. If an account already has a different character on, Lichborne asks which you want rather than bouncing anyone.
- **Team Login** logs several characters in at once (DR allows one character per account, so it's one from each). Tick only the accounts you want, and tick **Save this line-up as a team** to remember it. Saved teams appear in a **Teams** section on the logon screen and in the **+** window — each one shows who is on it, and a single Connect logs the whole team in, skipping anyone already playing. Pin a team with the heart and it joins **Favorites** at the top; the ⋯ menu edits its name and notes, or deletes it. A long team run can be **stopped** part-way: whoever is connecting finishes, and the rest are skipped and listed so you can start them whenever you like.

---

## Feature Tour

High-level tours of what each feature does and where to configure it. Most things live behind the buttons along the top **app bar** (Panels · Maps · Automations · Lich · Settings, with more under the **⋯** menu) or the **Experiences** shelf.

### Views: Session and Overview

A **view** is the biggest switch in Lichborne — it decides what the whole window
shows. There are two, and you swap between them with the control in the top bar
next to the Lichborne wordmark (or `/view`, or **View → Session / Overview View**).

**Session** is the normal way to play, and the default: one character filling the
window, with the tabs along the top to move between them. Everything else in this
guide — panels, maps, automations, Experiences — lives here.

**Overview** replaces that with a grid of cards, one per character. It's built for
playing several characters at once, which in DragonRealms means several accounts.
Each card shows:

- **vitals** and a health percentage
- **what's wrong** — bleeding, stunned, poisoned, dead, webbed and so on
- **stance, hands and prepared spell**
- **roundtime and cast time**, ticking
- **the room** and who's in it with them
- **the worst active wound** (scars are healed history, so they aren't counted)
- **how the session has gone** — uptime, how long since anything happened, lines
  per minute, ranks gained, rooms visited, deaths, skills at mind lock
- **a live feed** of that character's game text — with your highlights, contacts
  and timestamps applied, exactly as the game window renders it

Every card also has a **showing** dropdown that changes which stream its feed
displays — the game window by default, or `conversation` to watch for somebody
talking to that character. It is per character, so a crafter can sit on the game
window while another watches conversation.

The grid sizes itself to how many characters you have: one fills the screen, two
split it, four go 2×2, and thirty stay readable (scrolling rather than shrinking
into illegibility). **Tile size** in Settings overrides that if you would rather
force them small or large.

Cards sit in **tab order** by default, matching the character tabs above them, so
they stay where you put them. `/view sort attention` reorders them instead so
whoever is worst off rises to the top — useful when things are busy, at the cost
of cards moving while you watch. Either way the Overview button carries a
**count** while you're in Session view, so you find out a character is in trouble
without having to be watching.

That number is **how many characters have something wrong** — not how many things
are wrong. A character who is both bleeding and stunned counts once. It counts
anything actually asking for you: Dead, Offline, Critical, Bleeding, Stunned,
Poisoned, Diseased, Hurt, Webbed, or Spoken to. **Idle** and **Mind locked** are
deliberately not counted — they are the normal states of a character you parked
and of one grinding a skill, and a number that is always lit is one you stop
reading. Both still show on the cards. It appears only while
you're in Session view — there is no point badging the view you are already
looking at — and only when the count is above zero, so a healthy roster shows no
badge at all. A character with nothing wrong reads a quiet **✓ calm** on its card
rather than a row of zeroes.

Clicking a card selects that character: the input bar aims at it and its tab
becomes the active one, while you stay in the Overview. Pick **All characters**
in the bar (or click empty space) to aim at everyone again — every connected
card and tab lights up, so you can see exactly who a command will reach. **Double-clicking** a
card (or **Go to … 's game session** in its menu) opens that character
full-screen. Cards
are read-only on
purpose: to send a command to someone else, use **Quick Send**
(Ctrl/Cmd+Shift+Enter), which already does exactly that. While the Overview is up,
typing and macro keys do nothing, so there's no invisible command line underneath
quietly collecting your keystrokes.

**Tuning it** — Settings → Overview, or `/view set`:

| Command | Does |
|---|---|
| `/view` | Switch back and forth |
| `/view status` | Every character and what's wrong with them, as text |
| `/view sort tab` | Stop the cards moving; keep them in tab order |
| `/view set feed=0` | Turn the text feed off (makes cards much shorter) |
| `/view set tiles=small` | Force small tiles (auto fills the space by default) |
| `/view stream conversation` | What THIS character's card shows |
| `/view set density=compact` | Tighter cards, more of them on screen |
| `/view set idle=120` | Seconds of quiet before a character reads as idle |

You can also hide any part of a card you don't want. One option is off by default
on purpose — **"flag when someone speaks to a character"** does a little extra
work for every connected character, so you opt into it rather than paying for it
unasked.

A couple of things worth knowing: the Overview shows the characters **in that
window**, so a character you've moved into its own window has its own switch over
there; and Lichborne always starts in Session view.

### Your layout: Static vs Windowed Panels

Lichborne shows the game plus side "panels" (streams like Thoughts, Combat, Room, Experience, Maps…).

- **Static Panels** (default) — panels sit docked in tidy zones.
- **Windowed Panels** — flip this in the **Layout** manager (**Layout** on the top bar → *Layout Manager*) and your *whole* layout floats: main text, input bar, vitals, status icons, and every panel become independent windows you can drag, resize, and **snap together** (they click flush to each other and the screen edges, with guide lines). Add as many panel windows as you like, hide a window's title bar for a compact look, and **lock** the layout when it's just right — locking hides every window's drag handle and border chrome, so a locked layout reads like the docked one. The drag handle sits *over* your content rather than taking a slice of it, so what you arrange is exactly what you get once locked. If the vitals / status / command bars look taller than their contents, **Fit bars to content** in the Panels manager snaps them down in one click.

Either way, **drag a stream tab along its bar to reorder it**, and add streams with a panel's **+** button. Your layout is per-character and saved across launches. *(Windowed Panels is where Lichborne is heading — see [Roadmap](#on-the-horizon-roadmap).)*

### Themes & accessibility

Open the **Theme** picker for a gallery of built-in light and dark themes, or craft your own in the **Theme Editor** (every color is adjustable). **Settings** holds font size, line height, and the accessibility options — high-contrast, color-blind palettes, large print, and an epilepsy-safe mode that calms animations. Everything you build or pick is yours and travels with [Transfer](#transfer-a-setup-between-your-characters).

### Automations: highlights, triggers, macros, aliases

The **Automations** window (the **Automations** button on the app bar) is home base for the client's native automation — **all of it works with or without Lich.** It's tabbed by rule type:

- **Highlights** — color words, names, or patterns wherever they appear in game text. Match a plain word, a phrase, or a full regex; choose whether it paints just the match or the whole line; give it a text color, background, bold, or a **text effect** — Glow, Shimmer, Rainbow, Pulse, Gold, Gradient, Fire, Frost, and more (animated effects hold still when epilepsy-safe mode is on). Overlapping highlights are resolved automatically (the most specific one wins per color property), so you never manage a priority list. Contact templates support the same effects — on the name, on the **tag**, or each with its own — and the template editor previews them live as you pick.
- **Triggers** — "when I see X, do Y." The action can send a command, play a sound, echo a note to a stream (which you can colour, bold, give a background or a text effect, just like a highlight), and more. Add **gates** (only while a Group/Mode is active) and a **cooldown** so a trigger can't spam. There's a quick form (`"pattern" do "command"`) for the common case and the full editor for multi-step triggers.
- **Macros** — bind a key (F1–F12, Ctrl/Alt/Shift combos, the numpad) to a command or a whole sequence (with optional delays between steps). Put an **`@`** anywhere in the command to drop your cursor there — perfect for fill-in-the-blank macros like `get @ from my pack`.
- **Aliases** — typed shortcuts that expand as you send them: `hh` → `health;heal`. Use `$1`, `$2`, `$rest` to pass along whatever you typed after the alias.
- **Mutes & Substitutes** — two more tabs, covered [just above](#mutes--substitutes).
- **Colors** — name the colors you use again and again, like "Buff drop" or "Danger". Pick one anywhere you choose a color (highlights, trigger echoes, contact templates, groups) and it stays linked: **change the color once and everything using it changes with it.** Click the **▾** beside any color box to choose one, or start typing a color's name and pick it from the suggestions. You can also pick any color and choose **Save as a color…** from that same list. Your colors are shared by all your characters, and the tab shows what uses each one. **The Theme Editor is the one exception:** you can pick your colors there too, but a theme **copies** the color instead of following it — so the theme still looks right when you share the file with someone who doesn't have your palette. Change that color later and your highlights update while the theme keeps the shade it took; re-pick it if you want the new one.

**How to create them — two ways, identical result:**
1. **The editors** — open the tab, click **New**, fill in the fields, save.
2. **[Slash commands](#slash-commands)** — `/highlight add "goblin" red`, `/trigger add "fully rested" do "stand"`, `/alias add "hh" "health;heal"`. A rule made this way is byte-for-byte the same as an editor-made one, and `/highlight edit "goblin"` jumps straight to it.

**"Applies to" — this character or all of them.** Every rule editor has an **Applies to** switch: keep a rule on *This Character*, or flip it to **All Characters** so it applies to your whole roster (more on that just below). If an identical rule already exists on the other side, Lichborne tells you instead of making a duplicate.

Rules are saved per character (or globally), respect your [Groups & Modes](#groups--modes), and travel with [Transfer](#transfer-a-setup-between-your-characters). Drowning in rules after an import? See [Automation Analytics](#automation-analytics).

**Set one rule, every character gets it.** Switch the Automations window's scope to **All Characters** and your highlights, triggers, macros, aliases, mutes, and substitutes apply everywhere, on every account — living right alongside each character's own rules (a character's own rule wins any conflict). Already built the perfect highlight on one character? Use its **Applies to** switch to move it to *All Characters* in one click.

### Mutes & Substitutes

Two display-layer text tools, also in **Automations**:

- **Mutes** hide lines you're tired of (arrival spam, ambient weather, a chatty NPC) — drop the whole line or strip just the matched text.
- **Substitutes** rewrite matching text into something shorter or clearer (capture groups and all).

Both are per-character, respect [Groups & Modes](#groups--modes), apply everywhere by default (or pin one to a single stream like Combat), and are **display-only** — your [Session Log](#session-logs) always keeps the original. **Right-click** any game text to mute or substitute it on the spot.

### Groups & Modes

Organize your highlights, triggers, macros, and contacts into **groups**, then flip **modes** from the toolbar to turn whole sets on and off at once — one click from *hunting* to *town*. Great for "enemy colors only in PvP" or "combat macros only while hunting."

### Automation Analytics

Got hundreds of rules (especially after importing) and no idea which still matter? Turn it on from **Automations → ⋯ → Automation Analytics** (the ⋯ sits beside the ✕; it shows a dot while Analytics is on) and Lichborne shows you, per rule: which are **broken**, exact **duplicates**, **obsolete** (already covered by a broader rule), **conflicting** (two macros on one key), **do nothing**, your **heavy hitters**, and which have gone **quiet**. Each category explains itself with an example, a one-click **Delete duplicate copies** clears the cruft, and clicking a rule jumps to it. It's **off by default** and tracks nothing until you turn it on.

### Contacts

Tag player names with **colors, prefixes, and notes**. Their name then lights up everywhere it appears in game text, and you can click it for their card. Contacts respect your active **Mode** (friend colors in town, enemy colors in PvP). Group people under reusable **templates** ("Friends," "Watchlist") so recoloring a whole crowd is one edit.

### Maps

Open the **Maps** button for two very different map views. Both track your current room live and are best with Lich (see the notes below each).

**Lich Map — native, zero setup.** Lichborne reads Lich's built-in map **artwork** straight out of your Lich installation's `maps` folder — so once your [Lich path is set](#2-set-up-lich-recommended), it just works. It shows the real map image with your current room highlighted, and it's the **most reliable tracker** because it matches by room **id**. Tip: turn on DragonRealms' room-number display (so room titles show a number like `[Town Square] (12345)`) and your marker stays locked on.

**Genie Maps — the community XML maps, from a folder you point it at.** This view renders the community-maintained **Genie XML map files** directly. The first time, point it at the **folder** where those files live (Lichborne remembers it, and caches the parse so every launch after the first is instant). It draws one zone at a time at the hand-curated coordinates the Genie maps team has refined for years, follows you as you walk, and auto-switches zones as you cross boundaries — with a pulsing sonar "you are here" ring that's easy to find.

**Rooms are color-coded by what they are — and each color has its own tiny animation** so you can recognize a room type at a glance without reading the legend:

- 🟡 **Shops** glint with gold along their edge
- ❤️ **Healers** pulse with a heartbeat
- 💧 **Water** rooms ripple outward; **underwater** rooms bubble upward
- 🍃 **Lumber** rooms drop leaves
- ⛏️ **Mining** rooms shower rusty dirt
- ✦ **Guildmaster / stat-trainer** rooms rise with XP particles
- 🌀 **Transports** swirl with magical motes

…and more. Arcs between rooms are colored by exit kind (cardinal / climb / door), and floating labels mark landmarks. A **legend (▤)** spells out every color and glyph, and a single **Genie Map Animations** setting turns *all* the motion off (the room effects and the camera glide) if you'd rather it stay perfectly still.

**Getting around, either view:** **left-click** a room to pin its route on the map (study it, no walking); **right-click** to actually walk there — the moves echo in your game window step-by-step. Cross-zone exits are marked **↗** — left-click to peek at the neighbouring zone, right-click to walk to the boundary (the map switches only once you've truly arrived, never racing ahead). Hover any room for its id, exits, category, and a preview of the path you'd take.

*(Both views rely on Lich map data. Coming from Genie? The Genie XML maps often live in your Lich `maps` folder already — point the Genie view there.)*

### The Room window

A **Room** panel that reads like the game itself — title, description, "You also see…", and "Also here:" lines, always visible and never scrolling away — plus a clickable **"Obvious paths: north, east."** line and a small ⚔ count when creatures are present. Your contact colors, highlights, and mutes paint it exactly like the main window.

### Vitals & timers

Your health/mana/etc. show in the **vitals bar** (there's a **Compact Vitals** option in Settings). **Roundtime** and **cast-time** live right inside the command box as a draining bar or per-second chips (your pick in Settings). DR's **aim timer** (`toggle aim`) rides there too in green. Colors are yours in the Theme Editor.

### The Experience panel

Your skills, ranks, and learning-rate. Turn on **Compact Experience** in Settings for a dense, text-forward readout (Skill · Ranks · % · learning-rate per row, colored by how close each is to mind-lock), with a tidy summary on top. Pin your circle-up skills to the top.

### Session logs

Lichborne keeps a clean, dated **plain-text log** of every character's session — game text, channels, commands you typed, connect/disconnect notices — one file per character per day, that you own. The **Logs** button opens an in-client viewer: scroll the recent tail, filter stream layers, search across days, and right-click any game line to jump to it. The **Export** builder turns any date range and stream selection into a clean transcript (keep or strip timestamps and tags) and saves it or copies it to the clipboard. Logging is **on by default** and configurable in Settings.

### Slash commands

Type `/` in the command bar and a completion **palette** opens, listing every client command with what it does (**Tab** completes, **Enter** runs, **Esc** closes). It's the fastest way to configure things without opening an editor:

`/highlight add "goblin" red` · `/mute add "swirling fog"` · `/sub add "a musty odor" "STINK"` · `/contact add "Bob" Friends` · `/alias add "hh" "health;heal"` · `/trigger add "fully rested" do "stand"` · `/mode Hunting` · `/panel open thoughts` · `/theme parchment` · `/log search "wedding"` · `/clear`

Client commands **never reach the game** — a typo gets a hint instead of leaking to DR, and `//` sends a literal `/` line. Type `/help` for a plain-language overview, or `/help highlight` (or any command) for its exact arguments. Rules made this way are identical to editor-made ones. Full list in [Appendix A](#appendix-a--slash-command-reference).

### Lichborne Experiences

**Experiences** are graphical scenes — "graphics for a text game" — that render *over* your layout without touching your panels or streams. They read the same game text you already see and turn it into something visual. They're the newest, most playful part of Lichborne, and there are more on the way ([Roadmap](#on-the-horizon-roadmap)).

**How they work:**

- Open the **Experiences** button for a shelf of them. Each opens as a **floating window** you can move, resize, and snap like any other.
- Prefer a tidy layout? **Host an Experience as a regular panel tab** instead — every panel's **+** menu lists Experiences below a separator, marked with an **[e]** badge. Tuck the sky in next to your Thoughts tab and save the screen space.
- Each Experience **costs nothing until you open it**, respects your **theme** and **epilepsy-safe** setting, and always treats the game text as the source of truth.
- Hover an Experience for its own controls: **A− / A+** sizes all its text, and **⚙ "Show in this scene"** ticks exactly which layers you want to see. Your choices are remembered **per window**.

There are three Experiences today, all **[Beta]**:

#### Living Tableau

Your room, rendered as a living scene.

- **Everyone becomes an avatar** in their [Contact](#contacts) colors. Your Contacts wear a ✦ and are **clickable** for their card. Your own avatar shows your condition (hidden, bleeding, dead, and the rest).
- **Speech blooms as comic bubbles** — whispers dotted and private, emotes as action captions. **Telepathic thoughts collect in a quiet log in the bottom-left corner** (newest at the bottom, older ones fading up) so they never cover the scene.
- **Arrivals slide in** from the direction they came; **departures walk out** as fading ghosts. Hiders and the invisible show as shadows; the dead lie greyed until a resurrection stands them up.
- **The seating tells the story** — talkers gather toward the middle (you included), pairs in conversation drift together, and a crowd spreads into an amphitheater.
- **Creatures stand as their own figures** in the game's monsterbold color (four blademasters are four monsters).
- **When you fight, it becomes a combat cockpit** (Beta, and it costs nothing until a fight): three **readiness rings** wrap your avatar (roundtime, cast, aim — each its own color), your avatar **pulses** when you're stunned or bleeding, and a small panel reads your **balance** and **position** as red→yellow→green gauges. Run **`ASSESS`** and the creatures arrange by where they actually stand — *facing you*, *flanking*, or *behind* — with your target **ringed in gold**, the ones in melee glowing, and any that are reeling shown off-balance. **Click a creature to turn and face it.** The ones you fell stay as marked corpses until they decay.

#### Moons

Elanthia's night sky and world, alive.

- The **three moons** — sooty **Katamba**, ruby **Yavash**, ice-blue **Xibar** — and the **sun** arc across a living sky, positioned by how long each has left, then travel a shallow path underground back to where they'll rise (nothing ever just blinks out).
- The **whole sky lives**: bright at midday, warm glows at sunrise and sunset, deepening night with **stars that fade in** through twilight and multiply toward midnight, the odd **shooting star**, seasonal **aurora** and **fireflies**, and a mountain silhouette on the horizon. Each **moon is lit from the sun's direction** so you watch it wax and wane in its own colors.
- Below the horizon, a little **wilderness** — distant forest, foreground trees, a winding stream and a **lake that mirrors the sun and moons** — that **dresses itself by season** (snow and ice in winter, blossoms in spring, lush summer, falling leaves in autumn) and casts **sun-following shadows**.
- **Header and footer strips** read the sky at a glance: day/night with the sun's countdown, the next moon, and the current **weather** up top; the **Elanthian date** below. **Hover any body for its lore** and its next rise/set time, with live "sets in 88m" countdowns throughout. A single **⟳** silently refreshes the weather and date (it sends `WEATHER`/`TIME` behind the scenes — nothing clutters your game window).
- **Powered by the community `moonwatch` script** — run `;moonwatch window` on a Lich character to feed it the moons. Even without it, you still get a day/night sky from public sun data.

#### Spell Monitor

Everything currently on you, as live countdowns.

- **One cell per effect**, in a grid that reflows to whatever shape you give the window. By default they appear in the order the game itself lists them, which stays put as timers tick; flip on **Soonest first** in the **⚙** if you'd rather have whatever is about to run out lead the grid.
- Each cell carries a **duration bar** that drains as the effect does. Lichborne isn't told how long a spell lasts, so the bar learns it: the longest you've ever seen an effect run becomes its full mark, and a recast visibly refills it.
- Each effect runs **green while it's full, amber past the halfway mark, and red as it nears its end**, with an optional pulse on the red ones. The colors adapt to your theme — deepening on light ones, brightening on dark — and follow your color-blind setting if you have one. (Epilepsy-safe turns off the pulse and keeps the colors, so you lose nothing.)
- Because the game never tells a client how long a spell *should* last, a freshly-noticed effect can't be judged as a percentage yet — so an effect with only a minute or two left always shows as ending regardless, rather than pretending to be full.
- **Times read in whole minutes** — `28m`, then `<1m` at the end. The game reports your effects to the minute, so showing you a ticking `28:04` would be inventing precision that was never there.
- **An effect ends in two steps, and you see both**, because they tell you different things:
  1. **"expired"** — the time the game gave you has run out. The cell stays lit and red, ringed to catch your eye. This is the moment to act, but it isn't the last word: the game counts in whole minutes, so an effect at `1m` may have almost another minute left, and a refresh can put an expired cell straight back to counting down.
  2. **"ended"** — the game has stopped listing the effect, which is the one thing that settles it. The cell greys out and drains of colour, so you can see exactly what lapsed and needs recasting rather than watching it vanish. **It counts down to its own removal** — `ended 45s`, with its bar draining alongside — so you can see how long you've still got to notice it. It clears when you recast it, or when that countdown runs out. (⚙ **Ended effects**, on by default — turn it off and a spell simply disappears when it's done.)

  Hover any cell and the tooltip tells you which of the two you're looking at.
- Effects the game lists **without** a countdown — a Trabe Chalice reading *"intact, fading"*, say — are shown too, quietly, after everything that has a timer. Nothing that's on you is ever hidden just because Lichborne didn't recognize the wording. Anything the game marks as *Fading* goes to the very top instead — that's it telling you an effect is about to lapse.
- **Skill badges** put a letter chip on each effect for its magic skill or ability type — **[A]**ugmentation, **[U]**tility, **[T]**argeted Magic, **[D]**ebilitation, **[W]**arding, **[C]**antrip, **[X]** metamagic, and for Barbarians and Bards **[F]**orm, **[B]**erserk, **[M]**editation, **[R]**oar and **[S]**cream. Each has its own colour, so one kind is easy to pick out; hover for the full name and guild.
- **Abbreviations** switch the display to the game's short names — **ECRY** rather than *Eillie's Cry* — so what you see about to expire is what you type to renew it. Anything without a known abbreviation keeps its full name. (Thief Khri have no badge or abbreviation: they aren't in the reference data Lich publishes.)
- **Group by skill** gathers effects under a heading for their skill or ability type — all your Wards together, all your Augmentations together. For a Barbarian that means Forms, Berserks, Roars and Meditations each in their own block. It combines with Soonest first, which then orders within each group. (Thieves get one "Other" block: Khri aren't in the reference data.)
- **Abbreviations**, **Soonest first** and **Group by skill** all start **off** — the window opens with full names in the order the game itself lists them, which stays put as timers tick. Turn on whichever you want from the **⚙**. Your choices are remembered per character and travel with a [Profile Transfer](#profile-transfer).
- Every colour here — the twelve badges and the three countdown states — is editable in the **Theme Editor** under **HUD**, if you want your own scheme.
- **The header bar shows the feed's status** — *updated 3s ago · every ~6s* — when DragonRealms last sent the list, and roughly how often it's been sending it. It answers the question a motionless grid otherwise raises: the list only changes when your effects do, so a number ticking up beside a still grid means everything is working and nothing has changed. The cadence appears once Lichborne has seen enough refreshes to say so honestly, and it's measured rather than assumed — DragonRealms decides when to send, and there's no command known to ask it for one. (⚙ **Feed status**, on by default; it lives in the header bar, so hiding that hides this too.)
- **It shrinks to a strip.** The window can be dragged down to roughly the height of a single row of cells, so it can sit as a thin band across the top of your layout rather than a box — turn off the header bar in the **⚙** for the tightest fit.
- **No Lich required** — this reads DragonRealms' own spell readout, so it works exactly the same on a direct connection. The same information in text form is the **Active Spells** panel.

*(Every layer above — bubbles, thoughts, combat rings, weather effects, seasons, and more — is an individual **⚙** toggle, so you can dial each Experience to taste.)*

### AI: Catch Me Up

Lichborne can use **Claude** to help you out — entirely on your terms.

**The ground rules (they never change):**

- **Off by default, completely optional.** Nothing happens until you turn it on.
- **Bring your own key.** You plug in *your own* Anthropic API key in **Settings → AI**, stored **encrypted on your machine** (never in your profile files, never sent to any Lichborne server — there isn't one). Pick your model there too — **Haiku 4.5** (fast & cheap, the default), **Sonnet 5**, **Opus 4.8**, or **Fable 5** (premium); higher tiers cost more per request, billed to your key.
- **Opt-in per feature.** Each AI feature has a one-time disclosure you accept before it can send anything.
- **AI advises and summarizes — it never plays the game.** It **cannot** send commands to DragonRealms, ever. That's a hard line, which keeps every AI feature inside Simutronics' rules.
- **Your private info is protected.** Your account **PIN / identification numbers, passwords, and account username** are scrubbed from the text before anything is sent — while your log on disk stays untouched. Full details in **[AINOTICE.md](AINOTICE.md)** (also linked in Help → About).

**The first feature — Catch Me Up.** Wandered off and came back? Type **`/ai catchup`** and it fills you in like a companion sitting in your client.

- **Ask for any window.** Bare `/ai catchup` covers the **last 30 minutes**; or give it a span — `/ai catchup 27m`, `1.5h`, `2.5h`, `7d`, even `1y` (units: `m` minutes · `h` hours · `d` days · `mo` months · `y` years).
- **It reads your session log** for that character across the exact window you asked for — so a 2.5-hour catchup really covers 2.5 hours, not just what's still on screen — and pays attention to what you care about coming back: **ranks and skills gained, what was attacking you and any wounds, deaths, who spoke to you and how it went, work orders finished, and money earned or banked.**
- **It tunes itself to the window** — a quick "what did I miss" for 30 minutes, a proper retrospective for a year — and shows a **"Working on it…"** progress note while it reads long spans, then streams the recap in. It always says honestly what it covered.
- **Logging off? It still works** — it falls back to summarizing what's on your screen, and tells you it did.
- **Give it a personality (optional & fun).** Set a **Response voice** in Settings → AI — *a 90s TV news anchor*, *a salty pirate*, *an over-caffeinated bard* — and your recaps get delivered in that voice. It changes only *how* the summary reads, never the facts. Leave it blank for the usual warm, natural style.
- **It tells you how it was made.** Every recap header is concise — the **start–end time** it covered (e.g. *14:05–16:05 (2h)*), tidy counts, the **model** it used (*via Sonnet 5*), and the **voice** if you set one — never a black box. If the model ever returns a blank response (an occasional hiccup), Catch Me Up quietly retries once on its own.
- **Give it a home** — send AI output to its own **`lbAI`** stream (add it to any panel or window) so summaries stay out of your game scroll. It's **per-character**, and costs a fraction of a cent per summary on the default model.

**Slash commands:** `/ai` (status) · `/ai on` / `/ai off` · `/ai key` (opens Settings) · `/ai catchup [window]` · `/ai stop` (cancel a running summary).

*More AI helpers are designed and on the way — always optional, always with a working non-AI fallback, always privacy-first ([Roadmap](#on-the-horizon-roadmap)).*

### The Lich Dashboard

The **Lich** button opens a dashboard for the Lich features Lichborne surfaces (Lich required). It lets you tweak your Lich setup **without leaving Lichborne** or hunting through files:

- **Variables** — view, add, edit, and delete your Lich `Vars` right in the app. It's a friendly, reliable replacement for `;vars setup` (no fiddly script window). Changes are written safely through Lich itself, so scripts pick them up correctly. *(You can only edit the variables of the character that's currently connected; other characters' scopes are browse-only.)*
- **Scripts** — see which Lich scripts are running at a glance. You can also add a **Lich Scripts** panel to your layout to keep that list in view while you play.
- **Profiles — quick edits to your character's Lich YAML.** This is where your Lich *scripts* read their per-character settings (hometown, safe room, health thresholds, hunting lists, and so on — the `{Character}-setup.yaml`-style files). The dashboard shows them with a proper YAML editor and line numbers, so you can **make a quick change to a character's Lich profile right inside Lichborne** instead of opening the file by hand. Lichborne validates and saves it safely (it writes atomically so a mistake can't corrupt the file), and Lich re-reads it the next time a script starts.

> **Two different "profiles" — don't mix them up.** The **Lich profiles** here are the YAML files your **Lich scripts** use. Your **Lichborne profile** (your themes, panels, highlights, and the rest) is separate and saved automatically — see [Appendix C](#appendix-c--where-your-settings-live).

### Coming from another client

Switching from **Genie**, **Frostbite**, or **Wrayth**? The **import wizard** brings your setup with you. Open it from **Automations → ⋯ → "Import from another client…"** (the ⋯ sits beside the ✕), pick your old client, and point it at that client's config files.

**What maps to what:**

| From your old client | Becomes in Lichborne |
|---|---|
| Text **highlights** (with their colors) | [Highlights](#automations-highlights-triggers-macros-aliases) |
| Your **name list** | [Contacts](#contacts) — each name-color becomes a reusable **template** you can rename ("Friends," "Enemies") so recoloring a whole group is one edit |
| **Macros** / key bindings | [Macros](#automations-highlights-triggers-macros-aliases) (all of Wrayth's macro sets, not just the default one) |
| **Aliases** *(Genie)* | [Aliases](#automations-highlights-triggers-macros-aliases) |
| **Triggers** *(Genie)* | [Triggers](#automations-highlights-triggers-macros-aliases) |
| **Gags / ignores** | [Mutes](#mutes--substitutes) (hide lines) |
| **Substitutions** | [Substitutes](#mutes--substitutes) (rewrite text) |
| **Color presets** | a ready-made custom **theme** |

**Which files to point it at:**

- **Genie** — the `.cfg` files (`highlights.cfg`, `names.cfg`, `macros.cfg`, `aliases.cfg`, `triggers.cfg`, `presets.cfg`, `gags.cfg`, `substitutes.cfg`).
- **Frostbite** — the `.ini` files (`highlights.ini`, `macros.ini`, `ignores.ini`, `substitutes.ini`, `general.ini`).
- **Wrayth** — your Wrayth XML export.

**The workflow:** a **preview screen** shows exactly what will import — with real color **swatches** — so there are no surprises. Anything that really belongs in Lich (like variables) is **counted and flagged** rather than imported. Choose **Append** (add alongside what you have, skipping duplicates) or **Replace** (swap in the imported set), and you're done. You can re-run it any time.

*(Moving a setup between two **Lichborne** characters instead? That's [Transfer](#transfer-a-setup-between-your-characters), below — not this wizard.)*

### Transfer a setup between your characters

Got one character configured just right and want your others to match? The **Transfer** button on the **launcher** does exactly that. It's one window with two tabs:

**Export** — pick **any** character (even one that's disconnected — it reads the saved setup, not the live session), tick the pieces you want to include, and Lichborne writes a portable **`.lb.yaml` bundle** into your `Exports\` folder.

**Import** — pick a bundle (from `Exports\`, or **Browse…** to anywhere), tick which pieces to apply, and tick **which of your characters** to apply them to — as many as you like at once.

**What you can transfer** (tick exactly what you want):

- **Display & Accessibility** — fonts, contrast, color-blind, large-print, epilepsy-safe
- **Panel Layout** + **Panel View Preferences** — your zones/windows, sizes, and per-panel view options
- **Theme** and **Named Colors**
- **Highlights · Triggers · Macros · Aliases · Mutes · Substitutes**
- **Groups & Modes**
- **Contacts** (and their templates)
- **Experiences** (your scene options)
- **Global Rules (All Characters)** — your whole-roster rules travel as their own category

**How the merge works:** choose **Append** (add alongside what the target already has, skipping duplicates) or **Replace** (overwrite that rule type on the target). Either way it's **non-destructive to identity** — a character's name, account, game, guild, favorites, and notes are *never* touched.

**When it takes effect:** connected characters update **live**; the rest pick it up the next time you open them.

*(This is the tool for moving a setup between your **Lichborne** characters. Coming from Genie/Frostbite/Wrayth instead? That's the [import wizard](#coming-from-another-client), above.)*

### Command-line niceties

The little things your fingers already know:

- **Repeat keys** — `Ctrl+Enter` re-sends your last command, `Alt+Enter` the one before, `NumpadEnter` sends what you've typed (or repeats the last if empty). Rebindable like any macro.
- **Numpad movement** — set up automatically per character: `Num8/2/4/6` = N/S/W/E, corners are diagonals, `Num5` = out, `Num0` = down, `Num.` = up. Any key you've already bound is left alone.
- **Semicolon chaining** — type `n;n;e` on one line like Genie. Anything starting with `;` goes to Lich untouched; `\;` sends a literal semicolon.
- **History that survives restarts** — ↑/↓ recall per character, ↑ keeps the half-typed line you were on (↓ brings it back), and **Esc** clears the bar.
- **Just start typing** — printable keys land in the command bar wherever your focus is, so no keystrokes are lost mid-hunt.
- **Ctrl+F** searches the live game window itself — land on the latest match, walk older/newer with Enter / Shift+Enter, Esc back to play.

### Free SimuCoins, claimed for you

Simutronics gives subscribers **free SimuCoins every month — but only if you claim them.** Lichborne can watch for them.

- **Turn it on per account**: **Settings → SimuCoins**, and flip the switch next to the account. Everything about setup lives there — which accounts are watched, Auto-claim, and each account's current status. (Only accounts whose password you've saved can be watched; there's nothing else to sign in with.)
- **When coins are waiting** the **coin** in the top bar lights up as **polished gold with a shine sweeping across it**, showing the count — click it, then **Collect available coins** to take them from every watched account at once. Prefer hands-off? Tick **Auto-claim** for that account and Lichborne claims them the next time it checks. (Epilepsy-safe mode keeps the gold and drops the shimmer.)
- **When there's nothing to claim** the coin sits **dull and quiet**, and the popover shows the store's own countdown to your next allotment.
- **By keyboard**: `/simucoin` (status), `/simucoin check`, `/simucoin claim` — or just `/sc`.
- **Checked once when you start the client**, plus whenever you press *Check now*. There's no background polling.

**What it does with your password:** nothing at all until you enable it for an account — and **Settings → SimuCoins** spells out exactly what will happen, right above the switch that does it. Once enabled, Lichborne signs in to **store.play.net** (Simutronics' own store) over HTTPS using the account password you already saved in Lichborne, reads your balance, claims if you asked it to, and signs out. Nothing goes anywhere else, and no store data is written to disk. You can turn any account back off in the same place. *(Thanks to Thires, whose [Genie SimuCoins plugin](https://github.com/Thires/SimuCoins) showed how this works.)*

---

## Feature Matrix: With Lich vs Without Lich

Lich is the **recommended** way to play — it unlocks the map, timers, variables, and scripting features. But Lichborne is built so a **direct** (no-Lich) connection stays genuinely usable: everything either works the same or degrades gracefully. Lichborne's **native automation is itself the no-Lich fallback** for players who don't script.

| Feature | With Lich (recommended) | Direct / no Lich |
|---|---|---|
| Connect & play | ✅ | ✅ |
| Attach to a running Lich session | ✅ | — (needs Lich) |
| Themes, fonts, accessibility | ✅ | ✅ |
| Static / Windowed Panels | ✅ | ✅ |
| Highlights · Triggers · Macros · Aliases | ✅ | ✅ (native) |
| Mutes & Substitutes | ✅ | ✅ (native) |
| Groups & Modes | ✅ | ✅ |
| Contacts | ✅ | ✅ |
| Automation Analytics | ✅ | ✅ |
| Room window | ✅ | ✅ |
| Vitals & RT/CT/aim timers | ✅ | ✅ |
| Experience panel | ✅ | ✅ |
| Session logs | ✅ | ✅ |
| Slash commands | ✅ | ✅ |
| Command history · search · numpad · semicolons | ✅ | ✅ |
| Living Tableau Experience | ✅ | ✅ (reads game text) |
| AI — Catch Me Up | ✅ | ✅ (reads your log) |
| Import wizard · Transfer | ✅ | ✅ |
| Moons Experience | ✅ (with `;moonwatch`) | ⚠️ day/night only |
| Spell Monitor Experience | ✅ | ✅ |
| Lich Map · Genie Maps | ✅ | ❌ (needs Lich map data) |
| Variables · Scripts · Profiles (Lich Dashboard) | ✅ | ❌ (Lich only) |
| Spell/buff timers, `go2` walking, repository | ✅ | ❌ (Lich only) |

*Legend: ✅ works · ⚠️ works in a reduced form · ❌ needs Lich. More detail in [Appendix B](#appendix-b--lich-vs-direct-in-depth).*

> **A note on Lich-powered data.** Some features draw on things only **Lich** provides — the **map data**, community **scripts** (like `moonwatch`), Lich's **`drinfomon`** game-state modules, and **DRStat** variables. **Anything that relies on those may be reduced, degraded, or simply unavailable on a direct (no-Lich) connection** — and can also be affected if the underlying Lich script or a future Lich version changes. Lichborne always tries to degrade gracefully (fall back or hide, never crash), but if a feature depends on script- or Lich-provided data, treat full functionality as a **Lich** thing.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `PageUp` / `PageDown` | Scroll the text window up / down a page |
| `Home` / `End` | Move the cursor to the start / end of your typed command |
| `Ctrl+Home` | Jump to the top of your text history |
| `Ctrl+End` | Jump back to the bottom and resume auto-scroll |
| `Ctrl+1` … `Ctrl+9` | Switch to character tab by slot |
| `Ctrl+Tab` | Cycle to the next character tab |
| `Ctrl+Shift+Enter` | Quick-Send — sends to **all** connected characters by default; untick to pick specific ones (pre-filled from the active command bar) |
| `Ctrl+F` | Search the live game window |
| `Ctrl+Enter` / `Alt+Enter` / `NumpadEnter` | Repeat last / second-to-last / send-or-repeat |
| `Esc` | Close the dialog on top — only that one. In the command line, clear it (or close the slash palette) |
| `Tab` / `Shift+Tab` | Move between buttons, tabs, list rows and switches; `Enter` or `Space` uses the one in focus |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom the window in / out / reset |

Plain `Home`/`End` edit the command box (where your cursor usually is); hold `Ctrl` to scroll the story window instead. Macro hotkeys (F1–F12, Ctrl/Alt combos) are set up in the Automations panel.

**On a Mac**, the Cmd key also works for the Lichborne chords — `Cmd+1…9`, `Cmd+Tab` isn't available (macOS owns it) but `Ctrl+Tab` works, `Cmd+Shift+Enter`, `Cmd+F` — and the Ctrl versions all keep working. Cmd+C/V/X/A always stay native, and Cmd combos can't be bound as macros (they belong to the OS).

---

## Getting Help

> **Reporting a bug?** Open **Help → About Lichborne** and include the line under
> the logo — it reads something like `v0.18.3 · macOS arm64` and tells us which
> build you're on. Windows, macOS and Linux behave differently in a few places,
> so that one line often saves a round-trip.


- **Discord** — the friendliest place for questions, bug reports, and chat. The invite link is in **Help → About Lichborne** inside the app.
- **Help → About Lichborne** — shows your exact version, the credits, and links to the Discord and the project on GitHub. Handy to have open when reporting an issue (mention your version!).
- **GitHub** — [issues and releases](https://github.com/SekmehtDR/Lichborne) live here.

When something looks off, a quick note with **your version number** and **what you were doing** is gold. Thank you!

---

## Appendix A — Slash Command Reference

Type `/` for the live palette; type `/help` in-game for the always-current list, or `/help <command>` for a command's exact arguments. The highlights:

**Automation**
- `/highlight add "pattern" <color>` · `/highlight edit "pattern"` · `/highlight list`
- `/trigger add "pattern" do "command"` · `/trigger edit …` · `/trigger list`
- `/macro …` · `/alias add "hh" "health;heal"` · `/alias list`
- `/mute add "pattern"` · `/sub add "find" "replace"` (with a live before→after preview)
- `/contact add "Name" <Template>` · `/template add "Name" <color> tag="[T]"`

**Client control**
- `/mode <Name>` (bare `/mode` lists modes) · `/group on|off <Name>`
- `/panel open|close <stream>` · `/theme <name>` · `/clear`
- `/timestamps on|off` · `/log search "text"`
- `/colors` (shows every named color) · `/colors add "Buff drop" #ff9040` · `/colors rename "Buff drop" "Buffs"` · `/colors remove "Buffs"` · `/colors manage` (opens the Colors tab)

**AI**
- `/ai` (status) · `/ai on|off` · `/ai key` (points to Settings) · `/ai catchup [30m|2h|7d|1y]` · `/ai stop`

**Account**
- `/simucoin` (balance + whether free coins are waiting) · `/simucoin check` · `/simucoin claim` — short form `/sc`

Notes: `edit` on any rule jumps straight to it in the editor; your real mode/group/stream/theme/template names appear as clickable chips as you type; `//text` sends a literal `/text` to the game.

---

## Appendix B — Lich vs Direct, in depth

**Why Lich is recommended.** Lich is a community proxy that sits between you and the game. It owns the heavy lifting: the **map data** Lichborne draws, **spell/buff timers**, persistent **variables**, and the whole **scripting** ecosystem (including `go2` travel and the repository). Connecting through Lich lets Lichborne surface all of that.

**What still works direct.** Everything that's about *display and configuration* is native to Lichborne and needs no Lich: themes, panels, the full automation suite (highlights/triggers/macros/aliases/mutes/substitutes), groups & modes, contacts, the room window, vitals, RT/CT/aim timers, the experience panel, session logs, slash commands, the Living Tableau, and even Catch Me Up (it reads your session log, not Lich). Lichborne's native automation is deliberately the **fallback** that makes a no-Lich connection viable — it's finite and GUI-configured by design, not a scripting engine (that's Lich's job).

**What degrades or needs Lich.** The **maps** need Lich's map files. The **Moons** Experience is powered by the community `moonwatch` script (Lich) — without it you still get a day/night sky from public sun data, but not the moons. **Variables, scripts, profiles**, spell timers, and `go2` walking are Lich features by nature. More broadly: **any feature that draws on Lich scripts, Lich's `drinfomon` game-state modules, or DRStat variables can lose functionality on a direct connection** (and may be affected if the underlying script or a future Lich version changes). Lichborne degrades gracefully wherever it can — falling back to what the raw game stream provides, or hiding a piece rather than breaking — but if something depends on script- or Lich-supplied data, count on it being a Lich feature.

**The bottom line:** you can absolutely play direct, and it's a good experience — you'll just be missing the map and the script-powered extras. Most players run Lich.

---

## Appendix C — Where your settings live

Your setup is saved as plain **YAML** files you own — back them up, copy them to another machine, or share them. Everything lives in Lichborne's app-data folder:

| System | Folder |
|---|---|
| Windows | `%APPDATA%\lichborne\` |
| macOS | `~/Library/Application Support/lichborne/` |
| Linux | `~/.config/lichborne/` (or `$XDG_CONFIG_HOME/lichborne/` if you've set it) |

```
lichborne/
  profiles/
    {Character}.yaml   — one file per character (your per-character setup)
    _shared.yaml       — app-wide settings shared by every character
  Exports/             — Transfer bundles (.lb.yaml) you export
  Logs/
    {Character}/       — session logs, one folder per character
  TriggerLogs/         — files written by a trigger's "log to file" action
  window-state.json    — where each window was last placed (this computer only)
```

Because it's all plain text, nothing is locked in. You almost never need to touch these by hand — Lichborne saves automatically, and [Transfer](#transfer-a-setup-between-your-characters) is the friendly way to move a setup between your own characters. But here's what's where:

### Your character profile (`{Character}.yaml`)

One file per character, holding everything that's *about that character*:

- **Who it is** — account, character name, game/shard, whether it uses Lich, plus launcher extras: favorite, hidden, guild, circle, and your free-text **notes**.
- **Its theme.**
- **Everything you've set up for it** — panel layout & sizes, fonts & accessibility, all your highlights / triggers / macros / aliases / mutes / substitutes, contacts, groups & modes, your Experience scene options, map view preferences, and even your per-character command history.

### The shared profile (`_shared.yaml`)

One file, for the things that make sense **app-wide** rather than per character:

- **Your Lich setup** — the Lich path, Ruby path, port, and frontend.
- **Where your map folders are** (the Lich and Genie map directories).
- **Session-log preferences** (see below).
- **Custom themes** you've made and your **named colors**.
- **All-Characters (global) rules** — the highlights/triggers/macros/aliases/mutes/substitutes you set to apply to your whole roster.
- **AI settings** (your model choice and consent flags — *not* your API key; see below).
- **App preferences** — "open each character in its own window," whether Analytics is on, and the "Reconnect Last" roster.

> Your **API key** (if you use AI) is stored **separately and encrypted** by your operating system (DPAPI on Windows, the Keychain on macOS, libsecret or KWallet on Linux) — it's never part of these YAML files and never leaves your machine except to talk to Anthropic. See [AINOTICE.md](AINOTICE.md).

*(Heads up: these are **Lichborne's** profiles. Your **Lich script** profiles are different files, inside your Lich installation — edit those from the [Lich Dashboard → Profiles](#the-lich-dashboard).)*

### Logging

Lichborne keeps a clean, dated **plain-text log** of every session — the game text, side-channels, the commands you typed, and connect/disconnect notices. Files are organized one **folder per character**, one **file per day** (`Logs\{Character}\`), so they're easy to browse or archive. They're yours: plain text, nothing proprietary.

- **On by default**, and fully configurable in **Settings → Session Log** — what gets captured, how long logs are kept, and whether older days are compressed to save space.
- Read them without leaving the app via the **[Logs button](#session-logs)** (recent tail, search across days, jump-to-line), and build a clean transcript with the **Export** tool.
- Logs are kept **pristine** — features that transform your view (like [Mutes & Substitutes](#mutes--substitutes)) and the AI redaction that protects your private info **never** alter what's written to disk.

---

## Appendix D — Troubleshooting & known limits

- **Platforms:** Windows x64 (stable), Linux x64 AppImage (beta), macOS Apple Silicon (beta). Linux/Mac are new in v0.18.0 — report anything odd on Discord.
- **First-install warnings** — expected on two platforms (no code-signing certs): Windows SmartScreen → **More info → Run anyway**. On macOS the download is quarantined, and Apple Silicon words that as **"Lichborne is damaged and can't be opened"** — it isn't damaged, that's Apple's phrasing for "not notarized". Clear it once with `xattr -cr /Applications/Lichborne.app` (or use **System Settings → Privacy & Security → Open Anyway** if macOS offers that instead).
- **Mac: no auto-update.** Unsigned builds can't self-update (an Apple rule) — grab new versions from the Releases page. Windows and Linux auto-update normally.
- **Mac: "Lichborne wants to access your Desktop"?** That's the Lich **Auto-detect** looking for the wiki-standard `~/Desktop/Lich5` install — allow it (or browse to Lich manually).
- **Linux: "Remember password" greyed out?** No keyring service found — install GNOME Keyring or KWallet; until then, type the password each session.
- **Linux/Mac: Lich won't launch from Lichborne but runs in a terminal?** Point the Ruby path at the **full rbenv path** (`~/.rbenv/shims/ruby`) — apps launched from the desktop don't see your shell's PATH. Auto-detect does this for you.
- **Map marker stuck?** The Lich Map tracks by room id and is most reliable — turn on DR's room-number display so titles show a number like `[Town Square] (12345)`. The Genie Map matches by room name + description (its data has no ids), so in areas full of identically-named rooms it can briefly lag. A **`LOOK`** resyncs either map.
- **Hand bar says "Empty" but you're holding something?** The common cause was fixed in v0.13.3. For rare genuine gaps (e.g. spell-summoned items DR doesn't announce), a **`GLANCE`** always resyncs your hands.
- **Lich won't start after updating Lich?** Recent Lich versions require a newer **Ruby** — check your Ruby version first. And if a very recent Lich shows raw protocol "garbage" instead of the normal game feed, update Lich to its latest patch (a known Lich-side hiccup fixed upstream).
- **Ruby GTK script windows** (e.g. `kill-counter.lic`, `;vars setup`) are supported as of v0.9.1 (Lichborne now launches Lich the way Frostbite/Genie do). For variables specifically, the **Lich Dashboard → Variables** editor does the job in-app with no script window needed.

Still stuck? **Join us on Discord** (link in **Help → About Lichborne**) — we're happy to help.

---

## License

Lichborne is free, open-source software under the [BSD 3-Clause License](LICENSE) (© 2026 Sekmeht and Binu) — the same license as Lich itself. DragonRealms and StormFront are trademarks of Simutronics Corp.; Lichborne is an independent community project, not affiliated with or endorsed by Simutronics, and playing through it requires your own Simutronics account under Simutronics' terms of service.

---

*Happy adventuring in Elanthia! 🐉*
