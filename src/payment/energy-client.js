export const ENERGY_PROTOCOL='mindling-energy-mainnet-v1';
const ENDPOINT='/api/mindling/energy';
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const base64url=value=>btoa(String.fromCharCode(...encoder.encode(JSON.stringify(value))))
  .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const messages={
  INVALID_PAYMENT_RECEIPT:'Payment confirmation could not be validated.',
  MARKET_PRICE_UNAVAILABLE:'A reliable MIND price is unavailable. No payment quote was created.',
  PAYMENTS_PAUSED:'Mainnet checkout is temporarily paused.',
  PAYMENT_BLOCKHASH_EXPIRED:'This wallet transaction expired. Check any previous payment before creating a new session.',
  PAYMENT_LEDGER_REVIEW:'This payment needs ledger review. Keep its session address for support.',
  SPONSOR_BUDGET_UNAVAILABLE:'Sponsored fees are temporarily unavailable. No payment transaction was issued.',
  ENERGY_SERVICE_UNAVAILABLE:'Energy authorization is temporarily unavailable.',
  ACTIVITY_PREREQUISITE_REQUIRED:'This activity requires an earlier verified result.',
  ENERGY_LOW:'Not enough Energy. Wait for regeneration or top up.',
  IDENTITY_UNAVAILABLE:'Your Mindling’s original identity key is needed to sync Energy.',
  LEGACY_STAGE_REVIEW:'Your saved stage needs review before Energy can be connected.',
  QUALIFICATION_REVIEW:'Energy for this result needs review. The reserved Energy is held.',
  PAYMENT_HTTPS_REQUIRED:'Open the wallet from the secure Play Mindling site.',
  LEDGER_UNAVAILABLE:'Energy authorization is temporarily unavailable.',
  PAYMENT_PENDING:'Waiting for the transaction to finalize.',
  PAYMENT_AWAITING_WALLET:'Scan the QR code in your wallet and approve the payment first.',
  PAYMENT_TIMING_REVIEW:'This payment needs review because the transaction time did not match the quote.',
  PAYMENT_SESSION_ACTIVE:'Resume the open payment session or wait for its quote to expire.',
  PAYMENT_RATE_LIMIT:'The payment session limit was reached. Try again later.',
  OUTCOME_UNKNOWN:'The previous operation is still unresolved. Its Energy remains reserved.'
};
const validEnergy=energy=>energy?.version===2&&Number.isInteger(energy.stage)&&
  [10,12,15,18,22,26,32][energy.stage-1]===energy.capacity&&
  ['remaining','bonus','updatedAt','revision','reserved','serverTime'].every(key=>Number.isSafeInteger(energy[key])&&energy[key]>=0)&&
  energy.bonus<=energy.remaining&&energy.remaining-energy.bonus<=energy.capacity&&energy.reserved<=energy.remaining;
function error(code){
  return Object.assign(Error(messages[code]||'Energy could not be synchronized. Try again when the service is available.'),{code});
}
async function read(response){
  let data;
  try {data=await response.json();}
  catch {throw error('ENERGY_UNAVAILABLE');}
  if(!response.ok||data.error)throw error(data.error?.code);
  return data;
}

export function cacheEnergy(mind,energy){
  if(!validEnergy(energy))throw error('INVALID_ENERGY');
  const stored=mind.energyAuthority;
  const previous=stored?.protocol===ENERGY_PROTOCOL?stored:null;
  if(previous&&(energy.revision<previous.revision||energy.revision===previous.revision&&energy.serverTime<previous.serverTime))return;
  const {revision,serverTime,reserved,stage,...balance}=energy;
  const legacyBalance=stored?.legacyBalance??mind.energy;
  mind.energy=balance;
  mind.energyAuthority={...previous,legacyBalance,protocol:ENERGY_PROTOCOL,revision,serverTime,reserved,stage};
}

export function researchOperationKind(task){
  return task.autonomous?'autonomous':task.mode==='DEEP'?'deep-research':
    task.mode==='TALK_RESEARCH'?'talk-research':'foundation';
}

export class EnergyClient {
  constructor(app,{fetcher=(...args)=>fetch(...args)}={}){
    this.app=app;
    this.fetcher=fetcher;
  }
  async enabled(){
    if(this.app.state?.mind?.energyAuthority?.protocol===ENERGY_PROTOCOL)return true;
    if(this.active!==undefined)return this.active;
    if(Date.now()<(this.unavailableUntil||0))throw error('ENERGY_SERVICE_UNAVAILABLE');
    this.detecting??=this.fetcher(ENDPOINT,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:'{"action":"availability"}',
      signal:AbortSignal.timeout(4000)
    }).then(read).then(data=>this.active=data.active===true).catch(()=>{
      this.unavailableUntil=Date.now()+60000;
      throw error('ENERGY_SERVICE_UNAVAILABLE');
    })
      .finally(()=>{this.detecting=null;});
    return this.detecting;
  }
  async identity(mind){
    const existing=await this.app.db.get('identity','mindling:'+mind.id)||
      await this.app.db.get('identity','local-identity');
    if(existing?.mindlingId!==mind.id||!existing.privateKey||!existing.publicKey)throw error('IDENTITY_UNAVAILABLE');
    return existing;
  }
  async signed(route,options,mind,operation=null){
    options.signal?.throwIfAborted();
    const identity=await this.identity(mind);
    const body=JSON.parse(options.body);
    if(Date.now()<(this.unavailableUntil||0))throw error('ENERGY_SERVICE_UNAVAILABLE');
    const {crv,kty,x,y}=identity.publicKey;
    const fingerprint=await digest(JSON.stringify({crv,kty,x,y}));
    const key=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    let challenge=this.session;
    if(challenge?.fingerprint!==fingerprint||challenge.expiresAt<=Date.now()+5000){
      const issue=()=>this.fetcher(ENDPOINT,{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),
        body:JSON.stringify({action:'challenge',publicKey:identity.publicKey})
      }).then(read);
      const pending=this.authPending;
      try {
        if(pending?.fingerprint===fingerprint){
          challenge=await pending.promise;
          // Older deployments only issue one-use challenges.
          if(!challenge.expiresAt)challenge=await issue();
        }else{
          const promise=issue().finally(()=>{if(this.authPending?.promise===promise)this.authPending=null;});
          this.authPending={fingerprint,promise};
          challenge=await promise;
        }
      }catch(failure){
        if(!failure.code||failure.code.includes('UNAVAILABLE'))this.unavailableUntil=Date.now()+60000;
        throw failure;
      }
    }
    if(!/^[a-f0-9]{48}$/.test(challenge.nonce)||challenge.fingerprint!==fingerprint)throw error('INVALID_IDENTITY');
    const session=Number.isSafeInteger(challenge.expiresAt)&&challenge.expiresAt>Date.now()?challenge.nonce:null;
    if(session)this.session=challenge;
    const nonce=session?hex(crypto.getRandomValues(new Uint8Array(24))):challenge.nonce;
    const message=JSON.stringify([ENERGY_PROTOCOL,fingerprint,nonce,route,
      await digest(JSON.stringify(body)),operation,...(session?[session]:[])]);
    const signature=hex(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(message)));
    if(this.app.disposed||this.app.state?.mind?.id!==mind.id)throw error('IDENTITY_CHANGED');
    options.signal?.throwIfAborted();
    const headers=new Headers(options.headers);
    headers.set('X-Mindling-Owner',challenge.fingerprint);
    headers.set('X-Mindling-Nonce',nonce);
    if(session)headers.set('X-Mindling-Session',session);
    headers.set('X-Mindling-Signature',signature);
    if(operation)headers.set('X-Mindling-Operation',base64url(operation));
    const response=await this.fetcher(route,{...options,headers});
    if(response.status===401||response.status===503){
      const data=await response.clone().json().catch(()=>null);
      if(data?.error?.code==='CHALLENGE_EXPIRED')this.session=null;
      if(['LEDGER_UNAVAILABLE','ENERGY_SERVICE_UNAVAILABLE'].includes(data?.error?.code))this.unavailableUntil=Date.now()+60000;
    }
    return response;
  }
  async request(body,mind=this.app.state?.mind){
    if(!mind)throw error('IDENTITY_UNAVAILABLE');
    const response=await this.signed(ENDPOINT,{
      method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(24000)
    },mind);
    const data=await read(response);
    if(body.action==='payment-check'&&(data.receipt?.id!==body.id||
      !Number.isSafeInteger(data.receipt.energyRevision)||data.energy?.revision<data.receipt.energyRevision||!validEnergy(data.energy)))throw error('INVALID_PAYMENT_RECEIPT');
    if(data.energy)await this.apply(mind.id,data.energy);
    return data;
  }
  async apply(identity,energy){
    if(this.app.disposed||this.app.state?.mind?.id!==identity)throw error('IDENTITY_CHANGED');
    await this.app.change(state=>{
      if(state.mind?.id!==identity)throw error('IDENTITY_CHANGED');
      cacheEnergy(state.mind,energy);
      return state;
    },{preserveGameplay:true});
  }
  async sync(){
    const mind=this.app.state?.mind;
    if(!mind)return false;
    if(this.syncing?.id===mind.id)return this.syncing.promise;
    const promise=(async()=>{
      if(!await this.enabled())return false;
      const registered=mind.energyAuthority?.protocol===ENERGY_PROTOCOL;
      if(!registered){
        const legacy={stage:mind.stage,createdAt:mind.createdAt,stages:(mind.stageHistory||[]).map(
          ({stage,enteredAt,leftAt,xp,concepts})=>({stage,enteredAt,leftAt,xp,concepts})
        )};
        await this.request({action:'register',legacy},mind);
      }
      const permissions=await this.app.db.researchPermissions(mind.id);
      if(this.app.state?.mind?.id!==mind.id)throw error('IDENTITY_CHANGED');
      const authority=this.app.state.mind.energyAuthority;
      if(permissions.decided&&permissions.revision>(authority?.permissionRevision||0)){
        await this.mirrorPermission(mind,permissions.enabled,permissions.automaticRequestLimit,permissions.revision);
      }
      for(const pending of authority?.pending||[])await this.finish(pending,mind.id).catch(()=>{});
      return true;
    })().finally(()=>{if(this.syncing?.promise===promise)this.syncing=null;});
    this.syncing={id:mind.id,promise};
    return promise;
  }
  operation(kind,id){return digest(JSON.stringify([kind,id]));}
  transport(kind,id,parent){
    return async (url,options)=>{
      if(!await this.enabled())return this.fetcher(url,options);
      if(this.app.state?.mind?.energyAuthority?.protocol!==ENERGY_PROTOCOL)await this.sync();
      const mind=this.app.state.mind;
      const operation={kind,id:await this.operation(kind,id)};
      if(parent)operation.prerequisite=await this.operation(parent.kind,parent.id);
      const response=await this.signed(url,options,mind,operation);
      const data=await response.clone().json().catch(()=>null);
      if(data?.energy)await this.apply(mind.id,data.energy).catch(()=>{});
      return response;
    };
  }
  async localTalk(id,text){
    if(!await this.enabled())return;
    if(this.app.state?.mind?.energyAuthority?.protocol!==ENERGY_PROTOCOL)await this.sync();
    await this.request({action:'local-talk',id:await this.operation('talk',id),text});
  }
  async mirrorPermission(mind,enabled,automaticRequestLimit,permissionRevision){
    const result=await this.request({action:'research-permission',enabled,automaticRequestLimit,permissionRevision},mind);
    if(!Number.isSafeInteger(result.revision)||result.revision<permissionRevision)throw error('INVALID_PERMISSION');
    await this.app.change(state=>{
      if(state.mind?.id!==mind.id)throw error('IDENTITY_CHANGED');
      const authority=state.mind.energyAuthority;
      authority.permissionRevision=Math.max(authority.permissionRevision||0,result.revision);
      return state;
    },{preserveGameplay:true});
  }
  async researchPermission(enabled,automaticRequestLimit,permissionRevision){
    if(!await this.enabled())return;
    if(this.app.state?.mind?.energyAuthority?.protocol!==ENERGY_PROTOCOL)await this.sync();
    const mind=this.app.state.mind;
    if((mind.energyAuthority?.permissionRevision||0)<permissionRevision)
      await this.mirrorPermission(mind,enabled,automaticRequestLimit,permissionRevision);
  }
  async release(kind,id){
    if(await this.enabled()&&this.app.state?.mind?.energyAuthority){
      await this.request({action:'release',id:await this.operation(kind,id)});
    }
  }
  async authorize(proposal){
    const {approval}=await this.request({...proposal,action:'authorize-commit'});
    if(!/^[a-f0-9]{64}$/.test(approval||''))throw error('QUALIFICATION_REVIEW');
    return approval;
  }
  async finish({id,approval},identity=this.app.state.mind.id){
    const mind=this.app.state?.mind;
    if(mind?.id!==identity)throw error('IDENTITY_CHANGED');
    const {receipt}=await this.request({action:'settle',id,approval},mind);
    if(receipt?.id!==id||!Number.isSafeInteger(receipt.charge)||!Number.isSafeInteger(receipt.balanceAfter)){
      throw error('QUALIFICATION_REVIEW');
    }
    await this.app.change(state=>{
      if(state.mind?.id!==identity)throw error('IDENTITY_CHANGED');
      const authority=state.mind.energyAuthority;
      authority.pending=(authority.pending||[]).filter(item=>item.id!==id);
      return state;
    },{preserveGameplay:true,authoritativeReceipt:receipt});
  }
}
