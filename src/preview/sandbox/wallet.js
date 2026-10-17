import { creditEnergy } from '../../economy/energy.js';
export const MARKET=Object.freeze({priceMicroUSD:100000n,decimals:6,liquidityMicroUSD:1000000000000n,feeLamports:5000n,source:'FIXED TEST FIXTURE'});
export function quote(state,market=MARKET){
  if(!state.mind||state.mind.life.lifeState!=='ALIVE')throw Error('Purchases cannot revive a deceased Mindling');
  if(market.priceMicroUSD<=0n||market.liquidityMicroUSD<100000000000n||!Number.isInteger(market.decimals)||market.decimals<0||market.decimals>9)throw Error('Invalid or illiquid test market');
  const units=(1990000n*10n**BigInt(market.decimals)+market.priceMicroUSD-1n)/market.priceMicroUSD;
  return {id:crypto.randomUUID(),mode:'SIMULATED',playerId:state.player.id,mindId:state.mind.id,issuedAt:state.now,expiresAt:state.now+60000,priceMicroUSD:String(market.priceMicroUSD),units:String(units),decimals:market.decimals,feeLamports:String(market.feeLamports),source:market.source};
}
export function simulatePurchase(input,q,{confirmed=false,market=MARKET}={}){
  if(!confirmed)throw Error('Confirm the simulated purchase');
  if(!q||typeof q.id!=='string'||q.id.length<8||q.id.length>100||q.mode!=='SIMULATED'||q.playerId!==input.player.id||q.mindId!==input.mind?.id||input.mind.life.lifeState!=='ALIVE')throw Error('Invalid purchase identity');
  if(input.now<q.issuedAt||input.now>=q.expiresAt||q.expiresAt-q.issuedAt!==60000)throw Error('Quote expired');
  const expected=quote(input,market),old=BigInt(q.priceMicroUSD);
  if(old<=0n||((market.priceMicroUSD>old?market.priceMicroUSD-old:old-market.priceMicroUSD)*10000n)/old>100n||q.units!==expected.units||q.decimals!==market.decimals||q.feeLamports!==expected.feeLamports)throw Error('Price changed; request a new quote');
  const wallet=input.player.wallet;
  if(wallet.receipts.some(r=>r.quoteId===q.id))throw Error('Purchase already credited');
  if(BigInt(wallet.balance)<BigInt(q.units)||BigInt(wallet.feeLamports||'10000000')<BigInt(q.feeLamports))throw Error('Insufficient test tokens or test SOL fees');
  const s=structuredClone(input),w=s.player.wallet;w.balance=String(BigInt(w.balance)-BigInt(q.units));w.feeLamports=String(BigInt(w.feeLamports||'10000000')-BigInt(q.feeLamports));
  w.receipts.push({quoteId:q.id,mode:'SIMULATED',units:q.units,at:s.now,mindId:s.mind.id,energy:10,chainSignature:null});s.mind.energy=creditEnergy(s.mind.energy,10,s.now);return s;
}
