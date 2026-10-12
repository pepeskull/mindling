import { validateAssessment } from './engine.js';
export async function analyzeLearning({text,pathway,token,signal,fetcher=fetch}) {
  if(!token)throw Error('Gemini unavailable: enter a preview access token in diagnostics.');
  let response;try{response=await fetcher('/api/preview-learning',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({text,pathway}),signal});}catch{throw Error('Gemini request failed. No Energy or XP changed.');}
  if(!response.ok){const body=await response.json().catch(()=>({}));const messages={GEMINI_NOT_CONFIGURED:'Gemini is not configured on this deployment.',PREVIEW_ACCESS_REQUIRED:'Preview access token or allowed origin is invalid.',RATE_LIMITED:'Gemini request limit reached. Try later.',RATE_LIMIT_UNAVAILABLE:'Gemini abuse controls are unavailable.'};throw Error(messages[body.error]||'Gemini analysis failed. No Energy or XP changed.');}
  const result=await response.json();validateAssessment(result.assessment);return result.assessment;
}
