#!/usr/bin/env bash
# Creates the self-signed certificate that signs Lichborne's macOS builds.
#
# WHY: Squirrel.Mac installs an update only if it satisfies the running app's
# own signature requirement. An ad-hoc signature's requirement is tied to one
# build, so no update can ever match it. A certificate that stays the same from
# build to build can. See DESIGN §41.8.
#
# RUN IT ONCE, EVER. Updates are tied to this certificate: replacing or losing it
# means every Mac player has to reinstall by hand. Keep the output folder backed
# up somewhere OUTSIDE the repo.
#
#   bash tools/make-mac-cert.sh <new-folder-outside-the-repo>
#
# Also used by the mac-sign-check workflow, which makes a throwaway copy to test
# the signing steps without touching the real one.
set -euo pipefail

OUT="${1:?usage: make-mac-cert.sh <new-folder-outside-the-repo>}"
if [ -e "$OUT/signing.p12" ]; then
  echo "Refusing to overwrite $OUT/signing.p12. Replacing this certificate strands every Mac player." >&2
  exit 1
fi
mkdir -p "$OUT"
chmod 700 "$OUT" 2>/dev/null || true

# Codesigning needs the codeSigning usage. The long life matters: without a
# trusted timestamp, an expired certificate can fail the update check.
cat > "$OUT/cert.cnf" <<'CONF'
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = Lichborne Code Signing
[v3]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
CONF

PASSWORD="$(openssl rand -hex 24)"
openssl req -x509 -newkey rsa:2048 -sha256 -days 10950 -nodes \
  -keyout "$OUT/key.pem" -out "$OUT/cert.pem" -config "$OUT/cert.cnf" 2>/dev/null

# macOS's `security import` can't read OpenSSL 3's default PKCS#12 encryption,
# so these older algorithms are required.
openssl pkcs12 -export -inkey "$OUT/key.pem" -in "$OUT/cert.pem" \
  -name "Lichborne Code Signing" -out "$OUT/signing.p12" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
  -passout "pass:$PASSWORD"

base64 < "$OUT/signing.p12" | tr -d '\r\n' > "$OUT/signing.p12.b64"
printf '%s' "$PASSWORD" > "$OUT/password.txt"
rm -f "$OUT/key.pem" "$OUT/cert.cnf"

echo "Created in $OUT:"
openssl x509 -in "$OUT/cert.pem" -noout -subject -enddate -fingerprint -sha256
cat <<NEXT

Next, from this repo's folder:
  gh secret set MAC_SIGN_P12 --repo elanthia-online/Lichborne < "$OUT/signing.p12.b64"
  gh secret set MAC_SIGN_PASSWORD --repo elanthia-online/Lichborne < "$OUT/password.txt"

Then back up $OUT somewhere safe, outside the repo.
NEXT
