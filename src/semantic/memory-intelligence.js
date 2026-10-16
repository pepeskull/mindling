import { normalize } from '../learning/text.js';
export { normalize } from '../learning/text.js';

// Legacy contents and variants remain readable without rewriting any old fields.
export const exactMemory = (memories, text) => memories.find(memory =>
  [memory.content, ...(memory.matchedVariants || [])]
    .some(value => typeof value === 'string' && normalize(value) === normalize(text)));

export function assignCategory(mind, memory, claim) {
  mind.categories ||= [];
  let category = mind.categories.find(c => c.id === claim.categoryId);
  if (!category && claim.categoryId) {
    const legacy = mind.memories.find(m => m.categoryId === claim.categoryId && m.category === claim.category);
    if (!legacy) throw Error('Category changed. Existing knowledge is unchanged.');
    category = {id: legacy.categoryId, name: legacy.category};
    mind.categories.push(category);
  }
  category ||= mind.categories.find(c => normalize(c.name) === normalize(claim.category));
  if (!category) {
    category = {id: `category-${crypto.randomUUID()}`, name: claim.category};
    mind.categories.push(category);
  }
  memory.categoryId = category.id; memory.category = category.name; memory.topic = claim.topic;
}
