"""Fiscal module — IVA summary and SAF-T (PT) export."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id
from app.services.vat_engine import compute_vat_position, compute_real_cash
from app.services import saft

router = APIRouter()


@router.get("/vat-position")
def get_vat_position(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Apuramento do IVA: liquidado − dedutível, with the statutory deadlines."""
    return compute_vat_position(db, company_id, period)


@router.get("/real-cash")
def get_real_cash(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Cash split into what belongs to the company and what belongs to the State."""
    return compute_real_cash(db, company_id)


@router.get("/vat-summary")
def get_vat_summary(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """IVA summary by rate.

    Delegates to the apuramento so sales and purchases stay separated — adding
    IVA liquidado to IVA dedutível produces a figure that means nothing.
    """
    position = compute_vat_position(db, company_id, period)
    return {
        "period": position["period"]["key"],
        "period_label": position["period"]["label"],
        "regime": position["regime"],
        "breakdown": position["iva_liquidado"]["breakdown"] + position["iva_dedutivel"]["breakdown"],
        "iva_liquidado": position["iva_liquidado"],
        "iva_dedutivel": position["iva_dedutivel"],
        "apuramento": position["apuramento"],
        "prazos": position["prazos"],
        "totals": {
            "base_tributavel": round(
                position["iva_liquidado"]["base_tributavel"] + position["iva_dedutivel"]["base_tributavel"], 2),
            "iva_total": position["apuramento"]["saldo"],
            "num_documentos": position["iva_liquidado"]["num_documentos"] + position["iva_dedutivel"]["num_documentos"],
        },
    }

@router.get("/saft-export")
def export_saft_xml(
    period: Optional[str] = Query(None, description="AAAA ou AAAA-MM; por omissão, o ano corrente."),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """O SAF-T (PT) do período, para entregar a quem faz a contabilidade.

    Não é um SAF-T de faturação para submeter à AT: isso exige software
    certificado, e o cabeçalho do ficheiro diz isso de si próprio em vez de o
    esconder. O que sai daqui é o extracto dos documentos registados.
    """
    try:
        xml, filename = saft.build(db, company_id, period)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
