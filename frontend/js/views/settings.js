import { store } from "../store.js";
import { api } from "../api.js";
import { h, clear } from "../dom.js";
import { icon } from "../icons.js";
import { SectionTitle, Panel } from "../components.js";

export async function mountSettings(root) {
  clear(root);
  root.appendChild(h(`
    <div class="page">
      ${SectionTitle({
        kicker: "CONFIGURATION",
        title: "Settings",
        sub: "Client-side preferences persisted in localStorage.",
      })}
      <div class="panel">
        <div class="panel-body settings-body">
          <div class="form-row">
            <label class="field">
              <span class="field-label">API base URL</span>
              <input class="input mono" id="st-api" placeholder="(same origin)" />
              <span class="field-hint">Leave empty to use the origin serving this UI. Set a full URL to point at a remote backend.</span>
            </label>
          </div>
          <div class="form-row">
            <label class="field">
              <span class="field-label">Overview poll interval</span>
              <select class="input" id="st-poll-system">
                <option value="1000">1 s</option>
                <option value="3000" selected>3 s</option>
                <option value="10000">10 s</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">History poll interval</span>
              <select class="input" id="st-poll-jobs">
                <option value="3000">3 s</option>
                <option value="5000" selected>5 s</option>
                <option value="15000">15 s</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">Active job poll interval</span>
              <select class="input" id="st-poll-job">
                <option value="800">0.8 s</option>
                <option value="1500" selected>1.5 s</option>
                <option value="5000">5 s</option>
              </select>
            </label>
          </div>
          <div class="settings-actions">
            <button class="btn btn-primary" id="st-save">Save</button>
            <button class="btn btn-ghost" id="st-reset">Reset</button>
            <span class="mono xs dim" id="st-status"></span>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-body settings-body">
          <div class="settings-meta">
            <div class="form-row">
              <label class="field">
                <span class="field-label">Server health</span>
                <div class="mono xs" id="st-health">checking…</div>
              </label>
            </div>
            <div class="form-row">
              <label class="field">
                <span class="field-label">Demo mode</span>
                <div class="mono xs" id="st-demo">…</div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  `));

  const s = store.settings;
  root.querySelector("#st-api").value = s.apiBase || "";
  root.querySelector("#st-poll-system").value = String(s.pollSystem);
  root.querySelector("#st-poll-jobs").value = String(s.pollJobs);
  root.querySelector("#st-poll-job").value = String(s.pollJobActive);

  const statusEl = root.querySelector("#st-status");
  root.querySelector("#st-save").addEventListener("click", () => {
    store.settings.apiBase = root.querySelector("#st-api").value.trim();
    store.settings.pollSystem = parseInt(root.querySelector("#st-poll-system").value, 10);
    store.settings.pollJobs = parseInt(root.querySelector("#st-poll-jobs").value, 10);
    store.settings.pollJobActive = parseInt(root.querySelector("#st-poll-job").value, 10);
    try {
      localStorage.setItem("dfp.settings", JSON.stringify(store.settings));
      statusEl.textContent = "saved ✓";
    } catch {
      statusEl.textContent = "could not save";
    }
    location.reload();
  });

  root.querySelector("#st-reset").addEventListener("click", () => {
    localStorage.removeItem("dfp.settings");
    location.reload();
  });

  api.health()
    .then((h) => {
      root.querySelector("#st-health").textContent = `${h.version} · ray ${h.ray_initialized ? "up" : "down"} · redis ${h.redis_connected ? "up" : "down"}`;
      root.querySelector("#st-demo").textContent = h.demo_mode ? "enabled — fault injection available" : "disabled";
    })
    .catch(() => {
      root.querySelector("#st-health").textContent = "unreachable";
    });
}