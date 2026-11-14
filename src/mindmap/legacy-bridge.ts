import { ItemView, Notice, type App, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { LEGACY_MINDMAP_VIEW, PERSONAL_MINDMAP_VIEW, personalMindmapProvidesView } from './compat';

/**
 * Registered only while the personal mind-map plugin owns the mind-map UX.
 *
 * Existing workspaces may still contain this plugin's old view type. Instead of
 * leaving a dead tab (or letting the user land in the second, redundant canvas),
 * this tiny view forwards that tab to the personal plugin's view for the same
 * file, or to ordinary Markdown if the personal view is not available.
 */
export class LegacyMindmapBridgeView extends ItemView {
    private timer: number | null = null;
    private redirected = false;
    private closed = false;

    constructor(leaf: WorkspaceLeaf, private readonly hostApp: App) {
        super(leaf);
    }

    getViewType(): string { return LEGACY_MINDMAP_VIEW; }
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
            const personalReady = personalMindmapProvidesView(this.hostApp) && this.hasViewType(PERSONAL_MINDMAP_VIEW);
            if (personalReady || Date.now() - started > 1500) {
                void this.redirect(personalReady);
                return;
            }
            this.timer = window.setTimeout(attempt, 50);
        };
        attempt();
    }

    private hasViewType(type: string): boolean {
        const registry = (this.hostApp as App & {
            viewRegistry?: { getViewCreatorByType?: (viewType: string) => unknown };
        }).viewRegistry;
        if (typeof registry?.getViewCreatorByType !== 'function') return true;
        try { return !!registry.getViewCreatorByType(type); } catch { return true; }
    }

    private async redirect(toPersonal: boolean): Promise<void> {
        if (this.redirected) return;
        this.redirected = true;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        const filePath = this.filePath();
        if (!filePath) {
            this.contentEl.empty();
            this.contentEl.createEl('p', { text: '这个旧思维导图标签没有关联文件，请关闭后从笔记重新打开。' });
            return;
        }
        const active = this.hostApp.workspace.getMostRecentLeaf() === this.leaf;
        try {
            await this.leaf.setViewState({
                type: toPersonal ? PERSONAL_MINDMAP_VIEW : 'markdown',
                state: toPersonal ? { file: filePath } : { file: filePath, mode: 'source' },
                active,
            });
        } catch (error) {
            try {
                await this.leaf.setViewState({ type: 'markdown', state: { file: filePath, mode: 'source' }, active });
            } catch (fallbackError) {
                new Notice(`无法切换到思维导图：${(fallbackError as Error)?.message ?? String(error)}`);
                this.redirected = false;
            }
        }
    }

    private filePath(): string | null {
        const state = this.leaf.getViewState() as { state?: { file?: unknown } };
        return typeof state.state?.file === 'string' ? state.state.file : null;
    }
}

export function registerLegacyMindmapBridge(plugin: Plugin, app: App): void {
    plugin.registerView(LEGACY_MINDMAP_VIEW, leaf => new LegacyMindmapBridgeView(leaf, app));
}
