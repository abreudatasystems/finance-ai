"""Shared fixtures.

Every test gets its **own company**, created through the real registration
endpoint, so the tests are isolated from each other without a database reset
between them — and the isolation being tested is the same isolation the
product relies on.

The database URL is set before the app is imported, because the engine is
built at import time.
"""

import os
import tempfile
from itertools import count

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-used-outside-tests")
# Sem trabalho de fundo: um varrimento a correr a meio de um teste geraria
# lançamentos que o teste não pediu, e o resultado passava a depender do relógio.
os.environ.setdefault("SCHEDULER_ENABLED", "0")

import pytest                                    # noqa: E402
from fastapi.testclient import TestClient        # noqa: E402

from app.main import app                         # noqa: E402

_sequence = count(1)


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


class Tenant:
    """One company with its owner, plus the helpers most tests need."""

    def __init__(self, client: TestClient, token: str, company_id: str, email: str):
        self.client = client
        self.token = token
        self.company_id = company_id
        self.email = email
        self.headers = {"Authorization": f"Bearer {token}"}

    def scoped(self, company_id: str) -> dict:
        """Headers pinned to another company this login belongs to."""
        return {**self.headers, "X-Company-Id": company_id}

    # -- convenience ------------------------------------------------------
    def get(self, path: str, **kw):
        return self.client.get(path, headers=self.headers, **kw)

    def post(self, path: str, json=None, **kw):
        return self.client.post(path, headers=self.headers, json=json, **kw)

    def patch(self, path: str, json=None, **kw):
        return self.client.patch(path, headers=self.headers, json=json, **kw)

    def put(self, path: str, json=None, **kw):
        return self.client.put(path, headers=self.headers, json=json, **kw)

    def delete(self, path: str, **kw):
        return self.client.delete(path, headers=self.headers, **kw)

    def categories(self) -> list:
        return self.get("/api/v1/categories/").json()

    def category(self, kind: str = "expense") -> dict:
        """A top-level category of the given nature."""
        return next(c for c in self.categories() if c["type"] == kind)

    def subcategory(self, name: str) -> dict:
        for parent in self.categories():
            for child in parent.get("children", []):
                if child["name"] == name:
                    return child
        raise AssertionError(f"subcategoria '{name}' não existe no plano padrão")

    def book(self, kind: str = "expense", amount: float = 100.0, *, paid: bool = False,
             date: str = "2026-08-12", category: dict = None, **extra) -> dict:
        """Book a transaction the way the UI does."""
        cat = category or self.category(kind)
        payload = {
            "date": date,
            "type": kind,
            "description": extra.pop("description", "Lançamento de teste"),
            "entity_name": extra.pop("entity_name", "Fornecedor Teste"),
            "category_id": cat["id"],
            "category_name": cat["name"],
            "amount": amount,
            "vat_rate": extra.pop("vat_rate", 23),
            "is_paid": paid,
            **extra,
        }
        response = self.post("/api/v1/transactions/", payload)
        assert response.status_code == 201, response.text
        return response.json()


def register(client: TestClient, company_name: str = "Empresa Teste") -> Tenant:
    """Create a brand-new login with its own company."""
    index = next(_sequence)
    email = f"teste{index}@exemplo.pt"
    response = client.post("/api/v1/auth/register", json={
        "name": f"Utilizador {index}",
        "email": email,
        "password": "a chave da porta",
        "company_name": f"{company_name} {index}",
    })
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    companies = client.get("/api/v1/companies/", headers={"Authorization": f"Bearer {token}"}).json()
    return Tenant(client, token, companies[0]["id"], email)


@pytest.fixture
def tenant(client: TestClient) -> Tenant:
    return register(client)


@pytest.fixture
def other_tenant(client: TestClient) -> Tenant:
    """A second company, for the isolation checks."""
    return register(client, "Outra Empresa")
