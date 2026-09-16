// IconBar — the per-session status strip: hands (L/R), prepared spell, and the
// indicator chips (stance · invisible · webbed · joined · hidden · combat ·
// affliction).
//
// Pure display over parser-fed state. Two chips are MULTIPLEXED by priority:
// combat = bleeding > stunned > dead (bleeding wins on a dead-and-bleeding
// character — that's the actionable signal), and affliction = poisoned >
// diseased in its OWN slot so a poisoned-AND-bleeding character shows both.
// "Joined" (not "Grouped"): DR's IconJOINED marks the FOLLOWER, never the
// group leader — read the inline note before renaming it.
//
// The `trailing` slot hosts the per-session ModeSwitcher — it needs
// GroupsContext, which only exists inside GameWindow, so it can't live in the
// app-level app-bar (top-chrome redesign 2c).

import type { ReactNode } from 'react'
import { ATTENTION_DEFS } from '../attention'
import '../styles/iconbar.css'

interface Props {
  stance: string
  indicators: Record<string, boolean>
  rightHand: string
  leftHand: string
  spell: string
  // Trailing slot at the end of the row — hosts the per-session ModeSwitcher
  // (which needs GroupsContext, only available inside GameWindow) now that the
  // toolbar row was folded into the app-level app-bar (top-chrome redesign 2c).
  trailing?: ReactNode
}

const STANCE_CLASS: Record<string, string> = {
  standing: 'stance-standing',
  kneeling: 'stance-kneeling',
  prone:    'stance-prone',
  sitting:  'stance-sitting',
}

export default function IconBar({ stance, indicators, rightHand, leftHand, spell, trailing }: Props) {
  const stanceKey = (stance || 'standing').toLowerCase()
  const stanceCls = STANCE_CLASS[stanceKey] ?? 'stance-standing'

  // Combat slot — immediate states that put the character in obvious
  // danger. Multiplexed priority: bleeding > unconscious > stunned > dead.
  // Bleeding wins on a dead-and-bleeding character because that's the
  // actionable signal (an empath needs to know there's still time before
  // decay); by the same rule unconscious outranks stunned, since it takes
  // away everything a stun takes away and more. "Unconscious" comes from the
  // status prompt's `U`, not an indicator tag (see the parser) — so it only
  // appears for a player who has `set statusprompt` on.
  const combatText = indicators.bleeding ? 'Bleeding'
    : indicators.unconscious ? 'Unconscious'
    : indicators.stunned ? 'Stunned'
    : indicators.dead    ? 'Dead'
    : null
  const combatCls = indicators.bleeding ? 'ind-bleeding'
    // Shares the stunned styling deliberately: the two can never occupy this
    // slot at once, and the WORD carries the difference, so no new palette
    // entry has to be reviewed against 21 themes (§34.7 — never colour alone).
    : indicators.unconscious ? 'ind-stunned'
    : indicators.stunned ? 'ind-stunned'
    : indicators.dead    ? 'ind-dead'
    : ''

  // Affliction slot — ongoing medical conditions that can ride alongside
  // bleeding/stunned (you can be bleeding AND poisoned simultaneously).
  // Multiplexed priority: poisoned > diseased. Confirmed indicator IDs
  // (IconPOISONED / IconDISEASED) come from Genie's Core/Game.cs case
  // list; Frostbite doesn't surface these at all so it's a true
  // Lichborne-side addition. New slot rather than merging into combat
  // so a poisoned-AND-bleeding character sees both states at once.
  const afflictionText = indicators.poisoned ? 'Poisoned'
    : indicators.diseased ? 'Diseased'
    : null
  const afflictionCls = indicators.poisoned ? 'ind-poisoned'
    : indicators.diseased ? 'ind-diseased'
    : ''

  // B333 (UX #8): every chip explains itself on hover. Where the Overview's
  // attention chips already describe the same state, reuse that wording
  // (ATTENTION_DEFS) so the two surfaces can't drift; a multiplexed slot also
  // says which states share it.
  const combatDesc = indicators.bleeding ? ATTENTION_DEFS.bleeding.desc
    : indicators.unconscious ? 'Unconscious — you are out cold and nothing you send will go through. Reported by the status prompt, so it needs `set statusprompt` on.'
    : indicators.stunned ? ATTENTION_DEFS.stunned.desc
    : indicators.dead    ? ATTENTION_DEFS.dead.desc
    : ''
  const afflictionDesc = indicators.poisoned
    ? 'Poisoned — an ongoing condition that stays until it is cured.'
    : indicators.diseased
    ? 'Diseased — an ongoing condition that stays until it is cured.'
    : ''

  const statusBars = [
    { key: 'stance',     text: stance || 'Standing',  cls: stanceCls,       active: true,
      title: `Posture: ${stance || 'Standing'} (standing, sitting, kneeling or prone)` },
    { key: 'invisible',  text: 'Invisible',            cls: 'ind-invisible', active: !!indicators.invisible,
      title: 'Invisible — other characters cannot see you.' },
    { key: 'webbed',     text: 'Webbed',               cls: 'ind-webbed',    active: !!indicators.webbed,
      title: ATTENTION_DEFS.webbed.desc },
    // "Joined", not "Grouped": DR's IconJOINED (and the `J>` statusprompt) marks
    // the FOLLOWER (joined/following via hand-hold), NOT the group LEADER — the
    // leader has members joined to them but isn't "joined" themselves, so they
    // correctly get no chip. "Grouped" implied every group member should light
    // up; "Joined" matches what the game actually signals (Cherisse/Agan).
    { key: 'joined',     text: 'Joined',               cls: 'ind-joined',    active: !!indicators.joined,
      title: 'Joined — you are following someone in a group. The game marks only the FOLLOWER, so a group leader never shows this chip.' },
    { key: 'hidden',     text: 'Hidden',               cls: 'ind-hidden',    active: !!indicators.hidden,
      title: 'Hidden — you are concealed from others in the room.' },
    { key: 'combat',     text: combatText ?? '',        cls: combatCls,       active: !!combatText,
      title: `${combatDesc} (This slot shows the most urgent of Bleeding, Unconscious, Stunned and Dead.)` },
    { key: 'affliction', text: afflictionText ?? '',    cls: afflictionCls,   active: !!afflictionText,
      title: `${afflictionDesc} (This slot shows Poisoned before Diseased, and can show alongside Bleeding or Stunned.)` },
  ]

  const leftText  = leftHand  || 'Empty'
  const rightText = rightHand || 'Empty'
  const hasSpell  = !!spell && spell !== 'None'

  return (
    <div className="icon-bar">
      <div className="icon-row">

        <span className={`hand-slot ${leftHand === 'Empty' ? 'hand-empty' : 'hand-held'}`}
          title={`Left hand: ${leftText}`}>
          <span className="hand-label">L</span>
          <span className="hand-item">{leftText}</span>
        </span>

        <span className={`hand-slot ${rightHand === 'Empty' ? 'hand-empty' : 'hand-held'}`}
          title={`Right hand: ${rightText}`}>
          <span className="hand-label">R</span>
          <span className="hand-item">{rightText}</span>
        </span>

        <div className="row-sep" />

        <span className="spell-slot"
          title={hasSpell ? `Prepared spell: ${spell} — ready to cast` : 'No spell prepared'}>
          <span className="hand-label">Spell</span>
          <span className={hasSpell ? 'spell-active' : 'spell-empty'}>
            {hasSpell ? spell : 'None'}
          </span>
        </span>

        <div className="row-sep" />

        {statusBars.map(bar => (
          <div
            key={bar.key}
            className={`status-bar${bar.active ? ` ${bar.cls}` : ' status-bar--empty'}`}
            title={bar.active ? bar.title : undefined}
          >
            {bar.text || ' '}
          </div>
        ))}

        {trailing && (
          <>
            <div className="row-sep" />
            <span className="icon-row-trailing">{trailing}</span>
          </>
        )}

      </div>
    </div>
  )
}
