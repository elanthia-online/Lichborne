## v0.19.8

### New: your own named colors, and a Colors tab to manage them

Thanks to **Elore** for this one. If you use the same shade for a whole set of
highlights (every buff that drops in one orange, say), you no longer need to
remember its hex code, and you'll never end up with orange that's slightly off.

- Open **Automations → Colors** and make a color, like "Buff drop" or "Danger".
- Anywhere you choose a color (highlights, trigger echoes, contact templates,
  groups), click the **▾** beside the color box to pick one of your colors, or
  just start typing its name and choose it from the suggestions. Or pick any
  color you like and choose **Save as a color…** to name it on the spot.
- **Change a color once and everything using it changes with it**, right away.
  The Colors tab shows what uses each color.
- Your colors are shared by all your characters.
- Removing a color takes it out of your lists, but anything already using it
  keeps its color, and you can restore it.
- Built-in colors (red, gold, and the rest) never change, so picking one still
  just uses that color. **Make an editable copy** gives you one you can tune.
- Slash commands: `/colors add "Buff drop" #ff9040`, `/colors rename`,
  `/colors remove` and `/colors manage`. `/highlight add "fades" "Buff drop"`
  uses your color.
- Profile Transfer brings along the colors your highlights and templates use.

### New: bold your contact tags, and a clearer template card

The **tag** on a contact template can now be **bold**, independently of the
name — it had colour, a background and text effects, but not the one thing the
name had. `/template add … tagbold` sets it too.

Ticking **Bold name text** also now visibly bolds the template in the list
behind the editor. It always applied in game; the list row was forcing its own
bold weight, so a bolded template looked identical to an unbolded one in the
one place you go to check.

The template card is now grouped under labelled dividers — **Contact name**,
**Tag**, **Preview**, **Applies to** — instead of one long ladder of fields
where a tag option could end up sitting beside a name option. Picking an effect
adds its colour box inside the relevant group rather than shuffling everything
below it, and the tag's styling only appears once you've given it a tag.

### New: style a trigger's echo the way you style everything else

A trigger's **Echo** action could pick a colour. It can now also set a
**background**, go **bold**, and wear any of the **text effects** highlights and
contact templates offer — with a live preview in the editor so you can see it
before the trigger ever fires.

The point is that the one line a trigger writes for you should be as easy to
spot as anything else on screen. A "your buff dropped" echo can shimmer; a
danger warning can sit on a red background.

### Changed: tidier Automations and Lich Dashboard headers

Thanks to **Sekmeht** for calling this one out. The Automations title bar was
carrying five different kinds of control in a single row — the tabs, the
character/global switch, the Analytics toggle, the import button and the close
button — all at the same size and spacing, with nothing to separate them.

- **The tabs now have a row of their own**, so they read left to right instead
  of competing for space with everything else.
- **The character/global switch sits with them, under an "Applies to" label** —
  the same words the rule editors use when you move a single rule between your
  character and all characters.
- **Analytics and "Import from another client…" moved into a "⋯" menu** beside
  the close button. The ⋯ shows a small dot while Analytics is switched on, so
  you can still tell at a glance.
- **The Lich Dashboard got the same treatment** — its five tabs moved to their
  own row, which also means its close button can no longer get squeezed off the
  edge on a narrow window.
- **Dropdown menus inside dialogs now match each other.** The group picker, the
  macro variable list, the colour picker and the new ⋯ menu were four separate
  implementations of the same thing that had drifted apart; they now share one.
  You may notice two small differences: the highlight that follows your cursor
  is slightly softer, and two of those menus sit on the same background shade as
  the other two now. Menus in the game area — the app bar's ⋯, the right-click
  menu, the mode switcher, a panel's **+** — are deliberately untouched, because
  those still scale with your font size setting.

Nothing moved out of reach: everything is one click from where it was, and the
tabs, switch and buttons all keep working exactly as before.

### Fixed: a polish pass over the whole interface

- **"Compact" line height now actually is compact.** Every line of game text was
  being floored at the next setting up, so the default spacing was wider than it
  claimed and you were losing roughly six lines of visible text on a normal
  window. This is the most noticeable change in the release.
- **You can see which rule you have selected.** In Highlights, Triggers, Macros,
  Aliases, Groups and Lich Scripts the selected row was nearly invisible on
  several themes -- and merely hovering a row looked *more* selected than the one
  you were editing.
- **The Connect button on your character cards is readable on hover** on every
  theme. On Terminal it was very nearly invisible.
- **Line height and Large Print now reach the Experience, Injuries and Lich
  Scripts panels.** They were stuck at a fixed spacing, so they sat taller than
  the panel beside them and ignored Large Print entirely.
- **Macros no longer fire while a dialog is open, and typing no longer lands in
  a command bar you can't see.** Typing a port number into Attach could walk
  your character, and the digit never reached the field.
- **Switching character while the Overview is open** no longer puts your cursor
  in a command bar you cannot see (where Enter still went to the game).
- **The panel + menu opens the right way up** when a panel sits near the top of
  the window, instead of showing a sliver.
- Smaller things: the Team Login summary says **Close** rather than Done; the
  Debug panel's close button no longer flashes red; the map's search results show
  which one is selected; and the vitals percentages stop jittering on the
  proportional fonts.
- **Clearer wording on a destructive action:** Automation Analytics' bulk
  clean-up now says **Delete** rather than Remove, because it permanently deletes
  rules -- the same word the single-rule delete beside it already used.

### Fixed: Shimmer, Gold and Rainbow no longer go patchy

The painted effects — Shimmer, Rainbow, Gold, Gradient and Frost — work by
clipping a moving gradient to the letters. Whenever one of your word highlights
matched something inside the line, the line was cut into pieces and **each piece
started the gradient again**, so a short word squeezed the whole colour ramp into
a few characters while a long stretch spread it out. That's what made effects
look patchy, made Shimmer seem to appear in random places, and made ticking
**Bold** look like it switched the effect off — bold only changed the letter
widths, so a short piece landed on a flat part of its own gradient.

Now every piece of a line shares one gradient and takes its own slice of it, so
the effect reads as continuous however many highlights overlap it. This fixes it
for **line highlights on game text too**, not just trigger echoes.

**Gold, Rainbow, Fire and Frost use their own fixed colours**, so the Color you
pick won't tint them — Shimmer, Gradient and Glow do use it. The editors now say
so under the effect, instead of leaving you to wonder why the colour did
nothing.

Two details worth knowing:

- Your existing echoes are untouched. An echo that only sets a colour behaves
  exactly as it did, including how it interacts with your highlight rules.
- Once an echo carries its own styling, that styling wins over a **Line**
  highlight that also matches it — the echo was written for that exact message.
  Word highlights still paint on top either way.

### Fixed: bold works again if you've lowered your text weight

If you set **Settings → Text weight** below Default, **bold stopped doing
anything at all** — not just on contact templates, but everywhere: highlights,
creature names, room titles, panel headings. It looked like bold was broken;
really it was being asked for in a weight your font doesn't have.

Most monospaced fonts (Consolas among them) ship exactly two weights, normal
and bold. Lowering the text weight also lowered the *bold* weight, and once
both requests fell below what the font has, the browser rounded them to the
same one — so bold text and normal text came out as the same letters. Only the
Default text weight escaped it, which is why it went unnoticed for so long.

Bold now has a floor, so it always lands on a genuinely heavier weight than
your body text whichever font and text weight you pick. If you run a thinner
text weight, bold will look noticeably stronger than it did.

One related fix: the **contact popover** (clicking a contact's name in game)
painted names its own way — it ignored the tag's bold, showed no text effects,
and used a fixed bold weight. It now renders exactly like the game text and the
template preview.

### New: pick your own colours in the Theme Editor

The Theme Editor's colour rows now use the same control as the rest of the app —
a swatch, a typable box that suggests as you type, and a dropdown offering
**your named colours** alongside the built-ins. No more hunting for a hex code
you already named.

One deliberate difference from highlights and contact templates: **a theme
copies the colour rather than following it.** Pick "Buff drop" for your app
background and the theme stores that orange, so the theme still works perfectly
when you share the file with someone who doesn't have your palette. The trade is
that changing "Buff drop" later won't re-tint your theme — re-pick it if you
want the new shade. The field's tooltip says so, and the dropdown is labelled
"Your colors (copied)".

### Fixed: line highlight effects now show in the game, and layer with word highlights

A highlight set to **Line** can have a text effect — Rainbow, Shimmer, Fire,
Wave and the rest. Until now only its colour and background reached the game
window; the effect itself (anything other than Glow) and **Bold** only ever
appeared in the editor's Preview.

Line effects now paint in the game window, the stream panels, the Overview
cards and the Room panel. They also layer the way you'd expect: if a word in
that line has its own highlight with its own effect, the word keeps its effect
and the rest of the line keeps the line's. A few details:

- A word highlight that sets only a colour, with no effect of its own, takes on
  the line's effect in its own colour.
- Contact names keep their own contact styling.
- Wave and Bounce lines now wrap between words instead of in the middle of one,
  and every letter starts moving straight away.
- The Preview now draws your highlight with the same code the game window uses,
  so what you see there is what you'll get in play.

### Fixed: "Manage" buttons that opened a dialog already on screen did nothing

If Automations was already open on a different tab, the Mode button's
**Manage** (and the colour fields' **Manage colors…**) quietly did nothing —
the dialog stayed where it was. Every button that opens Automations at a
particular tab now takes you there, whether it's open already or not.
