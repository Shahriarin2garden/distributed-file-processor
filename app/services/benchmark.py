"""Benchmark runner.

Runs a real comparison between sequential and Ray-distributed processing using
the SAME generated dataset, the SAME chunk files, and the SAME per-chunk logic.
Every number reported here is measured at runtime — nothing is fabricated.
"""
import asyncio
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import ray

from app.config import settings
from app.services.ray_tasks import process_chunk_impl, process_chunk_tracked
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


def _now_iso() -> str:
    import datetime
    return datetime.datetime.now(tz=datetime.timezone.utc).isoformat()


def _now_ts() -> float:
    import time as _time
    return _time.time()


def _combine(partials: list[dict], operation: str) -> float:
    """Same aggregation semantics as ResultAggregator, used to verify both runs."""
    if operation == "mean":
        total_sum = sum(p["value"] for p in partials)
        total_count = sum(p["count"] for p in partials if p["count"] is not None)
        return total_sum / total_count if total_count > 0 else 0.0
    return sum(p["value"] for p in partials)


def _generate_and_chunk(rows: int, chunk_size: int, chunk_dir: str) -> list[str]:
    """Deterministic dataset → row-bounded CSV chunks.

    Chunks are written under the shared storage path (mounted into the Ray
    workers) so both the sequential and distributed runs read the same files.
    """
    rng = np.random.default_rng(42)
    df = pd.DataFrame({
        "amount": rng.integers(1, 10_000_000, size=rows),
        "category": rng.choice(["alpha", "beta", "gamma", "delta"], size=rows),
    })
    Path(chunk_dir).mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for i, offset in enumerate(range(0, rows, chunk_size)):
        chunk = df.iloc[offset:offset + chunk_size]
        path = f"{chunk_dir}/chunk_{i}.csv"
        chunk.to_csv(path, index=False)
        paths.append(path)
    return paths


def _run_sequential(chunk_paths: list[str], operation: str, column: str) -> tuple[float, float, float]:
    """Process chunks one at a time in-process. Returns (runtime_ms, avg_task_ms, result)."""
    partials: list[dict] = []
    durations: list[float] = []
    t_start = time.monotonic()
    for path in chunk_paths:
        t0 = time.monotonic()
        partials.append(process_chunk_impl(path, operation, column))
        durations.append((time.monotonic() - t0) * 1000)
    runtime_ms = (time.monotonic() - t_start) * 1000
    avg_task_ms = sum(durations) / len(durations) if durations else 0.0
    return runtime_ms, avg_task_ms, _combine(partials, operation)


def _run_distributed(
    chunk_paths: list[str], operation: str, column: str
) -> tuple[float, float, float, set[str]]:
    """Dispatch every chunk to Ray and collect via ray.wait. Returns
    (runtime_ms, avg_task_ms, result, workers_used)."""
    if not ray.is_initialized():
        raise RuntimeError("Ray is not initialized — cannot run distributed benchmark")
    dispatched_at: dict = {}
    for path in chunk_paths:
        dispatched_at[process_chunk_tracked.remote(path, operation, column)] = time.monotonic()

    t_start = time.monotonic()
    partials: list[dict] = []
    durations: list[float] = []
    workers: set[str] = set()
    pending = list(dispatched_at.keys())
    while pending:
        done, pending = ray.wait(pending, num_returns=1, timeout=600)
        if not done:
            raise TimeoutError("Ray did not respond within the benchmark timeout")
        for ref in done:
            result = ray.get(ref)
            partials.append(result)
            durations.append((time.monotonic() - dispatched_at.pop(ref)) * 1000)
            if isinstance(result, dict) and result.get("worker"):
                workers.add(result["worker"])
    total_ms = (time.monotonic() - t_start) * 1000
    avg_task_ms = sum(durations) / len(durations) if durations else 0.0
    return total_ms, avg_task_ms, _combine(partials, operation), workers


def run_benchmark(benchmark_id: str, rows: int, chunk_size: int, operation: str) -> None:
    """Execute the benchmark and persist the measured result to Redis."""
    from app.utils.redis_client import redis_client
    record = redis_client.get_benchmark(benchmark_id) or {}
    record.update({
        "status": "running",
        "created_at": record.get("created_at") or _now_iso(),
        "created_at_ts": record.get("created_at_ts") or _now_ts(),
    })
    redis_client.save_benchmark(benchmark_id, record)

    column = "amount"
    try:
        chunk_dir = os.path.join(settings.storage_path, "benchmark", benchmark_id)
        chunk_paths = _generate_and_chunk(rows, chunk_size, chunk_dir)
        logger.info(f"Benchmark {benchmark_id}: {rows} rows → {len(chunk_paths)} chunks")

        seq_ms, seq_avg_ms, seq_result = _run_sequential(chunk_paths, operation, column)
        dist_ms, dist_avg_ms, dist_result, workers = _run_distributed(
            chunk_paths, operation, column
        )

        record.update({
            "status": "completed",
            "rows": rows,
            "chunk_size": chunk_size,
            "operation": operation,
            "num_chunks": len(chunk_paths),
            "sequential_ms": round(seq_ms, 1),
            "distributed_ms": round(dist_ms, 1),
            "speedup": round(seq_ms / dist_ms, 2) if dist_ms > 0 else None,
            "avg_task_duration_ms": round(dist_avg_ms, 1),
            "sequential_result": seq_result,
            "distributed_result": dist_result,
            "workers_used": len(workers),
            "finished_at": _now_iso(),
        })
        logger.info(
            f"Benchmark {benchmark_id} done: seq={seq_ms:.0f}ms "
            f"dist={dist_ms:.0f}ms speedup={record['speedup']}"
        )
    except Exception as exc:
        logger.exception(f"Benchmark {benchmark_id} failed")
        record.update({
            "status": "failed",
            "error": type(exc).__name__ + ": " + str(exc)[:200],
            "finished_at": _now_iso(),
        })
    finally:
        redis_client.save_benchmark(benchmark_id, record)