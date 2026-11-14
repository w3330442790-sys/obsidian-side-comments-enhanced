import type { MarkdownView } from 'obsidian';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

/** Class on the Markdown view container while clozes are hidden. */
export const CLOZE_HIDDEN_CLASS = 'mt-cloze-hidden';
/** Class applied to `==highlight==` content in the CodeMirror editor. */
export const CLOZE_MARK_CLASS = 'mt-cloze';

export interface ClozeRange {
    from: number;
    to: number;
}

function insideInlineCode(line: string, index: number): boolean {
    let ticks = 0;
    for (let i = 0; i < index; i++) if (line[i] === '`') ticks++;
    return ticks % 2 === 1;
}

/**
 * Find the content ranges of `==...==` highlights while ignoring fenced code
 * blocks and inline code. The markers themselves stay editable; only the text
 * between them is decorated as a cloze.
 */
export function findClozeRanges(text: string): ClozeRange[] {
    const ranges: ClozeRange[] = [];
    let offset = 0;
    let fenced: string | null = null;
    for (const line of text.split('\n')) {
        const trimmed = line.trimStart();
        const fence = /^(`{3,}|~{3,})/.exec(trimmed);
        if (fenced) {
            if (fence && fence[1][0] === fenced[0] && fence[1].length >= fenced.length) fenced = null;
            offset += line.length + 1;
            continue;
        }
        if (fence) {
            fenced = fence[1];
            offset += line.length + 1;
            continue;
        }
        const pattern = /(?<!=)==(?!=)([^=\n]+?)(?<!=)==(?!=)/g;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
            const start = match.index + 2;
            const end = start + match[1].length;
            if (line[match.index - 1] === '\\' || insideInlineCode(line, match.index)) continue;
            if (end > start) ranges.push({ from: offset + start, to: offset + end });
        }
        offset += line.length + 1;
    }
    return ranges;
}

function buildClozeDecorations(view: EditorView): DecorationSet {
    return Decoration.set(
        findClozeRanges(view.state.doc.toString()).map(range =>
            Decoration.mark({ class: CLOZE_MARK_CLASS }).range(range.from, range.to)),
        true,
    );
}

/** CodeMirror extension that tags every `==...==` content range. */
export function createClozeExtension() {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildClozeDecorations(view);
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.viewportChanged) this.decorations = buildClozeDecorations(update.view);
        }
    }, {
        decorations: value => value.decorations,
    });
}

export function isClozeHidden(view: MarkdownView): boolean {
    return view.containerEl.classList.contains(CLOZE_HIDDEN_CLASS);
}

export function setClozeHidden(view: MarkdownView, hidden: boolean): void {
    view.containerEl.classList.toggle(CLOZE_HIDDEN_CLASS, hidden);
}

/** Toggle the view-level cloze mask and return the new hidden state. */
export function toggleCloze(view: MarkdownView): boolean {
    const next = !isClozeHidden(view);
    setClozeHidden(view, next);
    return next;
}
