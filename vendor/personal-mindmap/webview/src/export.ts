// 导出 SVG / PNG:克隆画布上的图形,去掉选中框、折叠按钮等界面元素
const PAD = 40;

export function buildSvg(world: SVGGElement, background: string, fontCss = "", preparedClone?: SVGGElement, preparedBounds?: {x:number;y:number;width:number;height:number}): { svg: string; w: number; h: number } {
  const bb = preparedBounds ?? world.getBBox();
  const clone = preparedClone ?? world.cloneNode(true) as SVGGElement;
  clone.querySelectorAll(".wm-ui, .wm-ghost").forEach((el) => el.remove());
  clone.setAttribute("transform", `translate(${PAD - bb.x},${PAD - bb.y})`);
  const w = Math.ceil(bb.width + PAD * 2);
  const h = Math.ceil(bb.height + PAD * 2);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (fontCss ? `<defs><style>${fontCss}</style></defs>` : "") +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    new XMLSerializer().serializeToString(clone) +
    `</svg>`;
  return { svg, w, h };
}


const PORTABLE_STYLES = ["display","visibility","position","top","left","right","bottom","width","height","min-width","max-width","min-height","max-height","margin","padding","box-sizing","font-family","font-size","font-style","font-weight","line-height","letter-spacing","text-align","text-decoration","text-transform","white-space","overflow-wrap","word-break","vertical-align","color","background-color","border","border-radius","opacity","transform","transform-origin","overflow","object-fit","fill","stroke","stroke-width","flex","flex-direction","align-items","justify-content","gap"];

async function blobDataUrl(blob:Blob):Promise<string> {
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";
  for(let at=0;at<bytes.length;at+=32768)binary+=String.fromCharCode(...bytes.subarray(at,at+32768));
  return `data:${blob.type||"application/octet-stream"};base64,${btoa(binary)}`;
}
async function fetchExportBlob(url:string):Promise<Blob> {
  const response=await fetch(url);if(!response.ok)throw new Error(`Cannot read export resource (${response.status})`);return response.blob();
}
/** Preserve MathJax pseudo-element glyph rules while replacing every font URL with bytes. */
export async function embedCssResources(css:string,baseUrl:string,read:(url:string)=>Promise<Blob>=fetchExportBlob):Promise<string> {
  const urls=[...new Set(Array.from(css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g),m=>m[1].trim()))];
  for(const original of urls){
    if(original.startsWith("data:"))continue;
    const url=new URL(original,baseUrl).href;
    if(!/^(https?:|app:|blob:|vscode-resource:|vscode-webview-resource:)/i.test(url))throw new Error("Cannot embed font from unsupported source");
    try{css=css.split(original).join(await blobDataUrl(await read(url)));}
    catch(error){throw new Error("Cannot embed math font in export: "+(error instanceof Error?error.message:String(error)));}
  }
  return css;
}
async function collectMathJaxCss():Promise<string> {
  const style=document.getElementById("MJX-CHTML-styles") as HTMLStyleElement|null;
  let css="";try{css=Array.from(style?.sheet?.cssRules??[],r=>r.cssText).join("\n");}catch{css=style?.textContent??"";}
  if(!css)throw new Error("MathJax font styles are unavailable; wait for math rendering before exporting.");
  return embedCssResources(css,style?.sheet?.href??location.href);
}
/** Clone and freeze the rendered state, then embed attachment bytes before serializing. */
export async function prepareSvg(world:SVGGElement,background:string,fontCss=""):Promise<{svg:string;w:number;h:number}> {
  const bounds=world.getBBox();
  const clone=world.cloneNode(true) as SVGGElement;
  const sources=[world,...Array.from(world.querySelectorAll("*"))];
  const copies=[clone,...Array.from(clone.querySelectorAll("*"))];
  for(let i=0;i<sources.length;i++) {
    const source=sources[i],copy=copies[i];
    if(source.closest("foreignObject")) {
      const computed=getComputedStyle(source);
      for(const prop of PORTABLE_STYLES) (copy as HTMLElement).style.setProperty(prop,computed.getPropertyValue(prop));
    }
  }
  if(clone.querySelector("iframe,video,audio,[data-export-unsupported]"))throw new Error("Interactive audio, video and web embeds cannot be included in SVG/PNG; export the Markdown source instead.");
  if(clone.querySelector("[data-pdf-pending]"))throw new Error("PDF crop is still rendering; wait for the crop image before exporting.");
  // CHTML glyphs use ::before rules; computed element styles alone cannot preserve them.
  if(clone.querySelector("mjx-container[jax='CHTML'],.MathJax_CHTML"))fontCss+=await collectMathJaxCss();
  if(clone.querySelector(".katex"))throw new Error("KaTeX math export requires its stylesheet and fonts; use MathJax or SVG math in this host.");
  const defs=document.createElementNS("http://www.w3.org/2000/svg","defs");
  const copiedIds=new Set(Array.from(clone.querySelectorAll("[id]")).map(el=>el.id));
  const addGlyph=(id:string)=>{if(copiedIds.has(id))return;copiedIds.add(id);const original=document.getElementById(id);if(!original)throw new Error("Cannot export missing SVG math glyph: "+id);const glyph=original.cloneNode(true) as Element;defs.append(glyph);for(const use of glyph.querySelectorAll("use")){const href=use.getAttribute("href")??use.getAttribute("xlink:href");if(href?.startsWith("#"))addGlyph(href.slice(1));}};
  for(const use of Array.from(clone.querySelectorAll("use"))) {const href=use.getAttribute("href")??use.getAttribute("xlink:href");if(href?.startsWith("#"))addGlyph(href.slice(1));else if(href)throw new Error("External SVG glyph references cannot be exported portably");}
  if(defs.childElementCount)clone.prepend(defs);
  await Promise.all(Array.from(clone.querySelectorAll("img,image")).map(async image=>{
    const attribute=image.localName==="img"?"src":"href";
    const src=image.getAttribute(attribute)??image.getAttribute("xlink:href");if(!src)return;
    if(/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src))return;
    if(!/^(app:|blob:|https?:|vscode-webview-resource:|vscode-resource:)/i.test(src))throw new Error("Unsupported export image source: "+src.split(":")[0]);
    try {
      const response=await fetch(src);if(!response.ok)throw new Error(String(response.status));
      const blob=await response.blob();if(!/^image\/(png|jpeg|gif|webp)$/i.test(blob.type))throw new Error("Only raster image attachments can be embedded");
      const data=await blobDataUrl(blob);image.setAttribute(attribute,data);image.removeAttribute("srcset");image.removeAttribute("xlink:href");
    } catch(error) {throw new Error("Cannot embed attachment in export: "+(error instanceof Error?error.message:String(error)));}
  }));
  return buildSvg(world,background,fontCss,clone,bounds);
}

export async function svgToPngBase64(svg: string, w: number, h: number, scale = 2): Promise<string> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  // SVG 里内嵌的 @font-face 在 decode 之后才异步就绪,先画一次触发加载,稍等再正式绘制
  if (svg.includes("@font-face")) {
    const warm = document.createElement("canvas").getContext("2d")!;
    warm.drawImage(img, 0, 0, 1, 1);
    await new Promise((r) => setTimeout(r, 400));
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png").split(",")[1];
}

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
