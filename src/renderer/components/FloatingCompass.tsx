// FloatingCompass — the glanceable exits HUD: a 3×3 arrow grid (cardinals +
// diagonals) with an UP / DOWN / OUT row beneath, overlaid bottom-right of the
// text window.
//
// GameWindow renders it inside `.text-area` (so it rides the main text into a
// floating window in free mode) and feeds it the parser's `exits` event
// directions verbatim — the `dir` keys are the compass tokens.
//
// v0.20.1 (Q): the player's compass options (Settings → Layout → Compass,
// `/compass`) — visible, size, corner, a theme-coloured backing, how dim an
// unavailable exit is, and click-to-walk. The defaults reproduce the old fixed
// compass exactly. Size scales the WHOLE geometry through one `--fc-cell`
// variable (B305: scaling the glyphs alone breaks the grid). By default the
// compass is still `pointer-events: none`, so it never steals a click from the
// text beneath it. With click-to-walk on, EVERY direction takes clicks — lit
// or not — because a spell can hide a room's exits (nothing lights) and a
// player who knows the way must still be able to try it; the game decides
// whether it works. Lit only sets how bright a cell is. A click sends the full
// direction word (exitWords.ts — `dn` is not a command).

import type { CSSProperties } from 'react'
import type { AppSettings, CompassOptions } from '../settings'
import { DIR_WORDS } from '../exitWords'
import '../styles/floatingcompass.css'

const CELL_PX: Record<AppSettings['compassSize'], number> = { small: 18, medium: 24, large: 32 }

// Arrow glyphs for the 8 cardinal/diagonal directions — chosen over
// letter labels because for a glanceable HUD the icon reads instantly
// (no text scanning needed). The `dir` keys still match the typed-
// command names (n/s/e/w/nw/etc.); the `title` attribute on each cell
// surfaces them on hover for discoverability.
const ARROWS: Record<string, string> = {
  nw: '↖', n: '↑', ne: '↗',
  w:  '←',          e:  '→',
  sw: '↙', s: '↓', se: '↘',
}
const COMPASS_GRID: Record<string, [number, number]> = {
  nw: [0, 0], n: [1, 0], ne: [2, 0],
  w:  [0, 1],            e:  [2, 1],
  sw: [0, 2], s: [1, 2], se: [2, 2],
}

// Special exits stay as text labels — `up`/`dn` would collide visually
// with the cardinal `n`/`s` arrows if rendered as ↑/↓, and `out` has
// no natural arrow. Text in a clearly-separated row makes their
// distinct semantic (non-cardinal exit) obvious.
const SPECIAL_EXITS: { dir: string; label: string }[] = [
  { dir: 'up',  label: 'UP'  },
  { dir: 'dn',  label: 'DOWN' },
  { dir: 'out', label: 'OUT' },
]

export default function FloatingCompass({ exits, options, onWalk }: {
  exits: string[]
  options: CompassOptions
  /** Send a walk command. Only used when click-to-walk is on. */
  onWalk?: (cmd: string) => void
}) {
  if (!options.compassVisible) return null
  const clickable = options.compassClickable && !!onWalk
  const style = {
    '--fc-cell': `${CELL_PX[options.compassSize] ?? 24}px`,
    '--fc-dim': String(options.compassDimOpacity),
  } as CSSProperties
  const cls = 'floating-compass'
    + ` floating-compass--${options.compassCorner}`
    + (options.compassBacking !== 'none' ? ` floating-compass--backing-${options.compassBacking}` : '')
    + (clickable ? ' floating-compass--clickable' : '')

  // With click-to-walk on, every cell is a button — an unlit one too, for
  // exits a spell has hidden. Otherwise each stays the plain glyph it has
  // always been (no tab stop, no role).
  const cell = (dir: string, className: string, content: string, extra?: CSSProperties) => {
    const lit = exits.includes(dir)
    const word = DIR_WORDS[dir] ?? dir
    const cls2 = `${className} ${lit ? 'fc-cell--active' : 'fc-cell--inactive'}`
    if (clickable) {
      // The unlit tooltip says what clicking it means, so trying a direction
      // with no obvious exit reads as deliberate rather than a misclick.
      const tip = lit ? `Go ${word}` : `Try going ${word} (no obvious exit shown)`
      return (
        <button key={dir} type="button" className={`${cls2} fc-cell--button`} style={extra}
                title={tip} aria-label={tip}
                // A mouse click must not take focus: the next Enter would walk
                // again instead of sending what's typed in the command bar.
                onMouseDown={e => e.preventDefault()}
                // Space walks too; preventDefault also keeps type-anywhere (F60)
                // from grabbing it for the command bar.
                onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); onWalk!(word) } }}
                onClick={() => onWalk!(word)}>{content}</button>
      )
    }
    return <div key={dir} className={cls2} style={extra} title={word}>{content}</div>
  }

  return (
    <div className={cls} style={style}>
      <div className="fc-grid">
        {Object.entries(COMPASS_GRID).map(([dir, [col, row]]) =>
          cell(dir, 'fc-cell', ARROWS[dir], { gridColumn: col + 1, gridRow: row + 1 }))}
        {/* v0.8.2: centre dot removed — it sat off-centre at some font
            sizes (the `·` glyph's baseline metrics differ across fonts,
            so the grid cell aligned correctly but the character drew
            high-and-left of cell centre). The 8 directional arrows
            already imply the centre by negative space. */}
      </div>
      <div className="fc-special">
        {SPECIAL_EXITS.map(({ dir, label }) => cell(dir, 'fc-special-cell', label))}
      </div>
    </div>
  )
}
