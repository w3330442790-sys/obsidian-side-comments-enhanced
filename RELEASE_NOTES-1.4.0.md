# 1.4.0 · Taube Markdown Tool（身份统一）

- 发布日期：2026-11-14
- 最低 Obsidian 版本：1.8.7
- 支持平台：桌面端与 Obsidian 手机／平板端
- 插件 ID：`taube-markdown-tool`
- 仓库：https://github.com/w3330442790-sys/taube-markdown-tool

## 本次变化

- 插件显示名改为 **Taube Markdown Tool**，插件 ID 与 GitHub 仓库名统一为 `taube-markdown-tool`。
- BRAT 地址改为：

  ```text
  w3330442790-sys/taube-markdown-tool
  ```

  旧地址 `w3330442790-sys/obsidian-side-comments-enhanced` 会被 GitHub 跳转到新地址，但建议在 BRAT 里直接换成新地址。

## 升级步骤（重要）

1. BRAT 里检查更新或重新添加新地址，安装 `Taube Markdown Tool`。
2. 到“设置 → 第三方插件”启用 **Taube Markdown Tool**。
3. 停用旧的 **Markdown Tool**（ID `personal-markdown-tool`）和 **Side Comments origin · 增强版**（ID `side-comments-origin`），避免多个插件同时写批注数据。
4. 重新打开笔记即可。

首次启用新 ID 时，插件会按 `personal-markdown-tool → side-comments-origin` 的顺序查找 `data.json` 与 `enhancements.json` 并复制到新目录：

- 新目录已有同名文件时不覆盖；
- 旧目录与旧插件文件全部保留，不删除；
- 批注数据目录仍是 `side-note-data`，批注、颜色、定位与草稿都不变；
- 自定义批注路径、图片目录、筛选条件与未知字段原样保留。

## 不变的部分

- 拖动调整层级、Markdown 工具栏、批注跟随、撤销历史仅会话内保留等功能与 1.3.2 完全一致。
- 批注数据格式、设置字段、隐藏注释 `<!-- markdown-tool:v1 … -->` 格式不变。
- 旧的 `personal-markdown-tool` 目录可保留作为回退；确认新版稳定后再自行清理。

## 验证

- 91 项单元测试、ESLint、TypeScript 生产构建与 bundle 安全检查通过。
- 5 套浏览器交互检查通过（拖动 8 项、工具栏 6 项）。
- 旧身份迁移测试覆盖“最新身份优先、旧身份兜底、坏文件不写入”。
- 在真实 Obsidian 1.15.1 中验证新 ID 启用、设置迁移、拖动与 Ctrl+Z 撤销。
