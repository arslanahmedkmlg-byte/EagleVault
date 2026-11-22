#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 3 ]]; then
    echo "Usage: $0 SDK_CHECKOUT ARCHIVE_DIRECTORY OUTPUT_DIRECTORY" >&2
    exit 2
fi

sdk=$(realpath "$1")
archives=$(realpath -m "$2")
output=$(realpath -m "$3")
revision=6238472451e4fa7b5c592b4b24a84e950a258957
if [[ $(git -C "$sdk" rev-parse HEAD) != "$revision" ]]; then
    echo "Bitwarden SDK checkout must be at $revision." >&2
    exit 1
fi

mkdir -p "$archives"
while read -r target abi artifact checksum; do
    zip="$archives/android-$target.zip"
    if [[ ! -f "$zip" ]]; then
        curl --fail --silent --show-error --location --retry 3 --max-time 180 \
            "https://api.github.com/repos/bitwarden/sdk-internal/actions/artifacts/$artifact/zip" \
            --output "$zip.part"
        mv "$zip.part" "$zip"
    fi
    printf '%s  %s\n' "$checksum" "$zip" | sha256sum --check
    mkdir -p "$output/jniLibs/$abi"
    unzip -p "$zip" libbitwarden_uniffi.so > "$output/jniLibs/$abi/libbitwarden_uniffi.so"
done <<'ARTIFACTS'
aarch64-linux-android arm64-v8a 14027795536 761990465492b5c9beefd6910681d95c2ea012a7a05ca89c73d872dcf6d4f1fb
armv7-linux-androideabi armeabi-v7a 14026494011 a20eeb8136578b5089c2e7026a1f0bc69e72ddb4247dc1655b6c3921656be215
i686-linux-android x86 14027057244 1d8760a5cbb6883f4be995b9e7309bf3bf2846df2163ff9258ba445d79f80379
x86_64-linux-android x86_64 14027795520 eee66921bf4df699d800d2eec681d6ff3dd1b002762bb0a979910a58edf29fee
ARTIFACTS

mkdir -p "$output/kotlin"
cd "$sdk/crates/bitwarden-uniffi/kotlin"
cargo run --locked -p uniffi-bindgen -- generate \
    "$output/jniLibs/arm64-v8a/libbitwarden_uniffi.so" \
    --language kotlin --no-format --out-dir "$output/kotlin"
test -s "$output/kotlin/com/bitwarden/sdk/bitwarden_uniffi.kt" ||
    find "$output/kotlin/com/bitwarden/sdk" -name '*.kt' -print -quit | grep -q .
