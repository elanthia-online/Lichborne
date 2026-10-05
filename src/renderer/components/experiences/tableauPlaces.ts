// tableauPlaces — which TOWN a room is in, and what that town looks like (v0.20.3).
//
// The Living Tableau reads what a room contains from its description
// (tableauScene.ts). This adds where it is: Shard's buildings are crystal
// spires, Muspar'i's are sandstone domes, Ratha climbs cliff terraces over the
// sea. The description still decides WHAT is drawn; the town decides how its
// buildings look, and fills in a horizon the description leaves blank.
//
// Where the town comes from, in order:
//   1. the title's place name ("[Ratha, Amakra Close]"), via PLACE_PREFIXES —
//      generated from Lich's map database by tools/gen-place-data.mjs, so a
//      district or building whose title never names the town ("[Undershard,
//      …]", "[Crossing Temple, …]", "[Theren Keep, …]") still maps to it;
//   2. a town name at the start of the title (NAMES), for prefixes the
//      generated table doesn't know;
//   3. the LAST town this character was in (Sekmeht: walk into a building in
//      Shard and the title stops saying Shard). That is kept by GameWindow per
//      character and handed in as `prev`. It is dropped as soon as a room reads
//      as open wilderness, so leaving town by an unnamed road doesn't carry
//      Shard's spires to the next village.
//
// Pure: no React, no DOM. Costs a lookup per room change.

import { PLACE_PREFIXES } from './placeData'
import { sceneOf, type FarLayer } from './tableauScene'

export type PlaceKey =
  | 'crossing' | 'riverhaven' | 'therenborough' | 'ratha' | 'aesry' | 'shard' | 'merkresh' | 'muspari'
  | 'hibarnhvidar' | 'leth' | 'throne' | 'dirge' | 'langenfirth' | 'siksraja' | 'rossman' | 'ilaya'
  | 'acenamacra' | 'fangcove' | 'boarclan' | 'tigerclan' | 'wolfclan' | 'knifeclan' | 'steelclaw' | 'zaldi'
  | 'sunfall' | 'ainghazal' | 'chyolvea' | 'fornsted' | 'ravenspoint' | 'stoneclan' | 'arthedale' | 'kaerna'
  | 'haizen' | 'fayrin' | 'enclave' | 'promado' | 'siclegrove' | 'hvaral' | 'arthelun'

// How a town's buildings are drawn (tableauBackdrop.tsx).
export type TownStyle =
  | 'river'      // gabled stone and timber houses, chimneys, a temple spire
  | 'harbor'     // boardwalks on pilings, masts
  | 'tiers'      // terraces stepping up a cliff, arches and columns
  | 'floating'   // buildings on platforms over water, little bridges, a bell tower
  | 'sandstone'  // domes, flat roofs, slender towers, palms
  | 'crystal'    // slender spires with crystal tips
  | 'elven'      // one great tree with platforms, small wooden houses
  | 'dwarven'    // arches and doors carved into a rock face
  | 'logs'       // log cabins among firs
  | 'clan'       // longhouses and a palisade
  | 'tents'      // felt and hide tents on poles
  | 'ruins'      // broken columns, a cracked dome, empty arches
  | 'fortress'   // a keep or chateau on a height

export interface PlaceDef {
  name: string
  style: TownStyle
  /** The horizon to show when the description doesn't say one. */
  far?: FarLayer
  /** A still haze near the ground (Aesry's lake mist). */
  mist?: boolean
  /** Volcanic country: ash ground, a smoking cone (Dirge, Sicle Grove). */
  volcanic?: boolean
}

// From Elanthipedia's city pages and the map DB's own descriptions (DESIGN §51.6).
export const PLACES: Record<PlaceKey, PlaceDef> = {
  crossing:      { name: 'The Crossing', style: 'river' },
  riverhaven:    { name: 'Riverhaven', style: 'river' },
  therenborough: { name: 'Therenborough', style: 'river' },
  arthedale:     { name: 'Arthe Dale', style: 'river' },
  kaerna:        { name: 'Kaerna Village', style: 'river' },
  ratha:         { name: 'Ratha', style: 'tiers', far: 'sea' },
  aesry:         { name: "Aesry Surlaenis'a", style: 'tiers', mist: true },
  shard:         { name: 'Shard', style: 'crystal', far: 'peaks' },
  merkresh:      { name: "Mer'Kresh", style: 'floating', far: 'sea' },
  muspari:       { name: "Muspar'i", style: 'sandstone', far: 'dunes' },
  haizen:        { name: 'Haizen Cugis', style: 'sandstone', far: 'dunes' },
  hibarnhvidar:  { name: 'Hibarnhvidar', style: 'dwarven', far: 'peaks' },
  ravenspoint:   { name: "Raven's Point", style: 'dwarven', far: 'peaks' },
  stoneclan:     { name: 'Stone Clan', style: 'dwarven', far: 'peaks' },
  hvaral:        { name: 'Hvaral', style: 'fortress', far: 'peaks' },
  leth:          { name: 'Leth Deriel', style: 'elven' },
  fayrin:        { name: "Fayrin's Rest", style: 'elven' },
  throne:        { name: 'Throne City', style: 'ruins' },
  promado:       { name: 'Promado', style: 'ruins' },
  dirge:         { name: 'Dirge', style: 'ruins', volcanic: true },
  siclegrove:    { name: 'Sicle Grove', style: 'ruins', volcanic: true },
  arthelun:      { name: 'Arthelun Ruins', style: 'ruins', volcanic: true },
  langenfirth:   { name: 'Langenfirth', style: 'logs' },
  siksraja:      { name: 'Siksraja', style: 'logs' },
  rossman:       { name: "Rossman's Landing", style: 'logs' },
  ilaya:         { name: 'Ilaya Taipa', style: 'harbor' },
  acenamacra:    { name: 'Acenamacra', style: 'harbor', far: 'sea' },
  fangcove:      { name: 'Fang Cove', style: 'harbor', far: 'sea' },
  enclave:       { name: 'The Enclave', style: 'harbor', far: 'sea' },
  boarclan:      { name: 'Boar Clan', style: 'clan' },
  tigerclan:     { name: 'Tiger Clan', style: 'clan' },
  wolfclan:      { name: 'Wolf Clan', style: 'clan' },
  knifeclan:     { name: 'Knife Clan', style: 'clan', far: 'peaks' },
  steelclaw:     { name: 'Steelclaw Clan', style: 'clan', far: 'peaks' },
  zaldi:         { name: 'Zaldi Taipa', style: 'tents' },
  sunfall:       { name: 'Sunfall Hub', style: 'tents', far: 'peaks' },
  ainghazal:     { name: 'Ain Ghazal', style: 'fortress', far: 'peaks' },
  chyolvea:      { name: "Chyolvea Tayeu'a", style: 'fortress', far: 'peaks' },
  fornsted:      { name: 'Fornsted', style: 'fortress' },
}

// Town names a title can start with, for prefixes the generated table doesn't
// hold. Longest first, so "inner hibarnhvidar" is tried before "hibarnhvidar".
const NAMES: [string, PlaceKey][] = ([
  ['the crossing', 'crossing'], ['crossing', 'crossing'], ['riverhaven', 'riverhaven'], ['therenborough', 'therenborough'],
  ['theren keep', 'therenborough'], ['arthe dale', 'arthedale'], ['kaerna', 'kaerna'], ['ratha', 'ratha'],
  ["aesry surlaenis'a", 'aesry'], ['aesry', 'aesry'], ['shard', 'shard'], ['undershard', 'shard'], ["mer'kresh", 'merkresh'],
  ["muspar'i", 'muspari'], ['haizen cugis', 'haizen'], ['yuc cugis', 'haizen'], ['inner hibarnhvidar', 'hibarnhvidar'],
  ['outer hibarnhvidar', 'hibarnhvidar'], ['hibarnhvidar', 'hibarnhvidar'], ["raven's point", 'ravenspoint'],
  ['stone clan', 'stoneclan'], ['hvaral', 'hvaral'], ['leth deriel', 'leth'], ["fayrin's rest", 'fayrin'],
  ['old throne city', 'throne'], ['throne city', 'throne'], ['promado', 'promado'], ['dirge', 'dirge'],
  ['sicle grove', 'siclegrove'], ['arthelun', 'arthelun'], ['langenfirth', 'langenfirth'], ['siksraja', 'siksraja'], ["rossman's landing", 'rossman'],
  ['ilaya taipa', 'ilaya'], ['acenamacra', 'acenamacra'], ['fang cove', 'fangcove'], ['the enclave', 'enclave'],
  ['boar clan', 'boarclan'], ['tiger clan', 'tigerclan'], ['wolf clan', 'wolfclan'], ['knife clan', 'knifeclan'],
  ['steelclaw clan', 'steelclaw'], ['zaldi taipa', 'zaldi'], ['sunfall hub', 'sunfall'], ['ain ghazal', 'ainghazal'],
  ["chyolvea tayeu'a", 'chyolvea'], ['fornsted', 'fornsted'],
] as [string, PlaceKey][]).sort((a, b) => b[0].length - a[0].length)

const prefixOf = (title: string) => {
  const t = title.replace(/^\[+|\]+$/g, '').trim()
  return (t.includes(',') ? t.slice(0, t.indexOf(',')) : t).trim().toLowerCase()
}

/** The town a title names, if it names one. */
export function placeOfTitle(title: string): PlaceKey | null {
  const p = prefixOf(title ?? '')
  if (!p) return null
  const hit = PLACE_PREFIXES[p]
  if (hit) return hit
  for (const [n, k] of NAMES) if (p === n || p.startsWith(n + ' ')) return k
  return null
}

/**
 * The town a room is in: the one its title names, else the last one (`prev`)
 * as long as the room could still be in town. A room that reads as open
 * wilderness (outdoors, nothing built) clears it. Idempotent: calling it again
 * with its own result as `prev` returns the same answer.
 */
export function resolvePlace(title: string, desc: string, prev: PlaceKey | null): PlaceKey | null {
  const named = placeOfTitle(title)
  if (named) return named
  // No description yet: keep the town. A room change clears the description
  // and the new one usually lands in the same batch, but when it doesn't, a
  // title alone can read as open country and would forget the town for good.
  if (!prev || !title || !desc?.trim()) return prev ?? null
  const s = sceneOf(title, desc)
  if (s.enclosure !== 'outdoor') return prev
  const built = s.mid === 'buildings' || s.mid === 'fort' || s.mid === 'ruins' || s.far === 'skyline' || s.ground === 'stone'
  return built ? prev : null
}
