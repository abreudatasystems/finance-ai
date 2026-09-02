import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.models.models import Transaction

db = SessionLocal()
incomes = db.query(Transaction).filter(Transaction.type == 'income', Transaction.outstanding_amount > 0).all()
print(f"Pending incomes: {len(incomes)}")
for i in incomes:
    print(f"- {i.id}: {i.outstanding_amount} (payment_status: {i.payment_status}, due_date: {i.due_date})")

expenses = db.query(Transaction).filter(Transaction.type == 'expense', Transaction.outstanding_amount > 0).all()
print(f"Pending expenses: {len(expenses)}")
db.close()
