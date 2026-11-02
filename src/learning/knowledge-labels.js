// Classification metadata is distinct from input method and professional ability.
export const isNotesLabel=value=>typeof value==='string'&&/^notes\s*:/iu.test(value.trim());
export function meaningfulKnowledgeLabels(value){
  return typeof value?.category==='string'&&!!value.category.trim()&&value.category.length<=80&&!isNotesLabel(value.category)&&!/^unclassified|^uncategorized$/iu.test(value.category)&&typeof value.topic==='string'&&!!value.topic.trim()&&value.topic.length<=100&&!/^unclassified|^pending classification$|^unsorted/iu.test(value.topic);
}
