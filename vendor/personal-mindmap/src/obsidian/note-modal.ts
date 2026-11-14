import { Component, MarkdownRenderer, Modal, Notice, type App, type HoverPopover } from "obsidian";
import type PersonalMindmapPlugin from "../../vendor/gogoga/src/main";

/** Draft-only insertion; callers commit the returned text exclusively from Save. */
export function insertNoteAttachments(text:string,start:number,end:number,links:string[]):{text:string;cursor:number} {
  const insertion=links.map(link=>`![[${link}]]`).join("\n");
  if(!insertion)return {text,cursor:end};
  const at=Math.max(0,Math.min(text.length,start));const until=Math.max(at,Math.min(text.length,end));
  return {text:text.slice(0,at)+insertion+text.slice(until),cursor:at+insertion.length};
}

class NoteModal extends Modal {
  hoverPopover:HoverPopover|null=null;
  private lifetime:Component;
  private previewScope:Component|null=null;
  private draft:string;
  private editing:boolean;
  private closed=false;
  private saved=false;
  private uploads=0;
  private previewTimer=0;
  private observer:ResizeObserver|null=null;
  private lastSize:{w:number;h:number}|undefined;
  private editor?:HTMLTextAreaElement;
  private preview?:HTMLElement;
  private saveButton?:HTMLButtonElement;
  private body?:HTMLElement;
  private lightboxes=new Set<Modal>();
  constructor(app:App,private plugin:PersonalMindmapPlugin,private sourcePath:string,initial:string,private onCommit:(markdown:string)=>void,private readOnly:boolean) {
    super(app);this.draft=initial;this.editing=!initial&&!readOnly;
    this.lifetime=plugin.addChild(new Component());
    this.lifetime.register(()=>{if(!this.closed)this.close();});
  }
  onOpen():void {
    this.setTitle("节点备注");
    const size=this.plugin.settings.notePopoverSize;
    Object.assign(this.modalEl.style,{width:`min(92vw, ${Math.max(300,size?.w??760)}px)`,height:`min(85vh, ${Math.max(240,size?.h??520)}px)`,maxWidth:"96vw",maxHeight:"92vh",minWidth:"min(300px,92vw)",minHeight:"220px",resize:"both",overflow:"hidden",display:"flex",flexDirection:"column"});
    Object.assign(this.contentEl.style,{display:"flex",flexDirection:"column",flex:"1",minHeight:"0",marginBottom:"0"});
    this.body=document.createElement("div");Object.assign(this.body.style,{display:"flex",flex:"1",minHeight:"0",gap:"12px",flexWrap:"wrap",overflow:"hidden"});
    this.contentEl.append(this.body);this.renderMode();
    this.observer=new ResizeObserver(entries=>{for(const entry of entries){const rect=entry.target.getBoundingClientRect();if(rect.width>0&&rect.height>0)this.lastSize={w:Math.round(rect.width),h:Math.round(rect.height)};}});
    this.observer.observe(this.modalEl);
    this.scope.register(["Mod"],"Enter",()=>{if(this.editing&&!this.readOnly&&!this.uploads)this.save();return false;});
  }
  private renderMode():void {
    if(!this.body)return;
    this.editor=undefined;this.preview=undefined;
    this.body.replaceChildren();this.contentEl.querySelector(".wm-note-modal-actions")?.remove();
    if(this.editing&&!this.readOnly){
      const editor=this.editor=document.createElement("textarea");editor.value=this.draft;editor.placeholder="Markdown 备注；可粘贴或拖入图片";editor.setAttribute("aria-label","Markdown 备注");
      Object.assign(editor.style,{flex:"1 1 260px",width:"100%",minWidth:"0",minHeight:"180px",resize:"none",fontFamily:"var(--font-monospace)",lineHeight:"1.6"});this.body.append(editor);
      editor.addEventListener("input",()=>{this.draft=editor.value;window.clearTimeout(this.previewTimer);this.previewTimer=window.setTimeout(()=>this.renderPreview(),150);});
      editor.addEventListener("paste",event=>{const files=Array.from(event.clipboardData?.files??[]).filter(f=>f.type.startsWith("image/"));if(files.length){event.preventDefault();event.stopPropagation();void this.insertFiles(files);}});
      editor.addEventListener("dragover",event=>{event.stopPropagation();if(event.dataTransfer?.types.includes("Files")||this.host().getDraggedFiles?.()?.length){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect="copy";}});
      editor.addEventListener("drop",event=>{
        event.stopPropagation();const vault=this.host().getDraggedFiles?.();
        if(vault?.length){event.preventDefault();this.insertText(vault.map(file=>`${file.isImage?"!":""}[[${file.linktext}]]`).join("\n"));return;}
        const files=Array.from(event.dataTransfer?.files??[]).filter(file=>file.type.startsWith("image/"));if(files.length){event.preventDefault();void this.insertFiles(files);}
      });
      if(this.plugin.settings.notePreview)this.addPreview();
      editor.addEventListener("scroll",()=>{if(this.preview){const range=editor.scrollHeight-editor.clientHeight;this.preview.scrollTop=range>0?editor.scrollTop/range*(this.preview.scrollHeight-this.preview.clientHeight):0;}});
      requestAnimationFrame(()=>{editor.focus();editor.setSelectionRange(editor.value.length,editor.value.length);});
    } else this.addPreview();
    const actions=document.createElement("div");actions.className="wm-note-modal-actions";Object.assign(actions.style,{display:"flex",justifyContent:"flex-end",gap:"8px",paddingTop:"12px",flexShrink:"0"});
    const button=(label:string,onClick:()=>void)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",onClick);actions.append(b);return b;};
    if(!this.readOnly&&!this.editing)button("编辑",()=>{this.editing=true;this.renderMode();});
    if(this.editing&&!this.readOnly){this.saveButton=button("保存",()=>this.save());this.saveButton.classList.add("mod-cta");this.saveButton.disabled=!!this.uploads;}
    button(this.editing?"取消":"关闭",()=>this.close());this.contentEl.append(actions);this.renderPreview();
  }
  private host(){return this.plugin.canvasHost(()=>this.sourcePath,this.lifetime,this);}
  private addPreview():void {
    const preview=this.preview=document.createElement("div");preview.className="markdown-rendered";
    Object.assign(preview.style,{flex:"1 1 260px",width:"100%",minWidth:"0",minHeight:"0",overflow:"auto",padding:"4px 12px"});this.body!.append(preview);
    preview.addEventListener("click",event=>{
      const target=event.target as Element;const link=target.closest<HTMLAnchorElement>("a.internal-link");
      if(link){event.preventDefault();event.stopPropagation();const href=link.dataset.href??link.getAttribute("href");if(href)this.host().openLink?.(href,true,event);return;}
      const image=target.closest<HTMLImageElement>("img");if(image){event.preventDefault();event.stopPropagation();this.showImage(image);}
    });
    preview.addEventListener("mouseover",event=>{const link=(event.target as Element).closest<HTMLAnchorElement>("a.internal-link");const href=link?.dataset.href??link?.getAttribute("href");if(link&&href)this.host().hoverLink?.(event,href,link);});
  }
  private renderPreview():void {
    if(this.closed||!this.preview)return;
    if(this.previewScope)this.lifetime.removeChild(this.previewScope);
    const component=this.previewScope=this.lifetime.addChild(new Component());
    const target=document.createElement("div");this.preview.replaceChildren(target);
    void MarkdownRenderer.render(this.app,this.draft||"暂无备注",target,this.sourcePath,component).then(()=>{
      if(this.closed||!target.isConnected)return;
      (window as unknown as {Prism?:{highlightAllUnder?:(element:Element)=>void}}).Prism?.highlightAllUnder?.(target);
    }).catch(error=>{if(!this.closed&&target.isConnected)target.textContent=`预览失败：${error instanceof Error?error.message:String(error)}`;});
  }
  private insertText(value:string):void {
    const editor=this.editor;if(this.closed||!editor||this.readOnly)return;
    editor.setRangeText(value,editor.selectionStart,editor.selectionEnd,"end");this.draft=editor.value;this.renderPreview();editor.focus();
  }
  private async insertFiles(files:File[]):Promise<void> {
    const editor=this.editor,save=this.host().saveBinary;if(!editor||!save||this.readOnly||this.closed)return;
    const start=editor.selectionStart,end=editor.selectionEnd;
    this.uploads++;if(this.saveButton)this.saveButton.disabled=true;
    const links:string[]=[];
    try {
      for(const file of files){if(this.closed)return;links.push(await save(file.name||`image-${Date.now()}.png`,await file.arrayBuffer()));}
      if(this.closed||editor!==this.editor)return;
      const original=editor.value;const rangeUnchanged=editor.selectionStart===start&&editor.selectionEnd===end;
      const result=insertNoteAttachments(original,rangeUnchanged?start:editor.selectionStart,rangeUnchanged?end:editor.selectionEnd,links);
      editor.value=result.text;editor.setSelectionRange(result.cursor,result.cursor);this.draft=result.text;this.renderPreview();editor.focus();
    } catch(error){if(!this.closed)new Notice(`图片插入失败：${error instanceof Error?error.message:String(error)}`);}
    finally{this.uploads--;if(this.saveButton)this.saveButton.disabled=!!this.uploads;}
  }
  private save():void {
    if(this.saved||this.closed||this.readOnly||this.uploads)return;
    this.saved=true;this.onCommit(this.editor?.value??this.draft);this.close();
  }
  private showImage(source:HTMLImageElement):void {
    const parent=this;
    const lightbox=new class extends Modal {
      onOpen(){this.setTitle(source.alt||"图片");Object.assign(this.modalEl.style,{width:"94vw",height:"92vh",maxWidth:"96vw",display:"flex",flexDirection:"column"});Object.assign(this.contentEl.style,{flex:"1",minHeight:"0",display:"flex",alignItems:"center",justifyContent:"center"});const image=document.createElement("img");image.src=source.currentSrc||source.src;image.alt=source.alt;image.style.cssText="max-width:100%;max-height:100%;object-fit:contain";this.contentEl.append(image);}
      onClose(){parent.lightboxes.delete(this);this.contentEl.replaceChildren();}
    }(this.app);
    this.lightboxes.add(lightbox);lightbox.open();
  }
  onClose():void {
    if(this.closed)return;this.closed=true;window.clearTimeout(this.previewTimer);this.observer?.disconnect();
    for(const modal of this.lightboxes)modal.close();this.lightboxes.clear();(this.hoverPopover as unknown as {hide?:()=>void}|null)?.hide?.();
    this.plugin.removeChild(this.lifetime);this.contentEl.replaceChildren();
    if(this.lastSize)this.plugin.notePopoverSize.set(this.lastSize);
  }
}

export function openNoteModal(app:App,plugin:PersonalMindmapPlugin,sourcePath:string,initial:string,onCommit:(markdown:string)=>void,readOnly=false):Modal {
  const modal=new NoteModal(app,plugin,sourcePath,initial,onCommit,readOnly);modal.open();return modal;
}
