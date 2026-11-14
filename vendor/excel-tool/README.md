# excel tool source (vendored)

This directory is a source snapshot of
[w3330442790-sys/excel-tool](https://github.com/w3330442790-sys/excel-tool)
version 2.2.0 (`8805e59`), a personal Android/desktop table toolkit based on
[niixyz64-star/table-tune](https://github.com/niixyz64-star/table-tune) 2.0.1.

It is compiled into Taube Markdown Tool's single `main.js`; it is not a second
installable plugin. The upstream MIT license is retained in `LICENSE`, with the
original project notes in `UPSTREAM_README.md` and acceptance records in
`ACCEPTANCE.md`.

Integration changes made here (keep them in sync if this snapshot is refreshed):

- the standalone `table-tune/data.json` migration was removed from `onload`;
  the host migrates `excel-tool/data.json` or `table-tune/data.json` once into
  `excel-settings.json`, keeping annotation `data.json` untouched;
- the class is instantiated as a child component of Taube Markdown Tool with the
  host manifest, so commands join the `taube-markdown-tool:` namespace and are
  disposed with the host;
- the host skips loading it while a standalone `excel-tool` or `table-tune`
  plugin is still enabled, to avoid duplicate table handlers and toolbars;
- `styles.css` is appended to the generated plugin stylesheet.

Only the runtime CJS modules and styles are vendored. The original build script
(`scripts/build.cjs`), browser fixtures and tests stay in the upstream repository
and are adapted into Taube Markdown Tool's test suite where useful.
