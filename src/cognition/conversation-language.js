const languages = {
  en:{names:'english|engelska|inglés',cue:/\b(what|how|which|where|why|the|and|with|does|tell|learn)\b/giu,unknown:"I don't know that yet.",pause:'Research paused — Daily XP limit reached.',recalled:'Here is what I remember:',stale:'These are saved claims. I don’t have a current source to confirm them:',conflict:'My saved claims conflict, so I’m uncertain:',summary:'Here is what I could retain from the source-supported search report:'},
  sv:{names:'swedish|svenska|sueco',cue:/\b(vad|hur|vilken|vilket|varför|och|med|finns|lär|om)\b/giu,unknown:'Det vet jag inte än.',pause:'Forskning pausad — dagens XP-gräns är nådd.',recalled:'Det här minns jag:',stale:'Det här är sparade uppgifter. Jag saknar en aktuell källa som bekräftar dem:',conflict:'Mina sparade uppgifter motsäger varandra, så jag är osäker:',summary:'Här är vad jag kunde behålla från de källstödda sökresultaten:'},
  es:{names:'spanish|spanska|español',cue:/\b(qué|cómo|cuál|cuáles|dónde|cuándo|con|las|los|una|para)\b/giu,unknown:'Todavía no lo sé.',pause:'Investigación pausada. Alcancé el límite diario de XP.',recalled:'Esto es lo que recuerdo:',stale:'Estos son datos guardados. No tengo una fuente actual que los confirme:',conflict:'Mis recuerdos se contradicen, así que no puedo asegurarlo:',summary:'Esto es lo que pude conservar de los resultados respaldados por fuentes:'}
};
const requested=new RegExp(`(?:\\b(?:in|på|en)\\s+|\\b(?:answer|reply|svara|responde)\\s+)(${Object.values(languages).map(item=>item.names).join('|')})(?![\\p{L}])`,'iu');

export function detectedLanguage(text){
  const scores=Object.entries(languages).map(([id,{cue}])=>[id,(text.match(cue)||[]).length]).sort((a,b)=>b[1]-a[1]);
  return scores[0][1]>=2&&scores[0][1]>=scores[1][1]+2?scores[0][0]:null;
}

export function conversationLanguage(text){
  const explicit=text.match(requested)?.[1];
  return (explicit&&Object.keys(languages).find(id=>new RegExp(`^(?:${languages[id].names})$`,'iu').test(explicit)))||detectedLanguage(text);
}

export const conversationCopy = text => languages[conversationLanguage(text)]||languages.en;
