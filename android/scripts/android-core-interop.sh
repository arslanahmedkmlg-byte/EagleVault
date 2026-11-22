#!/usr/bin/env bash
set -euo pipefail

scratch="$RUNNER_TEMP/core-interop"
mkdir -p "$scratch"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
    -addext subjectAltName=DNS:localhost -keyout "$scratch/key.pem" -out "$scratch/cert.pem" 2>/dev/null
npm ci --prefix web --ignore-scripts --no-audit --no-fund
npm install --prefix "$scratch" --no-audit --no-fund wrangler@4.166.0
WRANGLER_SEND_METRICS=false "$scratch/node_modules/.bin/wrangler" deploy --dry-run \
    --config backend/eaglevault-core/wrangler.toml --outdir "$scratch/worker"
node --experimental-strip-types android/scripts/core-interop-server.mjs \
    "$scratch/node_modules/miniflare/dist/src/index.js" "$scratch/worker/worker.js" "$scratch" &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
    if [[ -f "$scratch/ready" ]]; then break; fi
    kill -0 "$server"
    sleep 1
done
test -f "$scratch/ready"
adb reverse tcp:18443 tcp:18443
certificate=$(openssl x509 -in "$scratch/cert.pem" -outform DER | base64 -w0)
(
    cd android/upstream
    ./gradlew --no-daemon --max-workers=2 :pass:eaglevault:api:connectedDebugAndroidTest \
        -PeagleVaultBitwardenSdkDir="$RUNNER_TEMP/bitwarden-sdk" \
        -Pandroid.testInstrumentationRunnerArguments.coreTestCertificate="$certificate"
)
curl --fail --silent --show-error --cacert "$scratch/cert.pem" https://localhost:18443/verify-android-fixture
