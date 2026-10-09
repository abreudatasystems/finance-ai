"""Monitorização: erros do navegador, health público e o Sentry opcional."""

import logging

import pytest

from app.api.v1 import client_errors
from app.core import observability


@pytest.fixture(autouse=True)
def _fresh_client_error_limit():
    client_errors.reset()
    yield
    client_errors.reset()


URL = "/api/v1/client-errors"


def test_client_error_is_logged_and_returns_204(client, caplog):
    with caplog.at_level(logging.ERROR, logger="financeai.client"):
        r = client.post(URL, json={
            "message": "Boom", "stack": "at x", "url": "/transactions?nif=123#a",
            "digest": "abc", "userAgent": "pytest",
        })
    assert r.status_code == 204
    assert r.content == b""
    records = [x for x in caplog.records if x.name == "financeai.client"]
    assert records and records[0].levelno == logging.ERROR
    text = records[0].getMessage()
    assert "Boom" in text and "digest=abc" in text
    # A query string (pode ter dados) não fica no registo.
    assert "/transactions" in text and "nif=123" not in text


def test_client_error_needs_no_auth_and_tolerates_empty_body(client):
    assert client.post(URL, json={}).status_code == 204
    assert client.post(URL + "/", json={"message": "x"}).status_code == 204


def test_client_error_fields_are_truncated(client, caplog):
    with caplog.at_level(logging.ERROR, logger="financeai.client"):
        r = client.post(URL, json={"message": "M" * 5000, "stack": "S" * 20000,
                                   "userAgent": "U" * 2000})
    assert r.status_code == 204
    text = [x for x in caplog.records if x.name == "financeai.client"][0].getMessage()
    assert "M" * client_errors.MAX_MESSAGE in text
    assert "M" * (client_errors.MAX_MESSAGE + 1) not in text
    assert "S" * (client_errors.MAX_STACK + 1) not in text
    assert "U" * (client_errors.MAX_SHORT + 1) not in text
    assert "[cortado]" in text


def test_client_error_rejects_oversized_and_invalid_bodies(client):
    big = '{"message": "' + "x" * (client_errors.MAX_BODY + 10) + '"}'
    r = client.post(URL, content=big, headers={"Content-Type": "application/json"})
    assert r.status_code == 413
    r = client.post(URL, content="not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 400


def test_client_error_rate_limited_per_address(client):
    for _ in range(client_errors.RATE_LIMIT):
        assert client.post(URL, json={"message": "x"}).status_code == 204
    assert client.post(URL, json={"message": "x"}).status_code == 429


def test_health_reachable_under_api_prefix(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert client.get("/health").json() == r.json()


def test_monitoring_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert observability.init_monitoring("api") is False
    monkeypatch.setenv("SENTRY_DSN", "   ")
    assert observability.init_monitoring("scheduler") is False


def test_before_send_scrubs_headers_body_and_user():
    event = {
        "request": {
            "url": "https://x/api/v1/transactions",
            "headers": {"Authorization": "Bearer secret", "Cookie": "s=1",
                        "X-Webhook-Secret": "w", "User-Agent": "ua"},
            "data": {"amount": 1234.5, "nif": "123456789"},
            "cookies": {"s": "1"},
            "query_string": "nif=123",
        },
        "user": {"email": "a@b.pt"},
    }
    out = observability.before_send(event, {})
    headers = out["request"]["headers"]
    assert headers["Authorization"] == "[removido]"
    assert headers["Cookie"] == "[removido]"
    assert headers["X-Webhook-Secret"] == "[removido]"
    assert headers["User-Agent"] == "ua"
    for key in ("data", "cookies", "query_string"):
        assert key not in out["request"]
    assert "user" not in out


def test_before_send_scrubs_header_pairs():
    out = observability.before_send(
        {"request": {"headers": [["authorization", "x"], ["accept", "y"]]}})
    assert out["request"]["headers"] == [["authorization", "[removido]"], ["accept", "y"]]
