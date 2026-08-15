import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

import ray
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.config import settings
from app.utils.logger import setup_logger
from app.utils.redis_client import redis_client

_FRONTEND = Path(__file__).parent.parent / "frontend"

logger = setup_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Distributed File Processing System")
    if not ray.is_initialized():
        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                ray.init(address=settings.ray_address, ignore_reinit_error=True)
                logger.info(f"Ray initialized: {settings.ray_address} (attempt {attempt})")
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                logger.warning(f"Ray connect attempt {attempt} failed: {exc}")
                if attempt < 3:
                    await asyncio.sleep(15)
        if last_exc is not None:
            logger.warning("All Ray connect attempts failed — starting in local mode")
            # Remove RAY_ADDRESS so ray.init() starts a new local cluster
            os.environ.pop("RAY_ADDRESS", None)
            ray.init(ignore_reinit_error=True)
    yield
    logger.info("Shutting down Distributed File Processing System")
    if ray.is_initialized():
        ray.shutdown()


app = FastAPI(
    title="Distributed File Processing System",
    description="Ray-powered distributed CSV/JSON processing with FastAPI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — restrict in production via ALLOWED_ORIGINS env var
_origins = [o.strip() for o in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    """Optional API key gate. Disabled when API_KEY_SECRET is unset."""
    if settings.api_key_secret:
        public_paths = {"/health", "/docs", "/openapi.json", "/redoc", "/"}
        if request.url.path not in public_paths and not request.url.path.startswith("/static"):
            key = request.headers.get("X-API-Key")
            if not key or key != settings.api_key_secret:
                return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    response = await call_next(request)
    # Never let the browser keep stale UI assets: the SPA and its ES-module
    # graph are revalidated on every load so diagram redesigns show up
    # immediately after a container rebuild.
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


app.include_router(api_router, prefix="/api/v1")

# Serve the frontend SPA
if _FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=str(_FRONTEND)), name="frontend")

    @app.get("/", include_in_schema=False)
    async def serve_ui():
        return FileResponse(str(_FRONTEND / "index.html"))


@app.get("/health", tags=["health"])
async def health_check():
    redis_ok = False
    try:
        redis_ok = redis_client.client.ping()
    except Exception:
        pass
    return {
        "status": "healthy",
        "ray_initialized": ray.is_initialized(),
        "redis_connected": redis_ok,
        "version": "1.0.0",
        "demo_mode": settings.demo_mode,
    }
