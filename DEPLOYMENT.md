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

### Free option: stable URL with a Student Pack domain + Cloudflare (no card, no VPS)

The cheapest real deployment — a stable `https://dfp.<yourname>.<tld>` URL with
free SSL, using only free credits from the **GitHub Student Developer Pack**
and a free **Cloudflare** account (no credit card anywhere):

1. **Get a free domain** for 1 year from your Student Pack:
   - Name.com → https://www.name.com/github-students (`.dev`, `.app`, `.live`, …)
   - or Namecheap → https://nc.me/landing/github (`.me` + free SSL)
2. **Add it to Cloudflare** (free plan, no card): sign up at
   https://dash.cloudflare.com, add the zone, and point your nameservers at
   Cloudflare as instructed.
3. **Log in to cloudflared** (opens a browser, one time):
   ```bash
   ~/.local/bin/cloudflared tunnel login
   ```
4. **Create the named tunnel + DNS route**:
   ```bash
   ./scripts/setup_named_tunnel.sh dfp yourname dev   # -> https://dfp.yourname.dev
   ```
5. **Make it survive reboots** (WSL2 with systemd):
   ```bash
   sudo ./scripts/install_tunnel_service.sh
   ```

The stack runs on your machine (must stay powered), Cloudflare terminates TLS
at the edge, and the tunnel carries traffic to `localhost:8100`.

> **Tradeoff:** this is free but not *cloud* hosting — the machine must stay
> on. For a true always-on server you still need a VPS (card/credits required).

### Free option: Azure for Students (via GitHub Student Developer Pack)

No server yet? If you have the **GitHub Student Developer Pack**, you can get
**Azure for Students** — $100 of credit plus free access to 25+ Azure services,
**no credit card required** (18+). The stack is pre-tuned for a **B2ms**
(2 vCPU / 8 GB) VM — see §5.

Provisioning steps:

1. Redeem your benefit at <https://education.github.com/pack> (Azure section) to
   get an activation code. Then sign up at
   `https://signup.azure.com/studentverification?offerType=1`, sign in with
   GitHub, and paste the code. (Use that link — the regular Azure "Start free"
   page always asks for a card.)
2. In the Azure portal go to **Virtual machines → Create → Azure virtual machine**.
3. Image: **Ubuntu 24.04 LTS** (Canonical), size: **Standard_B2ms** (2 vCPU / 8 GB).
4. Create or reuse a resource group; generate an SSH key pair (or upload one).
   Add inbound rules for **TCP 22 (SSH)** and **TCP 80/443** in the NSG.
5. Once the VM is *Running*, SSH in:

```bash
ssh azureuser@<PUBLIC_IP> -i ~/.ssh/id_ed25519
```

6. Run the one-shot bootstrap:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/Shahriarin2garden/distributed-file-processor/main/scripts/deploy_vps.sh)"
```

The script installs Docker, clones the repo, generates `.env.production` with
random secrets, and starts the stack. (Or clone manually and run the script
from the repo.) The whole pull is ~4 GB, so give it a few minutes.

> **Budget note:** a B2ms running 24/7 costs roughly $60/month, so the $100
> credit lasts ~1.7 months. Stop/deallocate the VM when you are not using it to
> stretch the credit, or downsize to a **B2s** (4 GB, ~$30/mo) and reduce
> `RAY_WORKER_REPLICAS=1` to fit.

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

### Azure B2ms (2 vCPU / 8 GB) — default tuning

The production compose ships pre-tuned for an Azure B2ms student VM — the head
schedules only (`RAY_HEAD_CPUS=0`) plus 2 workers × 1 CPU, about 7.75 GB of
the 8 GB:

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