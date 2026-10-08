export const NEURAL_SEED_MORPHOLOGY = Object.freeze({
  somaDetail: 4,
  somaIrregularity: 0.075,
  primaryDendrites: 6,
  dendriteLength: 0.55,
  branchingDepth: 1,
  synapseRadius: 0.0045,
  pulseInterval: 2.4
});

export function seededValue(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}
