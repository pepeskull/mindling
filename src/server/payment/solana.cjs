'use strict';
const {generateKeyPairSync, randomBytes} = require('node:crypto');
const {failure} = require('./store.cjs');
const {sha256} = require('./identity.cjs');

function solanaAdapter({apiKey,mintAddress,walletSecret,rpc:mockedRPC}) {
  if (!apiKey || !mintAddress || !walletSecret) throw failure('PAYMENT_UNAVAILABLE',503);
  const kit=require('@solana/kit'), spl=require('@solana-program/token');
  const {getSetComputeUnitLimitInstruction}=require('@solana-program/compute-budget');
  const b58=kit.getBase58Decoder(), b58Bytes=kit.getBase58Encoder();
  const mint=kit.address(mintAddress);
  const walletBytes=walletSecret.startsWith('[')?JSON.parse(walletSecret):b58Bytes.encode(walletSecret);
  if(walletBytes?.length!==64||Array.from(walletBytes).some(byte=>!Number.isInteger(byte)||byte<0||byte>255)){
    throw failure('PAYMENT_UNAVAILABLE',503);
  }
  const treasuryBytes=Uint8Array.from(walletBytes);
  const treasuryAddress=kit.address(b58.decode(treasuryBytes.subarray(32)));
  // Create lazily so an invalid configured key never creates a rejected
  // promise outside the request handler's error boundary.
  let signer;
  const treasury=()=>signer??=kit.createKeyPairSignerFromBytes(treasuryBytes);
  const tokenProgram=spl.TOKEN_PROGRAM_ADDRESS;
  let requestId=0;
  const rpc=mockedRPC|| (async(method,...params)=>{
    const response=await fetch('https://devnet.helius-rpc.com/?api-key='+encodeURIComponent(apiKey),{
      method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:String(++requestId),method,params}),
      signal:AbortSignal.timeout(6500)
    });
    if(!response.ok)throw failure('CHAIN_UNAVAILABLE',503);
    const data=await response.json();
    if(data.error||!Object.hasOwn(data,'result'))throw failure('CHAIN_UNAVAILABLE',503);
    return data.result;
  });
  async function ata(owner) {
    const [key]=await spl.findAssociatedTokenPda({owner,mint,tokenProgram});
    return key;
  }
  async function tokenAccount(address,decoder,code) {
    const response=await rpc('getAccountInfo',address,{commitment:'finalized',encoding:'base64'});
    const account=response?.value;
    if(!account||account.owner!==tokenProgram||account.data?.[1]!=='base64')throw failure(code);
    const bytes=Buffer.from(account.data[0],'base64');
    if(bytes.length!==decoder.fixedSize)throw failure(code);
    return decoder.decode(bytes);
  }
  async function mintInfo() {
    // V1 supports the original SPL Token Program only.
    const data=await tokenAccount(mint,spl.getMintDecoder(),'UNSUPPORTED_MINT');
    if(data.decimals>9||!data.isInitialized||kit.isSome(data.freezeAuthority))throw failure('UNSUPPORTED_MINT',503);
    return {mint,decimals:data.decimals};
  }
  async function newDeposit() {
    const {privateKey}=generateKeyPairSync('ed25519');
    const {d,x}=privateKey.export({format:'jwk'});
    const rawPublic=Buffer.from(x,'base64url');
    const address=kit.address(b58.decode(rawPublic));
    return {address,ata:await ata(address),secret:Buffer.concat([Buffer.from(d,'base64url'),rawPublic]),
      reference:b58.decode(randomBytes(32))};
  }
  async function build(instructions,payer) {
    const {value:lifetime}=await rpc('getLatestBlockhash',{commitment:'finalized'});
    if(!Number.isSafeInteger(lifetime.lastValidBlockHeight))throw failure('CHAIN_UNAVAILABLE',503);
    const draft=kit.createTransactionMessage({version:'legacy'});
    const withPayer=kit.setTransactionMessageFeePayerSigner(payer,draft);
    const message=kit.setTransactionMessageLifetimeUsingBlockhash({
      blockhash:kit.blockhash(lifetime.blockhash),lastValidBlockHeight:BigInt(lifetime.lastValidBlockHeight)
    },withPayer);
    const units=getSetComputeUnitLimitInstruction({units:80000});
    const complete=kit.appendTransactionMessageInstructions([units,...instructions],message);
    const raw=await kit.partiallySignTransactionMessageWithSigners(complete);
    const fee=(await rpc('getFeeForMessage',Buffer.from(raw.messageBytes).toString('base64'),{commitment:'finalized'})).value;
    if(!Number.isSafeInteger(fee)||fee>15000)throw failure('SPONSOR_FEE_LIMIT');
    return {transaction:kit.getBase64EncodedWireTransaction(raw),signature:b58.decode(raw.signatures[payer.address]),
      messageHash:sha256(raw.messageBytes),lastValidBlockHeight:lifetime.lastValidBlockHeight,fee};
  }
  async function checkout(session,account) {
    const payer=await treasury();
    let sender;
    try {sender=kit.address(account);}catch {throw failure('INVALID_WALLET',400);}
    if(sender===treasuryAddress||sender===session.address||kit.isOffCurveAddress(sender))throw failure('INVALID_WALLET',400);
    const [source,destination]=await Promise.all([ata(sender),ata(session.address)]);
    if(destination!==session.ata||session.mint!==mint)throw failure('PAYMENT_SESSION_INVALID');
    const balance=await tokenAccount(source,spl.getTokenDecoder(),'INSUFFICIENT_MIND');
    if(balance.owner!==sender||balance.mint!==mint||balance.state!==spl.AccountState.Initialized||
       balance.amount<BigInt(session.units))throw failure('INSUFFICIENT_MIND');
    const transfer=spl.getTransferCheckedInstruction({source,mint,destination,authority:kit.createNoopSigner(sender),
      amount:BigInt(session.units),decimals:session.decimals});
    const referenced={...transfer,accounts:[...transfer.accounts,{address:kit.address(session.reference),role:kit.AccountRole.READONLY}]};
    return build([spl.getCreateAssociatedTokenIdempotentInstruction({payer,ata:destination,owner:session.address,mint}),referenced],payer);
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
    const [source,destination]=await Promise.all([ata(deposit.address),ata(payer.address)]);
    if(deposit.address!==session.address||source!==session.ata||session.mint!==mint)throw failure('DEPOSIT_KEY_MISMATCH');
    const account=await tokenAccount(source,spl.getTokenDecoder(),'SWEEP_REVIEW');
    if(account.amount<BigInt(session.units)||account.owner!==deposit.address||account.mint!==mint||
       account.state!==spl.AccountState.Initialized)throw failure('SWEEP_REVIEW');
    const instructions=[
      spl.getCreateAssociatedTokenIdempotentInstruction({payer,ata:destination,owner:payer.address,mint}),
      spl.getTransferCheckedInstruction({source,mint,destination,authority:deposit,amount:BigInt(session.units),decimals:session.decimals})
    ];
    // Additional off-quote funds are left for review.
    if(account.amount===BigInt(session.units))instructions.push(
      spl.getCloseAccountInstruction({account:source,destination:payer.address,owner:deposit})
    );
    return build(instructions,payer);
  }
  async function sweepStatus(signed) {
    const result=await confirmed(signed);
    if(result)return !result.tx.meta?'UNKNOWN':result.tx.meta.err?'FAILED':'FINALIZED';
    if(await rpc('getBlockHeight',{commitment:'finalized'})<=signed.lastValidBlockHeight)return 'PENDING';
    const status=(await rpc('getSignatureStatuses',[signed.signature],{searchTransactionHistory:true})).value[0];
    // Absence after expiry does not establish that a transfer never landed.
    return status?'PENDING':'UNKNOWN';
  }
  return {cluster:'devnet',mintInfo,newDeposit,checkout,check,sweep,sweepStatus,
    submit:signed=>rpc('sendTransaction',signed.transaction,{encoding:'base64',maxRetries:0,preflightCommitment:'finalized'})};
}

module.exports={solanaAdapter};
