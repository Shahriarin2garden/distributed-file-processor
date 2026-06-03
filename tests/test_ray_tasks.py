"""Unit tests for process_chunk Ray remote function (runs in local Ray mode)."""
import math
import tempfile

import pandas as pd
import pytest
import ray

from app.services.ray_tasks import process_chunk


def _write_csv(rows: list[dict]) -> str:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    pd.DataFrame(rows).to_csv(tmp.name, index=False)
    return tmp.name


class TestProcessChunkSum:
    def test_sum_integer_column(self):
        path = _write_csv([{"amount": 100}, {"amount": 200}, {"amount": 300}])
        result = ray.get(process_chunk.remote(path, "sum", "amount"))
        assert result == {"value": 600.0, "count": None}

    def test_sum_float_column(self):
        path = _write_csv([{"val": 1.5}, {"val": 2.5}])
        result = ray.get(process_chunk.remote(path, "sum", "val"))
        assert math.isclose(result["value"], 4.0)

    def test_sum_mixed_types_coerces(self):
        """Non-numeric values should be coerced to NaN (excluded from sum)."""
        path = _write_csv([{"x": "10"}, {"x": "bad"}, {"x": "20"}])
        result = ray.get(process_chunk.remote(path, "sum", "x"))
        assert result["value"] == 30.0


class TestProcessChunkMean:
    def test_mean_returns_sum_and_count(self):
        path = _write_csv([{"v": 10.0}, {"v": 20.0}, {"v": 30.0}])
        result = ray.get(process_chunk.remote(path, "mean", "v"))
        assert result["value"] == 60.0  # partial sum
        assert result["count"] == 3

    def test_mean_excludes_nan(self):
        path = _write_csv([{"v": 10.0}, {"v": "nan"}, {"v": 20.0}])
        result = ray.get(process_chunk.remote(path, "mean", "v"))
        assert result["count"] == 2  # NaN excluded


class TestProcessChunkFilter:
    def test_filter_count_match(self):
        path = _write_csv(
            [
                {"cat": "A"},
                {"cat": "B"},
                {"cat": "A"},
                {"cat": "C"},
            ]
        )
        result = ray.get(process_chunk.remote(path, "filter", "cat", "A"))
        assert result == {"value": 2.0, "count": None}

    def test_filter_no_match(self):
        path = _write_csv([{"cat": "A"}, {"cat": "B"}])
        result = ray.get(process_chunk.remote(path, "filter", "cat", "Z"))
        assert result["value"] == 0.0

    def test_filter_missing_filter_value_raises(self):
        path = _write_csv([{"cat": "A"}])
        with pytest.raises(ray.exceptions.RayTaskError):
            ray.get(process_chunk.remote(path, "filter", "cat", None))


class TestProcessChunkErrors:
    def test_missing_column_raises(self):
        path = _write_csv([{"amount": 100}])
        with pytest.raises(ray.exceptions.RayTaskError):
            ray.get(process_chunk.remote(path, "sum", "nonexistent"))

    def test_unknown_operation_raises(self):
        path = _write_csv([{"x": 1}])
        with pytest.raises(ray.exceptions.RayTaskError):
            ray.get(process_chunk.remote(path, "unknown_op", "x"))
