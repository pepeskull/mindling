const nodes = [
  { id: "origin", position: [0, 0.1, 0.1], size: 1.15 },
  { id: "upper", position: [-0.55, 0.72, -0.08], size: 0.72 },
  { id: "right", position: [0.72, 0.31, 0.05], size: 0.83 },
  { id: "lower", position: [0.3, -0.72, -0.02], size: 0.7 },
  { id: "left", position: [-0.78, -0.34, 0.08], size: 0.66 }
];

const synapses = [
  { id: "origin-upper", from: "origin", to: "upper" },
  { id: "origin-right", from: "origin", to: "right" },
  { id: "origin-lower", from: "origin", to: "lower" },
  { id: "origin-left", from: "origin", to: "left" }
];

export const createNeuralSeedState = () => ({
  stage: "NEURAL_SEED",
  nodes,
  synapses,
  memories: [],
  needs: {},
  pathways: [],
  activities: []
});
