from pydantic import BaseModel, EmailStr, field_validator
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
    name: str
    group_id: Optional[str] = None      # top-level group; type is derived from it
    type: Optional[str] = None          # fallback when no group is given
    parent_id: Optional[str] = None     # set to create a subcategory
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
    sub_account: Optional[str] = None
    contact_name: Optional[str] = None
    contact_role: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    contact_type: Optional[str] = None
    is_taxable: Optional[bool] = True
    vat_cash_regime: Optional[bool] = False
    is_vat_exempt: Optional[bool] = False
    address_name: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    discharge_address: Optional[str] = None
    document_observations: Optional[str] = None
    internal_observations: Optional[str] = None
    auto_invoicing: Optional[bool] = False
    model_10: Optional[bool] = False
    accept_ad_emails: Optional[bool] = False


# Customer
class CustomerCreate(BaseModel):
    name: str
    nif: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    default_category_id: Optional[str] = None
    default_category_name: Optional[str] = None
    sub_account: Optional[str] = None
    contact_name: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None
    is_taxable: Optional[bool] = True
    vat_cash_regime: Optional[bool] = False
    is_vat_exempt: Optional[bool] = False
    address_name: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    discharge_address: Optional[str] = None
    document_observations: Optional[str] = None
    internal_observations: Optional[str] = None

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
    amount: float                       # total (gross); net/vat derived if not sent
    net_amount: Optional[float] = None
    #: Withholding at source: a slug from app/catalog/retentions.py.
    #: The rate follows the catalog unless retention_rate overrides it.
    retention_code: Optional[str] = None
    retention_rate: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = 0.0
    currency: Optional[str] = "EUR"
    #: Accounting date. Defaults to today, but an invoice from last month has
    #: to be bookable in the month it belongs to — that is what decides which
    #: VAT period it falls in.
    date: Optional[str] = None
    due_date: Optional[str] = None
    payment_method: Optional[str] = None
    document_number: Optional[str] = None
    document_type: Optional[str] = None
    document_date: Optional[str] = None
    is_recurring: Optional[bool] = False
    is_paid: Optional[bool] = True          # books an immediate settling payment
    installment_count: Optional[int] = None  # split into N parcelas on creation
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class TransactionUpdate(BaseModel):
    """Partial update — only provided fields are changed."""
    description: Optional[str] = None
    entity_name: Optional[str] = None
    entity_id: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    amount: Optional[float] = None
    net_amount: Optional[float] = None
    retention_code: Optional[str] = None
    retention_rate: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = None
    currency: Optional[str] = None
    date: Optional[str] = None
    due_date: Optional[str] = None
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    #: The document's own state (draft, approved, cancelled …). The settlement
    #: state — payment_status, paid_amount, outstanding_amount — is derived from
    #: the payments and is deliberately NOT patchable: marking something paid
    #: without a payment is how books stop matching reality.
    status: Optional[str] = None
    document_number: Optional[str] = None
    document_type: Optional[str] = None
    document_date: Optional[str] = None
    document_url: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_period: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class TransactionOut(BaseModel):
    id: str
    company_id: str
    date: str
    due_date: Optional[str] = None
    payment_date: Optional[str] = None
    type: str
    description: str
    entity_name: str
    entity_id: Optional[str] = None
    category_id: str
    category_name: str
    cost_center_id: Optional[str] = None
    cost_center_name: Optional[str] = None
    amount: float
    net_amount: Optional[float] = None
    retention_code: Optional[str] = None
    retention_rate: Optional[float] = None
    retention_amount: Optional[float] = 0.0
    #: gross - retention: what actually moves through the bank.
    payable_amount: Optional[float] = None
    vat_rate: Optional[float] = None
    vat_amount: Optional[float] = 0.0
    gross_amount: Optional[float] = None
    vat_exemption_reason: Optional[str] = None
    currency: Optional[str] = "EUR"
    exchange_rate: Optional[float] = None
    paid_amount: Optional[float] = None
    outstanding_amount: Optional[float] = None
    #: Derived from the payments, never written directly.
    payment_status: Optional[str] = None
    status: str
    source: str
    ai_confidence: Optional[int] = None
    document_id: Optional[str] = None
    document_name: Optional[str] = None
    document_number: Optional[str] = None
    document_type: Optional[str] = None
    document_date: Optional[str] = None
    document_url: Optional[str] = None
    is_recurring: Optional[bool] = False
    recurrence_period: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    bank_account_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v):
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v

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

# Items (Products / Services)
class ItemBase(BaseModel):
    kind: str
    code: str
    family: Optional[str] = None
    description: str
    unit: Optional[str] = None
    ean: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = True
    vat_rate: Optional[str] = None
    price_1: Optional[float] = 0.0
    price_2: Optional[float] = 0.0
    price_3: Optional[float] = 0.0
    price_includes_vat: Optional[bool] = False
    product_type: Optional[str] = None
    purchase_price: Optional[float] = 0.0
    financial_cost: Optional[float] = 0.0
    transport_cost: Optional[float] = 0.0
    customs_cost: Optional[float] = 0.0
    other_costs: Optional[float] = 0.0
    total_estimated_cost: Optional[float] = 0.0
    service_group: Optional[str] = None

class ItemCreate(ItemBase):
    pass

class ItemUpdate(BaseModel):
    kind: Optional[str] = None
    code: Optional[str] = None
    family: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    ean: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    vat_rate: Optional[str] = None
    price_1: Optional[float] = None
    price_2: Optional[float] = None
    price_3: Optional[float] = None
    price_includes_vat: Optional[bool] = None
    product_type: Optional[str] = None
    purchase_price: Optional[float] = None
    financial_cost: Optional[float] = None
    transport_cost: Optional[float] = None
    customs_cost: Optional[float] = None
    other_costs: Optional[float] = None
    total_estimated_cost: Optional[float] = None
    service_group: Optional[str] = None

class ItemOut(ItemBase):
    id: str
    company_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

