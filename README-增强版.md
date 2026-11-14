# Taube Markdown Tool（原 Side Comments 增强版）

当前版本 **2.2.0**。2.0.0 把原先独立的 **融合 Mindmap（personal-mindmap）** 完整并入本插件；2.1.0 又把 **表格工具（excel-tool）** 完整并入；2.2.0 在 Markdown 工具栏补充撤销、重做和查找替换：批注、正文拖动、Markdown 语法工具栏、完整思维导图画布（Markdown 一键切换、`.wmind`、`.xmind`）和安卓友好表格工具只需安装一个插件。升级时请停用 `personal-mindmap`、`excel-tool`／`table-tune`，但保留其目录；本插件首次加载会迁移相应设置，旧标签页也会自动衔接。最新安装和使用说明见 [README.md](README.md)。下文保留此前批注功能说明。

基于 [Side-Comments-origin](https://github.com/jepicaju862-lab/Side-Comments-origin) 的 Obsidian 批注插件增强版。保留原有功能与批注数据格式，增加手机、平板使用所需的保存与复习操作。

- 当前版本：**2.1.0**
- 支持：Windows、macOS、Linux，以及 Obsidian 手机／平板端
- 插件 ID：`taube-markdown-tool`，独立于原社区版更新
- [下载最新版本](https://github.com/w3330442790-sys/taube-markdown-tool/releases/latest)

## 手机和平板安装：BRAT

1. 在 Obsidian 的“设置 → 第三方插件”中安装并启用 **BRAT**。
2. 打开 BRAT 设置，选择 **Add beta plugin**。
3. 填入仓库地址：

   ```text
   w3330442790-sys/taube-markdown-tool
   ```

4. 选择最新版本（Latest），添加并启用 **Taube Markdown Tool**。
5. 后续通过 BRAT 检查此仓库的更新。

这是通过 GitHub／BRAT 安装的版本，尚未作为独立插件提交到 Obsidian 官方插件目录。

如果已经安装原版：先备份批注数据与原插件目录，再停用原版并通过 BRAT 添加本仓库。**不要先卸载原插件或删除数据目录。**如果 BRAT 正在跟踪上游原仓库，先移除原仓库的更新跟踪，再添加本仓库，避免上游更新覆盖增强版。沿用同一个插件 ID，升级后在原有设置位置使用。

从 1.6.x 或融合 Mindmap 升级到 2.0.0+ 时，请停用独立的 `personal-mindmap` 插件并保留其目录；本插件首次加载会读取 `personal-mindmap/data.json` 与 `state.json`，把脑图设置迁移到 `taube-markdown-tool/mindmap-settings.json`，同时转发旧脑图标签。详细说明见 [README.md](README.md)。

从 excel-tool／table-tune 升级到 2.1.0 时，请停用旧表格插件并保留目录；首次加载会把 `excel-tool/data.json`（不存在时回退 `table-tune/data.json`）迁移到 `taube-markdown-tool/excel-settings.json`，并保留旧文件和批注 `data.json`。旧表格插件仍启用时，本插件会提示并跳过内置表格工具，避免两套工具栏冲突。

## 已有批注与跨设备同步

插件直接兼容原始批注 JSON，无需从 SideNote 汇总笔记重新导入：

- `side-note-data/`：默认原始批注目录。
- `.obsidian/plugins/side-comments-origin/data.json`：原设置与部分旧版数据。
- `side-note-attachments/`：默认批注图片目录。

这些路径可在原插件设置中自定义。**在另一台设备安装插件，不等于同步笔记或批注。**请通过自己的同步方式同步原笔记、实际批注数据目录和附件。跨设备同时编辑同一份批注数据时，需要由同步工具处理冲突。

## 2.1.0 内置表格工具

- 电脑鼠标点击单元格、平板轻点单元格边缘或表格旁的小图标，打开悬浮图标栏，提供选择、合并／拆分、对齐、插入／删除行列、清空、固定、整理、样式、复制／导出、撤销／重做等操作。
- 列宽、行高、合并、底色、重点标记、固定和工具栏自定义保存在 `excel-settings.json`；Markdown 表格正文仍是内容唯一来源，不覆盖批注 `data.json`。
- 支持整行／整列、多行／多列点选与矩形选择；普通滑动仍用于浏览。
- 首次加载自动迁移旧 `excel-tool`／`table-tune` 表格设置；旧插件继续启用时，Taube 的内置表格工具会等待用户停用旧插件并重载。

## 2.0.0 内置完整思维导图

- 原融合 Mindmap 的 Weilanx／gogoga 主画布、主题与样式面板、外框、概括、联系线、背诵模式、备注卡片、富内容及 PNG/SVG 导出全部内置。
- Markdown 标签右上角一键切换完整画布，不写 frontmatter、不建镜像文件；`.wmind` 完整格式与只读 `.xmind` 也由同一插件处理。
- 批注设置保存在 `data.json`，脑图设置保存在 `mindmap-settings.json`，互不覆盖；旧 `personal-mindmap` 的 `data.json`、`state.json` 首次加载自动迁移。
- 旧 `markdown-tool-mindmap`、`personal-mindmap-markdown`、`personal-mindmap-wmind`、`personal-mindmap-xmind` 标签会自动转到对应新视图。
- 1.2.0–1.6.2 轻量画布的 `<!-- markdown-tool:v1 … -->` 注释会保留，但不会自动转换为新画布的 `wmind-fusion:v1` 格式。

## 新增功能

| 功能 | 行为 |
| --- | --- |
| 样式＋颜色筛选 | 组合筛选高光、下划线等样式及指定颜色，只影响侧栏列表 |
| 常用筛选 | 命名保存、快捷调用、删除，并恢复上次筛选条件 |
| 上一条／下一条 | 按当前筛选和排序浏览，显示当前条数及总数 |
| 批注重新绑定 | 列出定位异常的批注，选中新原文并确认绑定，保留正文、时间、颜色和样式 |
| 保存与状态 | 明确的“保存”键，显示未保存、保存中、已保存及失败状态 |
| 本机草稿 | 自动暂存输入、误关恢复、恢复列表、失败重试；草稿不跨设备同步 |
| 手机／平板布局 | 放大触控按钮，适配窄侧栏、横屏和软键盘可见视口，保留保存栏 |

原有 Markdown 批注、图片、正文标记、阅读模式交互、搜索、排序、导出等功能继续保留。原版默认黄色 `#ffc800` 与预设黄色 `#f59e0b` 按实际色值分别筛选。

详见 [增强版使用说明](增强版使用说明.md) 和 [更新记录](CHANGELOG-增强版.md)。已完成隔离交互测试和 Windows Obsidian 加载检查；真实 iPad／安卓设备仍需使用者验证实际体验。

## 手动安装与回退

从 [Release](https://github.com/w3330442790-sys/taube-markdown-tool/releases/latest) 下载 `main.js`、`manifest.json`、`styles.css`，放入笔记库的 `.obsidian/plugins/taube-markdown-tool/` 后重载插件。也可下载 ZIP 并复制其中的插件文件。

不要替换自己的 `data.json`、`enhancements.json` 或批注数据目录。回退时只恢复旧插件的程序文件，避免用旧备份覆盖升级后的新批注。

## 开发与许可

参见 [构建说明](BUILD.md)。源码、安装包均不包含使用者的笔记、批注、草稿或本地备份。

原项目作者为 **peyote**，原项目采用 **GPL-3.0-only**，本增强版沿用相同许可并保留原作者署名、[LICENSE](LICENSE) 与 [上游说明](README.upstream.md)。本增强版由 **taube** 维护，仓库为 [w3330442790-sys/taube-markdown-tool](https://github.com/w3330442790-sys/taube-markdown-tool)。
