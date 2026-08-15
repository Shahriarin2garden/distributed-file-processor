"""Tests for the observability layer: system telemetry, job index/detail, events,
benchmarks, and the gated demo fault-injection endpoint.

Requires Redis (REDIS_URL) and Ray local mode (conftest fixture).
"""
import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _wait_for_job(client: TestClient, job_id: str, timeout: int = 30) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/v1/status/{job_id}")
        assert r.status_code == 200
        data = r.json()
        if data["status"] in ("completed", "failed"):
            return data
        time.sleep(0.3)
    return client.get(f"/api/v1/status/{job_id}").json()


class TestSystemEndpoint:
    def test_system_reports_structure(self, client):
        r = client.get("/api/v1/system")
        assert r.status_code == 200
        data = r.json()
        assert data["api_version"] == "1.0.0"
        assert data["ray_initialized"] is True
        assert isinstance(data["redis_connected"], bool)
        assert isinstance(data["nodes"], list)
        assert isinstance(data["total_cpus"], (int, float))
        assert isinstance(data["available_cpus"], (int, float))
        assert "active_jobs" in data and "queued_jobs" in data
        assert "workers_online" in data
        assert "max_concurrent_tasks" in data
        assert "recent_chunks_per_sec" in data

    def test_system_counts_jobs(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("telemetry.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 201
        sys_data = client.get("/api/v1/system").json()
        assert sys_data["queued_jobs"] >= 1


class TestJobIndex:
    def test_upload_indexes_job_and_detail(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("indexed.csv", sample_csv_bytes, "text/csv")},
        )
        job_id = r.json()["job_id"]

        listing = client.get("/api/v1/jobs").json()
        assert listing["total"] >= 1
        assert any(j["job_id"] == job_id for j in listing["jobs"])

        detail = client.get(f"/api/v1/jobs/{job_id}")
        assert detail.status_code == 200
        body = detail.json()
        assert body["job"]["status"] == "uploaded"
        assert body["job"]["row_count"] == 5
        assert "amount" in body["job"]["columns"]
        assert body["tasks"] == []
        assert body["events"] == []

    def test_job_detail_after_completion(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("traced.csv", sample_csv_bytes, "text/csv")},
        )
        job_id = r.json()["job_id"]
        client.post(f"/api/v1/process/{job_id}")
        status = _wait_for_job(client, job_id)
        assert status["status"] == "completed"

        detail = client.get(f"/api/v1/jobs/{job_id}").json()
        assert detail["job"]["duration_ms"] is not None
        assert detail["job"]["result"] == 1500.0
        # Two chunks (5 rows, chunk size 3) → two completed task records.
        tasks = detail["tasks"]
        assert len(tasks) == 2
        assert all(t["status"] == "completed" for t in tasks)
        assert all(t["duration_ms"] is not None for t in tasks)
        # Event log contains dispatch + completion records.
        kinds = {e["kind"] for e in detail["events"]}
        assert "dispatch" in kinds
        assert "complete" in kinds

    def test_job_filters(self, client, sample_csv_bytes):
        client.post(
            "/api/v1/upload",
            data={"operation": "mean", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("filter-me.csv", sample_csv_bytes, "text/csv")},
        )
        filtered = client.get("/api/v1/jobs?operation=mean").json()
        assert filtered["total"] >= 1
        assert all(j["operation"] == "mean" for j in filtered["jobs"])
        filter_jobs = client.get("/api/v1/jobs?operation=filter").json()
        assert all(j["operation"] == "filter" for j in filter_jobs["jobs"])
        # No test creates jobs with this operation, so it must be empty.
        assert client.get("/api/v1/jobs?operation=bogus").json()["total"] == 0

    def test_unknown_job_detail_404(self, client):
        r = client.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404


class TestBenchmark:
    def test_benchmark_runs_and_measures(self, client):
        r = client.post(
            "/api/v1/benchmark?rows=6000&chunk_size=1000&operation=sum"
        )
        assert r.status_code == 202
        benchmark_id = r.json()["benchmark_id"]

        deadline = time.time() + 60
        data = None
        while time.time() < deadline:
            data = client.get(f"/api/v1/benchmark/{benchmark_id}").json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.5)

        assert data is not None
        assert data["status"] == "completed", f"benchmark failed: {data.get('error')}"
        assert data["num_chunks"] == 6
        assert data["sequential_ms"] > 0
        assert data["distributed_ms"] > 0
        assert data["speedup"] is not None
        assert data["sequential_result"] == data["distributed_result"]
        assert data["rows"] == 6000

    def test_benchmark_list(self, client):
        listing = client.get("/api/v1/benchmark").json()
        assert isinstance(listing, list)
        assert all("benchmark_id" in b for b in listing)

    def test_benchmark_invalid_operation_400(self, client):
        r = client.post("/api/v1/benchmark?operation=bogus")
        assert r.status_code == 400


class TestBenchmarkStudy:
    def test_study_sweeps_sizes_and_verifies(self, client):
        r = client.post(
            "/api/v1/benchmark/study?operation=sum&chunk_size=1000&sizes=1000,2000,3000"
        )
        assert r.status_code == 202
        body = r.json()
        assert body["study_id"]
        assert body["status"] == "queued"
        assert body["sizes"] == [1000, 2000, 3000]

        deadline = time.time() + 90
        data = None
        while time.time() < deadline:
            data = client.get(f"/api/v1/benchmark/study/{body['study_id']}").json()
            if data["status"] in ("completed", "failed"):
                break
            time.sleep(0.5)

        assert data is not None
        assert data["status"] == "completed", f"study failed: {data.get('error')}"
        assert len(data["points"]) == 3
        for p in data["points"]:
            assert p["sequential_ms"] > 0
            assert p["distributed_ms"] > 0
            assert p["speedup"] is not None
            assert p["sequential_result"] == p["distributed_result"]
        assert data["notes"], "study should explain the measurements honestly"
        # crossover is computed from real data, so it may legitimately be null
        assert "crossover_rows" in data

    def test_study_rejects_too_many_sizes(self, client):
        r = client.post(
            "/api/v1/benchmark/study?operation=sum&sizes=1,2,3,4,5,6,7,8,9"
        )
        assert r.status_code == 400

    def test_study_rejects_out_of_range_sizes(self, client):
        r = client.post("/api/v1/benchmark/study?operation=sum&sizes=50,100")
        assert r.status_code == 400

    def test_study_rejects_invalid_operation(self, client):
        r = client.post("/api/v1/benchmark/study?operation=bogus&sizes=1000")
        assert r.status_code == 400

    def test_study_not_found(self, client):
        r = client.get("/api/v1/benchmark/study/does-not-exist")
        assert r.status_code == 404

    def test_study_list_returns_recent(self, client):
        listing = client.get("/api/v1/benchmark/study").json()
        assert isinstance(listing, list)
        assert all("study_id" in s and "sizes" in s for s in listing)


class TestInspect:
    def test_inspect_csv_returns_preview(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/inspect",
            data={"chunk_size_rows": "3"},
            files={"file": ("preview.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["row_count"] == 5
        assert "amount" in body["columns"]
        assert body["estimated_chunks"] == 2
        assert isinstance(body["sample"], list) and body["sample"]
        assert body["file_extension"] == "csv"

    def test_inspect_rejects_unsupported_type(self, client):
        r = client.post(
            "/api/v1/inspect",
            files={"file": ("notes.txt", b"hello", "text/x-markdown")},
        )
        assert r.status_code == 415

    def test_inspect_empty_file_400(self, client):
        r = client.post(
            "/api/v1/inspect",
            data={"chunk_size_rows": "3"},
            files={"file": ("empty.csv", b"", "text/csv")},
        )
        assert r.status_code == 400


class TestDemoFaultInjection:
    def test_disabled_by_default(self, client, sample_csv_bytes):
        from app.config import settings
        if settings.demo_mode:
            pytest.skip("DEMO_MODE is enabled in this environment")
        r = client.post(
            "/api/v1/demo/fault",
            data={"operation": "sum", "column": "amount"},
            files={"file": ("demo.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 403

    def test_demo_fault_retries_and_recovers(self, client, sample_csv_bytes, monkeypatch):
        from app.config import settings
        monkeypatch.setattr(settings, "demo_mode", True)
        r = client.post(
            "/api/v1/demo/fault",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("demo.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 201
        assert r.json()["demo"] is True
        job_id = r.json()["job_id"]

        client.post(f"/api/v1/process/{job_id}")
        status = _wait_for_job(client, job_id)
        assert status["status"] == "completed", status.get("error_message")

        detail = client.get(f"/api/v1/jobs/{job_id}").json()
        result = client.get(f"/api/v1/result/{job_id}").json()
        assert result["result"] == 1500.0

        kinds = [e["kind"] for e in detail["events"]]
        assert "fail" in kinds
        assert "retry" in kinds
        # The faulted chunk must show >1 attempts.
        assert any(t["attempts"] > 1 for t in detail["tasks"]), detail["tasks"]