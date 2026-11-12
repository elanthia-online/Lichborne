// rubyCurrent — keep a Windows Ruby path on Ruby4Lich5's `current` link
// (Lich Setup's Auto-detect and the silent startup check; see main.ts
// `discover-lich-paths`).
//
// Ruby4Lich5's installer keeps a `current` directory junction pointing at the
// newest Ruby it installed, and leaves older version folders on disk. A path
// through it follows every Ruby4Lich5 update, while a version path
// (C:\Ruby4Lich5\4.0.3\bin\ruby.exe) stays pinned to whatever Ruby was
// installed when it was chosen, which also keeps passing Lichborne's
// "does it exist?" check long after a newer Ruby arrives. Seen on a real
// install, 2026-11-10: `current` → 4.0.9 beside a leftover 4.0.3, and the
// installer's uninstall record lists `{app}\current`. Installs older than the
// 4.0.9 installer have no `current`, so callers fall back to the newest
// version folder.
//
// fs/path only (no electron) so a plain-node harness can drive it, and it
// never runs Ruby: the silent startup path must not spawn ruby.exe (antivirus
// heuristics, see main.ts).

import * as fs from 'fs'
import * as path from 'path'

export const R4L5_BASE = 'C:\\Ruby4Lich5'

const VERSION_DIR = /^\d+\.\d+\.\d+$/

// The version `current` points at, from the junction's target folder name;
// null when there is no link or its target isn't a version folder.
export function currentRubyVersion(base = R4L5_BASE): string | null {
  try {
    const v = path.basename(fs.realpathSync(path.join(base, 'current')))
    return VERSION_DIR.test(v) ? v : null
  } catch {
    return null
  }
}

// a < b, comparing x.y.z numerically.
export function versionOlder(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0)
  }
  return false
}

// Ruby through `current` (ruby.exe or rubyw.exe), or null when the link is
// missing or doesn't hold that file.
export function rubyViaCurrent(exe = 'ruby.exe', base = R4L5_BASE): string | null {
  if (!currentRubyVersion(base)) return null
  const p = path.join(base, 'current', 'bin', exe)
  return fs.existsSync(p) ? p : null
}

// For a configured Ruby that exists: the `current` path to switch it to, or
// null to leave it alone. The install folder is read from the path itself
// (`<base>\<x.y.z>\bin\ruby.exe`), so Ruby4Lich5 installed on another drive or
// folder is handled the same as C:\Ruby4Lich5. It moves only when `<base>`
// holds a `current` link to another version folder of that same install, and
// only onto the same or a newer Ruby, so a hand-picked newer Ruby is never
// moved backwards and a Ruby anywhere else (a different install, rbenv, a
// custom build) is never touched.
export function pinnedToCurrent(configured: string): string | null {
  const resolved = path.resolve(configured)
  const exe = path.basename(resolved).toLowerCase()
  if (exe !== 'ruby.exe' && exe !== 'rubyw.exe') return null
  const binDir = path.dirname(resolved)
  if (path.basename(binDir).toLowerCase() !== 'bin') return null
  const versionDir = path.dirname(binDir)
  const pinned = path.basename(versionDir)
  if (!VERSION_DIR.test(pinned)) return null
  const typed = path.dirname(versionDir)
  let base: string
  try {
    const real = fs.realpathSync.native(typed)
    // The link must point inside this install, not at some other Ruby.
    const target = fs.realpathSync(path.join(typed, 'current'))
    if (path.dirname(target).toLowerCase() !== real.toLowerCase()) return null
    // The folder's real spelling from the disk, so a path typed in lowercase
    // still shows as C:\Ruby4Lich5\current in Lich Setup. Only the spelling:
    // a folder that is itself a link to somewhere else keeps the path the
    // player chose.
    base = real.toLowerCase() === typed.toLowerCase() ? real : typed
  } catch {
    return null
  }
  const current = currentRubyVersion(base)
  if (!current || versionOlder(current, pinned)) return null
  return rubyViaCurrent(exe, base)
}

// The `current` folder a Ruby path goes through (`…\current\bin\ruby.exe` →
// `…\current`), or null when the path doesn't use the link. For messages.
export function currentFolderOf(rubyPath: string): string | null {
  const m = /^(.*[\\/]current)[\\/]bin[\\/]rubyw?\.exe$/i.exec(rubyPath)
  return m ? m[1] : null
}
