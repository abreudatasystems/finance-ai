from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime

# Token & Auth
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class UserCreate(BaseModel):
    name: str
    company_name: str
    email: str
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    avatar: Optional[str] = None
    role: str = "owner"

# Company
class CompanyOut(BaseModel):
    id: str
    name: str
    nif: str
    currency: str
    fiscal_year_start: str

    class Config:
        from_attributes = True


# Category
class CategoryCreate(BaseModel):
    type: str  # income, expense
    name: str
    parent_id: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None


# Supplier
class SupplierCreate(BaseModel):
    name: str
    nif: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    default_category_id: Optional[str] = None
    default_category_name: Optional[str] = None


# Customer
class CustomerCreate(BaseModel):
    name: str
    nif: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    default_category_id: Optional[str] = None
    default_category_name: Optional[str] = None

# Transaction
class TransactionCreate(BaseModel):
    type: str  # income, expense, transfer
    description: str
    entity_name: str
    entity_id: Optional[str] = None
    category_id: str
    category_name: str
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    amount: float
    vat_amount: Optional[float] = 0.0
    due_date: Optional[str] = None
    payment_method: Optional[str] = None
    is_recurring: Optional[bool] = False
    notes: Optional[str] = None

class TransactionOut(BaseModel):
    id: str
    company_id: str
    date: str
    due_date: Optional[str] = None
    payment_date: Optional[str] = None
    type: str
    description: str
    entity_name: str
    category_id: str
    category_name: str
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    amount: float
    vat_amount: Optional[float] = 0.0
    status: str
    source: str
    ai_confidence: Optional[int] = None
    document_id: Optional[str] = None
    document_name: Optional[str] = None
    is_recurring: Optional[bool] = False
    payment_method: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True

# Document Extraction Dify Schema
class DifyExtractionPayload(BaseModel):
    texto_documento: str
    empresa: str
    categorias_disponiveis: List[str]
    fornecedores_existentes: List[str]

class DifyExtractionResult(BaseModel):
    fornecedor: str
    data: str
    valor: float
    iva: float
    categoria: str
    tipo: str
    descricao: str
    confianca: int

# AI Chat Assistant (Contextual Intent Engine)
class AIContext(BaseModel):
    page: Optional[str] = "dashboard"
    period: Optional[str] = "2026-08"

class AIChatAction(BaseModel):
    label: str
    action: str
    payload: Optional[dict] = None

class AIChatRequest(BaseModel):
    message: Optional[str] = None
    prompt: Optional[str] = None
    company_id: str = "COMP001"
    currency: str = "EUR"
    context: Optional[AIContext] = None

class AIChatResponse(BaseModel):
    id: str
    sender: str = "ai"
    text: str
    type: str = "analysis"  # analysis, action, alert
    timestamp: str
    actionCard: Optional[dict] = None
    actions: Optional[List[AIChatAction]] = None

