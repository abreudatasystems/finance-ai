"""Sentences the API writes read like the figures beside them (pt-PT)."""

from decimal import Decimal

from app.core.formatting import eur, num, pt_date

NBSP = " "


def test_money_is_grouped_and_uses_a_decimal_comma():
    assert eur(14394.6) == f"14{NBSP}394,60{NBSP}€"
    assert eur(Decimal("1234567.891")) == f"1{NBSP}234{NBSP}567,89{NBSP}€"
    assert eur(-212.5) == f"-212,50{NBSP}€"
    assert eur(0) == f"0,00{NBSP}€"
    assert eur(None) == f"0,00{NBSP}€"


def test_four_digit_amounts_are_grouped_too():
    # Intl's pt-PT default leaves "9660,53" ungrouped; the app groups always.
    assert num(9660.53) == f"9{NBSP}660,53"


def test_dates_read_day_first():
    assert pt_date("2026-04-03") == "03/04/2026"
    assert pt_date("2026-04-03T10:00:00") == "03/04/2026"
    assert pt_date("2026-T4") == "2026-T4"
    assert pt_date(None) == ""


def test_an_alert_speaks_the_same_format(tenant):
    tenant.book("income", 14394.60, date="2026-01-10", due_date="2026-02-10",
                category=tenant.category("income"))
    alerts = tenant.get("/api/v1/alerts/").json()["alertas"]
    late = next(a for a in alerts if a["kind"] == "recebimentos_vencidos")
    assert f"14{NBSP}394,60{NBSP}€" in late["description"]
    assert "10/02/2026" in late["description"]
