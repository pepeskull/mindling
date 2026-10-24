import { sentences, normalize } from '../../learning/text.js';

// Conservative extractive boundaries, never model-authored replacement text.
// Coordination is split only when another explicit subject has its own predicate.
const subject=/^(?:jag\b|mitt\b|min\b|mina\b|i\b|my\b|the player\b)/iu;
const predicate=/(?:^|\s)(?:heter|är|tycker|föredrar|vill|har|is|am|are|prefer|prefers|like|likes|want|wants|have|has)(?=\s|[.!?,]|$)/iu;
export function atomicStatements(text) {
  const result=[];
  for(const sentence of sentences(text)){
    if(result.length&&/^(?:it|this|that|these|they|he|she|det|den|de|han|hon)\b/iu.test(sentence)){result[result.length-1]+=' '+sentence;continue;}
    let rest=sentence;
    const boundary=/\s+(?:och|and)\s+/giu;
    let match;
    while((match=boundary.exec(rest))){
      const left=rest.slice(0,match.index).trim(),right=rest.slice(match.index+match[0].length).trim();
      if(subject.test(left)&&predicate.test(left)&&subject.test(right)&&predicate.test(right)){
        result.push(left);rest=right;boundary.lastIndex=0;
      }
    }
    if(rest.trim())result.push(rest.trim());
  }
  if(result.length>8)throw Error('Teach at most eight independent statements at a time. No Energy or XP changed.');
  return result;
}
export function explicitMutableKind(text) {
  const value=normalize(text);
  if(/^(?:(?:i|the player) (?:prefer|prefers|like|likes)\b|jag (?:föredrar|tycker om)\b|(?:my|the player's) (?:favorite|favourite)\b|(?:mitt|min|mina) favorit[\p{L}]*\b)/iu.test(value))return 'preference';
  if(/^(?:(?:i|the player) (?:(?:want|wants) to (?:learn|study|focus)|(?:have decided|decided) to focus|aim to learn)\b|(?:my|the player's) goal\b|jag (?:vill lära|ska lära|har bestämt)|mitt mål)/iu.test(value))return 'goal';
  return null;
}
export function updatePart(target,kind,requested=-1) {
  if(target.complete===false||target.verification==='verified')return null;
  const parts=atomicStatements(target.content);
  const acceptable=part=>explicitMutableKind(part)===kind;
  if(parts.length===1){
    if(requested>0)return null;
    return target.kind===kind||(target.kind==='claim'&&acceptable(parts[0]))?{index:0,parts}:null;
  }
  const matches=parts.map((part,index)=>({part,index})).filter(item=>acceptable(item.part));
  const selected=requested<0?(matches.length===1?matches[0]:null):matches.find(item=>item.index===requested);
  return selected?{index:selected.index,parts}:null;
}
export function updateInput(text,kind) {
  const parts=atomicStatements(text);
  if(parts.length===1)return parts[0];
  const matching=parts.filter(part=>explicitMutableKind(part)===kind);
  // Discard only an explicit change-of-mind preamble, never an unrelated fact.
  const preamble=/^(?:jag har ändrat mig|i (?:have changed|changed) my mind)[.!]?$/iu;
  if(matching.length===1&&parts.every(part=>part===matching[0]||preamble.test(part)))return matching[0];
  throw Error('Clarify which single preference or goal should change. No Energy or XP changed.');
}

export function mutableAttribute(text) {
  return normalize(text).match(/^(?:mitt|min|mina|my|the player's) ((?:favorit[\p{L}]*|favorite|favourite)(?: [\p{L}]+)*?) (?:är|is)\b/iu)?.[1]||null;
}

export function mutableValue(text) {
  if(!mutableAttribute(text))return null;
  return normalize(text).match(/ (?:är|is) (?:nu |now )?(.+?)(?: (?:istället för|instead of) .*)?$/iu)?.[1]||null;
}
