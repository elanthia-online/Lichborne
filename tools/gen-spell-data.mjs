// Regenerates src/renderer/spellData.ts from Lich's `base-spells.yaml`.
//
//   node tools/gen-spell-data.mjs [path-to-base-spells.yaml]
//
// The OUTPUT IS COMMITTED, deliberately: the source file lives in a Lich
// install, which CI does not have and a direct-SGE player may not either. The
// Spell Monitor is explicitly usable without Lich (Principle #2), so its badge
// data has to ship with the client rather than be read from one. Re-run this
// when Lich publishes new spells and commit the diff.
//
// Uses a REAL YAML parser, not regexes: 14 `skill:` values carry trailing
// comments (`Augmentation # Also Utility`), and a naive line scrape would fold
// the comment into the value.
import { readFileSync, writeFileSync } from 'node:fs'
import yaml from 'js-yaml'

const SRC = process.argv[2] || 'C:/Ruby4Lich5/Lich5/scripts/data/base-spells.yaml'
const OUT = 'src/renderer/spellData.ts'

// Badge letter + tooltip label per skill/type. Every one of the eleven values
// DR uses has a distinct first letter, so single letters need no disambiguation.
const SKILL = {
  'Augmentation':   ['A', 'Augmentation'],
  'Utility':        ['U', 'Utility'],
  'Targeted Magic': ['T', 'Targeted Magic'],
  'Debilitation':   ['D', 'Debilitation'],
  'Warding':        ['W', 'Warding'],
  'cantrip':        ['C', 'Cantrip'],
}
const TYPE = {
  form:       ['F', 'Form'],
  berserk:    ['B', 'Berserk'],
  meditation: ['M', 'Meditation'],
  roar:       ['R', 'Roar'],
  scream:     ['S', 'Scream'],
}

const doc = yaml.load(readFileSync(SRC, 'utf8'))
const out = {}
let skipped = []

const add = (name, badge, label, abbrev, guild) => {
  if (out[name]) { skipped.push(`DUPLICATE: ${name}`); return }
  out[name] = { b: badge, l: label, ...(abbrev ? { a: abbrev } : {}), ...(guild ? { g: guild } : {}) }
}

for (const [name, e] of Object.entries(doc.spell_data ?? {})) {
  // `e.Skill` (capital S) is a TYPO in Lich's own data — "See the Wind" carries
  // it, and a case-exact read drops that spell silently. Tolerate it rather than
  // lose an entry to someone else's shift key; the skipped-list below is what
  // surfaced it in the first place, which is why this script reports rather
  // than discards.
  const m = SKILL[e?.skill ?? e?.Skill]
  if (m) { add(name, m[0], m[1], e.abbrev, e.guild); continue }
  // Metamagic feats carry no `skill` at all — a real category (33 entries) with
  // its own abbrev and guild, not malformed data. Badge 'X' because the natural
  // 'M' is already Meditation: no character can have both, but a letter that
  // is unambiguous only by luck is the pitfall #55 trap, so it gets its own.
  if (e?.metamagic) { add(name, 'X', 'Metamagic', e.abbrev, e.guild); continue }
  skipped.push(`spell ${name}: skill=${JSON.stringify(e?.skill)}`)
}
// `battle_cries` carries no `guild` field — the YAML separates them with
// COMMENTS ("# Bardic Screams", "# Barbarian Roars"), which no parser can read.
// The TYPE is the reliable signal instead, and the split is 1:1: every scream is
// Bardic, every roar Barbarian. Without this the 14 cries lost their guild in
// the tooltip, which is the sort of quiet gap a comment-delimited section
// invites — when a section's grouping lives only in comments, derive it from a
// real field rather than dropping it.
const TYPE_GUILD = { roar: 'Barbarian', scream: 'Bard' }
for (const section of ['barb_abilities', 'battle_cries']) {
  for (const [name, e] of Object.entries(doc[section] ?? {})) {
    const m = TYPE[e?.type]
    if (!m) { skipped.push(`${section} ${name}: type=${JSON.stringify(e?.type)}`); continue }
    const guild = section === 'barb_abilities' ? 'Barbarian' : TYPE_GUILD[e.type]
    add(name, m[0], m[1], undefined, guild)
  }
}

const entries = Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
const body = entries.map(([n, v]) => `  ${JSON.stringify(n)}: ${JSON.stringify(v)},`).join('\n')

writeFileSync(OUT, `// GENERATED — do not edit by hand. Run: node tools/gen-spell-data.mjs
//
// Spell/ability reference for the Spell Monitor's badges and abbreviations,
// derived from Lich's \`scripts/data/base-spells.yaml\` (${entries.length} entries).
// Committed rather than read from a Lich install, because the Spell Monitor
// works without Lich (Principle #2) — see tools/gen-spell-data.mjs.
//
// Keys are the effect names EXACTLY as DR writes them in the percWindow stream;
// that they match the YAML keys verbatim (apostrophes, roman numerals) is the
// fact this whole feature rests on, verified against a real capture.
//
// KNOWN COVERAGE GAP: Thief Khri are absent from base-spells.yaml entirely, yet
// they DO appear in percWindow — so a Thief gets no badges. A missing entry is
// silent by design (no badge), never a wrong one.

/** b = badge letter, l = tooltip label, a = abbreviation, g = guild. Terse keys
 *  because this table is ~${Math.round(body.length / 1024)}KB in the bundle. */
export interface SpellRef { b: string; l: string; a?: string; g?: string }

export const SPELL_DATA: Record<string, SpellRef> = {
${body}
}

// Case-insensitive fallback index. The names match verbatim in every capture we
// have, so this only ever covers a casing drift we have not seen.
const BY_LOWER: Record<string, SpellRef> = {}
for (const k in SPELL_DATA) BY_LOWER[k.toLowerCase()] = SPELL_DATA[k]

export function lookupSpell(name: string): SpellRef | undefined {
  return SPELL_DATA[name] ?? BY_LOWER[name.toLowerCase()]
}
`)

console.log(`wrote ${OUT}: ${entries.length} entries, ${Math.round(body.length / 1024)}KB`)
if (skipped.length) console.log(`skipped ${skipped.length}:\n  ` + skipped.join('\n  '))
