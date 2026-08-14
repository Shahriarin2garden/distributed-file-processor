import json
import pandas as pd

from app.services.storage import storage_service
from app.utils.logger import setup_logger

logger = setup_logger(__name__)


class ChunkerService:

    # ---------- CSV ----------

    def split_csv(self, file_path: str, job_id: str, chunk_size: int) -> list[str]:
        chunk_paths: list[str] = []
        chunk_id = 0
        try:
            for chunk_df in pd.read_csv(
                file_path, chunksize=chunk_size, low_memory=False, encoding="utf-8"
            ):
                chunk_path = storage_service.get_chunk_path(job_id, chunk_id)
                chunk_df.to_csv(chunk_path, index=False)
                chunk_paths.append(chunk_path)
                logger.info(f"CSV chunk {chunk_id}: {len(chunk_df)} rows → {chunk_path}")
                chunk_id += 1
        except UnicodeDecodeError:
            # Retry with latin-1 for files with non-UTF-8 encoding
            logger.warning(f"UTF-8 decode failed for {file_path}, retrying with latin-1")
            for chunk_df in pd.read_csv(
                file_path, chunksize=chunk_size, low_memory=False, encoding="latin-1"
            ):
                chunk_path = storage_service.get_chunk_path(job_id, chunk_id)
                chunk_df.to_csv(chunk_path, index=False)
                chunk_paths.append(chunk_path)
                chunk_id += 1
        return chunk_paths

    def inspect_csv(self, file_path: str, chunk_size: int, sample_rows: int = 8) -> dict:
        """Return {row_count, columns, sample, estimated_chunks} in a single pass."""
        columns: list[str] = []
        sample: list[dict] = []
        total_rows = 0
        try:
            reader = pd.read_csv(
                file_path, chunksize=chunk_size, low_memory=False, encoding="utf-8"
            )
            for chunk_df in reader:
                if not columns:
                    columns = list(chunk_df.columns)
                total_rows += len(chunk_df)
                if len(sample) < sample_rows:
                    sample.extend(chunk_df.head(sample_rows - len(sample)).to_dict("records"))
        except UnicodeDecodeError:
            reader = pd.read_csv(
                file_path, chunksize=chunk_size, low_memory=False, encoding="latin-1"
            )
            for chunk_df in reader:
                if not columns:
                    columns = list(chunk_df.columns)
                total_rows += len(chunk_df)
                if len(sample) < sample_rows:
                    sample.extend(chunk_df.head(sample_rows - len(sample)).to_dict("records"))
        except Exception:
            logger.exception(f"Error inspecting CSV {file_path}")
            return {"row_count": None, "columns": [], "sample": [], "estimated_chunks": 1}

        estimated = max((total_rows + chunk_size - 1) // chunk_size, 1) if total_rows else 1
        return {
            "row_count": total_rows,
            "columns": columns,
            "sample": sample[:sample_rows],
            "estimated_chunks": estimated,
        }

    def estimate_chunks(self, file_path: str, chunk_size: int) -> int:
        try:
            with open(file_path, encoding="utf-8", errors="replace") as fh:
                total_rows = sum(1 for _ in fh) - 1  # subtract header
            total_rows = max(total_rows, 0)
            return max((total_rows + chunk_size - 1) // chunk_size, 1)
        except Exception:
            logger.exception(f"Error estimating chunks for {file_path}")
            return 1

    # ---------- JSON ----------

    def split_json(self, file_path: str, job_id: str, chunk_size: int) -> list[str]:
        """Split a JSON array or JSON-Lines file into CSV chunks for uniform processing."""
        records = self._load_json_records(file_path)
        if not records:
            raise ValueError(f"No records found in JSON file: {file_path}")

        chunk_paths: list[str] = []
        for chunk_id, offset in enumerate(range(0, len(records), chunk_size)):
            chunk = records[offset:offset + chunk_size]
            chunk_path = storage_service.get_chunk_path(job_id, chunk_id)
            pd.DataFrame(chunk).to_csv(chunk_path, index=False)
            chunk_paths.append(chunk_path)
            logger.info(f"JSON chunk {chunk_id}: {len(chunk)} records → {chunk_path}")
        return chunk_paths

    def inspect_json(self, file_path: str, chunk_size: int, sample_rows: int = 8) -> dict:
        try:
            records = self._load_json_records(file_path)
        except Exception:
            logger.exception(f"Error inspecting JSON {file_path}")
            return {"row_count": None, "columns": [], "sample": [], "estimated_chunks": 1}
        if not records:
            return {"row_count": 0, "columns": [], "sample": [], "estimated_chunks": 1}
        columns = sorted({k for rec in records[:200] for k in (rec.keys() if isinstance(rec, dict) else [])})
        estimated = max((len(records) + chunk_size - 1) // chunk_size, 1)
        return {
            "row_count": len(records),
            "columns": columns,
            "sample": records[:sample_rows],
            "estimated_chunks": estimated,
        }

    def estimate_json_chunks(self, file_path: str, chunk_size: int) -> int:
        try:
            records = self._load_json_records(file_path)
            return max((len(records) + chunk_size - 1) // chunk_size, 1)
        except Exception:
            logger.exception("Error estimating JSON chunks")
            return 1

    # ---------- internal ----------

    def _load_json_records(self, file_path: str) -> list[dict]:
        with open(file_path, encoding="utf-8") as fh:
            raw = fh.read()

        # Try JSON array first
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return [data]
        except json.JSONDecodeError:
            pass

        # Fall back to JSON-Lines
        records: list[dict] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    records.append(obj)
            except json.JSONDecodeError:
                continue
        return records


chunker_service = ChunkerService()
