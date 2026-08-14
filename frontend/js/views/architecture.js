import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { SectionTitle, Panel } from "../components.js";

export async function mountArchitecture(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "SYSTEM DESIGN",
        title: "Architecture",
        sub: "How a file becomes a distributed result.",
      })}
      <div class="arch-layers">
        <div class="arch-layer">
          <div class="arch-layer-head"><span class="arch-index">01</span><h3>Client / Browser</h3></div>
          <div class="arch-layer-body">
            <p>Single-page control plane served by FastAPI (<code>/static</code>). Everything the UI renders — node counts, task progress, events, benchmark numbers — is read from live backend state. No fake metrics.</p>
            <div class="arch-cards">
              ${archCard("Wizard", "File → op → settings → dispatch")}
              ${archCard("Live execution", "Task table, event log, worker map")}
              ${archCard("Infrastructure", "Cluster + topology views")}
            </div>
          </div>
        </div>
        <div class="arch-arrow">${icon("arrowRight", 14)}</div>
        <div class="arch-layer">
          <div class="arch-layer-head"><span class="arch-index">02</span><h3>API service</h3></div>
          <div class="arch-layer-body">
            <p>FastAPI + Uvicorn. Validates and persists uploads, inspects files, then orchestrates chunk dispatch against Ray.</p>
            <div class="arch-cards">
              ${archCard("Endpoints", "/upload /process /status /result /jobs /system /benchmark /demo")}
              ${archCard("Orchestrator", "Bounded-concurrency dispatch, per-task records, event log")}
              ${archCard("Storage", "Files on disk, metadata in Redis")}
            </div>
          </div>
        </div>
        <div class="arch-arrow">${icon("arrowRight", 14)}</div>
        <div class="arch-layer">
          <div class="arch-layer-head"><span class="arch-index">03</span><h3>Ray cluster</h3></div>
          <div class="arch-layer-body">
            <p>Files are chunked client-side into independent tasks and fanned out across Ray workers for parallel Pandas processing. Each chunk returns its partial result; the aggregator merges them deterministically.</p>
            <div class="arch-cards">
              ${archCard("Chunker", "CSV / JSON → N chunks by row budget")}
              ${archCard("Workers", "Process chunk in isolation, retry-safe")}
              ${archCard("Faults", "Demo worker failures recover automatically")}
            </div>
          </div>
        </div>
        <div class="arch-arrow">${icon("arrowRight", 14)}</div>
        <div class="arch-layer">
          <div class="arch-layer-head"><span class="arch-index">04</span><h3>Redis</h3></div>
          <div class="arch-layer-body">
            <p>Single source of truth for job state: progress, per-chunk results, events, task records, job index, and benchmark history.</p>
            <div class="arch-cards">
              ${archCard("State", "progress / status / result keys")}
              ${archCard("Index", "sorted set of all jobs")}
              ${archCard("History", "benchmarks + telemetry")}
            </div>
          </div>
        </div>
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
}

function archCard(title, sub) {
  return `
  <div class="arch-card">
    <div class="arch-card-title">${title}</div>
    <div class="arch-card-sub mono xs">${sub}</div>
  </div>`;
}