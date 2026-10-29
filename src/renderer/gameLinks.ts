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

export type GameLinkKind = 'player' | 'creature' | 'object'

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

export function linkKind(l: GameLink): GameLinkKind {
  if (l.id.startsWith('-')) return 'player'
  return l.bold ? 'creature' : 'object'
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
  /** Does the player have this name as a contact? (decides the Contact card item) */
  isContact?(name: string): boolean
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
    const name = l.noun || linkLabel(l)
    if (/^empaths?$/i.test((a.guild ?? '').trim())) {
      items.push({ label: `Touch ${name}`, onClick: () => a.send(`touch ${name}`) })
      items.push({ label: null })
    }
    if (a.direct) {
      items.push({ label: `Say to ${name}…`, onClick: () => a.direct!('say', name) })
      items.push({ label: `Whisper to ${name}…`, onClick: () => a.direct!('whisper', name) })
    }
    items.push({ label: `Look at ${name}`, onClick: () => a.send(`look ${target}`) })
    if (a.openContact && a.isContact?.(name)) {
      items.push({ label: null })
      items.push({ label: 'Contact card', onClick: () => { a.openContact!(name, at.x, at.y) } })
    }
    return items
  }
  const label = linkLabel(l)
  items.push({ label: `Look at ${label}`, onClick: () => a.send(`look ${target}`) })
  if (kind === 'creature') {
    items.push({ label: `Face ${label}`, onClick: () => a.send(`face ${target}`) })
  } else {
    items.push({ label: `Get ${label}`, onClick: () => a.send(`get ${target}`) })
  }
  return items
}

/**
 * Menu items for the link under an element, or [] when there is none.
 * Provided by GameWindow; null outside one (a surface then offers no link menu).
 */
export type GameLinkMenu = (el: Element | null, x: number, y: number) => CtxItem[]
export const GameLinkContext = createContext<GameLinkMenu | null>(null)
