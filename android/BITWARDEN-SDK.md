# Bitwarden SDK for Android debug builds

Android CI generates Kotlin bindings from Bitwarden SDK commit
`6238472451e4fa7b5c592b4b24a84e950a258957`. The preparation script verifies the
four native archives from [Bitwarden's Android build](https://github.com/bitwarden/sdk-internal/actions/runs/43405701364)
against their published SHA-256 digests. It runs the pinned UniFFI generator
against the ARM64 library. Gradle packages the generated SDK and the three
native ABIs supported by the current EagleVault app configuration.

The script accepts a checkout at the pinned commit, a directory containing
the original ZIP files, and an output directory. It downloads any missing
archive from the pinned run. Keep the original ZIPs available locally because
GitHub Actions artifacts can expire.

```sh
bash android/scripts/prepare-bitwarden-sdk.sh SDK_CHECKOUT ZIP_DIRECTORY OUTPUT_DIRECTORY
```

CI passes the absolute output directory as `-PeagleVaultBitwardenSdkDir`.
Its artifact is Gradle's debug APK for sideloading. Packaging the SDK is the
build prerequisite for integrating EagleVault account unlock and vault sync.
