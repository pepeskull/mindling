'use strict';
const {runtimeFor}=require('../src/server/payment/runtime.cjs');
const {WORKER}=require('../src/server/payment/financial-control.cjs');

async function run({store,payment},watch) {
  const payments=payment();
  let cursor='0';
  do {
    let scanned=0,pages=0;
    do {
      const batch=await store.pendingWork(cursor);
      cursor=batch.cursor;
      pages++;
      for(const {kind,id} of batch.jobs){
        try{await payments[kind==='verify'?'verifyOne':'sweepOne'](id);}
        catch(error){
          const code=/^[A-Z_]{1,60}$/.test(error.code||'')?error.code:'PAYMENT_WORK_UNAVAILABLE';
          if(!['PAYMENTS_PAUSED','PAYMENT_ACTIVATION_REQUIRED','PAYMENT_APPROVAL_EXPIRED'].includes(code))
            process.stderr.write(code+'\n');
        }
        scanned++;
      }
    }while(cursor!=='0'&&scanned<80&&pages<6);
    if(watch)await store.heartbeat(WORKER,{at:Date.now()});
    if(!watch)return;
    await new Promise(resolve=>setTimeout(resolve,30000));
  }while(true);
}

if(require.main===module)runtimeFor().then(runtime=>run(runtime,process.argv.includes('--watch'))).catch(()=>{
  process.stderr.write('The Mainnet payment worker could not reach its dependencies.\n');
  process.exitCode=1;
});
module.exports={run};
