// Synthetic sentence-pattern fixtures, NOT the five production records.
import assert from 'node:assert/strict';
import {claimStructure} from '../src/semantic/claim-structure.js';
import {semanticText} from '../src/semantic/semantic-text.js';
import {reconcileSemanticConnections} from '../src/semantic/memory-connections.js';
const samples=[
 'A compiler is a translation engine. Not every financial product is safe. A compiler uses syntax trees.',
 'A translation engine processes syntax trees. Staff views may change.',
 'Participants validate transactions. Cryptocurrency is not equivalent to a ledger.',
 'A token may be transferred. It is not guaranteed.',
 'Devices store records. These are examples of mechanisms, not a claim that every device co'
];
const records=samples.map((content,i)=>({id:String(i),content,category:'Computing',topic:'Architecture',relatedMemoryIds:[]}));
assert.equal(claimStructure(records[0]).facts.length,2);
assert.equal(claimStructure(records[1]).facts.length,1);
assert.equal(claimStructure(records[2]).facts.length,1);
assert.equal(claimStructure(records[3]).facts.length,0);
const truncated={...records[4],research:{sourceURL:'https://example.org/source',observedAt:0}};
assert.equal(semanticText(truncated).reason,'SUSPECTED_TRUNCATION');
const state={mind:{memories:records}};
reconcileSemanticConnections(state);
assert(records[0].relatedMemoryIds.includes('1'));
assert(records[1].relatedMemoryIds.includes('0'));
const saved=JSON.stringify(state);reconcileSemanticConnections(state);assert.equal(JSON.stringify(state),saved);
assert.deepEqual(records.map(m=>m.content),samples);
console.log('Synthetic isolation, reciprocal linking, serialized reload and idempotence checks passed');
const reload=JSON.parse(saved);reconcileSemanticConnections(reload);assert.equal(JSON.stringify(reload),saved);
