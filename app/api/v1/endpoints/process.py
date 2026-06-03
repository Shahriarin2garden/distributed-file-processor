from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.models.job import ProcessResponse
from app.utils.redis_client import redis_client
from app.services.orchestrator import orchestrator

router = APIRouter()

@router.post("/process/{job_id}", response_model=ProcessResponse, status_code=202)
async def process_job(job_id: str, background_tasks: BackgroundTasks):
    metadata = redis_client.get_job_metadata(job_id)
    
    if not metadata:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    
    if metadata["status"] != "uploaded":
        raise HTTPException(
            status_code=400, 
            detail=f"Job {job_id} cannot be processed. Current status: {metadata['status']}"
        )
    
    background_tasks.add_task(orchestrator.process_job, job_id)
    
    return ProcessResponse(job_id=job_id, status="processing")
