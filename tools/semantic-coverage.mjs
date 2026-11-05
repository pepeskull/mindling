// Usage: node tools/semantic-coverage.mjs /authorized/local/export.json
// No network, writes or model calls. Output contains IDs, not private passages.
import {readFileSync} from 'node:fs';
import {semanticCoverage} from '../src/semantic/coverage.js';
if(!process.argv[2])throw Error('Provide an authorized local JSON export path.');
const value=JSON.parse(readFileSync(process.argv[2],'utf8'));
const mind=Array.isArray(value)?{memories:value}:value.mind||value;
if(!Array.isArray(mind.memories))throw Error('Expected memory records, a Mindling, or {mind}.');
console.log(JSON.stringify(semanticCoverage(mind),null,2));
