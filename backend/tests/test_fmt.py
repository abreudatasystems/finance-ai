"""Formatação pt-PT de valores e datas no texto mostrado às pessoas."""

from datetime import date, datetime
from decimal import Decimal

from app.core.fmt import data, eur

NB = " "


def test_eur_thousands_and_decimal_comma():
    assert eur(Decimal("14394.60")) == f"14{NB}394,60{NB}€"
    assert eur(9660.53) == f"9{NB}660,53{NB}€"
    assert eur(1234567.891) == f"1{NB}234{NB}567,89{NB}€"


def test_eur_small_and_int():
    assert eur(0) == f"0,00{NB}€"
    assert eur(5) == f"5,00{NB}€"
    assert eur(999.999) == f"1{NB}000,00{NB}€"


def test_eur_negative_and_none():
    assert eur(-1517.61) == f"-1{NB}517,61{NB}€"
    assert eur(None) == f"0,00{NB}€"


def test_eur_rounds_half_up():
    assert eur(Decimal("0.005")) == f"0,01{NB}€"
    assert eur(2.675) == f"2,68{NB}€"


def test_eur_other_symbol():
    assert eur(10, "$") == f"10,00{NB}$"


def test_data_formats():
    assert data("2026-04-03") == "03/04/2026"
    assert data("2026-04-03T10:20:00") == "03/04/2026"
    assert data(date(2026, 4, 3)) == "03/04/2026"
    assert data(datetime(2026, 4, 3, 10, 20)) == "03/04/2026"


def test_data_leaves_other_values_alone():
    assert data(None) == "—"
    assert data("2026-01") == "2026-01"
    assert data("amanhã") == "amanhã"
    assert data("2026-13-45") == "2026-13-45"
