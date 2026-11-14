import {test} from "node:test";
import assert from "node:assert/strict";
import {THEMES,getTheme,registerFusionThemes,resolveAll,type FusionCustomTheme} from "../../vendor/personal-mindmap/src/core/theme";
import type {MindDoc} from "../../vendor/personal-mindmap/src/core/types";
test("gogoga themes coexist with all original themes",()=>{
 for(const id of ["classic","fresh","business","night","sketch","mono","gogoga-snow","gogoga-rainbow","gogoga-business","gogoga-warm","gogoga-mono","gogoga-line","gogoga-forest"])assert.equal(getTheme(id).id,id);
 assert.notEqual(getTheme("business").light.root.fill,getTheme("gogoga-business").light.root.fill);
});
test("registered custom tiers resolve by depth and respect explicit node overrides",()=>{
 const tiers=Array.from({length:4},(_,i)=>({fontSize:30-i*4,bold:i===0,italic:i===2,color:"#112233",fill:i===0?"#ffeecc":null,underline:i===3,radius:12,borderStyle:"dashed" as const,borderWidth:2,borderColor:"#445566",maxWidth:180,align:false,lineColor:"#778899",lineWidth:2+i}));
 const theme:FusionCustomTheme={id:"custom-test",name:"Research",base:"snow",edge:"straight",sharp:false,dashed:false,branchColors:false,spacing:"normal",tiers};
 registerFusionThemes({customThemes:[theme]});
 const d:MindDoc={version:1,theme:theme.id,root:{id:"r",text:"R",children:[{id:"a",text:"A",children:[{id:"b",text:"B",style:{fontSize:19},children:[{id:"c",text:"C"}]}]}]}};
 const before=JSON.stringify(d),r=resolveAll(d,false);assert.equal(THEMES.find(t=>t.id===theme.id)?.zh,"Research");assert.equal(r.styles.get("a")?.fontSize,26);assert.equal(r.styles.get("b")?.fontSize,19);assert.equal(r.styles.get("b")?.italic,true);assert.equal(r.styles.get("c")?.shape,"underline");assert.equal(r.styles.get("a")?.maxWidth,180);assert.equal(r.styles.get("a")?.borderDashed,true);assert.equal(r.styles.get("a")?.lineColor,"#778899");assert.equal(JSON.stringify(d),before);
 assert.notEqual(resolveAll(d,true).styles.get("a")?.textColor,"#112233");
 registerFusionThemes({customThemes:[]});assert.ok(!THEMES.some(t=>t.id===theme.id));assert.equal(getTheme("missing").id,"classic");
});
import { layout, alignTierSizes } from "../../vendor/personal-mindmap/src/core/layout";
test('explicit mind-map branch sides remain fixed and left floating branches grow left',()=>{
 const d:MindDoc={version:1,structure:'map',root:{id:'r',text:'R',children:[{id:'a',text:'A',side:'left'},{id:'b',text:'B',side:'right'}]},floating:[{id:'f',text:'F',position:{x:-500,y:0},children:[{id:'g',text:'G'}]}]};
 const sizes=new Map(['r','a','b','f','g'].map(id=>[id,{w:80,h:30}]));const result=layout(d,sizes);
 assert.ok(result.nodes.get('a')!.x<result.nodes.get('r')!.x);assert.ok(result.nodes.get('b')!.x>result.nodes.get('r')!.x);assert.ok(result.nodes.get('g')!.x<result.nodes.get('f')!.x);
});
test("layout spacing is scoped per call without mutating shared defaults",()=>{
 const d:MindDoc={version:1,structure:"logic",root:{id:"r",text:"r",children:[{id:"a",text:"a"}]}};
 const sizes=new Map([["r",{w:80,h:30}],["a",{w:80,h:30}]]);
 const normal=layout(d,sizes),loose=layout(d,sizes,{rootGapX:160});assert.equal(loose.nodes.get("a")!.x-normal.nodes.get("a")!.x,80);assert.equal(layout(d,sizes).nodes.get("a")!.x,normal.nodes.get("a")!.x);
});
test("same-tier alignment uses widest actual node but preserves explicit width overrides",()=>{
 const sizes=new Map([["a",{w:60,h:30}],["b",{w:120,h:40}],["c",{w:200,h:20}]]),tiers=new Map([["a",1],["b",1],["c",1]]);
 const aligned=alignTierSizes(sizes,tiers,[false,true],new Set(["c"]));assert.equal(aligned.get("a")!.w,120);assert.equal(aligned.get("b")!.w,120);assert.equal(aligned.get("c")!.w,200);assert.equal(sizes.get("a")!.w,60);
});
import { edgePath } from "../../vendor/personal-mindmap/src/core/layout/geometry";
test("custom sharp elbow edges have square corners",()=>{const edge={from:"a",to:"b",x1:0,y1:0,x2:100,y2:80,orient:"h" as const,fromRoot:false};assert.match(edgePath(edge,"elbow"),/Q/);assert.doesNotMatch(edgePath(edge,"elbow",0,true),/Q/);});
