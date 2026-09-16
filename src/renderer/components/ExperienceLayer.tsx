import { useEffect, useRef, useState } from 'react'
import FloatingWindow from './FloatingWindow'
import { VIEW_CONTROLS } from './PanelFrame'
import { experienceById, optionShown, type ExperienceInstance } from '../experiences'
import type { FloatWindow } from '../freeLayout'
import '../styles/experiences.css'

// The Experience layer (DESIGN.md §34.4) — hosts open Lichborne Experiences
// as floating windows over the game layout, in BOTH layout modes (unlike
// §33's WindowLayer, which is free-mode only). Mechanics mirror WindowLayer:
// pointer-through layer, live-DOM snap targets, click-to-front z, and the
// pitfall-#83 0×0-measurement guard (a hidden character tab is display:none —
// ignoring 0×0 keeps the windows MOUNTED so tab switches never tear down an
// Experience's state).
//
// Each instance is adapted to a synthetic FloatWindow so the v0.13.0
// FloatingWindow component is reused verbatim (snapping, guides,
// Alt-disable, arrow-nudge, lock). Closing sets `open: false` — the rect
// survives for the shelf's reopen (§34.5).
interface Props {
  instances: ExperienceInstance[]                    // all instances; only open ones render
  onInstancesChange: (next: ExperienceInstance[]) => void
  renderContent: (inst: ExperienceInstance) => React.ReactNode
  locked: boolean                                    // free-mode lock cooperation (§34.4)
}

export default function ExperienceLayer({ instances, onInstancesChange, renderContent, locked }: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const guideVRef = useRef<HTMLDivElement>(null)
  const guideHRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const openInstances = instances.filter(i => i.open)

  // Snap targets: container edges + EVERY floating window across BOTH layers
  // (§34.4 "same snap targets" — Experiences snap flush against §33 panel
  // windows and vice versa; B185). Both layers are absolute inset-0 over the
  // same .game-layout root, so measuring from the root and offsetting against
  // THIS layer's rect keeps every edge in this layer's coordinate space.
  function getSnapTargets(excludeId: string): { x: number[]; y: number[] } {
    const layer = layerRef.current
    const x: number[] = [0, size.w]
    const y: number[] = [0, size.h]
    if (layer) {
      const lr = layer.getBoundingClientRect()
      const root = (layer.closest('.game-layout') ?? layer) as HTMLElement
      root.querySelectorAll<HTMLElement>('.fl-window').forEach(el => {
        if (el.dataset.winId === excludeId) return
        const r = el.getBoundingClientRect()
        x.push(r.left - lr.left, r.right - lr.left)
        y.push(r.top - lr.top, r.bottom - lr.top)
      })
    }
    return { x, y }
  }

  useEffect(() => {
    const el = layerRef.current
    if (!el) return
    // Pitfall #83 (B174): ignore 0×0 — keep the last real size so a hidden
    // character tab (display:none) never unmounts the Experience windows.
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setSize({ w, h })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const focusedId = openInstances.reduce<{ id: string; z: number } | null>(
    (acc, i) => (!acc || i.z > acc.z ? { id: i.id, z: i.z } : acc), null,
  )?.id

  function focus(id: string) {
    const maxZ = instances.reduce((m, i) => Math.max(m, i.z), 0)
    const target = instances.find(i => i.id === id)
    if (!target || target.z === maxZ) return
    onInstancesChange(instances.map(i => (i.id === id ? { ...i, z: maxZ + 1 } : i)))
  }

  function change(id: string, patch: Partial<FloatWindow>) {
    onInstancesChange(instances.map(i => {
      if (i.id !== id) return i
      return {
        ...i,
        ...(patch.rect ? { rect: patch.rect } : {}),
        ...(patch.showTitle !== undefined ? { showTitle: patch.showTitle } : {}),
        // title edits are ignored — the label belongs to the registry def
      }
    }))
  }

  function close(id: string) {
    // §34.5: closing never loses anything — visibility off, rect kept.
    onInstancesChange(instances.map(i => (i.id === id ? { ...i, open: false } : i)))
  }

  // ── Per-instance view controls (v0.14.7) ──────────────────────────────────
  // A−/A+ adjust the instance's font override (the F31 per-panel model,
  // brought to Experiences — Sekmeht: "Living Tableau needs the font sizer");
  // ⚙ opens a checkbox popover of the def's content-layer options ("data they
  // want to see, e.g. Thoughts on/off"). Both persist on the instance
  // (scopedKey `experiences` → YAML → Transfer, no new plumbing).
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  // B345: the ⚙ popover used to close ONLY by clicking ⚙ again. Now an outside
  // mousedown or Esc closes it too; a press inside it (or on a ⚙, which toggles
  // on its own click) is left alone. Esc is preventDefault'ed so it can't also
  // reach useEscapeClose and close a dialog underneath.
  const optionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (optionsFor === null) return
    function onDown(e: MouseEvent) {
      const t = e.target as Element | null
      if (optionsRef.current?.contains(t as Node) || t?.closest?.('.exp-inst-gear')) return
      setOptionsFor(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setOptionsFor(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [optionsFor])

  function adjustFont(id: string, delta: number) {
    onInstancesChange(instances.map(i => {
      if (i.id !== id) return i
      // Seed the first adjustment from the LIVE global game font so A+ from
      // "no override" always grows (a fixed 12 seed would shrink for users
      // running a larger global font).
      const base = i.fontSize
        ?? (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--game-font-size')) || 12)
      return { ...i, fontSize: Math.max(8, Math.min(24, base + delta)) }
    }))
  }

  // Store the EXPLICIT hidden value (not a blind flip) so `defaultHidden` layers
  // toggle correctly — the checkbox's `checked` already reflects the default.
  function setOption(id: string, optId: string, hidden: boolean) {
    onInstancesChange(instances.map(i => (i.id === id
      ? { ...i, hidden: { ...(i.hidden ?? {}), [optId]: hidden } }
      : i)))
  }

  return (
    <div className="experience-layer" ref={layerRef}>
      {size.w > 0 && size.h > 0 && openInstances.map(inst => {
        const def = experienceById(inst.id)
        if (!def) return null  // unknown id from a future build's profile — skip, never delete
        const win: FloatWindow = {
          id: inst.id, kind: 'panel', rect: inst.rect, z: inst.z,
          showTitle: inst.showTitle,
          title: def.badge ? `${def.label} [${def.badge}]` : def.label,
        }
        return (
          <FloatingWindow
            key={inst.id}
            win={win}
            container={size}
            focused={focusedId === inst.id}
            onFocus={focus}
            onChange={change}
            onClose={close}
            getSnapTargets={getSnapTargets}
            guideRefs={{ v: guideVRef, h: guideHRef }}
            locked={locked}
            minSize={def.minSize}
          >
            {/* Font override: shadow --game-font-size for this window's
                subtree — every Experience sizes its text off that var
                (B182/B184), so one local re-declaration scales it all. */}
            <div
              className="exp-content-host"
              style={inst.fontSize ? ({ ['--game-font-size' as string]: `${inst.fontSize}px` } as React.CSSProperties) : undefined}
            >
              {renderContent(inst)}
            </div>
            {/* B398: tooltips/labels come from PanelFrame's VIEW_CONTROLS, the
                one set the docked tab variant uses too. */}
            <div className="exp-inst-controls" aria-label={`${def.label} view controls`}>
              <button type="button" className="panel-font-btn" title={VIEW_CONTROLS.smaller.tip}
                aria-label={VIEW_CONTROLS.smaller.label}
                onClick={() => adjustFont(inst.id, -1)}>A−</button>
              <button type="button" className="panel-font-btn" title={VIEW_CONTROLS.larger.tip}
                aria-label={VIEW_CONTROLS.larger.label}
                onClick={() => adjustFont(inst.id, 1)}>A+</button>
              {(def.options?.length ?? 0) > 0 && (
                <button type="button" className="panel-font-btn exp-inst-gear" title={VIEW_CONTROLS.layers.tip}
                  aria-label={VIEW_CONTROLS.layers.label} aria-expanded={optionsFor === inst.id}
                  onClick={() => setOptionsFor(o => (o === inst.id ? null : inst.id))}>⚙</button>
              )}
            </div>
            {optionsFor === inst.id && def.options && (
              <div className="exp-inst-options" ref={optionsRef}>
                <div className="exp-inst-options-title">Show in this scene</div>
                {def.options.map(opt => (
                  <label key={opt.id} className="exp-inst-option" title={opt.desc}>
                    <input
                      type="checkbox"
                      checked={optionShown(inst.hidden, opt)}
                      onChange={e => setOption(inst.id, opt.id, !e.target.checked)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </FloatingWindow>
        )
      })}
      <div className="fl-guide fl-guide-v" ref={guideVRef} />
      <div className="fl-guide fl-guide-h" ref={guideHRef} />
    </div>
  )
}
