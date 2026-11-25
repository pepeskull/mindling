import { ACTIVITIES } from '../renderer/dashboard-appearance/presets.js';

const MODES=new Set(['neural','synapses','activity','xray']);
const PRESETS=new Set(['soft','neon','holo']);

export class DashboardBrainControls {
  constructor(root,appearance,redraw){
    this.appearance=appearance;
    this.redraw=redraw;
    this.abort=new AbortController();
    const signal=this.abort.signal;
    this.buttons=[...root.querySelectorAll('[data-brain-mode]')];
    this.select=root.querySelector('[data-brain-preset]');
    this.legend=root.querySelector('.brain-activity-legend');
    this.presetLabel=this.select?.closest('label');
    for(const button of this.buttons){
      button.disabled=false;
      button.addEventListener('click',()=>this.choose(button.dataset.brainMode),{signal});
    }
    this.select?.addEventListener('change',()=>{
      if(!PRESETS.has(this.select.value))return;
      appearance.preset=this.select.value;
      this.redraw();
    },{signal});
    for(const {label,color} of Object.values(ACTIVITIES)){
      if(!this.legend)break;
      const item=root.createElement('li');
      const dot=root.createElement('i');
      dot.style.setProperty('--brain-activity-color',color);
      dot.setAttribute('aria-hidden','true');
      item.append(dot,label);
      this.legend.append(item);
    }
    this.refresh();
  }

  choose(mode){
    if(!MODES.has(mode)||this.appearance.mode===mode)return;
    this.appearance.mode=mode;
    this.appearance.clear();
    this.refresh();
    this.redraw();
  }

  refresh(){
    for(const button of this.buttons){
      const active=button.dataset.brainMode===this.appearance.mode;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    }
    if(this.presetLabel)this.presetLabel.hidden=this.appearance.mode!=='neural';
    if(this.legend)this.legend.hidden=this.appearance.mode!=='activity';
  }

  destroy(){
    this.abort.abort();
    this.legend?.replaceChildren();
    if(this.legend)this.legend.hidden=true;
    if(this.presetLabel)this.presetLabel.hidden=true;
    if(this.select)this.select.value='soft';
    for(const button of this.buttons){
      const neural=button.dataset.brainMode==='neural';
      button.disabled=!neural;
      button.classList.toggle('selected',neural);
      button.setAttribute('aria-pressed',String(neural));
    }
  }
}
