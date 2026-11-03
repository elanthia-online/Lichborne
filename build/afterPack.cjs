// electron-builder afterPack hook — macOS AD-HOC CODE SIGNING.
//
// WHY THIS EXISTS (ohbeanz, our first Mac tester, v0.18.0): the downloaded app
// refused to launch with
//
//     "Lichborne" is damaged and can't be opened. You should move it to the Trash.
//
// That is NOT the "unidentified developer" prompt every doc here promised, and
// it has NO "Open Anyway" button — it is what macOS says about a MISSING or
// BROKEN signature. Apple Silicon requires every executable to carry one; the
// kernel refuses an unsigned arm64 binary outright. Because we ship without an
// Apple Developer certificate (deliberate free-project decision, DESIGN §41),
// CI sets CSC_IDENTITY_AUTO_DISCOVERY=false and electron-builder skips signing
// altogether — which is exactly the state that produces this message.
//
// An AD-HOC signature ("-") is the most a project without a certificate can do,
// and it is what the kernel wants: it makes the binary loadable. It does NOT
// notarize anything, so a DOWNLOADED copy still carries com.apple.quarantine
// and Gatekeeper will still challenge it — the point is only that the challenge
// should now be the recoverable "cannot be verified → Open Anyway" one rather
// than the dead-end "damaged" one.
//
// UNVERIFIED: nobody here has a Mac, and CI can build but cannot exercise
// Gatekeeper's dialog, so whether this alone gets a downloaded build to the
// "Open Anyway" path is not proven — it needs a tester to confirm. What IS
// certain is that an unsigned arm64 app cannot run at all, so this is strictly
// necessary either way. See BUGS.md B238.
//
// WHEN A REAL CERTIFICATE LANDS: delete this hook. A Developer ID signature +
// notarization replaces it, and re-signing ad-hoc over a real signature would
// destroy it.

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// B590: the oldest Linux the docs promise is Ubuntu 22.04, and a native module
// needs at least the glibc/libstdc++ of the system that compiled it. Built on
// 24.04 the AppImage's better-sqlite3 wanted GLIBC_2.38, so on 22.04, Debian 12
// and Mint 21 it failed to load and the Lich Dashboard read empty. CI only: a
// local build on a newer distro is fine for that machine. It runs here because
// afterPack is the last step BEFORE an artifact exists to upload.
const LINUX_LIMITS = { GLIBC: [2, 35], GLIBCXX: [3, 4, 30] }
function newer(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}
function findNative(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) findNative(p, out)
    else if (e.name.endsWith('.node')) out.push(p)
  }
  return out
}
function checkLinuxLibraries(appOutDir) {
  const files = findNative(path.join(appOutDir, 'resources', 'app.asar.unpacked'))
  // Finding nothing means this looked in the wrong place, not that all is well.
  if (files.length === 0) throw new Error('afterPack: no native module found to check under app.asar.unpacked')
  for (const f of files) {
    const syms = execFileSync('objdump', ['-T', f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    for (const m of syms.matchAll(/\b(GLIBCXX|GLIBC)_(\d+(?:\.\d+)*)/g)) {
      const v = m[2].split('.').map(Number)
      if (newer(v, LINUX_LIMITS[m[1]])) {
        throw new Error(`afterPack: ${path.basename(f)} needs ${m[1]}_${m[2]}, newer than ${m[1]}_${LINUX_LIMITS[m[1]].join('.')} on Ubuntu 22.04`)
      }
    }
    console.log(`  • ${path.basename(f)} loads on Ubuntu 22.04`)
  }
}

exports.default = async function afterPack(context) {
  // Log on EVERY platform, not just darwin. electron-builder calls afterPack for
  // Windows and Linux too, so this line is the proof that the hook RESOLVED and
  // ran at all — which is the failure mode that matters here: if the path in
  // package.json ever breaks, the Mac build goes quietly back to shipping an
  // unsigned app with no error anywhere. Absence of this line in a build log
  // means the hook did not run.
  console.log(`  • afterPack hook: platform=${context.electronPlatformName}`)
  if (context.electronPlatformName === 'linux' && process.env.CI) checkLinuxLibraries(context.appOutDir)
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  )

  // --force so this is idempotent: if electron-builder (or a future real
  // identity) already signed, we simply replace/refresh rather than fail.
  // --deep is discouraged by Apple for DISTRIBUTION signing, but it is the
  // pragmatic choice for ad-hoc: it covers the Electron Framework and the
  // helper apps, none of which we notarize.
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
      stdio: 'inherit',
    })
    console.log(`  • ad-hoc signed (no certificate)  ${appPath}`)
  } catch (err) {
    // FAIL THE BUILD. A silently-unsigned arm64 artifact is worse than no
    // artifact: it uploads cleanly, passes the release verify job's filename
    // check, and only fails in a tester's hands with a message that tells them
    // to throw it away.
    console.error('  ✗ ad-hoc codesign FAILED — refusing to ship an unsigned arm64 app')
    throw err
  }
}
