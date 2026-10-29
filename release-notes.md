## v0.21.0

DragonRealms has a newer, richer game stream, the one the Saga client uses, and Lich 5.23.0 (released 2026-10-27) now takes it from the game for you. This release teaches Lichborne to read it, and with Lich 5.23.0 or later it switches over automatically. Thanks to Mahtra, whose research and Lich work on the new stream this release is built on, to the [ProfanityFE](https://github.com/elanthia-online/ProfanityFE) developers for the creature-state idea, and to Vaddon for the account-transfer report.

### DragonRealms' rich stream, on by default with Lich 5.23

Lich 5.23.0 takes the rich stream from DragonRealms, and Lichborne now asks Lich to pass it through. Before, Lich turned it back into the older stream for us. With Lich 5.23.0 or later, it's on automatically from your next login; nothing to set up.

What you get:

- **Clickable names.** Click a creature, an item or a player in game text for a small menu: Look and Face for creatures, Look and Get for items, and Say to, Whisper to, Look and the contact card for players (plus Touch for empaths). Each one targets the exact thing you clicked, even when there are three identical creatures in the room. Right-click a name for the same items above the usual text menu.
- **Creatures named reliably.** The Living Tableau and the Room panel match each creature to its state (dead, sleeping, prone, engaged) by the game's own id rather than by order.
- **Creature names in bold** in combat and action lines, where the game now marks them.
- **Your `FLAG DESCRIPTION` setting followed by Lichborne**, so turning room descriptions off works again (see below).

Everything else looks as it did: room views, the compass, click-to-walk, the maps, the Room panel, your highlights, mutes, substitutes and triggers.

**To turn it off or check it:**

- **Lich Setup → Game stream** (the ⚙ on the launcher, or Settings → Open Lich Setup…): **Rich (Saga) when Lich supports it** (the default), **Rich (Saga) always**, or **Legacy**. The line underneath says whether your Lich supports it. A change applies from your next connect.
- **`/richstream`** shows the setting and which stream your current session is getting; `/richstream auto|on|off` changes it.
- **Attaching** to a Lich on this machine follows the same setting. For a Lich on another machine, Lichborne can't check its version, so choose **Rich (Saga) always** to get it there.
- **Direct connections** (no Lich) keep the older stream for now.

**If you update to Lich 5.23.0:**

- **Room descriptions came back** even though you turned them off with `FLAG DESCRIPTION OFF`? With the rich stream on, Lichborne handles this itself. If you've set **Game stream** to **Legacy**, type `;display descflag on` once instead.
- Lich recommends **Ruby 4.0.9** for its security fixes. Ruby 4.0 is still the minimum.

### Characters that moved to another account

If you transferred a character to another account in-game, Lichborne used to keep it filed under the old account: refreshing the new account called it "already added", and the old account's tile tried to log in with the wrong account. Now refreshing the new account offers it with a **moved from …** badge, already ticked, and **Finish** moves it across with all its settings, highlights, layout and colour. Refreshing the old account lists characters it no longer has under **No longer on this account**, which you can tick to remove. A removed character is archived, not deleted, so the new account still gets it back with its settings. (Vaddon)

### Dead, sleeping and prone creatures in the Room panel

In the Room panel's "You also see" line, a dead creature's name is greyed and no longer bold, a sleeping one is in italics, and a prone one is underlined. Hover the ⚔ count for a summary ("3 creatures here: 1 dead") and what each look means. The main window is unchanged. (An idea from ProfanityFE.)

### Lines cut by "...wait N seconds."

When you act in roundtime, DragonRealms sometimes cuts the line it's sending in two to fit in "...wait 3 seconds.", so the sentence arrived as two lines and the Room panel's "You also see" line could end in the refusal. Lichborne now shows the refusal on its own line and the sentence whole, as Lich 5.23.0 does.

### Smaller fixes

- **An attached session that drops and re-attaches by itself starts clean.** If the connection dropped in the middle of a block of text, game text could keep landing in the wrong panel afterwards. (Kahlen's attach mode.)
- **The Living Tableau names every creature after a LOOK.** A LOOK in the middle of a fight sent the creature list twice, which left creatures unnamed until the next move.
- **The Active Spells panel and the Spell Monitor no longer blink empty** for a moment when the game refreshes your spell list in the middle of combat.
