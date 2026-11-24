// Gameplay usage is independent of factual support, XP and graph geometry.
export const MEMORY_POLICY = Object.freeze({
  version: 1,
  initialStrength: .10,
  initialActivations: 1,
  recallIntervalMs:60000,
  weights: Object.freeze({TALK_RECALL:.01, TEACH_REINFORCEMENT:.03, DEEP_USE:.05,
    RESEARCH_USE:0, RESEARCH_CORROBORATION:.08, SEMANTIC_CONNECTION:.01})
});

export const newMemoryEvolution = at => ({
  strength:MEMORY_POLICY.initialStrength, activations:MEMORY_POLICY.initialActivations,
  lastActivatedAt:at, memoryPolicyVersion:MEMORY_POLICY.version
});
export const reinforcementEvent = activity => activity==='DEEP_TRAINING'?'DEEP_USE':activity==='TALK'?'TALK_RECALL':'TEACH_REINFORCEMENT';

const current = memory => memory && !memory.supersededBy && memory.intelligence?.current!==false &&
  ![memory.kind,memory.intelligence?.kind].includes('historical');

// Reducer-local event accumulator. Callers own durable replay receipts and
// apply this once, inside the transaction that commits their logical event.
export function applyMemoryEvolution(memories, events, at) {
  const strongest = new Map();
  for(const [id,event] of events){
    const weight=MEMORY_POLICY.weights[event];
    if(Number.isFinite(weight))strongest.set(id,Math.max(weight,strongest.get(id)??0));
  }
  const reinforced=[];
  for(const memory of memories){
    if(!current(memory)||!strongest.has(memory.id))continue;
    const weight=strongest.get(memory.id);
    const strength=Number.isFinite(memory.strength)?Math.min(1,Math.max(0,memory.strength)):0;
    const next=Math.min(1,strength+weight*(1-strength));
    if(weight>0&&next>strength){
      memory.strength=next;memory.lastReinforcedAt=at;reinforced.push(memory.id);
    }
    const activations=Number.isSafeInteger(memory.activations)&&memory.activations>=0?memory.activations:0;
    memory.activations=Math.min(Number.MAX_SAFE_INTEGER,activations+1);
    memory.lastActivatedAt=at;memory.memoryPolicyVersion=MEMORY_POLICY.version;
  }
  return reinforced;
}

// Ignore legacy edges validated during hydration. Only call from the logical
// write that just introduced a link, using its actual before/after records.
export function connectionEvolution(before,after) {
  const existing=new Map(before.filter(Boolean).map(memory=>[memory.id,new Set(memory.relatedMemoryIds||[])]));
  const records=new Map(after.filter(Boolean).map(memory=>[memory.id,memory]));
  const rewards=new Set();
  for(const memory of after){
    if(!current(memory))continue;
    for(const {memoryId:id} of [...(memory.semanticAssociations||[]),...(memory.modelAssociations||[])]){
      const target=records.get(id);
      if(id===memory.id||!target||!current(target)||!memory.relatedMemoryIds?.includes(id)||
        existing.get(memory.id)?.has(id)||existing.get(id)?.has(memory.id))continue;
      if(existing.has(memory.id))rewards.add(memory.id);
      if(existing.has(id))rewards.add(id);
    }
  }
  return [...rewards].map(id=>[id,'SEMANTIC_CONNECTION']);
}

export function displayMemoryStrength(strength) {
  if(!Number.isFinite(strength)||strength<0||strength>1)return 'Not recorded';
  return `${strength===1?100:Math.min(99.9,Math.round(strength*1000)/10)}%`;
}
