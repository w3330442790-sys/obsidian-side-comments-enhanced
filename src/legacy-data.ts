import type { App } from 'obsidian';

/**
 * Copies legacy settings into the current plugin folder, newest identity first.
 * Existing files in the current folder always win; nothing is deleted, so both
 * the previous `personal-markdown-tool` folder and the original
 * `side-comments-origin` folder stay intact as a fallback.
 */
export async function migrateLegacyData(app: App, currentId: string, legacyIds: string | string[], names: string[]): Promise<void> {
    const legacy = Array.isArray(legacyIds) ? legacyIds : [legacyIds];
    const adapter = app.vault.adapter;
    const root = app.vault.configDir + '/plugins/';
    const pending: Array<{target: string; text: string}> = [];
    for (const name of names) {
        const target = root + currentId + '/' + name;
        if (await adapter.exists(target)) continue;
        let source: string | undefined;
        let text: string | undefined;
        for (const legacyId of legacy) {
            const candidate = root + legacyId + '/' + name;
            if (!await adapter.exists(candidate)) continue;
            source = candidate;
            text = await adapter.read(candidate);
            break;
        }
        if (text === undefined) continue;
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy settings: ' + String(source));
        pending.push({target, text});
    }
    for (const {target, text} of pending) {
        if (!await adapter.exists(target)) await adapter.write(target, text);
    }
}
