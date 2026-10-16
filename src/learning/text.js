// Lexical features only: no model, inference, dictionary of facts or network access.
export const NATIVE_VERSION = 1;
const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('und', {granularity:'word'}) : null;
const sentenceSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('und', {granularity:'sentence'}) : null;
const functionWords = new Set('a an the is are was were be been being of to in on at for from by with as and or this that these those it its en ett den det de är var och eller att av till på i med som une un le la les des est sont et ou du de dans der die das ein eine ist sind und oder von zu im el los las una es son y o del que'.split(' '));
const negatives = new Set("not no never neither without cannot can't isn't aren't doesn't don't inte ej aldrig ingen utan nicht kein keine niemals nicht pas jamais sans ne non nunca sin não nao sem нет не никогда без 不是 不 没 沒 無 无".split(' '));
export const normalize = value => String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim().replace(/[.!?。！？]+$/u,'').trim();
export function tokenize(value) {
  const text=normalize(value);
  const parts=wordSegmenter ? [...wordSegmenter.segment(text)].filter(part=>part.isWordLike).map(part=>part.segment) : text.match(/[\p{L}\p{M}\p{N}]+(?:['’.,][\p{L}\p{M}\p{N}]+)*/gu)||[];
  return parts.filter(part=>/[\p{L}\p{N}]/u.test(part));
}
export function sentences(value) {
  const text=String(value ?? '').trim();
  return (sentenceSegmenter ? [...sentenceSegmenter.segment(text)].map(part=>part.segment) : text.split(/(?<=[.!?。！？])\s+|\n+/u)).map(part=>part.trim()).filter(Boolean);
}
export function features(value) {
  const tokens=tokenize(value),words=tokens.filter(token=>!functionWords.has(token));
  const terms=[...new Set(words)];
  const grams=tokens.slice(1).map((token,index)=>JSON.stringify([tokens[index],token]));
  // Numbers/operators and explicit negations must never disappear in duplicate matching.
  const quantities=String(value).normalize('NFC').match(/[-+−]?\p{N}+(?:[.,]\p{N}+)*|[<>=≤≥≠%]/gu)||[];
  return {tokens,terms,grams,quantities,anchors:terms.filter(term=>!negatives.has(term)&&!/^\p{N}/u.test(term)),negative:tokens.some(token=>negatives.has(token))};
}
export function overlap(left,right) {
  const a=new Set(left),b=new Set(right);if(!a.size||!b.size)return 0;
  let common=0;for(const item of a)if(b.has(item))common++;
  return common/(a.size+b.size-common);
}
export function validateText(text) {
  if(typeof text!=='string'||text.length>2000||text.trim().length<8||/[\p{Cc}\p{Cf}]/u.test(text.replace(/[\n\r\t]/g,'')))throw Error('Share a short, readable claim. No Energy or XP changed.');
  if(/^https?:\/\/\S+$/iu.test(text.trim()))throw Error('Teach a claim rather than a link. No Energy or XP changed.');
  const f=features(text);
  if(f.tokens.length<3||new Set(f.tokens).size<3||f.terms.length<2||!/[\p{L}]/u.test(text)||/(.)\1{5,}/u.test(text)||new Set(f.tokens).size/f.tokens.length<.25)throw Error('Share a clear claim with several different words. No Energy or XP changed.');
  if(/[?？]\s*$/u.test(text))throw Error('Teach a claim rather than a question. No Energy or XP changed.');
  const parts=sentences(text);
  if(parts.length>8)throw Error('Teach at most eight short sentences at a time. No Energy or XP changed.');
  return {features:f,sentences:parts};
}
