// Slash-command completion palette (DESIGN.md §37.3) — rendered while the
// command bar holds a `/`-leading line. Two modes:
//   COMMAND LIST — filtered registry entries; ↑/↓ select, Tab/click complete.
//   ARGUMENT HINT — signature + description + example + live validation for the
//                   resolved command, plus a live style preview for highlights.
// Enter is NEVER consumed here — it submits the input as typed (predictable for
// muscle-memory users); Tab is the completion key. Esc dismisses until the
// input changes.
//
// Portaled to document.body and positioned above the input so it works
// identically in Static Panels and in a floating command window (§33); z-index
// sits above the WindowLayer (60) / ExperienceLayer (61) and app overlays.
// Font sizing: portaled popovers can't inherit the game-font anchor, so it
// uses var(--game-font-size) directly (CLAUDE.md pitfall #45b).

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { SLASH_COMMANDS, parseSlash, resolveColor, signatureOf, type SlashCommandSpec } from '../slashCommands'
import { CURATED_COLORS, loadCustomColors, activeCustomColors, contrastBackingFor } from '../colors'
import { buildSubstituteRegex, type SubstituteRule } from '../substitutes'
import '../styles/slash-palette.css'

export interface SlashPaletteHandle {
  /** Returns true when the key was consumed (caller should not process it). */
  handleKey(e: React.KeyboardEvent<HTMLInputElement>): boolean
}

// Live per-character data the palette can offer as VALUE completions (Phase 2;
// Phase 3 added modes/groups/themes/streams). The registry stays pure — this
// rides in as a prop from GameWindow. Theme entries are IDS (unique — two
// built-ins can share a display name, pitfall #35).
export interface SlashLiveData {
  templateNames: string[]
  modeNames: string[]
  groupNames: string[]
  themeIds: string[]
  openableStreams: string[]
  openPanels: string[]
}

interface Props {
  input: string                       // current command-bar value (starts with '/')
  anchor: HTMLInputElement | null
  live?: SlashLiveData
  onComplete: (text: string) => void  // replace the input with a completion
  onDismiss: () => void
}

interface Entry {
  key: string
  insert: string
  label: string
  description: string
  nouns: string[]     // noun + aliases, lowercased
  verb: string        // '' for noun-only commands
  descLower: string
}

// How many value chips a row shows. Shared by the builder and the renderer, so
// a list built to fit the row can't be cut by a different number (pitfall #124).
const CHIP_CAP = 24

const ENTRIES: Entry[] = SLASH_COMMANDS.map(c => {
  const label = c.verb ? `/${c.noun} ${c.verb}` : `/${c.noun}`
  return {
    key: label,
    insert: `${label} `,
    label,
    description: c.description,
    nouns: [c.noun, ...c.nounAliases].map(n => n.toLowerCase()),
    verb: c.verb.toLowerCase(),
    descLower: c.description.toLowerCase(),
  }
})

// Rank an entry against the typed words. Tab completes WHAT THE USER WAS
// TYPING, so match QUALITY matters, not just presence: "/highlight l" must put
// `list` first (verb PREFIX), even though the letter "l" is also a substring of
// the noun "high·l·ight" (which is why every /highlight verb still matches —
// weakly). Every word must match somewhere or the entry is excluded (null).
function scoreEntry(e: Entry, words: string[]): number | null {
  let total = 0
  for (const w of words) {
    let s: number
    if (e.nouns.includes(w) || e.verb === w)       s = 100  // exact part
    else if (e.verb && e.verb.startsWith(w))       s = 80   // verb prefix — the "/highlight l" case
    else if (e.nouns.some(n => n.startsWith(w)))   s = 60   // noun prefix
    else if (e.verb && e.verb.includes(w))         s = 30
    else if (e.nouns.some(n => n.includes(w)))     s = 20
    else if (e.descLower.includes(w))              s = 10
    else return null
    total += s
  }
  return total
}

// Nouns that have at least one VERB-bearing entry. For these, the palette must
// NOT commit to the noun's bare (verb '') form on `noun ` — otherwise typing
// `/ai ` (or `/colors `) jumps straight to argument-hint mode and the verbs
// (on/off/catchup, add/remove/list) never list or Tab-complete, unlike
// verb-only nouns such as /trigger. Keep listing the verbs; the parser's
// findCommand still RUNS the bare form on Enter, so `/ai`→status is unchanged.
// (All such nouns today — ai, colors, simucoin — have a NO-ARG bare form, so
// suppressing the bare commit never hides an argument hint.)
const NOUNS_WITH_VERBS = new Set<string>()
for (const c of SLASH_COMMANDS) {
  if (c.verb) for (const n of [c.noun, ...c.nounAliases]) NOUNS_WITH_VERBS.add(n.toLowerCase())
}

// The command the input has committed to (noun+verb typed and followed by a
// space), or null while the user is still picking → list mode.
function resolveCommand(body: string): SlashCommandSpec | null {
  const lower = body.toLowerCase()
  let best: SlashCommandSpec | null = null
  let bestLen = 0
  for (const c of SLASH_COMMANDS) {
    for (const n of [c.noun, ...c.nounAliases]) {
      // Don't commit to a bare form whose noun also has verbs — stay in list
      // mode so the verbs rank + Tab-complete (see NOUNS_WITH_VERBS above).
      if (!c.verb && NOUNS_WITH_VERBS.has(n)) continue
      const prefix = c.verb ? `${n} ${c.verb}` : n
      if ((lower.startsWith(prefix + ' ')) && prefix.length > bestLen) {
        best = c; bestLen = prefix.length
      }
    }
  }
  return best
}

const SlashPalette = forwardRef<SlashPaletteHandle, Props>(function SlashPalette(
  { input, anchor, live, onComplete, onDismiss }, ref,
) {
  const body = input.replace(/^\//, '')
  const cmd = useMemo(() => resolveCommand(body), [body])

  // ── Command-list mode data ─────────────────────────────────────────────
  // Scored + sorted best-first (stable sort keeps registry order on ties), so
  // selection index 0 — what Tab completes — is always the best match.
  const filtered = useMemo(() => {
    if (cmd) return []
    const words = body.toLowerCase().split(/\s+/).filter(Boolean)
    return ENTRIES
      .map(e => ({ e, score: scoreEntry(e, words) }))
      .filter((x): x is { e: Entry; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map(x => x.e)
  }, [body, cmd])

  // Selection resets to the TOP (best) match on every edit — a persisted index
  // from a previous keystroke would make Tab complete something stale.
  const [sel, setSel] = useState(0)
  useEffect(() => { setSel(0) }, [body])

  // ── Argument-hint mode data ────────────────────────────────────────────
  const parse = useMemo(() => (cmd ? parseSlash(input) : null), [cmd, input])
  const validation = parse?.error ?? null
  // "Missing X" while mid-typing is guidance, not failure — style it neutrally.
  const validationIsSoft = !!validation && validation.startsWith('Missing')

  // Live preview — sample line rendered in the parsed style, before commit.
  // /highlight add: the pattern in its color/bg/bold/glow inside a game-ish
  // sentence. /template add: the tag + a sample name styled as the template.
  const preview = useMemo((): React.ReactNode | null => {
    if (!parse?.parsed || !cmd) return null
    if (cmd.noun === 'highlight' && cmd.verb === 'add') {
      const [pattern, colorTok] = parse.parsed.args
      const color = (colorTok && resolveColor(colorTok)) || '#e8c840'
      const bg = parse.parsed.options.bg ? resolveColor(parse.parsed.options.bg) : null
      const style: React.CSSProperties = {
        color,
        ...(bg ? { backgroundColor: bg } : {}),
        ...(parse.parsed.flags.has('bold') ? { fontWeight: 700 } : {}),
        ...(parse.parsed.flags.has('glow') ? { textShadow: `0 0 6px ${color}` } : {}),
      }
      return <>You also see <span style={style}>{pattern || 'sample text'}</span> lying on the ground.</>
    }
    if (cmd.noun === 'template' && cmd.verb === 'add') {
      const colorTok = parse.parsed.args[1]
      const color = (colorTok && resolveColor(colorTok)) || '#C8C8C8'
      const bg = parse.parsed.options.bg ? resolveColor(parse.parsed.options.bg) : null
      const tag = parse.parsed.options.tag
      const nameStyle: React.CSSProperties = {
        color,
        ...(bg ? { backgroundColor: bg } : {}),
        ...(parse.parsed.flags.has('bold') ? { fontWeight: 700 } : {}),
      }
      return <>{tag && <span style={{ color }}>{tag}{' '}</span>}<span style={nameStyle}>Bob</span> just arrived.</>
    }
    // Phase 2: /sub add — before → after, via the REAL buildSubstituteRegex.
    // Only for text/phrase modes (the pattern itself is the sample); a regex
    // pattern has no synthesizable sample text, so no preview there.
    if (cmd.noun === 'sub' && cmd.verb === 'add') {
      const [pattern, replacement] = parse.parsed.args
      const mode = (parse.parsed.options.mode as SubstituteRule['mode']) ?? 'phrase'
      if (!pattern || replacement === undefined || mode === 'regex') return null
      const rule: SubstituteRule = {
        id: '', name: '', enabled: true, pattern, mode,
        caseSensitive: parse.parsed.options.case === 'on',
        replacement, groupIds: [], allGroups: true,
      }
      const regex = buildSubstituteRegex(rule)
      if (!regex) return null
      const after = pattern.replace(regex, replacement)
      return <>“{pattern}” → “{after === '' ? <em>(removed)</em> : after}”</>
    }
    return null
  }, [cmd, parse])

  // Value completion (Phase 2 templates; Phase 3 modes/groups/panels/themes;
  // colors): when the resolved command's next slot wants a name the character
  // actually HAS, offer the real values as click-to-fill chips. Color chips
  // carry their color so the picker doubles as a swatch row.
  const valueChips = useMemo((): { label: string; values: { v: string; color?: string }[] } | null => {
    if (!cmd || !parse?.parsed || !live) return null
    const p = parse.parsed
    const slotOpen = p.args[0] === undefined
    const plain = (vs: string[]) => vs.map(v => ({ v }))
    // A color slot is next → curated + custom names, each drawn in its color.
    const nextArg = cmd.args[p.args.length]
    if (nextArg?.kind === 'color') {
      // Yours first: those are the ones that stay LINKED (F115). Removed
      // (retired) colors aren't offered.
      const yours = activeCustomColors(loadCustomColors()).map(c => ({ v: c.name, color: c.hex }))
      const builtIns = Object.entries(CURATED_COLORS).filter(([n]) => n !== 'grey').map(([n, hex]) => ({ v: n, color: hex }))
      // The chip row is capped when it renders, so a big palette would push the
      // built-ins off the end entirely and `red` would stop being offered.
      // Keep yours in front, but never at the cost of all of them.
      const yoursRoom = Math.max(6, CHIP_CAP - builtIns.length)
      const values = [...yours.slice(0, yoursRoom), ...builtIns]
      return { label: 'Colors (/colors for more):', values }
    }
    if (cmd.noun === 'contact' && cmd.verb === 'add' && p.args[0] && p.args[1] === undefined && !p.options.template && live.templateNames.length)
      return { label: 'Your templates:', values: plain(live.templateNames) }
    if (cmd.noun === 'template' && cmd.verb === 'remove' && slotOpen && live.templateNames.length)
      return { label: 'Your templates:', values: plain(live.templateNames) }
    if (cmd.noun === 'mode' && slotOpen && live.modeNames.length)
      return { label: 'Your modes:', values: plain([...live.modeNames, 'none']) }
    if (cmd.noun === 'group' && (cmd.verb === 'on' || cmd.verb === 'off') && slotOpen && live.groupNames.length)
      return { label: 'Your groups:', values: plain(live.groupNames) }
    if (cmd.noun === 'panel' && cmd.verb === 'open' && slotOpen && live.openableStreams.length)
      return { label: 'Streams:', values: plain(live.openableStreams) }
    if (cmd.noun === 'panel' && cmd.verb === 'close' && slotOpen && live.openPanels.length)
      return { label: 'Open panels:', values: plain(live.openPanels) }
    if (cmd.noun === 'theme' && slotOpen && live.themeIds.length)
      return { label: 'Themes:', values: plain(live.themeIds) }
    return null
  }, [cmd, parse, live])

  const fillValue = (name: string) => {
    const quoted = /\s/.test(name) ? `"${name}"` : name
    onComplete(`${input.replace(/\s+$/, '')} ${quoted} `)
  }

  useImperativeHandle(ref, () => ({
    handleKey(e) {
      // B349: keys during IME composition belong to the input method.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return false
      if (e.key === 'Escape') { onDismiss(); return true }
      if (!cmd && filtered.length > 0) {
        if (e.key === 'ArrowDown') { setSel(s => (s + 1) % filtered.length); return true }
        if (e.key === 'ArrowUp')   { setSel(s => (s - 1 + filtered.length) % filtered.length); return true }
        if (e.key === 'Tab') { onComplete(filtered[Math.min(sel, filtered.length - 1)].insert); return true }
      }
      return false
    },
  }), [cmd, filtered, sel, onComplete, onDismiss])

  if (!anchor) return null
  const rect = anchor.getBoundingClientRect()
  if (rect.width === 0) return null // hidden tab (pitfall #24) — don't paint garbage
  // B332: clamp into the viewport. Horizontally the palette used to trust
  // rect.left and could run off the right edge; vertically it always opened
  // UP, so a command bar near the top of the screen (a floating command
  // window, §33) left it no room. Open up when there's reasonable room above
  // (or more than below), otherwise down — and cap the height either way.
  const MARGIN = 8, GAP = 6
  const width = Math.min(560, Math.max(260, rect.width), window.innerWidth - 2 * MARGIN)
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
  const spaceAbove = rect.top - GAP - MARGIN
  const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN
  const openUp = spaceAbove >= 160 || spaceAbove >= spaceBelow
  const style: React.CSSProperties = openUp
    ? { left, width, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.max(0, spaceAbove) }
    : { left, width, top: rect.bottom + GAP, maxHeight: Math.max(0, spaceBelow) }

  return createPortal(
    <div className="slash-palette" style={style} onMouseDown={e => e.preventDefault() /* keep input focus */}>
      {!cmd && (
        <>
          <div className="slash-palette-head">
            Client commands — <span className="slash-palette-hint">Tab completes · Enter runs · Esc closes · // sends a literal /</span>
          </div>
          {filtered.length === 0 && <div className="slash-palette-empty">No command matches — /help lists them.</div>}
          <div className="slash-palette-list">
            {filtered.map((e, i) => (
              <div
                key={e.key}
                className={`slash-palette-row${i === sel ? ' slash-palette-row--sel' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => onComplete(e.insert)}
              >
                <span className="slash-palette-cmd">{e.label}</span>
                <span className="slash-palette-desc">{e.description}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {cmd && (
        <div className="slash-palette-args">
          <div className="slash-palette-sig">{signatureOf(cmd)}</div>
          <div className="slash-palette-desc-line">{cmd.description} — e.g. <span className="slash-palette-example">{cmd.example}</span></div>
          {preview && <div className="slash-palette-preview">{preview}</div>}
          {valueChips && (
            <div className="slash-palette-chips">
              <span className="slash-palette-chips-label">{valueChips.label}</span>
              {valueChips.values.slice(0, CHIP_CAP).map(({ v, color }, i) => {
                // Theme contrast (pitfall #34 family): a chip drawn in its own
                // color can vanish against the popover surface — white on a
                // light theme, black on dark. Back just those chips neutrally.
                const backing = color ? contrastBackingFor(color, '--bg-raised') : null
                return (
                  <button
                    key={`${i}:${v}`} type="button" className="slash-palette-chip"
                    style={color ? { color, borderColor: color, ...(backing ? { background: backing } : {}) } : undefined}
                    onClick={() => fillValue(v)}
                  >{v}</button>
                )
              })}
            </div>
          )}
          {validation
            ? <div className={`slash-palette-valid${validationIsSoft ? '' : ' slash-palette-valid--err'}`}>{validation}</div>
            : <div className="slash-palette-valid slash-palette-valid--ok">✓ Enter to run</div>}
        </div>
      )}
    </div>,
    document.body,
  )
})

export default SlashPalette
