// Unit tests for pure model helpers. Run: node --test tests-js/model.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusTone, statusLabel, eventTone, normalizeJob, jobProgress,
  throughputFromTasks, timelineRows, groupTasksByWorker, scalingCurve, benchmarkResultOk,
} from "../frontend/js/model.js";

test("statusTone / statusLabel", () => {
  assert.equal(statusTone("completed"), "ok");
  assert.equal(statusTone("failed"), "bad");
  assert.equal(statusTone("processing"), "accent");
  assert.equal(statusTone("uploaded"), "info");
  assert.equal(statusLabel("processing"), "Processing");
  assert.equal(statusLabel("bogus"), "bogus");
});

test("eventTone", () => {
  assert.equal(eventTone("complete"), "ok");
  assert.equal(eventTone("recover"), "ok");
  assert.equal(eventTone("fail"), "bad");
  assert.equal(eventTone("retry"), "warn");
  assert.equal(eventTone("dispatch"), "accent");
  assert.equal(eventTone("unknown"), "info");
});

test("normalizeJob maps backend fields", () => {
  const n = normalizeJob({
    job_id: "abc", filename: "x.csv", file_size: 10, file_extension: "csv",
    operation: "sum", column: "amount", chunk_size_rows: 5, estimated_chunks: 2,
    row_count: 10, status: "completed", progress: 1, error_message: null,
    created_at: "2026-01-01T00:00:00Z", duration_ms: 42, result: 1500,
    worker_usage: { w1: 2 }, demo: true,
  });
  assert.equal(n.id, "abc");
  assert.equal(n.extension, "CSV");
  assert.equal(n.status, "completed");
  assert.equal(n.durationMs, 42);
  assert.equal(n.result, 1500);
  assert.equal(n.demo, true);
});

test("jobProgress counts tasks", () => {
  const tasks = [
    { status: "completed", attempts: 1 },
    { status: "completed", attempts: 2 },
    { status: "running", attempts: 1 },
    { status: "failed", attempts: 1 },
  ];
  const p = jobProgress({ estimatedChunks: 5 }, tasks);
  assert.equal(p.completed, 2);
  assert.equal(p.active, 1);
  assert.equal(p.failed, 1);
  assert.equal(p.pending, 1);
  assert.equal(p.total, 5);
  assert.equal(p.retried, 1);
});

test("throughputFromTasks computes chunks/sec", () => {
  const t0 = 1_000_000;
  const tasks = [
    { status: "completed", started_at: t0, finished_at: t0 + 1000 },
    { status: "completed", started_at: t0 + 500, finished_at: t0 + 2000 },
  ];
  const tp = throughputFromTasks(tasks);
  assert.ok(tp !== null);
  assert.equal(tp, 1); // 2 chunks over a 2s window
  assert.equal(throughputFromTasks([{ status: "failed" }]), null);
  assert.equal(throughputFromTasks([]), null);
});

test("timelineRows computes geometry", () => {
  const t0 = 1_000_000;
  const tasks = [
    { status: "completed", started_at: t0, finished_at: t0 + 1000 },
    { status: "running", started_at: t0 + 500, finished_at: null },
  ];
  const rows = timelineRows(tasks, t0 + 2000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pending, false);
  assert.ok(rows[0].left >= 0 && rows[0].left <= 100);
  assert.ok(rows[1].width > 0);
  assert.equal(rows[0].width, 50); // task spans [0,1000] over a 2000ms window
});

test("groupTasksByWorker", () => {
  const groups = groupTasksByWorker([
    { status: "running", worker: "node:a" },
    { status: "completed", worker: "node:a" },
    { status: "failed", worker: "node:b" },
  ]);
  assert.equal(groups["node:a"].running, 1);
  assert.equal(groups["node:a"].completed, 1);
  assert.equal(groups["node:b"].failed, 1);
  assert.equal(groups["node:a"].total, 2);
});

test("scalingCurve sorts real data only", () => {
  const curve = scalingCurve([
    { status: "completed", rows: 2000, distributed_ms: 20, speedup: 2 },
    { status: "failed", rows: 9999, distributed_ms: null, speedup: null },
    { status: "completed", rows: 1000, distributed_ms: 10, speedup: 1.5 },
  ]);
  assert.equal(curve.length, 2);
  assert.equal(curve[0].rows, 1000);
  assert.equal(curve[1].rows, 2000);
});

test("benchmarkResultOk", () => {
  assert.equal(benchmarkResultOk({ status: "completed", sequential_result: 5, distributed_result: 5 }), true);
  assert.equal(benchmarkResultOk({ status: "completed", sequential_result: 5, distributed_result: 6 }), false);
  assert.equal(benchmarkResultOk({ status: "running" }), false);
});