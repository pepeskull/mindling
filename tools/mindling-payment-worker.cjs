'use strict';
const {randomBytes}=require('node:crypto');
const {runtimeFor}=require('../src/server/payment/runtime.cjs');
const {WORKER}=require('../src/server/payment/financial-control.cjs');
const {failure}=require('../src/server/payment/store.cjs');

async function drain(store,payment) {
  let cursor='0',nextAt=null;
  do {
    const batch=await store.pendingWork(cursor);
    cursor=batch.cursor;
    for(const {kind,id} of batch.jobs){
      const key=kind+'-work:'+id;
      const before=await store.get(key);
      if(!before||before.state==='REVIEW')continue;
      if(!Number.isSafeInteger(before.nextAt))throw failure('PAYMENT_LEDGER_REVIEW',503);
      if(before.nextAt<=Date.now()){
        try{await payment[kind==='verify'?'verifyOne':'sweepOne'](id);}
        catch(error){process.stderr.write((/^[A-Z_]{1,60}$/.test(error.code||'')?error.code:'PAYMENT_WORK_UNAVAILABLE')+'\n');}
      }
      const job=await store.get(key);
      if(job&&job.state!=='REVIEW'){
        if(!Number.isSafeInteger(job.nextAt))throw failure('PAYMENT_LEDGER_REVIEW',503);
        nextAt=Math.min(nextAt??Infinity,job.nextAt);
      }
    }
  }while(cursor!=='0');
  return nextAt;
}

async function run({store,payment},watch) {
  const service=payment();
  if(!watch)return drain(store,service);
  const controller=new AbortController();
  let ready=false,dirty=false,running=null,retry,heartbeat,probeTimer,probe;
  let connect=setTimeout(()=>controller.abort(),15000);
  function wake() {
    if(!ready)return;
    clearTimeout(retry);
    dirty=true;
    if(running)return;
    running=(async()=>{
      do {
        dirty=false;
        const nextAt=await drain(store,service);
        if(nextAt!==null&&!dirty)retry=setTimeout(wake,Math.max(1000,nextAt-Date.now()));
      }while(dirty);
    })().catch(()=>controller.abort()).finally(()=>{running=null;});
  }
  async function confirmDelivery(){
    if(probe||controller.signal.aborted)return;
    probe='probe:'+randomBytes(12).toString('hex');
    probeTimer=setTimeout(()=>controller.abort(),10000);
    try {if(!await store.probeWake(probe))controller.abort();}
    catch{controller.abort();}
  }
  async function markReady(){
    clearTimeout(probeTimer);
    probe=null;
    try {
      if(!await store.heartbeat(WORKER,{at:Date.now(),mode:'event-driven-v1'}))controller.abort();
    }catch{controller.abort();}
  }
  try {
    await store.listen(event=>{
      if(event==='ready'&&!ready){
        ready=true;
        clearTimeout(connect);
        // Close the disconnect window by discovering work after subscribing.
        // Advertise readiness once the startup reconciliation has completed.
        wake();
        void running.then(()=>{
          if(controller.signal.aborted)return;
          void confirmDelivery();
          heartbeat=setInterval(()=>void confirmDelivery(),45000);
        });
      }else if(ready&&probe&&event===probe){
        void markReady();
      }else if(event==='work'&&ready){
        wake();
        // One delayed read covers a wake observed ahead of a read replica.
        setTimeout(wake,1500).unref();
      }
    },controller.signal);
  }finally{
    ready=false;
    controller.abort();
    clearTimeout(connect);
    clearTimeout(retry);
    clearInterval(heartbeat);
    clearTimeout(probeTimer);
    if(running)await running;
  }
}
if(require.main===module)Promise.resolve().then(()=>run(runtimeFor(),process.argv.includes('--watch'))).catch(()=>{
  process.stderr.write('The Mainnet payment worker could not reach its dependencies.\n');
  process.exitCode=1;
});
module.exports={run};
