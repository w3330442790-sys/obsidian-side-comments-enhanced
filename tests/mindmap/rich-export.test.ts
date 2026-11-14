import test from "node:test";
import assert from "node:assert/strict";
const {embedCssResources}=require("../../vendor/personal-mindmap/webview/src/export");
test("math font CSS export embeds font bytes and resolves relative stylesheet URLs",async()=>{
  const urls:string[]=[];
  const css=await embedCssResources('@font-face{font-family:MJX;src:url("fonts/math.woff2")} .mjx-c::before{content:"x"}',"https://host.test/styles/math.css",async(url:string)=>{urls.push(url);return new Blob([new Uint8Array([1,2,3])],{type:"font/woff2"});});
  assert.deepEqual(urls,["https://host.test/styles/fonts/math.woff2"]);
  assert.match(css,/url\("data:font\/woff2;base64,AQID"\)/);
  assert.match(css,/\.mjx-c::before/);assert.doesNotMatch(css,/url\("fonts/);
});
test("font embedding fails explicitly rather than silently exporting missing glyphs",async()=>{
  await assert.rejects(embedCssResources('@font-face{src:url(bad.woff)}',"https://host.test/",async()=>{throw new Error("denied");}),/embed.*font|denied/i);
});
