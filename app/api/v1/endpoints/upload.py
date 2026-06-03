import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import settings
from app.models.job import OperationType, UploadResponse
from app.services.chunker import chunker_service
from app.services.storage import storage_service
from app.utils.redis_client import redis_client
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "text/plain",
    "application/json",
    "text/json",
    "application/octet-stream",  # common browser fallback
}
_EXTENSION_MAP = {
    "text/csv": "csv",
    "application/csv": "csv",
    "text/plain": "csv",
    "application/json": "json",
    "text/json": "json",
    "application/octet-stream": "csv",
}


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_file(
    file: Annotated[UploadFile, File()],
    operation: Annotated[OperationType, Form()],
    column: Annotated[str, Form()],
    filter_value: Annotated[Optional[str], Form()] = None,
    chunk_size_rows: Annotated[int, Form()] = 50000,
) -> UploadResponse:
    # content-type validation
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {content_type!r}. Accepted: CSV, JSON",
        )

    # column name sanity — no control chars, reasonable length
    if not column or not column.isprintable() or len(column) > 128:
        raise HTTPException(status_code=400, detail="Invalid column name")

    # chunk_size bounds (file size limit already caps total chunk count)
    if not (1 <= chunk_size_rows <= 500_000):
        raise HTTPException(
            status_code=400, detail="chunk_size_rows must be between 1 and 500 000"
        )

    # filter_value required for filter op
    if operation == OperationType.FILTER and not filter_value:
        raise HTTPException(
            status_code=400, detail="filter_value is required when operation=filter"
        )

    # read + size check
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    file_data = await file.read()
    if len(file_data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_file_size_mb} MB limit",
        )
    if len(file_data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    file_ext = _EXTENSION_MAP.get(content_type, "csv")
    job_id = str(uuid.uuid4())
    file_path = storage_service.save_uploaded_file(job_id, file_data, extension=file_ext)

    if file_ext == "json":
        estimated_chunks = chunker_service.estimate_json_chunks(file_path, chunk_size_rows)
    else:
        estimated_chunks = chunker_service.estimate_chunks(file_path, chunk_size_rows)

    metadata = {
        "job_id": job_id,
        "filename": file.filename or "unknown",
        "file_extension": file_ext,
        "file_size": len(file_data),
        "operation": operation.value,
        "column": column,
        "filter_value": filter_value,
        "chunk_size_rows": chunk_size_rows,
        "estimated_chunks": estimated_chunks,
        "status": "uploaded",
        "progress": 0.0,
    }
    redis_client.set_job_metadata(job_id, metadata)

    logger.info(
        f"Upload accepted: job={job_id} file={file.filename!r} "
        f"ext={file_ext} size={len(file_data)} op={operation.value}"
    )

    return UploadResponse(job_id=job_id, status="uploaded", estimated_chunks=estimated_chunks)
