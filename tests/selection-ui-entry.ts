import SideNote from '../src/main';
import { CommentManager } from '../src/commentManager';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { MarkdownView, TFile } from 'obsidian';

const w = window as any;
w.notices = [];
w.selectionSetup = (auto = true) => {
    w.selectionCM?.destroy();
    document.body.replaceChildren();
    const note = new TFile('selection.md');
    const markdown = new MarkdownView(); markdown.file = note;
    const leaf = { view: markdown };
    const app: any = { workspace: { getActiveFile: () => note, iterateAllLeaves: (fn: any) => fn(leaf), getLeavesOfType: () => [] } };
    const plugin: any = new SideNote(app, { id: 'side-comments-origin' });
    plugin.settings = { enableSelectionToolbar: auto, highlightColor: '#ffc800', highlightOpacity: .2 };
    plugin.comments = [{ filePath: note.path, selectedText: '重点原文', comment: '保留批注正文', timestamp: 123, selectedTextHash: 'hash', absoluteFrom: 0, absoluteTo: 4, startLine: 0, startChar: 0, endLine: 0, endChar: 4, markType: 'highlight', color: '#ffc800' }];
    plugin.commentManager = new CommentManager(plugin.comments);
    plugin.editComment = async (timestamp: number, body: string, color: string, type: any) => {
        plugin.commentManager.editComment(timestamp, body, color, type);
        plugin.hideSelectionToolbars();
    };
    const cm = new EditorView({ parent: document.body, state: EditorState.create({ doc: '重点原文 后续内容', extensions: [plugin.createSelectionToolbarPlugin()] }) });
    markdown.containerEl.appendChild(cm.dom); document.body.appendChild(markdown.containerEl);
    markdown.editor = { cm, getValue: () => cm.state.doc.toString() } as any;
    cm.focus(); cm.dispatch({ selection: { anchor: 0, head: 4 } });
    w.selectionPlugin = plugin; w.selectionCM = cm;
    w.openSelectionTools = () => plugin.openSelectionToolbar(markdown.editor);
};
