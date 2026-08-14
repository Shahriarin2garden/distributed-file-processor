import datetime
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


def _create_job(
    file_data: bytes,
    filename: str,
    content_type: str,
    operation: str,
    column: str,
    filter_value: Optional[str],
    chunk_size_rows: int,
    demo_fail_chunks: Optional[str],
) -> UploadResponse:
    """Shared job creation: validate, persist, inspect, index. Used by upload and demo paths."""
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

    # size check
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if len(file_data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_file_size_mb} MB limit",
        )
    if len(file_data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    demo_chunks: list[int] = []
    if demo_fail_chunks:
        if not settings.demo_mode:
            raise HTTPException(
                status_code=403,
                detail="Fault injection is disabled. Set DEMO_MODE=true to enable.",
            )
        try:
            demo_chunks = sorted({int(x) for x in demo_fail_chunks.split(",") if x.strip()})
        except ValueError:
            raise HTTPException(
                status_code=400, detail="demo_fail_chunks must be comma-separated integers"
            )

    file_ext = _EXTENSION_MAP.get(content_type, "csv")
    job_id = str(uuid.uuid4())
    file_path = storage_service.save_uploaded_file(job_id, file_data, extension=file_ext)

    if file_ext == "json":
        inspection = chunker_service.inspect_json(file_path, chunk_size_rows)
    else:
        inspection = chunker_service.inspect_csv(file_path, chunk_size_rows)

    created_at = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()
    metadata = {
        "job_id": job_id,
        "filename": filename or "unknown",
        "file_extension": file_ext,
        "file_size": len(file_data),
        "operation": operation.value if isinstance(operation, OperationType) else operation,
        "column": column,
        "filter_value": filter_value,
        "chunk_size_rows": chunk_size_rows,
        "estimated_chunks": inspection["estimated_chunks"],
        "row_count": inspection["row_count"],
        "columns": inspection["columns"],
        "sample": inspection["sample"],
        "created_at": created_at,
        "status": "uploaded",
        "progress": 0.0,
        "demo": bool(demo_chunks),
        "demo_fail_chunks": demo_chunks,
    }
    redis_client.set_job_metadata(job_id, metadata)
    redis_client.index_job(job_id, datetime.datetime.now(tz=datetime.timezone.utc).timestamp())

    logger.info(
        f"Upload accepted: job={job_id} file={filename!r} "
        f"ext={file_ext} size={len(file_data)} op={metadata['operation']} "
        f"rows={inspection['row_count']}"
    )

    return UploadResponse(job_id=job_id, status="uploaded",
                          estimated_chunks=inspection["estimated_chunks"])


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_file(
    file: Annotated[UploadFile, File()],
    operation: Annotated[OperationType, Form()],
    column: Annotated[str, Form()],
    filter_value: Annotated[Optional[str], Form()] = None,
    chunk_size_rows: Annotated[int, Form()] = 50000,
    demo_fail_chunks: Annotated[Optional[str], Form()] = None,
) -> UploadResponse:
    # content-type validation happens inside _create_job
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip()
    file_data = await file.read()
    return _create_job(
        file_data=file_data,
        filename=file.filename,
        content_type=content_type,
        operation=operation,
        column=column,
        filter_value=filter_value,
        chunk_size_rows=chunk_size_rows,
        demo_fail_chunks=demo_fail_chunks,
    )


@router.post("/inspect", status_code=200)
async def inspect_file(
    file: Annotated[UploadFile, File()],
    chunk_size_rows: Annotated[int, Form()] = 50000,
) -> dict:
    """Preview a file before submitting: row count, columns, sample, estimated chunks.

    Used by the new-job wizard to give instant feedback on input files.
    """
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {content_type!r}. Accepted: CSV, JSON",
        )
    if not (1 <= chunk_size_rows <= 500_000):
        raise HTTPException(
            status_code=400, detail="chunk_size_rows must be between 1 and 500 000"
        )

    file_data = await file.read()
    max_bytes = settings.max_file_size_mb * 1024 * 1024
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
        inspection = chunker_service.inspect_json(file_path, chunk_size_rows)
    else:
        inspection = chunker_service.inspect_csv(file_path, chunk_size_rows)

    return {
        "filename": file.filename,
        "file_extension": file_ext,
        "file_size": len(file_data),
        "row_count": inspection["row_count"],
        "columns": inspection["columns"],
        "sample": inspection["sample"],
        "estimated_chunks": inspection["estimated_chunks"],
    }