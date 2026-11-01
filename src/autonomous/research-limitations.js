// Limitations are human-readable qualifications, not canonical source quotes.
// Keep the original string: no trimming, collapsing, truncation or Unicode edits.
export const limitationSchema=Object.freeze({type:'string',minLength:1,maxLength:240,pattern:'\\S'});
export function limitationFailureFor(value,index){
  const characters=typeof value==='string'?[...value].length:null;
  const rule=typeof value!=='string'?'NOT_A_STRING':!value.trim()?'BLANK':characters>240?'TOO_LONG':/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value.replace(/[\t\r\n]/g,''))?'UNSAFE_CHARACTERS':null;
  return rule?{index,rule,characters}:null;
}
export function validateLimitationFailure(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='characters,index,rule'||!Number.isSafeInteger(value.index)||value.index<0||value.index>2||!['NOT_A_STRING','BLANK','TOO_LONG','UNSAFE_CHARACTERS'].includes(value.rule)||!(value.characters===null&&value.rule==='NOT_A_STRING'||Number.isSafeInteger(value.characters)&&value.characters>=0&&value.characters<=24000&&value.rule!=='NOT_A_STRING'))throw Error('Invalid limitation diagnostic');
  return value;
}
