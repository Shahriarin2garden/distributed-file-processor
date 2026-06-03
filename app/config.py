from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    redis_url: str = "redis://localhost:6379"
    ray_address: str = "ray://localhost:10001"
    storage_type: str = "local"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_bucket_name: str = ""
    chunk_size_rows: int = 50000
    max_concurrent_tasks: int = 8
    storage_path: str = "./storage"
    
    class Config:
        env_file = ".env"

settings = Settings()
