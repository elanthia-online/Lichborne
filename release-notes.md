## v1.0.0

### Lichborne now plays GemStone IV

This is the release where Lichborne becomes a client for both Simutronics games, which is why it's 1.0.0: Lichborne's first **general release**, on Windows, Linux and macOS alike (Linux and Mac are out of beta). All of the GemStone IV work is Tysong's (Horibu on GitHub), in a series of ten pull requests, tested against live GemStone IV characters.

Your character tabs show a GemStone IV Prime character's shard as **GS3**, the game code Simutronics uses for it (Shattered is **GSF**). Friendlier names there are coming in a later update.

- **Prime, Shattered and Test.** Add a GemStone IV account the same way as a DragonRealms one; the Add Account wizard now groups the shards under each game. GemStone IV Platinum isn't supported.
- **Panels of its own.** **Effects** lists your debuffs, cooldowns, buffs and active spells with live countdowns, and warns when one is about to run out. **Experience** shows your level, RPA and Lumnis, your mind bar, and your training points. **Encumbrance** shows your load. **Creatures** lists what's in the room with each one's health; click one to target it. A new GemStone IV character starts with these panels open.
- **The Lich Map works for both games.** Genie Maps, the Moons, the Spell Monitor and the Active Spells panel stay DragonRealms-only.
- **New trigger and macro variables:** `$mindstate` and `$encumbrance` (0–100).

### Your characters are now filed by name and shard

So that a character named Tysong on GemStone IV Prime and another on Shattered are two separate characters, each one's settings, layout, automations and Session Log are now kept under its name and shard.

**The first time v1.0.0 starts, it renames your existing files once.** Everything carries over: settings, layouts, automations, Session Logs, teams and Reconnect Last. A copy of every original goes to `profiles\PreKeyBackup\` first. Older versions of Lichborne can't read the new names, so if you ever go back to one, restore from that folder.

### For players of both games

- **A game filter on the launcher** (All · DR · GS) appears once you have characters in both games.
- **Each tile names its shard** ("GemStone IV Prime"), and Edit Profile offers GemStone IV professions.
- **A Lich install per game or per character.** Lich Setup has a **Lich install by game** section, and Edit Profile a **Lich install** row. If the Ruby and Lich paths are swapped, Lichborne now says so and offers **Swap them**. `/lich install` tells you which install a session is using.
- **The Attach dialog asks for the game.**

### Also new

- **Vitals bar text.** **Settings → Layout → Vitals bar text** picks what each bar says: a percentage (as before), the game's numbers (`Health 310/355`, GemStone IV only), or just the name. `/vitals text` does the same.
- **Colour-blind modes go further.** Deuteranopia and protanopia now also adjust the app's success and danger colours, so greens turn teal in those modes.
- **Windows: your desktop shortcut stays put.** The installer asks whether to create a desktop shortcut, and installing a new version over an old one no longer moves the icon on your desktop.
- **Lichborne has moved to [elanthia-online/Lichborne](https://github.com/elanthia-online/Lichborne).** Updates keep arriving as before; nothing to do on your side.

Thank you, Tysong, for all of this.
