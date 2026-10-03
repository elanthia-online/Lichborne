## v0.20.2

The Living Tableau learns to show a fight. Most of this release came from Sekmeht hunting with two characters side by side, raw game feed open, sending "here's what it actually says" from both sides of every fight. Plus a hunt for the screen "quiver" some of you have seen for a long time, and several causes fixed.

### The Living Tableau shows your fights

Run `ASSESS` and the scene becomes a **battlefield** laid out the way the fight really stands: you low in the middle, what's in front of you above you, flankers at your sides, and anything behind you below you. Your group's fights sit beside yours, and other people's fights sit above. Anyone not fighting steps aside to a quiet column on the left.

- **Lines join each fighter to what it's fighting**: solid at melee, dashed further out, with **arrows** for who faces whom, in front / flanking / behind colours.
- **A crosshair marks each person's target**, in that person's own colour. Two people on one creature show a + and an ×.
- **A creature fighting someone else** gets a small badge in that person's colour.
- **The cockpit wakes on the first blow**, in either direction, with no roundtime needed, and stays while the fight goes on.
- **Words float off you** when you dodge, block, parry or get hit ("Parry!", "Light hit · chest"). It recognises the defence itself, so it works whatever weapon or shield you carry.
- **Not sure what a line or colour means?** Click the **?** beside the room title for a key to everything on screen.

The battlefield is off to start: switch it on with ⚙ **Combat view**.

### Fighting other players

A player who closes on you takes centre stage, joined by a line showing the range and who's closing (it marches toward whoever is being closed on). Retreating steps you back one range at a time; the fight only ends when an assess shows no one. If they hide, a **?** keeps their place; right-click to **Search** or **Assess**. Right-click anyone you're fighting to **Face** them.

### Your group

Group members stand beside you, the leader marked, with right-click for the group commands (make leader, retreat, leave, add, join). When someone is hurt, a small **health meter** appears under them, using the game's own words — bruised, hurt, battered, beat up, very beat up, badly hurt, and on down — drawn in your health bar's colours.

### Creatures die where they stand

The game tells each client exactly which creature died, so the Tableau no longer guesses. A creature you kill **stays where it fell, greyed with a skull**, until its body decays or is skinned. One that's unconscious or knocked down says so instead. A creature that walks in shows up straight away. Clicking a creature to face it moves your crosshair as soon as the game confirms, and "The rock troll closes to melee range on you!" moves the troll, without waiting for your next assess.

### More life in the scene

- A **gold burst** when you gain a rank, and a **glow with the spell's name** while you prepare one.
- People **act out their emotes**: a bow dips, a wave wiggles, a laugh bounces.
- **The place is drawn behind everyone, from the room's description.** Peaks or hills on the horizon; pines, palms, rooftops, castle walls, ruins, standing stones, a farm or gravestones in front of them; a waterfall, surf, a river, a lake or a road nearer still. Indoors you see a temple, a shop, a home or a hall, and caves have stalactites. A sky follows the time of day, with **rain or snow** when your last look at the sky says so.
- **Your hands** can show under your figure (off by default — switch it on in ⚙): one line, left hand on the left and right on the right, a single item centred, and a long name keeps the word that matters ("…stonebow").
- **Your conditions** (hidden, stunned, joined…) sit on their own line under you, so nothing jumps when one comes or goes. Switch them off with ⚙ **Conditions**.
- The ⚙ list is now grouped: Scene, People, Your character, Combat.

### Connecting another character while you play

With a character already open, **Connect** from the **+** window now logs the next one in **behind you**, the way a team's other members do. The window closes straight away, a dashed tab shows it connecting (click it for the details, or to cancel), and it arrives as a tab without pulling you away from the one you're playing. A toast tells you when it's in; click it to go there.

Reconnecting a dropped tab works the same way now: it comes back in place and leaves you where you are.

### A steadier screen

Several things could make the whole window briefly "quiver" or redraw. These are fixed:

- **Connecting your first character redrew the window in a different font** a moment after it appeared. Lichborne now starts in the font you last played with, and applies a character's font before it draws anything.
- **The row of character tabs could change the height of the bar above your game text.** A tab grew when its health % first appeared, and a full tab row made a scrollbar appear. Tabs now keep their width, and the tab row scrolls with a thin bar drawn over the tabs that takes no space. Use the mouse wheel to scroll sideways.
- **With two windows open on different themes,** changing a setting in one repainted the other in the wrong theme. It doesn't any more.

### Fixed

- The roundtime ring could spin or flicker before draining.
- The Tableau redrew far more often than it needed to during any roundtime.
- A fight that had ended could stay drawn in a quiet room.
- The balance gauge called the three worst balance states "balanced". They are imbalanced or unbalanced.
- The range gauge showed what you were facing rather than the nearest thing on you.
- After GO PATH, "(Roundtime: 30 seconds.)" appeared as a person called "Roundtime:".
- Italic text with a gradient effect (Rainbow, Shimmer…) lost the top of its last letter.
- The Tableau's combat gauges stayed up while crafting. Only fighting wakes them now.
- In a chatty room the Tableau redrew itself every second. It now redraws only when something on it changes.
- Bleeding or poisoned, your avatar's warning pulse kept the graphics busy every frame, even with the window minimized.
- The moving dashes between two players closing on each other no longer redraw the scene every frame.
- The scroll handle under a long row of character tabs no longer drags on a right-click or gets stuck, and clicking a tab's bottom edge beneath it selects the tab.
- Typing a colour name with a Japanese or Chinese input method no longer saves the half-converted text.
- **Linux:** if an update can't be installed (for example, the AppImage is in a folder you can't write to), the update notice now says so and why, instead of staying on "Ready to install".
- **Linux:** after an update, the new version now opens only once the old one has fully closed, so nothing you changed just before restarting is lost.
- **Linux:** a character window opened by Team Login that was last maximized should no longer jump in front of the one you're playing.

*Thanks to **Sekmeht** for an enormous amount of captured game text, from both sides of every fight.*
