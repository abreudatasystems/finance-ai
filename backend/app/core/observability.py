"""Monitorização de erros (Sentry), opcional.

Sem ``SENTRY_DSN`` não acontece nada — nem sequer se importa o sentry-sdk.
Com ele, os erros não tratados e tudo o que for registado a nível ERROR (por
exemplo ``financeai.client``, os erros vindos do navegador) chegam ao Sentry.

Dados financeiros não saem do servidor: nada de corpos de pedidos, cookies,
cabeçalhos de autenticação nem dados pessoais (``send_default_pii=False``).
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("financeai.observability")

# Cabeçalhos que nunca podem sair (comparados em minúsculas).
SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie", "x-webhook-secret",
                     "x-api-key", "proxy-authorization"}

_initialised = False


def _scrub_headers(headers: Any) -> Any:
    if isinstance(headers, dict):
        return {k: ("[removido]" if str(k).lower() in SENSITIVE_HEADERS else v)
                for k, v in headers.items()}
    if isinstance(headers, list):  # pares [nome, valor]
        out = []
        for item in headers:
            if isinstance(item, (list, tuple)) and len(item) == 2 \
                    and str(item[0]).lower() in SENSITIVE_HEADERS:
                out.append([item[0], "[removido]"])
            else:
                out.append(item)
        return out
    return headers


def before_send(event: dict, hint: dict | None = None) -> dict:
    """Tira do evento tudo o que possa levar dados sensíveis."""
    request = event.get("request")
    if isinstance(request, dict):
        if "headers" in request:
            request["headers"] = _scrub_headers(request["headers"])
        for key in ("data", "cookies", "env"):
            request.pop(key, None)
        # A query string pode trazer filtros com valores/NIFs: fica só o caminho.
        request.pop("query_string", None)
    event.pop("user", None)
    return event


def init_monitoring(component: str = "api") -> bool:
    """Liga o Sentry se ``SENTRY_DSN`` estiver definido. Devolve se ligou."""
    global _initialised
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        return False
    if _initialised:
        return True
    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        logger.warning("SENTRY_DSN definido mas o sentry-sdk não está instalado; "
                       "monitorização desligada.")
        return False

    from app.core.config import settings

    try:
        traces = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE") or 0)
    except ValueError:
        traces = 0.0

    integrations: list = [LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)]
    if component == "api":
        try:
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            from sentry_sdk.integrations.starlette import StarletteIntegration
            integrations += [StarletteIntegration(), FastApiIntegration()]
        except Exception:                                   # noqa: BLE001
            pass

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.ENVIRONMENT,
        release=settings.VERSION,
        traces_sample_rate=traces,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        before_send=before_send,
        before_send_transaction=before_send,
        integrations=integrations,
    )
    sentry_sdk.set_tag("component", component)
    _initialised = True
    logger.info("Monitorização de erros ligada (%s, %s).", component, settings.ENVIRONMENT)
    return True
