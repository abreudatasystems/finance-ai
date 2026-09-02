"""The two distinctions every figure depends on: net vs gross, cash vs accrual."""

from app.db.session import SessionLocal
from app.models.models import FinancialEvent


def test_the_months_result_excludes_vat(tenant):
    """12 300 € invoiced at 23% is 10 000 € of revenue, not 12 300 €."""
    from datetime import date
    today = date.today().isoformat()

    tenant.book("income", 12300.00, date=today, category=tenant.category("income"))
    tenant.book("expense", 6150.00, date=today)

    health = tenant.get("/api/v1/dashboard/health-score").json()
    assert health["month_income"] == 10000.0
    assert health["month_expense"] == 5000.0
    assert health["monthly_result"] == 5000.0
    assert health["operating_margin"] == 50.0


def test_the_cash_balance_counts_payments_not_invoices(tenant):
    """An unpaid invoice does not make the company look richer than it is."""
    from datetime import date
    today = date.today().isoformat()

    unpaid = tenant.book("income", 12300.00, date=today, paid=False,
                         category=tenant.category("income"))
    assert tenant.get("/api/v1/dashboard/health-score").json()["current_balance"] == 0.0

    tenant.post(f"/api/v1/transactions/{unpaid['id']}/payments",
                {"amount": 12300.00, "payment_date": today})
    assert tenant.get("/api/v1/dashboard/health-score").json()["current_balance"] == 12300.0


def test_expenses_by_category_are_net_and_follow_the_lines(tenant):
    from datetime import date
    today = date.today().isoformat()

    power = tenant.subcategory("Eletricidade e Água")
    staff = tenant.subcategory("Remunerações")
    trx = tenant.book("expense", 100.00, date=today, category=power)
    tenant.put(f"/api/v1/transactions/{trx['id']}/lines", {"lines": [
        {"description": "Luz", "net_amount": 300.00, "vat_rate": 23,
         "category_id": power["id"], "category_name": power["name"]},
        {"description": "Ordenados", "net_amount": 700.00, "vat_rate": 0,
         "category_id": staff["id"], "category_name": staff["name"]},
    ]})

    rows = {row["name"]: row["amount"] for row in
            tenant.get("/api/v1/dashboard/expenses-by-category").json()}
    assert rows["Eletricidade e Água"] == 300.0
    assert rows["Remunerações"] == 700.0


def test_the_monthly_summary_is_net_too(tenant):
    from datetime import date
    today = date.today().isoformat()
    tenant.book("income", 1230.00, date=today, category=tenant.category("income"))

    summary = tenant.get("/api/v1/dashboard/summary?months=1").json()
    assert summary[-1]["Entradas"] == 1000.0


def test_reading_the_dashboard_writes_nothing(tenant):
    """A GET used to insert FinancialEvent rows; alerts compute live instead."""
    from datetime import date
    tenant.book("expense", 100.00, date="2026-01-05", due_date="2026-01-10", paid=False)

    tenant.get("/api/v1/dashboard/health-score")
    tenant.get("/api/v1/dashboard/health-score")

    db = SessionLocal()
    written = db.query(FinancialEvent).filter(
        FinancialEvent.company_id == tenant.company_id).count()
    db.close()
    assert written == 0


def test_a_document_without_vat_information_counts_at_face_value(tenant):
    """The safer guess: never inflate a result by assuming VAT that is not there."""
    from datetime import date
    today = date.today().isoformat()
    tenant.book("income", 500.00, date=today, vat_rate=0, category=tenant.category("income"))

    health = tenant.get("/api/v1/dashboard/health-score").json()
    assert health["month_income"] == 500.0
