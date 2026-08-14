// Pure formatting helpers — no DOM, unit-testable in Node.

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = -1;
  do { v /= 1024; i += 1; } while (v >= 1024 && i < units.length - 1);
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatNumber(n, maxFrac = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

export function formatMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const m = Math.floor(ms / 60_000);
  const s = (ms % 60_000) / 1000;
  return `${m}m ${s.toFixed(1)}s`;
}

export function formatSeconds(s) {
  if (s === null || s === undefined || Number.isNaN(s)) return "—";
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  return `${s.toFixed(2)} s`;
}

// Elapsed wall-clock since a timestamp, rendered as "12s" / "3m 02s" / "1h 04m".
export function formatElapsed(startIso, endIsoOrNow) {
  if (!startIso) return "—";
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "—";
  const end = endIsoOrNow ? new Date(endIsoOrNow).getTime() : Date.now();
  if (Number.isNaN(end)) return "—";
  let s = Math.max(0, Math.floor((end - start) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  s = s % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function shortId(id) {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}` : id;
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatClock(epochMs) {
  if (!epochMs && epochMs !== 0) return "—";
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (x) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortNode(nodeId) {
  if (!nodeId) return "worker-?";
  const short = nodeId.replace(/^node:([0-9a-f]+)/, "$1");
  return short.length > 10 ? short.slice(0, 10) : short;
}