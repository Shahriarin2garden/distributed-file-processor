from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    # Optional Redis password. When set, it is merged into the connection URL
    # so nothing (password) is logged or passed around separately.
    redis_password: Optional[str] = None
    ray_address: str = "ray://localhost:10001"
    storage_type: str = "local"

    # AWS / S3 (never commit real values)
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    s3_bucket_name: Optional[str] = None
    s3_region: str = "us-east-1"

    chunk_size_rows: int = 50000
    max_concurrent_tasks: int = 8
    storage_path: str = "./storage"

    # Security
    allowed_origins: str = "*"          # comma-separated list or "*"
    api_key_secret: Optional[str] = None  # if set, X-API-Key header required
    max_file_size_mb: int = 500          # reject uploads larger than this

    # Fault-injection demo (dev/demo environments only). When enabled, the
    # /api/v1/upload endpoint accepts demo_fail_chunks to simulate worker
    # failures so the fault-tolerance path can be observed. Disabled by default.
    demo_mode: bool = False

    # Benchmark limits — keep benchmark runs bounded so the API stays responsive.
    max_benchmark_rows: int = 2_000_000

    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
