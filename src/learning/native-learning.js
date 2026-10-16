import {features,normalize,overlap,sentences,validateText,NATIVE_VERSION} from './text.js';
import {knowledgeIndex,retrieveMemories} from './knowledge.js';

function compare(left,right) {
  const a=features(left),b=features(right);
  if(normalize(left)===normalize(right))return 'repeated';
  const words=overlap(a.terms,b.terms),ordered=overlap(a.grams,b.grams);
  const changedQuantity=JSON.stringify(a.quantities)!==JSON.stringify(b.quantities);
  if((words>=.65||(a.anchors.length>=2&&b.anchors.length>=2&&overlap(a.anchors,b.anchors)>=.8))&&(changedQuantity||a.negative!==b.negative))return 'conflict';
  // Bag-of-words equality cannot prove equivalence: subject/object order matters.
  if(words>=.85&&ordered>=.65)return 'uncertain';
  if(words>=.95)return 'uncertain';
  const grams=value=>{const chars=[...normalize(value)];return chars.slice(2).map((_,i)=>chars.slice(i,i+3).join(''));};
  if(words>=.55&&overlap(grams(left),grams(right))>=.85)return 'uncertain';
  return words>=.25?'related':'distinct';
}
function categoryFor(text,mind,index,related) {
  const categories=[...(mind.categories||[])];
  // Older records may have categories without a top-level registry. Preserve IDs.
  for(const m of mind.memories)if(m.categoryId&&m.category&&!categories.some(c=>c.id===m.categoryId))categories.push({id:m.categoryId,name:m.category});
  const f=features(text),ranked=categories.map(category=>{
    const names=features(category.name).terms;
    const members=related.filter(item=>item.memory.categoryId===category.id);
    const nameMatch=names.length&&names.every(term=>f.terms.includes(term));
    return {category,score:nameMatch?1:Math.max(0,...members.map(item=>item.score)),members};
  }).sort((a,b)=>b.score-a.score||String(a.category.id).localeCompare(String(b.category.id)));
  const top=ranked[0];
  if(top&&top.score>=.55&&(!ranked[1]||top.score-ranked[1].score>=.12))return {id:top.category.id,name:top.category.name,confidence:top.score};
  // A label is a lexical excerpt, not a guessed discipline or verified taxonomy.
  const keywords=f.terms.filter(term=>/\p{L}/u.test(term)).sort((a,b)=>(index.frequencies.get(b)||0)-(index.frequencies.get(a)||0));
  const keyword=keywords.find(term=>term.length<=40);
  const name=keyword?`Notes: ${keyword}`:'Unclassified claims';
  const existing=categories.find(category=>normalize(category.name)===normalize(name));
  return {id:existing?.id||'',name:existing?.name||name,confidence:.35};
}
export function analyzeNative(text,mind) {
  if(typeof text!=='string'||text.length>2000||!normalize(text))throw Error('Share a short, readable claim. No Energy or XP changed.');
  // Full text and original saved variants are compared before new-claim heuristics,
  // so short legacy memories can still be reinforced without being rewritten.
  const exact=mind.memories.filter(memory=>[memory.content,...(memory.matchedVariants||[])].some(value=>typeof value==='string'&&normalize(value)===normalize(text)));
  if(exact.length)return {relationship:'repeated',relatedMemoryId:(exact.find(memory=>!memory.supersededBy)||exact[0]).id};
  // Older integrations retained a lossy normalized input beside generated prose.
  // It is evidence of a possible repeat, never authority to merge different facts.
  const legacyKey=text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(mind.memories.some(memory=>!memory.native&&[memory.normalized,memory.normalizedContent].includes(legacyKey)))throw Error('This may repeat a historical input. Existing memories are unchanged. No Energy or XP changed.');
  const input=validateText(text),index=knowledgeIndex(mind.memories),related=retrieveMemories(text,mind.memories,{index});
  for(const memory of index.active){
    for(const old of sentences(memory.content))for(const fresh of input.sentences){
      const relation=compare(fresh,old);
      if(relation==='conflict')throw Error('This may conflict with a stored claim. Neither claim is verified; existing memories are unchanged. No Energy or XP changed.');
      if(relation==='uncertain'||relation==='repeated')throw Error('This may repeat existing knowledge. Teach a clearly distinct claim separately. No Energy or XP changed.');
    }
  }
  const category=categoryFor(text,mind,index,related),keywords=input.features.terms.slice(0,12);
  const topic=keywords.slice(0,4).join(' ').slice(0,100)||'Unclassified claim';
  // An existing, observed association can support a lexical connection; not a fact.
  const observedConnections=keywords.flatMap((left,i)=>keywords.slice(i+1).map(right=>({terms:[left,right].sort()})))
    .filter(edge=>index.associations.has(JSON.stringify(edge.terms))).slice(0,12);
  return {memory:text.trim(),concept:topic,area:category.name,kind:related.length>=2&&observedConnections.length>=2?'understanding':'concept',category:category.name,categoryId:category.id,topic,
    relationship:related.length?'related':'new',relatedMemoryId:related[0]?.memory.id||'',
    relatedMemoryIds:related.map(item=>item.memory.id),
    native:{version:NATIVE_VERSION,verification:'unverified-player-claim',provenance:{source:'player',method:'local-lexical'},
      confidence:{classification:category.confidence,factual:null},uncertainty:category.confidence<.55?'category-uncertain':'unverified',
      sentences:input.sentences,keywords,observedConnections,topicFamiliarity:keywords.reduce((sum,word)=>sum+(index.exposures.get(word)||0),0)}};
}
