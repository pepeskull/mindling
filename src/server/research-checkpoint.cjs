'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const {fail}=require('./research-http.cjs');
const mac=(value,key)=>createHmac('sha256',key).update(JSON.stringify(value)).digest('hex');
function seal(evidence,request,originalId,key,plan=[]){
  const data={version:1,expiresAt:Date.now()+600000,originalId,request,plan,evidence};
  return {...data,signature:mac(data,key)};
}
async function verify(checkpoint,key){
  const contract=await import('../autonomous/research-contract.js');
  try{
    contract.validateResearchCheckpoint(checkpoint);
    const {signature,...data}=checkpoint;
    if(checkpoint.expiresAt<=Date.now()||checkpoint.expiresAt>Date.now()+630000||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(mac(data,key),'hex')))throw Error('invalid');
    return data;
  }catch{throw Object.assign(fail('INVALID_REQUEST','CHECKPOINT_INVALID_OR_EXPIRED'),{status:400});}
}
module.exports={seal,verify};
