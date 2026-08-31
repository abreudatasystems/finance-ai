from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.schemas import AIChatRequest, AIChatResponse
from app.services.ai_orchestrator import process_ai_intent_and_action
from app.api.deps import get_current_company_id

router = APIRouter()


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    request: AIChatRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    # Force the tenant from the authenticated session, never trust the body.
    request.company_id = company_id
    return await process_ai_intent_and_action(request, db, company_id)
