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
        drag(startLine: number, targetLine: number, ratio: number): boolean;
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
    const info = view.lineBlockAt(target.from);
    const top = view.documentTop + info.top;
    const x = view.coordsAtPos(target.from)?.left ?? 0;
    const clamped = Math.min(0.95, Math.max(0.05, ratio));
    return { x: x + 4, y: top + info.height * clamped };
};
window.drag = (startLine: number, targetLine: number, ratio: number) => {
    const handle = document.querySelector(`.mt-drag-handle[data-mt-block-start="${startLine}"]`);
    const point = window.coords(targetLine, ratio);
    if (!(handle instanceof HTMLElement) || !point || !view) return false;
    const rect = handle.getBoundingClientRect();
    const fire = (target: EventTarget, type: string, x: number, y: number) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 21, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1,
    }));
    fire(handle, 'pointerdown', rect.left + 3, rect.top + 3);
    fire(window, 'pointermove', point.x, point.y);
    fire(window, 'pointerup', point.x, point.y);
    return true;
};
