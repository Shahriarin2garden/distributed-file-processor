from typing import Annotated, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import settings
from app.models.job import DemoJobResponse, OperationType, UploadResponse
from app.api.v1.endpoints.upload import _create_job, _read_upload_bounded

router = APIRouter()


@router.post("/demo/fault", response_model=DemoJobResponse, status_code=201)
async def demo_fault_job(
    file: Annotated[UploadFile, File()],
    operation: Annotated[OperationType, Form()],
    column: Annotated[str, Form()],
    filter_value: Annotated[Optional[str], Form()] = None,
    chunk_size_rows: Annotated[int, Form()] = 50000,
    fail_chunks: Annotated[str, Form()] = "0",
) -> DemoJobResponse:
    """Create a job whose first chunk is fault-injected so the retry/recovery
    path can be observed. Only available when DEMO_MODE=true."""
    if not settings.demo_mode:
        raise HTTPException(
            status_code=403,
            detail="Fault injection is disabled. Set DEMO_MODE=true to enable.",
        )

    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip()
    file_data = await _read_upload_bounded(
        file, settings.max_file_size_mb * 1024 * 1024
    )

    try:
        chunk_ids = sorted({int(x) for x in fail_chunks.split(",") if x.strip()})
    except ValueError:
        raise HTTPException(status_code=400, detail="fail_chunks must be comma-separated integers")

    response: UploadResponse = _create_job(
        file_data=file_data,
        filename=file.filename,
        content_type=content_type,
        operation=operation,
        column=column,
        filter_value=filter_value,
        chunk_size_rows=chunk_size_rows,
        demo_fail_chunks=",".join(str(c) for c in chunk_ids),
    )
    return DemoJobResponse(
        job_id=response.job_id,
        status=response.status,
        estimated_chunks=response.estimated_chunks,
        demo=True,
    )