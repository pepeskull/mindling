import { taskProgress, taskStatusLabel } from './tasks.js';
import { memoryNodeId } from '../memory/graph-data.js';
import { DISCOVERY_PROVIDERS } from './source-discovery.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export function renderTaskInspector(host,node,{onAction=null,refresh=()=>{},permissions={mode:'disabled',providers:[]},memories=[]}={}){
  const task=node.task,active=!['COMPLETED','CANCELLED'].includes(task.status),status=el('p',undefined,'learning-task-feedback');status.setAttribute('role','status');
  const actionButton=(label,action,payload='',target=host)=>{const button=el('button',label,'related-memory-button');button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await onAction(action,task.id,typeof payload==='function'?payload():payload);refresh();}catch(error){status.textContent=error.message||'Research unavailable.';}finally{button.disabled=false;}});target.append(button);return button;};
  host.append(el('span',`${task.mode.replaceAll('_',' ')} · ${taskStatusLabel(task)}`,'memory-status-chip research-status'),el('p',task.objective,'inspector-memory-text'));
  const progress=el('progress');progress.max=1;progress.value=taskProgress(task);progress.setAttribute('aria-label','Task work completed, not knowledge mastery');
  const preparation=['understanding','retrieval','plan'].filter(unit=>task.completedWork.includes(unit)).length;
  const acquired=memories.filter(memory=>!memory.historical&&task.knowledgeIds.includes(memory.recordId)&&memory.raw.research?.taskId===task.id).length;
  host.append(progress,el('p',`Task progress: ${task.completedWork.length} / 7 steps (${Math.round(taskProgress(task)*100)}%)`),el('p',`Task preparation: ${preparation} / 3 steps · Research sources retrieved: ${task.sourceReferences.filter(source=>source.hash&&source.observedAt).length} · New knowledge acquired: ${acquired} ${acquired===1?'memory':'memories'}`),el('p',task.message));
  if(task.discoveryQueries)host.append(el('p',`Discovery queries: ${task.discoveryQueries} · Source candidates: ${task.discoveryCandidates?.length||0}`,'memory-content-status'));
  host.append(el('h4','Research plan'));const plan=el('ul');for(const item of task.plan)plan.append(el('li',item));host.append(plan);
  host.append(el('p','Preparation and task progress are separate from acquired knowledge. Excerpts remain attributed claims, not independently verified facts. Nothing runs while this page is closed.','memory-content-status'));
  if(task.sourceReferences.length){const sources=el('details');sources.append(el('summary','View sources'));for(const source of task.sourceReferences){const p=el('p'),link=el('a',source.title||source.url);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);if(source.observedAt)p.append(el('span',` · Retrieved ${new Date(source.observedAt).toLocaleString()}`));if(source.provider){const license=el('a',' · Wikipedia text license');license.href='https://creativecommons.org/licenses/by-sa/4.0/';license.target='_blank';license.rel='noopener noreferrer';p.append(license);}if(source.revisionAt)p.append(el('span',` · Page revision ${new Date(source.revisionAt).toLocaleDateString()} (not a fact-validity date)`));sources.append(p);}host.append(sources);}
  task.knowledgeIds.forEach((id,index)=>{const button=el('button',`View retained source excerpt ${index+1}`,'related-memory-button');button.type='button';button.dataset.selectMemory=memoryNodeId(id);host.append(button);});host.append(status);
  if(!onAction){host.append(el('p','This saved view is read-only.','memory-content-status'));return;}
  const settings=el('details',undefined,'research-permissions');settings.append(el('summary','Manage research permissions'));
  settings.append(el('p','Approved providers receive only a minimal public search topic and network metadata. Private memories, identity keys and wallet information are never included. Approval applies to this Mindling in this browser.','memory-content-status'));
  const mode=el('select');mode.setAttribute('aria-label','Research access policy');for(const [value,label]of [['disabled','Disable research access'],['ask','Ask before a new provider'],['automatic','Automatic research with approved providers']]){const option=el('option',label);option.value=value;mode.append(option);}mode.value=permissions.mode;settings.append(mode);
  const providerInputs=[];
  for(const provider of DISCOVERY_PROVIDERS){const label=el('label',undefined,'research-provider'),input=el('input');input.type='checkbox';input.checked=permissions.providers.includes(provider.id);providerInputs.push([provider.id,input]);label.append(input,document.createTextNode(provider.name));settings.append(label,el('p',provider.coverage,'memory-content-status'));}
  actionButton('Save research permissions','permissions',()=>({mode:mode.value,providers:providerInputs.filter(([,input])=>input.checked).map(([id])=>id)}),settings);host.append(settings);
  if(!active)return;
  if(task.code==='CLARIFICATION')actionButton('Clarify request','clarify');
  else{
    if(task.code==='QUERY_CONFIRMATION'){
      const label=el('label','Public topic to share (no personal identifiers)','learning-source-label'),input=el('input');input.maxLength=120;label.append(input);host.append(label);
      const button=actionButton('Confirm public topic & research','start',()=>{if(!input.value.trim()||!confirm('Share only this public topic with your approved reference provider?'))throw Error('Public topic confirmation is required.');return {publicQuery:input.value};});button.disabled=permissions.mode==='disabled';
    }else{const button=actionButton(task.attempts?'Retry research':'Start research','start');button.disabled=permissions.mode==='disabled';}
    if(['QUEUED','RESEARCHING','EVALUATING','COMMITTING'].includes(task.status))actionButton('Pause research','pause');
    const advanced=el('details');advanced.append(el('summary','Advanced: choose a document manually'));
    const label=el('label',task.mode==='DEEP'?'Public document URLs · up to two, one per line':'Public document URL','learning-source-label'),input=el(task.mode==='DEEP'?'textarea':'input');if(input.tagName==='INPUT')input.type='url';else input.rows=2;input.maxLength=task.mode==='DEEP'?1001:500;input.placeholder='https://…';label.append(input);advanced.append(label);
    actionButton('Read selected document','authorize',()=>{if(!input.value||!input.reportValidity()||!confirm('Read these public documents and retain relevant source-attributed knowledge? No private memories are sent.'))throw Error('Document authorization is required.');return input.value;},advanced).disabled=permissions.mode==='disabled';host.append(advanced);
    host.append(el('p',task.mode==='TALK_RESEARCH'?'Research has no additional Energy charge beyond the accepted Talk.':'The existing Teach/Deep Training Energy cost is charged once only if new knowledge is accepted. Discovery and reads have no separate cost.','memory-content-status'));
  }
  actionButton('Cancel task','cancel');
}
