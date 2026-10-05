## v0.20.3

The Living Tableau now shows *where* you are. Every town has its own look, rooms are furnished from their descriptions, and the things a room mentions stand in the scene. To get there, every room in the game was read and checked against what the Tableau drew, and the rules were tuned on what turned up.

### Towns in their own style

Shard rises in crystal spires, Muspar'i in sandstone domes, Ratha in terraces over the sea, and Mer'Kresh floats on platforms above the water. Leth Deriel sits in its great tree, Hibarnhvidar is carved into the rock, and the clans live in longhouses behind palisades. Thirty-nine towns are drawn in thirteen styles.

Walk into a building whose name doesn't say which town it's in, and the Tableau remembers the town you were just in. Walk out into the wilds and it lets the town go.

### Rooms, furnished

Indoors, the Tableau draws what the room is made of (stone, marble, wood, canvas…), what lights it (glowing orbs, lanterns, candles, torches, a fire, daylight), and up to three furnishings it describes: shelves, a counter, a bar, a hearth, an altar, a forge, a bed, paintings, statues, a workbench or loom, mannequins, a mirror, a stage, a sunken pool on the floor, and more. A shop shows what it sells on its shelves or racks.

### Things in the scene

Outdoors and in caves, up to four things the room describes stand in front of the scenery: a fountain, a well, market stalls, a dock with its boats, a campfire, a signpost, banners, grazing animals, huts and cabins, columns, a pond, stacked crates, a garden gazebo, obelisks and standing stones, a hanging bell, a brazier, and more.

There's more terrain too: jungle, savannah, dead woods, moorland, volcanic ash under a smoking cone, and snow on the peaks. Caves are drawn by kind: caverns, tunnels, mines, sewers and ice caves.

### It reads what the room *says*

A thing is only drawn when the room is talking about the thing itself:

- "cobblestones flecked with crystals" draws no crystals;
- "rose colored curtains" draws no roses, but "a bed of roses" does;
- "an oak door" is not a tree;
- "wagon tracks" is not a wagon;
- a bird feeder is not a bird, but pigeons circling the fountain are.

Distant things ("the lights of the pier far below") stay in the distance.

Turn the scenery off with ⚙ **Scenery** if you'd rather have a plain stage.

### Moonskin in Moons

The Moons view now shows when **Rakash next take their moonskin form**, and how long it lasts, or when the one in progress ends: "moonskin · Mon 12:55 AM · in 21h · lasts 28h 11m". It runs exactly while Katamba is full, and it matches the Elanthipedia moonskin table to the minute. It's shown to everyone, so you can plan around the Rakash you hunt with. Hover Katamba for the moonskin window too, and any moon to see when it's next full. Turn it off with ⚙ **Moonskin**.

### Your posture in the Living Tableau

When you're **sitting, kneeling or prone**, a chip under your figure says so, in the same colours as your icon bar. It sits with your other conditions (after bleeding, stunned and the like), and hovering it tells you how to get up.

### Floating windows that fit

- **Vitals and command bars no longer get cut off** on a smaller screen, such as a laptop, or in a shorter Lichborne window. A bar window is always drawn at least as tall as its bar, and one docked at the bottom moves up rather than off-screen.
- **The vitals, command and icon windows show their name only when you hover them**, so the name no longer sits over the top of the line you're typing in.
- **A readable title bar.** Point at a window's thin top strip and it opens into a proper title bar, with the window's name and clear collapse and close buttons, without moving anything. At rest it stays as slim as before.

### The Overview card

The card's stream picker and its session stats now share one row, so the card is a line shorter.

### Fixed

- In the Living Tableau, dead creatures were drawn on top of the living ones fighting beside them. Corpses now lie behind everything still standing.
- In a fight, a creature right in front of you could have its "facing you" tag drawn over your avatar. It now stands clear.
- While you were hidden or invisible, your condition chips (Bleeding and the rest) faded along with your figure. Now only your figure fades.
- Connecting another character with the **+** while you were already playing showed nothing until its tab suddenly appeared. You now see it connecting, in a tab you can click for progress or to cancel.

*Thanks to **Sekmeht** for the idea of reading every room, and for the question that shaped this release: is the word the thing itself, or part of something else? Thanks to **Vellinous** for asking for Moonskin, and to **Mahtra** (Destahd), whose [DRMoonWatch](https://moonwatch.dr.elanthia.online/) and moon research it follows. Thanks to **Qij** for the screenshots of the cut-off bars.*
