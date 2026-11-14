# 1.6.2 · 重载后立即转交旧导图标签

- 发布日期：2026-11-14
- 最低 Obsidian 版本：1.8.7
- 插件 ID：`taube-markdown-tool`

## 修复

- 1.6.1 已能在启用 **融合 Mindmap（personal-mindmap）0.2.0+** 时隐藏本插件的第二个导图按钮和画布；1.6.2 进一步在加载时主动扫描工作区，把已经打开的 `markdown-tool-mindmap` 标签立即转交到 `personal-mindmap-markdown` 的同一文件。
- 目标视图尚未注册时最多等待 1 秒；仍不可用则退回 Markdown，不会留下空白标签。
- 本插件不再添加第二个“思维导图”入口；批注、正文拖动、Markdown 工具栏、设置和批注数据格式不变。
- 融合 Mindmap 未启用、或仍是 0.1.x 时，保留本插件原导图入口。

## 验证

- 98 项单元测试通过（新增 3 项插件版本门限与去重测试）。
- ESLint、TypeScript 检查、生产构建和 bundle 安全检查通过。

## 安装

- BRAT：仓库 `w3330442790-sys/taube-markdown-tool`，选择 Latest 检查更新。
- 手动安装：下载 `main.js`、`manifest.json`、`styles.css` 覆盖插件目录，保留自己的 `data.json`、`enhancements.json` 和 `side-note-data`。
