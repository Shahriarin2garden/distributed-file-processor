from fastapi import APIRouter, HTTPException

from app.models.job import ResultResponse
from app.utils.redis_client import redis_client

router = APIRouter()


@router.get("/result/{job_id}", response_model=ResultResponse)
async def get_result(job_id: str) -> ResultResponse:
    metadata = redis_client.get_job_metadata(job_id)

    if not metadata:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    if metadata["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job {job_id} not completed. Current status: {metadata['status']}",
        )

    result = redis_client.get_result(job_id)

    if result is None:
        raise HTTPException(status_code=404, detail=f"Result for job {job_id} not found")

    return ResultResponse(
        job_id=job_id,
        operation=metadata["operation"],
        column=metadata["column"],
        result=result,
    )
