# 上游与融合边界

本插件是自用分支，不是两个上游作者发布的官方版本。

| 来源 | 版本 | 固定提交 |
| --- | --- | --- |
| https://github.com/Azure12355/weilanx-mind-map | 0.2.0 | d411141e5e69f80e482caf0fa7831d981ac76c01 |
| https://github.com/JackWeiGogoga/gogoga-mindmap | 0.34.0 | 6a41e02893ff6d949c650d337eccd1a74d2607d4 |

两者均为 MIT。根 LICENSE 保留 Azure12355 的原始许可；vendor/gogoga/LICENSE 保留 JackWei 的原始许可。字体使用独立 OFL 许可。构建包附双方许可、字体许可及运行依赖声明。

Weilanx 源码作为主工程保留，Markdown 的完整文件编辑通过适配层接入同一个 React 主画布；gogoga 的 Markdown 解析、保留格式写回、XMind、嵌入、主题编辑器与宿主服务保留在 vendor/gogoga。该目录有明确的融合适配修改，并非未经修改的子模块。原完整文件视图留作 native-view.ts.reference，不参与构建。代码块和 XMind 只读预览保留适合嵌入场景的原生渲染器。

版本范围针对上述提交，不包含未来上游新增功能。VS Code 扩展源码及 CLI 保留；本次交付目标为 Obsidian 安装包。

Markdown 仍是可阅读的标题/列表，并以 %% 标记表达原生功能。为了保留手绘、复杂样式、重叠范围和完整关系控制点，主画布编辑后的 Markdown 文件还带有 wmind-fusion:v1 HTML 注释。请保留它；移除注释仍可读取大纲，但其中承载的高级格式无法恢复。对外部编辑无法安全匹配的元数据，会显示警告并保留恢复信息。
