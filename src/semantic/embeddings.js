export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
export const EMBEDDING_DIMENSIONS = 1024;
export function validEmbedding(vector, dimensions = EMBEDDING_DIMENSIONS) {
  return Array.isArray(vector) && vector.length === dimensions && vector.every(v => Number.isFinite(v) && Math.abs(v) <= 100) && vector.some(v => v !== 0);
}
// Never infer model identity from dimensions or a provider/source label.
export function memoryVector(memory) {
  if (memory.semanticEmbedding?.model === EMBEDDING_MODEL && memory.semanticEmbedding.content === memory.content && validEmbedding(memory.semanticEmbedding.values)) return memory.semanticEmbedding;
  if (memory.embeddingModel === EMBEDDING_MODEL && validEmbedding(memory.embedding)) return { model: memory.embeddingModel, values: memory.embedding };
  return null;
}
export function cosineSimilarity(a,b) {
  if (!a?.length || a.length !== b?.length) return -1;
  let dot=0,x=0,y=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];x+=a[i]**2;y+=b[i]**2;}
  return x && y ? dot / Math.sqrt(x*y) : -1;
}
export function memorySimilarity(a,b) {
  const left=memoryVector(a),right=memoryVector(b);
  return left && right && left.model===right.model ? cosineSimilarity(left.values,right.values) : -1;
}
export function applyMemoryEmbeddings(mind, updates) {
  for (const update of updates) {
    const memory=mind.memories.find(m=>m.id===update.id && m.content===update.content);
    if(!memory || !validEmbedding(update.values))throw Error('Memories changed. Submit again.');
    // Preserve the original embedding and every historical memory field.
    memory.semanticEmbedding={model:EMBEDDING_MODEL,content:memory.content,values:[...update.values]};
  }
}
