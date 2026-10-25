export function knowledgeGroups(mind){
  const domains=new Map();
  for(const memory of mind.memories){
    const domain=memory.category||memory.areaSuggestion||'Unclassified information',topic=memory.topic||memory.concept||'Pending local classification';
    if(!domains.has(domain))domains.set(domain,new Map());const topics=domains.get(domain);
    if(!topics.has(topic))topics.set(topic,[]);
    topics.get(topic).push({memory,type:'UNCERTAIN'});
  }
  return [...domains].map(([label,topics])=>({label,topics:[...topics].map(([label,memories])=>({label,memories}))}));
}
