// Overview — mirrors the Obsidian Flux "System Overview" screen.
// Status banner, live node topology, telemetry column and a recent-dispatches
// table. Every number comes from the real /api/v1/system + job summaries;
// nothing is fabricated in the client.

import { store } from "../store.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { StatusBadge } from "../components.js";
import { normalizeJob } from "../model.js";
import { formatBytes, formatNumber, timeAgo, shortNode } from "../format.js";
import { topologyFlow } from "../schematic.js";

function systemStatus(sys) {
  if (!sys) return { key: "connecting", label: "CONNECTING", iconName: "loader" };
  const nodesUp = (sys.nodes?.length ?? 0) > 0;
  if (sys.redis_connected && sys.ray_initialized && nodesUp) {
    return { key: "optimal", label: "OPTIMAL", iconName: "check" };
  }
  if (sys.redis_connected && sys.ray_initialized) {
    return { key: "degraded", label: "DEGRADED — NO WORKERS", iconName: "alertTriangle" };
  }
  return { key: "down", label: "DEGRADED", iconName: "x" };
}

export async function mountOverview(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      <!-- STATUS BANNER -->
      <div class="sys-banner" id="ov-banner"></div>

      <!-- MAIN GRID: topology (8) + telemetry (4) -->
      <div class="grid-12">
        <div class="col-8">
          <section class="panel panel-strong">
            <header class="panel-head">
              <h2 class="panel-title">${icon("network", 13)} Node Topology <span class="head-live">[Live]</span></h2>
              <div class="panel-right"><span class="sync-chip" id="ov-sync">SYNCING…</span></div>
            </header>
            <div class="panel-body">
              <div id="ov-pipeline"></div>
              <div class="stage-strip" id="ov-stages"></div>
            </div>
          </section>
        </div>
        <div class="col-4">
          <div class="tcol" id="ov-telemetry"></div>
        </div>
      </div>

      <!-- RECENT DISPATCHES -->
      <div class="section-label">Dispatch log</div>
      <section class="panel panel-strong">
        <header class="panel-head">
          <h2 class="panel-title">${icon("terminal", 13)} Recent Dispatches</h2>
          <div class="panel-right"><a class="btn btn-ghost btn-sm" href="#/history">View all</a></div>
        </header>
        <div class="panel-body flush" id="ov-dispatch"></div>
      </section>

      <div class="grid-2">
        <section class="panel">
          <header class="panel-head"><h2 class="panel-title">${icon("server", 13)} Worker fleet</h2></header>
          <div class="panel-body" id="ov-fleet"></div>
        </section>
        <section class="panel">
          <header class="panel-head"><h2 class="panel-title">${icon("gauge", 13)} Live task telemetry</h2></header>
          <div class="panel-body" id="ov-tasks"></div>
        </section>
      </div>
    </div>
  `));

  const banner = root.querySelector("#ov-banner");
  const pipeline = root.querySelector("#ov-pipeline");
  const stages = root.querySelector("#ov-stages");
  const syncChip = root.querySelector("#ov-sync");
  const telemetry = root.querySelector("#ov-telemetry");
  const dispatch = root.querySelector("#ov-dispatch");
  const fleet = root.querySelector("#ov-fleet");
  const tasksBody = root.querySelector("#ov-tasks");

  const render = () => {
    const sys = store.system;
    const jobs = store.jobs;
    const workers = sys?.nodes?.length ?? null;
    const st = systemStatus(sys);

    // Status banner
    banner.replaceChildren(h(`
      <div class="sys-banner-inner tone-${st.key}">
        <div class="sys-banner-text">
          <div class="kicker">Status overlay</div>
          <h1 class="banner-title">System status: ${st.label}</h1>
        </div>
        <div class="banner-badge" aria-hidden="true">${icon(st.iconName, 30)}</div>
      </div>
    `));
    syncChip.textContent = (jobs?.some((j) => j.status === "processing") || (sys?.active_tasks ?? 0) > 0)
      ? "SYNCING…"
      : "IDLE";

    // Stage counters — real, cluster-wide task numbers
    const completed = sys?.completed_tasks ?? 0;
    const failed = sys?.failed_tasks ?? 0;
    const active = sys?.active_tasks ?? 0;
    const dispatched = completed + failed + active;
    const splitChunks = jobs?.reduce((a, j) => a + (j.estimated_chunks || 0), 0) ?? 0;
    const doneJobs = jobs?.filter((j) => j.status === "completed").length ?? 0;
    const throughput = sys?.recent_chunks_per_sec;

    // Pipeline schematic — the Obsidian Flux block-flow over a dot-grid
    pipeline.innerHTML = `<div class="sc-canvas">${topologyFlow({
      split: formatNumber(splitChunks) + " chunks",
      dispatch: throughput != null ? formatNumber(throughput, 1) + "/s" : "—",
      dispatchSub: "chunks / s",
      execute: formatNumber(active) + " active",
      executeSub: "tasks running",
      aggregate: formatNumber(doneJobs) + " jobs",
      aggregateSub: "completed",
    })}</div>`;

    const split = splitChunks;
    stages.replaceChildren(h(`
      <div class="stage-strip">
        ${stageItem("Split", split + " chunks")}
        ${stageArrow()}
        ${stageItem("Dispatch", dispatched + " dispatched")}
        ${stageArrow()}
        ${stageItem("Execute", active + " active")}
        ${stageArrow()}
        ${stageItem("Aggregate", doneJobs + " jobs")}
      </div>
    `));

    // Telemetry column — three live cards
    const activeJobs = jobs?.filter((j) => j.status === "processing" || j.status === "uploaded").length ?? null;
    telemetry.replaceChildren(h(`
      <div class="tcol">
        ${tCard("Active jobs", activeJobs == null ? "—" : formatNumber(activeJobs), "queued + processing", activeJobs > 0 ? "accent" : "")}
        ${tCard("Throughput", throughput != null ? formatNumber(throughput, 2) : "—", "chunks / sec", "accent")}
        ${tCard("Total processed", formatNumber(completed), "chunks completed", "ok")}
        ${tCard("Retries recovered", formatNumber(sys?.total_retries ?? 0), "chunks re-dispatched", (sys?.total_retries ?? 0) > 0 ? "warn" : "")}
      </div>
    `));

    // Recent dispatches — real job table
    if (!jobs || !jobs.length) {
      dispatch.innerHTML = `
        <div class="empty">
          ${icon("box", 28)}
          <div class="empty-title">No dispatches yet</div>
          <div class="empty-body">Run a job to watch distributed execution unfold across the worker fleet.</div>
          <div class="empty-actions"><a class="btn btn-primary" href="#/new">${icon("plus", 14)} Run a job</a></div>
        </div>`;
    } else {
      const rows = jobs.slice(0, 8).map((j) => {
        const n = normalizeJob(j);
        const pct = Math.round(n.progress);
        return `
        <tr data-href="#/job/${n.id}">
          <td class="mono dim">${shortId(n.id)}</td>
          <td><span class="file-badge ext-${n.extension.toLowerCase()}">${n.extension}</span> <span class="job-name-cell"><span class="job-name">${escape(n.filename)}</span></span></td>
          <td class="mono">${escape(n.operation)}${n.column ? " · " + escape(n.column) : ""}</td>
          <td class="mono">${formatBytes(n.fileSize)}</td>
          <td style="min-width:150px"><div class="pbar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="pbar-fill tone-${n.status === "failed" ? "bad" : "ok"}" style="width:${pct}%"></div></div></td>
          <td>${StatusBadge({ status: n.status, pulse: n.status === "processing" })}</td>
          <td class="mono">${n.result != null ? formatResult(n.result) : "—"}</td>
          <td class="mono dim">${timeAgo(n.createdAt)}</td>
        </tr>`;
      }).join("");
      dispatch.innerHTML = `
        <div class="table-scroll">
          <table class="table">
            <thead><tr>
              <th>Job</th><th>File</th><th>Operation</th><th>Size</th><th>Progress</th><th>Status</th><th>Result</th><th>Created</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      dispatch.querySelectorAll("tr[data-href]").forEach((tr) => {
        tr.addEventListener("click", () => { window.location.hash = tr.dataset.href; });
      });
    }

    // Fleet — real per-node resources
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

    // Task telemetry — real cluster counters
    if (!sys) {
      tasksBody.innerHTML = `<div class="empty-body">Loading…</div>`;
    } else {
      const total = completed + failed + active;
      tasksBody.innerHTML = `
        <div class="stat-stack">
          ${StatBar({ label: "Completed", value: completed, total, tone: "ok" })}
          ${StatBar({ label: "Active", value: active, total, tone: "accent" })}
          ${StatBar({ label: "Failed", value: failed, total, tone: "bad" })}
          ${StatBar({ label: "Retries", value: sys.total_retries ?? 0, total, tone: "warn" })}
          <div class="kpi-row">
            <div><span class="kpi mono">${formatNumber(sys.recent_avg_duration_ms ?? null, 0)}</span><span class="kpi-label">avg task ms</span></div>
            <div><span class="kpi mono">${sys.redis_connected ? "ok" : "down"}</span><span class="kpi-label">redis</span></div>
          </div>
        </div>`;
    }
  };

  const off = store.subscribe(render);
  render();
  return off;
}

function tCard(label, value, sub, tone) {
  return `
  <div class="tcard${tone ? ` tone-${tone}` : ""}">
    <div class="tcard-head">${escape(label)}</div>
    <div class="tcard-body">
      <span class="tcard-value">${value}</span>
      <span class="tcard-sub">${escape(sub)}</span>
    </div>
  </div>`;
}

function stageItem(label, value) {
  return `
  <div class="stage-item">
    <span class="stage-num mono">${escape(value)}</span>
    <span class="stage-label">${escape(label)}</span>
  </div>`;
}

function stageArrow() {
  return `<span class="stage-arrow" aria-hidden="true">${icon("arrowRight", 13)}</span>`;
}

function StatBar({ label, value, total, tone }) {
  const w = total ? (value / total) * 100 : 0;
  return `
  <div class="stat-bar">
    <div class="stat-row"><span>${label}</span><span class="mono">${formatNumber(value)}</span></div>
    <div class="progress-track"><div class="progress-fill tone-${tone}" style="width:${Math.min(100, w)}%"></div></div>
  </div>`;
}

function shortId(id) {
  return String(id || "").slice(0, 8);
}

function formatResult(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1e12) return formatNumber(n / 1e12, 2) + "T";
  if (Math.abs(n) >= 1e9) return formatNumber(n / 1e9, 2) + "G";
  if (Math.abs(n) >= 1e6) return formatNumber(n / 1e6, 2) + "M";
  return formatNumber(n, 2);
}

function num(v, maxFrac = 0) {
  return formatNumber(v, maxFrac);
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}