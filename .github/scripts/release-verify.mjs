// CI release step 3 of 3 — runs AFTER all per-OS build jobs succeed.
// Ports the "verify" half of publish.mjs (steps 5-6): confirm everything
// landed in ONE draft, confirm the artifact set is complete for every platform
// this run was expected to build, then refresh the draft's notes + title.
//
// EXPECTED_PLATFORMS (env, comma-separated, default 'win') names which
// platforms' artifact sets must be present — the release.yml matrix and this
// list must be extended TOGETHER when Linux/Mac jobs are enabled, or verify
// will pass on a release that silently lacks a platform.
//
// Env: GH_TOKEN, GITHUB_REPOSITORY, EXPECTED_PLATFORMS.
import { readFileSync, existsSync } from 'fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version
const tag = `v${version}`
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? 'SekmehtDR/Lichborne').split('/')

const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN env var is not set.')
  process.exit(1)
}

// Per-platform expected artifact sets — names pinned by the explicit
// artifactName templates in package.json build.mac/build.linux (v0.18.0).
// Mac is arm64-only for now (Apple Silicon; add x64 entries if an Intel-Mac
// tester appears). The mac ZIP is not optional garnish — it is what
// electron-updater's Squirrel.Mac consumes once builds are signed; the dmg is
// for humans. Extra assets (e.g. .blockmap files) never fail verification —
// only MISSING expected ones do.
// Linux carries NO version in its name (B357, v0.19.7): electron-updater
// replaces a version-less AppImage in place, but moves a versioned one to the
// new versioned name — breaking every desktop shortcut on each update.
const PLATFORM_ARTIFACTS = {
  win: [`Lichborne-${version}-setup.exe`, `Lichborne-${version}-setup.exe.blockmap`, 'latest.yml'],
  linux: ['Lichborne.AppImage', 'latest-linux.yml'],
  mac: [`Lichborne-${version}-mac-arm64.dmg`, `Lichborne-${version}-mac-arm64.zip`, 'latest-mac.yml'],
}

const expectedPlatforms = (process.env.EXPECTED_PLATFORMS ?? 'win')
  .split(',').map(s => s.trim()).filter(Boolean)
for (const p of expectedPlatforms) {
  if (!PLATFORM_ARTIFACTS[p]) {
    console.error(`Unknown platform '${p}' in EXPECTED_PLATFORMS (valid: ${Object.keys(PLATFORM_ARTIFACTS).join(', ')}).`)
    process.exit(1)
  }
}

const GH_HEADERS = {
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'lichborne-release-ci',
}

async function listDrafts() {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, { headers: GH_HEADERS })
  if (!res.ok) { console.error('Failed to list releases:', await res.text()); process.exit(1) }
  const releases = await res.json()
  return releases.filter(r => r.tag_name === tag && r.draft)
}

// Sanity-check that everything landed in ONE draft. A duplicate with zero
// assets is deleted automatically (a harmless race remnant); a duplicate WITH
// assets is reported for manual review — never delete artifacts blindly.
let drafts = await listDrafts()
if (drafts.length > 1) {
  console.warn(`⚠ ${drafts.length} drafts exist for ${tag} — cleaning up empties...`)
  for (const d of drafts.slice()) {
    if (d.assets.length === 0) {
      const del = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${d.id}`, { method: 'DELETE', headers: GH_HEADERS })
      if (del.ok) { console.warn(`  deleted empty duplicate draft ${d.id}`); drafts = drafts.filter(x => x.id !== d.id) }
    }
  }
  if (drafts.length > 1) {
    console.error('⚠ Multiple drafts still hold assets — merge them manually on GitHub:')
    for (const d of drafts) console.error(`  ${d.html_url} (${d.assets.map(a => a.name).join(', ')})`)
    process.exit(1)
  }
}
const draft = drafts[0]
if (!draft) { console.error(`No draft release found for ${tag}.`); process.exit(1) }

// Expected artifact set — catch a half-uploaded release before it's published.
const assetNames = draft.assets.map(a => a.name)
const expected = expectedPlatforms.flatMap(p => PLATFORM_ARTIFACTS[p])
const missing = expected.filter(n => !assetNames.includes(n))
if (missing.length > 0) {
  console.error(`⚠ Draft is missing expected artifacts: ${missing.join(', ')} — do not publish until resolved.`)
  console.error(`  present: ${assetNames.join(', ') || '(none)'}`)
  process.exit(1)
}
console.log(`  all artifacts present (${expectedPlatforms.join(', ')}): ${assetNames.join(', ')}`)

// Patch release notes + title (a reused draft from a prior run may hold stale
// text or a wrong title — always refresh both; title stays the plain version
// to match the historical release list).
if (!existsSync('release-notes.md')) {
  console.error('release-notes.md not found — cannot refresh the draft body.')
  process.exit(1)
}
const releaseNotes = readFileSync('release-notes.md', 'utf-8')
console.log('Patching release notes...')
const patchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${draft.id}`, {
  method: 'PATCH',
  headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
  // tag_name MUST be re-sent. A PATCH that omits it CLEARS the draft's tag —
  // GitHub replaces it with an `untagged-<sha>` placeholder (observed on the
  // v0.18.0 run: prepare created the draft as v0.18.0, this job found it by
  // tag a second earlier, and the tag was gone immediately after this call).
  // That matters beyond the release page: BOTH scripts locate the draft with
  // `tag_name === tag`, so an untagged draft is invisible to a re-run and the
  // next run mints a SECOND draft — the exact duplicate the pre-create step
  // exists to prevent — and Publish no longer defaults to the right tag.
  body: JSON.stringify({ tag_name: tag, body: releaseNotes, name: version }),
})
if (!patchRes.ok) { console.error('Failed to patch release notes:', await patchRes.text()); process.exit(1) }

console.log(`Done. Draft release ${tag} is ready — review and click Publish:`)
console.log(`  ${draft.html_url}`)
