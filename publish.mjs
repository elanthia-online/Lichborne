// Release pipeline: clean → build → package+publish draft → patch notes.
// Usage:  $env:GH_TOKEN = '<token>'; node publish.mjs
// The draft stays unpublished until you click Publish on GitHub — electron-
// builder only creates the vX.Y.Z tag at that point (never tag manually).
import { build } from 'electron-builder'
import { readFileSync, readdirSync, rmSync, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version
const tag = `v${version}`
const owner = 'elanthia-online'
const repo = 'Lichborne'

const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN env var is not set.')
  process.exit(1)
}

if (!existsSync('release-notes.md')) {
  console.error('release-notes.md not found — write the release notes before publishing.')
  process.exit(1)
}
const releaseNotes = readFileSync('release-notes.md', 'utf-8')
if (!releaseNotes.includes(version)) {
  console.error(`release-notes.md does not mention ${version} — is it up to date? (Prepend the new section first.)`)
  process.exit(1)
}

// Warn (don't block) when the working tree is dirty or ahead of origin — a
// published build should correspond to a pushed commit so the tag electron-
// builder creates on Publish lands on history everyone can see.
try {
  const dirty = execSync('git status --porcelain', { encoding: 'utf-8' }).trim()
  if (dirty) console.warn('⚠ Working tree has uncommitted changes — the build will include them but git history will not.')
  const unpushed = execSync('git log --oneline @{u}..HEAD', { encoding: 'utf-8' }).trim()
  if (unpushed) console.warn(`⚠ ${unpushed.split('\n').length} commit(s) not pushed to origin yet.`)
} catch { /* no upstream configured — skip the warning */ }

// GitHub REST helpers (Bearer auth + pinned API version per current GH docs).
const GH_HEADERS = {
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'lichborne-publish',
}

// Step 1: clean release/ so no leftover files from prior runs get picked up
console.log('Cleaning release folder...')
if (!existsSync('release')) mkdirSync('release')
for (const f of readdirSync('release')) {
  if (f.endsWith('.exe') || f.endsWith('.yml') || f.endsWith('.blockmap')) {
    rmSync(`release/${f}`)
    console.log(`  deleted release/${f}`)
  }
}

// Step 2: compile main + renderer so __APP_VERSION__ and app.getVersion() reflect the new version
console.log('Building main and renderer...')
execSync('npm run build', { stdio: 'inherit' })

// Helper: all current draft releases for this tag.
async function listDrafts() {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, { headers: GH_HEADERS })
  if (!res.ok) { console.error('Failed to list releases:', await res.text()); process.exit(1) }
  const releases = await res.json()
  return releases.filter(r => r.tag_name === tag && r.draft)
}

// Step 3: PRE-CREATE the draft release. electron-builder's GitHub publisher
// otherwise creates it lazily on the FIRST artifact upload — and because it
// uploads artifacts in PARALLEL (setup.exe, .blockmap, latest.yml), two
// uploads can race the creation and GitHub allows duplicate drafts on the
// same tag. That was the "blockmap ends up in its own separate release" bug.
// With the draft already existing, the publisher finds it by tag and every
// artifact lands in ONE release. (Creating a DRAFT does not create the git
// tag — that still only happens when you click Publish.)
console.log(`Ensuring draft release ${tag} exists...`)
let drafts = await listDrafts()
if (drafts.length === 0) {
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    // name is the PLAIN version — matches how electron-builder titled every
    // prior release ('0.14.7', not 'v0.14.7'); the tag keeps the v.
    body: JSON.stringify({ tag_name: tag, name: version, draft: true, body: releaseNotes }),
  })
  if (!createRes.ok) { console.error('Failed to pre-create draft release:', await createRes.text()); process.exit(1) }
  console.log('  draft created.')
} else if (drafts.length === 1) {
  console.log(`  reusing existing draft (${drafts[0].html_url}) — new artifacts replace same-named ones.`)
} else {
  console.error(`Found ${drafts.length} draft releases for ${tag} — delete the duplicates on GitHub first, then re-run:`)
  for (const d of drafts) console.error(`  ${d.html_url}`)
  process.exit(1)
}

// Step 4: package and publish via electron-builder
// NSIS builds generate latest.yml automatically — no manual generation needed
console.log(`Packaging and publishing ${tag}...`)
await build({ publish: 'always' })

// Step 5: sanity-check that everything landed in ONE draft. A duplicate with
// zero assets is deleted automatically (a harmless race remnant); a duplicate
// WITH assets is reported for manual review — never delete artifacts blindly.
drafts = await listDrafts()
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

// Expected artifact set — catch a half-uploaded release before you publish it.
const assetNames = draft.assets.map(a => a.name)
const expected = [`Lichborne-${version}-setup.exe`, `Lichborne-${version}-setup.exe.blockmap`, 'latest.yml']
const missing = expected.filter(n => !assetNames.includes(n))
if (missing.length > 0) {
  console.error(`⚠ Draft is missing expected artifacts: ${missing.join(', ')} — do not publish until resolved.`)
  process.exit(1)
}
console.log(`  all artifacts present: ${assetNames.join(', ')}`)

// Step 6: patch release notes + title (a reused draft from a prior run may
// hold stale text or a wrong title — always refresh both; title stays the
// plain version to match the historical release list)
console.log('Patching release notes...')
const patchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${draft.id}`, {
  method: 'PATCH',
  headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: releaseNotes, name: version }),
})
if (!patchRes.ok) { console.error('Failed to patch release notes:', await patchRes.text()); process.exit(1) }

console.log(`Done. Draft release ${tag} is ready — review and click Publish:`)
console.log(`  ${draft.html_url}`)
