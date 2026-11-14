import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { docLook, parse, serialize, type ParseError } from "../../src/core/doc";
import * as ops from "../../src/core/ops";
import { deleteOnly, splitIntoChildren, projectView, setFoldLevel, resizeRange, isAnswer, isQuestion } from "../../src/core/fusion-ops";
import { RichEnvironment, registerRichRenderer } from "./RichTopic";
import { emojiMarkerGroups, hasEmojiMarker, toggleEmojiMarker, type EmojiMarkerGroup } from "../../src/core/emoji-markers";
import { OpError } from "../../src/core/ops";
import { getTopic, indexDoc } from "../../src/core/query";
import { markdownLosses, toMarkdown } from "../../src/core/markdown";
import { clipboardTopics } from '../../src/fusion/clipboard';
import { convertPrimaryLevelKind } from '../../src/fusion/markdown';
import { setImageWidth } from '../../vendor/gogoga/src/inline';
import { relationshipGeom } from "../../src/core/layout/geometry";
import type { Issue, MindDoc, Point, Topic } from "../../src/core/types";
import type { Host, HostCommand, HostKind, InMsg } from "./host";
import { History } from "./history";
import { buildScene } from "./scene";
import { Canvas, zoomAt, type CanvasApi, type DropTarget, type Viewport } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { Laser } from "./Laser";
import { SearchBar, type SearchMode } from "./Search";
import { ContextMenu } from "./ContextMenu";
import { FormatPanel } from "./FormatPanel";
import { Outline } from "./Outline";
import { prepareSvg, svgToPngBase64 } from "./export";
import { handFontCss, loadHandFonts } from "./handFonts";
import { bumpFontEpoch } from "./measure";
import { setLang, t } from "./i18n";
import { Icon } from "./icons";

export interface Editing {
  id: string;
  value: string;
  selectAll: boolean;
}

export type ExportFormat = "png" | "svg" | "md";

/** 给工具栏 / 格式面板 / 大纲用的操作集合 */
export interface Actions {
  doc: MindDoc;
  selection: string[];
  readOnly: boolean;
  dark: boolean;
  apply(fn: (d: MindDoc) => MindDoc, select?: string[]): void;
  select(ids: string[]): void;
  addTopic(kind: "sibling" | "before" | "child" | "parent"): void;
  remove(): void;
  startLinking(): void;
  addRange(kind: "summaries" | "boundaries"): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  exportAs(format: ExportFormat): void;
  openLink(id: string): void;
  notify(msg: string): void;
  feature(command: string, id?: string): void;
  emojiGroups:EmojiMarkerGroup[];
  toggleEmoji(emoji:string):void;
  locked: boolean;
  studyMode: boolean;
  showNotes: boolean;
  showCallouts: boolean;
}

/** 只影响显示、不写进文件的设置,记在本机 */
export interface ViewPrefs {
  showBranches: boolean;
  showRelationships: boolean;
}

function detectDark(): boolean {
  const c = document.body.classList;
  // Obsidian
  if (c.contains("theme-dark")) return true;
  if (c.contains("theme-light")) return false;
  if (c.contains("vscode-light") || c.contains("vscode-high-contrast-light")) return false;
  if (c.contains("vscode-dark") || c.contains("vscode-high-contrast")) return true;
  const q = new URLSearchParams(location.search).get("dark");
  if (q !== null) return q !== "0";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export function App({ host }: { host: Host }) {
  /** 整个界面的根元素:Obsidian 里多个导图共用一个页面,全局事件只处理落在本界面内的 */
  const rootRef = useRef<HTMLDivElement>(null);
  const [doc, setDocState] = useState<MindDoc | null>(null);
  const docRef = useRef<MindDoc | null>(null);
  const [error, setError] = useState<ParseError | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [sourceReadOnly, setReadOnly] = useState(false);
  const [locked, setLocked] = useState(host.initialState?.locked ?? false);
  const [studyMode, setStudyMode] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showHidden,setShowHidden]=useState(host.initialState?.showHidden??host.editorSettings?.showHidden??false);
  const [outlineDock,setOutlineDock]=useState(host.editorSettings?.outlineOpen??false);
  const [markerPicker,setMarkerPicker]=useState(false);
  const [linkChoices,setLinkChoices]=useState<{start:number;end:number;items:string[];index:number}|null>(null);
  const emojiGroups=emojiMarkerGroups(host.editorSettings?.customMarkers,host.editorSettings?.customMarkersExclusive);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showNotes, setShowNotes] = useState(host.initialState?.notesExpanded??host.editorSettings?.notesExpanded ?? false);
  const [folds,setFolds]=useState<Record<string,boolean>>({});
  const [noteCards,setNoteCards]=useState(host.initialState?.noteCards??{});
  const [showCallouts, setShowCallouts] = useState(!host.initialState?.calloutsHidden);
  const [featureEdit, setFeatureEdit] = useState<{id:string;kind:"callout"|"width"|"calloutColor";value:string}|null>(null);
  const readOnly = sourceReadOnly || locked || studyMode || !!host.readOnly;
  const readOnlyRef=useRef(readOnly);readOnlyRef.current=readOnly;
  const revealStudy = (id:string) => setRevealed(old => new Set([...old,id]));
  const [hostKind, setHostKind] = useState<HostKind>("preview");
  const fileName = useRef("mindmap");
  const history = useRef(new History());
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [selection, setSelectionState] = useState<string[]>(host.initialState?.selection ?? []);
  const selRef = useRef<string[]>(host.initialState?.selection ?? []);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  const [view, setView] = useState<"map" | "outline">("map");
  const [laser, setLaser] = useState(false);
  const exitLaser = useCallback(() => setLaser(false), []);
  const [panel, setPanel] = useState(() => localStorage.getItem("wmind-panel") !== "0");
  const [prefs, setPrefsState] = useState<ViewPrefs>(() => ({
    showBranches: localStorage.getItem("wmind-branches") !== "0",
    showRelationships: localStorage.getItem("wmind-relationships") !== "0",
  }));
  const setPrefs = (p: Partial<ViewPrefs>) =>
    setPrefsState((old) => {
      const next = { ...old, ...p };
      localStorage.setItem("wmind-branches", next.showBranches ? "1" : "0");
      localStorage.setItem("wmind-relationships", next.showRelationships ? "1" : "0");
      return next;
    });
  const [search, setSearch] = useState<{ mode: SearchMode; n: number } | null>(null);
  const [found, setFound] = useState<{ ids: Set<string>; current: string | null }>({ ids: new Set(), current: null });
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const closeCtxMenu = useCallback(() => {
    setCtxMenu(null);
    // 菜单按钮卸载后焦点会落到 body,还给画布,快捷键才能继续用
    requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!el || el === document.body) captureRef.current?.focus({ preventScroll: true });
    });
  }, []);
  const [panelFocus, setPanelFocus] = useState<{ field: "note" | "link"; n: number } | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<string | null>(null);
  const [dark, setDark] = useState(detectDark);
  const [viewport, setViewportState] = useState<Viewport>(host.initialState?.viewport ?? { x: 0, y: 0, k: 1 });
  const vpRef = useRef(viewport);
  const size = useRef({ w: 0, h: 0 });
  const needCenter = useRef(!host.initialState?.viewport);
  const [toast, setToast] = useState<string | null>(null);
  const captureRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const spaceHeld = useRef({ down: false, used: false });
  const clip = useRef<{ text: string; topics: Topic[] } | null>(null);

  const setViewport = useCallback((v: Viewport | ((v: Viewport) => Viewport)) => {
    setViewportState((old) => {
      const next = typeof v === "function" ? v(old) : v;
      vpRef.current = next;
      return next;
    });
  }, []);

  const setSelection = (ids: string[]) => {
    selRef.current = ids;
    setSelectionState(ids);
  };
  const setEditing = (e: Editing | null) => {
    editingRef.current = e;
    setEditingState(e);
  };

  useEffect(() => { host.onViewState?.({viewport,selection,locked,showHidden,notesExpanded:showNotes,calloutsHidden:!showCallouts,noteCards,outlineOpen:outlineDock}); }, [viewport,selection,locked,showHidden,showNotes,showCallouts,noteCards,outlineDock]);

  // 手绘字体:文档里出现新字符时加载对应分片,加载完重新排版
  const hand = !!doc && docLook(doc) === "hand";
  const [fontTick, setFontTick] = useState(0);
  const [fontsPending, setFontsPending] = useState(false);
  const fontsSeen = useRef(false);
  useEffect(() => {
    if (!doc || !hand) return;
    let live = true;
    const chars = [...new Set(JSON.stringify(doc) + t("emptyText") + t("newSummary"))].join("");
    if (!fontsSeen.current) setFontsPending(true);
    const timer = window.setTimeout(() => live && setFontsPending(false), 1500);
    loadHandFonts(chars).then((changed) => {
      // 即使文档已经变了,新分片也已加载,照样要让排版失效
      if (changed) {
        bumpFontEpoch();
        setFontTick((n) => n + 1);
      }
      fontsSeen.current = true;
      if (live) setFontsPending(false);
    });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [doc, hand]);

  const viewDoc = useMemo(() => doc ? projectView(doc,{focusId,hidden,showHidden,studyMode,revealed,showNotes,showCallouts,folds,noteCards,noteMaxWidth:host.editorSettings?.noteMaxWidth,noteMaxHeight:host.editorSettings?.noteMaxHeight}) : null,[doc,focusId,hidden,showHidden,studyMode,revealed,showNotes,showCallouts,folds,noteCards]);
  const scene = useMemo(() => {
    if(!viewDoc)return null;
    const restore=registerRichRenderer({renderMath:host.renderMath,resolveImage:host.resolveResource,renderPdfCrop:host.renderPdfCrop,renderMarkdown:host.renderMarkdown});
    try{return buildScene(viewDoc,dark,host.editorSettings);}finally{restore();}
  }, [viewDoc, dark, fontTick]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as unknown as { timer?: number }).timer);
    (notify as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // ---------- 文档读写 ----------

  const setDoc = (d: MindDoc) => {
    docRef.current = d;
    setDocState(d);
  };

  const load = (text: string, initial: boolean) => {
    const r = parse(text);
    if (!r.doc) {
      setError(r.error ?? { message: "?", line: 1, column: 1 });
      return;
    }
    setError(null);
    setIssues(r.issues);
    setReadOnly(r.readOnly);
    if(initial){setFolds({});setHidden(new Set());setFocusId(null);setRevealed(new Set());}
    if (!initial && docRef.current) history.current.push(docRef.current);
    setDoc(r.doc);
    const idx = indexDoc(r.doc);
    setSelection((initial && host.initialState?.selection ? host.initialState.selection : selRef.current).filter((id) => idx.has(id) || ops.findRange(r.doc!, id) || r.doc!.relationships?.some((x) => x.id === id)));
    if (initial) needCenter.current = true;
    bump();
  };

  const post = (d: MindDoc) => host.post({ type: "edit", text: serialize(d) });

  const commit = (next: MindDoc, select?: string[]) => {
    const cur = docRef.current;
    if (!cur || readOnlyRef.current) return;
    if (next !== cur) {
      history.current.push(cur);
      setDoc(next);
      post(next);
      bump();
    }
    if (select) setSelection(select);
  };

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (err) {
      if (err instanceof OpError) notify(err.message);
      else throw err;
    }
  };

  const undo = () => {
    if (readOnly || editingRef.current || !docRef.current) return;
    const prev = history.current.undo(docRef.current);
    if (!prev) return;
    setDoc(prev);
    post(prev);
    bump();
  };
  const redo = () => {
    if (readOnly || editingRef.current || !docRef.current) return;
    const next = history.current.redo(docRef.current);
    if (!next) return;
    setDoc(next);
    post(next);
    bump();
  };

  // ---------- 视口 ----------

  const fit = useCallback(() => {
    const s = sceneRef.current;
    if (!s || !size.current.w) return;
    const b = s.layout.bounds;
    const pad = 60;
    const k = Math.min(1, (size.current.w - pad * 2) / Math.max(1, b.w), (size.current.h - pad * 2) / Math.max(1, b.h));
    const kk = Math.max(0.2, k);
    setViewport({ k: kk, x: size.current.w / 2 - (b.x + b.w / 2) * kk, y: size.current.h / 2 - (b.y + b.h / 2) * kk });
  }, [setViewport]);

  const zoom = (factor: number) => setViewport((v) => zoomAt(v, factor, size.current.w / 2, size.current.h / 2));

  const onSize = useCallback(
    (w: number, h: number) => {
      size.current = { w, h };
      if (needCenter.current && sceneRef.current && w) {
        needCenter.current = false;
        if(host.editorSettings?.openView==="center")setViewport({x:w/2,y:h/2,k:1});else fit();
      }
    },
    [fit]
  );

  useEffect(() => {
    if (needCenter.current && scene && size.current.w) {
      needCenter.current = false;
      if(host.editorSettings?.openView==="center")setViewport({x:size.current.w/2,y:size.current.h/2,k:1});else fit();
    }
  }, [scene, fit]);

  /** 让选中的节点保持在可见区域内 */
  const reveal = (id: string) => {
    const box = sceneRef.current?.layout.nodes.get(id);
    if (!box) return;
    const v = vpRef.current;
    const m = 40;
    const sx = box.x * v.k + v.x;
    const sy = box.y * v.k + v.y;
    const ex = sx + box.w * v.k;
    const ey = sy + box.h * v.k;
    let dx = 0;
    let dy = 0;
    if (sx < m) dx = m - sx;
    else if (ex > size.current.w - m) dx = size.current.w - m - ex;
    if (sy < m) dy = m - sy;
    else if (ey > size.current.h - m) dy = size.current.h - m - ey;
    if (dx || dy) setViewport({ ...v, x: v.x + dx, y: v.y + dy });
  };

  // ---------- 编辑 ----------

  const focusCapture = () => requestAnimationFrame(() => captureRef.current?.focus({ preventScroll: true }));

  const textOf = (d: MindDoc, id: string): string | null => {
    const tp = getTopic(d, id);
    if (tp) return tp.text;
    const r = ops.findRange(d, id);
    if (r) return r.range.text ?? "";
    const rel = d.relationships?.find((x) => x.id === id);
    if (rel) return rel.text ?? "";
    return null;
  };

  const startEdit = (id: string, initial?: string) => {
    const d = docRef.current;
    if (!d || readOnly) return;
    const cur = textOf(d, id);
    if (cur === null) return;
    setSelection([id]);
    setEditing({ id, value: initial ?? cur, selectAll: initial === undefined && host.editorSettings?.editCaret!=="end" });
    requestAnimationFrame(() => {
      const el = captureRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (initial === undefined && host.editorSettings?.editCaret!=="end") el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    });
    reveal(id);
  };

  const commitEdit = (then?: "child") => {
    const e = editingRef.current;
    const d = docRef.current;
    if (!e || !d) return;
    setEditing(null);
    let next = d;
    if (getTopic(d, e.id)) next = ops.setText(d, e.id, e.value);
    else if (ops.findRange(d, e.id)) next = ops.updateRange(d, e.id, { text: e.value.trim() ? e.value : undefined });
    else if (d.relationships?.some((r) => r.id === e.id)) next = ops.updateRelationship(d, e.id, { text: e.value.trim() ? e.value : undefined });
    if (textOf(d, e.id) !== e.value) commit(next);
    if (then === "child") addTopicTo(next, "child", e.id);
    else focusCapture();
  };

  const defaultText = (d: MindDoc, parentId: string) => (parentId === d.root.id ? t("newTopic") : t("newSubtopic"));

  const addTopicTo = (d: MindDoc, kind: "sibling" | "before" | "child" | "parent", id: string) => {
    safe(() => {
      const e = indexDoc(d).get(id);
      if (!e) return;
      let r: { doc: MindDoc; id: string } | null;
      if (kind === "child") r = ops.addChild(d, id, { text: defaultText(d, id) });
      else if (kind === "parent") r = ops.insertParent(d, id, { text: t("topic") });
      else if (!e.parent) r = ops.addChild(d, id, { text: defaultText(d, id) });
      else r = ops.addSibling(d, id, kind === "before", { text: defaultText(d, e.parent.id) });
      if (!r) return;
      commit(r.doc, [r.id]);
      requestAnimationFrame(() => startEdit(r!.id));
    });
  };

  const selectedTopics = () => selRef.current.filter((id) => sceneRef.current?.topics.has(id));

  const addTopic = (kind: "sibling" | "before" | "child" | "parent") => {
    const d = docRef.current;
    if (!d || readOnly) return;
    const ids = selectedTopics();
    addTopicTo(d, kind, ids.length ? ids[ids.length - 1] : d.root.id);
  };

  const remove = () => {
    const d = docRef.current;
    if (!d || readOnly || !selRef.current.length) return;
    const ids = selRef.current.filter((id) => id !== d.root.id);
    if (!ids.length) return;
    // 删除后选中:下一个兄弟 → 上一个兄弟 → 父节点
    let nextSel: string[] = [];
    const first = indexDoc(d).get(ids[0]);
    if (first?.parent) {
      const sibs = first.parent.children!.filter((c) => !ids.includes(c.id));
      const after = first.parent.children!.slice(first.index + 1).find((c) => !ids.includes(c.id));
      const before = first.parent.children!.slice(0, first.index).reverse().find((c) => !ids.includes(c.id));
      nextSel = [(after ?? before ?? first.parent).id];
      if (!sibs.length) nextSel = [first.parent.id];
    } else {
      const r = ops.findRange(d, ids[0]);
      if (r) nextSel = [r.owner.id];
    }
    commit(ops.removeAny(d, ids), nextSel);
  };

  const addRange = (kind: "summaries" | "boundaries") => {
    const d = docRef.current;
    if (!d || readOnly) return;
    const ids = selectedTopics();
    const r = ops.addRange(d, kind, ids, kind === "summaries" ? t("newSummary") : undefined);
    if (!r) {
      notify(t("rangeHint"));
      return;
    }
    commit(r.doc, [r.id]);
    if (kind === "summaries") requestAnimationFrame(() => startEdit(r.id));
  };

  const startLinking = () => {
    const ids = selectedTopics();
    if (ids.length !== 1 || readOnly) return;
    setLinkingFrom(ids[0]);
    notify(t("linkHint"));
  };

  const toggleFold = (ids: string[]) => {
    const d = docRef.current;
    if (!d || !ids.length) return;
    if(readOnly){setFolds(old=>({...old,...Object.fromEntries(ids.filter(id=>id!==d.root.id).map(id=>[id,!(old[id]??getTopic(d,id)?.collapsed)]))}));return;}
    commit(ops.toggleCollapsed(d, ids));
  };

  /** 方向键:在该方向上找最近的节点(主方向距离 + 2 倍偏离距离) */
  const navigate = (dx: number, dy: number) => {
    const s = sceneRef.current;
    const d = docRef.current;
    if (!s || !d) return;
    const cur = selRef.current[selRef.current.length - 1];
    const box = cur ? s.layout.nodes.get(cur) : null;
    if (!box) {
      setSelection([d.root.id]);
      return;
    }
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    let best: { id: string; score: number } | null = null;
    for (const b of s.layout.nodes.values()) {
      if (b.id === box.id) continue;
      const ox = b.x + b.w / 2 - cx;
      const oy = b.y + b.h / 2 - cy;
      const along = ox * dx + oy * dy;
      // 用边缘间距判断「在这个方向上」,避免宽节点误判
      const gap = dx ? (dx > 0 ? b.x - (box.x + box.w) : box.x - (b.x + b.w)) : dy > 0 ? b.y - (box.y + box.h) : box.y - (b.y + b.h);
      if (along <= 0 || gap < -Math.min(b.w, b.h, box.w, box.h) / 2) continue;
      const perp = Math.abs(ox * dy) + Math.abs(oy * dx);
      const score = Math.max(0, gap) + perp * 2;
      if (!best || score < best.score) best = { id: b.id, score };
    }
    if (best) {
      setSelection([best.id]);
      reveal(best.id);
    }
  };

  /** 展开 / 收起某个主题的整棵子树 */
  const setSubtreeFold = (id: string, collapsed: boolean) => {
    const d = docRef.current;
    if (!d) return;
    if(readOnly){const changes:Record<string,boolean>={};const visit=(tp:Topic)=>{if(tp.id!==d.root.id&&tp.children?.length)changes[tp.id]=collapsed;tp.children?.forEach(visit);};const tp=getTopic(d,id);if(tp)visit(tp);setFolds(old=>({...old,...changes}));return;}
    safe(() => commit(ops.setSubtreeCollapsed(d, id, collapsed)));
  };

  // ---------- 查找 / 替换 ----------

  const openSearch = (mode: SearchMode) => {
    if(studyMode){notify("请先退出背诵模式再查找原文");return;}
    if (editingRef.current) commitEdit();
    if (view !== "map") setView("map");
    setSearch((s) => ({ mode: readOnly ? "find" : mode, n: (s?.n ?? 0) + 1 }));
  };

  const closeSearch = () => {
    setSearch(null);
    focusCapture();
  };

  /** 跳到匹配项:折叠在里面的先展开祖先,再选中并滚动到可见 */
  const jumpTo = (id: string) => {
    const d = docRef.current;
    if (!d) return;
    const next = ops.revealTopic(d, id);
    if (next !== d){if(readOnly){const changes:Record<string,boolean>={};for(const [key,value]of indexDoc(next))if(value.topic.collapsed!==getTopic(d,key)?.collapsed)changes[key]=!!value.topic.collapsed;setFolds(old=>({...old,...changes}));}else commit(next);}
    setSelection([id]);
    requestAnimationFrame(() => reveal(id));
  };

  const replaceIn = (ids: string[], find: string, replacement: string, caseSensitive: boolean) => {
    const d = docRef.current;
    if (!d || readOnly) return;
    safe(() => {
      const next = ops.replaceText(d, ids, find, replacement, caseSensitive);
      commit(next);
      if (ids.length > 1) notify(t("replaced", ids.filter((id) => getTopic(next, id) !== getTopic(d, id)).length));
    });
  };

  // ---------- 导出 ----------

  const exportAs = async (format: ExportFormat, copy = false) => {
    try {
    const d = docRef.current;
    const s = sceneRef.current;
    if (!d || !s) return;
    const name = fileName.current;
    if (format === "md") {
      const lost = markdownLosses(d);
      host.post({ type: "export", format, data: toMarkdown(d), encoding: "utf8", defaultName: `${name}.md`, note: lost.length ? t("exportLost", lost.join("、")) : undefined });
      return;
    }
    if (view !== "map") setView("map");
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const world = rootRef.current?.querySelector(".wm-world") as SVGGElement | null;
    if (!world) return;
    const fontCss = s.look === "hand" ? await handFontCss(world.textContent ?? "") : "";
    const { svg, w, h } = await prepareSvg(world, s.palette.background, fontCss);
    if (format === "svg") host.post({ type: "export", format, data: svg, encoding: "utf8", defaultName: `${name}.svg` });
    else host.post({ type: "export", format, data: await svgToPngBase64(svg, w, h, 2), encoding: "base64", defaultName: `${name}.png`, copy });
    } catch(error){notify(error instanceof Error?error.message:String(error));}
  };

  const openLink = (id: string) => {
    const tp = docRef.current && getTopic(docRef.current, id);
    if (tp?.link) host.post({ type: "openLink", target: tp.link });
  };

  // ---------- 剪贴板 ----------

  const attachImages = async(files:File[],id:string) => {
    if(readOnly||!host.saveBinary||!files.length)return;
    try {
      const links:string[]=[];
      for(const file of files)links.push(await host.saveBinary(file.name||`image-${Date.now()}.png`,await file.arrayBuffer(),file.type));
      const d=docRef.current,tp=d&&getTopic(d,id);if(!d||!tp)return;
      commit(ops.updateTopic(d,id,{note:[tp.note,...links.map(link=>`![[${link}]]`)].filter(Boolean).join('\n\n')}));
    }catch(error){notify(`图片插入失败：${error instanceof Error?error.message:String(error)}`);}
  };
  const insertLinkChoice = (choice:string) => {
    const current=editingRef.current;if(!current||!linkChoices)return;
    const value=current.value.slice(0,linkChoices.start)+`[[${choice}]]`+current.value.slice(linkChoices.end);
    const cursor=linkChoices.start+choice.length+4;
    setEditing({...current,value});setLinkChoices(null);
    requestAnimationFrame(()=>{captureRef.current?.focus();captureRef.current?.setSelectionRange(cursor,cursor);});
  };

  useEffect(() => {
    const inField = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || !rootRef.current?.contains(el)) return true; // 不是本界面的事件,不处理
      return el !== captureRef.current && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      const d = docRef.current;
      if (!d || editingRef.current || inField(e) || view !== "map") return;
      const topics = ops.copyTopics(d, selectedTopics());
      if (!topics.length) return;
      e.preventDefault();
      const plain = topics.map((tp) => outlineText(tp, 0)).join("");
      e.clipboardData?.setData("text/plain", plain);
      clip.current = { text: plain, topics };
      if (cut && !readOnly) remove();
    };
    const onPaste = (e: ClipboardEvent) => {
      const d = docRef.current;
      if(!d||readOnly||view!=='map'||!rootRef.current?.contains(e.target as Node))return;
      const images=Array.from(e.clipboardData?.files??[]).filter(file=>file.type.startsWith('image/'));
      if(images.length&&host.saveBinary){e.preventDefault();void attachImages(images,editingRef.current?.id??selRef.current[0]??d.root.id);return;}
      if (editingRef.current || inField(e)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      let topics: Topic[] | null = null;
      if (clip.current && text === clip.current.text) topics = clip.current.topics;
      else if (text.trim()) topics = clipboardTopics(text);
      if (!topics?.length) return;
      e.preventDefault();
      const ids = selectedTopics();
      const parentId = ids.length ? ids[ids.length - 1] : d.root.id;
      safe(() => {
        const r = ops.pasteTopics(d, parentId, topics!);
        commit(r.doc, r.ids);
      });
    };
    const c = (e: ClipboardEvent) => onCopy(e, false);
    const x = (e: ClipboardEvent) => onCopy(e, true);
    document.addEventListener("copy", c);
    document.addEventListener("cut", x);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", c);
      document.removeEventListener("cut", x);
      document.removeEventListener("paste", onPaste);
    };
  });

  // ---------- 宿主消息 ----------

  const foldToLevel=(level:number|null,fromSelection=false)=>{const d=docRef.current;if(!d)return;const base=(fromSelection?selectedTopics()[0]:undefined)??focusId??d.root.id;safe(()=>{const next=setFoldLevel(d,level,base);if(readOnly){const changes:Record<string,boolean>={};const visit=(tp:Topic)=>{changes[tp.id]=!!tp.collapsed;tp.children?.forEach(visit);};const from=getTopic(next,base);if(from)visit(from);setFolds(old=>({...old,...changes}));}else commit(next);});requestAnimationFrame(()=>requestAnimationFrame(fit));};
  const runCommand = (c: HostCommand) => {
    if(c==='flush'){const active=document.activeElement;if(active&&rootRef.current?.contains(active)&&active!==captureRef.current)(active as HTMLElement).blur();if(editingRef.current)commitEdit();return;}
    if(c==='syncPending'){
      const e=editingRef.current,d=docRef.current;if(!e||!d||readOnlyRef.current||textOf(d,e.id)===e.value)return;
      const next=getTopic(d,e.id)?ops.setText(d,e.id,e.value):ops.findRange(d,e.id)?ops.updateRange(d,e.id,{text:e.value}):ops.updateRelationship(d,e.id,{text:e.value});
      commit(next);return;
    }
    if(c==='exportMarkdown'){void exportAs('md');return;}
    if(String(c).startsWith("showLevel:")){const n=Number(String(c).slice(10));if(Number.isFinite(n))foldToLevel(n===0?null:n,true);return;}
    const features:Record<string,string>={toggleLock:"lock",toggleStudy:"study",toggleNotes:"notes",toggleCallouts:"callouts",focusBranch:"focus",deleteOnly:"deleteOnly",splitTopic:"split"};
    if(features[c])return feature(features[c]);
    if(c==="addChild")return addTopic("child");
    if(c==="addSibling")return addTopic("sibling");
    if(c==="insertBefore")return addTopic("before");
    if(c==="insertParent")return addTopic("parent");
    if(c==="editNode"){if(selRef.current[0])startEdit(selRef.current[0]);return;}
    if(c==="callout")return feature("callout");
    if(c==="addRelationship")return startLinking();
    if(c==="deleteNode")return remove();
    if(c==="summary")return addRange("summaries");
    if(c==="summaryBranch"){
      const id=selRef.current[0], d=docRef.current;
      if(!id||!d||readOnly)return;
      feature("summaryBranch",id);
      return;
    }
    if(c==="boundary")return addRange("boundaries");
    if(c==="linkNote"){
      const id=selRef.current[0],d=docRef.current;if(host.pickNote&&id&&d&&!readOnly){void host.pickNote().then(link=>{const next=docRef.current;if(link&&next&&getTopic(next,id))commit(ops.updateTopic(next,id,{link:`[[${link}]]`}));});}
      else{setPanel(true);setPanelFocus({field:"link",n:Date.now()});}return;
    }
    if(c==="moveUp"||c==="moveDown"||c==="indent"||c==="outdent"){
      const d=docRef.current,id=selectedTopics()[0];if(!d||!id||readOnly)return;
      const idx=indexDoc(d),e=idx.get(id);if(!e)return;
      if(c==="moveUp"||c==="moveDown")safe(()=>commit(ops.moveSibling(d,id,c==="moveUp"?-1:1)));
      else if(c==="indent"&&e.parent&&e.index>0)safe(()=>commit(ops.move(d,id,e.parent!.children![e.index-1].id)));
      else if(c==="outdent"&&e.parent){const p=idx.get(e.parent.id);if(p?.parent)safe(()=>commit(ops.move(d,id,p.parent!.id,p.index+1)));}
      return;
    }
    if(c==="toggleOutline"){if(!studyMode)setOutlineDock(value=>!value);return;}
    if(c==="exitFocus"){setFocusId(null);requestAnimationFrame(()=>requestAnimationFrame(fit));return;}
    if(c==="exportSvg")return void exportAs("svg");
    if(c==="copyImage")return void exportAs("png",true);
    if(c==="fold")return toggleFold(selectedTopics());
    if(c==="expandAll"||c==="collapseAll"){const d=docRef.current;if(d){if(readOnly)setSubtreeFold(d.root.id,c==="collapseAll");else commit(ops.setAllCollapsed(d,c==="collapseAll"));}return;}
    if (c === "undo") undo();
    else if (c === "redo") redo();
    else if (c === "zoomIn") zoom(1.2);
    else if (c === "zoomOut") zoom(1 / 1.2);
    else if (c === "fit") fit();
    else if (c === "export") exportAs("png");
    else if (c === "find" || c === "replace") openSearch(c);
  };
  const foldRef = useRef(foldToLevel);foldRef.current=foldToLevel;
  const runRef = useRef(runCommand);
  runRef.current = runCommand;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const off = host.subscribe((m: InMsg) => {
      if (m.type === "init") {
        setLang(m.lang);
        setHostKind(m.host);
        fileName.current = m.fileName;
        loadRef.current(m.text, true);
      } else if(m.type === "setShowHidden"){setShowHidden(m.showHidden);}
      else if(m.type === "setLocked"){setLocked(m.locked);setEditing(null);setLinkingFrom(null);}
      else if(m.type === "foldLevel"){foldRef.current(m.level,!!m.fromSelection);}
      else if(m.type === "select"){setSelection(m.ids);if(m.center&&m.ids[0])requestAnimationFrame(()=>reveal(m.ids[0]));}
      else if (m.type === "update") loadRef.current(m.text, false);
      else if (m.type === "command") runRef.current(m.command);
    });
    host.post({ type: "ready" });
    const mo = new MutationObserver(() => setDark(detectDark()));
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      off();
      mo.disconnect();
    };
  }, []);

  // ---------- 键盘 ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current || view !== "map") return;
      const tgt = e.target as HTMLElement;
      if (!rootRef.current?.contains(tgt)) return;
      if (tgt !== captureRef.current && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      if (e.isComposing || e.key === "Process") return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const d = docRef.current;
      if (!d) return;
      const key = e.key;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      // VS Code 里撤销 / 缩放 / 查找由宿主命令转发;浏览器预览里自己处理
      if (hostKind === "preview") {
        if (mod && !e.altKey && key.toLowerCase() === "f") return handled(), openSearch("find");
        // Mac 上 ⌘H 是系统「隐藏窗口」,替换用 Ctrl+H 或 ⌘⌥F
        if ((e.ctrlKey && !e.metaKey && key.toLowerCase() === "h") || (isMac && e.metaKey && e.altKey && e.code === "KeyF")) return handled(), openSearch("replace");
      }
      if (mod && hostKind === "preview") {
        const k = key.toLowerCase();
        if (k === "z" && !e.shiftKey) return handled(), undo();
        if ((k === "z" && e.shiftKey) || k === "y") return handled(), redo();
        if (k === "=" || k === "+") return handled(), zoom(1.2);
        if (k === "-") return handled(), zoom(1 / 1.2);
        if (k === "0") return handled(), fit();
      }
      if (mod && key.toLowerCase() === "a") {
        handled();
        setSelection([...(sceneRef.current?.layout.nodes.keys() ?? [])].filter((id) => sceneRef.current!.topics.has(id)));
        return;
      }
      if (mod && key === "/") return handled(), toggleFold(selectedTopics());
      if (mod && (key === "ArrowUp" || key === "ArrowDown")) {
        const id = selectedTopics()[0];
        if (id && !readOnly) {
          handled();
          commit(ops.moveSibling(d, id, key === "ArrowUp" ? -1 : 1));
        }
        return;
      }
      if (mod || e.altKey) return;
      switch (key) {
        case "Enter":
          handled();
          if (linkingFrom) return;
          addTopic(e.shiftKey ? "before" : "sibling");
          return;
        case "Tab":
          handled();
          addTopic(e.shiftKey ? "parent" : "child");
          return;
        case "Delete":
        case "Backspace":
          handled();
          remove();
          return;
        case "F2":
          handled();
          if (selRef.current.length === 1) startEdit(selRef.current[0]);
          return;
        case " ":
          handled();
          if (!e.repeat) spaceHeld.current = { down: true, used: false };
          return;
        case "Escape":
          handled();
          if (linkingFrom) setLinkingFrom(null);
          else if (search) closeSearch();
          else if (focusId) { setFocusId(null); requestAnimationFrame(fit); }
          else setSelection([]);
          return;
        case "ArrowUp":
          return handled(), navigate(0, -1);
        case "ArrowDown":
          return handled(), navigate(0, 1);
        case "ArrowLeft":
          return handled(), navigate(-1, 0);
        case "ArrowRight":
          return handled(), navigate(1, 0);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== " " || !spaceHeld.current.down) return;
      if (!rootRef.current?.contains(e.target as Node)) return;
      const used = spaceHeld.current.used;
      spaceHeld.current = { down: false, used: false };
      if (!used && !editingRef.current && selRef.current.length === 1) startEdit(selRef.current[0]);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  useEffect(() => {
    if (!editing) focusCapture();
  }, [doc === null, view]);

  // ---------- 画布回调 ----------

  const canvasApi: CanvasApi = {
    resizeNote(id,w,h){setNoteCards(cards=>({...cards,[id]:{...cards[id],w:Math.round(Math.max(120,Math.min(900,w))),h:Math.round(Math.max(80,Math.min(900,h)))}}));},
    collapseNote(id){setNoteCards(cards=>({...cards,[id]:{...cards[id],collapsed:!cards[id]?.collapsed}}));},
    select(ids, mode = "replace") {
      if (editingRef.current) commitEdit();
      if (mode === "replace") setSelection(ids);
      else if (mode === "add") setSelection([...new Set([...selRef.current, ...ids])]);
      else {
        const s = new Set(selRef.current);
        for (const id of ids) s.has(id) ? s.delete(id) : s.add(id);
        setSelection([...s]);
      }
    },
    startEdit: (id) => startEdit(id),
    toggleFold: (id) => toggleFold([id]),
    openLink,
    openTarget(target){host.post({type:"openLink",target});},
    toggleTask(id){const d=docRef.current;if(!d||readOnly)return;const tp=getTopic(d,id);if(tp&&/^\s*\[[ xX]\]\s/.test(tp.text))commit(ops.setText(d,id,tp.text.replace(/^(\s*\[)([ xX])(\])/,(_,a,state,b)=>a+(state===" "?"x":" ")+b)));},
    openNote(id,edit) {
      const source=docRef.current&&getTopic(docRef.current,id);if(studyMode&&source&&isAnswer(source)&&!revealed.has(id)){notify("请先揭晓答案再查看备注");return;}
      if(showNotes&&!edit){setNoteCards(cards=>({...cards,[id]:{...cards[id],collapsed:!cards[id]?.collapsed}}));return;}
      setSelection([id]);
      if(host.editNote){const tp=docRef.current&&getTopic(docRef.current,id);if(tp)host.editNote(tp.note??"",text=>{const d=docRef.current;if(d&&getTopic(d,id))commit(ops.updateTopic(d,id,{note:text||undefined}));},readOnly);return;}
      setPanel(true);
      setPanelFocus({ field: "note", n: Date.now() });
    },
    drop(ids: string[], target: DropTarget) {
      const d = docRef.current;
      if (!d) return;
      safe(() => {
        if (target.type === "child"||target.type==='sibling'){
          let next=ops.moveMany(d,ids,target.parentId,target.type==='sibling'?target.index:undefined);
          if(target.side&&target.parentId===d.root.id)for(const id of ids)next=ops.updateTopic(next,id,{side:target.side});
          commit(next,ids);
        }
        else commit(ops.toFloating(d, ids[0], target.pos), ids);
      });
    },
    addFloating(pos: Point) {
      const d = docRef.current;
      if (!d) return;
      const r = ops.addFloating(d, { x: pos.x - 40, y: pos.y - 16 }, { text: t("newFloating") });
      commit(r.doc, [r.id]);
      requestAnimationFrame(() => startEdit(r.id));
    },
    createRelationship(from, to) {
      const d = docRef.current;
      if (!d) return;
      if (!prefs.showRelationships) setPrefs({ showRelationships: true });
      safe(() => {
        const r = ops.addRelationship(d, from, to);
        commit(r.doc, [r.id]);
      });
    },
    setWidth(id,width){const d=docRef.current;if(d){const patch={width:Math.max(60,Math.min(1200,Math.round(width)))};commit(getTopic(d,id)?ops.updateTopic(d,id,patch):ops.updateRange(d,id,patch));}},
    resizeRange(id,which,anchor){const d=docRef.current;if(d)commit(resizeRange(d,id,which,anchor));},
    setControls(relId, controls, done) {
      const d = docRef.current;
      if (!d || !done) return;
      commit(ops.updateRelationship(d, relId, { controls }));
    },
    cancelLinking: () => setLinkingFrom(null),
    focusCapture,
    contextMenu(id, x, y) {
      if (editingRef.current) commitEdit();
      setCtxMenu({ id, x, y });
    },
  };

  const feature = (command:string, explicitId?:string) => {
    const d=docRef.current; if(!d)return;
    const id=explicitId??selRef.current[0]??d.root.id; const tp=getTopic(d,id);
    if(command==="lock"){setFolds({});if(editingRef.current)commitEdit();setLocked(v=>!v);setLinkingFrom(null);return;}
    if(command==="study"){setView("map");setSearch(null);if(editingRef.current)commitEdit();setStudyMode(v=>!v);setRevealed(new Set());setLinkingFrom(null);return;}
    if(command==="notes"){setShowNotes(v=>!v);return;}
    if(command==="callouts"){setShowCallouts(v=>!v);return;}
    if(command==="reveal"){revealStudy(id);return;}
    if(command==='fold'){toggleFold([id]);return;}
    if(command==='editNote'){canvasApi.openNote(id,true);return;}
    if(command==="focus"){if(tp){setFocusId(id===d.root.id?null:id);setSelection([id]);requestAnimationFrame(()=>requestAnimationFrame(fit));}return;}
    if(command==="hide"){if(id!==d.root.id){if(readOnly)setHidden(v=>new Set([...v,id]));else commit(ops.updateTopic(d,id,{hidden:tp?.hidden?undefined:true}));}return;}
    if(command==="showAll"){setHidden(new Set());setShowHidden(v=>!v);return;}
    if(command==="outlineDock"){if(!studyMode)setOutlineDock(v=>!v);return;}
    if(command==="markers"){setMarkerPicker(true);return;}
    if(command==="editText"){if(!readOnly)startEdit(id);return;}
    if(command==="deleteAny"){if(!readOnly)safe(()=>commit(ops.removeAny(d,[id]),[]));return;}
    if(command==="summaryBranch"){
      if(readOnly)return;
      const found=ops.findRange(d,id);
      if(!found||found.kind!=="summaries")return;
      safe(()=>{
        const result=ops.summaryToBranch(d,id);
        if(!result)return;
        commit(result.doc,[result.id]);
        notify(result.droppedRanges?`已转为分支节点；${result.droppedRanges} 个无法对应的范围已移除`:"已转为分支节点，可继续添加分点");
        requestAnimationFrame(()=>startEdit(result.id));
      });
      return;
    }
    if(command==="width"&&!readOnly&&!tp){const range=ops.findRange(d,id)?.range;if(range)setFeatureEdit({id,kind:"width",value:typeof range.width==="number"?String(range.width):""});return;}
    if(readOnly||!tp)return;
    if(command==='heading'||command==='list'){const next=convertPrimaryLevelKind(d,id,command);if(next===d)notify('此处无法转换为该层级类型');else commit(next);return;}
    if(command==='sideLeft'||command==='sideRight'){commit(ops.updateTopic(d,id,{side:command==='sideLeft'?'left':'right'}));return;}
    if(command==="deleteOnly"){safe(()=>commit(deleteOnly(d,selectedTopics()),[]));return;}
    if(command==="split"){safe(()=>commit(splitIntoChildren(d,id)));return;}
    if(command==="calloutColor"){setFeatureEdit({id,kind:"calloutColor",value:typeof tp.calloutColor==="string"?tp.calloutColor:""});return;}
    if(command==="callout"){const c=tp.callout;setFeatureEdit({id,kind:"callout",value:typeof c==="string"?c:typeof c==="object"&&c?String((c as {text?:string}).text??""):""});return;}
    if(command==="width"){setFeatureEdit({id,kind:"width",value:typeof tp.width==="number"?String(tp.width):""});return;}
    if(command==="task"){commit(ops.setText(d,id,/^\s*\[[ xX]\]\s/.test(tp.text)?tp.text.replace(/^\s*\[[ xX]\]\s*/,""):"[ ] "+tp.text));return;}
    if(command==="answer"){const markers=tp.markers??[];commit(ops.updateTopic(d,id,{markers:markers.includes("🙈")?markers.filter(m=>m!=="🙈"):[...markers,"🙈"]}));return;}
  };

  const actions: Actions | null = doc
    ? {
        doc,
        selection,
        readOnly,
        dark,
        apply: (fn, select) => {
          const d = docRef.current;
          if (d) safe(() => commit(fn(d), select));
        },
        select: setSelection,
        addTopic,
        remove,
        startLinking,
        addRange,
        undo,
        redo,
        canUndo: history.current.canUndo,
        canRedo: history.current.canRedo,
        exportAs,
        openLink,
        notify, feature, locked, studyMode, showNotes, showCallouts,emojiGroups,
        toggleEmoji:emoji=>{const d=docRef.current;if(d&&!readOnly)commit(toggleEmojiMarker(d,selectedTopics(),emoji,emojiGroups));},
      }
    : null;

  // ---------- 渲染 ----------

  if (error) {
    return (
      <div className="wm-root wm-error" ref={rootRef}>
        <div className="wm-error-card">
          <div className="wm-error-icon">
            <Icon.warn />
          </div>
          <h2>{t("parseError")}</h2>
          <p className="wm-error-pos">{t("parseErrorAt", error.line, error.column)}</p>
          <pre>{error.message}</pre>
          <p>{t("parseErrorHint")}</p>
          {hostKind === "vscode" && (
            <button className="wm-btn wm-btn-primary" onClick={() => host.post({ type: "openText" })}>
              {t("openAsText")}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!doc || !scene || !actions) return <div className="wm-root wm-loading" ref={rootRef} />;

  // 文字输入框:编辑时显示在节点上;不编辑时透明地停在选中节点上,接收快捷键和输入法输入
  const v = viewport;
  const targetId = editing?.id ?? (selection.length === 1 ? selection[0] : null);
  let edStyle: React.CSSProperties = { left: -9999, top: 0 };
  if (targetId && view === "map") {
    const box = scene.layout.nodes.get(targetId);
    const st = scene.styles.get(targetId);
    if (box && st) {
      edStyle = {
        left: box.x * v.k + v.x,
        top: box.y * v.k + v.y,
        minWidth: box.w * v.k,
        minHeight: box.h * v.k,
        fontFamily: st.fontFamily,
        fontSize: st.fontSize * v.k,
        fontWeight: st.bold ? 600 : 400,
        fontStyle: st.italic ? "italic" : undefined,
        lineHeight: 1.4,
        textAlign: st.textAlign,
        padding: `${st.padY * v.k}px ${st.padX * v.k}px`,
        color: st.fill === "none" ? st.textColor : st.textColor,
        background: st.fill === "none" ? scene.palette.background : st.fill,
        borderRadius: 6 * v.k,
      };
    } else {
      const rel = doc.relationships?.find((r) => r.id === targetId);
      const g = scene.layout.boundaries.find((b) => b.id === targetId);
      let p: Point | null = null;
      if (rel) {
        const a = scene.layout.nodes.get(rel.from);
        const b = scene.layout.nodes.get(rel.to);
        if (a && b) {
          const geo = relationshipGeom(a, b, rel.controls);
          p = { x: geo.mid.x - 60, y: geo.mid.y - 12 };
        }
      } else if (g) p = { x: g.x, y: g.y - 2 };
      if (p) {
        edStyle = {
          left: p.x * v.k + v.x,
          top: p.y * v.k + v.y,
          minWidth: 120 * v.k,
          fontSize: 13 * v.k,
          padding: `${3 * v.k}px ${8 * v.k}px`,
          color: scene.palette.text,
          background: scene.palette.background,
          borderRadius: 6,
        };
      }
    }
  }

  return (
    <div className={"wm-root wm-app" + (dark ? " wm-dark" : "")} ref={rootRef}
      onDragOver={event=>{if(!readOnly&&host.saveBinary&&Array.from(event.dataTransfer.items).some(item=>item.kind==='file'&&item.type.startsWith('image/')))event.preventDefault();}}
      onDrop={event=>{const files=Array.from(event.dataTransfer.files).filter(file=>file.type.startsWith('image/'));if(files.length&&host.saveBinary&&!readOnly){event.preventDefault();event.stopPropagation();void attachImages(files,selRef.current[0]??doc.root.id);}}}>
      <div style={{display:"flex",flex:1,minHeight:0,minWidth:0,flexDirection:host.editorSettings?.toolbarPosition==="left"?"row":host.editorSettings?.toolbarPosition==="right"?"row-reverse":host.editorSettings?.toolbarPosition==="bottom"?"column-reverse":"column"}}>
      <Toolbar position={host.editorSettings?.toolbarPosition} actions={actions} view={view} setView={value=>{if(studyMode&&value==="outline"){notify("请先退出背诵模式再打开大纲");return;}setView(value);}} panel={panel} togglePanel={() => setPanel((p) => (localStorage.setItem("wmind-panel", p ? "0" : "1"), !p))} laser={laser} toggleLaser={() => setLaser((l) => !l)} prefs={prefs} setPrefs={setPrefs} openSearch={() => openSearch("find")} />
      <div style={{display:"flex",flexDirection:"column",flex:1,minWidth:0,minHeight:0}}>
      {focusId && <nav aria-label="Branch breadcrumbs" style={{display:"flex",gap:8,padding:"6px 12px"}}>
        {(() => {const path:Topic[]=[];const idx=indexDoc(doc);let e=idx.get(focusId);while(e){path.unshift(e.topic);e=e.parent?idx.get(e.parent.id):undefined;}return path.map(tp=><button key={tp.id} onClick={()=>feature("focus",tp.id)}>{tp.text || "Untitled"}</button>);})()}
        <span>Esc · 返回全图</span>
      </nav>}
      {(studyMode || locked || (hidden.size>0||[...indexDoc(doc).values()].some(e=>e.topic.hidden))) && <div style={{padding:"4px 12px",display:"flex",gap:12}}>
        {locked && <span>🔒 只读</span>}{studyMode && <span>学习模式 · 点击题目或遮挡内容揭晓</span>}{(hidden.size>0||[...indexDoc(doc).values()].some(e=>e.topic.hidden)) && <button onClick={()=>feature("showAll")}>{showHidden?"隐藏已隐藏节点":"显示隐藏节点"}</button>}
      </div>}
      <div className="wm-main">
        {outlineDock&&!studyMode&&view==="map"&&<aside aria-label="大纲面板" style={{width:280,minWidth:180,maxWidth:"40%",resize:"horizontal",overflow:"auto",borderRight:"1px solid #8884",display:"flex",flexDirection:"column"}}>
          <div style={{padding:8,display:"flex",justifyContent:"space-between"}}><span>大纲</span><button onClick={()=>setOutlineDock(false)}>×</button></div>
          <Outline host={host} docked wrap={host.editorSettings?.outlineWrap} actions={{...actions,doc:viewDoc!,select:ids=>{setSelection(ids);if(ids[0])requestAnimationFrame(()=>reveal(ids[0]));}}} />
        </aside>}
        <div className="wm-stage">
          {issues.length > 0 && (
            <div className="wm-issues">
              <div className="wm-issues-head">
                <Icon.warn />
                <span>{readOnly ? t("readOnly") + " · " : ""}{t("issues", issues.length)}</span>
                <button className="wm-link-btn" onClick={() => setShowIssues((s) => !s)}>
                  {showIssues ? t("hide") : t("show")}
                </button>
              </div>
              {showIssues && (
                <ul>
                  {issues.map((i, k) => (
                    <li key={k}>{i.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {view === "map" ? (
            <RichEnvironment.Provider value={{studyMode,revealed,showNotes,reveal:revealStudy,renderMath:host.renderMath,resolveImage:host.resolveResource,renderPdfCrop:host.renderPdfCrop,renderMarkdown:host.renderMarkdown,openTag:host.openTag,hoverLink:host.hoverLink,onImageResize:readOnly?undefined:(id,width)=>{const d=docRef.current,tp=d&&getTopic(d,id);if(d&&tp)commit(ops.setText(d,id,setImageWidth(tp.text,width)));}}}>
            <Canvas
              doc={viewDoc!}
              scene={scene}
              selection={selection}
              linkingFrom={linkingFrom}
              readOnly={readOnly}
              viewport={viewport}
              setViewport={setViewport}
              onSize={onSize}
              spaceHeld={spaceHeld}
              api={canvasApi}
              showBranches={prefs.showBranches}
              showRelationships={prefs.showRelationships}
              matches={found.ids}
              currentMatch={found.current}
              pending={hand && fontsPending}
              settings={host.editorSettings}
              onStudyReveal={studyMode ? (id) => { const topic=getTopic(doc,id);if(topic&&(isAnswer(topic)||isQuestion(topic)))revealStudy(id); } : undefined}
            />
            </RichEnvironment.Provider>
          ) : (
            <Outline host={host} actions={actions} />
          )}
          {laser && view === "map" && <Laser onExit={exitLaser} />}
          {search && view === "map" && (
            <SearchBar
              doc={doc}
              readOnly={readOnly}
              mode={search.mode}
              focusN={search.n}
              setMode={(mode) => setSearch((s) => ({ mode, n: (s?.n ?? 0) + 1 }))}
              onClose={closeSearch}
              onJump={jumpTo}
              onMatches={(ids, current) => setFound({ ids: new Set(ids), current })}
              onReplace={replaceIn}
            />
          )}
          {ctxMenu && view === "map" && (() => {
            const tp = getTopic(doc, ctxMenu.id);
            const rel = doc.relationships?.find((item) => item.id === ctxMenu.id);
            const range = ops.findRange(doc, ctxMenu.id);
            const kids = !!tp?.children?.length;
            let items: Array<{ icon?: ReactNode; label: string; disabled?: boolean; run: () => void }>;
            if (rel) {
              items = [
                { icon: <Icon.topic />, label: "编辑联系线文字", disabled: readOnly, run: () => feature("editText", ctxMenu.id) },
                { icon: <Icon.relationship />, label: "联系线样式…", run: () => { setSelection([ctxMenu.id]); setPanel(true); } },
                { icon: <Icon.trash />, label: "删除联系线", disabled: readOnly, run: () => feature("deleteAny", ctxMenu.id) },
              ];
            } else if (range) {
              const isSummary = range.kind === "summaries";
              items = [
                { icon: <Icon.topic />, label: isSummary ? "编辑概括文字" : "编辑外框文字", disabled: readOnly, run: () => feature("editText", ctxMenu.id) },
                { icon: <Icon.subtopic />, label: "概括转分支（可继续分点）", disabled: readOnly || !isSummary, run: () => feature("summaryBranch", ctxMenu.id) },
                { icon: <Icon.theme />, label: "样式…", run: () => { setSelection([ctxMenu.id]); setPanel(true); } },
                { icon: <Icon.trash />, label: isSummary ? "删除概括" : "删除外框", disabled: readOnly, run: () => feature("deleteAny", ctxMenu.id) },
              ];
            } else {
              items = [
                { icon: <Icon.map />, label: "聚焦分支", run: () => feature("focus", ctxMenu.id) },
                { icon: <Icon.minus />, label: tp?.hidden ? "取消隐藏分支" : "隐藏分支", disabled: ctxMenu.id === doc.root.id, run: () => feature("hide", ctxMenu.id) },
                { icon: <Icon.topic />, label: "添加 / 编辑标注", disabled: readOnly, run: () => feature("callout", ctxMenu.id) },
                { icon: <Icon.topic />, label: "查看 / 编辑备注", run: () => feature("editNote", ctxMenu.id) },
                { icon: <Icon.topic />, label: "标记", disabled: readOnly, run: () => feature("markers", ctxMenu.id) },
                { icon: <Icon.topic />, label: "标注颜色", disabled: readOnly || !tp?.callout, run: () => feature("calloutColor", ctxMenu.id) },
                { icon: <Icon.topic />, label: "节点宽度", disabled: readOnly, run: () => feature("width", ctxMenu.id) },
                { icon: <Icon.topic />, label: "固定到左侧", disabled: readOnly || indexDoc(doc).get(ctxMenu.id)?.parent?.id !== doc.root.id, run: () => feature("sideLeft", ctxMenu.id) },
                { icon: <Icon.topic />, label: "固定到右侧", disabled: readOnly || indexDoc(doc).get(ctxMenu.id)?.parent?.id !== doc.root.id, run: () => feature("sideRight", ctxMenu.id) },
                { icon: <Icon.subtopic />, label: "按标点拆成子节点", disabled: readOnly, run: () => feature("split", ctxMenu.id) },
                { icon: <Icon.topic />, label: "本级转为标题", disabled: readOnly || ctxMenu.id === doc.root.id, run: () => feature("heading", ctxMenu.id) },
                { icon: <Icon.topic />, label: "本级转为列表", disabled: readOnly || ctxMenu.id === doc.root.id, run: () => feature("list", ctxMenu.id) },
                { icon: <Icon.topic />, label: "任务复选框", disabled: readOnly, run: () => feature("task", ctxMenu.id) },
                { icon: <Icon.topic />, label: "答案标记 🙈", disabled: readOnly, run: () => feature("answer", ctxMenu.id) },
                { icon: <Icon.trash />, label: "仅删除节点，保留子节点", disabled: readOnly || ctxMenu.id === doc.root.id, run: () => feature("deleteOnly", ctxMenu.id) },
                { icon: <Icon.expand />, label: t("expandSubtree"), disabled: !kids, run: () => setSubtreeFold(ctxMenu.id, false) },
                { icon: <Icon.collapse />, label: t("collapseSubtree"), disabled: !kids, run: () => setSubtreeFold(ctxMenu.id, true) },
              ];
            }
            return <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtxMenu} items={items} />;
          })()}
          <textarea
            ref={captureRef}
            className={"wm-editor" + (editing ? " wm-editing" : "")}
            style={edStyle}
            value={editing ? editing.value : ""}
            spellCheck={false}
            aria-label="topic text"
            onCompositionStart={() => {
              composing.current = true;
              if (!editingRef.current && targetId && !readOnly) setEditing({ id: targetId, value: "", selectAll: false });
            }}
            onCompositionEnd={() => (composing.current = false)}
            onChange={(e) => {
              const val = e.target.value;
              if (editingRef.current) setEditing({ ...editingRef.current, value: val });
              else if (targetId && !readOnly && val) setEditing({ id: targetId, value: val, selectAll: false });
              const end=e.target.selectionStart,match=/(?:\[\[|【【)([^\]\n]*)$/.exec(val.slice(0,end));
              const items=match?host.listLinkTargets?.(match[1])??[]:[];
              setLinkChoices(match&&items.length?{start:match.index,end,items:items.slice(0,10),index:0}:null);
            }}
            onKeyDown={(e) => {
              if (!editingRef.current) return;
              e.stopPropagation();
              if (e.nativeEvent.isComposing || composing.current) return;
              if(linkChoices){
                if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setLinkChoices({...linkChoices,index:(linkChoices.index+(e.key==='ArrowDown'?1:-1)+linkChoices.items.length)%linkChoices.items.length});return;}
                if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();insertLinkChoice(linkChoices.items[linkChoices.index]);return;}
                if(e.key==='Escape'){e.preventDefault();setLinkChoices(null);return;}
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Tab") {
                e.preventDefault();
                commitEdit(getTopic(doc, editingRef.current.id) ? "child" : undefined);
              }
            }}
            onBlur={() => {
              setLinkChoices(null);
              if (editingRef.current) commitEdit();
            }}
          />
          {linkChoices&&editing&&<div role="listbox" aria-label="链接到笔记" style={{position:'absolute',zIndex:110,left:edStyle.left,top:typeof edStyle.top==='number'?edStyle.top+48:80,maxHeight:240,overflow:'auto',minWidth:220,background:scene.palette.background,border:'1px solid #888',borderRadius:8,padding:6}}>{linkChoices.items.map((choice,index)=><button key={choice} role="option" aria-selected={index===linkChoices.index} style={{display:'block',width:'100%',padding:8,background:index===linkChoices.index?'#6484ff33':'transparent',color:scene.palette.text,border:0,textAlign:'left'}} onPointerDown={event=>{event.preventDefault();insertLinkChoice(choice);}}>{choice}</button>)}</div>}
          {view === "map" && (
            <div className="wm-zoom">
              <button title={t("zoomOut")} onClick={() => zoom(1 / 1.2)}>
                <Icon.minus />
              </button>
              <button className="wm-zoom-pct" title={t("fit")} onClick={fit}>
                {Math.round(viewport.k * 100)}%
              </button>
              <button title={t("zoomIn")} onClick={() => zoom(1.2)}>
                <Icon.plus />
              </button>
            </div>
          )}
          {markerPicker&&<div role="dialog" aria-modal="true" aria-label="标记选择器" style={{position:"absolute",zIndex:100,top:40,left:20,maxHeight:"75%",overflowY:"auto",padding:16,background:scene.palette.background,border:"1px solid #888",borderRadius:8}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>标记<button onClick={()=>setMarkerPicker(false)}>×</button></div>
            {emojiGroups.map(group=><div key={group.name}><p>{group.name}{group.exclusive?"（同组互斥）":""}</p><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{group.emojis.map(emoji=><button key={emoji} aria-label={emoji} aria-pressed={selectedTopics().every(id=>hasEmojiMarker(getTopic(doc,id)!,emoji,emojiGroups))} disabled={readOnly} onClick={()=>actions.toggleEmoji(emoji)} style={{fontSize:22}}>{emoji}</button>)}</div></div>)}
          </div>}
          {featureEdit && <div role="dialog" aria-modal="true" aria-label={featureEdit.kind==="callout"?"编辑标注":"节点宽度"} style={{position:"absolute",zIndex:100,left:"50%",top:"20%",transform:"translateX(-50%)",padding:18,background:scene.palette.background,border:"1px solid #888",borderRadius:10,minWidth:280}}>
            <form onSubmit={e=>{e.preventDefault();const f=featureEdit;if(f.kind==="width"&&f.value.trim()&&(!Number.isFinite(Number(f.value))||Number(f.value)<60||Number(f.value)>1200)){notify("宽度范围为 60–1200 像素，留空恢复自动宽度");return;}if(f.kind==="calloutColor"&&f.value.trim()&&!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$|^[a-z]+$/i.test(f.value.trim())){notify("请输入颜色名称或十六进制颜色");return;}
              const patch=f.kind==="callout"?{callout:f.value.trim()||undefined}:f.kind==="calloutColor"?{calloutColor:f.value.trim()||undefined}:{width:f.value.trim()?Number(f.value):undefined};actions.apply(d=>getTopic(d,f.id)?ops.updateTopic(d,f.id,patch):ops.updateRange(d,f.id,patch));setFeatureEdit(null);}}>
              <label>{featureEdit.kind==="callout"?"标注（留空删除）":featureEdit.kind==="calloutColor"?"标注颜色（名称 / #hex，留空恢复）":"宽度 60–1200 px（留空自动）"}
              <textarea autoFocus aria-label="内容" value={featureEdit.value} onChange={e=>setFeatureEdit({...featureEdit,value:e.target.value})} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setFeatureEdit(null);}}} style={{display:"block",width:"100%",margin:"10px 0"}} />
              </label><button type="submit">保存</button> <button type="button" onClick={()=>setFeatureEdit(null)}>取消</button>
            </form>
          </div>}
          {toast && <div className="wm-toast">{toast}</div>}
        </div>
        {panel && !studyMode && <FormatPanel actions={actions} scene={scene} focus={panelFocus} onClose={() => setPanel(false)} />}
      </div>
      </div>
      </div>
    </div>
  );
}

/** 复制到剪贴板的纯文本:缩进列表 */
function outlineText(tp: Topic, depth: number): string {
  let s = "  ".repeat(depth) + "- " + tp.text.replace(/\n/g, " ") + "\n";
  for (const c of tp.children ?? []) s += outlineText(c, depth + 1);
  return s;
}
