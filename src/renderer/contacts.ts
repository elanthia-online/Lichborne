// Contacts — the per-character player list and the templates that colour/tag their names.
//
// Types, per-character storage, factories and display formatters for two
// records: a `Contact` (a player name + guild/circle/notes + presence stats)
// and a `ContactTemplate` (how a contact's NAME and optional TAG are painted —
// colours, bold, and the same text-effect menu highlights use). Storage is two
// `scopedKey`s (`contacts` / `contact-templates`), written through
// `safeSetItem` because imports mint big lists and a bare `setItem` at quota
// throws and loses the write (B197 family, v0.14.5). The two DEFAULT_TEMPLATES
// (Friends / Enemies) are re-added by id on every load if missing.
//
// THE TRAP TO KNOW (pitfall #121, spelled out on `normalizeTemplate`): every
// load REBUILDS each template field by field, and the panel saves what it was
// handed — so an optional field added to `ContactTemplate` but not to that
// rebuild is silently DESTROYED on the next save. Adding a field means adding
// it there too; the round trip is harness-covered.
//
// The F34 (v0.8.6) social stats on `Contact` (`encounterCount`, `timeSpentMs`,
// `lastEncounterAt`) are optional and PER CLIENT; they're maintained by the
// room-presence tracking elsewhere — this file only defines and formats them.

export interface ContactTemplate {
  id: string
  name: string
  textColor: string
  bgColor: string
  bold: boolean
  tagText: string
  tagColor: string
  tagBgColor: string
  groupIds: string[]
  allGroups: boolean
  isDefault?: boolean
  // Optional text effect on the contact's NAME (same menu as highlights —
  // glow/shimmer/rainbow/…). Undefined === none. `glowColor` is the accent for
  // glow/gradient/neon. Both optional so existing templates load unchanged.
  effect?: import('./highlights').HighlightEffect
  glowColor?: string
  // Optional text effect on the TAG, independent of the name's (Sekmeht:
  // "I could see someone just wanting text effects on the tag, but not the
  // name"). Undefined === none, so existing templates load unchanged.
  tagEffect?: import('./highlights').HighlightEffect
  tagGlowColor?: string
  /**
   * Bold on the TAG, independent of the name's — the tag had colour, background
   * and an effect but no weight, so "[Enemy]" could not be made to stand out the
   * way the name could. Optional, so existing templates load unchanged.
   */
  tagBold?: boolean
}

export interface Contact {
  id: string
  name: string
  templateId: string | null
  guild: string
  circle: string
  notes: string
  lastSeen: number | null
  lastRoom: string | null
  // v0.8.6 (F34): per-client social stats. encounterCount increments by 1
  // whenever the contact reappears in room.players AFTER an "encounter
  // cooldown" (10 min) — so an alt cycling in and out of the room only
  // counts once. timeSpentMs accumulates 60 seconds per polling tick
  // while the contact is in the current room. Both stats are PER CLIENT
  // (only grow while Lichborne is open and connected); UI labels say so.
  // Both optional so existing pre-v0.8.6 contacts load with no migration.
  encounterCount?: number
  timeSpentMs?: number
  lastEncounterAt?: number  // timestamp of the most recent counted encounter, for the cooldown gate
}

import { scopedKey, safeSetItem } from './characterScope'

const storageContacts  = (character: string) => scopedKey(character, 'contacts')
const storageTemplates = (character: string) => scopedKey(character, 'contact-templates')

export const DEFAULT_TEMPLATES: ContactTemplate[] = [
  { id: 'tpl-friends', name: 'Friends', textColor: '#A0D080', bgColor: 'transparent', bold: false, tagText: '',        tagColor: '#A0D080', tagBgColor: 'transparent', groupIds: [], allGroups: true, isDefault: true },
  { id: 'tpl-enemies', name: 'Enemies', textColor: '#E05050', bgColor: 'transparent', bold: false, tagText: '[Enemy]', tagColor: '#E05050', tagBgColor: 'transparent', groupIds: [], allGroups: true, isDefault: true },
]

export const DR_GUILDS = [
  'Unknown', 'Barbarian', 'Bard', 'Cleric', 'Commoner',
  'Empath', 'Moon Mage', 'Necromancer', 'Paladin',
  'Ranger', 'Thief', 'Trader', 'Warrior Mage',
]

export function loadContacts(character: string): Contact[] {
  try {
    const raw = localStorage.getItem(storageContacts(character))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function saveContacts(character: string, contacts: Contact[]): void {
  // Quota-safe (B197 family, v0.14.5): contact lists get big via imports
  // (a single Frostbite names import minted 151) — a bare setItem at quota
  // throws and silently loses the write.
  safeSetItem(storageContacts(character), JSON.stringify(contacts))
}

/**
 * REBUILDS the record field by field — so **any field missing here is DESTROYED**,
 * not merely ignored (pitfall #121). This runs on every load, and the panel saves
 * whatever it was handed, so a dropped field survives exactly until the next save.
 *
 * That is what happened to `effect` / `glowColor`: they were added to the type
 * (and to the editor, which offers the same effect menu as highlights) but never
 * added here, so a contact template kept its COLOUR and silently lost its rainbow
 * on the next load. `tsc` cannot catch it because both are optional — the very
 * thing that makes them safe to add is what makes omitting them invisible.
 *
 * **Adding an optional field to `ContactTemplate` means adding it here too**, and
 * the round trip is covered in tmp-rules-harness so the next one cannot slip.
 */
function normalizeTemplate(t: Partial<ContactTemplate> & { id: string; name: string }): ContactTemplate {
  return {
    id: t.id,
    name: t.name,
    effect:     t.effect,
    glowColor:  t.glowColor,
    tagEffect:    t.tagEffect,
    tagGlowColor: t.tagGlowColor,
    tagBold:      t.tagBold,
    textColor:  t.textColor  || '#C8C8C8',
    bgColor:    t.bgColor    || 'transparent',
    bold:       t.bold       ?? false,
    tagText:    t.tagText    ?? '',
    tagColor:   t.tagColor   || '#C8C8C8',
    tagBgColor: t.tagBgColor || 'transparent',
    groupIds:   t.groupIds   ?? [],
    allGroups:  t.allGroups  ?? true,
    isDefault:  t.isDefault,
  }
}

export function loadContactTemplates(character: string): ContactTemplate[] {
  try {
    const raw = localStorage.getItem(storageTemplates(character))
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return [...DEFAULT_TEMPLATES]
    const map = new Map(parsed.map((t: ContactTemplate) => [t.id, normalizeTemplate(t)]))
    for (const d of DEFAULT_TEMPLATES) {
      if (!map.has(d.id)) map.set(d.id, d)
    }
    return Array.from(map.values())
  } catch { return [...DEFAULT_TEMPLATES] }
}

export function saveContactTemplates(character: string, templates: ContactTemplate[]): void {
  // Quota-safe (B197 family, v0.14.5) — see saveContacts.
  safeSetItem(storageTemplates(character), JSON.stringify(templates))
}

export function newContact(): Contact {
  return {
    id: crypto.randomUUID(),
    name: '',
    templateId: null,
    guild: 'Unknown',
    circle: '',
    notes: '',
    lastSeen: null,
    lastRoom: null,
  }
}

export function newTemplate(): ContactTemplate {
  return {
    id: crypto.randomUUID(),
    name: '',
    textColor: '#C8C8C8',
    bgColor: 'transparent',
    bold: false,
    tagText: '',
    tagColor: '#C8C8C8',
    tagBgColor: 'transparent',
    groupIds: [],
    allGroups: true,
  }
}

export function formatLastSeen(ts: number | null): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// v0.8.6 (F34): format a cumulative duration for the Time Logged Together
// stat. Sub-minute renders as a dash (the polling tick is 60s, so any
// non-zero value should be at least a minute).
export function formatDuration(ms: number): string {
  if (!ms || ms < 60_000) return '—'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`
  const days = Math.floor(hrs / 24)
  const remHrs = hrs % 24
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`
}
