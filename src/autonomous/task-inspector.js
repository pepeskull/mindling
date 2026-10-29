import { taskProgress, taskStatusLabel } from './tasks.js';
import { memoryNodeId } from '../memory/graph-data.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export function renderTaskInspector(host,node,{onAction=null,refresh=()=>{},memories=[]}={}){
  const task=node.task,legacy=task.engineVersion!==2,active=!['COMPLETED','CANCELLED','FAILED'].includes(task.status),status=el('p',undefined,'learning-task-feedback');status.setAttribute('role','status');
  const actionButton=(label,action)=>{const button=el('button',label,'related-memory-button');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await onAction(action,task.id);refresh();}catch(error){status.textContent=error.message||'Research unavailable.';}finally{button.disabled=false;}});host.append(button);};
  host.append(el('span',`${task.mode.replaceAll('_',' ')} · ${taskStatusLabel(task)}`,'memory-status-chip research-status'),el('p',task.objective,'inspector-memory-text'));
  const progress=el('progress');progress.max=1;progress.value=taskProgress(task);progress.setAttribute('aria-label','Task work completed, not knowledge mastery');
  const preparation=['understanding','retrieval','plan'].filter(unit=>task.completedWork.includes(unit)).length,acquired=memories.filter(memory=>!memory.historical&&task.knowledgeIds.includes(memory.recordId)&&memory.raw.research?.taskId===task.id).length;
  host.append(progress,el('p',`Task progress: ${task.completedWork.length} / 7 steps (${Math.round(taskProgress(task)*100)}%)`),el('p',`Task preparation: ${preparation} / 3 steps · Research sources retrieved: ${task.sourceReferences.filter(source=>source.hash&&source.observedAt).length} · New knowledge acquired: ${acquired} ${acquired===1?'memory':'memories'}`));
  host.append(el('p',legacy&&active?'Historical task. Its former research workflow is unavailable. Saved sources and knowledge remain intact.':task.message));
  host.append(el('h4',task.plannedAt?'Mindling research plan':'Research plan'));const plan=el('ul');for(const item of task.plan)plan.append(el('li',item));host.append(plan);
  host.append(el('p','Proposed steps are separate from completed research. The connected AI can plan but has no search or source-retrieval tools. No source or knowledge step is completed without evidence.','memory-content-status'));
  if(task.sourceReferences.length){const sources=el('details');sources.append(el('summary','Saved sources'));for(const source of task.sourceReferences){const p=el('p'),link=el('a',source.title||source.url);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);if(source.observedAt)p.append(el('span',` · Retrieved ${new Date(source.observedAt).toLocaleString()}`));if(source.revisionAt)p.append(el('span',` · Page revision ${new Date(source.revisionAt).toLocaleDateString()} (not a fact-validity date)`));sources.append(p);}host.append(sources);}
  task.knowledgeIds.forEach((id,index)=>{const button=el('button',`View retained source excerpt ${index+1}`,'related-memory-button');button.type='button';button.dataset.selectMemory=memoryNodeId(id);host.append(button);});host.append(status);
  if(!onAction){host.append(el('p','This saved view is read-only.','memory-content-status'));return;}
  if(!active)return;
  if(['CLARIFICATION','MODEL_CLARIFICATION'].includes(task.code))actionButton('Clarify request','clarify');
  else if(legacy)actionButton('Continue with Mindling planning','continue');
  else if(['INTERRUPTED','PLANNING_UNAVAILABLE'].includes(task.code)&&task.attempts<2)actionButton('Retry interrupted planning','retry');
  actionButton('Cancel task','cancel');
}
