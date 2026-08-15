// Unit tests for the chart geometry helpers. Run: node --test tests-js/chart.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { chartGeometry, fmtTickRows, fmtMsTick, lineChart } from "../frontend/js/chart.js";

test("chartGeometry computes pixel ranges", () => {
  const g = chartGeometry({
    points: [
      { x: 1000, a: 10, b: 30 },
      { x: 10000, a: 40, b: 20 },
      { x: 100000, a: 100, b: 60 },
    ],
    width: 640, height: 220,
  });
  assert.ok(g);
  assert.equal(g.width, 640);
  // px is monotonic increasing on log scale.
  assert.ok(g.px(1000) < g.px(100000));
  // py is decreasing with larger values.
  assert.ok(g.py(10) > g.py(100));
  // x ticks are powers of ten within the range.
  assert.ok(g.xTicks.includes(1000) && g.xTicks.includes(100000));
  assert.ok(g.yTicks.length === 3);
});

test("chartGeometry rejects empty input", () => {
  assert.equal(chartGeometry({ points: [] }), null);
  assert.equal(chartGeometry({ points: [{ x: 0, a: null, b: null }] }), null);
});

test("fmtTickRows shortens large values", () => {
  assert.equal(fmtTickRows(1000), "1K");
  assert.equal(fmtTickRows(1500), "2K");
  assert.equal(fmtTickRows(1000000), "1M");
  assert.equal(fmtTickRows(500), "500");
});

test("fmtMsTick formats sub-second ms", () => {
  assert.equal(fmtMsTick(0.5), "500µs");
  assert.equal(fmtMsTick(42), "42ms");
  assert.equal(fmtMsTick(1500), "1.5s");
});

test("lineChart renders SVG with both series", () => {
  const svg = lineChart({
    points: [
      { x: 1000, a: 10, b: 30 },
      { x: 10000, a: 40, b: 20 },
    ],
  });
  assert.ok(svg.includes('<svg class="line-chart"'));
  assert.ok(svg.includes("c-line-a"));
  assert.ok(svg.includes("c-line-b"));
  assert.ok(svg.includes("c-dot-a"));
  assert.ok(svg.includes("role=\"img\""));
});

test("lineChart returns empty string with no points", () => {
  assert.equal(lineChart({ points: [] }), "");
});