// directedLine — what the command bar holds after choosing "Say to…" or
// "Whisper to…" on a player in the Living Tableau (v0.20.1, subkermorianranger
// and Sekmeht). Pure, so the rules are harnessable.
//
// DR's own `SAY` help (captured in-game, v0.20.1):
//   SAY @PERSON message              directed to PERSON
//   SAY /EMOTE @PERSON message       … with emotion
//   SAY @PERSON /EMOTE message       … the same, either order
//   SAY, ' and " are interchangeable.
// and WHISPER is `whisper PERSON message`.
//
// Whatever is already in the bar is read for its MESSAGE, so nothing typed is
// lost and the choice can be changed freely:
// - An empty bar becomes `say @Name ` / `whisper Name `, caret at the end.
// - A say line (`say`, `'` or `"`, with or without a /emote and an @target, in
//   either order) or a whisper line gives up its message; picking Say again
//   keeps the say line's own verb and emote, and swaps the target. `/setemote`
//   and `/help` are SAY's own sub-commands, not emotes, so a line using them
//   is treated as ordinary text.
// - A whisper has no emote, so turning a say-with-emote into a whisper drops
//   the emote and keeps the words.
// - Anything else already typed is kept as the message: type first, then pick
//   who to say it to.

export type DirectedVerb = 'say' | 'whisper'

type Parsed =
  | { kind: 'say'; verb: string; emote: string; message: string }
  | { kind: 'whisper'; message: string }
  | { kind: 'text'; message: string }

function parseLine(current: string): Parsed {
  const w = current.match(/^\s*whisper\b\s*(.*)$/is)
  if (w) {
    // The first word is the target; everything after it is the message.
    const t = w[1].match(/^\S+\s?(.*)$/s)
    return { kind: 'whisper', message: t ? t[1] : '' }
  }
  const m = current.match(/^\s*(say\b|'|")\s*(.*)$/is)
  if (!m || /^\/(setemote|help)\b/i.test(m[2])) return { kind: 'text', message: current.trim() }
  const verb = m[1] === "'" || m[1] === '"' ? m[1] : 'say'
  let rest = m[2]
  let emote = ''
  let target = false
  // At most one /emote and one @target lead the message, in either order.
  for (;;) {
    const t = rest.match(/^(@\S+|\/(?!setemote\b|help\b)\S+)(?:\s+|$)/i)
    if (!t) break
    const isEmote = t[1].startsWith('/')
    if (isEmote ? emote : target) break
    if (isEmote) emote = t[1]
    else target = true
    rest = rest.slice(t[0].length)
  }
  return { kind: 'say', verb, emote, message: rest }
}

export function directedLine(current: string, verb: DirectedVerb, name: string): string {
  const p = parseLine(current)
  if (verb === 'whisper') return `whisper ${name} ${p.message}`
  if (p.kind === 'say') return `${p.verb} @${name} ${p.emote ? `${p.emote} ` : ''}${p.message}`
  return `say @${name} ${p.message}`
}

/** `directedLine(current, 'say', name)` — kept for the harness's say cases. */
export const sayToLine = (current: string, name: string) => directedLine(current, 'say', name)
