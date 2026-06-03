"""Basic API smoke tests (no Ray, no Redis required for these)."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_upload_missing_fields_returns_422(client):
    response = client.post("/api/v1/upload")
    assert response.status_code == 422


def test_upload_empty_file_returns_400(client, sample_csv_bytes):
    response = client.post(
        "/api/v1/upload",
        data={"operation": "sum", "column": "amount"},
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert response.status_code == 400


def test_upload_unsupported_type_returns_415(client):
    response = client.post(
        "/api/v1/upload",
        data={"operation": "sum", "column": "amount"},
        files={"file": ("data.xlsx", b"PK...", "application/vnd.ms-excel")},
    )
    assert response.status_code == 415


def test_status_not_found(client):
    response = client.get("/api/v1/status/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_result_not_found(client):
    response = client.get("/api/v1/result/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_process_not_found(client):
    response = client.post("/api/v1/process/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
