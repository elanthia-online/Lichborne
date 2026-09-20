// Highlight + contact compositor — the full-fat segment renderer behind the main
// window (TextLineRow), the Room panel's prose sections, and the Highlights
// editor's Preview.
//
// Exports, in pipeline order:
//   • `renderHighlightedLine` — the entry point for a whole line: resolves the
//     line layer, runs the match scan once, and renders every segment. The
//     three callers above all go through it, so the Preview cannot drift from
//     the game window (it used to be a separate copy, and showed line-scope
//     effects and bold that the game never painted — B428).
//   • `resolveLineLayer` — the LINE-scope rule for a line (first match wins).
//     It is the WIDEST layer of the compositing, not a separate style: its
//     background, colour and bold go on the line container, and its effect
//     paints every run no match-scope rule gives an effect of its own.
//   • `computeLineMatchRanges` (B172) — ONE scan of the whole line for contact
//     names + match-scope highlight rules (each rule pre-gated on its
//     `fastLower` literal before the regex runs), returning ranges in LINE
//     coordinates so a multi-segment line pays the ruleset once, not once per
//     segment.
//   • `renderSegmentFull` — intersects those ranges with this segment's window
//     (B115: matching is line-wide, so a rule can cross the segment boundaries
//     DR's XML fragments a line into), then resolves each non-overlapping run:
//     contacts outrank highlights (B116); among highlights it is SPECIFICITY +
//     PER-PROPERTY COMPOSITING (v0.11.3, ProfanityFE's model) — text colour,
//     background, bold and effect are each taken independently from the
//     SMALLEST covering highlight that sets that property, equal-length ties to
//     the first-encountered (top-of-list) rule, and the line layer as the last
//     fallback. Contact runs paint through `paintContactText` (the same builder
//     the Contacts previews use); plain runs fall back to `renderSegment`.
//
// Invariants: keep the run-merge `key` in sync with the composited properties
// (adjacent runs merge only when the key matches); every `exec` loop guards
// zero-width matches by bumping `lastIndex`; any caller rendering a
// multi-segment line must pass precomputed ranges or it re-runs the scan per
// segment (the pre-B172 cost); and a line effect goes on an element INSIDE the
// segment's own, never on the line container (see `renderPlainRun`).
import type { TextSegment, LineStyleHint } from '../../shared/types'
import type { Contact, ContactTemplate } from '../contacts'
import type { CompiledRule } from '../HighlightsContext'
import type { HighlightStyle, HighlightEffect } from '../highlights'
import { effectiveEffect, HIGHLIGHT_EFFECTS, FX_HORIZONTAL_GRADIENT } from '../highlights'
import { resolveEffect, effectContent, type ResolvedEffect } from './highlightEffects'
import { paintContactText } from './contactStyle'
import { renderSegment } from './renderSegment'

export type MatchRange =
  | { start: number; end: number; kind: 'contact'; contact: Contact; template: ContactTemplate | null }
  | { start: number; end: number; kind: 'highlight'; compiled: CompiledRule }

// The LINE-scope rule that won a line, resolved once per line.
export interface LineLayer {
  style: HighlightStyle
  /** Text colour that beats preset/fg colours; undefined when the rule sets none. */
  color: string | undefined
  /** The rule's effect (legacy `glow` folded in), null for none. */
  effect: HighlightEffect | null
  fx: ResolvedEffect
  /**
   * The whole line's length in characters, set ONLY when the line is split into
   * runs (B444). It is what lets each run offset into one line-wide gradient
   * instead of getting its own copy.
   */
  lineLen?: number
}

/**
 * The CSS vars that make a run's gradient a window onto the LINE's gradient
 * rather than its own (B444). Empty for everything else, and an empty object
 * means the CSS falls back to the original per-element geometry.
 */
function lineGradientVars(
  effect: HighlightEffect | null,
  lineLen: number | undefined,
  lineStart: number,
): React.CSSProperties {
  if (!lineLen || !effect || !FX_HORIZONTAL_GRADIENT.has(effect)) return {}
  const w = `${lineLen * 2}ch`
  return { '--fx-bg-size': `${w} auto`, '--fx-bg-x': `${-lineStart}ch`, '--fx-sweep-to': w } as React.CSSProperties
}

// First matching line rule wins (unchanged from the old getLineHighlightStyle).
// Matching runs against the JOINED line text, which is why callers join once.
export function resolveLineLayer(lineText: string, lineRules: CompiledRule[]): LineLayer | null {
  if (lineRules.length === 0) return null
  const lower = lineText.toLowerCase()
  for (const compiled of lineRules) {
    if (compiled.fastLower !== null && !lower.includes(compiled.fastLower)) continue
    compiled.regex.lastIndex = 0
    if (!compiled.regex.test(lineText)) continue
    const style = compiled.rule.style
    const color = style.textColor && style.textColor !== 'transparent' ? style.textColor : undefined
    const e = effectiveEffect(style)
    const effect = e === 'none' ? null : e
    return { style, color, effect, fx: resolveEffect(effect, color ?? null, style.glowColor || null) }
  }
  return null
}

/**
 * The same layer, built from a CLIENT-authored style instead of a matched rule
 * (a trigger's echo, F118).
 *
 * This exists so an echo and a line-scope highlight are painted by ONE piece of
 * code rather than two that merely agree today (pitfall #127) — everything
 * below `resolveLineLayer` is shared verbatim, so an echo composites with a
 * word highlight exactly as a line rule does.
 *
 * `hint.effect` is a plain string on the shared type (main must not import the
 * renderer's union), so this is the ONE place it is narrowed. An unknown value
 * resolves to no effect rather than throwing — a hand-edited profile must not
 * be able to break a render.
 */
export function lineLayerFromHint(hint: LineStyleHint | undefined): LineLayer | null {
  if (!hint) return null
  const color = hint.color && hint.color !== 'transparent' ? hint.color : undefined
  const raw = hint.effect
  const effect = raw && raw !== 'none' && (HIGHLIGHT_EFFECTS as readonly { value: string }[])
    .some(o => o.value === raw) ? raw as HighlightEffect : null
  const style: HighlightStyle = {
    textColor: hint.color ?? 'transparent',
    bgColor: hint.bgColor ?? 'transparent',
    bold: !!hint.bold,
    glow: false,
    glowColor: hint.glowColor ?? '',
    ...(effect ? { effect } : {}),
  }
  // Nothing to paint — return null so the line takes the plain path and pays
  // none of the layer's cost (and so a line-scope RULE can still match it).
  const hasBg = !!hint.bgColor && hint.bgColor !== 'transparent'
  if (!color && !hasBg && !hint.bold && !effect) return null
  return { style, color, effect, fx: resolveEffect(effect, color ?? null, hint.glowColor || null) }
}

// What the line CONTAINER wears: background, colour and bold. The effect is
// deliberately absent — on the container it would reach inside every word
// highlight (an opacity pulse or a brightness filter can't be undone by a
// child) and clip the line's own background to the glyphs.
export function lineLayerStyle(line: LineLayer | null): React.CSSProperties | null {
  if (!line) return null
  const { style } = line
  return {
    ...(style.bgColor && style.bgColor !== 'transparent' ? { backgroundColor: style.bgColor } : {}),
    ...(line.color ? { color: line.color } : {}),
    ...(style.bold ? { fontWeight: 'var(--ui-bold-weight)' } : {}),
  }
}

// A run no match-scope highlight or contact covers. The segment keeps its own
// element (preset, links, bold, a preset background), the line colour beats
// its preset colour, and the line EFFECT rides an inner span. `lineStart` is
// the run's offset into the line, so a per-letter effect staggers along the
// whole line instead of restarting in every segment.
function renderPlainRun(
  seg: TextSegment,
  key: number,
  onSendCommand: ((cmd: string) => void) | undefined,
  autoLinkUrls: boolean,
  webLinkSafety: boolean,
  line: LineLayer | null | undefined,
  lineStart: number,
): React.ReactNode {
  if (!line?.effect || !seg.text) {
    return renderSegment(seg, key, onSendCommand, autoLinkUrls, webLinkSafety, line?.color)
  }
  const { fx } = line
  const inner = (
    <span
      className={fx.className || undefined}
      style={{
        ...fx.vars,
        ...(fx.glowShadow ? { textShadow: fx.glowShadow } : {}),
        ...lineGradientVars(line.effect, line.lineLen, lineStart),
      }}
    >{effectContent(seg.text, fx.perLetter, lineStart)}</span>
  )
  return renderSegment(seg, key, onSendCommand, autoLinkUrls, webLinkSafety, line.color, inner)
}

export interface HighlightedLineOptions {
  matchRules: CompiledRule[]
  lineRules: CompiledRule[]
  contacts: Contact[]
  templates: ContactTemplate[]
  nameRegex: RegExp | null
  onContactClick?: (id: string, x: number, y: number) => void
  onSendCommand?: (cmd: string) => void
  autoLinkUrls?: boolean
  webLinkSafety?: boolean
  /** Segment keys are `keyBase * 100 + index`; 0 keeps plain indices. */
  keyBase?: number
  /**
   * A client-authored line style (a trigger echo). When set it BECOMES the line
   * layer, in place of any line-scope rule that also matches: the echo was
   * written for this exact message, a line rule is generic. Word-scope
   * highlights and contacts still composite on top either way.
   */
  echo?: LineStyleHint
}

// Render one line's segments with every rule applied. Returns the container
// style (the caller owns the element — `.text-line`, a Room prose line, the
// Preview box) and the segment nodes.
//
// The expensive work happens ONCE per line: the joined text (B115 — DR
// fragments a line into 3-5 segments around names / links / bold, so a regex
// could never match a slice) and the contact + match-rule scan (B172). Each
// segment then only intersects the shared ranges.
export function renderHighlightedLine(
  segments: TextSegment[],
  o: HighlightedLineOptions,
): { style: React.CSSProperties | null; nodes: React.ReactNode[] } {
  const autoLinkUrls = o.autoLinkUrls ?? true
  const webLinkSafety = o.webLinkSafety ?? true
  const keyBase = o.keyBase ?? 0
  const hasExtras = !!o.nameRegex || o.matchRules.length > 0
  const lineText = hasExtras || o.lineRules.length > 0 ? segments.map(s => s.text).join('') : ''
  const line = lineLayerFromHint(o.echo) ?? resolveLineLayer(lineText, o.lineRules)
  // B443/B444: an echo used to be kept UNSPLIT so a painted effect wasn't cut
  // into pieces, each with its own gradient. B444 fixed that properly — every
  // run of a split line now offsets into ONE line-wide gradient — so the
  // suppression was dropped and echoes get word highlights and contacts back.
  const splitRuns = hasExtras
  // B444: a split line hands every run the same gradient geometry, so the
  // pieces read as one continuous effect. Only set while splitting — a whole
  // line needs nothing and must keep its original rendering.
  const layer = line && splitRuns ? { ...line, lineLen: lineText.length } : line
  const lineRanges = splitRuns
    ? computeLineMatchRanges(lineText, o.contacts, o.templates, o.nameRegex, o.matchRules)
    : []
  let cursor = 0
  const nodes = segments.map((seg, i) => {
    const key = keyBase * 100 + i
    const offset = cursor
    cursor += seg.text.length
    if (!splitRuns) return renderPlainRun(seg, key, o.onSendCommand, autoLinkUrls, webLinkSafety, layer, offset)
    return renderSegmentFull(
      seg, key, o.contacts, o.templates, o.nameRegex, o.matchRules,
      o.onContactClick, o.onSendCommand, autoLinkUrls, webLinkSafety,
      lineText, offset, lineRanges, layer,
    )
  })
  return { style: lineLayerStyle(layer), nodes }
}

// B172: the contact + match-rule scan over a full line, extracted so callers
// that render a MULTI-SEGMENT line (TextLineRow, RoomPanel sections) can run
// it ONCE per line and hand the ranges to each segment's renderSegmentFull
// call. Before this, renderSegmentFull re-ran every rule against the full
// lineText once PER SEGMENT (a B115 side effect — matching is line-wide but
// was invoked per segment), so a 4-segment line paid the whole ruleset 4×.
// Returns ranges in LINE coordinates.
export function computeLineMatchRanges(
  lineText: string,
  contacts: Contact[],
  templates: ContactTemplate[],
  nameRegex: RegExp | null,
  matchRules: CompiledRule[],
): MatchRange[] {
  const ranges: MatchRange[] = []
  if (!lineText) return ranges

  if (nameRegex) {
    nameRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = nameRegex.exec(lineText)) !== null) {
      if (m[0].length === 0) { nameRegex.lastIndex++; continue }
      const contact = contacts.find(c => c.name.toLowerCase() === m![0].toLowerCase()) ?? null
      if (contact) {
        const template = templates.find(t => t.id === contact.templateId) ?? null
        ranges.push({ start: m.index, end: m.index + m[0].length, kind: 'contact', contact, template })
      }
    }
  }

  const lineTextLower = lineText.toLowerCase()
  for (const compiled of matchRules) {
    if (compiled.fastLower !== null && !lineTextLower.includes(compiled.fastLower)) continue
    compiled.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = compiled.regex.exec(lineText)) !== null) {
      if (m[0].length === 0) { compiled.regex.lastIndex++; continue }
      ranges.push({ start: m.index, end: m.index + m[0].length, kind: 'highlight', compiled })
    }
  }

  return ranges
}

export function renderSegmentFull(
  seg: TextSegment,
  segKey: number,
  contacts: Contact[],
  templates: ContactTemplate[],
  nameRegex: RegExp | null,
  matchRules: CompiledRule[],
  onContactClick?: (id: string, x: number, y: number) => void,
  onSendCommand?: (cmd: string) => void,
  autoLinkUrls = true,
  webLinkSafety = true,
  // B115: when the line's full concatenated text and this segment's offset
  // into that text are provided, regex matching runs against the joined
  // line instead of just this segment. Matches are intersected with the
  // segment range and translated to segment-local offsets. This lets
  // match-scope highlights and contact regexes cross segment boundaries
  // (DR wraps player names in XML attributes that fragment a line into
  // 3+ segments, so `Your mind hears .*? thinking,` was failing to match
  // in the thoughts stream — every regex test ran against a tiny slice).
  // Backward compatible: callers that omit these args keep the original
  // per-segment behavior.
  lineText?: string,
  segOffset?: number,
  // B172: ranges precomputed ONCE for the whole line via
  // computeLineMatchRanges (line coordinates). When provided (with
  // lineText/segOffset), the per-segment scan is skipped entirely — each
  // segment just intersects the shared ranges with its own window.
  precomputedLineRanges?: MatchRange[],
  // The LINE-scope rule that won this line (resolveLineLayer). Its colour beats
  // preset/fg colours on runs no match rule covers (see renderSegment), and it
  // is the last fallback for every property the compositing below picks — so a
  // word highlight with its own effect keeps it, while the rest of the line
  // wears the line's effect.
  line?: LineLayer | null,
): React.ReactNode {
  const text = seg.text
  const lineMode = lineText !== undefined && segOffset !== undefined
  const offset = lineMode ? segOffset! : 0
  if (!text || (!nameRegex && matchRules.length === 0)) {
    return renderPlainRun(seg, segKey, onSendCommand, autoLinkUrls, webLinkSafety, line, offset)
  }
  const matchSource = lineMode ? lineText! : text

  // Scan (or reuse) line-coordinate ranges, then keep only those that
  // intersect this segment's window [offset, offset + text.length],
  // translated to segment-local coords. End-exclusive on both sides.
  const lineRanges = (lineMode && precomputedLineRanges)
    ? precomputedLineRanges
    : computeLineMatchRanges(matchSource, contacts, templates, nameRegex, matchRules)

  const ranges: MatchRange[] = []
  for (const r of lineRanges) {
    const segStart = Math.max(0, r.start - offset)
    const segEnd = Math.min(text.length, r.end - offset)
    if (segEnd > segStart) ranges.push({ ...r, start: segStart, end: segEnd })
  }

  if (ranges.length === 0) return renderPlainRun(seg, segKey, onSendCommand, autoLinkUrls, webLinkSafety, line, offset)

  // B116 (v0.8.5): priority-based overlay. The earlier algorithm sorted
  // ranges by start position with contacts winning ties, then dropped any
  // range overlapping a previously-selected one. That collapsed the
  // common case where a contact match starts at the SAME position as a
  // long highlight (e.g. contact "You" at the start of "Your mind hears
  // Balistrade thinking," highlight) — contact won the tie, and the
  // entire highlight was dropped, leaving the rest of the phrase plain
  // when it should still have been highlighted. The new algorithm
  // produces non-overlapping runs by collecting boundary positions and
  // picking the highest-priority range covering each gap: contacts beat
  // highlights, highlights beat plain text. Adjacent same-range pieces
  // are merged into single runs so the rendered DOM stays compact.
  const boundarySet = new Set<number>([0, text.length])
  for (const r of ranges) { boundarySet.add(r.start); boundarySet.add(r.end) }
  const boundaries = [...boundarySet].sort((a, b) => a - b)

  // Per gap, resolve the style. Contacts outrank highlights (B116). Among
  // highlights we follow ProfanityFE's model (v0.11.3): SPECIFICITY +
  // PER-PROPERTY COMPOSITING. Each visual property (text color / background /
  // bold / glow) is taken INDEPENDENTLY from the SMALLEST (most-specific)
  // covering highlight that SETS it — so a small word-highlight's color punches
  // through a broad phrase/line highlight while the phrase's background still
  // shows behind it, and a bold-only or bg-only highlight layers onto another's
  // fg. Chosen over Wrayth/Frostbite's bottom-of-list-wins because
  // specific-beats-general is a better default and doesn't force users to manage
  // list order at scale (see CLAUDE.md Automations — the cross-client research).
  // Within a property, equal-length ties go to the FIRST-encountered (top-of-
  // list) highlight — deterministic, vs Profanity's arbitrary unstable sort.
  type HlComposite = { kind: 'highlight'; textColor: string | null; bgColor: string | null; bold: boolean; glowColor: string | null; effect: HighlightEffect | null; fxFromLine: boolean }
  type ContactRun  = { kind: 'contact'; contact: Contact; template: ContactTemplate | null }
  type RunStyle = ContactRun | HlComposite | null
  type Run = { start: number; end: number; style: RunStyle; key: string }

  const runs: Run[] = []
  const covering: Extract<MatchRange, { kind: 'highlight' }>[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]
    const end = boundaries[i + 1]
    if (start === end) continue

    let contactHit: Extract<MatchRange, { kind: 'contact' }> | null = null
    covering.length = 0
    for (const r of ranges) {
      if (r.start <= start && r.end >= end) {
        if (r.kind === 'contact') { if (!contactHit) contactHit = r }
        else covering.push(r)
      }
    }

    let style: RunStyle
    let key: string
    if (contactHit) {
      style = { kind: 'contact', contact: contactHit.contact, template: contactHit.template }
      key = `c:${contactHit.contact.id}:${contactHit.template?.id ?? ''}`
    } else if (covering.length > 0) {
      // smallest match range first; pick() returns the most-specific covering
      // highlight whose style satisfies the test (first-encountered on ties),
      // then the line layer — the widest range there is (B428). Background
      // skips the line layer because the line container already paints it.
      covering.sort((a, b) => (a.end - a.start) - (b.end - b.start))
      const pick = (test: (s: HighlightStyle) => boolean, withLine = true): HighlightStyle | null => {
        for (const c of covering) if (test(c.compiled.rule.style)) return c.compiled.rule.style
        return withLine && line && test(line.style) ? line.style : null
      }
      // The effect folds the legacy `glow` bool in (effectiveEffect), so one
      // pick covers glow AND the new effects; its glowColor rides along.
      const fx = pick(s => effectiveEffect(s) !== 'none')
      style = {
        kind: 'highlight',
        // B444: did this run INHERIT the line's effect, or bring its own? Only
        // an inherited one should share the line's gradient geometry — a word
        // highlight with its own effect is a deliberate island and its own
        // gradient is the correct rendering.
        fxFromLine: !!fx && !!line && fx === line.style,
        textColor: pick(s => !!s.textColor && s.textColor !== 'transparent')?.textColor ?? null,
        bgColor:   pick(s => !!s.bgColor && s.bgColor !== 'transparent', false)?.bgColor ?? null,
        bold:      !!pick(s => s.bold),
        glowColor: fx?.glowColor ?? null,
        effect:    fx ? effectiveEffect(fx) : null,
      }
      key = `h:${style.textColor ?? ''}|${style.bgColor ?? ''}|${style.bold}|${style.glowColor ?? ''}|${style.effect ?? ''}`
    } else {
      style = null
      key = 'n'
    }

    // Merge with the previous run when the resolved style is identical.
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.end = end
    else runs.push({ start, end, style, key })
  }

  const parts: React.ReactNode[] = []
  let n = 0
  const k = () => segKey * 10000 + n++

  for (const run of runs) {
    const matchText = text.slice(run.start, run.end)
    const s = run.style

    if (s === null) {
      // No highlight/contact covers this run — render via renderSegment so it
      // picks up the segment's preset / fg / bg as plain text, with the line
      // layer's colour and effect on top when a line rule matched.
      parts.push(renderPlainRun({ ...seg, text: matchText }, k(), onSendCommand, autoLinkUrls, webLinkSafety, line, offset + run.start))
      continue
    }

    if (s.kind === 'contact') {
      const { contact, template } = s
      // Tag and name are painted by the SAME builder the Contacts previews use
      // (`paintContactText`), so what you configure is what you see in both
      // places. They carry INDEPENDENT effects: a tag can shimmer while the name
      // stays plain, or the reverse.
      if (template?.tagText) {
        const tp = paintContactText(template.tagText, {
          color: template.tagColor,
          bgColor: template.tagBgColor,
          bold: template.tagBold,
          effect: template.tagEffect,
          // No `?? tagColor` here: resolveEffect falls back to the run's own
          // colour itself, so a second copy of that rule could only drift.
          glowColor: template.tagGlowColor,
        })
        parts.push(
          <span key={k()} className={`contact-tag${tp.className ? ' ' + tp.className : ''}`} style={tp.style}>
            <tp.Tag>{tp.content}</tp.Tag>{' '}
          </span>,
        )
      }
      const np = paintContactText(matchText, {
        color: template?.textColor ?? 'var(--text-secondary)',
        bgColor: template?.bgColor,
        bold: template?.bold,
        effect: template?.effect,
        glowColor: template?.glowColor,
      })
      const nameContent = (
        <np.Tag className={np.className || undefined} style={np.style}>{np.content}</np.Tag>
      )
      parts.push(
        <span
          key={k()}
          className={`contact-name${onContactClick ? ' contact-name--clickable' : ''}`}
          onClick={onContactClick
            ? (e) => { e.stopPropagation(); onContactClick(contact.id, e.clientX, e.clientY) }
            : undefined}
        >{nameContent}</span>
      )
    } else {
      const rfx = resolveEffect(s.effect, s.textColor, s.glowColor)
      const hlStyle: React.CSSProperties = {
        ...(s.textColor && !rfx.colorReplacing ? { color: s.textColor } : {}),
        ...(s.bgColor ? { backgroundColor: s.bgColor } : {}),
        ...(rfx.glowShadow ? { textShadow: rfx.glowShadow } : {}),
        ...rfx.vars,
        ...(s.fxFromLine ? lineGradientVars(s.effect, line?.lineLen, offset + run.start) : {}),
      }
      const cls = `hl-match${rfx.className ? ` ${rfx.className}` : ''}`
      const Tag = s.bold ? 'strong' : 'span'
      parts.push(<Tag key={k()} className={cls} style={hlStyle}>{effectContent(matchText, rfx.perLetter, offset + run.start)}</Tag>)
    }
  }

  return <span key={segKey}>{parts}</span>
}
