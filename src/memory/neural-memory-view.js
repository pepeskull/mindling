import { VIEW_ZOOM } from '../ui/view-zoom.js';
import { sourceDescription } from './content-integrity.js';
import {graphData,filterGraph,layoutGraph,memorySignature} from './graph-data.js';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const svg=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
const array=value=>Array.isArray(value)?value:[];
const compact=(text,size=29)=>text.length>size?text.slice(0,size-1)+'…':text;
const PAGE_SIZE=6;
const NEUTRAL_COLOR='#92959b'; // Existing secondary text tone for unassigned areas.
const colors=['#81dfd1','#b8a2ed','#79bccc','#d0c58e','#a6d4ba','#a0b3e4'];

const areaColor=id=>{let hash=0;for(const char of id)hash=(hash*31+char.codePointAt(0))>>>0;return colors[hash%colors.length];};

export class NeuralMemoryView {
  constructor(root){
    this.root=root;this.visible=false;this.autoFit=true;this.dirty=true;this.frame=null;this.selected=null;this.hover=null;this.area='all';this.query='';this.page=0;this.zoom=1;this.pan={x:0,y:0};this.abort=new AbortController();this.generation=0;
    root.innerHTML=`<div class="memory-stat-strip" aria-label="Memory statistics"></div>
      <div class="neural-memory-grid"><section class="knowledge-graph-panel" aria-labelledby="knowledge-areas-title"><div class="graph-panel-heading"><div><p class="memory-eyebrow">01 / EXPLORE</p><h3 id="knowledge-areas-title">Knowledge network</h3></div><span class="local-memory-tag"><i></i> LOCAL MEMORY</span></div>
      <div class="memory-graph-stage"><canvas tabindex="0" role="img" aria-label="Interactive knowledge graph. Drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom. Use Browse memories for keyboard selection."></canvas><canvas class="memory-flow" aria-hidden="true"></canvas><div class="graph-empty" hidden><div class="empty-neural-seed" aria-hidden="true"><i></i><i></i><i></i><b></b></div><p>Your first connection starts here.</p><span>Teach your Mindling something worth remembering.</span></div><div class="memory-tooltip" role="tooltip" hidden></div><div class="graph-view-tools glass-line"><button type="button" data-graph-action="out" aria-label="Zoom out">−</button><span data-zoom-level>100%</span><button type="button" data-graph-action="in" aria-label="Zoom in">+</button><button type="button" data-graph-action="fit">Fit graph</button><button type="button" data-graph-action="reset">Reset view</button><button type="button" data-graph-action="focus" disabled>Focus selected</button></div></div>
      <div class="graph-legend"><span><i class="legend-hierarchy"></i> Organization</span><span><i class="legend-association"></i> Stored association</span><span><i class="legend-explicit"></i> History / parts / provenance</span><span class="graph-gesture">Drag to explore · Scroll to zoom</span></div><p class="graph-message" role="status" aria-live="polite"></p>
      <details class="memory-browser"><summary>Browse memories <span>Keyboard-accessible index</span></summary><ul></ul><div><button type="button" data-memory-page="prev">Previous</button><span data-memory-page-label></span><button type="button" data-memory-page="next">Next</button></div></details></section>
      <aside class="memory-side"><section class="knowledge-radar-panel" aria-labelledby="coverage-title"><p class="memory-eyebrow">02 / PERSPECTIVE</p><h3 id="coverage-title">Knowledge Distribution</h3><p class="radar-description">Where your current memories live.</p><div class="memory-radar"></div><ul class="coverage-values"></ul><p class="radar-method">Share of current canonical memories in each area. Coverage, not measured skill or intelligence.</p><details class="radar-method-detail"><summary>How this is measured</summary><p>Each axis is the number of current memories in an area divided by all current memories. Displayed percentages are rounded. Historical records are excluded. With more than six areas, the five largest are shown and the rest form Other areas. The outer ring is a labelled share scale rounded up to the next ten percentage points. No skill assessments are stored. Future measured skill proficiency requires evaluation data and is not inferred by this chart.</p></details></section>
      <section class="memory-inspector" aria-labelledby="memory-inspector-title"><p class="memory-eyebrow">03 / CONNECTION DETAIL</p><h3 id="memory-inspector-title">Follow a thought.</h3><div class="memory-inspector-content"><p>Select a memory to see what it holds, how it has grown, and where it connects.</p></div></section></aside></div>
      <footer class="memory-science-note glass-line"><span aria-hidden="true">◈</span> Stored claims are not independently verified. Connections show organization and recorded relationships, not proof of truth.</footer>`;
    this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.stage=root.querySelector('.memory-graph-stage');this.tooltip=root.querySelector('.memory-tooltip');
    this.flowCanvas=root.querySelector('.memory-flow');this.flowCtx=this.flowCanvas.getContext('2d');this.flowFrame=null;this.flowPaths=[];this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.on(this.motion,'change',()=>{this.stopFlow();this.startFlow();});
    this.on(root,'click',event=>{
      const action=event.target.closest('[data-graph-action]')?.dataset.graphAction;
      if(action==='in'||action==='out')this.setZoom(this.zoom*(action==='in'?VIEW_ZOOM.step:1/VIEW_ZOOM.step));
      if(action==='fit'||action==='reset'){if(action==='reset'){this.area='all';this.query='';this.rebuild(true);}else this.fit();}
      if(action==='focus')this.focus(this.selected);
      const record=event.target.closest('[data-select-memory]');if(record)this.select(record.dataset.selectMemory,true);
      const page=event.target.closest('[data-memory-page]')?.dataset.memoryPage;if(page){this.page+=page==='next'?1:-1;this.renderIndex();}
    });
    this.on(this.canvas,'wheel',event=>{event.preventDefault();const bounds=this.canvas.getBoundingClientRect();this.setZoom(this.zoom*Math.exp(-event.deltaY*VIEW_ZOOM.wheel),event.clientX-bounds.left,event.clientY-bounds.top);},{passive:false});
    this.on(this.canvas,'pointerdown',event=>{if(event.button!==0)return;this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,pan:{...this.pan},moved:false};this.canvas.setPointerCapture(event.pointerId);});
    this.on(this.canvas,'pointermove',event=>{
      const box=this.canvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
      if(this.drag){const dx=event.clientX-this.drag.x,dy=event.clientY-this.drag.y;if(Math.hypot(dx,dy)>5)this.drag.moved=true;if(this.drag.moved){this.autoFit=false;this.pan={x:this.drag.pan.x+dx,y:this.drag.pan.y+dy};this.hideTooltip();this.drawSoon();}return;}
      const hit=this.hit(x,y);this.hover=hit?.id||null;this.canvas.style.cursor=hit?'pointer':'grab';
      if(hit){this.tooltip.textContent=hit.label;this.tooltip.hidden=false;this.tooltip.style.left=`${Math.min(x+14,Math.max(10,box.width-250))}px`;this.tooltip.style.top=`${Math.max(10,y-38)}px`;}else this.hideTooltip();this.drawSoon();
    });
    this.on(this.canvas,'pointerup',event=>{if(!this.drag||event.pointerId!==this.drag.id)return;const moved=this.drag.moved;this.drag=null;if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);if(!moved){const box=this.canvas.getBoundingClientRect(),hit=this.hit(event.clientX-box.left,event.clientY-box.top);if(hit)this.select(hit.id);}});
    this.on(this.canvas,'pointercancel',()=>{this.drag=null;this.hideTooltip();});this.on(this.canvas,'pointerleave',()=>{if(!this.drag){this.hover=null;this.hideTooltip();this.drawSoon();}});
    this.on(this.canvas,'keydown',event=>{const move={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]}[event.key];if(move){event.preventDefault();this.autoFit=false;this.pan.x+=move[0];this.pan.y+=move[1];this.drawSoon();}if(['+','=','-','0','Escape'].includes(event.key)){event.preventDefault();if(event.key==='0')this.fit();else if(event.key==='Escape'){this.selected=null;this.renderInspector();this.drawSoon();}else this.setZoom(this.zoom*(event.key==='-'?1/VIEW_ZOOM.step:VIEW_ZOOM.step));}});
    this.visibility=()=>{if(document.hidden){this.stopFlow();cancelAnimationFrame(this.frame);this.frame=null;this.hideTooltip();}else if(this.dirty)this.queueBuild();else this.drawSoon();};this.on(document,'visibilitychange',this.visibility);
    this.observer=new ResizeObserver(()=>{if(this.visible){if(this.autoFit)this.fit();else this.drawSoon();}});this.observer.observe(this.stage);
  }
  on(target,type,callback,options={}){target.addEventListener(type,callback,{...options,signal:this.abort.signal});}
  update(state){if(this.abort.signal.aborted)return;this.state=state||{};const signature=memorySignature(this.state);if(signature===this.signature)return;this.signature=signature;this.dirty=true;if(this.visible)this.queueBuild();}
  setVisible(visible){if(this.abort.signal.aborted)return;this.visible=visible;if(visible){if(this.dirty)this.queueBuild();else this.drawSoon();}else{this.stopFlow();cancelAnimationFrame(this.frame);this.frame=null;this.hideTooltip();}}
  queueBuild(){if(this.pending||document.hidden)return;this.pending=true;const token=this.generation;setTimeout(()=>{this.pending=false;if(token!==this.generation||!this.visible||document.hidden)return;this.graph=graphData(this.state);this.dirty=false;this.renderStats();this.rebuild(!this.fitted);this.renderRadar();},0);}
  renderStats(){const strip=this.root.querySelector('.memory-stat-strip');strip.replaceChildren();for(const [value,name] of [[this.graph.stats.canonical,'Canonical memories'],[this.graph.stats.areas,'Knowledge areas'],[this.graph.stats.associations,'Stored associations']]){const item=el('div');item.append(el('strong',value),el('span',name));strip.append(item);}}
  rebuild(fit=false){if(!this.graph)return;this.hover=null;this.hideTooltip();this.filtered=filterGraph(this.graph,{area:this.area,query:this.query});this.layout=layoutGraph(this.filtered);this.positions=new Map(this.layout.nodes.map(node=>[node.id,node]));this.colors=new Map(this.graph.areas.map(area=>[area.id,area.label==='Uncategorized'?NEUTRAL_COLOR:areaColor(area.id)]));if(this.selected&&!this.positions.has(this.selected))this.selected=null;
    const empty=this.root.querySelector('.graph-empty');empty.hidden=Boolean(this.filtered.memories.length);empty.querySelector('p').textContent=this.graph.stats.canonical?'No memories in this view.':'Your first connection starts here.';empty.querySelector('span').textContent=this.graph.stats.canonical?'Try another area or a different search.':'Teach your Mindling something worth remembering.';
    this.root.querySelector('.graph-message').textContent=`${this.filtered.memories.length} of ${this.graph.stats.canonical} canonical memories in view${this.layout.nodes.length>400?' · Zoom in for fine edges; select a memory to highlight stored associations.':''}${this.graph.stats.ignoredRecords?` · ${this.graph.stats.ignoredRecords} records without unique IDs were not plotted.`:''}`;
    this.renderIndex();this.renderInspector();if(fit||this.autoFit)this.fit();else this.drawSoon();}
  renderIndex(){if(!this.filtered)return;const active=document.activeElement?.closest('.memory-browser [data-select-memory]')?.dataset.selectMemory;const total=this.filtered.memories.length;this.page=Math.max(0,Math.min(this.page,Math.max(0,Math.ceil(total/PAGE_SIZE)-1)));const items=this.filtered.memories.slice(this.page*PAGE_SIZE,this.page*PAGE_SIZE+PAGE_SIZE).map(node=>{const li=el('li'),button=el('button',compact(node.label,110));button.type='button';button.title=node.label;button.dataset.selectMemory=node.id;button.style.setProperty('--memory-area-color',this.colors.get(node.areaId)||NEUTRAL_COLOR);button.setAttribute('aria-pressed',String(this.selected===node.id));li.append(button);return li;});this.root.querySelector('.memory-browser ul').replaceChildren(...items);if(active)[...this.root.querySelectorAll('.memory-browser [data-select-memory]')].find(button=>button.dataset.selectMemory===active)?.focus({preventScroll:true});this.root.querySelector('[data-memory-page-label]').textContent=total?`${this.page*PAGE_SIZE+1}–${Math.min(total,this.page*PAGE_SIZE+PAGE_SIZE)} of ${total}`:'No matching memories';this.root.querySelector('[data-memory-page="prev"]').disabled=this.page===0;this.root.querySelector('[data-memory-page="next"]').disabled=(this.page+1)*PAGE_SIZE>=total;}
  select(id,focus=false){if(!this.positions.has(id)&&this.graph.nodes.some(node=>node.id===id)){this.area='all';this.query='';this.rebuild();}if(!this.positions.has(id))return;this.selected=id;this.renderInspector();this.root.querySelector('.memory-inspector').scrollTop=0;this.renderIndex();this.root.querySelector('[data-graph-action="focus"]').disabled=false;if(focus)this.focus(id);else this.drawSoon();}
  focus(id){const node=this.positions?.get(id);if(!node)return;this.autoFit=false;this.zoom=Math.max(this.zoom,.8);this.pan={x:this.stage.clientWidth/2-node.x*this.zoom,y:this.stage.clientHeight/2-node.y*this.zoom};this.drawSoon();}
  fit(){if(!this.layout||!this.stage.clientWidth)return;this.autoFit=true;this.zoom=Math.min(1.4,(this.stage.clientWidth-100)/this.layout.width,(this.stage.clientHeight-100)/this.layout.height);this.fitZoom=this.zoom;this.pan={x:(this.stage.clientWidth-this.layout.width*this.zoom)/2,y:(this.stage.clientHeight-this.layout.height*this.zoom)/2};this.fitted=true;this.drawSoon();}
  setZoom(zoom,x=this.stage.clientWidth/2,y=this.stage.clientHeight/2){this.autoFit=false;const next=Math.max(Math.min(VIEW_ZOOM.min,(this.fitZoom||.06)/4),Math.min(VIEW_ZOOM.max,zoom)),ratio=next/this.zoom;this.pan={x:x-(x-this.pan.x)*ratio,y:y-(y-this.pan.y)*ratio};this.zoom=next;this.drawSoon();}
  hit(x,y){if(!this.layout)return null;const world={x:(x-this.pan.x)/this.zoom,y:(y-this.pan.y)/this.zoom};return [...this.layout.nodes].reverse().find(node=>Math.hypot(node.x-world.x,node.y-world.y)<=Math.max(node.r+4,8/this.zoom));}
  hideTooltip(){this.tooltip.hidden=true;}
  drawSoon(){if(!this.visible||document.hidden||this.frame!==null||this.abort.signal.aborted)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});}
  draw(){if(!this.layout||!this.visible)return;const w=this.stage.clientWidth,h=this.stage.clientHeight,dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return;if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(this.pan.x,this.pan.y);ctx.scale(this.zoom,this.zoom);
    this.flowPaths=[];
    const overview=this.layout.nodes.length>400&&this.zoom<.35,dotBatches=new Map();
    const selected=this.positions.get(this.selected),hover=this.positions.get(this.hover),neighbors=new Set([this.selected,this.hover]);
    for(const edge of this.layout.edges)if(edge.from===this.selected||edge.to===this.selected){neighbors.add(edge.from);neighbors.add(edge.to);}
    for(const node of this.layout.nodes)if(node.kind==='area'){const color=this.colors.get(node.id)||colors[0];const grad=ctx.createRadialGradient(node.x,node.y,5,node.x,node.y,node.clusterRadius);grad.addColorStop(0,color+'13');grad.addColorStop(1,color+'00');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(node.x,node.y,node.clusterRadius,0,Math.PI*2);ctx.fill();}
    for(const edge of this.layout.edges){if(this.layout.nodes.length>400&&edge.kind!=='hierarchy'&&!neighbors.has(edge.from)&&!neighbors.has(edge.to))continue;const a=this.positions.get(edge.from),b=this.positions.get(edge.to);if(!a||!b)continue;const strong=edge.from===this.selected||edge.to===this.selected;if(overview&&b.kind==='memory'&&edge.kind==='hierarchy'&&!strong)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);const dx=b.x-a.x,dy=b.y-a.y;ctx.bezierCurveTo(a.x+dx*.4-dy*.12,a.y+dy*.4+dx*.12,a.x+dx*.65-dy*.12,a.y+dy*.65+dx*.12,b.x,b.y);ctx.strokeStyle=strong?'#a0f4e1':edge.kind==='hierarchy'?'#8bcfc239':edge.kind==='association'?'#73d8cf65':'#b8a2ed88';ctx.lineWidth=(strong?1.6:.8)/Math.max(.65,this.zoom);ctx.setLineDash(edge.kind==='hierarchy'?[]:edge.kind==='association'?[3,5]:[9,4,2,4]);ctx.stroke();
      // Only animate edges that are actually rendered, with bounded overlay work.
      if(this.flowPaths.length<64)this.flowPaths.push({a,b,c1:{x:a.x+dx*.4-dy*.12,y:a.y+dy*.4+dx*.12},c2:{x:a.x+dx*.65-dy*.12,y:a.y+dy*.65+dx*.12}});
    }ctx.setLineDash([]);
    const labelCells=new Set();let labelCount=0;
    for(const node of this.layout.nodes){const sx=node.x*this.zoom+this.pan.x,sy=node.y*this.zoom+this.pan.y;if(sx< -120||sx>w+120||sy< -60||sy>h+60)continue;const lit=neighbors.has(node.id),color=this.colors.get(node.areaId||node.id)||colors[0];if(overview&&node.kind==='memory'&&!lit){const tone=node.historical?'#577970':color+'bb';if(!dotBatches.has(tone))dotBatches.set(tone,[]);dotBatches.get(tone).push(node);continue;}ctx.beginPath();ctx.arc(node.x,node.y,node.r,0,Math.PI*2);ctx.fillStyle=node.historical?'#122127':color+(lit?'ff':node.kind==='memory'?'bb':'ee');ctx.shadowColor=color;ctx.shadowBlur=lit?20:node.kind==='area'?18:0;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=lit?'#d9fff4':color;ctx.lineWidth=lit?2:1;ctx.stroke();if(lit||node.kind==='area'){ctx.beginPath();ctx.arc(node.x,node.y,node.r+6,0,Math.PI*2);ctx.strokeStyle=color+'66';ctx.lineWidth=.7;ctx.stroke();}
      const show=node.kind==='area'||(node.kind==='topic'&&this.zoom>.3)||node.id===selected?.id||node.id===hover?.id;if(show){ctx.font=`${node.kind==='area'?'500':'400'} ${(node.kind==='area'?11:10)/this.zoom}px Inter, sans-serif`;ctx.fillStyle=lit?'#eefff9':node.kind==='area'?'#d5ece7':'#9bb3b0';ctx.textAlign='center';const text=compact(node.label,node.kind==='memory'?42:25),width=ctx.measureText(text).width*this.zoom,baseline=sy+node.r*this.zoom+19,row=Math.floor(baseline/20),cells=[];for(let col=Math.floor((sx-width/2)/80);col<=Math.floor((sx+width/2)/80);col++)cells.push(`${col}:${row}`);if(lit||(labelCount<80&&!cells.some(cell=>labelCells.has(cell)))){ctx.fillText(text,node.x,node.y+node.r+19/this.zoom);cells.forEach(cell=>labelCells.add(cell));labelCount++;}}}
    for(const [color,dots] of dotBatches){ctx.beginPath();for(const node of dots){ctx.moveTo(node.x+node.r,node.y);ctx.arc(node.x,node.y,node.r,0,Math.PI*2);}ctx.fillStyle=color;ctx.fill();}
    ctx.restore();if(this.flowPaths.length)this.startFlow();else this.stopFlow();this.root.querySelector('[data-zoom-level]').textContent=`${Math.round(this.zoom*100)}%`;}
  stopFlow(){
    cancelAnimationFrame(this.flowFrame);this.flowFrame=null;
    this.flowCtx?.clearRect(0,0,this.flowCanvas.width,this.flowCanvas.height);
  }
  startFlow(){
    if(this.flowFrame!==null||!this.visible||document.hidden||this.motion.matches||this.abort.signal.aborted||!this.flowPaths.length)return;
    this.flowFrame=requestAnimationFrame(time=>{this.flowFrame=null;this.drawFlow(time);});
  }
  drawFlow(time){
    if(!this.visible||document.hidden||this.motion.matches||this.abort.signal.aborted)return;
    const w=this.stage.clientWidth,h=this.stage.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
    if(!w||!h)return;
    if(this.flowCanvas.width!==Math.round(w*dpr)||this.flowCanvas.height!==Math.round(h*dpr)){
      this.flowCanvas.width=Math.round(w*dpr);this.flowCanvas.height=Math.round(h*dpr);
    }
    const ctx=this.flowCtx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    // Animate the overlay only: the full graph stays demand-rendered.
    for(const [i,{a,b,c1,c2}] of this.flowPaths.entries()){
      const t=(time/5200+i*.173)%1,u=1-t;
      const x=(u*u*u*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*b.x)*this.zoom+this.pan.x;
      const y=(u*u*u*a.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*b.y)*this.zoom+this.pan.y;
      if(x<0||x>w||y<0||y>h)continue;
      ctx.globalAlpha=Math.sin(Math.PI*t)*.85;ctx.fillStyle='#b7d8d1';
      ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;this.startFlow();
  }
  renderInspector(){const host=this.root.querySelector('.memory-inspector-content'),title=this.root.querySelector('#memory-inspector-title'),node=this.positions?.get(this.selected);host.replaceChildren();this.root.querySelector('[data-graph-action="focus"]').disabled=!node;
    if(!node){title.textContent='Follow a thought.';host.append(el('p','Select a memory to see what it holds, how it has grown, and where it connects.'));return;}
    if(node.kind!=='memory'){title.textContent=node.label;host.append(el('p',`${node.memoryIds.length} canonical memories · ${node.kind==='area'?'Knowledge area':'Topic'}`));const candidates=this.filtered.memories.filter(memory=>node.kind==='area'?memory.areaId===node.id:memory.topicId===node.id);for(const memory of candidates.slice(0,8)){const button=el('button',compact(memory.label,76),'related-memory-button');button.type='button';button.title=memory.label;button.dataset.selectMemory=memory.id;host.append(button);}return;}
    const memory=node.raw,byId=new Map(this.graph.nodes.map(item=>[item.id,item]));title.textContent='Inside this memory';host.append(el('span',node.historical?'Historical memory':'Current memory',`memory-status-chip ${node.historical?'historical':''}`),el('p',node.label,'inspector-memory-text'));
    host.append(el('p',sourceDescription(memory),'memory-content-status'));
    if(node.label.length>600)host.querySelector('.inspector-memory-text').tabIndex=0;
    const dl=el('dl',undefined,'inspector-facts');const field=(name,value,target=dl)=>{const row=el('div');row.append(el('dt',name),el('dd',value));target.append(row);};
    field('Knowledge area',byId.get(node.areaId)?.label||'Uncategorized');field('Topic',byId.get(node.topicId)?.label||'Unsorted');field('Strength',Number.isFinite(memory.strength)&&memory.strength>=0&&memory.strength<=1?`${Math.round(memory.strength*100)}%`:'Not recorded');field('Activations',Number.isSafeInteger(memory.activations)&&memory.activations>=0?String(memory.activations):'Not recorded');host.append(dl);
    const parts=array(memory.parts||memory.atomicParts).map(part=>typeof part==='string'?part:part?.content||part?.text).filter(part=>typeof part==='string');if(parts.length){const list=el('ul',undefined,'inspector-history');host.append(el('h4','Contained statements'));for(const part of parts)list.append(el('li',part));host.append(list);}
    if(array(memory.valueHistory).length){const details=el('details',undefined,'memory-value-history');details.append(el('summary','Previous values'));const list=el('ul');for(const value of memory.valueHistory)if(typeof value?.content==='string')list.append(el('li',value.content));details.append(list);host.append(details);}
    if(array(memory.contradictions).length){const details=el('details');details.append(el('summary','Recorded conflicting claims'));for(const record of memory.contradictions)if(typeof record?.claim==='string')details.append(el('p',record.claim));host.append(details);}
    const related=this.graph.edges.filter(edge=>edge.kind!=='hierarchy'&&(edge.from===node.id||edge.to===node.id)),seen=new Set();
    if(related.length){host.append(el('h4','Connected memories'));for(const edge of related){const id=edge.from===node.id?edge.to:edge.from;if(seen.has(id))continue;seen.add(id);const target=byId.get(id);const button=el('button',compact(target.label,100),'related-memory-button');button.dataset.selectMemory=id;button.type='button';button.title=target.label;host.append(button);}}
  }
  renderRadar(){const host=this.root.querySelector('.memory-radar'),list=this.root.querySelector('.coverage-values');host.replaceChildren();list.replaceChildren();const axes=this.graph.coverage;
    if(axes.length<3){const empty=el('div',undefined,'radar-waiting');empty.append(el('span','◈'),el('p',axes.length?'A little more variety.':'Room to grow.'),el('small',axes.length?'A radar needs at least three real knowledge areas. Your actual counts appear below.':'Your knowledge distribution will appear as current memories accumulate.'));host.append(empty);}
    else{const scale=Math.ceil(Math.max(...axes.map(axis=>axis.share))*10)/10;
      const chart=svg('svg',{viewBox:'0 0 320 290',role:'img','aria-label':'Knowledge distribution: percentage of current memories by area'}),cx=160,cy=142,r=94;
      const point=(i,value)=>{const a=-Math.PI/2+i*Math.PI*2/axes.length;return [cx+Math.cos(a)*r*value,cy+Math.sin(a)*r*value];};
      for(const value of [.25,.5,.75,1])chart.append(svg('polygon',{points:axes.map((_,i)=>point(i,value).join(',')).join(' '),fill:'none',stroke:'#a7d5cf20','stroke-width':1}));
      axes.forEach((axis,i)=>{const [x,y]=point(i,1);chart.append(svg('line',{x1:cx,y1:cy,x2:x,y2:y,stroke:'#a7d5cf20'}));const [lx,ly]=point(i,1.22),text=svg('text',{x:lx,y:ly,'text-anchor':'middle','dominant-baseline':'middle'});text.textContent=compact(axis.label,17);chart.append(text);});
      chart.append(svg('polygon',{points:axes.map((axis,i)=>point(i,axis.share/scale).join(',')).join(' '),fill:'#82dfcf20',stroke:'#82dfcf','stroke-width':1.8,'stroke-linejoin':'round'}));axes.forEach((axis,i)=>{const [x,y]=point(i,axis.share/scale),circle=svg('circle',{cx:x,cy:y,r:3,fill:'#c1fff1',tabindex:0}),title=svg('title');title.textContent=`${axis.label}: ${axis.count} of ${this.graph.stats.current} current memories (${Math.round(axis.share*100)}%)`;circle.append(title);chart.append(circle);});host.append(chart);const scaleLabel=el('p',`Radial scale: 0–${Math.round(scale*100)}% of current memories`,'radar-scale-label');host.append(scaleLabel);}
    for(const axis of axes){const li=el('li');li.style.setProperty('--memory-area-color',this.colors.get(axis.id)||NEUTRAL_COLOR);const name=el('span',axis.label),value=el('b',`${axis.count} · ${Math.round(axis.share*100)}%`);li.append(name,value);li.title=axis.members?axis.members.map(a=>`${a.label}: ${a.count}`).join(', '):`${axis.label}: ${axis.count} current canonical memories`;list.append(li);}
  }
  destroy(){if(this.abort.signal.aborted)return;this.visible=false;this.stopFlow();this.flowPaths=[];this.generation++;document.removeEventListener('visibilitychange',this.visibility);this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.frame=null;this.layout=null;this.graph=null;this.state=null;this.filtered=null;this.positions=null;this.signature=null;this.colors=null;this.drag=null;this.canvas.width=0;this.canvas.height=0;this.ctx=null;this.root.replaceChildren();}
}
