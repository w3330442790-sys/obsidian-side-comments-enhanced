# 构建与验证

Taube Markdown Tool 2.1.0，基于 Side-Comments-origin 的兼容增强版（GPL-3.0-only），并内置原“融合 Mindmap（personal-mindmap）”完整画布和原“表格工具（excel-tool）”。插件 ID 为 `taube-markdown-tool`，从旧 ID 的设置目录迁移；不并行启用副本。完整画布复用 MIT 许可的 Weilanx Mind Map 0.2.0 与 gogoga Mind Map 0.34.0 源码，表格工具复用 MIT 许可的 TableTune 2.0.1 个人增强版；许可与上游提交见 `vendor/personal-mindmap/`、`vendor/excel-tool/` 和 `THIRD_PARTY_NOTICES.md`。

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run build
npm run test:ui
```

UI 测试使用锁定的 Playwright 开发依赖。默认浏览器为本机 Microsoft Edge，可通过 `BROWSER_PATH` 指定 Chromium 可执行文件。测试仅创建合成笔记与内存 Vault，不连接真实 Obsidian 或笔记库。

## 2.1.0 构建结构

- `src/main.ts`：批注、拖动、工具栏与插件入口；`SideNote` 继承内置画布基类，一个实例注册三部分能力。
- `vendor/personal-mindmap/`：原融合 Mindmap 的 Obsidian 入口层、`src/core`、`src/fusion`、`vendor/gogoga/src` 与 `webview/src`；不含 VS Code 扩展与 CLI。
- `vendor/excel-tool/`：原表格工具的 `base/core/icons/legacy/plugin.cjs` 与样式；以子组件方式挂载到宿主插件，命令进入 `taube-markdown-tool:` 命名空间，生命周期随宿主卸载。
- 视图类型：Markdown 脑图复用 `markdown-tool-mindmap`（旧轻量画布标签可直接升级），`.wmind` 为 `taube-markdown-tool-wmind`，`.xmind` 为 `taube-markdown-tool-xmind`；`personal-mindmap-*` 旧类型注册转发视图。
- 设置：批注仍在 `data.json`；脑图写到 `mindmap-settings.json`；表格工具写到 `excel-settings.json`；`state.json` 保存锁定／备注状态。首次加载从 `personal-mindmap/data.json`、`state.json` 和 `excel-tool/data.json`／`table-tune/data.json` 迁移一次。
- `styles.css` 由 `scripts/build-styles.mjs` 生成：`styles.tool.css` + 表格工具样式 + 作用域化的完整画布样式 + gogoga 样式。不要直接编辑生成段。
- `main.js` 会内联 React 画布、手绘字体、表格工具与许可证声明；`scripts/verify-bundle.mjs` 检查没有动态脚本、`eval()` 或 `new Function()`。

## 验证范围

`npm test` 覆盖批注筛选、草稿、标记、Markdown 保真、拖动几何、工具栏命令、合并插件的视图／命令／设置分文件、表格工具核心与持久化，以及旧 `personal-mindmap`／`excel-tool` 迁移。共 209 项单元测试。`npm run test:ui` 顺序执行批注侧栏、选区工具栏、拖动、Markdown 工具栏、完整画布和表格工具浏览器检查，共 93 项检查。测试不读取真实笔记。真实 iPad／安卓硬件未在本次环境验收。

## 1.1.0 历史验收

- 7 项核心行为测试通过。
- 16 项隔离浏览器交互检查通过，包括窄侧栏、平板软键盘与横屏保存按钮。
- ESLint 无错误、无警告，TypeScript 生产构建与 bundle 安全检查通过。
- 实际 Windows Obsidian 已加载 1.1.0；新命令注册成功。
- 本地旧版批注数据升级前后字节一致，原有异常记录保留待人工核对；真实数据与核对报告不公开。
- 实际界面已检查批注卡片、样式和颜色筛选、导航计数、保存按钮与状态。
- 真实 iPad／安卓平板硬件与跨设备同步冲突没有进行实机验收。

独立代码审查提出的删除后重现、旧可选字段失败回滚及撤回编辑后残留草稿问题，均已修复并增加回归测试。
