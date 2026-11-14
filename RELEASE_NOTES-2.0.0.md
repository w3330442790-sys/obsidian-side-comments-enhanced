# 2.0.0 · 批注与完整思维导图合并为一个插件

- 发布日期：2026-11-14
- 最低 Obsidian 版本：1.8.7
- 插件 ID：`taube-markdown-tool`
- 仓库：[w3330442790-sys/taube-markdown-tool](https://github.com/w3330442790-sys/taube-markdown-tool)

## 一个插件，两部分能力

2.0.0 把原先独立的 **融合 Mindmap（`personal-mindmap` 0.2.0）** 完整并入本插件。批注、正文拖动、Markdown 工具栏与完整思维导图画布不再需要安装和启用两个插件。

- **完整主画布**：Weilanx／gogoga 画布、主题与样式面板、对齐、外框、概括、联系线、手绘、背诵模式、备注卡片、富内容、PNG/SVG 导出、双链与嵌入。
- **Markdown 一键切换**：任意 Markdown 标签右上角“思维导图”按钮；不写 frontmatter、不建镜像文件。编辑后可从右上角切回 Markdown 或分屏。
- **`.wmind` 与 `.xmind`**：新建／打开完整格式脑图；`.xmind` 只读查看、切换工作表并转换为 Markdown 或 `.wmind`。
- **设置分开**：批注设置继续在 `data.json`；脑图设置写入 `mindmap-settings.json`；文件锁定／备注状态写入 `state.json`。两边不会互相覆盖。
- **旧数据迁移**：首次加载读取 `personal-mindmap/data.json` 与 `state.json`，迁移脑图设置和文件状态。旧 `markdown-tool-mindmap`、`personal-mindmap-markdown`、`personal-mindmap-wmind`、`personal-mindmap-xmind` 标签自动转到新视图。

## 升级步骤

1. 在“设置 → 第三方插件”中停用独立的 **融合 Mindmap（`personal-mindmap`）**。**不要删除它的目录**，本插件首次加载需要读取其中的设置与状态。
2. 通过 BRAT 检查 `w3330442790-sys/taube-markdown-tool` 的更新，或下载本 Release 的 `main.js`、`manifest.json`、`styles.css` 覆盖 `.obsidian/plugins/taube-markdown-tool/`。
3. 重载 **Taube Markdown Tool**。若仍提示 `personal-mindmap` 已启用，请确认已停用后再次重载。
4. 保留旧的 `personal-markdown-tool`、`side-comments-origin` 目录为停用状态，避免同时写入批注数据。

## 兼容边界

- 1.2.0–1.6.2 轻量画布的 `<!-- markdown-tool:v1 … -->` 扩展注释会原样保留，但不会自动转换成新画布的 `wmind-fusion:v1` 格式；旧注释中的关联线、总括子树不会在新画布中重现。升级前请保留旧版插件文件备份。
- 完整画布不会额外绘制批注角标；批注仍可在 Markdown 正文、批注侧栏和 Word 导出中查看，两套数据互不覆盖。
- PDF++ 区域裁图、部分媒体导出依赖对应插件和真实文件，隔离测试不能完全替代实机验收。
- 安卓／iPad 实机与真实笔记库仍建议升级前备份后验证。

## 验证

- 189 项单元测试通过：原批注 61 项、原融合 Mindmap 126 项、合并插件启动与迁移 2 项。
- 57 项隔离浏览器检查通过：批注侧栏 19、选区工具栏 1、拖动 8、Markdown 工具栏 6、完整画布 23。
- ESLint、TypeScript 构建、bundle 安全检查（无动态脚本、`eval()`、`new Function()`）通过。
- 发布资产：`main.js`、`manifest.json`、`styles.css`；BRAT 可直接更新。
