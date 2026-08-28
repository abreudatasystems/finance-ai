from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Transaction

router = APIRouter()

@router.get("/export/csv")
def export_csv_report(company_id: str = "COMP001", db: Session = Depends(get_db)):
    transactions = db.query(Transaction).filter(Transaction.company_id == company_id).all()
    
    csv_lines = ["Data,Tipo,Descricao,Entidade,Categoria,Valor,Status,Origem"]
    for t in transactions:
        csv_lines.append(f'"{t.date}","{t.type}","{t.description}","{t.entity_name}","{t.category_name}",{t.amount},"{t.status}","{t.source}"')
    
    csv_content = "\n".join(csv_lines)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="relatorio_financeiro.csv"'}
    )
