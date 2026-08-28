from app.db.session import engine, SessionLocal
from app.db.base import Base
from app.models.models import (
    Company, User, UserMembership, Transaction, AIDocument,
    Category, Supplier, Customer, AIApprovalItem, FinancialEvent, AuditLog, AIRule
)
from app.core.security import get_password_hash

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        if not db.query(Company).filter(Company.id == "COMP001").first():
            comp = Company(id="COMP001", name="TechStart Lda", nif="PT516789012", currency="EUR")
            db.add(comp)
        
        if not db.query(User).filter(User.id == "USR001").first():
            user = User(id="USR001", name="João Silva", email="joao@techstart.pt", hashed_password=get_password_hash("password123"))
            db.add(user)
            mem = UserMembership(id="MEM001", user_id="USR001", company_id="COMP001", role="owner")
            db.add(mem)

        # Categories
        if not db.query(Category).filter(Category.id == "CAT001").first():
            c1 = Category(id="CAT001", company_id="COMP001", type="expense", name="Marketing", description="Despesas com publicidade")
            c1_1 = Category(id="CAT001_1", company_id="COMP001", type="expense", name="Google Ads", parent_id="CAT001", keywords="google,ads,adwords")
            c1_2 = Category(id="CAT001_2", company_id="COMP001", type="expense", name="Redes Sociais", parent_id="CAT001", keywords="facebook,instagram,meta")
            c2 = Category(id="CAT002", company_id="COMP001", type="expense", name="Software & Cloud", description="Licenças e servidores")
            c2_1 = Category(id="CAT002_1", company_id="COMP001", type="expense", name="Licenças & SaaS", parent_id="CAT002", keywords="microsoft,slack,figma")
            c5 = Category(id="CAT005", company_id="COMP001", type="income", name="Vendas & Serviços", description="Receitas de clientes")
            c5_1 = Category(id="CAT005_1", company_id="COMP001", type="income", name="Serviços de Consultoria", parent_id="CAT005", keywords="consultoria,servicos")
            db.add_all([c1, c1_1, c1_2, c2, c2_1, c5, c5_1])

        # Suppliers
        if not db.query(Supplier).filter(Supplier.id == "SUP001").first():
            s1 = Supplier(id="SUP001", company_id="COMP001", name="Google Ireland Ltd", nif="IE6388047V", email="billing@google.com", default_category_name="Google Ads", total_spent=12500.0, last_transaction_date="2026-08-28")
            s2 = Supplier(id="SUP002", company_id="COMP001", name="Microsoft Ireland Operations", nif="IE8256796U", email="invoices@microsoft.com", default_category_name="Licenças & SaaS", total_spent=4200.0, last_transaction_date="2026-08-25")
            db.add_all([s1, s2])

        # Customers
        if not db.query(Customer).filter(Customer.id == "CUST001").first():
            cust1 = Customer(id="CUST001", company_id="COMP001", name="Cliente ABC Lda", nif="PT508123456", email="financeiro@clienteabc.pt", default_category_name="Serviços de Consultoria", total_revenue=45000.0)
            db.add(cust1)

        # Transactions
        if not db.query(Transaction).filter(Transaction.id == "TRX001").first():
            trx1 = Transaction(
                id="TRX001",
                company_id="COMP001",
                date="2026-08-28",
                due_date="2026-08-28",
                type="expense",
                description="Campanha Google Ads Agosto 2026",
                entity_name="Google Ireland Ltd",
                category_id="CAT001_1",
                category_name="Marketing > Google Ads",
                amount=500.0,
                status="paid",
                source="ai",
                ai_confidence=96
            )
            trx2 = Transaction(
                id="TRX002",
                company_id="COMP001",
                date="2026-08-30",
                due_date="2026-08-30",
                type="income",
                description="Projeto Consultoria Cliente ABC",
                entity_name="Cliente ABC Lda",
                category_id="CAT005_1",
                category_name="Vendas > Serviços de Consultoria",
                amount=5000.0,
                status="approved",
                source="manual"
            )
            db.add_all([trx1, trx2])

        # Approvals
        if not db.query(AIApprovalItem).filter(AIApprovalItem.id == "APP001").first():
            app1 = AIApprovalItem(id="APP001", company_id="COMP001", document_id="DOC004", document_name="meta_ads_invoice.pdf", supplier_name="Meta Ireland Ltd", amount=350.0, vat=80.5, date="2026-08-20", suggested_category="Marketing > Redes Sociais", suggested_category_id="CAT001_2", ai_confidence=91, status="pending")
            db.add(app1)

        # Financial Events
        if not db.query(FinancialEvent).filter(FinancialEvent.id == "EVT001").first():
            e1 = FinancialEvent(id="EVT001", company_id="COMP001", type="price_increase", severity="warning", title="Fornecedor aumentou preço", description="Google Ads subiu de €350/mês para €500/mês (+43%)", status="unread")
            db.add(e1)

        # Audit Logs
        if not db.query(AuditLog).filter(AuditLog.id == "AUD001").first():
            a1 = AuditLog(id="AUD001", company_id="COMP001", timestamp="2026-08-28T10:30:00Z", user="João Silva", action="Aprovação", module="Aprovações", description="Aprovou lançamento TRX001 (€500,00)")
            db.add(a1)

        # AI Rules
        if not db.query(AIRule).filter(AIRule.id == "RULE001").first():
            r1 = AIRule(id="RULE001", company_id="COMP001", supplier_name="Google Ireland Ltd", category_name="Marketing > Google Ads", category_id="CAT001_1", confidence=98, uses_count=45)
            db.add(r1)

        db.commit()
        print("Database seeded with full module data!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
