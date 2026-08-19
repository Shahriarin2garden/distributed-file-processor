# ── Build stage: compile/install dependencies ────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /wheels

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# ── Runtime stage: minimal, non-root ─────────────────────────────────────
FROM python:3.11-slim AS runtime

# Tini gives the app a proper PID 1 (handles SIGTERM -> graceful shutdown)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl \
    && rm -rf /wheels

COPY app/      ./app/
COPY frontend/ ./frontend/

RUN mkdir -p /storage \
    && chown -R app:app /app /storage

USER app

ENV PYTHONUNBUFFERED=1 \
    STORAGE_PATH=/storage

# Production default: no --reload, 2 workers. Override via CMD for dev.
EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]