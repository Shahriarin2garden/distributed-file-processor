import { store } from "../store.js";
import { h, clear, on } from "../dom.js";
import { icon } from "../icons.js";
import { MetricCard, Panel, SectionTitle, num, ToneBadge } from "../components.js";
import { formatNumber } from "../format.js";

export async function mountCluster(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "INFRASTRUCTURE",
        title: "Cluster",
        sub: "Ray topology and resource allocation reported live by the API.",
      })}
      <div id="cl-cards" class="metrics-grid"></div>
      <div class="grid-2">
        <div id="cl-topology"></div>
        <div id="cl-detail"></div>
      </div>
    </div>
  `));

  const cards = root.querySelector("#cl-cards");
  const topoEl = root.querySelector("#cl-topology");
  const detailEl = root.querySelector("#cl-detail");

  let selectedId = null;

  const render = () => {
    const sys = store.system;
    if (!sys) {
      cards.replaceChildren(h(`<div class="empty state-card" style="grid-column:1/-1">${icon("loader", 24)}<div class="empty-body">Loading cluster telemetry…</div></div>`));
      topoEl.replaceChildren();
      detailEl.replaceChildren();
      return;
    }

    const nodes = sys.nodes || [];
    const totalCpus = sys.total_cpus ?? 0;
    const usedCpus = (sys.available_cpus != null ? totalCpus - sys.available_cpus : null);
    const mem = sys.total_memory_gb ?? null;

    cards.replaceChildren(h(`
      <div class="metrics-grid">
        ${MetricCard({ label: "Nodes online", value: num(nodes.length), sub: sys.local_mode ? "in-process Ray" : "Ray cluster", iconName: "server" })}
        ${MetricCard({ label: "CPU", value: usedCpus != null ? num(usedCpus, 1) + " / " + num(totalCpus, 1) : num(totalCpus, 1) + " total", sub: usedCpus != null ? "in use / total cores" : "total cores", iconName: "cpu" })}
        ${MetricCard({ label: "Memory", value: mem != null ? formatNumber(mem, 1) + " GB" : "—", sub: "cluster total", iconName: "database" })}
        ${MetricCard({ label: "Redis", value: sys.redis_connected ? "connected" : "down", tone: sys.redis_connected ? "ok" : "bad", sub: "app state store", iconName: "database" })}
      </div>
    `));

    if (sys.local_mode) {
      topoEl.replaceChildren(h(`
        <div class="panel"><div class="panel-body">
          <div class="local-note">${icon("info", 14)}<span><b>Local mode.</b> RAY_ADDRESS is unset or <code>local</code> — Ray runs inside the API process. Chunks still execute in parallel across worker threads; the resource numbers below are host values.</span></div>
        </div></div>
      `));
      return;
    }

    // Topology: HEAD at top, workers below.
    const head = nodes[0];
    const rest = nodes.slice(1);
    const topo = `
      <div class="panel">
        <div class="panel-head"><h2 class="panel-title">${icon("network", 13)} Topology</h2></div>
        <div class="panel-body">
          ${nodeCard(head, "HEAD", true, nodes.length === 1)}
          ${rest.length ? `
            <div class="topo-spine" aria-hidden="true"><span></span></div>
            <div class="topo-workers">
              ${rest.map((n) => nodeCard(n, "WORKER", false)).join("")}
            </div>` : `<div class="topo-single-note mono xs dim">no worker nodes joined yet</div>`}
          <div class="mono xs dim topo-note">Ray's scheduler places tasks on these nodes; per-node task counters are not exposed, see job detail for the real task→node mapping.</div>
        </div>
      </div>`;
    topoEl.replaceChildren(h(topo));

    // Detail panel
    const selected = nodes.find((n) => n.node_id === selectedId) || head;
    detailEl.replaceChildren(renderDetail(selected));
  };

  const nodeCard = (n, kind, isHead, single) => {
    const res = n.resources || {};
    const alive = !!n.alive;
    return `
      <button type="button" class="topo-node${alive ? "" : " offline"}${n.node_id === selectedId ? " selected" : ""}"
        data-node="${escape(n.node_id)}" aria-pressed="${n.node_id === selectedId}">
        <div class="topo-node-top">
          <span class="topo-node-kind mono">${kind}</span>
          <span class="badge tone-${alive ? "ok" : "bad"}"><span class="dot"></span>${alive ? "online" : "offline"}</span>
        </div>
        <div class="topo-node-id mono">${escape(shortNode(n.node_id))}</div>
        <div class="topo-node-meta mono xs dim">
          ${res.cpu != null ? `${num(res.cpu, 0)} CPU` : "CPU —"}
          ${res.memory_gb != null ? ` · ${formatNumber(res.memory_gb, 1)} GB` : " · mem —"}
        </div>
      </button>`;
  };

  const renderDetail = (n) => {
    const res = n.resources || {};
    const host = n.hostname || "";
    return h(`
      <div class="panel">
        <div class="panel-head"><h2 class="panel-title">${icon("server", 13)} Node detail</h2></div>
        <div class="panel-body">
          <div class="node-detail-head">
            <span class="mono">${escape(shortNode(n.node_id))}</span>
            ${n.alive ? ToneBadge({ tone: "ok", label: "online" }) : ToneBadge({ tone: "bad", label: "offline" })}
          </div>
          <div class="kv">
            <dt>Node ID</dt><dd>${escape(n.node_id)}</dd>
            <dt>Hostname</dt><dd>${escape(host || "—")}</dd>
            <dt>CPU (total)</dt><dd class="mono">${res.cpu != null ? num(res.cpu, 1) : "—"}</dd>
            <dt>Memory (total)</dt><dd class="mono">${res.memory_gb != null ? formatNumber(res.memory_gb, 1) + " GB" : "—"}</dd>
            <dt>Available per-node</dt><dd class="mono dim">unavailable</dd>
            <dt>Task count (this node)</dt><dd class="mono dim">unavailable</dd>
          </div>
          <div class="local-note">${icon("info", 14)}<span>Ray's public API exposes cluster-wide available resources and per-job task→node records, but not live per-node availability or per-node task counters. Showing "unavailable" here is intentional — we do not fabricate telemetry.</span></div>
        </div>
      </div>
    `);
  };

  on(root, "[data-node]", "click", (btn) => {
    selectedId = btn.dataset.node;
    render();
  });

  store.subscribe(render);
  render();
}

function shortNode(id) {
  if (!id) return "node-?";
  const short = id.replace(/^node:([0-9a-f]+)/, "$1");
  return short.length > 10 ? short.slice(0, 10) : short;
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}