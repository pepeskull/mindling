import { energyAt } from '../economy/energy.js';
import { neuralSeedRecords } from '../brain/neural-seed-state.js';
import { STAGES } from '../preview/evolution-model.js';
import { DAY, normalize, newMindling, eligibility, evolve } from '../preview/sandbox/engine.js';
import { advancePreviewLife, upgradePreviewLife, condition } from '../preview/sandbox/life.js';

const time = (value, fallback) => Number.isFinite(value) ? value : Number.isFinite(Date.parse(value)) ? Date.parse(value) : fallback;
const records = (embedded = [], stored = []) => [...new Map([...embedded, ...stored].map(item => [item.id, structuredClone(item)])).values()];
const ordered = (items, seed) => [...seed.map(node => items.find(item => item.id === node.id)).filter(Boolean), ...items.filter(item => !seed.some(node => node.id === item.id))];

// Only the production database enters this migration; preview storage is never read.
export function migrateGameplay(data, now) {
  const saved = data.mindling.find(item => item.id === 'primary');
  const identity = data.identity.find(item => item.id === 'local-identity');
  const state = { version: 1, revision: 0, now, origin: now, clockResets: 0,
    player: { ...(saved?.player || {}), id: identity?.playerId || identity?.mindlingId || saved?.mindlingId || crypto.randomUUID() },
    tombstones: [], mind: null };
  if (!saved) return state;
  if (!saved.mindlingId) throw Error('Saved Mindling identity is missing; existing data has been preserved.');
  const legacy = data.life.find(item => item.id === 'primary') || saved.life || {};
  const born = time(saved.createdAt, time(legacy.birthTimestamp, now));
  const matchedMemorial = data.memorials.find(item => item.mindling?.mindlingId === saved.mindlingId || item.mindling?.id === saved.mindlingId);
  const deceased = legacy.lifeState === 'DECEASED' || saved.life?.lifeState === 'DECEASED' || Boolean(matchedMemorial);
  const alreadyLife2 = legacy.version === 2 || legacy.schemaVersion === 2;
  const latestActivity = Math.max(0, ...data.energyJournal.map(item => time(item.at, 0)));
  const life = { ...structuredClone(legacy),
    attributes: { health: 100, nutrition: 100, rest: 100, wellbeing: 100, ...legacy.attributes },
    version: alreadyLife2 ? 2 : 1,
    // Keep saved vital values: apply the new physiology from promotion onward,
    // rather than retroactively punishing time spent under Life System 1.0.
    lastAt: alreadyLife2 ? time(legacy.lastAt, time(legacy.lastSimulationAt, born)) : now,
    life2StartedAt: legacy.life2StartedAt ?? now,
    legacyLastSimulationAt: legacy.legacyLastSimulationAt ?? legacy.lastSimulationAt ?? null,
    lifeState: deceased ? 'DECEASED' : 'ALIVE',
    deathAt: deceased ? time(legacy.deathAt, time(legacy.deathTimestamp, time(matchedMemorial?.life?.deathTimestamp, now))) : null,
    care: { ...(legacy.care || {}), ...Object.fromEntries(Object.entries(legacy.careCooldowns || {}).map(([key, value]) => [key, value == null ? null : time(value, null)])) }
  };
  upgradePreviewLife(life);
  life.lastActivity = time(legacy.lastActivity, latestActivity || null);
  if (!Number.isFinite(life.attributes.neuralStability)) life.attributes.neuralStability = deceased ? 0 : 100;
  if (!Number.isFinite(life.stimulation)) life.stimulation = 100;
  const label = String(saved.stage ?? 'NEURAL_SEED').toUpperCase().replaceAll(' ', '_');
  const stage = Number.isInteger(saved.stage) ? saved.stage : /^[1-7]$/.test(label) ? Number(label) : STAGES.find(item => item.name.toUpperCase().replaceAll(' ', '_') === label)?.number;
  if (!Number.isInteger(stage) || stage < 1 || stage > 7) throw Error('Saved evolution stage is unsupported; existing data has been preserved.');
  const seed = neuralSeedRecords();
  const nodes = records(saved.nodes, data.neurons);
  const synapses = records(saved.synapses, data.synapses).map(edge => ({ strength: .2, activations: 0, ...edge }));
  const invalidSeedNodes = nodes.length && (nodes.length !== 5 || seed.neurons.some(node => !nodes.some(item => item.id === node.id)));
  const invalidSeedEdges = synapses.length && (synapses.length !== 4 || seed.synapses.some(edge => !synapses.some(item => item.from === edge.from && item.to === edge.to)));
  if (stage === 1 && (invalidSeedNodes || invalidSeedEdges)) throw Error('Saved Neural Seed topology requires review; existing data has been preserved.');
  const memories = records(saved.memories, data.memories).map(memory => ({ ...memory,
    normalized: memory.normalized || memory.normalizedContent || normalize(memory.content),
    concept: memory.concept || memory.content, neuronIds: memory.neuronIds || [], synapseIds: memory.synapseIds || [] }));
  state.mind = { ...structuredClone(saved), id: saved.mindlingId, createdAt: born, legacyStage: saved.stage,
    pathways: saved.pathways || data.pathways.filter(item => item.selected).map(item => item.name),
    stage, enteredAt: time(saved.enteredAt, born), stageXP: saved.stageXP ?? saved.xp ?? 0,
    lifetimeXP: saved.lifetimeXP ?? saved.learningXP ?? saved.xp ?? 0, milestones: saved.milestones || [],
    history: saved.history || [], processed: saved.processed || [], lastLearning: time(saved.lastLearning, null),
    nodes: ordered(nodes.length ? nodes : seed.neurons, seed.neurons),
    synapses: ordered(synapses.length ? synapses : seed.synapses, seed.synapses), memories,
    areas: saved.areas || [], life, energy: energyAt(legacy.energy,now),
    activityHistory: saved.activityHistory || [], stageHistory: saved.stageHistory || [] };
  if (deceased) state.tombstones.push({ id: state.mind.id, at: life.deathAt, reason: 'PRESERVED_DEATH' });
  return state;
}

export function advanceGameplay(input, now = Date.now()) {
  const state = structuredClone(input);
  state.now = Math.max(state.now, now);
  const m = state.mind;
  if (!m) return state;
  if (state.tombstones.some(item => item.id === m.id)) {
    m.life.lifeState = 'DECEASED';
    m.life.deathAt ??= state.tombstones.find(item => item.id === m.id).at;
  }
  if (m.life.lifeState === 'ALIVE' && (m.life.attributes.health <= 0 || m.life.attributes.neuralStability <= 0)) {
    m.life.lifeState = 'DECEASED'; m.life.deathAt = state.now;
    state.tombstones.push({ id: m.id, at: state.now, reason: m.life.attributes.health <= 0 ? 'PHYSIOLOGICAL_FAILURE' : 'NEURAL_COLLAPSE' });
  }
  m.energy=energyAt(m.energy,state.now);
  return advancePreviewLife(state);
}

export function progressGameplay(state) { return eligibility(state).eligible ? evolve(state) : state; }

export function createGameplayMindling(state, draft, identity) {
  if (state.mind && state.mind.life.lifeState !== 'DECEASED') throw Error('A living Mindling cannot be replaced.');
  const next = newMindling(state, { name: draft.name, pathways:draft.pathways, id: identity.mindlingId, confirmed: true });
  next.mind.pathways = [...draft.pathways]; next.mind.traits = { ...draft.traits };
  next.mind.mindlingId = identity.mindlingId;
  return next;
}

export function dashboardState(mind) {
  return { ...mind, mindlingId: mind.id, createdAt: new Date(mind.createdAt).toISOString(), traits: mind.traits || {} };
}

export function dashboardLife(state) {
  const m = state.mind, life = m.life;
  return { ...life, id: 'primary', schemaVersion: 2, stage: m.stage, condition: condition(life),
    birthTimestamp: life.birthTimestamp || new Date(m.createdAt).toISOString(), lastSimulationAt: new Date(life.lastAt).toISOString(),
    deathTimestamp: life.deathAt == null ? null : new Date(life.deathAt).toISOString(),
    energy: { ...m.energy, maximum:10 },
    careCooldowns: Object.fromEntries(Object.entries(life.care).map(([key, value]) => [key, value == null ? null : new Date(value).toISOString()])) };
}
