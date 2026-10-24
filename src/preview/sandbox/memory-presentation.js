// Enrich the existing Memory panel only when the isolated sandbox renders it.
// All player/model text stays textContent; no new design or production rendering path.
export function renderPreviewMemoryDetails(mind, host) {
  for(const record of host.querySelectorAll('.memory-record')){
    const fields=new Map([...record.querySelectorAll('dl > div')].map(row=>[row.querySelector('dt')?.textContent,row.querySelector('dd')]));
    const memory=mind.memories.find(m=>m.id===fields.get('Memory ID')?.textContent);
    if(!memory?.intelligence&&!memory?.contradictions?.length)continue;
    const info=memory.intelligence||{kind:memory.kind||'claim',certainty:'asserted',current:!memory.supersededBy};
    fields.get('Information type').textContent=`${info.kind} · ${info.certainty}`;
    fields.get('Analysis').textContent='Mindling learning service classification · not independent verification';
    fields.get('Status').textContent=info.current?'Current':'Historical';
    const field=(name,value)=>{const row=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=name;description.textContent=value;row.append(term,description);record.querySelector('dl').append(row);};
    for(const previous of memory.valueHistory||[])field('Previous value',`${previous.content} · ${previous.at||'historical'}`);
    for(const contradiction of memory.contradictions||[])field('Conflicting claim',`${contradiction.claim} · unverified; original knowledge preserved`);
  }
}
