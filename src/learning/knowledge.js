import {features, overlap, sentences, NATIVE_VERSION} from './text.js';

// Disposable, content-bound caches. Provider embeddings are deliberately never read.
const cache=new WeakMap();
export function memoryFeatures(memory) {
  const prior=cache.get(memory);
  if(prior?.content===memory.content)return prior.features;
  const result=features(memory.content||'');cache.set(memory,{content:memory.content,features:result});return result;
}
export function knowledgeIndex(memories=[]) {
  const active=memories.filter(memory=>!memory.supersededBy&&typeof memory.content==='string');
  const frequencies=new Map(),associations=new Map(),exposures=new Map();
  for(const memory of active){
    const f=memoryFeatures(memory);
    for(const term of f.terms){
      frequencies.set(term,(frequencies.get(term)||0)+1);
      exposures.set(term,(exposures.get(term)||0)+Math.max(1,Number.isFinite(memory.activations)?memory.activations:1));
    }
    // Edges mean observed co-occurrence, never a factual implication.
    for(const sentence of sentences(memory.content)){
      const terms=features(sentence).terms.slice(0,12);
      for(let i=0;i<terms.length;i++)for(let j=i+1;j<terms.length;j++){
        const pair=JSON.stringify([terms[i],terms[j]].sort());associations.set(pair,(associations.get(pair)||0)+1);
      }
    }
  }
  return {version:NATIVE_VERSION,active,frequencies,associations,exposures};
}
export function retrieveMemories(text,memories,{limit=5,index=knowledgeIndex(memories),priority=()=>0}={}) {
  const query=features(text);
  const weight=term=>1+Math.log(1+index.active.length/(1+(index.frequencies.get(term)||0)));
  const total=query.terms.reduce((sum,term)=>sum+weight(term),0)||1;
  return index.active.map(memory=>{
    const f=memoryFeatures(memory),terms=new Set(f.terms);
    const shared=query.terms.filter(term=>terms.has(term));
    const coverage=shared.reduce((sum,term)=>sum+weight(term),0)/total;
    const score=.55*coverage+.3*overlap(query.terms,f.terms)+.15*overlap(query.grams,f.grams);
    return {memory,score,sharedTerms:shared};
  }).filter(item=>item.sharedTerms.length>=2&&item.score>=.2)
    .sort((a,b)=>b.score-a.score||priority(b.memory)-priority(a.memory)||String(a.memory.id).localeCompare(String(b.memory.id))).slice(0,limit);
}
export function developmentStatistics(memories) {
  const index=knowledgeIndex(memories);
  return {version:NATIVE_VERSION,claims:index.active.length,concepts:index.frequencies.size,associations:index.associations.size,
    familiarTerms:[...index.frequencies].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,20).map(([term,claims])=>({term,claims,exposures:index.exposures.get(term)}))};
}

export function memorySimilarity(left,right) {
  const a=memoryFeatures(left),b=memoryFeatures(right);
  return .7*overlap(a.terms,b.terms)+.3*overlap(a.grams,b.grams);
}
