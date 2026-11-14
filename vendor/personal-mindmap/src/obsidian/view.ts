import { Notice, Scope, TextFileView, WorkspaceLeaf, Component, MarkdownRenderer, renderMath, finishRenderMath, TFile, moment } from 'obsidian';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../../webview/src/App';
import { parse, serialize } from '../core/doc';
import type { MindDoc, Topic } from '../core/types';
import { parseMarkdownDoc, writeMarkdownDoc } from '../fusion/markdown';
import { SnapshotWriter } from '../fusion/persistence';
import { scopeHost } from '../fusion/lifetime';
import type { Host, HostCommand, InMsg, OutMsg } from '../../webview/src/host';
import type GogogaPlugin from '../../vendor/gogoga/src/main';
import type {HoverPopover} from 'obsidian';
import { parseMarkdown, pathAtLine } from '../../vendor/gogoga/src/markdown';
import { pathOf, findByPath, type MindNode } from '../../vendor/gogoga/src/model';

// The integrated plugin keeps .wmind in its own namespace so the standalone
// personal-mindmap plugin (which also declared this view type) can never collide.
export const VIEW_TYPE='taube-markdown-tool-wmind';
export class WmindView extends TextFileView {
  hoverPopover:HoverPopover|null=null;
  protected lastText='';
  protected currentDoc:MindDoc|null=null;
  protected selected:string[]=[];
  private root:Root|null=null;
  private listeners=new Set<(m:InMsg)=>void>();
  private writer:SnapshotWriter|null=null;
  private writerFile:TFile|null=null;
  private conflict=false;
  private sourceReadOnly=false;
  private recoverySaved='';
  private recoveryTask:Promise<void>|null=null;
  private pendingSubpath:string|null=null;
  private mountedPath='';
  private mountGeneration=0;
  protected readonly host:Host={
    openTag:tag=>this.plugin.canvasHost(()=>this.file?.path??'',this).openTag?.(tag),
    hoverLink:(event,target,element)=>this.plugin.canvasHost(()=>this.file?.path??'',this,this).hoverLink?.(event,target,element),
    editNote:(text,onCommit,readOnly)=>{const source=this.file?.path??'',generation=this.mountGeneration;void import('./note-modal').then(({openNoteModal})=>{if(generation===this.mountGeneration)openNoteModal(this.app,this.plugin,source,text,onCommit,readOnly);});},
    saveBinary:async(name,data)=>{
      const sourcePath=this.file?.path??'';
      const save=this.plugin.canvasHost(()=>sourcePath,this).saveBinary;
      if(!save)throw new Error('附件保存不可用');return save(name,data);
    },
    pickNote:async()=>{const source=this.file?.path??'';return this.plugin.canvasHost(()=>source,this).pickNote?.(this.selectedTopic()?.text??'笔记')??null;},
    listLinkTargets:query=>{
      const needle=query.toLocaleLowerCase();
      return (this.plugin.canvasHost(()=>this.file?.path??'',this).listLinkTargets?.()??[]).filter(target=>!needle||target.name.toLocaleLowerCase().includes(needle)||target.linktext.toLocaleLowerCase().includes(needle)).slice(0,30).map(target=>target.linktext);
    },
    post:m=>void this.onMessage(m), subscribe:handler=>{this.listeners.add(handler);return()=>this.listeners.delete(handler);},
    renderMath:(tex,display)=>{try{const node=renderMath(tex,display);queueMicrotask(()=>void finishRenderMath());return node;}catch{return null;}},
    renderMarkdown:(text,element)=>{
      const scope=new Component();scope.load();
      void MarkdownRenderer.render(this.app,text,element,this.file?.path??'',scope);
      return()=>scope.unload();
    },
    resolveResource:target=>{
      if(/^(https?:|data:|blob:|app:)/i.test(target))return target;
      if(target.startsWith('xmind-resource:')) {
        const source=decodeURIComponent(target.slice('xmind-resource:'.length));
        const raw=(this.currentDoc?.xmindImages as Record<string,number[]>|undefined)?.[source];
        if(raw){let binary='';for(const n of raw)binary+=String.fromCharCode(n);return `data:image/${source.split('.').pop()};base64,${btoa(binary)}`;}
      }
      const file=this.app.metadataCache.getFirstLinkpathDest(target.split('#')[0],this.file?.path??'');
      return file?this.app.vault.getResourcePath(file):'';
    },
    onViewState:state=>{
      this.selected=state.selection;
      if(this.file){
        this.plugin.rememberViewport(this.file.path,{tx:state.viewport.x,ty:state.viewport.y,k:state.viewport.k,sel:state.selection[0]??null});
        if(state.locked!==undefined&&state.locked!==this.plugin.isLocked(this.file.path))this.plugin.setLocked(this.file.path,state.locked);
        if(state.notesExpanded!==undefined&&state.notesExpanded!==this.plugin.isNotesExpanded(this.file.path))this.plugin.setNotesExpanded(this.file.path,state.notesExpanded);
        if(state.calloutsHidden!==undefined&&state.calloutsHidden!==this.plugin.isCalloutsHidden(this.file.path))this.plugin.setCalloutsHidden(this.file.path,state.calloutsHidden);
        if(state.noteCards&&JSON.stringify(state.noteCards)!==JSON.stringify(this.plugin.getNoteCards(this.file.path)??{}))this.plugin.setNoteCards(this.file.path,state.noteCards);
      }
      this.selectionChanged();
    },
  };
  constructor(leaf:WorkspaceLeaf,protected fusionPlugin:GogogaPlugin){
    super(leaf);this.scope=new Scope(this.app.scope);
    const keys:[string[],string,HostCommand][]=[[['Mod'],'z','undo'],[['Mod','Shift'],'z','redo'],[['Mod'],'y','redo'],[['Mod'],'=','zoomIn'],[['Mod'],'-','zoomOut'],[['Mod'],'0','fit'],[['Mod'],'f','find'],[['Ctrl'],'h','replace'],[['Mod','Alt'],'f','replace'],[['Mod'],'k','linkNote']];
    for(const [mods,key,c]of keys)this.scope.register(mods as never,key,()=>this.command(c));
  }
  protected get plugin():GogogaPlugin{return this.fusionPlugin;}
  protected selectionChanged():void{}
  protected get markdownMode():boolean{return this.file?.extension==='md';}
  getViewType():string{return VIEW_TYPE;}
  getDisplayText():string{return this.file?.basename??'思维导图';}
  getIcon():string{return 'brain-circuit';}
  async onOpen():Promise<void>{this.contentEl.addClass('wm-root','wm-obsidian');}
  async onClose():Promise<void>{this.command('flush');await this.save();if(this.conflict)await this.recoverConflict();await super.onClose();this.unmount();}
  async onUnloadFile(file:TFile):Promise<void>{this.command('flush');await this.save();if(this.conflict)await this.recoverConflict();return super.onUnloadFile(file);}
  protected decode(source:string):MindDoc {
    if(this.markdownMode){const doc=parseMarkdownDoc(source,this.file?.basename??'思维导图',this.plugin.rootRule());this.sourceReadOnly=parse(serialize(doc)).readOnly;return doc;}
    const parsed=parse(source);this.sourceReadOnly=parsed.readOnly||!parsed.doc;if(!parsed.doc)throw new Error(parsed.error?.message??'无法解析脑图');return parsed.doc;
  }
  setViewData(source:string,clear:boolean):void {
    if(!clear&&source===this.lastText&&this.root)return;
    if(!clear&&this.writer?.isOwnSnapshot(source))return;
    if(this.writer&&(this.writer.pending!==undefined||this.writer.isDirty(this.lastText))&&!clear){this.conflict=true;new Notice('磁盘内容在编辑期间发生变化；本地修改已保留，未覆盖磁盘。');void this.recoverConflict();return;}
    this.lastText=source;this.data=source;this.conflict=false;
    const file=this.file;this.writerFile=file;
    this.writer=file?new SnapshotWriter(source,transform=>this.app.vault.process(file,transform)):null;
    try{this.currentDoc=this.decode(source);}catch(error){this.currentDoc=null;new Notice((error as Error).message);}
    if(clear||!this.root||this.mountedPath!==(file?.path??''))this.mount();
    else this.emit({type:'update',text:this.currentDoc?serialize(this.currentDoc):source});
  }
  getViewData():string{return this.lastText;}
  clear():void{this.lastText='';this.currentDoc=null;this.writer=null;this.writerFile=null;this.sourceReadOnly=false;this.conflict=false;this.recoverySaved='';this.unmount();}
  async refreshFromSettings():Promise<void>{this.command('flush');await this.save();if(!this.conflict)this.setViewData(this.lastText,true);}
  /** Vault.process serializes writes and checks the exact last successful disk snapshot. */
  async save(_clear?:boolean):Promise<void>{
    this.command('syncPending');
    if(!this.writer||!this.file||this.writerFile!==this.file||this.sourceReadOnly)return;
    if(this.conflict){await this.recoverConflict();return;}
    try{await this.writer.write(this.lastText);}catch(error){this.conflict=true;new Notice((error as Error).message);await this.recoverConflict();}
  }
  async saveConflictCopy():Promise<void>{
    const file=this.file;if(!file)return;
    const path=await this.app.fileManager.getAvailablePathForAttachment(`${file.basename} 本地冲突副本.${file.extension}`,file.path);
    const copy=await this.app.vault.create(path,this.lastText);new Notice(`本地版本已保存：${copy.path}`);
  }
  private async recoverConflict():Promise<void>{
    if(this.recoveryTask){await this.recoveryTask;return this.recoverConflict();}
    if(!this.file||this.recoverySaved===this.lastText)return;
    const file=this.file,source=this.lastText;
    this.recoveryTask=(async()=>{try{
      const path=await this.app.fileManager.getAvailablePathForAttachment(`${file.basename} 本地冲突副本.${file.extension}`,file.path);
      const copy=await this.app.vault.create(path,source);this.recoverySaved=source;new Notice(`本地版本已自动保存：${copy.path}`);
    }catch(error){new Notice(`无法保存冲突副本：${(error as Error).message}；本地内容仍保留在当前视图。`);}})();
    await this.recoveryTask;this.recoveryTask=null;
  }
  private unmount():void{this.mountGeneration++;this.root?.unmount();this.root=null;this.listeners.clear();}
  private mount():void{
    this.unmount();this.contentEl.empty();this.mountedPath=this.file?.path??'';
    const saved=this.file?this.plugin.getViewport(this.file.path):undefined;
    this.host.editorSettings={...this.plugin.settings,toolbarPosition:this.plugin.settings.primaryToolbarPosition??"top"};
    this.host.renderPdfCrop=(link,element,onImage)=>this.plugin.canvasHost(()=>this.file?.path??'',this).renderPdfCrop?.(link,element,onImage)??false;
    this.host.initialState={...(saved?{viewport:{x:saved.tx,y:saved.ty,k:saved.k},selection:saved.sel?[saved.sel]:[]}:{}),locked:this.file?this.plugin.isLocked(this.file.path):false,showHidden:this.plugin.showHidden,notesExpanded:this.file?this.plugin.isNotesExpanded(this.file.path):false,calloutsHidden:this.file?this.plugin.isCalloutsHidden(this.file.path):false,noteCards:this.file?this.plugin.getNoteCards(this.file.path):undefined};
    this.root=createRoot(this.contentEl.createDiv({cls:'wm-host'}));
    const generation=this.mountGeneration;
    this.root.render(createElement(App,{host:scopeHost(this.host,()=>generation===this.mountGeneration),key:this.mountedPath}));
    if(this.markdownMode)this.addMarkdownActions();
    this.addAction('save','保存本地冲突副本',()=>void this.saveConflictCopy());
  }
  protected addMarkdownActions():void{}
  protected emit(m:InMsg):void{for(const handler of this.listeners)handler(m);}
  command(command:HostCommand):boolean{this.emit({type:'command',command});return false;}
  protected async onMessage(m:OutMsg):Promise<void>{
    switch(m.type){
      case 'ready':{
        this.emit({type:'init',text:this.currentDoc?serialize(this.currentDoc):this.lastText,lang:moment.locale(),fileName:this.file?.basename??'mindmap',host:'obsidian'});
        if(Array.isArray(this.currentDoc?.fusionWarnings))for(const warning of this.currentDoc.fusionWarnings)if(typeof warning==='string')new Notice(warning);
        if(this.pendingSubpath){const subpath=this.pendingSubpath;this.pendingSubpath=null;this.revealSubpath(subpath);}
        return;
      }
      case 'edit':{
        if(this.sourceReadOnly){new Notice('源文件无效或使用未来版本，当前视图不可写入');return;}
        if(this.file&&this.plugin.isLocked(this.file.path))return;
        const parsed=parse(m.text);if(!parsed.doc||parsed.readOnly){new Notice('无效或未来版本的脑图不可写入');return;}
        if(this.conflict){new Notice('文件冲突尚未解决，请保存本地副本后重新打开原文件。');return;}
        this.currentDoc=parsed.doc;
        this.lastText=this.markdownMode?writeMarkdownDoc(this.lastText,parsed.doc,this.file?.basename??'思维导图',this.plugin.rootRule()):m.text;
        if(this.markdownMode)this.currentDoc=this.decode(this.lastText);
        this.data=this.lastText;if(this.plugin.settings?.saveImmediately===false)this.requestSave();else await this.save();return;
      }
      case 'openLink':this.openLink(m.target);return;
      case 'export':await this.exportFile(m.defaultName,m.data,m.encoding,m.note,m.copy);return;
      case 'notify':new Notice(m.message);return;
      case 'openText':if(this.file&&this.markdownMode)await this.plugin.openAsMarkdown(this.file,this.leaf);return;
    }
  }
  protected openLink(target:string):void{
    if(/^(https?:|mailto:|obsidian:)/i.test(target)){window.open(target,'_blank');return;}
    if(/^[a-z][a-z0-9+.-]*:/i.test(target))return;
    const link=target.replace(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/,'$1');
    this.plugin.canvasHost(()=>this.file?.path??'',this).openLink?.(link,true,new MouseEvent('click'));
  }
  private async exportFile(name:string,data:string,encoding:'base64'|'utf8',note?:string,copy?:boolean):Promise<void>{
    try{
      const bytes=encoding==='base64'?Uint8Array.from(atob(data),ch=>ch.charCodeAt(0)):new TextEncoder().encode(data);
      if(copy){await navigator.clipboard.write([new ClipboardItem({'image/png':new Blob([bytes],{type:'image/png'})})]);new Notice('已复制图片');return;}
      const path=await this.app.fileManager.getAvailablePathForAttachment(name,this.file?.path??'');
      if(encoding==='base64')await this.app.vault.createBinary(path,bytes.buffer);else await this.app.vault.create(path,data);
      new Notice(`已导出：${path}${note?'\n'+note:''}`);
    }catch(error){new Notice(`导出失败：${(error as Error).message}`);}
  }
  protected selectedTopic():Topic|undefined{
    const visit=(node:Topic):Topic|undefined=>node.id===this.selected[0]?node:node.children?.map(visit).find(Boolean);
    return this.currentDoc?[this.currentDoc.root,...(this.currentDoc.floating??[])].map(visit).find(Boolean):undefined;
  }
  protected revealSubpath(subpath:string):void{
    if(!this.currentDoc){this.pendingSubpath=subpath;return;}
    const target=subpath.replace(/^#/,'');if(!target)return;
    const flatten=(topic:Topic):Topic[]=>[topic,...(topic.children??[]).flatMap(flatten)];
    const topics=[this.currentDoc.root,...(this.currentDoc.floating??[])].flatMap(flatten);
    const normalized=(text:string)=>text.replace(/[*_`]/g,'').trim().toLocaleLowerCase();
    const topic=target.startsWith('^')?topics.find(n=>n.blockId===target.slice(1)):topics.find(n=>(n.markdown as {kind?:string}|undefined)?.kind==='heading'&&normalized(n.text)===normalized(target));
    if(topic)this.emit({type:'select',ids:[topic.id],center:true});
  }
  private sourceNavigation():{source:MindDoc;md:ReturnType<typeof parseMarkdown>;lines:Map<MindNode,number>;topics:Topic[]}|null{
    if(!this.currentDoc||!this.markdownMode)return null;
    const lines=new Map<MindNode,number>();
    const md=parseMarkdown(this.lastText,{fallbackTitle:this.file?.basename??'',...this.plugin.rootRule(),lines});
    const source=this.currentDoc;
    const flatten=(node:Topic):Topic[]=>[node,...(node.children??[]).flatMap(flatten)];
    return {source,md,lines,topics:[source.root,...(source.floating??[])].flatMap(flatten)};
  }
  protected selectedPath():string|null{
    const nav=this.sourceNavigation();if(!nav)return null;
    if(this.selected[0]===this.currentDoc?.root.id)return '';
    const topic=nav.topics.find(n=>n.id===this.selected[0]);
    const line=(topic?.markdown as {sourceLine?:number}|undefined)?.sourceLine;
    const node=[...nav.lines].find(([,sourceLine])=>sourceLine===line)?.[0];
    return node?pathOf(node):null;
  }
  protected selectPath(path:string):void{
    const nav=this.sourceNavigation();if(!nav)return;
    if(path===''){this.emit({type:'select',ids:[this.currentDoc!.root.id],center:true});return;}
    const node=findByPath(nav.md.root,path);if(!node)return;
    const line=nav.lines.get(node);
    const topic=nav.topics.find(n=>(n.markdown as {sourceLine?:number}|undefined)?.sourceLine===line);
    if(topic)this.emit({type:'select',ids:[topic.id],center:true});
  }
  protected followSourceLine(text:string,line:number):void{const path=pathAtLine(text,line,this.plugin.rootRule());if(path!==null)this.selectPath(path);}
}
