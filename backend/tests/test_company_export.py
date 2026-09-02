"""Exportar os dados da empresa.

The tests that matter are the negative ones: an export must never carry
another company's rows, and never carry anything that logs in. Everything else
is a convenience; those two are the reason the feature can be trusted.
"""

import csv
import io
import json
import zipfile


def _download(tenant):
    response = tenant.get("/api/v1/companies/export")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    return zipfile.ZipFile(io.BytesIO(response.content))


def _rows(archive: zipfile.ZipFile, table: str) -> list[dict]:
    raw = archive.read(f"dados/{table}.csv").decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(raw), delimiter=";"))


def _manifest(archive: zipfile.ZipFile) -> dict:
    return json.loads(archive.read("manifesto.json").decode("utf-8"))


# ---------------------------------------------------------------------------
# What comes out
# ---------------------------------------------------------------------------

def test_the_export_carries_the_company_documents(tenant):
    tenant.book("expense", 184.50, date="2026-09-10", description="Avença")
    tenant.book("income", 1230.00, date="2026-09-12", description="Projeto")

    archive = _download(tenant)
    rows = _rows(archive, "transactions")

    assert len(rows) == 2
    assert {r["description"] for r in rows} == {"Avença", "Projeto"}
    # Portuguese decimals, so the file opens straight into Excel here.
    assert any(r["amount"] == "184,50" for r in rows)


def test_every_tenant_table_is_in_the_archive(tenant):
    archive = _download(tenant)
    names = set(archive.namelist())

    # Derived from the models, so a table added later cannot fall out silently.
    from app.services.company_export import tenant_models
    for model in tenant_models():
        assert f"dados/{model.__tablename__}.csv" in names, model.__tablename__

    assert "manifesto.json" in names
    assert "LEIA-ME.txt" in names
    assert "dados/equipa.csv" in names


def test_the_manifest_counts_what_the_files_contain(tenant):
    tenant.book("expense", 50.00)
    tenant.book("expense", 60.00)

    archive = _download(tenant)
    manifest = _manifest(archive)
    counted = {t["tabela"]: t["registos"] for t in manifest["tabelas"]}

    assert counted["transactions"] == 2
    assert counted["transactions"] == len(_rows(archive, "transactions"))
    assert manifest["total_registos"] == sum(t["registos"] for t in manifest["tabelas"])
    assert manifest["empresa"]["id"] == tenant.company_id


def test_the_readme_lists_the_tables_for_a_person(tenant):
    archive = _download(tenant)
    readme = archive.read("LEIA-ME.txt").decode("utf-8")

    assert "Exportação de dados" in readme
    assert "transactions" in readme
    assert "não são exportados" in readme


def test_the_team_is_exported_by_name_and_role(tenant):
    archive = _download(tenant)
    team = _rows(archive, "equipa")

    assert len(team) == 1
    assert team[0]["email"] == tenant.email
    assert team[0]["papel"] == "owner"
    # The team file says who has access, not how they get in.
    assert "hashed_password" not in team[0]


def test_an_empty_company_still_exports_a_complete_archive(tenant):
    archive = _download(tenant)
    manifest = _manifest(archive)
    # Categories are provisioned on registration, so it is never truly empty,
    # but every table must be present whether or not it has rows.
    assert len(manifest["tabelas"]) > 10
    assert _rows(archive, "transactions") == []


# ---------------------------------------------------------------------------
# What must never come out
# ---------------------------------------------------------------------------

def test_the_export_never_contains_anything_that_logs_in(tenant):
    tenant.book("expense", 100.00)
    response = tenant.get("/api/v1/companies/export")
    archive = zipfile.ZipFile(io.BytesIO(response.content))

    for name in archive.namelist():
        body = archive.read(name).decode("utf-8-sig", errors="ignore")
        for forbidden in ("hashed_password", "reset_token", "$2b$", "$argon2"):
            assert forbidden not in body, f"{forbidden} apareceu em {name}"


def test_the_export_never_contains_another_company_data(tenant, other_tenant):
    other_tenant.book("expense", 9999.00, description="Segredo alheio")
    tenant.book("expense", 10.00, description="Nossa despesa")

    archive = _download(tenant)
    rows = _rows(archive, "transactions")

    assert [r["description"] for r in rows] == ["Nossa despesa"]
    assert all(r["company_id"] == tenant.company_id for r in rows)

    whole = b"".join(archive.read(n) for n in archive.namelist())
    assert b"Segredo alheio" not in whole
    assert other_tenant.company_id.encode() not in whole


# ---------------------------------------------------------------------------
# Who may take it
# ---------------------------------------------------------------------------

def test_a_viewer_cannot_walk_out_with_the_accounts(client, tenant):
    invitation = tenant.post(
        f"/api/v1/invitations/company/{tenant.company_id}",
        # Derived from this tenant's own unique email: the suite shares one
        # database, so a fixed address collides with another test's guest.
        {"email": f"consulta.{tenant.email}", "role": "viewer"},
    )
    assert invitation.status_code == 201, invitation.text

    joined = client.post("/api/v1/invitations/register", json={
        "token": invitation.json()["token"], "name": "Rita",
        "password": "a chave da porta",
    })
    assert joined.status_code == 201, joined.text
    guest = {"Authorization": f"Bearer {joined.json()['access_token']}"}

    # A viewer can read the books; walking out with all of them is another
    # thing entirely.
    assert client.get("/api/v1/transactions/", headers=guest).status_code == 200
    assert client.get("/api/v1/companies/export", headers=guest).status_code == 403
    assert client.get("/api/v1/companies/export/summary", headers=guest).status_code == 403


def test_the_summary_says_how_much_there_is_before_downloading(tenant):
    tenant.book("expense", 100.00)
    tenant.book("income", 200.00)

    data = tenant.get("/api/v1/companies/export/summary").json()
    transactions = next(t for t in data["tabelas"] if t["tabela"] == "transactions")

    assert transactions["registos"] == 2
    assert data["total_tabelas"] == len(data["tabelas"])
    assert data["total_registos"] >= 2


def test_the_filename_names_the_company_and_the_day(tenant):
    from datetime import date
    from app.services.company_export import filename_for

    class FakeCompany:
        name = "Atelier Digital Unip. Lda"

    name = filename_for(FakeCompany(), date(2026, 9, 2))
    assert name == "dados-atelier-digital-unip-lda-2026-09-02.zip"
