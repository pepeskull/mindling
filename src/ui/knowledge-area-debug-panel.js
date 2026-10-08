const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const metric = (label, value) => {
  const item = element("div", "ka2-debug-metric");
  item.append(element("span", "", label), element("strong", "", String(value)));
  return item;
};

const memoryList = memories => {
  const list = element("ul", "ka2-debug-memories");
  for (const memory of memories) {
    const item = element("li");
    item.append(element("p", "", memory.content || "No memory content available"));
    const metadata = [memory.id];
    if (memory.strength !== null && memory.strength !== undefined) metadata.push(`strength ${Math.round(memory.strength * 100)}%`);
    if (memory.activations !== null && memory.activations !== undefined) metadata.push(`${memory.activations} activation${memory.activations === 1 ? "" : "s"}`);
    if (memory.membershipStatus) metadata.push(memory.membershipStatus.toLowerCase());
    if (memory.neuronIds?.length) metadata.push(`neurons ${memory.neuronIds.join(", ")}`);
    item.append(element("small", "", metadata.join(" · ")));
    list.append(item);
  }
  if (!memories.length) list.append(element("li", "ka2-debug-empty", "No associated canonical memories."));
  return list;
};

const areaCard = ({ title, subtitle, memories, status, className = "" }) => {
  const article = element("article", `ka2-debug-area ${className}`.trim());
  const button = element("button", "ka2-debug-disclosure");
  button.type = "button";
  button.setAttribute("aria-expanded", "false");
  const heading = element("span");
  heading.append(element("strong", "", title), element("small", "", subtitle));
  button.append(heading, element("i", "", "+"));
  const body = element("div", "ka2-debug-area-body");
  body.hidden = true;
  if (status) body.append(element("p", "ka2-debug-status", status));
  body.append(memoryList(memories));
  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    button.lastElementChild.textContent = expanded ? "+" : "−";
    body.hidden = expanded;
  });
  article.append(button, body);
  return article;
};

export class KnowledgeAreaDebugPanel {
  #events; #snapshot; #unsubscribe; #root; #panel; #content; #open = false;

  constructor(events, snapshot) { this.#events = events; this.#snapshot = snapshot; }

  mount() {
    if (this.#root) return;
    this.#root = element("div", "ka2-debug-root");
    const toggle = element("button", "ka2-debug-toggle", "Knowledge Area 2.0 Debug");
    toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "knowledge-area-2-debug-panel");
    toggle.addEventListener("click", () => this.#setOpen(!this.#open));
    this.#panel = element("aside", "ka2-debug-panel");
    this.#panel.id = "knowledge-area-2-debug-panel"; this.#panel.hidden = true;
    this.#panel.setAttribute("aria-label", "Knowledge Area 2.0 diagnostics");
    const header = element("header", "ka2-debug-header"); const title = element("div");
    title.append(element("p", "", "SHADOW · READ ONLY"), element("h2", "", "Knowledge Area 2.0"));
    const refresh = element("button", "", "Refresh diagnostics");
    refresh.type = "button"; refresh.addEventListener("click", () => this.refresh());
    header.append(title, refresh); this.#content = element("div", "ka2-debug-content");
    this.#panel.append(header, this.#content); this.#root.append(toggle, this.#panel); document.body.append(this.#root);
    this.#unsubscribe = this.#events.on("STATE_READY", () => { if (this.#open) this.refresh(); });
  }

  #setOpen(open) {
    this.#open = open; this.#panel.hidden = !open;
    this.#root.querySelector(".ka2-debug-toggle").setAttribute("aria-expanded", String(open));
    if (open) this.refresh();
  }

  refresh() {
    if (!this.#content) return;
    try { this.#render(this.#snapshot()); }
    catch (error) { this.#content.replaceChildren(element("p", "ka2-debug-error", `Diagnostics unavailable: ${error?.message || error}`)); }
  }

  #render(snapshot) {
    const summary = element("section", "ka2-debug-summary");
    summary.append(metric("Canonical memories", snapshot.summary.canonicalMemoryCount), metric("Production areas", snapshot.summary.productionAreaCount),
      metric("Shadow provisional areas", snapshot.summary.shadowProvisionalAreaCount), metric("Verified assignments", snapshot.summary.verifiedShadowAssignments),
      metric("Uncertain assignments", snapshot.summary.uncertainShadowAssignments));
    const explanation = element("p", "ka2-debug-note", "Production areas use the current production derivation. Shadow areas are deliberately provisional singletons; their count is not a semantic quality score.");
    const provider = element("section", "ka2-debug-provider");
    provider.append(element("h3", "", "Topic verification"), element("p", "", snapshot.verificationStatus.message));
    const canonicalSection = element("section", "ka2-debug-section"); canonicalSection.append(element("h3", "", "Canonical memories"));
    canonicalSection.append(memoryList(snapshot.canonicalMemories.map(memory => ({ ...memory,
      membershipStatus: memory.productionAreaId ? `Production: ${memory.productionAreaId}` : "Production: unassigned" }))));
    const productionSection = element("section", "ka2-debug-section");
    productionSection.append(element("h3", "", "Knowledge Areas 1.0 · production"));
    if (!snapshot.productionAreas.length) productionSection.append(element("p", "ka2-debug-empty", "No production areas yet."));
    for (const area of snapshot.productionAreas) productionSection.append(areaCard({ title: area.label || "Unnamed production area",
      subtitle: `${area.id} · ${area.memoryCount} ${area.memoryCount === 1 ? "memory" : "memories"}${area.cohesion === null ? "" : ` · ${Math.round(area.cohesion * 100)}% cohesion`}`,
      memories: area.memories.map(memory => ({ ...memory, membershipStatus: "PRODUCTION" })) }));
    const shadowSection = element("section", "ka2-debug-section"); shadowSection.append(element("h3", "", "Knowledge Areas 2.0 · shadow"));
    if (!snapshot.shadowAreas.length) shadowSection.append(element("p", "ka2-debug-empty", "No canonical memories. Provisional areas will appear after a canonical memory forms."));
    for (const area of snapshot.shadowAreas) shadowSection.append(areaCard({ title: area.displayLabel,
      subtitle: `${area.id} · ${area.status} · ${area.canonicalMemoryCount} memory`,
      status: `${area.verification.decision}: ${area.verification.reason.replaceAll("_", " ").toLowerCase()}. No topic hypothesis or verification evidence is available.`,
      memories: area.memories, className: "is-shadow" }));
    this.#content.replaceChildren(summary, explanation, provider, canonicalSection, productionSection, shadowSection);
  }

  destroy() { this.#unsubscribe?.(); this.#root?.remove(); this.#root = null; }
}
