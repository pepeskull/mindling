// Exact supplied canonical passages; metadata below is synthetic, not a DB export.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {claimStructure} from '../src/semantic/claim-structure.js';
import {reconcileSemanticConnections} from '../src/semantic/memory-connections.js';
const texts=JSON.parse(fs.readFileSync(new URL('./support/production-grammar-passages.json',import.meta.url)));
const records=texts.map((content,i)=>({id:String(i),content,category:'Synthetic category '+i,topic:'Synthetic topic '+i,relatedMemoryIds:[]}));
const facts=records.map(claimStructure).map(r=>r.facts);
assert.deepEqual(facts.map(f=>f.length),[4,3,3]); // observed main baseline: [4,0,0]
assert(facts[1].every(f=>f.qualifiers));
assert.equal(facts[1][2].qualifiers.modality,'can');
assert.equal(facts[2][0].predicate,'distinct-from');
assert.equal(facts[2][0].qualifiers.polarity,'negative-equivalence');
assert.match(facts[2][1].qualifiers.context,/may/);
const state={mind:{memories:records}};reconcileSemanticConnections(state);
assert(records.every(r=>r.relatedMemoryIds.length===0));
const saved=JSON.stringify(state),reload=JSON.parse(saved);reconcileSemanticConnections(reload);assert.equal(JSON.stringify(reload),saved);
assert.deepEqual(records.map(r=>r.content),texts);
for(const text of [
 'In a typical cell response, the receptor authorizes a signal with a chemical messenger and broadcasts it to the tissue.',
 'In a typical compiler pipeline, the parser authorizes a transformation with a syntax check and broadcasts it to the optimizer.'
]){const f=claimStructure({content:text}).facts.filter(f=>f.qualifiers);assert.equal(f.length,2);assert(f.every(f=>f.qualifiers.frequency==='typical'));}
console.log('Exact passage counts 4/3/3; qualifiers, no forced links, serialization and two unrelated domains passed.');
