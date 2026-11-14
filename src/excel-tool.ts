import { Notice, type App, type Plugin, type PluginManifest } from 'obsidian';
import ExcelToolPlugin from '../vendor/excel-tool/src/plugin.cjs';

export interface ExcelToolStorage {
    read(): Promise<Record<string, unknown>>;
    write(data: unknown): Promise<void>;
}

interface ExcelToolInstance extends Plugin {
    loadData(): Promise<Record<string, unknown> | null>;
    saveData(data: unknown): Promise<void>;
    [key: string]: unknown;
}

const ExcelToolClass = ExcelToolPlugin as unknown as new (
    app: App,
    manifest: PluginManifest,
) => ExcelToolInstance;

/**
 * The table toolkit has global pointer/keyboard handlers and patches
 * app.commands.executeCommand. Loading it next to a standalone excel-tool or
 * table-tune plugin would duplicate both, so the host defers to the old plugin
 * until the user disables it and reloads.
 */
export function standaloneExcelToolEnabled(app: App): boolean {
    const enabled = (app as App & { plugins?: { enabledPlugins?: Set<string> } }).plugins?.enabledPlugins;
    return !!enabled?.has('excel-tool') || !!enabled?.has('table-tune');
}

/**
 * Instantiate the vendored table toolkit as a child component of the fused
 * plugin. It uses the host manifest so its commands join the same command
 * namespace, and its persistence is redirected to excel-settings.json.
 */
export async function loadExcelTool(
    app: App,
    manifest: PluginManifest,
    storage: ExcelToolStorage,
): Promise<ExcelToolInstance | null> {
    const instance = new ExcelToolClass(app, manifest);
    instance.loadData = () => storage.read();
    instance.saveData = (data: unknown) => storage.write(data);
    try {
        // Obsidian's Component.load() actually returns the onload() promise at
        // runtime even though the public type declares void. Await it so the
        // table commands are registered before this plugin's onload resolves.
        const loading = instance.load() as unknown as Promise<void> | undefined;
        if (loading) await loading;
        return instance;
    } catch (error) {
        console.error('[Taube Markdown Tool] 表格工具加载失败', error);
        try { instance.unload(); } catch { /* Partial registrations are best-effort. */ }
        new Notice(`表格工具加载失败：${(error as Error)?.message ?? String(error)}`);
        return null;
    }
}
