import { semanticDiagnostics } from '../semantic/memory-connections.js';
import { graphData } from './graph-data.js';
import { renderTaskDiagnostics } from '../autonomous/task-inspector.js';
import { tasksFor } from '../autonomous/tasks.js';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
// Explicit, separate local maintenance surface. No automatic requests or writes.
export function openMemoryMaintenance(root,{getState,onAction,feedback=null,expanded=[]}){
  const state=getState();
  const dialog=el('dialog');dialog.className='memory-maintenance';dialog.setAttribute('aria-labelledby','memory-maintenance-title');
  const title=el('h2','Memory maintenance');title.id='memory-maintenance-title';const close=el('button','Close');close.type='button';close.addEventListener('click',()=>dialog.close());
  const download=el('button','Export memory records');download.type='button';download.addEventListener('click',()=>{
    const latest=getState(),blob=new Blob([JSON.stringify({version:1,memories:latest.memories||[],categories:latest.categories||[],learningTasks:latest.learningTasks||[]},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='mindling-memory-records.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });dialog.append(title,el('p','Local evidence, history and administrative recovery. Exported files include private memory content; keep them secure.'),close,download);
  const raw=el('details');raw.append(el('summary','Stored memory records'));const pre=el('pre',JSON.stringify(state.memories||[],null,2));raw.append(pre);dialog.append(raw);if(feedback){const message=el('p',feedback);message.setAttribute('role','status');dialog.append(message);}
  const semantic=el('details');semantic.append(el('summary','Semantic relationship diagnostics'),el('pre',JSON.stringify(semanticDiagnostics(state),null,2)));dialog.append(semantic);
  const memories=graphData(state).memories;
  for(const task of tasksFor(state)){const details=el('details'),host=el('section');details.open=expanded.includes(task.id);details.dataset.task=task.id;details.append(el('summary',task.topic||'Learning task'),host);renderTaskDiagnostics(host,{task},{memories,onAction:onAction?async(...args)=>{const result=await onAction(...args);if(result.changed!==false&&dialog.isConnected){const expanded=[...dialog.querySelectorAll('details[data-task][open]')].map(d=>d.dataset.task);dialog.close();openMemoryMaintenance(root,{getState,onAction,feedback:result.message,expanded});}return result;}:null});dialog.append(details);}
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});root.append(dialog);dialog.showModal();return dialog;
}
