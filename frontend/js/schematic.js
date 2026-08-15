// Designed geometric block schematics — the Obsidian Flux way.
// The Stitch reference shows architecture diagrams as full-width cards with
// black head-strips, icons + mono values, and arrow_forward connectors over a
// dot-grid backdrop — NOT as node-graphs with edges. These renderers build
// that schematic look with real, live numbers only.

import { icon } from "./icons.js";

const head = (label, extra = "") => `
  <div class="sc-card-head">${extra}<span>${label}</span></div>`;

export function topologyFlow(flow) {
  const nodes = [
    { label: "Split", tone: "", value: flow.split, sub: "chunks", iconName: "split" },
    { label: "Dispatch", tone: "accent", value: flow.dispatch, sub: flow.dispatchSub || "chunks / s", iconName: "send" },
    { label: "Execute", tone: "dash", value: flow.execute, sub: flow.executeSub || "active", iconName: "cpu", live: true },
    { label: "Aggregate", tone: "", value: flow.aggregate, sub: flow.aggregateSub || "jobs", iconName: "folderZip" },
  ];
  return `
  <div class="sc-flow">
    ${nodes.map((n, i) => `
      ${i > 0 ? `<span class="sc-arrow" aria-hidden="true">${icon("arrowForward", 26)}</span>` : ""}
      <div class="sc-card tone-${n.tone}">
        ${head(n.label, n.live ? `<span class="sc-live-dot" aria-hidden="true"></span>` : "")}
        <div class="sc-card-body">
          <span class="sc-card-icon" aria-hidden="true">${icon(n.iconName, 30)}</span>
          <span class="sc-card-value mono">${n.value}</span>
          <span class="sc-card-sub mono">${n.sub}</span>
        </div>
      </div>`).join("")}
  </div>`;
}

// Technical architecture schematic — 4 geometric layers with bold arrows:
// client/gateway -> orchestrator (chunker, ray tasks, aggregator) -> redis +
// worker cluster. Every block label is real; the worker chip count is live.
export function archSchematic(state) {
  const workers = Math.max(1, state.workers || 1);
  const workerChips = Array.from(
    { length: Math.min(workers, 6) },
    (_, i) => `<span class="sc-chip">W${i + 1}</span>`
  ).join("");
  const more = workers > 6 ? `<span class="sc-chip">+${workers - 6}</span>` : "";
  const pulse = state.rayUp ? `<span class="sc-live-dot" aria-hidden="true"></span>` : "";

  return `
  <div class="sc-arch">
    <!-- Row 1: client / gateway -->
    <div class="sc-row">
      <div class="sc-block tone-teal">
        ${head("Client UI")}
        <div class="sc-block-body">
          <span class="sc-icon" aria-hidden="true">${icon("layers", 20)}</span>
          <span class="sc-label mono">${icon("hash", 12)} SPA + Gateway</span>
        </div>
      </div>
      <span class="sc-arrow" aria-hidden="true">${icon("arrowForward", 26)}</span>
      <div class="sc-block tone-magenta">
        ${head("FastAPI Gateway")}
        <div class="sc-block-body">
          <span class="sc-icon" aria-hidden="true">${icon("terminal", 20)}</span>
          <span class="sc-label mono">POST /api/v1/jobs</span>
        </div>
      </div>
    </div>

    <span class="sc-down" aria-hidden="true">${icon("arrowRight", 26)}</span>

    <!-- Row 2: orchestrator with sub-blocks -->
    <div class="sc-block tone-black sc-orch">
      ${head("Orchestrator" + pulse)}
      <div class="sc-orch-body">
        <div class="sc-sub">
          <span class="sc-sub-title mono">${icon("split", 14)} CHUNKER</span>
          <span class="sc-sub-detail mono">row-bounded CSV parts</span>
        </div>
        <div class="sc-sub">
          <span class="sc-sub-title mono">${icon("send", 14)} RAY_TASKS</span>
          <span class="sc-sub-detail mono">bounded concurrency</span>
        </div>
        <div class="sc-sub">
          <span class="sc-sub-title mono">${icon("box", 14)} RESULT_AGGREGATOR</span>
          <span class="sc-sub-detail mono">actor · weighted merge</span>
        </div>
      </div>
    </div>

    <span class="sc-down" aria-hidden="true">${icon("arrowRight", 26)}</span>

    <!-- Row 3: state + compute -->
    <div class="sc-row">
      <div class="sc-block tone-black">
        ${head("Redis State")}
        <div class="sc-block-body">
          <span class="sc-icon" aria-hidden="true">${icon("database", 20)}</span>
          <span class="sc-label mono">job index · progress</span>
        </div>
      </div>
      <span class="sc-arrow" aria-hidden="true">${icon("arrowForward", 26)}</span>
      <div class="sc-block tone-teal-bright">
        ${head("Ray Worker Cluster")}
        <div class="sc-block-body">
          <span class="sc-chip-row">${workerChips}${more}</span>
          <span class="sc-label mono">process_chunk() → partials</span>
        </div>
      </div>
    </div>
  </div>`;
}