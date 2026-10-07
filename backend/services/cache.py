import threading
import time
from typing import Any, Optional


class TTLCache:
    """Thread-safe in-memory TTL cache holding one value (the item list)."""

    def __init__(self, ttl_seconds: int):
        self.ttl = ttl_seconds
        self._data: Optional[Any] = None
        self._ts: float = 0.0
        self._lock = threading.Lock()

    def get(self) -> Optional[Any]:
        with self._lock:
            if self._data is not None and (time.time() - self._ts) < self.ttl:
                return self._data
            return None

    def set(self, value: Any) -> None:
        with self._lock:
            self._data = value
            self._ts = time.time()

    def age_seconds(self) -> Optional[float]:
        with self._lock:
            if self._ts == 0.0:
                return None
            return time.time() - self._ts
