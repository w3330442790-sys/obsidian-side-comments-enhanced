import { Editor, MarkdownView, Notice, setIcon } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export type MarkdownCommand =
    | 'bold' | 'italic' | 'strikethrough' | 'highlight' | 'inline-code'
    | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    | 'quote' | 'bullet-list' | 'number-list' | 'task-list' | 'code-block'
    | 'link' | 'table' | 'divider' | 'clear-marks';

export interface TextChange { from: number; to: number; insert: string }
export interface CommandPlan { changes: TextChange[]; anchor: number; head: number }

interface ToolbarEntry { command: MarkdownCommand; label: string; group: 'text' | 'block' | 'insert' }
interface LineInfo { start: number; end: number; text: string }

/** Toolbar metadata; the fixed toolbar renders these entries in order. */
export const MARKDOWN_TOOLBAR_COMMANDS: ToolbarEntry[] = [
    { command: 'bold', label: '加粗', group: 'text' },
    { command: 'italic', label: '斜体', group: 'text' },
    { command: 'strikethrough', label: '删除线', group: 'text' },
    { command: 'highlight', label: '高亮', group: 'text' },
    { command: 'inline-code', label: '行内代码', group: 'text' },
    { command: 'h1', label: 'H1', group: 'block' },
    { command: 'h2', label: 'H2', group: 'block' },
    { command: 'h3', label: 'H3', group: 'block' },
    { command: 'quote', label: '引用', group: 'block' },
    { command: 'bullet-list', label: '无序列表', group: 'block' },
    { command: 'number-list', label: '有序列表', group: 'block' },
    { command: 'task-list', label: '任务清单', group: 'block' },
    { command: 'code-block', label: '代码块', group: 'block' },
    { command: 'link', label: '链接', group: 'insert' },
    { command: 'table', label: '表格', group: 'insert' },
    { command: 'divider', label: '分割线', group: 'insert' },
    { command: 'clear-marks', label: '清除标记', group: 'insert' },
];

const TOOLBAR_ICONS: Partial<Record<MarkdownCommand, string>> = {
    bold: 'bold',
    italic: 'italic',
    strikethrough: 'strikethrough',
    highlight: 'highlighter',
    'inline-code': 'code',
    quote: 'quote',
    'bullet-list': 'list',
    'number-list': 'list-ordered',
    'task-list': 'list-checks',
    'code-block': 'square-code',
    link: 'link',
    table: 'table',
    divider: 'minus',
    'clear-marks': 'eraser',
};

// --- Shared helpers -------------------------------------------------------

function clampPosition(value: number, max: number): number {
    if (!Number.isFinite(value)) return value > 0 ? max : 0;
    return Math.max(0, Math.min(max, Math.round(value)));
}

function normalizeRange(text: string, from: number, to: number): { from: number; to: number } {
    const start = clampPosition(from, text.length);
    const end = clampPosition(to, text.length);
    return end < start ? { from: end, to: start } : { from: start, to: end };
}

function lineStartOf(text: string, position: number): number {
    // lastIndexOf would treat a negative index as 0, so guard position 0 explicitly.
    if (position <= 0) return 0;
    return text.lastIndexOf('\n', position - 1) + 1;
}

function lineEndOf(text: string, position: number): number {
    const newline = text.indexOf('\n', position);
    return newline === -1 ? text.length : newline;
}

/** Every line touched by the selection, without the trailing newline characters. */
function touchedLines(text: string, from: number, to: number): LineInfo[] {
    const first = lineStartOf(text, from);
    const last = lineEndOf(text, to);
    const lines: LineInfo[] = [];
    let start = first;
    while (start <= last) {
        const newline = text.indexOf('\n', start);
        const end = newline === -1 || newline > last ? last : newline;
        lines.push({ start, end, text: text.slice(start, end) });
        if (end >= last) break;
        start = end + 1;
    }
    // A selection ending at EOF should not also format the empty line after its final newline.
    if (from < to && to === text.length && text.endsWith('\n') && lines.length > 1) lines.pop();
    return lines;
}

/** Map a position in the original text through non-overlapping changes. */
function mapPosition(position: number, changes: TextChange[]): number {
    let shift = 0;
    for (const change of changes) {
        const removed = change.to - change.from;
        if (change.to <= position) {
            shift += change.insert.length - removed;
        } else if (change.from < position) {
            shift += change.insert.length - (position - change.from);
        }
    }
    return position + shift;
}

function planLength(text: string, changes: TextChange[]): number {
    return Math.max(0, changes.reduce(
        (length, change) => length + change.insert.length - (change.to - change.from),
        text.length,
    ));
}

function finalize(text: string, changes: TextChange[], anchor: number, head: number): CommandPlan {
    const sorted = changes
        .filter(change => change.to > change.from || change.insert.length > 0)
        .sort((left, right) => left.from - right.from || left.to - right.to);
    const length = planLength(text, sorted);
    const start = clampPosition(anchor, length);
    const end = clampPosition(head, length);
    return {
        changes: sorted,
        anchor: Math.min(start, end),
        head: Math.max(start, end),
    };
}

function indentLength(line: string): number {
    const match = /^ {0,3}/.exec(line);
    return match ? match[0].length : 0;
}

// --- Inline wrappers ------------------------------------------------------

function planWrap(text: string, from: number, to: number, mark: string): CommandPlan {
    const size = mark.length;
    if (from === to) {
        return finalize(text, [{ from, to, insert: mark + mark }], from + size, from + size);
    }
    // Marks sit immediately outside the selection.
    if (from >= size && to + size <= text.length
        && text.slice(from - size, from) === mark && text.slice(to, to + size) === mark) {
        const changes: TextChange[] = [
            { from: from - size, to: from, insert: '' },
            { from: to, to: to + size, insert: '' },
        ];
        return finalize(text, changes, from - size, to - size);
    }
    // Marks are part of the selection.
    if (to - from >= size * 2 && text.slice(from, from + size) === mark && text.slice(to - size, to) === mark) {
        const changes: TextChange[] = [
            { from, to: from + size, insert: '' },
            { from: to - size, to, insert: '' },
        ];
        return finalize(text, changes, from, to - size * 2);
    }
    const changes: TextChange[] = [
        { from, to: from, insert: mark },
        { from: to, to, insert: mark },
    ];
    return finalize(text, changes, from + size, to + size);
}

// --- Block prefixes -------------------------------------------------------

const HEADING_MARKER = /^( {0,3})(#{1,6}) /;
const LIST_MARKER = /^( {0,3})([-*+] |\d+\. )/;
const BULLET_MARKER = /^( {0,3})- /;
const ORDERED_MARKER = /^( {0,3})\d+\. /;
const TASK_MARKER = /^( {0,3})(- \[[ xX]\] )/;

function planHeading(text: string, from: number, to: number, level: number): CommandPlan {
    const lines = touchedLines(text, from, to);
    const target = `${'#'.repeat(level)} `;
    const nonEmpty = lines.filter(line => line.text.trim().length > 0);
    const toggleOff = nonEmpty.length > 0
        && nonEmpty.every(line => {
            const match = HEADING_MARKER.exec(line.text);
            return match !== null && match[2].length === level;
        });
    const changes: TextChange[] = [];
    for (const line of lines) {
        const match = HEADING_MARKER.exec(line.text);
        if (toggleOff) {
            if (match) changes.push({ from: line.start + match[1].length, to: line.start + match[0].length, insert: '' });
            continue;
        }
        if (!line.text.trim()) {
            const indent = indentLength(line.text);
            changes.push({ from: line.start + indent, to: line.start + indent, insert: target });
            continue;
        }
        if (match) {
            if (match[2].length !== level) {
                changes.push({ from: line.start + match[1].length, to: line.start + match[0].length, insert: target });
            }
        } else {
            const indent = indentLength(line.text);
            changes.push({ from: line.start + indent, to: line.start + indent, insert: target });
        }
    }
    return finalize(text, changes, mapPosition(from, changes), mapPosition(to, changes));
}

function planQuote(text: string, from: number, to: number): CommandPlan {
    const lines = touchedLines(text, from, to);
    const toggleOff = lines.length > 0 && lines.every(line => line.text.startsWith('> '));
    const changes: TextChange[] = lines.map(line => toggleOff
        ? { from: line.start, to: line.start + 2, insert: '' }
        : { from: line.start, to: line.start, insert: '> ' });
    return finalize(text, changes, mapPosition(from, changes), mapPosition(to, changes));
}

function planBulletList(text: string, from: number, to: number): CommandPlan {
    const lines = touchedLines(text, from, to);
    const toggleOff = lines.length > 0 && lines.every(line => BULLET_MARKER.test(line.text));
    const changes: TextChange[] = [];
    for (const line of lines) {
        const indent = indentLength(line.text);
        if (toggleOff) {
            changes.push({ from: line.start + indent, to: line.start + indent + 2, insert: '' });
            continue;
        }
        const match = LIST_MARKER.exec(line.text);
        if (!match) {
            changes.push({ from: line.start + indent, to: line.start + indent, insert: '- ' });
            continue;
        }
        if (match[0].slice(match[1].length) !== '- ') {
            changes.push({ from: line.start + match[1].length, to: line.start + match[0].length, insert: '- ' });
        }
    }
    return finalize(text, changes, mapPosition(from, changes), mapPosition(to, changes));
}

function planNumberList(text: string, from: number, to: number): CommandPlan {
    const lines = touchedLines(text, from, to);
    const toggleOff = lines.length > 0 && lines.every(line => ORDERED_MARKER.test(line.text));
    const changes: TextChange[] = [];
    lines.forEach((line, index) => {
        const match = LIST_MARKER.exec(line.text);
        if (toggleOff) {
            if (match) changes.push({ from: line.start + match[1].length, to: line.start + match[0].length, insert: '' });
            return;
        }
        const target = `${index + 1}. `;
        if (!match) {
            const indent = indentLength(line.text);
            changes.push({ from: line.start + indent, to: line.start + indent, insert: target });
        } else if (match[0].slice(match[1].length) !== target) {
            changes.push({ from: line.start + match[1].length, to: line.start + match[0].length, insert: target });
        }
    });
    return finalize(text, changes, mapPosition(from, changes), mapPosition(to, changes));
}

function planTaskList(text: string, from: number, to: number): CommandPlan {
    const lines = touchedLines(text, from, to);
    const toggleOff = lines.length > 0 && lines.every(line => TASK_MARKER.test(line.text));
    const changes: TextChange[] = [];
    for (const line of lines) {
        const task = TASK_MARKER.exec(line.text);
        if (toggleOff) {
            if (task) changes.push({ from: line.start + task[1].length, to: line.start + task[0].length, insert: '' });
            continue;
        }
        if (task) continue; // Keep checked state when a selection has mixed markers.
        const list = LIST_MARKER.exec(line.text);
        if (list) {
            changes.push({ from: line.start + list[1].length, to: line.start + list[0].length, insert: '- [ ] ' });
        } else {
            const indent = indentLength(line.text);
            changes.push({ from: line.start + indent, to: line.start + indent, insert: '- [ ] ' });
        }
    }
    return finalize(text, changes, mapPosition(from, changes), mapPosition(to, changes));
}

// --- Fenced code blocks ---------------------------------------------------

const FENCE_OPEN = /^ {0,3}```[A-Za-z0-9_+.-]*$/;
const FENCE_CLOSE = /^ {0,3}```\s*$/;

function previousContentLine(text: string, before: number): LineInfo | null {
    let cursor = lineStartOf(text, before);
    while (cursor > 0) {
        const end = cursor - 1;
        const start = lineStartOf(text, end);
        const line = text.slice(start, end);
        if (line.trim().length > 0) return { start, end, text: line };
        cursor = start;
    }
    return null;
}

function nextContentLine(text: string, after: number): LineInfo | null {
    let cursor = lineEndOf(text, after) + 1;
    while (cursor <= text.length) {
        const end = lineEndOf(text, cursor);
        const line = text.slice(cursor, end);
        if (line.trim().length > 0) return { start: cursor, end, text: line };
        if (end >= text.length) break;
        cursor = end + 1;
    }
    return null;
}

function planCodeBlock(text: string, from: number, to: number): CommandPlan {
    if (from === to) {
        const before = from > 0 && text[from - 1] !== '\n' ? '\n' : '';
        const after = from < text.length && text[from] !== '\n' ? '\n' : '';
        const insert = `${before}\`\`\`\n\n\`\`\`${after}`;
        const cursor = from + before.length + 4;
        return finalize(text, [{ from, to: from, insert }], cursor, cursor);
    }
    const blockStart = lineStartOf(text, from);
    const blockEnd = lineEndOf(text, to);
    const previous = previousContentLine(text, blockStart);
    const next = nextContentLine(text, blockEnd);
    if (previous && next && FENCE_OPEN.test(previous.text) && FENCE_CLOSE.test(next.text)) {
        const changes: TextChange[] = [
            { from: previous.start, to: Math.min(text.length, previous.end + 1), insert: '' },
            // Remove the newline that introduced the closing fence, then the fence line itself.
            { from: Math.max(0, next.start - 1), to: next.end, insert: '' },
        ];
        return finalize(text, changes, mapPosition(from, changes), mapPosition(to, changes));
    }
    const changes: TextChange[] = [
        { from: blockStart, to: blockStart, insert: '```\n' },
        { from: blockEnd, to: blockEnd, insert: '\n```' },
    ];
    return finalize(text, changes, from + 4, to + 4);
}

// --- Insertions -----------------------------------------------------------

function planLink(text: string, from: number, to: number): CommandPlan {
    if (from === to) {
        const insert = '[](https://)';
        return finalize(text, [{ from, to: from, insert }], from + 3, from + 11);
    }
    const changes: TextChange[] = [
        { from, to: from, insert: '[' },
        { from: to, to, insert: '](https://)' },
    ];
    return finalize(text, changes, to + 3, to + 11);
}

function planTable(text: string, from: number): CommandPlan {
    const lineStart = lineStartOf(text, from);
    const midLine = from > lineStart && from < lineEndOf(text, from);
    const position = midLine ? lineStart : from;
    let prefix = '';
    if (position > 0) {
        if (text[position - 1] !== '\n') prefix += '\n';
        if (!(text.slice(0, position) + prefix).endsWith('\n\n')) prefix += '\n';
    }
    const suffix = position < text.length && text[position] !== '\n' ? '\n' : '';
    const table = '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |';
    const insert = prefix + table + suffix;
    const cursor = position + prefix.length + 2;
    return finalize(text, [{ from: position, to: position, insert }], cursor, cursor);
}

function planDivider(text: string, from: number): CommandPlan {
    const prefix = from > 0 && text[from - 1] !== '\n' ? '\n' : '';
    const suffix = from < text.length && text[from] !== '\n' ? '\n' : '';
    const insert = `${prefix}---${suffix}`;
    const cursor = from + insert.length;
    return finalize(text, [{ from, to: from, insert }], cursor, cursor);
}

// --- Clear marks ----------------------------------------------------------

const CLEAR_PAIRS = ['**', '__', '~~', '==', '*', '_', '`'];
const LINE_MARKER = /^( {0,3})(#{1,6} |> |- )/;

function planClearMarks(text: string, from: number, to: number): CommandPlan {
    const changes: TextChange[] = [];
    let start = from;
    let end = to;
    let stripped = true;
    while (stripped) {
        stripped = false;
        for (const pair of CLEAR_PAIRS) {
            const size = pair.length;
            if (end - start >= size * 2
                && text.slice(start, start + size) === pair && text.slice(end - size, end) === pair) {
                changes.push({ from: start, to: start + size, insert: '' });
                changes.push({ from: end - size, to: end, insert: '' });
                start += size;
                end -= size;
                stripped = true;
                break;
            }
        }
    }
    for (const line of touchedLines(text, start, end)) {
        const cuts = changes
            .filter(change => change.from < line.end && change.to > line.start)
            .sort((left, right) => left.from - right.from);
        let visible = '';
        const origins: number[] = [];
        let cursor = line.start;
        for (const cut of cuts) {
            for (let index = cursor; index < cut.from; index++) {
                visible += text[index];
                origins.push(index);
            }
            cursor = Math.max(cursor, cut.to);
        }
        for (let index = cursor; index < line.end; index++) {
            visible += text[index];
            origins.push(index);
        }
        origins.push(line.end);
        for (let pass = 0; pass < 2; pass++) {
            const match = LINE_MARKER.exec(visible);
            if (!match) break;
            const markerStart = match[1].length;
            const markerLength = match[2].length;
            const first = origins[markerStart];
            const last = origins[markerStart + markerLength - 1];
            if (first === undefined || last === undefined) break;
            changes.push({ from: first, to: last + 1, insert: '' });
            visible = visible.slice(0, markerStart) + visible.slice(markerStart + markerLength);
            origins.splice(markerStart, markerLength);
        }
    }
    if (changes.length === 0) return { changes: [], anchor: from, head: to };
    const merged: TextChange[] = [];
    for (const change of changes.slice().sort((left, right) => left.from - right.from || left.to - right.to)) {
        const previous = merged[merged.length - 1];
        if (previous && change.from < previous.to) {
            previous.to = Math.max(previous.to, change.to);
        } else if (!previous || change.from !== previous.from || change.to !== previous.to) {
            merged.push({ ...change });
        }
    }
    return finalize(text, merged, mapPosition(start, merged), mapPosition(end, merged));
}

// --- Public planning API --------------------------------------------------

/** Pure planner: returns changes in original coordinates plus the resulting selection. */
export function planMarkdownCommand(text: string, from: number, to: number, command: MarkdownCommand): CommandPlan {
    const range = normalizeRange(text, from, to);
    const start = range.from;
    const end = range.to;
    switch (command) {
        case 'bold': return planWrap(text, start, end, '**');
        case 'italic': return planWrap(text, start, end, '*');
        case 'strikethrough': return planWrap(text, start, end, '~~');
        case 'highlight': return planWrap(text, start, end, '==');
        case 'inline-code': return planWrap(text, start, end, '`');
        case 'h1': return planHeading(text, start, end, 1);
        case 'h2': return planHeading(text, start, end, 2);
        case 'h3': return planHeading(text, start, end, 3);
        case 'h4': return planHeading(text, start, end, 4);
        case 'h5': return planHeading(text, start, end, 5);
        case 'h6': return planHeading(text, start, end, 6);
        case 'quote': return planQuote(text, start, end);
        case 'bullet-list': return planBulletList(text, start, end);
        case 'number-list': return planNumberList(text, start, end);
        case 'task-list': return planTaskList(text, start, end);
        case 'code-block': return planCodeBlock(text, start, end);
        case 'link': return planLink(text, start, end);
        case 'table': return planTable(text, start);
        case 'divider': return planDivider(text, start);
        case 'clear-marks': return planClearMarks(text, start, end);
        default: return { changes: [], anchor: start, head: end };
    }
}

/** Apply a command in one undo step, preferring the underlying CodeMirror view. */
export function applyMarkdownCommand(editor: Editor, command: MarkdownCommand): void {
    const cm = (editor as Editor & { cm?: EditorView }).cm;
    if (cm) {
        const text = cm.state.doc.toString();
        const selection = cm.state.selection.main;
        const plan = planMarkdownCommand(text, selection.from, selection.to, command);
        cm.dispatch({
            changes: plan.changes,
            selection: { anchor: plan.anchor, head: plan.head },
            scrollIntoView: true,
        });
        cm.focus();
        return;
    }
    const text = editor.getValue();
    const from = editor.posToOffset(editor.getCursor('from'));
    const to = editor.posToOffset(editor.getCursor('to'));
    const plan = planMarkdownCommand(text, from, to, command);
    for (let index = plan.changes.length - 1; index >= 0; index--) {
        const change = plan.changes[index];
        editor.replaceRange(change.insert, editor.offsetToPos(change.from), editor.offsetToPos(change.to));
    }
    editor.setSelection(editor.offsetToPos(plan.anchor), editor.offsetToPos(plan.head));
}

// --- Fixed toolbar --------------------------------------------------------

/** Mount the fixed Markdown toolbar as the first child of the view content area. */
export function mountMarkdownToolbar(
    view: MarkdownView,
    options: { onNotice?: (message: string) => void },
): () => void {
    const container = view.containerEl.querySelector<HTMLElement>('.view-content');
    if (!container) return () => undefined;
    const toolbar = createDiv('mt-md-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Markdown 工具栏');
    const notify = options.onNotice ?? ((message: string) => { new Notice(message); });

    let currentGroup: ToolbarEntry['group'] | null = null;
    for (const entry of MARKDOWN_TOOLBAR_COMMANDS) {
        if (entry.group !== currentGroup) {
            if (currentGroup !== null) {
                const separator = createSpan('mt-md-toolbar-sep');
                separator.setAttribute('aria-hidden', 'true');
                toolbar.appendChild(separator);
            }
            currentGroup = entry.group;
        }
        const button = createEl('button');
        button.type = 'button';
        button.className = 'mt-md-toolbar-btn';
        button.setAttribute('aria-label', entry.label);
        button.title = entry.label;
        button.setAttribute('data-command', entry.command);
        if (entry.command === 'h1' || entry.command === 'h2' || entry.command === 'h3') {
            button.textContent = entry.label;
        } else {
            const icon = TOOLBAR_ICONS[entry.command];
            if (icon) setIcon(button, icon);
        }
        toolbar.appendChild(button);
    }

    const onMouseDown = (event: MouseEvent): void => {
        const target = event.target;
        if (target instanceof Element && target.closest('.mt-md-toolbar-btn')) event.preventDefault();
    };
    const onClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('.mt-md-toolbar-btn');
        if (!(button instanceof HTMLButtonElement)) return;
        const command = button.getAttribute('data-command') as MarkdownCommand | null;
        if (!command) return;
        if (view.getMode() === 'preview') {
            notify('请先切换到编辑模式再使用工具栏');
            return;
        }
        view.editor.focus();
        applyMarkdownCommand(view.editor, command);
    };
    toolbar.addEventListener('mousedown', onMouseDown);
    toolbar.addEventListener('click', onClick);
    container.insertBefore(toolbar, container.firstChild);

    return () => {
        toolbar.removeEventListener('mousedown', onMouseDown);
        toolbar.removeEventListener('click', onClick);
        toolbar.remove();
    };
}
