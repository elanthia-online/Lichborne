## v1.1.0

### The Graph map: a new way to look at the world

The map now has a third view, **Graph**, beside Lich Map and Genie Maps. It puts the two together: the Genie maps draw the rooms, and Lich's map says what is in them. DragonRealms only, and it needs both sets of maps. Until you have both, the Graph button is greyed out; click it anyway and it shows which map is missing, with a button to add it (Lich Setup, or a one-click Genie maps download). Once both are there, it turns into the Graph map by itself. It works on a direct connection too; only Go needs Lich running.

**One map at a time (Zone)**

- **Your marker is exact.** It is placed by the game's room number, so it can't pick the wrong one of forty rooms with the same name.
- **Find things.** Type "jadice flower", "rats", "bank" or "gem shop crossing" in the Find box and every room that has it lights up. It tells you how many there are and which one is nearest. It knows forage items, hunting grounds (with their rank ranges), town services, shrines, mining and lumber areas, and climbing and swimming spots.
- **Go.** Once you've found something, press **Go ▸** and Lich walks you to it (the nearest one, if there are several). Needs Lich.
- **Ways Genie doesn't draw.** Dashed lines show links Lich knows about. A framed room with a small number on its corner leads to rooms Lich has mapped beyond the edge of the Genie map.
- **Point at a room** to see its Lich room number and what is there.
- **Right-click a room to go there.** With Lich, this hands the trip to Lich's `go2`, so it works across maps. Without Lich it uses the Genie map's own walk.
- About one room in six can't be matched to Lich's map, mostly places Lich hasn't mapped. Those rooms still work the way they do on the Genie map.

**The whole world (World)**

- Every map is a bubble sitting where it really is in Elanthia, on a drawing of the five provinces. The bigger the bubble, the more rooms the map has.
- Roads join the towns, one line for each pair, so the map shows the highways rather than a web of every exit. A town's own gates and side maps join it once you zoom in. Boats and other rides (named, like the *Skirr'lolasu* or the sand barge) are faint dashed curves, and swims or climbs that need Athletics are marked too.
- **Layers ▾** turns parts of the world off and on: roads, boats, the small side maps, town and map names, water and regions, provinces, and the key. Everything starts on, and your choices are kept for each character.
- A key along the bottom explains the circles and the lines.
- Point at a map to see how many zones away it is and in which direction, and all of its own connections. Click it to open it.
- The Find box works here too: the maps that have what you're looking for light up.
- Click a town's name to open its Elanthipedia page.

The world's layout comes from Elanthipedia's Zone map and Travel map, and the place positions were read from the official Simutronics maps and checked region by region against the province drawings. Thank you to everyone who keeps those up to date. None of those pictures are included; the drawing is Lichborne's own.

### New players get the map that works for them

The first time you open the map it starts on the Lich Map if Lich is on your computer, and on Genie Maps (one click to download) if it isn't. A map that's missing something has a greyed button: click it to see what it needs. Without Lich, the Lich Map now says plainly that it needs Lich and offers Lich Setup and the Genie maps, instead of reporting a missing map file from a folder you don't have.

### Maps notice when they're updated

Lich's map, Lich's data files and the Genie maps all get updated often, and an open map now picks that up without a restart:

- **A new Lich map is noticed again.** Since Lich 5.20 the "Map loaded" message names the script that loaded the map ("--- go2 Map loaded …"), and Lichborne only recognised the old wording, so an open map usually kept the old one until you restarted.
- **Switching map views or coming back to the window** also checks for a new Lich map, a Genie folder that changed (Genie's own updater, for example) and new data files for Find. Only what changed is re-read.
- **No needless reloads.** A map that hasn't changed is no longer re-read and redrawn each time Lich mentions it.
- **↺ re-reads everything.** Lich updates its files from its repository as it starts, sometimes after the map has already read them. If something new (a hunting ground, a shop) doesn't show up yet, press **↺** on the map toolbar: it re-reads Lich's map, the Genie maps and Lich's data files, and the Graph map matches them up again. Clicking into the Find box also checks for updated data files on its own.
- **Every character gets the update.** When one character's map loads newer maps, the other characters' maps switch to them too, instead of keeping the old ones.

### Smoother maps

- **Zooming no longer stutters.** Zooming in some maps stuttered badly, on the Genie Maps view as well as the new Graph view; Shard to Gondola was the worst. The cause was the little axe drawn on lumberjacking rooms: no ordinary font has an axe, and every zoom step sent the window searching the system's fonts for one. The axe and pickaxe are now drawn as shapes, and those maps zoom as smoothly as the rest. Zooming also no longer pops up room cards as the map slides under your pointer.
- **DragonRealms and GemStone characters together.** Lichborne kept only one Lich map in memory, and the two games use different ones, so opening one character's map often re-read the whole file (several seconds) because the other game's map had been loaded in between. Each game's map now stays loaded.

### Clearer stops on a Genie map walk

When a walk reaches a step you have to do yourself, it now says what to do for every one of them. Several used to say only that the Genie maps team had scripted it. Shard's night-time detour, for example, now says the gates are shut to non-citizens at night, and how to go round or over the wall.

### Also fixed

- **Refreshing the Genie maps with their folder open** in File Explorer now tells you to close that window and try again, instead of a raw Windows error. Your maps were never touched either way.

### Spell Monitor

The Spell Monitor's spell list is up to date with Lich's again. It now knows the Trader spell **Prosperity in Absentia**, so that spell gets its Utility badge and its PRIA abbreviation.
