## v0.21.0

DragonRealms has a newer, richer game stream, the one the Saga client uses, and Lich 5.23.0 (released 2026-10-27) now takes it from the game for you. This release teaches Lichborne to read it. With Lich 5.23.0 or later it is now on by default, and you can switch back to the older stream in one setting. Thanks to Mahtra, whose research and Lich work on the new stream this release is built on, to the [ProfanityFE](https://github.com/elanthia-online/ProfanityFE) developers for the creature-state idea, and to Vaddon for the account-transfer report.

### DragonRealms' rich stream, ready when you are

Lich 5.23.0 takes the rich stream from DragonRealms and, unless a front end asks otherwise, turns it back into the older stream. Lichborne now asks Lich to pass it through, so with Lich 5.23.0 or later you get the rich stream without doing anything. An older Lich keeps the legacy stream, and **Lich Setup → Game stream → Legacy stream** switches back whenever you want it.

What you get:

- **Clickable names.** Click a creature, an item or a player in game text for a small menu: Look and Face for creatures, Look and Get for items, and Say to, Whisper to and Look for players (plus Touch for empaths), then, for a contact, **View contact card**, **Edit contact** and **Delete contact…**, or **Add as a contact** for anyone else. While you're on the rich stream, clicking a contact's name opens this menu too, so a player's name works the same way everywhere. Each one targets the exact thing you clicked, even when there are three identical creatures in the room. Right-click a name for the same items above the usual text menu.
- **Creatures named reliably.** The Living Tableau and the Room panel match each creature to its state (dead, sleeping, prone, engaged) by the game's own id rather than by order.
- **Creature names in bold** in combat and action lines, where the game now marks them.
- **Every creature keeps its name in a crowded room.** The game cuts its object list short when a room is full of items, which left corpses and extras nameless and switched the Tableau back to its older display. Names now also come from the complete line in the main text.
- **Your `FLAG DESCRIPTION` setting followed by Lichborne**, so turning room descriptions off works again (see below).

Everything else looks as it did: room views, the compass, click-to-walk, the maps, the Room panel, your highlights, mutes, substitutes and triggers.

**To switch back or check it:**

- **Lich Setup → Game stream** (the ⚙ on the launcher, or Settings → Open Lich Setup…): **Rich (Saga) stream (default)**, **Legacy stream**, or **Rich (Saga) always**. The default asks for the rich stream whenever your Lich supports it; picking Legacy stream keeps the older one whatever happens. The line underneath says whether your Lich supports it. A change applies from your next connect or a manual Reconnect.
- **`/richstream`** shows the setting and which stream your current session is getting; `/richstream off` switches to the Legacy stream, `/richstream on` asks for the rich stream always (also for an attach to another machine), and `/richstream default` leaves the choice to Lichborne (the rich stream when your Lich supports it).
- If you ran a pre-release v0.21.0 build, open Lich Setup → Game stream once and pick the option you want: the pre-release saved its setting as a choice.
- **Attaching** to a Lich on this machine follows the same setting. For a Lich on another machine, Lichborne can't check its version, so choose **Rich (Saga) always** to get it there.
- **Direct connections** (no Lich) keep the older stream for now.

**If you update to Lich 5.23.0:**

- **Room descriptions came back** even though you turned them off with `FLAG DESCRIPTION OFF`? Lichborne now follows your flag on either stream. It learns the setting from the game's answer, so type `FLAG` (or `FLAG DESCRIPTION OFF`) once after logging in. (`;display descflag on` in Lich also works, and the two don't fight.)
- Lich recommends **Ruby 4.0.9** for its security fixes. Ruby 4.0 is still the minimum.

### Characters that moved to another account

If you transferred a character to another account in-game, Lichborne used to keep it filed under the old account: refreshing the new account called it "already added", and the old account's tile tried to log in with the wrong account. Now refreshing the new account offers it with a **moved from …** badge, already ticked, and **Finish** moves it across with all its settings, highlights, layout and colour. Refreshing the old account lists characters it no longer has under **No longer on this account**, which you can tick to remove. A removed character is archived, not deleted, so the new account still gets it back with its settings. (Vaddon)

### Dead, sleeping and prone creatures in the Room panel

In the Room panel's "You also see" line, a dead creature's name is greyed and no longer bold, a sleeping one is in italics, and a prone one is underlined. Hover the ⚔ count for a summary ("3 creatures here: 1 dead") and what each look means. The main window is unchanged. (An idea from ProfanityFE.)

### Lines cut by "...wait N seconds."

When you act in roundtime, DragonRealms sometimes cuts the line it's sending in two to fit in "...wait 3 seconds.", so the sentence arrived as two lines and the Room panel's "You also see" line could end in the refusal. Lichborne now shows the refusal on its own line and the sentence whole, as Lich 5.23.0 does.

### The pauses while you play

Every save of your character profile used to block Lichborne's main process — the one that reads every character's game text — for a tenth of a second or more, and ordinary play triggered one every few seconds: clicking between floating windows (even locked ones), and having a contact in the room (each LOOK or arrival updated their "last seen"). The text would freeze, then catch up in a burst. Now Lichborne saves only when something you set actually changed; a window's stacking order and your contacts' last-seen times ride along with the next real save (or a quiet moment, or logout), and nothing is written at connect time just to re-save what was loaded.

### A quieter map and Spell Monitor

The Genie map animated every lime-coloured room in the zone (56 in the Crossing) every frame, for as long as the map was showing — most of an idle processor core with the map open. Now only the lime rooms in view flicker (the thirty nearest the centre, at most); the rest keep a steady halo, and the colours are unchanged. The Spell Monitor's bars stopped re-starting a one-second animation on every tick, and its red "expiring" pulse no longer repaints the cell every frame. The command bar's roundtime strip lost a width animation that never finished.

### Capture XML, for bug reports

The Debug panel has a **Capture XML** button (and `/log xml on` / `off`) that writes everything the game sends, with timestamps, to Lichborne's `Logs/raw` folder until you stop it or log out. If something looks wrong, turn it on, reproduce it, and send the file with the time you saw it: it can be replayed line for line. Each command you send is stamped by its first word only (`health`, never what follows it), so a capture can tell a slow reply from a late send. Nothing else you type is recorded. The file isn't redacted and holds your whispers, so look it over before sharing it.

### Mutes and substitutes behave the same on both streams

The rich stream breaks a line at every linked name, which changed what your rules did. A mute whose match spanned a name did nothing, `^` and `$` could match in the middle of a line (so an imported rule could fire where it never had), and a substitute spanning a name stripped the line's bold and links. Rules now match the whole line, and only the text they match changes.

### The Living Tableau reads the room properly

- **Moving no longer leaves ghosts.** Your own step made everyone in the old room "leave", and they appeared in the new room for a moment.
- **Arrivals and departures you were missing now show.** A stuck flag silenced most of them, so a busy room is noticeably livelier. That's the room, not a bug.
- **Thoughts name the person,** not the channel (`General`, `DRPrime`).
- **Combat reactions** now count "You partially block", "barely block", and a few more wordings the game uses.
- **Crowded fights** keep their creatures when the game cuts its room list short, and `lava  drake` no longer counts apart from `lava drake`.

### Logging in and out

- **The login pause is gone.** Every Lich login waited about 7 seconds and printed `[(unknown script)]>look`. Lichborne now answers the game the way Genie does.
- **Switching characters on one account** waits for Lich to finish logging the old one out (up to 35 seconds with slow scripts), so the next login isn't refused.
- **A dropped connection now says so.** If a command gets no reply for 20 seconds, Lichborne tells you the connection may be lost, because Lich can hold the tab open for up to a minute while its scripts stop.

### Mac and Linux

- **Older Linux.** The Lich Dashboard's Variables and Settings could read empty on Ubuntu 22.04, Debian 12 and Mint 21, because the AppImage's database module needed a newer system. It's now built for those systems, and the Dashboard says so if it can't read Lich's database.
- **Your Mac clipboard is safe from right-clicks.** Right-clicking game text selected a word and copied it over whatever you had.
- **Scripts with accented letters** no longer die on a system set to the plain `C` locale.
- **A stuck Lich is stopped properly** after a failed launch, so the next character in a Team Login doesn't connect to it.
- **Auto-detect finds rvm and Linuxbrew Ruby,** and **Browse…** can reach hidden folders like `~/.rbenv`.
- **Open Installation Directory** on a Mac opens the folder holding the app, not the inside of it. **Ctrl+click on the tab strip's scroll thumb** opens the menu only.
- **Machines with IPv6 turned off** connect to Lich by its address.

### Smaller fixes

- **Horibu** pinned the GitHub Actions our builds use to exact versions, so a release builds from the same steps every time (PR #3).
- **Your profile is safe if Lichborne's storage is full.** Connecting could save a partial copy over a character's profile when their settings didn't all fit. It now says so and leaves the file alone.
- **Triggers watching exits or the room fire once per room.** Exits could fire twice, and with Lich's room numbers on, room and room id fired several times per move.
- **Spells no longer flicker to "ended"** when the game's list arrives in two parts.
- **The spell list survives a refresh with no stream tag.** Some Lich builds send it that way, and it used to spill into your main window and empty the Spell Monitor.
- **Clicking the Moons refresh quickly** no longer shows the game's time and weather replies in your window.
- **`glance` re-syncs your hands again,** with the game's current wording.
- **"Room Number" and other one-line Lich output** are monospaced as Lich intended.
- **A speech text style** (rainbow, wave…) no longer restarts at each linked name.
- **Dragging across a linked or contact name** copies it without also opening its menu.
- **A contact saved with a stray space in the name** now gets its last-seen and time-together, and the right menu.
- **Your own private LNet messages** aren't credited in the Tableau to the person you sent them to.
- **Tableau menus** no longer offer "Add as a contact" for someone who is already one.
- **Capture XML** recovers if its folder is deleted while it runs, and says so if it can't start.
- **A room with no Lich map picture now says so.** Banks and other interiors often have no image in Lich's map data, and the panel just sat empty. It now explains why and offers a **Try Genie Maps** button.
- **Indented lines that start with a link keep their indent**, so inventory rows like `  some gloves` match the same highlights and triggers on the rich stream as on the legacy one.
- **Named NPCs in an Empath's `perc` list** (Guildleader Salvur, bold with a small negative id) get the creature menu instead of Look only.
- **Doors, signs, trails and moons are not people.** On the rich stream, clicking one offered Say to… and "Add as a contact" named "door". They now get **Look** only; carried items keep **Look** and **Get**.
- **Contacts.** Clicking a contact's name in a thought or LNet line no longer offers Touch or Look for someone who isn't in the room. A contact saved with a stray space was painted as a contact but "Add as a contact" made a duplicate; and deleting or adding a contact in the two seconds after a LOOK could be undone by the room tracker. Both fixed. The Living Tableau's right-click menu now has the same Edit and Delete items as the text menu, and Add as a contact for anyone else.
- **The Room panel on the rich stream** could go stale, or show only the title and description, in rooms where the game sent its room view as a single block (every LOOK does): the panel now reads the block too, so the objects, people and exits lines refresh on every look and move.
- **The map with `;display lichid` on.** Each arrival briefly set the room's id to Lich's own number instead of the game's, so the Lich map could try the wrong number first; it now takes the game's number both times.
- **The compass after The Heavens.** Looking at the sky, and a few other arrivals the game sends without a full room block, left the compass blank or stale on either stream. The exits now come from the room's own exits line when nothing else says.
- **Trigger conditions** on a text variable (a room name like "5th Avenue") compared as numbers when both sides began with a digit.
- **An attached session that drops and re-attaches by itself starts clean.** If the connection dropped in the middle of a block of text, game text could keep landing in the wrong panel afterwards. (Kahlen's attach mode.)
- **The Living Tableau names every creature after a LOOK.** A LOOK in the middle of a fight sent the creature list twice, which left creatures unnamed until the next move.
- **The Active Spells panel and the Spell Monitor no longer blink empty** for a moment when the game refreshes your spell list in the middle of combat.
