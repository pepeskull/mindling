'use strict';
const {runtimeFor}=require('../src/server/payment/runtime.cjs');

async function work() {
  const {store,payment}=await runtimeFor();
  const payments=payment();
  let cursor='0', attempted=0;
  do {
    const batch=await store.pendingSweeps(cursor);
    cursor=batch.cursor;
    for(const key of batch.keys) {
      try {
        await payments.sweepOne(key.slice('sweep-work:'.length));
      }catch {
        // Details can include RPC credentials. The job and its last dispatch
        // state remain in Redis for the next pass or operator reconciliation.
        process.stderr.write('A Devnet sweep job remains pending.\n');
      }
      attempted++;
    }
  }while(cursor!=='0'&&attempted<100);
}

async function main() {
  do {
    await work();
    if(!process.argv.includes('--watch'))return;
    await new Promise(resolve=>setTimeout(resolve,30000));
  }while(true);
}

if(require.main===module)main().catch(()=>{
  process.stderr.write('The Devnet sweep worker could not reach its dependencies.\n');
  process.exitCode=1;
});
