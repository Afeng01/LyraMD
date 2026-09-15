# LyraMD P0 Safety Pack

## Intent

Ship the minimum safety layer needed to turn the current image/crash/data-loss incident into a recoverable workflow.

## Scope

- Local markdown revision backups in app data.
- Crash recovery snapshot after renderer crashes.
- Image insertion checkpoints before asset writes.
- Rename-path hardening on the current 1.x codepath.

## Non-scope

- Full revision browser UI.
- Cloud sync.
- Per-keystroke Git commits.

## Verification

- Regression tests for revision store and crash recovery.
- Existing editor/image/title-sync tests still pass.
- Manual smoke: paste image, autosave, rename, recover after forced renderer crash.
