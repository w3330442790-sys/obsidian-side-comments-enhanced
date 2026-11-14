import test from "node:test";
import assert from "node:assert/strict";
import { parseRich, richPlainText, isRichText, safeLink, safeImageSource } from "../../vendor/personal-mindmap/webview/src/rich";
test('bare URLs and hashtags are actionable tokens without swallowing final punctuation',()=>{
 const parsed=parseRich('见 https://example.com/a。 #复习/内科');
 assert.equal(parsed.find(token=>token.kind==='link')?.target,'https://example.com/a');
 assert.equal(parsed.find(token=>token.kind==='tag')?.target,'复习/内科');assert.equal(richPlainText(parsed),'见 https://example.com/a。 #复习/内科');
});

test("inline formatting keeps nested text and link targets", () => {
  const nodes = parseRich("**bold *italic*** ~~old~~ ==answer== [[Note#part|alias]] [site](https://example.org)");
  assert.equal(richPlainText(nodes), "bold italic old answer alias site");
  assert.equal(nodes[0].kind, "bold");
  assert.ok(nodes.some(n => n.kind === "link" && n.target === "Note#part" && n.internal));
});
test("images and math are typed tokens without executing html", () => {
  const nodes = parseRich('![[photo.png|120]] $x^2$ <img onerror=evil>');
  assert.equal(nodes[0].kind, "image");
  assert.equal(nodes[2].kind, "math");
  assert.match(richPlainText(nodes), /<img onerror=evil>/);
});
test("dangerous protocols and network image loads require explicit host resolution", () => {
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("data:text/html,evil"), null);
  assert.equal(safeLink("https://example.org"), "https://example.org");
  assert.equal(safeImageSource("https://example.org/a.png"), null);
  assert.equal(safeImageSource("data:image/svg+xml;base64,AAAA"), null);
  assert.ok(safeImageSource("data:image/png;base64,AAAA"));
});
test("plain topics preserve SVG path and escaped markup stays literal", () => {
  assert.equal(isRichText("plain 中文"), false);
  assert.equal(isRichText("**bold**"), true);
  assert.equal(richPlainText(parseRich(String.raw`\*literal\*`)), "*literal*");
});
test("only the exact color span becomes rich text and other HTML stays literal", () => {
  const nodes = parseRich('前<span style="color:#dc2626">**重点**</span>后');
  const color = nodes.find(token => token.kind === "color");
  assert.equal(color?.color, "#dc2626");
  assert.equal(richPlainText(nodes), "前重点后");
  assert.equal(color?.children?.[0].kind, "bold");
  assert.equal(isRichText('<span style="color:#dc2626">重点</span>'), true);
  assert.doesNotMatch(JSON.stringify(parseRich('<span style="color:red">重点</span>')), /"kind":"color"/);
  assert.doesNotMatch(JSON.stringify(parseRich('<span onclick="evil()" style="color:#dc2626">重点</span>')), /"kind":"color"/);
  assert.match(richPlainText(parseRich('<span style="color:red">重点</span>')), /<span style=/);
});
test("inline color values are validated before becoming CSS", () => {
  const { safeInlineColor } = require("../../vendor/personal-mindmap/webview/src/rich");
  assert.equal(safeInlineColor("#dc2626"), "#dc2626");
  assert.equal(safeInlineColor("red"), null);
  assert.equal(safeInlineColor("red;position:fixed"), null);
  assert.equal(safeInlineColor(undefined), null);
});

// Require through tsx's runtime hook so the root Node tsconfig need not compile JSX.
const { createElement } = require("react");
(globalThis as unknown as {React:unknown}).React=require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { TopicNode } = require("../../vendor/personal-mindmap/webview/src/TopicNode");
const { RichEnvironment } = require("../../vendor/personal-mindmap/webview/src/RichTopic");
const { resolveAll } = require("../../vendor/personal-mindmap/src/core/theme");
test("study masks metadata answers including notes, callouts and labels", () => {
  const topic={id:"a",text:"answer body",markers:["🙈"],note:"private note",labels:["answer label"],callout:"private callout"};
  const style=resolveAll({version:1,root:topic},false).styles.get("a");
  const metrics={textX:10,textY:10,textW:160,textH:20,lines:[topic.text],font:"14px sans-serif",lineHeight:20,markersX:0,markersY:10,markerSize:16,iconsX:170,iconsY:10,labelsX:10,labelsY:35,labelWidths:[80],extraY:10,extras:[{kind:"note",text:topic.note,y:40,h:35},{kind:"callout",text:topic.callout,y:80,h:35}]};
  const node=createElement(TopicNode,{box:{id:"a",kind:"topic",x:0,y:0,w:220,h:150},style,m:metrics,content:topic,selected:false,background:"#fff"});
  const covered=renderToStaticMarkup(createElement(RichEnvironment.Provider,{value:{studyMode:true,revealed:new Set()}},createElement("svg",null,node)));
  assert.match(covered, /<g visibility="hidden">/);
  assert.ok(covered.indexOf('visibility="hidden"') < covered.indexOf('answer label'));
  assert.ok(covered.indexOf('answer label') < covered.indexOf('aria-label="Reveal answer"'));
  const revealed=renderToStaticMarkup(createElement(RichEnvironment.Provider,{value:{studyMode:true,revealed:new Set(["a"])}},createElement("svg",null,node)));
  assert.doesNotMatch(revealed,/visibility="hidden"/);
  assert.doesNotMatch(revealed,/aria-label="Reveal answer"/);
});

test("study highlights conceal their content and reveal the owning topic", () => {
  class InlineElement {
    children:InlineElement[]=[]; parent?:InlineElement; textContent=""; style:Record<string,string>={};dataset:Record<string,string>={};tabIndex=-1;
    listeners:Record<string,(event:any)=>void>={};attributes:Record<string,string>={};
    get firstChild(){return this.children[0];}
    append(child:InlineElement){if(child.parent)child.parent.children=child.parent.children.filter(x=>x!==child);child.parent=this;this.children.push(child);}
    replaceChildren(){this.children=[];}
    setAttribute(key:string,value:string){this.attributes[key]=value;}
    addEventListener(key:string,value:(event:any)=>void){this.listeners[key]=value;}
  }
  const prior=(globalThis as any).document;
  (globalThis as any).document={createElement:()=>new InlineElement(),createTextNode:(text:string)=>Object.assign(new InlineElement(),{textContent:text})};
  try {
    const {fillRichElement}=require("../../vendor/personal-mindmap/webview/src/RichTopic");
    const root=new InlineElement();let revealed="";
    fillRichElement(root,"==answer== visible",{studyMode:true,topicId:"a",revealed:new Set(),reveal:(id:string)=>{revealed=id;}});
    const mark=root.children[0];
    assert.equal(mark.children[0].style.visibility,"hidden");
    assert.equal(mark.attributes["aria-label"],"Reveal highlighted answer");
    mark.listeners.click({preventDefault(){},stopPropagation(){}});assert.equal(revealed,"a");
    fillRichElement(root,"==answer== visible",{studyMode:true,topicId:"a",revealed:new Set(["a"])});
    assert.equal(root.children[0].children[0].textContent,"answer");
    assert.equal(root.children[0].children[0].style.visibility,undefined);
  } finally {(globalThis as any).document=prior;}
});

test("cloze mode masks highlights while leaving normal text visible", () => {
  class ClozeElement {
    children:ClozeElement[]=[]; parent?:ClozeElement; textContent=""; style:Record<string,string>={};dataset:Record<string,string>={};tabIndex=-1;
    listeners:Record<string,(event:any)=>void>={};attributes:Record<string,string>={};
    get firstChild(){return this.children[0];}
    append(child:ClozeElement){if(child.parent)child.parent.children=child.parent.children.filter(x=>x!==child);child.parent=this;this.children.push(child);}
    replaceChildren(){this.children=[];}
    setAttribute(key:string,value:string){this.attributes[key]=value;}
    addEventListener(key:string,value:(event:any)=>void){this.listeners[key]=value;}
  }
  const prior=(globalThis as any).document;
  (globalThis as any).document={createElement:()=>new ClozeElement(),createTextNode:(text:string)=>Object.assign(new ClozeElement(),{textContent:text})};
  try {
    const {fillRichElement}=require("../../vendor/personal-mindmap/webview/src/RichTopic");
    const root=new ClozeElement();
    fillRichElement(root,"==answer== visible",{clozeMode:true,topicId:"a",revealed:new Set()});
    assert.equal(root.children[0].children[0].style.visibility,"hidden");
    assert.equal(root.children[0].attributes["aria-label"],"Reveal highlighted answer");
    assert.equal(root.children[1].textContent," visible");
  } finally {(globalThis as any).document=prior;}
});

test("attachment dimensions and media embeds are parsed safely", () => {
  const {mediaKind}=require("../../vendor/personal-mindmap/webview/src/rich");
  assert.equal(mediaKind("lecture.mp4#t=30"),"video");
  assert.equal(mediaKind("sound.ogg"),"audio");
  assert.equal(mediaKind("paper.pdf#page=2&rect=1,2,3,4"),"pdf-crop");
  const image=parseRich("![diagram|360x180](diagram.png)")[0];
  assert.equal(image.width,360);assert.equal(image.height,180);assert.equal(image.text,"diagram");
  const embed=parseRich('<iframe src="https://www.youtube.com/embed/abc" width="420" height="260" onload="evil()"></iframe>')[0];
  assert.equal(embed.kind,"embed");assert.equal(embed.width,420);assert.equal(embed.height,260);
  assert.equal(parseRich('<iframe src="javascript:alert(1)"></iframe>')[0].kind,"text");
});
