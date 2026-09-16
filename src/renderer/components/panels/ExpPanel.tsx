// Experience panel — the skill readout. `skills` is GameWindow's raw per-skill
// component text (plus the `rexp` / `tdp` / `favor` / `sleep` meta keys); all
// line parsing and the sort live in the SHARED expParse.ts (`parseExp`,
// `MINDSTATES`, `dotBucket`, `sortSkillEntries` — moved there v0.19.0/v0.19.1
// so the Overview card reads and orders skills exactly as this panel does).
//
// Two renders over the same data: the FULL panel (Mind Locked / Learning
// groups, per-row mindstate bar + pin, Badging / Focus / Sort pickers, an
// `ExpFooter` with TDP / favor / sleep / Death's Sting and the self-calibrating
// Rested-XP widget) and the COMPACT text-forward view (`compactExp`,
// Rakkor/Morress) — a pure alternate render that reuses every helper here.
// The compact branch sits AFTER the hooks (Rules of Hooks). Per-character
// prefs persist via scopedKeys + `saveProfile`: `expSort`, `expSortDesc`
// (default descending), `expFocusMode`, and `rxpCapMin` (the RXP bar cap grows
// to the largest Stored/Usable ever observed, so it self-calibrates to the
// subscription tier). Badging templates come from focusTemplates.ts; `focus`
// itself is owned by the parent (`onFocusChange`). `memo`'d (B172) — callers
// must pass referentially stable callbacks and Sets.
import { memo, useState, useRef, useEffect, useLayoutEffect, type RefObject } from 'react'
import { FOCUS_OPTIONS, FOCUS_NONE, getSkillBadge, getSkillSortPriority, type SkillBadge } from '../../focusTemplates'
import { scopedKey } from '../../characterScope'
// v0.19.0: the mindstate ladder + line parser moved to a shared module so the
// Overview card reads a skill line the same way this panel does.
import { MINDSTATES, parseExp, dotBucket, sortSkillEntries, SORT_MODES, type SortMode } from '../../expParse'
import { useCharacter } from '../../CharacterContext'
import { useProfileSaver } from '../../hooks/useProfileSaver'

type FocusMode = 'none' | 'primary' | 'secondary' | 'tertiary'
const FOCUS_MODES: FocusMode[] = ['none', 'primary', 'secondary', 'tertiary']
const FOCUS_MODE_LABEL: Record<FocusMode, string> = {
  none: 'None', primary: 'Primary', secondary: 'Secondary', tertiary: 'Tertiary',
}
const FOCUS_MODE_PRIORITY: Record<FocusMode, number | null> = {
  none: null, primary: 0, secondary: 1, tertiary: 2,
}

interface Props {
  skills: Record<string, string>
  rankUpSkills?: Set<string>
  focus: string
  pinnedSkills: Set<string>
  onFocusChange: (focus: string) => void
  onTogglePin: (skill: string) => void
  // settings.compactExp (Rakkor/Morress): render the text-forward compact view
  // instead of the full panel (bars/pickers/groups). A pure alternate render —
  // reuses every parsing helper below.
  compactExp?: boolean
}

function SkillRow({
  skill, text, rankUp, pinned, onTogglePin, badge,
}: {
  skill: string; text: string; rankUp?: boolean; pinned: boolean; onTogglePin: () => void; badge?: SkillBadge
}) {
  const { rank, pctStr, mindstateIdx } = parseExp(text)
  const locked        = mindstateIdx === 34
  const mindstateName = MINDSTATES[mindstateIdx] ?? 'clear'
  const bucket        = dotBucket(mindstateIdx)
  const barPct        = Math.round((mindstateIdx / 34) * 100)
  const cls = [
    'exp-row',
    locked ? 'exp-row--locked'  : '',
    rankUp ? 'exp-row--rank-up' : '',
    pinned ? 'exp-row--pinned'  : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      <div className="exp-line">
        <button
          className={`exp-pin-btn${pinned ? ' exp-pin-btn--active' : ''}`}
          onClick={onTogglePin}
          title={pinned ? 'Unpin skill' : 'Pin to top'}
          tabIndex={-1}
        >◈</button>
        <span className="exp-skill">{skill}</span>
        <span className={badge ? `exp-badge exp-badge--${badge.toLowerCase()}` : 'exp-badge exp-badge--empty'}>{badge ?? ''}</span>
        <span className="exp-rank">{rank}</span>
        <span className="exp-pct">{pctStr}</span>
        <span className="exp-mindstate">{mindstateName}</span>
        <span className="exp-mindstate-frac">({mindstateIdx}/34)</span>
      </div>
      <div className="exp-bar-track">
        <div className={`exp-bar-fill exp-bar-fill--${bucket}`} style={{ width: `${barPct}%` }} />
      </div>
    </div>
  )
}

interface GroupProps {
  label: string
  count: number
  locked?: boolean
  defaultExpanded: boolean
  children: React.ReactNode
}

function ExpGroup({ label, count, locked = false, defaultExpanded, children }: GroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="exp-group">
      <button
        className={`exp-group-header${locked ? ' exp-group-header--locked' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`exp-chevron${expanded ? ' exp-chevron--open' : ''}`}>▶</span>
        {label} <span className="exp-group-count">({count})</span>
      </button>
      {expanded && <div className="exp-group-body">{children}</div>}
    </div>
  )
}

// Parses a single RXP time value as it appears in the game's `exp rexp`
// component. Formats: "2:25 hours" (H:MM), "2 hours" (H), "23 minutes" (M),
// "none" (zero). Returns minutes or null when unparseable.
function parseRexpTime(raw: string | undefined): number | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  if (s === 'none' || s === '') return 0
  const hm = s.match(/^(\d+):(\d+)\s*hour/)
  if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10)
  const h = s.match(/^(\d+)\s*hour/)
  if (h) return parseInt(h[1], 10) * 60
  const m = s.match(/^(\d+)\s*minute/)
  if (m) return parseInt(m[1], 10)
  return null
}

function formatRexpTime(min: number): string {
  if (min <= 0) return 'none'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${m.toString().padStart(2, '0')}h`
}

// Pull the three RXP times out of the `exp rexp` component text. Shared by the
// full panel's RestExpWidget and the compact view's bottom bar.
function parseRexp(rexp: string): { stored: number | null; usable: number | null; refresh: number | null } {
  return {
    stored:  parseRexpTime(rexp.match(/Stored:\s*(.*?)(?=\s{2,}|\s+Usable|$)/i)?.[1]),
    usable:  parseRexpTime(rexp.match(/Usable[^:]*:\s*(.*?)(?=\s{2,}|\s+Cycle|$)/i)?.[1]),
    refresh: parseRexpTime(rexp.match(/Refreshes:\s*(.*?)$/i)?.[1]),
  }
}

// Dual-bar Rested-Experience widget. Renders three values from the `exp rexp`
// component as two stacked progress bars (Stored, Usable This Cycle) plus a
// "resets in …" caption for the refresh countdown. The bar cap is the largest
// of (4h default, observed peak of Stored or Usable) so it self-calibrates to
// the player's subscription tier (Standard 4h / Premium 6h / Platinum 8h)
// without needing a manual setting — Premium users will see the cap grow the
// first time their Stored or Usable observation exceeds 4h. Persisted per
// character so the calibration survives across sessions.
function RestExpWidget({ rexp }: { rexp: string }) {
  const character = useCharacter()
  const { stored, usable, refresh } = parseRexp(rexp)

  const capKey = scopedKey(character, 'rxpCapMin')
  const [capMin, setCapMin] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(capKey) ?? '0', 10)
    return Math.max(240, isFinite(v) ? v : 0)
  })
  useEffect(() => {
    const observed = Math.max(stored ?? 0, usable ?? 0)
    if (observed > capMin) {
      setCapMin(observed)
      localStorage.setItem(capKey, String(observed))
    }
  }, [stored, usable, capMin, capKey])

  if (stored == null && usable == null) return null

  const storedPct = Math.min(100, Math.round(100 * (stored ?? 0) / capMin))
  const usablePct = Math.min(100, Math.round(100 * (usable ?? 0) / capMin))
  const storedEmpty = (stored ?? 0) === 0
  const usableEmpty = (usable ?? 0) === 0
  const barValue = (min: number, empty: boolean) => empty ? 'None' : formatRexpTime(min)

  return (
    <div className="exp-rxp" title={`Rested XP — Resets / Stored / Usable (cap ${formatRexpTime(capMin)})`}>
      <span className="exp-rxp-label">RXP</span>
      {refresh != null && refresh > 0 && (
        <span className="exp-rxp-refresh" title="Cycle resets in">↻ {formatRexpTime(refresh)}</span>
      )}
      <span className="exp-rxp-bar-group">
        <span className="exp-rxp-bar-tag">Stored</span>
        <span className="exp-rxp-bar-track">
          <span className={`exp-rxp-bar-fill ${storedEmpty ? 'exp-rxp-bar-fill--empty' : 'exp-rxp-bar-fill--stored'}`} style={{ width: `${storedPct}%` }} />
          <span className={`exp-rxp-bar-text ${storedEmpty ? 'exp-rxp-bar-text--empty' : ''}`}>{barValue(stored ?? 0, storedEmpty)}</span>
        </span>
      </span>
      <span className="exp-rxp-bar-group">
        <span className="exp-rxp-bar-tag">Usable</span>
        <span className="exp-rxp-bar-track">
          <span className={`exp-rxp-bar-fill ${usableEmpty ? 'exp-rxp-bar-fill--empty' : 'exp-rxp-bar-fill--usable'}`} style={{ width: `${usablePct}%` }} />
          <span className={`exp-rxp-bar-text ${usableEmpty ? 'exp-rxp-bar-text--empty' : ''}`}>{barValue(usable ?? 0, usableEmpty)}</span>
        </span>
      </span>
    </div>
  )
}

function ExpFooter({ skills }: { skills: Record<string, string> }) {
  const tdp   = (skills['tdp']   ?? '').match(/(\d+)/)?.[1]
  const favor = (skills['favor'] ?? '').match(/(\d+)/)?.[1]
  const rexp  = skills['rexp'] ?? ''
  const sleepRaw = (skills['sleep'] ?? '').trim()
  const sleepLevel = !sleepRaw ? 0 : /deep sleep/i.test(sleepRaw) ? 2 : 1
  const deathsSting = rexp.startsWith("[Because of Death's Sting")
  const hasRexp = !deathsSting && /Stored:|Usable/i.test(rexp)

  if (!tdp && !favor && !hasRexp && !sleepLevel && !deathsSting) return null

  return (
    <div className="exp-footer">
      <div className="exp-footer-row">
        {tdp        && <span className="exp-footer-item"><span className="exp-footer-label">TDP</span>{tdp}</span>}
        {favor      && <span className="exp-footer-item"><span className="exp-footer-label">Fav</span>{favor}</span>}
        {deathsSting && (
          <span className="exp-footer-item exp-footer-sting">Death's Sting</span>
        )}
        {sleepLevel > 0 && (
          <span className={`exp-footer-item exp-footer-sleep exp-footer-sleep--${sleepLevel}`}>
            {sleepLevel === 1 ? 'Resting' : 'Deep Sleep'}
          </span>
        )}
      </div>
      {hasRexp && <RestExpWidget rexp={rexp} />}
    </div>
  )
}

// B332: the picker menus hang inside the panel, and .panel-frame-body /
// .fl-body are overflow:hidden — so in a short panel a 320px menu was simply
// CLIPPED, the lower options unreachable. Bound it to the room left below the
// picker in whatever clips it (it then scrolls). Measured on open only.
function useMenuMaxHeight(open: boolean, wrapRef: RefObject<HTMLDivElement | null>): number | undefined {
  const [maxH, setMaxH] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    if (!open) return
    const wrap = wrapRef.current
    if (!wrap) return
    const clip = wrap.closest('.panel-frame-body, .fl-body')
    const bottom = clip ? clip.getBoundingClientRect().bottom : window.innerHeight
    const room = Math.floor(bottom - wrap.getBoundingClientRect().bottom - 4)
    setMaxH(Math.max(60, Math.min(320, room)))
  }, [open, wrapRef])
  return maxH
}

// B336 (UX #8): what each Badging / Focus choice does, shown under it the way
// the Sort picker explains its options.
const FOCUS_MODE_DESC: Record<FocusMode, string> = {
  none:      'Show every learning skill',
  primary:   'Only skills in the badged guild\'s Primary skillsets',
  secondary: 'Only skills in the badged guild\'s Secondary skillsets',
  tertiary:  'Only skills in the badged guild\'s Tertiary skillsets',
}

function BadgingPicker({ focus, onFocusChange }: { focus: string; onFocusChange: (f: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuMaxH = useMenuMaxHeight(open, ref)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="exp-focus-picker" ref={ref}>
      <button className="exp-picker-btn" onClick={() => setOpen(o => !o)}
        title="Badging — pick a guild to mark each skill P / S / T by that guild's Primary / Secondary / Tertiary skillset, and G for its guild-only skill. Set automatically from your INFO sheet; a manual pick holds until the next INFO.">
        <span className="exp-picker-label">Badging</span>
        <span className="exp-picker-value">{focus}</span>
        <span className="exp-picker-caret">▾</span>
      </button>
      {open && (
        <div className="exp-picker-menu" style={{ maxHeight: menuMaxH }}>
          {FOCUS_OPTIONS.map(f => (
            <button
              key={f}
              className={`exp-picker-option exp-sort-option${f === focus ? ' exp-picker-option--selected' : ''}`}
              onClick={() => { onFocusChange(f); setOpen(false) }}
            >
              <span>{f}</span>
              {f === FOCUS_NONE && <span className="exp-sort-option-hint">No P / S / T / G badges</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FocusModePicker({ mode, onModeChange }: { mode: FocusMode; onModeChange: (m: FocusMode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuMaxH = useMenuMaxHeight(open, ref)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="exp-focus-mode-picker" ref={ref}>
      <button className="exp-picker-btn" onClick={() => setOpen(o => !o)}
        title="Focus — narrow the Learning list to one skillset tier of the guild chosen in Badging (no effect while Badging is None)">
        <span className="exp-picker-label">Focus</span>
        <span className="exp-picker-value">{FOCUS_MODE_LABEL[mode]}</span>
        <span className="exp-picker-caret">▾</span>
      </button>
      {open && (
        <div className="exp-picker-menu" style={{ maxHeight: menuMaxH }}>
          {FOCUS_MODES.map(m => (
            <button
              key={m}
              className={`exp-picker-option exp-sort-option${m === mode ? ' exp-picker-option--selected' : ''}`}
              onClick={() => { onModeChange(m); setOpen(false) }}
            >
              <span>{FOCUS_MODE_LABEL[m]}</span>
              <span className="exp-sort-option-hint">{FOCUS_MODE_DESC[m]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// SortMode + the sort itself moved to expParse.ts in v0.19.1 so the Overview
// card's compact view orders skills EXACTLY as this panel does.
const SORT_LABEL: Record<SortMode, string> = { alpha: 'Alpha', rate: 'Rate', rank: 'Rank', next: 'Next' }
const SORT_DESC_TEXT: Record<SortMode, string> = {
  alpha: 'Alphabetical by skill name',
  rate:  'Most actively learning first',
  rank:  'Highest rank first',
  next:  'Closest to ranking up first',
}

function SortPicker({ mode, desc, onModeChange, onDescChange }: {
  mode: SortMode; desc: boolean
  onModeChange: (m: SortMode) => void; onDescChange: (d: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuMaxH = useMenuMaxHeight(open, ref)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="exp-sort-picker" ref={ref}>
      <button className="exp-picker-btn" onClick={() => setOpen(o => !o)}>
        <span className="exp-picker-label">Sort</span>
        <span className="exp-picker-value">{SORT_LABEL[mode]}</span>
        <span className="exp-sort-dir-badge">{desc ? '↓' : '↑'}</span>
        <span className="exp-picker-caret">▾</span>
      </button>
      {open && (
        <div className="exp-picker-menu" style={{ maxHeight: menuMaxH }}>
          {(
            <div className="exp-sort-dir-row">
              <button className={`exp-sort-dir-btn${desc ? ' exp-sort-dir-btn--active' : ''}`}
                onClick={() => onDescChange(true)}>↓ Desc</button>
              <button className={`exp-sort-dir-btn${!desc ? ' exp-sort-dir-btn--active' : ''}`}
                onClick={() => onDescChange(false)}>↑ Asc</button>
            </div>
          )}
          {SORT_MODES.map(m => (
            <button
              key={m}
              className={`exp-picker-option exp-sort-option${m === mode ? ' exp-picker-option--selected' : ''}`}
              onClick={() => { onModeChange(m); setOpen(false) }}
            >
              <span>{SORT_LABEL[m]}</span>
              <span className="exp-sort-option-hint">{SORT_DESC_TEXT[m]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


// Compact, text-forward exp view (Rakkor/Morress; settings.compactExp). A pure
// alternate render of the SAME data the full panel uses — reuses parseExp,
// dotBucket, getSkillBadge, sortEntries, parseRexp, formatRexpTime and the
// meta-key filter. No progress bars, pins, mindstate words, pickers, or group
// headers: just Skill · Ranks · % · (n/34) tinted by mindstate, a summary top
// bar (Learning count · TDP · Fav), and a bottom bar (reset · RXP · Usable).
function CompactExpView({ skills, rankUpSkills, pinnedSkills, sortMode, sortDesc, onTogglePin }: {
  skills: Record<string, string>; rankUpSkills?: Set<string>
  pinnedSkills: Set<string>; sortMode: SortMode; sortDesc: boolean
  onTogglePin: (skill: string) => void
}) {
  const active = Object.entries(skills).filter(([k, text]) =>
    k !== 'rexp' && k !== 'tdp' && k !== 'favor' && k !== 'sleep' &&
    parseExp(text).mindstateIdx > 0
  )
  const rows = sortSkillEntries(active, pinnedSkills, sortMode, sortDesc)

  const tdp   = (skills['tdp']   ?? '').match(/(\d+)/)?.[1]
  const favor = (skills['favor'] ?? '').match(/(\d+)/)?.[1]
  const rexp  = skills['rexp'] ?? ''
  const { stored, usable, refresh } = parseRexp(rexp)
  const sleepRaw = (skills['sleep'] ?? '').trim()
  const deathsSting = rexp.startsWith("[Because of Death's Sting")
  const hasBottom = (refresh ?? 0) > 0 || stored != null || usable != null || deathsSting || !!sleepRaw

  return (
    <div className="exp-compact">
      <div className="exp-compact-top">
        <span className="exp-compact-title">EXP</span>
        <span className="exp-compact-stat"><span className="exp-compact-stat-label">Learning</span>{active.length}</span>
        {tdp   && <span className="exp-compact-stat"><span className="exp-compact-stat-label">TDP</span>{tdp}</span>}
        {favor && <span className="exp-compact-stat"><span className="exp-compact-stat-label">Fav</span>{favor}</span>}
      </div>
      <div className="exp-compact-rows">
        {/* B385: `ui-empty` (--text-muted), not the old --text-faint class, and
            an empty map is "no data yet", not "nothing training" — see the full
            panel's empty state below. */}
        {rows.length === 0 && (
          <div className="ui-empty">
            {Object.keys(skills).length === 0 ? 'Waiting for experience data from the game.' : 'No skills actively training.'}
          </div>
        )}
        {rows.map(([skill, text]) => {
          const { rank, pctStr, mindstateIdx } = parseExp(text)
          const bucket = dotBucket(mindstateIdx)
          const pinned = pinnedSkills.has(skill)
          return (
            <div key={skill}
              className={`exp-compact-row exp-compact-row--${bucket}${rankUpSkills?.has(skill) ? ' exp-compact-row--rankup' : ''}${pinned ? ' exp-compact-row--pinned' : ''}`}>
              <button
                className={`exp-compact-pin${pinned ? ' exp-compact-pin--active' : ''}`}
                onClick={() => onTogglePin(skill)}
                title={pinned ? 'Unpin skill' : 'Pin to top'}
                tabIndex={-1}
              >◈</button>
              <span className="exp-compact-name">{skill}</span>
              <span className="exp-compact-rank">{rank}</span>
              <span className="exp-compact-pct">{pctStr}</span>
              <span className="exp-compact-rate">{mindstateIdx}/34</span>
            </div>
          )
        })}
      </div>
      {hasBottom && (
        <div className="exp-compact-bottom">
          {(refresh ?? 0) > 0 && <span className="exp-compact-bstat" title="Cycle resets in"><span className="exp-compact-bicon">↻</span>{formatRexpTime(refresh!)}</span>}
          {stored != null && <span className="exp-compact-bstat"><span className="exp-compact-stat-label">RXP</span>{formatRexpTime(stored)}</span>}
          {usable != null && <span className="exp-compact-bstat"><span className="exp-compact-stat-label">Usable</span>{formatRexpTime(usable)}</span>}
          {deathsSting && <span className="exp-compact-bstat exp-footer-sting">Death's Sting</span>}
          {!deathsSting && sleepRaw && <span className="exp-compact-bstat">{/deep sleep/i.test(sleepRaw) ? 'Deep Sleep' : 'Resting'}</span>}
        </div>
      )}
    </div>
  )
}

// B172: memoized — re-renders only when its own props (or consumed context
// values, which GameWindow now useMemo's) change, not on every GameWindow
// render. Parent must pass referentially stable callbacks/Sets (see
// PanelFrame's renderPanel + the module-level fallback constants there).
export default memo(function ExpPanel({ skills, rankUpSkills, focus, pinnedSkills, onFocusChange, onTogglePin, compactExp }: Props) {
  const character = useCharacter()
  const saveProfile = useProfileSaver()
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem(scopedKey(character, 'expSort'))
    if (stored === 'guild' || stored === 'focus') return 'alpha'
    return (SORT_MODES.includes(stored as SortMode) ? stored : 'alpha') as SortMode
  })
  const [focusMode, setFocusMode] = useState<FocusMode>(() =>
    (localStorage.getItem(scopedKey(character, 'expFocusMode')) as FocusMode | null) ?? 'none'
  )
  // Default to descending when no value is stored — matches the user's
  // expectation that high-rank skills appear first on a fresh install. User
  // can still flip to ascending via the toggle and it persists.
  const [sortDesc, setSortDesc] = useState<boolean>(() => {
    const stored = localStorage.getItem(scopedKey(character, 'expSortDesc'))
    return stored === null ? true : stored === 'desc'
  })

  function handleModeChange(next: SortMode) {
    setSortMode(next)
    localStorage.setItem(scopedKey(character, 'expSort'), next)
    saveProfile()
  }

  function handleDescChange(next: boolean) {
    setSortDesc(next)
    localStorage.setItem(scopedKey(character, 'expSortDesc'), next ? 'desc' : 'asc')
    saveProfile()
  }

  function handleFocusModeChange(next: FocusMode) {
    setFocusMode(next)
    localStorage.setItem(scopedKey(character, 'expFocusMode'), next)
    saveProfile()
  }

  // Compact mode: a pure alternate render over the same data, using the
  // character's existing sort preference. Branch AFTER the hooks (Rules of
  // Hooks) so they always run regardless of mode.
  if (compactExp) {
    return <CompactExpView skills={skills} rankUpSkills={rankUpSkills}
      pinnedSkills={pinnedSkills} sortMode={sortMode} sortDesc={sortDesc} onTogglePin={onTogglePin} />
  }

  const active = Object.entries(skills).filter(([k, text]) =>
    k !== 'rexp' && k !== 'tdp' && k !== 'favor' && k !== 'sleep' &&
    parseExp(text).mindstateIdx > 0
  )

  const locked    = active.filter(([, t]) => parseExp(t).mindstateIdx === 34)
  const training  = active.filter(([, t]) => parseExp(t).mindstateIdx < 34)

  const focusActive = focus !== FOCUS_NONE
  const targetPriority = FOCUS_MODE_PRIORITY[focusMode]
  const filteredTraining = (targetPriority === null || !focusActive)
    ? training
    : training.filter(([skill]) => getSkillSortPriority(focus, skill) === targetPriority)
  const learning = sortSkillEntries(filteredTraining, pinnedSkills, sortMode, sortDesc)

  function skillRow(skill: string, text: string) {
    return (
      <SkillRow
        key={skill} skill={skill} text={text}
        rankUp={rankUpSkills?.has(skill)}
        pinned={pinnedSkills.has(skill)}
        onTogglePin={() => onTogglePin(skill)}
        badge={focusActive ? (getSkillBadge(focus, skill) ?? undefined) : undefined}
      />
    )
  }

  return (
    <div className="exp-panel">
      <div className="exp-ctrl-bar">
        <BadgingPicker focus={focus} onFocusChange={onFocusChange} />
        <FocusModePicker mode={focusMode} onModeChange={handleFocusModeChange} />
        <SortPicker mode={sortMode} desc={sortDesc} onModeChange={handleModeChange} onDescChange={handleDescChange} />
      </div>
      <div className="exp-panel-body">
        {/* B407: sentence case, matching the Overview's "Mind locked" chip. */}
        <ExpGroup label="Mind locked" count={locked.length} locked defaultExpanded={false}>
          {locked.map(([skill, text]) => skillRow(skill, text))}
        </ExpGroup>
        <ExpGroup label="Learning" count={learning.length} defaultExpanded={true}>
          {learning.map(([skill, text]) => skillRow(skill, text))}
        </ExpGroup>
        {/* B385: the skills map keeps a key for every exp component once the
            game has sent one, so an EMPTY map means no data has arrived yet —
            don't claim "nothing training" before the panel could know. And
            `ui-empty` (--text-muted) rather than the old --text-faint class,
            which measures 2.3:1 on Classic Light. */}
        {active.length === 0 && (
          <div className="ui-empty">
            {Object.keys(skills).length === 0 ? 'Waiting for experience data from the game.' : 'No skills actively training.'}
          </div>
        )}
      </div>
      <ExpFooter skills={skills} />
    </div>
  )
})
