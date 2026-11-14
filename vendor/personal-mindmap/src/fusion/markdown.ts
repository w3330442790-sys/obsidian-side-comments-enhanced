import type { MindDoc, Topic, Range, Structure } from '../core/types';
import { parseMarkdown, serializeMarkdown, normalizeKinds, convertLevelKind, markerText, frontmatterValue, setFrontmatterValue, type ParseOptions } from '../../vendor/gogoga/src/markdown';
import { createNode, type MindDoc as MarkdownDoc, type MindNode } from '../../vendor/gogoga/src/model';
import { preserveFormat } from '../../vendor/gogoga/src/merge';

export type MarkdownFusionOptions = Omit<ParseOptions, 'lines' | 'fallbackTitle'>;
type SourceNode = Partial<Omit<MindNode, 'parent' | 'children'>>;
interface SourceDoc { frontmatter: string; preamble: string; rootFromHeading: boolean; style: MarkdownDoc['style']; original?: string; snapshot?: string }
const EXT = /\n?<!-- wmind-fusion:v1 ([^\r\n]*?) -->\s*$/;
const GOGOGA_THEMES = new Set(['snow', 'rainbow', 'business', 'warm', 'mono', 'line', 'forest']);
function extension(source: string): { body: string; saved?: MindDoc; canonical?: string; identities?: Record<string,string> } {
  const match = EXT.exec(source);
  if (match) try {
    const payload = JSON.parse(decodeURIComponent(match[1])) as MindDoc & { doc?: MindDoc; canonical?: string; identities?: Record<string,string> };
    const saved = payload.doc ?? payload;
    if (saved && typeof saved === 'object' && saved.root && typeof saved.root.text === 'string' && typeof saved.root.id === 'string') return { body: source.slice(0, match.index), saved, canonical: payload.canonical, identities: payload.identities };
  } catch { /* Malformed comments are ordinary Markdown, never discard them. */ }
  return {body: source};
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const clean = (doc: MindDoc): string => JSON.stringify(doc, (key, value) => key === 'markdown' ? undefined : value);
const sourceNode = (node: MindNode): SourceNode => {
  const { parent: _parent, children: _children, hiddenAfter: _after, hiddenFirst: _first, ...rest } = node;
  return copy(rest);
};

/** Convert the upstream syntax tree without losing its source-only fields. */
export function markdownTreeToDoc(parsed: MarkdownDoc, lines?: Map<MindNode, number>): MindDoc {
  const relationships: NonNullable<MindDoc['relationships']> = [];
  const anchors = new Map<string, string>();
  const all: MindNode[] = [];
  const collect = (n: MindNode) => { all.push(n); if (n.anchor) anchors.set(n.anchor, n.id); n.children.forEach(collect); };
  collect(parsed.root);
  const convert = (n: MindNode): Topic => {
    const topic: Topic = { id: n.id, text: n.text, markdown: { ...sourceNode(n), sourceLine: lines?.get(n) } };
    if (n.note) topic.note = n.note;
    if (n.folded) topic.collapsed = true;
    if (n.color) topic.style = { fill: n.color };
    for (const key of ['width', 'side', 'callout', 'calloutColor', 'hidden', 'blockId'] as const) if (n[key] !== undefined) topic[key] = n[key];
    if (n.float) topic.position = { ...n.float };
    topic.children = n.children.filter(c => !c.float || n !== parsed.root).map(convert);
    for (const [key, upstream] of [['boundaries', 'box'], ['summaries', 'summary']] as const) {
      const ranges: Range[] = [];
      n.children.forEach((c, i) => {
        const range = c[upstream];
        if (!range) return;
        ranges.push({ id: `${upstream}-${c.id}`, from: c.id, to: n.children[Math.min(n.children.length - 1, i + range.span - 1)].id,
          text: upstream === 'box' ? c.box!.title : c.summary!.text,
          ...(upstream === 'summary' && c.summary!.width ? { width: c.summary!.width } : {}) });
      });
      if (ranges.length) topic[key] = ranges;
    }
    return topic;
  };
  const doc: MindDoc = { version: 1, root: convert(parsed.root), markdown: {
    frontmatter: parsed.frontmatter, preamble: parsed.preamble, rootFromHeading: parsed.rootFromHeading, style: copy(parsed.style),
  } };
  const floating = parsed.root.children.filter(n => n.float).map(convert);
  if (floating.length) doc.floating = floating;
  for (const n of all) for (const r of n.rels ?? []) {
    const to = anchors.get(r.to);
    if (to) relationships.push({id: `rel-${n.id}-${relationships.length}`, from: n.id, to, text: r.label, ...(r.c ? { markdownControl: r.c } : {})});
  }
  if (relationships.length) doc.relationships = relationships;
  const aliases: Record<string, Structure> = {'logic-right':'logic', 'mindmap':'map', 'org-down':'org', 'tree-right':'tree'};
  const value = frontmatterValue(parsed.frontmatter, 'mindmap-structure') ?? frontmatterValue(parsed.frontmatter, 'structure');
  const structure = value ? aliases[value] ?? value : null;
  if (structure && ['map', 'logic', 'org', 'tree'].includes(structure)) doc.structure = structure as Structure;
  const theme = frontmatterValue(parsed.frontmatter, 'mindmap-theme') ?? frontmatterValue(parsed.frontmatter, 'theme');
  if (theme) {
    const id = theme.replace(/^['"]|['"]$/g, '');
    doc.theme = frontmatterValue(parsed.frontmatter, 'mindmap-theme') !== null && GOGOGA_THEMES.has(id) ? `gogoga-${id}` : id;
  }
  return doc;
}

export function parseMarkdownDoc(source: string, title: string, options: MarkdownFusionOptions = {}): MindDoc {
  const {body, saved, canonical, identities} = extension(source);
  const lines = new Map<MindNode, number>();
  const parsed = parseMarkdown(body, { ...options, fallbackTitle: title, showHidden: true, lines });
  const digest=(key:string)=>{let a=2166136261,b=3335557771;for(const char of key){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b^char.charCodeAt(0),2246822519);}return (a>>>0).toString(36)+(b>>>0).toString(36);};
  const stable=(node:MindNode,path:string)=>{
    node.id='md-'+digest(node.blockId?'block:'+node.blockId:node.anchor?'anchor:'+node.anchor:path);
    const repeats=new Map<string,number>();
    for(const child of node.children){const occurrence=repeats.get(child.text)??0;repeats.set(child.text,occurrence+1);stable(child,path+'/'+child.text+'#'+occurrence);}
  };
  stable(parsed.root,'root');
  const doc = markdownTreeToDoc(parsed, lines);
  if (saved && canonical === serializeMarkdown(parsed)) {
    const restore = (current: Topic | undefined, prior: Topic): Topic => ({...copy(prior), ...(current?.markdown ? {markdown: current.markdown} : {}), ...(prior.children ? {children: prior.children.map((child, i) => restore(current?.children?.[i], child))} : {})});
    const restored = {...copy(saved), markdown: doc.markdown, root: restore(doc.root, saved.root)};
    if (saved.floating) restored.floating = saved.floating.map((node, i) => restore(doc.floating?.[i], node));
    Object.assign(doc, restored);
  } else
  if (saved) {
    try {
      const ids = new Map<string, string>();
      const flatten = (root: Topic): Topic[] => [root, ...(root.children ?? []).flatMap(flatten)];
      const previous = [saved.root, ...(saved.floating ?? [])].flatMap(flatten);
      const currentTopics = [doc.root, ...(doc.floating ?? [])].flatMap(flatten);
      const baseline = canonical ? markdownTreeToDoc(parseMarkdown(canonical, {...options, fallbackTitle:title, showHidden:true})) : undefined;
      if (baseline) {
        const topics=[baseline.root,...(baseline.floating??[])].flatMap(flatten);
        const baselineIds=new Map<string,string>();
        for(const topic of topics){
          const anchor=(topic.markdown as SourceNode|undefined)?.anchor;
          const candidates=previous.filter(prior=>prior.text===topic.text);
          const id=(anchor?identities?.[anchor]:undefined)??(candidates.length===1?candidates[0].id:undefined);
          if(id)baselineIds.set(topic.id,id);
        }
        for(const topic of topics){
          topic.id=baselineIds.get(topic.id)??topic.id;
          for(const key of ['boundaries','summaries'] as const)for(const range of topic[key]??[]){range.from=baselineIds.get(range.from)??range.from;range.to=baselineIds.get(range.to)??range.to;}
        }
        for(const relation of baseline.relationships??[]){relation.from=baselineIds.get(relation.from)??relation.from;relation.to=baselineIds.get(relation.to)??relation.to;}
      }
      const baselineTopics=baseline?[baseline.root,...(baseline.floating??[])].flatMap(flatten):[];
      const rangeKey=(r:Range)=>JSON.stringify([r.from,r.to,r.text??'',r.width??null]);
      const relationKey=(r:NonNullable<MindDoc['relationships']>[number])=>{
        const c=r.markdownControl as {x:number;y:number}|undefined;
        return JSON.stringify([r.from,r.to,markerText(r.text??''),c?[Math.round(c.x),Math.round(c.y)]:null]);
      };
      const sameNative=<T>(a:T[],b:T[],key:(item:T)=>string)=>JSON.stringify(a.map(key).sort())===JSON.stringify(b.map(key).sort());
      let needsRecovery=false;
      const matched = new Set<string>();
      const locate = (current: Topic): Topic | undefined => {
        const anchor = (current.markdown as SourceNode | undefined)?.anchor;
        const id = anchor ? identities?.[anchor] : undefined;
        if (id && currentTopics.filter(n => (n.markdown as SourceNode | undefined)?.anchor === anchor).length === 1) return previous.find(n => n.id === id);
        const candidates = previous.filter(n => n.text === current.text);
        return candidates.length === 1 && currentTopics.filter(n => n.text === current.text).length === 1 ? candidates[0] : undefined;
      };
      const overlay = (current: Topic) => {
        const prior = locate(current);
        if (!prior) { current.children?.forEach(overlay); return; }
        matched.add(prior.id);
        const fill = current.style?.fill;
        ids.set(current.id, prior.id);
        const { text: _text, note: _note, collapsed: _collapsed, position: _position, children, markdown: _markdown,
          boundaries: _boundaries, summaries: _summaries, width: _width, side: _side, hidden: _hidden,
          callout: _callout, calloutColor: _calloutColor, blockId: _blockId, ...extra } = prior;
        Object.assign(current, extra);
        if (current.style) { current.style = { ...current.style }; if (fill) current.style.fill = fill; else delete current.style.fill; }
        current.children?.forEach(overlay);
        for (const key of ['boundaries', 'summaries'] as const) {
          const ranges=(current[key]??[]).map(range=>({...range,from:ids.get(range.from)??range.from,to:ids.get(range.to)??range.to}));
          const before=baselineTopics.find(topic=>topic.id===prior.id)?.[key]??[];
          if(baseline&&sameNative(ranges,before,rangeKey))current[key]=prior[key]?copy(prior[key]):undefined;
          else {
            current[key]=ranges.length?ranges.map(range=>{
              const source=before.find(r=>r.from===range.from);
              const candidates=(prior[key]??[]).filter(r=>rangeKey(r)===rangeKey(source??range));
              const original=candidates.length===1?candidates[0]:undefined;
              if(candidates.length>1)needsRecovery=true;
              return {...original,...range,id:original?.id??range.id};
            }):undefined;
            // Additional overlapping groups have no independent native marker. Retain their
            // originals in recovery when a real marker edit prevents an exact reconciliation.
            if((prior[key]?.length??0)>before.length)needsRecovery=true;
          }
        }
      };
      const {root, floating, markdown: _markdown, relationships: _rels, theme: _theme, structure: _structure, ...extra} = saved;
      Object.assign(doc, extra);
      overlay(doc.root);
      doc.floating?.forEach(overlay);
      const relations=(doc.relationships??[]).map(r=>({...r,from:ids.get(r.from)??r.from,to:ids.get(r.to)??r.to}));
      if(baseline&&sameNative(relations,baseline.relationships??[],relationKey))doc.relationships=saved.relationships?copy(saved.relationships):undefined;
      else {
        const originals=saved.relationships??[];
        const associations=new Map<number,number>();const used=new Set<number>();
        // Resolve unchanged labels first, so an edited parallel edge cannot steal its sibling's style.
        for(const [i,r]of relations.entries()){
          const candidates=originals.map((prior,j)=>({prior,j})).filter(({prior,j})=>!used.has(j)&&relationKey(prior)===relationKey(r));
          if(candidates.length===1){associations.set(i,candidates[0].j);used.add(candidates[0].j);}
          else if(candidates.length>1)needsRecovery=true;
        }
        for(const [i,r]of relations.entries())if(!associations.has(i)){
          const candidates=originals.map((prior,j)=>({prior,j})).filter(({prior,j})=>!used.has(j)&&prior.from===r.from&&prior.to===r.to);
          if(candidates.length===1){associations.set(i,candidates[0].j);used.add(candidates[0].j);}
          else if(candidates.length>1)needsRecovery=true;
        }
        doc.relationships=relations.length?relations.map((r,i)=>{
          const at=associations.get(i),prior=at===undefined?undefined:originals[at];
          const unchanged=prior&&relationKey(prior)===relationKey(r);
          return {...prior,...r,id:prior?.id??r.id,text:unchanged?prior.text:r.text};
        }):undefined;
        if(originals.some(prior=>!(baseline?.relationships??[]).some(r=>relationKey(r)===relationKey(prior))))needsRecovery=true;
      }
      if (matched.size < previous.length||needsRecovery) {
        doc.fusionWarnings = ['Some saved metadata could not be matched safely after Markdown edits; it is retained in fusionRecovery.'];
        doc.fusionRecovery = saved;
      }
    } catch { /* An invalid extension remains ordinary source content on the next write. */ }
  }
  const metadata = doc.markdown as SourceDoc;
  metadata.original = source;
  metadata.snapshot = clean(doc);
  return doc;
}

function toMarkdownTree(doc: MindDoc, title: string, options: MarkdownFusionOptions): MarkdownDoc {
  const meta = doc.markdown as SourceDoc | undefined;
  const fallback = parseMarkdown('', { ...options, fallbackTitle: title });
  const tree: MarkdownDoc = { ...fallback, rootFromHeading: true, ...(meta ? {frontmatter: meta.frontmatter, preamble: meta.preamble, rootFromHeading: meta.rootFromHeading, style: meta.style} : {}) };
  const nodes = new Map<string, MindNode>();
  const build = (topic: Topic, parent: MindNode | null): MindNode => {
    const old = (topic.markdown ?? {}) as SourceNode;
    const depth = parent ? parent.depth + 1 : 0;
    const n = createNode({ ...old, parent, id: topic.id, text: topic.text, note: topic.note ?? '', folded: !!topic.collapsed,
      kind: old.kind ?? (depth < 3 ? 'heading' : 'list'), level: old.level ?? (depth < 3 ? depth + 1 : 0),
      color: topic.style?.fill, float: topic.position, box: undefined, summary: undefined, rels: undefined });
    for (const key of ['width', 'side', 'callout', 'calloutColor', 'hidden', 'blockId'] as const) (n as unknown as Record<string, unknown>)[key] = topic[key];
    nodes.set(topic.id, n);
    n.children = (topic.children ?? []).map(c => build(c, n));
    if (!parent) n.children.push(...(doc.floating ?? []).map(c => build(c, n)));
    for (const [key, upstream] of [['boundaries', 'box'], ['summaries', 'summary']] as const) for (const range of topic[key] ?? []) {
      const start = n.children.findIndex(c => c.id === range.from), end = n.children.findIndex(c => c.id === range.to);
      if (start < 0 || end < start) continue;
      if (upstream === 'box') n.children[start].box = { span: end - start + 1, title: range.text ?? '' };
      else n.children[start].summary = { span: end - start + 1, text: range.text ?? '', ...(range.width ? {width: Number(range.width)} : {}) };
    }
    return n;
  };
  tree.root = build(doc.root, null);
  normalizeKinds(tree);
  // Markdown lists following a heading otherwise serialize before it or become its children.
  const keepSiblingOrder=(parent:MindNode)=>{
    let headingSeen=false;
    for(const node of parent.children){
      if(parent.kind==='heading'&&parent.level<6){
        if(node.kind==='heading')headingSeen=true;
        else if(headingSeen){node.kind='heading';node.level=parent.level+1;}
      }
      keepSiblingOrder(node);
    }
  };
  keepSiblingOrder(tree.root);
  const used = new Set([...nodes.values()].map(n => n.anchor).filter(Boolean));
  let anchorIndex = 0;
  for (const n of nodes.values()) if (!n.anchor) {
    let anchor: string;
    do { anchor = `wf${++anchorIndex}`; } while (used.has(anchor));
    n.anchor = anchor; used.add(anchor);
  }
  for (const r of doc.relationships ?? []) {
    const from = nodes.get(r.from), to = nodes.get(r.to);
    if (!from || !to) continue;
    to.anchor ??= `wm${nodes.size}_${[...nodes.keys()].indexOf(r.to)}`;
    (from.rels ??= []).push({to: to.anchor, label: r.text ?? '', ...(r.markdownControl ? {c: r.markdownControl as {x:number;y:number}} : {})});
  }
  if (doc.structure) {
    const gogoga = frontmatterValue(tree.frontmatter, 'mindmap-structure') !== null;
    const names = {map:'mindmap', logic:'logic-right', org:'org-down', tree:'tree-right'};
    tree.frontmatter = setFrontmatterValue(tree.frontmatter, gogoga ? 'mindmap-structure' : 'structure', gogoga ? names[doc.structure] : doc.structure);
  }
  if (doc.theme) {
    const gogoga = frontmatterValue(tree.frontmatter, 'mindmap-theme') !== null;
    const theme = gogoga && doc.theme.startsWith('gogoga-') ? doc.theme.slice(7) : doc.theme;
    tree.frontmatter = setFrontmatterValue(tree.frontmatter, gogoga ? 'mindmap-theme' : 'theme', theme);
  }
  return tree;
}

/** All primary metadata is portable in an ignored HTML comment, so nothing is silently dropped. */
export function markdownFusionLosses(doc: MindDoc): string[] {
  return Array.isArray(doc.fusionWarnings) ? doc.fusionWarnings.filter((warning): warning is string => typeof warning === 'string') : [];
}

/** Match gogoga's whole-sibling-level conversion while keeping the primary document intact. */
export function convertPrimaryLevelKind(doc:MindDoc,id:string,kind:'heading'|'list'):MindDoc {
  const tree=toMarkdownTree(doc,doc.root.text,{});
  const all:MindNode[]=[];const visit=(node:MindNode)=>{all.push(node);node.children.forEach(visit);};visit(tree.root);
  const target=all.find(node=>node.id===id);
  if(!target||!convertLevelKind(target,kind,tree.style))return doc;
  normalizeKinds(tree);
  const next=copy(doc);
  const byId=new Map(all.map(node=>[node.id,node]));
  const update=(topic:Topic)=>{
    const node=byId.get(topic.id);
    if(node)topic.markdown={...(topic.markdown as SourceNode|undefined),...sourceNode(node)};
    topic.children?.forEach(update);
  };
  [next.root,...(next.floating??[])].forEach(update);
  if(next.markdown)(next.markdown as SourceDoc).snapshot='';
  return next;
}

export function writeMarkdownDoc(source: string, doc: MindDoc, title: string, options: MarkdownFusionOptions = {}): string {
  const meta = doc.markdown as SourceDoc | undefined;
  if (meta?.original === source && meta.snapshot === clean(doc)) return source;
  const {body} = extension(source);
  const tree = toMarkdownTree(doc, title, options);
  const next = serializeMarkdown(tree);
  const merged = preserveFormat(body, next, text => serializeMarkdown(parseMarkdown(text, {...options, fallbackTitle: title, showHidden: true})));
  // Persist the primary model (including IDs and custom fields), excluding source snapshots.
  const identities: Record<string, string> = {};
  const identify = (n: MindNode) => { if (n.anchor) identities[n.anchor] = n.id; n.children.forEach(identify); };
  identify(tree.root);
  const portable = JSON.stringify({doc, canonical: next, identities}, (key, value) => key === 'markdown' ? undefined : value);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return merged.trimEnd() + newline + '<!-- wmind-fusion:v1 ' + encodeURIComponent(portable) + ' -->' + newline;
}
