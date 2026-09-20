// How a contact's NAME and TAG are painted — used by the game text renderer AND
// by the Contacts panel's previews (v0.19.1).
//
// It exists because they HAD drifted: the previews built a plain
// `style={{ color }}` while the game applied the template's text effect, so a
// rainbow template previewed as flat colour and you only discovered the effect
// by finding that contact in play (Sekmeht). Sharing the builder is the fix;
// duplicating it is how it happened.

import type { CSSProperties, ReactNode } from 'react'
import type { HighlightEffect } from '../highlights'
import { resolveEffect, effectContent } from './highlightEffects'

export interface ContactPaint {
  className: string
  style: CSSProperties
  /** Text, wrapped per-letter when the effect needs it (wave/bounce). */
  content: ReactNode
  /**
   * The element to render this run in. `strong` when the template bolds it,
   * which keeps the emphasis SEMANTIC and routes the weight through B113's
   * `--ui-bold-weight`, so bold scales with the user's text-weight setting
   * instead of being pinned at 700.
   *
   * Returned rather than applied as a `fontWeight` so the DECISION lives here
   * once — the game renderer and both previews used to each decide it, which is
   * how the tag ended up with no bold at all.
   */
  Tag: 'strong' | 'span'
}

/**
 * Build the className/style/content for one painted run.
 *
 * `colorReplacing` effects (rainbow, gold, gradient, shimmer, fire, frost) paint
 * the glyphs themselves, so the flat colour is deliberately NOT applied under
 * them — setting both would fight, and the effect would lose.
 */
export function paintContactText(
  text: string,
  opts: {
    color?: string | null
    bgColor?: string | null
    bold?: boolean | null
    effect?: HighlightEffect | null
    glowColor?: string | null
  },
): ContactPaint {
  const fx = resolveEffect(opts.effect, opts.color ?? null, opts.glowColor ?? null)
  return {
    className: fx.className,
    style: {
      ...(fx.colorReplacing ? {} : (opts.color ? { color: opts.color } : {})),
      ...(opts.bgColor && opts.bgColor !== 'transparent' ? { backgroundColor: opts.bgColor } : {}),
      ...(fx.glowShadow ? { textShadow: fx.glowShadow } : {}),
      ...fx.vars,
    },
    content: effectContent(text, fx.perLetter),
    Tag: opts.bold ? 'strong' : 'span',
  }
}

/**
 * One painted run, as an element.
 *
 * `paintContactText` hands back the PIECES; every caller then has to assemble
 * them the same way, and the ones that assembled them by hand are exactly the
 * ones that drifted — the popover painted a flat colour with a hardcoded
 * `fontWeight: 'bold'`, so it ignored the tag's bold, ignored every effect, and
 * pinned the weight at 700 instead of routing it through `--ui-bold-weight`.
 * Rendering through this component means there is nothing left to assemble.
 *
 * The game renderer still calls `paintContactText` directly, because it wraps
 * each run in its own keyed `.contact-name` / `.contact-tag` element.
 */
export function ContactRun(
  { text, ...opts }: { text: string } & Parameters<typeof paintContactText>[1],
) {
  const p = paintContactText(text, opts)
  return <p.Tag className={p.className || undefined} style={p.style}>{p.content}</p.Tag>
}
