# 1.6.1 · 与融合 Mindmap 去重

- 发布日期：2026-11-14
- 最低 Obsidian 版本：1.8.7
- 插件 ID：`taube-markdown-tool`

## 修复

- 同时启用 **融合 Mindmap（personal-mindmap）0.2.0+** 时，本插件不再添加第二个“思维导图”按钮，也不再显示自己的导图画布；标签页右上角只保留融合 Mindmap 的入口。
- 工作区已有的旧 `markdown-tool-mindmap` 标签会自动转交到 `personal-mindmap-markdown` 的同一文件，不再停留在两张导图并列或按钮互相跳错的状态。
- 如果融合 Mindmap 未启用、或仍是 0.1.x，本插件保留原导图入口，不改变旧用户的使用方式。
- 批注、正文拖动、Markdown 工具栏、设置和批注数据格式不变；转交视图不读写笔记内容。

## 验证

- 98 项单元测试通过（新增 3 项插件版本门限与去重测试）。
- ESLint、TypeScript 检查、生产构建和 bundle 安全检查通过。

## 安装

- BRAT：仓库 `w3330442790-sys/taube-markdown-tool`，选择 Latest 检查更新。
- 手动安装：下载 `main.js`、`manifest.json`、`styles.css` 覆盖插件目录，保留自己的 `data.json`、`enhancements.json` 和 `side-note-data`。
