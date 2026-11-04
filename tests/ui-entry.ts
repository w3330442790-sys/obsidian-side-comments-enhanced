import SideNote, { SideNoteView, CommentModal } from '../artifacts/main-test';
import { CommentManager } from '../src/commentManager';
import { DraftStore } from '../src/enhancements';
import { TFile, MarkdownView, Platform } from 'obsidian';

const w = window as any;
w.notices = [];
w.setup = async (mobile = false) => {
    document.body.replaceChildren(); document.body.className = mobile ? 'is-mobile' : '';
    (Platform as any).isMobile = mobile;
    const files = new Map<string, string>(); const writes: string[] = [];
    const note = new TFile('note.md');
    const text = '# 章节\n甲方证 原文\n乙方证\n新选原文';
    let from = 5, to = 8;
    const editor: any = { getValue: () => text, getSelection: () => text.slice(from, to), getCursor: (which: string) => {
        const offset = which === 'from' ? from : to; const lines = text.slice(0, offset).split('\n'); return { line: lines.length - 1, ch: lines.at(-1)!.length };
    }, posToOffset: (p: any) => text.split('\n').slice(0, p.line).reduce((n, line) => n + line.length + 1, 0) + p.ch,
    setSelection: () => {}, scrollIntoView: () => {}, focus: () => {} };
    const markdownView = new MarkdownView(); markdownView.file = note; markdownView.editor = editor;
    const sourceLeaf: any = { view: markdownView, openFile: async () => {} };
    const app: any = { vault: { configDir: '.obsidian', getName: () => 'synthetic', getAbstractFileByPath: (path: string) => path === 'note.md' ? note : null,
        read: async () => text, createFolder: async () => {}, adapter: { exists: async (p: string) => p === 'side-note-data' || files.has(p),
            read: async (p: string) => { if (!files.has(p)) throw Error('missing'); return files.get(p); },
            write: async (p: string, data: string) => { if (w.failWrite) throw Error('simulated disk failure'); writes.push(p); files.set(p, data); },
            list: async (p: string) => ({ files: Array.from(files.keys()).filter(x => x.startsWith(p + '/')), folders: [] }), remove: async (p: string) => { files.delete(p); } } },
        workspace: { getActiveFile: () => note, getLeaf: () => sourceLeaf, iterateAllLeaves: (fn: any) => { fn(sourceLeaf); },
            getLeavesOfType: () => [{ view: w.view }], setActiveLeaf: () => {}, revealLeaf: async () => {} } };
    const plugin: any = new SideNote(app, { id: 'side-comments-origin' });
    plugin.settings = { commentSortOrder: 'position', highlightColor: '#FFC800', highlightOpacity: .2, commentsDataFolder: 'side-note-data', markdownFolder: 'side-note-comments' };
    const c = (n: number, overrides: any = {}) => ({ filePath: 'note.md', selectedText: n === 1 ? '甲方证' : '乙方证', comment: `批注${n}`, timestamp: n,
        selectedTextHash: 'hash', startLine: n, startChar: 0, endLine: n, endChar: 3, color: '#ec4899', markType: 'underline', ...overrides });
    plugin.comments = [c(1, { absoluteFrom: 5, absoluteTo: 8 }), c(2), c(3, { markType: 'highlight', color: '#f59e0b', isOrphaned: true }), c(4, { markType: undefined, color: undefined })];
    plugin.commentManager = new CommentManager(plugin.comments);
    plugin.drafts = new DraftStore(localStorage, 'synthetic');
    plugin.refreshEditorDecorations = () => {}; plugin.scheduleRenderedTableHighlights = () => {};
    plugin.renderCommentContent = async (content: string, el: HTMLElement) => { await Promise.resolve(); el.textContent = content; };
    w.plugin = plugin; w.files = files; w.writes = writes; w.editor = editor; w.setSelection = (a: number, b: number) => { from = a; to = b; }; w.noteText = text;
    w.view = new SideNoteView({ app } as any, plugin, note);
    const jump = w.view.jumpToComment.bind(w.view);
    w.view.jumpToComment = async (comment: any) => { w.lastJump = comment.timestamp; };
    w.realJump = jump;
    w.view.renderView();
    w.openEdit = (index = 0) => { w.modal = new CommentModal(app, plugin, { mode: 'edit', comment: plugin.comments[index] }); w.modal.open(); };
    w.openAdd = (start = 5, selectedText = '甲方证') => { w.modal = new CommentModal(app, plugin, { mode: 'add', filePath: 'note.md', selectedText, anchorFrom: start, anchorTo: start + selectedText.length, onSubmitAdd: async (body: string, color: string, markType: any) => plugin.addComment(c(100 + start, { selectedText, comment: body, color, markType })) }); w.modal.open(); };
};
