import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_upload_missing_fields():
    response = client.post("/api/v1/upload")
    assert response.status_code == 422

def test_status_not_found():
    response = client.get("/api/v1/status/nonexistent-job-id")
    assert response.status_code == 404
