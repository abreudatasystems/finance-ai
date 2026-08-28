from fastapi import APIRouter, Depends
from app.services.health_calculator import calculate_health_score

router = APIRouter()

@router.get("/health-score")
def get_health_score(company_id: str = "COMP001"):
    return calculate_health_score(company_id)
