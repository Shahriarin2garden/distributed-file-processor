// New-job wizard: INPUT → OPERATION → EXECUTION → REVIEW.
// Every estimate comes from the real /inspect response; column types are
// inferred from the returned sample, never fabricated.

import { store } from "../store.js";
import { api } from "../api.js";
import { h, clear, on } from "../dom.js";
import { icon } from "../icons.js";
import { SectionTitle } from "../components.js";
import { formatBytes, formatNumber } from "../format.js";

const STEPS = [
  { id: "input", label: "INPUT" },
  { id: "operation", label: "OPERATION" },
  { id: "settings", label: "EXECUTION" },
  { id: "review", label: "REVIEW" },
];

const OPS = [
  {
    id: "sum", label: "Sum", symbol: "Σ", icon: "sigma",
    sub: "Distributed numeric aggregation",
    algo: "Each worker returns the partial total of its chunk. The aggregator sums the partials — order-independent and exact.",
  },
  {
    id: "mean", label: "Mean", symbol: "μ", icon: "gauge",
    sub: "Weighted distributed average",
    algo: "Workers return (sum, count). The aggregator combines both values — this avoids chunk-size bias when the last chunk is smaller than the rest.",
  },
  {
    id: "filter", label: "Filter", symbol: "⌕", icon: "filter",
    sub: "Distributed conditional count",
    algo: "Each worker counts rows where the column equals the target value. The aggregator sums the per-chunk counts into the total.",
  },
];

export async function mountNewJob(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "NEW JOB",
        title: "Distribute a file",
        sub: "Four steps from raw file to aggregated result.",
      })}
      <div class="wizard-steps" role="tablist" aria-label="Wizard steps">
        ${STEPS.map((s, i) => `
          <button type="button" class="wizard-step" data-step="${s.id}" role="tab" aria-selected="${i === 0}">
            <span class="wizard-step-num">0${i + 1}</span>
            <span>${s.label}</span>
          </button>`).join("")}
      </div>
      <div class="panel">
        <div class="panel-body" id="wizard-body"></div>
        <div class="wizard-nav">
          <button class="btn btn-ghost" id="wz-back" disabled>${icon("arrowLeft", 13)} Back</button>
          <div class="wizard-nav-right">
            <span class="mono xs" id="wz-status"></span>
            <button class="btn btn-ghost" id="wz-next">Next ${icon("arrowRight", 13)}</button>
            <button class="btn btn-primary" id="wz-run" hidden>${icon("play", 13)} Start distributed job</button>
          </div>
        </div>
      </div>
    </div>
  `));

  const state = {
    step: 0,
    file: null,
    fileName: null,
    fileSize: null,
    fileExtension: null,
    operation: "sum",
    column: "",
    filterValue: "",
    chunkSize: 100000,
    demoArmed: false,
    inspection: null,
    inspecting: false,
  };

  const body = root.querySelector("#wizard-body");
  const nextBtn = root.querySelector("#wz-next");
  const backBtn = root.querySelector("#wz-back");
  const runBtn = root.querySelector("#wz-run");
  const statusEl = root.querySelector("#wz-status");
  const steps = [...root.querySelectorAll(".wizard-step")];

  const stepValidation = {
    input: () => !!state.file,
    operation: () => {
      if (!state.operation) return false;
      if ((state.operation === "sum" || state.operation === "mean") && !state.column) return false;
      if (state.operation === "filter" && (!state.column || !state.filterValue)) return false;
      return true;
    },
    settings: () => state.chunkSize >= 1000,
    review: () => true,
  };

  const updateNav = () => {
    steps.forEach((s, i) => {
      s.classList.toggle("active", i === state.step);
      s.classList.toggle("done", i < state.step);
      s.setAttribute("aria-selected", String(i === state.step));
    });
    nextBtn.hidden = state.step === STEPS.length - 1;
    runBtn.hidden = state.step !== STEPS.length - 1;
    backBtn.disabled = state.step === 0;
    const ok = stepValidation[STEPS[state.step].id]();
    nextBtn.disabled = !ok;
    runBtn.disabled = !ok;
  };

  const renderStep = async () => {
    const id = STEPS[state.step].id;
    body.replaceChildren();
    if (id === "input") body.appendChild(renderInput());
    if (id === "operation") body.appendChild(renderOperation());
    if (id === "settings") body.appendChild(renderSettings());
    if (id === "review") body.appendChild(renderReview());
    updateNav();
    if (id === "review") await inspectIfNeeded();
  };

  const renderInput = () => {
    const el = h(`
      <div class="wizard-step-body">
        <label class="dropzone" id="dz">
          <input type="file" id="file-input" accept=".csv,.json,.jsonl" hidden />
          <span class="dropzone-icon">${icon("upload", 22)}</span>
          <div>
            <div class="dropzone-title">Drop a CSV or JSON file here</div>
            <div class="dropzone-sub">or click to browse · processed in parallel chunks over Ray</div>
          </div>
        </label>
        <div id="inspect-result"></div>
      </div>`);
    const input = el.querySelector("#file-input");
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (f) setFile(f);
    });
    const dz = el.querySelector("#dz");
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("over");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) setFile(f);
    });
    return el;
  };

  const setFile = (f) => {
    state.file = f;
    state.fileName = f.name;
    state.fileSize = f.size;
    state.fileExtension = (f.name.split(".").pop() || "").toLowerCase();
    state.inspection = null;
    body.replaceChildren();
    renderStep();
    inspectIfNeeded();
  };

  const inferType = (v) => {
    if (v === null || v === undefined || v === "") return "empty";
    if (typeof v === "boolean") return "bool";
    if (typeof v === "number") return "number";
    const s = String(v);
    if (s.trim() !== "" && !Number.isNaN(Number(s))) return "number";
    return "string";
  };

  const renderInspected = () => {
    const insp = state.inspection;
    const box = body.querySelector("#inspect-result") || body.querySelector("#run-state");
    if (!insp) return;
    const cols = (insp.columns || []).map((c) => ({
      name: c,
      type: inferType((insp.sample || []).map((r) => r[c]).find((v) => v !== undefined && v !== null && v !== "")) || "string",
    }));
    const sample = (insp.sample || []).slice(0, 5);
    const preview = sample.length && cols.length ? `
      <div class="preview">
        <div class="preview-head">Sample preview <span class="mono xs dim">first ${sample.length} rows</span></div>
        <div class="table-scroll"><table class="table">
          <thead><tr>${cols.map((c) => `<th>${esc(c.name)} <span class="type-tag">${c.type}</span></th>`).join("")}</tr></thead>
          <tbody>${sample.map((row) => `<tr>${cols.map((c) => `<td class="mono">${esc(row[c] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody>
        </table></div>
      </div>` : "";
    box.innerHTML = `
      <div class="inspected">
        <span class="inspected-head">
          <span class="file-badge ext-${state.fileExtension.toLowerCase()}">${state.fileExtension.toUpperCase()}</span>
          <span class="mono">${esc(state.fileName)}</span>
          <span class="mono xs dim">${formatBytes(state.fileSize)}</span>
        </span>
        <div class="inspected-stats mono">
          <span>${formatNumber(insp.row_count)} rows</span>
          <span>${formatNumber(insp.estimated_chunks)} chunks @ ${formatNumber(state.chunkSize)} rows</span>
          <span>${cols.length} columns</span>
        </div>
        <div class="inspected-cols">
          ${cols.map((c) => `<span class="col-pill"><code>${esc(c.name)}</code><em>${c.type}</em></span>`).join("")}
        </div>
        <div class="inspected-valid"><span class="dot on"></span>validation passed — ready to distribute</div>
        ${preview}
      </div>`;
  };

  const renderOperation = () => {
    const el = h(`
      <div class="wizard-step-body">
        <div class="op-grid">
          ${OPS.map((c) => `
            <button type="button" class="op-card${state.operation === c.id ? " active" : ""}" data-op="${c.id}">
              <span class="op-symbol mono">${c.symbol}</span>
              <span class="op-name">${c.label}</span>
              <span class="op-sub">${c.sub}</span>
            </button>`).join("")}
        </div>
        <div class="op-algo" id="op-algo"></div>
        <div class="form-row">
          <label class="field">
            <span class="field-label">Target column</span>
            <input class="input mono" id="op-column" list="col-hints" placeholder="e.g. value" value="${escAttr(state.column)}" />
            <datalist id="col-hints"></datalist>
          </label>
        </div>
        <div class="form-row" id="filter-row" hidden>
          <label class="field">
            <span class="field-label">Filter value</span>
            <input class="input mono" id="op-filter" placeholder="e.g. alpha" value="${escAttr(state.filterValue)}" />
            <span class="field-hint">Rows where the column equals this value are counted.</span>
          </label>
        </div>
      </div>`);

    const opBtns = [...el.querySelectorAll(".op-card")];
    const opAlgo = el.querySelector("#op-algo");
    const updateAlgo = () => {
      const c = OPS.find((x) => x.id === state.operation);
      opAlgo.innerHTML = c ? `<div class="op-algo-inner">${icon("info", 14)}<span><b>${c.label}.</b> ${c.algo}</span></div>` : "";
    };
    opBtns.forEach((b) => b.addEventListener("click", () => {
      state.operation = b.dataset.op;
      opBtns.forEach((x) => x.classList.toggle("active", x === b));
      el.querySelector("#filter-row").hidden = state.operation !== "filter";
      syncColumns();
      updateAlgo();
      updateNav();
    }));
    el.querySelector("#filter-row").hidden = state.operation !== "filter";
    updateAlgo();
    const colInput = el.querySelector("#op-column");
    colInput.addEventListener("input", () => { state.column = colInput.value; updateNav(); });
    el.querySelector("#op-filter").addEventListener("input", (e) => { state.filterValue = e.target.value; updateNav(); });

    const syncColumns = () => {
      const dl = el.querySelector("#col-hints");
      dl.replaceChildren();
      (state.inspection?.columns || []).forEach((c) => dl.appendChild(h(`<option value="${escAttr(c)}"></option>`)));
    };
    syncColumns();
    return el;
  };

  const renderSettings = () => {
    const demo = store.demoMode;
    const el = h(`
      <div class="wizard-step-body">
        <div class="form-row">
          <label class="field">
            <span class="field-label">Chunk size (rows)</span>
            <input class="input mono" id="chunk-size" type="number" min="1000" step="1000" value="${state.chunkSize}" />
            <span class="field-hint">Each chunk is processed by an independent Ray worker task. Lower = more parallelism, higher = less overhead.</span>
          </label>
        </div>
        <div class="settings-estimate" id="chunk-estimate"></div>
        <div class="form-row" id="demo-row" ${demo ? "" : "hidden"}>
          <label class="check">
            <input type="checkbox" id="demo-fail" ${state.demoArmed ? "checked" : ""} />
            <span>Fault-inject the first chunk</span>
            <span class="field-hint">Simulates a worker crash to demonstrate automatic retry. Enabled when DEMO_MODE=true.</span>
          </label>
        </div>
      </div>`);
    const estimateEl = el.querySelector("#chunk-estimate");
    const updateEstimate = () => {
      const insp = state.inspection;
      if (insp && insp.row_count) {
        const est = Math.max(1, Math.ceil(insp.row_count / state.chunkSize));
        estimateEl.innerHTML = `
          <div class="estimate-row">
            <span>Estimated chunks</span><span class="mono">${formatNumber(est)}</span>
          </div>
          <div class="estimate-bar">
            ${Array.from({ length: Math.min(est, 24) }, (_, i) => `<span class="est-chunk${i < 2 ? " on" : ""}"></span>`).join("")}
          </div>
          <div class="mono xs dim">${formatNumber(insp.row_count)} rows ÷ ${formatNumber(state.chunkSize)} rows/chunk</div>`;
      } else {
        estimateEl.innerHTML = `<div class="mono xs dim">upload a file to see the chunk estimate</div>`;
      }
    };
    el.querySelector("#chunk-size").addEventListener("input", (e) => {
      state.chunkSize = parseInt(e.target.value, 10) || 0;
      updateEstimate();
      updateNav();
    });
    el.querySelector("#demo-fail").addEventListener("change", (e) => {
      state.demoArmed = e.target.checked;
    });
    updateEstimate();
    return el;
  };

  const renderReview = () => {
    const insp = state.inspection;
    const concurrency = store.system?.max_concurrent_tasks ?? "—";
    const rows = [
      ["Input", `${escHtml(state.fileName || "—")} · ${formatBytes(state.fileSize)}`],
      ["Operation", state.operation],
      ["Column", escHtml(state.column || "—")],
      ["Filter value", escHtml(state.filterValue || "—")],
      ["Chunk size", formatNumber(state.chunkSize) + " rows"],
      ["Estimated chunks", insp ? formatNumber(insp.estimated_chunks) : "—"],
      ["Max concurrent tasks", concurrency],
    ];
    if (store.demoMode) rows.push(["Fault injection", state.demoArmed ? "chunk 1" : "off"]);
    const el = h(`
      <div class="wizard-step-body">
        <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd class="mono">${v}</dd>`).join("")}</dl>
        <div class="run-state" id="run-state"></div>
      </div>`);
    return el;
  };

  const inspectIfNeeded = async () => {
    if (state.inspection || state.inspecting) return;
    state.inspecting = true;
    statusEl.textContent = "inspecting file…";
    try {
      const insp = await api.inspect(state.file, state.chunkSize);
      state.inspection = insp;
      renderInspected();
    } catch (err) {
      statusEl.textContent = err.message || "inspection unavailable";
    } finally {
      state.inspecting = false;
      setTimeout(() => { if (statusEl.textContent === "inspecting file…") statusEl.textContent = ""; }, 400);
    }
  };

  const runJob = async () => {
    statusEl.textContent = "dispatching…";
    runBtn.disabled = true;
    try {
      const res = await api.upload({
        file: state.file,
        operation: state.operation,
        column: state.column,
        filterValue: state.filterValue,
        chunkSize: state.chunkSize,
        demoFailChunks: state.demoArmed ? 0 : undefined,
      });
      await api.process(res.job_id);
      window.location.hash = `#/job/${res.job_id}`;
    } catch (err) {
      statusEl.textContent = err.message;
      runBtn.disabled = false;
    }
  };

  const go = (dir) => {
    state.step = Math.max(0, Math.min(STEPS.length - 1, state.step + dir));
    renderStep();
  };

  nextBtn.addEventListener("click", () => go(1));
  backBtn.addEventListener("click", () => go(-1));
  runBtn.addEventListener("click", runJob);

  renderStep();
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escHtml(s) { return esc(s); }
function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}