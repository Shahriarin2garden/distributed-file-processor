import { h, clear, on } from "../dom.js";
import { icon } from "../icons.js";
import { SectionTitle, Panel } from "../components.js";
import { renderGraph } from "../execgraph.js";

const COMPONENTS = [
  {
    id: "client",
    name: "Client / Browser",
    role: "Control plane",
    purpose: "The entry point. A vanilla SPA served by FastAPI at / that renders live backend state — node counts, task progress, events, and benchmark numbers. No metrics are fabricated in the client.",
    responsibility: "Wizard (file → operation → settings → review), live execution views, cluster and history exploration.",
    implementation: "frontend/ — ES modules, hash router, route-aware polling store. Served via FastAPI /static.",
    failure: "Read-only: if the API is down the UI shows 'backend unreachable' rather than stale numbers.",
    module: "frontend/js/views/*",
  },
  {
    id: "api",
    name: "FastAPI",
    role: "Ingest + control",
    purpose: "Validates and persists uploads, inspects files, and fans work out to Ray. The only entry point for clients.",
    responsibility: "Multipart upload handling, content-type / size validation, job indexing, API-key gate, CORS.",
    implementation: "app/api/v1/endpoints/upload.py — shared _create_job() used by upload and demo paths.",
    failure: "Stateless; job state lives in Redis, so an API restart does not lose running or finished jobs.",
    module: "app/api/v1/endpoints/upload.py",
  },
  {
    id: "orchestrator",
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
    name: "Ray",
    role: "Distributed runtime",
    purpose: "Schedules remote tasks across the worker fleet and hosts the ResultAggregator actor.",
    responsibility: "Task placement, object store, actor lifecycle, retries (max_retries=2 on process_chunk).",
    implementation: "rayproject/ray:2.9.2 — head + N workers sharing the app codebase via /opt/dfp mount.",
    failure: "Ray retries a task before the orchestrator sees a failure; unreachable workers surface as task timeouts.",
    module: "app/services/ray_tasks.py",
  },
  {
    id: "workers",
    name: "Ray workers",
    role: "Compute",
    purpose: "Each worker runs process_chunk() on its assigned chunk and returns a partial result. Tasks carry no app-internal imports, so they pickle cleanly across the cluster.",
    responsibility: "Chunk → (value, count) partial for sum / mean / filter; attach the executing node id.",
    implementation: "app/services/ray_tasks.py — process_chunk / process_chunk_tracked",
    failure: "A crashed worker drops the task; Ray re-schedules it, and the retry appears in the job's event log.",
    module: "app/services/ray_tasks.py",
  },
  {
    id: "aggregator",
    name: "Aggregator",
    role: "Merge results",
    purpose: "A stateful Ray actor that collects partials and computes the deterministic final value.",
    responsibility: "Sum of values; weighted mean via (sum, count) pairs to avoid chunk-size bias.",
    implementation: "app/services/ray_actor.py — @ray.remote class ResultAggregator",
    failure: "Pure accumulation — if a partial is missing the job fails rather than returning a wrong number.",
    module: "app/services/ray_actor.py",
  },
  {
    id: "redis",
    name: "Redis",
    role: "Source of truth",
    purpose: "Single source of truth for job state: metadata, progress, results, tasks, events, job index, benchmarks.",
    responsibility: "Atomic progress (WATCH/MULTI/EXEC), capped event log, 24 h job TTL.",
    implementation: "app/utils/redis_client.py — redis-py pipelines",
    failure: "Writes are atomic per key; a Redis outage surfaces as degraded telemetry, not corrupt state.",
    module: "app/utils/redis_client.py",
  },
  {
    id: "storage",
    name: "Storage",
    role: "Filesystem / S3",
    purpose: "Holds raw uploads and generated chunks under UUID paths (no user path traversal) with an S3 interface ready.",
    responsibility: "save/read raw files, per-job chunk directories, chunk cleanup after completion.",
    implementation: "app/services/storage.py — storage_type local|s3",
    failure: "Chunks must be readable by every worker — this is why chunks live on the shared storage volume.",
    module: "app/services/storage.py",
  },
];

const FLOW = [
  ["client", "api"], ["api", "orchestrator"], ["orchestrator", "chunker"],
  ["chunker", "ray"], ["ray", "workers"], ["workers", "aggregator"],
  ["aggregator", "redis"],
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

export async function mountArchitecture(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "SYSTEM DESIGN",
        title: "Architecture",
        sub: "How a file becomes a distributed result — click a component for its role and failure behavior.",
      })}
      <div class="panel">
        <div class="panel-body">
          <div id="arch-flow"></div>
          <div class="arch-flow-note mono xs dim">live pipeline topology · motion reflects job activity</div>
        </div>
      </div>
      <div class="grid-2 arch-explore">
        <div class="panel">
          <div class="panel-head"><h2 class="panel-title">${icon("network", 13)} Components</h2></div>
          <div class="panel-body">
            <div class="arch-components" id="arch-components"></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h2 class="panel-title">${icon("info", 13)} Component detail</h2></div>
          <div class="panel-body" id="arch-detail"></div>
        </div>
      </div>
      <div class="grid-2">
        ${Panel({
          title: "Key engineering decisions",
          iconName: "gitBranch",
          body: `<div class="qa-list">${DECISIONS.map(([q, a]) => `<details class="qa"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`,
        })}
        ${Panel({
          title: "Engineering tradeoffs",
          iconName: "alertTriangle",
          body: `<div class="qa-list">${TRADEOFFS.map(([q, a]) => `<details class="qa"><summary>${q}</summary><p>${a}</p></details>`).join("")}</div>`,
        })}
      </div>
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
  `));

  const flowEl = root.querySelector("#arch-flow");
  const compEl = root.querySelector("#arch-components");
  const detailEl = root.querySelector("#arch-detail");

  flowEl.innerHTML = renderGraph({ width: 700, height: 250, workers: 3 });

  compEl.appendChild(h(`
    <div class="arch-components">
      ${COMPONENTS.map((c, i) => `
        <button type="button" class="arch-node${i === 0 ? " active" : ""}" data-arch="${c.id}">
          <span class="arch-node-name">${c.name}</span>
          <span class="arch-node-role mono xs">${c.role}</span>
        </button>`).join("")}
    </div>
  `));

  const renderDetail = (id) => {
    const c = COMPONENTS.find((x) => x.id === id) || COMPONENTS[0];
    detailEl.replaceChildren(h(`
      <div class="arch-detail">
        <div class="arch-detail-head"><span class="arch-index">${icon("box", 13)}</span><h3>${c.name}</h3></div>
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

  renderDetail(COMPONENTS[0].id);
}

function kv(k, v) {
  return `<div class="arch-kv"><dt>${k}</dt><dd>${v}</dd></div>`;
}