// Time slicing — run a long build in small pieces so the window keeps drawing (v1.1.0)
//
// The Graph map's start-up work (matching the two maps, placing the world,
// indexing what is where) is a few hundred milliseconds on the renderer's main
// thread, the same thread that draws the map and applies a zoom. Done in one go
// it freezes the window; a player zooming while the Graph map opens felt it as
// stutter (measured: 55–60 ms blocks and a tenth of frames dropped).
//
// The pattern: write the build as a GENERATOR that `yield`s at cheap, regular
// checkpoints (every few hundred rooms, every zone). `runSliced` steps it and
// hands control back to the browser whenever about BUDGET_MS have passed, so no
// single stretch is longer than a frame. `runSync` steps it straight through, for
// the harnesses and anything that wants the result at once. Both run the SAME
// code, so they cannot give different answers.
//
// No React and no window beyond `performance.now()` and `setTimeout`, so a
// plain-node harness can use it.

export type Steps<T> = Generator<void, T, void>

export const BUDGET_MS = 8

/** Give the browser a turn: a due frame and pending input run before we continue.
 *
 *  A plain zero-delay timer, on purpose. `scheduler.yield()` looks like the
 *  better tool (no 4 ms clamp on nested timers), but MEASURED in Electron 45 it
 *  lets its continuations run ahead of rendering: the slices ran back to back
 *  and opening the Graph map froze the window for ~400 ms, against ~300 ms with
 *  timers, the same as the plain Genie map (tmp-graph-map/perf, frames from
 *  mount). Don't switch back without re-measuring. */
export function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/** Run the steps straight through. */
export function runSync<T>(steps: Steps<T>): T {
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
  }
}

/** Run the steps, pausing (`pause`, default `yieldToBrowser`) whenever
 *  `budgetMs` of work has been done since the last pause. */
export async function runSliced<T>(steps: Steps<T>, pause: () => Promise<void> = yieldToBrowser, budgetMs = BUDGET_MS): Promise<T> {
  let start = performance.now()
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
    if (performance.now() - start >= budgetMs) {
      await pause()
      start = performance.now()
    }
  }
}
