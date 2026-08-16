# Deployment Guide (Production)

This documents how to run the Distributed File Processing System in production.
For local development, see `README.md` (`docker compose up --build`).

## Architecture at a glance

```
Browser (SPA)  ── HTTPS ──>  Reverse proxy (Caddy/Nginx) ──> api :8000
                                                                ├── Redis (password + AOF)
                                                                └── Ray head ──> Ray workers
```

- **api** — FastAPI; serves the SPA and `/api/v1/*`; non-root; no `--reload`; 2 uvicorn workers.
- **redis** — application job state/results; password-protected; AOF persistence on named volume `dfp-redis-data`.
- **ray-head / ray-worker** — distributed execution; internal network only.
- **storage** — named volume `dfp-storage` (uploaded files + chunks).

## 1. Prerequisites

- Docker Engine 24+ with Docker Compose v2.
- A domain (recommended) or a public IP.
- HTTPS termination (recommended; instructions for Caddy included below).

## 2. Configure the environment

```bash
cp .env.production.example .env.production
```

Fill in every value — the compose file refuses to start if these are missing:

| Variable | Why it is required |
|---|---|
| `API_KEY_SECRET` | Gates every `/api/v1/*` request (sent as `X-API-Key`). |
| `REDIS_PASSWORD` | Locks Redis to the API only (port not exposed to host). |
| `ALLOWED_ORIGINS` | Browser CORS allow-list (your app domain(s)). |

Generate secrets:

```bash
openssl rand -hex 32   # -> API_KEY_SECRET
openssl rand -hex 16   # -> REDIS_PASSWORD
```

The SPA reads the API key from `localStorage["dfp.settings"]` (`{"apiBase": ...}`).
A reverse proxy may inject `X-API-Key` instead.

## 3. Start the production stack

```bash
make prod-up
# or: docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check status and health:

```bash
make prod-ps
curl http://localhost:8000/health
```

Expected `/health`:

```json
{"status": "healthy", "ray_initialized": true, "redis_connected": true, "demo_mode": false}
```

## 4. Reverse proxy + TLS (recommended)

Only the **api** service publishes a host port (`API_PORT`, default 8000). Put a
proxy in front of it and set `ALLOWED_ORIGINS` to the proxied domain.

Caddy example (`Caddyfile`):

```
app.example.com {
    reverse_proxy 127.0.0.1:8000
    request_header X-API-Key {env.API_KEY_SECRET}
}
```

The API key gate lives behind the proxy: requests reaching the app without a
valid `X-API-Key` get `401`. To make the SPA work without a proxy-injected
header, set it client-side:

```js
localStorage.setItem("dfp.settings", JSON.stringify({ apiBase: "https://app.example.com" }));
```

## 5. Scaling

### Always Free (Oracle Ampere A1: 2 OCPU / 12 GB)

The production compose ships pre-tuned for the Always Free instance — the
head schedules only (`RAY_HEAD_CPUS=0`) plus 2 workers × 1 CPU, using about
10.5 GB of the 12 GB:

```bash
RAY_HEAD_CPUS=0
RAY_WORKER_CPUS=1
RAY_WORKER_REPLICAS=2
MAX_CONCURRENT_TASKS=4
```

### Larger machines

Adjust in `.env.production`:

```bash
RAY_HEAD_CPUS=2
RAY_WORKER_CPUS=2
RAY_WORKER_REPLICAS=4    # scale compute
MAX_CONCURRENT_TASKS=16  # max parallel Ray tasks
```

Then `make prod-up` again to apply (Ray workers re-join automatically).

## 6. Backups

- Redis AOF data lives in the named volume `dfp-redis-data` (persists across
  `docker compose down`; removed only by `docker compose down -v`).
- Uploaded files/chunks live in `dfp-storage`.
- To back up:

```bash
docker run --rm -v dfp-redis-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/redis-data.tgz -C /data .
docker run --rm -v dfp-storage:/storage -v "$PWD":/backup alpine \
  tar czf /backup/storage.tgz -C /storage .
```

## 7. Updates

```bash
git pull
make prod-up            # rebuilds images, restarts changed services only
```

## 8. Security checklist

- [ ] `DEMO_MODE` is false (hard-coded false in the production compose).
- [ ] `ALLOWED_ORIGINS` is your real domain, not `*`.
- [ ] `API_KEY_SECRET` is a strong random value; API returns 401 without it.
- [ ] `REDIS_PASSWORD` set; Redis not exposed on host (`docker compose ... ports` lists only api).
- [ ] API runs as non-root (`USER app` in Dockerfile), no `--reload`.
- [ ] Firewall blocks 8265/10001/6379/6380 externally; only the proxy port is open.
- [ ] `.env.production` is in `.gitignore` and never committed.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `REDIS_PASSWORD must be set` | Fill `.env.production`; run `make prod-up`. |
| `/health` shows `redis_connected: false` | `docker compose ... logs redis`; password mismatch. |
| `ray_initialized: false` | Wait for head healthy: `make prod-logs`. |
| API returns 401 | `X-API-Key` header missing/wrong; check `API_KEY_SECRET`. |
| Jobs stuck queued | Check worker count vs `MAX_CONCURRENT_TASKS`; `make prod-logs`. |