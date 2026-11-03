// Which Lich install a character's session reads (DESIGN §56.7.1).
//
// A session is started from one install — the character's own, its game's, or
// the default (resolveLichInstall in lichSettings.ts) — and everything after
// login must read THAT install: the Lich Dashboard (lich.db3, scripts/,
// profiles/), the script list and the Lich Map. Before per-game installs each
// of those read the default install's path from localStorage itself, so a GS4
// character launched from its own install would have shown the DR install's
// Vars. GameWindow provides the session's path below; a component reads it
// with useSessionLichPath, and a hook in GameWindow itself takes
// `sessionLichPath(session)`.
//
// The fallback is the default install, as before: a session from before the
// path was carried, or a surface rendered outside any GameWindow.
import { createContext, useContext } from 'react'

export const SessionLichPathContext = createContext<string | undefined>(undefined)

/** The default install's lich.rbw, read fresh. */
export function defaultLichPath(): string {
  try {
    return JSON.parse(localStorage.getItem('lichborne.advancedSettings') ?? '{}').lichPath ?? ''
  } catch { return '' }
}

/** The install a session started from, else the default. */
export function sessionLichPath(session: { lichPath?: string } | null | undefined): string {
  return session?.lichPath || defaultLichPath()
}

/** sessionLichPath for the GameWindow this component renders inside. */
export function useSessionLichPath(): string {
  return useContext(SessionLichPathContext) || defaultLichPath()
}
