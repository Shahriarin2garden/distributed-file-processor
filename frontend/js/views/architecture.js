// Architecture — mirrors the Obsidian Flux "System Architecture" screen:
// schematic panel with a live pipeline graph over a dot-grid backdrop,
// numbered execution-pipeline data flow, a System Nodes sidebar, a
// technology stack, quick actions, and the engineering decisions.

import { h, clear, on } from "../dom.js";
import { icon } from "../icons.js";
import { Panel } from "../components.js";
import { archSchematic } from "../schematic.js";
import { store } from "../store.js";
import { timeAgo } from "../format.js";

const COMPONENTS = [
  {
    id: "client",
    code: "01",
    color: "teal",
    name: "Client Layer",
    role: "Control plane",
    purpose: "The entry point. A vanilla SPA served by FastAPI at / that renders live backend state — node counts, task progress, events, and benchmark numbers. No metrics are fabricated in the client.",
    responsibility: "Wizard (file → operation → settings → review), live execution views, cluster and history exploration.",
    implementation: "frontend/ — ES modules, hash router, route-aware polling store. Served via FastAPI /static.",
    failure: "Read-only: if the API is down the UI shows 'backend unreachable' rather than stale numbers.",
    module: "frontend/js/views/*",
  },
  {
    id: "api",
    code: "02",
    color: "magenta",
    name: "FastAPI Gateway",
    role: "Ingest + control",
    purpose: "Validates and persists uploads, inspects files, and fans work out to Ray. The only entry point for clients.",
    responsibility: "Multipart upload handling, content-type / size validation, job indexing, API-key gate, CORS.",
    implementation: "app/api/v1/endpoints/upload.py — shared _create_job() used by upload and demo paths.",
    failure: "Stateless; job state lives in Redis, so an API restart does not lose running or finished jobs.",
    module: "app/api/v1/endpoints/upload.py",
  },
  {
    id: "orchestrator",
    code: "03",
    color: "teal-bright",
    name: "Orchestrator",
    role: "Dispatch loop",
    purpose: "Runs each job as a bounded-concurrency loop: chunk, dispatch, collect via ray.wait(), aggregate, persist.",
    responsibility: "Task records, event log, per-task timeouts, retry/recovery on the demo path, progress updates.",
    implementation: "app/services/orchestrator.py — MAX_CONCURRENT_TASKS window over ray.wait()",
    failure: "If the orchestrator crashes mid-job, the job is marked failed with a sanitized error; chunks are cleaned up.",
    module: "app/services/orchestrator.py",
  },
  {
    id: "chunker",
    code: "04",
    color: "black",
    name: "Chunker",
    role: "Parallelize",
    purpose: "Turns one large file into N independent, row-bounded CSV chunks — the unit of parallel work.",
    responsibility: "Streaming CSV reads (no full-file load), JSON array / JSON Lines normalisation, single-pass inspection.",
    implementation: "app/services/chunker.py — pd.read_csv(chunksize=…), latin-1 fallback.",
    failure: "A malformed row is isolated to its chunk; an empty file produces zero chunks and fails fast.",
    module: "app/services/chunker.py",
  },
  {
    id: "ray",
    code: "05",
    color: "teal",
    name: "Ray Runtime",
    role: "Distributed runtime",
    purpose: "Schedules remote tasks across the worker fleet and hosts the ResultAggregator actor.",
    responsibility: "Task placement, object store, actor lifecycle, retries (max_retries=2 on process_chunk).",
    implementation: "rayproject/ray:2.9.2 — head + N workers sharing the app codebase via /opt/dfp mount.",
    failure: "Ray retries a task before the orchestrator sees a failure; unreachable workers surface as task timeouts.",
    module: "app/services/ray_tasks.py",
  },
  {
    id: "workers",
    code: "06",
    color: "magenta",
    name: "Compute Cluster",
    role: "Compute",
    purpose: "Each worker runs process_chunk() on its assigned chunk and returns a partial result. Tasks carry no app-internal imports, so they pickle cleanly across the cluster.",
    responsibility: "Chunk → (value, count) partial for sum / mean / filter; attach the executing node id.",
    implementation: "app/services/ray_tasks.py — process_chunk / process_chunk_tracked",
    failure: "A crashed worker drops the task; Ray re-schedules it, and the retry appears in the job's event log.",
    module: "app/services/ray_tasks.py",
  },
  {
    id: "aggregator",
    code: "07",
    color: "teal-bright",
    name: "Result Aggregator",
    role: "Merge results",
    purpose: "A stateful Ray actor that collects partials and computes the deterministic final value.",
    responsibility: "Sum of values; weighted mean via (sum, count) pairs to avoid chunk-size bias.",
    implementation: "app/services/ray_actor.py — @ray.remote class ResultAggregator",
    failure: "Pure accumulation — if a partial is missing the job fails rather than returning a wrong number.",
    module: "app/services/ray_actor.py",
  },
  {
    id: "redis",
    code: "08",
    color: "black",
    name: "State Storage",
    role: "Source of truth",
    purpose: "Single source of truth for job state: metadata, progress, results, tasks, events, job index, benchmarks.",
    responsibility: "Atomic progress (WATCH/MULTI/EXEC), capped event log, 24 h job TTL.",
    implementation: "app/utils/redis_client.py — redis-py pipelines",
    failure: "Writes are atomic per key; a Redis outage surfaces as degraded telemetry, not corrupt state.",
    module: "app/utils/redis_client.py",
  },
  {
    id: "storage",
    code: "09",
    color: "teal",
    name: "Storage",
    role: "Filesystem / S3",
    purpose: "Holds raw uploads and generated chunks under UUID paths (no user path traversal) with an S3 interface ready.",
    responsibility: "save/read raw files, per-job chunk directories, chunk cleanup after completion.",
    implementation: "app/services/storage.py — storage_type local|s3",
    failure: "Chunks must be readable by every worker — this is why chunks live on the shared storage volume.",
    module: "app/services/storage.py",
  },
];

const PIPELINE = [
  ["01. INGESTION", "teal", "The client SPA sends the file payload and metadata to the FastAPI gateway. The payload is validated and temporarily staged."],
  ["02. ORCHESTRATION & CHUNKING", "magenta", "The orchestrator receives the job; the chunker splits the file into row-bounded CSV chunks. Metadata is synced to Redis."],
  ["03. DISTRIBUTED COMPUTATION", "teal-bright", "Ray tasks schedule chunk processing across the worker cluster. Nodes execute the Pandas operation in parallel and return partial results."],
  ["04. AGGREGATION & DELIVERY", "black", "The ResultAggregator actor compiles partials, verifies integrity, and persists the deterministic result back to Redis."],
];

const DECISIONS = [
  ["Why Ray?", "Ray gives remote functions with built-in retries and a stateful actor model (ResultAggregator) without us owning the scheduler. For N chunks we get N independent tasks plus an actor to merge partials deterministically."],
  ["Why ray.wait()?", "ray.get() on a list blocks until every task finishes. ray.wait() returns completed futures as they land, so the orchestrator can update progress and forward partials the instant each chunk finishes — a non-blocking fan-in."],
  ["Why bounded concurrency?", "Dispatching all chunks at once can swamp a small cluster. A MAX_CONCURRENT_TASKS window over ray.wait() keeps the fleet saturated without oversubscribing CPU."],
  ["Why weighted mean?", "Chunks can be unequal in size (last chunk, odd row counts). A plain average of per-chunk means biases the result toward small chunks; returning (sum, count) per chunk and combining totals is exact."],
  ["Why an actor for aggregation?", "Accumulating in the orchestrator process would add per-chunk network round-trips. A Ray actor stores state on the cluster and returns one final value."],
  ["Why Redis?", "Redis already serves as fast, atomic, TTL-aware state. WATCH/MULTI/EXEC prevents progress races when tasks complete concurrently."],
  ["Why retries at the Ray layer?", "process_chunk carries max_retries=2, so transient worker failures are absorbed by Ray before the job is affected. The demo path uses max_retries=0 so the orchestrator can observe and retry — changing failure semantics is a deliberate tradeoff."],
  ["Why shared storage for chunks?", "Workers are separate containers; each must read its chunk file. Mounting ./app + ./storage into every Ray node (PYTHONPATH=/opt/dfp) makes both the code and the data visible cluster-wide."],
  ["Why local fallback?", "When RAY_ADDRESS is unreachable, the API starts Ray in-process so the product and tests still work on a single machine — at the cost of losing multi-node parallelism."],
];

const TRADEOFFS = [
  ["Distributed ≠ automatically faster", "Orchestration, serialization, and scheduling add fixed overhead. On small workloads the benchmark shows distributed running slower than sequential — this is expected, and the UI says so."],
  ["Coordination overhead dominates small workloads", "The fixed cost of dispatch dominates when each chunk takes microseconds. Parallelism only pays off once per-chunk work dwarfs that overhead."],
  ["Workers require shared access to input chunks", "Every worker container must read the chunk files. Without shared storage the tasks fail with FileNotFoundError — the compose setup mounts the storage volume into all Ray nodes."],
  ["Bounded concurrency protects the cluster", "Unbounded dispatch oversubscribes CPUs and memory. A concurrency window trades peak throughput for stability."],
  ["Weighted aggregation matters for uneven chunk sizes", "A naive average of chunk means produces a biased result when the final chunk is smaller than the rest."],
  ["Atomic Redis updates prevent progress races", "Concurrent task completions could overwrite progress. Optimistic locking (WATCH/MULTI/EXEC) makes the last-writer-wins race safe."],
  ["Retrying at the Ray task layer changes failure semantics", "Ray's max_retries=2 hides transient failures from the orchestrator (good for reliability, opaque for observability). The demo path disables it so failures become visible events — and then orchestrates its own retry."],
];

const STACK = ["FastAPI", "Ray.io", "Redis", "Pandas", "Docker", "Python"];

function systemStatus(sys) {
  if (!sys) return { label: "CONNECTING", tone: "neutral" };
  const nodesUp = (sys.nodes?.length ?? 0) > 0;
  if (sys.redis_connected && sys.ray_initialized && nodesUp) return { label: "STABLE", tone: "ok" };
  if (sys.redis_connected && sys.ray_initialized) return { label: "DEGRADED", tone: "warn" };
  return { label: "DOWN", tone: "bad" };
}

export async function mountArchitecture(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      <!-- Page header -->
      <header class="arch-header">
        <div>
          <div class="kicker">System design</div>
          <h1 class="arch-title">System Architecture</h1>
          <p class="arch-sub mono">High-level schematic of the Distributed File Processing System. Component interaction from client ingestion to worker-node execution and aggregation.</p>
        </div>
        <div class="arch-header-right">
          <div class="arch-status" id="arch-status">STATUS: —</div>
          <div class="mono xs dim" id="arch-synced">LAST SYNCED: —</div>
        </div>
      </header>

      <div class="grid-12">
        <div class="col-8 flex flex-col gap-lg">
          <!-- Schematic panel -->
          <section class="arch-schematic">
            <div class="arch-bar">
              <span class="arch-bar-title">ARCHITECTURE_SCHEMATIC_v2.DRW</span>
              <span class="arch-lights" aria-hidden="true"><span class="light red"></span><span class="light teal"></span><span class="light magenta"></span></span>
            </div>
            <div class="arch-canvas">
              <div id="arch-flow" class="arch-flow"></div>
            </div>
          </section>

          <!-- Execution pipeline: data flow -->
          <section class="panel panel-strong">
            <div class="panel-head"><h2 class="panel-title">${icon("gitBranch", 13)} Execution Pipeline: Data Flow</h2></div>
            <div class="panel-body">
              <ol class="pipe-list">
                ${PIPELINE.map(([label, tone, body]) => `
                  <li>
                    <span class="pipe-bullet tone-${tone}" aria-hidden="true"></span>
                    <div>
                      <div class="pipe-title">${label}</div>
                      <p class="pipe-body">${body}</p>
                    </div>
                  </li>`).join("")}
              </ol>
            </div>
          </section>
        </div>

        <div class="col-4 flex flex-col gap-lg">
          <!-- System nodes -->
          <section class="arch-side-panel">
            <div class="arch-side-head">${icon("network", 13)} System Nodes</div>
            <div class="arch-nodes" id="arch-nodes">
              ${COMPONENTS.map((c) => `
                <button type="button" class="arch-node-row${c.id === "client" ? " active" : ""}" data-arch="${c.id}">
                  <span class="arch-node-title color-${c.color}">[${c.code}] ${c.name.toUpperCase()}</span>
                  <span class="arch-node-arrow" aria-hidden="true">${icon("arrowRight", 12)}</span>
                </button>`).join("")}
            </div>
          </section>

          <!-- Tech stack -->
          <section class="arch-side-panel">
            <div class="arch-side-head">${icon("terminal", 13)} Technology Stack</div>
            <div class="arch-chips">
              ${STACK.map((t) => `<span class="arch-chip">${t}</span>`).join("")}
            </div>
          </section>

          <!-- Quick actions -->
          <div class="arch-actions">
            <a class="btn btn-primary btn-block" href="#/new">${icon("play", 14)} Run a job</a>
            <a class="btn btn-ghost btn-block" href="/docs" target="_blank" rel="noopener">${icon("external", 14)} View API docs</a>
          </div>
        </div>
      </div>

      <!-- Component detail + decisions -->
      <div class="grid-2">
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">${icon("info", 13)} Component detail</h2></div>
          <div class="panel-body" id="arch-detail"></div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">${icon("gitBranch", 13)} Key engineering decisions</h2></div>
          <div class="panel-body">
            <div class="qa-list">${DECISIONS.map(([q, a]) => `<details class="qa"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>
          </div>
        </section>
      </div>

      <div class="grid-2">
        ${Panel({
          title: "Engineering tradeoffs",
          iconName: "alertTriangle",
          body: `<div class="qa-list">${TRADEOFFS.map(([q, a]) => `<details class="qa"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`,
        })}
        ${Panel({
          title: "Design invariants",
          iconName: "shield",
          body: `
            <ul class="invariant-list">
              <li>Every number the UI shows is computed from live API data — no sample/placeholder metrics.</li>
              <li>Worker tasks stay free of app-internal imports (Ray remote functions are self-contained).</li>
              <li>Errors surfaced to users are sanitized; full details stay in server logs.</li>
              <li>Reduced-motion users get a static pipeline graph; color is never the only signal.</li>
            </ul>`,
        })}
      </div>
    </div>
  `));

  const flowEl = root.querySelector("#arch-flow");
  const nodesEl = root.querySelector("#arch-nodes");
  const detailEl = root.querySelector("#arch-detail");
  const statusEl = root.querySelector("#arch-status");
  const syncedEl = root.querySelector("#arch-synced");

  const renderLive = () => {
    const sys = store.system;
    const st = systemStatus(sys);
    statusEl.className = `arch-status tone-${st.tone}`;
    statusEl.textContent = `STATUS: ${st.label}`;
    const workers = sys?.nodes?.length ?? 3;
    syncedEl.textContent = store.lastSystemAt
      ? `LAST SYNCED: ${timeAgo(new Date(store.lastSystemAt).toISOString())}`
      : "LAST SYNCED: —";
    flowEl.innerHTML = `<div class="sc-canvas">${archSchematic({
      workers,
      rayUp: !!(sys?.ray_initialized),
    })}</div>`;
  };

  const renderDetail = (id) => {
    const c = COMPONENTS.find((x) => x.id === id) || COMPONENTS[0];
    detailEl.replaceChildren(h(`
      <div class="arch-detail">
        <div class="arch-detail-head">
          <span class="arch-index color-${c.color}">${icon("box", 13)}</span>
          <h3>${c.name}</h3>
        </div>
        ${kv("Purpose", c.purpose)}
        ${kv("Responsibility", c.responsibility)}
        ${kv("Implementation", c.implementation)}
        ${kv("Failure behavior", c.failure)}
        ${kv("Source", c.module)}
      </div>
    `));
  };

  on(root, "[data-arch]", "click", (btn) => {
    root.querySelectorAll("[data-arch]").forEach((b) => b.classList.toggle("active", b === btn));
    renderDetail(btn.dataset.arch);
  });

  const off = store.subscribe(renderLive);
  renderLive();
  renderDetail(COMPONENTS[0].id);
  return off;
}

function kv(k, v) {
  return `<div class="arch-kv"><dt>${k}</dt><dd>${v}</dd></div>`;
}