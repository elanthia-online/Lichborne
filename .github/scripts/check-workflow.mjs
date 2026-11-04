// Semantic validation of release.yml + the release artifact contract.
// Run by ci.yml on every push, and worth running locally after ANY edit to
// release.yml or the build config.
//
// WHY THIS IS A COMMITTED CHECK AND NOT A YAML LINT (pitfall #112): an edit
// once anchored on the GH_TOKEN line and orphaned CSC_IDENTITY_AUTO_DISCOVERY
// out of the packaging step's `env:` and into the NEXT step's `run:` script.
// The file was still valid YAML — a syntax check passed — but the job failed
// (the shell tried to execute `CSC_IDENTITY_AUTO_DISCOVERY:`) and, worse, the
// variable was silently unset, so electron-builder resumed hunting the runner's
// keychain for a signing identity. That cost a mac release. These assert the
// PROPERTIES the pipeline depends on; "it parses" proves none of them.
//
// Also enforces the three-way artifact contract, which is otherwise only
// discoverable by a failed release: package.json's artifactName templates must
// render to exactly the names release-verify.mjs demands.
// "It parses" proves nothing: the CSC_IDENTITY_AUTO_DISCOVERY incident produced
// perfectly valid YAML in which the env var had become a line of shell. These
// assert the PROPERTIES the release depends on.
import { readFileSync } from 'fs'

// CRLF → LF: Windows CI checks out with CRLF, and a JS `.` does not match \r,
// so any `.*\n` pattern below would fail there and pass on Linux.
const readText = (f) => readFileSync(f, 'utf-8').replace(/\r\n/g, '\n')
const yml = readText('.github/workflows/release.yml')
const lines = yml.split('\n')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ok    ' + m) } else { fail++; console.log('  FAIL  ' + m) } }

// 1. The packaging step must carry BOTH env vars, in ITS env block.
const pkgIdx = lines.findIndex(l => l.includes('name: Package and upload to draft'))
ok(pkgIdx > 0, 'packaging step exists')
const pkgBlock = lines.slice(pkgIdx, pkgIdx + 20).join('\n')
const beforeNextStep = pkgBlock.split(/\n\s+- name:/)[0]
ok(/GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(beforeNextStep),
   'packaging step carries GH_TOKEN')
ok(/CSC_IDENTITY_AUTO_DISCOVERY:\s*'false'/.test(beforeNextStep),
   "packaging step carries CSC_IDENTITY_AUTO_DISCOVERY: 'false'")

// 2. No env-style line orphaned into a shell block — the actual B-incident.
//    Walk `run: |` bodies and flag any bare `NAME: value` line.
let inRun = false, runIndent = 0, orphans = []
for (const [n, l] of lines.entries()) {
  if (/^\s+run:\s*\|/.test(l)) { inRun = true; runIndent = l.search(/\S/); continue }
  if (inRun) {
    const indent = l.search(/\S/)
    if (l.trim() === '') continue
    if (indent <= runIndent) { inRun = false; continue }
    if (/^\s*[A-Z][A-Z0-9_]*:\s*\S/.test(l)) orphans.push(`L${n + 1}: ${l.trim()}`)
  }
}
ok(orphans.length === 0, `no env-style line inside a run: block${orphans.length ? ' → ' + orphans.join(' | ') : ''}`)

// 3. The signature step stays macOS-gated (it would fail the job on win/linux).
const sigIdx = lines.findIndex(l => l.includes('name: Verify macOS signature'))
ok(sigIdx > 0, 'macOS signature step exists')
ok(lines.slice(sigIdx, sigIdx + 3).some(l => /if:\s*matrix\.os\s*==\s*'macos-latest'/.test(l)),
   'signature step is gated on macos-latest')

// 4. Matrix ↔ EXPECTED_PLATFORMS must move together.
const osEntries = [...yml.matchAll(/^\s+- os:\s*(\S+)/gm)].map(m => m[1])
const expected = (yml.match(/EXPECTED_PLATFORMS:\s*(\S+)/) ?? [])[1]?.split(',') ?? []
const OS_TOKEN = { 'windows-latest': 'win', 'ubuntu-latest': 'linux', 'macos-latest': 'mac' }
const fromMatrix = osEntries.map(o => OS_TOKEN[o]).filter(Boolean).sort()
ok(JSON.stringify(fromMatrix) === JSON.stringify([...expected].sort()),
   `matrix [${fromMatrix}] matches EXPECTED_PLATFORMS [${expected}]`)

// 4b. B590: the Linux build stays on the old base, and the gate stays armed.
ok(/- os: ubuntu-latest\s+args: --linux\s+container: ubuntu:22\.04/.test(yml), 'Linux builds in the ubuntu:22.04 container')
ok(/^\s+container: \$\{\{ matrix\.container \}\}/m.test(yml), 'build job uses the matrix container')
ok(/npm_config_build_from_source=true/.test(yml), 'Linux build compiles native modules from source')
ok(/CXXFLAGS=-UV8_DEPRECATION_WARNINGS/.test(yml), "g++-12 can compile Electron's V8 headers")
ok(readFileSync('build/afterPack.cjs', 'utf-8').includes('checkLinuxLibraries(context.appOutDir)'), 'afterPack checks the Linux native module')

// 5. Never build on a plain push.
ok(!/^\s*push:/m.test(yml.split('jobs:')[0]), 'release is manual-only (no push trigger)')

// 6. Artifact-name contract: package.json templates → what verify demands.
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const v = pkg.version, name = pkg.build.productName
const render = (tpl, ext, arch) => tpl
  .replace('${productName}', name).replace('${version}', v)
  .replace('${ext}', ext).replace('${arch}', arch)
const verify = readFileSync('.github/scripts/release-verify.mjs', 'utf-8')
const demands = (p) => [...(verify.match(new RegExp(`^\\s+${p}: \\[(.*)\\],`, 'm'))?.[1] ?? '')
  .matchAll(/[`']([^`']+)[`']/g)].map(m => m[1].replace('${version}', v))
for (const [plat, ext, arch] of [['win', 'exe', 'x64'], ['linux', 'AppImage', 'x64'], ['mac', 'dmg', 'arm64']]) {
  const built = render(pkg.build[plat].artifactName, ext, arch)
  ok(demands(plat).includes(built), `${plat}: builder produces "${built}" and verify expects it`)
}

// 7. test-build.yml: the same build as the release, but it must never publish.
const tb = readText('.github/workflows/test-build.yml')
const tbLines = tb.split('\n')
const tbCode = tbLines.filter(l => !/^\s*#/.test(l)).join('\n')
const tbPkgIdx = tbLines.findIndex(l => l.includes('name: Package (no publish)'))
ok(tbPkgIdx > 0, 'test-build: packaging step exists')
const tbPkg = tbLines.slice(tbPkgIdx, tbPkgIdx + 20).join('\n').split(/\n\s+- (?:name|uses):/)[0]
ok(/electron-builder \$\{\{ matrix\.args \}\} --publish never/.test(tbPkg), 'test-build: packages with --publish never')
ok(!/GH_TOKEN|secrets\./.test(tbCode), 'test-build: no token or secret in use (cannot reach a release)')
ok(/CSC_IDENTITY_AUTO_DISCOVERY:\s*'false'/.test(tbPkg), 'test-build: packaging step carries CSC_IDENTITY_AUTO_DISCOVERY')
ok(/^permissions:\s*\n\s+contents: read\s*$/m.test(tbCode), 'test-build: read-only token')
// Positively: workflow_dispatch and nothing else. A schedule (or any other
// trigger) would start a run with no `inputs`, so no platform is ticked.
const tbOn = (tbCode.split(/^"on":[ \t]*$/m)[1] ?? '').split(/^\S/m)[0]
const tbTriggers = [...tbOn.matchAll(/^  (\w+):/gm)].map(m => m[1])
ok(tbTriggers.join() === 'workflow_dispatch', `test-build: workflow_dispatch is the only trigger [${tbTriggers}]`)
ok(/retention-days: 7/.test(tbCode), 'test-build: artifacts expire after 7 days')
const tbOs = [...tbCode.matchAll(/"os":"([^"]+)"/g)].map(m => m[1])
ok(JSON.stringify([...tbOs].sort()) === JSON.stringify([...osEntries].sort()),
   `test-build targets [${tbOs}] match release matrix [${osEntries}]`)
// Per platform, the packaging args and container must match release.yml too,
// or a test build would package a different target set than the release.
const releaseTargets = Object.fromEntries([...yml.matchAll(
  /^\s+- os:\s*(\S+)\s*\n\s+args:\s*(\S.*?)\s*\n(?:\s+container:\s*(\S+))?/gm)]
  .map(m => [m[1], { args: m[2], container: m[3] ?? null }]))
for (const m of tbCode.matchAll(/\{"platform":"\w+","os":"([^"]+)","args":"([^"]+)"(?:,"container":"([^"]+)")?\}/g)) {
  const want = releaseTargets[m[1]]
  ok(want && want.args === m[2] && want.container === (m[3] ?? null),
     `test-build ${m[1]}: args "${m[2]}"${m[3] ? ` + container ${m[3]}` : ''} match release.yml`)
}
ok(/"platform":"linux","os":"ubuntu-latest","args":"--linux","container":"ubuntu:22\.04"/.test(tbCode),
   'test-build: Linux builds in the ubuntu:22.04 container')
ok(/matrix: \$\{\{ fromJSON\(needs\.plan\.outputs\.matrix\) \}\}/.test(tbCode), 'test-build: matrix comes from the plan job')
for (const [box, env, plat] of [['windows', 'WINDOWS', 'win'], ['linux', 'LINUX', 'linux'], ['macos', 'MACOS', 'mac']]) {
  ok(new RegExp(`^\\s+${box}:\\s*\\n(?:\\s+\\w+:.*\\n)*?\\s+type: boolean`, 'm').test(tbCode) &&
     tbCode.includes(`BUILD_${env}: \${{ inputs.${box} }}`) &&
     new RegExp(`if \\[ "\\$BUILD_${env}" = true \\]; then\\s+targets\\+=\\('\\{"platform":"${plat}"`).test(tbCode),
     `test-build: "${box}" checkbox gates the ${plat} build`)
}
for (const needle of ['container: ${{ matrix.container }}',
  'npm_config_build_from_source=true', 'CXXFLAGS=-UV8_DEPRECATION_WARNINGS', "if: matrix.os == 'macos-latest'"]) {
  ok(tbCode.includes(needle), `test-build mirrors release: ${needle}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
