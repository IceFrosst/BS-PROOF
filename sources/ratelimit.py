"""Per-domain token bucket. The bottleneck is never the model."""
from __future__ import annotations
import time
from collections import defaultdict

class TokenBucket:
    def __init__(self, rate: float, capacity: float):
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.updated = time.monotonic()

    def take(self, n: float = 1.0) -> float:
        now = time.monotonic()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now
        if self.tokens >= n:
            self.tokens -= n
            return 0.0
        wait = (n - self.tokens) / self.rate
        self.tokens = 0.0
        return wait

_buckets: dict[str, TokenBucket] = {}

def wait_for(domain: str, rate: float = 3.0, capacity: float = 5.0) -> None:
    if domain not in _buckets:
        _buckets[domain] = TokenBucket(rate, capacity)
    delay = _buckets[domain].take()
    if delay > 0:
        time.sleep(delay)
