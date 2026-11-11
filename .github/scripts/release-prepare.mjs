// CI release step 1 of 3 — runs BEFORE the per-OS build jobs.
// Ports the "prepare" half of publish.mjs (which stays untouched as the local
// Windows-only fallback): validate release-notes.md mentions the version, then
// PRE-CREATE the single draft release for this tag.
//
// Pre-creating matters even more in CI than it did locally: publish.mjs did it
// to stop electron-builder's PARALLEL ARTIFACT UPLOADS racing the lazy draft
// creation (the "blockmap in its own release" bug). Here, up to three whole OS
// BUILD JOBS publish concurrently — without a pre-existing draft, each could
// mint its own duplicate draft on the same tag. With it, every job finds the
// draft by tag and all artifacts land in ONE release.
//
// Env: GH_TOKEN (the workflow's GITHUB_TOKEN), GITHUB_REPOSITORY (owner/repo,
// set automatically by Actions; falls back to the canonical repo for local runs).
import { readFileSync, existsSync } from 'fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const version = pkg.version
const tag = `v${version}`
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? 'elanthia-online/Lichborne').split('/')

const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN env var is not set.')
  process.exit(1)
}

// Same guardrail as publish.mjs: refuse to build a release whose notes are
// stale. (The dirty-tree warning from publish.mjs has no CI equivalent — a
// workflow always builds a pushed commit, so that guardrail is satisfied by
// construction.)
if (!existsSync('release-notes.md')) {
  console.error('release-notes.md not found — write the release notes before publishing.')
  process.exit(1)
}
const releaseNotes = readFileSync('release-notes.md', 'utf-8')
if (!releaseNotes.includes(version)) {
  console.error(`release-notes.md does not mention ${version} — is it up to date? (Replace its contents with the new version's section first.)`)
  process.exit(1)
}

const GH_HEADERS = {
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'lichborne-release-ci',
}

// Every release for this tag, draft or not. `listDrafts` deliberately filters
// to drafts — which means a PUBLISHED release for the same tag is invisible to
// it, and the forgot-to-bump case (re-running Release without touching
// package.json) would sail past and mint a brand-new draft on a tag that is
// already out in the world. Two releases, one tag, and the one-draft discipline
// the pre-create step exists to enforce is quietly broken.
async function listAllForTag() {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, { headers: GH_HEADERS })
  if (!res.ok) { console.error('Failed to list releases:', await res.text()); process.exit(1) }
  const releases = await res.json()
  return releases.filter(r => r.tag_name === tag)
}

// ONE fetch, both questions. The published check and the draft check used to
// hit the same endpoint separately.
const forTag = await listAllForTag()

// Bump-the-version guard. Cheap, and it catches the single most likely release
// mistake: hitting Run workflow again after publishing, without bumping.
const published = forTag.filter(r => !r.draft)
if (published.length > 0) {
  console.error(`${tag} is ALREADY PUBLISHED — ${published[0].html_url}`)
  console.error('Bump the version in package.json, replace release-notes.md with the new version\'s')
  console.error('section, commit and push, then run this workflow again.')
  process.exit(1)
}

console.log(`Ensuring draft release ${tag} exists...`)
const drafts = forTag.filter(r => r.draft)
if (drafts.length === 0) {
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    // name is the PLAIN version — matches how every prior release was titled
    // ('0.14.7', not 'v0.14.7'); the tag keeps the v. Creating a DRAFT does
    // not create the git tag — that only happens when Publish is clicked.
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
