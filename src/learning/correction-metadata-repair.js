import {editableMemoryText,correctionComparison} from './correction-content.js';
import {meaningfulKnowledgeLabels,isNotesLabel} from './knowledge-labels.js';

// Repair only provable no-op correction pairs. Never infer a discipline from
// words, neighboring graph nodes, origin interests or specialization evidence.
export function repairCorrectionMetadata(state,{recordedAt=Date.now()}={}){
  const mind=state?.mind;if(!mind||!Array.isArray(mind.memories)||mind.categories!==undefined&&!Array.isArray(mind.categories))return state;
  const records=mind.memories.slice(0,1000).filter(memory=>memory&&typeof memory==='object'&&!Array.isArray(memory)&&typeof memory.id==='string'&&memory.id);
  const counts=new Map();for(const memory of records)counts.set(memory.id,(counts.get(memory.id)||0)+1);
  const byId=new Map(records.filter(memory=>counts.get(memory.id)===1).map(memory=>[memory.id,memory]));
  for(const memory of byId.values()){
    if(memory.supersededBy||memory.intelligence?.current===false||!isNotesLabel(memory.category))continue;
    const parent=byId.get(memory.correctsMemoryId);
    if(!parent||parent.supersededBy!==memory.id||parent.research?.classificationMethod!=='source-evaluated-structured-metadata'||!meaningfulKnowledgeLabels(parent)||typeof parent.categoryId!=='string'||!parent.categoryId||!/^[a-f0-9]{64}$/.test(parent.research.quoteHash||'')||typeof parent.research.evidenceText!=='string'||!parent.research.evidenceText.trim()||parent.research.evidenceText!==editableMemoryText(parent)||correctionComparison(editableMemoryText(memory))!==correctionComparison(parent.research.evidenceText))continue;
    const matching=(mind.categories||[]).filter(value=>value?.id===parent.categoryId);if(matching.length>1)continue;
    const category=matching[0];
    if(category&&category.name!==parent.category)continue;
    const previous={category:memory.category,categoryId:memory.categoryId,topic:memory.topic,areaSuggestion:memory.areaSuggestion};
    mind.categories||=[];if(!category)mind.categories.push({id:parent.categoryId,name:parent.category});
    Object.assign(memory,{category:parent.category,categoryId:parent.categoryId,topic:parent.topic,areaSuggestion:parent.category,
      classificationRepair:{version:1,method:'identical-correction-parent',sourceMemoryId:parent.id,recordedAt,previous}});
  }
  return state;
}
