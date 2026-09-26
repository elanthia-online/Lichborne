## v0.20.0

### Triggers wait for roundtime

A trigger that sends a command now **waits for your roundtime to clear** before sending it. If you're not in roundtime, it sends straight away, exactly as before. If you have five seconds left, it waits five seconds and then sends.

Before this, a trigger fired the moment its line appeared, which in combat usually meant the command arrived during roundtime and the game threw it away. A trigger that sends several commands waits before each one, so a chain like `stand;attack` now works in the middle of a fight.

- It's **on by default, for every trigger you already have.** Each command has a **Wait for roundtime** checkbox if you want one to send immediately instead.
- **Lich commands (anything starting with `;`) never wait.** Lich handles its own timing.
- If you disconnect, anything still waiting is dropped, so nothing old gets sent when you log back in.
- **`$rt` and `$ct` now count down in real seconds** in trigger messages and conditions, and a trigger can act **when roundtime ends**: watch the `rt` variable and add the condition *Roundtime = 0*. There's also a new **Cast time** condition.
- From the command bar: `/trigger add "pattern" do "command" rt=now` makes a trigger that doesn't wait (`rt=wait` is the default).

**Importing from Genie** now keeps Genie's timing too. `#send` and `#do` wait for roundtime, `#put` sends immediately, and `#send 2 look` becomes *look, after a 2-second pause*. It used to import as the command "2 look".

### A new Toast action for triggers

Triggers can now pop up a **Toast**, the small notification that slides up in the corner of the window you're looking at. Give it a title, a message and a colour. Unlike **Notify** (your system's desktop notification), a toast stays inside Lichborne and appears in whichever of its windows you're using.

### Know what your other characters are doing

When you run more than one character, Lichborne now tells you when another one **comes into the game**, **disconnects**, or **reconnects**, with a toast in whatever window you're looking at. Click it to go straight to that character, even if it's in a different window.

Each character gets a small coloured badge — the same colour as their avatar in the Living Tableau — so you can tell who a toast is about at a glance. If several characters drop at once, you get **one** toast naming them all instead of a pile, with a badge for each that takes you there. A toast also stays put while your mouse is over it (or while you've tabbed to it). When a character reconnects, it comes off the "disconnected" toast, and clicking one character's badge takes you there while leaving the others listed.

It's on by default. Turn it off under **Settings → Character status notifications**, or type `/notices off`.

### Give each character a colour

**Edit profile** on the launcher now has a **Color** for each character. Pick one and Lichborne uses it to mark that character everywhere: their toast badge, their tab (the selected tab takes the colour, the others a faint outline), their Team Login tile, the selection ring on their Overview card, their launcher card, and their figure in the Living Tableau. Choose one of your **named colours** and it stays linked — change the named colour later and the character follows. Leave it on **Automatic** and nothing changes from how it looks today.

One related change: in the Living Tableau, **your own characters** always wear their own colour, even if you've added them as a contact on a coloured template, so a character can't be one colour in the Tableau and another everywhere else. Other people still take their contact template's colour there, as before.

### A clearer trigger editor

- Every field now explains itself when you hover over it, and each section says what it's for.
- The **`$`** button next to a message is now a proper menu for inserting a variable, grouped by what the variable is about (your vitals, your hands, the room, the text that matched…). It used to be a dropdown that looked like a setting. Macros and aliases use the same menu.
- **The `$` menu shows what each variable holds right now** — `$health 87`, `$right` your weapon, `$rt` counting down while you watch — so you can see what a trigger would say before you write it.
- Choosing what to watch in a Variable trigger now suggests the variable names, and the conditions show what a sensible value looks like.

### Team Login, redesigned

Logging in a team now opens a panel with a **tile for every character**, showing where each one is: waiting, connecting (with what it's doing right now), ready, or failed and why.

- **Start playing while the rest connect.** As soon as a character is ready, pick it and press **Play**, or just double-click its tile. The panel tucks into a small pill in the top bar and the rest of the team keeps logging in behind you without stealing focus. Click the pill to bring the panel back.
- **Characters still connecting show up as tabs right away**, with a small loading indicator, so you can see who's coming.
- **The first character in your team's order is the default**, not the last one to finish.
- **"Open each in its own window"** now opens those windows quietly behind the one you're using.
- The **Play** button keeps one width whichever character you choose, so the panel doesn't jump as you click between tiles.
- The **Connect** button on a saved team now looks like the one on a character card.
- **Logging in one character looks the same too:** a single tile showing each step as it happens, how long it's been waiting, and a Cancel.
- A character that fails gets a **Retry** button once the rest have finished, and the tile tells you what went wrong.

### Moving rules between "This Character" and "All Characters"

- **After a move, the editor follows the rule.** Flip a trigger to *All Characters* and you're taken to it there, still selected. Before, the list you were looking at went blank and the rule appeared to be gone.
- **A move never throws away a rule.** If the other side already has a *different* rule with the same pattern, the move is refused and Lichborne tells you why. Before, your rule could be deleted in favour of the one already there.
- The move takes what's in the editor, including edits you haven't saved, and it's greyed out while the rule has a problem that would stop it saving.

### Fixed

- **A team login could hang forever on one character**: no tab, no error, and the launcher showing that character as already logged in. If the login server went quiet partway through, Lichborne kept waiting for an answer that never came. It now gives up after its time limit and reports the problem like any other failed login.
- **Moving a trigger to *All Characters* (or back) could delete a different trigger.** Every trigger that watches a variable was being treated as the same rule as every other one, so moving one could remove another. Transfer had the same problem and could skip them on import.
- **Profile Transfer now tells you about rules it didn't bring over.** If the character you're importing into already has a *different* rule with the same pattern, Transfer keeps yours and lists the ones it skipped, instead of skipping them silently.
- **A trigger's Echo to the Game window never appeared**, and neither did an echo to a panel you didn't have open. Both now show in the Game window, after the line that fired them.
- **Genie queue commands no longer import as game commands.** `#send clear` used to import as a trigger that sent the word "clear" to DragonRealms.
- A trigger saved with an action type this version doesn't recognise (from a hand-edited profile, say) no longer breaks the whole Triggers list.
- **Contacts → Templates works with a long list.** With many templates, every template was squashed flat and the one you were editing was cut off, Save button included. The Templates tab now works exactly like the Contacts tab: a list on the left that scrolls, a **search** box, and the editor on the right.
