// Personal fusion adaptation: all full-file Markdown editing uses the Weilanx primary canvas.
// Original upstream implementation is retained in native-view.ts for reference and regression comparison.
import { WorkspaceLeaf, Notice, type HoverPopover } from 'obsidian';
import { newBlockId } from './markdown';
import { serialize } from '../../../src/core/doc';
import type MindMapPlugin from './main';
import type { NodeCommand } from './canvas';
import type { ToolbarPosition } from './settings';
import type { HostCommand } from '../../../webview/src/host';
import { WmindView } from '../../../src/obsidian/view';
// Reuse the view type Taube Markdown Tool 1.2-1.6 already stored in workspaces,
// so existing mind-map tabs open the full canvas after upgrading.
export const VIEW_TYPE_MINDMAP='markdown-tool-mindmap';

export class MindMapView extends WmindView {
  hoverPopover:HoverPopover|null=null;
  constructor(leaf:WorkspaceLeaf,plugin:MindMapPlugin){super(leaf,plugin);}
  getViewType():string{return VIEW_TYPE_MINDMAP;}
  protected addMarkdownActions():void{
    const markdown=this.addAction('file-text','以 Markdown 打开',()=>{if(this.file)void this.plugin.openAsMarkdown(this.file,this.leaf);});
    markdown.classList.add('wm-md-mindmap-action');
    const label=markdown.ownerDocument.createElement('span');
    label.className='wm-md-mindmap-label';label.textContent='Markdown';markdown.appendChild(label);
    this.addAction('columns-2','Markdown 和脑图分屏',()=>{if(this.file)void this.plugin.openSideBySide(this.file,this.leaf);});
  }
  protected selectionChanged():void{this.plugin.syncMarkdownToMap(this);}
  getSelectedPath():string|null{return this.selectedPath();}
  revealPath(path:string):void{this.selectPath(path);}
  followLine(text:string,line:number):void{this.followSourceLine(text,line);}
  syncFromEditor(text:string):void{if(text!==this.lastText)this.setViewData(text,false);}
  reloadFromSettings():void{void this.refreshFromSettings();}
  refreshTheme():void{this.reloadFromSettings();}
  redrawAll():void{this.reloadFromSettings();}
  setToolbarPosition(_position:ToolbarPosition):void{this.reloadFromSettings();}
  async toggleOutline():Promise<void>{this.command('toggleOutline');}
  focusSelected():void{this.command('focusBranch');}
  exitFocus():void{this.command('exitFocus');}
  openSearch():void{this.command('find');}
  toggleFoldSelected():void{this.command('fold');}
  toggleNotes():void{this.command('toggleNotes');}
  toggleCallouts():void{this.command('toggleCallouts');}
  applyLock(locked:boolean):void{this.emit({type:'setLocked',locked});}
  applyFileState():void{if(this.file)this.applyLock(this.plugin.isLocked(this.file.path));}
  toggleLock():void{this.command('toggleLock');}
  toggleRecite():void{this.command('toggleStudy');}
  fitSelectedBranch():void{this.command('focusBranch');this.command('fit');}
  toggleBoxOnSelected():void{this.command('boundary');}
  toggleSummaryOnSelected():void{this.command('summary');}
  setFoldLevel(level:number|null):void{this.emit({type:'foldLevel',level});}
  showLevelFromSelected(level:number):void{this.emit({type:'foldLevel',level,fromSelection:true});}
  rememberViewportNow():void{}
  async exportPng():Promise<void>{this.command('export');}
  async exportSvg():Promise<void>{this.command('exportSvg');}
  async copyPng():Promise<void>{this.command('copyImage');}
  async copySelectedNodeLink():Promise<void>{
    if(!this.file)return;
    let topic=this.selectedTopic();if(!topic)return;
    const heading=(topic.markdown as {kind?:string}|undefined)?.kind==='heading';
    if(!heading&&!topic.blockId){
      if(this.plugin.isLocked(this.file.path)){new Notice('请先解锁脑图，以保存节点的块链接。');return;}
      const doc=structuredClone(this.currentDoc!);
      const assign=(node:typeof topic):void=>{if(node!.id===topic!.id)node!.blockId=newBlockId();for(const child of node!.children??[])assign(child);};
      [doc.root,...(doc.floating??[])].forEach(assign);
      await this.onMessage({type:'edit',text:serialize(doc)});
      topic=this.selectedTopic();if(!topic?.blockId)return;
      await this.save();this.emit({type:'update',text:serialize(this.currentDoc!)});
    }
    await navigator.clipboard.writeText(`[[${this.file.path.replace(/\.md$/,'')}${heading?'#'+topic.text:'#^'+topic.blockId}]]`);
  }
  async linkSelectedToNote():Promise<void>{
    const topic=this.selectedTopic();if(!topic)return;
    const link=await this.plugin.canvasHost(()=>this.file?.path??'',this).pickNote?.(topic.text);
    if(!link||!this.currentDoc)return;
    const update=(node:typeof topic):void=>{if(node.id===topic.id)node.link=`[[${link}]]`;for(const c of node.children??[])update(c);};
    const doc=structuredClone(this.currentDoc);[doc.root,...(doc.floating??[])].forEach(update);
    await this.onMessage({type:'edit',text:serialize(doc)});
    this.emit({type:'update',text:serialize(this.currentDoc)});
  }
  runNodeCommand(command:NodeCommand):void{
    const map:Partial<Record<NodeCommand,HostCommand>>={
      'add-child':'addChild','add-sibling':'addSibling','insert-before':'insertBefore','insert-parent':'insertParent',edit:'editNode',
      callout:'callout','add-rel':'addRelationship',delete:'deleteNode','delete-only':'deleteOnly','move-up':'moveUp','move-down':'moveDown',
      outdent:'outdent',indent:'indent','expand-branch':'expandAll',
    };const mapped=map[command];if(mapped)this.command(mapped);
  }
  setEphemeralState(state:unknown):void{
    super.setEphemeralState(state);
    const sub=(state as {subpath?:string}|null)?.subpath;
    if(typeof sub==='string')this.revealSubpath(sub);
  }
}
