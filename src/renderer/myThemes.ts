// myThemes — the user's custom themes: create / duplicate / export / import + the store.
//
// Custom themes live under ONE raw localStorage key (`lichborne.myThemes`) —
// app-wide, not per-character — as `CustomTheme` records: a minted
// `custom_<ts>_<rand>` id, a display name, `basedOn` (the built-in it was
// copied from, resolved to a name by `getBaseThemeName`), and `vars`.
//
// THE INVARIANT: `vars` is ALWAYS a COMPLETE set, never a partial override.
// Every constructor here guarantees it — `createCustomThemeFrom` spreads the
// base theme over `darkBase`, `duplicateCustomTheme` copies a full set, and
// `importTheme` re-merges the file's vars over `darkBase` — so a hand-edited
// or older theme file can't produce a theme with holes. Export writes a
// `*.lichborne-theme.json` download; import validates `name` + `vars` and
// always mints a fresh id (importing your own export makes a copy).

import { darkBase, THEMES, type ThemeVars, type Theme } from './themes'

export interface CustomTheme {
  id: string
  name: string
  basedOn: string  // id of the base theme this was copied from
  vars: ThemeVars  // complete merged vars (always a full set)
}

const STORAGE_KEY = 'lichborne.myThemes'

export function loadMyThemes(): CustomTheme[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch { return [] }
}

// v0.20.4: every GameWindow holds its own copy of this list for the Theme
// Picker, and the picker builds the next list FROM that copy. A copy taken when
// the tab opened was never refreshed, so saving a theme from a second
// character's picker wrote back its older list and deleted themes made since.
// Every save now announces itself; GameWindow reloads its copy on this event
// (same window) and on a `storage` event for MY_THEMES_KEY (other windows).
export const MY_THEMES_KEY = STORAGE_KEY
export const MY_THEMES_CHANGED_EVENT = 'lichborne:my-themes-changed'
export function saveMyThemes(themes: CustomTheme[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(themes))
  document.dispatchEvent(new CustomEvent(MY_THEMES_CHANGED_EVENT))
}

export function createCustomThemeFrom(baseTheme: Theme, name: string): CustomTheme {
  const vars: ThemeVars = baseTheme.id === 'dark'
    ? { ...darkBase }
    : { ...darkBase, ...baseTheme.vars }
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    basedOn: baseTheme.id,
    vars,
  }
}

export function duplicateCustomTheme(source: CustomTheme): CustomTheme {
  return {
    ...source,
    vars: { ...source.vars },
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${source.name} copy`,
  }
}

export function getBaseThemeName(basedOn: string): string {
  return THEMES.find(t => t.id === basedOn)?.name ?? basedOn
}

export function exportTheme(theme: CustomTheme): void {
  const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${theme.name.replace(/\s+/g, '-').toLowerCase()}.lichborne-theme.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importTheme(file: File): Promise<CustomTheme> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (!data.name || !data.vars || typeof data.vars !== 'object') {
          reject(new Error('Invalid theme file'))
          return
        }
        resolve({
          id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: data.name,
          basedOn: data.basedOn ?? 'dark',
          vars: { ...darkBase, ...data.vars },
        })
      } catch {
        reject(new Error('Could not parse theme file'))
      }
    }
    reader.readAsText(file)
  })
}
