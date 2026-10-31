import { rejectionExplanation } from './research-evidence.js';
import { taskProgress, taskStatusLabel } from './tasks.js';
import { memoryNodeId } from '../memory/graph-data.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export function renderTaskInspector(host,node,{onAction=null,refresh=()=>{},memories=[]}={}){
  const task=node.task,legacy=task.engineVersion!==4,active=!['COMPLETED','CANCELLED','FAILED'].includes(task.status),status=el('p',undefined,'learning-task-feedback');status.setAttribute('role','status');
  const actionButton=(label,action)=>{const button=el('button',label,'related-memory-button');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await onAction(action,task.id);refresh();}catch(error){status.textContent=error.message||'Research unavailable.';}finally{button.disabled=false;}});host.append(button);};
  host.append(el('span',`${task.mode.replaceAll('_',' ')} · ${taskStatusLabel(task)}`,'memory-status-chip research-status'),el('p',task.objective,'inspector-memory-text'));
  const progress=el('progress');progress.max=1;progress.value=taskProgress(task);progress.setAttribute('aria-label','Task work completed, not knowledge mastery');
  const preparation=['understanding','retrieval','plan'].filter(unit=>task.completedWork.includes(unit)).length,acquired=memories.filter(memory=>!memory.historical&&task.knowledgeIds.includes(memory.recordId)&&memory.raw.research?.taskId===task.id).length;
  host.append(progress,el('p',`Task progress: ${task.completedWork.length} / 7 steps (${Math.round(taskProgress(task)*100)}%)`),el('p',`Task preparation: ${preparation} / 3 steps · ${task.engineVersion===4?'Cited web sources':'Research sources retrieved'}: ${task.sourceReferences.filter(source=>source.hash&&source.observedAt).length} · New knowledge acquired: ${acquired} ${acquired===1?'memory':'memories'}`));
  if(task.engineVersion===4)host.append(el('p',`Hosted tool calls completed: ${task.completedToolCalls||0} · Tool budget reserved: ${task.sourceRequests} / 2`,'memory-content-status'));
  if(task.engineVersion===4)host.append(el('p','Reserved tool budget is a pre-request ceiling, not the number of completed or billed calls. Unknown interrupted work stays reserved.','memory-content-status'));
  if(task.researchExecution){const e=task.researchExecution;host.append(el('p',`Hosted work: ${e.toolState.replaceAll('_',' ').toLowerCase()} · Reserved: ${e.reserved} · Completed: ${e.completed} · Failed: ${e.failed} · Outcome unknown: ${e.outcomeUnknown?'yes':'no'}`,'memory-content-status'));}
  if(task.serviceDiagnostic){const d=task.serviceDiagnostic;host.append(el('p',`Request reference: ${d.correlationId} · Phase: ${d.phase} · Endpoint: ${d.endpoint||'not dispatched'} · Upstream HTTP: ${d.upstreamStatus??'unknown'} · Detail: ${d.detail}`,'memory-content-status'));}
  if(task.pendingSourceEvidence)host.append(el('p','Signed source evidence is saved. Only its analysis can resume within the remaining budget; no new search is authorized.','memory-content-status'));
  if(task.discoveryQueries)host.append(el('p',`Search queries completed: ${task.completedQueries||0} · Query budget used: ${task.discoveryQueries} / 2`,'memory-content-status'));
  host.append(el('p',legacy&&active?'Historical task. Its former research workflow is unavailable. Saved sources and knowledge remain intact.':task.message));
  if(task.limitations?.length){host.append(el('h4','Evidence limitations'));for(const limitation of task.limitations)host.append(el('p',limitation,'memory-content-status'));}
  const diagnostics=task.evidenceDiagnostics;
  if(diagnostics){host.append(el('p',`Proposed claims: ${diagnostics.candidates} · Passed evidence checks: ${diagnostics.accepted}`,'memory-content-status'));const extraction=diagnostics.extraction;if(extraction)host.append(el('p',`Tool source URLs: ${extraction.toolSourceURLs} · URL citations: ${extraction.citationsSeen} · Retained cited passages: ${extraction.retainedPassages}`,'memory-content-status'));if(extraction?.dropped)for(const [reason,count]of Object.entries(extraction.dropped))host.append(el('p',`${count} citation(s) not retained: ${reason.replaceAll('_',' ').toLowerCase()}.`,'memory-content-status'));}
  for(const rejection of [...(diagnostics?.rejections||[]),...(task.memoryRejections||[])])host.append(el('p',rejectionExplanation(rejection.code),'memory-content-status'));
  if(task.lastFailureCode)host.append(el('p',`Service diagnostic: ${task.lastFailureCode}${task.lastFailurePhase?' · '+task.lastFailurePhase:''}`,'memory-content-status'));
  if(task.retrievalFailures?.length)for(const failure of task.retrievalFailures)host.append(el('p',`${failure.sourceId}: ${failure.reason}`,'memory-content-status'));
  host.append(el('h4',task.plannedAt?'Mindling research plan':'Research plan'));const plan=el('ul');for(const item of task.plan)plan.append(el('li',item));host.append(plan);
  host.append(el('p','Proposed steps are separate from completed research. Hosted web search supplies cited summaries, not raw page quotations or independent fact verification. No source or knowledge step is completed without evidence.','memory-content-status'));
  if(task.sourceReferences.length){const sources=el('details');sources.append(el('summary','Saved sources'));for(const source of task.sourceReferences){const p=el('p'),link=el('a',source.title||source.url);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);if(source.journal)p.append(el('span',` · Journal: ${source.journal}`));if(source.publisher)p.append(el('span',` · ${source.publisher}`));if(source.publishedAt)p.append(el('span',` · Published ${source.publishedAt}`));if(source.status)p.append(el('span',` · ${source.status}`));if(source.type)p.append(el('span',` · ${source.type}`));if(source.observedAt)p.append(el('span',` · Retrieved ${new Date(source.observedAt).toLocaleString()}`));if(source.revisionAt)p.append(el('span',` · Page revision ${new Date(source.revisionAt).toLocaleDateString()} (not a fact-validity date)`));sources.append(p);}host.append(sources);}
  task.knowledgeIds.forEach((id,index)=>{const button=el('button',`View retained ${task.engineVersion===4?'research claim':'source excerpt'} ${index+1}`,'related-memory-button');button.type='button';button.dataset.selectMemory=memoryNodeId(id);host.append(button);});host.append(status);
  if(!onAction){host.append(el('p','This saved view is read-only.','memory-content-status'));return;}
  for(const id of task.knowledgeIds){
    const record=memories.find(memory=>memory.recordId===id&&!memory.historical&&memory.raw.research?.taskId===task.id);if(!record)continue;
    const section=el('details');section.append(el('summary','Manage retained knowledge'));
    const text=el('textarea');text.maxLength=2000;text.value=record.raw.research.evidenceText||record.raw.content;text.setAttribute('aria-label','Correct this learned claim');
    section.append(text,el('p','Corrections use normal Teach costs and are stored as user-provided claims. Removing knowledge preserves historical source/task records.','memory-content-status'));
    for(const [action,label]of [['correct-memory','Save correction'],['forget-memory','Remove learned memory']]){const button=el('button',label,'related-memory-button');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{const result=await onAction(action,task.id,{memoryId:id,text:text.value});status.textContent=result.message;refresh();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});section.append(button);}host.append(section);
  }
  if(!active)return;
  if(['CLARIFICATION','MODEL_CLARIFICATION'].includes(task.code))actionButton('Clarify request','clarify');
  else if(legacy)host.append(el('p','Submit the topic again to start research with the current information tool.','memory-content-status'));
  else if(['INTERRUPTED','PLANNING_UNAVAILABLE','INFORMATION_UNCONFIGURED'].includes(task.code)&&task.attempts<2)actionButton('Retry interrupted planning','retry');
  actionButton('Cancel task','cancel');
}
