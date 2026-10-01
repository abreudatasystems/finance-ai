"""Listar não é o mesmo que somar.

A listagem devolvia a tabela inteira, sempre. Com um ano de movimentos reais
são milhares de linhas a atravessar a rede para o ecrã desenhar trinta.

O que estes testes fixam é a parte que se pode fazer mal: pôr um limite por
omissão. Quem soma — o total do painel, a margem de um cliente — passaria a
somar uma fatia sem saber, e um número errado com ar de certo é o pior defeito
que um produto de contabilidade pode ter. Por isso a paginação é opcional, e
o total do conjunto viaja à parte, num cabeçalho.
"""

import pytest


@pytest.fixture
def ledger(tenant):
    """Doze lançamentos, com datas distintas para a ordem ser verificável."""
    for day in range(1, 13):
        tenant.book("expense", 10.0 * day, date=f"2026-06-{day:02d}",
                    description=f"Movimento {day:02d}")
    return tenant


def _rows(response) -> list:
    body = response.json()
    return body if isinstance(body, list) else body.get("items", [])


# ---------------------------------------------------------------------------
# Sem pedido, nada muda
# ---------------------------------------------------------------------------

def test_without_a_limit_everything_comes_back(ledger):
    """Quem já chamava isto para somar não pode passar a somar uma fatia."""
    response = ledger.get("/api/v1/transactions/")

    assert response.status_code == 200
    assert len(_rows(response)) == 12


def test_the_total_travels_in_a_header(ledger):
    response = ledger.get("/api/v1/transactions/?limit=5")

    assert response.headers["X-Total-Count"] == "12"
    assert len(_rows(response)) == 5


# ---------------------------------------------------------------------------
# As páginas cobrem o conjunto, uma vez cada
# ---------------------------------------------------------------------------

def test_the_pages_cover_everything_without_repeating(ledger):
    seen = []
    for offset in (0, 5, 10):
        seen += [row["id"] for row in _rows(ledger.get(
            f"/api/v1/transactions/?limit=5&offset={offset}"))]

    assert len(seen) == 12
    assert len(set(seen)) == 12


def test_the_order_is_stable_across_pages(ledger):
    """Duas linhas no mesmo dia não podem trocar de página entre pedidos.

    Ordenar só por data deixa a ordem ao critério da base de dados quando as
    datas empatam — e uma linha que muda de página é uma linha que aparece
    duas vezes ou nenhuma.
    """
    ledger.book("expense", 500.0, date="2026-06-01", description="Empate A")
    ledger.book("expense", 600.0, date="2026-06-01", description="Empate B")

    first = [row["id"] for row in _rows(ledger.get("/api/v1/transactions/?limit=14"))]
    again = [row["id"] for row in _rows(ledger.get("/api/v1/transactions/?limit=14"))]

    assert first == again


def test_the_newest_comes_first(ledger):
    rows = _rows(ledger.get("/api/v1/transactions/?limit=3"))

    assert [row["date"] for row in rows] == ["2026-06-12", "2026-06-11", "2026-06-10"]


def test_an_offset_past_the_end_is_empty_not_an_error(ledger):
    response = ledger.get("/api/v1/transactions/?limit=5&offset=99")

    assert response.status_code == 200
    assert _rows(response) == []
    assert response.headers["X-Total-Count"] == "12"


# ---------------------------------------------------------------------------
# O total é do conjunto, não da página
# ---------------------------------------------------------------------------

def test_the_header_counts_the_filter_not_the_page(ledger):
    ledger.book("income", 900.0, date="2026-06-20")

    response = ledger.get("/api/v1/transactions/?type=expense&limit=2")

    assert response.headers["X-Total-Count"] == "12"    # a receita não conta
    assert len(_rows(response)) == 2
    assert all(row["type"] == "expense" for row in _rows(response))


def test_a_page_never_crosses_into_another_company(ledger, other_tenant):
    other_tenant.book("expense", 77.0, date="2026-06-05")

    response = ledger.get("/api/v1/transactions/?limit=100")

    assert response.headers["X-Total-Count"] == "12"
    assert all(row["company_id"] == ledger.company_id for row in _rows(response))


# ---------------------------------------------------------------------------
# Limites do próprio limite
# ---------------------------------------------------------------------------

def test_an_absurd_page_size_is_refused(ledger):
    """Um limite sem tecto seria o problema outra vez, com mais passos."""
    assert ledger.get("/api/v1/transactions/?limit=100000").status_code == 422


def test_a_negative_offset_is_refused(ledger):
    assert ledger.get("/api/v1/transactions/?offset=-1").status_code == 422
