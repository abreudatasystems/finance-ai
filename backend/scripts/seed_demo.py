"""Põe uma empresa a sério na base de dados.

Isto não escreve linhas na base de dados à mão. Cada documento, cada linha e
cada pagamento entra pelos **mesmos endpoints que a aplicação usa**, o que
garante que os totais, o IVA, a retenção na fonte e o estado de liquidação são
calculados pelo produto e não escritos por este ficheiro. Se a conta estiver
errada no produto, fica errada aqui — que é exactamente o que se quer de uns
dados de demonstração: se batem certo, é porque o produto bate certo.

A empresa é uma PME portuguesa pequena e verosímil — um estúdio digital no
Porto, IVA trimestral, uns clientes, uns fornecedores, três projectos, senhorio
com retenção de 25% sobre a renda e um freelancer com retenção de IRS. O ano
corre de Janeiro até ao mês corrente, com uma parte por receber de propósito:
uma tesouraria em que está tudo pago não mostra nada.

    python -m scripts.seed_demo            # cria
    python -m scripts.seed_demo --reset    # apaga o que lá está e recria

O acesso fica: demo@finance-ai.pt / Tesouraria!Atlantico26
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from calendar import monthrange
from datetime import date, timedelta
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient   # noqa: E402

from app.main import app                    # noqa: E402

EMAIL = "demo@finance-ai.pt"
PASSWORD = "Tesouraria!Atlantico26"
OWNER = "Marta Ribeiro"
COMPANY = "Atlântico Digital, Lda"

#: Fixa para os dados serem sempre os mesmos entre execuções. Uma demonstração
#: que muda de números a cada arranque não se consegue discutir com ninguém.
rng = random.Random(20260101)


# ───────────────────────────── ajudas ─────────────────────────────

def month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def iso(d: date) -> str:
    return d.isoformat()


class Api:
    """O cliente autenticado, com o mesmo cabeçalho de empresa que o browser."""

    def __init__(self, client: TestClient, token: str, company_id: Optional[str] = None):
        self.client = client
        self.headers = {"Authorization": f"Bearer {token}"}
        if company_id:
            self.headers["X-Company-Id"] = company_id

    def _check(self, response, what: str):
        if response.status_code >= 400:
            raise SystemExit(f"[seed] {what} falhou ({response.status_code}): {response.text}")
        return response.json()

    def get(self, path: str, **kw):
        return self._check(self.client.get(path, headers=self.headers, **kw), f"GET {path}")

    def post(self, path: str, body=None):
        return self._check(self.client.post(path, headers=self.headers, json=body), f"POST {path}")

    def put(self, path: str, body=None):
        return self._check(self.client.put(path, headers=self.headers, json=body), f"PUT {path}")

    def patch(self, path: str, body=None):
        return self._check(self.client.patch(path, headers=self.headers, json=body), f"PATCH {path}")


# ───────────────────────── quem entra na aplicação ─────────────────────────

def sign_in(client: TestClient) -> tuple[str, str]:
    """Regista a empresa, ou entra nela se já existir."""
    response = client.post("/api/v1/auth/register", json={
        "name": OWNER, "company_name": COMPANY, "email": EMAIL, "password": PASSWORD,
    })
    if response.status_code == 400 and "registado" in response.text:
        response = client.post("/api/v1/auth/login",
                               json={"email": EMAIL, "password": PASSWORD})
    if response.status_code >= 400:
        raise SystemExit(f"[seed] não foi possível autenticar: {response.text}")

    token = response.json()["access_token"]
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    memberships = me.get("memberships") or []
    company_id = memberships[0].get("company_id") if memberships else None
    if not company_id:
        raise SystemExit("[seed] o utilizador não tem empresa associada")
    return token, company_id


def wipe(company_id: str) -> None:
    """Apaga os dados desta empresa — só desta — para poder recriar.

    O plano de contas fica: é ele que dá as categorias, e é reposto pelo
    provisionamento quando falta.
    """
    from app.db.session import SessionLocal
    from app.models.models import (
        Transaction, TransactionLine, Payment, Installment, Entity, Item,
        CostCenter, Budget, BankAccount, AuditLog,
    )

    db = SessionLocal()
    try:
        trx_ids = [t.id for t in db.query(Transaction)
                   .filter(Transaction.company_id == company_id).all()]
        if trx_ids:
            for model in (TransactionLine, Payment, Installment):
                (db.query(model)
                   .filter(model.transaction_id.in_(trx_ids))
                   .delete(synchronize_session=False))
        for model in (Transaction, Entity, Item, CostCenter, Budget, BankAccount, AuditLog):
            (db.query(model)
               .filter(model.company_id == company_id)
               .delete(synchronize_session=False))
        db.commit()
        print(f"[seed] apagados {len(trx_ids)} documentos e o resto do registo da empresa")
    finally:
        db.close()


# ───────────────────────── o plano de contas ─────────────────────────

def chart(api: Api) -> dict:
    """As categorias por nome, para o resto do ficheiro se ler."""
    index: dict[str, dict] = {}

    def walk(nodes):
        for node in nodes:
            index[node["name"]] = node
            walk(node.get("children") or [])

    walk(api.get("/api/v1/categories/"))
    return index


def pick(index: dict, *names: str) -> dict:
    for name in names:
        if name in index:
            return index[name]
    raise SystemExit(f"[seed] nenhuma destas categorias existe no plano: {names}")


# ───────────────────────────── o registo ─────────────────────────────

CUSTOMERS = [
    ("Câmara Municipal de Matosinhos", "506811570", "geral@cm-matosinhos.pt"),
    ("Padaria Ribeiro & Filhos, Lda", "508234901", "encomendas@padariaribeiro.pt"),
    ("Clínica Dentária Sorriso, Unip.", "514099327", "admin@clinicasorriso.pt"),
    ("Hotel Douro Vista, S.A.", "503992144", "financeiro@dourovista.pt"),
    ("Oficina Central Auto, Lda", "509771203", "contabilidade@ocauto.pt"),
]

SUPPLIERS = [
    ("EDP Comercial", "503504564", "Eletricidade e Água", None),
    ("MEO — Altice Portugal", "504615947", "Comunicações", None),
    ("Adobe Systems Software Ireland", "IE6364992H", "Software e Licenças", None),
    ("Galp Energia", "504499777", "Combustíveis", None),
    ("Papelaria Central do Porto", "507118440", "Outros Gastos", None),
]

#: O senhorio e o freelancer são o motivo de metade do módulo de retenções
#: existir: são documentos em que o que se paga não é o que a fatura diz.
WITHHELD = [
    ("Fernando Alves Sousa (senhorio)", "192884031", "Rendas e Alugueres", "irs_f_25"),
    ("Rita Camacho — Design Freelance", "247310558", "Publicidade e Marketing", "irs_b_25"),
]

ITEMS = [
    # (kind, code, family/group, descrição, taxa, preço)
    ("service", "SRV-WEB", "Web", "Desenvolvimento de website institucional", "Normal", 4800.00),
    ("service", "SRV-LOJA", "Web", "Loja online — implementação", "Normal", 6500.00),
    ("service", "SRV-AVENCA", "Manutenção", "Avença mensal de manutenção", "Normal", 350.00),
    ("service", "SRV-SEO", "Marketing", "Otimização para motores de busca", "Normal", 780.00),
    ("service", "SRV-HORA", "Manutenção", "Hora de desenvolvimento adicional", "Normal", 45.00),
    ("service", "SRV-FORM", "Formação", "Formação em gestão de conteúdos (por dia)", "Isenta", 420.00),
    ("product", "PRD-HOST", "Alojamento", "Alojamento web — 12 meses", "Normal", 180.00),
    ("product", "PRD-DOM", "Alojamento", "Registo de domínio .pt — 1 ano", "Normal", 25.00),
    ("product", "PRD-SSL", "Alojamento", "Certificado SSL — 1 ano", "Normal", 60.00),
]

#: (nome, código, cliente, valor contratado, orçamento de custo, início)
PROJECTS = [
    ("Portal do Munícipe", "PRJ-CMM", "Câmara Municipal de Matosinhos", 18000.00, 11500.00, "2026-01-15"),
    ("Loja Padaria Ribeiro", "PRJ-PAD", "Padaria Ribeiro & Filhos, Lda", 9500.00, 6200.00, "2026-03-02"),
    ("Reserva Online Douro Vista", "PRJ-HDV", "Hotel Douro Vista, S.A.", 14000.00, 8800.00, "2026-05-11"),
]


def register(api: Api, cats: dict) -> dict:
    """Contas bancárias, entidades, artigos e projectos."""
    api.post("/api/v1/bank-accounts/", {
        "name": "Conta à ordem", "bank_name": "Millennium bcp",
        "iban": "PT50003300004567891234505", "opening_balance": 14200.00,
        "is_default": True,
    })
    api.post("/api/v1/bank-accounts/", {
        "name": "Poupança", "bank_name": "Millennium bcp",
        "iban": "PT50003300009876543210998", "opening_balance": 6000.00,
    })

    entities: dict[str, dict] = {}
    for name, nif, email in CUSTOMERS:
        entities[name] = api.post("/api/v1/entities/", {
            "name": name, "nif": nif, "email": email, "is_customer": True,
        })

    for name, nif, category, _ in SUPPLIERS:
        cat = pick(cats, category)
        entities[name] = api.post("/api/v1/entities/", {
            "name": name, "nif": nif, "is_supplier": True,
            "default_category_id": cat["id"], "default_category_name": cat["name"],
        })

    # A retenção é uma propriedade de quem recebe, não de cada fatura: fica
    # gravada na entidade e cada documento novo já nasce com ela.
    for name, nif, category, code in WITHHELD:
        cat = pick(cats, category)
        entity = api.post("/api/v1/entities/", {
            "name": name, "nif": nif, "is_supplier": True,
            "default_category_id": cat["id"], "default_category_name": cat["name"],
        })
        api.put(f"/api/v1/retentions/entities/{entity['id']}/default", {"retention_code": code})
        entities[name] = entity

    items: dict[str, dict] = {}
    for kind, code, family, description, vat, price in ITEMS:
        payload = {
            "kind": kind, "code": code, "description": description,
            "vat_rate": vat, "price_1": price, "active": True,
        }
        payload["service_group" if kind == "service" else "family"] = family
        items[code] = api.post("/api/v1/items/", payload)

    projects: dict[str, dict] = {}
    for name, code, client, value, budget, started in PROJECTS:
        projects[code] = api.post("/api/v1/projects/", {
            "name": name, "code": code, "contract_value": value, "budget": budget,
            "entity_id": entities[client]["id"], "entity_name": client,
            "started_on": started, "status": "open",
        })

    return {"entities": entities, "items": items, "projects": projects}


# ─────────────────────────── o que se planeou ───────────────────────────

def plan(api: Api, cats: dict, months: list[date]) -> None:
    """O orçamento mensal — o que a empresa decidiu gastar em cada rubrica."""
    intent = {
        "Rendas e Alugueres": 850.00,
        "Eletricidade e Água": 180.00,
        "Comunicações": 95.00,
        "Software e Licenças": 240.00,
        "Combustíveis": 140.00,
        "Publicidade e Marketing": 600.00,
        "Remunerações": 5200.00,
        "Segurança Social": 1240.00,
    }
    for reference in months:
        period = reference.strftime("%Y-%m")
        api.put("/api/v1/budgets/batch", {
            "period": period,
            "linhas": [
                {"category_id": pick(cats, name)["id"], "amount": amount}
                for name, amount in intent.items()
            ],
        })


# ─────────────────────────── o que aconteceu ───────────────────────────

def book(api: Api, **payload) -> dict:
    """Um documento. Nasce por liquidar — quem paga é o pagamento."""
    payload.setdefault("is_paid", False)
    payload.setdefault("currency", "EUR")
    return api.post("/api/v1/transactions/", payload)


def settle(api: Api, trx: dict, when: date, amount: Optional[float] = None) -> None:
    api.post(f"/api/v1/transactions/{trx['id']}/payments", {
        "amount": amount, "payment_date": iso(when),
        "payment_method": "Transferência bancária",
    })


def recurring_costs(api: Api, cats: dict, reg: dict, months: list[date], today: date) -> int:
    """O que se repete todos os meses: renda, luz, telecomunicações, salários.

    A renda leva retenção de 25% na fonte — o senhorio recebe 637,50 EUR de uma
    renda de 850,00 EUR e os restantes 212,50 EUR são entregues ao Estado até
    ao dia 20 do mês seguinte. É esta a diferença entre o que a fatura diz e o
    que sai do banco.
    """
    fixed = [
        ("Fernando Alves Sousa (senhorio)", "Rendas e Alugueres", "Renda do escritório", 850.00, None, 8),
        ("EDP Comercial", "Eletricidade e Água", "Eletricidade", None, 23.0, 12),
        ("MEO — Altice Portugal", "Comunicações", "Fibra e telemóveis", 78.90, 23.0, 15),
        ("Adobe Systems Software Ireland", "Software e Licenças", "Creative Cloud", 199.00, 23.0, 5),
        ("Galp Energia", "Combustíveis", "Combustível", None, 23.0, 25),
    ]

    count = 0
    for reference in months:
        for name, category, what, base, vat, day in fixed:
            cat = pick(cats, category)
            entity = reg["entities"][name]
            amount = base if base is not None else round(rng.uniform(95, 215), 2)
            issued = date(reference.year, reference.month, min(day, monthrange(reference.year, reference.month)[1]))
            gross = round(amount * (1 + (vat or 0) / 100), 2)
            trx = book(
                api, type="expense",
                description=f"{what} — {reference.strftime('%m/%Y')}",
                entity_name=name, entity_id=entity["id"],
                category_id=cat["id"], category_name=cat["name"],
                amount=gross, vat_rate=vat, date=iso(issued),
                due_date=iso(issued + timedelta(days=15)),
                document_type="Fatura", document_number=f"{name[:3].upper()}/{issued:%Y%m}",
                is_recurring=True, payment_method="Débito direto",
            )
            count += 1
            # Correm por débito directo: pagam-se na data de vencimento, desde
            # que essa data já tenha chegado.
            due = issued + timedelta(days=15)
            if due <= today:
                settle(api, trx, due)

        # Salários: a remuneração e a Segurança Social são dois documentos
        # porque são duas dívidas, a duas entidades, com prazos diferentes.
        payday = month_end(reference.year, reference.month)
        for category, label, amount, entity in (
            ("Remunerações", "Vencimentos", 5240.00, "Pessoal"),
            ("Segurança Social", "Segurança Social (TSU)", 1244.50, "Segurança Social"),
        ):
            cat = pick(cats, category)
            trx = book(
                api, type="expense",
                description=f"{label} — {reference.strftime('%m/%Y')}",
                entity_name=entity,
                category_id=cat["id"], category_name=cat["name"],
                amount=amount, vat_rate=0.0, date=iso(payday), due_date=iso(payday),
                document_type="Documento interno",
            )
            count += 1
            if payday <= today:
                settle(api, trx, payday)
    return count


def sales(api: Api, cats: dict, reg: dict, months: list[date], today: date) -> int:
    """As faturas emitidas, detalhadas por linhas vindas do catálogo.

    O total do documento não é escrito: é a soma das linhas, calculada pelo
    servidor. É por isso que uma fatura com serviços a 23% e formação isenta
    fecha com o IVA certo sem ninguém somar nada à mão.
    """
    services = pick(cats, "Prestação de Serviços")
    catalogue = reg["items"]
    customers = [name for name, _, _ in CUSTOMERS]
    projects = list(reg["projects"].values())

    baskets = [
        [("SRV-WEB", 1), ("PRD-HOST", 1), ("PRD-DOM", 1)],
        [("SRV-AVENCA", 1)],
        [("SRV-LOJA", 1), ("PRD-SSL", 1)],
        [("SRV-SEO", 1), ("SRV-HORA", 6)],
        [("SRV-FORM", 2), ("SRV-HORA", 3)],
        [("SRV-AVENCA", 3), ("PRD-HOST", 1)],
    ]

    count = 0
    for index, reference in enumerate(months):
        for slot in range(rng.randint(2, 4)):
            customer = customers[(index + slot) % len(customers)]
            basket = baskets[(index * 3 + slot) % len(baskets)]
            issued = date(reference.year, reference.month,
                          min(4 + slot * 8, monthrange(reference.year, reference.month)[1]))
            due = issued + timedelta(days=30)
            project = projects[(index + slot) % len(projects)] if slot == 0 else None

            # O valor entra provisório: as linhas mandam e o servidor recalcula
            # o cabeçalho a partir delas.
            trx = book(
                api, type="income",
                description=f"Fatura a {customer.split(',')[0]}",
                entity_name=customer, entity_id=reg["entities"][customer]["id"],
                category_id=services["id"], category_name=services["name"],
                cost_center_id=project["id"] if project else None,
                cost_center_name=project["nome"] if project else None,
                amount=0.01, date=iso(issued), due_date=iso(due),
                document_type="Fatura", document_number=f"FT 2026/{count + 1:03d}",
                payment_method="Transferência bancária",
            )
            api.put(f"/api/v1/transactions/{trx['id']}/lines", {
                "lines": [
                    {"item_id": catalogue[code]["id"], "quantity": quantity}
                    for code, quantity in basket
                ],
            })
            count += 1

            # O que se recebe e o que fica por receber. Facturas com mais de um
            # mês estão liquidadas; as recentes ainda não, e uma de propósito
            # ficou por pagar para a antiguidade de saldos ter o que mostrar.
            settled = api.get(f"/api/v1/transactions/{trx['id']}")
            if due <= today - timedelta(days=30) and count % 7 != 0:
                settle(api, settled, due + timedelta(days=rng.randint(0, 9)))
            elif due <= today and count % 3 == 0:
                # Recebido a meias: acontece, e o produto tem de o mostrar.
                half = round(float(settled["outstanding_amount"]) / 2, 2)
                settle(api, settled, due, amount=half)
    return count


def freelance_costs(api: Api, cats: dict, reg: dict, months: list[date], today: date) -> int:
    """Trabalho subcontratado a um profissional independente, com retenção."""
    cat = pick(cats, "Publicidade e Marketing")
    entity = reg["entities"]["Rita Camacho — Design Freelance"]
    projects = list(reg["projects"].values())
    count = 0
    for reference in months[::2]:
        issued = date(reference.year, reference.month, 18)
        base = round(rng.choice([450.0, 600.0, 750.0, 900.0]), 2)
        # Imputado ao projecto: um custo sem projecto não deixa saber se o
        # trabalho deu lucro, que é a única pergunta que um projecto responde.
        project = projects[count % len(projects)]
        trx = book(
            api, type="expense", description="Design gráfico — trabalho subcontratado",
            entity_name=entity["name"], entity_id=entity["id"],
            category_id=cat["id"], category_name=cat["name"],
            cost_center_id=project["id"], cost_center_name=project["nome"],
            amount=round(base * 1.23, 2), vat_rate=23.0,
            date=iso(issued), due_date=iso(issued + timedelta(days=30)),
            document_type="Fatura-recibo",
        )
        count += 1
        due = issued + timedelta(days=30)
        if due <= today:
            settle(api, trx, due)
    return count


def one_offs(api: Api, cats: dict, reg: dict, today: date) -> int:
    """Uns gastos avulsos, para as rubricas não ficarem todas certinhas."""
    entries = [
        ("Papelaria Central do Porto", "Outros Gastos", "Material de escritório", 143.50, 23.0, date(2026, 2, 11)),
        ("Papelaria Central do Porto", "Outros Gastos", "Impressão de material promocional", 386.00, 23.0, date(2026, 4, 23)),
        ("Galp Energia", "Combustíveis", "Portagens e deslocações", 212.40, 23.0, date(2026, 6, 9)),
        ("Adobe Systems Software Ireland", "Software e Licenças", "Licenças adicionais", 498.00, 23.0, date(2026, 7, 14)),
    ]
    count = 0
    for name, category, what, base, vat, issued in entries:
        if issued > today:
            continue
        cat = pick(cats, category)
        trx = book(
            api, type="expense", description=what,
            entity_name=name, entity_id=reg["entities"][name]["id"],
            category_id=cat["id"], category_name=cat["name"],
            amount=round(base * (1 + vat / 100), 2), vat_rate=vat,
            date=iso(issued), due_date=iso(issued + timedelta(days=30)),
            document_type="Fatura",
        )
        count += 1
        settle(api, trx, issued + timedelta(days=20))
    return count


# ───────────────────────────── o resultado ─────────────────────────────

def report(api: Api) -> None:
    """Lê de volta pelos mesmos endpoints das páginas, e mostra o que deu.

    É a verificação que interessa: se os números que saem daqui fizerem
    sentido, é porque o produto os calculou bem a partir dos documentos.
    """
    cash = api.get("/api/v1/fiscal/real-cash")
    retention = api.get("/api/v1/retentions/position")
    ageing = api.get("/api/v1/collections/aging")
    dre = api.get("/api/v1/reports/income-statement?period=" + str(date.today().year))

    def money(value) -> str:
        return f"{float(value or 0):>13,.2f} EUR".replace(",", " ")

    turnover = next(
        (line["amount"] for line in dre["linhas"] if line["key"] == "vendas"), 0.0,
    )

    print("\n─── o que ficou na base de dados " + "─" * 33)
    for label, value in (
        ("Facturado no ano (s/ IVA)", turnover),
        ("Saldo de caixa", cash["saldo_caixa"]),
        ("IVA a entregar ao Estado", cash["iva_a_entregar"]),
        ("Dinheiro realmente disponível", cash["dinheiro_real"]),
        ("Por receber", ageing["total"]),
        ("  do qual vencido", ageing["vencido"]),
        ("Retido a terceiros no mês", retention["retido_a_terceiros"]["total"]),
    ):
        print(f"  {label:<31}{money(value)}")
    print("─" * 66)
    print(f"\n  Entrar em:  {EMAIL}  /  {PASSWORD}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dados reais para a empresa de demonstração.")
    parser.add_argument("--reset", action="store_true",
                        help="apaga os dados desta empresa antes de recriar")
    args = parser.parse_args()

    with TestClient(app) as client:              # o arranque corre as migrações
        token, company_id = sign_in(client)
        api = Api(client, token, company_id)

        existing = api.get("/api/v1/transactions/")
        rows = existing if isinstance(existing, list) else existing.get("items", [])
        if rows and not args.reset:
            raise SystemExit(
                f"[seed] a empresa já tem {len(rows)} documentos. "
                "Use --reset para os apagar e recriar."
            )
        if args.reset:
            wipe(company_id)

        today = date.today()
        months = [date(today.year, m, 1) for m in range(1, today.month + 1)]
        cats = chart(api)

        print(f"[seed] {COMPANY} — {months[0]:%m/%Y} a {months[-1]:%m/%Y}")
        reg = register(api, cats)
        print(f"[seed] registo: {len(reg['entities'])} entidades, "
              f"{len(reg['items'])} artigos, {len(reg['projects'])} projectos")

        plan(api, cats, months)
        print(f"[seed] orçamento planeado para {len(months)} meses")

        total = 0
        total += recurring_costs(api, cats, reg, months, today)
        total += freelance_costs(api, cats, reg, months, today)
        total += one_offs(api, cats, reg, today)
        total += sales(api, cats, reg, months, today)
        print(f"[seed] {total} documentos lançados, com linhas, retenções e pagamentos")

        report(api)


if __name__ == "__main__":
    main()
