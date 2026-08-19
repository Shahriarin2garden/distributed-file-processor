import asyncio
import datetime
import time
from typing import Optional

import ray

from app.config import settings
from app.services.ray_tasks import (
    process_chunk_faulty,
    process_chunk_tracked,
)
from app.services.ray_actor import ResultAggregator
from app.services.chunker import chunker_service
from app.services.storage import storage_service
from app.utils.redis_client import redis_client
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

_CHUNK_TIMEOUT_S = 300  # per-chunk timeout
_DEMO_MAX_RETRIES = 3


def _iso(ts: float) -> str:
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()


def _record_event(
    job_id: str, kind: str, message: str, chunk: Optional[str] = None,
    worker: Optional[str] = None, attempts: Optional[int] = None,
) -> None:
    """Append a structured, timestamped event to the job's event log in Redis."""
    ts = time.time()
    redis_client.append_event(job_id, {
        "t": ts,
        "ts": _iso(ts),
        "kind": kind,
        "message": message,
        "chunk": chunk,
        "worker": worker,
        "attempts": attempts,
    })


class Orchestrator:
    async def process_job(self, job_id: str) -> None:
        metadata = redis_client.get_job_metadata(job_id)
        if not metadata:
            logger.error(f"Job {job_id} not found in Redis")
            return

        started = time.time()
        try:
            metadata["status"] = "processing"
            metadata["started_at"] = _iso(started)
            redis_client.set_job_metadata(job_id, metadata)
            _record_event(job_id, "stage", "orchestrator started")

            # Determine file type and split into chunks
            file_ext = metadata.get("file_extension", "csv")
            file_path = storage_service.get_raw_file_path(job_id, extension=file_ext)
            is_json = file_ext in {"json", "jsonl"}

            loop = asyncio.get_event_loop()
            if is_json:
                chunk_paths = await loop.run_in_executor(
                    None,
                    chunker_service.split_json,
                    file_path,
                    job_id,
                    metadata["chunk_size_rows"],
                )
            else:
                chunk_paths = await loop.run_in_executor(
                    None,
                    chunker_service.split_csv,
                    file_path,
                    job_id,
                    metadata["chunk_size_rows"],
                )

            if not chunk_paths:
                raise ValueError("File produced zero chunks — check file content")

            redis_client.set_chunks(job_id, chunk_paths)
            metadata["actual_chunks"] = len(chunk_paths)
            redis_client.set_job_metadata(job_id, metadata)
            _record_event(
                job_id, "stage",
                f"split complete — {len(chunk_paths)} chunks created",
            )

            demo_chunks: set[int] = {
                int(c) for c in metadata.get("demo_fail_chunks", [])
            } if settings.demo_mode else set()

            # Launch Ray tasks with bounded concurrency, collecting via ray.wait
            aggregator = ResultAggregator.remote(metadata["operation"])
            capacity = max(1, settings.max_concurrent_tasks)

            tasks_store: dict = {}
            in_flight: dict = {}  # ref -> {idx, demo, attempt, dispatched_at}
            pending = list(range(len(chunk_paths)))
            completed = 0

            def _dispatch(idx: int, demo: bool, attempt: int) -> None:
                now = time.time()
                tasks_store[str(idx)] = {
                    "chunk_id": idx,
                    "label": f"chunk-{idx:03d}",
                    "status": "running",
                    "attempts": attempt,
                    "started_at": now,
                }
                if demo:
                    ref = process_chunk_faulty.remote(
                        chunk_paths[idx], metadata["operation"],
                        metadata["column"], metadata.get("filter_value"),
                    )
                    _record_event(
                        job_id, "dispatch",
                        f"{tasks_store[str(idx)]['label']} dispatched "
                        f"(attempt {attempt}, fault-injected)",
                        chunk=tasks_store[str(idx)]["label"],
                    )
                else:
                    ref = process_chunk_tracked.remote(
                        chunk_paths[idx], metadata["operation"],
                        metadata["column"], metadata.get("filter_value"),
                    )
                    _record_event(
                        job_id, "dispatch",
                        f"{tasks_store[str(idx)]['label']} dispatched",
                        chunk=tasks_store[str(idx)]["label"],
                    )
                in_flight[ref] = {"idx": idx, "demo": demo, "attempt": attempt,
                                  "dispatched_at": now}

            while pending or in_flight:
                # Dispatch up to the concurrency limit.
                while pending and len(in_flight) < capacity:
                    idx = pending.pop(0)
                    _dispatch(idx, demo=idx in demo_chunks, attempt=1)

                if not in_flight:
                    break

                refs = list(in_flight.keys())
                done, _ = ray.wait(refs, num_returns=len(refs), timeout=0.2)

                if not done:
                    # Check per-task timeout.
                    now = time.time()
                    for ref, info in list(in_flight.items()):
                        if now - info["dispatched_at"] > _CHUNK_TIMEOUT_S:
                            raise TimeoutError(
                                f"Ray worker did not respond within {_CHUNK_TIMEOUT_S}s"
                            )
                    await asyncio.sleep(0.05)
                    continue

                for ref in done:
                    info = in_flight.pop(ref)
                    idx = info["idx"]
                    label = f"chunk-{idx:03d}"
                    try:
                        partial = ray.get(ref)
                    except Exception as exc:
                        if not info["demo"]:
                            raise  # Ray already retried internally; real failure
                        # Demo fault: task failed on purpose — retry normally.
                        _record_event(
                            job_id, "fail",
                            f"{label} failed — worker unreachable",
                            chunk=label,
                            attempts=info["attempt"],
                        )
                        if info["attempt"] >= _DEMO_MAX_RETRIES:
                            raise
                        _record_event(
                            job_id, "retry",
                            f"{label} retry scheduled",
                            chunk=label,
                            attempts=info["attempt"] + 1,
                        )
                        tasks_store[str(idx)]["attempts"] = info["attempt"] + 1
                        _dispatch(idx, demo=False, attempt=info["attempt"] + 1)
                        continue

                    worker = partial.get("worker") if isinstance(partial, dict) else None
                    finished = time.time()
                    tasks_store[str(idx)].update({
                        "status": "completed",
                        "worker": worker,
                        "finished_at": finished,
                        "duration_ms": round((finished - tasks_store[str(idx)]["started_at"]) * 1000, 1),
                    })
                    redis_client.set_tasks(job_id, tasks_store)
                    _record_event(
                        job_id, "complete",
                        f"{label} completed on worker {worker or 'unknown'}",
                        chunk=label,
                        worker=worker,
                        attempts=info["attempt"],
                    )
                    aggregator.add_result.remote(partial)
                    completed += 1
                    redis_client.update_progress(job_id, completed, len(chunk_paths))

            final_result = ray.get(aggregator.get_final.remote())
            redis_client.set_result(job_id, final_result)

            finished = time.time()
            metadata["status"] = "completed"
            metadata["progress"] = 100.0
            metadata["finished_at"] = _iso(finished)
            metadata["duration_ms"] = round((finished - started) * 1000, 1)
            worker_counts: dict = {}
            for task in tasks_store.values():
                w = task.get("worker")
                if w:
                    worker_counts[w] = worker_counts.get(w, 0) + 1
            metadata["worker_usage"] = worker_counts
            redis_client.set_job_metadata(job_id, metadata)
            _record_event(
                job_id, "result",
                f"aggregation complete — result {final_result}",
                attempts=1,
            )
            logger.info(f"Job {job_id} completed: {final_result}")

            # Clean up chunk files
            try:
                storage_service.cleanup_chunks(job_id)
            except Exception as cleanup_err:
                logger.warning(f"Chunk cleanup failed for {job_id}: {cleanup_err}")

            # The raw upload is no longer needed once the job is terminal.
            try:
                storage_service.delete_raw_file(job_id, extension=file_ext)
            except Exception as cleanup_err:
                logger.warning(f"Raw file cleanup failed for {job_id}: {cleanup_err}")

        except Exception as exc:
            logger.error(f"Job {job_id} failed: {exc}")
            # Re-fetch metadata in case it changed; fall back to the copy we have
            current = redis_client.get_job_metadata(job_id) or metadata
            current["status"] = "failed"
            # Sanitize error message — don't expose full stack trace to clients
            current["error_message"] = type(exc).__name__ + ": " + str(exc)[:200]
            current["finished_at"] = _iso(time.time())
            redis_client.set_job_metadata(job_id, current)
            _record_event(
                job_id, "fail", f"job failed — {current['error_message']}",
                attempts=1,
            )


orchestrator = Orchestrator()