# 2.1.0 · 批注、完整思维导图与表格工具合并为一个插件

- 发布日期：2026-11-14
- 最低 Obsidian 版本：1.8.7
- 插件 ID：`taube-markdown-tool`
- 仓库：[w3330442790-sys/taube-markdown-tool](https://github.com/w3330442790-sys/taube-markdown-tool)

## 本次新增

2.1.0 把原先独立的 **表格工具（`excel-tool` 2.2.0）** 完整并入本插件。现在批注、正文拖动、Markdown 工具栏、完整思维导图画布和安卓友好表格工具只需安装一个插件。

- **表格工具**：电脑鼠标点击单元格，平板轻点单元格边缘或表格旁小图标，打开悬浮图标栏。
- **选择与编辑**：矩形选择、整行／整列、多行／多列点选；合并／拆分、六向对齐、插入／删除行列、清空内容。
- **布局**：拖动列宽／行高；适应屏幕、按内容调整、平均列宽、自动换行、重置布局；固定表头和首列。
- **样式**：五种浅色底色、默认底色、重点标记、清除样式，深色主题自动适配。
- **复制／导出**：复制到 Excel（HTML/TSV）、复制纯文本、导出 HTML 到笔记库 `表格导出/`。
- **工具栏自定义**：选择显示哪些图标，立即保存并保留未知字段。

## 设置与迁移

- 批注设置仍在 `data.json`；脑图在 `mindmap-settings.json`；表格工具在 `excel-settings.json`；文件状态在 `state.json`。四类数据互不覆盖。
- 首次加载优先读取 `excel-tool/data.json`，若不存在再读取 `table-tune/data.json`，迁移列宽、行高、合并、对齐、底色、重点标记、固定和工具栏自定义；旧文件原样保留，批注 `data.json` 不会被写入表格数据。
- 表格工具以子组件加入 Taube：命令使用 `taube-markdown-tool:` 前缀，全局事件监听、编辑器扩展和 `commands.executeCommand` 补丁随插件卸载。

## 升级步骤

1. 在“设置 → 第三方插件”中停用独立的 **excel tool（`excel-tool`）**；如果安装过原版 TableTune，也停用 **TableTune（`table-tune`）**。**不要删除目录**，首次加载需要读取其中的表格设置。
2. 保留已停用的 **融合 Mindmap（`personal-mindmap`）** 目录（如仍在），Taube 2.0 的脑图迁移逻辑不变。
3. 通过 BRAT 检查 `w3330442790-sys/taube-markdown-tool` 的更新，或下载本 Release 的 `main.js`、`manifest.json`、`styles.css` 覆盖 `.obsidian/plugins/taube-markdown-tool/`。
4. 重载 **Taube Markdown Tool**。若仍提示旧表格插件已启用，请确认停用后再次重载。

## 兼容边界

- 表格内容始终保存在 Markdown 正文；列宽、合并、样式等布局是插件数据，关闭插件后正文仍在，但合并／底色不保证在其他 Markdown 应用中一致显示。
- Excel 是否接受 HTML 剪贴板取决于系统与目标应用；复制失败会提示改用纯文本或 HTML 文件，不会假报成功。
- 旧表格插件的命令 ID 是 `excel-tool:`，合并后命令 ID 变为 `taube-markdown-tool:`；旧快捷键不会自动迁移，可在 Obsidian 快捷键设置中重新绑定。
- 1.2.0–1.6.2 轻量画布的 `<!-- markdown-tool:v1 … -->` 注释仍保留但不转换；完整画布不额外绘制批注角标。
- 安卓真机、真实 Obsidian 表格编辑器和系统 Excel 粘贴仍需实际环境验收；隔离浏览器结果不等于实机已通过。

## 验证

- 209 项单元测试通过：原批注 61 项、原融合 Mindmap 126 项、表格工具 18 项、合并插件启动／迁移 4 项。
- 93 项隔离浏览器检查通过：批注侧栏 19、选区工具栏 1、拖动 8、Markdown 工具栏 6、完整画布 23、表格工具 36。
- ESLint、TypeScript 构建、bundle 安全检查（无动态脚本、`eval()`、`new Function()`）通过。
- 发布资产：`main.js`、`manifest.json`、`styles.css`；BRAT 可直接更新。
