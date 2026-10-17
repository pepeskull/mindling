import { indexedEntry } from './intelligence-index.js';
export function knowledgeGroups(mind){
  const domains=new Map();
  for(const memory of mind.memories){
    const entry=indexedEntry(mind,memory),domain=entry?.domain||memory.category||'Unclassified information',topic=entry?.topic||memory.topic||'Pending local classification';
    if(!domains.has(domain))domains.set(domain,new Map());const topics=domains.get(domain);
    if(!topics.has(topic))topics.set(topic,[]);
    topics.get(topic).push({memory,entry,type:entry?.type||'UNCERTAIN'});
  }
  return [...domains].map(([label,topics])=>({label,topics:[...topics].map(([label,memories])=>({label,memories}))}));
}
export function renderKnowledge(mind,host){
  const make=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
  const groups=knowledgeGroups(mind),nodes=[];
  for(const domain of groups){
    const section=document.createElement('section');section.className='knowledge-area';section.append(make('h3',domain.label));
    for(const topic of domain.topics){
      const details=document.createElement('details');details.open=true;details.append(make('summary',`${topic.label} · ${topic.memories.length} memories`));
      for(const {memory,entry,type} of topic.memories){
        const record=document.createElement('details');record.className='memory-record';record.append(make('summary',memory.content));
        const dl=document.createElement('dl'),field=(name,value)=>{const row=document.createElement('div');row.append(make('dt',name),make('dd',value));dl.append(row);};
        field('Information type',type.replaceAll('_',' '));field('Verification','Player-provided information · not fact-checked');
        field('Analysis',entry?'Experimental browser-local models':'Native lexical fallback / legacy record; type uncertain');
        if(entry)field('Uncertainty',`Model estimate ${Math.round(entry.modelEstimate*100)}% (not calibrated factual confidence)`);
        field('Memory ID',memory.id);field('Strength',`${Math.round((memory.strength||0)*100)}%`);field('Activations',memory.activations??0);
        field('Neural associations',`${memory.neuronIds?.length||0} neurons · ${memory.synapseIds?.length||0} synapses`);
        field('Status',memory.supersededBy?`Superseded by ${memory.supersededBy}`:'Current');
        for(const relation of entry?.relations||[]){const target=mind.memories.find(m=>m.id===relation.target);if(target)field(relation.type.replaceAll('_',' '),`${target.content} · descriptive association, not factual evidence`);}
        record.append(dl);details.append(record);
      }
      section.append(details);
    }
    nodes.push(section);
  }
  host.replaceChildren(...(nodes.length?nodes:[make('p','No memories yet. Teach your Mindling to begin.')]));
}
