import type { Host } from '../../webview/src/host';
/** Async dialogs/uploads may outlive a file tab. Fence their writes to the original mount. */
export function scopeHost(host:Host,isCurrent:()=>boolean):Host {
  return {...host,
    post:message=>{if(isCurrent())host.post(message);},
    onViewState:state=>{if(isCurrent())host.onViewState?.(state);},
    editNote:host.editNote?(text,commit,readOnly)=>{if(isCurrent())host.editNote?.(text,next=>{if(isCurrent())commit(next);},readOnly);}:undefined,
    saveBinary:host.saveBinary?async(name,data,mime)=>{if(!isCurrent())throw new Error('笔记已切换，已取消旧编辑器的附件写入');return host.saveBinary!(name,data,mime);}:undefined,
    pickNote:host.pickNote?async()=>{if(!isCurrent())return null;const result=await host.pickNote!();return isCurrent()?result:null;}:undefined,
    listLinkTargets:host.listLinkTargets?query=>isCurrent()?host.listLinkTargets!(query):[]:undefined,
  };
}
