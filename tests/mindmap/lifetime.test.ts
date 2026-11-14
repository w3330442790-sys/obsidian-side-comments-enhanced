import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeHost } from '../../vendor/personal-mindmap/src/fusion/lifetime';
import type { Host } from '../../vendor/personal-mindmap/webview/src/host';
test('late editor events cannot write into the next file opened in the pane',()=>{
 let current=true;const messages:unknown[]=[];let finish:((text:string)=>void)|undefined;let note='old';
 const host:Host={post:m=>messages.push(m),subscribe:()=>()=>{},editNote:(_text,onCommit)=>{finish=onCommit;}};
 const scoped=scopeHost(host,()=>current);
 scoped.editNote?.('old',text=>{note=text;});current=false;
 scoped.post({type:'edit',text:'wrong-file'});finish?.('late-modal-save');
 assert.equal(messages.length,0);assert.equal(note,'old');
});
test('current scoped host forwards edits and view state',()=>{
 const states:unknown[]=[];const host:Host={post:m=>states.push(m),subscribe:()=>()=>{},onViewState:s=>states.push(s)};
 const scoped=scopeHost(host,()=>true);scoped.post({type:'ready'});scoped.onViewState?.({viewport:{x:0,y:0,k:1},selection:[]});assert.equal(states.length,2);
});
test('stale asynchronous attachment capabilities are rejected before touching the next file',async()=>{
 let current=true,uploads=0;const host:Host={post(){},subscribe:()=>()=>{},saveBinary:async()=>{uploads++;return 'wrong/path.png';}};
 const scoped=scopeHost(host,()=>current);current=false;
 await assert.rejects(scoped.saveBinary!('image.png',new ArrayBuffer(0),'image/png'),/closed|切换/);
 assert.equal(uploads,0);
});
