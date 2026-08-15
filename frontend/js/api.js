// API client. Uses the same-origin base by default (the SPA is served by the
// FastAPI backend); an override can be stored in settings (localStorage).

function baseUrl() {
  try {
    return (localStorage.getItem("dfp.apiBase") || "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

function qs(params) {
  const clean = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!clean.length) return "";
  return "?" + clean.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

async function req(path, options = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      headers: options.body instanceof FormData ? {} : { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    const err = new Error("Cannot reach the API. Is the backend running?");
    err.status = 0;
    throw err;
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => req("/health"),
  system: () => req("/api/v1/system"),
  jobs: (params) => req(`/api/v1/jobs${qs(params)}`),
  job: (id) => req(`/api/v1/jobs/${encodeURIComponent(id)}`),
  status: (id) => req(`/api/v1/status/${encodeURIComponent(id)}`),
  result: (id) => req(`/api/v1/result/${encodeURIComponent(id)}`),
  benchmarks: () => req("/api/v1/benchmark"),
  benchmark: (id) => req(`/api/v1/benchmark/${encodeURIComponent(id)}`),
  runBenchmark: (rows, chunkSize, operation) =>
    req(`/api/v1/benchmark${qs({ rows, chunk_size: chunkSize, operation })}`, { method: "POST" }),
  runStudy: (sizes, chunkSize, operation) =>
    req(`/api/v1/benchmark/study${qs({ sizes, chunk_size: chunkSize, operation })}`, { method: "POST" }),
  study: (id) => req(`/api/v1/benchmark/study/${encodeURIComponent(id)}`),
  studies: (limit = 5) => req(`/api/v1/benchmark/study${qs({ limit })}`),

  upload({ file, operation, column, filterValue, chunkSize, demoFailChunks }) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("operation", operation);
    fd.append("column", column);
    if (filterValue && operation === "filter") fd.append("filter_value", filterValue);
    fd.append("chunk_size_rows", String(chunkSize));
    if (demoFailChunks) fd.append("demo_fail_chunks", String(demoFailChunks));
    return req("/api/v1/upload", { method: "POST", body: fd });
  },

  inspect(file, chunkSize) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("chunk_size_rows", String(chunkSize));
    return req("/api/v1/inspect", { method: "POST", body: fd });
  },

  demoFault({ file, operation, column, filterValue, chunkSize, failChunks }) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("operation", operation);
    fd.append("column", column);
    if (filterValue && operation === "filter") fd.append("filter_value", filterValue);
    fd.append("chunk_size_rows", String(chunkSize));
    fd.append("fail_chunks", String(failChunks));
    return req("/api/v1/demo/fault", { method: "POST", body: fd });
  },

  process: (id) => req(`/api/v1/process/${encodeURIComponent(id)}`, { method: "POST" }),
};