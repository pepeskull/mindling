'use strict';
// Authored synthetic citations. No claim of live source retrieval or verification.
const quotes=[
  'The rules of a game define the actions available to players and the conditions for winning.',
  'Cooperative games require players to work together toward a shared objective.',
  'In a turn-based game, participants take actions in a defined order rather than simultaneously.'
];
const urls=['https://www.britannica.com/topic/game','https://boardgamegeek.com/wiki/page/Glossary','https://www.gamedeveloper.com/design/turn-based-games'];
function searchPayload(){
  let text='';const annotations=[];
  quotes.forEach((quote,index)=>{if(text)text+='\n\n';text+=quote+' ';const start_index=text.length;text+=`[${index+1}]`;annotations.push({type:'url_citation',url:urls[index],title:`Synthetic success source ${index+1}`,start_index,end_index:text.length});});
  return {id:'resp_synthetic_three_sources',status:'completed',output:[
    {type:'web_search_call',status:'completed',action:{type:'search',sources:urls.map(url=>({type:'url',url}))}},
    {type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}
  ]};
}
function evaluation(sources){return {claims:sources.map((source,index)=>({sourceId:source.id,quote:quotes[index],category:'Gaming',topic:'Game rules',reason:'Synthetic report fixture, not independently verified.',validAt:null})),limitations:['These are synthetic cited summaries, not independently verified source facts.'],nextQuestion:null};}
module.exports={quotes,urls,searchPayload,evaluation};
