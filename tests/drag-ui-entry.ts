import { EditorView } from '@codemirror/view';
import { blockDragExtension } from '../src/drag-handles';
import type { MovePlan } from '../src/block-drag';

declare global {
    interface Window {
        setup(doc: string): void;
        doc(): string;
        moves: MovePlan[];
        lastMessage: string | null;
        coords(line: number, ratio: number): { x: number; y: number } | null;
        handleCount(): number;
    }
}

let view: EditorView | null = null;

window.setup = (doc: string) => {
    window.moves = [];
    window.lastMessage = null;
    view?.destroy();
    const host = document.getElementById('host');
    if (!host) throw new Error('missing host');
    host.replaceChildren();
    view = new EditorView({
        doc,
        parent: host,
        extensions: [blockDragExtension({
            isEnabled: () => true,
            onMove: plan => { window.moves.push(plan); },
            onMessage: message => { window.lastMessage = message; },
        })],
    });
};

window.doc = () => view?.state.doc.toString() ?? '';
window.handleCount = () => document.querySelectorAll('.mt-drag-handle').length;
window.coords = (line: number, ratio: number) => {
    if (!view) return null;
    const target = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
    const coords = view.coordsAtPos(target.from);
    if (!coords) return null;
    return { x: coords.left + 4, y: coords.top + (coords.bottom - coords.top) * ratio };
};
