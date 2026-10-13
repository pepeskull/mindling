import { LIFE_RULES } from '../../life/life-system.js';

const HOUR = 3_600_000;
const clamp = value => Math.max(0, Math.min(100, value));
export const PREVIEW_LIFE = Object.freeze({
  version: 2,
  decayPerHour: Object.freeze({ nutrition: 1.4, rest: 1.1, wellbeing: 1 }),
  stimulationDecay: 2,
  stabilityRecovery: .7,
  activityCooldownHours: 2,
  stimulationGain: Object.freeze({ TALK: 12, TEACH: 20, DEEP_TRAINING: 28 })
});

// Additive local upgrade; identities, wallet, timestamps and tombstones survive.
export function upgradePreviewLife(life) {
  if (life.version === 2) return life;
  life.attributes.neuralStability = life.lifeState === 'DECEASED' ? 0 : clamp(100 * (1 - (life.strain || 0) / 28));
  life.stimulation = 100; life.lastActivity = null; life.version = 2;
  delete life.strain;
  return life;
}

export function condition(life) {
  if (life.lifeState === 'DECEASED') return 'NEURAL COLLAPSE';
  const a = life.attributes;
  if (a.neuralStability <= 20 || a.health <= 20) return 'CRITICAL';
  if (Math.min(...Object.values(a)) < 50) return 'STRAINED';
  return Math.min(...Object.values(a)) >= 90 ? 'HEALTHY' : 'STABLE';
}

export function previewWarning(life) {
  if (life.lifeState === 'DECEASED') return 'Neural collapse is permanent. Create a new test identity.';
  const a = life.attributes, needs = [];
  if (a.nutrition < 50) needs.push('Nourish to relieve physical stress');
  if (a.rest < 50) needs.push('Rest to relieve fatigue');
  if (a.health < 70) needs.push('Care supports physical recovery');
  if (life.stimulation < 60) needs.push('Talk, Teach or Deep Training to restore stimulation');
  if (a.neuralStability < 50) needs.push('Neural Stability is low and recovers gradually with care and activity');
  return needs.length ? `${condition(life) === 'CRITICAL' ? 'Critical risk. ' : ''}${needs.join('. ')}.` : 'Keep both Basic Care and meaningful activities in your routine. Neural Stability recovers gradually.';
}

// Fixed hourly integration preserves split advances and exact death timestamps.
export function advancePreviewLife(state) {
  const m = state.mind;
  if (!m) return state;
  const life = upgradePreviewLife(m.life);
  if (life.lifeState === 'DECEASED') return state;
  while (life.lastAt + HOUR <= state.now) {
    const a = life.attributes;
    for (const [name, rate] of Object.entries(PREVIEW_LIFE.decayPerHour)) a[name] = clamp(a[name] - rate);
    life.stimulation = clamp(life.stimulation - PREVIEW_LIFE.stimulationDecay);
    const physicalStress = Math.max(0, 50 - a.nutrition) + Math.max(0, 50 - a.rest);
    const emotionalStress = Math.max(0, 40 - a.wellbeing);
    const stimulationStress = Math.max(0, 60 - life.stimulation);
    const stressed = physicalStress + emotionalStress + stimulationStress > 0;
    a.neuralStability = clamp(a.neuralStability + (stressed
      ? -.35 - stimulationStress * .06 - physicalStress * .025 - emotionalStress * .025
      : PREVIEW_LIFE.stabilityRecovery));
    a.health = clamp(a.health + (physicalStress > 0 || a.neuralStability < 30
      ? -.5 - physicalStress * .04 - Math.max(0, 30 - a.neuralStability) * .04
      : .4));
    life.lastAt += HOUR;
    if (a.neuralStability === 0 || a.health === 0) {
      life.lifeState = 'DECEASED'; life.deathAt = life.lastAt;
      if (!state.tombstones.some(t => t.id === m.id)) state.tombstones.push({ id: m.id, at: life.deathAt, reason: a.health === 0 ? 'PHYSIOLOGICAL_FAILURE' : 'NEURAL_COLLAPSE' });
      break;
    }
  }
  return state;
}

export function carePreview(input, type) {
  const s = structuredClone(input), m = s.mind, rule = LIFE_RULES.care[type];
  if (!m || m.life.lifeState !== 'ALIVE' || s.tombstones.some(t => t.id === m.id)) throw Error('A deceased identity cannot be revived');
  if (!rule) throw Error('Unknown care action');
  const life = upgradePreviewLife(m.life);
  if (life.care[type] != null && s.now - life.care[type] < rule.cooldownHours * HOUR) throw Error('Care cooldown is still active');
  const target = type === 'NOURISH' ? 'nutrition' : type === 'REST' ? 'rest' : 'health';
  // Preventive sandbox care below 100%; production retains its 85/80/90 gates.
  // Existing gains and 6/8/12-hour cooldowns are shared without changing production.
  if (life.attributes[target] >= 100 && !(type === 'CARE' && life.attributes.wellbeing < 100)) throw Error('No care needed');
  for (const [key, gain] of [['nutrition', rule.nutritionGain], ['rest', rule.restGain], ['health', rule.healthGain], ['wellbeing', rule.wellbeingGain]]) if (gain) life.attributes[key] = clamp(life.attributes[key] + gain);
  life.care[type] = s.now;
  return s;
}

export function stimulatePreviewLife(life, type, now) {
  upgradePreviewLife(life);
  const rule = LIFE_RULES.activity[type];
  if (!rule) throw Error('Unknown activity');
  if (life.lastActivity != null && now - life.lastActivity < PREVIEW_LIFE.activityCooldownHours * HOUR) throw Error('Activity cooldown: advance virtual time by two hours');
  life.stimulation = clamp(life.stimulation + PREVIEW_LIFE.stimulationGain[type]);
  life.attributes.wellbeing = clamp(life.attributes.wellbeing + rule.wellbeingGain);
  life.lastActivity = now;
  // Stability itself changes only on the hourly grid, never from one click.
}
