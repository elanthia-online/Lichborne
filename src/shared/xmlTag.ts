// xmlTag — where a StormFront tag ENDS (v0.20.5, from ProfanityFE #100).
//
// A tag ends at the first `>` OUTSIDE a quoted attribute value, so
// `<d cmd="look >here">` stays one tag instead of leaking `here">` into the game
// text. A quoted value can't contain a raw `<` (XML forbids it), which keeps a
// stray apostrophe from running on into the next tag; and a tag whose quotes
// don't balance (`<d cmd='get Nik's sword'>`) falls back to the old "first `>`"
// rule, so anything the old pattern read, this one reads the same way.
//
// The alternatives begin with different characters, so there is no
// catastrophic backtracking (Profanity timed a 33 KB worst-case line). They also
// found zero quoted `>` in 410k real Lich log lines, so this is a latent fix:
// real play should tokenize byte-for-byte as before.
//
// Shared by the parser's tokenizer, its glance-text hand check and the scene
// capturers' tag strip, so all three agree on where a tag ends.

export const TAG_PATTERN = `<(?:[^<>"']|"[^"<]*"|'[^'<]*')*>|<[^>]*>`

const TAG_RE_G = new RegExp(TAG_PATTERN, 'g')

/** Remove every tag from a raw line (entities are left for the caller). */
export function stripTags(raw: string): string {
  // `replace` with a /g regex starts from 0 and resets lastIndex, so sharing it is safe.
  return raw.replace(TAG_RE_G, '')
}
