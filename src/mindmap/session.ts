import { parseDocument, serializeDocument, type MindmapDoc } from './model';

export class MindmapHistory {
    doc: MindmapDoc;
    text: string;
    private past: string[] = [];
    private future: string[] = [];
    constructor(source: string, private readonly title = '思维导图') { this.text = source; this.doc = parseDocument(source, title); }
    get canUndo(): boolean { return this.past.length > 0; }
    get canRedo(): boolean { return this.future.length > 0; }
    edit(change: (doc: MindmapDoc) => void): boolean {
        // Parse a persisted snapshot to keep mutations atomic and identities stable.
        const before = this.text;
        const candidate = parseDocument(serializeDocument(this.doc), this.title);
        change(candidate);
        const after = serializeDocument(candidate);
        if (after === before) return false;
        this.past.push(before); if (this.past.length > 100) this.past.shift();
        this.future = []; this.text = after; this.doc = parseDocument(after, this.title); return true;
    }
    undo(): boolean {
        const previous = this.past.pop(); if (previous === undefined) return false;
        this.future.push(this.text); this.text = previous; this.doc = parseDocument(previous, this.title); return true;
    }
    redo(): boolean {
        const next = this.future.pop(); if (next === undefined) return false;
        this.past.push(this.text); this.text = next; this.doc = parseDocument(next, this.title); return true;
    }
    reset(source: string): void { const doc = parseDocument(source, this.title); this.text = source; this.doc = doc; this.past = []; this.future = []; }
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
class ConflictError extends Error {}
/** Writer must apply the transform atomically, e.g. Obsidian Vault.process. */
export class SnapshotSession {
    baseline: string;
    pending: string | undefined;
    status: SaveStatus = 'saved';
    error: string | undefined;
    lastExternal: string | undefined;
    private active: Promise<boolean> | undefined;
    private writing: string | undefined;
    private externalRevision = 0;
    constructor(initial: string, private readonly process: (transform: (disk: string) => string) => Promise<string | void>) { this.baseline = initial; }
    get recoveryText(): string { return this.pending ?? this.baseline; }
    update(text: string): void {
        this.pending = text === this.baseline && !this.active ? undefined : text;
        if (this.status !== 'conflict' && !this.active) { this.status = this.pending === undefined ? 'saved' : 'dirty'; this.error = undefined; }
    }
    acceptExternal(text: string): boolean {
        if (text === this.baseline || text === this.writing) return true;
        this.lastExternal = text;
        this.externalRevision++;
        if (this.pending !== undefined) { this.status = 'conflict'; this.error = '文件已在其他位置修改，本地内容仍保留。'; return false; }
        this.baseline = text; this.status = 'saved'; this.error = undefined; return true;
    }
    rejectExternal(text: string, localText = this.recoveryText): void {
        this.lastExternal = text; this.pending = localText; this.externalRevision++;
        this.status = 'conflict'; this.error = '外部文件无法安全解析，已停止写入并保留本地内容。';
    }
    discardAndReload(text: string): void {
        if (this.active) throw new Error('正在保存，请等待保存结束后再读取磁盘版本。');
        this.baseline = text; this.pending = undefined; this.status = 'saved'; this.error = undefined; this.lastExternal = undefined;
        this.externalRevision++;
    }
    async flush(): Promise<boolean> {
        if (this.status === 'conflict') return false;
        while (this.active || this.pending !== undefined) {
            if (!await this.save()) return false;
        }
        return true;
    }
    save(): Promise<boolean> {
        if (this.active) return this.active;
        if (this.pending === undefined) return Promise.resolve(true);
        const source = this.pending, baseline = this.baseline, revision = this.externalRevision;
        this.status = 'saving'; this.error = undefined; this.writing = source;
        const task = (async () => {
            try {
                await this.process(disk => {
                    if (disk !== baseline && disk !== source) { this.lastExternal = disk; throw new ConflictError('文件已在其他位置修改，未覆盖磁盘内容。'); }
                    return source;
                });
                if (revision !== this.externalRevision) {
                    this.status = 'conflict'; this.error = '保存期间文件又被修改，本地内容仍保留。'; return false;
                }
                this.baseline = source;
                if (this.pending === source) this.pending = undefined;
                this.status = this.pending === undefined ? 'saved' : 'dirty'; return true;
            } catch (error) {
                this.status = error instanceof ConflictError ? 'conflict' : 'error';
                this.error = error instanceof Error ? error.message : String(error); return false;
            } finally { this.active = undefined; this.writing = undefined; }
        })();
        this.active = task; return task;
    }
}
