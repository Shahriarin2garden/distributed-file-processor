import { store } from "../store.js";
import { h, clear, on, debounce } from "../dom.js";
import { icon } from "../icons.js";
import { Panel, StatusBadge, EmptyState, SectionTitle, num, PaginationRow } from "../components.js";
import { normalizeJob } from "../model.js";
import { formatBytes, timeAgo, formatMs } from "../format.js";

const PAGE = 20;

export async function mountHistory(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "JOB HISTORY",
        title: "All jobs",
        sub: "Every upload, its status, and its real result.",
      })}
      <div class="filter-bar">
        <div class="seg" role="tablist" id="hist-status">
          <button type="button" class="active" data-v="">All</button>
          <button type="button" data-v="processing">Processing</button>
          <button type="button" data-v="completed">Completed</button>
          <button type="button" data-v="failed">Failed</button>
        </div>
        <div class="filter-right">
          <label class="search">
            ${icon("search", 14)}
            <input id="hist-q" class="input" placeholder="Search filename…" />
          </label>
          <button class="btn btn-ghost btn-sm" id="hist-refresh">${icon("refresh", 13)}</button>
        </div>
      </div>
      <div id="hist-table"></div>
    </div>
  `));

  const tableEl = root.querySelector("#hist-table");
  const statusBtns = [...root.querySelectorAll("#hist-status button")];
  let statusFilter = "";
  let q = "";
  let offset = 0;

  const applyFilter = () => {
    offset = 0;
    render();
  };

  statusBtns.forEach((b) => b.addEventListener("click", () => {
    statusFilter = b.dataset.v;
    statusBtns.forEach((x) => x.classList.toggle("active", x === b));
    applyFilter();
  }));

  root.querySelector("#hist-q").addEventListener("input", debounce((e) => {
    q = e.target.value.trim();
    applyFilter();
  }, 250));

  root.querySelector("#hist-refresh").addEventListener("click", () => { store.refreshJobs(); });

  on(root, "[data-pg]", "click", (btn) => {
    offset += btn.dataset.pg === "next" ? PAGE : -PAGE;
    render();
  });

  const render = () => {
    const all = store.jobs;
    if (!all) {
      tableEl.replaceChildren(h(`<div class="panel"><div class="panel-body">${icon("loader", 22)} Loading…</div></div>`));
      return;
    }
    let filtered = all.map(normalizeJob);
    if (statusFilter) filtered = filtered.filter((j) => j.status === statusFilter);
    if (q) filtered = filtered.filter((j) => j.filename.toLowerCase().includes(q.toLowerCase()));
    filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    const page = filtered.slice(offset, offset + PAGE);

    if (!filtered.length) {
      tableEl.replaceChildren(h(Panel({
        title: "Jobs",
        body: EmptyState({ iconName: "box", title: "No matching jobs", body: "Adjust filters or start a new job." }),
      })));
      return;
    }

    const rows = page.map((j) => `
      <tr data-href="#/job/${j.id}">
        <td><span class="file-badge ext-${j.extension.toLowerCase()}">${j.extension}</span></td>
        <td class="job-name-cell"><span class="job-name">${escape(j.filename)}</span><span class="mono xs dim">${j.id.slice(0, 8)}</span></td>
        <td><span class="mono">${j.operation}</span>${j.column ? ` <span class="mono xs dim">· ${escape(j.column)}</span>` : ""}</td>
        <td class="num mono">${formatBytes(j.fileSize)}</td>
        <td>${StatusBadge({ status: j.status, pulse: j.status === "processing" })}</td>
        <td class="mono">${j.durationMs != null ? formatMs(j.durationMs) : "—"}</td>
        <td class="mono dim">${j.result != null ? num(j.result, 2) : "—"}</td>
        <td class="mono dim">${timeAgo(j.createdAt)}</td>
      </tr>`).join("");

    tableEl.replaceChildren(h(`
      <div class="panel flush">
        <div class="table-scroll">
          <table class="table">
            <thead><tr>
              <th>Type</th><th>File</th><th>Operation</th><th>Size</th><th>Status</th><th>Duration</th><th>Result</th><th>Created</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${PaginationRow({ offset, limit: PAGE, total: filtered.length })}
      </div>
    `));

    tableEl.querySelectorAll("tr[data-href]").forEach((tr) => {
      tr.addEventListener("click", () => { window.location.hash = tr.dataset.href; });
    });
  };

  store.subscribe(render);
  if (!store.jobs) store.refreshJobs();
  render();
}

function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}