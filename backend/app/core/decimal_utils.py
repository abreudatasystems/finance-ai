"""Decimal conversion utilities — one place for the rounding rules.

The function _d() was duplicated across transactions, settlements, and
reconciliation with subtly different behaviour when the value is None:
  - transactions.py  : returns None
  - settlements.py   : returns Decimal("0.00")
  - reconciliation.py: returns Decimal("0.00")

Two named helpers make the intent explicit at every call site.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

CENTS = Decimal("0.01")


def d_or_none(value) -> Optional[Decimal]:
    """Convert to a 2-dp Decimal, or None when the value is absent."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def d_or_zero(value) -> Decimal:
    """Convert to a 2-dp Decimal, defaulting to zero when the value is absent."""
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)
