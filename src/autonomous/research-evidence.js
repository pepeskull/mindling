import { supportsClaimDate } from './evidence-dates.js';
import { sourceScopeMatches } from './research-sources.js';
import { understandInput } from '../learning/input-understanding.js';
export const REJECTION_REASONS=Object.freeze({
  NO_CITED_PASSAGES:'No usable cited report passages were returned.',
  NO_MODEL_CANDIDATES:'The evidence assessment proposed no supported factual claims.',
  MISSING_AS_OF_DATE:'A current fact needs an explicit as-of date in its cited passage; a season or retrieval date is insufficient.',
  UNSUPPORTED_AS_OF_DATE:'The proposed as-of date is not supported by the same cited passage as this claim.',
  STALE_AS_OF_DATE:'The supported as-of date is outside the current two-day freshness window.',
  SCOPE_MISMATCH:'The claim does not satisfy the original geographic or exclusion constraints.',
  NON_FACTUAL_CLAIM:'The proposed passage is a question or instruction rather than a factual teaching claim.',
  EXCLUDED_BY_USER:'This exact learned claim was removed or corrected by the user.',
  CANONICAL_CONFLICT:'The claim conflicts with current stored knowledge; no automatic replacement was made.',
  CANONICAL_DUPLICATE_OR_UNCERTAIN:'Canonical checks could not safely establish a distinct new claim.',
  CANONICAL_VALIDATION:'Canonical memory validation did not accept the proposed claim.'
});
export function evidenceRejection(claim,source,task,now){
  if(!sourceScopeMatches(claim.quote,task.scope))return 'SCOPE_MISMATCH';
  if(understandInput(claim.quote,'TEACH').intent!=='FACT_TEACHING')return 'NON_FACTUAL_CLAIM';
  if(task.timeSensitive){
    if(claim.validAt===null)return 'MISSING_AS_OF_DATE';
    if(!supportsClaimDate(source,claim.quote,claim.validAt))return 'UNSUPPORTED_AS_OF_DATE';
    const at=Date.parse(claim.validAt+'T00:00:00Z');if(!Number.isFinite(at)||at>now||now-at>2*86400000)return 'STALE_AS_OF_DATE';
  }
  return null;
}
export function canonicalRejection(error){
  return /conflict/i.test(error.message)?'CANONICAL_CONFLICT':/repeat|duplicate|distinct/i.test(error.message)?'CANONICAL_DUPLICATE_OR_UNCERTAIN':'CANONICAL_VALIDATION';
}
export const rejectionExplanation=code=>REJECTION_REASONS[code]||'The evidence did not pass the existing knowledge safeguards.';
