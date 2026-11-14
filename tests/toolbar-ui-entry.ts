import { EditorView } from '@codemirror/view';
import { mountMarkdownToolbar } from '../src/markdown-toolbar';

declare global {
    interface Window {
        setup(): void;
        doc(): string;
        select(from: number, to: number): void;
        setMode(mode: string): void;
        selection(): { from: number; to: number } | null;
        notices: string[];
        calls: string[];
        clozeHidden(): boolean;
    }
}

let view: EditorView | null = null;
let mode = 'source';
let dispose: (() => void) | null = null;

window.notices = [];
window.calls = [];
window.setup = () => {
    dispose?.();
    window.notices = [];
    window.calls = [];
    mode = 'source';
    view?.destroy();
    const host = document.getElementById('host');
    if (!host) throw new Error('missing host');
    host.replaceChildren();
    const containerEl = document.createElement('div');
    containerEl.className = 'view-container';
    const content = document.createElement('div');
    content.className = 'view-content';
    containerEl.appendChild(content);
    host.appendChild(containerEl);
    view = new EditorView({ doc: 'hello world', parent: content });
    const fakeView = {
        containerEl,
        editor: {
            cm: view,
            focus: () => view?.focus(),
            undo: () => window.calls.push('undo'),
            redo: () => window.calls.push('redo'),
        },
        getMode: () => mode,
        showSearch: (replace: boolean) => window.calls.push(`search:${replace}`),
    };
    dispose = mountMarkdownToolbar(fakeView as never, { onNotice: message => window.notices.push(message) });
    window.clozeHidden = () => containerEl.classList.contains('mt-cloze-hidden');
};

window.doc = () => view?.state.doc.toString() ?? '';
window.select = (from: number, to: number) => {
    if (!view) return;
    view.dispatch({ selection: { anchor: from, head: to } });
    view.focus();
};
window.setMode = (next: string) => { mode = next; };
window.selection = () => {
    if (!view) return null;
    const main = view.state.selection.main;
    return { from: main.from, to: main.to };
};
