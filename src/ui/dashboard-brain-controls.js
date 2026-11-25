const MODES=new Set(['neural','synapses','activity','xray']);

export class DashboardBrainControls {
  constructor(root,appearance,redraw){
    this.appearance=appearance;
    this.redraw=redraw;
    this.abort=new AbortController();
    const signal=this.abort.signal;
    this.buttons=[...root.querySelectorAll('[data-brain-mode]')];
    for(const button of this.buttons){
      button.disabled=false;
      button.addEventListener('click',()=>this.choose(button.dataset.brainMode),{signal});
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
  }

  destroy(){
    this.abort.abort();
    for(const button of this.buttons){
      const neural=button.dataset.brainMode==='neural';
      button.disabled=!neural;
      button.classList.toggle('selected',neural);
      button.setAttribute('aria-pressed',String(neural));
    }
  }
}
