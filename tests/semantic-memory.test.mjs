import test from "node:test"; import assert from "node:assert/strict";
import { cosineSimilarity, SemanticEngine } from "../src/semantic/semantic-engine.js";
import { evaluateMemory, normalizeContent, reinforcedStrength } from "../src/brain/memory-evaluator.js";
test("cosine is deterministic and rejects dimension mismatch",()=>{assert.equal(cosineSimilarity([1,0],[1,0]),1);assert.equal(cosineSimilarity([1],[1,0]),-1)});
test("normalization and reinforcement preserve canonical behavior",()=>{assert.equal(normalizeContent(" Hello, WORLD! "),"hello world");assert.ok(reinforcedStrength(.4)>.4)});
test("deep training uses the existing real learning contract",()=>{const result=evaluateMemory({content:"Bicycle gears make climbing easier",mode:"DEEP_TRAINING",memories:[],pathways:[],semantic:{match:null,related:[]}});assert.equal(result.outcome,"MEMORY_FORMATION")});
test("production semantic engine has no experimental model APIs",()=>{const engine=new SemanticEngine(async()=>({encode:async()=>new Float32Array([1,0]),classify:async()=>({entailment:.99,neutral:.005,contradiction:.005})}),async()=>async()=>new Float32Array([1,0]),async()=>async()=>({score:1}));assert.equal("runKnowledgeTopicE5Matrix" in engine,false);assert.equal("runKnowledgeTopicJinaMatrix" in engine,false)});
