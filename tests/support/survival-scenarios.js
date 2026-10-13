import { createSandbox, newMindling, HOUR, DAY } from '../../src/preview/sandbox/engine.js';
import { advancePreviewLife, carePreview, stimulatePreviewLife } from '../../src/preview/sandbox/life.js';
import { LIFE_RULES } from '../../src/life/life-system.js';

// Physiology calibration assumes successful meaningful activity; Gemini quality
// and learning atomicity are tested separately. Every action still pays real costs
// and respects the sandbox cooldowns and ten-Energy virtual daily allowance.
export function simulateSurvival({ kind, interval = 6, careInterval = 12, phase = 0, activity = 'TALK', initial = 100, hours = 120 * 24 }) {
  let s = newMindling(createSandbox(), { confirmed: true, id: 'scenario' });
  for(const key of Object.keys(s.mind.life.attributes))s.mind.life.attributes[key]=initial;
  let activities = 0, careActions = 0;
  for (let hour = 1; hour <= hours && s.mind.life.lifeState === 'ALIVE'; hour++) {
    s.now += HOUR; advancePreviewLife(s);
    if (s.mind.life.lifeState !== 'ALIVE') break;
    const day = Math.floor(s.now / DAY);
    if (s.mind.energy.day !== day) s.mind.energy = { day, remaining: 10 };
    if (['care', 'balanced', 'sparse'].includes(kind) && (hour + phase) % careInterval === 0) {
      for (const type of ['NOURISH', 'REST', 'CARE']) {
        try { s = carePreview(s, type); careActions++; }
        catch (e) { if (!/No care needed|cooldown/.test(e.message)) throw e; }
      }
    }
    if (['activity', 'balanced', 'sparse'].includes(kind) && (hour + phase) % interval === 0) {
      const cost = LIFE_RULES.activity[activity].energyCost;
      if (s.mind.energy.remaining >= cost) {
        stimulatePreviewLife(s.mind.life, activity, s.now);
        s.mind.energy.remaining -= cost; activities++;
      }
    }
  }
  return { kind, interval, careInterval, phase, activity, initial, simulatedHours: (s.now - s.mind.createdAt) / HOUR,
    deathHours: s.mind.life.deathAt === null ? null : (s.mind.life.deathAt - s.mind.createdAt) / HOUR,
    attributes: s.mind.life.attributes, activities, careActions, alive: s.mind.life.lifeState === 'ALIVE' };
}

export function survivalScenarios() {
  return Array.from({ length: 100 }, (_, i) => {
    const kind = ['neglect', 'care', 'activity', 'balanced', 'sparse'][i % 5];
    const activity = ['TALK', 'TEACH', 'DEEP_TRAINING'][Math.floor(i / 5) % 3];
    const interval = kind === 'sparse' ? 24 + i % 4 * 12 : activity === 'TALK' ? 4 + i % 2 * 2 : activity === 'TEACH' ? 6 + i % 2 * 2 : 8 + i % 2 * 4;
    return simulateSurvival({ kind, interval, careInterval: kind === 'sparse' ? 24 + i % 3 * 12 : i%2?12:6, phase: Math.floor(i / 5) % 6, activity, initial:100-i%11 });
  });
}
