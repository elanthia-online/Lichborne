// frontendCaps — whether to ask Lich for DragonRealms' rich ("Saga") stream
// (v0.21.0, DESIGN §55.11).
//
// Lich 5.23.0 takes the rich stream from the game and, for a client that has
// declared nothing, rewrites it back into the legacy shape. One control line
// stops that for this client:
//   SET_FRONTEND_CAPS room_element game_links double_bold
// (lich-5 docs/frontends/capability-declaration.md; Knowledge.md §17). Lich
// consumes it; it never reaches the game or scripts. A Lich WITHOUT the
// feature forwards it to the game as a command, so it is only sent when we
// can see the Lich understands it, or when the player says to (`on`).
//
// The test for "understands it" is the FILE, not a version number: unreleased
// main read 5.22.0 while already carrying the feature, and the file exists
// exactly when the line is understood. For an attach the Lich may be on
// another machine, so `auto` only trusts the local install when the target is
// this machine.
//
// Electron-free (fs/path only) so a plain-node harness can drive it, like
// AttachConnection.

import * as fs from 'fs'
import * as path from 'path'
import { expandHome } from '../homePath'
import { RICH_STREAM_DEFAULT, type RichStreamMode } from '../../shared/types'

export const FRONTEND_CAPS_LINE = 'SET_FRONTEND_CAPS room_element game_links double_bold'

// Does the Lich install whose lich.rbw is at `lichPath` understand the line?
export function lichSupportsFrontendCaps(lichPath: string | undefined): boolean {
  if (!lichPath) return false
  try {
    const dir = path.dirname(expandHome(lichPath))
    return fs.existsSync(path.join(dir, 'lib', 'common', 'client_capabilities.rb'))
  } catch {
    return false
  }
}

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127\.\d+\.\d+\.\d+$/.test(h)
}

// The decision, for a Lich we launch (`attachHost` undefined) or an attach.
export function shouldDeclareRichStream(
  mode: RichStreamMode | undefined,
  lichPath: string | undefined,
  attachHost?: string,
  supports: (p: string | undefined) => boolean = lichSupportsFrontendCaps,
): boolean {
  const m = mode ?? RICH_STREAM_DEFAULT   // absent = no choice made
  if (m === 'off') return false
  if (m === 'on') return true
  if (attachHost !== undefined && !isLoopbackHost(attachHost)) return false
  return supports(lichPath)
}
