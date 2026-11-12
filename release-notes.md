## v1.0.1

### Windows: Lichborne keeps up with your Ruby

The Ruby for Lich installer keeps a shortcut, `C:\Ruby4Lich5\current`, that always points at the newest Ruby it installed. Lichborne now uses it, so updating Ruby no longer leaves Lichborne running the old version. Thanks to Tysong for pointing it out.

- **Nothing to do.** If your Ruby path points at one version folder (for example `C:\Ruby4Lich5\4.0.9\bin\ruby.exe`), Lichborne switches it to `C:\Ruby4Lich5\current` the next time it starts. You can see it in **⚙ Lich Setup**.
- **Wherever you installed it.** This works for Ruby for Lich in any folder, not just `C:\Ruby4Lich5`.
- **Only ever forward.** A Ruby you picked that's newer than the one `current` points at is left alone, and so is a Ruby that didn't come from Ruby for Lich.
- **Clearer Ruby errors.** If Ruby can't be found, Lichborne now tells you what to do next (reinstall Ruby for Lich, click Auto-detect, or browse to it) and links the Lich install guide.
- **Older installs still work.** If your Ruby for Lich install predates the shortcut, **Auto-detect** picks your newest Ruby folder as before.
