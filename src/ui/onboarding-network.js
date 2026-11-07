import {colors} from '../memory/area-colors.js';
const NS='http://www.w3.org/2000/svg';
const steps=['Welcome','Pathways','Personality','Identity','Review','Birth'];
const points=[[280,145],[170,80],[390,70],[455,180],[330,245],[145,205]];
const svg=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);return node;};
// Temporary onboarding artwork only: no brain state, renderer or storage ownership.
export class OnboardingNetwork {
  constructor(host){
    this.host=host;this.nodes=[];const root=svg('svg',{viewBox:'0 0 560 300','aria-hidden':'true'}),defs=svg('defs',{});root.append(defs);
    steps.forEach((label,i)=>{
      const [x,y]=points[i],color=colors[i],gradient=svg('radialGradient',{id:`onboarding-glow-${i}`});
      gradient.append(svg('stop',{offset:'0%','stop-color':color,'stop-opacity':'.22'}),svg('stop',{offset:'100%','stop-color':color,'stop-opacity':'0'}));defs.append(gradient);
      const group=svg('g',{'data-onboarding-node':label,class:'onboarding-node',style:`--cell-color:${color};transform-origin:${x}px ${y}px`});
      if(i){const [px,py]=points[i===1?0:i-1];group.append(svg('path',{d:`M ${px} ${py} Q ${(px+x)/2} ${Math.min(py,y)-22} ${x} ${y}`,fill:'none',stroke:color,'stroke-opacity':'.45','stroke-width':'1'}));}
      group.append(svg('circle',{cx:x,cy:y,r:i?42:70,fill:`url(#onboarding-glow-${i})`}),svg('circle',{cx:x,cy:y,r:i?10:20,fill:color,'fill-opacity':'.16',stroke:color,'stroke-opacity':'.45'}),svg('circle',{cx:x,cy:y,r:i?7:15,fill:color}));
      const text=svg('text',{x,y:y+(i?27:39),'text-anchor':'middle',fill:'var(--text-secondary)','font-size':i?10:13});text.textContent=label;group.append(text);root.append(group);this.nodes.push(group);
    });host.replaceChildren(root);this.setStep(0);
  }
  setStep(step){this.nodes.forEach((node,i)=>{node.dataset.visible=String(i<=step);node.dataset.current=String(i===step);});}
  destroy(){this.host.replaceChildren();this.nodes=[];}
}
