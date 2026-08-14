// Pure state/normalisation helpers — no DOM, unit-testable in Node.

export const JOB_STATUS = ["uploaded", "processing", "completed", "failed"];

export function statusTone(status) {
  switch (status) {
    case "completed": return "ok";
    case "failed": return "bad";
    case "processing": return "accent";
    case "uploaded": return "info";
    default: return "info";
  }
}

export function statusLabel(status) {
  switch (status) {
    case "completed": return "Completed";
    case "failed": return "Failed";
    case "processing": return "Processing";
    case "uploaded": return "Queued";
    default: return status || "Unknown";
  }
}

export function eventTone(kind) {
  switch (kind) {
    case "complete": case "recover": case "result": return "ok";
    case "fail": return "bad";
    case "retry": return "warn";
    case "dispatch": return "accent";
    default: return "info";
  }
}

// Normalise a backend job summary into a compact client model.
export function normalizeJob(job) {
  return {
    id: job.job_id,
    filename: job.filename || "unknown",
    fileSize: job.file_size,
    extension: (job.file_extension || "").toUpperCase(),
    operation: job.operation,
    column: job.column,
    filterValue: job.filter_value,
    chunkSize: job.chunk_size_rows,
    estimatedChunks: job.estimated_chunks || 0,
    rowCount: job.row_count,
    status: job.status,
    progress: job.progress || 0,
    error: job.error_message,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    durationMs: job.duration_ms,
    result: job.result,
    workerUsage: job.worker_usage || {},
    demo: !!job.demo,
  };
}

// Reduce tasks + events into progress counters. All numbers are real.
export function jobProgress(normalizedJob, tasks) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const active = tasks.filter((t) => t.status === "running").length;
  const failed = tasks.filter((t) => t.status === "failed").length;
  const retried = tasks.reduce((acc, t) => acc + Math.max(0, (t.attempts || 1) - 1), 0);
  const total = Math.max(tasks.length, normalizedJob.estimatedChunks || 0);
  const pending = Math.max(0, total - completed - active - failed);
  return { completed, active, pending, failed, retried, total };
}

// Throughput (chunks / second) from real task timestamps.
export function throughputFromTasks(tasks) {
  const done = tasks.filter((t) => t.status === "completed" && t.started_at && t.finished_at);
  if (!done.length) return null;
  const starts = done.map((t) => t.started_at);
  const ends = done.map((t) => t.finished_at);
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = (max - min) / 1000;
  if (span <= 0) return null;
  return done.length / span;
}

// Compute Gantt timeline bar geometry from tasks.
// Returns rows with fractional positions relative to the job window.
export function timelineRows(tasks, nowEpochMs) {
  const hasTime = tasks.some((t) => t.started_at);
  if (!hasTime) return tasks.map((t) => ({ ...t, left: 0, width: 0 }));

  const times = tasks
    .filter((t) => t.started_at)
    .map((t) => t.started_at)
    .concat(tasks.filter((t) => t.finished_at).map((t) => t.finished_at));
  const windowStart = Math.min(...times);
  const windowEnd = Math.max(...times, nowEpochMs);
  const span = Math.max(1, windowEnd - windowStart);

  return tasks.map((t) => {
    if (!t.started_at) return { ...t, left: 0, width: 0, pending: true };
    const left = ((t.started_at - windowStart) / span) * 100;
    const right = t.finished_at ? ((t.finished_at - windowStart) / span) * 100 : 100;
    return { ...t, left, width: Math.max(1.5, right - left), pending: false };
  });
}

// Group tasks by worker node id for the execution graph.
export function groupTasksByWorker(tasks) {
  const groups = {};
  for (const t of tasks) {
    const w = t.worker || "__unassigned__";
    if (!groups[w]) groups[w] = { running: 0, completed: 0, failed: 0, total: 0 };
    groups[w].total += 1;
    if (t.status === "running") groups[w].running += 1;
    else if (t.status === "completed") groups[w].completed += 1;
    else if (t.status === "failed") groups[w].failed += 1;
  }
  return groups;
}

// Merge a set of benchmarks into a scaling curve (rows -> distributed ms),
// sorted by rows. Real data only.
export function scalingCurve(benchmarks) {
  const points = benchmarks
    .filter((b) => b.status === "completed" && b.distributed_ms != null && b.rows > 0)
    .map((b) => ({ rows: b.rows, ms: b.distributed_ms, speedup: b.speedup }))
    .sort((a, b) => a.rows - b.rows);
  return points;
}

export function benchmarkResultOk(b) {
  return b.status === "completed" &&
    b.sequential_result != null &&
    b.distributed_result != null &&
    Math.abs(b.sequential_result - b.distributed_result) < 1e-6;
}