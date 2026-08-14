// Execution graph: a fixed SVG canvas with animated data-flow particles
// between stages. Reacts to real state (job status, system worker counts,
// active task totals). Reduced-motion users get a static graph.

export const GRAPH_STAGES = ["upload", "chunker", "workers", "aggregator", "result"];

const STAGE_META = {
  upload:     { label: "UPLOAD",   sub: "HTTP ingest" },
  chunker:    { label: "CHUNKER",  sub: "Parallelize" },
  workers:    { label: "WORKERS",  sub: "Ray fleet" },
  aggregator: { label: "AGGREGATE", sub: "Merge results" },
  result:     { label: "RESULT",   sub: "Redis store" },
};

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function graphSvg({ width = 720, height = 210 }) {
  const padX = 20;
  const padTop = 66;
  const padBottom = 34;
  const n = GRAPH_STAGES.length;
  const gapX = 46;
  const boxW = Math.max(60, (width - padX * 2 - gapX * (n - 1)) / n);
  const boxH = 48;
  const cy = padTop + boxH / 2;

  const nodes = GRAPH_STAGES.map((key, i) => {
    const x = padX + i * (boxW + gapX);
    const meta = STAGE_META[key];
    return { key, ...meta, x, y: padTop, w: boxW, h: boxH, cx: x + boxW / 2, cy, index: i };
  });

  const edges = nodes.slice(0, -1).map((a, i) => ({ a, b: nodes[i + 1], i }));

  return {
    width, height, nodes, edges,
    // Particle start/end points along each edge (centered lane).
    lanePoints(edge) {
      const a = edge.a, b = edge.b;
      return {
        x1: a.x + a.w - 2,
        y1: a.cy,
        x2: b.x + 2,
        y2: b.cy,
      };
    },
  };
}

function nodeBox(node, active) {
  const cls = ["g-node", active ? "active" : "idle"].join(" ");
  return `
  <g class="${cls}">
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="9" class="g-node-bg"/>
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="2" rx="1" class="g-node-top"/>
    <text x="${node.cx}" y="${node.y + 22}" text-anchor="middle" class="g-node-title">${node.label}</text>
    <text x="${node.cx}" y="${node.y + 39}" text-anchor="middle" class="g-node-sub">${node.sub}</text>
  </g>`;
}

function edgeLine(edge) {
  const { x1, y1, x2, y2 } = edge;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="g-edge"/>`;
}

function particles(edge, count, reduced) {
  if (reduced) return "";
  let out = "";
  for (let k = 0; k < count; k++) {
    const d = `${(edge.i + k / count) * 1.4}s`;
    out += `<circle r="2.4" class="g-particle"><animateMotion dur="${d}" repeatCount="indefinite" begin="${(k * 0.6 - edge.i * 0.3)}s">
      <mpath href="#edge${edge.i}"/>
    </animateMotion></circle>`;
  }
  return out;
}

function pathDefs(edges) {
  return edges
    .map((e) => {
      const { x1, y1, x2, y2 } = e;
      const mid = ((x1 + x2) / 2 + (e.a.cx + e.b.cx) / 2) / 2;
      return `<path id="edge${e.i}" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" fill="none"/>`;
    })
    .join("");
}

export function renderGraph({ width = 720, height = 210, active, progress = 0, workers = 0, running = 0 }) {
  const reduced = prefersReducedMotion();
  const g = graphSvg({ width, height });
  // Which stages light up:
  // upload+chunker lit when job present/processing; workers lit while running>0
  // or when any job; aggregator+result lit on completed/failed/processing.
  const hasJob = !!active;
  const isLive = hasJob && (active === "processing");
  const stageActive = {
    upload: hasJob,
    chunker: hasJob,
    workers: isLive || running > 0 || (hasJob && active === "completed"),
    aggregator: isLive || (hasJob && (active === "completed" || active === "failed")),
    result: (hasJob && active === "completed") || (hasJob && active === "failed"),
  };

  const nodeLayer = g.nodes.map((n) => nodeBox(n, stageActive[n.key])).join("");
  const edgeLayer = g.edges.map((e) => edgeLine({ ...e, ...g.lanePoints(e) })).join("");
  const activeEdges = g.edges.filter((e) => stageActive[e.a.key] && stageActive[e.b.key]);
  const particleLayer = activeEdges
    .map((e) => particles({ ...e, ...g.lanePoints(e) }, reduced ? 0 : 2, reduced))
    .join("");
  const edgePaths = pathDefs(g.edges.map((e) => ({ ...e, ...g.lanePoints(e) })));

  const foot = `
  <g class="g-footer">
    <text x="${padX(g)}" y="${height - 12}" class="g-foot-note">${hasJob ? `job: ${active || "—"}` : "idle — awaiting job"}</text>
    <text x="${width - padX(g)}" y="${height - 12}" text-anchor="end" class="g-foot-note">${workers} nodes · ${running} active tasks</text>
  </g>`;

  function padX(g) { return 20; }

  return `
  <svg class="exec-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distributed execution pipeline">
    <defs>
      <marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-2)"/>
      </marker>
    </defs>
    ${edgePaths}
    ${edgeLayer}
    ${nodeLayer}
    ${particleLayer}
    ${foot}
  </svg>`;
}

export function stageDot(key, active) {
  return `<span class="g-dot ${active ? "on" : ""}" data-stage="${key}"></span>`;
}