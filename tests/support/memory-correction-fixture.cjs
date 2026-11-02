'use strict';
// Authored regression inputs/assessments, not live research or classification.
const claim='Common video game genres include action, adventure, role-playing, strategy, simulation, puzzle, platformer, sports and racing games.';
const corrected='Common video game genres include action, adventure, role-playing, strategy and simulation, while individual games can combine several genres.';
const changedSubject='Photosynthesis converts light energy into chemical energy in plants.';
const definition='In my fictional world, the word Lumora means a glowing blue tree that grows only at night.';
const researchQuotes=[claim,'Video game genres describe interaction conventions, while the same title can combine mechanics from multiple genres.'];
const researchURLs=['https://www.regjeringen.no/en/documents/report-no.-14-to-the-storting-2007-2008/id502808/?ch=2','https://www.acmi.net.au/education/school-program-and-resources/game-guide-analysing-videogames-english-media/game-guide-medium-form-and-conventions/'];
const decision=(category='Video Game Design',topic='Video Game Genres')=>({version:2,relationship:'NEW_MEMORY',operation:'CREATE_NEW',responseAction:'ACKNOWLEDGE',kind:'claim',certainty:'asserted',concept:topic,category,categoryId:'',topic,relatedMemoryId:'',confidence:.96});
function assessment(data){
 const shifted=data.input===changedSubject;
 const d=shifted?decision('Biology','Photosynthesis'):data.input===definition?decision('fictional worldbuilding','Lumora'):decision();
 if(data.input==='That thing handles the usual stuff.')Object.assign(d,{operation:'ASK_FOR_CLARIFICATION',responseAction:'CLARIFY',category:'',topic:'',concept:''});
 return data.correction?{subjectChanged:shifted,decision:d}:{version:3,operations:data.statements.map((_,statement)=>({statement,targetPart:-1,decision:d}))};
}
function searchPayload(){
 let text='';const annotations=[];
 researchQuotes.forEach((quote,index)=>{if(text)text+='\n\n';text+=quote+' ';const start_index=text.length;text+=`[${index+1}]`;annotations.push({type:'url_citation',url:researchURLs[index],title:`Synthetic genre source ${index+1}`,start_index,end_index:text.length});});
 return {id:'resp_synthetic_genres',status:'completed',output:[...researchURLs.map(url=>({type:'web_search_call',status:'completed',action:{type:'search',sources:[{type:'url',url}]}})),{type:'message',status:'completed',content:[{type:'output_text',text,annotations}]}]};
}
const sourceEvaluation=sources=>({claims:sources.map(source=>({sourceId:source.id,quote:source.passages[0],category:'Genre comparison',topic:'Common video game genres',reason:'Synthetic source-supported fixture; not independently verified.',validAt:null})),limitations:['These are explicitly synthetic cited report summaries.'],nextQuestion:null});
module.exports={claim,corrected,changedSubject,definition,decision,assessment,searchPayload,sourceEvaluation};
