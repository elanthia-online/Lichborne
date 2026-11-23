# Da'Maps maps

Da'Maps' own maps, one `.damap` file per map, made and changed in the
DaMaps Editor (a separate map-making program). They started as the community Genie
maps, exported 2026-11-23 exactly as Da'Maps showed them (each town's side
maps folded in: the Crossing holds the temple, Jadewater, the market plaza
and the pier). They are now the source: the build reads these and Lich's map
database, and nothing from Genie.

    node tools/damaps/build-damaps.mjs <Lich map-NNNN.json>

writes `src/renderer/public/damaps-world.json`, which ships with Lichborne, and
`index.json` here (each map's name and git blob id), which the DaMaps Editor
reads to download the latest maps from GitHub.

A file's own name doesn't matter. Inside, `file` (the "Link name" in the
editor) is what identifies the map and what doorways point at; `includes`
lists the side maps' old link names, so doorways to those still arrive here.
A room's optional `lich` number overrides the automatic match to a Lich room.

To export again from a Genie folder (this overwrites nothing in place):

    node tools/damaps/export-damaps.mjs <Genie maps folder> <out folder>
