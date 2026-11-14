/**
 * Compatibility handoff to the personal-mindmap plugin.
 *
 * The personal plugin is the full mind-map editor. When its 0.2.0+ version is
 * enabled, this plugin must not add a second "思维导图" action or keep a second
 * mind-map view type around: the Markdown tab already gets a top-right switch
 * from the personal plugin. Keep this module free of Obsidian imports so the
 * version gate can be unit-tested without a vault.
 */

export const LEGACY_MINDMAP_VIEW = 'markdown-tool-mindmap';
export const PERSONAL_MINDMAP_ID = 'personal-mindmap';
export const PERSONAL_MINDMAP_VIEW = 'personal-mindmap-markdown';
export const PERSONAL_MINDMAP_MIN_VERSION = '0.2.0';

export interface PluginRegistryLike {
    enabledPlugins?: Set<string>;
    manifests?: Record<string, { version?: string }>;
    plugins?: Record<string, { manifest?: { version?: string } }>;
}

/** Numeric dotted-version comparison; enough for the two versions involved. */
export function isVersionAtLeast(version: string, minimum: string): boolean {
    const left = version.split('.').map(part => Number.parseInt(part, 10) || 0);
    const right = minimum.split('.').map(part => Number.parseInt(part, 10) || 0);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const a = left[index] ?? 0;
        const b = right[index] ?? 0;
        if (a !== b) return a > b;
    }
    return true;
}

/**
 * True only when the personal plugin is enabled and new enough to provide the
 * top-right Markdown switch. An old 0.1.x plugin must keep this plugin's own
 * mind-map action, otherwise the user would lose the only way in.
 */
export function personalMindmapProvidesView(app: unknown): boolean {
    const registry = (app as { plugins?: PluginRegistryLike } | null | undefined)?.plugins;
    if (!registry?.enabledPlugins?.has(PERSONAL_MINDMAP_ID)) return false;
    const version = registry.manifests?.[PERSONAL_MINDMAP_ID]?.version
        ?? registry.plugins?.[PERSONAL_MINDMAP_ID]?.manifest?.version;
    return typeof version === 'string' && isVersionAtLeast(version, PERSONAL_MINDMAP_MIN_VERSION);
}
