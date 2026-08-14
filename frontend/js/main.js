// App entry: hash router, sidebar shell, view mounting.

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

function shell() {
  const app = document.getElementById("app");
  app.replaceChildren();
  app.appendChild(h(`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">${icon("box", 16)}</div>
          <div class="brand-name">DFP</div>
          <div class="brand-sub">DISTRIBUTED FILE PROCESSING</div>
        </div>
        <nav class="nav" id="nav">
          ${NAV.map((n) => `
            <a class="nav-link" href="#${n.path}" data-path="${n.path}">
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
      <main class="main" id="main">
        <div id="view"></div>
      </main>
    </div>
  `));
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  if (raw === "/") return { name: "overview", params: {} };
  const m = raw.match(/^\/job\/([0-9a-fA-F-]+)$/);
  if (m) return { name: "job", params: { jobId: m[1] } };
  const staticMap = {
    "/new": "newjob",
    "/history": "history",
    "/cluster": "cluster",
    "/benchmark": "benchmark",
    "/architecture": "architecture",
    "/settings": "settings",
  };
  if (staticMap[raw]) return { name: staticMap[raw], params: {} };
  return { name: "overview", params: {} };
}

async function navigate() {
  const route = parseRoute();
  const nav = document.getElementById("nav");
  if (nav) {
    nav.querySelectorAll(".nav-link").forEach((a) => {
      a.classList.toggle("active", a.dataset.path === route.path);
    });
  }
  store.setRoute(route.path);
  const view = document.getElementById("view");
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
  await m();
  window.scrollTo(0, 0);
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