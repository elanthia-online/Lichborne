## v0.19.9

### Lichborne uses a lot less memory, especially with several characters open

A memory audit — the first this project has run, after a report that the client felt heavier than it used to — found that the map system was the single biggest consumer, and that almost none of it was recent.

**The map database is now loaded once, not once per character.** Lich's room database (~52,000 rooms) and the Genie zone cache were being parsed separately by every character's map panel. Open four characters with maps showing and you held four copies of roughly 27 MB of data — eight if you also used the Maps overlay. They are now parsed once and shared. Two characters connecting at the same moment parse it once between them rather than twice.

**Map tiles no longer accumulate forever.** The Lich map image cache had no size limit and never discarded anything, so every tile you viewed stayed in memory for the whole session — up to about 36 MB on a full map library, plus the decoded images on top. It now keeps the 30 most recently used tiles, which is far more than travelling revisits, so you should notice nothing except lower memory.

This matters most in **Windowed Panels** mode, where a map window stays open permanently and nothing was ever being reclaimed.

If you run several characters and keep a map visible, this is the release where that stops costing you hundreds of megabytes.

### Lichborne also uses a lot less CPU while sitting still

A second audit, on the CPU side, found the client burning most of a processor core whether or not the game was sending anything — and measured that the text-handling path (highlights, triggers, the whole per-line pipeline) accounted for about **1%** of it. The cost was animation that never stopped.

**Three things were animating forever that were only ever meant to animate briefly:**

- **The Moons sky** crossfades four full-panel gradient layers as the sun moves. The crossfade was set to 2.5 seconds against a scene that updates every 2 seconds, so it restarted before it could finish — permanently, day or night, whatever your settings. It now settles.
- **Spell Monitor bars** re-started their one-second slide every second, so every bar on screen was animating continuously even when a buff had half an hour left. They now move only when they visibly change.
- **The Lich Scripts poll** ran every five seconds for any character that had a Scripts tab *anywhere* — even sitting unselected behind another tab, feeding a panel that wasn't on screen. It now runs only while the panel is actually showing. This one also matters beyond CPU: anything Lichborne sends to Lich looks exactly like you typing it, so polling for a panel nobody is looking at could be picked up by scripts that watch your commands.

If you run several panels and Experiences at once, this is the release where the client stops working hard at nothing.

### Fixed

- **A stream panel could grow past its 500-line limit without bound.** If a single burst delivered exactly 500 lines to one stream, the trimming arithmetic inverted and kept the entire buffer instead of none of it — then did it again on the next burst. Rare, but it was unlimited growth in the one place that was supposed to be capped.
- **The map's ↺ reload button** now always re-reads the database rather than potentially serving the shared copy.
- An unchanged Lich script list no longer causes a redraw every five seconds.

### Notes

- If your sense of Lichborne being "heavier" goes back to early July, part of that was **v0.15.0's Electron upgrade** (a jump of 24 Chromium versions), which raised the baseline independently of anything in the client. That part is not recoverable, and nothing in this release changes it.
- Memory also scales with your own data: a character with a large imported highlight ruleset costs more than one without, and every connected character adds its own.
