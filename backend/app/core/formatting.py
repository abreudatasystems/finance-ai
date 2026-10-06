"""How money and dates read in the sentences the API writes for people.

The frontend formats numbers with ``Intl.NumberFormat('pt-PT')``; a message
built here sits next to those figures on the same card, so it has to read
the same way — ``14 394,60 €``, not ``14394.60 €`` or ``14,394.60 €``.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Union

#: The separator pt-PT puts between thousands — a no-break space, so a figure
#: never wraps in the middle.
_GROUP = " "

Number = Union[int, float, Decimal, str, None]


def num(value: Number, decimals: int = 2) -> str:
    """``1234.5`` → ``1 234,50``."""
    amount = Decimal(str(value if value is not None else 0))
    quantum = Decimal(1).scaleb(-decimals)
    amount = amount.quantize(quantum, rounding=ROUND_HALF_UP)
    sign = "-" if amount < 0 else ""
    whole, _, cents = f"{abs(amount):f}".partition(".")
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    text = _GROUP.join(groups)
    return f"{sign}{text},{cents}" if decimals else f"{sign}{text}"


def eur(value: Number) -> str:
    """``1234.5`` → ``1 234,50 €``."""
    return f"{num(value)}{_GROUP}€"


def pt_date(value: Union[str, date, None]) -> str:
    """``2026-04-03`` → ``03/04/2026``; anything else comes back as it was."""
    if value is None:
        return ""
    text = value.isoformat() if isinstance(value, date) else str(value)
    try:
        parsed = date.fromisoformat(text[:10])
    except ValueError:
        return text
    return parsed.strftime("%d/%m/%Y")


def plural(count: int, singular: str, plural_form: str | None = None) -> str:
    """``plural(1, "conta")`` → ``conta``; ``plural(3, "conta")`` → ``contas``."""
    return singular if count == 1 else (plural_form or f"{singular}s")
