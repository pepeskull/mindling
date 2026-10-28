import { taskProgress } from './tasks.js';
import { memoryNodeId } from '../memory/graph-data.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export function renderTaskInspector(host,node,{onAction=null,refresh=()=>{}}={}){
  const task=node.task;
  host.append(el('span',`${task.mode.replaceAll('_',' ')} · ${task.status}`,'memory-status-chip research-status'),el('p',task.objective,'inspector-memory-text'));
  const progress=el('progress');progress.max=1;progress.value=taskProgress(task);progress.setAttribute('aria-label','Completed learning-task work, not topic mastery');host.append(progress,el('p',`${task.completedWork.length} of 7 work units completed · ${Math.round(taskProgress(task)*100)}%`),el('p',task.message));
  if(['PREPARED','QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status))host.append(el('p','If interrupted, work stays paused until you explicitly authorize a retry. Nothing runs while the browser is closed.','memory-content-status'));
  host.append(el('h4','Research plan'));const plan=el('ul');for(const item of task.plan)plan.append(el('li',item));host.append(plan);
  host.append(el('p','Local interpretation preserves uncertain grammar and wording. Progress describes this bounded task, not mastery. Source excerpts remain attributed claims; they are not independently verified.','memory-content-status'));
  if(task.sourceReferences.length){host.append(el('h4','Authorized sources'));for(const source of task.sourceReferences){const p=el('p'),link=el('a',source.url);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);if(source.observedAt)p.append(el('span',` · Retrieved ${new Date(source.observedAt).toLocaleString()}`));host.append(p);}}
  if(task.knowledgeIds.length){host.append(el('p',`${task.knowledgeIds.length} retained canonical knowledge references. Research tasks themselves do not count as memories.`));task.knowledgeIds.forEach((id,index)=>{const button=el('button',`View retained source excerpt ${index+1}`,'related-memory-button');button.type='button';button.dataset.selectMemory=memoryNodeId(id);host.append(button);});}
  const status=el('p',undefined,'learning-task-feedback');status.setAttribute('role','status');host.append(status);
  if(!onAction){host.append(el('p','This saved view is read-only.','memory-content-status'));return;}
  if(['COMPLETED','CANCELLED'].includes(task.status))return;
  if(task.code!=='CLARIFICATION'){
    const label=el('label',task.mode==='DEEP'?'Public document URLs · up to two, one per line':'Public document URL','learning-source-label'),input=el(task.mode==='DEEP'?'textarea':'input');if(input.tagName==='INPUT')input.type='url';else input.rows=2;input.maxLength=task.mode==='DEEP'?1001:500;input.placeholder='https://…';input.value=task.sourceReferences.at(-1)?.url||'';label.append(input);host.append(label);
    const consent=el('p',task.mode==='TALK_RESEARCH'?'Authorize a public plain-text or Markdown document readable in this browser. This task adds no charge beyond the accepted Talk. Research awards 0 XP.':`Authorize a public plain-text or Markdown document readable in this browser. Accepting new knowledge uses the existing ${task.mode==='DEEP'?'3':'2'} Energy activity cost once. Reads and retries have no extra cost. Research awards 0 XP.`,'memory-content-status');host.append(consent);
    const authorize=el('button','Authorize document & research','related-memory-button');authorize.type='button';
    authorize.addEventListener('click',async()=>{
      if(!input.value||!input.reportValidity())return;
      if(!confirm('Allow this task to read the specified public documents and retain relevant, source-attributed knowledge? No private memories are sent to the document hosts.'))return;
      authorize.disabled=true;status.textContent='Checking authorized source.';
      try{await onAction('authorize',task.id,input.value);refresh();}catch(error){status.textContent=error.message||'Research unavailable.';}finally{authorize.disabled=false;}
    });host.append(authorize);
  }
  const cancel=el('button','Cancel learning task','related-memory-button');cancel.type='button';cancel.addEventListener('click',async()=>{cancel.disabled=true;try{await onAction('cancel',task.id);refresh();}catch(error){status.textContent=error.message;}finally{cancel.disabled=false;}});host.append(cancel);
}
