import ray
from typing import List, Tuple

@ray.remote
class ResultAggregator:
    def __init__(self, operation: str):
        self.operation = operation
        self.partials = []
        self.counts = []  # For mean calculation
    
    def add_result(self, value):
        if self.operation == "mean" and isinstance(value, tuple):
            total, count = value
            self.partials.append(total)
            self.counts.append(count)
        else:
            self.partials.append(value)
    
    def get_final(self) -> float:
        if not self.partials:
            return 0.0
        
        if self.operation == "sum":
            return sum(self.partials)
        elif self.operation == "mean":
            total_sum = sum(self.partials)
            total_count = sum(self.counts)
            return total_sum / total_count if total_count > 0 else 0.0
        elif self.operation == "filter":
            return sum(self.partials)
        else:
            return self.partials[0] if self.partials else 0.0
