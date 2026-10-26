// Capture provenance concerns text preservation, never factual verification.
export const LEARNING_INPUT_LIMIT = 2000;
export function capturedContent(content) {
  if (typeof content !== 'string' || !content.trim() || content.length > LEARNING_INPUT_LIMIT) throw Error('Use at most 2,000 characters. Your text has not been submitted.');
  return { version: 1, status: 'captured', length: content.length };
}
export function sourceStatus(memory) {
  if (memory?.complete === false || memory?.contentIntegrity?.status === 'incomplete') return 'incomplete';
  const marker = memory?.contentIntegrity;
  if (marker?.version === 1 && marker.status === 'captured') return typeof memory.content === 'string' && marker.length === memory.content.length ? 'captured' : 'incomplete';
  // Length, punctuation and model opinions cannot establish prior data loss.
  return 'unknown';
}
export function sourceDescription(memory) {
  const status = sourceStatus(memory);
  return status === 'captured' ? 'Full stored text shown. Capture recorded without shortening.' : status === 'incomplete' ? 'Full stored text shown. This record is marked incomplete; missing text is not recoverable here.' : 'Full stored text shown. Original capture completeness is unknown for this legacy record.';
}
export function excerptDescription(memory) {
  const integrity = memory.integrity;
  const excerpt = integrity ? integrity.excerptTruncated ? `Shortened retrieval excerpt: ${integrity.excerptLength} of ${integrity.sourceLength} stored characters.` : 'Entire stored text supplied; no retrieval shortening.' : memory.complete ? 'Entire stored text supplied; no retrieval shortening.' : 'Intentionally shortened retrieval excerpt.';
  const status = integrity?.sourceStatus || 'unknown';
  return `${excerpt} ${status === 'captured' ? 'Original capture recorded.' : status === 'incomplete' ? 'Stored source is marked incomplete.' : 'Original capture completeness is unknown; this alone does not prove truncation.'}`;
}
