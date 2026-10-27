import { validateContext, validateResult, validateTalkResult } from '../training/contract.js';

const messages = { SERVICE_UNAVAILABLE: 'The reasoning service is not configured or its model is unavailable.', RATE_LIMITED: 'Too many requests. Wait a minute before trying again.', EVALUATION_IN_PROGRESS: 'This evaluation is already running. Wait for it to finish.', EVALUATION_TIMEOUT: 'The evaluation timed out. No successful result was recorded.', REQUEST_INVALID: 'The stored context could not be submitted. Refresh and try again.', REQUEST_TOO_LARGE: 'The selected context is too large. Try a shorter problem.' };

// Transport only. Retrieval, validation rules, provider phases and persistence
// remain separate. Only explicit evaluation/Talk commands call this transport.
async function requestService({ id, context, signal }, mode = 'evaluation') {
  validateContext(context);
  if (signal.aborted) throw new DOMException(mode==='talk'?'Talk was cancelled. No Energy was spent.':'Evaluation cancelled', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, 55000);
  try {
    const response = await fetch('/api/mindling/reason', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ id, context, ...(mode==='talk'?{mode:'talk'}:{}) }) });
    const text = await response.text();
    if (text.length > 100000) throw Error('The reasoning service returned an oversized response. No result was saved.');
    let result; try { result = JSON.parse(text); } catch { throw Error('The reasoning service returned an unreadable response. No result was saved.'); }
    if (!response.ok) {
      let message=Object.hasOwn(messages,result?.error?.code)?messages[result.error.code]:mode==='talk'?'Talk could not generate a valid response.':'The service could not complete a valid evaluation. No successful result was recorded.';
      if(mode==='talk')message+=' No Energy was spent.';
      throw Error(message);
    }
    if(mode==='talk')validateTalkResult(result,context);else validateResult(result, context);
    return result;
  } catch (error) {
    if(mode==='talk'&&error.name==='AbortError')throw Error('Talk timed out or was cancelled. No Energy was spent.');
    if(mode==='talk'&&error.message==='Invalid reasoning service data')throw Error('The Talk response could not be validated. No Energy was spent.');
    if (error.name === 'TypeError') throw Error('The reasoning service could not be reached. No result was saved.');
    throw error;
  } finally { clearTimeout(deadline); signal.removeEventListener('abort', abort); }
}

export const requestReasoning = args => requestService(args);
export const requestTalkReasoning = args => requestService(args,'talk');
