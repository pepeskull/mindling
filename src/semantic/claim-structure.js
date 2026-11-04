import { semanticText } from './semantic-text.js';
import { features, sentences } from '../learning/text.js';
export const genericEntity=new Set(['data','information','knowledge','system','technology','thing','topic','process','object','resource','state','rule','result']);
export const singular=word=>word.length>4&&word.endsWith('ies')?word.slice(0,-3)+'y':word.length>3&&word.endsWith('s')&&!/(?:ss|us|is)$/u.test(word)?word.slice(0,-1):word;
export function nounPhrase(value){
  const text=value.normalize('NFC').toLowerCase().replace(/['’]s\b/gu,'').replace(/^(?:a|an|the|each|every|its|their)\s+/u,'').trim();
  if(!/^[\p{L}][\p{L}\p{M}'’ -]{1,100}$/u.test(text))return null;
  const words=text.split(/\s+/u).map(singular);return words.length<=10?words.join(' '):null;
}
const verbs='is|are|has|have|uses?|depend(?:s)? on|rel(?:y|ies) on|runs? on|operates? on|records?|contain(?:s)?|includes?|supports?|enables?|provides?|gives?|checks?|validates?|verifies|verify|agrees? on|groups?|stores?|creates?|processes|process|submits?|responds? to|rejects?|references?|follows?';
const clause=new RegExp(`^(.+?)\\s+(${verbs})\\s+(.+)$`,'iu');
const coordinatedVerb=new RegExp(`\\s+and\\s+(?=(?:${verbs})\\s+)`,'iu');
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
  const view=semanticText(memory),content=view.text,facts=[],operations=[],diagnostics={},contexts=new Set(),strongContexts=new Set();let defined=null,subjectLabel=null;
  if(view.reason)diagnostics[view.reason]=1;
  // Uncertainty, fictional framing and quoted discourse can scope the entire record.
  if(/\b(?:fictional|imaginary|metaphor)\b/iu.test(content)||/["“”`?]/u.test(content)){diagnostics.UNCERTAIN_OR_QUOTED=1;return {facts,operations,diagnostics,contexts,strongContexts,subjectLabel};}
  const partsOfRecord=sentences(content).slice(0,8),negatedSubjects=new Set(),uncertainTerms=new Set(),dependentSentences=new Set();
  for(const sentence of partsOfRecord){
    if(!features(sentence).negative)continue;
    const negative=sentence.match(/^(.+?)\s+(?:is|are|does|do|has|have|can|will)\s+(?:not|never|no)\b/iu),subject=negative&&nounPhrase(negative[1]);
    // Unknown negation scope can qualify the whole report. Do not guess.
    if(!subject||['it','this','they','these','those'].includes(subject)){
      diagnostics.NEGATION_SCOPE_UNSUPPORTED=(diagnostics.NEGATION_SCOPE_UNSUPPORTED||0)+1;
      for(const term of features(sentence).terms)uncertainTerms.add(singular(term));
      // Anaphoric negation can qualify preceding claims. Preserve that dependency;
      // only independently named subjects outside the affected vocabulary survive.
      if(/\b(?:it|this|they|these|those|above|previous|all)\b/iu.test(sentence))for(let i=0;i<partsOfRecord.indexOf(sentence);i++)dependentSentences.add(partsOfRecord[i]);
      continue;
    }
    negatedSubjects.add(subject);
  }
  const scope=(value,{weak=false,headType=false}={})=>{const p=nounPhrase(value);if(!specific(p))return;contexts.add(p);if(!weak)strongContexts.add(p);if(headType&&p.includes(' ')&&specific(entityHead(p))){contexts.add(entityHead(p));if(!weak)strongContexts.add(entityHead(p));}};
  for(const sentence of partsOfRecord){
    // A report can contain an explicit proposition followed by a disclaimer or
    // contrast. Reject that sentence, not unrelated supported sentences; never
    // delete negation/qualifiers inside a proposition to manufacture a positive.
    if(dependentSentences.has(sentence)||sentence.length>700||features(sentence).negative||blocked.test(sentence)||/\b(?:can|often|typically|staff view)\b/iu.test(sentence)||/["“”`?]/u.test(sentence)){defined=null;continue;}
    const parts=sentence.replace(/[.]$/u,'').split(/(?:;\s*|,\s+and\s+|,?\s+by which\s+|,?\s+that\s+|,?\s+which\s+)/iu);
    for(const part of parts.slice(0,3)){
      // Passive grouping states the material and container, not an invented actor.
      const passive=part.match(/^(.+?)\s+(?:is|are)\s+(grouped|stored|assembled|packed)\s+(?:into|in)\s+(.+)$/iu);
      // Preserve purpose: competing to produce is not a claim of completed production.
      const purpose=part.match(/^(?:In .+?, as used by .+?,\s*)?(.+?)\s+compete(?:s)? to (produce|create|build)\s+(.+?)(?:\s+by\s+.+)?$/iu);
      const m=passive||purpose||part.match(clause);if(!m){diagnostics.UNSUPPORTED_GRAMMAR=(diagnostics.UNSUPPORTED_GRAMMAR||0)+1;continue;}

      let subject=nounPhrase(m[1]),object=nounPhrase(m[3].split(coordinatedVerb)[0].split(/\s+(?:to|for|whose|which|that|against|before|after|through|by|into|when|issued|deployed|recorded|arranged|located)\b|[,—]/iu)[0]);
      if([subject,object].filter(Boolean).some(value=>value.split(' ').some(term=>uncertainTerms.has(term)))){diagnostics.NEGATION_DEPENDENCY=(diagnostics.NEGATION_DEPENDENCY||0)+1;defined=null;continue;}
      const pred=passive?({grouped:'group',stored:'store',assembled:'assemble',packed:'pack'}[m[2].toLowerCase()]):purpose?'purpose-'+m[2].toLowerCase():predicate(m[2].toLowerCase());
      if(subject&&!negatedSubjects.has(subject)&&!['it','they','this','these','those'].includes(subject))operations.push({actor:subject,predicate:pred});
      if(object==='it'&&defined)object=defined;
      if(negatedSubjects.has(subject)||negatedSubjects.has(object)){defined=null;continue;}
      if(!subject||!object||subject===object||['it','they','this','these','those'].includes(subject)||['it','them','this','these','those'].includes(object)){diagnostics.UNSUPPORTED_ROLES=(diagnostics.UNSUPPORTED_ROLES||0)+1;continue;}
      subjectLabel??=m[1].replace(/^(?:a|an|the|each|every)\s+/iu,'').trim();
      if(pred==='defines'&&specific(subject))defined=subject;else if(subject!==defined)defined=null;
      for(const match of part.matchAll(/([\p{L}][\p{L}-]*)['’]s\s+[\p{L}]/gu))scope(match[1]);
      // Explicit container/operation subjects and noun qualifiers provide scope,
      // rather than deriving a domain from a prompt or a classification title.
      if(subject.includes(' ')){const words=subject.split(' ');for(let i=1;i<words.length;i++)scope(words.slice(0,i).join(' '),{weak:true});}
      if(['group','store','record','contains','validate','process','create','submit','give','provide','respond'].includes(pred)&&specific(subject))scope(subject);
      for(const place of m[3].matchAll(/\b(?:on|in|within|inside)\s+(?:(?:a|an|the)\s+)?([\p{L}][\p{L}'’ -]{1,65}?)(?=[.,]|\s+(?:to|for|that|which)|$)/giu))scope(place[1],{headType:true});
      const owner=m[1].match(/^(.+?)\s+(?:on|in|of)\s+(.+)$/iu);
      facts.push({subject,predicate:pred,object,...(owner?{owner:nounPhrase(owner[2]),component:nounPhrase(owner[1])}:{})});
    }
  }
  return {facts,operations,diagnostics,contexts,strongContexts,subjectLabel};
}
