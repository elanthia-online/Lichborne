// TextLineRow — ONE rendered line of game text: timestamp prefix + every
// segment, with line-scope highlights, match-scope highlights and contact
// names painted on. It is the row type for the main window's Virtuoso list
// (GameWindow), every StreamPanel, and the Overview card's feed.
//
// The per-line hot path lives here, so two invariants hold:
// - The expensive work runs ONCE per line, not per segment — that lives in
//   `renderHighlightedLine` (B115 joined text, B172 shared ranges), which the
//   Room panel and the Highlights Preview also use. Don't add a render path
//   that re-scans per segment.
// - It is `memo`'d, and the panels above are memo'd on it — every prop must
//   keep a referentially stable identity (arrays, callbacks, the regex) or the
//   memo is silently defeated on every game line.
//
// `data-line-id` is the DOM→TextLine handle that lets a large selection be
// rebuilt from the data.

import { memo } from 'react'
import type { TextLine } from '../../shared/types'
import type { Contact, ContactTemplate } from '../contacts'
import type { CompiledRule } from '../HighlightsContext'
import { renderHighlightedLine } from '../utils/renderSegmentFull'

export interface TextLineRowProps {
  line: TextLine
  matchRules: CompiledRule[]
  lineRules: CompiledRule[]
  contacts: Contact[]
  templates: ContactTemplate[]
  nameRegex: RegExp | null
  onContactClick?: (id: string, x: number, y: number) => void
  onSendCommand?: (cmd: string) => void
  autoLinkUrls?: boolean
  // v0.8.1 (F23): route external URL clicks through Simu's bounce page
  // (https://www.play.net/bounce/redirect.asp?URL=...) when true. Matches
  // Genie's bWebLinkSafety setting.
  webLinkSafety?: boolean
  showTimestamp?: boolean
}

function fmtTimestamp(ts: number): string {
  const d = new Date(ts)
  return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}] `
}

export const TextLineRow = memo(function TextLineRow({
  line, matchRules, lineRules, contacts, templates, nameRegex,
  onContactClick, onSendCommand, autoLinkUrls = true, webLinkSafety = true, showTimestamp,
}: TextLineRowProps) {
  // A line-scope highlight's colour must WIN over preset/fg segment colours
  // (thoughts/speech/lnet/substituted lines), not just tint the container
  // behind them — Cherisse; its effect paints every run a match-scope rule
  // doesn't give an effect of its own (B428). Both happen inside.
  // `line.fx` is a CLIENT-authored line style (a trigger echo, F118). It takes
  // the line-layer slot, so the echo is painted by the same code a line-scope
  // highlight is — never a second painter.
  const { style: lineStyle, nodes } = renderHighlightedLine(line.segments, {
    matchRules, lineRules, contacts, templates, nameRegex,
    onContactClick, onSendCommand, autoLinkUrls, webLinkSafety, echo: line.fx,
  })
  const monoStyle = line.mono ? { ...lineStyle, whiteSpace: 'pre-wrap' as const } : lineStyle
  return (
    // `data-line-id` maps a DOM row back to its TextLine, which is what lets a
    // large selection be rebuilt from the DATA rather than the DOM. Virtuoso
    // unmounts off-screen rows and the browser silently drops them from a
    // selection, so a copy spanning more rows than are mounted used to lose
    // everything above the viewport (B152's known ceiling). Cheap: one
    // attribute, no effect on the memo.
    <div className="text-line" data-line-id={line.id} style={monoStyle ?? undefined}>
      {showTimestamp && line.timestamp && (
        <span className="ts-prefix">{fmtTimestamp(line.timestamp)}</span>
      )}
      {nodes}
    </div>
  )
})
