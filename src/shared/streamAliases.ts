// Stream-id aliases — legacy / server / sibling-client names that should all
// map to the same canonical Lichborne panel id.
//
// Shared between the main-process XML parser (incoming `<pushStream>` /
// `<streamWindow>` translation), the renderer's echoToStream (so imported
// triggers with `#echo >talk` etc. land in the right panel), and the import
// parsers (which normalize echoStream / watchStream values on the way in).
//
// Keep this list tight — only true aliases. The canonical ids on the right
// are the values used as `PanelType` in [PanelFrame.tsx](src/renderer/components/PanelFrame.tsx)
// and as the panel id in `streamLines`. Identity entries (e.g. `thoughts → thoughts`)
// don't need to be listed.

export const STREAM_ID_ALIASES: Record<string, string> = {
  // Speech / whispers — all collapse into the single Conversation feed
  // (Genie's FormMain.cs:2786 and Frostbite's WindowFacade staticWindows
  // both treat conversation as the aggregate of talk + whispers).
  talk:          'conversation',
  conversations: 'conversation',  // pre-v0.8.10 Lichborne plural form
  whispers:      'conversation',
  // GemStone IV's speech window. Like DR's `talk`, every line the GAME sends
  // there is ALSO sent to main (30 of 30 in the GS4 captures), so it needs no
  // main fallback (B136); without the alias a GS4 Conversation panel stayed
  // empty. Lich can push to `speech` too, on either game (lich-5's
  // Messaging.stream_window allows it; GS's Killtracker uses it), and those
  // lines have no copy in main: they show only in a Conversation panel.
  speech:        'conversation',
  // Server emits "death" (singular); panel id is plural.
  death:         'deaths',
  // Server emits "logons" for arrivals/departures.
  logons:        'arrivals',
  // Server alias for active spells.
  percWindow:    'spells',
  percwindow:    'spells',  // lowercase variant
  // Experience panel
  experience:    'exp',
  // Inventory panel
  inventory:     'inv',
  // Thoughts — server occasionally uses singular
  thought:       'thoughts',
}

export function normalizeStreamId(id: string): string {
  return STREAM_ID_ALIASES[id] ?? id
}
