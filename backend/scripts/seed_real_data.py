import os
import sys
import uuid
import random
from datetime import date, timedelta
from decimal import Decimal

# Add the backend dir to sys.path so we can import app modules
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

from app.db.session import SessionLocal
from app.models.models import Transaction, TransactionLine, Category, Entity, Company, Customer, Supplier, Item

def generate_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}"

def seed_data():
    db = SessionLocal()
    company_id = "COMP001"
    
    # 1. Check if company exists
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        print(f"Company {company_id} not found.")
        return
        
    print("Mapping Categories to SNC Codes...")
    # 2. Map existing categories to SNC codes
    cat_mappings = {
        "Marketing": "62",
        "Software & Cloud": "62",
        "Pessoal & Salários": "63",
        "Instalações & Serviços": "62",
        "Vendas & Serviços": "72",
    }
    
    categories = db.query(Category).filter(Category.company_id == company_id).all()
    cat_id_by_name = {}
    for cat in categories:
        name = cat.name
        if cat.parent_id:
            parent = next((c for c in categories if c.id == cat.parent_id), None)
            if parent:
                name = f"{parent.name} > {cat.name}"
        
        if name in cat_mappings:
            cat.snc_code = cat_mappings[name]
        
        cat_id_by_name[name] = cat.id
        # also add just the short name
        cat_id_by_name[cat.name] = cat.id
        
    db.commit()
    
    print("Ensuring Entities exist...")
    # Ensure entities
    client_id = generate_id("CUST")
    supplier_id = generate_id("SUPP")
    
    client = db.query(Entity).filter(Entity.company_id == company_id, Entity.name == "Cliente Principal").first()
    if not client:
        client = Entity(id=client_id, company_id=company_id, name="Cliente Principal", is_customer=True, nif="999999990", default_retention_code="1016") # 25%
        db.add(client)
    else:
        client.default_retention_code = "1016"
        
    supplier = db.query(Entity).filter(Entity.company_id == company_id, Entity.name == "Fornecedor de Software").first()
    if not supplier:
        supplier = Entity(id=supplier_id, company_id=company_id, name="Fornecedor de Software", is_supplier=True, nif="500000000")
        db.add(supplier)
        
    db.commit()

    print("Ensuring Items exist...")
    items_data = [
        {"id": generate_id("ITM"), "code": "SRV001", "description": "Consultoria Informática", "kind": "service", "price_1": 100.0, "vat_rate": "Normal"},
        {"id": generate_id("ITM"), "code": "SRV002", "description": "Avença de Manutenção", "kind": "service", "price_1": 500.0, "vat_rate": "Normal"},
        {"id": generate_id("ITM"), "code": "SaaS001", "description": "Licença Software Cloud", "kind": "service", "price_1": 50.0, "vat_rate": "Normal"},
        {"id": generate_id("ITM"), "code": "MKT001", "description": "Serviços de Publicidade", "kind": "service", "price_1": 200.0, "vat_rate": "Normal"},
        {"id": generate_id("ITM"), "code": "RENT001", "description": "Renda Escritório", "kind": "service", "price_1": 1200.0, "vat_rate": "Isenta"},
    ]
    
    db_items = {}
    for data in items_data:
        item = db.query(Item).filter(Item.company_id == company_id, Item.code == data["code"]).first()
        if not item:
            item = Item(
                id=data["id"],
                company_id=company_id,
                kind=data["kind"],
                code=data["code"],
                description=data["description"],
                price_1=data["price_1"],
                vat_rate=data["vat_rate"],
            )
            db.add(item)
        db_items[data["code"]] = item
    
    db.commit()
    
    # 3. Generate Transactions
    print("Generating Transactions...")
    
    start_date = date(2026, 1, 1)
    end_date = date(2026, 9, 30)
    
    def add_transaction(date_obj, type_, amount, vat_rate, category_name, entity_name, item_code=None, is_paid=True, retention_code=None, retention_rate=None):
        cat_id = cat_id_by_name.get(category_name)
        if not cat_id:
            # Fallback
            cat_id = list(cat_id_by_name.values())[0] if cat_id_by_name else None
            
        amount_d = Decimal(str(amount))
        vat_d = (amount_d * Decimal(str(vat_rate / 100))).quantize(Decimal("0.01")) if vat_rate else Decimal("0.00")
        gross = amount_d + vat_d
        
        # Calculate retention
        retention_amount = Decimal("0.00")
        if retention_rate:
            retention_amount = (amount_d * Decimal(str(retention_rate / 100))).quantize(Decimal("0.01"))
            
        outstanding = gross - retention_amount
        paid = outstanding if is_paid else Decimal("0.00")
        
        trx_id = generate_id("TRX")

        t = Transaction(
            id=trx_id,
            company_id=company_id,
            date=date_obj.isoformat(),
            due_date=(date_obj + timedelta(days=30)).isoformat(),
            type=type_,
            description=f"Movimento de {category_name}",
            entity_name=entity_name,
            entity_id=client.id if type_ == "income" else supplier.id,
            category_id=cat_id,
            category_name=category_name,
            amount=gross,
            net_amount=amount_d,
            vat_rate=vat_rate,
            vat_amount=vat_d,
            gross_amount=gross,
            retention_code=retention_code,
            retention_rate=retention_rate,
            retention_amount=retention_amount,
            currency="EUR",
            paid_amount=paid,
            outstanding_amount=outstanding - paid,
            payment_status="paid" if is_paid else "pending",
            status="approved",
            source="manual",
            document_number=f"DOC-{date_obj.strftime('%Y%m')}-{random.randint(100,999)}",
        )
        db.add(t)

        # Create Transaction Line if item_code is provided
        if item_code and item_code in db_items:
            item = db_items[item_code]
            line = TransactionLine(
                id=generate_id("TXL"),
                company_id=company_id,
                transaction_id=trx_id,
                line_number=1,
                item_id=item.id,
                item_code=item.code,
                description=item.description,
                quantity=Decimal("1.000"),
                unit_price=amount_d,
                net_amount=amount_d,
                vat_rate=vat_rate,
                vat_amount=vat_d,
                gross_amount=gross,
                category_id=cat_id,
                category_name=category_name,
            )
            db.add(line)

    # Clean existing mock transactions except maybe very recent ones? 
    # Let's just clear 2026 transactions to replace them with clean seeded ones
    old_txs = db.query(Transaction).filter(
        Transaction.company_id == company_id,
        Transaction.date >= "2026-01-01"
    ).all()
    old_tx_ids = [tx.id for tx in old_txs]
    if old_tx_ids:
        db.query(TransactionLine).filter(TransactionLine.transaction_id.in_(old_tx_ids)).delete(synchronize_session=False)
        db.query(Transaction).filter(Transaction.id.in_(old_tx_ids)).delete(synchronize_session=False)
    
    # Generate monthly data
    for month in range(1, 10):
        # 1-2 Income invoices
        add_transaction(date(2026, month, 5), "income", random.randint(8000, 15000), 23.0, "Vendas & Serviços", "Cliente Principal", item_code="SRV001")
        add_transaction(date(2026, month, 15), "income", random.randint(3000, 5000), 0.0, "Vendas & Serviços", "Cliente Secundário", item_code="SRV002", retention_code="1016", retention_rate=25.0)
        
        # Monthly Expenses
        add_transaction(date(2026, month, 25), "expense", random.randint(5000, 6000), 0.0, "Pessoal & Salários", "Colaboradores")
        add_transaction(date(2026, month, 10), "expense", random.randint(300, 800), 23.0, "Software & Cloud", "Fornecedor de Software", item_code="SaaS001")
        add_transaction(date(2026, month, 12), "expense", random.randint(500, 1000), 23.0, "Marketing", "Google Ireland", item_code="MKT001")
        add_transaction(date(2026, month, 1), "expense", 1200, 0.0, "Instalações & Serviços", "Senhorio Lda", item_code="RENT001")
        
    db.commit()
    db.close()
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_data()
