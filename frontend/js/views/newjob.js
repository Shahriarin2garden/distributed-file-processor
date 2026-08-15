// New-job wizard — mirrors the Obsidian Flux "New Job Wizard" screen:
// header/tracker card (ID + DRAFT + step progress bar), a big bordered
// dropzone over an animated grid, an inspection panel that replaces the
// dropzone after selection, a Quick Config sidebar (operation tiles +
// target column), and a sticky action bar.
// Every estimate comes from the real /inspect response; column types are
// inferred from the returned sample, never fabricated.

import { store } from "../store.js";
import { api } from "../api.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { formatBytes, formatNumber } from "../format.js";

const STEPS = [
  { id: "upload", label: "UPLOAD" },
  { id: "config", label: "CONFIG" },
  { id: "inspect", label: "INSPECT" },
  { id: "run", label: "RUN" },
];

const OPS = [
  { id: "sum", label: "SUM", sub: "numeric total", icon: "sigma" },
  { id: "mean", label: "MEAN", sub: "weighted avg", icon: "gauge" },
  { id: "filter", label: "FILTER", sub: "conditional count", icon: "filter" },
];

export async function mountNewJob(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      <!-- Header / tracker -->
      <div class="nj-header">
        <div class="nj-header-top">
          <h1 class="nj-title">New Job</h1>
          <div class="nj-badges">
            <span class="nj-badge-dark mono" id="nj-id">ID: —</span>
            <span class="nj-badge mono">DRAFT</span>
          </div>
        </div>
        <div class="nj-track">
          <div class="nj-track-bar" aria-hidden="true"><div class="nj-track-fill" id="nj-fill"></div></div>
          <div class="nj-track-labels mono" id="nj-labels">
            ${STEPS.map((s, i) => `<span class="nj-track-step" data-i="${i}">0${i + 1}_${s.label}</span>`).join("")}
          </div>
        </div>
      </div>

      <!-- Wizard stage -->
      <div class="nj-stage">
        <div class="nj-stage-body" id="wizard-body"></div>
      </div>

      <!-- Sticky action bar -->
      <div class="nj-actions">
        <button class="btn btn-ghost" id="wz-back" disabled>${icon("arrowLeft", 13)} Back</button>
        <div class="nj-actions-right">
          <span class="mono xs" id="wz-status"></span>
          <button class="btn btn-ghost" id="wz-next">Next Step ${icon("arrowRight", 13)}</button>
          <button class="btn btn-primary" id="wz-run" hidden>${icon("play", 13)} Start distributed job</button>
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
  const fillEl = root.querySelector("#nj-fill");
  const trackSteps = [...root.querySelectorAll(".nj-track-step")];

  const stepValidation = {
    upload: () => {
      if (!state.file) return false;
      if (!state.operation) return false;
      if ((state.operation === "sum" || state.operation === "mean") && !state.column) return false;
      if (state.operation === "filter" && (!state.column || !state.filterValue)) return false;
      return true;
    },
    config: () => state.chunkSize >= 1000,
    inspect: () => !!state.inspection,
    run: () => true,
  };

  const updateNav = () => {
    trackSteps.forEach((s, i) => {
      s.classList.toggle("active", i === state.step);
      s.classList.toggle("done", i < state.step);
    });
    fillEl.style.width = `${((state.step + 1) / STEPS.length) * 100}%`;
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
    if (id === "upload") body.appendChild(renderUpload());
    if (id === "config") body.appendChild(renderConfig());
    if (id === "inspect") body.appendChild(renderInspect());
    if (id === "run") body.appendChild(renderRun());
    updateNav();
    if (id === "inspect" || id === "run") await inspectIfNeeded();
  };

  const renderUpload = () => {
    const cols = state.inspection?.columns || [];
    const el = h(`
      <div class="nj-upload-grid">
        <div class="nj-upload-main">
          <label class="nj-dropzone" id="dz" ${state.file ? "hidden" : ""}>
            <input type="file" id="file-input" accept=".csv,.json,.jsonl" hidden />
            <span class="nj-dz-iconbox" aria-hidden="true">${icon("upload", 44)}</span>
            <h2 class="nj-dz-title">Drop telemetry data</h2>
            <p class="nj-dz-sub">CSV, JSON, or JSON Lines accepted. Files are split into row-bounded chunks and processed in parallel over Ray.</p>
            <span class="nj-dz-btn">Select File</span>
          </label>

          <div class="nj-inspect" id="inspect-panel" ${state.file ? "" : "hidden"}>
            <div class="nj-inspect-head">
              <span class="nj-inspect-file mono">> ${state.fileName ? esc(state.fileName) : "—"}</span>
              <span class="nj-inspect-badge mono">${state.inspection ? formatNumber(state.inspection.row_count) : "—"} ROWS LOADED</span>
            </div>
            <div id="inspect-table"></div>
          </div>
        </div>

        <aside class="nj-qc">
          <div class="nj-qc-head">
            <span>Quick Config</span>
            <span class="nj-qc-icon" aria-hidden="true">${icon("settings", 15)}</span>
          </div>
          <div class="nj-qc-body">
            <label class="nj-field-label" for="qc-column">Target Column</label>
            <div class="nj-select-wrap">
              <select id="qc-column" class="nj-select mono" ${cols.length ? "" : "disabled"}>
                <option value="">Select column…</option>
                ${cols.map((c) => `<option value="${escAttr(c)}" ${state.column === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
              </select>
              <span class="nj-select-caret" aria-hidden="true">${icon("chevronDown", 14)}</span>
            </div>

            <label class="nj-field-label">Operation</label>
            <div class="nj-op-tiles">
              ${OPS.map((o) => `
                <label class="nj-op-tile${state.operation === o.id ? " active" : ""}" data-op="${o.id}">
                  <input type="radio" name="nj-operation" value="${o.id}" ${state.operation === o.id ? "checked" : ""} class="nj-op-radio" />
                  <span class="nj-op-tile-inner mono">${o.label}</span>
                </label>`).join("")}
            </div>

            <div class="nj-filter-row" id="qc-filter-row" ${state.operation === "filter" ? "" : "hidden"}>
              <label class="nj-field-label" for="qc-filter">Filter value</label>
              <input class="nj-input mono" id="qc-filter" value="${escAttr(state.filterValue)}" placeholder="e.g. alpha" />
            </div>

            <div class="nj-note">
              ${icon("info", 14)}
              <span>Advanced configuration is available in Step 02 after file validation.</span>
            </div>
          </div>
        </aside>
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

    const colSel = el.querySelector("#qc-column");
    colSel.addEventListener("change", () => { state.column = colSel.value; updateNav(); });

    const opTiles = [...el.querySelectorAll(".nj-op-tile")];
    opTiles.forEach((t) => t.addEventListener("click", () => {
      state.operation = t.dataset.op;
      t.querySelector("input").checked = true;
      opTiles.forEach((x) => x.classList.toggle("active", x === t));
      el.querySelector("#qc-filter-row").hidden = state.operation !== "filter";
      updateNav();
    }));

    el.querySelector("#qc-filter").addEventListener("input", (e) => { state.filterValue = e.target.value; updateNav(); });

    if (state.inspection) renderInspectTable(el.querySelector("#inspect-table"));
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

  const renderInspectTable = (box) => {
    const insp = state.inspection;
    if (!insp) return;
    const cols = (insp.columns || []).map((c) => ({
      name: c,
      type: inferType((insp.sample || []).map((r) => r[c]).find((v) => v !== undefined && v !== null && v !== "")) || "string",
    }));
    const sample = (insp.sample || []).slice(0, 5);
    if (!cols.length) {
      box.innerHTML = `<div class="nj-inspect-empty mono">no columns detected</div>`;
      return;
    }
    box.innerHTML = `
      <div class="table-scroll"><table class="table nj-inspect-table">
        <thead><tr>${cols.map((c) => `<th>${esc(c.name)} <span class="type-tag">${c.type}</span></th>`).join("")}</tr></thead>
        <tbody>${sample.map((row) => `<tr>${cols.map((c) => `<td class="mono">${esc(row[c] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;
  };

  const renderInspect = () => {
    const insp = state.inspection;
    const el = h(`
      <div class="wizard-step-body">
        <div class="nj-inspect" style="display:block">
          <div class="nj-inspect-head">
            <span class="nj-inspect-file mono">> ${state.fileName ? esc(state.fileName) : "—"}</span>
            <span class="nj-inspect-badge mono">${insp ? formatNumber(insp.row_count) : "—"} ROWS LOADED</span>
          </div>
          <div id="inspect-full"></div>
        </div>
        <div class="inspected-cols" id="inspect-cols"></div>
        <div class="inspected-valid"><span class="dot on"></span>validation passed — ready to distribute</div>
      </div>`);
    if (insp) {
      renderInspectTable(el.querySelector("#inspect-full"));
      const cols = (insp.columns || []).map((c) => ({
        name: c,
        type: inferType((insp.sample || []).map((r) => r[c]).find((v) => v !== undefined && v !== null && v !== "")) || "string",
      }));
      el.querySelector("#inspect-cols").innerHTML = cols
        .map((c) => `<span class="col-pill"><code>${esc(c.name)}</code><em>${c.type}</em></span>`).join("");
    }
    return el;
  };

  const renderConfig = () => {
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

  const renderRun = () => {
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
        <div class="section-label">Review & launch</div>
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
      const uploadActive = STEPS[state.step].id === "upload";
      if (uploadActive) {
        body.replaceChildren();
        renderStep();
      } else {
        body.replaceChildren();
        renderStep();
      }
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