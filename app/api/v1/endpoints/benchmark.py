import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.config import settings
from app.models.job import BenchmarkCreateResponse, BenchmarkResponse
from app.services.benchmark import run_benchmark
from app.utils.redis_client import redis_client

router = APIRouter()

_VALID_OPS = {"sum", "mean", "filter"}


def _to_response(benchmark_id: str, data: dict) -> BenchmarkResponse:
    return BenchmarkResponse(
        benchmark_id=benchmark_id,
        status=data.get("status", "queued"),
        created_at=data.get("created_at"),
        rows=int(data.get("rows", 0) or 0),
        chunk_size=int(data.get("chunk_size", 0) or 0),
        operation=data.get("operation", ""),
        num_chunks=int(data.get("num_chunks", 0) or 0),
        sequential_ms=data.get("sequential_ms"),
        distributed_ms=data.get("distributed_ms"),
        speedup=data.get("speedup"),
        avg_task_duration_ms=data.get("avg_task_duration_ms"),
        sequential_result=data.get("sequential_result"),
        distributed_result=data.get("distributed_result"),
        workers_used=int(data.get("workers_used", 0) or 0),
        error=data.get("error"),
    )


@router.post("/benchmark", response_model=BenchmarkCreateResponse, status_code=202)
async def create_benchmark(
    background_tasks: BackgroundTasks,
    rows: int = Query(100_000, ge=1_000, le=settings.max_benchmark_rows),
    chunk_size: int = Query(50_000, ge=1_000, le=500_000),
    operation: str = Query("sum"),
) -> BenchmarkCreateResponse:
    if operation not in _VALID_OPS:
        raise HTTPException(status_code=400, detail=f"operation must be one of {sorted(_VALID_OPS)}")
    if rows < chunk_size:
        # A single chunk makes the comparison trivial; coerce to a meaningful split.
        chunk_size = max(1_000, rows // 2)
    if chunk_size > 500_000:
        raise HTTPException(status_code=400, detail="chunk_size must be <= 500 000")

    benchmark_id = str(uuid.uuid4())
    now_ts = time.time()
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    redis_client.save_benchmark(benchmark_id, {
        "benchmark_id": benchmark_id,
        "status": "queued",
        "created_at": now_iso,
        "created_at_ts": now_ts,
        "rows": rows,
        "chunk_size": chunk_size,
        "operation": operation,
    })
    background_tasks.add_task(run_benchmark, benchmark_id, rows, chunk_size, operation)
    return BenchmarkCreateResponse(benchmark_id=benchmark_id, status="queued")


@router.get("/benchmark/{benchmark_id}", response_model=BenchmarkResponse)
async def get_benchmark(benchmark_id: str) -> BenchmarkResponse:
    data = redis_client.get_benchmark(benchmark_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Benchmark {benchmark_id} not found")
    return _to_response(benchmark_id, data)


@router.get("/benchmark", response_model=list[BenchmarkResponse])
async def list_benchmarks(limit: int = Query(20, ge=1, le=50)) -> list[BenchmarkResponse]:
    results = []
    for benchmark_id in redis_client.list_benchmark_ids(limit=limit):
        data = redis_client.get_benchmark(benchmark_id)
        if data:
            results.append(_to_response(benchmark_id, data))
    return results