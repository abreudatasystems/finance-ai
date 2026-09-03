"""Um relatório de um ano tem de conter esse ano.

A página de relatórios ganhou um selector de ano fiscal, mas o gráfico vinha
de uma janela dos últimos seis meses: escolher 2025 mudava o rótulo e o nome
do ficheiro descarregado, e os números continuavam a ser os do ano corrente.
Um CSV chamado `relatorio-financeiro-2025.csv` com dados de 2026 é pior do
que não ter selector nenhum.
"""


def _book(tenant, kind: str, amount: float, when: str):
    return tenant.book(kind, amount, date=when, category=tenant.category(kind))


def _summary(tenant, query: str = "") -> list:
    response = tenant.get("/api/v1/dashboard/summary" + query)
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Um ano é um ano
# ---------------------------------------------------------------------------

def test_a_year_gives_that_year_whole(tenant):
    rows = _summary(tenant, "?year=2026")

    assert len(rows) == 12
    assert [r["period"] for r in rows] == [f"2026-{m:02d}" for m in range(1, 13)]
    assert rows[0]["month"] == "Jan" and rows[-1]["month"] == "Dez"


def test_a_year_only_carries_its_own_documents(tenant):
    _book(tenant, "income", 1230.00, "2026-03-10")
    _book(tenant, "income", 4920.00, "2025-03-10")

    de_2026 = {r["period"]: r for r in _summary(tenant, "?year=2026")}
    de_2025 = {r["period"]: r for r in _summary(tenant, "?year=2025")}

    # 1 230,00 com IVA a 23% são 1 000,00 de base; o resultado é sem IVA.
    assert de_2026["2026-03"]["Entradas"] == 1000.00
    assert de_2025["2025-03"]["Entradas"] == 4000.00
    # E o ano de um não aparece no outro.
    assert de_2026["2026-01"]["Entradas"] == 0.0
    assert sum(r["Entradas"] for r in _summary(tenant, "?year=2024")) == 0.0


def test_without_a_year_it_is_still_the_rolling_window(tenant):
    """O painel continua a querer "como temos estado", não um ano fiscal."""
    rows = _summary(tenant)

    assert len(rows) == 6
    assert all("period" in r for r in rows)


def test_the_window_length_is_still_configurable(tenant):
    assert len(_summary(tenant, "?months=3")) == 3


# ---------------------------------------------------------------------------
# Cada linha diz de que mês é
# ---------------------------------------------------------------------------

def test_every_row_names_its_own_month(tenant):
    """O nome curto repete-se entre anos; sem o período, dois "Jan" eram
    indistinguíveis numa janela maior do que doze meses."""
    rows = _summary(tenant, "?months=14")

    periods = [r["period"] for r in rows]
    assert len(periods) == len(set(periods)) == 14


def test_a_nonsense_year_is_refused(tenant):
    assert tenant.get("/api/v1/dashboard/summary?year=99").status_code == 400
    assert tenant.get("/api/v1/dashboard/summary?year=9999").status_code == 400


def test_another_company_is_not_in_the_report(tenant, other_tenant):
    _book(other_tenant, "income", 12300.00, "2026-05-10")

    rows = _summary(tenant, "?year=2026")
    assert sum(r["Entradas"] for r in rows) == 0.0
