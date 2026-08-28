from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base

class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    nif = Column(String, nullable=False)
    currency = Column(String, default="EUR")
    fiscal_year_start = Column(String, default="01")
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserMembership(Base):
    __tablename__ = "user_memberships"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    role = Column(String, default="owner")  # owner, admin, finance_manager, viewer
    joined_at = Column(DateTime, default=datetime.utcnow)

class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    type = Column(String, nullable=False)  # income, expense
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("categories.id"), nullable=True)
    description = Column(String, nullable=True)
    keywords = Column(Text, nullable=True)  # comma separated
    active = Column(Boolean, default=True)

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    nif = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    default_category_id = Column(String, nullable=True)
    default_category_name = Column(String, nullable=True)
    total_spent = Column(Float, default=0.0)
    last_transaction_date = Column(String, nullable=True)

class Customer(Base):
    __tablename__ = "customers"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    nif = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    default_category_id = Column(String, nullable=True)
    default_category_name = Column(String, nullable=True)
    total_revenue = Column(Float, default=0.0)

class CostCenter(Base):
    __tablename__ = "cost_centers"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    budget = Column(Float, default=0.0)
    spent = Column(Float, default=0.0)
    active = Column(Boolean, default=True)

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    date = Column(String, nullable=False)
    due_date = Column(String, nullable=True)
    payment_date = Column(String, nullable=True)
    type = Column(String, nullable=False)  # income, expense, transfer
    description = Column(String, nullable=False)
    entity_name = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    category_id = Column(String, nullable=False)
    category_name = Column(String, nullable=False)
    cost_center_id = Column(String, nullable=True)
    cost_center_name = Column(String, nullable=True)
    amount = Column(Float, nullable=False)
    vat_amount = Column(Float, default=0.0)
    status = Column(String, default="approved")  # draft, pending_ai, pending_approval, approved, paid, received, cancelled
    source = Column(String, default="manual")  # manual, ai, bank, import
    ai_confidence = Column(Integer, nullable=True)
    document_id = Column(String, nullable=True)
    document_name = Column(String, nullable=True)
    is_recurring = Column(Boolean, default=False)
    recurrence_period = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class AIDocument(Base):
    __tablename__ = "ai_documents"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_size = Column(String, default="1.0 MB")
    file_type = Column(String, default="application/pdf")
    channel = Column(String, default="upload")  # email, whatsapp, upload, drive
    status = Column(String, default="processed")  # uploading, processing, processed, pending_approval, error
    upload_date = Column(String, default=datetime.utcnow().isoformat)
    extracted_supplier = Column(String, nullable=True)
    extracted_nif = Column(String, nullable=True)
    extracted_amount = Column(Float, nullable=True)
    extracted_vat = Column(Float, nullable=True)
    extracted_date = Column(String, nullable=True)
    suggested_category = Column(String, nullable=True)
    suggested_category_id = Column(String, nullable=True)
    ai_confidence = Column(Integer, default=95)
    is_recurring = Column(Boolean, default=False)

class AIApprovalItem(Base):
    __tablename__ = "ai_approvals"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    document_id = Column(String, nullable=False)
    document_name = Column(String, nullable=False)
    supplier_name = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    vat = Column(Float, default=0.0)
    date = Column(String, nullable=False)
    suggested_category = Column(String, nullable=False)
    suggested_category_id = Column(String, nullable=False)
    suggested_cost_center = Column(String, nullable=True)
    ai_confidence = Column(Integer, default=90)
    status = Column(String, default="pending")  # pending, approved, rejected, edited
    created_at = Column(DateTime, default=datetime.utcnow)

class FinancialEvent(Base):
    __tablename__ = "financial_events"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    type = Column(String, nullable=False)
    severity = Column(String, default="info")  # info, warning, danger, success
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    status = Column(String, default="unread")
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    timestamp = Column(String, default=datetime.utcnow().isoformat)
    user = Column(String, nullable=False)
    action = Column(String, nullable=False)
    module = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    entity_id = Column(String, nullable=True)

class AIRule(Base):
    __tablename__ = "ai_rules"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    supplier_name = Column(String, nullable=False)
    category_name = Column(String, nullable=False)
    category_id = Column(String, nullable=False)
    confidence = Column(Integer, default=95)
    uses_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
