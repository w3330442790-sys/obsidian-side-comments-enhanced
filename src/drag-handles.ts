/**
 * Drag handles for moving Markdown blocks in the editor.
 *
 * A gutter handle is rendered at every block start in the visible range. Dragging
 * it with a mouse or a finger moves the whole block: the upper/lower third of a
 * target line reorders, the middle nests the block under a heading or list item.
 *
 * The transaction carries `blockMoveEffect`, so the annotation highlight plugin
 * can skip its generic change mapping and let the owner re-anchor annotation
 * ranges deterministically from the move plan.
 */
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, type Extension, type RangeSet } from '@codemirror/state';
import { BlockIndex, planBlockMove, type DocBlock, type DropMode, type MovePlan } from './block-drag';

export interface BlockDragOptions {
    /** Only the main Markdown editor of a note should expose handles. */
    isEnabled(view: EditorView): boolean;
    /** Called after the move transaction was applied. */
    onMove(plan: MovePlan, view: EditorView): void;
    onMessage?(message: string, view: EditorView): void;
}

export const blockMoveEffect = StateEffect.define<MovePlan>();

/** Applies a planned move as one undoable transaction. */
export function dispatchBlockMove(view: EditorView, plan: MovePlan): void {
    view.dispatch({
        changes: plan.edits,
        selection: { anchor: plan.newStart },
        effects: blockMoveEffect.of(plan),
        scrollIntoView: true,
    });
}

class SnapshotCache {
    private doc: unknown = null;
    private index: BlockIndex | null = null;
    get(view: EditorView): BlockIndex {
        if (this.doc !== view.state.doc || !this.index) {
            this.doc = view.state.doc;
            this.index = new BlockIndex(view.state.doc.toString());
        }
        return this.index;
    }
}

class DragHandle extends GutterMarker {
    constructor(
        private readonly view: EditorView,
        private readonly block: DocBlock,
        private readonly options: BlockDragOptions,
        private readonly cache: SnapshotCache,
    ) { super(); }

    eq(other: GutterMarker): boolean {
        return other instanceof DragHandle
            && other.block.startLine === this.block.startLine
            && other.block.endLine === this.block.endLine;
    }

    toDOM(): HTMLElement {
        const handle = createDiv();
        handle.className = 'mt-drag-handle';
        handle.dataset.mtBlockStart = String(this.block.startLine);
        handle.setAttribute('role', 'button');
        handle.setAttribute('aria-label', `拖动以移动这段内容：${this.block.kind === 'heading' ? '标题' : '内容'}`);
        handle.title = '拖动移动此段，拖到标题或列表项中间可调整层级';
        handle.textContent = '⠿';
        handle.addEventListener('pointerdown', event => {
            const block = this.cache.get(this.view).at(this.block.startLine);
            if (block.startLine === this.block.startLine) startDrag(this.view, block, event, this.options, this.cache);
        });
        return handle;
    }
}

function buildMarkers(view: EditorView, options: BlockDragOptions, cache: SnapshotCache): RangeSet<GutterMarker> {
    const builder = new RangeSetBuilder<GutterMarker>();
    if (!options.isEnabled(view)) return builder.finish();
    const index = cache.get(view);
    const doc = view.state.doc;
    let lineNumber = doc.lineAt(view.visibleRanges[0]?.from ?? 0).number;
    const lastLine = doc.lineAt(view.visibleRanges[view.visibleRanges.length - 1]?.to ?? doc.length).number;
    while (lineNumber <= lastLine && lineNumber <= doc.lines) {
        const block = index.at(lineNumber - 1);
        if (block.startLine === lineNumber - 1 && block.kind !== 'other') {
            const from = doc.line(lineNumber).from;
            builder.add(from, from, new DragHandle(view, block, options, cache));
        }
        lineNumber = block.kind === 'code' || block.kind === 'table' ? Math.max(lineNumber + 1, block.endLine + 2) : lineNumber + 1;
    }
    return builder.finish();
}

interface DragSession {
    view: EditorView;
    block: DocBlock;
    indicator: HTMLElement;
    target: { block: DocBlock; mode: DropMode } | null;
    pointerId: number;
}

function startDrag(view: EditorView, block: DocBlock, event: PointerEvent, options: BlockDragOptions, cache: SnapshotCache): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    if (view.composing) return;

    const indicator = createDiv();
    indicator.className = 'mt-drop-indicator';
    indicator.hidden = true;
    view.dom.appendChild(indicator);
    view.dom.classList.add('mt-drag-active');
    document.body.classList.add('mt-drag-cursor');

    const session: DragSession = { view, block, indicator, target: null, pointerId: event.pointerId };
    let pointerX = event.clientX;
    let pointerY = event.clientY;
    let frame = 0;

    const update = () => {
        frame = 0;
        const target = resolveTarget(view, block, pointerX, pointerY, cache);
        session.target = target;
        if (!target) {
            indicator.hidden = true;
            return;
        }
        positionIndicator(view, indicator, target);
        autoscroll(view, pointerY);
    };

    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };

    const pointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== session.pointerId) return;
        pointerX = moveEvent.clientX;
        pointerY = moveEvent.clientY;
        moveEvent.preventDefault();
        schedule();
    };

    const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', pointerMove, true);
        window.removeEventListener('pointerup', pointerUp, true);
        window.removeEventListener('pointercancel', pointerCancel, true);
        window.removeEventListener('keydown', keyDown, true);
        if (frame) cancelAnimationFrame(frame);
        indicator.remove();
        view.dom.classList.remove('mt-drag-active');
        document.body.classList.remove('mt-drag-cursor');
        if (!commit) return;
        // Recompute from the last pointer position: the final move may not have
        // reached the next animation frame before the pointer was released.
        const target = resolveTarget(view, block, pointerX, pointerY, cache);
        if (!target) return;
        const index = cache.get(view);
        const moving = index.at(block.startLine);
        const plan = planBlockMove(view.state.doc.toString(), moving, index.at(target.block.startLine), target.mode);
        if (!plan) {
            options.onMessage?.('新的位置与当前位置相同。', view);
            return;
        }
        dispatchBlockMove(view, plan);
        options.onMove(plan, view);
        view.focus();
    };

    const pointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== session.pointerId) return;
        upEvent.preventDefault();
        finish(true);
    };
    const pointerCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== session.pointerId) return;
        finish(false);
    };
    const keyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== 'Escape') return;
        keyEvent.preventDefault();
        finish(false);
    };

    window.addEventListener('pointermove', pointerMove, true);
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('pointercancel', pointerCancel, true);
    window.addEventListener('keydown', keyDown, true);
    update();
}

function resolveTarget(view: EditorView, block: DocBlock, x: number, y: number, cache: SnapshotCache): { block: DocBlock; mode: DropMode } | null {
    const doc = view.state.doc;
    // Resolve the target line from the vertical position only. posAtCoords needs the
    // pointer to be inside the content box, which is brittle at the very top edge of
    // a note or when a line is padded differently across platforms.
    const position = view.posAtCoords({ x, y });
    let lineNumber: number;
    if (position !== null && position >= 0) {
        lineNumber = doc.lineAt(position).number;
    } else {
        lineNumber = doc.lineAt(view.lineBlockAtHeight(y - view.documentTop).from).number;
    }
    const target = cache.get(view).at(lineNumber - 1);
    if (target.kind === 'other') return null;
    if (target.startLine >= block.startLine && target.startLine <= block.endLine) return null;
    const coords = view.coordsAtPos(doc.line(lineNumber).from);
    if (!coords) return null;
    const height = Math.max(6, coords.bottom - coords.top);
    const ratio = (y - coords.top) / height;
    let mode: DropMode = ratio < 0.32 ? 'before' : ratio > 0.68 ? 'after' : 'child';
    if (mode === 'child' && target.kind !== 'heading' && target.kind !== 'list') mode = ratio < 0.5 ? 'before' : 'after';
    return { block: target, mode };
}

function positionIndicator(view: EditorView, indicator: HTMLElement, target: { block: DocBlock; mode: DropMode }): void {
    const doc = view.state.doc;
    const host = view.dom.getBoundingClientRect();
    const startLine = doc.line(target.block.startLine + 1);
    const endLine = doc.line(Math.min(doc.lines, target.block.endLine + 1));
    const coords = view.coordsAtPos(target.mode === 'before' ? startLine.from : endLine.to);
    if (!coords) { indicator.hidden = true; return; }
    const textStart = view.coordsAtPos(startLine.from);
    indicator.hidden = false;
    indicator.className = `mt-drop-indicator mt-drop-${target.mode}`;
    indicator.style.top = `${(target.mode === 'before' ? coords.top : coords.bottom) - host.top}px`;
    indicator.style.left = target.mode === 'child' ? `${Math.max(0, (textStart?.left ?? host.left) - host.left + 18)}px` : '0px';
}

function autoscroll(view: EditorView, y: number): void {
    const scroller = view.scrollDOM;
    const bounds = scroller.getBoundingClientRect();
    if (y < bounds.top + 40) scroller.scrollTop -= 16;
    else if (y > bounds.bottom - 40) scroller.scrollTop += 16;
}

export function blockDragExtension(options: BlockDragOptions): Extension {
    const cache = new SnapshotCache();
    return gutter({
        class: 'mt-drag-gutter',
        markers: view => buildMarkers(view, options, cache),
    });
}
