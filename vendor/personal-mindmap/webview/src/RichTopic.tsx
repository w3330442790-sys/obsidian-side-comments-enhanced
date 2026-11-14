import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { parseRich, safeImageSource, safeInlineColor, mediaKind, type RichToken } from "./rich";

export interface RichEnvironmentValue {
  studyMode?: boolean;
  topicId?: string;
  revealed?: ReadonlySet<string>;
  showNotes?: boolean;
  onImageResize?:(topicId:string,width:number|null)=>void;
  openTag?:(tag:string)=>void;
  hoverLink?:(event:MouseEvent,target:string,element:HTMLElement)=>void;
  reveal?: (id:string) => void;
  renderMath?: (tex:string, display:boolean) => HTMLElement|null;
  resolveImage?: (link:string) => string|null;
  renderPdfCrop?: (link:string, el:HTMLElement, onImage:(img:HTMLImageElement)=>void) => boolean;
  renderMarkdown?: (text:string,el:HTMLElement) => void|(()=>void);
  measuring?: boolean;
}
export const RichEnvironment = createContext<RichEnvironmentValue>({});
let host: Pick<RichEnvironmentValue,"renderMath"|"resolveImage"|"renderPdfCrop"|"renderMarkdown"> = {};
/** Scope a synchronous measurement to its pane host; always restore in finally. */
export function registerRichRenderer(value:typeof host):()=>void {
  const previous = host; host = value;
  return () => { if (host === value) host = previous; };
}
function appendTokens(el:HTMLElement, tokens:RichToken[], env:RichEnvironmentValue):void {
  for (const token of tokens) {
    if (token.kind === "text") { el.append(document.createTextNode(token.text??"")); continue; }
    if (token.kind === "math") {
      const math = env.renderMath?.(token.text??"",!!token.display);
      if (math) { el.append(math); continue; }
    }
    const tag = ({bold:"strong",italic:"em",strike:"s",highlight:"mark",color:"span",code:"code",link:"a",tag:"a",image:"span",math:"code",embed:"span"} as const)[token.kind];
    const child = document.createElement(tag);
    if (token.kind === "link") {
      child.dataset.link = token.target;
      child.dataset.internal = String(!!token.internal);
      child.setAttribute("href",token.internal ? "#" : token.target!);
      child.addEventListener("click",ev=>ev.preventDefault());
      child.style.cssText = "color:inherit;text-decoration:underline;cursor:pointer";
      if(token.internal)child.addEventListener('mouseover',event=>env.hoverLink?.(event as MouseEvent,token.target!,child));
    }
    if(token.kind==='tag'){child.setAttribute('href','#');child.style.cssText='color:inherit;background:#6484ff22;border-radius:4px;padding:1px 3px;cursor:pointer';child.addEventListener('pointerdown',event=>event.stopPropagation());child.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();env.openTag?.(token.target!);});}
    if (token.kind === "highlight") child.style.cssText = "background:#ffe690;color:#242424;border-radius:2px";
    if (token.kind === "color") child.style.color = safeInlineColor(token.color) ?? "#dc2626";
    if (token.kind === "code" || token.kind === "math") child.style.cssText = "font-family:monospace;background:rgba(128,128,128,.12);border-radius:3px";
    if (token.kind === "image" || token.kind === "embed") {
      const kind=token.kind==="embed"?"embed":mediaKind(token.target!);
      const width=token.width??(kind==="audio"?220:kind==="embed"?320:160);
      const height=token.height??(kind==="audio"?44:kind==="embed"?180:120);
      child.style.cssText=`display:block;width:${width}px;max-width:100%;height:${height}px;overflow:hidden;margin:3px auto`;
      const link=()=>{const a=document.createElement("a");a.dataset.link=token.target;a.dataset.internal="true";a.href="#";a.textContent=token.text??token.target!;a.addEventListener("click",ev=>ev.preventDefault());return a;};
      if(kind==="pdf-crop") {
        child.dataset.pdfPending="true";
        if(env.measuring){child.textContent="PDF";}
        else {
          const jump=()=>{const a=link();a.textContent="↗ PDF";a.style.cssText="position:absolute;right:2px;top:2px;font-size:11px;background:white;color:#333";return a;};
          const ok=env.renderPdfCrop?.(token.target!,child,img=>{
            img.style.cssText="display:block;width:100%;height:100%;object-fit:contain";
            child.replaceChildren(img,jump());child.style.position="relative";
            child.removeAttribute("data-pdf-pending");
          });
          if(!ok){child.removeAttribute("data-pdf-pending");child.append(link());}
          else if(child.hasAttribute("data-pdf-pending")){child.style.position="relative";child.append(jump());}
        }
      } else if(kind==="image") {
        const resolved = env.resolveImage?.(token.target!);
        const src = safeImageSource(resolved??token.target!,!!resolved);
        if(src){
          const img=document.createElement("img");img.src=src;img.alt=token.text??token.target!;img.draggable=false;img.style.cssText="display:block;width:100%;height:100%;object-fit:contain";child.append(img);
          if(!env.measuring){
            img.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();const dialog=document.createElement('dialog');dialog.className='wm-image-lightbox';dialog.style.cssText='border:0;padding:12px;max-width:96vw;max-height:94vh;background:var(--background-primary,#fff);border-radius:10px';const full=img.cloneNode(true) as HTMLImageElement;full.style.cssText='display:block;max-width:90vw;max-height:86vh;object-fit:contain';dialog.append(full);dialog.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();});
            if(env.onImageResize&&env.topicId){
              child.style.position='relative';const grip=document.createElement('span');grip.className='wm-ui';grip.setAttribute('aria-label','调整图片宽度');grip.style.cssText='position:absolute;right:0;bottom:0;width:12px;height:12px;background:#6484ff;cursor:ew-resize;border-radius:2px';child.append(grip);
              let start=0,original=width,next=width;
              grip.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();start=event.clientX;original=child.getBoundingClientRect().width;next=width;grip.setPointerCapture(event.pointerId);});
              grip.addEventListener('pointermove',event=>{if(!grip.hasPointerCapture(event.pointerId))return;event.stopPropagation();next=Math.round(Math.max(40,Math.min(1200,width+(event.clientX-start)*(width/Math.max(1,original)))));child.style.width=`${next}px`;});
              grip.addEventListener('pointerup',event=>{if(!grip.hasPointerCapture(event.pointerId))return;event.stopPropagation();grip.releasePointerCapture(event.pointerId);env.onImageResize?.(env.topicId!,next);});
              grip.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();env.onImageResize?.(env.topicId!,null);});
            }
          }
        }
        else {child.append(link());child.title="Image requires attachment access from the host";}
      } else {
        child.dataset.exportUnsupported=kind;
        const button=document.createElement("button");button.type="button";button.textContent=`▶ ${token.text??token.target}`;button.style.cssText="width:100%;height:100%;border:1px solid currentColor;border-radius:5px;background:transparent;color:inherit;cursor:pointer";
        button.addEventListener("pointerdown",ev=>ev.stopPropagation());
        button.addEventListener("click",ev=>{
          ev.preventDefault();ev.stopPropagation();
          if(kind==="embed"){
            const frame=document.createElement("iframe");frame.src=token.target!+(/[?&]autoplay=/i.test(token.target!)?"":token.target!.includes("?")?"&autoplay=0":"?autoplay=0");
            frame.title=token.text??"Embedded media";frame.sandbox.add("allow-scripts","allow-same-origin","allow-presentation");frame.referrerPolicy="no-referrer";frame.allowFullscreen=true;frame.style.cssText="width:100%;height:100%;border:0";child.replaceChildren(frame);
          } else {
            const resolved=env.resolveImage?.(token.target!);
            const src=resolved&&/^(app:|blob:|https?:|vscode-webview-resource:|vscode-resource:)/i.test(resolved)?resolved:null;
            if(!src){button.textContent="Media requires attachment access from the host";return;}
            const media=document.createElement(kind);media.src=src;media.controls=true;media.preload="none";media.style.cssText="display:block;width:100%;height:100%;object-fit:contain";media.addEventListener("pointerdown",ev=>ev.stopPropagation());child.replaceChildren(media);
          }
        });child.append(button);
      }
    } else if (token.children) appendTokens(child,token.children,env);
    else child.textContent = token.kind === "math" ? `$${token.text}$` : token.text??"";
    if (token.kind === "highlight" && env.studyMode && !env.revealed?.has(env.topicId??"")) {
      const hidden = document.createElement("span");
      while(child.firstChild) hidden.append(child.firstChild);
      hidden.style.visibility="hidden";child.append(hidden);
      child.dataset.kind="reveal";child.setAttribute("role","button");child.setAttribute("aria-label","Reveal highlighted answer");child.tabIndex=0;
      child.style.cssText="background:#70757d;border-radius:3px;cursor:pointer";
      const reveal = () => {if(env.topicId)env.reveal?.(env.topicId);};
      child.addEventListener("click",ev=>{ev.preventDefault();ev.stopPropagation();reveal();});
      child.addEventListener("keydown",ev=>{if((ev as KeyboardEvent).key==="Enter"||(ev as KeyboardEvent).key===" "){ev.preventDefault();ev.stopPropagation();reveal();}});
    }
    el.append(child);
  }
}
export const richCss = (font:string,lineHeight:number,align:string):CSSProperties => ({font,lineHeight:`${lineHeight}px`,textAlign:align as CSSProperties["textAlign"],whiteSpace:"pre-wrap",overflowWrap:"anywhere",wordBreak:"normal",margin:0,padding:0,boxSizing:"border-box"});
export function fillRichElement(el:HTMLElement,text:string,env:RichEnvironmentValue = {}):void {
  el.replaceChildren(); appendTokens(el,parseRich(text),{...host,...env});
}
export function measureRichBox(text:string,font:string,lineHeight:number,maxWidth:number):{w:number;h:number} {
  const el = document.createElement("div");
  Object.assign(el.style,richCss(font,lineHeight,"left"),{position:"absolute",visibility:"hidden",width:"max-content",maxWidth:`${maxWidth}px`,contain:"layout style"});
  fillRichElement(el,text,{measuring:true});

  document.body.append(el);
  const rect = el.getBoundingClientRect(); el.remove();
  return {w:Math.max(1,Math.ceil(rect.width)),h:Math.max(lineHeight,Math.ceil(rect.height))};
}
export function RichTopic({topicId,text,x,y,w,h,font,lineHeight,align,color,strike,markdown}:{topicId?:string;text:string;x:number;y:number;w:number;h:number;font:string;lineHeight:number;align:string;color:string;strike?:boolean;markdown?:boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  const env = useContext(RichEnvironment);
  const hostedMarkdown=markdown&&!!env.renderMarkdown&&!env.studyMode;
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    if(markdown&&env.renderMarkdown&&!env.studyMode){el.replaceChildren();return env.renderMarkdown(text,el);}
    fillRichElement(el,text,{...env,topicId});
  },[text,env,topicId,markdown]);
  return <foreignObject x={x} y={y} width={w} height={h} overflow="visible"><div ref={ref} {...({xmlns:"http://www.w3.org/1999/xhtml"} as Record<string,string>)} className="wm-rich-topic" style={{...richCss(font,lineHeight,align),color,width:w,...(markdown?{height:h,overflow:"auto",whiteSpace:hostedMarkdown?"normal" as const:"pre-wrap" as const}:{}),textDecoration:strike ? "line-through" : undefined}} /></foreignObject>;
}
