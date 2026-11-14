import { MindMapCanvas } from "../vendor/personal-mindmap/vendor/gogoga/src/canvas";

function makeElement(tag: string, options?: unknown): HTMLElement {
  const element = document.createElement(tag);
  if (typeof options === "string") element.className = options;
  else if (options && typeof options === "object") {
    const record = options as { cls?: string; text?: string; attr?: Record<string, string> };
    if (record.cls) element.className = record.cls;
    if (record.text !== undefined) element.textContent = record.text;
    for (const [key, value] of Object.entries(record.attr ?? {})) element.setAttribute(key, String(value));
  }
  return element;
}
Object.assign(globalThis, {
  createEl: (tag: string, options?: unknown) => makeElement(tag, options),
  createDiv: (options?: unknown) => makeElement("div", options),
  createSpan: (options?: unknown) => makeElement("span", options),
  createSvg: (tag: string, options?: unknown) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (typeof options === "string") element.setAttribute("class", options);
    else if (options && typeof options === "object") {
      const record = options as { cls?: string; attr?: Record<string, string> };
      if (record.cls) element.setAttribute("class", record.cls);
      for (const [key, value] of Object.entries(record.attr ?? {})) element.setAttribute(key, String(value));
    }
    return element;
  },
});

const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
prototype.setCssStyles = function (styles: Record<string, string>): void {
  Object.assign((this as HTMLElement).style, styles);
};
prototype.createEl = function (tag: string, options?: unknown): HTMLElement {
  const element = makeElement(tag, options);
  (this as HTMLElement).append(element);
  return element;
};
prototype.createDiv = function (options?: unknown): HTMLElement {
  return (this as HTMLElement & { createEl: (tag: string, options?: unknown) => HTMLElement }).createEl("div", options);
};
prototype.createSpan = function (options?: unknown): HTMLElement {
  return (this as HTMLElement & { createEl: (tag: string, options?: unknown) => HTMLElement }).createEl("span", options);
};
prototype.empty = function (): void {
  (this as HTMLElement).replaceChildren();
};
prototype.addClass = function (...classes: string[]): void {
  (this as HTMLElement).classList.add(...classes);
};
prototype.removeClass = function (...classes: string[]): void {
  (this as HTMLElement).classList.remove(...classes);
};
prototype.toggleClass = function (name: string, force?: boolean): void {
  (this as HTMLElement).classList.toggle(name, force);
};
prototype.setText = function (text: string): void {
  (this as HTMLElement).textContent = text;
};

declare global {
  interface Window {
    canvas: MindMapCanvas;
    docText(): string;
  }
}

const doc = {
  version: 1,
  style: { headingsOnly: false },
  root: {
    id: "root",
    text: "根节点",
    children: [
      { id: "left", text: "分支甲", children: [{ id: "leaf", text: "叶子节点", children: [] }] },
      { id: "right", text: "分支乙", children: [] },
    ],
  },
} as never;

const host = document.getElementById("host");
if (!host) throw new Error("missing host");
const canvas = new MindMapCanvas(host, { structure: "map", theme: "snow", editable: true });
canvas.setDoc(doc);
window.canvas = canvas;
window.docText = () => JSON.stringify(canvas.getDoc());
