import { features, normalize } from '../../learning/text.js';
import { retrieveMemories } from '../../learning/knowledge.js';

// Ranking aids only. Similarity never authorizes a mutation or establishes truth.
const aliases = new Map([['ui','interface'],['interfaces','interface'],['themes','theme'],['likes','prefer'],['like','prefer'],['prefers','prefer'],['preferences','prefer'],['wants','goal'],['want','goal'],['focus','goal']]);
const terms = text => new Set(features(text).terms.map(term=>aliases.get(term)||term));
// Conservative hints for old untyped records; never verification or mutation authority.
function legacyKind(text) {
  if(/\b(previously|historically|used to|tidigare)\b/iu.test(text))return 'historical';
  if(/\b(prefer(?:s)?|favorite|favourite|föredrar)\b/iu.test(text))return 'preference';
  if(/\b(goal|aim|wants? to (?:learn|study)|focus on|mål|vill lära)\b/iu.test(text))return 'goal';
  return 'claim';
}
export function retrievePreviewMemories(text, memories, {limit=8}={}) {
  const query=terms(text), exact=normalize(text), lexical=new Map(retrieveMemories(text,memories.filter(m=>!m.supersededBy),{limit:1000}).map(item=>[item.memory.id,item.score]));
  const preference=/\b(prefer|like|favorite|favourite|föredrar|gillar)\b/iu.test(text);
  const goal=/\b(goal|learn|focus|instead|decided|mål|lära|istället)\b/iu.test(text);
  return memories.filter(m=>typeof m.content==='string').map(memory=>{
    const shared=[...terms(memory.content)].filter(t=>query.has(t)).length;
    const kind=candidateMetadata(memory).kind;
    const context=(preference&&kind==='preference'||goal&&kind==='goal') ? 0.3 : 0;
    const score=normalize(memory.content)===exact?3:(lexical.get(memory.id)||0)+shared*.12+context;
    return {memory,score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||String(a.memory.id).localeCompare(String(b.memory.id))).slice(0,limit);
}
export function candidateMetadata(memory) {
  const kind=memory.intelligence?.kind||memory.kind||legacyKind(memory.content||'');
  return {kind,certainty:memory.intelligence?.certainty||(/\b(might|maybe|perhaps|heard|uncertain|kanske)\b/iu.test(memory.content)?'uncertain':'asserted'),
    verification:[memory.verification,memory.intelligence?.verification,memory.analysis?.verification].includes('verified')?'verified':'unverified-player-claim',previousValues:(memory.valueHistory||[]).slice(-2).map(v=>String(v.content).slice(0,300).trim()),current:!memory.supersededBy&&memory.intelligence?.current!==false&&kind!=='historical'};
}
