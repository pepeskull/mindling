'use strict';
// Authored regression data, not retrieved facts or a live research result.
const quotes=[
  'Neurons communicate through electrical signals and release chemical messengers at synapses.',
  'Synapses connect neurons and permit signals to pass between cells in a neural network.'
];
const urls=['https://www.ninds.nih.gov/health-information/public-education/brain-basics','https://www.ncbi.nlm.nih.gov/books/NBK11154/'];
function searchPayload(){
  let text='';const annotations=[];
  quotes.forEach((quote,index)=>{
    if(text)text+='\n\n';text+=quote+' ';const start_index=text.length;text+=`[${index+1}]`;
    annotations.push({type:'url_citation',url:urls[index],title:`Synthetic source ${index+1}`,start_index,end_index:text.length});
  });
  return {id:'resp_synthetic_source_validation',status:'completed',output:[
    {type:'web_search_call',status:'completed',action:{type:'search',sources:urls.map(url=>({type:'url',url}))}},
    {type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}
  ]};
}
const claim=(source,quote=source.passages[0])=>({sourceId:source.id,quote,category:'Biology',topic:'Neural signaling',reason:'Relevant synthetic cited report passage, not independent verification.',validAt:null});
function evaluation(sources,mode='valid'){
  const claims=sources.map(source=>claim(source));
  if(mode==='mixed'||mode==='recovery')claims[1].quote='This paraphrase is not an exact substring of the attributed report passage.';
  if(mode==='zero')for(const item of claims)item.quote='This invented quotation is not present in the cited report passage.';
  return {claims,limitations:['Synthetic citations are not independent factual verification.'],nextQuestion:mode==='valid'?null:'How do neurons communicate?'};
}
module.exports={quotes,urls,searchPayload,claim,evaluation};
