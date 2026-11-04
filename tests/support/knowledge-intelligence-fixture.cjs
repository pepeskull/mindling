'use strict';
// Independently authored canonical claims; the first is the supplied incident text.
const transaction="A transaction is a signed request to transfer value or make another change to a blockchain's state. Network nodes check it against the system's rules—for example, whether the signature is valid and the sender can make the requested transfer.";
const corrected="A transaction is a signed request to transfer value or change a blockchain's state. Network nodes validate transactions by checking signatures and available funds before accepting a transfer.";
const records=[
 {id:'tx',content:transaction,category:'Definition',topic:'Blockchain transactions'},
 {id:'validation',content:'Blockchain network nodes validate a transaction by checking its signature and the sender’s available funds.',category:'Transaction validation',topic:'Blockchain transactions'},
 {id:'consensus',content:'Blockchain network nodes agree on a shared ledger state through consensus before including transactions in blocks.',category:'Consensus',topic:'Shared ledger agreement'},
 {id:'blocks',content:'A blockchain groups transactions into blocks. Each block records a reference to its predecessor.',category:'Block structure',topic:'Ledger structure'},
 {id:'solana',content:'Solana meme coins are tokens deployed on the Solana blockchain. Token contracts process transactions to create and trade these tokens.',category:'Definition',topic:'Solana meme coins'},
 {id:'launch',content:'Token contracts create tokens on the Solana blockchain. Traders submit transactions to those contracts when launching or trading meme coins.',category:'On-chain mechanics',topic:'Launching and trading'},
 {id:'game',content:'A video game responds to player input. A video game gives feedback to help players understand the results of their actions.',category:'Video games',topic:'Definition'},
 {id:'feedback',content:'Players use feedback to choose their next actions in a video game.',category:'Player feedback',topic:'Interactive feedback'},
 {id:'unrelated',content:'Speculative coin prices reflect attention and trading demand. Price changes do not establish how validators reach consensus.',category:'Markets',topic:'Coin speculation'}
];
module.exports={transaction,corrected,records};
function searchPayload(){
 let text='';const annotations=[],urls=records.slice(0,3).map((_,i)=>i===0?'https://ethereum.org/developers/docs/transactions?utm_source=openai':`https://source${i}.example.org/transactions`);
 records.slice(0,3).forEach((r,i)=>{if(text)text+='\n\n';text+=r.content+' ';const start_index=text.length;text+=`[${i+1}]`;annotations.push({type:'url_citation',url:urls[i],title:'Authored local transaction fixture '+i,start_index,end_index:text.length});});
 return {id:'resp_synthetic_intelligence',status:'completed',output:[{id:'search-1',type:'web_search_call',status:'completed',action:{type:'search',sources:urls.map(url=>({type:'url',url}))}},{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]};
}
const evaluation=sources=>({claims:sources.map((s,i)=>({sourceId:s.id,quote:s.passages[0],category:records[i].category,topic:records[i].topic,reason:'Exact authored local cited report passage.',validAt:null})),limitations:['Authored local cited summaries, not independent factual verification.'],nextQuestion:null});
module.exports.searchPayload=searchPayload;module.exports.evaluation=evaluation;
