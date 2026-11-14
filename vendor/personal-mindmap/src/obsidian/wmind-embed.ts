import { Component, TFile, type App as ObsidianApp } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { App } from '../../webview/src/App';
import type { Host, InMsg } from '../../webview/src/host';
import type GogogaPlugin from '../../vendor/gogoga/src/main';
import { parse, serialize } from '../core/doc';
import type { Topic } from '../core/types';

interface EmbedContext { app:ObsidianApp;containerEl:HTMLElement;sourcePath:string }
interface Registry {embedByExtension:Record<string,unknown>;registerExtension(ext:string,creator:(ctx:EmbedContext,file:TFile,subpath:string)=>Component):void;unregisterExtension(ext:string):void}
export function registerWmindEmbeds(plugin:GogogaPlugin):void{
  const registry=(plugin.app as ObsidianApp&{embedRegistry?:Registry}).embedRegistry;
  if(!registry||registry.embedByExtension.wmind)return;
  registry.registerExtension('wmind',(ctx,file,subpath)=>new WmindEmbed(plugin,ctx,file,subpath));
  plugin.register(()=>registry.unregisterExtension('wmind'));
}
class WmindEmbed extends Component {
  private root:Root|null=null;
  private listeners=new Set<(message:InMsg)=>void>();
  private text='';
  private container:HTMLElement|null=null;
  private epoch=0;
  constructor(private plugin:GogogaPlugin,private context:EmbedContext,private file:TFile,private subpath:string){super();}
  onload():void{this.registerEvent(this.plugin.app.vault.on('modify',f=>{if(f===this.file)void this.loadFile();}));}
  async loadFile():Promise<void>{
    const epoch=++this.epoch;
    const source=await this.plugin.app.vault.read(this.file);if(epoch!==this.epoch)return;
    const result=parse(source);if(!result.doc){this.context.containerEl.setText(result.error?.message??'无法读取脑图');return;}
    let doc=result.doc;
    if(this.subpath){
      const key=this.subpath.replace(/^#\^?/,'');
      const find=(node:Topic):Topic|undefined=>node.id===key||node.text===key?node:node.children?.map(find).find(Boolean);
      const found=find(doc.root);if(found)doc={...doc,root:found,relationships:[],floating:[]};
    }
    this.text=serialize(doc);
    if(this.root){for(const f of this.listeners)f({type:'update',text:this.text});return;}
    const outer=this.context.containerEl.createDiv({cls:'wm-root wm-obsidian'});this.container=outer;
    const bar=outer.createDiv();bar.createEl('button',{text:'打开完整脑图'}).addEventListener('click',()=>void this.plugin.app.workspace.openLinkText(this.file.path,this.context.sourcePath,true));
    const body=outer.createDiv({cls:'wm-host'});body.style.height=this.context.containerEl.closest('.canvas-node')?'100%':'400px';
    const native=this.plugin.canvasHost(()=>this.file.path,this);
    const host:Host={
      readOnly:true,initialState:{locked:true},
      post:message=>{
        if(message.type==='ready')for(const listener of this.listeners)listener({type:'init',text:this.text,lang:'zh-CN',fileName:this.file.basename,host:'obsidian'});
        else if(message.type==='openLink')native.openLink?.(message.target,!/^[a-z]+:/i.test(message.target),new MouseEvent('click'));
      },
      subscribe:handler=>{this.listeners.add(handler);return()=>this.listeners.delete(handler);},
      renderMath:tex=>native.renderMath?.(tex)??null,resolveResource:target=>native.resolveImage?.(target)??'',
    };
    this.root=createRoot(body);this.root.render(createElement(App,{host}));
  }
  onunload():void{this.epoch++;this.root?.unmount();this.root=null;this.listeners.clear();this.container?.remove();this.container=null;}
}
