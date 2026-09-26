# Lichborne

A DragonRealms client for people who've spent years in StormFront, Genie, or Frostbite — and have opinions about all three.

It connects through [Lich5](https://github.com/elanthia-online/lich-5) (recommended) or straight to the game server, and it's free.

**[Download the latest release →](https://github.com/SekmehtDR/Lichborne/releases/latest)** · Windows · Linux (beta) · macOS (beta)

<!-- A screenshot belongs here — a client is a visual product, and one image of a
     real layout says more than any paragraph below. Ideally a populated window:
     game text, a couple of panels, the vitals bar. -->

---

## What it is

A front-end for DragonRealms: the window you actually play in. It renders the game, gives you somewhere to put your streams, and remembers how you like things.

It isn't a replacement for Lich — Lich still owns your scripts, maps, and automation. Lichborne is the display and configuration layer on top, and it makes what Lich already knows visible. You can also play without Lich entirely; you'll just be doing more by hand.

**Status: alpha.** Actively developed, used daily by a small group of testers. Windows is the mature platform; Linux and macOS builds work but are younger. Come say hello in [Discord](https://discord.gg/ZDkXCeR72J).

---

## Why it's different

- **Your setup follows you.** Everything saves to plain YAML files, per character — panel layout, highlights, macros, contacts, theme. Copy them to another machine, back them up, or hand one to a friend.
- **Every character in one window.** Tabs, `Ctrl+Tab` to switch, and Quick Send to fire a command at another character without leaving the one you're on. Pop any character into its own window and it all still works.
- **See every character at once.** DragonRealms is one character per account, so multi-boxing means tabbing around to find out who needs you. Switch to **Overview** and every character in the window becomes a live card — vitals, what's wrong, the room, and a feed of their game text — with an input bar to type at one of them or all of them. Switch back and nothing has moved.
- **Panels that float or dock.** Keep the tidy docked layout, or switch to Windowed Panels and drag everything where you want it — windows snap to each other, then lock so nothing moves by accident.
- **Your session can outlive the client.** Start Lich headless and Lichborne will *attach* to that already-logged-in session, so closing the window doesn't log you out — reopen later, recover from a crash, or pick the same character up from another machine. ([how](Lichborne-User-Guide.md#3b-or-attach-to-a-lich-thats-already-running))
- **Bring your old config with you.** The import wizard reads Genie, Frostbite, and Wrayth configs: highlights with their colours, macros, name lists, gags, substitutions, and colour presets. It shows you exactly what it will import before it does.
- **Graphical Experiences.** Optional views that float over your layout — or dock into a panel: a Living Tableau that draws the room and everyone in it, a Moons view that puts Elanthia's sky — phases, weather, sunrise — in front of you, and a Spell Monitor showing everything currently on you as live countdowns. All beta, and all cost nothing until you open them.
- **Configure it without a mouse.** Type `/` in the command bar and a palette lists every client command. `/highlight add "goblin" red` while you're hunting, `/mute add "swirling fog"` when the spam starts, `/help` when you forget.
- **AI is optional and stays out of the way.** Bring your own Anthropic key and Catch Me Up will summarise what you missed. It's off unless you turn it on, it never sends commands to the game, and your credentials are scrubbed before anything leaves your machine — details in [AINOTICE.md](AINOTICE.md).

---

## What you get out of it

If you've spent years tuning Genie highlights or rebuilding a StormFront layout after a reinstall, the thing you get here is **not losing that work again**. Your configuration is a folder of readable files that you own.

If you run several characters, they live in one app that knows about all of them — one place to look, one set of settings, one click to bring the whole team back online, and a heads-up in whatever window you're looking at when one of them drops.

And if you already run Lich, Lichborne sits alongside it. Same install, same paths, nothing to reconfigure.

---

## Getting started

**1. Download and install.** Grab the [latest release](https://github.com/SekmehtDR/Lichborne/releases/latest).

- **Windows** — run the installer. SmartScreen may warn you (the app isn't code-signed yet): **More info → Run anyway**.
- **Linux** — download `Lichborne.AppImage`, `chmod +x` it, run it. On Ubuntu 22.04 or newer you may need FUSE 2 first: `sudo apt install libfuse2t64` (24.04) or `libfuse2` (22.04). If you have an older download with a version number in its name, rename it once to `Lichborne.AppImage` so updates keep the same name.
- **macOS** — open the `.dmg` and drag Lichborne to Applications. macOS will call it *"damaged"* on first launch; it isn't — that's how Apple Silicon phrases *"not notarized"*. Clear it once with `xattr -cr /Applications/Lichborne.app`.

**2. Set up Lich (recommended).** If you already run [Lich5](https://github.com/elanthia-online/lich-5), point Lichborne at it: **⚙ Lich Setup → Auto-detect**. On macOS and Linux you'll need Ruby 4 installed too. Skipping this is fine — pick **Direct** on a character tile and you'll connect straight to the game without Lich's features.

**3. Add your account.** Click **+ Add account** and sign in. Lichborne finds your characters and makes a tile for each one. You do this once per account.

**4. Connect and arrange.** Click a character, then open **Layout** to place your panels. Whatever you change is saved for that character automatically.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+Tab` | Next character tab |
| `Ctrl+1` … `Ctrl+9` | Jump to character by slot |
| `Ctrl+Shift+Enter` | Quick Send — command another character without switching |
| `Ctrl+F` | Search the game window |
| `PageUp` / `PageDown` | Scroll the text window |
| `Ctrl+Home` / `Ctrl+End` | Top of history / back to live |
| `Ctrl+Enter` / `Alt+Enter` | Send your last / second-to-last command |
| `Esc` | Clear the command line |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |

Plain `Home` and `End` move your cursor in the command box, where it usually is — hold `Ctrl` to scroll the game text instead. On macOS the `Cmd` versions work too. Macro keys (F1–F12 and Ctrl/Alt combos) are yours to bind in the Automations panel.

---

## Known limitations

Worth knowing before you install:

- **No code signing yet on any platform.** Windows shows a SmartScreen warning; macOS needs the one-time `xattr -cr` above.
- **macOS doesn't auto-update** while builds are unsigned — Mac updates are a manual download. Windows and Linux update themselves.
- **macOS builds are Apple Silicon only.** Ask in Discord if you need Intel.
- **Linux and macOS are beta.** Everything works; they're just younger than the Windows build.
- **Map tracking depends on what the game sends.** The Lich Map follows room IDs and is the most reliable — more so if you turn on DragonRealms' room-number display. The Genie Map matches on room name and description, so it can lag in areas full of identically-named rooms; a `LOOK` resyncs it.

---

## Documentation

- **[User Guide](Lichborne-User-Guide.md)** — the full tour: every feature, what it does, and how to set it up.
- **[AI Notice](AINOTICE.md)** — what the AI features send, what's scrubbed, and where your key lives.
- **[Knowledge](Knowledge.md)** — verified notes on how Lich and DragonRealms actually behave.

---

## Credits

Built with the DragonRealms community, and shaped by the people who use it.

**Developers** — Sekmeht, Binu

**Contributors** — Rakkor, Illiahanna, Elore, Morress, Legiro, Rhorgul, Thanator, Mahtra, Zithri

**Testers** — Crobin, Damiza, Qij, Tirost

Thanks also to [Thires](https://github.com/Thires/SimuCoins), whose Genie SimuCoins plugin showed how that feature works, and to the Genie maps team, whose hand-curated map data the Genie map view renders.

---

## Building from source

Most people want the [releases page](https://github.com/SekmehtDR/Lichborne/releases/latest), not this section.

```bash
npm install
npm start
```

Needs Node 24+. Build commands, project layout, conventions, and the release pipeline are documented in [CLAUDE.md](CLAUDE.md) and [DESIGN.md](DESIGN.md) — and every source file opens with a comment block saying what it is, where it sits in the pipeline, and what not to break, so the code itself is a reasonable place to start reading.

---

## License

Lichborne is open source under the [BSD 3-Clause License](LICENSE) — the same license as [Lich](https://github.com/elanthia-online/lich-5) itself. Copyright © 2026 Sekmeht and Binu.

DragonRealms and StormFront are trademarks or registered trademarks of Simutronics Corp. Lichborne is an independent, unofficial community project — not affiliated with, sponsored by, or endorsed by Simutronics. Playing DragonRealms through Lichborne requires your own Simutronics account and is subject to Simutronics' terms of service.
