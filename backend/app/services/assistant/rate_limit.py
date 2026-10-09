"""Tecto de pedidos à IA, em memória, por (empresa, utilizador).

Serve para limitar o custo, não para segurança: reinicia com o processo e
não é partilhado entre vários processos. Chega para um único servidor.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, Optional, Tuple

_lock = threading.Lock()
_hits: Dict[Tuple[str, str], Deque[float]] = {}


def allow(company_id: str, user_id: str, limit: int, window_seconds: int,
          now: Optional[float] = None) -> bool:
    """Regista um pedido e diz se cabe no limite. Os recusados não contam."""
    if limit <= 0:
        return True
    now = time.monotonic() if now is None else now
    key = (company_id or "", user_id or "")
    with _lock:
        hits = _hits.setdefault(key, deque())
        while hits and now - hits[0] >= window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


def reset() -> None:
    with _lock:
        _hits.clear()
