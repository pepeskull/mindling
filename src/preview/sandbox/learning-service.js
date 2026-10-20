import { LEARNING_SERVICE, learningContext, localExactAssessment, validateServiceAssessment } from './learning-assessment.js';

const ENDPOINT = '/api/mindling/learn';

export async function requestLearningAssessment(text, mind, { fetcher = fetch, timeout = 15000 } = {}) {
  const context = learningContext(text, mind), exact = localExactAssessment(text, mind);
  if (exact) return exact;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(ENDPOINT, {
      method:'POST', headers:{ 'Content-Type':'application/json' }, credentials:'same-origin', signal:controller.signal,
      body:JSON.stringify(context)
    });
    if (!response.ok) throw Error(response.status === 429 ? 'Learning service request limit reached. No Energy or XP changed.' : 'Learning service is temporarily unavailable. No Energy or XP changed.');
    const payload = await response.json();
    if (payload?.service !== LEARNING_SERVICE) throw Error('Learning service returned an invalid response. No Energy or XP changed.');
    return validateServiceAssessment(payload.assessment, context);
  } catch (error) {
    if (error?.name === 'AbortError') throw Error('Learning service timed out. No Energy or XP changed.');
    if (error?.message?.endsWith('No Energy or XP changed.')) throw error;
    throw Error('Learning service is temporarily unavailable. No Energy or XP changed.');
  } finally { clearTimeout(timer); }
}
