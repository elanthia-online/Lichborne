// Color usage — which rules link to each of YOUR colors (F115, v0.19.8).
//
// The Colors tab shows a count beside each color and a "Used by" list, so you
// can see what an edit will repaint before you make it. A use is a LINK (the
// `var(--lb-color-<id>, …)` value colors.ts mints), never a hex that merely
// happens to match — a copied hex does not follow the color, so counting it
// would promise a change that won't happen.
//
// Scope, stated honestly in the UI: the palette is app-wide, but rules live per
// character, so this reads the OPEN character's rules plus the All-characters
// (global) store. Another character's rules can link to the same color and are
// not counted — reading every character's YAML to answer a count isn't worth
// it, and nothing here depends on the count being complete (a removed color
// only RETIRES, so an uncounted use keeps its color).
//
// `collectColorUses` is pure (harness-covered); `loadColorUseSources` is the
// thin localStorage read the panel calls.

import { parseColorLink } from './colors'
import { type HighlightRule, loadHighlights } from './highlights'
import { type TriggerRule, loadTriggers } from './triggers'
import { type ContactTemplate, loadContactTemplates } from './contacts'
import { type RuleGroup, loadGroups } from './groups'
import { GLOBAL_RULES_SCOPE } from './characterScope'

export type ColorUseKind = 'highlight' | 'trigger' | 'template' | 'group'

export interface ColorUse {
  kind: ColorUseKind
  /** 'global' = an All-characters rule. Templates and groups are always per character. */
  scope: 'character' | 'global'
  id: string
  label: string
  /** Which of the rule's color fields link to the color, e.g. ['text', 'effect']. */
  fields: string[]
}

export interface ColorUseSources {
  highlights: HighlightRule[]
  globalHighlights: HighlightRule[]
  triggers: TriggerRule[]
  globalTriggers: TriggerRule[]
  templates: ContactTemplate[]
  groups: RuleGroup[]
}

export function loadColorUseSources(character: string): ColorUseSources {
  return {
    highlights: loadHighlights(character),
    globalHighlights: loadHighlights(GLOBAL_RULES_SCOPE),
    triggers: loadTriggers(character),
    globalTriggers: loadTriggers(GLOBAL_RULES_SCOPE),
    templates: loadContactTemplates(character),
    groups: loadGroups(character),
  }
}

/** Palette id → the rules linking to it. A rule appears once per color, with every field that links. */
export function collectColorUses(src: ColorUseSources): Map<string, ColorUse[]> {
  const byColor = new Map<string, ColorUse[]>()

  const add = (
    kind: ColorUseKind, scope: ColorUse['scope'], id: string, label: string,
    fields: [string, string | null | undefined][],
  ) => {
    const perColor = new Map<string, string[]>()
    for (const [field, value] of fields) {
      const link = parseColorLink(value)
      if (!link) continue
      const list = perColor.get(link.id) ?? []
      if (!list.includes(field)) list.push(field)
      perColor.set(link.id, list)
    }
    for (const [colorId, linked] of perColor) {
      const uses = byColor.get(colorId) ?? []
      uses.push({ kind, scope, id, label, fields: linked })
      byColor.set(colorId, uses)
    }
  }

  const highlight = (h: HighlightRule, scope: ColorUse['scope']) =>
    add('highlight', scope, h.id, h.name || h.pattern || 'Unnamed highlight', [
      ['text', h.style?.textColor], ['background', h.style?.bgColor], ['effect', h.style?.glowColor],
    ])
  const trigger = (t: TriggerRule, scope: ColorUse['scope']) =>
    add('trigger', scope, t.id, t.name || t.pattern || t.watchVariable || 'Unnamed trigger',
      // Every colour an action can carry — F118 added the echo's background and
      // effect colour, and a field missing here is a colour whose "Used by" is
      // silently wrong, which is the one thing that list exists to be right about.
      (t.actions ?? []).flatMap(a => [
        ['echo', a.echoColor],
        ['echo background', a.echoBgColor],
        ['echo effect', a.echoGlowColor],
      ] as [string, string | undefined][]))

  for (const h of src.highlights) highlight(h, 'character')
  for (const h of src.globalHighlights) highlight(h, 'global')
  for (const t of src.triggers) trigger(t, 'character')
  for (const t of src.globalTriggers) trigger(t, 'global')
  for (const t of src.templates) {
    add('template', 'character', t.id, t.name || 'Unnamed template', [
      ['name', t.textColor], ['background', t.bgColor], ['effect', t.glowColor],
      ['tag', t.tagColor], ['tag background', t.tagBgColor], ['tag effect', t.tagGlowColor],
    ])
  }
  for (const g of src.groups) add('group', 'character', g.id, g.name || 'Unnamed group', [['color', g.color]])

  return byColor
}
