'use strict';

const {failure} = require('./store.cjs');
const {sha256} = require('./identity.cjs');
const ID = /^[a-f0-9]{64}$/;
const DAY = 86400000;

const COSTS = Object.freeze({
  talk:1, teach:2, deep:3, correction:2, foundation:2, 'deep-research':3,
  'talk-research':0, autonomous:0, 'research-semantic':0, 'memory-pair':0,
  'area-pair':0, 'automatic-area-pair':0, evaluation:0
});
const RESEARCH = new Set(['foundation','deep-research','talk-research','autonomous']);
const SEMANTIC = new Set(['research-semantic','memory-pair','area-pair','automatic-area-pair']);

function legacyStage(data, now, rules) {
  const stage = data?.stage;
  if(data==null||stage===1)return 1;
  if(!Number.isInteger(stage)||stage<1||stage>rules.length)throw failure('LEGACY_STAGE_REVIEW');
  const {createdAt, stages} = data;
  if (!Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt > now ||
      !Array.isArray(stages) || stages.length !== stage - 1) {
    throw failure('LEGACY_STAGE_REVIEW');
  }
  let previous = createdAt;
  for (const [index, row] of stages.entries()) {
    const {days,xp,concepts} = rules[index];
    if (row?.stage !== index + 1 || !Number.isSafeInteger(row.enteredAt) || row.enteredAt < previous ||
      !Number.isSafeInteger(row.leftAt) || row.leftAt > now || row.leftAt - row.enteredAt < days * DAY ||
      !Number.isSafeInteger(row.xp) || row.xp < xp || !Number.isSafeInteger(row.concepts) || row.concepts < concepts) {
      throw failure('LEGACY_STAGE_REVIEW');
    }
    previous = row.leftAt;
  }
  return stage;
}

const ownerKey = id => 'owner:' + id;
const energyKey = id => 'energy:' + id;
const operationKey = (id, operationId) => 'operation:' + id + ':' + operationId;
function operationId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw failure('INVALID_OPERATION',400);
  return id;
}

async function energyLedger(store, now = Date.now) {
  const [{energyAt,spendEnergy},{EVOLUTION_REQUIREMENTS:rules,ENERGY_CAPACITIES}] = await Promise.all([
    import('../../economy/energy.js'), import('../../economy/energy-policy.js')
  ]);
  function state(entry, time = now()) {
    if (!entry) throw failure('ENERGY_REGISTRATION_REQUIRED',401);
    const projected = energyAt(entry.balance, time);
    return {...projected, stage:entry.stage, revision:entry.revision, reserved:entry.reserved, serverTime:time};
  }
  function initialize(identity, legacy) {
    const {fingerprint,displayId,publicKey} = identity;
    return store.change([ownerKey(fingerprint),energyKey(fingerprint),'legacy-review:'+fingerprint], ([owner,entry,review]) => {
      if (entry) return {result:state(entry)};
      const time = now();
      const stage = legacyStage(legacy,time,rules);
      const capacity = ENERGY_CAPACITIES[stage - 1];
      if(stage>1&&(!review||review.consumedAt||review.stage!==stage||review.historyHash!==sha256(JSON.stringify(legacy))||
         !Number.isSafeInteger(review.enteredAt)||review.enteredAt<0||review.enteredAt>time||
         !Number.isSafeInteger(review.stageXP)||review.stageXP<0||review.stageXP>rules[stage-1].xp||
         !Array.isArray(review.milestones)||review.milestones.length>30||
         new Set(review.milestones).size!==review.milestones.length||review.milestones.some(item=>!ID.test(item)))){
        throw failure('LEGACY_STAGE_REVIEW');
      }
      // Historic client balances and clocks never authorize server credit.
      const reviewed=stage>1?review:null;
      const record = {
        balance:{version:2, remaining:10, bonus:0, capacity, updatedAt:time},
        stage, revision:1, reserved:0, enteredAt:reviewed?.enteredAt??time, stageXP:reviewed?.stageXP??0,
        milestones:reviewed?.milestones??[], day:null, dailyXP:0, research:false, ready:true,
        migration:reviewed?'REVIEWED_LEGACY':'NEW_CAPACITY', limits:{}
      };
      return {writes:[owner || {displayId,publicKey,createdAt:time},record,reviewed?{...reviewed,consumedAt:time}:review],
        result:state(record,time)};
    });
  }
  function get(identity) {
    return store.change([energyKey(identity)],([entry])=>{
      const time=now();
      state(entry,time);
      if(!advanceStage(entry,time))return {result:state(entry,time)};
      entry.revision++;
      return {writes:[entry],result:state(entry,time)};
    });
  }
  function setResearch(identity, enabled, automaticRequestLimit=12, permissionRevision) {
    if (typeof enabled !== 'boolean'||!Number.isSafeInteger(automaticRequestLimit)||automaticRequestLimit<4||automaticRequestLimit>40) throw failure('INVALID_PERMISSION',400);
    if(permissionRevision!==undefined&&(!Number.isSafeInteger(permissionRevision)||permissionRevision<1)){
      throw failure('INVALID_PERMISSION',400);
    }
    return store.change([energyKey(identity)], ([entry]) => {
      state(entry);
      const previous=entry.permissionRevision||0;
      const revision=permissionRevision??previous+1;
      if(revision<previous)return {result:{enabled:entry.research,revision:previous}};
      if(revision===previous&&(entry.research!==enabled||entry.automaticLimit!==Math.floor(automaticRequestLimit/4))){
        throw failure('PERMISSION_CONFLICT');
      }
      entry.permissionRevision=revision;
      entry.research = enabled;
      entry.automaticLimit = Math.floor(automaticRequestLimit/4);
      return {writes:[entry],result:{enabled,revision}};
    });
  }
  function takeLimit(counters, name, time, interval, limit) {
    const slot = Math.floor(time / interval);
    const current = counters[name];
    const count = current?.slot === slot ? current.count : 0;
    if (count >= limit) throw failure('RATE_LIMITED',429);
    counters[name] = {slot,count:count+1};
  }
  function refillReadiness(entry, time) {
    const available = state(entry,time).remaining - entry.reserved;
    return available > 2 || (available > 0 && entry.ready);
  }
  function admit(identity, request) {
    const id = operationId(request.id);
    const {kind,phase,requestId,bodyHash,tools = 0,checkpointSignature,prerequisite} = request;
    if (!Object.hasOwn(COSTS,kind) || typeof phase !== 'string' || phase.length>36 ||
      typeof requestId !== 'string' || !ID.test(bodyHash || '') || !Number.isInteger(tools) || tools<0 || tools>4) {
      throw failure('INVALID_OPERATION',400);
    }
    const key = operationKey(identity,id);
    const parentRequired=kind==='talk-research'||kind==='research-semantic';
    if(parentRequired&&(!ID.test(prerequisite||'')||prerequisite===id))throw failure('ACTIVITY_PREREQUISITE_REQUIRED',403);
    const keys=[energyKey(identity),key,'provider-emergency-total'];
    if(parentRequired)keys.push(operationKey(identity,prerequisite));
    return store.change(keys, ([entry,operation,total,parent]) => {
      const time = now();
      const projection = state(entry,time);
      const stored = operation?.phases[requestId];
      if (operation && operation.kind !== kind) throw failure('OPERATION_CONFLICT');
      if (stored) {
        if (stored.bodyHash !== bodyHash || stored.phase !== phase) throw failure('OPERATION_CONFLICT');
        if (stored.result) return {result:{cached:stored.result,energy:projection}};
        throw failure('OUTCOME_UNKNOWN');
      }
      if(operation&&(operation.state!=='RESERVED'||operation.prepared))throw failure('OPERATION_CLOSED');
      if(parentRequired){
        if(!parent?.settlement||(kind==='talk-research'?(parent.kind!=='talk'||parent.settlement.charge!==1):
          (!RESEARCH.has(parent.kind)||parent.settlement.formed!==true)))throw failure('ACTIVITY_PREREQUISITE_REQUIRED',403);
        if(parent.continuation&&parent.continuation!==id)throw failure('ACTIVITY_ALREADY_CONTINUED',409);
        parent.continuation=id;
      }
      if ((RESEARCH.has(kind) || SEMANTIC.has(kind)) && !entry.research) throw failure('RESEARCH_PERMISSION_REQUIRED',403);
      if ((RESEARCH.has(kind) || kind==='research-semantic' || kind==='automatic-area-pair') &&
          !refillReadiness(entry,time) && !(operation?.cost && projection.remaining >= operation.cost)) {
        throw failure('ENERGY_LOW',402);
      }
      if (!operation) {
        const cost = COSTS[kind];
        if (projection.remaining-entry.reserved < cost) throw failure('ENERGY_LOW',402);
        if (kind==='autonomous') {
          if ((entry.nextAutomaticAt||0)>time) throw failure('RESEARCH_COOLDOWN',429);
          takeLimit(entry.limits,'autonomous',time,DAY,entry.automaticLimit??3);
          entry.nextAutomaticAt = time + 600000;
        }
        if (kind==='memory-pair' || kind.endsWith('area-pair')) {
          const category=kind==='memory-pair'?'memoryPairs':'areaPairs', max=kind==='memory-pair'?256:32;
          if((entry[category]||0)>=max)throw failure('RECEIPT_LIMIT',429);
          entry[category]=(entry[category]||0)+1;
        }
        if (kind==='automatic-area-pair') {
          if ((entry.nextAreaAt||0)>time) throw failure('RESEARCH_COOLDOWN',429);
          entry.nextAreaAt=time+600000;
        }
        if (RESEARCH.has(kind)&&entry.day===Math.floor(time/DAY)&&entry.dailyXP>=100) throw failure('DAILY_XP_LIMIT_REACHED',429);
        entry.reserved+=cost;
        operation={kind,cost,state:'RESERVED',phases:{},calls:0,tools:0,startedAt:time};
      }
      if (Object.values(operation.phases).some(item=>item.state==='DISPATCHED')) throw failure('OUTCOME_UNKNOWN');
      const limit = RESEARCH.has(kind) || kind==='research-semantic' ? 4 : kind.endsWith('area-pair') ? 16 : kind==='evaluation'?3:1;
      const units = phase==='research-acquire'?2:phase==='evaluation'?3:1;
      if(operation.calls+units>limit||operation.tools+tools>4)throw failure('BUDGET_EXHAUSTED',429);
      if (RESEARCH.has(kind)) {
        const count = name => Object.values(operation.phases).filter(step=>step.phase===name).length;
        if (phase!=='research' && !count('research')) throw failure('RESEARCH_PLAN_REQUIRED');
        if (phase==='research' && count('research')>=2 || count('research-evaluate')+count('research-acquire')>=2 && phase!=='research') {
          throw failure('BUDGET_EXHAUSTED',429);
        }
        if (phase==='research-acquire' && count('research-acquire')) throw failure('RESEARCH_ALREADY_DISPATCHED');
        if (phase==='research-evaluate'&&(!operation.checkpointSignature||operation.checkpointSignature!==checkpointSignature)) {
          throw failure('CHECKPOINT_OPERATION_MISMATCH',400);
        }
      }
      total ??= {};
      if(phase!=='local-talk') {
        takeLimit(entry.limits,'provider-minute',time,60000,20);
        for(let i=0;i<units+tools;i++){
          takeLimit(total,'provider-minute',time,60000,120);
          takeLimit(total,'provider-day',time,DAY,6000);
        }
      }
      operation.calls+=units;
      operation.tools+=tools;
      operation.phases[requestId]={bodyHash,phase,state:'DISPATCHED'};
      entry.balance=energyAt(entry.balance,time);
      entry.ready=refillReadiness(entry,time);
      entry.revision++;
      return {writes:[entry,operation,total,...(parentRequired?[parent]:[])],result:{energy:state(entry,time)}};
    });
  }

  function record(identity,id,requestId,result,{unknown=false,qualification=null,terminal=false,checkpointSignature}={}) {
    const key = operationKey(identity,operationId(id));
    return store.change([energyKey(identity),key],([entry,operation])=>{
      const step=operation?.phases[requestId];
      if(!step||step.state!=='DISPATCHED')throw failure('OPERATION_CONFLICT');
      step.state=unknown?'OUTCOME_UNKNOWN':'RECEIVED';
      step.result=result;
      if(checkpointSignature)operation.checkpointSignature=checkpointSignature;
      if(qualification?.claims){
        const prior=operation.qualification?.claims||[];
        const fresh=qualification.claims.filter(claim=>!prior.some(item=>item.hash===claim.hash));
        operation.qualification={...qualification,claims:[...prior,...fresh].slice(0,3)};
      }else if(qualification)operation.qualification=qualification;
      if(unknown)operation.state='OUTCOME_UNKNOWN';
      else if(terminal) {
        operation.state='CLOSED';
        entry.reserved-=operation.cost;
        entry.revision++;
        operation.settlement={id,charge:0,balanceAfter:state(entry).remaining,revision:entry.revision};
      }
      return {writes:[entry,operation],result:state(entry)};
    });
  }

  function applyProgress(entry, qualification, time) {
    if (!qualification) return;
    const day = Math.floor(time / DAY);
    if (day!==entry.day) {entry.day=day;entry.dailyXP=0;}
    const award=Math.min(qualification.xp??0,100-entry.dailyXP);
    entry.dailyXP+=award;
    entry.stageXP+=award;
    if (qualification.concept && entry.milestones.length<30 && !entry.milestones.includes(qualification.concept)) {
      entry.milestones.push(qualification.concept);
    }
    advanceStage(entry,time);
  }
  function advanceStage(entry,time) {
    const rule = rules[entry.stage-1];
    if(entry.stage<rules.length && time-entry.enteredAt>=rule.days*DAY &&
        entry.stageXP>=rule.xp&&entry.milestones.length>=rule.concepts) {
      entry.stage++;
      entry.enteredAt=time;
      entry.stageXP=0;
      entry.milestones=[];
      entry.balance={...energyAt(entry.balance,time),capacity:ENERGY_CAPACITIES[entry.stage-1]};
      return true;
    }
    return false;
  }
  function authorizeCommit(identity,id,{cost, memoryHashes, awardedXP}={}) {
    return store.change([energyKey(identity),operationKey(identity,operationId(id))],([entry,operation])=>{
      state(entry);
      if(!operation)throw failure('OPERATION_NOT_FOUND',404);
      if(!Number.isSafeInteger(cost)||cost<0||cost>3||!Number.isSafeInteger(awardedXP)||awardedXP<0||awardedXP>10||
         memoryHashes!==undefined&&(!Array.isArray(memoryHashes)||memoryHashes.length>3||
           new Set(memoryHashes).size!==memoryHashes.length||memoryHashes.some(hash=>!ID.test(hash||'')))) {
        throw failure('INVALID_OPERATION',400);
      }
      const hashes=[...(memoryHashes||[])].sort();
      const approval=sha256(JSON.stringify([identity,id,cost,hashes,awardedXP]));
      if(operation.prepared){
        if(operation.prepared.approval!==approval)throw failure('QUALIFICATION_REVIEW');
        return {result:{approval}};
      }
      if(operation.settlement){
        if(operation.settlement.charge!==0||cost!==0||awardedXP!==0)throw failure('QUALIFICATION_REVIEW');
        operation.prepared={approval};
        return {writes:[entry,operation],result:{approval}};
      }
      if(operation.state!=='RESERVED'||!operation.qualification||
         Object.values(operation.phases).some(step=>step.state==='DISPATCHED'))throw failure('OPERATION_NOT_SETTLEABLE');
      let qualification=operation.qualification;
      let accepted=[];
      if(qualification.claims){
        if(hashes.some(hash=>!qualification.claims.some(claim=>claim.hash===hash)))throw failure('QUALIFICATION_REVIEW');
        const prior=entry.researchReceipts||[];
        const unspent=qualification.claims.filter(claim=>claim.formed&&!prior.includes(claim.hash));
        accepted=unspent.filter(claim=>hashes.includes(claim.hash));
        const produced=accepted[0];
        if(unspent.length&&operation.cost&&!produced)throw failure('QUALIFICATION_REVIEW');
        if(accepted.some(claim=>entry.researchPending?.[claim.hash]&&entry.researchPending[claim.hash]!==id)){
          throw failure('QUALIFICATION_REVIEW');
        }
        entry.researchPending??={};
        for(const {hash} of accepted)entry.researchPending[hash]=id;
        qualification={spend:Boolean(produced),xp:produced?qualification.xp:0,
          concept:produced&&['foundation','deep-research'].includes(operation.kind)?produced.concept:null};
      }
      const charge=qualification.spend?operation.cost:0;
      if(charge!==cost||awardedXP>(qualification.xp||0))throw failure('QUALIFICATION_REVIEW');
      const subject=qualification.subject;
      const seen=subject&&(entry.progressSubjects||[]).includes(subject);
      const circulating=subject&&entry.pendingSubjects?.[subject];
      const xp=seen||circulating?0:awardedXP;
      if(subject&&xp){
        entry.pendingSubjects??={};
        entry.pendingSubjects[subject]=id;
      }
      operation.prepared={approval,charge,qualification:{...qualification,xp,concept:xp?qualification.concept:null},
        memoryHashes:accepted.map(claim=>claim.hash)};
      return {writes:[entry,operation],result:{approval}};
    });
  }
  function settle(identity,id,approval) {
    return store.change([energyKey(identity),operationKey(identity,operationId(id))],([entry,operation])=>{
      const time=now(), projection=state(entry,time);
      if(!operation)throw failure('OPERATION_NOT_FOUND',404);
      if(!ID.test(approval||'')||operation.prepared?.approval!==approval)throw failure('COMMIT_REQUIRED',400);
      if(operation.settlement)return {result:{energy:projection,receipt:operation.settlement}};
      if(operation.state!=='RESERVED')throw failure('OPERATION_NOT_SETTLEABLE');
      const {charge,qualification,memoryHashes}=operation.prepared;
      entry.balance=charge?spendEnergy(entry.balance,charge,time):energyAt(entry.balance,time);
      entry.reserved-=operation.cost;
      for(const hash of memoryHashes)delete entry.researchPending[hash];
      if(memoryHashes.length)entry.researchReceipts=[...(entry.researchReceipts||[]),...memoryHashes].slice(-1000);
      if(qualification.subject&&entry.pendingSubjects?.[qualification.subject]===id){
        delete entry.pendingSubjects[qualification.subject];
        entry.progressSubjects=[...(entry.progressSubjects||[]),qualification.subject].slice(-1000);
      }
      entry.ready=refillReadiness(entry,time);
      applyProgress(entry,qualification,time);
      entry.revision++;
      operation.state='CLOSED';
      operation.settlement={id,charge,formed:memoryHashes.length>0,balanceAfter:entry.balance.remaining,revision:entry.revision};
      operation.prepared={approval};
      delete operation.qualification;
      return {writes:[entry,operation],result:{energy:state(entry,time),receipt:operation.settlement}};
    });
  }
  function release(identity,id) {
    return store.change([energyKey(identity),operationKey(identity,operationId(id))],([entry,operation])=>{
      const projection=state(entry);
      if(!operation || operation.state==='CLOSED')return {result:projection};
      if(operation.state!=='RESERVED'||Object.values(operation.phases).some(step=>step.state==='DISPATCHED'))throw failure('OUTCOME_UNKNOWN');
      if(operation.prepared||operation.cost&&(operation.qualification?.spend||
         operation.qualification?.claims?.some(claim=>claim.formed&&!(entry.researchReceipts||[]).includes(claim.hash)))){
        throw failure('QUALIFICATION_REVIEW');
      }
      operation.state='CLOSED';
      entry.reserved-=operation.cost;
      entry.revision++;
      return {writes:[entry,operation],result:state(entry)};
    });
  }
  function makeFull(entry,time) {
    advanceStage(entry,time);
    const balance=energyAt(entry.balance,time);
    entry.balance={...balance,remaining:balance.capacity+balance.bonus,updatedAt:time};
    entry.ready=true;
    entry.revision++;
    return state(entry,time);
  }
  return {initialize,get,admit,record,authorizeCommit,settle,release,makeFull,makeView:state,setResearch,
    inspect:(identity,id)=>store.get(operationKey(identity,operationId(id)))};
}

module.exports = { energyLedger, energyKey, operationId, COSTS, RESEARCH, SEMANTIC, legacyStage };
