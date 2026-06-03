import ray
import pandas as pd
from typing import Optional

@ray.remote(max_retries=2)
def process_chunk(chunk_path: str, operation: str, column: str, filter_value: Optional[str] = None) -> float:
    df = pd.read_csv(chunk_path)
    
    if operation == "sum":
        return float(df[column].sum())
    elif operation == "mean":
        return float(df[column].sum()), len(df)  # Return sum and count for aggregation
    elif operation == "filter":
        if filter_value is None:
            raise ValueError("filter_value required for filter operation")
        return float(len(df[df[column].astype(str) == str(filter_value)]))
    else:
        raise ValueError(f"Unknown operation: {operation}")
