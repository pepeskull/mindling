import { validateLearningDiagnostic, learningFailureMessage } from '../../learning/learning-diagnostics.js';
import { LEARNING_SERVICE, learningContext, localExactAssessment, validateServiceAssessment } from './learning-assessment.js';

const ENDPOINT = '/api/mindling/learn';

export async function requestLearningAssessment(text, mind, { fetcher = fetch, timeout = 15000 } = {}) {
  const context = learningContext(text, mind), exact = localExactAssessment(text, mind);
  if (exact) return {version:2,relationship:'SAME_MEMORY',operation:'REINFORCE_EXISTING',responseAction:'ACKNOWLEDGE',kind:context.candidates.find(m=>m.id===exact.relatedMemoryId)?.kind||'claim',certainty:'asserted',concept:'',category:'',categoryId:'',topic:'',relatedMemoryId:exact.relatedMemoryId,confidence:1};
  const correlationId=crypto.randomUUID();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(ENDPOINT, {
      method:'POST', headers:{ 'Content-Type':'application/json','X-Mindling-Request-Id':correlationId }, credentials:'same-origin', signal:controller.signal,
      body:JSON.stringify(context)
    });
    const payload = await response.json();
    if (!response.ok){
      if(payload?.service===LEARNING_SERVICE&&payload.diagnostic){
        const diagnostic=validateLearningDiagnostic(payload.diagnostic);
        if(diagnostic.correlationId!==correlationId)throw Error('Learning service returned an unrelated diagnostic. No Energy or XP changed.');
        const failure=Error(learningFailureMessage(diagnostic));failure.code=payload.error?.code;failure.diagnostic=diagnostic;throw failure;
      }
      throw Error(response.status === 429 ? 'Learning service request limit reached. No Energy or XP changed.' : 'Learning service is temporarily unavailable. No Energy or XP changed.');
    }
    if (payload?.service !== LEARNING_SERVICE) throw Error('Learning service returned an invalid response. No Energy or XP changed.');
    return validateServiceAssessment(payload.assessment, context);
  } catch (error) {
    if (error?.name === 'AbortError') throw Error('Learning service timed out. No Energy or XP changed.');
    if (error?.message?.endsWith('No Energy or XP changed.')) throw error;
    throw Error('Learning service is temporarily unavailable. No Energy or XP changed.');
  } finally { clearTimeout(timer); }
}
