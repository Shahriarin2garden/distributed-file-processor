// Central client-side store. Owns polling, deduplicates in-flight requests,
// and notifies subscribers on change. Polling is route-aware so we never poll
// what is not visible.

import { api } from "./api.js";

const DEFAULT_SETTINGS = {
  apiBase: "",
  pollSystem: 3000,
  pollJobs: 5000,
  pollJobActive: 1500,
  pollJobDone: 8000,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("dfp.settings");
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

class Store {
  constructor() {
    this.settings = loadSettings();
    this.system = null;
    this.jobs = null;
    this.activeJob = null;       // { job, tasks, events } for the current route
    this.benchmarks = null;
    this.systemError = null;
    this.subscribers = new Set();
    this.inFlight = new Set();
    this.timers = {};
    this.jobId = null;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  emit() {
    for (const fn of this.subscribers) fn();
  }

  _guard(key) {
    if (this.inFlight.has(key)) return true;
    this.inFlight.add(key);
    return false;
  }

  async refreshSystem() {
    if (this._guard("system")) return;
    try {
      this.system = await api.system();
      this.systemError = null;
      this.lastSystemAt = Date.now();
    } catch (err) {
      this.systemError = err.message;
    } finally {
      this.inFlight.delete("system");
    }
    this.emit();
  }

  async refreshJobs() {
    if (this._guard("jobs")) return;
    try {
      const res = await api.jobs({ limit: 200 });
      this.jobs = res.jobs;
    } catch {
      /* silent — overview shows unavailable state */
    } finally {
      this.inFlight.delete("jobs");
    }
    this.emit();
  }

  async refreshBenchmarks() {
    if (this._guard("benchmarks")) return;
    try {
      this.benchmarks = await api.benchmarks();
    } catch {
      /* silent */
    } finally {
      this.inFlight.delete("benchmarks");
    }
    this.emit();
  }

  async refreshJob() {
    if (!this.jobId || this._guard("job")) return;
    try {
      this.activeJob = await api.job(this.jobId);
    } catch (err) {
      this.jobError = err.message;
    } finally {
      this.inFlight.delete("job");
    }
    this.emit();
  }

  // Route-aware polling scheduler.
  setRoute(route) {
    this.stopPolling();
    const t = this.settings;

    const jobMatch = route.match(/^\/job\/([0-9a-f-]+)/);
    if (jobMatch) {
      this.jobId = jobMatch[1];
      this.activeJob = null;
      this.jobError = null;
      this.refreshJob();
      const active = () => !this.activeJob || this.activeJob.job.status === "processing";
      const iv = active() ? t.pollJobActive : t.pollJobDone;
      this.timers.job = setInterval(() => {
        if (this.activeJob && this.activeJob.job.status !== "processing") {
          // Completed/failed jobs poll less frequently.
          clearInterval(this.timers.job);
          this.timers.job = setInterval(() => this.refreshJob(), t.pollJobDone);
        }
        this.refreshJob();
      }, iv);
    }

    if (route === "/") {
      this.timers.system = setInterval(() => this.refreshSystem(), t.pollSystem);
      this.timers.jobs = setInterval(() => this.refreshJobs(), t.pollJobs);
      this.refreshSystem();
      this.refreshJobs();
    }

    if (route === "/history") {
      this.refreshJobs();
      this.timers.jobs = setInterval(() => this.refreshJobs(), t.pollJobs);
    }
    if (route === "/benchmark") {
      this.refreshBenchmarks();
      this.timers.benchmarks = setInterval(() => this.refreshBenchmarks(), t.pollJobs);
    }
    if (route === "/cluster" || route === "/architecture") {
      this.timers.system = setInterval(() => this.refreshSystem(), t.pollSystem);
      this.refreshSystem();
    }
  }

  stopPolling() {
    for (const k of Object.keys(this.timers)) {
      clearInterval(this.timers[k]);
      delete this.timers[k];
    }
    this.jobId = null;
  }

  get demoMode() {
    return !!(this.system && this.system.demo_mode);
  }
}

export const store = new Store();