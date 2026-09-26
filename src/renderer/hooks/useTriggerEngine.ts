// useTriggerEngine — the per-session native trigger engine (WHEN a line/variable → THEN actions).
//
// GameWindow owns one per session and feeds it every incoming line via
// `processLine(stream, text)` and every game-variable change via
// `processVariableChange(name, value)`. This file COMPILES the rules (an
// effect keyed on `rules`: text triggers → regex + a `fastLower` pre-gate
// from `literalGate`, B172; variable-watch triggers indexed separately),
// EVALUATES them, and EXECUTES the actions through the `TriggerCallbacks`
// the caller supplies — sending a command, echoing to a stream, setting a
// variable, disabling a one-shot, flashing the window, writing a log. The
// engine never touches the socket or the DOM directly; the callbacks do.
//
// `processLine`'s per-rule ladder, in order — keep it in this order:
// enabled+compiled → `fastLower` includes() pre-check (skips the regex for
// most rules on most lines) → group gating (`isRuleActive`) → stream scope →
// regex exec → cooldown → state gates → record the cooldown → capture groups
// (named AND numbered) → `buildVars` → `onFire` (the Debug/analytics hook,
// optional) → each action → one-shot disable.
//
// Live game state and the active-group map come in through REFS (`stateRef`,
// `activeGroupStatesRef`), so a fire reads the value of THIS moment without
// the callbacks re-creating on every vital tick. `buildVars` is the catalogue
// of `$vars` an action may interpolate (match/groups, character, date/time,
// vitals, RT/CT, stance, spell, hands, room, exits, indicator booleans, then
// the trigger-set variables and the regex groups on top). Delayed `command`
// actions are tracked in `pendingTimersRef` so `cancelPending()` can drop
// them on disconnect. `playWavFile` is exported for reuse; its comment covers
// the Windows-vs-POSIX `file://` URL shapes.

import { useCallback, useEffect, useRef } from 'react'
import type { LineStyleHint } from '../../shared/types'
import {
  type TriggerRule, type TriggerAction, type StateGate, type GateOperator,
  buildTriggerRegex, interpolate, echoLineStyle, actionWaitsForRt,
} from '../triggers'
import { isRuleActive } from '../groups'
import { literalGate } from '../regexLiteral'
import { IS_MAC } from '../lichSettings'

export interface TriggerGameState {
  vitals: Record<string, { current: number; max: number }>
  /** RT / CT as local-clock EXPIRY times (epoch ms, 0 = none) — the same
   *  server-anchored value the timer bar uses (B192). Stored as an expiry, not
   *  a seconds count, because a count taken when the tag arrived never decays:
   *  DR sends nothing when RT runs out, so a stored `5` stayed `5` until the
   *  next roundtime tag. Read seconds-left through `secondsLeft`. */
  rtExpires: number
  ctExpires: number
  stance: string
  spell: string
  leftHand: string
  rightHand: string
  indicators: Record<string, boolean>
  roomTitle: string
  roomId: number
  exits: string[]
  variables: Record<string, string>
  characterName: string
}

export interface TriggerCallbacks {
  sendCommand:  (cmd: string) => void
  echoToStream: (stream: string, text: string, color?: string | null, fx?: LineStyleHint) => void
  setVariable:  (name: string, value: string) => void
  disableTrigger: (id: string) => void
  flashWindow:  () => void
  writeLog:     (file: string, content: string) => void
  /** A Lichborne toast in the window the player is looking at (routed by main). */
  toast:        (title: string, message: string, kind: 'info' | 'success' | 'warning' | 'error') => void
  onFire?:      (name: string, matched: string, detail: string, stream: string, ruleId: string) => void
}

export function playWavFile(filePath: string) {
  try {
    // Windows paths ("C:\snd\a.wav") need the third slash AND backslash
    // conversion; POSIX paths are already absolute, so prefixing 'file:///'
    // would yield "file:////home/…" (empty host + a doubled root). Both forms
    // then get encodeURI so a '#' or '?' in a filename can't truncate the URL
    // — a silent no-play on every platform, since play() failures are
    // swallowed below.
    const url = filePath.startsWith('file://')
      ? filePath
      : encodeURI(filePath.startsWith('/')
          ? 'file://' + filePath
          : 'file:///' + filePath.replace(/\\/g, '/'))
    const audio = new Audio(url)
    audio.play().catch(() => {})
  } catch {}
}

// Web Audio API tone — each call gets its own AudioContext to avoid conflicts
function playTone(preset: string) {
  try {
    const ctx = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    switch (preset) {
      case 'chime': osc.frequency.value = 880;  break
      case 'alert': osc.frequency.value = 440;  break
      case 'alarm': osc.frequency.value = 330;  break
      case 'ping':  osc.frequency.value = 1320; break
      default:      osc.frequency.value = 880
    }
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)
    osc.onended = () => ctx.close()
  } catch {}
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    osc.type = 'square'
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.12)
    osc.onended = () => ctx.close()
  } catch {}
}

/** Whole seconds left until `expires` (epoch ms), rounded UP so an RT with
 *  0.2s left still reads 1 — never 0 while the game would still refuse. */
export function secondsLeft(expires: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((expires - now) / 1000))
}

function getGateActual(gate: StateGate, state: TriggerGameState): string {
  switch (gate.variable) {
    case 'health':        return String(state.vitals.health?.current        ?? 0)
    case 'mana':          return String(state.vitals.mana?.current          ?? 0)
    case 'stamina':       return String(state.vitals.stamina?.current       ?? 0)
    case 'spirit':        return String(state.vitals.spirit?.current        ?? 0)
    case 'concentration': return String(state.vitals.concentration?.current ?? 0)
    case 'rt':            return String(secondsLeft(state.rtExpires))
    case 'ct':            return String(secondsLeft(state.ctExpires))
    case 'stance':        return state.stance.toLowerCase()
    case 'spell':         return state.spell
    case 'room':          return state.roomTitle
    case 'bleeding':
    case 'stunned':
    case 'dead':
    case 'hidden':
    case 'invisible':     return state.indicators[gate.variable] ? 'true' : 'false'
    default:              return ''
  }
}

function compareGate(actual: string, op: GateOperator, expected: string): boolean {
  const numA = parseFloat(actual)
  const numE = parseFloat(expected)
  if (!isNaN(numA) && !isNaN(numE)) {
    switch (op) {
      case '<':  return numA <  numE
      case '<=': return numA <= numE
      case '>':  return numA >  numE
      case '>=': return numA >= numE
      case '=':  return numA === numE
      case '!=': return numA !== numE
    }
  }
  switch (op) {
    case '=':  return actual.toLowerCase() === expected.toLowerCase()
    case '!=': return actual.toLowerCase() !== expected.toLowerCase()
    case '<':  return actual <  expected
    case '<=': return actual <= expected
    case '>':  return actual >  expected
    case '>=': return actual >= expected
  }
}

function checkGates(gates: StateGate[], state: TriggerGameState): boolean {
  if (gates.length === 0) return true
  let result = compareGate(getGateActual(gates[0], state), gates[0].operator, gates[0].value)
  for (let i = 1; i < gates.length; i++) {
    const curr = compareGate(getGateActual(gates[i], state), gates[i].operator, gates[i].value)
    result = (gates[i].connector ?? 'and') === 'or' ? result || curr : result && curr
  }
  return result
}

function buildVars(
  matchText: string,
  lineText: string,
  groups: Record<string, string>,
  state: TriggerGameState,
): Record<string, string> {
  const now = new Date()
  return {
    match:         matchText,
    '0':           matchText,
    line:          lineText,
    characterName: state.characterName,
    date:          now.toLocaleDateString(),
    time:          now.toLocaleTimeString(),
    timestamp:     String(now.getTime()),
    health:        String(state.vitals.health?.current        ?? 0),
    mana:          String(state.vitals.mana?.current          ?? 0),
    stamina:       String(state.vitals.stamina?.current       ?? 0),
    spirit:        String(state.vitals.spirit?.current        ?? 0),
    concentration: String(state.vitals.concentration?.current ?? 0),
    rt:            String(secondsLeft(state.rtExpires)),
    ct:            String(secondsLeft(state.ctExpires)),
    casttime:      String(secondsLeft(state.ctExpires)),
    stance:        state.stance,
    spell:         state.spell,
    preparedspell: state.spell,
    left:          state.leftHand,
    right:         state.rightHand,
    room:          state.roomTitle,
    roomname:      state.roomTitle,
    roomid:        String(state.roomId || ''),
    exits:         state.exits.join(', '),
    bleeding:      state.indicators.bleeding  ? 'true' : 'false',
    poisoned:      state.indicators.poisoned  ? 'true' : 'false',
    diseased:      state.indicators.diseased  ? 'true' : 'false',
    stunned:       state.indicators.stunned   ? 'true' : 'false',
    // From the status prompt's `U`, not an indicator tag — so it stays 'false'
    // for a player without `set statusprompt` (see StormFrontParser).
    unconscious:   state.indicators.unconscious ? 'true' : 'false',
    webbed:        state.indicators.webbed    ? 'true' : 'false',
    joined:        state.indicators.joined    ? 'true' : 'false',
    hidden:        state.indicators.hidden    ? 'true' : 'false',
    invisible:     state.indicators.invisible ? 'true' : 'false',
    dead:          state.indicators.dead      ? 'true' : 'false',
    ...state.variables,
    ...groups,
  }
}

function summarizeAction(action: TriggerAction, vars: Record<string, string>): string {
  switch (action.type) {
    case 'command': {
      const cmd = interpolate(action.command ?? '', vars).trim()
      return `cmd: "${cmd}"${actionWaitsForRt(action, cmd) ? ' (after RT)' : ''}`
    }
    case 'echo':     return `echo → ${action.echoStream ?? 'log'}: "${interpolate(action.echoMessage ?? '', vars).trim()}"`
    case 'notify':   return `notify: "${interpolate(action.notifyTitle ?? 'Lichborne', vars)}"`
    case 'toast':    return `toast: "${interpolate(action.toastMessage ?? '', vars).trim()}"`
    case 'sound':    return action.soundFile ? `sound: ${action.soundFile.split(/[\\/]/).pop()}` : `sound: ${action.soundPreset ?? 'chime'}`
    case 'beep':     return 'beep'
    case 'flash':    return 'flash window'
    case 'log':      return `log → ${interpolate(action.logFile ?? '', vars).trim()}`
    case 'webhook':  return `webhook: ${action.webhookUrl ?? ''}`
    case 'variable': return `set $${action.varName} = "${interpolate(action.varValue ?? '', vars)}"`
    default:         return action.type
  }
}

function summarizeGates(gates: StateGate[]): string {
  if (!gates.length) return ''
  return gates.map((g, i) => {
    const connector = i === 0 ? 'if ' : ` ${g.connector ?? 'and'} `
    return `${connector}${g.variable} ${g.operator} ${g.value}`
  }).join('')
}

function executeAction(
  action: TriggerAction,
  vars: Record<string, string>,
  cbs: TriggerCallbacks,
  trackTimer: (handle: ReturnType<typeof setTimeout>) => void,
  sendAfterRt: (cmd: string, firedAt: number, firedSeq: number) => void,
  firedSeq: number,
) {
  switch (action.type) {
    case 'command': {
      const cmd = interpolate(action.command ?? '', vars).trim()
      if (!cmd) return
      // The fire moment is captured NOW, not when a delay elapses: the RT
      // queue's settle rule is "has the turn this trigger fired in closed?",
      // and after a multi-second delay it long since has.
      const firedAt = Date.now()
      const send = actionWaitsForRt(action, cmd)
        ? () => sendAfterRt(cmd, firedAt, firedSeq)
        : () => cbs.sendCommand(cmd)
      const delay = action.delayMs ?? 0
      if (delay > 0) {
        const handle = setTimeout(send, delay)
        trackTimer(handle)
      } else {
        send()
      }
      break
    }
    case 'echo': {
      const msg   = interpolate(action.echoMessage ?? '', vars).trim()
      if (!msg) return
      const color = action.echoColor ? interpolate(action.echoColor, vars).trim() || null : null
      // F118: background / bold / effect ride a LINE STYLE the renderer paints
      // as this line's layer, exactly as it paints a line-scope highlight.
      //
      // The hint is emitted ONLY when one of those newer fields is set, which
      // keeps every pre-F118 echo byte-identical: a colour-only echo still
      // travels as the segment's `fg` alone, so a line-scope RULE that also
      // matches it keeps winning the layer the way it always has. Once the echo
      // carries its own styling it takes that slot instead — it was authored
      // for this exact message, where a line rule is generic.
      const fx = echoLineStyle(action, s => interpolate(s, vars).trim())
      cbs.echoToStream(action.echoStream || 'log', msg, color, fx)
      break
    }
    case 'notify': {
      const title = interpolate(action.notifyTitle ?? 'Lichborne', vars)
      const body  = interpolate(action.notifyBody  ?? '',        vars)
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification(title, { body })
        })
      }
      // B359: macOS may silently drop notifications from our ad-hoc-signed
      // build (unverified — nothing fails, it just doesn't appear). Also take
      // the flash action's path (main's flashFrame), which bounces the Dock
      // there. Harmless if the notification DID show — macOS ignores an
      // attention request from the active app (Apple's documented behaviour,
      // not verified here). Windows/Linux unchanged.
      if (IS_MAC) cbs.flashWindow()
      break
    }
    case 'toast': {
      const message = interpolate(action.toastMessage ?? '', vars).trim()
      if (!message) return
      const title = interpolate(action.toastTitle ?? '', vars).trim()
      cbs.toast(title, message, action.toastKind ?? 'info')
      break
    }
    case 'sound':
      if (action.soundFile) playWavFile(action.soundFile)
      else playTone(action.soundPreset ?? 'chime')
      break
    case 'beep':
      playBeep()
      break
    case 'flash':
      cbs.flashWindow()
      break
    case 'log': {
      const file    = interpolate(action.logFile    ?? '', vars).trim()
      const content = interpolate(action.logMessage ?? '', vars)
      if (file && content) cbs.writeLog(file, content)
      break
    }
    case 'webhook': {
      const url = action.webhookUrl?.trim()
      if (!url) return
      const content = interpolate(action.webhookMessage ?? '', vars)
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).catch(() => {})
      break
    }
    case 'variable': {
      const name  = action.varName?.trim()
      const value = interpolate(action.varValue ?? '', vars)
      if (name) cbs.setVariable(name, value)
      break
    }
  }
}

export function useTriggerEngine(
  rules: TriggerRule[],
  stateRef: React.MutableRefObject<TriggerGameState>,
  callbacks: TriggerCallbacks,
  activeGroupStatesRef: React.MutableRefObject<Record<string, boolean>>,
): {
  processLine: (stream: string, lineText: string) => void
  processVariableChange: (name: string, newValue: string) => void
  cancelPending: () => void
  notePrompt: () => void
  noteTimer: (name: 'rt' | 'ct', expires: number) => void
} {
  // Compiled text-trigger regexes — recompiled whenever rules change
  const compiledRef = useRef<{ rule: TriggerRule; regex: RegExp | null; fastLower: string | null }[]>([])
  // Variable-watch rules index
  const varRulesRef = useRef<TriggerRule[]>([])
  useEffect(() => {
    compiledRef.current = rules
      .filter(r => !r.triggerType || r.triggerType === 'text')
      .map(r => ({
        rule: r,
        regex: buildTriggerRegex(r),
        // B172: shared gate — regex-mode rules get a conservative extracted
        // literal; text-mode gates on its longest token (see literalGate).
        fastLower: literalGate(r.mode, r.pattern),
      }))
    varRulesRef.current = rules.filter(r => r.triggerType === 'variable')
  }, [rules])

  // Per-trigger cooldown timestamps
  const cooldownsRef = useRef<Record<string, number>>({})

  // Pending delayed command timer handles — cleared on disconnect
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  const trackTimer = useCallback((handle: ReturnType<typeof setTimeout>) => {
    pendingTimersRef.current.add(handle)
  }, [])

  // ── Wait-for-roundtime queue ──────────────────────────────────────────────
  //
  // A command action with `waitForRt` (the default) goes through this FIFO
  // instead of straight to the socket. Two conditions release the head:
  //
  // 1. SETTLED — a prompt has arrived since the trigger fired (or
  //    RT_SETTLE_CAP_MS has passed). This is the load-bearing half: the parser
  //    emits `roundtime` at the `<prompt>` tag, AFTER every text line of that
  //    server turn, so a trigger matching "You swing…" fires BEFORE the RT that
  //    swing starts is known. Checking RT at fire time would read the old,
  //    usually-zero value and send at once, which is the bug this exists for.
  //    The cap covers lines no prompt follows (a Lich script's echo).
  // 2. RT CLEAR — `now >= rtExpires`, read live at pump time, so an RT that is
  //    extended while a command waits is honoured.
  //
  // After a command is sent, the NEXT queued one re-arms its settle, so it waits
  // for the prompt answering the command just sent — and therefore for any RT
  // that command starts. Two queued commands (`stand` then `attack`) go one
  // round apart instead of back-to-back into "...wait 3 seconds."
  //
  // No grace is added to the RT expiry: it is anchored on the prompt's whole-
  // second server time (B192), which floors the server clock, so the computed
  // expiry lands at or after the real one — late by network latency, never early.
  const RT_SETTLE_CAP_MS = 1000
  const rtQueueRef   = useRef<{ cmd: string; since: number; seq: number }[]>([])
  const promptSeqRef = useRef(0)
  const pumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pumpRef      = useRef<() => void>(() => {})
  const timerEndRef  = useRef<Record<'rt' | 'ct', ReturnType<typeof setTimeout> | null>>({ rt: null, ct: null })

  // One pending wake-up at a time; each pump recomputes the right one.
  const schedulePump = useCallback((ms: number) => {
    if (pumpTimerRef.current !== null) clearTimeout(pumpTimerRef.current)
    pumpTimerRef.current = setTimeout(() => {
      pumpTimerRef.current = null
      pumpRef.current()
    }, Math.max(0, ms))
  }, [])

  const pump = useCallback(() => {
    const q = rtQueueRef.current
    while (q.length > 0) {
      const now  = Date.now()
      const head = q[0]
      const settled = promptSeqRef.current > head.seq || now - head.since >= RT_SETTLE_CAP_MS
      if (!settled) { schedulePump(head.since + RT_SETTLE_CAP_MS - now); return }
      const rtEnd = stateRef.current.rtExpires
      if (now < rtEnd) { schedulePump(rtEnd - now); return }
      q.shift()
      callbacks.sendCommand(head.cmd)
      if (q.length > 0) { q[0].since = now; q[0].seq = promptSeqRef.current }
    }
  }, [stateRef, callbacks, schedulePump])
  useEffect(() => { pumpRef.current = pump }, [pump])

  // Deferred with a 0ms timer, never pumped inline: we are called mid-batch, and
  // sending here would echo `>cmd` ahead of the batch's own lines (and, for
  // notePrompt, ahead of the prompt it merges into).
  const sendAfterRt = useCallback((cmd: string, firedAt: number, firedSeq: number) => {
    rtQueueRef.current.push({ cmd, since: firedAt, seq: firedSeq })
    schedulePump(0)
  }, [schedulePump])

  /** Call once per game prompt (GameWindow, after the batch's RT event). */
  const notePrompt = useCallback(() => {
    promptSeqRef.current++
    if (rtQueueRef.current.length > 0) schedulePump(0)
  }, [schedulePump])

  const cancelPending = useCallback(() => {
    for (const h of pendingTimersRef.current) clearTimeout(h)
    pendingTimersRef.current.clear()
    rtQueueRef.current = []
    if (pumpTimerRef.current !== null) { clearTimeout(pumpTimerRef.current); pumpTimerRef.current = null }
    for (const k of ['rt', 'ct'] as const) {
      const h = timerEndRef.current[k]
      if (h !== null) { clearTimeout(h); timerEndRef.current[k] = null }
    }
  }, [])

  const processLine = useCallback((stream: string, lineText: string) => {
    const now       = Date.now()
    const firedSeq  = promptSeqRef.current
    const state     = stateRef.current
    const textLower = lineText.toLowerCase()

    for (const { rule, regex, fastLower } of compiledRef.current) {
      if (!rule.enabled || !regex) continue
      if (fastLower !== null && !textLower.includes(fastLower)) continue
      if (!isRuleActive(rule.groupIds ?? [], activeGroupStatesRef.current, rule.allGroups ?? false)) continue

      // Stream scope filter
      if (rule.watchStream !== 'any' && rule.watchStream !== stream) continue

      // Pattern match
      regex.lastIndex = 0
      const m = regex.exec(lineText)
      if (!m) continue

      // Cooldown
      if (rule.cooldownSeconds > 0) {
        const last = cooldownsRef.current[rule.id] ?? 0
        if (now - last < rule.cooldownSeconds * 1000) continue
      }

      // State gates
      if (!checkGates(rule.gates, state)) continue

      cooldownsRef.current[rule.id] = now

      // Named capture groups
      const groups: Record<string, string> = {}
      if (m.groups) {
        for (const [k, v] of Object.entries(m.groups)) {
          if (v !== undefined) groups[k] = v
        }
      }
      // Numbered capture groups ($1, $2, ...)
      for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) groups[String(i)] = m[i]
      }

      const vars = buildVars(m[0], lineText, groups, state)

      if (callbacks.onFire) {
        const parts: string[] = [`pattern: "${rule.pattern}"`]
        const gates = summarizeGates(rule.gates)
        if (gates) parts.push(gates)
        for (const a of rule.actions) parts.push(summarizeAction(a, vars))
        callbacks.onFire(rule.name || rule.pattern.slice(0, 60), lineText.slice(0, 120), parts.join(' | '), stream, rule.id)
      }

      for (const action of rule.actions) {
        executeAction(action, vars, callbacks, trackTimer, sendAfterRt, firedSeq)
      }

      if (rule.oneShot) {
        callbacks.disableTrigger(rule.id)
      }
    }
  }, [stateRef, callbacks, trackTimer, sendAfterRt])

  // `settled` = this change is not part of a server turn, so a command it
  // queues has no incoming RT to wait for (see noteTimer). -1 is below every
  // prompt count, so the RT queue treats the command as settled at once.
  // `onlyGated`: reach only rules with a CONDITION on this variable. Used by
  // the roundtime-end fire (noteTimer): a rule watching `rt` with no condition
  // fired once per roundtime before that fire existed, and would now fire
  // twice (start AND end) — two `attack`s per round. Only a rule that checks
  // the value (e.g. `rt = 0`) can tell the end from the start, so only those
  // hear it.
  const processVariableChange = useCallback((name: string, newValue: string, settled = false, onlyGated = false) => {
    const now   = Date.now()
    const firedSeq = settled ? -1 : promptSeqRef.current
    const state = stateRef.current

    for (const rule of varRulesRef.current) {
      if (!rule.enabled) continue
      if (!isRuleActive(rule.groupIds ?? [], activeGroupStatesRef.current, rule.allGroups ?? false)) continue
      if (!rule.watchVariable) continue
      if (rule.watchVariable.toLowerCase() !== name.toLowerCase()) continue
      if (onlyGated && !(rule.gates ?? []).some(g => g.variable === name)) continue

      if (rule.cooldownSeconds > 0) {
        const last = cooldownsRef.current[rule.id] ?? 0
        if (now - last < rule.cooldownSeconds * 1000) continue
      }

      if (!checkGates(rule.gates, state)) continue

      cooldownsRef.current[rule.id] = now

      // Variable-watch triggers have no regex match, so the only meaningful
      // capture is the new value itself ($0 / $match). Don't fake a $1.
      const vars = buildVars(newValue, newValue, {}, state)

      if (callbacks.onFire) {
        const parts: string[] = [`watch: $${rule.watchVariable} = "${newValue}"`]
        const gates = summarizeGates(rule.gates)
        if (gates) parts.push(gates)
        for (const a of rule.actions) parts.push(summarizeAction(a, vars))
        callbacks.onFire(rule.name || rule.watchVariable || rule.pattern.slice(0, 60), newValue.slice(0, 120), parts.join(' | '), `var:${name}`, rule.id)
      }

      for (const action of rule.actions) {
        executeAction(action, vars, callbacks, trackTimer, sendAfterRt, firedSeq)
      }

      if (rule.oneShot) callbacks.disableTrigger(rule.id)
    }
  }, [stateRef, callbacks, trackTimer, sendAfterRt, varRulesRef, cooldownsRef, activeGroupStatesRef])

  // ── RT / CT end ──────────────────────────────────────────────────────────
  //
  // DR announces a roundtime when it STARTS and says nothing when it ends, so a
  // variable trigger watching `rt` could only ever see the start. GameWindow
  // reports each RT/CT expiry here and we fire the variable change with `0` when
  // it runs out, so "when rt reaches 0" works — for rules with a condition on
  // that variable only (`onlyGated`), so a condition-less rule keeps firing once
  // per roundtime instead of twice.
  //
  // A newer expiry replaces the pending timer, so an extended RT fires once, at
  // its real end. The fire is `settled`: an RT running out is not a server turn,
  // so a queued command from it has nothing to wait for and must not sit out the
  // 1s settle cap. Cleared by cancelPending (disconnect, and GameWindow unmount,
  // so the window a character moved OUT of can't fire it a second time).
  const noteTimer = useCallback((name: 'rt' | 'ct', expires: number) => {
    const prev = timerEndRef.current[name]
    if (prev !== null) { clearTimeout(prev); timerEndRef.current[name] = null }
    const ms = expires - Date.now()
    if (ms <= 0) return
    timerEndRef.current[name] = setTimeout(() => {
      timerEndRef.current[name] = null
      processVariableChange(name, '0', true, true)
    }, ms)
  }, [processVariableChange])

  return { processLine, processVariableChange, cancelPending, notePrompt, noteTimer }
}
