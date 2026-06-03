"""
Shared pytest fixtures.

Tests that exercise Ray use RAY_ADDRESS=local (set in CI env vars and pytest.ini).
Tests that exercise Redis expect REDIS_URL to point to a running instance (see CI service).
"""
import io
import pytest
import pandas as pd
import ray


@pytest.fixture(scope="session", autouse=True)
def init_ray():
    """Start Ray in local mode once per test session, shut it down after."""
    if not ray.is_initialized():
        ray.init(local_mode=True, ignore_reinit_error=True, include_dashboard=False)
    yield
    ray.shutdown()


@pytest.fixture()
def sample_csv_bytes() -> bytes:
    """Small CSV with 5 rows for fast tests."""
    df = pd.DataFrame(
        {
            "amount": [100.0, 200.0, 300.0, 400.0, 500.0],
            "category": ["A", "B", "A", "C", "B"],
            "value": [1.0, 2.0, 3.0, 4.0, 5.0],
        }
    )
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


@pytest.fixture()
def sample_json_bytes() -> bytes:
    """Small JSON array with 5 records."""
    import json

    records = [
        {"amount": 100.0, "category": "A"},
        {"amount": 200.0, "category": "B"},
        {"amount": 300.0, "category": "A"},
    ]
    return json.dumps(records).encode()
