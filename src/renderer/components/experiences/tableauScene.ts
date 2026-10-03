// tableauScene — what a room LOOKS like, read from its description (v0.20.2).
//
// The Living Tableau draws a quiet backdrop behind everyone. This decides what
// goes in it. Descriptions are what players actually see, so they are the
// signal (Sekmeht); the title only adds weight. A room is usually a MIXTURE —
// a road through a forest, a river below peaks — so the answer is a set of
// LAYERS, not one category:
//
//   enclosure  outdoor | indoor | cave   (indoor and cave replace everything)
//   far        the horizon: peaks, hills, dunes, the sea's edge, a city skyline
//   mid        what stands nearer: pines, broadleaf trees, palms, buildings,
//              castle walls, ruins, a shrine, crop rows, gravestones, reeds
//   near       what lies in front: a river, a lake, surf, a waterfall, lava, a road
//   ground     the tint of the floor the figures stand on
//
// How: every feature has weighted word patterns. A room's score for a feature
// is the sum of its matches (each pattern group counts at most two matches),
// with the title counting extra. Misleading phrases are removed first ("waves of heat", "an
// icy stare", "a sea of faces"). A sentence that is about the DISTANCE ("peaks
// rise in the distance") only feeds the far layer, at half weight.
//
// Tuned against the whole Lich map database (18,950 rooms) with the
// machine-local tmp-v0202-harness/scene-db.ts, which prints the distribution
// or samples real rooms per layer; gallery.tsx draws them for review. Costs
// tens of microseconds per room (about 60µs on a cold first pass over the
// whole DB), run once per room change (DESIGN §51.6). Pure: no React, no DOM.
//
// Caves and indoor rooms carry no far/mid layers. A river under a cave roof
// reads as the cave's pool ('lake'): there is no horizon to wind it towards.

export type Enclosure = 'outdoor' | 'indoor' | 'cave'
export type Interior = 'temple' | 'shop' | 'home' | 'hall'
export type FarLayer = 'peaks' | 'hills' | 'dunes' | 'sea' | 'skyline' | 'none'
export type MidLayer = 'pines' | 'trees' | 'palms' | 'buildings' | 'fort' | 'ruins' | 'shrine' | 'farm' | 'graves' | 'reeds' | 'none'
export type NearLayer = 'falls' | 'surf' | 'river' | 'lake' | 'lava' | 'road' | 'none'
export type Ground = 'grass' | 'forest' | 'sand' | 'snow' | 'stone' | 'swamp' | 'lava' | 'dirt' | 'floor' | 'cave'

export interface SceneSpec {
  enclosure: Enclosure
  interior: Interior | null
  far: FarLayer
  mid: MidLayer
  near: NearLayer
  bridge: boolean
  ground: Ground
}

type Pat = [RegExp, number]
const P = (src: string, w: number): Pat => [new RegExp(`\\b(?:${src})\\b`, 'g'), w]

// Phrases that use a scene word for something else. Removed before scoring.
const NOISE: RegExp[] = [
  /\bwaves? of (?:heat|sound|light|nausea|pain|fear|warmth|dizziness|colou?r|energy|magic|people|relief|emotion|cold|sand|grass|grain|wheat|dust|snow|stone|rock|hills?)\b/g,
  /\bsea of (?:faces|people|bodies|colou?rs?|tents|stalls|humanity|heads)\b/g,
  /\b(?:stream|streams|river|rivers) of (?:light|sunlight|moonlight|people|smoke|travell?ers|traffic|blood|sparks|colou?r|air|words|water vapor)\b/g,
  /\bforest of (?:masts|pillars|columns|spires|banners|poles)\b/g,
  /\bicy (?:stare|glare|tone|gaze|voice|look|smile|fingers?|grip|chill)\b/g,
  /\b(?:ice|icy|snow|snowy)[- ](?:white|blue|cold)\b/g,
  /\b(?:sand|sandy)[- ]colou?red\b/g,
  /\bdeck of cards\b/g,
  /\bsea[- ](?:green|blue|foam|shell)s?\b/g,
  /\bkeep(?:s|ing)? (?:watch|an eye|guard|out|away|clear|the|a|in|to|warm|dry|it|them)\b/g,
  /\b(?:forest|cave|cavern|canyon|valley|ocean|sea|jungle|desert|lake|river) floor\b/g,
  /\bcurrent(?:ly)? (?:fashion|owner|resident|style|occupant)s?\b/g,
]

// A sentence about the distance feeds only the horizon.
const DISTANT = /\b(?:in the distance|distant|far (?:off|away|to the|below)|horizon|beyond|faraway|looms? (?:over|above)|tower(?:s|ing)? (?:over|above))\b/

const F = {
  ceiling:  [P('ceilings?', 4)],
  furnish:  [P('counter|shelves|shelf|desk|carpet|rug|fireplace|hearth|hallway|corridor|stairwell|staircase|chandeliers?|tapestr(?:y|ies)|furniture|cabinets?|wardrobe|bookshel(?:f|ves)|beds?|bedroom|parlou?r|cots?|mattress|armchairs?|sofa|couch', 2), P('chairs|tables|benches|racks|displays|stools|shelving', 1), P('walls|floors?|doorway|rafters|room|rooms', 1)],
  indoorT:  [P('shop|inn|tavern|guild|temple|chapel|shrine|hall|room|chamber|library|kitchen|cellar|store|emporium|office|parlou?r|study|foyer|corridor|hallway|stairwell|workshop|forge|barracks|vault|attic|salon|lobby|sanctum|bank|teller|showroom|backroom|loft|quarters|bedroom|bath|smithy|bakery|mill|cabin|hut|tent|stable|granary|cistern|chambers|rooms|halls|house|dungeons?|cells?|gallery|galleries|alcove|crypt|tomb|mausoleum|lounge|den|pantry|nursery|infirmary|common room|great room|dining room|ballroom|throne room|atrium|vestibule|antechamber|kennel|armory|armoury|museum|theater|theatre|auditorium|classroom|lecture', 4)],
  cave:     [P('caverns?|stalactites?|stalagmites?', 4), P('caves?|underground|grottos?|subterranean', 3), P('tunnels?|mineshaft|mine shaft', 2), P('dripping|damp|seeping', 1)],
  caveT:    [P('mines?|caves?|caverns?|tunnels?|grottos?|burrows?|lair|catacombs?|sewers?|underground|depths|warrens?|undershard|undergondola', 4)],
  outdoor:  [P('sky|skies|sunlight|sunshine|clouds|breeze|wind|winds|stars|moonlight|horizon', 1)],
  peaks:    [P('mountains?|peaks?|summit|mountainside', 3), P('cliffs?|crags?|ridges?|foothills|escarpment|precipice|bluffs?', 2), P('boulders?|rocky|ledges?|scree|outcrops?', 1)],
  dunes:    [P('desert|dunes?', 3), P('arid|parched|scorching|cact(?:us|i)|sun-baked|wasteland', 2), P('sand|sands|sandy', 1)],
  sea:      [P('ocean|sea|seas|surf|tides?|seaweed|saltwater', 3), P('waves|beach|shore|coast|coastline|gulls?|seagulls?', 2)],
  town:     [P('streets?|storefronts?|townsfolk|rooftops|chimneys?|plaza|marketplace|bazaar', 2), P('buildings|shops|cobblestones?|cobbled|houses|cottages?|market|alleys?|alleyway', 2), P('homes|merchants?|vendors?|crowds?|passers-by|citizens|lanterns|signs?', 1)],
  // Not "road", "lane" or "way": most of those titles are wilderness roads.
  townT:    [P('street|square|alley|market|plaza|avenue|town|city|bazaar|courtyard|boulevard|promenade|village|district|quarter|tier|terrace', 3)],
  fort:     [P('battlements?|ramparts?|parapets?|turrets?|fortress|fortifications?|palisade|gatehouse|portcullis|barbican|crenellations?', 3), P('garrison|guardhouse|guardposts?|watchtowers?', 2), P('(?:city|town|stone|outer|defensive|castle) walls', 2)],
  fortT:    [P('keep|battlements|ramparts|wall|walls|gate|gatehouse|fort|fortress|castle|tower|citadel', 3)],
  // Not "abandoned" or "derelict": an abandoned FIELD is still a field.
  ruins:    [P('ruins?|ruined', 3), P('rubble|crumbling|collapsed|toppled', 2)],
  shrine:   [P('shrines?|obelisks?|monoliths?|standing stones?|altar', 2), P('temple|statues?', 1)],
  farm:     [P('farm|farmland|crops|wheat|barley|furrows?|vineyards?|orchards?|scarecrows?|haystacks?|barn', 3), P('corn|plow|plough|hay|livestock|pasture|cattle|sheep|goats', 2), P('fences?|fenced', 1)],
  graves:   [P('graveyard|cemetery|tombstones?|headstones?|mausoleums?|gravestones?', 4), P('graves?|tombs?|crypts?|burial', 2)],
  swamp:    [P('swamps?|marsh(?:es|y)?|bogs?|bayou|cattails', 3), P('fens?|mires?|murky|stagnant|reeds|quagmire', 2), P('mud|muck', 1)],
  trees:    [P('forest|woods|woodlands?|grove|thicket|copse|weald', 3), P('trees|canopy|trunks|undergrowth|saplings?|underbrush', 2), P('tree|oaks?|birch(?:es)?|willows?|maples?|elms?|ash trees|foliage|branches|leaves|bark', 1)],
  pines:    [P('pines?|firs?|spruces?|evergreens?|conifers?|cedars?|hemlocks?', 3)],
  palms:    [P('jungle|palms?|palm trees', 3), P('tropical|ferns|humid|lianas?', 2), P('vines', 1)],
  fields:   [P('prairie|grasslands?|meadows?|plains', 3), P('fields?|grasses|grass', 1)],
  // "falls" only in a title ("Wyvern Falls"). In prose it is nearly always the
  // verb: "the ground falls away", "light falls on", "accidental falls".
  falls:    [P('waterfalls?', 4), P('cascades?|cascading|plunges', 2), P('spray|mist', 1)],
  fallsT:   [P('falls', 4)],
  river:    [P('rivers?|streams?|creeks?|brooks?|rapids|riverbanks?|riverbed|rivulets?', 3), P('ford|current|banks?', 1)],
  lake:     [P('lakes?|ponds?|lagoons?|reservoir', 3), P('pools?', 2)],
  lava:     [P('lava|magma|molten', 3), P('volcan(?:ic|o)|sulfur|sulphur|brimstone', 2), P('obsidian|cinders?|ash|embers', 1)],
  road:     [P('roads?|roadway|highway|trade route', 2), P('trails?|path|paths|track|tracks|footpath|lane', 1)],
  bridge:   [P('bridges?', 3)],
  snow:     [P('glaciers?|tundra|blizzard|snowfield', 3), P('snow|snowy|snowdrifts?|drifts|frozen|icicles?', 2), P('ice|icy|frost|frosty|sleet', 1)],
  temple:   [P('altar|pews?|nave|sanctuary|sacred|incense|holy|idols?', 2), P('statues?|candles', 1)],
  shopI:    [P('counter|wares|merchandise|shelves|displays?|racks|goods|for sale|clerk|proprietor|shopkeeper', 2)],
  homeI:    [P('beds?|bedroom|fireplace|hearth|kitchen|table and chairs|rocking chair|quilts?|cots?', 2)],
} satisfies Record<string, Pat[]>
type Feat = keyof typeof F

function score(text: string, pats: Pat[]): number {
  let s = 0
  for (const [re, w] of pats) {
    re.lastIndex = 0
    let n = 0
    while (re.exec(text) && n < 2) n++
    s += n * w
  }
  return s
}

/** Raw feature scores for a room (exported for the harness). */
export function sceneScores(title: string, desc: string): Record<Feat, number> {
  let d = ` ${(desc ?? '').toLowerCase()} `
  for (const re of NOISE) d = d.replace(re, ' ')
  const t = ` ${(title ?? '').toLowerCase().replace(/\[|\]/g, '')} `
  const sentences = d.split(/(?<=[.!?])\s+/)
  const near = sentences.filter(s => !DISTANT.test(s)).join(' ')
  const far = sentences.filter(s => DISTANT.test(s)).join(' ')
  const out = {} as Record<Feat, number>
  const FAR_ONLY = new Set<Feat>(['peaks', 'dunes', 'sea', 'town', 'fort'])
  // Features ending in T are title words ("shop", "gate", "road"): in a
  // description they are asides ("the shop's front door"), not the place.
  const TITLE_ONLY = new Set<Feat>(['indoorT', 'townT', 'fortT', 'caveT', 'fallsT'])
  for (const k of Object.keys(F) as Feat[]) {
    out[k] = (TITLE_ONLY.has(k) ? 0 : score(near, F[k])) + 3 * score(t, F[k])
    if (FAR_ONLY.has(k)) out[k] += score(far, F[k]) / 2
  }
  return out
}

const pick = <K extends string>(cands: [K, number][], min: number): K | null => {
  let best: K | null = null, bs = min - 0.001
  for (const [k, s] of cands) if (s > bs) { best = k; bs = s }
  return best
}

/** What a room looks like, from its title and description. */
export function sceneOf(title: string, desc: string): SceneSpec {
  title = title ?? ''
  desc = desc ?? ''
  const s = sceneScores(title, desc)
  const indoor = s.ceiling + s.furnish + s.indoorT
  const caveS = s.cave + s.caveT
  // Indoors needs real evidence: a ceiling, furniture, or an indoor title. A
  // room that also reads strongly outdoors (sky, wind, stars) needs more.
  const outdoorish = s.outdoor + s.trees + s.peaks + s.sea + s.river
  if (caveS >= 4 && caveS >= indoor) {
    return { enclosure: 'cave', interior: null, far: 'none', mid: 'none', near: s.river >= 3 || s.lake >= 3 ? 'lake' : s.lava >= 3 ? 'lava' : 'none', bridge: false, ground: 'cave' }
  }
  if (indoor >= 4 && indoor >= outdoorish) {
    const interior = pick<Interior>([['temple', s.temple], ['shop', s.shopI], ['home', s.homeI]], 2) ?? 'hall'
    return { enclosure: 'indoor', interior, far: 'none', mid: 'none', near: 'none', bridge: false, ground: 'floor' }
  }

  const townS = s.town + s.townT
  const fortS = s.fort + s.fortT
  const far = pick<FarLayer>([['peaks', s.peaks], ['dunes', s.dunes], ['sea', s.sea]], 3)
    ?? (townS >= 6 || fortS >= 6 ? 'skyline' : 'hills')

  const treeS = s.trees + s.pines + s.palms
  const treeKind: MidLayer = s.palms > s.pines && s.palms >= 3 ? 'palms'
    : s.pines >= 3 || (treeS >= 3 && (s.snow >= 3 || s.peaks >= 4)) ? 'pines' : 'trees'
  const mid = pick<MidLayer>([
    ['graves', s.graves], ['ruins', s.ruins], ['fort', fortS], ['shrine', s.shrine], ['farm', s.farm],
    ['buildings', townS], ['reeds', s.swamp], [treeKind, treeS],
  ], 3) ?? 'none'

  // Surf needs the sea to be HERE (beach, waves, tide), not a passing mention.
  const nearW = pick<NearLayer>([['falls', s.falls + s.fallsT], ['surf', s.sea >= 5 ? s.sea : 0], ['river', s.river], ['lake', s.lake], ['lava', s.lava]], 3)
  const near: NearLayer = nearW ?? (s.road >= 2 ? 'road' : 'none')
  const bridge = s.bridge >= 3 && (s.river + s.lake + s.sea >= 2 || /\bbridge\b/.test(title.toLowerCase()))

  const ground: Ground = s.snow >= 3 ? 'snow'
    : s.lava >= 3 ? 'lava'
    : s.swamp >= 3 ? 'swamp'
    : s.dunes >= 3 || (near === 'surf' && /\b(?:beach|sand)\b/.test(desc.toLowerCase())) ? 'sand'
    : mid === 'buildings' || mid === 'fort' || mid === 'ruins' ? 'stone'
    : mid === 'trees' || mid === 'pines' || mid === 'palms' ? 'forest'
    : near === 'road' && s.fields < 2 ? 'dirt'
    : 'grass'
  return { enclosure: 'outdoor', interior: null, far, mid, near, bridge, ground }
}
