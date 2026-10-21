// Credits shown in Help → About Lichborne (the themed AboutModal). SINGLE
// source of truth — edit the lists here as the pool grows. Two tiers (Sekmeht):
// CONTRIBUTORS have filed logged reports/fixes; TESTERS are the rest of the
// pool (no logged reports yet). Both ordered by logged contribution volume
// (count BUGS.md mentions, combining aliases — see CLAUDE.md's About-credits
// rule). Identity notes honored here: Rakkor≡TheTargonian; Illiahanna is the
// renamed JadedSoul (≡ Jaded — one person, counts combined; BUGS.md still says
// "JadedSoul"/"Jaded", so count those toward Illiahanna);
// Elore is the renamed Aubrey AND ≡ Cherisse (one person, combined count → 3rd);
// Binu is a co-CREATOR (in DEVELOPERS, never a credits list).
export const DEVELOPERS = ['Sekmeht', 'Binu']

export const CONTRIBUTORS = [
  'Rakkor', 'Illiahanna', 'Elore', 'Morress', 'Legiro', 'Rhorgul', 'Thanator', 'Mahtra',
  // Zithri ≡ ohbeanz on Discord — first macOS tester, B238 ("Lichborne is
  // damaged and can't be opened"), the report that got Mac builds ad-hoc
  // signed. BUGS.md / Tracker.md log it under the Discord handle, so count
  // "ohbeanz" mentions toward Zithri (same convention as JadedSoul→Illiahanna).
  // Newest logged report, so last in the volume ordering.
  'Zithri',
  // Promoted from TESTERS in v0.19.1 (Sekmeht). Logged item: F82, the app-wide
  // command-history minimum length (v0.18.3). One logged report, so the tail of
  // the volume ordering.
  'Qij',
  // First EXTERNAL code contribution (PR #2, v0.19.4): attach to an
  // already-running detachable Lich session — a whole third connection mode,
  // researched against lich-5 source and verified in live play. GitHub handle
  // kahlen-tech; the PR's own commits are authored 'Claude' (AI-assisted), so
  // the human attribution lives in the merge commit and here.
  'Kahlen',
  // v0.20.4 (Sekmeht): a documentation review that caught the User Guide's
  // one-time setup command printed as `SET PROMPT STATUS` instead of
  // `SET STATUSPROMPT` (B524). One logged item, so the tail.
  'Vaddon',
  // Promoted from TESTERS in v0.20.4 (Sekmeht). No item logged in BUGS.md
  // under this name yet, so the tail of the volume ordering.
  'Crobin',
]

// All still at zero logged reports, so alphabetical is the stable order here —
// there is no volume to sort by until someone files something.
export const TESTERS = [
  'Cirostar', 'Damiza', 'Tirost', 'Wilhellm',
]

// The project's home at the Elanthia-Online org (v0.20.4, Sekmeht). Used only by
// Help → About. The updater's feeds and the other hardcoded links are a separate
// cut-over (DESIGN §18.4.1).
export const REPO_URL = 'https://github.com/elanthia-online/Lichborne'
// The AI Processing & Privacy notice (AINOTICE.md) — future GitHub location; the
// file is committed at the repo root, so it resolves once the repo is public.
export const AI_NOTICE_URL = 'https://github.com/elanthia-online/Lichborne/blob/main/AINOTICE.md'
// Discord invite — ALSO hardcoded in main.ts's Help → Discord menu item; keep
// the two in sync and rotate BOTH per major version (see CLAUDE.md's Discord
// rotation rule).
export const DISCORD_URL = 'https://discord.gg/ZDkXCeR72J'

// The community blurb — one paragraph; the modal wraps it with CSS, so no
// manual line breaks (unlike the old native message box).
export const ABOUT_BLURB =
  'Lichborne was created with the Simutronics DragonRealms community in mind. ' +
  "It's been a joy to work directly with folks from all walks to build a game " +
  'client rooted in a love for DragonRealms — for the GMs and staff who make it ' +
  'such a wonderful game, and for the vibrant Lich community.'
