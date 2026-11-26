const ENDPOINT='/api/mindling/energy';
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const base64url=value=>btoa(String.fromCharCode(...encoder.encode(JSON.stringify(value))))
  .replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const messages={
  ENERGY_LOW:'Not enough Energy. Wait for regeneration or top up.',
  IDENTITY_UNAVAILABLE:'Your Mindling’s original identity key is needed to sync Energy.',
  LEGACY_STAGE_REVIEW:'Your saved stage needs review before Energy can be connected.',
  QUALIFICATION_REVIEW:'The result was saved. Its Energy reservation needs review.',
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
  const previous=mind.energyAuthority;
  if(previous&&(energy.revision<previous.revision||energy.revision===previous.revision&&energy.serverTime<previous.serverTime))return;
  const {revision,serverTime,reserved,stage,...balance}=energy;
  const legacyBalance=previous?.legacyBalance??mind.energy;
  mind.energy=balance;
  mind.energyAuthority={legacyBalance,...previous,revision,serverTime,reserved,stage};
}

export class EnergyClient {
  constructor(app,{fetcher=(...args)=>fetch(...args)}={}){
    this.app=app;
    this.fetcher=fetcher;
  }
  async enabled(){
    if(this.active!==undefined)return this.active;
    this.detecting??=this.fetcher(ENDPOINT,{
      method:'POST', headers:{'Content-Type':'application/json'}, body:'{"action":"availability"}',
      signal:AbortSignal.timeout(4000)
    }).then(read).then(data=>this.active=data.active===true).catch(()=>Boolean(this.app.state?.mind?.energyAuthority))
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
    const identity=await this.identity(mind);
    const body=JSON.parse(options.body);
    const challenge=await read(await this.fetcher(ENDPOINT,{
      method:'POST',headers:{'Content-Type':'application/json'},signal:options.signal,
      body:JSON.stringify({action:'challenge',publicKey:identity.publicKey})
    }));
    if(!/^[a-f0-9]{48}$/.test(challenge.nonce)||!/^[a-f0-9]{64}$/.test(challenge.fingerprint))throw error('INVALID_IDENTITY');
    const {crv,kty,x,y}=identity.publicKey;
    if(await digest(JSON.stringify({crv,kty,x,y}))!==challenge.fingerprint)throw error('INVALID_IDENTITY');
    const key=await crypto.subtle.importKey('jwk',identity.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    const message=JSON.stringify(['mindling-energy-devnet-v1',challenge.fingerprint,challenge.nonce,route,
      await digest(JSON.stringify(body)),operation]);
    const signature=hex(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(message)));
    if(this.app.disposed||this.app.state?.mind?.id!==mind.id)throw error('IDENTITY_CHANGED');
    const headers=new Headers(options.headers);
    headers.set('X-Mindling-Owner',challenge.fingerprint);
    headers.set('X-Mindling-Nonce',challenge.nonce);
    headers.set('X-Mindling-Signature',signature);
    if(operation)headers.set('X-Mindling-Operation',base64url(operation));
    return this.fetcher(route,{...options,headers});
  }
  async request(body,mind=this.app.state?.mind){
    if(!mind)throw error('IDENTITY_UNAVAILABLE');
    const response=await this.signed(ENDPOINT,{
      method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
      signal:AbortSignal.timeout(24000)
    },mind);
    const data=await read(response);
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
    if(!this.app.state?.mind||!await this.enabled())return false;
    if(this.syncing)return this.syncing;
    const mind=this.app.state.mind;
    const legacy={stage:mind.stage,createdAt:mind.createdAt,stages:(mind.stageHistory||[]).map(
      ({stage,enteredAt,leftAt,xp,concepts})=>({stage,enteredAt,leftAt,xp,concepts})
    )};
    this.syncing=(async()=>{
      await this.request(mind.energyAuthority?{action:'state'}:{action:'register',legacy},mind);
      const permissions=await this.app.db.researchPermissions(mind.id);
      if(permissions.decided)await this.request({
        action:'research-permission',enabled:permissions.enabled,automaticRequestLimit:permissions.automaticRequestLimit,
        permissionRevision:permissions.revision
      },mind);
      for(const pending of this.app.state.mind.energyAuthority?.pending||[]){
        await this.finish(pending,mind.id).catch(()=>{});
      }
      return true;
    })().finally(()=>{this.syncing=null;});
    return this.syncing;
  }
  operation(kind,id){return digest(JSON.stringify([kind,id]));}
  transport(kind,id){
    return async (url,options)=>{
      if(!await this.enabled())return this.fetcher(url,options);
      if(!this.app.state?.mind?.energyAuthority)await this.sync();
      const mind=this.app.state.mind;
      const response=await this.signed(url,options,mind,{kind,id:await this.operation(kind,id)});
      const data=await response.clone().json().catch(()=>null);
      if(data?.energy)await this.apply(mind.id,data.energy).catch(()=>{});
      return response;
    };
  }
  async localTalk(id,text){
    if(!await this.enabled())return;
    if(!this.app.state?.mind?.energyAuthority)await this.sync();
    await this.request({action:'local-talk',id:await this.operation('talk',id),text});
  }
  async researchPermission(enabled,automaticRequestLimit,permissionRevision){
    if(!await this.enabled())return;
    if(!this.app.state?.mind?.energyAuthority)await this.sync();
    await this.request({action:'research-permission',enabled,automaticRequestLimit,permissionRevision});
  }
  async release(kind,id){
    if(await this.enabled()&&this.app.state?.mind?.energyAuthority){
      await this.request({action:'release',id:await this.operation(kind,id)});
    }
  }
  async finish({id,cost,memoryHashes,awardedXP},identity=this.app.state.mind.id){
    await this.request({action:'settle',id,committed:true,cost,memoryHashes,awardedXP});
    await this.app.change(state=>{
      if(state.mind?.id!==identity)throw error('IDENTITY_CHANGED');
      const authority=state.mind.energyAuthority;
      authority.pending=(authority.pending||[]).filter(item=>item.id!==id);
      return state;
    },{preserveGameplay:true});
  }
}
