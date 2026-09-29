## v0.20.1

Three ideas from our testers this week: make room names (and any other kind of game text) look how you want, make the compass easier to see, and talk to people straight from the Living Tableau.

### Text styles — make room names stand out

**Settings → Text styles** lets you give each kind of game text its own look: **room names**, **room descriptions**, **speech**, **whispers**, **thoughts**, **bold text** (creatures, deaths), and **the commands you type**. For each one you can pick:

- a **font** (any font installed on your computer),
- a **size**, as a percentage of your game font, so it still grows and shrinks with your Font size setting,
- **bold** or not, **italic** or upright, **small caps** or **all capitals**,
- a **text effect** — the same ones highlights use: glow, shimmer, rainbow, gold, fire, frost, neon, pulse, wave, bounce. Room descriptions offer only the calm ones (glow, pulse, neon), because a moving effect across whole paragraphs is heavy on your computer.

Shimmer, rainbow, gold and frost bring their own pale colours, so on a light theme the row warns you they'll be hard to read.

Each row shows a live preview of the real thing. Anything you leave on **Default** looks exactly as it does today. Styles apply everywhere that text appears — the game window, your stream panels, the Room panel and the Overview — and they're per character, so each one can have its own look. Tables like `exp` and `inv` keep their normal font so their columns stay lined up.

One thing to know: the game only marks the **"Name says,"** part of speech as speech, not the quote itself, so a speech style changes the attribution rather than the words.

*Suggested by subkermorianranger ("so it can be fancy like Saga").*

### Compass options

The compass that lights up the exits over your game text now has settings, under **Settings → Layout**:

- **Show or hide** it.
- **Size:** small, medium (the original) or large — the whole compass scales together.
- **Corner:** any of the four.
- **Backing:** a subtle or solid plate behind it in your theme's colours, so it's easy to see over a wall of text.
- **Unavailable exits:** a slider for how faint the directions you can't take are.
- **Click to walk:** click an arrow to go that way. Unlit arrows work too — some spells hide a room's exits, and if you know the way you can still try it. It's off unless you turn it on, and the gaps between arrows still let clicks through to the text underneath.

Nothing changes until you touch a setting. You can also use `/compass` — for example `/compass size large`, `/compass corner tl`, `/compass backing subtle` or `/compass dim 25`.

*Suggested by Q, TheUndistinguishedGentlegnome.*

### Talk to someone from the Living Tableau

**Right-click anyone in the Living Tableau** for a menu:

- **Say to Agan…** puts `say @Agan ` in your command bar.
- **Whisper to Agan…** puts `whisper Agan ` there.
- **Contact card**, for people on your contact list (this used to be a plain click).

Nothing is sent until you press Enter — just type your message. If you'd already typed something, it becomes the message, and if there's already a say or whisper line in the bar, only the name changes, so you can pick the wrong person and fix it with another right-click. Emotes stay where you put them (`say @Agan /happy hi`).

From the keyboard: Tab to a person and press Enter to open the same menu.

*Suggested by subkermorianranger.*

### A tidier update notice

When a new version is out, you'll now see a small **Update** pill in the top bar (or on the launcher) instead of a bar across the top of the window, so nothing on screen moves when an update turns up. Click it for a card that says what's happening in plain words, shows which version you're on, and links to **What's new** on GitHub. The download's progress shows in the pill and in the card's button, and you can keep playing while it runs.

- **Restart & install now asks first** if you have characters connected, and says how many will be disconnected. It used to restart straight away.
- **A download that fails now says so**, with the reason and a **Try again** button. It used to sit on "Downloading…" forever.
- **Later** hides the pill until the next launch; **Help → Check for updates** brings it back.

### Fixes

- Right-clicking inside an open menu in a floating window no longer opens a second menu on top of it.
- **Space** now chooses the highlighted item in a right-click menu, instead of typing a space into the command bar.
