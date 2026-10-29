const labels={
  standings:['Ligatabellen','League standings','the team leading the league standings'],form:['Senaste formen','Recent form','the strongest recent match results'],history:['Historiska meriter','Historical success','historical achievements'],
  performance:['Prestanda','Performance','performance'],cost:['Kostnad','Cost','cost'],reliability:['Tillförlitlighet','Reliability','reliability'],features:['Egenskaper','Features','features'],
  intersection:['Båda begränsningarna','Both geographic constraints','apply both geographic constraints'],comparison:['Jämför områdena','Compare the regions','compare the explicitly mentioned regions'],
  week:['Senaste 7 dagarna','Last 7 days','the last 7 days'],month:['Senaste 30 dagarna','Last 30 days','the last 30 days'],year:['Senaste året','Last year','the last year'],
  research:['Undersök frågan','Research the question','research'],statement:['Ange ett faktapåstående','Provide a factual statement','statement'],
  foundation:['Förklara grunderna','Explain the foundations','foundations'],relationships:['Jämför samband','Compare relationships','relationships']
};
export function clarification(kind,question,field,choices=[],sv=false){
  return {version:1,kind,question,field,options:choices.map(id=>({id,label:labels[id][sv?0:1],value:labels[id][2]})),freeText:choices.length===0};
}
export function validClarification(value){return !!value&&value.version===1&&/^[a-z_-]{1,40}$/.test(value.kind)&&typeof value.question==='string'&&value.question.length<=400&&['metric','regionMode','period','action','detail','focus'].includes(value.field)&&Array.isArray(value.options)&&value.options.length<=4&&value.options.every(option=>/^[a-z_-]{1,32}$/.test(option.id)&&typeof option.label==='string'&&option.label.length<=80&&typeof option.value==='string'&&option.value.length<=160)&&new Set(value.options.map(option=>option.id)).size===value.options.length&&typeof value.freeText==='boolean';}
export function validateAnswers(answers={}){
  const allowed={metric:['standings','form','history','performance','cost','reliability','features'],regionMode:['intersection','comparison'],period:['week','month','year'],action:['research','statement'],focus:['foundation','relationships']};
  if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).some(key=>key!=='detail'&&!Object.hasOwn(allowed,key)))throw Error('Invalid clarification selection.');
  for(const [key,value]of Object.entries(answers))if(key==='detail'?(typeof value!=='string'||!value.trim()||value.length>300||/[\p{Cc}\p{Cf}]/u.test(value)):!allowed[key].includes(value))throw Error('Invalid clarification selection.');
  return answers;
}
export function answerText(answers){return Object.entries(validateAnswers(answers)).map(([key,value])=>key==='detail'?value:labels[value][2]).join('; ');}
