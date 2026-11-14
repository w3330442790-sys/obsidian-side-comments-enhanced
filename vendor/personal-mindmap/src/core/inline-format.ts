/**
 * Selection formatting for the editable outline and the Markdown editor.
 *
 * The on-disk syntax is deliberately plain Markdown/HTML so the same text stays
 * readable in Obsidian, in .wmind files and in exported Markdown:
 *   <span style="color:#dc2626">重点</span>
 *   ==高亮==
 *   **重点**
 *
 * Only the exact color-span shape written by this module is recognized. This is
 * not an HTML sanitizer and must never be used to render arbitrary HTML.
 */

export type InlineFormat = "red" | "orange" | "highlight" | "bold" | "clear-color";

export interface FormatResult {
  text: string;
  start: number;
  end: number;
}

export const INLINE_RED = "#dc2626";
export const INLINE_ORANGE = "#ea580c";

const COLOR_RE = /<span\s+style="color:(#[0-9a-f]{6})"\s*>|<\/span>/gi;
const COLOR_VALUE_RE = /^#[0-9a-f]{6}$/i;

interface ColorSpan {
  openStart: number;
  contentStart: number;
  contentEnd: number;
  closeEnd: number;
  color: string;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function normalize(text: string, start: number, end: number): { start: number; end: number } {
  const from = clamp(start, text.length);
  const to = clamp(end, text.length);
  return to < from ? { start: to, end: from } : { start: from, end: to };
}

/** Innermost color span that completely surrounds the selection. */
function enclosingColor(text: string, start: number, end: number): ColorSpan | null {
  const stack: Array<{ openStart: number; contentStart: number; color: string }> = [];
  let best: ColorSpan | null = null;
  // A fresh regex per call: a global regex carries lastIndex between calls and
  // would silently skip the opening tag on the second use.
  const scan = new RegExp(COLOR_RE.source, "gi");
  for (const match of text.matchAll(scan)) {
    const index = match.index ?? 0;
    if (match[1]) {
      stack.push({ openStart: index, contentStart: index + match[0].length, color: match[1].toLowerCase() });
      continue;
    }
    const open = stack.pop();
    if (!open) continue;
    const closeEnd = index + match[0].length;
    if (open.openStart <= start && index >= end && (!best || open.openStart > best.openStart)) {
      best = {
        openStart: open.openStart,
        contentStart: open.contentStart,
        contentEnd: index,
        closeEnd,
        color: open.color,
      };
    }
  }
  return best;
}

function colorSpan(color: string, body: string): string {
  return `<span style="color:${color}">${body}</span>`;
}

function toggleColor(text: string, start: number, end: number, color: string): FormatResult {
  if (start === end) {
    const open = `<span style="color:${color}">`;
    const next = text.slice(0, start) + open + "</span>" + text.slice(end);
    return { text: next, start: start + open.length, end: start + open.length };
  }
  const span = enclosingColor(text, start, end);
  if (span) {
    const inner = text.slice(span.contentStart, span.contentEnd);
    const oldOpen = text.slice(span.openStart, span.contentStart);
    if (span.color === color.toLowerCase()) {
      const next = text.slice(0, span.openStart) + inner + text.slice(span.closeEnd);
      return {
        text: next,
        start: Math.max(span.openStart, start - oldOpen.length),
        end: Math.max(span.openStart, end - oldOpen.length),
      };
    }
    // Recolor the whole phrase instead of nesting a second span.
    const newOpen = `<span style="color:${color}">`;
    const next = text.slice(0, span.openStart) + newOpen + inner + "</span>" + text.slice(span.closeEnd);
    const shift = newOpen.length - oldOpen.length;
    return { text: next, start: start + shift, end: end + shift };
  }
  const selected = text.slice(start, end);
  const exact = /^<span\s+style="color:(#[0-9a-f]{6})"\s*>([\s\S]*)<\/span>$/i.exec(selected);
  if (exact) {
    const inner = exact[2];
    if (exact[1].toLowerCase() === color.toLowerCase()) {
      return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
    }
    const replacement = colorSpan(color, inner);
    const openLength = `<span style="color:${color}">`.length;
    return {
      text: text.slice(0, start) + replacement + text.slice(end),
      start: start + openLength,
      end: start + replacement.length - "</span>".length,
    };
  }
  const replacement = colorSpan(color, selected);
  const openLength = `<span style="color:${color}">`.length;
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    start: start + openLength,
    end: start + replacement.length - "</span>".length,
  };
}

function clearColor(text: string, start: number, end: number): FormatResult {
  if (start === end) return { text, start, end };
  const span = enclosingColor(text, start, end);
  if (span) {
    const oldOpen = text.slice(span.openStart, span.contentStart);
    const next = text.slice(0, span.openStart) + text.slice(span.contentStart, span.contentEnd) + text.slice(span.closeEnd);
    return {
      text: next,
      start: Math.max(span.openStart, start - oldOpen.length),
      end: Math.max(span.openStart, end - oldOpen.length),
    };
  }
  const selected = text.slice(start, end);
  const exact = /^<span\s+style="color:#[0-9a-f]{6}"\s*>([\s\S]*)<\/span>$/i.exec(selected);
  if (exact) {
    const inner = exact[1];
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  return { text, start, end };
}

function toggleMarks(text: string, start: number, end: number, mark: string): FormatResult {
  const size = mark.length;
  if (start === end) {
    const next = text.slice(0, start) + mark + mark + text.slice(end);
    return { text: next, start: start + size, end: start + size };
  }
  if (start >= size && text.slice(start - size, start) === mark && text.slice(end, end + size) === mark) {
    const next = text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size);
    return { text: next, start: start - size, end: end - size };
  }
  if (end - start >= size * 2 && text.slice(start, start + size) === mark && text.slice(end - size, end) === mark) {
    const next = text.slice(0, start) + text.slice(start + size, end - size) + text.slice(end);
    return { text: next, start, end: end - size * 2 };
  }
  const next = text.slice(0, start) + mark + text.slice(start, end) + mark + text.slice(end);
  return { text: next, start: start + size, end: end + size };
}

/** Apply a format to a selected range and return the selection inside the new text. */
export function applyInlineFormat(text: string, start: number, end: number, format: InlineFormat): FormatResult {
  const range = normalize(text, start, end);
  switch (format) {
    case "red":
      return toggleColor(text, range.start, range.end, INLINE_RED);
    case "orange":
      return toggleColor(text, range.start, range.end, INLINE_ORANGE);
    case "clear-color":
      return clearColor(text, range.start, range.end);
    case "highlight":
      return toggleMarks(text, range.start, range.end, "==");
    case "bold":
      return toggleMarks(text, range.start, range.end, "**");
    default:
      return { text, start: range.start, end: range.end };
  }
}

/** The exact color syntax recognized by the rich renderer; exported for tests. */
export function isInlineColor(value: string): boolean {
  return COLOR_VALUE_RE.test(value);
}
