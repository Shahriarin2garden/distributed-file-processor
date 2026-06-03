import shutil
from pathlib import Path

from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

_ALLOWED_EXTENSIONS = {"csv", "json"}


class StorageService:
    def __init__(self) -> None:
        self.storage_type = settings.storage_type
        self.base_path = Path(settings.storage_path)
        self.raw_path = self.base_path / "raw"
        self.chunks_path = self.base_path / "chunks"
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        self.raw_path.mkdir(parents=True, exist_ok=True)
        self.chunks_path.mkdir(parents=True, exist_ok=True)

    def save_uploaded_file(
        self, job_id: str, file_data: bytes, extension: str = "csv"
    ) -> str:
        if extension not in _ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file extension: {extension!r}")
        # job_id is a UUID — path is safe, no traversal possible
        file_path = self.raw_path / f"{job_id}.{extension}"
        file_path.write_bytes(file_data)
        logger.info(f"Saved raw file for job {job_id} ({len(file_data)} bytes)")
        return str(file_path)

    def get_raw_file_path(self, job_id: str, extension: str = "csv") -> str:
        return str(self.raw_path / f"{job_id}.{extension}")

    def get_chunk_path(self, job_id: str, chunk_id: int) -> str:
        chunk_dir = self.chunks_path / job_id
        chunk_dir.mkdir(parents=True, exist_ok=True)
        return str(chunk_dir / f"chunk_{chunk_id}.csv")

    def cleanup_chunks(self, job_id: str) -> None:
        chunk_dir = self.chunks_path / job_id
        if chunk_dir.exists():
            try:
                shutil.rmtree(chunk_dir)
                logger.info(f"Cleaned up chunks for job {job_id}")
            except Exception:
                logger.exception(f"Failed to clean up chunks for job {job_id}")
                raise

    def delete_raw_file(self, job_id: str, extension: str = "csv") -> None:
        raw_file = self.raw_path / f"{job_id}.{extension}"
        try:
            raw_file.unlink(missing_ok=True)
            logger.info(f"Deleted raw file for job {job_id}")
        except Exception:
            logger.exception(f"Failed to delete raw file for job {job_id}")


storage_service = StorageService()
