import { pathwayProfile } from './pathways.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const percent=new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:1});
export class AdaptivePathwaysView {
  constructor(root){
    this.root=root;
    this.live=el('section');this.origin=el('details',undefined,'development-origin-dna');this.specializations=el('section');
    root.replaceChildren(this.live,this.origin,this.specializations);
  }
  update(state={},pathways=[]){
    const profile=pathwayProfile(state),identity=state.id||state.mindlingId;
    const liveSignature=JSON.stringify([identity,pathways]);
    if(liveSignature!==this.liveSignature){this.liveSignature=liveSignature;this.renderLive(pathways);}
    const originSignature=JSON.stringify([identity,profile.origin]);
    if(originSignature!==this.originSignature){
      if(identity!==this.identity)this.origin.open=false;
      this.originSignature=originSignature;this.renderOrigin(profile.origin);
    }
    this.identity=identity;
    const signature=JSON.stringify([identity,profile.pathways,profile.ignoredEvidence,profile.unassigned,profile.lastUpdate,profile.specializations,profile.unrecorded,profile.contested,profile.evidence.map(item=>[item.id,item.pathwayId,item.units,item.recordedAt,item.attribution])]);
    if(signature===this.signature)return;this.signature=signature;
    this.renderSpecializations(profile);
  }
  renderLive(pathways){
    this.live.replaceChildren(el('h4','Live Pathways'),el('p','Evolving through knowledge and learning.','development-muted'));
    const list=el('ul',undefined,'development-live-pathways');list.setAttribute('aria-label','Current live pathways');
    for(let index=0;index<3;index++){
      const pathway=pathways[index],row=el('li');
      if(pathway&&pathway.source==='knowledge'){
        row.append(el('strong',pathway.title,'development-live-title'),el('span',percent.format(pathway.share),'development-live-share'),el('span',pathway.area,'development-live-area'),el('span',`${pathway.count.toLocaleString()} retained ${pathway.count===1?'memory':'memories'}`,'development-live-count'));
      }else if(pathway?.source==='origin'){
        row.append(el('strong',pathway.title,'development-live-title'),el('span','Origin interest · develops through learning.','development-live-area'));
      }else{
        row.className='development-live-emerging';
        row.append(el('strong','Emerging Pathway','development-live-title'),el('span','Develops through learning.','development-live-area'));
      }
      list.append(row);
    }
    this.live.append(list,el('p','Knowledge titles require distinct retained claims, topic breadth and recorded support. Origin interests fill unformed directions. Titles are orientations, not verified qualifications.','development-muted'));
  }
  renderOrigin(origin){
    this.origin.replaceChildren(el('summary','Origin DNA'));
    const origins=el('div',undefined,'development-pathway-list');for(const id of origin.choices)origins.append(el('span',id));this.origin.append(origins);
    this.origin.append(el('p',origin.choices.length?`${origin.source==='recorded-origin'?'Recorded at origin':'Preserved legacy selections'} · historical onboarding choices, separate from current knowledge.`:'Original pathway choices are unavailable. None have been assigned automatically.','development-muted'));
    if(origin.unsupported.length)this.origin.append(el('p',`${origin.unsupported.length} legacy choices have no current policy mapping; they remain preserved.`,'development-muted'));
  }
  renderSpecializations(profile){
    this.specializations.replaceChildren();
    if(profile.ignoredEvidence)this.specializations.append(el('p',`${profile.ignoredEvidence} duplicate, malformed, historical or no-longer-matching evidence records excluded; no progress guessed.`,'development-muted'));
    this.specializations.append(el('h4','Developed specializations'));
    const developed=profile.pathways.filter(item=>item.evidenceUnits);
    if(!developed.length)this.specializations.append(el('p','No attributed pathway-development evidence yet. Saved metadata is insufficient for reliable attribution.','development-muted'));
    const list=el('ul',undefined,'development-areas');for(const item of developed){const row=el('li');row.append(el('span',item.title||item.id),el('strong',`${Number(item.evidenceUnits.toFixed(3))} evidence ${item.evidenceUnits===1?'unit':'units'}`));list.append(row);}this.specializations.append(list);
    this.specializations.append(el('p',`One distinct claim contributes at most one unit, attributed once to its canonical domain, with controlled structured subtopics. ${profile.evidence.length} retained claim evidence records; ${profile.unassigned} unassigned. Repeated claims and reinforcement add no units. These are knowledge-evidence units, not skill levels or intelligence.`,'development-muted'));
    if(profile.specializations?.length)this.specializations.append(el('h4','Specialization evidence'),el('p','These are evidence candidates; a current specialization title requires every eligibility threshold.','development-muted'));
    for(const item of profile.specializations||[]){const row=el('p',`${item.title}: ${item.count} distinct claims · ${item.topics} subtopics · ${item.relationships} recorded relationships · ${item.ready?'orientation supported':'more evidence needed'}`,'development-muted');this.specializations.append(row);}
    if(profile.unrecorded||profile.contested)this.specializations.append(el('p',`${profile.unrecorded} current claims have no matching recorded learning event; ${profile.contested} contested claims are excluded from supported orientations.`,'development-muted'));
    this.specializations.append(el('p',profile.lastUpdate===null?'No meaningful pathway evidence update recorded.':`Last recorded evidence: ${new Date(profile.lastUpdate).toLocaleString()}`,'development-muted'));
  }
  destroy(){this.root.replaceChildren();}
}
