import { editableMemoryText } from '../learning/correction-content.js';
// Analysis-only projection. Exact source-prefix recognition is shared with the
// correction boundary; never infer provenance from a URL-shaped string alone.
export function semanticText(memory){
  const raw=typeof memory?.content==='string'?memory.content:'';
  if(raw.length>2000)return {text:'',reason:'TEXT_LIMIT'};
  let text=editableMemoryText(memory);
  if(/^Source observation \(/u.test(raw)&&text===raw)return {text:'',reason:'WRAPPER_UNRECOGNIZED'};
  // Paired, bounded emphasis only. Words, qualifiers and punctuation stay intact.
  // Links, code, unmatched delimiters and embedded underscores are not stripped.
  text=text.replace(/\*\*([^*\n]{1,700})\*\*/gu,'$1').replace(/(?<![\p{L}\p{N}_])__([^_\n]{1,700})__(?![\p{L}\p{N}_])/gu,'$1');
  text=text.replace(/(?<![\p{L}\p{N}*])\*([^*\n]{1,700})\*(?![\p{L}\p{N}*])/gu,'$1').replace(/(?<![\p{L}\p{N}_])_([^_\n]{1,700})_(?![\p{L}\p{N}_])/gu,'$1');
  return {text,reason:null};
}
