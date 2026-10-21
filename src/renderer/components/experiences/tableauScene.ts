// tableauScene — what a room LOOKS like, read from its description (v0.20.2, v0.20.3).
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
// v0.20.3 (DESIGN §52) added, on top of those layers:
//   - THINGS: indoors the walls' material, the light, up to three furnishings
//     and a shop's wares; outdoors and in caves up to four props; paving
//     (sceneThings, below). A prop must be HERE (sentences about the distance
//     don't count) and must be the THING itself, not a word describing
//     something else ("rose colored curtains", "an oak door", "wagon tracks":
//     DESCRIBES and the per-prop lookaheads in PROPS).
//   - the TOWN the room is in (tableauPlaces.ts), which styles the buildings
//     and fills in a horizon the description leaves blank;
//   - new terrain (jungle, savannah, dead trees, moor, ash), kinds of cave,
//     haze, a volcano, snow on the peaks.
//
// Tuned against the whole Lich map database (18,945 rooms with prose): first
// with tmp-v0202-harness/scene-db.ts, then in v0.20.3 by reading every room
// (tmp-v0203-scene/review.ts) and the harness there (run.ts, plus snapall.ts
// to diff the whole map before and after a rule change). Re-run them after any
// pattern change: a word that reads well in one room is a figure of speech in
// fifty others. Costs about 0.3ms per room (293µs mean, 1ms worst, measured
// v0.20.3), run once per room change. Pure: no React, no DOM.
//
// Caves and indoor rooms carry no far/mid layers. A river under a cave roof
// reads as the cave's pool ('lake'): there is no horizon to wind it towards.

import type { PlaceDef, TownStyle } from './tableauPlaces'

export type Enclosure = 'outdoor' | 'indoor' | 'cave'
export type Interior = 'temple' | 'shop' | 'home' | 'hall'
export type FarLayer = 'peaks' | 'hills' | 'dunes' | 'sea' | 'skyline' | 'none'
export type MidLayer = 'pines' | 'trees' | 'palms' | 'jungle' | 'savannah' | 'deadtrees' | 'buildings' | 'fort' | 'ruins' | 'shrine' | 'farm' | 'graves' | 'reeds' | 'none'
export type NearLayer = 'falls' | 'surf' | 'river' | 'lake' | 'lava' | 'road' | 'none'
export type Ground = 'grass' | 'forest' | 'sand' | 'snow' | 'stone' | 'swamp' | 'lava' | 'ash' | 'moor' | 'dirt' | 'floor' | 'cave'
/** What a cave is: a natural cavern, a carved tunnel, a mine, a sewer, or ice. */
export type CaveKind = 'natural' | 'tunnel' | 'mine' | 'sewer' | 'ice'

// v0.20.3: the THINGS in a room, layered over the kind of place above.
// Indoors: what the walls are made of, what lights the room, its furnishings,
// and for a shop what it sells. Outdoors: the props that stand in the scene.
export type Walls = 'stone' | 'marble' | 'wood' | 'plaster' | 'canvas' | 'earth' | 'metal' | 'plain'
export type Light = 'orbs' | 'lanterns' | 'candles' | 'torches' | 'fire' | 'daylight'
export type Fixture = 'counter' | 'shelves' | 'racks' | 'cases' | 'tables' | 'benches' | 'bar' | 'hearth' | 'stairs' | 'columns'
  | 'windows' | 'stainedglass' | 'tapestries' | 'rug' | 'chandelier' | 'bed' | 'desk' | 'altar' | 'forge' | 'barrels' | 'books' | 'plants'
  | 'door'
  // The prop round (v0.20.3): things the full-map review saw undrawn.
  | 'statue' | 'paintings' | 'mirror' | 'mannequins' | 'workbench' | 'stage' | 'pool'
export type Ware = 'weapons' | 'armor' | 'clothing' | 'jewelry' | 'alchemy' | 'food' | 'drink' | 'books' | 'furs' | 'tools'
  | 'flowers' | 'coin' | 'music' | 'general'
export type Prop = 'tower' | 'fountain' | 'statue' | 'well' | 'benches' | 'stalls' | 'tents' | 'fence' | 'gate' | 'dock' | 'boats'
  | 'campfire' | 'flowers' | 'lampposts' | 'bones' | 'logs'
  // From the whole-map coverage scan (tmp-v0203-scene/coverage.ts): the things
  // descriptions mention most that nothing drew.
  | 'boulders' | 'door' | 'arch' | 'shrubs' | 'vines' | 'birds' | 'sign' | 'crystals' | 'tree' | 'rubble'
  | 'cart' | 'mushrooms' | 'webs' | 'banners' | 'animals' | 'smoke'
  // The prop round (v0.20.3): what the full-map review saw undrawn most.
  | 'obelisk' | 'pillars' | 'pool' | 'hut' | 'arbor' | 'brazier' | 'bell' | 'crates' | 'nest' | 'stalactites'
/** The surface underfoot, when the description says: paving drawn on the ground. */
export type Pavement = 'cobbles' | 'flagstones' | 'mosaic' | 'planks'

export interface SceneSpec {
  enclosure: Enclosure
  interior: Interior | null
  far: FarLayer
  mid: MidLayer
  near: NearLayer
  bridge: boolean
  ground: Ground
  /** Indoors and caves: the walls' material ('plain' when nothing says). */
  walls: Walls
  /** Indoors and caves: what lights the room, when the description says. */
  light: Light | null
  /** Indoors: up to three furnishings, strongest first. */
  fixtures: Fixture[]
  /** A shop: what it sells ('general' when it doesn't say). Null elsewhere. */
  wares: Ware | null
  /** Outdoors and caves: up to four things standing in the scene, strongest first. */
  props: Prop[]
  /** What is underfoot when the description says (cobbles, a mosaic floor…). */
  pavement: Pavement | null
  /** The town's building style, when the room is in a town (tableauPlaces.ts). */
  town: TownStyle | null
  /** Outdoors: a still haze near the ground (fog, mist, Aesry's lake). */
  haze: boolean
  /** Outdoors: volcanic country — a smoking cone on the horizon, ash underfoot. */
  volcanic: boolean
  /** Outdoors: the peaks carry snow. */
  snowcaps: boolean
  /** Caves: what kind ('natural' when nothing says). */
  caveKind: CaveKind
}

type Pat = [RegExp, number]
const P = (src: string, w: number): Pat => [new RegExp(`\\b(?:${src})\\b`, 'g'), w]

// "A stream of traffic", "pools of light", "a sea of green", "a forest of
// masts": a water or forest word followed by "of" and something that isn't
// one. The literal kind survives ("a stream of water", "the Lake of Dreams").
// Named so a title can skip them: "Forest of Night" is a forest.
const WATER_OF = /\b(?:streams?|rivers?|seas?|oceans?|pools?|waves?|cascades?|torrents?|floods?|tides?|lakes?) of (?!(?:clear |cool |cold |fresh |murky |brackish |stagnant |still |shallow |deep |dark |icy |sea|salt|rain|running |rushing |glassy |melted |frozen )*(?:water|seawater|saltwater|rainwater|tears|dreams))[a-z'-]+/g
const FOREST_OF = /\bforests? of (?!(?:tall |towering |ancient |young |dense )*(?:trees|evergreens?|aspens?|silverwood|oaks?|pines?|birch(?:es)?|firs?|spruces?|willows?|elms?|maples?|cedars?|deobars?))[a-z'-]+/g

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
  /\b(?:forest|cave|cavern|canyon|valley|ocean|sea|jungle|desert|lake|river|crater|gorge|ravine|basin|chasm|pit|swamp|marsh|grotto|tunnel|mine|glade|clearing|woodland) floor\b/g,
  /\bcurrent(?:ly)? (?:fashion|owner|resident|style|occupant)s?\b/g,
  // v0.20.3, from the whole-map trap scan (tmp-v0203-scene/follow.js): scene
  // words used as verbs or figures of speech. Room 764 drew a river because
  // "injured and infirm people stream in and out of a double door".
  // Something that STREAMS: people, light, air, marble tiles. A literal stream
  // follows an article ("a stream in the valley", "fed by a stream from the
  // south"), so only these subjects are removed.
  /\b(?:people|figures|folk|townsfolk|travell?ers|customers|patrons|shoppers|crowds?|pilgrims|merchants|men|women|children|soldiers|guards|workers|students|visitors|adventurers|humans|elves|dwarves|halflings|gor'togs|elotheans|prydaen|rakash|gnomes|who|they|that) (?:\w+ ){0,2}?stream(?:s|ed|ing)?\b/g,
  /\b(?:(?:sun|moon|day|star|lamp|torch|fire|candle)?light|air|rays|beams|smoke|steam|marble|tiles?|sand|dust|warmth|heat) stream(?:s|ed|ing)?\b/g,
  /\bstream(?:s|ed|ing)? (?:in through|in from|outwards?|forth)\b/g,
  /\blike (?:a|the) (?:stream|river|sea|wave|waterfall|torrent|flood|lake)\b/g,
  /\b(?:steady|constant|endless|thin|continuous|unending|never-ending) streams?\b/g,
  WATER_OF,
  FOREST_OF,
  /\bcurrent (?:production|state|project|projects|events?|affairs|era|season|owner)\b/g,
  /\b(?:provincial|town|city|the) bank(?:'s)? (?:patrons|building|tellers?|clerks?|vault)\b|\bbank (?:patrons|building|tellers?|clerks?)\b/g,
  // From the 500-room review (v0.20.3). Each of these drew something the room
  // doesn't have.
  // Similes and pictures: "rows curve like waves parting around a rock in the
  // ocean", walls "painted a deep blue, like that of a pure ocean lagoon",
  // "murals of rolling green hills". The clause, to the next punctuation.
  /\b(?:like (?:a|an|the|that of|some|those of)|as if|as though|resembl(?:e|es|ed|ing)|reminiscent of|depict(?:s|ed|ing)?|murals? of|paintings? of|images? of|scenes? of|painted (?:with|to (?:look|resemble)|in the (?:likeness|shape)|like)|mimic(?:s|king)?|replicat(?:e|es|ed|ing))\b[^,.;:!?]*/g,
  // Negation: "No water here, and certainly no ships", "No birds fly".
  /\b(?:no|nor|without|never a|not a|not one|devoid of|bereft of|free of|lacking)\b(?: (?:sign|trace|hint|evidence) of)?(?: [a-z'-]+){1,3}/g,
  // A bed that isn't furniture: "the dry lake bed", "raised beds" of herbs.
  // A flower bed keeps its flowers ("a bed of roses", "flowerbeds", Sekmeht):
  // only the word "bed" goes, so the flowers prop still sees them.
  /\b(?:lake|sea|ocean|mud|dry|reed|raised|garden|herb|vegetable|planting|moss|kelp|oyster)[- ]?beds?\b|(?<=\bflower[- ]?)beds?\b|\bbeds? of (?=(?:[a-z-]+ )?(?:roses|flowers|wildflowers|lilies|tulips|blossoms|blooms|daisies|marigolds|violets|irises)\b)|\bbeds? of (?!(?:the|a|an|his|her|their)\b)[a-z-]+(?: [a-z-]+)?|carpets? of (?!(?:the|a|an)\b)[a-z-]+|tunnels? of (?:living )?(?:greenery|hedges?|vines|leaves|branches|foliage|trees|boxwood)|corridor (?:through|of) (?:the )?(?:wilderness|growth|trees|foliage|greenery)\b/g,
  // "A shelf of rock rises from the soil" is not shelving.
  /\bshel(?:f|ves) of (?:rock|stone|ice|land|sand|slate|granite|shale|earth)\b|\b(?:rock|stone|ice|sandstone|limestone|granite|slate|shale) shel(?:f|ves)\b/g,
  // An ash tree is not volcanic ash ("Blue Ash Tree Limb"). Only "ash" goes:
  // the tree, the limb and the leaves stay and still count as trees.
  /\b(?:blue |white |black |mountain |green )?ash(?= (?:trees?|wood|bark|limbs?|branches|grove|saplings?|leaves)\b)/g,
  // "The Boxwood Maze, Dead End" has no dead trees; "planks cobbled together"
  // are not cobblestones.
  /\bdead[- ]ends?\b/g,
  /\bcobbled (?:together|up|from)\b/g,
  // ── From the full-map review (v0.20.3, every room read by eye) ──
  // Water that isn't there any more: "a dry creek bed", "where a river once
  // flowed", "the remnant of a primeval river", "water is long gone".
  /\b(?:dry|dried|dried-up|drying|empty|long-gone|long-dead|former|vanished|ancient dry) (?:[a-z-]+ )?(?:stream|river|creek|brook|rivulet|lake|pond|waterfall|water ?course|channel)s?(?: ?beds?)?\b/g,
  /\b(?:river|stream|creek|brook|lake|water|waterfall)s? (?:that |which )?(?:once|long ago|has long since|have long since|is long gone|is gone|are gone|dried|ran dry|no longer)\b[^,.;:!?]*/g,
  /\b(?:where|once) (?:a|an|the|been) (?:[a-z-]+ ){0,2}(?:river|stream|lake|streams|rivers)\b[^,.;:!?]*/g,
  /\bremnants? of (?:a|an|the) (?:[a-z-]+ ){0,2}(?:river|stream|lake)\b/g,
  /\bbecomes? a (?:small |tiny )?stream\b/g,
  // A water word naming a thing that isn't water.
  /\briver[- ]?(?:rocks?|stones?|pebbles?|rats?|plains?|air|birch(?:es)?|reeds?)\b|\briverstones?\b/g,
  /\b(?:sea[- ]?salt|salt of the sea|grain sea|a beach of|a mountain of|tide (?:\w+ )?over|watery|energy streams?|streams? of (?:energy|power|mana|magic|colou?r|yarn|ribbon)|(?:pools?|pool) of (?:shade|shadow|light|darkness|sunlight|moonlight))\b/g,
  /\bcolou?rs? of the (?:sea|ocean|sky|forest|desert|sunset|dawn)\b|\bsea colou?rs?\b/g,
  /\bsounds? of the (?:sea|ocean|surf|waves|tide)\b|\bocean (?:breeze|breezes|wind|winds|air|scent|smell)\b/g,
  /\bstream(?:s|ed|ing) (?:through|down|from|past|out|in|across|into)\b/g,
  /\billusion of\b[^,.;:!?]*/g,
  /\b(?:at (?:its|their|the) )?peak of (?:the )?(?:day|season|perfection|summer|winter|hour|night|power)\b|\bat (?:its|their|her|his) peak\b/g,
  /\bfar from (?:any )?[a-z'-]+(?: [a-z'-]+)?/g,
  /\bwaves? of (?:[a-z-]+ ){0,2}tiles?\b|\bmosaic of\b[^,.;:!?]*/g,
  /\b(?:leafy|green|living|verdant|twisted|tangled) (?:ceiling|roof|walls?|columns|carpet)\b|\bceiling of (?:[a-z-]+ ){0,2}(?:branches|vines|leaves|foliage|trees|clouds|boughs)\b/g,
  /\bpalm-sized\b|\bsize of a (?:large |small |man's |child's )?palm\b|\bpalms? (?:outward|upward|up|down|together|pressed|raised|open)\b|\b(?:his|her|their|your|my|its) palms?\b/g,
  /\b(?:moored|mooring|can moor|to moor|could moor)\b/g,
  /\bdesert (?:gardens?|roses?|flowers?|plants?|blooms?)\b/g,
  /\binterior of the (?:valley|gorge|canyon|crater|forest|woods|island|jungle|plain)\b/g,
  /\b(?:little|tiny) lakes\b|\bmountain laurels?\b|\bmonuments? to\b|\bpalm (?:inn|road|street|lane|court|tavern)\b/g,
  /\b(?:in|into) ruins\b|\b(?:ruined|lifeless) mess\b/g,
  /\bjungles? of\b[^,.;:!?]*/g,
  /\bforest of standing stones\b/g,
  /\bpeaks and valleys\b|\bappears? (?:as|to be) (?:an? |the )?(?:almost |nearly )?[^,.;:!?]*/g,
  /\bmolten (?:metal|iron|steel|bronze|copper|gold|silver|glass|wax|slag)\b|\blava (?:floor|stone|rock|tiles?|counter|blocks?)\b|\b(?:solidified|cooled|hardened|ancient) lava\b|\bonce held lava\b|\blava that (?:once|long ago)\b/g,
  /\bobservation box(?:es)?\b|\bbarrel[- ]vault(?:ed)?\b|\bbirds of paradise\b|\bdune sea\b|\bswamp bay\b|\bspider ?web (?:of )?cracks\b/g,
  // More similes: "like waves parting", "brings to mind waterfalls", "as smooth
  // as a stream", "might as well be a barren desert".
  /\b(?:like (?:[a-z-]+ ){0,2}(?:waves|waterfalls?|rivers?|streams?|statues|skeletons|headstones|tombstones|graves|webs|hens|snow|snowy|drifts|mist|ghosts|soldiers|sentinels|banners|watchtowers|turrets|fingers|teeth|mushrooms|tents?|towers|spires|lakes?|oceans?|seas?|bogs?|swamps?|marsh(?:es)?|desert)|brings? to mind|reminds? (?:one|you|me|them) of|as [a-z-]+ as (?:a|an|the|any|some)|might as well be)\b[^,.;:!?]*/g,
]

// Noise for the SCENE only, not the things in it: "oak walls" are still
// wooden walls, a mural still hangs on the wall, a mosaic floor of waves is
// still a mosaic floor. They just say nothing about forests or the sea.
const SCENE_NOISE: RegExp[] = [
  /\b(?:mosaic|tiles?|tiled|inlaid|painted|etched|engraved|carved|stitched|woven|embroidered|stenciled)[^.;:!?]{0,40}(?:waves?|rivers?|sea|ocean|whirlpools?|streams?|forest|trees|lagoon|beach|mountains?)\b/g,
  /\b(?:murals?|paintings?|backdrop|panels?|screens?|tapestr(?:y|ies)) (?:create|creates|depict|depicts|show|shows|cover|covers|portray|portrays|circle|circles)\b[^.;:!?]*/g,
  /\bpainted (?:on|across|onto) (?:the )?walls?\b[^.;:!?]*/g,
  /\bcarpets? (?:of|the|this|that) (?:[a-z-]+ )?(?:grass|moss|leaves|needles|flowers|petals|clover|herbs|ground|clearing|floor)\b|\bcarpets? (?:the|this) [a-z-]+/g,
  /\b(?:pine|cedar|oak|oaken|maple|birch|ash|walnut|spruce|fir|elm|willow|ironwood|hemlock)(?:en)? (?:boards?|planks?|planking|shingles?|floors?|floorboards|tar|resin|pitch|beams?|panels?|paneling|chests?|tables?|benches?|chairs?|furniture|masts?|spars?|kindling|doors?|fences?|structures?|desks?|racks?|counters?|cabinets?|shelv\w*|stools?|walls?|bar|carvings?)\b/g,
]

// Title-only noise: a place name that would read as scenery.
const TITLE_EXTRA_NOISE: RegExp[] = [
  // "Temple Hill" is a district of cottages; "Dead Elf Divide" has no dead trees.
  /\btemple(?= hill\b)/g,
  /\bdead (?!(?:forest|woods?|trees?|grove|marsh|swamp|wood)\b)[a-z']+/g,
  // "Mushroom Grove" is underground mushrooms.
  /\bmushroom grove\b/g,
]

// Two of the NOISE rules are wrong in a title: "Forest of Night" and "Lake of
// Dreams" are proper names, not figures of speech.
const TITLE_NOISE = NOISE.filter(re => re !== WATER_OF && re !== FOREST_OF)

// A sentence about the distance feeds only the horizon.
const DISTANT = /\b(?:in the distance|distant|far (?:off|away|to the|below)|horizon|beyond|faraway|looms? (?:over|above)|tower(?:s|ing)? (?:over|above))\b/

const F = {
  ceiling:  [P('ceilings?|(?:vaulted|domed|arched|beamed|thatched) roof|roof (?:high )?(?:overhead|above)', 4)],
  // "This room", "the shop": the description says where you are.
  inHere:   [P('(?:this|the) (?:(?:tiny|small|little|cramped|back|side|main|front|large|spacious|narrow|cozy|dim|dimly lit|dark|private|inner|upper|lower) )?(?:room|shop|chamber|store|parlou?r|office|study|hallway|corridor|interior|booth|closet|annex|workshop|alcove|salon|den|cell)|fills the room|the room\'s|the shop\'s|(?:this|inside the) (?:(?:small|tiny|dimly lit|dim|cramped) )?(?:tent|hut|cabin|shack|hovel)|(?:hut|tent|cabin|shack|building)\'s interior|interior of (?:the|this)', 2)],
  // From the 500-room review: rooms that only say indoors indirectly.
  indoorCue: [P('hangs? (?:from the ceiling|overhead)|overhead beams|rafters|customers|shoppers|patrons|clerks?|proprietor|shopkeeper|behind (?:the|a) counter|far wall|back wall|walled on (?:three|four|all) sides|covered from the weather|floor mat|shelving', 2),
    // The full-map review: shops and towers that only say so through what fills them.
    P("paper (?:walls?|screens?|panels?)|rice paper|screen walls?|sliding doors?|tent walls?|the tent's|(?:inside|center|corner|wall|walls|floor|roof|sides|back|end) of (?:the|this|his|her|their|a) (?:[a-z-]+ )?(?:tent|yurt|pavilion|wagon|caravan|chadir)|chadir|crawlspace|backstage|countertop|workbench|tabletop|floorboards|curtained|one-room|on display|for sale|merchandise|wares (?:are |is )?(?:displayed|arranged|laid)|lines? the walls|(?:against|along) the (?:back |far |north |south |east |west )?walls?|walls of (?:the|this) (?:[a-z-]+ )?(?:stall|hut|shop|bank|tower|room|cabin|chamber|tent|building|wagon|cottage|house)|(?:floor|inside|interior) of (?:the|this) (?:[a-z-]+ )?(?:tower|room|chamber|hut|cabin|shop|tent|building|wagon|cottage|house|keep|church|temple)|skylights?|pews|(?:stone|wooden|marble|plank|tiled|polished|bare|dirt|earthen) floors?|floors and walls|candlelight|this (?:[a-z,-]+ ){1,3}room", 2)],
  furnish:  [P('counter|shelves|shelf|desk|carpet|rug|fireplace|hearth|hallway|corridor|stairwell|staircase|chandeliers?|tapestr(?:y|ies)|furniture|cabinets?|wardrobe|bookshel(?:f|ves)|beds?|bedroom|parlou?r|cots?|mattress|armchairs?|sofa|couch', 2), P('chairs?|tables?|benches|racks|displays|stools?|shelving|couch(?:es)?|seats|carpets|counters|hallways|curtains|mannequins|mirrors?|cushions|pillows', 1), P('walls|floors?|doorway|rafters|room|rooms', 1)],
  indoorT:  [P('shop|inn|tavern|guild|temple|chapel|shrine|hall|room|chamber|library|kitchen|cellar|store|emporium|office|parlou?r|study|foyer|corridor|hallway|stairwell|workshop|forge|barracks|vault|attic|salon|lobby|sanctum|(?<!river |stream |creek |lake |muddy |grassy |sandy |steep |far |west |east |north |south )bank|teller|showroom|salesroom|salesfloor|sales floor|backroom|loft|quarters|bedroom|bath|smithy|bakery|mill|cabin|hut|tent|stable|granary|cistern|chambers|rooms|halls|house|dungeons?|cells?|gallery|galleries|alcove|crypt|tomb|mausoleum|lounge|den|pantry|nursery|infirmary|common room|great room|dining room|ballroom|throne room|atrium|vestibule|antechamber|kennel|armory|armoury|museum|theater|theatre|auditorium|classroom|lecture', 4),
    // The full-map review: building rooms whose titles name no room ("Observatory",
    // "Taisgath Guildhouse", "Rossgallan Keep, Storeroom", "Harbor Tower, Bridge Floor").
    P("guildhouses?|guildhalls?|observatory|lighthouse|stairs|staircase|stairway|shed|gatehouse|dormitor(?:y|ies)|warehouse|storage|storeroom|conservatory|pub|barn|hayloft|workroom|supplies|interiors|palace|archives?|exhibits?|laborator(?:y|ies)|church|buttery|stables|depository|depot|basement|garderobe|refectory|scriptorium|chantry|sacristy|vestry|apartments?|foundry|smelter|outpost|lodge|sitting room|floor|(?:east|west|north|south|eastern|western|northern|southern|upper|lower|guest|private|servants') wing", 4)],
  cave:     [P('caverns?|stalactites?|stalagmites?', 4), P('(?:cave|cavern) walls?|walls of the (?:cave|cavern)', 4),
    // Where you stand, said of the cave itself (the full-map review: sea caves
    // and the Road Beneath the Mountain lost to their waves and "road").
    P('(?:floor|ceiling|walls?|confines|depths|interior|back|end) of (?:the|this) (?:[a-z-]+ )?(?:cave|cavern|grotto|tunnel|mine|burrow)|(?:inside|within|deep in|deep within|deeper into|deep into) (?:the|this) (?:[a-z-]+ )?(?:cave|cavern|grotto|tunnel|mine|glacier|mountain|earth|rock)|underground (?:highway|road|passage|river|lake|city)|beneath the (?:ground|earth)|(?:deep|deeper|down|dug|delves?|descends?) into the earth|heart of the mountain|lava tubes?|rocky ceiling|rock overhead|overhead rock|tunnel walls|twisting tunnels|maze of tunnels|the tunnel (?:continues|bends|turns|ends|narrows|widens|opens|curves|winds|slopes|descends)|(?:flowstone|dripstone)', 4), P('underground|grottos?|subterranean|earth(?:en)? tunnels?|dirt tunnels?|burrows?', 3), P('caves?', 2), P('tunnels?|mineshaft|mine shaft', 2), P('dripping|damp|seeping', 1)],
  caveT:    [P('mines?|caves?|caverns?|tunnels?|grottos?|burrows?|lair|catacombs?|sewers?|underground|depths|warrens?|undershard|tunals?|lava tubes?', 4)],
  outdoor:  [P('docks?|piers?|pilings|barges?|bollards', 2), P('open[- ]air|skyward|open to the (?:sky|elements|air|weather)|roofless|no roof|nothing remains of the (?:roof|ceiling)|rooftops?|parapets?|boxwood|topiary|hedge maze', 4), P('courtyards?|crenellations?|cityscape|nightscape|sky|skies|sunlight|sunshine|sun|clouds|breeze|wind|winds|stars|moonlight|horizon|lawns?|hedges?|hedgerows?', 1)],
  // The ROOM part of a title (after the comma) naming an outdoor place: a
  // district name before the comma ("Temple Hill, Memorial Park") must not
  // make a park indoors (the 500-room review).
  outdoorT: [P('courtyards?|gardens?|park|yard|square|grounds|lawns?|green|plaza|rooftop|roof|hill|hillside|road|street|lane|path|trail|walk|field|fields|meadow|clearing|beach|shore|dock|pier|bridge|balcony|terrace|porch|patio|parapet|battlements|wall|walls|ramparts|gate|maze|grove|orchard|vineyard|bank|ford|ledge|cliff|summit', 3)],
  peaks:    [P('mountains?|peaks?|summit|mountainside', 3), P('canyons?|gorges?|ravines?|chasms?|gully|gullies|mesas?|cliffs?|crags?|ridges?|foothills|escarpment|precipice|bluffs?', 2), P('boulders?|rocky|ledges?|scree|outcrops?', 1)],
  dunes:    [P('desert|dunes?', 3), P('sands (?:stretch|spread|shift|roll)|sand stretches|golden sands?|endless sands?|shifting sands?|sands of', 3), P('arid|parched|scorching|cact(?:us|i)|sun-baked|wasteland', 2), P('sand|sands|sandy', 1)],
  // Not "shore": a river or lake has one too (the 500-room review).
  sea:      [P('ocean|sea|seas|surf|tides?|seaweed|saltwater|reefs?|coral|kelp|seabed|seafloor|sea floor|underwater|shipwrecks?|foredeck|quarterdeck|main deck|rigging|bowsprit|gunwales?|bulwarks|capstan|ratlines|foremast|mainmast', 3), P('waves|beach|coast|coastline|gulls?|seagulls?|bay|harbou?r|inlet|wharf|wharves|breakwater|tide pools?', 2)],
  town:     [P('streets?|storefronts?|townsfolk|rooftops|chimneys?|plaza|marketplace|bazaar', 2), P('buildings|shops|cobblestones?|cobbled|houses|cottages?|market|alleys?|alleyway', 2), P('homes|merchants?|vendors?|crowds?|passers-by|citizens|lanterns|signs?', 1)],
  // Not "road", "lane" or "way": most of those titles are wilderness roads.
  townT:    [P('street|square|alley|market|plaza|avenue|town|city|bazaar|courtyard|boulevard|promenade|village|district|quarter|tier|terrace', 3)],
  fort:     [P('battlements?|ramparts?|parapets?|turrets?|fortress|fortifications?|palisade|gatehouse|portcullis|barbican|crenellations?', 3), P('garrison|guardhouse|guardposts?|watchtowers?', 2), P('(?:city|town|stone|outer|defensive|castle) walls', 2)],
  fortT:    [P('keep|battlements|ramparts|wall|walls|gate|gatehouse|fort|fortress|castle|tower|citadel', 3)],
  // Not "abandoned" or "derelict": an abandoned FIELD is still a field.
  ruins:    [P('ruins?|ruined', 3), P('rubble|crumbling|collapsed|toppled', 2)],
  shrine:   [P('shrines?|obelisks?|monoliths?|standing stones?|altar', 2), P('temple|statues?', 1)],
  farm:     [P('farms?|farmlands?|farmsteads?|farmhouses?|crops|wheat|barley|furrowed fields?|plowed (?:fields?|rows)|tilled|fallow|grain ?fields?|fields of (?:grain|wheat|barley|corn|rye)|vineyards?|orchards?|scarecrows?|haystacks?|barns?|sheaves', 3), P('corn|plow|plough|hay|livestock|pasture|cattle|sheep|goats|stalks|planted rows|grape ?vines|grapevines|trellis(?:es)?|grapes', 2), P('fences?|fenced', 1)],
  graves:   [P('graveyard|cemetery|necropolis|burial mounds?|barrows|tombstones?|headstones?|mausoleums?|gravestones?', 4), P('graves?|tombs?|crypts?|burial', 2)],
  swamp:    [P('swamps?|marsh(?:es|y)?|bogs?|bayou|cattails', 3), P('fens?|mires?|murky|stagnant|reeds|quagmire', 2), P('mud|muck', 1)],
  trees:    [P('forest|woods|woodlands?|grove|thicket|copse|weald', 3), P('trees|treetops|tree ?line|canopy|trunks|undergrowth|saplings?|underbrush', 2), P('tree|oaks?|birch(?:es)?|willows?|maples?|elms?|ash trees|foliage|branches|leaves|bark', 1)],
  woodT:    [P('woods?|forest|glade|grove|thicket|copse|wildwood|weald|limb|bough|branches|treetops?', 3)],
  pines:    [P('pines?|firs?|spruces?|evergreens?|conifers?|cedars?|hemlocks?', 3)],
  palms:    [P('jungle|palms?|palm trees|palm fronds', 3), P('tropical|humid|lianas?', 2), P('vines', 1)],
  fields:   [P('prairie|grasslands?|meadows?|plains', 3), P('fields?|grasses|grass', 1)],
  // "falls" only in a title ("Wyvern Falls"). In prose it is nearly always the
  // verb: "the ground falls away", "light falls on", "accidental falls".
  falls:    [P('waterfalls?', 4), P('cascades?|cascading|plunges|plummet(?:s|ing)?|foaming (?:white )?water|pours? over the (?:edge|cliff|rocks?|stone)', 2), P('spray|mist', 1)],
  fallsT:   [P('falls', 4)],
  river:    [P('rivers?|streams?|creeks?|brooks?|rapids|riverbanks?|rivulets?|canals?', 3), P('(?:rushing|flowing|rippling|running|swirling|churning|shallow) water|waist-deep|knee-deep|the current|shallows|ditch(?:es)?|watercourse', 2), P('ford|current|banks?', 1)],
  lake:     [P('lakes?|ponds?|lagoons?|reservoir|moat|tarn|watering hole|hot springs?|spring-fed|natural springs?|spring pool', 3), P('pools?', 2)],
  lava:     [P('lava|magma|molten', 3), P('volcan(?:ic|o)|sulfur|sulphur|brimstone', 2), P('cinders?|embers', 1)],
  road:     [P('roads?|roadway|highway|trade route', 2), P('trails?|path|paths|track|tracks|footpath|lane', 1)],
  bridge:   [P('bridges?|footbridges?', 3)],
  // v0.20.3 terrains.
  // "The Greater Fist" is DR's named volcano (Dirge, Sicle Grove, Arthelun).
  volcanic: [P('greater fist|lesser fist', 4), P('volcano(?:es)?|volcanic|caldera|fumaroles?|lava fields?', 3), P('ash|ashen|cinders?|soot|pumice|sulfur|sulphur|brimstone|magma|lava|embers', 1)],
  jungle:   [P('jungle|jungles|rainforest|rain forest', 4), P('lianas?|vines|humid|steamy|tropical|creepers', 1)],
  savannah: [P('savannah?s?|steppes?|prairies?|veldt', 4), P('tall grass(?:es)?|grasslands?|plains', 2)],
  dead:     [P('dead (?:trees?|forest|woods?)|withered (?:trees?|trunks?|oaks?|branches)|blighted|leafless|petrified (?:trees?|wood|forest)|(?:charred|scorched|blackened|burned|burnt) (?:trees|trunks|stumps|forest|woods)|skeletal (?:trees|branches)|bare (?:trees|branches)', 3), P('dead|gnarled|rotting', 1)],
  moor:     [P('moors?|moorland|heath|bracken|peat', 3), P('heather', 1)],
  fog:      [P('fog|foggy|mists|misty|haze|hazy', 2), P('mist', 1)],
  sewer:    [P('sewers?|sewage|drains?|culverts?|cesspool', 3)],
  mine:     [P('mine|mines|mineshafts?|ore|veins of|timber supports?|support beams|cart tracks?|ore carts?|pickaxes?|timbers|shoring|wooden (?:wall )?braces|tunnell?ers|miners?|mining|pick(?:-and-| and )shovel', 2)],
  iceCave:  [P('ice|icy|frozen|glacial|icicles|frost', 2)],
  carved:   [P('carved|hewn|chiseled|chiselled|masonry|mortar|sconces?|bricks?|corridors?|passageways?|archways?|stairs|tunnels?', 1)],
  snow:     [P('glaciers?|tundra|blizzard|snowfields?|snow[- ](?:covered|laden|blanketed|choked)|covered (?:in|with|by) snow|snow covers|blanket of snow|hoarfrost|ice-covered|frozen ground|perpetual winter|snowstorm', 3), P('snow|snowy|snowdrifts?|drifts|frozen|icicles?', 2), P('ice|icy|frost|frosty|sleet', 1)],
  temple:   [P('altar|pulpit|dais|hymnals?|pews?|nave|sanctuary|sacred|incense|holy|idols?', 2), P('statues?|candles', 1)],
  shopI:    [P('counter|wares|merchandise|shelves|displays?|racks|goods|for sale|clerk|proprietor|shopkeeper', 2)],
  homeI:    [P('beds?|bedroom|fireplace|hearth|kitchen|table and chairs|rocking chair|quilts?|cots?', 2)],
} satisfies Record<string, Pat[]>
type Feat = keyof typeof F

// Title shapes (the full-map review, v0.20.3).
// You are outside the thing the title names.
// Not "entrance": an entrance HALL is inside ("Clerics' Guild, Main Entrance").
const OUTSIDE_T = /\b(?:outside|exterior|outdoors?|open[- ]air|approach(?:es)?|grounds)\b|(?:^|,)\s*(?:the )?(?:before|behind|beside|atop|in front of|front of|across from|on top of)\b/
// A room part with one of these words is a street or an open district.
const STREET_WORD = /^(?:road|roads|street|lane|way|alley|alleyway|boulevard|avenue|row|ramble|wend|bazaar|market|square|plaza|district|quarter|promenade|esplanade|thoroughfare|highway|path|trail|track|drive|causeway|walkway|boardwalk)$/
// Last words that are outdoors in a park and indoors in a temple: they don't
// overrule the building ("Temple of Hav'roth, Small Balcony").
const AMBIGUOUS_LAST = /^(?:balcony|bridge|landing|walk|wall|walls|gate|terrace|roof|ledge)$/
// You are inside it.
const INSIDE_T = /\b(?:inside|indoor|indoors|interior)\b/
// Underground, whatever the title names.
const BENEATH_T = /\b(?:beneath|under|below|underneath) (?:the )?(?:[a-z']+ )?(?:mountain|mountains|ground|earth|fortress|keep|castle|city|town|temple|hill)\b|\binner hibarnhvidar\b/
// Title words that count only when the description agrees.
const DESC_CONFIRMS: Feat[] = ['ruins', 'dead', 'lava', 'volcanic', 'farm', 'palms', 'swamp', 'dunes']

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
  for (const re of SCENE_NOISE) d = d.replace(re, ' ')
  let t = ` ${(title ?? '').toLowerCase().replace(/\[|\]/g, '')} `
  for (const re of TITLE_NOISE) t = t.replace(re, ' ')
  for (const re of TITLE_EXTRA_NOISE) t = t.replace(re, ' ')
  // A title is "Place, Room". Whether the room is indoors is the ROOM's call:
  // "Temple Hill, Memorial Park" is a park, "Pierless Inn, Courtyard" a yard.
  const tRoom = t.includes(',') ? ` ${t.slice(t.lastIndexOf(',') + 1)} ` : t
  // ...but a BUILDING named before the comma still says indoors, at a lower
  // weight: "Temple of Kertigen, Passage", "Bards' Guild, Table of Strings".
  // Not when the district names an outdoor place itself ("Temple Hill").
  const tPlace = t.includes(',') ? ` ${t.slice(0, t.lastIndexOf(','))} ` : ''
  // The full-map review (v0.20.3): how a title says inside or outside.
  // "Kertigen's Temple, Approach", "Before Rest of Ages Inn", "Outside the
  // Mausoleum": the building is named, but you are outside it.
  const outsideT = OUTSIDE_T.test(t)
  // The room part's LAST word decides between two nouns: "Chapel Plaza" and
  // "Temple Courtyard" are open places, "Smithy Lane" and "Town Hall Road" are
  // streets, "Upper Gate Road" has no gate to stand in.
  const roomWords = tRoom.trim().split(/\s+/).map(w => w.replace(/[^a-z']/g, ''))
  const lastWord = roomWords[roomWords.length - 1] ?? ''
  const lastOutdoor = lastWord !== '' && !AMBIGUOUS_LAST.test(lastWord) && score(` ${lastWord} `, F.outdoorT) > 0
  const lastStreet = roomWords.some(w => STREET_WORD.test(w))
  const roomOutdoor = roomWords.some(w => w !== '' && !AMBIGUOUS_LAST.test(w) && score(` ${w} `, F.outdoorT) > 0) || lastStreet
  const placeIsBuilding = tPlace !== '' && !outsideT && !roomOutdoor && !/\b(?:pathway|path|entrance|exterior|walk|walkway)\b/.test(tRoom) && !score(tPlace, F.outdoorT) && !score(tPlace, F.townT)
  const sentences = d.split(/(?<=[.!?])\s+/)
  const near = sentences.filter(s => !DISTANT.test(s)).join(' ')
  const far = sentences.filter(s => DISTANT.test(s)).join(' ')
  const out = {} as Record<Feat, number>
  const FAR_ONLY = new Set<Feat>(['peaks', 'dunes', 'sea', 'town', 'fort'])
  // Features ending in T are title words ("shop", "gate", "road"): in a
  // description they are asides ("the shop's front door"), not the place.
  const TITLE_ONLY = new Set<Feat>(['indoorT', 'outdoorT', 'townT', 'fortT', 'caveT', 'fallsT', 'woodT'])
  const ROOM_PART = new Set<Feat>(['indoorT', 'outdoorT'])
  for (const k of Object.keys(F) as Feat[]) {
    out[k] = (TITLE_ONLY.has(k) ? 0 : score(near, F[k])) + 3 * score(ROOM_PART.has(k) ? tRoom : t, F[k])
    // A distant sea IS the horizon ("the ocean stretches out at the eastward
    // horizon"), so it counts in full; distant peaks and towns count half.
    if (FAR_ONLY.has(k)) out[k] += score(far, F[k]) / (k === 'sea' || k === 'dunes' ? 1 : 2)
  }
  if (placeIsBuilding) out.indoorT += 2 * score(tPlace, F.indoorT)
  if (lastOutdoor || lastStreet) {
    out.indoorT = 0
    // A street's shoppers and customers are out in the street with you.
    if (lastStreet) { out.indoorCue = 0; out.fortT = 0 }
  }
  if (outsideT) { out.indoorT = 0; out.caveT = 0; out.outdoorT += 9 }
  // "Inside the Fortress", "Indoor Pond": the title says so outright.
  if (INSIDE_T.test(t)) out.indoorT += 12
  // "Under the Mountain", "Beneath the Fortress", "The Road Beneath the
  // Mountain": underground, whatever else the title names.
  if (BENEATH_T.test(t)) out.caveT += 12
  // Some title words are names, not scenery: "Ruined Highlands" is open
  // grassland, "Obsidian Pass" has no lava, "Farmland, Thorn Tunnel" is a
  // thicket. These count from the title only when the description agrees.
  for (const k of DESC_CONFIRMS) if (score(near, F[k]) === 0) out[k] = Math.max(0, out[k] - 3 * score(t, F[k]))
  // A dry riverbed's title still says "River".
  if (/\b(?:river|stream)bed\b/.test(t)) out.river = score(near, F.river)
  return out
}

const pick = <K extends string>(cands: [K, number][], min: number): K | null => {
  let best: K | null = null, bs = min - 0.001
  for (const [k, s] of cands) if (s > bs) { best = k; bs = s }
  return best
}

// ── Things (v0.20.3) ──────────────────────────────────────────────────────
// Mined from the whole map DB: `tmp-v0203-scene/survey.ts` counts the words in
// every description by kind of room, and `smoke.ts` checks a sample by eye.
// Each table is scored like the features above (two matches per pattern at
// most, the title three times); the strongest wins, over a floor. A wrong
// guess only changes which faint shapes are drawn.

// A thing's word used for something else. Removed before scoring things.
// Crystals that are PART of a surface (Sekmeht, room 768: "cobblestones
// flecked with crystals", "crystals set into its surface"), not a cluster
// standing in the room. Not applied in a cave, where crystals in the walls ARE
// the cave's crystals ("large crystals imbedded in the walls" of a Crystal Cavern).
const CRYSTAL_INLAID = /\b(?:flecked|flecks|speckled|specks|studded|dotted|sprinkled|inlaid|set|embedded|imbedded|encrusted|laced|threaded|mixed|woven|chips|dust) (?:with|of|into|in) (?:[a-z-]+ ){0,3}crystals?\b|\bcrystals?(?: and [a-z-]+)? (?:set|embedded|imbedded|inlaid|woven) (?:in|into)\b|\bcrystals? mixed with\b/g

const THING_NOISE: RegExp[] = [
  // Stock shop phrasing ("haggle or exchange goods for coin"), not a money shop.
  /\b(?:goods|wares|items|merchandise) for coins?\b/g,
  /\b(?:as|very|quite|equally|fairly|so|pretty|reasonably) well\b/g,
  /\bwell[- ](?:worn|kept|lit|made|used|built|known|tended|trodden|traveled|travelled|maintained|polished|stocked|organized|crafted|appointed|groomed|placed|preserved|dressed|off|being)\b/g,
  /\bwells? up\b/g,
  /\bbars? of (?:iron|steel|metal|gold|silver|soap|light|sunlight|moonlight|music)\b/g,
  /\b(?:iron|steel|metal|window|cell|prison|jail) bars\b/g,
  /\bbarred\b/g,
  /\bcolumns? of (?:[a-z-]+ )?(?:smoke|steam|light|sunlight|water|ants|soldiers|figures|numbers|text|fire|dust|mist|people|motes|energy|air|flames?|sparks|bubbles)\b/g,
  /\bforge (?:ahead|on|onward|through|a path)\b/g,
  /\bbeds? of (?=flowers\b)|\bbeds? of (?:moss|leaves|grass|straw|pine needles|reeds|coals|rock|stone|sand|gravel|kelp|nails)\b/g,
  /\b(?:river|stream|creek|lake|sea|ocean|mud|dry|reed)[- ]?beds?\b/g,
  /\bcounter(?:part|act|weight|clockwise|feit|balance|point)s?\b/g,
  /\bsigns? of (?:life|wear|age|use|habitation|struggle|damage|decay|recent|a|an|the)\b/g,
  /\bbones? (?:dry|chilling|weary|deep)\b/g,
  /\bto the bone\b/g,
  // "Tower" the verb: "tall pine trees tower to either side".
  /\btower(?:s|ed|ing)? (?:over|above|to|on|high|into|up|around|behind|beside|overhead)\b/g,
  // The new props' figures of speech.
  /\bwebs? of (?:roads|streets|paths|trails|alleys|canals|lies|intrigue|shadows|light|cracks|veins|branches|roots|streams|channels|tunnels)\b/g,
  /\bbird'?s[- ]eye\b/g,
  /\bbrush(?:es|ed|ing)? (?:against|past|aside|away|off|by|with|of)\b|\b(?:paint ?|hair ?|scrub ?)brush(?:es)?\b/g,
  /\barch(?:es|ed|ing)? (?:of (?:the|a|an|her|his|its|their) (?:back|brow|eyebrows?|foot|feet|neck)|over)\b/g,
  /\bflags? (?:down|you|them)\b|\bflagg(?:ed|ing)\b/g,
  /\bsign (?:language|up|in)\b/g,
  // Frost on the ground is not a crystal formation.
  /\b(?:ice|frost|snow|dew|salt|sugar|cold|delicate|tiny) crystals?\b/g,
  // From the full-map review: the commonest false props of all.
  // "well-worn", "well-to-do", "might well be", "work well", "well above".
  /\bwell-[a-z-]+/g,
  /\b(?:might|may|could|would|as|work|works|worked|working|serve|serves|served|go|goes|went|fit|fits|is|are|was|were|be|been|very|quite|pretty|rather|just|equally|fare|fares|bode|bodes) well\b/g,
  /\bwell (?:into|past|beyond|before|after|above|below|enough|marked|cared|hidden|known|away|over|under|within|out|up)\b/g,
  // "signs of wear", "a sure sign that", "signs point to", "a foreboding sign to travelers".
  /\bsigns? (?:of|that|to|point|remain|still)\b|\b(?:tell-?tale|sure|clear|any|first|rare|only|real|curious|obvious|good|bad|foreboding|ominous) signs?\b/g,
  // "bone-chilling", "the bones of the mountain", "skeletons of trees".
  /\bbone-[a-z]+|\bbones? of the (?:mountain|earth|land|island|world|city|ship|house)\b|\bin (?:one's|your|my|his|her|their) bones\b|\bskeletons? of (?:[a-z-]+ ){0,3}(?:trees?|oaks?|barges?|ships?|boats?|farmsteads?|buildings?|plows?|wagons?|houses?)\b|\bherring-?bone\b|\bskeletal (?:trees|branches|limbs)\b|\bweary bones\b/g,
  // "there towers a stately oak", "spires of volcanic rock".
  /\b(?:there|which|that|it|they|trees|oaks|pines|cliffs|peaks|mountains|walls) towers?\b|\btowers? (?:majestically|impressively|high|tall|skyward)\b|\bspires? of (?:[a-z-]+ )?(?:stone|rock|ice|basalt|sandstone)\b/g,
  /\b(?:clean|free|clear|cleared|swept) of (?:all )?(?:debris|rubble)\b/g,
  /\btiled roofs?\b|\broof tiles?\b/g,
  /\btoy (?:ship|boat)s?\b|\b(?:tent|cave|forest|mushroom)s? of (?:shelter|light|shadow)\b/g,
  // The prop round's figures of speech (each checked across the whole map).
  // "a pool of glittering gems spilled onto the desert", "pools of lamplight".
  /\bpools? of (?:[a-z-]+ )?(?:light|shadows?|shade|darkness|blood|gold|silver|moonlight|sunlight|starlight|lamplight|candlelight|firelight|colou?rs?|ink|oil|wax|gems|liquid|molten|night|warmth|radiance|glow)\b/g,
  /\blike (?:a |an )?(?:[a-z-]+ ){0,2}(?:pools?|ponds?|mirrors?)\b|\bgene pool\b/g,
  // "Mirror Lake", "mirror each other", "mirrors the sky", "mirror-smooth".
  /\bmirror(?:s|ed|ing)? (?:the|each other|one another|its|his|her|their|that|this|those|these|every|perfectly)\b|\bmirror (?:lake|images?)\b|\bmirror-[a-z]+|\bmirrorlike\b|\bmirror(?:ed)? surface\b/g,
  // "columns of smoke" is above; the pillar forms, and "a pillar of the community".
  /\bpillars? of (?:[a-z-]+ )?(?:smoke|steam|light|fire|flame|water|dust|mist|sand|clouds?|salt|ice|the community|strength|society|faith)\b/g,
  // Bluebells and bell-shaped flowers are not bells.
  /\b(?:blue ?bells?|bluebells?|harebells?|bell ?flowers?|bell peppers?)\b|\bbell-?shaped\b|\bbells? of (?:the )?(?:flowers?|blossoms?)\b|\bbell of (?:her|his|its|a) (?:skirt|dress|gown)\b|\blike (?:[a-z-]+ ){0,2}bells\b/g,
  // "at this stage", "the stages of grief", "set the stage".
  /\b(?:at|this|that|early|later|final|first|second|last|next|various|different|each|every|some|any) stages?\b|\bstages? of\b|\bset the stage\b/g,
  /\bnest egg\b/g,
  // Crystals as decoration: hanging from a fence, a chandelier's, wind chimes'.
  /\bcrystals? (?:dangl[a-z]*|hang[a-z]*|hung|sway[a-z]*|chim[a-z]*)\b|\b(?:their|its) crystals\b|\bhung with (?:[a-z-]+ ){0,3}crystals?\b/g,
  /\bcrystals? of (?:[a-z-]+ )?(?:ice|snow|frost|salt|sugar|matter)\b/g,
  // Shard's skyline named from somewhere else.
  /\b(?:shard's (?:own )?crystal spires|crystal spires of shard)\b/g,
  // The verb: "shadows pool in the dark spaces", "water pools among the reeds",
  // "reflects the glow back in pools and arcs".
  /\b(?:shadows?|darkness|gloom|light|lamplight|moonlight|sunlight|mist|fog|blood|sweat|water|rainwater|liquid|moisture) pools? (?:in|around|beneath|under|at|on|across|along|among|about|into|between|near|together)\b|\bin pools\b/g,
  /\b(?:center|centre) stage\b|\bstage (?:makeup|hands?|fright|names?|whispers?)\b/g,
  /\ba mirror of\b/g,
]

// A wall's material is said best as a phrase about the walls ("walls of
// polished ironwood", "granite walls", "stone-walled"), which counts 4; the
// bare word counts 1, since it is often about something else in the room.
const MATERIAL: Record<Exclude<Walls, 'plain'>, string> = {
  stone:   "stone|stones|granite|sandstone|brick|bricks|limestone|basalt|slate|rock|flagstones?|masonry|fieldstone",
  marble:  "marble|alabaster|onyx|porphyry",
  wood:    "wood|wooden|oak|oaken|pine|ironwood|mahogany|cedar|birch|maple|teak|walnut|cherrywood|logs?|timbers?|planks?|planking|bamboo|rosewood|flamewood|paneling|panelled|paneled",
  plaster: "plaster|plastered|whitewash|whitewashed|stucco|painted",
  canvas:  "canvas|tent|tents|tarpaulin|tarp|yurt|paper|rice paper|silk|hides?|cloth|fabric|leather|felt",
  earth:   "earth|earthen|dirt|mud|clay|adobe|sod|packed earth",
  metal:   "metal|iron|steel|bronze|copper|brass|riveted",
}
const WALLS = Object.fromEntries(Object.entries(MATERIAL).map(([k, m]) => [k, [
  P(`walls? (?:are |is )(?:${m})|walls? (?:are |is )?(?:made |built |constructed |fashioned |carved |hewn )?(?:of|from) (?:[a-z'-]+ ){0,3}(?:${m})|(?:${m})(?:[- ][a-z'-]+)?[- ]walls?|(?:${m})-walled`, 4),
  P(m, 1),
]])) as Record<Exclude<Walls, 'plain'>, Pat[]>

const LIGHTS: Record<Light, Pat[]> = {
  orbs:     [P('gaethzen|glowing (?:orbs?|spheres?|globes?)|light (?:orbs?|globes?|spheres?)|orbs?|globes?', 2)],
  lanterns: [P('lanterns?|oil lamps?|lamps?|chandeliers?|lamplight', 2)],
  candles:  [P('candles?|candlelight|candelabras?|tapers', 2)],
  torches:  [P('torches|torch|braziers?|sconces?', 2)],
  fire:     [P('fireplace|hearth|blazing fire|crackling fire|roaring fire|fire burns|cookfire|fire pit', 2), P('embers|flames', 1)],
  daylight: [P('skylights?|sunlight (?:streams|filters|pours|falls|shines)|light (?:streams|filters|pours) (?:in|through)|large windows|windows let', 2)],
}

const FIXTURES: Record<Fixture, Pat[]> = {
  counter:      [P('counters?|sales counter', 3)],
  shelves:      [P('shelves|shelving|shelf', 3)],
  racks:        [P('racks?|pegs|hooks', 2)],
  mannequins:   [P("mannequins?|dress ?forms?|(?:dressmaker|tailor)'s dumm(?:y|ies)", 3)],
  cases:        [P('display cases?|glass cases?|cases|cabinets?|vitrines?|cupboards?|armoires?', 2)],
  tables:       [P('tables?|trestles?', 2)],
  benches:      [P('benches|pews?|bench', 2)],
  bar:          [P('the bar|a bar|long bar|bar runs|bar stretches|barstools?|bar stools?|taps|kegs?|casks?', 3)],
  hearth:       [P('fireplace|hearth|stove|oven|kiln|cauldron', 3)],
  stairs:       [P('stairs|staircase|stairway|stairwell|steps lead|spiral stairs?|ladder', 2)],
  columns:      [P('columns?|pillars?|colonnade|pilasters?', 2)],
  windows:      [P('windows?|casements?|portholes?', 1)],
  stainedglass: [P('stained glass|stained-glass|rose window', 4)],
  tapestries:   [P('tapestr(?:y|ies)|banners?|wall ?hangings?', 2)],
  paintings:    [P('paintings?|portraits?|murals?|frescoe?s|canvases|artwork|framed (?:pictures?|prints?|maps?|art|charts?)|pictures? (?:hangs?|adorn)', 2)],
  mirror:       [P("(?:a|an|the|large|full-length|tall|gilded|silver|silvered|polished|oval|round|standing|hand|wall|ornate|framed|cheval|vanity|dressing) mirrors?|mirrors|looking ?glass(?:es)?", 2)],
  statue:       [P('statues?|sculptures?|busts?|effig(?:y|ies)|figurines?|carved figures?', 2)],
  stage:        [P('stages?|proscenium|footlights|podium', 3), P('performers?|audience|minstrels?|velvet curtains|stage curtains', 1)],
  pool:         [P('(?:a|an|the|small|large|shallow|deep|still|clear|reflecting|bathing|sunken|stone|marble|round|circular|rectangular|heated|steaming|warm|hot|indoor|swimming|tiled|wading) (?:pool|pond)s?|pools|ponds|hot springs?|baths|bathing (?:pool|area)|bathtubs?', 2)],
  rug:          [P('rugs?|carpets?|carpeting|runner', 2)],
  chandelier:   [P('chandeliers?', 3)],
  bed:          [P('beds?|bunks?|cots?|four-poster|hammocks?|mattress(?:es)?|(?:straw|sleeping|bed|makeshift) pallets?', 2)],
  // Last and light: nearly every room mentions a door, so it takes a slot only
  // when the description dwells on it (two mentions) and nothing else wins.
  door:         [P('doors?|doorways?|double doors', 1)],
  desk:         [P('desks?|writing table|ledgers?|inkwells?|lecterns?', 2)],
  altar:        [P('altars?|shrines?|idols?|offerings|an offering|offering (?:bowl|plate|table|stone)', 3)],
  forge:        [P('forge|anvils?|bellows|smelting|crucibles?', 3)],
  // "loom" only as the machine: the verb ("a dark shape looms") is far commoner.
  workbench:    [P("workbench(?:es)?|work ?tables?|(?:a|an|the|large|great|old|wooden|weaving|her|his|floor|hand|tapestry|carpet|rug) looms?|spinning wheels?|grindstones?|whetstones?|lathes?|potter's wheel|pottery wheel|sawhorses?", 2)],
  barrels:      [P('barrels?|crates?|casks?|sacks|kegs?|boxes|baskets?', 2)],
  books:        [P('books?|tomes?|bookshel(?:f|ves)|bookcases?|scrolls?', 2)],
  plants:       [P('potted plants?|plants?|ferns?|flowers?|planters?|vases?', 1)],
}

const WARES: Record<Exclude<Ware, 'general'>, Pat[]> = {
  weapons:  [P('weapons?|weaponry|swords?|blades?|axes|daggers?|spears?|polearms?|bows|crossbows?|halberds?|maces?|scimitars?|armou?ry', 2)],
  armor:    [P('armou?r|helms?|helmets?|shields?|breastplates?|chain ?mail|gauntlets?|greaves|hauberks?', 2)],
  clothing: [P('clothing|clothes|garments?|dress(?:es)?|cloaks?|robes?|gowns?|tunics?|shirts?|mannequins?|tailors?|fabrics?|silks?|bolts|yarn|sewing|seamstress|hats?|boots|shoes|cobbler|weaving|looms?', 2)],
  jewelry:  [P('jewel(?:ry|lery|s)?|gems?|gemstones?|necklaces?|bracelets?|earrings|pendants?|brooch(?:es)?|jewell?ers?', 2)],
  alchemy:  [P('herbs?|herbal|potions?|vials?|flasks?|alchem\\w*|apothecary|remedies|salves?|tinctures?|beakers?|mortar|pestle|jars', 2)],
  food:     [P('bread|loaves|baker\\w*|cakes?|pastr\\w+|pies?|ovens?|food|meats?|cheeses?|fruits?|vegetables|produce|grocer\\w*|spices?|provisions', 2)],
  drink:    [P('ale|beer|wine|mugs?|tankards?|kegs?|casks?|barkeep\\w*|bartender|tavern|taproom|brew\\w*', 2)],
  books:    [P('books?|scrolls?|tomes?|parchments?|bookshel(?:f|ves)|bookcases?|library|maps?|quills?|scriptorium', 2)],
  furs:     [P('furs?|pelts?|hides?|skins|leather|tannery|tanner|furrier', 2)],
  tools:    [P('tools?|hammers?|saws?|chisels?|tongs|anvils?|forge|bellows|rope|nails|lumber|pickaxes?|shovels?|hardware', 2)],
  flowers:  [P('flowers?|bouquets?|blossoms?|florist|vases?|roses|lilies|potted', 2)],
  coin:     [P('coins?|tellers?|bank|exchange rates?|vault|kronars|lirums|dokoras|ledgers?|currency|moneychanger', 2)],
  music:    [P('instruments?|lutes?|harps?|drums?|flutes?|fiddles?|zithers?|mandolins?', 2)],
}

// One clear mention is enough (most weigh 2 against a floor of 2): the
// coverage scan showed a single "wooden fence" or "a large boulder" went
// undrawn under the old floor of 3. The noise rules and the "here" sentences
// guard against false hits. ORDER matters: equal scores go to the earlier, so
// the more striking things come first.
const PROPS: Record<Prop, Pat[]> = {
  // A landmark tower standing over the scene (the Tower of Honor, a lighthouse).
  tower:     [P('towers?|spires?|minarets?|belfry|bell ?towers?|lighthouses?|campanile', 3)],
  // Obelisks and standing stones (they used to draw as a tower, or a boulder).
  obelisk:   [P('obelisks?|menhirs?|monoliths?|standing stones?|steles?|stelae|runestones?|dolmens?|megaliths?|stone circle|(?:circle|ring) of (?:standing|tall|ancient|great|huge|massive|weathered|carved|upright|towering) stones', 3)],
  fountain:  [P('fountains?', 4)],
  statue:    [P('statues?|sculptures?|monuments?|effig(?:y|ies)', 3)],
  pillars:   [P('pillars?|columns?|colonnades?|pilasters?', 2)],
  well:      [P('(?:a|an|the) (?:(?!is |are |was |were |be )[a-z]+ ){0,2}well(?![- ](?:above|below|into|past|enough))|wellhead|well house', 3)],
  gate:      [P('gates?|gateway|portcullis', 2)],
  arch:      [P('archways?|arches|arch', 2)],
  door:      [P('doors?|doorways?|doorframes?|entryways?', 2)],
  hut:       [P('huts?|hovels?|shacks?|shanty|shanties|cabins?|cottages?|wickiups?|longhouses?', 2)],
  dock:      [P('docks?|piers?|wharf|wharves|jett(?:y|ies)|quay|pilings|harbou?r', 3)],
  boats:     [P('boats?|ships?|barges?|ferr(?:y|ies)|rowboats?|skiffs?|sails?|masts?|canoes?|rafts?', 2)],
  // A pond or spring in the scene (dropped where the scene already has water).
  pool:      [P('pools?|ponds?|hot springs?|thermal springs?|springs? (?:bubbles?|wells?|feeds?)|tide ?pools?|fish ?ponds?|mill ?ponds?|watering hole', 2)],
  campfire:  [P('campfires?|camp ?fires?|fire ?pits?|cookfires?|bonfires?|smoldering (?:fire|embers|ashes)', 3)],
  brazier:   [P('braziers?|fire ?bowls?', 3)],
  stalls:    [P('stalls|booths?|vendors?|market stalls?|(?:a|the|this|that) (?:(?:[a-z-]*[a-rt-z]|[a-z-]+\'s) )?(?:stall|stand(?! of| upright| still| guard| watch| tall| firm| ready| alone| empty| in | on | at | by | near | beside | before | against )|kiosk|pushcart)|kiosks|pushcarts', 2)],
  cart:      [P('(?:carts?|wagons?|wheelbarrows?|carriages?|wains?)(?![- ](?:wheels?|tracks?|ruts?|trails?|paths?|roads?|ways?|routes?|houses?|drives?|makers?|shops?|wrights?)\\b)', 2)],
  // Plural barrels only: "channels of sand barrel into each other" is the verb.
  crates:    [P('crates?|barrels|casks?|kegs?|(?:stacked|wooden|cargo|shipping|empty|broken) boxes|sacks of (?:grain|flour|meal|rice|potatoes|feed|cargo|goods)|bales of (?:cotton|cloth|hay|wool|straw)|hay ?bales|haystacks?', 2)],
  tents:     [P('tents?|pavilions?|yurts?|lean-tos?', 2)],
  arbor:     [P('gazebos?|pergolas?|arbou?rs?|trellis(?:es)?|trelliswork|summerhouses?', 3)],
  // A single tree in an otherwise open scene ("a gnarled old oak"). Dropped
  // where the scene already draws trees.
  tree:      [P('(?:a|an|one|single|lone|solitary) (?:[a-z-]+ ){0,2}(?:tree|oak|willow|elm|maple|birch|cypress|sycamore|cedar|yew|ash tree|apple tree)(?! (?:doors?|tables?|benches?|chests?|counters?|beams?|floors?|floorboards|planks?|paneling|panels?|walls?|chairs?|desks?|box(?:es)?|barrels?|staffs?|frames?|gates?|stumps?|trunks?|roots?|logs?|furniture|carvings?|leaves|leaf|bark|sap|seeds?|nuts?|acorns?|twigs?|limbs?|branch(?:es)?|wood|bowls?|cabinets?|shel(?:f|ves)|dressers?|wardrobes?|beds?|bars?|thrones?|pillars?|columns?|posts?|railings?|fences?|stools?|carts?|wagons?|signs?|plaques?|tubs?|buckets?|casks?|crates?|bookcases?|stairs?|steps?|lintels?|shutters?|cupboards?|armoires?)\\b)', 2)],
  boulders:  [P('boulders?|rock formations?|outcrops?|outcroppings?|crags?|large rocks?|massive rocks?', 2), P('rocks', 1)],
  crystals:  [P('crystals|crystal formations?|crystal clusters?|crystal spires?|geodes?|shards of crystal|crystal spar|(?:veins?|sheets?|outcrops?|growths?|shapes|towers) of (?:[a-z-]+ ){0,2}crystal', 2),
    P('crystal(?=[.,;:!?]| (?:is|are|was|were|that|which|seems?|grows?|rises?|stands?|juts?|hangs?|glows?|pulses?|sparkles?|gleams?|glitters?|of|in|on|at|above|below|from|with|itself|--))', 1)],
  // Only kept in a cave that doesn't already draw them (a tunnel, mine, ice cave).
  stalactites: [P('stalactites?|stalagmites?|dripstone|flowstone', 3)],
  banners:   [P('banners?|flags?(?![- ]?stones?)|pennants?|pennons?', 2)],
  sign:      [P('signs?|signboards?|signposts?|placards?|plaques?', 2)],
  bell:      [P("(?:a|an|the|large|huge|great|big|brass|bronze|iron|silver|golden|gold|copper|old|ancient|temple|ship's|signal|warning|alarm|hanging|cracked|massive|immense|heavy) bells?|bell (?:hangs|hung|rope|post|frame|pull)|bells (?:hang|ring|chime|toll)", 2)],
  benches:   [P('benches|bench', 2)],
  fence:     [P('fences?|fencing|railings?|palisade|picket', 2)],
  shrubs:    [P('bushes|bush|shrubs?|shrubbery|thickets?|brambles?|briars?|undergrowth|hedges?|hedgerows?|brush', 2)],
  flowers:   [P('flowers?|blossoms?|flowerbeds?|blooms?|roses|wildflowers?|gardens?|lilies|tulips', 2)],
  vines:     [P('vines?|ivy|creepers|lianas?|moss|lichen', 2)],
  mushrooms: [P('mushrooms?|toadstools?|fungus|fungi|puffballs?', 2)],
  rubble:    [P('rubble|debris|broken (?:stones?|masonry|bricks?)|fallen (?:stones?|masonry|blocks)|crumbled (?:stones?|walls?)', 2)],
  bones:     [P('bones?(?! (?:carvings?|beads?|handles?|charms?|inlays?|white|dust|china|meal|needles?|combs?|dice|flutes?|tools?|thrones?|chairs?|furniture|chimes?|fetish(?:es)?|totems?|jewelry|armou?r)\\b)|skeletons?|skulls?|carcass(?:es)?|ribcage|skeletal remains', 2)],
  logs:      [P('fallen (?:logs?|trees?|trunks?)|logs?(?! (?:fences?|cabins?|walls?|bridges?|palisades?|houses?|buildings?|homes?|stockades?|huts?|structures?|rafts?|benches?|steps?|stairs?|roofs?|frames?|forts?|lodges?|halls?|furniture|tables?|chairs?|beds?)\\b)|stumps?|deadfall', 2)],
  webs:      [P('cobwebs?|webs|webbing|spider ?webs?', 2)],
  animals:   [P('(?:horses?|ponies|pony|cattle|cows?|sheep|goats?|pigs?|hogs?|chickens?|hens|livestock|mules?|oxen|donkeys?)(?![- ](?:skulls?|bones?|skins?|hides?|tracks?|prints?|droppings|dung|manure|clans?|hair|wool|meat|leather|feathers?|tack|carvings?|statues?|figurines?|heads?|shoes?|hooves|horns?|antlers?|tusks?|pelts?|fur|jerky|sausages?)\\b)', 2)],
  birds:     [P('(?:birds?|gulls?|seagulls?|ravens?|crows?|hawks?|eagles?|pigeons?|doves?|sparrows?|swallows?|starlings?|herons?|cranes|vultures?|songbirds?|larks?|finches|owls?)(?!(?<!s)[- ](?:feeders?|baths?|houses?|cages?|nests?|droppings|circle|lane|street|road|square|carvings?|statues?|figurines?|motifs?)\\b)', 2)],
  // Never the bare plural: "an open area nests between the trees" is the verb.
  nest:      [P("(?:a|an|the|small|large|old|abandoned|empty|twiggy|mud|bird|birds'|bird's|eagle's|hawk's|stork's|heron's|wasp|wasps'|hornet's|hornets'|swallow's|swallows'|robin's|sparrow's|rook's|mudwren) nests?|nesting (?:birds|sites?|ground)|nests? (?:of|built of|made of) (?:twigs|sticks|mud|grass|straw|branches)", 2)],
  lampposts: [P('lamp ?posts?|street ?lamps?|lanterns', 2)],
  smoke:     [P('smoke (?:rises|curls|drifts|billows|spirals)|plumes? of smoke|chimney smoke|wisps? of smoke|smoke from', 2)],
}

// A thing's word that only DESCRIBES something else is not the thing: "rose
// colored curtains", "a bird-like whistle", "a fungus-like growth", "an
// arch-shaped window" (Sekmeht; from the whole-map survey of every prop
// mention, tmp-v0203-scene/modsurvey.ts). With a space only the colour/scent
// words count: "a statue carved from marble" and "lanterns shaped like stars"
// are the thing. "-covered/-lined/-filled" are the thing too ("vine-covered
// willows", "book-lined walls"), so they're not here.
const DESCRIBES = String.raw`(?!-(?:like|shaped|colou?red|hued|tinted|toned|scented|sized|eyed|patterned|themed|inspired|styled?|painted|engraved|etched|embroidered|carved|printed|stitched|embossed)\b| (?:colou?red|hued|scented)\b)`
for (const table of [PROPS, FIXTURES] as Record<string, Pat[]>[])
  for (const k of Object.keys(table)) table[k] = table[k].map(([re, w]) => [new RegExp(re.source + DESCRIBES, 'g'), w] as Pat)

// What can stand in a CAVE (no sky, no buildings).
const CAVE_PROPS = new Set<Prop>(['crystals', 'mushrooms', 'webs', 'bones', 'boulders', 'rubble', 'campfire', 'vines', 'arch', 'statue',
  'pool', 'pillars', 'obelisk', 'brazier', 'crates', 'stalactites'])

const PAVEMENT: Record<Pavement, Pat[]> = {
  cobbles:    [P('cobblestones?|cobbled|cobbles', 2)],
  flagstones: [P('flagstones?|paving stones?|paved|flagged', 2)],
  mosaic:     [P('mosaics?|tiled|tiles', 2)],
  // Planks only as a floor or walkway ("steel planks bridge a crack" is not).
  planks:     [P('boardwalks?|plank (?:floor|walk(?:way)?|road)|planked|planking|floorboards|wooden (?:floor|floorboards|deck)|decking|(?:floor|walkway|deck) of (?:wooden |wide )?planks|wide planks', 2)],
}

function strongest<K extends string>(text: string, title: string, table: Record<K, Pat[]>, min: number, n: number, titleWeight = 3): K[] {
  const scored: [K, number][] = []
  for (const k of Object.keys(table) as K[]) {
    const s = score(text, table[k]) + titleWeight * score(title, table[k])
    if (s >= min) scored.push([k, s])
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

// The description as the things are scored on it: lowercased, with every
// figure of speech removed.
function thingText(desc: string, enclosure: Enclosure): string {
  let d = ` ${(desc ?? '').toLowerCase()} `
  for (const re of NOISE) d = d.replace(re, ' ')
  for (const re of THING_NOISE) d = d.replace(re, ' ')
  if (enclosure !== 'cave') d = d.replace(CRYSTAL_INLAID, ' ')
  return d
}

// Only the sentences about HERE (props): "the distant lights of the pier" don't count.
const hereText = (d: string) => d.split(/(?<=[.!?])\s+/).filter(x => !DISTANT.test(x)).join(' ')

/** Where each mention of a prop or fixture sits in the scored text (for the
 *  harness: is the word the thing itself, or describing something else?). */
export function thingMentions(desc: string, enclosure: Enclosure, kind: 'prop' | 'fixture', key: string): { text: string; at: number; match: string }[] {
  const d = thingText(desc, enclosure)
  const text = kind === 'prop' ? hereText(d) : d
  const pats = (kind === 'prop' ? PROPS[key as Prop] : FIXTURES[key as Fixture]) ?? []
  const out: { text: string; at: number; match: string }[] = []
  for (const [re] of pats) {
    const g = new RegExp(re.source, 'g')
    for (let m = g.exec(text); m; m = g.exec(text)) { out.push({ text, at: m.index, match: m[0] }); if (!m[0].length) g.lastIndex++ }
  }
  return out
}

/** The things in a room (exported for the harness). */
export function sceneThings(title: string, desc: string, enclosure: Enclosure, interior: Interior | null) {
  const d = thingText(desc, enclosure)
  const t = ` ${(title ?? '').toLowerCase().replace(/\[|\]/g, '')} `
  const out = {
    walls: 'plain' as Walls, light: null as Light | null, fixtures: [] as Fixture[], wares: null as Ware | null,
    props: [] as Prop[], pavement: null as Pavement | null,
  }
  out.pavement = strongest(d, '', PAVEMENT, 2, 1)[0] ?? null
  if (enclosure === 'outdoor' || enclosure === 'cave') {
    // A prop must be HERE: sentences about the distance ("the distant lights
    // of the pier") don't count, and the title only supports what the
    // description says ("Upper Gate Road" has no gate; "Garden District" may
    // be a bare street), so it counts once — and a prop the description never
    // mentions at all is dropped even if the title's word alone reaches the
    // floor ("[Southeast Tower, Aumbry]" is a room inside the tower). A cave
    // keeps only what can stand underground (crystals, mushrooms, webs…).
    const here = hereText(d)
    let props = strongest(here, t, PROPS, 2, 8, 1).filter(k => score(here, PROPS[k]) > 0)
    if (enclosure === 'cave') props = props.filter(k => CAVE_PROPS.has(k))
    out.props = props.slice(0, 4)
    if (enclosure === 'outdoor') return out
  }
  // A walls phrase alone (4), or three bare mentions: two passing words ("an iron
  // anvil", "an iron forge") are about the room's contents, not its walls.
  out.walls = strongest(d, '', WALLS, 3, 1)[0] ?? 'plain'
  out.light = strongest(d, '', LIGHTS, 2, 1)[0] ?? null
  if (enclosure === 'indoor') {
    out.fixtures = strongest(d, '', FIXTURES, 2, 3)
    if (interior === 'shop') out.wares = strongest(d, t, WARES, 2, 1)[0] ?? 'general'
  }
  return out
}

const NO_EXTRAS = { town: null, haze: false, volcanic: false, snowcaps: false, caveKind: 'natural' as CaveKind }

// Fallback tests on the plain text (the full-map review, v0.20.3).
// Something built, for a town's middle distance.
const BUILT = /\b(?:lanes?|byways?|alleyways?|quarter|neighbou?rhoods?|residents|citizens|pilgrims|clergy|passersby|passers-by|shoppers|crowds?|merchants|vendors|bridges?|piers?|docks?|wharf|balustrades?|railings?|fences?|gutters?|drive|avenue|temples|chapels|inns|taverns|towers|houses?|homes?|buildings?|shops?|stores?|streets?|alleys?|walls?|doors?|doorways?|windows?|roofs?|rooftops?|towers?|tiers?|terraces?|cobbles?|cobblestones?|cobbled|paved|plaza|square|market|bazaar|inn|tavern|temple|chapel|guild|bank|statue|fountain|lamp ?posts?|storefronts?|cottages?|huts?|tents?|stalls?|gates?|stairs|steps|homes|dwellings?|abodes?|shacks?|archway|courtyard|warehouses?)\b/
// The room is a shop by name.
const SHOP_T = /\b(?:shop|store|emporium|showroom|salesroom|boutique|trading post|kiosk|pawnshop|mercantile|outfitters?)\b/
// The room sells something.
const SALE = /\b(?:for sale|wares|merchandise|merchant|shopkeeper|proprietor|clerk|customers?|prices?|priced|sells?|selling|purchases?|purchasing|buy|buyers?|bargain|haggle|goods|stock|inventory|price tags?|bartenders?|barkeeps?|barmaids?|innkeepers?|menus?)\b/
// Rooms that keep books or goods without selling them.
const LIB_T = /\b(?:library|archives?|office|study|pantry|larder|storeroom|storage|cellar|armou?ry|barracks|museum|exhibit|relics|gallery|scriptorium|lounge|foyer|hallway|corridor|dormitor(?:y|ies)|infirmary|refectory|kitchen)\b/
const DOCK = /\b(?:docks?|piers?|wharf|wharves|jett(?:y|ies)|pilings|quay|boardwalk)\b/
const DIRT = /\b(?:dirt|earthen|packed[- ]earth|hard-packed|loam|muddy) (?:roads?|paths?|streets?|tracks?|lanes?|trails?|ground|floor)\b|\bdirt road\b/
const SALT = /\bsalt[- ](?:flats?|pans?|crust(?:ed)?|encrusted|marsh)\b|\bsaltern\b/
const ROCKY = /\b(?:bare rock|solid rock|rocky ground|stone ground|basalt|scree|bedrock|canyon floor|rock face|cliff face|slickrock|sandstone|shale|dolomite|limestone|rocky terrain|rocky surface)\b/
const BARREN = /\b(?:barren|parched|cracked earth|dry earth|bare earth|compacted dirt|silt|nothing grows|dusty ground)\b/

/** What a room looks like, from its title and description, in its town (when known). */
export function sceneOf(title: string, desc: string, place: PlaceDef | null = null): SceneSpec {
  title = title ?? ''
  desc = desc ?? ''
  const s = sceneScores(title, desc)
  const tl = title.toLowerCase(), dl = desc.toLowerCase()
  const indoorStrong = s.ceiling + s.indoorT + s.inHere + s.indoorCue
  // Pews and an altar are a temple's inside (the full-map review: "Tending the
  // Fold" drew a field), but one altar alone stands in a grove as often.
  const indoor = indoorStrong + s.furnish + (s.temple >= 4 ? s.temple : 0)
  const caveS = s.cave + s.caveT
  // Indoors needs real evidence: a ceiling, furniture, or an indoor title. A
  // room that also reads strongly outdoors (sky, wind, stars, a courtyard title)
  // needs more.
  const outdoorish = s.outdoor + s.outdoorT + s.trees + s.peaks + s.sea + s.river
  // Everything that says "out in the open", for the fallbacks below.
  const openAir = outdoorish + s.lake + s.fields + s.swamp + s.dunes + s.moor + s.road + s.farm
  // A cave must beat the outdoor evidence: a boxwood maze's "tunnels" and a
  // moor's "underground spring" are not caves (the 500-room review). A weaker
  // cave signal counts when nothing says outdoors ("the cave's floor").
  const caveTitled = s.caveT > 0
  const outVsCave = caveTitled ? outdoorish - s.outdoorT - s.river : outdoorish
  if ((caveS >= 4 || (caveS >= 3 && openAir === 0)) && caveS + (caveTitled ? 6 : 0) >= indoor && caveS > outVsCave) {
    const caveKind = pick<CaveKind>([['sewer', s.sewer], ['mine', s.mine], ['ice', s.iceCave], ['tunnel', s.carved]], 3) ?? 'natural'
    const near: NearLayer = s.river >= 3 || s.lake >= 3 ? 'lake' : s.lava >= 3 ? 'lava' : 'none'
    const things = sceneThings(title, desc, 'cave', null)
    // A natural cavern already hangs with stalactites (a dwarven town's caves
    // draw as tunnels), and a cave with water or lava has no room for a pool.
    const drawsDrips = caveKind === 'natural' && place?.style !== 'dwarven'
    things.props = things.props.filter(k => !(k === 'stalactites' && drawsDrips) && !(k === 'pool' && near !== 'none'))
    return { enclosure: 'cave', interior: null, far: 'none', mid: 'none', near, bridge: false, ground: 'cave', ...things, ...NO_EXTRAS, town: place?.style ?? null, caveKind }
  }
  // A room with one clear indoor cue and NOTHING outdoors is indoors: "the tiny
  // room is crowded with shelving", "the booth", "customers" (the 500-room
  // review: shops and closets with no sky or road fell through to outdoors).
  // The full-map review: with nothing at all outdoors, furniture in two forms
  // ("a table and chairs", "the walls … the floor") is a room too.
  // ...but a title word alone ("Lumber Storage") doesn't win against a
  // description that is all dock, river and barge.
  const titleOnly = s.ceiling + s.inHere + s.indoorCue + s.furnish === 0 && s.temple < 4
  if (!(titleOnly && openAir >= 6) && ((indoor >= 4 && indoor >= outdoorish) || (indoorStrong >= 2 && openAir === 0) || (indoor >= 3 && openAir === 0))) {
    // A shop SELLS: shelves, racks and books alone are a library, a pantry, an
    // armory (the full-map review found dozens of those drawn with wares).
    const shopTitle = SHOP_T.test(tl)
    const shopS = shopTitle || SALE.test(dl) ? s.shopI : 0
    const interior: Interior = shopTitle ? 'shop'
      : pick<Interior>([['temple', s.temple], ['shop', LIB_T.test(tl) ? 0 : shopS], ['home', s.homeI]], 2) ?? 'hall'
    return { enclosure: 'indoor', interior, far: 'none', mid: 'none', near: 'none', bridge: false, ground: 'floor', ...sceneThings(title, desc, 'indoor', interior), ...NO_EXTRAS, town: place?.style ?? null }
  }

  const townS = s.town + s.townT
  const fortS = s.fort + s.fortT
  const treeS = s.trees + s.woodT + s.pines + s.palms
  // The horizon: what the description says, else the town's own (Ratha's sea,
  // Shard's peaks), else a skyline in a built-up place, else hills. A harbor
  // town's sea doesn't reach a forest ravine that never mentions water (Fala
  // Inisulen sits under Acenamacra in the map).
  const inland = place?.far === 'sea' && treeS + s.peaks >= 6 && s.sea + s.river + s.lake === 0
  const far = pick<FarLayer>([['peaks', s.peaks], ['dunes', s.dunes], ['sea', s.sea]], 3)
    ?? (inland ? null : place?.far)
    ?? (townS >= 6 || fortS >= 6 ? 'skyline' : 'hills')

  const treeKind: MidLayer = s.palms > s.pines && s.palms >= 3 ? 'palms'
    : s.pines >= 3 || (treeS >= 3 && s.snow >= 3) ? 'pines' : 'trees'
  const mid0 = pick<MidLayer>([
    ['graves', s.graves], ['ruins', s.ruins], ['fort', fortS], ['shrine', s.shrine], ['farm', s.farm],
    ['buildings', townS], ['reeds', s.swamp], [treeKind, treeS], ['savannah', s.savannah],
  ], 3) ?? (s.dead >= 3 ? 'deadtrees' : 'none')
  // Trees take a kind from the description: a jungle's tangle, or dead and
  // withered ones (a blight, a moor, a burned wood).
  const isTree = mid0 === 'trees' || mid0 === 'pines' || mid0 === 'palms'
  // In a town, an open middle distance is the town itself: a Shard street whose
  // description names only its landmark (room 2562, the Tower of Honor) drew
  // nothing at all, though you are standing in the city. Not where the text
  // describes nature instead (an Aesry cliff over a hemlock forest, a lake shore
  // in Siksraja): towns have wild corners too.
  const natural = treeS + s.peaks + s.river + s.lake + s.sea + s.fields + s.swamp + s.dunes + s.cave + s.snow
  const mid: MidLayer = isTree && s.jungle >= 4 ? 'jungle'
    : isTree && s.dead >= 4 && s.dead >= treeS / 2 ? 'deadtrees'
    // ...and only where the text names something built: an Aesry forest, moor
    // or glacier with no house in it is not a street (the full-map review).
    : mid0 === 'none' && place && natural < 3 && BUILT.test(dl) ? 'buildings'
    : mid0

  // Surf needs the sea to be HERE (beach, waves, tide), not a passing mention.
  const nearW = pick<NearLayer>([['falls', s.falls + s.fallsT], ['surf', s.sea >= 5 ? s.sea : 0], ['river', s.river], ['lake', s.lake], ['lava', s.lava]], 3)
  // One "trail" or "path" is enough for a way through (the coverage scan: a
  // single mention left 1,700 rooms with no path drawn).
  // A dock or wharf stands at the water, even when the text never says so.
  const dockWater: NearLayer | null = DOCK.test(dl) ? (far === 'sea' || s.sea >= 2 ? 'surf' : 'river') : null
  const near: NearLayer = nearW ?? dockWater ?? (s.road >= 1 ? 'road' : 'none')
  const bridge = s.bridge >= 3 && (s.river + s.lake + s.sea >= 2 || /\bbridge\b/.test(title.toLowerCase()))

  // Volcanic ground (ash underfoot) needs the room itself to say so; a volcano
  // seen in the distance ("smoke rises from the Greater Fist far to the north")
  // only puts the cone on the horizon.
  const volcanicHere = !!place?.volcanic || s.volcanic >= 4
  const volcanic = volcanicHere || /\b(?:greater fist|lesser fist|volcano(?:es)?)\b/.test(desc.toLowerCase())
  const ground: Ground = s.snow >= 3 ? 'snow'
    : s.lava >= 3 && /\b(?:lava|magma|molten)\b/.test(desc.toLowerCase()) ? 'lava'
    : volcanicHere ? 'ash'
    : s.moor >= 3 ? 'moor'
    : s.swamp >= 3 ? 'swamp'
    : s.dunes >= 3 || SALT.test(dl) || (near === 'surf' && /\b(?:beach|sand)\b/.test(dl)) ? 'sand'
    // A dirt road through a village is dirt, not paving (Wolf Clan, Tiger Clan).
    : (DIRT.test(dl) || /\bdirt\b/.test(tl)) && !isTree ? 'dirt'
    : mid === 'buildings' || mid === 'fort' || mid === 'ruins' ? 'stone'
    : mid === 'trees' || mid === 'pines' || mid === 'palms' || mid === 'jungle' ? 'forest'
    // Bare rock and barren earth (canyons, basalt plateaus, the Desolate Field).
    : ROCKY.test(dl) ? 'stone'
    : BARREN.test(dl) ? 'dirt'
    : near === 'road' && s.fields < 2 ? 'dirt'
    : 'grass'
  // A lone tree only where the scene doesn't already draw trees.
  const things = sceneThings(title, desc, 'outdoor', null)
  const treeMid = mid === 'trees' || mid === 'pines' || mid === 'palms' || mid === 'jungle' || mid === 'deadtrees' || mid === 'savannah'
  if (treeMid) things.props = things.props.filter(k => k !== 'tree')
  // Water the scene already draws, the ruins' own broken columns, and drips
  // that only hang in caves.
  const hasWater = near === 'lake' || near === 'river' || near === 'surf' || near === 'falls'
  things.props = things.props.filter(k => !(k === 'pool' && hasWater) && !(k === 'pillars' && mid === 'ruins') && k !== 'stalactites')
  return {
    enclosure: 'outdoor', interior: null, far, mid, near, bridge, ground, ...things,
    town: place?.style ?? null,
    haze: !!place?.mist || s.fog >= 2,
    volcanic,
    snowcaps: far === 'peaks' && s.snow >= 2,
    caveKind: 'natural',
  }
}
