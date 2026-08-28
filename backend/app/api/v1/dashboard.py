from fastapi import APIRouter, Depends

from app.api.deps import get_current_company_id
from app.services.health_calculator import calculate_health_score

router = APIRouter()


@router.get("/health-score")
def get_health_score(company_id: str = Depends(get_current_company_id)):
    return calculate_health_score(company_id)
