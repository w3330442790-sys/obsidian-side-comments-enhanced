import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

async function boot() {
 const result=await build({entryPoints:['vendor/personal-mindmap/src/obsidian/main.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'plugin-host',setup(build){
  build.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'host'}));
  build.onLoad({filter:/.*/,namespace:'host'},()=>({contents:`
  class Component { constructor(){this.cleanups=[];} register(fn){this.cleanups.push(fn);} registerEvent(ref){this.register(()=>ref.off());} registerDomEvent(target,name,handler){target.addEventListener?.(name,handler);this.register(()=>target.removeEventListener?.(name,handler));} unload(){for(const fn of this.cleanups.splice(0).reverse())fn();} }
  class WorkspaceLeaf { async setViewState(state){this.state=state;} }
  class FileView extends Component {constructor(leaf){super();this.leaf=leaf;this.app=leaf.app;this.file=leaf.file;this.contentEl={};} }
  class MarkdownView extends FileView {
   constructor(leaf){super(leaf);this.actions=[];this.wasSaved=false;}
   addAction(icon,title,callback){const el=this.leaf.app.workspace.document?.createElement?.('span')??{classList:{add(){}},appendChild(){}};this.actions.push({icon,title,callback,el});return el;}
   async save(){this.wasSaved=true;}
  }
  class Plugin extends Component {
   constructor(app,manifest){super();this.app=app;this.manifest=manifest;this.views=new Map();this.extensions=new Map();this.commands=[];this.codeblocks=new Map();this.tabs=[];this.saved=[];}
   static __markdownView = MarkdownView;
   async loadData(){return null;} async saveData(data){this.saved.push(structuredClone(data));}
   registerView(type,create){this.views.set(type,create);this.register(()=>this.views.delete(type));}
   registerExtensions(exts,type){for(const ext of exts)this.extensions.set(ext,type);this.register(()=>exts.forEach(ext=>this.extensions.delete(ext)));}
   addCommand(command){this.commands.push(command);this.register(()=>this.commands.splice(this.commands.indexOf(command),1));}
   addSettingTab(tab){this.tabs.push(tab);this.register(()=>this.tabs.splice(this.tabs.indexOf(tab),1));}
   addRibbonIcon(){return {remove(){}};} registerHoverLinkSource(){}
   registerMarkdownCodeBlockProcessor(language,processor){this.codeblocks.set(language,processor);this.register(()=>this.codeblocks.delete(language));}
   registerMarkdownPostProcessor(){} registerEditorExtension(){}
  }
  const classes={Component,Plugin,WorkspaceLeaf,FileView,TextFileView:FileView,ItemView:FileView,MarkdownView};
  globalThis.__MockMarkdownView=MarkdownView;
  for(const name of ['AbstractInputSuggest','FuzzySuggestModal','PluginSettingTab','Modal','SuggestModal','Setting','Menu','MenuItem','MarkdownRenderChild','Scope','TAbstractFile','TFile','TFolder','App','Notice'])classes[name]=class extends Component {constructor(...args){super();this.app=args[0];} register(){}};
  const functions={getLanguage:()=> 'en',normalizePath:path=>path.replace(/^\\//,''),loadMathJax:async()=>{},loadPrism:async()=>{},moment:{locale:()=> 'en'},addIcon:()=>{},getIcon:()=>null,setIcon:()=>{},setTooltip:()=>{},finishRenderMath:()=>{},renderMath:()=>null};
  module.exports=new Proxy({__esModule:true,...classes,...functions},{get(target,key){return target[key]??class extends Component {constructor(...args){super();this.app=args[0];}};}});
  `}));
  build.onResolve({filter:/^(react|react-dom\/client)$/},args=>({path:args.path,namespace:'react'}));
  build.onLoad({filter:/.*/,namespace:'react'},()=>({contents:'export function App(){};export function createElement(){};export function createRoot(){return {render(){},unmount(){}}}'}));
  build.onResolve({filter:/webview\/src\/(App|RichTopic)$/},args=>({path:args.path,namespace:'react'}));
 }}]});
 const style={setProperty(){},removeProperty(){}};
 const classes=new Set<string>();
 const elements:any[]=[];
 const doc:any={body:{style,classList:{toggle(name:string,enabled:boolean){if(enabled)classes.add(name);else classes.delete(name);},contains(name:string){return classes.has(name);}}},getElementById(id:string){return elements.find(e=>e.id===id&&e.isConnected)??null;},querySelectorAll(){return [];},addEventListener(){},removeEventListener(){},createElement(){const el:any={ownerDocument:doc,isConnected:false,textContent:'',classList:{add(){},remove(){}},appendChild(child:any){el.child=child;child.isConnected=true;},remove(){el.isConnected=false;}};elements.push(el);return el;},head:{append(el:any){el.isConnected=true;}}};
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{setTimeout,clearTimeout,addEventListener(){},removeEventListener(){}}});
 const module={exports:{}};
 try {
 new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
 const Main=(module.exports as any).default;
 const refs=new Set<any>();
 const on=(name:string,fn:Function)=>{const ref={name,fn,off(){refs.delete(ref);}};refs.add(ref);return ref;};
 const panes=new Map<string,any[]>();
 const originalMd=()=>{};
 const embeds:Record<string,unknown>={md:originalMd};
 const app:any={
  workspace:{on,offref:(ref:any)=>ref.off(),document:doc,getLeavesOfType:(type:string)=>panes.get(type)??[],iterateAllLeaves(fn:Function){for(const leaves of panes.values())for(const leaf of leaves)fn(leaf);},onLayoutReady(){},getActiveFile(){return null;},getActiveViewOfType(){return null;},getMostRecentLeaf(){return null;}},
  metadataCache:{on,getCache(){return null;},resolvedLinks:{}},
  vault:{on,adapter:{async exists(){return false;},async read(){throw new Error('missing');},async write(){}}},
  embedRegistry:{embedByExtension:embeds,registerExtension(ext:string,create:unknown){embeds[ext]=create;},unregisterExtension(ext:string){delete embeds[ext];}},
  plugins:{plugins:{}},loadLocalStorage(){return null;},saveLocalStorage(){},
 };
 const plugin=new Main(app,{id:'personal-mindmap',dir:'.obsidian/plugins/personal-mindmap'});
 await plugin.onload();
 return {plugin,app,panes,refs,embeds,originalMd,MarkdownView:(globalThis as any).__MockMarkdownView,styleElements:elements,classes,cleanup(){plugin.unload();if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');}};
 } catch(error) {if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');if(originalDocument)Object.defineProperty(globalThis,'document',originalDocument);else Reflect.deleteProperty(globalThis,'document');throw error;}
}

test('full plugin registers distinct views, commands, processors and embeds and cleans up on unload',async()=>{
 const f=await boot();
 try {
  assert.ok(f.plugin.views.has('taube-markdown-tool-wmind'));
  assert.ok(f.plugin.views.has('markdown-tool-mindmap'));
  assert.ok(f.plugin.views.has('taube-markdown-tool-xmind'));
  assert.equal(f.plugin.extensions.get('wmind'),'taube-markdown-tool-wmind');
  assert.equal(f.plugin.extensions.get('xmind'),'taube-markdown-tool-xmind');
  const ids=f.plugin.commands.map((command:any)=>command.id);
  assert.ok(ids.length>40);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(f.plugin.codeblocks.has('mindmap'));assert.ok(f.plugin.codeblocks.has('gogoga-mindmap'));
  assert.equal(f.plugin.tabs.length,1);
  assert.equal(typeof f.embeds.wmind,'function');assert.equal(typeof f.embeds.xmind,'function');assert.notEqual(f.embeds.md,f.originalMd);
 } finally {f.cleanup();}
 assert.equal(f.refs.size,0);
 assert.equal(f.plugin.views.size,0);assert.equal(f.plugin.commands.length,0);
 assert.equal(f.embeds.md,f.originalMd);assert.equal(f.embeds.wmind,undefined);assert.equal(f.embeds.xmind,undefined);
 assert.ok(f.styleElements.every((el:any)=>!el.isConnected));
});

test('every Markdown tab gets a labeled mindmap toggle that does not write frontmatter',async()=>{
 const f=await boot();
 try {
  const leaf:any={app:f.app,file:{path:'note.md',extension:'md',basename:'note'}};
  const MarkdownViewClass=(globalThis as any).__MockMarkdownView;
  const view=new MarkdownViewClass(leaf);
  view.containerEl={doc:document,ownerDocument:document};
  leaf.view=view;
  const calls:any[]=[];
  (f.plugin as any).openAsMindMap=async(file:any,targetLeaf:any,remember:boolean)=>{calls.push({file,targetLeaf,remember});};
  f.panes.set('markdown',[{view,leaf}]);
  (f.plugin as any).syncMapButtons();
  assert.equal(view.actions.length,1);
  assert.equal(view.actions[0].title,'切换为思维导图（不修改文件）');
  assert.equal(view.actions[0].el.child.textContent,'思维导图');
  await view.actions[0].callback();
  assert.equal(view.wasSaved,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].file,leaf.file);
  assert.equal(calls[0].targetLeaf,leaf);
  assert.equal(calls[0].remember,false);
 } finally {f.cleanup();}
});

test('settings refresh uses the safe primary-pane lifecycle without resetting dirty source',async()=>{
 const f=await boot();
 try {
  const factory=f.plugin.views.get('taube-markdown-tool-wmind');
  const view=factory({app:f.app,file:{path:'map.wmind'}});
  view.containerEl={ownerDocument:document,doc:document};
  let safe=0,resets=0;
  view.refreshFromSettings=async()=>{safe++;};
  view.setViewData=()=>{resets++;};
  f.panes.set('taube-markdown-tool-wmind',[{view}]);
  f.plugin.applyCustomThemes();
  await f.plugin.saveSettings();
  assert.ok(safe>0);
  assert.equal(resets,0);
 } finally {f.cleanup();}
});




test('saving settings during dirty-source conflict preserves disk and local recovery',async()=>{
 const f=await boot();
 try {
  const original=JSON.stringify({version:1,root:{id:'root',text:'original'}});
  const local=JSON.stringify({version:1,root:{id:'root',text:'local'}});
  const external=JSON.stringify({version:1,root:{id:'root',text:'external'}});
  let disk=original;const copies:string[]=[];
  f.app.vault.process=async(_file:unknown,transform:(value:string)=>string)=>{disk=transform(disk);};
  f.app.vault.create=async(path:string,text:string)=>{copies.push(text);return {path};};
  f.app.fileManager={async getAvailablePathForAttachment(name:string){return name;}};
  const view=f.plugin.views.get('taube-markdown-tool-wmind')({app:f.app,file:{path:'map.wmind',basename:'map',extension:'wmind'}});
  view.containerEl={ownerDocument:document,doc:document};view.mount=()=>{view.root={unmount(){}};};view.requestSave=()=>{};
  view.setViewData(original,true);
  f.panes.set('taube-markdown-tool-wmind',[{view}]);
  f.plugin.settings.saveImmediately=false;
  await view.onMessage({type:'edit',text:local});
  disk=external;
  await f.plugin.saveSettings();
  assert.equal(disk,external);
  assert.equal(view.getViewData(),local);
  assert.equal(view.conflict,true);
  assert.deepEqual(copies,[local]);
  await f.plugin.saveSettings();
  assert.equal(view.conflict,true);assert.deepEqual(copies,[local]);
 } finally {f.cleanup();}
});
