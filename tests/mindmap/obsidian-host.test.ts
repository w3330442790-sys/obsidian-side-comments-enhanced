import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

async function loadView(wrapper=false) {
 const result=await build({entryPoints:[wrapper?'vendor/personal-mindmap/vendor/gogoga/src/view.ts':'vendor/personal-mindmap/src/obsidian/view.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'host-test-shim',setup(build){
 build.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'shim'}));
 build.onLoad({filter:/.*/,namespace:'shim'},()=>({contents:`
 export class Notice { static messages=[]; constructor(message){Notice.messages.push(message);} }
 export class Scope { register(){} }
 export class TextFileView { constructor(leaf){this.leaf=leaf;this.app=leaf.app;this.file=leaf.file;this.scope={};this.data='';this.contentEl={};} async onClose(){} async onUnloadFile(){} setEphemeralState(){} }
 export class WorkspaceLeaf {} export class Modal {} export class Component { load(){} unload(){} }
 export class TFile {} export const MarkdownRenderer={render(){}};export function finishRenderMath(){} export function renderMath(){} export const moment={locale(){return 'en';}};
 `}));
 build.onResolve({filter:/^(react|react-dom\/client)$/},args=>({path:args.path,namespace:'react-shim'}));
 build.onLoad({filter:/.*/,namespace:'react-shim'},()=>({contents:'export function createElement(){};export function createRoot(){return {render(){},unmount(){}}}'}));
 build.onResolve({filter:/webview\/src\/(App|RichTopic)$/},args=>({path:args.path,namespace:'app-shim'}));
 build.onLoad({filter:/.*/,namespace:'app-shim'},()=>({contents:'export function App(){};export function registerRichRenderer(){return ()=>{}}'}));
 }}]});
 const mod={exports:{}};
 new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const Base=wrapper?(mod.exports as any).MindMapView:(mod.exports as any).WmindView;
 return class extends Base {
  constructor(...args:any[]){super(...args);}
  mount(){this.root={unmount(){}};}
  receive(message:unknown){return this.onMessage(message);}
  get local(){return this.lastText;}
  get conflicted(){return this.conflict;}
  get doc(){return this.currentDoc;}
  events:any[]=[];
  emit(message:unknown){this.events.push(message);}
 };
}
const valid=(text:string,version=1)=>JSON.stringify({version,root:{id:'root',text}});
async function fixture(source=valid('A'),options:{echo?:boolean; external?:string; markdown?:boolean; wrapper?:boolean}={}) {
 const View=await loadView(options.wrapper);let disk=source;
 const copies:{path:string;text:string}[]=[];
 let view:any;
 const file=options.markdown?{path:'note.md',basename:'note',extension:'md'}:{path:'map.wmind',basename:'map',extension:'wmind'};
 const app={scope:{},vault:{async process(_file:unknown,transform:(disk:string)=>string){disk=transform(options.external??disk);if(options.echo)view.setViewData(disk,false);},async create(path:string,text:string){copies.push({path,text});return {path};}},fileManager:{async getAvailablePathForAttachment(name:string){return name;}}};
 const plugin={rootRule(){return {};},isLocked(){return false;},getViewport(){},rememberViewport(){},setLocked(){}};
 view=new View({app,file},plugin);view.setViewData(source,true);
 return {view,copies,disk:()=>disk};
}

test('own Vault.process echoes do not create a conflict or rewind queued edits',async()=>{
 const {view,disk}=await fixture(valid('A'),{echo:true});
 await view.receive({type:'edit',text:valid('B')});
 assert.equal(view.conflicted,false);
 assert.equal(disk(),valid('B'));
 await view.receive({type:'edit',text:valid('C')});
 assert.equal(disk(),valid('C'));
});

test('future-version and invalid source remain unwritable even for a forged edit',async()=>{
 for(const source of [valid('future',999),'broken json']) {
  const {view,disk}=await fixture(source);
  await view.receive({type:'edit',text:valid('replacement')});
  assert.equal(disk(),source);
  assert.equal(view.local,source);
 }
});

test('conflicts preserve external disk and automatically create local recovery before unload',async()=>{
 const {view,copies,disk}=await fixture(valid('A'),{external:valid('external')});
 await view.receive({type:'edit',text:valid('local')});
 assert.equal(view.conflicted,true);
 assert.equal(copies.length,1);
 assert.equal(copies[0].text,valid('local'));
 await view.onUnloadFile(view.file);
 assert.equal(copies.length,1);
});

test('older queued self echoes cannot conflict with a newer local snapshot',async()=>{
 const {view,disk}=await fixture(valid('A'),{echo:true});
 await Promise.all([view.receive({type:'edit',text:valid('B')}),view.receive({type:'edit',text:valid('C')})]);
 assert.equal(view.conflicted,false);
 assert.equal(disk(),valid('C'));
 assert.equal(view.local,valid('C'));
});

test('source navigation handles hidden and floating siblings using source lines',async()=>{
 const {view}=await fixture();
 view.file={path:'note.md',basename:'note',extension:'md'};
 view.setViewData('# Root\n\n- Secret %%hide%%\n- Free %%float x=20 y=30%%\n- Visible\n',true);
 const visible=view.doc.root.children.find((node:any)=>node.text==='Visible');
 view.selected=[visible.id];
 assert.equal(view.selectedPath(),'1');
 view.selectPath('0');
 assert.equal(view.events.at(-1).ids[0],view.doc.floating[0].id);
});

test('heading and block subpaths resolve topic IDs rather than numeric tree paths',async()=>{
 const {view}=await fixture();
 view.file={path:'note.md',basename:'note',extension:'md'};
 view.setViewData('# Root\n\n## Heading\n\n- Linked ^known\n',true);
 const heading=view.doc.root.children[0], list=heading.children[0];
 view.revealSubpath('#Heading');assert.equal(view.events.at(-1).ids[0],heading.id);
 view.revealSubpath('#^known');assert.equal(view.events.at(-1).ids[0],list.id);
});


test('copying a list-topic link persists a real Obsidian block ID',async()=>{
 let copied='';
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{async writeText(text:string){copied=text;}}}});
 try {
  const {view,disk}=await fixture('# Root\n\n- List topic\n',{markdown:true,wrapper:true});
  view.selected=[view.doc.root.children[0].id];
  await view.copySelectedNodeLink();
  const block=view.doc.root.children[0].blockId;
  assert.ok(block);
  assert.match(disk(),new RegExp('\\^'+block));
  assert.equal(copied,`[[note#^${block}]]`);
 } finally {if(original)Object.defineProperty(globalThis,'navigator',original);}
});

test('deferred autosave cannot discard dirty local edits on an external refresh',async()=>{
 const {view,copies}=await fixture(valid('A'));
 view.fusionPlugin.settings={saveImmediately:false};view.requestSave=()=>{};
 await view.receive({type:'edit',text:valid('local')});
 view.setViewData(valid('external'),false);
 assert.equal(view.local,valid('local'));
 assert.equal(view.conflicted,true);
 await view.onUnloadFile(view.file);
 assert.equal(copies[0].text,valid('local'));
});
