from fastapi import APIRouter, HTTPException, Query

from app.models.job import (
    EventRecord,
    JobDetailResponse,
    JobListResponse,
    JobSummary,
    TaskRecord,
)
from app.utils.redis_client import redis_client

router = APIRouter()


def _to_summary(job_id: str, meta: dict) -> JobSummary:
    return JobSummary(
        job_id=job_id,
        filename=meta.get("filename", "unknown"),
        file_size=int(meta.get("file_size", 0)),
        file_extension=meta.get("file_extension", "csv"),
        operation=meta.get("operation", "sum"),
        column=meta.get("column", ""),
        filter_value=meta.get("filter_value"),
        chunk_size_rows=int(meta.get("chunk_size_rows", 50000)),
        estimated_chunks=int(meta.get("estimated_chunks", 1)),
        row_count=meta.get("row_count"),
        status=meta.get("status", "uploaded"),
        progress=float(meta.get("progress", 0.0)),
        error_message=meta.get("error_message"),
        created_at=meta.get("created_at"),
        started_at=meta.get("started_at"),
        finished_at=meta.get("finished_at"),
        duration_ms=meta.get("duration_ms"),
        result=redis_client.get_result(job_id),
        columns=meta.get("columns"),
        worker_usage=meta.get("worker_usage"),
        demo=bool(meta.get("demo", False)),
    )


@router.get("/jobs", response_model=JobListResponse)
async def list_jobs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    operation: str | None = Query(None),
    search: str | None = Query(None),
) -> JobListResponse:
    job_ids = redis_client.list_job_ids(limit=200)
    jobs: list[JobSummary] = []
    for job_id in job_ids:
        meta = redis_client.get_job_metadata(job_id)
        if not meta:
            continue
        summary = _to_summary(job_id, meta)
        if status and summary.status != status:
            continue
        if operation and summary.operation != operation:
            continue
        if search and search.lower() not in summary.filename.lower() \
                and search.lower() not in job_id.lower():
            continue
        jobs.append(summary)

    total = len(jobs)
    return JobListResponse(jobs=jobs[offset:offset + limit], total=total)


@router.get("/jobs/{job_id}", response_model=JobDetailResponse)
async def get_job_detail(job_id: str) -> JobDetailResponse:
    meta = redis_client.get_job_metadata(job_id)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    raw_tasks = redis_client.get_tasks(job_id)
    tasks = [
        TaskRecord(
            chunk_id=int(t.get("chunk_id", int(k))),
            label=t.get("label", f"chunk-{int(k):03d}"),
            status=t.get("status", "unknown"),
            worker=t.get("worker"),
            started_at=t.get("started_at"),
            finished_at=t.get("finished_at"),
            duration_ms=t.get("duration_ms"),
            attempts=int(t.get("attempts", 1)),
        )
        for k, t in sorted(raw_tasks.items(), key=lambda kv: int(kv[0]))
    ]

    events = [
        EventRecord(**e)
        for e in redis_client.get_events(job_id)
    ]

    return JobDetailResponse(
        job=_to_summary(job_id, meta),
        tasks=tasks,
        events=events,
    )