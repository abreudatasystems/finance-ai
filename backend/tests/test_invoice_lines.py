"""Mixed VAT: 6%, 13% and 23% on the same invoice."""


def _lines(tenant, trx_id, lines):
    response = tenant.put(f"/api/v1/transactions/{trx_id}/lines", {"lines": lines})
    assert response.status_code == 200, response.text
    return response.json()


def test_three_rates_on_one_invoice(tenant):
    trx = tenant.book("expense", 100.00, description="Compras supermercado")
    result = _lines(tenant, trx["id"], [
        {"description": "Pão e leite", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
        {"description": "Vinho", "quantity": 4, "unit_price": 7.50, "vat_rate": 13},
        {"description": "Detergente", "net_amount": 40.00, "vat_rate": 23},
    ])
    totals = result["totais"]
    assert (totals["net_amount"], totals["vat_amount"], totals["gross_amount"]) == (90.0, 14.30, 104.30)
    assert totals["mixed"] is True
    assert totals["vat_rate"] is None, "um documento misto não tem taxa única no cabeçalho"
    assert len(result["por_taxa"]) == 3


def test_the_header_follows_the_lines(tenant):
    trx = tenant.book("expense", 100.00)
    _lines(tenant, trx["id"], [
        {"description": "Pão", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
        {"description": "Detergente", "net_amount": 40.00, "vat_rate": 23},
    ])
    updated = tenant.get(f"/api/v1/transactions/{trx['id']}").json()
    assert float(updated["amount"]) == 70.40
    assert float(updated["outstanding_amount"]) == 70.40, "a obrigação segue o novo total"
    assert float(updated["net_amount"]) + float(updated["vat_amount"]) == float(updated["amount"])


def test_the_vat_return_reads_the_lines(tenant):
    trx = tenant.book("expense", 100.00, date="2026-08-10")
    _lines(tenant, trx["id"], [
        {"description": "Pão", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
        {"description": "Detergente", "net_amount": 40.00, "vat_rate": 23},
    ])
    position = tenant.get("/api/v1/fiscal/vat-position?period=2026-T3").json()
    deductible = position["iva_dedutivel"]
    assert abs(deductible["total"] - 10.40) < 0.01
    assert {row["vat_rate"] for row in deductible["breakdown"]} == {6.0, 23.0}


def test_a_document_with_lines_is_not_counted_twice(tenant):
    with_lines = tenant.book("expense", 100.00, date="2026-08-10")
    _lines(tenant, with_lines["id"], [
        {"description": "Pão", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
    ])
    tenant.book("expense", 500.00, date="2026-08-11", description="Renda")

    deductible = tenant.get("/api/v1/fiscal/vat-position?period=2026-T3").json()["iva_dedutivel"]
    # 1,20 from the line + 93,50 from the header-only document. Nothing else.
    assert abs(deductible["total"] - (1.20 + 93.50)) < 0.02


def test_replacing_the_lines_re_derives_everything(tenant):
    trx = tenant.book("expense", 100.00)
    _lines(tenant, trx["id"], [
        {"description": "Pão", "quantity": 10, "unit_price": 2.00, "vat_rate": 6},
        {"description": "Vinho", "quantity": 4, "unit_price": 7.50, "vat_rate": 13},
    ])
    result = _lines(tenant, trx["id"], [
        {"description": "Só pão", "quantity": 5, "unit_price": 2.00, "vat_rate": 6},
    ])
    assert result["totais"]["gross_amount"] == 10.60
    assert result["totais"]["vat_rate"] == 6.0
    assert result["totais"]["mixed"] is False


def test_clearing_the_lines_hands_the_header_back(tenant):
    trx = tenant.book("expense", 100.00)
    _lines(tenant, trx["id"], [{"description": "Pão", "net_amount": 10.0, "vat_rate": 6}])
    assert tenant.delete(f"/api/v1/transactions/{trx['id']}/lines").json()["removidas"] == 1
    assert tenant.get(f"/api/v1/transactions/{trx['id']}/lines").json()["tem_linhas"] is False


def test_the_suppliers_own_vat_amount_wins(tenant):
    """Suppliers round their own way; the document is the authority."""
    trx = tenant.book("expense", 100.00)
    result = _lines(tenant, trx["id"], [
        {"description": "Linha", "net_amount": 33.33, "vat_rate": 23, "vat_amount": 7.70},
    ])
    line = result["linhas"][0]
    assert line["vat_amount"] == 7.70          # 23% would give 7,67
    assert line["gross_amount"] == 41.03


def test_an_exempt_line_carries_its_reason(tenant):
    trx = tenant.book("expense", 100.00)
    result = _lines(tenant, trx["id"], [{
        "description": "Serviço isento", "net_amount": 200.00, "vat_rate": 0,
        "vat_exemption_reason": "Isento ao abrigo do art.º 53.º do CIVA",
    }])
    line = result["linhas"][0]
    assert line["vat_amount"] == 0.0
    assert "53" in line["vat_exemption_reason"]


def test_a_line_without_values_is_refused(tenant):
    trx = tenant.book("expense", 100.00)
    assert tenant.put(f"/api/v1/transactions/{trx['id']}/lines",
                      {"lines": [{"description": "Sem valores"}]}).status_code == 400
    assert tenant.put(f"/api/v1/transactions/{trx['id']}/lines",
                      {"lines": []}).status_code == 400


def test_an_unreadable_period_is_a_bad_request_not_a_crash(tenant):
    response = tenant.get("/api/v1/fiscal/vat-position?period=2026-Q3")
    assert response.status_code == 400
    assert "2026-T3" in response.json()["detail"]


def test_lines_are_invisible_to_another_company(tenant, other_tenant):
    trx = tenant.book("expense", 100.00)
    assert other_tenant.get(f"/api/v1/transactions/{trx['id']}/lines").status_code == 404
