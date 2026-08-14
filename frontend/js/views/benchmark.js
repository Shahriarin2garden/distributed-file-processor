import { store } from "../store.js";
import { api } from "../api.js";
import { h, clear, on } from "../dom.js";
import { icon } from "../icons.js";
import { Panel, StatusBadge, EmptyState, SectionTitle, MetricCard, num, ToneBadge } from "../components.js";
import { benchmarkResultOk, scalingCurve } from "../model.js";
import { formatNumber, formatMs, timeAgo } from "../format.js";

export async function mountBenchmark(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "BENCHMARK",
        title: "Distributed vs. sequential",
        sub: "The same deterministic dataset, processed both ways. Real measured wall-clock times.",
      })}
      <div class="panel">
        <div class="panel-body">
          <div class="bench-form">
            <div class="form-row">
              <label class="field">
                <span class="field-label">Rows to process</span>
                <select class="input" id="bn-rows">
                  <option value="10000">10,000</option>
                  <option value="50000">50,000</option>
                  <option value="200000" selected>200,000</option>
                  <option value="1000000">1,000,000</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">Chunk size</span>
                <select class="input" id="bn-chunk">
                  <option value="5000">5,000</option>
                  <option value="20000">20,000</option>
                  <option value="50000" selected>50,000</option>
                  <option value="100000">100,000</option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">Operation</span>
                <select class="input" id="bn-op">
                  <option value="sum" selected>sum</option>
                  <option value="mean">mean</option>
                </select>
              </label>
              <div class="bench-actions">
                <button class="btn btn-primary" id="bn-run">${icon("play", 13)} Run benchmark</button>
                <span class="mono xs dim" id="bn-status"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="bn-result"></div>
      <div id="bn-history"></div>
    </div>
  `));

  const resultEl = root.querySelector("#bn-result");
  const historyEl = root.querySelector("#bn-history");
  const statusEl = root.querySelector("#bn-status");

  root.querySelector("#bn-run").addEventListener("click", async () => {
    const rows = parseInt(root.querySelector("#bn-rows").value, 10);
    const chunk = parseInt(root.querySelector("#bn-chunk").value, 10);
    const op = root.querySelector("#bn-op").value;
    statusEl.textContent = "dispatching…";
    try {
      const res = await api.runBenchmark(rows, chunk, op);
      statusEl.textContent = `running ${formatNumber(res.estimated_chunks)} chunks…`;
      pollResult(res.benchmark_id);
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });

  function pollResult(id) {
    const iv = setInterval(async () => {
      try {
        const b = await api.benchmark(id);
        if (b.status === "completed" || b.status === "failed") {
          clearInterval(iv);
          statusEl.textContent = "";
          renderResult(b);
          store.refreshBenchmarks();
        }
      } catch {
        clearInterval(iv);
        statusEl.textContent = "benchmark lookup failed";
      }
    }, 1200);
  }

  const renderResult = (b) => {
    const ok = benchmarkResultOk(b);
    const speedup = b.speedup;
    resultEl.replaceChildren(h(`
      <div class="bench-result ${b.status === "failed" ? "tone-bad" : ""}">
        <div class="panel"><div class="panel-body">
          ${b.status === "failed" ? `
            <div class="empty">
              ${icon("alertTriangle", 26)}
              <div class="empty-title">Benchmark failed</div>
              <div class="empty-body">${escape(b.error || "unknown error")}</div>
            </div>` : `
          <div class="bench-head">
            <div>
              <div class="kicker">RESULT · ${b.operation.toUpperCase()} · ${formatNumber(b.rows)} rows · ${b.num_chunks} chunks</div>
              <div class="bench-speedup">${speedup != null ? formatNumber(speedup, 2) + "×" : "—"} <span class="dim">faster distributed</span></div>
            </div>
            ${StatusBadge({ status: b.status })}
          </div>
          <div class="bench-bars">
            ${BenchBar({ label: "Sequential", ms: b.sequential_ms, maxMs: Math.max(b.sequential_ms, b.distributed_ms), tone: "info" })}
            ${BenchBar({ label: "Distributed", ms: b.distributed_ms, maxMs: Math.max(b.sequential_ms, b.distributed_ms), tone: "accent" })}
          </div>
          <div class="metrics-grid bench-metrics">
            ${MetricCard({ label: "Sequential", value: formatMs(b.sequential_ms), sub: `${b.avg_task_ms != null ? formatNumber(b.avg_task_ms, 1) + " ms/row-pass" : ""}`, iconName: "clock" })}
            ${MetricCard({ label: "Distributed", value: formatMs(b.distributed_ms), sub: `${b.workers_used != null ? num(b.workers_used) + " workers" : ""}`, iconName: "zap" })}
            ${MetricCard({ label: "Verification", value: ok ? "pass" : "FAIL", tone: ok ? "ok" : "bad", sub: "results compared", iconName: "checkCircle" })}
            ${MetricCard({ label: "Speedup", value: speedup != null ? formatNumber(speedup, 2) + "×" : "—", sub: "wall-clock ratio", iconName: "gauge" })}
          </div>
          <div class="mono xs dim bench-note">sequential=${escape(String(b.sequential_result))} · distributed=${escape(String(b.distributed_result))} · ${timeAgo(b.created_at)}</div>`}
        </div></div>
      </div>
    `));
  };

  const renderHistory = () => {
    const list = store.benchmarks || [];
    if (!list.length) {
      historyEl.replaceChildren(h(Panel({
        title: "Benchmark history",
        iconName: "clock",
        body: EmptyState({ iconName: "clock", title: "No benchmarks yet", body: "Run one to compare sequential vs. distributed wall-clock time." }),
      })));
      return;
    }
    const rows = list.slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 10).map((b) => `
      <tr>
        <td class="mono">${formatNumber(b.rows)}</td>
        <td class="mono">${formatNumber(b.num_chunks)} chunks</td>
        <td class="mono">${b.operation}</td>
        <td class="mono">${formatMs(b.sequential_ms)}</td>
        <td class="mono">${formatMs(b.distributed_ms)}</td>
        <td class="mono">${b.speedup != null ? formatNumber(b.speedup, 2) + "×" : "—"}</td>
        <td>${StatusBadge({ status: b.status })}</td>
        <td class="mono dim">${timeAgo(b.created_at)}</td>
      </tr>`).join("");
    historyEl.replaceChildren(h(Panel({
      title: "Benchmark history",
      iconName: "clock",
      right: `<span class="mono xs">${num(list.length)}</span>`,
      flush: true,
      body: `
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>Rows</th><th>Chunks</th><th>Op</th><th>Sequential</th><th>Distributed</th><th>Speedup</th><th>Status</th><th>When</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`,
    })));
  };

  store.subscribe(renderHistory);
  renderHistory();
}

function BenchBar({ label, ms, maxMs, tone }) {
  const pct = maxMs ? Math.max(4, (ms / maxMs) * 100) : 0;
  return `
  <div class="bench-bar">
    <div class="bench-bar-row"><span>${label}</span><span class="mono">${formatMs(ms)}</span></div>
    <div class="progress-track"><div class="progress-fill tone-${tone}" style="width:${pct}%"></div></div>
  </div>`;
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}