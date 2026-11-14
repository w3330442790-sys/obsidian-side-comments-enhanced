// 文档 → 可渲染的场景:最终样式、节点尺寸、布局
import { resolveAll, type Palette, type ResolvedStyle } from "../../src/core/theme";
import { layout, SPACING, alignTierSizes, type LayoutResult, type NodeSize } from "../../src/core/layout";
import type { Look, MindDoc, Range, Topic } from "../../src/core/types";
import { measure, type Metrics } from "./measure";
import { t } from "./i18n";

export interface Scene {
  palette: Palette;
  look: Look;
  styles: Map<string, ResolvedStyle>;
  metrics: Map<string, Metrics>;
  layout: LayoutResult;
  /** id → 节点或概括数据 */
  topics: Map<string, Topic>;
  ranges: Map<string, { owner: Topic; kind: "summaries" | "boundaries"; range: Range }>;
}

export function buildScene(doc: MindDoc, dark: boolean, settings:{fontScale?:number;spacingScale?:number} = {}): Scene {
  const { palette, styles, look } = resolveAll(doc, dark);
  const fontScale=Number.isFinite(settings.fontScale)?Math.max(.5,Math.min(3,settings.fontScale!/100)):1;
  if(fontScale!==1)for(const [id,st] of styles)styles.set(id,{...st,fontSize:st.fontSize*fontScale});
  const metrics = new Map<string, Metrics>();
  const sizes = new Map<string, NodeSize>();
  const topics = new Map<string, Topic>();
  const ranges: Scene["ranges"] = new Map();
  const visit = (tp: Topic) => {
    topics.set(tp.id, tp);
    const st = styles.get(tp.id)!;
    const placeholder = t("emptyText");
    const m = measure(tp, tp, st, placeholder);
    metrics.set(tp.id, m);
    sizes.set(tp.id, m);
    for (const s of tp.summaries ?? []) {
      ranges.set(s.id, { owner: tp, kind: "summaries", range: s });
      const ss = styles.get(s.id);
      if (!ss) continue;
      const sm = measure(s, { text: s.text ?? "",width:typeof s.width==="number"?s.width:undefined }, ss, t("newSummary"));
      metrics.set(s.id, sm);
      sizes.set(s.id, sm);
    }
    for (const b of tp.boundaries ?? []) ranges.set(b.id, { owner: tp, kind: "boundaries", range: b });
    if (!tp.collapsed) for (const c of tp.children ?? []) visit(c);
    else for (const c of tp.children ?? []) collect(c);
  };
  // 折叠分支里的节点不排版,但仍登记,方便查找
  const collect = (tp: Topic) => {
    topics.set(tp.id, tp);
    for (const c of tp.children ?? []) collect(c);
  };
  visit(doc.root);
  for (const f of doc.floating ?? []) visit(f);
  const tiers=new Map([...topics.keys()].map(id=>[id,Math.min(styles.get(id)?.depth??0,3)]));
  const aligned=palette.tierStyles?.map(st=>!!st.align)??[];
  const resized=alignTierSizes(sizes,tiers,aligned,new Set([...topics].filter(([,tp])=>typeof tp.width==="number").map(([id])=>id)));
  for(const [id,size] of resized){const m=metrics.get(id);if(!m||m.w===size.w)continue;const st=styles.get(id)!;const dx=st.textAlign==="left"?0:st.textAlign==="right"?size.w-m.w:(size.w-m.w)/2;metrics.set(id,{...m,w:size.w,textX:m.textX+dx,markersX:m.markersX+dx,iconsX:m.iconsX+dx,labelsX:m.labelsX+dx});}
  const themeSpacing=palette.spacing==="compact"?{rootGapX:72,gapX:26,gapY:8,rootGapY:26}:palette.spacing==="loose"?{rootGapX:120,gapX:50,gapY:18,rootGapY:56}:palette.spacing==="normal"?{rootGapX:96,gapX:36,gapY:12,rootGapY:40}:{};
  const spacing={...SPACING,...themeSpacing};const spacingScale=Number.isFinite(settings.spacingScale)?Math.max(.25,Math.min(3,settings.spacingScale!/100)):1;
  for(const key of Object.keys(spacing) as (keyof typeof SPACING)[])spacing[key]*=spacingScale;
  return { palette, look, styles, metrics, layout: layout(doc, resized,spacing), topics, ranges };
}
