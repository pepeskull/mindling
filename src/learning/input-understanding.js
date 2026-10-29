import { clarification, validateAnswers, answerText } from './clarification-model.js';
export const LEARNING_MODES = Object.freeze({ FOUNDATION:'FOUNDATION', DEEP:'DEEP', TALK_RESEARCH:'TALK_RESEARCH' });
export const INTENTS = Object.freeze(['FACT_TEACHING','TOPIC_LEARNING','DEEP_LEARNING','QUESTION','CONVERSATION','CLARIFICATION']);
const command=/^(?:(?:please|can you|could you|i want you to|i would like you to|vänligen|kan du|jag vill att du|por favor|bitte|veuillez)\s+)?(?:learn|lern|study|research|investigate|explore|analy[sz]e|compare|explain|teach me|tell me about|show me|lär dig|lär|studera|undersök|utforska|analysera|jämför|förklara|aprende|investiga|analiza|étudie|apprends|analyse|lerne|untersuche)(?=\s|[,:])/iu;
const question=/[?？]\s*$/u;
const questionStart=/^(?:who|what|which|where|when|why|how|is|are|does|do|can|could|vilket|vilken|vilka|vad|vem|var|när|varför|hur|är|kan|qué|cuál|quién|cómo|dónde|quel|quelle|qui|comment|où|wer|was|wie|welche)\b/iu;
const greeting=/^(?:hi|hello|hey|hej|hejsan|hola|bonjour|salut|hallo|thanks|thank you|tack)(?:[\s,.!?]|$)/iu;
const companion=/^(?:how are you|how (?:is|are) your (?:development|brain|memories)|how are you developing|what is your (?:name|stage)|how many memories (?:do you have|have you learned)|hur mår du|hur utvecklas du|vad heter du|hur många minnen har du|tell me about yourself)(?:[\s,.!?]|$)/iu;
const fresh=/\b(?:now|current|currently|latest|today|recent|right now|just nu|nuvarande|idag|senaste|aktuella|aktuell|actualmente|aujourd'hui|heute|currently leads|current standings|senaste tabellen)\b/iu;
const negated=/\b(?:do not|don't|never|not to|inte|aldrig|no aprendas|ne .*pas|nicht)\b/iu;
const regionPatterns=[['Europe',/\b(?:Europe|European|Europa|europeiska)\b/iu],['Sweden',/\b(?:Sweden|Swedish|Sverige|svensk[at]?)\b/iu]];

export function understandInput(text, activity, {answers={}}={}) {
  validateAnswers(answers);
  if(!['TALK','TEACH','DEEP_TRAINING'].includes(activity)||typeof text!=='string'||!text.trim()||text.length>2000||/[\p{Cc}\p{Cf}]/u.test(text.replace(/[\n\r\t]/g,'')))throw Error('Share a readable request of at most 2,000 characters.');
  // Only formatting with a safe equivalence is applied. Names, case, numbers,
  // negation and sentence structure stay intact; uncertain grammar is retained.
  const normalizedText=text.normalize('NFC').trim().replace(/[ \t]+/g,' ')
    .replace(/^(?:lern|leran|learm) about\b/i,'Learn about')
    .replace(/^(learn|study|research|analyze|analyse|compare)(?=\s)/i,word=>word[0].toUpperCase()+word.slice(1))
    .replace(/[ \t]+([!?？])$/u,'$1');
  const learning=command.test(normalizedText),asking=question.test(normalizedText)||questionStart.test(normalizedText);
  const selfInquiry=companion.test(normalizedText)||greeting.test(normalizedText)&&(!asking||companion.test(normalizedText.replace(greeting,'').trim()));
  let intent=activity==='TALK'?(selfInquiry&&!learning?'CONVERSATION':asking?'QUESTION':learning?'CLARIFICATION':'CONVERSATION')
    :learning?(activity==='DEEP_TRAINING'?'DEEP_LEARNING':'TOPIC_LEARNING'):asking?'CLARIFICATION':'FACT_TEACHING';
  const sv=/[åäö]|\b(?:vilket|vilken|sverige|fotboll|lär|jag|senaste)\b/iu.test(normalizedText);
  let pending=null;
  if(negated.test(normalizedText)&&/\b(?:learn|research|study|lär|lära|studera|aprendas|apprendre|lernen)\b/iu.test(normalizedText)){
    intent='CLARIFICATION';pending=clarification('restriction',sv?'Vad får undersökas, med dina begränsningar kvar?':'What may be researched while retaining your restrictions?','detail',[],sv);
  }else if(activity!=='TALK'&&!learning&&/^(?:please|tell|show|give|help|find|get|make|become|remember|memorize|forget|do not|don't|vänligen|hjälp|berätta|visa|kom ihåg)\b/iu.test(normalizedText)){
    intent='CLARIFICATION';pending=clarification('instruction',sv?'Vad vill du att Mindling ska undersöka?':'What should Mindling investigate?','detail',[],sv);
  }else if(intent==='CLARIFICATION')pending=clarification('activity',sv?'Vill du undersöka frågan eller ange ett faktapåstående?':'Do you want to research this request or provide a factual statement?','action',activity==='TALK'?['research']:['research','statement'],sv);
  if(answers.action==='statement'){
    if(!answers.detail)pending=clarification('statement',sv?'Vilket faktapåstående vill du lära Mindling?':'Which factual statement do you want to teach?','detail',[],sv);
    else {intent='FACT_TEACHING';pending=null;}
  }else if(answers.action==='research'||answers.detail&&pending?.kind==='instruction'){
    intent=activity==='TALK'?'QUESTION':activity==='DEEP_TRAINING'?'DEEP_LEARNING':'TOPIC_LEARNING';pending=null;
  }
  const exclusion=normalizedText.match(/(?:do not|don't|never)\s+(?:learn|research|study)(?:\s+about)?\s+(.+?)(?:[.!?]|$)/iu)?.[1]||normalizedText.match(/lär(?: dig)? inte(?: om)?\s+(.+?)(?:[.!?]|$)/iu)?.[1];
  if(pending?.kind==='restriction'&&answers.detail&&exclusion&&exclusion.length<=80){pending=null;intent=activity==='TALK'?'QUESTION':activity==='DEEP_TRAINING'?'DEEP_LEARNING':'TOPIC_LEARNING';}
  const topic=normalizedText.replace(command,'').replace(/^\s*(?:about|om)\s+/iu,'').replace(/[.!?。！？]+$/u,'').trim().slice(0,160)||normalizedText.slice(0,160);
  const researchRequest=['QUESTION','TOPIC_LEARNING','DEEP_LEARNING'].includes(intent);
  const scope={};if(exclusion&&answers.detail)scope.excludedTopics=[exclusion];
  const count=normalizedText.match(/\b(?:top|first|last|topp|första|sista)\s+(\d{1,3})\b/iu);if(count)scope.count=Number(count[1]);
  const regions=regionPatterns.filter(([,pattern])=>pattern.test(normalizedText)).map(([region])=>region);
  if(regions.length===1)scope.region=regions[0];
  if(researchRequest&&regions.length>1){scope.regions=regions;if(answers.regionMode)scope.regionMode=answers.regionMode;else if(!pending)pending=clarification('geography',sv?'Hur ska de nämnda områdena kombineras?':'How should the mentioned geographic areas be combined?','regionMode',['intersection','comparison'],sv);}
  const best=/\b(?:best|bäst)\b/iu.test(normalizedText),compare=/\b(?:compare|comparison|jämför|jämförelse)\b/iu.test(normalizedText);
  const hasCriterion=/\b(?:standings|table|form|historical|ligatabell(?:en)?|tabellen|historisk|performance|prestanda|cost|price|kostnad|pris|reliability|features)\b/iu.test(normalizedText);
  if(answers.metric)scope.metric=answers.metric;
  else if(!pending&&(intent==='QUESTION'||learning)&&(best||compare)&&!hasCriterion){
    const football=/\b(?:football|soccer|fotboll)\b/iu.test(normalizedText);
    const product=/\b(?:software|language|processor|service|product|programming|språk|programvara|tjänst)\b/iu.test(normalizedText);
    pending=clarification('criterion',sv?'Vilket mått vill du använda?':'Which comparison criterion should be used?','metric',football?['standings','form','history']:product?['performance','cost','reliability']:[],sv);
    if(!football&&!product){pending.field='detail';if(answers.detail){scope.detail=answers.detail;pending=null;}}
  }
  if(answers.period)scope.period=answers.period;
  else if(researchRequest&&!pending&&/\b(?:recently|recent period|lately|senaste tiden|nyligen)\b/iu.test(normalizedText))pending=clarification('period',sv?'Vilken tidsperiod menar du?':'Which time period do you mean?','period',['week','month','year'],sv);
  if(answers.focus)scope.focus=answers.focus;
  if(!pending&&activity==='DEEP_TRAINING'&&learning&&topic.length<5&&!answers.detail)pending=clarification('depth',sv?'Vad vill du fördjupa?':'What should be studied in depth?','detail',[],sv);
  if(answers.detail)scope.detail=answers.detail;
  const suffix=answerText(answers),requestText=suffix?`${normalizedText}\nClarification: ${suffix}`:normalizedText;
  if(requestText.length>2000)throw Error('The clarified request exceeds 2,000 characters. Shorten the request without dropping its constraints.');
  if(pending)intent='CLARIFICATION';
  const depth=activity==='DEEP_TRAINING'?LEARNING_MODES.DEEP:activity==='TALK'?LEARNING_MODES.TALK_RESEARCH:LEARNING_MODES.FOUNDATION;
  return Object.freeze({version:1,intent,normalizedText,topic,scope:Object.freeze(scope),depth,requiresResearch:['TOPIC_LEARNING','DEEP_LEARNING'].includes(intent),timeSensitive:fresh.test(normalizedText)||/\b(?:who|which team|vilket lag)\b.*\b(?:leads?|leder)\b/iu.test(normalizedText)||['standings','form'].includes(answers.metric)||Boolean(answers.period),clarification:pending,selfInquiry,requestText,answers:{...answers},factText:answers.action==='statement'?answers.detail:null,language:sv?'sv':'en',
    method:'conservative-local',languageNote:'Formatting, clear command-prefix spelling and explicit request patterns only. Uncertain grammar, names and sentence structure are preserved; full semantic correction is unavailable in this local interpreter.'});
}

export function knowledgeGap(interpretation,context,reply=null,now=Date.now(),mind=null) {
  const relevant=context.candidates.filter(item=>item.ranking.score>0);
  const reasons=[];
  if(!relevant.length)reasons.push('No relevant current stored knowledge was retrieved.');
  if(relevant.some(item=>item.contradictions.length))reasons.push('Relevant stored claims contain recorded conflicts.');
  if(relevant.some(item=>item.integrity.sourceStatus==='incomplete'||!item.complete))reasons.push('Some relevant source text or retrieval context is incomplete.');
  const datedSource=relevant.some(item=>{const source=mind?.memories?.find(memory=>memory.id===item.id)?.research;return source&&Number.isSafeInteger(source.validAt)&&source.validAt<=now&&now-source.validAt<=86400000&&source.observedAt<=now&&now-source.observedAt<=86400000;});
  if(interpretation.timeSensitive&&!datedSource)reasons.push('A current answer needs a freshly dated source; saved text alone does not establish freshness.');
  if(interpretation.requiresResearch)reasons.push('Topic coverage and requested depth cannot be established from lexical matches alone.');
  if(reply?.insufficientInformation||reply?.uncertainty==='high')reasons.push('The reasoning response reports missing or uncertain support.');
  // Lexical relevance is a hint, not a sufficient-knowledge certificate.
  return {needsResearch:reasons.length>0,reasons,referenceIds:relevant.slice(0,24).map(item=>item.id),assessedAt:now,sourceQuality:'Stored claims are not independent source verification.'};
}
