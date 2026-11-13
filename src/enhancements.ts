import type { Comment } from './commentManager';

export interface CommentFilter {
    markType?: Comment['markType'] | '';
    color?: string;
    orphanOnly?: boolean;
}
export interface FilterPreset { name: string; filter: CommentFilter }
export interface Preferences { filter: CommentFilter; presets: FilterPreset[] }

export function filterComments(comments: Comment[], filter: CommentFilter, defaultColor: string, query = ''): Comment[] {
    const search = query.trim().toLowerCase();
    return comments.filter(c =>
        (!filter.markType || (c.markType || 'highlight') === filter.markType) &&
        (!filter.color || (c.color || defaultColor).toLowerCase() === filter.color.toLowerCase()) &&
        (!filter.orphanOnly || c.isOrphaned) &&
        (!search || `${c.selectedText}\n${c.comment}`.toLowerCase().includes(search))
    );
}

export function navigation(comments: Comment[], active: number | null, step: number) {
    const current = comments.findIndex(c => c.timestamp === active);
    const index = comments.length ? Math.max(0, Math.min(comments.length - 1, current < 0 ? 0 : current + step)) : -1;
    return { index, total: comments.length, timestamp: index < 0 ? null : comments[index].timestamp };
}

export function rebindComment(comment: Comment, text: string, from: number, to: number, hash: string): Comment {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > text.length || from >= to || !text.slice(from, to).trim()) {
        throw new Error('请重新选择有效的原文');
    }
    const position = (offset: number) => {
        const lines = text.slice(0, offset).split('\n');
        return { line: lines.length - 1, ch: lines[lines.length - 1].length };
    };
    const start = position(from), end = position(to), selectedText = text.slice(from, to);
    const stack: { level: number; title: string }[] = [];
    text.split('\n').slice(0, start.line + 1).forEach(line => {
        const match = /^(#{1,6})\s+(.*)$/.exec(line);
        if (!match) return;
        while (stack.length && stack[stack.length - 1].level >= match[1].length) stack.pop();
        stack.push({ level: match[1].length, title: match[2].trim() });
    });
    let occurrenceIndex = 0, cursor = 0;
    while (cursor < from) {
        const found = text.indexOf(selectedText, cursor);
        if (found < 0 || found >= from) break;
        occurrenceIndex++; cursor = found + 1;
    }
    return { ...comment, selectedText, selectedTextHash: hash, startLine: start.line, startChar: start.ch,
        endLine: end.line, endChar: end.ch, absoluteFrom: from, absoluteTo: to, occurrenceIndex,
        headingPath: stack.map(x => x.title), blockHash: undefined,
        contextBefore: text.slice(Math.max(0, from - 50), from), contextAfter: text.slice(to, to + 50), isOrphaned: false };
}

export interface Draft {
    key: string; filePath: string; selectedText: string; from: number; to: number; timestamp?: number;
    commentText: string; color: string; markType: NonNullable<Comment['markType']>; updatedAt: number;
}
export function draftKey(file: string, quote: string, from: number, to: number, timestamp?: number): string {
    return JSON.stringify(timestamp === undefined ? ['new', file, quote, from, to] : ['edit', file, timestamp]);
}
export function restoreComment(target: Comment, snapshot: Comment): void {
    Object.keys(target).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(snapshot, key)) delete (target as unknown as Record<string, unknown>)[key];
    });
    Object.assign(target, snapshot);
}
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export class DraftStore {
    private readonly key: string;
    constructor(private storage: StorageLike, vault: string) { this.key = `side-comments-drafts-v1:${vault}`; }
    list(): Draft[] {
        const raw = this.storage.getItem(this.key);
        if (raw === null) return [];
        const items: unknown = JSON.parse(raw);
        const validDraft = (candidate: unknown) => {
            if (!candidate || typeof candidate !== 'object') return false;
            const d = candidate as Record<string, unknown>;
            return typeof d.key === 'string' && typeof d.filePath === 'string' && typeof d.commentText === 'string' &&
                typeof d.selectedText === 'string' && typeof d.color === 'string' && typeof d.markType === 'string' &&
                ['highlight', 'underline', 'strikethrough', 'bold', 'text-color', 'none'].includes(d.markType) &&
                typeof d.from === 'number' && Number.isFinite(d.from) && typeof d.to === 'number' && Number.isFinite(d.to) &&
                typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt);
        };
        if (!Array.isArray(items) || items.some((d: unknown) => !validDraft(d))) {
            throw new Error('草稿格式异常，已保留原数据');
        }
        return items as Draft[];
    }
    put(draft: Draft) {
        const items = this.list().filter(d => d.key !== draft.key);
        items.push(draft);
        this.storage.setItem(this.key, JSON.stringify(items));
    }
    remove(key: string) { this.storage.setItem(this.key, JSON.stringify(this.list().filter(d => d.key !== key))); }
}
