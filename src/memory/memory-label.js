import { claimStructure } from '../semantic/claim-structure.js';
// Presentation only; labels never rewrite stored claims or provenance.
const semantic=value=>typeof value==='string'&&value.trim()&&value.length<=100&&!/https?:|source observation|\b\d{4}-\d{2}-\d{2}\b|^notes\s*:/iu.test(value)?value.trim():'';
const generic=/^(?:definition|definitions|notes|general|knowledge|unsorted memories|uncategorized|claim)$/iu;
export const contextualLabel=(label,context)=>generic.test(label||'')&&context&&!generic.test(context)?context:label;
export function memoryLabel(node){
  const memory=node.raw||node,topic=semantic(memory.topic),area=semantic(node.areaLabel)||semantic(memory.category)||semantic(memory.areaSuggestion);
  const subject=claimStructure(memory).subjectLabel,context=semantic(subject);
  return {title:contextualLabel(topic,context||area)||contextualLabel(area,context)||context||'Untitled memory',topic,subtitle:node.areaPath?.length>1?node.areaPath.join(' › '):area||'Knowledge area unassigned',historical:node.historical??Boolean(memory.supersededBy||memory.intelligence?.current===false||memory.kind==='historical'||memory.intelligence?.kind==='historical')};
}
export function memoryButton(node){
  const label=memoryLabel(node),button=document.createElement('button');button.type='button';button.className='related-memory-button compact-memory';button.dataset.selectMemory=node.id;
  button.setAttribute('aria-label',`${label.title}. ${label.subtitle}. ${label.historical?'Historical':'Current'} memory.`);
  for(const [tag,text,cls]of [['strong',label.title,'memory-entry-title'],['span',label.subtitle,'memory-entry-area'],['small',label.historical?'Historical':'Current','memory-entry-state']]){const part=document.createElement(tag);part.textContent=text;part.className=cls;button.append(part);}
  return button;
}
