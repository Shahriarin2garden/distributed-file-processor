import ray


@ray.remote
class ResultAggregator:
    """Stateful Ray actor that collects partial chunk results and returns final value."""

    def __init__(self, operation: str) -> None:
        self.operation = operation
        self.values: list[float] = []
        self.counts: list[int] = []

    def add_result(self, partial: dict) -> None:
        """
        partial schema: {"value": float, "count": int | None}
        """
        self.values.append(partial["value"])
        if partial["count"] is not None:
            self.counts.append(partial["count"])

    def get_final(self) -> float:
        if not self.values:
            return 0.0

        if self.operation == "sum":
            return sum(self.values)

        elif self.operation == "mean":
            total_sum = sum(self.values)
            total_count = sum(self.counts) if self.counts else len(self.values)
            return total_sum / total_count if total_count > 0 else 0.0

        elif self.operation == "filter":
            return sum(self.values)

        return self.values[0]
