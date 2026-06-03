import json
import redis
from typing import Optional

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

_JOB_TTL = 86400  # 24 h


class RedisClient:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)

    # ---------- job metadata ----------

    def set_job_metadata(self, job_id: str, metadata: dict, ttl: int = _JOB_TTL) -> None:
        self.client.setex(f"job:{job_id}", ttl, json.dumps(metadata))

    def get_job_metadata(self, job_id: str) -> Optional[dict]:
        data = self.client.get(f"job:{job_id}")
        return json.loads(data) if data else None

    # ---------- chunks ----------

    def set_chunks(self, job_id: str, chunks: list, ttl: int = _JOB_TTL) -> None:
        self.client.setex(f"chunks:{job_id}", ttl, json.dumps(chunks))

    def get_chunks(self, job_id: str) -> list:
        data = self.client.get(f"chunks:{job_id}")
        return json.loads(data) if data else []

    # ---------- result ----------

    def set_result(self, job_id: str, result: float, ttl: int = _JOB_TTL) -> None:
        self.client.setex(f"result:{job_id}", ttl, json.dumps(result))

    def get_result(self, job_id: str) -> Optional[float]:
        data = self.client.get(f"result:{job_id}")
        return json.loads(data) if data else None

    # ---------- atomic progress update via pipeline ----------

    def update_progress(self, job_id: str, completed_chunks: int, total_chunks: int) -> None:
        key = f"job:{job_id}"
        with self.client.pipeline() as pipe:
            while True:
                try:
                    pipe.watch(key)
                    raw = pipe.get(key)
                    if not raw:
                        return
                    metadata = json.loads(raw)
                    metadata["progress"] = round(completed_chunks / total_chunks * 100, 1)
                    pipe.multi()
                    pipe.setex(key, _JOB_TTL, json.dumps(metadata))
                    pipe.execute()
                    break
                except redis.WatchError:
                    continue


redis_client = RedisClient()
