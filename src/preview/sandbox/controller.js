import { EvolutionPreview } from '../evolution-preview.js';
import { STAGES } from '../evolution-model.js';
import { presentationFor } from '../dashboard-presentation.js';
import { conditionFor } from '../../life/life-system.js';
import { createSandbox,newMindling,advanceTime,resetClock,evolve,eligibility,learn,DAY,visualMapping } from './engine.js';
import { analyzeLearning } from './gemini.js';
import { PreviewStore } from './storage.js';

export class SandboxPreview extends EvolutionPreview {
  constructor(options={}) { super({...options,snapshotProvider:async()=>({status:'empty'})}); this.listeners=new AbortController(); }
  async start() {
    if(new URLSearchParams(location.search).get('stage-preview')!=='1')throw Error('Sandbox requires explicit preview URL');
    this.store=await new PreviewStore().open();
    this.state=await this.store.change(s=>s||createSandbox());
    await super.start();if(this.disposed)return;
    this.timeline.pause();
    document.querySelector('#app').classList.add('sandbox-mode');
    this.panel=document.createElement('details');this.panel.className='sandbox-controls glass-panel';this.panel.open=true;
    this.panel.innerHTML=`<summary>Development sandbox · isolated test data</summary><div class="sandbox-body"><a href="?stage-preview=1&preview-mode=demo">Replay automatic demonstration</a><p>Only content you explicitly submit with “Analyze with Gemini” is sent to Google. Saved production data is never sent.</p><label>Test name <input data-test-name maxlength="40" value="Test Mindling"></label><label>Pathway <select data-test-pathway><option>Researcher</option><option>Developer</option><option>Social</option></select></label><button data-sandbox="new">Create new test Mindling…</button><div class="time-controls">${[1,12,24,168].map(h=>`<button data-hours="${h}">+${h===24?'1 day':h===168?'7 days':h+' hours'}</button>`).join('')}<button data-sandbox="clock">Reset simulated time offset</button></div><button data-sandbox="evolve">Evolve when eligible</button><label>Preview API access token <input data-api-token type="password" autocomplete="off" placeholder="Kept only in this page"></label><button data-sandbox="fixture">Run labelled learning fixture</button><button data-sandbox="reset">Reset preview gameplay…</button><pre data-diagnostics></pre><label>Inspect neuron <select data-node-selection></select></label><p data-node-info></p><p data-sandbox-status role="status">Create an isolated test Mindling to begin.</p><details><summary>XP history and recent learning</summary><pre data-history></pre></details></div>`;
    document.querySelector('#app').append(this.panel);
    this.listen(this.panel,'click',e=>{const button=e.target.closest('button');if(!button)return;this.action(async()=>{
      if(button.dataset.hours)return this.change(s=>advanceTime(s,Number(button.dataset.hours)));
      switch(button.dataset.sandbox){
        case 'new': if(confirm('Create a new isolated test Mindling? The current test identity will be archived.'))await this.change(s=>newMindling(s,{name:this.panel.querySelector('[data-test-name]').value,pathway:this.panel.querySelector('[data-test-pathway]').value,confirmed:true}));break;
        case 'reset': if(confirm('Reset preview gameplay? Production data and the test player wallet are preserved.'))await this.change(s=>{const n=newMindling(s,{confirmed:true});n.origin=n.now;return n;});break;
        case 'clock':await this.change(resetClock);break;
        case 'evolve':await this.change(evolve);break;
        case 'fixture':await this.runFixture();break;
      }
    });});
    this.listen(document.querySelector('#interaction-form'),'submit',e=>{e.preventDefault();this.action(()=>this.submitLearning());});
    for(const button of document.querySelectorAll('[data-care]'))this.listen(button,'click',()=>this.action(()=>this.care(button.dataset.care)));
    this.listen(this.panel.querySelector('[data-node-selection]'),'change',e=>this.inspectNode(e.target.value));
    this.listen(document.querySelector('[data-new-mindling]'),'click',()=>this.panel.querySelector('[data-sandbox="new"]').click());
    document.querySelector('#interaction-form button[type=submit]').textContent='Analyze with Gemini';
    document.querySelector('#mindling-input').placeholder='Explicitly submit new learning to Gemini…';
    this.renderState();
  }
  listen(node,type,fn){node.addEventListener(type,fn,{signal:this.listeners.signal});}
  async action(fn){if(this.busy)return;this.busy=true;this.status('Working…');try{await fn();this.status('Preview state saved.');}catch(e){this.status(e.message||'Preview operation failed; state unchanged.');}finally{this.busy=false;}}
  status(text){const el=this.panel?.querySelector('[data-sandbox-status]');if(el)el.textContent=text;}
  async change(reducer){this.state=await this.store.change(reducer);if(!this.disposed)this.renderState();}
  async submitLearning(){
    const m=this.state.mind;if(!m||m.life.lifeState!=='ALIVE')throw Error('Create a living test Mindling first');
    const text=document.querySelector('#mindling-input').value;
    this.requestAbort=new AbortController();
    const assessment=await analyzeLearning({text,pathway:m.pathways[0],token:this.panel.querySelector('[data-api-token]').value,signal:this.requestAbort.signal});
    if(this.disposed)return;
    await this.change(s=>learn(s,{id:crypto.randomUUID(),text,assessment,source:'GEMINI',mindId:m.id}));
    document.querySelector('#mindling-input').value='';
  }
  async care(){throw Error('Preview care is introduced in M4.3.');}
  async runFixture(){
    const text='Photosynthesis converts light energy into chemical energy stored in glucose.';
    const assessment={meaningful:true,duplicate:false,quality:1,concept:'photosynthesis energy conversion',memory:text,area:'Biology',kind:'concept',embedding:[1,0,0,0,0,0,0,0]};
    await this.change(s=>learn(s,{id:crypto.randomUUID(),text,assessment,source:'DETERMINISTIC FIXTURE'}));
    this.status('Deterministic fixture — no Gemini request. Repeating it earns no XP.');
  }
  renderState(){
    const m=this.state.mind;if(!m){this.refreshNetwork();return;}
    const stage=m.stage;if(this.timeline.stage!==stage){this.timeline.select(stage);this.syncStage();this.host.dataset.stage=String(stage);}
    // Reuse the canonical Memory UI with sandbox records, never with invented demo counts.
    const subtitle=this.presentation.subtitle;document.querySelector('.hero-copy').append(subtitle);
    this.dashboard.render({...m,mindlingId:m.id,createdAt:new Date(m.createdAt).toISOString()});subtitle.remove();
    this.presentation.stage=null;
    this.refreshNetwork();
    const alive=m.life.lifeState==='ALIVE';
    document.querySelector('#mindling-input').disabled=!alive;
    document.querySelector('#interaction-form button[type=submit]').disabled=!alive;
    document.querySelector('[data-download-profile]').disabled=true;
    document.querySelectorAll('[data-care]').forEach(b=>{b.disabled=!alive;});
    document.querySelector('[data-energy-value]').textContent=`${m.energy.remaining} / 10`;
    const bar=document.querySelector('[data-energy-progress]');bar.hidden=false;bar.value=m.energy.remaining;
    document.querySelector('[data-energy-reset]').textContent='Free Energy resets on the next virtual UTC day';
    document.querySelector('[data-neural-cycle]').textContent=`NC ${String(1+Math.floor((this.state.now-m.createdAt)/DAY)).padStart(4,'0')}`;
    document.querySelector('[data-neural-cycles]').textContent=`${1+Math.floor((this.state.now-m.createdAt)/DAY)} Neural Cycles`;
    document.querySelector('.storage-status').textContent='Preview sandbox · isolated storage';
    document.querySelector('.hero-copy h1').textContent=`${m.name} ${alive?'is learning.':'— Neural Collapse'}`;
    if(!this.panel)return;
    const gate=eligibility(this.state);
    this.panel.querySelector('[data-diagnostics]').textContent=`${STAGES[stage-1].name}\nStage XP: ${m.stageXP} / ${gate.required.xp} · Lifetime: ${m.lifetimeXP}\nStage entered: ${new Date(m.enteredAt).toISOString()}\nStage days: ${(gate.elapsed/DAY).toFixed(2)} / ${gate.required.days}\nLearning milestones: ${gate.concepts} / ${gate.required.concepts}\nEligible: ${gate.eligible}\nVirtual time: ${new Date(this.state.now).toISOString()}\nOffset: ${((this.state.now-this.state.origin)/DAY).toFixed(2)} days\n${m.nodes.length} canonical neurons → ${STAGES[stage-1].count} visual representations`;
    this.panel.querySelector('[data-history]').textContent=JSON.stringify(m.history.slice(-12),null,2);
    const select=this.panel.querySelector('[data-node-selection]');const previous=select.value;select.replaceChildren(...m.nodes.map(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.id;return o;}));if(m.nodes.some(n=>n.id===previous))select.value=previous;this.inspectNode(select.value);
    this.view.canonicalMapping=visualMapping(m,STAGES[stage-1].count);
    // Strength influences existing soma radii; no fake canonical neurons are created.
    this.view.morph.target.nodes.forEach((node,i)=>{const id=this.view.canonicalMapping[i];const strength=m.synapses.filter(e=>e.from===id||e.to===id).reduce((sum,e)=>sum+e.strength,0);node.baseRadius??=node.radius;node.radius=node.baseRadius*(1+Math.min(.35,strength*.05));});
    this.view.morph.tick(0);this.view.buffers.rebuild(this.view.morph);this.view.centralSegments=this.view.buffers.segmentCount;
  }
  inspectNode(id){const m=this.state.mind;this.panel.querySelector('[data-node-info]').textContent=`${id}: ${m.memories.filter(v=>v.neuronIds.includes(id)).length} memories · ${m.synapses.filter(e=>e.from===id||e.to===id).length} connections`;}
  refreshNetwork(){
    if(!this.view||!this.presentation)return;
    const state=presentationFor(this.timeline,this.view.morph),m=this.state?.mind;
    if(m){state.neurons=m.nodes.length;state.synapses=m.synapses.length;state.memories=m.memories.length;state.life={...m.life,condition:conditionFor(m.life.attributes,m.life.lifeState==='DECEASED')};}
    this.presentation.update(state);this.view.updateLabels(state.peers);this.host.dataset.network=this.timeline.network.state;
  }
  destroy(){this.requestAbort?.abort();this.listeners.abort();this.panel?.remove();this.store?.close();document.querySelector('#app')?.classList.remove('sandbox-mode');super.destroy();}
}
