const {test}=require('node:test');
const a=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const [name,file,loader] of [
 ['markdown','src/legacy-data.ts','ts']
]) {
 function load(){
  if(!fs.existsSync(path.join(root,file)))return {};
  if(loader==='cjs')return require(path.join(root,file));
  const esbuild=require(path.join(root,'node_modules/esbuild'));
  const code=esbuild.transformSync(fs.readFileSync(path.join(root,file),'utf8'),{loader:'ts',format:'cjs'}).code;
  const m={exports:{}};new Function('module','exports',code)(m,m.exports);return m.exports;
 }
 const run=(entries)=>{
  const files=new Map(Object.entries(entries)),writes=[];
  const adapter={exists:async p=>files.has(p),read:async p=>files.get(p),write:async(p,v)=>{writes.push(p);files.set(p,v);}};
  const app={vault:{configDir:'.custom',adapter}};
  return {files,writes,app};
 };
 test(name+': imports legacy settings byte-for-byte under custom config dir',async()=>{
  const source='{ "widths": {"笔记.md": [120]}, "future": {"keep": true} }';
  const f=run({'.custom/plugins/old/data.json':source});
  const migrate=load().migrateLegacyData;a.equal(typeof migrate,'function');
  await migrate(f.app,'new','old',['data.json']);
  a.equal(f.files.get('.custom/plugins/new/data.json'),source);
  a.equal(f.files.get('.custom/plugins/old/data.json'),source);
  await migrate(f.app,'new','old',['data.json']);a.equal(f.writes.length,1);
 });
 test(name+': existing personal settings win; fresh install requires no legacy files',async()=>{
  const f=run({'.custom/plugins/new/data.json':'{}','.custom/plugins/old/data.json':'{"old":true}'});
  const migrate=load().migrateLegacyData;a.equal(typeof migrate,'function');
  await migrate(f.app,'new','old',['data.json','enhancements.json']);a.deepEqual(f.writes,[]);
  const fresh=run({});await migrate(fresh.app,'new','old',['data.json']);a.deepEqual(fresh.writes,[]);
 });
 test(name+': invalid legacy JSON fails before copying any file',async()=>{
  const f=run({'.custom/plugins/old/data.json':'{}','.custom/plugins/old/enhancements.json':'broken'});
  const migrate=load().migrateLegacyData;a.equal(typeof migrate,'function');
  await a.rejects(()=>migrate(f.app,'new','old',['data.json','enhancements.json']));a.deepEqual(f.writes,[]);
 });
 test(name+': the newest legacy identity wins and older ones are a fallback',async()=>{
  const migrate=load().migrateLegacyData;
  const newest='{ "from": "personal" }';
  const oldest='{ "from": "side-comments" }';
  const both=run({
   '.custom/plugins/personal-markdown-tool/data.json':newest,
   '.custom/plugins/side-comments-origin/data.json':oldest,
  });
  await migrate(both.app,'new',['personal-markdown-tool','side-comments-origin'],['data.json']);
  a.equal(both.files.get('.custom/plugins/new/data.json'),newest);

  const fallback=run({'.custom/plugins/side-comments-origin/data.json':oldest});
  await migrate(fallback.app,'new',['personal-markdown-tool','side-comments-origin'],['data.json']);
  a.equal(fallback.files.get('.custom/plugins/new/data.json'),oldest);

  const invalidNewest=run({
   '.custom/plugins/personal-markdown-tool/data.json':'broken',
   '.custom/plugins/side-comments-origin/data.json':oldest,
  });
  await a.rejects(()=>migrate(invalidNewest.app,'new',['personal-markdown-tool','side-comments-origin'],['data.json']));
  a.deepEqual(invalidNewest.writes,[]);
 });
}
