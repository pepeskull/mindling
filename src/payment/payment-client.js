import {restoreEnergy} from '../economy/energy.js';

const ENDPOINT='/api/mindling/energy';
const PROTOCOL='mindling-energy-mainnet-v1'; // Existing payment identity signatures.
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const WALLET=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SESSION=/^[a-f0-9]{48}$/;
const SIGNATURE=/^[1-9A-HJ-NP-Za-km-z]{86,88}$/;
const messages={
  PAYMENT_STORAGE_UNCONFIGURED:'Payment storage is not configured.',
  ENCRYPTION_UNAVAILABLE:'Deposit wallet encryption is unavailable.',
  LEGACY_RECEIPT_REVIEW:'This older payment needs review because the saved Energy history is unavailable.',
  PAYMENT_RECOVERY_UNAVAILABLE:'Automatic payment recovery is offline. Checkout will be available when it returns.',
  PAYMENT_RPC_REJECTED:'Helius refused the Mainnet RPC credentials.',
  PAYMENT_TREASURY_INVALID:'The configured treasury signing key could not be verified.',
  PAYMENT_RPC_UNCONFIGURED:'Mainnet checkout is missing its Helius configuration.',
  PAYMENT_MINT_CHANGED:'The configured mint changed after this quote. Existing transfers can still be checked.',
  PAYMENT_MINT_INVALID:'The configured MIND mint address is invalid.',
  PAYMENT_MINT_UNCONFIGURED:'The Mainnet MIND mint has not been configured.',
  PAYMENT_TREASURY_UNCONFIGURED:'The payment treasury has not been configured.',
  PAYMENT_CONFIGURATION_INVALID:'Mainnet checkout configuration needs review.',
  UNSUPPORTED_MINT:'The configured MIND mint could not be validated on Mainnet.',
  CHAIN_UNAVAILABLE:'Solana Mainnet could not be reached. Try again later.',
  DEPOSIT_KEY_UNAVAILABLE:'The deposit wallet requires recovery before it can accept payments.',
  PAYMENT_ENERGY_AVAILABLE:'Top-up opens when your spendable Energy reaches zero.',
  PAYMENT_NOT_FOUND:'No existing payment session was found.',
  INVALID_PAYMENT_RECEIPT:'Payment confirmation could not be validated.',
  MARKET_PRICE_UNAVAILABLE:'A reliable MIND price is unavailable. No payment quote was created.',
  PAYMENTS_PAUSED:'Mainnet checkout is temporarily paused.',
  PAYMENT_BLOCKHASH_EXPIRED:'This wallet transaction expired. Check any previous payment before creating a new session.',
  PAYMENT_LEDGER_REVIEW:'This payment needs ledger review. Keep its session address for support.',
  SPONSOR_BUDGET_UNAVAILABLE:'Sponsored fees are temporarily unavailable. No payment transaction was issued.',
  IDENTITY_UNAVAILABLE:'Your Mindling’s original identity key is needed to sync Energy.',
  PAYMENT_HTTPS_REQUIRED:'Open the wallet from the secure Play Mindling site.',
  LEDGER_UNAVAILABLE:'Energy authorization is temporarily unavailable.',
  PAYMENT_PENDING:'Waiting for the transaction to finalize.',
  PAYMENT_AWAITING_WALLET:'Scan the QR code in your wallet and approve the payment first.',
  PAYMENT_TIMING_REVIEW:'This payment needs review because the transaction time did not match the quote.',
  PAYMENT_SESSION_ACTIVE:'Resume the open payment session or wait for its quote to expire.',
  PAYMENT_RATE_LIMIT:'The payment session limit was reached. Try again later.',
};

export function paymentFailureMessage(code){
  return Object.hasOwn(messages,code)?messages[code]:'Payment is temporarily unavailable.';
}
function failure(code){return Object.assign(Error(paymentFailureMessage(code)),{code});}

export function pendingPayments(mind){
  return [...new Set([mind.paymentPending,...(mind.paymentPendingSessions||[])].filter(id=>SESSION.test(id||'')))];
}
function setPending(mind,ids){
  mind.paymentPending=ids[0]??null;
  mind.paymentPendingSessions=ids.slice(1);
}

function validReceipt(receipt,owner,id){
  return receipt?.version===2&&SESSION.test(id||'')&&receipt.id===id&&receipt.owner===owner&&
    SIGNATURE.test(receipt.paymentSignature||'')&&WALLET.test(receipt.mint||'')&&
    /^[1-9]\d{0,19}$/.test(receipt.units||'')&&Number.isSafeInteger(receipt.slot)&&receipt.slot>=0&&
    Number.isSafeInteger(receipt.finalizedAt)&&receipt.finalizedAt>0&&
    Number.isSafeInteger(receipt.creditedAt)&&receipt.creditedAt>0&&
    (receipt.legacyEnergyRevision===undefined||Number.isSafeInteger(receipt.legacyEnergyRevision)&&receipt.legacyEnergyRevision>0);
}

// Used as a reducer inside the IndexedDB read/write transaction. The receipt
// markers are kept with gameplay so another tab cannot reapply the same credit.
export function applyPaymentReceipt(state,mindlingId,receipt,owner,id,now=Date.now()){
  const mind=state.mind;
  if(mind?.id!==mindlingId)throw failure('IDENTITY_CHANGED');
  if(!validReceipt(receipt,owner,id))throw failure('INVALID_PAYMENT_RECEIPT');
  const saved=mind.appliedPaymentReceipts??{};
  if(!saved[id]){
    if(receipt.legacyEnergyRevision!==undefined&&!Number.isSafeInteger(mind.legacyPaymentEnergyRevision))
      throw failure('LEGACY_RECEIPT_REVIEW');
    const previouslyCredited=receipt.legacyEnergyRevision!==undefined&&
      receipt.legacyEnergyRevision<=mind.legacyPaymentEnergyRevision;
    if(!previouslyCredited)mind.energy=restoreEnergy(mind.energy,mind.stage,Math.max(state.now,now));
    mind.appliedPaymentReceipts={...saved,[id]:receipt.paymentSignature};
  }else if(saved[id]!==receipt.paymentSignature)throw failure('INVALID_PAYMENT_RECEIPT');
  setPending(mind,pendingPayments(mind).filter(item=>item!==id));
  return state;
}

async function read(response){
  let data;
  try {data=await response.json();}
  catch {throw failure('PAYMENT_UNAVAILABLE');}
  if(!response.ok||data?.error)throw failure(data?.error?.code);
  return data;
}

export class PaymentClient {
  constructor(app,{fetcher=(...args)=>fetch(...args)}={}){
    this.app=app;
    this.fetcher=fetcher;
  }

  async identity(mind){
    const existing=await this.app.db.get('identity','mindling:'+mind.id)||
      await this.app.db.get('identity','local-identity');
    if(existing?.mindlingId!==mind.id||!existing.privateKey||!existing.publicKey)throw failure('IDENTITY_UNAVAILABLE');
    const {crv,kty,x,y}=existing.publicKey;
    return {...existing,fingerprint:await digest(JSON.stringify({crv,kty,x,y}))};
  }

  active(mind){
    return !this.app.disposed&&!this.app.external?.locked&&this.app.state?.mind?.id===mind.id;
  }

  async request(body,mind=this.app.state?.mind){
    if(!mind||!this.active(mind))throw failure('IDENTITY_CHANGED');
    const identity=await this.identity(mind);
    const {fingerprint}=identity;
    let ticket=this.session;
    if(ticket?.fingerprint!==fingerprint||ticket.expiresAt<Date.now()+5000){
      const ticketRequest=this.pending?.fingerprint===fingerprint?this.pending.promise:
        this.fetcher(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},
          signal:AbortSignal.timeout(5000),body:JSON.stringify({action:'challenge',publicKey:identity.publicKey})}).then(read);
      this.pending={fingerprint,promise:ticketRequest};
      try {ticket=await ticketRequest;}
      finally{if(this.pending?.promise===ticketRequest)this.pending=null;}
      if(!SESSION.test(ticket?.nonce||'')||ticket.fingerprint!==fingerprint||!Number.isSafeInteger(ticket.expiresAt))
        throw failure('INVALID_IDENTITY');
      this.session=ticket;
    }
    const key=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const payload=JSON.stringify(body);
    const nonce=hex(crypto.getRandomValues(new Uint8Array(24)));
    const proof=JSON.stringify([PROTOCOL,fingerprint,nonce,ENDPOINT,await digest(payload),null,ticket.nonce]);
    const signature=hex(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(proof)));
    if(!this.active(mind))throw failure('IDENTITY_CHANGED');
    const headers={'Content-Type':'application/json','X-Mindling-Owner':fingerprint,
      'X-Mindling-Nonce':nonce,'X-Mindling-Session':ticket.nonce,'X-Mindling-Signature':signature};
    if(ticket.ticket)headers['X-Mindling-Ticket']=ticket.ticket;
    let data;
    try {
      data=await read(await this.fetcher(ENDPOINT,{method:'POST',headers,body:payload,signal:AbortSignal.timeout(45000)}));
    }catch(error){
      if(error.code==='CHALLENGE_EXPIRED'&&this.session===ticket)this.session=null;
      throw error;
    }
    if(!this.active(mind))throw failure('IDENTITY_CHANGED');
    if(body.action==='payment-check'){
      await this.app.change(state=>applyPaymentReceipt(state,mind.id,data.receipt,fingerprint,body.id),{preserveGameplay:true});
    }
    return data;
  }

  async initializeWallet(){
    const mind=this.app.state?.mind;
    if(!mind||!this.active(mind)||this.initializing===mind.id||
       mind.paymentWalletVersion===1&&WALLET.test(mind.paymentWalletAddress||''))return;
    this.initializing=mind.id;
    try{
      const {wallet}=await this.request({action:'payment-wallet'},mind);
      if(!WALLET.test(wallet?.address||'')||wallet.pending&&!SESSION.test(wallet.pending))return;
      await this.app.change(state=>{
        if(state.mind?.id!==mind.id)throw failure('IDENTITY_CHANGED');
        const ids=pendingPayments(state.mind);
        if(wallet.pending&&!state.mind.appliedPaymentReceipts?.[wallet.pending]&&!ids.includes(wallet.pending))ids.push(wallet.pending);
        setPending(state.mind,ids);
        state.mind.paymentWalletAddress=wallet.address;
        state.mind.paymentWalletVersion=1;
        return state;
      },{preserveGameplay:true});
    }catch{
      // Checkout errors do not block startup, AI, regeneration or local state.
    }finally{if(this.initializing===mind.id)this.initializing=null;}
  }
}
