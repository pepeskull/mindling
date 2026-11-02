// Generated source metadata is not editable claim text. Only strip a prefix
// corroborated by this record's actual source URL and observation timestamp.
function sourcePrefix(memory){
  const r=memory?.research;
  if(!r||typeof r.sourceURL!=='string'||!Number.isSafeInteger(r.observedAt)||r.observedAt<0||!Number.isFinite(new Date(r.observedAt).getTime()))return null;
  return `Source observation (${new Date(r.observedAt).toISOString()}) from ${r.sourceURL}: `;
}
export function editableMemoryText(memory){
  const content=typeof memory?.content==='string'?memory.content:'',prefix=sourcePrefix(memory);
  if(prefix&&content.startsWith(prefix))return content.slice(prefix.length);
  return content;
}
export function submittedCorrectionText(value,memory){
  if(typeof value!=='string')throw Error('Enter a readable correction.');
  const prefix=sourcePrefix(memory);
  return prefix&&memory.content.startsWith(prefix)&&value.startsWith(prefix)?value.slice(prefix.length):value;
}
// Prose layout whitespace is presentation. Quoted literals, code, indentation,
// lists and tables may carry meaning and are compared conservatively instead.
export function correctionComparison(value){
  const text=String(value).replace(/\r\n?/g,'\n');
  if(/```|~~~|\n(?:\t| {2,}\S)|(?:^|\n)(?:[#>|*-]\s|\d+[.)]\s)|<\/?[A-Za-z]|\|/u.test(text))return text.replace(/^\n+|\n+$/g,'');
  let result='',quote=null,escaped=false,space=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quote){result+=char;if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote=null;continue;}
    if(/\s/u.test(char)){space=true;continue;}
    if(space&&result)result+=' ';space=false;result+=char;
    if(['"',"'",'`'].includes(char)&&!(char==="'"&&/[\p{L}\p{N}]/u.test(text[i-1]||'')&&/[\p{L}\p{N}]/u.test(text[i+1]||'')))quote=char;
  }
  return result;
}
export const unchangedCorrection=(text,memory)=>correctionComparison(submittedCorrectionText(text,memory))===correctionComparison(editableMemoryText(memory));
