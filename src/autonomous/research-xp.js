import { dailyXPEarned, XP } from '../economy/xp.js';

export const DAILY_RESEARCH_PAUSE = 'DAILY_XP_LIMIT_REACHED';
export const DAILY_RESEARCH_MESSAGE = 'Research paused — Daily XP limit reached.';

export function researchXPTime(app,state=app.state,wallNow=Date.now()){
  // Match each controller's clock without advancing Life or Energy.
  const now=Number.isSafeInteger(state.now)?state.now:wallNow;
  return app.store&&!app.db
    ?now+Math.max(0,wallNow-(Number.isSafeInteger(state.wallAt)?state.wallAt:wallNow))
    :Math.max(now,wallNow);
}

export function researchXPCapped(app,state=app.state){
  return dailyXPEarned(state.mind?.history||[],researchXPTime(app,state))>=XP.daily;
}

export function requireResearchXP(app,state){
  if(researchXPCapped(app,state))throw Object.assign(Error(DAILY_RESEARCH_MESSAGE),{code:DAILY_RESEARCH_PAUSE});
}

// These paths use acquired evidence and cannot dispatch another search.
export const hasAcquiredResearch = task => Boolean(task.pendingEvidence?.length||
  task.pendingSourceEvidence?.signature&&!task.researchExecution?.outcomeUnknown);
