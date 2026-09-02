import os
import json
from datetime import datetime
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, SessionLocal
from app.db.base import Base
from app.models.models import (
    Company, User, UserMembership, Transaction, Category, Entity, 
    CostCenter, AIApprovalItem, FinancialEvent, AIRule, AuditLog
)
from app.core.security import get_password_hash

FRONTEND_MOCKS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'frontend', 'src', 'mock-db')

def load_json(filename):
    filepath = os.path.join(FRONTEND_MOCKS_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def migrate_database():
    print("Iniciando migracao dos Mocks JSON para a base de dados SQLite...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Companies
        companies = load_json('companies.json')
        for c in companies:
            if not db.query(Company).filter(Company.id == c['id']).first():
                db.add(Company(
                    id=c['id'], name=c['name'], nif=c.get('nif'), 
                    currency=c.get('currency', 'EUR'), legal_form=c.get('legal_form'),
                    vat_regime=c.get('vat_regime'), vat_periodicity=c.get('vat_periodicity'),
                    cae=c.get('cae')
                ))
        db.commit()

        # Users
        users = load_json('users.json')
        for u in users:
            if not db.query(User).filter(User.id == u['id']).first():
                db.add(User(
                    id=u['id'], name=u['name'], email=u['email'], 
                    hashed_password=get_password_hash("password123")
                ))
                if 'memberships' in u:
                    for mem in u['memberships']:
                        db.add(UserMembership(
                            id=f"MEM_{u['id']}_{mem['company_id']}", 
                            user_id=u['id'], 
                            company_id=mem['company_id'], 
                            role=mem['role']
                        ))
        db.commit()

        # Categories
        categories = load_json('categories.json')
        for c in categories:
            if not db.query(Category).filter(Category.id == c['id']).first():
                db.add(Category(
                    id=c['id'], company_id=c['company_id'], type=c['type'], 
                    name=c['name'], description=c.get('description'), 
                    parent_id=c.get('parent_id'), keywords=c.get('keywords', '')
                ))
        db.commit()

        # Entities (Merge Suppliers and Customers into Entity)
        suppliers = load_json('suppliers.json')
        customers = load_json('customers.json')
        
        entities_dict = {}
        for s in suppliers:
            entities_dict[s['id']] = {
                'id': s['id'],
                'company_id': s['company_id'],
                'name': s['name'],
                'nif': s.get('nif'),
                'email': s.get('email'),
                'phone': s.get('phone'),
                'address': s.get('address'),
                'is_supplier': True,
                'is_customer': False,
                'default_category_id': s.get('default_category_id'),
                'default_category_name': s.get('default_category_name')
            }
        
        for c in customers:
            if c['id'] in entities_dict:
                entities_dict[c['id']]['is_customer'] = True
            else:
                entities_dict[c['id']] = {
                    'id': c['id'],
                    'company_id': c['company_id'],
                    'name': c['name'],
                    'nif': c.get('nif'),
                    'email': c.get('email'),
                    'phone': c.get('phone'),
                    'address': c.get('address'),
                    'is_supplier': False,
                    'is_customer': True,
                    'default_category_id': c.get('default_category_id'),
                    'default_category_name': c.get('default_category_name')
                }
        
        for e_id, e_data in entities_dict.items():
            if not db.query(Entity).filter(Entity.id == e_id).first():
                db.add(Entity(**e_data))
        db.commit()

        # Cost Centers
        cost_centers = load_json('cost-centers.json')
        for cc in cost_centers:
            if not db.query(CostCenter).filter(CostCenter.id == cc['id']).first():
                db.add(CostCenter(
                    id=cc['id'], company_id=cc['company_id'], code=cc.get('code', cc['id']), 
                    name=cc['name'], description=cc.get('description'), 
                    budget=cc.get('budget'), contract_value=cc.get('contract_value'),
                    status=cc.get('status', 'open'), active=cc.get('active', True)
                ))
        db.commit()

        # Transactions
        transactions = load_json('transactions.json')
        for t in transactions:
            if not db.query(Transaction).filter(Transaction.id == t['id']).first():
                # Convert amounts
                amount = float(t.get('amount', 0))
                db.add(Transaction(
                    id=t['id'], company_id=t['company_id'], date=t['date'], 
                    due_date=t.get('due_date'), payment_date=t.get('payment_date'), 
                    type=t['type'], description=t['description'], 
                    entity_name=t['entity_name'], entity_id=t.get('entity_id'), 
                    category_id=t['category_id'], category_name=t['category_name'], 
                    cost_center_id=t.get('cost_center_id'), cost_center_name=t.get('cost_center_name'), 
                    amount=amount, net_amount=t.get('net_amount', amount), 
                    vat_rate=t.get('vat_rate', 0), vat_amount=t.get('vat_amount', 0), 
                    gross_amount=t.get('gross_amount', amount), currency=t.get('currency', 'EUR'), 
                    paid_amount=t.get('paid_amount', 0), outstanding_amount=t.get('outstanding_amount', amount), 
                    payment_status=t.get('payment_status', 'pending'), status=t.get('status', 'approved'), 
                    source=t.get('source', 'manual'), document_number=t.get('document_number'), 
                    document_type=t.get('document_type'), document_date=t.get('document_date')
                ))
        db.commit()
        
        # Approvals
        approvals = load_json('approvals.json')
        for a in approvals:
            if not db.query(AIApprovalItem).filter(AIApprovalItem.id == a['id']).first():
                db.add(AIApprovalItem(
                    id=a['id'], company_id=a['company_id'], document_id=a.get('document_id'),
                    document_name=a.get('document_name'), supplier_name=a.get('supplier_name'),
                    amount=a.get('amount'), vat=a.get('vat'), date=a.get('date'),
                    suggested_category=a.get('suggested_category'), suggested_category_id=a.get('suggested_category_id'),
                    ai_confidence=a.get('ai_confidence'), status=a.get('status', 'pending')
                ))
        db.commit()

        # Financial Events
        events = load_json('financial-events.json')
        for e in events:
            if not db.query(FinancialEvent).filter(FinancialEvent.id == e['id']).first():
                db.add(FinancialEvent(
                    id=e['id'], company_id=e['company_id'], type=e['type'], 
                    severity=e.get('severity'), title=e['title'], 
                    description=e.get('description'), status=e.get('status', 'unread')
                ))
        db.commit()

        # AI Rules
        rules = load_json('ai-rules.json')
        for r in rules:
            if not db.query(AIRule).filter(AIRule.id == r['id']).first():
                db.add(AIRule(
                    id=r['id'], company_id=r['company_id'], supplier_name=r.get('supplier_name'),
                    category_name=r.get('category_name'), category_id=r.get('category_id'),
                    confidence=r.get('confidence'), uses_count=r.get('uses_count', 0)
                ))
        db.commit()

        # Audit Logs
        logs = load_json('audit-log.json')
        for l in logs:
            if not db.query(AuditLog).filter(AuditLog.id == l['id']).first():
                db.add(AuditLog(
                    id=l['id'], company_id=l['company_id'], timestamp=l['timestamp'],
                    user=l.get('user'), action=l['action'], module=l.get('module'),
                    description=l.get('description')
                ))
        db.commit()

        print("Migracao concluida com sucesso!")
        
    except Exception as e:
        print(f"Erro durante a migracao: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    migrate_database()
