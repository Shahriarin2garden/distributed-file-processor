from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
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

    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
