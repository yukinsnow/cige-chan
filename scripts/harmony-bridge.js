/* Native file transport for the HarmonyOS host; only staged into its local page. */
(() => {
  const pending = new Map();
  let sequence = 0;
  window.__cigeNativeReply = (id,ok,json) => {
    const request = pending.get(id);
    if(!request) return;
    pending.delete(id);
    if(!ok){ request.reject(new Error(json)); return; }
    try{ request.resolve(JSON.parse(json)); }catch(e){ request.reject(e); }
  };
  window.__TAURI__ = {core:{invoke(command,args){
    return new Promise((resolve,reject)=>{
      const id = String(++sequence);
      pending.set(id,{resolve,reject});
      try{ window.CigeHarmony.request(id,command,JSON.stringify(args)); }
      catch(e){ pending.delete(id); reject(e); }
    });
  }}};
})();
