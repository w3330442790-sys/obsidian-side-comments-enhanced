import { parseMarkdown, serializeMarkdown } from './vendor/markdown';
import { preserveFormat } from './vendor/merge';
import { createNode, moveNode as moveTreeNode, removeNode as removeTreeNode, type MindDoc, type MindNode } from './vendor/model';

export type MindmapNode = MindNode & { sourceLine?: number; sourceEndLine?: number };
export interface MindmapRelationship { id: string; from: string; to: string; text: string }
export interface MindmapSummary { id: string; parentId: string; from: string; to: string; root: MindmapNode }
interface Identity { id: string; path: string; fingerprint: string }
interface Metadata { version: 1; identities: Identity[]; relationships: MindmapRelationship[]; summaries: SavedSummary[] }
interface SavedNode { id: string; text: string; note?: string; folded?: boolean; children: SavedNode[] }
interface SavedSummary { id: string; parentId: string; from: string; to: string; root: SavedNode }
export interface MindmapDoc {
    root: MindmapNode;
    relationships: MindmapRelationship[];
    summaries: MindmapSummary[];
    warnings: string[];
    source: string;
    title: string;
    parserDoc: MindDoc;
    /** Internal pristine state used to avoid touching Markdown merely by viewing it. */
    originalBody: string;
    originalState: string;
}

const MARKER = /(?:\r?\n)?<!-- markdown-tool:v(\d+) ([^\r\n]*?) -->\s*$/;
function uid(): string { return `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
function assertLabel(text: string): void {
    if (typeof text !== 'string' || /[\r\n]/.test(text)) throw new Error('节点文字必须为单行；正文请在 Markdown 中编辑。');
}
function entries(root: MindmapNode): Array<{ node: MindmapNode; path: string }> {
    const result: Array<{ node: MindmapNode; path: string }> = [];
    const visit = (node: MindmapNode, path: string) => { result.push({ node, path }); node.children.forEach((child, i) => visit(child, `${path}/${i}`)); };
    visit(root, ''); return result;
}
function stableId(path: string, text: string): string {
    let hash = 2166136261;
    for (const char of `${path}:${text}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return `mt-${(hash >>> 0).toString(36)}-${path.replace(/\//g, '_') || 'root'}`;
}
function fingerprint(node: { text: string; note: string }): string {
    const source = JSON.stringify([node.text, node.note]);
    let first = 2166136261, second = 5381;
    for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        first = Math.imul(first ^ code, 16777619);
        second = Math.imul(second, 33) ^ code;
    }
    return `${source.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
}
function saveNode(node: MindmapNode): SavedNode {
    return { id: node.id, text: node.text, note: node.note || undefined, folded: node.folded || undefined, children: node.children.map(saveNode) };
}
function restoreNode(value: unknown, parent: MindmapNode | null, ids: Set<string>): MindmapNode {
    if (!value || typeof value !== 'object') throw new Error('总括节点数据无效');
    const node = value as SavedNode;
    if (typeof node.id !== 'string' || !node.id || ids.has(node.id) || typeof node.text !== 'string' || !Array.isArray(node.children) || (node.note !== undefined && typeof node.note !== 'string') || (node.folded !== undefined && typeof node.folded !== 'boolean')) throw new Error('总括节点数据无效或标识重复');
    ids.add(node.id); assertLabel(node.text);
    const restored = createNode({ id: node.id, text: node.text, note: node.note, folded: node.folded, parent });
    restored.children = node.children.map(child => restoreNode(child, restored, ids)); return restored;
}
function savedMetadata(doc: MindmapDoc): Metadata {
    return {
        version: 1,
        identities: entries(doc.root).map(({ node, path }) => ({ id: node.id, path, fingerprint: fingerprint(node) })),
        relationships: doc.relationships,
        summaries: doc.summaries.map(s => ({ ...s, root: saveNode(s.root) })),
    };
}
function state(doc: MindmapDoc): string {
    return JSON.stringify({ markdown: serializeMarkdown(doc.parserDoc), metadata: savedMetadata(doc) });
}
export function parseDocument(source: string, title = '思维导图'): MindmapDoc {
    let body = source, metadata: Metadata | undefined;
    const match = MARKER.exec(source);
    if (source.includes('<!-- markdown-tool:') && !match) throw new Error('导图扩展信息损坏，请保留原文件并修复元数据后重试。');
    if (match) {
        if (match[1] !== '1') throw new Error('此文件使用更新版本的导图格式，请先升级插件。');
        try { metadata = JSON.parse(decodeURIComponent(match[2])) as Metadata; } catch { throw new Error('导图扩展信息无法读取，请先恢复有效的文件版本。'); }
        if (!metadata || metadata.version !== 1 || !Array.isArray(metadata.identities) || !Array.isArray(metadata.relationships) || !Array.isArray(metadata.summaries)) throw new Error('导图扩展信息结构无效');
        body = source.slice(0, match.index);
        // The writer separates metadata by one newline; retain the body's own ending.
        if (body && !body.endsWith('\n')) body += source.includes('\r\n') ? '\r\n' : '\n';
    }
    const lines = new Map<MindNode, number>();
    const parserDoc = parseMarkdown(body, { fallbackTitle: title, showHidden: true, lines });
    const warnings: string[] = [], used = new Set<string>();
    const mapped = entries(parserDoc.root);
    const identities = metadata?.identities ?? [];
    if (identities.some(i => !i || typeof i.id !== 'string' || !i.id || typeof i.path !== 'string' || typeof i.fingerprint !== 'string') || new Set(identities.map(i => i.id)).size !== identities.length) throw new Error('节点标识数据无效');
    const matched = new Set<Identity>();
    const assigned = new Map<MindmapNode, Identity>();
    const key = fingerprint;
    const oldGroups = new Map<string, Identity[]>();
    const newGroups = new Map<string, Array<{ node: MindmapNode; path: string }>>();
    for (const identity of identities) { const group = oldGroups.get(identity.fingerprint) ?? []; group.push(identity); oldGroups.set(identity.fingerprint, group); }
    for (const item of mapped) { const group = newGroups.get(key(item.node)) ?? []; group.push(item); newGroups.set(key(item.node), group); }
    // Match unique content before positional matches, so inserted siblings cannot steal IDs.
    for (const item of mapped) {
        const candidates = oldGroups.get(key(item.node)) ?? [];
        const occurrences = newGroups.get(key(item.node)) ?? [];
        if (candidates.length === 1 && occurrences.length === 1) { assigned.set(item.node, candidates[0]); matched.add(candidates[0]); }
    }
    const identitiesByPath = new Map(identities.map(identity => [identity.path, identity]));
    const sameTreeShape = identities.length === mapped.length && identitiesByPath.size === identities.length && mapped.every(item => identitiesByPath.has(item.path));
    // Raw Markdown renames and note edits have no explicit ID syntax. Positional
    // recovery is permitted only for the identical complete tree shape and when
    // every confidently matched unique anchor remains at its original path.
    // A moved anchor or inserted/deleted node disables this fallback globally.
    const stablePaths = sameTreeShape && mapped.every(item => !assigned.has(item.node) || assigned.get(item.node)!.path === item.path);
    for (const { node, path } of mapped) {
        const candidates = oldGroups.get(key(node)) ?? [];
        const occurrences = newGroups.get(key(node)) ?? [];
        // Repeated labels are safe only if the complete set of positions is unchanged.
        const samePositions = candidates.length === occurrences.length && candidates.every(i => occurrences.some(o => o.path === i.path));
        const positional = stablePaths ? identitiesByPath.get(path) : undefined;
        const candidate = assigned.get(node) ?? (samePositions ? candidates.find(i => !matched.has(i) && i.path === path) : undefined) ?? (positional && !matched.has(positional) ? positional : undefined);
        if (candidate) matched.add(candidate);
        let id = candidate?.id ?? (metadata ? uid() : stableId(path, node.text));
        while (used.has(id)) id = uid();
        node.id = id; used.add(id);
        if (lines.has(node)) node.sourceLine = lines.get(node);
    }
    const bodyLines = body.replace(/\r\n?/g, '\n').split('\n');
    if (bodyLines[bodyLines.length - 1] === '') bodyLines.pop();
    const structural = mapped.filter(item => item.node.sourceLine !== undefined).sort((a, b) => a.node.sourceLine! - b.node.sourceLine!);
    if (!parserDoc.rootFromHeading) {
        const start = parserDoc.frontmatter ? parserDoc.frontmatter.split('\n').length : 0;
        const first = structural[0]?.node.sourceLine ?? bodyLines.length;
        if (first > start) {
            (parserDoc.root as MindmapNode).sourceLine = start;
            structural.unshift({ node: parserDoc.root, path: '' });
        }
    }
    structural.forEach((item, index) => {
        item.node.sourceEndLine = (structural[index + 1]?.node.sourceLine ?? bodyLines.length) - 1;
    });
    if (identities.some(i => !matched.has(i))) warnings.push('部分节点被外部修改，相关连线或总括已保留；请检查并重新绑定无法定位的项目。');
    const relationships = (metadata?.relationships ?? []).map(value => {
        if (!value || typeof value.id !== 'string' || typeof value.from !== 'string' || typeof value.to !== 'string' || typeof value.text !== 'string') throw new Error('关联线数据无效');
        return { ...value };
    });
    const summaries = (metadata?.summaries ?? []).map(value => {
        if (!value || typeof value.id !== 'string' || typeof value.parentId !== 'string' || typeof value.from !== 'string' || typeof value.to !== 'string') throw new Error('总括范围数据无效');
        return { ...value, root: restoreNode(value.root, null, used) };
    });
    const doc: MindmapDoc = { root: parserDoc.root, relationships, summaries, warnings, source, title, parserDoc, originalBody: body, originalState: '' };
    if (relationships.some(r => !findNode(doc, r.from) || !findNode(doc, r.to)) || summaries.some(s => !findNode(doc, s.parentId) || !findNode(doc, s.from) || !findNode(doc, s.to))) warnings.push('存在无法定位的关联线或总括范围，已保留其数据以供恢复。');
    doc.originalState = state(doc); return doc;
}
export function serializeDocument(doc: MindmapDoc, _original?: string): string {
    if (state(doc) === doc.originalState) return doc.source;
    const next = serializeMarkdown(doc.parserDoc);
    let body = preserveFormat(doc.originalBody, next, text => serializeMarkdown(parseMarkdown(text, { fallbackTitle: doc.title, showHidden: true })));
    const crlf = doc.originalBody.includes('\r\n') && !/(^|[^\r])\n/.test(doc.originalBody);
    if (crlf) body = body.replace(/\r?\n/g, '\r\n');
    const newline = crlf ? '\r\n' : '\n';
    return `${body}${body.endsWith('\n') ? '' : newline}<!-- markdown-tool:v1 ${encodeURIComponent(JSON.stringify(savedMetadata(doc)))} -->${newline}`;
}
export function allNodes(doc: MindmapDoc): MindmapNode[] {
    return [doc.root, ...doc.summaries.map(s => s.root)].flatMap(root => entries(root).map(item => item.node));
}
export function findNode(doc: MindmapDoc, id: string): MindmapNode | undefined { return allNodes(doc).find(n => n.id === id); }
function required(doc: MindmapDoc, id: string): MindmapNode {
    const node = findNode(doc, id); if (!node) throw new Error('节点不存在或已经被删除'); return node;
}
export function renameNode(doc: MindmapDoc, id: string, text: string): void {
    assertLabel(text); const node = required(doc, id); node.text = text;
    if (node === doc.root && !doc.parserDoc.rootFromHeading) { doc.parserDoc.rootFromHeading = true; node.kind = 'heading'; node.level = 1; }
}
export function addChild(doc: MindmapDoc, id: string, text = '新节点'): MindmapNode {
    assertLabel(text); const parent = required(doc, id);
    const last = parent.children[parent.children.length - 1];
    const kind = parent.kind === 'heading' && parent.level < 6 && last?.kind === 'heading' ? 'heading' : 'list';
    const node = createNode({ id: uid(), parent, text, kind, level: parent.level + 1 });
    parent.children.push(node); parent.folded = false; return node;
}
export function addSibling(doc: MindmapDoc, id: string, text = '新节点'): MindmapNode {
    assertLabel(text); const node = required(doc, id); if (!node.parent) throw new Error('根节点没有同级节点，请添加子节点');
    const sibling = createNode({ id: uid(), text, parent: node.parent, kind: node.kind, level: node.level, bullet: node.bullet });
    node.parent.children.splice(node.parent.children.indexOf(node) + 1, 0, sibling); return sibling;
}
function cleanReferences(doc: MindmapDoc, removed: Set<string>): void {
    doc.relationships = doc.relationships.filter(r => !removed.has(r.from) && !removed.has(r.to));
    doc.summaries = doc.summaries.filter(s => !removed.has(s.parentId) && !removed.has(s.from) && !removed.has(s.to));
}
export function removeNode(doc: MindmapDoc, id: string): void {
    const node = required(doc, id), summary = doc.summaries.find(s => s.root === node);
    if (!node.parent && !summary) throw new Error('不能删除文档根节点');
    const removed = new Set(entries(node).map(item => item.node.id));
    if (summary) doc.summaries.splice(doc.summaries.indexOf(summary), 1); else removeTreeNode(node);
    for (const s of doc.summaries) if (removed.has(s.parentId) || removed.has(s.from) || removed.has(s.to)) entries(s.root).forEach(item => removed.add(item.node.id));
    cleanReferences(doc, removed);
}
export function indentNode(doc: MindmapDoc, id: string): void {
    const node = required(doc, id), parent = node.parent;
    if (!parent) throw new Error('根节点不能降级');
    const previous = parent.children[parent.children.indexOf(node) - 1];
    if (!previous) throw new Error('第一个节点没有可归属的前一个节点');
    assertNotSummaryMember(doc, node);
    moveTreeNode(node, previous, previous.children.length, doc.parserDoc.style); previous.folded = false;
}
export function outdentNode(doc: MindmapDoc, id: string): void {
    const node = required(doc, id), parent = node.parent;
    if (!parent?.parent) throw new Error('该节点不能继续升级');
    assertNotSummaryMember(doc, node);
    moveTreeNode(node, parent.parent, parent.parent.children.indexOf(parent) + 1, doc.parserDoc.style);
}
export function moveNode(doc: MindmapDoc, id: string, direction: -1 | 1): void {
    const node = required(doc, id), siblings = node.parent?.children;
    if (!siblings) throw new Error('根节点不能移动');
    const index = siblings.indexOf(node), target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    assertNotSummaryMember(doc, node);
    assertNotSummaryMember(doc, siblings[target]);
    moveTreeNode(node, node.parent!, direction > 0 ? target + 1 : target, doc.parserDoc.style);
}
function assertNotSummaryMember(doc: MindmapDoc, node: MindmapNode): void {
    const siblings = node.parent?.children;
    if (!siblings) return;
    const index = siblings.indexOf(node);
    for (const summary of doc.summaries) {
        if (summary.parentId !== node.parent?.id) continue;
        const from = siblings.findIndex(n => n.id === summary.from), to = siblings.findIndex(n => n.id === summary.to);
        if (from >= 0 && to >= from && index >= from && index <= to) throw new Error('该节点属于总括范围，请先移除总括再调整节点层级或位置。');
    }
}
export function setCollapsed(doc: MindmapDoc, id: string, collapsed: boolean): void { required(doc, id).folded = collapsed; }
export function setRelationship(doc: MindmapDoc, from: string, to: string, text: string, id?: string): MindmapRelationship {
    required(doc, from); required(doc, to); if (from === to) throw new Error('请选择两个不同节点');
    const existing = id ? doc.relationships.find(r => r.id === id) : undefined;
    if (id && !existing) throw new Error('关联线不存在');
    if (existing) { existing.from = from; existing.to = to; existing.text = text; return existing; }
    const relationship = { id: uid(), from, to, text }; doc.relationships.push(relationship); return relationship;
}
export function removeRelationship(doc: MindmapDoc, id: string): void { doc.relationships = doc.relationships.filter(r => r.id !== id); }
export function addSummary(doc: MindmapDoc, nodeIds: string[], text = '总括'): MindmapSummary {
    assertLabel(text); const nodes = [...new Set(nodeIds)].map(id => required(doc, id));
    const parent = nodes[0]?.parent;
    if (!parent || nodes.some(n => n.parent !== parent)) throw new Error('总括需要选择同一父节点下的节点');
    const indices = nodes.map(n => parent.children.indexOf(n)).sort((a, b) => a - b);
    if (indices[indices.length - 1] - indices[0] + 1 !== nodes.length) throw new Error('总括需要选择连续的同级节点');
    const summary = { id: uid(), parentId: parent.id, from: parent.children[indices[0]].id, to: parent.children[indices[indices.length - 1]].id, root: createNode({ id: uid(), text, parent: null }) };
    doc.summaries.push(summary); return summary;
}
export function removeSummary(doc: MindmapDoc, id: string): void {
    const summary = doc.summaries.find(s => s.id === id); if (summary) removeNode(doc, summary.root.id);
}
