from enum import Enum
from typing import Optional

from pydantic import BaseModel


class OperationType(str, Enum):
    SUM = "sum"
    MEAN = "mean"
    FILTER = "filter"


class JobStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobMetadata(BaseModel):
    job_id: str
    filename: str
    file_size: int
    operation: OperationType
    column: str
    filter_value: Optional[str] = None
    chunk_size_rows: int
    estimated_chunks: int
    status: JobStatus
    progress: float = 0.0
    error_message: Optional[str] = None


class UploadResponse(BaseModel):
    job_id: str
    status: str
    estimated_chunks: int


class ProcessResponse(BaseModel):
    job_id: str
    status: str


class StatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    error_message: Optional[str] = None


class ResultResponse(BaseModel):
    job_id: str
    operation: str
    column: str
    result: float
