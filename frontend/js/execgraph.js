// Execution graph — the signature element, rendered in the Obsidian Flux
// neo-brutalist language: square nodes, 2px black strokes, hard offset
// shadows, black title strips, dot-grid backdrop, square particles.
//
// INPUT → CHUNKER → (fan-out) → WORKERS(n) → (fan-in) → AGGREGATOR → RESULT
//
// Worker nodes are derived from the REAL task→worker mapping of the active job
// (or the live cluster node count on the overview). Activation, particles and
// failure states follow real task counters. Reduced-motion users get a static
// graph, and the graph always carries a textual summary for screen readers.

export const GRAPH_STAGES = ["upload", "chunker", "workers", "aggregator", "result"];

const HEAD_H = 19; // black title strip height

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function shortLabel(id) {
  if (!id) return "worker";
  return id.replace(/^node:/, "").slice(0, 8);
}

export function renderGraph({
  width = 760, height = 270, active, progress = 0, workers = 0, running = 0, taskGroups = {},
}) {
  const reduced = prefersReducedMotion();
  const hasJob = !!active;
  const isLive = active === "processing";
  const done = active === "completed";
  const failed = active === "failed";

  // Worker nodes: real task groups when available, otherwise capacity slots.
  const groupEntries = Object.entries(taskGroups);
  const workerDefs = groupEntries.length
    ? groupEntries.map(([id, g]) => ({ id: shortLabel(id), real: true, ...g }))
    : Array.from({ length: Math.max(1, workers) }, (_, i) => ({
        id: `worker-${String(i + 1).padStart(2, "0")}`, real: false,
        running: 0, completed: 0, failed: 0, total: 0,
      }));

  const padX = 26;
  const topY = 64, topH = 48, topW = 128;
  const workerY = 156, workerH = 70, workerW = 100;
  const botY = 262, botH = 48, botW = 128;
  const k = workerDefs.length;

  const cx = (i, n, w) => padX + ((width - padX * 2) * (i + 0.5)) / n;

  // Stage nodes
  const upload = { x: padX, y: topY, w: topW, h: topH, cx: padX + topW / 2 };
  const chunker = { x: width - padX - topW, y: topY, w: topW, h: topH, cx: width - padX - topW / 2 };
  const agg = { x: padX, y: botY, w: botW, h: botH, cx: padX + botW / 2 };
  const result = { x: width - padX - botW, y: botY, w: botW, h: botH, cx: width - padX - botW / 2 };

  const workerNodes = workerDefs.map((w, i) => ({
    x: cx(i, k, workerW) - workerW / 2, y: workerY, w: workerW, h: workerH,
    cx: cx(i, k, workerW), ...w,
  }));

  // Edge helper
  const curve = (x1, y1, x2, y2) => {
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  };
  const cy = (n) => n.y + n.h / 2;

  const edges = [
    ...workerNodes.map((w) => ({ a: upload, b: w, id: "up-w", x1: upload.x + upload.w, y1: cy(upload), x2: w.x, y2: cy(w) })),
    ...workerNodes.map((w) => ({ a: w, b: agg, id: "w-ag", x1: w.x + w.w, y1: cy(w), x2: agg.x, y2: cy(agg) })),
  ];

  const stageActive = {
    upload: hasJob,
    chunker: hasJob,
    workers: isLive || running > 0 || done || failed,
    aggregator: isLive || done || failed,
    result: done || failed,
  };

  const activeEdges = edges.filter((e) => {
    const aOn = e.a === upload ? stageActive.upload : stageActive.workers;
    const bOn = e.b === upload ? stageActive.upload : e.b === agg ? stageActive.aggregator : stageActive.workers;
    return aOn && bOn;
  });

  const nodeLayer = [
    stageNode("UPLOAD", "http ingest", upload, stageActive.upload),
    stageNode("CHUNKER", "parallelize", chunker, stageActive.chunker),
    ...workerNodes.map((w) => workerNode(w, stageActive.workers, reduced)),
    stageNode("AGGREGATOR", "merge partials", agg, stageActive.aggregator),
    stageNode("RESULT", "redis store", result, stageActive.result),
  ].join("");

  const edgeLayer = edges.map((e) => `<path d="${curve(e.x1, e.y1, e.x2, e.y2)}" class="g-edge${activeEdges.includes(e) ? " on" : ""}"/>`).join("");

  const particleLayer = reduced ? "" : activeEdges.map((e, i) => {
    let out = "";
    const count = e.id === "up-w" ? 2 : 1;
    for (let p = 0; p < count; p++) {
      const dur = 1.1 + ((i + p) % 3) * 0.35;
      out += `<rect width="3.5" height="3.5" class="g-particle"><animateMotion dur="${dur}s" repeatCount="indefinite" begin="${(p * 0.55 - i * 0.13).toFixed(2)}s"><mpath href="#gpath${i}"/></animateMotion></rect>`;
    }
    return out;
  }).join("");

  const pathDefs = edges.map((e, i) => `<path id="gpath${i}" d="${curve(e.x1, e.y1, e.x2, e.y2)}" fill="none"/>`).join("");

  const summary = graphTextSummary({ active, running, workers: workerDefs.length, taskGroups, reduced });
  const foot = `
    <g class="g-footer">
      <text x="${padX}" y="${height - 6}" class="g-foot-note">${hasJob ? `job: ${active}` : "idle — awaiting job"}</text>
      <text x="${width - padX}" y="${height - 6}" text-anchor="end" class="g-foot-note">${workerDefs.length} worker${workerDefs.length === 1 ? "" : "s"} · ${running} active tasks · ${Math.round(progress)}%</text>
    </g>`;

  return `
  <svg class="exec-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(summary)}">
    <title>${escapeAttr(summary)}</title>
    <defs>
      <pattern id="g-dots" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="1.6" cy="1.6" r="1" fill="var(--border-soft)"/>
      </pattern>
      <marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border)"/>
      </marker>
    </defs>
    <rect class="g-gridbg" x="0" y="0" width="${width}" height="${height}" fill="url(#g-dots)"/>
    ${pathDefs}
    ${edgeLayer}
    ${nodeLayer}
    ${particleLayer}
    ${foot}
  </svg>`;
}

function shadow(n) {
  return `<rect class="g-shadow" x="${n.x + 4}" y="${n.y + 4}" width="${n.w}" height="${n.h}"/>`;
}

function stageNode(label, sub, n, active) {
  return `
  <g class="g-node ${active ? "active" : "idle"}">
    ${shadow(n)}
    <rect class="g-node-bg" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}"/>
    <rect class="g-node-head" x="${n.x}" y="${n.y}" width="${n.w}" height="${HEAD_H}"/>
    <text x="${n.cx}" y="${n.y + 13}" text-anchor="middle" class="g-node-title">${label}</text>
    <text x="${n.cx}" y="${n.y + 35}" text-anchor="middle" class="g-node-sub">${sub}</text>
  </g>`;
}

function workerNode(w, active, reduced) {
  const running = w.running || 0;
  const completed = w.completed || 0;
  const failedN = w.failed || 0;
  const cls = [
    "g-node g-worker",
    active ? "active" : "idle",
    running > 0 ? " running" : "",
    failedN > 0 ? " bad" : "",
    completed > 0 && !running ? " done" : "",
  ].join(" ");
  const pulse = reduced ? "" : (running > 0 ? `<rect class="g-pulse" x="${w.cx - 40}" y="${w.y + w.h / 2 - 40}" width="80" height="80"></rect>` : "");
  const headInk = completed > 0 && !running ? "g-title-ink" : "";
  const subInk = running > 0 || failedN > 0 ? "" : "g-sub-ink";
  return `
  <g class="${cls}">
    ${shadow(w)}
    ${pulse}
    <rect class="g-node-bg" x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}"/>
    <rect class="g-node-head" x="${w.x}" y="${w.y}" width="${w.w}" height="${HEAD_H}"/>
    <text x="${w.cx}" y="${w.y + 13}" text-anchor="middle" class="g-node-title ${headInk}">${escapeAttr(w.id)}</text>
    <text x="${w.cx}" y="${w.y + 33}" text-anchor="middle" class="g-node-sub ${subInk}">${w.real ? "ONLINE" : "SLOT"}</text>
    <text x="${w.cx}" y="${w.y + 51}" text-anchor="middle" class="g-node-meta">${running} run · ${completed} ok${failedN ? ` · ${failedN} fail` : ""}</text>
    <text x="${w.cx}" y="${w.y + 64}" text-anchor="middle" class="g-node-tick">${running > 0 ? "▮▮▮" : completed > 0 ? "✓" : ""}</text>
  </g>`;
}

// Human-readable summary used as the graph's accessible label.
export function graphTextSummary({ active, running, workers, taskGroups = {}, reduced }) {
  const parts = [];
  if (!active) parts.push("Idle pipeline: upload, chunker, workers, aggregator, result.");
  else parts.push(`Pipeline state: ${active}.`);
  if (workers) parts.push(`${workers} worker nodes.`);
  if (running) parts.push(`${running} active tasks.`);
  if (Object.keys(taskGroups).length) {
    for (const [id, g] of Object.entries(taskGroups)) {
      parts.push(`${id}: ${g.running} running, ${g.completed} completed, ${g.failed} failed.`);
    }
  }
  if (reduced) parts.push("Motion disabled.");
  return parts.join(" ");
}

function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}