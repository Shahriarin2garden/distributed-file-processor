import pytest
import pandas as pd
from pathlib import Path
from app.services.chunker import chunker_service

def test_estimate_chunks():
    # Create test CSV
    test_file = Path("test_data.csv")
    df = pd.DataFrame({"col1": range(100), "col2": range(100, 200)})
    df.to_csv(test_file, index=False)
    
    chunks = chunker_service.estimate_chunks(str(test_file), chunk_size=30)
    assert chunks == 4  # 100 rows / 30 = 3.33 -> 4 chunks
    
    test_file.unlink()
