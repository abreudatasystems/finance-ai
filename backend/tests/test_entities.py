"""Suppliers and customers are one counterparty, with one account."""


def test_the_same_nif_becomes_one_entity_with_two_roles(tenant):
    supplier = tenant.post("/api/v1/suppliers/", {
        "name": "Silva Lda", "nif": "PT 501 234 567", "email": "geral@silva.pt"}).json()
    customer = tenant.post("/api/v1/customers/", {
        "name": "Silva Lda", "nif": "501234567", "phone": "912345678"}).json()

    assert customer["id"] == supplier["id"]
    assert customer["papel"] == "Fornecedor e cliente"
    assert len(tenant.get("/api/v1/entities/").json()) == 1


def test_the_account_shows_both_sides(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Silva Lda", "nif": "501234567", "is_supplier": True, "is_customer": True}).json()
    tenant.book("expense", 1230.00, description="Materiais", entity_name="Silva Lda",
                entity_id=entity["id"])
    tenant.book("expense", 615.00, paid=True, description="Serviços", entity_name="Silva Lda",
                entity_id=entity["id"])
    tenant.book("income", 500.00, description="Venda", entity_name="Silva Lda",
                entity_id=entity["id"], category=tenant.category("income"))

    account = tenant.get(f"/api/v1/entities/{entity['id']}").json()["entidade"]
    assert account["compras"]["faturado"] == 1845.0
    assert account["compras"]["em_divida"] == 1230.0
    assert account["vendas"]["por_receber"] == 500.0
    assert account["saldo"] == 730.0, "devemos-lhe 1230 e devem-nos 500"


def test_balances_follow_the_payments_without_being_written(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "EDP", "nif": "503504564", "is_supplier": True}).json()
    trx = tenant.book("expense", 1230.00, entity_name="EDP", entity_id=entity["id"])
    tenant.post(f"/api/v1/transactions/{trx['id']}/payments",
                {"amount": 230.00, "payment_date": "2026-08-20"})

    account = tenant.get(f"/api/v1/entities/{entity['id']}").json()["entidade"]
    assert account["compras"]["em_divida"] == 1000.0


def test_a_duplicate_adds_the_missing_role_instead(tenant):
    first = tenant.post("/api/v1/entities/", {
        "name": "Silva Lda", "nif": "501234567", "is_supplier": True}).json()
    again = tenant.post("/api/v1/entities/", {
        "name": "SILVA LDA", "nif": "PT501234567", "is_customer": True}).json()
    assert again["id"] == first["id"]
    assert again["is_supplier"] and again["is_customer"]


def test_an_entity_without_a_role_is_refused(tenant):
    assert tenant.post("/api/v1/entities/", {"name": "Sem papel", "nif": "504444444"}).status_code == 400


def test_merging_brings_the_movements_across(tenant):
    keep = tenant.post("/api/v1/entities/", {
        "name": "Silva Lda", "nif": "501234567", "is_supplier": True}).json()
    duplicate = tenant.post("/api/v1/entities/", {
        "name": "Silva & Filhos", "nif": "509999999", "is_supplier": True}).json()
    tenant.book("expense", 100.0, entity_name="Silva & Filhos", entity_id=duplicate["id"])

    result = tenant.post(f"/api/v1/entities/{keep['id']}/merge", {"merge_id": duplicate["id"]}).json()
    assert result["movimentos_movidos"] == 1
    assert len(tenant.get("/api/v1/entities/").json()) == 1


def test_an_entity_with_history_is_archived_not_deleted(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Com histórico", "nif": "501111111", "is_supplier": True}).json()
    tenant.book("expense", 50.0, entity_name="Com histórico", entity_id=entity["id"])

    result = tenant.delete(f"/api/v1/entities/{entity['id']}").json()
    assert result["status"] == "archived"


def test_an_entity_without_history_is_deleted(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Sem movimentos", "nif": "505555555", "is_customer": True}).json()
    assert tenant.delete(f"/api/v1/entities/{entity['id']}").json()["status"] == "deleted"


def test_dropping_one_role_keeps_the_other(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Silva Lda", "nif": "501234567", "is_supplier": True, "is_customer": True}).json()
    tenant.delete(f"/api/v1/suppliers/{entity['id']}")
    after = tenant.get(f"/api/v1/entities/{entity['id']}").json()["entidade"]
    assert after["is_supplier"] is False
    assert after["is_customer"] is True


def test_the_legacy_views_still_work(tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Silva Lda", "nif": "501234567", "is_supplier": True, "is_customer": True}).json()
    tenant.book("expense", 1230.00, entity_name="Silva Lda", entity_id=entity["id"])
    tenant.book("income", 500.00, entity_name="Silva Lda", entity_id=entity["id"],
                category=tenant.category("income"))

    supplier = tenant.get("/api/v1/suppliers/").json()[0]
    customer = tenant.get("/api/v1/customers/").json()[0]
    assert supplier["total_spent"] == 1230.0
    assert customer["total_revenue"] == 500.0


def test_entities_are_invisible_to_another_company(tenant, other_tenant):
    entity = tenant.post("/api/v1/entities/", {
        "name": "Silva Lda", "nif": "501234567", "is_supplier": True}).json()
    assert other_tenant.get(f"/api/v1/entities/{entity['id']}").status_code == 404
    assert other_tenant.get("/api/v1/entities/").json() == []
