// Base segment renderer — ONE `TextSegment` → one React node, no rule matching.
// The bottom of the text-render stack: `renderSegmentFull` (highlights + contacts)
// and `renderWithContacts` split a segment into runs and hand every run back
// here, and `TextLineRow` calls it directly when a line has no rules to apply.
//
// What it owns: the `data-preset` attribute (a bare `bold` segment falls back to
// the `bold` preset — an explicit preset always wins), inline fg/bg colour from
// the segment's own `fg`/`bg`, and the two click surfaces — `url-link` (external
// URLs wrapped in Simu's Play.net bounce page, v0.8.1 F23; the URL is passed RAW,
// see `wrapExternalLink`) and `cmd-link` (a `<d cmd>` link → `onSendCommand`).
// `overrideColor` is how a line-scope highlight's text colour beats the
// segment's preset colour — inline, colour ONLY, never the preset's background
// or the segment's bold/links (the parameter comment has the full story).
// `content` replaces the text inside that element: a line-scope EFFECT rides
// an inner span there, so the segment keeps its own element.
import type { TextSegment } from '../../shared/types'

// v0.8.1 (F23): wrap external URLs in Simu's bounce page so the user gets
// a "You are leaving Play.net" confirmation before the actual destination
// opens. Matches Genie's behaviour (FormMain.cs LinkClicked path, gated on
// the bWebLinkSafety config flag). The bounce handles play.net URLs
// transparently — no need to detect-and-skip for Simu's own domains.
// The URL param is passed RAW (not URL-encoded): redirect.asp treats the
// value after `URL=` literally — encoding `://` to `%3A%2F%2F` makes the
// bounce hand the browser a malformed destination and the redirect fails.
function wrapExternalLink(href: string, safety: boolean): string {
  if (!safety) return href
  if (!/^https?:\/\//i.test(href)) return href  // file://, mailto:, etc. pass through
  return 'https://www.play.net/bounce/redirect.asp?URL=' + href
}

export function renderSegment(
  seg: TextSegment,
  key: number,
  onSendCommand?: (cmd: string) => void,
  autoLinkUrls = true,
  webLinkSafety = true,
  // A highlight's text color that must WIN over this segment's own preset/fg
  // color. Without it, a "Line — entire line is styled" highlight (and the
  // non-matched runs of a line) can't recolor preset-colored text — thoughts /
  // speech / lnet / monsterbold render their preset color on top of the line
  // container's color and the highlight is invisible (Cherisse). We override
  // ONLY the text color, inline (which beats the no-`!important` [data-preset]
  // CSS color); the preset's background / italic and the segment's bold / links
  // are kept. Plain segments inherit the line container's color, so wrapping
  // them is just belt-and-suspenders.
  overrideColor?: string,
  // What to render INSIDE the segment's element in place of its plain text —
  // a line-scope highlight's effect span (renderSegmentFull). The effect has to
  // go on an inner element, not this one: a colour-replacing effect clips its
  // element's backgrounds to the glyphs, so here it would swallow a preset's
  // background, and this element also carries the links.
  content?: React.ReactNode,
): React.ReactNode {
  const body = content ?? seg.text
  const preset = seg.preset ?? (seg.bold ? 'bold' : undefined)
  const fgColor = overrideColor ?? (seg.fg ? '#' + seg.fg : undefined)
  const style: React.CSSProperties | undefined =
    fgColor || seg.bg
      ? { ...(fgColor ? { color: fgColor } : {}), ...(seg.bg ? { backgroundColor: '#' + seg.bg } : {}) }
      : undefined

  if (seg.href && (!seg.autoHref || autoLinkUrls)) {
    const href = seg.href
    const resolved = wrapExternalLink(href, webLinkSafety)
    return (
      <span
        key={key}
        className="url-link"
        data-preset={preset}
        style={style}
        onClick={() => window.api.openUrl(resolved)}
        title={webLinkSafety && resolved !== href ? `${href} (via Play.net bounce)` : href}
      >{body}</span>
    )
  }

  if (seg.cmd && onSendCommand) {
    const cmd = seg.cmd
    return (
      <span
        key={key}
        className="cmd-link"
        data-preset={preset}
        style={style}
        onClick={() => onSendCommand(cmd)}
      >{body}</span>
    )
  }

  if (seg.bold) {
    return <strong key={key} data-preset={preset} style={style}>{body}</strong>
  }
  if (preset || style) {
    return <span key={key} data-preset={preset} style={style}>{body}</span>
  }
  return content === undefined ? seg.text : <span key={key}>{content}</span>
}
