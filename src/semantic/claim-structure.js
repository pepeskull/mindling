import { editableMemoryText } from '../learning/correction-content.js';
import { features, sentences } from '../learning/text.js';
export const genericEntity=new Set(['data','information','knowledge','system','technology','thing','topic','process','object','resource','state','rule','result']);
export const singular=word=>word.length>4&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>3&&word.endsWith('s')&&!/(?:ss|us|is)$/u.test(word)?word.slice(0,-1):word;
export function nounPhrase(value){
  const text=value.normalize('NFC').toLowerCase().replace(/['’]s\b/gu,'').replace(/^(?:a|an|the|each|every|its|their)\s+/u,'').trim();
  if(!/^[\p{L}][\p{L}\p{M}'’ -]{1,100}$/u.test(text))return null;
  const words=text.split(/\s+/u).map(singular);return words.length<=10?words.join(' '):null;
}
const verbs='is|are|has|have|uses?|depend(?:s)? on|rel(?:y|ies) on|runs? on|operates? on|records?|contain(?:s)?|includes?|supports?|enables?|provides?|gives?|checks?|validates?|verifies|verify|agrees? on|groups?|stores?|creates?|processes|process|submits?|responds? to|rejects?|references?';
const clause=new RegExp(`^(.+?)\\s+(${verbs})\\s+(.+)$`,'iu');
const blocked=/\b(?:may|might|could|would|perhaps|fictional|imaginary|named|titled|called|metaphor|if|unless)\b/iu;
export const entityHead=value=>value?.split(' ').at(-1)||'';
const specific=value=>value&&!genericEntity.has(value)&&!genericEntity.has(entityHead(value));
function predicate(value){
  if(/^(is|are)$/u.test(value))return 'defines';if(/^(has|have|contain|include)/u.test(value))return 'contains';
  if(/^(use|depend|rel|run|operate)/u.test(value))return 'uses';if(/^(check|validat|verif|reject)/u.test(value))return 'validate';if(value==='processes')return 'process';if(value==='responds to'||value==='respond to')return 'respond';return value.replace(/s$/u,'');
}
// Local proposition structure, not a general language model or truth classifier.
// Pronoun resolution is confined to one explicit preceding definition in this
// canonical record; ambiguous or uncertain prose is never completed by guessing.
export function claimStructure(memory){
  const content=editableMemoryText(memory),facts=[],contexts=new Set(),strongContexts=new Set();let defined=null,subjectLabel=null;
  if(features(content).negative||blocked.test(content)||/["“”`?]/u.test(content))return {facts,contexts,strongContexts,subjectLabel};
  const scope=(value,{weak=false,headType=false}={})=>{const p=nounPhrase(value);if(!specific(p))return;contexts.add(p);if(!weak)strongContexts.add(p);if(headType&&p.includes(' ')&&specific(entityHead(p))){contexts.add(entityHead(p));if(!weak)strongContexts.add(entityHead(p));}};
  for(const match of content.matchAll(/([\p{L}][\p{L}-]*)['’]s\s+[\p{L}]/gu))scope(match[1]);
  for(const sentence of sentences(content).slice(0,8)){
    if(sentence.length>700)continue;
    const parts=sentence.replace(/[.]$/u,'').split(/(?:;\s*|,?\s+by which\s+|,?\s+that\s+|,?\s+which\s+)/iu);
    for(const part of parts.slice(0,3)){
      const m=part.match(clause);if(!m)continue;
      let subject=nounPhrase(m[1]),object=nounPhrase(m[3].split(/\s+(?:to|for|whose|which|that|against|before|after|through|by|into|when|issued|deployed|recorded|arranged|located)\b|[,—]/iu)[0]);
      if(object==='it'&&defined)object=defined;
      if(!subject||!object||subject===object||['it','they','this','these','those'].includes(subject)||['it','them','this','these','those'].includes(object))continue;
      const pred=predicate(m[2].toLowerCase());subjectLabel??=m[1].replace(/^(?:a|an|the|each|every)\s+/iu,'').trim();
      if(pred==='defines'&&specific(subject))defined=subject;
      // Explicit container/operation subjects and noun qualifiers provide scope,
      // rather than deriving a domain from a prompt or a classification title.
      if(subject.includes(' ')){const words=subject.split(' ');for(let i=1;i<words.length;i++)scope(words.slice(0,i).join(' '),{weak:true});}
      if(['group','store','record','contains','validate','process','create','submit','give','provide','respond'].includes(pred)&&specific(subject))scope(subject);
      for(const place of m[3].matchAll(/\b(?:on|in|within|inside)\s+(?:(?:a|an|the)\s+)?([\p{L}][\p{L}'’ -]{1,65}?)(?=[.,]|\s+(?:to|for|that|which)|$)/giu))scope(place[1],{headType:true});
      const owner=m[1].match(/^(.+?)\s+(?:on|in|of)\s+(.+)$/iu);
      facts.push({subject,predicate:pred,object,...(owner?{owner:nounPhrase(owner[2]),component:nounPhrase(owner[1])}:{})});
    }
  }
  return {facts,contexts,strongContexts,subjectLabel};
}
