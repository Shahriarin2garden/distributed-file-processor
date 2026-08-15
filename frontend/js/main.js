// App entry: hash router, sidebar shell, status bar, view mounting.

import { icon } from "./icons.js";
import { store } from "./store.js";
import { h } from "./dom.js";
import { mountOverview } from "./views/overview.js";
import { mountNewJob } from "./views/newjob.js";
import { mountJob } from "./views/job.js";
import { mountCluster } from "./views/cluster.js";
import { mountHistory } from "./views/history.js";
import { mountArchitecture } from "./views/architecture.js";
import { mountBenchmark } from "./views/benchmark.js";
import { mountSettings } from "./views/settings.js";

const NAV = [
  { path: "/", label: "Overview", icon: "activity" },
  { path: "/new", label: "New job", icon: "plus" },
  { path: "/history", label: "History", icon: "clock" },
  { path: "/cluster", label: "Cluster", icon: "server" },
  { path: "/benchmark", label: "Benchmark", icon: "gauge" },
  { path: "/architecture", label: "Architecture", icon: "gitBranch" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

const STATUS_ITEMS = [
  { key: "api", label: "API", icon: "terminal" },
  { key: "redis", label: "REDIS", icon: "database" },
  { key: "ray", label: "RAY", icon: "zap" },
  { key: "workers", label: "NODES", icon: "cpu" },
];

function shell() {
  const app = document.getElementById("app");
  app.replaceChildren();
  app.appendChild(h(`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">${icon("layers", 16)}</div>
          <div class="brand-text">
            <div class="brand-name">DFP</div>
            <div class="brand-sub">Distributed file processing</div>
          </div>
        </div>
        <nav class="nav" id="nav" aria-label="Primary">
          ${NAV.map((n) => `
            <a class="nav-link" href="#${n.path}" data-path="${n.path}" aria-current="false">
              ${icon(n.icon, 15)}<span>${n.label}</span>
            </a>`).join("")}
        </nav>
        <div class="sidebar-foot">
          <div class="health-chip" id="health-chip">
            <span class="dot" id="health-dot"></span>
            <span class="mono xs" id="health-text">connecting…</span>
          </div>
        </div>
      </aside>
      <div class="shell-main">
        <header class="statusbar" role="status" aria-label="System status">
          <div class="statusbar-left">
            ${STATUS_ITEMS.map((s) => `
              <span class="sb-item" data-sb="${s.key}">
                ${icon(s.icon, 12)}<span class="sb-label">${s.label}</span>
                <span class="dot" data-sb-dot="${s.key}"></span>
              </span>`).join("")}
          </div>
          <div class="statusbar-right">
            <span class="sb-tag" id="sb-mode"></span>
            <span class="sb-version mono" id="sb-version"></span>
          </div>
        </header>
        <main class="main" id="main">
          <div id="view"></div>
        </main>
      </div>
    </div>
  `));
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  if (raw === "/") return { name: "overview", path: "/", params: {} };
  const m = raw.match(/^\/job\/([0-9a-fA-F-]+)$/);
  if (m) return { name: "job", path: raw, params: { jobId: m[1] } };
  const staticMap = {
    "/new": "newjob",
    "/history": "history",
    "/cluster": "cluster",
    "/benchmark": "benchmark",
    "/architecture": "architecture",
    "/settings": "settings",
  };
  if (staticMap[raw]) return { name: staticMap[raw], path: raw, params: {} };
  return { name: "overview", path: "/", params: {} };
}

async function navigate() {
  const route = parseRoute();
  const nav = document.getElementById("nav");
  if (nav) {
    nav.querySelectorAll(".nav-link").forEach((a) => {
      const active = a.dataset.path === route.path;
      a.classList.toggle("active", active);
      a.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  store.setRoute(route.path);
  const view = document.getElementById("view");
  if (typeof window.__dfpUnmount === "function") {
    try { window.__dfpUnmount(); } catch { /* ignore stale cleanup */ }
    window.__dfpUnmount = null;
  }
  const mounts = {
    overview: () => mountOverview(view),
    newjob: () => mountNewJob(view),
    job: () => mountJob(view, route.params.jobId),
    history: () => mountHistory(view),
    cluster: () => mountCluster(view),
    benchmark: () => mountBenchmark(view),
    architecture: () => mountArchitecture(view),
    settings: () => mountSettings(view),
  };
  const m = mounts[route.name] || mounts.overview;
  const cleanup = await m();
  if (typeof cleanup === "function") window.__dfpUnmount = cleanup;
  window.scrollTo(0, 0);
}

function sbStatus(state) {
  return state === true ? "ok" : state === false ? "bad" : "";
}

function updateHealth() {
  const dot = document.getElementById("health-dot");
  const text = document.getElementById("health-text");
  const sys = store.system;
  if (sys) {
    dot.className = `dot ${sys.redis_connected ? "ok" : "warn"}`;
    text.textContent = `${sys.nodes?.length ?? 0} node${(sys.nodes?.length ?? 0) === 1 ? "" : "s"} · ${sys.redis_connected ? "redis ok" : "redis down"}`;
  } else if (store.systemError) {
    dot.className = "dot bad";
    text.textContent = "backend unreachable";
  } else {
    dot.className = "dot";
    text.textContent = "connecting…";
  }

  const api = !!store.system || !store.systemError;
  const states = {
    api: api,
    redis: sys ? sys.redis_connected : null,
    ray: sys ? sys.ray_initialized : null,
    workers: null,
  };
  for (const [key, val] of Object.entries(states)) {
    const dotEl = document.querySelector(`[data-sb-dot="${key}"]`);
    if (dotEl) dotEl.className = `dot ${sbStatus(val)}`;
  }
  const w = document.querySelector(`[data-sb="workers"]`);
  if (w && sys) {
    const n = document.querySelector(`[data-sb-dot="workers"]`);
    if (n) {
      n.textContent = sys.workers_online != null ? String(sys.workers_online) : "";
      n.className = `dot ${sys.workers_online > 0 ? "ok" : "bad"}`;
    }
  }
  const mode = document.getElementById("sb-mode");
  if (mode) {
    const tags = [];
    if (sys?.demo_mode) tags.push(`<span class="sb-tag-chip warn">DEMO FAULT INJECTION</span>`);
    if (sys?.local_mode) tags.push(`<span class="sb-tag-chip info">LOCAL RAY</span>`);
    mode.innerHTML = tags.join("");
  }
  const ver = document.getElementById("sb-version");
  if (ver && sys?.api_version) ver.textContent = `v${sys.api_version}`;
}

export function boot() {
  shell();
  store.subscribe(updateHealth);
  store.refreshSystem();
  window.addEventListener("hashchange", navigate);
  navigate();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", boot);
}