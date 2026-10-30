// Explicit calendar dates in cited report passages. Never infer a date from
// retrieval time, a season label, a URL, "today", or a neighbouring citation.
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const swedish=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const calendar=(year,month,day)=>{
  const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,at=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===date?date:null;
};
export function explicitDates(text){
  const dates=new Set();
  for(const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)){const date=calendar(match[1],Number(match[2]),Number(match[3]));if(date)dates.add(date);}
  const monthNumber=name=>{const key=name.toLowerCase().replace(/\.$/,'');let i=months.findIndex(month=>month===key||month.slice(0,3)===key);if(i<0)i=swedish.findIndex(month=>month===key||month.slice(0,3)===key);return i+1;};
  for(const match of text.matchAll(/\b(\d{1,2})\s+([a-zåäö]+\.?),?\s+(\d{4})\b/giu)){const month=monthNumber(match[2]),date=month&&calendar(match[3],month,Number(match[1]));if(date)dates.add(date);}
  for(const match of text.matchAll(/\b([a-z]+\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/giu)){const month=monthNumber(match[1]),date=month&&calendar(match[3],month,Number(match[2]));if(date)dates.add(date);}
  return dates;
}
export const citedPassages=source=>source.passages||[source.text];
export function asOfDates(passage){
  const dates=new Set();
  for(const match of passage.matchAll(/\b(?:as of|as at|updated(?: on)?|standings on|data as (?:of|at)|valid on|uppdaterad|gäller(?: den)?)\s*:?\s*/giu)){
    const context=passage.slice(match.index+match[0].length,match.index+match[0].length+40);
    const token=context.match(/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-zåäö]+\.?,?\s+\d{4}|[a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/iu)?.[0];
    if(token)for(const date of explicitDates(token))dates.add(date);
  }return dates;
}
export const supportsClaimDate=(source,quote,date)=>citedPassages(source).some(passage=>passage.includes(quote)&&asOfDates(passage).has(date));
