'use strict';
// Explicitly synthetic report/citation data. These are not live page extracts.
const quotes=[
  'The rules of a game define the actions available to players and the conditions for winning.',
  'Cooperative games require players to work together toward a shared objective.'
];
const urls=['https://www.britannica.com/topic/game','https://boardgamegeek.com/wiki/page/Glossary'];
function searchPayload(){
  let text='';const annotations=[];
  quotes.forEach((quote,index)=>{if(text)text+='\n\n';text+=quote+' ';const start_index=text.length;text+=`[${index+1}]`;annotations.push({type:'url_citation',url:urls[index],title:`Synthetic Gaming source ${index+1}`,start_index,end_index:text.length});});
  return {id:'resp_synthetic_gaming_limitations',status:'completed',output:[
    ...urls.map(url=>({type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url}]}})),
    {type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}
  ]};
}
const limitation='  These synthetic cited summaries are not independently verified.\nA second source does not remove uncertainty.\t';
function evaluation(sources,limitations=[limitation],mixed=false){
  return {claims:sources.map((source,index)=>({sourceId:source.id,quote:mixed&&index===1?'This unsupported paraphrase is absent from the attributed Gaming report.':source.passages[0],category:'Gaming',topic:'Game rules',reason:'Synthetic evidence fixture, not a verified research result.',validAt:null})),limitations,nextQuestion:null};
}
module.exports={quotes,urls,limitation,searchPayload,evaluation};
