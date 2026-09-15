# 2026-05-15 LyraMD / TMark Merge Intake

## Explicit User Signals

- Cherry currently uses both LyraMD and TMark, but many TMark features are not used.
- The TMark terminal is almost never used today.
- The TMark bottom quick new tab affordance and horizontally switchable open tabs are liked.
- The common real workflow is: an external Agent creates or edits a Markdown file, then Cherry opens it in the editor to preview, review, and continue triage.
- The actively used LyraMD/TMark navigation surfaces are workspaces, pinned items, drafts, recent files, and work directory.
- When an external Agent creates a file, Cherry often opens the app and checks Recent.
- Cherry wants an archive action so archived items disappear from Recent and Drafts without deleting the real file. Workdir remains filesystem-backed and should only change through delete.
- Archived items should be accessible through a shortcut-invoked archive view.
- Cherry likes the LyraMD Elegant theme/color direction and wants to preserve that feeling.
- TMark writing micro-features worth carrying forward include punctuation completion, punctuation conversion, word/character counts, and small status hints such as update checks or history.
- The terminal may remain as an optional future surface, but it should not dominate the current workflow.
- For actual typing today, Cherry prefers TMark because its feature set is fuller and its interface feels more elegant and inviting.
- Cherry sees LyraMD 1.2x as weaker on UI, especially the left sidebar, and agrees that optimization should start from the 2.x/TMark direction.
- Cherry clarified that 2.x already has the broad workspace/workbench semantics, so the merge should optimize and reconcile rather than copy LyraMD 1.x behavior wholesale.
- Theme migration should be additive: keep existing 2.x themes, add or merge 1.x/LyraMD themes such as Elegant, dedupe overlaps, and expose them together as theme options.
- User data migration is not urgent and must be opt-in or previewable, because automatic import could pollute the current 2.x local state.
- The 2.x UI, settings, shortcuts, and options should remain Chinese-friendly; current 2.x already appears to have Chinese UI support.

## Working Interpretation

The merged product should treat TMark/VMark-derived 2.x as the codebase and interaction foundation, while migrating LyraMD's product semantics, Elegant visual preferences, and external-Agent review workflow into it. The next design pass should prioritize external-Agent file intake, preview, active-list cleanup, archive retrieval, and fast document switching over in-app terminal-first workflows.

## Confirmed Archive Rule

- Archive should also remove or hide the item from pinned entries.
- Archive means the document leaves the active work surfaces: Recent, Drafts, and Pinned.
- Workdir remains filesystem-backed and should still show the file unless the real file is deleted.

## Naming Candidate

- Cherry proposed `ZenMD` as a possible new name.
- Initial public-search check found existing `ZenMD` usage in medical AI / telehealth and a Markdown-to-site tool, so the name has good feel but non-trivial availability and positioning risk.
- Cherry then preferred `ZenMark`.
- Initial public-search check found an existing open-source `Zenmark` WYSIWYG Markdown editor based on Tiptap, plus `zenmarked` and other nearby Markdown/editor uses. `ZenMark` is more semantically aligned than `ZenMD`, but has stronger same-category collision risk. Treat as a working codename unless Cherry accepts the public naming risk or later chooses a more distinctive variant.
- Cherry then proposed `ZenoMD`.
- Initial public-search check did not find a strong exact `ZenoMD` Markdown editor collision, but did find adjacent `Zeno` uses in AI evaluation and Markdown/blog tooling, plus many `Zeno MD` medical-name/device results. `ZenoMD` is more distinctive than `ZenMD`, but the `MD` suffix still carries medical ambiguity.
- Cherry settled on `ZMark` as the current working name and explicitly deprioritized further naming debate. Naming should not block functional iteration.
