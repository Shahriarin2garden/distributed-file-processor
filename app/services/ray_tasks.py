import ray
import pandas as pd
from typing import Optional


@ray.remote(max_retries=2, retry_exceptions=True)
def process_chunk(
    chunk_path: str,
    operation: str,
    column: str,
    filter_value: Optional[str] = None,
) -> dict:
    """
    Process a single CSV chunk. Always returns a dict so the return type is consistent.

    Schema:
      sum/filter -> {"value": float, "count": None}
      mean       -> {"value": float, "count": int}  (partial sum + row count for weighted agg)
    """
    df = pd.read_csv(chunk_path, low_memory=False)

    if column not in df.columns:
        raise KeyError(
            f"Column '{column}' not found in chunk. Available: {list(df.columns)}"
        )

    if operation == "sum":
        numeric = pd.to_numeric(df[column], errors="coerce")
        return {"value": float(numeric.sum()), "count": None}

    elif operation == "mean":
        numeric = pd.to_numeric(df[column], errors="coerce")
        return {"value": float(numeric.sum()), "count": int(numeric.count())}

    elif operation == "filter":
        if filter_value is None:
            raise ValueError("filter_value is required for filter operation")
        return {"value": float((df[column].astype(str) == str(filter_value)).sum()), "count": None}

    else:
        raise ValueError(f"Unknown operation: {operation!r}")
