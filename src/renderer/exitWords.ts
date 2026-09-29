// Exit words — the compass token → full direction WORD map.
//
// One table for every surface that turns a compass token into a command: the
// Room panel's clickable exits line and the floating compass (v0.20.1). The
// full word is what gets SENT, because it is always a valid DR command and the
// raw token isn't (`dn` does nothing; `down` walks). Also the display text.

export const DIR_WORDS: Record<string, string> = {
  n:   'north',
  ne:  'northeast',
  e:   'east',
  se:  'southeast',
  s:   'south',
  sw:  'southwest',
  w:   'west',
  nw:  'northwest',
  up:  'up',
  dn:  'down',
  out: 'out',
}
