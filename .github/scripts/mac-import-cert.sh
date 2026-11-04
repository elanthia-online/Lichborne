#!/usr/bin/env bash
# Puts the macOS signing certificate into a temporary keychain on a CI runner and
# hands its identity to build/afterPack.cjs through MAC_SIGN_IDENTITY.
#
# Input: MAC_SIGN_P12 (base64) and MAC_SIGN_PASSWORD. A missing one fails the job
# here, in plain words, rather than shipping a build that can't update.
set -euo pipefail

if [ -z "${MAC_SIGN_P12:-}" ] || [ -z "${MAC_SIGN_PASSWORD:-}" ]; then
  echo "::error::MAC_SIGN_P12 and MAC_SIGN_PASSWORD must be set. See tools/make-mac-cert.sh."
  exit 1
fi

KEYCHAIN="$RUNNER_TEMP/lichborne-sign.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
P12="$RUNNER_TEMP/signing.p12"
trap 'rm -f "$P12"' EXIT

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"

printf '%s' "$MAC_SIGN_P12" | base64 --decode > "$P12"
security import "$P12" -k "$KEYCHAIN" -P "$MAC_SIGN_PASSWORD" -f pkcs12 -T /usr/bin/codesign
# Without this, codesign stops to ask for permission and the job hangs or fails.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" > /dev/null

# Keep the runner's own keychains searchable alongside this one.
# shellcheck disable=SC2046
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

# By hash, because the name lookup can skip a certificate macOS doesn't trust,
# and a self-signed one never is. Without -v the listing includes it.
IDENTITY="$(security find-identity -p codesigning "$KEYCHAIN" | awk '/^ *1\) /{print $2; exit}')"
if [ -z "$IDENTITY" ]; then
  echo "::error::No signing identity found after importing the certificate."
  security find-identity -p codesigning "$KEYCHAIN"
  exit 1
fi
echo "MAC_SIGN_IDENTITY=$IDENTITY" >> "$GITHUB_ENV"
echo "Signing identity ready: $IDENTITY"
