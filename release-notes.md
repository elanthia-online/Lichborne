## v0.20.4

A smaller release about size and speed: zooming the window and changing your game text are now clearly two different things, number boxes stop fighting you while you type, and Settings no longer slows the whole app down while it's open.

### Window zoom and game text size

**Ctrl+=** / **Ctrl+−** / **Ctrl+0** (Cmd on a Mac) zoom the *whole window*: menus, dialogs and game text together, in every Lichborne window, and the zoom is remembered when you restart. Your **game text size** is a separate, per-character setting. Both are now easy to find:

- **Settings → Display** has a new **Window zoom** row, with −, +, the current percent and a Reset, right under Font size.
- In the **View** menu, *Font* is now **Game Text Size**, and the zoom items say **Window Zoom In / Out / Reset Window Zoom**.

If you've bound a macro to Ctrl+= or Ctrl+Num+, your macro still wins; you can zoom with the other keys, the View menu or Settings.

### Number boxes you can type in

Every number field (font size, delays, cooldowns, log retention, theme opacity…) now lets you clear it and type freely. It takes your number when you press Enter, click away or use ↑/↓, and **Esc** puts the old value back. Before, backspacing the font size could snap it straight to 8.

### Faster Settings

With Settings open, zooming or switching characters could pause for close to a second, because the font list draws every font you have installed in its own style. It now only draws the fonts you can see, and the font list loads instantly after the first time you open Settings.

### Touch, for empaths

Right-click a player in the Living Tableau and an empath now sees **Touch** at the top of the menu, which starts healing them. Lichborne knows your guild once you've typed `info` in the game, or from the Guild set in Edit Profile.

### Your settings, kept safe

A sweep for ways settings could be lost found and fixed several:

- **Each character keeps its own theme.** Quitting with several characters open used to save all of them with the theme of the one you were looking at.
- **Custom themes can't be deleted by accident.** Saving a theme from a second character's Theme Picker could remove themes you'd just made on the first.
- **Changes stick when you open another window.** Decoupling a character or a Team Login into separate windows could undo a setting changed a moment before, such as your Lich path, AI settings or Automation Analytics.
- **Closing a character's tab saves it.** Command history and group on/off changes could be lost when you closed a tab.
- **A damaged profile is kept, not wiped.** If a profile file can't be read, Lichborne now sets it aside, tells you where, and rebuilds from what it has, instead of replacing it with an empty one. The same goes for saved passwords and AI keys, and all of them are now written in a way a crash or power loss can't half-finish.

### Fixes

- The selected character tab now sits right on the bar's bottom edge instead of floating just above it.
- Settings' **−** button no longer makes the game text *bigger* when it's already at its smallest sizes; every text-size control now uses the same 8–24 range.
- Panel tabs reach the bottom of their strip at every zoom level, and when there are more tabs than fit, a thin bar appears along the bottom and the mouse wheel scrolls them sideways.
- In the Lich Dashboard, the search highlight stays on its line in long files when the window is zoomed.
- The **Edit contact** button (click a contact's name in the game text) now matches the launcher's Connect button and follows your theme.
- In the Living Tableau, a dead character (and a dead creature) now shows a skull instead of an ✕.
- The User Guide's one-time setup now gives the right command, `SET STATUSPROMPT`. Thanks to **Vaddon**, a new contributor, who caught it reading through the docs.
