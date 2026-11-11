# Lichborne

**A game client for DragonRealms and GemStone IV.**

[![Latest release](https://img.shields.io/github/v/release/elanthia-online/Lichborne?label=download&color=2ea043)](https://github.com/elanthia-online/Lichborne/releases/latest)
![Platforms](https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-supported-blue)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-lightgrey)](LICENSE)

> [!NOTE]
> **Lichborne 1.0 is out, and it now plays GemStone IV as well as DragonRealms.** Your characters from both games live in one launcher, side by side.

Free, open source, and built by players who've used Wrayth, Genie and Frostbite for years. It works great with [Lich5](https://github.com/elanthia-online/lich-5), and it also connects straight to the game if you don't use Lich.

**[⬇ Download Lichborne 1.0](https://github.com/elanthia-online/Lichborne/releases/latest)** · [Install steps](#install) · [User Guide](docs/Lichborne-User-Guide.md)

<!-- A screenshot belongs here: a real layout with game text, a few panels and
     the vitals bar says more than anything below. -->

---

## Why players use it

### 🧙 All your characters, one window

- **Tabs for every character.** Switch with `Ctrl+Tab`. Send a command to another character without leaving yours (Quick Send). Pop any character out into its own window.
- **Overview.** See every character at once as a live card: health, what's wrong, where they are, and what they just saw. Type to one of them or all of them.
- **Teams.** Save a group and log them all in with one click. **Reconnect Last** brings back whoever was on when you quit.
- **Stay logged in when you close it.** Attach to a Lich that's already running, and closing Lichborne no longer logs you out. Come back later, or pick up from another computer. ([How](docs/Lichborne-User-Guide.md#3b-or-attach-to-a-lich-thats-already-running))

### 🎨 Make it look the way you want

- **Panels that dock or float.** Use a neat docked layout, or drag windows anywhere. They snap together, and you can lock them in place.
- **The Living Tableau.** A picture of the room and everyone in it. In a fight it becomes a battlefield: who's on you, your balance and position, and your roundtime.
- **Moons and Spell Monitor** (DragonRealms). See Elanthia's sky, moon phases and weather, and every spell on you as a countdown that turns amber, then red, before it runs out.
- **21 themes**, plus a theme editor. Colour-blind, high-contrast, large-print and epilepsy-safe modes work everywhere.

### ⚙️ Power without writing scripts

- **Automations.** Highlights, triggers, macros, aliases, mutes and substitutes, all set up with forms. A health check finds rules that are broken, doubled up, or clashing.
- **Slash commands.** Type `/` to see them all. Add a highlight mid-hunt with `/highlight add "goblin" red`, or hide spam with `/mute add "swirling fog"`.
- **Lich, out in the open.** See and control your running scripts, edit your Lich variables, and follow yourself on the Lich Map.
- **Your setup is just files.** Layouts, highlights, macros and themes save per character as plain files you can back up or move. **Transfer** copies a whole setup to another character.
- **Catch Me Up (optional AI).** Back from a break? Ask what you missed: who talked to you, what you fought, what you learned. Uses your own Anthropic key, is off until you turn it on, and never sends commands to the game. [What it sends](AINOTICE.md).

> [!TIP]
> Coming from Genie, Frostbite or Wrayth? The **import wizard** brings your highlights, macros, name lists, gags and substitutes with you.

---

## Install

Downloads are on the **[latest release page](https://github.com/elanthia-online/Lichborne/releases/latest)**. After you install it once, Lichborne updates itself.

<details open>
<summary><b>🪟 Windows</b></summary>

1. Download the file ending in **`-setup.exe`**.
2. Run it. You don't need admin rights.
3. If a blue **SmartScreen** box appears, click **More info → Run anyway**. (Lichborne isn't code-signed yet, so Windows doesn't recognise it.)
4. Pick whether you want a desktop shortcut, then finish.

</details>

<details open>
<summary><b>🍎 macOS (Apple Silicon)</b></summary>

1. Download the file ending in **`-mac-arm64.dmg`**.
2. Open it and drag **Lichborne** into **Applications**.
3. Open **Terminal** (Applications → Utilities) and run this once:

   ```bash
   xattr -cr /Applications/Lichborne.app
   ```

4. Open Lichborne from Applications.

</details>

<details open>
<summary><b>🐧 Linux (x64)</b></summary>

1. Download **`Lichborne.AppImage`**.
2. Make it runnable and start it:

   ```bash
   chmod +x Lichborne.AppImage
   ./Lichborne.AppImage
   ```

3. If it won't start on Ubuntu 22.04 or newer, install FUSE 2:

   ```bash
   sudo apt install libfuse2t64   # Ubuntu 24.04
   sudo apt install libfuse2      # Ubuntu 22.04
   ```

Keep the name `Lichborne.AppImage` so updates and shortcuts keep working.

</details>

> [!IMPORTANT]
> **Mac users: don't skip step 3.** Without it, macOS says *"Lichborne is damaged and can't be opened."* It isn't damaged. Lichborne just isn't notarized by Apple (that needs a paid certificate), and the command clears the warning. You only run it once.

---

## Getting started

1. **Set up Lich (recommended).** Already use [Lich5](https://github.com/elanthia-online/lich-5)? Open **⚙ Lich Setup** on the launcher and click **Auto-detect**. New to Lich? Start with the [Lich install guide](https://github.com/elanthia-online/lich-5/wiki/Documentation-for-Installing-and-Upgrading-Lich). On macOS and Linux you'll also need Ruby 4.
2. **Add your account.** Click **+ Add account**, sign in and pick your game. Lichborne finds your characters and makes a tile for each.
3. **Play.** Click a character to connect, then open **Layout** to arrange your panels. Everything saves for that character automatically.

> [!TIP]
> Don't use Lich? Choose **Direct** on a character's tile to connect straight to the game. You'll miss Lich's extras (scripts, variables, the Lich Map), but everything else works.

<details>
<summary><b>⌨️ Keyboard shortcuts</b></summary>

| Key | What it does |
|---|---|
| `Ctrl+Tab` | Next character |
| `Ctrl+1` … `Ctrl+9` | Jump to a character |
| `Ctrl+Shift+Enter` | Quick Send to another character |
| `Ctrl+F` | Search the game text |
| `PageUp` / `PageDown` | Scroll the game text |
| `Ctrl+Home` / `Ctrl+End` | Jump to the top / back to live |
| `Ctrl+Enter` / `Alt+Enter` | Repeat your last / second-to-last command |
| `Esc` | Clear the command line |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |

On a Mac, use `Cmd` for zoom. Set your own macro keys in **Automations**.

</details>

---

## Good to know

- **No code signing yet.** That's why Windows shows SmartScreen and macOS needs the one-time command.
- **macOS builds are for Apple Silicon only.** Need Intel? Ask on Discord.
- **A few views are DragonRealms-only:** Moons, Spell Monitor and Genie Maps. The [User Guide](docs/Lichborne-User-Guide.md#dragonrealms-and-gemstone-iv) lists what each game gets.
- **Maps follow what the game sends.** The Lich Map is the most accurate. If a map loses you, type `LOOK`.

---

## Learn more

- 📖 **[User Guide](docs/Lichborne-User-Guide.md)** — every feature and how to set it up
- 🔒 **[AI Notice](AINOTICE.md)** — what the AI feature sends and what it never sends
- 💬 **Discord** — open Lichborne and choose **Help → Discord**

---

## Credits

Made with the DragonRealms and GemStone IV communities.

**Developers** — Sekmeht, Binu, Tysong

**Contributors** — Rakkor, Illiahanna, Elore, Morress, Legiro, Rhorgul, Thanator, Mahtra, Zithri, Qij, Kahlen, Vaddon, Crobin

**Testers** — Cirostar, Damiza, Tirost, Wilhellm

Special thanks to **Tysong**, who brought GemStone IV to Lichborne, to [Thires](https://github.com/Thires/SimuCoins), whose Genie SimuCoins plugin showed how that feature works, and to the Genie maps team, whose maps the Genie map view draws.

<details>
<summary><b>🛠 Building from source</b></summary>

Most people want the [release page](https://github.com/elanthia-online/Lichborne/releases/latest) instead. You'll need Node 24 or newer.

```bash
npm install
npm start
```

How the code is laid out, and how releases are built, is in [CLAUDE.md](CLAUDE.md) and [DESIGN.md](docs/DESIGN.md). Every source file starts with a short comment explaining what it does.

</details>

---

## License

Open source under the [BSD 3-Clause License](LICENSE), the same license as [Lich](https://github.com/elanthia-online/lich-5). Copyright © 2026 Sekmeht and Binu.

DragonRealms, GemStone IV and Wrayth (formerly StormFront) are trademarks or registered trademarks of Simutronics Corp. Lichborne is an independent, unofficial community project — not affiliated with, sponsored by, or endorsed by Simutronics. Playing through Lichborne requires your own Simutronics account and is subject to Simutronics' terms of service.
