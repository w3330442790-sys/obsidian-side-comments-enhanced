const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
function load(name) {
  const entry = path.join(__dirname, '../src/mindmap', name + '.ts');
  if (!fs.existsSync(entry)) return {};
  const {outputFiles} = esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false});
  const mod={exports:{}};new Function('module','exports','require',outputFiles[0].text)(mod,mod.exports,require);return mod.exports;
}
const m=load('model'),s=load('session');
test('new diagram model exists and untouched mixed Markdown is byte-identical',()=>{
  assert.equal(typeof m.parseDocument,'function');
  const source='---\r\naliases: [测试]\r\n---\r\n\r\n# 测试\r\n\r\n正文。\r\n\r\n- 同名\r\n- 同名\r\n\r\n```ts\r\n# no heading\r\n```\r\n\r\n|a|b|\r\n|-|-|\r\n|1|2|\r\n';
  const d=m.parseDocument(source,'文件');assert.equal(m.serializeDocument(d),source);assert.equal(m.allNodes(d).length,3);
});
test('renaming one repeated node preserves other paragraphs and fences',()=>{
  const source='# 标题\n\n- 同名\n- 同名\n\n```\n- not node\n```\n\n正文  \n';
  const d=m.parseDocument(source);const id=d.root.children[1].id;m.renameNode(d,id,'第二个');const text=m.serializeDocument(d);
  assert.match(text,/- 同名\n- 第二个/);assert.match(text,/```\n- not node\n```/);assert.match(text,/正文  /);
  const reopened=m.parseDocument(text);assert.equal(reopened.root.children[1].id,id);
});
test('editing one node retains CRLF endings throughout the existing body',()=>{
  const d=m.parseDocument('# T\r\n\r\n- A\r\n- B\r\n');m.renameNode(d,d.root.children[1].id,'Changed');
  const text=m.serializeDocument(d).split('<!-- markdown-tool:')[0];assert.equal(/(^|[^\r])\n/.test(text),false);
});
test('identity metadata stores compact fingerprints rather than duplicating note prose',()=>{
  const prose='LONG_UNIQUE_NOTE_BODY '.repeat(500);const d=m.parseDocument('# T\n\n'+prose+'\n\n- A\n');m.setCollapsed(d,d.root.id,true);const source=m.serializeDocument(d);
  const metadata=decodeURIComponent(source.match(/<!-- markdown-tool:v1 (.*?) -->/)[1]);assert.equal(metadata.includes('LONG_UNIQUE_NOTE_BODY'),false);assert.ok(metadata.length<1500);
});
test('node source ranges include paragraph and code notes but exclude following child blocks',()=>{
  const d=m.parseDocument('# T\n\n根正文\n\n## A\n\n段落批注\n\n```js\nvalue()\n```\n\n- Child\n\n## B\n尾正文\n');
  const a=d.root.children[0],child=a.children[0],b=d.root.children[1];assert.equal(d.root.sourceLine,0);assert.equal(d.root.sourceEndLine,3);assert.equal(a.sourceLine,4);assert.equal(a.sourceEndLine,11);assert.equal(child.sourceLine,12);assert.equal(child.sourceEndLine,13);assert.equal(b.sourceLine,14);assert.equal(b.sourceEndLine,15);
  const summary=m.addSummary(d,[a.id,b.id]);assert.equal(summary.root.sourceLine,undefined);assert.equal(summary.root.sourceEndLine,undefined);
});
test('synthetic root maps prose after frontmatter before the first structural node',()=>{
  const d=m.parseDocument('---\ntags: [a]\n---\n\n开头正文\n\n- First\n','文件');assert.equal(d.root.sourceLine,3);assert.equal(d.root.sourceEndLine,5);assert.equal(d.root.children[0].sourceLine,6);
});
test('empty file gains editable children and root label can be materialized',()=>{
  const d=m.parseDocument('','新文件');m.renameNode(d,d.root.id,'计划');const c=m.addChild(d,d.root.id,'第一步');assert.ok(c.id);
  const text=m.serializeDocument(d);assert.match(text,/# 计划/);assert.match(text,/第一步/);assert.equal(m.parseDocument(text).root.text,'计划');
});
test('relationships follow IDs through node rename and outline reorder',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const [a,b]=d.root.children;m.setRelationship(d,a.id,b.id,'原因 → 结果');m.moveNode(d,b.id,-1);m.renameNode(d,a.id,'改名');
  const x=m.parseDocument(m.serializeDocument(d));assert.deepEqual(x.relationships.map(r=>[r.from,r.to,r.text]),[[a.id,b.id,'原因 → 结果']]);assert.equal(x.root.children[0].id,b.id);
});
test('summary root accepts nested children and roundtrips without companion files',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const group=m.addSummary(d,d.root.children.map(n=>n.id),'总括');const child=m.addChild(d,group.root.id,'分点');m.addChild(d,child.id,'细节');
  const x=m.parseDocument(m.serializeDocument(d));assert.equal(x.summaries[0].root.text,'总括');assert.equal(x.summaries[0].root.children[0].children[0].text,'细节');assert.ok(m.findNode(x,child.id));
});
test('summary membership must be contiguous siblings and invalid edits do not corrupt model',()=>{
  const d=m.parseDocument('# T\n- A\n  - a\n- B\n- C\n');const [a,b,c]=d.root.children;
  assert.throws(()=>m.addSummary(d,[a.id,c.id],'gap'));
  assert.throws(()=>m.addSummary(d,[a.children[0].id,b.id],'cross-parent'));
  assert.equal(d.summaries.length,0);
});
test('indent, outdent, add sibling, remove and collapse preserve readable hierarchy',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const [a,b]=d.root.children;m.indentNode(d,b.id);assert.equal(b.parent.id,a.id);m.outdentNode(d,b.id);assert.equal(b.parent.id,d.root.id);const c=m.addSibling(d,a.id,'C');m.setCollapsed(d,a.id,true);m.removeNode(d,c.id);
  const x=m.parseDocument(m.serializeDocument(d));assert.equal(x.root.children.length,2);assert.equal(x.root.children[0].folded,true);
});
test('malformed or future diagram metadata is read-only instead of being silently discarded',()=>{
  assert.throws(()=>m.parseDocument('# T\n<!-- markdown-tool:v1 broken -->'));
  assert.throws(()=>m.parseDocument('# T\n<!-- markdown-tool:v2 %7B%7D -->'));
});
test('external insertion before a unique node preserves relationship targets',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const [a,b]=d.root.children;m.setRelationship(d,a.id,b.id,'label');const source=m.serializeDocument(d);
  const x=m.parseDocument(source.replace('- A','- New\n- A'));assert.equal(m.findNode(x,a.id).text,'A');assert.equal(m.findNode(x,b.id).text,'B');assert.equal(x.relationships[0].to,b.id);
});
test('raw Markdown root and node renames retain relationships and summary children at stable paths',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const rootId=d.root.id,[a,b]=d.root.children;const summary=m.addSummary(d,[a.id,b.id],'结论');m.addChild(d,summary.root.id,'细节');m.setRelationship(d,a.id,b.id,'原因');
  const raw=m.serializeDocument(d).replace('# T\n','# 新标题\n').replace('- A\n','- 改名A\n');const x=m.parseDocument(raw);
  assert.equal(x.root.id,rootId);assert.equal(x.root.children[0].id,a.id);assert.equal(x.relationships[0].from,a.id);assert.equal(x.summaries[0].parentId,rootId);assert.equal(x.summaries[0].from,a.id);assert.equal(x.summaries[0].root.children[0].text,'细节');assert.equal(x.warnings.length,0);
});
test('raw Markdown note edits retain node IDs and attached diagram data',()=>{
  const d=m.parseDocument('# T\n\n根备注\n\n- A\n  原备注\n- B\n');const [a,b]=d.root.children;m.setRelationship(d,a.id,b.id,'联系');m.addSummary(d,[a.id,b.id]);
  const x=m.parseDocument(m.serializeDocument(d).replace('根备注','新的根备注').replace('原备注','新备注'));
  assert.equal(x.root.id,d.root.id);assert.equal(x.root.children[0].id,a.id);assert.equal(x.root.children[0].note,'新备注');assert.equal(x.relationships[0].from,a.id);assert.equal(x.summaries[0].parentId,d.root.id);assert.equal(x.warnings.length,0);
});
test('same-shaped raw move plus rename does not assign unmatched IDs by ambiguous position',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n- C\n');const [a,b,c]=d.root.children;m.setRelationship(d,a.id,c.id,'联系');
  const x=m.parseDocument(m.serializeDocument(d).replace('- A\n- B\n- C\n','- B\n- Renamed\n- C\n'));
  assert.equal(x.root.children[0].id,b.id);assert.equal(m.findNode(x,a.id),undefined);assert.equal(x.relationships[0].from,a.id);assert.ok(x.warnings.length>0);
});
test('external duplicate insertions never silently rebind old relationships',()=>{
  const d=m.parseDocument('# T\n- Same\n- Same\n- B\n');const [a,,b]=d.root.children;m.setRelationship(d,a.id,b.id,'label');
  const x=m.parseDocument(m.serializeDocument(d).replace('- Same','- Same\n- Same'));
  assert.equal(m.findNode(x,a.id),undefined);assert.equal(x.relationships[0].from,a.id);assert.ok(x.warnings.length>0);
});
test('moving a summary member outside its sibling range invalidates the range safely',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n- C\n');const [a,b]=d.root.children;m.addSummary(d,[a.id,b.id]);
  assert.throws(()=>m.indentNode(d,b.id),/总括/);assert.equal(b.parent.id,d.root.id);
});
test('removing a node removes dangling relationships and invalid summary ranges',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const [a,b]=d.root.children;m.setRelationship(d,a.id,b.id,'label');m.addSummary(d,[a.id,b.id]);m.removeNode(d,b.id);assert.equal(d.relationships.length,0);assert.equal(d.summaries.length,0);
});
test('nested summaries are removed recursively with relationships on their children',()=>{
  const d=m.parseDocument('# T\n- A\n- B\n');const [a,b]=d.root.children;const outer=m.addSummary(d,[a.id,b.id]);const one=m.addChild(d,outer.root.id,'one'),two=m.addChild(d,outer.root.id,'two');const inner=m.addSummary(d,[one.id,two.id]);m.setRelationship(d,inner.root.id,a.id,'nested');m.removeSummary(d,outer.id);assert.equal(d.summaries.length,0);assert.equal(d.relationships.length,0);
});
test('adding child to heading follows existing heading style without reordering sections',()=>{
  const d=m.parseDocument('# T\n\n## A\n\n## B\n');m.addChild(d,d.root.id,'C');
  const x=m.parseDocument(m.serializeDocument(d));assert.deepEqual(x.root.children.map(n=>n.text),['A','B','C']);
});
test('history undoes and redoes summary and node edits with stable identities',()=>{
  assert.equal(typeof s.MindmapHistory,'function');const h=new s.MindmapHistory('# T\n- A\n- B\n','T');const id=h.doc.root.children[0].id;
  h.edit(d=>m.renameNode(d,id,'renamed'));assert.equal(h.canUndo,true);assert.equal(h.undo(),true);assert.equal(h.doc.root.children[0].text,'A');assert.equal(h.redo(),true);assert.equal(h.doc.root.children[0].text,'renamed');assert.equal(h.doc.root.children[0].id,id);
});
test('snapshot writer rejects external modifications and retains recovery text',async()=>{
  assert.equal(typeof s.SnapshotSession,'function');let disk='old';const writer=new s.SnapshotSession(disk,async fn=>disk=fn(disk));writer.update('ours');disk='theirs';assert.equal(await writer.save(),false);assert.equal(disk,'theirs');assert.equal(writer.status,'conflict');assert.equal(writer.recoveryText,'ours');
});
test('failed write is retryable and save status follows confirmed disk writes',async()=>{
  let disk='old',fail=true;const writer=new s.SnapshotSession(disk,async fn=>{if(fail)throw Error('disk full');disk=fn(disk);return disk;});writer.update('new');assert.equal(await writer.save(),false);assert.equal(writer.status,'error');assert.equal(writer.pending,'new');fail=false;assert.equal(await writer.save(),true);assert.equal(writer.status,'saved');assert.equal(writer.baseline,'new');
});
test('edits arriving during an in-flight save remain dirty and save in order',async()=>{
  let disk='old',release;const barrier=new Promise(resolve=>release=resolve);const writer=new s.SnapshotSession(disk,async fn=>{await barrier;disk=fn(disk);return disk;});writer.update('one');const saving=writer.save();writer.update('two');release();assert.equal(await saving,true);assert.equal(writer.status,'dirty');assert.equal(writer.pending,'two');assert.equal(await writer.save(),true);assert.equal(disk,'two');
});
test('explicit reload discards pending edits after conflict and resets writer baseline',async()=>{
  let disk='old';const writer=new s.SnapshotSession(disk,async fn=>disk=fn(disk));writer.update('ours');disk='theirs';assert.equal(writer.acceptExternal(disk),false);assert.equal(writer.lastExternal,'theirs');
  assert.equal(typeof writer.discardAndReload,'function');writer.discardAndReload(disk);assert.equal(writer.status,'saved');assert.equal(writer.pending,undefined);assert.equal(writer.baseline,'theirs');writer.update('edited theirs');assert.equal(await writer.save(),true);assert.equal(disk,'edited theirs');
});
test('flush drains edits made during an active save before reporting success',async()=>{
  let disk='old',release;const barrier=new Promise(resolve=>release=resolve);const writer=new s.SnapshotSession(disk,async fn=>{await barrier;disk=fn(disk);return disk;});writer.update('one');const saving=writer.save();writer.update('two');assert.equal(typeof writer.flush,'function');const flushing=writer.flush();release();await saving;assert.equal(await flushing,true);assert.equal(disk,'two');assert.equal(writer.status,'saved');
});
test('external modification after atomic write but before completion remains a conflict',async()=>{
  let disk='old',release;const barrier=new Promise(resolve=>release=resolve);const writer=new s.SnapshotSession(disk,async fn=>{disk=fn(disk);await barrier;return disk;});writer.update('ours');const saving=writer.save();disk='theirs';writer.acceptExternal(disk);release();assert.equal(await saving,false);assert.equal(writer.status,'conflict');assert.equal(writer.pending,'ours');assert.equal(writer.lastExternal,'theirs');
});
test('unparseable external text is rejected even when local document was clean',async()=>{
  let disk='valid';const writer=new s.SnapshotSession(disk,async fn=>disk=fn(disk));disk='broken metadata';assert.equal(typeof writer.rejectExternal,'function');writer.rejectExternal(disk,'valid');assert.equal(writer.status,'conflict');assert.equal(writer.baseline,'valid');assert.equal(writer.recoveryText,'valid');assert.equal(writer.lastExternal,'broken metadata');assert.equal(await writer.flush(),false);assert.equal(disk,'broken metadata');
});
