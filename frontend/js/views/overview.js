import { store } from "../store.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import {
  MetricCard, Panel, StatusBadge, EmptyState, num,
} from "../components.js";
import { normalizeJob, jobProgress } from "../model.js";
import { formatBytes, formatNumber, timeAgo, shortNode } from "../format.js";
import { renderGraph } from "../execgraph.js";

export async function mountOverview(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      <section class="hero">
        <div class="hero-grid" aria-hidden="true"></div>
        <div class="kicker">DISTRIBUTED FILE PROCESSING</div>
        <h1 class="hero-title">Distributed compute,<br />visualized.</h1>
        <p class="hero-sub">Split large datasets into parallel workloads, execute them across Ray workers, and inspect the entire lifecycle in real time.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/new">${icon("plus", 15)} Run a job</a>
          <a class="btn btn-ghost" href="#/architecture">${icon("gitBranch", 15)} Explore architecture</a>
        </div>
      </section>

      <div class="section-label">System telemetry</div>
      <div id="ov-cards" class="metrics-grid"></div>

      <div class="grid-2">
        ${Panel({
          title: "Execution pipeline",
          iconName: "activity",
          id: "ov-pipeline",
          right: `<span class="mono xs accent-text" id="ov-pipeline-note">live</span>`,
        })}
        ${Panel({
          title: "Recent jobs",
          iconName: "clock",
          id: "ov-recent",
          right: `<a class="btn btn-ghost btn-sm" href="#/history">View all</a>`,
          body: `<div id="ov-recent-body"></div>`,
        })}
      </div>
      <div class="grid-2">
        ${Panel({
          title: "Worker fleet",
          iconName: "server",
          id: "ov-fleet",
          body: `<div id="ov-fleet-body"></div>`,
        })}
        ${Panel({
          title: "Live task telemetry",
          iconName: "gauge",
          id: "ov-tasks",
          body: `<div id="ov-tasks-body"></div>`,
        })}
      </div>
    </div>
  `));

  const cards = root.querySelector("#ov-cards");
  const pipeline = root.querySelector("#ov-pipeline .panel-body");
  const pipelineNote = root.querySelector("#ov-pipeline-note");
  const recent = root.querySelector("#ov-recent-body");
  const fleet = root.querySelector("#ov-fleet-body");
  const tasksBody = root.querySelector("#ov-tasks-body");

  const render = () => {
    const sys = store.system;
    const jobs = store.jobs;
    const workers = sys?.nodes?.length ?? null;

    const activeJobs = jobs?.filter((j) => j.status === "processing" || j.status === "uploaded").length ?? null;
    const queuedJobs = jobs?.filter((j) => j.status === "uploaded").length ?? null;
    const completedJobs = jobs?.filter((j) => j.status === "completed").length ?? null;
    const failedJobs = jobs?.filter((j) => j.status === "failed").length ?? null;

    cards.replaceChildren(h(`
      <div class="metrics-grid">
        ${MetricCard({ label: "Active jobs", value: activeJobs === null ? "—" : num(activeJobs), tone: activeJobs > 0 ? "accent" : "", sub: "queued + processing", iconName: "zap" })}
        ${MetricCard({ label: "Queued jobs", value: queuedJobs === null ? "—" : num(queuedJobs), sub: "awaiting dispatch", iconName: "clock" })}
        ${MetricCard({ label: "Nodes online", value: workers === null ? "—" : num(workers), tone: workers > 0 ? "ok" : "bad", sub: sys?.local_mode ? "in-process Ray" : "Ray cluster", iconName: "server" })}
        ${MetricCard({ label: "Active tasks", value: num(sys?.active_tasks ?? null), tone: sys?.active_tasks > 0 ? "accent" : "", sub: "executing right now", iconName: "cpu" })}
        ${MetricCard({ label: "Completed tasks", value: num(sys?.completed_tasks ?? null), tone: "ok", sub: "all time", iconName: "checkCircle" })}
        ${MetricCard({ label: "Failed tasks", value: num(sys?.failed_tasks ?? null), tone: sys?.failed_tasks > 0 ? "bad" : "", sub: "all time", iconName: "alertTriangle" })}
        ${MetricCard({ label: "Retries", value: num(sys?.total_retries ?? null), tone: sys?.total_retries > 0 ? "warn" : "", sub: "recovered chunks", iconName: "refresh" })}
        ${MetricCard({ label: "Throughput", value: sys?.recent_chunks_per_sec != null ? num(sys.recent_chunks_per_sec, 2) : "—", sub: "chunks/sec", iconName: "gauge" })}
      </div>
    `));

    // Pipeline graph
    const activeStatus = jobs?.find((j) => j.status === "processing")?.status
      || jobs?.find((j) => j.status === "completed")?.status
      || jobs?.find((j) => j.status === "failed")?.status;
    pipeline.innerHTML = renderGraph({
      active: activeStatus,
      running: sys?.active_tasks ?? 0,
      workers: workers || 0,
      width: 700,
      height: 260,
    });
    pipelineNote.textContent = sys ? `${sys.active_tasks} active tasks` : "live";

    // Recent jobs
    if (!jobs || !jobs.length) {
      recent.innerHTML = EmptyState({
        iconName: "box",
        title: "Your cluster is idle",
        body: "Run a job to watch distributed execution unfold across the worker fleet.",
        action: `<a class="btn btn-primary" href="#/new">${icon("plus", 14)} Run a job</a>`,
      });
    } else {
      const rows = jobs.slice(0, 5).map((j) => {
        const n = normalizeJob(j);
        return `
        <a class="job-row" href="#/job/${n.id}">
          <span class="job-row-name">
            <span class="file-badge ext-${n.extension.toLowerCase()}">${n.extension}</span>
            <span class="job-row-title">
              <span class="job-name">${escape(n.filename)}</span>
              <span class="job-sub mono">${n.operation}${n.column ? " · " + escape(n.column) : ""} · ${formatBytes(n.fileSize)}</span>
            </span>
          </span>
          <span class="job-row-mid">${StatusBadge({ status: n.status, pulse: n.status === "processing" })}</span>
          <span class="job-row-end mono">${timeAgo(n.createdAt)}</span>
        </a>`;
      }).join("");
      recent.innerHTML = rows;
    }

    // Fleet — per-node CPU only; Ray does not expose per-node task counters.
    if (!sys) {
      fleet.innerHTML = `<div class="empty-body">Loading cluster info…</div>`;
    } else if (sys.local_mode) {
      fleet.innerHTML = `
        <div class="local-note">
          ${icon("info", 14)}
          <span><b>Local mode.</b> RAY_ADDRESS is unset or <code>local</code>, so Ray runs inside this process — no separate worker containers. Chunks still execute in parallel across Ray workers.</span>
        </div>`;
    } else {
      const head = sys.nodes.find((n) => !n.node_id.includes("worker"));
      const chips = (sys.nodes || []).map((n) => ({
        id: shortNode(n.node_id),
        isHead: head ? n.node_id === head.node_id : sys.nodes.indexOf(n) === 0,
        cpu: n.resources?.cpu,
        mem: n.resources?.memory_gb,
        alive: n.alive,
      }));
      fleet.innerHTML = `
        <div class="fleet-chips">
          ${chips.map((c) => `
            <div class="worker-chip">
              <div class="mono">${escape(c.id)}${c.isHead ? ` <span class="head-tag">HEAD</span>` : ""}</div>
              <div class="worker-chip-sub">
                <span class="dot ${c.alive ? "on" : "bad"}"></span>${c.alive ? "online" : "offline"}
                ${c.cpu != null ? ` · ${num(c.cpu, 0)} CPU` : ""}
                ${c.mem != null ? ` · ${formatNumber(c.mem, 1)} GB` : ""}
              </div>
            </div>`).join("")}
        </div>
        <div class="local-note">${icon("info", 14)}<span>Ray exposes cluster-wide task counts, not per-node counters — see a job's <b>worker activity</b> panel for the real task→node mapping.</span></div>`;
    }

    // Task telemetry
    if (!sys) {
      tasksBody.innerHTML = `<div class="empty-body">Loading…</div>`;
    } else {
      const total = (sys.completed_tasks ?? 0) + (sys.failed_tasks ?? 0) + (sys.active_tasks ?? 0);
      tasksBody.innerHTML = `
        <div class="stat-stack">
          ${StatBar({ label: "Completed", value: sys.completed_tasks ?? 0, total, tone: "ok" })}
          ${StatBar({ label: "Active", value: sys.active_tasks ?? 0, total, tone: "accent" })}
          ${StatBar({ label: "Failed", value: sys.failed_tasks ?? 0, total, tone: "bad" })}
          ${StatBar({ label: "Retries", value: sys.total_retries ?? 0, total, tone: "warn" })}
          <div class="kpi-row">
            <div><span class="kpi mono">${formatNumber(sys.recent_avg_duration_ms ?? null, 0)}</span><span class="kpi-label">avg task ms</span></div>
            <div><span class="kpi mono">${sys.redis_connected ? "ok" : "down"}</span><span class="kpi-label">redis</span></div>
          </div>
        </div>`;
    }
  };

  store.subscribe(render);
  render();
}

function StatBar({ label, value, total, tone }) {
  const w = total ? (value / total) * 100 : 0;
  return `
  <div class="stat-bar">
    <div class="stat-row"><span>${label}</span><span class="mono">${formatNumber(value)}</span></div>
    <div class="progress-track"><div class="progress-fill tone-${tone}" style="width:${Math.min(100, w)}%"></div></div>
  </div>`;
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}