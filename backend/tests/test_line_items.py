"""O catálogo de artigos ligado às linhas de um documento.

O catálogo guarda a taxa pelo nome ("Normal") porque as percentagens mudam por
lei e por região; a linha guarda a percentagem porque uma fatura de hoje tem
de continuar a mostrar a taxa de hoje para sempre. A tradução acontece uma vez,
quando a linha nasce, e é o que estes testes fixam.
"""


def _item(tenant, **extra):
    payload = {
        "kind": "product",
        "code": extra.pop("code", "ART-001"),
        "description": extra.pop("description", "Caderno A5"),
        "vat_rate": extra.pop("vat_rate", "Normal"),
        "price_1": extra.pop("price_1", 10.00),
        **extra,
    }
    response = tenant.post("/api/v1/items/", payload)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _lines(tenant, trx_id: str, lines: list):
    response = tenant.put(f"/api/v1/transactions/{trx_id}/lines", {"lines": lines})
    assert response.status_code == 200, response.text
    return response.json()


def _read(tenant, trx_id: str) -> list:
    return tenant.get(f"/api/v1/transactions/{trx_id}/lines").json()["linhas"]


# ---------------------------------------------------------------------------
# O catálogo propõe
# ---------------------------------------------------------------------------

def test_a_line_inherits_the_item_description_price_and_rate(tenant):
    item = _item(tenant, description="Caderno A5", price_1=10.00, vat_rate="Normal")
    trx = tenant.book("expense", 100.00)

    _lines(tenant, trx["id"], [{"item_id": item["id"], "quantity": 3}])
    line = _read(tenant, trx["id"])[0]

    assert line["description"] == "Caderno A5"
    assert line["unit_price"] == 10.00
    assert line["vat_rate"] == 23.0          # "Normal" no continente
    assert line["net_amount"] == 30.00
    assert line["vat_amount"] == 6.90
    assert line["gross_amount"] == 36.90


def test_the_named_rates_resolve_to_their_percentages(tenant):
    cases = {"Normal": 23.0, "Intermédia": 13.0, "Reduzida": 6.0, "Isenta": 0.0}
    for index, (name, expected) in enumerate(cases.items()):
        item = _item(tenant, code=f"ART-{index}", vat_rate=name, price_1=100.00)
        trx = tenant.book("expense", 100.00)
        _lines(tenant, trx["id"], [{"item_id": item["id"], "quantity": 1}])
        assert _read(tenant, trx["id"])[0]["vat_rate"] == expected, name


def test_a_price_that_includes_vat_is_brought_back_to_the_base(tenant):
    # 12,30 € com IVA a 23% é uma base de 10,00 €. Somar o IVA outra vez
    # inflacionaria o documento pela taxa.
    item = _item(tenant, price_1=12.30, price_includes_vat=True, vat_rate="Normal")
    trx = tenant.book("expense", 100.00)

    _lines(tenant, trx["id"], [{"item_id": item["id"], "quantity": 1}])
    line = _read(tenant, trx["id"])[0]

    assert line["unit_price"] == 10.00
    assert line["net_amount"] == 10.00
    assert line["gross_amount"] == 12.30


def test_the_line_keeps_the_item_it_came_from(tenant):
    item = _item(tenant, code="ART-042")
    trx = tenant.book("expense", 100.00)
    _lines(tenant, trx["id"], [{"item_id": item["id"], "quantity": 1}])

    line = _read(tenant, trx["id"])[0]
    assert line["item_id"] == item["id"]
    assert line["item_code"] == "ART-042"


# ---------------------------------------------------------------------------
# O documento decide
# ---------------------------------------------------------------------------

def test_what_the_line_says_beats_the_catalogue(tenant):
    item = _item(tenant, description="Caderno A5", price_1=10.00, vat_rate="Normal")
    trx = tenant.book("expense", 100.00)

    _lines(tenant, trx["id"], [{
        "item_id": item["id"], "description": "Caderno A5 (desconto)",
        "quantity": 2, "unit_price": 7.50, "vat_rate": 6,
    }])
    line = _read(tenant, trx["id"])[0]

    assert line["description"] == "Caderno A5 (desconto)"
    assert line["unit_price"] == 7.50
    assert line["vat_rate"] == 6.0
    assert line["net_amount"] == 15.00
    # E continua a saber de que artigo veio.
    assert line["item_id"] == item["id"]


def test_a_line_without_an_item_still_works(tenant):
    trx = tenant.book("expense", 100.00)
    _lines(tenant, trx["id"], [
        {"description": "Serviço avulso", "net_amount": 50.00, "vat_rate": 23},
    ])
    line = _read(tenant, trx["id"])[0]

    assert line["item_id"] is None
    assert line["net_amount"] == 50.00


def test_a_line_with_neither_item_nor_description_is_refused(tenant):
    trx = tenant.book("expense", 100.00)
    response = tenant.put(f"/api/v1/transactions/{trx['id']}/lines",
                          {"lines": [{"net_amount": 10.00}]})
    assert response.status_code == 400
    assert "descrição" in response.json()["detail"]


def test_an_unknown_item_is_refused(tenant):
    trx = tenant.book("expense", 100.00)
    response = tenant.put(f"/api/v1/transactions/{trx['id']}/lines",
                          {"lines": [{"item_id": "ITEM-INVENTADO", "quantity": 1}]})
    assert response.status_code == 404


def test_an_item_from_another_company_cannot_be_used(tenant, other_tenant):
    theirs = _item(other_tenant, code="ART-ALHEIO")
    trx = tenant.book("expense", 100.00)
    response = tenant.put(f"/api/v1/transactions/{trx['id']}/lines",
                          {"lines": [{"item_id": theirs["id"], "quantity": 1}]})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# O que muda depois não reescreve o passado
# ---------------------------------------------------------------------------

def test_changing_the_item_price_does_not_rewrite_an_existing_line(tenant):
    item = _item(tenant, price_1=10.00, vat_rate="Normal")
    trx = tenant.book("expense", 100.00)
    _lines(tenant, trx["id"], [{"item_id": item["id"], "quantity": 1}])

    updated = tenant.put(f"/api/v1/items/{item['id']}", {"price_1": 25.00})
    assert updated.status_code == 200

    line = _read(tenant, trx["id"])[0]
    # A fatura de ontem continua a dizer o que dizia.
    assert line["unit_price"] == 10.00
    assert line["net_amount"] == 10.00


def test_the_document_totals_follow_the_lines_that_came_from_the_catalogue(tenant):
    caderno = _item(tenant, code="A", description="Caderno", price_1=10.00, vat_rate="Normal")
    livro = _item(tenant, code="B", description="Livro", price_1=20.00, vat_rate="Reduzida")
    trx = tenant.book("expense", 100.00)

    _lines(tenant, trx["id"], [
        {"item_id": caderno["id"], "quantity": 2},   # 20,00 + 23% = 24,60
        {"item_id": livro["id"], "quantity": 1},     # 20,00 +  6% = 21,20
    ])

    updated = tenant.get(f"/api/v1/transactions/{trx['id']}").json()
    assert updated["net_amount"] == 40.00
    assert updated["vat_amount"] == 5.80
    assert float(updated["amount"]) == 45.80


# ---------------------------------------------------------------------------
# O catálogo é da empresa, não de quem escreve o cabeçalho
# ---------------------------------------------------------------------------

def test_the_catalogue_is_scoped_to_the_active_company(tenant, other_tenant):
    _item(other_tenant, code="ART-ALHEIO", description="Artigo de outra empresa")
    assert tenant.get("/api/v1/items/").json() == []


def test_a_forged_company_header_reaches_nothing(tenant, other_tenant):
    """O X-Company-Id só vale para empresas a que o utilizador pertence.

    A resolução da empresa activa era feita à parte neste módulo e aceitava o
    cabeçalho sem o validar, o que dava a qualquer autenticado o catálogo de
    qualquer empresa.

    A resposta é 404 e não 403 de propósito: um 403 confirmaria que a empresa
    existe. Para quem não pertence a ela, ela não existe.
    """
    _item(other_tenant, code="ART-SECRETO")

    forged = {**tenant.headers, "X-Company-Id": other_tenant.company_id}
    response = tenant.client.get("/api/v1/items/", headers=forged)

    assert response.status_code == 404
