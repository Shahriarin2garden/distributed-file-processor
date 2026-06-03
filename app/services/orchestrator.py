import ray
from app.services.ray_tasks import process_chunk
from app.services.ray_actor import ResultAggregator
from app.services.chunker import chunker_service
from app.services.storage import storage_service
from app.utils.redis_client import redis_client
from app.utils.logger import setup_logger
from app.config import settings

logger = setup_logger(__name__)

class Orchestrator:
    def __init__(self):
        if not ray.is_initialized():
            ray.init(address=settings.ray_address, ignore_reinit_error=True)
    
    async def process_job(self, job_id: str):
        try:
            metadata = redis_client.get_job_metadata(job_id)
            if not metadata:
                raise ValueError(f"Job {job_id} not found")
            
            # Update status
            metadata["status"] = "processing"
            redis_client.set_job_metadata(job_id, metadata)
            
            # Get file and create chunks
            file_path = storage_service.get_raw_file_path(job_id)
            chunk_paths = chunker_service.split_csv(
                file_path, 
                job_id, 
                metadata["chunk_size_rows"]
            )
            redis_client.set_chunks(job_id, chunk_paths)
            
            # Create aggregator
            aggregator = ResultAggregator.remote(metadata["operation"])
            
            # Process chunks in parallel
            tasks = []
            for chunk_path in chunk_paths:
                task = process_chunk.remote(
                    chunk_path,
                    metadata["operation"],
                    metadata["column"],
                    metadata.get("filter_value")
                )
                tasks.append(task)
            
            # Collect results
            completed = 0
            for task in tasks:
                try:
                    result = ray.get(task)
                    aggregator.add_result.remote(result)
                    completed += 1
                    redis_client.update_progress(job_id, completed, len(chunk_paths))
                except Exception as e:
                    logger.error(f"Task failed for job {job_id}: {e}")
                    raise
            
            # Get final result
            final_result = ray.get(aggregator.get_final.remote())
            redis_client.set_result(job_id, final_result)
            
            # Update status
            metadata["status"] = "completed"
            metadata["progress"] = 100.0
            redis_client.set_job_metadata(job_id, metadata)
            
            # Cleanup
            storage_service.cleanup_chunks(job_id)
            
            logger.info(f"Job {job_id} completed with result: {final_result}")
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            metadata = redis_client.get_job_metadata(job_id)
            if metadata:
                metadata["status"] = "failed"
                metadata["error_message"] = str(e)
                redis_client.set_job_metadata(job_id, metadata)

orchestrator = Orchestrator()
