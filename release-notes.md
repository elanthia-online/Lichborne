## v0.20.5

Fixes from Vaddon's read-through, two Genie import gaps Legiro hit, and a few lessons borrowed from [ProfanityFE](https://github.com/elanthia-online/ProfanityFE), whose recent work on the shared DragonRealms stream turned up issues Lichborne had too. Thanks, Vaddon and Legiro, and thanks to the ProfanityFE developers.

### The Genie map no longer slides

The Genie map used to glide for a moment each time you moved. Redrawing a whole zone for every frame of that slide was expensive: while running or on a go2 it dropped frames and made the rest of the window, game text included, feel sluggish, and it was hard to tell a slow map from one that was still sliding. The map and its "you are here" ring now jump straight to your new room.

**Genie Map Animations** now covers only the room effects (shop glints, ripples, fire auras, the healer heartbeat), and it's **off by default** for new characters. If you already have it on, it stays on; turn it off in Settings if your map or text feels heavy.

The pulsing ring that marks where you are is no longer part of that setting. It now behaves the same on both maps: it keeps pulsing on the Genie map with animations off, as it always has on the Lich map. **Epilepsy safe mode** stops the pulse on both, leaving the solid ring.

### Links in game text can't launch programs

A link in game text, which any Lich script can write, could point at a file on your computer, and clicking it would have run that file. Lichborne now opens only web addresses (`https://`/`http://`); anything else shows as plain text and does nothing when clicked.

### The Living Tableau shows who's fighting you between assesses

DR's automatic assess only comes every so often, and is often empty. A creature that had engaged you since the last one, or any creature once the last assess had cleared, didn't get the red "engaged" glow. Now it does, as soon as DR's creature list says it's on you.

### A Moon Mage's Locate no longer moves you

Locate shows the other person's room in your game window the same way a LOOK shows yours. Lichborne used to take that room as yours: the Room panel showed its description, the Living Tableau drew its scenery, and the compass showed its exits until your next move or LOOK. The located room still prints in the game window, but your room stays your room, with or without Lich's `;display` room-number options.

### Game-opened links follow your link-safety setting

A link the game or a Lich script opens by itself (`<LaunchURL>`) now goes through the same **"you are leaving Play.net"** page as a link you click, while that setting is on (it is by default). It also only opens a real `https://`/`http://` address or a play.net page, so a malformed address can no longer point the browser somewhere unexpected.

### Overview: a clearer "send to" button

The Overview's input bar picked its target from a dropdown that cut its own label off ("All characters (2" plus a stray arrow). It's now a button that reads **All · 2 ▾** or the character's name, and opens Lichborne's own menu with a tick on the current choice. It follows your theme and text size, and picking someone puts you straight back in the input. The tick, the **All** label and the Send button are also easier to read on darker themes such as Barbarian, where the accent colour on its own was hard to make out.

### Genie import

- `#flash` and `#beep` with anything after them (`#flash 3`) now import as Flash and Beep instead of being skipped (thanks, Legiro).
- `#event 5 look` (Genie's timer) imports as a command sent 5 seconds later, and `#playsystem` sounds import as a sound or a beep.

### Smaller fixes

- **Genie Maps tells you where to get the maps.** With no maps folder set, the Genie Maps view pointed at a page that doesn't exist. It now has a **Download the maps ZIP** link straight to the [GenieClient/Maps](https://github.com/GenieClient/Maps) download: unzip it, then use the button to pick that folder. (Vaddon)
- **File → Import Profile… opens on the Import tab**, even when Transfer is already open. It used to open Transfer on Export. The launcher's Transfer button and File → Export Profile… still open on Export. (Vaddon)
- **Clearer wording when importing.** The file list on the Import tab now says "Choose a file to import…" instead of "Choose an export…". (Vaddon)
- A link inside a game command that contains `>` (`look >here`) no longer spills part of the tag into the game text.
- During a fast go2, Lich's `[go2]>` lines no longer show in the room-name colour.
- **Spell Monitor:** a spell with no expiry (Indefinite, or OM) now shows a full bar instead of an empty gap under its name.
