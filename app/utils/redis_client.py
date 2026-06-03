import redis
import json
from app.config import settings
from typing import Optional

class RedisClient:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)
    
    def set_job_metadata(self, job_id: str, metadata: dict, ttl: int = 86400):
        self.client.setex(f"job:{job_id}", ttl, json.dumps(metadata))
    
    def get_job_metadata(self, job_id: str) -> Optional[dict]:
        data = self.client.get(f"job:{job_id}")
        return json.loads(data) if data else None
    
    def set_chunks(self, job_id: str, chunks: list, ttl: int = 86400):
        self.client.setex(f"chunks:{job_id}", ttl, json.dumps(chunks))
    
    def get_chunks(self, job_id: str) -> list:
        data = self.client.get(f"chunks:{job_id}")
        return json.loads(data) if data else []
    
    def set_result(self, job_id: str, result: float, ttl: int = 86400):
        self.client.setex(f"result:{job_id}", ttl, json.dumps(result))
    
    def get_result(self, job_id: str) -> Optional[float]:
        data = self.client.get(f"result:{job_id}")
        return json.loads(data) if data else None
    
    def update_progress(self, job_id: str, completed_chunks: int, total_chunks: int):
        metadata = self.get_job_metadata(job_id)
        if metadata:
            metadata["progress"] = (completed_chunks / total_chunks) * 100
            self.set_job_metadata(job_id, metadata)

redis_client = RedisClient()
