import {sentences} from '../learning/text.js';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function sentenceSpans(text){
 let cursor=0;return sentences(text).map(quote=>{const start=text.indexOf(quote,cursor),end=start+quote.length;cursor=end;return {start,end,quote};});
}
export function materialize(value,passage){
 if(!exact(value,['first','last'])||!Number.isSafeInteger(value.first)||!Number.isSafeInteger(value.last)||value.first<0||value.last<value.first)return null;
 const spans=sentenceSpans(passage),first=spans[value.first],last=spans[value.last];if(!first||!last)return null;
 return {start:first.start,end:last.end,quote:passage.slice(first.start,last.end)};
}
