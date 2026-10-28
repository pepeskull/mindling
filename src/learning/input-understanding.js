export const LEARNING_MODES = Object.freeze({ FOUNDATION:'FOUNDATION', DEEP:'DEEP', TALK_RESEARCH:'TALK_RESEARCH' });
export const INTENTS = Object.freeze(['FACT_TEACHING','TOPIC_LEARNING','DEEP_LEARNING','QUESTION','CONVERSATION','CLARIFICATION']);
const command=/^(?:(?:please|can you|could you|i want you to|i would like you to|vänligen|kan du|jag vill att du|por favor|bitte|veuillez)\s+)?(?:learn|lern|study|research|investigate|explore|analy[sz]e|compare|explain|teach me|tell me about|show me|lär dig|lär|studera|undersök|utforska|analysera|jämför|förklara|aprende|investiga|analiza|étudie|apprends|analyse|lerne|untersuche)(?=\s|[,:])/iu;
const question=/[?？]\s*$/u;
const questionStart=/^(?:who|what|which|where|when|why|how|is|are|does|do|can|could|vilket|vilken|vilka|vad|vem|var|när|varför|hur|är|kan|qué|cuál|quién|cómo|dónde|quel|quelle|qui|comment|où|wer|was|wie|welche)\b/iu;
const greeting=/^(?:hi|hello|hey|hej|hejsan|hola|bonjour|salut|hallo|thanks|thank you|tack)(?:[\s,.!?]|$)/iu;
const companion=/^(?:how are you|how (?:is|are) your (?:development|brain|memories)|how are you developing|what is your (?:name|stage)|how many memories (?:do you have|have you learned)|hur mår du|hur utvecklas du|vad heter du|hur många minnen har du|tell me about yourself)(?:[\s,.!?]|$)/iu;
const fresh=/\b(?:now|current|currently|latest|today|recent|right now|just nu|nuvarande|idag|senaste|aktuella|aktuell|actualmente|aujourd'hui|aktuell|heute)\b/iu;
const negated=/\b(?:do not|don't|never|not to|inte|aldrig|no aprendas|ne .*pas|nicht)\b/iu;
const regionPatterns=[['Europe',/\b(?:Europe|European|Europa|europeiska)\b/iu],['Sweden',/\b(?:Sweden|Swedish|Sverige|svensk[at]?)\b/iu]];

export function understandInput(text, activity) {
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
  let clarification='';
  if(negated.test(normalizedText)&&/\b(?:learn|research|study|lär|lära|studera|aprendas|apprendre|lernen)\b/iu.test(normalizedText)){intent='CLARIFICATION';clarification='Your learning request contains a restriction or negation. Please clarify exactly what may be researched; nothing has been learned.';}
  else if(activity!=='TALK'&&!learning&&/^(?:please|tell|show|give|help|find|get|make|become|remember|memorize|forget|do not|don't|vänligen|hjälp|berätta|visa|kom ihåg)\b/iu.test(normalizedText)){intent='CLARIFICATION';clarification='Please distinguish the knowledge you want taught from an instruction or topic to research.';}
  else if(intent==='CLARIFICATION')clarification=activity==='TALK'?'Use Teach or Deep Training to start a topic-learning request.':'Is this a question to research or a fact you want to teach? Start a topic request with “Learn about…” or “Analyze…”.';
  const topic=normalizedText.replace(command,'').replace(/^\s*(?:about|om)\s+/iu,'').replace(/[.!?。！？]+$/u,'').trim().slice(0,160)||normalizedText.slice(0,160);
  const scope={};
  const count=normalizedText.match(/\b(?:top|first|last|topp|första|sista)\s+(\d{1,3})\b/iu);if(count)scope.count=Number(count[1]);
  const regions=regionPatterns.filter(([,pattern])=>pattern.test(normalizedText)).map(([region])=>region);
  if(regions.length===1)scope.region=regions[0];
  if(regions.length>1)clarification='Please clarify how the multiple geographic constraints should be combined before research begins.';
  if(intent==='QUESTION'&&/\b(?:best|bäst)\b/iu.test(normalizedText)&&/\b(?:football|soccer|fotboll)\b/iu.test(normalizedText)&&!/\b(?:standings|table|form|historical|ligatabell(?:en)?|tabellen|historisk)\b/iu.test(normalizedText))clarification='Do you mean league standings, recent form or historical success? Please clarify the measure of “best”.';
  const depth=activity==='DEEP_TRAINING'?LEARNING_MODES.DEEP:activity==='TALK'?LEARNING_MODES.TALK_RESEARCH:LEARNING_MODES.FOUNDATION;
  return Object.freeze({version:1,intent,normalizedText,topic,scope:Object.freeze(scope),depth,requiresResearch:['TOPIC_LEARNING','DEEP_LEARNING'].includes(intent),timeSensitive:fresh.test(normalizedText),clarification,selfInquiry,
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
