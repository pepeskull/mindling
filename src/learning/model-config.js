// Evaluation candidates, not a claim of measured model quality on this deployment.
export const FRAMEWORK='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.web.min.js';
export const EMBEDDING=Object.freeze({id:'Xenova/paraphrase-multilingual-MiniLM-L12-v2',revision:'2c4055b12046f11709e9df2c122e59ffbdc2f900',dtype:'q8',dimensions:384,weightBytes:118308126});
export const CLASSIFIER=Object.freeze({id:'onnx-community/Qwen2.5-0.5B-Instruct',revision:'22942cb7d7ba4cc81bb4673549ca4d4614469b5e',dtype:'q8',weightBytes:512096557});
export const CLASSIFIER_KEY=`${CLASSIFIER.id}@${CLASSIFIER.revision}:${CLASSIFIER.dtype}`;
export const MODEL_KEY=`${EMBEDDING.id}@${EMBEDDING.revision}:${EMBEDDING.dtype}`;
export const ANALYSIS_VERSION=2;
export const INFORMATION_TYPES=Object.freeze(['FACT_CLAIM','AMBITION','GOAL','INSTRUCTION','ADVICE','OPINION','QUESTION','EXPERIENCE','UNCERTAIN']);
export const RELATIONSHIP_TYPES=Object.freeze(['SAME_TOPIC','RELATED_TOPIC','SUPPORTS','CONTRADICTS','ELABORATES','GOAL_RELATED_TO']);
