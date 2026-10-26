import { RULES, DAY } from '../preview/sandbox/engine.js';
import { STAGES } from '../preview/evolution-model.js';

// Read-only display; eligibility is applied only by the persistence transaction.
export function evolutionProgress(mind, now) {
  if(!mind||!Number.isInteger(mind.stage))return null;
  const stage=STAGES[mind.stage-1],rule=RULES[mind.stage-1];
  const elapsed=Math.max(0,now-mind.enteredAt),milestones=new Set(mind.milestones||[]).size;
  const missing=[];
  if(mind.life?.lifeState!=='ALIVE')missing.push('a living Mindling');
  if(mind.stageXP<rule.xp)missing.push('stage XP');
  if(milestones<rule.concepts)missing.push('unique milestones');
  if(elapsed<rule.days*DAY)missing.push('minimum duration');
  return {stage:mind.stage,title:`Stage ${mind.stage} — ${stage.name}`,
    xp:`${mind.stageXP} / ${rule.xp} XP`,milestones:`${milestones} / ${rule.concepts} unique milestones`,
    duration:`${(elapsed/3600000).toFixed(1)}h / ${rule.days*24}h minimum duration`,
    status:mind.stage===7?'Final stage reached':`Automatic evolution ${missing.length?'pending: '+missing.join(', '):'on reconciliation'}`};
}
export function renderEvolutionProgress(root, mind, now) {
  if(!root)return;
  const progress=evolutionProgress(mind,now);root.hidden=!progress;
  if(!progress)return;
  if(root.dataset.identity!==mind.id)delete root.dataset.completed;
  const previous=root.dataset.identity===mind.id?Number(root.dataset.stage):null;
  const evolved=previous&&progress.stage>previous;
  root.dataset.identity=mind.id;root.dataset.stage=String(progress.stage);
  if(evolved){root.dataset.completed=String(now);if(!matchMedia('(prefers-reduced-motion: reduce)').matches)root.animate([{opacity:.4},{opacity:1}],{duration:900});}
  root.replaceChildren();
  for(const text of [progress.title,...(progress.stage<7?[progress.xp,progress.milestones,progress.duration]:[]),progress.status]){const p=document.createElement('p');p.textContent=text;root.append(p);}
  if(root.dataset.completed&&now-Number(root.dataset.completed)<15000){const p=document.createElement('p');p.textContent=`Evolution complete — ${STAGES[mind.stage-1].name}`;p.setAttribute('role','status');root.prepend(p);}
}
