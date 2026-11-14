/** Small safe inline AST: HTML is always literal; host capabilities are explicit. */
export type RichToken = {kind: "text"|"bold"|"italic"|"strike"|"highlight"|"color"|"code"|"link"|"tag"|"image"|"math"|"embed"; text?:string; target?:string; internal?:boolean; children?:RichToken[]; display?:boolean; width?:number; height?:number; color?:string};
function plainTokens(text:string):RichToken[]{
  const result:RichToken[]=[];let at=0;
  for(const match of text.matchAll(/https?:\/\/[^\s<>]+|(^|[\s(])#([\p{L}\p{N}_/-]+)/gu)){
    const index=match.index!;if(index>at)result.push({kind:'text',text:text.slice(at,index)});
    if(match[2]){if(match[1])result.push({kind:'text',text:match[1]});result.push({kind:'tag',target:match[2],text:'#'+match[2]});}
    else{let url=match[0].replace(/[.,;!?，。；！？]+$/,'');while(url.endsWith(')')&&(url.match(/\)/g)?.length??0)>(url.match(/\(/g)?.length??0))url=url.slice(0,-1);result.push({kind:'link',target:url,children:[{kind:'text',text:url}]});if(url.length<match[0].length)result.push({kind:'text',text:match[0].slice(url.length)});}
    at=index+match[0].length;
  }
  if(at<text.length)result.push({kind:'text',text:text.slice(at)});return result;
}
export function mediaKind(target:string):"image"|"audio"|"video"|"pdf-crop" {
  if(/\.pdf#/i.test(target)&&/[#&]rect=/i.test(target))return "pdf-crop";
  if(/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(target))return "video";
  if(/\.(mp3|m4a|wav|ogg|flac|aac)(?:[?#]|$)/i.test(target))return "audio";
  return "image";
}
function dimensions(param:string|undefined):{width?:number;height?:number} {
  const size=/(?:^|\|)(\d+)(?:x(\d+))?$/.exec(param??"");
  return size?{width:Math.max(32,Math.min(1200,Number(size[1]))),height:size[2]?Math.max(32,Math.min(1200,Number(size[2]))):undefined}:{};
}
export function safeLink(value:string):string|null {
  const v = value.trim();
  if (!v || /[\u0000-\u001f\u007f]/.test(v)) return null;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(v);
  return scheme && !/^(https?|mailto|obsidian)$/i.test(scheme[1]) ? null : v;
}
/** Remote resources require a host resolver; embedded raster images are safe offline. */
export function safeImageSource(value:string, hostResolved = false):string|null {
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(value)) return value;
  if (hostResolved && /^(app:|https?:|blob:|vscode-webview-resource:|vscode-resource:)/i.test(value) && !/[\u0000-\u001f]/.test(value)) return value;
  return null;
}
const tokenPattern = /\\([!-/:-@[-`{-~])|!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|!\[([^\]]*)\]\(([^\s)]+)\)|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^\s)]+)\)|(\$\$?)([^$\n]+?)\10|\*\*((?:[^*]|\*(?!\*))+?)\*\*\*?|__(.+?)__|~~(.+?)~~|==(.+?)==|`([^`]+)`|\*([^*\n]+)\*|_([^_\n]+)_|<span\s+style="color:(#[0-9a-f]{6})"\s*>([\s\S]*?)<\/span>|<iframe\s+([^>]*?)\/?>(?:\s*<\/iframe>)?|<br\s*\/?>/gi;
export function parseRich(text:string, depth = 0):RichToken[] {
  if (depth > 8) return [{kind:"text",text}];
  const out:RichToken[] = [];
  const re = new RegExp(tokenPattern.source, tokenPattern.flags);
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push(...plainTokens(text.slice(at,m.index)));
    let n:RichToken;
    if (m[1]) n = {kind:"text",text:m[1]};
    else if (m[2] || m[5]) {
      const alt=m[4]??m[2];const param=m[3]??(m[4]?.includes("|")?m[4].slice(m[4].lastIndexOf("|")+1):undefined);
      n={kind:"image",target:m[2]??m[5],text:m[4]?.includes("|")?m[4].slice(0,m[4].lastIndexOf("|")):alt,...dimensions(param)};
    }
    else if (m[6] || m[9]) {
      const target = (m[6]??m[9]).trim();
      n = safeLink(target) ? {kind:"link",target,internal:!!m[6],children:parseRich(m[7]??m[8]??target,depth+1).map(token=>token.kind==='link'||token.kind==='tag'?{kind:'text',text:richPlainText([token])}:token)} : {kind:"text",text:m[7]??m[8]??target};
    } else if (m[10]) n = {kind:"math",text:m[11],display:m[10] === "$$"};
    else if (m[19]) {
      // Only the exact span shape written by the outline toolbar is rich text.
      // Any other HTML stays literal, exactly as before.
      n = {kind:"color",color:m[19].toLowerCase(),children:parseRich(m[20]??"",depth+1)};
    }
    else if (m[21]) {
      const attrs=new Map<string,string>();for(const attr of m[21].matchAll(/([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi))attrs.set(attr[1].toLowerCase(),attr[2]??attr[3]??attr[4]);
      const src=attrs.get("src")??"";
      n=/^https?:\/\//i.test(src)&&safeLink(src)?{kind:"embed",target:src,text:attrs.get("title")??"Video embed",width:dimensions(attrs.get("width")).width??320,height:dimensions(attrs.get("height")).width??180}:{kind:"text",text:m[0]};
    }
    else if (/^<br/i.test(m[0])) n = {kind:"text",text:"\n"};
    else {
      const ix = [12,13,14,15,16,17,18].find(i=>m[i]!==undefined)!;
      const kind = ({12:"bold",13:"bold",14:"strike",15:"highlight",16:"code",17:"italic",18:"italic"} as Record<number,RichToken["kind"]>)[ix];
      let body = m[ix];
      if (ix===12 && m[0].endsWith("***") && !body.endsWith("*")) body += "*";
      n = kind === "code" ? {kind,text:body} : {kind,children:parseRich(body,depth+1)};
    }
    out.push(n); at = m.index! + m[0].length;
  }
  if (at < text.length) out.push(...plainTokens(text.slice(at)));
  return out;
}
export function richPlainText(tokens:RichToken[]):string { return tokens.map(t=>t.children ? richPlainText(t.children) : t.text??t.target??"").join(""); }
export function isRichText(text:string):boolean { return parseRich(text).some(t=>t.kind!=="text") || /<br\s*\/?>|\\[!-/:-@[-`{-~]/i.test(text); }
export function safeInlineColor(value:string|undefined):string|null { return typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)?value:null; }
