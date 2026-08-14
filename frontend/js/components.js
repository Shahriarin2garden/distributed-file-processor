import { icon } from "./icons.js";
import { escapeHtml } from "./dom.js";
import { statusLabel, statusTone } from "./model.js";
import { formatNumber } from "./format.js";

// Status badge — tone + text (never color-only).
export function StatusBadge({ status, label, pulse }) {
  const tone = statusTone(status);
  return `<span class="badge tone-${tone}${pulse ? " pulse" : ""}" role="status">
    <span class="dot" aria-hidden="true"></span>${escapeHtml(label || statusLabel(status))}
  </span>`;
}

export function ToneBadge({ tone, label }) {
  return `<span class="badge tone-${tone}"><span class="dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

export function MetricCard({ label, value, sub, tone, iconName, hint }) {
  const v = value === null || value === undefined || value === "" ? "—" : value;
  return `
  <div class="metric${tone ? ` tone-${tone}` : ""}"${hint ? ` title="${escapeHtml(hint)}"` : ""}>
    <div class="metric-label">${iconName ? icon(iconName, 12) : ""}${escapeHtml(label)}</div>
    <div class="metric-value">${v}</div>
    ${sub ? `<div class="metric-sub">${sub}</div>` : ""}
  </div>`;
}

export function Panel({ title, iconName, right, body, flush, id, className }) {
  return `
  <section class="panel${className ? ` ${className}` : ""}"${id ? ` id="${id}"` : ""}>
    ${title || right ? `
      <header class="panel-head">
        ${title ? `<h2 class="panel-title">${iconName ? icon(iconName, 13) : ""}${escapeHtml(title)}</h2>` : ""}
        ${right ? `<div class="panel-right">${right}</div>` : ""}
      </header>` : ""}
    <div class="panel-body${flush ? " flush" : ""}">${body || ""}</div>
  </section>`;
}

export function EmptyState({ iconName, title, body, action }) {
  return `
  <div class="empty">
    ${icon(iconName || "box", 28)}
    <div class="empty-title">${escapeHtml(title)}</div>
    ${body ? `<div class="empty-body">${body}</div>` : ""}
    ${action || ""}
  </div>`;
}

export function ProgressBar({ pct, tone, shimmer, label }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return `
  <div role="progressbar" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="100" aria-label="${escapeHtml(label || "progress")}">
    <div class="progress-track">
      <div class="progress-fill${tone ? ` tone-${tone}` : ""}${shimmer ? " shimmer" : ""}" style="width:${clamped}%"></div>
    </div>
  </div>`;
}

export function SectionTitle({ kicker, title, sub }) {
  return `
  <div style="margin-bottom:18px">
    ${kicker ? `<div class="kicker">${escapeHtml(kicker)}</div>` : ""}
    ${title ? `<h1 class="hero-title" style="margin-top:6px">${title}</h1>` : ""}
    ${sub ? `<p class="hero-sub">${sub}</p>` : ""}
  </div>`;
}

export function Kv({ pairs }) {
  return `
  <dl class="kv">
    ${pairs.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join("")}
  </dl>`;
}

export function WorkerChip({ label, sub, tone }) {
  return `
  <div class="worker-chip${tone ? ` ${tone}` : ""}" style="border:1px solid var(--border-2);border-radius:7px;padding:8px 12px;min-width:110px;background:var(--surface)">
    <div class="mono" style="font-size:11px;color:var(--text)">${escapeHtml(label)}</div>
    <div style="font-size:10px;color:var(--text-3)">${escapeHtml(sub || "")}</div>
  </div>`;
}

export function Spinner() {
  return `<span class="mono" style="color:var(--text-3)">…</span>`;
}

export function Skeleton({ rows = 1 }) {
  let out = "";
  for (let i = 0; i < rows; i++) out += `<div class="skeleton" style="height:14px;margin:8px 0"></div>`;
  return out;
}

// Number with mono styling used in tables.
export function num(v, maxFrac = 0) {
  return `<span class="num">${formatNumber(v, maxFrac)}</span>`;
}

export function Segmented({ options, value, name, onSelect }) {
  return `
  <div class="seg" role="tablist">
    ${options.map((o) => `
      <button type="button" role="tab" aria-selected="${o.value === value}" class="${o.value === value ? "active" : ""}"
        data-seg="${name}" data-value="${o.value}">${escapeHtml(o.label)}</button>
    `).join("")}
  </div>`;
}

export function PaginationRow({ offset, limit, total, onNav }) {
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:12px;color:var(--text-3)">
    <span>${num(total)} jobs</span>
    <span style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" data-pg="prev" ${hasPrev ? "" : "disabled"}>Previous</button>
      <button class="btn btn-ghost btn-sm" data-pg="next" ${hasNext ? "" : "disabled"}>Next</button>
    </span>
  </div>`;
}