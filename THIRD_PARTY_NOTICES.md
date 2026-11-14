# Third-party notices

Taube Markdown Tool is distributed under **GPL-3.0-only** (see [LICENSE](LICENSE)).
It contains or bundles the following third-party work:

## Fused mind-map editor

The files under `vendor/personal-mindmap/` are a source snapshot of the personal
`obsidian-personal-mindmap` project, which fuses two MIT-licensed projects. The
full texts are retained in place:

- Weilanx Mind Map 0.2.0 — Copyright (c) 2026 Azure12355 — MIT:
  [`vendor/personal-mindmap/LICENSE`](vendor/personal-mindmap/LICENSE)
- gogoga Mind Map 0.34.0 — Copyright JackWei — MIT:
  [`vendor/personal-mindmap/vendor/gogoga/LICENSE`](vendor/personal-mindmap/vendor/gogoga/LICENSE)
- Bundled handwriting fonts — SIL Open Font License 1.1:
  [`vendor/personal-mindmap/webview/LICENSE-OFL.txt`](vendor/personal-mindmap/webview/LICENSE-OFL.txt)

Pinned upstream commits and adaptation notes are in
[`vendor/personal-mindmap/UPSTREAM.md`](vendor/personal-mindmap/UPSTREAM.md) and
[`vendor/personal-mindmap/README.md`](vendor/personal-mindmap/README.md).

## Bundled npm dependencies

`main.js` bundles runtime dependencies declared in `package.json` (for example
React, React DOM, Rough.js, docx, CodeMirror state/view and lucide). Their
license texts are included in the generated `main.js` banner by
`esbuild.config.mjs`, which reads each non-development package's license file
from `node_modules` at build time. The authoritative versions are in
`package-lock.json`.

## Original annotation plugin

Taube Markdown Tool is based on Side-Comments-origin by peyote
(GPL-3.0-only); the original attribution and upstream notes are retained in
[`README.upstream.md`](README.upstream.md) and [LICENSE](LICENSE).
