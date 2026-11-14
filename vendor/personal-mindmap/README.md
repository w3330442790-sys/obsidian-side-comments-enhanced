# Fused mind-map source (vendored)

This directory is a source snapshot of
[w3330442790-sys/obsidian-personal-mindmap](https://github.com/w3330442790-sys/obsidian-personal-mindmap)
version 0.2.0 (`e82ec16`), itself a personal fusion of two MIT projects:

- [Azure12355/weilanx-mind-map](https://github.com/Azure12355/weilanx-mind-map) 0.2.0
- [JackWeiGogoga/gogoga-mindmap](https://github.com/JackWeiGogoga/gogoga-mindmap) 0.34.0

It is compiled into Taube Markdown Tool's single `main.js`; it is not a second
installable plugin. `UPSTREAM.md` records the pinned upstream commits, and the
applicable MIT/OFL texts are in `LICENSE`, `vendor/gogoga/LICENSE` and
`webview/LICENSE-OFL.txt`.

Integration changes made here (keep them in sync if this snapshot is refreshed):

- view types are namespaced to Taube (`markdown-tool-mindmap`,
  `taube-markdown-tool-wmind`, `taube-markdown-tool-xmind`);
- settings live in `mindmap-settings.json` in the host plugin directory, so they
  cannot overwrite the annotation plugin's `data.json`;
- `state.json` and the old personal-mindmap `data.json`/`state.json` are imported
  once on first load;
- the host plugin registers all views/commands/settings from one instance;
- duplicate Markdown colour menu labels are prefixed with “写入正文” to distinguish
  them from the annotation plugin's text-colour marks.

Only the Obsidian entry layer is vendored: `src/core`, `src/fusion`,
`src/obsidian`, `vendor/gogoga/src` and `webview/src`. The VS Code extension, CLI
and packaging scripts stay in the upstream repository and are not part of this
plugin.
