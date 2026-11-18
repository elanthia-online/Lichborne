// GenieWalkContext — how the Genie map reaches its character's walker (v1.0.2,
// DESIGN §19.18).
//
// The walker (genieWalk.ts) lives in GameWindow, one per character, because it
// needs that character's game text, its arrivals and its send path. The map is
// mounted in up to two places per character (a panel or floating window, and
// the Maps overlay), both inside GameWindow, so a context reaches them without
// threading props through PanelFrame. The value is memoized in GameWindow on
// `status` alone: `start`, `stop` and `registerGoto` keep one identity.
//
// `registerGoto` is the other direction. `#goto` is typed in the command bar
// (GameWindow), but only the map knows the zones and where you are on them, so
// a mounted map registers a planner and GameWindow asks it. The last map to
// register answers; unregistering only clears your own.

import { createContext, useContext } from 'react'
import type { WalkStatus } from './genieWalk'

export type GotoResult = { moves: string[]; label: string } | { error: string }
export type GotoPlanner = (query: string) => GotoResult

export interface GenieWalkApi {
  /** Walk a route of Genie arc `move=` texts to the room named `label`. */
  start(moves: string[], label: string): void
  stop(): void
  status: WalkStatus | null
  /** Returns the function that unregisters it. */
  registerGoto(planner: GotoPlanner): () => void
}

export const GenieWalkContext = createContext<GenieWalkApi | null>(null)

export function useGenieWalk(): GenieWalkApi | null {
  return useContext(GenieWalkContext)
}
