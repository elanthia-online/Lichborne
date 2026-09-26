// Character status notifications (v0.20.0) — the toasts that say a character
// is in the game, has disconnected, or has reconnected, shown in whichever
// window the player is looking at.
//
// Main decides WHAT happened and WHERE (the focused window, once): see the
// "Character notices" block in main.ts, which also knows whether a disconnect
// was asked for. This module decides whether to SHOW it here and what it says:
//   - the app-wide setting (on by default),
//   - never about the character already on screen (you can see it),
//   - no "is in the game" while the Team Login panel is open and showing that
//     character's tile (it says READY there already).
// `characterNoticeToast` is pure, so the harness can pin every rule.
//
// Several of the same news at once — a network blip dropping every character —
// is ONE toast, not a pile: each notice carries a toast `key` per kind, and a
// notice arriving while that toast is still up MERGES into it (ToastHost). One
// character reads as before; two are named in the title; more are counted, and
// every character gets a coloured badge (their Tableau avatar colour) that is
// the way to them.
//
// APP-WIDE, like the command-history preference: `SharedProfile.characterNotices`
// → `_shared.yaml`, with a localStorage working copy read FRESH per notice, so a
// change applies at once in every window with no sync event.

import type { CharacterNotice } from '../shared/types'
import type { ToastOptions, ToastPerson } from './toasts'

const KEY = 'lichborne.characterNotices'

/** On unless the player turned it off. A missing or unreadable value is ON. */
export function loadCharacterNoticesEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== 'false' } catch { return true }
}

export function saveCharacterNoticesEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'true' : 'false') }
  catch (e) { console.error('[notices] setting write failed:', e) }
}

export interface NoticeContext {
  enabled: boolean
  /** The character on screen in THIS window (Session view), or null. */
  viewingId: string | null
  /** True when the Team Login panel is open with a tile for this character. */
  inOpenTeamPanel: boolean
}

/** One character in a notice toast. Carried in `ToastOptions.data` so the next
 *  notice of the same kind can merge into the toast still on screen. */
interface NoticeEntry { characterId: string; character: string; attach: boolean }
interface NoticeData { kind: CharacterNotice['kind']; entries: NoticeEntry[] }

/** Past this many, the title counts instead of naming (the badges still name). */
const NAME_IN_TITLE_MAX = 2

function joinNames(names: string[]): string {
  return names.length === 2 ? `${names[0]} and ${names[1]}` : names[0]
}

/** The shard from a characterId (account::character::game), upper-cased. */
function gameOf(characterId: string): string {
  const parts = characterId.split('::')
  return parts.length === 3 ? parts[2].toUpperCase() : ''
}

/** Display names, with the shard added only where two share a name (the same
 *  character on DR and DR Test). */
function displayNames(entries: NoticeEntry[]): string[] {
  const count = new Map<string, number>()
  for (const e of entries) count.set(e.character.toLowerCase(), (count.get(e.character.toLowerCase()) ?? 0) + 1)
  return entries.map(e => (count.get(e.character.toLowerCase())! > 1 && gameOf(e.characterId)
    ? `${e.character} (${gameOf(e.characterId)})` : e.character))
}

/** Build the toast for one or more characters with the same news. Pure, apart
 *  from the click handlers `goTo` supplies. */
export function noticeToastFor(
  kind: CharacterNotice['kind'],
  entries: NoticeEntry[],
  goTo?: (characterId: string) => () => void,
): ToastOptions {
  const names = displayNames(entries)
  const who = names.length <= NAME_IN_TITLE_MAX ? joinNames(names) : `${names.length} characters`
  const plural = names.length > 1
  const data: NoticeData = { kind, entries }
  const base = {
    key: `character-notice:${kind}`,
    data,
    merge: (prev: ToastOptions) => {
      const d = prev.data as NoticeData | undefined
      const prior = d && d.kind === kind ? d.entries : []
      // One entry per character. A character already on the toast keeps its
      // PLACE (moving it would re-order the badges and drop keyboard focus
      // from one); only its details update. New ones go at the end.
      const merged = prior.map(p => entries.find(e => e.characterId === p.characterId) ?? p)
      for (const e of entries) if (!prior.some(p => p.characterId === e.characterId)) merged.push(e)
      return noticeToastFor(kind, merged, goTo)
    },
    // Clicking one character's badge goes to them and leaves the others.
    withoutPerson: (p: ToastPerson) => {
      const rest = entries.filter(e => e.characterId !== p.characterId)
      return rest.length ? noticeToastFor(kind, rest, goTo) : null
    },
  }

  if (!plural) {
    const e = entries[0]
    // The message says what to DO; the hover says where it goes.
    const go = `Click to go to ${e.character}`
    const hint = `Switches to ${e.character}'s tab, bringing its window forward if it's in another one`
    const one = {
      ...base,
      people: [{ name: e.character, characterId: e.characterId }],
      clickHint: hint,
      ...(goTo ? { onClick: goTo(e.characterId) } : {}),
    }
    switch (kind) {
      case 'ready':
        return { ...one, kind: 'success', title: `${e.character} is in the game`, message: `${go}.` }
      case 'reconnected':
        return { ...one, kind: 'success', title: `${e.character} reconnected`, message: `${go}.` }
      case 'dropped':
        return {
          ...one,
          kind: 'error',
          title: `${e.character} disconnected`,
          message: e.attach
            ? `The connection dropped. Lichborne is re-attaching on its own. ${go}.`
            : `The connection dropped. ${go} and reconnect.`,
        }
    }
  }

  // Several at once: ONE toast, a badge per character, each badge the way there.
  const shown = displayNames(entries)
  const many = {
    ...base,
    people: entries.map((e, i) => ({
      name: e.character,
      ...(shown[i] !== e.character ? { label: shown[i] } : {}),
      characterId: e.characterId,
      title: `Go to ${shown[i]}`,
      ...(goTo ? { onClick: goTo(e.characterId) } : {}),
    })),
    clickHint: 'Click a name to go to that character, or anywhere else to dismiss',
  }
  switch (kind) {
    case 'ready':
      return { ...many, kind: 'success', title: `${who} are in the game`, message: 'Click a name to go there.' }
    case 'reconnected':
      return { ...many, kind: 'success', title: `${who} reconnected`, message: 'Click a name to go there.' }
    case 'dropped':
      return {
        ...many,
        kind: 'error',
        title: `${who} disconnected`,
        message: entries.every(e => e.attach)
          ? 'The connections dropped. Lichborne is re-attaching them on its own. Click a name to go there.'
          : 'The connections dropped. Click a name to go there and reconnect.',
      }
  }
}

export function characterNoticeToast(
  n: CharacterNotice,
  ctx: NoticeContext,
  goTo?: (characterId: string) => () => void,
): ToastOptions | null {
  if (!ctx.enabled) return null
  if (n.characterId === ctx.viewingId) return null
  if (n.kind === 'ready' && ctx.inOpenTeamPanel) return null
  return noticeToastFor(n.kind, [{ characterId: n.characterId, character: n.character, attach: !!n.attach }], goTo)
}

/** Take a character OFF a visible notice toast of `kind`, if one is showing —
 *  never raises one. Used when newer news supersedes it: a character that
 *  reconnects must stop being listed as "disconnected". The toast is dismissed
 *  if that was the only character on it. */
export function withdrawNotice(
  kind: CharacterNotice['kind'],
  characterId: string,
  goTo?: (characterId: string) => () => void,
): ToastOptions {
  return {
    key: `character-notice:${kind}`,
    onlyIfShown: true,
    message: ' ',
    merge: (prev: ToastOptions) => {
      const d = prev.data as NoticeData | undefined
      if (!d || d.kind !== kind) return prev
      const rest = d.entries.filter(e => e.characterId !== characterId)
      if (rest.length === d.entries.length) return prev
      return rest.length ? noticeToastFor(kind, rest, goTo) : null
    },
  }
}

/** The kinds that a notice of `kind` makes stale. */
export function supersededBy(kind: CharacterNotice['kind']): CharacterNotice['kind'][] {
  return kind === 'dropped' ? ['ready', 'reconnected'] : ['dropped']
}
