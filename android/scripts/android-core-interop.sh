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

shopt -s nullglob
apks=(android/upstream/app/build/outputs/apk/devProd/debug/*.apk)
test "${#apks[@]}" -eq 1
package=$("$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging "${apks[0]}" |
    sed -n "s/^package: name='\([^']*\)'.*/\1/p")
test -n "$package"
adb install "${apks[0]}"
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
    -n "$package/proton.android.pass.ui.CoreVaultActivity"
for attempt in {1..10}; do
    adb shell uiautomator dump /sdcard/eaglevault-screen.xml >/dev/null
    if adb shell cat /sdcard/eaglevault-screen.xml | grep -q 'Master password'; then exit 0; fi
    sleep 1
done
echo "EagleVault unlock screen did not appear." >&2
exit 1
