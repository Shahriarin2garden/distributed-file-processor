import json
import time

import redis
from typing import Optional

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

_JOB_TTL = 86400  # 24 h
_EVENT_TTL = 86400
_MAX_EVENTS = 500
_BENCHMARK_TTL = 7 * 86400  # keep benchmark history for a week


class RedisClient:
    def __init__(self):
        self.client = redis.from_url(settings.redis_url, decode_responses=True)

    # ---------- job metadata ----------

    def set_job_metadata(self, job_id: str, metadata: dict, ttl: int = _JOB_TTL) -> None:
        self.client.setex(f"job:{job_id}", ttl, json.dumps(metadata))

    def get_job_metadata(self, job_id: str) -> Optional[dict]:
        data = self.client.get(f"job:{job_id}")
        return json.loads(data) if data else None

    # ---------- job index (history) ----------

    def index_job(self, job_id: str, created_at: str, ttl: int = _JOB_TTL) -> None:
        """Add a job to the history index, sorted by creation time (newest first)."""
        self.client.zadd("jobs:index", {job_id: float(created_at)})
        self.client.expire("jobs:index", ttl)

    def list_job_ids(self, limit: int = 100, offset: int = 0) -> list[str]:
        return self.client.zrevrange("jobs:index", offset, offset + limit - 1)

    def job_index_count(self) -> int:
        return self.client.zcard("jobs:index")

    def remove_job_from_index(self, job_id: str) -> None:
        self.client.zrem("jobs:index", job_id)

    # ---------- per-job task tracking ----------

    def set_tasks(self, job_id: str, tasks: dict, ttl: int = _JOB_TTL) -> None:
        self.client.setex(f"tasks:{job_id}", ttl, json.dumps(tasks))

    def get_tasks(self, job_id: str) -> dict:
        data = self.client.get(f"tasks:{job_id}")
        return json.loads(data) if data else {}

    # ---------- per-job event log ----------

    def append_event(self, job_id: str, event: dict, ttl: int = _EVENT_TTL) -> None:
        key = f"events:{job_id}"
        self.client.rpush(key, json.dumps(event))
        self.client.ltrim(key, -_MAX_EVENTS, -1)
        self.client.expire(key, ttl)

    def get_events(self, job_id: str) -> list[dict]:
        data = self.client.lrange(f"events:{job_id}", 0, -1)
        events = [json.loads(item) for item in data if item]
        events.sort(key=lambda e: e.get("t", 0.0))
        return events

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

    # ---------- benchmarks ----------

    def save_benchmark(self, benchmark_id: str, data: dict) -> None:
        created_ts = float(data.get("created_at_ts", 0) or 0)
        self.client.setex(f"benchmark:{benchmark_id}", _BENCHMARK_TTL, json.dumps(data))
        self.client.zadd("benchmarks:index", {benchmark_id: created_ts})
        self.client.expire("benchmarks:index", _BENCHMARK_TTL)

    def get_benchmark(self, benchmark_id: str) -> Optional[dict]:
        data = self.client.get(f"benchmark:{benchmark_id}")
        return json.loads(data) if data else None

    def list_benchmark_ids(self, limit: int = 50) -> list[str]:
        return self.client.zrevrange("benchmarks:index", 0, limit - 1)

    # ---------- benchmark studies (workload-size sweeps) ----------

    def save_study(self, study_id: str, data: dict) -> None:
        self.client.setex(f"study:{study_id}", _BENCHMARK_TTL, json.dumps(data))
        created_ts = float(data.get("created_at_ts") or time.time())
        self.client.zadd("studies:index", {study_id: created_ts})
        self.client.expire("studies:index", _BENCHMARK_TTL)

    def get_study(self, study_id: str) -> Optional[dict]:
        data = self.client.get(f"study:{study_id}")
        return json.loads(data) if data else None

    def list_study_ids(self, limit: int = 10) -> list[str]:
        return self.client.zrevrange("studies:index", 0, limit - 1)


redis_client = RedisClient()
