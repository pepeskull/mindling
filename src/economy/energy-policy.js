export const ENERGY_CAPACITIES = Object.freeze([10, 12, 15, 18, 22, 26, 32]);
export const ENERGY_INTERVAL = 12 * 60 * 1000;
export const EVOLUTION_REQUIREMENTS = Object.freeze([
  [1, 75, 6], [2, 125, 10], [3, 175, 15], [4, 225, 20],
  [5, 300, 25], [7, 400, 30], [0, 0, 0]
].map(([days, xp, concepts]) => Object.freeze({days, xp, concepts})));
