from fastapi import APIRouter, HTTPException

from app.models.job import StatusResponse
from app.utils.redis_client import redis_client

router = APIRouter()


@router.get("/status/{job_id}", response_model=StatusResponse)
async def get_status(job_id: str) -> StatusResponse:
    metadata = redis_client.get_job_metadata(job_id)

    if not metadata:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return StatusResponse(
        job_id=job_id,
        status=metadata["status"],
        progress=metadata.get("progress", 0.0),
        error_message=metadata.get("error_message"),
    )
