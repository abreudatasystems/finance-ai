import csv
import io

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.models.models import Transaction

router = APIRouter()


@router.get("/export/csv")
def export_csv_report(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    transactions = db.query(Transaction).filter(Transaction.company_id == company_id).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Data", "Tipo", "Descricao", "Entidade", "Categoria", "Valor", "Status", "Origem"])
    for t in transactions:
        writer.writerow([t.date, t.type, t.description, t.entity_name, t.category_name, t.amount, t.status, t.source])

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="relatorio_financeiro.csv"'},
    )
