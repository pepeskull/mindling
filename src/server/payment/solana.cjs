'use strict';
const {generateKeyPairSync, randomBytes} = require('node:crypto');
const {failure} = require('./store.cjs');
const {sha256} = require('./identity.cjs');
const {pumpSnapshot,decodeMint,decodeHolding,TOKEN_2022}=require('./pump-market.cjs');

function randomDeposit() {
  const {privateKey}=generateKeyPairSync('ed25519');
  const {d,x}=privateKey.export({format:'jwk'});
  const rawPublic=Buffer.from(x,'base64url');
  const {getBase58Decoder}=require('@solana/kit');
  return {address:getBase58Decoder().decode(rawPublic),secret:Buffer.concat([Buffer.from(d,'base64url'),rawPublic])};
}

function solanaAdapter({apiKey,mintAddress,walletSecret,rpc:mockedRPC}) {
  if (!apiKey || !mintAddress || !walletSecret) throw failure('PAYMENT_UNAVAILABLE',503);
  const kit=require('@solana/kit'), spl=require('@solana-program/token');
  const {getSetComputeUnitLimitInstruction}=require('@solana-program/compute-budget');
  const b58=kit.getBase58Decoder(), b58Bytes=kit.getBase58Encoder();
  let mint,walletBytes;
  try {mint=kit.address(mintAddress);}
  catch {throw failure('PAYMENT_MINT_INVALID',503);}
  try {walletBytes=walletSecret.startsWith('[')?JSON.parse(walletSecret):b58Bytes.encode(walletSecret);}
  catch {throw failure('PAYMENT_TREASURY_INVALID',503);}
  if(walletBytes?.length!==64||Array.from(walletBytes).some(byte=>!Number.isInteger(byte)||byte<0||byte>255)){
    throw failure('PAYMENT_TREASURY_INVALID',503);
  }
  const treasuryBytes=Uint8Array.from(walletBytes);
  const treasuryAddress=kit.address(b58.decode(treasuryBytes.subarray(32)));
  // Create lazily so an invalid configured key never creates a rejected
  // promise outside the request handler's error boundary.
  let signer;
  const treasury=()=>signer??=kit.createKeyPairSignerFromBytes(treasuryBytes);
  let requestId=0;
  const rpc=mockedRPC|| (async(method,...params)=>{
    const response=await fetch('https://mainnet.helius-rpc.com/?api-key='+encodeURIComponent(apiKey),{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:String(++requestId),method,params}),
      signal:AbortSignal.timeout(6500)
    });
    if(response.status===401||response.status===403)throw failure('PAYMENT_RPC_REJECTED',503);
    if(!response.ok)throw failure('CHAIN_UNAVAILABLE',503);
    const data=await response.json();
    if(data.error||!Object.hasOwn(data,'result'))throw failure('CHAIN_UNAVAILABLE',503);
    return data.result;
  });
  async function ata(owner,tokenProgram) {
    const [key]=await spl.findAssociatedTokenPda({owner,mint,tokenProgram});
    return key;
  }
  const account=async address=>(await rpc('getAccountInfo',address,{commitment:'finalized',encoding:'base64'}))?.value;
  async function mintInfo() {
    const {decimals,tokenProgram}=decodeMint(await account(mint),()=>failure('UNSUPPORTED_MINT',503));
    return {mint,decimals,tokenProgram};
  }
  async function tokenAccount(address,tokenProgram,code) {
    return decodeHolding(await account(address),tokenProgram,()=>failure(code));
  }
  const snapshot=pumpSnapshot(rpc);
  async function marketSnapshot(requestedMint,decimals,tokenProgram) {
    if(requestedMint!==mint)throw failure('MARKET_PRICE_UNAVAILABLE',503);
    return snapshot(mint,decimals,tokenProgram);
  }
  async function sponsorEstimate(){
    try{await treasury();}
    catch{throw failure('PAYMENT_TREASURY_INVALID',503);}
    // Bound the normal 2-signature fee and maximum permitted ATA allocation;
    // checkout still verifies and reserves the concrete transaction cost.
    const [rent,balance]=await Promise.all([
      rpc('getMinimumBalanceForRentExemption',170,{commitment:'finalized'}),
      rpc('getBalance',treasuryAddress,{commitment:'finalized'})
    ]);
    return {fee:15000,rent,treasuryLamports:balance?.value};
  }
  async function depositTarget(address,tokenProgram=spl.TOKEN_PROGRAM_ADDRESS) {
    return {address,ata:await ata(address,tokenProgram),reference:b58.decode(randomBytes(32))};
  }
  async function newDeposit(tokenProgram=spl.TOKEN_PROGRAM_ADDRESS) {
    const {address,secret}=randomDeposit();
    return {...await depositTarget(address,tokenProgram),secret};
  }
  async function build(instructions,payer,tokenProgram) {
    const {value:lifetime}=await rpc('getLatestBlockhash',{commitment:'confirmed'});
    if(!Number.isSafeInteger(lifetime.lastValidBlockHeight))throw failure('CHAIN_UNAVAILABLE',503);
    const draft=kit.createTransactionMessage({version:'legacy'});
    const withPayer=kit.setTransactionMessageFeePayerSigner(payer,draft);
    const message=kit.setTransactionMessageLifetimeUsingBlockhash({
      blockhash:kit.blockhash(lifetime.blockhash),lastValidBlockHeight:BigInt(lifetime.lastValidBlockHeight)
    },withPayer);
    const units=getSetComputeUnitLimitInstruction({units:80000});
    const complete=kit.appendTransactionMessageInstructions([units,...instructions],message);
    const raw=await kit.partiallySignTransactionMessageWithSigners(complete);
    const [feeQuote,rent,balance]=await Promise.all([
      rpc('getFeeForMessage',Buffer.from(raw.messageBytes).toString('base64'),{commitment:'confirmed'}),
      rpc('getMinimumBalanceForRentExemption',tokenProgram===TOKEN_2022?170:165,{commitment:'finalized'}),
      rpc('getBalance',payer.address,{commitment:'finalized'})
    ]);
    const fee=feeQuote?.value;
    const treasuryLamports=balance?.value;
    if(!Number.isSafeInteger(fee)||fee>15000)throw failure('SPONSOR_FEE_LIMIT');
    return {transaction:kit.getBase64EncodedWireTransaction(raw),signature:b58.decode(raw.signatures[payer.address]),
      messageHash:sha256(raw.messageBytes),lastValidBlockHeight:lifetime.lastValidBlockHeight,fee,rent,treasuryLamports};
  }
  async function checkout(session,account) {
    const payer=await treasury();
    let sender;
    try {sender=kit.address(account);}catch {throw failure('INVALID_WALLET',400);}
    if(sender===treasuryAddress||sender===session.address||kit.isOffCurveAddress(sender))throw failure('INVALID_WALLET',400);
    const tokenProgram=session.tokenProgram??spl.TOKEN_PROGRAM_ADDRESS;
    const [source,destination]=await Promise.all([ata(sender,tokenProgram),ata(session.address,tokenProgram)]);
    if(destination!==session.ata||session.mint!==mint)throw failure('PAYMENT_SESSION_INVALID');
    const balance=await tokenAccount(source,tokenProgram,'INSUFFICIENT_MIND');
    if(balance.owner!==sender||balance.mint!==mint||balance.state!==spl.AccountState.Initialized||
       balance.amount<BigInt(session.units))throw failure('INSUFFICIENT_MIND');
    const transfer=spl.getTransferCheckedInstruction({source,mint,destination,authority:kit.createNoopSigner(sender),
      amount:BigInt(session.units),decimals:session.decimals},{programAddress:tokenProgram});
    const referenced={...transfer,accounts:[...transfer.accounts,{address:kit.address(session.reference),role:kit.AccountRole.READONLY}]};
    return build([spl.getCreateAssociatedTokenIdempotentInstruction({payer,ata:destination,owner:session.address,mint,tokenProgram}),referenced],payer,tokenProgram);
  }
  async function confirmed(signed) {
    const tx=await rpc('getTransaction',signed.signature,{commitment:'finalized',encoding:'base64',maxSupportedTransactionVersion:0});
    if(!tx)return null;
    if(tx.transaction?.[1]!=='base64'||tx.transaction[0].length>2048)throw failure('PAYMENT_TRANSACTION_REJECTED');
    const raw=kit.getTransactionDecoder().decode(Buffer.from(tx.transaction[0],'base64'));
    if(sha256(raw.messageBytes)!==signed.messageHash||
       !raw.signatures[treasuryAddress]||b58.decode(raw.signatures[treasuryAddress])!==signed.signature){
      throw failure('PAYMENT_TRANSACTION_REJECTED');
    }
    const message=kit.getCompiledTransactionMessageDecoder().decode(raw.messageBytes);
    if(message.version!=='legacy'||message.staticAccounts[0]!==treasuryAddress)throw failure('PAYMENT_TRANSACTION_REJECTED');
    return {tx,message};
  }
  async function check(session) {
    const result=await confirmed(session.signed);
    if(!result)return null;
    const {tx,message}=result;
    const tokenProgram=session.tokenProgram??spl.TOKEN_PROGRAM_ADDRESS;
    if(!tx.meta||tx.meta.err)throw failure('PAYMENT_TRANSACTION_REJECTED');
    const index=message.staticAccounts.indexOf(session.ata);
    const field=rows=>rows?.find(row=>row.accountIndex===index&&row.mint===session.mint&&row.owner===session.address&&
      row.programId===tokenProgram&&row.uiTokenAmount?.decimals===session.decimals);
    const after=field(tx.meta.postTokenBalances),before=field(tx.meta.preTokenBalances);
    if(index<0||!after||!Array.isArray(tx.meta.preTokenBalances)||
       (tx.meta.preTokenBalances.some(row=>row.accountIndex===index)&&!before)||
       BigInt(after.uiTokenAmount.amount)-BigInt(before?.uiTokenAmount?.amount??0)!==BigInt(session.units)){
      throw failure('PAYMENT_AMOUNT_MISMATCH');
    }
    if(!Number.isSafeInteger(tx.blockTime)||tx.blockTime*1000<session.createdAt-5000||tx.blockTime*1000>session.expiresAt){
      throw failure('PAYMENT_TIMING_REVIEW');
    }
    return {signature:session.signed.signature,slot:tx.slot,finalizedAt:tx.blockTime*1000};
  }
  async function sweep(session,secret) {
    const [payer,deposit]=await Promise.all([treasury(),kit.createKeyPairSignerFromBytes(secret)]);
    const tokenProgram=session.tokenProgram??spl.TOKEN_PROGRAM_ADDRESS;
    const [source,destination]=await Promise.all([ata(deposit.address,tokenProgram),ata(payer.address,tokenProgram)]);
    if(deposit.address!==session.address||source!==session.ata||session.mint!==mint)throw failure('DEPOSIT_KEY_MISMATCH');
    const account=await tokenAccount(source,tokenProgram,'SWEEP_REVIEW');
    if(account.amount<BigInt(session.units)||account.owner!==deposit.address||account.mint!==mint||
       account.state!==spl.AccountState.Initialized)throw failure('SWEEP_REVIEW');
    const instructions=[
      spl.getCreateAssociatedTokenIdempotentInstruction({payer,ata:destination,owner:payer.address,mint,tokenProgram}),
      spl.getTransferCheckedInstruction({source,mint,destination,authority:deposit,amount:BigInt(session.units),decimals:session.decimals},{programAddress:tokenProgram})
    ];
    // Additional off-quote funds are left for review.
    if(account.amount===BigInt(session.units))instructions.push(
      spl.getCloseAccountInstruction({account:source,destination:payer.address,owner:deposit},{programAddress:tokenProgram})
    );
    return build(instructions,payer,tokenProgram);
  }
  async function sweepStatus(signed) {
    const result=await confirmed(signed);
    if(result)return !result.tx.meta?'UNKNOWN':result.tx.meta.err?'FAILED':'FINALIZED';
    if(await rpc('getBlockHeight',{commitment:'finalized'})<=signed.lastValidBlockHeight)return 'PENDING';
    const status=(await rpc('getSignatureStatuses',[signed.signature],{searchTransactionHistory:true})).value[0];
    // Absence after expiry does not establish that a transfer never landed.
    return status?'PENDING':'UNKNOWN';
  }
  return {cluster:'mainnet',mintAddress:mint,mintInfo,marketSnapshot,sponsorEstimate,depositTarget,newDeposit,checkout,check,sweep,sweepStatus,
    async canSubmit(signed) {
      const height=await rpc('getBlockHeight',{commitment:'confirmed'});
      if(!Number.isSafeInteger(height))throw failure('CHAIN_UNAVAILABLE',503);
      return height<=signed.lastValidBlockHeight;
    },
    submit:signed=>rpc('sendTransaction',signed.transaction,{encoding:'base64',maxRetries:0,preflightCommitment:'finalized'})};
}

module.exports={solanaAdapter,randomDeposit};
