"""
Request limits for the public shop API: a sliding window of recent requests per key (visitor
IP or customer account) kept in this API instance's memory. With several instances each counts
on its own, which still stops abuse; login code limits are also counted in the database.
"""
import math
import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple
from fastapi import HTTPException, status

# Forget idle keys every this many requests, so memory stays small
SWEEP_EVERY = 1000


class SlidingWindowLimiter:
    def __init__(self):
        self._hits: Dict[str, Tuple[int, Deque[float]]] = {}
        self._lock = threading.Lock()
        self._calls = 0

    def hit(self, key: str, limit: int, window: int) -> int:
        """Count a request; 0 when allowed, else seconds until the next one is allowed"""
        now = time.monotonic()
        with self._lock:
            _, times = self._hits.setdefault(key, (window, deque()))
            while times and times[0] <= now - window:
                times.popleft()
            if len(times) >= limit:
                return max(1, math.ceil(times[0] + window - now))
            times.append(now)
            self._calls += 1
            if self._calls % SWEEP_EVERY == 0:
                self._sweep(now)
            return 0

    def _sweep(self, now: float) -> None:
        idle = [key for key, (window, times) in self._hits.items()
                if not times or times[-1] <= now - window]
        for key in idle:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def check(key: str, limit: int, window: int) -> None:
    """429 with Retry-After when the key is over its limit"""
    if limit <= 0:
        return
    retry_after = limiter.hit(key, limit, window)
    if retry_after:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"Too many requests. Please try again in {retry_after} seconds.",
                            headers={"Retry-After": str(retry_after)})
