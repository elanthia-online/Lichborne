## v0.21.1

### Mac: Lichborne now updates itself

Thanks to Zithri for the report. Mac builds now update the same way Windows and Linux do, so you no longer download each new version and run the Terminal command again.

**This takes one last manual step.** Your current version can't update itself, so download this one from the release page and run the usual command once:

```bash
xattr -cr /Applications/Lichborne.app
```

After that, updates arrive in the app. A brand-new Mac install still needs that command once, because Lichborne isn't notarized by Apple. If your Keychain asks for permission once after this install, choose **Always Allow**.

### For testers: test builds

Thanks to Horibu, any branch or pull request can now be built for Windows, Mac and Linux on GitHub and handed to a tester before it's released. Those test builds are temporary (they expire after 7 days), and on a Mac they need the `xattr -cr` command every time and don't update themselves.

### Under the hood: everything updated

Lichborne now runs on Electron 45 (Chromium 156), up from Electron 43, so it carries the latest browser security fixes. React, the build tools, the SQLite reader for Lich's database and the YAML library that reads your profiles are all on their current versions too. Nothing should look or work differently; your profiles read exactly as before (checked against real ones).
