const titleCase = value => value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());

export function safeProfileFilename(name) {
  const safe = name.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").trim().replace(/^\.+/, "").replace(/\s+/g, " ").slice(0, 64);
  return `${safe || "Mindling"}.md`;
}

export function generateMindlingProfile(state) {
  const strengths = state.memories.map(memory => memory.strength);
  const lines = [
    `# ${state.name}`,
    "", "## Identity", "",
    `Mindling ID: ${state.mindlingId}`,
    "Stage: Neural Seed",
    `Created: ${state.createdAt}`,
    "", "## Personality", ""
  ];
  for (const [trait, value] of Object.entries(state.traits)) lines.push(`- ${titleCase(trait)}: ${Math.round(value * 100)}%`);
  lines.push("", "## Pathways", "", ...state.pathways.map(pathway => `- ${pathway}`));
  lines.push("", "## Neural State", "", `Neurons: ${state.nodes.length}`, `Synapses: ${state.synapses.length}`, `Memories: ${state.memories.length}`);
  lines.push("", "## Development", "", "Status: UNSPECIALIZED", "", "## Memory", "", `Formed Memories: ${state.memories.length}`);
  if (strengths.length) lines.push(`Strongest Memory Strength: ${Math.round(Math.max(...strengths) * 100)}%`);
  return `${lines.join("\n")}\n`;
}

export function downloadMindlingProfile(state) {
  const url = URL.createObjectURL(new Blob([generateMindlingProfile(state)], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = safeProfileFilename(state.name); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
