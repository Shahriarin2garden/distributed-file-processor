import { store } from "../store.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { MetricCard, Panel, SectionTitle, num } from "../components.js";
import { formatNumber } from "../format.js";

export async function mountCluster(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "INFRASTRUCTURE",
        title: "Cluster",
        sub: "Ray topology and resource utilization reported live by the API.",
      })}
      <div id="cl-cards" class="metrics-grid"></div>
      <div id="cl-nodes"></div>
    </div>
  `));

  const cards = root.querySelector("#cl-cards");
  const nodesEl = root.querySelector("#cl-nodes");

  const render = () => {
    const sys = store.system;
    if (!sys) {
      cards.replaceChildren(h(`<div class="empty" style="grid-column:1/-1">${icon("loader", 24)}<div class="empty-body">Loading cluster telemetry…</div></div>`));
      nodesEl.replaceChildren();
      return;
    }

    const nodes = sys.nodes || [];
    const totalCpus = sys.total_cpus ?? 0;
    const usedCpus = (sys.available_cpus != null ? totalCpus - sys.available_cpus : 0);
    const mem = sys.total_memory_gb ?? null;

    cards.replaceChildren(h(`
      <div class="metrics-grid">
        ${MetricCard({ label: "Nodes online", value: num(nodes.length), sub: sys.local_mode ? "in-process Ray" : "Ray cluster", iconName: "server" })}
        ${MetricCard({ label: "Workers", value: num(sys.workers_online ?? 0), sub: "reported by Ray", iconName: "cpu" })}
        ${MetricCard({ label: "CPU", value: num(usedCpus, 1) + " / " + num(totalCpus, 1), sub: "in use / total cores", iconName: "cpu" })}
        ${MetricCard({ label: "Memory", value: mem != null ? formatNumber(mem, 1) + " GB" : "—", sub: "cluster total", iconName: "database" })}
        ${MetricCard({ label: "Redis", value: sys.redis_connected ? "connected" : "down", tone: sys.redis_connected ? "ok" : "bad", sub: sys.ray_address || "", iconName: "database" })}
      </div>
    `));

    if (sys.local_mode) {
      nodesEl.replaceChildren(h(`
        <div class="panel"><div class="panel-body">
          <div class="local-note">${icon("info", 14)}<span><b>Local mode.</b> RAY_ADDRESS is unset or <code>local</code> — Ray runs inside the API process. Chunks still execute in parallel across worker threads; the resource numbers below are host values.</span></div>
        </div></div>
      `));
      return;
    }

    const nodeCards = nodes.map((n) => {
      const res = n.resources || {};
      const cpus = res.cpu ?? 0;
      const memNode = res.memory_gb != null ? formatNumber(res.memory_gb, 1) + " GB" : "—";
      return `
      <div class="panel node-card"><div class="panel-body">
        <div class="node-head">
          <span class="node-id mono">${escape(n.node_id)}</span>
          <span class="badge tone-ok"><span class="dot"></span>alive</span>
        </div>
        <div class="kv">
          <dt>CPU</dt><dd class="mono">${num(cpus, 1)}</dd>
          <dt>Memory</dt><dd class="mono">${memNode}</dd>
          ${n.hostname ? `<dt>Host</dt><dd class="mono">${escape(n.hostname)}</dd>` : ""}
        </div>
      </div></div>`;
    }).join("");

    nodesEl.replaceChildren(h(`<div class="node-grid">${nodeCards}</div>`));
  };

  store.subscribe(render);
  render();
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}