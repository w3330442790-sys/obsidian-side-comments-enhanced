import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownDoc, writeMarkdownDoc, markdownFusionLosses } from '../../vendor/personal-mindmap/src/fusion/markdown';
import {addRange, moveMany, summaryToBranch} from '../../vendor/personal-mindmap/src/core/ops';
test('moving list topics after heading siblings is represented in plain Markdown in the same order',()=>{
 const source='# Root\n\n- List\n\n## Heading\n';
 let doc=parseMarkdownDoc(source,'Note');const [list,heading]=doc.root.children!;
 doc=moveMany(doc,[list.id],doc.root.id,2);
 const plain=writeMarkdownDoc(source,doc,'Note').replace(/\n?<!-- wmind-fusion:v1 .* -->\s*$/,'');
 assert.deepEqual(parseMarkdownDoc(plain,'Note').root.children!.map(node=>node.text),['Heading','List']);
});
test('unmodified Markdown has stable node IDs for viewport and note-card state',()=>{
 const source='# Root\n\n- A\n  - Leaf\n- B\n';
 const a=parseMarkdownDoc(source,'Note'),b=parseMarkdownDoc(source,'Note');
 assert.equal(a.root.id,b.root.id);assert.equal(a.root.children![0].id,b.root.children![0].id);
 const c=parseMarkdownDoc(source+'- C\n','Note');assert.equal(a.root.children![0].children![0].id,c.root.children![0].children![0].id);
});
import { xmindSheetToMindDoc, parseXmindDocs } from '../../vendor/personal-mindmap/src/fusion/xmind';

test('preserves exact source and Markdown editing with notes and hidden metadata', () => {
 const source = '---\ntheme: classic\nstructure: tree\ncustom: kept\n---\n\n# Root\n\n* First %%red w=240 callout "hi"%%\n\n  details\n\n* Secret %%hide%%\n';
 const doc = parseMarkdownDoc(source, 'File');
 assert.equal(writeMarkdownDoc(source, doc, 'File'), source);
 assert.equal(doc.structure, 'tree');
 assert.equal(doc.root.children?.[0].style?.fill, 'red');
 assert.equal(doc.root.children?.[0].width, 240);
 assert.equal(doc.root.children?.[1].hidden, true);
 doc.root.children![0].text = 'Changed';
 const next = writeMarkdownDoc(source, doc, 'File');
 assert.match(next, /\* Changed/);
 assert.match(next, /custom: kept/);
 assert.match(next, /details/);
 assert.equal(parseMarkdownDoc(next, 'File').root.children![0].text, 'Changed');
});

test('maps sibling ranges, relationships and floating topics', () => {
 const doc = parseMarkdownDoc('# Root\n\n- A %%box=2 "group" summary=2 "sum" rel=b "edge"%%\n- B %%id=b%%\n- Free %%float x=40 y=-30%%\n', 'File');
 const [a,b] = doc.root.children!;
 assert.equal(doc.root.boundaries![0].from, a.id);
 assert.equal(doc.root.boundaries![0].to, b.id);
 assert.equal(doc.root.summaries![0].text, 'sum');
 assert.equal(doc.relationships![0].to, b.id);
 assert.deepEqual(doc.floating![0].position, {x:40,y:-30});
 const next = parseMarkdownDoc(writeMarkdownDoc('', doc, 'File'), 'File');
 assert.equal(next.root.boundaries![0].text, 'group');
 assert.equal(next.relationships![0].text, 'edge');
 assert.equal(next.floating![0].text, 'Free');
});

test('converted summary branches survive Markdown round trips', () => {
  const source = '# Root\n\n- A\n- B\n';
  const doc = parseMarkdownDoc(source, 'File');
  const [a, b] = doc.root.children!;
  const range = addRange(doc, 'summaries', [a.id, b.id], '总括');
  assert.ok(range);
  const result = summaryToBranch(range!.doc, range!.id);
  assert.ok(result);
  const written = writeMarkdownDoc(source, result!.doc, 'File');
  const reloaded = parseMarkdownDoc(written, 'File');
  assert.deepEqual(reloaded.root.children!.map((child: { text: string }) => child.text), ['总括']);
  const branch = reloaded.root.children![0];
  assert.equal(branch.text, '总括');
  assert.deepEqual(branch.children!.map((child: { text: string }) => child.text), ['A', 'B']);
  assert.equal(reloaded.root.summaries, undefined);
});

test('round trips primary styles, IDs and unsupported metadata through a portable extension', () => {
 const doc = parseMarkdownDoc('# Root\n\n- A\n', 'File');
 doc.root.children![0].style = {fill:'#aabbcc', fontSize:27, italic:true, shape:'ellipse'};
 doc.root.children![0].labels = ['tag'];
 doc.root.children![0].link = 'https://example.com';
 doc.root.children![0].custom = {kept:true};
 doc.look = 'hand';
 const next = writeMarkdownDoc('# Root\n\n- A\n', doc, 'File');
 const loaded = parseMarkdownDoc(next, 'File');
 assert.deepEqual(loaded.root.children![0].style, doc.root.children![0].style);
 assert.deepEqual(loaded.root.children![0].custom, {kept:true});
 assert.deepEqual(loaded.root.children![0].labels, ['tag']);
 assert.equal(loaded.root.children![0].id, doc.root.children![0].id);
 assert.equal(loaded.look, 'hand');
 assert.deepEqual(markdownFusionLosses(doc), []);
 assert.equal(writeMarkdownDoc(next, loaded, 'File'), next);
});

test('imports XMind sheet features and reports upstream losses', () => {
 const imported = xmindSheetToMindDoc({title:'Sheet', root:{id:'root',title:'Root',children:[{id:'a',title:'A',children:[]},{id:'b',title:'B',children:[]}]}, relationships:[{from:'a',to:'b',title:'edge'}],lost:{comments:2,detached:0,relationships:0,summaries:0,images:0}});
 assert.equal(imported.title, 'Sheet');
 assert.equal(imported.doc.root.id, 'root');
 assert.equal(imported.doc.root.children![0].id, 'a');
 assert.equal(imported.doc.root.children![0].text, 'A');
 assert.equal(imported.doc.relationships![0].text, 'edge');
 assert.match(imported.warnings.join(' '), /comments.*2|2.*comments/i);
});

test('writes a fresh primary document with its root as a heading', () => {
 const doc = {version:1,root:{id:'root',text:'New root',children:[{id:'child',text:'Child'}]}};
 const loaded = parseMarkdownDoc(writeMarkdownDoc('', doc, 'Filename'), 'Filename');
 assert.equal(loaded.root.text, 'New root');
 assert.equal(loaded.root.children![0].text, 'Child');
});

test('reflects manual Markdown edits after portable metadata was saved', () => {
 const doc = parseMarkdownDoc('# Root\n\n- A %%red%%\n', 'File');
 doc.root.children![0].style = {fill:'red',fontSize:22};
 const written = writeMarkdownDoc('', doc, 'File');
 const loaded = parseMarkdownDoc(written.replace('%%red', '%%blue'), 'File');
 assert.equal(loaded.root.children![0].style!.fill, 'blue');
 assert.equal(loaded.root.children![0].style!.fontSize, 22);
});

test('Markdown remains authoritative for edited markers, ranges, relationships and frontmatter', () => {
 const source = '---\ntheme: classic\nstructure: tree\n---\n# Root\n\n- A %%callout "old" w=200 box=2 "group" rel=b "edge"%%\n- B %%id=b%%\n';
 const doc = parseMarkdownDoc(source, 'File');
 doc.root.style = {fontSize:25};
 const saved = writeMarkdownDoc(source, doc, 'File');
 const edited = saved.replace('theme: classic', 'theme: dark').replace('structure: tree', 'structure: logic').replace('callout "old"', 'callout "new"').replace('w=200', 'w=300').replace('box=2 "group"', 'box=2 "changed"').replace(' rel=b "edge"', '');
 const loaded = parseMarkdownDoc(edited, 'File');
 assert.equal(loaded.theme, 'dark');
 assert.equal(loaded.structure, 'logic');
 assert.equal(loaded.root.children![0].callout, 'new');
 assert.equal(loaded.root.children![0].width, 300);
 assert.equal(loaded.root.boundaries![0].text, 'changed');
 assert.equal(loaded.root.boundaries![0].from, loaded.root.children![0].id);
 assert.equal(loaded.relationships?.length ?? 0, 0);
});

test('preserves malformed extension comments as document content', () => {
 const source = '# Root\n\n- A\n<!-- wmind-fusion:v1 %not-valid -->\n';
 const doc = parseMarkdownDoc(source, 'File');
 doc.root.text = 'Changed';
 assert.match(writeMarkdownDoc(source, doc, 'File'), /%not-valid/);
});

test('portable extension retains overlapping ranges and advanced relationship controls', () => {
 const doc = parseMarkdownDoc('# Root\n\n- A\n- B\n', 'File');
 const [a,b] = doc.root.children!;
 doc.root.boundaries = [{id:'one',from:a.id,to:b.id,text:'outer',style:{fill:'pink'}},{id:'two',from:a.id,to:a.id,text:'inner'}];
 doc.relationships = [{id:'relation',from:a.id,to:b.id,text:'Quoted "label" %%',controls:[{x:4,y:5},{x:6,y:7}],style:{lineStyle:'dashed'}}];
 const loaded = parseMarkdownDoc(writeMarkdownDoc('',doc,'File'),'File');
 assert.deepEqual(loaded.root.boundaries, doc.root.boundaries);
 assert.deepEqual(loaded.relationships, doc.relationships);
});


test('uses stable source anchors when Markdown siblings are reordered or inserted', () => {
 const doc = parseMarkdownDoc('# Root\n\n- A\n- B\n', 'File');
 doc.root.children![0].style = {fontSize:37};
 const written = writeMarkdownDoc('', doc, 'File');
 const lines = written.split('\n');
 const a = lines.findIndex(line => /^- A/.test(line)), b = lines.findIndex(line => /^- B/.test(line));
 [lines[a], lines[b]] = [lines[b], lines[a]];
 lines.splice(a, 0, '- New');
 const loaded = parseMarkdownDoc(lines.join('\n'), 'File');
 assert.equal(loaded.root.children!.find(n => n.text === 'A')?.style?.fontSize, 37);
 assert.equal(loaded.root.children!.find(n => n.text === 'B')?.style?.fontSize, undefined);
 assert.equal(loaded.root.children!.find(n => n.text === 'New')?.style?.fontSize, undefined);
});

test('maps and writes gogoga frontmatter conventions', () => {
 const source = '---\nmindmap-theme: ocean\nmindmap-structure: logic-right\n---\n# Root\n';
 const doc = parseMarkdownDoc(source, 'File');
 assert.equal(doc.theme, 'ocean');
 assert.equal(doc.structure, 'logic');
 doc.structure = 'org';
 assert.match(writeMarkdownDoc(source, doc, 'File'), /mindmap-structure: org-down/);
});



test('imports every sheet from an XMind ZIP and rejects malformed archives', async () => {
 const content = Buffer.from(JSON.stringify([{title:'First',rootTopic:{id:'r1',title:'One'}},{title:'Second',rootTopic:{id:'r2',title:'Two'}}]));
 const name = Buffer.from('content.json');
 let crc = 0xffffffff;
 for (const byte of content) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
 crc = (crc ^ 0xffffffff) >>> 0;
 const local = Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt32LE(crc,14); local.writeUInt32LE(content.length,18); local.writeUInt32LE(content.length,22); local.writeUInt16LE(name.length,26);
 const central = Buffer.alloc(46);
 central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt32LE(crc,16); central.writeUInt32LE(content.length,20); central.writeUInt32LE(content.length,24); central.writeUInt16LE(name.length,28);
 const end = Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length+name.length,12); end.writeUInt32LE(local.length+name.length+content.length,16);
 const zip = Buffer.concat([local,name,content,central,name,end]);
 const sheets = await parseXmindDocs(zip.buffer.slice(zip.byteOffset,zip.byteOffset+zip.byteLength) as ArrayBuffer);
 assert.deepEqual(sheets.map(s => s.title), ['First','Second']);
 assert.deepEqual(sheets.map(s => s.doc.root.text), ['One','Two']);
 await assert.rejects(parseXmindDocs(new ArrayBuffer(0)));
});

test('rejects ambiguous source matching and reports recoverable metadata instead of applying wrong styles', () => {
 const doc = parseMarkdownDoc('# Root\n\n- Same\n- Same\n', 'File');
 doc.root.children![0].style = {fontSize:33};
 const written = writeMarkdownDoc('',doc,'File');
 const loaded = parseMarkdownDoc(written.replace(/ %%id=wf\d+%%/g,''),'File');
 assert.equal(loaded.root.children![0].style?.fontSize, undefined);
 assert.equal(loaded.root.children![1].style?.fontSize, undefined);
 assert.ok(loaded.fusionRecovery);
 assert.ok(markdownFusionLosses(loaded).length > 0);
});

test('bridges built-in gogoga theme names without colliding with primary themes',()=>{
 const source='---\nmindmap-theme: snow\n---\n# Root\n';
 const doc=parseMarkdownDoc(source,'File');
 assert.equal(doc.theme,'gogoga-snow');
 doc.theme='gogoga-forest';
 assert.match(writeMarkdownDoc(source,doc,'File'),/mindmap-theme: forest/);
});

test('embedded block writes reject stale source even when fence positions match',async()=>{
 const {locateBlock}=await import('../../vendor/personal-mindmap/vendor/gogoga/src/codeblock');
 assert.equal(locateBlock('```mindmap\n# External\n```\n',{lineStart:0,lineEnd:2},'# Original'),null);
 assert.deepEqual(locateBlock('intro\n```mindmap\n# Original\n```\n',{lineStart:0,lineEnd:2},'# Original'),{lineStart:1,lineEnd:3});
});

test('external topic rename preserves overlapping portable ranges and parallel relation identities',()=>{
 const doc=parseMarkdownDoc('# Root\n\n- A\n- B\n','File');
 const [a,b]=doc.root.children!;
 doc.root.boundaries=[{id:'outer',from:a.id,to:b.id,text:'outer',style:{fill:'pink'}},{id:'inner',from:a.id,to:a.id,text:'inner',style:{fill:'blue'}}];
 doc.relationships=[{id:'red',from:a.id,to:b.id,text:'edge1',style:{lineColor:'red'}},{id:'blue',from:a.id,to:b.id,text:'edge2',style:{lineColor:'blue'}}];
 const written=writeMarkdownDoc('',doc,'File');
 const loaded=parseMarkdownDoc(written.replace('# Root','# Renamed'),'File');
 assert.equal(loaded.root.text,'Renamed');
 assert.deepEqual(loaded.root.boundaries,doc.root.boundaries);
 assert.deepEqual(loaded.relationships,doc.relationships);
 assert.deepEqual(markdownFusionLosses(loaded),[]);
});

test('native relation and range edits remain authoritative without misassigning parallel styles',()=>{
 const doc=parseMarkdownDoc('# Root\n\n- A\n- B\n','File');const [a,b]=doc.root.children!;
 doc.root.boundaries=[{id:'outer',from:a.id,to:b.id,text:'outer'},{id:'inner',from:a.id,to:a.id,text:'inner'}];
 doc.relationships=[{id:'red',from:a.id,to:b.id,text:'edge1',style:{lineColor:'red'}},{id:'blue',from:a.id,to:b.id,text:'edge2',style:{lineColor:'blue'}}];
 const written=writeMarkdownDoc('',doc,'File');
 const loaded=parseMarkdownDoc(written.replace('"edge1"','"changed"').replace('box "inner"','box "edited"'),'File');
 assert.equal(loaded.root.boundaries![0].text,'edited');
 assert.equal(loaded.relationships!.find(r=>r.id==='red')?.text,'changed');
 assert.equal(loaded.relationships!.find(r=>r.id==='blue')?.style?.lineColor,'blue');
 assert.equal(new Set(loaded.relationships!.map(r=>r.id)).size,2);
 assert.ok(markdownFusionLosses(loaded).length>0);
 assert.ok(loaded.fusionRecovery);
});

test('converts every sibling at a primary Markdown level and preserves portable metadata',async()=>{
 const {convertPrimaryLevelKind}=await import('../../vendor/personal-mindmap/src/fusion/markdown');
 const source='# Root\n\n## A\n\n### Nested\n\n## B\n';
 const doc=parseMarkdownDoc(source,'File');doc.root.children![0].style={fontSize:30};
 const converted=convertPrimaryLevelKind(doc,doc.root.children![0].id,'list');
 assert.notEqual(converted,doc);
 assert.equal((doc.root.children![0].markdown as any).kind,'heading');
 assert.equal((converted.root.children![0].markdown as any).kind,'list');
 assert.equal((converted.root.children![1].markdown as any).kind,'list');
 assert.equal((converted.root.children![0].children![0].markdown as any).kind,'list');
 const written=writeMarkdownDoc(source,converted,'File');
 assert.match(written,/- A/);assert.match(written,/- B/);assert.doesNotMatch(written,/## A/);
 assert.equal(parseMarkdownDoc(written,'File').root.children![0].style?.fontSize,30);
 assert.equal(convertPrimaryLevelKind(doc,doc.root.id,'list'),doc);
});
