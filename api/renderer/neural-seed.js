export const NEURAL_SEED = Object.freeze({
  nodes: Object.freeze([
    { id: "origin", position: [0, .1, .1], scale: 1.15 },
    { id: "upper", position: [-.55, .72, -.08], scale: .72 },
    { id: "right", position: [.72, .31, .05], scale: .83 },
    { id: "lower", position: [.3, -.72, -.02], scale: .7 },
    { id: "left", position: [-.78, -.34, .08], scale: .66 }
  ]),
  connections: Object.freeze([["origin","upper"],["origin","right"],["origin","lower"],["origin","left"],["upper","right"],["left","lower"]])
});
