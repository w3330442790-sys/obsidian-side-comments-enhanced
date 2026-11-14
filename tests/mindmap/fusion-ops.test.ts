import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPunctuation, deleteOnly, splitIntoChildren, projectView } from "../../vendor/personal-mindmap/src/core/fusion-ops";
import type { MindDoc } from "../../vendor/personal-mindmap/src/core/types";
const doc: MindDoc = {version:1,root:{id:"r",text:"root",children:[{id:"a",text:"A",children:[{id:"b",text:"B"}]},{id:"c",text:"C"}]},relationships:[{id:"rel",from:"b",to:"c"},{id:"gone",from:"a",to:"c"}]};
test("split protects code, formulas, links, escaped punctuation and thousands",()=>{
 assert.deepEqual(splitPunctuation("苹果、香蕉，1,000；`a,b`。$x,y$、[a,b](https://x/a,b)、[[a,b|c,d]]、x\\,y"),["苹果","香蕉","1,000","`a,b`","$x,y$","[a,b](https://x/a,b)","[[a,b|c,d]]","x\\,y"]);
});
test("delete only promotes children and retains their relationships without mutating input",()=>{
 const result=deleteOnly(doc,["a"]); assert.deepEqual(result.root.children?.map(x=>x.id),["b","c"]);assert.deepEqual(result.relationships?.map(x=>x.id),["rel"]); assert.equal(doc.root.children?.[0].id,"a");
});
test("delete only nested selection promotes unselected descendants",()=>{
 assert.deepEqual(deleteOnly(doc,["a","b"]).root.children?.map(x=>x.id),["c"]);
 assert.equal(deleteOnly(doc,["r"]),doc);
});
test("split inserts children and preserves existing data",()=>{
 const d=splitIntoChildren({...doc,root:{...doc.root,text:"a，b"}},"r");assert.deepEqual(d.root.children?.map(x=>x.text),["A","C","a","b"]); assert.equal(d.root.text,"a，b");
});
test("view projection focuses and hides without mutating persisted document",()=>{
 const d=projectView(doc,{focusId:"a",hidden:new Set(["b"]),showNotes:true}); assert.equal(d.root.id,"a");assert.equal(d.root.children?.length,0);assert.equal(d.root.noteExpanded,true); assert.equal(doc.root.children?.[0].children?.length,1);
});
test("study covers answer branches and task options only until revealed",()=>{
 const d:MindDoc={version:1,root:{id:"r",text:"Q",children:[{id:"a",text:"[x] yes"},{id:"b",text:"[ ] no"}]}};
 assert.equal(projectView(d,{studyMode:true}).root.children?.length,2);
 assert.equal(projectView(d,{studyMode:true}).root.children?.[0].text,"[ ] yes");
 assert.equal(projectView(d,{studyMode:true,revealed:new Set(["r"])}).root.children?.[0].text,"[x] yes");
 assert.equal(d.root.children?.[0].text,"[x] yes");
 assert.equal(projectView(d,{studyMode:true,revealed:new Set(["r"])}).root.children?.length,2);
});
test("projection removes ranges whose anchors are hidden and unfolds focused root",()=>{
 const d:MindDoc={version:1,root:{id:"r",text:"R",children:[{id:"a",text:"A",collapsed:true,children:[{id:"b",text:"B"},{id:"c",text:"C"}],summaries:[{id:"s",from:"b",to:"c",text:"sum"}]}]}};
 const p=projectView(d,{focusId:"a",hidden:new Set(["b"])});assert.equal(p.root.collapsed,undefined);assert.equal(p.root.summaries?.length,0);assert.equal(d.root.children?.[0].collapsed,true);
});
test("delete-only floating root preserves usable child positions",()=>{
 const d:MindDoc={version:1,root:{id:"r",text:"R"},floating:[{id:"a",text:"A",position:{x:50,y:60},children:[{id:"b",text:"B"},{id:"c",text:"C"}]}]};
 const p=deleteOnly(d,["a"]);assert.equal(p.floating?.length,2);assert.deepEqual(p.floating?.[0].position,{x:50,y:60});assert.notDeepEqual(p.floating?.[0].position,p.floating?.[1].position);
});
import { setFoldLevel } from "../../vendor/personal-mindmap/src/core/fusion-ops";
test("fold depth is relative to selected branch and does not fold other branches",()=>{
 const d:MindDoc={version:1,root:{id:"r",text:"r",children:[{id:"a",text:"a",collapsed:true,children:[{id:"b",text:"b",children:[{id:"c",text:"c"}]}]},{id:"x",text:"x",children:[{id:"y",text:"y"}]}]}};
 const p=setFoldLevel(d,1,"a");assert.equal(p.root.children?.[0].collapsed,undefined);assert.equal(p.root.children?.[0].children?.[0].collapsed,true);assert.equal(p.root.children?.[1].collapsed,undefined);assert.equal(setFoldLevel(p,null,"a").root.children?.[0].children?.[0].collapsed,undefined);
});
import { resizeRange } from "../../vendor/personal-mindmap/src/core/fusion-ops";
test("range endpoint resizing remains within direct sibling anchors",()=>{const d:MindDoc={version:1,root:{id:"r",text:"r",children:[{id:"a",text:"a"},{id:"b",text:"b"},{id:"c",text:"c"}],summaries:[{id:"s",from:"a",to:"b"}]}};assert.deepEqual(resizeRange(d,"s","to","c").root.summaries?.[0],{id:"s",from:"a",to:"c"});assert.equal(resizeRange(d,"s","to","r"),d);});
test("persistent hidden nodes stay in source but are projected only with showHidden",()=>{const d:MindDoc={version:1,root:{id:"r",text:"R",children:[{id:"a",text:"A",hidden:true},{id:"b",text:"B"}]}};assert.deepEqual(projectView(d,{}).root.children?.map(c=>c.id),["b"]);assert.deepEqual(projectView(d,{showHidden:true}).root.children?.map(c=>c.id),["a","b"]);assert.equal(d.root.children?.[0].hidden,true);});
test('note-card dimensions and collapse are view state only',()=>{
 const d:MindDoc={version:1,root:{id:'r',text:'R',children:[{id:'n',text:'N',note:'content'}]}};
 const p=projectView(d,{showNotes:true,noteCards:{n:{w:420,h:190}},noteMaxHeight:300});
 assert.equal(p.root.children?.[0].noteWidth,420);assert.equal(p.root.children?.[0].noteHeight,190);
 assert.equal(projectView(d,{showNotes:true,noteCards:{n:{collapsed:true}}}).root.children?.[0].noteExpanded,false);
 assert.equal(d.root.children?.[0].noteWidth,undefined);
});
test('locked folding remains a disposable view override',()=>{
 const d:MindDoc={version:1,root:{id:'r',text:'R',children:[{id:'n',text:'N',collapsed:true,children:[{id:'child',text:'C'}]}]}};
 assert.equal(projectView(d,{folds:{n:false}}).root.children?.[0].collapsed,false);
 assert.equal(d.root.children?.[0].collapsed,true);
});
