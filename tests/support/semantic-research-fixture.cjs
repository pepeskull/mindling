'use strict';
// Authored canonical claims and cited reports, never a historical/live replay.
const records=[
 {id:'crypto',content:'Cryptoassets use blockchain ledgers to record ownership and transfers.',category:'Crypto markets',topic:'Crypto Market and Blockchain'},
 {id:'solana',content:'Solana meme coins are cryptoassets. Solana meme coins use blockchain ledgers to record token transfers.',category:'Token applications',topic:'Solana Blockchain Concepts'},
 {id:'ledger',content:'Blockchain ledgers use consensus mechanisms to agree on transaction history.',category:'Technical foundations',topic:'Blockchain Ledgers and Consensus'}
];
const quotes=[records[0].content,records[1].content,records[2].content];
function searchPayload({title='Crypto Market\nRisks',responseId='resp_synthetic_semantic'}={}){
 let text='';const annotations=[],urls=quotes.map((_,i)=>`https://research${i+1}.org/blockchain`);
 quotes.forEach((quote,i)=>{if(text)text+='\n\n';text+=quote+' ';const start_index=text.length;text+=`[${i+1}]`;annotations.push({type:'url_citation',url:urls[i],title:i===0?title:`Synthetic source ${i+1}`,start_index,end_index:text.length});});
 return {id:responseId,status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:urls.slice(0,2).map(url=>({type:'url',url}))}},{type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url:urls[2]}]}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]};
}
function evaluation(sources){return {claims:sources.map((s,i)=>({sourceId:s.id,quote:s.passages?.[0]||s.text,category:records[i].category,topic:records[i].topic,reason:'Exact synthetic cited report passage.',validAt:null})),limitations:['Synthetic attributed reports; no independent verification.'],nextQuestion:null};}
module.exports={records,quotes,searchPayload,evaluation};
