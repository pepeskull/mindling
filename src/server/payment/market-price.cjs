'use strict';

const {failure}=require('./store.cjs');
const SOL_USD='ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const USD_SCALE=10n**12n;
const USD_PRICE=199n*USD_SCALE/100n;
const LAMPORTS=10n**9n;
const MAX_AGE=90000;
const REFERENCE_MS=3600000;
const U64_MAX=(1n<<64n)-1n;
const unavailable=()=>failure('MARKET_PRICE_UNAVAILABLE',503);
const ceil=(numerator,denominator)=>(numerator+denominator-1n)/denominator;

async function solPrice(fetcher,time){
  const response=await fetcher('https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D='+SOL_USD,{
    headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(4500)
  });
  if(!response.ok)throw unavailable();
  const rows=(await response.json()).parsed;
  if(rows?.length!==1||rows[0].id!==SOL_USD)throw unavailable();
  const {price,conf,expo,publish_time}=rows[0].price??{};
  if(!/^\d{1,20}$/.test(price)||!/^\d{1,20}$/.test(conf)||!Number.isInteger(expo)||expo<-12||expo>0||
    !Number.isSafeInteger(publish_time)||publish_time*1000>time+5000||publish_time*1000<=time-MAX_AGE)throw unavailable();
  const value=BigInt(price);
  if(value<=0n||BigInt(conf)*100n>value)throw unavailable();
  return {value:value*10n**BigInt(expo+12),asOf:publish_time*1000};
}

function referencePrice(market,oracle){
  const {base,quote,executableBase,executableQuote,feeBps}=market;
  if(base<=0n||quote<=0n||executableBase<=0n||executableQuote<=0n||feeBps<0n||feeBps>300n)throw unavailable();
  const depth=ceil(20n*USD_SCALE*LAMPORTS,oracle.value);
  if(depth<=0n||depth>U64_MAX||executableQuote<depth)throw unavailable();
  const spot=depth*base/quote;
  // Check both directions against the live reserve formula and actual token
  // availability. The fee ceiling includes all configured SOL fee tiers.
  const net=depth*10000n/(10000n+feeBps)-3n;
  if(!spot||net<=0n)throw unavailable();
  const buy=net*base/(quote+net);
  const grossSell=spot*quote/(base+spot);
  const sell=grossSell-ceil(grossSell*feeBps,10000n)-3n;
  if(buy>executableBase||grossSell>executableQuote||buy*100n<spot*95n||sell*100n<depth*95n)throw unavailable();
  return {
    numerator:String(oracle.value*quote),denominator:String(LAMPORTS*base),
    usdScaled:String(oracle.value*quote*10n**BigInt(market.decimals)/(LAMPORTS*base))
  };
}

function differs(a,b){
  const left=BigInt(a.numerator)*BigInt(b.denominator);
  const right=BigInt(b.numerator)*BigInt(a.denominator);
  return left*100n>right*110n||left*100n<right*90n;
}

function marketPrice(store,{snapshot,fetcher=fetch,now=Date.now}={}) {
  return async (mint,decimals,tokenProgram)=>{
    if(!snapshot||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))throw unavailable();
    try{await store.rate('market-attempt:'+mint,20,60);}
    catch(error){if(error.code==='RATE_LIMITED')throw unavailable();throw error;}
    let quote;
    try{
      const [market,oracle]=await Promise.all([snapshot(mint,decimals,tokenProgram),solPrice(fetcher,now())]);
      const time=now(),asOf=Math.min(market.asOf,oracle.asOf);
      if(market.mint!==mint||market.decimals!==decimals||!Number.isSafeInteger(asOf)||asOf<=time-MAX_AGE)throw unavailable();
      quote={mint,decimals,source:market.source,market:market.market,slot:market.slot,asOf,
        observedAt:time,freshUntil:asOf+MAX_AGE,...referencePrice(market,oracle)};
      quoteUnits(quote,decimals);
    }catch{throw unavailable();}

    // A fresh on-chain snapshot is required for every new quote, so cached
    // observations cannot accidentally bridge the curve-to-pool transition.
    return store.change(['market:pump:'+mint],([prior])=>{
      if(prior&&(quote.slot<prior.slot||quote.observedAt<prior.observedAt||
        prior.source==='pumpswap'&&quote.source!=='pumpswap'))throw unavailable();
      const anchor=prior?.anchor;
      const retained=anchor&&quote.observedAt-anchor.observedAt<REFERENCE_MS;
      if(retained&&differs(quote,anchor))throw unavailable();
      const {observedAt,numerator,denominator}=quote;
      return {writes:[{...quote,anchor:retained?anchor:{observedAt,numerator,denominator}}],result:quote};
    });
  };
}

function quoteUnits(price,decimals) {
  if(!Number.isSafeInteger(decimals)||decimals<0||decimals>9)throw unavailable();
  const rational=price?.numerator!==undefined;
  if(rational?price.decimals!==decimals||!/^\d{1,50}$/.test(price.numerator)||!/^\d{1,50}$/.test(price.denominator):
    !/^\d{1,26}$/.test(price?.usdScaled||''))throw unavailable();
  const divisor=BigInt(rational?price.numerator:price.usdScaled);
  const multiplier=rational?BigInt(price.denominator):10n**BigInt(decimals);
  if(divisor<=0n||multiplier<=0n)throw unavailable();
  const units=ceil(USD_PRICE*multiplier,divisor);
  if(units>U64_MAX)throw unavailable();
  return String(units);
}

module.exports={marketPrice,quoteUnits,SOL_USD};
