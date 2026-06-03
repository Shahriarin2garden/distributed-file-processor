from fastapi import APIRouter, UploadFile, File, Form
from app.models.job import UploadResponse, OperationType
from app.services.storage import storage_service
from app.services.chunker import chunker_service
from app.utils.redis_client import redis_client
import uuid

router = APIRouter()

@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    operation: OperationType = Form(...),
    column: str = Form(...),
    filter_value: str = Form(None),
    chunk_size_rows: int = Form(50000)
):
    job_id = str(uuid.uuid4())
    file_data = await file.read()
    file_path = await storage_service.save_uploaded_file(job_id, file_data)
    
    estimated_chunks = chunker_service.estimate_chunks(file_path, chunk_size_rows)
    
    metadata = {
        "job_id": job_id,
        "filename": file.filename,
        "file_size": len(file_data),
        "operation": operation.value,
        "column": column,
        "filter_value": filter_value,
        "chunk_size_rows": chunk_size_rows,
        "estimated_chunks": estimated_chunks,
        "status": "uploaded",
        "progress": 0.0
    }
    
    redis_client.set_job_metadata(job_id, metadata)
    
    return UploadResponse(
        job_id=job_id,
        status="uploaded",
        estimated_chunks=estimated_chunks
    )
