## v0.19.7

### New: one-click Reconnect after a drop

When your connection dropped, the button at the right of the top bar used to
say **Login**, and clicking it closed the character's tab and sent you back to
the character list, losing everything on screen. It now says **Reconnect**:
one click logs that character straight back in, in the same tab, with your
scrollback intact. It shows **Reconnecting…** while it works. To log in a
different character, use the **+** tab as usual.

### New: windows remember where you left them

Lichborne used to open at the same size in the same place every time. Now each
window — the main one and any character you've moved into its own window —
reopens at the size and position you left it, maximized if it was maximized.

If a window was on a monitor that isn't connected any more, it opens in the
middle of your main screen instead of somewhere you can't reach, and a window
too big for your current screen is shrunk to fit.

### New: the + window has the full login experience

Clicking **+** to bring in another character now offers everything the logon
screen does for that: your saved **Teams** (and any teams pinned to
Favorites), **⟲ Reconnect Last**, **⚡ Team Login** and **⇋ Attach**. Launching
a team from here skips anyone already playing, keeps to one character per
account, and asks before switching an account that already has someone on.
The window closes once the team starts connecting.

### Changed: the + window matches the rest of Lichborne

The window the **+** tab opens is now a proper Lichborne dialog, in the same
style as **About Lichborne**: a titled header — **Connect a character** — with
the close button, rounded corners, and colours that follow your theme.

### Changed: "+ Add account" matches your account list

**+ Add account** is now a slim, full-width row under your accounts — it looks
like the next account slot, with a dashed outline — instead of a large tile.
Same on the logon screen and in the + window.

### Changed: in the Overview, highlighting shows who you're typing to

The highlighted tabs and cards are now exactly the characters your next command
will reach. Select a card and just that card and its tab light up. Choose
**All characters** and every connected card and tab lights up. A highlighted
card shows an accent border; the card itself doesn't change colour.

### Changed: every window looks and works the same way

Every dialog now has the same look as **About Lichborne**. That includes Settings, the Layout Manager, the Lich Dashboard, the Session Log, the theme picker and editor, Transfer, Import, Add account, Lich Setup, Quick Send, the AI consent window, the Experiences shelf and the Maps window. Buttons, fields, tabs and close buttons look the same everywhere. Delete buttons are red, and labels follow one set of rules.

### New: Lichborne asks before throwing work away

- **Deleting asks first.** These all ask in one themed dialog, with Cancel selected so a stray Enter can't delete anything:
  - a rule's ✕;
  - deleting a team, profile, custom theme, group or mode;
  - removing an account;
  - Reset to defaults, Reset panels and Rebuild.

  An editor's own Delete button asks right there in the editor.
- **Unsaved edits aren't lost.** Say you've changed a rule, contact, template, theme, profile, team or Lich script, and you pick something else or close the window. Lichborne now asks whether to discard your changes first.
- **The keyboard follows the dialog.** Opening a dialog takes the cursor out of the command bar, so Enter can't send a half-typed command to the game underneath. Closing it puts the cursor back, so you can type straight away.

### Fixed: a round of consistency fixes

- **Contacts:**
  - New contacts, new templates and deleted templates show up in the game text right away.
  - Saving a contact no longer resets other contacts' "last seen".
  - Search has a clear button and a count, and the list is sorted.
  - The built-in **Friends** and **Enemies** templates no longer offer a Delete that didn't stick — they always came back.
- **Editing and saving:**
  - **+ New** no longer leaves an empty "Unnamed" entry behind if you change your mind.
  - Enter saves in every editor. It also submits Attach, Edit profile, the team editor and the Add account password.
  - A trigger can't be saved without a pattern it can match, and a disabled Save button tells you why.
  - A macro now needs a key before it can be saved.
- **Panels:**
  - Right-clicking a panel's text now offers Mute, Substitute and Show in Log, like the main window.
  - Every panel's right-click menu is laid out the same way.
- **Staying reachable:**
  - The Lich Dashboard's close button stays on screen in narrow windows.
  - The Experience A−/A+/⚙ buttons stay reachable in short windows.
- **Import and export:**
  - The Import window no longer closes if you click outside it mid-import.
  - A double-clicked Export writes only one file.
- **Empty panels:**
  - Empty panels say so instead of showing nothing.
  - The Injuries and Experience panels wait for the game before saying there's nothing to show.
- **Overview:**
  - Overview cards use the same health colours in the header and the bar.
  - Their timers follow your Timer style setting.
- **Spell Monitor:** a card with an extra note, like a spell that has just ended, no longer makes every other card in its row taller. The note now sits where the time goes, and the full text is in the card's tooltip. Hovering a spell that has just ended no longer makes its tooltip flicker, and neither does hovering the Moons refresh button.
- **Stacked windows:** clicking outside a window that opened on top of another one now closes it, such as Lich Setup over Settings. It used to do nothing.
- **Naming:**
  - The Lich Scripts panel and the Spell Monitor are titled the same as their tabs.
  - Script uptime reads like the Overview's (1h 23m).

### Fixed: Esc closes the dialog you're looking at

Esc now closes whichever dialog is on top, and only that one. It used to do
nothing in Automations, Contacts, Settings, the Maps window, the + window, Lich
Setup and more, and in a couple of places one press closed two dialogs at once.
A search box clears first, and a dialog that's busy saving ignores Esc.

### Fixed: everything reachable from the keyboard

Panel tabs, character tabs, rule lists, Settings switches and the panel **+**
menu can all be reached with Tab and used with Enter or Space. Clicking a
Settings switch's label now flips it too.

### Fixed: a round of polish

- Text that was hard to read on light themes — Quick Send's typing, the update
  banner, several highlight and map colours — now follows your theme.
- Hovering a selected tab or list row no longer hides that it's selected, and
  open buttons on the top bar are clearly marked.
- The **Experiences** button lights up only while its shelf is open, like the
  other top-bar buttons. It used to stay lit whenever an Experience was docked
  in a panel.
- Settings and the Add Character wizard fit small windows, toasts and About no
  longer appear behind other dialogs, and long menus scroll instead of running
  off screen.
- Status chips, compact vitals, the roundtime strips and every ✕ explain
  themselves when you hover them.
- The Experience panel's bars and the Lich Map's room details grow with your
  font size.
- Closing Quick Send puts your cursor back where it was.

### Fixed: a round of macOS and Linux fixes

- **Trigger "log to file" actions work on Linux again, and no longer vanish on
  upgrade anywhere.** The files are saved in a **TriggerLogs** folder inside
  Lichborne's data folder. They used to be written next to the program itself,
  which is read-only on Linux and replaced by every upgrade.
- **macOS:** Option-key macros work, including ones imported from Genie or
  Frostbite or brought over from Windows. The app menu reads "Lichborne",
  clicking the Dock icon brings a minimized window back, Help → Check for
  Updates tells you updates are manual, a notify trigger also bounces the Dock
  icon, and restarting the Mac no longer stalls on Lichborne. First-time setup
  no longer picks an old system Ruby that Lich can't use.
- **Linux:** the download is now always called `Lichborne.AppImage`, so updates
  keep the name and your shortcuts keep working. The window shows Lichborne's
  icon and groups with its launcher entry.
- **Both:** quitting with a character in its own window no longer logs it out
  if you then cancel. A font picked on another computer falls back to a similar
  one instead of a plain typewriter font, and typing with an input method
  (Japanese, Chinese, Korean) no longer clears the command line when you press
  Esc.

### Fixed: dialogs opened from the + window no longer hide behind it

**Edit Profile…** on a character opened underneath the + window, so the button
seemed to do nothing. It — and Team Login and team editing, which now live
there too — open on top.

### Fixed: the + window opens straight to your characters

Opening **+** showed a plain dark box for a moment before the character list
appeared. It now opens as the normal panel, and after the first time it shows
your characters immediately.

### Fixed: the add-character window has a visible close button

The window the **+** tab opens now has an **✕** in its top-right corner. There
was one before, but it sat in the far corner of the whole app window rather than
on the panel, so it was easy to miss. Clicking outside the panel still closes it
too.

### Fixed: the Overview no longer shows two different "selected" characters

Opening the Overview marked one character as **current**, with a badge and a
highlighted border, even though the input bar at the bottom was set to
**All characters**. Clicking a card also changed who you were typing at but not
which tab was active, while clicking a tab changed both.

Now there's one selection. Clicking a card aims the input bar at that character
**and** makes its tab the active one, and you stay in the Overview. The
highlighted card is always the one you're typing at, and the one you'll land on
when you leave. With **All characters** chosen, every connected card is
highlighted, because that's who your next command reaches.

### New: an Unconscious marker in the icon bar

DragonRealms never announces "unconscious" the way it does stunned or bleeding —
the only place it says so is the letter **U** in the status prompt, where `SUP>`
means stunned, unconscious and prone. Lichborne now reads that letter and shows
**Unconscious** in the icon bar's combat slot, and `$unconscious` is available in
triggers, macros and aliases.

This one needs the status prompt turned on in game — type `set statusprompt`
once. Without it DragonRealms sends no letters at all, so the marker can never
appear. Thanks to Binu for confirming what the letter means.

### New: give the Lichborne wordmark a text effect

The **Lichborne** text in the top-left corner can now wear an effect — Glow,
Shimmer, Rainbow, Pulse, Gold, Gradient, Fire, Frost, Neon, Wave or Bounce —
picked in **Settings → Display → Wordmark effect**. There's a live preview
beside the dropdown, so you can see each one before you keep it.

It's set **per character**, so if you play several at once you can tell at a
glance which one is in front. The default is **Static**, which looks exactly
as it always has and takes its colours from your theme.

Your theme still drives the colours underneath: Glow, Gradient, Shimmer and
Neon are built from your accent colours, so they change when you change theme.
Rainbow, Gold, Fire and Frost have their own fixed palettes. If you have
**Epilepsy safe mode** on, every effect holds still — the motion stops, the
colour stays.

### Under the hood

Lichborne now runs on Electron 43.7.0, the newest security and bug-fix update in
the same line.
