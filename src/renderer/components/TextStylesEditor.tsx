// TextStylesEditor — Settings → Text styles (v0.20.1, subkermorianranger).
//
// One disclosure row per KIND of game text (textStyles.ts's TEXT_STYLE_TARGETS):
// the summary shows the label and a live preview, the body holds font, size,
// weight, slant, case and effect. Every control has a "Default" choice that
// REMOVES the field, so an untouched kind stores nothing and renders exactly as
// before.
//
// The preview is not a lookalike: it renders the sample through the same
// `renderSegment` the game text uses, inside a `data-preset` element the
// generated stylesheet styles — so what you see here IS the game's paint
// (pitfall #127). That works because Settings belongs to the active character,
// whose styles are the ones applied to the document.
//
// Row components are hoisted to module scope so the open/closed state of each
// <details> survives the re-render every change causes (UX #4). They are not
// memo'd: an effect change must repaint every preview, which a memo would block.

import { useState } from 'react'
import { renderSegment } from '../utils/renderSegment'
import { FONT_FAMILIES, FONT_FAMILY_LABELS, isFontPreset } from '../settings'
import { HIGHLIGHT_EFFECTS } from '../highlights'
import {
  TEXT_STYLE_TARGETS, TEXT_SIZE_MIN, TEXT_SIZE_MAX, PALE_EFFECTS,
  coerceTextStyle, effectsFor, isLightComputedColor, useTextStylesVersion,
  type TextStyle, type TextStyles, type TextStyleId, type TextStyleTarget,
} from '../textStyles'
import '../styles/text-styles.css'

const SIZE_STEP = 10

const EFFECT_LABEL = new Map(HIGHLIGHT_EFFECTS.map(e => [e.value, e.label]))

/** What a changed style looks like after dropping every "default" field. */
function patchStyle(id: TextStyleId, cur: TextStyle | undefined, patch: Partial<TextStyle>): TextStyle | null {
  const merged: Record<string, unknown> = { ...(cur ?? {}), ...patch }
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k]
  return coerceTextStyle(merged, id)
}

/** Whether the current theme's game background is light, asked of the browser
 *  so a `var()` or `color-mix()` theme value resolves the way it paints. Read
 *  on each render: cheap, and Settings re-renders on every change. */
function themeIsLight(): boolean {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--bg-app)'
  document.body.appendChild(probe)
  const css = getComputedStyle(probe).color
  probe.remove()
  return isLightComputedColor(css) === true
}

/** One line saying what's been changed, for the collapsed row. */
function styleSummary(s: TextStyle | undefined): string {
  if (!s) return 'Default'
  const bits: string[] = []
  if (s.font) bits.push(isFontPreset(s.font) ? FONT_FAMILY_LABELS[s.font] ?? s.font : s.font)
  if (s.size) bits.push(`${s.size}%`)
  if (s.weight) bits.push(s.weight === 'bold' ? 'bold' : 'not bold')
  if (s.italic !== undefined) bits.push(s.italic ? 'italic' : 'upright')
  if (s.caps) bits.push(s.caps === 'small-caps' ? 'small caps' : 'capitals')
  if (s.effect) bits.push(EFFECT_LABEL.get(s.effect) ?? s.effect)
  return bits.join(' · ')
}

/** A percent field that lets you type freely and only commits a value in
 *  range — committing every keystroke would clamp "1" (on the way to "150")
 *  straight up to the minimum. Out-of-range input snaps back on blur. */
function PercentInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input type="number" className="sp-number-input" aria-label={label}
           min={TEXT_SIZE_MIN} max={TEXT_SIZE_MAX} step={SIZE_STEP}
           value={draft ?? String(value)}
           onChange={e => {
             setDraft(e.target.value)
             const n = parseInt(e.target.value, 10)
             if (Number.isFinite(n) && n >= TEXT_SIZE_MIN && n <= TEXT_SIZE_MAX) onCommit(n)
           }}
           onBlur={() => setDraft(null)} />
  )
}

function TextStyleRow({ target, style, fonts, light, onChange }: {
  target: TextStyleTarget
  style: TextStyle | undefined
  fonts: string[]
  /** The current theme's game background is light (pale effects wash out). */
  light: boolean
  onChange: (id: TextStyleId, next: TextStyle | null) => void
}) {
  const id = target.id
  const set = (patch: Partial<TextStyle>) => onChange(id, patchStyle(id, style, patch))
  const paleOnLight = light && !!style?.effect && PALE_EFFECTS.has(style.effect)
  const size = style?.size ?? 100
  // The body is only BUILT while the row is open: each Font select lists every
  // installed font, and seven closed rows would otherwise keep all of them in
  // the DOM and re-reconcile them on every Settings render (each search key).
  const [open, setOpen] = useState(false)
  // A font saved on another machine may not be installed here; keep it in the
  // list so the select can still show (and clear) it.
  const fontList = style?.font && !isFontPreset(style.font) && !fonts.includes(style.font)
    ? [style.font, ...fonts] : fonts
  return (
    <details className={`tse-row${style ? ' tse-row--set' : ''}`}
             onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="tse-summary" title={target.desc}>
        <span className="tse-label">{target.label}</span>
        <span className="tse-state">{styleSummary(style)}</span>
        <span className="tse-preview" aria-hidden="true">
          {renderSegment({ text: target.sample, preset: id, ...(id === 'bold' ? { bold: true } : {}) }, 0)}
        </span>
      </summary>
      {open && <div className="tse-body">
        <div className="ui-hint">{target.desc}</div>
        <div className="tse-grid">
          <label className="tse-field">
            <span className="tse-field-label">Font</span>
            <select className="sp-select" value={style?.font ?? ''}
                    onChange={e => set({ font: e.target.value || undefined })}>
              <option value="">Game font</option>
              <optgroup label="Families">
                {Object.keys(FONT_FAMILIES).map(k => <option key={k} value={k}>{FONT_FAMILY_LABELS[k] ?? k}</option>)}
              </optgroup>
              {fontList.length > 0 && (
                <optgroup label="Installed fonts">
                  {fontList.map(f => <option key={f} value={f}>{f}</option>)}
                </optgroup>
              )}
            </select>
          </label>

          <div className="tse-field">
            <span className="tse-field-label">Size</span>
            <div className="sp-number-row">
              <button type="button" className="sp-num-btn" aria-label={`Smaller ${target.label.toLowerCase()}`}
                      disabled={size <= TEXT_SIZE_MIN}
                      onClick={() => set({ size: Math.max(TEXT_SIZE_MIN, size - SIZE_STEP) })}>−</button>
              <PercentInput value={size} label={`${target.label} size, percent of the game font`}
                            onCommit={n => set({ size: n })} />
              <span className="sp-number-unit" title="Percent of your game font size, so it still follows the Font size setting">%</span>
              <button type="button" className="sp-num-btn" aria-label={`Larger ${target.label.toLowerCase()}`}
                      disabled={size >= TEXT_SIZE_MAX}
                      onClick={() => set({ size: Math.min(TEXT_SIZE_MAX, size + SIZE_STEP) })}>+</button>
            </div>
          </div>

          <label className="tse-field">
            <span className="tse-field-label">Weight</span>
            <select className="sp-select" value={style?.weight ?? ''}
                    onChange={e => set({ weight: (e.target.value || undefined) as TextStyle['weight'] })}>
              <option value="">Default</option>
              <option value="bold">Bold</option>
              <option value="normal">Not bold</option>
            </select>
          </label>

          <label className="tse-field">
            <span className="tse-field-label">Slant</span>
            <select className="sp-select" value={style?.italic === undefined ? '' : style.italic ? 'italic' : 'upright'}
                    onChange={e => set({ italic: e.target.value === '' ? undefined : e.target.value === 'italic' })}>
              <option value="">Default</option>
              <option value="italic">Italic</option>
              <option value="upright">Upright</option>
            </select>
          </label>

          <label className="tse-field">
            <span className="tse-field-label">Case</span>
            <select className="sp-select" value={style?.caps ?? ''}
                    onChange={e => set({ caps: (e.target.value || undefined) as TextStyle['caps'] })}>
              <option value="">As the game writes it</option>
              <option value="small-caps">Small caps</option>
              <option value="uppercase">All capitals</option>
            </select>
          </label>

          <label className="tse-field">
            <span className="tse-field-label">Effect</span>
            <select className="sp-select" value={style?.effect ?? 'none'}
                    onChange={e => set({ effect: e.target.value === 'none' ? undefined : e.target.value as TextStyle['effect'] })}>
              {effectsFor(id).map(fx => <option key={fx} value={fx}>{EFFECT_LABEL.get(fx) ?? fx}</option>)}
            </select>
          </label>
        </div>
        {/* Why this kind has a shorter list — a missing choice should say why
            (UX #8). */}
        {target.effects && (
          <p className="ui-hint tse-hint">
            Only the calm effects here: moving effects across a whole paragraph,
            with several on screen as you travel, are heavy on your computer.
          </p>
        )}
        {paleOnLight && (
          <p className="ui-hint tse-hint tse-hint--warn">
            {EFFECT_LABEL.get(style!.effect!) ?? style!.effect} paints in its own pale
            colours, so it's hard to read on a light theme like this one.
            Glow, Pulse and Neon keep your theme's colour.
          </p>
        )}
        <div className="tse-actions">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm"
                  disabled={!style}
                  title={style ? `Put ${target.label.toLowerCase()} back the way the game and your theme draw them` : 'Nothing to reset — this is the default'}
                  onClick={() => onChange(id, null)}>Reset</button>
        </div>
      </div>}
    </details>
  )
}

export default function TextStylesEditor({ styles, fonts, onChange }: {
  styles: TextStyles
  /** Installed font names (Settings already loads them for the font picker). */
  fonts: string[]
  onChange: (next: TextStyles) => void
}) {
  // Repaint the previews' effects when the applied styles change.
  useTextStylesVersion()
  const light = themeIsLight()
  const change = (id: TextStyleId, next: TextStyle | null) => {
    const out: TextStyles = { ...styles }
    if (next) out[id] = next
    else delete out[id]
    onChange(out)
  }
  return (
    <div className="tse">
      {TEXT_STYLE_TARGETS.map(t => (
        <TextStyleRow key={t.id} target={t} style={styles[t.id]} fonts={fonts} light={light} onChange={change} />
      ))}
    </div>
  )
}
