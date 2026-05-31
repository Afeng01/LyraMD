# LyraMD 1.3.0 startup fix checkpoint

Date: 2026-05-31

## Symptom

Opening the 1.3.0 app showed the editor shell, placeholder text, top buttons,
and document stats, but the app was not usable. The editor did not finish
initializing.

The reproduced renderer console error was:

```text
LyraMD init failed: MilkdownError: Context "nodes" not found, do you forget to inject it?
```

## Root cause

`src/renderer/editor/editor.ts` mixed Milkdown context imports from two paths:

- `@milkdown/kit/core`
- `@milkdown/core`

At the same time, local dependency state had a mismatched direct
`@milkdown/core` install: the root project expected `7.19.2`, while
`node_modules/@milkdown/core` was `7.21.1`. This created incompatible Milkdown
context identities, so plugins could not see the expected `nodes` context and
editor creation aborted.

## Fix

Commit: `435e4692 Fix Milkdown core context mismatch`

Changes:

- Removed the root direct `@milkdown/core` dependency from `package.json` and
  `package-lock.json`.
- Imported `editorViewOptionsCtx` and `prosePluginsCtx` from
  `@milkdown/kit/core`, matching the rest of the editor context imports.
- Strengthened `src/renderer/editor/milkdown-dependency-regression.test.ts` so
  it fails if renderer editor code imports directly from `@milkdown/core` again.

## Verification

Commands run:

```sh
npm run test -- src/renderer/editor/milkdown-dependency-regression.test.ts
npm ls @milkdown/core @milkdown/kit --depth=2
npm run test
npm run build
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

Results:

- Regression test passed.
- `npm ls` showed a single effective Milkdown core line through
  `@milkdown/kit@7.19.2` and `@milkdown/core@7.19.2`.
- Full test suite passed: 47 files, 366 tests.
- Production build completed.
- Fresh dev startup no longer printed `LyraMD init failed`.

## Notes for future release work

The replacement release should use `v1.3.5`, because local `v1.3.1` through
`v1.3.4` tags already exist outside the current `main` line. Follow
`docs/release-checklist.md` before publishing the tag.
