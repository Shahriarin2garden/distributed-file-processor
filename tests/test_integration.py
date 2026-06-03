"""
Integration tests: full upload → process → status → result pipeline.

Requirements:
- Redis running (REDIS_URL env var)
- Ray initialized in local mode (conftest.py fixture)
- FastAPI TestClient (background tasks run synchronously after response)
"""
import math
import time
import pytest

from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def _wait_for_status(client: TestClient, job_id: str, timeout: int = 30) -> dict:
    """Poll status until completed/failed or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get(f"/api/v1/status/{job_id}")
        assert r.status_code == 200
        data = r.json()
        if data["status"] in ("completed", "failed"):
            return data
        time.sleep(0.5)
    return client.get(f"/api/v1/status/{job_id}").json()


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"


class TestUploadValidation:
    def test_missing_fields_returns_422(self, client):
        r = client.post("/api/v1/upload")
        assert r.status_code == 422

    def test_empty_file_returns_400(self, client):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount"},
            files={"file": ("empty.csv", b"", "text/csv")},
        )
        assert r.status_code == 400

    def test_unsupported_content_type_returns_415(self, client):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount"},
            files={"file": ("data.xlsx", b"binary", "application/vnd.ms-excel")},
        )
        assert r.status_code == 415

    def test_filter_missing_filter_value_returns_400(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "filter", "column": "category"},
            files={"file": ("data.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 400

    def test_invalid_chunk_size_returns_400(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "0"},
            files={"file": ("data.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 400


class TestStatusNotFound:
    def test_unknown_job_returns_404(self, client):
        r = client.get("/api/v1/status/00000000-0000-0000-0000-000000000000")
        assert r.status_code == 404


class TestFullPipelineSum:
    def test_sum_pipeline(self, client, sample_csv_bytes):
        # upload
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("test.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 201
        job_id = r.json()["job_id"]
        assert r.json()["status"] == "uploaded"

        # process
        r = client.post(f"/api/v1/process/{job_id}")
        assert r.status_code == 202

        # wait
        status = _wait_for_status(client, job_id)
        assert status["status"] == "completed", f"Job failed: {status.get('error_message')}"

        # result — 100+200+300+400+500 = 1500
        r = client.get(f"/api/v1/result/{job_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["operation"] == "sum"
        assert data["column"] == "amount"
        assert math.isclose(data["result"], 1500.0, rel_tol=1e-6)


class TestFullPipelineMean:
    def test_mean_pipeline(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "mean", "column": "amount", "chunk_size_rows": "3"},
            files={"file": ("test.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 201
        job_id = r.json()["job_id"]

        client.post(f"/api/v1/process/{job_id}")
        status = _wait_for_status(client, job_id)
        assert status["status"] == "completed", status.get("error_message")

        r = client.get(f"/api/v1/result/{job_id}")
        assert r.status_code == 200
        # mean of [100,200,300,400,500] = 300
        assert math.isclose(r.json()["result"], 300.0, rel_tol=1e-6)


class TestFullPipelineFilter:
    def test_filter_pipeline(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={
                "operation": "filter",
                "column": "category",
                "filter_value": "A",
                "chunk_size_rows": "3",
            },
            files={"file": ("test.csv", sample_csv_bytes, "text/csv")},
        )
        assert r.status_code == 201
        job_id = r.json()["job_id"]

        client.post(f"/api/v1/process/{job_id}")
        status = _wait_for_status(client, job_id)
        assert status["status"] == "completed", status.get("error_message")

        r = client.get(f"/api/v1/result/{job_id}")
        assert r.status_code == 200
        # 2 rows have category == "A"
        assert r.json()["result"] == 2.0


class TestFullPipelineJSON:
    def test_json_pipeline_sum(self, client, sample_json_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount", "chunk_size_rows": "2"},
            files={"file": ("data.json", sample_json_bytes, "application/json")},
        )
        assert r.status_code == 201
        job_id = r.json()["job_id"]

        client.post(f"/api/v1/process/{job_id}")
        status = _wait_for_status(client, job_id)
        assert status["status"] == "completed", status.get("error_message")

        r = client.get(f"/api/v1/result/{job_id}")
        assert r.status_code == 200
        # 100+200+300 = 600
        assert math.isclose(r.json()["result"], 600.0, rel_tol=1e-6)


class TestDoubleProcess:
    def test_cannot_reprocess_completed_job(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount"},
            files={"file": ("test.csv", sample_csv_bytes, "text/csv")},
        )
        job_id = r.json()["job_id"]
        client.post(f"/api/v1/process/{job_id}")
        _wait_for_status(client, job_id)
        # second process call must be rejected
        r = client.post(f"/api/v1/process/{job_id}")
        assert r.status_code == 400


class TestResultBeforeCompletion:
    def test_result_on_uploaded_job_returns_400(self, client, sample_csv_bytes):
        r = client.post(
            "/api/v1/upload",
            data={"operation": "sum", "column": "amount"},
            files={"file": ("test.csv", sample_csv_bytes, "text/csv")},
        )
        job_id = r.json()["job_id"]
        r = client.get(f"/api/v1/result/{job_id}")
        assert r.status_code == 400
