'use strict';

// Copy only missing configuration files. Never change the legacy files or notes.
async function migrateLegacyData(app, currentId, legacyId, names) {
 const adapter=app.vault.adapter;
 const root=app.vault.configDir+'/plugins/';
 const pending=[];
 for(const name of names){
  const target=root+currentId+'/'+name,source=root+legacyId+'/'+name;
  if(await adapter.exists(target)||!await adapter.exists(source))continue;
  const text=await adapter.read(source),value=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid legacy settings: '+source);
  pending.push({target,text});
 }
 for(const {target,text} of pending){
  if(!await adapter.exists(target))await adapter.write(target,text);
 }
}
module.exports={migrateLegacyData};
