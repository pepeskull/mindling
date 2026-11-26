'use strict';

const {failure}=require('./store.cjs');
const API='https://api.geckoterminal.com/api/v2/networks/solana';
const ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const USD_SCALE=10n**12n;
const QUICK_CACHE_MS=30000;
const MAX_TRADE_AGE=5*60000;
const REFERENCE_MS=60*60000;
const MIN_LIQUIDITY=50000n*USD_SCALE;
const MIN_TRADE_VALUE=10n*USD_SCALE;
const USD_PRICE=199n*USD_SCALE/100n;
const QUOTE_MINTS=new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Canonical Mainnet USDC.
  'So11111111111111111111111111111111111111112' // Wrapped SOL.
]);
const DEXES=new Set(['orca','orca-whirlpool','raydium','raydium-clmm','raydium-cpmm','meteora',
  'meteora-dlmm','meteora-damm-v2']);

const unavailable=()=>failure('MARKET_PRICE_UNAVAILABLE',503);

function scaled(value) {
  if(typeof value!=='string'||!/^\d{1,14}(?:\.\d{1,40})?$/.test(value))return 0n;
  const [integer,decimal='']=value.split('.');
  return BigInt(integer)*USD_SCALE+BigInt(decimal.slice(0,12).padEnd(12,'0'));
}
const agrees=(a,b,percent)=>a>0n&&b>0n&&(a>b?a-b:b-a)*100n<=(a<b?a:b)*BigInt(percent);
function median(values) {
  const ordered=[...values].sort((a,b)=>a===b?0:a<b?-1:1);
  const center=Math.floor(ordered.length/2);
  return ordered.length%2?ordered[center]:(ordered[center-1]+ordered[center])/2n;
}
function validPool(row,mint,time) {
  const a=row?.attributes, r=row?.relationships;
  if(row?.type!=='pool'||!ADDRESS.test(a?.address||'')||row.id!=='solana_'+a.address||
      scaled(a.reserve_in_usd)<MIN_LIQUIDITY||!(Date.parse(a.pool_created_at)<=time-86400000)||
      !DEXES.has(r?.dex?.data?.id))return null;
  const base=r.base_token?.data?.id,quote=r.quote_token?.data?.id;
  if(typeof base!=='string'||typeof quote!=='string'||!base.startsWith('solana_')||!quote.startsWith('solana_'))return null;
  const [left,right]=[base.slice(7),quote.slice(7)];
  if(![left,right].includes(mint)||left===right)return null;
  const counter=left===mint?right:left,mark=scaled(left===mint?a.base_token_price_usd:a.quote_token_price_usd);
  if(!QUOTE_MINTS.has(counter)||mark<=0n)return null;
  return {address:a.address,dex:r.dex.data.id,counter,mark,liquidity:scaled(a.reserve_in_usd)};
}

function tradeQuote(pool,trades,mint,time) {
  const observations=[], seen=new Set();
  for(const row of trades.slice(0,300)) {
    const a=row?.attributes, at=Date.parse(a?.block_timestamp),signature=a?.tx_hash;
    if(row?.type!=='trade'||!SIGNATURE.test(signature||'')||seen.has(signature)||
       !(at<=time&&at>=time-MAX_TRADE_AGE)||scaled(a.volume_in_usd)<MIN_TRADE_VALUE)continue;
    const from=a.from_token_address,to=a.to_token_address;
    if(!((from===mint&&to===pool.counter)||(to===mint&&from===pool.counter)))continue;
    const price=scaled(from===mint?a.price_from_in_usd:a.price_to_in_usd);
    if(price<=0n)continue;
    seen.add(signature);
    observations.push({price,at});
  }
  if(observations.length<3)return null;
  const times=observations.map(item=>item.at), newest=Math.max(...times);
  if(newest-Math.min(...times)<30000)return null;
  const price=median(observations.map(item=>item.price));
  const agreeing=observations.filter(item=>agrees(item.price,price,5));
  if(agreeing.length<3||agreeing.length*3<observations.length*2||!agrees(price,pool.mark,5))return null;
  return {pool:pool.address,dex:pool.dex,price,newest:Math.max(...agreeing.map(item=>item.at))};
}

function marketPrice(store,{fetcher=fetch,now=Date.now}={}) {
  async function data(path) {
    try {
      const response=await fetcher(API+path,{
        headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(4500)
      });
      if(!response.ok)throw unavailable();
      const text=await response.text();
      if(text.length>1200000)throw unavailable();
      const rows=JSON.parse(text).data;
      if(!Array.isArray(rows))throw unavailable();
      return rows;
    }catch{throw unavailable();}
  }
  const usable=(value,mint,time)=>value?.mint===mint&&value.asOf<=time&&time<value.freshUntil;
  return async mint=>{
    if(typeof mint!=='string'||!ADDRESS.test(mint)||QUOTE_MINTS.has(mint))throw unavailable();
    const key='market:'+mint, cached=await store.get(key);
    if(usable(cached,mint,now()))return cached;
    // Shared rate limits keep unauthenticated/public feeds from being hammered
    // when many checkout processes see the same expired market observation.
    try{await store.rate('market-attempt:'+mint,4,60);}
    catch(error){if(error.code==='RATE_LIMITED')throw unavailable();throw error;}
    const pools=(await data('/tokens/'+mint+'/pools?page=1')).slice(0,50)
      .map(row=>validPool(row,mint,now())).filter(Boolean)
      .sort((a,b)=>a.liquidity===b.liquidity?0:a.liquidity>b.liquidity?-1:1);
    const distinct=[];
    for(const pool of pools)if(!distinct.some(item=>item.dex===pool.dex)){
      distinct.push(pool);
      if(distinct.length===3)break;
    }
    if(distinct.length<2)throw unavailable();
    const settled=await Promise.allSettled(distinct.map(async pool=>{
      const rows=await data('/pools/'+pool.address+'/trades?trade_volume_in_usd_greater_than=10');
      return tradeQuote(pool,rows,mint,now());
    }));
    const quotes=settled.flatMap(item=>item.status==='fulfilled'&&item.value?[item.value]:[]);
    if(quotes.length<2||quotes.some(a=>quotes.some(b=>!agrees(a.price,b.price,5))))throw unavailable();
    const time=now(), price=median(quotes.map(row=>row.price));
    const observation={mint,source:'geckoterminal',asOf:Math.min(...quotes.map(row=>row.newest)),observedAt:time,
      usdScaled:String(price),poolIds:quotes.map(row=>row.pool)};
    observation.freshUntil=Math.min(time+QUICK_CACHE_MS,observation.asOf+MAX_TRADE_AGE);
    if(!usable(observation,mint,time))throw unavailable();
    return store.change([key],([prior])=>{
      if(usable(prior,mint,time))return {result:prior};
      if(prior&&time-prior.observedAt<REFERENCE_MS&&!agrees(price,BigInt(prior.usdScaled),10))throw unavailable();
      return {writes:[observation],result:observation};
    });
  };
}

function quoteUnits(price,decimals) {
  if(!Number.isSafeInteger(decimals)||decimals<0||decimals>9||!/^\d{1,26}$/.test(price?.usdScaled||''))throw unavailable();
  const denominator=BigInt(price.usdScaled);
  if(denominator<=0n)throw unavailable();
  const units=(USD_PRICE*10n**BigInt(decimals)+denominator-1n)/denominator;
  if(units>18446744073709551615n)throw unavailable();
  return String(units);
}

module.exports={marketPrice,quoteUnits};
