// Da'Maps — the shape of Da'Maps' built map (one DaWorldFile).
//
// build/buildWorld.ts makes it from the .damap files and Lich's map;
// damapsWorld.ts reads it. A file of its own so the build doesn't import the
// loader (which imports the build).

export const DA_WORLD_VERSION = 1

/** [id, lich id (0 = none), x, y, fill ('' = none), marker target area ('' = none), title, marker's go2 Lich room (0 = none)] */
export type DaWorldRoom = [number, number, number, number, string, string, string, number?]
/** [from id, to id, 0 cardinal | 1 climb | 2 go] */
export type DaWorldLine = [number, number, number]
/** [name, x1, y1, x2, y2, room ids, 1 = draw its dotted outline] */
export type DaWorldBuilding = [string, number, number, number, number, number[], number]

export interface DaWorldArea {
  key:       string
  name:      string
  province:  string
  /** all floors of this map, ground floor first (keys); [key] for one floor */
  floors:    string[]
  rooms:     DaWorldRoom[]
  lines:     DaWorldLine[]
  texts:     [string, number, number][]
  buildings: DaWorldBuilding[]
  /** [from id, to id, Genie move] where either end is a "?" square (optional:
   *  files made before 2026-11-22 have none, and then those rooms can't be walked) */
  moves?:    [number, number, string][]
}

export interface DaWorldFile {
  version: number
  made:    string
  /** where it was built from, for the record */
  sources: { maps: string; lich: string }
  stats:   { areas: number; squares: number; matched: number }
  areas:   DaWorldArea[]
}
