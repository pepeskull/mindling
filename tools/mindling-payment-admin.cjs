'use strict';
const {readFile}=require('node:fs/promises');
const {runtimeFor}=require('../src/server/payment/runtime.cjs');
const {CONTROL,HEAD,assertFence,verifyJournal}=require('../src/server/payment/financial-control.cjs');
const {failure}=require('../src/server/payment/store.cjs');

async function main(command,path) {
  const {store,payment}=runtimeFor();
  if(command==='pause'||command==='resume'){
    const paused=command==='pause';
    await store.change([CONTROL,HEAD],([control,head])=>{
      assertFence(control,head);
      return {writes:[{...control,cluster:'mainnet',state:paused?'PAUSED':'OPEN',head,at:Date.now()},head]};
    });
    return {state:paused?'PAUSED':'OPEN'};
  }
  if(command!=='audit')throw failure('UNKNOWN_ADMIN_COMMAND');
  const manifest=JSON.parse(await readFile(path,'utf8'));
  if(!Object.hasOwn(manifest,'previous')||
     (manifest.previous===null&&manifest.genesis!==true)||
     (manifest.previous!==null&&(!/^[a-f0-9]{64}$/.test(manifest.previous?.hash||'')||
       !Number.isSafeInteger(manifest.previous.sequence)||manifest.previous.sequence<1||
       !/^financial-event:[\w:-]{1,160}$/.test(manifest.previous.key||'')))){
    throw failure('PAYMENT_LEDGER_EXPORT_REQUIRED');
  }
  return {...await verifyJournal(store,manifest.previous,{onEvent:event=>payment().auditEvent(event)}),state:'AUDITED'};
}
if(require.main===module)main(...process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{
  process.stderr.write((/^[A-Z_]{1,60}$/.test(error.code||'')?error.code:'PAYMENT_ADMIN_UNAVAILABLE')+'\n');
  process.exitCode=1;
});
