import type { MindDoc, Topic } from "./types";
import { getTopic, indexDoc } from "./query";
import { addChild, updateAt, findRange, updateRange } from "./ops";

/** Split prose while protecting Markdown tokens and numeric separators. */
export function splitPunctuation(text: string): string[] {
 const protectedToken = /(`+)[\s\S]*?\1|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|!?\[\[[\s\S]*?\]\]|!?\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)|https?:\/\/[^\s，。；、！？]+|\\[\s\S]/gy;
 const parts:string[]=[]; let current="";
 for(let i=0;i<text.length;){
  protectedToken.lastIndex=i;const token=protectedToken.exec(text);
  if(token){current+=token[0];i+=token[0].length;continue;}
  const ch=text[i];const numeric=/[\d]/.test(text[i-1]??"") && /\d/.test(text[i+1]??"") && /[,.]/.test(ch);
  if(/[，。；、！？,;!?\n]/.test(ch)&&!numeric){if(current.trim())parts.push(current.trim());current="";}else current+=ch;
  i++;
 }
 if(current.trim())parts.push(current.trim());return parts;
}

/** Promote children in place; only references to removed topics are discarded. */
export function deleteOnly(doc:MindDoc,ids:readonly string[]):MindDoc {
 const removed=new Set(ids.filter(id=>id!==doc.root.id));if(!removed.size)return doc;
 const rewrite=(t:Topic):Topic[]=>{
  const children=t.children?.flatMap(rewrite);const next={...t,...(children?{children}:{})};
  if(removed.has(t.id))return children??[];
  const valid=new Set(children?.map(c=>c.id));
  for(const key of ["summaries","boundaries"] as const)if(t[key])next[key]=t[key]?.filter(r=>valid.has(r.from)&&valid.has(r.to));
  return [next];
 };
 return {...doc,root:rewrite(doc.root)[0],floating:doc.floating?.flatMap(t=>rewrite(t).map((child,i)=>removed.has(t.id)?{...child,position:{x:t.position?.x??0,y:(t.position?.y??0)+i*80}}:child)),relationships:doc.relationships?.filter(r=>!removed.has(r.from)&&!removed.has(r.to))};
}
export function splitIntoChildren(doc:MindDoc,id:string):MindDoc {
 const topic=getTopic(doc,id);if(!topic)return doc;const parts=splitPunctuation(topic.text);if(parts.length<2)return doc;
 for(const text of parts)doc=addChild(doc,id,{text}).doc;return doc;
}
export const isAnswer=(t:Topic)=>t.text.includes("🙈")||t.markers?.includes("🙈")||t.markers?.includes("answer");
export const isQuestion=(t:Topic)=>!!t.children?.length&&t.children.every(c=>/^\s*\[[ xX]\]\s/.test(c.text));
export interface NoteCardState {w?:number;h?:number;collapsed?:boolean}
export interface ViewProjection {focusId?:string|null;hidden?:ReadonlySet<string>;studyMode?:boolean;revealed?:ReadonlySet<string>;showNotes?:boolean;showCallouts?:boolean;showHidden?:boolean;folds?:Record<string,boolean>;noteCards?:Record<string,NoteCardState>;noteMaxWidth?:number;noteMaxHeight?:number;}
/** Projection is disposable: never serialize or commit its result. */
export function projectView(doc:MindDoc,view:ViewProjection):MindDoc {
 const root=(view.focusId&&getTopic(doc,view.focusId))||doc.root;
 const visit=(t:Topic,option?:{covered:boolean;shown:boolean}):Topic=>{
  const question=!!isQuestion(t),shown=!!view.revealed?.has(t.id);
  const covered=view.studyMode&&!shown&&isAnswer(t);
  const questionCovered=!!view.studyMode&&question&&!shown;
  const children=covered||option?.covered?[]:t.children?.filter(c=>!view.hidden?.has(c.id)&&(view.showHidden||!c.hidden)).map(c=>visit(c,question&&view.studyMode?{covered:questionCovered,shown:!questionCovered}:undefined));
  const visible=new Set(children?.map(c=>c.id));
  const card=view.noteCards?.[t.id];
  return {...t,text:option?.covered?t.text.replace(/^(\s*\[)[xX](\])/,"$1 $2"):t.text,viewHidden:!!t.hidden,studyOption:!!option,studyShown:option?.shown,studyCorrect:!!option&&/^\s*\[[xX]\]/.test(t.text),collapsed:t===root&&view.focusId?undefined:(view.folds?.[t.id]??t.collapsed),studyQuestion:question,studyMultiple:question&&(t.children?.filter(c=>/^\s*\[[xX]\]/.test(c.text)).length??0)>1,noteExpanded:!!view.showNotes&&!card?.collapsed,noteWidth:card?.w??view.noteMaxWidth??320,noteHeight:card?.h,noteMaxHeight:view.noteMaxHeight??240,callout:view.showCallouts===false?undefined:t.callout,children,summaries:t.summaries?.filter(r=>visible.has(r.from)&&visible.has(r.to)),boundaries:t.boundaries?.filter(r=>visible.has(r.from)&&visible.has(r.to))};
 };
 const result={...doc,root:visit(root),floating:root===doc.root?doc.floating?.filter(t=>!view.hidden?.has(t.id)&&(view.showHidden||!t.hidden)).map(t=>visit(t)):undefined};
 const visible=indexDoc(result);result.relationships=doc.relationships?.filter(r=>visible.has(r.from)&&visible.has(r.to));return result;
}
/** Collapse only nodes at or below a depth relative to the requested branch. */
export function setFoldLevel(doc:MindDoc,level:number|null,fromId=doc.root.id):MindDoc {
 const from=getTopic(doc,fromId);if(!from)return doc;
 const visit=(t:Topic,depth:number):Topic=>({...t,collapsed:t.children?.length&&level!==null&&depth>=Math.max(0,level)&&t.id!==doc.root.id?true:undefined,children:t.children?.map(c=>visit(c,depth+1))});
 return updateAt(doc,fromId,t=>visit(t,0));
}

export function resizeRange(doc:MindDoc,id:string,which:"from"|"to",anchorId:string):MindDoc{
 const f=findRange(doc,id);if(!f)return doc;const children=f.owner.children??[];
 const changed=children.findIndex(c=>c.id===anchorId),fixed=children.findIndex(c=>c.id===f.range[which==="from"?"to":"from"]);if(changed<0||fixed<0)return doc;
 return updateRange(doc,id,{from:children[Math.min(changed,fixed)].id,to:children[Math.max(changed,fixed)].id});
}
