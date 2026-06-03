"""Unit tests for ChunkerService (no Ray, no Redis required)."""
import json

import pandas as pd
import pytest

from app.services.chunker import ChunkerService


@pytest.fixture()
def chunker():
    return ChunkerService()


@pytest.fixture()
def csv_100_rows(tmp_path) -> str:
    path = tmp_path / "test.csv"
    df = pd.DataFrame({"col1": range(100), "col2": range(100, 200)})
    df.to_csv(path, index=False)
    return str(path)


@pytest.fixture()
def json_array_file(tmp_path) -> str:
    path = tmp_path / "test.json"
    records = [{"amount": i, "cat": "A" if i % 2 == 0 else "B"} for i in range(50)]
    path.write_text(json.dumps(records))
    return str(path)


@pytest.fixture()
def jsonl_file(tmp_path) -> str:
    path = tmp_path / "test.jsonl"
    lines = [json.dumps({"v": i}) for i in range(30)]
    path.write_text("\n".join(lines))
    return str(path)


class TestEstimateChunks:
    def test_exact_multiple(self, chunker, csv_100_rows):
        assert chunker.estimate_chunks(csv_100_rows, chunk_size=25) == 4

    def test_with_remainder(self, chunker, csv_100_rows):
        assert chunker.estimate_chunks(csv_100_rows, chunk_size=30) == 4  # ceil(100/30)

    def test_chunk_larger_than_file(self, chunker, csv_100_rows):
        assert chunker.estimate_chunks(csv_100_rows, chunk_size=200) == 1


class TestSplitCsv:
    def test_produces_correct_chunk_count(self, chunker, csv_100_rows, tmp_path):
        from app.services.storage import storage_service
        storage_service.chunks_path = tmp_path / "chunks"
        storage_service.chunks_path.mkdir(parents=True, exist_ok=True)

        chunks = chunker.split_csv(csv_100_rows, "job-test", chunk_size=30)
        # 100 rows / 30 = ceil → 4 chunks
        assert len(chunks) == 4

    def test_chunks_cover_all_rows(self, chunker, csv_100_rows, tmp_path):
        from app.services.storage import storage_service
        storage_service.chunks_path = tmp_path / "chunks"
        storage_service.chunks_path.mkdir(parents=True, exist_ok=True)

        chunks = chunker.split_csv(csv_100_rows, "job-rows", chunk_size=40)
        total = sum(len(pd.read_csv(c)) for c in chunks)
        assert total == 100


class TestSplitJson:
    def test_json_array_chunks(self, chunker, json_array_file, tmp_path):
        from app.services.storage import storage_service
        storage_service.chunks_path = tmp_path / "chunks"
        storage_service.chunks_path.mkdir(parents=True, exist_ok=True)

        chunks = chunker.split_json(json_array_file, "job-json", chunk_size=20)
        assert len(chunks) == 3  # ceil(50/20)
        total = sum(len(pd.read_csv(c)) for c in chunks)
        assert total == 50

    def test_jsonl_chunks(self, chunker, jsonl_file, tmp_path):
        from app.services.storage import storage_service
        storage_service.chunks_path = tmp_path / "chunks"
        storage_service.chunks_path.mkdir(parents=True, exist_ok=True)

        chunks = chunker.split_json(jsonl_file, "job-jsonl", chunk_size=10)
        assert len(chunks) == 3
        total = sum(len(pd.read_csv(c)) for c in chunks)
        assert total == 30
