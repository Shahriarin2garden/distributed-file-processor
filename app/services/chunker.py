import pandas as pd
from pathlib import Path
from app.services.storage import storage_service
from app.utils.logger import setup_logger

logger = setup_logger(__name__)

class ChunkerService:
    def split_csv(self, file_path: str, job_id: str, chunk_size: int) -> list[str]:
        chunk_paths = []
        chunk_id = 0
        
        for chunk_df in pd.read_csv(file_path, chunksize=chunk_size):
            chunk_path = storage_service.get_chunk_path(job_id, chunk_id)
            chunk_df.to_csv(chunk_path, index=False)
            chunk_paths.append(chunk_path)
            logger.info(f"Created chunk {chunk_id} at {chunk_path} with {len(chunk_df)} rows")
            chunk_id += 1
        
        return chunk_paths
    
    def estimate_chunks(self, file_path: str, chunk_size: int) -> int:
        try:
            total_rows = sum(1 for _ in open(file_path)) - 1  # subtract header
            return (total_rows // chunk_size) + (1 if total_rows % chunk_size else 0)
        except Exception as e:
            logger.error(f"Error estimating chunks: {e}")
            return 1

chunker_service = ChunkerService()
