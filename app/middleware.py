import time

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.utils.logger import setup_logger
from app.utils.redis_client import redis_client

logger = setup_logger(__name__)

_PUBLIC_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json"}

# The SPA is served from /static and styled with inline style attributes,
# so the CSP must allow 'unsafe-inline' for styles and the Google Fonts host.
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data:; "
    "connect-src {connect_src}; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'"
)

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "0",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply hardening headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers[name] = value
        response.headers["Content-Security-Policy"] = _CSP.format(
            connect_src=settings.csp_connect_src
        )
        if settings.allow_hsts:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        # Never let the browser keep stale UI assets: the SPA and its
        # ES-module graph are revalidated on every load.
        if request.url.path == "/" or request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
        return response


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Gate every /api/v1/* request behind X-API-Key.

    Unlike an Origin/Referer trust model, the key is ALWAYS required when
    API_KEY_SECRET is set — an Origin or Referer header is client-controlled
    and trivially spoofable, so it can never be treated as proof of origin.
    The SPA stores the key in localStorage and sends it via the same header.
    """

    async def dispatch(self, request: Request, call_next):
        if settings.api_key_secret:
            path = request.url.path
            if path not in _PUBLIC_PATHS and not path.startswith("/static"):
                key = request.headers.get("X-API-Key")
                if not key or key != settings.api_key_secret:
                    return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Fixed-window rate limit for state-changing endpoints, backed by Redis.

    Disabled by default (RATE_LIMIT_PER_MINUTE=0). When enabled, each client
    IP is limited to N requests per rolling 60-second window; excess requests
    receive 429. Bounded and safe against concurrent bursts.
    """

    _LIMITED_METHODS = {"POST"}

    async def dispatch(self, request: Request, call_next):
        limit = settings.rate_limit_per_minute
        if limit > 0 and request.method in self._LIMITED_METHODS:
            client = request.client.host if request.client else "unknown"
            window = int(time.time())
            key = f"rate:{client}:{window}"
            try:
                count = redis_client.client.incr(key)
                redis_client.client.expire(key, 60)
            except Exception:
                logger.warning("Rate limiter unavailable — allowing request")
                count = 1
            if count > limit:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded. Slow down and retry.",
                        "retry_after_s": 60 - (time.time() - window),
                    },
                )
        return await call_next(request)