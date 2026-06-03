import os
from pathlib import Path
from app.config import settings
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class StorageService:
    def __init__(self):
        self.storage_type = settings.storage_type
        self.base_path = Path(settings.storage_path)
        self.raw_path = self.base_path / "raw"
        self.chunks_path = self.base_path / "chunks"
        self._ensure_directories()
    
    def _ensure_directories(self):
        self.raw_path.mkdir(parents=True, exist_ok=True)
        self.chunks_path.mkdir(parents=True, exist_ok=True)
    
    async def save_uploaded_file(self, job_id: str, file_data: bytes, extension: str = "csv") -> str:
        file_path = self.raw_path / f"{job_id}.{extension}"
        with open(file_path, "wb") as f:
            f.write(file_data)
        logger.info(f"Saved file for job {job_id} at {file_path}")
        return str(file_path)
    
    def get_raw_file_path(self, job_id: str, extension: str = "csv") -> str:
        return str(self.raw_path / f"{job_id}.{extension}")
    
    def get_chunk_path(self, job_id: str, chunk_id: int) -> str:
        chunk_dir = self.chunks_path / job_id
        chunk_dir.mkdir(parents=True, exist_ok=True)
        return str(chunk_dir / f"chunk_{chunk_id}.csv")
    
    def cleanup_chunks(self, job_id: str):
        chunk_dir = self.chunks_path / job_id
        if chunk_dir.exists():
            for file in chunk_dir.glob("*"):
                file.unlink()
            chunk_dir.rmdir()
            logger.info(f"Cleaned up chunks for job {job_id}")

storage_service = StorageService()
