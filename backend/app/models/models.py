from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Numeric,
    UniqueConstraint,
)
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

    # --- Portuguese tax profile ---
    country = Column(String, default="PT")
    legal_form = Column(String, nullable=True)        # ENI, Unipessoal Lda, Lda, SA …
    # normal = liquida e deduz IVA; isencao_art53 = isento (não liquida nem deduz)
    vat_regime = Column(String, default="normal")
    # Regime normal: mensal (volume ≥ 650k€) ou trimestral (< 650k€)
    vat_periodicity = Column(String, default="quarterly")
    cae = Column(String, nullable=True)               # código de atividade económica

    # Chart of accounts provisioning
    chart_template = Column(String, nullable=True)
    chart_provisioned = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    """A login.

    ``account_type`` separates the two ways an account comes into existence:

    * ``full`` — someone who registered on their own. Owns companies and may
      create as many as they want, each one a separate tenant.
    * ``invited`` — someone who only exists because a company invited them.
      They work inside the companies they were invited to and cannot open
      companies of their own.
    """

    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    account_type = Column(String, default="full", nullable=False)   # full | invited
    active = Column(Boolean, default=True)
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserMembership(Base):
    """A user's seat in one company — the row that grants access to a tenant.

    Everything the API reads or writes is scoped by ``company_id``, so a user
    with three memberships sees three completely separate sets of data.
    """

    __tablename__ = "user_memberships"
    __table_args__ = (UniqueConstraint("user_id", "company_id", name="uq_membership_user_company"),)

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    role = Column(String, default="owner")  # owner, admin, finance_manager, viewer
    invited_by = Column(String, ForeignKey("users.id"), nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow)


class Invitation(Base):
    """An invitation to join a company.

    The token is the secret: whoever holds it can accept the invitation for the
    invited email address. It expires, can be revoked, and is single-use.
    """

    __tablename__ = "invitations"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False, default="viewer")
    token = Column(String, unique=True, index=True, nullable=False)
    # pending | accepted | revoked  (expiry is derived from expires_at)
    status = Column(String, default="pending", nullable=False)
    message = Column(Text, nullable=True)
    invited_by = Column(String, ForeignKey("users.id"), nullable=True)
    accepted_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)

class CategoryGroup(Base):
    """Top level of the classification tree: Group > Category > Subcategory.

    "Receita" and "Despesa" ship with every company as system groups and cannot
    be renamed or deleted. A company may add its own groups (e.g. Investimento),
    but every group must declare the financial nature it behaves as via ``kind``
    — that is what keeps the cash-flow, dashboard and fiscal aggregations
    working, since those reason in terms of income vs expense.
    """

    __tablename__ = "category_groups"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False)          # income | expense
    icon = Column(String, nullable=True)           # emoji shown in the UI
    color = Column(String, nullable=True)          # accent token, e.g. "emerald"
    description = Column(String, nullable=True)
    is_system = Column(Boolean, default=False)     # system groups are protected
    sort_order = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Category(Base):
    __tablename__ = "categories"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    type = Column(String, nullable=False)  # income, expense — mirrors group.kind
    group_id = Column(String, ForeignKey("category_groups.id"), nullable=True)
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("categories.id"), nullable=True)
    description = Column(String, nullable=True)
    keywords = Column(Text, nullable=True)  # comma separated
    active = Column(Boolean, default=True)
    # Provenance: came from a chart template (editable and deletable, just labelled)
    is_system = Column(Boolean, default=False)
    source_key = Column(String, nullable=True, index=True)
    snc_code = Column(String, nullable=True)   # SNC account, e.g. "62"

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

    # --- Financial amounts (stored as Numeric/Decimal, never float) ---
    # `amount` is kept as the gross total for backward compatibility.
    amount = Column(Numeric(14, 2), nullable=False)
    net_amount = Column(Numeric(14, 2), nullable=True)       # valor sem IVA
    vat_rate = Column(Float, nullable=True)                  # 0, 6, 13, 23 ...
    vat_amount = Column(Numeric(14, 2), default=0)           # valor do IVA
    gross_amount = Column(Numeric(14, 2), nullable=True)     # total com IVA
    vat_exemption_reason = Column(String, nullable=True)     # motivo de isenção (SAF-T)
    currency = Column(String, default="EUR")
    exchange_rate = Column(Float, nullable=True)

    # --- Payment settlement (separate from approval) ---
    paid_amount = Column(Numeric(14, 2), default=0)
    outstanding_amount = Column(Numeric(14, 2), nullable=True)
    payment_status = Column(String, default="pending")  # pending, partially_paid, paid, overdue, cancelled

    status = Column(String, default="approved")  # draft, pending_ai, pending_approval, approved, paid, received, cancelled
    source = Column(String, default="manual")  # manual, ai, bank, import
    ai_confidence = Column(Integer, nullable=True)

    # --- Source document ---
    document_id = Column(String, nullable=True)
    document_name = Column(String, nullable=True)
    document_number = Column(String, nullable=True)  # ex: FT 2026/00452
    document_type = Column(String, nullable=True)    # invoice, receipt, credit_note ...
    document_date = Column(String, nullable=True)
    document_url = Column(String, nullable=True)      # link para o ficheiro original

    is_recurring = Column(Boolean, default=False)
    recurrence_period = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    payment_reference = Column(String, nullable=True)
    bank_account_id = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(String, nullable=True)

    # --- Audit / control ---
    created_by = Column(String, nullable=True)
    approved_by = Column(String, nullable=True)
    approved_at = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TransactionLine(Base):
    """One line of a document — what makes mixed VAT possible.

    A supermarket invoice carries 6%, 13% and 23% on the same paper. With a
    single rate on the header, the only way to book it was to split it into
    several transactions. Lines keep the document whole: each one has its own
    base, rate and VAT, and the header totals are the sum of them.

    Lines are optional. A transaction without any keeps behaving exactly as
    before, which is what stops this from being a migration of every existing
    record.
    """

    __tablename__ = "transaction_lines"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False, index=True)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False, index=True)
    line_number = Column(Integer, nullable=False, default=1)

    description = Column(String, nullable=False)
    quantity = Column(Numeric(14, 3), default=1)
    unit_price = Column(Numeric(14, 4), nullable=True)     # 4 decimals: unit prices are not cents

    net_amount = Column(Numeric(14, 2), nullable=False)    # base tributável da linha
    vat_rate = Column(Float, nullable=True)                # 0, 6, 13, 23 … or None when exempt
    vat_amount = Column(Numeric(14, 2), default=0)
    gross_amount = Column(Numeric(14, 2), nullable=False)
    # CIVA requires the reason to be stated whenever VAT is not charged.
    vat_exemption_reason = Column(String, nullable=True)

    # A line may be classified on its own — a single invoice can hold both
    # electricity and cleaning supplies.
    category_id = Column(String, nullable=True)
    category_name = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class BankAccount(Base):
    """A company bank account. Payments move money in or out of one of these."""

    __tablename__ = "bank_accounts"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    bank_name = Column(String, nullable=True)
    iban = Column(String, nullable=True)
    currency = Column(String, default="EUR")
    opening_balance = Column(Numeric(14, 2), default=0)
    is_default = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Installment(Base):
    """One scheduled due date of a transaction (parcela).

    A transaction paid in one go has no installments; splitting it into N
    creates N rows whose amounts always add back up to the gross total.
    """

    __tablename__ = "installments"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False, index=True)
    number = Column(Integer, nullable=False)          # 1, 2, 3 …
    total_count = Column(Integer, nullable=False)     # of how many
    due_date = Column(String, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    paid_amount = Column(Numeric(14, 2), default=0)
    status = Column(String, default="pending")        # pending, partially_paid, paid, overdue, cancelled
    created_at = Column(DateTime, default=datetime.utcnow)


class Payment(Base):
    """An actual movement of money settling a transaction (or one installment).

    This is the only place a settlement is recorded. The transaction's
    paid/outstanding/payment_status are derived from these rows, never written
    directly, so the history of partial payments is preserved.
    """

    __tablename__ = "payments"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    transaction_id = Column(String, ForeignKey("transactions.id"), nullable=False, index=True)
    installment_id = Column(String, ForeignKey("installments.id"), nullable=True)
    bank_account_id = Column(String, ForeignKey("bank_accounts.id"), nullable=True)

    direction = Column(String, nullable=False)        # out = pagamento, in = recebimento
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(String, nullable=False)
    payment_method = Column(String, nullable=True)    # bank_transfer, card, cash, direct_debit …
    reference = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    reconciliation_status = Column(String, default="unmatched")  # unmatched, matched, manually_matched
    # The bank line that proves this payment happened. It is the single link
    # between the settlement layer and the statement: the entry's reconciled
    # state is read from here, never written on both sides.
    bank_entry_id = Column(String, ForeignKey("bank_statement_entries.id"), nullable=True, index=True)
    # manual = someone registered it; bank = it was created from a bank line,
    # which is what lets an unmatch undo it cleanly.
    source = Column(String, default="manual")
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AIDocument(Base):
    __tablename__ = "ai_documents"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_size = Column(String, default="1.0 MB")
    file_type = Column(String, default="application/pdf")
    channel = Column(String, default="upload")  # email, whatsapp, upload, drive
    # uploaded, processing, extracted, needs_review, approved, rejected, error
    status = Column(String, default="uploaded")
    upload_date = Column(String, default=lambda: datetime.utcnow().isoformat())

    # Stored original + duplicate detection
    file_url = Column(String, nullable=True)
    file_hash = Column(String, index=True, nullable=True)  # SHA-256, unique per company

    # Document identity
    document_number = Column(String, nullable=True)   # ex: FT 2026/00452
    document_type = Column(String, nullable=True)     # invoice, receipt, credit_note ...
    document_date = Column(String, nullable=True)

    # Convenience copy of the latest extraction (the full record lives in AIExtraction)
    extracted_supplier = Column(String, nullable=True)
    extracted_nif = Column(String, nullable=True)
    extracted_amount = Column(Numeric(14, 2), nullable=True)   # gross
    extracted_net = Column(Numeric(14, 2), nullable=True)
    extracted_vat = Column(Numeric(14, 2), nullable=True)
    extracted_vat_rate = Column(Float, nullable=True)
    extracted_date = Column(String, nullable=True)
    extracted_due_date = Column(String, nullable=True)
    suggested_category = Column(String, nullable=True)
    suggested_category_id = Column(String, nullable=True)
    ai_confidence = Column(Integer, default=95)
    is_recurring = Column(Boolean, default=False)
    uploaded_by = Column(String, nullable=True)


class AIExtraction(Base):
    """One pass of the OCR/vision engine over a document.

    Kept separate from both the document and the approval so we always know
    what the AI *read*, distinct from what a human later approved.
    """

    __tablename__ = "ai_extractions"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    document_id = Column(String, ForeignKey("ai_documents.id"), nullable=False)

    supplier = Column(String, nullable=True)
    nif = Column(String, nullable=True)
    document_number = Column(String, nullable=True)
    document_date = Column(String, nullable=True)
    due_date = Column(String, nullable=True)

    net_amount = Column(Numeric(14, 2), nullable=True)
    vat_rate = Column(Float, nullable=True)
    vat_amount = Column(Numeric(14, 2), nullable=True)
    gross_amount = Column(Numeric(14, 2), nullable=True)
    currency = Column(String, default="EUR")

    suggested_category = Column(String, nullable=True)
    suggested_category_id = Column(String, nullable=True)

    confidence = Column(Float, default=0.0)              # 0.000 - 1.000
    validation_status = Column(String, default="needs_review")  # valid, needs_review, failed
    validation_report = Column(Text, nullable=True)      # JSON list of checks

    ai_model = Column(String, nullable=True)
    ai_version = Column(String, nullable=True)
    raw_result = Column(Text, nullable=True)
    processed_at = Column(DateTime, default=datetime.utcnow)

class AIApprovalItem(Base):
    __tablename__ = "ai_approvals"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    document_id = Column(String, nullable=False)
    document_name = Column(String, nullable=False)
    extraction_id = Column(String, nullable=True)   # proposal this item came from
    supplier_name = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    amount = Column(Numeric(14, 2), nullable=False)   # gross
    net_amount = Column(Numeric(14, 2), nullable=True)
    vat_rate = Column(Float, nullable=True)
    vat = Column(Numeric(14, 2), default=0)
    date = Column(String, nullable=False)
    due_date = Column(String, nullable=True)
    document_number = Column(String, nullable=True)
    document_type = Column(String, nullable=True)
    suggested_category = Column(String, nullable=False)
    suggested_category_id = Column(String, nullable=False)
    suggested_cost_center = Column(String, nullable=True)
    ai_confidence = Column(Integer, default=90)
    status = Column(String, default="pending")  # pending, approved, rejected, edited
    transaction_id = Column(String, nullable=True)  # filled on approval
    decided_by = Column(String, nullable=True)
    decided_at = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)
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

class BankStatement(Base):
    __tablename__ = "bank_statements"

    id = Column(String, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    bank_name = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow)
    period_start = Column(String, nullable=True)
    period_end = Column(String, nullable=True)
    total_entries = Column(Integer, default=0)
    matched_entries = Column(Integer, default=0)
    status = Column(String, default="processing")  # processing, completed, error

class BankStatementEntry(Base):
    """One line of a bank statement — money that actually moved.

    Amounts are Numeric like everywhere else money is handled: a statement is
    the thing every other number gets checked against, so it cannot be the one
    place carrying floating-point drift.
    """

    __tablename__ = "bank_statement_entries"

    id = Column(String, primary_key=True, index=True)
    statement_id = Column(String, ForeignKey("bank_statements.id"), nullable=False)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    date = Column(String, nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    type = Column(String, nullable=False)  # credit, debit
    balance = Column(Numeric(14, 2), nullable=True)
    matched_transaction_id = Column(String, nullable=True)
    match_confidence = Column(Integer, nullable=True)
    status = Column(String, default="unmatched")  # matched, suggested, unmatched, ignored
    reconciled_at = Column(DateTime, nullable=True)
