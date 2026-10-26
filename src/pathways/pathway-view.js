import { pathwayProfile } from './pathways.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export class AdaptivePathwaysView {
  constructor(root){this.root=root;this.abort=new AbortController();this.page=0;root.addEventListener('click',event=>{const action=event.target.closest('[data-pathway-page]')?.dataset.pathwayPage;if(action){this.page+=action==='next'?1:-1;this.renderLedger();}},{signal:this.abort.signal});}
  update(state={}){
    const profile=pathwayProfile(state);
    const signature=JSON.stringify([state.id||state.mindlingId,profile.origin,profile.pathways,profile.evidence.map(item=>[item.id,item.pathwayId,item.units,item.recordedAt,item.attribution])]);
    if(signature===this.signature)return;this.signature=signature;this.profile=profile;this.page=0;
    this.root.replaceChildren(el('h4','Origin Pathways'));
    const origins=el('div',undefined,'development-pathway-list');for(const id of profile.origin.choices)origins.append(el('span',id));this.root.append(origins);
    this.root.append(el('p',profile.origin.choices.length?`${profile.origin.source==='recorded-origin'?'Recorded at origin':'Preserved legacy selections'} · initial orientation, not permanent specialization.`:'Original pathway choices are unavailable. None have been assigned automatically.','development-muted'));
    if(profile.origin.unsupported.length)this.root.append(el('p',`${profile.origin.unsupported.length} legacy choices have no current policy mapping; they remain preserved.`,'development-muted'));
    if(profile.ignoredEvidence)this.root.append(el('p',`${profile.ignoredEvidence} duplicate, malformed or unsupported evidence records excluded; no progress guessed.`,'development-muted'));
    this.root.append(el('h4','Developed specializations'));
    const developed=profile.pathways.filter(item=>item.evidenceUnits);
    if(!developed.length)this.root.append(el('p','No attributed pathway-development evidence yet. Older memories are not retrospectively scored.','development-muted'));
    const list=el('ul',undefined,'development-areas');for(const item of developed){const row=el('li');row.append(el('span',item.id),el('strong',`${Number(item.evidenceUnits.toFixed(3))} evidence ${item.evidenceUnits===1?'unit':'units'}`));list.append(row);}this.root.append(list);
    this.root.append(el('p',`One distinct claim contributes at most one unit, split equally across up to three exact structured domains. ${profile.evidence.length} retained claim evidence records; ${profile.unassigned} unassigned. Repeated claims and reinforcement add no units. These are knowledge-evidence units, not skill levels or intelligence.`,'development-muted'));
    this.root.append(el('p',profile.lastUpdate===null?'No meaningful pathway evidence update recorded.':`Last recorded evidence: ${new Date(profile.lastUpdate).toLocaleString()}`,'development-muted'));
    const policy=el('details');policy.append(el('summary','Learning priorities and evidence'));const priorities=el('p',profile.pathways.filter(item=>item.priority).map(item=>`${item.id}: ${item.priority.toFixed(2)} (${item.originPriority.toFixed(2)} origin + ${(item.evidenceShare||0).toFixed(2)} relative evidence preference)`).join(' · ')||'No pathway priorities are available.');policy.append(priorities,el('p','Origin preference is 0.25; evidence preference is the pathway’s share of assigned recorded units (0–1). Used only to break equal positive memory-relevance scores in learning. Contradictions and safety rules are unchanged. No time-based decay or neural growth.'));
    this.ledger=el('div');policy.append(this.ledger);this.root.append(policy);this.renderLedger();
  }
  renderLedger(){
    if(!this.ledger)return;const records=[...this.profile.evidence].reverse();this.page=Math.max(0,Math.min(this.page,Math.max(0,Math.ceil(records.length/20)-1)));this.ledger.replaceChildren();
    for(const item of records.slice(this.page*20,this.page*20+20)){const row=el('p');row.append(el('strong',`${item.allocations?.length?item.allocations.map(a=>`${a.id}: ${Number(a.units.toFixed(3))}`).join(' + '):item.pathwayId||'Unassigned'} · ${item.units} units`),document.createTextNode(` · ${new Date(item.recordedAt).toLocaleString()} · ${item.source} / ${item.activity}\nMemory ${item.memoryId}; event ${item.eventId}\n${item.attribution.method}: ${item.attribution.value||item.attribution.reason}`));if(item.classificationHistory?.length)row.append(document.createTextNode('\nClassification history: '+item.classificationHistory.map(change=>`${change.fromPolicy}→${change.toPolicy}: ${change.previous.pathwayId||'Unassigned'} → ${change.next.pathwayIds?.join(' + ')||change.next.pathwayId||'Unassigned'}`).join('; ')));this.ledger.append(row);}
    const controls=el('div',undefined,'pathway-ledger-controls');for(const [action,label,disabled] of [['prev','Previous',this.page===0],['next','Next',(this.page+1)*20>=records.length]]){const button=el('button',label);button.type='button';button.dataset.pathwayPage=action;button.disabled=disabled;controls.append(button);}controls.append(el('span',records.length?`${this.page*20+1}–${Math.min(records.length,(this.page+1)*20)} of ${records.length}`:'No evidence records','development-muted'));this.ledger.append(controls);
  }
  destroy(){this.abort.abort();this.root.replaceChildren();this.profile=null;}
}
