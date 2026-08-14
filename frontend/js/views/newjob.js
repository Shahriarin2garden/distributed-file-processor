import { store } from "../store.js";
import { api } from "../api.js";
import { h, clear, on } from "../dom.js";
import { icon } from "../icons.js";
import { SectionTitle, EmptyState } from "../components.js";
import { formatBytes, formatNumber } from "../format.js";

const STEPS = [
  { id: "input", label: "Input" },
  { id: "operation", label: "Operation" },
  { id: "settings", label: "Settings" },
  { id: "review", label: "Review" },
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
            <span class="wizard-step-num">${i + 1}</span>
            <span>${s.label}</span>
          </button>`).join("")}
      </div>
      <div class="panel">
        <div class="panel-body" id="wizard-body"></div>
        <div class="wizard-nav">
          <button class="btn btn-ghost" id="wz-back" disabled>Back</button>
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
    demoFailChunks: 0,
    inspection: null,
    inspecting: false,
    runState: null, // {status, progress}
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
    settings: () => state.chunkSize > 0,
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
          <input type="file" id="file-input" accept=".csv,.json" hidden />
          <span class="dropzone-icon">${icon("upload", 22)}</span>
          <div>
            <div class="dropzone-title">Drop a CSV or JSON file here</div>
            <div class="dropzone-sub">or click to browse · processed in parallel chunks over Ray</div>
          </div>
          ${state.file ? `
            <div class="file-pill">
              <span class="file-badge ext-${state.fileExtension.toLowerCase()}">${state.fileExtension}</span>
              <span class="mono">${escapeHtml(state.fileName)}</span>
              <span class="mono xs dim">${formatBytes(state.fileSize)}</span>
            </div>` : ""}
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

  const renderOperation = () => {
    const cards = [
      { id: "sum", label: "Sum", sub: "Total of a numeric column across all chunks", icon: "sigma" },
      { id: "mean", label: "Mean", sub: "Average of a numeric column", icon: "gauge" },
      { id: "filter", label: "Filter", sub: "Rows where a column matches a value", icon: "filter" },
    ];
    const el = h(`
      <div class="wizard-step-body">
        <div class="op-grid">
          ${cards.map((c) => `
            <button type="button" class="op-card${state.operation === c.id ? " active" : ""}" data-op="${c.id}">
              <span class="op-icon">${icon(c.icon, 20)}</span>
              <span class="op-name">${c.label}</span>
              <span class="op-sub">${c.sub}</span>
            </button>`).join("")}
        </div>
        <div class="form-row">
          <label class="field">
            <span class="field-label">Target column</span>
            <input class="input mono" id="op-column" list="col-hints" placeholder="e.g. value" value="${escapeAttr(state.column)}" />
            <datalist id="col-hints"></datalist>
          </label>
        </div>
        <div class="form-row" id="filter-row" hidden>
          <label class="field">
            <span class="field-label">Filter value</span>
            <input class="input mono" id="op-filter" placeholder="e.g. 100 or region==north" value="${escapeAttr(state.filterValue)}" />
          </label>
        </div>
      </div>`);

    const opBtns = [...el.querySelectorAll(".op-card")];
    opBtns.forEach((b) => b.addEventListener("click", () => {
      state.operation = b.dataset.op;
      el.querySelectorAll(".op-card").forEach((x) => x.classList.toggle("active", x === b));
      el.querySelector("#filter-row").hidden = state.operation !== "filter";
      syncColumns();
      updateNav();
    }));
    el.querySelector("#filter-row").hidden = state.operation !== "filter";
    const colInput = el.querySelector("#op-column");
    colInput.addEventListener("input", () => { state.column = colInput.value; updateNav(); });
    el.querySelector("#op-filter").addEventListener("input", (e) => { state.filterValue = e.target.value; updateNav(); });

    const syncColumns = () => {
      const dl = el.querySelector("#col-hints");
      dl.replaceChildren();
      const cols = state.inspection?.columns || [];
      cols.forEach((c) => dl.appendChild(h(`<option value="${escapeAttr(c)}"></option>`)));
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
        <div class="form-row" id="demo-row" ${demo ? "" : "hidden"}>
          <label class="check">
            <input type="checkbox" id="demo-fail" />
            <span>Fault-inject the first chunk</span>
            <span class="field-hint">Simulates a worker crash to demonstrate automatic retry. Enabled when DEMO_MODE=true.</span>
          </label>
        </div>
      </div>`);
    el.querySelector("#chunk-size").addEventListener("input", (e) => {
      state.chunkSize = parseInt(e.target.value, 10) || 0;
      updateNav();
    });
    el.querySelector("#demo-fail").addEventListener("change", (e) => {
      state.demoFailChunks = e.target.checked ? 0 : 0; // UI toggle; value mapped at submit
      state.demoArmed = e.target.checked;
    });
    return el;
  };

  const renderReview = () => {
    const demoArmed = !!state.demoArmed;
    const rows = [
      ["File", escapeHtml(state.fileName || "—")],
      ["Size", formatBytes(state.fileSize)],
      ["Operation", state.operation],
      ["Column", escapeHtml(state.column || "—")],
      ["Filter value", escapeHtml(state.filterValue || "—")],
      ["Chunk size", formatNumber(state.chunkSize) + " rows"],
    ];
    if (store.demoMode) rows.push(["Demo fault", demoArmed ? "inject on chunk 1" : "off"]);
    if (state.inspection) rows.push(["Estimated chunks", formatNumber(state.inspection.estimated_chunks)]);
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
      const box = body.querySelector("#run-state") || body.querySelector("#inspect-result");
      if (box) {
        box.innerHTML = `
          <div class="inspected">
            ${icon("checkCircle", 14)} <b>${formatNumber(insp.row_count)}</b> rows · ${formatNumber(insp.estimated_chunks)} chunks · columns: ${insp.columns.map((c) => `<code>${escapeHtml(c)}</code>`).join(" ")}
          </div>`;
      }
    } catch {
      statusEl.textContent = "inspection unavailable";
    } finally {
      state.inspecting = false;
      statusEl.textContent = "";
    }
  };

  const runJob = async () => {
    const demoArmed = !!state.demoArmed;
    statusEl.textContent = "dispatching…";
    runBtn.disabled = true;
    try {
      const res = await api.upload({
        file: state.file,
        operation: state.operation,
        column: state.column,
        filterValue: state.filterValue,
        chunkSize: state.chunkSize,
        demoFailChunks: demoArmed ? 0 : undefined,
      });
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
  on(body, "[data-op]", "click", () => {});

  renderStep();
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}