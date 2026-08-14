import { store } from "../store.js";
import { api } from "../api.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import {
  MetricCard, Panel, StatusBadge, SectionTitle, ProgressBar, num,
  EmptyState,
} from "../components.js";
import {
  normalizeJob, jobProgress, eventTone, throughputFromTasks, timelineRows,
  groupTasksByWorker,
} from "../model.js";
import { formatBytes, formatNumber, formatMs, formatElapsed, shortNode, formatDateTime, shortId } from "../format.js";
import { renderGraph } from "../execgraph.js";

const EVENT_LABELS = {
  created: "Job created",
  dispatch: "Chunk dispatched",
  complete: "Chunk completed",
  retry: "Chunk retried",
  recover: "Chunk recovered",
  fail: "Chunk failed",
  result: "Result stored",
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
            kicker: `JOB ${jobId.slice(0, 8)}`,
            title: `<span id="job-filename" class="mono">…</span>`,
            sub: `<span id="job-subtitle" class="mono">…</span>`,
          })}
        </div>
        <div class="head-actions" id="job-head-actions"></div>
      </div>
      <div id="job-cards" class="metrics-grid"></div>
      <div id="job-progress-card"></div>
      <div id="job-pipeline"></div>
      <div class="grid-2">
        <div id="job-tasks"></div>
        <div id="job-events"></div>
      </div>
      <div id="job-worker-map"></div>
      <div id="job-result"></div>
    </div>
  `));

  const cards = root.querySelector("#job-cards");
  const progressCard = root.querySelector("#job-progress-card");
  const pipeline = root.querySelector("#job-pipeline");
  const tasksEl = root.querySelector("#job-tasks");
  const eventsEl = root.querySelector("#job-events");
  const workerMap = root.querySelector("#job-worker-map");
  const resultEl = root.querySelector("#job-result");
  const headActions = root.querySelector("#job-head-actions");

  const render = () => {
    const d = store.activeJob;
    if (!d) {
      const err = store.jobError;
      cards.replaceChildren(h(`
        ${err ? `
          <div class="empty" style="grid-column:1/-1">
            ${icon("alertCircle", 28)}
            <div class="empty-title">Job unavailable</div>
            <div class="empty-body">${err}</div>
            <a class="btn btn-ghost" href="#/history">Back to history</a>
          </div>` : `<div class="empty" style="grid-column:1/-1">${icon("loader", 24)}<div class="empty-body">Loading job…</div></div>`}
      `));
      return;
    }

    const j = d.job;
    const n = normalizeJob(j);
    const tasks = d.tasks || [];
    const events = d.events || [];
    const p = jobProgress(n, tasks);
    const throughput = throughputFromTasks(tasks);
    const isActive = n.status === "processing" || n.status === "uploaded";

    // Title
    root.querySelector("#job-filename").textContent = n.filename;
    root.querySelector("#job-subtitle").textContent =
      `${n.operation}${n.column ? " · " + n.column : ""}${n.filterValue ? " = " + n.filterValue : ""}`;

    // Cards
    cards.replaceChildren();
    cards.appendChild(h(`
      <div class="metrics-grid">
        ${MetricCard({ label: "Status", value: StatusBadge({ status: n.status, pulse: isActive }), iconName: "activity" })}
        ${MetricCard({ label: "Progress", value: num(Math.round(n.progress * 100), 0) + "%", sub: `${p.completed}/${p.total} chunks`, iconName: "zap" })}
        ${MetricCard({ label: "Rows", value: formatNumber(n.rowCount), sub: `${formatBytes(n.fileSize)} file`, iconName: "file" })}
        ${MetricCard({ label: "Elapsed", value: n.durationMs != null ? formatMs(n.durationMs) : formatElapsed(n.startedAt || n.createdAt), tone: n.durationMs != null ? (n.status === "failed" ? "bad" : "ok") : "accent", iconName: "clock" })}
        ${MetricCard({ label: "Workers used", value: num(Object.keys(n.workerUsage || {}).length, 0), sub: "distinct nodes", iconName: "server" })}
        ${MetricCard({ label: "Throughput", value: throughput != null ? formatNumber(throughput, 2) + "/s" : "—", sub: "chunks/sec", iconName: "gauge" })}
      </div>
    `));

    // Progress bar
    progressCard.replaceChildren(h(`
      <div class="panel"><div class="panel-body">
        ${ProgressBar({ pct: n.progress * 100, tone: n.status === "failed" ? "bad" : "accent", shimmer: isActive, label: "job progress" })}
        <div class="progress-legend mono xs">
          <span>${p.completed} completed</span><span>${p.active} active</span><span>${p.pending} queued</span><span>${p.failed} failed</span><span>${p.retried} retries</span>
        </div>
      </div></div>
    `));

    // Pipeline
    pipeline.innerHTML = renderGraph({
      active: n.status,
      running: p.active,
      workers: Object.keys(n.workerUsage || {}).length,
      width: 720,
      height: 190,
    });

    // Task table
    if (!tasks.length) {
      tasksEl.replaceChildren(h(Panel({
        title: "Chunks",
        iconName: "layers",
        body: EmptyState({ iconName: "layers", title: "No chunks yet", body: isActive ? "Chunks appear here as they dispatch to Ray workers." : "This job has no task records." }),
      })));
    } else {
      const rows = tasks.map((t) => {
        const tone = t.status === "completed" ? "ok" : t.status === "running" ? "accent" : t.status === "failed" ? "bad" : "info";
        const attempts = Math.max(1, t.attempts || 1);
        return `
        <tr>
          <td class="mono">${t.chunk_index}</td>
          <td class="mono dim">${shortId(t.task_id)}</td>
          <td class="mono">${escape(shortNode(t.worker || "—"))}</td>
          <td>${StatusBadge({ status: t.status, label: t.status, pulse: t.status === "running" })}</td>
          <td class="mono">${t.duration_ms != null ? formatMs(t.duration_ms) : "—"}</td>
          <td class="mono">${attempts > 1 ? `<span class="warn-text">${attempts}${icon("refresh", 11)}</span>` : "1"}</td>
          <td class="mono dim">${t.started_at ? formatClock(t.started_at) : "—"}</td>
        </tr>`;
      }).join("");
      tasksEl.replaceChildren(h(Panel({
        title: "Chunks",
        iconName: "layers",
        right: `<span class="mono xs">${num(p.completed + p.active + p.pending + p.failed)} tasks</span>`,
        flush: true,
        body: `
          <table class="table">
            <thead><tr><th>#</th><th>Task</th><th>Worker</th><th>Status</th><th>Duration</th><th>Attempts</th><th>Started</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`,
      })));
    }

    // Events
    if (!events.length) {
      eventsEl.replaceChildren(h(Panel({
        title: "Event log",
        iconName: "terminal",
        body: EmptyState({ iconName: "terminal", title: "No events yet" }),
      })));
    } else {
      const list = [...events].reverse().slice(0, 40).map((e) => `
        <div class="event-row">
          <span class="event-dot tone-${eventTone(e.kind)}" title="${escape(e.kind)}"></span>
          <span class="event-label">${EVENT_LABELS[e.kind] || escape(e.kind)}</span>
          ${e.chunk_index !== undefined ? `<span class="mono xs dim">chunk ${e.chunk_index}</span>` : ""}
          <span class="mono xs dim event-time">${formatClock(e.timestamp)}</span>
        </div>`).join("");
      eventsEl.replaceChildren(h(Panel({
        title: "Event log",
        iconName: "terminal",
        right: `<span class="mono xs">${num(events.length)}</span>`,
        flush: true,
        body: `<div class="event-list">${list}</div>`,
      })));
    }

    // Worker map
    const groups = groupTasksByWorker(tasks);
    const entries = Object.entries(groups);
    if (entries.length) {
      workerMap.replaceChildren(h(Panel({
        title: "Worker activity",
        iconName: "network",
        body: `
          <div class="fleet-chips">
            ${entries.map(([w, g]) => `
              <div class="worker-chip">
                <div class="mono">${escape(w === "__unassigned__" ? "unassigned" : shortNode(w))}</div>
                <div class="worker-chip-sub">
                  <span class="dot on" style="background:var(--accent)"></span>${g.running} run
                  <span class="dot" style="background:var(--ok)"></span>${g.completed} ok
                  <span class="dot" style="background:var(--bad)"></span>${g.failed} fail
                </div>
              </div>`).join("")}
          </div>`,
      })));
    } else {
      workerMap.replaceChildren();
    }

    // Result / error
    if (n.status === "completed") {
      resultEl.replaceChildren(h(`
        <div class="panel tone-ok"><div class="panel-body result-banner">
          <span class="result-icon">${icon("checkCircle", 26)}</span>
          <div>
            <div class="kicker">RESULT · ${n.operation.toUpperCase()}</div>
            <div class="result-value mono">${formatNumber(n.result, 2)}</div>
            <div class="mono xs dim">stored in Redis · ${n.finishedAt ? formatDateTime(n.finishedAt) : ""}</div>
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
            <div class="mono xs dim">no aggregate result was produced</div>
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

function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (x) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}