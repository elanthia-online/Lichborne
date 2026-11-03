// Game links — the rich stream's `<a exist="ID" noun="NOUN">` names, made
// clickable (v0.21.0, DESIGN §55.5).
//
// The parser stamps each linked segment with `exist` (the id; players are
// negative) and `noun`. renderSegment / renderSegmentFull put them on the DOM
// as `data-exist` / `data-noun` / `data-link` (the linked text) / `data-bold`,
// so any surface can read the link under a click with `linkAtElement`.
//
// One menu for every surface: GameWindow provides `GameLinkContext` with a
// stable `linkMenu(el, x, y)` that returns the menu items for the link under
// `el` (or none). The main window, stream panels and the Room panel each ask
// it on a left-click (the link's menu alone) and on a right-click (above the
// usual text menu). A context rather than a prop, because PanelFrame's panels,
// floating windows and portaled Overview cards all sit inside GameWindow's tree.
//
// Every action is something the player chose from a menu (Principle #1): it is
// sent through GameWindow's echoing sendCommand, or only TYPED into the command
// bar (Say to / Whisper to). Commands target `#id`, which DR accepts and which
// can't pick the wrong one of several identical creatures or items.
import { createContext } from 'react'
import type { CtxItem } from './components/ContextMenu'

export interface GameLink {
  /** The game's id: negative for a player, positive for a creature or object. */
  id: string
  /** The game's noun for it (often NOT the last word of the text). */
  noun?: string
  /** The text that carried the link, e.g. "jeol moradu" or a pronoun, "it". */
  text: string
  /** Bold text: DR bolds creatures (and only creatures) when it links them. */
  bold: boolean
}

// 'feature' is a fixed part of the room or world (a door, a sign, a trail, a
// moon) — Look only; 'object' is an instanced item (Look + Get).
export type GameLinkKind = 'player' | 'creature' | 'object' | 'feature'

/** DOM attributes for a linked segment (renderSegment, renderSegmentFull). */
export function linkDataAttrs(seg: { exist?: string; noun?: string; text: string; bold?: boolean }): Record<string, string> | null {
  if (!seg.exist) return null
  return {
    'data-exist': seg.exist,
    ...(seg.noun ? { 'data-noun': seg.noun } : {}),
    'data-link': seg.text,
    ...(seg.bold ? { 'data-bold': '1' } : {}),
  }
}

/** The game link under a DOM element, if any. */
export function linkAtElement(el: Element | null): GameLink | null {
  const host = el?.closest<HTMLElement>('[data-exist]')
  if (!host) return null
  const id = host.dataset.exist ?? ''
  if (!/^-?\d+$/.test(id)) return null
  return {
    id,
    noun: host.dataset.noun || undefined,
    text: (host.dataset.link ?? host.textContent ?? '').trim(),
    bold: host.dataset.bold === '1',
  }
}

/** Is the click on something with its own click already (a command or web link)? */
export function hasOwnClick(el: Element | null): boolean {
  return !!el?.closest('.cmd-link, .url-link, .contact-name--clickable')
}

// Did this click just end a text selection? GameWindow's mouseup copies a
// selection and CLEARS it before `click` fires, so asking getSelection() in the
// click always said no, and dragging within a linked name opened its menu as well
// as copying it (B582). mouseup records the moment instead.
let selectionEndedAt = 0
const SELECTION_CLICK_MS = 300
export function noteSelectionEnded(): void { selectionEndedAt = Date.now() }
export function selectionJustEnded(): boolean {
  return !!window.getSelection()?.toString() || Date.now() - selectionEndedAt < SELECTION_CLICK_MS
}

// INFERRED from lich-5 (origin/main 89fa0fd7) spec/fixtures MANIFEST + the DR
// fixtures, B547: a player's exist id is "-1" followed by the 7-digit
// zero-padded playerID, so |id| >= 10,000,000 (e.g. -10700002). Smaller
// NEGATIVE ids are fixed features — -851 an ebony door, -11031/-11032 the
// moons from `look sky`, -23767 a crack in an ice wall, -42998 a steep trail,
// -42696 a "globe of lightning" in combat text. Positive 9-digit ids are
// instanced items (198582900 a box, 196503075 a lootsack); shorter positive
// ids are features too (61479 a signpost, 34336 "construction around the base
// of the tree"). Creatures are the bold links. Before this a door opened the
// PLAYER menu and offered "Add as a contact" named "door". The thresholds are
// unverified beyond those fixtures; a wrong guess costs a Get on a signpost
// (the game refuses it) or a Look-only menu on an item.
//
// B603: real sessions have 8-digit item ids, not the fixtures' 9 digits: 4,460
// distinct ids in four 2026-11-01 captures against none of 9 digits. Fixed
// features there are 5 or 6 digits, so 7 or more means an instanced thing.
const PLAYER_ID_MIN = 10_000_000
const INSTANCED_ITEM_ID_RE = /^\d{7,}$/

export function linkKind(l: GameLink): GameLinkKind {
  // A bold link with a small negative id is a named NPC, not a fixed feature
  // (Guildleader Salvur, -30311, in an Empath's `perc` list, 2026-11-01).
  if (l.id.startsWith('-')) return Math.abs(Number(l.id)) >= PLAYER_ID_MIN ? 'player' : l.bold ? 'creature' : 'feature'
  if (l.bold) return 'creature'
  return INSTANCED_ITEM_ID_RE.test(l.id) ? 'object' : 'feature'
}

// A link's text can be a pronoun standing for the thing (`noun="moradu">it</a>`,
// DR rich reference §2.3); the menu then names it by its noun instead.
const PRONOUN_RE = /^(?:it|its|he|him|his|she|her|hers|they|them|their|theirs)$/i

/** The name a menu shows for a link. */
export function linkLabel(l: GameLink): string {
  const text = l.text.replace(/\s+/g, ' ').trim()
  if (!text || PRONOUN_RE.test(text)) return l.noun || text || 'it'
  return text
}

export interface GameLinkActions {
  /** Send a command as if the player typed it (echo + log). */
  send(cmd: string): void
  /** Start `say @Name ` / `whisper Name ` in the command bar (types only). */
  direct?(verb: 'say' | 'whisper', name: string): void
  /** Open this player's contact card, if they are a contact. Returns false if not. */
  openContact?(name: string, x: number, y: number): boolean
  /** Does the player have this name as a contact? (View contact vs Add as a contact) */
  isContact?(name: string): boolean
  /** Add this player as a contact (no template) and open their card. */
  addContact?(name: string, x: number, y: number): void
  /** Open this player's contact in the Contacts editor. */
  editContact?(name: string): void
  /** Delete this player's contact, after asking. */
  deleteContact?(name: string): void
  /** The character's guild, if known (Touch is an empath's). */
  guild?: string
}

/** The actions for one link. */
export function buildLinkMenu(l: GameLink, a: GameLinkActions, at: { x: number; y: number }): CtxItem[] {
  const kind = linkKind(l)
  const target = `#${l.id}`
  const items: CtxItem[] = []
  if (kind === 'player') {
    // A player's noun is their name; the text may be a pronoun or carry a title.
    return buildPlayerMenu(l.noun || linkLabel(l), l.id, a, at)
  }
  const label = linkLabel(l)
  items.push({ label: `Look at ${label}`, onClick: () => a.send(`look ${target}`) })
  if (kind === 'creature') {
    items.push({ label: `Face ${label}`, onClick: () => a.send(`face ${target}`) })
  } else if (kind === 'object') {
    items.push({ label: `Get ${label}`, onClick: () => a.send(`get ${target}`) })
  }
  // A feature (door, sign, trail, moon) gets Look only.
  return items
}

/**
 * The menu for a player: the game actions first (Touch for an empath, Say to,
 * Whisper to, Look), then, below a divider, the contact items or Add as a contact
 * (Sekmeht, 2026-10-29: "the default behavior from the game trumps
 * everything"). `id` is the game's id when the name was a link; without one
 * (an unlinked contact's name on a rich session) Look targets the name.
 * A contact gets View contact card, Edit contact and Delete contact…, which asks first ("Delete", not
 * "Remove", per the words guide: the contact is gone, not put aside).
 */
export function buildPlayerMenu(
  name: string,
  id: string | undefined,
  a: GameLinkActions,
  at: { x: number; y: number },
  opts: { present?: boolean } = {},
): CtxItem[] {
  // Touch and Look need the person in the room. A LINKED name (an id) was
  // put in a line we are reading by the game, so they are offered as before;
  // for an UNLINKED contact's name (a thought, an LNet line) the caller says
  // whether the room's player list has them (B554), the same gate the Tableau
  // applies. Say to / Whisper to work at a distance and always show.
  const present = opts.present ?? true
  const items: CtxItem[] = []
  if (present && /^empaths?$/i.test((a.guild ?? '').trim())) {
    items.push({ label: `Touch ${name}`, onClick: () => a.send(`touch ${name}`) })
    items.push({ label: null })
  }
  if (a.direct) {
    items.push({ label: `Say to ${name}…`, onClick: () => a.direct!('say', name) })
    items.push({ label: `Whisper to ${name}…`, onClick: () => a.direct!('whisper', name) })
  }
  if (present) items.push({ label: `Look at ${name}`, onClick: () => a.send(`look ${id ? `#${id}` : name}`) })
  if (a.isContact?.(name)) {
    const own: CtxItem[] = []
    if (a.openContact) own.push({ label: 'View contact card', onClick: () => { a.openContact!(name, at.x, at.y) } })
    if (a.editContact) own.push({ label: 'Edit contact', onClick: () => a.editContact!(name) })
    if (a.deleteContact) own.push({ label: 'Delete contact…', onClick: () => a.deleteContact!(name) })
    if (own.length) items.push({ label: null }, ...own)
  } else if (a.addContact) {
    items.push({ label: null })
    items.push({ label: 'Add as a contact', onClick: () => a.addContact!(name, at.x, at.y) })
  }
  return items
}

/**
 * Menu items for the link under an element, or [] when there is none.
 * Provided by GameWindow; null outside one (a surface then offers no link menu).
 */
export type GameLinkMenu = (el: Element | null, x: number, y: number) => CtxItem[]
export const GameLinkContext = createContext<GameLinkMenu | null>(null)
