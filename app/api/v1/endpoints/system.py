import os
from typing import Optional

import ray
from fastapi import APIRouter

from app.config import settings
from app.models.job import NodeInfo, SystemResponse
from app.utils.redis_client import redis_client

router = APIRouter()

_API_VERSION = "1.0.0"


def _is_local_mode() -> bool:
    addr = os.environ.get("RAY_ADDRESS", "").strip().lower()
    if addr == "local":
        return True
    if not ray.is_initialized():
        return False
    try:
        if len(ray.nodes()) <= 1:
            return True
    except Exception:
        pass
    return False


def _norm_resources(raw: dict) -> dict:
    """Normalise Ray resource dict to {cpu, memory_gb} for display."""
    cpu = raw.get("CPU", 0.0) or 0.0
    memory_bytes = raw.get("memory", 0.0) or 0.0
    return {
        "cpu": float(cpu),
        "memory_gb": round(memory_bytes / (1024 ** 3), 2),
    }


def _collect_cluster() -> list[NodeInfo]:
    if not ray.is_initialized():
        return []
    nodes: list[NodeInfo] = []
    try:
        raw_nodes = ray.nodes()
    except Exception:
        return nodes
    for n in raw_nodes:
        alive = bool(n.get("Alive", False))
        raw_id = n.get("NodeID", "") or ""
        if isinstance(raw_id, bytes):
            raw_id = raw_id.hex()
        node_id = str(raw_id) or "unknown"
        hostname = (
            n.get("NodeManagerHostname")
            or n.get("NodeManagerAddress")
            or ""
        )
        nodes.append(NodeInfo(
            node_id=node_id,
            alive=alive,
            hostname=str(hostname),
            resources=_norm_resources(n.get("Resources", {})),
            # Ray does not expose per-node available resources through
            # ray.nodes(); leave empty so the UI shows "unavailable" instead
            # of fabricated numbers.
            available_resources={},
        ))
    return nodes


def _job_telemetry() -> dict:
    """Real counters computed from the Redis job index."""
    job_ids = redis_client.list_job_ids(limit=200)
    active = queued = completed = failed = 0
    durations: list[float] = []
    total_chunks = 0
    total_time_s = 0.0
    active_tasks = completed_tasks = failed_tasks = retries = 0
    for job_id in job_ids:
        meta = redis_client.get_job_metadata(job_id)
        if not meta:
            continue
        status = meta.get("status", "uploaded")
        if status == "processing":
            active += 1
            tasks = redis_client.get_tasks(job_id)
            active_tasks += sum(1 for t in tasks.values() if t.get("status") == "running")
            failed_tasks += sum(1 for t in tasks.values() if t.get("status") == "failed")
            retries += sum(max(int(t.get("attempts", 1)) - 1, 0) for t in tasks.values())
        elif status == "uploaded":
            queued += 1
        elif status == "completed":
            completed += 1
            tasks = redis_client.get_tasks(job_id)
            completed_tasks += sum(1 for t in tasks.values() if t.get("status") == "completed")
            failed_tasks += sum(1 for t in tasks.values() if t.get("status") == "failed")
            retries += sum(max(int(t.get("attempts", 1)) - 1, 0) for t in tasks.values())
            dur_ms = meta.get("duration_ms")
            if dur_ms:
                durations.append(float(dur_ms))
                total_chunks += int(meta.get("actual_chunks") or 0)
                total_time_s += dur_ms / 1000.0
        elif status == "failed":
            failed += 1

    recent_durations = sorted(durations, reverse=True)[:20]
    avg_duration = (
        round(sum(recent_durations) / len(recent_durations), 1)
        if recent_durations else None
    )
    # Throughput: completed chunks per second across recent completed jobs.
    throughput = (
        round(total_chunks / total_time_s, 2) if total_time_s > 0 else None
    )
    return {
        "active_jobs": active,
        "queued_jobs": queued,
        "completed_jobs": completed,
        "failed_jobs": failed,
        "total_jobs": redis_client.job_index_count(),
        "active_tasks": active_tasks,
        "completed_tasks": completed_tasks,
        "failed_tasks": failed_tasks,
        "total_retries": retries,
        "recent_avg_duration_ms": avg_duration,
        "recent_chunks_per_sec": throughput,
    }


@router.get("/system", response_model=SystemResponse)
async def system_info() -> SystemResponse:
    nodes = _collect_cluster()
    ray_ok = ray.is_initialized()

    total_cpus = 0.0
    total_memory_gb: Optional[float] = None
    available_cpus = 0.0
    available_memory_gb: Optional[float] = None
    workers_online = sum(1 for n in nodes if n.alive)

    try:
        cluster_res = ray.cluster_resources() if ray_ok else {}
        avail_res = ray.available_resources() if ray_ok else {}
        total_cpus = float(cluster_res.get("CPU", 0.0) or 0.0)
        available_cpus = float(avail_res.get("CPU", 0.0) or 0.0)
        if cluster_res.get("memory"):
            total_memory_gb = round(cluster_res["memory"] / (1024 ** 3), 2)
        if avail_res.get("memory"):
            available_memory_gb = round(avail_res["memory"] / (1024 ** 3), 2)
    except Exception:
        pass

    redis_ok = False
    try:
        redis_ok = redis_client.client.ping()
    except Exception:
        pass

    telemetry = _job_telemetry()

    return SystemResponse(
        api_version=_API_VERSION,
        ray_initialized=ray_ok,
        ray_address=settings.ray_address,
        local_mode=_is_local_mode(),
        demo_mode=settings.demo_mode,
        redis_connected=redis_ok,
        nodes=nodes,
        total_cpus=total_cpus,
        available_cpus=available_cpus,
        total_memory_gb=total_memory_gb,
        available_memory_gb=available_memory_gb,
        workers_online=workers_online,
        max_concurrent_tasks=settings.max_concurrent_tasks,
        **telemetry,
    )