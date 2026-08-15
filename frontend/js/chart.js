// Tiny dependency-free SVG chart used by the benchmark study.
// Pure DOM-free geometry helpers are exported for unit testing.

// Compute pixel geometry for a set of points.
// x is placed on a log scale (workload sizes span decades); y is linear.
export function chartGeometry({ points, width = 640, height = 220, padL = 46, padR = 12, padT = 14, padB = 26 }) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x).filter((v) => v > 0);
  const ys = points.map((p) => [p.a, p.b]).flat().filter((v) => v != null);
  if (!xs.length || !ys.length) return null;

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys) * 1.1;

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const logMin = Math.log10(xMin);
  const logMax = Math.log10(xMax);
  const span = Math.max(1e-6, logMax - logMin);

  const px = (v) => padL + ((Math.log10(v) - logMin) / span) * innerW;
  const py = (v) => padT + (1 - (v / yMax)) * innerH;

  // Ticks: power-of-ten-ish x labels, rounded y labels.
  const xTicks = [];
  for (let e = Math.ceil(logMin); e <= Math.floor(logMax); e++) {
    const v = Math.pow(10, e);
    if (v >= xMin * 0.9 && v <= xMax * 1.1) xTicks.push(v);
  }
  if (xTicks.length < 2) { xTicks.length = 0; xs.forEach((v) => xTicks.push(v)); }
  const yTicks = [0, 0.5, 1].map((f) => yMax * f);

  return { width, height, padL, padR, padT, padB, px, py, xTicks, yTicks, yMax };
}

export function fmtTickRows(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 ? 0 : 0) + "K";
  return String(v);
}

export function fmtMsTick(ms) {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Render an SVG line chart for two series { a, b } per point (x = a key).
export function lineChart({ points, width = 640, height = 220 }) {
  const g = chartGeometry({ points, width, height });
  if (!g) return "";
  const { px, py, xTicks, yTicks, yMax } = g;

  const grid = yTicks.map((y) => `
    <line x1="${g.padL}" y1="${py(y)}" x2="${width - g.padR}" y2="${py(y)}" class="c-grid"/>
    <text x="${g.padL - 6}" y="${py(y) + 3}" text-anchor="end" class="c-tick-y">${fmtMsTick(y)}</text>`).join("");
  const xGrid = xTicks.map((v) => `
    <line x1="${px(v)}" y1="${g.padT}" x2="${px(v)}" y2="${height - g.padB}" class="c-grid-x"/>
    <text x="${px(v)}" y="${height - g.padB + 14}" text-anchor="middle" class="c-tick-x">${fmtTickRows(v)}</text>`).join("");

  const path = (key) => {
    const pts = points.map((p, i) => {
      const y = p[key];
      if (y == null) return null;
      return `${i === 0 ? "M" : "L"} ${px(p.x).toFixed(1)} ${py(y).toFixed(1)}`;
    }).filter(Boolean);
    return pts.join(" ");
  };

  const dots = (key) => points.map((p) => (p[key] == null ? "" : `
    <circle cx="${px(p.x).toFixed(1)}" cy="${py(p[key]).toFixed(1)}" r="3" class="c-dot c-dot-${key}"/>`)).join("");

  return `
  <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Measured runtime scaling: sequential vs distributed milliseconds by row count">
    <line x1="${g.padL}" y1="${height - g.padB}" x2="${width - g.padR}" y2="${height - g.padB}" class="c-axis"/>
    <line x1="${g.padL}" y1="${g.padT}" x2="${g.padL}" y2="${height - g.padB}" class="c-axis"/>
    ${grid}
    ${xGrid}
    <path d="${path("a")}" class="c-line c-line-a" fill="none"/>
    <path d="${path("b")}" class="c-line c-line-b" fill="none"/>
    ${dots("a")}
    ${dots("b")}
  </svg>`;
}