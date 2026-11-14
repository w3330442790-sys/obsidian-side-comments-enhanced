import type {MindDoc,Topic} from "./types";
import {updateAt} from "./ops";
export interface EmojiMarkerGroup {name:string;emojis:string[];exclusive:boolean;}
const builtin:EmojiMarkerGroup[]=[{name:"优先级",emojis:["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"],exclusive:true},{name:"进度",emojis:["⏳","✅","❌"],exclusive:true},{name:"旗帜",emojis:["🚩","🟧","🟨","🟩","🟦","🟪"],exclusive:false},{name:"符号",emojis:["⭐","❗","❓","💡","⚠️","🔥","❤️","📌"],exclusive:false},{name:"背诵",emojis:["🙈"],exclusive:false}];
export function parseCustomMarkers(input:string):string[]{
 type Segment={segment(s:string):Iterable<{segment:string}>};
 const Segmenter=(Intl as unknown as {Segmenter?:new(locale?:string,options?:{granularity:string})=>Segment}).Segmenter;
 const parts=Segmenter?[...new Segmenter(undefined,{granularity:"grapheme"}).segment(input)].map(p=>p.segment):input.split(/\s+/);
 return [...new Set(parts.filter(p=>!/^[\s,，、]+$/.test(p)&&(/\p{Extended_Pictographic}|\u20e3/u.test(p)||(/^[\p{S}\p{P}]+$/u.test(p)&&![...p].some(c=>c.charCodeAt(0)<128)))))];
}
export function emojiMarkerGroups(custom="",exclusive=false):EmojiMarkerGroup[]{const known=new Set(builtin.flatMap(g=>g.emojis));const emojis=parseCustomMarkers(custom).filter(e=>!known.has(e));return [...builtin,...(emojis.length?[{name:"自定义",emojis,exclusive}]:[])];}
export function splitEmojiMarkers(text:string,groups:readonly EmojiMarkerGroup[]):{markers:string[];rest:string}{
 const all=groups.flatMap(g=>g.emojis).sort((a,b)=>b.length-a.length),markers:string[]=[];let rest=text;
 for(;;){const marker=all.find(m=>rest.startsWith(m));if(!marker)break;markers.push(marker);rest=rest.slice(marker.length).replace(/^\s+/,"");}return {markers,rest};
}
export function hasEmojiMarker(topic:Topic,emoji:string,groups:readonly EmojiMarkerGroup[]):boolean{return !!topic.markers?.includes(emoji)||splitEmojiMarkers(topic.text,groups).markers.includes(emoji);}
/** Emoji markers remain ordinary Markdown prefixes, preserving native interoperability. */
export function toggleEmojiMarker(doc:MindDoc,ids:readonly string[],emoji:string,groups:readonly EmojiMarkerGroup[]):MindDoc{
 const group=groups.find(g=>g.emojis.includes(emoji)),order=groups.flatMap(g=>g.emojis);
 for(const id of ids)doc=updateAt(doc,id,t=>{const {markers,rest}=splitEmojiMarkers(t.text,groups);const stored=t.markers??[],combined=[...new Set([...markers,...stored.filter(m=>order.includes(m))])];let next=combined.includes(emoji)?combined.filter(m=>m!==emoji):[...combined.filter(m=>!group?.exclusive||!group.emojis.includes(m)),emoji];next.sort((a,b)=>order.indexOf(a)-order.indexOf(b));return {...t,text:[...next,rest].filter(Boolean).join(" "),markers:stored.filter(m=>!order.includes(m))};});return doc;
}
