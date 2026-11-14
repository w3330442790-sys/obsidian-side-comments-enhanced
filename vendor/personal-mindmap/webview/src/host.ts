// 画布 ↔ 宿主 的消息桥。VS Code 走 acquireVsCodeApi;Obsidian 由视图直接实现 Host;
// 浏览器预览(npm run dev:web / 无头测试)见 previewHost.ts

export type OutMsg =
  | { type: "ready" }
  | { type: "edit"; text: string }
  | { type: "export"; format: "png" | "svg" | "md"; data: string; encoding: "base64" | "utf8"; defaultName: string; note?: string; copy?: boolean }
  | { type: "openLink"; target: string }
  | { type: "openText" }
  | { type: "notify"; level: "info" | "warn" | "error"; message: string };

/**
 * 宿主类型。vscode / obsidian:撤销、缩放等快捷键由宿主注册后转发(否则会触发宿主自己的同名快捷键);
 * preview:画布自己处理。只有 vscode 能「用文本编辑器打开」。
 */
export type HostKind = "vscode" | "obsidian" | "preview";

export type HostCommand = "undo" | "redo" | "zoomIn" | "zoomOut" | "fit" | "export" | "find" | "replace"
  | `showLevel:${number}` | 'exportMarkdown'
  | 'syncPending' | 'flush'
  | "toggleOutline" | "toggleLock" | "toggleStudy" | "toggleNotes" | "toggleCallouts" | "focusBranch" | "exitFocus"
  | "copyImage" | "exportSvg" | "fold" | "expandAll" | "collapseAll" | "deleteOnly" | "splitTopic"
  | "addChild" | "addSibling" | "insertBefore" | "insertParent" | "editNode" | "callout" | "addRelationship"
  | "deleteNode" | "moveUp" | "moveDown" | "outdent" | "indent" | "boundary" | "summary" | "summaryBranch" | "linkNote";

export type InMsg =
  | { type: "init"; text: string; lang: string; fileName: string; host: HostKind }
  | { type: "update"; text: string }
  | { type: "select"; ids: string[]; center?: boolean }
  | { type:"setShowHidden";showHidden:boolean }
  | { type: "setLocked"; locked: boolean }
  | { type: "foldLevel"; level: number | null; fromSelection?: boolean }
  | { type: "command"; command: HostCommand };

export interface EditorSettings {
  wheelAction?:"pan"|"zoom"; leftDrag?:"pan"|"select"; editCaret?:"select"|"end";
  dragToFloat?:boolean; toolbarPosition?:"top"|"bottom"|"left"|"right";
  notesExpanded?:boolean; fontScale?:number; spacingScale?:number;
  noteMaxWidth?:number;noteMaxHeight?:number;
  openView?:"fit"|"center"; outlineOpen?:boolean; outlineWrap?:boolean;
  customMarkers?:string;customMarkersExclusive?:boolean;showHidden?:boolean;
}
export interface Host {
  editorSettings?:EditorSettings;
  readOnly?:boolean;
  editNote?(text:string,onCommit:(text:string)=>void,readOnly?:boolean):void;
  saveBinary?(name:string,data:ArrayBuffer,mime:string):Promise<string>;
  listLinkTargets?(query:string):string[];
  pickNote?():Promise<string|null>;
  openTag?(tag:string):void;
  hoverLink?(event:MouseEvent,target:string,element:HTMLElement):void;
  post(msg: OutMsg): void;
  subscribe(handler: (msg: InMsg) => void): () => void;
  renderMarkdown?(text: string, element: HTMLElement): void | (() => void);
  renderMath?(tex: string, display: boolean): HTMLElement | null;
  renderPdfCrop?(link: string, element: HTMLElement, onImage: (image: HTMLImageElement) => void): boolean;
  resolveResource?(target: string): string;
  initialState?: { viewport?: { x: number; y: number; k: number }; selection?: string[]; locked?: boolean;showHidden?:boolean;notesExpanded?:boolean;calloutsHidden?:boolean;noteCards?:Record<string,{w?:number;h?:number;collapsed?:boolean}> };
  onViewState?(state: { viewport: { x: number; y: number; k: number }; selection: string[]; locked?: boolean;showHidden?:boolean;notesExpanded?:boolean;calloutsHidden?:boolean;noteCards?:Record<string,{w?:number;h?:number;collapsed?:boolean}>;outlineOpen?:boolean }): void;
}

export interface VsCodeApi {
  postMessage(msg: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    /** 预览模式下给测试脚本用:模拟外部修改文件 */
    __wmindExternalEdit?: (text: string) => void;
    __wmindText?: () => string;
  }
}

export function vscodeHost(api: VsCodeApi): Host {
  return {
    post: (msg) => api.postMessage(msg),
    subscribe(handler) {
      const listener = (e: MessageEvent) => handler(e.data as InMsg);
      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    },
  };
}
