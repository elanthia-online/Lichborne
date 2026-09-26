// ColorField — the ONE color control every rule editor uses (F115, v0.19.8;
// UX standard #12). It replaced eleven hand-rolled "native picker + hex box"
// pairs: Highlights ×3, contact templates ×6, Groups, and the trigger echo.
//
// What it adds over those pairs is the LINK. Picking one of your colors stores
// `var(--lb-color-<id>, #fallback)` (colors.ts), so the field follows every
// later edit to that color. A linked field shows the color's NAME as a chip; an
// unlinked one keeps the old free-text box (a #hex, a color name that resolves
// on blur, or — for the trigger echo — a `$variable`).
//
// Three ways in, because a swatch alone doesn't read as a button:
//   • the ▾ beside the text box (and on the chip) opens the full menu;
//   • clicking the swatch opens the same menu;
//   • TYPING a name opens a suggestion list (`suggestColors`) — your colors
//     first. ↑/↓ move, Enter or a click picks, Esc closes just the list. The
//     list is a combobox (role="combobox" + aria-activedescendant), so focus
//     never leaves the text box while you browse it.
//
// The popover offers, in order: your colors (linking), the built-ins (copied
// as hex — a built-in never changes, so there is nothing to follow), a native
// picker for anything else, an optional "none" choice, then Unlink (keep the
// exact color, stop following), "Save as a color…" (name what you're using
// and link it on the spot), and "Manage colors…" when the host provides
// ColorManageContext.
//
// TWO PROPS change what the control means, and the Theme Editor passes both
// (F116, DESIGN §49.6b):
//   • allowLink={false} — picking one of your colors COPIES its hex instead of
//     following it. A theme travels in a file that carries no palette, so it
//     must not depend on an entry only its author has. `storedFor` is the one
//     place that decides, so the popover, the type-ahead and "Save as a
//     color…" cannot disagree.
//   • commitTyped — hold typing in a local `draft` and tell the host only once
//     the text is a whole color. A host whose onChange applies IMMEDIATELY
//     (the Theme Editor repaints the app) must pass this, or a half-typed
//     "#3f" is written straight into a theme variable (B387). Read `typed`
//     (draft ?? value), never `value`, for anything that follows the BOX.
//
// Popover mechanics are GroupPicker's: portaled to document.body at z 450 (the
// dialog-popover tier, pitfall #118), closes on an outside mousedown, and
// consumes Esc with preventDefault so the dialog under it stays open (pitfall
// #141). Placement is its own thing: `placeMenu` measures the menu's REAL
// height after it renders and SHIFTS it to sit fully on screen, capping the
// height only when the viewport itself is too short (pitfall #109). Capping to
// the room on one side — GroupPicker's rule, and what this shipped with — made
// a field near the middle of a short window open a box smaller than its own
// content, so "Save as a color…" pushed the Save and Cancel buttons below the
// fold (Sekmeht, Contacts → Templates).

// Aliased: the outside-click effect below handles the DOM's own KeyboardEvent.
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  CURATED_COLORS, PALETTE_CHANGED_EVENT, COLOR_INPUT_TITLE, type CustomColor,
  activeCustomColors, colorHex, colorLabel, colorLink, expandHex, findCustomColorByName,
  hexFromTyped, linkedColor, loadCustomColors, newColorId, normalizeColorInput, parseColorLink,
  resolveColor, resolveColorChoice,
  saveCustomColors, suggestColors, tidyColorName, validateCustomColorName, type ColorSuggestion,
} from '../colors'
import { scheduleSharedProfileSave } from '../profile'
import { cancelBackdropPress } from '../utils/backdropClose'

/** Provided by a host that can show the Colors tab; absent = no "Manage colors…". */
export const ColorManageContext = createContext<(() => void) | null>(null)

function subscribePalette(cb: () => void): () => void {
  document.addEventListener(PALETTE_CHANGED_EVENT, cb)
  return () => document.removeEventListener(PALETTE_CHANGED_EVENT, cb)
}

/** The whole palette (retired included), re-rendering on any change in any window. */
export function usePalette(): CustomColor[] {
  // loadCustomColors returns a cached array whose identity only changes when
  // the palette does — a valid external-store snapshot (pitfall #129).
  return useSyncExternalStore(subscribePalette, loadCustomColors)
}

/** Save the palette: the working copy, every window's variables, and _shared.yaml. */
export function savePalette(list: CustomColor[]): void {
  saveCustomColors(list)
  scheduleSharedProfileSave()
}

// Built-ins as offered: `grey` is only an alternate spelling of `gray`.
const BUILT_INS = Object.entries(CURATED_COLORS).filter(([n]) => n !== 'grey')

function CaretIcon() {
  return (
    <svg className="ui-color-caret" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.8"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export interface ColorFieldProps {
  value: string
  onChange: (value: string) => void
  /** Accessible name, e.g. "Text color". */
  label: string
  /** An explicit "none" choice: the value it stores and what the button says. */
  none?: { value: string; label: string }
  /** What the swatch shows when the value has no color of its own. */
  defaultSwatch?: string
  placeholder?: string
  /** Enter in the text box (a host that saves on Enter). */
  onEnter?: () => void
  /**
   * Whether picking one of YOUR colors stores a LINK that follows later edits
   * (the default) or COPIES the hex it stands for right now.
   *
   * The Theme Editor passes false. A theme is handed to other people — through
   * `exportTheme`'s .lichborne-theme.json, which carries no palette — so it must
   * not depend on a palette entry only its author has (DESIGN §37.2, §49). The
   * palette is a swatch book there, not a live reference.
   */
  allowLink?: boolean
  /**
   * Tooltip for the text box. Defaults to COLOR_INPUT_TITLE, which promises the
   * link; a host passing `allowLink={false}` should pass the matching wording
   * (THEME_COLOR_INPUT_TITLE) so the field never claims a link it won't make.
   */
  title?: string
  /**
   * Hold typing in a local draft and tell the host only once the text is a
   * COMPLETE color (a full #rrggbb as you type, or a name resolved on
   * blur/Enter). Default false: a rule editor's draft isn't live, so writing
   * each keystroke through is free.
   *
   * The Theme Editor passes true, because its onChange repaints the whole app
   * immediately — a half-typed "#3f" would be applied as a theme variable
   * (B387).
   */
  commitTyped?: boolean
  /**
   * The field sits in a dialog ABOVE the dialog-popover tier (450) — Edit
   * Profile's `.cne-backdrop` is 1600 — so its portaled menus must open above
   * that too, or they paint underneath the dialog and the ▾ looks dead
   * (pitfall #118). Adds `ui-menu--top-tier`.
   */
  aboveDialogs?: boolean
}

const HEX6 = /^#[0-9a-fA-F]{6}$/

export default function ColorField({
  value, onChange, label, none, defaultSwatch, placeholder, onEnter,
  allowLink = true, commitTyped = false, title = COLOR_INPUT_TITLE, aboveDialogs = false,
}: ColorFieldProps) {
  const palette = usePalette()
  const manage = useContext(ColorManageContext)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number }>({ top: -9999, left: 0, maxHeight: 0 })
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Whichever control opened the menu gets focus back when it closes.
  const openerRef = useRef<HTMLElement | null>(null)
  // Type-ahead: open while typing, closed on blur / Esc / a pick.
  const [suggestOpen, setSuggestOpen] = useState(false)
  // Only used when `commitTyped` — the half-typed text the host hasn't been
  // told about yet. Null means "showing the stored value".
  const [draft, setDraft] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [suggestPos, setSuggestPos] = useState<{ top: number; left: number; minWidth: number; maxHeight: number }>({ top: 0, left: 0, minWidth: 0, maxHeight: 240 })
  const suggestRef = useRef<HTMLUListElement | null>(null)
  const listId = useId()

  // If the stored value changes from OUTSIDE the text box (the popover, a
  // reset) while a name is half-typed, drop the draft so it can't mask the new
  // value. A committed full-hex edit sets value to exactly what was typed, so
  // this never interrupts hex typing.
  useEffect(() => { setDraft(null) }, [value])

  // `palette` is a dependency so a rename or recolor elsewhere updates the chip.
  // Memoized: a fresh object each render would change `suggestions`' deps
  // every time and re-run suggestColors on every keystroke of every field.
  const link = useMemo(() => parseColorLink(value), [value])
  const linked = useMemo(() => linkedColor(value), [value, palette]) // eslint-disable-line react-hooks/exhaustive-deps
  const hex = useMemo(() => colorHex(value), [value, palette]) // eslint-disable-line react-hooks/exhaustive-deps
  const yourColors = useMemo(() => activeCustomColors(palette), [palette])
  const swatch = hex ?? defaultSwatch ?? null
  // What is IN THE BOX — the draft while `commitTyped` is holding typing back,
  // otherwise the stored value (draft is always null without it).
  //
  // The type-ahead must match this, NOT `value`: under `commitTyped` the stored
  // value is still the old hex while you type, and `suggestColors` bails on
  // anything starting with '#', so suggesting from `value` silently offered
  // nothing at all in the Theme Editor. `link`, `hex` and the swatch stay on
  // `value` on purpose — the swatch shows the colour still in effect until the
  // typing is committed.
  const typed = draft ?? value
  const suggestions = useMemo(() => (link ? [] : suggestColors(typed, palette)), [typed, palette, link])
  const showSuggest = suggestOpen && suggestions.length > 0 && !open
  const activeSuggestion = showSuggest ? suggestions[Math.min(activeIdx, suggestions.length - 1)] : undefined

  // Place the list under the text box — the same measured rule `placeMenu`
  // uses below, not a guess.
  //
  // This used to estimate the height (`8 * 28 + 10`) and, on the flip-above
  // branch, set only `bottom` with no cap. In a short window with the field
  // mid-height that anchored the list bottom-at-the-field and let it extend
  // off the TOP, where no scrolling reaches the first rows — the exact failure
  // `placeMenu` was rebuilt for, thirty lines away (B429). Measure, try below,
  // flip above, else shift onto the screen.
  const placeSuggest = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect()
    const el = suggestRef.current
    if (!rect || !el) return
    const MARGIN = 8, GAP = 2
    const vh = window.innerHeight
    const maxHeight = Math.max(120, Math.min(240, vh - MARGIN * 2))
    const height = Math.min(el.scrollHeight, maxHeight)
    let top = rect.bottom + GAP
    if (top + height > vh - MARGIN) top = rect.top - GAP - height
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - height))
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - el.offsetWidth - MARGIN))
    // Same numbers → same object, or the layout effect would re-run forever.
    setSuggestPos(prev => (prev.top === top && prev.left === left
      && prev.minWidth === rect.width && prev.maxHeight === maxHeight
      ? prev : { top, left, minWidth: rect.width, maxHeight }))
  }, [])

  useLayoutEffect(() => {
    if (showSuggest) placeSuggest()
  }, [showSuggest, suggestions.length, placeSuggest])

  // Place the menu against its REAL height: under the field, flipped above when
  // that overflows, and shifted onto the screen when neither side fits. Only a
  // viewport shorter than the menu makes it scroll.
  const placeMenu = useCallback(() => {
    const anchor = wrapRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!anchor || !menu) return
    const MARGIN = 8, GAP = 4
    const vh = window.innerHeight
    const maxHeight = Math.max(160, vh - MARGIN * 2)
    const height = Math.min(menu.scrollHeight, maxHeight)
    let top = anchor.bottom + GAP
    if (top + height > vh - MARGIN) top = anchor.top - GAP - height          // flip above
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - height))              // else shift on screen
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - menu.offsetWidth - MARGIN))
    // Same numbers → same object, or the layout effect below would re-run forever.
    setPos(prev => (prev.top === top && prev.left === left && prev.maxHeight === maxHeight
      ? prev : { top, left, maxHeight }))
  }, [])

  // Before paint, and again whenever the content grows ("Save as a color…"
  // adds a row).
  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
    // A viewport too short to hold the whole menu still has to show the row
    // the user just opened.
    if (saving) menuRef.current?.querySelector('.ui-color-save')?.scrollIntoView({ block: 'nearest' })
  }, [open, saving, saveError, yourColors.length, placeMenu])

  // The field can move under EITHER popover: the dialog's form scrolls, or the
  // window is resized. Re-place instead of leaving one stranded beside where the
  // field used to be. rAF-throttled, because placing reads layout.
  useEffect(() => {
    if (!open && !showSuggest) return
    let pending = 0
    const onMove = (e: Event) => {
      // A popover's own scrolling is not the field moving.
      if (e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        if (open) placeMenu()
        if (showSuggest) placeSuggest()
      })
    }
    window.addEventListener('resize', onMove)
    document.addEventListener('scroll', onMove, true)
    return () => {
      if (pending) cancelAnimationFrame(pending)
      window.removeEventListener('resize', onMove)
      document.removeEventListener('scroll', onMove, true)
    }
  }, [open, showSuggest, placeMenu, placeSuggest])

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      // The whole field counts as inside, so clicking the chip while the menu
      // is open closes it (toggle) instead of closing then re-opening it.
      if (wrapRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return
      // This press has been spent closing the menu. Without forgetting it, the
      // click that follows also reads as a press on the host dialog's backdrop
      // and one click outside would close both (pitfall #146).
      cancelBackdropPress()
      close(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(true) }
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    // Keyboard users land inside the menu, on the current choice if there is one.
    const target = menuRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?? menuRef.current?.querySelector<HTMLElement>('button, input')
    target?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // The field's own focusable, best first. Used whenever the control someone
  // was on has been replaced: picking one of your colors from the TEXT BOX
  // mints a link, so the box unmounts and the chip takes its place, and Unlink
  // does the reverse. Focusing the detached node silently drops focus to
  // <body>, which strands a keyboard user outside the dialog.
  const focusField = useCallback(() => {
    const w = wrapRef.current
    // Asked in ORDER, one query at a time. A single querySelector with a
    // selector LIST returns the first match in DOCUMENT order, not the first
    // selector that matches — and the swatch button is rendered before the box,
    // so the one-call version always landed on the swatch. That silently broke
    // the promise below: picking from the type-ahead is supposed to leave the
    // caret in the text box.
    const target = w?.querySelector<HTMLElement>('.ui-color-chip')
      ?? w?.querySelector<HTMLElement>('.ui-color-text')
      ?? w?.querySelector<HTMLElement>('.ui-color-swatch')
    target?.focus()
  }, [])

  function close(refocus: boolean) {
    setOpen(false)
    setSaving(false)
    setSaveError(null)
    // Deferred: at this point React hasn't re-rendered, so the opener still
    // looks connected even when this very pick is about to unmount it.
    if (refocus) requestAnimationFrame(() => {
      const opener = openerRef.current
      if (opener?.isConnected) opener.focus()
      else focusField()
    })
  }

  // Leaving the "Save as a color…" row: its name box goes with it, so focus has
  // to land back on the button that opened it.
  function cancelSave() {
    setSaving(false)
    setSaveError(null)
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('.ui-color-save-btn')?.focus())
  }

  // The menu is a role="dialog", so Tab must stay inside it. Without this, one
  // Tab leaves for the page behind — and the menu is portaled to the end of
  // <body>, so there is nothing after it to land on.
  function trapTab(e: ReactKeyboardEvent) {
    if (e.key !== 'Tab') return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input') ?? [])
    if (items.length === 0) return
    const edge = e.shiftKey ? items[0] : items[items.length - 1]
    if (document.activeElement !== edge) return
    e.preventDefault()
    ;(e.shiftKey ? items[items.length - 1] : items[0]).focus()
  }

  function toggle(opener?: HTMLElement | null) {
    if (open) { close(false); return }
    openerRef.current = opener ?? btnRef.current
    setSuggestOpen(false)
    setSaveName('')
    // Rendered off-screen for one frame; placeMenu measures the real thing and
    // puts it where it fits, before the browser paints.
    setPos({ top: -9999, left: 0, maxHeight: window.innerHeight - 16 })
    setOpen(true)
  }

  /**
   * What picking one of YOUR colors stores: the link that follows it, or a copy
   * of the hex it is right now (`allowLink`). ONE decision point, so the
   * popover, the type-ahead list and "Save as a color…" can't disagree.
   */
  function storedFor(c: { hex: string }, link: string): string {
    return allowLink ? link : expandHex(c.hex)
  }

  /** Resolve typed text. Mirrors `normalizeColorInput`'s tiers, but returns
   *  null when nothing matched, so the caller can keep the stored value. */
  function resolveTyped(t: string): string | null {
    return allowLink ? resolveColorChoice(t) : resolveColor(t)
  }

  /**
   * Commit half-typed text (the `commitTyped` hosts). Only a real CHANGE is
   * reported: the field can be showing a hex resolved from an expression the
   * theme stores as `var(--x)` / `color-mix(…)`, and committing that same hex
   * back would freeze the expression into a literal and mark the theme unsaved
   * on a mere click-through.
   */
  function commitDraft(rawText: string) {
    const t = rawText.trim()
    if (none && t === '') {
      // Already showing none? Do nothing. A host may signal "none" either by
      // storing the none value (the rule editors) or by handing us an EMPTY
      // string (the Theme Editor's preset highlight, which renders '' rather
      // than the word "transparent"), so both count — otherwise clearing an
      // already-empty box would write a redundant change.
      if (!isNone(value)) onChange(none.value)
      setDraft(null)
      return
    }
    // ONE predicate for "is this typed token a hex", shared with
    // `normalizeColorInput` (colors.ts). These two used to disagree in opposite
    // directions: `#fff` was rejected HERE (so the Theme Editor silently
    // reverted it) while a bare `3fb950` was kept THERE as text that painted
    // nothing. A NAME still wins over a bare token — `red` is the curated red.
    const resolved = t.startsWith('#')
      ? hexFromTyped(t)
      : (resolveTyped(t) ?? hexFromTyped(t))
    if (resolved && resolved.toLowerCase() !== value.toLowerCase()) onChange(resolved)
    setDraft(null)   // unresolvable text reverts to the stored value
  }

  /**
   * "None" has TWO spellings and both must count. A rule editor stores the none
   * value itself ('transparent'); the Theme Editor's preset highlight hands us
   * an EMPTY string and keeps 'transparent' in the theme. Comparing only
   * against `none.value` meant the popover's "No highlight" never rendered as
   * the current choice there, and picking it wrote a change that wasn't one.
   */
  const isNone = (v: string) => !!none && (v === none.value || v === '')

  /**
   * Would storing `next` actually change the value? Case-insensitive, because a
   * theme can carry a hand-edited or imported `#3FB950` while every color we
   * offer is lowercase — picking the built-in already in effect would otherwise
   * mark the theme unsaved for a click that changed nothing.
   */
  function wouldChange(next: string): boolean {
    if (next.toLowerCase() === value.toLowerCase()) return false
    if (none && next === none.value && isNone(value)) return false
    return true
  }

  function pick(next: string) {
    if (wouldChange(next)) onChange(next)
    close(true)
  }

  // A pick from the type-ahead. Focus stays in the field: the text box, or the
  // chip that replaces it when the pick is one of your colors.
  function pickSuggestion(sg: ColorSuggestion) {
    // sg.value is the LINK for one of yours; sg.hex is the color it stands for.
    const next = allowLink ? sg.value : expandHex(sg.hex)
    setDraft(null)
    if (wouldChange(next)) onChange(next)
    setSuggestOpen(false)
    requestAnimationFrame(focusField)
  }

  function saveAsColor() {
    const current = hex
    if (!current) return
    const name = tidyColorName(saveName)
    const existing = findCustomColorByName(name, true)
    const err = validateCustomColorName(name)
      ?? (existing?.retired ? `"${existing.name}" is a removed color. Restore it in Automations → Colors.` : null)
      ?? (existing ? `You already have a color named "${existing.name}".` : null)
    if (err) { setSaveError(err); return }
    const list = loadCustomColors()
    const color: CustomColor = { id: newColorId(list), name, hex: expandHex(current) }
    savePalette([...list, color])
    pick(storedFor(color, colorLink(color)))
  }

  const chipTitle = !link ? ''
    : !linked ? `The color this was linked to was deleted, so it keeps ${link.fallback ?? 'its last color'}. Click to choose another.`
    : linked.retired ? `Linked to "${linked.name}" (${linked.hex}), which you removed. It keeps that color. Click to choose another.`
    : `Linked to your color "${linked.name}" (${linked.hex}). Change it in Automations → Colors and this follows. Click to choose another.`

  return (
    <div className="ui-color" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`ui-color-swatch${swatch ? '' : ' ui-color-swatch--none'}`}
        style={swatch ? { background: swatch } : undefined}
        onClick={e => toggle(e.currentTarget)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: choose a color`}
        title="Choose a color"
      />
      {link ? (
        <button
          type="button"
          className={`ui-color-chip${!linked || linked.retired ? ' ui-color-chip--stale' : ''}`}
          onClick={e => toggle(e.currentTarget)}
          title={chipTitle}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`${label}: ${colorLabel(value)}, linked. Choose a color`}
        >
          <LinkIcon />
          <span className="ui-color-chip-name">{colorLabel(value)}</span>
          <CaretIcon />
        </button>
      ) : (
        <span className="ui-color-combo">
          <input
            ref={inputRef}
            className="ui-field ui-field--code ui-color-text"
            value={typed}
            placeholder={placeholder}
            title={title}
            aria-label={label}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggest}
            aria-controls={showSuggest ? listId : undefined}
            aria-activedescendant={activeSuggestion ? `${listId}-${suggestions.indexOf(activeSuggestion)}` : undefined}
            onChange={e => {
              const v = e.target.value
              setSuggestOpen(true)
              setActiveIdx(0)
              // commitTyped: hold it back until it is a whole color, but let a
              // complete hex through as it is typed — it IS a valid color.
              if (!commitTyped) { onChange(v); return }
              setDraft(v)
              if (HEX6.test(v)) onChange(v)
            }}
            onBlur={e => {
              setSuggestOpen(false)
              if (commitTyped) {
                // Only what was TYPED: tabbing through an untouched field must
                // never rewrite it.
                if (draft !== null) commitDraft(e.target.value)
                return
              }
              const v = normalizeColorInput(e.target.value, { link: allowLink })
              if (v !== e.target.value) onChange(v)
            }}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing) return
              if (showSuggest) {
                const n = suggestions.length
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (Math.min(i, n - 1) + 1) % n); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (Math.min(i, n - 1) - 1 + n) % n); return }
                // Enter picks, and claims the key so neither onEnter nor a
                // form's Enter-to-save runs on this press.
                if (e.key === 'Enter' && activeSuggestion) { e.preventDefault(); pickSuggestion(activeSuggestion); return }
                // Esc closes the list; preventDefault keeps the dialog under it
                // open (pitfall #141). It ALSO throws away a half-typed draft,
                // because the list is only ever showing while you are typing —
                // leaving the text behind would make "Esc undoes my typing" a
                // two-press gesture, which is not what it did before this
                // control absorbed the Theme Editor's own text box.
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSuggestOpen(false)
                  if (commitTyped) setDraft(null)
                  return
                }
              }
              // Esc on a half-typed value throws the draft away and is consumed,
              // so the dialog stays open (pitfall #141). With no draft it falls
              // through to the dialog's own close.
              if (commitTyped && e.key === 'Escape' && draft !== null) {
                e.preventDefault()
                setDraft(null)
                return
              }
              // Alt+↓ (the usual combobox key), or ↓ in an empty box, opens the full menu.
              if (e.key === 'ArrowDown' && (e.altKey || !e.currentTarget.value.trim())) {
                e.preventDefault()
                toggle(e.currentTarget)
                return
              }
              if (e.key !== 'Enter') return
              if (commitTyped) {
                if (draft !== null) commitDraft(e.currentTarget.value)
                if (onEnter) onEnter()
                return
              }
              const v = normalizeColorInput(e.currentTarget.value, { link: allowLink })
              const changed = v !== e.currentTarget.value
              if (changed) onChange(v)
              if (onEnter) { onEnter(); return }
              // A form that saves on Enter (enterToSave) would read the draft
              // from before this resolve and store the typed name. Claim the
              // key: this Enter resolves the name, the next one saves.
              if (changed) e.preventDefault()
            }}
          />
          <button
            type="button"
            className="ui-color-drop"
            tabIndex={-1}
            onClick={e => toggle(e.currentTarget)}
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={`${label}: choose from your colors`}
            title="Choose from your colors and the built-ins"
          ><CaretIcon /></button>
        </span>
      )}

      {showSuggest && createPortal(
        <ul
          id={listId}
          className={`ui-color-suggest${aboveDialogs ? ' ui-menu--top-tier' : ''}`}
          role="listbox"
          aria-label={`${label}: matching colors`}
          ref={suggestRef}
          style={{ top: suggestPos.top, left: suggestPos.left, minWidth: suggestPos.minWidth, maxHeight: suggestPos.maxHeight }}
        >
          {suggestions.map((sg, i) => {
            const on = sg === activeSuggestion
            return (
              <li
                key={`${i}:${sg.kind}:${sg.name}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={on}
                className={`ui-color-suggest-item${on ? ' ui-color-suggest-item--on' : ''}`}
                // mousedown would blur the text box and close the list before
                // the click lands; keep focus where it is.
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pickSuggestion(sg)}
              >
                <span className="ui-color-dot" style={{ background: sg.hex }} />
                <span className="ui-color-option-name">{sg.name}</span>
                <span className="ui-color-suggest-kind">
                  {sg.kind === 'yours' ? <><LinkIcon />yours</> : sg.kind}
                </span>
              </li>
            )
          })}
        </ul>,
        document.body,
      )}

      {open && createPortal(
        <div
          ref={menuRef}
          className={`ui-menu ui-color-menu${aboveDialogs ? ' ui-menu--top-tier' : ''}`}
          role="dialog"
          aria-label={`${label}: colors`}
          onKeyDown={trapTab}
          style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
        >
          <div className="ui-section-label">{allowLink ? 'Your colors' : 'Your colors (copied)'}</div>
          {yourColors.length === 0 ? (
            <div className="ui-hint">
              None yet. Name a color once and pick it anywhere. Change it later and everything using it changes too.
            </div>
          ) : (
            <div className="ui-color-options">
              {yourColors.map(c => {
                const on = linked?.id === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`ui-menu-item ui-color-option${on ? ' ui-menu-item--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => pick(storedFor(c, colorLink(c)))}
                    title={allowLink
                      ? `${c.name} · ${c.hex}. Stays linked: change it in Colors and this follows.`
                      : `${c.name} · ${c.hex}. Copied as a fixed color, so this stays ${c.hex} if you change ${c.name} later.`}
                  >
                    <span className="ui-color-dot" style={{ background: c.hex }} />
                    <span className="ui-color-option-name">{c.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="ui-section-label">Built-in</div>
          <div className="ui-color-builtins">
            {BUILT_INS.map(([name, h]) => {
              const on = !link && !!hex && expandHex(hex) === expandHex(h)
              return (
                <button
                  key={name}
                  type="button"
                  className={`ui-color-builtin${on ? ' ui-color-builtin--on' : ''}`}
                  style={{ background: h }}
                  aria-pressed={on}
                  aria-label={name}
                  title={`${name} · ${h}. Copied as a fixed color.`}
                  onClick={() => pick(h)}
                />
              )
            })}
          </div>

          <div className="ui-color-row">
            <label className="ui-color-custom" title="Any color, stored as a fixed #hex">
              <span>Custom</span>
              <input
                type="color"
                value={expandHex(hex ?? defaultSwatch ?? '#c8c8c8')}
                onChange={e => onChange(e.target.value)}
              />
            </label>
            {none && (
              <button
                type="button"
                className={`ui-btn ui-btn--sm ui-btn--ghost${isNone(value) ? ' ui-color-none--on' : ''}`}
                aria-pressed={isNone(value)}
                onClick={() => pick(none.value)}
              >{none.label}</button>
            )}
          </div>

          {saving ? (
            <div className="ui-color-save">
              <div className="ui-color-row">
                <input
                  className="ui-field ui-color-save-name"
                  value={saveName}
                  placeholder="Name, e.g. Buff drop"
                  maxLength={24}
                  aria-label="New color name"
                  autoFocus
                  onChange={e => { setSaveName(e.target.value); setSaveError(null) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveAsColor() }
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelSave() }
                  }}
                />
                <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={saveAsColor}>Save</button>
                <button type="button" className="ui-btn ui-btn--sm" onClick={cancelSave}>Cancel</button>
              </div>
              {saveError && <div className="ui-color-error" role="alert">{saveError}</div>}
            </div>
          ) : (
            <div className="ui-color-row ui-color-actions">
              {link && (
                <button
                  type="button"
                  className="ui-btn ui-btn--sm"
                  onClick={() => pick(expandHex(hex ?? link.fallback ?? '#c8c8c8'))}
                  title="Keep this exact color, but stop following changes to it"
                >Unlink</button>
              )}
              {!link && (
                <button
                  type="button"
                  className="ui-btn ui-btn--sm ui-color-save-btn"
                  disabled={!hex}
                  onClick={() => setSaving(true)}
                  title={hex
                    ? (allowLink
                      ? 'Name this color so you can pick it anywhere, and link this field to it'
                      : 'Name this color so you can pick it anywhere. This field keeps the color itself.')
                    : 'Choose a color first'}
                >Save as a color…</button>
              )}
              <span className="ui-modal-foot-spacer" />
              {manage && (
                <button
                  type="button"
                  className="ui-btn ui-btn--sm ui-btn--ghost"
                  onClick={() => { close(false); manage() }}
                >Manage colors…</button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
