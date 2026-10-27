import { pathwayProfile } from './pathways.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export class AdaptivePathwaysView {
  constructor(root){this.root=root;}
  update(state={}){
    const profile=pathwayProfile(state);
    const signature=JSON.stringify([state.id||state.mindlingId,profile.origin,profile.pathways,profile.evidence.map(item=>[item.id,item.pathwayId,item.units,item.recordedAt,item.attribution])]);
    if(signature===this.signature)return;this.signature=signature;
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
  }
  destroy(){this.root.replaceChildren();}
}
