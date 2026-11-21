// World data for the Graph map — where Elanthia's places are (v1.1.0, DESIGN §19.20)
//
// Four small hand-made tables, pure data, no code beyond lookups. Nothing here
// is read from a file or the network at run time.
//
// SOURCES (Elanthipedia, https://elanthipedia.play.net):
//   ZONE_GRID        the "Zone map" article: an 11 x 11 grid of 42 lettered
//                    squares, origin bottom-left, each about 100 miles, with the
//                    wiki (Ranik) map numbers inside each square.
//   WORLD_PLACES     positions read BY EYE off Simutronics' official colour map
//                    (the "Official color map" article), as fractions of the
//                    picture. The picture itself is Simutronics' copyright and is
//                    NOT shipped; only our own table of positions is.
//   PROVINCE_OUTLINES  our own simple outlines, following the province borders
//                    drawn on the official "Five Provinces" map.
//   WORLD_ROUTES     the "Travel map" article: what kind of trip joins two places.
//
// COORDINATES: every position is [x, y] as a fraction of the world picture,
// x left to right, y TOP to bottom (screen order). `gridCellCentre` converts a
// grid square, whose y counts UP from the bottom.
//
// INVARIANTS (held by tmp-graph-map): every place sits within two grid squares
// of the square it names and inside its own province outline; every route end
// and every MAP_PLACE target is a real place id. The grid is the wiki's player
// observation and the positions are by eye, so this is a picture of the world,
// not survey data.
//
// WIKI MAP NUMBERS ARE NOT GENIE'S FILE NUMBERS. Genie's "Map127 Boar Clan" is
// wiki map 121. Never look a Genie file number up here; graphWorld.ts gets the
// wiki number from the Lich map's image names instead.

export type Province = 'zoluren' | 'therengia' | 'ilithi' | 'forfedhdar' | 'qi'

export const PROVINCE_NAMES: Record<Province, string> = {
  zoluren: 'Zoluren', therengia: 'Therengia', ilithi: 'Ilithi', forfedhdar: 'Forfedhdar', qi: "Qi'Reshalia",
}

export type Pos = readonly [number, number]

// ── The zone grid ─────────────────────────────────────────────────────────────

export interface GridSquare {
  key:      string            // the wiki's letter code
  name:     string
  x:        number            // 0..10, left to right
  y:        number            // 0..10, BOTTOM to top
  province: Province
  city?:    boolean           // the wiki shades a province's main squares darker
  maps:     readonly string[] // wiki map numbers in this square
  place?:   string            // WORLD_PLACES id this square is best known by
  also?:    readonly string[] // other names the wiki lists for the square
}

export const GRID_SIZE = 11

const sq = (key: string, name: string, x: number, y: number, province: Province, maps: string, place?: string, also?: string[], city?: boolean): GridSquare =>
  ({ key, name, x, y, province, maps: maps ? maps.split(',') : [], place, also, city })

export const ZONE_GRID: readonly GridSquare[] = [
  sq('A',  "Muspar'i",          1, 10, 'therengia', '46,46a,47,47a,47b', 'musparI', ['Tabelrem', 'Velaka Desert'], true),
  sq('B',  'Hvaral',            3, 10, 'therengia', '44,45', 'hvaral', ['Fornsted', 'Seordmaors', "Muspar'i Dock"]),
  sq('C',  'Marauders',         3,  9, 'therengia', '43', undefined, ['Gypsy Marauders']),
  sq('D',  'Therenborough',     4,  9, 'therengia', '34a,34b,41,42,42a', 'therenborough', ["Rossman's Landing", "El Bain's Stop", 'Theren Keep'], true),
  sq('E',  'Langenfirth',       4,  8, 'therengia', '40,40b', 'langenfirth'),
  sq('F',  'Mistwood Forest',   5,  8, 'therengia', '34,34c,41,41a', undefined, ['Kweld Andu', 'Woodlands']),
  sq('G',  'Deer Trail',        6,  8, 'therengia', '34,41', undefined, ["Kuniyo's Altar"]),
  sq('H',  'Gwenalion Fens',    4,  7, 'therengia', '40a'),
  sq('I',  'Riverhaven',        5,  7, 'therengia', '14d,30,30a,30b,30c,31,32,32a', 'riverhaven', ['Throne City Dock'], true),
  sq('J',  'Zaulfung',          6,  7, 'therengia', '31,31a,31b,31d', 'zaulfung', ['North of Caravansary']),
  sq('K',  'Throne City',       7,  7, 'therengia', '35,35a', 'throneCity', undefined, true),
  sq('MM', 'Rakash Village',    2,  7, 'therengia', '149', 'siksraja'),
  sq('NN', 'Svesinek Cels',     3,  7, 'therengia', '146,147,148'),
  sq('L',  'Knife Clan',        5,  6, 'zoluren',   '5a', 'knifeClan'),
  sq('M',  'Dirge',             6,  6, 'zoluren',   '13', 'dirge', ['Leucros']),
  sq('N',  'Promado Village',   7,  6, 'zoluren',   '9b', 'promado'),
  sq('O',  'Wolf Clan',         5,  5, 'zoluren',   '4a,5', 'wolfClan', ['Tiger Clan']),
  sq('P',  'Crossing',          6,  5, 'zoluren',   '0,1,1a,1b,1c,1d,1e,1f,1g,1h,1i,2,2a,2b,2c,2d,6,6a,8,8a,8b,7,7a,7b,9,9a,9b,10,10a', 'crossing', ['Rolagi', 'Arthe Dale', 'Kaerna', 'Stone Clan'], true),
  sq('Q',  'Leth Deriel',       6,  4, 'zoluren',   '60,60a,61', 'lethDeriel'),
  sq('R',  'Acenamacra',        7,  4, 'zoluren',   '61b', 'acenamacra'),
  sq('S',  'Ilaya Taipa',       5,  3, 'zoluren',   '62,62a,63,63a,111,112,112a,113', undefined, ['Manor Grounds', "Asharshpar'i", "Tamsine's Rest", 'Southern Trade Route'], true),
  sq('T',  'Horse Clan',        2,  2, 'ilithi',    '71,71a,141', 'horseClan', ['Gryphons']),
  sq('U',  "Fayrin's Rest",     4,  2, 'ilithi',    '64,64a,64c,64d', 'fayrinsRest', ['Gondola', 'Undergondola', 'Darkmist Moor']),
  sq('V',  "Chyolvea Tayeu'a",  6,  2, 'ilithi',    '', 'chyolvea'),
  sq('W',  'Shard',             4,  1, 'ilithi',    '65,66,64b,66a,66b,66c,67,67a,67b,67c,67d,67e,68,69,69a', 'shard', ['Marendin', 'Steel Claw Clan', "Adan'f"], true),
  sq('X',  "Corik's Wall",      4,  0, 'ilithi',    '68a,68b', 'coriksWall', ['Darkling Wood']),
  sq('OO', 'Fang Cove',        10,  1, 'ilithi',    '150', 'fangCove', ['Vellano'], true),
  sq('Y',  'Aesry',            10,  7, 'qi',        '98,98a,98b,98c,99,99a,99b,99c,99d', 'aesry', ["Aesry Surlaenis'a", 'Auilusi'], true),
  sq('Z',  'Ratha',             9,  6, 'qi',        '90,90a,90b,90c,90e,91,91a,91b,92,93,94,94a,95,97,97a', 'ratha'),
  sq('AA', 'Taisgath',          9,  5, 'qi',        '90d', 'taisgath', ['Erekinzil'], true),
  sq('BB', "Mer'Kresh",         9,  4, 'qi',        '107,107a,107b,108,109,109a,109b,109c,109d,110,110a', 'merKresh', ['Besoge', "M'riss"], true),
  sq('CC', "Hara'jaal",        10,  4, 'qi',        '106', 'haraJaal'),
  sq('PP', 'Basalt Isle',      10,  3, 'qi',        '90f'),
  sq('DD', "Hunter's Glade",    0,  6, 'forfedhdar', '128,130'),
  sq('EE', "Vela'tohr Wood",    1,  6, 'forfedhdar', '129,131,132,133,134,135,136,137,138,139,140', undefined, ['Cleric Guild', "Vela'tohr Overlook", 'Aevargwem', "Hag's Crag"], true),
  sq('FF', 'Boar Clan',         0,  5, 'forfedhdar', '121,121a', 'boarClan', ['North Hawkstaal']),
  sq('GG', 'Middle Hawkstaal',  0,  4, 'forfedhdar', '120,121', undefined, ['Hawstkaal Road']),
  sq('HH', "Archer's Ford",     1,  4, 'forfedhdar', '119,120,122', undefined, ['South Hawkstaal', 'Great Salt Road']),
  sq('II', 'Hibarnhvidar',      1,  3, 'forfedhdar', '115,116,116a,116b,117,117a,117b,118,118a,118c,118d,118e,123,123a,124,125', 'hibarnhvidar', ['Himineldar Shel']),
  sq('JJ', 'Trabe Plateau',     2,  3, 'forfedhdar', '118b', undefined, ["Dor'na'torna"], true),
  sq('KK', 'Ain Ghazal',        3,  3, 'forfedhdar', '114,114a', 'ainGhazal', ['Ilaya Taipa Dock', 'Himineldar Dock']),
  sq('LL', "Raven's Point",     1,  2, 'forfedhdar', '126,127,142,143,144,145', 'ravensPoint', ['Tamigen', 'Black Spire', 'Seord Kerwaith'], true),
]

/** Centre of a grid square as a picture fraction (y flipped to screen order). */
export function gridCellCentre(x: number, y: number): Pos {
  return [(x + 0.5) / GRID_SIZE, (GRID_SIZE - 1 - y + 0.5) / GRID_SIZE]
}

// ── Places ────────────────────────────────────────────────────────────────────
//
// `kind` follows the colour map's own label colours: 'city' = the large white
// names, 'town' = the dark ones with a dot, 'island' = named islands with no
// town, 'region' = yellow (areas that shape travel), 'water' = red (seas, lakes,
// rivers), 'quest' = blue (where paid quest events have been held).

export type PlaceKind = 'city' | 'town' | 'island' | 'region' | 'water' | 'quest'

export interface WorldPlace {
  id:        string
  name:      string
  pos:       Pos
  kind:      PlaceKind
  province?: Province
  square?:   string             // grid square it belongs to, when the wiki says
  wiki?:     string             // Elanthipedia page title, when not just the name
  also?:     readonly string[]  // other spellings seen in Lich's data
  isle?:     number             // drawn as its own little island of this radius
}

const pl = (id: string, name: string, x: number, y: number, kind: PlaceKind, province?: Province, square?: string, extra?: Partial<WorldPlace>): WorldPlace =>
  ({ id, name, pos: [x, y], kind, province, square, ...extra })

export const WORLD_PLACES: readonly WorldPlace[] = [
  // Therengia
  pl('musparI',       "Muspar'i",         0.162, 0.054, 'town', 'therengia', 'A', { also: ['Muspari'] }),
  pl('haizenCugis',   'Haizen Cugis',     0.225, 0.080, 'town', 'therengia', 'A', { also: ['Oasis', 'Sand Clan', 'Heru Taipa'] }),
  pl('hvaral',        'Hvaral',           0.257, 0.068, 'town', 'therengia', 'B'),
  pl('fornsted',      'Fornsted',         0.301, 0.048, 'town', 'therengia', 'B'),
  pl('therenborough', 'Therenborough',    0.410, 0.150, 'city', 'therengia', 'D', { also: ['Theren Keep'] }),
  pl('elBains',       "El'Bain's Stop",   0.365, 0.209, 'town', 'therengia', 'D', { also: ["El Bain's Stop", 'El Bains Stop', "El' Bains"] }),
  pl('rossmans',      "Rossman's Landing", 0.408, 0.252, 'town', 'therengia', 'D', { also: ['Rossmans Landing', 'Rossgallan Keep'] }),
  pl('langenfirth',   'Langenfirth',      0.338, 0.279, 'town', 'therengia', 'E'),
  pl('siksraja',      'Siksraja',         0.278, 0.346, 'town', 'therengia', 'MM', { also: ['Rakash Village'] }),
  pl('riverhaven',    'Riverhaven',       0.498, 0.359, 'city', 'therengia', 'I', { also: ['Haven'] }),
  pl('zaulfung',      'Zaulfung',         0.577, 0.351, 'town', 'therengia', 'J', { also: ['Zaulfung Swamp'] }),
  pl('throneCity',    'Throne City',      0.630, 0.369, 'town', 'therengia', 'K'),
  pl('sicleGrove',    'Sicle Grove',      0.549, 0.394, 'town', 'therengia'),
  pl('greaterFist',   'Greater Fist',     0.499, 0.404, 'town', 'therengia'),
  // Zoluren
  pl('crossing',      'The Crossing',     0.550, 0.540, 'city', 'zoluren', 'P', { also: ['Crossing'] }),
  pl('knifeClan',     'Knife Clan',       0.480, 0.452, 'town', 'zoluren', 'L'),
  pl('dirge',         'Dirge',            0.533, 0.440, 'town', 'zoluren', 'M'),
  pl('sunfallHub',    'Sunfall Hub',      0.581, 0.456, 'town', 'zoluren', 'P'),
  pl('stoneClan',     'Stone Clan',       0.610, 0.462, 'town', 'zoluren', 'P', { also: ['Lairocott Brach'] }),
  pl('promado',       'Promado Village',  0.640, 0.437, 'town', 'zoluren', 'N'),
  pl('kaerna',        'Kaerna Village',   0.538, 0.490, 'town', 'zoluren', 'P', { also: ['Kaerna'] }),
  pl('artheDale',     'Arthe Dale',       0.621, 0.526, 'town', 'zoluren', 'P'),
  pl('wolfClan',      'Wolf Clan',        0.466, 0.528, 'town', 'zoluren', 'O'),
  pl('tigerClan',     'Tiger Clan',       0.528, 0.530, 'town', 'zoluren', 'O'),
  pl('silverclawHub', 'Silverclaw Hub',   0.621, 0.572, 'town', 'zoluren', 'Q'),
  pl('lethDeriel',    'Leth Deriel',      0.540, 0.628, 'town', 'zoluren', 'Q', { also: ['Boggy Marsh of Leth'] }),
  // Tref Dinta is NOT Tref Bain (they were one entry until v1.1.0): Tref Dinta
  // is the Zoluren town just south of Leth Deriel on the Southern Trade Route
  // (Sekmeht; Lich's map files its rooms under Zoluren), Tref Bain the closed
  // Qi'Reshalian island further out (below, with the other islands).
  pl('trefDinta',     'Tref Dinta',       0.536, 0.668, 'town', 'zoluren', 'Q'),
  pl('acenamacra',    'Acenamacra',       0.617, 0.616, 'town', 'zoluren', 'R', { also: ['Acenamacra Village', 'Acenemacra'] }),
  pl('ilayaTaipa',    'Ilaya Taipa',      0.357, 0.662, 'town', 'zoluren', 'S', { also: ['River Clan'] }),
  // Forfedhdar
  pl('boarClan',      'Boar Clan',        0.167, 0.582, 'town', 'forfedhdar', 'FF'),
  pl('hibarnhvidar',  'Hibarnhvidar',     0.170, 0.650, 'city', 'forfedhdar', 'II'),
  pl('ainGhazal',     'Ain Ghazal',       0.229, 0.633, 'town', 'forfedhdar', 'KK'),
  pl('ravensPoint',   "Raven's Point",    0.185, 0.675, 'town', 'forfedhdar', 'LL'),
  pl('arnuthrum',     'Arnuthrum Island', 0.143, 0.623, 'island', 'forfedhdar'),
  // Ilithi
  pl('shard',         'Shard',            0.430, 0.800, 'city', 'ilithi', 'W', { also: ['Undershard'] }),
  pl('horseClan',     'Horse Clan',       0.312, 0.760, 'town', 'ilithi', 'T', { also: ['Zaldi Taipa'] }),
  pl('steelclaw',     'Steelclaw Clan',   0.438, 0.768, 'town', 'ilithi', 'W', { also: ['Steel Claw Clan'] }),
  pl('fayrinsRest',   "Fayrin's Rest",    0.491, 0.752, 'town', 'ilithi', 'U'),
  pl('elamiri',       'Elamiri',          0.519, 0.717, 'town', 'ilithi'),
  pl('chyolvea',      "Chyolvea Tayeu'a", 0.561, 0.712, 'town', 'ilithi', 'V'),
  pl('fangCove',      'Fang Cove',        0.832, 0.845, 'town', 'ilithi', 'OO'),
  // Qi'Reshalia
  pl('aesry',         "Aesry Surlaenis'a", 0.953, 0.346, 'town', 'qi', 'Y', { also: ['Aesry', 'Surlaenis Island'], isle: 0.030 }),
  pl('ratha',         'Ratha',            0.885, 0.428, 'town', 'qi', 'Z', { also: ['Reshalia Island', 'Reshalia Trade Road', 'Reshalian Coastal Road'], isle: 0.040 }),
  pl('taisgath',      'Taisgath',         0.871, 0.484, 'town', 'qi', 'AA', { also: ['Taisgath Island'], isle: 0.020 }),
  pl('merKresh',      "Mer'Kresh",        0.875, 0.599, 'town', 'qi', 'BB', { also: ['Merkresh'], isle: 0.022 }),
  pl('mRiss',         "M'Riss",           0.855, 0.622, 'town', 'qi', 'BB', { also: ['Mriss'], isle: 0.022 }),
  pl('haraJaal',      "Hara'jaal",        0.941, 0.573, 'town', 'qi', 'CC', { also: ['Harajaal'], isle: 0.026 }),
  pl('basaltIsle',    'Basalt Isle',      0.955, 0.660, 'island', 'qi', 'PP', { isle: 0.016 }),
  pl('zhamikhh',      'Zhamikhh Island',  0.740, 0.354, 'island', 'qi', undefined, { isle: 0.016 }),
  pl('sarasunath',    'Sarasunath Island', 0.797, 0.378, 'island', 'qi', undefined, { isle: 0.016 }),
  pl('shamilho',      'Shamilho Island',  0.875, 0.539, 'island', 'qi', undefined, { isle: 0.014 }),
  pl('piQanah',       "Pi'Qanah Island",  0.738, 0.602, 'island', 'qi', undefined, { isle: 0.022 }),
  // Elanthipedia: an island "off the east coast of Leth Deriel and the northeast
  // of Acenamacra", claimed by Qi'Reshalia, closed to outsiders past the docks
  // of its port, Landfall. Placed from that wording, north of Pi'Qanah; not read
  // off a map, so the exact spot is an estimate. No 'Landfall' alias: names are
  // matched by "contains", and the Crossing has a Landfall Jetty and Dock.
  pl('trefBain',      'Tref Bain',        0.730, 0.556, 'island', 'qi', undefined, { isle: 0.016 }),
  pl('irasushen',     'Irasushen Island', 0.780, 0.622, 'island', 'qi', undefined, { isle: 0.018 }),
  // Regions that shape travel
  pl('velaka',        'Velaka Desert',    0.090, 0.143, 'region', 'therengia'),
  pl('theWaste',      'The Waste',        0.552, 0.190, 'region', 'therengia', undefined, { wiki: 'The Waste' }),
  pl('coriksWall',    "Corik's Wall",     0.451, 0.868, 'region', 'ilithi', 'X'),
  pl('darkHand',      'Dark Hand',        0.445, 0.920, 'region', 'ilithi'),
  pl('theBoot',       'The Boot',         0.763, 0.748, 'region', 'ilithi'),
  // The mountains the Leth Deriel–Fayrin's Rest gondola crosses (Ports of Call map).
  pl('dragonsSpine',  "Dragon's Spine",   0.400, 0.724, 'region', 'ilithi'),
  // Water. The Ports of Call names (v1.1.0) were placed by lining that map up
  // with this one on 17 shared towns (a least-squares fit, under 2/3 of a
  // square off everywhere), then moved off any land they fell on.
  pl('reshalSeaN',    'Reshal Sea',       0.861, 0.171, 'water'),
  pl('reshalSeaS',    'Reshal Sea',       0.861, 0.717, 'water'),
  pl('gwenalionLake', 'Lake Gwenalion',   0.416, 0.311, 'water'),
  pl('faldesuDelta',  'Faldesu Delta',    0.703, 0.360, 'water'),
  pl('faldesuBay',    'Faldesu Bay',      0.712, 0.410, 'water'),
  pl('segolthaBay',   'Segoltha Bay',     0.665, 0.540, 'water'),
  pl('nenashyoBay',   'Bay of Nenashyo',  0.630, 0.631, 'water'),
  pl('twinsoulBay',   'Twinsoul Bay',     0.619, 0.660, 'water'),
  pl('lakeOfTears',   'Lake of Tears',    0.411, 0.830, 'water'),
  pl('sawstwarLake',  'Sawstwar Lake',    0.090, 0.640, 'water'),
  // Where paid quest events have been held
  pl('andreshlew',    'Andreshlew',       0.948, 0.690, 'quest', undefined, undefined, { also: ['Hollow Eve', 'Hollows Eve'] }),
  pl('taisidon',      'Taisidon',         0.955, 0.925, 'quest'),
  pl('beyondBarrier', 'Beyond the Barrier', 0.045, 0.525, 'quest'),
  pl('ghostShip',     'Ghost Ship',       0.800, 0.268, 'quest'),
  pl('meshor',        'Meshor',           0.905, 0.945, 'quest'),
  pl('coriksSecret',  "Corik's Secret",   0.775, 0.945, 'quest'),
]

const PLACE_BY_ID = new Map(WORLD_PLACES.map(p => [p.id, p]))
export function placeById(id: string): WorldPlace | undefined { return PLACE_BY_ID.get(id) }

const SQUARE_BY_KEY = new Map(ZONE_GRID.map(s => [s.key, s]))
export function squareByKey(key: string): GridSquare | undefined { return SQUARE_BY_KEY.get(key) }

/** Where a grid square is drawn: at its best-known place, else its cell centre. */
export function squarePos(s: GridSquare): Pos {
  const p = s.place ? PLACE_BY_ID.get(s.place) : undefined
  return p ? p.pos : gridCellCentre(s.x, s.y)
}

// ── Wiki map numbers that are one known place ─────────────────────────────────
//
// Finer than the grid: the Crossing's square holds 29 maps, but map 7b is Arthe
// Dale and map 10 is Stone Clan. From the Travel map's own links.

export const MAP_PLACE: Readonly<Record<string, string>> = {
  '47': 'musparI', '46': 'musparI', '48': 'haizenCugis', '45': 'hvaral', '44': 'fornsted',
  '42': 'therenborough', '42a': 'therenborough', '41': 'elBains', '34a': 'rossmans', '34b': 'rossmans',
  '40': 'langenfirth', '149': 'siksraja', '30': 'riverhaven', '31a': 'zaulfung', '35': 'throneCity', '35a': 'throneCity',
  '14': 'greaterFist', '14b': 'greaterFist',
  '1': 'crossing', '5a': 'knifeClan', '13': 'dirge', '9c': 'sunfallHub', '10': 'stoneClan', '9': 'kaerna',
  '7b': 'artheDale', '5': 'wolfClan', '4a': 'tigerClan', '60c': 'silverclawHub', '61': 'lethDeriel', '61a': 'lethDeriel',
  '61b': 'acenamacra', '112': 'ilayaTaipa',
  '121': 'boarClan', '116': 'hibarnhvidar', '117': 'hibarnhvidar', '114': 'ainGhazal', '127': 'ravensPoint',
  '67': 'shard', '71a': 'horseClan', '66a': 'steelclaw', '64': 'fayrinsRest', '64a': 'chyolvea', '150': 'fangCove',
  '99': 'aesry', '90': 'ratha', '90d': 'taisgath', '107': 'merKresh', '108': 'mRiss', '106': 'haraJaal', '90f': 'basaltIsle',
}

// ── Province outlines ─────────────────────────────────────────────────────────
//
// Closed polygons in picture fractions. The four mainland ones share their
// border points exactly, so no gap or overlap shows between them; together
// they are the mainland. Qi'Reshalia is the island sea to the east.

export const PROVINCE_OUTLINES: Readonly<Record<Province, readonly Pos[]>> = {
  therengia: [
    [0.03, 0.03], [0.68, 0.03], [0.69, 0.15], [0.66, 0.25], [0.67, 0.33], [0.675, 0.395],
    [0.60, 0.41], [0.52, 0.422], [0.42, 0.415], [0.40, 0.40], [0.30, 0.40], [0.20, 0.38], [0.10, 0.30], [0.03, 0.26],
  ],
  // The east coast has two inlets (Sekmeht): Segoltha Bay reaching in toward
  // the Crossing, below Arthe Dale and above Silverclaw Hub, and the Bay of
  // Nenashyo by Leth Deriel, with Acenamacra (and its dock) on its shore and
  // Twinsoul Bay at its southern end. The bay's south shore is Ilithi's coast.
  zoluren: [
    [0.42, 0.415], [0.52, 0.422], [0.60, 0.41], [0.675, 0.395], [0.705, 0.43], [0.69, 0.50],
    [0.655, 0.520], [0.634, 0.540], [0.640, 0.553], [0.668, 0.566], [0.660, 0.590], [0.632, 0.604],
    [0.624, 0.622], [0.605, 0.640], [0.603, 0.658], [0.62, 0.67], [0.52, 0.68], [0.40, 0.70], [0.33, 0.70],
    [0.31, 0.62], [0.33, 0.52], [0.38, 0.44],
  ],
  forfedhdar: [
    [0.03, 0.26], [0.10, 0.30], [0.20, 0.38], [0.30, 0.40], [0.40, 0.40], [0.42, 0.415], [0.38, 0.44],
    [0.33, 0.52], [0.31, 0.62], [0.33, 0.70], [0.27, 0.72], [0.15, 0.80], [0.03, 0.82],
  ],
  ilithi: [
    [0.03, 0.82], [0.15, 0.80], [0.27, 0.72], [0.33, 0.70], [0.40, 0.70], [0.52, 0.68], [0.62, 0.67], [0.71, 0.655],
    [0.725, 0.70], [0.80, 0.735], [0.755, 0.795], [0.84, 0.795], [0.905, 0.86], [0.88, 0.95], [0.70, 0.97], [0.03, 0.97],
  ],
  qi: [
    [0.72, 0.30], [0.99, 0.30], [0.99, 0.71], [0.77, 0.71], [0.715, 0.62], [0.715, 0.45],
  ],
}

/** Where each province's name is written: a quiet corner of it, clear of its towns. */
export const PROVINCE_LABEL_POS: Readonly<Record<Province, Pos>> = {
  therengia: [0.19, 0.20], zoluren: [0.40, 0.585], forfedhdar: [0.15, 0.47], ilithi: [0.21, 0.90], qi: [0.80, 0.325],
}

/** Even-odd point-in-polygon test, for the harness and for hover. */
export function insideOutline(p: Pos, poly: readonly Pos[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ── Travel routes ─────────────────────────────────────────────────────────────
//
// Only the trips that are NOT an ordinary walk; a link with no route here is a
// road. Kinds follow the Travel map's key: 'athletics' = a shortcut that needs
// Athletics, 'vessel' = a boat or other transport you ride, 'slow' = slow or
// treacherous going. A pair of places can have more than one.

export type RouteKind = 'walk' | 'athletics' | 'vessel' | 'slow'

export interface WorldRoute { a: string; b: string; kind: Exclude<RouteKind, 'walk'>; note: string }

const rt = (a: string, b: string, kind: WorldRoute['kind'], note: string): WorldRoute => ({ a, b, kind, note })

export const WORLD_ROUTES: readonly WorldRoute[] = [
  rt('crossing',      'lethDeriel',   'vessel',    'Ferry across the Segoltha'),
  rt('tigerClan',     'lethDeriel',   'athletics', 'Swim the Segoltha (about 350 Athletics)'),
  rt('crossing',      'ratha',        'vessel',    "The ship Skirr'lolasu"),
  rt('crossing',      'musparI',      'vessel',    'Airship'),
  rt('greaterFist',   'riverhaven',   'vessel',    'Ferry across the Faldesu'),
  rt('greaterFist',   'riverhaven',   'athletics', 'Swim the Faldesu (about 120 Athletics)'),
  rt('riverhaven',    'throneCity',   'vessel',    'Ferry down the Faldesu'),
  rt('riverhaven',    'langenfirth',  'vessel',    'Barge'),
  rt('riverhaven',    'rossmans',     'athletics', 'Cross the Jantspyre (about 150 Athletics)'),
  rt('riverhaven',    'rossmans',     'vessel',    'Rented boat on Lake Gwenalion'),
  rt('langenfirth',   'rossmans',     'vessel',    'Rented boat on Lake Gwenalion'),
  rt('riverhaven',    'ratha',        'vessel',    "The ship Kree'la"),
  rt('riverhaven',    'aesry',        'vessel',    'The ship Lybadel'),
  rt('ratha',         'aesry',        'vessel',    'The ship Halasa Selhin'),
  rt('ratha',         'taisgath',     'vessel',    'The ship Night Sky, or the moongate when a moon is up'),
  rt('ratha',         'haraJaal',     'vessel',    "The ship Tasia'zaul (needs the Hara'jaal quest)"),
  rt('merKresh',      'haraJaal',     'vessel',    'The ship Jolas'),
  rt('merKresh',      'mRiss',        'vessel',    'Ferry'),
  rt('mRiss',         'acenamacra',   'vessel',    "The ship Degan (M'Riss citizens only)"),
  rt('mRiss',         'langenfirth',  'vessel',    'Balloon'),
  rt('acenamacra',    'fangCove',     'vessel',    'Mammoth (estate holders)'),
  rt('ratha',         'fangCove',     'vessel',    'Mammoth (estate holders)'),
  rt('shard',         'aesry',        'vessel',    'Dirigible'),
  rt('hvaral',        'musparI',      'vessel',    'Sand barge'),
  rt('hvaral',        'haizenCugis',  'athletics', 'Cross the Velaka Desert (high Athletics)'),
  rt('musparI',       'haizenCugis',  'athletics', 'Cross the Velaka Desert (high Athletics)'),
  rt('ilayaTaipa',    'ainGhazal',    'vessel',    'Skiff'),
  rt('ainGhazal',     'hibarnhvidar', 'vessel',    'Ferry'),
  rt('ainGhazal',     'ravensPoint',  'vessel',    'Ferry'),
  rt('therenborough', 'throneCity',   'vessel',    'Turtle (a Moon Mage has to call it)'),
  rt('lethDeriel',    'fayrinsRest',  'vessel',    "Gondola over the Dragon's Spine"),
  rt('siksraja',      'boarClan',     'vessel',    'Wizened ranger guide, or the Ranger trail'),
  rt('therenborough', 'fornsted',     'slow',      'A long, slow road past the Marauders (passport needed at Fornsted)'),
]

/** The wiki's distance between two grid squares: whole zones, straight line. */
export function zoneDistance(a: GridSquare, b: GridSquare): number {
  return Math.floor(Math.hypot(a.x - b.x, a.y - b.y))
}

export const ELANTHIPEDIA = 'https://elanthipedia.play.net/'

/** Elanthipedia address for a page title or a wiki map number. */
export function wikiUrl(title: string): string {
  return ELANTHIPEDIA + encodeURIComponent(title.trim().replace(/\s+/g, '_')).replace(/%2C/g, ',')
}
