from fastapi import APIRouter
from app.schemas.schemas import AIChatRequest, AIChatResponse
from app.services.ai_orchestrator import process_ai_intent_and_action

router = APIRouter()

@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(request: AIChatRequest):
    return await process_ai_intent_and_action(request)
