import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.config import settings
from app.models.job import (
    BenchmarkCreateResponse,
    BenchmarkResponse,
    BenchmarkStudyCreateResponse,
    BenchmarkStudyPoint,
    BenchmarkStudyResponse,
)
from app.services.benchmark import run_benchmark, run_study
from app.utils.redis_client import redis_client

router = APIRouter()

_VALID_OPS = {"sum", "mean", "filter"}
_MAX_STUDY_SIZES = 8


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


@router.get("/benchmark/study", response_model=list[BenchmarkStudyResponse])
async def list_studies(limit: int = Query(5, ge=1, le=20)) -> list[BenchmarkStudyResponse]:
    results = []
    for study_id in redis_client.list_study_ids(limit=limit):
        data = redis_client.get_study(study_id)
        if data:
            results.append(BenchmarkStudyResponse(
                study_id=study_id,
                status=data.get("status", "queued"),
                created_at=data.get("created_at"),
                operation=data.get("operation", ""),
                chunk_size=int(data.get("chunk_size", 0) or 0),
                sizes=[int(s) for s in (data.get("sizes") or [])],
                points=[BenchmarkStudyPoint(**p) for p in (data.get("points") or [])],
                crossover_rows=data.get("crossover_rows"),
                notes=data.get("notes") or [],
                error=data.get("error"),
            ))
    return results


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


def _parse_sizes(raw: str) -> list[int]:
    try:
        sizes = sorted({int(x) for x in raw.split(",") if x.strip()})
    except ValueError:
        raise HTTPException(status_code=400, detail="sizes must be comma-separated integers")
    if not sizes:
        raise HTTPException(status_code=400, detail="sizes must not be empty")
    if len(sizes) > _MAX_STUDY_SIZES:
        raise HTTPException(status_code=400, detail=f"at most {_MAX_STUDY_SIZES} sizes per study")
    for s in sizes:
        if not (1_000 <= s <= settings.max_benchmark_rows):
            raise HTTPException(
                status_code=400,
                detail=f"each size must be between 1 000 and {settings.max_benchmark_rows}",
            )
    return sizes


@router.post("/benchmark/study", response_model=BenchmarkStudyCreateResponse, status_code=202)
async def create_study(
    background_tasks: BackgroundTasks,
    sizes: str = Query("10000,50000,100000,250000"),
    chunk_size: int = Query(50_000, ge=1_000, le=500_000),
    operation: str = Query("sum"),
) -> BenchmarkStudyCreateResponse:
    """Sweep a set of workload sizes through the same sequential vs distributed
    comparison to reveal the real crossover point and overhead zones."""
    if operation not in _VALID_OPS:
        raise HTTPException(status_code=400, detail=f"operation must be one of {sorted(_VALID_OPS)}")
    parsed = _parse_sizes(sizes)

    study_id = str(uuid.uuid4())
    now_ts = time.time()
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    redis_client.save_study(study_id, {
        "study_id": study_id,
        "status": "queued",
        "created_at": now_iso,
        "created_at_ts": now_ts,
        "operation": operation,
        "chunk_size": chunk_size,
        "sizes": parsed,
    })
    background_tasks.add_task(run_study, study_id, parsed, chunk_size, operation)
    return BenchmarkStudyCreateResponse(study_id=study_id, status="queued", sizes=parsed)


@router.get("/benchmark/study/{study_id}", response_model=BenchmarkStudyResponse)
async def get_study(study_id: str) -> BenchmarkStudyResponse:
    data = redis_client.get_study(study_id)
    if not data:
        raise HTTPException(status_code=404, detail=f"Study {study_id} not found")
    return BenchmarkStudyResponse(
        study_id=study_id,
        status=data.get("status", "queued"),
        created_at=data.get("created_at"),
        operation=data.get("operation", ""),
        chunk_size=int(data.get("chunk_size", 0) or 0),
        sizes=[int(s) for s in (data.get("sizes") or [])],
        points=[BenchmarkStudyPoint(**p) for p in (data.get("points") or [])],
        crossover_rows=data.get("crossover_rows"),
        notes=data.get("notes") or [],
        error=data.get("error"),
    )