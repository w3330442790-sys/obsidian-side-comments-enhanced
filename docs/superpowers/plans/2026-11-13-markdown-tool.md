# Markdown Tool Implementation Plan

> Execute module tasks in this session with superpowers:subagent-driven-development; review the complete integration before release.

**Goal:** Rename the existing plugin and add single-file Markdown/diagram editing, editable relationships and summary subtrees while preserving annotations.

**Architecture:** A pure tree/session model performs edits, serialization, history and snapshot-safe persistence. A lazily constructed native DOM/SVG view edits that model; the original annotation plugin supplies comments. Vendor only the MIT Markdown parser/model/format-preserving merge from personal-mindmap, retaining its license. Extend the existing selection tools separately.

**Tech Stack:** TypeScript, Obsidian, native DOM/SVG, CodeMirror, esbuild, Node test runner, Playwright.

## Tasks

- [x] 1. Write failing model tests for mixed Markdown preservation, repeated labels, operations, relationships, summary subtrees, history and conflict-safe persistence. Implement `src/mindmap/model.ts`, `src/mindmap/session.ts`, vendored parser files; expose explicit types and validated operations. Run `node --test tests/mindmap.test.cjs`.
- [x] 2. Extend original marking paths in `src/main.ts`, `commentManager.ts`, `enhancements.ts`, `wordExporter.ts`, `styles.css`. Test true foreground red, retained selection, context-toolbar entry, clear and old mark compatibility. Keep new view integration outside this task.
- [x] 3. Add `src/mindmap/view.ts` and scoped styles. Provide SVG connectors with editable labels, multi-select summaries with editable child trees, outline editor for all structures, search/centering, collapse, undo/redo, save/retry/recovery and comment inspection. Register one-click actions for every Markdown leaf without rewriting notes just to switch.
- [x] 4. Extend isolated Playwright harness for diagram integration, edits roundtrip/reopen, keyboard, touchscreen widths, external changes, retry and original annotations. Execute old and new suites. Inspect screenshots.
- [x] 5. Review spec compliance and code quality, correct issues, update documentation and upstream notices. Update package/lock/manifest/versions together to 1.2.0 with display name Markdown Tool. Run `npm test`, `npm run lint`, `npm run build`, `npm run test:ui`.
- [ ] 6. Commit feature changes, push and integrate original repository branch; publish tag 1.2.0 as non-prerelease with the three BRAT assets. Verify remote CI and downloaded asset version/hash without including private notes or local test artifacts.

## Validation boundaries

No runtime Node dependency, no additional companion files during routine editing, no silent overwrite after external modification, and no disappearance of summary children in outline mode. Save status must reflect confirmed writes. Existing plugin ID stays `side-comments-origin`; `isDesktopOnly` stays false. Platform touch behavior is covered by isolated browser tests; real mobile-device testing must be reported accurately.
