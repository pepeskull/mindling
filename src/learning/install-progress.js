// Progress reflects observed network bytes, never a simulated awakening percentage.
export class InstallProgress {
  files=new Map();
  update(event){
    if(typeof event?.file!=='string'||!Number.isFinite(event.loaded)||event.loaded<0)return;
    const total=Number.isFinite(event.total)&&event.total>0?event.total:null;
    this.files.set(event.file,{loaded:event.loaded,total});
  }
  snapshot(){
    const files=[...this.files.values()],loaded=files.reduce((sum,f)=>sum+f.loaded,0);
    // The complete runtime asset set is discovered dynamically. Per-file completion
    // never means the installation or inference health check has completed.
    const total=files.length&&files.every(f=>f.total!==null)?files.reduce((sum,f)=>sum+f.total,0):null;
    return {loaded,total,detail:total?`${(loaded/1e6).toFixed(1)} MB / ${(total/1e6).toFixed(1)} MB across reported downloads`:`${(loaded/1e6).toFixed(1)} MB downloaded · total not yet known`};
  }
}
export const INSTALL_STAGES=Object.freeze({preparing:'PREPARING NEURAL INTELLIGENCE',downloading:'DOWNLOADING LOCAL AI',initializing:'INITIALIZING INTELLIGENCE',verifying:'VERIFYING NEURAL SYSTEMS',complete:'AWAKENING COMPLETE'});
export function pendingAwakening(record,mind,pack,enabled){return Boolean(enabled&&mind?.life.lifeState==='ALIVE'&&record?.status==='pending'&&record.mindlingId===mind.id&&record.pack===pack);}
