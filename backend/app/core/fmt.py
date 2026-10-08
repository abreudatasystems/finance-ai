"""Valores e datas escritos como em Portugal, para o texto que as pessoas lêem.

Só para mensagens, títulos, descrições e cartas. Os campos de dados (montantes
e datas ISO no JSON, CSV, SAF-T) continuam em formato máquina: é o frontend
que os formata.

    eur(14394.6)          -> "14 394,60 €"
    eur(-1517.61)         -> "-1 517,61 €"
    data("2026-04-03")    -> "03/04/2026"
"""

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

# Espaço não separável: o valor nunca parte entre "14" e "394,60 €".
_NBSP = " "


def eur(value, simbolo: str = "€") -> str:
    """Um montante como "14 394,60 €" (milhares com espaço, vírgula decimal)."""
    if value is None or value == "":
        value = 0
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return str(value)
    amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if amount < 0 else ""
    whole, cents = f"{abs(amount):.2f}".split(".")
    groups = []
    while len(whole) > 3:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    groups.insert(0, whole)
    return f"{sign}{_NBSP.join(groups)},{cents}{_NBSP}{simbolo}"


def data(value) -> str:
    """Uma data como "03/04/2026". O que não for data vem como está."""
    if value is None:
        return "—"
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    text = str(value)
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        try:
            return date.fromisoformat(text[:10]).strftime("%d/%m/%Y")
        except ValueError:
            return text
    return text
