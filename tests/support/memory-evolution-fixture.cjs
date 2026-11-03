'use strict';
// Authored research reports. Never downloaded or represented as verified facts.
const old='A standard chessboard contains 60 squares.',fresh='A standard chessboard contains 64 squares.';
function scenario(topic){
 if(topic.includes('foundation'))return [[old,'https://rules.org/board']];
 if(topic.includes('corroboration'))return [[fresh,'https://guide.edu/board']];
 if(topic.includes('conflict'))return [[fresh,'https://manual.net/board']];
 if(topic.includes('complement'))return [['A chessboard has alternating light and dark squares arranged in a regular grid.','https://rules.org/contrast']];
 return [[fresh,'https://guide.edu/board']];
}
function searchPayload(topic){const pairs=scenario(topic);let text='';const annotations=[];for(const [quote,url]of pairs){if(text)text+='\n\n';text+=quote+' ';const start_index=text.length;text+='[source]';annotations.push({type:'url_citation',url,title:'Synthetic chessboard evidence',start_index,end_index:text.length});}return {id:'resp_synthetic_evolution',status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:pairs.map(([,url])=>({type:'url',url}))}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]};}
const evaluation=sources=>({claims:sources.map(s=>({sourceId:s.id,quote:s.passages[0],category:'Gaming',topic:'Chessboard structure',reason:'Supports the exact synthetic proposition; not independent verification.',validAt:null})),limitations:[],nextQuestion:null});
module.exports={old,fresh,scenario,searchPayload,evaluation};
