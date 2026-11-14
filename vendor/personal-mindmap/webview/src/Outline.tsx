// 大纲视图:可编辑的缩进列表,快捷键与画布一致(Enter 同级、Tab 缩进、Shift+Tab 反缩进)
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as ops from "../../src/core/ops";
import { applyInlineFormat, INLINE_ORANGE, INLINE_RED, type InlineFormat } from "../../src/core/inline-format";
import { indexDoc } from "../../src/core/query";
import type { MindDoc, Topic } from "../../src/core/types";
import type { Actions } from "./App";
import { t } from "./i18n";
import {isRichText} from './rich';
import {fillRichElement} from './RichTopic';
import type {Host} from './host';

interface Row {
  topic: Topic;
  depth: number;
}

function flatten(doc: MindDoc): Row[] {
  const rows: Row[] = [];
  const visit = (tp: Topic, depth: number) => {
    rows.push({ topic: tp, depth });
    if (!tp.collapsed) for (const c of tp.children ?? []) visit(c, depth + 1);
  };
  visit(doc.root, 0);
  for (const f of doc.floating ?? []) visit(f, 0);
  return rows;
}

interface FormatBarState { x: number; y: number; start: number; end: number }

const FORMAT_BUTTONS: Array<{ id: InlineFormat; label: string; dot?: string; marker?: string }> = [
  { id: "red", label: "标红", dot: INLINE_RED },
  { id: "orange", label: "橙色", dot: INLINE_ORANGE },
  { id: "highlight", label: "高亮", marker: "==" },
  { id: "bold", label: "加粗", marker: "B" },
  { id: "clear-color", label: "清除颜色" },
];

function OutlineFormatBar({ state, onPick, onClose }: { state: FormatBarState; onPick: (format: InlineFormat) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(6, Math.min(state.x, window.innerWidth - rect.width - 6)),
      y: Math.max(6, Math.min(state.y, window.innerHeight - rect.height - 6)),
    });
  }, [state.x, state.y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  const base: CSSProperties = {
    position: "fixed",
    left: pos.x,
    top: pos.y,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: 3,
    padding: 5,
    color: "var(--wm-fg, #24292f)",
    background: "var(--wm-pop, #fff)",
    border: "1px solid var(--wm-border, rgba(128,128,128,.35))",
    borderRadius: 8,
    boxShadow: "var(--wm-shadow, 0 8px 24px rgba(0,0,0,.16))",
    font: "13px var(--wm-font, sans-serif)",
    flexWrap: "wrap",
    maxWidth: "calc(100vw - 12px)",
  };
  return (
    <div
      ref={ref}
      className="wm-outline-formatbar"
      role="toolbar"
      aria-label="文字格式工具栏"
      style={base}
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {FORMAT_BUTTONS.map((format) => (
        <button
          key={format.id}
          type="button"
          className={"wm-format-btn" + (format.dot ? " wm-format-color" : "")}
          aria-label={format.label}
          title={format.label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(format.id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 7px",
            border: "1px solid transparent",
            borderRadius: 5,
            background: "transparent",
            cursor: "pointer",
            whiteSpace: "nowrap",
            font: "inherit",
          }}
        >
          {format.dot && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: format.dot, display: "inline-block" }} />}
          {format.marker && <span aria-hidden="true" style={{ fontWeight: format.marker === "B" ? 700 : 600, textDecoration: format.marker === "==" ? "underline" : undefined }}>{format.marker}</span>}
          {format.label}
        </button>
      ))}
      <button type="button" aria-label="关闭文字格式工具栏" title="关闭" onMouseDown={(event) => event.preventDefault()} onClick={onClose} style={{ border: 0, background: "transparent", cursor: "pointer", padding: "4px 5px", fontSize: 15, lineHeight: 1, font: "inherit" }}>×</button>
    </div>
  );
}

export function Outline({ actions: a,docked,wrap,host }: { actions: Actions;docked?:boolean;wrap?:boolean;host?:Host }) {
  const rows = flatten(a.doc);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState<string | null>(a.selection[0] ?? a.doc.root.id);
  const pendingFocus = useRef<{ id: string; caret: "end" | "all" } | null>(null);
  useEffect(()=>{const id=a.selection[0];if(id){setFocusId(id);refs.current.get(id)?.scrollIntoView({block:'nearest'});}},[a.selection[0]]);

  useEffect(() => {
    const p = pendingFocus.current;
    if (!p) return;
    const el = refs.current.get(p.id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    if (p.caret === "all") el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  });

  const focusRow = (id: string, caret: "end" | "all" = "end") => {
    pendingFocus.current = { id, caret };
    setFocusId(id);
    a.select([id]);
  };

  return (
    <div className="wm-outline" style={docked?{padding:0,flex:1,minHeight:0,overflow:"auto",position:"relative",inset:"auto"}:undefined}>
      <div className="wm-outline-inner" style={docked?{maxWidth:"none",padding:0}:undefined}>
        {rows.map(({ topic, depth }, i) => (
          <OutlineRow
            host={host}
            wrap={wrap}
            key={topic.id}
            topic={topic}
            depth={depth}
            isRoot={topic.id === a.doc.root.id}
            active={focusId === topic.id}
            readOnly={a.readOnly}
            setRef={(el) => (el ? refs.current.set(topic.id, el) : refs.current.delete(topic.id))}
            onFocus={() => {
              setFocusId(topic.id);
              a.select([topic.id]);
            }}
            onToggle={() => a.readOnly?a.feature('fold',topic.id):a.apply((d) => ops.toggleCollapsed(d, topic.id))}
            onCommit={(text) => a.apply((d) => ops.setText(d, topic.id, text))}
            onKey={(e, draft) => {
              if(a.readOnly){if(e.key==="Enter"||e.key==="Tab")e.preventDefault();return;}
              const d = a.doc;
              const commitText = (doc: MindDoc) => (draft !== topic.text ? ops.setText(doc, topic.id, draft) : doc);
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                const e2 = indexDoc(d).get(topic.id)!;
                const r = e2.parent ? ops.addSibling(commitText(d), topic.id, false, { text: "" }) : ops.addChild(commitText(d), topic.id, { text: "" }, 0);
                a.apply(() => r.doc, [r.id]);
                focusRow(r.id);
              } else if (e.key === "Tab") {
                e.preventDefault();
                a.apply((doc) => (e.shiftKey ? ops.outdent(commitText(doc), topic.id) : ops.indent(commitText(doc), topic.id)));
                focusRow(topic.id);
              } else if (e.key === "Backspace" && draft === "" && topic.id !== d.root.id && !topic.children?.length) {
                e.preventDefault();
                const prev = rows[i - 1]?.topic.id ?? d.root.id;
                a.apply((doc) => ops.remove(doc, topic.id), [prev]);
                focusRow(prev);
              } else if (e.key === "ArrowUp" && !e.nativeEvent.isComposing) {
                const el = e.currentTarget;
                if (el.selectionStart === 0 || !el.value.slice(0, el.selectionStart).includes("\n")) {
                  e.preventDefault();
                  const prev = rows[i - 1];
                  if (prev) focusRow(prev.topic.id);
                }
              } else if (e.key === "ArrowDown" && !e.nativeEvent.isComposing) {
                const el = e.currentTarget;
                if (!el.value.slice(el.selectionEnd).includes("\n")) {
                  e.preventDefault();
                  const next = rows[i + 1];
                  if (next) focusRow(next.topic.id);
                }
              } else if ((e.metaKey || e.ctrlKey) && e.key === "/") {
                e.preventDefault();
                a.apply((doc) => ops.toggleCollapsed(doc, topic.id));
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OutlineRow({
  host,
  topic,
  wrap,
  depth,
  isRoot,
  active,
  readOnly,
  setRef,
  onFocus,
  onToggle,
  onCommit,
  onKey,
}: {
  host?:Host;
  topic: Topic;
  wrap?:boolean;
  depth: number;
  isRoot: boolean;
  active: boolean;
  readOnly: boolean;
  setRef: (el: HTMLTextAreaElement | null) => void;
  onFocus: () => void;
  onToggle: () => void;
  onCommit: (text: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>, draft: string) => void;
}) {
  const [draft, setDraft] = useState(topic.text);
  const [formatBar, setFormatBar] = useState<FormatBarState | null>(null);
  const preview=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement|null>(null);
  const rich=isRichText(topic.text)&&!active;
  useEffect(()=>{if(preview.current)fillRichElement(preview.current,topic.text,{renderMath:host?.renderMath,resolveImage:host?.resolveResource});},[topic.text,rich,host]);
  useEffect(() => setDraft(topic.text), [topic.text]);
  useEffect(() => {
    if (!active || readOnly) setFormatBar(null);
  }, [active, readOnly]);
  const hasKids = !!topic.children?.length;
  const applyFormat = (format: InlineFormat) => {
    const bar = formatBar;
    if (!bar) return;
    const result = applyInlineFormat(draft, bar.start, bar.end, format);
    setFormatBar(null);
    if (result.text === draft) {
      requestAnimationFrame(() => input.current?.focus());
      return;
    }
    setDraft(result.text);
    onCommit(result.text);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(result.start, result.end);
    });
  };
  return (
    <div className={"wm-orow" + (isRoot ? " wm-orow-root" : "") + (active ? " wm-active" : "")} style={{ paddingLeft: 8 + depth * 22 }}>
      <button className={"wm-obullet" + (hasKids ? " wm-has-kids" : "") + (topic.collapsed ? " wm-collapsed" : "")} onClick={hasKids ? onToggle : undefined} tabIndex={-1}>
        <span />
      </button>
      <textarea
        ref={element=>{input.current=element;setRef(element);}}
        className="wm-otext"
        rows={1}
        style={rich?{display:'none'}:wrap===false?{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}:undefined}
        value={draft}
        readOnly={readOnly}
        placeholder={t("emptyText")}
        title={readOnly ? undefined : "选中文字后右键，可标红或设置格式"}
        onFocus={onFocus}
        onChange={(e) => { setDraft(e.target.value); setFormatBar(null); }}
        onContextMenu={(e) => {
          if (readOnly) return;
          const el = e.currentTarget;
          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? 0;
          if (start === end) return;
          e.preventDefault();
          e.stopPropagation();
          setFormatBar({ x: e.clientX, y: e.clientY, start, end });
        }}
        onBlur={() => {
          setFormatBar(null);
          if (draft !== topic.text) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && formatBar) {
            e.preventDefault();
            e.stopPropagation();
            setFormatBar(null);
            return;
          }
          onKey(e, draft);
        }}
      />
      {rich&&<div ref={preview} role="button" tabIndex={0} style={{flex:1,minWidth:0,padding:'5px 4px',whiteSpace:wrap===false?'nowrap':'normal',overflow:'hidden',textOverflow:'ellipsis',cursor:'text'}} onClick={()=>{onFocus();requestAnimationFrame(()=>input.current?.focus());}} onKeyDown={event=>{if(event.key==='Enter'){onFocus();requestAnimationFrame(()=>input.current?.focus());}}}/>}
      {formatBar && <OutlineFormatBar state={formatBar} onPick={applyFormat} onClose={() => setFormatBar(null)} />}
    </div>
  );
}
