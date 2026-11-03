// GS4 timed effects (Active Spells / Buffs / Debuffs / Cooldowns) — the pure
// half of the Effects panel: what the game's `time` attribute means, how much
// is left now, and how to print it. No React, so a plain-node harness can
// drive it.
//
// The model follows ProfanityFE's EffectTracker/EffectsWindow (lib/
// effect_tracker.rb, lib/windows/effects_window.rb) and Saga 0.7.10's
// EffectList: the game sends each dialog's WHOLE list on every change (a
// `clear='t'` block, then the full block, always on one line — 123k of 123k
// captured), and between those the countdown runs locally from the block's
// receipt time. `time` is HH:MM:SS left or 'Indefinite'.
import type { EffectEntry, EffectsDialog } from '../shared/types'

// One dialog's last block, as GameWindow keeps it.
export interface EffectsBlock { entries: EffectEntry[]; at: number }
export type EffectsState = Partial<Record<EffectsDialog, EffectsBlock>>

// Top-to-bottom draw order: by severity (UX standard #3), ProfanityFE's
// DRAW_ORDER — what is hurting you, then what you can't use yet, then what is
// helping, then the long list of spells you keep up all day. The examples in
// each `desc` are the most common names in captured GS4 sessions.
// `warns`: only what you would RECAST gets the last-minute warning. A Debuff
// or Cooldown running out is good news, not something to act on.
export const EFFECT_SECTIONS: ReadonlyArray<{ dialog: EffectsDialog; label: string; cls: string; desc: string; warns: boolean }> = [
  { dialog: 'Debuffs',       label: 'Debuffs',       cls: 'debuff',   warns: false, desc: 'Harmful effects on you, e.g. Feeble, Vulnerable, Stunned.' },
  { dialog: 'Cooldowns',     label: 'Cooldowns',     cls: 'cooldown', warns: false, desc: 'What you have used and must wait on before using again, e.g. Mana Tap, a Voln symbol, your next bounty.' },
  { dialog: 'Buffs',         label: 'Buffs',         cls: 'buff',     warns: true,  desc: 'Short boosts the game tracks apart from your spell list, e.g. Symbol of Protection, Rapid Fire, Bounty Boost.' },
  { dialog: 'Active Spells', label: 'Active Spells', cls: 'spell',    warns: true,  desc: 'Every spell active on you, e.g. Haste, Strength, Mass Blur.' },
]

// A row warns in its last minute (ProfanityFE's WARNING_SECONDS; Saga's 10s
// is too late to recast most spells) AND only once 25% or less of its
// duration is left. The second half is what keeps it quiet: Rapid Fire lasts
// 60s, so a minute-only rule striped it from the moment it appeared — 53% of
// every captured Buffs row. With both, 16%: a 60s buff warns for its last
// 15s, an hours-long spell for its last minute.
export const WARNING_SECONDS = 60
export const WARNING_PERCENT = 25

export function isWarning(entry: EffectEntry, left: number | null): boolean {
  return left !== null && left > 0 && left <= WARNING_SECONDS && entry.percent <= WARNING_PERCENT
}

const HMS = /^(\d+):(\d{1,2}):(\d{1,2})$/

// Seconds left in a `time` attribute; null = no end (Indefinite, absent, or
// any shape that isn't HH:MM:SS).
export function effectSeconds(time: string | undefined): number | null {
  const m = HMS.exec((time ?? '').trim())
  if (!m) return null
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
}

// Seconds left NOW for an entry received at `at` (epoch ms); null = no end.
// Never negative: an effect the game hasn't dropped yet sits at 0.
export function remainingSeconds(entry: EffectEntry, at: number, now: number): number | null {
  const s = effectSeconds(entry.time)
  if (s === null) return null
  return Math.max(0, s - Math.floor(Math.max(0, now - at) / 1000))
}

// h:mm:ss from an hour up, m:ss below (Saga's format: spells run for hours,
// buffs for seconds, and both read at a glance).
export function formatRemaining(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// Whether anything in the state still counts down — the panel's 1s tick runs
// only while this is true.
export function anyTicking(state: EffectsState, now: number): boolean {
  for (const block of Object.values(state)) {
    if (!block) continue
    for (const e of block.entries) {
      const r = remainingSeconds(e, block.at, now)
      if (r !== null && r > 0) return true
    }
  }
  return false
}
