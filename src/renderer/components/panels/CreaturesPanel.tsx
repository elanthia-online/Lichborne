// GS4 Creatures panel — the room's creatures from the parser's roster
// (<crtrStatus>, CreatureStatus), one row each: name, the game's exact health
// as a bar, the states it is in, and the current target (the combat dialog's
// dDBTarget, `creature-target`) marked. A click targets it (`target #id`, the
// command the game's own target picker sends); a right-click opens the shared
// game-link menu (gameLinks.ts), as the Room panel's names do.
//
// Order (UX standard #3): hostile and alive first, then the rest (shopkeepers,
// critters, pets), then the dead, each in the room's own order. Pets and
// familiars send 0/0 health, so they get no bar. Health can go below 0 past
// death; the bar stops at empty.
import { memo, useContext, useState } from 'react'
import type { CreatureStatus } from '../../../shared/types'
import { Bar } from './GsExperiencePanel'
import ContextMenu, { type CtxItem } from '../ContextMenu'
import { GameLinkContext } from '../../gameLinks'

interface Props {
  roster: CreatureStatus[] | null
  targetId: string | null
  onSendCommand: (cmd: string) => void
}

// The states worth a word, in the order shown (Lich's CRTR_STATUS_FLAGS).
const STATE_WORDS: [string, string][] = [
  ['stunned', 'stunned'], ['webbed', 'webbed'], ['immobile', 'held'], ['rooted', 'rooted'],
  ['sleeping', 'asleep'], ['disoriented', 'dazed'], ['calmed', 'calmed'], ['prone', 'prone'],
  ['kneeling', 'kneeling'], ['sitting', 'sitting'], ['flying', 'flying'], ['hovering', 'hovering'],
  ['hidden', 'hidden'],
]

// Markers the game puts on a creature, with what they mean. The game does not
// define inferior or challenging; the tooltips say what carries them in the
// 184 GS4 captures.
const MARKERS: { flag: string; label: string; tip: string }[] = [
  { flag: 'AscensionBoss', label: 'boss',        tip: 'An ascension boss.' },
  { flag: 'MiniBoss',      label: 'mini-boss',   tip: 'A mini-boss.' },
  { flag: 'challenging',   label: 'challenging', tip: 'The game marks it challenging (guild guards carry it).' },
  { flag: 'inferior',      label: 'inferior',    tip: 'The game marks it inferior (shopkeepers, pets and harmless critters carry it).' },
  { flag: 'mount',         label: 'mount',       tip: 'A mount.' },
  { flag: 'rider',         label: 'rider',       tip: 'Riding a mount.' },
]

// Flags are lower-cased by the parser.
const has = (c: CreatureStatus, flag: string) => c.flags.includes(flag.toLowerCase())

function rank(c: CreatureStatus): number {
  if (has(c, 'dead')) return 2
  return has(c, 'hostile') ? 0 : 1
}

function healthClass(pct: number): string {
  return pct > 50 ? 'gs-crtr-hp--ok' : pct > 25 ? 'gs-crtr-hp--mid' : 'gs-crtr-hp--low'
}

// Module-level (UX standard #4).
function CreatureRow({ c, targeted, onTarget }: { c: CreatureStatus; targeted: boolean; onTarget: (id: string) => void }) {
  const dead = has(c, 'dead')
  const max = c.maxHealth ?? 0
  const hp = Math.max(0, c.health ?? 0)
  const pct = max > 0 ? Math.round((hp / max) * 100) : 0
  const states = dead ? [] : STATE_WORDS.filter(([f]) => has(c, f)).map(([, w]) => w)
  const markers = MARKERS.filter(m => has(c, m.flag))
  const name = c.name ?? `#${c.id}`
  const cls = ['gs-crtr-row', dead && 'gs-crtr-row--dead', targeted && 'gs-crtr-row--target', has(c, 'hostile') && 'gs-crtr-row--hostile']
    .filter(Boolean).join(' ')
  return (
    <li className={cls}>
      <button
        type="button"
        className="gs-crtr-name"
        data-exist={c.id}
        data-link={name}
        data-bold="1"
        onClick={() => onTarget(c.id)}
        title={targeted ? `${name} is your target. Click to target it again; right-click for more.` : `Click to target ${name}; right-click for more.`}
      >
        {name}
      </button>
      {targeted && <span className="gs-crtr-tag gs-crtr-tag--target" title="Your current target.">target</span>}
      {markers.map(m => <span key={m.flag} className="gs-crtr-tag" title={m.tip}>{m.label}</span>)}
      {dead ? (
        <span className="gs-crtr-state">dead</span>
      ) : (
        <>
          {max > 0 && (
            <span className="gs-crtr-hp gsx-num" title={`Health ${c.health ?? 0} of ${max}, as the game reports it.`}>{hp}/{max}</span>
          )}
          {states.length > 0 && <span className="gs-crtr-state">{states.join(', ')}</span>}
        </>
      )}
      {!dead && max > 0 && <div className={`gs-crtr-bar ${healthClass(pct)}`}><Bar pct={pct} cls="" /></div>}
    </li>
  )
}

function CreaturesPanel({ roster, targetId, onSendCommand }: Props) {
  const linkMenu = useContext(GameLinkContext)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null)
  const list = (roster ?? []).map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(x => x.c)

  const onContextMenu = (e: React.MouseEvent) => {
    if (e.defaultPrevented || !linkMenu) return
    const items = linkMenu(e.target as Element, e.clientX, e.clientY)
    if (!items.length) return
    e.preventDefault()
    setMenuAt({ x: e.clientX, y: e.clientY, items })
  }

  return (
    <div className="gsx-panel" onContextMenu={onContextMenu}>
      {list.length === 0 ? (
        <div className="gsx-waiting" title="GemStone lists the creatures with each room, and updates them as a fight goes.">
          No creatures here.
        </div>
      ) : (
        <ul className="gs-crtr-list">
          {list.map(c => (
            <CreatureRow key={c.id} c={c} targeted={c.id === targetId} onTarget={id => onSendCommand(`target #${id}`)} />
          ))}
        </ul>
      )}
      {menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} onClose={() => setMenuAt(null)} items={menuAt.items} />}
    </div>
  )
}

export default memo(CreaturesPanel)
