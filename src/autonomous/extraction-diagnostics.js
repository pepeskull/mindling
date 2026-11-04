// Only bounded aggregate counts; no text, URLs, prompts or provider payloads.
export const EXTRACTION_COUNTS=['toolSourceURLs','completedMessages','reportParts','citationsSeen','retainedPassages'];
export const EXTRACTION_REASONS=['NO_COMPLETED_REPORT','NO_CITATIONS','INVALID_REPORT','INVALID_CITATION_RANGE','OVERLAPPING_CITATIONS','MISSING_URL','UNSAFE_URL','NOT_IN_TOOL_SOURCES','TITLE_FALLBACK','INVALID_TITLE','UNUSABLE_PASSAGE','PASSAGE_LIMIT','SOURCE_LIMIT','NO_USABLE_EVIDENCE'];
export function validateExtractionDiagnostics(value){
  const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=196608;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>![...EXTRACTION_COUNTS,'dropped'].includes(k))||EXTRACTION_COUNTS.some(k=>!count(value[k]))||!value.dropped||typeof value.dropped!=='object'||Array.isArray(value.dropped)||Object.entries(value.dropped).some(([k,n])=>!EXTRACTION_REASONS.includes(k)||!count(n)))throw Error('Invalid extraction diagnostic');
  return value;
}
