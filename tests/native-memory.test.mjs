import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNative } from '../src/learning/native-learning.js';
import { knowledgeGroups } from '../src/learning/knowledge-view.js';
import { normalize, validateText } from '../src/learning/text.js';

const mind = memories => ({ id: 'native-test', memories, categories: [] });

test('native learning preserves Unicode text and records unverified provenance', () => {
  const text = 'Blåbär växer i skogen under sommaren.';
  const analysis = analyzeNative(text, mind([]));
  assert.equal(analysis.memory, text);
  assert.equal(analysis.native.verification, 'unverified-player-claim');
  assert.equal(analysis.native.provenance.method, 'local-lexical');
});

test('exact repetition resolves to the existing memory without model metadata', () => {
  const analysis = analyzeNative('  JORDEN roterar. ', mind([{ id: 'earth', content: 'Jorden roterar.' }]));
  assert.deepEqual(analysis, { relationship: 'repeated', relatedMemoryId: 'earth' });
});

test('knowledge view uses canonical saved labels and ignores historical model indexes', () => {
  const state = mind([{ id: 'memory-1', content: 'A saved claim.', category: 'Saved category', topic: 'Saved topic' }]);
  state.intelligence = { entries: { 'memory-1': { domain: 'Experimental domain', topic: 'Experimental topic' } } };
  const [group] = knowledgeGroups(state);
  assert.equal(group.label, 'Saved category');
  assert.equal(group.topics[0].label, 'Saved topic');
  assert.equal(group.topics[0].memories[0].type, 'UNCERTAIN');
});

test('normalization and validation remain browser-native and deterministic', () => {
  assert.equal(normalize('  Hej, VÄRLDEN!  '), 'hej, världen');
  assert.equal(validateText('Ett tydligt påstående med flera ord.').sentences.length, 1);
});
