"""The standard chart of accounts: what ships with a company, and what is locked.

System categories come from the SNC template and are read-only; the company's
own are fully editable. See app/catalog and app/services/provisioning.py.
"""


def _flat(tree: list) -> list:
    return [node for parent in tree for node in [parent] + parent.get("children", [])]


def test_new_company_starts_with_the_standard_plan(tenant):
    flat = _flat(tenant.categories())
    assert len(flat) == 35, "a empresa nova devia nascer com o plano padrão completo"
    assert all(c["is_system"] for c in flat)


def test_keywords_are_ready_for_the_classifier(tenant):
    software = tenant.subcategory("Software e Licenças")
    assert "microsoft" in software["keywords"]


def test_system_category_cannot_be_edited(tenant):
    fse = next(c for c in tenant.categories() if c["name"] == "Fornecimentos e Serviços Externos")
    response = tenant.patch(f"/api/v1/categories/{fse['id']}", {"name": "Outro nome"})
    assert response.status_code == 403
    assert "sistema" in response.json()["detail"]


def test_system_subcategory_cannot_be_deleted(tenant):
    software = tenant.subcategory("Software e Licenças")
    assert tenant.delete(f"/api/v1/categories/{software['id']}").status_code == 403


def test_category_holding_system_children_cannot_be_deleted(tenant):
    fse = next(c for c in tenant.categories() if c["name"] == "Fornecimentos e Serviços Externos")
    assert tenant.delete(f"/api/v1/categories/{fse['id']}").status_code == 403


def test_company_can_create_and_edit_its_own(tenant):
    group = next(g for g in tenant.get("/api/v1/category-groups/").json() if g["kind"] == "expense")
    created = tenant.post("/api/v1/categories/", {
        "name": "Padel da equipa", "group_id": group["id"], "keywords": ["padel"],
    })
    assert created.status_code == 201
    own = created.json()
    assert own["is_system"] is False

    renamed = tenant.patch(f"/api/v1/categories/{own['id']}", {"name": "Desporto e bem-estar"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Desporto e bem-estar"

    assert tenant.delete(f"/api/v1/categories/{own['id']}").status_code == 200


def test_own_subcategory_inside_a_system_category(tenant):
    fse = next(c for c in tenant.categories() if c["name"] == "Fornecimentos e Serviços Externos")
    response = tenant.post("/api/v1/categories/", {"name": "Aulas", "parent_id": fse["id"]})
    assert response.status_code == 201
    assert response.json()["is_system"] is False


def test_restoring_the_plan_is_idempotent(tenant):
    result = tenant.post("/api/v1/chart-templates/restore", {}).json()
    assert result["created"] == 0
    assert result["skipped"] == 35


def test_categories_are_invisible_to_another_company(tenant, other_tenant):
    fse = next(c for c in tenant.categories() if c["name"] == "Fornecimentos e Serviços Externos")
    assert other_tenant.patch(f"/api/v1/categories/{fse['id']}", {"name": "hack"}).status_code == 404
    assert other_tenant.delete(f"/api/v1/categories/{fse['id']}").status_code == 404
