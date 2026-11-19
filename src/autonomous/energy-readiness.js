import { energyAt } from '../economy/energy.js';

export function researchEnergyReady(mind, now = Date.now()) {
  if (!mind?.energy) return false;
  const remaining = energyAt(mind.energy, now).remaining;
  return remaining > 2 || (remaining > 0 && mind.researchEnergy?.version === 1 && mind.researchEnergy.ready === true);
}

export function reconcileResearchEnergy(mind, now = Date.now()) {
  if (mind.energy) mind.researchEnergy = { version: 1, ready: researchEnergyReady(mind, now) };
}
