'use strict';

const {failure}=require('./store.cjs');
const kit=require('@solana/kit');
const spl=require('@solana-program/token');

// Pump's public IDLs define these Mainnet programs, PDAs and account layouts.
const PUMP=kit.address('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const SWAP=kit.address('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const FEE=kit.address('pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ');
const SOL=kit.address('So11111111111111111111111111111111111111112');
const TOKEN_2022=kit.address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const TOKEN=spl.TOKEN_PROGRAM_ADDRESS;
const zero=kit.address('11111111111111111111111111111111');
const encode=kit.getAddressEncoder(),decode=kit.getAddressDecoder();
const CURVE=[23,183,248,55,96,216,172,96],POOL=[241,154,109,4,17,177,109,188];
const CONFIG=[143,52,146,187,219,123,76,155], GLOBAL=[149,8,156,202,160,252,176,217];

const unavailable=()=>failure('MARKET_PRICE_UNAVAILABLE',503);
const u64=(bytes,offset)=>bytes.readBigUInt64LE(offset);
const pubkey=(bytes,offset)=>decode.decode(bytes.subarray(offset,offset+32));
const pda=async (programAddress,tag,...values)=>(await kit.getProgramDerivedAddress({
  programAddress,seeds:[tag,...values]
}))[0];
const ata=async (owner,mint,tokenProgram)=>(await spl.findAssociatedTokenPda({owner,mint,tokenProgram}))[0];

function data(account,program,min,discriminator,code=unavailable) {
  if(account?.owner!==program||account.executable||account.data?.[1]!=='base64'||
     typeof account.data[0]!=='string'||account.data[0].length>32768)throw code();
  const bytes=Buffer.from(account.data[0],'base64');
  if(bytes.length<min||discriminator&&!bytes.subarray(0,8).equals(Buffer.from(discriminator)))throw code();
  return bytes;
}

function plainExtensions(bytes,coreSize,accountType,permitted,code) {
  if(bytes.length===coreSize)return;
  if(bytes.length<166||bytes[165]!==accountType||bytes.subarray(coreSize,165).some(byte=>byte!==0))throw code();
  const seen=new Set();
  for(let offset=166;offset<bytes.length;){
    if(bytes.subarray(offset).every(byte=>byte===0))break;
    if(bytes.length-offset<4)throw code();
    const type=bytes.readUInt16LE(offset),length=bytes.readUInt16LE(offset+2);
    offset+=4;
    if(!permitted.has(type)||seen.has(type)||offset+length>bytes.length||
      (permitted.get(type)!==null&&permitted.get(type)!==length))throw code();
    seen.add(type);
    offset+=length;
  }
}

function decodeMint(account,code=unavailable) {
  const tokenProgram=account?.owner;
  if(tokenProgram!==TOKEN&&tokenProgram!==TOKEN_2022)throw code();
  const bytes=data(account,tokenProgram,82,null,code);
  if(tokenProgram===TOKEN_2022)plainExtensions(bytes,82,1,new Map([[18,64],[19,null]]),code);
  else if(bytes.length!==82)throw code();
  const mint=spl.getMintDecoder().decode(bytes.subarray(0,82));
  if(mint.decimals>9||!mint.isInitialized||kit.isSome(mint.freezeAuthority)||kit.isSome(mint.mintAuthority)||!mint.supply)throw code();
  return {...mint,tokenProgram};
}

function decodeHolding(account,tokenProgram,code=unavailable) {
  const bytes=data(account,tokenProgram,165,null,code);
  if(tokenProgram===TOKEN_2022)plainExtensions(bytes,165,2,new Map([[7,0]]),code);
  else if(bytes.length!==165)throw code();
  return spl.getTokenDecoder().decode(bytes.subarray(0,165));
}

async function addresses(mint,tokenProgram){
  const encodedMint=encode.encode(mint);
  const [curve,authority,curveFee,swapFee,swapGlobal]=await Promise.all([
    pda(PUMP,'bonding-curve',encodedMint),pda(PUMP,'pool-authority',encodedMint),
    pda(FEE,'fee_config',encode.encode(PUMP)),pda(FEE,'fee_config',encode.encode(SWAP)),pda(SWAP,'global_config')
  ]);
  const pool=await pda(SWAP,'pool',new Uint8Array(2),encode.encode(authority),encodedMint,encode.encode(SOL));
  const [curveVault,baseVault,quoteVault]=await Promise.all([
    ata(curve,mint,tokenProgram),ata(pool,mint,tokenProgram),ata(pool,SOL,TOKEN)
  ]);
  return {curve,authority,pool,curveVault,baseVault,quoteVault,curveFee,swapFee,swapGlobal};
}

function feeCeiling(account) {
  const bytes=data(account,FEE,69,CONFIG);
  const sum=offset=>u64(bytes,offset)+u64(bytes,offset+8)+u64(bytes,offset+16);
  let ceiling=sum(41);
  const count=bytes.readUInt32LE(65);
  if(!count||count>64||bytes.length<69+count*40)throw unavailable();
  for(let i=0;i<count;i++){
    const total=sum(69+i*40+16);
    if(total>ceiling)ceiling=total;
  }
  if(ceiling>300n)throw unavailable();
  return ceiling;
}

function holding(account,program,mint,owner,requireNative=false){
  const value=decodeHolding(account,program);
  if(value.mint!==mint||value.owner!==owner||value.state!==spl.AccountState.Initialized||
     requireNative!==kit.isSome(value.isNative))throw unavailable();
  return value.amount;
}

function pumpSnapshot(rpc,now=Date.now){
  return async (mint,expectedDecimals,tokenProgram)=>{
    if(mint===SOL||mint===zero||![TOKEN,TOKEN_2022].includes(tokenProgram))throw unavailable();
    const keys=await addresses(mint,tokenProgram);
    const list=[mint,keys.curve,keys.pool,keys.curveVault,keys.baseVault,keys.quoteVault,keys.curveFee,keys.swapFee,keys.swapGlobal];
    const result=await rpc('getMultipleAccounts',list,{commitment:'finalized',encoding:'base64'});
    const slot=result?.context?.slot;
    if(!Number.isSafeInteger(slot)||result.value?.length!==list.length)throw unavailable();
    const blockTime=await rpc('getBlockTime',slot),asOf=blockTime*1000;
    if(!Number.isSafeInteger(blockTime)||asOf>now()+5000||asOf<now()-90000)throw unavailable();
    const [mintAccount,curveAccount,poolAccount,curveVault,baseVault,quoteVault,curveFee,swapFee,swapGlobal]=result.value;
    const mintInfo=decodeMint(mintAccount);
    if(mintInfo.decimals!==expectedDecimals||mintInfo.tokenProgram!==tokenProgram)throw unavailable();
    const curve=data(curveAccount,PUMP,81,CURVE);
    if(curve[48]>1||curve[81]||curve[82]||
       (curve.length>83&&(curve.length<115||pubkey(curve,83)!==zero)))throw unavailable();
    const asserter={mint,decimals:expectedDecimals,slot,asOf};
    if(!curve[48]){
      if(poolAccount||u64(curve,40)!==mintInfo.supply)throw unavailable();
      const executableBase=u64(curve,24),executableQuote=u64(curve,32);
      if(holding(curveVault,tokenProgram,mint,keys.curve)<executableBase||
         !Number.isSafeInteger(curveAccount.lamports)||BigInt(curveAccount.lamports)<executableQuote)throw unavailable();
      return {...asserter,source:'pump.fun',market:keys.curve,base:u64(curve,8),quote:u64(curve,16),
        executableBase,executableQuote,feeBps:feeCeiling(curveFee)};
    }
    // During migration the completed curve cannot be traded and the pool
    // may not exist yet. No fallback to the old curve or another pool.
    const pool=data(poolAccount,SWAP,211,POOL);
    const global=data(swapGlobal,SWAP,57,GLOBAL);
    if(pool.readUInt16LE(9)!==0||pubkey(pool,11)!==keys.authority||pubkey(pool,43)!==mint||
       pubkey(pool,75)!==SOL||pubkey(pool,139)!==keys.baseVault||pubkey(pool,171)!==keys.quoteVault||
       !u64(pool,203)||pool[243]||pool[244]||global[56]||
       (pool.length>245&&pool.length<261))throw unavailable();
    const base=holding(baseVault,tokenProgram,mint,keys.pool),actualQuote=holding(quoteVault,TOKEN,SOL,keys.pool,true);
    let quote=actualQuote;
    if(pool.length>=261)quote+=BigInt.asIntN(128,u64(pool,245)+(u64(pool,253)<<64n));
    return {...asserter,source:'pumpswap',market:keys.pool,base,quote,executableBase:base,
      executableQuote:quote<actualQuote?quote:actualQuote,feeBps:feeCeiling(swapFee)};
  };
}

module.exports={pumpSnapshot,decodeMint,decodeHolding,addresses,PUMP,SWAP,FEE,SOL,TOKEN_2022};
