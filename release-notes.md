## v1.0.2

### Genie map walks that keep up with you

Right-clicking a room on the Genie map now walks you there the way Genie does: one step, wait for the room, next step. Thanks to Damiza for the report.

- **Faster and safer.** Each step goes out as soon as the game shows the room you walked into, instead of every 0.6 seconds no matter what.
- **It stops when something goes wrong, and says why.** "You can't go there", a shut door, needing to stand, being in combat, full hands: the walk stops and tells you which step it was and what the game said. A "...wait" or a stun just pauses it until you can move again.
- **It understands Genie's map steps.** Steps the maps write as `rt west`, `swim south`, `search go faint trail`, `pull lever;go door` or `script autoclimbup` used to go to the game as written and fail. Now they're sent the way Genie sends them.
- **Some steps need you.** A few spots in the maps rely on a Genie script to get through (pushing the boulder at the Gate of Souls, the Dragon's Spine recital). The walk takes you to the room before and tells you what to do.
- **The map shows where you're headed.** The Genie map's toolbar shows the room you're walking to and how many steps are done, with ■ to stop. Taking a step yourself stops it too.

### #goto

Type `#goto bank` or `#goto 302` in the command bar to walk to a room on the Genie map by its note or its number, just like Genie. It works on the map you're on, and the Genie map needs to be open.

### Walk settings

In **Settings → Behavior**, per character:

- **Steps ahead:** how many steps can be on their way before the game shows the room. 1 is the default and waits for each room. A standard account can use 2 (one step moving, one waiting), a premium account 3. If the game refuses a step for being too far ahead, the walk sends it again and keeps one fewer on the way.
- **Pause after each room:** slows a walk down if you like to read each room as you pass.
- **Try a failed step once more** before stopping.
- **Show each step** in the game window, or keep long walks out of your scrollback.

### Lichborne gets the Genie maps for you

No more downloading a ZIP, unzipping it and hunting for the folder. Open **Maps → Genie Maps**, and the first screen says **Set up Genie Maps**. Click **⇩ Download and set up Genie maps**: Lichborne fetches the current maps from [GenieClient/Maps](https://github.com/GenieClient/Maps) (about 4 MB) into its own folder, and the map opens as soon as it finishes.

- **Get the latest whenever you like** with **↻ Refresh maps** on the Genie map toolbar. It replaces the whole folder with a fresh copy, so nothing old is left behind. Hover it to see when your copy was last updated.
- **Your maps are safe if the download fails.** The old copy stays until the new one is fully downloaded and checked.
- **Already have Genie's maps?** Click **Already use Genie? Pick its Maps folder instead…** under the button. It never changes a folder you picked.

> [!TIP]
> On an older copy of the Genie maps? One click on **⇩** switches you to the current ones.

### Also

- Damiza is now listed as a contributor in **Help → About Lichborne**.
