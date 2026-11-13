import {organizeAreas} from './organize-areas.js';
import {graphData} from '../memory/graph-data.js';
import {eligibleSemanticMemory,semanticSnapshot} from './model-contract.js';
import {persistAreaRelations} from './area-relations.js';
// A deliberately narrow zero-inference proof rule, not a topic classifier.
// Only a complete, unqualified stored assertion of domain containment can
// supply this proof. All other language is left to the existing model contract.
const fold=s=>s.normalize('NFC').toLocaleLowerCase('en').trim();
const proof=text=>/^([^.!?\n]+?) is (?:a|an) (?:type of |kind of )([^.!?\n]+)\.$/u.exec(text);
export function reconcileAreaEvidence(next){
 if(next?.mind)next.mind=organizeAreas(next.mind);
 const mind=next?.mind;if(!Array.isArray(mind?.memories)||!mind.memories.length)return next;
 // Incremental bounded scan during existing atomic state writes, never view or
 // pointer callbacks. Remember exact versions, including failed proof attempts.
 const state=mind.areaEvidenceScan?.version===1&&Number.isSafeInteger(mind.areaEvidenceScan.cursor)&&mind.areaEvidenceScan.cursor>=0?mind.areaEvidenceScan:{version:1,cursor:0,seen:{}};
 const list=mind.memories,offset=state.cursor%list.length,batch=list.slice(offset,offset+32);
 const nextCursor=(offset+batch.length)%list.length;
 const candidates=batch.filter(m=>eligibleSemanticMemory(m));
 const signature=m=>JSON.stringify([m.content,m.categoryId,m.category,m.research?.sourceHash,m.research?.quoteHash,m.supersededBy,m.intelligence?.current]);
 // Category changes invalidate old unresolved decisions as well as evidence.
 const categoryVersion=JSON.stringify([(Array.isArray(mind.categories)?mind.categories:[]).map(c=>[c?.id,c?.name]),[...new Set(list.map(m=>JSON.stringify([m?.categoryId,m?.category,m?.areaSuggestion])))].sort()]);
 const seen=Object.assign(Object.create(null),state.categoryVersion===categoryVersion?state.seen:{});
 const pending=candidates.filter(m=>seen[m.id]!==signature(m));
 if(!pending.length){if(list.length>32)mind.areaEvidenceScan={...state,cursor:nextCursor};return next;}
 const graph=graphData(mind),byLabel=new Map();
 for(const a of graph.areas){const label=fold(a.label);byLabel.set(label,byLabel.has(label)?null:a);}
 const decisions=[];
 for(const m of pending){
  const snapshot=semanticSnapshot(m),match=proof(snapshot.text);
  if(match){const from=byLabel.get(fold(match[1])),to=byLabel.get(fold(match[2]));
   if(from&&to&&from!==to)decisions.push({version:1,from:from.id,to:to.id,type:'narrower-than',direction:'from-to',reason:'Complete stored assertion of domain containment.',validation:'explicit-stored-claim-not-independently-verified',areas:[{id:from.id,label:from.label},{id:to.id,label:to.label}],evidence:[{snapshot,span:{start:0,end:snapshot.text.length,quote:snapshot.text}}]});
  }
  seen[m.id]=signature(m);
 }
 persistAreaRelations(mind,decisions,graph.areas);
 // Bound bookkeeping, not knowledge. Eviction permits later reconsideration,
 // but never authorizes inference or changes a canonical record.
 mind.areaEvidenceScan={version:1,cursor:nextCursor,categoryVersion,seen:Object.fromEntries(Object.entries(seen).slice(-256))};
 return next;
}
