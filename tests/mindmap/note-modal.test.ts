import test from "node:test";
import assert from "node:assert/strict";
const Module=require("node:module");
const original=Module._load;
let insertNoteAttachments:(text:string,start:number,end:number,links:string[])=>{text:string;cursor:number};
try {
  Module._load=function(request:string,...args:unknown[]){return request==="obsidian"?{Modal:class{},Component:class{},Notice:class{},MarkdownRenderer:{}}:original.call(this,request,...args);};
  ({insertNoteAttachments}=require("../../vendor/personal-mindmap/src/obsidian/note-modal"));
} finally {Module._load=original;}
test("note attachments replace only the selected draft and leave surrounding Markdown intact",()=>{
  const original="before selected after";
  const result=insertNoteAttachments(original,7,15,["assets/图.png","second image.png"]);
  assert.equal(result.text,"before ![[assets/图.png]]\n![[second image.png]] after");
  assert.equal(result.cursor,result.text.indexOf(" after"));
  assert.equal(original,"before selected after");
});
test("empty attachment insertion does not remove selected note content",()=>{
  assert.deepEqual(insertNoteAttachments("keep",0,4,[]),{text:"keep",cursor:4});
});
