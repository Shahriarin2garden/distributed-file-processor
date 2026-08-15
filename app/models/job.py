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


# ---------------------------------------------------------------------------
# Observability models (additive — existing contracts unchanged)
# ---------------------------------------------------------------------------


class JobSummary(BaseModel):
    job_id: str
    filename: str
    file_size: int
    file_extension: str
    operation: str
    column: str
    filter_value: Optional[str] = None
    chunk_size_rows: int
    estimated_chunks: int
    row_count: Optional[int] = None
    status: str
    progress: float
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: Optional[float] = None
    result: Optional[float] = None
    columns: Optional[list[str]] = None
    worker_usage: Optional[dict] = None
    demo: Optional[bool] = False


class JobListResponse(BaseModel):
    jobs: list[JobSummary]
    total: int


class EventRecord(BaseModel):
    t: float
    ts: str
    kind: str
    message: str
    chunk: Optional[str] = None
    worker: Optional[str] = None
    attempts: Optional[int] = None


class TaskRecord(BaseModel):
    chunk_id: int
    label: str
    status: str
    worker: Optional[str] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    duration_ms: Optional[float] = None
    attempts: int = 1


class JobDetailResponse(BaseModel):
    job: JobSummary
    tasks: list[TaskRecord]
    events: list[EventRecord]


class NodeInfo(BaseModel):
    node_id: str
    alive: bool
    hostname: str
    resources: dict
    available_resources: dict


class SystemResponse(BaseModel):
    api_version: str
    ray_initialized: bool
    ray_address: str
    local_mode: bool
    demo_mode: bool
    redis_connected: bool
    nodes: list[NodeInfo]
    total_cpus: float
    available_cpus: float
    total_memory_gb: Optional[float]
    available_memory_gb: Optional[float]
    active_jobs: int
    queued_jobs: int
    completed_jobs: int
    failed_jobs: int
    total_jobs: int
    active_tasks: int
    completed_tasks: int
    failed_tasks: int
    total_retries: int
    recent_avg_duration_ms: Optional[float]
    recent_chunks_per_sec: Optional[float]
    workers_online: int
    max_concurrent_tasks: int = 8


class BenchmarkResponse(BaseModel):
    benchmark_id: str
    status: str
    created_at: Optional[str] = None
    rows: int = 0
    chunk_size: int = 0
    operation: str = ""
    num_chunks: int = 0
    sequential_ms: Optional[float] = None
    distributed_ms: Optional[float] = None
    speedup: Optional[float] = None
    avg_task_duration_ms: Optional[float] = None
    sequential_result: Optional[float] = None
    distributed_result: Optional[float] = None
    workers_used: int = 0
    error: Optional[str] = None


class BenchmarkCreateResponse(BaseModel):
    benchmark_id: str
    status: str


class DemoJobResponse(BaseModel):
    job_id: str
    status: str
    estimated_chunks: int
    demo: bool
