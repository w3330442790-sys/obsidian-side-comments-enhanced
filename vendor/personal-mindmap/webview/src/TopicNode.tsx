import { memo, useContext } from "react";
import type { NodeBox } from "../../src/core/layout";
import { markerDef } from "../../src/core/markers";
import { SELECTION_COLOR, withAlpha, type ResolvedStyle } from "../../src/core/theme";
import type { Shape } from "../../src/core/types";
import { RichEnvironment, RichTopic } from "./RichTopic";
import { Rough } from "./rough";
import { ICON_SIZE, LABEL_FONT_SIZE, LABEL_HEIGHT, type Content, type Metrics } from "./measure";

export function shapePath(shape: Shape, w: number, h: number, root = false, radius?: number): string {
  switch (shape) {
    case "rect":
      return `M0,0 H${w} V${h} H0 Z`;
    case "capsule": {
      const r = h / 2;
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 ${r},0 Z`;
    }
    case "ellipse":
      return `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2} Z`;
    case "rounded":
    default: {
      const r = Math.max(0,Math.min(radius ?? (root ? 10 : 7),h/2,w/2));
      return `M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;
    }
  }
}

function Marker({ id, x, y, size }: { id: string; x: number; y: number; size: number }) {
  const def = markerDef(id);
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  if (!def && /\p{Extended_Pictographic}/u.test(id)) return <text x={cx} y={cy} dy=".36em" textAnchor="middle" fontSize={size*.95} fontFamily="sans-serif">{id}</text>;
  if (!def) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill="#8E8C99" />
        <text x={cx} y={cy} dy="0.35em" textAnchor="middle" fontSize={size * 0.65} fill="#fff" fontWeight={700} fontFamily="sans-serif">
          ?
        </text>
      </g>
    );
  }
  if (def.category === "task") {
    const p = def.progress ?? 0;
    const a = (p / 100) * Math.PI * 2;
    const ir = r - 2.5;
    const ex = cx + ir * Math.sin(a);
    const ey = cy - ir * Math.cos(a);
    return (
      <g>
        <circle cx={cx} cy={cy} r={r - 0.75} fill={p === 100 ? def.color : "#fff"} stroke={def.color} strokeWidth={1.5} />
        {p > 0 && p < 100 && <path d={`M${cx},${cy} L${cx},${cy - ir} A${ir},${ir} 0 ${p > 50 ? 1 : 0} 1 ${ex},${ey} Z`} fill={def.color} />}
        {p === 100 && (
          <path d={`M${cx - r * 0.45},${cy + 0.5} L${cx - r * 0.1},${cy + r * 0.38} L${cx + r * 0.48},${cy - r * 0.35}`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </g>
    );
  }
  if (def.category === "flag" || def.category === "star") {
    return (
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={size * 1.02} fill={def.color} fontFamily="sans-serif">
        {def.glyph}
      </text>
    );
  }
  if (def.category === "smiley" || def.id === "symbol-idea") {
    return (
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={size * 0.9} fontFamily="sans-serif">
        {def.glyph}
      </text>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={def.color} />
      <text x={cx} y={cy} dy="0.36em" textAnchor="middle" fontSize={size * 0.62} fill="#fff" fontWeight={700} fontFamily="sans-serif">
        {def.glyph}
      </text>
    </g>
  );
}

function NoteIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`} data-kind="note-icon">
      <rect x={1.5} y={0.5} width={11} height={13} rx={2} fill="none" stroke={color} strokeWidth={1.3} />
      <path d="M4,4.5 H10 M4,7.5 H10 M4,10.5 H8" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

function LinkIcon({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x},${y})`} data-kind="link-icon">
      <rect x={0} y={0} width={14} height={14} fill="transparent" />
      <path
        d="M6,8 a2.6,2.6 0 0 0 3.7,0 l2.2,-2.2 a2.6,2.6 0 0 0 -3.7,-3.7 l-0.9,0.9 M8,6 a2.6,2.6 0 0 0 -3.7,0 l-2.2,2.2 a2.6,2.6 0 0 0 3.7,3.7 l0.9,-0.9"
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  );
}

export interface FoldInfo {
  collapsed: boolean;
  count: number;
}

interface Props {
  box: NodeBox;
  style: ResolvedStyle;
  m: Metrics;
  content: Content;
  selected: boolean;
  dropTarget?: boolean;
  fold?: FoldInfo;
  ghost?: boolean;
  background: string;
}

function foldPos(box: NodeBox): { x: number; y: number } {
  const lx = box.outX - box.x;
  const ly = box.outY - box.y;
  if (box.orient === "h") return { x: box.dir === 1 ? box.w + 9 : -9, y: ly };
  return { x: lx, y: box.h + 9 };
}

export const TopicNode = memo(function TopicNode({ box, style: s, m, content, selected, dropTarget, fold, ghost, background }: Props) {
  const { w, h } = box;
  const richEnv = useContext(RichEnvironment);
  const covered = !!richEnv.studyMode && !richEnv.revealed?.has(box.id) && (content.text.includes("🙈") || content.markers?.includes("🙈") || content.markers?.includes("answer"));
  const fill = s.fill === "none" ? "transparent" : s.fill;
  const hasBorder = s.border !== "none" && s.borderWidth > 0;
  const iconColor = withAlpha(s.textColor.startsWith("#") ? s.textColor : "#888888", 0.75) as string;
  const fp = fold ? foldPos(box) : null;
  const linkX = m.iconsX + (content.note ? ICON_SIZE + 4 : 0);
  return (
    <g
      className={"wm-topic" + (ghost ? " wm-ghost" : "")}
      transform={`translate(${box.x},${box.y})`}
      data-kind={box.kind === "summary" ? "summary" : "topic"}
      data-id={box.id}
      opacity={content.viewHidden ? .45 : richEnv.studyMode && content.studyOption && content.studyShown && !content.studyCorrect ? .5 : undefined}
    >
      {s.hand ? (
        <>
          {/* 先铺一层画布底色:斜线之间是空的,不铺的话连线会从节点里穿过去 */}
          {s.shape === "underline" || s.shape === "none" ? (
            <rect x={0} y={0} width={w} height={h} fill="transparent" />
          ) : (
            <path d={shapePath(s.shape, w, h, s.kind === "root",s.radius)} fill={background} />
          )}
          <Rough
            id={box.id}
            geo={s.shape === "rounded" && s.radius !== undefined ? {t:"path", d:shapePath(s.shape,w,h,s.kind === "root",s.radius),size:Math.max(w,h)} : { t: "shape", shape: s.shape, w, h }}
            style={{
              stroke: hasBorder ? s.border : "none",
              strokeWidth: hasBorder ? s.borderWidth : 2,
              fill: s.shape === "underline" ? undefined : s.fill,
              dashed:s.borderDashed,
              fillStyle: s.fillStyle === "none" ? undefined : s.fillStyle,
            }}
          />
        </>
      ) : s.shape === "underline" ? (
        <>
          <rect x={0} y={0} width={w} height={h} fill={fill} />
          {hasBorder && <line x1={0} y1={h} x2={w} y2={h} stroke={s.border} strokeWidth={s.borderWidth} strokeLinecap="round" strokeDasharray={s.borderDashed ? "6 4" : undefined} />}
        </>
      ) : s.shape === "none" ? (
        <rect x={0} y={0} width={w} height={h} fill={fill} />
      ) : (
        <path d={shapePath(s.shape, w, h, s.kind === "root",s.radius)} fill={fill} stroke={hasBorder ? s.border : "none"} strokeWidth={hasBorder ? s.borderWidth : 0} strokeDasharray={s.borderDashed ? "6 4" : undefined} />
      )}
      <g visibility={covered ? "hidden" : undefined}>
      {(content.markers ?? []).map((id, i) => (
        <Marker key={id + i} id={id} x={m.markersX + i * (m.markerSize + 3)} y={m.markersY} size={m.markerSize} />
      ))}
      {m.rich ? <RichTopic topicId={box.id} text={content.text} x={m.textX} y={m.textY} w={m.textW} h={m.textH} font={m.font} lineHeight={m.lineHeight} align={s.textAlign} color={s.textColor} strike={s.strike} /> : <text
        fontFamily={s.fontFamily}
        fontSize={s.fontSize}
        fontWeight={s.bold ? 600 : 400}
        fontStyle={s.italic ? "italic" : undefined}
        textDecoration={s.strike ? "line-through" : undefined}
        fill={content.text ? s.textColor : withAlpha(s.textColor, 0.45)}
        style={{ whiteSpace: "pre" }}
      >
        {m.lines.map((line, i) => (
          <tspan
            key={i}
            x={s.textAlign === "left" ? m.textX : s.textAlign === "right" ? m.textX + m.textW : m.textX + m.textW / 2}
            y={m.textY + i * m.lineHeight + m.lineHeight / 2}
            dy="0.35em"
            textAnchor={s.textAlign === "left" ? "start" : s.textAlign === "right" ? "end" : "middle"}
          >
            {line || " "}
          </tspan>
        ))}
      </text>}
      {m.extras?.map((extra,i)=><g key={i} data-kind={extra.kind === "note" ? "note-card" : "callout"}>
        <rect x={s.padX} y={m.extraY+extra.y} width={Math.max(12,w-s.padX*2)} height={extra.h} rx={5} fill={extra.kind === "callout" && content.calloutColor ? content.calloutColor : s.branchColor} fillOpacity={extra.kind === "callout" && content.calloutColor ? .12 : .09} stroke={extra.kind === "callout" && content.calloutColor ? content.calloutColor : s.branchColor} strokeOpacity={.25} />
        <RichTopic markdown={extra.kind === "note"} topicId={box.id} text={extra.text} x={s.padX+6} y={m.extraY+extra.y+6} w={Math.max(1,w-s.padX*2-12)} h={extra.h-12} font={m.font} lineHeight={m.lineHeight} align="left" color={s.textColor} />
        {extra.kind==='note'&&<g className="wm-ui"><rect data-kind="note-collapse" x={w-25} y={s.padY+extra.y+2} width={16} height={14} rx={3} fill={background} stroke={iconColor}/><path d={`M${w-21},${s.padY+extra.y+9}h8`} stroke={iconColor} pointerEvents="none"/><rect data-kind="note-resize" x={w-15} y={s.padY+extra.y+extra.h-12} width={12} height={12} fill={iconColor} opacity={.6} style={{cursor:'nwse-resize'}}/></g>}
      </g>)}
      {content.studyQuestion && richEnv.studyMode && !richEnv.revealed?.has(box.id) && <g data-kind="reveal" role="button" aria-label="点击揭晓选项" tabIndex={0} onClick={ev=>{ev.stopPropagation();richEnv.reveal?.(box.id);}} onKeyDown={ev=>{if(ev.key === "Enter" || ev.key === " "){ev.preventDefault();richEnv.reveal?.(box.id);}}}>
        <title>{content.studyMultiple ? "多选题 · 点击揭晓答案" : "单选题 · 点击揭晓答案"}</title><circle cx={w-2} cy={2} r={9} fill={background} stroke={s.branchColor}/><text x={w-2} y={2} dy=".35em" textAnchor="middle" fontSize={11} fill={s.textColor}>?</text>
      </g>}
      {!richEnv.studyMode && /^\s*\[[xX ]\]\s/.test(content.text) && <rect data-kind="task-toggle" data-id={box.id} x={m.textX} y={m.textY} width={Math.min(26,m.textW)} height={m.lineHeight} fill="transparent"><title>切换任务完成状态</title></rect>}
      {content.note && <NoteIcon x={m.iconsX} y={m.iconsY} color={iconColor} />}
      {content.link && <LinkIcon x={linkX} y={m.iconsY} color={iconColor} />}
      {(content.labels ?? []).map((l, i) => {
        const x = m.labelsX + m.labelWidths.slice(0, i).reduce((a, b) => a + b + 4, 0);
        return (
          <g key={l + i}>
            <rect x={x} y={m.labelsY} width={m.labelWidths[i]} height={LABEL_HEIGHT} rx={LABEL_HEIGHT / 2} fill={withAlpha(s.branchColor, 0.16)} />
            <text x={x + m.labelWidths[i] / 2} y={m.labelsY + LABEL_HEIGHT / 2} dy="0.35em" textAnchor="middle" fontSize={LABEL_FONT_SIZE} fontWeight={500} fontFamily={s.fontFamily} fill={s.kind === "main" || s.kind === "root" ? s.textColor : s.branchColor}>
              {l}
            </text>
          </g>
        );
      })}
      </g>
      {richEnv.studyMode && content.studyOption && content.studyShown && content.studyCorrect && <rect x={-2} y={-2} width={w+4} height={h+4} rx={7} fill="none" stroke="#2eaf68" strokeWidth={2}/>}
      {covered && <g data-kind="reveal" onClick={ev=>{ev.stopPropagation();richEnv.reveal?.(box.id);}} role="button" aria-label="Reveal answer" tabIndex={0} onKeyDown={ev=>{if(ev.key === "Enter" || ev.key === " "){ev.preventDefault();richEnv.reveal?.(box.id);}}}>
        <rect x={0} y={0} width={w} height={h} rx={7} fill={background} stroke={s.branchColor} strokeDasharray="4 3" />
        <text x={w/2} y={h/2} dy=".35em" textAnchor="middle" fontFamily={s.fontFamily} fontSize={s.fontSize} fill={s.textColor}>🙈 ···</text>
      </g>}
      <rect className="wm-ui wm-hover" x={-4} y={-4} width={w + 8} height={h + 8} rx={8} fill="none" stroke={withAlpha(SELECTION_COLOR, 0.4)} strokeWidth={1.5} />
      {selected && <rect className="wm-ui" x={-4} y={-4} width={w + 8} height={h + 8} rx={8} fill="none" stroke={SELECTION_COLOR} strokeWidth={2} />}
      {dropTarget && <rect className="wm-ui" x={-5} y={-5} width={w + 10} height={h + 10} rx={9} fill={withAlpha(SELECTION_COLOR, 0.08)} stroke={SELECTION_COLOR} strokeWidth={2} strokeDasharray="5 3" />}
      {fold && fp && (
        <g className={"wm-ui wm-fold" + (fold.collapsed ? " wm-fold-on" : "")} transform={`translate(${fp.x},${fp.y})`} data-kind="fold" data-id={box.id}>
          <circle r={fold.collapsed ? 9 : 7} fill={background} stroke={s.lineColor} strokeWidth={1.5} />
          {fold.collapsed ? (
            <text dy="0.35em" textAnchor="middle" fontSize={fold.count > 99 ? 8 : 10} fontWeight={600} fill={s.lineColor} fontFamily="sans-serif">
              {fold.count > 999 ? "999+" : fold.count}
            </text>
          ) : (
            <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke={s.lineColor} strokeWidth={1.6} strokeLinecap="round" />
          )}
        </g>
      )}
    </g>
  );
});
