import {pendingClarifications} from '../autonomous/clarification-tasks.js';
const element=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
// Derived from canonical task state; this component has no storage or engine.
export class ClarificationNotifications {
 constructor(host,{onTask,canAct=()=>true}={}){
  this.onTask=onTask;this.canAct=canAct;this.abort=new AbortController();this.tasks=[];
  this.root=element('div');this.root.className='clarification-notifications';
  this.button=element('button');this.button.type='button';this.button.className='notification-button';this.button.setAttribute('aria-label','Notifications');this.button.setAttribute('aria-expanded','false');this.button.setAttribute('aria-controls','clarification-notifications');
  this.button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
  this.badge=element('span');this.badge.className='notification-count';this.badge.hidden=true;this.button.append(this.badge);
  this.panel=element('section');this.panel.id='clarification-notifications';this.panel.hidden=true;this.panel.setAttribute('aria-label','Notifications');
  this.heading=element('h2','Notifications');this.list=element('div');this.feedback=element('p');this.feedback.setAttribute('role','status');
  this.panel.append(this.heading,this.list,this.feedback);this.root.append(this.button,this.panel);host.append(this.root);
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:this.abort.signal});
  listen(this.button,'click',()=>{if(!canAct())return;if(this.panel.hidden){this.panel.hidden=false;this.button.setAttribute('aria-expanded','true');(this.list.querySelector('button')||this.panel.querySelector('[role="switch"]')||this.button).focus();}else this.close();});
  listen(document,'pointerdown',e=>{if(!this.root.contains(e.target))this.close(false);});
  listen(this.root,'focusout',e=>{if(e.relatedTarget&&!this.root.contains(e.relatedTarget))this.close(false);});
  listen(document,'keydown',e=>{if(e.key==='Escape'&&!this.panel.hidden){e.preventDefault();this.close();}});
 }
 close(focus=true){const open=!this.panel.hidden;this.panel.hidden=true;this.button.setAttribute('aria-expanded','false');if(open&&focus)this.button.focus();}
 update(state={}){
  const identity=state.mindlingId||state.id;if(this.identity!==identity){this.close(false);this.identity=identity;this.feedback.textContent='';}
  this.tasks=pendingClarifications(state);const n=this.tasks.length;
  this.badge.hidden=!n;this.badge.textContent=String(n);this.button.setAttribute('aria-label',n?`Notifications: ${n} clarification${n===1?'':'s'} required`:'Notifications');this.heading.textContent=`Notifications (${n})`;
  const signature=JSON.stringify(this.tasks.map(t=>[t.id,t.topic,t.updatedAt]));
  if(signature!==this.signature){this.signature=signature;const focused=document.activeElement?.dataset.notificationTask;this.list.replaceChildren();
   if(!n)this.list.append(element('p','No clarifications needed.'));
   for(const task of this.tasks){const button=element('button');button.type='button';button.dataset.notificationTask=task.id;button.disabled=!this.onTask;
    button.append(element('strong',task.topic||task.objective),element('small','Clarification required'));
    button.addEventListener('click',async()=>{if(this.busy||!this.canAct()||!this.tasks.some(t=>t.id===task.id))return;this.busy=true;this.close();try{await this.onTask(task.id);}catch{if(this.identity===identity){this.feedback.textContent='This clarification is no longer available. Reopen notifications to refresh.';this.button.focus();}}finally{this.busy=false;}});this.list.append(button);
   }
   if(focused&&!this.panel.hidden)([...this.list.querySelectorAll('button')].find(b=>b.dataset.notificationTask===focused)||this.button).focus();
  }
 }
 destroy(){this.abort.abort();this.root.remove();}
}
