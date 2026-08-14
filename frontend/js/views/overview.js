import { store } from "../store.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import {
  MetricCard, Panel, StatusBadge, EmptyState, SectionTitle, num,
} from "../components.js";
import { normalizeJob, jobProgress } from "../model.js";
import { formatBytes, formatNumber, timeAgo, shortNode } from "../format.js";
import { renderGraph } from "../execgraph.js";

export async function mountOverview(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      <div class="head-row">
        ${SectionTitle({
          kicker: "DISTRIBUTED FILE PROCESSING",
          title: "Split. Dispatch. Execute. Aggregate.",
          sub: "Real-time control plane for chunk-parallel CSV / JSON pipelines over a Ray worker fleet.",
        })}
        <div class="head-actions">
          <button class="btn btn-primary" id="ov-new-job">${icon("plus", 15)} New job</button>
        </div>
      </div>
      <div id="ov-cards" class="metrics-grid"></div>
      <div class="grid-2">
        ${Panel({
          title: "Pipeline",
          iconName: "activity",
          id: "ov-pipeline",
          right: `<span class="mono xs">live</span>`,
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

  root.querySelector("#ov-new-job").addEventListener("click", () => {
    window.location.hash = "#/new";
  });

  const cards = root.querySelector("#ov-cards");
  const pipeline = root.querySelector("#ov-pipeline .panel-body");
  const recent = root.querySelector("#ov-recent-body");
  const fleet = root.querySelector("#ov-fleet-body");
  const tasksBody = root.querySelector("#ov-tasks-body");

  const render = () => {
    const sys = store.system;
    const jobs = store.jobs;

    // Cards
    const workers = sys?.nodes?.length ?? null;
    const activeJobs = jobs?.filter((j) => j.status === "processing" || j.status === "uploaded").length ?? null;
    const completedJobs = jobs?.filter((j) => j.status === "completed").length ?? null;
    const failedJobs = jobs?.filter((j) => j.status === "failed").length ?? null;
    cards.replaceChildren();
    cards.appendChild(h(`
      <div class="metrics-grid">
        ${MetricCard({ label: "Worker nodes", value: workers === null ? "—" : num(workers), sub: sys?.local_mode ? "local (in-process) mode" : "Ray cluster", iconName: "server", hint: sys?.local_mode ? "Running with RAY_ADDRESS=local, all chunks execute inside the API process." : "Active Ray head/worker nodes reported by the cluster." })}
        ${MetricCard({ label: "Active jobs", value: activeJobs === null ? "—" : num(activeJobs), tone: activeJobs > 0 ? "accent" : "", sub: "queued + processing", iconName: "zap" })}
        ${MetricCard({ label: "Completed", value: completedJobs === null ? "—" : num(completedJobs), tone: "ok", sub: "all time", iconName: "checkCircle" })}
        ${MetricCard({ label: "Failed", value: failedJobs === null ? "—" : num(failedJobs), tone: failedJobs > 0 ? "bad" : "", sub: "all time", iconName: "alertTriangle" })}
      </div>
    `));

    // Pipeline graph
    const activeStatus = jobs?.find((j) => j.status === "processing")?.status
      || jobs?.find((j) => j.status === "completed")?.status
      || jobs?.find((j) => j.status === "failed")?.status;
    const running = sys?.active_tasks ?? 0;
    const workerCount = workers || 0;
    pipeline.innerHTML = renderGraph({ active: activeStatus, running, workers: workerCount, width: 700, height: 200 });

    // Recent jobs
    if (!jobs || !jobs.length) {
      recent.innerHTML = EmptyState({
        iconName: "box",
        title: "No jobs yet",
        body: "Upload a file and start a distributed job to see live execution here.",
        action: `<a class="btn btn-primary" href="#/new">${icon("plus", 14)} New job</a>`,
      });
    } else {
      const rows = jobs.slice(0, 5).map((j) => {
        const n = normalizeJob(j);
        const p = jobProgress(n, []);
        return `
        <a class="job-row" href="#/job/${n.id}">
          <span class="job-row-name">
            <span class="file-badge ext-${n.extension.toLowerCase()}">${n.extension}</span>
            <span class="job-row-title">
              <span class="job-name">${escape(jn(n.filename))}</span>
              <span class="job-sub mono">${n.operation}${n.column ? " · " + escape(jn(n.column)) : ""} · ${formatBytes(n.fileSize)}</span>
            </span>
          </span>
          <span class="job-row-mid">${StatusBadge({ status: n.status })}</span>
          <span class="job-row-end mono">${timeAgo(n.createdAt)}</span>
        </a>`;
      }).join("");
      recent.innerHTML = rows;
    }

    // Fleet
    if (!sys) {
      fleet.innerHTML = `<div class="empty-body">Loading cluster info…</div>`;
    } else if (sys.local_mode) {
      fleet.innerHTML = `
        <div class="local-note">
          ${icon("info", 14)}
          <span><b>Local mode.</b> RAY_ADDRESS is unset or <code>local</code>, so Ray runs inside this process — no separate worker containers. Chunks still execute in parallel across Ray workers.</span>
        </div>
        <div class="fleet-chips">${WorkerChips([{ id: "head (local)", running: running, completed: sys.completed_tasks ?? 0, failed: sys.failed_tasks ?? 0 }])}</div>`;
    } else {
      const chips = (sys.nodes || []).map((n) => ({
        id: shortNode(n.node_id),
        running: sys.active_tasks ?? 0,
        completed: sys.completed_tasks ?? 0,
        failed: sys.failed_tasks ?? 0,
        extra: n.resources?.cpu ? `CPU ${n.resources.cpu}` : "",
      }));
      fleet.innerHTML = `
        <div class="fleet-chips">${WorkerChips(chips)}</div>
        <div class="local-note">${icon("network", 14)}<span>${chips.length} reachable nodes · ${Object.keys(sys.nodes?.[0]?.resources || {}).filter((k) => k.includes("node:")).length > 0 ? "dedicated node IDs" : "shared resource group"}</span></div>`;
    }

    // Tasks telemetry
    if (!sys) {
      tasksBody.innerHTML = `<div class="empty-body">Loading…</div>`;
    } else {
      const total = (sys.completed_tasks ?? 0) + (sys.failed_tasks ?? 0) + (sys.active_tasks ?? 0);
      const pct = total ? Math.round(((sys.completed_tasks ?? 0) / total) * 100) : 0;
      tasksBody.innerHTML = `
        <div class="stat-stack">
          ${StatBar({ label: "Completed", value: sys.completed_tasks ?? 0, total, tone: "ok" })}
          ${StatBar({ label: "Active", value: sys.active_tasks ?? 0, total, tone: "accent" })}
          ${StatBar({ label: "Failed", value: sys.failed_tasks ?? 0, total, tone: "bad" })}
          ${StatBar({ label: "Retries", value: sys.total_retries ?? 0, total, tone: "warn" })}
          <div class="kpi-row">
            <div><span class="kpi mono">${formatNumber(sys.recent_avg_duration_ms ?? null, 0)}</span><span class="kpi-label">avg task ms</span></div>
            <div><span class="kpi mono">${formatNumber(sys.recent_throughput_jobs_per_min ?? null, 1)}</span><span class="kpi-label">chunks/sec</span></div>
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

function WorkerChips(chips) {
  return chips.map((c) => `
    <div class="worker-chip">
      <div class="mono">${escape(c.id)}</div>
      <div class="worker-chip-sub">
        <span class="dot on" style="background:var(--ok)"></span>${c.running} run
        · <span class="dot" style="background:var(--ok)"></span>${c.completed} ok
        · ${c.failed} fail
        ${c.extra ? ` · ${escape(c.extra)}` : ""}
      </div>
    </div>`).join("");
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jn(name) {
  return name;
}