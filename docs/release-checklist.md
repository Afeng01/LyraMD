# LyraMD Release Checklist

Use this checklist before publishing a LyraMD release tag.

## Required Gates

1. Confirm product naming.
   - User-facing release notes, README rows, artifact names, and screenshots must say `LyraMD`.
   - `ColaMD` may appear only in upstream attribution, historical session titles, legacy paths, or compatibility ids such as the existing MCP server id.

2. Inspect worktree boundaries after merging.
   - Run `git status --short --branch`.
   - Run `git log --oneline --decorate -12`.
   - Run `git diff --stat` and inspect any non-empty diff before continuing.
   - Do not publish directly after merging a worktree until the merged checkout has been rebuilt and opened.

3. Run automated verification.
   - `npm ls @milkdown/core @milkdown/kit --depth=2`
   - `npm run test`
   - `npm run build`

4. Run a cold-start app smoke check.
   - Stop any existing dev/build app processes.
   - Run `ELECTRON_ENABLE_LOGGING=1 npm run dev`.
   - Confirm the renderer does not log `LyraMD init failed`.
   - Confirm the editor is usable: type text, open settings, toggle sidebar, open AI 精灵, and open outline.

5. Build distributables.
   - macOS stable path: `npm run dist:mac`
   - Windows release path: `npm run dist:win`
   - Optional preview: `npm run dist:linux`

6. Inspect artifacts.
   - Confirm `release/` artifact names match the package version.
   - Confirm the GitHub Release workflow uploads both macOS artifacts and
     `LyraMD-Setup-<version>-x64.exe`.
   - Confirm update metadata is present: `latest-mac.yml` for macOS and
     `latest.yml` for Windows.
   - Install/open the macOS artifact before publishing when possible.

7. Publish.
   - Create a release commit for version/docs/checklist changes.
   - Create an annotated tag, for example `git tag -a v1.3.6 -m "LyraMD v1.3.6"`.
   - Push commit and tag to `origin`.
   - When using `gh`, pass `--repo Afeng01/LyraMD`; this checkout also has an
     upstream remote, and `gh` may otherwise inspect the wrong repository.

## Why this gate exists

On 2026-05-31, the 1.3.0 build opened as an unusable shell because a merged
worktree was released without a fresh cold-start smoke check. The root cause was
a Milkdown context mismatch between direct `@milkdown/core` imports and
`@milkdown/kit/core`. The release process must catch this class of failure
before a tag is published.

Also on 2026-05-31, `v1.3.5` was published with macOS artifacts only because the
tag release job depended only on the macOS build. Windows must be part of the
tag-triggered release workflow, even while the Windows app remains a preview
until real-device smoke testing is complete.

Auto-update support depends on the release metadata files uploaded with the
GitHub Release. Do not remove `latest-mac.yml` or `latest.yml` from release
assets.
