import { ItemView, Notice, type App, type Plugin, type WorkspaceLeaf } from 'obsidian';

/**
 * The fused editor replaces the standalone `personal-mindmap` plugin. Workspaces
 * that were saved while that plugin was enabled still point at its three view
 * types, so register lightweight forwarding views and immediately move any open
 * tab to the corresponding fused view for the same file.
 */
const LEGACY_VIEWS: Record<string, string> = {
    'personal-mindmap-markdown': 'markdown-tool-mindmap',
    'personal-mindmap-wmind': 'taube-markdown-tool-wmind',
    'personal-mindmap-xmind': 'taube-markdown-tool-xmind',
};

const PERSONAL_PLUGIN_ID = 'personal-mindmap';
const VIEW_WAIT_MS = 1500;

function hasViewType(app: App, type: string): boolean {
    const registry = (app as App & {
        viewRegistry?: { getViewCreatorByType?: (viewType: string) => unknown };
    }).viewRegistry;
    if (typeof registry?.getViewCreatorByType !== 'function') return true;
    try { return !!registry.getViewCreatorByType(type); } catch { return true; }
}

export function personalMindmapStillEnabled(app: App): boolean {
    const plugins = (app as App & { plugins?: { enabledPlugins?: Set<string> } }).plugins;
    return !!plugins?.enabledPlugins?.has(PERSONAL_PLUGIN_ID);
}

function targetFor(type: string): string | null {
    return LEGACY_VIEWS[type] ?? null;
}

function legacyFile(leaf: WorkspaceLeaf): string | null {
    const state = leaf.getViewState() as { state?: { file?: unknown } };
    return typeof state.state?.file === 'string' ? state.state.file : null;
}

class LegacyMindmapView extends ItemView {
    private timer: number | null = null;
    private redirected = false;
    private closed = false;

    constructor(
        leaf: WorkspaceLeaf,
        private readonly hostApp: App,
        private readonly viewType: string,
        private readonly target: string,
    ) {
        super(leaf);
    }

    getViewType(): string { return this.viewType; }
    getDisplayText(): string { return '思维导图'; }
    getIcon(): string { return 'brain-circuit'; }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass('markdown-tool-legacy-bridge');
        this.contentEl.createEl('p', { text: '正在切换视图…' });
        this.hostApp.workspace.onLayoutReady(() => this.schedule());
    }

    async onClose(): Promise<void> {
        this.closed = true;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
    }

    private schedule(): void {
        const started = Date.now();
        const attempt = () => {
            if (this.closed || this.redirected) return;
            const ready = hasViewType(this.hostApp, this.target);
            if (ready || Date.now() - started > VIEW_WAIT_MS) {
                void this.redirect(ready);
                return;
            }
            this.timer = window.setTimeout(attempt, 50);
        };
        attempt();
    }

    private async redirect(targetReady: boolean): Promise<void> {
        if (this.redirected) return;
        this.redirected = true;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        const filePath = legacyFile(this.leaf);
        if (!filePath) {
            this.contentEl.empty();
            this.contentEl.createEl('p', { text: '这个旧思维导图标签没有关联文件，请关闭后从笔记重新打开。' });
            return;
        }
        const active = this.hostApp.workspace.getMostRecentLeaf() === this.leaf;
        try {
            await this.leaf.setViewState({
                type: targetReady ? this.target : 'markdown',
                state: { file: filePath },
                active,
            });
        } catch (error) {
            new Notice(`无法切换旧思维导图标签：${(error as Error)?.message ?? String(error)}`);
            this.redirected = false;
        }
    }
}

/** Move tabs that are already alive when the plugin loads, not only restored ones. */
export function redirectLegacyMindmapLeaves(app: App): void {
    if (personalMindmapStillEnabled(app)) return;
    let attempts = 0;
    const run = () => {
        let pending = false;
        app.workspace.iterateAllLeaves(leaf => {
            let state: { type?: string; state?: { file?: unknown } };
            let type: string | undefined;
            try {
                state = leaf.getViewState();
                type = state.type;
            } catch {
                return;
            }
            type ??= leaf.view.getViewType();
            const target = type ? targetFor(type) : null;
            if (!target) return;
            const filePath = typeof state.state?.file === 'string'
                ? state.state.file
                : ((leaf.view as unknown as { file?: { path?: string } }).file?.path ?? null);
            if (!filePath) return;
            if (!hasViewType(app, target)) {
                pending = true;
                return;
            }
            const active = app.workspace.getMostRecentLeaf() === leaf;
            void leaf.setViewState({ type: target, state: { file: filePath }, active });
        });
        // The fused views register during plugin load; wait briefly for them.
        if (pending && attempts++ < 15) window.setTimeout(run, 100);
    };
    app.workspace.onLayoutReady(run);
}

export function registerMindmapBridges(plugin: Plugin, app: App): void {
    if (personalMindmapStillEnabled(app)) {
        new Notice('检测到仍启用了独立的“融合思维导图”插件。本插件已内置同一画布，请停用 personal-mindmap 后重新加载，避免重复入口。');
        return;
    }
    for (const [legacy, target] of Object.entries(LEGACY_VIEWS)) {
        plugin.registerView(legacy, leaf => new LegacyMindmapView(leaf, app, legacy, target));
    }
    redirectLegacyMindmapLeaves(app);
}
