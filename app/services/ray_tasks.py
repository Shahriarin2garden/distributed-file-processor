import ray
import pandas as pd
from typing import Optional


class SimulatedWorkerFailure(RuntimeError):
    """Raised by the demo fault-injection path to simulate a crashed worker."""


def process_chunk_impl(
    chunk_path: str,
    operation: str,
    column: str,
    filter_value: Optional[str] = None,
) -> dict:
    """
    Pure chunk-processing logic shared by all Ray variants.

    Returns:
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


@ray.remote(max_retries=2, retry_exceptions=True)
def process_chunk(
    chunk_path: str,
    operation: str,
    column: str,
    filter_value: Optional[str] = None,
) -> dict:
    """Process a single CSV chunk with Ray's built-in retries (max 2)."""
    return process_chunk_impl(chunk_path, operation, column, filter_value)


def _current_node_id() -> Optional[str]:
    try:
        node_id = ray.get_runtime_context().get_node_id()
        if isinstance(node_id, bytes):
            return node_id.hex()
        return str(node_id)
    except Exception:
        return None


@ray.remote(max_retries=2, retry_exceptions=True)
def process_chunk_tracked(
    chunk_path: str,
    operation: str,
    column: str,
    filter_value: Optional[str] = None,
) -> dict:
    """Process a chunk and attach the executing worker's node id for observability."""
    result = process_chunk_impl(chunk_path, operation, column, filter_value)
    result["worker"] = _current_node_id()
    return result


@ray.remote(max_retries=0)
def process_chunk_faulty(
    chunk_path: str,
    operation: str,
    column: str,
    filter_value: Optional[str] = None,
) -> dict:
    """
    Demo fault-injection task: always fails so the orchestrator can demonstrate
    task retry/recovery using the real Ray dispatch machinery. max_retries=0
    prevents Ray from swallowing the failure before the orchestrator observes it.
    """
    raise SimulatedWorkerFailure(
        "Simulated worker failure injected by demo fault-injection"
    )