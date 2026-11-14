import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';
test('XMind conversion cannot export stale sheets while a different archive is loading',async()=>{
 const result=await build({entryPoints:['vendor/personal-mindmap/vendor/gogoga/src/xmind-view.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'xmind-host',setup(b){
 b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'test'}));b.onLoad({filter:/^obsidian$/,namespace:'test'},()=>({contents:`export class FileView{constructor(leaf){this.app=leaf.app;this.leaf=leaf;this.file=leaf.file;}} export function addIcon(){} export class Notice{} export class TFile{} export class WorkspaceLeaf{}`}));
 b.onResolve({filter:/^\.\/(canvas|view|settings)$/},args=>({path:args.path,namespace:'native'}));b.onLoad({filter:/.*/,namespace:'native'},args=>({contents:args.path==='./canvas'?'export class MindMapCanvas{}':args.path==='./view'?'export const VIEW_TYPE_MINDMAP="markdown-tool-mindmap"':'export const indentString=()=>"\\t";'}));
 }}]});
 const mod:any={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 let resolve!:(value:ArrayBuffer)=>void,writes=0;
 const app={vault:{readBinary:()=>new Promise<ArrayBuffer>(r=>{resolve=r;}),getAbstractFileByPath:()=>null,create:async()=>{writes++;return {path:'new.wmind'};}},workspace:{getLeaf:()=>({openFile:async()=>{}})}};
 const file={path:'new.xmind',basename:'new',name:'new.xmind',parent:{path:'/'}},old={path:'old.xmind'};
 const view=new mod.exports.XmindView({app,file,setViewState:async()=>{}},{settings:{maxHeadingLevel:3,indent:"tab"}});
 view.sheets=[{title:'Old',root:{id:'r',title:'Old data',children:[]},lost:{comments:0,detached:0,relationships:0,summaries:0,images:0}}];view.loadedFile=old;
 const loading=view.onLoadFile(file);await view.convertWmind();await view.convert();assert.equal(writes,0);
 resolve(new ArrayBuffer(1));await loading;
});
