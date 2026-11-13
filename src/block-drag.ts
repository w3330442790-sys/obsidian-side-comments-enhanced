/**
 * Pure Markdown block geometry for drag-to-move and drag-to-nest.
 *
 * There are no Obsidian or CodeMirror imports here on purpose: the geometry,
 * the resulting text and the offset mapping for annotations are unit tested in
 * Node. Blocks are line ranges around a block starting line:
 *
 * - a heading owns its section (until the next heading of the same or a higher level);
 * - a list item owns its nested children and continuation lines;
 * - a fenced code block, a pipe table and a quote block stay together;
 * - trailing blank separators are not part of a block and are re-created on drop;
 * - the hidden `<!-- markdown-tool:v1 ... -->` comment is never draggable.
 */

export type BlockKind = 'heading' | 'list' | 'paragraph' | 'code' | 'table' | 'quote' | 'other';
export type DropMode = 'before' | 'after' | 'child';

export interface DocBlock {
    kind: BlockKind;
    /** 0-based first line. */
    startLine: number;
    /** 0-based last line, inclusive. */
    endLine: number;
    /** Heading level (1-6) for headings, indentation width for list items, else 0. */
    level: number;
    /** Leading whitespace of the first line. */
    indent: string;
}

export interface TextEdit { from: number; to: number; insert: string }

export interface MovedLine {
    oldFrom: number;
    oldTo: number;
    newFrom: number;
    newTo: number;
    /** Length of the replaced leading marker (indent plus marker, or heading hashes). */
    oldPrefix: number;
    newPrefix: number;
}

export interface MovePlan {
    /** Minimal edits in original coordinates, suitable for a CodeMirror transaction. */
    edits: TextEdit[];
    /** Resulting document text. */
    text: string;
    mode: DropMode;
    /** Change of heading level or list indentation width. */
    levelDelta: number;
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
    /** One entry per line of the moved block, in block order. */
    lines: MovedLine[];
    /** Internal geometry for mapPlanOffset. */
    oldStarts: number[];
    newStarts: number[];
    movedStartLine: number;
    movedLineCount: number;
    insertRestLine: number;
    insertLineCount: number;
}

const HEADING = /^( {0,3})(#{1,6})([ \t]+|$)/;
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const QUOTE_LINE = /^[ \t]*>/;
const TABLE_LINE = /^[ \t]*\|/;
const TABLE_DIVIDER = /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/;
const THEMATIC_BREAK = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const METADATA_LINE = /^<!--\s*markdown-tool:v\d+\s/;

export function isMetadataLine(line: string): boolean {
    return METADATA_LINE.test(line);
}

function leadingWhitespace(line: string): string {
    const match = /^[ \t]*/.exec(line);
    return match ? match[0] : '';
}

export function indentWidthOf(text: string): number {
    let width = 0;
    for (const char of text) {
        if (char === ' ') width += 1;
        else if (char === '\t') width += 4;
        else break;
    }
    return width;
}

function startsBlock(line: string): boolean {
    return !line.trim() || HEADING.test(line) || LIST_ITEM.test(line) || QUOTE_LINE.test(line)
        || THEMATIC_BREAK.test(line) || FENCE_OPEN.test(line) || TABLE_LINE.test(line) || METADATA_LINE.test(line);
}

export function lineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return starts;
}

export function applyEdits(source: string, edits: readonly TextEdit[]): string {
    const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
    let result = '';
    let cursor = 0;
    for (const edit of sorted) {
        if (edit.from < cursor || edit.to < edit.from) throw new Error('overlapping or invalid edit');
        result += source.slice(cursor, edit.from) + edit.insert;
        cursor = edit.to;
    }
    return result + source.slice(cursor);
}

/** A block index for one immutable document snapshot. */
export class BlockIndex {
    readonly lines: string[];
    private readonly fenced: boolean[];
    private readonly regions: Array<{ start: number; end: number }> = [];

    constructor(readonly source: string) {
        this.lines = source.split('\n');
        this.fenced = Array.from({ length: this.lines.length }, () => false);
        this.scanFences();
    }

    private scanFences(): void {
        const lines = this.lines;
        let line = 0;
        while (line < lines.length) {
            const open = FENCE_OPEN.exec(lines[line]);
            if (!open) { line++; continue; }
            const fence = open[1];
            const char = fence[0];
            let end = Math.max(line, this.metadataStart() - 1);
            for (let next = line + 1; next < lines.length; next++) {
                if (METADATA_LINE.test(lines[next])) { end = Math.max(line, next - 1); break; }
                if (new RegExp(`^[ \\t]*${char === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(lines[next])) { end = next; break; }
            }
            // An unterminated fence swallows the rest of the document, like Markdown does,
            // but never the hidden metadata comment.
            end = Math.max(line, Math.min(end, lines.length - 1));
            this.regions.push({ start: line, end });
            for (let index = line; index <= end; index++) this.fenced[index] = true;
            line = end + 1;
        }
    }

    private metadataStart(): number {
        for (let line = this.lines.length - 1; line >= 0; line--) {
            if (METADATA_LINE.test(this.lines[line])) return line;
            if (this.lines[line].trim()) return this.lines.length;
        }
        return this.lines.length;
    }

    isFenced(line: number): boolean {
        return this.fenced[line] === true;
    }

    private regionAt(line: number): { start: number; end: number } {
        return this.regions.find(region => line >= region.start && line <= region.end) ?? { start: line, end: line };
    }

    /** Nearest list item that owns an indented continuation line. */
    private ownerOf(line: number): DocBlock | null {
        if (indentWidthOf(this.lines[line]) === 0) return null;
        const width = indentWidthOf(this.lines[line]);
        for (let cursor = line - 1; cursor >= 0; cursor--) {
            if (this.fenced[cursor]) { cursor = this.regionAt(cursor).start; continue; }
            const item = LIST_ITEM.exec(this.lines[cursor]);
            if (!item) continue;
            if (indentWidthOf(item[1]) >= width) continue;
            const block = this.listBlock(cursor, item[1]);
            if (block.endLine >= line) return block;
        }
        return null;
    }

    at(line: number): DocBlock {
        const index = Math.max(0, Math.min(line, this.lines.length - 1));
        const text = this.lines[index];
        const blank: DocBlock = { kind: 'other', startLine: index, endLine: index, level: 0, indent: '' };
        if (!text.trim() || METADATA_LINE.test(text)) return blank;
        if (this.fenced[index]) {
            const region = this.regionAt(index);
            return { kind: 'code', startLine: region.start, endLine: region.end, level: 0, indent: leadingWhitespace(this.lines[region.start]) };
        }
        const heading = HEADING.exec(text);
        if (heading) return this.headingBlock(index, heading[1], heading[2].length);
        const item = LIST_ITEM.exec(text);
        if (item) return this.listBlock(index, item[1]);
        if (QUOTE_LINE.test(text)) return this.quoteBlock(index);
        if (TABLE_LINE.test(text) && TABLE_DIVIDER.test(this.lines[index + 1] ?? '')) return this.tableBlock(index);
        const owner = this.ownerOf(index);
        if (owner) return owner;
        return this.paragraphBlock(index);
    }

    private trimBlankTail(block: DocBlock): DocBlock {
        while (block.endLine > block.startLine && !this.lines[block.endLine].trim()) block.endLine--;
        return block;
    }

    private headingBlock(start: number, indent: string, level: number): DocBlock {
        let end = start;
        for (let line = start + 1; line < this.lines.length; line++) {
            if (METADATA_LINE.test(this.lines[line])) break;
            if (this.fenced[line]) { end = this.regionAt(line).end; line = end; continue; }
            const heading = HEADING.exec(this.lines[line]);
            if (heading && heading[2].length <= level) break;
            end = line;
        }
        return this.trimBlankTail({ kind: 'heading', startLine: start, endLine: end, level, indent });
    }

    private listBlock(start: number, indent: string): DocBlock {
        const width = indentWidthOf(indent);
        let end = start;
        let line = start + 1;
        while (line < this.lines.length) {
            const text = this.lines[line];
            if (METADATA_LINE.test(text)) break;
            if (this.fenced[line]) { end = this.regionAt(line).end; line = end + 1; continue; }
            if (!text.trim()) {
                let next = line;
                while (next < this.lines.length && !this.lines[next].trim()) next++;
                if (next >= this.lines.length || METADATA_LINE.test(this.lines[next])) break;
                if (indentWidthOf(this.lines[next]) <= width) break;
                end = next - 1;
                line = next;
                continue;
            }
            if (indentWidthOf(text) > width) { end = line; line++; continue; }
            break;
        }
        return this.trimBlankTail({ kind: 'list', startLine: start, endLine: end, level: width, indent });
    }

    private quoteBlock(start: number): DocBlock {
        let end = start;
        for (let line = start + 1; line < this.lines.length; line++) {
            const text = this.lines[line];
            if (METADATA_LINE.test(text) || !text.trim()) break;
            if (!QUOTE_LINE.test(text) && !this.fenced[line] && indentWidthOf(text) === 0) break;
            end = line;
        }
        return this.trimBlankTail({ kind: 'quote', startLine: start, endLine: end, level: 0, indent: leadingWhitespace(this.lines[start]) });
    }

    private tableBlock(start: number): DocBlock {
        let end = start;
        for (let line = start + 1; line < this.lines.length; line++) {
            const text = this.lines[line];
            if (METADATA_LINE.test(text) || !text.trim()) break;
            if (!TABLE_LINE.test(text) && !TABLE_DIVIDER.test(text)) break;
            end = line;
        }
        return this.trimBlankTail({ kind: 'table', startLine: start, endLine: end, level: 0, indent: leadingWhitespace(this.lines[start]) });
    }

    private paragraphBlock(start: number): DocBlock {
        let end = start;
        for (let line = start + 1; line < this.lines.length; line++) {
            const text = this.lines[line];
            if (METADATA_LINE.test(text) || startsBlock(text)) break;
            end = line;
        }
        return this.trimBlankTail({ kind: 'paragraph', startLine: start, endLine: end, level: 0, indent: leadingWhitespace(this.lines[start]) });
    }

    /** Previous block that is not inside the given one. */
    blockBefore(block: DocBlock): DocBlock | null {
        for (let line = block.startLine - 1; line >= 0; line--) {
            if (!this.lines[line].trim()) continue;
            const candidate = this.at(line);
            if (candidate.startLine === block.startLine) continue;
            if (candidate.startLine < block.startLine) return candidate;
        }
        return null;
    }

    /** First block starting after the given one. */
    blockAfter(block: DocBlock): DocBlock | null {
        for (let line = block.endLine + 1; line < this.lines.length; line++) {
            if (!this.lines[line].trim()) continue;
            const candidate = this.at(line);
            if (candidate.startLine > block.endLine) return candidate;
            line = candidate.endLine;
        }
        return null;
    }

    /**
     * Previous sibling (same kind and level) and its parent, used by the keyboard
     * move/indent commands. Headings compare by level, lists by indentation.
     */
    neighbours(block: DocBlock): { sibling: DocBlock | null; parent: DocBlock | null } {
        for (let line = block.startLine - 1; line >= 0; line--) {
            const text = this.lines[line];
            if (!text.trim()) continue;
            if (this.fenced[line]) { line = this.regionAt(line).start; continue; }
            if (block.kind === 'heading') {
                const heading = HEADING.exec(text);
                if (!heading) continue;
                if (heading[2].length === block.level) return { sibling: this.at(line), parent: null };
                if (heading[2].length < block.level) return { sibling: null, parent: this.at(line) };
                continue;
            }
            if (block.kind === 'list') {
                const item = LIST_ITEM.exec(text);
                if (!item) continue;
                const width = indentWidthOf(item[1]);
                if (width === block.level) return { sibling: this.at(line), parent: null };
                if (width < block.level) return { sibling: null, parent: this.at(line) };
                continue;
            }
            return { sibling: this.at(line), parent: null };
        }
        return { sibling: null, parent: null };
    }
}

export function blockAtLine(source: string, line: number): DocBlock {
    return new BlockIndex(source).at(line);
}

function shiftHeadings(lines: string[], levels: number[], delta: number): string[] {
    if (!delta) return lines.slice();
    return lines.map((line, index) => {
        const level = levels[index];
        if (!level) return line;
        const match = HEADING.exec(line);
        if (!match) return line;
        const next = Math.max(1, Math.min(6, level + delta));
        const spacing = match[3] === '' ? ' ' : match[3];
        return `${match[1]}${'#'.repeat(next)}${spacing}${line.slice(match[0].length)}`;
    });
}

function shiftIndent(lines: string[], delta: number, fenced: (offset: number) => boolean): string[] {
    if (!delta) return lines.slice();
    return lines.map((line, offset) => {
        if (!line.trim() || fenced(offset)) return line;
        if (delta > 0) return ' '.repeat(delta) + line;
        const width = indentWidthOf(line);
        return line.slice(Math.min(width, -delta));
    });
}

function linePrefixLength(line: string, kind: BlockKind): number {
    if (kind === 'heading') {
        const match = HEADING.exec(line);
        return match ? match[0].length : 0;
    }
    if (kind === 'list') {
        const match = LIST_ITEM.exec(line);
        return match ? match[0].length : 0;
    }
    return leadingWhitespace(line).length;
}

function diffEdit(before: string, after: string): TextEdit {
    let start = 0;
    const limit = Math.min(before.length, after.length);
    while (start < limit && before[start] === after[start]) start++;
    let beforeEnd = before.length;
    let afterEnd = after.length;
    while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) { beforeEnd--; afterEnd--; }
    return { from: start, to: beforeEnd, insert: after.slice(start, afterEnd) };
}

/**
 * Plans moving `moving` before/after/inside `target`.
 * Returns null for no-ops (dropping a block onto itself or its own children).
 */
export function planBlockMove(source: string, moving: DocBlock, target: DocBlock, mode: DropMode): MovePlan | null {
    const index = new BlockIndex(source);
    const lines = index.lines;
    if (moving.startLine < 0 || moving.endLine >= lines.length || target.startLine < 0 || target.endLine >= lines.length) return null;
    if (moving.endLine < moving.startLine || target.endLine < target.startLine) return null;
    if (isMetadataLine(lines[moving.startLine])) return null;
    if (target.startLine >= moving.startLine && target.startLine <= moving.endLine) return null;

    const movingLines = lines.slice(moving.startLine, moving.endLine + 1);
    if (!movingLines.length) return null;

    const levels = movingLines.map((line, offset) => {
        if (index.isFenced(moving.startLine + offset)) return 0;
        const match = HEADING.exec(line);
        return match ? match[2].length : 0;
    });
    const canNest = target.kind === 'heading' || target.kind === 'list';
    const nest = mode === 'child' && canNest;

    let levelDelta = 0;
    let shifted = movingLines.slice();
    if (moving.kind === 'heading') {
        const desired = target.kind === 'heading' ? (nest ? Math.min(6, target.level + 1) : target.level) : moving.level;
        const present = levels.filter(Boolean);
        const lowest = Math.min(...present);
        const highest = Math.max(...present);
        levelDelta = Math.max(1 - lowest, Math.min(6 - highest, desired - moving.level));
        shifted = shiftHeadings(movingLines, levels, levelDelta);
    } else if (moving.kind === 'list' && target.kind === 'list') {
        const targetIndent = indentWidthOf(target.indent);
        const desired = nest ? targetIndent + 2 : targetIndent;
        levelDelta = desired - indentWidthOf(moving.indent);
        const fenceOffset = (offset: number) => index.isFenced(moving.startLine + offset);
        shifted = shiftIndent(movingLines, levelDelta, fenceOffset);
    }

    // Cut the block plus one blank separator so moving does not leave a double gap.
    const cutStart = moving.startLine;
    let cutEnd = moving.endLine + 1;
    if (cutEnd < lines.length && !lines[cutEnd].trim() && (cutStart === 0 || !lines[cutStart - 1].trim())) cutEnd += 1;
    const removed = cutEnd - cutStart;
    const rest = lines.slice(0, cutStart).concat(lines.slice(cutEnd));

    const insertIndex = mode === 'before' ? target.startLine : target.endLine + 1;
    let at: number;
    if (insertIndex <= cutStart) at = insertIndex;
    else if (insertIndex >= cutEnd) at = insertIndex - removed;
    else at = cutStart;
    at = Math.max(0, Math.min(rest.length, at));

    // Re-create the blank separators the drop needs.
    const insertLines = shifted.slice();
    const previous = at > 0 ? rest[at - 1] : undefined;
    const following = at < rest.length ? rest[at] : undefined;
    const previousIsList = moving.kind === 'list' && previous !== undefined && LIST_ITEM.test(previous);
    const followingIsList = moving.kind === 'list' && following !== undefined && LIST_ITEM.test(following);
    const leading = previous !== undefined && previous.trim() && !previousIsList ? 1 : 0;
    if (leading) insertLines.unshift('');
    if (following !== undefined && following.trim() && !followingIsList) insertLines.push('');

    const newLines = rest.slice(0, at).concat(insertLines, rest.slice(at));
    const text = newLines.join('\n');
    if (text === source) return null;

    const oldStarts = lineStarts(source);
    const newStarts = lineStarts(text);
    const oldStart = oldStarts[cutStart];
    let oldEnd = cutEnd < lines.length ? oldStarts[cutEnd] : source.length;
    const blockText = insertLines.join('\n');
    let insertAt = insertIndex < lines.length ? oldStarts[insertIndex] : source.length;
    if (insertAt > oldEnd && cutEnd < lines.length && oldEnd === source.length) insertAt = source.length;
    const boundary = insertAt < source.length || source.length === 0 || source.endsWith('\n');
    let insertText = boundary ? `${blockText}\n` : `\n${blockText}`;
    if (source.length === 0) { insertText = `${blockText}\n`; }
    let deleteFrom = oldStart;
    if (oldEnd === source.length && !source.endsWith('\n') && deleteFrom > 0) deleteFrom -= 1;
    if (oldEnd > source.length) oldEnd = source.length;
    const edits: TextEdit[] = [
        { from: deleteFrom, to: oldEnd, insert: '' },
        { from: insertAt, to: insertAt, insert: insertText },
    ].sort((a, b) => a.from - b.from);

    let applied = '';
    try { applied = applyEdits(source, edits); } catch { applied = ''; }
    const usedEdits = applied === text ? edits : [diffEdit(source, text)];

    const moved: MovedLine[] = shifted.map((newLine, offset) => {
        const oldLine = movingLines[offset];
        const oldFrom = oldStarts[moving.startLine + offset];
        const newFrom = newStarts[at + leading + offset];
        return {
            oldFrom,
            oldTo: oldFrom + oldLine.length,
            newFrom,
            newTo: newFrom + newLine.length,
            oldPrefix: linePrefixLength(oldLine, moving.kind),
            newPrefix: linePrefixLength(newLine, moving.kind),
        };
    });

    return {
        edits: usedEdits,
        text,
        mode,
        levelDelta,
        oldStart,
        oldEnd,
        newStart: newStarts[at],
        newEnd: moved.length ? moved[moved.length - 1].newTo : newStarts[at],
        lines: moved,
        oldStarts,
        newStarts,
        movedStartLine: cutStart,
        movedLineCount: removed,
        insertRestLine: at,
        insertLineCount: insertLines.length,
    };
}

/**
 * Maps an offset from before the move to after it.
 * Returns null when the offset sits in a marker that was rewritten (heading hashes
 * or list indentation) because that offset has no stable identity any more.
 */
export function mapPlanOffset(plan: MovePlan, offset: number): number | null {
    for (const line of plan.lines) {
        if (offset < line.oldFrom || offset > line.oldTo) continue;
        const column = offset - line.oldFrom;
        if (column < line.oldPrefix) return null;
        const mapped = line.newFrom + column - line.oldPrefix + line.newPrefix;
        return Math.max(line.newFrom, Math.min(mapped, line.newTo));
    }
    if (offset < 0 || offset > plan.oldStarts[plan.oldStarts.length - 1]) return null;
    let line = 0;
    while (line + 1 < plan.oldStarts.length && plan.oldStarts[line + 1] <= offset) line++;
    const restIndex = line < plan.movedStartLine ? line : line - plan.movedLineCount;
    const newIndex = restIndex + (restIndex >= plan.insertRestLine ? plan.insertLineCount : 0);
    const start = plan.newStarts[newIndex];
    if (start === undefined) return null;
    return start + (offset - plan.oldStarts[line]);
}

/** Maps an annotation range; both ends must map for the range to be trusted. */
export function mapPlanRange(plan: MovePlan, from: number, to: number): { from: number; to: number } | null {
    const mappedFrom = mapPlanOffset(plan, from);
    const mappedTo = mapPlanOffset(plan, to);
    if (mappedFrom === null || mappedTo === null || mappedFrom >= mappedTo) return null;
    return { from: mappedFrom, to: mappedTo };
}
