import {semanticCandidateReport} from './model-contract.js';
import {graphData} from '../memory/graph-data.js';
const key=ids=>JSON.stringify([...ids].sort());
// Local, read-only audit. No passage text, URLs, prompts or inferred edges.
export function semanticCoverage(mind){
 const memories=mind.memories||[],tasks=mind.learningTasks||[],report=semanticCandidateReport(mind,memories.map(m=>m.id));
 const persisted=new Set(memories.flatMap(m=>(m.semanticAssociations||[]).map(e=>key([m.id,e.memoryId]))));
 const projected=new Set(graphData(mind).edges.filter(e=>e.kind==='association').map(e=>key(e.sourceMemoryIds)));
 const attempts=tasks.flatMap(t=>(t.semanticAttempts||[]).map(a=>({taskId:t.id,state:a.state,pairs:(a.pairs||[]).flatMap(p=>{try{const [,a,b]=JSON.parse(p);return [[a[0],b[0]]];}catch{return [];}}),result:a.result||null})));
 const submitted=new Set(attempts.filter(a=>['DISPATCHED','COMPLETED','OUTCOME_UNKNOWN'].includes(a.state)).flatMap(a=>a.pairs.map(key)));
 return {totalStoredRecordPairs:report.totalStoredRecordPairs,totalPossiblePairs:report.totalPossiblePairs,eligibleMemories:report.eligibleMemories,excludedMemories:report.excludedMemories,recordLimitExcluded:report.recordLimitExcluded,
  remainingCandidates:report.generated,pairDecisions:report.decisions,
  submittedPairsRecorded:submitted.size,attempts,
  historyIncomplete:!Array.isArray(mind.learningTasks)||tasks.some(t=>(t.semanticAnalysis&&!t.semanticAttempts?.length)||(t.semanticAttempts||[]).some(a=>!a.pairs)),
  persistedSemanticPairs:persisted.size,persistedMissingFromProjection:[...persisted].filter(p=>!projected.has(p)).map(JSON.parse),
  taskSelections:tasks.filter(t=>t.status==='COMPLETED').map(t=>({taskId:t.id,deferral:t.semanticDeferral||null,diagnostic:t.semanticAnalysis?.diagnostic||null,...semanticCandidateReport(mind,t.knowledgeIds||[]),context:undefined}))};
}
