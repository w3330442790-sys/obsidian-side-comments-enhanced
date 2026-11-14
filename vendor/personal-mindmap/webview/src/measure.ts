// 节点内容排版:文字换行、标记、标签、备注 / 链接图标 → 节点尺寸
import type { ResolvedStyle } from "../../src/core/theme";
import { isRichText, parseRich, richPlainText } from "./rich";
import { measureRichBox } from "./RichTopic";
import type { NodeSize } from "../../src/core/layout";

export interface Metrics extends NodeSize {
  lines: string[];
  rich?: boolean;
  textH: number;
  extraY: number;
  extras: {text:string; kind:"note"|"callout"; y:number; h:number}[];
  lineHeight: number;
  font: string;
  /** 内容区域(相对节点左上角) */
  textX: number;
  textY: number;
  textW: number;
  markerSize: number;
  markersX: number;
  markersY: number;
  iconsX: number;
  iconsY: number;
  labelsX: number;
  labelsY: number;
  labelWidths: number[];
}

export interface Content {
  text: string;
  width?: number;
  studyQuestion?: boolean;
  studyMultiple?: boolean;
  studyOption?: boolean;
  studyCorrect?: boolean;
  studyShown?: boolean;
  viewHidden?:boolean;
  noteExpanded?: boolean;
  noteWidth?:number;noteHeight?:number;noteMaxHeight?:number;
  callout?: string | {text:string};
  calloutColor?: string;
  markers?: string[];
  labels?: string[];
  note?: string;
  link?: string;
}

const MAX_TEXT_WIDTH = 260;
const ICON = 14;
const GAP = 6;
const LABEL_H = 18;
const LABEL_FONT = 11;

let ctx: CanvasRenderingContext2D | null = null;
function c2d(): CanvasRenderingContext2D {
  if (!ctx) ctx = document.createElement("canvas").getContext("2d")!;
  return ctx;
}

export function fontOf(s: ResolvedStyle): string {
  return `${s.italic ? "italic " : ""}${s.bold ? 600 : 400} ${s.fontSize}px ${s.fontFamily}`;
}

function textWidth(font: string, text: string): number {
  const c = c2d();
  c.font = font;
  return c.measureText(text).width;
}

/** 按最大宽度换行:优先在空格处断开,CJK 可在任意字符处断开 */
export function wrap(font: string, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (textWidth(font, para) <= max) {
      out.push(para);
      continue;
    }
    let line = "";
    let lastSpace = -1;
    for (const ch of Array.from(para)) {
      const next = line + ch;
      if (textWidth(font, next) > max && line) {
        if (ch !== " " && lastSpace > 0) {
          out.push(line.slice(0, lastSpace));
          line = line.slice(lastSpace + 1) + ch;
        } else {
          out.push(line);
          line = ch === " " ? "" : ch;
        }
        lastSpace = -1;
      } else {
        line = next;
      }
      if (ch === " ") lastSpace = line.length - 1;
    }
    out.push(line);
  }
  return out;
}

const cache = new WeakMap<object, { key: string; m: Metrics }>();

/** 字体加载完成后加一,让缓存的尺寸失效重新测量 */
let fontEpoch = 0;
export function bumpFontEpoch(): void {
  fontEpoch++;
}

export function measure(owner: object, c: Content, s: ResolvedStyle, placeholder: string): Metrics {
  const key = [fontEpoch, s.maxWidth, s.textAlign, c.text, s.fontSize, s.bold, s.italic, s.fontFamily, s.shape, s.padX, s.padY, s.borderWidth, (c.markers ?? []).length, (c.labels ?? []).join("\u0001"), !!c.note, !!c.link, c.width, c.noteExpanded,c.noteWidth,c.noteHeight,c.noteMaxHeight, c.note, typeof c.callout === "string" ? c.callout : c.callout?.text].join("|");
  const hit = cache.get(owner);
  if (hit && hit.key === key) return hit.m;
  const m = compute(c, s, placeholder);
  cache.set(owner, { key, m });
  return m;
}

function compute(c: Content, s: ResolvedStyle, placeholder: string): Metrics {
  const font = fontOf(s);
  const lineHeight = Math.round(s.fontSize * 1.4);
  let maxW = c.width && Number.isFinite(c.width) ? Math.max(48, Math.min(1200,c.width)) : s.maxWidth && Number.isFinite(s.maxWidth) ? Math.max(48,Math.min(1200,s.maxWidth)) : (s.kind === "root" ? MAX_TEXT_WIDTH * 1.3 : MAX_TEXT_WIDTH);
  const rich = isRichText(c.text);
  if(!c.width)maxW=Math.max(maxW,...parseRich(c.text).map(t=>t.width??0));
  const lines = wrap(font, rich ? richPlainText(parseRich(c.text)) : c.text || placeholder, maxW);
  const richBox = rich ? measureRichBox(c.text,font,lineHeight,maxW) : null;
  const textW = c.width ? maxW : Math.max(s.fontSize, richBox?.w ?? Math.max(...lines.map((l) => textWidth(font, l))));
  const textH = richBox?.h ?? lines.length * lineHeight;
  const markerSize = Math.round(Math.max(16, Math.min(22, s.fontSize * 1.15)));
  const nMarkers = c.markers?.length ?? 0;
  const markersW = nMarkers ? nMarkers * markerSize + (nMarkers - 1) * 3 + GAP : 0;
  const nIcons = (c.note ? 1 : 0) + (c.link ? 1 : 0);
  const iconsW = nIcons ? GAP + nIcons * ICON + (nIcons - 1) * 4 : 0;
  const rowH = Math.max(textH, nMarkers ? markerSize : 0);
  const labelFont = `500 ${LABEL_FONT}px ${s.fontFamily}`;
  const labelWidths = (c.labels ?? []).map((l) => Math.ceil(textWidth(labelFont, l)) + 12);
  const labelsW = labelWidths.reduce((a, b) => a + b, 0) + Math.max(0, labelWidths.length - 1) * 4;
  const rowW = markersW + textW + iconsW;
  const extras: Metrics["extras"] = [];
  let extraY = rowH + (labelWidths.length ? 5 + LABEL_H : 0);
  const callout = typeof c.callout === "string" ? c.callout : c.callout?.text;
  let extrasW = 0;
  for (const [kind,text] of [["callout",callout],["note",c.noteExpanded ? c.note : undefined]] as const) {
    if (!text) continue;
    const b = measureRichBox(text,font,lineHeight,kind==='note'?(c.noteWidth??320):maxW);
    extrasW = Math.max(extrasW,b.w + 12);
    if(kind==='note'&&c.noteWidth)extrasW=Math.max(extrasW,c.noteWidth);
    const bodyH=kind==="note" ? Math.max(80,c.noteHeight??Math.min(c.noteMaxHeight??240,b.h)) : b.h;
    extras.push({kind,text,y:extraY+8,h:bodyH+12});
    extraY += bodyH + 20;
  }
  const contentW = Math.max(rowW, labelsW,extrasW);
  const contentH = extraY;

  let padX = s.padX;
  let padY = s.padY;
  if (s.shape === "capsule") padX += Math.min(16, (contentH + 2 * padY) / 4);
  let w = contentW + 2 * padX;
  let h = contentH + 2 * padY;
  if (s.shape === "ellipse") {
    const ew = w * 1.22;
    const eh = h * 1.32;
    padX += (ew - w) / 2;
    padY += (eh - h) / 2;
    w = ew;
    h = eh;
  }
  if (s.shape === "underline") h += s.borderWidth / 2;
  w = Math.ceil(Math.max(w, s.kind === "root" ? 80 : 24));
  h = Math.ceil(h);

  // 对齐:标记 + 文字 + 图标这一行、标签行在内容区里靠左 / 居中 / 靠右
  const place = (inner: number) => padX + (s.textAlign === "left" ? 0 : s.textAlign === "right" ? contentW - inner : (contentW - inner) / 2);
  const rowX = place(rowW);
  const rowY = padY;
  return {
    w,
    h,
    underline: s.shape === "underline",
    lines,
    rich,
    textH,
    extraY:padY,
    extras,
    lineHeight,
    font,
    textX: rowX + markersW,
    textY: rowY + (rowH - textH) / 2,
    textW,
    markerSize,
    markersX: rowX,
    markersY: rowY + (rowH - markerSize) / 2,
    iconsX: rowX + markersW + textW + GAP,
    iconsY: rowY + (rowH - ICON) / 2,
    labelsX: place(labelsW),
    labelsY: rowY + rowH + 5,
    labelWidths,
  };
}

export const LABEL_HEIGHT = LABEL_H;
export const LABEL_FONT_SIZE = LABEL_FONT;
export const ICON_SIZE = ICON;
