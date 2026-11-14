# 构建与验证

Taube Markdown Tool 1.4.0，基于 Side-Comments-origin 的兼容增强版，原许可 GPL-3.0-only。插件 ID 为 taube-markdown-tool，从旧 ID 的设置目录迁移；不并行启用副本。Markdown 解析／树操作／格式合并复用 MIT 许可的 gogoga Mind Map 0.34.0；许可见 `src/mindmap/vendor/LICENSE`。

```powershell
npm ci --ignore-scripts
npm test
npm run lint
npm run build
npm run test:ui
```

UI 测试使用锁定的 Playwright 开发依赖。默认浏览器为本机 Microsoft Edge，可通过 `BROWSER_PATH` 指定 Chromium 可执行文件。测试仅创建合成笔记与内存 Vault，不连接真实 Obsidian 或笔记库。

`scripts/verify-legacy.cjs <vault-path>` 是本次维护用的只读核对脚本，需要本地 private/backup-20261104/side-note-data 备份；真实备份不在发布包或源码包中。

## 1.2.0 验证范围

`npm test` 覆盖批注筛选、草稿、标记、Markdown 保真、重复节点、关系与总括子树、历史与冲突保存。`npm run test:ui` 顺序执行原批注回归、选区工具栏和导图／视图切换集成交互检查。测试不读取真实笔记。真实 iPad／安卓硬件未在本次环境验收。

## 1.1.0 历史验收

- 7 项核心行为测试通过。
- 16 项隔离浏览器交互检查通过，包括窄侧栏、平板软键盘与横屏保存按钮。
- ESLint 无错误、无警告，TypeScript 生产构建与 bundle 安全检查通过。
- 实际 Windows Obsidian 已加载 1.1.0；新命令注册成功。
- 本地旧版批注数据升级前后字节一致，原有异常记录保留待人工核对；真实数据与核对报告不公开。
- 实际界面已检查批注卡片、样式和颜色筛选、导航计数、保存按钮与状态。
- 真实 iPad／安卓平板硬件与跨设备同步冲突没有进行实机验收。

独立代码审查提出的删除后重现、旧可选字段失败回滚及撤回编辑后残留草稿问题，均已修复并增加回归测试。
