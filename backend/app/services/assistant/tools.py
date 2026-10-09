"""As ferramentas que o Claude pode chamar — só leitura, sempre da empresa autenticada.

Regras que não se negoceiam:

* o ``company_id`` vem **sempre** da sessão (argumento de ``run_tool``); nenhuma
  ferramenta o aceita como parâmetro, por isso o modelo não pode escolher outra
  empresa;
* nada aqui escreve na base de dados;
* devolve-se JSON compacto e com poucas linhas (limites abaixo), só com os
  campos necessários: sem emails, telefones, moradas, nem NIF de pessoas
  singulares;
* reaproveitam-se os serviços que já fazem as contas (financials,
  cash_forecast, alerts, vat_engine, health_calculator, entities) para que o
  assistente diga os mesmos números que os ecrãs.
"""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Callable, Dict, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.models import Entity, Transaction

logger = logging.getLogger("app.assistant")

MAX_OPEN_ITEMS = 15
MAX_SEARCH_ROWS = 20
MAX_CATEGORIES = 15
MAX_ENTITIES = 5
_TEXT_CAP = 80


# ──────────────────────────── definições (para a API) ────────────────────────────
# Ordem fixa e conteúdo estático: fazem parte do prefixo em cache.

TOOL_DEFINITIONS: list[dict] = [
    {
        "name": "resumo_tesouraria",
        "description": (
            "Saldo de caixa real (pagamentos efetivos), totais por receber e por pagar "
            "(incluindo vencidos) e previsão de tesouraria semanal para as próximas semanas "
            "(saldo final, ponto mais baixo, data em que fica negativo). Usar para perguntas "
            "sobre saldo, liquidez, 'como estamos', previsão ou se há dinheiro para pagar algo."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "semanas": {
                    "type": "integer",
                    "description": "Horizonte da previsão em semanas (1 a 26). Por omissão 13.",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "contas_em_aberto",
        "description": (
            "Documentos por receber (clientes) ou por pagar (fornecedores) ainda em aberto, "
            "ordenados por data de vencimento, com o total. Pode limitar-se aos já vencidos."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "direcao": {"type": "string", "enum": ["receber", "pagar"]},
                "apenas_vencidos": {"type": "boolean", "description": "Só os com vencimento ultrapassado."},
                "limite": {"type": "integer", "description": f"Máximo de linhas (1 a {MAX_OPEN_ITEMS})."},
            },
            "required": ["direcao"],
            "additionalProperties": False,
        },
    },
    {
        "name": "despesas_por_categoria",
        "description": (
            "Gastos por categoria (sem IVA, pela data do documento) num período, e o resultado "
            "do período (rendimentos, gastos, resultado, margem). Por omissão o mês corrente."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "data_inicio": {"type": "string", "description": "AAAA-MM-DD, inclusive."},
                "data_fim": {"type": "string", "description": "AAAA-MM-DD, inclusive."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "resumo_iva",
        "description": (
            "Apuramento de IVA de um período: IVA liquidado, IVA dedutível, saldo a entregar ou "
            "a recuperar, e prazos legais de declaração e pagamento."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "periodo": {
                    "type": "string",
                    "description": "'2026-08' (mês), '2026-T3' (trimestre) ou '2026' (ano). Omitir para o período em curso.",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "pesquisar_movimentos",
        "description": (
            "Pesquisa lançamentos (faturas, despesas, receitas) por texto na descrição, entidade, "
            "categoria ou n.º de documento, por intervalo de datas, valor e tipo. Devolve o número "
            f"e a soma de todos os resultados e as primeiras linhas (máx. {MAX_SEARCH_ROWS})."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "texto": {"type": "string"},
                "tipo": {"type": "string", "enum": ["receita", "despesa"]},
                "data_inicio": {"type": "string", "description": "AAAA-MM-DD, inclusive."},
                "data_fim": {"type": "string", "description": "AAAA-MM-DD, inclusive."},
                "valor_min": {"type": "number"},
                "valor_max": {"type": "number"},
                "limite": {"type": "integer", "description": f"1 a {MAX_SEARCH_ROWS}."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "procurar_entidade",
        "description": (
            "Procura fornecedores/clientes pelo nome (ou NIF) e devolve o papel e os saldos: "
            "faturado, pago/recebido e em dívida de cada lado."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "nome": {"type": "string", "description": "Parte do nome ou o NIF."},
                "papel": {"type": "string", "enum": ["fornecedor", "cliente"]},
            },
            "required": ["nome"],
            "additionalProperties": False,
        },
    },
    {
        "name": "alertas",
        "description": (
            "Os alertas financeiros atuais da empresa (contas vencidas, IVA e retenções a "
            "entregar, aprovações pendentes, conciliação atrasada...), dos mais graves para os menos."
        ),
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
]

#: Para onde cada ferramenta leva no painel — sugestões de navegação.
NAVIGATION: Dict[str, tuple] = {
    "resumo_tesouraria": ("Ver painel", "/dashboard"),
    "contas_em_aberto:receber": ("Ver por receber", "/financial/receivables"),
    "contas_em_aberto:pagar": ("Ver por pagar", "/financial/payables"),
    "despesas_por_categoria": ("Ver relatórios", "/reports"),
    "resumo_iva": ("Ver apuramento de IVA", "/reports"),
    "pesquisar_movimentos": ("Ver movimentos", "/financial/cash-flow"),
    "procurar_entidade:cliente": ("Ver clientes", "/registry/customers"),
    "procurar_entidade": ("Ver fornecedores", "/registry/suppliers"),
    "alertas": ("Ver alertas", "/alerts"),
}


def navigation_key(name: str, args: dict) -> str:
    if name == "contas_em_aberto":
        return f"{name}:{'receber' if args.get('direcao') == 'receber' else 'pagar'}"
    if name == "procurar_entidade" and args.get("papel") == "cliente":
        return f"{name}:cliente"
    return name


# ──────────────────────────────── utilitários ────────────────────────────────

class ToolInputError(ValueError):
    """Argumento inválido vindo do modelo — devolvido como erro à ferramenta."""


def _f(value) -> float:
    return round(float(value or 0), 2)


def _cap(text: Optional[str], size: int = _TEXT_CAP) -> Optional[str]:
    if text is None:
        return None
    text = str(text)
    return text if len(text) <= size else text[: size - 1] + "…"


def _int(value, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(number, high))


def _iso(value, field: str) -> Optional[str]:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        raise ToolInputError(f"{field} deve ser uma data AAAA-MM-DD.")


def _number(value, field: str) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ToolInputError(f"{field} deve ser um número.")


def _public_nif(nif: Optional[str]) -> Optional[str]:
    """O NIF só quando é de uma pessoa coletiva.

    NIF começados por 1, 2 ou 3 são de pessoas singulares — dado pessoal que o
    modelo não precisa para responder.
    """
    digits = "".join(ch for ch in (nif or "") if ch.isdigit())
    if len(digits) == 9 and digits[0] in "56789":
        return digits
    return None


# ──────────────────────────────── ferramentas ────────────────────────────────

def _resumo_tesouraria(db: Session, company_id: str, args: dict, today: date) -> dict:
    from app.services import cash_forecast, financials

    weeks = _int(args.get("semanas"), 13, 1, 26)
    cash = financials.cash_position(db, company_id, until=today.isoformat())
    open_ = financials.open_positions(db, company_id, today.isoformat())
    forecast = cash_forecast.build(db, company_id, weeks=weeks, today=today)
    return {
        "hoje": today.isoformat(),
        "saldo_caixa": cash["saldo"],
        "contas_bancarias": cash["contas"],
        "a_receber": open_["a_receber"],
        "a_receber_vencido": open_["a_receber_vencido"],
        "a_pagar": open_["a_pagar"],
        "a_pagar_vencido": open_["a_pagar_vencido"],
        "previsao": {
            "semanas": weeks,
            "saldo_final": forecast["saldo_final"],
            "total_entradas": forecast["total_entradas"],
            "total_saidas": forecast["total_saidas"],
            "ponto_baixo": forecast["ponto_baixo"],
            "fica_negativo_em": forecast["fica_negativo_em"],
            "sem_dados": forecast["resumo"]["sem_dados"],
            "mensagem": forecast["resumo"]["mensagem"],
            "por_semana": [
                {"semana": w["semana"], "inicio": w["inicio"], "entradas": w["entradas"],
                 "saidas": w["saidas"], "saldo_final": w["saldo_final"]}
                for w in forecast["semanas"]
            ],
        },
    }


def _contas_em_aberto(db: Session, company_id: str, args: dict, today: date) -> dict:
    direction = args.get("direcao")
    if direction not in ("receber", "pagar"):
        raise ToolInputError("direcao deve ser 'receber' ou 'pagar'.")
    kind = "income" if direction == "receber" else "expense"
    only_overdue = bool(args.get("apenas_vencidos"))
    limit = _int(args.get("limite"), 10, 1, MAX_OPEN_ITEMS)
    today_iso = today.isoformat()

    rows = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == kind,
            Transaction.status.notin_(["cancelled", "draft"]),
            Transaction.payment_status.in_(["pending", "partially_paid", "overdue"]),
        )
        .all()
    )
    if only_overdue:
        rows = [t for t in rows if t.due_date and t.due_date < today_iso]
    rows.sort(key=lambda t: (t.due_date or "9999-12-31"))
    total = sum((Decimal(str(t.outstanding_amount or 0)) for t in rows), Decimal("0"))

    items = []
    for t in rows[:limit]:
        days = None
        if t.due_date and t.due_date < today_iso:
            try:
                days = (today - date.fromisoformat(t.due_date[:10])).days
            except ValueError:
                days = None
        items.append({
            "entidade": _cap(t.entity_name, 60),
            "descricao": _cap(t.description),
            "documento": t.document_number,
            "data": t.date,
            "vencimento": t.due_date,
            "dias_em_atraso": days,
            "em_aberto": _f(t.outstanding_amount),
        })
    return {
        "direcao": direction,
        "apenas_vencidos": only_overdue,
        "numero_total": len(rows),
        "total_em_aberto": _f(total),
        "mostrados": len(items),
        "documentos": items,
    }


def _period(args: dict, today: date) -> tuple[str, str]:
    start = _iso(args.get("data_inicio"), "data_inicio") or today.replace(day=1).isoformat()
    end_inclusive = _iso(args.get("data_fim"), "data_fim") or today.isoformat()
    if end_inclusive < start:
        raise ToolInputError("data_fim é anterior a data_inicio.")
    end_exclusive = (date.fromisoformat(end_inclusive) + timedelta(days=1)).isoformat()
    return start, end_exclusive


def _despesas_por_categoria(db: Session, company_id: str, args: dict, today: date) -> dict:
    from app.services import financials
    from app.services.health_calculator import _expense_totals_by_category

    start, end = _period(args, today)
    categories = _expense_totals_by_category(db, company_id, start, end)
    result = financials.period_result(db, company_id, start, end)
    return {
        "periodo": {"inicio": start, "fim": (date.fromisoformat(end) - timedelta(days=1)).isoformat()},
        "base": "sem IVA, pela data do documento",
        "rendimentos": result["rendimentos"],
        "gastos": result["gastos"],
        "resultado": result["resultado"],
        "margem_percent": result["margem"],
        "numero_categorias": len(categories),
        "categorias": [{"categoria": _cap(c["name"], 60), "valor": c["amount"]}
                       for c in categories[:MAX_CATEGORIES]],
    }


def _resumo_iva(db: Session, company_id: str, args: dict, today: date) -> dict:
    from app.services.vat_engine import compute_vat_position

    period = (args.get("periodo") or "").strip() or None
    try:
        position = compute_vat_position(db, company_id, period, today)
    except HTTPException as exc:
        raise ToolInputError(str(exc.detail))

    def side(block: dict) -> dict:
        return {
            "total": block["total"],
            "base_tributavel": block["base_tributavel"],
            "documentos": block["num_documentos"],
            "por_taxa": [
                {k: v for k, v in row.items() if k in ("label", "base_tributavel", "iva", "num_documentos")}
                for row in (block.get("breakdown") or [])[:6]
            ],
        }

    return {
        "periodo": {k: position["period"][k] for k in ("key", "label", "start", "end", "periodicity_label")},
        "regime": position["regime"]["label"],
        "isento_art53": position["regime"]["exempt"],
        "iva_liquidado": side(position["iva_liquidado"]),
        "iva_dedutivel": side(position["iva_dedutivel"]),
        "apuramento": position["apuramento"],
        "prazos": position["prazos"],
        "nota": position["nota"],
    }


def _pesquisar_movimentos(db: Session, company_id: str, args: dict, today: date) -> dict:
    query = db.query(Transaction).filter(
        Transaction.company_id == company_id,
        Transaction.status.notin_(["cancelled"]),
    )
    text = (args.get("texto") or "").strip()[:60]
    if text:
        like = f"%{text}%"
        query = query.filter(or_(
            Transaction.description.ilike(like),
            Transaction.entity_name.ilike(like),
            Transaction.category_name.ilike(like),
            Transaction.document_number.ilike(like),
        ))
    kind = args.get("tipo")
    if kind in ("receita", "despesa"):
        query = query.filter(Transaction.type == ("income" if kind == "receita" else "expense"))
    start = _iso(args.get("data_inicio"), "data_inicio")
    end = _iso(args.get("data_fim"), "data_fim")
    if start:
        query = query.filter(Transaction.date >= start)
    if end:
        query = query.filter(Transaction.date <= end)
    low = _number(args.get("valor_min"), "valor_min")
    high = _number(args.get("valor_max"), "valor_max")
    if low is not None:
        query = query.filter(Transaction.amount >= low)
    if high is not None:
        query = query.filter(Transaction.amount <= high)

    rows = query.order_by(Transaction.date.desc()).all()
    limit = _int(args.get("limite"), 10, 1, MAX_SEARCH_ROWS)
    total = sum((Decimal(str(t.amount or 0)) for t in rows), Decimal("0"))
    return {
        "numero_resultados": len(rows),
        "soma_valor_com_iva": _f(total),
        "mostrados": min(limit, len(rows)),
        "movimentos": [
            {
                "data": t.date,
                "tipo": "receita" if t.type == "income" else "despesa" if t.type == "expense" else t.type,
                "descricao": _cap(t.description),
                "entidade": _cap(t.entity_name, 60),
                "categoria": _cap(t.category_name, 60),
                "documento": t.document_number,
                "valor_com_iva": _f(t.amount),
                "valor_sem_iva": _f(t.net_amount) if t.net_amount is not None else None,
                "estado_pagamento": t.payment_status,
                "em_aberto": _f(t.outstanding_amount),
                "vencimento": t.due_date,
            }
            for t in rows[:limit]
        ],
    }


def _procurar_entidade(db: Session, company_id: str, args: dict, today: date) -> dict:
    from app.services import entities as entity_service

    term = (args.get("nome") or "").strip()[:60]
    if len(term) < 2:
        raise ToolInputError("Indique pelo menos 2 caracteres do nome.")
    digits = "".join(ch for ch in term if ch.isdigit())
    conditions = [Entity.name.ilike(f"%{term}%")]
    if len(digits) >= 6:
        conditions.append(Entity.nif.ilike(f"%{digits}%"))
    query = db.query(Entity).filter(Entity.company_id == company_id, or_(*conditions))
    role = args.get("papel")
    if role == "fornecedor":
        query = query.filter(Entity.is_supplier.is_(True))
    elif role == "cliente":
        query = query.filter(Entity.is_customer.is_(True))
    found = query.order_by(Entity.name).limit(MAX_ENTITIES + 1).all()

    shown = entity_service.with_balances(db, company_id, found[:MAX_ENTITIES])
    return {
        "encontradas": len(shown),
        "ha_mais": len(found) > MAX_ENTITIES,
        "entidades": [
            {
                "nome": _cap(e["name"], 60),
                "papel": e["papel"],
                "nif_empresa": _public_nif(e.get("nif")),
                "ativa": e["active"],
                "cidade": e.get("city"),
                "compras": e.get("compras"),
                "vendas": e.get("vendas"),
                "saldo_nos_devemos_menos_nos_devem": e.get("saldo"),
                "ultimo_movimento": e.get("ultimo_movimento"),
            }
            for e in shown
        ],
    }


def _alertas(db: Session, company_id: str, args: dict, today: date) -> dict:
    from app.services import alerts

    data = alerts.collect(db, company_id, today)
    return {
        "resumo": data["resumo"],
        "alertas": [
            {k: a[k] for k in ("severity", "title", "description", "count", "amount")}
            for a in data["alertas"][:10]
        ],
    }


_HANDLERS: Dict[str, Callable[[Session, str, dict, date], dict]] = {
    "resumo_tesouraria": _resumo_tesouraria,
    "contas_em_aberto": _contas_em_aberto,
    "despesas_por_categoria": _despesas_por_categoria,
    "resumo_iva": _resumo_iva,
    "pesquisar_movimentos": _pesquisar_movimentos,
    "procurar_entidade": _procurar_entidade,
    "alertas": _alertas,
}


def run_tool(name: str, args: Any, db: Session, company_id: str,
             today: Optional[date] = None) -> tuple[str, bool]:
    """Executa uma ferramenta para a empresa autenticada.

    Devolve (conteúdo JSON, is_error). Um erro de argumentos volta ao modelo
    como resultado de erro para ele corrigir; nunca rebenta o pedido.
    """
    handler = _HANDLERS.get(name)
    if handler is None:
        return json.dumps({"erro": f"Ferramenta desconhecida: {name}"}, ensure_ascii=False), True
    if not isinstance(args, dict):
        args = {}
    # O modelo não escolhe a empresa: qualquer campo com esse nome é ignorado.
    args = {k: v for k, v in args.items() if k not in ("company_id", "empresa", "company")}
    try:
        result = handler(db, company_id, args, today or date.today())
    except ToolInputError as exc:
        return json.dumps({"erro": str(exc)}, ensure_ascii=False), True
    except Exception:
        # Defeito nosso, não do pedido: fica no log (sem argumentos nem dados)
        # e o modelo é informado de que este dado não está disponível.
        logger.exception("assistente: a ferramenta %s falhou", name)
        return json.dumps({"erro": "Erro interno ao obter estes dados; não estão disponíveis."},
                          ensure_ascii=False), True
    return json.dumps(result, ensure_ascii=False, default=str, separators=(",", ":")), False
