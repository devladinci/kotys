#!/usr/bin/env bash
# Creates a self-signed "Code Signing" certificate in the login keychain so
# local builds get a STABLE code-signing identity — required for macOS
# notifications (UNNotification API) to work in packaged Electron apps.
#
# Idempotent, no sudo. The resulting builds are NOT notarized (self-signed
# only), so they are for local use, not public distribution.
set -euo pipefail

CERT_NAME="${DEV_CERT_NAME:-Kotys Dev}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -p codesigning "$KEYCHAIN" 2>/dev/null | grep -qF "$CERT_NAME"; then
  echo "Code-signing identity already present: $CERT_NAME"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/openssl.cnf" <<EOF
[ req ]
default_bits       = 2048
default_keyfile    = key.pem
distinguished_name = req_distinguished_name
prompt             = no
[ req_distinguished_name ]
CN = $CERT_NAME
O  = Kotys
[ v3_req ]
keyUsage = critical, digitalSignature
extendedKeyUsage = codeSigning
EOF

openssl req -new -newkey rsa:2048 -x509 -days 3650 \
  -config "$TMP/openssl.cnf" -out "$TMP/cert.cer" -keyout "$TMP/key.pem" \
  -nodes 2>/dev/null

openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.cer" \
  -out "$TMP/cert.p12" -passout pass:tmp-import

security import "$TMP/cert.p12" -k "$KEYCHAIN" -P tmp-import -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -k "" "$KEYCHAIN" >/dev/null 2>&1 || true

echo "Created code-signing identity: $CERT_NAME"
echo "Note: macOS may prompt once to allow codesign to use the key."