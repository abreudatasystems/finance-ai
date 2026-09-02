"""Throttling for failed logins.

Password guessing is cheap when every attempt costs the attacker nothing. This
makes it cost time, without ever locking a real person out permanently:

* attempts are counted per account within a window;
* after the threshold, the account refuses logins for a few minutes and says
  exactly how long — a lockout with no end time is indistinguishable from a
  broken product;
* a successful login clears the count, so the person who mistyped twice and
  then got it right is not punished afterwards.

State is in memory, which is right for a single process and honest about its
limits: with several workers this becomes per-worker, and the moment there is
a Redis in the deployment this module is where it goes.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

#: How many failures before the door closes.
MAX_ATTEMPTS = 5
#: Failures older than this stop counting.
WINDOW_SECONDS = 15 * 60
#: How long the door stays closed once it does.
LOCK_SECONDS = 5 * 60


@dataclass
class _Record:
    failures: list = field(default_factory=list)
    locked_until: float = 0.0


_lock = threading.Lock()
_records: dict[str, _Record] = {}


def _key(identifier: str) -> str:
    return (identifier or "").strip().lower()


def seconds_locked(identifier: str, now: float | None = None) -> int:
    """How long this account is barred for, or 0 when it is not."""
    now = now or time.time()
    with _lock:
        record = _records.get(_key(identifier))
        if not record or record.locked_until <= now:
            return 0
        return int(record.locked_until - now) + 1


def register_failure(identifier: str, now: float | None = None) -> int:
    """Count one failed attempt; returns how many remain before the lock."""
    now = now or time.time()
    key = _key(identifier)
    with _lock:
        record = _records.setdefault(key, _Record())
        record.failures = [t for t in record.failures if now - t < WINDOW_SECONDS]
        record.failures.append(now)
        if len(record.failures) >= MAX_ATTEMPTS:
            record.locked_until = now + LOCK_SECONDS
            record.failures = []
            return 0
        return MAX_ATTEMPTS - len(record.failures)


def register_success(identifier: str) -> None:
    """A correct password wipes the slate — mistyping twice is not suspicious."""
    with _lock:
        _records.pop(_key(identifier), None)


def reset() -> None:
    """Used by the tests; there is no reason to call this in the app."""
    with _lock:
        _records.clear()
