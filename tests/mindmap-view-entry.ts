import { registerMarkdownTool } from '../src/mindmap/view';
import { MarkdownView, TFile } from 'obsidian';
const w=window as unknown as Record<string,any>;
w.setupLiveDiagram=()=>{
    document.body.replaceChildren();w.notices=[];w.liveDisk='# 活动笔记\n\n- 重点\n';w.liveFail=false;w.switches=0;
    const handlers=new Map<string,Set<(...args:any[])=>void>>();
    const on=(name:string,callback:(...args:any[])=>void)=>{const set=handlers.get(name)??new Set();set.add(callback);handlers.set(name,set);return{name,callback};};
    const emit=(name:string,...args:any[])=>{handlers.get(name)?.forEach(fn=>fn(...args));};
    const file=new TFile('活动笔记.md');const registered=new Map();const commands: any[]=[];
    const leaf:any={app:null,view:null};
    const header=document.createElement('header');document.body.append(header);
    function markdown(){const view:any=new MarkdownView();view.file=file;view.leaf=leaf;view.save=async()=>{};view.addAction=(_icon:string,title:string,cb:()=>void)=>{const button=document.createElement('button');button.textContent=title;button.onclick=cb;header.append(button);return button;};return view;}
    const app:any={loadLocalStorage:(key:string)=>JSON.parse(localStorage.getItem(key)??'null'),saveLocalStorage:(key:string,value:unknown)=>localStorage.setItem(key,JSON.stringify(value)),vault:{getName:()=> 'view-test',on,offref:(ref:any)=>handlers.get(ref.name)?.delete(ref.callback),read:async()=>w.liveDisk,process:async(_file:unknown,transform:(source:string)=>string)=>{if(w.liveFail)throw Error('disk full');w.liveDisk=transform(w.liveDisk);emit('modify',file);return w.liveDisk;}},workspace:{on,onLayoutReady:(cb:()=>void)=>cb(),iterateAllLeaves:(cb:(leaf:unknown)=>void)=>cb(leaf),getLeavesOfType:(type:string)=>leaf.view?.getViewType?.()===type?[leaf]:[],getActiveViewOfType:(type:any)=>leaf.view instanceof type?leaf.view:null}};
    leaf.app=app;leaf.view=markdown();leaf.setViewState=async(state:any)=>{if(state.type==='markdown'){await leaf.view.onClose?.();leaf.view.containerEl?.remove();leaf.view=markdown();w.switches++;emit('layout-change');return;}const factory=registered.get(state.type);const view=factory(leaf);leaf.view=view;view.file=file;view.contentEl.style.height='850px';await view.onOpen();view.setViewData(w.liveDisk,true);emit('layout-change');};
    const plugin:any={app,registerView:(type:string,factory:unknown)=>registered.set(type,factory),registerEvent:()=>{},register:()=>{},addCommand:(command:unknown)=>commands.push(command)};
    registerMarkdownTool(plugin,{comments:()=>[],openComment:async()=>{}});
    w.liveCommand=()=>commands.find(command=>command.id==='toggle-mindmap').checkCallback(false);
    w.liveLeaf=leaf;w.liveHandlers=handlers;
};
