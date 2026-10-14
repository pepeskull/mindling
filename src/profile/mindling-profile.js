import { STAGES } from '../preview/evolution-model.js';

const titleCase = value => value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());

export function safeProfileFilename(name) {
  const safe = name.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").trim().replace(/^\.+/, "").replace(/\s+/g, " ").slice(0, 64);
  return `${safe || "Mindling"}.md`;
}

export function generateMindlingProfile(state, life = null) {
  const strengths = state.memories.map(memory => memory.strength);
  const lines = [
    `# ${state.name}`,
    "", "## Identity", "",
    `Mindling ID: ${state.mindlingId}`,
    `Stage: ${Number.isInteger(state.stage) ? STAGES[state.stage - 1].name : 'Neural Seed'}`,
    `Created: ${state.createdAt}`,
    "", "## Personality", ""
  ];
  for (const [trait, value] of Object.entries(state.traits)) lines.push(`- ${titleCase(trait)}: ${Math.round(value * 100)}%`);
  lines.push("", "## Pathways", "", ...state.pathways.map(pathway => `- ${pathway}`));
  lines.push("", "## Neural State", "", `Neurons: ${state.nodes.length}`, `Synapses: ${state.synapses.length}`, `Memories: ${state.memories.length}`);
  if (life) lines.push("", "## Life", "", `Condition: ${life.condition}`, `Health: ${Math.round(life.attributes.health)}%`, `Nutrition: ${Math.round(life.attributes.nutrition)}%`, `Rest: ${Math.round(life.attributes.rest)}%`, `Wellbeing: ${Math.round(life.attributes.wellbeing)}%`, `Birth: ${life.birthTimestamp}`, ...(life.deathTimestamp ? [`Death: ${life.deathTimestamp}`] : []));
  if (life?.version === 2) lines.push(`Neural Stability: ${Math.round(life.attributes.neuralStability)}%`, `Stimulation: ${Math.round(life.stimulation)}%`, `Learning XP: ${state.lifetimeXP}`, `Stage XP: ${state.stageXP}`);
  lines.push("", "## Development", "", "Status: UNSPECIALIZED", "", "## Memory", "", `Formed Memories: ${state.memories.length}`);
  if (strengths.length) lines.push(`Strongest Memory Strength: ${Math.round(Math.max(...strengths) * 100)}%`);
  return `${lines.join("\n")}\n`;
}

export function downloadMindlingProfile(state, life = null) {
  const url = URL.createObjectURL(new Blob([generateMindlingProfile(state, life)], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = safeProfileFilename(state.name); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
