'use strict';
const {runtimeFor}=require('../src/server/payment/runtime.cjs');

async function run({store,payment},watch) {
  const payments=payment(), cursors={'verify-work:':'0','sweep-work:':'0'};
  do {
    for(const [prefix,action] of [['verify-work:','verifyOne'],['sweep-work:','sweepOne']]){
      let examined=0,pages=0;
      do {
        const batch=await store.pending(prefix,cursors[prefix]);
        cursors[prefix]=batch.cursor;
        pages++;
        for(const id of batch.keys){
          try{await payments[action](id);}
          catch(error){
            const code=/^[A-Z_]{1,60}$/.test(error.code||'')?error.code:'PAYMENT_WORK_UNAVAILABLE';
            // Never print RPC errors, request metadata or private keys.
            if(code!=='PAYMENTS_PAUSED')process.stderr.write(code+'\n');
          }
          examined++;
        }
      }while(cursors[prefix]!=='0'&&examined<80&&pages<6);
    }
    if(!watch)return;
    await new Promise(resolve=>setTimeout(resolve,30000));
  }while(true);
}

if(require.main===module)runtimeFor().then(runtime=>run(runtime,process.argv.includes('--watch'))).catch(()=>{
  process.stderr.write('The Mainnet payment worker could not reach its dependencies.\n');
  process.exitCode=1;
});
module.exports={run};
