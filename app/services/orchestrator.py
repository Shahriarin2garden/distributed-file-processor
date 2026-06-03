import asyncio
import ray

from app.services.ray_tasks import process_chunk
from app.services.ray_actor import ResultAggregator
from app.services.chunker import chunker_service
from app.services.storage import storage_service
from app.utils.redis_client import redis_client
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

_CHUNK_TIMEOUT_S = 300  # per-chunk timeout


class Orchestrator:
    async def process_job(self, job_id: str) -> None:
        metadata = redis_client.get_job_metadata(job_id)
        if not metadata:
            logger.error(f"Job {job_id} not found in Redis")
            return

        try:
            metadata["status"] = "processing"
            redis_client.set_job_metadata(job_id, metadata)

            # Determine file type and split into chunks
            file_ext = metadata.get("file_extension", "csv")
            file_path = storage_service.get_raw_file_path(job_id, extension=file_ext)

            loop = asyncio.get_event_loop()
            if file_ext == "json":
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

            # Launch all Ray tasks in parallel
            aggregator = ResultAggregator.remote(metadata["operation"])
            task_refs = [
                process_chunk.remote(
                    chunk_path,
                    metadata["operation"],
                    metadata["column"],
                    metadata.get("filter_value"),
                )
                for chunk_path in chunk_paths
            ]

            # Collect results as they finish (true parallelism via ray.wait)
            pending = list(task_refs)
            completed = 0
            while pending:
                done, pending = ray.wait(pending, num_returns=1, timeout=_CHUNK_TIMEOUT_S)
                if not done:
                    raise TimeoutError(
                        f"Ray worker did not respond within {_CHUNK_TIMEOUT_S}s"
                    )
                partial = ray.get(done[0])
                aggregator.add_result.remote(partial)
                completed += 1
                redis_client.update_progress(job_id, completed, len(task_refs))

            final_result = ray.get(aggregator.get_final.remote())
            redis_client.set_result(job_id, final_result)

            metadata["status"] = "completed"
            metadata["progress"] = 100.0
            redis_client.set_job_metadata(job_id, metadata)
            logger.info(f"Job {job_id} completed: {final_result}")

            # Clean up chunk files
            try:
                storage_service.cleanup_chunks(job_id)
            except Exception as cleanup_err:
                logger.warning(f"Chunk cleanup failed for {job_id}: {cleanup_err}")

        except Exception as exc:
            logger.error(f"Job {job_id} failed: {exc}")
            # Re-fetch metadata in case it changed; fall back to the copy we have
            current = redis_client.get_job_metadata(job_id) or metadata
            current["status"] = "failed"
            # Sanitize error message — don't expose full stack trace to clients
            current["error_message"] = type(exc).__name__ + ": " + str(exc)[:200]
            redis_client.set_job_metadata(job_id, current)


orchestrator = Orchestrator()
