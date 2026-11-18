# Imported upstream source snapshots

Imported on 2026-11-19 from the local upstream clones using git archive. The imported trees contain source snapshots, not nested Git repositories. Their original LICENSE files and source headers are retained.

| Component | EagleVault path | Upstream commit |
|---|---|---|
| Proton Pass Android | android/upstream | 60cf8cb0ae7d2f26ff0f313ce3d726e3280e97b6 |
| Proton Pass Web application and shared workspace packages | web/upstream | 1e79445cefe5d7e0b4b7028677d4e6435f60f7ac |
| Vaultwarden | backend/vaultwarden | 4051a4d3a64d8d9f6e019c8c1646fbed54384d15 |
| Proton Pass common Rust | shared/proton-pass-common | 806b7b9dbf9e58bbcb36009b60ff31fce2c8155d |

Web import intentionally includes the Pass web application, all shared packages, workspace/build configuration and patches. It excludes unrelated Proton web applications and the separate Pass browser-extension/desktop applications.

These are unmodified upstream snapshots at import time. EagleVault changes should be made in the imported tree only after source boundaries and integration seams are understood. Keep the upstream commit IDs above for attribution and reproducibility.
