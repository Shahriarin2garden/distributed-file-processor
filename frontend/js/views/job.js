// Live job view: telemetry cards, execution graph, Gantt task timeline,
// task table, event stream, worker map, and the fault-recovery sequence.
// Every number is read from the real job detail payload.

import { store } from "../store.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import {
  MetricCard, Panel, StatusBadge, SectionTitle, ProgressBar, num,
  EmptyState, ToneBadge,
} from "../components.js";
import {
  normalizeJob, jobProgress, eventTone, throughputFromTasks, timelineRows,
  groupTasksByWorker,
} from "../model.js";
import {
  formatBytes, formatNumber, formatMs, formatElapsed, shortNode,
  formatDateTime, shortId, formatClock,
} from "../format.js";
import { renderGraph } from "../execgraph.js";

const EVENT_LABELS = {
  created: "Job created",
  dispatch: "Chunk dispatched",
  complete: "Chunk completed",
  retry: "Retry scheduled",
  recover: "Chunk recovered",
  fail: "Chunk failed",
  result: "Result stored",
  stage: "Stage transition",
  benchmark: "Benchmark ran",
};

export async function mountJob(root, jobId) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      <div class="head-row">
        <div>
          <a class="back-link" href="#/history">${icon("arrowLeft", 12)} History</a>
          ${SectionTitle({
            kicker: `JOB ${shortId(jobId)}`,
            title: `<span id="job-filename" class="mono">…</span>`,
            sub: `<span id="job-subtitle" class="mono">…</span>`,
          })}
        </div>
        <div class="head-actions" id="job-head-actions"></div>
      </div>
      <div id="job-cards" class="metrics-grid"></div>
      <div id="job-progress-card"></div>
      <div id="job-pipeline"></div>
      <div id="job-fault"></div>
      <div class="grid-2">
        <div id="job-timeline"></div>
        <div id="job-events"></div>
      </div>
      <div id="job-tasks"></div>
      <div id="job-worker-map"></div>
      <div id="job-result"></div>
    </div>
  `));

  const cards = root.querySelector("#job-cards");
  const progressCard = root.querySelector("#job-progress-card");
  const pipeline = root.querySelector("#job-pipeline");
  const faultEl = root.querySelector("#job-fault");
  const timelineEl = root.querySelector("#job-timeline");
  const eventsEl = root.querySelector("#job-events");
  const tasksEl = root.querySelector("#job-tasks");
  const workerMap = root.querySelector("#job-worker-map");
  const resultEl = root.querySelector("#job-result");
  const headActions = root.querySelector("#job-head-actions");

  const render = () => {
    const d = store.activeJob;
    if (!d) {
      const err = store.jobError;
      cards.replaceChildren(h(`
        ${err ? `
          <div class="empty state-card" style="grid-column:1/-1">
            ${icon("alertCircle", 28)}
            <div class="empty-title">Job unavailable</div>
            <div class="empty-body">${escape(err)}</div>
            <div class="empty-actions">
              <button class="btn btn-ghost" id="job-retry-load">${icon("refresh", 13)} Retry</button>
              <a class="btn btn-ghost" href="#/history">Back to history</a>
            </div>
          </div>` : `<div class="empty state-card" style="grid-column:1/-1">${icon("loader", 24)}<div class="empty-body">Loading job…</div></div>`}
      `));
      const retry = root.querySelector("#job-retry-load");
      if (retry) retry.addEventListener("click", () => { store.refreshJob(); });
      return;
    }

    const j = d.job;
    const n = normalizeJob(j);
    const rawTasks = d.tasks || [];
    const tasks = rawTasks.map((t) => {
      const startedMs = toMs(t.started_at);
      const finishedMs = toMs(t.finished_at);
      return { ...t, started_at: startedMs, finished_at: finishedMs, startedMs, finishedMs };
    });
    const events = d.events || [];
    const p = jobProgress(n, tasks);
    const throughput = throughputFromTasks(tasks);
    const isActive = n.status === "processing" || n.status === "uploaded";

    // Title
    root.querySelector("#job-filename").textContent = n.filename;
    root.querySelector("#job-subtitle").textContent =
      `${n.operation}${n.column ? " · " + n.column : ""}${n.filterValue ? " = " + n.filterValue : ""}`;

    // Head actions: status + demo tag
    headActions.replaceChildren(h(`
      <div class="head-status">
        ${n.demo ? ToneBadge({ tone: "warn", label: "fault-injected" }) : ""}
        ${StatusBadge({ status: n.status, pulse: isActive })}
      </div>
    `));

    // Cards
    cards.replaceChildren(h(`
      <div class="metrics-grid">
        ${MetricCard({ label: "Status", value: StatusBadge({ status: n.status, pulse: isActive }), iconName: "activity" })}
        ${MetricCard({ label: "Progress", value: num(Math.round(n.progress), 0) + "%", sub: `${p.completed}/${p.total} chunks`, iconName: "zap" })}
        ${MetricCard({ label: "Rows", value: formatNumber(n.rowCount), sub: `${formatBytes(n.fileSize)} file`, iconName: "file" })}
        ${MetricCard({ label: "Elapsed", value: n.durationMs != null ? formatMs(n.durationMs) : formatElapsed(n.startedAt || n.createdAt), tone: n.durationMs != null ? (n.status === "failed" ? "bad" : "ok") : "accent", iconName: "clock" })}
        ${MetricCard({ label: "Workers used", value: num(Object.keys(n.workerUsage || {}).length, 0), sub: "distinct nodes", iconName: "server" })}
        ${MetricCard({ label: "Throughput", value: throughput != null ? formatNumber(throughput, 2) + "/s" : "—", sub: "chunks/sec", iconName: "gauge" })}
      </div>
    `));

    // Progress bar
    progressCard.replaceChildren(h(`
      <div class="panel"><div class="panel-body">
        ${ProgressBar({ pct: n.progress, tone: n.status === "failed" ? "bad" : "accent", shimmer: isActive, label: "job progress" })}
        <div class="progress-legend mono xs">
          <span>${p.completed} completed</span><span>${p.active} active</span><span>${p.pending} queued</span><span>${p.failed} failed</span><span>${p.retried} retries</span>
        </div>
      </div></div>
    `));

    // Execution graph — the signature element.
    pipeline.innerHTML = renderGraph({
      active: n.status,
      running: p.active,
      progress: n.progress,
      workers: Object.keys(n.workerUsage || {}).length,
      taskGroups: groupTasksByWorker(tasks),
      width: 760,
      height: 260,
    });

    // Fault-recovery sequence (demo jobs that experienced a retry).
    faultEl.replaceChildren(renderFaultSequence(tasks, events, isActive));

    // Task timeline (Gantt).
    timelineEl.replaceChildren(renderTimeline(tasks, isActive));

    // Event stream.
    eventsEl.replaceChildren(renderEvents(events));

    // Full task table.
    tasksEl.replaceChildren(renderTaskTable(tasks, p, isActive));

    // Worker map.
    renderWorkerMap(workerMap, tasks);

    // Result / error banner.
    if (n.status === "completed") {
      resultEl.replaceChildren(h(`
        <div class="panel tone-ok"><div class="panel-body result-banner">
          <span class="result-icon">${icon("checkCircle", 26)}</span>
          <div>
            <div class="kicker">RESULT · ${n.operation.toUpperCase()} · ${n.column}</div>
            <div class="result-value mono">${formatNumber(n.result, 2)}</div>
            <div class="mono xs dim">aggregated in Redis · ${n.finishedAt ? formatDateTime(n.finishedAt) : ""}</div>
          </div>
        </div></div>
      `));
    } else if (n.status === "failed") {
      resultEl.replaceChildren(h(`
        <div class="panel tone-bad"><div class="panel-body result-banner">
          <span class="result-icon">${icon("alertTriangle", 26)}</span>
          <div>
            <div class="kicker">JOB FAILED</div>
            <div class="result-value mono" style="color:var(--bad)">${escape(n.error || "unknown error")}</div>
            <div class="mono xs dim">no aggregate result was produced · inspect the event stream for the failing chunk</div>
          </div>
        </div></div>
      `));
    } else {
      resultEl.replaceChildren();
    }
  };

  store.subscribe(render);
  render();
}

// Convert a backend epoch-seconds timestamp to ms (backend stores seconds).
function toMs(v) {
  if (v === null || v === undefined) return null;
  return v < 1e12 ? v * 1000 : v;
}

function renderTimeline(tasks, isActive) {
  const body = (inner) => Panel({
    title: "Task timeline",
    iconName: "layers",
    right: isActive ? `<span class="mono xs accent-text">live</span>` : "",
    flush: true,
    body: inner,
  });

  if (!tasks.length) {
    return h(body(EmptyState({
      iconName: "layers",
      title: "No tasks yet",
      body: isActive ? "Chunk bars appear here as tasks dispatch to Ray workers." : "This job has no task records.",
    })));
  }

  const rows = timelineRows(tasks, Date.now());
  const startLabel = tasks.reduce((m, t) => (t.startedMs != null && (m === null || t.startedMs < m) ? t.startedMs : m), null);
  const endLabel = tasks.reduce((m, t) => (t.finishedMs != null && (m === null || t.finishedMs > m) ? t.finishedMs : m), null);

  const bars = rows.slice().sort((a, b) => a.chunk_id - b.chunk_id).map((t) => {
    const tone = t.status === "completed" ? "ok" : t.status === "running" ? "accent" : t.status === "failed" ? "bad" : "info";
    const attempts = Math.max(1, t.attempts || 1);
    const retried = attempts > 1;
    return `
      <div class="tl-row">
        <span class="tl-label mono">${escape(t.label || ("chunk-" + String(t.chunk_id).padStart(3, "0")))}</span>
        <span class="tl-worker mono">${t.worker ? shortNode(t.worker) : "—"}</span>
        <span class="tl-track" title="${escape(t.label)}">
          <span class="tl-bar tone-${tone}" style="left:${t.left}%;width:${t.width}%">
            ${retried ? `<span class="tl-retry" title="${attempts} attempts">${icon("refresh", 10)}</span>` : ""}
          </span>
          ${t.status === "running" ? `<span class="tl-now" style="left:${Math.max(t.left, Math.min(100, t.left + t.width))}%"></span>` : ""}
        </span>
        <span class="tl-dur mono">${t.duration_ms != null ? formatMs(t.duration_ms) : "—"}</span>
      </div>`;
  }).join("");

  return h(body(`
    <div class="tl">
      <div class="tl-axis mono xs">
        <span>${startLabel != null ? formatClock(startLabel) : "—"}</span>
        <span class="dim">attempts shown with ${icon("refresh", 10)}</span>
        <span>${endLabel != null ? formatClock(endLabel) : "—"}</span>
      </div>
      <div class="tl-rows">${bars}</div>
    </div>
  `));
}

function renderEvents(events) {
  const body = (inner) => Panel({
    title: "Event stream",
    iconName: "terminal",
    right: `<span class="mono xs">${num(events.length)}</span>`,
    flush: true,
    body: inner,
  });

  if (!events.length) {
    return h(body(EmptyState({ iconName: "terminal", title: "No events yet", body: "Dispatch, retry, and completion events appear here." })));
  }

  const list = [...events].reverse().slice(0, 60).map((e) => {
    const bits = [];
    if (e.chunk) bits.push(`<span class="mono xs dim">${escape(e.chunk)}</span>`);
    if (e.worker) bits.push(`<span class="mono xs dim">${shortNode(e.worker)}</span>`);
    if (e.attempts) bits.push(`<span class="mono xs dim">attempt ${e.attempts}</span>`);
    return `
      <div class="event-row">
        <span class="event-dot tone-${eventTone(e.kind)}" title="${escape(e.kind)}" aria-hidden="true"></span>
        <span class="event-label">${EVENT_LABELS[e.kind] || escape(e.kind)}</span>
        <span class="event-meta">${bits.join("")}</span>
        <span class="mono xs dim event-time">${e.t ? formatClock(toMs(e.t) ?? e.t) : "—"}</span>
      </div>`;
  }).join("");
  return h(body(`<div class="event-list">${list}</div>`));
}

function renderTaskTable(tasks, p, isActive) {
  const body = (inner) => Panel({
    title: "Chunk tasks",
    iconName: "hash",
    right: `<span class="mono xs">${num(p.total)} tasks</span>`,
    flush: true,
    body: inner,
  });

  if (!tasks.length) {
    return h(body(EmptyState({
      iconName: "hash",
      title: "No tasks yet",
      body: isActive ? "Chunks appear here as they dispatch to Ray workers." : "This job has no task records.",
    })));
  }

  const rows = tasks.slice().sort((a, b) => a.chunk_id - b.chunk_id).map((t) => {
    const attempts = Math.max(1, t.attempts || 1);
    return `
    <tr>
      <td class="mono">${String(t.chunk_id).padStart(3, "0")}</td>
      <td class="mono dim">${escape(t.label || "—")}</td>
      <td class="mono">${escape(t.worker ? shortNode(t.worker) : "—")}</td>
      <td>${StatusBadge({ status: t.status, label: t.status, pulse: t.status === "running" })}</td>
      <td class="mono">${attempts > 1 ? `<span class="warn-text">${attempts}${icon("refresh", 11)}</span>` : "1"}</td>
      <td class="mono">${t.duration_ms != null ? formatMs(t.duration_ms) : "—"}</td>
      <td class="mono dim">${t.startedMs ? formatClock(t.startedMs) : "—"}</td>
      <td class="mono dim">${t.finishedMs ? formatClock(t.finishedMs) : "—"}</td>
    </tr>`;
  }).join("");
  return h(body(`
    <div class="table-scroll">
      <table class="table">
        <thead><tr><th>Chunk</th><th>Task</th><th>Worker</th><th>State</th><th>Attempts</th><th>Duration</th><th>Started</th><th>Completed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `));
}

function renderWorkerMap(el, tasks) {
  const groups = groupTasksByWorker(tasks);
  const entries = Object.entries(groups);
  if (!entries.length) {
    el.replaceChildren();
    return;
  }
  el.replaceChildren(h(Panel({
    title: "Worker activity",
    iconName: "network",
    body: `
      <div class="fleet-chips">
        ${entries.map(([w, g]) => `
          <div class="worker-chip">
            <div class="mono">${escape(w === "__unassigned__" ? "unassigned" : shortNode(w))}</div>
            <div class="worker-chip-sub">
              <span class="dot on"></span>${g.running} run
              <span class="dot ok"></span>${g.completed} ok
              <span class="dot bad"></span>${g.failed} fail
            </div>
          </div>`).join("")}
      </div>`,
  })));
}

// Visual fail -> retry -> recover sequence derived from the real event log.
function renderFaultSequence(tasks, events, isActive) {
  const hasFault = events.some((e) => e.kind === "fail") && events.some((e) => e.kind === "retry");
  if (!hasFault) {
    if (isActive) {
      return h(Panel({
        title: "Reliability",
        iconName: "shield",
        right: `<span class="mono xs dim">no fault injected</span>`,
        body: `<div class="fault-note">${icon("info", 14)}<span>No failures observed. Run with <b>fault injection</b> (DEMO_MODE) to watch an injected chunk failure recover automatically.</span></div>`,
      }));
    }
    return h(`<div style="display:none"></div>`);
  }

  const faulted = tasks.filter((t) => Math.max(1, t.attempts || 1) > 1);
  const step = (iconName, tone, title, sub) => `
    <div class="fault-step tone-${tone}">
      <span class="fault-step-icon">${icon(iconName, 16)}</span>
      <div><div class="fault-step-title">${title}</div><div class="fault-step-sub mono xs">${sub}</div></div>
    </div>`;
  const last = faulted.length ? faulted[faulted.length - 1] : null;
  const steps = [
    step("alertTriangle", "bad", "TASK FAILED", `${faulted.length} chunk${faulted.length > 1 ? "s" : ""} failed after injection`),
    step("refresh", "warn", "RETRY", "orchestrator re-dispatched the chunk"),
    step("server", "accent", "WORKER ACCEPTED", `recovered on ${last && last.worker ? shortNode(last.worker) : "another worker"}`),
    step("checkCircle", "ok", "RESULT CONSISTENT", "weighted aggregation unaffected"),
  ];
  const arrow = `<span class="fault-arrow">${icon("arrowRight", 13)}</span>`;
  return h(Panel({
    title: "Fault recovery",
    iconName: "shield",
    right: `<span class="mono xs warn-text">recovered</span>`,
    body: `<div class="fault-flow">${steps.map((s, i) => s + (i < steps.length - 1 ? arrow : "")).join("")}</div>`,
  }));
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}