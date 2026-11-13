import type { App } from 'obsidian';

// Keep old settings and annotations intact, including unknown future fields.
export async function migrateLegacyData(app: App, currentId: string, legacyId: string, names: string[]): Promise<void> {
    const adapter = app.vault.adapter;
    const root = app.vault.configDir + '/plugins/';
    const pending: Array<{target: string; text: string}> = [];
    for (const name of names) {
        const target = root + currentId + '/' + name;
        const source = root + legacyId + '/' + name;
        if (await adapter.exists(target) || !await adapter.exists(source)) continue;
        const text = await adapter.read(source);
        const value: unknown = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid legacy settings: ' + source);
        pending.push({target, text});
    }
    for (const {target, text} of pending) {
        if (!await adapter.exists(target)) await adapter.write(target, text);
    }
}
